import json
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


class OntologyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, object_id: str) -> Optional[OntologyObject]:
        return self.db.query(OntologyObject).filter(OntologyObject.id == object_id).first()

    def get_by_external_key(
        self,
        tenant_id: str,
        object_type: str,
        external_key: str,
    ) -> Optional[OntologyObject]:
        return (
            self.db.query(OntologyObject)
            .filter(
                OntologyObject.tenant_id == tenant_id,
                OntologyObject.object_type == object_type,
                OntologyObject.canonical_external_key == external_key,
            )
            .first()
        )

    def list_by_tenant(self, tenant_id: str) -> List[OntologyObject]:
        return self.db.query(OntologyObject).filter(OntologyObject.tenant_id == tenant_id).all()

    def upsert_object(
        self,
        *,
        object_id: str,
        tenant_id: str,
        object_type: str,
        name: str,
        canonical_external_key: str | None,
        properties: dict,
        relationships: dict,
        status: str = "active",
    ) -> OntologyObject:
        obj = self.get_by_id(object_id)

        if obj is None:
            obj = OntologyObject(
                id=object_id,
                tenant_id=tenant_id,
                object_type=object_type,
                name=name,
                canonical_external_key=canonical_external_key,
                properties_json=json.dumps(properties, ensure_ascii=False),
                relationships_json=json.dumps(relationships, ensure_ascii=False),
                status=status,
            )
            self.db.add(obj)
        else:
            obj.name = name
            obj.status = status
            obj.canonical_external_key = canonical_external_key
            old_properties = json.loads(obj.properties_json or "{}")
            old_relationships = json.loads(obj.relationships_json or "{}")

            old_properties.update(properties)

            for rel_name, targets in relationships.items():
                existing = old_relationships.get(rel_name, [])
                merged = list(dict.fromkeys(existing + targets))
                old_relationships[rel_name] = merged

            obj.properties_json = json.dumps(old_properties, ensure_ascii=False)
            obj.relationships_json = json.dumps(old_relationships, ensure_ascii=False)

        self.db.commit()
        self.db.refresh(obj)
        return obj
