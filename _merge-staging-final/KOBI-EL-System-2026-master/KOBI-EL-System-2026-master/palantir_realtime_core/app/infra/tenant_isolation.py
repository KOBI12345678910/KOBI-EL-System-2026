"""
Multi-tenant isolation + permissions hooks.

This is the guardrail that every query, every event, and every write
must pass through. It enforces:

1. Tenant boundaries (no cross-tenant reads without platform_admin)
2. Role-based permissions (read, write, admin)
3. Resource-level ACLs
4. Audit hook for every permission check
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set


class Permission(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"
    EXECUTE_ACTION = "execute_action"
    APPROVE_ACTION = "approve_action"
    VIEW_AUDIT = "view_audit"
    MANAGE_SCHEMAS = "manage_schemas"
    MANAGE_PIPELINES = "manage_pipelines"
    MANAGE_WORKFLOWS = "manage_workflows"


@dataclass
class Principal:
    """Authenticated user + their roles + their tenant."""

    user_id: str
    tenant_id: str
    roles: List[str] = field(default_factory=list)
    permissions: Set[Permission] = field(default_factory=set)
    is_platform_admin: bool = False
    session_id: Optional[str] = None
    ip_address: Optional[str] = None

    def has(self, permission: Permission) -> bool:
        return self.is_platform_admin or permission in self.permissions

    def has_any(self, *permissions: Permission) -> bool:
        return self.is_platform_admin or any(p in self.permissions for p in permissions)


class PermissionDenied(Exception):
    pass


class CrossTenantAccessDenied(Exception):
    pass


@dataclass
class AccessContext:
    principal: Principal
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    resource_tenant_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class TenantIsolation:
    """
    Central permission + tenant isolation authority.

    Every privileged operation passes through `check()`, which:
    1. Verifies the principal has the required permission
    2. Verifies the principal's tenant matches the resource's tenant
    3. Calls every registered audit hook (for logging)
    4. Raises PermissionDenied / CrossTenantAccessDenied if not allowed
    """

    def __init__(self) -> None:
        self._audit_hooks: List[Callable[[AccessContext, bool, Optional[str]], None]] = []

    def register_audit_hook(self, hook: Callable[[AccessContext, bool, Optional[str]], None]) -> None:
        self._audit_hooks.append(hook)

    def check(
        self,
        ctx: AccessContext,
        required_permission: Permission,
    ) -> None:
        granted = True
        reason: Optional[str] = None

        # 1. Permission check
        if not ctx.principal.has(required_permission):
            granted = False
            reason = f"missing_permission:{required_permission.value}"

        # 2. Tenant check
        if granted and ctx.resource_tenant_id and ctx.resource_tenant_id != ctx.principal.tenant_id:
            if not ctx.principal.is_platform_admin:
                granted = False
                reason = (
                    f"cross_tenant_denied:"
                    f"principal_tenant={ctx.principal.tenant_id},"
                    f"resource_tenant={ctx.resource_tenant_id}"
                )

        # 3. Audit every check (granted or denied)
        for hook in self._audit_hooks:
            try:
                hook(ctx, granted, reason)
            except Exception:
                pass

        if not granted:
            if reason and reason.startswith("cross_tenant_denied"):
                raise CrossTenantAccessDenied(reason)
            raise PermissionDenied(reason or "access_denied")

    def filter_by_tenant(self, items: List[Any], principal: Principal) -> List[Any]:
        """Server-side row-level security: strip records from other tenants."""
        if principal.is_platform_admin:
            return items
        return [i for i in items if getattr(i, "tenant_id", None) == principal.tenant_id]

    def require(self, principal: Principal, *permissions: Permission) -> None:
        for p in permissions:
            if not principal.has(p):
                raise PermissionDenied(f"missing_permission:{p.value}")


_global_isolation = TenantIsolation()


def get_tenant_isolation() -> TenantIsolation:
    return _global_isolation
