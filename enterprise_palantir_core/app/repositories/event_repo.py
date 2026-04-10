import json
from typing import List

from sqlalchemy.orm import Session

from app.models.events import DomainEventModel


class EventRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_event(
        self,
        *,
        event_id: str,
        tenant_id: str,
        event_type: str,
        severity: str,
        source_system: str,
        source_record_id: str | None,
        canonical_entity_id: str,
        entity_type: str,
        payload: dict,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> DomainEventModel:
        event = DomainEventModel(
            id=event_id,
            tenant_id=tenant_id,
            event_type=event_type,
            severity=severity,
            source_system=source_system,
            source_record_id=source_record_id,
            canonical_entity_id=canonical_entity_id,
            entity_type=entity_type,
            correlation_id=correlation_id,
            causation_id=causation_id,
            payload_json=json.dumps(payload, ensure_ascii=False),
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_recent_for_entity(self, entity_id: str, limit: int = 100) -> List[DomainEventModel]:
        return (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.canonical_entity_id == entity_id)
            .order_by(DomainEventModel.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_recent_for_tenant(self, tenant_id: str, limit: int = 200) -> List[DomainEventModel]:
        return (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .order_by(DomainEventModel.created_at.desc())
            .limit(limit)
            .all()
        )
