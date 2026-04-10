from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.ai_context import build_ai_context
from app.stores import event_store, lineage_store, ontology_store, state_store

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("/{entity_id}")
async def get_entity(entity_id: str):
    obj = ontology_store.get(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    return {
        "entity": obj,
        "state": state_store.get(entity_id),
    }


@router.get("/{entity_id}/timeline")
async def get_entity_timeline(entity_id: str):
    obj = ontology_store.get(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    return {
        "entity": obj,
        "events": event_store.recent_for_entity(entity_id, limit=100),
    }


@router.get("/{entity_id}/lineage")
async def get_entity_lineage(entity_id: str):
    obj = ontology_store.get(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    return {
        "entity": obj,
        "lineage": lineage_store.list_for_entity(entity_id),
    }


@router.get("/{entity_id}/ai-context")
async def get_entity_ai_context(entity_id: str, tenant_id: str):
    return build_ai_context(tenant_id=tenant_id, entity_id=entity_id)
