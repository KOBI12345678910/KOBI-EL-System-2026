from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class FreshnessStatus(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    UNKNOWN = "unknown"


class EventType(str, Enum):
    ENTITY_UPSERTED = "entity_upserted"
    STATUS_CHANGED = "status_changed"
    PROPERTY_UPDATED = "property_updated"
    ALERT_CREATED = "alert_created"
    WORKFLOW_STALLED = "workflow_stalled"
    INVENTORY_LOW = "inventory_low"
    SUPPLIER_DELAYED = "supplier_delayed"
    PAYMENT_RECEIVED = "payment_received"
    PROJECT_AT_RISK = "project_at_risk"
    CUSTOM = "custom"


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
    timestamp: datetime = Field(default_factory=utc_now)


class DomainEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: new_id("evt"))
    tenant_id: str
    source_system: str
    source_record_id: Optional[str] = None
    canonical_entity_id: str
    entity_type: str
    event_type: EventType
    severity: Severity = Severity.INFO
    timestamp: datetime = Field(default_factory=utc_now)
    payload: Dict[str, Any] = Field(default_factory=dict)
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    schema_version: str = "1.0"


class OntologyObject(BaseModel):
    object_id: str
    tenant_id: str
    object_type: str
    name: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    relationships: Dict[str, List[str]] = Field(default_factory=dict)
    status: str = "active"
    freshness_status: FreshnessStatus = FreshnessStatus.UNKNOWN
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class EntityState(BaseModel):
    canonical_entity_id: str
    tenant_id: str
    entity_type: str
    current_status: str = "active"
    risk_score: float = 0.0
    freshness_status: FreshnessStatus = FreshnessStatus.UNKNOWN
    blockers: List[str] = Field(default_factory=list)
    alerts: List[str] = Field(default_factory=list)
    workflow_step: Optional[str] = None
    owner: Optional[str] = None
    last_event_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=utc_now)


class LineageRecord(BaseModel):
    lineage_id: str = Field(default_factory=lambda: new_id("lin"))
    tenant_id: str
    source_system: str
    source_record_id: Optional[str] = None
    canonical_entity_id: Optional[str] = None
    step_name: str
    timestamp: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SnapshotResponse(BaseModel):
    generated_at: datetime
    tenant_id: str
    total_objects: int
    total_states: int
    at_risk_entities: int
    blocked_entities: int
    fresh_entities: int
    stale_entities: int
    object_breakdown: Dict[str, int]
    recent_events_count: int


class AIContextResponse(BaseModel):
    entity: Optional[OntologyObject]
    state: Optional[EntityState]
    recent_events: List[DomainEvent]
    related_entities: List[OntologyObject]
