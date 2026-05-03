# AGENT-255 — Per-Role Dashboards Gap Analysis

**Agent:** 255 (MISSING PIECES #5)
**Date:** 2026-04-29
**Scope:** Per-role dashboards (CEO, CFO, COO, Sales, HR, Production) — expected vs. actually built
**Built on:** AGENT-122 (dashboard subsystem) + AGENT-180 (reporting engine)
**Verdict:** AMBER — 4 of 6 roles have a dedicated dashboard; CFO and COO have no canonical role-page despite extensive supporting infrastructure. Even the 4 that exist suffer from mock-data fallbacks, fragmented backends, and missing real-time push.

---

## 1. Per-Role Inventory Matrix

| Role | Expected Page | Built? | Path | Backend Endpoint | Real Data? |
|------|---------------|--------|------|------------------|------------|
| **CEO** | `/executive/ceo-dashboard` | YES | `erp-app/src/pages/executive/ceo-dashboard.tsx` (475 LOC) | `GET /api/executive/ceo-dashboard` (in `executive-control.ts`) + `GET /api/dashboard` (in `ceo-control-tower.ts`) + `GET /api/executive/scorecard` (in `executive-scorecard.ts`) | LIVE — 26 parallel `pool.query` against real tables |
| **CFO** | `/finance/dashboard` | NO dedicated CFO role page | `erp-app/src/pages/finance/finance-dashboard.tsx` (function: 6 finance KPIs) — NOT framed as CFO; **all hardcoded** `CASH_FLOW_DATA`, `TOP_CUSTOMERS`, `TOP_SUPPLIERS`, `OVERDUE_INVOICES`, `BANK_ACCOUNTS` | NO `/api/cfo/*` endpoint exists; `/api/cashflow/dashboard` and `/api/ap-ar/dashboard` exist piecemeal | NO — page is 100% mock |
| **COO** | `/operations/oee-dashboard` or equivalent | NO dedicated COO page | `erp-app/src/pages/operations/oee-dashboard.tsx` (production-OEE only, not COO-spanning) | NO `/api/coo/*` endpoint | Mostly mock fallbacks (`FALLBACK_PRODUCTION_LINES`, `FALLBACK_MACHINE_UPTIME`) |
| **Sales** | `/sales/dashboard` | YES | `erp-app/src/pages/sales/sales-dashboard.tsx` (~430 LOC) | `GET /api/sales/sales_dashboard` (route NOT FOUND in api-server grep) — page falls back | PARTIAL — `kpis` constant is hardcoded; `pipelineStages`, `topDeals`, `recentOrders`, `salesTeam` all use `FALLBACK_*` constants |
| **HR** | `/hr/dashboard` | YES | `erp-app/src/pages/hr/hr-dashboard.tsx` (~250 LOC) | `GET /api/hr-summary` + `GET /api/hr/dashboard` | LIVE — module catalog wired; KPI block driven by real payload |
| **Production** | `/production/dashboard` | YES (3 variants — overlapping) | `production-dashboard.tsx`, `smart-factory-dashboard.tsx`, `production-command-center.tsx`, `oee-dashboard.tsx`, `cmms-dashboard.tsx`, `production-analytics.tsx` | `GET /api/work-orders`, `/api/work-orders/stats`, `/api/raw-materials`, `/api/purchase-orders` | LIVE for raw lists; KPIs and station load mostly `FALLBACK_*` |

---

## 2. Expected vs Built — KPI / Widget Detail

### 2.1 CEO Dashboard

| Expected (Master Flow + Y181 catalog) | Built |
|----------------------------------------|-------|
| Revenue (MTD/YTD, vs target, vs prior) | YES — `kpis.revenue` with `change`, `total`, sparkline |
| Gross Margin / OpEx / EBITDA | PARTIAL — only `profit` and `profitMargin` (no gross margin breakdown) |
| Cash Position | PARTIAL — `details.bankBalance` (sum of `bank_accounts.balance`) |
| Backlog (open orders / WIP) | PARTIAL — `kpis.orders` count only, no value backlog |
| AR Aging buckets (0-30/31-60/61-90/180+) | NO — only `details.invoices.overdue / overdueAmount` (single bucket) |
| Workforce / Headcount | YES — `kpis.employees` |
| Open RFQs / WOs / Quality | YES — `kpis.production`, `kpis.quality` |
| Safety incidents / Quality PPM | NO — Y181 catalog defines them; CEO page omits |
| On-time delivery / NPS / Churn | NO — Y181 catalog defines; not surfaced |
| Top risks / Strategic goals | PARTIAL — `aiInsights[]` text-only; `strategic_goals` table exists in `ceo-control-tower.ts` `/init` but not wired to the React page |
| AI Recommendations queue | NO on CEO page (lives in `analytics.dashboard_widgets` `recommendation_queue` widget — see AGENT-122 — and that widget reads from a view that does not exist) |

**Backend duplication**: CEO has THREE backends — `/api/executive/ceo-dashboard` (executive-control.ts, 26 queries with 30s cache), `/api/dashboard` (ceo-control-tower.ts, calls `company_daily_snapshot` table seeded only via `/init` with no cron), `/api/executive/scorecard` (executive-scorecard.ts, threshold-driven green/yellow/red with 60s cache). Only the first is consumed by the React page.

### 2.2 CFO Dashboard — MISSING

There is no `cfo-dashboard.tsx`. The CFO persona is implicit; the closest pages are `finance-dashboard.tsx` (mock), `fin-dashboard.tsx`, `executive-summary-page.tsx`, `financial-reports-page.tsx`, `fin-control-center.tsx`, `finance-control-center.tsx`. Together they cover:

| CFO KPI / Widget | Where Built | Status |
|-------------------|-------------|--------|
| P&L summary | `profit-loss-page.tsx` + `pnl-report.js` (AGENT-180) | EXISTS — separate page, no CFO roll-up |
| Balance Sheet | `balance-sheet.tsx` + `reporting/balance-sheet.js` | EXISTS — separate page |
| Cash Flow Forecast | `cash-flow.tsx` + `cashflow-management.tsx` + 3 backend modules (AGENT-180 §3.4 — divergence) | EXISTS — fragmented |
| AR Aging by bucket | `aging-report.tsx`, `customer-aging-page.tsx` + `finance/aging-reports.js` | EXISTS — page-only, not pinned to a CFO board |
| AP Aging by bucket | `payables-dashboard.tsx` + `apAging` in `aging-reports.js` | EXISTS — partial |
| Bank balances / treasury | `finance/institutional/treasury-dashboard.tsx` | EXISTS — institutional-grade, not wired into CFO summary |
| Risk / Ratios / VaR | `finance/institutional/risk-dashboard.tsx`, `ratio-dashboard.tsx`, `blackrock-*.tsx` | EXISTS as standalone pages |
| Budget vs Actual | `budget-vs-actual.tsx` + `reporting/budget-actual.js` | EXISTS — standalone |
| Collections | `collections-dashboard.tsx` | EXISTS |
| Profitability | `executive/profitability-dashboard.tsx`, `procurement/profitability-dashboard.tsx`, `finance/customer-profitability.tsx` | EXISTS but page calls `/api/executive/profitability` only |
| FX / Hedging | `currencies-management.tsx`, `blackrock-hedging.tsx` | EXISTS |

**Gap:** No top-level `cfo-dashboard.tsx` synthesizes any of this. The CFO must navigate between ~12 pages to build a mental model that the Y181 KPI catalog (`ExecutiveDashboard` class, AGENT-122) was designed to produce in one snapshot — yet Y181 has no route binding.

### 2.3 COO Dashboard — MISSING

No `coo-dashboard.tsx`. Operations span:

| COO KPI / Widget | Where Built | Status |
|-------------------|-------------|--------|
| OEE per line | `operations/oee-dashboard.tsx`, `production/oee-dashboard.tsx` | EXISTS — DUPLICATE; both fall back to mock data |
| Production schedule / WIP | `production-command-center.tsx`, `production-dashboard.tsx`, `dispatch-planning.tsx` | EXISTS |
| Work orders status | `production-dashboard.tsx` | EXISTS — live |
| Quality (FPY, defect rate, scrap) | `quality/quality-dashboard.tsx`, `smart-factory-dashboard.tsx` | EXISTS as separate pages, not aggregated |
| Maintenance (CMMS, MTBF, MTTR) | `production/cmms-dashboard.tsx` | EXISTS |
| Inventory health | `inventory/inventory-dashboard.tsx`, `inventory-ultra-dashboard.tsx`, `inventory-command-center.tsx`, `wms-analytics.tsx` | EXISTS — 4 overlapping pages |
| Supply chain SLAs | `supply-chain/supply-chain-dashboard.tsx`, `edi-dashboard.tsx` | EXISTS |
| Logistics / fleet | `logistics/logistics-dashboard.tsx` | EXISTS |
| EHS | `ehs/ehs-dashboard.tsx` | EXISTS |
| Capacity planning | `/api/capacity/dashboard` route exists; UI fragmented | PARTIAL |

**Gap:** no top-down COO view. AGENT-122 noted `operations_main` board in `analytics.dashboard_boards` is seeded with NAME ONLY — zero board_widgets wired to it. That is exactly the COO board, and it is empty.

### 2.4 Sales Dashboard

| Expected | Built (`sales-dashboard.tsx`) |
|----------|------------------------------|
| Revenue YTD vs target + YoY | YES — `kpis.revenueYTD` / `revenueTarget` / `revenuePrevYear` (HARDCODED — `14,850,000` etc.) |
| Pipeline funnel by stage | YES — `pipelineStages`; pulls from `/api/sales/sales_dashboard` (route NOT FOUND in api-server) — fallback used in 100% of cases |
| Top deals + probability | YES — `FALLBACK_TOP_DEALS` constant |
| Recent orders | YES — `FALLBACK_RECENT_ORDERS` constant |
| Sales team performance vs quota | YES — `FALLBACK_SALES_TEAM` constant |
| Win rate / Conversion / Avg deal cycle / NPS | YES — all in `kpis` constant |
| Win/loss trend | NO |
| Lead source mix | NO (lives in CRM dashboard) |
| Forecast (commit/best/worst) | NO — exists in `data:forecast` skill, not in this page |

**Gap:** `/api/sales/sales_dashboard` endpoint not registered. Page renders entirely from in-file constants. Real CRM data lives at `/api/crm-enterprise/dashboard`, `/api/sales/opportunities`, `/api/sales/territories/stats`, `/api/sales/commission-records/summary` — none of which this page consumes.

### 2.5 HR Dashboard

| Expected | Built |
|----------|-------|
| Headcount (total/active/on-leave/contractors) | YES — live from `/api/hr-summary` |
| Attendance today | YES — `att.present_today` |
| Pending leave requests | YES — `leaves.pending` |
| Open requisitions | YES — `recruitment.active` |
| Active trainings | YES — `training.active` |
| Average performance review score | YES — `reviews.avg_score` |
| Payroll cost MTD | NO — payroll button exists but no KPI |
| Attrition / Turnover | NO |
| Time-to-hire | NO |
| Diversity / Pay equity | NO |
| Training compliance % | NO |

**HR is the cleanest of the 4 implemented role-pages** — it actually reads live data and exposes 14 module tiles (employees, attendance, payroll, shifts, leave, training, recruitment, reviews, employee-value, contractors, departments, org-chart, benefits, AI meetings).

### 2.6 Production Dashboard — Three Overlapping Views

| Page | Purpose | Data |
|------|---------|------|
| `production-dashboard.tsx` | Operational ops view (WO status, RM, customers, team) | LIVE — fetches `/api/work-orders`, `/api/raw-materials`, `/api/purchase-orders`, `/api/hr/employees` |
| `smart-factory-dashboard.tsx` | KPI tile + station load + active WOs + alerts | MOCK — `FALLBACK_KPIS`, `FALLBACK_STATIONS`, `FALLBACK_WORK_ORDERS`, `FALLBACK_ALERTS` |
| `production-command-center.tsx` | Command-center variant | (similar pattern) |
| `oee-dashboard.tsx` (×2: `production/`, `operations/`) | OEE per line + machine uptime + performance + quality | MOCK — `FALLBACK_PRODUCTION_LINES`, `FALLBACK_MACHINE_UPTIME`, etc. |
| `cmms-dashboard.tsx` | Maintenance work orders | (separate) |
| `production-analytics.tsx` | Trend analysis | (separate) |

**Gap:** Production is the OPPOSITE problem of CFO/COO — too many overlapping pages, no canonical entry. KPIs computed in `smart-factory-dashboard.tsx` (open orders, delayed jobs, station load %, defect today, machine downtime, on-time completion) are exactly what a Production Manager needs but they are hardcoded.

---

## 3. Backend Coverage Summary

| Role | Single-Endpoint Roll-up Exists? | Cache | Real-Time |
|------|----------------------------------|-------|-----------|
| CEO | YES (3 different ones — duplication risk) | 30-60s in-memory | NO (no SSE) |
| CFO | NO — must call 8+ separate routes | per-route | NO |
| COO | NO — must call 6+ separate routes | per-route | NO |
| Sales | endpoint name referenced (`/api/sales/sales_dashboard`) but NOT REGISTERED | n/a | NO |
| HR | YES (`/api/hr-summary` + `/api/hr/dashboard`) | none | NO |
| Production | partial (`/api/work-orders/stats`) — KPI tiles use mocks | none | NO |

The `analytics.dashboard_boards` system (AGENT-122) was designed to be the role-board layer:
- `executive_main` — wired (4 widgets, 2 broken — see AGENT-122)
- `operations_main` — empty (would be COO)
- `procurement_main` — empty (would be CPO)
- `workforce_main` — empty (would be HR/CHRO)
- `ai_main` — empty

So the SCHEMA exists for per-role dashboards. The DATA does not.

---

## 4. Cross-Cutting Issues (extends AGENT-122 / AGENT-180)

1. **No CFO/COO role-pages.** The 360-page spec requires a top-level synthesis per persona. Today, only CEO, Sales, HR, Production exist (with caveats above).
2. **Mock data is the rule, not the exception.** Sales, Production-Smart-Factory, OEE, Finance, Payroll Reports — all default to in-file `FALLBACK_*` / `MOCK_*` constants. AGENT-180 §5 already flagged `ReportsDashboard.tsx`. This audit shows the pattern is system-wide.
3. **Empty role boards.** `operations_main`, `procurement_main`, `workforce_main`, `ai_main` boards in `analytics.dashboard_boards` have ZERO widgets seeded.
4. **Three overlapping CEO backends.** `/api/executive/ceo-dashboard`, `/api/dashboard` (control-tower), `/api/executive/scorecard`. Each computes overlapping KPIs (revenue, expenses, AR, AP, cash, employees). Needs consolidation.
5. **No live push for any role.** All 4 implemented dashboards poll on `setInterval(60000)` or have no auto-refresh. AGENT-122 §Real-time noted the `sse-hub` exists but no board consumes it.
6. **Y181 ExecutiveDashboard 16-KPI catalog is dead code.** AGENT-122 §A.B noted no route mounts the `ExecutiveDashboard` class. It would solve much of the CEO-CFO gap if exposed.
7. **`company_daily_snapshot` table is seeded by ad-hoc `/init` POST.** No cron, no automated snapshotting. After the first day, the CEO control-tower `/api/dashboard` returns stale data unless someone calls `POST /api/init`.
8. **Strategic Goals table exists, never reaches CEO UI.** `strategic_goals` defined in `ceo-control-tower.ts/init` and queried by `/api/dashboard` but the React `ceo-dashboard.tsx` never displays them.
9. **Production duplicates `oee-dashboard.tsx` in two folders** (`production/`, `operations/`). Same content, divergent over time.

---

## 5. Recommendations (priority order)

| # | Pri | Action |
|---|-----|--------|
| 1 | P0 | Build `cfo-dashboard.tsx` at `/finance/cfo` synthesizing P&L summary, BS ratios, cash position, AR/AP aging buckets, budget vs actual, top variances. Wire to single `/api/finance/cfo-dashboard` that aggregates the existing reports |
| 2 | P0 | Build `coo-dashboard.tsx` at `/operations/coo` synthesizing OEE (rolled up), WO health, inventory alerts, supply-chain SLAs, EHS incidents, capacity utilization. Wire to `/api/operations/coo-dashboard` |
| 3 | P0 | Register `GET /api/sales/sales_dashboard` (currently 404) so `sales-dashboard.tsx` stops falling back to constants |
| 4 | P0 | Replace `kpis = {revenueYTD: 14850000, ...}` constant in `sales-dashboard.tsx` and `FALLBACK_*` arrays with live queries |
| 5 | P1 | Mount the Y181 `ExecutiveDashboard` class behind `/api/reporting/executive-dashboard` (AGENT-122 fix M-F) and consume it from `ceo-dashboard.tsx` to add the 8 missing CEO KPIs (gross margin, EBITDA, on-time, NPS, churn, safety, quality PPM, top risks) |
| 6 | P1 | Seed `dashboard_board_widgets` for `operations_main`, `procurement_main`, `workforce_main`, `ai_main` (AGENT-122 fix M-D). Wire React role-pages to these boards |
| 7 | P1 | Pick canonical OEE page; redirect duplicates to single source |
| 8 | P1 | Pick canonical CEO backend; deprecate the other two (control-tower, scorecard, executive-control are 80% overlap) |
| 9 | P1 | Replace hardcoded `MOCK_PAYROLL`, `MOCK_PROJECTS`, `MOCK_SUPPLIERS`, `MOCK_PL` in `ReportsDashboard.tsx` with live API |
| 10 | P2 | Consume `sse-hub` channels in role pages for `alerts`, `system_health` (AGENT-122 fix M-E) so role boards update without polling |
| 11 | P2 | Add cron for `company_daily_snapshot` so CEO control-tower data is current without manual `/init` |
| 12 | P2 | Surface `strategic_goals` table on `ceo-dashboard.tsx` |
| 13 | P2 | Add Sales forecast (commit/best/worst), win/loss trend, lead source mix to Sales dashboard |
| 14 | P2 | Add HR attrition, time-to-hire, payroll-cost-MTD, training compliance to HR dashboard |
| 15 | P2 | Promote production KPI tiles in `smart-factory-dashboard.tsx` to real queries |

---

## 6. Verdict

**4 of 6 role dashboards exist** (CEO, Sales, HR, Production); **2 are missing** (CFO, COO). Of the 4 that exist:
- 1 is genuinely live (HR)
- 1 is partly live (CEO — but with 8 missing KPIs and dead Y181 catalog)
- 1 falls back to mock data on every load (Sales)
- 1 has 3+ overlapping versions, half live, half mock (Production)

The infrastructure is in place: `analytics.dashboard_boards`, Y181 KPI catalog, sse-hub, master-dashboard, multiple per-role API endpoints, `company_daily_snapshot` table. They are not wired to one another.

**Ship P0 items 1-4 first** (CFO page, COO page, register sales endpoint, kill sales mocks). That closes the role-coverage gap. Then P1 items 5-9 to consolidate backends and de-duplicate UI. P2 items add depth.

---

## Files Referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-122-dashboards.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-180-reporting.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\executive\ceo-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\sales\sales-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\hr\hr-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\production\production-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\production\smart-factory-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\production\oee-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\operations\oee-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\finance-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\executive\profitability-dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\ceo-control-tower.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\executive-control.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\executive-scorecard.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00021_dashboard_tables.sql`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\reporting\executive-dashboard.js` (Y181 — dead code)
