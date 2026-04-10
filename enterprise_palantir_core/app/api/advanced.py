"""
Advanced API — GraphQL layer, document store, full-text search,
webhook receiver, batch ingest, job queue.

These are Phase 7 endpoints that expose the advanced infrastructure
on top of the existing analytics + intelligence layers.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.batch_ingest import BatchIngestEngine
from app.engines.document_store import DocType, get_document_store
from app.engines.full_text_index import FullTextIndex
from app.engines.graphql_layer import GraphQLLayer
from app.engines.job_queue import JobStatus, get_job_queue
from app.engines.webhook_receiver import (
    WebhookConfig,
    get_webhook_receiver,
)
from app.schemas.ingest import IngestRecordIn
from app.services.ingestion_service import IngestionService

router = APIRouter(prefix="/advanced", tags=["advanced"])


# ════════════════════════════════════════════════════════════════
# GRAPHQL-LIKE QUERY
# ════════════════════════════════════════════════════════════════

@router.post("/graphql/query")
def graphql_query(
    query: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    layer = GraphQLLayer(db)
    result = layer.execute(query)
    return {
        "data": result.data,
        "count": result.count,
        "elapsed_ms": result.elapsed_ms,
        "errors": result.errors,
    }


# ════════════════════════════════════════════════════════════════
# DOCUMENT STORE
# ════════════════════════════════════════════════════════════════

class DocumentIn(BaseModel):
    tenant_id: str
    doc_type: str = "note"
    title: str
    content: str
    attached_to_entity_id: Optional[str] = None
    author: Optional[str] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


@router.post("/documents")
def create_document(body: DocumentIn) -> Dict[str, Any]:
    store = get_document_store()
    try:
        doc_type = DocType(body.doc_type)
    except ValueError:
        doc_type = DocType.NOTE
    doc = store.create(
        tenant_id=body.tenant_id,
        doc_type=doc_type,
        title=body.title,
        content=body.content,
        attached_to_entity_id=body.attached_to_entity_id,
        author=body.author,
        tags=body.tags,
        metadata=body.metadata,
    )
    return _serialize_document(doc)


@router.get("/documents/{doc_id}")
def get_document(doc_id: str) -> Dict[str, Any]:
    store = get_document_store()
    doc = store.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    return _serialize_document(doc)


@router.get("/entities/{entity_id}/documents")
def list_entity_documents(entity_id: str) -> List[Dict[str, Any]]:
    store = get_document_store()
    return [_serialize_document(d) for d in store.list_for_entity(entity_id)]


@router.get("/documents")
def list_tenant_documents(
    tenant_id: str,
    doc_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    store = get_document_store()
    dt = None
    if doc_type:
        try:
            dt = DocType(doc_type)
        except ValueError:
            dt = None
    return [_serialize_document(d) for d in store.list_for_tenant(tenant_id, doc_type=dt)]


def _serialize_document(doc) -> Dict[str, Any]:
    return {
        "doc_id": doc.doc_id,
        "tenant_id": doc.tenant_id,
        "doc_type": doc.doc_type.value,
        "title": doc.title,
        "content": doc.content,
        "attached_to_entity_id": doc.attached_to_entity_id,
        "author": doc.author,
        "tags": doc.tags,
        "metadata": doc.metadata,
        "content_hash": doc.content_hash,
        "size_bytes": doc.size_bytes,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
    }


# ════════════════════════════════════════════════════════════════
# FULL-TEXT SEARCH
# ════════════════════════════════════════════════════════════════

@router.get("/search")
def full_text_search(
    tenant_id: str,
    q: str,
    limit: int = 20,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    index = FullTextIndex(db)
    index.build(tenant_id)
    results = index.search(tenant_id, q, limit=limit, source_type_filter=source_type)
    stats = index.stats(tenant_id)
    return {
        "query": q,
        "result_count": len(results),
        "results": [asdict(r) for r in results],
        "index_stats": {
            "total_documents": stats.total_documents,
            "total_terms": stats.total_terms,
            "avg_tokens_per_doc": round(stats.avg_tokens_per_doc, 1),
            "last_built_at": stats.last_built_at.isoformat() if stats.last_built_at else None,
        },
    }


# ════════════════════════════════════════════════════════════════
# WEBHOOK RECEIVER
# ════════════════════════════════════════════════════════════════

class WebhookRegistrationIn(BaseModel):
    connector_id: str
    tenant_id: str
    secret: str
    entity_type: str
    entity_name_field: str = "name"
    canonical_key_field: str = "id"


@router.post("/webhooks/register")
def register_webhook(body: WebhookRegistrationIn) -> Dict[str, Any]:
    """Register a webhook endpoint with a simple default transformer."""
    receiver = get_webhook_receiver()
    config = WebhookConfig(
        connector_id=body.connector_id,
        tenant_id=body.tenant_id,
        secret=body.secret,
    )

    def transformer(payload: Dict[str, Any]) -> IngestRecordIn:
        return IngestRecordIn(
            tenant_id=body.tenant_id,
            source_system=body.connector_id,
            source_record_id=str(payload.get(body.canonical_key_field, "unknown")),
            entity_type=body.entity_type,
            entity_name=str(payload.get(body.entity_name_field, "Unknown")),
            canonical_external_key=str(payload.get(body.canonical_key_field, "")),
            event_type="entity_upserted",
            severity="info",
            properties=payload,
            relationships={},
        )

    receiver.register(config, transformer)
    return {
        "ok": True,
        "connector_id": body.connector_id,
        "signature_header": config.signature_header,
        "signature_algo": config.signature_algo,
    }


@router.post("/webhooks/{connector_id}/receive")
async def receive_webhook(
    connector_id: str,
    request: Request,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> Dict[str, Any]:
    receiver = get_webhook_receiver()
    raw_body = await request.body()
    headers = dict(request.headers)
    receipt, ingest_record = receiver.receive(
        connector_id=connector_id,
        raw_body=raw_body,
        headers=headers,
        idempotency_key=idempotency_key,
    )
    response: Dict[str, Any] = {
        "receipt_id": receipt.receipt_id,
        "status": receipt.status,
        "signature_valid": receipt.signature_valid,
        "error": receipt.error,
    }
    # If accepted, actually ingest
    if receipt.status == "accepted" and ingest_record is not None:
        service = IngestionService(db)
        result = service.ingest_record(ingest_record)
        response["ingest_result"] = result
    return response


@router.get("/webhooks/stats")
def webhook_stats() -> Dict[str, Any]:
    receiver = get_webhook_receiver()
    return {
        "stats": receiver.stats(),
        "recent_receipts": [
            {
                "receipt_id": r.receipt_id,
                "connector_id": r.connector_id,
                "received_at": r.received_at.isoformat(),
                "status": r.status,
                "signature_valid": r.signature_valid,
                "error": r.error,
            }
            for r in receiver.recent(30)
        ],
    }


# ════════════════════════════════════════════════════════════════
# BATCH INGEST
# ════════════════════════════════════════════════════════════════

class BatchIngestIn(BaseModel):
    records: List[IngestRecordIn]
    batch_id: Optional[str] = None
    collect_results: bool = True


@router.post("/ingest/batch")
def batch_ingest(body: BatchIngestIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = BatchIngestEngine(db)
    result = engine.ingest_many(
        body.records,
        batch_id=body.batch_id or "",
        collect_results=body.collect_results,
    )
    return {
        "batch_id": result.batch_id,
        "tenant_id": result.tenant_id,
        "started_at": result.started_at.isoformat(),
        "finished_at": result.finished_at.isoformat(),
        "total_records": result.total_records,
        "successful": result.successful,
        "failed": result.failed,
        "total_duration_ms": result.total_duration_ms,
        "throughput_per_sec": result.throughput_per_sec,
        "results": [asdict(r) for r in result.results],
    }


# ════════════════════════════════════════════════════════════════
# JOB QUEUE
# ════════════════════════════════════════════════════════════════

@router.get("/jobs")
def list_jobs(status: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
    queue = get_job_queue()
    try:
        status_enum = JobStatus(status) if status else None
    except ValueError:
        status_enum = None
    jobs = queue.list(status=status_enum, limit=limit)
    return {
        "stats": queue.stats(),
        "jobs": [
            {
                "job_id": j.job_id,
                "job_type": j.job_type,
                "status": j.status.value,
                "created_at": j.created_at.isoformat(),
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "finished_at": j.finished_at.isoformat() if j.finished_at else None,
                "duration_ms": j.duration_ms,
                "result": j.result,
                "error": j.error,
                "retry_count": j.retry_count,
            }
            for j in jobs
        ],
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    queue = get_job_queue()
    job = queue.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return {
        "job_id": job.job_id,
        "job_type": job.job_type,
        "status": job.status.value,
        "params": job.params,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "duration_ms": job.duration_ms,
        "result": job.result,
        "error": job.error,
        "retry_count": job.retry_count,
    }


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> Dict[str, Any]:
    queue = get_job_queue()
    ok = queue.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=422, detail="job not found or not queued")
    return {"ok": True, "job_id": job_id, "status": "cancelled"}
