-- =====================================================================
-- Migration : 999  add_perf_indexes
-- Created   : 2026-04-11
-- Author    : Agent 56 (AG-56-indexes)
-- Ticket    : AG-56
--
-- Description
-- -----------
-- Adds 34 performance indexes identified by the AG-56 audit of
-- Postgres/Supabase. Covers:
--   * unindexed foreign keys (classic Postgres footgun)
--   * WHERE / ORDER BY / JOIN columns called by server.js and src/**/*.js
--   * composite indexes for hot equality + sort paths
--   * partial indexes (active / unreconciled / unpaid / unacknowledged)
--   * one expression index (LOWER(name))
--
-- Rule of the house: we do not delete.  This migration is ADDITIVE only.
-- No DROP INDEX statements are issued; known redundant legacy indexes
-- are documented in _qa-reports/AG-56-indexes.md and remain in place.
--
-- All statements are idempotent (IF NOT EXISTS) so re-running on a
-- partially-applied database is safe.
--
-- Notes on CONCURRENTLY
-- ---------------------
-- On a hot production database prefer CREATE INDEX CONCURRENTLY (which
-- cannot run inside a transaction block).  The migration runner wraps
-- each file in a transaction, so this file uses plain CREATE INDEX
-- IF NOT EXISTS which is safe on:
--   * fresh databases
--   * Supabase SQL Editor runs
--   * low-traffic maintenance windows
-- For a live-traffic apply, copy the statements into a separate
-- non-transactional script and add CONCURRENTLY to each CREATE INDEX.
-- =====================================================================

-- UP

-- ─────────────────────────────────────────────────────────────────────
-- 1. suppliers
-- ─────────────────────────────────────────────────────────────────────

-- /api/analytics/spend-by-supplier: WHERE total_orders > 0 ORDER BY total_spent DESC
CREATE INDEX IF NOT EXISTS idx_suppliers_active_total_spent
  ON suppliers (active, total_spent DESC);

-- Seed / admin lookups by name (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_suppliers_name_lower
  ON suppliers (LOWER(name));

-- procurement_dashboard view: WHERE active = true
CREATE INDEX IF NOT EXISTS idx_suppliers_active_partial
  ON suppliers (id)
  WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- 2. supplier_products
-- ─────────────────────────────────────────────────────────────────────

-- /api/rfq/send hot path: .in('category', cats) + JOIN suppliers
CREATE INDEX IF NOT EXISTS idx_supplier_products_category_supplier
  ON supplier_products (category, supplier_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. price_history
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: product_id UUID REFERENCES supplier_products(id)
CREATE INDEX IF NOT EXISTS idx_price_history_product_id
  ON price_history (product_id);

-- /api/suppliers/:id: .eq('supplier_id').order('recorded_at', desc).limit(50)
CREATE INDEX IF NOT EXISTS idx_price_history_supplier_recorded
  ON price_history (supplier_id, recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 4. purchase_requests
-- ─────────────────────────────────────────────────────────────────────

-- /api/purchase-requests: .order('created_at', desc)
CREATE INDEX IF NOT EXISTS idx_purchase_requests_created_at
  ON purchase_requests (created_at DESC);

-- Dashboard status filter (not in code yet but state-machine column)
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status
  ON purchase_requests (status);

-- ─────────────────────────────────────────────────────────────────────
-- 6. rfqs
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: purchase_request_id UUID REFERENCES purchase_requests(id)
CREATE INDEX IF NOT EXISTS idx_rfqs_purchase_request_id
  ON rfqs (purchase_request_id);

-- procurement_dashboard: WHERE status IN ('sent','collecting')
CREATE INDEX IF NOT EXISTS idx_rfqs_status
  ON rfqs (status);

-- /api/rfqs via rfq_summary view: .order('sent_at', desc)
CREATE INDEX IF NOT EXISTS idx_rfqs_sent_at
  ON rfqs (sent_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 7. rfq_recipients
-- ─────────────────────────────────────────────────────────────────────

-- /api/quotes POST: .eq('rfq_id').eq('supplier_id').update(status)
CREATE INDEX IF NOT EXISTS idx_rfq_recipients_rfq_supplier
  ON rfq_recipients (rfq_id, supplier_id);

-- ─────────────────────────────────────────────────────────────────────
-- 9. quote_line_items
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: item_id UUID REFERENCES purchase_request_items(id)
CREATE INDEX IF NOT EXISTS idx_quote_line_items_item_id
  ON quote_line_items (item_id);

-- ─────────────────────────────────────────────────────────────────────
-- 10. purchase_orders
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: rfq_id UUID REFERENCES rfqs(id)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_rfq_id
  ON purchase_orders (rfq_id);

-- /api/purchase-orders: .order('created_at', desc)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON purchase_orders (created_at DESC);

-- Dashboard "open orders by recency"
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_created
  ON purchase_orders (status, created_at DESC);

-- procurement_dashboard: active orders excludes closed/cancelled/delivered
CREATE INDEX IF NOT EXISTS idx_purchase_orders_open
  ON purchase_orders (created_at DESC)
  WHERE status NOT IN ('closed','cancelled','delivered');

-- ─────────────────────────────────────────────────────────────────────
-- 11. po_line_items
-- ─────────────────────────────────────────────────────────────────────

-- /api/analytics/spend-by-category: GROUP BY category, SUM(total_price)
CREATE INDEX IF NOT EXISTS idx_po_line_items_category_total
  ON po_line_items (category, total_price);

-- ─────────────────────────────────────────────────────────────────────
-- 12. procurement_decisions
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FKs (all four)
CREATE INDEX IF NOT EXISTS idx_procurement_decisions_rfq_id
  ON procurement_decisions (rfq_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_purchase_request_id
  ON procurement_decisions (purchase_request_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_purchase_order_id
  ON procurement_decisions (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_procurement_decisions_selected_supplier_id
  ON procurement_decisions (selected_supplier_id);

-- /api/analytics/savings: .select(...decided_at)
CREATE INDEX IF NOT EXISTS idx_procurement_decisions_decided_at
  ON procurement_decisions (decided_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 13. subcontractors
-- ─────────────────────────────────────────────────────────────────────

-- /api/subcontractors: .order('quality_rating', desc)
CREATE INDEX IF NOT EXISTS idx_subcontractors_quality_rating
  ON subcontractors (quality_rating DESC);

-- Availability filter
CREATE INDEX IF NOT EXISTS idx_subcontractors_available
  ON subcontractors (id)
  WHERE available = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- 15. subcontractor_decisions
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: selected_subcontractor_id
CREATE INDEX IF NOT EXISTS idx_subcontractor_decisions_selected_sub
  ON subcontractor_decisions (selected_subcontractor_id);

-- Analytics ordering
CREATE INDEX IF NOT EXISTS idx_subcontractor_decisions_decided_at
  ON subcontractor_decisions (decided_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 17. system_events
-- ─────────────────────────────────────────────────────────────────────

-- Time-range dashboards
CREATE INDEX IF NOT EXISTS idx_system_events_created_at
  ON system_events (created_at DESC);

-- Typed event feed
CREATE INDEX IF NOT EXISTS idx_system_events_type_created
  ON system_events (type, created_at DESC);

-- Alerting dashboard: unacknowledged
CREATE INDEX IF NOT EXISTS idx_system_events_unack
  ON system_events (created_at DESC)
  WHERE acknowledged = FALSE;

-- ─────────────────────────────────────────────────────────────────────
-- 18. notifications
-- ─────────────────────────────────────────────────────────────────────

-- Worker poll: pending notifications
CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notifications (created_at)
  WHERE sent = FALSE;

-- User inbox
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 22. vat_periods
-- ─────────────────────────────────────────────────────────────────────

-- /api/vat/periods: .order('period_start', desc)
CREATE INDEX IF NOT EXISTS idx_vat_periods_start_desc
  ON vat_periods (period_start DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 23. tax_invoices
-- ─────────────────────────────────────────────────────────────────────

-- VAT summary hot path: WHERE vat_period_id = $1 AND direction = $2 AND status != 'voided'
CREATE INDEX IF NOT EXISTS idx_tax_invoices_period_direction_status
  ON tax_invoices (vat_period_id, direction, status);

-- Annual tax year-range + direction
CREATE INDEX IF NOT EXISTS idx_tax_invoices_date_direction
  ON tax_invoices (invoice_date, direction);

-- ─────────────────────────────────────────────────────────────────────
-- 25. projects
-- ─────────────────────────────────────────────────────────────────────

-- /api/projects: .order('created_at', desc)
CREATE INDEX IF NOT EXISTS idx_projects_created_at
  ON projects (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 26. customers
-- ─────────────────────────────────────────────────────────────────────

-- /api/customers: .eq('active', true).order('name')
CREATE INDEX IF NOT EXISTS idx_customers_active_name
  ON customers (name)
  WHERE active = TRUE;

-- Future fuzzy lookup
CREATE INDEX IF NOT EXISTS idx_customers_name_lower
  ON customers (LOWER(name));

-- ─────────────────────────────────────────────────────────────────────
-- 27. customer_invoices
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FK: linked_tax_invoice_id
CREATE INDEX IF NOT EXISTS idx_customer_invoices_linked_tax_invoice
  ON customer_invoices (linked_tax_invoice_id);

-- Bank auto-reconcile candidate pool: WHERE status NOT IN ('paid','voided')
CREATE INDEX IF NOT EXISTS idx_customer_invoices_unpaid
  ON customer_invoices (invoice_date DESC)
  WHERE status NOT IN ('paid','voided');

-- Customer statement: (customer_id, status, invoice_date)
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer_status_date
  ON customer_invoices (customer_id, status, invoice_date DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 28. customer_payments
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed semantic FK: bank_account_id
CREATE INDEX IF NOT EXISTS idx_customer_payments_bank_account
  ON customer_payments (bank_account_id);

-- Reconciliation worker
CREATE INDEX IF NOT EXISTS idx_customer_payments_unreconciled
  ON customer_payments (payment_date DESC)
  WHERE reconciled = FALSE;

-- ─────────────────────────────────────────────────────────────────────
-- 31. chart_of_accounts
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed self-referential FK: parent_id
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent
  ON chart_of_accounts (parent_id);

-- ─────────────────────────────────────────────────────────────────────
-- 32. bank_accounts
-- ─────────────────────────────────────────────────────────────────────

-- /api/bank/accounts: .order('is_primary', desc) among active accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_primary_active
  ON bank_accounts (is_primary DESC)
  WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- 34. bank_transactions
-- ─────────────────────────────────────────────────────────────────────

-- /api/bank/accounts/:id/auto-reconcile covering index
CREATE INDEX IF NOT EXISTS idx_bank_tx_account_reconciled_date
  ON bank_transactions (bank_account_id, transaction_date DESC)
  WHERE reconciled = FALSE;

-- ─────────────────────────────────────────────────────────────────────
-- 36. reconciliation_discrepancies
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed FKs
CREATE INDEX IF NOT EXISTS idx_recon_disc_bank_statement
  ON reconciliation_discrepancies (bank_statement_id);

CREATE INDEX IF NOT EXISTS idx_recon_disc_bank_tx
  ON reconciliation_discrepancies (bank_transaction_id);

-- ─────────────────────────────────────────────────────────────────────
-- 38. employees
-- ─────────────────────────────────────────────────────────────────────

-- /api/employees: WHERE employer_id = $1 AND is_active = true ORDER BY full_name
CREATE INDEX IF NOT EXISTS idx_employees_employer_active_name
  ON employees (employer_id, full_name)
  WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────
-- 39. wage_slips
-- ─────────────────────────────────────────────────────────────────────

-- Unindexed self-referential FK: amendment_of
CREATE INDEX IF NOT EXISTS idx_wage_slips_amendment_of
  ON wage_slips (amendment_of)
  WHERE amendment_of IS NOT NULL;


-- =====================================================================
-- Record this migration in the tracking table if it exists
-- (the runner will normally do this, but we belt-and-suspenders it so
--  the file is also idempotently applyable via raw psql.)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'schema_migrations') THEN
    INSERT INTO schema_migrations (version, name, checksum, notes)
    VALUES ('999','add_perf_indexes','ag-56','AG-56 performance indexes (34 new)')
    ON CONFLICT (version) DO UPDATE
      SET applied_at = NOW(),
          notes = EXCLUDED.notes || ' (re-applied)';
  END IF;
END$$;


-- DOWN

-- Rollback drops all indexes added by the UP block above, in reverse
-- order.  Rule "לא מוחקים" applies to data and production indexes on
-- applied tables; a migration's own DOWN IS allowed to undo its OWN UP
-- (that is what DOWN sections are for -- see migrations/README.md).

DROP INDEX IF EXISTS idx_wage_slips_amendment_of;
DROP INDEX IF EXISTS idx_employees_employer_active_name;
DROP INDEX IF EXISTS idx_recon_disc_bank_tx;
DROP INDEX IF EXISTS idx_recon_disc_bank_statement;
DROP INDEX IF EXISTS idx_bank_tx_account_reconciled_date;
DROP INDEX IF EXISTS idx_bank_accounts_primary_active;
DROP INDEX IF EXISTS idx_chart_of_accounts_parent;
DROP INDEX IF EXISTS idx_customer_payments_unreconciled;
DROP INDEX IF EXISTS idx_customer_payments_bank_account;
DROP INDEX IF EXISTS idx_customer_invoices_customer_status_date;
DROP INDEX IF EXISTS idx_customer_invoices_unpaid;
DROP INDEX IF EXISTS idx_customer_invoices_linked_tax_invoice;
DROP INDEX IF EXISTS idx_customers_name_lower;
DROP INDEX IF EXISTS idx_customers_active_name;
DROP INDEX IF EXISTS idx_projects_created_at;
DROP INDEX IF EXISTS idx_tax_invoices_date_direction;
DROP INDEX IF EXISTS idx_tax_invoices_period_direction_status;
DROP INDEX IF EXISTS idx_vat_periods_start_desc;
DROP INDEX IF EXISTS idx_notifications_recipient_created;
DROP INDEX IF EXISTS idx_notifications_pending;
DROP INDEX IF EXISTS idx_system_events_unack;
DROP INDEX IF EXISTS idx_system_events_type_created;
DROP INDEX IF EXISTS idx_system_events_created_at;
DROP INDEX IF EXISTS idx_subcontractor_decisions_decided_at;
DROP INDEX IF EXISTS idx_subcontractor_decisions_selected_sub;
DROP INDEX IF EXISTS idx_subcontractors_available;
DROP INDEX IF EXISTS idx_subcontractors_quality_rating;
DROP INDEX IF EXISTS idx_procurement_decisions_decided_at;
DROP INDEX IF EXISTS idx_procurement_decisions_selected_supplier_id;
DROP INDEX IF EXISTS idx_procurement_decisions_purchase_order_id;
DROP INDEX IF EXISTS idx_procurement_decisions_purchase_request_id;
DROP INDEX IF EXISTS idx_procurement_decisions_rfq_id;
DROP INDEX IF EXISTS idx_po_line_items_category_total;
DROP INDEX IF EXISTS idx_purchase_orders_open;
DROP INDEX IF EXISTS idx_purchase_orders_status_created;
DROP INDEX IF EXISTS idx_purchase_orders_created_at;
DROP INDEX IF EXISTS idx_purchase_orders_rfq_id;
DROP INDEX IF EXISTS idx_quote_line_items_item_id;
DROP INDEX IF EXISTS idx_rfq_recipients_rfq_supplier;
DROP INDEX IF EXISTS idx_rfqs_sent_at;
DROP INDEX IF EXISTS idx_rfqs_status;
DROP INDEX IF EXISTS idx_rfqs_purchase_request_id;
DROP INDEX IF EXISTS idx_purchase_requests_status;
DROP INDEX IF EXISTS idx_purchase_requests_created_at;
DROP INDEX IF EXISTS idx_price_history_supplier_recorded;
DROP INDEX IF EXISTS idx_price_history_product_id;
DROP INDEX IF EXISTS idx_supplier_products_category_supplier;
DROP INDEX IF EXISTS idx_suppliers_active_partial;
DROP INDEX IF EXISTS idx_suppliers_name_lower;
DROP INDEX IF EXISTS idx_suppliers_active_total_spent;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'schema_migrations') THEN
    UPDATE schema_migrations
      SET rolled_back = TRUE,
          notes = COALESCE(notes,'') || ' (rolled back)'
      WHERE version = '999';
  END IF;
END$$;
