"""
Immutable, hash-chained audit log.

Every privileged action (read, write, execute, approve, delete) is
recorded here with a SHA-256 hash that includes the hash of the
previous entry. This makes tampering detectable: if anyone modifies
any past entry, the chain verification will fail on the next rebuild.

This is the compliance-grade audit layer — used for regulatory reviews,
forensic investigations, and trust verification.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


@dataclass
class AuditEntry:
    audit_id: str
    tenant_id: str
    actor: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    payload: Dict[str, Any]
    prev_hash: Optional[str]
    this_hash: str
    sequence_number: int
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None
    granted: bool = True
    deny_reason: Optional[str] = None
    occurred_at: datetime = field(default_factory=utc_now)


class AuditLogService:
    def __init__(self) -> None:
        self._entries: List[AuditEntry] = []
        # Per-tenant chain: tenant_id → (last_hash, sequence_counter)
        self._chains: Dict[str, tuple[Optional[str], int]] = {}

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
    ) -> AuditEntry:
        prev_hash, seq = self._chains.get(tenant_id, (None, 0))
        audit_id = new_id("aud")
        seq += 1
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

        entry = AuditEntry(
            audit_id=audit_id,
            tenant_id=tenant_id,
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
            prev_hash=prev_hash,
            this_hash=this_hash,
            sequence_number=seq,
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            granted=granted,
            deny_reason=deny_reason,
            occurred_at=occurred_at,
        )
        self._entries.append(entry)
        self._chains[tenant_id] = (this_hash, seq)
        return entry

    def verify_chain(self, tenant_id: str) -> tuple[bool, Optional[str]]:
        """
        Rebuild the chain and verify every hash.
        Returns (ok, error_message).
        """
        tenant_entries = [e for e in self._entries if e.tenant_id == tenant_id]
        tenant_entries.sort(key=lambda e: e.sequence_number)
        prev_hash: Optional[str] = None
        for e in tenant_entries:
            if e.prev_hash != prev_hash:
                return False, f"prev_hash mismatch at seq {e.sequence_number}"
            body = {
                "audit_id": e.audit_id,
                "tenant_id": e.tenant_id,
                "actor": e.actor,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "payload": e.payload,
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

    def search(
        self,
        *,
        tenant_id: Optional[str] = None,
        actor: Optional[str] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        granted: Optional[bool] = None,
        limit: int = 100,
    ) -> List[AuditEntry]:
        results: List[AuditEntry] = []
        for e in reversed(self._entries):
            if tenant_id and e.tenant_id != tenant_id:
                continue
            if actor and e.actor != actor:
                continue
            if action and e.action != action:
                continue
            if resource_type and e.resource_type != resource_type:
                continue
            if resource_id and e.resource_id != resource_id:
                continue
            if granted is not None and e.granted != granted:
                continue
            results.append(e)
            if len(results) >= limit:
                break
        return results

    def recent(self, tenant_id: str, limit: int = 50) -> List[AuditEntry]:
        return self.search(tenant_id=tenant_id, limit=limit)

    def size(self, tenant_id: Optional[str] = None) -> int:
        if tenant_id is None:
            return len(self._entries)
        return sum(1 for e in self._entries if e.tenant_id == tenant_id)


_global_audit = AuditLogService()


def get_audit_log() -> AuditLogService:
    return _global_audit
