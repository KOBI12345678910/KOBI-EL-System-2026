"""
Bayesian Beliefs Engine — probabilistic uncertainty tracking.

Every claim the platform makes carries UNCERTAINTY. Instead of
storing point estimates, this engine tracks Beta distributions
(for probabilities) and Gamma distributions (for rates) and
updates them as new evidence arrives.

Example:
  "What's the probability that Supplier A delivers on time?"
  -> Beta(alpha=successes+1, beta=failures+1)
  -> on_time_rate = alpha / (alpha+beta)
  -> 95% credible interval from the Beta distribution

This gives us:
  - Credible intervals, not point estimates
  - Auto-updating priors as events flow in
  - Principled handling of sparse data (wide intervals)
  - Posterior predictive: "what's the chance the next delivery is on time?"

Used by:
  - Risk scoring (confidence in risk estimates)
  - Supplier reliability tracking
  - Defect rate estimation
  - Lead-time forecasting

Pure Python, zero dependencies. Beta/Gamma PDF/CDF implemented
via lanczos approximation for the gamma function.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════
# GAMMA FUNCTION (Lanczos approximation)
# ════════════════════════════════════════════════════════════════

_LANCZOS_G = 7
_LANCZOS_C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
]


def gamma(x: float) -> float:
    """Lanczos approximation to the Gamma function."""
    if x < 0.5:
        return math.pi / (math.sin(math.pi * x) * gamma(1 - x))
    x -= 1
    a = _LANCZOS_C[0]
    t = x + _LANCZOS_G + 0.5
    for i in range(1, _LANCZOS_G + 2):
        a += _LANCZOS_C[i] / (x + i)
    return math.sqrt(2 * math.pi) * (t ** (x + 0.5)) * math.exp(-t) * a


def beta_function(a: float, b: float) -> float:
    return gamma(a) * gamma(b) / gamma(a + b)


# ════════════════════════════════════════════════════════════════
# BELIEF TYPES
# ════════════════════════════════════════════════════════════════

@dataclass
class BetaBelief:
    """A Beta(alpha, beta) distribution over a probability [0, 1]."""
    alpha: float
    beta: float

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def variance(self) -> float:
        s = self.alpha + self.beta
        return (self.alpha * self.beta) / (s * s * (s + 1))

    @property
    def stdev(self) -> float:
        return math.sqrt(self.variance)

    @property
    def mode(self) -> float:
        if self.alpha > 1 and self.beta > 1:
            return (self.alpha - 1) / (self.alpha + self.beta - 2)
        return self.mean

    def update(self, *, successes: int, failures: int) -> "BetaBelief":
        return BetaBelief(
            alpha=self.alpha + successes,
            beta=self.beta + failures,
        )

    def credible_interval(self, level: float = 0.95) -> Tuple[float, float]:
        """
        Return the (level)% credible interval via inverse CDF.

        Uses a numerical root-finding approximation: binary search on
        the CDF since we don't have scipy.special.betainc. Good enough
        for display purposes.
        """
        tail = (1 - level) / 2
        lo = self._quantile(tail)
        hi = self._quantile(1 - tail)
        return (lo, hi)

    def _quantile(self, p: float) -> float:
        """Binary search on the Beta CDF."""
        if p <= 0:
            return 0.0
        if p >= 1:
            return 1.0
        lo, hi = 0.0, 1.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if self._cdf(mid) < p:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def _cdf(self, x: float) -> float:
        """
        Regularized incomplete beta function via continued fraction.
        Valid for 0 <= x <= 1.
        """
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        # Use numerical integration (Simpson's rule) as a fallback —
        # it's accurate enough for display.
        n = 200
        h = x / n
        total = 0.0
        for i in range(n + 1):
            xi = i * h
            if xi <= 0 or xi >= 1:
                continue
            weight = 1 if i == 0 or i == n else (4 if i % 2 else 2)
            # pdf = x^(a-1) * (1-x)^(b-1) / B(a,b)
            try:
                pdf = (xi ** (self.alpha - 1)) * ((1 - xi) ** (self.beta - 1)) / beta_function(self.alpha, self.beta)
            except Exception:
                pdf = 0.0
            total += weight * pdf
        return min(1.0, max(0.0, total * h / 3))


@dataclass
class GammaBelief:
    """Gamma(shape, rate) — prior over rates (e.g. events/hour)."""
    shape: float
    rate: float

    @property
    def mean(self) -> float:
        return self.shape / self.rate

    @property
    def variance(self) -> float:
        return self.shape / (self.rate * self.rate)

    @property
    def mode(self) -> float:
        if self.shape >= 1:
            return (self.shape - 1) / self.rate
        return 0.0

    def update(self, *, observed_count: int, observed_duration: float) -> "GammaBelief":
        return GammaBelief(
            shape=self.shape + observed_count,
            rate=self.rate + observed_duration,
        )


@dataclass
class BeliefRecord:
    belief_id: str
    tenant_id: str
    subject: str       # e.g. "supplier:SUPP-0001:on_time_rate"
    belief_type: str   # "beta" | "gamma"
    parameters: Dict[str, float]
    updated_count: int
    last_updated: datetime
    mean: float
    credible_interval_95: Tuple[float, float]


# ════════════════════════════════════════════════════════════════
# BELIEFS STORE
# ════════════════════════════════════════════════════════════════

class BayesianBeliefsEngine:
    def __init__(self) -> None:
        self._beta_beliefs: Dict[str, BetaBelief] = {}
        self._gamma_beliefs: Dict[str, GammaBelief] = {}
        self._update_counts: Dict[str, int] = {}
        self._last_updated: Dict[str, datetime] = {}

    # ─── Beta beliefs ────────────────────────────────────────
    def register_beta(
        self,
        subject: str,
        *,
        prior_alpha: float = 1.0,
        prior_beta: float = 1.0,
    ) -> BetaBelief:
        if subject not in self._beta_beliefs:
            self._beta_beliefs[subject] = BetaBelief(alpha=prior_alpha, beta=prior_beta)
            self._update_counts[subject] = 0
            self._last_updated[subject] = utc_now()
        return self._beta_beliefs[subject]

    def update_beta(
        self,
        subject: str,
        *,
        successes: int = 0,
        failures: int = 0,
    ) -> BetaBelief:
        belief = self._beta_beliefs.get(subject)
        if belief is None:
            belief = self.register_beta(subject)
        updated = belief.update(successes=successes, failures=failures)
        self._beta_beliefs[subject] = updated
        self._update_counts[subject] = self._update_counts.get(subject, 0) + 1
        self._last_updated[subject] = utc_now()
        return updated

    def get_beta(self, subject: str) -> Optional[BetaBelief]:
        return self._beta_beliefs.get(subject)

    # ─── Gamma beliefs ───────────────────────────────────────
    def register_gamma(
        self,
        subject: str,
        *,
        prior_shape: float = 1.0,
        prior_rate: float = 1.0,
    ) -> GammaBelief:
        if subject not in self._gamma_beliefs:
            self._gamma_beliefs[subject] = GammaBelief(shape=prior_shape, rate=prior_rate)
            self._update_counts[subject] = 0
            self._last_updated[subject] = utc_now()
        return self._gamma_beliefs[subject]

    def update_gamma(
        self,
        subject: str,
        *,
        observed_count: int,
        observed_duration: float,
    ) -> GammaBelief:
        belief = self._gamma_beliefs.get(subject)
        if belief is None:
            belief = self.register_gamma(subject)
        updated = belief.update(observed_count=observed_count, observed_duration=observed_duration)
        self._gamma_beliefs[subject] = updated
        self._update_counts[subject] = self._update_counts.get(subject, 0) + 1
        self._last_updated[subject] = utc_now()
        return updated

    def get_gamma(self, subject: str) -> Optional[GammaBelief]:
        return self._gamma_beliefs.get(subject)

    # ─── Posterior predictive ────────────────────────────────
    def predict_probability(self, subject: str) -> Dict[str, float]:
        """For a Beta belief, return mean + credible interval."""
        belief = self._beta_beliefs.get(subject)
        if belief is None:
            return {"mean": 0.5, "ci_low": 0.0, "ci_high": 1.0, "variance": 1.0}
        ci = belief.credible_interval(0.95)
        return {
            "mean": round(belief.mean, 4),
            "mode": round(belief.mode, 4),
            "variance": round(belief.variance, 6),
            "stdev": round(belief.stdev, 4),
            "ci_low": round(ci[0], 4),
            "ci_high": round(ci[1], 4),
            "alpha": belief.alpha,
            "beta": belief.beta,
        }

    def predict_rate(self, subject: str) -> Dict[str, float]:
        """For a Gamma belief, return mean rate + variance."""
        belief = self._gamma_beliefs.get(subject)
        if belief is None:
            return {"mean": 0.0, "variance": 0.0, "mode": 0.0}
        return {
            "mean": round(belief.mean, 4),
            "variance": round(belief.variance, 6),
            "mode": round(belief.mode, 4),
            "shape": belief.shape,
            "rate": belief.rate,
        }

    def list_all(self) -> List[BeliefRecord]:
        out: List[BeliefRecord] = []
        for subject, belief in self._beta_beliefs.items():
            ci = belief.credible_interval(0.95)
            out.append(BeliefRecord(
                belief_id=f"belief_{subject}",
                tenant_id="",
                subject=subject,
                belief_type="beta",
                parameters={"alpha": belief.alpha, "beta": belief.beta},
                updated_count=self._update_counts.get(subject, 0),
                last_updated=self._last_updated.get(subject, utc_now()),
                mean=round(belief.mean, 4),
                credible_interval_95=(round(ci[0], 4), round(ci[1], 4)),
            ))
        for subject, belief in self._gamma_beliefs.items():
            out.append(BeliefRecord(
                belief_id=f"belief_{subject}",
                tenant_id="",
                subject=subject,
                belief_type="gamma",
                parameters={"shape": belief.shape, "rate": belief.rate},
                updated_count=self._update_counts.get(subject, 0),
                last_updated=self._last_updated.get(subject, utc_now()),
                mean=round(belief.mean, 4),
                credible_interval_95=(0.0, 0.0),
            ))
        return out

    def stats(self) -> Dict[str, Any]:
        return {
            "total_beliefs": len(self._beta_beliefs) + len(self._gamma_beliefs),
            "beta_beliefs": len(self._beta_beliefs),
            "gamma_beliefs": len(self._gamma_beliefs),
            "total_updates": sum(self._update_counts.values()),
        }


_engine: Optional[BayesianBeliefsEngine] = None


def get_bayesian_beliefs() -> BayesianBeliefsEngine:
    global _engine
    if _engine is None:
        _engine = BayesianBeliefsEngine()
        # Seed some beliefs for the Techno-Kol Uzi demo
        _engine.register_beta("supplier:SUPP-0001:on_time_rate", prior_alpha=2, prior_beta=1)
        _engine.register_beta("supplier:SUPP-0002:on_time_rate", prior_alpha=10, prior_beta=1)
        _engine.register_beta("supplier:SUPP-0003:on_time_rate", prior_alpha=15, prior_beta=1)
        _engine.register_beta("project:on_time_completion_rate", prior_alpha=5, prior_beta=3)
        _engine.register_gamma("events_per_hour:ingestion", prior_shape=10, prior_rate=1)
    return _engine
