from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.models.ontology import OntologyObject, OntologyRelationship


class OntologyRepository:
    def __init__(self, session: Session):
        self.s = session

    # ─── Objects ──────────────────────────────────────────────
    def upsert_object(
        self,
        *,
        object_id: str,
        tenant_id: str,
        object_type: str,
        name: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> OntologyObject:
        row = self.s.get(OntologyObject, object_id)
        now = utc_now()
        if row is None:
            row = OntologyObject(
                object_id=object_id,
                tenant_id=tenant_id,
                object_type=object_type,
                name=name,
                properties=properties or {},
                status="active",
                freshness_status="fresh",
            )
            self.s.add(row)
        else:
            if name:
                row.name = name
            merged = dict(row.properties or {})
            if properties:
                merged.update(properties)
            row.properties = merged
            row.freshness_status = "fresh"
            row.updated_at = now
        self.s.flush()
        return row

    def get_object(self, object_id: str) -> Optional[OntologyObject]:
        return self.s.get(OntologyObject, object_id)

    def list_by_tenant(
        self, tenant_id: str, object_type: Optional[str] = None, limit: int = 500
    ) -> List[OntologyObject]:
        stmt = select(OntologyObject).where(OntologyObject.tenant_id == tenant_id)
        if object_type:
            stmt = stmt.where(OntologyObject.object_type == object_type)
        stmt = stmt.limit(limit)
        return list(self.s.scalars(stmt))

    def count_by_type(self, tenant_id: str) -> Dict[str, int]:
        rows = self.s.scalars(select(OntologyObject).where(OntologyObject.tenant_id == tenant_id))
        counts: Dict[str, int] = {}
        for r in rows:
            counts[r.object_type] = counts.get(r.object_type, 0) + 1
        return counts

    # ─── Relationships ────────────────────────────────────────
    def upsert_relationship(
        self,
        *,
        tenant_id: str,
        from_object_id: str,
        to_object_id: str,
        relation_type: str,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> OntologyRelationship:
        stmt = select(OntologyRelationship).where(
            and_(
                OntologyRelationship.tenant_id == tenant_id,
                OntologyRelationship.from_object_id == from_object_id,
                OntologyRelationship.to_object_id == to_object_id,
                OntologyRelationship.relation_type == relation_type,
            )
        )
        existing = self.s.scalars(stmt).first()
        if existing is not None:
            if attributes:
                merged = dict(existing.attributes or {})
                merged.update(attributes)
                existing.attributes = merged
                existing.updated_at = utc_now()
            return existing
        row = OntologyRelationship(
            rel_id=new_id("rel"),
            tenant_id=tenant_id,
            from_object_id=from_object_id,
            to_object_id=to_object_id,
            relation_type=relation_type,
            attributes=attributes or {},
        )
        self.s.add(row)
        self.s.flush()
        return row

    def relationships_for(
        self, object_id: str, direction: str = "outgoing"
    ) -> List[OntologyRelationship]:
        if direction == "outgoing":
            stmt = select(OntologyRelationship).where(
                OntologyRelationship.from_object_id == object_id
            )
        elif direction == "incoming":
            stmt = select(OntologyRelationship).where(
                OntologyRelationship.to_object_id == object_id
            )
        else:
            stmt = select(OntologyRelationship).where(
                (OntologyRelationship.from_object_id == object_id)
                | (OntologyRelationship.to_object_id == object_id)
            )
        return list(self.s.scalars(stmt))
