from sqlalchemy import Column, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class AuditLogModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, index=True)
    actor_id = Column(String, nullable=False, index=True)
    action_name = Column(String, nullable=False, index=True)
    target_entity_id = Column(String, nullable=True, index=True)
    details_json = Column(Text, nullable=False, default="{}")
