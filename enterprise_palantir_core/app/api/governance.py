"""
Governance API — feature flags, user directory, query DSL, data catalog.

Phase 9 endpoints for platform governance and discovery.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.data_catalog import DataCatalog
from app.engines.feature_flags import (
    EvaluationContext,
    FeatureFlag,
    FlagType,
    get_feature_flags,
)
from app.engines.query_dsl import QueryDSL
from app.engines.user_directory import get_user_directory

router = APIRouter(prefix="/governance", tags=["governance"])


# ════════════════════════════════════════════════════════════════
# FEATURE FLAGS
# ════════════════════════════════════════════════════════════════

@router.get("/flags")
def list_flags() -> List[Dict[str, Any]]:
    engine = get_feature_flags()
    return [
        {
            "flag_key": f.flag_key,
            "description": f.description,
            "flag_type": f.flag_type.value,
            "enabled": f.enabled,
            "default_value": f.default_value,
            "rollout_percentage": f.rollout_percentage,
            "target_tenants": f.target_tenants,
            "target_roles": f.target_roles,
            "variants": f.variants,
            "updated_at": f.updated_at.isoformat(),
        }
        for f in engine.all()
    ]


class EvaluationContextIn(BaseModel):
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    roles: List[str] = []
    attributes: Dict[str, Any] = {}


class FlagEvaluateIn(EvaluationContextIn):
    flag_key: str


@router.post("/flags/evaluate")
def evaluate_flag(body: FlagEvaluateIn) -> Dict[str, Any]:
    engine = get_feature_flags()
    ctx = EvaluationContext(
        user_id=body.user_id,
        tenant_id=body.tenant_id,
        roles=body.roles,
        attributes=body.attributes,
    )
    result = engine.evaluate(body.flag_key, ctx)
    return {
        "flag_key": result.flag_key,
        "value": result.value,
        "reason": result.reason,
        "variant": result.variant,
    }


@router.post("/flags/evaluate-all")
def evaluate_all_flags(body: EvaluationContextIn) -> Dict[str, Any]:
    engine = get_feature_flags()
    ctx = EvaluationContext(
        user_id=body.user_id,
        tenant_id=body.tenant_id,
        roles=body.roles,
        attributes=body.attributes,
    )
    return engine.evaluate_all(ctx)


class FlagUpdateIn(BaseModel):
    enabled: Optional[bool] = None
    rollout_percentage: Optional[int] = None
    target_tenants: Optional[List[str]] = None


@router.patch("/flags/{flag_key}")
def update_flag(flag_key: str, body: FlagUpdateIn) -> Dict[str, Any]:
    engine = get_feature_flags()
    flag = engine.update(
        flag_key,
        enabled=body.enabled,
        rollout_percentage=body.rollout_percentage,
        target_tenants=body.target_tenants,
    )
    if flag is None:
        raise HTTPException(status_code=404, detail="flag not found")
    return {
        "flag_key": flag.flag_key,
        "enabled": flag.enabled,
        "rollout_percentage": flag.rollout_percentage,
        "target_tenants": flag.target_tenants,
    }


# ════════════════════════════════════════════════════════════════
# USER DIRECTORY
# ════════════════════════════════════════════════════════════════

@router.get("/users")
def list_users(tenant_id: str) -> List[Dict[str, Any]]:
    directory = get_user_directory()
    return [
        {
            "user_id": u.user_id,
            "email": u.email,
            "display_name": u.display_name,
            "tenant_id": u.tenant_id,
            "role_ids": u.role_ids,
            "group_ids": u.group_ids,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "effective_permissions": directory.effective_permissions(u.user_id),
        }
        for u in directory.list_for_tenant(tenant_id)
    ]


class UserCreateIn(BaseModel):
    email: str
    display_name: str
    tenant_id: str
    role_ids: List[str] = []


@router.post("/users")
def create_user(body: UserCreateIn) -> Dict[str, Any]:
    directory = get_user_directory()
    user = directory.create_user(
        email=body.email,
        display_name=body.display_name,
        tenant_id=body.tenant_id,
        role_ids=body.role_ids,
    )
    return {
        "user_id": user.user_id,
        "email": user.email,
        "display_name": user.display_name,
        "tenant_id": user.tenant_id,
        "role_ids": user.role_ids,
        "effective_permissions": directory.effective_permissions(user.user_id),
    }


@router.get("/roles")
def list_roles() -> List[Dict[str, Any]]:
    directory = get_user_directory()
    return [
        {
            "role_id": r.role_id,
            "name": r.name,
            "description": r.description,
            "permissions": r.permissions,
        }
        for r in directory.all_roles()
    ]


@router.get("/groups")
def list_groups(tenant_id: str) -> List[Dict[str, Any]]:
    directory = get_user_directory()
    return [
        {
            "group_id": g.group_id,
            "name": g.name,
            "description": g.description,
            "tenant_id": g.tenant_id,
            "member_count": len(g.member_ids),
            "role_ids": g.role_ids,
        }
        for g in directory.list_groups(tenant_id)
    ]


class SessionCreateIn(BaseModel):
    user_id: str
    ttl_hours: int = 8
    sso_provider: Optional[str] = None


@router.post("/sessions")
def create_session(body: SessionCreateIn) -> Dict[str, Any]:
    directory = get_user_directory()
    session = directory.create_session(
        body.user_id,
        ttl_hours=body.ttl_hours,
        sso_provider=body.sso_provider,
    )
    if session is None:
        raise HTTPException(status_code=404, detail="user not found or inactive")
    return {
        "session_id": session.session_id,
        "user_id": session.user_id,
        "tenant_id": session.tenant_id,
        "created_at": session.created_at.isoformat(),
        "expires_at": session.expires_at.isoformat(),
        "sso_provider": session.sso_provider,
    }


@router.get("/sessions/{session_id}")
def verify_session(session_id: str) -> Dict[str, Any]:
    directory = get_user_directory()
    session = directory.verify_session(session_id)
    if session is None:
        raise HTTPException(status_code=401, detail="session expired or invalid")
    return {
        "valid": True,
        "session_id": session.session_id,
        "user_id": session.user_id,
        "tenant_id": session.tenant_id,
        "expires_at": session.expires_at.isoformat(),
    }


# ════════════════════════════════════════════════════════════════
# QUERY DSL
# ════════════════════════════════════════════════════════════════

class QueryDSLIn(BaseModel):
    tenant_id: str
    query: str
    entity_type: Optional[str] = None
    limit: int = 100
    include_rows: bool = False


@router.post("/query")
def run_query(body: QueryDSLIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = QueryDSL(db)
    result = engine.execute(
        body.query,
        tenant_id=body.tenant_id,
        entity_type=body.entity_type,
        limit=body.limit,
        include_rows=body.include_rows,
    )
    return {
        "query": result.query,
        "matched_count": result.matched_count,
        "elapsed_ms": result.elapsed_ms,
        "ids": result.ids,
        "rows": result.rows if body.include_rows else [],
        "error": result.error,
    }


# ════════════════════════════════════════════════════════════════
# DATA CATALOG
# ════════════════════════════════════════════════════════════════

@router.get("/catalog/{tenant_id}")
def data_catalog(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = DataCatalog(db)
    report = engine.build(tenant_id)
    return {
        "tenant_id": report.tenant_id,
        "generated_at": report.generated_at.isoformat(),
        "total_entities": report.total_entities,
        "total_entity_types": report.total_entity_types,
        "total_relationships": report.total_relationships,
        "entity_types": [
            {
                "entity_type": e.entity_type,
                "entity_count": e.entity_count,
                "properties": e.properties,
                "relationship_types": e.relationship_types,
                "sample_ids": e.sample_ids,
            }
            for e in report.entity_types
        ],
    }
