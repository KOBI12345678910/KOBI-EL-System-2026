# QA-13 — Security Audit (ERP Techno-Kol Uzi)

**Agent:** QA-13 Security (OWASP Top 10 + Israeli-specific)
**Date:** 2026-04-11
**Scope:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\` — all source code (node_modules excluded)
**Projects scanned:** techno-kol-ops, onyx-procurement, onyx-ai, nexus_engine, payroll-autonomous, AI-Task-Manager, enterprise_palantir_core, paradigm_engine, palantir_realtime_core, GPS-Connect

---

## Executive summary

| Severity | Count | Notes |
|---|---|---|
| CRITICAL | 6 | Hardcoded creds, committed secrets, wide CORS, SQL-i via identifier interpolation, no auth on core routes |
| HIGH | 7 | Default admin password, bcrypt fallback, weak JWT secret history, permissive helmet, etc. |
| MEDIUM | 9 | Logging PII risk, X-Powered-By custom, XXE surface minimal but untested, innerHTML RTL dashboards |
| LOW | 5 | TOTP SHA1 (RFC 6238 OK but flagged), backup file in repo, etc. |

**Overall security posture:** **NO-GO for production.**
`onyx-procurement/server.js` sets a strong baseline (helmet, CORS allowlist, HMAC timingSafeEqual, rate limit, fail-fast env) — but `techno-kol-ops/src/index.ts` and `AI-Task-Manager/artifacts/api-server` contain blocking findings that MUST be fixed before any prod exposure.

---

## FINDINGS

### BUG-SEC-001 — CRITICAL — Hardcoded super-admin passwords in source (CVSS 9.8)

**File:** `AI-Task-Manager\artifacts\api-server\src\lib\admin-seed.ts` lines 11-36
**CWE:** CWE-798 (Use of Hard-coded Credentials)
**OWASP:** A02:2021 — Cryptographic Failures / A07:2021 — ID & Auth Failures

Two super-admin users hard-coded with plaintext passwords AND hard-coded salts, checked into git:
```ts
{ username: "admin",         password: "admin123",         salt: "fallback_salt_admin_2026",         isSuperAdmin: true }
{ username: "kobiellkayam",  password: "KOBIE@307994798",  salt: "fallback_salt_kobiellkayam_2026", isSuperAdmin: true }
```
The `ensureAdminUser()` function is called on every boot. If the DB is wiped or a fresh environment is spun up, these credentials become the entry point.

Additionally, the hash uses `pbkdf2Sync(password, salt, 100000, 64, 'sha512')` with a **static** salt — rainbow-table feasible for the literal strings because the salts are committed.

**Impact:** Full compromise. Any attacker with read access to the repo has the CEO's password ("KOBIE@307994798") and an admin/admin123 combo that will be re-seeded on every boot.

**Fix:**
1. Remove literal passwords; load from `process.env.ADMIN_SEED_PASSWORD` and require it on boot.
2. Generate a per-user random salt (`crypto.randomBytes(16)`).
3. Rotate the passwords immediately — the committed strings must be treated as compromised.
4. Force password reset on first login for seeded admins.

---

### BUG-SEC-002 — CRITICAL — Committed secrets in `.replit` and `.env`

**Files:**
- `AI-Task-Manager\.replit` lines 36-38 (committed to git history)
- `AI-Task-Manager\artifacts\kobi-agent\.env` (present on disk)

**CWE:** CWE-540 (Inclusion of Sensitive Information in Source Code)

`.replit` `[userenv.shared]` exposes (full values in QA-13-secrets-scan.md):
- `JWT_SECRET` (128-char hex) — signs every JWT for the ERP
- `CREDENTIAL_ENCRYPTION_KEY` (64-char hex) — encrypts stored integration creds
- `APP_SECRET_KEY` (64-char hex) — signs sessions

`AI-Task-Manager\artifacts\kobi-agent\.env` contains `ANTHROPIC_API_KEY=CLAUDE2026` (placeholder but the file pattern itself bypasses the .gitignore because a different `.gitignore` applies at the `kobi-agent` subfolder).

**Impact:** Anyone with repo access can forge JWTs for any user, decrypt stored API keys, and impersonate any actor in the audit log.

**Fix:**
1. `git rm --cached AI-Task-Manager/.replit` and move secrets to Replit Secrets panel (not source).
2. Rotate JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY, APP_SECRET_KEY immediately.
3. Invalidate all issued JWTs (bump `iss` or force re-login).
4. `git rm --cached AI-Task-Manager/artifacts/kobi-agent/.env`.
5. Scrub git history for these values (git filter-repo or BFG).

---

### BUG-SEC-003 — CRITICAL — Wide-open CORS + no helmet in techno-kol-ops (CVSS 8.6)

**File:** `techno-kol-ops\src\index.ts` line 43
**CWE:** CWE-942 (Permissive Cross-domain Policy)
**OWASP:** A05:2021 — Security Misconfiguration

```ts
app.use(cors({ origin: '*' }));
app.use(express.json());
```
- No helmet
- No rate limiting (not even on `/api/auth/login`)
- No body-size limit
- CORS wide open despite `ALLOWED_ORIGINS` being declared in `.env.example`
- The security middleware `src/middleware/security.js` is implemented but NEVER imported into `src/index.ts`

**Impact:** Any website a logged-in user visits can call the ERP API with that user's JWT (if stored in a cookie/header accessible from JS). No CSP, no X-Frame-Options, no HSTS.

**Fix:** Wire `src/middleware/security.js` into `src/index.ts` per `INSTRUCTIONS_TO_WIRE.md`:
```ts
const { validateEnv, helmetMw, jsonBodyMw, corsMw, apiRateLimit, loginRateLimit, requireAuth, errorHandler } = require('./middleware/security.js');
validateEnv();
app.use(helmetMw);
app.use(jsonBodyMw);
app.use(corsMw);
app.use('/api/', apiRateLimit);
app.post('/api/auth/login', loginRateLimit, async (req, res) => { ... });
```
The module is already written and tested — it just needs to be plugged in. CORS must use the env allowlist, never `*` with credentials.

---

### BUG-SEC-004 — CRITICAL — SQL injection via column-name interpolation (CVSS 9.1)

**File:** `techno-kol-ops\src\routes\employees.ts` lines 84-100 (PUT /:id)
**Also:** `leads.ts`, `tasks.ts`, `clients.ts`, `workOrders.ts` (same pattern)
**CWE:** CWE-89 (SQL Injection)

```ts
const keys = Object.keys(fields);                                   // <-- user-controlled
const values = keys.map(k => fields[k]);
const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', '); // <-- k is raw user key
await query(`UPDATE employees SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
```

An attacker can POST:
```json
{ "salary = 99999, admin_flag": "true" }
```
and inject arbitrary SQL after the `=`. While parameterized values protect the RHS, the LHS column name is concatenated directly.

**Impact:** Write-arbitrary-column SQL-i. Turns any PUT into an `UPDATE employees SET salary = 99999, is_admin=true WHERE id=1` write.

**Fix:**
```ts
const ALLOWED = new Set(['name','role','department','phone','id_number','salary','employment_type','start_date','notes']);
const keys = Object.keys(fields).filter(k => ALLOWED.has(k));
if (keys.length === 0) return res.status(400).json({ error: 'No valid fields' });
```
Same pattern must be applied to the other 4 routes.

---

### BUG-SEC-005 — CRITICAL — SQL-i via table-name interpolation in Ontology engine

**File:** `techno-kol-ops\src\ontology\ontologyEngine.ts` line 152, 166-167, 179+
**CWE:** CWE-89

```ts
await query(`SELECT * FROM ${schema.table} WHERE id=$1`, [id]);
await query(`SELECT id, * FROM ${targetSchema.table} WHERE ${link.foreignKey}=$1 LIMIT 5`, [id]);
```

`schema.table` and `link.foreignKey` come from `ONTOLOGY_SCHEMA` which is static, BUT the `type` parameter that picks the schema comes from `getObject(type: ObjectType, id: string)` — and callers (routes/brain, routes/ontology) pass `req.params.type` or `req.body.type` without validation. A type not in the schema throws, which is safe, but if ONTOLOGY_SCHEMA is ever hydrated from the DB/config, this becomes a live SQL-i.

**Impact:** Currently mitigated by the in-memory allowlist, but fragile. Any future dynamic loading breaks the model.

**Fix:** Add `if (!/^[a-z_]+$/.test(schema.table)) throw` and same for foreignKey. Or use `pg-format` / `pg.Client.escapeIdentifier()`.

---

### BUG-SEC-006 — CRITICAL — No auth on core techno-kol-ops routes (CVSS 9.1)

**File:** `techno-kol-ops\src\index.ts` lines 82-104
**CWE:** CWE-862 (Missing Authorization)

Routes mounted with **zero** global auth middleware:
```ts
app.use('/api/work-orders', workOrdersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/clients', clientsRouter);
// ... etc
```
Individual routers call `router.use(authenticate)` internally (employees.ts line 6) — but this is NOT guaranteed across all routers. A grep shows mixed coverage. Some routers import `authenticate`, others don't.

Also: `middleware/auth.ts` uses `jwt.verify(token, process.env.JWT_SECRET!)` without algorithm pinning → vulnerable to `alg:none` attack if an older jsonwebtoken is present (CVE-2022-23539 class).

**Fix:**
1. Apply `requireAuth` globally in `index.ts` with a PUBLIC_API_PATHS allowlist (see security.js pattern).
2. In `middleware/auth.ts`, explicitly pin: `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`.

---

### BUG-SEC-007 — HIGH — bcrypt/jsonwebtoken runtime fallback accepts weak crypto (CVSS 7.4)

**Files:**
- `techno-kol-ops\src\auth\password-helper.js` lines 40-55, 87-111
- `techno-kol-ops\src\auth\jwt-helper.js` lines 38-50, 139-196

**CWE:** CWE-327 (Use of Broken/Weak Crypto)

If `bcryptjs` or `jsonwebtoken` are not resolvable, the helpers fall back to:
- Password: `crypto.scrypt` with N=16384 (weaker than bcrypt-12)
- JWT: pure-Node HS256 without claim validation (no `nbf`, `iat`, `aud`, `iss`)

Both modules log a warning but still return successfully. In a stripped production build, this silently degrades crypto strength.

**Fix:** In `assertSecretOnStartup()` and `hashPassword()`, **throw** in production if `NODE_ENV==='production' && usingFallback`. Fail-closed, not fail-soft.

---

### BUG-SEC-008 — HIGH — JWT issued by techno-kol-ops uses `process.env.JWT_SECRET!` (TS non-null assertion) — no validation

**File:** `techno-kol-ops\src\index.ts` line 62, `src\middleware\auth.ts` line 15

```ts
const token = jwt.sign({...}, process.env.JWT_SECRET!, { expiresIn: '24h' });
jwt.verify(token, process.env.JWT_SECRET!);
```
`!` = "trust me it's set" — but there's NO startup check. If `JWT_SECRET` is empty at runtime, `jwt.sign` with `undefined` secret behaves as `'undefined'`, producing predictable tokens.

**Fix:** Call `assertSecretOnStartup()` (already implemented in `jwt-helper.js`) from `index.ts` on boot. Refuse to start if missing or weak.

---

### BUG-SEC-009 — HIGH — JWT_SECRET committed historical value "techno_kol_secret_2026_palantir"

**Files:**
- `techno-kol-ops\.env.example` (placeholder)
- `techno-kol-ops\src\auth\jwt-helper.test.js` line 131 (test uses it)
- `techno-kol-ops\src\middleware\security.js` line 60 (listed in blocklist)

The string `"techno_kol_secret_2026_palantir"` is present in git as the .env.example placeholder. If any operator copied .env.example → .env without changing it, they'd have a fully predictable JWT secret that's also in the repo.

**Fix:** Change `.env.example` to `JWT_SECRET=CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32`. The blocklist in `security.js` already catches this value — good — but make sure `validateEnv()` is actually called on boot (BUG-SEC-003).

---

### BUG-SEC-010 — HIGH — Helmet disables CSP globally

**Files:**
- `onyx-procurement\server.js` line 71: `contentSecurityPolicy: false`
- `techno-kol-ops\src\middleware\security.js` line 91: `contentSecurityPolicy: false`

**CWE:** CWE-693 (Protection Mechanism Failure)

Both projects disable CSP with the comment "RTL dashboard / dynamic content". This defeats a primary XSS defense.

**Fix:** Use nonce-based CSP. Generate per-request nonce, attach to script/style tags:
```js
app.use((req, res, next) => { res.locals.nonce = crypto.randomBytes(16).toString('hex'); next(); });
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
    styleSrc:  ["'self'", "'unsafe-inline'"],  // relax only for styles
  }
}));
```

---

### BUG-SEC-011 — HIGH — AUTH_MODE can be "disabled" in onyx-procurement

**File:** `onyx-procurement\server.js` lines 150-156

```js
const AUTH_MODE = process.env.AUTH_MODE || (API_KEYS.length ? 'api_key' : 'disabled');
function requireAuth(req, res, next) {
  if (AUTH_MODE === 'disabled') { req.actor = 'anonymous'; return next(); }
  ...
}
```
If `API_KEYS` env is empty, `AUTH_MODE` silently becomes `'disabled'` and every API route is public. There is no production guard.

**Fix:** Add `if (process.env.NODE_ENV === 'production' && AUTH_MODE === 'disabled') process.exit(1)` at startup.

---

### BUG-SEC-012 — HIGH — Error handler leaks stack trace to client when NODE_ENV is not 'production'

**File:** `onyx-procurement\server.js` lines 1184-1191

```js
res.status(err.status || 500).json({
  error: isProd ? 'Internal server error' : err.message,
  ...(isProd ? {} : { stack: err.stack?.split('\n').slice(0, 5) }),
});
```

If `NODE_ENV` is unset (common misconfig), server returns stack traces revealing file paths, DB columns, library versions. This is information disclosure (CWE-209).

**Fix:** Default `NODE_ENV` to `'production'` if unset; only emit stack traces when `NODE_ENV === 'development'`.

---

### BUG-SEC-013 — HIGH — X-Powered-By custom header leaks product

**File:** `AI-Task-Manager\artifacts\api-server\src\lib\api-gateway.ts` line 192
```ts
res.setHeader("X-Powered-By", "Techno-Kol-Uzi-ERP");
```
**CWE:** CWE-200

Explicitly broadcasts the product name. Helmet would strip `X-Powered-By` by default — here it's re-added manually. Useful for attackers doing recon.

**Fix:** Remove the `setHeader` call. Let `helmet()` strip it.

---

### BUG-SEC-014 — MEDIUM — No audit log on failed login attempts (techno-kol-ops)

**File:** `techno-kol-ops\src\index.ts` lines 47-69
**CWE:** CWE-778 (Insufficient Logging)
**OWASP:** A09:2021 — Logging & Monitoring Failures

```ts
if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
const valid = await bcrypt.compare(password, rows[0].password_hash);
if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
```
No `auditLog()` call on 401. No failed-attempt counter. No lockout. Combined with the missing rate limiter (BUG-SEC-003), unlimited brute force is possible against `/api/auth/login`.

**Fix:**
1. Add `auditLog(null, 'login_failed', 'user', username, { ip: req.ip, ts: Date.now() })` on every 401.
2. After N failures, lock the account for M minutes.
3. `loginRateLimit` from security.js needs to be applied.

---

### BUG-SEC-015 — MEDIUM — Audit logging swallows errors silently

**File:** `techno-kol-ops\src\middleware\audit.ts` line 20: `} catch {}`

If the audit DB write fails, the app continues silently. Attacker can't tell you're auditing, but you also can't tell when audit is broken. Compliance risk (חוק הגנת הפרטיות 1981 + GDPR Art. 30).

**Fix:** `catch (err) { console.error('[audit]', err); errorTracker?.captureException(err); }`.

---

### BUG-SEC-016 — MEDIUM — `innerHTML` assignments with template data (XSS surface)

**Files:**
- `onyx-procurement\web\vat-dashboard.html` line 100
- `onyx-procurement\web\bank-dashboard.html` line 104
- `onyx-procurement\web\annual-tax-dashboard.html` line 71
- `paradigm_engine\paradigm-part6.js` line 666
- `AI-Task-Manager\artifacts\erp-app\src\main.tsx` line 22
- `AI-Task-Manager\artifacts\erp-app\src\pages\builder\form-field-components.tsx` line 33 (`editorRef.current.innerHTML = sanitized`)
- `AI-Task-Manager\artifacts\erp-app\src\pages\builder\dynamic-data-view.tsx` line 2090

Some use explicit `escapeHtml()` (status.html lines 292-311 — good); some do not. `dynamic-data-view.tsx` writes `value || ""` directly into `innerHTML` without sanitization.

**Fix:**
1. Where "sanitized" is passed through DOMPurify, verify it's actually calling DOMPurify and not a trust-the-server assumption.
2. For dynamic-data-view.tsx, use `textContent` instead of `innerHTML`, or wrap in `DOMPurify.sanitize(value, {USE_PROFILES:{html:true}})`.

---

### BUG-SEC-017 — MEDIUM — `dangerouslySetInnerHTML` in 19 React files (review needed)

**Files list in QA-13-secrets-scan.md.** Most are chart.tsx (shadcn pattern, safe style block) but some handle user data:
- `AI-Task-Manager\artifacts\erp-app\src\pages\builder\form-field-components.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\builder\template-builder.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\builder\dynamic-detail-page.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\document-builder.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\documents\templates-library.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\documents\document-search.tsx`
- `AI-Task-Manager\artifacts\erp-app\src\pages\palantir\dossier-page.tsx`
- `GPS-Connect\artifacts\gps-app\src\pages\share.tsx`

**Fix:** For each, wrap user-supplied HTML in `DOMPurify.sanitize()` with a restrictive profile before passing to `dangerouslySetInnerHTML`.

---

### BUG-SEC-018 — MEDIUM — MD5 used for fingerprinting alerts (techno-kol-ops)

**Files:**
- `techno-kol-ops\client\src\engines\intelligentAlertEngine.ts` line 1060
- `onyx-ai\src\modules\intelligent-alert-system.ts` line 1008
```ts
const fingerprint = crypto.createHash('md5').update(`${rule.id}:${signal.source}:${signal.category}`).digest('hex');
```
**CWE:** CWE-327 — MD5 is broken for auth/sigs but acceptable for fingerprinting. BUT — if any code downstream treats the fingerprint as an integrity token (e.g., "if fingerprints match, skip re-verification"), it's exploitable.

**Fix:** Use SHA-256; it's one word change.

---

### BUG-SEC-019 — MEDIUM — `sha1` used in TOTP (RFC 6238 compliance) — flagged, not bug

**Files:** `AI-Task-Manager\artifacts\api-server\src\lib\mfa.ts` line 51, `mfa-verify.ts` line 28, `security-upgrade.ts` line 234, `scripts\mfa.backup.ts` line 51

TOTP (RFC 6238) specifies HMAC-SHA1. This is NOT a vulnerability per se — but note that Google Authenticator now supports SHA-256/SHA-512. The existing code is compliant.

**Also critical:** `scripts\mfa.backup.ts` is a committed backup file that shouldn't be in the repo (see BUG-SEC-024).

**Fix:** Leave SHA-1 for TOTP (RFC compliance). Remove `mfa.backup.ts`.

---

### BUG-SEC-020 — MEDIUM — `origin: '*'` with `credentials: true` in onyx-procurement when `ALLOWED_ORIGINS=*`

**File:** `onyx-procurement\server.js` lines 75-84

```js
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  credentials: true,
  ...
}));
```
When `ALLOWED_ORIGINS` is unset, it defaults to `'*'` → `origin: true` → reflects Origin header → combined with `credentials: true` this violates the CORS spec and most browsers will reject it, but some older / mobile browsers accept it, enabling CSRF.

**Fix:** Default `ALLOWED_ORIGINS` to the actual production origin; in prod, reject boot if `'*'`.

---

### BUG-SEC-021 — MEDIUM — Israeli ID (ת.ז.) stored without encryption

**File:** `techno-kol-ops\src\db\schema.sql` line 51: `id_number VARCHAR(20)`
**Law:** חוק הגנת הפרטיות, תקנות אבטחת מידע 2017 — ID numbers are defined as sensitive personal data.

The `employees.id_number` column is plain VARCHAR. Not encrypted at rest, not redacted on SELECT. Any leaked DB backup exposes full Israeli IDs.

**Also:** `techno-kol-ops\src\documents\documentEngine.ts` line 272 joins and SELECTs `c.id_number` into generated documents.

**Fix:**
1. Use PostgreSQL `pgcrypto` column encryption, or app-level AES-256-GCM with a KEK from KMS/env.
2. Add a view `employees_redacted` that shows only the last 4 digits.
3. Route DB reads through the redacted view unless caller has `employees.read_pii` permission.
4. Document as compliance control for רמת אבטחה גבוהה under תקנות 2017.

---

### BUG-SEC-022 — LOW — No JWT revocation mechanism

**Files:** all projects issuing JWT

JWTs have `expiresIn: '24h'` (techno-kol-ops) or `'15m'` + refresh (AI-Task-Manager). There is no blacklist / denylist. A stolen token remains valid for its lifetime.

**Fix:** Maintain a `revoked_jtis` table, add `jti: crypto.randomUUID()` to every sign, check on verify. Alternatively, short-lived access tokens + refresh rotation (API-Task-Manager's model — but needs a revocation store on the refresh side).

---

### BUG-SEC-023 — LOW — PII (Israeli ID, phone) can land in error tracker

**File:** `onyx-procurement\src\ops\error-tracker.js` line 142, 146
If `err.message` contains an ID number (e.g. "Invalid id 312345678"), the fingerprint and message are sent to Sentry. GDPR Art. 32 / Israeli law violation.

**Fix:** Add a PII scrubber: regex for 9-digit Israeli ID, 10-digit phone, credit-card Luhn, email; replace with `[REDACTED]` before `captureException`.

---

### BUG-SEC-024 — LOW — `.backup.ts` committed

**File:** `AI-Task-Manager\artifacts\api-server\scripts\mfa.backup.ts`

Backup of MFA implementation checked in. Old code = old bugs, same crypto secrets may appear.

**Fix:** `git rm AI-Task-Manager/artifacts/api-server/scripts/mfa.backup.ts`.

---

### BUG-SEC-025 — LOW — Dependency hygiene (pre-install scan)

Reviewed all 4 main `package.json`:

| Project | express | jsonwebtoken | bcryptjs | helmet | rate-limit |
|---|---|---|---|---|---|
| techno-kol-ops | ^4.18.2 (OK, >=4.18.2) | ^9.0.2 (OK) | ^2.4.3 (OK) | **MISSING from deps** | **MISSING from deps** |
| onyx-procurement | ^4.21.0 (OK) | n/a (uses API key) | n/a | ^8.0.0 (OK) | ^7.4.1 (OK) |
| nexus_engine | n/a | n/a | n/a | n/a | n/a |
| payroll-autonomous | n/a (Vite frontend only) | n/a | n/a | n/a | n/a |

`techno-kol-ops` has a `security.js` file that does `require('helmet')` and `require('express-rate-limit')` — but these packages are NOT listed in `techno-kol-ops/package.json` dependencies. At runtime, the `try { require('helmet') } catch` block silently falls back to no-op, leaving the service without headers.

**Fix:** `cd techno-kol-ops && npm install helmet express-rate-limit`.

---

### BUG-SEC-026 — INFO — XXE surface: no XML parsing found in techno-kol-ops / onyx-procurement

No XML parsers (fast-xml-parser, xml2js, libxmljs, DOMParser for XML) are used. PCN836 VAT export is generated server-side as text — it's not parsed. **No XXE risk at this time.** Flag for re-scan when PCN836 import becomes bidirectional.

---

### BUG-SEC-027 — INFO — WhatsApp HMAC uses `timingSafeEqual` (good)

**File:** `onyx-procurement\server.js` lines 173-195 — PASS.
Uses `crypto.timingSafeEqual` with length check — correct.

---

## Summary of what's GOOD

| Control | Where | Status |
|---|---|---|
| Helmet + CORS allowlist + rate limit | onyx-procurement/server.js | PASS |
| HMAC timingSafeEqual on webhook | onyx-procurement/server.js:189 | PASS |
| bcrypt cost 12 in password-helper | techno-kol-ops | PASS (if lib available) |
| Parameterized queries (Supabase .from().select()) | onyx-procurement | PASS |
| Parameterized pg queries with `$1, $2` | techno-kol-ops routes | PASS (except column injection in PUT) |
| Fail-fast env validation | onyx-procurement/server.js:45-55 | PASS |
| Graceful shutdown | both | PASS |
| Error tracker with stack sanitization | onyx-procurement/src/ops/error-tracker | PARTIAL (needs PII scrubber) |
| JWT algorithm pin (algorithms: ['HS256']) | jwt-helper.js:244 | PASS |
| Failed-webhook HMAC rejects in prod | onyx-procurement:173-180 | PASS |
| JWT weak-secret blocklist | jwt-helper.js:56-94 | PASS |

---

## OWASP Top 10 2021 mapping

| # | Category | Status | Key findings |
|---|---|---|---|
| A01 | Broken Access Control | **FAIL** | BUG-SEC-006 (no global auth), see QA-12 |
| A02 | Cryptographic Failures | **FAIL** | BUG-SEC-001, 002, 007, 018, 021 |
| A03 | Injection | **FAIL** | BUG-SEC-004, 005 |
| A04 | Insecure Design | **PARTIAL** | default admin passwords, silent fallbacks |
| A05 | Security Misconfiguration | **FAIL** | BUG-SEC-003, 010, 011, 012, 013, 020 |
| A06 | Vulnerable Components | **PARTIAL** | BUG-SEC-025 — missing deps, no CVE scan results |
| A07 | ID & Auth Failures | **FAIL** | BUG-SEC-001, 006, 008, 009, 014, 022 |
| A08 | Software & Data Integrity | **PARTIAL** | no SRI on dashboards, no package signatures |
| A09 | Logging & Monitoring | **FAIL** | BUG-SEC-014, 015, 023 |
| A10 | SSRF | **OK** | no outbound URL-from-user code paths found |

---

## Israeli-specific compliance checks

| Requirement | Status | Notes |
|---|---|---|
| ת.ז. not in URL query strings | PASS | No GET with ID in path found |
| ת.ז. not in logs | **FAIL** | BUG-SEC-023 — error tracker can capture IDs |
| ת.ז. encrypted at rest | **FAIL** | BUG-SEC-021 — plain VARCHAR(20) |
| חוק הגנת השכר — payslip PDF encryption | NEEDS REVIEW | payroll routes register but not audited yet |
| DLP on employee exports | **FAIL** | No mask on /api/employees bulk export |
| HMAC `timingSafeEqual` on webhooks | PASS | BUG-SEC-027 |
| Audit log on sensitive actions | PARTIAL | onyx-procurement PASS, techno-kol-ops FAIL on login |

---

## Go / No-Go

### **NO-GO for production.**

**Blockers (must-fix before prod):**
1. BUG-SEC-001 — hardcoded super-admin passwords in `admin-seed.ts`
2. BUG-SEC-002 — secrets in `.replit` + committed `.env`
3. BUG-SEC-003 — techno-kol-ops wide-open CORS + no helmet + no rate limit
4. BUG-SEC-004 — SQL-i via column-name interpolation in 5 routes
5. BUG-SEC-006 — no global auth enforcement in techno-kol-ops

**High-priority (fix before first customer demo):**
6. BUG-SEC-007 — crypto fallback must fail-closed in prod
7. BUG-SEC-008 — JWT secret validation on startup
8. BUG-SEC-014 — audit log on failed logins + rate limit on /auth/login
9. BUG-SEC-021 — encrypt Israeli ID numbers at rest

**Acceptable post-launch (tracked):**
10-25 — MEDIUM/LOW findings can be scheduled.

---

## Recommended immediate actions (next 24h)

1. **Rotate all committed secrets** — JWT_SECRET, APP_SECRET_KEY, CREDENTIAL_ENCRYPTION_KEY, ANTHROPIC_API_KEY. Treat the current values as compromised.
2. **Delete `admin-seed.ts` plaintext passwords**, replace with env-based seeding, rotate CEO password.
3. **Wire `security.js` into `techno-kol-ops/src/index.ts`** (the module is ready, just plug it in).
4. **Patch the 5 PUT routes** with a column allowlist.
5. **`git rm --cached`** the `.replit`, `kobi-agent/.env`, `mfa.backup.ts` and run a secret-scrub pass over history.

---

**End of QA-13-security.md**
**Sign-off:** QA-13 Security Agent
**Next review:** after fixes applied — re-run full audit.
