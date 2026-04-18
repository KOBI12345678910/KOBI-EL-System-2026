# Integrity Report
Generated: 2026-04-18T06:27:28.282Z

## D1. TypeScript Compile Check

| Service | Status | Error Count |
|---|---|---|
| api-server | errors | 0 |
| erp-app | errors | 0 |
| onyx-procurement | node-check-ok | — |
| onyx-ai | errors | 0 |
| techno-kol-ops | errors | 0 |
| lib-client | no-tsconfig | — |
| vm-task-runner | node-check-ok | — |
| packages/shared-validation | no-tsconfig | — |

### Sample errors (first 10 per service with errors)

## D2. Menu ↔ React Route Integrity

- Total `<Route>` declarations in App.tsx: **1258**
- Total unique menu routes (across all seeds): **1220**
- Menu entries with no `<Route>`: **458**
- `<Route>` with no menu entry: **496**

### Sample — Menu without Route (20)
- `/operations`
- `/workforce`
- `/rfqs`
- `/pos`
- `/sales`
- `/tax`
- `/realestate`
- `/intelligence`
- `/system`
- `/executive`
- `/procurement-room`
- `/workforce-room`
- `/ai-room`
- `/kpi`
- `/leads`
- `/quotes`
- `/sales-funnel`
- `/sales-leaders`
- `/supplier-360`
- `/rfq-360`

### Sample — Route without Menu (20)
- `/`
- `/operations-control-center`
- `/executive/war-room`
- `/executive/order-lifecycle`
- `/executive/ceo-dashboard`
- `/executive/live-ops`
- `/executive/company-health`
- `/executive/kpi-board`
- `/executive/live-alerts`
- `/executive/financial-risk`
- `/executive/operational-bottlenecks`
- `/executive/delayed-projects`
- `/executive/procurement-risk`
- `/executive/production-efficiency`
- `/executive/profitability`
- `/executive/workforce-status`
- `/products`
- `/sales-orders`
- `/manufacturing`
- `/manufacturing/:rest*`

## D3. SQL Migration Syntax

- Total migration files: **41**
- Files with paren mismatch: **5**

### Mismatches:
- `00010_enterprise_expansion_30_tables.sql` — open=235 close=265
- `00011_enterprise_expansion_30_more_tables.sql` — open=225 close=255
- `00012_rpc_functions_core_block.sql` — open=168 close=178
- `00015_read_model_views.sql` — open=135 close=142
- `00016_trigger_functions_computed_fields.sql` — open=65 close=73

## D4. Broken Relative Imports

- Total broken imports (capped at 500): **30**

### Sample (30)
- `erp-app\src\components\bots\examples\integration-example.ts` → `../roles/DEVOPS.bot`
- `erp-app\src\components\bots\examples\integration-example.ts` → `../roles/PYTHON_FIXER.bot`
- `erp-app\src\components\costing\job-costing-table.tsx` → `../common/DataTable`
- `erp-app\src\components\costing\margin-alerts.tsx` → `../common/EmptyState`
- `erp-app\src\components\customfields\field-value-manager.tsx` → `./DynamicFieldRenderer`
- `erp-app\src\components\leads\tabs\lead-overview-tab.tsx` → `../TimelineFeed`
- `erp-app\src\components\leads\tabs\lead-overview-tab.tsx` → `../AIInsightsPanel`
- `erp-app\src\components\leads\tabs\lead-tasks-meetings-tab.tsx` → `../modals/CreateTaskModal`
- `erp-app\src\components\leads\tabs\lead-tasks-meetings-tab.tsx` → `../modals/CreateMeetingModal`
- `erp-app\src\components\permissions\role-based-nav.tsx` → `./PermissionGate`
- `erp-app\src\components\project\project-detail.tsx` → `./MilestoneTracker`
- `erp-app\src\components\project\project-detail.tsx` → `./TeamAssignments`
- `erp-app\src\components\quality\defects-tab.tsx` → `../common/DataTable`
- `erp-app\src\components\quality\defects-tab.tsx` → `../common/StatusBadge`
- `erp-app\src\components\quality\ncr-tab.tsx` → `../common/DataTable`
- `erp-app\src\components\quality\ncr-tab.tsx` → `../common/StatusBadge`
- `erp-app\src\components\quality\qc-checkpoints-tab.tsx` → `../common/DataTable`
- `erp-app\src\components\quality\qc-checkpoints-tab.tsx` → `../common/StatusBadge`
- `erp-app\src\components\quality\supplier-claims-tab.tsx` → `../common/DataTable`
- `erp-app\src\components\quality\supplier-claims-tab.tsx` → `../common/StatusBadge`
- `erp-app\src\components\reporting\report-builder.tsx` → `./ReportFilters`
- `erp-app\src\components\reporting\report-builder.tsx` → `./ReportVisualizer`
- `erp-app\src\components\reporting\report-builder.tsx` → `./ReportExporter`
- `erp-app\src\pages\goods-receipt.tsx` → `../../lib/utils`
- `erp-app\src\pages\purchase-requests.tsx` → `../../lib/utils`
- `erp-app\src\pages\raw-materials.tsx` → `../../lib/utils`
- `erp-app\src\pages\suppliers.tsx` → `../../lib/utils`
- `api-server\src\lib\kimi-test.ts` → `./kimi-client.js`
- `api-server\src\routes\kobi\tools.ts` → `../../lib/utils`
- `api-server\src\routes\mfa.ts` → `../lib/mfa`
