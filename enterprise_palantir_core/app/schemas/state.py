from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class EntityStateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    canonical_entity_id: str
    tenant_id: str
    entity_type: str
    current_status: str
    risk_score: float
    freshness_status: str
    blockers: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    alerts: Optional[List[str]] = None
    workflow_step: Optional[str] = None
    owner: Optional[str] = None
    sla_status: Optional[str] = None
    financial_exposure: Optional[float] = None
    properties: Optional[Dict[str, Any]] = None
    last_event_at: Optional[datetime] = None
    updated_at: datetime
