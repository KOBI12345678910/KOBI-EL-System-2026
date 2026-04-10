from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import DomainEvent, LineageRecord


class EventRepository:
    def __init__(self, session: Session):
        self.s = session

    def append(
        self,
        *,
        event_id: str,
        tenant_id: str,
        event_type: str,
        canonical_entity_id: str,
        entity_type: str,
        source_system: Optional[str] = None,
        source_record_id: Optional[str] = None,
        actor: Optional[str] = None,
        severity: str = "info",
        payload: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> DomainEvent:
        from app.core.time_utils import utc_now
        row = DomainEvent(
            event_id=event_id,
            tenant_id=tenant_id,
            event_type=event_type,
            canonical_entity_id=canonical_entity_id,
            entity_type=entity_type,
            source_system=source_system,
            source_record_id=source_record_id,
            actor=actor,
            severity=severity,
            payload=payload or {},
            correlation_id=correlation_id,
            causation_id=causation_id,
            timestamp=timestamp or utc_now(),
        )
        self.s.add(row)
        self.s.flush()
        return row

    def recent_for_entity(self, canonical_entity_id: str, limit: int = 50) -> List[DomainEvent]:
        stmt = (
            select(DomainEvent)
            .where(DomainEvent.canonical_entity_id == canonical_entity_id)
            .order_by(DomainEvent.timestamp.desc())
            .limit(limit)
        )
        return list(self.s.scalars(stmt))

    def recent_for_tenant(self, tenant_id: str, limit: int = 100) -> List[DomainEvent]:
        stmt = (
            select(DomainEvent)
            .where(DomainEvent.tenant_id == tenant_id)
            .order_by(DomainEvent.timestamp.desc())
            .limit(limit)
        )
        return list(self.s.scalars(stmt))

    def by_severity(self, tenant_id: str, severity: str, limit: int = 50) -> List[DomainEvent]:
        stmt = (
            select(DomainEvent)
            .where(DomainEvent.tenant_id == tenant_id)
            .where(DomainEvent.severity == severity)
            .order_by(DomainEvent.timestamp.desc())
            .limit(limit)
        )
        return list(self.s.scalars(stmt))

    def count_for_tenant(self, tenant_id: str) -> int:
        stmt = select(DomainEvent).where(DomainEvent.tenant_id == tenant_id)
        return len(list(self.s.scalars(stmt)))


class LineageRepository:
    def __init__(self, session: Session):
        self.s = session

    def append(
        self,
        *,
        lineage_id: str,
        tenant_id: str,
        source_system: str,
        source_record_id: Optional[str],
        canonical_entity_id: Optional[str],
        pipeline_name: str,
        step_name: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> LineageRecord:
        row = LineageRecord(
            lineage_id=lineage_id,
            tenant_id=tenant_id,
            source_system=source_system,
            source_record_id=source_record_id,
            canonical_entity_id=canonical_entity_id,
            pipeline_name=pipeline_name,
            step_name=step_name,
            metadata_=metadata or {},
        )
        self.s.add(row)
        self.s.flush()
        return row

    def for_entity(self, canonical_entity_id: str) -> List[LineageRecord]:
        stmt = (
            select(LineageRecord)
            .where(LineageRecord.canonical_entity_id == canonical_entity_id)
            .order_by(LineageRecord.created_at.asc())
        )
        return list(self.s.scalars(stmt))
