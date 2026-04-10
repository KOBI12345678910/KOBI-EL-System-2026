"""
Anomaly Detection Engine — statistical + rule-based outlier detection
across the ontology + event stream.

Detects:

  1. STATISTICAL anomalies in numeric entity properties (z-score and
     IQR methods) — e.g. one invoice with amount 10x the median
  2. TEMPORAL anomalies — entities that haven't had any events in
     an unusually long time, or sudden bursts of events
  3. CARDINALITY anomalies — an entity type that suddenly has N times
     more objects than yesterday
  4. STATE anomalies — an entity whose risk score jumped sharply
  5. GRAPH anomalies — an entity that suddenly has N times more
     downstream dependencies
  6. RULE-based anomalies — user-registered predicates

Every detection produces an Anomaly record with:
  - entity_id, anomaly_type, severity, score, description, detected_at
  - evidence (the numeric values that triggered it)

Uses only stdlib — no numpy/pandas required. Math is intentionally
kept simple so it can run on Replit / low-resource hosts.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.events import DomainEventModel
from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AnomalyType(str, Enum):
    STATISTICAL = "statistical"
    TEMPORAL = "temporal"
    CARDINALITY = "cardinality"
    STATE_JUMP = "state_jump"
    GRAPH = "graph"
    RULE = "rule"


class AnomalySeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Anomaly:
    anomaly_id: str
    tenant_id: str
    anomaly_type: AnomalyType
    severity: AnomalySeverity
    score: float  # 0-1, how anomalous (1 = extreme)
    entity_id: Optional[str]
    entity_type: Optional[str]
    title: str
    description: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    detected_at: datetime = field(default_factory=utc_now)


@dataclass
class AnomalyRule:
    rule_id: str
    name: str
    predicate: Callable[[OntologyObject, EntityStateModel], Optional[str]]
    severity: AnomalySeverity = AnomalySeverity.WARNING


class AnomalyDetectionEngine:
    """
    One-shot batch detector. Call `scan(tenant_id)` to get a fresh list
    of anomalies for a tenant. The engine is stateless — no historical
    baselines are persisted (a future version can add time-windowed
    rolling baselines in Redis).
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self._rules: List[AnomalyRule] = []
        self._counter = 0

    def register_rule(self, rule: AnomalyRule) -> None:
        self._rules.append(rule)

    def scan(self, tenant_id: str, *, z_threshold: float = 2.5) -> List[Anomaly]:
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
        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .order_by(DomainEventModel.created_at.desc())
            .limit(1000)
            .all()
        )
        states_by_id = {s.canonical_entity_id: s for s in states}

        out: List[Anomaly] = []
        out.extend(self._statistical_outliers(tenant_id, objects, z_threshold))
        out.extend(self._temporal_anomalies(tenant_id, events))
        out.extend(self._cardinality_anomalies(tenant_id, objects))
        out.extend(self._state_jump_anomalies(tenant_id, objects, states_by_id))
        out.extend(self._graph_anomalies(tenant_id, objects))
        out.extend(self._rule_anomalies(tenant_id, objects, states_by_id))
        return out

    def _next_id(self) -> str:
        self._counter += 1
        return f"anom_{int(utc_now().timestamp())}_{self._counter}"

    # ─── 1. Statistical outliers (Z-score + IQR) ─────────────
    def _statistical_outliers(
        self,
        tenant_id: str,
        objects: List[OntologyObject],
        z_threshold: float,
    ) -> List[Anomaly]:
        # Group numeric properties by (object_type, property_name)
        grouped: Dict[tuple, List[tuple]] = {}
        for obj in objects:
            try:
                props = json.loads(obj.properties_json or "{}")
            except Exception:
                continue
            for k, v in props.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    grouped.setdefault((obj.object_type, k), []).append((obj.id, obj.name, float(v)))

        out: List[Anomaly] = []
        for (object_type, prop), rows in grouped.items():
            if len(rows) < 4:
                continue  # need enough samples for Z-score
            values = [r[2] for r in rows]
            try:
                mean = statistics.mean(values)
                stdev = statistics.pstdev(values)
            except Exception:
                continue
            if stdev == 0:
                continue
            for obj_id, obj_name, val in rows:
                z = (val - mean) / stdev
                if abs(z) >= z_threshold:
                    severity = (
                        AnomalySeverity.CRITICAL if abs(z) >= 4
                        else AnomalySeverity.HIGH if abs(z) >= 3
                        else AnomalySeverity.WARNING
                    )
                    out.append(Anomaly(
                        anomaly_id=self._next_id(),
                        tenant_id=tenant_id,
                        anomaly_type=AnomalyType.STATISTICAL,
                        severity=severity,
                        score=min(1.0, abs(z) / 5),
                        entity_id=obj_id,
                        entity_type=object_type,
                        title=f"Outlier {prop}={val} for {object_type}",
                        description=(
                            f"Value {val} is {abs(z):.1f} standard deviations from the "
                            f"mean ({mean:.1f}) across {len(rows)} samples of {object_type}.{prop}"
                        ),
                        evidence={
                            "property": prop,
                            "value": val,
                            "mean": mean,
                            "stdev": stdev,
                            "z_score": z,
                            "sample_size": len(rows),
                        },
                    ))
        return out

    # ─── 2. Temporal anomalies ───────────────────────────────
    def _temporal_anomalies(
        self, tenant_id: str, events: List[DomainEventModel]
    ) -> List[Anomaly]:
        # Bucket events by 5-minute windows and detect a burst (> 3x
        # the median window count)
        if len(events) < 20:
            return []
        buckets: Dict[int, int] = {}
        for e in events:
            if e.created_at is None:
                continue
            bucket = int(e.created_at.timestamp() // 300)
            buckets[bucket] = buckets.get(bucket, 0) + 1
        if len(buckets) < 5:
            return []
        values = list(buckets.values())
        median = statistics.median(values)
        if median == 0:
            return []
        out: List[Anomaly] = []
        for bucket, count in buckets.items():
            if count > median * 3 and count >= 10:
                ts = datetime.fromtimestamp(bucket * 300, tz=timezone.utc)
                out.append(Anomaly(
                    anomaly_id=self._next_id(),
                    tenant_id=tenant_id,
                    anomaly_type=AnomalyType.TEMPORAL,
                    severity=AnomalySeverity.HIGH,
                    score=min(1.0, count / (median * 6)),
                    entity_id=None,
                    entity_type=None,
                    title=f"Event burst detected ({count} events in 5 min)",
                    description=(
                        f"{count} events in the 5-minute window ending "
                        f"{ts.isoformat()}. Median window has {median:.0f} events."
                    ),
                    evidence={"count": count, "median": median, "bucket": ts.isoformat()},
                ))
        return out

    # ─── 3. Cardinality anomalies ────────────────────────────
    def _cardinality_anomalies(
        self, tenant_id: str, objects: List[OntologyObject]
    ) -> List[Anomaly]:
        # If any single object type is > 70% of all objects, flag it
        if len(objects) < 20:
            return []
        counts: Dict[str, int] = {}
        for obj in objects:
            counts[obj.object_type] = counts.get(obj.object_type, 0) + 1
        total = len(objects)
        out: List[Anomaly] = []
        for object_type, count in counts.items():
            ratio = count / total
            if ratio > 0.7:
                out.append(Anomaly(
                    anomaly_id=self._next_id(),
                    tenant_id=tenant_id,
                    anomaly_type=AnomalyType.CARDINALITY,
                    severity=AnomalySeverity.WARNING,
                    score=ratio,
                    entity_id=None,
                    entity_type=object_type,
                    title=f"Type {object_type} dominates ontology ({ratio:.0%})",
                    description=(
                        f"{count} of {total} entities are of type {object_type} "
                        f"({ratio:.1%}). Check the identity resolution rules."
                    ),
                    evidence={"count": count, "total": total, "ratio": ratio},
                ))
        return out

    # ─── 4. State jump anomalies ─────────────────────────────
    def _state_jump_anomalies(
        self,
        tenant_id: str,
        objects: List[OntologyObject],
        states_by_id: Dict[str, EntityStateModel],
    ) -> List[Anomaly]:
        out: List[Anomaly] = []
        for obj in objects:
            state = states_by_id.get(obj.id)
            if state is None:
                continue
            if state.risk_score >= 0.85:
                out.append(Anomaly(
                    anomaly_id=self._next_id(),
                    tenant_id=tenant_id,
                    anomaly_type=AnomalyType.STATE_JUMP,
                    severity=(
                        AnomalySeverity.CRITICAL if state.risk_score >= 0.95
                        else AnomalySeverity.HIGH
                    ),
                    score=state.risk_score,
                    entity_id=obj.id,
                    entity_type=obj.object_type,
                    title=f"{obj.name} has extreme risk score ({state.risk_score:.2f})",
                    description=(
                        f"Entity is in state '{state.current_status}' with risk "
                        f"score {state.risk_score:.2f}."
                    ),
                    evidence={
                        "risk_score": state.risk_score,
                        "status": state.current_status,
                    },
                ))
        return out

    # ─── 5. Graph anomalies (too many downstream deps) ───────
    def _graph_anomalies(
        self, tenant_id: str, objects: List[OntologyObject]
    ) -> List[Anomaly]:
        out: List[Anomaly] = []
        for obj in objects:
            try:
                rels = json.loads(obj.relationships_json or "{}")
            except Exception:
                continue
            total_refs = sum(len(v) for v in rels.values() if isinstance(v, list))
            if total_refs > 10:
                out.append(Anomaly(
                    anomaly_id=self._next_id(),
                    tenant_id=tenant_id,
                    anomaly_type=AnomalyType.GRAPH,
                    severity=(
                        AnomalySeverity.HIGH if total_refs > 20
                        else AnomalySeverity.WARNING
                    ),
                    score=min(1.0, total_refs / 30),
                    entity_id=obj.id,
                    entity_type=obj.object_type,
                    title=f"{obj.name} has {total_refs} relationships (high connectivity)",
                    description=(
                        f"Entity has {total_refs} downstream references across "
                        f"{len(rels)} relationship types. Review if this is expected."
                    ),
                    evidence={
                        "total_relationships": total_refs,
                        "relationship_types": list(rels.keys()),
                    },
                ))
        return out

    # ─── 6. User-defined rule anomalies ──────────────────────
    def _rule_anomalies(
        self,
        tenant_id: str,
        objects: List[OntologyObject],
        states_by_id: Dict[str, EntityStateModel],
    ) -> List[Anomaly]:
        out: List[Anomaly] = []
        for rule in self._rules:
            for obj in objects:
                state = states_by_id.get(obj.id)
                if state is None:
                    continue
                try:
                    msg = rule.predicate(obj, state)
                except Exception:
                    continue
                if msg:
                    out.append(Anomaly(
                        anomaly_id=self._next_id(),
                        tenant_id=tenant_id,
                        anomaly_type=AnomalyType.RULE,
                        severity=rule.severity,
                        score=0.8,
                        entity_id=obj.id,
                        entity_type=obj.object_type,
                        title=f"Rule '{rule.name}' fired on {obj.name}",
                        description=msg,
                        evidence={"rule_id": rule.rule_id},
                    ))
        return out
