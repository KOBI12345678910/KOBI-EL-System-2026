# AGENT-180 — Audit Reporting Engine

**Agent:** 180
**Date:** 2026-04-29
**Scope:** Audit the reporting engine (P&L, BS, CF, AR aging, AP aging, inventory, payroll). Reference `_qa-reports/AG-99-bi-dashboard.md`. Flag slow-query risk on large data.
**Verdict:** PARTIAL — All seven core reports exist as standalone modules with strong domain logic, but cross-cutting performance concerns (no pagination, no caching, no materialized views) and divergent module locations create real risk on production-scale data.

---

## 1. Reporting Engine Inventory

### 1.1 Core financial reports — `onyx-procurement/src/reports/`

| Report | File | Public API | Audit Trail |
|--------|------|------------|-------------|
| **P&L** | `pnl-report.js` | `generatePNL(year, month, {supabase})`, `generatePNLJson`, `generatePNLPdf`, `generatePNLExcel` | YES — every line carries `audit[]` of source IDs |
| **Cash Flow Forecast** | `cash-flow-forecast.js` | N-day projection w/ scenarios (base/pessimistic/optimistic), `renderCashFlowPdf` | YES — per-day ledger |
| **Inventory Valuation** | `inventory-valuation.js` | FIFO / LIFO / WAC; ferrous & non-ferrous LME pricing | YES — lot-level reconstruction |
| **Quarterly Tax** | `quarterly-tax-report.js` | VAT/income tax quarterly export | YES — Form 6111 mapping |
| **Management Dashboard PDF** | `management-dashboard-pdf.js` | Composite PDF for executives | YES |
| **Grand Aggregator** | `grand-aggregator.js` | Walks `_qa-reports/*.md` → `GRAND-FINAL.md` | N/A (meta) |

### 1.2 Analytical reports — `onyx-procurement/src/reporting/`

| Report | File | Notes |
|--------|------|-------|
| **Balance Sheet** | `balance-sheet.js` | IFRS/Form-6111 classifier + ratios (Current/Quick/Cash/D-E/Equity), bilingual |
| **Cash Flow Waterfall** | `cashflow-waterfall.js` | Direct/indirect; SVG renderer |
| **P&L Drilldown** | `pnl-drilldown.js` | Hierarchical roll-up + variance vs prior/budget |
| **Budget vs Actual** | `budget-actual.js` | Owner accountability, rolling forecast, IL fiscal year |
| **Variance Analyzer** | `variance-analyzer.js` | — |
| **Cohort / LTV / Funnel / KPI / Benchmark / Board-Deck / Exec-Dashboard / Revenue-Waterfall / CAC / Attribution** | various | Marketing & SaaS-style analytics |

### 1.3 Aging reports — `onyx-procurement/src/finance/`

| Report | File | Buckets |
|--------|------|---------|
| **AR / AP aging (v2)** | `aging-reports.js` | 0-30 / 31-60 / 61-90 / 91-180 / 180+ |
| **Aging (legacy)** | `aging.js` | preserved per "no-delete" rule |
| **Cash Flow Forecast** | `cashflow-forecast.js` | second forecast engine — DUPLICATE risk vs `reports/cash-flow-forecast.js` |
| **Bad Debt Provision** | `bad-debt-provision.js` | — |

### 1.4 Payroll reports

| Surface | File | Notes |
|---------|------|-------|
| Reports Dashboard UI | `payroll-autonomous/src/components/ReportsDashboard.tsx` | 4 reports: monthly payroll, projects, suppliers, P&L. **MOCK DATA HARDCODED** — no API wiring. |
| Form 102 BL | `onyx-procurement/src/bl/form-102-bl.js` | BL monthly report |
| Form 126 | `onyx-procurement/src/tax/form-126.js` | Annual employee tax |
| HR Routes | `api-server/src/routes/israeli-payroll.ts`, `hr.ts` | HTTP entry points |

---

## 2. Coverage vs Brief — 7 Required Reports

| Required | Module | Status | Performance Risk |
|----------|--------|--------|------------------|
| **P&L** | `reports/pnl-report.js` | PRESENT | HIGH — `Promise.all` of 5 unbounded `safeSelect` calls (no `.limit()`, no pagination) |
| **Balance Sheet** | `reporting/balance-sheet.js` | PRESENT | MEDIUM — pure-function classifier; performance depends on caller's loader |
| **Cash Flow** | `reports/cash-flow-forecast.js` + `reporting/cashflow-waterfall.js` + `finance/cashflow-forecast.js` | PRESENT (3x — divergence risk) | HIGH — N-day loop with no chunking |
| **AR Aging** | `finance/aging-reports.js` (v2) + `aging.js` (legacy) | PRESENT | HIGH — operates on full invoice array in memory |
| **AP Aging** | same module (`apAging`) | PRESENT | HIGH — same memory-bound shape |
| **Inventory** | `reports/inventory-valuation.js` | PRESENT | CRITICAL — FIFO/LIFO walk over all movements is O(N²) for large item counts |
| **Payroll** | `payroll-autonomous/src/components/ReportsDashboard.tsx` | PARTIAL — UI only, no real query layer | UNKNOWN — would inherit from API layer |

---

## 3. Slow-Query Risk Analysis (large-data scenarios)

### 3.1 P&L Report — `pnl-report.js` lines 220-265

```js
async function safeSelect(table, cols, fromCol = 'issue_date') {
  const { data, error } = await supabase
    .from(table)
    .select(cols)
    .gte(fromCol, start)
    .lte(fromCol, end);
  // NO .limit(), NO pagination, NO cursor
}
```

**Findings:**
- Five parallel unbounded `SELECT`s on `customer_invoices`, `tax_invoices`, `payroll_runs`, `gl_entries`, `transactions`.
- For an annual P&L on a mid-size company (~500K GL entries / 50K invoices), Supabase's default response cap (1000 rows) silently truncates — producing a CORRECT-LOOKING but UNDERSTATED P&L.
- No index hint on `(issue_date, status)` / `(entry_date, account_code)` is verified.
- All 5 datasets are held in memory simultaneously; on an annual run for a multi-entity tenant this can exceed Node default heap.

### 3.2 Aging Reports — `aging-reports.js`

- `arAging(invoices, asOfDate, {buckets})` operates on a fully-materialized array.
- `concentrationRisk(invoices)` re-iterates the same array (O(N) but doubled memory).
- `topDelinquents(invoices, limit, asOf)` sorts the entire collection before slicing — sorting in DB (`ORDER BY due_date LIMIT N`) would be far cheaper.
- No streaming / chunked iteration. A tenant with 1M open invoices would OOM.

### 3.3 Inventory Valuation — `inventory-valuation.js`

- FIFO/LIFO requires a chronological walk per SKU. For a warehouse with 50K SKUs × 100 movements/SKU, naive implementation is O(items × movements) = 5M ops.
- Falls back to "reconstruct item flow from invoices + POs" when the `inventory_movements` table is missing — this is an N×M join in memory.
- Commodity-pricing layer (`COMMODITY_ALIASES`) is inline; no LME quote cache.

### 3.4 Cash Flow Forecast

- Three engines exist (`reports/cash-flow-forecast.js`, `reporting/cashflow-waterfall.js`, `finance/cashflow-forecast.js`) — divergence risk.
- N-day projection iterates day-by-day; for a 365-day horizon with 10K open AR and 5K open AP, the inner loop is 365 × 15K = 5.5M evaluations per scenario × 3 scenarios.

### 3.5 BI Dashboard backend (referenced by AG-99)

- `AG-99-bi-dashboard.md` (lines 270-308) explicitly defers the data endpoint:
  > "The backend endpoints (`/api/bi/dashboard`, `/api/bi/dashboard/pdf`) are out of scope for this task and should be implemented by the server agent."
- **Grep for `/api/bi/dashboard` in `api-server/` and `onyx-procurement/src/`: zero hits.** The BI dashboard frontend has NO server endpoint.

---

## 4. Caching, Indexing, Materialized Views

| Concern | State |
|---------|-------|
| Result caching in any report | NONE — `cache|memoiz|invalidat` in `onyx-procurement/src/reports/`: 0 matches |
| Pagination | Partial — only `cash-flow-forecast.js` (3 hits), `quarterly-tax-report.js` (6 hits). P&L, BS, aging, inventory: 0 |
| Materialized views | NOT FOUND in `supabase/migrations/` for any report-feeding aggregate |
| Slow-query log | EXISTS — `onyx-procurement/src/db/query-analyzer.js` writes `logs/slow-queries.jsonl` at >500ms (env `ONYX_SLOW_QUERY_MS`). NOT integrated into report code paths. |
| Connection pool | EXISTS — `onyx-procurement/src/db/pool-config.js`. Reports go through Supabase REST, not the pool. |

---

## 5. Architectural Issues

1. **Three locations for reports** — `src/reports/` (operational), `src/reporting/` (analytical), `src/finance/` (aging/cashflow). Naming overlap (`cash-flow-forecast.js` exists in two of three). A consumer asking "where is the cash-flow report?" gets three different answers.
2. **Mock data in payroll dashboard** — `ReportsDashboard.tsx` lines 33-61 hardcodes `MOCK_PAYROLL`, `MOCK_PROJECTS`, `MOCK_SUPPLIERS`, `MOCK_PL`. Not wired to any real API.
3. **BI Dashboard API gap** — `BIDashboard.jsx` (AG-99) calls `/api/bi/dashboard`. No matching server route exists in this repo.
4. **No CSV/Excel pipeline for aging** — only `exportCSV` is documented; no Excel/PDF for AR/AP aging despite P&L having all three.
5. **Test coverage uneven** — `pnl-report.test.js`, `cash-flow-forecast.test.js`, `inventory-valuation.test.js`, `management-dashboard-pdf.test.js` exist. **No** test files for `quarterly-tax-report.js`, `aging-reports.js`, `aging.js`, `bad-debt-provision.js`.

---

## 6. Compliance with `CLAUDE.md`

| Rule | Status |
|------|--------|
| Bilingual (Hebrew + English) | OK — every module headers + glossaries are bilingual |
| Israeli compliance (Form 6111, NIS, IL fiscal year) | OK — `balance-sheet.js`, `pnl-drilldown.js`, `budget-actual.js` all enforce |
| Append-only ("לא מוחקים רק משדרגים") | OK — explicit guards in `aging-reports.js`, `pnl-drilldown.js`, etc. |
| Audit log on every line | OK — `pnl-report.js` line-level `audit[]`; `aging-reports.js` write-offs appended |
| Master-flow integration | PARTIAL — reports do not subscribe to `pipeline-engine.js` events; not surfaced in 9 Master 360 pages spec |

---

## 7. Recommendations (priority order)

1. **P0 — Implement `/api/bi/dashboard` server route.** AG-99 frontend currently calls nowhere. Block on a server agent.
2. **P0 — Add `.limit()` + range pagination to `pnl-report.js#safeSelect`.** Switch to `.range(0, 9999)` cursor loop or push aggregation to Postgres via RPC.
3. **P0 — Promote heavy reports to materialized views.** `mv_gl_monthly_summary`, `mv_ar_aging_snapshot`, `mv_inventory_layers_fifo`. Schedule nightly refresh; keep raw queries as drill-down only.
4. **P1 — Consolidate 3 cash-flow modules.** Pick canonical (`reports/cash-flow-forecast.js`); have others import or be deprecated stubs.
5. **P1 — Replace `MOCK_PAYROLL` in `ReportsDashboard.tsx`** with real fetch from `api-server/src/routes/israeli-payroll.ts`.
6. **P1 — Wrap report queries in `query-analyzer.js#measure`** so slow runs land in `slow-queries.jsonl`. The infra exists; reports just don't use it.
7. **P1 — Stream aging output**. Convert `arAging` / `apAging` to async iterables that pull pages of 5K invoices.
8. **P2 — Add tests for `aging-reports.js`, `quarterly-tax-report.js`, `bad-debt-provision.js`.** Use `node --test`; mirror existing pattern.
9. **P2 — Cache LME commodity quotes** in `inventory-valuation.js` (24h TTL) instead of recomputing per report run.
10. **P2 — Add report-level RBAC.** Currently any caller with a Supabase key can run a full-year P&L. Wire through `auth/rbac.js`.

---

## 8. Verdict

The reporting engine has **all seven required reports implemented** with strong domain logic (Israeli Form-6111 mapping, NIS formatting, bilingual output, audit trails, append-only discipline). However:

- Performance has **NOT** been engineered for large tenants — no pagination, no caching, no materialized views.
- The BI dashboard frontend (AG-99) is **orphaned** without its server endpoint.
- Three divergent module locations and one duplicate cash-flow engine create maintenance debt.
- Payroll reporting is UI-only with mock data.

**GO with caveats:** Safe for the demo / SMB tier (≤10K invoices, ≤1K SKUs). **NOT ready** for the "3000 businesses / 3B users" target referenced in commit `7a02049`. P0/P1 actions above are prerequisites for that scale.

---

## Files Referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-99-bi-dashboard.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reports\pnl-report.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reports\cash-flow-forecast.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reports\inventory-valuation.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\balance-sheet.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\cashflow-waterfall.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\pnl-drilldown.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\budget-actual.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\finance\aging-reports.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\db\query-analyzer.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\components\ReportsDashboard.tsx`
