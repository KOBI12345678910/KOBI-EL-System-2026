"""
GraphQL Layer — a tiny GraphQL-like query interface over the ontology.

This is NOT a real GraphQL server (no schema, no introspection, no
mutations). It's a stripped-down query DSL that accepts a JSON
structure describing what the client wants and returns the matching
data from the ontology. Designed for zero external dependencies.

Query shape:
  {
    "entity_type": "Project",             # required
    "tenant_id": "techno_kol_uzi",        # required
    "filter": {                            # optional
        "status": "at_risk"
    },
    "fields": ["id", "name", "status"],   # optional (default: all)
    "relationships": {                     # optional (N+1-ish)
      "for_customer": {
        "fields": ["id", "name", "tier"]
      },
      "has_invoices": {
        "fields": ["id", "amount_ils", "status"]
      }
    },
    "limit": 10,                           # optional
    "order_by": "created_at_desc"          # optional
  }

Response shape:
  {
    "data": [
      {
        "id": "...", "name": "...", "status": "at_risk",
        "for_customer": [{"id": "...", "name": "...", "tier": "gold"}],
        "has_invoices": [...]
      },
      ...
    ],
    "count": 3,
    "elapsed_ms": 4
  }

Zero dependencies. Fast enough for demo + small deployments.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


@dataclass
class GraphQLQueryResult:
    data: List[Dict[str, Any]]
    count: int
    elapsed_ms: int
    errors: List[str]


class GraphQLLayer:
    def __init__(self, db: Session) -> None:
        self.db = db

    def execute(self, query: Dict[str, Any]) -> GraphQLQueryResult:
        start = time.time()
        errors: List[str] = []
        tenant_id = query.get("tenant_id")
        entity_type = query.get("entity_type")
        if not tenant_id or not entity_type:
            return GraphQLQueryResult(
                data=[],
                count=0,
                elapsed_ms=0,
                errors=["tenant_id and entity_type are required"],
            )

        filter_map = query.get("filter", {})
        requested_fields = query.get("fields")
        rel_queries = query.get("relationships", {})
        limit = int(query.get("limit", 100))
        order_by = query.get("order_by", "")

        # Build base query
        q = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .filter(OntologyObject.object_type == entity_type)
        )

        # Order
        if order_by == "created_at_desc":
            q = q.order_by(OntologyObject.created_at.desc())
        elif order_by == "created_at_asc":
            q = q.order_by(OntologyObject.created_at.asc())
        elif order_by == "name":
            q = q.order_by(OntologyObject.name)

        q = q.limit(limit * 2)  # over-fetch to account for filters

        objects = q.all()

        # Apply property filters in Python (since they live in properties_json)
        filtered: List[OntologyObject] = []
        for obj in objects:
            if self._matches_filter(obj, filter_map):
                filtered.append(obj)
                if len(filtered) >= limit:
                    break

        # Build per-entity dicts
        data: List[Dict[str, Any]] = []
        # For relationship resolution, we need a map of every referenced obj
        related_cache: Dict[str, OntologyObject] = {}

        for obj in filtered:
            row = self._project(obj, requested_fields)
            # Relationship resolution
            if rel_queries:
                try:
                    rels = json.loads(obj.relationships_json or "{}")
                except Exception:
                    rels = {}
                for rel_name, rel_query in rel_queries.items():
                    target_ids = rels.get(rel_name, [])
                    if not isinstance(target_ids, list):
                        continue
                    rel_fields = rel_query.get("fields") if isinstance(rel_query, dict) else None
                    rel_objects: List[Dict[str, Any]] = []
                    for tid in target_ids:
                        target = related_cache.get(tid)
                        if target is None:
                            target = (
                                self.db.query(OntologyObject)
                                .filter(OntologyObject.id == tid)
                                .filter(OntologyObject.tenant_id == tenant_id)
                                .first()
                            )
                            if target:
                                related_cache[tid] = target
                        if target:
                            rel_objects.append(self._project(target, rel_fields))
                    row[rel_name] = rel_objects
            data.append(row)

        elapsed_ms = int((time.time() - start) * 1000)
        return GraphQLQueryResult(
            data=data,
            count=len(data),
            elapsed_ms=elapsed_ms,
            errors=errors,
        )

    def _matches_filter(self, obj: OntologyObject, filters: Dict[str, Any]) -> bool:
        if not filters:
            return True
        try:
            props = json.loads(obj.properties_json or "{}")
        except Exception:
            props = {}
        for key, expected in filters.items():
            if key == "status":
                if obj.status != expected:
                    return False
            elif key in ("id", "name", "object_type"):
                if getattr(obj, key) != expected:
                    return False
            else:
                if props.get(key) != expected:
                    return False
        return True

    def _project(
        self, obj: OntologyObject, requested_fields: Optional[List[str]]
    ) -> Dict[str, Any]:
        try:
            props = json.loads(obj.properties_json or "{}")
        except Exception:
            props = {}
        full_row: Dict[str, Any] = {
            "id": obj.id,
            "object_type": obj.object_type,
            "name": obj.name,
            "status": obj.status,
            "tenant_id": obj.tenant_id,
            "canonical_external_key": obj.canonical_external_key,
            "created_at": obj.created_at.isoformat() if obj.created_at else None,
            "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
            **props,
        }
        if requested_fields:
            return {k: full_row.get(k) for k in requested_fields}
        return full_row
