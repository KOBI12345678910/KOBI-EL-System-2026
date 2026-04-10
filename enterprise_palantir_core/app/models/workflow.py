from sqlalchemy import Column, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class WorkflowDefinitionModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "workflow_definitions"

    id = Column(String, primary_key=True, index=True)
    workflow_type = Column(String, index=True, nullable=False)
    definition_json = Column(Text, nullable=False, default="{}")


class WorkflowInstanceModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "workflow_instances"

    id = Column(String, primary_key=True, index=True)
    workflow_type = Column(String, index=True, nullable=False)
    target_entity_id = Column(String, index=True, nullable=False)

    current_step = Column(String, nullable=True)
    status = Column(String, index=True, nullable=False, default="active")

    history_json = Column(Text, nullable=False, default="[]")
    context_json = Column(Text, nullable=False, default="{}")
