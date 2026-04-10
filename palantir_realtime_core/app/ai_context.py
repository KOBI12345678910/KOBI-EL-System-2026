from __future__ import annotations

from typing import List

from app.models import AIContextResponse, OntologyObject
from app.stores import event_store, ontology_store, state_store


def build_ai_context(tenant_id: str, entity_id: str) -> AIContextResponse:
    """
    Build a Claude-ready context packet for a specific entity.

    This is the canonical AI-ready view of an operational entity. It
    includes everything an AI reasoning loop needs to understand the
    current state: the entity itself, its live operational state, its
    recent events, and its immediate relational neighbors.
    """
    entity = ontology_store.get(entity_id)
    state = state_store.get(entity_id)
    recent_events = event_store.recent_for_entity(entity_id, limit=30)

    related: List[OntologyObject] = []
    if entity is not None:
        seen: set[str] = set()
        for _rel_name, targets in entity.relationships.items():
            for target_id in targets:
                if target_id in seen:
                    continue
                seen.add(target_id)
                target = ontology_store.get(target_id)
                if target is not None and target.tenant_id == tenant_id:
                    related.append(target)

    return AIContextResponse(
        entity=entity,
        state=state,
        recent_events=recent_events,
        related_entities=related,
    )
