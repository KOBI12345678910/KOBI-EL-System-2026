-- Migration : 0003_purchase_orders.sql
-- Original  : purchase orders — הזמנות רכש
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים

-- +migrate Up
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT UNIQUE NOT NULL,
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status           doc_status NOT NULL DEFAULT 'draft',
  issued_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_at      DATE,
  currency         currency_code NOT NULL DEFAULT 'ILS',
  fx_rate          NUMERIC(14,6) NOT NULL DEFAULT 1,            -- to ILS
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_ils        NUMERIC(14,2) NOT NULL DEFAULT 0,            -- total × fx_rate
  notes            TEXT,
  created_by       UUID,                                         -- auth.users.id
  approved_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_po_total_nonneg CHECK (total >= 0),
  CONSTRAINT chk_po_subtotal_nonneg CHECK (subtotal >= 0),
  CONSTRAINT chk_po_vat_nonneg CHECK (vat_amount >= 0),
  CONSTRAINT chk_po_fx_positive CHECK (fx_rate > 0)
);

CREATE INDEX IF NOT EXISTS idx_po_supplier  ON purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status    ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_issued    ON purchase_orders (issued_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no          INTEGER NOT NULL,
  description      TEXT NOT NULL,
  quantity         NUMERIC(14,4) NOT NULL,
  unit             TEXT NOT NULL DEFAULT 'יח׳',                -- unit label (He)
  unit_price       NUMERIC(14,2) NOT NULL,
  vat_rate_kind    vat_rate_kind NOT NULL DEFAULT 'standard',
  vat_rate_pct     NUMERIC(5,2) NOT NULL DEFAULT 18.00,          -- IL 2026 rate
  line_total       NUMERIC(14,2) NOT NULL,
  received_qty     NUMERIC(14,4) NOT NULL DEFAULT 0,
  CONSTRAINT chk_pol_qty_pos CHECK (quantity > 0),
  CONSTRAINT chk_pol_received_ok CHECK (received_qty >= 0 AND received_qty <= quantity),
  UNIQUE (po_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines (po_id);

DROP TRIGGER IF EXISTS trg_po_touch ON purchase_orders;
CREATE TRIGGER trg_po_touch
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY po_read_auth ON purchase_orders
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pol_read_auth ON purchase_order_lines
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- +migrate Down
DROP TRIGGER IF EXISTS trg_po_touch ON purchase_orders;
DROP TABLE IF EXISTS purchase_order_lines;
DROP TABLE IF EXISTS purchase_orders;
