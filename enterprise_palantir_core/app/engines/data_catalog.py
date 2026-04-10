"""
Data Catalog — self-describing metadata catalog of every entity
type, field, relationship, workflow, alert rule, and connector in
the platform.

The catalog auto-introspects the live ontology + the engine registry
and produces a single unified "what does this platform know about?"
document. This is the root document for:

  - Data discovery (what entity types exist? what fields?)
  - AI context (prompting Claude with the catalog so it understands
    the schema)
  - Developer onboarding (what can I query? what can I ingest?)
  - Impact analysis (if I change this field, what depends on it?)

Auto-derived from the seeded + ingested ontology. No manual schema
to maintain.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class EntityTypeDescription:
    entity_type: str
    entity_count: int
    properties: Dict[str, Dict[str, Any]]  # prop_name → {type, example, null_rate}
    relationship_types: List[str]
    sample_ids: List[str] = field(default_factory=list)


@dataclass
class CatalogReport:
    tenant_id: str
    generated_at: datetime
    total_entities: int
    total_entity_types: int
    total_relationships: int
    entity_types: List[EntityTypeDescription]


class DataCatalog:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build(self, tenant_id: str) -> CatalogReport:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )

        # Group by entity_type
        by_type: Dict[str, List[OntologyObject]] = {}
        for obj in objects:
            by_type.setdefault(obj.object_type, []).append(obj)

        entity_descriptions: List[EntityTypeDescription] = []
        total_relationships = 0

        for object_type, entities in by_type.items():
            # Collect property types + examples
            prop_types: Dict[str, str] = {}
            prop_examples: Dict[str, Any] = {}
            prop_null_counts: Counter = Counter()
            relationship_types: Set[str] = set()

            for entity in entities:
                try:
                    props = json.loads(entity.properties_json or "{}")
                except Exception:
                    props = {}
                try:
                    rels = json.loads(entity.relationships_json or "{}")
                except Exception:
                    rels = {}

                for k, v in props.items():
                    type_name = self._infer_type(v)
                    if k not in prop_types:
                        prop_types[k] = type_name
                        prop_examples[k] = v
                    if v is None or v == "":
                        prop_null_counts[k] += 1

                for rel_name, targets in rels.items():
                    relationship_types.add(rel_name)
                    if isinstance(targets, list):
                        total_relationships += len(targets)

            properties: Dict[str, Dict[str, Any]] = {}
            for name, type_name in prop_types.items():
                properties[name] = {
                    "type": type_name,
                    "example": self._truncate_example(prop_examples[name]),
                    "null_rate": round(prop_null_counts[name] / max(1, len(entities)), 2),
                }

            entity_descriptions.append(EntityTypeDescription(
                entity_type=object_type,
                entity_count=len(entities),
                properties=properties,
                relationship_types=sorted(relationship_types),
                sample_ids=[e.id for e in entities[:3]],
            ))

        entity_descriptions.sort(key=lambda e: -e.entity_count)

        return CatalogReport(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            total_entities=len(objects),
            total_entity_types=len(by_type),
            total_relationships=total_relationships,
            entity_types=entity_descriptions,
        )

    def _infer_type(self, value: Any) -> str:
        if value is None:
            return "null"
        if isinstance(value, bool):
            return "bool"
        if isinstance(value, int):
            return "int"
        if isinstance(value, float):
            return "float"
        if isinstance(value, str):
            # Guess more specific string types
            if len(value) <= 0:
                return "string"
            if value in ("active", "at_risk", "blocked", "delayed", "completed",
                         "new", "qualified", "overdue", "paid", "sent", "draft",
                         "in_progress", "queued", "scheduled", "low", "critical",
                         "ok", "healthy"):
                return "enum_status"
            if "@" in value:
                return "email"
            if any(c.isdigit() for c in value[:4]) and "-" in value and len(value) >= 10:
                return "date_or_phone"
            return "string"
        if isinstance(value, list):
            return f"list[{len(value)}]"
        if isinstance(value, dict):
            return f"object[{len(value)}]"
        return type(value).__name__

    def _truncate_example(self, value: Any) -> Any:
        if isinstance(value, str) and len(value) > 50:
            return value[:50] + "..."
        if isinstance(value, (list, dict)) and len(str(value)) > 100:
            return str(value)[:100] + "..."
        return value
