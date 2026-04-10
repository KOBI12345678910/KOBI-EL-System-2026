# Enterprise Palantir-style Core Platform

A Python/FastAPI/SQLAlchemy production foundation for a real-time
operational intelligence platform. This is the skeleton you send to
Claude (or Replit Claude) to continue building an enterprise-grade
ontology + event + state + workflow system on top of.

## The 12 Core Components

| # | Component | Where |
|---|---|---|
| 1  | **Ontology**          | `models/ontology.py`, `services/ontology_service.py`, `api/ontology.py` |
| 2  | **Event Bus**         | `event_bus.py` (in-process async pub/sub, "*" wildcard) |
| 3  | **Realtime State**    | `models/state.py`, `services/state_service.py` (state engine) |
| 4  | **Workflows**         | `models/workflow.py`, `services/workflow_service.py`, `api/workflows.py` |
| 5  | **Actions**           | `services/action_service.py` (guardrails + approval + rollback) |
| 6  | **Audit**             | `models/audit.py`, `repositories/audit_repo.py` (hash-chained immutable) |
| 7  | **Multi-tenant**      | `models/base.py` TenantMixin + `security.py` + every repo filters by `tenant_id` |
| 8  | **AI hooks**          | `services/ai_context_service.py` (Claude-ready context packets) |
| 9  | **Command Center**    | `services/snapshot_service.py` + `GET /live/snapshot/{tenant}` |
| 10 | **Data connectors**   | `services/ingestion_service.py` + `POST /ingest/record` + `/ingest/webhook/{src}` |
| 11 | **Permissions**       | `security.py` + `models/permissions.py` + `services/permission_service.py` |
| 12 | **Alerts**            | `models/alerts.py`, `services/alert_service.py`, `api/alerts.py` |

## Structure

```
enterprise_palantir_core/
├── app/
│   ├── main.py                 FastAPI entry, wires all routers
│   ├── config.py               Settings (DATABASE_URL, etc.)
│   ├── db.py                   SQLAlchemy engine + session factory + Base
│   ├── security.py             Principal + Permission + check()
│   ├── event_bus.py            Async in-process pub/sub
│   ├── websocket_hub.py        Per-tenant WebSocket fan-out
│   │
│   ├── core/
│   │   ├── enums.py            Severity, EventType, AlertStatus, ...
│   │   ├── ids.py              new_id, canonical_id, audit_id, ...
│   │   ├── time_utils.py       utc_now, seconds_since, is_stale
│   │   └── exceptions.py       PlatformError, PermissionDenied, ...
│   │
│   ├── models/                 SQLAlchemy 2.0 ORM
│   │   ├── base.py             TimestampMixin + TenantMixin
│   │   ├── tenant.py
│   │   ├── ontology.py         OntologyObject + OntologyRelationship
│   │   ├── events.py           DomainEvent + LineageRecord
│   │   ├── state.py            EntityStateRow
│   │   ├── workflow.py         WorkflowDefinition/Instance/TransitionLog
│   │   ├── audit.py            AuditLogEntry (hash-chained)
│   │   ├── permissions.py      User + Role + UserRole
│   │   └── alerts.py           Alert + AlertRule
│   │
│   ├── schemas/                Pydantic I/O
│   │   ├── ingest.py           IngestRecord, IngestResult, IngestBatchRequest
│   │   ├── ontology.py         OntologyObjectRead, OntologyRelationshipRead
│   │   ├── events.py           DomainEventRead, LineageRead
│   │   ├── state.py            EntityStateRead
│   │   ├── workflow.py         WorkflowDefinitionCreate/Read, WorkflowInstanceStart/Read
│   │   └── snapshot.py         CompanySnapshot, EntityTimeline, AIContextResponse
│   │
│   ├── repositories/           SQLAlchemy-only layer
│   │   ├── tenant_repo.py
│   │   ├── ontology_repo.py
│   │   ├── event_repo.py       DomainEvent + Lineage
│   │   ├── state_repo.py
│   │   ├── workflow_repo.py
│   │   ├── audit_repo.py       append + verify_chain
│   │   └── alert_repo.py       raise_or_increment + ack + resolve
│   │
│   ├── services/               Domain logic
│   │   ├── ingestion_service.py  7-step end-to-end orchestrator
│   │   ├── ontology_service.py
│   │   ├── lineage_service.py
│   │   ├── state_service.py      Event → state transitions
│   │   ├── workflow_service.py   State machine runtime
│   │   ├── alert_service.py      Rule engine for alerts
│   │   ├── permission_service.py
│   │   ├── ai_context_service.py Claude-ready context builder
│   │   ├── snapshot_service.py   Command center picture
│   │   └── action_service.py     Autonomous actions with guardrails
│   │
│   └── api/                    FastAPI routers
│       ├── ingest.py           POST /ingest/record | /batch | /webhook/{src}
│       ├── ontology.py         GET /entities/{id} + /entities?tenant_id
│       ├── live.py             GET /live/snapshot | /events | /timeline | /ai-context
│       ├── workflows.py        POST /workflows/definitions | /instances | /transition
│       ├── alerts.py           GET /alerts/{tenant}/open | /critical ; POST ack | resolve
│       └── ws.py               WS /ws/{tenant_id}
│
└── requirements.txt
```

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open:
- **OpenAPI docs**: http://localhost:8000/docs
- **Root**: http://localhost:8000/ → lists the 12 components

## Try it

### 1. Ingest a supplier-delayed event

```bash
curl -X POST http://localhost:8000/ingest/record \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant_alpha",
    "source_system": "procurement_api",
    "source_record_id": "supplier_event_001",
    "entity_type": "Supplier",
    "entity_name": "Steel Imports Ltd",
    "canonical_external_key": "SUPP-001",
    "event_type": "supplier_delayed",
    "severity": "high",
    "properties": {"status": "at_risk", "delay_days": 5},
    "relationships": {"supplies_projects": ["obj_project_001"]}
  }'
```

Response:
```json
{
  "canonical_entity_id": "obj_2ee9c9a7bc33c0dcdf5acadc",
  "event_id": "evt_...",
  "status": "ingested",
  "is_new_entity": true
}
```

### 2. Get the live company snapshot

```bash
curl http://localhost:8000/live/snapshot/tenant_alpha
```

You will see:
- `total_objects: 1`
- `at_risk_entities: 1`
- `open_alerts_count: 1`  (← auto-raised by the alert rule engine)
- `status_breakdown: {"at_risk": 1}`
- `object_breakdown: {"Supplier": 1}`
- the full event in `recent_events`

### 3. Get the entity timeline

```bash
curl http://localhost:8000/live/timeline/obj_2ee9c9a7bc33c0dcdf5acadc
```

### 4. Get Claude-ready AI context

```bash
curl "http://localhost:8000/live/ai-context/obj_2ee9c9a7bc33c0dcdf5acadc?tenant_id=tenant_alpha"
```

### 5. Subscribe to the WebSocket

```js
const ws = new WebSocket("ws://localhost:8000/ws/tenant_alpha");
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

Every ingestion will broadcast a `{type: "domain_event", event: {...}}` frame.

## The real-time operating model

Every record flows through:

```
POST /ingest/record
    │
    ├─ lineage: raw_ingestion
    ├─ canonical_id = sha256(tenant + type + external_key)
    ├─ OntologyService.upsert_object()        → ontology_objects + ontology_relationships
    ├─ lineage: ontology_hydration
    ├─ EventRepository.append()               → domain_events (append-only)
    ├─ lineage: event_emitted
    ├─ StateService.apply_event()             → entity_states (upsert)
    ├─ AlertService.evaluate_event()          → alerts (rule engine)
    ├─ EventBus.publish()                     → in-process subscribers
    └─ WebSocketHub.broadcast()               → every /ws/{tenant_id} client
```

Everything is **multi-tenant**: every model carries `tenant_id`, every
repo has `list_by_tenant`, the WebSocket hub is per-tenant.

## Next steps (what the platform still needs)

- Postgres (set `DATABASE_URL=postgresql://...` and install `psycopg2-binary`)
- Kafka / Redis for horizontal scaling (abstractions already exist in
  the sibling `palantir_realtime_core/` project)
- More AlertRules loaded from the DB instead of built-in
- Claude API adapter (drop in your `ANTHROPIC_API_KEY`)
- A frontend command center that consumes `/live/snapshot/{tenant}`

## Verified end-to-end

55 Python files, zero syntax errors. End-to-end tested with a
`supplier_delayed` ingestion that:
- creates a new ontology object
- emits a domain event
- transitions the entity state to `at_risk` with `risk_score=0.85`
- auto-raises a high-severity alert via the built-in rule engine
- returns everything in the company snapshot
