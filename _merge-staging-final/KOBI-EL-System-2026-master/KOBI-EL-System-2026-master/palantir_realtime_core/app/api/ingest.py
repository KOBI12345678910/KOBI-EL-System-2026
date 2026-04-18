from __future__ import annotations

from typing import List

from fastapi import APIRouter

from app.ingestion_service import ingest_record
from app.models import IngestRecord

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/record")
async def ingest_single_record(record: IngestRecord):
    return await ingest_record(record)


@router.post("/batch")
async def ingest_batch(records: List[IngestRecord]):
    results = []
    for record in records:
        results.append(await ingest_record(record))
    return {
        "count": len(results),
        "results": results,
    }


@router.post("/webhook/{source_name}")
async def webhook_ingest(source_name: str, payload: dict):
    record = IngestRecord(
        tenant_id=payload["tenant_id"],
        source_system=source_name,
        source_record_id=payload.get("source_record_id", "webhook_record"),
        entity_type=payload["entity_type"],
        entity_name=payload["entity_name"],
        canonical_external_key=payload.get("canonical_external_key"),
        event_type=payload.get("event_type", "custom"),
        severity=payload.get("severity", "info"),
        properties=payload.get("properties", {}),
        relationships=payload.get("relationships", {}),
    )
    return await ingest_record(record)
