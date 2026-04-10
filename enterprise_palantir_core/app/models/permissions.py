from sqlalchemy import Column, String, Text

from app.db import Base
from app.models.base import TenantScopedMixin, TimestampMixin


class RoleModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "roles"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    permissions_json = Column(Text, nullable=False, default="[]")


class UserRoleAssignmentModel(Base, TimestampMixin, TenantScopedMixin):
    __tablename__ = "user_role_assignments"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    role_id = Column(String, nullable=False, index=True)
