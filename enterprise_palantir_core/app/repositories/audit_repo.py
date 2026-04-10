from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.models.audit import AuditLogEntry


class AuditRepository:
    def __init__(self, session: Session):
        self.s = session

    def _latest_chain(self, tenant_id: str) -> tuple[Optional[str], int]:
        stmt = (
            select(AuditLogEntry)
            .where(AuditLogEntry.tenant_id == tenant_id)
            .order_by(AuditLogEntry.sequence_number.desc())
            .limit(1)
        )
        last = self.s.scalars(stmt).first()
        if last is None:
            return None, 0
        return last.this_hash, last.sequence_number

    def append(
        self,
        *,
        tenant_id: str,
        actor: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        session_id: Optional[str] = None,
        granted: bool = True,
        deny_reason: Optional[str] = None,
    ) -> AuditLogEntry:
        prev_hash, prev_seq = self._latest_chain(tenant_id)
        seq = prev_seq + 1
        audit_id = new_id("aud")
        occurred_at = utc_now()
        body = {
            "audit_id": audit_id,
            "tenant_id": tenant_id,
            "actor": actor,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "payload": payload or {},
            "prev_hash": prev_hash,
            "sequence_number": seq,
            "granted": granted,
            "deny_reason": deny_reason,
            "occurred_at": occurred_at.isoformat(),
        }
        this_hash = hashlib.sha256(
            json.dumps(body, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        row = AuditLogEntry(
            audit_id=audit_id,
            tenant_id=tenant_id,
            sequence_number=seq,
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            granted=granted,
            deny_reason=deny_reason,
            prev_hash=prev_hash,
            this_hash=this_hash,
            occurred_at=occurred_at,
        )
        self.s.add(row)
        self.s.flush()
        return row

    def recent(self, tenant_id: str, limit: int = 100) -> List[AuditLogEntry]:
        stmt = (
            select(AuditLogEntry)
            .where(AuditLogEntry.tenant_id == tenant_id)
            .order_by(AuditLogEntry.sequence_number.desc())
            .limit(limit)
        )
        return list(self.s.scalars(stmt))

    def verify_chain(self, tenant_id: str) -> tuple[bool, Optional[str]]:
        stmt = (
            select(AuditLogEntry)
            .where(AuditLogEntry.tenant_id == tenant_id)
            .order_by(AuditLogEntry.sequence_number.asc())
        )
        entries = list(self.s.scalars(stmt))
        prev_hash: Optional[str] = None
        for e in entries:
            if e.prev_hash != prev_hash:
                return False, f"prev_hash mismatch at seq {e.sequence_number}"
            body = {
                "audit_id": e.audit_id,
                "tenant_id": e.tenant_id,
                "actor": e.actor,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "payload": e.payload or {},
                "prev_hash": e.prev_hash,
                "sequence_number": e.sequence_number,
                "granted": e.granted,
                "deny_reason": e.deny_reason,
                "occurred_at": e.occurred_at.isoformat(),
            }
            expected = hashlib.sha256(
                json.dumps(body, sort_keys=True, default=str).encode("utf-8")
            ).hexdigest()
            if expected != e.this_hash:
                return False, f"hash mismatch at seq {e.sequence_number}"
            prev_hash = e.this_hash
        return True, None
