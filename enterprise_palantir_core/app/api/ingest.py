from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas.ingest import IngestBatchRequest, IngestBatchResult, IngestRecord, IngestResult
from app.services.ingestion_service import IngestionService

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/record", response_model=IngestResult)
async def ingest_record(record: IngestRecord, session: Session = Depends(get_session)) -> IngestResult:
    service = IngestionService(session)
    result = await service.ingest(record)
    session.commit()
    return result


@router.post("/batch", response_model=IngestBatchResult)
async def ingest_batch(
    body: IngestBatchRequest, session: Session = Depends(get_session)
) -> IngestBatchResult:
    service = IngestionService(session)
    results = await service.ingest_batch(body.records)
    session.commit()
    return IngestBatchResult(count=len(results), results=results)


@router.post("/webhook/{source_name}")
async def webhook_ingest(
    source_name: str, payload: dict, session: Session = Depends(get_session)
) -> IngestResult:
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
    service = IngestionService(session)
    result = await service.ingest(record)
    session.commit()
    return result
