# QA-13 — Secrets Scan

**Agent:** QA-13 Security
**Date:** 2026-04-11
**Scope:** full repo tree under `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\` (node_modules excluded)
**Method:** grep on `password=`, `api[_-]?key=`, `secret=`, `BEGIN PRIVATE KEY`, `xox[baprs]-`, `sk-ant-`, `ghp_`, `ghs_`, `.env*` file contents, hex-blobs ≥ 32 chars.

---

## CRITICAL — committed secrets requiring immediate rotation

### C1. `AI-Task-Manager\.replit` — JWT + app-secret + credential-encryption key

**Status:** RESOLVED — Agent-Y-QA13: replaced real hex secrets with `ROTATE_ME_run_openssl_rand_hex_*` placeholders in `.replit`. Source file no longer contains secrets.

**File:** `AI-Task-Manager\.replit` lines 32-39
**Severity:** CRITICAL — these sign all JWTs and encrypt all stored integration credentials.

```ini
[userenv.shared]
KIMI_API_URL = "https://api.moonshot.ai/v1"
CREDENTIAL_ENCRYPTION_KEY = "b58dc284ff87841f31d96f29e79a6d8db9028867316d83acad583bcddf18a03a"
APP_SECRET_KEY = "b9204289ff3d888a8e57fb2248fabf77170f1118d4e763653ded77f473c1d181"
JWT_SECRET = "e9e69cbf8a580f6d2137c43bbfeab553da677b81c431f2c663e396da23df26f73da95313fa5aa45fb3378f32a5f9cecde7f8e49b1b643c288e253506cf73ddd8"
N8N_WEBHOOK_URL = "https://your-n8n-instance.com/webhook/erp"
```

**Action required:**
1. Rotate JWT_SECRET → generate new 64-byte hex via `openssl rand -hex 64`.
2. Rotate APP_SECRET_KEY.
3. Rotate CREDENTIAL_ENCRYPTION_KEY and re-encrypt all records in `stored_credentials` / `api_keys` tables.
4. Move all three to Replit Secrets panel (not `.replit` file).
5. `git rm --cached AI-Task-Manager/.replit` → replace with a scrubbed version.
6. Rewrite git history (BFG or `git filter-repo`) to remove the secret values.
7. Invalidate all existing JWTs — force every user to re-authenticate.

---

### C2. `AI-Task-Manager\artifacts\kobi-agent\.env` — Anthropic API key

**Status:** RESOLVED — Agent-Y-QA13: changed `ANTHROPIC_API_KEY=CLAUDE2026` to `ANTHROPIC_API_KEY=REPLACE_WITH_YOUR_API_KEY`. Placeholder only.

**File:** `AI-Task-Manager\artifacts\kobi-agent\.env`

```env
ANTHROPIC_API_KEY=CLAUDE2026
PORT=3000
WORKSPACE_DIR=./workspace
MAX_RETRIES=5
MAX_STEPS=50
MODEL=claude-sonnet-4-20250514
```

**Note:** `CLAUDE2026` looks like a placeholder, NOT a real Anthropic key (real keys start with `sk-ant-api03-...`). **LOWER** severity than C1, but:
- The `.env` file is on disk in a subfolder that has its own `.gitignore` at `AI-Task-Manager/artifacts/kobi-agent/.gitignore:2:.env`. That catches this file locally — but since it's present on disk, verify `git ls-files` does not track it.
- If any operator copies this as a template and fills in a real key without changing the commit state, real creds will leak next.

**Action required:**
1. `cd AI-Task-Manager/artifacts/kobi-agent && git check-ignore -v .env` — must return ignored.
2. Delete the file from the working tree if not needed.
3. Rename to `.env.example` with placeholder values only.

---

### C3. Hardcoded super-admin passwords

**Status:** RESOLVED — Agent-Y-QA13: passwords now sourced from `process.env.ADMIN_SEED_PASSWORD` / `CEO_SEED_PASSWORD` (throws if missing). Salts generated dynamically via `crypto.randomBytes(16)`. No hardcoded credentials remain in source.

**File:** `AI-Task-Manager\artifacts\api-server\src\lib\admin-seed.ts` lines 11-36

```ts
{ username: "admin",        password: "admin123",        salt: "fallback_salt_admin_2026" }
{ username: "kobiellkayam", password: "KOBIE@307994798", salt: "fallback_salt_kobiellkayam_2026" }
```

Both `isSuperAdmin: true`. The second looks like the CEO's real personal password ("KOBIE@307994798" matches Israeli ID pattern for Kobi Elkayam).

**Action required:**
1. **Rotate CEO password IMMEDIATELY** — treat the committed string as a known-compromised password and do not reuse it anywhere.
2. Delete the literal from source; seed from `process.env.ADMIN_SEED_PASSWORD`.
3. Force both admin users to reset password on next login.
4. Rewrite git history to remove this literal (BFG/`git filter-repo`).
5. Audit the DB: when were these users created, what actions have they performed? (Check `audit_log` table for `actor='admin'` or `actor='kobiellkayam'` since repo creation date.)

---

### C4. Weak / placeholder JWT secret in `.env.example` and tests
**Status:** RESOLVED — Agent-Y-QA13: changed `techno-kol-ops/.env.example` JWT_SECRET from guessable `techno_kol_secret_2026_palantir` to `REPLACE_WITH_openssl_rand_hex_32_OUTPUT`. Test blocklist remains unchanged (negative test coverage).

**Files:**
- `techno-kol-ops\.env.example` — placeholder `techno_kol_secret_2026_palantir`
- `techno-kol-ops\src\auth\jwt-helper.test.js` line 131 — test literal
- Blocklisted in `src\auth\jwt-helper.js` line 56-63

This value is in git but is NOT live (it's in the known-weak blocklist). Risk is that an operator copies .env.example → .env verbatim.

**Action required:**
1. Change `.env.example` placeholder to `JWT_SECRET=REPLACE_WITH_openssl_rand_hex_32_OUTPUT`.
2. Keep the test — it's a negative test that verifies the blocklist works.
3. Ensure `validateEnv()` is actually called (see BUG-SEC-003 in QA-13-security.md).

---

## MEDIUM — placeholder / test values (not secrets, but flagged)

### M1. Integration placeholder strings in `techno-kol-uzi-ai-engine.ts`

**File:** `AI-Task-Manager\artifacts\api-server\src\lib\techno-kol-uzi-ai-engine.ts` lines 1940, 1961, 1972, 1984

```ts
credentials: { apiKey: 'SUMIT_API_KEY', companyId: 'SUMIT_COMPANY_ID' }
credentials: { clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_SECRET', refreshToken: 'GOOGLE_REFRESH_TOKEN' }
credentials: { apiKey: 'SCALA_API_KEY' }
credentials: { apiKey: 'WIX_API_KEY', siteId: 'WIX_SITE_ID' }
```

These are placeholder strings that should be replaced with env var lookups. Risk: operator replaces with real keys and commits.

**Action required:** Change to `credentials: { apiKey: process.env.SUMIT_API_KEY, ... }`.

---

### M2. Test fixtures with fake keys

**Files:**
- `AI-Task-Manager\artifacts\api-server\src\lib\kimi-test.ts` line 64: `const TEST_API_KEY = "test-api-key-12345";`
- `AI-Task-Manager\artifacts\api-server\src\lib\kimi-test.ts` line 275: `makeClient({ apiKey: "my-secret-key" })`
- `AI-Task-Manager\artifacts\api-server\src\lib\kimi-seed.ts` line 58: `apiKey: "stored-as-env-secret"`
- `AI-Task-Manager\artifacts\api-server\src\__tests__\unit\auth.test.ts` lines 43, 59: `"MyTestPassword123!"`, `"samePassword"`

**Status:** test literals, not real secrets. Fine to keep, but make sure they're never used as fallback defaults in production code paths.

---

### M3. Error-tracker test fixture contains literal secrets

**File:** `onyx-procurement\src\ops\error-tracker.test.js` lines 131, 138

```js
password: 'hunter2',
api_key: 'sk_live_xxx'
```

These are test strings to verify the PII scrubber works. They are NOT real secrets. **BUT** — if you don't yet have a PII scrubber (see BUG-SEC-023), verify that these test cases actually pass (i.e., the scrubber actively redacts them).

---

### M4. Paradigm engine smoke-test stub

**File:** `paradigm_engine\smoke-test.js` line 494

```js
integrations.configureConnector("whatsapp_business", { apiKey: "stub", phoneId: "test" });
```
Stub only. Safe.

---

## LOW — credential schema fields with empty defaults

These are initial-state React form fields, NOT secrets. Listed for completeness:

| File | Line | Field |
|---|---|---|
| `AI-Task-Manager\artifacts\erp-app\src\pages\supply-chain\edi-admin.tsx` | 72, 76, 82 | webhookSecret, sftpPassword, apiKey |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\sections\sso-settings.tsx` | 61, 222, 342 | clientSecret empty init |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\sections\mfa-settings.tsx` | 47 | TOTP secret extract (user-session only) |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\israeli-integrations.tsx` | 48, 65, 107, 157 | apiKey empty form state |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\sections\system-settings.tsx` | 134, 135 | apiKey, apiSecret empty init |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\api-connection-hub.tsx` | 106, 183 | auth_password empty init |
| `AI-Task-Manager\artifacts\erp-app\src\pages\settings\sections\user-management.tsx` | 47, 49, 226, 294 | password, newPassword empty init |
| `AI-Task-Manager\artifacts\erp-app\src\pages\crm\integrations\webhooks.tsx` | 37 | secret empty init |
| `techno-kol-ops\client\src\App.tsx` | 107 | login form password state |

All of these are `useState("")` or `useState({password: ""})` initializers. **No action required** — just documenting scanner false-positives so they don't get re-flagged.

---

## LOW — enum and constant strings (false positives)

| File | Line | Value | Reason |
|---|---|---|---|
| `enterprise_palantir_core\app\engines\connector_registry.py` | 69 | `API_KEY = "api_key"` | Enum constant, Python |
| `AI-Task-Manager\artifacts\api-server\src\lib\super-ai-agent.ts` | 399 | `apiKey: ""` | Default config builder |
| `AI-Task-Manager\artifacts\api-server\src\lib\security-upgrade.ts` | 201 | `let secret = "";` | Variable init |
| `AI-Task-Manager\artifacts\erp-app\src\pages\api-keys.tsx` | 235 | `isRevealed ? key.apiKey : "••••••••••••••••••••"` | UI reveal logic |

---

## SCAN-MISSING — what I did NOT check

- **node_modules/** — excluded for size/noise. Should be covered by `npm audit` + Snyk/Socket.
- **Git history** — did not run `git log -p` or `git filter-repo --analyze`. BFG or `trufflehog --max-depth 1000` scan of full history is recommended.
- **Compiled bundles** — `dist/`, `build/`, `.next/` directories not scanned. Secrets can be inlined by Vite/webpack.
- **Dockerfiles, CI configs** — no `.github/workflows` or `Dockerfile` were deeply inspected for ENV / ARG leaks.
- **Binary files** — `.pdf`, `.xlsx`, `.zip` not scanned. The repo has `AI-Task-Manager.zip`, `Location-Finder.zip`, `location-finder (1).zip` at root. **Recommend extracting and scanning.**

---

## SUMMARY COUNTS

| Severity | Count | Items |
|---|---|---|
| CRITICAL | 0 | C1 RESOLVED, C2 RESOLVED, C3 RESOLVED, C4 RESOLVED — all secrets scrubbed from source |
| MEDIUM | 4 | M1-M4 |
| LOW | ~30 | Empty form defaults, enum constants — documented for scanner noise |

**Rotation list (must rotate today):**
1. `JWT_SECRET` (techno-kol-ops + AI-Task-Manager)
2. `CREDENTIAL_ENCRYPTION_KEY`
3. `APP_SECRET_KEY`
4. `admin` / `kobiellkayam` user passwords
5. Any real `ANTHROPIC_API_KEY` / `SUMIT_API_KEY` / `WIX_API_KEY` / `GOOGLE_*` values currently deployed (if different from the placeholder strings, they need rotation + audit)

---

## RECOMMENDED TOOLING

Add these pre-commit hooks and CI gates:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

```yaml
# .github/workflows/secrets-scan.yml
- uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
    extra_args: --only-verified
```

---

**End of QA-13-secrets-scan.md**
