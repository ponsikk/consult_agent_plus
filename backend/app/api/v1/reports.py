from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.analysis import Analysis, DefectType
from app.models.user import User
from app.schemas.analysis import DefectTypeOut
from app.services.storage_service import storage_service

router = APIRouter(tags=["reports"])


@router.get("/analyses/{analysis_id}/report/pdf")
async def download_pdf_report(
    analysis_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Analysis).where(
            Analysis.id == analysis_id,
            Analysis.user_id == current_user.id,
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != "done":
        raise HTTPException(status_code=400, detail="Report not ready")

    try:
        pdf_bytes = await storage_service.download_file(f"reports/{analysis_id}/report.pdf")
    except Exception:
        raise HTTPException(status_code=404, detail="PDF report file not found")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report_{analysis_id}.pdf"'},
    )


@router.get("/analyses/{analysis_id}/report/excel")
async def download_excel_report(
    analysis_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Analysis).where(
            Analysis.id == analysis_id,
            Analysis.user_id == current_user.id,
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != "done":
        raise HTTPException(status_code=400, detail="Report not ready")

    try:
        excel_bytes = await storage_service.download_file(f"reports/{analysis_id}/report.xlsx")
    except Exception:
        raise HTTPException(status_code=404, detail="Excel report file not found")

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="report_{analysis_id}.xlsx"'
        },
    )


@router.get("/defects/catalog", response_model=List[DefectTypeOut])
async def get_defect_catalog(
    system: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(DefectType)
    if system:
        query = query.where(DefectType.system == system)
    result = await db.execute(query.order_by(DefectType.system, DefectType.code))
    return result.scalars().all()
