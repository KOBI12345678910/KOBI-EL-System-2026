"""
API router for the production engines (app/engines/*).

Exposes:
  GET  /engines/graph/{entity_id}/downstream
  GET  /engines/graph/{entity_id}/upstream
  GET  /engines/graph/path
  GET  /engines/alerts/{tenant_id}/open
  GET  /engines/alerts/{tenant_id}/critical
  POST /engines/actions/request
  POST /engines/actions/{action_id}/approve
  POST /engines/actions/{action_id}/execute
  GET  /engines/actions/{tenant_id}/pending
  GET  /engines/audit/{tenant_id}/recent
  GET  /engines/audit/{tenant_id}/verify
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.action_engine import ActionDefinition, ActionEngine
from app.engines.alert_engine import AlertEngine
from app.engines.claude_adapter import ClaudeAdapter
from app.engines.graph_traversal import GraphTraversalEngine
from app.engines.immutable_audit import ImmutableAuditLog
from app.engines.policy_engine import Policy, PolicyEngine
from app.models.audit import AuditLogModel

router = APIRouter(prefix="/engines", tags=["engines"])


# ════════════════════════════════════════════════════════════════
# GRAPH TRAVERSAL
# ════════════════════════════════════════════════════════════════

@router.get("/graph/{entity_id}/downstream")
def graph_downstream(
    entity_id: str,
    depth: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
) -> dict:
    engine = GraphTraversalEngine(db)
    hits = engine.downstream(entity_id, max_depth=depth)
    return {
        "root": entity_id,
        "depth": depth,
        "hits": [
            {"entity_id": h.entity_id, "depth": h.depth, "type": h.object_type,
             "name": h.name, "via": h.via_relation}
            for h in hits
        ],
    }


@router.get("/graph/{entity_id}/upstream")
def graph_upstream(
    entity_id: str,
    depth: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
) -> dict:
    engine = GraphTraversalEngine(db)
    hits = engine.upstream(entity_id, max_depth=depth)
    return {
        "root": entity_id,
        "depth": depth,
        "hits": [
            {"entity_id": h.entity_id, "depth": h.depth, "type": h.object_type,
             "name": h.name, "via": h.via_relation}
            for h in hits
        ],
    }


@router.get("/graph/path")
def graph_path(
    from_entity: str,
    to_entity: str,
    db: Session = Depends(get_db),
) -> dict:
    engine = GraphTraversalEngine(db)
    result = engine.shortest_path(from_entity, to_entity)
    return {
        "found": result.found,
        "path": result.path,
        "relations": result.relations,
        "depth": result.depth,
    }


# ════════════════════════════════════════════════════════════════
# ALERTS (engine-level, rule-driven)
# ════════════════════════════════════════════════════════════════

@router.get("/alerts/{tenant_id}/open")
def engine_alerts_open(tenant_id: str, db: Session = Depends(get_db)) -> List[dict]:
    engine = AlertEngine(db)
    import json as _json
    return [
        {
            "id": a.id,
            "severity": a.severity,
            "alert_type": a.alert_type,
            "entity_id": a.entity_id,
            "title": a.title,
            "description": a.description,
            "status": a.status,
            "metadata": _json.loads(a.metadata_json or "{}"),
        }
        for a in engine.list_open(tenant_id)
    ]


@router.get("/alerts/{tenant_id}/critical")
def engine_alerts_critical(tenant_id: str, db: Session = Depends(get_db)) -> List[dict]:
    engine = AlertEngine(db)
    import json as _json
    return [
        {
            "id": a.id,
            "severity": a.severity,
            "alert_type": a.alert_type,
            "entity_id": a.entity_id,
            "title": a.title,
            "description": a.description,
            "metadata": _json.loads(a.metadata_json or "{}"),
        }
        for a in engine.list_critical(tenant_id)
    ]


# ════════════════════════════════════════════════════════════════
# ACTIONS (policy-gated)
# ════════════════════════════════════════════════════════════════

# Singleton-ish holders so registrations persist across API calls.
_action_engine: Optional[ActionEngine] = None
_policy_engine: Optional[PolicyEngine] = None


def _get_policy_engine() -> PolicyEngine:
    global _policy_engine
    if _policy_engine is None:
        _policy_engine = PolicyEngine()
        # Register a default "safety_guardrail" policy
        _policy_engine.register(Policy(
            policy_id="default.safety",
            name="Default safety guardrail",
            action_type_match="*",
            max_impact_usd=100_000,
            max_per_minute=60,
        ))
    return _policy_engine


def _get_action_engine(db: Session) -> ActionEngine:
    global _action_engine
    if _action_engine is None:
        _action_engine = ActionEngine(db, policy_engine=_get_policy_engine())
        # Register demo action types so /engines/actions/request works
        # out of the box.
        _action_engine.register_definition(
            ActionDefinition(
                action_type="demo.log_message",
                description="Log a message through the audit trail",
            )
        )

        async def _log_handler(params: Dict[str, Any]) -> Dict[str, Any]:
            return {"logged": params.get("message", "")}

        _action_engine.register_handler("demo.log_message", _log_handler)
    else:
        # Always rebind the engine to the latest DB session so audits
        # persist to the right connection.
        _action_engine.db = db
        _action_engine.audit_repo.db = db
    return _action_engine


class ActionRequestIn(BaseModel):
    tenant_id: str
    actor: str
    action_type: str
    params: Dict[str, Any] = {}
    estimated_impact_usd: float = 0.0
    actor_roles: List[str] = []


@router.post("/actions/request")
def actions_request(body: ActionRequestIn, db: Session = Depends(get_db)) -> dict:
    engine = _get_action_engine(db)
    try:
        execution = engine.request(
            tenant_id=body.tenant_id,
            actor=body.actor,
            action_type=body.action_type,
            params=body.params,
            actor_roles=body.actor_roles,
            estimated_impact_usd=body.estimated_impact_usd,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "action_id": execution.action_id,
        "status": execution.status,
        "audit_id": execution.audit_id,
        "error": execution.error,
    }


@router.post("/actions/{action_id}/approve")
def actions_approve(action_id: str, approver: str, db: Session = Depends(get_db)) -> dict:
    engine = _get_action_engine(db)
    try:
        execution = engine.approve(execution_id=action_id, approver=approver)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"action_id": execution.action_id, "status": execution.status}


@router.post("/actions/{action_id}/execute")
def actions_execute(action_id: str, actor: str, db: Session = Depends(get_db)) -> dict:
    engine = _get_action_engine(db)
    try:
        execution = asyncio.get_event_loop().run_until_complete(
            engine.execute(execution_id=action_id, actor=actor)
        ) if False else asyncio.run(engine.execute(execution_id=action_id, actor=actor))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "action_id": execution.action_id,
        "status": execution.status,
        "result": execution.result,
        "error": execution.error,
    }


@router.get("/actions/{tenant_id}/pending")
def actions_pending(tenant_id: str, db: Session = Depends(get_db)) -> List[dict]:
    engine = _get_action_engine(db)
    return [
        {
            "action_id": e.action_id,
            "action_type": e.action_type,
            "actor": e.actor,
            "params": e.params,
            "status": e.status,
        }
        for e in engine.list_pending(tenant_id)
    ]


# ════════════════════════════════════════════════════════════════
# IMMUTABLE AUDIT
# ════════════════════════════════════════════════════════════════

@router.get("/audit/{tenant_id}/recent")
def audit_recent(tenant_id: str, limit: int = 50, db: Session = Depends(get_db)) -> List[dict]:
    import json as _json
    rows = (
        db.query(AuditLogModel)
        .filter(AuditLogModel.tenant_id == tenant_id)
        .order_by(AuditLogModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "actor_id": r.actor_id,
            "action_name": r.action_name,
            "target_entity_id": r.target_entity_id,
            "details": _json.loads(r.details_json or "{}"),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/audit/{tenant_id}/verify")
def audit_verify(tenant_id: str, db: Session = Depends(get_db)) -> dict:
    log = ImmutableAuditLog(db)
    ok, err = log.verify_chain(tenant_id)
    return {"ok": ok, "error": err}
