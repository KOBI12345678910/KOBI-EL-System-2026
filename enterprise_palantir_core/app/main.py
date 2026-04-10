import os

from fastapi import FastAPI

from app.api.command_center import router as command_center_router
from app.api.engines import router as engines_router
from app.api.ingest import router as ingest_router
from app.api.live import router as live_router
from app.api.ontology import router as ontology_router
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

        # Register catalog policies on the global policy engine
        # used by the ActionEngine in app/api/engines.py.
        from app.api.engines import _get_policy_engine
        policy_engine = _get_policy_engine()
        registered = register_policies_on_engine(policy_engine)
        print(f"[startup] registered {registered} catalog policies")
    except Exception as exc:
        print(f"[startup] seed/policy registration failed (non-fatal): {exc}")

    app.include_router(ingest_router)
    app.include_router(ontology_router)
    app.include_router(live_router)
    app.include_router(command_center_router)
    app.include_router(engines_router)
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
                "kafka_ready": True,
                "redis_ready": True,
            },
        }

    return app


app = create_app()
