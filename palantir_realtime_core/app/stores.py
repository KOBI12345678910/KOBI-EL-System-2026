from __future__ import annotations

from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional

from app.config import settings
from app.models import DomainEvent, EntityState, LineageRecord, OntologyObject


class OntologyStore:
    def __init__(self) -> None:
        self.objects: Dict[str, OntologyObject] = {}

    def upsert(self, obj: OntologyObject) -> OntologyObject:
        self.objects[obj.object_id] = obj
        return obj

    def get(self, object_id: str) -> Optional[OntologyObject]:
        return self.objects.get(object_id)

    def list_by_tenant(self, tenant_id: str) -> List[OntologyObject]:
        return [o for o in self.objects.values() if o.tenant_id == tenant_id]


class StateStore:
    def __init__(self) -> None:
        self.states: Dict[str, EntityState] = {}

    def upsert(self, state: EntityState) -> EntityState:
        self.states[state.canonical_entity_id] = state
        return state

    def get(self, canonical_entity_id: str) -> Optional[EntityState]:
        return self.states.get(canonical_entity_id)

    def list_by_tenant(self, tenant_id: str) -> List[EntityState]:
        return [s for s in self.states.values() if s.tenant_id == tenant_id]


class EventStore:
    def __init__(self) -> None:
        self.events: Dict[str, DomainEvent] = {}
        self.by_entity: Dict[str, Deque[str]] = defaultdict(
            lambda: deque(maxlen=settings.max_recent_events_per_entity)
        )
        self.by_tenant: Dict[str, Deque[str]] = defaultdict(
            lambda: deque(maxlen=settings.max_recent_global_events)
        )

    def append(self, event: DomainEvent) -> DomainEvent:
        self.events[event.event_id] = event
        self.by_entity[event.canonical_entity_id].appendleft(event.event_id)
        self.by_tenant[event.tenant_id].appendleft(event.event_id)
        return event

    def recent_for_entity(self, canonical_entity_id: str, limit: int = 20) -> List[DomainEvent]:
        ids = list(self.by_entity.get(canonical_entity_id, []))[:limit]
        return [self.events[i] for i in ids if i in self.events]

    def recent_for_tenant(self, tenant_id: str, limit: int = 50) -> List[DomainEvent]:
        ids = list(self.by_tenant.get(tenant_id, []))[:limit]
        return [self.events[i] for i in ids if i in self.events]


class LineageStore:
    def __init__(self) -> None:
        self.records: List[LineageRecord] = []

    def append(self, record: LineageRecord) -> LineageRecord:
        self.records.append(record)
        return record

    def list_for_entity(self, canonical_entity_id: str) -> List[LineageRecord]:
        return [r for r in self.records if r.canonical_entity_id == canonical_entity_id]


ontology_store = OntologyStore()
state_store = StateStore()
event_store = EventStore()
lineage_store = LineageStore()
