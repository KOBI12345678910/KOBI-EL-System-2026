from sqlalchemy import Column, ForeignKey, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class OntologyObject(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "ontology_objects"

    id = Column(String, primary_key=True, index=True)
    object_type = Column(String, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    status = Column(String, index=True, nullable=False, default="active")

    canonical_external_key = Column(String, index=True, nullable=True)
    properties_json = Column(Text, nullable=False, default="{}")
    relationships_json = Column(Text, nullable=False, default="{}")


class OntologyLink(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "ontology_links"

    id = Column(String, primary_key=True, index=True)
    source_object_id = Column(String, ForeignKey("ontology_objects.id"), nullable=False, index=True)
    target_object_id = Column(String, ForeignKey("ontology_objects.id"), nullable=False, index=True)
    link_type = Column(String, index=True, nullable=False)
    metadata_json = Column(Text, nullable=False, default="{}")
