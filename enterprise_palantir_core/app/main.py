import os

from fastapi import FastAPI

from app.api.advanced import router as advanced_router
from app.api.analytics import router as analytics_router
from app.api.command_center import router as command_center_router
from app.api.engines import router as engines_router
from app.api.governance import router as governance_router
from app.api.ingest import router as ingest_router
from app.api.intelligence import router as intelligence_router
from app.api.live import router as live_router
from app.api.ontology import router as ontology_router
from app.api.platform import router as platform_router
from app.api.security import router as security_router
from app.api.spatial import router as spatial_router
from app.api.ws import router as ws_router
from app.config import settings
from app.db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
    )

    Base.metadata.create_all(bind=engine)

    # Seed the database on first boot (or when FORCE_SEED=true).
    try:
        from app.seed.seed_runner import register_policies_on_engine, seed_if_needed

        force = os.environ.get("FORCE_SEED", "").lower() in ("1", "true", "yes")
        seed_summary = seed_if_needed(force=force)
        print(f"[startup] seed: {seed_summary}")

        # Register catalog policies on the global policy engine.
        from app.api.engines import _get_policy_engine
        policy_engine = _get_policy_engine()
        registered = register_policies_on_engine(policy_engine)
        print(f"[startup] registered {registered} catalog policies")
    except Exception as exc:
        print(f"[startup] seed/policy registration failed (non-fatal): {exc}")

    # Initialize the connector registry (seeds the default Techno-Kol Uzi
    # connectors on first access).
    try:
        from app.engines.connector_registry import get_connector_registry
        reg = get_connector_registry()
        print(f"[startup] connector registry: {len(reg.all())} connectors registered")
    except Exception as exc:
        print(f"[startup] connector registry init failed: {exc}")

    # Register the default scheduler jobs. The scheduler itself is not
    # started here — it's started in the FastAPI @app.on_event("startup")
    # handler below, because asyncio loop only exists once the app is up.
    try:
        from app.engines.scheduler import get_scheduler, register_default_jobs
        scheduler = get_scheduler()
        register_default_jobs(scheduler)
        print(f"[startup] scheduler: {len(scheduler.all())} jobs registered")
    except Exception as exc:
        print(f"[startup] scheduler init failed: {exc}")

    @app.on_event("startup")
    async def _start_scheduler() -> None:
        try:
            from app.engines.health_check import HealthCheckEngine
            from app.engines.job_queue import get_job_queue
            from app.engines.scheduler import get_scheduler
            HealthCheckEngine.start()
            await get_scheduler().start()
            print("[startup] scheduler loop started")
            await get_job_queue().start()
            print("[startup] job queue workers started")
        except Exception as exc:
            print(f"[startup] scheduler/queue loop failed: {exc}")

    @app.on_event("shutdown")
    async def _stop_scheduler() -> None:
        try:
            from app.engines.job_queue import get_job_queue
            from app.engines.scheduler import get_scheduler
            await get_scheduler().stop()
            await get_job_queue().stop()
        except Exception:
            pass

    app.include_router(ingest_router)
    app.include_router(ontology_router)
    app.include_router(live_router)
    app.include_router(command_center_router)
    app.include_router(engines_router)
    app.include_router(platform_router)
    app.include_router(intelligence_router)
    app.include_router(analytics_router)
    app.include_router(advanced_router)
    app.include_router(security_router)
    app.include_router(governance_router)
    app.include_router(spatial_router)
    app.include_router(ws_router)

    @app.get("/")
    def root():
        return {
            "app": settings.app_name,
            "version": settings.app_version,
            "status": "running",
            "components": {
                "ontology": True,
                "event_bus": True,
                "realtime_state": True,
                "workflows": True,
                "alerts": True,
                "policies": True,
                "actions": True,
                "audit": True,
                "multi_tenant": True,
                "ai_context": True,
                "graph_traversal": True,
                "command_center": True,
                "ai_orchestrator": True,
                "claude_adapter": True,
                "cdc_framework": True,
                "connector_registry": True,
                "scheduler": True,
                "notification_service": True,
                "simulation_engine": True,
                "dashboard_exporter": True,
                "anomaly_detection": True,
                "forecast_engine": True,
                "vector_search": True,
                "replay_engine": True,
                "data_quality_engine": True,
                "metrics_exporter": True,
                "cli_tool": True,
                "cost_engine": True,
                "capacity_planning": True,
                "risk_scoring": True,
                "sla_manager": True,
                "export_engine": True,
                "deep_health": True,
                "graphql_layer": True,
                "document_store": True,
                "full_text_index": True,
                "webhook_receiver": True,
                "batch_ingest": True,
                "job_queue": True,
                "api_key_vault": True,
                "rate_limiter": True,
                "request_tracer": True,
                "encryption_vault": True,
                "backup_engine": True,
                "template_engine": True,
                "feature_flags": True,
                "user_directory": True,
                "query_dsl": True,
                "data_catalog": True,
                "geospatial_engine": True,
                "timeline_playback": True,
                "dependency_analyzer": True,
                "scenario_planner": True,
                "kafka_ready": True,
                "redis_ready": True,
            },
        }

    return app


app = create_app()
