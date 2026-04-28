# AGENT-201 — SAP-Grade End-to-End Integration Audit

**Agent:** 201
**Date:** 2026-04-29
**Scope:** 9 Master 360 Pages — page→route→API→DB→orchestrator→state-machine wiring
**Methodology:** Static read of source files; no DB access. All paths are absolute findings.

---

## Executive Verdict

**System is NOT SAP-grade integrated.** The architecture documents (CLAUDE.md, wiring-spec.js, orchestrator.js, state-machines.js) describe a Palantir-grade ERP — but at the wiring layer, what exists on disk is a **proof-of-concept stack with three parallel, non-converging implementations** that do not talk to each other:

1. **`techno-kol-ops/client`** — React 360 pages calling `supabase.rpc("get_X_360_fast")`.
2. **`onyx-procurement/web`** — Static HTML 360 pages calling `POST /api/orchestrator/execute`.
3. **`erp-app/src/pages/.../v2/`** — React 360 pages calling REST `/purchase-orders/:id/approve` against api-server (Drizzle/PG) — separate DB schema entirely.

The orchestrator (`onyx-procurement/src/pipeline/orchestrator.js`) defines 18 actions but its HTTP route `/api/orchestrator/execute` is **never mounted** in `onyx-procurement/server.js`. The wiring spec defines 55 action→API mappings — most of those routes do not exist. The supabase RPCs the React 360 pages call (`get_X_360_fast`) exist only for **1 of 9 entities** (customer), and that one references read-model views (`analytics.rm_customer_360`) that are not defined in any migration.

**Summary by traffic light:**

| Pages | Verdict |
|---|---|
| GREEN — fully wired end-to-end | 0 / 9 |
| AMBER — partial wiring | 1 / 9 (Customer360) |
| RED — broken / mocked / missing dependencies | 8 / 9 |

---

## Methodology

For each 360 page I checked:
1. **Page exists?** — file present in any client.
2. **Calls real backend?** — checked `fetch`, `api.post`, `supabase.rpc` calls in the page that the router actually loads.
3. **Backend route exists?** — searched `api-server/src/routes/`, `onyx-procurement/server.js`, `techno-kol-ops/src/routes/`.
4. **Hits real DB?** — searched migrations/schemas for the referenced functions/tables.
5. **Action buttons → orchestrator?** — searched for orchestrator usage in the active 360 component.
6. **State-machine flow to next 360?** — read state-machines.js + orchestrator effect chain.

---

## Active 360 page set (the React Router-wired ones)

`techno-kol-ops/client/src/App.tsx` mounts:
- `/360/customer/:id` → `pages/360/Customer360.tsx`
- `/360/supplier/:id` → `pages/360/Supplier360.tsx`
- `/360/quote/:id` → `pages/360/Quote360.tsx`
- `/360/rfq/:id` → `pages/360/RFQ360.tsx`
- `/360/project/:id` → `pages/360/Project360.tsx`  (newer, supabase-only)
- `/project360/:id` → `pages/Project360.tsx`  (older, orchestrator-aware)
- `/360/work-order/:id` → `pages/360/WorkOrder360.tsx` (newer)
- `/work-order360/:id` → `pages/WorkOrder360.tsx` (older)
- `/360/po/:id` → `pages/360/PO360.tsx`
- `/360/finance/:id` → `pages/360/Finance360.tsx`
- `/360/employee/:id` → `pages/360/Employee360.tsx`

The newer `pages/360/*` set is what the user reaches via main nav. **All 9 of those pages were checked** — they are clones of one another with one supabase RPC call each and empty `onClick={() => {}}` for actions.

There is also `client/src/router/routeRegistry.ts` that imports from `features/X/X360.tsx` — those files are byte-clones of `pages/360/X360.tsx`. So the wiring conclusion below applies whether the routeRegistry is used or App.tsx routes win.

---

## Per-Page Audit

### 1. Customer360 — AMBER
- **Page:** `techno-kol-ops/client/src/pages/360/Customer360.tsx` (also `features/customers/Customer360.tsx`)
- **API call:** `supabase.rpc("get_customer_360_fast", { p_customer_id })`
- **Function exists:** YES — `analytics.get_customer_360_fast()` defined in `supabase/migrations/00018_rpc_control_rooms_and_360.sql:191`
- **DB tables referenced:** `analytics.rm_customer_360` (read model view) — **NOT defined in any migration**. Falls back through `commercial.customer_contacts`, `commercial.quotes`, `finance.invoices`, `docs.documents`, `intelligence.ai_insights` — those base tables exist (00000_master_schema.sql).
- **Schema exposure issue:** `supabase/config.toml` exposes `["public", "graphql_public"]` only. `analytics.*` is not in the PostgREST schemas list — the RPC will return a 404 unless `analytics` is added to `[api].schemas` or a `public.get_customer_360_fast()` wrapper is created. Neither exists.
- **Buttons:** Three navigate-only buttons (`navigate('/quote/new?customer=...')`). They navigate, they don't transact.
- **State-machine to next 360:** Navigation only — no orchestrator call, no transition recorded.
- **Verdict:** AMBER. The RPC is the only one of 9 that exists by name, but it (a) lives in a non-exposed schema and (b) references undefined read-model views.

### 2. Supplier360 — RED
- **Page:** `pages/360/Supplier360.tsx` + `features/procurement/Supplier360.tsx`
- **API call:** `supabase.rpc("get_supplier_360_fast", { p_supplier_id })`
- **Function exists:** **NO.** The DB has `procurement.rpc_get_supplier_360()` (00002:231) and `procurement.get_supplier_360_full()` (00012:70) — neither matches `get_supplier_360_fast`.
- **Buttons:** `navigate(/po/new...)`, `navigate(/rfq/new...)` — pure navigation.
- **Verdict:** RED. Page renders shell, RPC returns 404, content is empty.

### 3. Quote360 — RED
- **Page:** `pages/360/Quote360.tsx`
- **API call:** `supabase.rpc("get_quote_360_fast", { p_quote_id })`
- **Function exists:** **NO.** `commercial.rpc_get_quote_360()` exists (00002:303), but not `get_quote_360_fast`.
- **Buttons:** "Send to customer" / "Convert to order" — both `onClick={() => {}}` (no-op).
- **Orchestrator wiring:** Defined in `orchestrator.js` (`quote.approve`, `quote.convert_to_project`). The HTTP route is `/api/orchestrator/execute`, but the page never calls it.
- **State-machine:** `state-machines.js` defines `quote: draft → sent → approved → converted` with rich triggers (create_project, create_contract, create_tasks). None of this is reachable from the UI button (`onClick={() => {}}`).
- **Verdict:** RED. RPC missing, buttons are dead, state-machine unreachable.

### 4. RFQ360 — RED
- **Page:** `pages/360/RFQ360.tsx`
- **API call:** `supabase.rpc("get_rfq_360_fast", { p_rfq_id })`
- **Function exists:** **NO.** Only `procurement.rpc_get_rfq_360()` (00002:356).
- **Buttons:** "Send to suppliers" / "Decision" — both `onClick={() => {}}`.
- **Verdict:** RED.

### 5. Project360 — RED (overall) / AMBER (legacy `/project360/:id` route only)
- **Two pages, two routes:**
  - `pages/360/Project360.tsx` mounted at `/360/project/:id` — supabase RPC `get_project_360_fast` (DOES NOT EXIST). Buttons are pure navigation.
  - `pages/Project360.tsx` mounted at `/project360/:id` — calls `api.post('/api/orchestrator/execute', { entity:'project', action: actionId })` (line 314).
- **Orchestrator HTTP route:** `app.post('/api/orchestrator/execute', ...)` is defined inside `onyx-procurement/src/pipeline/orchestrator.js:326` but `registerOrchestratorRoutes()` is **never called** anywhere in `onyx-procurement/server.js`. Confirmed via grep: the function is exported but has zero callers across all `.js` files in the repo. The route does not actually exist at runtime.
- **`executeOrchestration` itself is a no-op:** lines 287–288 just push `{type, entity, status:'executed'}` into a result array — it does not run any `create`, `transition`, or `link` effects against the DB.
- **DB:** `execution.projects` table exists. `analytics.rm_project_360` (read model) does NOT exist.
- **Verdict:** RED. The newer page's RPC is missing; the legacy page's orchestrator endpoint isn't mounted; and even if mounted, it wouldn't write anything to the DB.

### 6. WorkOrder360 — RED
- **Same pattern as Project360.** Two pages exist (`pages/WorkOrder360.tsx` orchestrator-aware, `pages/360/WorkOrder360.tsx` supabase-only).
- **Function:** `get_work_order_360_fast` does NOT exist; only `execution.rpc_get_work_order_360` (00002:576) and `execution.get_work_order_360_full` (00012:195).
- **Orchestrator endpoint not mounted** — same dead-route issue.
- **Verdict:** RED.

### 7. PO360 — RED
- **Page:** `pages/360/PO360.tsx`
- **API call:** `supabase.rpc("get_po_360_fast", { p_po_id })`
- **Function exists:** **NO.** Only `procurement.rpc_get_po_360()` (00002:418).
- **Buttons:** "Approve" / "Send to supplier" — both `onClick={() => {}}`.
- **erp-app v2 alternative:** `erp-app/src/pages/procurement/v2/PurchaseOrder360.tsx` calls `apiSend("POST", "/purchase-orders/:id/approve", {})` — this targets a different backend (`api-server`) but route does not exist in `api-server/src/routes/purchase-orders.ts` either (no `/approve` endpoint found by grep).
- **Verdict:** RED.

### 8. Finance360 — RED
- **Page:** `pages/360/Finance360.tsx`
- **API call:** `supabase.rpc("get_finance_360_fast", { p_invoice_id })`
- **Function exists:** **NO.** `finance.rpc_get_finance_360()` (00002:654) takes no parameter, so even calling that wouldn't match the signature.
- **Buttons:** No primary actions defined (read-only display).
- **Verdict:** RED.

### 9. Employee360 — RED
- **Page:** `pages/360/Employee360.tsx`
- **API call:** `supabase.rpc("get_employee_360_fast", { p_employee_id })`
- **Function exists:** **NO.** `workforce.rpc_get_employee_360()` (00002:706) and `workforce.get_employee_360()` (00006:209) exist — neither is the `_fast` variant nor in `public`/`analytics`.
- **Buttons:** "Calculate salary" / "Vacation request" — both `onClick={() => {}}`.
- **Verdict:** RED.

---

## Cross-Cutting System Failures

### F1. RPC naming chaos (4 conflicting conventions in DB)
- `commercial.rpc_get_customer_360()` (00002)
- `commercial.get_customer_360()` (00006)
- `commercial.get_customer_360_full()` (00012)
- `analytics.get_customer_360_fast()` (00018)

The React clients call only `get_X_360_fast` (no schema prefix). Only ONE of the nine such functions is defined.

### F2. Schema not exposed to PostgREST
`supabase/config.toml:9` — `schemas = ["public", "graphql_public"]`. None of the schemas the 360 RPCs live in (`analytics`, `commercial`, `procurement`, `execution`, `finance`, `workforce`) are exposed. Even when an RPC exists, anonymous/authenticated keys cannot reach it.

### F3. Orchestrator HTTP route is dead code
`registerOrchestratorRoutes(app, deps)` in `onyx-procurement/src/pipeline/orchestrator.js:304` — exported but never imported by `server.js`. The route `/api/orchestrator/execute` returns 404. Even if it were mounted, `executeOrchestration` is a no-op (it builds a fake "effects_executed" log without touching the DB).

### F4. Wiring contracts (`/api/wiring/spec`, `/api/entity-map/:type`, `/api/state-machines/...`, `/api/pipeline/stages`) are not mounted
Per CLAUDE.md these are key APIs. None are registered in any server entry. `pipeline-engine.js`'s `registerPipelineRoutes()` has no caller. `wiring-spec.js`, `state-machines.js`, `entity-map.js` are pure data modules with no HTTP exposure.

### F5. Three parallel UIs, no canonical winner
- `techno-kol-ops/client` (React + supabase, the "active" UI per App.tsx).
- `onyx-procurement/web` (raw HTML, references `/api/orchestrator/execute`).
- `erp-app/src/pages/.../v2/` (React + Wouter + apiSend → api-server REST).

`AI-Task-Manager/artifacts/erp-app/` mirrors `erp-app/`. Each UI assumes a different backend convention (supabase RPC vs Express orchestrator vs Drizzle REST). None are end-to-end wired.

### F6. Two databases under "the system"
- Supabase: schemas `commercial`, `procurement`, `execution`, `finance`, `workforce` (per 00000_master_schema.sql).
- api-server (Drizzle/Postgres): tables like `rfqs`, `rfq_items`, `purchase_orders` (flat schema, see `api-server/src/routes/rfq.ts`).

The two stores are NOT linked. There is no replication or shared view. erp-app v2 talks to one; techno-kol-ops/client talks to the other.

### F7. Action buttons in the routed 360 pages are no-ops
Every primary action button in `pages/360/*` and `features/*/X360.tsx` uses `onClick={() => {}}` (literally empty). Only the legacy `pages/Project360.tsx` and `pages/WorkOrder360.tsx` post to the orchestrator — and that endpoint is unreachable.

### F8. State-machine triggers cannot fire from the UI
`state-machines.js` defines 91 transitions with rich side-effects (create_project, create_contract, notify, audit). These are pure data — they are not wired to:
- A persistence layer (no `state_machine_transitions` writer is exposed).
- The UI (the buttons that should fire transitions are no-ops).
- A scheduled processor.

`state-enforcement.js` is required by `server.js:184` but nothing currently invokes `enforceTransition()` from a route handler in the surveyed code.

---

## What Is SAP-Grade-Like (positives)

- The **schema design** (00000_master_schema.sql) is comprehensive: 237 tables across 23 domain schemas. This part is real.
- The **pipeline data modules** (orchestrator, state-machines, wiring-spec, entity-map) are well-structured — a proper blueprint, just not wired.
- `00002_secure_rpc_functions.sql` is a serious 1100-line attempt at secure RPCs with grants. The 9 `rpc_get_X_360` functions exist with proper `security definer` and grants — they just have the wrong names and live in non-exposed schemas.
- erp-app v2 procurement pages (`PurchaseOrder360.tsx`) are actually structured the right way (REST + react-query + invalidation) — the gap is just the missing api-server endpoints.

---

## Concrete fixes required to reach GREEN on each page

For each entity X in {customer, supplier, quote, rfq, project, work_order, po, finance, employee}:

1. **Add `public.get_X_360_fast(...)` wrapper** that delegates to the existing schema-prefixed RPC, OR add `analytics`, `commercial`, `procurement`, `execution`, `finance`, `workforce` to `supabase/config.toml` `[api].schemas`.
2. **Define the missing read-model views** referenced by 00018 (`analytics.rm_customer_360`, `analytics.rm_project_360`, `analytics.rm_workforce_leave_requests`).
3. **Mount the orchestrator route** in `onyx-procurement/server.js`: `require('./src/pipeline/orchestrator').registerOrchestratorRoutes(app, deps)`.
4. **Replace `executeOrchestration` no-op** with a real executor that invokes effect handlers per type (`create`, `transition`, `link`, `audit`, `notify`).
5. **Wire 360 page buttons** to either `supabase.rpc(<action>)` (where state-machine RPC exists in 00003_action_rpcs_and_state_machines.sql) or to `POST /api/orchestrator/execute`.
6. **Pick ONE UI** (`techno-kol-ops/client` is the most plausible canonical choice based on App.tsx structure). Decommission `erp-app` and `onyx-procurement/web`. Otherwise integration debt compounds.

---

## Final Verdict

**RED — System is NOT SAP-grade integrated.**

The blueprint is enterprise-grade (schemas, state machines, orchestrator definitions, page contracts). The execution is **demoware**: 8 of 9 360 pages call RPCs that do not exist by name; the orchestrator's HTTP entry point is unmounted dead code; the orchestrator's executor is a no-op stub; action buttons are empty handlers; the wiring/entity-map/pipeline APIs in CLAUDE.md are not registered; three competing UIs and two competing databases exist with no bridge.

**Score: 1 AMBER, 8 RED, 0 GREEN.**

To reach Palantir/SAP grade, this requires multi-week wiring work — not a documentation patch. The architecture is correct; the wiring is the gap.

---

**Files of interest:**
- `techno-kol-ops/client/src/App.tsx` (route mounts)
- `techno-kol-ops/client/src/pages/360/*.tsx` (active 360 pages)
- `techno-kol-ops/client/src/router/routeRegistry.ts` (alt registry, byte-clone pages)
- `onyx-procurement/server.js` (no orchestrator/pipeline mounts)
- `onyx-procurement/src/pipeline/orchestrator.js:304-335` (dead route registrar)
- `onyx-procurement/src/pipeline/wiring-spec.js` (55 unmounted action mappings)
- `onyx-procurement/src/pipeline/state-machines.js` (91 unreachable transitions)
- `supabase/migrations/00002_secure_rpc_functions.sql` (9 `rpc_get_X_360` — wrong name)
- `supabase/migrations/00006_read_models_and_360_rpcs.sql` (3 `get_X_360` — wrong name)
- `supabase/migrations/00012_rpc_functions_core_block.sql` (4 `get_X_360_full` — wrong name)
- `supabase/migrations/00018_rpc_control_rooms_and_360.sql:191` (only `get_customer_360_fast`)
- `supabase/config.toml:9` (schemas list excludes business schemas)
- `erp-app/src/pages/procurement/v2/PurchaseOrder360.tsx` (alternative wired UI, alternative DB)
