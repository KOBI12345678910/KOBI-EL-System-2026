from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkflowStateSchema(BaseModel):
    name: str
    description: Optional[str] = None
    is_terminal: bool = False
    requires_approval: bool = False
    sla_seconds: Optional[int] = None


class WorkflowTransitionSchema(BaseModel):
    from_state: str
    to_state: str
    trigger_event: Optional[str] = None
    guard: Optional[str] = None
    action: Optional[str] = None


class WorkflowDefinitionCreate(BaseModel):
    tenant_id: str
    name: str
    version: str
    description: Optional[str] = None
    states: List[WorkflowStateSchema]
    transitions: List[WorkflowTransitionSchema]
    entry_state: str
    terminal_states: List[str] = Field(default_factory=list)
    sla_seconds: Optional[int] = None


class WorkflowDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workflow_id: str
    tenant_id: str
    name: str
    version: str
    description: Optional[str] = None
    states: Optional[List[Dict[str, Any]]] = None
    transitions: Optional[List[Dict[str, Any]]] = None
    entry_state: str
    terminal_states: Optional[List[str]] = None
    status: str
    created_at: datetime


class WorkflowInstanceStart(BaseModel):
    tenant_id: str
    workflow_id: str
    canonical_entity_id: Optional[str] = None
    owner: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


class WorkflowInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    instance_id: str
    workflow_id: str
    tenant_id: str
    canonical_entity_id: Optional[str] = None
    current_state: str
    status: str
    context: Optional[Dict[str, Any]] = None
    owner: Optional[str] = None
    last_transition_at: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
