from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject, OntologyRelationship
from app.repositories.ontology_repo import OntologyRepository


class OntologyService:
    def __init__(self, session: Session):
        self.repo = OntologyRepository(session)

    def upsert_object(
        self,
        *,
        object_id: str,
        tenant_id: str,
        object_type: str,
        name: str,
        properties: Optional[Dict[str, Any]] = None,
        relationships: Optional[Dict[str, List[str]]] = None,
    ) -> OntologyObject:
        obj = self.repo.upsert_object(
            object_id=object_id,
            tenant_id=tenant_id,
            object_type=object_type,
            name=name,
            properties=properties,
        )
        if relationships:
            for rel_type, target_ids in relationships.items():
                for target_id in target_ids:
                    self.repo.upsert_relationship(
                        tenant_id=tenant_id,
                        from_object_id=object_id,
                        to_object_id=target_id,
                        relation_type=rel_type,
                    )
        return obj

    def get_object(self, object_id: str) -> Optional[OntologyObject]:
        return self.repo.get_object(object_id)

    def list_by_tenant(
        self, tenant_id: str, object_type: Optional[str] = None
    ) -> List[OntologyObject]:
        return self.repo.list_by_tenant(tenant_id, object_type=object_type)

    def related(self, object_id: str) -> List[OntologyRelationship]:
        return self.repo.relationships_for(object_id, direction="outgoing")

    def count_by_type(self, tenant_id: str) -> Dict[str, int]:
        return self.repo.count_by_type(tenant_id)
