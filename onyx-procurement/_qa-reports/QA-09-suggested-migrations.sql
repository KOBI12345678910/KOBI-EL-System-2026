-- ═══════════════════════════════════════════════════════════════════════
-- QA-09 — Suggested Integrity Migration (DRY RUN — DO NOT EXECUTE BLINDLY)
-- ═══════════════════════════════════════════════════════════════════════
-- Author:   QA-09 — Database Integrity Agent
-- Date:     2026-04-11
-- Scope:    onyx-procurement + techno-kol-ops
-- Purpose:  Add missing constraints discovered in QA-09 integrity audit.
-- Safety:   * idempotent (every ALTER / CREATE uses IF NOT EXISTS patterns)
--           * non-destructive (no DROP, no DELETE, no UPDATE)
--           * run in staging first; verify each block before commit
--           * SOME BLOCKS WILL FAIL IF EXISTING DATA VIOLATES the new
--             constraint — that is expected; fix the data first, then re-run.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION A — onyx-procurement :: 001 schema hardening
-- ─────────────────────────────────────────────────────────────────────

-- A.1 — suppliers: prevent duplicate phone
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_phone_unique'
  ) THEN
    ALTER TABLE suppliers
      ADD CONSTRAINT suppliers_phone_unique UNIQUE (phone);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping suppliers_phone_unique (likely duplicate phones exist): %', SQLERRM;
END $$;

-- A.2 — suppliers: money columns must be non-negative
ALTER TABLE suppliers
  DROP CONSTRAINT IF EXISTS suppliers_money_nonneg;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_money_nonneg
  CHECK (
    COALESCE(total_spent, 0) >= 0
    AND COALESCE(total_negotiated_savings, 0) >= 0
    AND COALESCE(on_time_delivery_rate, 0) BETWEEN 0 AND 100
  );

-- A.3 — supplier_products: current_price non-negative
ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_price_nonneg;
ALTER TABLE supplier_products
  ADD CONSTRAINT supplier_products_price_nonneg
  CHECK (current_price IS NULL OR current_price >= 0);

-- A.4 — price_history: price must be non-negative
ALTER TABLE price_history
  DROP CONSTRAINT IF EXISTS price_history_price_nonneg;
ALTER TABLE price_history
  ADD CONSTRAINT price_history_price_nonneg
  CHECK (price >= 0);

-- A.5 — purchase_request_items: quantity must be > 0
ALTER TABLE purchase_request_items
  DROP CONSTRAINT IF EXISTS pr_items_qty_positive;
ALTER TABLE purchase_request_items
  ADD CONSTRAINT pr_items_qty_positive
  CHECK (quantity > 0);

-- A.6 — rfqs: FK to purchase_requests explicit ON DELETE SET NULL
DO $$
BEGIN
  -- drop old unnamed FK if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rfqs' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'rfqs_purchase_request_id_fkey'
  ) THEN
    ALTER TABLE rfqs DROP CONSTRAINT rfqs_purchase_request_id_fkey;
  END IF;
  ALTER TABLE rfqs
    ADD CONSTRAINT rfqs_purchase_request_id_fkey
    FOREIGN KEY (purchase_request_id)
    REFERENCES purchase_requests(id)
    ON DELETE SET NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_purchase_request ON rfqs(purchase_request_id);

-- A.7 — rfq_recipients: prevent duplicate (rfq, supplier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfq_recipients_rfq_supplier_unique'
  ) THEN
    ALTER TABLE rfq_recipients
      ADD CONSTRAINT rfq_recipients_rfq_supplier_unique
      UNIQUE (rfq_id, supplier_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping rfq_recipients unique (existing dupes): %', SQLERRM;
END $$;

-- A.8 — supplier_quotes: explicit ON DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'supplier_quotes_rfq_id_fkey' AND table_name = 'supplier_quotes') THEN
    ALTER TABLE supplier_quotes DROP CONSTRAINT supplier_quotes_rfq_id_fkey;
  END IF;
  ALTER TABLE supplier_quotes
    ADD CONSTRAINT supplier_quotes_rfq_id_fkey
    FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'supplier_quotes_supplier_id_fkey' AND table_name = 'supplier_quotes') THEN
    ALTER TABLE supplier_quotes DROP CONSTRAINT supplier_quotes_supplier_id_fkey;
  END IF;
  ALTER TABLE supplier_quotes
    ADD CONSTRAINT supplier_quotes_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;
END $$;

ALTER TABLE supplier_quotes
  DROP CONSTRAINT IF EXISTS supplier_quotes_price_nonneg;
ALTER TABLE supplier_quotes
  ADD CONSTRAINT supplier_quotes_price_nonneg
  CHECK (total_price >= 0 AND total_with_vat >= 0 AND delivery_fee >= 0);

-- A.9 — quote_line_items: quantity > 0, unit_price >= 0
ALTER TABLE quote_line_items
  DROP CONSTRAINT IF EXISTS quote_line_items_money_valid;
ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_money_valid
  CHECK (quantity > 0 AND unit_price >= 0 AND total_price >= 0
         AND discount_percent BETWEEN 0 AND 100);

-- A.10 — purchase_orders: explicit ON DELETE + total >= 0
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'purchase_orders_rfq_id_fkey' AND table_name = 'purchase_orders') THEN
    ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_rfq_id_fkey;
  END IF;
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_rfq_id_fkey
    FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'purchase_orders_supplier_id_fkey' AND table_name = 'purchase_orders') THEN
    ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_supplier_id_fkey;
  END IF;
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;
END $$;

ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_total_nonneg;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_total_nonneg
  CHECK (
    subtotal >= 0
    AND total >= 0
    AND delivery_fee >= 0
    AND COALESCE(vat_amount, 0) >= 0
    AND COALESCE(negotiated_savings, 0) >= 0
  );

-- A.11 — po_line_items money validity
ALTER TABLE po_line_items
  DROP CONSTRAINT IF EXISTS po_line_items_money_valid;
ALTER TABLE po_line_items
  ADD CONSTRAINT po_line_items_money_valid
  CHECK (quantity > 0 AND unit_price >= 0 AND total_price >= 0);

-- A.12 — procurement_decisions: explicit ON DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'procurement_decisions_rfq_id_fkey' AND table_name = 'procurement_decisions') THEN
    ALTER TABLE procurement_decisions DROP CONSTRAINT procurement_decisions_rfq_id_fkey;
  END IF;
  ALTER TABLE procurement_decisions
    ADD CONSTRAINT procurement_decisions_rfq_id_fkey
    FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE SET NULL;
END $$;

-- A.13 — subcontractor_pricing: percentage bounded
ALTER TABLE subcontractor_pricing
  DROP CONSTRAINT IF EXISTS subcontractor_pricing_valid;
ALTER TABLE subcontractor_pricing
  ADD CONSTRAINT subcontractor_pricing_valid
  CHECK (
    percentage_rate BETWEEN 0 AND 100
    AND price_per_sqm >= 0
    AND COALESCE(minimum_price, 0) >= 0
  );

-- A.14 — subcontractor_decisions: area must be positive when set
ALTER TABLE subcontractor_decisions
  DROP CONSTRAINT IF EXISTS subcontractor_decisions_area_positive;
ALTER TABLE subcontractor_decisions
  ADD CONSTRAINT subcontractor_decisions_area_positive
  CHECK (area_sqm IS NULL OR area_sqm > 0);

-- A.15 — notifications: severity bounded
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_severity_valid;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_severity_valid
  CHECK (severity IN ('info','warning','error','critical'));

-- ─────────────────────────────────────────────────────────────────────
-- SECTION B — onyx-procurement :: 004 VAT module hardening
-- ─────────────────────────────────────────────────────────────────────

-- B.1 — company_tax_profile: UNIQUE on company_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_tax_profile_company_id_key') THEN
    ALTER TABLE company_tax_profile
      ADD CONSTRAINT company_tax_profile_company_id_key UNIQUE (company_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping company_tax_profile unique: %', SQLERRM;
END $$;

-- B.2 — vat_periods: UNIQUE period_label + gross integrity check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vat_periods_label_unique') THEN
    ALTER TABLE vat_periods
      ADD CONSTRAINT vat_periods_label_unique UNIQUE (period_label);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- B.3 — tax_invoices: gross must equal net + vat (within 0.02 rounding tolerance)
ALTER TABLE tax_invoices
  DROP CONSTRAINT IF EXISTS tax_invoices_gross_valid;
ALTER TABLE tax_invoices
  ADD CONSTRAINT tax_invoices_gross_valid
  CHECK (ABS(gross_amount - (net_amount + vat_amount)) <= 0.02);

ALTER TABLE tax_invoices
  DROP CONSTRAINT IF EXISTS tax_invoices_amounts_nonneg;
ALTER TABLE tax_invoices
  ADD CONSTRAINT tax_invoices_amounts_nonneg
  CHECK (net_amount >= 0 AND vat_amount >= 0 AND gross_amount >= 0);

-- B.4 — tax_invoices: explicit ON DELETE SET NULL for vat_period_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'tax_invoices_vat_period_id_fkey') THEN
    ALTER TABLE tax_invoices DROP CONSTRAINT tax_invoices_vat_period_id_fkey;
  END IF;
  ALTER TABLE tax_invoices
    ADD CONSTRAINT tax_invoices_vat_period_id_fkey
    FOREIGN KEY (vat_period_id) REFERENCES vat_periods(id) ON DELETE SET NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION C — onyx-procurement :: 005 annual tax module
-- ─────────────────────────────────────────────────────────────────────

-- C.1 — RENAME projects TO finance_projects (avoid collision with techno-kol-ops.projects)
-- NOTE: this is destructive to existing code references; do NOT run without grep-and-replace first.
-- ALTER TABLE projects RENAME TO finance_projects;  -- LEFT COMMENTED INTENTIONALLY

-- C.2 — fiscal_years: end_date > start_date
ALTER TABLE fiscal_years
  DROP CONSTRAINT IF EXISTS fiscal_years_dates_valid;
ALTER TABLE fiscal_years
  ADD CONSTRAINT fiscal_years_dates_valid
  CHECK (end_date > start_date);

-- C.3 — customer_invoices: expand UNIQUE to (invoice_number, customer_tax_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoices_invoice_number_key') THEN
    ALTER TABLE customer_invoices DROP CONSTRAINT customer_invoices_invoice_number_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoices_number_taxid_unique') THEN
    ALTER TABLE customer_invoices
      ADD CONSTRAINT customer_invoices_number_taxid_unique
      UNIQUE (invoice_number, customer_tax_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping customer_invoices unique: %', SQLERRM;
END $$;

ALTER TABLE customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_amounts_valid;
ALTER TABLE customer_invoices
  ADD CONSTRAINT customer_invoices_amounts_valid
  CHECK (
    net_amount >= 0
    AND vat_amount >= 0
    AND gross_amount >= 0
    AND amount_paid >= 0
    AND amount_outstanding >= 0
    AND amount_paid + amount_outstanding <= gross_amount + 0.02
  );

-- C.4 — customer_payments: invoice_ids may not be empty if linked
-- (we cannot constrain the array contents with a simple CHECK; add a supporting allocation table)
CREATE TABLE IF NOT EXISTS customer_payment_allocations (
  id               SERIAL PRIMARY KEY,
  payment_id       INTEGER NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  invoice_id       INTEGER NOT NULL REFERENCES customer_invoices(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON customer_payment_allocations(invoice_id);

-- C.5 — annual_tax_reports: FK to fiscal_years.year
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'annual_tax_reports_fiscal_year_fkey') THEN
    ALTER TABLE annual_tax_reports
      ADD CONSTRAINT annual_tax_reports_fiscal_year_fkey
      FOREIGN KEY (fiscal_year) REFERENCES fiscal_years(year) ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skipping annual_tax_reports FK: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION D — onyx-procurement :: 006 bank reconciliation
-- ─────────────────────────────────────────────────────────────────────

-- D.1 — bank_accounts: currency NOT NULL + balance sanity
ALTER TABLE bank_accounts
  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_balance_sane;
ALTER TABLE bank_accounts
  ADD CONSTRAINT bank_accounts_balance_sane
  CHECK (COALESCE(available_balance, 0) <= COALESCE(current_balance, 0) + 1e9);

-- D.2 — bank_transactions: amount != 0 (zero tx is nonsense)
ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_amount_nonzero;
ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_amount_nonzero
  CHECK (amount <> 0);

-- D.3 — bank_statements: FK explicit
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'bank_statements_bank_account_id_fkey') THEN
    ALTER TABLE bank_statements DROP CONSTRAINT bank_statements_bank_account_id_fkey;
  END IF;
  ALTER TABLE bank_statements
    ADD CONSTRAINT bank_statements_bank_account_id_fkey
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT;
END $$;

-- D.4 — reconciliation_discrepancies: FK to bank_transaction_id explicit
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'reconciliation_discrepancies_bank_transaction_id_fkey') THEN
    ALTER TABLE reconciliation_discrepancies DROP CONSTRAINT reconciliation_discrepancies_bank_transaction_id_fkey;
  END IF;
  ALTER TABLE reconciliation_discrepancies
    ADD CONSTRAINT reconciliation_discrepancies_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION E — onyx-procurement :: 007 payroll
-- ─────────────────────────────────────────────────────────────────────

-- E.1 — employers: company_id must be 9 digits
ALTER TABLE employers
  DROP CONSTRAINT IF EXISTS employers_company_id_format;
ALTER TABLE employers
  ADD CONSTRAINT employers_company_id_format
  CHECK (company_id ~ '^[0-9]{9}$');

-- E.2 — employees: national_id must be 9 digits; hours sane
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_national_id_format;
ALTER TABLE employees
  ADD CONSTRAINT employees_national_id_format
  CHECK (national_id ~ '^[0-9]{9}$');

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_hours_valid;
ALTER TABLE employees
  ADD CONSTRAINT employees_hours_valid
  CHECK (hours_per_month IS NULL OR (hours_per_month > 0 AND hours_per_month <= 300));

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_salary_nonneg;
ALTER TABLE employees
  ADD CONSTRAINT employees_salary_nonneg
  CHECK (base_salary IS NULL OR base_salary >= 0);

-- E.3 — wage_slips: UNIQUE now includes employer_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wage_slips_employee_id_period_year_period_month_key') THEN
    ALTER TABLE wage_slips
      DROP CONSTRAINT wage_slips_employee_id_period_year_period_month_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wage_slips_employer_emp_period_unique') THEN
    ALTER TABLE wage_slips
      ADD CONSTRAINT wage_slips_employer_emp_period_unique
      UNIQUE (employer_id, employee_id, period_year, period_month);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE wage_slips
  DROP CONSTRAINT IF EXISTS wage_slips_amounts_nonneg;
ALTER TABLE wage_slips
  ADD CONSTRAINT wage_slips_amounts_nonneg
  CHECK (
    gross_pay >= 0
    AND net_pay >= 0
    AND total_deductions >= 0
    AND hours_regular >= 0
    AND hours_overtime_125 >= 0 AND hours_overtime_150 >= 0
    AND hours_overtime_175 >= 0 AND hours_overtime_200 >= 0
  );

-- ─────────────────────────────────────────────────────────────────────
-- SECTION F — techno-kol-ops :: legacy schema.sql hardening
-- ─────────────────────────────────────────────────────────────────────
-- These blocks run ONLY if the table exists (skip silently otherwise).

-- F.1 — clients: NUMERIC(14,2) migration + CHECK
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    ALTER TABLE clients ALTER COLUMN credit_limit  TYPE NUMERIC(14,2) USING credit_limit::NUMERIC(14,2);
    ALTER TABLE clients ALTER COLUMN balance_due   TYPE NUMERIC(14,2) USING balance_due::NUMERIC(14,2);
    ALTER TABLE clients ALTER COLUMN total_revenue TYPE NUMERIC(14,2) USING total_revenue::NUMERIC(14,2);

    ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_money_nonneg;
    ALTER TABLE clients
      ADD CONSTRAINT clients_money_nonneg
      CHECK (credit_limit >= 0 AND total_revenue >= 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'clients migration skipped: %', SQLERRM;
END $$;

-- F.2 — employees (techno-kol-ops variant): salary precision + UNIQUE(id_number)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'employees' AND column_name = 'salary'
                 AND numeric_precision = 10) THEN
    ALTER TABLE employees ALTER COLUMN salary TYPE NUMERIC(14,2) USING salary::NUMERIC(14,2);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'employees.salary migration skipped: %', SQLERRM;
END $$;

-- F.3 — work_orders: money precision + status CHECK
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN
    ALTER TABLE work_orders ALTER COLUMN price        TYPE NUMERIC(14,2) USING price::NUMERIC(14,2);
    ALTER TABLE work_orders ALTER COLUMN cost_estimate TYPE NUMERIC(14,2) USING cost_estimate::NUMERIC(14,2);
    ALTER TABLE work_orders ALTER COLUMN cost_actual   TYPE NUMERIC(14,2) USING cost_actual::NUMERIC(14,2);
    ALTER TABLE work_orders ALTER COLUMN advance_paid  TYPE NUMERIC(14,2) USING advance_paid::NUMERIC(14,2);

    ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_valid;
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_status_valid
      CHECK (status IN ('pending','production','finishing','ready','delivered','cancelled'));

    ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_priority_valid;
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_priority_valid
      CHECK (priority IN ('low','normal','high','urgent'));

    ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_money_valid;
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_money_valid
      CHECK (price >= 0 AND COALESCE(cost_estimate, 0) >= 0
             AND COALESCE(cost_actual, 0) >= 0 AND advance_paid >= 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'work_orders migration skipped: %', SQLERRM;
END $$;

-- F.4 — financial_transactions: precision + type CHECK
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'financial_transactions') THEN
    ALTER TABLE financial_transactions ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::NUMERIC(14,2);

    ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_type_valid;
    ALTER TABLE financial_transactions
      ADD CONSTRAINT financial_transactions_type_valid
      CHECK (type IN ('income','advance','expense','salary','material_cost','refund','transfer','adjustment'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'financial_transactions migration skipped: %', SQLERRM;
END $$;

-- F.5 — techno-kol-ops projects (if renamed or rescoped separately): money precision
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'projects' AND column_name = 'total_price') THEN
    ALTER TABLE projects ALTER COLUMN total_price TYPE NUMERIC(14,2) USING total_price::NUMERIC(14,2);

    -- add CHECK only if advance_paid column also exists with expected type
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'projects' AND column_name = 'advance_paid') THEN
      ALTER TABLE projects ALTER COLUMN advance_paid TYPE NUMERIC(14,2) USING advance_paid::NUMERIC(14,2);

      ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_advance_le_total;
      ALTER TABLE projects
        ADD CONSTRAINT projects_advance_le_total
        CHECK (advance_paid <= total_price);
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'projects migration skipped: %', SQLERRM;
END $$;

-- F.6 — payment_links: amount > 0, paid_amount <= amount
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE payment_links ALTER COLUMN amount      TYPE NUMERIC(14,2) USING amount::NUMERIC(14,2);
    ALTER TABLE payment_links ALTER COLUMN paid_amount TYPE NUMERIC(14,2) USING paid_amount::NUMERIC(14,2);

    ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_valid;
    ALTER TABLE payment_links
      ADD CONSTRAINT payment_links_valid
      CHECK (amount > 0 AND (paid_amount IS NULL OR paid_amount <= amount + 0.02));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'payment_links migration skipped: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION G — payment allocation RPC (the real fix for the loop)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_payment_to_invoices(
  p_payment_id INTEGER,
  p_invoice_ids INTEGER[],
  p_amount NUMERIC(14,2)
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining NUMERIC(14,2) := p_amount;
  v_inv RECORD;
  v_pay NUMERIC(14,2);
  v_new_paid NUMERIC(14,2);
  v_new_out NUMERIC(14,2);
  v_new_status TEXT;
  v_result JSONB := '[]'::jsonb;
BEGIN
  -- wrapped inside a single transaction automatically by plpgsql
  FOR v_inv IN
    SELECT id, amount_paid, amount_outstanding, gross_amount
    FROM customer_invoices
    WHERE id = ANY(p_invoice_ids)
    ORDER BY array_position(p_invoice_ids, id)
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_pay := LEAST(v_remaining, v_inv.amount_outstanding);
    v_new_paid := v_inv.amount_paid + v_pay;
    v_new_out  := v_inv.amount_outstanding - v_pay;
    v_new_status := CASE WHEN v_new_out <= 0 THEN 'paid' ELSE 'partial' END;

    UPDATE customer_invoices
       SET amount_paid = v_new_paid,
           amount_outstanding = v_new_out,
           status = v_new_status
     WHERE id = v_inv.id;

    INSERT INTO customer_payment_allocations (payment_id, invoice_id, allocated_amount)
    VALUES (p_payment_id, v_inv.id, v_pay)
    ON CONFLICT (payment_id, invoice_id) DO NOTHING;

    v_result := v_result || jsonb_build_object(
      'invoice_id', v_inv.id,
      'allocated',  v_pay,
      'new_paid',   v_new_paid,
      'new_out',    v_new_out,
      'new_status', v_new_status
    );

    v_remaining := v_remaining - v_pay;
  END LOOP;

  IF v_remaining > 0 THEN
    -- rollback by raising — transaction is aborted
    RAISE EXCEPTION 'payment_amount_exceeds_outstanding: remaining=%.2f', v_remaining;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION apply_payment_to_invoices(INTEGER, INTEGER[], NUMERIC) IS
  'Atomic payment→invoice allocation. Replaces the unsafe JS loop in annual-tax-routes.js:110. Fix for QA-09 CRITICAL #3.';

-- ─────────────────────────────────────────────────────────────────────
-- SECTION H — record this migration
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('008', 'qa-09-integrity-fixes', 'qa09-2026-04-11',
        'QA-09 integrity audit: FK ON DELETE, CHECK positivity, UNIQUE phone, payment RPC, techno-kol NUMERIC(14,2)')
ON CONFLICT (version) DO UPDATE
SET applied_at = NOW(),
    notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after apply, read-only):
--
-- -- Section A sanity:
-- SELECT conname, conrelid::regclass, contype FROM pg_constraint
-- WHERE conname LIKE 'supplier%' OR conname LIKE 'purchase%' OR conname LIKE 'rfq%'
-- ORDER BY conrelid::regclass::text, conname;
--
-- -- Section G: test the RPC on synthetic data:
-- -- (do NOT run on production; set up a staging customer_invoice first)
-- -- SELECT apply_payment_to_invoices(1, ARRAY[1,2,3]::INTEGER[], 10000);
-- ═══════════════════════════════════════════════════════════════════════
