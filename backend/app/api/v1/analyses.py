import uuid
from datetime import date
from typing import List, Optional

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
    arq_pool=Depends(get_arq_pool),
):
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
        if photo.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported file type: {photo.content_type}. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
            )

    try:
        parsed_date = date.fromisoformat(shot_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid shot_date format. Expected YYYY-MM-DD.",
        )

    analysis_id = uuid.uuid4()
    analysis = Analysis(
        id=analysis_id,
        user_id=current_user.id,
        object_name=object_name,
        shot_date=parsed_date,
        status="pending",
    )
    db.add(analysis)

    for idx, upload_file in enumerate(photos):
        photo_id = uuid.uuid4()
        ext = MIME_TO_EXT.get(upload_file.content_type, "jpg")
        key = f"photos/{analysis_id}/{photo_id}_original.{ext}"

        data = await upload_file.read()
        await storage_service.upload_file(key, data, upload_file.content_type)

        photo_record = AnalysisPhoto(
            id=photo_id,
            analysis_id=analysis_id,
            original_key=key,
            annotated_key=None,
            order_index=idx,
        )
        db.add(photo_record)

    await db.commit()
    await db.refresh(analysis)

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
):
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
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    rows = await db.execute(
        base_query.order_by(Analysis.created_at.desc()).offset(offset).limit(per_page)
    )
    rows = rows.all()

    items = []
    for row in rows:
        analysis_obj = row[0]
        dc = row[1]
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
):
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
):
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
