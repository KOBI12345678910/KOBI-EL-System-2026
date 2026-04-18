"""
Schema Registry Service.

Manages versioned schemas for every source feed. Enforces compatibility
policies (backward / forward / full) when a new version is registered.
Schemas drive the Data Quality Engine — every raw record is validated
against its declared schema before being mapped to canonical form.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CompatibilityMode(str, Enum):
    NONE = "none"
    BACKWARD = "backward"     # new schema can read old data
    FORWARD = "forward"       # old schema can read new data
    FULL = "full"             # both


@dataclass
class SchemaField:
    name: str
    field_type: str
    nullable: bool = True
    description: str = ""
    semantic_type: Optional[str] = None  # email|phone|money|percent|date|...


@dataclass
class Schema:
    schema_id: str
    name: str
    version: str
    fields: List[SchemaField]
    primary_key: Optional[str] = None
    owner: Optional[str] = None
    tenant_id: Optional[str] = None
    compatibility: CompatibilityMode = CompatibilityMode.BACKWARD
    status: str = "active"
    registered_at: datetime = field(default_factory=utc_now)
    previous_version: Optional[str] = None
    description: str = ""


@dataclass
class RegistrationResult:
    schema: Schema
    is_breaking: bool
    issues: List[str] = field(default_factory=list)


class SchemaCompatibilityError(Exception):
    pass


class SchemaRegistryService:
    def __init__(self) -> None:
        # key = (name, version)
        self._schemas: Dict[Tuple[str, str], Schema] = {}
        # key = name → list of versions in registration order
        self._versions: Dict[str, List[str]] = {}

    def register(self, schema: Schema, *, enforce: bool = True) -> RegistrationResult:
        key = (schema.name, schema.version)
        if key in self._schemas:
            return RegistrationResult(schema=self._schemas[key], is_breaking=False)

        is_breaking = False
        issues: List[str] = []

        # Check compatibility with the latest version, if any
        prev_version = self.latest_version(schema.name)
        if prev_version is not None:
            prev = self._schemas[(schema.name, prev_version)]
            compat_ok, reasons = self._check_compatibility(prev, schema, schema.compatibility)
            if not compat_ok:
                is_breaking = True
                issues.extend(reasons)
                if enforce and schema.compatibility != CompatibilityMode.NONE:
                    raise SchemaCompatibilityError(
                        f"Schema {schema.name}:{schema.version} is not {schema.compatibility.value}-compatible with {prev.version}: {reasons}"
                    )
            schema.previous_version = prev_version

        self._schemas[key] = schema
        self._versions.setdefault(schema.name, []).append(schema.version)
        return RegistrationResult(schema=schema, is_breaking=is_breaking, issues=issues)

    def get(self, name: str, version: str) -> Optional[Schema]:
        return self._schemas.get((name, version))

    def latest(self, name: str) -> Optional[Schema]:
        v = self.latest_version(name)
        return self._schemas.get((name, v)) if v else None

    def latest_version(self, name: str) -> Optional[str]:
        versions = self._versions.get(name, [])
        return versions[-1] if versions else None

    def versions_of(self, name: str) -> List[Schema]:
        versions = self._versions.get(name, [])
        return [self._schemas[(name, v)] for v in versions if (name, v) in self._schemas]

    def all(self) -> List[Schema]:
        return list(self._schemas.values())

    def retire(self, name: str, version: str) -> bool:
        s = self._schemas.get((name, version))
        if s is None:
            return False
        s.status = "retired"
        return True

    # ─── Compatibility checks ─────────────────────────────────
    def _check_compatibility(
        self, old: Schema, new: Schema, mode: CompatibilityMode
    ) -> Tuple[bool, List[str]]:
        if mode == CompatibilityMode.NONE:
            return True, []

        issues: List[str] = []

        old_fields = {f.name: f for f in old.fields}
        new_fields = {f.name: f for f in new.fields}

        if mode in (CompatibilityMode.BACKWARD, CompatibilityMode.FULL):
            # backward: new schema must be able to read old data
            # → every required field in OLD must still exist in NEW
            #   with compatible type
            for fname, old_f in old_fields.items():
                if not old_f.nullable and fname not in new_fields:
                    issues.append(f"backward_broken:removed_required_field:{fname}")
                elif fname in new_fields:
                    new_f = new_fields[fname]
                    if new_f.field_type != old_f.field_type:
                        issues.append(
                            f"backward_broken:type_changed:{fname}:{old_f.field_type}->{new_f.field_type}"
                        )

        if mode in (CompatibilityMode.FORWARD, CompatibilityMode.FULL):
            # forward: old schema must be able to read new data
            # → every required field in NEW must also exist in OLD
            for fname, new_f in new_fields.items():
                if not new_f.nullable and fname not in old_fields:
                    issues.append(f"forward_broken:added_required_field:{fname}")

        return len(issues) == 0, issues
