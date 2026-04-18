from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.tenant import Tenant


class TenantRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, *, tenant_id: str, name: str) -> Tenant:
        row = Tenant(id=tenant_id, name=name, is_active=True)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def get(self, tenant_id: str) -> Optional[Tenant]:
        return self.db.query(Tenant).filter(Tenant.id == tenant_id).first()

    def list(self) -> List[Tenant]:
        return self.db.query(Tenant).all()

    def ensure(self, tenant_id: str, name: str | None = None) -> Tenant:
        existing = self.get(tenant_id)
        if existing:
            return existing
        return self.create(tenant_id=tenant_id, name=name or tenant_id)
