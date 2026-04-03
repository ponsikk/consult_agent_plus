import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Date, Text, Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class DefectType(Base):
    __tablename__ = "defect_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False)
    system = Column(String, nullable=False)
    system_name = Column(String, nullable=False)
    name = Column(String, nullable=False)
    default_criticality = Column(String, nullable=False)
    norm_references = Column(JSON, nullable=True)

    defects = relationship("Defect", back_populates="defect_type")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    object_name = Column(String, nullable=False)
    shot_date = Column(Date, nullable=False)
    status = Column(String, default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="analyses")
    photos = relationship("AnalysisPhoto", back_populates="analysis", order_by="AnalysisPhoto.order_index")


class AnalysisPhoto(Base):
    __tablename__ = "analysis_photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(UUID(as_uuid=True), ForeignKey("analyses.id"), nullable=False)
    original_key = Column(String, nullable=False)
    annotated_key = Column(String, nullable=True)
    order_index = Column(Integer, nullable=False)

    analysis = relationship("Analysis", back_populates="photos")
    defects = relationship("Defect", back_populates="photo")


class Defect(Base):
    __tablename__ = "defects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    photo_id = Column(UUID(as_uuid=True), ForeignKey("analysis_photos.id"), nullable=False)
    defect_type_id = Column(UUID(as_uuid=True), ForeignKey("defect_types.id"), nullable=True)
    criticality = Column(String, nullable=False)
    bbox_x = Column(Float, nullable=False)
    bbox_y = Column(Float, nullable=False)
    bbox_w = Column(Float, nullable=False)
    bbox_h = Column(Float, nullable=False)
    description = Column(Text, nullable=False)
    consequences = Column(Text, nullable=False)
    norm_references = Column(JSON, nullable=True)
    recommendations = Column(Text, nullable=False)

    photo = relationship("AnalysisPhoto", back_populates="defects")
    defect_type = relationship("DefectType", back_populates="defects")
