"""
Intelligence API — dashboard, anomalies, forecast, search, replay,
data quality, Prometheus metrics.

These are the operator's analytical endpoints for exploring the
platform's intelligence layer.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.ai_orchestrator import AIOrchestrator
from app.engines.anomaly_detection import AnomalyDetectionEngine
from app.engines.dashboard_exporter import build_dashboard_html
from app.engines.data_quality_engine import DataQualityEngine
from app.engines.forecast_engine import ForecastEngine, ForecastMethod
from app.engines.metrics_exporter import MetricsExporter
from app.engines.replay_engine import ReplayEngine
from app.engines.vector_search import VectorSearchEngine

router = APIRouter(tags=["intelligence"])


# ════════════════════════════════════════════════════════════════
# HTML DASHBOARD
# ════════════════════════════════════════════════════════════════

@router.get("/command-center/{tenant_id}/dashboard.html", response_class=HTMLResponse)
def dashboard_html(tenant_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    orch = AIOrchestrator(db)
    snap = asyncio.run(orch.build_snapshot(tenant_id))
    # Serialize to a dict the dashboard exporter understands
    snapshot_dict = {
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
    }
    html_text = build_dashboard_html(snapshot_dict, tenant_id)
    return HTMLResponse(content=html_text)


# ════════════════════════════════════════════════════════════════
# ANOMALY DETECTION
# ════════════════════════════════════════════════════════════════

@router.get("/intelligence/{tenant_id}/anomalies")
def scan_anomalies(
    tenant_id: str,
    z_threshold: float = 2.5,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = AnomalyDetectionEngine(db)
    anomalies = engine.scan(tenant_id, z_threshold=z_threshold)
    return [
        {
            "anomaly_id": a.anomaly_id,
            "type": a.anomaly_type.value,
            "severity": a.severity.value,
            "score": round(a.score, 3),
            "entity_id": a.entity_id,
            "entity_type": a.entity_type,
            "title": a.title,
            "description": a.description,
            "evidence": a.evidence,
            "detected_at": a.detected_at.isoformat(),
        }
        for a in anomalies
    ]


# ════════════════════════════════════════════════════════════════
# FORECAST
# ════════════════════════════════════════════════════════════════

class ForecastRequest(BaseModel):
    values: List[float]
    horizon: int = 7
    method: str = "auto"


@router.post("/intelligence/forecast")
def forecast(body: ForecastRequest) -> Dict[str, Any]:
    engine = ForecastEngine()
    try:
        method = ForecastMethod(body.method)
    except ValueError:
        method = ForecastMethod.AUTO
    result = engine.forecast(body.values, horizon=body.horizon, method=method)
    return {
        "method": result.method.value,
        "history_length": result.history_length,
        "mean": round(result.mean, 3),
        "stdev": round(result.stdev, 3),
        "trend": result.trend.value,
        "slope": round(result.slope, 4),
        "confidence": result.confidence,
        "in_sample_rmse": result.in_sample_rmse,
        "predictions": [
            {
                "index": p.index,
                "predicted": round(p.predicted, 3),
                "lower": round(p.lower, 3),
                "upper": round(p.upper, 3),
            }
            for p in result.predictions
        ],
        "generated_at": result.generated_at.isoformat(),
    }


# ════════════════════════════════════════════════════════════════
# VECTOR SEARCH
# ════════════════════════════════════════════════════════════════

_search_engines: Dict[int, VectorSearchEngine] = {}


@router.get("/intelligence/{tenant_id}/search")
def semantic_search(
    tenant_id: str,
    q: str = Query(..., min_length=1),
    top_k: int = 10,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    # Reuse engine per DB session to avoid re-indexing on every call
    db_key = id(db)
    engine = _search_engines.get(db_key)
    if engine is None:
        engine = VectorSearchEngine(db)
        _search_engines[db_key] = engine
    engine.build_for_tenant(tenant_id)
    results = engine.search(
        q, tenant_id=tenant_id, top_k=top_k, entity_type_filter=entity_type
    )
    return [
        {
            "entity_id": r.entity_id,
            "entity_type": r.entity_type,
            "name": r.name,
            "score": r.score,
            "snippet": r.snippet,
        }
        for r in results
    ]


# ════════════════════════════════════════════════════════════════
# REPLAY
# ════════════════════════════════════════════════════════════════

@router.get("/intelligence/{tenant_id}/replay")
def replay_at(
    tenant_id: str,
    as_of: str = Query(..., description="ISO timestamp e.g. 2026-04-10T12:00:00Z"),
    entity_id: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        ts = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"invalid as_of timestamp: {exc}")
    engine = ReplayEngine(db)
    result = engine.reconstruct_at(tenant_id, ts, entity_id=entity_id)
    return {
        "tenant_id": result.tenant_id,
        "as_of": result.as_of.isoformat(),
        "events_replayed": result.events_replayed,
        "entities_reconstructed": result.entities_reconstructed,
        "generated_at": result.generated_at.isoformat(),
        "entities": {
            k: {
                "entity_id": v.entity_id,
                "entity_type": v.entity_type,
                "properties": v.properties,
                "relationships": v.relationships,
                "last_event_id": v.last_event_id,
                "last_event_at": v.last_event_at.isoformat() if v.last_event_at else None,
            }
            for k, v in result.entities.items()
        },
    }


@router.get("/intelligence/{tenant_id}/entity/{entity_id}/timeline")
def entity_timeline(
    tenant_id: str,
    entity_id: str,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = ReplayEngine(db)
    items = engine.entity_timeline(tenant_id, entity_id, limit=limit)
    return [
        {
            "event_id": i.event_id,
            "event_type": i.event_type,
            "severity": i.severity,
            "created_at": i.created_at.isoformat() if i.created_at else None,
            "payload": i.payload,
        }
        for i in items
    ]


# ════════════════════════════════════════════════════════════════
# DATA QUALITY
# ════════════════════════════════════════════════════════════════

@router.get("/intelligence/{tenant_id}/data-quality")
def data_quality(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = DataQualityEngine(db)
    report = engine.run(tenant_id)
    return {
        "tenant_id": report.tenant_id,
        "generated_at": report.generated_at.isoformat(),
        "quality_score": report.quality_score,
        "total_entities_checked": report.total_entities_checked,
        "total_rules_applied": report.total_rules_applied,
        "total_violations": report.total_violations,
        "violations_by_severity": report.violations_by_severity,
        "violations_by_rule": report.violations_by_rule,
        "violations": [
            {
                "rule_id": v.rule_id,
                "rule_name": v.rule_name,
                "severity": v.severity.value,
                "entity_id": v.entity_id,
                "entity_type": v.entity_type,
                "entity_name": v.entity_name,
                "reason": v.reason,
                "fix_hint": v.fix_hint,
            }
            for v in report.violations
        ],
    }


# ════════════════════════════════════════════════════════════════
# PROMETHEUS METRICS
# ════════════════════════════════════════════════════════════════

_metrics_exporter = MetricsExporter()


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics() -> str:
    return await _metrics_exporter.render()
