from __future__ import annotations

from app.models import LineageRecord
from app.stores import lineage_store


def record_lineage(
    tenant_id: str,
    source_system: str,
    source_record_id: str | None,
    canonical_entity_id: str | None,
    step_name: str,
    metadata: dict | None = None,
) -> LineageRecord:
    rec = LineageRecord(
        tenant_id=tenant_id,
        source_system=source_system,
        source_record_id=source_record_id,
        canonical_entity_id=canonical_entity_id,
        step_name=step_name,
        metadata=metadata or {},
    )
    return lineage_store.append(rec)
