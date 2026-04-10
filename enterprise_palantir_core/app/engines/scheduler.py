"""
Automation Scheduler — simple cron-style background job runner.

Runs periodic tasks defined in-process (or loaded from a future DB
`scheduled_jobs` table). Each job is identified by a stable id so it
can be paused/resumed at runtime.

Built-in job types:
  - snapshot_refresh      → recompute command-center snapshot
  - freshness_check       → mark stale entities
  - alert_auto_resolve    → close alerts that have not recurred
  - workflow_sla_sweep    → flag SLA-breached workflow instances
  - connector_health_poll → update connector health from the registry
  - cdc_poll              → run every CDC connector's next_batch()

Cron expression support is intentionally minimal (interval-based fields:
every_seconds, every_minutes, every_hours). A real deployment can swap
in APScheduler or Celery Beat transparently — the Job dataclass stays
the same.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


JobHandler = Callable[[], Awaitable[Dict[str, Any]]]


@dataclass
class Job:
    job_id: str
    name: str
    description: str
    handler: JobHandler
    every_seconds: int = 60
    enabled: bool = True
    last_run_at: Optional[datetime] = None
    last_finished_at: Optional[datetime] = None
    last_duration_ms: Optional[int] = None
    last_status: str = "pending"      # pending|running|success|failed
    last_result: Optional[Dict[str, Any]] = None
    last_error: Optional[str] = None
    run_count: int = 0
    failure_count: int = 0
    created_at: datetime = field(default_factory=utc_now)


class Scheduler:
    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def register(self, job: Job) -> None:
        self._jobs[job.job_id] = job

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def all(self) -> List[Job]:
        return list(self._jobs.values())

    def pause(self, job_id: str) -> bool:
        j = self._jobs.get(job_id)
        if j is None:
            return False
        j.enabled = False
        return True

    def resume(self, job_id: str) -> bool:
        j = self._jobs.get(job_id)
        if j is None:
            return False
        j.enabled = True
        return True

    async def start(self) -> None:
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def _loop(self) -> None:
        while self._running:
            now = utc_now()
            due = [
                j for j in self._jobs.values()
                if j.enabled
                and (
                    j.last_run_at is None
                    or (now - j.last_run_at).total_seconds() >= j.every_seconds
                )
            ]
            for job in due:
                await self._run_job(job)
            await asyncio.sleep(1.0)

    async def run_now(self, job_id: str) -> Optional[Job]:
        job = self._jobs.get(job_id)
        if job is None:
            return None
        await self._run_job(job)
        return job

    async def _run_job(self, job: Job) -> None:
        job.last_run_at = utc_now()
        job.last_status = "running"
        start_ms = int(job.last_run_at.timestamp() * 1000)
        try:
            result = await job.handler()
            job.last_result = result
            job.last_status = "success"
        except Exception as exc:
            job.last_error = str(exc)
            job.last_status = "failed"
            job.failure_count += 1
        finally:
            job.last_finished_at = utc_now()
            job.last_duration_ms = int(job.last_finished_at.timestamp() * 1000) - start_ms
            job.run_count += 1

    def to_serializable(self) -> List[Dict[str, Any]]:
        return [
            {
                "job_id": j.job_id,
                "name": j.name,
                "description": j.description,
                "every_seconds": j.every_seconds,
                "enabled": j.enabled,
                "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
                "last_finished_at": j.last_finished_at.isoformat() if j.last_finished_at else None,
                "last_duration_ms": j.last_duration_ms,
                "last_status": j.last_status,
                "last_result": j.last_result,
                "last_error": j.last_error,
                "run_count": j.run_count,
                "failure_count": j.failure_count,
            }
            for j in self._jobs.values()
        ]


# ════════════════════════════════════════════════════════════════
# Global singleton + default job seeding
# ════════════════════════════════════════════════════════════════

_scheduler: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler()
    return _scheduler


# ────────────────────────────────────────────────────────────────
# Default job handlers — these read from whatever services exist
# ────────────────────────────────────────────────────────────────

async def _job_snapshot_refresh() -> Dict[str, Any]:
    """Recompute the command-center snapshot for every active tenant."""
    from app.db import SessionLocal
    from app.engines.ai_orchestrator import AIOrchestrator
    from app.models.tenant import Tenant

    db = SessionLocal()
    try:
        tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
        results: List[Dict[str, Any]] = []
        for t in tenants:
            orch = AIOrchestrator(db)
            snap = await orch.build_snapshot(t.id)
            results.append({
                "tenant_id": t.id,
                "health": snap.overall_health_score,
                "at_risk": snap.at_risk_entities,
                "hotspots": len(snap.causal_hotspots),
            })
        return {"snapshots_built": len(results), "details": results}
    finally:
        db.close()


async def _job_freshness_check() -> Dict[str, Any]:
    """Mark entities whose last event was > 1h ago as stale."""
    from app.db import SessionLocal
    from app.models.state import EntityStateModel

    db = SessionLocal()
    try:
        cutoff = utc_now() - timedelta(hours=1)
        stale_count = 0
        states = db.query(EntityStateModel).all()
        for s in states:
            last = s.updated_at
            if last is None:
                continue
            last_aware = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
            if last_aware < cutoff and s.freshness_status != "stale":
                s.freshness_status = "stale"
                stale_count += 1
        db.commit()
        return {"marked_stale": stale_count}
    finally:
        db.close()


async def _job_workflow_sla_sweep() -> Dict[str, Any]:
    """Flag workflow instances that haven't transitioned in 24h."""
    from app.db import SessionLocal
    from app.engines.workflow_engine import WorkflowEngine

    db = SessionLocal()
    try:
        from app.models.tenant import Tenant
        tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
        flagged: List[str] = []
        for t in tenants:
            eng = WorkflowEngine(db)
            stalled = eng.list_stalled(t.id, max_age_seconds=24 * 3600)
            flagged.extend([i.id for i in stalled])
        return {"stalled_workflows": len(flagged), "ids": flagged[:20]}
    finally:
        db.close()


async def _job_connector_health_poll() -> Dict[str, Any]:
    """Report connector registry health."""
    from app.engines.connector_registry import get_connector_registry
    reg = get_connector_registry()
    return reg.summary()


def register_default_jobs(scheduler: Scheduler) -> None:
    """
    Wire the default cron jobs. Safe to call multiple times — overwrites
    existing jobs with the same id.
    """
    scheduler.register(Job(
        job_id="snapshot_refresh",
        name="Snapshot refresh",
        description="Recompute the command-center unified snapshot for every active tenant",
        handler=_job_snapshot_refresh,
        every_seconds=60,
    ))
    scheduler.register(Job(
        job_id="freshness_check",
        name="Freshness check",
        description="Mark entities as stale if their last update is > 1h ago",
        handler=_job_freshness_check,
        every_seconds=300,
    ))
    scheduler.register(Job(
        job_id="workflow_sla_sweep",
        name="Workflow SLA sweep",
        description="Flag workflow instances that haven't transitioned in 24h",
        handler=_job_workflow_sla_sweep,
        every_seconds=900,
    ))
    scheduler.register(Job(
        job_id="connector_health_poll",
        name="Connector health poll",
        description="Read current connector registry stats",
        handler=_job_connector_health_poll,
        every_seconds=120,
    ))
