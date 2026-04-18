"""
Replay Engine — reconstruct state at any point in time from the event
store.

Because every mutation flows through the event bus and is persisted in
`domain_events`, we can "rewind" the ontology to its exact state at
any past timestamp. This enables:

  - Audit investigations ("what did we know at 14:00 yesterday?")
  - Regression testing new rules on historical data
  - Debugging stuck workflows by replaying their event timeline
  - Before/after comparisons when a bad mutation slipped through

The engine operates entirely in-memory — it never writes to the DB.
The reconstructed state is returned as a dict keyed by canonical
entity id.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.events import DomainEventModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class EntitySnapshot:
    entity_id: str
    entity_type: str
    properties: Dict[str, Any] = field(default_factory=dict)
    relationships: Dict[str, List[str]] = field(default_factory=dict)
    last_event_id: Optional[str] = None
    last_event_type: Optional[str] = None
    last_event_at: Optional[datetime] = None


@dataclass
class ReplayResult:
    tenant_id: str
    as_of: datetime
    events_replayed: int
    entities_reconstructed: int
    entities: Dict[str, EntitySnapshot]
    generated_at: datetime = field(default_factory=utc_now)


@dataclass
class EntityTimelineItem:
    event_id: str
    event_type: str
    severity: str
    created_at: Optional[datetime]
    payload: Dict[str, Any]


class ReplayEngine:
    def __init__(self, db: Session) -> None:
        self.db = db

    def reconstruct_at(
        self,
        tenant_id: str,
        as_of: datetime,
        *,
        entity_id: Optional[str] = None,
    ) -> ReplayResult:
        """
        Reconstruct entity state as it was at `as_of`. If `entity_id`
        is provided, reconstruct only that entity. Otherwise, every
        entity.
        """
        query = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .filter(DomainEventModel.created_at <= as_of)
            .order_by(DomainEventModel.created_at.asc())
        )
        if entity_id:
            query = query.filter(DomainEventModel.canonical_entity_id == entity_id)
        events = query.all()

        entities: Dict[str, EntitySnapshot] = {}
        for event in events:
            snap = entities.get(event.canonical_entity_id)
            if snap is None:
                snap = EntitySnapshot(
                    entity_id=event.canonical_entity_id,
                    entity_type=event.entity_type,
                )
                entities[event.canonical_entity_id] = snap

            try:
                payload = json.loads(event.payload_json or "{}")
            except Exception:
                payload = {}

            # Merge properties
            props = payload.get("properties", {})
            if isinstance(props, dict):
                snap.properties.update(props)

            # Merge relationships (append unique)
            rels = payload.get("relationships", {})
            if isinstance(rels, dict):
                for rel_name, targets in rels.items():
                    if not isinstance(targets, list):
                        continue
                    current = snap.relationships.get(rel_name, [])
                    merged = list(dict.fromkeys(current + targets))
                    snap.relationships[rel_name] = merged

            snap.last_event_id = event.id
            snap.last_event_type = event.event_type
            snap.last_event_at = event.created_at

        return ReplayResult(
            tenant_id=tenant_id,
            as_of=as_of,
            events_replayed=len(events),
            entities_reconstructed=len(entities),
            entities=entities,
        )

    def entity_timeline(
        self,
        tenant_id: str,
        entity_id: str,
        *,
        limit: int = 200,
    ) -> List[EntityTimelineItem]:
        """Full chronological event history for one entity."""
        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .filter(DomainEventModel.canonical_entity_id == entity_id)
            .order_by(DomainEventModel.created_at.asc())
            .limit(limit)
            .all()
        )
        out: List[EntityTimelineItem] = []
        for e in events:
            try:
                payload = json.loads(e.payload_json or "{}")
            except Exception:
                payload = {}
            out.append(EntityTimelineItem(
                event_id=e.id,
                event_type=e.event_type,
                severity=e.severity,
                created_at=e.created_at,
                payload=payload,
            ))
        return out

    def diff(
        self,
        tenant_id: str,
        entity_id: str,
        *,
        from_time: datetime,
        to_time: datetime,
    ) -> Dict[str, Any]:
        """Return a dict of what CHANGED between two timestamps."""
        before = self.reconstruct_at(tenant_id, from_time, entity_id=entity_id)
        after = self.reconstruct_at(tenant_id, to_time, entity_id=entity_id)
        before_snap = before.entities.get(entity_id)
        after_snap = after.entities.get(entity_id)

        if before_snap is None and after_snap is None:
            return {"status": "entity_not_found"}
        if before_snap is None:
            return {
                "status": "created_in_window",
                "created_at": (after_snap.last_event_at.isoformat()
                               if after_snap and after_snap.last_event_at else None),
                "properties": after_snap.properties if after_snap else {},
            }
        if after_snap is None:
            return {"status": "deleted_in_window"}

        changed_props: Dict[str, Dict[str, Any]] = {}
        all_keys = set(before_snap.properties.keys()) | set(after_snap.properties.keys())
        for k in all_keys:
            b = before_snap.properties.get(k)
            a = after_snap.properties.get(k)
            if b != a:
                changed_props[k] = {"before": b, "after": a}

        return {
            "status": "modified",
            "from_time": from_time.isoformat(),
            "to_time": to_time.isoformat(),
            "changed_properties": changed_props,
            "change_count": len(changed_props),
        }
