import json

from sqlalchemy.orm import Session

from app.models.audit import AuditLogModel


class AuditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        *,
        log_id: str,
        tenant_id: str,
        actor_id: str,
        action_name: str,
        target_entity_id: str | None,
        details: dict,
    ) -> AuditLogModel:
        row = AuditLogModel(
            id=log_id,
            tenant_id=tenant_id,
            actor_id=actor_id,
            action_name=action_name,
            target_entity_id=target_entity_id,
            details_json=json.dumps(details, ensure_ascii=False),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row
