"""
Batch Ingest Engine — bulk ingestion with error collection.

Accepts a list of IngestRecordIn objects and processes them one-by-one
through the same IngestionService path that the single-record API uses.
Returns a BatchResult with per-record success/failure, timing, and
total throughput.

Used by:
  - Legacy CSV file upload (each row becomes an IngestRecordIn)
  - API bulk endpoint /ingest/batch
  - Initial data migration from an old ERP
  - Nightly re-ingestion for catch-up after connector outage
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.schemas.ingest import IngestRecordIn
from app.services.ingestion_service import IngestionService


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class BatchRecordResult:
    index: int
    success: bool
    entity_id: Optional[str] = None
    event_id: Optional[str] = None
    state_status: Optional[str] = None
    error: Optional[str] = None
    duration_ms: int = 0


@dataclass
class BatchResult:
    batch_id: str
    tenant_id: str
    started_at: datetime
    finished_at: datetime
    total_records: int
    successful: int
    failed: int
    total_duration_ms: int
    throughput_per_sec: float
    results: List[BatchRecordResult] = field(default_factory=list)


class BatchIngestEngine:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ingest_many(
        self,
        records: List[IngestRecordIn],
        *,
        batch_id: str = "",
        collect_results: bool = True,
    ) -> BatchResult:
        service = IngestionService(self.db)
        started = utc_now()
        results: List[BatchRecordResult] = []
        successful = 0
        failed = 0

        tenant_id = records[0].tenant_id if records else ""
        batch_id = batch_id or f"batch_{int(started.timestamp() * 1000)}"

        for idx, record in enumerate(records):
            record_started = time.time()
            try:
                result = service.ingest_record(record)
                duration_ms = int((time.time() - record_started) * 1000)
                successful += 1
                if collect_results:
                    results.append(BatchRecordResult(
                        index=idx,
                        success=True,
                        entity_id=result.get("entity_id"),
                        event_id=result.get("event_id"),
                        state_status=result.get("state_status"),
                        duration_ms=duration_ms,
                    ))
            except Exception as exc:
                duration_ms = int((time.time() - record_started) * 1000)
                failed += 1
                if collect_results:
                    results.append(BatchRecordResult(
                        index=idx,
                        success=False,
                        error=str(exc),
                        duration_ms=duration_ms,
                    ))

        finished = utc_now()
        total_ms = int((finished - started).total_seconds() * 1000)
        throughput = len(records) / max(0.001, (finished - started).total_seconds())

        return BatchResult(
            batch_id=batch_id,
            tenant_id=tenant_id,
            started_at=started,
            finished_at=finished,
            total_records=len(records),
            successful=successful,
            failed=failed,
            total_duration_ms=total_ms,
            throughput_per_sec=round(throughput, 2),
            results=results,
        )
