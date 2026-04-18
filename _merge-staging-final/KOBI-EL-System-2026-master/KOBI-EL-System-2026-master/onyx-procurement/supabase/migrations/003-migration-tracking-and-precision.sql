-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 003
-- Wave 1.5 fixes: B-14 (migration tracking) + F-05 (money precision)
-- ═══════════════════════════════════════════════════════════════
-- Idempotent: safe to re-run. Each block is CREATE IF NOT EXISTS or ALTER.
-- Rollback: see 003-rollback.sql for reverse operations.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PART A: MIGRATION TRACKING INFRASTRUCTURE (B-14)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by    TEXT NOT NULL DEFAULT CURRENT_USER,
  checksum      TEXT,
  execution_ms  INTEGER,
  rolled_back   BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON schema_migrations(applied_at DESC);

COMMENT ON TABLE schema_migrations IS
  'Tracks applied DB migrations. One row per migration file. B-14 fix (Wave 1.5).';

-- Backfill: mark 001 and 002 as applied (they were applied pre-tracking)
INSERT INTO schema_migrations (version, name, notes)
VALUES
  ('001', 'supabase-schema', 'Backfilled by migration 003 — predates tracking'),
  ('002', 'seed-data-extended', 'Backfilled by migration 003 — predates tracking')
ON CONFLICT (version) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PART B: MONEY PRECISION — NUMERIC(14,2) (F-05)
-- ─────────────────────────────────────────────────────────────
-- All money columns must be NUMERIC(14,2), not generic NUMERIC.
-- Max ₪999,999,999,999.99 (99 billion — enough for enterprise).
-- Prior to Wave 1.5: columns were inconsistent (some INTEGER, some NUMERIC without scale).

DO $$
DECLARE
  r RECORD;
  col_exists BOOLEAN;
BEGIN
  -- supplier_products
  FOR r IN SELECT unnest(ARRAY['unit_price','minimum_order_value','average_monthly_volume']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS supplier_products ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- suppliers
  FOR r IN SELECT unnest(ARRAY['total_spent','credit_limit','average_order_value']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS suppliers ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- supplier_quotes
  FOR r IN SELECT unnest(ARRAY['subtotal','total_price','vat_amount','total_with_vat','delivery_fee']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS supplier_quotes ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- quote_line_items
  FOR r IN SELECT unnest(ARRAY['unit_price','total_price']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS quote_line_items ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- purchase_orders
  FOR r IN SELECT unnest(ARRAY['subtotal','delivery_fee','vat_amount','total','original_price','negotiated_savings']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS purchase_orders ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- po_line_items
  FOR r IN SELECT unnest(ARRAY['unit_price','total_price']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS po_line_items ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- procurement_decisions
  FOR r IN SELECT unnest(ARRAY['selected_total_cost','highest_cost','savings_amount']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS procurement_decisions ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- subcontractor_decisions
  FOR r IN SELECT unnest(ARRAY['project_value','selected_cost','alternative_cost','savings_amount']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS subcontractor_decisions ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- subcontractor_pricing
  FOR r IN SELECT unnest(ARRAY['percentage_rate','price_per_sqm','minimum_price']) AS col
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS subcontractor_pricing ALTER COLUMN %I TYPE NUMERIC(14,2) USING %I::NUMERIC(14,2)', r.col, r.col);
  END LOOP;

  -- price_history
  BEGIN
    ALTER TABLE IF EXISTS price_history ALTER COLUMN price TYPE NUMERIC(14,2) USING price::NUMERIC(14,2);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

-- ─────────────────────────────────────────────────────────────
-- PART C: NEW COLUMNS FOR WAVE 1.5 FIXES
-- ─────────────────────────────────────────────────────────────

-- B-05/B-06: Track VAT rate per transaction (17% now, future reforms)
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,4);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,4);

-- B-12: Track PO send status + error
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS last_send_error TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS send_attempt_at TIMESTAMPTZ;

-- B-13: Audit log needs covering index for frequent queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- PART D: VAT RATE HISTORY TABLE (B-09 prep)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vat_rates (
  id            SERIAL PRIMARY KEY,
  rate          NUMERIC(5,4) NOT NULL CHECK (rate >= 0 AND rate < 1),
  effective_from DATE NOT NULL,
  effective_to  DATE,
  description   TEXT,
  legal_basis   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (effective_from)
);

INSERT INTO vat_rates (rate, effective_from, description, legal_basis)
VALUES
  (0.1700, '2006-07-01', 'VAT 17% — default since 2006', 'חוק מע"מ 1975'),
  (0.1800, '2013-06-02', 'VAT 18% — temporary hike', 'תקנות מע"מ 2013'),
  (0.1700, '2015-10-01', 'VAT 17% — reduction back', 'תקנות מע"מ 2015'),
  (0.1700, '2026-01-01', 'VAT 17% — continues', 'עדכון שנתי 2026')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE vat_rates IS 'Historical VAT rates with effective dates. B-05 fix.';

-- ─────────────────────────────────────────────────────────────
-- PART E: RECORD THIS MIGRATION
-- ─────────────────────────────────────────────────────────────

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES (
  '003',
  'migration-tracking-and-precision',
  'wave1.5-b14-f05',
  'Wave 1.5 — migration tracking + NUMERIC(14,2) + vat_rates history'
)
ON CONFLICT (version) DO UPDATE
SET applied_at = NOW(),
    notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION QUERY (run after apply):
-- SELECT version, name, applied_at FROM schema_migrations ORDER BY version;
-- SELECT column_name, data_type, numeric_precision, numeric_scale
--   FROM information_schema.columns
--   WHERE table_name = 'purchase_orders' AND column_name IN ('subtotal','total','vat_amount');
-- ═══════════════════════════════════════════════════════════════
