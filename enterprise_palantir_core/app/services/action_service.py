"""
Action Service — autonomous action execution with guardrails.

Actions are the write-back side of the platform. Every action is
recorded in the audit log, so every external side-effect has a
traceable audit entry.
"""

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.repositories.audit_repo import AuditRepository
from app.core.enums import ActionMode


ActionHandler = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class ActionDefinition:
    action_type: str
    description: str
    required_permissions: List[str] = field(default_factory=list)
    mode: ActionMode = ActionMode.MANUAL
    max_financial_impact: Optional[float] = None


@dataclass
class ActionExecution:
    action_id: str
    tenant_id: str
    action_type: str
    actor: str
    params: Dict[str, Any]
    status: str = "requested"
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    audit_id: Optional[str] = None


class ActionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditRepository(db)
        self._definitions: Dict[str, ActionDefinition] = {}
        self._handlers: Dict[str, ActionHandler] = {}
        self._executions: Dict[str, ActionExecution] = {}

    def register_definition(self, defn: ActionDefinition) -> None:
        self._definitions[defn.action_type] = defn

    def register_handler(self, action_type: str, handler: ActionHandler) -> None:
        self._handlers[action_type] = handler

    def request(
        self,
        *,
        tenant_id: str,
        actor: str,
        action_type: str,
        params: Dict[str, Any],
    ) -> ActionExecution:
        defn = self._definitions.get(action_type)
        if defn is None:
            raise ValueError(f"unknown_action_type:{action_type}")
        if defn.max_financial_impact is not None:
            impact = float(params.get("financial_impact", 0) or 0)
            if abs(impact) > defn.max_financial_impact:
                raise ValueError(
                    f"financial_impact_{impact}_exceeds_limit_{defn.max_financial_impact}"
                )

        execution = ActionExecution(
            action_id=new_id("act"),
            tenant_id=tenant_id,
            action_type=action_type,
            actor=actor,
            params=dict(params),
            status="approved" if defn.mode == ActionMode.AUTONOMOUS else "pending_approval",
        )
        self._executions[execution.action_id] = execution

        audit = self.audit.log(
            log_id=new_id("aud"),
            tenant_id=tenant_id,
            actor_id=actor,
            action_name="action.request",
            target_entity_id=execution.action_id,
            details={"action_type": action_type, "params": params},
        )
        execution.audit_id = audit.id
        return execution

    async def execute(self, *, execution_id: str, actor: str) -> ActionExecution:
        execution = self._executions.get(execution_id)
        if execution is None:
            raise ValueError(f"execution_not_found:{execution_id}")
        handler = self._handlers.get(execution.action_type)
        if handler is None:
            execution.status = "failed"
            execution.error = f"no_handler:{execution.action_type}"
            return execution
        try:
            result = await handler(execution.params)
            execution.result = result
            execution.status = "executed"
        except Exception as exc:
            execution.status = "failed"
            execution.error = str(exc)
        self.audit.log(
            log_id=new_id("aud"),
            tenant_id=execution.tenant_id,
            actor_id=actor,
            action_name=f"action.{execution.status}",
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
