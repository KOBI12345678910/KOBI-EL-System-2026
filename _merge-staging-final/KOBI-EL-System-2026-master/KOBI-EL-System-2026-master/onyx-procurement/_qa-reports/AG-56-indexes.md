# AG-56 — Postgres / Supabase Index Audit

**Agent:** 56
**Date:** 2026-04-11
**Scope:** `onyx-procurement/`
**Rule:** לא מוחקים (no destructive changes). All recommendations are additive.

---

## Summary

| Area | Count |
|---|---|
| Tables audited | 41 |
| Migration files scanned | `supabase/migrations/001…007` |
| Source files scanned | `server.js`, `src/vat/*`, `src/tax/*`, `src/bank/*`, `src/payroll/*` |
| Existing explicit indexes found | 48 |
| **New indexes proposed** | **50** |
| Indexes flagged as redundant (not deleted) | 6 |

Notes on method:
- Schema truth is derived from `supabase/migrations/001-…` through `007-…`.
- Query patterns are derived from all `supabase.from('…').select(...).eq(...).order(...).in(...).gte(...).lt(...).neq(...)` chains in `server.js` and `src/**/*.js`.
- The rule "לא מוחקים" means redundant indexes are only **listed** — no `DROP INDEX` is issued.
- Migration path requested by the task is `migrations/999_add_perf_indexes.sql` (new root-level `migrations/` folder); the existing project tree puts migrations under `supabase/migrations/`. The new file lives at `onyx-procurement/migrations/999_add_perf_indexes.sql` as requested.

---

## Table-by-Table Audit

Legend:
- `PK` — primary key (auto-indexed)
- `UK` — unique constraint / index
- `IX` — explicit `CREATE INDEX`
- `FK` — foreign key column
- `MISS` — no index but query pattern demands one
- `PARTIAL` — partial index suggestion
- `COMPOSITE` — composite index suggestion

### 1. `suppliers`  (migration 001)

Existing:
- `PK (id)`

Query patterns found:
- `.eq('id', X)` — covered by PK
- `.order('total_spent', { ascending:false }).gt('total_orders', 0)` — `/api/analytics/spend-by-supplier`
- `.eq('active', true)` — view `supplier_dashboard`, `procurement_dashboard`
- JOIN `suppliers` via FK from most other tables — already covered from other side
- Text search on `name` — seed scripts use `WHERE s.name = …`

Missing / proposed:
- **MISS** — `idx_suppliers_active_total_spent (active, total_spent DESC)` — analytics spend query
- **MISS** — `idx_suppliers_name_lower (LOWER(name))` — seed / name-based lookup pattern
- **PARTIAL** — `idx_suppliers_active (active) WHERE active = true` — dashboard filter

Redundant: none.

---

### 2. `supplier_products`  (001)

Existing:
- `PK (id)`
- `IX idx_supplier_products_category (category)`
- `IX idx_supplier_products_supplier (supplier_id)` — FK

Query patterns:
- `.in('category', cats)` — `/api/rfq/send`
- `.eq('category', X)` — `/api/suppliers/search/:category`
- `.eq('supplier_id', X)` — `/api/suppliers/:id`

Missing / proposed:
- **COMPOSITE** — `idx_supplier_products_category_supplier (category, supplier_id)` — speeds the RFQ-send "find suppliers who sell category C" path which is hot

Redundant: none.

---

### 3. `price_history`  (001)

Existing:
- `PK (id)`
- `IX idx_price_history_supplier (supplier_id)` — FK
- `IX idx_price_history_product (product_key)`

Missing / proposed:
- **MISS** — `idx_price_history_product_id (product_id)` — `product_id UUID REFERENCES supplier_products(id)` is a FK with no index (classic PG trap: FK on parent delete scans child)
- **COMPOSITE** — `idx_price_history_supplier_recorded (supplier_id, recorded_at DESC)` — `/api/suppliers/:id` calls `.eq('supplier_id').order('recorded_at', desc).limit(50)`

Redundant: none.

---

### 4. `purchase_requests`  (001)

Existing:
- `PK (id)`

Query patterns:
- `.order('created_at', desc)` — `/api/purchase-requests`
- `.eq('id', X).update({ status })` — several places
- JOIN from `rfqs.purchase_request_id`

Missing / proposed:
- **MISS** — `idx_purchase_requests_created_at (created_at DESC)` — list endpoint
- **MISS** — `idx_purchase_requests_status (status)` — status-filter pattern (not yet used in code but every state machine inevitably gains one; low-risk composite baseline)

Redundant: none.

---

### 5. `purchase_request_items`  (001)

Existing:
- `PK (id)`
- `IX idx_pr_items_request (request_id)` — FK

Redundant: none. No new proposals.

---

### 6. `rfqs`  (001)

Existing:
- `PK (id)`

Query patterns:
- `.eq('id', X)` — PK
- `.order('sent_at', desc)` — `/api/rfqs` (via `rfq_summary` view)
- `.eq('status', …)` — status transitions
- JOIN on `purchase_request_id` from `rfq_summary`

Missing / proposed:
- **MISS** — `idx_rfqs_purchase_request_id (purchase_request_id)` — **FK with no index** (important — join from `rfq_summary` view and ON DELETE behavior)
- **MISS** — `idx_rfqs_status (status)` — dashboard `WHERE status IN ('sent','collecting')`
- **MISS** — `idx_rfqs_sent_at (sent_at DESC)` — list ordering

Redundant: none.

---

### 7. `rfq_recipients`  (001)

Existing:
- `PK (id)`
- `IX idx_rfq_recipients_rfq (rfq_id)` — FK
- `IX idx_rfq_recipients_supplier (supplier_id)` — FK

Query patterns:
- `.eq('rfq_id',X).eq('supplier_id',Y).update(status)` — `/api/quotes` POST

Missing / proposed:
- **COMPOSITE** — `idx_rfq_recipients_rfq_supplier (rfq_id, supplier_id)` — the upsert pattern above does a two-column equality lookup. Not strictly necessary (index on `rfq_id` is enough when the list is short), but useful and cheap.

Redundant: none.

---

### 8. `supplier_quotes`  (001)

Existing:
- `PK (id)`
- `IX idx_quotes_rfq (rfq_id)` — FK
- `IX idx_quotes_supplier (supplier_id)` — FK

Query patterns:
- `.eq('rfq_id', X)` — widely used (decision engine, RFQ view)

No new proposals — covered. No redundancies.

---

### 9. `quote_line_items`  (001)

Existing:
- `PK (id)`
- `IX idx_quote_lines_quote (quote_id)` — FK

Missing / proposed:
- **MISS** — `idx_quote_line_items_item_id (item_id)` — `item_id UUID REFERENCES purchase_request_items(id)` is an **unindexed FK**.

Redundant: none.

---

### 10. `purchase_orders`  (001 + 003)

Existing:
- `PK (id)`
- `IX idx_po_supplier (supplier_id)` — FK
- `IX idx_po_status (status)`
- `IX idx_po_project (project_id)`

Query patterns:
- `.order('created_at', desc)` — `/api/purchase-orders`
- `.eq('status','sent')` — bank reconciliation candidate pool
- `.eq('status','delivered')` / `.eq('status','pending_approval')` — dashboard
- `.update({status,…}).eq('id', X)` — PK, covered
- FK to `rfq_id` — unindexed

Missing / proposed:
- **MISS** — `idx_purchase_orders_rfq_id (rfq_id)` — **unindexed FK**
- **MISS** — `idx_purchase_orders_created_at (created_at DESC)` — list endpoint ordering
- **COMPOSITE** — `idx_purchase_orders_status_created (status, created_at DESC)` — dashboard needs "open orders sorted by recency"; replaces need for plain status index in most paths
- **PARTIAL** — `idx_purchase_orders_open (status) WHERE status NOT IN ('closed','cancelled','delivered')` — `procurement_dashboard` view's "active orders"

Redundant: none (the plain `idx_po_status` stays for broader use).

---

### 11. `po_line_items`  (001)

Existing:
- `PK (id)`
- `IX idx_po_lines_po (po_id)` — FK

Query patterns:
- `.select('category, total_price')` with GROUP BY — `/api/analytics/spend-by-category`

Missing / proposed:
- **MISS** — `idx_po_line_items_category (category)` — category aggregation (could use covering index including `total_price` as well for index-only scan)
- **COVERING** — `idx_po_line_items_category_total (category, total_price)` — analytics

Redundant: none.

---

### 12. `procurement_decisions`  (001)

Existing:
- `PK (id)`

Query patterns:
- `.select('savings_amount, savings_percent, selected_supplier_name, decided_at')` — `/api/analytics/savings`
- JOIN / FK references: `rfq_id`, `purchase_request_id`, `purchase_order_id`, `selected_supplier_id` — **all unindexed FKs**

Missing / proposed:
- **MISS** — `idx_procurement_decisions_rfq_id (rfq_id)` — FK
- **MISS** — `idx_procurement_decisions_purchase_request_id (purchase_request_id)` — FK
- **MISS** — `idx_procurement_decisions_purchase_order_id (purchase_order_id)` — FK
- **MISS** — `idx_procurement_decisions_selected_supplier_id (selected_supplier_id)` — FK
- **MISS** — `idx_procurement_decisions_decided_at (decided_at DESC)` — savings analytics ordering

Redundant: none.

---

### 13. `subcontractors`  (001)

Existing:
- `PK (id)`

Query patterns:
- `.order('quality_rating', desc)` — `/api/subcontractors`
- `.eq('available', true)` (via joined filter on client side)

Missing / proposed:
- **MISS** — `idx_subcontractors_quality_rating (quality_rating DESC)` — sort
- **MISS** — `idx_subcontractors_available (available) WHERE available = true` — filter

Redundant: none.

---

### 14. `subcontractor_pricing`  (001)

Existing:
- `PK (id)`
- `UK (subcontractor_id, work_type)`
- `IX idx_sub_pricing_sub (subcontractor_id)`
- `IX idx_sub_pricing_type (work_type)`

Query patterns:
- `.eq('work_type', X)` — `/api/subcontractors/decide`
- `.eq('subcontractor_id',X).eq('work_type',Y)` — PUT pricing

All covered.

**Redundant:** `idx_sub_pricing_sub (subcontractor_id)` is a prefix of `UK(subcontractor_id, work_type)`. Postgres can use the UK for `subcontractor_id`-only queries, so `idx_sub_pricing_sub` is **redundant** — listed only, NOT dropped (rule: לא מוחקים).

---

### 15. `subcontractor_decisions`  (001)

Existing:
- `PK (id)`

Query patterns:
- `.select('savings_amount,…, decided_at')` — analytics

Missing / proposed:
- **MISS** — `idx_subcontractor_decisions_selected_sub (selected_subcontractor_id)` — unindexed FK
- **MISS** — `idx_subcontractor_decisions_decided_at (decided_at DESC)` — analytics order

Redundant: none.

---

### 16. `audit_log`  (001 + 003)

Existing:
- `PK (id)`
- `IX idx_audit_entity (entity_type, entity_id)` — composite
- `IX idx_audit_created (created_at DESC)`
- `IX idx_audit_log_entity (entity_type, entity_id, created_at DESC)` — from migration 003
- `IX idx_audit_log_actor (actor, created_at DESC)` — from migration 003

**Redundant:**
- `idx_audit_entity (entity_type, entity_id)` is a **prefix of** `idx_audit_log_entity (entity_type, entity_id, created_at DESC)`. PG can use the longer one for both patterns. `idx_audit_entity` is redundant — listed only, not dropped.

Missing / proposed:
- None; covering indexes from 003 already handle the main patterns.

---

### 17. `system_events`  (001)

Existing:
- `PK (id)`
- `IX idx_events_type (type)`
- `IX idx_events_severity (severity)`

Query patterns:
- `.insert(...)` — no read path in current code
- Dashboards (external/planned) will filter by `(type, created_at)` and `(severity, created_at)`

Missing / proposed:
- **MISS** — `idx_system_events_created_at (created_at DESC)` — time-range dashboards
- **COMPOSITE** — `idx_system_events_type_created (type, created_at DESC)` — typed event feed
- **PARTIAL** — `idx_system_events_unack (acknowledged) WHERE NOT acknowledged` — alerting dashboard

Redundant: none (plain `type` and `severity` indexes are legitimate for low-cardinality filters combined with other WHERE clauses).

---

### 18. `notifications`  (001)

Existing:
- `PK (id)`
- `IX idx_notifications_recipient (recipient)`
- `IX idx_notifications_sent (sent)`

Query patterns (not directly in server.js yet, but schema clearly implies them):
- "unsent for user X" — `WHERE recipient = $1 AND sent = false`
- "pending to send worker" — `WHERE sent = false`

Missing / proposed:
- **PARTIAL** — `idx_notifications_pending (created_at) WHERE sent = false` — worker poll
- **COMPOSITE** — `idx_notifications_recipient_created (recipient, created_at DESC)` — user inbox

Redundant: `idx_notifications_sent` is a low-cardinality boolean index; marginal but keep.

---

### 19. `schema_migrations`  (003)

Existing:
- `PK (version)`
- `IX idx_schema_migrations_applied_at (applied_at DESC)`

Covered.

---

### 20. `vat_rates`  (003)

Existing:
- `PK`
- `UK (effective_from)`

Query patterns: lookup by `effective_from <= now()` — UK is btree so range-scannable. No new needed.

---

### 21. `company_tax_profile`  (004)

Existing:
- `PK`

Query patterns: `.limit(1)` — single-row table; no indexes needed.

---

### 22. `vat_periods`  (004)

Existing:
- `PK`
- `UK (period_start, period_end)`
- `IX idx_vat_periods_label (period_label)`
- `IX idx_vat_periods_status (status)`

Query patterns:
- `.order('period_start', desc)` — list
- `.eq('id', X)` — PK
- `WHERE status = 'open'` — view

Missing / proposed:
- **MISS** — `idx_vat_periods_start_desc (period_start DESC)` — list ordering (UK is btree so PG can backward-scan; this is optional — included as a "safer" option)

Redundant: none.

---

### 23. `tax_invoices`  (004)

Existing:
- `PK`
- `UK (invoice_number, counterparty_id, invoice_type)`
- `IX idx_tax_invoices_period (vat_period_id)`
- `IX idx_tax_invoices_date (invoice_date)`
- `IX idx_tax_invoices_direction (direction, status)` — composite
- `IX idx_tax_invoices_counterparty (counterparty_id)`
- `IX idx_tax_invoices_allocation (allocation_number) WHERE allocation_number IS NOT NULL` — partial

Query patterns:
- `.eq('vat_period_id',X).eq('direction','output').neq('status','voided')` — well-covered by `idx_tax_invoices_period` and `idx_tax_invoices_direction`
- `.gte('invoice_date', Y).lte('invoice_date', Z).eq('direction','input')` — annual tax report
- `.order('invoice_date', desc)`

Missing / proposed:
- **COMPOSITE** — `idx_tax_invoices_period_direction_status (vat_period_id, direction, status)` — covering index for the VAT-summary hot path
- **COMPOSITE** — `idx_tax_invoices_date_direction (invoice_date, direction)` — annual tax year-range + direction filter

Redundant: none.

---

### 24. `vat_submissions`  (004)

Existing:
- `PK`
- `IX idx_vat_submissions_period (vat_period_id)` — FK
- `IX idx_vat_submissions_status (status)`

Covered.

---

### 25. `projects`  (005)

Existing:
- `PK`
- `UK (project_code)`
- `IX idx_projects_status (status)`
- `IX idx_projects_fiscal_year (fiscal_year)`
- `IX idx_projects_client (client_id)`

Query patterns:
- `.order('created_at', desc)` — list
- `.eq('status',X)` / `.eq('fiscal_year',Y)` — covered

Missing / proposed:
- **MISS** — `idx_projects_created_at (created_at DESC)` — list ordering

Redundant: none.

---

### 26. `customers`  (005)

Existing:
- `PK`
- `UK (tax_id)`
- `IX idx_customers_tax_id (tax_id)`

**Redundant:**
- `idx_customers_tax_id` duplicates the unique constraint on `tax_id`. PG creates an implicit unique btree index for `UNIQUE(tax_id)`. The explicit index is redundant — listed only, not dropped.

Query patterns:
- `.eq('active', true).order('name')` — new miss

Missing / proposed:
- **MISS** — `idx_customers_active_name (name) WHERE active = true` — partial index for the active-customer listing
- **MISS** — `idx_customers_name_lower (LOWER(name))` — fuzzy name lookup pattern (future-proofing)

---

### 27. `customer_invoices`  (005)

Existing:
- `PK`
- `UK (invoice_number)`
- `IX idx_customer_invoices_customer (customer_id)` — FK
- `IX idx_customer_invoices_project (project_id)` — FK
- `IX idx_customer_invoices_status (status)`
- `IX idx_customer_invoices_date (invoice_date)`

Query patterns:
- `.neq('status','paid').neq('status','voided')` — bank auto-reconcile candidate pool
- `.gte('invoice_date',A).lte('invoice_date',B)` — fiscal year scan
- FK `linked_tax_invoice_id` — unindexed

Missing / proposed:
- **MISS** — `idx_customer_invoices_linked_tax_invoice (linked_tax_invoice_id)` — **unindexed FK**
- **PARTIAL** — `idx_customer_invoices_unpaid (invoice_date DESC) WHERE status NOT IN ('paid','voided')` — auto-reconcile candidate pool
- **COMPOSITE** — `idx_customer_invoices_customer_status_date (customer_id, status, invoice_date DESC)` — customer statement view

Redundant: none.

---

### 28. `customer_payments`  (005)

Existing:
- `PK`
- `UK (receipt_number)`
- `IX idx_customer_payments_date (payment_date)`
- `IX idx_customer_payments_customer (customer_id)` — FK
- `IX idx_customer_payments_method (payment_method)`

Query patterns:
- `.order('payment_date', desc).limit()` — list

Missing / proposed:
- **MISS** — `idx_customer_payments_bank_account (bank_account_id)` — **unindexed FK** (column exists, no constraint declared but semantically FK)
- **MISS** — `idx_customer_payments_reconciled (reconciled) WHERE NOT reconciled` — reconciliation worker

Redundant: none (`payment_method` is low-cardinality but used in reports; keep).

---

### 29. `fiscal_years`  (005)

Existing: `PK`, `UK (year)`. Covered.

---

### 30. `annual_tax_reports`  (005)

Existing:
- `PK`
- `UK (fiscal_year, form_type)`
- `IX idx_annual_tax_reports_year (fiscal_year)`
- `IX idx_annual_tax_reports_form (form_type)`

**Redundant:**
- `idx_annual_tax_reports_year` is a prefix of the unique `UK(fiscal_year, form_type)` — redundant (rule: לא מוחקים — listed only).

Query patterns:
- `.eq('fiscal_year', Y)` — covered by UK
- `.eq('fiscal_year',Y).eq('form_type',T)` — covered by UK

No new proposals.

---

### 31. `chart_of_accounts`  (005)

Existing:
- `PK`
- `UK (account_code)`
- `IX idx_coa_type (account_type)`

Missing / proposed:
- **MISS** — `idx_chart_of_accounts_parent (parent_id)` — **unindexed FK** (self-referential)

Redundant: none.

---

### 32. `bank_accounts`  (006)

Existing:
- `PK`
- `UK (bank_code, branch_number, account_number)`
- `IX idx_bank_accounts_active (active)`

Query patterns:
- `.order('is_primary', desc)` — `/api/bank/accounts`

Missing / proposed:
- **MISS** — `idx_bank_accounts_primary (is_primary DESC) WHERE active = true` — ordering

Redundant: none.

---

### 33. `bank_statements`  (006)

Existing:
- `PK`
- `UK (bank_account_id, period_start, period_end)`
- `IX idx_bank_statements_account (bank_account_id, period_start)`

**Redundant:**
- `idx_bank_statements_account (bank_account_id, period_start)` is a prefix of the unique `UK(bank_account_id, period_start, period_end)` — redundant (rule: לא מוחקים — listed only).

No new proposals.

---

### 34. `bank_transactions`  (006)

Existing:
- `PK (id BIGSERIAL)`
- `IX idx_bank_tx_account_date (bank_account_id, transaction_date)` — composite, FK+date
- `IX idx_bank_tx_statement (bank_statement_id)` — FK
- `IX idx_bank_tx_reconciled (reconciled) WHERE NOT reconciled` — partial
- `IX idx_bank_tx_matched (matched_to_type, matched_to_id)` — composite

Query patterns:
- `.eq('bank_account_id',X).eq('reconciled',false).order('transaction_date',desc).limit(500)` — auto-reconcile; composite `(bank_account_id, transaction_date)` + partial reconcile index are both used

Missing / proposed:
- **COMPOSITE** — `idx_bank_tx_account_reconciled_date (bank_account_id, transaction_date DESC) WHERE NOT reconciled` — covers the auto-reconcile hot path exactly

Redundant: none.

---

### 35. `reconciliation_matches`  (006)

Existing:
- `PK`
- `UK (bank_transaction_id, target_type, target_id)`
- `IX idx_recon_matches_tx (bank_transaction_id)`
- `IX idx_recon_matches_target (target_type, target_id)`

**Redundant:**
- `idx_recon_matches_tx` is a prefix of `UK(bank_transaction_id, target_type, target_id)` — redundant (listed only).

No new proposals.

---

### 36. `reconciliation_discrepancies`  (006)

Existing:
- `PK`
- `IX idx_recon_disc_account (bank_account_id, status)` — composite

Missing / proposed:
- **MISS** — `idx_recon_disc_bank_statement (bank_statement_id)` — **unindexed FK**
- **MISS** — `idx_recon_disc_bank_tx (bank_transaction_id)` — **unindexed FK**

Redundant: none.

---

### 37. `employers`  (007)

Existing: `PK`, `UK (company_id)`. Covered.

---

### 38. `employees`  (007)

Existing:
- `PK`
- `UK (employer_id, employee_number)`
- `UK (employer_id, national_id)`
- `IX idx_employees_employer (employer_id, is_active)` — composite

Query patterns:
- `.eq('employer_id',X).eq('is_active',true).order('full_name')` — list

Missing / proposed:
- **COMPOSITE** — `idx_employees_employer_active_name (employer_id, full_name) WHERE is_active = true` — employer roster, alphabetical, active only

Redundant:
- `idx_employees_employer (employer_id, is_active)` is **almost but not quite** a prefix of the unique constraints. Not redundant.

---

### 39. `wage_slips`  (007)

Existing:
- `PK`
- `UK (employee_id, period_year, period_month)`
- `IX idx_wage_slips_employee_period (employee_id, period_year DESC, period_month DESC)`
- `IX idx_wage_slips_employer_period (employer_id, period_year, period_month)`
- `IX idx_wage_slips_status (status)`

Query patterns:
- `.eq('employee_id',X).eq('period_year',Y).lt('period_month',M)` — YTD computation — covered by `idx_wage_slips_employee_period`
- FK `amendment_of` — self-referential FK, unindexed

Missing / proposed:
- **MISS** — `idx_wage_slips_amendment_of (amendment_of) WHERE amendment_of IS NOT NULL` — unindexed self-FK

**Redundant:**
- `idx_wage_slips_employee_period (employee_id, period_year DESC, period_month DESC)` substantially overlaps `UK (employee_id, period_year, period_month)`. Both are kept because the DESC variant matters for the YTD-history hot path (backward scan would work on the UK but forward sort is explicit here). Listed only, not dropped.

---

### 40. `employee_balances`  (007)

Existing: `PK`, `UK (employee_id, snapshot_date)`.

Query patterns:
- `.eq('employee_id',X).order('snapshot_date', desc).limit(1)` — fully served by the UK (btree backward scan).

No new proposals.

---

### 41. `payroll_audit_log`  (007)

Existing:
- `PK (id BIGSERIAL)`
- `IX idx_payroll_audit_wage_slip (wage_slip_id, created_at DESC)`
- `IX idx_payroll_audit_employee (employee_id, created_at DESC)`
- `IX idx_payroll_audit_time (created_at DESC)`

Covered.

---

## Consolidated Redundancy List (not deleted — rule: לא מוחקים)

| # | Index | Redundant vs. | Why flagged |
|---|---|---|---|
| 1 | `idx_sub_pricing_sub` | `UK subcontractor_pricing(subcontractor_id, work_type)` | Prefix match |
| 2 | `idx_audit_entity` | `idx_audit_log_entity(entity_type, entity_id, created_at DESC)` | Prefix match |
| 3 | `idx_customers_tax_id` | `UK customers(tax_id)` | Implicit unique btree covers it |
| 4 | `idx_annual_tax_reports_year` | `UK annual_tax_reports(fiscal_year, form_type)` | Prefix match |
| 5 | `idx_bank_statements_account` | `UK bank_statements(bank_account_id, period_start, period_end)` | Prefix match |
| 6 | `idx_recon_matches_tx` | `UK reconciliation_matches(bank_transaction_id, target_type, target_id)` | Prefix match |

All six remain **in place**. Future cleanup (in a different agent / explicit approval) could drop them after `pg_stat_user_indexes` confirms zero usage over a representative window.

---

## Summary of Proposed New Indexes (50)

Per table, see next file: `migrations/999_add_perf_indexes.sql`.

Categories (approximate — many indexes belong to more than one bucket):
- **14** unindexed foreign keys (procurement_decisions x4, purchase_orders, rfqs, price_history, quote_line_items, customer_invoices, customer_payments, chart_of_accounts, subcontractor_decisions, recon_disc x2, wage_slips.amendment_of)
- **12** ORDER BY / range column indexes (created_at DESC / decided_at DESC / sent_at DESC / invoice_date / etc.)
- **12** composite indexes for hot equality+sort paths (status+created, period+direction+status, customer+status+date, etc.)
- **10** partial indexes (`WHERE active = TRUE`, `WHERE NOT reconciled`, `WHERE status NOT IN (...)`, `WHERE sent = FALSE`, `WHERE acknowledged = FALSE`, `WHERE amendment_of IS NOT NULL`, `WHERE is_active = TRUE`)
- **2** expression indexes (`LOWER(suppliers.name)`, `LOWER(customers.name)`)

All new indexes use `CREATE INDEX IF NOT EXISTS` (idempotent) and `CONCURRENTLY` where safe on production. The delivered SQL offers two variants: synchronous (safer for fresh DBs / Supabase SQL Editor) and concurrent (for live traffic) — see the header of the file.

---

## Verification queries (run post-apply)

```sql
-- 1. Confirm all new indexes exist
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 2. Find remaining unindexed foreign keys (target: zero rows)
SELECT c.conrelid::regclass AS table_name,
       a.attname            AS fk_column,
       c.conname            AS constraint_name
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid
 AND a.attnum   = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  )
ORDER BY table_name, fk_column;

-- 3. Find indexes that are never used (>= 7 days of traffic)
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

**End of report.**
