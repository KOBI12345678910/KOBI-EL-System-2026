from fastapi import FastAPI

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

    app.include_router(ingest_router)
    app.include_router(ontology_router)
    app.include_router(live_router)
    app.include_router(engines_router)
    app.include_router(ws_router)

    @app.get("/")
    def root():
        return {
            "app": settings.app_name,
            "version": settings.app_version,
            "status": "running",
        }

    return app


app = create_app()
