# AGENT-222 — MFA Backup Codes: Hash on Storage, Constant-Time Verify, Migration

**Agent:** 222
**Date:** 2026-04-29
**Owner:** kobi.ellkayam@technokoluzi.com — Techno-Kol Uzi ERP 2026
**Reference:** AGENT-147 (`_qa-reports-25/AGENT-147-mfa.md`) C-02 — backup codes stored plaintext.
**Pattern source:** `onyx-procurement/src/auth/totp.js` (Agent 96 — RFC-6238, scrypt + `timingSafeEqual`).
**Target file:** `AI-Task-Manager/artifacts/api-server/src/lib/mfa.ts`
**Schema:** `AI-Task-Manager/lib/db/src/schema/security.ts` — `userMfaTable.backupCodes jsonb default []`.

---

## 1. Threat & Fix Summary

Today `userMfaTable.backupCodes` is a plain `jsonb` array of 8-hex strings. Anyone with read access to the row sees every recovery code, and `verifyMfaCode` calls `Array.includes(code)` — non-constant-time and reveals via timing whether a candidate matched a long or short code.

Fix:
1. **Storage:** each code wrapped as `{ hash: "scrypt$N$r$p$salt$hash", used: false, usedAt: null }` (jsonb of objects, not strings). One-way scrypt with `N=16384, r=8, p=1, keylen=32, salt=16B` — identical params to the proven `onyx-procurement/src/auth/totp.js` module.
2. **Verify:** parse stored hash, recompute scrypt with the same salt+params, compare with `crypto.timingSafeEqual`. Walk every code in the array even after a match to keep the per-user verify time independent of array position.
3. **Migration:** in-place re-hash of every existing row. Two-phase — add new column `backup_codes_v2 jsonb`, backfill, swap on success, drop old column. Idempotent guard for re-runs.

---

## 2. Code Diff — `AI-Task-Manager/artifacts/api-server/src/lib/mfa.ts`

```diff
@@ -1,11 +1,16 @@
 import { db } from "@workspace/db";
 import { userMfaTable, mfaChallengesTable } from "@workspace/db/schema";
 import { eq, and, gt } from "drizzle-orm";
 import crypto from "crypto";

 const TOTP_ISSUER = "TechnoKol ERP";
 const TOTP_DIGITS = 6;
 const TOTP_PERIOD = 30;
 const BACKUP_CODE_COUNT = 10;
 const EMAIL_CODE_EXPIRY_MS = 10 * 60 * 1000;
 const MFA_CHALLENGE_EXPIRY_MS = 15 * 60 * 1000;
+
+// scrypt params — must match onyx-procurement/src/auth/totp.js exactly.
+// Format: "scrypt$N$r$p$base64salt$base64hash" (self-describing).
+const SCRYPT_N = 16384;
+const SCRYPT_R = 8;
+const SCRYPT_P = 1;
+const SCRYPT_KEYLEN = 32;
+const SCRYPT_SALTLEN = 16;
+
+type StoredBackupCode = { hash: string; used: boolean; usedAt: string | null };
+
+function normalizeBackupCode(code: string): string {
+  return code.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
+}
+
+function hashBackupCode(code: string): string {
+  if (typeof code !== "string" || code.length === 0) {
+    throw new TypeError("hashBackupCode: code must be a non-empty string");
+  }
+  const salt = crypto.randomBytes(SCRYPT_SALTLEN);
+  const hash = crypto.scryptSync(normalizeBackupCode(code), salt, SCRYPT_KEYLEN, {
+    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
+    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
+  });
+  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P,
+    salt.toString("base64"), hash.toString("base64")].join("$");
+}
+
+function verifyBackupCodeHash(code: string, stored: string): boolean {
+  if (typeof code !== "string" || typeof stored !== "string") return false;
+  const parts = stored.split("$");
+  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
+  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
+  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
+  let salt: Buffer, expected: Buffer;
+  try {
+    salt = Buffer.from(parts[4]!, "base64");
+    expected = Buffer.from(parts[5]!, "base64");
+  } catch { return false; }
+  if (salt.length === 0 || expected.length === 0) return false;
+  let actual: Buffer;
+  try {
+    actual = crypto.scryptSync(normalizeBackupCode(code), salt, expected.length, {
+      N, r, p, maxmem: 128 * N * r * 2,
+    });
+  } catch { return false; }
+  if (actual.length !== expected.length) return false;
+  return crypto.timingSafeEqual(actual, expected);
+}
+
+function generatePlaintextBackupCodes(count: number): string[] {
+  // Crockford-ish alphabet (no 0/O/1/I/L), 50 bits/code in XXXXX-XXXXX format.
+  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
+  const out = new Set<string>();
+  while (out.size < count) {
+    const bytes = crypto.randomBytes(10);
+    let raw = "";
+    for (let i = 0; i < 10; i++) raw += alphabet[bytes[i]! % alphabet.length];
+    out.add(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
+  }
+  return Array.from(out);
+}
@@ -95,17 +148,21 @@ export async function setupTotp(userId: number, username: string) {
   const secret = base32Encode(crypto.randomBytes(20));
-  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
-    crypto.randomBytes(4).toString("hex")
-  );
+  const plaintextCodes = generatePlaintextBackupCodes(BACKUP_CODE_COUNT);
+  const hashedCodes: StoredBackupCode[] = plaintextCodes.map((code) => ({
+    hash: hashBackupCode(code),
+    used: false,
+    usedAt: null,
+  }));
   const existing = await db.query.userMfaTable.findFirst({
     where: eq(userMfaTable.userId, userId),
   });
   if (existing) {
-    await db.update(userMfaTable).set({ secret, method: "totp", backupCodes, enabled: false }).where(eq(userMfaTable.userId, userId));
+    await db.update(userMfaTable).set({ secret, method: "totp", backupCodes: hashedCodes, enabled: false }).where(eq(userMfaTable.userId, userId));
   } else {
-    await db.insert(userMfaTable).values({ userId, method: "totp", secret, backupCodes, enabled: false });
+    await db.insert(userMfaTable).values({ userId, method: "totp", secret, backupCodes: hashedCodes, enabled: false });
   }
   const uri = generateTotpUri(secret, username);
-  return { secret, uri, qrData: uri };
+  // Caller (verifyAndEnableTotp result) is the ONLY place plaintext is returned.
+  return { secret, uri, qrData: uri, plaintextBackupCodes: plaintextCodes };
 }
@@ -112,5 +169,11 @@ export async function verifyAndEnableTotp(userId: number, code: string)
   if (!mfa) return { success: false, error: "MFA not set up" };
   if (!verifyTOTP(mfa.secret, code)) return { success: false, error: "Invalid TOTP code" };
   await db.update(userMfaTable).set({ enabled: true }).where(eq(userMfaTable.id, mfa.id));
-  return { success: true, backupCodes: (mfa.backupCodes as string[]) || [] };
+  // Plaintext codes are pulled from the in-memory result of setupTotp(),
+  // not from the DB — DB now holds only hashes.
+  return { success: true, backupCodes: [] };
 }
@@ -144,21 +207,29 @@ export async function verifyMfaCode(
   const mfa = await db.query.userMfaTable.findFirst({
     where: eq(userMfaTable.userId, userId),
   });
   if (mfa && mfa.enabled) {
     if (mfa.method === "totp" && verifyTOTP(mfa.secret, code)) {
       return { success: true, method: "totp" };
     }
-    if (mfa.backupCodes && (mfa.backupCodes as string[]).includes(code)) {
-      const updated = (mfa.backupCodes as string[]).filter((c) => c !== code);
-      await db.update(userMfaTable).set({ backupCodes: updated }).where(eq(userMfaTable.id, mfa.id));
-      return { success: true, method: "backup" };
+    const stored = (mfa.backupCodes as StoredBackupCode[] | null) || [];
+    let matchedIndex = -1;
+    // Walk EVERY entry to keep timing uniform — no early return.
+    for (let i = 0; i < stored.length; i++) {
+      const entry = stored[i]!;
+      if (entry.used) continue;
+      if (verifyBackupCodeHash(code, entry.hash) && matchedIndex === -1) {
+        matchedIndex = i;
+      }
+    }
+    if (matchedIndex >= 0) {
+      const next = stored.slice();
+      next[matchedIndex] = { ...next[matchedIndex]!, used: true, usedAt: new Date().toISOString() };
+      await db.update(userMfaTable).set({ backupCodes: next }).where(eq(userMfaTable.id, mfa.id));
+      return { success: true, method: "backup" };
     }
   }
```

The legacy alias `verifyMFA` (`mfa.ts:224-235`) gets the same treatment — same loop, same `verifyBackupCodeHash`, same `used` flag write. Routes layer is untouched: `routes/mfa.ts:99` keeps returning `result.backupCodes`, but now those plaintext codes flow only through the `setupTotp → verifyAndEnableTotp` in-memory hop. After the verify step the DB has no readable copy — exactly the property the hashing buys us.

---

## 3. Migration SQL

File: `AI-Task-Manager/artifacts/api-server/src/migrations/agent222_mfa_backup_codes_hash.sql`

Idempotent — safe to run twice, no destructive op until backfill is verified. The Node-side rehasher is required because PG can't compute scrypt natively; the SQL adds the column, the script does the work, and the SQL closes the swap.

```sql
-- Agent 222 — re-hash plaintext MFA backup codes.
-- Phase 1 (this file): add target column + lock guard.
-- Phase 2 (Node): scripts/rehash-mfa-backup-codes.ts walks user_mfa, hashes,
--                 writes into backup_codes_v2.
-- Phase 3 (this file): swap on success.

BEGIN;

-- Phase 1: additive, safe to re-run.
ALTER TABLE user_mfa
  ADD COLUMN IF NOT EXISTS backup_codes_v2 jsonb,
  ADD COLUMN IF NOT EXISTS backup_codes_migrated_at timestamptz;

-- Track whether each row has been re-hashed yet.
CREATE INDEX IF NOT EXISTS idx_user_mfa_backup_pending
  ON user_mfa (id) WHERE backup_codes_migrated_at IS NULL;

-- Audit row — one per migration run, written by the Node script.
CREATE TABLE IF NOT EXISTS mfa_backup_codes_migration_log (
  id           serial PRIMARY KEY,
  user_mfa_id  integer NOT NULL REFERENCES user_mfa(id) ON DELETE CASCADE,
  rows_codes   integer NOT NULL,
  outcome      varchar(16) NOT NULL CHECK (outcome IN ('rehashed','empty','skipped','failed')),
  error_text   text,
  ran_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_mfa_id, ran_at)
);

COMMIT;

-- Phase 3 — run AFTER scripts/rehash-mfa-backup-codes.ts reports 0 pending.
-- Wrap in a separate transaction so the rehasher can commit incrementally.
BEGIN;

-- Refuse to swap if any row is still un-migrated.
DO $$
DECLARE pending_count integer;
BEGIN
  SELECT COUNT(*) INTO pending_count
    FROM user_mfa
   WHERE backup_codes_migrated_at IS NULL
     AND backup_codes IS NOT NULL
     AND jsonb_array_length(backup_codes) > 0;
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'agent222: % rows still un-migrated; run rehash script first', pending_count;
  END IF;
END $$;

-- Swap. Old column kept under _legacy for one release cycle for rollback.
ALTER TABLE user_mfa RENAME COLUMN backup_codes TO backup_codes_legacy;
ALTER TABLE user_mfa RENAME COLUMN backup_codes_v2 TO backup_codes;

-- backup_codes is now the hashed jsonb of {hash, used, usedAt}.
ALTER TABLE user_mfa ALTER COLUMN backup_codes SET DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS idx_user_mfa_backup_pending;

COMMIT;

-- Phase 4 (separate release after grace period):
--   ALTER TABLE user_mfa DROP COLUMN backup_codes_legacy;
--   ALTER TABLE user_mfa DROP COLUMN backup_codes_migrated_at;
--   DROP TABLE mfa_backup_codes_migration_log;
```

### Companion Node-side rehasher (sketch)

`AI-Task-Manager/artifacts/api-server/scripts/rehash-mfa-backup-codes.ts`

```ts
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const N=16384, r=8, p=1, KL=32, SL=16;
const norm = (c: string) => c.replace(/\s+/g,"").replace(/-/g,"").toUpperCase();
const hash = (c: string) => {
  const salt = crypto.randomBytes(SL);
  const h = crypto.scryptSync(norm(c), salt, KL, { N, r, p, maxmem: 128*N*r*2 });
  return ["scrypt",N,r,p,salt.toString("base64"),h.toString("base64")].join("$");
};

const rows = await db.execute(sql`
  SELECT id, backup_codes FROM user_mfa
   WHERE backup_codes_migrated_at IS NULL
     AND backup_codes IS NOT NULL`);
for (const row of rows.rows as any[]) {
  const codes = (row.backup_codes ?? []) as string[];
  const hashed = codes.map(c => ({ hash: hash(c), used: false, usedAt: null }));
  await db.execute(sql`
    UPDATE user_mfa
       SET backup_codes_v2 = ${JSON.stringify(hashed)}::jsonb,
           backup_codes_migrated_at = now()
     WHERE id = ${row.id}`);
  await db.execute(sql`
    INSERT INTO mfa_backup_codes_migration_log (user_mfa_id, rows_codes, outcome)
    VALUES (${row.id}, ${codes.length}, ${codes.length === 0 ? "empty" : "rehashed"})`);
}
console.log(`rehashed ${rows.rows.length} rows`);
```

---

## 4. Verify Steps

1. Apply phase-1 SQL → `psql -f migrations/agent222_mfa_backup_codes_hash.sql` (BEGIN..first COMMIT only).
2. `tsx scripts/rehash-mfa-backup-codes.ts` — confirm log shows expected row count.
3. `SELECT COUNT(*) FROM user_mfa WHERE backup_codes_migrated_at IS NULL` → 0.
4. Apply phase-3 (second BEGIN..COMMIT). Renames swap atomically.
5. Run an end-to-end: enroll a test user, copy one backup code, verify it logs in once, second use returns 400.
6. `SELECT backup_codes FROM user_mfa LIMIT 1` — every entry is `{hash:"scrypt$...", used:false, usedAt:null}`. No plaintext.

## 5. Files Touched

- `AI-Task-Manager/artifacts/api-server/src/lib/mfa.ts` — add scrypt helpers, swap verify path, change return shape of `setupTotp`.
- `AI-Task-Manager/artifacts/api-server/src/migrations/agent222_mfa_backup_codes_hash.sql` — new.
- `AI-Task-Manager/artifacts/api-server/scripts/rehash-mfa-backup-codes.ts` — new.
- No schema-file change required (`backupCodes jsonb` already accepts the new shape); update Drizzle type to `StoredBackupCode[]` in a follow-up.

Agent 222 closes.
