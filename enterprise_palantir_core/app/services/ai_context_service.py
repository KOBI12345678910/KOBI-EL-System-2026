"""
AI Context Service — Claude-ready enterprise context builder.

Given an entity ID, builds a rich context packet that includes:
  - the entity itself (ontology object)
  - its live state
  - its recent events (timeline)
  - its related entities (one hop out)
  - a rough token estimate

This is what Claude receives when you call /entities/{id}/ai-context.
"""

from __future__ import annotations

import json
from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.time_utils import utc_now
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository
from app.schemas.events import DomainEventRead
from app.schemas.ontology import OntologyObjectRead
from app.schemas.snapshot import AIContextResponse
from app.schemas.state import EntityStateRead


class AIContextService:
    def __init__(self, session: Session):
        self.s = session
        self.ontology = OntologyRepository(session)
        self.state = StateRepository(session)
        self.events = EventRepository(session)

    def build(self, *, tenant_id: str, entity_id: str) -> AIContextResponse:
        obj = self.ontology.get_object(entity_id)
        state = self.state.get(entity_id)
        events = self.events.recent_for_entity(entity_id, limit=30)

        related: List[OntologyObjectRead] = []
        if obj is not None:
            outgoing = self.ontology.relationships_for(obj.object_id, direction="outgoing")
            seen: set[str] = set()
            for rel in outgoing:
                if rel.to_object_id in seen:
                    continue
                seen.add(rel.to_object_id)
                target = self.ontology.get_object(rel.to_object_id)
                if target is not None and target.tenant_id == tenant_id:
                    related.append(OntologyObjectRead.model_validate(target))

        entity_read = OntologyObjectRead.model_validate(obj) if obj else None
        state_read = EntityStateRead.model_validate(state) if state else None
        event_reads = [DomainEventRead.model_validate(e) for e in events]

        packet = AIContextResponse(
            entity=entity_read,
            state=state_read,
            recent_events=event_reads,
            related_entities=related,
            generated_at=utc_now(),
            token_estimate=0,
        )
        # Rough token estimate: 1 token ~= 4 chars of JSON
        blob = json.dumps(packet.model_dump(mode="json"), default=str)
        packet.token_estimate = max(1, len(blob) // 4)
        return packet
