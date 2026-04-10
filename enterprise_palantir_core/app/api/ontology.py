import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository
from app.services.ai_context_service import AIContextService

router = APIRouter(prefix="/ontology", tags=["ontology"])


@router.get("/object/{object_id}")
def get_object(object_id: str, db: Session = Depends(get_db)):
    repo = OntologyRepository(db)
    state_repo = StateRepository(db)

    obj = repo.get_by_id(object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Object not found")

    state = state_repo.get(object_id)

    return {
        "object": {
            "id": obj.id,
            "tenant_id": obj.tenant_id,
            "type": obj.object_type,
            "name": obj.name,
            "status": obj.status,
            "properties": json.loads(obj.properties_json or "{}"),
            "relationships": json.loads(obj.relationships_json or "{}"),
        },
        "state": None if state is None else {
            "status": state.current_status,
            "risk_score": state.risk_score,
            "blockers": json.loads(state.blockers_json or "[]"),
            "alerts": json.loads(state.alerts_json or "[]"),
        },
    }


@router.get("/object/{object_id}/timeline")
def get_object_timeline(object_id: str, db: Session = Depends(get_db)):
    repo = EventRepository(db)
    return {
        "entity_id": object_id,
        "events": [
            {
                "id": e.id,
                "type": e.event_type,
                "severity": e.severity,
                "payload": json.loads(e.payload_json or "{}"),
                "created_at": e.created_at,
            }
            for e in repo.list_recent_for_entity(object_id, limit=200)
        ],
    }


@router.get("/object/{object_id}/ai-context")
def get_ai_context(object_id: str, db: Session = Depends(get_db)):
    service = AIContextService(db)
    return service.build_entity_context(object_id)
