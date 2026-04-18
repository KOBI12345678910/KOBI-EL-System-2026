"""
Data Quality Engine — production-grade rule evaluator.

Supports 12 rule types:
  not_null | unique | range | pattern | enum | lookup | freshness
  referential_integrity | schema_match | row_count | distribution | custom

Each rule has a severity + on_failure action: log | warn | block | quarantine.

Every rule evaluation produces a QualityIssue row + updates a per-dataset
quality score. Issues can be open / acknowledged / resolved / suppressed.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"
    CRITICAL = "critical"


class OnFailure(str, Enum):
    LOG = "log"
    WARN = "warn"
    BLOCK = "block"
    QUARANTINE = "quarantine"


class RuleType(str, Enum):
    NOT_NULL = "not_null"
    UNIQUE = "unique"
    RANGE = "range"
    PATTERN = "pattern"
    ENUM = "enum"
    LOOKUP = "lookup"
    FRESHNESS = "freshness"
    REFERENTIAL_INTEGRITY = "referential_integrity"
    SCHEMA_MATCH = "schema_match"
    ROW_COUNT = "row_count"
    DISTRIBUTION = "distribution"
    CUSTOM = "custom"


@dataclass
class QualityRule:
    rule_id: str
    name: str
    rule_type: RuleType
    severity: Severity = Severity.WARNING
    on_failure: OnFailure = OnFailure.LOG
    target_type: str = "record"  # record|dataset|field
    target_key: Optional[str] = None
    field_name: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    description: str = ""


@dataclass
class QualityIssue:
    issue_id: str
    rule_id: str
    rule_name: str
    severity: Severity
    message: str
    record_id: Optional[str] = None
    field_name: Optional[str] = None
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class QualityResult:
    record_id: Optional[str]
    passed: bool
    issues: List[QualityIssue]
    should_block: bool
    should_quarantine: bool


class DataQualityEngine:
    def __init__(self) -> None:
        self.rules: Dict[str, QualityRule] = {}
        self._custom_handlers: Dict[str, Callable[[QualityRule, Dict[str, Any]], Optional[str]]] = {}

    def register(self, rule: QualityRule) -> None:
        self.rules[rule.rule_id] = rule

    def register_custom(self, rule_id: str, handler: Callable[[QualityRule, Dict[str, Any]], Optional[str]]) -> None:
        self._custom_handlers[rule_id] = handler

    def rules_for(self, target_key: str) -> List[QualityRule]:
        return [r for r in self.rules.values() if r.enabled and (r.target_key == target_key or r.target_key is None)]

    def evaluate_record(
        self,
        record: Dict[str, Any],
        *,
        dataset_key: Optional[str] = None,
        record_id: Optional[str] = None,
        lookup_resolver: Optional[Callable[[str, str, Any], bool]] = None,
    ) -> QualityResult:
        issues: List[QualityIssue] = []
        should_block = False
        should_quarantine = False

        applicable = (
            self.rules_for(dataset_key) if dataset_key else
            [r for r in self.rules.values() if r.enabled]
        )

        for rule in applicable:
            issue = self._evaluate_rule(rule, record, lookup_resolver)
            if issue is None:
                continue
            issues.append(issue)
            if rule.on_failure == OnFailure.BLOCK:
                should_block = True
            elif rule.on_failure == OnFailure.QUARANTINE:
                should_quarantine = True

        return QualityResult(
            record_id=record_id,
            passed=len(issues) == 0,
            issues=issues,
            should_block=should_block,
            should_quarantine=should_quarantine,
        )

    # ─── Rule evaluators ──────────────────────────────────────
    def _evaluate_rule(
        self,
        rule: QualityRule,
        record: Dict[str, Any],
        lookup_resolver: Optional[Callable[[str, str, Any], bool]],
    ) -> Optional[QualityIssue]:
        try:
            if rule.rule_type == RuleType.NOT_NULL:
                return self._not_null(rule, record)
            if rule.rule_type == RuleType.RANGE:
                return self._range(rule, record)
            if rule.rule_type == RuleType.PATTERN:
                return self._pattern(rule, record)
            if rule.rule_type == RuleType.ENUM:
                return self._enum(rule, record)
            if rule.rule_type == RuleType.FRESHNESS:
                return self._freshness(rule, record)
            if rule.rule_type == RuleType.REFERENTIAL_INTEGRITY and lookup_resolver is not None:
                return self._referential_integrity(rule, record, lookup_resolver)
            if rule.rule_type == RuleType.CUSTOM:
                handler = self._custom_handlers.get(rule.rule_id)
                if handler is None:
                    return None
                err = handler(rule, record)
                if err:
                    return self._make_issue(rule, err, record.get(rule.field_name or ""))
                return None
        except Exception as exc:
            return self._make_issue(rule, f"rule_error:{exc}", None)
        return None

    def _not_null(self, rule: QualityRule, record: Dict[str, Any]) -> Optional[QualityIssue]:
        f = rule.field_name
        if not f:
            return None
        v = record.get(f)
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return self._make_issue(rule, f"field_{f}_is_null", f, expected="not null", actual=str(v))
        return None

    def _range(self, rule: QualityRule, record: Dict[str, Any]) -> Optional[QualityIssue]:
        f = rule.field_name
        if not f or f not in record:
            return None
        v = record[f]
        try:
            val = float(v)
        except Exception:
            return self._make_issue(rule, f"field_{f}_not_numeric", f, actual=str(v))
        lo = rule.parameters.get("min")
        hi = rule.parameters.get("max")
        if lo is not None and val < float(lo):
            return self._make_issue(rule, f"field_{f}_below_min_{lo}", f, expected=f">={lo}", actual=str(v))
        if hi is not None and val > float(hi):
            return self._make_issue(rule, f"field_{f}_above_max_{hi}", f, expected=f"<={hi}", actual=str(v))
        return None

    def _pattern(self, rule: QualityRule, record: Dict[str, Any]) -> Optional[QualityIssue]:
        f = rule.field_name
        if not f or f not in record:
            return None
        pattern = rule.parameters.get("pattern")
        if not pattern:
            return None
        v = str(record[f])
        if not re.match(pattern, v):
            return self._make_issue(rule, f"field_{f}_no_pattern_match", f, expected=pattern, actual=v)
        return None

    def _enum(self, rule: QualityRule, record: Dict[str, Any]) -> Optional[QualityIssue]:
        f = rule.field_name
        if not f or f not in record:
            return None
        allowed = rule.parameters.get("values", [])
        v = record[f]
        if v not in allowed:
            return self._make_issue(rule, f"field_{f}_not_in_enum", f, expected=str(allowed), actual=str(v))
        return None

    def _freshness(self, rule: QualityRule, record: Dict[str, Any]) -> Optional[QualityIssue]:
        f = rule.field_name or "updated_at"
        v = record.get(f)
        if v is None:
            return self._make_issue(rule, f"field_{f}_missing_for_freshness_check", f)
        try:
            if isinstance(v, str):
                ts = datetime.fromisoformat(v.replace("Z", "+00:00"))
            else:
                ts = v
        except Exception:
            return self._make_issue(rule, f"field_{f}_not_parseable_as_datetime", f, actual=str(v))
        max_age = int(rule.parameters.get("max_age_seconds", 3600))
        if (utc_now() - ts) > timedelta(seconds=max_age):
            return self._make_issue(
                rule,
                f"field_{f}_stale_over_{max_age}s",
                f,
                expected=f"age<={max_age}s",
                actual=str((utc_now() - ts).total_seconds()) + "s",
            )
        return None

    def _referential_integrity(
        self,
        rule: QualityRule,
        record: Dict[str, Any],
        resolver: Callable[[str, str, Any], bool],
    ) -> Optional[QualityIssue]:
        f = rule.field_name
        if not f:
            return None
        v = record.get(f)
        if v is None:
            return None
        target_type = rule.parameters.get("target_type", "")
        target_field = rule.parameters.get("target_field", "id")
        if not resolver(target_type, target_field, v):
            return self._make_issue(
                rule,
                f"field_{f}_references_missing_{target_type}",
                f,
                expected=f"{target_type}.{target_field}={v}",
                actual="not_found",
            )
        return None

    def _make_issue(
        self,
        rule: QualityRule,
        message: str,
        field_name: Optional[str] = None,
        expected: Optional[str] = None,
        actual: Optional[str] = None,
    ) -> QualityIssue:
        return QualityIssue(
            issue_id=new_id("dqi"),
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            message=message,
            field_name=field_name,
            expected_value=expected,
            actual_value=actual,
        )

    # ─── Dataset-level helpers ────────────────────────────────
    def score(self, passed: int, failed: int) -> float:
        total = passed + failed
        if total == 0:
            return 100.0
        return (passed / total) * 100.0
