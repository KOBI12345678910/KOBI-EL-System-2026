from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OntologyObjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    object_id: str
    tenant_id: str
    object_type: str
    name: str
    status: str
    freshness_status: str
    properties: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class OntologyRelationshipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rel_id: str
    tenant_id: str
    from_object_id: str
    to_object_id: str
    relation_type: str
    attributes: Optional[Dict[str, Any]] = None


class OntologyObjectWithRelations(BaseModel):
    entity: OntologyObjectRead
    relationships: List[OntologyRelationshipRead] = Field(default_factory=list)
