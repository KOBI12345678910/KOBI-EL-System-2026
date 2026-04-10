from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from app.schemas.events import DomainEventRead, LineageRead
from app.schemas.ontology import OntologyObjectRead
from app.schemas.state import EntityStateRead


class CompanySnapshot(BaseModel):
    """
    The unified live company picture. Returned by the Command Center API.

    Combines every layer the platform tracks:
      - ontology  → objects by type + counts
      - state     → per-status counts, at-risk, blocked, fresh/stale
      - events    → recent volume + critical tail
      - alerts    → open + critical
      - workflows → active + waiting approval + stalled
      - pipelines → pipeline health snapshot
    """

    generated_at: datetime
    tenant_id: str

    total_objects: int = 0
    total_live_states: int = 0
    at_risk_entities: int = 0
    blocked_entities: int = 0
    fresh_entities: int = 0
    stale_entities: int = 0

    object_breakdown: Dict[str, int] = Field(default_factory=dict)
    status_breakdown: Dict[str, int] = Field(default_factory=dict)
    severity_breakdown: Dict[str, int] = Field(default_factory=dict)

    recent_events_count: int = 0
    critical_events_count: int = 0
    open_alerts_count: int = 0
    critical_alerts_count: int = 0

    active_workflows: int = 0
    waiting_approval_workflows: int = 0
    stalled_workflows: int = 0

    recent_events: List[DomainEventRead] = Field(default_factory=list)
    critical_events: List[DomainEventRead] = Field(default_factory=list)


class EntityTimeline(BaseModel):
    entity: OntologyObjectRead
    state: EntityStateRead | None = None
    events: List[DomainEventRead] = Field(default_factory=list)
    lineage: List[LineageRead] = Field(default_factory=list)


class AIContextResponse(BaseModel):
    entity: OntologyObjectRead | None = None
    state: EntityStateRead | None = None
    recent_events: List[DomainEventRead] = Field(default_factory=list)
    related_entities: List[OntologyObjectRead] = Field(default_factory=list)
    generated_at: datetime
    token_estimate: int
