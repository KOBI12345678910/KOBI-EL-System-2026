import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertOut(BaseModel):
    id: str
    tenant_id: str
    severity: str
    alert_type: str
    entity_id: str | None
    title: str
    description: str
    status: str
    metadata: dict
    created_at: str | None
    updated_at: str | None


def _to_out(a) -> AlertOut:
    return AlertOut(
        id=a.id,
        tenant_id=a.tenant_id,
        severity=a.severity,
        alert_type=a.alert_type,
        entity_id=a.entity_id,
        title=a.title,
        description=a.description,
        status=a.status,
        metadata=json.loads(a.metadata_json or "{}"),
        created_at=a.created_at.isoformat() if a.created_at else None,
        updated_at=a.updated_at.isoformat() if a.updated_at else None,
    )


@router.get("/{tenant_id}/open", response_model=List[AlertOut])
def list_open(tenant_id: str, db: Session = Depends(get_db)) -> List[AlertOut]:
    return [_to_out(a) for a in AlertService(db).list_open(tenant_id)]


@router.get("/{tenant_id}/critical", response_model=List[AlertOut])
def list_critical(tenant_id: str, db: Session = Depends(get_db)) -> List[AlertOut]:
    return [_to_out(a) for a in AlertService(db).list_critical(tenant_id)]


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: str, db: Session = Depends(get_db)) -> AlertOut:
    alert = AlertService(db).acknowledge(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert_not_found")
    return _to_out(alert)


@router.post("/{alert_id}/resolve", response_model=AlertOut)
def resolve(alert_id: str, db: Session = Depends(get_db)) -> AlertOut:
    alert = AlertService(db).resolve(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert_not_found")
    return _to_out(alert)
