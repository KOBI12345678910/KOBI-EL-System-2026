"""
Forecast Engine — time series forecasting for KPIs and state trends.

Implements three pure-Python forecasters:

  1. NaiveLastValue   — "tomorrow = today"
  2. MovingAverage    — simple / weighted / exponential
  3. LinearTrend      — ordinary least squares on (index, value)

Plus a FORECAST COMBINER that runs all three and picks the one with
the lowest in-sample error.

Input: a list of (timestamp, value) tuples (any numeric sequence)
Output: ForecastResult with predicted next N values, confidence
        interval, trend direction, and method chosen.

Used by:
  - Cashflow forecasting on `Invoice.amount` events
  - Inventory forecasting on `Material.qty_on_hand` trends
  - Command-center KPI projections
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ForecastMethod(str, Enum):
    NAIVE = "naive"
    MOVING_AVERAGE = "moving_average"
    EXPONENTIAL = "exponential"
    LINEAR_TREND = "linear_trend"
    AUTO = "auto"


class TrendDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"
    VOLATILE = "volatile"


@dataclass
class ForecastPoint:
    index: int
    predicted: float
    lower: float
    upper: float


@dataclass
class ForecastResult:
    method: ForecastMethod
    history_length: int
    predictions: List[ForecastPoint]
    mean: float
    stdev: float
    trend: TrendDirection
    slope: float
    confidence: float  # 0-1, how confident the forecast is
    in_sample_rmse: float
    generated_at: datetime = field(default_factory=utc_now)


class ForecastEngine:
    def __init__(self) -> None:
        pass

    # ─── Public API ──────────────────────────────────────────
    def forecast(
        self,
        values: List[float],
        *,
        horizon: int = 7,
        method: ForecastMethod = ForecastMethod.AUTO,
    ) -> ForecastResult:
        if len(values) < 2:
            return self._empty_result(values, horizon)

        if method == ForecastMethod.AUTO:
            return self._auto(values, horizon)

        if method == ForecastMethod.NAIVE:
            return self._naive(values, horizon)

        if method == ForecastMethod.MOVING_AVERAGE:
            return self._moving_average(values, horizon, window=min(7, len(values)))

        if method == ForecastMethod.EXPONENTIAL:
            return self._exponential(values, horizon, alpha=0.3)

        if method == ForecastMethod.LINEAR_TREND:
            return self._linear_trend(values, horizon)

        return self._naive(values, horizon)

    # ─── Auto-selection ──────────────────────────────────────
    def _auto(self, values: List[float], horizon: int) -> ForecastResult:
        candidates = [
            self._naive(values, horizon),
            self._moving_average(values, horizon, window=min(7, len(values))),
            self._exponential(values, horizon, alpha=0.3),
            self._linear_trend(values, horizon),
        ]
        # Pick the one with lowest in-sample RMSE
        best = min(candidates, key=lambda r: r.in_sample_rmse)
        return best

    # ─── Methods ─────────────────────────────────────────────
    def _naive(self, values: List[float], horizon: int) -> ForecastResult:
        last = values[-1]
        preds = [ForecastPoint(i, last, last * 0.9, last * 1.1) for i in range(horizon)]
        rmse = self._rmse_naive(values)
        return self._build_result(
            values=values,
            method=ForecastMethod.NAIVE,
            predictions=preds,
            slope=0.0,
            rmse=rmse,
        )

    def _moving_average(
        self, values: List[float], horizon: int, window: int
    ) -> ForecastResult:
        window = max(1, min(window, len(values)))
        recent = values[-window:]
        avg = sum(recent) / len(recent)
        stdev = statistics.pstdev(recent) if len(recent) > 1 else 0
        preds = [
            ForecastPoint(i, avg, avg - 1.5 * stdev, avg + 1.5 * stdev)
            for i in range(horizon)
        ]
        # In-sample RMSE: predict each point as the moving average of the
        # preceding window
        errors: List[float] = []
        for i in range(window, len(values)):
            pred = sum(values[i - window:i]) / window
            errors.append((values[i] - pred) ** 2)
        rmse = math.sqrt(sum(errors) / len(errors)) if errors else 0
        return self._build_result(
            values=values,
            method=ForecastMethod.MOVING_AVERAGE,
            predictions=preds,
            slope=0.0,
            rmse=rmse,
        )

    def _exponential(
        self, values: List[float], horizon: int, alpha: float
    ) -> ForecastResult:
        # Simple exponential smoothing (no trend/seasonality)
        smoothed = values[0]
        errors: List[float] = []
        for v in values[1:]:
            errors.append((v - smoothed) ** 2)
            smoothed = alpha * v + (1 - alpha) * smoothed
        rmse = math.sqrt(sum(errors) / len(errors)) if errors else 0
        stdev = statistics.pstdev(values) if len(values) > 1 else 0
        preds = [
            ForecastPoint(i, smoothed, smoothed - 1.5 * stdev, smoothed + 1.5 * stdev)
            for i in range(horizon)
        ]
        return self._build_result(
            values=values,
            method=ForecastMethod.EXPONENTIAL,
            predictions=preds,
            slope=0.0,
            rmse=rmse,
        )

    def _linear_trend(self, values: List[float], horizon: int) -> ForecastResult:
        # Ordinary least squares on (index, value)
        n = len(values)
        xs = list(range(n))
        mean_x = sum(xs) / n
        mean_y = sum(values) / n
        numerator = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n))
        denominator = sum((xs[i] - mean_x) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0
        intercept = mean_y - slope * mean_x

        # In-sample RMSE
        errors = [(values[i] - (intercept + slope * xs[i])) ** 2 for i in range(n)]
        rmse = math.sqrt(sum(errors) / n) if n else 0

        # Predict next `horizon` points
        residual_stdev = math.sqrt(sum(errors) / max(1, n - 2))
        preds = [
            ForecastPoint(
                i,
                intercept + slope * (n + i),
                intercept + slope * (n + i) - 1.5 * residual_stdev,
                intercept + slope * (n + i) + 1.5 * residual_stdev,
            )
            for i in range(horizon)
        ]
        return self._build_result(
            values=values,
            method=ForecastMethod.LINEAR_TREND,
            predictions=preds,
            slope=slope,
            rmse=rmse,
        )

    # ─── Helpers ─────────────────────────────────────────────
    def _rmse_naive(self, values: List[float]) -> float:
        if len(values) < 2:
            return 0.0
        errors = [(values[i] - values[i - 1]) ** 2 for i in range(1, len(values))]
        return math.sqrt(sum(errors) / len(errors))

    def _build_result(
        self,
        values: List[float],
        method: ForecastMethod,
        predictions: List[ForecastPoint],
        slope: float,
        rmse: float,
    ) -> ForecastResult:
        mean = sum(values) / len(values)
        stdev = statistics.pstdev(values) if len(values) > 1 else 0.0
        trend = self._classify_trend(values, slope, stdev)
        # Confidence inversely proportional to in-sample RMSE relative
        # to the range
        value_range = max(values) - min(values) if values else 1.0
        confidence = 1.0 - min(1.0, rmse / max(1.0, value_range)) if value_range > 0 else 0.5
        return ForecastResult(
            method=method,
            history_length=len(values),
            predictions=predictions,
            mean=mean,
            stdev=stdev,
            trend=trend,
            slope=slope,
            confidence=round(confidence, 3),
            in_sample_rmse=round(rmse, 3),
        )

    def _classify_trend(
        self, values: List[float], slope: float, stdev: float
    ) -> TrendDirection:
        if not values:
            return TrendDirection.FLAT
        mean = sum(values) / len(values)
        if mean == 0:
            return TrendDirection.FLAT
        cv = stdev / abs(mean)  # coefficient of variation
        if cv > 0.5:
            return TrendDirection.VOLATILE
        rel_slope = slope / max(1e-9, abs(mean))
        if rel_slope > 0.01:
            return TrendDirection.UP
        if rel_slope < -0.01:
            return TrendDirection.DOWN
        return TrendDirection.FLAT

    def _empty_result(self, values: List[float], horizon: int) -> ForecastResult:
        last = values[-1] if values else 0.0
        return ForecastResult(
            method=ForecastMethod.NAIVE,
            history_length=len(values),
            predictions=[ForecastPoint(i, last, last, last) for i in range(horizon)],
            mean=last,
            stdev=0.0,
            trend=TrendDirection.FLAT,
            slope=0.0,
            confidence=0.0,
            in_sample_rmse=0.0,
        )
