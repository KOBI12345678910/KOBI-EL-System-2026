"""
Dependency Analyzer — understands what depends on what across the
entire ontology and answers blast-radius questions.

Operations:
  - find_all_dependents(entity_id)  — everything that would break if this fails
  - find_critical_path(source_id, target_id) — the path of N-deep dependencies
  - cyclic_dependencies(tenant_id) — every cycle in the relationship graph
  - single_points_of_failure(tenant_id) — entities whose removal disconnects the graph
  - blast_radius(entity_id, severity) — weighted impact score

Different from graph_traversal (which does basic BFS). The dependency
analyzer adds scoring, ranking, and structural analysis.
"""

from __future__ import annotations

import json
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class BlastRadius:
    source_entity_id: str
    source_name: str
    total_dependents: int
    direct_dependents: int
    indirect_dependents: int
    total_risk_score: float  # sum of risk scores weighted by distance
    max_depth: int
    affected_entity_types: Dict[str, int]
    critical_downstream: List[Dict[str, Any]]


@dataclass
class Cycle:
    entities: List[str]
    length: int
    entity_names: List[str]


@dataclass
class SinglePointOfFailure:
    entity_id: str
    entity_type: str
    name: str
    dependents_removed_if_fails: int
    risk_multiplier: float


class DependencyAnalyzer:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _build_graph(self, tenant_id: str) -> Tuple[
        Dict[str, Set[str]],
        Dict[str, Set[str]],
        Dict[str, OntologyObject],
        Dict[str, Optional[EntityStateModel]],
    ]:
        """
        Returns (forward, backward, objects_by_id, states_by_id).
        forward[id] = set of downstream entity ids
        backward[id] = set of upstream entity ids
        """
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
        states_by_id: Dict[str, Optional[EntityStateModel]] = {s.canonical_entity_id: s for s in states}
        objects_by_id: Dict[str, OntologyObject] = {o.id: o for o in objects}

        forward: Dict[str, Set[str]] = defaultdict(set)
        backward: Dict[str, Set[str]] = defaultdict(set)
        for obj in objects:
            try:
                rels = json.loads(obj.relationships_json or "{}")
            except Exception:
                continue
            for rel_name, targets in rels.items():
                if not isinstance(targets, list):
                    continue
                for target_id in targets:
                    if target_id in objects_by_id:
                        forward[obj.id].add(target_id)
                        backward[target_id].add(obj.id)

        return forward, backward, objects_by_id, states_by_id

    def blast_radius(
        self,
        *,
        tenant_id: str,
        source_entity_id: str,
        max_depth: int = 6,
    ) -> Optional[BlastRadius]:
        forward, _, objects_by_id, states_by_id = self._build_graph(tenant_id)
        source = objects_by_id.get(source_entity_id)
        if source is None:
            return None

        # BFS with depth tracking
        visited: Dict[str, int] = {source_entity_id: 0}
        queue: deque = deque([(source_entity_id, 0)])
        while queue:
            cur_id, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for nxt in forward.get(cur_id, set()):
                if nxt in visited:
                    continue
                visited[nxt] = depth + 1
                queue.append((nxt, depth + 1))

        # Remove source itself from counts
        dependent_ids = [eid for eid in visited if eid != source_entity_id]
        direct = sum(1 for eid in dependent_ids if visited[eid] == 1)
        indirect = len(dependent_ids) - direct

        # Risk score: sum of downstream risk scores, weighted by 1/(depth+1)
        total_risk = 0.0
        by_type: Dict[str, int] = {}
        critical: List[Dict[str, Any]] = []
        for eid in dependent_ids:
            depth = visited[eid]
            state = states_by_id.get(eid)
            obj = objects_by_id.get(eid)
            if obj:
                by_type[obj.object_type] = by_type.get(obj.object_type, 0) + 1
            if state and state.risk_score > 0:
                weight = 1.0 / (depth + 1)
                total_risk += state.risk_score * weight
                if state.risk_score >= 0.6 and obj is not None:
                    critical.append({
                        "entity_id": eid,
                        "entity_type": obj.object_type,
                        "name": obj.name,
                        "depth": depth,
                        "risk_score": round(state.risk_score, 3),
                        "status": state.current_status,
                    })
        critical.sort(key=lambda c: (-c["risk_score"], c["depth"]))
        max_depth_reached = max(visited.values()) if visited else 0

        return BlastRadius(
            source_entity_id=source_entity_id,
            source_name=source.name,
            total_dependents=len(dependent_ids),
            direct_dependents=direct,
            indirect_dependents=indirect,
            total_risk_score=round(total_risk, 3),
            max_depth=max_depth_reached,
            affected_entity_types=by_type,
            critical_downstream=critical[:15],
        )

    def find_cycles(self, tenant_id: str, max_results: int = 20) -> List[Cycle]:
        forward, _, objects_by_id, _ = self._build_graph(tenant_id)
        cycles: List[Cycle] = []
        seen_cycles: Set[Tuple[str, ...]] = set()

        def _dfs(node: str, path: List[str], visited: Set[str]) -> None:
            if len(cycles) >= max_results:
                return
            for neighbor in forward.get(node, set()):
                if neighbor in path:
                    # Found a cycle — normalize (rotate to smallest id first)
                    cycle_start = path.index(neighbor)
                    cycle_nodes = path[cycle_start:] + [neighbor]
                    canonical = tuple(sorted(cycle_nodes))
                    if canonical in seen_cycles:
                        continue
                    seen_cycles.add(canonical)
                    cycles.append(Cycle(
                        entities=cycle_nodes[:-1],
                        length=len(cycle_nodes) - 1,
                        entity_names=[
                            objects_by_id[eid].name if eid in objects_by_id else eid
                            for eid in cycle_nodes[:-1]
                        ],
                    ))
                elif neighbor not in visited:
                    visited.add(neighbor)
                    path.append(neighbor)
                    _dfs(neighbor, path, visited)
                    path.pop()

        for node in list(forward.keys())[:200]:  # cap to avoid huge DFS
            _dfs(node, [node], {node})

        return cycles

    def single_points_of_failure(
        self,
        tenant_id: str,
        *,
        min_dependents: int = 2,
    ) -> List[SinglePointOfFailure]:
        forward, _, objects_by_id, states_by_id = self._build_graph(tenant_id)
        out: List[SinglePointOfFailure] = []

        for eid, obj in objects_by_id.items():
            # Count downstream dependents (BFS forward)
            visited: Set[str] = {eid}
            queue: deque = deque([eid])
            while queue:
                cur = queue.popleft()
                for nxt in forward.get(cur, set()):
                    if nxt not in visited:
                        visited.add(nxt)
                        queue.append(nxt)
            dependents = len(visited) - 1  # exclude self
            if dependents < min_dependents:
                continue
            state = states_by_id.get(eid)
            risk_mult = 1.0
            if state and state.risk_score > 0:
                risk_mult = 1.0 + state.risk_score
            out.append(SinglePointOfFailure(
                entity_id=eid,
                entity_type=obj.object_type,
                name=obj.name,
                dependents_removed_if_fails=dependents,
                risk_multiplier=round(risk_mult, 2),
            ))
        # Rank by impact × risk
        out.sort(key=lambda s: -(s.dependents_removed_if_fails * s.risk_multiplier))
        return out

    def find_critical_path(
        self,
        *,
        tenant_id: str,
        source_id: str,
        target_id: str,
        max_depth: int = 10,
    ) -> Optional[List[str]]:
        forward, _, objects_by_id, _ = self._build_graph(tenant_id)
        if source_id not in objects_by_id or target_id not in objects_by_id:
            return None
        visited: Set[str] = {source_id}
        queue: deque = deque([(source_id, [source_id])])
        while queue:
            cur, path = queue.popleft()
            if len(path) - 1 >= max_depth:
                continue
            for nxt in forward.get(cur, set()):
                if nxt == target_id:
                    return path + [nxt]
                if nxt in visited:
                    continue
                visited.add(nxt)
                queue.append((nxt, path + [nxt]))
        return None
