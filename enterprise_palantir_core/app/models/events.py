from sqlalchemy import Column, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class DomainEventModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "domain_events"

    id = Column(String, primary_key=True, index=True)
    event_type = Column(String, index=True, nullable=False)
    severity = Column(String, index=True, nullable=False)
    source_system = Column(String, index=True, nullable=False)
    source_record_id = Column(String, nullable=True)
    canonical_entity_id = Column(String, index=True, nullable=False)
    entity_type = Column(String, index=True, nullable=False)

    correlation_id = Column(String, index=True, nullable=True)
    causation_id = Column(String, index=True, nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")
