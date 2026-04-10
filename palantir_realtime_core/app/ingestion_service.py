from __future__ import annotations

import hashlib

from app.event_bus import event_bus
from app.lineage import record_lineage
from app.models import DomainEvent, IngestRecord
from app.ontology import upsert_ontology_object
from app.stores import event_store


def resolve_canonical_id(record: IngestRecord) -> str:
    if record.canonical_external_key:
        base = f"{record.tenant_id}:{record.entity_type}:{record.canonical_external_key}"
    else:
        base = f"{record.tenant_id}:{record.entity_type}:{record.source_system}:{record.source_record_id}"

    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]
    return f"obj_{digest}"


async def ingest_record(record: IngestRecord) -> dict:
    canonical_id = resolve_canonical_id(record)

    record_lineage(
        tenant_id=record.tenant_id,
        source_system=record.source_system,
        source_record_id=record.source_record_id,
        canonical_entity_id=None,
        step_name="raw_ingestion",
        metadata={"entity_type": record.entity_type},
    )

    obj = upsert_ontology_object(
        canonical_entity_id=canonical_id,
        tenant_id=record.tenant_id,
        entity_type=record.entity_type,
        entity_name=record.entity_name,
        properties=record.properties,
        relationships=record.relationships,
    )

    record_lineage(
        tenant_id=record.tenant_id,
        source_system=record.source_system,
        source_record_id=record.source_record_id,
        canonical_entity_id=canonical_id,
        step_name="ontology_hydration",
        metadata={"object_type": obj.object_type},
    )

    event = DomainEvent(
        tenant_id=record.tenant_id,
        source_system=record.source_system,
        source_record_id=record.source_record_id,
        canonical_entity_id=canonical_id,
        entity_type=record.entity_type,
        event_type=record.event_type,
        severity=record.severity,
        timestamp=record.timestamp,
        payload={
            "entity_name": record.entity_name,
            "properties": record.properties,
            "relationships": record.relationships,
            "status": record.properties.get("status"),
        },
    )

    event_store.append(event)

    record_lineage(
        tenant_id=record.tenant_id,
        source_system=record.source_system,
        source_record_id=record.source_record_id,
        canonical_entity_id=canonical_id,
        step_name="event_emitted",
        metadata={"event_id": event.event_id, "event_type": event.event_type.value},
    )

    await event_bus.publish(event)

    return {
        "canonical_entity_id": canonical_id,
        "event_id": event.event_id,
        "status": "ingested",
    }
