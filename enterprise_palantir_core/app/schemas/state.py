from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class EntityStateOut(BaseModel):
    canonical_entity_id: str
    tenant_id: str
    entity_type: str
    current_status: str
    workflow_step: Optional[str]
    owner: Optional[str]
    risk_score: float
    freshness_status: str
    blockers: List[str]
    alerts: List[str]
    state: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
