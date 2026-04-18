"""
Risk Scoring Engine — composite risk score per entity from multiple
signal sources.

Signals (each contributes 0-100):
  1. OPERATIONAL — state.risk_score, status (at_risk/blocked)
  2. FINANCIAL   — overdue amount, collections age, margin erosion
  3. SUPPLIER    — on_time_rate, delay_days, lead_time
  4. DEPENDENCY  — count of downstream entities, depth of causal chain
  5. FRESHNESS   — last_event_at age relative to SLA
  6. QUALITY     — QC failures, data_quality violations

The composite score is a weighted sum (configurable per tenant) that
produces an overall risk rating:
  CRITICAL  (>= 80)
  HIGH      (>= 60)
  WARNING   (>= 40)
  LOW       (>= 20)
  NEGLIGIBLE (< 20)

Unlike anomaly detection (which flags individual outliers), the risk
scoring engine aggregates MULTIPLE weak signals into one trustable
score for prioritization.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.graph_traversal import GraphTraversalEngine
from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class RiskSignal:
    signal: str
    score: float  # 0-100
    weight: float  # 0-1
    contribution: float  # score * weight
    note: str = ""


@dataclass
class EntityRisk:
    entity_id: str
    entity_type: str
    name: str
    composite_score: float  # 0-100
    rating: str  # critical | high | warning | low | negligible
    signals: List[RiskSignal] = field(default_factory=list)
    top_driver: str = ""
    recommended_actions: List[str] = field(default_factory=list)


@dataclass
class RiskLeaderboard:
    tenant_id: str
    generated_at: datetime
    total_entities_scored: int
    critical_count: int
    high_count: int
    warning_count: int
    rankings: List[EntityRisk]


class RiskScoringEngine:
    DEFAULT_WEIGHTS = {
        "operational": 0.30,
        "financial": 0.20,
        "supplier": 0.15,
        "dependency": 0.15,
        "freshness": 0.10,
        "quality": 0.10,
    }

    def __init__(self, db: Session, weights: Optional[Dict[str, float]] = None) -> None:
        self.db = db
        self.weights = weights or self.DEFAULT_WEIGHTS
        self.graph = GraphTraversalEngine(db)

    def score_tenant(self, tenant_id: str, *, limit: int = 50) -> RiskLeaderboard:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        states = (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.tenant_id == tenant_id)
            .all()
        )
        states_by_id = {s.canonical_entity_id: s for s in states}
        props_by_id: Dict[str, Dict[str, Any]] = {}
        for obj in objects:
            try:
                props_by_id[obj.id] = json.loads(obj.properties_json or "{}")
            except Exception:
                props_by_id[obj.id] = {}

        rankings: List[EntityRisk] = []
        for obj in objects:
            state = states_by_id.get(obj.id)
            props = props_by_id[obj.id]
            entity_risk = self._score_entity(obj, props, state)
            if entity_risk.composite_score > 0:
                rankings.append(entity_risk)

        rankings.sort(key=lambda r: -r.composite_score)
        rankings = rankings[:limit]

        critical_count = sum(1 for r in rankings if r.rating == "critical")
        high_count = sum(1 for r in rankings if r.rating == "high")
        warning_count = sum(1 for r in rankings if r.rating == "warning")

        return RiskLeaderboard(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            total_entities_scored=len(rankings),
            critical_count=critical_count,
            high_count=high_count,
            warning_count=warning_count,
            rankings=rankings,
        )

    def _score_entity(
        self,
        obj: OntologyObject,
        props: Dict[str, Any],
        state: Optional[EntityStateModel],
    ) -> EntityRisk:
        signals: List[RiskSignal] = []

        # 1. Operational
        op_score = 0.0
        op_note = "no operational signal"
        if state is not None:
            op_score = state.risk_score * 100
            if state.current_status == "blocked":
                op_score = max(op_score, 90)
                op_note = "entity is blocked"
            elif state.current_status == "at_risk":
                op_score = max(op_score, 70)
                op_note = "entity is at_risk"
            elif state.current_status == "delayed":
                op_score = max(op_score, 60)
                op_note = "entity is delayed"
            else:
                op_note = f"status={state.current_status}, risk={state.risk_score:.2f}"
        signals.append(self._build_signal("operational", op_score, op_note))

        # 2. Financial
        fin_score = 0.0
        fin_note = "no financial signal"
        amount = self._as_float(props.get("amount_ils")) or self._as_float(props.get("value_ils"))
        days_overdue = self._as_float(props.get("days_overdue"))
        if days_overdue > 0:
            fin_score = min(100, days_overdue * 2)
            fin_note = f"overdue {days_overdue:.0f} days"
        elif props.get("status") in ("overdue", "at_risk"):
            fin_score = 60
            fin_note = "financial status flag"
        elif amount > 100_000 and state and state.risk_score > 0.5:
            fin_score = 40
            fin_note = f"high-value item ({amount:.0f} ILS) at risk"
        signals.append(self._build_signal("financial", fin_score, fin_note))

        # 3. Supplier
        sup_score = 0.0
        sup_note = "not a supplier"
        if obj.object_type == "Supplier":
            on_time = self._as_float(props.get("on_time_rate"))
            if on_time > 0:
                sup_score = (1 - on_time) * 100
                sup_note = f"on_time_rate={on_time:.2f}"
            delay_days = self._as_float(props.get("delay_days"))
            if delay_days > 0:
                sup_score = max(sup_score, min(100, delay_days * 10))
                sup_note += f", delay={delay_days:.0f}d"
        signals.append(self._build_signal("supplier", sup_score, sup_note))

        # 4. Dependency
        dep_score = 0.0
        dep_note = "no downstream dependencies"
        try:
            downstream = self.graph.downstream(obj.id, max_depth=3)
            count = len(downstream)
            if count > 0:
                dep_score = min(100, count * 10)
                dep_note = f"{count} downstream dependencies"
        except Exception:
            pass
        signals.append(self._build_signal("dependency", dep_score, dep_note))

        # 5. Freshness
        fresh_score = 0.0
        fresh_note = "no freshness signal"
        if state is not None and state.updated_at:
            last_aware = state.updated_at if state.updated_at.tzinfo else state.updated_at.replace(tzinfo=timezone.utc)
            age_hours = (utc_now() - last_aware).total_seconds() / 3600
            if age_hours > 168:  # 1 week
                fresh_score = 80
                fresh_note = f"last event {int(age_hours)}h ago (stale)"
            elif age_hours > 24:
                fresh_score = 40
                fresh_note = f"last event {int(age_hours)}h ago"
            else:
                fresh_note = f"fresh ({int(age_hours)}h ago)"
        signals.append(self._build_signal("freshness", fresh_score, fresh_note))

        # 6. Quality
        qual_score = 0.0
        qual_note = "no quality signal"
        if props.get("blocked_by") == "material_shortage":
            qual_score = 70
            qual_note = "blocked by material shortage"
        elif state and "quality" in (state.blockers_json or ""):
            qual_score = 65
            qual_note = "quality blocker present"
        signals.append(self._build_signal("quality", qual_score, qual_note))

        # Composite
        composite = sum(s.contribution for s in signals)
        composite = round(min(100.0, composite), 1)
        rating = self._classify(composite)
        top_driver = max(signals, key=lambda s: s.contribution).signal if signals else ""

        recommendations = self._build_recommendations(obj, signals, rating)

        return EntityRisk(
            entity_id=obj.id,
            entity_type=obj.object_type,
            name=obj.name,
            composite_score=composite,
            rating=rating,
            signals=signals,
            top_driver=top_driver,
            recommended_actions=recommendations,
        )

    def _build_signal(self, signal_name: str, score: float, note: str) -> RiskSignal:
        weight = self.weights.get(signal_name, 0.0)
        return RiskSignal(
            signal=signal_name,
            score=round(score, 1),
            weight=weight,
            contribution=round(score * weight, 2),
            note=note,
        )

    def _classify(self, composite: float) -> str:
        if composite >= 80:
            return "critical"
        if composite >= 60:
            return "high"
        if composite >= 40:
            return "warning"
        if composite >= 20:
            return "low"
        return "negligible"

    def _build_recommendations(
        self, obj: OntologyObject, signals: List[RiskSignal], rating: str
    ) -> List[str]:
        recs: List[str] = []
        top = max(signals, key=lambda s: s.contribution)
        if rating in ("critical", "high"):
            recs.append(f"Investigate the {top.signal} signal first: {top.note}")
        for s in signals:
            if s.score >= 60 and s.signal == "financial":
                recs.append("Trigger the collections workflow on overdue invoices")
            if s.score >= 60 and s.signal == "supplier":
                recs.append("Escalate to supplier management — late delivery ripple")
            if s.score >= 60 and s.signal == "dependency":
                recs.append("Consider pre-emptive action: many downstream entities will be affected")
        if not recs:
            recs.append("Monitor — no immediate action required")
        return recs

    def _as_float(self, v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0
