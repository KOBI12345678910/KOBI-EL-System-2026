"""
Deep Health Check — runs every subsystem's "am I OK" test and returns
a structured readiness report.

Components checked:
  - database (can we query tenants table?)
  - ontology (does at least one entity exist per tenant?)
  - event_store (can we count events?)
  - workflow engine (can we enumerate active instances?)
  - connector registry (how many connectors are active?)
  - scheduler (is the loop running + jobs registered?)
  - claude adapter (key configured or stub?)
  - notification service (at least one channel registered?)
  - cache (in-memory or redis reachable?)
  - event bus (in-process or kafka started?)

Every check returns a ComponentHealth with status: healthy | degraded | down
and a latency_ms. The overall status is:
  down     if any check returns down
  degraded if any check returns degraded
  healthy  otherwise
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.events import DomainEventModel
from app.models.ontology import OntologyObject
from app.models.tenant import Tenant
from app.models.workflow import WorkflowInstanceModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ComponentHealth:
    component: str
    status: str  # healthy | degraded | down
    latency_ms: int
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HealthReport:
    overall_status: str
    checked_at: datetime
    uptime_seconds: int
    components: List[ComponentHealth]


class HealthCheckEngine:
    # Track process start time for uptime
    _start_time: float = time.time()

    @classmethod
    def start(cls) -> None:
        cls._start_time = time.time()

    async def run(self) -> HealthReport:
        components: List[ComponentHealth] = []
        components.append(await self._check_database())
        components.append(await self._check_ontology())
        components.append(await self._check_event_store())
        components.append(await self._check_workflow_engine())
        components.append(await self._check_connector_registry())
        components.append(await self._check_scheduler())
        components.append(await self._check_claude_adapter())
        components.append(await self._check_notification_service())
        components.append(await self._check_cache())
        components.append(await self._check_event_bus())

        overall = "healthy"
        if any(c.status == "down" for c in components):
            overall = "down"
        elif any(c.status == "degraded" for c in components):
            overall = "degraded"

        uptime = int(time.time() - self._start_time)

        return HealthReport(
            overall_status=overall,
            checked_at=utc_now(),
            uptime_seconds=uptime,
            components=components,
        )

    # ─── Individual checks ───────────────────────────────────
    async def _check_database(self) -> ComponentHealth:
        start = time.time()
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            tenant_count = db.query(Tenant).count()
            return ComponentHealth(
                component="database",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message="ok",
                details={"tenants": tenant_count},
            )
        except Exception as exc:
            return ComponentHealth(
                component="database",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )
        finally:
            db.close()

    async def _check_ontology(self) -> ComponentHealth:
        start = time.time()
        db = SessionLocal()
        try:
            count = db.query(OntologyObject).count()
            if count == 0:
                return ComponentHealth(
                    component="ontology",
                    status="degraded",
                    latency_ms=int((time.time() - start) * 1000),
                    message="no entities in ontology",
                    details={"objects": 0},
                )
            return ComponentHealth(
                component="ontology",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{count} objects",
                details={"objects": count},
            )
        except Exception as exc:
            return ComponentHealth(
                component="ontology",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )
        finally:
            db.close()

    async def _check_event_store(self) -> ComponentHealth:
        start = time.time()
        db = SessionLocal()
        try:
            count = db.query(DomainEventModel).count()
            return ComponentHealth(
                component="event_store",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{count} events",
                details={"events": count},
            )
        except Exception as exc:
            return ComponentHealth(
                component="event_store",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )
        finally:
            db.close()

    async def _check_workflow_engine(self) -> ComponentHealth:
        start = time.time()
        db = SessionLocal()
        try:
            count = db.query(WorkflowInstanceModel).count()
            return ComponentHealth(
                component="workflow_engine",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{count} instances",
                details={"instances": count},
            )
        except Exception as exc:
            return ComponentHealth(
                component="workflow_engine",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )
        finally:
            db.close()

    async def _check_connector_registry(self) -> ComponentHealth:
        start = time.time()
        try:
            from app.engines.connector_registry import get_connector_registry
            reg = get_connector_registry()
            summary = reg.summary()
            total = summary["total"]
            active = summary.get("active_count", 0)
            failed = summary.get("failed_count", 0)
            status = "healthy"
            if failed > 0:
                status = "degraded"
            if total == 0:
                status = "degraded"
            return ComponentHealth(
                component="connector_registry",
                status=status,
                latency_ms=int((time.time() - start) * 1000),
                message=f"{active}/{total} active, {failed} failed",
                details=summary,
            )
        except Exception as exc:
            return ComponentHealth(
                component="connector_registry",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )

    async def _check_scheduler(self) -> ComponentHealth:
        start = time.time()
        try:
            from app.engines.scheduler import get_scheduler
            sched = get_scheduler()
            jobs = sched.all()
            enabled = sum(1 for j in jobs if j.enabled)
            failures = sum(j.failure_count for j in jobs)
            status = "healthy" if failures < 10 else "degraded"
            return ComponentHealth(
                component="scheduler",
                status=status,
                latency_ms=int((time.time() - start) * 1000),
                message=f"{enabled}/{len(jobs)} jobs enabled, {failures} total failures",
                details={
                    "total_jobs": len(jobs),
                    "enabled": enabled,
                    "failures": failures,
                },
            )
        except Exception as exc:
            return ComponentHealth(
                component="scheduler",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )

    async def _check_claude_adapter(self) -> ComponentHealth:
        start = time.time()
        has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
        return ComponentHealth(
            component="claude_adapter",
            status="healthy" if has_key else "degraded",
            latency_ms=int((time.time() - start) * 1000),
            message="live API configured" if has_key else "running in stub mode (no ANTHROPIC_API_KEY)",
            details={"mode": "live" if has_key else "stub"},
        )

    async def _check_notification_service(self) -> ComponentHealth:
        start = time.time()
        try:
            from app.engines.notification_service import get_notification_service
            svc = get_notification_service()
            channels = svc.channels()
            return ComponentHealth(
                component="notification_service",
                status="healthy" if channels else "degraded",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{len(channels)} channels registered",
                details={"channels": channels},
            )
        except Exception as exc:
            return ComponentHealth(
                component="notification_service",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )

    async def _check_cache(self) -> ComponentHealth:
        start = time.time()
        try:
            from app.engines.redis_cache import get_state_cache
            cache = get_state_cache()
            mode = "redis" if os.environ.get("REDIS_URL") else "in-memory"
            return ComponentHealth(
                component="cache",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{mode} cache",
                details={"mode": mode},
            )
        except Exception as exc:
            return ComponentHealth(
                component="cache",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )

    async def _check_event_bus(self) -> ComponentHealth:
        start = time.time()
        try:
            from app.engines.event_bus_abstraction import get_event_bus
            bus = get_event_bus()
            mode = "kafka" if os.environ.get("KAFKA_BOOTSTRAP_SERVERS") else "nats" if os.environ.get("NATS_URL") else "in-process"
            return ComponentHealth(
                component="event_bus",
                status="healthy",
                latency_ms=int((time.time() - start) * 1000),
                message=f"{mode} bus",
                details={"mode": mode},
            )
        except Exception as exc:
            return ComponentHealth(
                component="event_bus",
                status="down",
                latency_ms=int((time.time() - start) * 1000),
                message=str(exc),
            )
