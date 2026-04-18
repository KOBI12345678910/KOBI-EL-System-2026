"""
Security + permissions module.

Lightweight Principal + permission check for the demo. A real
deployment would plug in JWT parsing / OAuth here.
"""

from dataclasses import dataclass, field
from typing import List, Set

from app.config import settings
from app.core.exceptions import CrossTenantAccessDenied, PermissionDenied


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    roles: List[str] = field(default_factory=list)
    permissions: Set[str] = field(default_factory=set)
    is_platform_admin: bool = False

    def has(self, permission: str) -> bool:
        return self.is_platform_admin or permission in self.permissions

    def has_any(self, *permissions: str) -> bool:
        return self.is_platform_admin or any(p in self.permissions for p in permissions)


def demo_principal(tenant_id: str = "tenant_alpha") -> Principal:
    return Principal(
        user_id="demo_user",
        tenant_id=tenant_id,
        roles=["admin"],
        permissions={"read", "write", "delete", "admin", "execute_action", "approve_action"},
        is_platform_admin=True,
    )


def require_permission(principal: Principal, permission: str) -> None:
    if not principal.has(permission):
        raise PermissionDenied(f"missing_permission:{permission}")


def require_tenant(principal: Principal, resource_tenant_id: str) -> None:
    if principal.tenant_id != resource_tenant_id and not principal.is_platform_admin:
        raise CrossTenantAccessDenied(
            f"cross_tenant:{principal.tenant_id}->{resource_tenant_id}"
        )


def check(principal: Principal, permission: str, resource_tenant_id: str) -> None:
    require_permission(principal, permission)
    require_tenant(principal, resource_tenant_id)


def get_current_principal(tenant_id: str = "tenant_alpha") -> Principal:
    if settings.enable_demo_security:
        return demo_principal(tenant_id)
    raise PermissionDenied("no_principal")
