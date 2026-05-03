-- =====================================================================
-- Migration 00091 — MFA Backup Codes v2 (Agent 222 / hash-on-storage)
-- =====================================================================
-- Source spec : _qa-reports-25/AGENT-222-mfa-backup-codes.md
-- Target file : AI-Task-Manager/artifacts/api-server/src/lib/mfa.ts
-- Pattern src : onyx-procurement/src/auth/totp.js (Agent 96, RFC-6238)
-- Date        : 2026-04-29
--
-- Purpose:
--   user_mfa.backup_codes today is a jsonb ARRAY of 8-hex plaintext strings.
--   Anyone with row-read access sees every recovery code, and the verify
--   path uses Array.includes — non-constant-time, leaks via timing.
--
--   This migration moves backup codes to a hash-on-storage shape:
--     [{ "hash": "scrypt$N$r$p$base64salt$base64hash",
--        "used": false, "usedAt": null }, ...]
--
--   PostgreSQL cannot compute scrypt natively, so this migration only
--   handles the schema-level pieces (add v2 column, audit log, swap).
--   The actual rehash happens in the Node-side companion script:
--     AI-Task-Manager/artifacts/api-server/scripts/rehash-mfa-backup-codes.ts
--
-- Rollout (3 phases — this file contains phases 1 & 3):
--   Phase 1 (this file, top BEGIN..COMMIT) : additive — add v2 column +
--           timestamp + audit table + pending-row index. Idempotent. Safe
--           to re-run.
--   Phase 2 (Node script, OUT OF THIS FILE): walk every user_mfa row,
--           hash plaintext entries, write into backup_codes_v2, stamp
--           backup_codes_migrated_at. The script is idempotent — it
--           skips rows that already have backup_codes_migrated_at set.
--   Phase 3 (this file, lower BEGIN..COMMIT): only run AFTER Phase 2
--           reports 0 pending rows. Renames backup_codes →
--           backup_codes_legacy and backup_codes_v2 → backup_codes,
--           atomically. Refuses to run if any row is still un-migrated.
--   Phase 4 (separate release, NOT in this file): drop legacy column
--           after a grace period of at least one release cycle.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Phase 1 — additive only. Safe to re-run.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE user_mfa
  ADD COLUMN IF NOT EXISTS backup_codes_v2          jsonb,
  ADD COLUMN IF NOT EXISTS backup_codes_migrated_at timestamptz;

-- Index on un-migrated rows so the rehash script can iterate efficiently.
-- WHERE clause keeps the index small (only rows that still need work).
CREATE INDEX IF NOT EXISTS idx_user_mfa_backup_pending
  ON user_mfa (id)
  WHERE backup_codes_migrated_at IS NULL;

-- Per-row audit log of the rehash run. One row per (user_mfa_id, ran_at).
-- Useful for forensics if a row fails and we need to retry just that one.
CREATE TABLE IF NOT EXISTS mfa_backup_codes_migration_log (
  id           serial      PRIMARY KEY,
  user_mfa_id  integer     NOT NULL REFERENCES user_mfa(id) ON DELETE CASCADE,
  rows_codes   integer     NOT NULL,
  outcome      varchar(16) NOT NULL CHECK (outcome IN ('rehashed','empty','skipped','failed')),
  error_text   text,
  ran_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_mfa_id, ran_at)
);

COMMENT ON COLUMN user_mfa.backup_codes_v2 IS
  'Agent 222 — hashed backup codes. Array of {hash, used, usedAt}. Replaces backup_codes after Phase 3 swap.';
COMMENT ON COLUMN user_mfa.backup_codes_migrated_at IS
  'Agent 222 — set by the rehash script when a row''s codes have been hashed into backup_codes_v2.';
COMMENT ON TABLE  mfa_backup_codes_migration_log IS
  'Agent 222 — per-row audit of the plaintext-to-scrypt rehash. Kept until Phase 4.';

COMMIT;

-- =====================================================================
-- Phase 3 — atomic swap. RUN ONLY AFTER PHASE 2 SCRIPT REPORTS 0 PENDING.
--
-- The DO block below refuses to swap if any row still has plaintext-shaped
-- backup_codes that haven't been migrated. This is the single guard that
-- keeps a half-migrated DB safe.
-- =====================================================================
BEGIN;

DO $$
DECLARE
  pending_count integer;
BEGIN
  SELECT COUNT(*)
    INTO pending_count
    FROM user_mfa
   WHERE backup_codes_migrated_at IS NULL
     AND backup_codes IS NOT NULL
     AND jsonb_array_length(backup_codes) > 0;

  IF pending_count > 0 THEN
    RAISE EXCEPTION
      'agent222: % user_mfa rows still un-migrated. Run scripts/rehash-mfa-backup-codes.ts before Phase 3.',
      pending_count;
  END IF;
END $$;

-- Atomic rename swap. After this, backup_codes is the hashed jsonb shape;
-- backup_codes_legacy holds the plaintext rows for one-release-cycle
-- rollback safety, then gets dropped in Phase 4.
ALTER TABLE user_mfa RENAME COLUMN backup_codes    TO backup_codes_legacy;
ALTER TABLE user_mfa RENAME COLUMN backup_codes_v2 TO backup_codes;

-- Re-establish the default on the now-renamed column.
ALTER TABLE user_mfa ALTER COLUMN backup_codes SET DEFAULT '[]'::jsonb;

-- Pending index no longer meaningful — drop it.
DROP INDEX IF EXISTS idx_user_mfa_backup_pending;

COMMENT ON COLUMN user_mfa.backup_codes IS
  'Agent 222 — scrypt-hashed backup codes. Format per entry: {hash:"scrypt$N$r$p$salt$hash", used:bool, usedAt:timestamptz|null}.';
COMMENT ON COLUMN user_mfa.backup_codes_legacy IS
  'Agent 222 — DEPRECATED. Plaintext codes pre-rehash. Drop in Phase 4 after one release cycle.';

COMMIT;

-- =====================================================================
-- Phase 4 (separate future migration, e.g. 0009X_mfa_backup_codes_v2_drop_legacy.sql):
--   ALTER TABLE user_mfa DROP COLUMN backup_codes_legacy;
--   ALTER TABLE user_mfa DROP COLUMN backup_codes_migrated_at;
--   DROP TABLE  mfa_backup_codes_migration_log;
-- =====================================================================
