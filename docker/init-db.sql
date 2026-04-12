-- ═══════════════════════════════════════════════════════════════════════════
-- ERP 2026 — Initial database bootstrap
-- Runs on first container start (postgres/docker-entrypoint-initdb.d)
-- ═══════════════════════════════════════════════════════════════════════════
-- This script:
--   1. Enables required extensions
--   2. Creates per-service schemas (isolated logical domains)
--   3. Creates per-service roles and grants
-- The techno-kol-ops schema.sql is mounted as 02-schema.sql and will run
-- after this file thanks to the ordering prefix.
-- ═══════════════════════════════════════════════════════════════════════════

\echo '==> ERP 2026 init-db.sql starting...'

-- ─── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─── Logical schemas per service ───────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS procurement;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS payroll;
CREATE SCHEMA IF NOT EXISTS audit;

COMMENT ON SCHEMA procurement IS 'ONYX procurement service — purchase orders, suppliers, inventory';
COMMENT ON SCHEMA ops         IS 'Techno-Kol OPS — production, projects, scheduling, realtime';
COMMENT ON SCHEMA ai          IS 'ONYX AI — agent memory, event store, knowledge graph';
COMMENT ON SCHEMA payroll     IS 'Payroll autonomous engine — employees, slips, Israeli tax';
COMMENT ON SCHEMA audit       IS 'Cross-service audit trail';

-- ─── Application roles (login users) ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'onyx_procurement_app') THEN
    CREATE ROLE onyx_procurement_app LOGIN PASSWORD 'onyx_procurement_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'techno_kol_ops_app') THEN
    CREATE ROLE techno_kol_ops_app LOGIN PASSWORD 'techno_kol_ops_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'onyx_ai_app') THEN
    CREATE ROLE onyx_ai_app LOGIN PASSWORD 'onyx_ai_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payroll_app') THEN
    CREATE ROLE payroll_app LOGIN PASSWORD 'payroll_dev';
  END IF;
END
$$;

-- ─── Grants ────────────────────────────────────────────────────────────────
GRANT USAGE, CREATE ON SCHEMA procurement TO onyx_procurement_app;
GRANT USAGE, CREATE ON SCHEMA ops         TO techno_kol_ops_app;
GRANT USAGE, CREATE ON SCHEMA ai          TO onyx_ai_app;
GRANT USAGE, CREATE ON SCHEMA payroll     TO payroll_app;

GRANT USAGE ON SCHEMA audit TO onyx_procurement_app, techno_kol_ops_app, onyx_ai_app, payroll_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA procurement
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onyx_procurement_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO techno_kol_ops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onyx_ai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA payroll
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO payroll_app;

-- ─── Cross-service audit table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.event_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service     TEXT NOT NULL,
  actor       TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  payload     JSONB,
  request_id  TEXT
);
CREATE INDEX IF NOT EXISTS event_log_ts_idx       ON audit.event_log (ts DESC);
CREATE INDEX IF NOT EXISTS event_log_service_idx  ON audit.event_log (service, ts DESC);
CREATE INDEX IF NOT EXISTS event_log_entity_idx   ON audit.event_log (entity_type, entity_id);

GRANT INSERT, SELECT ON audit.event_log TO
  onyx_procurement_app, techno_kol_ops_app, onyx_ai_app, payroll_app;
GRANT USAGE, SELECT ON SEQUENCE audit.event_log_id_seq TO
  onyx_procurement_app, techno_kol_ops_app, onyx_ai_app, payroll_app;

\echo '==> ERP 2026 init-db.sql done.'
