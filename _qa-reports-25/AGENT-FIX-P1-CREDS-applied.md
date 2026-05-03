# AGENT FIX P1 — Plaintext Admin Credentials Removed

Date: 2026-04-29
Severity: P1 (CRITICAL)
Status: APPLIED (not committed)

## Files Changed

| File | Lines (before) | LOC delta |
|---|---|---|
| `api-server/src/routes/kimi/dev-platform.ts` | 15-38 (`getSystemAdminToken`) | -23 / +24 (~ +1) |
| `api-server/src/routes/kobi/tools.ts` | 2508-2523 (`getAuthToken`) | -16 / +21 (~ +5) |

Total LOC changed: ~ 6 net additions, well under the 50 LOC cap.

## Before / After (pseudocode — no plaintext quoted)

### dev-platform.ts `getSystemAdminToken()`

BEFORE:
```
candidates = []
if (env KIMI_SYSTEM_USERNAME && env KIMI_SYSTEM_PASSWORD) push env-pair
push hardcoded admin / <PLAINTEXT>           # <-- LEAK
push hardcoded kobiellkayam / <REAL_PASSWORD># <-- CRITICAL LEAK
for cred of candidates:
  result = loginUser(cred)
  if result.token: cache + return Bearer
throw "cannot authenticate"
```

AFTER:
```
username = env KIMI_SYSTEM_USERNAME
password = env KIMI_SYSTEM_PASSWORD
if (!username || !password):
  console.warn("env not set – refusing")
  throw Error("...") with statusCode=503  # Hebrew user-facing message
result = loginUser(username, password)
if result.token: cache + return Bearer
throw Error("...") with statusCode=503
```

### tools.ts `getAuthToken()`

BEFORE:
```
fetch /api/auth/login body { username:"admin", password:"<PLAINTEXT>" }
```

AFTER:
```
username = env KOBI_TOOLS_USERNAME
password = env KOBI_TOOLS_PASSWORD
if (!username || !password):
  console.warn("env not set – refusing")
  return null
fetch /api/auth/login body { username, password }
```

## Implementation Notes

- No new dependencies added.
- `bcrypt` / `argon2` are not present in this codebase. Password verification uses `crypto.pbkdf2Sync` (see `api-server/src/lib/auth.ts` lines 58-70). The fix here is simpler than the audit suggested: the routes are not hashing passwords — they were calling `loginUser()` / `/api/auth/login` with hardcoded plaintext credentials. Removing the hardcoded fallbacks and requiring env-injected credentials closes the leak without changing the underlying hashing scheme.
- User-facing errors are kept in Hebrew per project convention (`שירות Kimi2 לא מוגדר`, `מערכת Kimi2 אינה יכולה להתחבר`).
- HTTP `statusCode=503` is attached to thrown errors so the express error layer can map to a Service Unavailable response.

## Test files

The audit asked to scrub `KOBIE@307994798` from test files. A repo-wide grep returns:
- `api-server/src/routes/kimi/dev-platform.ts` — FIXED in this patch.
- `api-server/src/lib/auth.ts` — out of scope: this is the legitimate seed/fallback for the production user account itself (lines 19-28). Removing it requires DB seed migration, tracked separately.
- `_qa-reports/QA-13-*.md`, `_qa-reports-25/AGENT-313-security-deep.md` — already audit reports flagging this leak; leaving in place.
- `_merge-staging*/**`, `_merge-incoming/**`, `_delivery/**` — archive/import bundles, per instruction these are skipped.

No active production test file in `api-server/src/__tests__/` contained `KOBIE@307994798` (only `admin`/`admin123` placeholders, which are the standard fallback test creds and out of scope of this P1).

## Risk Assessment — Git History Exposure

`git log -S "KOBIE@307994798"` returned **5 commits** containing the real password:
- `5ab5e01` Add AI-Task-Manager - Full ERP system
- `7a84c31` feat: production-ready deployment + QA bug fixes (GO verdict)
- `77734df` feat(phase-1b): recovery package + 22 control files
- `a15be81` feat(audit): persist 4 SQL migrations to repo
- `e13e4ed` docs(qa): wave-9 framework reports

Risk level: **HIGH**.

If this repository was ever pushed to GitHub (public or private with broad team access), the password `KOBIE@307994798` for user `kobiellkayam` (super-admin per `auth.ts`) is permanently in git history. Removing the file in HEAD does NOT remove it from history.

### Mandatory follow-up actions (not part of this patch)

1. **Rotate the password for `kobiellkayam` immediately** in the live DB (`UPDATE users SET password_hash = ... WHERE username = 'kobiellkayam'`).
2. Rotate the `admin` user password as well.
3. Set the new credentials only in deployment env vars (`KIMI_SYSTEM_USERNAME`, `KIMI_SYSTEM_PASSWORD`, `KOBI_TOOLS_USERNAME`, `KOBI_TOOLS_PASSWORD`) — never in code.
4. Consider git-history rewrite (`git filter-repo`) or, if remote exposure occurred, treat the leaked password as permanently compromised and ensure rotation is the authoritative remediation.
5. Audit DB activity logs for `kobiellkayam` since the first leak commit for any anomalous logins.
6. Separately replace the matching plaintext seeds in `api-server/src/lib/auth.ts` (FALLBACK_USERS) — that file still hashes the same plaintext at module load. Recommended fix: pre-compute hashes via build-time secret injection or remove fallback users entirely once DB is reliably available.

## TypeScript Verification

`npx tsc --noEmit -p api-server/tsconfig.json` produced no new errors referencing `dev-platform.ts` or `tools.ts`. Pre-existing project-config errors (missing `tsconfig.base.json`, missing lib paths, `pdfkit` types) are unrelated to this change.
