"""
Ingestion Service — the end-to-end pipeline orchestrator.

For every incoming record the flow is:

  1. lineage: raw_ingestion
  2. resolve canonical_id (deterministic from tenant+type+key)
  3. upsert ontology object (+ merge relationships)
  4. lineage: ontology_hydration
  5. append domain event
  6. lineage: event_emitted
  7. publish to event bus (async fan-out)
  8. apply event to state engine
  9. emit alerts based on rule matches
 10. broadcast to WebSocket hub

This is the single entry point that every data source uses — whether
it arrives through POST /ingest/record, a webhook, CDC, a file drop,
or a batch pipeline. The contract is always the same: `IngestRecord`.
"""

from __future__ import annotations

import asyncio
from typing import List

from sqlalchemy.orm import Session

from app.core.ids import canonical_id as derive_canonical_id, event_id as new_event_id
from app.event_bus import event_bus
from app.repositories.event_repo import EventRepository
from app.schemas.ingest import IngestRecord, IngestResult
from app.services.alert_service import AlertService
from app.services.lineage_service import LineageService
from app.services.ontology_service import OntologyService
from app.services.state_service import StateService
from app.websocket_hub import ws_hub


class IngestionService:
    def __init__(self, session: Session):
        self.session = session
        self.ontology = OntologyService(session)
        self.state = StateService(session)
        self.lineage = LineageService(session)
        self.alerts = AlertService(session)
        self.events = EventRepository(session)

    def resolve_canonical_id(self, record: IngestRecord) -> str:
        key = record.canonical_external_key or f"{record.source_system}:{record.source_record_id}"
        return derive_canonical_id(record.tenant_id, record.entity_type, key)

    async def ingest(self, record: IngestRecord) -> IngestResult:
        canonical_id = self.resolve_canonical_id(record)

        # 1. raw lineage
        self.lineage.record(
            tenant_id=record.tenant_id,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            canonical_entity_id=None,
            step_name="raw_ingestion",
            metadata={"entity_type": record.entity_type},
        )

        # 2. ontology hydration
        existed = self.ontology.get_object(canonical_id) is not None
        obj = self.ontology.upsert_object(
            object_id=canonical_id,
            tenant_id=record.tenant_id,
            object_type=record.entity_type,
            name=record.entity_name,
            properties=record.properties,
            relationships=record.relationships,
        )
        self.lineage.record(
            tenant_id=record.tenant_id,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            canonical_entity_id=canonical_id,
            step_name="ontology_hydration",
            metadata={"object_type": obj.object_type},
        )

        # 3. append domain event
        event = self.events.append(
            event_id=new_event_id(),
            tenant_id=record.tenant_id,
            event_type=record.event_type.value,
            canonical_entity_id=canonical_id,
            entity_type=record.entity_type,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            actor=record.actor,
            severity=record.severity.value,
            payload={
                "entity_name": record.entity_name,
                "properties": record.properties,
                "relationships": record.relationships,
                "status": (record.properties or {}).get("status"),
            },
            correlation_id=record.correlation_id,
            timestamp=record.timestamp,
        )

        self.lineage.record(
            tenant_id=record.tenant_id,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            canonical_entity_id=canonical_id,
            step_name="event_emitted",
            metadata={"event_id": event.event_id, "event_type": event.event_type},
        )

        # 4. apply to state engine
        self.state.apply_event(event)

        # 5. raise alerts if any rule matches
        self.alerts.evaluate_event(event)

        # 6. flush → commit happens at the session_scope boundary
        self.session.flush()

        # 7. fan out to event bus + WebSocket (best-effort)
        event_dict = {
            "type": "domain_event",
            "event": {
                "event_id": event.event_id,
                "tenant_id": event.tenant_id,
                "event_type": event.event_type,
                "canonical_entity_id": event.canonical_entity_id,
                "entity_type": event.entity_type,
                "severity": event.severity,
                "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                "payload": event.payload,
            },
        }
        try:
            await event_bus.publish(event.event_type, event_dict)
        except Exception:
            pass
        try:
            await ws_hub.broadcast(event.tenant_id, event_dict)
        except Exception:
            pass

        return IngestResult(
            canonical_entity_id=canonical_id,
            event_id=event.event_id,
            status="ingested",
            is_new_entity=not existed,
        )

    async def ingest_batch(self, records: List[IngestRecord]) -> List[IngestResult]:
        results = []
        for r in records:
            results.append(await self.ingest(r))
        return results
