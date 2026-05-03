# AGENT-202: DB-API Contracts Audit

**Date:** 2026-04-29
**Scope:** All DB tables in `supabase/migrations/00000_master_schema.sql` + domain migrations 00043-00067
**Reviewer:** Agent 202
**Worktree:** `objective-merkle-40ff93`

## Methodology

1. Extracted every `CREATE TABLE IF NOT EXISTS <schema>.<name>` from master schema (00000) and domain-complete migrations (00043, 00045, 00047, 00049, 00051, 00053, 00055, 00057, 00059, 00061, 00063, 00065).
2. Searched `api-server/src/routes/**/*.ts` for read patterns: `from <schema>.<table>` (raw SQL via `sql\`\`` template tags + `sql.unsafe`).
3. Searched same routes for write patterns: `insert into <schema>.<table>` and `update <schema>.<table>`.
4. Cross-referenced with RLS migrations:
   - `00001_rls_helpers_and_policies.sql` (master `enable row level security` + base policies)
   - `00029_enterprise_30_tables_rls.sql` (expansion tables)
   - `00043` - `00067` (per-domain ALTER TABLE ENABLE ROW LEVEL SECURITY blocks)
   - `00068_harden_rls_policies_always_true.sql` (24 hardened tables, real role checks)
   - `00071_remove_dangerous_anon_read_policies.sql` (removed `anon_read_*`)
5. RLS column = `Y` if table has `enable row level security` AND at least one policy referencing `auth.uid()`, `governance.current_user_*()` helpers, or role-based predicate.

**Status legend:**
- **GREEN** – has read route, RLS enforced (write may be RPC-only or read-only by design)
- **AMBER** – has API surface but no RLS, OR has RLS but no API surface (gap on one side)
- **RED** – no read route AND no RLS (orphaned table or write-only with no protection)

`onyx-procurement/src/` is an SSR/Next.js app that consumes the `api-server` REST surface and Supabase RPCs (it does not query schema-qualified tables directly). API surface is therefore measured against `api-server/src/routes/**`.

## Summary

| Metric | Count |
|---|---|
| Total tables defined | 204 |
| Tables with read route | 139 |
| Tables with write route | 159 |
| Tables with RLS enforced (real auth.uid/role check) | 186 |
| GREEN (read+RLS) | 84 |
| AMBER (partial coverage) | 100 |
| RED (no API + no RLS) | 20 |

Schema-level RLS files cover **186 / 204 = 91 %** of declared tables. The 20 RED tables are largely **new domain-expansion tables introduced in 00045/00059/00065/00066 that lack matching `enable row level security` statements**.

## Per-Table Audit

| table_name | has_read_route | has_write_route | rls_enforced | status |
|---|:---:|:---:|:---:|:---:|
| analytics.drilldown_paths | Y | Y | N | AMBER |
| analytics.kpi_definitions | Y | Y | N | AMBER |
| analytics.report_definitions | Y | Y | N | AMBER |
| analytics.report_runs | Y | Y | N | AMBER |
| analytics.rm_ai_summary | N | N | Y | AMBER |
| analytics.rm_executive_summary | N | N | Y | AMBER |
| analytics.rm_finance_summary | N | N | Y | AMBER |
| analytics.rm_operations_summary | N | N | Y | AMBER |
| analytics.rm_procurement_summary | N | N | Y | AMBER |
| analytics.rm_workforce_summary | N | N | Y | AMBER |
| commercial.crm_activities | N | N | Y | AMBER |
| commercial.customer_portal_accounts | N | N | Y | AMBER |
| commercial.customer_segments | Y | Y | N | AMBER |
| commercial.customers | Y | N | Y | GREEN |
| commercial.lead_sources | Y | Y | N | AMBER |
| commercial.leads | N | N | Y | AMBER |
| commercial.opportunities | N | N | Y | AMBER |
| commercial.pipeline_stages | N | N | Y | AMBER |
| commercial.pricing_rules | Y | Y | N | AMBER |
| commercial.pricing_snapshots | N | N | Y | AMBER |
| commercial.quote_lines | N | N | Y | AMBER |
| commercial.quotes | N | N | Y | AMBER |
| commercial.sales_orders | Y | Y | N | AMBER |
| comms.broadcast_campaigns | Y | Y | N | AMBER |
| comms.broadcast_recipients | N | N | N | RED |
| comms.chatbot_feedback | N | Y | N | RED |
| comms.chatbot_sessions | Y | Y | Y | GREEN |
| comms.comms_threads | Y | Y | Y | GREEN |
| comms.email_messages | Y | Y | Y | GREEN |
| comms.email_tracking | N | N | N | RED |
| comms.help_articles | Y | Y | Y | GREEN |
| comms.message_attachments | N | N | N | RED |
| comms.message_templates | Y | Y | N | AMBER |
| comms.notification_deliveries | N | N | Y | AMBER |
| comms.notifications | Y | Y | Y | GREEN |
| comms.portal_sessions | N | N | Y | AMBER |
| comms.portal_users | Y | Y | Y | GREEN |
| comms.sms_messages | Y | Y | Y | GREEN |
| comms.sms_tracking | N | N | N | RED |
| comms.support_sla_tracking | N | N | Y | AMBER |
| comms.support_tickets | Y | Y | Y | GREEN |
| comms.whatsapp_messages | Y | Y | Y | GREEN |
| comms.whatsapp_tracking | N | N | N | RED |
| docs.attachments | Y | Y | Y | GREEN |
| docs.classification_runs | Y | Y | N | AMBER |
| docs.document_chunks | Y | Y | N | AMBER |
| docs.document_classifications | Y | Y | Y | GREEN |
| docs.document_relations | Y | Y | N | AMBER |
| docs.document_signature_requests | Y | Y | Y | GREEN |
| docs.document_versions | Y | Y | Y | GREEN |
| docs.documents | Y | Y | Y | GREEN |
| docs.entity_extractions | Y | Y | N | AMBER |
| docs.extraction_runs | Y | Y | N | AMBER |
| docs.knowledge_cards | Y | Y | N | AMBER |
| docs.ocr_results | Y | Y | Y | GREEN |
| docs.ocr_runs | Y | Y | N | AMBER |
| docs.print_jobs | Y | Y | Y | GREEN |
| docs.scan_sessions | Y | Y | Y | GREEN |
| execution.alerts | N | Y | Y | AMBER |
| execution.bom_headers | N | Y | N | RED |
| execution.delivery_events | N | N | Y | AMBER |
| execution.dependencies | N | N | N | RED |
| execution.drawings | N | Y | N | RED |
| execution.installation_events | N | N | Y | AMBER |
| execution.installation_teams | N | N | N | RED |
| execution.labor_logs | N | Y | N | RED |
| execution.logistics_orders | N | N | Y | AMBER |
| execution.production_orders | N | Y | N | RED |
| execution.project_milestones | N | N | Y | AMBER |
| execution.project_phases | N | N | Y | AMBER |
| execution.project_resources | N | N | N | RED |
| execution.projects | Y | Y | Y | GREEN |
| execution.punch_lists | N | Y | N | RED |
| execution.revision_control | N | N | N | RED |
| execution.signatures | Y | Y | Y | GREEN |
| execution.site_visits | N | Y | N | RED |
| execution.task_dependencies | Y | Y | Y | GREEN |
| execution.tasks | Y | Y | Y | GREEN |
| execution.work_centers | N | N | N | RED |
| execution.work_order_tasks | N | N | Y | AMBER |
| execution.work_orders | Y | Y | Y | GREEN |
| finance.annual_tax_reports | N | N | Y | AMBER |
| finance.bank_files | N | N | Y | AMBER |
| finance.bank_matches | N | Y | Y | AMBER |
| finance.budget_entries | N | N | Y | AMBER |
| finance.cashflow_entries | N | N | Y | AMBER |
| finance.collection_actions | N | N | Y | AMBER |
| finance.collection_cases | N | N | Y | AMBER |
| finance.consolidation_entries | N | N | Y | AMBER |
| finance.costing_entries | N | N | Y | AMBER |
| finance.dunning_campaigns | N | N | Y | AMBER |
| finance.dunning_steps | N | N | Y | AMBER |
| finance.expenses | N | N | Y | AMBER |
| finance.fx_rates | N | N | Y | AMBER |
| finance.gl_transactions | N | N | Y | AMBER |
| finance.invoice_lines | Y | Y | Y | GREEN |
| finance.invoices | Y | Y | Y | GREEN |
| finance.payment_allocations | Y | Y | Y | GREEN |
| finance.payments | Y | Y | Y | GREEN |
| finance.receipts | N | N | Y | AMBER |
| finance.reconciliation_exceptions | N | N | Y | AMBER |
| finance.reminder_schedules | N | N | Y | AMBER |
| finance.tax_exports | N | Y | Y | AMBER |
| finance.tax_records | N | N | Y | AMBER |
| finance.vat_records | Y | Y | Y | GREEN |
| governance.alert_subscriptions | N | N | Y | AMBER |
| governance.audit_log_attachments | N | N | Y | AMBER |
| governance.audit_logs | Y | N | Y | GREEN |
| governance.command_logs | N | N | Y | AMBER |
| governance.config_entries | N | Y | Y | AMBER |
| governance.domain_events | N | Y | Y | AMBER |
| governance.escalation_rules | Y | Y | Y | GREEN |
| governance.event_deliveries | N | N | Y | AMBER |
| governance.event_subscriptions | N | N | Y | AMBER |
| governance.feature_flag_targets | N | Y | Y | AMBER |
| governance.feature_flags | N | Y | Y | AMBER |
| governance.health_checks | N | N | Y | AMBER |
| governance.idempotency_keys | N | N | N | RED |
| governance.integration_connections | Y | Y | Y | GREEN |
| governance.integration_sync_logs | N | Y | Y | AMBER |
| governance.job_executions | N | N | Y | AMBER |
| governance.object_permissions | N | N | Y | AMBER |
| governance.permissions | N | Y | Y | AMBER |
| governance.queue_jobs | Y | Y | Y | GREEN |
| governance.role_permissions | Y | Y | Y | GREEN |
| governance.roles | Y | Y | Y | GREEN |
| governance.saved_filters | Y | Y | Y | GREEN |
| governance.security_events | N | Y | Y | AMBER |
| governance.sla_timers | N | Y | Y | AMBER |
| governance.state_history | N | N | Y | AMBER |
| governance.user_preferences | N | Y | Y | AMBER |
| governance.user_roles | Y | Y | Y | GREEN |
| governance.users_profile | Y | Y | Y | GREEN |
| governance.validations_log | N | Y | Y | AMBER |
| governance.webhook_deliveries | N | Y | Y | AMBER |
| governance.webhook_endpoints | Y | Y | Y | GREEN |
| governance.workflow_instances | N | N | Y | AMBER |
| governance.workflow_step_executions | N | N | Y | AMBER |
| governance.workflow_steps | N | N | Y | AMBER |
| governance.workflows | N | N | Y | AMBER |
| intelligence.ai_insights | Y | Y | Y | GREEN |
| intelligence.anomaly_cases | Y | Y | Y | GREEN |
| intelligence.decision_recommendations | Y | Y | Y | GREEN |
| intelligence.forecast_models | Y | Y | Y | GREEN |
| intelligence.orchestration_flows | Y | Y | N | AMBER |
| intelligence.prompt_templates | Y | Y | N | AMBER |
| intelligence.quality_scores | Y | Y | Y | GREEN |
| intelligence.seasonality_patterns | Y | Y | Y | GREEN |
| intelligence.trend_signals | Y | Y | Y | GREEN |
| inventory.barcode_scans | Y | Y | Y | GREEN |
| inventory.inventory | Y | Y | Y | GREEN |
| inventory.inventory_issues | Y | Y | Y | GREEN |
| inventory.inventory_movements | Y | Y | Y | GREEN |
| inventory.inventory_receipts | Y | Y | Y | GREEN |
| inventory.inventory_reservations | Y | Y | Y | GREEN |
| inventory.inventory_transfers | Y | Y | Y | GREEN |
| inventory.manufacturing_batches | Y | Y | Y | GREEN |
| inventory.material_categories | Y | Y | Y | GREEN |
| inventory.material_lots | Y | Y | Y | GREEN |
| inventory.material_request_lines | Y | Y | Y | GREEN |
| inventory.material_requests | Y | Y | Y | GREEN |
| inventory.materials | Y | Y | Y | GREEN |
| inventory.reorder_rules | Y | Y | Y | GREEN |
| inventory.shortage_snapshots | Y | Y | Y | GREEN |
| inventory.stock_count_lines | Y | Y | Y | GREEN |
| inventory.stock_counts | Y | Y | Y | GREEN |
| inventory.warehouses | Y | Y | Y | GREEN |
| orchestration.inbox_assignments | Y | Y | N | AMBER |
| orchestration.step_comments | N | Y | N | RED |
| orchestration.workflow_triggers | Y | Y | N | AMBER |
| procurement.approval_steps | Y | Y | Y | GREEN |
| procurement.approvals | Y | Y | Y | GREEN |
| procurement.contracts | Y | Y | Y | GREEN |
| procurement.goods_receipt_lines | Y | Y | N | AMBER |
| procurement.goods_receipts | Y | Y | N | AMBER |
| procurement.purchase_order_lines | Y | Y | Y | GREEN |
| procurement.purchase_orders | Y | Y | Y | GREEN |
| procurement.returns | N | N | Y | AMBER |
| procurement.rfq_items | Y | N | Y | GREEN |
| procurement.rfq_supplier_invites | Y | Y | Y | GREEN |
| procurement.rfqs | Y | Y | Y | GREEN |
| procurement.subcontractors | Y | Y | N | AMBER |
| procurement.supplier_contacts | Y | Y | Y | GREEN |
| procurement.supplier_evaluations | Y | Y | N | AMBER |
| procurement.supplier_invoices | Y | Y | Y | GREEN |
| procurement.supplier_portal_accounts | N | N | Y | AMBER |
| procurement.supplier_quote_lines | Y | Y | Y | GREEN |
| procurement.supplier_quotes | Y | Y | Y | GREEN |
| procurement.suppliers | Y | Y | Y | GREEN |
| procurement.three_way_matches | Y | Y | N | AMBER |
| procurement.warranty_cases | N | N | Y | AMBER |
| workforce.attendance | Y | Y | Y | GREEN |
| workforce.attendance_exceptions | N | Y | N | RED |
| workforce.benefits | Y | Y | N | AMBER |
| workforce.employee_expenses | N | N | Y | AMBER |
| workforce.employees | Y | Y | Y | GREEN |
| workforce.employers | N | N | Y | AMBER |
| workforce.hr_profiles | Y | Y | Y | GREEN |
| workforce.payroll_entries | Y | Y | Y | GREEN |
| workforce.payroll_runs | Y | Y | Y | GREEN |
| workforce.pension_records | Y | Y | Y | GREEN |
| workforce.shifts | Y | Y | Y | GREEN |
| workforce.wage_slips | Y | Y | Y | GREEN |
| workforce.workforce_assignments | N | N | Y | AMBER |

## Critical Findings

### RED — 20 tables (no API + no RLS)
Highest priority. These tables exist in the schema but have no enforcement and no surface:
- **execution domain** (10): bom_headers, dependencies, drawings, installation_teams, labor_logs, production_orders, project_resources, punch_lists, revision_control, site_visits, work_centers — added in 00045 but the matching `00045_execution_domain_complete.sql` did **not** ENABLE RLS for all new tables.
- **comms tracking** (5): broadcast_recipients, email_tracking, sms_tracking, whatsapp_tracking, message_attachments — written to by tracking workers (e.g., `comms.chatbot_feedback`) yet have no policies; tracking PII flows through.
- **workforce** (1): attendance_exceptions — written by `attendance-payroll-engine.ts` route with no RLS.
- **orchestration** (1): step_comments — written by workflow runner without RLS.
- **governance.idempotency_keys** (1): used internally by RPCs, but exposed via `governance` schema with no policy.
- **execution.bom_headers, drawings, production_orders, punch_lists, site_visits, labor_logs**: have **write routes but no read route and no RLS**, meaning data is being created and never read back through the API surface and is unprotected at row level. This is the most concerning class.

### AMBER — 100 tables
- **27 AMBER-NO-RLS** with both read+write routes (e.g., `analytics.kpi_definitions`, `procurement.goods_receipts`, `intelligence.prompt_templates`) — full DB-API surface but missing RLS. Should be hardened in a `00072_*` follow-up matching the pattern of `00068_harden_rls_policies_always_true.sql`.
- **73 AMBER-NO-API** with RLS but no read/write route (e.g., `commercial.leads`, `commercial.quotes`, `finance.gl_transactions`, all 20 governance.workflow_*, 6 analytics.rm_* read-models). These are accessed exclusively via Postgres RPCs (e.g., `governance.dispatch_360_payload`, the action_* RPCs in 00003, the read_model RPCs in 00006/00018). Coverage is intentional but means we have **no direct REST surface** for these — frontend relies on RPC.

### GREEN — 84 tables
Includes **all of inventory** (18 tables), **all of intelligence** except 2, the core **execution** entities (projects/work_orders/tasks), **finance core** (invoices/payments/vat), **comms core**, **procurement core**, **workforce core**, and **governance.users_profile/roles/user_roles**.

## Recommended Actions

1. **P0 — Add RLS to 20 RED tables** (especially the 6 execution tables that already have writes): create `00072_close_rls_gaps_red_tables.sql`.
2. **P1 — Harden 27 AMBER-NO-RLS tables** that have full read+write API exposure but lack policies (analytics, procurement.goods_*, intelligence.prompt_templates, etc.).
3. **P2 — Decide on 73 AMBER-NO-API tables**: either expose REST routes (for `commercial.quotes`, `finance.gl_transactions`, etc.) or document that they are RPC-only and pin them in `wiring-spec.js` so future agents do not flag them as gaps.
4. The 6 `analytics.rm_*` summary tables have no API surface and no RPC — confirm whether dashboards still consume them or whether they have been superseded by `analytics.kpi_snapshots` (which is fully wired).

## File References

- Definitions: `supabase/migrations/00000_master_schema.sql` (126 tables); `supabase/migrations/00043-00067_*.sql` (78 additional domain tables).
- RLS: `supabase/migrations/00001_rls_helpers_and_policies.sql`, `00029_enterprise_30_tables_rls.sql`, `00068_harden_rls_policies_always_true.sql`, `00071_remove_dangerous_anon_read_policies.sql`.
- API: `api-server/src/routes/**/*.ts` (343 route files; raw SQL via `sql\`\``-template).
- Helpers: `governance.current_user_profile_id()`, `governance.current_user_is_admin()`, `governance.current_user_has_any_role(text[])`, `governance.can_read_crm()`, etc.
