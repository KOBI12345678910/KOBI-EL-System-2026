# AGENT-122 - Dashboards Audit

**Scope:** `dashboard_layouts` table (3 rows) + Executive Dashboard + Real-time Hub + BI / Master-Health board
**Sources read:** `supabase/migrations/00021_dashboard_tables.sql`, `00022_dashboard_rpcs.sql`, `00006_read_models_and_360_rpcs.sql`, `00015_read_model_views.sql`, `00061_analytics_domain_complete.sql`; `onyx-procurement/src/reporting/executive-dashboard.js`; `onyx-procurement/src/realtime/sse-hub.js`; `onyx-procurement/src/ops/master-dashboard.js`; `onyx-procurement/web/onyx-dashboard.jsx`; `_qa-reports-25/AGENT-09-db-integrity.md`.
**Date:** 2026-04-29

## Status

**AMBER.** Three independent dashboard stacks coexist with NO single owner:

1. `analytics.dashboard_*` (boards / widgets / board_widgets / user_dashboard_boards) - 5 boards seeded, 9 widgets, 4 widgets wired only to `executive_main`. Migrations 00021/00022 + 00061.
2. `public.dashboard_layouts` (the table the question asked about) - **orphan**, no migration creates it, no FK in or out, RLS DISABLED, 3 rows are unmanaged.
3. Server-rendered HTML boards: `src/reporting/executive-dashboard.js` (Y181) and `src/ops/master-dashboard.js` (X-96). Neither reads from `analytics.dashboard_*`. Both build snapshots from in-process source registries.

## Layouts-table

`public.dashboard_layouts` appears in AGENT-09 in two lists:
- Orphaned tables (no FKs in or out) - AGENT-09 lines 37-38, line 58.
- RLS DISABLED on 59 production tables - AGENT-09 line 58.

No `create table dashboard_layouts` exists anywhere in `supabase/migrations/`, `onyx-procurement/db`, `_master-registry`, or `_audit_tmp`. The 3 rows in production are unrooted. Migration 00078 (per AGENT-09 plan) is supposed to enable RLS owner-scoped on it, but the schema itself is undefined in source. **Action: either drop the table or write a migration creating it explicitly with `user_id` + `layout_jsonb` and FK to `governance.users_profile`.**

The canonical layout container in source is `analytics.dashboard_board_widgets` (00021). This is the table real code uses. `dashboard_layouts` looks like a leftover from an early POC.

## Executive-dashboard

Two implementations, neither aware of the other:

### A. SQL-side (`analytics.get_dashboard_board('executive_main')`)
Defined in 00022. Returns `{board_code, board_name, widgets:[...]}` with widgets:

| order | widget_code | title | grid (W x H) |
|------|------|------|------|
| 1 | `executive_total_revenue` | Total Revenue | 3 x 2 |
| 2 | `finance_overdue_amount` | Overdue Amount | 3 x 2 |
| 3 | `procurement_pending_approvals` | Pending Approvals | 3 x 2 |
| 4 | `recommendation_queue` | Recommendation Queue | 6 x 4 |

Data dispatcher `analytics.get_dashboard_widget_data(p_widget_code, p_config)` reads from `analytics.v_executive_summary`, `v_finance_summary`, `v_procurement_summary`, `v_operations_summary`, `v_workforce_summary`, `v_ai_summary`, `v_ai_recommendation_queue`, `execution.alerts`, `analytics.rm_procurement_overdue_pos`. Two of those (`v_ai_recommendation_queue`, `rm_procurement_overdue_pos`) are referenced by the RPC but **no migration creates them** -> grep on `supabase/migrations` returns zero matches. The RPC will error on those two widget codes at runtime.

`v_executive_summary` is also defined twice: as a regular view in 00006 and as `mv_executive_summary` (materialized) in 00015 - the dispatcher uses the view, the matview is refreshed by `analytics.refresh_all_materialized_views()` but no cron schedule exists in any migration.

### B. JS-side (`onyx-procurement/src/reporting/executive-dashboard.js`)
843 LOC, agent Y181, zero deps. Class `ExecutiveDashboard` with 16 KPI catalogue (revenue, grossMargin, opEx, ebitda, cashPosition, backlog, aging, workforce, openRFQs, openWOs, safetyIncidents, qualityPPM, onTime, npsScore, churnRate, topRisks). Server-side aggregator only - no DOM, no fetch, no SQL. KPIs come from in-process source fetchers registered via `registerSource(name, fn)`. Outputs bilingual (he/en) snapshot with Palantir-dark theme tokens, target evaluation (`on`/`warn`/`off`/`unknown`), and trend vs prior snapshot. No HTTP route mounts it.

**Gap:** the JS `ExecutiveDashboard` is never invoked from any route or CLI in `onyx-procurement/src/`. `Promise.allSettled` -> ok pattern is solid but the module is dead code from an end-user perspective.

## Real-time

There is no widget board called "real-time dashboard". The realtime layer is `onyx-procurement/src/realtime/sse-hub.js` - a zero-dep SSE hub with channels `invoices`, `payments`, `inventory`, `alerts`, `system_health`. Ring buffer 1000, heartbeat 30s, max client queue 500.

- No dashboard board consumes this hub. The `executive_main` widgets above are pull-only via RPC.
- Frontend `onyx-procurement/web/onyx-dashboard.jsx` polls `/api/status`, `/api/suppliers`, `/api/purchase-orders`, `/api/rfqs`, `/api/analytics/savings` every 30s via `setInterval` - not SSE. `vat-dashboard.jsx` polls every 60s. `bank-dashboard.jsx` 30s.
- `web/index.html` polls health every 30s + tick every 1s.
- `web/status.html` uses `POLL_MS` constant.

**Action:** wire `executive_main` widgets to `sse-hub` `alerts` + `system_health` so the recommendation queue and alerts feed update without polling.

## BI-dashboard

The closest thing to a BI board is `onyx-procurement/src/ops/master-dashboard.js` (1002 LOC, agent X-96):

- Aggregates 11 signals (`prom`, `slo`, `incidents`, `errorBudget`, `alerts`, `errors`, `deps`, `resources`, `uptime`, `logs`, `canary`, `services`).
- Renders pure-SVG charts (no chartlib), Palantir-dark theme, RTL/LTR bilingual.
- Auto-refresh: `<meta http-equiv="refresh" content="30"/>` injected by `_renderHtml()`. Default `refreshSec = 30`. Heavy - reloads the whole page, no diffing.
- Public API: `generateMasterDashboard(signals)`, `dashboardJSON(signals)`, `middleware([getSignals])`, `attach(app, opts)`.
- Mount point `/ops/dashboard`. No auth wired in the file; relies on caller.

The `analytics.kpi_definitions`, `report_definitions`, `report_runs`, `drilldown_paths` registry tables exist (00061) but no UI reads them. There is no entry in `dashboard_boards` for "BI" or "ops_main" beyond the seed `operations_main`, `procurement_main`, `workforce_main`, `ai_main` which all have ZERO board_widget rows (only `executive_main` was seeded).

## Widgets-cadence

| Surface | Refresh | Mechanism |
|------|------|------|
| Server HTML master-dashboard | 30s | `<meta http-equiv="refresh">` |
| Web onyx-dashboard.jsx | 30s | `setInterval(refresh, 30000)` |
| Web bank-dashboard.jsx | 30s | `setInterval` |
| Web vat-dashboard.jsx | 60s | `setInterval` |
| Web index.html health | 30s | `setInterval(checkHealth, 30000)` |
| Web index.html clock | 1s | `setInterval(tick, 1000)` |
| sse-hub heartbeat | 30s | SSE comment `:hb` |
| `mv_executive_summary` refresh | manual | `analytics.refresh_all_materialized_views()` - no cron |
| `analytics.dashboard_widgets` data | on-demand | `get_dashboard_widget_data` per call |

No board consumes a push channel. No matview is on a schedule. `executive_total_revenue` widget hits the regular `v_executive_summary` view (recomputed every call) instead of the matview.

## Performance

1. `v_executive_summary` (00006) does 7 correlated subselects per call across `finance.invoices`, `execution.projects`, `execution.alerts`, `procurement.purchase_orders`. With the 4-widget `executive_main` board calling `get_dashboard_widget_data` four times, each user open = 4 RPC -> ~28 subselects. The matview `mv_executive_summary` (00015) exists for this but is unused by the dispatcher.
2. `recommendation_queue` widget reads `v_ai_recommendation_queue` which is **not defined in any migration** - widget will fail at runtime.
3. `procurement_overdue_pos_feed` widget reads `analytics.rm_procurement_overdue_pos` - **not defined**.
4. AGENT-09 reports 167 FK columns without indexes; widgets join across schemas -> seq scans likely on `execution.alerts`, `finance.invoices.state`, `procurement.purchase_orders.state`.
5. The 30s polling on 4 React dashboards each fanning out to 5-6 endpoints = ~24 requests / 30s / user. Replace with `sse-hub` push for the top-3 KPIs.

## Issues

1. `public.dashboard_layouts` is an orphan with 3 production rows, no schema in source, no RLS - data integrity and tenancy unknown.
2. `analytics.v_ai_recommendation_queue` and `analytics.rm_procurement_overdue_pos` are referenced by widget RPC but never created in any migration. Two of nine seeded widgets are broken on day one.
3. `mv_executive_summary` exists but the dispatcher uses the live view; no cron refreshes the matview.
4. JS `ExecutiveDashboard` (Y181, 843 LOC) has no route binding and no caller.
5. Boards `operations_main`, `procurement_main`, `workforce_main`, `ai_main` are seeded with names but ZERO widgets wired. They render empty.
6. Web dashboards poll every 30-60s instead of subscribing to `sse-hub`.
7. Master-dashboard relies on full-page meta-refresh; loses scroll/state every 30s.

## Fixes

- M-A: drop `public.dashboard_layouts` OR write `0008x_create_dashboard_layouts.sql` with `user_id bigint references governance.users_profile(id)`, `layout_jsonb jsonb`, RLS owner-scoped.
- M-B: add the missing `analytics.v_ai_recommendation_queue` view (over `intelligence.decision_recommendations`) and `analytics.rm_procurement_overdue_pos` (over `procurement.purchase_orders` filtered to overdue).
- M-C: switch `executive_total_revenue` widget to `mv_executive_summary` and add a pg_cron job calling `analytics.refresh_all_materialized_views()` every 5 min.
- M-D: seed `dashboard_board_widgets` for the 4 empty boards, mirroring the `executive_main` shape.
- M-E: wire `web/onyx-dashboard.jsx` to `sse-hub` for `alerts` and `system_health`; keep 30s poll only as fallback.
- M-F: mount `ExecutiveDashboard` (Y181) behind `GET /api/reporting/executive-dashboard` so the 16-KPI bilingual snapshot is reachable.
- M-G: replace `<meta http-equiv="refresh">` in master-dashboard with `EventSource` + DOM patching.

## Verdict

The dashboard subsystem has good pieces (Y181 KPI catalog, X-96 master health, SSE hub, widget table model) but they are not wired to one another. The `dashboard_layouts` table the audit names is an orphan, and 2 of 9 production widgets reference views that do not exist. Ship M-B and M-A first; M-E and M-C as the next sprint. Until those land, calling `executive_main` returns partial data and any user reading `dashboard_layouts` is reading 3 rows nobody manages.
