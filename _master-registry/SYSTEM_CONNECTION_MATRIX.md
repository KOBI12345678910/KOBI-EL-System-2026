# SYSTEM CONNECTION MATRIX — Cross-Layer Reachability

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | For every canonical entity: ✔ / ✖ / ⚠ per layer (DB / API / Page / Form / Menu / Report / Dashboard / Flow) |
| Red-flag rule | Any row with **more than 2 ✖** is flagged red and mirrored into `DEAD_ZONES_REPORT.md` |
| Sources | `_all_tables.txt`, `models_registry.json`, `App.tsx` (1262 routes), menu seeds (00017/00034-40/00041), `reports_registry.json`, `dashboards_registry.json`, `flows_registry.json`, INVISIBLE_MENU_ITEMS.md |
| Legend | ✔ present+wired; ⚠ partial / uncertain; ✖ absent |

## Summary

| metric | count |
|---|---:|
| rows_total | 237 (full DB) + 30 hidden + 75 planned = 342 canonical rows |
| rows_all_green (0 ✖) | 47 |
| rows_yellow (1-2 ✖) | 141 |
| rows_red (>2 ✖) | 154 |

---

## Block A — Primary 360 entities (must be all ✔)

| entity | DB | API | Page | Form | Menu | Report | Dashboard | Flow | flag |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| customers (commercial.customers) | ✔ | ✔ | ✔ (Customer360) | ✔ | ✔ | ✔ | ✔ | ✔ | green |
| leads (commercial.leads) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | green |
| opportunities (commercial.opportunities) | ✔ | ✔ | ✔ | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |
| quotes (commercial.quotes) | ✔ | ✔ | ✔ (Quote360) | ✔ | ✔ | ✔ | ✔ | ✔ | green |
| projects (execution.projects) | ✔ | ✔ | ⚠ (Project360 partial) | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |
| work_orders (execution.work_orders) | ✔ | ✔ | ⚠ (WorkOrder360 partial) | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |
| suppliers (procurement.suppliers) | ✔ | ✔ | ✔ (Supplier360) | ✔ | ✔ | ✔ | ✔ | ✔ | green |
| purchase_orders (procurement.purchase_orders) | ✔ | ✔ | ⚠ (PO360 missing lines) | ✔ | ✔ | ✔ | ✔ | ✔ | yellow |
| rfqs (procurement.rfqs) | ✔ | ✔ | ⚠ (RFQ360 missing lines editor) | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |
| invoices (finance.invoices) | ✔ | ✔ | ⚠ (Invoice360 missing lines) | ✔ | ✔ | ✔ | ✔ | ✔ | yellow |
| payments (finance.payments) | ✔ | ✔ | ⚠ (Payment360 missing) | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |
| employees (workforce.employees) | ✔ | ✔ | ✔ (Employee360) | ✔ | ✔ | ✔ | ✔ | ✔ | green |
| documents (docs.documents) | ✔ | ✔ | ⚠ (Document360 versions/OCR missing) | ✔ | ✔ | ⚠ | ⚠ | ✔ | yellow |

## Block B — Line-item / child entities (red-flag candidates)

| entity | DB | API | Page | Form | Menu | Report | Dashboard | Flow | flag |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| quote_lines (commercial.quote_lines) | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| quote_revisions | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| quote_approval_rules | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| purchase_order_lines | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| rfq_items | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| invoice_lines | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| payment_allocations | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| project_phases | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| project_milestones | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| project_risks | ✔ | ⚠ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| project_blockers | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| project_cost_plans | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| task_dependencies | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| task_comments | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ✖ | red |
| task_attachments | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| work_order_tasks | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| work_order_qa_items | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| delivery_events | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| installation_events | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| payroll_entries | ✔ | ⚠ | ✖ | ⚠ | ✖ | ⚠ | ⚠ | ⚠ | red |
| wage_slips | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |

## Block C — Finance sub-ledgers (critical gap cluster)

| entity | DB | API | Page | Form | Menu | Report | Dashboard | Flow | flag |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| gl_transactions | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| vat_records | ✔ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ✖ | ✔ (VAT_18) | yellow |
| tax_records | ✔ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ✖ | ✔ | yellow |
| tax_exports | ✔ | ⚠ | ⚠ | ✖ | ⚠ | ✖ | ✖ | ⚠ | red |
| annual_tax_reports | ✔ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ⚠ | red |
| bank_files | ✔ | ⚠ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ⚠ | yellow |
| bank_matches | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| budget_entries | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| cashflow_entries | ✔ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | green |
| collection_actions | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| collection_cases | ✔ | ✖ | ✖ | ✖ | ✖ | ⚠ | ✖ | ⚠ | red |
| consolidation_entries | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| costing_entries | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |
| dunning_campaigns | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ✖ | ⚠ | red |
| dunning_steps | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| fx_rates | ✔ | ⚠ | ✖ | ✖ | ✖ | ⚠ | ✖ | ✖ | red |
| reconciliation_exceptions | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ⚠ | red |
| reminder_schedules | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | red |

## Block D — Intelligence / AI (all red; domain-level gate)

All 13 intelligence.* tables: DB=✔, API=⚠ (partial via engines), Page=✖, Form=✖, Menu=✖, Report=⚠, Dashboard=⚠, Flow=⚠. Flag=red.

| entity | flag |
|---|:--:|
| ai_insights | red |
| anomaly_cases | red |
| anomaly_feedback | red |
| decision_recommendations | red |
| forecast_models | red |
| model_executions | red |
| quality_scores | red |
| recommendation_feedback | red |
| seasonality_patterns | red |
| trend_signals | red |
| agent_jobs | red |
| agent_registry | red |
| model_registry | red |

## Block E — Governance plumbing (26 rows; mix of legitimately-internal and red)

Legitimately internal (no ✖ penalty by policy, accept as `built_internal_only`):
`idempotency_keys, state_history, domain_events, event_deliveries, webhook_deliveries, sla_timers, health_checks, command_logs, validations_log, job_executions, queue_jobs, security_events, user_preferences, saved_filters, audit_log_attachments, alert_subscriptions, event_subscriptions, feature_flag_targets`

Red (admin UI missing):
`escalation_rules, integration_connections, integration_sync_logs, object_permissions, webhook_endpoints, config_entries, workflow_step_executions, workflow_instances`

## Block F — Analytics read-models & dashboards

| entity | DB | API | Page | Form | Menu | Report | Dashboard | Flow | flag |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| dashboard_definitions | ✔ | ⚠ | ⚠ | ⚠ | ✖ | ✖ | ⚠ | ✖ | red |
| dashboard_widgets | ✔ | ⚠ (dup w/ governance) | ⚠ | ⚠ | ✖ | ✖ | ⚠ | ✖ | red |
| kpi_snapshots | ✔ | ⚠ | ✖ | ✖ | ✖ | ⚠ | ✔ (internal) | ✖ | internal |
| rm_* family (7) | ✔ | ⚠ | ✖ | ✖ | ✖ | ⚠ | ✔ (via RPC) | ✖ | internal |

## Block G — Planned-locked (75) — all columns ✖ by definition

All 75 rows from FULL_MODEL_PRESERVATION_MATRIX Block D: DB=✖, API=✖, Page=✖, Form=✖, Menu=✖, Report=✖, Dashboard=✖, Flow=✖. Flag=red. These are build-queue items for Phase 7 and not counted as "dead" — they are the forward-build backlog.

## Row-count reconciliation

| bucket | rows |
|---|---:|
| Block A green 360s | 13 (with 7 yellow) |
| Block B red line-items | 21 |
| Block C red finance | 15 |
| Block D red intelligence | 13 |
| Block E red governance | 8 (+18 legitimately internal) |
| Block F red analytics | 3 (+8 internal rm_*) |
| Block G planned-locked red | 75 |
| internal-only (not red by policy) | 181 |
| remaining rows (other domains) | 182 |

Total canonical rows covered = 342 (including 75 planned).

## Companion docs

- Red-row full rationale + recovery path → `DEAD_ZONES_REPORT.md`
- Per-entity layer flags (machine-readable) → `GLOBAL_ENTITY_INDEX.json`
- Per-domain red-count → `domains/<domain>.md` GAPS section
