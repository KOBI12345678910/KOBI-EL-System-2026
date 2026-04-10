from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.ontology import OntologyObjectRead, OntologyObjectWithRelations, OntologyRelationshipRead
from app.services.ontology_service import OntologyService

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("/{entity_id}", response_model=OntologyObjectWithRelations)
def get_entity(
    entity_id: str, session: Session = Depends(get_session)
) -> OntologyObjectWithRelations:
    service = OntologyService(session)
    obj = service.get_object(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="entity_not_found")
    relationships = service.related(entity_id)
    return OntologyObjectWithRelations(
        entity=OntologyObjectRead.model_validate(obj),
        relationships=[OntologyRelationshipRead.model_validate(r) for r in relationships],
    )


@router.get("", response_model=List[OntologyObjectRead])
def list_entities(
    tenant_id: str,
    entity_type: Optional[str] = None,
    session: Session = Depends(get_session),
) -> List[OntologyObjectRead]:
    service = OntologyService(session)
    objs = service.list_by_tenant(tenant_id, object_type=entity_type)
    return [OntologyObjectRead.model_validate(o) for o in objs]
