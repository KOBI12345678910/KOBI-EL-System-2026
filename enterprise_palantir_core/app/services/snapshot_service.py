from sqlalchemy.orm import Session

from app.config import settings
from app.core.time_utils import utc_now
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository


class SnapshotService:
    def __init__(self, db: Session) -> None:
        self.ontology_repo = OntologyRepository(db)
        self.state_repo = StateRepository(db)
        self.event_repo = EventRepository(db)

    def build_tenant_snapshot(self, tenant_id: str) -> dict:
        objects = self.ontology_repo.list_by_tenant(tenant_id)
        states = self.state_repo.list_by_tenant(tenant_id)
        events = self.event_repo.list_recent_for_tenant(
            tenant_id=tenant_id,
            limit=settings.realtime_snapshot_event_limit,
        )

        object_breakdown = {}
        for obj in objects:
            object_breakdown[obj.object_type] = object_breakdown.get(obj.object_type, 0) + 1

        return {
            "generated_at": utc_now(),
            "tenant_id": tenant_id,
            "total_objects": len(objects),
            "total_states": len(states),
            "at_risk_entities": sum(1 for s in states if s.current_status == "at_risk"),
            "blocked_entities": sum(1 for s in states if s.current_status == "blocked"),
            "object_breakdown": object_breakdown,
            "recent_events_count": len(events),
        }
