from __future__ import annotations

from fastapi import FastAPI

from app.api.entities import router as entities_router
from app.api.ingest import router as ingest_router
from app.api.live import router as live_router
from app.api.websocket import manager, router as websocket_router
from app.config import settings
from app.event_bus import event_bus
from app.models import DomainEvent
from app.state_engine import handle_event_for_state


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)


@app.on_event("startup")
async def startup_event() -> None:
    event_bus.subscribe("*", handle_event_for_state)
    event_bus.subscribe("*", broadcast_event_to_websocket)


async def broadcast_event_to_websocket(event: DomainEvent) -> None:
    await manager.broadcast(
        event.tenant_id,
        {
            "type": "domain_event",
            "event": event.model_dump(mode="json"),
        },
    )


app.include_router(ingest_router)
app.include_router(entities_router)
app.include_router(live_router)
app.include_router(websocket_router)


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "ok",
    }
