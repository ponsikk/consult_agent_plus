import uuid
from datetime import datetime, date as date_type
from typing import List, Optional

from sqlalchemy import String, DateTime, Date, Text, Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DefectType(Base):
    __tablename__ = "defect_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    system: Mapped[str] = mapped_column(String, nullable=False)
    system_name: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    default_criticality: Mapped[str] = mapped_column(String, nullable=False)
    norm_references: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    defects: Mapped[List["Defect"]] = relationship("Defect", back_populates="defect_type")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    object_name: Mapped[str] = mapped_column(String, nullable=False)
    shot_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="analyses")  # type: ignore[name-defined]
    photos: Mapped[List["AnalysisPhoto"]] = relationship(
        "AnalysisPhoto", back_populates="analysis", order_by="AnalysisPhoto.order_index"
    )


class AnalysisPhoto(Base):
    __tablename__ = "analysis_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("analyses.id"), nullable=False)
    original_key: Mapped[str] = mapped_column(String, nullable=False)
    annotated_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    analysis: Mapped["Analysis"] = relationship("Analysis", back_populates="photos")
    defects: Mapped[List["Defect"]] = relationship("Defect", back_populates="photo")


class Defect(Base):
    __tablename__ = "defects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    photo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("analysis_photos.id"), nullable=False)
    defect_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("defect_types.id"), nullable=True
    )
    criticality: Mapped[str] = mapped_column(String, nullable=False)
    bbox_x: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_y: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_w: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_h: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    consequences: Mapped[str] = mapped_column(Text, nullable=False)
    norm_references: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    recommendations: Mapped[str] = mapped_column(Text, nullable=False)

    photo: Mapped["AnalysisPhoto"] = relationship("AnalysisPhoto", back_populates="defects")
    defect_type: Mapped[Optional["DefectType"]] = relationship("DefectType", back_populates="defects")
