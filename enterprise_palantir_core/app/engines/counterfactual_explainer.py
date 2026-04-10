"""
Counterfactual Explainer — "what minimal changes would have
prevented this bad outcome?"

Given a target entity with a bad status (blocked, at_risk, delayed),
find the smallest set of changes that — had they been different —
would have resulted in a good status.

Algorithm:
  1. Walk the causal ancestors of the target (via graph_traversal)
  2. For each ancestor, hypothetically flip its status to "active"
  3. Re-run the risk propagation downstream
  4. If the target's predicted new status is "active", record the
     ancestor set as a counterfactual explanation
  5. Return the minimal explanation (fewest changes required)

This is valuable for operators: "Your project is blocked because
Supplier A is delayed AND Material B is below reorder point. If
EITHER had been resolved, the project would have been on track."

Builds on the dependency_analyzer + risk_scoring engines.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class CounterfactualChange:
    entity_id: str
    entity_type: str
    entity_name: str
    current_status: str
    current_risk_score: float
    required_status: str
    minimal_fix: str  # e.g. "unblock this supplier" or "restock this material"


@dataclass
class CounterfactualExplanation:
    target_entity_id: str
    target_entity_name: str
    current_status: str
    current_risk_score: float
    explanation_rank: int
    required_changes: List[CounterfactualChange]
    total_changes_required: int
    predicted_new_status: str
    predicted_risk_reduction: float
    minimality_score: float  # smaller = more minimal = better


@dataclass
class CounterfactualReport:
    target_entity_id: str
    explanations_found: int
    minimal_explanation: Optional[CounterfactualExplanation]
    all_explanations: List[CounterfactualExplanation]
    narrative: str


class CounterfactualExplainer:
    RISK_DECAY_PER_DEPTH = 0.5

    def __init__(self, db: Session) -> None:
        self.db = db

    def explain(
        self,
        *,
        tenant_id: str,
        target_entity_id: str,
        max_changes: int = 3,
        max_ancestor_depth: int = 4,
    ) -> CounterfactualReport:
        # 1. Get all entities + states for this tenant
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
        objects_by_id = {o.id: o for o in objects}

        target = objects_by_id.get(target_entity_id)
        target_state = states_by_id.get(target_entity_id)
        if target is None or target_state is None:
            return CounterfactualReport(
                target_entity_id=target_entity_id,
                explanations_found=0,
                minimal_explanation=None,
                all_explanations=[],
                narrative="Target entity not found",
            )

        # Only explain if the target is in a bad state
        if target_state.current_status not in ("at_risk", "blocked", "delayed", "overdue", "low", "critical"):
            return CounterfactualReport(
                target_entity_id=target_entity_id,
                explanations_found=0,
                minimal_explanation=None,
                all_explanations=[],
                narrative=f"Target is already in good state: {target_state.current_status}",
            )

        # 2. Walk causal ancestors
        ancestors = self._find_ancestors(target_entity_id, objects_by_id, max_ancestor_depth)
        at_risk_ancestors = [
            aid for aid in ancestors
            if aid in states_by_id
            and states_by_id[aid].current_status in ("at_risk", "blocked", "delayed", "low", "critical")
        ]
        if not at_risk_ancestors:
            return CounterfactualReport(
                target_entity_id=target_entity_id,
                explanations_found=0,
                minimal_explanation=None,
                all_explanations=[],
                narrative=(
                    f"No at-risk ancestors found for {target.name}. The bad state "
                    f"appears to be intrinsic to this entity, not caused by upstream "
                    f"dependencies."
                ),
            )

        # 3. Try every combination of 1, 2, ..., max_changes ancestors
        all_explanations: List[CounterfactualExplanation] = []
        for r in range(1, min(max_changes, len(at_risk_ancestors)) + 1):
            for combo in combinations(at_risk_ancestors, r):
                explanation = self._evaluate_counterfactual(
                    target_id=target_entity_id,
                    target_state=target_state,
                    ancestor_ids=combo,
                    objects_by_id=objects_by_id,
                    states_by_id=states_by_id,
                )
                if explanation is not None:
                    all_explanations.append(explanation)
            # Stop early once we find at least one working minimal fix
            if all_explanations:
                break

        # 4. Rank by minimality (fewer changes = better) then by risk reduction
        all_explanations.sort(
            key=lambda e: (e.total_changes_required, -e.predicted_risk_reduction)
        )
        for i, e in enumerate(all_explanations):
            e.explanation_rank = i + 1

        minimal = all_explanations[0] if all_explanations else None

        narrative = self._build_narrative(target, target_state, minimal, len(all_explanations))

        return CounterfactualReport(
            target_entity_id=target_entity_id,
            explanations_found=len(all_explanations),
            minimal_explanation=minimal,
            all_explanations=all_explanations[:10],
            narrative=narrative,
        )

    # ─── Internal helpers ────────────────────────────────────
    def _find_ancestors(
        self,
        target_id: str,
        objects_by_id: Dict[str, OntologyObject],
        max_depth: int,
    ) -> Set[str]:
        """
        Walk backward through relationships to find every entity whose
        relationships point to the target.
        """
        visited: Set[str] = set()
        # Build reverse index once
        reverse: Dict[str, Set[str]] = {}
        for oid, obj in objects_by_id.items():
            try:
                rels = json.loads(obj.relationships_json or "{}")
            except Exception:
                continue
            for rel_name, targets in rels.items():
                if not isinstance(targets, list):
                    continue
                for t in targets:
                    reverse.setdefault(t, set()).add(oid)

        # BFS backward from target
        frontier: Set[str] = {target_id}
        for _ in range(max_depth):
            next_frontier: Set[str] = set()
            for node in frontier:
                parents = reverse.get(node, set())
                for parent in parents:
                    if parent not in visited and parent != target_id:
                        visited.add(parent)
                        next_frontier.add(parent)
            frontier = next_frontier
            if not frontier:
                break
        return visited

    def _evaluate_counterfactual(
        self,
        *,
        target_id: str,
        target_state: EntityStateModel,
        ancestor_ids: Tuple[str, ...],
        objects_by_id: Dict[str, OntologyObject],
        states_by_id: Dict[str, EntityStateModel],
    ) -> Optional[CounterfactualExplanation]:
        """
        Hypothetically set each ancestor to "active" and compute the
        predicted risk reduction for the target.
        """
        target_obj = objects_by_id[target_id]
        total_risk_removed = 0.0
        changes: List[CounterfactualChange] = []

        for aid in ancestor_ids:
            ancestor = objects_by_id.get(aid)
            ancestor_state = states_by_id.get(aid)
            if ancestor is None or ancestor_state is None:
                continue
            # Risk contribution to target = ancestor_risk * decay
            risk_contribution = ancestor_state.risk_score * self.RISK_DECAY_PER_DEPTH
            total_risk_removed += risk_contribution
            fix = self._suggest_fix(ancestor, ancestor_state)
            changes.append(CounterfactualChange(
                entity_id=aid,
                entity_type=ancestor.object_type,
                entity_name=ancestor.name,
                current_status=ancestor_state.current_status,
                current_risk_score=round(ancestor_state.risk_score, 3),
                required_status="active",
                minimal_fix=fix,
            ))

        predicted_new_risk = max(0.0, target_state.risk_score - total_risk_removed)
        predicted_new_status = self._classify_new_status(predicted_new_risk)

        # Only return if the counterfactual would actually fix the target
        if predicted_new_status not in ("active", "ok", "healthy", "on_track"):
            return None

        minimality_score = (
            len(ancestor_ids) * 10.0 - total_risk_removed
        )

        return CounterfactualExplanation(
            target_entity_id=target_id,
            target_entity_name=target_obj.name,
            current_status=target_state.current_status,
            current_risk_score=round(target_state.risk_score, 3),
            explanation_rank=0,  # filled later
            required_changes=changes,
            total_changes_required=len(changes),
            predicted_new_status=predicted_new_status,
            predicted_risk_reduction=round(total_risk_removed, 3),
            minimality_score=round(minimality_score, 3),
        )

    def _classify_new_status(self, risk_score: float) -> str:
        if risk_score >= 0.85:
            return "blocked"
        if risk_score >= 0.6:
            return "at_risk"
        if risk_score >= 0.4:
            return "delayed"
        return "active"

    def _suggest_fix(self, entity: OntologyObject, state: EntityStateModel) -> str:
        type_fixes = {
            "Supplier": "escalate supplier delivery or activate backup supplier",
            "Material": "place emergency reorder or switch to alternative material",
            "ProductionOrder": "reroute to healthy production line",
            "Project": "reassign PM or inject additional resources",
            "Employee": "rebalance workload or hire temporary help",
            "Invoice": "trigger collections workflow",
            "Installation": "reschedule with backup crew",
        }
        return type_fixes.get(entity.object_type, "investigate and resolve the root cause")

    def _build_narrative(
        self,
        target: OntologyObject,
        target_state: EntityStateModel,
        minimal: Optional[CounterfactualExplanation],
        total_found: int,
    ) -> str:
        if minimal is None:
            return (
                f"{target.name} is currently {target_state.current_status} (risk "
                f"{target_state.risk_score:.2f}). No counterfactual fix was found — "
                f"the bad state may require intrinsic resolution."
            )
        return (
            f"{target.name} is currently {target_state.current_status} (risk "
            f"{target_state.risk_score:.2f}). The MINIMAL fix requires changing "
            f"{minimal.total_changes_required} upstream entity(ies): "
            f"{', '.join(c.entity_name for c in minimal.required_changes)}. "
            f"This would reduce risk by {minimal.predicted_risk_reduction:.2f} and "
            f"move the target to '{minimal.predicted_new_status}'. "
            f"Total explanations evaluated: {total_found}."
        )
