# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime
from uuid import uuid4
from sqlalchemy import Column, String, Text, Float, Integer, DateTime
from backend.database import Base


class EditorDraft(Base):
    __tablename__ = 'editor_drafts'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), nullable=False, default='local', index=True)
    generated_video_id = Column(String(36), nullable=False, unique=True)
    source_downloaded_video_id = Column(String(36), nullable=True, index=True)
    title = Column(Text, nullable=False)
    source_path = Column(Text, nullable=False)
    document_json = Column(Text, nullable=False)
    provenance_json = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    duration = Column(Float, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
