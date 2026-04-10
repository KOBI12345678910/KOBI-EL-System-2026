"""
Metrics Exporter — Prometheus-compatible metrics endpoint.

Generates a `/metrics` endpoint in the standard Prometheus text
exposition format WITHOUT any external dependencies (no
prometheus_client required).

Metrics exposed:
  # Gauges
  palantir_entities_total{tenant, entity_type}
  palantir_entities_at_risk{tenant}
  palantir_entities_blocked{tenant}
  palantir_events_total{tenant}
  palantir_alerts_open{tenant, severity}
  palantir_workflows_active{tenant}
  palantir_workflows_stalled{tenant}
  palantir_overall_health_score{tenant}
  palantir_module_health_score{tenant, module}
  palantir_connector_health_score{tenant, connector_id}
  palantir_scheduler_job_run_count{job_id}
  palantir_scheduler_job_failure_count{job_id}
  palantir_scheduler_job_duration_ms{job_id}

Production deployments can scrape this with Prometheus / Grafana / Datadog
and the same labels work everywhere.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.engines.ai_orchestrator import AIOrchestrator
from app.engines.connector_registry import get_connector_registry
from app.engines.scheduler import get_scheduler
from app.models.tenant import Tenant


class MetricsExporter:
    """
    Computes and formats Prometheus metrics on demand. Safe to call
    from any FastAPI handler — each call opens a fresh DB session.
    """

    async def render(self) -> str:
        lines: List[str] = []
        lines.append(self._header("palantir_build_info", "Platform build info", "gauge"))
        lines.append('palantir_build_info{version="1.0.0"} 1')
        lines.append("")

        db = SessionLocal()
        try:
            tenants = db.query(Tenant).filter(Tenant.is_active == True).all()

            # ─── Per-tenant metrics (via snapshot) ────────────
            lines.append(self._header("palantir_overall_health_score", "Overall platform health 0-100 per tenant", "gauge"))
            for t in tenants:
                orch = AIOrchestrator(db)
                try:
                    snap = await orch.build_snapshot(t.id)
                except Exception:
                    continue
                lines.append(f'palantir_overall_health_score{{tenant="{t.id}"}} {snap.overall_health_score}')
            lines.append("")

            lines.append(self._header("palantir_entities_total", "Total entities per tenant", "gauge"))
            for t in tenants:
                orch = AIOrchestrator(db)
                try:
                    snap = await orch.build_snapshot(t.id)
                except Exception:
                    continue
                lines.append(f'palantir_entities_total{{tenant="{t.id}"}} {snap.total_objects}')
                # by type
                for entity_type, count in snap.by_entity_type.items():
                    lines.append(
                        f'palantir_entities_by_type{{tenant="{t.id}",entity_type="{entity_type}"}} {count}'
                    )
            lines.append("")

            lines.append(self._header("palantir_entities_at_risk", "Entities with status at_risk", "gauge"))
            for t in tenants:
                orch = AIOrchestrator(db)
                try:
                    snap = await orch.build_snapshot(t.id)
                except Exception:
                    continue
                lines.append(f'palantir_entities_at_risk{{tenant="{t.id}"}} {snap.at_risk_entities}')
                lines.append(f'palantir_entities_blocked{{tenant="{t.id}"}} {snap.blocked_entities}')
                lines.append(f'palantir_alerts_total{{tenant="{t.id}"}} {snap.total_alerts}')
                lines.append(f'palantir_workflows_active{{tenant="{t.id}"}} {snap.active_workflows}')
                lines.append(f'palantir_workflows_stalled{{tenant="{t.id}"}} {snap.stalled_workflows}')
            lines.append("")

            lines.append(self._header("palantir_module_health_score", "Module health score 0-100", "gauge"))
            for t in tenants:
                orch = AIOrchestrator(db)
                try:
                    snap = await orch.build_snapshot(t.id)
                except Exception:
                    continue
                for m in snap.module_health:
                    lines.append(
                        f'palantir_module_health_score{{tenant="{t.id}",module="{m.module}"}} {m.health_score}'
                    )
            lines.append("")
        finally:
            db.close()

        # ─── Connector metrics ────────────────────────────────
        reg = get_connector_registry()
        lines.append(self._header("palantir_connector_health_score", "Connector health 0-100", "gauge"))
        for c in reg.all():
            lines.append(
                f'palantir_connector_health_score{{tenant="{c.descriptor.tenant_id}",'
                f'connector_id="{c.descriptor.connector_id}",'
                f'type="{c.descriptor.connector_type.value}",'
                f'mode="{c.descriptor.ingestion_mode.value}"}} {c.health.health_score}'
            )
        lines.append("")

        lines.append(self._header("palantir_connector_events_per_minute", "Connector events/minute", "gauge"))
        for c in reg.all():
            lines.append(
                f'palantir_connector_events_per_minute{{tenant="{c.descriptor.tenant_id}",'
                f'connector_id="{c.descriptor.connector_id}"}} {c.health.events_per_minute}'
            )
        lines.append("")

        # ─── Scheduler metrics ────────────────────────────────
        sched = get_scheduler()
        lines.append(self._header("palantir_scheduler_job_run_count", "Scheduler job run count", "counter"))
        for j in sched.all():
            lines.append(f'palantir_scheduler_job_run_count{{job_id="{j.job_id}"}} {j.run_count}')
        lines.append("")

        lines.append(self._header("palantir_scheduler_job_failure_count", "Scheduler job failure count", "counter"))
        for j in sched.all():
            lines.append(f'palantir_scheduler_job_failure_count{{job_id="{j.job_id}"}} {j.failure_count}')
        lines.append("")

        lines.append(self._header("palantir_scheduler_job_duration_ms", "Last run duration in ms", "gauge"))
        for j in sched.all():
            if j.last_duration_ms is not None:
                lines.append(
                    f'palantir_scheduler_job_duration_ms{{job_id="{j.job_id}"}} {j.last_duration_ms}'
                )
        lines.append("")

        return "\n".join(lines) + "\n"

    def _header(self, name: str, help_text: str, metric_type: str) -> str:
        return f"# HELP {name} {help_text}\n# TYPE {name} {metric_type}"
