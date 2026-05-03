-- ════════════════════════════════════════════════════════════════════════
--  Migration 00084 — Persist auto-detector anomalies
--  Agent 224
--
--  Background: AG-100 wrote `detectAnomalies()` (10 statistical detectors)
--  and shipped 34/34 green tests. AG-182 audited the engine and found that
--  it was unwired — not called from csv-import or multi-format-parser, and
--  not persisted anywhere. The payment-anomalies UI screen subscribed to
--  SSE events from a *different* producer (legacy SQL-based runAnomaly-
--  Detection in finance-enterprise.ts).
--
--  Agent 224 closes the loop:
--    1. csv-import.js   → calls anomaly-bridge.detectAndPersist after import
--    2. bank-routes.js  → calls the same bridge after parseStatement()
--    3. SSE             → emits `payment_anomaly_new` / `_critical`
--    4. UI              → existing payment-anomalies.tsx already subscribes
--
--  This migration ensures the table can hold the new fields the bridge
--  writes (detector_type, severity_score, confidence, source, dedupe_hash,
--  metric jsonb) and adds a unique index on dedupe_hash so re-imports are
--  idempotent.
--
--  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_anomalies (
  id              SERIAL PRIMARY KEY,
  anomaly_type    VARCHAR(100) NOT NULL,
  severity        VARCHAR(20)  NOT NULL DEFAULT 'warning',
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  supplier_name   VARCHAR(255),
  supplier_id     INTEGER,
  amount          NUMERIC(15,2) DEFAULT 0,
  reference_amount NUMERIC(15,2),
  payment_date    DATE,
  payment_id      INTEGER,
  payment_ref     VARCHAR(100),
  recommendation  TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'open',
  resolved_by     VARCHAR(255),
  resolved_at     TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── Agent 224 additive columns (backfill-safe) ─────────────────────────
ALTER TABLE payment_anomalies
  ADD COLUMN IF NOT EXISTS detector_type   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS severity_score  NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence      NUMERIC(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source          VARCHAR(40)  DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS dedupe_hash     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS metric          JSONB;

-- ─── Indexes ───────────────────────────────────────────────────────────
-- Idempotency: same detector record + same tx must not re-insert.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_anomalies_dedupe_hash
  ON payment_anomalies (dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;

-- Hot read path: open + critical-first ordering used by the UI screen.
CREATE INDEX IF NOT EXISTS idx_payment_anomalies_status_severity
  ON payment_anomalies (status, severity, created_at DESC);

-- Filter by detector source (legacy SQL-rules vs auto-detector).
CREATE INDEX IF NOT EXISTS idx_payment_anomalies_source
  ON payment_anomalies (source);

-- Filter by detector_type for AG-100 vs AG-X comparisons.
CREATE INDEX IF NOT EXISTS idx_payment_anomalies_detector_type
  ON payment_anomalies (detector_type);

-- Touch updated_at on row update (no-op if already present).
CREATE OR REPLACE FUNCTION touch_payment_anomalies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_anomalies_updated_at ON payment_anomalies;
CREATE TRIGGER trg_payment_anomalies_updated_at
  BEFORE UPDATE ON payment_anomalies
  FOR EACH ROW
  EXECUTE FUNCTION touch_payment_anomalies_updated_at();

COMMENT ON TABLE  payment_anomalies               IS 'AG-100 detector + legacy SQL-rule anomalies. Wired by Agent 224.';
COMMENT ON COLUMN payment_anomalies.detector_type IS 'Raw detector tag (zscore | iqr | duplicate | ...).';
COMMENT ON COLUMN payment_anomalies.severity_score IS '1..10 from detectAnomalies(); maps to severity bucket.';
COMMENT ON COLUMN payment_anomalies.dedupe_hash    IS 'djb2(detector_type|tx_id|amount|date) — idempotency key.';
COMMENT ON COLUMN payment_anomalies.metric         IS 'Raw detector metric blob (z, chi, gap-days, etc.).';
