"""
Alert Engine — rule-driven alert system.

Takes a domain event, matches it against a set of AlertRules (either
built-in or loaded from a DB table), and raises an alert if a rule
fires. De-dupes by `alert_key`: the same key → same row, occurrence
count incremented.

Rules can be:
  - BUILTIN_RULES (the 4 well-known event types below)
  - user-registered via engine.register_rule(rule)
  - loaded from a DB table (future: alert_rules_ext with JSON condition)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models.alerts import AlertModel
from app.models.events import DomainEventModel
from app.repositories.alert_repo import AlertRepository


# ════════════════════════════════════════════════════════════════
# RULE MODEL
# ════════════════════════════════════════════════════════════════

@dataclass
class AlertRule:
    rule_id: str
    name: str
    trigger_event_types: List[str]
    severity: str = "warning"
    title_template: str = "Alert: {event_type}"
    description_template: str = "{event_type} on {entity_type}:{entity_id}"
    target_entity_types: List[str] = field(default_factory=list)
    condition: Optional[Callable[[DomainEventModel], bool]] = None
    dedupe_key_template: str = "{tenant_id}:{entity_id}:{event_type}"


BUILTIN_RULES: List[AlertRule] = [
    AlertRule(
        rule_id="builtin_supplier_delayed",
        name="Supplier delay detected",
        trigger_event_types=["supplier_delayed"],
        severity="high",
        title_template="Supplier delay detected",
    ),
    AlertRule(
        rule_id="builtin_inventory_low",
        name="Inventory below threshold",
        trigger_event_types=["inventory_low"],
        severity="warning",
        title_template="Inventory below threshold",
    ),
    AlertRule(
        rule_id="builtin_project_at_risk",
        name="Project at risk",
        trigger_event_types=["project_at_risk"],
        severity="critical",
        title_template="Project at risk",
    ),
    AlertRule(
        rule_id="builtin_workflow_stalled",
        name="Workflow stalled",
        trigger_event_types=["workflow_stalled"],
        severity="high",
        title_template="Workflow stalled",
    ),
]


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class AlertEngine:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AlertRepository(db)
        self._rules: List[AlertRule] = list(BUILTIN_RULES)

    def register_rule(self, rule: AlertRule) -> None:
        self._rules.append(rule)

    def evaluate(self, event: DomainEventModel) -> List[AlertModel]:
        """
        Match an event against every registered rule. Returns every
        alert that was raised (or incremented) as a result.
        """
        raised: List[AlertModel] = []
        for rule in self._rules:
            if event.event_type not in rule.trigger_event_types:
                continue
            if rule.target_entity_types and event.entity_type not in rule.target_entity_types:
                continue
            if rule.condition is not None:
                try:
                    if not rule.condition(event):
                        continue
                except Exception:
                    continue

            dedupe_ctx = {
                "tenant_id": event.tenant_id,
                "entity_id": event.canonical_entity_id,
                "entity_type": event.entity_type,
                "event_type": event.event_type,
                "severity": event.severity,
            }
            alert_key = rule.dedupe_key_template.format(**dedupe_ctx)
            title = rule.title_template.format(**dedupe_ctx)
            description = rule.description_template.format(**dedupe_ctx)
            payload = json.loads(event.payload_json or "{}")

            alert = self._raise_or_increment(
                tenant_id=event.tenant_id,
                alert_key=alert_key,
                severity=rule.severity,
                alert_type=event.event_type,
                entity_id=event.canonical_entity_id,
                title=title,
                description=description,
                rule_id=rule.rule_id,
                source_event_id=event.id,
                metadata={"rule_id": rule.rule_id, "payload": payload},
            )
            raised.append(alert)
        return raised

    def _raise_or_increment(
        self,
        *,
        tenant_id: str,
        alert_key: str,
        severity: str,
        alert_type: str,
        entity_id: Optional[str],
        title: str,
        description: str,
        rule_id: Optional[str] = None,
        source_event_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AlertModel:
        # Check if there's an open alert with this key for the tenant
        existing = self._find_open_by_key(tenant_id, alert_key)
        if existing is not None:
            # Increment occurrence count by storing in metadata
            meta = json.loads(existing.metadata_json or "{}")
            meta["occurrence_count"] = int(meta.get("occurrence_count", 1)) + 1
            meta["last_seen_at"] = json.dumps({"v": None}, default=str)
            existing.metadata_json = json.dumps(meta, ensure_ascii=False)
            self.db.commit()
            self.db.refresh(existing)
            return existing

        meta = dict(metadata or {})
        meta.update({
            "alert_key": alert_key,
            "rule_id": rule_id,
            "source_event_id": source_event_id,
            "occurrence_count": 1,
        })
        return self.repo.create(
            alert_id=new_id("alrt"),
            tenant_id=tenant_id,
            severity=severity,
            alert_type=alert_type,
            entity_id=entity_id,
            title=title,
            description=description,
            status="open",
            metadata=meta,
        )

    def _find_open_by_key(self, tenant_id: str, alert_key: str) -> Optional[AlertModel]:
        for a in self.repo.list_open(tenant_id):
            meta = json.loads(a.metadata_json or "{}")
            if meta.get("alert_key") == alert_key:
                return a
        return None

    def list_open(self, tenant_id: str) -> List[AlertModel]:
        return self.repo.list_open(tenant_id)

    def list_critical(self, tenant_id: str) -> List[AlertModel]:
        return self.repo.list_by_severity(tenant_id, "critical")
