from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import Permission
from app.core.exceptions import PermissionDenied
from app.models.permissions import Role, User, UserRole
from app.security import Principal


class PermissionService:
    def __init__(self, session: Session):
        self.s = session

    def build_principal(self, user_id: str) -> Principal:
        """Load a Principal from the DB (roles + permissions)."""
        user = self.s.get(User, user_id)
        if user is None:
            raise PermissionDenied(f"user_not_found:{user_id}")

        assignments = list(
            self.s.scalars(select(UserRole).where(UserRole.user_id == user_id))
        )
        role_ids = [a.role_id for a in assignments]

        permissions: set[Permission] = set()
        roles: List[str] = []
        for rid in role_ids:
            role = self.s.get(Role, rid)
            if role is None:
                continue
            roles.append(role.name)
            for p in (role.permissions or []):
                try:
                    permissions.add(Permission(p))
                except ValueError:
                    continue

        return Principal(
            user_id=user.user_id,
            tenant_id=user.tenant_id,
            roles=roles,
            permissions=permissions,
            is_platform_admin=user.is_platform_admin,
        )

    def create_role(
        self, *, role_id: str, tenant_id: str, name: str, permissions: List[str]
    ) -> Role:
        role = Role(role_id=role_id, tenant_id=tenant_id, name=name, permissions=permissions)
        self.s.add(role)
        self.s.flush()
        return role

    def grant_role(self, *, user_id: str, role_id: str, granted_by: Optional[str] = None) -> UserRole:
        from app.core.ids import new_id
        from app.core.time_utils import utc_now
        user = self.s.get(User, user_id)
        if user is None:
            raise PermissionDenied(f"user_not_found:{user_id}")
        assignment = UserRole(
            id=new_id("ur"),
            tenant_id=user.tenant_id,
            user_id=user_id,
            role_id=role_id,
            granted_by=granted_by,
            granted_at=utc_now(),
        )
        self.s.add(assignment)
        self.s.flush()
        return assignment
