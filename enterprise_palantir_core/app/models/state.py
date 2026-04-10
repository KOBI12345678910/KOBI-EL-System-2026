from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, DateTime, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin, TimestampMixin


class EntityStateRow(Base, TenantMixin, TimestampMixin):
    """
    Live operational state of every canonical entity.

    This is NOT history — this is the single row that represents "what is
    this entity's current state RIGHT NOW". It is updated by the State Engine
    in response to every domain event.
    """
    __tablename__ = "entity_states"
    __table_args__ = (
        Index("idx_state_tenant_type", "tenant_id", "entity_type"),
        Index("idx_state_risk", "risk_score"),
        Index("idx_state_status", "current_status"),
    )

    canonical_entity_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    current_status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    freshness_status: Mapped[str] = mapped_column(String(20), default="fresh", nullable=False)

    blockers: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    dependencies: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    alerts: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)

    workflow_step: Mapped[Optional[str]] = mapped_column(String(100))
    owner: Mapped[Optional[str]] = mapped_column(String(100))
    sla_status: Mapped[Optional[str]] = mapped_column(String(30))
    financial_exposure: Mapped[Optional[float]] = mapped_column(Float)

    properties: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)

    last_event_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
