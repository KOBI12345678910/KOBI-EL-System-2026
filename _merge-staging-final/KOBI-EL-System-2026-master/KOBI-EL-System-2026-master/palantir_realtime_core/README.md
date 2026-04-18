# Palantir-Style Realtime Data Core

A Python/FastAPI production foundation for a real-time operational
intelligence platform. This is not a toy demo — it is a minimal but
correct core that you can deploy on Replit (or any Python host) and
build a real ERP / digital-twin platform on top of.

## What it provides

- **FastAPI** REST backend
- **WebSocket** live fan-out (per tenant)
- **In-process EventBus** (async pub/sub)
- **Event Store** (replayable, per-entity + per-tenant indexes)
- **State Store** (live operational state per entity)
- **Ontology Store** (objects + relationships + properties + freshness)
- **Lineage Store** (provenance across ingestion steps)
- **Ingestion Service** (canonical ID + ontology hydration + event emission)
- **AI Context Builder** (Claude-ready enterprise context packets)
- **Multi-tenant** isolation in every store and every endpoint

It is **not** a clone of Palantir Foundry — it is the right **skeleton**
to grow into that category of platform.

## Structure

```
palantir_realtime_core/
├── app/
│   ├── main.py              FastAPI entry + event wiring
│   ├── config.py            Settings dataclass
│   ├── models.py            Pydantic models (IngestRecord, DomainEvent,
│   │                        OntologyObject, EntityState, LineageRecord, ...)
│   ├── stores.py            In-memory stores (swappable with Postgres/Redis)
│   ├── event_bus.py         Async pub/sub EventBus
│   ├── state_engine.py      Event -> EntityState transition rules
│   ├── ontology.py          Ontology upsert logic
│   ├── lineage.py           Lineage recording helper
│   ├── ingestion_service.py End-to-end record ingestion orchestrator
│   ├── ai_context.py        Claude-ready AI context builder
│   └── api/
│       ├── ingest.py        POST /ingest/record, /ingest/batch, /ingest/webhook/{src}
│       ├── entities.py      GET  /entities/{id}, /timeline, /lineage, /ai-context
│       ├── live.py          GET  /live/snapshot/{tenant_id}, /live/events/{tenant_id}
│       └── websocket.py     WS   /ws/{tenant_id}
│
├── samples/
│   └── supplier_delayed.json   Example ingestion payload
├── requirements.txt
├── .replit
├── replit.nix
└── README.md
```

## Quick start — local

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open:

- API docs: http://localhost:8000/docs
- Root health: http://localhost:8000/

## Quick start — Replit

1. Import this folder as a Replit project (or paste it in).
2. Press **Run**. The `.replit` file already runs
   `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
3. Replit exposes the running service on port 8000 automatically.

## Try it

### 1. Ingest a supplier-delayed event

```bash
curl -X POST http://localhost:8000/ingest/record \
  -H "Content-Type: application/json" \
  -d @samples/supplier_delayed.json
```

Response:

```json
{
  "canonical_entity_id": "obj_<hash>",
  "event_id": "evt_<uuid>",
  "status": "ingested"
}
```

### 2. Read the live company snapshot

```bash
curl http://localhost:8000/live/snapshot/tenant_alpha
```

### 3. Read the entity + state + timeline

```bash
curl http://localhost:8000/entities/<canonical_entity_id>
curl http://localhost:8000/entities/<canonical_entity_id>/timeline
curl http://localhost:8000/entities/<canonical_entity_id>/lineage
curl "http://localhost:8000/entities/<canonical_entity_id>/ai-context?tenant_id=tenant_alpha"
```

### 4. Subscribe to the live WebSocket

```js
// browser devtools console
const ws = new WebSocket("ws://localhost:8000/ws/tenant_alpha");
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

Every POST to `/ingest/*` now fans out to every WebSocket client of
the matching tenant.

## Real-time operating model

Every ingested record flows through:

```
POST /ingest/record
    │
    ├─ record_lineage("raw_ingestion")
    ├─ upsert_ontology_object()       ──► OntologyStore
    ├─ record_lineage("ontology_hydration")
    ├─ EventStore.append(DomainEvent)
    ├─ record_lineage("event_emitted")
    └─ event_bus.publish(event)
         ├─ handle_event_for_state()  ──► StateStore
         └─ broadcast to WebSocket    ──► every /ws/{tenant_id} client
```

## Multi-tenant isolation

- Every model carries `tenant_id`.
- Every store list method filters by `tenant_id`.
- WebSocket fan-out is per-tenant (`/ws/{tenant_id}`).
- AI context builder filters related entities by the caller's tenant.

## Replacing the in-memory stores

The `stores.py` module is intentionally in-memory. To go to production:

- Replace `OntologyStore` with a Postgres-backed repository.
- Replace `EventStore` with an append-only event store (Postgres + per-entity
  indexes, or Kafka + Kafka Streams, or EventStoreDB).
- Replace `StateStore` with Redis hash-sets keyed by tenant.
- Replace `LineageStore` with Postgres (with the schema from the
  TypeScript `data-platform-core.ts` side of this project).

The public interfaces (`upsert`, `get`, `list_by_tenant`, `append`,
`recent_for_entity`) stay the same.

## Next upgrades (roadmap)

1. PostgreSQL schema + SQLAlchemy models + Alembic migrations
2. Repository layer over SQLAlchemy
3. Kafka abstraction with dead-letter queue
4. Redis state cache with TTLs
5. CDC connector framework (PostgreSQL logical replication + Debezium)
6. Schema registry with versioning + compatibility checks
7. Identity resolution with fuzzy matching
8. Workflow runtime with state machines + approvals + escalations
9. Role / permissions layer with row-level filters
10. Immutable audit log (append-only, hash-chained)
11. Claude AI adapter that reads from `ai_context.build_ai_context()`
12. Horizontal scaling with Redis pub/sub for cross-pod WebSocket fan-out
