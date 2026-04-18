"""
API Key Vault — issue, rotate, revoke, and verify API keys.

Every API key is:
  - 32-byte random, base58-encoded for URL safety
  - Stored as a SHA-256 hash (the plaintext is returned ONLY at creation)
  - Scoped to a tenant + a list of permissions
  - Rate-limit-aware (per-key quota)
  - Auditable (created_at / last_used_at / use_count)

Usage by the FastAPI auth dependency:

    key_vault = get_api_key_vault()
    record = key_vault.verify(plaintext_key)
    if record is None:
        raise HTTPException(401)
    if "ontology.read" not in record.permissions:
        raise HTTPException(403)

Zero dependencies — stdlib hashlib + secrets only.
"""

from __future__ import annotations

import hashlib
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional


BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _base58_encode(raw: bytes) -> str:
    """Minimal base58 encoder (no checksums)."""
    num = int.from_bytes(raw, "big")
    chars: List[str] = []
    while num > 0:
        num, rem = divmod(num, 58)
        chars.append(BASE58_ALPHABET[rem])
    for b in raw:
        if b == 0:
            chars.append(BASE58_ALPHABET[0])
        else:
            break
    return "".join(reversed(chars))


def _hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


@dataclass
class APIKeyRecord:
    key_id: str
    key_hash: str
    tenant_id: str
    name: str
    permissions: List[str]
    rate_limit_per_minute: int = 120
    created_at: datetime = field(default_factory=utc_now)
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    use_count: int = 0
    revoked: bool = False
    created_by: Optional[str] = None
    labels: List[str] = field(default_factory=list)


@dataclass
class APIKeyIssueResult:
    key_id: str
    plaintext_key: str  # Only returned once at creation
    record: APIKeyRecord


class APIKeyVault:
    def __init__(self) -> None:
        self._records: Dict[str, APIKeyRecord] = {}  # key_id -> record
        self._hash_to_key_id: Dict[str, str] = {}

    def issue(
        self,
        *,
        tenant_id: str,
        name: str,
        permissions: List[str],
        rate_limit_per_minute: int = 120,
        expires_in_days: Optional[int] = 365,
        created_by: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ) -> APIKeyIssueResult:
        # Generate 32 random bytes and base58-encode
        raw = secrets.token_bytes(32)
        encoded = _base58_encode(raw)
        plaintext = f"pk_{tenant_id[:10]}_{encoded[:40]}"
        key_hash = _hash_key(plaintext)
        key_id = f"key_{secrets.token_hex(8)}"
        expires_at = utc_now() + timedelta(days=expires_in_days) if expires_in_days else None
        record = APIKeyRecord(
            key_id=key_id,
            key_hash=key_hash,
            tenant_id=tenant_id,
            name=name,
            permissions=list(permissions),
            rate_limit_per_minute=rate_limit_per_minute,
            expires_at=expires_at,
            created_by=created_by,
            labels=list(labels or []),
        )
        self._records[key_id] = record
        self._hash_to_key_id[key_hash] = key_id
        return APIKeyIssueResult(
            key_id=key_id,
            plaintext_key=plaintext,
            record=record,
        )

    def verify(self, plaintext: str) -> Optional[APIKeyRecord]:
        key_hash = _hash_key(plaintext)
        key_id = self._hash_to_key_id.get(key_hash)
        if key_id is None:
            return None
        record = self._records.get(key_id)
        if record is None or record.revoked:
            return None
        if record.expires_at and utc_now() > record.expires_at:
            return None
        # Update usage (best-effort, not atomic)
        record.last_used_at = utc_now()
        record.use_count += 1
        return record

    def revoke(self, key_id: str) -> bool:
        record = self._records.get(key_id)
        if record is None:
            return False
        record.revoked = True
        return True

    def rotate(self, key_id: str) -> Optional[APIKeyIssueResult]:
        old = self._records.get(key_id)
        if old is None:
            return None
        # Issue a new key with the same permissions, then revoke the old one
        result = self.issue(
            tenant_id=old.tenant_id,
            name=old.name + " (rotated)",
            permissions=old.permissions,
            rate_limit_per_minute=old.rate_limit_per_minute,
            expires_in_days=365,
            created_by=old.created_by,
            labels=old.labels + ["rotated_from:" + old.key_id],
        )
        self.revoke(key_id)
        return result

    def list_for_tenant(self, tenant_id: str) -> List[APIKeyRecord]:
        return [r for r in self._records.values() if r.tenant_id == tenant_id]

    def get(self, key_id: str) -> Optional[APIKeyRecord]:
        return self._records.get(key_id)

    def stats(self) -> Dict[str, int]:
        return {
            "total": len(self._records),
            "active": sum(1 for r in self._records.values() if not r.revoked),
            "revoked": sum(1 for r in self._records.values() if r.revoked),
            "expired": sum(
                1 for r in self._records.values()
                if r.expires_at and utc_now() > r.expires_at
            ),
        }


_vault: Optional[APIKeyVault] = None


def get_api_key_vault() -> APIKeyVault:
    global _vault
    if _vault is None:
        _vault = APIKeyVault()
    return _vault
