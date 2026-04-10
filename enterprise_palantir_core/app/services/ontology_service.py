import hashlib

from sqlalchemy.orm import Session

from app.repositories.ontology_repo import OntologyRepository


class OntologyService:
    def __init__(self, db: Session) -> None:
        self.repo = OntologyRepository(db)

    def resolve_object_id(
        self,
        tenant_id: str,
        entity_type: str,
        source_system: str,
        source_record_id: str,
        canonical_external_key: str | None = None,
    ) -> str:
        if canonical_external_key:
            existing = self.repo.get_by_external_key(tenant_id, entity_type, canonical_external_key)
            if existing:
                return existing.id

            base = f"{tenant_id}:{entity_type}:{canonical_external_key}"
        else:
            base = f"{tenant_id}:{entity_type}:{source_system}:{source_record_id}"

        digest = hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]
        return f"obj_{digest}"

    def upsert_object(
        self,
        *,
        tenant_id: str,
        entity_type: str,
        entity_name: str,
        source_system: str,
        source_record_id: str,
        canonical_external_key: str | None,
        properties: dict,
        relationships: dict,
        status: str = "active",
    ):
        object_id = self.resolve_object_id(
            tenant_id=tenant_id,
            entity_type=entity_type,
            source_system=source_system,
            source_record_id=source_record_id,
            canonical_external_key=canonical_external_key,
        )

        return self.repo.upsert_object(
            object_id=object_id,
            tenant_id=tenant_id,
            object_type=entity_type,
            name=entity_name,
            canonical_external_key=canonical_external_key,
            properties=properties,
            relationships=relationships,
            status=status,
        )
