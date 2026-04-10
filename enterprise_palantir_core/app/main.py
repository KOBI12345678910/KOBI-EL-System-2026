"""
FastAPI entry point.

Wires every router into the app, creates tables on startup, and
exposes `/` for a health check + `/docs` for the OpenAPI UI.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.alerts import router as alerts_router
from app.api.ingest import router as ingest_router
from app.api.live import router as live_router
from app.api.ontology import router as ontology_router
from app.api.workflows import router as workflows_router
from app.api.ws import router as ws_router
from app.config import settings
from app.db import create_all


app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.on_event("startup")
def on_startup() -> None:
    create_all()


app.include_router(ingest_router)
app.include_router(ontology_router)
app.include_router(live_router)
app.include_router(workflows_router)
app.include_router(alerts_router)
app.include_router(ws_router)


@app.get("/")
def root() -> dict:
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "ok",
        "components": [
            "ontology",
            "event_bus",
            "realtime_state",
            "workflows",
            "actions",
            "audit",
            "multi_tenant",
            "ai_hooks",
            "command_center",
            "data_connectors",
            "permissions",
            "alerts",
        ],
    }
