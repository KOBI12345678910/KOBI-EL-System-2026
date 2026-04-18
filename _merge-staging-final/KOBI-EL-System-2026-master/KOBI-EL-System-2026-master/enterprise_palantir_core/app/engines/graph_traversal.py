"""
Graph Traversal Engine.

Operates on the ontology's OntologyObject + OntologyLink tables (plus
the relationships_json inlined on each OntologyObject). Provides:

  - downstream(entity_id, depth)  → BFS forward
  - upstream(entity_id, depth)    → BFS backward
  - shortest_path(a, b)           → BFS shortest path
  - neighborhood(entity_id, depth) → set of every reachable entity

These are the building blocks for "if supplier SUPP-001 is delayed,
which projects, invoices, and cashflow buckets are affected downstream?"
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.repositories.ontology_repo import OntologyRepository


@dataclass
class TraversalHit:
    entity_id: str
    depth: int
    object_type: Optional[str] = None
    name: Optional[str] = None
    via_relation: Optional[str] = None


@dataclass
class PathResult:
    found: bool
    path: List[str] = field(default_factory=list)
    relations: List[str] = field(default_factory=list)
    depth: int = 0


class GraphTraversalEngine:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = OntologyRepository(db)

    # ─── Forward (downstream) ─────────────────────────────────
    def downstream(self, entity_id: str, max_depth: int = 5) -> List[TraversalHit]:
        visited: Set[str] = {entity_id}
        queue: deque = deque([(entity_id, 0, None)])
        hits: List[TraversalHit] = []
        while queue:
            cur_id, depth, via = queue.popleft()
            if depth >= max_depth:
                continue
            obj = self.repo.get_by_id(cur_id)
            if obj is None:
                continue
            rels: Dict[str, List[str]] = json.loads(obj.relationships_json or "{}")
            for rel_name, targets in rels.items():
                for target_id in targets:
                    if target_id in visited:
                        continue
                    visited.add(target_id)
                    target = self.repo.get_by_id(target_id)
                    hits.append(
                        TraversalHit(
                            entity_id=target_id,
                            depth=depth + 1,
                            object_type=target.object_type if target else None,
                            name=target.name if target else None,
                            via_relation=rel_name,
                        )
                    )
                    queue.append((target_id, depth + 1, rel_name))
        return hits

    # ─── Backward (upstream) ─────────────────────────────────
    def upstream(self, entity_id: str, max_depth: int = 5) -> List[TraversalHit]:
        visited: Set[str] = {entity_id}
        queue: deque = deque([(entity_id, 0, None)])
        hits: List[TraversalHit] = []
        while queue:
            cur_id, depth, via = queue.popleft()
            if depth >= max_depth:
                continue
            # Find every object in the same tenant whose relationships
            # include cur_id as a target.
            cur = self.repo.get_by_id(cur_id)
            if cur is None:
                continue
            for candidate in self.repo.list_by_tenant(cur.tenant_id):
                if candidate.id in visited:
                    continue
                rels: Dict[str, List[str]] = json.loads(candidate.relationships_json or "{}")
                for rel_name, targets in rels.items():
                    if cur_id in targets:
                        visited.add(candidate.id)
                        hits.append(
                            TraversalHit(
                                entity_id=candidate.id,
                                depth=depth + 1,
                                object_type=candidate.object_type,
                                name=candidate.name,
                                via_relation=rel_name,
                            )
                        )
                        queue.append((candidate.id, depth + 1, rel_name))
                        break
        return hits

    # ─── Shortest path ───────────────────────────────────────
    def shortest_path(
        self,
        from_entity_id: str,
        to_entity_id: str,
        max_depth: int = 8,
    ) -> PathResult:
        if from_entity_id == to_entity_id:
            return PathResult(found=True, path=[from_entity_id])
        visited: Set[str] = {from_entity_id}
        queue: deque = deque([(from_entity_id, [from_entity_id], [])])
        while queue:
            cur_id, path, relations = queue.popleft()
            if len(path) - 1 >= max_depth:
                continue
            obj = self.repo.get_by_id(cur_id)
            if obj is None:
                continue
            rels: Dict[str, List[str]] = json.loads(obj.relationships_json or "{}")
            for rel_name, targets in rels.items():
                for target_id in targets:
                    if target_id in visited:
                        continue
                    visited.add(target_id)
                    new_path = path + [target_id]
                    new_relations = relations + [rel_name]
                    if target_id == to_entity_id:
                        return PathResult(
                            found=True,
                            path=new_path,
                            relations=new_relations,
                            depth=len(new_path) - 1,
                        )
                    queue.append((target_id, new_path, new_relations))
        return PathResult(found=False)

    # ─── Neighborhood ────────────────────────────────────────
    def neighborhood(self, entity_id: str, depth: int = 2) -> List[TraversalHit]:
        return self.downstream(entity_id, max_depth=depth)
