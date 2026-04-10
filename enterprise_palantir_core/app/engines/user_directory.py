"""
User Directory — in-memory user/role management for local auth +
simulated LDAP/Active Directory.

Models:
  - User: id, email, display_name, tenant_id, roles, groups, is_active
  - Group: id, name, tenant_id, members
  - Role: id, name, permissions

The directory supports:
  - create_user / deactivate_user / update_roles
  - create_group / add_to_group
  - role → permission expansion
  - SSO session tracking (future: plug SAML/OIDC adapter)

This replaces the deliberately-minimal RoleModel in the DB with a
full runtime directory that can be swapped for LDAP/Okta/Azure AD.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class User:
    user_id: str
    email: str
    display_name: str
    tenant_id: str
    role_ids: List[str] = field(default_factory=list)
    group_ids: List[str] = field(default_factory=list)
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Group:
    group_id: str
    name: str
    tenant_id: str
    description: str = ""
    member_ids: Set[str] = field(default_factory=set)
    role_ids: List[str] = field(default_factory=list)


@dataclass
class Role:
    role_id: str
    name: str
    permissions: List[str] = field(default_factory=list)
    description: str = ""


@dataclass
class Session:
    session_id: str
    user_id: str
    tenant_id: str
    created_at: datetime
    expires_at: datetime
    sso_provider: Optional[str] = None


class UserDirectory:
    def __init__(self) -> None:
        self._users: Dict[str, User] = {}
        self._users_by_email: Dict[str, str] = {}
        self._groups: Dict[str, Group] = {}
        self._roles: Dict[str, Role] = {}
        self._sessions: Dict[str, Session] = {}
        self._seed_defaults()

    # ─── Users ───────────────────────────────────────────────
    def create_user(
        self,
        *,
        email: str,
        display_name: str,
        tenant_id: str,
        role_ids: Optional[List[str]] = None,
    ) -> User:
        user_id = f"user_{secrets.token_hex(6)}"
        user = User(
            user_id=user_id,
            email=email.lower(),
            display_name=display_name,
            tenant_id=tenant_id,
            role_ids=list(role_ids or []),
        )
        self._users[user_id] = user
        self._users_by_email[email.lower()] = user_id
        return user

    def get_user(self, user_id: str) -> Optional[User]:
        return self._users.get(user_id)

    def get_by_email(self, email: str) -> Optional[User]:
        uid = self._users_by_email.get(email.lower())
        return self._users.get(uid) if uid else None

    def list_for_tenant(self, tenant_id: str) -> List[User]:
        return [u for u in self._users.values() if u.tenant_id == tenant_id]

    def deactivate(self, user_id: str) -> bool:
        user = self._users.get(user_id)
        if user is None:
            return False
        user.is_active = False
        return True

    def assign_role(self, user_id: str, role_id: str) -> bool:
        user = self._users.get(user_id)
        if user is None or role_id not in self._roles:
            return False
        if role_id not in user.role_ids:
            user.role_ids.append(role_id)
        return True

    # ─── Groups ──────────────────────────────────────────────
    def create_group(
        self,
        *,
        name: str,
        tenant_id: str,
        role_ids: Optional[List[str]] = None,
    ) -> Group:
        group_id = f"grp_{secrets.token_hex(6)}"
        group = Group(
            group_id=group_id,
            name=name,
            tenant_id=tenant_id,
            role_ids=list(role_ids or []),
        )
        self._groups[group_id] = group
        return group

    def add_user_to_group(self, user_id: str, group_id: str) -> bool:
        group = self._groups.get(group_id)
        user = self._users.get(user_id)
        if group is None or user is None:
            return False
        group.member_ids.add(user_id)
        if group_id not in user.group_ids:
            user.group_ids.append(group_id)
        return True

    def list_groups(self, tenant_id: str) -> List[Group]:
        return [g for g in self._groups.values() if g.tenant_id == tenant_id]

    # ─── Roles ───────────────────────────────────────────────
    def register_role(self, role: Role) -> None:
        self._roles[role.role_id] = role

    def get_role(self, role_id: str) -> Optional[Role]:
        return self._roles.get(role_id)

    def all_roles(self) -> List[Role]:
        return list(self._roles.values())

    def effective_permissions(self, user_id: str) -> List[str]:
        """Expand role_ids (direct + from groups) to a permission list."""
        user = self._users.get(user_id)
        if user is None:
            return []
        permissions: Set[str] = set()
        # Direct roles
        for rid in user.role_ids:
            role = self._roles.get(rid)
            if role:
                permissions.update(role.permissions)
        # Group roles
        for gid in user.group_ids:
            group = self._groups.get(gid)
            if group is None:
                continue
            for rid in group.role_ids:
                role = self._roles.get(rid)
                if role:
                    permissions.update(role.permissions)
        return sorted(permissions)

    def has_permission(self, user_id: str, permission: str) -> bool:
        return permission in self.effective_permissions(user_id)

    # ─── Sessions ────────────────────────────────────────────
    def create_session(
        self,
        user_id: str,
        *,
        ttl_hours: int = 8,
        sso_provider: Optional[str] = None,
    ) -> Optional[Session]:
        user = self._users.get(user_id)
        if user is None or not user.is_active:
            return None
        session = Session(
            session_id=secrets.token_urlsafe(32),
            user_id=user_id,
            tenant_id=user.tenant_id,
            created_at=utc_now(),
            expires_at=utc_now() + timedelta(hours=ttl_hours),
            sso_provider=sso_provider,
        )
        self._sessions[session.session_id] = session
        user.last_login_at = utc_now()
        return session

    def verify_session(self, session_id: str) -> Optional[Session]:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if utc_now() > session.expires_at:
            self._sessions.pop(session_id, None)
            return None
        return session

    def revoke_session(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    # ─── Seed defaults ───────────────────────────────────────
    def _seed_defaults(self) -> None:
        # Default roles
        self.register_role(Role(
            role_id="role_platform_admin",
            name="platform_admin",
            permissions=["*"],
            description="Full platform access across all tenants",
        ))
        self.register_role(Role(
            role_id="role_ops_manager",
            name="ops_manager",
            permissions=[
                "ontology.read", "ontology.write",
                "command_center.view",
                "workflows.manage", "alerts.acknowledge",
                "actions.request",
            ],
        ))
        self.register_role(Role(
            role_id="role_finance_manager",
            name="finance_manager",
            permissions=[
                "ontology.read", "analytics.view", "audit.read",
                "actions.approve", "backups.create",
            ],
        ))
        self.register_role(Role(
            role_id="role_analyst",
            name="analyst",
            permissions=["ontology.read", "command_center.view", "analytics.view"],
        ))

        # Default users for Techno-Kol Uzi
        admin = self.create_user(
            email="kobi@techno-kol-uzi.co.il",
            display_name="Kobi Uzi",
            tenant_id="techno_kol_uzi",
            role_ids=["role_platform_admin"],
        )
        ops = self.create_user(
            email="yossi@techno-kol-uzi.co.il",
            display_name="Yossi Cohen",
            tenant_id="techno_kol_uzi",
            role_ids=["role_ops_manager"],
        )
        finance = self.create_user(
            email="miri@techno-kol-uzi.co.il",
            display_name="Miri Finance",
            tenant_id="techno_kol_uzi",
            role_ids=["role_finance_manager"],
        )
        analyst = self.create_user(
            email="analyst@techno-kol-uzi.co.il",
            display_name="Daniel Analyst",
            tenant_id="techno_kol_uzi",
            role_ids=["role_analyst"],
        )

        # Default groups
        ops_team = self.create_group(
            name="Operations Team",
            tenant_id="techno_kol_uzi",
            role_ids=["role_ops_manager"],
        )
        self.add_user_to_group(ops.user_id, ops_team.group_id)
        self.add_user_to_group(analyst.user_id, ops_team.group_id)


_directory: Optional[UserDirectory] = None


def get_user_directory() -> UserDirectory:
    global _directory
    if _directory is None:
        _directory = UserDirectory()
    return _directory
