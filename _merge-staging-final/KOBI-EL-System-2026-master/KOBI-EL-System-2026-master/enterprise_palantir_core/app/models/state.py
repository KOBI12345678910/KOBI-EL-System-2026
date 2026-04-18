from sqlalchemy import Column, Float, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class EntityStateModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "entity_states"

    canonical_entity_id = Column(String, primary_key=True, index=True)
    entity_type = Column(String, index=True, nullable=False)

    current_status = Column(String, index=True, nullable=False, default="active")
    workflow_step = Column(String, nullable=True)
    owner = Column(String, nullable=True)

    risk_score = Column(Float, nullable=False, default=0.0)
    freshness_status = Column(String, nullable=False, default="unknown")

    blockers_json = Column(Text, nullable=False, default="[]")
    alerts_json = Column(Text, nullable=False, default="[]")
    state_json = Column(Text, nullable=False, default="{}")
