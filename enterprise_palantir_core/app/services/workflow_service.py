from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.enums import WorkflowInstanceStatus
from app.core.exceptions import WorkflowError
from app.core.time_utils import utc_now
from app.models.workflow import WorkflowDefinition, WorkflowInstance
from app.repositories.workflow_repo import WorkflowRepository


class WorkflowService:
    def __init__(self, session: Session):
        self.repo = WorkflowRepository(session)

    # ─── Definitions ──────────────────────────────────────────
    def define(
        self,
        *,
        tenant_id: str,
        name: str,
        version: str,
        entry_state: str,
        states: List[Dict[str, Any]],
        transitions: List[Dict[str, Any]],
        terminal_states: Optional[List[str]] = None,
        description: Optional[str] = None,
        sla_seconds: Optional[int] = None,
    ) -> WorkflowDefinition:
        return self.repo.create_definition(
            tenant_id=tenant_id,
            name=name,
            version=version,
            entry_state=entry_state,
            states=states,
            transitions=transitions,
            terminal_states=terminal_states,
            description=description,
            sla_seconds=sla_seconds,
        )

    def list_definitions(self, tenant_id: str) -> List[WorkflowDefinition]:
        return self.repo.list_definitions(tenant_id)

    # ─── Instances ────────────────────────────────────────────
    def start(
        self,
        *,
        tenant_id: str,
        workflow_id: str,
        canonical_entity_id: Optional[str] = None,
        owner: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstance:
        defn = self.repo.get_definition(workflow_id)
        if defn is None:
            raise WorkflowError(f"workflow_not_found:{workflow_id}")

        sla_deadline: Optional[datetime] = None
        entry_state_config = next((s for s in (defn.states or []) if s.get("name") == defn.entry_state), None)
        if entry_state_config and entry_state_config.get("sla_seconds"):
            sla_deadline = utc_now() + timedelta(seconds=int(entry_state_config["sla_seconds"]))
        elif defn.sla_seconds:
            sla_deadline = utc_now() + timedelta(seconds=defn.sla_seconds)

        instance = self.repo.start_instance(
            workflow_id=workflow_id,
            tenant_id=tenant_id,
            current_state=defn.entry_state,
            canonical_entity_id=canonical_entity_id,
            context=context,
            owner=owner,
            sla_deadline=sla_deadline,
        )
        self.repo.log_transition(
            instance_id=instance.instance_id,
            tenant_id=tenant_id,
            from_state=None,
            to_state=defn.entry_state,
            reason="instance_started",
        )
        return instance

    def transition(
        self,
        *,
        instance_id: str,
        to_state: str,
        actor: Optional[str] = None,
        reason: str = "manual",
        trigger_event_id: Optional[str] = None,
    ) -> WorkflowInstance:
        instance = self.repo.get_instance(instance_id)
        if instance is None:
            raise WorkflowError(f"instance_not_found:{instance_id}")
        defn = self.repo.get_definition(instance.workflow_id)
        if defn is None:
            raise WorkflowError(f"definition_not_found:{instance.workflow_id}")

        valid = [
            t for t in (defn.transitions or [])
            if t.get("from_state") == instance.current_state and t.get("to_state") == to_state
        ]
        if not valid:
            raise WorkflowError(f"no_transition:{instance.current_state}->{to_state}")

        from_state = instance.current_state
        sla_breach = instance.sla_deadline is not None and utc_now() > instance.sla_deadline

        instance.current_state = to_state
        instance.last_transition_at = utc_now()

        new_state_config = next((s for s in (defn.states or []) if s.get("name") == to_state), None)
        if new_state_config:
            if new_state_config.get("is_terminal"):
                instance.status = WorkflowInstanceStatus.COMPLETED.value
                instance.completed_at = utc_now()
            elif new_state_config.get("requires_approval"):
                instance.status = WorkflowInstanceStatus.WAITING_APPROVAL.value
            if new_state_config.get("sla_seconds"):
                instance.sla_deadline = utc_now() + timedelta(seconds=int(new_state_config["sla_seconds"]))
            else:
                instance.sla_deadline = None

        self.repo.log_transition(
            instance_id=instance_id,
            tenant_id=instance.tenant_id,
            from_state=from_state,
            to_state=to_state,
            trigger_event_id=trigger_event_id,
            actor=actor,
            reason=reason,
            sla_breach=sla_breach,
        )
        return instance

    def list_for_entity(self, canonical_entity_id: str) -> List[WorkflowInstance]:
        return self.repo.list_for_entity(canonical_entity_id)

    def list_running(self, tenant_id: str) -> List[WorkflowInstance]:
        return self.repo.list_by_status(tenant_id, WorkflowInstanceStatus.RUNNING.value)

    def list_waiting_approval(self, tenant_id: str) -> List[WorkflowInstance]:
        return self.repo.list_by_status(tenant_id, WorkflowInstanceStatus.WAITING_APPROVAL.value)

    def list_stalled(self, tenant_id: str) -> List[WorkflowInstance]:
        running = self.repo.list_by_status(tenant_id, WorkflowInstanceStatus.RUNNING.value)
        now = utc_now()
        return [i for i in running if i.sla_deadline is not None and i.sla_deadline < now]
