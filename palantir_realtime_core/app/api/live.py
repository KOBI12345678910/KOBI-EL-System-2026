from __future__ import annotations

from fastapi import APIRouter

from app.models import FreshnessStatus, SnapshotResponse, utc_now
from app.stores import event_store, ontology_store, state_store

router = APIRouter(prefix="/live", tags=["live"])


@router.get("/snapshot/{tenant_id}", response_model=SnapshotResponse)
async def tenant_snapshot(tenant_id: str):
    objects = ontology_store.list_by_tenant(tenant_id)
    states = state_store.list_by_tenant(tenant_id)
    recent_events = event_store.recent_for_tenant(tenant_id, limit=200)

    breakdown = {}
    for obj in objects:
        breakdown[obj.object_type] = breakdown.get(obj.object_type, 0) + 1

    return SnapshotResponse(
        generated_at=utc_now(),
        tenant_id=tenant_id,
        total_objects=len(objects),
        total_states=len(states),
        at_risk_entities=sum(1 for s in states if s.current_status == "at_risk"),
        blocked_entities=sum(1 for s in states if s.current_status == "blocked"),
        fresh_entities=sum(1 for s in states if s.freshness_status == FreshnessStatus.FRESH),
        stale_entities=sum(1 for s in states if s.freshness_status == FreshnessStatus.STALE),
        object_breakdown=breakdown,
        recent_events_count=len(recent_events),
    )


@router.get("/events/{tenant_id}")
async def recent_events(tenant_id: str, limit: int = 50):
    return {
        "tenant_id": tenant_id,
        "events": event_store.recent_for_tenant(tenant_id, limit=limit),
    }
