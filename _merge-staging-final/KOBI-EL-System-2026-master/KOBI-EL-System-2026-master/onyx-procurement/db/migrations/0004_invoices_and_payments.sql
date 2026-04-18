-- Migration : 0004_invoices_and_payments.sql
-- Original  : invoices and payments — חשבוניות ותשלומים
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים

-- +migrate Up
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_id           UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  issued_at       DATE NOT NULL,
  due_at          DATE,
  status          doc_status NOT NULL DEFAULT 'pending',
  currency        currency_code NOT NULL DEFAULT 'ILS',
  fx_rate         NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal        NUMERIC(14,2) NOT NULL,
  vat_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL,
  total_ils       NUMERIC(14,2) NOT NULL,
  paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  pdf_url         TEXT,
  ocr_raw         JSONB,                                   -- OCR extraction result
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoice_supplier_number UNIQUE (supplier_id, invoice_number),
  CONSTRAINT chk_inv_total_nonneg CHECK (total >= 0),
  CONSTRAINT chk_inv_paid_nonneg  CHECK (paid_amount >= 0),
  CONSTRAINT chk_inv_paid_le_total CHECK (paid_amount <= total)
);

CREATE INDEX IF NOT EXISTS idx_inv_supplier ON invoices (supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_po       ON invoices (po_id);
CREATE INDEX IF NOT EXISTS idx_inv_status   ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_inv_due      ON invoices (due_at) WHERE due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  paid_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  amount        NUMERIC(14,2) NOT NULL,
  currency      currency_code NOT NULL DEFAULT 'ILS',
  fx_rate       NUMERIC(14,6) NOT NULL DEFAULT 1,
  amount_ils    NUMERIC(14,2) NOT NULL,
  method        TEXT NOT NULL,                           -- bank_transfer / check / cash / credit
  reference     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_pmt_amount_pos CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_pmt_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pmt_date    ON payments (paid_at DESC);

DROP TRIGGER IF EXISTS trg_inv_touch ON invoices;
CREATE TRIGGER trg_inv_touch
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Keep invoices.paid_amount in sync with payments
CREATE OR REPLACE FUNCTION recalc_invoice_paid() RETURNS TRIGGER AS $$
DECLARE
  target UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE invoices
     SET paid_amount = COALESCE((SELECT SUM(amount_ils) FROM payments WHERE invoice_id = target), 0),
         status = CASE
                    WHEN COALESCE((SELECT SUM(amount_ils) FROM payments WHERE invoice_id = target), 0) >= total
                      THEN 'paid'::doc_status
                    ELSE status
                  END
   WHERE id = target;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pmt_recalc ON payments;
CREATE TRIGGER trg_pmt_recalc
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION recalc_invoice_paid();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY inv_read_auth ON invoices
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pmt_read_auth ON payments
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- +migrate Down
DROP TRIGGER IF EXISTS trg_pmt_recalc ON payments;
DROP TRIGGER IF EXISTS trg_inv_touch ON invoices;
DROP FUNCTION IF EXISTS recalc_invoice_paid();
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoices;
