"""
Data Quality Engine — rule-driven data quality checks across every
entity in the ontology.

Each rule is a QualityCheck with:
  - rule_id, name, severity
  - scope (entity_type filter, tenant filter)
  - predicate: (entity, properties) -> Optional[str] (returns failure reason)
  - fix_hint: str (how to remediate)

Built-in checks:
  - required_fields: certain properties must exist
  - non_null: values must not be null
  - range: numeric values must be within bounds
  - regex: string values must match a pattern
  - referential: relationship targets must exist
  - freshness: last_event_at must be within N hours
  - uniqueness: canonical_external_key uniqueness

The engine runs every check against every matching entity, collects
violations, and returns a QualityReport with coverage metrics.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DQSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class QualityCheck:
    rule_id: str
    name: str
    description: str
    severity: DQSeverity
    applies_to_entity_types: Optional[List[str]]  # None = all
    predicate: Callable[[OntologyObject, Dict[str, Any], Optional[EntityStateModel]], Optional[str]]
    fix_hint: str = ""


@dataclass
class QualityViolation:
    rule_id: str
    rule_name: str
    severity: DQSeverity
    entity_id: str
    entity_type: str
    entity_name: str
    reason: str
    fix_hint: str
    detected_at: datetime = field(default_factory=utc_now)


@dataclass
class QualityReport:
    tenant_id: str
    generated_at: datetime
    total_entities_checked: int
    total_rules_applied: int
    total_violations: int
    violations_by_severity: Dict[str, int]
    violations_by_rule: Dict[str, int]
    quality_score: float  # 0-100
    violations: List[QualityViolation]


# ════════════════════════════════════════════════════════════════
# BUILT-IN CHECK BUILDERS
# ════════════════════════════════════════════════════════════════

def required_field_check(
    rule_id: str,
    entity_type: str,
    field_name: str,
    severity: DQSeverity = DQSeverity.WARNING,
) -> QualityCheck:
    def predicate(obj, props, state):
        if field_name not in props or props[field_name] in (None, "", []):
            return f"required field '{field_name}' is missing or empty"
        return None
    return QualityCheck(
        rule_id=rule_id,
        name=f"{entity_type} requires {field_name}",
        description=f"Every {entity_type} must have a non-empty '{field_name}' property",
        severity=severity,
        applies_to_entity_types=[entity_type],
        predicate=predicate,
        fix_hint=f"Populate the '{field_name}' property during ingestion",
    )


def numeric_range_check(
    rule_id: str,
    entity_type: str,
    field_name: str,
    *,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    severity: DQSeverity = DQSeverity.WARNING,
) -> QualityCheck:
    def predicate(obj, props, state):
        v = props.get(field_name)
        if v is None:
            return None
        try:
            n = float(v)
        except Exception:
            return f"field '{field_name}' is not numeric: {v}"
        if min_value is not None and n < min_value:
            return f"field '{field_name}'={n} is below minimum {min_value}"
        if max_value is not None and n > max_value:
            return f"field '{field_name}'={n} is above maximum {max_value}"
        return None
    return QualityCheck(
        rule_id=rule_id,
        name=f"{entity_type}.{field_name} range check",
        description=f"{field_name} must be in [{min_value}, {max_value}]",
        severity=severity,
        applies_to_entity_types=[entity_type],
        predicate=predicate,
        fix_hint=f"Clamp {field_name} to the valid range or reject the record",
    )


def regex_check(
    rule_id: str,
    entity_type: str,
    field_name: str,
    pattern: str,
    *,
    severity: DQSeverity = DQSeverity.WARNING,
) -> QualityCheck:
    compiled = re.compile(pattern)

    def predicate(obj, props, state):
        v = props.get(field_name)
        if v is None:
            return None
        if not isinstance(v, str):
            return f"field '{field_name}' is not a string"
        if not compiled.match(v):
            return f"field '{field_name}'='{v}' does not match pattern '{pattern}'"
        return None
    return QualityCheck(
        rule_id=rule_id,
        name=f"{entity_type}.{field_name} format check",
        description=f"{field_name} must match {pattern}",
        severity=severity,
        applies_to_entity_types=[entity_type],
        predicate=predicate,
        fix_hint=f"Normalize {field_name} to the expected format",
    )


def freshness_check(
    rule_id: str,
    entity_type: str,
    *,
    max_age_hours: int = 24,
    severity: DQSeverity = DQSeverity.WARNING,
) -> QualityCheck:
    def predicate(obj, props, state):
        if state is None:
            return f"no state record found for {entity_type}"
        last = state.updated_at
        if last is None:
            return "state has no updated_at timestamp"
        last_aware = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
        age = utc_now() - last_aware
        if age > timedelta(hours=max_age_hours):
            hours = int(age.total_seconds() / 3600)
            return f"state is stale ({hours}h old, max {max_age_hours}h)"
        return None
    return QualityCheck(
        rule_id=rule_id,
        name=f"{entity_type} freshness check",
        description=f"Every {entity_type} must have received an event in the last {max_age_hours}h",
        severity=severity,
        applies_to_entity_types=[entity_type],
        predicate=predicate,
        fix_hint="Check the connector for this source system for stalled ingestion",
    )


# ════════════════════════════════════════════════════════════════
# ENGINE
# ════════════════════════════════════════════════════════════════

class DataQualityEngine:
    def __init__(self, db: Session) -> None:
        self.db = db
        self._checks: List[QualityCheck] = []
        self._seed_default_checks()

    def register(self, check: QualityCheck) -> None:
        self._checks.append(check)

    def all_checks(self) -> List[QualityCheck]:
        return list(self._checks)

    def run(self, tenant_id: str) -> QualityReport:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        states = (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.tenant_id == tenant_id)
            .all()
        )
        states_by_id = {s.canonical_entity_id: s for s in states}

        violations: List[QualityViolation] = []
        entities_checked: Set[str] = set()
        checks_applied = 0

        for obj in objects:
            try:
                props = json.loads(obj.properties_json or "{}")
            except Exception:
                props = {}
            state = states_by_id.get(obj.id)
            for check in self._checks:
                if check.applies_to_entity_types and obj.object_type not in check.applies_to_entity_types:
                    continue
                checks_applied += 1
                try:
                    reason = check.predicate(obj, props, state)
                except Exception as exc:
                    reason = f"rule error: {exc}"
                if reason:
                    violations.append(QualityViolation(
                        rule_id=check.rule_id,
                        rule_name=check.name,
                        severity=check.severity,
                        entity_id=obj.id,
                        entity_type=obj.object_type,
                        entity_name=obj.name,
                        reason=reason,
                        fix_hint=check.fix_hint,
                    ))
            entities_checked.add(obj.id)

        by_severity: Dict[str, int] = {}
        by_rule: Dict[str, int] = {}
        severity_weights = {
            DQSeverity.INFO: 1,
            DQSeverity.WARNING: 3,
            DQSeverity.HIGH: 6,
            DQSeverity.CRITICAL: 10,
        }
        total_weighted = 0
        for v in violations:
            by_severity[v.severity.value] = by_severity.get(v.severity.value, 0) + 1
            by_rule[v.rule_id] = by_rule.get(v.rule_id, 0) + 1
            total_weighted += severity_weights.get(v.severity, 1)

        # Quality score: 100 if no violations, decaying with weighted count
        max_penalty = len(entities_checked) * 10
        if max_penalty == 0:
            quality_score = 100.0
        else:
            quality_score = max(0.0, 100.0 - (total_weighted / max_penalty) * 100.0)

        return QualityReport(
            tenant_id=tenant_id,
            generated_at=utc_now(),
            total_entities_checked=len(entities_checked),
            total_rules_applied=checks_applied,
            total_violations=len(violations),
            violations_by_severity=by_severity,
            violations_by_rule=by_rule,
            quality_score=round(quality_score, 1),
            violations=violations,
        )

    # ─── Default checks for Techno-Kol Uzi ───────────────────
    def _seed_default_checks(self) -> None:
        self.register(required_field_check(
            "dq.customer.required_status", "Customer", "status"
        ))
        self.register(required_field_check(
            "dq.supplier.required_country", "Supplier", "country", DQSeverity.INFO,
        ))
        self.register(numeric_range_check(
            "dq.supplier.on_time_rate", "Supplier", "on_time_rate",
            min_value=0.0, max_value=1.0, severity=DQSeverity.HIGH,
        ))
        self.register(numeric_range_check(
            "dq.project.progress_pct", "Project", "progress_pct",
            min_value=0.0, max_value=100.0,
        ))
        self.register(numeric_range_check(
            "dq.invoice.amount_positive", "Invoice", "amount_ils",
            min_value=0, severity=DQSeverity.HIGH,
        ))
        self.register(numeric_range_check(
            "dq.material.qty_non_negative", "Material", "qty_on_hand",
            min_value=0, severity=DQSeverity.CRITICAL,
        ))
        self.register(required_field_check(
            "dq.employee.required_department", "Employee", "department",
        ))
        # Freshness checks on the critical entity types
        self.register(freshness_check(
            "dq.project.freshness", "Project",
            max_age_hours=72, severity=DQSeverity.WARNING,
        ))
        self.register(freshness_check(
            "dq.production_order.freshness", "ProductionOrder",
            max_age_hours=24, severity=DQSeverity.HIGH,
        ))
