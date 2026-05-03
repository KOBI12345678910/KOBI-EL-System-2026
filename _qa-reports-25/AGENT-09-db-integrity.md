# AGENT-09 - Database Integrity Audit

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Scope:** 73 SQL migrations on disk + 60 applied migrations on canonical Supabase
**Date:** 2026-04-29
**Auditor:** Agent 09 - DB Integrity

---

## Status

**FAIL - serious tenant-isolation and RLS gaps remain after 00068-00071 hardening.**

| Check | Result | Severity |
|-------|--------|----------|
| Tables without primary keys | 0 found | OK |
| FK columns without indexes | 167 found | HIGH |
| RLS enabled but no policies | 5 tables | CRITICAL |
| RLS DISABLED entirely | 59 tables | CRITICAL |
| Always-true (`USING (true)`) policies | 318 policies / 244 tables | CRITICAL |
| Anon-readable tables | 2 (`app_menu`, `products`) | MEDIUM |
| Duplicate FK indexes | 0 in public (1 in `auth.users` - managed) | OK |
| Missing CHECK on critical fields | 89 columns | MEDIUM |
| Tenanted tables missing `tenant_id` | 57 in vertical-domain prefixes | HIGH |
| `tenant_id` columns without index | 29 tables | HIGH |
| Orphaned tables (no inbound or outbound FK) | 63 tables | MEDIUM |

`231` total tables in `public`. The hardening migrations 00068-00071 only addressed the 24 policies inside `execution.*`, `finance.*`, `inventory.*`, `intelligence.*` schemas. The vertical-domain `public.*` tables (agri/ai/ap/ar/auto/bank/crm/ecom/edu/energy/events/food/gl/health/hotel/hr/ins/inv/legal/log/mfg/pm/proc/re/sec/sports) and almost all schema-qualified domain tables (`commercial.*`, `comms.*`, `compliance.*`, `crm.*`, `docs.*`, `documents.*`, `finance.*`, `fleet.*`, `governance.*`, `logistics.*`, `maintenance.*`, `orchestration.*`, `planning.*`, `pricing.*`, `procurement.*`, `quality.*`, `reporting.*`, `routing.*`, `safety.*`, `scheduling.*`, `service.*`, `treasury.*`, `workforce.*`) are still entirely permissive.

---

## Schema-issues

### Primary keys
All 231 public tables have a primary key. No action.

### Orphaned tables (no FKs in or out, 63 tables)
`_temp_file_transfer`, `ab_experiments`, `activity_feed`, `ai_agents`, `ai_code_reviews`, `ai_models`, `ai_workflows`, `analytics_events`, `api_keys`, `app_generators`, `backups`, `changelog`, `code_comments`, `code_snippets`, `collab_sessions`, `compliance_certs`, `conversion_funnels`, `custom_domains`, `daily_usage`, `dashboard_layouts`, `deploy_environments`, `deploy_pipelines`, `email_templates`, `env_variables`, `error_tracking`, `extensions`, `feature_flags`, `file_versions`, `global_settings`, `hamelech_modules`, `infra_regions`, `integration_catalog`, `inventory`, `invoices`, `knowledge_base`, `marketplace_revenue`, `module_categories`, `module_combinations`, `module_profession_map`, `module_reviews`, `module_templates`, `modules`, `notification_preferences`, `performance_metrics`, `platform_metrics_global`, `professions`, `project_templates`, `runtime_containers`, `scheduled_jobs`, `seller_profiles`, `seo_config`, `shared_links`, `support_tickets`, `supported_languages`, `system_logs`, `tax_rules`, `team_invites`, `user_integrations`, `user_segments`, `voice_sessions`, `webhooks`, `workflow_executions`, `workflow_templates`.

`_temp_file_transfer` is dead. `inventory` and `invoices` (singular, public) duplicate `inv_stock` / `ar_invoices`/`ap_invoices` and should be dropped or wired. The other entries are catalog/global tables - acceptable but worth confirming before locking RLS.

### CHECK constraints missing (89 critical columns, sample)
- Status text columns w/o CHECK enum: `ab_experiments.status`, `agri_fields.status`, `ai_*_status` (5 tables), `api_keys.status`, `auto_service_items.status`, `backups.status`, `bank_transactions.status`, `compliance_certs.status`, `deploy_*_status` (2), `ecom_stores.status`, `end_users.status`, `energy_*.status` (3), `error_tracking.status`, `extensions.status`, `health_billing.status`, `infra_regions.status`, `integration_catalog.status`, `invoices.status`, `legal_time_entries.status`, `log_tracking_events.status`, `marketplace_revenue.status`, `mfg_routings.status`, `modules.status`, `performance_metrics.status`, `platform_invoices.status`, `platform_organizations.status`, `platform_subscriptions.status`, `re_rent_payments.status`, `runtime_containers.status`, `scheduled_jobs.status`, `sec_assets.status`, `support_tickets.status`, `team_invites.status`, `tenant_modules.status`, `tenants.status`, `user_integrations.status`, `voice_sessions.status`, `webhooks.status`, `workflow_executions.status`, `workflow_templates.status`.
- Numeric columns w/o non-negative check: `ap_invoice_lines.amount/quantity`, `ap_payment_allocations.amount`, `ap_payments.amount`, `ar_credit_notes.amount`, `ar_invoice_lines.amount/quantity/tax_rate`, `ar_receipt_allocations.amount`, `ar_receipts.amount`, `auto_service_items.quantity/total`, `crm_deals.amount`, `ecom_order_items.quantity/total`, `ecom_orders.total`, `ecom_products.price`, `events_tickets.price`, `food_menu_items.price`, `food_order_items.quantity`, `food_orders.total`, `gl_exchange_rates.rate`, `health_prescriptions.quantity`, `inv_transactions.quantity`, `legal_time_entries.amount/rate`, `marketplace_revenue.amount`, `platform_subscriptions.amount`, `proc_po_lines.quantity/tax_rate`, `proc_requisition_lines.quantity`, `proc_rfq_items.quantity`, `re_rent_payments.amount`, `tax_rules.rate`.
- Conflict on tax precision: `ap_invoices.tax_rate numeric(5,2)`, `ar_invoice_lines.tax_rate numeric(5,2)`, `proc_po_lines.tax_rate numeric(5,2)` - none enforce `>= 0 AND <= 100` and migration 00037 only changed VAT rate to 18% but did not add a constraint.

---

## RLS-issues

### 1. RLS DISABLED on 59 production tables (CRITICAL)
These tables have **no RLS at all** - they are wide open to anon and authenticated:

```
_temp_file_transfer, ab_experiments, activity_feed, ai_agents, ai_code_reviews,
ai_models, ai_workflows, analytics_events, api_keys, app_generators, backups,
changelog, code_comments, code_snippets, collab_sessions, compliance_certs,
conversion_funnels, custom_domains, daily_usage, dashboard_layouts,
deploy_environments, deploy_pipelines, email_templates, env_variables,
error_tracking, extensions, feature_flags, file_versions, global_settings,
hamelech_modules, infra_regions, integration_catalog, invoices, knowledge_base,
marketplace_revenue, module_categories, module_reviews, module_templates,
notification_preferences, performance_metrics, project_templates,
runtime_containers, scheduled_jobs, seller_profiles, seo_config, shared_links,
support_tickets, supported_languages, system_logs, tax_rules, team_invites,
tenant_integrations, tenant_workflows, user_integrations, user_segments,
voice_sessions, webhooks, workflow_executions, workflow_templates
```

`api_keys`, `env_variables`, `tax_rules`, `webhooks`, `user_integrations`, `tenant_integrations`, `analytics_events`, and `system_logs` are particularly dangerous - they hold secrets, telemetry, or user activity.

### 2. RLS ENABLED but ZERO policies (CRITICAL - locks all access except service_role)
`platform_api_keys`, `platform_invoices`, `platform_metrics_global`, `platform_organizations`, `platform_webhooks`. These are also missing FK indexes (see below). These tables effectively cannot be reached from the API. Either add deliberate policies or disable RLS to make the omission explicit.

### 3. Always-true (`USING (true)` / `WITH CHECK NULL`) policies (CRITICAL)
**318 policies across 244 tables** are still permissive. All of these need to be hardened analogously to `00068`:
- All vertical-domain `public.*` tables (agri/ai/ap/ar/auto/bank/crm/ecom/edu/energy/events/food/gl/health/hotel/hr/ins/inv/legal/log/mfg/pm/proc/re/sec/sports) have a single `xx#` policy with qualifier literally `true`.
- All schema-qualified domain tables (`commercial.*`, `comms.*`, `compliance.*`, `crm.*`, `docs.*`, `documents.*`, `fleet.*`, `governance.*`, `logistics.*`, `maintenance.*`, `orchestration.*`, `planning.*`, `pricing.*`, `procurement.*`, `quality.*`, `reporting.*`, `routing.*`, `safety.*`, `scheduling.*`, `service.*`, `treasury.*`, `workforce.*`, plus `analytics.*`, `platform.*`) carry one or more permissive policies.
- Even `gl_journal_entries`, `gl_accounts`, `ap_invoices`, `ap_payments`, `ar_invoices`, `ar_receipts` (financial books of record!) use `USING (true)` for read.

### 4. Anon-readable tables (MEDIUM)
After 00071 only `app_menu` (`anon_read_app_menu`) and `products` (`anon_read_products`) remain readable by the `anon` role. Acceptable for a public catalog/landing page; confirm with product whether `products` should be authenticated-only.

### 5. Service-role-only INSERT policies with `WITH CHECK NULL`
Several tables have separate INSERT policies whose `WITH CHECK` is NULL (`ai_messages`, `ai_sessions`, `ap_*_write`, `gl_*_insert`, `gl_periods_insert`, `gl_lines_insert`, `gl_rates_insert`, `gl_journal_insert`, `order_status_history`). When `WITH CHECK` is omitted on `FOR INSERT`, Postgres falls back to `USING` (which is also unset) and the policy is effectively unrestricted for the targeted role. These need explicit `WITH CHECK` predicates.

---

## Index-issues

### 1. FK columns without indexes (167 columns - HIGH)
These cause sequential scans during cascading deletes and join queries. Highest-traffic offenders (sample):
- **AP/AR books**: `ap_invoice_lines.gl_account_id`, `ap_invoices.gl_account_id`, `ap_payment_allocations.invoice_id`, `ap_payment_allocations.payment_id`, `ap_price_history.invoice_id`, `ap_vendors.gl_account_id`, `ar_credit_notes.applied_to_invoice_id/customer_id/original_invoice_id`, `ar_customers.gl_account_id`, `ar_invoice_lines.gl_account_id/invoice_id`, `ar_invoices.gl_account_id`, `ar_receipt_allocations.invoice_id/receipt_id`.
- **Procurement**: `proc_goods_receipts.po_id/vendor_id/warehouse_id`, `proc_grn_lines.grn_id/item_id/location_id/po_line_id`, `proc_po_lines.item_id/po_id`, `proc_purchase_orders.requisition_id/ship_to_warehouse_id`, `proc_requisition_lines.item_id/preferred_vendor_id/requisition_id`, `proc_rfq_items.item_id/rfq_id`, `proc_rfq_vendors.rfq_id/vendor_id`.
- **Inventory**: `inv_count_lines.count_sheet_id/item_id/location_id`, `inv_count_sheets.warehouse_id`, `inv_stock.location_id`, `inv_transactions.from_location_id/from_warehouse_id/to_location_id/to_warehouse_id`.
- **Manufacturing**: `mfg_bom_lines.bom_id/component_item_id/substitute_item_id`, `mfg_wo_materials.item_id/warehouse_id/work_order_id`, `mfg_wo_operations.work_center_id/work_order_id`, `mfg_work_orders.bom_id/routing_id/warehouse_id`, plus 6 more.
- **Multi-tenant key**: `ai_sessions.tenant_id`, `ap_price_history.tenant_id`, `agri_crops.tenant_id`, `agri_livestock.tenant_id`, `bank_cards.tenant_id`, `crm_activities.tenant_id`, `crm_companies.tenant_id`, `crm_pipelines.tenant_id`, `ecom_carts.tenant_id`, `ecom_stores.tenant_id`, `edu_institutions.tenant_id`, `energy_sites.tenant_id`, `food_restaurants.tenant_id`, `gl_audit_trail.tenant_id`, `gl_recurring_entries.tenant_id`, `hotel_properties.tenant_id`, `hr_leave_requests.tenant_id`, `hr_performance_reviews.tenant_id`, `legal_documents.tenant_id`, `log_routes.tenant_id`, `pm_time_entries.tenant_id`, `sec_access_logs.tenant_id`, `sec_assets.tenant_id`, `sports_athletes/clubs/matches.tenant_id`, `tenant_users.tenant_id`. All of these will be hit by every RLS predicate once tenant isolation is enabled - **must be indexed first**.

### 2. Duplicate FK indexes (OK)
Migration 00069 already de-duplicated `public.*`. Only `auth.users.users_instance_id_idx` shows duplication, but that table is owned by Supabase auth and not user-controlled. No action.

---

## Tenant-isolation-issues

### 1. Vertical-domain tables missing `tenant_id` entirely (57 - HIGH)
The following `agri/ai/ap/ar/auto/bank/crm/ecom/edu/energy/events/food/gl/health/hotel/hr/ins/inv/legal/log/mfg/pm/proc/re/sec/sports` tables have no `tenant_id` column despite living in a multi-tenant project (multi-tenancy migration was applied 2026-04-22):

```
agri_fields, agri_harvest_logs, ai_agents, ai_code_reviews, ai_models, ai_workflows,
ap_invoice_lines, ap_payment_allocations, ap_vendor_contacts, api_keys, app_generators,
app_menu, ar_invoice_lines, ar_receipt_allocations, auto_service_items,
ecom_order_items, ecom_reviews, edu_assignments, edu_enrollments, edu_submissions,
energy_readings, events_registrations, events_speakers, events_tickets,
food_menu_categories, food_menu_items, food_order_items, food_reservations_table,
food_tables, gl_journal_lines, global_settings, health_medical_records,
health_prescriptions, hotel_housekeeping, hotel_room_types, hotel_rooms, hr_payslips,
inv_count_lines, inv_locations, inventory, invoices, legal_time_entries,
log_tracking_events, mfg_bom_lines, mfg_routing_operations, mfg_wo_materials,
mfg_wo_operations, pm_milestones, pm_tasks, proc_grn_lines, proc_po_lines,
proc_requisition_lines, proc_rfq_items, proc_rfq_vendors, re_rent_payments,
re_units, sports_training
```

Many of these are line-item/child tables that *could* derive tenant from a parent (`ap_invoice_lines -> ap_invoices`), but RLS predicates that join across tables become slow without an explicit denormalised `tenant_id` and an index on it. Recommended: add `tenant_id uuid NOT NULL DEFAULT current_tenant_id()` + trigger to copy from parent + index.

### 2. `tenant_id` columns without supporting index (29 tables - HIGH)
See Index-issues #1 above - same list. **Without these indexes, enabling tenant RLS will produce table scans on every query**.

### 3. No tenant guard inside RLS policies (CRITICAL)
None of the 318 always-true policies actually filter by `tenant_id`. Even after 00068-00071, the only project that enforces `tenant_id = current_tenant_id()` inside an RLS predicate is `tenant_users` (single self-reference). Multi-tenant isolation is **not in effect anywhere on the customer-data surface**.

---

## Recommended-migrations

Order matters - indexes before predicates, otherwise the database will scan.

### M1 - `00072_create_governance_tenant_helper.sql`
- `governance.current_tenant_id() RETURNS uuid` reading `request.jwt.claim.tenant_id` (already exists for users; mirror it).
- `governance.user_belongs_to_tenant(uuid) RETURNS boolean` for cross-tenant admins.

### M2 - `00073_add_missing_fk_indexes.sql`
Create `idx_<table>_<column>` BTREE for all 167 FK columns above (priority: AP/AR/Procurement/Inventory). Use `CREATE INDEX CONCURRENTLY` to avoid locking.

### M3 - `00074_add_tenant_id_to_child_tables.sql`
Add `tenant_id uuid NOT NULL` to the 57 vertical-domain tables missing it. Backfill from parent records, add FK to `tenants(id)`, add index on `tenant_id`. Add trigger `trg_<table>_set_tenant_id` to copy from parent on INSERT/UPDATE.

### M4 - `00075_index_tenant_id_columns.sql`
`CREATE INDEX CONCURRENTLY` on the 29 `tenant_id` columns currently unindexed, before flipping any policy.

### M5 - `00076_harden_public_domain_rls.sql`
Replace every `USING (true)` policy on the 26 `public.*` vertical domains with:
- `FOR SELECT`: `tenant_id = governance.current_tenant_id()`
- `FOR INSERT`: `WITH CHECK (tenant_id = governance.current_tenant_id() AND <role-check>)`
- `FOR UPDATE/DELETE`: `USING (tenant_id = governance.current_tenant_id() AND <role-check>)`

### M77 - `00077_harden_schema_domain_rls.sql`
Same for the 22 schema-qualified domains (`commercial.*`, `comms.*`, `compliance.*`, `crm.*`, `docs.*`, `documents.*`, `fleet.*`, `governance.*`, `logistics.*`, `maintenance.*`, `orchestration.*`, `planning.*`, `pricing.*`, `procurement.*`, `quality.*`, `reporting.*`, `routing.*`, `safety.*`, `scheduling.*`, `service.*`, `treasury.*`, `workforce.*`, `analytics.*`, `platform.*`).

### M78 - `00078_enable_rls_on_unprotected_tables.sql`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on the 59 currently-disabled tables.
- Add policies: secret tables (`api_keys`, `env_variables`, `webhooks`) admin-only; public catalogs (`tax_rules`, `supported_languages`, `infra_regions`, `professions`, `module_*`) authenticated-readable; user-scoped tables (`notification_preferences`, `dashboard_layouts`, `user_integrations`, `voice_sessions`) restricted to owner.

### M79 - `00079_add_policies_to_platform_tables.sql`
Add explicit policies (or disable RLS) on `platform_api_keys`, `platform_invoices`, `platform_metrics_global`, `platform_organizations`, `platform_webhooks`. Also add the missing FK indexes for these tables (`org_id`, `user_id`, `subscription_id`, `module_id`, `plan_id`).

### M80 - `00080_fix_with_check_null_policies.sql`
For every INSERT-only policy with `WITH CHECK NULL` (sample: `ap_*_write`, `gl_*_insert`, `gl_periods_insert`, `gl_lines_insert`, `gl_rates_insert`, `order_status_history`, `ai_messages_insert_policy`, `ai_sessions_insert_policy`), replace with `WITH CHECK (tenant_id = governance.current_tenant_id() AND <role-check>)`.

### M81 - `00081_add_check_constraints_critical_fields.sql`
- Status enums: `ALTER TABLE x ADD CONSTRAINT x_status_chk CHECK (status IN (...))` for the 50+ status columns.
- Non-negative money: `CHECK (amount >= 0)`, `CHECK (quantity >= 0)`, `CHECK (rate >= 0 AND rate <= 100)` for the listed columns.

### M82 - `00082_drop_orphaned_legacy_tables.sql`
Drop `_temp_file_transfer`. Decide on `inventory` vs `inv_stock`, `invoices` vs `ar_invoices/ap_invoices` (singular forms predate the schema redesign and confuse the data model).

---

## Files referenced
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00068_harden_rls_policies_always_true.sql` (24 policies fixed - tip of the iceberg)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00069_performance_fk_indexes_and_dedupe.sql` (FK indexes added but did not cover later domain expansion)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00070_fix_auth_rls_initplan.sql` (auth.uid() init-plan fix only)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00071_remove_dangerous_anon_read_policies.sql` (verified - only kept `app_menu` and `products`)
