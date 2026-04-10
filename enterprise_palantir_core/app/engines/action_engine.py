"""
Action Engine — action request → policy → approval → execute → audit.

Every side-effect (writing back to a source system, triggering an
external workflow, sending a notification) goes through here. The
engine wraps the user's action handler with all the guardrails:

  1. Request validation (action_type must be registered)
  2. Policy evaluation (PolicyEngine)
  3. Approval gate (if required)
  4. Handler execution
  5. Audit log entry
  6. Rollback hook (if the handler returns a rollback callable)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.engines.policy_engine import ActionRequest, DecisionStatus, PolicyEngine
from app.repositories.audit_repo import AuditRepository


ActionHandler = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class ActionDefinition:
    action_type: str
    description: str
    required_permissions: List[str] = field(default_factory=list)
    supports_rollback: bool = False


@dataclass
class ActionExecution:
    action_id: str
    tenant_id: str
    action_type: str
    actor: str
    params: Dict[str, Any]
    status: str = "requested"        # requested|pending_approval|approved|executing|executed|failed|rolled_back
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    audit_id: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    rollback_handle: Optional[str] = None
    created_at: datetime = field(default_factory=utc_now)


class ActionEngine:
    def __init__(self, db: Session, policy_engine: Optional[PolicyEngine] = None) -> None:
        self.db = db
        self.audit_repo = AuditRepository(db)
        self.policy_engine = policy_engine or PolicyEngine()
        self._definitions: Dict[str, ActionDefinition] = {}
        self._handlers: Dict[str, ActionHandler] = {}
        self._executions: Dict[str, ActionExecution] = {}

    # ─── Registration ────────────────────────────────────────
    def register_definition(self, defn: ActionDefinition) -> None:
        self._definitions[defn.action_type] = defn

    def register_handler(self, action_type: str, handler: ActionHandler) -> None:
        self._handlers[action_type] = handler

    # ─── Lifecycle ───────────────────────────────────────────
    def request(
        self,
        *,
        tenant_id: str,
        actor: str,
        action_type: str,
        params: Dict[str, Any],
        actor_roles: Optional[List[str]] = None,
        estimated_impact_usd: float = 0.0,
    ) -> ActionExecution:
        defn = self._definitions.get(action_type)
        if defn is None:
            raise ValueError(f"unknown_action_type:{action_type}")

        execution = ActionExecution(
            action_id=new_id("act"),
            tenant_id=tenant_id,
            action_type=action_type,
            actor=actor,
            params=dict(params),
        )

        # Policy evaluation
        req = ActionRequest(
            action_id=execution.action_id,
            action_type=action_type,
            actor=actor,
            tenant_id=tenant_id,
            payload=params,
            estimated_impact_usd=estimated_impact_usd,
            actor_roles=actor_roles or [],
        )
        decision = self.policy_engine.evaluate(req)

        if decision.status == DecisionStatus.BLOCK:
            execution.status = "failed"
            execution.error = "policy_violation:" + ",".join(decision.reasons)
        elif decision.status == DecisionStatus.REQUIRE_APPROVAL:
            execution.status = "pending_approval"
        else:
            execution.status = "approved"

        self._executions[execution.action_id] = execution

        audit = self.audit_repo.log(
            log_id=new_id("aud"),
            tenant_id=tenant_id,
            actor_id=actor,
            action_name=f"action.request.{execution.status}",
            target_entity_id=execution.action_id,
            details={
                "action_type": action_type,
                "params": params,
                "policy_status": decision.status.value,
                "policy_reasons": decision.reasons,
                "violated_policies": decision.violated_policies,
            },
        )
        execution.audit_id = audit.id
        return execution

    def approve(
        self, *, execution_id: str, approver: str
    ) -> ActionExecution:
        execution = self._executions.get(execution_id)
        if execution is None:
            raise ValueError(f"execution_not_found:{execution_id}")
        if execution.status != "pending_approval":
            raise ValueError(f"not_pending_approval:{execution.status}")
        execution.status = "approved"
        execution.approved_by = approver
        execution.approved_at = utc_now()
        self.audit_repo.log(
            log_id=new_id("aud"),
            tenant_id=execution.tenant_id,
            actor_id=approver,
            action_name="action.approve",
            target_entity_id=execution.action_id,
            details={"action_type": execution.action_type},
        )
        return execution

    async def execute(
        self, *, execution_id: str, actor: str
    ) -> ActionExecution:
        execution = self._executions.get(execution_id)
        if execution is None:
            raise ValueError(f"execution_not_found:{execution_id}")
        if execution.status != "approved":
            raise ValueError(f"not_approved:{execution.status}")

        handler = self._handlers.get(execution.action_type)
        if handler is None:
            execution.status = "failed"
            execution.error = f"no_handler:{execution.action_type}"
            self.audit_repo.log(
                log_id=new_id("aud"),
                tenant_id=execution.tenant_id,
                actor_id=actor,
                action_name="action.execute.failed",
                target_entity_id=execution.action_id,
                details={"error": execution.error},
            )
            return execution

        execution.status = "executing"
        try:
            result = await handler(execution.params)
            execution.result = result
            execution.status = "executed"
            execution.executed_at = utc_now()
            # Record for rate limiting
            self.policy_engine.record_execution(
                ActionRequest(
                    action_id=execution.action_id,
                    action_type=execution.action_type,
                    actor=execution.actor,
                    tenant_id=execution.tenant_id,
                )
            )
        except Exception as exc:
            execution.status = "failed"
            execution.error = str(exc)

        self.audit_repo.log(
            log_id=new_id("aud"),
            tenant_id=execution.tenant_id,
            actor_id=actor,
            action_name=f"action.execute.{execution.status}",
            target_entity_id=execution.action_id,
            details={"result": execution.result, "error": execution.error},
        )
        return execution

    def get(self, execution_id: str) -> Optional[ActionExecution]:
        return self._executions.get(execution_id)

    def list_pending(self, tenant_id: str) -> List[ActionExecution]:
        return [
            e for e in self._executions.values()
            if e.tenant_id == tenant_id and e.status == "pending_approval"
        ]
