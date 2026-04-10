from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.core.enums import EventType, Severity
from app.core.time_utils import utc_now


class IngestRecord(BaseModel):
    tenant_id: str
    source_system: str
    source_record_id: str
    entity_type: str
    entity_name: str
    canonical_external_key: Optional[str] = None
    event_type: EventType = EventType.ENTITY_UPSERTED
    severity: Severity = Severity.INFO
    properties: Dict[str, Any] = Field(default_factory=dict)
    relationships: Dict[str, List[str]] = Field(default_factory=dict)
    correlation_id: Optional[str] = None
    actor: Optional[str] = None
    timestamp: datetime = Field(default_factory=utc_now)


class IngestBatchRequest(BaseModel):
    records: List[IngestRecord]


class IngestResult(BaseModel):
    canonical_entity_id: str
    event_id: str
    status: str = "ingested"
    is_new_entity: bool = False
    issues: List[str] = Field(default_factory=list)


class IngestBatchResult(BaseModel):
    count: int
    results: List[IngestResult]
