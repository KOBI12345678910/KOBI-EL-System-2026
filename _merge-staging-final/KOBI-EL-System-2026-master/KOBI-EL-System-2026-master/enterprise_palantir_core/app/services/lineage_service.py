from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.repositories.audit_repo import AuditRepository


class LineageService:
    """
    Thin wrapper over the AuditRepository that records every lineage step
    as an audit log entry. Every transform, every hydration, every write —
    everything flows through here so the platform has full provenance.
    """

    def __init__(self, db: Session) -> None:
        self.audit_repo = AuditRepository(db)

    def record(
        self,
        *,
        tenant_id: str,
        actor_id: str,
        action_name: str,
        target_entity_id: str | None,
        details: dict,
    ):
        return self.audit_repo.log(
            log_id=new_id("lin"),
            tenant_id=tenant_id,
            actor_id=actor_id,
            action_name=action_name,
            target_entity_id=target_entity_id,
            details=details,
        )
