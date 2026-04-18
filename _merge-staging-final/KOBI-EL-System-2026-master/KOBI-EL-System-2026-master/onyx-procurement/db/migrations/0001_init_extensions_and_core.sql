-- Migration : 0001_init_extensions_and_core.sql
-- Original  : init extensions and core types — יסודות + טיפוסי הליבה
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים
--             (we do not delete — we only upgrade and grow)
--
-- Installs the Supabase-standard extensions the ERP relies on, and creates
-- the enumerated types that subsequent migrations reference. Safe to
-- re-run (everything is IF NOT EXISTS).
--
-- Money convention: NUMERIC(14,2)
--   * max magnitude ≈ 999,999,999,999.99 ILS (≈ 1 trillion)
--   * exact 2-decimal arithmetic, no IEEE-754 drift
--   * matches the `amount` columns the legacy server.js already stores

-- +migrate Up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid() + crypt()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4 (legacy)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- fuzzy supplier name search
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive emails
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- Hebrew + Latin search

DO $$ BEGIN
  CREATE TYPE currency_code AS ENUM ('ILS','USD','EUR','GBP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM (
    'draft','pending','approved','rejected','sent','received','cancelled','paid','overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE supplier_kind AS ENUM ('company','contractor','freelancer','government','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vat_rate_kind AS ENUM ('standard','zero','exempt','reduced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- +migrate Down
DROP TYPE IF EXISTS vat_rate_kind;
DROP TYPE IF EXISTS supplier_kind;
DROP TYPE IF EXISTS doc_status;
DROP TYPE IF EXISTS currency_code;
-- Extensions are intentionally NOT dropped — other schemas may rely on them.
