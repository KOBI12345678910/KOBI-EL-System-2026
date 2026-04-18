# DOMAIN — analytics

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `analytics` |
| Source (derived) | `connection_matrix.json`, `dashboards_registry.json`, `reports_registry.json` |
| Evidence | `B-E013` `B-E015` INVISIBLE_MENU_ITEMS §domain_analytics |

## 1. domain_checklist

### expected_models (derived from connection_matrix.json)
dashboard_definitions, dashboard_widgets, dashboard_boards, dashboard_board_widgets, user_dashboard_boards, kpi_snapshots, read_model_invalidations, rm_executive_summary, rm_finance_summary, rm_operations_summary, rm_procurement_summary, rm_workforce_summary, rm_ai_summary — plus planned: dashboards(alias→dashboard_definitions), kpi_definitions, reports(registry), report_sources, scorecards, scenario_models, forecast_models(alias→intelligence.forecast_models)

### required_pages
DashboardsList, DashboardEditor, DashboardViewer (per dashboard), ReportsList, ReportViewer, KPIDefinitionsAdmin (planned), ScorecardsList, ScenarioModelsPage (planned)

### required_forms
NewDashboard, EditDashboard, NewReport, NewKPI, NewScenario

### required_routes
`/analytics`, `/analytics/dashboards`, `/analytics/dashboard/:id`, `/analytics/reports`, `/analytics/report/:id`, `/analytics/kpis`, `/analytics/scorecards`, `/analytics/scenarios`

### required_reports
(the reports themselves — see reports_registry.json 20 entries)

### required_dashboards
(the dashboards themselves — see dashboards_registry.json 10 entries)

### required_flows
- read-model refresh cron (rm_* tables)
- KPI snapshot capture cron

### critical_relations
- dashboard_definitions 1—* dashboard_widgets; dashboards mapped to dashboard_boards via user_dashboard_boards
- rm_* read-models are materialized from operational tables via analytics RPCs
- reports bind to read-models or direct tables via report_sources

### completion_gate
- 0% menu coverage per INVISIBLE_MENU_ITEMS — **domain gate failure**
- every rm_* has internal_only decision recorded
- every registry dashboard binds to a live source (currently 10 broken per D015)

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables analytics.* | 13 |
| Registry models | 1 full + 9 partial |
| API routers | 6 |
| Pages | 8 (most via /dashboards root) |
| Menu entries | 0 in /analytics |
| Dashboards in registry | 10 |
| Reports in registry | 20 |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | kpi_definitions, report_sources, scenario_models, scorecards(also in procurement) |
| **built_internal_only** | rm_ai_summary, rm_executive_summary, rm_finance_summary, rm_operations_summary, rm_procurement_summary, rm_workforce_summary, kpi_snapshots, read_model_invalidations |
| **built_not_exposed (red)** | dashboard_definitions, dashboard_widgets (dup with governance — D003 resolve), dashboard_boards, user_dashboard_boards, dashboard_board_widgets |
| **broken** | 10 dashboards D015; 14/20 reports hidden |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | create `/analytics` menu root; wire DashboardsList |
| build_now | KPIDefinitionsAdmin, ReportsAdmin, ScorecardsList |
| internal_only | rm_* family + kpi_snapshots + read_model_invalidations |
| postpone | scenario modeling v2 |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/13 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 22 |
| business_readiness | blocked |
| gate_status | blocked — no analytics menu root |
| red rows | 5 |
