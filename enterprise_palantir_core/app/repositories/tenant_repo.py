from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tenant import Tenant


class TenantRepository:
    def __init__(self, session: Session):
        self.s = session

    def create(self, tenant_id: str, name: str, tier: str = "standard") -> Tenant:
        row = Tenant(tenant_id=tenant_id, name=name, tier=tier, metadata_={})
        self.s.add(row)
        self.s.flush()
        return row

    def get(self, tenant_id: str) -> Optional[Tenant]:
        return self.s.get(Tenant, tenant_id)

    def list(self) -> List[Tenant]:
        return list(self.s.scalars(select(Tenant)))

    def ensure(self, tenant_id: str, name: Optional[str] = None) -> Tenant:
        existing = self.get(tenant_id)
        if existing:
            return existing
        return self.create(tenant_id=tenant_id, name=name or tenant_id)
