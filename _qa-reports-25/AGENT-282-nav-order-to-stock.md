# AGENT-282 — Navigation Audit: Order -> Project -> WorkOrder -> QC -> Stock

**Date:** 2026-04-29
**Agent:** 282 (NAV #2)
**Scope:** Trace the production-execution navigation chain
`Order (WorkOrders list) -> Project360 -> WorkOrder360 -> QC tab -> Stock/Materials`
**Method:** Static review of router config, page components, row-click handlers, action buttons, and API routes.

---

## 1. Active Router

`techno-kol-ops/client/src/main.tsx` mounts `<BrowserRouter><App /></BrowserRouter>`.
**Only routes declared in `App.tsx` are live.**
The `client/src/router/routeRegistry.ts` + `router/index.tsx` (a `createBrowserRouter` based registry with `/work-order/:id`, `/project/:id`) is **DEAD CODE** — never imported. This is a critical wiring trap, because several 360 components call `navigate("/work-order/${id}")` (the registry path), which is NOT mounted.

Live routes for this chain (`App.tsx` lines 100-151):

| Path                          | Component                                      |
|-------------------------------|------------------------------------------------|
| `/work-orders`                | `pages/WorkOrders.tsx` (list)                  |
| `/project360/:id`             | `pages/Project360.tsx` (rich, tabbed)          |
| `/360/project/:id`            | `pages/360/Project360.tsx` (light)             |
| `/work-order360/:id`          | `pages/WorkOrder360.tsx` (rich, tabbed, QC)    |
| `/360/work-order/:id`         | `pages/360/WorkOrder360.tsx` (light)           |
| `/materials`                  | `pages/Materials.tsx` (Stock list)             |
| `/inventory-alerts`           | `pages/InventoryAlerts.tsx`                    |

There is **no `/order/:id`** and **no `Order360`** — "Order" in this chain maps to **work_orders** (per CLAUDE.md Master Flow `Order → Project → Work Orders`).

---

## 2. Step-by-Step Verification

### STEP 1: Order entry (WorkOrders list `/work-orders`)
- **Page exists:** YES — `pages/WorkOrders.tsx` (181 lines, AG-Grid).
- **Sidebar entry:** YES — `Sidebar.tsx:17` `'/work-orders'` -> "הזמנות עבודה".
- **URL valid:** YES — mounted in `App.tsx:104`.
- **Row click navigates to next step:** **NO — BROKEN.**
  `WorkOrders.tsx:96` `onRowClicked={(e) => setSelected(e.data)}` opens an in-page **side panel only**; it does not `navigate()` to `/work-order360/:id` or `/project360/:id`. User cannot drill into the WO 360 from the list.
- **"+ הזמנה חדשה" button:** Opens local modal — works for create, but no project linkage shown.

VERDICT: **Page works in isolation, but the click-through to WorkOrder360 is missing.** A user has to type the URL by hand.

### STEP 2: Project360 (`/project360/:id`)
- **Page exists:** YES — `pages/Project360.tsx` (984 lines, 18 tabs incl. `work_orders`, `materials`, `inventory`).
- **URL valid:** YES.
- **Header / KPIs / state badge:** YES.
- **`work_orders` tab:** Renders `SortableTable` of WOs.
- **Row click on WO row -> WorkOrder360:** **NO — MISSING.**
  `pages/Project360.tsx:663-671` builds the SortableTable with `columns={...}` but **no `onRowClick` prop is passed** (compare to OperationsControlRoom.tsx:85 which does pass it). Same gap on `procurement`, `materials`, `inventory` tabs.
- **"+ צור הזמנת עבודה" button:** YES — but it calls `executeAction('create_work_order')` which POSTs `/api/orchestrator/execute`. **The orchestrator route is NOT mounted** (see step 5).
- **Light variant `pages/360/Project360.tsx`:** DOES wire `onRowClick={(r) => navigate('/work-order/${r.id}')}` — but `/work-order/:id` is in the dead routeRegistry, **so clicks from this lite page navigate to a 404** (caught by `<Route path="*" element={<NotFound />} />`).

VERDICT: **Project360 (rich) reaches the page but cannot drill into a specific WO. The lite 360 variant routes to a 404.**

### STEP 3: WorkOrder360 (`/work-order360/:id`)
- **Page exists:** YES — `pages/WorkOrder360.tsx` (961 lines, 13 tabs including `quality`).
- **URL valid:** YES — `App.tsx:132`.
- **Tabs include QC + Materials:** YES — `TABS` array `quality` (איכות), `materials` (חומרים), `reservations` (שמורים).
- **Initial fetch / detail load:** YES — `GET /api/work-orders/:id` → handled by `routes/workOrders.ts:42`.
- **Side panel "חומרים" link -> materials tab:** YES — `setActiveTab('materials')` (line 544).
- **Side panel "בדיקות איכות" link -> QC tab:** YES (line 545).
- **Tab data fetch endpoints (lines 273-283):** Calls
  `GET /api/work-orders/:id/{team,attendance,materials,reservations,quality,signatures,expenses,alerts,documents,audit-log}`.
  **NONE OF THESE SUB-ROUTES EXIST** in `routes/workOrders.ts`. Only `/`, `/:id`, `/:id/progress`, `/:id/employees`, `/:id/employees/:empId/hours` are defined. So tabs render `EmptyState` permanently (`r.data || []`).
- **Action buttons "דיווח התקדמות" / "בקשת חומרים" in `features/workOrders/WorkOrder360.tsx:35-36`:** `onClick={() => {}}` — **no-op stubs.** (Note: this lite version is registered in the dead routeRegistry only, so it is not user-facing.)
- **Primary action / state transition:** Calls `POST /api/work-orders/:id/transition` — **route does not exist** in `workOrders.ts`. Will 404.

VERDICT: **Page renders, header + tab nav work, but every QC / materials / reservation API call returns nothing, and state transitions / orchestrator actions fail.**

### STEP 4: QC tab (inside WorkOrder360)
- **Tab exists:** YES — `pages/WorkOrder360.tsx:92` `{ key: 'quality', label: 'איכות' }`.
- **Renders:** YES — quality table with check_type / inspector / result / notes / checked_at columns (lines 763-780).
- **"+ הוסף בדיקה" button:** Calls `executeAction('add_quality_check')` -> `POST /api/orchestrator/execute`. **Orchestrator endpoint NOT mounted** in `index.ts` (no `app.use('/api/orchestrator', ...)`).
- **GET data:** `GET /api/work-orders/:id/quality` — **NOT IMPLEMENTED** in router.
- **Drill-down from QC row -> dedicated QC inspection page:** Not wired (no `/qc/:id` route, no QCInspection360 component).

VERDICT: **Tab visible, table renders, but data never loads and add-check button hits a missing route.**

### STEP 5: Stock / Materials (`/materials`)
- **Page exists:** YES — `pages/Materials.tsx` (181 lines). Sidebar label "מחסן".
- **URL valid:** YES — `App.tsx:108`.
- **Loads inventory:** YES — `GET /api/materials` → `routes/materials.ts:9` (works).
- **"+ קבלת סחורה" modal:** YES — `POST /api/materials/:id/receive` → `routes/materials.ts:77` (works).
- **Linkage from WorkOrder360 materials tab -> Materials list:** **NO** — material-row click in WO360 has no `onRowClick`; user cannot jump to the catalog item.
- **No item-detail page:** `Materials.tsx` is list only, no `/material/:id` route, no Stock360 / Item360.
- **InventoryAlerts page:** Wired at `/inventory-alerts` (separate flow, not on this chain).

VERDICT: **Stock list works on its own but is a navigational dead-end from the production chain — no back-pointer from WO materials, no item drill-down.**

---

## 3. Per-Step Wiring Matrix

| Step              | Page exists | URL valid | Click-out works | API works | Status  |
|-------------------|-------------|-----------|------------------|-----------|---------|
| Orders list       | YES         | YES       | NO (panel only)  | YES       | BROKEN  |
| Project360        | YES         | YES       | NO (no onRowClick on WO rows) | partial (`/api/projects` not mounted) | BROKEN |
| WorkOrder360      | YES         | YES       | YES (tabs)       | NO (sub-routes 404) | DEGRADED |
| QC tab            | YES (tab)   | YES       | n/a (no drill)   | NO (`/quality` 404, orchestrator 404) | BROKEN |
| Stock (Materials) | YES         | YES       | n/a              | YES       | OK (isolated) |

Overall chain wired end-to-end: **NO**.

---

## 4. Root-Cause Summary (4 Critical Gaps)

1. **WorkOrders list lacks `navigate(`/work-order360/${id}`)` on row click.** Replace `setSelected(e.data)` with navigation (or add an explicit row action).
   File: `techno-kol-ops/client/src/pages/WorkOrders.tsx:96`.

2. **Project360 (rich) `work_orders` / `procurement` / `materials` / `inventory` SortableTables have no `onRowClick`.** User cannot drill from project to specific WO/PO.
   File: `techno-kol-ops/client/src/pages/Project360.tsx:663, 685, 705, 722`.

3. **`/api/projects` router is NOT mounted in `index.ts`** even though Project360 issues `GET /api/projects/:id`, `/work-orders`, `/quality`, `/transition`, etc. No `routes/projects.ts` file exists at all.
   Also: `routes/workOrders.ts` only exposes `/`, `/:id`, `/:id/progress`, `/:id/employees*`. Missing **`/quality`, `/team`, `/attendance`, `/materials`, `/reservations`, `/signatures`, `/expenses`, `/alerts`, `/documents`, `/audit-log`, `/transition`**. Tabs always show empty state.

4. **`/api/orchestrator/execute` not mounted.** All `executeAction(...)` calls (start, reserve_materials, add_quality_check, request_signature, transitions) silently fail. No orchestrator router import in `techno-kol-ops/src/index.ts` (the `pipeline/orchestrator.js` lives in onyx-procurement and is not bridged).

Plus: **`features/workOrders/WorkOrder360.tsx`** (the lite version in the dead registry) has placeholder `onClick={() => {}}` for "דיווח התקדמות" and "בקשת חומרים" — would-be no-ops if it were ever mounted.

---

## 5. Recommended Fixes (priority order)

P0:
- Add `onRowClick` -> `navigate('/work-order360/${row.id}')` in `WorkOrders.tsx`
  AND in Project360 work_orders / procurement / materials tabs.
- Create `techno-kol-ops/src/routes/projects.ts` and mount at `/api/projects` (mirror `workOrders.ts`).
- Add WO sub-routes (`/quality`, `/team`, `/materials`, `/reservations`, `/transition`, `/audit-log`).
- Mount orchestrator: `app.use('/api/orchestrator', orchestratorRouter)`; bridge to `onyx-procurement/src/pipeline/orchestrator.js`.

P1:
- Make material rows in WO360 link to `/materials?item=:material_id` (or build a `/material/:id` Stock360 page).
- Decide: keep dead `routeRegistry` or wire it under `App.tsx`. Two router systems create false confidence.
- Replace `onClick={() => {}}` stubs in `features/workOrders/WorkOrder360.tsx` with real handlers (or delete this dead file).

P2:
- Add Order360 / Lead360 entry pages so the upstream chain (Customer -> Quote -> Order -> Project) is symmetric with the downstream WO/QC/Stock chain.

---

## 6. Files Touched in Review
- `techno-kol-ops/client/src/main.tsx`
- `techno-kol-ops/client/src/App.tsx` (lines 100-151)
- `techno-kol-ops/client/src/router/routeRegistry.ts` (DEAD — confirmed)
- `techno-kol-ops/client/src/router/index.tsx` (DEAD — confirmed)
- `techno-kol-ops/client/src/components/Sidebar.tsx` (lines 17-23)
- `techno-kol-ops/client/src/pages/WorkOrders.tsx` (line 96)
- `techno-kol-ops/client/src/pages/Project360.tsx` (lines 47-93, 654-728)
- `techno-kol-ops/client/src/pages/WorkOrder360.tsx` (lines 47-99, 273-300, 762-780)
- `techno-kol-ops/client/src/pages/Materials.tsx`
- `techno-kol-ops/client/src/pages/360/Project360.tsx` (lines 46-66 — uses dead `/work-order/:id`)
- `techno-kol-ops/client/src/features/workOrders/WorkOrder360.tsx` (lines 35-36 — empty handlers)
- `techno-kol-ops/src/index.ts` (lines 110-158)
- `techno-kol-ops/src/routes/workOrders.ts` (lines 11-236)
- `techno-kol-ops/src/routes/materials.ts` (lines 9-98)

---

**Bottom line:** The **pages exist and are well-built**, but the chain is broken at every join: orders-list does not click into WO360, project does not click into WO, WO360 sub-tabs (QC, materials, reservations) call API routes that don't exist, the orchestrator endpoint is unmounted, and Stock has no back-pointer from WO materials. The system can render every screen via direct URL, but a user clicking through cannot complete Order -> Project -> WorkOrder -> QC -> Stock.
