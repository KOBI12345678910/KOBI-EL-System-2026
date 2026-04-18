"""
Analytics API — cost engine, capacity planning, risk scoring, SLA
manager, export engine, deep health check.

These endpoints expose the analytical and operational intelligence
built in Phase 6.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.capacity_planning import CapacityPlanningEngine
from app.engines.cost_engine import CostEngine
from app.engines.export_engine import ExportEngine
from app.engines.health_check import HealthCheckEngine
from app.engines.risk_scoring import RiskScoringEngine
from app.engines.sla_manager import SLAManager

router = APIRouter(tags=["analytics"])


# ════════════════════════════════════════════════════════════════
# COST ENGINE
# ════════════════════════════════════════════════════════════════

@router.get("/analytics/{tenant_id}/company-pl")
def company_pl(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = CostEngine(db)
    pl = engine.compute_company_pl(tenant_id)
    return {
        "tenant_id": pl.tenant_id,
        "generated_at": pl.generated_at.isoformat(),
        "total_revenue_ils": pl.total_revenue_ils,
        "total_direct_cost_ils": pl.total_direct_cost_ils,
        "total_overhead_ils": pl.total_overhead_ils,
        "gross_profit_ils": pl.gross_profit_ils,
        "gross_margin_pct": pl.gross_margin_pct,
        "at_risk_exposure_ils": pl.at_risk_exposure_ils,
        "projected_write_off_ils": pl.projected_write_off_ils,
        "top_customers_by_ltv": [asdict(c) for c in pl.top_customers_by_ltv],
        "top_suppliers_by_spend": [asdict(s) for s in pl.top_suppliers_by_spend],
        "top_risk_costs": [asdict(r) for r in pl.top_risk_costs],
        "per_project": [asdict(p) for p in pl.per_project],
    }


@router.get("/analytics/{tenant_id}/customer-ltv")
def customer_ltv(tenant_id: str, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    engine = CostEngine(db)
    pl = engine.compute_company_pl(tenant_id)
    return [asdict(c) for c in pl.top_customers_by_ltv]


@router.get("/analytics/{tenant_id}/supplier-spend")
def supplier_spend(tenant_id: str, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    engine = CostEngine(db)
    pl = engine.compute_company_pl(tenant_id)
    return [asdict(s) for s in pl.top_suppliers_by_spend]


# ════════════════════════════════════════════════════════════════
# CAPACITY PLANNING
# ════════════════════════════════════════════════════════════════

@router.get("/analytics/{tenant_id}/capacity")
def capacity_report(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = CapacityPlanningEngine(db)
    report = engine.build_report(tenant_id)
    return {
        "tenant_id": report.tenant_id,
        "generated_at": report.generated_at.isoformat(),
        "overall_utilization_pct": report.overall_utilization_pct,
        "headroom_pct": report.headroom_pct,
        "summary": report.summary,
        "people_utilizations": [asdict(u) for u in report.people_utilizations],
        "line_utilizations": [asdict(u) for u in report.line_utilizations],
        "material_reorders": [asdict(r) for r in report.material_reorders],
        "bottlenecks": [asdict(b) for b in report.bottlenecks],
    }


# ════════════════════════════════════════════════════════════════
# RISK SCORING
# ════════════════════════════════════════════════════════════════

@router.get("/analytics/{tenant_id}/risk-leaderboard")
def risk_leaderboard(
    tenant_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = RiskScoringEngine(db)
    board = engine.score_tenant(tenant_id, limit=limit)
    return {
        "tenant_id": board.tenant_id,
        "generated_at": board.generated_at.isoformat(),
        "total_entities_scored": board.total_entities_scored,
        "critical_count": board.critical_count,
        "high_count": board.high_count,
        "warning_count": board.warning_count,
        "rankings": [
            {
                "entity_id": r.entity_id,
                "entity_type": r.entity_type,
                "name": r.name,
                "composite_score": r.composite_score,
                "rating": r.rating,
                "top_driver": r.top_driver,
                "recommended_actions": r.recommended_actions,
                "signals": [asdict(s) for s in r.signals],
            }
            for r in board.rankings
        ],
    }


# ════════════════════════════════════════════════════════════════
# SLA MANAGER
# ════════════════════════════════════════════════════════════════

@router.get("/analytics/{tenant_id}/sla")
def sla_report(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    mgr = SLAManager(db)
    report = mgr.evaluate(tenant_id)
    return {
        "tenant_id": report.tenant_id,
        "generated_at": report.generated_at.isoformat(),
        "total_slas_evaluated": report.total_slas_evaluated,
        "total_entities_evaluated": report.total_entities_evaluated,
        "compliance_rate": report.compliance_rate,
        "breaches": [asdict(b) for b in report.breaches],
        "warnings": [asdict(w) for w in report.warnings],
    }


# ════════════════════════════════════════════════════════════════
# EXPORT ENGINE
# ════════════════════════════════════════════════════════════════

@router.get("/analytics/{tenant_id}/export.json")
def export_tenant_json(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = ExportEngine(db)
    return engine.export_tenant_json(tenant_id)


@router.get("/analytics/{tenant_id}/export.ndjson", response_class=PlainTextResponse)
def export_tenant_ndjson(tenant_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    engine = ExportEngine(db)
    return StreamingResponse(
        engine.stream_tenant_ndjson(tenant_id),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{tenant_id}_export.ndjson"',
        },
    )


@router.get("/analytics/{tenant_id}/export.csv", response_class=PlainTextResponse)
def export_entities_csv(
    tenant_id: str,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    engine = ExportEngine(db)
    csv_data = engine.export_entities_csv(tenant_id, entity_type=entity_type)
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{tenant_id}_entities.csv"',
        },
    )


@router.get("/analytics/{tenant_id}/customer-data/{entity_id}")
def export_customer_data(
    tenant_id: str, entity_id: str, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """GDPR per-customer data export."""
    engine = ExportEngine(db)
    result = engine.export_customer_data(tenant_id, entity_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ════════════════════════════════════════════════════════════════
# DEEP HEALTH
# ════════════════════════════════════════════════════════════════

_health_engine = HealthCheckEngine()


@router.get("/health")
async def deep_health() -> Dict[str, Any]:
    report = await _health_engine.run()
    return {
        "overall_status": report.overall_status,
        "checked_at": report.checked_at.isoformat(),
        "uptime_seconds": report.uptime_seconds,
        "components": [asdict(c) for c in report.components],
    }


@router.get("/healthz")
async def liveness() -> Dict[str, str]:
    """Simple liveness probe — returns 200 if the process is up."""
    return {"status": "alive"}


@router.get("/readyz")
async def readiness() -> Dict[str, Any]:
    """Kubernetes readiness probe — fails if any component is down."""
    report = await _health_engine.run()
    if report.overall_status == "down":
        raise HTTPException(status_code=503, detail={
            "status": "not_ready",
            "components": [asdict(c) for c in report.components if c.status == "down"],
        })
    return {"status": "ready", "overall": report.overall_status}
