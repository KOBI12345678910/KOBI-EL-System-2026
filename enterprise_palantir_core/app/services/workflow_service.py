import json

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.repositories.workflow_repo import WorkflowRepository


class WorkflowService:
    def __init__(self, db: Session) -> None:
        self.repo = WorkflowRepository(db)

    def define(self, *, tenant_id: str, workflow_type: str, definition: dict):
        return self.repo.create_definition(
            tenant_id=tenant_id, workflow_type=workflow_type, definition=definition
        )

    def list_definitions(self, tenant_id: str):
        return self.repo.list_definitions(tenant_id)

    def start(
        self,
        *,
        tenant_id: str,
        workflow_type: str,
        target_entity_id: str,
        context: dict | None = None,
    ):
        return self.repo.start_instance(
            tenant_id=tenant_id,
            workflow_type=workflow_type,
            target_entity_id=target_entity_id,
            context=context or {},
        )

    def transition(
        self,
        *,
        instance_id: str,
        to_step: str,
        actor: str | None = None,
        reason: str = "manual",
    ):
        instance = self.repo.get_instance(instance_id)
        if instance is None:
            raise NotFoundError(f"workflow_instance_not_found:{instance_id}")
        status = "active"
        if to_step in {"completed", "done", "closed"}:
            status = "completed"
        return self.repo.transition(
            instance_id=instance_id,
            to_step=to_step,
            status=status,
            history_entry={
                "from_step": instance.current_step,
                "to_step": to_step,
                "actor": actor,
                "reason": reason,
            },
        )

    def list_active(self, tenant_id: str):
        return self.repo.list_by_status(tenant_id, "active")

    def list_blocked(self, tenant_id: str):
        return self.repo.list_by_status(tenant_id, "blocked")
