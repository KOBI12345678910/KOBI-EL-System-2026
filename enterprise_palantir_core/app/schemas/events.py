from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class DomainEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    tenant_id: str
    event_type: str
    source_system: Optional[str] = None
    source_record_id: Optional[str] = None
    canonical_entity_id: str
    entity_type: str
    severity: str
    actor: Optional[str] = None
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    timestamp: datetime


class LineageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lineage_id: str
    tenant_id: str
    source_system: str
    source_record_id: Optional[str] = None
    canonical_entity_id: Optional[str] = None
    pipeline_name: str
    step_name: str
    metadata_: Optional[Dict[str, Any]] = None
    created_at: datetime
