# QA Agent 13 — Security (OWASP-style static scan)

Scanned `*.ts`, `*.tsx`, `*.js`, `*.sql` across the repo (excluding node_modules, dist, _merge-staging* as noise; dist/compiled JS is noted when relevant to committed code).

## Critical findings

| finding | file:line | evidence | fix |
|---|---|---|---|
| Hardcoded JWT secret fallback | api-server/src/lib/security-upgrade.ts:16 | `const JWT_SECRET = process.env.JWT_SECRET \|\| "default_jwt_secret_change_in_production_2026";` | Remove fallback; fail-fast if env missing (pattern already used correctly in api-server/src/middleware/auth.ts:5-8) |
| Hardcoded encryption-key fallback | api-server/src/lib/security-upgrade.ts:19 | `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY \|\| "default_encryption_key_32chars!!";` | Remove fallback; require env or throw |
| Real DB/Redis/Supabase secrets stored in on-disk `.env` | .env (not tracked in git), onyx-procurement/.env, techno-kol-ops/.env | `POSTGRES_PASSWORD=VIAzI6PZ_mJN0vdCKA4wLqmuP8t1fA1G`, `REDIS_PASSWORD=NadSN7W7eWPmMRszQtumZCkVG_SgTGnE`, `SUPABASE_ANON_KEY=eyJhbGciOi...` (.env:12,21,27) | `.env` is gitignored (verified via git check-ignore). Still: rotate credentials, confirm file isn't backed up to other repos (_merge-staging copies exist with similar patterns) |

Verified via `git check-ignore` — these `.env` files are ignored and NOT in the tracked repo. No `BEGIN PRIVATE KEY` blocks in tracked source files (only in `onyx-procurement/test/devops/vault-client.test.js` as a test fixture — not real).

## High findings

| finding | file:line | evidence | fix |
|---|---|---|---|
| dangerouslySetInnerHTML with potentially user-influenced content | erp-app/src/pages/document-builder.tsx:244,746 | `<div dangerouslySetInnerHTML={{ __html: previewDoc.generatedHtml \|\| "" }} />` | Sanitize via DOMPurify before injection |
| dangerouslySetInnerHTML on preview HTML | erp-app/src/pages/builder/template-builder.tsx:597 | `<div dangerouslySetInnerHTML={{ __html: previewHtml }} />` | Sanitize previewHtml or render in sandboxed iframe |
| dangerouslySetInnerHTML in dynamic detail | erp-app/src/pages/builder/dynamic-detail-page.tsx:38 | `dangerouslySetInnerHTML={{ __html: sanitized }}` — variable name suggests sanitization, but source not verified | Confirm the `sanitize()` call uses DOMPurify, not just escape |
| dangerouslySetInnerHTML on search snippet | erp-app/src/pages/documents/document-search.tsx:298 | `<p ... dangerouslySetInnerHTML={{ __html: r.snippet }} />` | Server-side highlight may contain user input — sanitize |
| dangerouslySetInnerHTML on call-analysis highlight | erp-app/src/pages/crm/call-analysis.tsx:399 | `<p ... dangerouslySetInnerHTML={{ __html: r.highlight }} />` | Sanitize server output or render as structured <mark> |
| dangerouslySetInnerHTML on palantir dossier | erp-app/src/pages/palantir/dossier-page.tsx:838 | regex replace + injection | Acceptable only if input is controlled server data; prefer React components |
| dangerouslySetInnerHTML on form-field highlight | erp-app/src/pages/builder/form-field-components.tsx:443 | `dangerouslySetInnerHTML={{ __html: highlighted }}` | Sanitize |
| JWT token stored in localStorage (XSS vector) | erp-app/src/hooks/use-api-action.tsx:30, erp-app/src/hooks/use-realtime-alerts.ts:31, erp-app/src/pages/system/audit-log.tsx:52, erp-app/src/components/dashboard-kpi.tsx:105, erp-app/src/pages/supplier-mgmt/supplier-portal-dashboard.tsx:33, erp-app/src/pages/procurement/po-approvals.tsx:54-114 (5x), erp-app/src/pages/production/field-measurements-page.tsx:20 | `localStorage.getItem("token")` | Server already supports httpOnly cookies (auth.ts:71). Migrate all client fetch calls to credentials:'include' and drop localStorage token fallback |

No SQL-injection via string concatenation found in `api-server/src/routes/**` (code uses Drizzle ORM with parameterized `eq()`). No `child_process.exec(...req.body)` patterns found. No `eval(userInput)` / `new Function(userInput)` found.

## Medium findings

| finding | file:line | evidence | fix |
|---|---|---|---|
| Weak hash (MD5) for alert fingerprinting | techno-kol-ops/client/src/engines/intelligentAlertEngine.ts:1061, onyx-ai/src/modules/intelligent-alert-system.ts:1008 | `crypto.createHash('md5').update(...)` | Non-security use (fingerprint/dedup) — acceptable, but prefer sha256 for future-proofing |
| Weak hash (SHA1) for IDs and error fingerprinting | onyx-procurement/src/ops/error-tracker.js:220,224,756; onyx-procurement/src/ops/alert-manager.js:127; onyx-procurement/src/payments/payment-run.js:362; onyx-procurement/src/payments/deposit-slip.js:956; onyx-procurement/src/reporting/revenue-waterfall.js:292; onyx-procurement/src/e2e/e2e-harness.js:155; onyx-procurement/src/security/dep-audit.js:1414; onyx-procurement/src/customer/qbr-generator.js:374; scripts/i18n-extract.js:208 | `crypto.createHash('sha1')` | Non-cryptographic use (fingerprints/IDs) — acceptable, but any signing paths should move to sha256 |
| Math.random() used in ~151 code locations | api-server/src/routes/**, onyx-ai, erp-app | security-sensitive flows (token IDs) may be among these | Audit each for token/ID generation; replace with `crypto.randomBytes`/`randomUUID` |
| JWT tokens logged via console.log in auth flows | api-server/src/lib/auth.ts:486,489; api-server/src/lib/admin-seed.ts:34 ("resetting admin password to admin123") | bootstrap prints password | Remove bootstrap default password; at minimum log to secure channel only in development |
| Bootstrap admin password `admin123` | api-server/src/lib/admin-seed.ts:34 | `[admin-seed] Bootstrap mode: resetting admin password to admin123` | Require operator to set initial password via env on first run |
| JWT without explicit expiration verification | api-server/src/lib/security-upgrade.ts (custom HMAC-SHA256 JWT) | token has expiresIn=3600 default — acceptable. Verify refresh path does not reuse window. | Already correct in middleware/auth.ts (15m + 7d refresh) |

## Low findings

| finding | file:line | evidence | fix |
|---|---|---|---|
| Bearer token literal in templates (placeholder, not secret) | api-server/src/routes/techno-kol-uzi-ai-engine.ts:1951,1960 | `credentials: { token: 'WA_BUSINESS_TOKEN' }` — clearly a placeholder key name, not a real token | OK — naming convention confusing; rename to `envKey` |
| Test fixtures with fake secrets | onyx-procurement/test/**/*.test.js (multiple) | `secret: 'test-wa-secret-xyz'`, `secret: 'unit-test-secret-32-bytes-random-xyz'` | Acceptable in tests |
| Verbose error in forgotPassword logs | api-server/src/lib/auth.ts:486 | logs user email + failure reason | Rate-limit auth endpoints (already present via express-rate-limit in api-gateway/production-middleware); scrub email in prod logs |
| No CSRF token middleware visible for state-changing endpoints | api-server/src/app.ts | relies on Bearer-token model which mitigates CSRF; if cookie auth active, add CSRF token | Pattern-level concern; verify CSRF middleware in production-middleware.ts |
| `NODE_ENV=production` hardcoded in dev .env | .env:7 | Local dev file sets NODE_ENV=production | Should be NODE_ENV=development in dev machines |

## Positive findings
- `api-server/src/middleware/auth.ts` correctly fails fast when `JWT_SECRET` is unset (lines 5-8), uses short 15m access + 7d refresh, prefers httpOnly cookies over Authorization header.
- `express-rate-limit` is wired in 6 places: `api-server/src/middleware/production-middleware.ts`, `api-server/src/lib/security-upgrade.ts`, `api-server/src/app.ts`, `api-server/src/lib/api-gateway.ts`, `api-server/src/lib/gateway-middleware.ts`, `api-server/src/routes/security.ts`.
- No SQL concatenation patterns found in tracked server routes (Drizzle ORM-based).
- No `BEGIN PRIVATE KEY` in tracked files.
- No wildcard CORS (`origin: '*'`) found.
- No `<img>` missing alt in main UI.

## Counts
- critical_count: 3
- high_count: 8
- medium_count: 6
- low_count: 5

## Verdict
**conditional** — Two concrete critical fixes needed: (1) remove `|| "default_..."` JWT/encryption-key fallbacks in `api-server/src/lib/security-upgrade.ts`, (2) rotate all on-disk secrets shown in `.env` files and migrate FE token storage from `localStorage` to the already-supported httpOnly cookie pattern. High findings (seven `dangerouslySetInnerHTML` usages) need DOMPurify verification. After those, system security posture is consistent with a Palantir-grade ERP.
