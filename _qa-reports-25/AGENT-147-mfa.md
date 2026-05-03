# AGENT-147 — 2FA / MFA Audit

**Agent:** 147
**Date:** 2026-04-29
**Owner:** kobi.ellkayam@technokoluzi.com — Techno-Kol Uzi ERP 2026
**Scope:** TOTP setup, backup codes, recovery, role enforcement, session management
**Reference:** `_qa-reports/AG-96-totp-2fa.md` (RFC-6238 zero-dep core, 64/64 passing)
**Method:** Static review of runtime code paths

---

## 1. Executive Summary

The system has TWO independent TOTP implementations co-existing:

| # | Path | Lines | Used By | Tests |
|---|------|------:|---------|-------|
| A | `onyx-procurement/src/auth/totp.js` | 430 | onyx-procurement back-end (Agent 96 module) | 64/64 |
| B | `api-server/src/lib/mfa.ts` + `mfa-verify.ts` | ~250 | erp-app via `/api/mfa/*` REST | None visible |

Implementation **A** is RFC-6238 verified, scrypt-hashed backup codes, constant-time compare. Implementation **B** (the one wired to the React UI in `erp-app/src/pages/settings/sections/mfa-settings.tsx`) is a re-write that **regresses on every security property the QA-96 report claimed**: backup codes stored in plaintext JSON, no constant-time compare, the action-level enforcement function is exported but never called by any middleware, and the per-user "is MFA required" check is read-only telemetry — nothing actually blocks login.

Status: **PARTIAL — UI complete, schema complete, enforcement gap CRITICAL.**

---

## 2. Inventory / What Exists

### 2.1 Database schema (lib-client/db/src/schema/security.ts + users.ts)

Confirmed tables:
- `user_mfa` — id, userId, method (totp|email), totpSecret, totpVerified, emailVerified, **backupCodes (jsonb default [])**, isEnabled, enabledAt, lastUsedAt
- `mfa_challenges` — id, userId, token, code, method, purpose, isUsed, expiresAt
- `role_mfa_requirements` — roleId, requireMfa (bool), **requireMfaForActions (jsonb)**
- `user_sessions` — id, userId, token, ipAddress, userAgent, fingerprint, deviceName, location, isActive, **isMfaVerified (bool, default false)**, expiresAt, absoluteExpiresAt, lastActivityAt

### 2.2 API surface (`api-server/src/routes/mfa.ts`)

| Verb | Path | Auth | Purpose |
|------|------|------|---------|
| GET  | `/mfa/status`            | Bearer | enabled, method, backupCodesCount, isRequired |
| POST | `/mfa/totp/setup`        | Bearer | new secret + otpauth URI + qrData |
| POST | `/mfa/totp/verify`       | Bearer | enable + return backup codes |
| POST | `/mfa/disable`           | Bearer | requires current MFA code |
| POST | `/mfa/email/send`        | Bearer | nodemailer email OTP, 10-min expiry |
| POST | `/mfa/verify`            | Bearer | login-time challenge verify |
| GET  | `/mfa/admin/requirements`| superAdmin | role-level policy table |
| PUT  | `/mfa/admin/requirements/:roleId` | superAdmin | toggle requireMfa + actions[] |

### 2.3 Front-end (erp-app/src/pages/settings/sections/mfa-settings.tsx)

Wizard `status → setup → verify → backup` with QR rendered via `api.qrserver.com`, manual-secret reveal/copy, backup-code grid + clipboard, disable-with-code confirmation, admin grid for per-role MFA toggle and 5 sensitive actions (delete_records, change_permissions, financial_approvals, export_data, manage_users).

### 2.4 Session UI (erp-app/.../session-management.tsx)

Self + admin views, shows MFA badge per session (`isMfaVerified`), revoke single, revoke-all-for-user, configurable idleTimeout / absoluteTimeout / concurrentLimit / fingerprintEnabled. Backed by `/api/sessions/admin/*` and `/api/sessions/config`.

---

## 3. Findings — Severity Ranked

### CRITICAL

**C-01. `isMfaRequiredForAction` is dead code.**
The function is exported from `api-server/src/lib/mfa.ts:186` and re-exported via `routes/mfa.ts` import list, but a project-wide grep for callers returns **zero hits** outside the export site. No middleware reads `requireMfaForActions[]` before `/api/users/delete`, `/api/permissions/*`, `/api/finance/approve`, `/api/exports/*`. Admin can flip the toggles in the UI; the flag is persisted; nothing enforces it. RBAC (Agent 97) and audit-trail UI (Agent 98) do not gate on MFA.

**C-02. Backup codes stored in plaintext.**
`api-server/src/lib/mfa.ts:97-99` generates `crypto.randomBytes(4).toString("hex")` and writes the array directly into `userMfaTable.backupCodes` (jsonb). Verification (`mfa.ts:157`) is `(mfa.backupCodes as string[]).includes(code)` — not constant-time, and a DB read leaks every recovery code. The QA-96 reference module (`onyx-procurement/src/auth/totp.js`) ships scrypt + `timingSafeEqual` — it is simply not imported by api-server.

**C-03. MFA login enforcement is missing.**
`/mfa/status` returns `isRequired: true` for users whose role mandates MFA, but nothing in the login pipeline rejects a session for a user who has `isRequired=true` and `isEnabled=false`. `validateSession` checks the bearer token; it does not consult `roleMfaRequirementsTable`. A user with admin role and `requireMfa=true` can still hold a fully-privileged session with `isMfaVerified=false`. The UI shows a yellow warning banner — that is the entire enforcement.

### HIGH

**H-01. Two divergent TOTP libraries.**
`onyx-procurement/src/auth/totp.js` (Agent 96) and `api-server/src/lib/mfa.ts` (later rewrite) implement Base32 + HMAC differently. The api-server version uses a 32-bit counter shift (`mfa.ts:53-55`) which **truncates above 2^32 seconds** (~year 2106), versus the QA-96 module that handles 64-bit counters via `BigInt`. Not exploitable now, but it means the documented RFC-vector test suite does not cover the code path that actually serves users.

**H-02. `userMfaTable` schema vs runtime mismatch.**
Schema (`security.ts:9`) declares `totpSecret`, but `mfa.ts:104` writes to a column named `secret` (`set({ secret, method, ...})`). Either drizzle migrations have renamed the column at runtime or this is broken in production — needs verification against `supabase/migrations/`. `mfa.ts:96, 104, 117, 154, 219, 234` all use `mfa.secret`.

**H-03. Email-OTP brute force surface.**
`/mfa/email/send` issues `crypto.randomInt(100000, 999999)` (6 digits, 10-minute window) and `/mfa/verify` does an unbounded lookup `where(userId AND code)` with no per-user retry counter, no incremental backoff, and no lockout. 1 in 900,000 per attempt; 600 seconds × any rate-limit gap = trivial brute force unless an external rate limiter sits in front.

**H-04. Backup code is single-use only on email-method path.**
`mfa.ts:158-159` filters the matching code out of the array on TOTP path. Good. But `verifyMFA` (the legacy alias at `mfa.ts:224`) is also exported and does the same — duplication invites drift. There is no audit log row written when a backup code burns.

### MEDIUM

**M-01. SMTP transport is silent on failure.**
`routes/mfa.ts:160-162` — `try { ... } catch (emailErr) { console.warn(...) }` then returns 200 to the client. The user sees "code sent" even when the mail server rejected. Should bubble up.

**M-02. QR code rendered via third-party `api.qrserver.com`.**
`mfa-settings.tsx:48` posts the otpauth URI (containing the secret) to an external endpoint. The secret leaks in the GET URL. Use a local QR generator (`qrcode` npm or inline SVG via the existing zero-dep stack).

**M-03. `lastUsedAt` never written.**
Schema has the column; no code path updates it. `routes/mfa.ts:50` returns `mfa?.lastUsedAt || null` — always null.

**M-04. SuperAdmin-only role-MFA admin endpoints.**
`/mfa/admin/requirements` is gated by `(user as any).isSuperAdmin`. There is no role-based "security admin" — a workspace owner cannot delegate. Consistent with current RBAC, flagged for the security-model review.

**M-05. Session idle/absolute timeout enforcement not in this file.**
`/sessions/config` stores `session_idle_timeout_minutes` etc. in `platformSettingsTable`, but the active expiry check inside `validateSession` was not located in this audit — there is risk that the values are read-only configuration with no enforcer. **Action:** confirm `api-server/src/lib/auth.ts` consumes them.

**M-06. `mfa.backup.ts` shadow file in `api-server/scripts/`.**
A `guard-mfa.sh` cron-style script copies `src/lib/mfa.ts` to `scripts/mfa.backup.ts` on each run and restores from it on corruption. Both copies are kept in git, **and the backup file currently contains different code** (lines 173, 186, 273, 287 in the techno-uzi merge variant). Symptom of repeated history rewrites; backup file should be `.gitignore`d or deleted.

### LOW

**L-01.** Backup codes are 8 hex chars (~32 bits). QA-96 module uses 10 Crockford chars (~50 bits). Acceptable but inconsistent with the documented spec.
**L-02.** No "regenerate backup codes" button in UI — once consumed, user must disable + re-enroll.
**L-03.** No "MFA enrolment grace period" — admin flips `requireMfa=true` and the next /mfa/status call returns isRequired=true with no banner timeline.
**L-04.** `disableMfa` requires a current TOTP code (good) but accepts `code: ""` and short-circuits to error 400 — fine, but the same endpoint should require the user to confirm with their **password**, not just the moving 30-second token.

---

## 4. Coverage Matrix vs Task Brief

| Brief item | Status | Evidence |
|---|---|---|
| TOTP setup | DONE | `routes/mfa.ts:61-81`, UI wizard, otpauth URI |
| Backup codes generation | DONE (with C-02 caveat) | `mfa.ts:97-99`, displayed once in UI `mfa-settings.tsx:347-385` |
| Backup codes verification | PARTIAL | works, but plaintext storage + non-constant-time |
| Recovery (email OTP) | DONE | `/mfa/email/send`, `/mfa/verify` |
| Enforcement per role | UI ONLY | toggles persist, no middleware reads them — see C-01, C-03 |
| Session management | DONE | revoke, list, config — see M-05 |

---

## 5. Recommendations (Priority Order)

1. **Replace api-server TOTP with onyx-procurement Agent-96 module.** Single import, drops C-02 + H-01 immediately. The module is zero-dep and already in the repo.
2. **Add `requireMfaMiddleware(action)` express middleware** that joins `roleAssignmentsTable → roleMfaRequirementsTable`, reads `requireMfaForActions`, and rejects with 403 + `mfa_required` code if the current `userSessionsTable.isMfaVerified === false`. Wire it into the 5 sensitive-action route groups before merging C-01.
3. **Login-flow gate.** In `validateSession`, if user's role requires MFA and `isMfaVerified=false` on the bound session, return `{ error: "mfa_setup_required" }` and force the UI through the enrolment wizard before any other API call resolves.
4. **Replace `api.qrserver.com`** with a local QR generator (M-02).
5. **Rate-limit `/mfa/verify` and `/mfa/email/send`** at 5/min/user with exponential backoff. Use the existing `rate-limit.js` middleware.
6. **Schema-runtime reconciliation** (H-02): pick `totpSecret` or `secret`, write a migration, update both producer and consumer.
7. **Audit log:** emit `mfa.enabled`, `mfa.disabled`, `mfa.backup_used`, `mfa.failed` events into the audit-trail subsystem (Agent 98).
8. **Remove `mfa.backup.ts` shadow file** + delete `guard-mfa.sh` from CI; rely on git as the source of truth.

---

## 6. Sign-off

- 64/64 RFC-6238 tests pass for the **dormant** `onyx-procurement/src/auth/totp.js` module.
- The **active** `api-server` MFA stack has 4 critical/high gaps blocking production: enforcement, plaintext backup codes, schema mismatch, and counter truncation.
- UI is feature-complete. Backend is not.

**Verdict: NOT production-ready as a security control. Useful as opt-in user setting only until C-01/C-02/C-03 are closed.**

Agent 147 closes.
