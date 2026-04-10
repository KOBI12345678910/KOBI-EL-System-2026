from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import JSON, BigInteger, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin, TimestampMixin


class DomainEvent(Base, TenantMixin):
    """
    Append-only domain event log. Every meaningful change in the organization
    lands here. Indexed by tenant+time and by entity for fast timeline queries.
    """
    __tablename__ = "domain_events"
    __table_args__ = (
        Index("idx_event_tenant_time", "tenant_id", "timestamp"),
        Index("idx_event_entity_time", "canonical_entity_id", "timestamp"),
        Index("idx_event_type", "event_type"),
        Index("idx_event_correlation", "correlation_id"),
    )

    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source_system: Mapped[Optional[str]] = mapped_column(String(100))
    source_record_id: Mapped[Optional[str]] = mapped_column(String(200))
    canonical_entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)
    actor: Mapped[Optional[str]] = mapped_column(String(100))
    correlation_id: Mapped[Optional[str]] = mapped_column(String(100))
    causation_id: Mapped[Optional[str]] = mapped_column(String(100))
    schema_version: Mapped[str] = mapped_column(String(20), default="1.0", nullable=False)
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sequence_number: Mapped[Optional[int]] = mapped_column(BigInteger, autoincrement=True, unique=True)


class LineageRecord(Base, TenantMixin, TimestampMixin):
    """
    Provenance for every step a record goes through in a pipeline.
    Answers "where did this value come from" and "what transforms touched it".
    """
    __tablename__ = "lineage_records"
    __table_args__ = (
        Index("idx_lineage_canonical", "canonical_entity_id"),
        Index("idx_lineage_source", "source_system"),
    )

    lineage_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    source_system: Mapped[str] = mapped_column(String(100), nullable=False)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(200))
    canonical_entity_id: Mapped[Optional[str]] = mapped_column(String(100))
    pipeline_name: Mapped[str] = mapped_column(String(200), default="default", nullable=False)
    step_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSON, default=dict)
