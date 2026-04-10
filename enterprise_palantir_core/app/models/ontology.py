from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TenantMixin, TimestampMixin


class OntologyObject(Base, TenantMixin, TimestampMixin):
    """
    A canonical operational object: a customer, project, supplier, stock item,
    production line, etc. This is the foundation of the ontology.
    """
    __tablename__ = "ontology_objects"
    __table_args__ = (
        Index("idx_ontology_tenant_type", "tenant_id", "object_type"),
        Index("idx_ontology_status", "status"),
    )

    object_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    object_type: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    properties: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    freshness_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)


class OntologyRelationship(Base, TenantMixin, TimestampMixin):
    """
    A link between two ontology objects. Relationships are first-class: they
    have their own type (supplies_to, depends_on, works_on, ...).
    """
    __tablename__ = "ontology_relationships"
    __table_args__ = (
        UniqueConstraint(
            "from_object_id",
            "to_object_id",
            "relation_type",
            name="uq_ontology_rel_from_to_type",
        ),
        Index("idx_rel_from", "from_object_id"),
        Index("idx_rel_to", "to_object_id"),
        Index("idx_rel_type", "relation_type"),
    )

    rel_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    from_object_id: Mapped[str] = mapped_column(String(100), nullable=False)
    to_object_id: Mapped[str] = mapped_column(String(100), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    attributes: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict)
