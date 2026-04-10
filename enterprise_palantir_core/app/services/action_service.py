"""
Action Service — autonomous action execution with guardrails.

Actions are the "write-back" side of the platform. Instead of just
observing state, the platform can take actions — with all the
enterprise-grade guardrails:

  - validation (input schema)
  - policy checks (max financial impact, daily limits, required roles)
  - approval gating (high-risk actions require explicit approval)
  - execution via registered handlers
  - audit (every action recorded + hash-chained)
  - rollback (actions that support it expose an undo handle)

This is the "action" in Palantir's "ontology + actions" model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.enums import ActionStatus
from app.core.exceptions import ActionPolicyViolation, PermissionDenied
from app.core.ids import action_id as _action_id
from app.core.time_utils import utc_now
from app.repositories.audit_repo import AuditRepository
from app.security import Principal


@dataclass
class ActionDefinition:
    action_type: str
    description: str
    required_permissions: List[str] = field(default_factory=list)
    requires_approval: bool = False
    max_financial_impact: Optional[float] = None
    daily_limit: Optional[int] = None
    supports_rollback: bool = False


@dataclass
class ActionExecution:
    action_id: str
    tenant_id: str
    action_type: str
    actor: str
    params: Dict[str, Any]
    status: str = ActionStatus.REQUESTED.value
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    audit_id: Optional[str] = None
    rollback_handle: Optional[str] = None
    created_at: datetime = field(default_factory=utc_now)


ActionHandler = Callable[[Dict[str, Any], Principal], Awaitable[Dict[str, Any]]]


class ActionService:
    def __init__(self, session: Session):
        self.s = session
        self.audit = AuditRepository(session)
        self._definitions: Dict[str, ActionDefinition] = {}
        self._handlers: Dict[str, ActionHandler] = {}
        self._executions: Dict[str, ActionExecution] = {}
        self._daily_counts: Dict[str, int] = {}

    def register_definition(self, defn: ActionDefinition) -> None:
        self._definitions[defn.action_type] = defn

    def register_handler(self, action_type: str, handler: ActionHandler) -> None:
        self._handlers[action_type] = handler

    # ─── Request → validate → policy → approve? → execute ────
    def request_action(
        self,
        *,
        principal: Principal,
        tenant_id: str,
        action_type: str,
        params: Dict[str, Any],
    ) -> ActionExecution:
        defn = self._definitions.get(action_type)
        if defn is None:
            raise ActionPolicyViolation(f"unknown_action_type:{action_type}")

        # Permission check
        for p in defn.required_permissions:
            if p not in {x.value for x in principal.permissions} and not principal.is_platform_admin:
                raise PermissionDenied(f"missing_permission:{p}")

        # Financial impact policy
        if defn.max_financial_impact is not None:
            impact = float(params.get("financial_impact", 0) or 0)
            if abs(impact) > defn.max_financial_impact:
                raise ActionPolicyViolation(
                    f"financial_impact_{impact}_exceeds_limit_{defn.max_financial_impact}"
                )

        # Daily limit
        if defn.daily_limit is not None:
            key = f"{action_type}:{utc_now().strftime('%Y-%m-%d')}"
            if self._daily_counts.get(key, 0) >= defn.daily_limit:
                raise ActionPolicyViolation(f"daily_limit_reached_{defn.daily_limit}")

        execution = ActionExecution(
            action_id=_action_id(),
            tenant_id=tenant_id,
            action_type=action_type,
            actor=principal.user_id,
            params=dict(params),
        )

        if defn.requires_approval:
            execution.status = ActionStatus.PENDING_APPROVAL.value
        else:
            execution.status = ActionStatus.APPROVED.value

        self._executions[execution.action_id] = execution

        audit = self.audit.append(
            tenant_id=tenant_id,
            actor=principal.user_id,
            action="action.request",
            resource_type="action",
            resource_id=execution.action_id,
            payload={"action_type": action_type, "params": params},
            granted=True,
        )
        execution.audit_id = audit.audit_id
        return execution

    def approve(
        self, *, execution_id: str, approver: Principal
    ) -> ActionExecution:
        execution = self._executions.get(execution_id)
        if execution is None:
            raise ActionPolicyViolation(f"execution_not_found:{execution_id}")
        if execution.status != ActionStatus.PENDING_APPROVAL.value:
            raise ActionPolicyViolation(f"not_pending_approval:{execution.status}")
        execution.status = ActionStatus.APPROVED.value
        execution.approved_by = approver.user_id
        execution.approved_at = utc_now()
        self.audit.append(
            tenant_id=execution.tenant_id,
            actor=approver.user_id,
            action="action.approve",
            resource_type="action",
            resource_id=execution.action_id,
            payload={"action_type": execution.action_type},
            granted=True,
        )
        return execution

    async def execute(
        self, *, execution_id: str, principal: Principal
    ) -> ActionExecution:
        execution = self._executions.get(execution_id)
        if execution is None:
            raise ActionPolicyViolation(f"execution_not_found:{execution_id}")
        if execution.status != ActionStatus.APPROVED.value:
            raise ActionPolicyViolation(f"not_approved:{execution.status}")

        handler = self._handlers.get(execution.action_type)
        if handler is None:
            execution.status = ActionStatus.FAILED.value
            execution.error = f"no_handler:{execution.action_type}"
            self.audit.append(
                tenant_id=execution.tenant_id,
                actor=principal.user_id,
                action="action.execute.failed",
                resource_type="action",
                resource_id=execution.action_id,
                payload={"error": execution.error},
                granted=False,
                deny_reason=execution.error,
            )
            return execution

        execution.status = ActionStatus.EXECUTING.value
        try:
            result = await handler(execution.params, principal)
            execution.result = result
            execution.status = ActionStatus.EXECUTED.value
            execution.executed_at = utc_now()
            # daily count bump
            defn = self._definitions.get(execution.action_type)
            if defn and defn.daily_limit is not None:
                key = f"{execution.action_type}:{utc_now().strftime('%Y-%m-%d')}"
                self._daily_counts[key] = self._daily_counts.get(key, 0) + 1
            self.audit.append(
                tenant_id=execution.tenant_id,
                actor=principal.user_id,
                action="action.execute.success",
                resource_type="action",
                resource_id=execution.action_id,
                payload={"result": result},
                granted=True,
            )
        except Exception as exc:
            execution.status = ActionStatus.FAILED.value
            execution.error = str(exc)
            self.audit.append(
                tenant_id=execution.tenant_id,
                actor=principal.user_id,
                action="action.execute.failed",
                resource_type="action",
                resource_id=execution.action_id,
                payload={"error": str(exc)},
                granted=False,
                deny_reason=str(exc),
            )
        return execution

    def get(self, execution_id: str) -> Optional[ActionExecution]:
        return self._executions.get(execution_id)

    def list_pending(self, tenant_id: str) -> List[ActionExecution]:
        return [
            e for e in self._executions.values()
            if e.tenant_id == tenant_id and e.status == ActionStatus.PENDING_APPROVAL.value
        ]
