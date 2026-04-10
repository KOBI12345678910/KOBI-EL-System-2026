"""
SQLAlchemy ORM model registry.

Importing this package registers every table with Base.metadata so
create_all() picks them up.
"""

from app.models.alerts import AlertModel  # noqa: F401
from app.models.audit import AuditLogModel  # noqa: F401
from app.models.base import TenantScopedMixin, TimestampMixin  # noqa: F401
from app.models.events import DomainEventModel  # noqa: F401
from app.models.ontology import OntologyLink, OntologyObject  # noqa: F401
from app.models.permissions import RoleModel, UserRoleAssignmentModel  # noqa: F401
from app.models.state import EntityStateModel  # noqa: F401
from app.models.tenant import Tenant  # noqa: F401
from app.models.workflow import WorkflowDefinitionModel, WorkflowInstanceModel  # noqa: F401
