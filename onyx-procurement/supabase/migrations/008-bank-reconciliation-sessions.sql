-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 008
-- Bank Reconciliation Sessions (Agent 227) — Engine Persistence
-- ═══════════════════════════════════════════════════════════════
-- Persists the in-memory state of `src/bank/reconciliation.js` so that
-- a process restart (or fail-over) does not lose the current
-- reconciliation session, the GL snapshot, the matches, the
-- adjustments, or the per-session audit trail.
--
-- Inherits from Migration 006 (bank-reconciliation) — extends
-- `reconciliation_matches` with session-scoped columns and adds the
-- four new tables required by the engine state machine:
--     reconciliation_sessions
--     reconciliation_gl_entries
--     reconciliation_adjustments
--     reconciliation_audit
--
-- Engine never-delete rule preserved: undoMatch flips `undone=true`,
-- never DELETEs a row.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 008.1  reconciliation_sessions — engine session header
-- ─────────────────────────────────────────────────────────────
-- One row per `engine.startReconciliation()` call.  The id is the
-- `recon-<hex>` token returned by the engine; it is text, not int,
-- because the engine generates it before any DB round-trip so the
-- DB is the secondary store of record.
CREATE TABLE IF NOT EXISTS reconciliation_sessions (
  id                          TEXT PRIMARY KEY,
  bank_account_id             INTEGER NOT NULL REFERENCES bank_accounts(id),
  period_from                 DATE NOT NULL,
  period_to                   DATE NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','in_progress','completed','locked')),
  opening_balance             NUMERIC(14,2) DEFAULT 0,
  statement_closing_balance   NUMERIC(14,2) DEFAULT 0,
  matched_count               INTEGER DEFAULT 0,
  unmatched_count             INTEGER DEFAULT 0,
  suspicious_count            INTEGER DEFAULT 0,
  difference                  NUMERIC(14,2),
  is_balanced                 BOOLEAN DEFAULT FALSE,
  created_by                  TEXT,
  completed_by                TEXT,
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_from <= period_to)
);
CREATE INDEX IF NOT EXISTS idx_recon_sess_account ON reconciliation_sessions(bank_account_id, status);
CREATE INDEX IF NOT EXISTS idx_recon_sess_period  ON reconciliation_sessions(period_from, period_to);

-- ─────────────────────────────────────────────────────────────
-- 008.2  reconciliation_gl_entries — frozen GL snapshot per session
-- ─────────────────────────────────────────────────────────────
-- The engine works on a snapshot of the ledger taken at the moment
-- the session is created.  Storing the snapshot is what lets the
-- session be hydrated back into the engine after a restart —
-- without it we would have to re-derive GL rows whose underlying
-- invoices/POs have moved on (e.g. been paid or voided).
CREATE TABLE IF NOT EXISTS reconciliation_gl_entries (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id         TEXT NOT NULL,                          -- 'gl-<hex>' or 'inv-<id>'
  source_table      TEXT,                                    -- 'customer_invoices' | 'purchase_orders' | 'manual'
  source_id         TEXT,
  transaction_date  DATE,
  description       TEXT,
  reference         TEXT,
  amount            NUMERIC(14,2),
  counterparty_name TEXT,
  matched           BOOLEAN NOT NULL DEFAULT FALSE,
  match_id          INTEGER,
  raw_data          JSONB,
  UNIQUE (session_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_gl_session ON reconciliation_gl_entries(session_id, matched);

-- ─────────────────────────────────────────────────────────────
-- 008.3  Extend reconciliation_matches with session linkage
-- ─────────────────────────────────────────────────────────────
-- The engine produces group/split matches (multiple bank or GL ids
-- behind a single match), so we add JSONB id-arrays alongside the
-- existing scalar `bank_transaction_id`/`target_*` columns to keep
-- backwards compatibility with legacy rows.
ALTER TABLE reconciliation_matches
  ADD COLUMN IF NOT EXISTS session_id      TEXT REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pass            TEXT,
  ADD COLUMN IF NOT EXISTS bank_entry_ids  JSONB,
  ADD COLUMN IF NOT EXISTS gl_entry_ids    JSONB,
  ADD COLUMN IF NOT EXISTS label_he        TEXT,
  ADD COLUMN IF NOT EXISTS label_en        TEXT,
  ADD COLUMN IF NOT EXISTS suspicious      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS undone          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS undone_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engine_id       TEXT;

-- The legacy UNIQUE (bank_transaction_id, target_type, target_id)
-- blocks engine group/split matches because one bank entry can map
-- to many GL ids.  We replace it with a session-scoped uniqueness
-- for new rows and a partial index that preserves the legacy
-- guarantee for rows without a session_id (older bank-routes paths).
ALTER TABLE reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_bank_transaction_id_target_type_target_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_match_legacy
  ON reconciliation_matches (bank_transaction_id, target_type, target_id)
  WHERE session_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_match_engine
  ON reconciliation_matches (session_id, engine_id)
  WHERE session_id IS NOT NULL AND engine_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recon_match_session ON reconciliation_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_recon_match_undone  ON reconciliation_matches(session_id, undone);

-- ─────────────────────────────────────────────────────────────
-- 008.4  reconciliation_adjustments — bank fees, interest, FX
-- ─────────────────────────────────────────────────────────────
-- Target of `engine.addAdjustment()`.  Tied to a session and
-- optionally to the bank entry that triggered it.
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id       TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('BANK_FEE','INTEREST','INTEREST_EXPENSE','FX_DIFF','ERROR','OTHER')),
  amount          NUMERIC(14,2) NOT NULL,
  adjustment_date DATE NOT NULL,
  description     TEXT,
  label_he        TEXT,
  label_en        TEXT,
  bank_entry_id   BIGINT REFERENCES bank_transactions(id),
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_adj_session ON reconciliation_adjustments(session_id);
CREATE INDEX IF NOT EXISTS idx_recon_adj_kind    ON reconciliation_adjustments(kind);

-- ─────────────────────────────────────────────────────────────
-- 008.5  reconciliation_audit — engine s.audit array, append-only
-- ─────────────────────────────────────────────────────────────
-- Mirrors the in-memory audit log per session.  Append-only, never
-- updated.  Cascade on session drop is intentional — the audit is
-- a session-local log, not a global ledger (the global ledger is
-- the existing `audit_log` table populated by `audit()`).
CREATE TABLE IF NOT EXISTS reconciliation_audit (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id   TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  action      TEXT NOT NULL,
  label_en    TEXT,
  label_he    TEXT,
  details     JSONB,
  UNIQUE (session_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_audit_session ON reconciliation_audit(session_id, ts);

-- ─────────────────────────────────────────────────────────────
-- 008.6  v_reconciliation_status — rollup view for /sessions
-- ─────────────────────────────────────────────────────────────
-- Used by `GET /api/finance/reconciliation/sessions` so the route
-- doesn't have to fan-out per-session aggregate queries.
CREATE OR REPLACE VIEW v_reconciliation_status AS
SELECT
  s.id,
  s.bank_account_id,
  ba.account_name,
  ba.bank_name,
  s.period_from,
  s.period_to,
  s.status,
  s.matched_count,
  s.unmatched_count,
  s.suspicious_count,
  s.opening_balance,
  s.statement_closing_balance,
  s.difference,
  s.is_balanced,
  s.completed_by,
  s.completed_at,
  s.created_at,
  (SELECT COUNT(*) FROM reconciliation_matches m
     WHERE m.session_id = s.id AND NOT COALESCE(m.undone, FALSE)) AS active_match_count,
  (SELECT COUNT(*) FROM reconciliation_adjustments a
     WHERE a.session_id = s.id) AS adjustment_count
FROM reconciliation_sessions s
JOIN bank_accounts ba ON ba.id = s.bank_account_id;

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('008', 'bank-reconciliation-sessions', 'agent-227',
        'Session header, GL snapshot, adjustments, audit; matches extended with session_id/engine_id.')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;
