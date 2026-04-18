-- Migration : 0002_suppliers_and_contacts.sql
-- Original  : suppliers and contacts — ספקים + אנשי קשר
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים
--
-- The suppliers table is the root of procurement. Every PO, invoice, and
-- payment eventually joins back here. Columns match the legacy JSON shape
-- in scripts/seed-data.js so existing Supabase rows map cleanly.

-- +migrate Up
CREATE TABLE IF NOT EXISTS suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,          -- short operator-facing code
  name_he          TEXT NOT NULL,                 -- שם ספק
  name_en          TEXT,                          -- display name (English)
  kind             supplier_kind NOT NULL DEFAULT 'company',
  vat_id           TEXT UNIQUE,                   -- מספר עוסק מורשה (9 digits)
  tax_exempt       BOOLEAN NOT NULL DEFAULT false,
  bank_account     TEXT,                          -- IBAN or local 3-part
  currency         currency_code NOT NULL DEFAULT 'ILS',
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  credit_limit     NUMERIC(14,2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active   ON suppliers (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trg ON suppliers USING gin (name_he gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_vat      ON suppliers (vat_id) WHERE vat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  role         TEXT,
  email        CITEXT,
  phone        TEXT,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_supplier ON supplier_contacts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email    ON supplier_contacts (email) WHERE email IS NOT NULL;

-- trigger to keep updated_at honest
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_touch ON suppliers;
CREATE TRIGGER trg_suppliers_touch
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Supabase RLS scaffold — every authenticated user can read; only service
-- role can write. Application-level RBAC tightens this further.
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY suppliers_read_auth ON suppliers
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY contacts_read_auth ON supplier_contacts
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- +migrate Down
DROP TRIGGER IF EXISTS trg_suppliers_touch ON suppliers;
DROP TABLE IF EXISTS supplier_contacts;
DROP TABLE IF EXISTS suppliers;
-- touch_updated_at() is NOT dropped — later migrations reuse it.
