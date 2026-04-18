from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Enterprise Ontology Realtime Core"
    app_version: str = "1.0.0"

    database_url: str = "sqlite:///./enterprise_core.db"

    default_entity_freshness_seconds: int = 300
    realtime_snapshot_event_limit: int = 200
    max_entity_timeline_events: int = 500

    enable_demo_security: bool = True


settings = Settings()
