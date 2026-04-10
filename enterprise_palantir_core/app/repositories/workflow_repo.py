from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.models.workflow import WorkflowDefinition, WorkflowInstance, WorkflowTransitionLog


class WorkflowRepository:
    def __init__(self, session: Session):
        self.s = session

    # ─── Definitions ──────────────────────────────────────────
    def create_definition(
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
        row = WorkflowDefinition(
            workflow_id=new_id("wf"),
            tenant_id=tenant_id,
            name=name,
            version=version,
            description=description,
            states=states,
            transitions=transitions,
            entry_state=entry_state,
            terminal_states=terminal_states or [],
            sla_seconds=sla_seconds,
            status="active",
        )
        self.s.add(row)
        self.s.flush()
        return row

    def get_definition(self, workflow_id: str) -> Optional[WorkflowDefinition]:
        return self.s.get(WorkflowDefinition, workflow_id)

    def list_definitions(self, tenant_id: str) -> List[WorkflowDefinition]:
        return list(
            self.s.scalars(select(WorkflowDefinition).where(WorkflowDefinition.tenant_id == tenant_id))
        )

    # ─── Instances ────────────────────────────────────────────
    def start_instance(
        self,
        *,
        workflow_id: str,
        tenant_id: str,
        current_state: str,
        canonical_entity_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        owner: Optional[str] = None,
        sla_deadline: Optional[datetime] = None,
    ) -> WorkflowInstance:
        row = WorkflowInstance(
            instance_id=new_id("wfi"),
            workflow_id=workflow_id,
            tenant_id=tenant_id,
            canonical_entity_id=canonical_entity_id,
            current_state=current_state,
            status="running",
            context=context or {},
            owner=owner,
            last_transition_at=utc_now(),
            sla_deadline=sla_deadline,
        )
        self.s.add(row)
        self.s.flush()
        return row

    def get_instance(self, instance_id: str) -> Optional[WorkflowInstance]:
        return self.s.get(WorkflowInstance, instance_id)

    def list_for_entity(self, canonical_entity_id: str) -> List[WorkflowInstance]:
        stmt = select(WorkflowInstance).where(WorkflowInstance.canonical_entity_id == canonical_entity_id)
        return list(self.s.scalars(stmt))

    def list_by_status(self, tenant_id: str, status: str) -> List[WorkflowInstance]:
        stmt = (
            select(WorkflowInstance)
            .where(and_(WorkflowInstance.tenant_id == tenant_id, WorkflowInstance.status == status))
        )
        return list(self.s.scalars(stmt))

    def log_transition(
        self,
        *,
        instance_id: str,
        tenant_id: str,
        from_state: Optional[str],
        to_state: str,
        trigger_event_id: Optional[str] = None,
        actor: Optional[str] = None,
        reason: Optional[str] = None,
        sla_breach: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WorkflowTransitionLog:
        row = WorkflowTransitionLog(
            instance_id=instance_id,
            tenant_id=tenant_id,
            from_state=from_state,
            to_state=to_state,
            trigger_event_id=trigger_event_id,
            actor=actor,
            reason=reason,
            sla_breach=sla_breach,
            metadata_=metadata or {},
            occurred_at=utc_now(),
        )
        self.s.add(row)
        self.s.flush()
        return row

    def transition_history(self, instance_id: str) -> List[WorkflowTransitionLog]:
        stmt = (
            select(WorkflowTransitionLog)
            .where(WorkflowTransitionLog.instance_id == instance_id)
            .order_by(WorkflowTransitionLog.occurred_at.asc())
        )
        return list(self.s.scalars(stmt))
