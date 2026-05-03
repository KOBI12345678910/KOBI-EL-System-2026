# AGENT-191 — Asset Management Audit

**Agent:** 191
**Date:** 2026-04-29
**Reference:** `_qa-reports/AG-X34-asset-management.md` (X-34, Swarm 3B)
**Scope:** Fixed assets register, depreciation schedules (straight-line / DDB / units), disposal
**Worktree:** `objective-merkle-40ff93`

---

## 1. Verdict

| Layer | Status | Notes |
|---|---|---|
| Engine (Node module) | PASS | 32/32 tests pass, append-only, IL-compliant |
| API routes (Express) | PARTIAL | Works, but uses a parallel/simpler engine |
| UI (React pages) | PASS | List, schedule, dashboard, CRUD all wired |
| Engine ↔ API wiring | FAIL | Engine never imported by `api-server` |
| GL auto-posting | FAIL at API | Engine emits journal lines; API does not |

**Bottom line:** the X-34 engine is real and correct, but the production API
runs its own simplified calculator that does not match the engine's contract.

---

## 2. Engine Verification (`onyx-procurement/src/assets/asset-manager.js`)

Re-ran the suite: `node --test test/payroll/asset-manager.test.js` →
`tests 32  pass 32  fail 0  duration 454ms`. Confirms X-34 sign-off.

- **Israeli rate catalog** — 13 categories present with correct `תקנות פחת`
  rates (4%, 8%, 15%, 20%, 33%, 50%, 25%, 6%).
- **Methods** — `STRAIGHT_LINE`, `DECLINING_BALANCE` (factor 2/life),
  `SUM_OF_YEARS`, `UNITS_OF_PRODUCTION`, `ACCELERATED` all dispatched in
  `runDepreciation()` (lines 408-430).
- **Salvage floor** — clamped at lines 437-438 (period) and 661 (forecast).
- **Mid-month** — `monthsBetweenMidMonth()` (lines 245-256): ≤15th full,
  >15th half (IL standard).
- **Disposal** — catches up dep → `gain_loss = sale - NBV` → status
  `DISPOSED` → 4-line GL journal.
- **Never-delete** — verified by test #28; append-only `transactions[]`
  and `journal[]`.

**Engine grade: A.** Matches the report.

---

## 3. API Layer (`api-server/src/routes/finance-enterprise4.ts`, `finance-accounting.ts`)

Two route files own fixed-asset endpoints. Both are registered in
`api-server/src/routes/index.ts` (lines 56, 70).

### 3.1 Endpoints exposed

| Route | File | Purpose |
|---|---|---|
| `GET /fixed-assets` | finance-accounting.ts:156 | List with filters |
| `GET /fixed-assets/stats` | finance-accounting.ts:169 | KPIs |
| `GET /fixed-assets/:id` | finance-accounting.ts:187 | One asset |
| `POST /fixed-assets` | finance-accounting.ts:193 | Create |
| `PUT /fixed-assets/:id` | finance-accounting.ts:210 | Update |
| `DELETE /fixed-assets/:id` | finance-accounting.ts:249 | **Hard delete** |
| `GET /fixed-assets/by-category` | finance-accounting.ts:254 | Group |
| `GET /fixed-assets/by-location` | finance-accounting.ts:267 | Group |
| `GET /finance/fixed-assets/depreciation-schedule` | finance-enterprise4.ts:338 | Schedule |
| `POST /finance/fixed-assets/calculate-depreciation` | finance-enterprise4.ts:355 | Run |

### 3.2 Defects (P0/P1)

1. **P0 — Engine not wired.** No file under `api-server/` imports
   `onyx-procurement/src/assets/asset-manager.js`. `Grep` for
   `asset-manager`, `depStraightLine`, `runDepreciation` in
   `api-server/src` returns zero matches. The two engines diverge.

2. **P0 — `DELETE /fixed-assets/:id` violates the never-delete rule**
   (finance-accounting.ts:249-252). It runs `DELETE FROM fixed_assets`.
   X-34 contract requires status flip to `DISPOSED` only.

3. **P0 — SQL injection surface.** Routes interpolate `req.params.id`
   directly into SQL (e.g. line 188, 244, 250), and string filters use
   only `.replace(/'/g, "''")` rather than parameterized queries.
   Partially mitigated for `id` by `parseInt`, but not all paths.

4. **P0 — No GL journal posted on depreciation run.**
   `POST /finance/fixed-assets/calculate-depreciation` (line 355) updates
   `accumulated_depreciation` and `annual_depreciation` columns but
   never inserts into `journal_entries` / `general_ledger`. The X-34
   engine posts `7200-DEP-EXP` debit / `1590-ACC-DEP` credit per period.

5. **P1 — DDB algorithm wrong.** Line 366-368 computes
   `bookValue * (2/life)` for `declining_balance`, but does **not**
   clamp at salvage. The engine does (asset-manager.js:185).

6. **P1 — Mid-month convention missing.** API run prorates only by
   `useful_life_years` — no acquisition-date awareness. Engine handles
   this via `monthsBetweenMidMonth()`.

7. **P1 — Sum-of-years and units-of-production unsupported by API.**
   Engine implements both; API hardcodes only `straight_line` and
   `declining_balance`.

8. **P1 — Disposal endpoint missing.** No `POST /fixed-assets/:id/dispose`.
   UI only flips `status` via PUT — no gain/loss computation, no
   journal entry, no `disposal_gain_loss` field on output.

9. **P2 — Israeli rate catalog not exposed.** Engine has the full
   `CATEGORY_RATES` table; API never references it. Frontend has to
   hard-code categories on its own.

---

## 4. UI Layer

| Page | Path | Status |
|---|---|---|
| Asset list / CRUD | `erp-app/src/pages/modules/asset-management.tsx` | OK |
| Depreciation schedule | `erp-app/src/pages/finance/depreciation-schedule.tsx` | Read-only, OK |
| Fixed assets (finance) | `erp-app/src/pages/finance/finance-fixed-assets.tsx` | Present |
| Fixed assets (alt) | `erp-app/src/pages/finance/fixed-assets.tsx` | Present |
| Assets dashboard | `erp-app/src/pages/assets/assets-dashboard.tsx` | Present |

UI hits `/api/depreciation-schedule` (depreciation-schedule.tsx:78). I do
not see an exact `/api/depreciation-schedule` registered — the actual
endpoint is `/api/finance/fixed-assets/depreciation-schedule`. **P1
endpoint mismatch** — UI will 404 unless aliased elsewhere (worth
checking entity-crud-registry / a redirect).

UI for `asset-management.tsx` correctly hits `/api/fixed-assets` and
`/api/fixed-assets/stats` (lines 59) — those exist.

The depreciation method dropdown only lists 3 options
(`straight_line`, `declining_balance`, `units_of_production`,
depreciation-schedule.tsx:45-49). Engine supports 5. **P2 — UI does not
expose `sum_of_years` or `accelerated`.**

---

## 5. Schema

`fixed_assets` table fields used in routes:
`id, asset_number, asset_name, asset_type, category, description,
serial_number, manufacturer, model, location, department, assigned_to,
purchase_date, purchase_price, currency, supplier, invoice_number,
useful_life_years, depreciation_method, depreciation_rate,
accumulated_depreciation, current_value, residual_value,
annual_depreciation, salvage_value, warranty_expiry, insurance_policy,
insurance_expiry, maintenance_schedule, status, gl_account, cost_center,
barcode, notes, disposal_date, disposal_price, disposal_method,
created_at, updated_at`.

Engine asset shape (asset-manager.js:337-363) is similar but adds
`category_he`, `category_en`, `name_he`, `revaluation_surplus`,
`impairment_loss`, `total_units_capacity`, `units_used`,
`last_depreciated_to`, `disposal_proceeds`, `disposal_gain_loss`.
**P2 — schema missing `revaluation_surplus`, `impairment_loss`,
`disposal_gain_loss`, `last_depreciated_to`.** Without these, the
engine's IAS 16 / IAS 36 features cannot be persisted.

---

## 6. Recommendations (priority order)

1. **Wire the engine.** Replace the inline depreciation logic in
   `finance-enterprise4.ts:355-378` with a call to the X-34 engine.
   Load assets from `fixed_assets`, instantiate a per-tenant
   `createAssetStore()`, run, then persist results plus the journal.
2. **Remove `DELETE /fixed-assets/:id`** — replace with
   `POST /fixed-assets/:id/dispose` calling `dispose()`.
3. **Add `disposal_gain_loss`, `last_depreciated_to`,
   `revaluation_surplus`, `impairment_loss`** columns to `fixed_assets`.
4. **Parameterize SQL** — switch from string interpolation to bound
   parameters across all asset routes.
5. **Auto-post GL journal** during the depreciation run — the engine
   already returns the entries; just persist them to
   `general_ledger` / `journal_entries`.
6. **Fix the UI endpoint** — `/api/depreciation-schedule` should alias
   to `/api/finance/fixed-assets/depreciation-schedule` (or update the
   frontend).
7. **Surface SOY and ACCELERATED** in the depreciation method
   dropdown so the engine's full method set is reachable.

---

## 7. Files Touched / Referenced

- `C:\...\onyx-procurement\src\assets\asset-manager.js` — engine, OK
- `C:\...\test\payroll\asset-manager.test.js` — 32/32 pass
- `C:\...\api-server\src\routes\finance-accounting.ts` — CRUD routes
- `C:\...\api-server\src\routes\finance-enterprise4.ts` — schedule + run
- `C:\...\api-server\src\routes\asset-tools-management.ts` — separate, tools only
- `C:\...\erp-app\src\pages\modules\asset-management.tsx` — list/CRUD UI
- `C:\...\erp-app\src\pages\finance\depreciation-schedule.tsx` — schedule UI

**Sign-off:** Engine cleared. API + UI integration needs the seven fixes
above before this module is enterprise-grade.
