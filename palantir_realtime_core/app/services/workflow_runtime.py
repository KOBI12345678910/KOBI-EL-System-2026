"""
Workflow Runtime — state-machine execution engine.

Provides:
- WorkflowDefinition: states + transitions + entry/terminal + SLA
- WorkflowInstance: a running instance of a workflow bound to an entity
- WorkflowRuntime: the engine that loads definitions and transitions instances
- Auto-transition on event (event-driven workflows)
- Guard conditions + action hooks
- Approval states (pause until human approves)
- SLA tracking + escalation

Every transition is logged for audit + replay.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class WorkflowStatus(str, Enum):
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkflowState:
    name: str
    description: str = ""
    is_terminal: bool = False
    requires_approval: bool = False
    sla_seconds: Optional[int] = None
    on_enter_hook: Optional[str] = None    # callback name


@dataclass
class WorkflowTransition:
    from_state: str
    to_state: str
    trigger_event: Optional[str] = None   # event type that triggers this
    guard: Optional[str] = None           # guard function name
    action: Optional[str] = None          # action function name
    description: str = ""


@dataclass
class WorkflowDefinition:
    workflow_id: str
    name: str
    version: str
    description: str
    states: List[WorkflowState]
    transitions: List[WorkflowTransition]
    entry_state: str
    tenant_id: Optional[str] = None
    owner: Optional[str] = None


@dataclass
class WorkflowInstance:
    instance_id: str
    workflow_id: str
    tenant_id: str
    canonical_entity_id: Optional[str]
    current_state: str
    context: Dict[str, Any] = field(default_factory=dict)
    status: WorkflowStatus = WorkflowStatus.RUNNING
    owner: Optional[str] = None
    started_at: datetime = field(default_factory=utc_now)
    last_transition_at: datetime = field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None
    history: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class TransitionResult:
    instance: WorkflowInstance
    from_state: str
    to_state: str
    reason: str
    sla_breach: bool = False


class WorkflowError(Exception):
    pass


GuardFn = Callable[[WorkflowInstance, Dict[str, Any]], bool]
ActionFn = Callable[[WorkflowInstance, Dict[str, Any]], Awaitable[None]]
HookFn = Callable[[WorkflowInstance], Awaitable[None]]


class WorkflowRuntime:
    def __init__(self) -> None:
        self._definitions: Dict[str, WorkflowDefinition] = {}
        self._instances: Dict[str, WorkflowInstance] = {}
        self._guards: Dict[str, GuardFn] = {}
        self._actions: Dict[str, ActionFn] = {}
        self._enter_hooks: Dict[str, HookFn] = {}

    def register_definition(self, defn: WorkflowDefinition) -> None:
        self._definitions[defn.workflow_id] = defn

    def register_guard(self, name: str, fn: GuardFn) -> None:
        self._guards[name] = fn

    def register_action(self, name: str, fn: ActionFn) -> None:
        self._actions[name] = fn

    def register_enter_hook(self, name: str, fn: HookFn) -> None:
        self._enter_hooks[name] = fn

    async def start_instance(
        self,
        workflow_id: str,
        tenant_id: str,
        canonical_entity_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        owner: Optional[str] = None,
    ) -> WorkflowInstance:
        defn = self._definitions.get(workflow_id)
        if defn is None:
            raise WorkflowError(f"workflow_not_found:{workflow_id}")

        instance_id = new_id("wfi")
        instance = WorkflowInstance(
            instance_id=instance_id,
            workflow_id=workflow_id,
            tenant_id=tenant_id,
            canonical_entity_id=canonical_entity_id,
            current_state=defn.entry_state,
            context=context or {},
            owner=owner,
        )
        self._instances[instance_id] = instance

        instance.history.append({
            "from_state": None,
            "to_state": defn.entry_state,
            "reason": "instance_started",
            "occurred_at": utc_now().isoformat(),
        })

        # SLA tracking for entry state
        state = self._find_state(defn, defn.entry_state)
        if state and state.sla_seconds:
            instance.sla_deadline = utc_now() + timedelta(seconds=state.sla_seconds)

        # Enter hook
        if state and state.on_enter_hook:
            hook = self._enter_hooks.get(state.on_enter_hook)
            if hook is not None:
                await hook(instance)

        # Approval state?
        if state and state.requires_approval:
            instance.status = WorkflowStatus.WAITING_APPROVAL

        return instance

    async def handle_event(
        self,
        *,
        tenant_id: str,
        canonical_entity_id: str,
        event_type: str,
        event_payload: Dict[str, Any],
    ) -> List[TransitionResult]:
        """Transition every matching instance on the given event."""
        results: List[TransitionResult] = []
        for inst in list(self._instances.values()):
            if inst.tenant_id != tenant_id:
                continue
            if inst.canonical_entity_id != canonical_entity_id:
                continue
            if inst.status not in (WorkflowStatus.RUNNING, WorkflowStatus.WAITING_APPROVAL):
                continue
            defn = self._definitions.get(inst.workflow_id)
            if defn is None:
                continue
            for tr in defn.transitions:
                if tr.from_state != inst.current_state:
                    continue
                if tr.trigger_event and tr.trigger_event != event_type:
                    continue
                # Guard
                if tr.guard:
                    g = self._guards.get(tr.guard)
                    if g is not None and not g(inst, event_payload):
                        continue
                # Execute transition
                result = await self._transition(inst, defn, tr, event_payload, reason=f"event:{event_type}")
                results.append(result)
                break
        return results

    async def manual_transition(
        self,
        instance_id: str,
        to_state: str,
        *,
        actor: str,
        reason: str = "manual",
    ) -> TransitionResult:
        inst = self._instances.get(instance_id)
        if inst is None:
            raise WorkflowError(f"instance_not_found:{instance_id}")
        defn = self._definitions.get(inst.workflow_id)
        if defn is None:
            raise WorkflowError(f"definition_not_found:{inst.workflow_id}")
        tr = next(
            (t for t in defn.transitions if t.from_state == inst.current_state and t.to_state == to_state),
            None,
        )
        if tr is None:
            raise WorkflowError(f"no_transition:{inst.current_state}->{to_state}")
        return await self._transition(inst, defn, tr, {"actor": actor}, reason=f"manual:{reason}")

    async def approve(self, instance_id: str, approver: str) -> TransitionResult:
        inst = self._instances.get(instance_id)
        if inst is None:
            raise WorkflowError(f"instance_not_found:{instance_id}")
        if inst.status != WorkflowStatus.WAITING_APPROVAL:
            raise WorkflowError(f"not_waiting_approval:{inst.status}")
        defn = self._definitions.get(inst.workflow_id)
        if defn is None:
            raise WorkflowError(f"definition_not_found")
        # Find auto-transition from current state that doesn't require triggered event
        tr = next(
            (t for t in defn.transitions if t.from_state == inst.current_state and t.trigger_event is None),
            None,
        )
        if tr is None:
            raise WorkflowError(f"no_post_approval_transition")
        inst.status = WorkflowStatus.RUNNING
        return await self._transition(inst, defn, tr, {"approver": approver}, reason="approved")

    async def _transition(
        self,
        inst: WorkflowInstance,
        defn: WorkflowDefinition,
        tr: WorkflowTransition,
        payload: Dict[str, Any],
        *,
        reason: str,
    ) -> TransitionResult:
        from_state = inst.current_state
        to_state = tr.to_state

        # Run action hook
        if tr.action:
            action = self._actions.get(tr.action)
            if action is not None:
                await action(inst, payload)

        # SLA breach check
        sla_breach = (
            inst.sla_deadline is not None and utc_now() > inst.sla_deadline
        )

        # Transition
        inst.current_state = to_state
        inst.last_transition_at = utc_now()
        inst.history.append({
            "from_state": from_state,
            "to_state": to_state,
            "reason": reason,
            "sla_breach": sla_breach,
            "occurred_at": utc_now().isoformat(),
        })

        # New state SLA
        new_state = self._find_state(defn, to_state)
        if new_state and new_state.sla_seconds:
            inst.sla_deadline = utc_now() + timedelta(seconds=new_state.sla_seconds)
        else:
            inst.sla_deadline = None

        # Approval required?
        if new_state and new_state.requires_approval:
            inst.status = WorkflowStatus.WAITING_APPROVAL

        # Terminal?
        if new_state and new_state.is_terminal:
            inst.status = WorkflowStatus.COMPLETED
            inst.completed_at = utc_now()

        # Enter hook
        if new_state and new_state.on_enter_hook:
            hook = self._enter_hooks.get(new_state.on_enter_hook)
            if hook is not None:
                await hook(inst)

        return TransitionResult(
            instance=inst,
            from_state=from_state,
            to_state=to_state,
            reason=reason,
            sla_breach=sla_breach,
        )

    def _find_state(self, defn: WorkflowDefinition, name: str) -> Optional[WorkflowState]:
        return next((s for s in defn.states if s.name == name), None)

    def get_instance(self, instance_id: str) -> Optional[WorkflowInstance]:
        return self._instances.get(instance_id)

    def list_for_entity(self, canonical_entity_id: str) -> List[WorkflowInstance]:
        return [i for i in self._instances.values() if i.canonical_entity_id == canonical_entity_id]

    def list_stalled(self, tenant_id: str) -> List[WorkflowInstance]:
        now = utc_now()
        return [
            i for i in self._instances.values()
            if i.tenant_id == tenant_id
            and i.status == WorkflowStatus.RUNNING
            and i.sla_deadline is not None
            and now > i.sla_deadline
        ]
