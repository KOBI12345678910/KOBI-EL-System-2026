from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin


class AuditLogEntry(Base, TenantMixin):
    """
    Immutable hash-chained audit log.

    Every privileged action goes through here. `prev_hash` + `this_hash` form
    a chain that can be verified to detect any post-hoc tampering.
    """
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("idx_audit_tenant_time", "tenant_id", "occurred_at"),
        Index("idx_audit_actor", "actor"),
        Index("idx_audit_resource", "resource_type", "resource_id"),
    )

    audit_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    sequence_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    actor: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(200))
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    session_id: Mapped[Optional[str]] = mapped_column(String(100))
    granted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deny_reason: Mapped[Optional[str]] = mapped_column(String(500))
    prev_hash: Mapped[Optional[str]] = mapped_column(String(64))
    this_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
