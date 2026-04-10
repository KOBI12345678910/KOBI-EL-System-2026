import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository
from app.schemas.events import DomainEventOut
from app.schemas.snapshot import TenantSnapshotOut
from app.schemas.state import EntityStateOut
from app.services.ai_context_service import AIContextService
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/live", tags=["live"])


def _event_out(e) -> DomainEventOut:
    return DomainEventOut(
        id=e.id,
        tenant_id=e.tenant_id,
        event_type=e.event_type,
        severity=e.severity,
        source_system=e.source_system,
        source_record_id=e.source_record_id,
        canonical_entity_id=e.canonical_entity_id,
        entity_type=e.entity_type,
        correlation_id=e.correlation_id,
        causation_id=e.causation_id,
        payload=json.loads(e.payload_json or "{}"),
        created_at=e.created_at,
    )


def _state_out(s) -> EntityStateOut:
    return EntityStateOut(
        canonical_entity_id=s.canonical_entity_id,
        tenant_id=s.tenant_id,
        entity_type=s.entity_type,
        current_status=s.current_status,
        workflow_step=s.workflow_step,
        owner=s.owner,
        risk_score=s.risk_score,
        freshness_status=s.freshness_status,
        blockers=json.loads(s.blockers_json or "[]"),
        alerts=json.loads(s.alerts_json or "[]"),
        state=json.loads(s.state_json or "{}"),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("/snapshot/{tenant_id}", response_model=TenantSnapshotOut)
def company_snapshot(tenant_id: str, db: Session = Depends(get_db)) -> TenantSnapshotOut:
    snap = SnapshotService(db).build_tenant_snapshot(tenant_id)
    return TenantSnapshotOut(**snap)


@router.get("/events/{tenant_id}", response_model=List[DomainEventOut])
def recent_events(tenant_id: str, limit: int = 100, db: Session = Depends(get_db)) -> List[DomainEventOut]:
    repo = EventRepository(db)
    events = repo.list_recent_for_tenant(tenant_id, limit=limit)
    return [_event_out(e) for e in events]


@router.get("/timeline/{entity_id}")
def entity_timeline(entity_id: str, db: Session = Depends(get_db)) -> dict:
    ontology_repo = OntologyRepository(db)
    state_repo = StateRepository(db)
    event_repo = EventRepository(db)
    obj = ontology_repo.get_by_id(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="entity_not_found")
    events = event_repo.list_recent_for_entity(entity_id, limit=100)
    state = state_repo.get(entity_id)
    return {
        "entity_id": entity_id,
        "state": _state_out(state).model_dump() if state else None,
        "events": [_event_out(e).model_dump() for e in events],
    }


@router.get("/ai-context/{entity_id}")
def ai_context(entity_id: str, db: Session = Depends(get_db)) -> dict:
    return AIContextService(db).build_entity_context(entity_id)
