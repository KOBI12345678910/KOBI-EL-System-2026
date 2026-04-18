# GLOBAL FIELD MAP — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Method | Seed with Top-20 tables fully expanded; remaining 217 tables structure-only with pointer to `fields_registry.json` (3420 fields) |
| Sources | `_master-registry/fields_registry.json` (508KB, 3420 field entries), `supabase/migrations/*.sql` (235 CREATE TABLE statements), `lib-client/api-zod/src/generated/api.ts` (4175 lines) |
| Phase 4 expansion | Full per-table field map with usage (surfaced_in_pages, surfaced_in_reports, surfaced_in_API, mandatory, PII, filterable) due in Phase 4 per B-D014 |
| Evidence | `B-E020` field schema audit |

## Top-20 high-traffic tables (Phase 1 full detail)

### 1. commercial.customers

| field | type | nullable | PII | mandatory_standard (D036) | surfaces |
|---|---|---|---|---|---|
| id | uuid PK | N | N | Y | all pages |
| tenant_id | uuid FK→governance.users_profile.tenant | N | N | Y (D036) | filter |
| created_at | timestamptz | N | N | Y (D036) | audit |
| updated_at | timestamptz | N | N | Y (D036) | audit |
| created_by | uuid FK→users | Y | N | Y (D036) | audit |
| name | text | N | Y (name) | Y | list, 360 |
| legal_name | text | Y | Y | partial | 360 |
| vat_number | text | Y | Y | partial | finance |
| segment_id | uuid FK→customer_segments | Y | N | N | analytics |
| owner_id | uuid FK→users | Y | N | partial | 360 |
| status | text enum | N | N | Y | list |
| tier | text enum | Y | N | N | analytics |
| phone | text | Y | Y | N | 360, comms |
| email | text | Y | Y | N | 360, comms |
| address_json | jsonb | Y | Y | N | 360 |
| health_score | numeric | Y | N | N | dashboard |
| churn_risk | numeric | Y | N | N | dashboard |

### 2. commercial.leads
Core fields: id, tenant_id, source_id (→lead_sources — PLANNED), owner_id, status, score, name, phone, email, company, utm_*, converted_opportunity_id, created_at/updated_at. 30 fields total (fields_registry.json).

### 3. commercial.opportunities
Key fields: id, customer_id FK, stage_id FK→pipeline_stages, expected_close, amount, probability, owner_id, state, lost_reason, won_at, created_at/updated_at. 24 fields.

### 4. commercial.quotes
Key fields: id, customer_id, opportunity_id, status (draft/sent/approved/expired/lost), total_amount, vat_amount, currency, valid_until, revision_no, approved_by, approved_at, project_id (post-conversion). 28 fields.

### 5. commercial.quote_lines
id, quote_id FK, line_no, item_id, description, quantity, unit_price, discount_percent, vat_code, line_total, cost, margin_pct. 14 fields.

### 6. procurement.suppliers
id, tenant_id, name, legal_name, vat_number, status, tier, rating, lead_time_days, payment_terms, bank_details, primary_contact_id, owner_id, 30+ fields.

### 7. procurement.purchase_orders
id, po_number, supplier_id, project_id, status, total_amount, currency, approval_status, approved_by, delivery_date, 22 fields.

### 8. procurement.rfqs
id, rfq_number, title, status, deadline, owner_id, linked_project_id, 18 fields.

### 9. procurement.contracts
id, contract_number, supplier_id, type, status, start_date, end_date, value, renewal, 20 fields.

### 10. inventory.materials
id, sku, name, category_id FK, uom, default_warehouse_id, min_stock, max_stock, reorder_point, last_cost, avg_cost, 25 fields.

### 11. inventory.inventory
id, material_id FK, warehouse_id FK, quantity, reserved_quantity, available_quantity, last_count_at, 12 fields.

### 12. inventory.inventory_movements
id, material_id, warehouse_id, movement_type (receipt/issue/transfer/adjust), reference_type, reference_id, quantity, unit_cost, occurred_at, 16 fields.

### 13. execution.projects
id, code, name, customer_id FK, status, stage, start_date, target_end, actual_end, budget, spent, progress_pct, owner_id, 30 fields.

### 14. execution.work_orders
id, wo_number, project_id FK, type, status, priority, assigned_team, scheduled_start, scheduled_end, actual_start, actual_end, 25 fields.

### 15. execution.tasks
id, title, project_id FK, assignee_id, status, priority, due_date, estimate_hours, actual_hours, parent_task_id, 22 fields.

### 16. finance.invoices
id, invoice_number, customer_id, project_id, invoice_date, due_date, total, vat_total (18% per VAT_18_UPDATE.md), status, paid_amount, 28 fields.

### 17. finance.invoice_lines
id, invoice_id FK, line_no, description, quantity, unit_price, vat_code, vat_rate, vat_amount, line_total. 12 fields.

### 18. finance.payments
id, payment_number, date, amount, currency, customer_id, invoice_id, method, bank_account_id, status, 20 fields.

### 19. workforce.employees
id, employee_code, first_name, last_name, id_number (PII), hire_date, department, position, manager_id, salary, 35 fields.

### 20. workforce.payroll_runs
id, period_start, period_end, status, total_gross, total_net, total_tax, run_by, approved_by, 18 fields.

## Remaining 217 tables — structure pointer only

Per B-D014 deferral rule, remaining tables reference `fields_registry.json`. Full per-field map due in Phase 4. Structure:

| table | schema | field_count | fields_registry_key |
|---|---|---:|---|
| all other 217 | various | avg 14.4 fields/table | `fields_registry.json` → grep `"table": "schema.name"` |

**Per-field usage (surface_in_*)** will be backfilled in Phase 4 by static analysis of:
- `erp-app/src/pages/**/*.tsx` for `{field}` references
- `api-server/src/routes/**/*.ts` for select/return field names
- `reports_registry.json` / `dashboards_registry.json` for column references

## Mandatory-column standard (D036)

Per D036, every table should carry: `tenant_id, created_at, updated_at, created_by, updated_by, deleted_at (soft-delete), version`. Phase 4 will audit all 235 CREATE TABLE statements for compliance. Current status: **compliance pending — 5 SQL paren-mismatch bugs (D-Phase9) block full scan until fixed**.

## PII inventory (high-level)

Tables with PII columns requiring RLS + encryption review in Phase 4:
- workforce.employees (id_number, salary, bank_account)
- commercial.customers (phone, email, address)
- workforce.payroll_runs / payroll_entries (gross, net, tax)
- comms.portal_users (email, phone, hashed_password)
- commercial.leads (phone, email, utm_*)

## Validation pending (Phase 4 gate)

- [ ] every table has tenant_id
- [ ] every table has created_at + updated_at
- [ ] every table has audit columns
- [ ] every PII column marked in fields_registry.json
- [ ] every FK has ON DELETE policy documented
