"""
Command Center API — the single pane of glass.

Every endpoint here returns a view of the ENTIRE company for a given
tenant, produced by the AIOrchestrator. This is the API the top-level
dashboard calls to render the unified picture.

Endpoints:
  GET /command-center/{tenant_id}/snapshot
  GET /command-center/{tenant_id}/snapshot/with-ai-summary
  GET /command-center/{tenant_id}/health
  GET /command-center/{tenant_id}/hotspots
  GET /command-center/{tenant_id}/recommendations
  GET /command-center/{tenant_id}/module-health
  GET /command-center/{tenant_id}/timeline-critical
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.ai_orchestrator import AIOrchestrator, CompanySnapshot
from app.engines.claude_adapter import ClaudeAdapter

router = APIRouter(prefix="/command-center", tags=["command_center"])


def _serialize_snapshot(snap: CompanySnapshot) -> Dict[str, Any]:
    return {
        "generated_at": snap.generated_at.isoformat(),
        "tenant_id": snap.tenant_id,
        "overall_health_score": snap.overall_health_score,
        "total_objects": snap.total_objects,
        "total_events": snap.total_events,
        "total_alerts": snap.total_alerts,
        "at_risk_entities": snap.at_risk_entities,
        "blocked_entities": snap.blocked_entities,
        "active_workflows": snap.active_workflows,
        "stalled_workflows": snap.stalled_workflows,
        "by_entity_type": snap.by_entity_type,
        "module_health": [asdict(m) for m in snap.module_health],
        "causal_hotspots": [asdict(h) for h in snap.causal_hotspots],
        "top_open_alerts": snap.top_open_alerts,
        "recent_critical_events": snap.recent_critical_events,
        "ai_recommendations": [asdict(r) for r in snap.ai_recommendations],
        "ai_summary": snap.ai_summary,
    }


@router.get("/{tenant_id}/snapshot")
def command_center_snapshot(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Unified live picture of the whole company — sync, no Claude call."""
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id, include_ai_summary=False))
    return _serialize_snapshot(snap)


@router.get("/{tenant_id}/snapshot/with-ai-summary")
def command_center_snapshot_with_ai(
    tenant_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Unified picture + Claude-generated executive summary."""
    orch = AIOrchestrator(db)
    claude = ClaudeAdapter(db)
    snap = asyncio.run(
        orch.build_snapshot(tenant_id, include_ai_summary=True, claude=claude)
    )
    return _serialize_snapshot(snap)


@router.get("/{tenant_id}/health")
def command_center_health(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Just the numbers — lightweight endpoint for frequent polling."""
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    return {
        "tenant_id": tenant_id,
        "generated_at": snap.generated_at.isoformat(),
        "overall_health_score": snap.overall_health_score,
        "total_objects": snap.total_objects,
        "at_risk_entities": snap.at_risk_entities,
        "blocked_entities": snap.blocked_entities,
        "total_alerts": snap.total_alerts,
        "active_workflows": snap.active_workflows,
        "stalled_workflows": snap.stalled_workflows,
    }


@router.get("/{tenant_id}/hotspots")
def command_center_hotspots(
    tenant_id: str,
    limit: int = Query(8, ge=1, le=50),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    return [asdict(h) for h in snap.causal_hotspots[:limit]]


@router.get("/{tenant_id}/recommendations")
def command_center_recommendations(
    tenant_id: str,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    return [asdict(r) for r in snap.ai_recommendations]


@router.get("/{tenant_id}/module-health")
def command_center_module_health(
    tenant_id: str,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    return [asdict(m) for m in snap.module_health]


@router.get("/{tenant_id}/timeline-critical")
def command_center_timeline_critical(
    tenant_id: str,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    return snap.recent_critical_events
