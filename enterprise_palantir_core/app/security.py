"""
Security + permissions module.

Exposes `Principal` (authenticated caller) and a `require_permission`
helper that every service uses before touching privileged data.

Multi-tenant isolation is enforced at the principal level: if your
tenant_id does not match the resource tenant_id and you are not a
platform_admin, you get CrossTenantAccessDenied.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Set

from app.config import settings
from app.core.enums import Permission
from app.core.exceptions import CrossTenantAccessDenied, PermissionDenied


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    roles: List[str] = field(default_factory=list)
    permissions: Set[Permission] = field(default_factory=set)
    is_platform_admin: bool = False
    session_id: Optional[str] = None
    ip_address: Optional[str] = None

    def has(self, p: Permission) -> bool:
        return self.is_platform_admin or p in self.permissions

    def has_any(self, *permissions: Permission) -> bool:
        return self.is_platform_admin or any(p in self.permissions for p in permissions)


def demo_principal(tenant_id: str = "tenant_alpha") -> Principal:
    """
    Returns a Principal with all permissions, for demo / local dev.
    Disable by setting settings.enable_demo_security = False.
    """
    return Principal(
        user_id="demo_user",
        tenant_id=tenant_id,
        roles=["admin"],
        permissions=set(Permission),
        is_platform_admin=True,
    )


def require_permission(principal: Principal, permission: Permission) -> None:
    if not principal.has(permission):
        raise PermissionDenied(f"missing_permission:{permission.value}")


def require_tenant(principal: Principal, resource_tenant_id: str) -> None:
    if principal.tenant_id != resource_tenant_id and not principal.is_platform_admin:
        raise CrossTenantAccessDenied(
            f"cross_tenant:{principal.tenant_id}->{resource_tenant_id}"
        )


def check(principal: Principal, permission: Permission, resource_tenant_id: str) -> None:
    require_permission(principal, permission)
    require_tenant(principal, resource_tenant_id)


def get_current_principal(tenant_id: str = "tenant_alpha") -> Principal:
    """
    FastAPI-style dependency. In production this would inspect the JWT.
    For the demo we return `demo_principal` if `enable_demo_security`.
    """
    if settings.enable_demo_security:
        return demo_principal(tenant_id)
    raise PermissionDenied("no_principal")
