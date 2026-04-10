"""
Security API — API key vault, rate limiter, request tracer,
encryption vault, backup engine, template engine.

These are Phase 8 endpoints for platform security, observability,
and disaster recovery.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.api_key_vault import get_api_key_vault
from app.engines.backup_engine import BackupEngine
from app.engines.encryption_vault import get_encryption_vault
from app.engines.rate_limiter import get_sliding_window, get_token_bucket
from app.engines.request_tracer import get_tracer
from app.engines.template_engine import get_template_engine

router = APIRouter(prefix="/security", tags=["security"])


# ════════════════════════════════════════════════════════════════
# API KEY VAULT
# ════════════════════════════════════════════════════════════════

class APIKeyIssueIn(BaseModel):
    tenant_id: str
    name: str
    permissions: List[str]
    rate_limit_per_minute: int = 120
    expires_in_days: Optional[int] = 365
    created_by: Optional[str] = None


@router.post("/keys/issue")
def issue_api_key(body: APIKeyIssueIn) -> Dict[str, Any]:
    vault = get_api_key_vault()
    result = vault.issue(
        tenant_id=body.tenant_id,
        name=body.name,
        permissions=body.permissions,
        rate_limit_per_minute=body.rate_limit_per_minute,
        expires_in_days=body.expires_in_days,
        created_by=body.created_by,
    )
    return {
        "key_id": result.key_id,
        "plaintext_key": result.plaintext_key,  # Only returned ONCE
        "tenant_id": result.record.tenant_id,
        "name": result.record.name,
        "permissions": result.record.permissions,
        "expires_at": result.record.expires_at.isoformat() if result.record.expires_at else None,
        "warning": "Store plaintext_key securely — it cannot be retrieved later",
    }


@router.post("/keys/verify")
def verify_api_key(body: Dict[str, str] = Body(...)) -> Dict[str, Any]:
    key = body.get("key", "")
    vault = get_api_key_vault()
    record = vault.verify(key)
    if record is None:
        raise HTTPException(status_code=401, detail="invalid or expired key")
    return {
        "valid": True,
        "key_id": record.key_id,
        "tenant_id": record.tenant_id,
        "name": record.name,
        "permissions": record.permissions,
        "last_used_at": record.last_used_at.isoformat() if record.last_used_at else None,
        "use_count": record.use_count,
    }


@router.post("/keys/{key_id}/revoke")
def revoke_api_key(key_id: str) -> Dict[str, Any]:
    vault = get_api_key_vault()
    ok = vault.revoke(key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="key not found")
    return {"ok": True, "key_id": key_id, "status": "revoked"}


@router.post("/keys/{key_id}/rotate")
def rotate_api_key(key_id: str) -> Dict[str, Any]:
    vault = get_api_key_vault()
    result = vault.rotate(key_id)
    if result is None:
        raise HTTPException(status_code=404, detail="key not found")
    return {
        "new_key_id": result.key_id,
        "plaintext_key": result.plaintext_key,
        "rotated_from": key_id,
    }


@router.get("/keys")
def list_api_keys(tenant_id: str) -> List[Dict[str, Any]]:
    vault = get_api_key_vault()
    return [
        {
            "key_id": r.key_id,
            "name": r.name,
            "tenant_id": r.tenant_id,
            "permissions": r.permissions,
            "rate_limit_per_minute": r.rate_limit_per_minute,
            "created_at": r.created_at.isoformat(),
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
            "use_count": r.use_count,
            "revoked": r.revoked,
        }
        for r in vault.list_for_tenant(tenant_id)
    ]


@router.get("/keys/stats")
def api_keys_stats() -> Dict[str, int]:
    return get_api_key_vault().stats()


# ════════════════════════════════════════════════════════════════
# RATE LIMITER
# ════════════════════════════════════════════════════════════════

@router.post("/rate-limit/check")
def rate_limit_check(
    caller_id: str,
    algorithm: str = "token_bucket",
    limit: int = 60,
    window_seconds: int = 60,
) -> Dict[str, Any]:
    if algorithm == "sliding_window":
        limiter = get_sliding_window()
        decision = limiter.check(caller_id, limit=limit, window_seconds=window_seconds)
    else:
        limiter = get_token_bucket()
        decision = limiter.consume(
            caller_id,
            capacity=limit,
            refill_rate_per_sec=limit / max(1, window_seconds),
        )
    return asdict(decision)


# ════════════════════════════════════════════════════════════════
# REQUEST TRACER
# ════════════════════════════════════════════════════════════════

@router.get("/traces")
def list_traces(limit: int = 50) -> List[Dict[str, Any]]:
    tracer = get_tracer()
    return [
        {
            "trace_id": t.trace_id,
            "root_operation": t.root_operation,
            "started_at": t.started_at.isoformat(),
            "finished_at": t.finished_at.isoformat() if t.finished_at else None,
            "total_duration_ms": t.total_duration_ms,
            "span_count": t.span_count,
            "attributes": t.attributes,
        }
        for t in tracer.recent(limit=limit)
    ]


@router.get("/traces/{trace_id}")
def get_trace(trace_id: str) -> Dict[str, Any]:
    tracer = get_tracer()
    trace = tracer.get(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return {
        "trace_id": trace.trace_id,
        "root_operation": trace.root_operation,
        "started_at": trace.started_at.isoformat(),
        "finished_at": trace.finished_at.isoformat() if trace.finished_at else None,
        "total_duration_ms": trace.total_duration_ms,
        "span_count": trace.span_count,
        "attributes": trace.attributes,
        "spans": [
            {
                "span_id": s.span_id,
                "parent_span_id": s.parent_span_id,
                "operation": s.operation,
                "duration_ms": s.duration_ms,
                "status": s.status,
                "error_message": s.error_message,
                "attributes": s.attributes,
            }
            for s in trace.spans
        ],
    }


@router.get("/traces/slowest")
def slowest_traces(limit: int = 10) -> List[Dict[str, Any]]:
    tracer = get_tracer()
    return [
        {
            "trace_id": t.trace_id,
            "root_operation": t.root_operation,
            "total_duration_ms": t.total_duration_ms,
            "span_count": t.span_count,
        }
        for t in tracer.slowest(limit=limit)
    ]


@router.get("/traces-stats")
def traces_stats() -> Dict[str, Any]:
    return get_tracer().stats()


# ════════════════════════════════════════════════════════════════
# ENCRYPTION VAULT
# ════════════════════════════════════════════════════════════════

@router.post("/encrypt")
def encrypt_value(body: Dict[str, str] = Body(...)) -> Dict[str, Any]:
    vault = get_encryption_vault()
    plaintext = body.get("plaintext", "")
    encrypted = vault.encrypt(plaintext)
    return {
        "ciphertext": encrypted.ciphertext,
        "algorithm": encrypted.algorithm,
        "key_version": encrypted.key_version,
        "iv": encrypted.iv,
        "encrypted_at": encrypted.encrypted_at.isoformat(),
    }


@router.post("/decrypt")
def decrypt_value(body: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    vault = get_encryption_vault()
    from app.engines.encryption_vault import EncryptedValue
    try:
        ev = EncryptedValue(
            ciphertext=body["ciphertext"],
            algorithm=body["algorithm"],
            key_version=body["key_version"],
            iv=body["iv"],
        )
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"missing field: {exc}")
    result = vault.decrypt(ev)
    if result is None:
        raise HTTPException(status_code=422, detail="decryption failed")
    return {"plaintext": result}


@router.post("/hash-deterministic")
def hash_deterministic(body: Dict[str, str] = Body(...)) -> Dict[str, Any]:
    vault = get_encryption_vault()
    return {"hash": vault.deterministic_hash(body.get("plaintext", ""))}


@router.get("/vault-stats")
def vault_stats() -> Dict[str, Any]:
    stats = get_encryption_vault().stats()
    return {
        "encrypt_count": stats.encrypt_count,
        "decrypt_count": stats.decrypt_count,
        "key_version": stats.key_version,
        "algorithm": stats.algorithm,
    }


# ════════════════════════════════════════════════════════════════
# BACKUP ENGINE
# ════════════════════════════════════════════════════════════════

@router.post("/backup/{tenant_id}")
def create_backup(
    tenant_id: str,
    compressed: bool = True,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = BackupEngine(db)
    meta = engine.create_backup(tenant_id, compressed=compressed)
    return asdict(meta)


@router.get("/backups")
def list_backups(tenant_id: Optional[str] = None, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    engine = BackupEngine(db)
    return engine.list_backups(tenant_id)


@router.post("/backup/retention/{tenant_id}")
def apply_retention(
    tenant_id: str,
    keep: int = 7,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = BackupEngine(db)
    return engine.apply_retention(tenant_id, keep=keep)


# ════════════════════════════════════════════════════════════════
# TEMPLATE ENGINE
# ════════════════════════════════════════════════════════════════

@router.get("/templates")
def list_templates() -> List[str]:
    return get_template_engine().list_templates()


class RenderTemplateIn(BaseModel):
    template_id: str
    context: Dict[str, Any]


@router.post("/templates/render")
def render_template(body: RenderTemplateIn) -> Dict[str, Any]:
    engine = get_template_engine()
    try:
        result = engine.render(body.template_id, body.context)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {
        "template_id": result.template_id,
        "rendered": result.rendered,
        "variables_used": result.variables_used,
        "rendered_at": result.rendered_at.isoformat(),
    }


class InlineRenderIn(BaseModel):
    template: str
    context: Dict[str, Any]


@router.post("/templates/render-inline")
def render_inline(body: InlineRenderIn) -> Dict[str, str]:
    engine = get_template_engine()
    return {"rendered": engine.render_inline(body.template, body.context)}
