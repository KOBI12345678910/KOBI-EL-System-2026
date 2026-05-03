# AGENT-313 — Security Deep Audit (Techno-Kol Uzi ERP 2026)

**Agent:** 313 - Security Agent
**Date:** 2026-04-29
**Scope:** SQL Injection, XSS, CSRF, Broken Auth, Broken Access Control, Sensitive Data Exposure,
Weak Validation, Session/Token Issues, Hardcoded Secrets, CORS Misconfig, Information Disclosure
**Cross-references:** AGENT-13, AGENT-159, AGENT-270, AGENT-290, AGENT-295
**Method:** Static analysis of `onyx-procurement/`, `techno-kol-ops/`, `api-server/`, `erp-app/`,
`payroll-autonomous/`, `onyx-ai/` (excluding `_merge-incoming/`, `node_modules/`).

---

## SUMMARY

| Severity | Count |
|----------|-------|
| CRITICAL (CVSS 9.0-10.0) | 4 |
| HIGH     (CVSS 7.0-8.9)  | 7 |
| MEDIUM   (CVSS 4.0-6.9)  | 9 |
| LOW      (CVSS 0.1-3.9)  | 5 |
| **TOTAL** | **25** |

Top three blockers for production go-live:
1. **SEC-313-001** — Hardcoded super-admin credentials `admin/admin123` shipped in code & tests
2. **SEC-313-002** — SQL Injection via unparameterized table name in chatbot engine
3. **SEC-313-003** — JWT verification falls open on WebSocket auth (anonymous access to global broadcasts)

---

## CRITICAL

### SEC-313-001 — Hardcoded super-admin password `admin123` in production seed
**Description:** `api-server/src/lib/admin-seed.ts` and `api-server/src/lib/auth.ts` ship a hardcoded
super-admin password `admin123`. The credential is also embedded as a fallback hash in `auth.ts`
(`FALLBACK_USERS` array), in integration tests, in user-facing docs (`docs/merged/technokoluzi-erp/replit.md`),
and in tooling (`api-server/src/routes/kobi/tools.ts:2516`). The user `kobiellkayam` (super admin)
also has the password `KOBIE@307994798` baked into source.
**Steps to Reproduce:**
1. Boot the api-server with `ADMIN_BOOTSTRAP=true` or in any non-production env.
2. POST `/api/auth/login` with `{ "username": "admin", "password": "admin123" }`.
3. Receive a session token granting `isSuperAdmin: true`.
**Actual:** Anyone with public network access to the dev/bootstrap instance becomes super admin.
**Expected:** Initial admin password must be (a) randomly generated on first boot, (b) printed to
operator stdout once, (c) require rotation on first login.
**Severity:** CRITICAL — CVSS 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
**Module:** `api-server/src/lib/admin-seed.ts`, `api-server/src/lib/auth.ts:30-39`,
`api-server/src/routes/kobi/tools.ts:2516`
**Fix:** Replace literal `"admin123"` with `crypto.randomBytes(18).toString('base64url')`,
write to a one-time `BOOTSTRAP_PASSWORD` file with `chmod 600`, force password change on first login.
Remove the hardcoded `KOBIE@307994798` and `kobiellkayam` fallback row entirely; load from env.

### SEC-313-002 — SQL Injection via unparameterized table name in chatbot/engine
**Description:** `onyx-procurement/src/chatbot/engine.js:669,691` builds raw SQL with an interpolated
`${table}` and `${orderBy}` expression. While WHERE-clause values are correctly parameterized with
`$1..$N`, the `table` variable is concatenated. If `table` ever derives from user input
(NL-to-SQL parsing of free-text), it becomes a textbook SQLi sink.
```js
let sql = `SELECT * FROM ${table}`;
if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
if (orderBy) sql += ` ORDER BY ${orderBy}`;
```
**Steps:** Send chatbot a prompt that resolves `intent.entity` to a string like
`invoices; DROP TABLE invoices; --`.
**Actual:** Engine concatenates the string into a query and passes it to PG.
**Expected:** Whitelist table names and ORDER-BY columns to a fixed allow-list.
**Severity:** CRITICAL — CVSS 9.1 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N)
**Module:** `onyx-procurement/src/chatbot/engine.js:669,671,691`
**Fix:**
```js
const TABLES = new Set(['invoices','payments','clients','vendors','products']);
if (!TABLES.has(table)) throw new Error('Invalid table');
const ORDER_COLS = { invoices:'issued_at', payments:'paid_at' };
const ob = ORDER_COLS[table] || 'id';
let sql = `SELECT * FROM "${table}" ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY "${ob}" LIMIT 5`;
```

### SEC-313-003 — Broken Auth: WebSocket fall-through to anonymous on jwt.verify failure
**Description:** `techno-kol-ops/src/realtime/websocket.ts:21-27` wraps `jwt.verify` in a silent
`try{}catch{}` and downgrades the user to `userId='anonymous'` while still adding the client to
the `'global'` room. The server then `broadcast()`s every `BROADCAST_TO_ALL` event (orders, GPS,
financial transactions) to every connected client, authenticated or not.
**Steps:**
1. Connect `ws://host:3200/ws` with no `?token=` query string.
2. Receive the `CONNECTED` payload.
3. Receive every subsequent `broadcastToAll(...)` payload.
**Actual:** Unauthenticated clients receive sensitive event streams.
**Expected:** Reject the socket on missing/invalid token (`ws.close(1008, 'unauthorized')`).
**Severity:** CRITICAL — CVSS 8.6 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N)
**Module:** `techno-kol-ops/src/realtime/websocket.ts:13-29`
**Fix:**
```ts
if (!token) { ws.close(1008,'no-token'); return; }
let decoded;
try { decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms:['HS256'] }) as any; }
catch { ws.close(1008,'bad-token'); return; }
```

### SEC-313-004 — Default JWT_SECRET shipped in `techno-kol-ops/.env`
**Description:** The committed `.env` file contains
`JWT_SECRET=change-this-in-production-min-32-chars`. The api-server uses `process.env.JWT_SECRET!`
with a non-null assertion (no fallback) but never validates the value, so a deployer who forgets
to rotate keeps the world-readable default — which is also published in the public Git history.
**Steps:** Sign a JWT with the literal secret; the server accepts it.
**Actual:** Anyone with read access to the repo can mint valid admin tokens.
**Expected:** Boot must abort if `JWT_SECRET` matches the placeholder OR is shorter than 32 bytes.
**Severity:** CRITICAL — CVSS 9.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)
**Module:** `techno-kol-ops/.env:18`, `techno-kol-ops/src/middleware/auth.ts:15`
**Fix:** Add `if (!process.env.JWT_SECRET || /change-this/.test(process.env.JWT_SECRET) || process.env.JWT_SECRET.length<32) { console.error('FATAL: weak JWT_SECRET'); process.exit(1); }`
in `index.ts` boot. Rotate the leaked secret and add `.env` to `.gitignore` (verify `git rm --cached`).

---

## HIGH

### SEC-313-005 — XSS via incomplete HTML escaping in 360 dashboards
**Description:** `web/po360.html:190` defines
`function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }`.
This only escapes `&` and `<` — it does NOT escape `>`, `"`, `'`, or backtick. All `innerHTML`
assignments using `esc(...)` (po360, customer360, supplier360, rfq360, quote360, entity360, etc.)
are vulnerable when escaped values are rendered inside attributes.
**Steps:**
1. Set `po.supplier_name = '" onclick="alert(1)" x="'`.
2. The header renders: `... class="badge ' + esc(po.supplier_name) + '"...` — payload escapes the
   attribute and binds an event handler.
**Actual:** Stored XSS triggers on every dashboard load.
**Expected:** Escape `& < > " '` and use `textContent` for non-HTML payloads.
**Severity:** HIGH — CVSS 8.0 (AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:N)
**Module:** `onyx-procurement/web/po360.html:190` and 8 other `*360.html` files
**Fix:** Replace `esc()` with the full 5-char map and migrate to `el.textContent = ...` wherever
HTML is not actually needed.

### SEC-313-006 — CORS allows credentials with wildcard origin
**Description:** `onyx-procurement/server.js:114-123` reads `ALLOWED_ORIGINS` defaulting to `*` and
sets `credentials: true`. When `ALLOWED_ORIGINS=*`, the cors middleware reflects the request origin
AND keeps `Access-Control-Allow-Credentials: true`. Browsers permit cross-origin reads of any
authenticated response.
**Steps:** Boot with default env. Run a malicious page that does
`fetch('https://onyx/api/invoices', { credentials:'include' })` — response is readable.
**Actual:** Any origin can read API responses with the user's API key cookie.
**Expected:** Refuse to start if `ALLOWED_ORIGINS=*` AND `NODE_ENV=production`. In dev, drop
`credentials:true` whenever the origin list is `*`.
**Severity:** HIGH — CVSS 7.5 (AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:N/A:N)
**Module:** `onyx-procurement/server.js:114-123`
**Fix:** `if (ALLOWED_ORIGINS.includes('*') && NODE_ENV==='production') process.exit(1);` and never
combine `origin: true` with `credentials: true`.

### SEC-313-007 — No CSRF protection on state-changing endpoints
**Description:** No `csurf`, `csrf-csrf`, or double-submit cookie middleware in any service. The
`requireAuth` middleware accepts the API key via either `X-API-Key` OR `Authorization: Bearer`
headers (`server.js:245`), but the cors layer allows credentialed cross-origin POSTs. A logged-in
operator visiting an attacker page can be tricked into firing an authenticated `POST /api/payments`.
**Steps:** Operator authenticates. Attacker page submits a hidden form to the API.
**Actual:** Unauthorized state mutations succeed (Express does not require a CSRF token).
**Expected:** Either require `Origin/Referer` matching an allow-list, or add a CSRF token in a
double-submit cookie pattern, or restrict mutations to a custom header (`X-Requested-With`)
that browsers will not let cross-origin forms set without CORS preflight.
**Severity:** HIGH — CVSS 7.1 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N)
**Module:** all `app.use('/api/', ...)` paths in `server.js`, `techno-kol-ops/src/middleware/`
**Fix:** Add an explicit `requireCustomHeader` middleware that 403s any mutating request lacking
`X-Requested-With: onyx-erp` AND with an `Origin` header outside the allow-list.

### SEC-313-008 — No transition CSP or X-Frame-Options (clickjacking)
**Description:** `server.js:109-112` initializes helmet with `contentSecurityPolicy: false` and
relies on default `X-Frame-Options`. The HTML 360 dashboards do **not** set `frame-ancestors`,
making them embeddable in third-party iframes for clickjacking against the action buttons.
**Steps:** Embed `https://onyx/web/po360.html` in `<iframe>` on attacker.com; overlay invisible
button → user click triggers `doAction('approve')`.
**Actual:** Approval action fires across origin boundary.
**Expected:** `Content-Security-Policy: frame-ancestors 'self'` header on every HTML response.
**Severity:** HIGH — CVSS 7.4 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N)
**Module:** `onyx-procurement/server.js:109-112`
**Fix:** `app.use(helmet({ contentSecurityPolicy:{ directives:{ 'frame-ancestors':[\"'self'\"] } } }))`.

### SEC-313-009 — Weak password hashing — pbkdf2 100k SHA-512 instead of argon2id/bcrypt
**Description:** `api-server/src/lib/auth.ts:60` and `admin-seed.ts:8` use
`crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512')`. PBKDF2-SHA512 with 100k iterations is
NIST-acceptable but trivially GPU-attackable compared to the OWASP-recommended argon2id (m=64MiB,
t=3) or bcrypt cost=12. For a financial ERP, hash-cracking tolerance must be measured in years,
not days.
**Severity:** HIGH — CVSS 7.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
**Module:** `api-server/src/lib/auth.ts:60-69`, `api-server/src/lib/admin-seed.ts:6-10`
**Fix:** `npm i argon2`, then `await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 })`.

### SEC-313-010 — Auth fallback to in-memory FALLBACK_USERS bypasses DB
**Description:** `api-server/src/lib/auth.ts:10-40` ships `_fallbackSessions` Map and a
`FALLBACK_USERS` array. If `isDbAlive()` returns false, the loginUser path uses these to mint a
session — which means an attacker who can DoS the DB connection can still log in as the hardcoded
`admin/admin123` or `kobiellkayam/KOBIE@307994798`.
**Severity:** HIGH — CVSS 8.0 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H)
**Module:** `api-server/src/lib/auth.ts:10-40`
**Fix:** Remove the fallback path in production builds (`if (NODE_ENV==='production') throw`).

### SEC-313-011 — Information disclosure: error.message leaked to clients
**Description:** `onyx-procurement/server.js:1578` returns `e.message` to the client in error
responses. Stack traces and DB error messages can reveal column names, file paths, and library
versions.
**Severity:** HIGH — CVSS 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)
**Module:** `onyx-procurement/server.js:1578`, multiple route handlers
**Fix:** In production, return only `{error:'Internal Server Error', traceId}` and log the real
error server-side keyed by `traceId`.

---

## MEDIUM

### SEC-313-012 — `app_secret = 'APP_SECRET_TEST'` default in WhatsApp client
**Description:** `onyx-procurement/src/comms/whatsapp.js:151` defaults `appSecret` to
`'APP_SECRET_TEST'`. If env not set, HMAC verification still succeeds with a publicly-known secret.
**Severity:** MEDIUM — CVSS 6.5
**Module:** `onyx-procurement/src/comms/whatsapp.js:151`
**Fix:** Throw at construction if `appSecret` not provided in production.

### SEC-313-013 — Watermark secret defaulting to known string
**Description:** `onyx-procurement/src/documents/watermark.js:397` uses
`opts.secret || 'techno-kol-uzi-watermark-v1'` — predictable HMAC key allows watermark forgery.
**Severity:** MEDIUM — CVSS 5.3
**Module:** `onyx-procurement/src/documents/watermark.js:397`
**Fix:** Read from `process.env.WATERMARK_HMAC_KEY`, fail closed if missing.

### SEC-313-014 — JWT verification accepts any algorithm in WebSocket
**Description:** `techno-kol-ops/src/realtime/websocket.ts:23` calls `jwt.verify` WITHOUT
`{ algorithms: ['HS256'] }`. An attacker can forge a token with `alg:'none'` or downgrade to a
weak alg recognized by the library.
**Severity:** MEDIUM — CVSS 6.5
**Module:** `techno-kol-ops/src/realtime/websocket.ts:23`
**Fix:** Always pass `{ algorithms:['HS256'], audience, issuer }`.

### SEC-313-015 — JWT not bound to audience/issuer
**Description:** `techno-kol-ops/src/middleware/auth.ts:15` calls `jwt.verify(token, secret, { algorithms:['HS256'] })` with no `audience` or `issuer`. Any token signed with the same secret —
even ones meant for a different microservice — is accepted.
**Severity:** MEDIUM — CVSS 5.4
**Module:** `techno-kol-ops/src/middleware/auth.ts:15`
**Fix:** `{ algorithms:['HS256'], audience:'techno-kol-ops', issuer:'kobi-erp' }`.

### SEC-313-016 — Tokens stored in `localStorage` (XSS-readable)
**Description:** `erp-app/src/store/auth.ts` and `erp-app/src/lib/utils.ts:19` post credentials
and persist the returned token to localStorage. Any XSS (see SEC-313-005) leaks the long-lived
token. Not httpOnly, not Secure, not SameSite.
**Severity:** MEDIUM — CVSS 6.1
**Module:** `erp-app/src/store/auth.ts`, `erp-app/src/lib/utils.ts:19`
**Fix:** Issue session via `Set-Cookie: HttpOnly; Secure; SameSite=Strict; Path=/`. Frontend
fetches with `credentials:'include'`.

### SEC-313-017 — Rate-limiting only on /api/ — webhooks/SSE unprotected
**Description:** `apiLimiter` is mounted on `/api/` but `/webhook/*` has a separate higher-limit
pool, and SSE/Realtime endpoints have no limiter at all (`/ws`, `/events`). An attacker can open
thousands of WebSocket connections to exhaust file descriptors.
**Severity:** MEDIUM — CVSS 5.3
**Module:** `onyx-procurement/server.js:131-148`
**Fix:** Add per-IP connection cap on the WS upgrade path; tarpit on >50 sockets/IP.

### SEC-313-018 — `dangerouslyDisableSandbox` patterns / inline event handlers in HTML
**Description:** `web/po360.html:316` builds tab markup with
`onclick="switchTab(\''+t.id+'\')"`. `t.id` flows from data without escaping single-quotes,
enabling JS injection if the data contains an apostrophe followed by a JS payload.
**Severity:** MEDIUM — CVSS 6.1
**Module:** `onyx-procurement/web/po360.html:316-317`, similar in entity360, customer360
**Fix:** Use `data-tab` attributes and `addEventListener` in JS instead of inline `onclick`.

### SEC-313-019 — Mass assignment: `pickFields` whitelist not enforced everywhere
**Description:** `server.js:616` uses `pickFields(req.body, SUPPLIER_FIELDS)` for update — good.
But `audit('updated', ..., JSON.stringify(req.body), ...)` logs the FULL body including any
attempted fields the attacker tried to set. Auditor learns nothing about what was filtered.
**Severity:** MEDIUM — CVSS 4.3
**Module:** `onyx-procurement/server.js:618`
**Fix:** Audit only the picked fields and log a separate WARN if any unexpected key was present.

### SEC-313-020 — No timing-safe comparison for API keys
**Description:** `server.js:246` does `!API_KEYS.includes(apiKey)`. `Array.includes` short-circuits
on first match, leaking timing information about valid prefixes. Not exploitable with random keys
but bad practice.
**Severity:** MEDIUM — CVSS 4.3
**Module:** `onyx-procurement/server.js:246`
**Fix:** Hash all keys at boot, use `crypto.timingSafeEqual` over hashes.

---

## LOW

### SEC-313-021 — Missing `Strict-Transport-Security` header
**Description:** Helmet defaults are in use but `hsts` is not explicitly configured.
**Severity:** LOW — CVSS 3.7
**Module:** `onyx-procurement/server.js:109`
**Fix:** `helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } })`.

### SEC-313-022 — Missing `Referrer-Policy: no-referrer`
**Severity:** LOW — CVSS 3.1
**Fix:** Helmet default is `no-referrer` — verify not overridden by `helmet({ ... })` shape.

### SEC-313-023 — `pickFields` uses object literal — prototype pollution risk
**Description:** Where `pickFields` shape is `{ name, ... }` and the input includes
`__proto__`, the resulting object can poison Object prototype during DB insert. Verify the helper
uses `Object.create(null)` as the accumulator.
**Severity:** LOW — CVSS 3.1
**Module:** `onyx-procurement/server.js` (helper not shown)
**Fix:** `const out = Object.create(null); for (k of allowed) if (k in src) out[k]=src[k];`.

### SEC-313-024 — `dotenv` loaded after process.env reads
**Description:** `server.js:55` requires `domain-events` BEFORE `require('dotenv').config()` at
line 52 — actually the order is dotenv first, but ensure no module accesses `process.env.*` at
require-time before dotenv runs. Already mostly OK.
**Severity:** LOW — CVSS 2.0
**Module:** `onyx-procurement/server.js:52-55`
**Fix:** Move `require('dotenv').config()` to the very top of `server.js`.

### SEC-313-025 — Audit logs stored alongside business data
**Description:** Audit table is in the same database/schema as business data. A single SQLi
(SEC-313-002) compromises audit trail integrity. CIS Controls 8.3 require append-only audit
storage with separate credentials.
**Severity:** LOW — CVSS 3.7
**Module:** Audit infrastructure (general)
**Fix:** Use a separate Postgres role with INSERT-only grant on audit tables.

---

## CROSS-REFERENCES

- **AGENT-13** (regression checklist) — flagged CORS open and missing helmet → confirmed in SEC-313-006/008.
- **AGENT-159** — already noted JWT non-null assertion in techno-kol-ops crashes on missing env.
  Combined with SEC-313-004 (default secret), the system either crashes or accepts the world-readable secret.
- **AGENT-270** — pentest plan flagged missing security headers; SEC-313-008/021/022 align.
- **AGENT-290** — encryption review noted no HSTS, no helmet → addressed here under SEC-313-021.
- **AGENT-295** — pentest report flagged hardcoded credentials in `paradigm_engine` and `tools.ts` —
  expanded here as SEC-313-001 with full evidence list.

---

## REMEDIATION PRIORITY

| # | Finding | Sev | Effort | Order |
|---|---------|-----|--------|-------|
| 1 | SEC-313-001 hardcoded admin123 | CRIT | S | Day 0 |
| 2 | SEC-313-004 default JWT_SECRET | CRIT | S | Day 0 |
| 3 | SEC-313-003 WS anonymous fall-through | CRIT | S | Day 1 |
| 4 | SEC-313-002 SQLi chatbot | CRIT | M | Day 1 |
| 5 | SEC-313-005 incomplete HTML escape | HIGH | M | Day 2-3 |
| 6 | SEC-313-006 CORS+credentials | HIGH | S | Day 2 |
| 7 | SEC-313-007 CSRF middleware | HIGH | M | Day 3-4 |
| 8 | SEC-313-009 argon2 migration | HIGH | M | Week 1 |
| 9 | SEC-313-010 fallback users prod gate | HIGH | S | Day 0 |
| 10 | SEC-313-011 error message leak | HIGH | S | Day 1 |
| 11-20 | Medium findings | MED | S-M | Week 1-2 |
| 21-25 | Low findings | LOW | S | Week 2-3 |

---

## EVIDENCE — KEY CODE LOCATIONS (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\lib\auth.ts:30-40` (FALLBACK_USERS, admin123)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\lib\admin-seed.ts:33-45` (Bootstrap admin123)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\chatbot\engine.js:669,691` (SQLi sink)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\realtime\websocket.ts:21-27` (anon fall-through)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\.env:18` (default JWT_SECRET)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\web\po360.html:190` (incomplete esc())
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\server.js:114-123` (CORS+credentials)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\comms\whatsapp.js:151` (default appSecret)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\documents\watermark.js:397` (default watermark key)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\kobi\tools.ts:2516` (admin123 in tooling)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\docs\merged\technokoluzi-erp\replit.md:27` (default creds in user docs)

---

## RECOMMENDED ARCHITECTURAL CHANGES

1. **Centralize auth on Supabase Auth** (already noted in QA-AGENT-43) — eliminates SEC-313-001/009/010/016.
2. **Move sessions to httpOnly+SameSite=Strict cookies** — closes XSS-token-theft (SEC-313-005, 016).
3. **Add a security gate in CI** that fails the build if `git grep` finds `admin123|change-this|APP_SECRET_TEST|techno-kol-uzi-watermark-v1` outside test fixtures.
4. **Add a boot-time secret-strength validator** (extends `scripts/validate-env.js`) that rejects
   default placeholder values and any secret <32 random bytes.
5. **Enforce CSP including `frame-ancestors 'self'` and `default-src 'self'`** even on RTL dashboards by extracting inline styles to a CSS file.
6. **Run `npm audit --omit=dev` in CI** and block merges on high/critical advisories.

---

## TEST COVERAGE GAPS

- No automated test for: SQLi via chatbot, CORS preflight allowlist, WebSocket anon rejection,
  CSRF on `/api/payments`, JWT alg=none rejection.
- Add `test/security/qa-313-*.test.js` mirroring each finding above.

---

**End of AGENT-313 Security Deep Audit**
**Total findings:** 25 (4 CRIT, 7 HIGH, 9 MED, 5 LOW)
**Production gate:** BLOCKED until SEC-313-001 through SEC-313-004 are remediated.
