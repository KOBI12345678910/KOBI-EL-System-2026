from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.repositories.event_repo import EventRepository
from app.schemas.events import DomainEventRead, LineageRead
from app.schemas.ontology import OntologyObjectRead
from app.schemas.snapshot import AIContextResponse, CompanySnapshot, EntityTimeline
from app.schemas.state import EntityStateRead
from app.services.ai_context_service import AIContextService
from app.services.lineage_service import LineageService
from app.services.ontology_service import OntologyService
from app.services.snapshot_service import SnapshotService
from app.services.state_service import StateService

router = APIRouter(prefix="/live", tags=["live"])


@router.get("/snapshot/{tenant_id}", response_model=CompanySnapshot)
def company_snapshot(tenant_id: str, session: Session = Depends(get_session)) -> CompanySnapshot:
    return SnapshotService(session).build(tenant_id)


@router.get("/events/{tenant_id}", response_model=List[DomainEventRead])
def recent_events(
    tenant_id: str, limit: int = 100, session: Session = Depends(get_session)
) -> List[DomainEventRead]:
    repo = EventRepository(session)
    events = repo.recent_for_tenant(tenant_id, limit=limit)
    return [DomainEventRead.model_validate(e) for e in events]


@router.get("/timeline/{entity_id}", response_model=EntityTimeline)
def entity_timeline(entity_id: str, session: Session = Depends(get_session)) -> EntityTimeline:
    ontology = OntologyService(session)
    state = StateService(session)
    events = EventRepository(session)
    lineage = LineageService(session)
    obj = ontology.get_object(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="entity_not_found")
    s = state.get(entity_id)
    return EntityTimeline(
        entity=OntologyObjectRead.model_validate(obj),
        state=EntityStateRead.model_validate(s) if s else None,
        events=[DomainEventRead.model_validate(e) for e in events.recent_for_entity(entity_id, limit=100)],
        lineage=[LineageRead.model_validate(l) for l in lineage.for_entity(entity_id)],
    )


@router.get("/ai-context/{entity_id}", response_model=AIContextResponse)
def ai_context(
    entity_id: str, tenant_id: str, session: Session = Depends(get_session)
) -> AIContextResponse:
    return AIContextService(session).build(tenant_id=tenant_id, entity_id=entity_id)
