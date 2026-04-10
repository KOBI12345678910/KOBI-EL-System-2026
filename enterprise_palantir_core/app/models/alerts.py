from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin, TimestampMixin


class AlertRule(Base, TenantMixin, TimestampMixin):
    """
    An alert rule: when a matching event occurs and the condition passes,
    an alert is raised automatically.
    """
    __tablename__ = "alert_rules"

    rule_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    trigger_event_types: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    target_entity_types: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    condition_expression: Mapped[Optional[str]] = mapped_column(String(500))
    severity: Mapped[str] = mapped_column(String(20), default="warning", nullable=False)
    auto_resolve_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)


class Alert(Base, TenantMixin, TimestampMixin):
    """
    A live alert. Deduplicated by `alert_key` (same key → same row, incremented count).
    """
    __tablename__ = "alerts"
    __table_args__ = (
        Index("idx_alert_tenant_status", "tenant_id", "status"),
        Index("idx_alert_severity", "severity"),
        Index("idx_alert_entity", "entity_id"),
    )

    alert_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    alert_key: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    alert_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(String(2000))
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(100))
    entity_id: Mapped[Optional[str]] = mapped_column(String(100))
    rule_id: Mapped[Optional[str]] = mapped_column(String(100))
    source_event_id: Mapped[Optional[str]] = mapped_column(String(100))
    suggested_actions: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, default=list)
    impacted_entities: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, default=list)
    financial_impact: Mapped[Optional[float]] = mapped_column(Float)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(100))
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
