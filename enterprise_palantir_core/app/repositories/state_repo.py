import json
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.state import EntityStateModel


class StateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, canonical_entity_id: str) -> Optional[EntityStateModel]:
        return (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.canonical_entity_id == canonical_entity_id)
            .first()
        )

    def list_by_tenant(self, tenant_id: str) -> List[EntityStateModel]:
        return self.db.query(EntityStateModel).filter(EntityStateModel.tenant_id == tenant_id).all()

    def upsert_state(
        self,
        *,
        canonical_entity_id: str,
        tenant_id: str,
        entity_type: str,
        current_status: str,
        workflow_step: str | None,
        owner: str | None,
        risk_score: float,
        freshness_status: str,
        blockers: list,
        alerts: list,
        state: dict,
    ) -> EntityStateModel:
        existing = self.get(canonical_entity_id)

        if existing is None:
            existing = EntityStateModel(
                canonical_entity_id=canonical_entity_id,
                tenant_id=tenant_id,
                entity_type=entity_type,
                current_status=current_status,
                workflow_step=workflow_step,
                owner=owner,
                risk_score=risk_score,
                freshness_status=freshness_status,
                blockers_json=json.dumps(blockers, ensure_ascii=False),
                alerts_json=json.dumps(alerts, ensure_ascii=False),
                state_json=json.dumps(state, ensure_ascii=False),
            )
            self.db.add(existing)
        else:
            existing.current_status = current_status
            existing.workflow_step = workflow_step
            existing.owner = owner
            existing.risk_score = risk_score
            existing.freshness_status = freshness_status
            existing.blockers_json = json.dumps(blockers, ensure_ascii=False)
            existing.alerts_json = json.dumps(alerts, ensure_ascii=False)
            existing.state_json = json.dumps(state, ensure_ascii=False)

        self.db.commit()
        self.db.refresh(existing)
        return existing
