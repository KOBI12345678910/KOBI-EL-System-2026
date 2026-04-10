from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.ids import alert_id as _alert_id
from app.core.time_utils import utc_now
from app.models.alerts import Alert, AlertRule


class AlertRepository:
    def __init__(self, session: Session):
        self.s = session

    # ─── Rules ────────────────────────────────────────────────
    def create_rule(
        self,
        *,
        rule_id: str,
        tenant_id: str,
        name: str,
        severity: str = "warning",
        trigger_event_types: Optional[List[str]] = None,
        target_entity_types: Optional[List[str]] = None,
        description: Optional[str] = None,
    ) -> AlertRule:
        row = AlertRule(
            rule_id=rule_id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            trigger_event_types=trigger_event_types or [],
            target_entity_types=target_entity_types or [],
            severity=severity,
            enabled=True,
        )
        self.s.add(row)
        self.s.flush()
        return row

    def list_rules(self, tenant_id: str) -> List[AlertRule]:
        return list(
            self.s.scalars(
                select(AlertRule).where(and_(AlertRule.tenant_id == tenant_id, AlertRule.enabled.is_(True)))
            )
        )

    # ─── Alerts ───────────────────────────────────────────────
    def raise_or_increment(
        self,
        *,
        tenant_id: str,
        alert_key: str,
        alert_type: str,
        title: str,
        severity: str,
        message: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        rule_id: Optional[str] = None,
        source_event_id: Optional[str] = None,
        financial_impact: Optional[float] = None,
        suggested_actions: Optional[List[Dict[str, Any]]] = None,
    ) -> Alert:
        stmt = (
            select(Alert)
            .where(and_(Alert.tenant_id == tenant_id, Alert.alert_key == alert_key))
            .order_by(Alert.created_at.desc())
            .limit(1)
        )
        existing = self.s.scalars(stmt).first()
        now = utc_now()
        if existing is not None and existing.status == "open":
            existing.occurrence_count = (existing.occurrence_count or 1) + 1
            existing.last_seen_at = now
            if message:
                existing.message = message
            self.s.flush()
            return existing
        row = Alert(
            alert_id=_alert_id(),
            tenant_id=tenant_id,
            alert_key=alert_key,
            alert_type=alert_type,
            title=title,
            message=message,
            severity=severity,
            status="open",
            entity_type=entity_type,
            entity_id=entity_id,
            rule_id=rule_id,
            source_event_id=source_event_id,
            suggested_actions=suggested_actions or [],
            impacted_entities=[],
            financial_impact=financial_impact,
            occurrence_count=1,
            first_seen_at=now,
            last_seen_at=now,
        )
        self.s.add(row)
        self.s.flush()
        return row

    def open_alerts(self, tenant_id: str) -> List[Alert]:
        stmt = (
            select(Alert)
            .where(and_(Alert.tenant_id == tenant_id, Alert.status == "open"))
            .order_by(Alert.last_seen_at.desc())
        )
        return list(self.s.scalars(stmt))

    def critical_open(self, tenant_id: str) -> List[Alert]:
        stmt = (
            select(Alert)
            .where(and_(Alert.tenant_id == tenant_id, Alert.status == "open", Alert.severity == "critical"))
        )
        return list(self.s.scalars(stmt))

    def acknowledge(self, alert_id: str, by: str) -> Optional[Alert]:
        alert = self.s.get(Alert, alert_id)
        if alert is None:
            return None
        alert.status = "acknowledged"
        alert.acknowledged_by = by
        alert.acknowledged_at = utc_now()
        self.s.flush()
        return alert

    def resolve(self, alert_id: str) -> Optional[Alert]:
        alert = self.s.get(Alert, alert_id)
        if alert is None:
            return None
        alert.status = "resolved"
        alert.resolved_at = utc_now()
        self.s.flush()
        return alert
