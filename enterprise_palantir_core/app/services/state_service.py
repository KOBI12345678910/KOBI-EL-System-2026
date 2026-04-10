from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.enums import EntityStatus, EventType, FreshnessStatus
from app.core.time_utils import utc_now
from app.models.events import DomainEvent
from app.models.state import EntityStateRow
from app.repositories.state_repo import StateRepository


class StateService:
    """
    The State Engine. Takes domain events and updates the live state of the
    targeted entity. This is the core of real-time operational awareness.
    """

    def __init__(self, session: Session):
        self.repo = StateRepository(session)

    def apply_event(self, event: DomainEvent) -> EntityStateRow:
        row = self.repo.get(event.canonical_entity_id)
        current_status = row.current_status if row else EntityStatus.ACTIVE.value
        risk_score = row.risk_score if row else 0.0
        blockers = list(row.blockers or []) if row else []
        alerts = list(row.alerts or []) if row else []
        properties = dict(row.properties or {}) if row else {}

        event_type = event.event_type

        if event_type == EventType.SUPPLIER_DELAYED.value:
            current_status = EntityStatus.AT_RISK.value
            risk_score = max(risk_score, 0.85)
            if "supplier_delay" not in blockers:
                blockers.append("supplier_delay")
            if "supplier_delay_alert" not in alerts:
                alerts.append("supplier_delay_alert")

        elif event_type == EventType.INVENTORY_LOW.value:
            current_status = EntityStatus.AT_RISK.value
            risk_score = max(risk_score, 0.75)
            if "inventory_shortage" not in blockers:
                blockers.append("inventory_shortage")

        elif event_type == EventType.PROJECT_AT_RISK.value:
            current_status = EntityStatus.AT_RISK.value
            risk_score = max(risk_score, 0.90)

        elif event_type == EventType.WORKFLOW_STALLED.value:
            current_status = EntityStatus.BLOCKED.value
            if "workflow_stalled" not in blockers:
                blockers.append("workflow_stalled")
            risk_score = max(risk_score, 0.70)

        elif event_type == EventType.PAYMENT_RECEIVED.value:
            current_status = EntityStatus.ACTIVE.value
            properties["last_payment_received"] = event.timestamp.isoformat()

        elif event_type == EventType.STATUS_CHANGED.value:
            new_status = (event.payload or {}).get("status")
            if new_status:
                current_status = str(new_status)

        return self.repo.upsert(
            canonical_entity_id=event.canonical_entity_id,
            tenant_id=event.tenant_id,
            entity_type=event.entity_type,
            current_status=current_status,
            risk_score=risk_score,
            freshness_status=FreshnessStatus.FRESH.value,
            blockers=blockers,
            alerts=alerts,
            properties=properties,
            last_event_at=event.timestamp,
        )

    def get(self, canonical_entity_id: str) -> Optional[EntityStateRow]:
        return self.repo.get(canonical_entity_id)

    def list_by_tenant(self, tenant_id: str) -> List[EntityStateRow]:
        return self.repo.list_by_tenant(tenant_id)

    def at_risk(self, tenant_id: str) -> List[EntityStateRow]:
        return self.repo.at_risk(tenant_id)
