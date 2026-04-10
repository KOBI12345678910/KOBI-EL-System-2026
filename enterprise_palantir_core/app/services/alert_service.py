from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.repositories.alert_repo import AlertRepository


BUILTIN_RULES = {
    "supplier_delayed": {"severity": "high", "title": "Supplier delay detected"},
    "inventory_low": {"severity": "warning", "title": "Inventory below threshold"},
    "project_at_risk": {"severity": "critical", "title": "Project at risk"},
    "workflow_stalled": {"severity": "high", "title": "Workflow stalled"},
}


class AlertService:
    def __init__(self, db: Session) -> None:
        self.repo = AlertRepository(db)

    def raise_from_event(
        self,
        *,
        tenant_id: str,
        event_type: str,
        entity_id: str,
        description: str = "",
        metadata: dict | None = None,
    ):
        rule = BUILTIN_RULES.get(event_type)
        if rule is None:
            return None
        return self.repo.create(
            alert_id=new_id("alrt"),
            tenant_id=tenant_id,
            severity=rule["severity"],
            alert_type=event_type,
            entity_id=entity_id,
            title=rule["title"],
            description=description or rule["title"],
            metadata=metadata,
        )

    def raise_manual(
        self,
        *,
        tenant_id: str,
        severity: str,
        alert_type: str,
        title: str,
        description: str,
        entity_id: str | None = None,
        metadata: dict | None = None,
    ):
        return self.repo.create(
            alert_id=new_id("alrt"),
            tenant_id=tenant_id,
            severity=severity,
            alert_type=alert_type,
            entity_id=entity_id,
            title=title,
            description=description,
            metadata=metadata,
        )

    def list_open(self, tenant_id: str):
        return self.repo.list_open(tenant_id)

    def list_critical(self, tenant_id: str):
        return self.repo.list_by_severity(tenant_id, "critical")

    def acknowledge(self, alert_id: str):
        return self.repo.set_status(alert_id, "acknowledged")

    def resolve(self, alert_id: str):
        return self.repo.set_status(alert_id, "resolved")
