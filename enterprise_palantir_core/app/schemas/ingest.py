from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class IngestRecordIn(BaseModel):
    tenant_id: str
    source_system: str
    source_record_id: str
    entity_type: str
    entity_name: str
    canonical_external_key: Optional[str] = None
    event_type: str = "entity_upserted"
    severity: str = "info"
    properties: Dict[str, Any] = Field(default_factory=dict)
    relationships: Dict[str, List[str]] = Field(default_factory=dict)
    timestamp: Optional[datetime] = None
