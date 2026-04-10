"""
SLA Manager — tracks Service Level Agreements across the platform.

An SLA is a contract about:
  - a target (entity_type, workflow_type, action_type)
  - a metric (latency, freshness, completion_time)
  - a threshold (must be within X hours/days)
  - a severity on breach (warning / high / critical)

This engine:
  1. Stores SLA definitions in-memory (seed from catalog)
  2. Evaluates every entity / workflow / action against its SLAs
  3. Emits SLABreach records with time_to_breach + blast_radius
  4. Integrates with the AI orchestrator for command-center snapshots

Zero dependencies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel
from app.models.workflow import WorkflowInstanceModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SLAMetric(str, Enum):
    COMPLETION_TIME = "completion_time"
    FRESHNESS = "freshness"
    WORKFLOW_TRANSITION = "workflow_transition"
    ENTITY_PROGRESS = "entity_progress"
    FINANCIAL_RESOLUTION = "financial_resolution"


class SLASeverity(str, Enum):
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class SLADefinition:
    sla_id: str
    name: str
    description: str
    metric: SLAMetric
    target_entity_type: Optional[str] = None
    target_workflow_type: Optional[str] = None
    threshold_seconds: int = 86400  # 1 day default
    severity_on_breach: SLASeverity = SLASeverity.WARNING
    target_property: Optional[str] = None
    enabled: bool = True


@dataclass
class SLABreach:
    breach_id: str
    sla_id: str
    sla_name: str
    severity: SLASeverity
    entity_id: str
    entity_type: str
    entity_name: str
    breached_at: datetime
    time_overdue_seconds: int
    threshold_seconds: int
    description: str


@dataclass
class SLAWarning:
    """An entity approaching but not yet breaching an SLA."""
    sla_id: str
    sla_name: str
    entity_id: str
    entity_name: str
    time_remaining_seconds: int
    percent_consumed: float


@dataclass
class SLAReport:
    tenant_id: str
    generated_at: datetime
    total_slas_evaluated: int
    total_entities_evaluated: int
    breaches: List[SLABreach]
    warnings: List[SLAWarning]
    compliance_rate: float  # percent of evaluations that passed


class SLAManager:
    def __init__(self, db: Session) -> None:
        self.db = db
        self._slas: List[SLADefinition] = []
        self._counter = 0
        self._seed_default_slas()

    def register(self, sla: SLADefinition) -> None:
        self._slas.append(sla)

    def evaluate(self, tenant_id: str) -> SLAReport:
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
        workflows = (
            self.db.query(WorkflowInstanceModel)
            .filter(WorkflowInstanceModel.tenant_id == tenant_id)
            .all()
        )
        states_by_id = {s.canonical_entity_id: s for s in states}

        props_by_id: Dict[str, Dict[str, Any]] = {}
        for obj in objects:
            try:
                props_by_id[obj.id] = json.loads(obj.properties_json or "{}")
            except Exception:
                props_by_id[obj.id] = {}

        breaches: List[SLABreach] = []
        warnings: List[SLAWarning] = []
        evaluations = 0
        passes = 0

        for sla in self._slas:
            if not sla.enabled:
                continue
            if sla.metric == SLAMetric.FRESHNESS:
                b, w, e, p = self._evaluate_freshness_sla(sla, objects, states_by_id)
            elif sla.metric == SLAMetric.WORKFLOW_TRANSITION:
                b, w, e, p = self._evaluate_workflow_sla(sla, workflows)
            elif sla.metric == SLAMetric.FINANCIAL_RESOLUTION:
                b, w, e, p = self._evaluate_financial_sla(sla, objects, props_by_id)
            elif sla.metric == SLAMetric.ENTITY_PROGRESS:
                b, w, e, p = self._evaluate_progress_sla(sla, objects, props_by_id)
            else:
                continue
            breaches.extend(b)
            warnings.extend(w)
            evaluations += e
            passes += p

        compliance = (passes / evaluations * 100) if evaluations > 0 else 100.0

        return SLAReport(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            total_slas_evaluated=len([s for s in self._slas if s.enabled]),
            total_entities_evaluated=evaluations,
            breaches=breaches,
            warnings=warnings,
            compliance_rate=round(compliance, 2),
        )

    # ─── Individual metric evaluators ────────────────────────
    def _evaluate_freshness_sla(
        self,
        sla: SLADefinition,
        objects: List[OntologyObject],
        states_by_id: Dict[str, EntityStateModel],
    ):
        breaches: List[SLABreach] = []
        warnings: List[SLAWarning] = []
        evaluations = 0
        passes = 0
        for obj in objects:
            if sla.target_entity_type and obj.object_type != sla.target_entity_type:
                continue
            state = states_by_id.get(obj.id)
            if state is None or state.updated_at is None:
                continue
            evaluations += 1
            last_aware = state.updated_at if state.updated_at.tzinfo else state.updated_at.replace(tzinfo=timezone.utc)
            age = (utc_now() - last_aware).total_seconds()
            if age > sla.threshold_seconds:
                breaches.append(self._build_breach(sla, obj, age))
            elif age > sla.threshold_seconds * 0.8:
                warnings.append(SLAWarning(
                    sla_id=sla.sla_id,
                    sla_name=sla.name,
                    entity_id=obj.id,
                    entity_name=obj.name,
                    time_remaining_seconds=int(sla.threshold_seconds - age),
                    percent_consumed=round(age / sla.threshold_seconds * 100, 1),
                ))
                passes += 1
            else:
                passes += 1
        return breaches, warnings, evaluations, passes

    def _evaluate_workflow_sla(
        self,
        sla: SLADefinition,
        workflows: List[WorkflowInstanceModel],
    ):
        breaches: List[SLABreach] = []
        warnings: List[SLAWarning] = []
        evaluations = 0
        passes = 0
        for wf in workflows:
            if sla.target_workflow_type and wf.workflow_type != sla.target_workflow_type:
                continue
            if wf.status != "active":
                continue
            evaluations += 1
            if wf.updated_at is None:
                continue
            last_aware = wf.updated_at if wf.updated_at.tzinfo else wf.updated_at.replace(tzinfo=timezone.utc)
            age = (utc_now() - last_aware).total_seconds()
            if age > sla.threshold_seconds:
                self._counter += 1
                breaches.append(SLABreach(
                    breach_id=f"slab_{self._counter}",
                    sla_id=sla.sla_id,
                    sla_name=sla.name,
                    severity=sla.severity_on_breach,
                    entity_id=wf.id,
                    entity_type="WorkflowInstance",
                    entity_name=f"{wf.workflow_type}#{wf.id[:12]}",
                    breached_at=utc_now(),
                    time_overdue_seconds=int(age - sla.threshold_seconds),
                    threshold_seconds=sla.threshold_seconds,
                    description=f"Workflow has not transitioned in {int(age)}s (SLA: {sla.threshold_seconds}s)",
                ))
            else:
                passes += 1
        return breaches, warnings, evaluations, passes

    def _evaluate_financial_sla(
        self,
        sla: SLADefinition,
        objects: List[OntologyObject],
        props_by_id: Dict[str, Dict[str, Any]],
    ):
        breaches: List[SLABreach] = []
        warnings: List[SLAWarning] = []
        evaluations = 0
        passes = 0
        for obj in objects:
            if sla.target_entity_type and obj.object_type != sla.target_entity_type:
                continue
            props = props_by_id[obj.id]
            if props.get("status") != "overdue":
                continue
            evaluations += 1
            days_overdue = float(props.get("days_overdue", 0))
            threshold_days = sla.threshold_seconds / 86400
            if days_overdue > threshold_days:
                self._counter += 1
                breaches.append(SLABreach(
                    breach_id=f"slab_{self._counter}",
                    sla_id=sla.sla_id,
                    sla_name=sla.name,
                    severity=sla.severity_on_breach,
                    entity_id=obj.id,
                    entity_type=obj.object_type,
                    entity_name=obj.name,
                    breached_at=utc_now(),
                    time_overdue_seconds=int((days_overdue - threshold_days) * 86400),
                    threshold_seconds=sla.threshold_seconds,
                    description=f"{obj.name} overdue {days_overdue:.0f} days (SLA: {threshold_days:.0f})",
                ))
            else:
                passes += 1
        return breaches, warnings, evaluations, passes

    def _evaluate_progress_sla(
        self,
        sla: SLADefinition,
        objects: List[OntologyObject],
        props_by_id: Dict[str, Dict[str, Any]],
    ):
        breaches: List[SLABreach] = []
        warnings: List[SLAWarning] = []
        evaluations = 0
        passes = 0
        for obj in objects:
            if sla.target_entity_type and obj.object_type != sla.target_entity_type:
                continue
            props = props_by_id[obj.id]
            target = props.get("target_completion")
            if not target:
                continue
            evaluations += 1
            try:
                target_dt = datetime.fromisoformat(str(target).replace("Z", "+00:00"))
                if target_dt.tzinfo is None:
                    target_dt = target_dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            now = utc_now()
            progress = float(props.get("progress_pct", 0))
            if now > target_dt and progress < 100:
                overdue = (now - target_dt).total_seconds()
                self._counter += 1
                breaches.append(SLABreach(
                    breach_id=f"slab_{self._counter}",
                    sla_id=sla.sla_id,
                    sla_name=sla.name,
                    severity=sla.severity_on_breach,
                    entity_id=obj.id,
                    entity_type=obj.object_type,
                    entity_name=obj.name,
                    breached_at=utc_now(),
                    time_overdue_seconds=int(overdue),
                    threshold_seconds=sla.threshold_seconds,
                    description=f"{obj.name} past target_completion ({progress:.0f}% complete)",
                ))
            else:
                passes += 1
        return breaches, warnings, evaluations, passes

    def _build_breach(self, sla: SLADefinition, obj: OntologyObject, age_seconds: float) -> SLABreach:
        self._counter += 1
        return SLABreach(
            breach_id=f"slab_{self._counter}",
            sla_id=sla.sla_id,
            sla_name=sla.name,
            severity=sla.severity_on_breach,
            entity_id=obj.id,
            entity_type=obj.object_type,
            entity_name=obj.name,
            breached_at=utc_now(),
            time_overdue_seconds=int(age_seconds - sla.threshold_seconds),
            threshold_seconds=sla.threshold_seconds,
            description=f"{obj.name} stale for {int(age_seconds)}s",
        )

    def _seed_default_slas(self) -> None:
        self.register(SLADefinition(
            sla_id="sla.project.freshness",
            name="Project must update every 72h",
            description="Projects should have at least one event every 72 hours",
            metric=SLAMetric.FRESHNESS,
            target_entity_type="Project",
            threshold_seconds=72 * 3600,
            severity_on_breach=SLASeverity.WARNING,
        ))
        self.register(SLADefinition(
            sla_id="sla.production_order.freshness",
            name="Production order must update every 4h",
            description="Production orders should have at least one event every 4 hours",
            metric=SLAMetric.FRESHNESS,
            target_entity_type="ProductionOrder",
            threshold_seconds=4 * 3600,
            severity_on_breach=SLASeverity.HIGH,
        ))
        self.register(SLADefinition(
            sla_id="sla.invoice.overdue_30",
            name="Invoice must be resolved within 30 days of due date",
            description="An invoice that sits overdue > 30 days is an SLA breach",
            metric=SLAMetric.FINANCIAL_RESOLUTION,
            target_entity_type="Invoice",
            threshold_seconds=30 * 86400,
            severity_on_breach=SLASeverity.CRITICAL,
        ))
        self.register(SLADefinition(
            sla_id="sla.project.on_time_delivery",
            name="Project must complete by target_completion",
            description="Projects past their target_completion date are a breach",
            metric=SLAMetric.ENTITY_PROGRESS,
            target_entity_type="Project",
            threshold_seconds=0,
            severity_on_breach=SLASeverity.HIGH,
        ))
        self.register(SLADefinition(
            sla_id="sla.workflow.project_delivery",
            name="Project delivery workflow must progress within 24h",
            description="Project delivery instances stalled > 24h are a breach",
            metric=SLAMetric.WORKFLOW_TRANSITION,
            target_workflow_type="project_delivery",
            threshold_seconds=24 * 3600,
            severity_on_breach=SLASeverity.HIGH,
        ))
