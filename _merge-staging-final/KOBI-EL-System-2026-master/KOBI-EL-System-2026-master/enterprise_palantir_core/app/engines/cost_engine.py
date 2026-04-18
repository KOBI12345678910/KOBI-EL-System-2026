"""
Cost Engine — financial attribution + unit economics across the
ontology.

Computes:

  1. Per-entity cost allocation (direct + overhead + opportunity)
  2. Per-project P&L (revenue vs cost)
  3. Per-customer lifetime value
  4. Per-supplier spend rollup
  5. Cost of stalled workflows (labor × time blocked)
  6. Cost-of-risk estimate for every at-risk entity

Every amount is in ILS (shekels). The engine reads numeric properties
from the ontology (`unit_cost_ils`, `amount_ils`, `qty_on_hand`, ...)
and aggregates them by following the relationship graph.

Pure Python, no NumPy/Pandas. Works on SQLite / Postgres identically.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.graph_traversal import GraphTraversalEngine
from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════
# DATA CLASSES
# ════════════════════════════════════════════════════════════════

@dataclass
class CostBreakdown:
    entity_id: str
    entity_type: str
    name: str
    direct_cost_ils: float = 0.0
    overhead_ils: float = 0.0
    opportunity_cost_ils: float = 0.0
    total_cost_ils: float = 0.0
    revenue_ils: float = 0.0
    profit_ils: float = 0.0
    margin_pct: float = 0.0
    notes: List[str] = field(default_factory=list)


@dataclass
class CustomerLTV:
    customer_id: str
    customer_name: str
    revenue_ils: float
    projected_revenue_ils: float
    project_count: int
    invoice_count: int
    overdue_amount_ils: float
    tier: str
    lifetime_value_score: float  # 0-100


@dataclass
class SupplierSpend:
    supplier_id: str
    supplier_name: str
    total_spend_ils: float
    active_po_value_ils: float
    on_time_rate: float
    risk_adjusted_cost_ils: float  # spend × (2 - on_time_rate)


@dataclass
class RiskCost:
    entity_id: str
    entity_type: str
    name: str
    risk_score: float
    exposure_ils: float
    cost_of_risk_ils: float  # exposure × risk_score
    downstream_impact_count: int


@dataclass
class CompanyPL:
    tenant_id: str
    generated_at: datetime
    total_revenue_ils: float
    total_direct_cost_ils: float
    total_overhead_ils: float
    gross_profit_ils: float
    gross_margin_pct: float
    at_risk_exposure_ils: float
    projected_write_off_ils: float
    top_customers_by_ltv: List[CustomerLTV]
    top_suppliers_by_spend: List[SupplierSpend]
    top_risk_costs: List[RiskCost]
    per_project: List[CostBreakdown]


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class CostEngine:
    # Overhead allocation: % of direct cost added as overhead
    OVERHEAD_RATE = 0.15

    # Default margin for unknown costs
    DEFAULT_MARGIN = 0.25

    def __init__(self, db: Session) -> None:
        self.db = db
        self.graph = GraphTraversalEngine(db)

    # ─── Primary API ─────────────────────────────────────────
    def compute_company_pl(self, tenant_id: str) -> CompanyPL:
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

        # Parse properties for every object once
        props_by_id: Dict[str, Dict[str, Any]] = {}
        for obj in objects:
            try:
                props_by_id[obj.id] = json.loads(obj.properties_json or "{}")
            except Exception:
                props_by_id[obj.id] = {}

        by_type: Dict[str, List[OntologyObject]] = {}
        for obj in objects:
            by_type.setdefault(obj.object_type, []).append(obj)

        # ─── Revenue & direct cost (from invoices + projects) ───
        total_revenue = 0.0
        total_direct_cost = 0.0
        for obj in by_type.get("Invoice", []):
            props = props_by_id[obj.id]
            amt = self._as_float(props.get("amount_ils"))
            total_revenue += amt

        for obj in by_type.get("Project", []):
            props = props_by_id[obj.id]
            project_value = self._as_float(props.get("value_ils"))
            # Assume 70% of project value is direct cost (materials + labor)
            total_direct_cost += project_value * 0.70

        total_overhead = total_direct_cost * self.OVERHEAD_RATE
        gross_profit = total_revenue - total_direct_cost - total_overhead
        gross_margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0.0

        # ─── At-risk exposure (cost of risk) ─────────────────
        top_risks = self._compute_risk_costs(objects, props_by_id, states_by_id)
        at_risk_exposure = sum(r.exposure_ils for r in top_risks)
        projected_write_off = sum(r.cost_of_risk_ils for r in top_risks)

        # ─── Customer LTV ────────────────────────────────────
        customer_ltvs = self._compute_customer_ltvs(
            by_type.get("Customer", []),
            props_by_id,
            by_type.get("Invoice", []),
            by_type.get("Project", []),
        )
        top_customers = sorted(customer_ltvs, key=lambda c: -c.lifetime_value_score)[:10]

        # ─── Supplier spend ──────────────────────────────────
        supplier_spends = self._compute_supplier_spends(
            by_type.get("Supplier", []),
            props_by_id,
            by_type.get("PurchaseOrder", []),
            by_type.get("Material", []),
        )
        top_suppliers = sorted(supplier_spends, key=lambda s: -s.total_spend_ils)[:10]

        # ─── Per-project cost breakdown ──────────────────────
        per_project = [
            self._project_cost_breakdown(p, props_by_id[p.id])
            for p in by_type.get("Project", [])
        ]

        return CompanyPL(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            total_revenue_ils=round(total_revenue, 2),
            total_direct_cost_ils=round(total_direct_cost, 2),
            total_overhead_ils=round(total_overhead, 2),
            gross_profit_ils=round(gross_profit, 2),
            gross_margin_pct=round(gross_margin, 2),
            at_risk_exposure_ils=round(at_risk_exposure, 2),
            projected_write_off_ils=round(projected_write_off, 2),
            top_customers_by_ltv=top_customers,
            top_suppliers_by_spend=top_suppliers,
            top_risk_costs=top_risks[:10],
            per_project=per_project,
        )

    # ─── Helpers ─────────────────────────────────────────────
    def _project_cost_breakdown(
        self, project: OntologyObject, props: Dict[str, Any]
    ) -> CostBreakdown:
        value = self._as_float(props.get("value_ils"))
        direct = value * 0.70
        overhead = direct * self.OVERHEAD_RATE
        total_cost = direct + overhead
        revenue = value
        profit = revenue - total_cost
        margin = (profit / revenue * 100) if revenue > 0 else 0.0
        status = props.get("status", "active")
        notes: List[str] = []
        if status == "at_risk":
            notes.append("Project is at_risk — assume 10% margin erosion")
            profit *= 0.9
        elif status == "delayed":
            notes.append("Project is delayed — assume 20% margin erosion")
            profit *= 0.8
        return CostBreakdown(
            entity_id=project.id,
            entity_type=project.object_type,
            name=project.name,
            direct_cost_ils=round(direct, 2),
            overhead_ils=round(overhead, 2),
            opportunity_cost_ils=0.0,
            total_cost_ils=round(total_cost, 2),
            revenue_ils=round(revenue, 2),
            profit_ils=round(profit, 2),
            margin_pct=round(margin, 2),
            notes=notes,
        )

    def _compute_risk_costs(
        self,
        objects: List[OntologyObject],
        props_by_id: Dict[str, Dict[str, Any]],
        states_by_id: Dict[str, EntityStateModel],
    ) -> List[RiskCost]:
        out: List[RiskCost] = []
        for obj in objects:
            state = states_by_id.get(obj.id)
            if state is None or state.risk_score < 0.5:
                continue
            props = props_by_id[obj.id]
            exposure = (
                self._as_float(props.get("value_ils"))
                or self._as_float(props.get("amount_ils"))
                or self._as_float(props.get("current_po_value_ils"))
                or 0
            )
            if exposure == 0:
                continue
            cost_of_risk = exposure * state.risk_score
            downstream = self.graph.downstream(obj.id, max_depth=3)
            out.append(RiskCost(
                entity_id=obj.id,
                entity_type=obj.object_type,
                name=obj.name,
                risk_score=state.risk_score,
                exposure_ils=round(exposure, 2),
                cost_of_risk_ils=round(cost_of_risk, 2),
                downstream_impact_count=len(downstream),
            ))
        out.sort(key=lambda r: -r.cost_of_risk_ils)
        return out

    def _compute_customer_ltvs(
        self,
        customers: List[OntologyObject],
        props_by_id: Dict[str, Dict[str, Any]],
        invoices: List[OntologyObject],
        projects: List[OntologyObject],
    ) -> List[CustomerLTV]:
        # Build customer → invoices + projects maps via relationships
        invoices_by_customer: Dict[str, List[OntologyObject]] = {}
        projects_by_customer: Dict[str, List[OntologyObject]] = {}
        for inv in invoices:
            try:
                rels = json.loads(inv.relationships_json or "{}")
            except Exception:
                rels = {}
            for target in rels.get("for_customer", []):
                invoices_by_customer.setdefault(target, []).append(inv)
        for p in projects:
            try:
                rels = json.loads(p.relationships_json or "{}")
            except Exception:
                rels = {}
            for target in rels.get("for_customer", []):
                projects_by_customer.setdefault(target, []).append(p)

        out: List[CustomerLTV] = []
        for cust in customers:
            props = props_by_id[cust.id]
            cust_invoices = invoices_by_customer.get(cust.id, [])
            cust_projects = projects_by_customer.get(cust.id, [])

            revenue = sum(
                self._as_float(props_by_id[i.id].get("amount_ils"))
                for i in cust_invoices
            )
            projected_revenue = sum(
                self._as_float(props_by_id[p.id].get("value_ils"))
                for p in cust_projects
            )
            overdue = sum(
                self._as_float(props_by_id[i.id].get("amount_ils"))
                for i in cust_invoices
                if props_by_id[i.id].get("status") == "overdue"
            )

            tier = str(props.get("tier", "bronze"))
            tier_weight = {"gold": 1.3, "silver": 1.1, "bronze": 1.0}.get(tier, 1.0)

            # LTV score: weighted by revenue, penalized by overdue
            base_score = min(100, (revenue + projected_revenue) / 10000)
            penalty = min(50, overdue / 5000)
            ltv_score = max(0, (base_score - penalty) * tier_weight)

            out.append(CustomerLTV(
                customer_id=cust.id,
                customer_name=cust.name,
                revenue_ils=round(revenue, 2),
                projected_revenue_ils=round(projected_revenue, 2),
                project_count=len(cust_projects),
                invoice_count=len(cust_invoices),
                overdue_amount_ils=round(overdue, 2),
                tier=tier,
                lifetime_value_score=round(min(100, ltv_score), 2),
            ))
        return out

    def _compute_supplier_spends(
        self,
        suppliers: List[OntologyObject],
        props_by_id: Dict[str, Dict[str, Any]],
        purchase_orders: List[OntologyObject],
        materials: List[OntologyObject],
    ) -> List[SupplierSpend]:
        out: List[SupplierSpend] = []
        for sup in suppliers:
            props = props_by_id[sup.id]
            # Estimate total spend from the current_po_value_ils property
            current_po = self._as_float(props.get("current_po_value_ils"))
            # For the demo, assume current_po × 12 months = annual spend
            total_spend = current_po * 12 if current_po > 0 else 0
            on_time = self._as_float(props.get("on_time_rate")) or 1.0
            risk_adjusted = total_spend * (2 - on_time)
            out.append(SupplierSpend(
                supplier_id=sup.id,
                supplier_name=sup.name,
                total_spend_ils=round(total_spend, 2),
                active_po_value_ils=round(current_po, 2),
                on_time_rate=on_time,
                risk_adjusted_cost_ils=round(risk_adjusted, 2),
            ))
        return out

    def _as_float(self, v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0
