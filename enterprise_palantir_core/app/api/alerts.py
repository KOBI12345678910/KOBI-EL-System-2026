from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_session
from app.models.alerts import Alert
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    alert_id: str
    tenant_id: str
    alert_key: str
    alert_type: str
    title: str
    message: str | None = None
    severity: str
    status: str
    entity_type: str | None = None
    entity_id: str | None = None
    occurrence_count: int
    created_at: str | None = None

    @classmethod
    def from_orm_alert(cls, a: Alert) -> "AlertRead":
        return cls(
            alert_id=a.alert_id,
            tenant_id=a.tenant_id,
            alert_key=a.alert_key,
            alert_type=a.alert_type,
            title=a.title,
            message=a.message,
            severity=a.severity,
            status=a.status,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            occurrence_count=a.occurrence_count,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )


@router.get("/{tenant_id}/open", response_model=List[AlertRead])
def list_open(tenant_id: str, session: Session = Depends(get_session)) -> List[AlertRead]:
    alerts = AlertService(session).list_open(tenant_id)
    return [AlertRead.from_orm_alert(a) for a in alerts]


@router.get("/{tenant_id}/critical", response_model=List[AlertRead])
def list_critical(tenant_id: str, session: Session = Depends(get_session)) -> List[AlertRead]:
    alerts = AlertService(session).list_critical(tenant_id)
    return [AlertRead.from_orm_alert(a) for a in alerts]


@router.post("/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge(alert_id: str, by: str = "system", session: Session = Depends(get_session)) -> AlertRead:
    alert = AlertService(session).acknowledge(alert_id, by)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert_not_found")
    session.commit()
    return AlertRead.from_orm_alert(alert)


@router.post("/{alert_id}/resolve", response_model=AlertRead)
def resolve(alert_id: str, session: Session = Depends(get_session)) -> AlertRead:
    alert = AlertService(session).resolve(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert_not_found")
    session.commit()
    return AlertRead.from_orm_alert(alert)
