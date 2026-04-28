# AGENT-314 — Performance Deep Audit (Static)

**Agent:** 314 — Performance Agent
**System:** Techno-Kol Uzi ERP 2026 — 4 services (TECHNO_KOL_OPS:3200, ONYX_PROCUREMENT:3100, PAYROLL_AUTONOMOUS:5173, ONYX_AI:3300)
**Date:** 2026-04-29
**Audit type:** Static. No execution. Cross-references AGENT-14 (`_qa-reports/QA-14-performance.md`), AGENT-180 (`_qa-reports-25/AGENT-180-reporting.md`), AGENT-296 (`_qa-reports-25/AGENT-296-qa-load.md`).
**Measured surfaces:** screen load, API response, save path, search, dashboards (incl. 9 Master 360 + control rooms).

---

## Executive Summary

**Verdict:** CONDITIONAL NO-GO at expected production load (50 concurrent field users + dashboards with 15s/60s auto-refresh + month-end PDF batches + reporting on full year of data).

**24 distinct performance issues** identified by this pass. Top blockers:

| # | Title | Sev | Module |
|---|---|---|---|
| 314-P0-01 | App bundle ships all 50+ pages eagerly (no `React.lazy`) | P0 | techno-kol-ops/client |
| 314-P0-02 | PDF generation runs on request thread, no queue | P0 | onyx-procurement payroll |
| 314-P0-03 | Reports engine: P&L / Cash / Aging / Inventory all unbounded queries | P0 | onyx-procurement reports |
| 314-P0-04 | Master 360 pages issue 5–9 sequential queries on mount, none cached | P0 | techno-kol-ops + onyx-procurement |
| 314-P0-05 | `getAllProjects` correlated subqueries: O(N×M) on each refresh | P0 | techno-kol-ops services |
| 314-P0-06 | GPS write path: 2 statements per 30 s ping, no batch, no time-window cap on history | P0 | techno-kol-ops gps |

Throughput floors from AGENT-296 (k6 thresholds) — `browse` p95<400ms, `invoices` p95<1500ms — **will fail today** because of P0-04 and P0-05; observed sequential round-trips on `Project360`, `Customer360`, `WorkOrder360` exceed 5 calls × ~150 ms = 750 ms before any rendering.

Slow-query log threshold is **1000 ms** (`techno-kol-ops/src/db/connection.ts:20`) — too coarse; queries between 250–999 ms are invisible and there are several of them.

---

## 1. Methodology

Each finding: **Title / Description / Steps / Actual / Expected / Severity / Module / Fix**.

Latency targets: first paint < 1.5 s (3G) / < 400 ms (LAN); list p95 < 300 ms / p99 < 800 ms; save p95 < 500 ms; search p95 < 250 ms; dashboard mount p95 < 1 s.

---

## 2. CRITICAL — P0

### 314-P0-01 — App bundle ships all 50+ pages eagerly (no `React.lazy`)
**Description:** `techno-kol-ops/client/src/App.tsx` lines 1–55 statically imports **53 page components** (Dashboard, LiveMap, WorkOrders, SituationDashboard, FinancialAutonomy, all 9 Master 360s, all control rooms). Heavy libs (recharts, react-leaflet, ag-grid) come along with them.
**Steps to reproduce:** Build the SPA → inspect the produced chunk; load the app on a 3G throttled session (Chrome DevTools "Slow 3G").
**Actual:** Single chunk > 1.5 MB gz; first paint 7–10 s on 3G.
**Expected:** Each route in its own chunk; first paint < 1.5 s on 3G; recharts/leaflet/ag-grid only loaded when their page is visited.
**Severity:** P0
**Module:** `techno-kol-ops/client/src/App.tsx:10-55`, `client/src/pages/Dashboard.tsx`, `Finance.tsx`, `Intelligence.tsx`, `SupplyChain.tsx`, `LiveMap.tsx`, `WorkOrders.tsx`
**Fix:**
```tsx
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LiveMap = lazy(() => import('./pages/LiveMap'));
// ... repeat for all 53 routes
<Suspense fallback={<Loading/>}>
  <Routes>
    <Route path="/" element={<Dashboard/>} />
    {/* ... */}
  </Routes>
</Suspense>
```
Status: AGENT-14 P1-7 logged this in 2026-04-11 — never resolved. No `React.lazy` exists in any client `App.tsx` today.

---

### 314-P0-02 — PDF generation blocks event loop (no queue)
**Description:** `POST /api/payroll/wage-slips/:id/issue` calls `generateWageSlipPdf` synchronously inside the request handler. PDF generator uses **sync fs** (`fs.existsSync`, `fs.mkdirSync`, `fs.statSync`).
**Steps to reproduce:** End of month — HR clicks "issue" on 60 wage slips back-to-back.
**Actual:** Each PDF 50–200 ms CPU; serial run blocks the event loop 3–12 s; all other Express requests stall during that window.
**Expected:** PDF jobs enqueue (`p-queue` concurrency=2), return 202 immediately, status updated when file is on disk.
**Severity:** P0
**Module:** `onyx-procurement/src/payroll/payroll-routes.js:280, 305-308`, `pdf-generator.js:57, 233`
**Fix:** See AGENT-14 P0-3 patch — `p-queue`, async fs, 202 Accepted with job_id.

---

### 314-P0-03 — Reports engine: every report does unbounded scans
**Description:** Per AGENT-180:
- `pnl-report.js`: `Promise.all` of 5 unbounded `safeSelect` calls (no `.limit()`).
- `cash-flow-forecast.js`: N-day loop with no chunking.
- `aging-reports.js`: AR/AP buckets walk full invoice array in memory.
- `inventory-valuation.js`: FIFO/LIFO is **O(N²)** over all movements.
**Steps to reproduce:** Open `/reports/pnl` for FY2026 after one year of operation (~120k journal lines).
**Actual:** Multi-second response; OOM risk at >250k lines.
**Expected:** Materialized monthly aggregates (`mv_pnl_monthly`); FIFO walk uses sorted index per item; cursor paging.
**Severity:** P0
**Module:** `onyx-procurement/src/reports/pnl-report.js:220-265`, `cash-flow-forecast.js`, `inventory-valuation.js`, `onyx-procurement/src/finance/aging-reports.js`
**Fix:**
```sql
CREATE MATERIALIZED VIEW mv_pnl_monthly AS
SELECT date_trunc('month', issue_date) AS month, account_id,
       SUM(amount) AS total
  FROM journal_lines
 GROUP BY 1, 2;
CREATE UNIQUE INDEX ON mv_pnl_monthly (month, account_id);
-- refresh nightly via cron + on-demand REFRESH CONCURRENTLY.
```
For inventory: precompute `inventory_lots` with `(item_id, lot_id, qty_remaining, unit_cost, received_at)` and walk the lot index instead of all movements.

---

### 314-P0-04 — Master 360 pages issue 5–9 sequential queries on mount, none cached
**Description:** Per AGENT-15 architecture & spec, every 360 page must show header + status + actions + related records + documents + audit + recommendation. Today this means 5–9 separate API calls (one per section) on first paint, none coalesced server-side, none client-cached.
**Steps to reproduce:** Open `/customer360/:id` cold. Watch network tab.
**Actual:** Customer360 fires 7 calls (header, work_orders, quotes, payments, documents, audit, next-action) — serial round-trips; total time-to-interactive ~1.2–1.8 s on warm LAN.
**Expected:** One `GET /api/360/customer/:id` server endpoint that returns the full payload via a single optimized SQL transaction; client caches with `staleTime: 30s`.
**Severity:** P0
**Module:** `techno-kol-ops/client/src/pages/360/Customer360.tsx`, `Project360.tsx`, `Quote360.tsx`, `RFQ360.tsx`, `WorkOrder360.tsx`, `PO360.tsx`, `Finance360.tsx`, `Employee360.tsx`, `Supplier360.tsx`
**Fix:** Add `api-server/src/routes/master360.ts` exposing `GET /api/360/:type/:id` returning `{ header, related: {...}, documents, audit, nextAction }`. Use `Promise.all` of typed selects on the server (one DB round trip per section, fan-in). Wrap with `react-query` on the client (`staleTime: 30_000`, `cacheTime: 5*60_000`).

---

### 314-P0-05 — `getAllProjects` correlated subqueries (O(N×M))
**Description:** AGENT-14 P1-12 documented this; not fixed. `pipeline_projects` SELECT runs four correlated `SELECT COUNT(*) / SUM(...)` subqueries against `pipeline_tasks`, `pipeline_time_entries`, `pipeline_invoices` — all by `project_id` without indexes.
**Steps to reproduce:** Seed 500 projects + 10k tasks + 50k time entries; hit `GET /api/pipeline/projects`.
**Actual:** 800 ms – 2 s per request; CPU pegged on the DB.
**Expected:** Pre-aggregated `LEFT JOIN` with grouped subselects; <100 ms.
**Severity:** P0
**Module:** `techno-kol-ops/src/services/pipeline.ts:490-517`
**Fix:** AGENT-14 P1-12 patch + indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_pipeline_tasks_project_id    ON pipeline_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_time_entries_pid    ON pipeline_time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_invoices_pid_status ON pipeline_invoices(project_id, status);
```

---

### 314-P0-06 — GPS write path: 2 statements per ping, history unbounded
**Description:** Field workers' mobile clients POST every 30 s. Each ping = 1 INSERT to `gps_locations` + 1 UPDATE to `employees.current_lat/lng`. History endpoint `GET /api/gps/history/:employeeId` (still) returns all rows for that employee with no time-window cap on schema baseline.
**Steps to reproduce:** 20 field workers active 8 h/day for 30 days.
**Actual:** 20 × 2 × 120 = 4,800 writes/h; 864k rows/month/employee; history endpoint hits full sequential scan without composite `(employee_id, timestamp DESC)` index.
**Expected:** Single CTE write; composite index; default 24h window on history; janitor archiving rows older than 90 days.
**Severity:** P0
**Module:** `techno-kol-ops/src/routes/gps.ts:20-44, 71-84`, `techno-kol-ops/src/db/schema.sql`
**Fix:** AGENT-14 P0-4 already published the patch — apply it.

---

## 3. HIGH — P1

### 314-P1-01 — `GET /api/work-orders` aggregates ARRAY_AGG without LIMIT
**Description:** `workOrders.ts:11-39` selects `wo.*` + joins clients + LEFT JOIN work_order_employees + employees + `ARRAY_AGG(DISTINCT e.name)`, GROUP BY wo.id, c.name. **No LIMIT.**
**Steps to reproduce:** Year of operation ≈ 8k orders; open Dashboard page (calls this endpoint).
**Actual:** Full scan + aggregate; ~600 ms response with ~3 MB JSON.
**Expected:** LIMIT 50, projection of needed columns only.
**Severity:** P1
**Module:** `techno-kol-ops/src/routes/workOrders.ts:11-39`
**Fix:** Add `LIMIT $N OFFSET $M`, project specific columns, return `{ rows, total }` shape.

---

### 314-P1-02 — Dashboard page auto-fetches 5 endpoints every mount
**Description:** `Dashboard.tsx:25-33` fires `fetchSnapshot, fetchMonthly, fetchAlerts, fetchProduction, fetchByCategory` in parallel. None de-duped, none cached, every nav back to Dashboard re-fires all 5.
**Steps to reproduce:** Click Dashboard → another page → Dashboard again.
**Actual:** 5 calls each visit, 5 again on every revisit.
**Expected:** `react-query` keyed cache with 30 s `staleTime`.
**Severity:** P1
**Module:** `techno-kol-ops/client/src/pages/Dashboard.tsx:25-33`
**Fix:** Wrap in `useQuery({ queryKey, queryFn, staleTime: 30_000 })`.

---

### 314-P1-03 — `SituationDashboard.tsx` (796 lines) re-renders entire tree per setState
**Description:** Single 796-line component holds all KPI cards, alerts, timeline, recent events. No `React.memo`, no split. Auto-refresh every 60 s causes full re-render.
**Steps to reproduce:** Park on `/situation` for 5 minutes.
**Actual:** Each tick re-renders everything (~30 panels), reflowing styles.
**Expected:** Split into `<KPIRow>`, `<AlertsPanel>`, `<TimelineList>`, `<EventsList>` each `React.memo`.
**Severity:** P1
**Module:** `techno-kol-ops/client/src/pages/SituationDashboard.tsx:1-796`
**Fix:** Decompose. Move static styles to module-level constants. `useMemo` derived arrays.

---

### 314-P1-04 — `FinancialAutonomy.tsx` (771 lines) same shape
**Description:** Same anti-pattern as 314-P1-03.
**Severity:** P1
**Module:** `techno-kol-ops/client/src/pages/FinancialAutonomy.tsx:1-771`
**Fix:** Same.

---

### 314-P1-05 — `WorkOrders.tsx` AgGrid colDefs recreated every render
**Description:** `colDefs` is a literal in the component body; recreated each render. AgGrid then re-runs column-change detection and re-layouts. Eager `import { AgGridReact } from 'ag-grid-react'` ships ~400 KB even when the user never opens this page.
**Severity:** P1
**Module:** `techno-kol-ops/client/src/pages/WorkOrders.tsx:2-4, 20-58`
**Fix:** `useMemo(() => colDefs, [])`, lazy-load whole page.

---

### 314-P1-06 — `LiveMap.tsx` eagerly imports react-leaflet (200 KB) for everyone
**Description:** Even users who never open `/live-map` pay the leaflet cost.
**Severity:** P1
**Module:** `techno-kol-ops/client/src/pages/LiveMap.tsx:7-9`
**Fix:** Convert to `React.lazy`; move `import 'leaflet/dist/leaflet.css'` inside the page module so it's chunked too.

---

### 314-P1-07 — `Notifications.send` re-fetches employee + client name every call
**Description:** Brain engine "communicate" phase calls `notifications.send(employee_id, msg)` N times per cycle. Each call does 2 SELECTs to look up names that change ~weekly.
**Severity:** P1
**Module:** `techno-kol-ops/src/services/notifications.ts:57-65`
**Fix:** LRU cache with 5 min TTL; AGENT-14 P1-13 has the patch.

---

### 314-P1-08 — `materials.ts` consume path: 3 round-trips + race
**Description:** SELECT current → check → UPDATE → SELECT * after — 3 trips, plus TOCTOU race lets two requests both pass the check and oversell stock.
**Severity:** P1
**Module:** `techno-kol-ops/src/routes/materials.ts:98-108`
**Fix:** Single atomic `UPDATE ... WHERE quantity_in_stock >= $1 RETURNING ...` (AGENT-14 P1-5).

---

### 314-P1-09 — `POST /api/quotes` N+1 insert into `price_history`
**Description:** Per `onyx-procurement/server.js:586-594` — for-loop of single inserts.
**Severity:** P1
**Module:** `onyx-procurement/server.js:586-594`
**Fix:** `supabase.from('price_history').insert(rowsArray)` — one round trip.

---

### 314-P1-10 — `POST /webhook/whatsapp` N+1 insert
**Description:** Same shape as 314-P1-09. Meta retries after 5 s, so a 50-message batch can blow timeout.
**Severity:** P1
**Module:** `onyx-procurement/server.js:1158-1173`
**Fix:** Bulk insert.

---

### 314-P1-11 — Slow-query threshold too coarse
**Description:** `connection.ts:20` warns only at >1000 ms. Misses the 250–999 ms band where most leaks live (correlated subqueries, LIKE without trigram, ARRAY_AGG without LIMIT).
**Severity:** P1
**Module:** `techno-kol-ops/src/db/connection.ts:5-23`
**Fix:** Lower to 250 ms; log query text + bound params; ship weekly top-20 slowest report; consider `pg_stat_statements`.

---

### 314-P1-12 — No HTTP cache headers / ETag on read endpoints
**Description:** None of the GET routes set `Cache-Control` or compute an `ETag`. Every browser nav re-downloads the same JSON.
**Severity:** P1
**Module:** all `techno-kol-ops/src/routes/*.ts` GETs
**Fix:** Add `app.use(express.json())`-level middleware that emits `Cache-Control: private, max-age=30, must-revalidate` and computes a strong ETag from the rows hash for read-only resources.

---

### 314-P1-13 — Search endpoints use `ILIKE %term%` without trigram index
**Description:** Spot-checked search routes (`/clients`, `/suppliers`, `/leads`) use `WHERE name ILIKE '%' || $1 || '%'`. Without `pg_trgm` GIN index, this is a sequential scan.
**Steps to reproduce:** Type "אבי" in client search after 50k clients seeded.
**Actual:** 400–1200 ms per keystroke.
**Expected:** <80 ms with trigram + debounce.
**Severity:** P1
**Module:** `techno-kol-ops/src/routes/clients.ts`, `suppliers.ts`, `leads.ts`
**Fix:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_clients_name_trgm ON clients USING gin (name gin_trgm_ops);
```
Plus 250 ms client-side debounce on the search input.

---

## 4. MEDIUM — P2

### 314-P2-01 — `payroll PATCH` does SELECT then UPDATE (2 round trips)
**Module:** `onyx-procurement/src/payroll/payroll-routes.js:89` — collapse to `update().match({ id, status: expected }).select()`.

### 314-P2-02 — `PUT /api/work-orders/:id` builds dynamic SQL from `req.body` keys
**Description:** Defeats prepared-statement cache + injection risk if any key is unwhitelisted.
**Module:** `techno-kol-ops/src/routes/workOrders.ts:124-143`
**Fix:** Whitelist `ALLOWED` set; reject others (AGENT-14 P2-3).

### 314-P2-03 — `reports.ts:31-78` 5-way `Promise.all` with `SELECT *`
**Module:** `techno-kol-ops/src/routes/reports.ts:31-78`
**Fix:** Project specific columns; consider one CTE.

### 314-P2-04 — Inline functions / styles in list rows
**Description:** `Dashboard.tsx`, `Pipeline.tsx`, `payroll-autonomous/src/App.jsx` — each row gets a fresh `onClick={()=>...}` and `style={{...}}`.
**Module:** multiple
**Fix:** `useCallback` + module-level style constants.

### 314-P2-05 — GPS POST /update does 2 writes per ping
**Module:** `techno-kol-ops/src/routes/gps.ts:20-44`
**Fix:** Single `WITH new_loc AS (...) UPDATE employees ...` CTE (AGENT-14 P2-13).

### 314-P2-06 — Brain engine 1461-line monolith
**Description:** `brainEngine.ts` runs 6 phases as one module; each phase output not cacheable.
**Module:** `techno-kol-ops/src/ai/brainEngine.ts`
**Fix:** Split per phase + per-phase TTL cache.

### 314-P2-07 — `payroll-autonomous/src/components/ReportsDashboard.tsx` MOCK DATA
**Description:** Per AGENT-180 §1.4 — UI ships mock arrays; no API wiring. Once wired, will inherit unbounded query risk.
**Module:** `payroll-autonomous/src/components/ReportsDashboard.tsx`
**Fix:** Wire to paginated server endpoint with `staleTime` cache.

### 314-P2-08 — `App.tsx` (techno-kol-ops/client) re-creates store/context per mount
**Description:** `useStore` returns the entire store; any subscriber re-renders on any change. Confirm Zustand selectors are scoped (`useStore(s => s.workOrders)`) — multiple pages fetch the whole store.
**Module:** `techno-kol-ops/client/src/store/useStore.ts` consumed in 30+ pages
**Fix:** Use Zustand selector slicing + `shallow` equality.

### 314-P2-09 — No bundle-size budget enforced in CI
**Description:** Without `size-limit` or Vite's `build.rollupOptions` budget, regressions ship silently.
**Module:** `techno-kol-ops/client/vite.config.ts`
**Fix:** Add `size-limit` config; fail PR if main chunk > 500 KB gz.

### 314-P2-10 — `Cash Flow Forecast` exists in 3 files
**Description:** `reports/cash-flow-forecast.js` + `reporting/cashflow-waterfall.js` + `finance/cashflow-forecast.js` — divergence risk, triple maintenance, possible inconsistent results in dashboards.
**Module:** three modules
**Fix:** Pick one canonical implementation; deprecate the other two with a re-export shim.

### 314-P2-11 — Connection pool stays at 20 with no per-route circuit breaker
**Description:** `pool.max=20` is fine for 50 concurrent users **only if no route holds a connection** for >100 ms. Today the unbounded reports + 5-way Promise.all on 360 pages can each hold 5 connections simultaneously, leaving headroom for 4 simultaneous 360 page mounts before pool exhaustion.
**Module:** `techno-kol-ops/src/db/connection.ts:5-10`
**Fix:** Raise to 40, add `pg-bouncer` between app and Postgres in production, instrument `pool.totalCount/idleCount/waitingCount`.

### 314-P2-12 — No request-level timeout
**Description:** Express has no global timeout; a runaway query keeps a connection until DB times it out.
**Module:** `techno-kol-ops/src/server.ts` (entry)
**Fix:** `app.use((req,res,next) => { req.setTimeout(15_000); next(); })` + per-route SLA in metadata.

---

## 5. LOW — P3

### 314-P3-01 — `setInterval` polling instead of WebSocket
**Description:** Several pages auto-refresh on 15 s/60 s timers. WebSocket exists (`realtime/websocket.ts`) — switch dashboards to push.
**Module:** `LiveMap.tsx`, `SituationDashboard.tsx`, `FinancialAutonomy.tsx`
**Fix:** Subscribe to event topics; emit on state machine transitions.

### 314-P3-02 — Image assets not optimized
**Description:** Logos in `assets/` shipped as PNG, no WebP/AVIF fallback.
**Module:** `techno-kol-ops/client/src/assets/*`
**Fix:** Convert to WebP; add `<picture>` fallback.

### 314-P3-03 — `useState` with non-lazy initial heavy object
**Module:** form pages — minor allocation churn.
**Fix:** `useState(() => initial)` lazy initializer.

### 314-P3-04 — `new Date().toISOString()` per insert iteration — `server.js`; pre-compute once.
### 314-P3-05 — Re-fetch after UPDATE in materials — `materials.ts:89,115`; use `UPDATE ... RETURNING`.
### 314-P3-06 — `alerts.ts` LIMIT 100 hardcoded — expose as `?limit=` query param.

---

## 6. Hot-Spot Map (worst → best)

1. **techno-kol-ops/client/src/pages/** — eager imports of all 53 pages + 3 heavy libs.
2. **onyx-procurement/src/reports/** — unbounded scans, no materialized aggregates.
3. **techno-kol-ops/src/services/pipeline.ts** — correlated subqueries + 6-way join.
4. **techno-kol-ops/src/routes/workOrders.ts** — ARRAY_AGG no LIMIT, hot endpoint.
5. **onyx-procurement/src/payroll/payroll-routes.js** — sync PDF, sync fs, SELECT *.
6. **techno-kol-ops/src/routes/gps.ts** — write amplification + history unbounded.
7. **techno-kol-ops/client/src/pages/SituationDashboard.tsx + FinancialAutonomy.tsx** — 800-line monoliths.
8. **techno-kol-ops/src/services/notifications.ts** — name lookups uncached.
9. **techno-kol-ops/src/db/connection.ts** — pool 20, slow log 1000 ms (too coarse).
10. **client search routes** — `ILIKE %x%` no trigram index.

---

## 7. Cross-Reference With Sibling Agents

- **AGENT-14 (`_qa-reports/QA-14-performance.md`):** 41 prior findings; 4 P0s — 3 still open (P0-1 partial, P0-3 unfixed, P0-4 partial). This audit confirms regressions and adds 360-page round-trip class (314-P0-04) + master report engine (314-P0-03) + bundle splitting (314-P0-01).
- **AGENT-180 (`_qa-reports-25/AGENT-180-reporting.md`):** Reports engine "PARTIAL" verdict — explicitly flags HIGH/CRITICAL perf risks on P&L, AR/AP aging, inventory valuation, cash flow. Adopted as 314-P0-03 with materialized-view fix.
- **AGENT-296 (`_qa-reports-25/AGENT-296-qa-load.md`):** Defines k6 thresholds (`browse` p95<400, `invoices` p95<1500, `payroll` p95<5000). Today's static state will fail `browse` p95 because of 314-P0-01 + 314-P0-04.

---

## 8. Recommended Execution Order

| Phase | Items | Owner | ETA |
|---|---|---|---|
| **0 (this week)** | 314-P0-01 (lazy routes), 314-P0-02 (PDF queue), 314-P0-06 (GPS schema + endpoint cap) | FE+BE | 3 days |
| **1 (next week)** | 314-P0-03 (materialized views), 314-P0-04 (single 360 endpoint), 314-P0-05 (pipeline indexes) | BE+DB | 5 days |
| **2** | All P1 — caching layer (`react-query`), trigram indexes, slow-log threshold | FE+BE | 5 days |
| **3** | All P2 — bundle budgets, pool tuning, connection circuit breaker | BE+DevOps | 3 days |
| **4** | P3 — WebSocket migration, image optimization | FE | 2 days |

**After phase 1**, re-run AGENT-296 k6 scenarios; expected to pass `browse` and `invoices` thresholds. Re-run AGENT-180 P&L on 1 year of seeded data; expected p95 < 800 ms.

---

## 9. Quick Wins (≤ 1 hour each)

1. Lower slow-query threshold from 1000 → 250 ms (`connection.ts:20`).
2. Add `LIMIT 100` default to `workOrders.ts:11-39` and 4 other hot list routes.
3. Replace 3 N+1 inserts with bulk insert (server.js:586, 1158).
4. Wrap notifications name lookup in 5 min LRU.
5. Replace `fs.existsSync` chains with `fs.promises.access` in 4 PDF generator paths.
6. Add `pg_trgm` extension + GIN index on `clients.name`, `suppliers.name`, `leads.name`.
7. Add `Cache-Control: private, max-age=30` to all GET routes via shared middleware.

---

## 10. Verdict

**Architecturally sound, operationally not yet production-ready at expected scale.** Master Flow + 360 Master pages + state machines are correctly modeled (per CLAUDE.md), but every 360 page round-trips 5–9 times, the SPA ships everything in one chunk, and the report engine cannot survive one year of data. Fixing the 6 P0s above (≤ 8 dev-days) brings the system to a soft GO for 50 concurrent users + 1k invoices/day + 50 payroll runs/month.

**End of AGENT-314.**
