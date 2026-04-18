import json
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.alerts import AlertModel


class AlertRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        alert_id: str,
        tenant_id: str,
        severity: str,
        alert_type: str,
        entity_id: str | None,
        title: str,
        description: str,
        status: str = "open",
        metadata: dict | None = None,
    ) -> AlertModel:
        row = AlertModel(
            id=alert_id,
            tenant_id=tenant_id,
            severity=severity,
            alert_type=alert_type,
            entity_id=entity_id,
            title=title,
            description=description,
            status=status,
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def get(self, alert_id: str) -> Optional[AlertModel]:
        return self.db.query(AlertModel).filter(AlertModel.id == alert_id).first()

    def list_open(self, tenant_id: str) -> List[AlertModel]:
        return (
            self.db.query(AlertModel)
            .filter(AlertModel.tenant_id == tenant_id, AlertModel.status == "open")
            .order_by(AlertModel.created_at.desc())
            .all()
        )

    def list_by_severity(self, tenant_id: str, severity: str) -> List[AlertModel]:
        return (
            self.db.query(AlertModel)
            .filter(AlertModel.tenant_id == tenant_id, AlertModel.severity == severity)
            .order_by(AlertModel.created_at.desc())
            .all()
        )

    def set_status(self, alert_id: str, status: str) -> Optional[AlertModel]:
        row = self.get(alert_id)
        if row is None:
            return None
        row.status = status
        self.db.commit()
        self.db.refresh(row)
        return row
