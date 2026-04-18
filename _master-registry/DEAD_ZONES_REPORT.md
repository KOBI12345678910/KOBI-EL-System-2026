# DEAD ZONES REPORT — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Purpose | Enumerate dead API routes / orphan pages / route-without-menu / menu-without-route / table-without-API / form-without-save / dashboard-without-source |
| Sources | `AUDIT_REAL.md`, `INVISIBLE_MENU_ITEMS.md`, `CONNECTIVITY_VALIDATION.md`, `DISCOVERY_RECOVERY_MAP.md` Sections D+E, `SYSTEM_CONNECTION_MATRIX.md` red rows |
| Evidence | `B-E016` invisible menu, `B-E018` unresolved queues |
| ZERO LOSS rule | Items listed here are **not deleted** — they are flagged for Phase 6/8/9 decision (wire-up, internal-only, or planned_locked). |

## Summary

| class | count | recovery_phase |
|---|---:|---|
| dead_api_routes (unmounted) | 3 | Phase 6 |
| orphan_pages (unreachable) | 43 | Phase 8 |
| route_without_menu | 496 | Phase 8 |
| menu_without_route | 458 | Phase 8 |
| table_without_API (orphan tables) | 119 | Phase 6 |
| form_without_save (detected) | **pending full scan** | Phase 9 |
| dashboard_without_source | 10 | Phase 10 |
| report_without_source | 14 | Phase 10 |
| broken_runtime_pages | 4 | Phase 9 |
| broken_imports | 30 | Phase 9 |
| sql_paren_bugs | 5 | Phase 9 |
| duplicate_endpoints | 285 | Phase 5 |
| duplicate_tables | 5 | Phase 5 |
| dead_RPCs_candidate | 127 | Phase 12 |
| red-row entities (>2 ✖ in connection matrix) | 154 | mixed |

## 1. Dead API routes (3) — imported but never mounted

Source: `DISCOVERY_RECOVERY_MAP.md` Section E.1.

| router | file | recovery |
|---|---|---|
| dashboardRouter | `api-server/src/routes/dashboard.ts` | Phase 6 — either mount at `/api/dashboard` or mark duplicate of `dashboard-*` siblings |
| finRouterRouter | `api-server/src/routes/fin-router.ts` | Phase 6 — many fin-* sibling routers exist; likely dup |
| savedPlacesRouter | `api-server/src/routes/saved-places.ts` | Phase 6 — check `/saved-places` FE usage; may be live but unmounted |

## 2. Table-without-API (119 orphan tables)

**Full enumeration lives in `DISCOVERY_RECOVERY_MAP.md` Section D.** Clustered here by recovery priority:

### P0 — wire these ASAP (finance/project/inventory core disconnected)
- `finance.invoice_lines`, `finance.gl_transactions`, `finance.payment_allocations`, `finance.vat_records`
- `execution.work_order_tasks`, `execution.task_comments`, `execution.task_dependencies`, `execution.delivery_events`, `execution.installation_events`, `execution.project_blockers`, `execution.project_cost_plans`
- `inventory.inventory_receipts`, `inventory.inventory_issues`, `inventory.inventory_transfers`, `inventory.barcode_scans`
- `commercial.quote_lines`, `commercial.quote_revisions`, `commercial.quote_approval_rules`

### P1 — AI/intelligence domain full reactivation (13 tables)
- `intelligence.*` — all 13 need API + analytics UI

### P1 — governance/plumbing (18 internal, 8 admin-UI needed)
Admin UI needed: `escalation_rules, integration_connections, integration_sync_logs, object_permissions, webhook_endpoints, config_entries, workflow_step_executions, workflow_instances`

### P2 — workforce deep (disconnected HR)
`wage_slips, pension_records, hr_profiles, employee_expenses, employee_pay_components, payroll_exceptions, payroll_export_batches, workforce_assignments`

### P2 — docs deep pipeline
`documents.document_chunks, entity_extractions, ocr_runs, classification_runs, extraction_runs, knowledge_cards`

### P3 — legitimately internal (decide + document)
`analytics.rm_*, kpi_snapshots, read_model_invalidations, governance.idempotency_keys, state_history, domain_events, event_deliveries, webhook_deliveries, sla_timers, health_checks, command_logs, validations_log, job_executions, queue_jobs, security_events, user_preferences, saved_filters, audit_log_attachments, alert_subscriptions, event_subscriptions, feature_flag_targets`

## 3. Menu without route (458)

Rows where menu seed SQL (00017 / 00034-41) has a route string, but `App.tsx` has no matching `<Route>`. Top offenders:

- `/analytics/*` — 73 menu rows, 0 routes
- `/ai-engine/*` engines — 36 menu rows, 4 routes
- Finance sub-ledger detail routes (dunning, collections, fx, consolidation) — 29 rows
- Production module — 31 rows
- Quality module — 18 rows

Full row list in `MENU_ROUTE_COVERAGE_MATRIX.md` (Block M→R).

## 4. Route without menu (496)

Rows where `App.tsx` declares a route but no menu entry references it. Top offenders:

- Hidden admin routes `/admin/*` (52)
- Dev/debug routes `/dev/*`, `/debug/*` (38)
- 360 detail routes `/customer/:id`, `/project/:id`, etc. (9 — acceptable, accessed via list)
- A/B variant routes (`*-v2`, `*-new`) (27)
- Orphan pages not yet re-linked (43 — see #5)
- Feature-flagged routes gated off (110+)

Decision: each route gets one of `expose | internal_only | deprecated_with_reason` in Phase 8.

## 5. Orphan pages (43)

Files under `erp-app/src/pages/**/*.tsx` that neither appear in `App.tsx` nor are menu-linked. Representative:

- `pages/legacy/realestate/*` (14 — see `REALESTATE_RESIDUES.md`)
- `pages/experiments/*` (8)
- `pages/ai-sandbox/*` (5)
- `pages/ops/legacy/*` (9)
- `pages/misc/*` (7)

Phase 8 decision: delete-or-register. Per ZERO LOSS policy, **do not delete** — mark `deprecated_with_reason` in `GLOBAL_ENTITY_INDEX.json`.

## 6. Broken runtime pages (4)

From AUDIT_REAL:
1. `BarcodeScannerPage` — missing `@zxing/browser` import path
2. `WhatsAppInboxPage` — unresolved `socket.io-client` namespace
3. `FactoryFloorMap` — svg asset 404
4. `KPITowerLegacy` — references removed `kpi_legacy_snapshots`

Fix planned Phase 9.

## 7. Broken imports (30)

Source: MERGE_REPORT + AUDIT_REAL. Import paths pointing to files moved during consolidation. Per-file list:
- `@onyx-procurement/legacy/*` — 12
- `@payroll-autonomous/old-api/*` — 6
- `@techno-kol-ops/deprecated/*` — 8
- `@components/ui-v1/*` — 4

Fix in Phase 9.

## 8. SQL paren-mismatch bugs (5)

Per AUDIT_REAL:
- `migrations/00019_finance_layer.sql` line ~240 — extra `)`
- `migrations/00025_intelligence_layer.sql` line ~88
- `migrations/00028_comms_layer.sql` line ~135
- `migrations/00033_add_indexes.sql` line ~60
- `migrations/00041_menu_categorize_by_business_topic.sql` line ~12

These are protected files per B-D001; flag for Phase 9 developer fix.

## 9. Dashboards without live source (10)

All 10 dashboards from `dashboards_registry.json` have broken or missing source binding per D015:
- Customer Health, Supplier Scorecard, Project Profitability, Cashflow, AI Control Room, Inventory Health, Procurement Spend, Finance Performance, Workforce Productivity, Operations Health

Phase 10 rewires to `analytics.rm_*` read models.

## 10. Reports without source (14/20)

14 of 20 reports in `reports_registry.json` are invisible per INVISIBLE_MENU_ITEMS (70%). Phase 10 wires.

## 11. Forms without save (pending scan)

Detection rule: `<form` present but no `onSubmit` handler OR `onSubmit` does not reach an API route. Phase 9 AST scan.

## 12. Duplicate artifacts

| class | count | action |
|---|---:|---|
| duplicate_tables (logical entity in 2+ schemas) | 17 canonical/17 dup | consolidate per DISCOVERY Section C |
| duplicate_endpoints (same path in 2+ routers) | 285 | Phase 5 dedup |
| duplicate_api_handlers | 171 | Phase 5 |
| duplicate_menu_rows | 32 | Phase 5 |
| duplicate_routes_apptsx | 15 | Phase 5 |

## 13. Dead RPCs candidates (127 of 128)

Per DISCOVERY E.2. Not auto-deleted — many may be invoked via migrations or dynamic strings. Phase 12 manual review with evidence grep.

## Red rows carried from SYSTEM_CONNECTION_MATRIX.md (154)

See `SYSTEM_CONNECTION_MATRIX.md` Blocks B/C/D/E/F/G. Full list preserved per ZERO LOSS; state = `built_not_exposed` or `planned_locked`.

## Completion check

- [x] Every dead artifact has a class
- [x] Every class points to a recovery phase
- [x] No artifact deleted — all preserved per ZERO LOSS
- [x] Counts reconcile with `BUILD_FINAL_STATUS.json.unresolved_queues_imported_from_recovery`
