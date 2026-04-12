-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 004
-- VAT Module (B-09) — Wave 1.5
-- ═══════════════════════════════════════════════════════════════
-- Supports: PCN836 submission, vat_periods, tax_invoices, חוק מע"מ 1975
-- Israel Tax Authority compliance: monthly/bi-monthly VAT reporting

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- company_tax_profile — single row per legal entity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_tax_profile (
  id                    SERIAL PRIMARY KEY,
  company_name          TEXT NOT NULL,
  legal_name            TEXT NOT NULL,
  company_id            TEXT NOT NULL,                      -- ח.פ / ע.מ
  vat_file_number       TEXT NOT NULL,                      -- תיק מע"מ
  tax_file_number       TEXT,                               -- תיק ניכויים
  address_street        TEXT,
  address_city          TEXT,
  address_postal        TEXT,
  phone                 TEXT,
  email                 TEXT,
  authorized_dealer     BOOLEAN NOT NULL DEFAULT TRUE,      -- עוסק מורשה
  reporting_frequency   TEXT NOT NULL DEFAULT 'monthly' CHECK (reporting_frequency IN ('monthly','bi_monthly')),
  fiscal_year_end_month INTEGER NOT NULL DEFAULT 12 CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  accounting_method     TEXT NOT NULL DEFAULT 'accrual' CHECK (accounting_method IN ('accrual','cash')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE company_tax_profile IS 'Legal entity tax identity — required for VAT/Annual tax reports';

-- ─────────────────────────────────────────────────────────────
-- vat_periods — one row per reporting period (month or 2-month)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_periods (
  id                    SERIAL PRIMARY KEY,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  period_label          TEXT NOT NULL,                      -- e.g. "2026-04" or "2026-03-04"
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','closing','submitted','accepted','rejected','amended')),

  -- Outputs (עסקאות/מכירות)
  taxable_sales         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- מחזור חייב
  zero_rate_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- עסקאות בשיעור אפס
  exempt_sales          NUMERIC(14,2) NOT NULL DEFAULT 0,   -- עסקאות פטורות
  vat_on_sales          NUMERIC(14,2) NOT NULL DEFAULT 0,   -- מס עסקאות

  -- Inputs (תשומות/קניות)
  taxable_purchases     NUMERIC(14,2) NOT NULL DEFAULT 0,   -- תשומות חייבות
  vat_on_purchases      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- מס תשומות
  asset_purchases       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- תשומות על רכוש קבוע
  vat_on_assets         NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Net
  net_vat_payable       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- סכום לתשלום / להחזר
  is_refund             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Submission
  submitted_at          TIMESTAMPTZ,
  submission_reference  TEXT,                               -- אישור שמ"ת
  pcn836_payload        JSONB,                              -- raw PCN836 record
  pcn836_file_path      TEXT,                               -- on-disk archive

  -- Audit
  prepared_by           TEXT,
  reviewed_by           TEXT,
  locked_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vat_period_dates_valid CHECK (period_end >= period_start),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_vat_periods_label ON vat_periods(period_label);
CREATE INDEX IF NOT EXISTS idx_vat_periods_status ON vat_periods(status);

-- ─────────────────────────────────────────────────────────────
-- tax_invoices — both issued (output) and received (input)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_invoices (
  id                    SERIAL PRIMARY KEY,
  invoice_type          TEXT NOT NULL CHECK (invoice_type IN ('issued','received','credit_note','debit_note')),
  direction             TEXT NOT NULL CHECK (direction IN ('output','input')),

  -- Identity
  invoice_number        TEXT NOT NULL,
  invoice_date          DATE NOT NULL,
  value_date            DATE,                               -- תאריך ערך

  -- Counterparty
  counterparty_id       TEXT,                               -- ח.פ של צד שני
  counterparty_name     TEXT,
  counterparty_address  TEXT,

  -- Amounts
  net_amount            NUMERIC(14,2) NOT NULL,
  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.17,
  vat_amount            NUMERIC(14,2) NOT NULL,
  gross_amount          NUMERIC(14,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  fx_rate               NUMERIC(10,6) DEFAULT 1.0,

  -- Classification
  category              TEXT,                               -- e.g. 'goods', 'services', 'asset'
  is_asset              BOOLEAN NOT NULL DEFAULT FALSE,
  is_zero_rate          BOOLEAN NOT NULL DEFAULT FALSE,
  is_exempt             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Period assignment
  vat_period_id         INTEGER REFERENCES vat_periods(id),
  accounting_period     TEXT,                               -- YYYY-MM

  -- Israel Invoice Reform 2024 — allocation number
  allocation_number     TEXT,                               -- מספר הקצאה
  allocation_verified   BOOLEAN DEFAULT FALSE,

  -- Source
  source_type           TEXT,                               -- 'purchase_order', 'manual', 'bank_import'
  source_id             TEXT,
  pdf_path              TEXT,

  -- Status
  status                TEXT NOT NULL DEFAULT 'recorded'
                          CHECK (status IN ('recorded','verified','disputed','voided','amended')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (invoice_number, counterparty_id, invoice_type)
);

CREATE INDEX IF NOT EXISTS idx_tax_invoices_period ON tax_invoices(vat_period_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_date ON tax_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_direction ON tax_invoices(direction, status);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_counterparty ON tax_invoices(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_allocation ON tax_invoices(allocation_number) WHERE allocation_number IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- vat_submissions — audit trail of actual submissions to רשות המסים
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_submissions (
  id                    SERIAL PRIMARY KEY,
  vat_period_id         INTEGER NOT NULL REFERENCES vat_periods(id),
  submission_type       TEXT NOT NULL CHECK (submission_type IN ('initial','amendment','correction')),
  submission_method     TEXT NOT NULL CHECK (submission_method IN ('shamat','paper','api')),
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by          TEXT NOT NULL,

  -- PCN836 structured payload
  pcn836_header         JSONB NOT NULL,
  pcn836_records        JSONB NOT NULL,
  pcn836_total_records  INTEGER NOT NULL,
  pcn836_file_checksum  TEXT,
  pcn836_file_path      TEXT,

  -- Response from tax authority
  authority_reference   TEXT,
  authority_response    JSONB,
  status                TEXT NOT NULL DEFAULT 'submitted'
                          CHECK (status IN ('submitted','accepted','rejected','under_review','corrected')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_submissions_period ON vat_submissions(vat_period_id);
CREATE INDEX IF NOT EXISTS idx_vat_submissions_status ON vat_submissions(status);

-- ─────────────────────────────────────────────────────────────
-- View: current VAT period summary
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_current_vat_period AS
SELECT
  vp.*,
  COUNT(ti_out.id) AS invoices_issued_count,
  COUNT(ti_in.id) AS invoices_received_count,
  COALESCE(SUM(ti_out.net_amount), 0) AS computed_taxable_sales,
  COALESCE(SUM(ti_out.vat_amount), 0) AS computed_vat_on_sales,
  COALESCE(SUM(ti_in.net_amount), 0) AS computed_taxable_purchases,
  COALESCE(SUM(ti_in.vat_amount), 0) AS computed_vat_on_purchases,
  COALESCE(SUM(ti_out.vat_amount), 0) - COALESCE(SUM(ti_in.vat_amount), 0) AS computed_net_vat
FROM vat_periods vp
LEFT JOIN tax_invoices ti_out ON ti_out.vat_period_id = vp.id AND ti_out.direction = 'output' AND ti_out.status != 'voided'
LEFT JOIN tax_invoices ti_in ON ti_in.vat_period_id = vp.id AND ti_in.direction = 'input' AND ti_in.status != 'voided'
WHERE vp.status = 'open'
GROUP BY vp.id;

-- Record this migration
INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('004', 'vat-module', 'wave1.5-b09', 'VAT module — PCN836, vat_periods, tax_invoices, vat_submissions')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;
