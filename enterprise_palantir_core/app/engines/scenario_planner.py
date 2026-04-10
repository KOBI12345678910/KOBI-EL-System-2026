"""
Scenario Planner — runs what-if analyses combining SIMULATION +
COST + CAPACITY + RISK engines into coherent scenarios.

Different from simulation_engine (which only walks the graph for one
hypothetical change). The scenario planner composes multiple changes
at once and evaluates them against ALL downstream metrics:

  1. "What if we onboard a new customer with 1M ILS project?"
  2. "What if we lose our top supplier?"
  3. "What if we reduce headcount by 20%?"
  4. "What if we add 2 new production lines?"
  5. "What if we fast-track the delayed project?"

Each scenario returns a ScenarioResult with:
  - before/after health score delta
  - P&L delta (revenue + cost + profit)
  - capacity delta
  - risk delta
  - 3 top risks introduced
  - 3 top opportunities created
  - plain-English summary
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.capacity_planning import CapacityPlanningEngine
from app.engines.cost_engine import CostEngine
from app.engines.risk_scoring import RiskScoringEngine
from app.engines.simulation_engine import HypotheticalChange, SimulationEngine


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ScenarioType(str, Enum):
    ONBOARD_CUSTOMER = "onboard_customer"
    LOSE_SUPPLIER = "lose_supplier"
    REDUCE_HEADCOUNT = "reduce_headcount"
    ADD_PRODUCTION_LINE = "add_production_line"
    FAST_TRACK_PROJECT = "fast_track_project"
    CUSTOM = "custom"


@dataclass
class ScenarioImpact:
    health_before: float
    health_after: float
    health_delta: float
    revenue_before_ils: float
    revenue_after_ils: float
    revenue_delta_ils: float
    cost_before_ils: float
    cost_after_ils: float
    cost_delta_ils: float
    profit_before_ils: float
    profit_after_ils: float
    profit_delta_ils: float
    capacity_before_pct: float
    capacity_after_pct: float
    capacity_delta_pct: float
    critical_risks_before: int
    critical_risks_after: int


@dataclass
class ScenarioResult:
    scenario_id: str
    scenario_type: ScenarioType
    title: str
    description: str
    tenant_id: str
    impact: ScenarioImpact
    new_risks: List[Dict[str, Any]]
    new_opportunities: List[Dict[str, Any]]
    summary: str
    confidence: float  # 0-1
    generated_at: datetime = field(default_factory=utc_now)


class ScenarioPlanner:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.sim = SimulationEngine(db)
        self.cost = CostEngine(db)
        self.capacity = CapacityPlanningEngine(db)
        self.risk = RiskScoringEngine(db)

    def run_scenario(
        self,
        *,
        tenant_id: str,
        scenario_type: ScenarioType,
        parameters: Dict[str, Any],
    ) -> ScenarioResult:
        # Capture "before" baseline
        before_pl = self.cost.compute_company_pl(tenant_id)
        before_cap = self.capacity.build_report(tenant_id)
        before_risk = self.risk.score_tenant(tenant_id, limit=50)

        # Apply scenario
        if scenario_type == ScenarioType.LOSE_SUPPLIER:
            result = self._scenario_lose_supplier(tenant_id, parameters, before_pl, before_cap, before_risk)
        elif scenario_type == ScenarioType.ONBOARD_CUSTOMER:
            result = self._scenario_onboard_customer(tenant_id, parameters, before_pl, before_cap, before_risk)
        elif scenario_type == ScenarioType.REDUCE_HEADCOUNT:
            result = self._scenario_reduce_headcount(tenant_id, parameters, before_pl, before_cap, before_risk)
        elif scenario_type == ScenarioType.FAST_TRACK_PROJECT:
            result = self._scenario_fast_track(tenant_id, parameters, before_pl, before_cap, before_risk)
        else:
            result = self._scenario_custom(tenant_id, parameters, before_pl, before_cap, before_risk)
        return result

    # ─── Scenario implementations ────────────────────────────
    def _scenario_lose_supplier(
        self,
        tenant_id: str,
        params: Dict[str, Any],
        before_pl: Any,
        before_cap: Any,
        before_risk: Any,
    ) -> ScenarioResult:
        supplier_id = params.get("supplier_entity_id", "")
        # Simulate: supplier delayed 60 days = effectively lost
        sim_result = self.sim.simulate(
            tenant_id=tenant_id,
            changes=[HypotheticalChange(
                entity_id=supplier_id,
                change_type="add_delay_days",
                delay_days=60,
            )],
            max_depth=5,
        )

        # Estimate financial impact: 70% of at-risk projects won't complete on time
        impacted_projects = [
            i for i in sim_result.impacted_entities if i.entity_type == "Project"
        ]
        lost_revenue = before_pl.total_revenue_ils * 0.15 * len(impacted_projects) / max(1, 5)
        added_cost = before_pl.total_direct_cost_ils * 0.05  # expedited shipping

        impact = ScenarioImpact(
            health_before=sim_result.previous_overall_health,
            health_after=sim_result.hypothetical_overall_health,
            health_delta=sim_result.delta_health,
            revenue_before_ils=before_pl.total_revenue_ils,
            revenue_after_ils=round(before_pl.total_revenue_ils - lost_revenue, 2),
            revenue_delta_ils=round(-lost_revenue, 2),
            cost_before_ils=before_pl.total_direct_cost_ils,
            cost_after_ils=round(before_pl.total_direct_cost_ils + added_cost, 2),
            cost_delta_ils=round(added_cost, 2),
            profit_before_ils=before_pl.gross_profit_ils,
            profit_after_ils=round(before_pl.gross_profit_ils - lost_revenue - added_cost, 2),
            profit_delta_ils=round(-(lost_revenue + added_cost), 2),
            capacity_before_pct=before_cap.overall_utilization_pct,
            capacity_after_pct=before_cap.overall_utilization_pct,
            capacity_delta_pct=0.0,
            critical_risks_before=before_risk.critical_count,
            critical_risks_after=before_risk.critical_count + sim_result.newly_blocked,
        )

        new_risks = [
            {
                "type": "supply_chain",
                "description": f"Loss of {supplier_id} cascades to {len(impacted_projects)} projects",
                "severity": "critical",
            },
            {
                "type": "financial",
                "description": f"Projected revenue loss of ₪{lost_revenue:,.0f}",
                "severity": "high",
            },
        ]
        new_opportunities = [
            {"description": "Diversify supplier base as contingency"},
            {"description": "Accelerate vetting of backup suppliers"},
        ]

        return ScenarioResult(
            scenario_id=f"scn_lose_sup_{int(utc_now().timestamp())}",
            scenario_type=ScenarioType.LOSE_SUPPLIER,
            title=f"What if {supplier_id} becomes unavailable?",
            description=sim_result.summary,
            tenant_id=tenant_id,
            impact=impact,
            new_risks=new_risks,
            new_opportunities=new_opportunities,
            summary=(
                f"Losing this supplier would drop overall health by "
                f"{abs(impact.health_delta):.1f} points, erode profit by "
                f"₪{abs(impact.profit_delta_ils):,.0f}, and put "
                f"{len(impacted_projects)} projects at risk. Activate contingency suppliers."
            ),
            confidence=0.75,
        )

    def _scenario_onboard_customer(
        self,
        tenant_id: str,
        params: Dict[str, Any],
        before_pl: Any,
        before_cap: Any,
        before_risk: Any,
    ) -> ScenarioResult:
        project_value = float(params.get("project_value_ils", 500_000))
        added_revenue = project_value
        added_cost = project_value * 0.70  # 70% cost ratio
        added_overhead = added_cost * 0.15

        # Capacity impact: new project adds ~5% utilization
        capacity_increase = 5.0
        new_capacity = min(100.0, before_cap.overall_utilization_pct + capacity_increase)

        impact = ScenarioImpact(
            health_before=100 - before_risk.critical_count * 5,  # approx
            health_after=100 - before_risk.critical_count * 5 - (2 if new_capacity > 90 else 0),
            health_delta=-2.0 if new_capacity > 90 else 1.0,
            revenue_before_ils=before_pl.total_revenue_ils,
            revenue_after_ils=round(before_pl.total_revenue_ils + added_revenue, 2),
            revenue_delta_ils=round(added_revenue, 2),
            cost_before_ils=before_pl.total_direct_cost_ils,
            cost_after_ils=round(before_pl.total_direct_cost_ils + added_cost, 2),
            cost_delta_ils=round(added_cost, 2),
            profit_before_ils=before_pl.gross_profit_ils,
            profit_after_ils=round(before_pl.gross_profit_ils + (added_revenue - added_cost - added_overhead), 2),
            profit_delta_ils=round(added_revenue - added_cost - added_overhead, 2),
            capacity_before_pct=before_cap.overall_utilization_pct,
            capacity_after_pct=round(new_capacity, 1),
            capacity_delta_pct=round(capacity_increase, 1),
            critical_risks_before=before_risk.critical_count,
            critical_risks_after=before_risk.critical_count,
        )

        new_risks: List[Dict[str, Any]] = []
        if new_capacity > 90:
            new_risks.append({
                "type": "capacity",
                "description": f"Platform capacity would reach {new_capacity:.1f}% — overloaded",
                "severity": "high",
            })

        new_opportunities = [
            {"description": f"Revenue increase ₪{added_revenue:,.0f}"},
            {"description": f"Profit contribution ₪{added_revenue - added_cost - added_overhead:,.0f}"},
        ]

        return ScenarioResult(
            scenario_id=f"scn_onboard_{int(utc_now().timestamp())}",
            scenario_type=ScenarioType.ONBOARD_CUSTOMER,
            title="What if we onboard a new customer?",
            description=f"New {project_value:,.0f} ILS project scenario",
            tenant_id=tenant_id,
            impact=impact,
            new_risks=new_risks,
            new_opportunities=new_opportunities,
            summary=(
                f"Onboarding this customer adds ₪{added_revenue:,.0f} revenue and "
                f"₪{added_revenue - added_cost - added_overhead:,.0f} profit. Capacity "
                f"moves from {before_cap.overall_utilization_pct:.1f}% to "
                f"{new_capacity:.1f}%."
            ),
            confidence=0.8,
        )

    def _scenario_reduce_headcount(
        self, tenant_id, params, before_pl, before_cap, before_risk
    ) -> ScenarioResult:
        reduction_pct = float(params.get("reduction_pct", 20))
        labor_cost_savings = before_pl.total_direct_cost_ils * 0.25 * (reduction_pct / 100)
        capacity_reduction = reduction_pct * 0.5  # less than 1:1 due to productivity gains

        impact = ScenarioImpact(
            health_before=100,
            health_after=max(0, 100 - reduction_pct * 0.5),
            health_delta=-reduction_pct * 0.5,
            revenue_before_ils=before_pl.total_revenue_ils,
            revenue_after_ils=before_pl.total_revenue_ils * 0.95,  # 5% revenue drop
            revenue_delta_ils=round(-before_pl.total_revenue_ils * 0.05, 2),
            cost_before_ils=before_pl.total_direct_cost_ils,
            cost_after_ils=round(before_pl.total_direct_cost_ils - labor_cost_savings, 2),
            cost_delta_ils=round(-labor_cost_savings, 2),
            profit_before_ils=before_pl.gross_profit_ils,
            profit_after_ils=round(before_pl.gross_profit_ils + labor_cost_savings - before_pl.total_revenue_ils * 0.05, 2),
            profit_delta_ils=round(labor_cost_savings - before_pl.total_revenue_ils * 0.05, 2),
            capacity_before_pct=before_cap.overall_utilization_pct,
            capacity_after_pct=min(100, before_cap.overall_utilization_pct + capacity_reduction),
            capacity_delta_pct=round(capacity_reduction, 1),
            critical_risks_before=before_risk.critical_count,
            critical_risks_after=before_risk.critical_count + 1,
        )
        return ScenarioResult(
            scenario_id=f"scn_headcount_{int(utc_now().timestamp())}",
            scenario_type=ScenarioType.REDUCE_HEADCOUNT,
            title=f"What if we reduce headcount by {reduction_pct}%?",
            description="Cost-cutting scenario",
            tenant_id=tenant_id,
            impact=impact,
            new_risks=[
                {"type": "operational", "description": "Remaining employees will be overloaded", "severity": "high"},
                {"type": "revenue", "description": "5% estimated revenue drop from reduced capacity", "severity": "high"},
            ],
            new_opportunities=[
                {"description": f"Cost savings ₪{labor_cost_savings:,.0f}"},
            ],
            summary=(
                f"Reducing headcount by {reduction_pct}% saves ₪{labor_cost_savings:,.0f} "
                f"but pushes capacity utilization from "
                f"{before_cap.overall_utilization_pct:.1f}% to "
                f"{before_cap.overall_utilization_pct + capacity_reduction:.1f}%."
            ),
            confidence=0.65,
        )

    def _scenario_fast_track(
        self, tenant_id, params, before_pl, before_cap, before_risk
    ) -> ScenarioResult:
        project_id = params.get("project_entity_id", "")
        fast_track_cost = float(params.get("additional_cost_ils", 50_000))
        time_saved_days = float(params.get("time_saved_days", 14))

        impact = ScenarioImpact(
            health_before=100 - before_risk.critical_count * 5,
            health_after=100 - max(0, before_risk.critical_count - 1) * 5,
            health_delta=5.0,
            revenue_before_ils=before_pl.total_revenue_ils,
            revenue_after_ils=before_pl.total_revenue_ils,
            revenue_delta_ils=0.0,
            cost_before_ils=before_pl.total_direct_cost_ils,
            cost_after_ils=before_pl.total_direct_cost_ils + fast_track_cost,
            cost_delta_ils=fast_track_cost,
            profit_before_ils=before_pl.gross_profit_ils,
            profit_after_ils=before_pl.gross_profit_ils - fast_track_cost,
            profit_delta_ils=-fast_track_cost,
            capacity_before_pct=before_cap.overall_utilization_pct,
            capacity_after_pct=min(100, before_cap.overall_utilization_pct + 10),
            capacity_delta_pct=10.0,
            critical_risks_before=before_risk.critical_count,
            critical_risks_after=max(0, before_risk.critical_count - 1),
        )
        return ScenarioResult(
            scenario_id=f"scn_fasttrack_{int(utc_now().timestamp())}",
            scenario_type=ScenarioType.FAST_TRACK_PROJECT,
            title=f"What if we fast-track project {project_id}?",
            description=f"Spend ₪{fast_track_cost:,.0f} to save {time_saved_days:.0f} days",
            tenant_id=tenant_id,
            impact=impact,
            new_risks=[
                {"type": "cost", "description": f"Additional cost ₪{fast_track_cost:,.0f}", "severity": "warning"},
            ],
            new_opportunities=[
                {"description": f"Finish {time_saved_days:.0f} days early"},
                {"description": "Remove 1 critical risk from the leaderboard"},
            ],
            summary=(
                f"Fast-tracking would remove one critical risk and finish "
                f"{time_saved_days:.0f} days early at a cost of ₪{fast_track_cost:,.0f}."
            ),
            confidence=0.7,
        )

    def _scenario_custom(
        self, tenant_id, params, before_pl, before_cap, before_risk
    ) -> ScenarioResult:
        # Pass through raw HypotheticalChange list
        changes_raw = params.get("changes", [])
        changes = [
            HypotheticalChange(
                entity_id=c["entity_id"],
                change_type=c["change_type"],
                new_status=c.get("new_status"),
                new_risk_score=c.get("new_risk_score"),
                delay_days=c.get("delay_days"),
            )
            for c in changes_raw
        ]
        sim_result = self.sim.simulate(tenant_id=tenant_id, changes=changes)

        impact = ScenarioImpact(
            health_before=sim_result.previous_overall_health,
            health_after=sim_result.hypothetical_overall_health,
            health_delta=sim_result.delta_health,
            revenue_before_ils=before_pl.total_revenue_ils,
            revenue_after_ils=before_pl.total_revenue_ils,
            revenue_delta_ils=0.0,
            cost_before_ils=before_pl.total_direct_cost_ils,
            cost_after_ils=before_pl.total_direct_cost_ils,
            cost_delta_ils=0.0,
            profit_before_ils=before_pl.gross_profit_ils,
            profit_after_ils=before_pl.gross_profit_ils,
            profit_delta_ils=0.0,
            capacity_before_pct=before_cap.overall_utilization_pct,
            capacity_after_pct=before_cap.overall_utilization_pct,
            capacity_delta_pct=0.0,
            critical_risks_before=before_risk.critical_count,
            critical_risks_after=before_risk.critical_count + sim_result.newly_blocked,
        )
        return ScenarioResult(
            scenario_id=f"scn_custom_{int(utc_now().timestamp())}",
            scenario_type=ScenarioType.CUSTOM,
            title="Custom scenario",
            description=sim_result.summary,
            tenant_id=tenant_id,
            impact=impact,
            new_risks=[],
            new_opportunities=[],
            summary=sim_result.summary,
            confidence=0.6,
        )
