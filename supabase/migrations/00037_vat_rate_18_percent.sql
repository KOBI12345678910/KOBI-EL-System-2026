-- =========================================================================
-- 00037_vat_rate_18_percent.sql
--
-- Israeli VAT rate transition: 17% -> 18%, effective 2026-01-01.
--
-- This migration:
--   * Updates DEFAULT values on current-period VAT rate columns (0.17 -> 0.18).
--   * Inserts (or updates) the active VAT rate row in finance.vat_rates so the
--     current period points to 18% from 2026-01-01 forward.
--   * Inserts (or updates) the tax/system config rows (vat_default, etc.) that
--     drive the app-wide default.
--   * DOES NOT touch any existing invoice / tax_invoice / transaction row.
--     Historical invoices MUST retain the rate they were issued under.
--
-- Idempotent. Safe to re-run. All operations are guarded by IF EXISTS /
-- ON CONFLICT so running this on a fresh DB (tables not present) won't fail.
--
-- Legal basis: תיקון חוק מע"מ 2026, תוקף 01/01/2026.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1.  finance.vat_rates — history table (onyx-procurement migration 003)
--     Add / upsert the 2026-01-01 row at 18%.
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.vat_rates') IS NOT NULL THEN
    INSERT INTO public.vat_rates (rate, effective_from, description, legal_basis)
    VALUES (0.1800, DATE '2026-01-01',
            'VAT 18% — rate increase effective 1 Jan 2026',
            'תיקון חוק מע"מ 2026')
    ON CONFLICT (effective_from) DO UPDATE
      SET rate         = EXCLUDED.rate,
          description  = EXCLUDED.description,
          legal_basis  = EXCLUDED.legal_basis;

    -- Close out the prior (17%) period, if previously open-ended.
    UPDATE public.vat_rates
       SET effective_to = DATE '2025-12-31'
     WHERE effective_from = DATE '2015-10-01'
       AND (effective_to IS NULL OR effective_to > DATE '2025-12-31');
  END IF;
END$$;

-- Same table in finance schema if present.
DO $$
BEGIN
  IF to_regclass('finance.vat_rates') IS NOT NULL THEN
    INSERT INTO finance.vat_rates (rate, effective_from, description, legal_basis)
    VALUES (0.1800, DATE '2026-01-01',
            'VAT 18% — rate increase effective 1 Jan 2026',
            'תיקון חוק מע"מ 2026')
    ON CONFLICT (effective_from) DO UPDATE
      SET rate         = EXCLUDED.rate,
          description  = EXCLUDED.description,
          legal_basis  = EXCLUDED.legal_basis;
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- 2.  Update DEFAULT on current-period VAT-rate columns.
--     These ALTERs only affect rows inserted AFTER this migration;
--     existing rows are NOT rewritten.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'vat_rate'
      AND column_default IS NOT NULL
      AND column_default LIKE '%0.17%'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT 0.18',
      r.table_schema, r.table_name, r.column_name
    );
  END LOOP;
END$$;

-- -------------------------------------------------------------------------
-- 3.  finance.tax_records / system config — insert a new effective-dated
--     row (do NOT overwrite historical rows).
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('finance.tax_records') IS NOT NULL THEN
    INSERT INTO finance.tax_records (
      tax_type, rate, effective_from, effective_to, description, created_at
    )
    VALUES (
      'VAT_STANDARD', 0.1800, DATE '2026-01-01', NULL,
      'Israeli VAT standard rate 18% — effective 2026-01-01', NOW()
    )
    ON CONFLICT DO NOTHING;

    UPDATE finance.tax_records
       SET effective_to = DATE '2025-12-31'
     WHERE tax_type = 'VAT_STANDARD'
       AND rate     = 0.1700
       AND (effective_to IS NULL OR effective_to > DATE '2025-12-31');
  END IF;
END$$;

-- App-level config table (techno-kol-ops: config_entries).
DO $$
BEGIN
  IF to_regclass('public.config_entries') IS NOT NULL THEN
    INSERT INTO public.config_entries (key, value, updated_at)
    VALUES ('vat_default', '0.18', NOW())
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = NOW();

    INSERT INTO public.config_entries (key, value, updated_at)
    VALUES ('vat_effective_from', '2026-01-01', NOW())
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = NOW();
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- 4.  Documenting comment so DBAs/auditors see the policy on schema intro.
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.vat_rates') IS NOT NULL THEN
    COMMENT ON TABLE public.vat_rates IS
      'Historical VAT rates with effective dates. Current rate 18% from 2026-01-01; prior 17% 2015-10-01..2025-12-31. Do NOT mutate historical rows — see migration 00037.';
  END IF;
END$$;

COMMIT;

-- -------------------------------------------------------------------------
-- POST-CONDITIONS (assert via supabase/postgres client if desired):
--   * SELECT rate FROM public.vat_rates WHERE effective_from='2026-01-01'
--       → 0.1800
--   * column defaults for vat_rate are 0.18 wherever they previously were 0.17
--   * historical invoice rows are untouched
-- -------------------------------------------------------------------------
