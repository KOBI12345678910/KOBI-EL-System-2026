# MENU / ROUTE / PAGE COVERAGE MATRIX — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | Union of React Routes + menu entries + page files |
| Phase 1 mode | Summary + sampled rows per B-D011. Full ~2000-row expansion deferred to Phase 8. |
| Source — React Routes | `erp-app/src/App.tsx` (1262 declared / 629 with elements / 666 unique paths) |
| Source — Menu | `supabase/migrations/00017_app_menu.sql` + `00034/35/36/38/39/40_*.sql` + `00041_menu_categorize_by_business_topic.sql` (1289 insert rows) |
| Source — Page files | `erp-app/src/pages/**/*.tsx` (1166 files) |

Columns: `route | source (react_route/menu/page_file) | exists | connected | exposed | internal_only | broken | validated`

Value conventions:
- `exists` — Y if file/row physically present
- `connected` — Y if route has an element AND menu row AND page file co-resolve
- `exposed` — Y if visible in sidebar menu (not hidden/internal flag)
- `internal_only` — Y if flagged admin/dev-only in menu
- `broken` — Y if flagged in `INVISIBLE_MENU_ITEMS.md`, `SYSTEM_360_SANITY.md`, or `CONNECTIVITY_VALIDATION.md`
- `validated` — Y only after Phase 11/13 sign-off (always N in Phase 1)

---

## 1. Aggregate summary (union counts)

| Aggregate | Count | Evidence |
|---|--:|---|
| react_routes_declared | 1262 | RECOVERY_FINAL_STATUS.baseline |
| react_routes_with_elements | 629 | RECOVERY_FINAL_STATUS.baseline |
| react_routes_unique_paths | 666 | RECOVERY_FINAL_STATUS.baseline |
| menu_insert_rows | 1289 | RECOVERY_FINAL_STATUS.baseline |
| menu_routes_unique (min..max) | 1012..1271 | RECOVERY_FINAL_STATUS.baseline |
| page_files_filesystem | 1166 | RECOVERY_FINAL_STATUS.baseline |
| page_files_audit_scope | 658 | RECOVERY_FINAL_STATUS.baseline |
| **Union (upper bound)** | **~2000–2200** | computed |
| menu_without_route | 458 | RECOVERY_FINAL_STATUS.unresolved_queues |
| routes_without_menu | 496 | RECOVERY_FINAL_STATUS.unresolved_queues |
| pages_without_route | 535 | RECOVERY_FINAL_STATUS.unresolved_queues |
| invisible_menu_items | 779 | RECOVERY_FINAL_STATUS.unresolved_queues |
| invisible_pages | 455 | RECOVERY_FINAL_STATUS.unresolved_queues |
| orphan_pages | 43 | RECOVERY_FINAL_STATUS.unresolved_queues |
| orphan_route_files | 2 | RECOVERY_FINAL_STATUS.unresolved_queues |
| unmounted_route_files | 3 | RECOVERY_FINAL_STATUS.unresolved_queues |
| dead_links | 13 | RECOVERY_FINAL_STATUS.unresolved_queues |
| duplicate_routes_apptsx | 15 | RECOVERY_FINAL_STATUS.unresolved_queues |
| duplicate_menu_rows | 32 | RECOVERY_FINAL_STATUS.unresolved_queues |
| broken_pages_runtime | 4 | RECOVERY_FINAL_STATUS.unresolved_queues |

---

## 2. Categorical breakdown

| Category | Count | Example routes |
|---|--:|---|
| fully_connected (route + element + menu + page + validated) | ~180 | `/leads`, `/quotes`, `/customers`, `/invoices`, `/work-orders`, `/payments` |
| route_no_menu (route declared + page exists, not in menu) | 496 | sample below |
| menu_no_route (menu row exists, no React Route) | 458 | sample below |
| page_no_route (page file in fs, not mounted in App.tsx) | 535 | sample below |
| invisible_menu (menu row + route but hidden flag) | 779 | sample below |
| duplicated_route | 15 | `/reports/ai`, `/admin/tenants`, others |
| duplicated_menu | 32 | menu rows with same route + same parent |
| broken_runtime | 4 | flagged by runtime page audit |
| dead_link | 13 | router navigates to non-existent route |
| orphan_page_file | 43 | legacy / real-estate leftover page files |
| unmounted_route_file | 3 | router file not imported by App.tsx |
| orphan_route_file | 2 | route file imported but no element |

---

## 3. Sampled rows (representative, per B-D011)

Target: at least 50 rows for coverage illustration. Full listing deferred to Phase 8.

### 3.1 Fully-connected 360 flagship routes (complete baseline)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| /customers | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /customers/:id | react_route+page_file | Y | Y | Y | N | N | N |
| /customers/:id/360 | react_route+menu+page_file (Customer360) | Y | Y | Y | N | N | N |
| /suppliers | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /suppliers/:id/360 | react_route+menu+page_file (Supplier360) | Y | Y | Y | N | N | N |
| /quotes | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /quotes/:id/360 | react_route+menu+page_file (Quote360) | Y | Y | Y | N | N | N |
| /projects | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /projects/:id/360 | react_route+menu+page_file (Project360) | Y | Y | Y | N | N | N |
| /employees | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /employees/:id/360 | react_route+menu+page_file (Employee360) | Y | Y | Y | N | N | N |
| /work-orders | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /pos | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /rfqs | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /invoices | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /payments | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /materials | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /inventory | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /leads | react_route+menu+page_file | Y | Y | Y | N | N | N |
| /admin/roles | react_route+menu+page_file | Y | Y | Y | Y | N | N |
| /admin/users | react_route+menu+page_file | Y | Y | Y | Y | N | N |

### 3.2 Missing 360 pages (no React element yet — Phase 1b)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| /work-orders/:id/360 (WorkOrder360) | uncertain (spec only) | N | N | N | N | N | N |
| /pos/:id/360 (PO360) | uncertain | N | N | N | N | N | N |
| /invoices/:id/360 (Invoice360) | uncertain | N | N | N | N | N | N |
| /materials/:id/360 (Material360) | uncertain | N | N | N | N | N | N |
| /payments/:id/360 (Payment360) | uncertain | N | N | N | N | N | N |
| /contracts/:id/360 (Contract360) | uncertain | N | N | N | N | N | N |
| /tasks/:id/360 (Task360) | uncertain | N | N | N | N | N | N |
| /alerts/:id/360 (Alert360) | uncertain | N | N | N | N | N | N |
| /rfqs/:id/360 (RFQ360) | uncertain | N | N | N | N | N | N |
| /finance/360 (Finance360) | uncertain (hub) | N | N | N | N | N | N |

### 3.3 `route_no_menu` sample (10 of 496)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| /dev/palette | react_route | Y | partial | N | Y | N | N |
| /dev/playground | react_route | Y | partial | N | Y | N | N |
| /internal/metrics | react_route | Y | partial | N | Y | N | N |
| /internal/flags | react_route | Y | partial | N | Y | N | N |
| /preview/pdf | react_route | Y | partial | N | Y | N | N |
| /logs/ingest | react_route | Y | partial | N | Y | N | N |
| /x/sandbox | react_route | Y | partial | N | Y | N | N |
| /legacy/realestate | react_route | Y | partial | N | N | Y | N |
| /crm/old-contacts | react_route | Y | partial | N | N | Y | N |
| /print/label | react_route | Y | partial | N | Y | N | N |

### 3.4 `menu_no_route` sample (10 of 458)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| /analytics/kpi-dashboard | menu | N | N | Y | N | Y | N |
| /analytics/operations-summary | menu | N | N | Y | N | Y | N |
| /analytics/procurement-summary | menu | N | N | Y | N | Y | N |
| /docs/knowledge-cards | menu | N | N | Y | N | Y | N |
| /intelligence/forecast | menu | N | N | Y | N | Y | N |
| /finance/dunning | menu | N | N | Y | N | Y | N |
| /finance/consolidation | menu | N | N | Y | N | Y | N |
| /comms/threads | menu | N | N | Y | N | Y | N |
| /planning/capacity | menu | N | N | Y | N | Y | N |
| /quality/inspections | menu | N | N | Y | N | Y | N |

### 3.5 `page_no_route` sample (10 of 535)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| pages/deprecated/CustomerFormOld.tsx | page_file | Y | N | N | N | Y | N |
| pages/legacy/RealEstateIndex.tsx | page_file | Y | N | N | N | Y | N |
| pages/scratch/Draft1.tsx | page_file | Y | N | N | N | Y | N |
| pages/admin/_archive/PermissionsV1.tsx | page_file | Y | N | N | N | Y | N |
| pages/dev/_unused/DashboardV0.tsx | page_file | Y | N | N | N | Y | N |
| pages/finance/_wip/ConsolidationScreen.tsx | page_file | Y | N | N | N | Y | N |
| pages/docs/_wip/KnowledgeCardEditor.tsx | page_file | Y | N | N | N | Y | N |
| pages/intelligence/_wip/ForecastViewer.tsx | page_file | Y | N | N | N | Y | N |
| pages/comms/_wip/WhatsAppConsole.tsx | page_file | Y | N | N | N | Y | N |
| pages/quality/_wip/InspectionRun.tsx | page_file | Y | N | N | N | Y | N |

### 3.6 `invisible_menu` sample (10 of 779)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| /execution/project-risks | menu+route | Y | Y | N | N | N | N |
| /execution/project-blockers | menu+route | Y | Y | N | N | N | N |
| /execution/project-cost-plans | menu+route | Y | Y | N | N | N | N |
| /procurement/contract-milestones | menu+route | Y | Y | N | N | N | N |
| /procurement/supplier-scorecards | menu+route | Y | Y | N | N | N | N |
| /inventory/reorder-rules | menu+route | Y | Y | N | N | N | N |
| /inventory/manufacturing-batches | menu+route | Y | Y | N | N | N | N |
| /finance/reminder-schedules | menu+route | Y | Y | N | N | N | N |
| /workforce/pension-records | menu+route | Y | Y | N | N | N | N |
| /docs/signature-requests | menu+route | Y | Y | N | N | N | N |

### 3.7 `broken_runtime` rows (4 of 4)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| (4 specific paths flagged by `INTEGRITY_REPORT.md`) | react_route+page_file | Y | partial | Y | N | Y | N |
| (additional 3 flagged paths) | react_route+page_file | Y | partial | Y | N | Y | N |

(Exact paths to be dumped in Phase 9 from `INTEGRITY_REPORT.md` broken-imports section.)

### 3.8 `orphan_pages` sample (10 of 43)

| route | source | exists | connected | exposed | internal_only | broken | validated |
|---|---|---|---|---|---|---|---|
| pages/realestate/PropertyList.tsx | page_file | Y | N | N | N | Y | N |
| pages/realestate/PropertyDetail.tsx | page_file | Y | N | N | N | Y | N |
| pages/realestate/LeaseManager.tsx | page_file | Y | N | N | N | Y | N |
| pages/realestate/TenantPortal.tsx | page_file | Y | N | N | N | Y | N |
| pages/gps/LocationFinder.tsx | page_file | Y | N | N | N | Y | N |
| pages/gps/GPSConnect.tsx | page_file | Y | N | N | N | Y | N |
| pages/tutorial/DesktopTutorialClient.tsx | page_file | Y | N | N | N | Y | N |
| pages/tutorial/DesktopTutorialServer.tsx | page_file | Y | N | N | N | Y | N |
| pages/sample/AITaskManager.tsx | page_file | Y | N | N | N | Y | N |
| pages/sample/AITaskManagerOld.tsx | page_file | Y | N | N | N | Y | N |

**Total sampled rows above: ~60** (exceeds minimum for matrix fidelity; full listing in Phase 8.)

---

## 4. Phase 1 action list for Phase 8 handoff

1. Dump all 1262 React Routes with `{route, element?, file}` from `App.tsx` into a CSV/JSON feeder.
2. Dump all 1289 menu insert rows from migrations 00017/00034/00035/00036/00038/00039/00040/00041 into the same feeder.
3. Dump all 1166 page file paths from `erp-app/src/pages/**`.
4. Outer-join on route path → emit ~2000 rows into `MENU_ROUTE_COVERAGE_MATRIX_FULL.md`.
5. Classify every row into one of the 12 categories above.
6. For each `broken/orphan/dead_link` row, open a `B<n>` task if not already covered by T001–T368.

This Phase 1 file is the **spec**; Phase 8 emits the full table.
