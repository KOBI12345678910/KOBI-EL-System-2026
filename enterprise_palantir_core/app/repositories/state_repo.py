from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.time_utils import utc_now
from app.models.state import EntityStateRow


class StateRepository:
    def __init__(self, session: Session):
        self.s = session

    def get(self, canonical_entity_id: str) -> Optional[EntityStateRow]:
        return self.s.get(EntityStateRow, canonical_entity_id)

    def upsert(
        self,
        *,
        canonical_entity_id: str,
        tenant_id: str,
        entity_type: str,
        current_status: Optional[str] = None,
        risk_score: Optional[float] = None,
        freshness_status: Optional[str] = None,
        blockers: Optional[List[str]] = None,
        dependencies: Optional[List[str]] = None,
        alerts: Optional[List[str]] = None,
        workflow_step: Optional[str] = None,
        owner: Optional[str] = None,
        sla_status: Optional[str] = None,
        financial_exposure: Optional[float] = None,
        properties: Optional[Dict[str, Any]] = None,
        last_event_at: Optional[datetime] = None,
    ) -> EntityStateRow:
        row = self.s.get(EntityStateRow, canonical_entity_id)
        if row is None:
            row = EntityStateRow(
                canonical_entity_id=canonical_entity_id,
                tenant_id=tenant_id,
                entity_type=entity_type,
                current_status=current_status or "active",
                risk_score=risk_score or 0.0,
                freshness_status=freshness_status or "fresh",
                blockers=blockers or [],
                dependencies=dependencies or [],
                alerts=alerts or [],
                workflow_step=workflow_step,
                owner=owner,
                sla_status=sla_status,
                financial_exposure=financial_exposure,
                properties=properties or {},
                last_event_at=last_event_at,
            )
            self.s.add(row)
        else:
            if current_status is not None:
                row.current_status = current_status
            if risk_score is not None:
                row.risk_score = risk_score
            if freshness_status is not None:
                row.freshness_status = freshness_status
            if blockers is not None:
                row.blockers = blockers
            if dependencies is not None:
                row.dependencies = dependencies
            if alerts is not None:
                row.alerts = alerts
            if workflow_step is not None:
                row.workflow_step = workflow_step
            if owner is not None:
                row.owner = owner
            if sla_status is not None:
                row.sla_status = sla_status
            if financial_exposure is not None:
                row.financial_exposure = financial_exposure
            if properties is not None:
                merged = dict(row.properties or {})
                merged.update(properties)
                row.properties = merged
            if last_event_at is not None:
                row.last_event_at = last_event_at
            row.updated_at = utc_now()
        self.s.flush()
        return row

    def list_by_tenant(self, tenant_id: str) -> List[EntityStateRow]:
        return list(self.s.scalars(select(EntityStateRow).where(EntityStateRow.tenant_id == tenant_id)))

    def at_risk(self, tenant_id: str, threshold: float = 0.6) -> List[EntityStateRow]:
        stmt = (
            select(EntityStateRow)
            .where(EntityStateRow.tenant_id == tenant_id)
            .where(EntityStateRow.risk_score >= threshold)
            .order_by(EntityStateRow.risk_score.desc())
        )
        return list(self.s.scalars(stmt))

    def by_status(self, tenant_id: str, status: str) -> List[EntityStateRow]:
        stmt = (
            select(EntityStateRow)
            .where(and_(EntityStateRow.tenant_id == tenant_id, EntityStateRow.current_status == status))
        )
        return list(self.s.scalars(stmt))
