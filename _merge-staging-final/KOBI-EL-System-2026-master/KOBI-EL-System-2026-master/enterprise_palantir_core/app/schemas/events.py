from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class DomainEventOut(BaseModel):
    id: str
    tenant_id: str
    event_type: str
    severity: str
    source_system: str
    source_record_id: Optional[str]
    canonical_entity_id: str
    entity_type: str
    correlation_id: Optional[str]
    causation_id: Optional[str]
    payload: Dict[str, Any]
    created_at: datetime
