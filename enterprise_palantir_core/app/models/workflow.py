from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, BigInteger, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin, TimestampMixin


class WorkflowDefinition(Base, TenantMixin, TimestampMixin):
    """
    A named, versioned workflow: states + transitions + terminal set.
    """
    __tablename__ = "workflow_definitions"

    workflow_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    states: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, default=list)
    transitions: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, default=list)
    entry_state: Mapped[str] = mapped_column(String(100), nullable=False)
    terminal_states: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    sla_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    owner: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)


class WorkflowInstance(Base, TenantMixin, TimestampMixin):
    """
    A live, running instance of a workflow bound to a canonical entity.
    """
    __tablename__ = "workflow_instances"
    __table_args__ = (
        Index("idx_wfi_entity", "canonical_entity_id"),
        Index("idx_wfi_status", "status"),
        Index("idx_wfi_tenant_wf", "tenant_id", "workflow_id"),
    )

    instance_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(String(100), nullable=False)
    canonical_entity_id: Mapped[Optional[str]] = mapped_column(String(100))
    current_state: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="running", nullable=False)
    context: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)
    owner: Mapped[Optional[str]] = mapped_column(String(100))
    last_transition_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class WorkflowTransitionLog(Base, TenantMixin):
    """
    Every transition of every workflow instance — full audit trail.
    """
    __tablename__ = "workflow_transitions_log"

    log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instance_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    from_state: Mapped[Optional[str]] = mapped_column(String(100))
    to_state: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_event_id: Mapped[Optional[str]] = mapped_column(String(100))
    actor: Mapped[Optional[str]] = mapped_column(String(100))
    reason: Mapped[Optional[str]] = mapped_column(String(500))
    sla_breach: Mapped[bool] = mapped_column(default=False, nullable=False)
    metadata_: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
