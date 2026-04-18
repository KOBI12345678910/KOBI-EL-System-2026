from dataclasses import dataclass


@dataclass
class Settings:
    app_name: str = "Palantir-Style Realtime Data Core"
    app_version: str = "1.0.0"
    websocket_channel_limit: int = 1000
    max_recent_events_per_entity: int = 100
    max_recent_global_events: int = 5000


settings = Settings()
