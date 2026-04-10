from __future__ import annotations

from app.models import FreshnessStatus, OntologyObject, utc_now
from app.stores import ontology_store


def upsert_ontology_object(
    canonical_entity_id: str,
    tenant_id: str,
    entity_type: str,
    entity_name: str,
    properties: dict,
    relationships: dict,
) -> OntologyObject:
    existing = ontology_store.get(canonical_entity_id)

    if existing is None:
        obj = OntologyObject(
            object_id=canonical_entity_id,
            tenant_id=tenant_id,
            object_type=entity_type,
            name=entity_name,
            properties=properties,
            relationships=relationships,
            freshness_status=FreshnessStatus.FRESH,
        )
        return ontology_store.upsert(obj)

    existing.name = entity_name or existing.name
    existing.properties.update(properties)
    for rel_name, rel_targets in relationships.items():
        current = existing.relationships.get(rel_name, [])
        merged = list(dict.fromkeys(current + rel_targets))
        existing.relationships[rel_name] = merged

    existing.updated_at = utc_now()
    existing.freshness_status = FreshnessStatus.FRESH
    return ontology_store.upsert(existing)
