import json
from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models.workflow import WorkflowDefinitionModel, WorkflowInstanceModel


class WorkflowRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── Definitions ──────────────────────────────────────────
    def create_definition(
        self, *, tenant_id: str, workflow_type: str, definition: dict
    ) -> WorkflowDefinitionModel:
        row = WorkflowDefinitionModel(
            id=new_id("wf"),
            tenant_id=tenant_id,
            workflow_type=workflow_type,
            definition_json=json.dumps(definition, ensure_ascii=False),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_definition(self, workflow_id: str) -> Optional[WorkflowDefinitionModel]:
        return self.db.query(WorkflowDefinitionModel).filter(WorkflowDefinitionModel.id == workflow_id).first()

    def list_definitions(self, tenant_id: str) -> List[WorkflowDefinitionModel]:
        return (
            self.db.query(WorkflowDefinitionModel)
            .filter(WorkflowDefinitionModel.tenant_id == tenant_id)
            .all()
        )

    # ─── Instances ────────────────────────────────────────────
    def start_instance(
        self,
        *,
        tenant_id: str,
        workflow_type: str,
        target_entity_id: str,
        context: dict,
        initial_step: str = "start",
    ) -> WorkflowInstanceModel:
        row = WorkflowInstanceModel(
            id=new_id("wfi"),
            tenant_id=tenant_id,
            workflow_type=workflow_type,
            target_entity_id=target_entity_id,
            current_step=initial_step,
            status="active",
            history_json=json.dumps(
                [{"step": initial_step, "event": "started"}], ensure_ascii=False
            ),
            context_json=json.dumps(context or {}, ensure_ascii=False),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_instance(self, instance_id: str) -> Optional[WorkflowInstanceModel]:
        return (
            self.db.query(WorkflowInstanceModel)
            .filter(WorkflowInstanceModel.id == instance_id)
            .first()
        )

    def list_for_entity(self, target_entity_id: str) -> List[WorkflowInstanceModel]:
        return (
            self.db.query(WorkflowInstanceModel)
            .filter(WorkflowInstanceModel.target_entity_id == target_entity_id)
            .all()
        )

    def list_by_status(self, tenant_id: str, status: str) -> List[WorkflowInstanceModel]:
        return (
            self.db.query(WorkflowInstanceModel)
            .filter(
                WorkflowInstanceModel.tenant_id == tenant_id,
                WorkflowInstanceModel.status == status,
            )
            .all()
        )

    def transition(
        self, *, instance_id: str, to_step: str, status: str, history_entry: dict
    ) -> Optional[WorkflowInstanceModel]:
        row = self.get_instance(instance_id)
        if row is None:
            return None
        history = json.loads(row.history_json or "[]")
        history.append(history_entry)
        row.current_step = to_step
        row.status = status
        row.history_json = json.dumps(history, ensure_ascii=False)
        self.db.commit()
        self.db.refresh(row)
        return row
