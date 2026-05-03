# AGENT-26 — Deep Audit: `onyx-procurement/src/pipeline/pipeline-engine.js`

**Scope:** single file (568 LOC).
**Method:** static read + `node --check` + cross-grep for callers, schema, and event consumers.

## Status

**AMBER.** File parses clean (`node --check` exit 0), exports are well-formed, and `registerPipelineRoutes` wires 14 endpoints. However the engine is structurally **incomplete vs. CLAUDE.md** in two material ways:

1. The Master Flow per CLAUDE.md has 13 stages — the constant defines **only 12** (the `approval` stage exists but the Master Flow lists 13: Lead, Quote, Approval, Order, Project, Work Orders, Procurement, Inventory, Execution, Delivery, Invoice, Payment, Closure). Recount: file has 13 entries — the missing one is **`execution`** in spirit, but it IS present. The real miss is one stage labelled correctly but mismatched with the rest: see Issues #1.
2. `EVENT_TRIGGERS` has **no consumer**: `POST /api/pipeline/trigger` only logs and returns "queued" — no listener executes the actions. This is a stub, not an engine.

Plus three Supabase tables (`pipeline_items`, `pipeline_transitions`, `pipeline_events`) are referenced by routes but **no migration in `onyx-procurement` creates them**. The schema lives in `techno-kol-ops` and uses a different shape — every DB-backed route 500s on a fresh procurement DB.

## Stages-found

13 entries in `PIPELINE_STAGES`:

| # | id | service | matches Master Flow? |
|---|---|---|---|
| 1 | lead | ops | yes |
| 2 | quote | procurement | yes |
| 3 | approval | procurement | yes |
| 4 | order | ops | yes |
| 5 | project | ops | yes |
| 6 | work_orders | ops | yes |
| 7 | procurement | procurement | yes |
| 8 | inventory | ops | yes |
| 9 | execution | ops | yes |
| 10 | delivery | ops | yes |
| 11 | invoice | procurement | yes |
| 12 | payment | procurement | yes |
| 13 | closure | ai | yes |

Count is correct (13). **No stage missing.** Original concern in the task brief was unfounded for stage count; real defects are in the trigger layer and DB schema (below).

## Broken-triggers

`EVENT_TRIGGERS` has 11 events. None of their listed `actions` are executed.

| event | actions declared | actually run? |
|---|---|---|
| quote_approved | 6 (create_project, create_contract, …) | no — only logged |
| lead_converted | 4 | no |
| project_in_procurement | 4 | no |
| project_created | 4 | no |
| po_received | 4 | no |
| po_sent | 4 | no |
| work_order_assigned | 3 | no |
| work_order_complete | 4 | no |
| invoice_issued | 5 | no |
| payment_received | 5 | no |
| delivery_complete | 4 | no |

The handler at L497–521 inserts a row into `pipeline_events` and replies `{action, status:'queued'}` — it never dispatches to `orchestrator.js` (which holds the 18 executable actions) or fires anything. No `EVENT_TRIGGERS[…].actions[…]` lookup exists outside `pipeline-engine.js` itself. Grep across `onyx-procurement/src` confirms no other module consumes the event names.

`POST /api/pipeline/items/:id/advance` (L432) advances the stage but never emits the corresponding event (e.g. moving into `procurement` should fire `project_in_procurement`). Stage transitions and event triggers are two disjoint code paths.

## Issues

1. **DB schema missing in service.** Routes at L399, L410, L432, L453, L467, L477, L508, L523 reference tables `pipeline_items`, `pipeline_transitions`, `pipeline_events`. No `onyx-procurement` migration defines them. `techno-kol-ops/src/db/schema.sql:430` defines `pipeline_events` only, with columns (`project_id`, `stage`) that don't match what this file inserts (`event_type`, `entity_type`, `actions_triggered`). Result: 500 on Supabase from the very first call.

2. **Trigger handler is a stub.** L502–504 builds `{action, status:'queued', message:…}` strings — no executor. CLAUDE.md says `POST /api/orchestrator/execute` is the executor; nothing here calls it.

3. **No bridge from stage advance → event.** Advancing a pipeline_item to `procurement` does not fire `project_in_procurement`. The two systems are wired separately in the UI but not in code.

4. **Missing actor middleware.** `req.actor` is used on L424, L427, L457, L461, L514, L517 but no route sets it. Falls back to `'api'` everywhere — audit log loses provenance. (Other modules under `src/approvals`, `src/ai-bridge` use the field similarly, so a global middleware is expected but not present in this file's chain.)

5. **`/api/pipeline/items/:id/advance` lacks state-machine validation.** It blindly advances to the next array index regardless of `state-machines.js` allowed transitions. A `quote` item can jump straight to `closure` if the body sets `next_stage:'closure'` and the string is in the array.

6. **`pipeline_events` insert payload mismatches OPS schema.** If a future merge unifies DBs, columns `event_type`, `actions_triggered`, `triggered_by` collide with the OPS columns `stage`, `project_id`. Migration drift will be silent until production.

7. **No `try/catch` around `supabase.insert(...).select()`** on L453, L508. Errors swallow into rejected promises that leak from the request handler — Express returns a generic 500 with no logging.

8. **`/api/pipeline/health` hardcodes `localhost`.** Cross-service checks (L544, L550) won't work in container/Docker/Replit deployments. Should use env vars (`OPS_URL`, `AI_URL`).

9. **`payroll.status = 'up'` is faked** (L555). Health endpoint claims payroll up regardless of actual state — misleading dashboards.

10. **`SYSTEM_LAYERS`, `SYSTEM_MENU`, `ENTITY_PAGES`, `ENTITY_STATUSES` exported but only `SYSTEM_LAYERS`, `SYSTEM_MENU`, `EVENT_TRIGGERS`, `ENTITY_PAGES`, `ENTITY_STATUSES`, `PIPELINE_STAGES`, `ENTITY_RELATIONS`, `SERVICE_TOPOLOGY` reach `module.exports` (L563)** — fine, no undefined export. Note: `ENTITY_PAGES.po.relatedEntities` references `delivery_notes` which has no entity row in `ENTITY_RELATIONS` and no menu link — dead reference but not fatal.

11. **No syntax issues.** `node --check` passes. RTL Hebrew strings inside JS string literals are fine; modules load via CJS.

## Fixes

P0 (functional):

- **Add migration** `onyx-procurement/sql/2026_xx_pipeline_engine.sql`:
  ```sql
  CREATE TABLE pipeline_items (id uuid PK, entity_type text, entity_id uuid, entity_name text,
    current_stage text, previous_stage text, customer_name text, value numeric,
    status text, created_by text, created_at timestamptz default now(), updated_at timestamptz);
  CREATE TABLE pipeline_transitions (id uuid PK, pipeline_item_id uuid FK, from_stage text,
    to_stage text, triggered_by text, notes text, created_at timestamptz default now());
  CREATE TABLE pipeline_events (id uuid PK, event_type text, entity_type text, entity_id uuid,
    payload jsonb, actions_triggered text[], triggered_by text, created_at timestamptz default now());
  ```
- **Wire trigger executor.** In `POST /api/pipeline/trigger`, after logging, iterate `trigger.actions` and call `orchestrator.execute(action, payload)` from `./orchestrator.js`. Collect real results, not stubs.
- **Emit events on advance.** In `POST /api/pipeline/items/:id/advance`, after updating `current_stage`, look up an event name keyed by `{from,to}` and POST to the trigger endpoint internally.

P1 (correctness):

- **Validate transitions** against `state-machines.js` in advance handler. Reject if `next_stage` is not in the allowed transitions for the current state.
- **Add actor middleware** at the registration call-site, or read from `req.headers['x-actor']` here as a fallback.
- **Wrap DB writes** in try/catch with `console.error` and proper 500 JSON payload.
- **Read service URLs from env** in `/api/pipeline/health`; replace fake `payroll.status='up'` with real probe (e.g. existence of `dist/index.html` already served).

P2 (cosmetic):

- Drop `delivery_notes` from `ENTITY_PAGES.po.relatedEntities` or add a row in `ENTITY_RELATIONS`.
- Document in file header that `EVENT_TRIGGERS` is a registry, not a dispatcher, until fix lands.

## Verdict

The engine is a **well-shaped registry** but only **half a runtime**. Stage list is complete; trigger executor and DB schema are not. Without the P0 fixes the file ships endpoints that 500 against Supabase and silently no-op every business event.
