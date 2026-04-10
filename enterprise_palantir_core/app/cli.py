"""
palantir-cli — operator command-line interface.

Usage:
    python -m app.cli <command> [args]

Commands:
    status                              Show overall health of every tenant
    snapshot <tenant_id>                Print full snapshot (JSON)
    hotspots <tenant_id>                Print causal hotspots
    anomalies <tenant_id>               Run anomaly detection
    dq <tenant_id>                      Run data quality check
    search <tenant_id> <query>          Vector semantic search
    replay <tenant_id> <iso_time>       Reconstruct state at a past time
    connectors                          List every connector + health
    jobs                                List scheduler jobs
    run-job <job_id>                    Manually trigger a scheduler job
    dispatch <tenant_id> <severity> <title> <body>
                                        Fire a notification
    simulate <tenant_id> <entity_id> <delay_days>
                                        Run a "what if delay" simulation

This is a plain sync CLI that opens its own DB session and does not
need the FastAPI process to be running.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.db import SessionLocal
from app.engines.ai_orchestrator import AIOrchestrator
from app.engines.anomaly_detection import AnomalyDetectionEngine
from app.engines.connector_registry import get_connector_registry
from app.engines.data_quality_engine import DataQualityEngine
from app.engines.notification_service import NotificationMessage, get_notification_service
from app.engines.replay_engine import ReplayEngine
from app.engines.scheduler import get_scheduler, register_default_jobs
from app.engines.simulation_engine import HypotheticalChange, SimulationEngine
from app.engines.vector_search import VectorSearchEngine
from app.models.tenant import Tenant


def _out(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str, ensure_ascii=False))


def cmd_status() -> None:
    db = SessionLocal()
    try:
        tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
        results = []
        for t in tenants:
            orch = AIOrchestrator(db)
            snap = asyncio.run(orch.build_snapshot(t.id))
            results.append({
                "tenant_id": t.id,
                "name": t.name,
                "health": snap.overall_health_score,
                "entities": snap.total_objects,
                "at_risk": snap.at_risk_entities,
                "blocked": snap.blocked_entities,
                "alerts": snap.total_alerts,
                "hotspots": len(snap.causal_hotspots),
            })
        _out(results)
    finally:
        db.close()


def cmd_snapshot(tenant_id: str) -> None:
    db = SessionLocal()
    try:
        orch = AIOrchestrator(db)
        snap = asyncio.run(orch.build_snapshot(tenant_id))
        _out({
            "tenant_id": snap.tenant_id,
            "overall_health_score": snap.overall_health_score,
            "total_objects": snap.total_objects,
            "at_risk": snap.at_risk_entities,
            "by_entity_type": snap.by_entity_type,
            "module_health": [
                {
                    "module": m.module,
                    "health": m.health_score,
                    "status": m.status,
                    "entities": m.entity_count,
                    "at_risk": m.at_risk_count,
                }
                for m in snap.module_health
            ],
            "hotspots": [
                {
                    "name": h.name,
                    "type": h.entity_type,
                    "severity": h.severity,
                    "downstream": h.downstream_count,
                }
                for h in snap.causal_hotspots
            ],
            "recommendations": [r.title for r in snap.ai_recommendations],
        })
    finally:
        db.close()


def cmd_hotspots(tenant_id: str) -> None:
    db = SessionLocal()
    try:
        orch = AIOrchestrator(db)
        snap = asyncio.run(orch.build_snapshot(tenant_id))
        _out([
            {
                "severity": h.severity,
                "entity_type": h.entity_type,
                "name": h.name,
                "downstream_count": h.downstream_count,
                "downstream_sample": [
                    {"name": d.get("name"), "type": d.get("type"), "via": d.get("via")}
                    for d in h.downstream_sample[:5]
                ],
            }
            for h in snap.causal_hotspots
        ])
    finally:
        db.close()


def cmd_anomalies(tenant_id: str) -> None:
    db = SessionLocal()
    try:
        engine = AnomalyDetectionEngine(db)
        anomalies = engine.scan(tenant_id)
        _out([
            {
                "type": a.anomaly_type.value,
                "severity": a.severity.value,
                "score": round(a.score, 3),
                "entity_id": a.entity_id,
                "title": a.title,
                "description": a.description,
            }
            for a in anomalies
        ])
    finally:
        db.close()


def cmd_dq(tenant_id: str) -> None:
    db = SessionLocal()
    try:
        engine = DataQualityEngine(db)
        report = engine.run(tenant_id)
        _out({
            "quality_score": report.quality_score,
            "total_entities_checked": report.total_entities_checked,
            "total_rules_applied": report.total_rules_applied,
            "total_violations": report.total_violations,
            "violations_by_severity": report.violations_by_severity,
            "violations_sample": [
                {
                    "rule": v.rule_name,
                    "severity": v.severity.value,
                    "entity": f"{v.entity_type}:{v.entity_name}",
                    "reason": v.reason,
                }
                for v in report.violations[:10]
            ],
        })
    finally:
        db.close()


def cmd_search(tenant_id: str, query: str) -> None:
    db = SessionLocal()
    try:
        engine = VectorSearchEngine(db)
        engine.build_for_tenant(tenant_id)
        results = engine.search(query, tenant_id=tenant_id, top_k=10)
        _out([
            {
                "score": r.score,
                "type": r.entity_type,
                "name": r.name,
                "entity_id": r.entity_id,
            }
            for r in results
        ])
    finally:
        db.close()


def cmd_replay(tenant_id: str, iso_time: str) -> None:
    db = SessionLocal()
    try:
        ts = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        engine = ReplayEngine(db)
        result = engine.reconstruct_at(tenant_id, ts)
        _out({
            "as_of": result.as_of.isoformat(),
            "events_replayed": result.events_replayed,
            "entities_reconstructed": result.entities_reconstructed,
            "entities_sample": [
                {
                    "id": k,
                    "type": v.entity_type,
                    "last_event_at": v.last_event_at.isoformat() if v.last_event_at else None,
                    "property_count": len(v.properties),
                }
                for k, v in list(result.entities.items())[:10]
            ],
        })
    finally:
        db.close()


def cmd_connectors() -> None:
    reg = get_connector_registry()
    _out({
        "summary": reg.summary(),
        "connectors": [
            {
                "id": c.descriptor.connector_id,
                "name": c.descriptor.name,
                "type": c.descriptor.connector_type.value,
                "mode": c.descriptor.ingestion_mode.value,
                "health": c.health.health_score,
                "status": c.health.status.value,
            }
            for c in reg.all()
        ],
    })


def cmd_jobs() -> None:
    sched = get_scheduler()
    register_default_jobs(sched)
    _out(sched.to_serializable())


def cmd_run_job(job_id: str) -> None:
    sched = get_scheduler()
    register_default_jobs(sched)
    job = asyncio.run(sched.run_now(job_id))
    if job is None:
        print(f"ERROR: job {job_id} not found")
        sys.exit(1)
    _out({
        "job_id": job.job_id,
        "status": job.last_status,
        "duration_ms": job.last_duration_ms,
        "result": job.last_result,
        "error": job.last_error,
    })


def cmd_dispatch(tenant_id: str, severity: str, title: str, body: str) -> None:
    service = get_notification_service()
    message = NotificationMessage(
        title=title,
        body=body,
        severity=severity,
        tenant_id=tenant_id,
    )
    results = asyncio.run(service.dispatch(message))
    _out([{"channel": r.channel, "result": r.result.value, "message": r.message} for r in results])


def cmd_simulate(tenant_id: str, entity_id: str, delay_days: str) -> None:
    db = SessionLocal()
    try:
        engine = SimulationEngine(db)
        result = engine.simulate(
            tenant_id=tenant_id,
            changes=[HypotheticalChange(
                entity_id=entity_id,
                change_type="add_delay_days",
                delay_days=int(delay_days),
            )],
        )
        _out({
            "previous_health": result.previous_overall_health,
            "hypothetical_health": result.hypothetical_overall_health,
            "delta": result.delta_health,
            "impacted_count": len(result.impacted_entities),
            "newly_blocked": result.newly_blocked,
            "summary": result.summary,
        })
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ════════════════════════════════════════════════════════════════

COMMANDS = {
    "status": (cmd_status, 0),
    "snapshot": (cmd_snapshot, 1),
    "hotspots": (cmd_hotspots, 1),
    "anomalies": (cmd_anomalies, 1),
    "dq": (cmd_dq, 1),
    "search": (cmd_search, 2),
    "replay": (cmd_replay, 2),
    "connectors": (cmd_connectors, 0),
    "jobs": (cmd_jobs, 0),
    "run-job": (cmd_run_job, 1),
    "dispatch": (cmd_dispatch, 4),
    "simulate": (cmd_simulate, 3),
}


def main(argv: List[str]) -> None:
    if len(argv) < 2 or argv[1] in ("-h", "--help", "help"):
        print(__doc__)
        sys.exit(0)
    cmd = argv[1]
    args = argv[2:]
    if cmd not in COMMANDS:
        print(f"ERROR: unknown command '{cmd}'. Run with --help.")
        sys.exit(1)
    handler, arg_count = COMMANDS[cmd]
    if len(args) < arg_count:
        print(f"ERROR: '{cmd}' expects {arg_count} argument(s), got {len(args)}")
        sys.exit(1)
    try:
        handler(*args[:arg_count])
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
