# techno-kol-ops — Supabase Schema Audit

Auditor: Agent-24
Date: 2026-04-11
Scope: Cross-reference techno-kol-ops schema against onyx-procurement mega ERP schema.

---

## 1. Source artefacts discovered

| File | Role | Status |
|------|------|--------|
| `src/db/schema.sql` | Original raw-PostgreSQL bootstrap schema (v1) | Existing, untouched |
| `src/db/migration_v2.sql` | v2 expansion — Brain/AI/Docs/AIP/Apollo/Ontology/EventBus | Existing, untouched |
| `src/db/seed.sql` | Seed data | Existing, untouched |
| `supabase/migrations/` | Supabase-format migrations directory | **Created by this audit** |
| `supabase/migrations/001-operations-core.sql` | Ops-core tables (jobs, tasks, properties, contracts) | **Created by this audit** |

Note: Until now, techno-kol-ops shipped a hand-rolled single-file schema under `src/db/` executed via raw `pg` pool. It had no Supabase-style versioned migration chain. onyx-procurement ships its own chain under `onyx-procurement/supabase/migrations/`.

---

## 2. Tables referenced by techno-kol-ops server code

Extracted via Grep on `FROM <table>`, `INSERT INTO <table>`, `UPDATE <table>` across `techno-kol-ops/src/**/*.ts`.

### 2.1 Operations / factory domain (techno-kol-ops owned)
| Table | Defined in | Used by |
|-------|-----------|---------|
| `clients` | schema.sql | aipEngine, brainEngine, documentEngine, routes |
| `suppliers` | schema.sql | procurement routes, aipEngine |
| `employees` | schema.sql | hr routes, aipEngine, situationEngine |
| `attendance` | schema.sql | hr routes |
| `work_orders` | schema.sql | brainEngine, aipEngine, documentEngine |
| `work_order_employees` | schema.sql | orders routes |
| `material_items` | schema.sql | aipEngine, brainEngine, procurement routes |
| `material_movements` | schema.sql | procurement routes |
| `alerts` | schema.sql | aipEngine, brainEngine |
| `financial_transactions` | schema.sql | aipEngine, brainEngine, finance routes |
| `users` | schema.sql | auth (index.ts) |
| `order_events` | schema.sql | orders routes |
| `gps_locations` | schema.sql | gps routes |
| `employee_current_location` | schema.sql | gps routes |
| `tasks` | schema.sql | field routes |
| `messages` | schema.sql | chat routes |
| `leads` | schema.sql | sales routes |
| `projects` | schema.sql | pipelineEngine, aipEngine, documentEngine |
| `pipeline_events` | schema.sql | pipelineEngine |
| `approvals` | schema.sql | pipelineEngine |
| `pipeline_notifications` | schema.sql | pipelineEngine |
| `client_tokens` | schema.sql | client portal |
| `survey_responses` | schema.sql | survey routes |
| `payment_links` | schema.sql | payment routes |

### 2.2 AI / Brain / Platform (techno-kol-ops owned)
| Table | Defined in | Used by |
|-------|-----------|---------|
| `brain_snapshots` | migration_v2.sql | brainEngine |
| `brain_reports` | migration_v2.sql | brainEngine |
| `brain_decisions` | migration_v2.sql | brainEngine |
| `brain_learning_log` | migration_v2.sql | brainEngine |
| `market_prices` | migration_v2.sql | pricingEngine |
| `competitor_prices` | migration_v2.sql | competitorEngine |
| `sales_targets` | migration_v2.sql | salesAgentEngine |
| `sales_activities` | migration_v2.sql | salesAgentEngine |
| `call_recordings` | migration_v2.sql | recordingEngine |
| `fraud_alerts` | migration_v2.sql | fraudEngine |
| `payroll_runs` | migration_v2.sql | payrollEngine |
| `company_goals` | migration_v2.sql | goalsEngine |
| `generated_documents` | migration_v2.sql | documentEngine (legacy) |
| `documents` | migration_v2.sql | signatureService |
| `document_recipients` | migration_v2.sql | signatureService |
| `signatures` | migration_v2.sql | signatureService |
| `document_tokens` | migration_v2.sql | signatureService |
| `document_audit_log` | migration_v2.sql | signatureService |
| `document_templates` | migration_v2.sql | signatureService |
| `aip_queries` | migration_v2.sql | aipEngine |
| `apollo_deployments` | migration_v2.sql | apolloService |
| `ontology_cache` | migration_v2.sql | ontologyService |
| `system_events` | migration_v2.sql | eventBus |

**Total tables in techno-kol-ops code: 47**

---

## 3. onyx-procurement tables (mega ERP)

Extracted from `onyx-procurement/supabase/migrations/*.sql`.

| Migration | Tables |
|-----------|--------|
| `000-bootstrap-pg-execute` | `schema_migrations` (bootstrap) |
| `001-supabase-schema` | `suppliers`, `supplier_products`, `price_history`, `purchase_requests`, `purchase_request_items`, `rfqs`, `rfq_recipients`, `supplier_quotes`, `quote_line_items`, `purchase_orders`, `po_line_items`, `procurement_decisions`, `subcontractors`, `subcontractor_pricing`, `subcontractor_decisions`, `audit_log`, `system_events`, `notifications` |
| `002-seed-data-extended` | (seed only) |
| `003-migration-tracking-and-precision` | `schema_migrations` (canonical), `vat_rates` |
| `004-vat-module` | `company_tax_profile`, `vat_periods`, `tax_invoices`, `vat_submissions` |
| `005-annual-tax-module` | `projects`, `customers`, `customer_invoices`, `customer_payments`, `fiscal_years`, `annual_tax_reports`, `chart_of_accounts` |
| `006-bank-reconciliation` | `bank_accounts`, `bank_statements`, `bank_transactions`, `reconciliation_matches`, `reconciliation_discrepancies` |
| `007-payroll-wage-slip` | `employers`, `employees`, `wage_slips`, `employee_balances`, `payroll_audit_log` |

**Total onyx-procurement canonical tables: ~41**

---

## 4. Cross-reference — overlaps, unique, conflicts

### 4.1 Hard overlaps (same table name exists in BOTH schemas)

| Table | onyx-procurement definition | techno-kol-ops definition | Risk |
|-------|----------------------------|---------------------------|------|
| `suppliers` | 001-supabase-schema.sql | schema.sql (metal-fab columns: category, payment_terms, lead_days) | **HIGH — schema drift**. Columns differ. |
| `employees` | 007-payroll-wage-slip.sql | schema.sql (factory fields: role, department, salary, employment_type) | **HIGH — schema drift**. Payroll model vs factory model. |
| `projects` | 005-annual-tax-module.sql | schema.sql (full 20-stage pipeline, surveyor/installer IDs, pipeline_stage enum) | **CRITICAL — fundamentally different entities**. onyx `projects` is an accounting dimension, techno-kol `projects` is a living pipeline. |
| `system_events` | 001-supabase-schema.sql | migration_v2.sql | **LOW** — both generic event bus. Columns (`type`, `data`, `created_at`) compatible. |
| `purchase_orders` | 001-supabase-schema.sql | (referenced by procurementEngine, not defined in schema.sql) | **MEDIUM** — techno-kol-ops client expects mega-ERP PO shape, server never creates table. |

### 4.2 Tables unique to techno-kol-ops — need migration

All 23 tables in section 2.1 except `suppliers`, `employees`, `projects` are unique to techno-kol-ops:
`clients`, `attendance`, `work_orders`, `work_order_employees`, `material_items`, `material_movements`, `alerts`, `financial_transactions`, `users`, `order_events`, `gps_locations`, `employee_current_location`, `tasks`, `messages`, `leads`, `pipeline_events`, `approvals`, `pipeline_notifications`, `client_tokens`, `survey_responses`, `payment_links`.

All 23 tables in section 2.2 (Brain / AI / Docs / Ontology) are unique to techno-kol-ops.

### 4.3 Tables unique to onyx-procurement — not needed by techno-kol-ops
VAT / annual tax / bank reconciliation / wage-slip payroll — techno-kol-ops does NOT reference these. They stay in onyx-procurement.

### 4.4 Missing ops-hub tables (gap vs. spec)
Per the operations-hub charter (metal fabrication jobs + real estate + contracts), these canonical tables were **completely missing** from the existing schema.sql / migration_v2.sql:
- `jobs` — unified job container spanning metal-fab and real-estate arms
- `job_tasks` — task board under each job
- `properties` — real-estate arm asset register
- `contracts` — counterparty contract register with PDF path

These four tables are added by the new `001-operations-core.sql` migration created here.

---

## 5. Recommendations

1. **DO NOT** import `001-supabase-schema.sql` from onyx-procurement into the techno-kol-ops database. The `suppliers`, `employees`, `projects` tables will collide with techno-kol-ops' business model.
2. **Adopt schema separation** — run each project against its own Supabase project OR use dedicated Postgres schemas (`ops.*` vs. `finance.*`) so overlapping names coexist.
3. **Port raw-pg schema into Supabase migrations chain.** The existing `src/db/schema.sql` and `src/db/migration_v2.sql` should be converted into `supabase/migrations/002-legacy-v1.sql` and `003-legacy-v2.sql` so that techno-kol-ops gains the same migration-tracking discipline as onyx-procurement. This audit only introduces `001-operations-core.sql` for the NEW ops-hub tables — legacy porting is a follow-up task.
4. **Reconcile `projects`** — pick one of:
   (a) rename onyx `projects` to `accounting_projects` (cleanest), or
   (b) rename techno-kol `projects` to `job_pipelines` and let `jobs` (new) be the header.
   Option (b) is aligned with this migration since `jobs` is now the new canonical header.
5. **FK policy for shared dimensions** — new `jobs`, `contracts` tables reference `clients(id)` which lives in the legacy schema. Migration uses a soft UUID ref (no FK) so it can run before legacy port; flip to hard FK after step 3.

---

## 6. Files created by this audit

| Path | Purpose |
|------|---------|
| `techno-kol-ops/supabase/SCHEMA_AUDIT.md` | this document |
| `techno-kol-ops/supabase/migrations/001-operations-core.sql` | new `jobs` + `job_tasks` + `properties` + `contracts` tables |

No existing files modified. No migrations executed.
