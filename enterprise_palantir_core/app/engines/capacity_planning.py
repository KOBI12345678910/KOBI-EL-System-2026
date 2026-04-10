"""
Capacity Planning Engine — resource utilization forecasting and
bottleneck detection across People, Production Lines, and Materials.

Reads the ontology for:
  - Employee.utilization_pct
  - ProductionOrder.target_qty + produced_qty + line_id
  - Material.qty_on_hand + reorder_point
  - Project.value_ils + progress_pct + target_completion

Produces:
  - CapacityReport with utilization heatmap
  - Bottleneck list (most-constrained resource)
  - Headroom (how much more work the platform could absorb)
  - Hire/add recommendations when utilization > 90%
  - Material reorder recommendations when stock < reorder_point × 1.5
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ResourceUtilization:
    resource_id: str
    resource_type: str
    name: str
    utilization_pct: float
    capacity_available_pct: float
    status: str  # underutilized | healthy | saturated | overloaded


@dataclass
class Bottleneck:
    resource_id: str
    resource_type: str
    name: str
    constraint_type: str  # people | line | material | supplier
    severity: str  # info | warning | high | critical
    description: str
    recommendation: str


@dataclass
class MaterialReorder:
    material_id: str
    name: str
    qty_on_hand: float
    reorder_point: float
    shortfall: float
    recommended_order_qty: float
    urgency: str


@dataclass
class CapacityReport:
    tenant_id: str
    generated_at: datetime
    people_utilizations: List[ResourceUtilization]
    line_utilizations: List[ResourceUtilization]
    material_reorders: List[MaterialReorder]
    bottlenecks: List[Bottleneck]
    overall_utilization_pct: float
    headroom_pct: float
    summary: str


class CapacityPlanningEngine:
    SATURATED_THRESHOLD = 85.0
    OVERLOADED_THRESHOLD = 95.0
    UNDERUTILIZED_THRESHOLD = 40.0

    def __init__(self, db: Session) -> None:
        self.db = db

    def build_report(self, tenant_id: str) -> CapacityReport:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )

        # Parse props once
        props_by_id: Dict[str, Dict[str, Any]] = {}
        for obj in objects:
            try:
                props_by_id[obj.id] = json.loads(obj.properties_json or "{}")
            except Exception:
                props_by_id[obj.id] = {}

        # ─── People utilizations ─────────────────────────────
        people_utils: List[ResourceUtilization] = []
        for obj in objects:
            if obj.object_type != "Employee":
                continue
            props = props_by_id[obj.id]
            util = self._as_float(props.get("utilization_pct"))
            people_utils.append(self._build_utilization(obj, "Employee", util))

        # ─── Production line utilizations ────────────────────
        line_utils: List[ResourceUtilization] = []
        lines: Dict[str, List[Dict[str, Any]]] = {}
        for obj in objects:
            if obj.object_type != "ProductionOrder":
                continue
            props = props_by_id[obj.id]
            line_id = str(props.get("line_id", "unknown"))
            target = self._as_float(props.get("target_qty"))
            produced = self._as_float(props.get("produced_qty"))
            lines.setdefault(line_id, []).append({
                "target": target,
                "produced": produced,
                "name": obj.name,
                "id": obj.id,
            })
        for line_id, orders in lines.items():
            total_target = sum(o["target"] for o in orders)
            total_produced = sum(o["produced"] for o in orders)
            # Utilization = produced / target (clamped)
            util_pct = (total_produced / total_target * 100) if total_target > 0 else 0
            util_pct = min(100.0, util_pct)
            line_utils.append(ResourceUtilization(
                resource_id=line_id,
                resource_type="ProductionLine",
                name=f"Line {line_id}",
                utilization_pct=round(util_pct, 1),
                capacity_available_pct=round(100 - util_pct, 1),
                status=self._classify(util_pct),
            ))

        # ─── Material reorders ───────────────────────────────
        reorders: List[MaterialReorder] = []
        for obj in objects:
            if obj.object_type != "Material":
                continue
            props = props_by_id[obj.id]
            qty = self._as_float(props.get("qty_on_hand"))
            reorder = self._as_float(props.get("reorder_point"))
            if reorder == 0:
                continue
            if qty < reorder * 1.5:
                shortfall = max(0, (reorder * 2) - qty)
                urgency = (
                    "critical" if qty < reorder * 0.5
                    else "high" if qty < reorder
                    else "warning"
                )
                reorders.append(MaterialReorder(
                    material_id=obj.id,
                    name=obj.name,
                    qty_on_hand=qty,
                    reorder_point=reorder,
                    shortfall=round(shortfall, 2),
                    recommended_order_qty=round(reorder * 2, 2),
                    urgency=urgency,
                ))

        # ─── Bottlenecks ─────────────────────────────────────
        bottlenecks: List[Bottleneck] = []
        for u in people_utils:
            if u.utilization_pct >= self.OVERLOADED_THRESHOLD:
                bottlenecks.append(Bottleneck(
                    resource_id=u.resource_id,
                    resource_type=u.resource_type,
                    name=u.name,
                    constraint_type="people",
                    severity="critical",
                    description=f"{u.name} is at {u.utilization_pct}% utilization (OVERLOADED)",
                    recommendation="Reassign workload or hire additional capacity",
                ))
            elif u.utilization_pct >= self.SATURATED_THRESHOLD:
                bottlenecks.append(Bottleneck(
                    resource_id=u.resource_id,
                    resource_type=u.resource_type,
                    name=u.name,
                    constraint_type="people",
                    severity="high",
                    description=f"{u.name} is at {u.utilization_pct}% utilization (saturated)",
                    recommendation="Monitor — any new project will push this resource over the limit",
                ))
        for r in reorders:
            if r.urgency == "critical":
                bottlenecks.append(Bottleneck(
                    resource_id=r.material_id,
                    resource_type="Material",
                    name=r.name,
                    constraint_type="material",
                    severity="critical",
                    description=f"{r.name} has only {r.qty_on_hand} units (reorder point {r.reorder_point})",
                    recommendation=f"Place emergency order for {r.recommended_order_qty} units",
                ))
            elif r.urgency == "high":
                bottlenecks.append(Bottleneck(
                    resource_id=r.material_id,
                    resource_type="Material",
                    name=r.name,
                    constraint_type="material",
                    severity="high",
                    description=f"{r.name} below reorder point ({r.qty_on_hand} / {r.reorder_point})",
                    recommendation=f"Place order for {r.recommended_order_qty} units",
                ))

        # ─── Overall utilization + headroom ──────────────────
        all_utils = [u.utilization_pct for u in people_utils + line_utils]
        overall = sum(all_utils) / len(all_utils) if all_utils else 0.0
        headroom = max(0.0, 100 - overall)

        summary = self._build_summary(overall, len(bottlenecks), len(reorders))

        return CapacityReport(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            people_utilizations=people_utils,
            line_utilizations=line_utils,
            material_reorders=reorders,
            bottlenecks=bottlenecks,
            overall_utilization_pct=round(overall, 1),
            headroom_pct=round(headroom, 1),
            summary=summary,
        )

    def _build_utilization(
        self, obj: OntologyObject, resource_type: str, util_pct: float
    ) -> ResourceUtilization:
        return ResourceUtilization(
            resource_id=obj.id,
            resource_type=resource_type,
            name=obj.name,
            utilization_pct=round(util_pct, 1),
            capacity_available_pct=round(max(0, 100 - util_pct), 1),
            status=self._classify(util_pct),
        )

    def _classify(self, util_pct: float) -> str:
        if util_pct >= self.OVERLOADED_THRESHOLD:
            return "overloaded"
        if util_pct >= self.SATURATED_THRESHOLD:
            return "saturated"
        if util_pct >= self.UNDERUTILIZED_THRESHOLD:
            return "healthy"
        return "underutilized"

    def _build_summary(self, overall: float, bottleneck_count: int, reorder_count: int) -> str:
        parts = [f"Overall utilization {overall:.1f}%, headroom {100 - overall:.1f}%."]
        if bottleneck_count > 0:
            parts.append(f"{bottleneck_count} bottlenecks flagged.")
        if reorder_count > 0:
            parts.append(f"{reorder_count} materials need reorder.")
        if overall >= 90:
            parts.append("Platform is at capacity — new intake will require resource addition.")
        elif overall >= 70:
            parts.append("Platform is running hot — monitor closely.")
        else:
            parts.append("Platform has healthy headroom.")
        return " ".join(parts)

    def _as_float(self, v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0
