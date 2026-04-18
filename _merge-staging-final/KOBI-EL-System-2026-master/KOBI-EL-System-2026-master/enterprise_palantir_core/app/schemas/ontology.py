from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel


class OntologyObjectOut(BaseModel):
    id: str
    tenant_id: str
    object_type: str
    name: str
    status: str
    canonical_external_key: str | None
    properties: Dict[str, Any]
    relationships: Dict[str, List[str]]
    created_at: datetime
    updated_at: datetime
