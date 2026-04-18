import json

from sqlalchemy.orm import Session

from app.repositories.state_repo import StateRepository


class StateService:
    def __init__(self, db: Session) -> None:
        self.repo = StateRepository(db)

    def apply_domain_event(
        self,
        *,
        tenant_id: str,
        canonical_entity_id: str,
        entity_type: str,
        event_type: str,
        payload: dict,
    ):
        current = self.repo.get(canonical_entity_id)

        current_status = "active"
        workflow_step = None
        owner = None
        risk_score = 0.0
        freshness_status = "fresh"
        blockers = []
        alerts = []
        state = {}

        if current:
            current_status = current.current_status
            workflow_step = current.workflow_step
            owner = current.owner
            risk_score = current.risk_score
            freshness_status = current.freshness_status
            blockers = json.loads(current.blockers_json or "[]")
            alerts = json.loads(current.alerts_json or "[]")
            state = json.loads(current.state_json or "{}")

        if event_type == "supplier_delayed":
            current_status = "at_risk"
            risk_score = max(risk_score, 0.85)
            if "supplier_delay" not in blockers:
                blockers.append("supplier_delay")

        elif event_type == "inventory_low":
            current_status = "at_risk"
            risk_score = max(risk_score, 0.75)
            if "inventory_shortage" not in blockers:
                blockers.append("inventory_shortage")

        elif event_type == "workflow_stalled":
            current_status = "blocked"
            risk_score = max(risk_score, 0.70)
            if "workflow_stalled" not in blockers:
                blockers.append("workflow_stalled")

        elif event_type == "project_at_risk":
            current_status = "at_risk"
            risk_score = max(risk_score, 0.90)

        elif event_type == "status_changed":
            new_status = payload.get("status")
            if new_status:
                current_status = str(new_status)

        state["last_payload"] = payload

        return self.repo.upsert_state(
            canonical_entity_id=canonical_entity_id,
            tenant_id=tenant_id,
            entity_type=entity_type,
            current_status=current_status,
            workflow_step=workflow_step,
            owner=owner,
            risk_score=risk_score,
            freshness_status=freshness_status,
            blockers=blockers,
            alerts=alerts,
            state=state,
        )
