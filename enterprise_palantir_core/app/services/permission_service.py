import json
from typing import List

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models.permissions import RoleModel, UserRoleAssignmentModel


class PermissionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_role(self, *, tenant_id: str, name: str, permissions: List[str]) -> RoleModel:
        row = RoleModel(
            id=new_id("role"),
            tenant_id=tenant_id,
            name=name,
            permissions_json=json.dumps(permissions, ensure_ascii=False),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def assign_role(self, *, tenant_id: str, user_id: str, role_id: str) -> UserRoleAssignmentModel:
        row = UserRoleAssignmentModel(
            id=new_id("ur"),
            tenant_id=tenant_id,
            user_id=user_id,
            role_id=role_id,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def list_roles(self, tenant_id: str) -> List[RoleModel]:
        return self.db.query(RoleModel).filter(RoleModel.tenant_id == tenant_id).all()

    def user_permissions(self, *, tenant_id: str, user_id: str) -> List[str]:
        assignments = (
            self.db.query(UserRoleAssignmentModel)
            .filter(
                UserRoleAssignmentModel.tenant_id == tenant_id,
                UserRoleAssignmentModel.user_id == user_id,
            )
            .all()
        )
        permissions: set[str] = set()
        for a in assignments:
            role = self.db.query(RoleModel).filter(RoleModel.id == a.role_id).first()
            if role is None:
                continue
            for p in json.loads(role.permissions_json or "[]"):
                permissions.add(p)
        return sorted(permissions)
