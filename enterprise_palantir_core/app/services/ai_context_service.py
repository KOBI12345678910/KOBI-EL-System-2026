"""
AI Context Service — Claude-ready enterprise context builder.

Given an entity ID, assembles everything Claude needs to reason about it:
  - the entity itself (ontology object)
  - its live state
  - its recent events (timeline)
  - a rough token estimate

This is what /live/ai-context returns.
"""

import json

from sqlalchemy.orm import Session

from app.core.time_utils import utc_now
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository


class AIContextService:
    def __init__(self, db: Session) -> None:
        self.ontology_repo = OntologyRepository(db)
        self.state_repo = StateRepository(db)
        self.event_repo = EventRepository(db)

    def build(self, *, tenant_id: str, entity_id: str) -> dict:
        obj = self.ontology_repo.get_by_id(entity_id)
        state = self.state_repo.get(entity_id)
        events = self.event_repo.list_recent_for_entity(entity_id, limit=30)

        entity_dict = None
        if obj is not None:
            entity_dict = {
                "id": obj.id,
                "tenant_id": obj.tenant_id,
                "object_type": obj.object_type,
                "name": obj.name,
                "status": obj.status,
                "properties": json.loads(obj.properties_json or "{}"),
                "relationships": json.loads(obj.relationships_json or "{}"),
            }

        state_dict = None
        if state is not None:
            state_dict = {
                "canonical_entity_id": state.canonical_entity_id,
                "current_status": state.current_status,
                "risk_score": state.risk_score,
                "freshness_status": state.freshness_status,
                "blockers": json.loads(state.blockers_json or "[]"),
                "alerts": json.loads(state.alerts_json or "[]"),
                "state": json.loads(state.state_json or "{}"),
            }

        events_list = [
            {
                "id": e.id,
                "event_type": e.event_type,
                "severity": e.severity,
                "canonical_entity_id": e.canonical_entity_id,
                "payload": json.loads(e.payload_json or "{}"),
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ]

        packet = {
            "tenant_id": tenant_id,
            "generated_at": utc_now().isoformat(),
            "entity": entity_dict,
            "state": state_dict,
            "recent_events": events_list,
            "token_estimate": 0,
        }
        packet["token_estimate"] = max(1, len(json.dumps(packet, default=str)) // 4)
        return packet
