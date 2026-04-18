-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 000 (BOOTSTRAP)
-- Wave 1.5 — B-14 fix companion
-- ═══════════════════════════════════════════════════════════════
-- This migration MUST run first. It provisions the two primitives
-- that scripts/migrate.js depends on:
--
--   1) public.pg_execute(sql TEXT)  — RPC the runner calls to
--      dispatch arbitrary DDL through the PostgREST channel.
--      Supabase does NOT ship this function by default, so the
--      runner would otherwise fail with:
--         "Could not find the function public.pg_execute(sql)"
--
--   2) public.schema_migrations     — tracking table the runner
--      queries to decide which files are pending. Migration 003
--      also creates this table (idempotent), but we create it
--      here too so the runner can query it BEFORE 003 exists.
--
-- SECURITY MODEL
--   - pg_execute is SECURITY DEFINER: it runs with the privileges
--     of the function owner (typically `postgres`), letting the
--     `service_role` caller execute DDL without being a superuser.
--   - EXECUTE is REVOKED from PUBLIC and granted only to
--     `service_role`. The `anon` and `authenticated` roles CANNOT
--     call this — the runner must use the service-role key.
--   - search_path is pinned to `public, pg_temp` to prevent
--     search-path hijacking attacks against SECURITY DEFINER
--     functions (CVE-class issue flagged by Supabase linter).
--
-- Idempotency: every statement is CREATE OR REPLACE / IF NOT EXISTS.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PART A: schema_migrations tracking table
-- ─────────────────────────────────────────────────────────────
-- Kept in sync with the columns created by migration 003.
-- Creating it here lets the runner issue SELECT against it on
-- the very first run without hitting "relation does not exist".

CREATE TABLE IF NOT EXISTS public.schema_migrations (
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
  ON public.schema_migrations (applied_at DESC);

COMMENT ON TABLE public.schema_migrations IS
  'Tracks applied DB migrations. Bootstrapped by 000; also defined idempotently by 003.';

-- Record the bootstrap itself as applied (self-tracking).
INSERT INTO public.schema_migrations (version, name, notes)
VALUES ('000', 'bootstrap-pg-execute', 'Provisions pg_execute RPC and schema_migrations table')
ON CONFLICT (version) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PART B: pg_execute RPC
-- ─────────────────────────────────────────────────────────────
-- The runner invokes this via: supabase.rpc('pg_execute', {sql})
-- Returns VOID — callers rely on the absence of an error to
-- indicate success. Any SQL error propagates back through
-- PostgREST as an RPC error with the PostgreSQL message intact.

CREATE OR REPLACE FUNCTION public.pg_execute(sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

COMMENT ON FUNCTION public.pg_execute(TEXT) IS
  'Service-role DDL dispatcher for scripts/migrate.js. SECURITY DEFINER — callable only by service_role.';

-- ─────────────────────────────────────────────────────────────
-- PART C: Lock down the function
-- ─────────────────────────────────────────────────────────────
-- Order matters:
--   1. REVOKE from PUBLIC (which includes anon/authenticated by default)
--   2. GRANT EXECUTE to service_role
--
-- Result: only the Supabase service-role JWT can call pg_execute.
-- Anonymous and signed-in users will get a 403.

REVOKE ALL ON FUNCTION public.pg_execute(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pg_execute(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pg_execute(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.pg_execute(TEXT) TO service_role;

COMMIT;
