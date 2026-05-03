# Agent 162 — Plan-to-Manufacture Trace

**Date:** 2026-04-29
**Scope:** End-to-end trace of `Demand → Plan → BOM → Routing → Work Order → Operations → QC → Stock` across the canonical pipeline (`onyx-procurement/src/pipeline/*`), the manufacturing engine modules (`onyx-procurement/src/manufacturing/*`), the warehouse layer, and the live HTTP service (`techno-kol-ops`).
**Verdict:** SEVERE WIRING GAP — every Plan-to-Manufacture *engine* (BOM, routing, scheduler, capacity, QC, scrap, OEE) ships as standalone in-memory libraries with full unit tests but is never `require()`-d outside `test/`. The canonical pipeline (`pipeline-engine.js`, `state-machines.js`, `orchestrator.js`, `wiring-spec.js`) declares the flow, the live `techno-kol-ops` server exposes a thin work-orders CRUD over Postgres, and there is no bridge between them. Demand/MPS, BOM explode, routing-driven scheduling, finite-capacity planning, QC verdicts, and stock reservation are all dead code paths in production.

---

## 1. Step-by-Step Trace

### Step 1 — Demand
- **Pipeline declaration:** none. `pipeline-engine.js:16-30` lists 13 stages and there is no `demand` or `forecast` stage between `lead/quote` and `project`. Forecasting is filed under the terminal `closure` stage (`pipeline-engine.js:29`).
- **Engine present:** `onyx-procurement/src/forecasting/demand-forecaster.js` (multi-model ensemble, six methods, MAPE/MASE metrics).
- **Wired?** No. `Grep require\\(.*forecasting/demand` — only the file itself; the only other reference is a dead-menu migration `_delivery/.../00067_deactivate_dead_menu_items.sql:365`.
- **Gap:** No demand/forecast entity in `entity-map.js`, no `demand_plan` state machine, no orchestrator action, no API path in `wiring-spec.js`. Demand never feeds plan.

### Step 2 — Plan (Master Production Schedule / RCCP / capacity)
- **Pipeline declaration:** `project.in_planning` state (`state-machines.js:108`). Trigger `'in_planning→in_procurement'` fires `create_material_requests {fromBOM:true}`, `create_rfq`, `create_approvals` (`state-machines.js:122-126`).
- **Engine present:** `onyx-procurement/src/manufacturing/capacity-planning.js:1-48` — MPS, RCCP, MRP, CRP/CPP for an Israeli metal-fab work-week. `module.exports` at `:827`.
- **Wired?** No. `Grep require\\(.*capacity-planning` — only `test/manufacturing/capacity-planning.test.js:21`. Trigger params `{fromBOM:true}` are strings, never resolved by `orchestrator.js` (the orchestrator's effect handler at `:286` is documented "in production each would call real APIs" — placeholder).
- **Gap:** No MPS entity; `project.in_planning` has no link to capacity-planning, MPS, or `plan` API. There is no `/api/mps`, `/api/rccp`, `/api/cpp` in `wiring-spec.js` `ROUTE_GROUPS` (`wiring-spec.js:75-93`). Israeli holiday calendar inside the engine never feeds the live scheduler.

### Step 3 — BOM
- **Pipeline declaration:** Mentioned only as a trigger param: `state-machines.js:123` → `create_material_requests({ fromBOM: true })`.
- **Engine present:** `onyx-procurement/src/manufacturing/bom-manager.js:1-49` — multi-level explode, scrap-aware, alternates, ECO, where-used, costed BOM, `module.exports` at `:1858`.
- **Wired?** No. Only test reference (`test/manufacturing/bom-manager.test.js:31`). No BOM entity in `entity-map.js` (`Grep BOM` on entity-map and domain-model returns zero hits beyond the trigger-param string). No `bom` state machine. `material_request` is referenced in `wiring-spec.js:54-55` but its creation is never tied to a BOM explode call — the `create_material_requests` action key is undefined in `ORCHESTRATIONS` (`orchestrator.js`).
- **Gap:** No `/api/bom` in routes, no `/api/material-requests` (verified via Grep — returns zero matches in `onyx-procurement/src`). The trigger-side-effect chain `project.approved → in_planning → in_procurement` fires phantom actions.

### Step 4 — Routing
- **Pipeline declaration:** none.
- **Engine present:** `onyx-procurement/src/manufacturing/routing-manager.js:1-44` — defineWorkCenter, createRouting, computeLeadTime, computeCost, alternativeRouting, ten Israeli operation types (laser/plasma/CNC/bend/MIG-TIG/powder/galvanize/plating/assembly/QC). `module.exports` at `:543`.
- **Wired?** No. Only `test/manufacturing/routing-manager.test.js:26`.
- **Gap:** No `routing` entity in `entity-map.js`, no `work_center` entity, no `operation` entity. `work_order.assigned → in_progress` transition (`state-machines.js:153-155`) does not consume a routing — `wo` is plain text in DB (`techno-kol-ops/src/routes/workOrders.ts:14-32` selects raw rows). Routing-to-WO bridge missing.

### Step 5 — Work Order
- **Pipeline declaration:**
  - Stage `work_orders` (`pipeline-engine.js:22`).
  - Entity `work_order` (`entity-map.js:197-218`): 7 statuses `open|assigned|in_progress|waiting_materials|qa_check|done|signed_off`.
  - State machine `work_order` (`state-machines.js:149-171`): same 7 states + `cancelled`, transitions `assign|wait_material|start|qa|complete|fail|signoff|cancel`.
  - Orchestrations `work_order.start` (`orchestrator.js:150-160`), `work_order.signoff` (`:162-174`), `project.create_work_order` (`:80-91`).
  - API `/api/work-orders/...` (`wiring-spec.js:81`, `:198-203`).
- **Engine present:** `onyx-procurement/src/manufacturing/wo-scheduler.js:1-55` — finite-capacity forward/backward, critical-ratio dispatch, Gantt, OTD KPI, `module.exports` at `:2110`.
- **Live runtime:** `techno-kol-ops/src/routes/workOrders.ts:1-60` mounted at `/api/work-orders` from `techno-kol-ops/src/index.ts:143`. Reads `work_orders` joined to `clients` and `work_order_employees`; no routing column, no operations array.
- **Wired?** Partially. CRUD over Postgres exists; the canonical state machine, the orchestrator action, and the wo-scheduler engine are not invoked anywhere in the live route handler — Grep `require\\(.*state-machines|require\\(.*orchestrator|require\\(.*wo-scheduler` against `techno-kol-ops/src` returns zero. Status transitions go straight to `UPDATE work_orders SET status=...` with no guard from `state-machines.js:314 canTransition`.
- **Gap:** Two parallel "work order" concepts — pipeline's 7-state object vs. live DB row with free-form `status`. No enforcement of the state machine on PATCH.

### Step 6 — Operations (shop-floor execution)
- **Pipeline declaration:** Implicit — `work_order.in_progress` and `update_progress` action (`entity-map.js:212`, `wiring-spec.js:133`).
- **Engines present (none wired):** `oee-tracker.js`, `scrap-tracker.js`, `tool-tracker.js`, `welder-certs.js`, `heat-treat-log.js`, `material-cert.js`, `drawing-vc.js`. All `module.exports` set; only test files import them.
- **Wired?** No. There is no `operation` entity, no `work_order_task` API surface, no operation-level transitions in `state-machines.js`. Attendance is linked (`workflow-flows.js:99-100` Flow 5 step 1 `link_to_workorder`), but actuals never flow back into wo-scheduler's `updateProgress`.
- **Gap:** Operations are a single boolean `in_progress` instead of an ordered sequence with setup/run/queue/move and per-op start/end. OEE/scrap/tool engines never receive shop-floor events.

### Step 7 — QC
- **Pipeline declaration:**
  - Entity `quality_check` is **only** in `ontology.js:41`, `wiring-spec.js:55`, `domain-model.js:117` (as `has_many`), and as a link on `work_order` (`entity-map.js:200`).
  - Transition `work_order.in_progress → qa` triggers `create_quality_check` (`state-machines.js:163`).
  - API `'work_order.qa_check' → POST /api/quality-checks` (`wiring-spec.js:201`).
- **Engine present:** `onyx-procurement/src/manufacturing/qc-checklist.js:1-50` — MIL-STD-105E / ANSI Z1.4 sampling, AS9102 FAI, IAI/Elbit/Rafael C-of-C, Cpk control charts. Also `onyx-procurement/src/quality/fai.js`.
- **Wired?** No. There is no `/api/quality-checks` route handler — Grep across `techno-kol-ops/src` returns zero. `entity-map.js` does not declare `quality_check` as a top-level entity (no own `statuses`, `nextSteps`, `actions`). No state machine for `quality_check` in `state-machines.js`. The `create_quality_check` trigger emits a string action with no orchestrator binding.
- **Gap:** QC verdict (PASS/FAIL/REWORK) cannot drive WO state — `state-machines.js:155-156` allows `qa→completed` via `complete` and `qa→in_progress` via `fail`, but no engine produces those decisions. No NCR entity, no C-of-C document type registered in `entity-map.js` `document` (`:340-353`).

### Step 8 — Stock (inventory + reservation + issue)
- **Pipeline declaration:**
  - Stage `inventory` (`pipeline-engine.js:24`).
  - Trigger `project.in_procurement → in_execution`: `reserve_inventory` (`state-machines.js:129`).
  - Trigger `po.receive_items` orchestration: `update_inventory action:receipt`, `create warehouse_receipt`, `update_costing` (`orchestrator.js:135-148`).
  - Routes `'work_order.reserve_materials' → POST /api/inventory/reserve` (`wiring-spec.js:199`).
  - Route group `inventory` paths `/inventory/receive|issue|reserve|count` (`wiring-spec.js:86`).
- **Engine present:** `onyx-procurement/src/warehouse/wms.js:1-40` — bins, putaway, picking, kits, lot/serial trace, never-delete movement log.
- **Wired?** No. Grep `require\\(.*warehouse/wms|require\\(.*wms` outside the file shows only `test/payroll/wms.test.js:nn`. No `/api/inventory/...` route handler exists (Grep returns zero matches in `onyx-procurement/src` for `app\\.(get|post|patch).*inventory|/api/inventory`). `techno-kol-ops/src/routes/materials.ts` exists but handles `material_movements` only — does not call `wms.js`.
- **Gap:** Reservation, issue, and consumption against a WO's BOM are unimplemented at the route layer. `inventory_reservation` is a `has_many` in `wiring-spec.js:54-55` with no creator. `work_order.reserve_materials` posts to a non-existent endpoint.

---

## 2. Cross-Cutting Findings

### 2.1 Engine vs. Pipeline schism
The pipeline (`pipeline-engine.js`, `entity-map.js`, `state-machines.js`, `orchestrator.js`, `wiring-spec.js`) describes Plan-to-Manufacture as a 4-step CRUD-and-status flow on `project` and `work_order`. The manufacturing engines under `onyx-procurement/src/manufacturing/*` describe it as a 14-engine MES (MPS→RCCP→MRP→CRP→BOM→ECO→Routing→WC→Sched→Dispatch→Progress→OEE→Scrap→QC→C-of-C). The two are unconnected: **no `require` from the pipeline modules into `manufacturing/*`, no `require` from any HTTP route into `manufacturing/*`** (verified by Grep across `onyx-procurement/src` excluding `test/`).

### 2.2 Live runtime is shallower than the spec
`techno-kol-ops/src/routes/workOrders.ts` is a flat Postgres CRUD with free-form status updates. It does **not**:
- Validate transitions through `state-machines.js:314 canTransition`.
- Fire orchestrations from `orchestrator.js:270 executeOrchestration`.
- Reserve inventory (no warehouse module call).
- Run scheduling (no wo-scheduler call).
- Create or evaluate a quality check.

### 2.3 Two work-order schemas exist
- Canonical pipeline statuses (`entity-map.js:201`): `open|assigned|in_progress|waiting_materials|qa_check|done|signed_off`.
- Live DB column (`techno-kol-ops/supabase/SCHEMA_AUDIT.md:120` and `workOrders.ts:14`): free-form text.
- A separate table `production_work_orders` is referenced in `api-server/src/routes/anomaly-detection.ts:178`, `bi-comparative-analytics.ts:147,154`, `ceo-control-tower.ts:644`, `ml-pipeline.ts:12` — yet another distinct shape with `quantity_ordered`, `quantity_produced`, no relation to the canonical machine.

### 2.4 Trigger params are strings, not callbacks
`state-machines.js:117-146` describes triggers as `{action: 'create_material_requests', params: {...}}` but the side-effect runner in `orchestrator.js` only resolves a closed list of orchestration keys (`'project.create_work_order'`, etc.). Action strings like `create_material_requests`, `create_rfq`, `reserve_inventory`, `create_work_orders`, `create_quality_check`, `update_project_progress`, `calculate_wo_costs`, `check_delivery_ready` (all referenced in `state-machines.js`) have no orchestration entry. They are documentation, not behavior.

### 2.5 P0 contract violations
Per `CLAUDE.md` "9 Master 360 Pages — every page must have ... next recommended action": `WorkOrder360` lists `'run_qa', 'signoff'` as `primary_actions` (`wiring-spec.js:133`) — but the QC engine, the signature engine, and the cost-rollup engine that those actions imply are all unwired. The 360 page can render the buttons; the buttons cannot do their work.

---

## 3. Summary Table

| Step | Pipeline declared? | Engine exists? | Wired into HTTP? | Verdict |
|------|--------------------|----------------|-------------------|---------|
| Demand | No | `forecasting/demand-forecaster.js` | No | Missing stage; engine orphan |
| Plan (MPS/RCCP/CPP) | Stub (`project.in_planning`) | `manufacturing/capacity-planning.js` | No | Engine orphan |
| BOM | Trigger param only | `manufacturing/bom-manager.js` | No | Engine orphan |
| Routing | No | `manufacturing/routing-manager.js` | No | Engine orphan |
| Work Order | Yes (full) | `manufacturing/wo-scheduler.js` | Live CRUD only | Two schemas; no SM enforcement |
| Operations | Implicit | `oee/scrap/tool/welder/heat/drawing-vc` | No | All orphan |
| QC | Trigger only | `manufacturing/qc-checklist.js`, `quality/fai.js` | No | Endpoint missing |
| Stock | Triggers + paths | `warehouse/wms.js` | No | Endpoint missing |

---

## 4. Required Fixes (P0 to make Plan-to-Manufacture real)

1. **Bridge module** in `onyx-procurement/src/pipeline/` that `require`s `manufacturing/*` and `warehouse/wms.js` and exposes them through `orchestrator.js` effect handlers. Replace string actions (`create_material_requests`, `reserve_inventory`, `create_quality_check`) with real orchestration keys.
2. **Add entities** to `entity-map.js`: `bom`, `routing`, `work_center`, `operation`, `quality_check` (top-level), `material_request`, `inventory_reservation`. Each with statuses, nextSteps, actions, topFields, relatedSections per the No Dead Pages Rule.
3. **Add state machines** for `bom`, `quality_check` (states: `pending|in_progress|pass|fail|rework|approved|cof_c_issued`), `material_request`.
4. **Add HTTP routes** in `techno-kol-ops/src/routes/` (or under `onyx-procurement/src/routes/`): `/api/bom`, `/api/routings`, `/api/work-centers`, `/api/inventory/reserve`, `/api/inventory/issue`, `/api/quality-checks`, `/api/material-requests`, `/api/mps`, `/api/cpp`. Each must mount the corresponding engine module.
5. **Unify the work-order schema** — pick one of the three (canonical entity-map, `work_orders` column, `production_work_orders`) and migrate the others. Add an `operations` JSONB or related table driven by `routing-manager.operationList`.
6. **Add `demand` pipeline stage** between `quote` and `project` and an `MPS` entity that `capacity-planning.js` consumes; otherwise close out `forecasting/demand-forecaster.js` as documentation.
7. **Enforce `canTransition`** in every PATCH handler under `/api/work-orders`, `/api/projects`, `/api/quality-checks`. Currently `workOrders.ts` does raw `UPDATE`.

---

## 5. Files Referenced (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\pipeline-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\entity-map.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-machines.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\orchestrator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\workflow-flows.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\bom-manager.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\routing-manager.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\wo-scheduler.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\capacity-planning.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\qc-checklist.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\scrap-tracker.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\manufacturing\oee-tracker.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\warehouse\wms.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\forecasting\demand-forecaster.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\workOrders.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\index.ts`
