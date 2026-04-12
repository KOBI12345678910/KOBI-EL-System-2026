-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 005
-- Annual Tax Module (B-10) — Wave 1.5
-- ═══════════════════════════════════════════════════════════════
-- Supports: דוח שנתי (Form 1301 individuals / 1320 companies),
-- Form 6111 (financial report schema), Form 30א (manufacturer report),
-- projects, invoices, customer_payments, P&L rollup

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- projects — construction/manufacturing projects
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                    SERIAL PRIMARY KEY,
  project_code          TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  client_id             INTEGER,
  client_name           TEXT,
  client_tax_id         TEXT,
  address               TEXT,
  project_type          TEXT CHECK (project_type IN ('construction','fabrication','installation','real_estate','service','other')),
  status                TEXT NOT NULL DEFAULT 'planning'
                          CHECK (status IN ('planning','active','on_hold','completed','cancelled','archived')),
  contract_value        NUMERIC(14,2),
  estimated_cost        NUMERIC(14,2),
  actual_cost           NUMERIC(14,2) DEFAULT 0,
  start_date            DATE,
  end_date              DATE,
  completion_percent    NUMERIC(5,2) DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  fiscal_year           INTEGER,
  revenue_recognition   TEXT DEFAULT 'completed_contract' CHECK (revenue_recognition IN ('completed_contract','percentage_of_completion')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_fiscal_year ON projects(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);

-- ─────────────────────────────────────────────────────────────
-- customers — with full tax identity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  legal_name            TEXT,
  tax_id                TEXT NOT NULL,                  -- ח.פ / ע.מ / ת.ז
  tax_id_type           TEXT NOT NULL DEFAULT 'company' CHECK (tax_id_type IN ('company','individual','nonprofit','partnership','foreign')),
  phone                 TEXT,
  email                 TEXT,
  address_street        TEXT,
  address_city          TEXT,
  address_postal        TEXT,
  payment_terms_days    INTEGER DEFAULT 30,
  credit_limit          NUMERIC(14,2),
  is_related_party      BOOLEAN NOT NULL DEFAULT FALSE,  -- צד קשור לצורך דיווח
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tax_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON customers(tax_id);

-- ─────────────────────────────────────────────────────────────
-- customer_invoices — sales invoices (mirrors tax_invoices but with project link)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_invoices (
  id                    SERIAL PRIMARY KEY,
  invoice_number        TEXT NOT NULL,
  invoice_date          DATE NOT NULL,
  due_date              DATE,
  customer_id           INTEGER REFERENCES customers(id),
  customer_name         TEXT NOT NULL,
  customer_tax_id       TEXT NOT NULL,
  project_id            INTEGER REFERENCES projects(id),
  description           TEXT,
  net_amount            NUMERIC(14,2) NOT NULL,
  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.17,
  vat_amount            NUMERIC(14,2) NOT NULL,
  gross_amount          NUMERIC(14,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  -- Invoice Reform 2024
  allocation_number     TEXT,
  allocation_status     TEXT DEFAULT 'pending' CHECK (allocation_status IN ('pending','verified','invalid','exempt')),
  -- Payment tracking
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','issued','partial','paid','overdue','voided','disputed')),
  voided_at             TIMESTAMPTZ,
  voided_reason         TEXT,
  linked_tax_invoice_id INTEGER REFERENCES tax_invoices(id),
  pdf_path              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer ON customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_project ON customer_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status ON customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_date ON customer_invoices(invoice_date);

-- ─────────────────────────────────────────────────────────────
-- customer_payments — receipts (קבלה)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_payments (
  id                    SERIAL PRIMARY KEY,
  receipt_number        TEXT NOT NULL UNIQUE,
  payment_date          DATE NOT NULL,
  customer_id           INTEGER REFERENCES customers(id),
  customer_name         TEXT NOT NULL,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency              TEXT NOT NULL DEFAULT 'ILS',
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('bank_transfer','check','cash','credit_card','standing_order','wire','other')),
  bank_account_id       INTEGER,
  check_number          TEXT,
  check_bank            TEXT,
  check_branch          TEXT,
  check_account         TEXT,
  check_value_date      DATE,
  reference_number      TEXT,                       -- bank transaction id
  invoice_ids           INTEGER[],                  -- array of customer_invoices.id being paid
  notes                 TEXT,
  reconciled            BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at         TIMESTAMPTZ,
  reconciled_by         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_method ON customer_payments(payment_method);

-- ─────────────────────────────────────────────────────────────
-- fiscal_years — annual tax reporting periods
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_years (
  id                    SERIAL PRIMARY KEY,
  year                  INTEGER NOT NULL UNIQUE,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','closing','closed','audited','submitted')),
  closed_at             TIMESTAMPTZ,
  closed_by             TEXT,
  -- Key figures
  total_revenue         NUMERIC(14,2) DEFAULT 0,
  total_cogs            NUMERIC(14,2) DEFAULT 0,
  gross_profit          NUMERIC(14,2) DEFAULT 0,
  total_expenses        NUMERIC(14,2) DEFAULT 0,
  net_profit_before_tax NUMERIC(14,2) DEFAULT 0,
  income_tax            NUMERIC(14,2) DEFAULT 0,
  net_profit_after_tax  NUMERIC(14,2) DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- annual_tax_reports — drafts of forms 1301/1320/6111/30א
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS annual_tax_reports (
  id                    SERIAL PRIMARY KEY,
  fiscal_year           INTEGER NOT NULL,
  form_type             TEXT NOT NULL CHECK (form_type IN ('1301','1320','6111','30a','126','856','867')),
  report_version        TEXT,                       -- e.g. '2026'
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','prepared','reviewed','submitted','accepted','amended')),
  payload               JSONB NOT NULL,             -- full form data
  computed_totals       JSONB,
  submitted_at          TIMESTAMPTZ,
  submitted_by          TEXT,
  authority_reference   TEXT,
  pdf_path              TEXT,
  xml_path              TEXT,                       -- some forms submit as XML
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fiscal_year, form_type)
);

CREATE INDEX IF NOT EXISTS idx_annual_tax_reports_year ON annual_tax_reports(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_annual_tax_reports_form ON annual_tax_reports(form_type);

-- ─────────────────────────────────────────────────────────────
-- chart_of_accounts — mapped to Form 6111 line numbers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id                    SERIAL PRIMARY KEY,
  account_code          TEXT NOT NULL UNIQUE,
  account_name          TEXT NOT NULL,
  account_name_en       TEXT,
  account_type          TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense','cogs')),
  parent_id             INTEGER REFERENCES chart_of_accounts(id),
  form_6111_line        TEXT,                       -- line number in Form 6111
  form_1320_line        TEXT,
  is_control            BOOLEAN NOT NULL DEFAULT FALSE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);

-- Record migration
INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('005', 'annual-tax-module', 'wave1.5-b10', 'Annual tax — projects, customer_invoices, payments, fiscal years, forms 1301/1320/6111')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;
