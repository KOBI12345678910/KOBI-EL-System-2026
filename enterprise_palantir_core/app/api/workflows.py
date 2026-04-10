from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.exceptions import PlatformError
from app.db import get_session
from app.schemas.workflow import (
    WorkflowDefinitionCreate,
    WorkflowDefinitionRead,
    WorkflowInstanceRead,
    WorkflowInstanceStart,
)
from app.services.workflow_service import WorkflowService

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/definitions", response_model=WorkflowDefinitionRead)
def create_workflow_definition(
    body: WorkflowDefinitionCreate, session: Session = Depends(get_session)
) -> WorkflowDefinitionRead:
    service = WorkflowService(session)
    defn = service.define(
        tenant_id=body.tenant_id,
        name=body.name,
        version=body.version,
        description=body.description,
        entry_state=body.entry_state,
        states=[s.model_dump() for s in body.states],
        transitions=[t.model_dump() for t in body.transitions],
        terminal_states=body.terminal_states,
        sla_seconds=body.sla_seconds,
    )
    session.commit()
    return WorkflowDefinitionRead.model_validate(defn)


@router.get("/definitions/{tenant_id}", response_model=List[WorkflowDefinitionRead])
def list_definitions(tenant_id: str, session: Session = Depends(get_session)) -> List[WorkflowDefinitionRead]:
    defs = WorkflowService(session).list_definitions(tenant_id)
    return [WorkflowDefinitionRead.model_validate(d) for d in defs]


@router.post("/instances", response_model=WorkflowInstanceRead)
def start_instance(
    body: WorkflowInstanceStart, session: Session = Depends(get_session)
) -> WorkflowInstanceRead:
    service = WorkflowService(session)
    try:
        instance = service.start(
            tenant_id=body.tenant_id,
            workflow_id=body.workflow_id,
            canonical_entity_id=body.canonical_entity_id,
            owner=body.owner,
            context=body.context,
        )
    except PlatformError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    session.commit()
    return WorkflowInstanceRead.model_validate(instance)


@router.post("/instances/{instance_id}/transition", response_model=WorkflowInstanceRead)
def transition_instance(
    instance_id: str,
    to_state: str,
    actor: str = "system",
    reason: str = "manual",
    session: Session = Depends(get_session),
) -> WorkflowInstanceRead:
    service = WorkflowService(session)
    try:
        instance = service.transition(
            instance_id=instance_id,
            to_state=to_state,
            actor=actor,
            reason=reason,
        )
    except PlatformError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    session.commit()
    return WorkflowInstanceRead.model_validate(instance)


@router.get("/instances/stalled/{tenant_id}", response_model=List[WorkflowInstanceRead])
def list_stalled(tenant_id: str, session: Session = Depends(get_session)) -> List[WorkflowInstanceRead]:
    instances = WorkflowService(session).list_stalled(tenant_id)
    return [WorkflowInstanceRead.model_validate(i) for i in instances]
