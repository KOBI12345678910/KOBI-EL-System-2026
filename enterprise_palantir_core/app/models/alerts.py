from sqlalchemy import Column, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class AlertModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    severity = Column(String, index=True, nullable=False)
    alert_type = Column(String, index=True, nullable=False)
    entity_id = Column(String, index=True, nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="open")
    metadata_json = Column(Text, nullable=False, default="{}")
