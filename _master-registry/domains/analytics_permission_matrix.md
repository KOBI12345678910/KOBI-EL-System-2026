# Analytics Permission Matrix (Domain Batch 00061/00062)

Generated: 2026-04-18
Scope: analytics domain — canonical tables (dashboard_*, kpi_*, report_*,
drilldown_paths, read_model_invalidations, custom_metrics, rm_*) — RLS
baseline + RBAC mapping.

## 1. Role inventory

| role_code | label_he | domain scope |
|---|---|---|
| `analytics_viewer`   | צופה אנליטיקה    | READ on all analytics surfaces; can run existing reports |
| `analytics_analyst`  | אנליסט אנליטיקה  | READ all; CRUD on kpi_snapshots, custom_metrics; trigger compute + reprocess |
| `analytics_admin`    | מנהל אנליטיקה    | CRUD on dashboards/widgets/reports/kpi_definitions/drilldown_paths; export |
| `super_admin`        | מנהל מערכת       | All DELETE + full config |

## 2. Matrix (per endpoint)

All endpoints mount under `/api/analytics/…`. `R` = read, `C` = create,
`U` = update, `D` = soft-delete, `A` = action endpoint.

| Endpoint / Model | Viewer | Analyst | Admin | SuperAdmin |
|---|---|---|---|---|
| `GET /dashboards`                          | R | R | R | R |
| `GET /dashboards/:id`                      | R | R | R | R |
| `POST /dashboards`                         | — | — | C | C |
| `PUT /dashboards/:id`                      | — | — | U | U |
| `DELETE /dashboards/:id`                   | — | — | D | D + hard |
| `POST /dashboards/:id/widgets`             | — | — | A | A |
| `POST /dashboards/:id/export`              | A | A | A | A |
| `GET /dashboard-widgets`                   | R | R | R | R |
| `POST /dashboard-widgets`                  | — | — | C | C |
| `PUT /dashboard-widgets/:id`               | — | — | U | U |
| `DELETE /dashboard-widgets/:id`            | — | — | D | D |
| `GET /reports`                             | R | R | R | R |
| `GET /reports/:id`                         | R | R | R | R |
| `POST /reports`                            | — | — | C | C |
| `PUT /reports/:id`                         | — | — | U | U |
| `DELETE /reports/:id`                      | — | — | D | D + hard |
| `POST /reports/:id/run`                    | A | A | A | A |
| `GET /reports/runs/list`                   | R | R | R | R |
| `PUT /reports/runs/:id`                    | — | U (status,err,metadata) | U | U |
| `GET /kpi-definitions`                     | R | R | R | R |
| `GET /kpi-definitions/:id`                 | R | R | R | R |
| `POST /kpi-definitions`                    | — | — | C | C |
| `PUT /kpi-definitions/:id`                 | — | — | U | U |
| `DELETE /kpi-definitions/:id`              | — | — | D | D |
| `POST /kpi-definitions/:id/compute`        | — | A | A | A |
| `GET /kpi-snapshots`                       | R | R | R | R |
| `POST /kpi-snapshots`                      | — | C | C | C |
| `PUT /kpi-snapshots/:id`                   | — | U | U | U |
| `DELETE /kpi-snapshots/:id`                | — | — | D | D |
| `GET /drilldown-paths`                     | R | R | R | R |
| `POST /drilldown-paths`                    | — | — | C | C |
| `PUT /drilldown-paths/:id`                 | — | — | U | U |
| `DELETE /drilldown-paths/:id`              | — | — | D | D |
| `GET /read-model-invalidations`            | R | R | R | R |
| `POST /read-model-invalidations`           | — | C | C | C |
| `PUT /read-model-invalidations/:id`        | — | U | U | U |
| `DELETE /read-model-invalidations/:id`     | — | — | D | D |
| `POST /read-model-invalidations/:id/reprocess` | — | A | A | A |
| `GET /custom-metrics`                      | R | R | R | R |
| `POST /custom-metrics`                     | — | C | C | C |
| `PUT /custom-metrics/:id`                  | — | U | U | U |
| `DELETE /custom-metrics/:id`               | — | — | D | D |
| `GET /rm-summaries/:kind`                  | R | R | R | R |

## 3. RLS (row-level security) — baseline policies

Applied to all NEW analytics tables in 00061 Part F:

- `<tbl>_select_auth` — SELECT to any authenticated user
- `<tbl>_insert_auth` — INSERT to any authenticated user (role filtering at API layer)
- `<tbl>_update_auth` — UPDATE to any authenticated user (role filtering at API layer)

API layer (`api-server/src/routes/analytics/*`) protects all mutations via
`authMiddleware`; role-level checks are enforced at the application level
per the matrix above. All SQL construction flows through
`_safe-list-helpers.ts` — no user input is ever spliced via `sql.raw`.

## 4. Status lifecycles (CHECK constraints)

- `report_run.status ∈ {queued, running, complete, failed}`
- `read_model_invalidation.status ∈ {pending, processed, skipped}`
- `kpi_definition.comparison_type ∈ {higher_is_better, lower_is_better, within_range, exact_match}`
- `report_definition.output_format ∈ {table, csv, pdf, json, xlsx}`

## 5. Route → Zod → table → page cross-reference

| page | route | primary model | zod module |
|---|---|---|---|
| DashboardsListPage             | /dashboards                | dashboard_boards             | `analytics/dashboards.ts` |
| DashboardBuilderPage           | /dashboards/:id            | dashboard_board_widgets      | `analytics/dashboards.ts` + `dashboard-widgets.ts` |
| ReportsListPage                | /reports                   | report_definitions           | `analytics/reports.ts` |
| ReportDetailPage               | /reports/:id               | report_definitions + report_runs | `analytics/reports.ts` |
| KPIDefinitionsPage             | /kpi-definitions           | kpi_definitions              | `analytics/kpi-definitions.ts` |
| KPISnapshotsPage               | /kpi-snapshots             | kpi_snapshots                | `analytics/kpi-snapshots.ts` |
| DrilldownPathsPage             | /drilldown-paths           | drilldown_paths              | `analytics/drilldown-paths.ts` |
| ReadModelInvalidationsPage     | /read-model-invalidations  | read_model_invalidations     | `analytics/read-model-invalidations.ts` |

## 6. Legacy coexistence note

The following legacy analytics-adjacent route files **remain untouched** and
continue to serve their historical endpoints:

- `api-server/src/routes/analytics-engine.ts`
- `api-server/src/routes/business-analytics.ts`
- `api-server/src/routes/dashboard-kpi.ts`
- `api-server/src/routes/dashboard-stats.ts`

The NEW `/api/analytics/*` surface is the canonical analytics data layer.
The legacy files are mounted on their original paths (not under
`/api/analytics`) and can be retired in a future phase after consumer
migration.
