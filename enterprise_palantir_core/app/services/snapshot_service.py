"""
Snapshot Service — builds the unified live company picture.

This is what the Command Center API returns for GET /live/snapshot/{tenant}.
It aggregates every layer the platform tracks into a single response that
a UI can render without making 15 additional calls.
"""

from __future__ import annotations

from typing import Dict

from sqlalchemy.orm import Session

from app.config import settings
from app.core.enums import EntityStatus, FreshnessStatus
from app.core.time_utils import utc_now
from app.repositories.alert_repo import AlertRepository
from app.repositories.event_repo import EventRepository
from app.repositories.ontology_repo import OntologyRepository
from app.repositories.state_repo import StateRepository
from app.repositories.workflow_repo import WorkflowRepository
from app.schemas.events import DomainEventRead
from app.schemas.snapshot import CompanySnapshot


class SnapshotService:
    def __init__(self, session: Session):
        self.s = session
        self.ontology = OntologyRepository(session)
        self.state = StateRepository(session)
        self.events = EventRepository(session)
        self.alerts = AlertRepository(session)
        self.workflows = WorkflowRepository(session)

    def build(self, tenant_id: str) -> CompanySnapshot:
        objects = self.ontology.list_by_tenant(tenant_id)
        states = self.state.list_by_tenant(tenant_id)
        recent = self.events.recent_for_tenant(
            tenant_id, limit=settings.realtime_snapshot_event_limit
        )
        open_alerts = self.alerts.open_alerts(tenant_id)
        critical_alerts = self.alerts.critical_open(tenant_id)
        running_workflows = self.workflows.list_by_status(tenant_id, "running")
        waiting_workflows = self.workflows.list_by_status(tenant_id, "waiting_approval")

        object_breakdown: Dict[str, int] = {}
        for o in objects:
            object_breakdown[o.object_type] = object_breakdown.get(o.object_type, 0) + 1

        status_breakdown: Dict[str, int] = {}
        for s in states:
            status_breakdown[s.current_status] = status_breakdown.get(s.current_status, 0) + 1

        severity_breakdown: Dict[str, int] = {}
        for e in recent:
            severity_breakdown[e.severity] = severity_breakdown.get(e.severity, 0) + 1

        critical_events = [e for e in recent if e.severity in ("critical", "high")][:20]

        # Detect stalled workflows (past SLA)
        now = utc_now()
        stalled = [
            w for w in running_workflows if w.sla_deadline is not None and w.sla_deadline < now
        ]

        return CompanySnapshot(
            generated_at=now,
            tenant_id=tenant_id,
            total_objects=len(objects),
            total_live_states=len(states),
            at_risk_entities=sum(1 for s in states if s.current_status == EntityStatus.AT_RISK.value),
            blocked_entities=sum(1 for s in states if s.current_status == EntityStatus.BLOCKED.value),
            fresh_entities=sum(1 for s in states if s.freshness_status == FreshnessStatus.FRESH.value),
            stale_entities=sum(1 for s in states if s.freshness_status == FreshnessStatus.STALE.value),
            object_breakdown=object_breakdown,
            status_breakdown=status_breakdown,
            severity_breakdown=severity_breakdown,
            recent_events_count=len(recent),
            critical_events_count=len(critical_events),
            open_alerts_count=len(open_alerts),
            critical_alerts_count=len(critical_alerts),
            active_workflows=len(running_workflows),
            waiting_approval_workflows=len(waiting_workflows),
            stalled_workflows=len(stalled),
            recent_events=[DomainEventRead.model_validate(e) for e in recent[:50]],
            critical_events=[DomainEventRead.model_validate(e) for e in critical_events],
        )
