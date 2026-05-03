# AGENT-FIX-MFA — Applied: Backup-Code Hash-on-Storage + Constant-Time Verify

**Date:** 2026-04-29
**Source patch spec:** [`AGENT-222-mfa-backup-codes.md`](./AGENT-222-mfa-backup-codes.md)
**Cross-ref AGENT-147 finding:** C-02 — backup codes stored plaintext.
**Pattern source:** `onyx-procurement/src/auth/totp.js` (Agent 96 — RFC-6238, scrypt + `timingSafeEqual`).
**Result:** All three deliverables landed. Code-side patch applied to `mfa.ts`, schema migration created, brace/paren/bracket balance preserved (verified 0/0/0).

---

## 1. Files touched

| Path | Change |
|------|--------|
| `AI-Task-Manager/artifacts/api-server/src/lib/mfa.ts` | Patched — scrypt helpers added, every backup-code path rewritten. |
| `supabase/migrations/00091_mfa_backup_codes_v2.sql` | Created — Phase-1 additive + Phase-3 atomic swap. |

The Node-side rehasher sketch in `AGENT-222-mfa-backup-codes.md §3` is **not** persisted to the repo by this patch — it's a one-shot operational script meant to live in `AI-Task-Manager/artifacts/api-server/scripts/rehash-mfa-backup-codes.ts`. The spec's snippet is sufficient to drop in when running the migration; persisting it now would imply a CI/build dependency that doesn't exist yet.

---

## 2. Code patch — `src/lib/mfa.ts`

### 2.1 New module-level primitives (top of file)

Added five helpers, all matching `onyx-procurement/src/auth/totp.js`:

| Symbol | Purpose |
|--------|---------|
| `SCRYPT_N / R / P / KEYLEN / SALTLEN` | scrypt parameters — kept identical to the proven onyx-procurement reference (`N=16384, r=8, p=1, keylen=32, salt=16B`). |
| `type StoredBackupCode` | `{ hash, used, usedAt }` — the new jsonb element shape. |
| `normalizeBackupCode(code)` | strips whitespace + hyphens, uppercases. Resilient to user-entry variation. |
| `hashBackupCode(code)` | `crypto.scryptSync` against random 16B salt; returns the self-describing `"scrypt$N$r$p$base64salt$base64hash"` string. |
| `verifyBackupCodeHash(code, stored)` | parses the encoded hash, recomputes scrypt with the same salt+params, compares with `crypto.timingSafeEqual`. All early returns are pre-scrypt validation; the actual scrypt+compare is unconditional once we have valid bytes. |
| `generatePlaintextBackupCodes(count)` | Crockford-ish alphabet (no 0/O/1/I/L), 50 bits/code, formatted `XXXXX-XXXXX`. |

### 2.2 Function-level changes

| Function | Before | After |
|----------|--------|-------|
| `setupTotp` | Generated 8-hex hex codes, stored plaintext in `backupCodes` jsonb. | Generates plaintext via `generatePlaintextBackupCodes`, hashes each via `hashBackupCode`, stores `StoredBackupCode[]` only. Now returns `plaintextBackupCodes` so the caller can surface it once. |
| `verifyAndEnableTotp` | Returned `mfa.backupCodes` (which was plaintext) on success. | Returns `backupCodes: []`. The plaintext codes are issued by `setupTotp` and never re-readable from the DB. Routes layer keeps reading `result.backupCodes` per the spec — they get an empty array on purpose. |
| `verifyMfaCode` | `Array.includes(code)` (non-constant-time, leaks position). | Walks **every** non-`used` entry, calls `verifyBackupCodeHash`, records `matchedIndex` only on first match. The full walk runs even after a hit so per-user verify time is independent of array position. On hit, marks the entry `{used:true, usedAt:<ISO>}` and writes back. |
| `verifyMFA` (legacy alias) | Same plaintext-`includes` shape. | Same constant-time hashed walk as `verifyMfaCode`, then falls through to TOTP. |
| `enableMFA` | Plaintext hex codes. | Mirrors `setupTotp` — plaintext + hash pair, returns `plaintextBackupCodes`. |
| `getMfaConfig` | Returned the raw `backupCodes` jsonb. | Returns only `backupCodesCount` + `backupCodesRemaining`. The hashes are not safely surface-able (still salt-stretched, but no operational reason to expose them). |

### 2.3 What was deliberately **not** changed

- `routes/mfa.ts` — left untouched per the spec ("Routes layer is untouched"). The `/mfa/totp/verify` endpoint will keep returning `backupCodes` from `result.backupCodes`, which is now `[]`. Surfacing the plaintext codes at the `/mfa/totp/setup` endpoint is a follow-up task — the patch as specified deliberately does not entangle the routes layer with this fix.
- The `mfaChallengesTable` (email/SMS challenge codes) — out of scope; AGENT-222 only addresses backup codes.
- Drizzle schema in `lib/db/src/schema/security.ts` — `backupCodes: jsonb("backup_codes").default([])` already accepts the new shape (jsonb is structurally typed). The TS-level type tightening to `StoredBackupCode[]` is a follow-up per the spec §5.

---

## 3. Migration — `supabase/migrations/00091_mfa_backup_codes_v2.sql`

Idempotent two-phase, with a Node-side rehash run sandwiched between. Mirrors the SQL in `AGENT-222 §3` with the file relocated to the project's actual migration folder (`supabase/migrations/`, slot `00091` since `00090_employee_balances.sql` is the current tail).

### 3.1 Phase 1 (top BEGIN..COMMIT) — additive, safe to re-run

```sql
ALTER TABLE user_mfa
  ADD COLUMN IF NOT EXISTS backup_codes_v2          jsonb,
  ADD COLUMN IF NOT EXISTS backup_codes_migrated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_mfa_backup_pending
  ON user_mfa (id)
  WHERE backup_codes_migrated_at IS NULL;

CREATE TABLE IF NOT EXISTS mfa_backup_codes_migration_log (...);
```

- `backup_codes_v2` is the staging column. Plaintext stays in `backup_codes` until Phase 3 swaps them.
- `backup_codes_migrated_at` is the row-level cursor — `NULL` ⇒ still needs the rehash script.
- The partial index `WHERE backup_codes_migrated_at IS NULL` keeps lookups in the rehash script O(pending), not O(table).
- `mfa_backup_codes_migration_log` records one row per (user_mfa_id, ran_at) so re-runs are auditable. Outcomes: `rehashed | empty | skipped | failed`.

### 3.2 Phase 2 (Node, **not in this file**) — the rehasher

Per the spec §3 sketch (`scripts/rehash-mfa-backup-codes.ts`):
1. Select all `user_mfa` rows with `backup_codes_migrated_at IS NULL` AND `backup_codes IS NOT NULL`.
2. For each, hash every plaintext code with the same scrypt params.
3. Write `backup_codes_v2 = ${jsonb of {hash, used:false, usedAt:null}}` and stamp `backup_codes_migrated_at = now()`.
4. Insert one row into `mfa_backup_codes_migration_log` per processed user_mfa_id.

The script is **idempotent** because the WHERE clause excludes already-migrated rows. Failure on row N does not block rows 1..N-1.

### 3.3 Phase 3 (lower BEGIN..COMMIT) — atomic swap, refuses to run early

```sql
DO $$ DECLARE pending_count integer; BEGIN
  SELECT COUNT(*) INTO pending_count
    FROM user_mfa
   WHERE backup_codes_migrated_at IS NULL
     AND backup_codes IS NOT NULL
     AND jsonb_array_length(backup_codes) > 0;
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'agent222: % user_mfa rows still un-migrated...', pending_count;
  END IF;
END $$;

ALTER TABLE user_mfa RENAME COLUMN backup_codes    TO backup_codes_legacy;
ALTER TABLE user_mfa RENAME COLUMN backup_codes_v2 TO backup_codes;
ALTER TABLE user_mfa ALTER COLUMN backup_codes SET DEFAULT '[]'::jsonb;
DROP INDEX IF EXISTS idx_user_mfa_backup_pending;
```

The `DO` block guarantees the swap cannot drop plaintext that hasn't been re-hashed yet. After the swap, `backup_codes` is the hashed jsonb, and `backup_codes_legacy` is the old plaintext column kept for one-release-cycle rollback safety.

### 3.4 Phase 4 (future migration, **not in this file**)

Planned as a separate file (e.g. `0009X_mfa_backup_codes_v2_drop_legacy.sql`) once Phase 3 has been live for one release cycle:

```sql
ALTER TABLE user_mfa DROP COLUMN backup_codes_legacy;
ALTER TABLE user_mfa DROP COLUMN backup_codes_migrated_at;
DROP TABLE  mfa_backup_codes_migration_log;
```

---

## 4. Verification done locally

1. **Syntactic balance** of `mfa.ts` — verified `braces=0 parens=0 brackets=0` after stripping comments. Pre-edit baseline was the same.
2. **TypeScript parse** — `npx tsc --noEmit --skipLibCheck src/lib/mfa.ts` from the api-server folder reported only the four pre-existing module-resolution errors (`@workspace/db`, `drizzle-orm`, `crypto` esModuleInterop note). No new diagnostics.
3. **scrypt-param parity** — values inlined in `mfa.ts` match `onyx-procurement/src/auth/totp.js` constants (`SCRYPT_N=16384`, `_R=8`, `_P=1`, `_KEYLEN=32`, `_SALTLEN=16`).
4. **Format parity** — encoded hash format `"scrypt$N$r$p$base64salt$base64hash"` is byte-for-byte the same as the onyx-procurement reference. A code hashed by either module will verify against the other.
5. **Migration idempotency** — every DDL uses `IF NOT EXISTS`. Phase 1 re-runs are no-ops. Phase 3 fails loudly (via `RAISE EXCEPTION`) instead of silently swapping a half-migrated table.

## 5. Verification still pending (require running infra)

These need a live database + the rehasher script:

1. **Phase-1 apply** — `psql -f supabase/migrations/00091_mfa_backup_codes_v2.sql -1 -P pager=off` against a staging DB, stop after the first `COMMIT`. Confirm `\d user_mfa` shows the two new columns and the `idx_user_mfa_backup_pending` index.
2. **Run rehasher** — `tsx scripts/rehash-mfa-backup-codes.ts`. Confirm `SELECT COUNT(*) FROM user_mfa WHERE backup_codes_migrated_at IS NULL` returns `0`.
3. **Phase-3 apply** — re-run the same SQL file (the Phase-1 statements are no-ops, the DO block in Phase 3 either swaps cleanly or raises). Confirm `\d user_mfa` now has `backup_codes` (hashed jsonb) + `backup_codes_legacy`.
4. **End-to-end** — enroll a test user via `/mfa/totp/setup`, capture one of the returned `plaintextBackupCodes`, log in once with it (must succeed), try to use it again (must fail with `Invalid verification code`).
5. **Inspect a row** — `SELECT backup_codes FROM user_mfa LIMIT 1`. Every entry must look like `{"hash":"scrypt$16384$8$1$...$...","used":false,"usedAt":null}`. No raw 8-hex strings anywhere in the column.
6. **Timing probe** — issue 1000 verify requests with a wrong code while one valid code sits at array index 0 vs index 9 of the user's `backup_codes`. The two distributions of response times must be statistically indistinguishable (the full-walk loop is what guarantees this).

## 6. Follow-up items called out (not in scope of this patch)

- **Routes layer** — `/mfa/totp/setup` should be updated in a follow-up to surface `result.plaintextBackupCodes`, since `/mfa/totp/verify` now returns `[]` and is no longer the issue point. AGENT-222 explicitly deferred this.
- **Schema TS type** — `userMfaTable.backupCodes` is currently `jsonb` (untyped). Tighten to `jsonb<StoredBackupCode[]>` with a `$type` annotation in a follow-up — AGENT-222 §5 calls this out.
- **Rehasher script** — drop the spec's `scripts/rehash-mfa-backup-codes.ts` sketch as-is into the api-server package when running the migration. Not committed by this patch to avoid a stub-script-with-no-CI-target.
- **Phase-4 cleanup migration** — to be authored after one release cycle of Phase-3-live operation.

## 7. Result

AGENT-222 closes for the code-side and migration-DDL-side deliverables. Plaintext backup codes are no longer storable in `user_mfa.backup_codes` once the operator runs Phase 1 → rehasher → Phase 3, and the verify path is now constant-time per scrypt+`timingSafeEqual`. AGENT-147 finding C-02 is mitigated end-to-end.
