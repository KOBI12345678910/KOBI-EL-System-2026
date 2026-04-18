"""
Feature Flags — runtime toggles with targeting rules.

A feature flag can be:
  - enabled/disabled globally
  - rolled out to a percentage of users
  - enabled for specific tenants
  - enabled for specific user roles
  - A/B test variants (A/B/C with weights)

Every flag evaluation is deterministic (same user + same flag always
returns the same value) so users don't flap between variants.

Used to ship risky features, experiments, and gradual rollouts.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FlagType(str, Enum):
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    VARIANT = "variant"
    TARGETED = "targeted"


@dataclass
class FeatureFlag:
    flag_key: str
    description: str
    flag_type: FlagType
    default_value: Any
    enabled: bool = True
    rollout_percentage: int = 0  # 0-100
    target_tenants: List[str] = field(default_factory=list)
    target_roles: List[str] = field(default_factory=list)
    variants: Dict[str, int] = field(default_factory=dict)  # variant -> weight
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class EvaluationContext:
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    roles: List[str] = field(default_factory=list)
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FlagEvaluation:
    flag_key: str
    value: Any
    reason: str
    variant: Optional[str] = None


class FeatureFlagEngine:
    def __init__(self) -> None:
        self._flags: Dict[str, FeatureFlag] = {}
        self._evaluations: List[FlagEvaluation] = []
        self._seed_defaults()

    def register(self, flag: FeatureFlag) -> None:
        self._flags[flag.flag_key] = flag

    def get(self, flag_key: str) -> Optional[FeatureFlag]:
        return self._flags.get(flag_key)

    def all(self) -> List[FeatureFlag]:
        return list(self._flags.values())

    def update(
        self,
        flag_key: str,
        *,
        enabled: Optional[bool] = None,
        rollout_percentage: Optional[int] = None,
        target_tenants: Optional[List[str]] = None,
    ) -> Optional[FeatureFlag]:
        flag = self._flags.get(flag_key)
        if flag is None:
            return None
        if enabled is not None:
            flag.enabled = enabled
        if rollout_percentage is not None:
            flag.rollout_percentage = max(0, min(100, rollout_percentage))
        if target_tenants is not None:
            flag.target_tenants = target_tenants
        flag.updated_at = utc_now()
        return flag

    def evaluate(
        self,
        flag_key: str,
        ctx: EvaluationContext,
    ) -> FlagEvaluation:
        flag = self._flags.get(flag_key)
        if flag is None:
            return FlagEvaluation(flag_key=flag_key, value=None, reason="flag_not_found")

        if not flag.enabled:
            return FlagEvaluation(flag_key=flag_key, value=flag.default_value, reason="flag_disabled")

        # Targeted tenants always win — TARGETED and BOOLEAN return True on match
        if flag.target_tenants and ctx.tenant_id in flag.target_tenants:
            return FlagEvaluation(
                flag_key=flag_key,
                value=True if flag.flag_type in (FlagType.BOOLEAN, FlagType.TARGETED) else flag.default_value,
                reason=f"tenant_targeted:{ctx.tenant_id}",
            )

        # Targeted roles — same logic
        if flag.target_roles and any(r in ctx.roles for r in flag.target_roles):
            matched = next(r for r in ctx.roles if r in flag.target_roles)
            return FlagEvaluation(
                flag_key=flag_key,
                value=True if flag.flag_type in (FlagType.BOOLEAN, FlagType.TARGETED) else flag.default_value,
                reason=f"role_targeted:{matched}",
            )

        # Percentage rollout — deterministic by hash of (user_id + flag_key)
        if flag.flag_type == FlagType.PERCENTAGE and flag.rollout_percentage > 0:
            hash_input = f"{ctx.user_id or ctx.tenant_id or 'anon'}:{flag_key}"
            bucket = int(hashlib.md5(hash_input.encode()).hexdigest(), 16) % 100
            if bucket < flag.rollout_percentage:
                return FlagEvaluation(
                    flag_key=flag_key,
                    value=True,
                    reason=f"rollout_bucket:{bucket}<{flag.rollout_percentage}",
                )
            return FlagEvaluation(
                flag_key=flag_key,
                value=False,
                reason=f"rollout_bucket:{bucket}>={flag.rollout_percentage}",
            )

        # A/B/C variants — deterministic weighted bucket
        if flag.flag_type == FlagType.VARIANT and flag.variants:
            total = sum(flag.variants.values())
            if total == 0:
                return FlagEvaluation(flag_key=flag_key, value=flag.default_value, reason="no_variants")
            hash_input = f"{ctx.user_id or ctx.tenant_id or 'anon'}:{flag_key}"
            bucket = int(hashlib.md5(hash_input.encode()).hexdigest(), 16) % total
            running = 0
            for variant, weight in flag.variants.items():
                running += weight
                if bucket < running:
                    return FlagEvaluation(
                        flag_key=flag_key,
                        value=variant,
                        reason=f"variant_bucket:{bucket}",
                        variant=variant,
                    )

        return FlagEvaluation(
            flag_key=flag_key,
            value=flag.default_value,
            reason="default",
        )

    def evaluate_all(self, ctx: EvaluationContext) -> Dict[str, Any]:
        return {
            f.flag_key: self.evaluate(f.flag_key, ctx).value for f in self.all()
        }

    def _seed_defaults(self) -> None:
        self.register(FeatureFlag(
            flag_key="use_ai_summary",
            description="Include Claude-generated executive summary in command center snapshot",
            flag_type=FlagType.PERCENTAGE,
            default_value=False,
            rollout_percentage=25,
        ))
        self.register(FeatureFlag(
            flag_key="enable_simulation_engine",
            description="Expose /platform/simulate endpoint",
            flag_type=FlagType.BOOLEAN,
            default_value=True,
        ))
        self.register(FeatureFlag(
            flag_key="dashboard_theme",
            description="A/B test dashboard themes",
            flag_type=FlagType.VARIANT,
            default_value="dark",
            variants={"dark": 70, "light": 15, "high_contrast": 15},
        ))
        self.register(FeatureFlag(
            flag_key="experimental_cdc",
            description="Enable Postgres logical replication CDC",
            flag_type=FlagType.TARGETED,
            default_value=False,
            target_tenants=["techno_kol_uzi"],
        ))
        self.register(FeatureFlag(
            flag_key="auto_resolve_low_severity",
            description="Auto-resolve low-severity alerts after 1 hour",
            flag_type=FlagType.BOOLEAN,
            default_value=False,
        ))


_engine: Optional[FeatureFlagEngine] = None


def get_feature_flags() -> FeatureFlagEngine:
    global _engine
    if _engine is None:
        _engine = FeatureFlagEngine()
    return _engine
