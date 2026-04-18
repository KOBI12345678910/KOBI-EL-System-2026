"""
AI Orchestrator — the autonomous brain of the platform.

This is the "nervous system" that ties every other engine together:

  1. Continuously reads the live state of every module
  2. Cross-references entities across systems via the graph
  3. Detects patterns, anomalies, and bottlenecks
  4. Produces a unified "company picture" snapshot
  5. Calls Claude for reasoning on critical situations
  6. Publishes `unified_picture_updated` events on the event bus
  7. Optionally triggers autonomous actions through the ActionEngine
     (subject to policy guardrails)

The orchestrator runs in two modes:

  SYNC mode    — build_snapshot(tenant_id) is called from an API
                 endpoint to return a fresh snapshot on demand.

  ASYNC mode   — an asyncio task loop runs every N seconds and
                 persists the latest snapshot + publishes events.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.db import SessionLocal
from app.engines.alert_engine import AlertEngine
from app.engines.claude_adapter import ClaudeAdapter
from app.engines.graph_traversal import GraphTraversalEngine
from app.models.alerts import AlertModel
from app.models.events import DomainEventModel
from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel
from app.models.workflow import WorkflowInstanceModel


# ════════════════════════════════════════════════════════════════
# DATA CLASSES
# ════════════════════════════════════════════════════════════════

@dataclass
class ModuleHealth:
    module: str
    entity_count: int
    at_risk_count: int
    blocked_count: int
    open_alerts_count: int
    recent_events_count: int
    health_score: float  # 0-100
    status: str          # healthy | warning | critical


@dataclass
class CausalHotspot:
    entity_id: str
    entity_type: str
    name: str
    status: str
    risk_score: float
    downstream_count: int
    downstream_sample: List[Dict[str, Any]]
    severity: str        # info | warning | high | critical


@dataclass
class AIRecommendation:
    recommendation_id: str
    severity: str
    entity_id: Optional[str]
    title: str
    reasoning: str
    suggested_action: Optional[str] = None
    confidence: float = 0.7


@dataclass
class CompanySnapshot:
    generated_at: datetime
    tenant_id: str
    overall_health_score: float
    total_objects: int
    total_events: int
    total_alerts: int
    at_risk_entities: int
    blocked_entities: int
    active_workflows: int
    stalled_workflows: int
    by_entity_type: Dict[str, int]
    module_health: List[ModuleHealth]
    causal_hotspots: List[CausalHotspot]
    top_open_alerts: List[Dict[str, Any]]
    recent_critical_events: List[Dict[str, Any]]
    ai_recommendations: List[AIRecommendation]
    ai_summary: str = ""


# ════════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ════════════════════════════════════════════════════════════════

class AIOrchestrator:
    """
    The single brain. One instance per tenant or one global instance.
    """

    MODULE_GROUPS = {
        "sales": ["Customer", "Lead", "Quote", "Order"],
        "procurement": ["Supplier", "PurchaseOrder"],
        "operations": ["Project", "ProductionOrder", "Installation"],
        "inventory": ["Material", "StockItem"],
        "finance": ["Invoice", "Payment"],
        "people": ["Employee"],
    }

    def __init__(self, db: Session) -> None:
        self.db = db
        self.graph = GraphTraversalEngine(db)
        self.alert_engine = AlertEngine(db)

    # ─── Primary API ─────────────────────────────────────────
    async def build_snapshot(
        self,
        tenant_id: str,
        *,
        include_ai_summary: bool = False,
        claude: Optional[ClaudeAdapter] = None,
    ) -> CompanySnapshot:
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
            .limit(200)
            .all()
        )
        alerts = (
            self.db.query(AlertModel)
            .filter(AlertModel.tenant_id == tenant_id)
            .filter(AlertModel.status == "open")
            .all()
        )
        workflows = (
            self.db.query(WorkflowInstanceModel)
            .filter(WorkflowInstanceModel.tenant_id == tenant_id)
            .all()
        )

        # Basic counts
        by_type: Dict[str, int] = {}
        for obj in objects:
            by_type[obj.object_type] = by_type.get(obj.object_type, 0) + 1

        at_risk = sum(1 for s in states if s.current_status == "at_risk")
        blocked = sum(1 for s in states if s.current_status == "blocked")
        active_wf = sum(1 for w in workflows if w.status == "active")
        stalled_wf = sum(
            1 for w in workflows
            if w.status == "active"
            and w.updated_at
            and (utc_now() - w.updated_at.replace(tzinfo=timezone.utc) > timedelta(hours=24))
        )

        # Module health
        module_health = self._compute_module_health(objects, states, alerts, events)

        # Causal hotspots — entities at risk that impact many others
        hotspots = self._compute_causal_hotspots(tenant_id, objects, states, limit=8)

        # Overall health score
        overall_health = self._compute_overall_health(
            objects=objects,
            states=states,
            alerts=alerts,
            module_health=module_health,
        )

        # Top alerts
        top_alerts = self._format_top_alerts(alerts)

        # Recent critical events
        recent_critical = [
            self._format_event(e)
            for e in events
            if e.severity in ("high", "critical")
        ][:10]

        # Recommendations (rule-based + AI)
        recommendations = self._build_recommendations(
            tenant_id=tenant_id,
            states=states,
            alerts=alerts,
            hotspots=hotspots,
            stalled_workflows=stalled_wf,
        )

        # Claude-generated executive summary (optional)
        ai_summary = ""
        if include_ai_summary and claude is not None:
            ai_summary = await self._build_ai_summary(claude, tenant_id, recommendations, hotspots)

        return CompanySnapshot(
            generated_at=utc_now(),
            tenant_id=tenant_id,
            overall_health_score=overall_health,
            total_objects=len(objects),
            total_events=len(events),
            total_alerts=len(alerts),
            at_risk_entities=at_risk,
            blocked_entities=blocked,
            active_workflows=active_wf,
            stalled_workflows=stalled_wf,
            by_entity_type=by_type,
            module_health=module_health,
            causal_hotspots=hotspots,
            top_open_alerts=top_alerts,
            recent_critical_events=recent_critical,
            ai_recommendations=recommendations,
            ai_summary=ai_summary,
        )

    # ─── Internal: module health ─────────────────────────────
    def _compute_module_health(
        self,
        objects: List[OntologyObject],
        states: List[EntityStateModel],
        alerts: List[AlertModel],
        events: List[DomainEventModel],
    ) -> List[ModuleHealth]:
        # Build type → list maps
        states_by_id = {s.canonical_entity_id: s for s in states}
        out: List[ModuleHealth] = []
        for module, types in self.MODULE_GROUPS.items():
            module_objects = [o for o in objects if o.object_type in types]
            module_states = [
                states_by_id[o.id]
                for o in module_objects
                if o.id in states_by_id
            ]
            module_alerts = [
                a for a in alerts
                if a.alert_type in (
                    "supplier_delayed", "inventory_low", "project_at_risk",
                    "invoice_overdue",
                ) and any(o.id == a.entity_id for o in module_objects)
            ]
            module_events = [
                e for e in events
                if e.entity_type in types
                and e.created_at
                and (utc_now() - e.created_at.replace(tzinfo=timezone.utc) < timedelta(minutes=10))
            ]
            at_risk = sum(1 for s in module_states if s.current_status == "at_risk")
            blocked = sum(1 for s in module_states if s.current_status == "blocked")

            if len(module_objects) == 0:
                score = 100.0
            else:
                bad_ratio = (at_risk + blocked) / len(module_objects)
                alert_penalty = min(30, len(module_alerts) * 5)
                score = max(0.0, min(100.0, 100 - (bad_ratio * 70) - alert_penalty))

            if score >= 85:
                status = "healthy"
            elif score >= 65:
                status = "warning"
            else:
                status = "critical"

            out.append(ModuleHealth(
                module=module,
                entity_count=len(module_objects),
                at_risk_count=at_risk,
                blocked_count=blocked,
                open_alerts_count=len(module_alerts),
                recent_events_count=len(module_events),
                health_score=round(score, 1),
                status=status,
            ))
        return out

    # ─── Internal: causal hotspots ───────────────────────────
    def _compute_causal_hotspots(
        self,
        tenant_id: str,
        objects: List[OntologyObject],
        states: List[EntityStateModel],
        limit: int = 8,
    ) -> List[CausalHotspot]:
        states_by_id = {s.canonical_entity_id: s for s in states}
        candidates: List[tuple] = []  # (downstream_count, obj, state, downstream_hits)
        for obj in objects:
            state = states_by_id.get(obj.id)
            if state is None:
                continue
            if state.current_status not in ("at_risk", "blocked"):
                continue
            hits = self.graph.downstream(obj.id, max_depth=3)
            if len(hits) == 0:
                continue
            candidates.append((len(hits), obj, state, hits))

        candidates.sort(key=lambda c: (-c[2].risk_score, -c[0]))

        out: List[CausalHotspot] = []
        for count, obj, state, hits in candidates[:limit]:
            severity = "critical" if state.risk_score >= 0.8 else "high" if state.risk_score >= 0.6 else "warning"
            out.append(CausalHotspot(
                entity_id=obj.id,
                entity_type=obj.object_type,
                name=obj.name,
                status=state.current_status,
                risk_score=state.risk_score,
                downstream_count=count,
                downstream_sample=[
                    {
                        "entity_id": h.entity_id,
                        "type": h.object_type,
                        "name": h.name,
                        "via": h.via_relation,
                        "depth": h.depth,
                    }
                    for h in hits[:5]
                ],
                severity=severity,
            ))
        return out

    # ─── Internal: overall health ────────────────────────────
    def _compute_overall_health(
        self,
        objects: List[OntologyObject],
        states: List[EntityStateModel],
        alerts: List[AlertModel],
        module_health: List[ModuleHealth],
    ) -> float:
        if not module_health:
            return 100.0
        avg_module = sum(m.health_score for m in module_health) / len(module_health)
        critical_alerts = sum(1 for a in alerts if a.severity == "critical")
        high_alerts = sum(1 for a in alerts if a.severity == "high")
        alert_penalty = min(25, (critical_alerts * 6) + (high_alerts * 2))
        blocked_penalty = min(15, sum(1 for s in states if s.current_status == "blocked") * 3)
        return round(max(0.0, min(100.0, avg_module - alert_penalty - blocked_penalty)), 1)

    # ─── Internal: formatting helpers ────────────────────────
    def _format_top_alerts(self, alerts: List[AlertModel]) -> List[Dict[str, Any]]:
        severity_order = {"critical": 0, "high": 1, "warning": 2, "info": 3}
        sorted_alerts = sorted(alerts, key=lambda a: severity_order.get(a.severity, 99))
        out: List[Dict[str, Any]] = []
        for a in sorted_alerts[:10]:
            try:
                meta = json.loads(a.metadata_json or "{}")
            except Exception:
                meta = {}
            out.append({
                "id": a.id,
                "severity": a.severity,
                "alert_type": a.alert_type,
                "entity_id": a.entity_id,
                "title": a.title,
                "description": a.description,
                "metadata": meta,
            })
        return out

    def _format_event(self, e: DomainEventModel) -> Dict[str, Any]:
        try:
            payload = json.loads(e.payload_json or "{}")
        except Exception:
            payload = {}
        return {
            "id": e.id,
            "type": e.event_type,
            "severity": e.severity,
            "entity_type": e.entity_type,
            "entity_id": e.canonical_entity_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "payload": payload,
        }

    # ─── Internal: rule-based recommendations ────────────────
    def _build_recommendations(
        self,
        tenant_id: str,
        states: List[EntityStateModel],
        alerts: List[AlertModel],
        hotspots: List[CausalHotspot],
        stalled_workflows: int,
    ) -> List[AIRecommendation]:
        recs: List[AIRecommendation] = []

        # 1. One rec per critical hotspot
        for h in hotspots:
            if h.severity not in ("critical", "high"):
                continue
            recs.append(AIRecommendation(
                recommendation_id=new_id("rec"),
                severity=h.severity,
                entity_id=h.entity_id,
                title=f"{h.name} is {h.status} and impacts {h.downstream_count} downstream entities",
                reasoning=(
                    f"Entity {h.entity_id} ({h.entity_type}) is in state '{h.status}' "
                    f"with risk_score {h.risk_score:.2f}. It is causally linked to "
                    f"{h.downstream_count} other entities. Acting on this entity "
                    f"first has the highest leverage on overall system health."
                ),
                suggested_action="Investigate root cause and execute a recovery action",
                confidence=0.82,
            ))

        # 2. If many workflows are stalled, flag it
        if stalled_workflows >= 3:
            recs.append(AIRecommendation(
                recommendation_id=new_id("rec"),
                severity="high",
                entity_id=None,
                title=f"{stalled_workflows} workflows have not progressed in 24h",
                reasoning=(
                    f"{stalled_workflows} active workflow instances have had no "
                    f"transition for over 24 hours. This usually indicates a blocked "
                    f"hand-off, missing approval, or a stuck human task."
                ),
                suggested_action="Review the stalled workflow list and unblock assigned owners",
                confidence=0.75,
            ))

        # 3. Overdue-invoice cluster
        overdue_alerts = [a for a in alerts if a.alert_type == "invoice_overdue"]
        if len(overdue_alerts) >= 2:
            recs.append(AIRecommendation(
                recommendation_id=new_id("rec"),
                severity="high",
                entity_id=None,
                title=f"{len(overdue_alerts)} overdue invoices detected",
                reasoning=(
                    f"Multiple invoices are past due. This is a direct cashflow risk. "
                    f"Trigger the collections workflow on every overdue invoice."
                ),
                suggested_action="Launch collections workflow for every overdue invoice",
                confidence=0.88,
            ))

        # 4. Critical alerts
        critical_alerts = [a for a in alerts if a.severity == "critical"]
        for a in critical_alerts[:3]:
            recs.append(AIRecommendation(
                recommendation_id=new_id("rec"),
                severity="critical",
                entity_id=a.entity_id,
                title=f"Critical alert: {a.title}",
                reasoning=a.description or "A critical alert was raised by an engine rule.",
                suggested_action="Acknowledge, investigate, and resolve within 1 hour",
                confidence=0.9,
            ))

        return recs[:10]

    # ─── Internal: Claude summary ────────────────────────────
    async def _build_ai_summary(
        self,
        claude: ClaudeAdapter,
        tenant_id: str,
        recommendations: List[AIRecommendation],
        hotspots: List[CausalHotspot],
    ) -> str:
        if not recommendations and not hotspots:
            return "System is operating normally. No critical recommendations at this time."
        ctx = {
            "tenant_id": tenant_id,
            "hotspots": [
                {
                    "entity_id": h.entity_id,
                    "name": h.name,
                    "status": h.status,
                    "risk_score": h.risk_score,
                    "downstream_count": h.downstream_count,
                }
                for h in hotspots
            ],
            "recommendations": [
                {
                    "title": r.title,
                    "severity": r.severity,
                    "reasoning": r.reasoning,
                }
                for r in recommendations
            ],
        }
        resp = await claude.call_claude(
            system_prompt=(
                "You are the AI operations director for an enterprise command "
                "center. Given a structured snapshot of the current operating "
                "state, produce a concise 3-5 sentence executive summary that a "
                "CEO could read in 30 seconds. Focus on the single most critical "
                "issue, why it matters, and what needs to happen next."
            ),
            user_message=json.dumps(ctx, ensure_ascii=False, indent=2),
        )
        return resp.completion


# ════════════════════════════════════════════════════════════════
# BACKGROUND LOOP (optional — runs under FastAPI startup)
# ════════════════════════════════════════════════════════════════

async def run_background_orchestrator(
    interval_seconds: int = 60,
    tenants: Optional[List[str]] = None,
) -> None:
    """
    Fire-and-forget background task. Produces a fresh snapshot for every
    known tenant every N seconds and publishes a `unified_picture_updated`
    event to the event bus.
    """
    from app.event_bus import event_bus
    from app.models.events import DomainEventModel

    while True:
        try:
            db = SessionLocal()
            try:
                if tenants is None:
                    # Discover tenants from the tenants table
                    from app.models.tenant import Tenant
                    tenant_rows = db.query(Tenant).filter(Tenant.is_active == True).all()
                    tenant_ids = [t.id for t in tenant_rows]
                else:
                    tenant_ids = tenants

                for tid in tenant_ids:
                    orch = AIOrchestrator(db)
                    snapshot = await orch.build_snapshot(tid)
                    # Publish a lightweight event for live dashboards
                    await event_bus.publish({
                        "topic": "unified_picture_updated",
                        "tenant_id": tid,
                        "generated_at": snapshot.generated_at.isoformat(),
                        "overall_health_score": snapshot.overall_health_score,
                        "total_objects": snapshot.total_objects,
                        "at_risk_entities": snapshot.at_risk_entities,
                        "causal_hotspots_count": len(snapshot.causal_hotspots),
                    })
            finally:
                db.close()
        except Exception as exc:
            print(f"[ai_orchestrator] background error: {exc}")

        await asyncio.sleep(interval_seconds)
