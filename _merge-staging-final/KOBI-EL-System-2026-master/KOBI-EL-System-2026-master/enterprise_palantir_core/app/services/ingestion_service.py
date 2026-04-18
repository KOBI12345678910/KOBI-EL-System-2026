from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.repositories.event_repo import EventRepository
from app.services.lineage_service import LineageService
from app.services.ontology_service import OntologyService
from app.services.state_service import StateService


class IngestionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.ontology_service = OntologyService(db)
        self.event_repo = EventRepository(db)
        self.state_service = StateService(db)
        self.lineage_service = LineageService(db)

    def ingest_record(self, record) -> dict:
        self.lineage_service.record(
            tenant_id=record.tenant_id,
            actor_id="system_ingestion",
            action_name="raw_ingestion",
            target_entity_id=None,
            details={
                "source_system": record.source_system,
                "source_record_id": record.source_record_id,
                "entity_type": record.entity_type,
            },
        )

        obj = self.ontology_service.upsert_object(
            tenant_id=record.tenant_id,
            entity_type=record.entity_type,
            entity_name=record.entity_name,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            canonical_external_key=record.canonical_external_key,
            properties=record.properties,
            relationships=record.relationships,
            status=record.properties.get("status", "active"),
        )

        event = self.event_repo.create_event(
            event_id=new_id("evt"),
            tenant_id=record.tenant_id,
            event_type=record.event_type,
            severity=record.severity,
            source_system=record.source_system,
            source_record_id=record.source_record_id,
            canonical_entity_id=obj.id,
            entity_type=record.entity_type,
            payload={
                "entity_name": record.entity_name,
                "properties": record.properties,
                "relationships": record.relationships,
                "status": record.properties.get("status"),
                "timestamp": (record.timestamp or utc_now()).isoformat(),
            },
        )

        state = self.state_service.apply_domain_event(
            tenant_id=record.tenant_id,
            canonical_entity_id=obj.id,
            entity_type=record.entity_type,
            event_type=record.event_type,
            payload={
                "status": record.properties.get("status"),
                **record.properties,
            },
        )

        self.lineage_service.record(
            tenant_id=record.tenant_id,
            actor_id="system_ingestion",
            action_name="ontology_hydration_and_state_update",
            target_entity_id=obj.id,
            details={
                "event_id": event.id,
                "state_status": state.current_status,
            },
        )

        return {
            "status": "ok",
            "entity_id": obj.id,
            "event_id": event.id,
            "state_status": state.current_status,
        }
