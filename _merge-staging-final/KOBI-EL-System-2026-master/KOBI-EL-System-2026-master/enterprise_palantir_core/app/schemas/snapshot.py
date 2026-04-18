from datetime import datetime
from typing import Dict

from pydantic import BaseModel


class TenantSnapshotOut(BaseModel):
    generated_at: datetime
    tenant_id: str
    total_objects: int
    total_states: int
    at_risk_entities: int
    blocked_entities: int
    object_breakdown: Dict[str, int]
    recent_events_count: int
