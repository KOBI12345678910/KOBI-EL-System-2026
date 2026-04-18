"""
Spatial API — geospatial, timeline playback, dependency analysis,
scenario planning.

Phase 10 endpoints for location-aware queries, time travel through
events, dependency blast radius, and what-if scenarios.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.dependency_analyzer import DependencyAnalyzer
from app.engines.geospatial_engine import GeospatialEngine
from app.engines.scenario_planner import ScenarioPlanner, ScenarioType
from app.engines.timeline_playback import TimelinePlayback

router = APIRouter(tags=["spatial"])


# ════════════════════════════════════════════════════════════════
# GEOSPATIAL
# ════════════════════════════════════════════════════════════════

@router.get("/geo/{tenant_id}/stats")
def geo_stats(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = GeospatialEngine(db)
    return engine.stats(tenant_id)


@router.get("/geo/{tenant_id}/in-radius")
def geo_in_radius(
    tenant_id: str,
    lat: float,
    lon: float,
    radius_km: float = 50.0,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = GeospatialEngine(db)
    result = engine.point_in_radius(
        tenant_id=tenant_id,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
    )
    return {
        "center_lat": result.center_lat,
        "center_lon": result.center_lon,
        "radius_km": result.radius_km,
        "count": result.count,
        "matches": [asdict(p) for p in result.matches],
    }


@router.get("/geo/{tenant_id}/nearest")
def geo_nearest(
    tenant_id: str,
    lat: float,
    lon: float,
    limit: int = 5,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = GeospatialEngine(db)
    results = engine.nearest(tenant_id=tenant_id, lat=lat, lon=lon, limit=limit)
    return [asdict(p) for p in results]


@router.get("/geo/{tenant_id}/clusters")
def geo_clusters(
    tenant_id: str,
    precision_km: float = 25.0,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = GeospatialEngine(db)
    return [asdict(c) for c in engine.cluster_by_density(tenant_id=tenant_id, precision_km=precision_km)]


# ════════════════════════════════════════════════════════════════
# TIMELINE PLAYBACK
# ════════════════════════════════════════════════════════════════

class TimelineIn(BaseModel):
    tenant_id: str
    start_time: str  # ISO
    end_time: str    # ISO
    interval_seconds: int = 60
    max_frames: int = 200


@router.post("/timeline/playback")
def timeline_playback(body: TimelineIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        start = datetime.fromisoformat(body.start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(body.end_time.replace("Z", "+00:00"))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"invalid timestamp: {exc}")

    engine = TimelinePlayback(db)
    series = engine.build_series(
        tenant_id=body.tenant_id,
        start_time=start,
        end_time=end,
        interval_seconds=body.interval_seconds,
        max_frames=body.max_frames,
    )
    return {
        "tenant_id": series.tenant_id,
        "start_time": series.start_time.isoformat(),
        "end_time": series.end_time.isoformat(),
        "interval_seconds": series.interval_seconds,
        "frame_count": series.frame_count,
        "total_events": series.total_events,
        "frames": [
            {
                "frame_index": f.frame_index,
                "timestamp": f.timestamp.isoformat(),
                "cumulative_events": f.cumulative_events,
                "delta_events": f.delta_events,
                "total_objects_seen": f.total_objects_seen,
                "by_entity_type": f.by_entity_type,
                "by_severity": f.by_severity,
                "event_types_in_frame": f.event_types_in_frame,
            }
            for f in series.frames
        ],
    }


@router.get("/timeline/{tenant_id}/entity/{entity_id}/span")
def entity_span(
    tenant_id: str,
    entity_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = TimelinePlayback(db)
    return engine.span_of_entity(tenant_id, entity_id)


# ════════════════════════════════════════════════════════════════
# DEPENDENCY ANALYZER
# ════════════════════════════════════════════════════════════════

@router.get("/dependencies/{tenant_id}/blast-radius/{entity_id}")
def blast_radius(
    tenant_id: str,
    entity_id: str,
    max_depth: int = 6,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = DependencyAnalyzer(db)
    result = engine.blast_radius(
        tenant_id=tenant_id,
        source_entity_id=entity_id,
        max_depth=max_depth,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="entity not found")
    return asdict(result)


@router.get("/dependencies/{tenant_id}/cycles")
def find_cycles(
    tenant_id: str,
    max_results: int = 20,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = DependencyAnalyzer(db)
    return [asdict(c) for c in engine.find_cycles(tenant_id, max_results=max_results)]


@router.get("/dependencies/{tenant_id}/spof")
def single_points_of_failure(
    tenant_id: str,
    min_dependents: int = 2,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    engine = DependencyAnalyzer(db)
    return [asdict(s) for s in engine.single_points_of_failure(tenant_id, min_dependents=min_dependents)]


@router.get("/dependencies/{tenant_id}/critical-path")
def critical_path(
    tenant_id: str,
    source_id: str,
    target_id: str,
    max_depth: int = 10,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = DependencyAnalyzer(db)
    path = engine.find_critical_path(
        tenant_id=tenant_id,
        source_id=source_id,
        target_id=target_id,
        max_depth=max_depth,
    )
    return {
        "source_id": source_id,
        "target_id": target_id,
        "path": path,
        "found": path is not None,
        "hops": (len(path) - 1) if path else 0,
    }


# ════════════════════════════════════════════════════════════════
# SCENARIO PLANNER
# ════════════════════════════════════════════════════════════════

class ScenarioIn(BaseModel):
    tenant_id: str
    scenario_type: str
    parameters: Dict[str, Any] = {}


@router.post("/scenarios/run")
def run_scenario(body: ScenarioIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        stype = ScenarioType(body.scenario_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid scenario_type: {body.scenario_type}")

    planner = ScenarioPlanner(db)
    result = planner.run_scenario(
        tenant_id=body.tenant_id,
        scenario_type=stype,
        parameters=body.parameters,
    )
    return {
        "scenario_id": result.scenario_id,
        "scenario_type": result.scenario_type.value,
        "title": result.title,
        "description": result.description,
        "tenant_id": result.tenant_id,
        "summary": result.summary,
        "confidence": result.confidence,
        "generated_at": result.generated_at.isoformat(),
        "impact": asdict(result.impact),
        "new_risks": result.new_risks,
        "new_opportunities": result.new_opportunities,
    }


@router.get("/scenarios/types")
def list_scenario_types() -> List[Dict[str, str]]:
    return [
        {"type": t.value, "description": {
            "onboard_customer": "Add a new customer with a specified project value",
            "lose_supplier": "Simulate total loss of a supplier",
            "reduce_headcount": "Cut headcount by N%",
            "add_production_line": "Add a new production line",
            "fast_track_project": "Spend money to finish a project faster",
            "custom": "Arbitrary HypotheticalChange list",
        }.get(t.value, "")}
        for t in ScenarioType
    ]
