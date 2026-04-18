"""
Graph Summarizer — compress the entire ontology + live state into a
2-page executive briefing.

Walks the AIOrchestrator snapshot, picks the 5-10 most important
signals, and formats them as plain text suitable for:
  - Slack daily brief
  - Email to a CEO
  - Claude system prompt for grounded reasoning

Uses the template_engine for formatting.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.ai_orchestrator import AIOrchestrator
from app.engines.capacity_planning import CapacityPlanningEngine
from app.engines.cost_engine import CostEngine
from app.engines.sla_manager import SLAManager


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ExecutiveBriefing:
    tenant_id: str
    tenant_name: str
    overall_health: float
    headline: str
    bullet_points: List[str]
    top_risks: List[str]
    top_wins: List[str]
    recommended_actions: List[str]
    financial_summary: Dict[str, Any]
    generated_at: datetime = field(default_factory=utc_now)


class GraphSummarizer:
    def __init__(self, db: Session) -> None:
        self.db = db

    async def build_briefing(self, tenant_id: str) -> ExecutiveBriefing:
        orchestrator = AIOrchestrator(db=self.db)
        snapshot = await orchestrator.build_snapshot(tenant_id)

        cost = CostEngine(self.db).compute_company_pl(tenant_id)
        capacity = CapacityPlanningEngine(self.db).build_report(tenant_id)
        sla = SLAManager(self.db).evaluate(tenant_id)

        # Headline
        if snapshot.overall_health_score >= 85:
            headline = f"Operations running smoothly at {snapshot.overall_health_score:.0f}/100 health."
        elif snapshot.overall_health_score >= 65:
            headline = f"Attention required — health at {snapshot.overall_health_score:.0f}/100 with {snapshot.at_risk_entities} at-risk entities."
        else:
            headline = f"CRITICAL — health at {snapshot.overall_health_score:.0f}/100. Immediate action needed."

        bullets: List[str] = [
            f"Total entities tracked: {snapshot.total_objects}",
            f"At-risk: {snapshot.at_risk_entities} | Blocked: {snapshot.blocked_entities}",
            f"Active workflows: {snapshot.active_workflows} ({snapshot.stalled_workflows} stalled)",
            f"Capacity utilization: {capacity.overall_utilization_pct:.0f}%, headroom {capacity.headroom_pct:.0f}%",
            f"SLA compliance: {sla.compliance_rate:.1f}% ({len(sla.breaches)} breaches)",
        ]

        top_risks: List[str] = []
        for h in snapshot.causal_hotspots[:3]:
            top_risks.append(
                f"{h.entity_type} '{h.name}' — {h.severity} (risk={h.risk_score:.2f}, "
                f"{h.downstream_count} downstream deps)"
            )
        for breach in sla.breaches[:2]:
            top_risks.append(f"SLA: {breach.sla_name} — {breach.entity_name}")

        top_wins: List[str] = []
        if cost.total_revenue_ils > 0:
            top_wins.append(f"Revenue ₪{cost.total_revenue_ils:,.0f} this period")
        if capacity.headroom_pct > 20:
            top_wins.append(f"Healthy capacity headroom: {capacity.headroom_pct:.0f}%")
        if sla.compliance_rate > 90:
            top_wins.append(f"SLA compliance {sla.compliance_rate:.0f}%")

        recommended_actions: List[str] = []
        for rec in snapshot.ai_recommendations[:3]:
            if rec.suggested_action:
                recommended_actions.append(
                    f"[{rec.severity}] {rec.title}: {rec.suggested_action}"
                )
        for bottleneck in capacity.bottlenecks[:2]:
            recommended_actions.append(
                f"[{bottleneck.severity}] {bottleneck.name}: {bottleneck.recommendation}"
            )

        return ExecutiveBriefing(
            tenant_id=tenant_id,
            tenant_name=tenant_id,
            overall_health=snapshot.overall_health_score,
            headline=headline,
            bullet_points=bullets,
            top_risks=top_risks,
            top_wins=top_wins,
            recommended_actions=recommended_actions,
            financial_summary={
                "revenue_ils": cost.total_revenue_ils,
                "profit_ils": cost.gross_profit_ils,
                "margin_pct": cost.gross_margin_pct,
                "at_risk_exposure_ils": cost.at_risk_exposure_ils,
            },
        )

    def format_as_text(self, briefing: ExecutiveBriefing) -> str:
        lines: List[str] = []
        lines.append(f"# Executive Briefing — {briefing.tenant_name}")
        lines.append(f"# Generated: {briefing.generated_at.isoformat()}")
        lines.append("")
        lines.append(f"## Headline")
        lines.append(briefing.headline)
        lines.append("")
        lines.append(f"## Key Metrics")
        for b in briefing.bullet_points:
            lines.append(f"  • {b}")
        lines.append("")
        if briefing.top_risks:
            lines.append(f"## Top Risks")
            for r in briefing.top_risks:
                lines.append(f"  ⚠ {r}")
            lines.append("")
        if briefing.top_wins:
            lines.append(f"## Top Wins")
            for w in briefing.top_wins:
                lines.append(f"  ✓ {w}")
            lines.append("")
        if briefing.recommended_actions:
            lines.append(f"## Recommended Actions")
            for a in briefing.recommended_actions:
                lines.append(f"  → {a}")
            lines.append("")
        lines.append(f"## Financial Summary")
        lines.append(f"  Revenue: ₪{briefing.financial_summary['revenue_ils']:,.0f}")
        lines.append(f"  Profit: ₪{briefing.financial_summary['profit_ils']:,.0f}")
        lines.append(f"  Margin: {briefing.financial_summary['margin_pct']:.1f}%")
        lines.append(f"  At-risk exposure: ₪{briefing.financial_summary['at_risk_exposure_ils']:,.0f}")
        return "\n".join(lines)
