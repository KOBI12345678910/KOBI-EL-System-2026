"""
Policy / Guardrails Engine.

Evaluates an action (or a write-back) against a set of policies and
returns an allow/warn/block decision with reasons. Policies cover:

  - financial impact caps
  - rate limits (per actor + per action type)
  - blocked actors
  - required roles
  - approval-required flags
  - daily action limits

Used by the ActionEngine before actually executing anything.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Deque, Dict, List, Optional, Tuple


class DecisionStatus(str, Enum):
    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"
    REQUIRE_APPROVAL = "require_approval"


@dataclass
class Policy:
    policy_id: str
    name: str
    action_type_match: str = "*"           # "*" or exact action_type
    max_impact_usd: Optional[float] = None
    max_per_minute: Optional[int] = None
    max_per_day: Optional[int] = None
    blocked_actors: List[str] = field(default_factory=list)
    required_roles: List[str] = field(default_factory=list)
    requires_approval: bool = False
    enabled: bool = True


@dataclass
class ActionRequest:
    action_id: str
    action_type: str
    actor: str
    tenant_id: str
    payload: Dict[str, Any] = field(default_factory=dict)
    estimated_impact_usd: float = 0.0
    actor_roles: List[str] = field(default_factory=list)


@dataclass
class PolicyDecision:
    action_id: str
    status: DecisionStatus
    reasons: List[str]
    violated_policies: List[str]


class PolicyEngine:
    def __init__(self) -> None:
        self._policies: Dict[str, Policy] = {}
        # Sliding-window per (actor, action_type) → deque of timestamps
        self._events: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)

    def register(self, policy: Policy) -> None:
        self._policies[policy.policy_id] = policy

    def evaluate(self, req: ActionRequest) -> PolicyDecision:
        reasons: List[str] = []
        violated: List[str] = []
        status = DecisionStatus.ALLOW

        for p in self._policies.values():
            if not p.enabled:
                continue
            if p.action_type_match != "*" and p.action_type_match != req.action_type:
                continue

            # 1. Blocked actor
            if req.actor in p.blocked_actors:
                reasons.append(f"actor_blocked:{p.name}")
                violated.append(p.policy_id)
                status = DecisionStatus.BLOCK

            # 2. Required roles
            if p.required_roles and not any(r in req.actor_roles for r in p.required_roles):
                reasons.append(f"missing_required_role:{p.name}:{p.required_roles}")
                violated.append(p.policy_id)
                status = DecisionStatus.BLOCK

            # 3. Financial impact cap
            if p.max_impact_usd is not None and abs(req.estimated_impact_usd) > p.max_impact_usd:
                reasons.append(
                    f"financial_impact_{req.estimated_impact_usd}_exceeds_{p.max_impact_usd}:{p.name}"
                )
                violated.append(p.policy_id)
                status = DecisionStatus.BLOCK

            # 4. Rate limits
            if p.max_per_minute is not None:
                count = self._count_in_window(req, 60)
                if count >= p.max_per_minute:
                    reasons.append(f"rate_limit_per_minute_{p.max_per_minute}_exceeded:{p.name}")
                    violated.append(p.policy_id)
                    status = DecisionStatus.BLOCK
            if p.max_per_day is not None:
                count = self._count_in_window(req, 86400)
                if count >= p.max_per_day:
                    reasons.append(f"rate_limit_per_day_{p.max_per_day}_exceeded:{p.name}")
                    violated.append(p.policy_id)
                    status = DecisionStatus.BLOCK

            # 5. Approval gate
            if p.requires_approval and status == DecisionStatus.ALLOW:
                status = DecisionStatus.REQUIRE_APPROVAL
                reasons.append(f"approval_required:{p.name}")

        return PolicyDecision(
            action_id=req.action_id,
            status=status,
            reasons=reasons,
            violated_policies=violated,
        )

    def record_execution(self, req: ActionRequest) -> None:
        """Call this ONLY when an action is actually executed (for rate limits)."""
        key = (req.actor, req.action_type)
        self._events[key].append(time.time())

    def _count_in_window(self, req: ActionRequest, window_seconds: int) -> int:
        key = (req.actor, req.action_type)
        now = time.time()
        q = self._events[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        return len(q)

    def policies(self) -> List[Policy]:
        return [p for p in self._policies.values() if p.enabled]
