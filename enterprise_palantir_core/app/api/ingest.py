from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.ingest import IngestRecordIn
from app.services.ingestion_service import IngestionService

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/record")
def ingest_record(record: IngestRecordIn, db: Session = Depends(get_db)) -> dict:
    service = IngestionService(db)
    return service.ingest_record(record)


@router.post("/batch")
def ingest_batch(records: List[IngestRecordIn], db: Session = Depends(get_db)) -> dict:
    service = IngestionService(db)
    results = [service.ingest_record(r) for r in records]
    return {"count": len(results), "results": results}


@router.post("/webhook/{source_name}")
def webhook_ingest(source_name: str, payload: dict, db: Session = Depends(get_db)) -> dict:
    record = IngestRecordIn(
        tenant_id=payload["tenant_id"],
        source_system=source_name,
        source_record_id=payload.get("source_record_id", "webhook_record"),
        entity_type=payload["entity_type"],
        entity_name=payload["entity_name"],
        canonical_external_key=payload.get("canonical_external_key"),
        event_type=payload.get("event_type", "entity_upserted"),
        severity=payload.get("severity", "info"),
        properties=payload.get("properties", {}),
        relationships=payload.get("relationships", {}),
    )
    service = IngestionService(db)
    return service.ingest_record(record)
