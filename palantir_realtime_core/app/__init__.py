"""
Palantir-Style Realtime Data Core.

A Python/FastAPI production foundation for a real-time operational
intelligence platform with:

- Event-driven ingestion (REST + webhooks)
- In-process EventBus (async pub/sub)
- Ontology store (objects + relationships + properties)
- Live state store (per-entity operational state)
- Event store (replayable domain event log)
- Lineage store (provenance tracking)
- WebSocket fan-out for live updates
- AI context builder (Claude-ready enterprise context)
- Multi-tenant isolation at every layer
"""

__version__ = "1.0.0"
