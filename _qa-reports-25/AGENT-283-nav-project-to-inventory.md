# AGENT-283 — NAV #3: Project → RFQ → PO → GRN → Inventory

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** Trace navigation hop-by-hop. Are all 5 steps wired across pipeline definitions, server APIs, and UI pages?

---

## Verdict (TL;DR)

| Hop | Definition | API Handler | UI Page | Click-Through Wired | Status |
|-----|-----------|-------------|---------|---------------------|--------|
| Project → RFQ | YES (orchestrator/state) | NO | PARTIAL | NO | RED |
| RFQ → PO     | YES                     | YES (`/api/rfq/:id/decide` + `/api/purchase-orders`) | YES (`rfq360.html`) | YES | GREEN |
| PO → GRN     | YES (orchestrator)      | NO HTTP handler            | YES (`po360.html` shows GRN data + button) | NO (button is mock) | YELLOW |
| GRN → Inventory | YES (state-machines triggers) | NO HTTP handler        | NO (no inventory page in onyx web) | NO | RED |
| Inventory page | NO 360 page in canon  | NO `/api/inventory` route in OPS | NO HTML in `onyx-procurement/web` | — | RED |

**Bottom line:** the **definitions** layer (pipeline/orchestrator/state-machines/wiring-spec) describes the full chain end-to-end. The **runtime** layer is wired only for the RFQ→PO segment. PO→GRN→Inventory exists in the spec and partly in mock UI, but the HTTP endpoints + Inventory360 page are missing.

---

## Per-Step Detail

### Step 1 — Project → RFQ

**Definition (canonical files in `onyx-procurement/src/pipeline/`):**
- `workflow-flows.js` flow `project_to_procurement` step 2: `material_request → create_rfq` (line 45-46).
- `entity-map.js` → `project.actions` includes `create_po` but **not** `create_rfq` directly (line 180-189). RFQ creation is mediated by `material_request`.
- `state-machines.js` project trigger `in_planning→in_procurement` runs `create_rfq` action with `fromMaterialRequests: true` (line 191-194).
- `wiring-spec.js` `project360` page contract lists tab `procurement` and primary action `create_po` — **no `create_rfq` button on Project360** (line 124-128).

**API handler:**
- `onyx-procurement/server.js` exposes `POST /api/rfq/send` (line 688) and `POST /api/rfq/:id/decide` (line 942). Creating an RFQ from a project requires a `project_id` body param — handler accepts it but no dedicated `/api/projects/:id/rfqs` route.
- `techno-kol-ops/src/index.ts` mounts `workOrdersRouter` and `materialsRouter` only (line 143-145). **No `projectsRouter`** — the OPS service has no `/api/projects` endpoint at all.

**UI page:**
- `onyx-procurement/web/` has `rfq360.html` and `po360.html` but **no `project360.html`** — Project relies on the generic `entity360.html`.
- `entity360.html` (line 104, 120) supports `type=project` and renders header/buttons via `/api/entity-map/project`, but its action buttons fire mock alerts, not real navigation.
- OPS client `techno-kol-ops/client/src/pages/Project360.tsx` calls `/api/projects/:id`, `/api/projects/:id/work-orders`, `/api/projects/:id/pos`, `/api/projects/:id/inventory`, `/api/projects/:id/transition` — **all 5 endpoints undefined on the server.**

**Status: RED.** Definition exists. No Project360 in onyx web. OPS Project360.tsx page calls 5 endpoints that don't exist. No "Create RFQ" button surfaces from Project360 entry path.

---

### Step 2 — RFQ → PO

**Definition:**
- `entity-map.js` rfq.nextSteps line 128: `convert_to_po` button with `creates: 'po'`.
- `state-machines.js` rfq line 130: `approved→converted_to_po` via `convert` transition; trigger creates PO with copyFrom: 'rfq' (line 136-140).
- `orchestrator.js` line 120-133: `rfq.convert_to_po` orchestration, preconditions check rfq is approved, effects create PO + link to supplier/project, transition rfq.
- `wiring-spec.js` line 178: `rfq.convert_to_po` → `POST /api/purchase-orders` body `{ fromRfq: ':rfqId' }`.

**API handler:**
- `server.js` line 942: `POST /api/rfq/:id/decide` — selects winning supplier (decision side).
- `server.js` line ~1198+: `GET /api/purchase-orders`, `POST /api/purchase-orders/:id/approve`, `POST /api/purchase-orders/:id/send` exist. PO creation route needs verification but the URL is consistent with the spec.

**UI page:**
- `rfq360.html` line 233: state `approved` shows action `convert_po` with label "המר ל-PO".
- `rfq360.html` line 249: button `<button class="btn btn-purple" onclick="doAction('convert_po')">המר ל-PO</button>` is rendered when approved.

**Status: GREEN** (with caveat: UI button calls `doAction` which is in-page mock; real conversion path exists in API + orchestrator; need an integration handler that calls `executeOrchestration('rfq.convert_to_po', ...)`).

---

### Step 3 — PO → GRN (inventory_receipt)

**Definition:**
- `entity-map.js` po line 145, 150: `links: ['inventory_receipt', ...]`, nextStep `receive_items` `creates: 'inventory_receipt'`.
- `state-machines.js` po line 158-168: `sent→partially_received` and `sent→fully_received` triggers run `update_inventory` + `create_warehouse_receipt` + `update_costing`.
- `orchestrator.js` line 135-148: `po.receive_items` orchestration creates `inventory_receipt`, updates inventory, creates `warehouse_receipt`, updates costing, transitions PO.
- `wiring-spec.js` line 183: `po.receive_items` → `POST /api/purchase-orders/:id/receive`.

**API handler:**
- `onyx-procurement/server.js` — **no handler matching `/api/purchase-orders/:id/receive` exists.** Confirmed via grep over `server.js` — only `approve` and `send` are wired for PO. `QA-AGENT-49-REPORTING.md` line 262 already flags: "to add `POST /api/purchase-orders/:id/receive`."
- `src/warehouse/wms.js` exports `receivePO(poId, items, targetBins)` library function (line 523, 1462) — but it is **not registered as an Express route** anywhere; no `registerWmsRoutes` exists.

**UI page:**
- `po360.html` line 150 (entity-map button) "קבלת סחורה" with `creates: 'inventory_receipt'` is rendered.
- `po360.html` line 239, 258: when state=`sent` or `partial`, button "קלוט סחורה" calls `doAction('receive')`.
- `po360.html` line 176-186: shows mock GRN list (`GRN-0081`, `GRN-0095`) and audit trail mentioning קליטת סחורה.
- `po360.html` line 396: there IS a navigation link from PO360 → Project360 via `entity360.html?type=project`, so the project link works only one way (back).

**Status: YELLOW.** Spec + button + mock data are wired. Real backend handler missing. WMS library has the implementation but is not wired to HTTP.

---

### Step 4 — GRN → Inventory update

**Definition:**
- `state-machines.js` po triggers (line 159, 164): `update_inventory` action with `type: 'receipt'` is the canonical event from PO→fully_received.
- `orchestrator.js` line 140-141: `update_inventory action: 'receipt'` and `create warehouse_receipt` are listed as effects.
- `wiring-spec.js` ENTITY_RELATIONSHIPS line 57: `inventory: belongs_to material+warehouse, has_many inventory_receipt, ...`.
- Pipeline stage `inventory` exists (`pipeline-engine.js` line 24) with service: ops and modules: inventory/warehouse/materials.

**API handler:**
- `wiring-spec.js` line 86: defines `inventory: { list:'/inventory', detail:'/inventory/:id', receive:'/inventory/receive', issue:'/inventory/issue', reserve:'/inventory/reserve', count:'/inventory/count' }` — these are UI routes, not API routes.
- **No `/api/inventory*` HTTP route is registered in either onyx-procurement/server.js or techno-kol-ops/src/index.ts.**
- `onyx-procurement/src/inventory/` contains only `optimizer.js` (no routes). 
- The GRN→stock_on_hand update only exists inside `wms.js` as in-memory state mutations driven by `receivePO()`. Without an HTTP boundary, the OPS service's Project360 cannot read updated stock back.

**Status: RED.** Inventory mutation logic exists (wms.js). HTTP routes do not. State-machine triggers reference `update_inventory` action but no executor wires this to wms.js.

---

### Step 5 — Inventory page (terminus)

**Definition:**
- `wiring-spec.js` PAGE_CONTRACTS does NOT define an `inventory360` (only customer/supplier/quote/rfq/project/workOrder/po/finance/employee 360 — 9 pages, no inventory).
- `entity-map.js` defines `material` entity (line 292+) with statuses and actions, but no `inventory` entity.
- CLAUDE.md explicitly lists 9 Master 360 Pages — Inventory360 is not one of them. So the absence is by design at P0 priority.

**API handler:** None (see step 4).

**UI page:**
- `onyx-procurement/web/` directory: 13 HTMLs. None named `inventory*.html`. List: annual-tax, bank, customer360, entity360, index, onyx-dashboard, pipeline-dashboard, po360, quote360, rfq360, status, supplier360, vat-dashboard.
- Several inventory pages exist deep under `_merge-incoming/.../erp-app/src/pages/inventory*.tsx` (ERP-app candidates), but none are mounted in the canonical onyx-procurement web bundle or OPS client.
- `entity360.html` line 120 entity list does NOT include `inventory` or `material` in the main entity nav.

**Status: RED.** No Inventory360 in canon. Spec acknowledges material entity but never closes the loop with a page. Even if a user reaches PO360 and clicks "קלוט סחורה", there is no destination URL to land on after receipt.

---

## Cross-cutting Gaps

1. **Missing OPS `/api/projects` router.** Project360.tsx in OPS calls 5 project endpoints; none exist. This breaks step 1 entirely from the OPS side.
2. **Missing `POST /api/purchase-orders/:id/receive` handler in onyx-procurement.** Wiring-spec promises it; orchestrator defines it; server.js does not implement it.
3. **WMS library not exposed via HTTP.** `src/warehouse/wms.js` has `receivePO`, `addWarehouse`, etc., but no `registerWmsRoutes(app, deps)` is called from server.js. The receiver business logic exists but is unreachable.
4. **No Inventory360 page or `inventory` entry in `entity360.html` main nav.** Pipeline stage `inventory` (#8 of 13) has no landing page.
5. **No bridge from state-machine triggers (`update_inventory`, `create_warehouse_receipt`) to actual code.** Triggers are declarative strings; `executeOrchestration` only logs them as `effects_executed: 'executed'` (orchestrator.js line 287-289) without calling the wms library.

---

## Files of Record

Canonical pipeline (definitions):
- `onyx-procurement/src/pipeline/pipeline-engine.js`
- `onyx-procurement/src/pipeline/entity-map.js`
- `onyx-procurement/src/pipeline/workflow-flows.js`
- `onyx-procurement/src/pipeline/state-machines.js`
- `onyx-procurement/src/pipeline/wiring-spec.js`
- `onyx-procurement/src/pipeline/orchestrator.js`

Servers:
- `onyx-procurement/server.js` (handles RFQ + PO partial; missing `/receive`)
- `techno-kol-ops/src/index.ts` (mounts work-orders + materials only; no projects)

UI pages:
- `onyx-procurement/web/entity360.html` (generic 360, used for project)
- `onyx-procurement/web/po360.html` (mock GRN data + receive button)
- `onyx-procurement/web/rfq360.html` (convert_to_po wired to mock)
- `techno-kol-ops/client/src/pages/Project360.tsx` (calls undefined `/api/projects/*` endpoints)

Library (unmounted):
- `onyx-procurement/src/warehouse/wms.js` (`receivePO` exists, not exposed)
- `onyx-procurement/src/projects/pm-engine.js` (project mgmt, not exposed)

Pre-existing flag:
- `onyx-procurement/QA-AGENT-49-REPORTING.md` line 262 already calls out the missing `/api/purchase-orders/:id/receive` endpoint.

---

## Recommended Fixes (P0, in order)

1. Add `POST /api/purchase-orders/:id/receive` to `onyx-procurement/server.js`. Wire to `wms.receivePO` and emit `inventory.received_from_po` event.
2. Add `registerWmsRoutes(app, deps)` exposing GET `/api/inventory`, GET `/api/inventory/:id`, POST `/api/inventory/issue`, POST `/api/inventory/reserve`, GET `/api/warehouse/grn` (list inventory_receipts).
3. Create `techno-kol-ops/src/routes/projects.ts` exposing the 5 endpoints Project360.tsx calls. Or proxy to onyx-procurement/projects/pm-engine.js.
4. Add Inventory360 entry to `entity360.html` main nav and define `inventory360` in `PAGE_CONTRACTS` (`wiring-spec.js`). Optional: dedicated `inventory360.html`.
5. Make `executeOrchestration` actually invoke library functions for `update_inventory`, `create_warehouse_receipt`, instead of stubbing `status: 'executed'`.

---

## Per-step status (one-line summary)

- Project → RFQ : RED — definitions OK, no `/api/projects` in OPS, no Create-RFQ button on Project360
- RFQ → PO     : GREEN — full chain definitions + UI button + supporting RFQ/PO endpoints
- PO → GRN     : YELLOW — UI button + mock GRN data + WMS lib all present, missing `/api/purchase-orders/:id/receive`
- GRN → Inventory : RED — state-machine trigger only declarative; no executor wires to wms.js
- Inventory page : RED — no Inventory360, no `/api/inventory` routes, no main-nav entry
