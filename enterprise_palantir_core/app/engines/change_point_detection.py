"""
Change Point Detection — detect regime changes in time series.

Different from anomaly detection (which flags individual outliers).
Change point detection looks for POINTS IN TIME where the underlying
distribution of a time series shifts from one regime to another.

Implementations:
  1. CUSUM (cumulative sum) — classical online detector
  2. PELT-style offline (pruned exact linear time) — single pass
  3. Bayesian Online Change Point Detection (BOCPD) — probabilistic

Use cases:
  - Sudden shift in sales volume → market regime change
  - Supplier lead time jump → supply chain disruption
  - Quality defect rate shift → process failure
  - Order volume shift → customer behavior change

Pure Python stdlib, zero dependencies.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChangePointMethod(str, Enum):
    CUSUM = "cusum"
    PELT = "pelt"
    BAYESIAN = "bayesian"


@dataclass
class ChangePoint:
    index: int
    value: float
    confidence: float
    regime_before_mean: float
    regime_after_mean: float
    shift_magnitude: float
    direction: str  # "up" | "down"


@dataclass
class ChangePointResult:
    method: ChangePointMethod
    series_length: int
    change_points: List[ChangePoint]
    regimes_detected: int
    total_variance_explained: float
    narrative: str
    generated_at: datetime = field(default_factory=utc_now)


class ChangePointDetector:
    def detect(
        self,
        values: List[float],
        *,
        method: ChangePointMethod = ChangePointMethod.CUSUM,
        threshold: float = 2.0,
        min_segment_length: int = 3,
    ) -> ChangePointResult:
        if len(values) < min_segment_length * 2:
            return ChangePointResult(
                method=method,
                series_length=len(values),
                change_points=[],
                regimes_detected=1,
                total_variance_explained=0.0,
                narrative="Series too short for change point detection",
            )

        if method == ChangePointMethod.CUSUM:
            points = self._detect_cusum(values, threshold)
        elif method == ChangePointMethod.PELT:
            points = self._detect_pelt(values, min_segment_length)
        elif method == ChangePointMethod.BAYESIAN:
            points = self._detect_bayesian(values)
        else:
            points = self._detect_cusum(values, threshold)

        regimes = len(points) + 1
        total_var = statistics.pvariance(values) if len(values) > 1 else 0.0
        # Simple variance reduction heuristic
        variance_explained = 0.0
        if points and total_var > 0:
            segments = self._split_into_segments(values, points)
            within_var = sum(
                statistics.pvariance(seg) if len(seg) > 1 else 0.0
                for seg in segments
            ) / len(segments)
            variance_explained = max(0.0, 1.0 - (within_var / total_var))

        narrative = self._build_narrative(points, regimes, variance_explained)
        return ChangePointResult(
            method=method,
            series_length=len(values),
            change_points=points,
            regimes_detected=regimes,
            total_variance_explained=round(variance_explained, 3),
            narrative=narrative,
        )

    # ─── CUSUM (online) ──────────────────────────────────────
    def _detect_cusum(
        self,
        values: List[float],
        threshold: float,
    ) -> List[ChangePoint]:
        """
        CUSUM: cumulative sum of deviations from running mean.
        When the sum exceeds a threshold (in standard deviations),
        a change point is declared.
        """
        points: List[ChangePoint] = []
        if len(values) < 4:
            return points
        mean = statistics.mean(values)
        stdev = statistics.pstdev(values) if len(values) > 1 else 1.0
        if stdev < 1e-9:
            return points

        s_pos = 0.0
        s_neg = 0.0
        h = threshold * stdev
        last_change = 0

        for i, v in enumerate(values):
            diff = v - mean
            s_pos = max(0.0, s_pos + diff - 0.5 * stdev)
            s_neg = max(0.0, s_neg - diff - 0.5 * stdev)
            if s_pos > h or s_neg > h:
                if i - last_change >= 3:  # require min segment length
                    before = statistics.mean(values[last_change:i]) if i > last_change else mean
                    after = statistics.mean(values[i:min(i + 5, len(values))])
                    points.append(ChangePoint(
                        index=i,
                        value=v,
                        confidence=min(1.0, max(s_pos, s_neg) / (h * 2)),
                        regime_before_mean=round(before, 3),
                        regime_after_mean=round(after, 3),
                        shift_magnitude=round(abs(after - before), 3),
                        direction="up" if s_pos > s_neg else "down",
                    ))
                    s_pos = 0.0
                    s_neg = 0.0
                    last_change = i
        return points

    # ─── PELT-inspired offline detection ─────────────────────
    def _detect_pelt(
        self,
        values: List[float],
        min_segment_length: int,
    ) -> List[ChangePoint]:
        """
        PELT is the optimal offline algorithm. This is a simplified
        version that scans every possible change point and scores
        the improvement in within-segment variance.
        """
        points: List[ChangePoint] = []
        n = len(values)
        if n < min_segment_length * 2:
            return points

        total_var = statistics.pvariance(values) if n > 1 else 0.0
        if total_var < 1e-9:
            return points

        # Find all points where the two-segment split minimizes cost
        best_splits: List[Tuple[float, int]] = []
        for i in range(min_segment_length, n - min_segment_length):
            left = values[:i]
            right = values[i:]
            left_var = statistics.pvariance(left) if len(left) > 1 else 0.0
            right_var = statistics.pvariance(right) if len(right) > 1 else 0.0
            combined_cost = len(left) * left_var + len(right) * right_var
            improvement = (n * total_var) - combined_cost
            if improvement > 0:
                best_splits.append((improvement, i))

        # Return the top-k splits whose improvement is > 10% of total variance
        best_splits.sort(key=lambda x: -x[0])
        threshold = n * total_var * 0.1
        for improvement, i in best_splits[:5]:
            if improvement < threshold:
                break
            left_mean = statistics.mean(values[:i])
            right_mean = statistics.mean(values[i:])
            points.append(ChangePoint(
                index=i,
                value=values[i],
                confidence=min(1.0, improvement / (n * total_var)),
                regime_before_mean=round(left_mean, 3),
                regime_after_mean=round(right_mean, 3),
                shift_magnitude=round(abs(right_mean - left_mean), 3),
                direction="up" if right_mean > left_mean else "down",
            ))

        points.sort(key=lambda p: p.index)
        return points

    # ─── Bayesian Online Change Point Detection ─────────────
    def _detect_bayesian(self, values: List[float]) -> List[ChangePoint]:
        """
        Simplified Bayesian online CP detection:
          track the running mean + variance
          for each new point, compute P(change happened here)
          if P > 0.8, declare a change point
        """
        points: List[ChangePoint] = []
        n = len(values)
        if n < 8:
            return points

        window_size = 5
        for i in range(window_size, n - window_size):
            before = values[max(0, i - window_size):i]
            after = values[i:i + window_size]
            if len(before) < 2 or len(after) < 2:
                continue
            mean_before = statistics.mean(before)
            mean_after = statistics.mean(after)
            std_before = statistics.pstdev(before) if len(before) > 1 else 1e-6
            std_after = statistics.pstdev(after) if len(after) > 1 else 1e-6
            # Welch-like t-statistic
            pooled_se = math.sqrt(
                (std_before ** 2 / len(before)) + (std_after ** 2 / len(after))
            )
            if pooled_se < 1e-9:
                continue
            t = abs(mean_before - mean_after) / pooled_se
            # Pseudo posterior probability
            p_change = 1.0 / (1.0 + math.exp(-t + 2))  # sigmoid
            if p_change > 0.8:
                points.append(ChangePoint(
                    index=i,
                    value=values[i],
                    confidence=round(p_change, 3),
                    regime_before_mean=round(mean_before, 3),
                    regime_after_mean=round(mean_after, 3),
                    shift_magnitude=round(abs(mean_after - mean_before), 3),
                    direction="up" if mean_after > mean_before else "down",
                ))
        # Dedupe nearby change points
        if len(points) > 1:
            deduped = [points[0]]
            for p in points[1:]:
                if p.index - deduped[-1].index >= 3:
                    deduped.append(p)
            points = deduped
        return points

    def _split_into_segments(
        self,
        values: List[float],
        points: List[ChangePoint],
    ) -> List[List[float]]:
        segments: List[List[float]] = []
        last = 0
        for p in points:
            segments.append(values[last:p.index])
            last = p.index
        segments.append(values[last:])
        return [s for s in segments if s]

    def _build_narrative(
        self,
        points: List[ChangePoint],
        regimes: int,
        variance_explained: float,
    ) -> str:
        if not points:
            return "No significant change points detected — the series is stable."
        first = points[0]
        parts = [
            f"Detected {len(points)} change point(s) creating {regimes} distinct regimes.",
            f"{int(variance_explained * 100)}% of variance explained by the segmentation.",
            f"First change at index {first.index}: {first.direction}-shift from "
            f"{first.regime_before_mean:.2f} to {first.regime_after_mean:.2f} "
            f"(magnitude {first.shift_magnitude:.2f}, confidence {first.confidence:.2f}).",
        ]
        return " ".join(parts)
