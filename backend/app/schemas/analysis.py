from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class AnalysisCreate(BaseModel):
    object_name: str
    shot_date: date


class AnalysisStatus(BaseModel):
    id: UUID
    status: str
    error_message: Optional[str] = None


class DefectOut(BaseModel):
    id: UUID
    photo_id: UUID
    defect_type_id: Optional[UUID] = None
    criticality: str
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    description: str
    consequences: str
    norm_references: Optional[object] = None
    recommendations: str

    model_config = {"from_attributes": True}


class AnalysisPhotoOut(BaseModel):
    id: UUID
    analysis_id: UUID
    original_key: str
    annotated_key: Optional[str] = None
    order_index: int
    defects: List[DefectOut] = []

    model_config = {"from_attributes": True}


class AnalysisOut(BaseModel):
    id: UUID
    user_id: UUID
    object_name: str
    shot_date: date
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    photos: List[AnalysisPhotoOut] = []

    model_config = {"from_attributes": True}


class AnalysisListItem(BaseModel):
    id: UUID
    object_name: str
    shot_date: date
    status: str
    created_at: datetime
    defect_count: int = 0

    model_config = {"from_attributes": True}


class PaginatedAnalyses(BaseModel):
    items: List[AnalysisListItem]
    total: int
    page: int
    per_page: int


class DefectTypeOut(BaseModel):
    id: UUID
    code: str
    system: str
    system_name: str
    name: str
    default_criticality: str
    norm_references: Optional[list] = []

    model_config = {"from_attributes": True}
