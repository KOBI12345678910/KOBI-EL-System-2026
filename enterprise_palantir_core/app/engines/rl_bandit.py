"""
Reinforcement Learning — Multi-Armed Bandit for action selection.

When the platform has multiple possible actions to take in response
to a situation (e.g. "expedite shipping" vs "activate backup supplier"
vs "renegotiate deadline"), the bandit engine learns which action
produces the best outcome via trial-and-error.

Three bandit algorithms implemented:

  1. Thompson Sampling (Bayesian, optimal for stationary rewards)
  2. UCB1 (Upper Confidence Bound — provable regret bounds)
  3. Epsilon-Greedy (simple, tunable exploration)

Every time an action is taken, the engine records the observed
reward (e.g. cost saved, hours recovered, risk reduction) and
updates its estimate of which action is best.

The AI operator doesn't have to tell the platform what "works" —
the bandit figures it out from historical outcomes.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BanditAlgorithm(str, Enum):
    THOMPSON_SAMPLING = "thompson_sampling"
    UCB1 = "ucb1"
    EPSILON_GREEDY = "epsilon_greedy"


@dataclass
class BanditArm:
    arm_id: str
    name: str
    description: str
    pulls: int = 0
    total_reward: float = 0.0
    alpha: float = 1.0  # Beta prior for Thompson sampling
    beta: float = 1.0
    last_pulled_at: Optional[datetime] = None
    last_reward: float = 0.0

    @property
    def mean_reward(self) -> float:
        return self.total_reward / self.pulls if self.pulls > 0 else 0.5


@dataclass
class BanditDecision:
    chosen_arm_id: str
    chosen_arm_name: str
    algorithm: BanditAlgorithm
    reason: str
    arm_scores: Dict[str, float]
    decision_at: datetime = field(default_factory=utc_now)


@dataclass
class BanditContext:
    """Describes a decision situation."""
    context_id: str
    problem_description: str
    arms: List[BanditArm]
    total_pulls: int = 0
    created_at: datetime = field(default_factory=utc_now)


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class BanditEngine:
    def __init__(self, seed: int = 42) -> None:
        self._contexts: Dict[str, BanditContext] = {}
        self._decisions: List[BanditDecision] = []
        random.seed(seed)

    # ─── Registration ────────────────────────────────────────
    def create_context(
        self,
        *,
        context_id: str,
        problem_description: str,
        arms: List[Dict[str, str]],
    ) -> BanditContext:
        bandit_arms = [
            BanditArm(
                arm_id=a.get("arm_id") or a["id"],
                name=a["name"],
                description=a.get("description", ""),
            )
            for a in arms
        ]
        ctx = BanditContext(
            context_id=context_id,
            problem_description=problem_description,
            arms=bandit_arms,
        )
        self._contexts[context_id] = ctx
        return ctx

    def get_context(self, context_id: str) -> Optional[BanditContext]:
        return self._contexts.get(context_id)

    def all_contexts(self) -> List[BanditContext]:
        return list(self._contexts.values())

    # ─── Selection algorithms ────────────────────────────────
    def select(
        self,
        context_id: str,
        *,
        algorithm: BanditAlgorithm = BanditAlgorithm.THOMPSON_SAMPLING,
        epsilon: float = 0.1,
    ) -> Optional[BanditDecision]:
        ctx = self._contexts.get(context_id)
        if ctx is None or not ctx.arms:
            return None

        if algorithm == BanditAlgorithm.THOMPSON_SAMPLING:
            return self._thompson(ctx)
        if algorithm == BanditAlgorithm.UCB1:
            return self._ucb1(ctx)
        return self._epsilon_greedy(ctx, epsilon)

    def _thompson(self, ctx: BanditContext) -> BanditDecision:
        """
        Thompson sampling: draw a sample from each arm's posterior
        Beta distribution, pick the arm with the highest sample.
        """
        arm_scores: Dict[str, float] = {}
        best_score = -float("inf")
        best_arm: Optional[BanditArm] = None
        for arm in ctx.arms:
            # Sample from Beta(alpha, beta) via inverse transform
            # (stdlib random.betavariate is exactly what we need)
            sample = random.betavariate(arm.alpha, arm.beta)
            arm_scores[arm.arm_id] = round(sample, 4)
            if sample > best_score:
                best_score = sample
                best_arm = arm
        decision = BanditDecision(
            chosen_arm_id=best_arm.arm_id if best_arm else "",
            chosen_arm_name=best_arm.name if best_arm else "",
            algorithm=BanditAlgorithm.THOMPSON_SAMPLING,
            reason=f"Highest Beta posterior sample ({best_score:.3f})",
            arm_scores=arm_scores,
        )
        self._decisions.append(decision)
        return decision

    def _ucb1(self, ctx: BanditContext) -> BanditDecision:
        """
        UCB1: mean + sqrt(2 * ln(total_pulls) / pulls_of_arm).
        Provably achieves logarithmic regret.
        """
        # If any arm has never been pulled, pull it first (exploration)
        unpulled = [a for a in ctx.arms if a.pulls == 0]
        if unpulled:
            chosen = unpulled[0]
            decision = BanditDecision(
                chosen_arm_id=chosen.arm_id,
                chosen_arm_name=chosen.name,
                algorithm=BanditAlgorithm.UCB1,
                reason="Exploration: unpulled arm",
                arm_scores={a.arm_id: (float("inf") if a.pulls == 0 else a.mean_reward) for a in ctx.arms},
            )
            self._decisions.append(decision)
            return decision

        total = ctx.total_pulls or sum(a.pulls for a in ctx.arms)
        arm_scores: Dict[str, float] = {}
        best_score = -float("inf")
        best_arm: Optional[BanditArm] = None
        for arm in ctx.arms:
            exploration = math.sqrt(2 * math.log(max(1, total)) / max(1, arm.pulls))
            ucb = arm.mean_reward + exploration
            arm_scores[arm.arm_id] = round(ucb, 4)
            if ucb > best_score:
                best_score = ucb
                best_arm = arm
        decision = BanditDecision(
            chosen_arm_id=best_arm.arm_id if best_arm else "",
            chosen_arm_name=best_arm.name if best_arm else "",
            algorithm=BanditAlgorithm.UCB1,
            reason=f"Highest UCB1 score ({best_score:.3f})",
            arm_scores=arm_scores,
        )
        self._decisions.append(decision)
        return decision

    def _epsilon_greedy(self, ctx: BanditContext, epsilon: float) -> BanditDecision:
        arm_scores = {a.arm_id: a.mean_reward for a in ctx.arms}
        if random.random() < epsilon:
            chosen = random.choice(ctx.arms)
            reason = f"Exploration (epsilon={epsilon})"
        else:
            chosen = max(ctx.arms, key=lambda a: a.mean_reward)
            reason = f"Exploitation — highest mean reward ({chosen.mean_reward:.3f})"
        decision = BanditDecision(
            chosen_arm_id=chosen.arm_id,
            chosen_arm_name=chosen.name,
            algorithm=BanditAlgorithm.EPSILON_GREEDY,
            reason=reason,
            arm_scores={k: round(v, 4) for k, v in arm_scores.items()},
        )
        self._decisions.append(decision)
        return decision

    # ─── Record outcomes ─────────────────────────────────────
    def record_reward(
        self,
        context_id: str,
        arm_id: str,
        *,
        reward: float,
        is_binary_success: bool = True,
    ) -> Optional[BanditArm]:
        """
        Record the observed reward after pulling an arm.

        reward should be in [0, 1] for Thompson sampling to work well.
        is_binary_success=True treats reward>=0.5 as a success.
        """
        ctx = self._contexts.get(context_id)
        if ctx is None:
            return None
        arm = next((a for a in ctx.arms if a.arm_id == arm_id), None)
        if arm is None:
            return None

        arm.pulls += 1
        arm.total_reward += reward
        arm.last_pulled_at = utc_now()
        arm.last_reward = reward
        ctx.total_pulls += 1

        if is_binary_success:
            if reward >= 0.5:
                arm.alpha += 1
            else:
                arm.beta += 1
        else:
            # Continuous reward — use moment matching to update Beta
            # posterior. Simplified: treat reward as a success fraction.
            arm.alpha += reward
            arm.beta += (1 - reward)
        return arm

    # ─── Queries ─────────────────────────────────────────────
    def best_arm(self, context_id: str) -> Optional[BanditArm]:
        ctx = self._contexts.get(context_id)
        if ctx is None or not ctx.arms:
            return None
        return max(ctx.arms, key=lambda a: a.alpha / (a.alpha + a.beta))

    def context_stats(self, context_id: str) -> Dict[str, Any]:
        ctx = self._contexts.get(context_id)
        if ctx is None:
            return {}
        arms = []
        for arm in ctx.arms:
            arms.append({
                "arm_id": arm.arm_id,
                "name": arm.name,
                "pulls": arm.pulls,
                "total_reward": round(arm.total_reward, 3),
                "mean_reward": round(arm.mean_reward, 3),
                "posterior_mean": round(arm.alpha / (arm.alpha + arm.beta), 3),
                "last_pulled_at": arm.last_pulled_at.isoformat() if arm.last_pulled_at else None,
            })
        return {
            "context_id": ctx.context_id,
            "problem_description": ctx.problem_description,
            "total_pulls": ctx.total_pulls,
            "arm_count": len(ctx.arms),
            "arms": arms,
            "best_arm": self.best_arm(context_id).arm_id if self.best_arm(context_id) else None,
        }

    def recent_decisions(self, limit: int = 50) -> List[BanditDecision]:
        return self._decisions[-limit:][::-1]


_engine: Optional[BanditEngine] = None


def get_bandit_engine() -> BanditEngine:
    global _engine
    if _engine is None:
        _engine = BanditEngine()
        _seed_demo_contexts(_engine)
    return _engine


def _seed_demo_contexts(engine: BanditEngine) -> None:
    """Seed some realistic operational bandit contexts."""
    engine.create_context(
        context_id="supplier_delay_response",
        problem_description="When a supplier is delayed, which response works best?",
        arms=[
            {"arm_id": "expedite", "name": "Expedite shipping", "description": "Pay premium for faster shipping"},
            {"arm_id": "activate_backup", "name": "Activate backup supplier", "description": "Switch to a pre-vetted alternative"},
            {"arm_id": "renegotiate", "name": "Renegotiate deadline", "description": "Shift project deadline with customer"},
            {"arm_id": "insource", "name": "In-source the part", "description": "Manufacture internally at higher cost"},
        ],
    )
    engine.create_context(
        context_id="inventory_shortage_response",
        problem_description="When material is below reorder point, which action works best?",
        arms=[
            {"arm_id": "emergency_order", "name": "Emergency order", "description": "Place emergency replenishment"},
            {"arm_id": "substitute", "name": "Use substitute material", "description": "Swap to alternative spec"},
            {"arm_id": "partial_fulfill", "name": "Partial fulfillment", "description": "Ship what's available now"},
        ],
    )
    engine.create_context(
        context_id="customer_collection",
        problem_description="When an invoice is overdue, which collection strategy works?",
        arms=[
            {"arm_id": "email_reminder", "name": "Email reminder", "description": "Automated email"},
            {"arm_id": "phone_call", "name": "Phone call", "description": "Personal phone outreach"},
            {"arm_id": "discount_for_fast_pay", "name": "Discount for fast pay", "description": "Offer small discount"},
            {"arm_id": "legal_notice", "name": "Legal notice", "description": "Formal legal action"},
        ],
    )
