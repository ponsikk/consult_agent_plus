import uuid
from datetime import date
from typing import List, Optional

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_arq_pool, get_current_user
from app.models.analysis import Analysis, AnalysisPhoto, Defect
from app.models.user import User
from app.schemas.analysis import (
    AnalysisListItem,
    AnalysisOut,
    AnalysisStatus,
    PaginatedAnalyses,
)
from app.services.storage_service import storage_service

router = APIRouter(prefix="/analyses", tags=["analyses"])

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/tiff",
    "image/webp",
}

MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/tiff": "tiff",
    "image/webp": "webp",
}


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    object_name: str = Form(...),
    shot_date: str = Form(...),
    photos: List[UploadFile] = [],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    arq_pool: ArqRedis = Depends(get_arq_pool),
) -> Analysis:
    if not photos or len(photos) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one photo is required.",
        )
    if len(photos) > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Maximum 10 photos are allowed.",
        )

    for photo in photos:
        content_type: str = photo.content_type or ""
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
            )

    try:
        parsed_date = date.fromisoformat(shot_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid shot_date format. Expected YYYY-MM-DD.",
        )

    # --- Шаг 1: Создаём записи в БД со статусом "uploading" ---
    # Это гарантирует, что у каждого файла в MinIO есть запись в БД.
    # "Сиротских" файлов в S3 не будет: сначала БД, потом MinIO.
    analysis_id = uuid.uuid4()

    # Предварительно генерируем ключи MinIO (детерминированно)
    photo_plan: List[tuple[uuid.UUID, UploadFile, str, int]] = []
    for idx, upload_file in enumerate(photos):
        photo_id = uuid.uuid4()
        ext = MIME_TO_EXT.get(upload_file.content_type or "", "jpg")
        key = f"photos/{analysis_id}/{photo_id}_original.{ext}"
        photo_plan.append((photo_id, upload_file, key, idx))

    analysis = Analysis(
        id=analysis_id,
        user_id=current_user.id,
        object_name=object_name,
        shot_date=parsed_date,
        status="uploading",
    )
    db.add(analysis)

    for photo_id, _, key, idx in photo_plan:
        db.add(AnalysisPhoto(
            id=photo_id,
            analysis_id=analysis_id,
            original_key=key,
            annotated_key=None,
            order_index=idx,
        ))

    # Сохраняем записи — теперь у нас есть "якорь" в БД
    await db.commit()

    # --- Шаг 2: Загружаем файлы в MinIO ---
    # Если загрузка упадёт — Analysis останется в статусе "uploading"/"error",
    # никаких сиротских файлов в S3.
    try:
        for _, upload_file, key, _ in photo_plan:
            data = await upload_file.read()
            await storage_service.upload_file(key, data, upload_file.content_type or "image/jpeg")
    except Exception as upload_err:
        # Помечаем анализ как ошибочный, не удаляя записи из БД
        result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
        failed_analysis = result.scalar_one_or_none()
        if failed_analysis:
            failed_analysis.status = "error"
            failed_analysis.error_message = f"Upload failed: {upload_err}"
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload photos to storage: {upload_err}",
        )

    # --- Шаг 3: Все файлы загружены → статус pending + очередь ARQ ---
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one()
    analysis.status = "pending"
    await db.commit()

    await arq_pool.enqueue_job("process_analysis", str(analysis_id))

    result = await db.execute(
        select(Analysis)
        .where(Analysis.id == analysis_id)
        .options(
            selectinload(Analysis.photos).selectinload(AnalysisPhoto.defects)
        )
    )
    analysis_out = result.scalar_one()
    return analysis_out


@router.get("", response_model=PaginatedAnalyses)
async def list_analyses(
    page: int = 1,
    per_page: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedAnalyses:
    defect_count_subq = (
        select(
            AnalysisPhoto.analysis_id,
            func.count(Defect.id).label("defect_count"),
        )
        .join(Defect, Defect.photo_id == AnalysisPhoto.id, isouter=True)
        .group_by(AnalysisPhoto.analysis_id)
        .subquery()
    )

    base_query = select(
        Analysis,
        func.coalesce(defect_count_subq.c.defect_count, 0).label("defect_count"),
    ).outerjoin(
        defect_count_subq, defect_count_subq.c.analysis_id == Analysis.id
    ).where(
        Analysis.user_id == current_user.id
    )

    if status:
        base_query = base_query.where(Analysis.status == status)

    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total: int = count_result.scalar_one()

    offset = (page - 1) * per_page
    rows_result = await db.execute(
        base_query.order_by(Analysis.created_at.desc()).offset(offset).limit(per_page)
    )
    rows = rows_result.all()

    items: List[AnalysisListItem] = []
    for row in rows:
        analysis_obj: Analysis = row[0]
        dc: int = row[1]
        item = AnalysisListItem(
            id=analysis_obj.id,
            object_name=analysis_obj.object_name,
            shot_date=analysis_obj.shot_date,
            status=analysis_obj.status,
            created_at=analysis_obj.created_at,
            defect_count=dc,
        )
        items.append(item)

    return PaginatedAnalyses(items=items, total=total, page=page, per_page=per_page)


@router.get("/{analysis_id}", response_model=AnalysisOut)
async def get_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Analysis:
    result = await db.execute(
        select(Analysis)
        .where(Analysis.id == analysis_id)
        .options(
            selectinload(Analysis.photos).selectinload(AnalysisPhoto.defects)
        )
    )
    analysis = result.scalar_one_or_none()

    if analysis is None or analysis.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    return analysis


@router.get("/{analysis_id}/status", response_model=AnalysisStatus)
async def get_analysis_status(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalysisStatus:
    result = await db.execute(
        select(Analysis).where(Analysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()

    if analysis is None or analysis.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    return AnalysisStatus(
        id=analysis.id,
        status=analysis.status,
        error_message=analysis.error_message,
    )
