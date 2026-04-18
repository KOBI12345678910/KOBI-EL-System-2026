# UNBLOCK TASK #6 — Safety Guardrails Layer

## For: Replit Claude working on AI Performance Director

This is the complete, executable specification for Task #6. Paste this
into Replit Claude as a new message and tell it:

> "Execute this specification exactly. Do not deviate. Do not create
> additional tasks. Do not wait for approval between files. When every
> file listed below exists and passes its acceptance test, mark Task #6
> as Done and unblock its dependents."

---

## 1. Why this task has been stuck

**Diagnosis (from the task board):**
- #6 is the Active task with 7+ dependents blocked on it
- The title is ambiguous ("Safety Guardrails Layer + Self-...")
- There is no concrete file list, interface contract, or acceptance
  test — so every attempt creates duplicates (#8 CANCELLED, #35 Cleanup
  Duplicates) and loops on git conflicts (#5 task resolving git conflicts)
- Replit Claude keeps context-switching between related concerns
  (validation, policy, rollback, rate limit, audit) because there is no
  single source of truth for "what is Safety Guardrails Layer"

**Fix:** this document is the single source of truth. Everything needed
to complete Task #6 is below. No further discovery, planning, or
decomposition is required.

---

## 2. Scope of Task #6 — exactly what ships

The Safety Guardrails Layer is a **single module** with **six concerns**,
all implemented in one directory, with one public entry point.

```
safety_guardrails/
├── __init__.py
├── types.py           # Action, Policy, GuardrailDecision, Severity
├── validator.py       # schema + input validation
├── policy_engine.py   # rule-based policy decisions (allow/warn/block)
├── rate_limiter.py    # per-actor + per-action-type rate limits
├── approval_gate.py   # actions requiring human approval
├── rollback.py        # rollback handle + execute
├── audit.py           # hash-chained immutable audit log
└── guardrail.py       # public entry point: Guardrail.check(action) -> Decision
```

Tests:

```
safety_guardrails/tests/
├── test_validator.py
├── test_policy_engine.py
├── test_rate_limiter.py
├── test_approval_gate.py
├── test_rollback.py
├── test_audit.py
└── test_guardrail_e2e.py
```

Entry point contract (this is what every blocked task depends on):

```python
from safety_guardrails import Guardrail, Action, GuardrailDecision

guardrail = Guardrail()

decision: GuardrailDecision = guardrail.check(
    action=Action(
        action_id="act_123",
        action_type="execute_trade",     # any string
        actor="user_42",
        tenant_id="tenant_alpha",
        payload={"symbol": "AAPL", "qty": 100},
        estimated_impact={"usd": 15000},
    )
)

assert decision.status in ("allow", "warn", "block", "require_approval")
assert decision.reasons   # list of strings
assert decision.audit_id  # audit log entry id
```

**This interface is the acceptance contract.** If it exists and behaves
correctly, Task #6 is Done.

---

## 3. Concrete implementation — drop-in ready

### 3.1 `safety_guardrails/types.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    BLOCKER = "blocker"


class DecisionStatus(str, Enum):
    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"
    REQUIRE_APPROVAL = "require_approval"


@dataclass
class Action:
    action_id: str
    action_type: str
    actor: str
    tenant_id: str
    payload: Dict[str, Any] = field(default_factory=dict)
    estimated_impact: Dict[str, Any] = field(default_factory=dict)
    requires_approval: bool = False
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Policy:
    policy_id: str
    name: str
    action_type_match: str              # e.g. "execute_trade", "*"
    max_impact_usd: Optional[float] = None
    max_per_minute: Optional[int] = None
    max_per_day: Optional[int] = None
    requires_approval: bool = False
    required_roles: List[str] = field(default_factory=list)
    blocked_actors: List[str] = field(default_factory=list)
    enabled: bool = True


@dataclass
class GuardrailDecision:
    action_id: str
    status: DecisionStatus
    reasons: List[str]
    violated_policies: List[str]
    severity: Severity
    audit_id: Optional[str] = None
    rollback_handle: Optional[str] = None
    evaluated_at: datetime = field(default_factory=utc_now)
```

### 3.2 `safety_guardrails/validator.py`

```python
from __future__ import annotations
from typing import List, Tuple
from .types import Action


REQUIRED_FIELDS = ["action_id", "action_type", "actor", "tenant_id"]


def validate(action: Action) -> Tuple[bool, List[str]]:
    issues: List[str] = []
    for f in REQUIRED_FIELDS:
        v = getattr(action, f, None)
        if not v:
            issues.append(f"missing_required_field:{f}")
    if not isinstance(action.payload, dict):
        issues.append("payload_must_be_dict")
    if not isinstance(action.estimated_impact, dict):
        issues.append("estimated_impact_must_be_dict")
    return (len(issues) == 0, issues)
```

### 3.3 `safety_guardrails/policy_engine.py`

```python
from __future__ import annotations
from typing import Dict, List, Tuple

from .types import Action, DecisionStatus, Policy, Severity


class PolicyEngine:
    def __init__(self) -> None:
        self.policies: Dict[str, Policy] = {}

    def register(self, policy: Policy) -> None:
        self.policies[policy.policy_id] = policy

    def evaluate(self, action: Action) -> Tuple[DecisionStatus, List[str], List[str], Severity]:
        reasons: List[str] = []
        violated: List[str] = []
        severity = Severity.INFO
        status = DecisionStatus.ALLOW

        for p in self.policies.values():
            if not p.enabled:
                continue
            if p.action_type_match != "*" and p.action_type_match != action.action_type:
                continue

            # Blocked actors → hard block
            if action.actor in p.blocked_actors:
                violated.append(p.policy_id)
                reasons.append(f"actor_blocked_by:{p.name}")
                status = DecisionStatus.BLOCK
                severity = Severity.BLOCKER

            # Max financial impact
            if p.max_impact_usd is not None:
                usd = float(action.estimated_impact.get("usd", 0) or 0)
                if abs(usd) > p.max_impact_usd:
                    violated.append(p.policy_id)
                    reasons.append(
                        f"financial_impact_{usd}_exceeds_{p.max_impact_usd}_by:{p.name}"
                    )
                    status = DecisionStatus.BLOCK
                    severity = Severity.CRITICAL

            # Approval requirement
            if p.requires_approval:
                reasons.append(f"approval_required_by:{p.name}")
                if status == DecisionStatus.ALLOW:
                    status = DecisionStatus.REQUIRE_APPROVAL
                    severity = Severity.WARNING

        return status, reasons, violated, severity
```

### 3.4 `safety_guardrails/rate_limiter.py`

```python
from __future__ import annotations
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from .types import Action


class RateLimiter:
    """Sliding-window rate limiter keyed by (actor, action_type)."""

    def __init__(self) -> None:
        self._events: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)

    def _key(self, action: Action) -> Tuple[str, str]:
        return (action.actor, action.action_type)

    def record(self, action: Action) -> None:
        self._events[self._key(action)].append(time.time())

    def count_in_window(self, action: Action, window_seconds: int) -> int:
        key = self._key(action)
        now = time.time()
        q = self._events[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        return len(q)

    def exceeds(self, action: Action, max_per_minute: int | None, max_per_day: int | None) -> tuple[bool, str | None]:
        if max_per_minute is not None:
            c = self.count_in_window(action, 60)
            if c >= max_per_minute:
                return True, f"rate_limit_per_minute_{max_per_minute}_exceeded_current_{c}"
        if max_per_day is not None:
            c = self.count_in_window(action, 86400)
            if c >= max_per_day:
                return True, f"rate_limit_per_day_{max_per_day}_exceeded_current_{c}"
        return False, None
```

### 3.5 `safety_guardrails/approval_gate.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

from .types import Action, utc_now


@dataclass
class ApprovalRequest:
    request_id: str
    action_id: str
    actor: str
    tenant_id: str
    reason: str
    status: str = "pending"   # pending|approved|rejected
    approved_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=utc_now)


class ApprovalGate:
    def __init__(self) -> None:
        self.requests: Dict[str, ApprovalRequest] = {}

    def request(self, action: Action, reason: str) -> ApprovalRequest:
        req = ApprovalRequest(
            request_id=f"appr_{action.action_id}",
            action_id=action.action_id,
            actor=action.actor,
            tenant_id=action.tenant_id,
            reason=reason,
        )
        self.requests[req.request_id] = req
        return req

    def approve(self, request_id: str, approver: str) -> Optional[ApprovalRequest]:
        req = self.requests.get(request_id)
        if req and req.status == "pending":
            req.status = "approved"
            req.approved_by = approver
            req.decided_at = utc_now()
        return req

    def reject(self, request_id: str, approver: str) -> Optional[ApprovalRequest]:
        req = self.requests.get(request_id)
        if req and req.status == "pending":
            req.status = "rejected"
            req.approved_by = approver
            req.decided_at = utc_now()
        return req

    def is_approved(self, action_id: str) -> bool:
        req = self.requests.get(f"appr_{action_id}")
        return req is not None and req.status == "approved"
```

### 3.6 `safety_guardrails/rollback.py`

```python
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from .types import utc_now


@dataclass
class RollbackHandle:
    handle_id: str
    action_id: str
    undo_callback_name: str
    undo_params: Dict[str, Any]
    executed: bool = False
    executed_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=utc_now)


class RollbackRegistry:
    def __init__(self) -> None:
        self.handles: Dict[str, RollbackHandle] = {}
        self.callbacks: Dict[str, Callable[..., Any]] = {}

    def register_callback(self, name: str, fn: Callable[..., Any]) -> None:
        self.callbacks[name] = fn

    def create_handle(
        self, action_id: str, undo_callback_name: str, undo_params: Dict[str, Any]
    ) -> RollbackHandle:
        h = RollbackHandle(
            handle_id=f"rb_{action_id}",
            action_id=action_id,
            undo_callback_name=undo_callback_name,
            undo_params=undo_params,
        )
        self.handles[h.handle_id] = h
        return h

    def execute(self, handle_id: str) -> bool:
        h = self.handles.get(handle_id)
        if h is None or h.executed:
            return False
        cb = self.callbacks.get(h.undo_callback_name)
        if cb is None:
            return False
        try:
            cb(**h.undo_params)
            h.executed = True
            h.executed_at = utc_now()
            return True
        except Exception:
            return False
```

### 3.7 `safety_guardrails/audit.py`

```python
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from .types import utc_now


@dataclass
class AuditEntry:
    audit_id: str
    tenant_id: str
    actor: str
    action_type: str
    action_id: str
    decision_status: str
    reasons: List[str]
    prev_hash: Optional[str]
    this_hash: str
    occurred_at: datetime = field(default_factory=utc_now)


class AuditLog:
    def __init__(self) -> None:
        self.entries: List[AuditEntry] = []

    def _last_hash(self) -> Optional[str]:
        return self.entries[-1].this_hash if self.entries else None

    def append(
        self,
        tenant_id: str,
        actor: str,
        action_type: str,
        action_id: str,
        decision_status: str,
        reasons: List[str],
    ) -> AuditEntry:
        prev = self._last_hash()
        audit_id = f"aud_{len(self.entries) + 1}"
        body = {
            "audit_id": audit_id,
            "tenant_id": tenant_id,
            "actor": actor,
            "action_type": action_type,
            "action_id": action_id,
            "decision_status": decision_status,
            "reasons": reasons,
            "prev_hash": prev,
        }
        this_hash = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        entry = AuditEntry(
            audit_id=audit_id,
            tenant_id=tenant_id,
            actor=actor,
            action_type=action_type,
            action_id=action_id,
            decision_status=decision_status,
            reasons=reasons,
            prev_hash=prev,
            this_hash=this_hash,
        )
        self.entries.append(entry)
        return entry

    def verify_chain(self) -> bool:
        prev = None
        for e in self.entries:
            body = {
                "audit_id": e.audit_id,
                "tenant_id": e.tenant_id,
                "actor": e.actor,
                "action_type": e.action_type,
                "action_id": e.action_id,
                "decision_status": e.decision_status,
                "reasons": e.reasons,
                "prev_hash": prev,
            }
            expected = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
            if expected != e.this_hash:
                return False
            prev = e.this_hash
        return True
```

### 3.8 `safety_guardrails/guardrail.py` — public entry point

```python
from __future__ import annotations
from typing import List

from .approval_gate import ApprovalGate
from .audit import AuditLog
from .policy_engine import PolicyEngine
from .rate_limiter import RateLimiter
from .rollback import RollbackRegistry
from .types import Action, DecisionStatus, GuardrailDecision, Policy, Severity
from .validator import validate


class Guardrail:
    def __init__(self) -> None:
        self.policies = PolicyEngine()
        self.rate_limiter = RateLimiter()
        self.approval_gate = ApprovalGate()
        self.rollback = RollbackRegistry()
        self.audit = AuditLog()

    def register_policy(self, policy: Policy) -> None:
        self.policies.register(policy)

    def check(self, action: Action) -> GuardrailDecision:
        reasons: List[str] = []
        violated: List[str] = []

        # 1. Validation
        ok, val_issues = validate(action)
        if not ok:
            reasons.extend(val_issues)
            entry = self.audit.append(
                action.tenant_id, action.actor, action.action_type,
                action.action_id, DecisionStatus.BLOCK.value, reasons,
            )
            return GuardrailDecision(
                action_id=action.action_id,
                status=DecisionStatus.BLOCK,
                reasons=reasons,
                violated_policies=[],
                severity=Severity.BLOCKER,
                audit_id=entry.audit_id,
            )

        # 2. Policies
        status, policy_reasons, policy_violated, policy_severity = self.policies.evaluate(action)
        reasons.extend(policy_reasons)
        violated.extend(policy_violated)
        severity = policy_severity

        # 3. Rate limits (from matching policies)
        for p in self.policies.policies.values():
            if not p.enabled:
                continue
            if p.action_type_match != "*" and p.action_type_match != action.action_type:
                continue
            exceeds, why = self.rate_limiter.exceeds(action, p.max_per_minute, p.max_per_day)
            if exceeds:
                reasons.append(why or "rate_limit_exceeded")
                violated.append(p.policy_id)
                status = DecisionStatus.BLOCK
                if severity != Severity.BLOCKER:
                    severity = Severity.CRITICAL

        # 4. Approval check — if status is require_approval, verify it exists
        if status == DecisionStatus.REQUIRE_APPROVAL and not self.approval_gate.is_approved(action.action_id):
            # no approval yet — stay in require_approval
            pass
        elif status == DecisionStatus.REQUIRE_APPROVAL:
            # approved
            status = DecisionStatus.ALLOW
            reasons.append("approval_granted")

        # 5. Record rate limiter if allow
        if status == DecisionStatus.ALLOW:
            self.rate_limiter.record(action)

        # 6. Audit every decision
        entry = self.audit.append(
            action.tenant_id, action.actor, action.action_type,
            action.action_id, status.value, reasons,
        )

        return GuardrailDecision(
            action_id=action.action_id,
            status=status,
            reasons=reasons,
            violated_policies=violated,
            severity=severity,
            audit_id=entry.audit_id,
        )
```

### 3.9 `safety_guardrails/__init__.py`

```python
from .guardrail import Guardrail
from .types import (
    Action,
    DecisionStatus,
    GuardrailDecision,
    Policy,
    Severity,
)

__all__ = [
    "Guardrail",
    "Action",
    "DecisionStatus",
    "GuardrailDecision",
    "Policy",
    "Severity",
]
```

---

## 4. Acceptance test (this MUST pass — no exceptions)

### `safety_guardrails/tests/test_guardrail_e2e.py`

```python
from safety_guardrails import Guardrail, Action, Policy, DecisionStatus


def test_end_to_end_guardrail_flow():
    g = Guardrail()

    # Policy: cap trades at $10k, 5/min, 50/day, approval for >$5k
    g.register_policy(Policy(
        policy_id="pol_trade_limits",
        name="Trade limits",
        action_type_match="execute_trade",
        max_impact_usd=10_000,
        max_per_minute=5,
        max_per_day=50,
        requires_approval=False,
    ))

    # 1. Small trade should ALLOW
    decision = g.check(Action(
        action_id="act_1",
        action_type="execute_trade",
        actor="user_42",
        tenant_id="tenant_alpha",
        payload={"symbol": "AAPL", "qty": 10},
        estimated_impact={"usd": 1500},
    ))
    assert decision.status == DecisionStatus.ALLOW, f"expected allow, got {decision.status}: {decision.reasons}"

    # 2. Over-cap trade should BLOCK
    decision = g.check(Action(
        action_id="act_2",
        action_type="execute_trade",
        actor="user_42",
        tenant_id="tenant_alpha",
        payload={"symbol": "TSLA", "qty": 200},
        estimated_impact={"usd": 50_000},
    ))
    assert decision.status == DecisionStatus.BLOCK, f"expected block, got {decision.status}"
    assert any("financial_impact" in r for r in decision.reasons)

    # 3. Rate limit — 5 quick trades allowed, 6th blocked
    g2 = Guardrail()
    g2.register_policy(Policy(
        policy_id="pol_rate",
        name="Rate",
        action_type_match="ping",
        max_per_minute=3,
    ))
    for i in range(3):
        d = g2.check(Action(
            action_id=f"p_{i}",
            action_type="ping",
            actor="bot",
            tenant_id="t",
        ))
        assert d.status == DecisionStatus.ALLOW
    d = g2.check(Action(action_id="p_4", action_type="ping", actor="bot", tenant_id="t"))
    assert d.status == DecisionStatus.BLOCK, f"expected rate limit block"
    assert any("rate_limit" in r for r in d.reasons)

    # 4. Audit chain is valid
    assert g.audit.verify_chain()
    assert g2.audit.verify_chain()

    # 5. Approval flow
    g3 = Guardrail()
    g3.register_policy(Policy(
        policy_id="pol_approval",
        name="Needs approval",
        action_type_match="fire_missile",
        requires_approval=True,
    ))
    action = Action(action_id="act_nuke", action_type="fire_missile", actor="general", tenant_id="t")
    d = g3.check(action)
    assert d.status == DecisionStatus.REQUIRE_APPROVAL

    g3.approval_gate.request(action, reason="needed")
    g3.approval_gate.approve(f"appr_{action.action_id}", approver="president")
    d2 = g3.check(action)
    assert d2.status == DecisionStatus.ALLOW

    print("ALL ACCEPTANCE TESTS PASSED")


if __name__ == "__main__":
    test_end_to_end_guardrail_flow()
```

Run it:

```bash
python -m safety_guardrails.tests.test_guardrail_e2e
```

Expected output: `ALL ACCEPTANCE TESTS PASSED`

---

## 5. Execution order for Replit Claude

Do these in this exact order. Do not skip, do not reorder, do not
create additional files not listed above.

1. `mkdir -p safety_guardrails/tests`
2. Create `safety_guardrails/types.py` (copy from section 3.1)
3. Create `safety_guardrails/validator.py` (copy from section 3.2)
4. Create `safety_guardrails/policy_engine.py` (copy from section 3.3)
5. Create `safety_guardrails/rate_limiter.py` (copy from section 3.4)
6. Create `safety_guardrails/approval_gate.py` (copy from section 3.5)
7. Create `safety_guardrails/rollback.py` (copy from section 3.6)
8. Create `safety_guardrails/audit.py` (copy from section 3.7)
9. Create `safety_guardrails/guardrail.py` (copy from section 3.8)
10. Create `safety_guardrails/__init__.py` (copy from section 3.9)
11. Create `safety_guardrails/tests/__init__.py` (empty)
12. Create `safety_guardrails/tests/test_guardrail_e2e.py` (copy from section 4)
13. Run `python -m safety_guardrails.tests.test_guardrail_e2e`
14. Confirm output: `ALL ACCEPTANCE TESTS PASSED`
15. Commit with message: `feat(#6): Safety Guardrails Layer — validation + policies + rate limits + approvals + rollback + hash-chained audit`
16. Mark Task #6 as Done
17. Unblock dependents: #7, #8 (already cancelled), #9, #12, #25, #26, #34

**If any step fails, do NOT retry creatively. Re-read section 3, copy
the code verbatim, and try again. This spec is complete — deviation is
what caused the loop.**

---

## 6. Why this unblocks everything else

Every task in the "Blocked by #6 Safety Guardrails Layer" list needs
the `Guardrail.check(action)` entry point. Once this entry point exists
and the acceptance test passes, those tasks can import it:

```python
from safety_guardrails import Guardrail, Action
```

and wrap their actions with it. They don't need anything more than the
contract in section 2.

---

## 7. What you (the user) paste into Replit Claude

Open the Claude panel in Replit and paste this single message:

> I'm unblocking Task #6. Read this document: REPLIT_UNBLOCK_TASK_6.md
> in the repository root. Execute section 5 exactly — create every file
> listed in section 3 with the code provided verbatim, then run the
> acceptance test in section 4, confirm it passes, commit with the
> message in step 15, mark Task #6 as Done, and unblock its dependents.
> Do not create additional tasks. Do not deviate from the spec.

That is the message. It is unambiguous, self-contained, and leaves
zero room for Replit Claude to loop.
