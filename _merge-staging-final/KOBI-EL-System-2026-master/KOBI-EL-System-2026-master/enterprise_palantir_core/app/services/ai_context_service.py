import json

from sqlalchemy.orm import Session

from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository


class AIContextService:
    def __init__(self, db: Session) -> None:
        self.ontology_repo = OntologyRepository(db)
        self.state_repo = StateRepository(db)
        self.event_repo = EventRepository(db)

    def build_entity_context(self, entity_id: str) -> dict:
        entity = self.ontology_repo.get_by_id(entity_id)
        state = self.state_repo.get(entity_id)
        recent_events = self.event_repo.list_recent_for_entity(entity_id, limit=30)

        related_entities = []
        if entity:
            relationships = json.loads(entity.relationships_json or "{}")
            seen = set()
            for _, targets in relationships.items():
                for target_id in targets:
                    if target_id in seen:
                        continue
                    seen.add(target_id)
                    target = self.ontology_repo.get_by_id(target_id)
                    if target:
                        related_entities.append({
                            "id": target.id,
                            "type": target.object_type,
                            "name": target.name,
                            "status": target.status,
                        })

        return {
            "entity": None if entity is None else {
                "id": entity.id,
                "tenant_id": entity.tenant_id,
                "object_type": entity.object_type,
                "name": entity.name,
                "status": entity.status,
                "properties": json.loads(entity.properties_json or "{}"),
                "relationships": json.loads(entity.relationships_json or "{}"),
            },
            "state": None if state is None else {
                "canonical_entity_id": state.canonical_entity_id,
                "current_status": state.current_status,
                "risk_score": state.risk_score,
                "workflow_step": state.workflow_step,
                "blockers": json.loads(state.blockers_json or "[]"),
                "alerts": json.loads(state.alerts_json or "[]"),
                "state": json.loads(state.state_json or "{}"),
            },
            "recent_events": [
                {
                    "id": e.id,
                    "type": e.event_type,
                    "severity": e.severity,
                    "payload": json.loads(e.payload_json or "{}"),
                    "created_at": e.created_at.isoformat(),
                }
                for e in recent_events
            ],
            "related_entities": related_entities,
        }
