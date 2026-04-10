from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/live", tags=["live"])


@router.get("/snapshot/{tenant_id}")
def tenant_snapshot(tenant_id: str, db: Session = Depends(get_db)):
    service = SnapshotService(db)
    return service.build_tenant_snapshot(tenant_id)
