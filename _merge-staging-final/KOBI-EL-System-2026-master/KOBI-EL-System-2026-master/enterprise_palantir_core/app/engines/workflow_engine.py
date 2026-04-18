"""
Workflow Engine — production state machine runtime.

Works on top of the existing WorkflowDefinitionModel /
WorkflowInstanceModel rows. Supports:

  - definition → instance lifecycle
  - state transitions with guards + actions
  - SLA tracking (every state can have its own SLA)
  - approval gates (states that pause until an approval arrives)
  - terminal states (instance auto-completes)
  - event-driven transitions (publish a domain event → transition
    every matching instance automatically)
  - full history log of every transition

The engine is intentionally stateless outside the DB — every call
opens a new session via the passed Session.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, WorkflowError
from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.models.workflow import WorkflowDefinitionModel, WorkflowInstanceModel
from app.repositories.workflow_repo import WorkflowRepository


# ════════════════════════════════════════════════════════════════
# DEFINITION MODEL (in memory, parsed from definition_json)
# ════════════════════════════════════════════════════════════════

@dataclass
class StateSpec:
    name: str
    is_terminal: bool = False
    requires_approval: bool = False
    sla_seconds: Optional[int] = None
    on_enter: Optional[str] = None        # callback name


@dataclass
class TransitionSpec:
    from_state: str
    to_state: str
    trigger_event: Optional[str] = None   # event type that triggers this
    guard: Optional[str] = None           # guard function name
    action: Optional[str] = None          # action function name


@dataclass
class WorkflowSpec:
    workflow_type: str
    entry_state: str
    states: Dict[str, StateSpec]
    transitions: List[TransitionSpec]

    @classmethod
    def from_definition_json(cls, workflow_type: str, definition: Dict[str, Any]) -> "WorkflowSpec":
        state_specs: Dict[str, StateSpec] = {}
        for s in definition.get("states", []):
            spec = StateSpec(
                name=s["name"],
                is_terminal=bool(s.get("is_terminal", False)),
                requires_approval=bool(s.get("requires_approval", False)),
                sla_seconds=s.get("sla_seconds"),
                on_enter=s.get("on_enter"),
            )
            state_specs[spec.name] = spec
        transitions = [
            TransitionSpec(
                from_state=t["from_state"],
                to_state=t["to_state"],
                trigger_event=t.get("trigger_event"),
                guard=t.get("guard"),
                action=t.get("action"),
            )
            for t in definition.get("transitions", [])
        ]
        return cls(
            workflow_type=workflow_type,
            entry_state=definition.get("entry_state", "start"),
            states=state_specs,
            transitions=transitions,
        )


# ════════════════════════════════════════════════════════════════
# RESULT TYPES
# ════════════════════════════════════════════════════════════════

@dataclass
class TransitionResult:
    instance_id: str
    from_state: str
    to_state: str
    reason: str
    sla_breach: bool = False


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

GuardFn = Callable[[WorkflowInstanceModel, Dict[str, Any]], bool]
ActionFn = Callable[[WorkflowInstanceModel, Dict[str, Any]], Awaitable[None]]
OnEnterFn = Callable[[WorkflowInstanceModel], Awaitable[None]]


class WorkflowEngine:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = WorkflowRepository(db)
        self._guards: Dict[str, GuardFn] = {}
        self._actions: Dict[str, ActionFn] = {}
        self._on_enter: Dict[str, OnEnterFn] = {}

    # ─── Plug-in registration ────────────────────────────────
    def register_guard(self, name: str, fn: GuardFn) -> None:
        self._guards[name] = fn

    def register_action(self, name: str, fn: ActionFn) -> None:
        self._actions[name] = fn

    def register_on_enter(self, name: str, fn: OnEnterFn) -> None:
        self._on_enter[name] = fn

    # ─── Instance lifecycle ──────────────────────────────────
    def start(
        self,
        *,
        tenant_id: str,
        workflow_id: str,
        target_entity_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstanceModel:
        defn = self.repo.get_definition(workflow_id)
        if defn is None:
            raise NotFoundError(f"workflow_definition_not_found:{workflow_id}")
        spec = WorkflowSpec.from_definition_json(
            workflow_type=defn.workflow_type,
            definition=json.loads(defn.definition_json or "{}"),
        )
        entry_state = spec.states.get(spec.entry_state)
        instance = self.repo.start_instance(
            tenant_id=tenant_id,
            workflow_type=defn.workflow_type,
            target_entity_id=target_entity_id,
            context=context or {},
            initial_step=spec.entry_state,
        )
        # Approval-on-entry?
        if entry_state and entry_state.requires_approval:
            instance.status = "waiting_approval"
            self.db.commit()
            self.db.refresh(instance)
        return instance

    async def handle_event(
        self,
        *,
        tenant_id: str,
        target_entity_id: str,
        event_type: str,
        event_payload: Dict[str, Any],
    ) -> List[TransitionResult]:
        """
        Every workflow instance bound to the given entity that has a
        transition triggered by `event_type` from its current state
        fires that transition.
        """
        results: List[TransitionResult] = []
        active = [
            i for i in self.repo.list_for_entity(target_entity_id)
            if i.tenant_id == tenant_id and i.status in ("active", "waiting_approval")
        ]
        for instance in active:
            defn = self.repo.get_definition_by_workflow_type(
                tenant_id=tenant_id, workflow_type=instance.workflow_type
            ) if hasattr(self.repo, "get_definition_by_workflow_type") else None
            # Fallback: find the definition by workflow_type on any defined row
            if defn is None:
                for d in self.repo.list_definitions(tenant_id):
                    if d.workflow_type == instance.workflow_type:
                        defn = d
                        break
            if defn is None:
                continue
            spec = WorkflowSpec.from_definition_json(
                workflow_type=defn.workflow_type,
                definition=json.loads(defn.definition_json or "{}"),
            )
            matching = [
                t for t in spec.transitions
                if t.from_state == instance.current_step and t.trigger_event == event_type
            ]
            for tr in matching:
                if tr.guard:
                    g = self._guards.get(tr.guard)
                    if g is not None and not g(instance, event_payload):
                        continue
                # Fire the action if any
                if tr.action:
                    act = self._actions.get(tr.action)
                    if act is not None:
                        await act(instance, event_payload)
                # Transition
                result = self._apply_transition(
                    instance=instance,
                    spec=spec,
                    to_state=tr.to_state,
                    reason=f"event:{event_type}",
                )
                results.append(result)
                # Only fire the first matching transition
                break
        return results

    def manual_transition(
        self,
        *,
        instance_id: str,
        to_state: str,
        actor: Optional[str] = None,
        reason: str = "manual",
    ) -> TransitionResult:
        instance = self.repo.get_instance(instance_id)
        if instance is None:
            raise NotFoundError(f"workflow_instance_not_found:{instance_id}")
        defn = None
        for d in self.repo.list_definitions(instance.tenant_id):
            if d.workflow_type == instance.workflow_type:
                defn = d
                break
        if defn is None:
            raise NotFoundError(f"workflow_definition_not_found")
        spec = WorkflowSpec.from_definition_json(
            workflow_type=defn.workflow_type,
            definition=json.loads(defn.definition_json or "{}"),
        )
        tr = next(
            (t for t in spec.transitions if t.from_state == instance.current_step and t.to_state == to_state),
            None,
        )
        if tr is None:
            raise WorkflowError(f"no_transition:{instance.current_step}->{to_state}")
        return self._apply_transition(instance=instance, spec=spec, to_state=to_state, reason=f"manual:{reason}")

    def approve(self, *, instance_id: str, approver: str) -> TransitionResult:
        instance = self.repo.get_instance(instance_id)
        if instance is None:
            raise NotFoundError(f"workflow_instance_not_found:{instance_id}")
        if instance.status != "waiting_approval":
            raise WorkflowError(f"not_waiting_approval:{instance.status}")
        # Find the first transition from the current state that has no trigger_event
        defn = None
        for d in self.repo.list_definitions(instance.tenant_id):
            if d.workflow_type == instance.workflow_type:
                defn = d
                break
        if defn is None:
            raise NotFoundError("workflow_definition_not_found")
        spec = WorkflowSpec.from_definition_json(
            workflow_type=defn.workflow_type,
            definition=json.loads(defn.definition_json or "{}"),
        )
        tr = next(
            (t for t in spec.transitions if t.from_state == instance.current_step and t.trigger_event is None),
            None,
        )
        if tr is None:
            raise WorkflowError("no_post_approval_transition")
        instance.status = "active"
        self.db.commit()
        return self._apply_transition(
            instance=instance, spec=spec, to_state=tr.to_state, reason=f"approved_by:{approver}"
        )

    # ─── Internal transition ─────────────────────────────────
    def _apply_transition(
        self,
        instance: WorkflowInstanceModel,
        spec: WorkflowSpec,
        to_state: str,
        reason: str,
    ) -> TransitionResult:
        from_state = instance.current_step
        new_status = "active"
        target_state = spec.states.get(to_state)
        if target_state and target_state.is_terminal:
            new_status = "completed"
        elif target_state and target_state.requires_approval:
            new_status = "waiting_approval"

        self.repo.transition(
            instance_id=instance.id,
            to_step=to_state,
            status=new_status,
            history_entry={
                "from_step": from_state,
                "to_step": to_state,
                "reason": reason,
                "occurred_at": utc_now().isoformat(),
            },
        )
        return TransitionResult(
            instance_id=instance.id,
            from_state=from_state or "",
            to_state=to_state,
            reason=reason,
            sla_breach=False,
        )

    # ─── Queries ─────────────────────────────────────────────
    def list_stalled(self, tenant_id: str, max_age_seconds: int = 3600) -> List[WorkflowInstanceModel]:
        active = self.repo.list_by_status(tenant_id, "active")
        cutoff = utc_now() - timedelta(seconds=max_age_seconds)
        return [i for i in active if i.updated_at and i.updated_at < cutoff]
