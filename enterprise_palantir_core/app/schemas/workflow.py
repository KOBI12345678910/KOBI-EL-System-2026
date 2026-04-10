from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WorkflowDefinitionIn(BaseModel):
    tenant_id: str
    workflow_type: str
    definition: Dict[str, Any] = Field(default_factory=dict)


class WorkflowDefinitionOut(BaseModel):
    id: str
    tenant_id: str
    workflow_type: str
    definition: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class WorkflowInstanceIn(BaseModel):
    tenant_id: str
    workflow_type: str
    target_entity_id: str
    context: Dict[str, Any] = Field(default_factory=dict)


class WorkflowInstanceOut(BaseModel):
    id: str
    tenant_id: str
    workflow_type: str
    target_entity_id: str
    current_step: Optional[str]
    status: str
    history: List[Dict[str, Any]]
    context: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
