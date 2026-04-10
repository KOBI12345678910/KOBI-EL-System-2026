import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories.ontology_repo import OntologyRepository
from app.schemas.ontology import OntologyObjectOut

router = APIRouter(prefix="/entities", tags=["entities"])


def _to_out(obj) -> OntologyObjectOut:
    return OntologyObjectOut(
        id=obj.id,
        tenant_id=obj.tenant_id,
        object_type=obj.object_type,
        name=obj.name,
        status=obj.status,
        canonical_external_key=obj.canonical_external_key,
        properties=json.loads(obj.properties_json or "{}"),
        relationships=json.loads(obj.relationships_json or "{}"),
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.get("/{entity_id}", response_model=OntologyObjectOut)
def get_entity(entity_id: str, db: Session = Depends(get_db)) -> OntologyObjectOut:
    repo = OntologyRepository(db)
    obj = repo.get_by_id(entity_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="entity_not_found")
    return _to_out(obj)


@router.get("", response_model=List[OntologyObjectOut])
def list_entities(tenant_id: str, db: Session = Depends(get_db)) -> List[OntologyObjectOut]:
    repo = OntologyRepository(db)
    objs = repo.list_by_tenant(tenant_id)
    return [_to_out(o) for o in objs]
