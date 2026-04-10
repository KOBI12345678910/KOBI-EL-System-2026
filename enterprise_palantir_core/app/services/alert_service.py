from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.alerts import Alert
from app.models.events import DomainEvent
from app.repositories.alert_repo import AlertRepository


# Baseline built-in rules. In production these would come from AlertRule rows.
BUILTIN_RULES = {
    "supplier_delayed": {"severity": "high", "title": "Supplier delay detected"},
    "inventory_low": {"severity": "warning", "title": "Inventory below threshold"},
    "project_at_risk": {"severity": "critical", "title": "Project at risk"},
    "workflow_stalled": {"severity": "high", "title": "Workflow stalled"},
}


class AlertService:
    def __init__(self, session: Session):
        self.repo = AlertRepository(session)

    def evaluate_event(self, event: DomainEvent) -> Optional[Alert]:
        """
        Match an event against built-in rules. If a rule fires,
        raise (or increment) the matching alert.
        """
        rule = BUILTIN_RULES.get(event.event_type)
        if rule is None:
            return None
        alert_key = f"{event.entity_type}:{event.canonical_entity_id}:{event.event_type}"
        return self.repo.raise_or_increment(
            tenant_id=event.tenant_id,
            alert_key=alert_key,
            alert_type=event.event_type,
            title=rule["title"],
            severity=rule["severity"],
            message=f"{event.event_type} on {event.entity_type}:{event.canonical_entity_id}",
            entity_type=event.entity_type,
            entity_id=event.canonical_entity_id,
            source_event_id=event.event_id,
        )

    def list_open(self, tenant_id: str) -> List[Alert]:
        return self.repo.open_alerts(tenant_id)

    def list_critical(self, tenant_id: str) -> List[Alert]:
        return self.repo.critical_open(tenant_id)

    def acknowledge(self, alert_id: str, by: str) -> Optional[Alert]:
        return self.repo.acknowledge(alert_id, by)

    def resolve(self, alert_id: str) -> Optional[Alert]:
        return self.repo.resolve(alert_id)
