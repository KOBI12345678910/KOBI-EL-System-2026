"""
Platform management API — connector registry, scheduler, notifications,
simulation. These are the operator's control surfaces for managing the
platform itself.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.connector_registry import get_connector_registry
from app.engines.notification_service import NotificationMessage, get_notification_service
from app.engines.scheduler import get_scheduler
from app.engines.simulation_engine import HypotheticalChange, SimulationEngine

router = APIRouter(prefix="/platform", tags=["platform"])


# ════════════════════════════════════════════════════════════════
# CONNECTORS
# ════════════════════════════════════════════════════════════════

@router.get("/connectors")
def list_connectors(tenant_id: Optional[str] = None) -> Dict[str, Any]:
    reg = get_connector_registry()
    return {
        "summary": reg.summary(tenant_id=tenant_id),
        "connectors": reg.to_serializable(tenant_id=tenant_id),
    }


@router.get("/connectors/{connector_id}")
def get_connector(connector_id: str) -> Dict[str, Any]:
    reg = get_connector_registry()
    conn = reg.get(connector_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="connector not found")
    return reg.to_serializable()[0] if False else {
        "connector_id": conn.descriptor.connector_id,
        "tenant_id": conn.descriptor.tenant_id,
        "name": conn.descriptor.name,
        "description": conn.descriptor.description,
        "type": conn.descriptor.connector_type.value,
        "ingestion_mode": conn.descriptor.ingestion_mode.value,
        "produces_entity_types": conn.descriptor.produces_entity_types,
        "auth_type": conn.descriptor.auth_type.value,
        "schedule_cron": conn.descriptor.schedule_cron,
        "category": conn.descriptor.category,
        "vendor": conn.descriptor.vendor,
        "health": {
            "status": conn.health.status.value,
            "last_sync_at": conn.health.last_sync_at.isoformat() if conn.health.last_sync_at else None,
            "events_per_minute": conn.health.events_per_minute,
            "total_records_ingested": conn.health.total_records_ingested,
            "health_score": conn.health.health_score,
        },
    }


@router.get("/connectors-health")
def connectors_health() -> Dict[str, Any]:
    reg = get_connector_registry()
    return reg.summary()


# ════════════════════════════════════════════════════════════════
# SCHEDULER
# ════════════════════════════════════════════════════════════════

@router.get("/scheduler/jobs")
def list_jobs() -> List[Dict[str, Any]]:
    return get_scheduler().to_serializable()


@router.post("/scheduler/jobs/{job_id}/run")
async def run_job(job_id: str) -> Dict[str, Any]:
    sched = get_scheduler()
    job = await sched.run_now(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return {
        "job_id": job.job_id,
        "status": job.last_status,
        "duration_ms": job.last_duration_ms,
        "result": job.last_result,
        "error": job.last_error,
    }


@router.post("/scheduler/jobs/{job_id}/pause")
def pause_job(job_id: str) -> Dict[str, Any]:
    sched = get_scheduler()
    ok = sched.pause(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, "enabled": False}


@router.post("/scheduler/jobs/{job_id}/resume")
def resume_job(job_id: str) -> Dict[str, Any]:
    sched = get_scheduler()
    ok = sched.resume(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, "enabled": True}


# ════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ════════════════════════════════════════════════════════════════

class NotificationIn(BaseModel):
    tenant_id: str
    title: str
    body: str
    severity: str = "info"
    entity_id: Optional[str] = None
    metadata: Dict[str, Any] = {}
    tags: List[str] = []


@router.post("/notifications/dispatch")
async def dispatch_notification(body: NotificationIn) -> Dict[str, Any]:
    service = get_notification_service()
    message = NotificationMessage(
        title=body.title,
        body=body.body,
        severity=body.severity,
        tenant_id=body.tenant_id,
        entity_id=body.entity_id,
        metadata=body.metadata,
        tags=body.tags,
    )
    results = await service.dispatch(message)
    return {
        "channels": service.channels(),
        "results": [{"channel": r.channel, "result": r.result.value, "message": r.message} for r in results],
    }


@router.get("/notifications/channels")
def list_channels() -> List[str]:
    return get_notification_service().channels()


@router.get("/notifications/history")
def notifications_history(limit: int = 50) -> List[Dict[str, Any]]:
    return get_notification_service().recent_history(limit)


# ════════════════════════════════════════════════════════════════
# SIMULATION
# ════════════════════════════════════════════════════════════════

class HypotheticalChangeIn(BaseModel):
    entity_id: str
    change_type: str
    new_status: Optional[str] = None
    new_risk_score: Optional[float] = None
    delay_days: Optional[int] = None
    notes: str = ""


class SimulationRequestIn(BaseModel):
    tenant_id: str
    changes: List[HypotheticalChangeIn]
    max_depth: int = 4


@router.post("/simulate")
def simulate(body: SimulationRequestIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = SimulationEngine(db)
    changes = [
        HypotheticalChange(
            entity_id=c.entity_id,
            change_type=c.change_type,
            new_status=c.new_status,
            new_risk_score=c.new_risk_score,
            delay_days=c.delay_days,
            notes=c.notes,
        )
        for c in body.changes
    ]
    result = engine.simulate(
        tenant_id=body.tenant_id,
        changes=changes,
        max_depth=body.max_depth,
    )
    return {
        "tenant_id": result.tenant_id,
        "simulated_at": result.simulated_at.isoformat(),
        "changes_applied": [asdict(c) for c in result.changes_applied],
        "previous_overall_health": result.previous_overall_health,
        "hypothetical_overall_health": result.hypothetical_overall_health,
        "delta_health": result.delta_health,
        "previously_at_risk": result.previously_at_risk,
        "hypothetically_at_risk": result.hypothetically_at_risk,
        "newly_at_risk": result.newly_at_risk,
        "newly_blocked": result.newly_blocked,
        "impacted_count": len(result.impacted_entities),
        "impacted_entities": [asdict(e) for e in result.impacted_entities],
        "summary": result.summary,
    }
