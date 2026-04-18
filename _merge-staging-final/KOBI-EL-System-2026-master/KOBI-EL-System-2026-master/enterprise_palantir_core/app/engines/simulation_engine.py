"""
Simulation Engine — "what-if" analysis on the live ontology.

Given a hypothetical event (e.g. "what if SUPP-0001 becomes delayed for
30 more days?"), the simulation engine:

  1. Snapshots the current entity state + relationships
  2. Applies the hypothetical delta in a sandbox (no DB mutation)
  3. Walks the causal graph to compute the ripple effect
  4. Recomputes a modified company health score
  5. Returns a before/after comparison with the list of newly
     at-risk / newly blocked entities

This is the operator's "what if I do X" button — decision support
without touching production state.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.engines.graph_traversal import GraphTraversalEngine
from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════
# INPUTS / OUTPUTS
# ════════════════════════════════════════════════════════════════

@dataclass
class HypotheticalChange:
    entity_id: str
    change_type: str                 # "status_change" | "risk_bump" | "delete" | "add_delay_days"
    new_status: Optional[str] = None
    new_risk_score: Optional[float] = None
    delay_days: Optional[int] = None
    notes: str = ""


@dataclass
class ImpactedEntity:
    entity_id: str
    entity_type: str
    name: str
    previous_status: str
    hypothetical_status: str
    previous_risk: float
    hypothetical_risk: float
    depth: int
    via_relationship: str


@dataclass
class SimulationResult:
    tenant_id: str
    simulated_at: datetime
    changes_applied: List[HypotheticalChange]
    previous_overall_health: float
    hypothetical_overall_health: float
    delta_health: float
    previously_at_risk: int
    hypothetically_at_risk: int
    newly_at_risk: int
    newly_blocked: int
    impacted_entities: List[ImpactedEntity]
    summary: str


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class SimulationEngine:
    # How much a hypothetical change propagates through the graph
    # (risk decays by this factor per depth level).
    RISK_DECAY_PER_DEPTH = 0.5

    def __init__(self, db: Session) -> None:
        self.db = db
        self.graph = GraphTraversalEngine(db)

    def simulate(
        self,
        tenant_id: str,
        changes: List[HypotheticalChange],
        *,
        max_depth: int = 4,
    ) -> SimulationResult:
        # 1. Snapshot current state (read-only)
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
        objects_by_id = {o.id: o for o in objects}
        states_by_id = {s.canonical_entity_id: s for s in states}

        # 2. Clone states into a sandbox map (no DB mutation)
        sandbox: Dict[str, Dict[str, Any]] = {}
        for s in states:
            sandbox[s.canonical_entity_id] = {
                "status": s.current_status,
                "risk": s.risk_score,
                "freshness": s.freshness_status,
                "original_status": s.current_status,
                "original_risk": s.risk_score,
            }

        # Capture "before" metrics
        previously_at_risk = sum(1 for v in sandbox.values() if v["status"] == "at_risk")
        previously_blocked = sum(1 for v in sandbox.values() if v["status"] == "blocked")
        previous_health = self._health_score(sandbox, len(objects))

        # 3. Apply each change + propagate through the graph
        impacted: List[ImpactedEntity] = []
        seen: Set[str] = set()
        for change in changes:
            self._apply_change(change, sandbox)
            if change.entity_id in sandbox and change.entity_id in objects_by_id:
                obj = objects_by_id[change.entity_id]
                sb = sandbox[change.entity_id]
                impacted.append(ImpactedEntity(
                    entity_id=change.entity_id,
                    entity_type=obj.object_type,
                    name=obj.name,
                    previous_status=sb["original_status"],
                    hypothetical_status=sb["status"],
                    previous_risk=sb["original_risk"],
                    hypothetical_risk=sb["risk"],
                    depth=0,
                    via_relationship="__root__",
                ))
                seen.add(change.entity_id)

            # Propagate through downstream graph
            hits = self.graph.downstream(change.entity_id, max_depth=max_depth)
            for hit in hits:
                if hit.entity_id in seen:
                    continue
                if hit.entity_id not in sandbox:
                    continue
                sb = sandbox[hit.entity_id]
                decay = self.RISK_DECAY_PER_DEPTH ** hit.depth
                # Carry some risk downstream
                incoming_risk = (change.new_risk_score or sandbox[change.entity_id]["risk"]) * decay
                sb["risk"] = max(sb["risk"], incoming_risk)
                # If the carried risk crosses 0.6, flip to at_risk
                if sb["risk"] >= 0.8 and sb["status"] not in ("blocked",):
                    sb["status"] = "blocked"
                elif sb["risk"] >= 0.6 and sb["status"] == "active":
                    sb["status"] = "at_risk"
                if sb["status"] != sb["original_status"] or sb["risk"] != sb["original_risk"]:
                    obj = objects_by_id.get(hit.entity_id)
                    impacted.append(ImpactedEntity(
                        entity_id=hit.entity_id,
                        entity_type=obj.object_type if obj else "?",
                        name=obj.name if obj else hit.entity_id,
                        previous_status=sb["original_status"],
                        hypothetical_status=sb["status"],
                        previous_risk=sb["original_risk"],
                        hypothetical_risk=sb["risk"],
                        depth=hit.depth,
                        via_relationship=hit.via_relation or "",
                    ))
                    seen.add(hit.entity_id)

        # 4. Capture "after" metrics
        hypothetically_at_risk = sum(1 for v in sandbox.values() if v["status"] == "at_risk")
        hypothetically_blocked = sum(1 for v in sandbox.values() if v["status"] == "blocked")
        hypothetical_health = self._health_score(sandbox, len(objects))

        newly_at_risk = max(0, hypothetically_at_risk - previously_at_risk)
        newly_blocked = max(0, hypothetically_blocked - previously_blocked)

        summary = self._summary(
            changes=changes,
            previous_health=previous_health,
            hypothetical_health=hypothetical_health,
            newly_at_risk=newly_at_risk,
            newly_blocked=newly_blocked,
            impacted_count=len(impacted),
        )

        return SimulationResult(
            tenant_id=tenant_id,
            simulated_at=utc_now(),
            changes_applied=changes,
            previous_overall_health=previous_health,
            hypothetical_overall_health=hypothetical_health,
            delta_health=round(hypothetical_health - previous_health, 1),
            previously_at_risk=previously_at_risk,
            hypothetically_at_risk=hypothetically_at_risk,
            newly_at_risk=newly_at_risk,
            newly_blocked=newly_blocked,
            impacted_entities=impacted,
            summary=summary,
        )

    # ─── Internal helpers ────────────────────────────────────
    def _apply_change(self, change: HypotheticalChange, sandbox: Dict[str, Dict[str, Any]]) -> None:
        if change.entity_id not in sandbox:
            return
        sb = sandbox[change.entity_id]
        if change.change_type == "status_change" and change.new_status:
            sb["status"] = change.new_status
            sb["risk"] = max(sb["risk"], 0.6 if change.new_status == "at_risk" else
                                          0.85 if change.new_status == "blocked" else sb["risk"])
        elif change.change_type == "risk_bump" and change.new_risk_score is not None:
            sb["risk"] = max(sb["risk"], change.new_risk_score)
            if sb["risk"] >= 0.8:
                sb["status"] = "blocked"
            elif sb["risk"] >= 0.6:
                sb["status"] = "at_risk"
        elif change.change_type == "add_delay_days" and change.delay_days is not None:
            # Assume every 7 days of delay = +0.2 risk
            added = min(0.8, (change.delay_days / 7.0) * 0.2)
            sb["risk"] = min(1.0, sb["risk"] + added)
            if sb["risk"] >= 0.8:
                sb["status"] = "blocked"
            elif sb["risk"] >= 0.6:
                sb["status"] = "at_risk"
        elif change.change_type == "delete":
            sb["status"] = "deleted"
            sb["risk"] = 1.0

    def _health_score(self, sandbox: Dict[str, Dict[str, Any]], total_objects: int) -> float:
        if total_objects == 0:
            return 100.0
        at_risk = sum(1 for v in sandbox.values() if v["status"] == "at_risk")
        blocked = sum(1 for v in sandbox.values() if v["status"] == "blocked")
        bad_ratio = (at_risk + blocked * 2) / max(1, total_objects)
        return round(max(0.0, min(100.0, 100 - (bad_ratio * 80))), 1)

    def _summary(
        self,
        *,
        changes: List[HypotheticalChange],
        previous_health: float,
        hypothetical_health: float,
        newly_at_risk: int,
        newly_blocked: int,
        impacted_count: int,
    ) -> str:
        delta = round(hypothetical_health - previous_health, 1)
        if not changes:
            return "No hypothetical changes applied."
        first = changes[0]
        verb = {
            "status_change": f"status changes to '{first.new_status}'",
            "risk_bump": f"risk score bumps to {first.new_risk_score}",
            "add_delay_days": f"delays by {first.delay_days} days",
            "delete": "is removed",
        }.get(first.change_type, "is modified")
        change_desc = f"{first.entity_id} {verb}"
        if len(changes) > 1:
            change_desc += f" (and {len(changes) - 1} other changes)"
        return (
            f"If {change_desc}, overall health moves from {previous_health} to "
            f"{hypothetical_health} (delta {delta:+.1f}). {impacted_count} "
            f"entities would be affected: {newly_at_risk} newly at-risk, "
            f"{newly_blocked} newly blocked."
        )
