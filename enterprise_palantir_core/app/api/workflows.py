import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.db import get_db
from app.schemas.workflow import (
    WorkflowDefinitionIn,
    WorkflowDefinitionOut,
    WorkflowInstanceIn,
    WorkflowInstanceOut,
)
from app.services.workflow_service import WorkflowService

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _def_out(d) -> WorkflowDefinitionOut:
    return WorkflowDefinitionOut(
        id=d.id,
        tenant_id=d.tenant_id,
        workflow_type=d.workflow_type,
        definition=json.loads(d.definition_json or "{}"),
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


def _inst_out(i) -> WorkflowInstanceOut:
    return WorkflowInstanceOut(
        id=i.id,
        tenant_id=i.tenant_id,
        workflow_type=i.workflow_type,
        target_entity_id=i.target_entity_id,
        current_step=i.current_step,
        status=i.status,
        history=json.loads(i.history_json or "[]"),
        context=json.loads(i.context_json or "{}"),
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


@router.post("/definitions", response_model=WorkflowDefinitionOut)
def create_definition(body: WorkflowDefinitionIn, db: Session = Depends(get_db)) -> WorkflowDefinitionOut:
    d = WorkflowService(db).define(
        tenant_id=body.tenant_id,
        workflow_type=body.workflow_type,
        definition=body.definition,
    )
    return _def_out(d)


@router.get("/definitions/{tenant_id}", response_model=List[WorkflowDefinitionOut])
def list_definitions(tenant_id: str, db: Session = Depends(get_db)) -> List[WorkflowDefinitionOut]:
    defs = WorkflowService(db).list_definitions(tenant_id)
    return [_def_out(d) for d in defs]


@router.post("/instances", response_model=WorkflowInstanceOut)
def start_instance(body: WorkflowInstanceIn, db: Session = Depends(get_db)) -> WorkflowInstanceOut:
    inst = WorkflowService(db).start(
        tenant_id=body.tenant_id,
        workflow_type=body.workflow_type,
        target_entity_id=body.target_entity_id,
        context=body.context,
    )
    return _inst_out(inst)


@router.post("/instances/{instance_id}/transition", response_model=WorkflowInstanceOut)
def transition_instance(
    instance_id: str,
    to_step: str,
    actor: str = "system",
    reason: str = "manual",
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    try:
        inst = WorkflowService(db).transition(
            instance_id=instance_id, to_step=to_step, actor=actor, reason=reason
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _inst_out(inst)


@router.get("/instances/active/{tenant_id}", response_model=List[WorkflowInstanceOut])
def list_active(tenant_id: str, db: Session = Depends(get_db)) -> List[WorkflowInstanceOut]:
    instances = WorkflowService(db).list_active(tenant_id)
    return [_inst_out(i) for i in instances]
