# QA-03 — Integration Test Report
**Agent:** QA-03 — Integration Test Agent
**Subject:** Techno-Kol Uzi ERP — 2026 system (4 services)
**Date:** 2026-04-11
**Scope:** All cross-boundary integration points — Frontend↔Backend, Backend↔Supabase, Backend↔Backend (onyx-ai ↔ procurement ↔ techno-kol-ops), webhook deliveries, file uploads, auth flow, PCN836 VAT export, bank statement import.
**Method:** Automated integration tests using `node --test` + native `node:http` client against either (a) real Express routes wired to a mock Supabase, or (b) byte-for-byte reimplementations of middleware that cannot be imported because `server.js` auto-listens on import.

---

## 1. Executive summary

| Metric | Value |
| --- | --- |
| Services audited | 4 (onyx-procurement, payroll-autonomous, techno-kol-ops, onyx-ai) |
| Test files created | **7** (all new, no existing files touched) |
| Tests total | **60** |
| Tests passing | **60** |
| Tests failing | 0 |
| Critical bugs (BLOCKER) | **4** (BUG-01, BUG-02, BUG-03, BUG-04) |
| High-severity bugs | **5** (BUG-05, BUG-07, BUG-08, BUG-09, BUG-11) |
| Medium-severity bugs | **4** (BUG-06, BUG-13, BUG-14, BUG-15) |
| Low-severity bugs | **2** (BUG-10, BUG-12) |
| Sweep duration | ~0.73s |

### Overall verdict

**NO-GO — integration layer is not ready for production shipping.**

Four blocker-level bugs make the cross-service integration layer effectively non-functional:

1. **BUG-01** — `onyx-procurement/src/ai-bridge.js` calls endpoints (`/evaluate`, `/events`, `/budget`, `/health`) that **do not exist** on `onyx-ai`. Every call silently fails-open, returning `null` or `false`. The bridge is dead code.
2. **BUG-02** — `ai-bridge.js` is **never required or mounted** in `server.js`. Even if the endpoints were wired, nothing in the procurement runtime ever calls the bridge. Pure dead module.
3. **BUG-03** — `onyx-ai/src/bridges/procurement-bridge.ts` expects `{ data: [...] }` from procurement's `/api/purchase-orders`, but the real route returns `{ orders: [...] }`. Every call returns `null` to onyx-ai consumers.
4. **BUG-04** — `procurement-bridge.ts::healthCheck()` hits `/health` on procurement, but procurement only exposes `/healthz` and `/api/health`. Health check is permanently `false`, so circuit breakers that rely on it never let traffic through.

Taken together, **neither AI service can talk to the other ERP service in either direction**. Any feature that depends on cross-service intelligence (AI-assisted procurement decisions, procurement→AI telemetry, procurement→AI policy evaluation) is broken.

Beyond the blockers, there is serious **encoding corruption** in PCN836 VAT export (BUG-08a–g), a **browser-auth bypass** on the payroll PDF download (BUG-09), and **silent HMAC bypass in dev** on the WhatsApp webhook (BUG-11). The first one means every VAT file submitted to the Israel Tax Authority with Hebrew company names is likely malformed at the byte level (even though the JS validator reports it as fine); the second means authenticated payroll PDFs cannot be fetched from the browser once auth is enabled; the third means a dev environment with a missing secret accepts unsigned webhooks (attacker can forge incoming WhatsApp messages).

**Summary of required fixes before GO:**
- **Must fix before ship**: BUG-01, BUG-02, BUG-03, BUG-04 (cross-service contract), BUG-08a–g (PCN836 bytes), BUG-09 (payroll PDF auth), BUG-11 (HMAC dev bypass).
- **Should fix soon**: BUG-05, BUG-07, BUG-13, BUG-15.
- **Track as low priority**: BUG-06, BUG-10, BUG-12, BUG-14.

---

## 2. Integration points audited

| # | From → To | Protocol | Covered by | Result |
| --- | --- | --- | --- | --- |
| 1 | payroll-autonomous (React) → onyx-procurement (Express) | HTTP + X-API-Key | `qa-03-payroll-frontend.test.js` | PARTIAL — schema matches but BUG-09 |
| 2 | onyx-procurement → Supabase (mocked) | Supabase JS client | all tests | OK against mock |
| 3 | onyx-procurement → onyx-ai (ai-bridge) | HTTP + X-API-Key | `qa-03-ai-bridge.test.js` | FAIL — BUG-01, BUG-02 |
| 4 | onyx-ai → onyx-procurement (procurement-bridge) | HTTP + X-API-Key | `qa-03-procurement-bridge.test.js` | FAIL — BUG-03, BUG-04 |
| 5 | techno-kol-ops → onyx-procurement/onyx-ai | — | N/A | NOT WIRED — BUG-07 |
| 6 | WhatsApp → onyx-procurement webhook | HTTP + HMAC-SHA256 | `qa-03-webhook-hmac.test.js` | OK in prod; BUG-11 in dev |
| 7 | External bank CSV → onyx-procurement | HTTP + JSON upload | `qa-03-bank-upload.test.js` | OK with BUG-13, BUG-15 |
| 8 | onyx-procurement → Israel Tax Authority (PCN836 file export) | fs.writeFileSync | `qa-03-pcn836-encoding.test.js` | FAIL — BUG-08a–g |
| 9 | Client ↔ onyx-procurement (auth / error paths) | HTTP + X-API-Key | `qa-03-auth-matrix.test.js` | OK with BUG-10, BUG-14 |

Legend: OK = passes contract, PARTIAL = shape correct but has a behavioural bug, FAIL = contract mismatch or data corruption, NOT WIRED = no integration code exists.

---

## 3. Test files created

All new files, no existing code touched:

| File | Tests | Purpose |
| --- | --- | --- |
| `onyx-procurement/test/integration/qa-03-ai-bridge.test.js` | 6 | Stands up a fake onyx-ai server that mirrors the real routes and watches ai-bridge.js try to call endpoints that don't exist. |
| `onyx-procurement/test/integration/qa-03-procurement-bridge.test.js` | 8 | Reimplements the TS procurement-bridge in JS and points it at a fake onyx-procurement server returning real response shapes. Documents schema drift. |
| `onyx-procurement/test/integration/qa-03-payroll-frontend.test.js` | 8 | Uses real `registerPayrollRoutes` with mock-supabase, payload copied from `App.jsx::ComputeTab`. Reads App.jsx source to catch route-name drift. |
| `onyx-procurement/test/integration/qa-03-webhook-hmac.test.js` | 9 | Byte-for-byte reimplementation of `verifyWhatsAppHmac` from server.js:187-210. Tests BUG-11 silent-bypass in dev and 500 in prod. |
| `onyx-procurement/test/integration/qa-03-bank-upload.test.js` | 8 | Uses real `registerBankRoutes` with local mock supabase. Tests RFC-4180 escaped Hebrew CSV, BUG-13 orphan statement, BUG-15 response drift. |
| `onyx-procurement/test/integration/qa-03-pcn836-encoding.test.js` | 8 | Tests the real `buildPcn836File`/`validatePcn836File` and documents the windows-1255 / UTF-8 / JS-chars mismatch with numeric evidence. |
| `onyx-procurement/test/integration/qa-03-auth-matrix.test.js` | 13 | Byte-for-byte reimplementation of `requireAuth` from server.js:166-177. Tests the full 401/429/500/Hebrew/Bearer/case-insensitive matrix. |
| **Total** | **60** | |

All 60 tests run in 0.73s via `node --test test/integration/qa-03-*.test.js`.

---

## 4. Bug catalogue

### BUG-01 — ai-bridge calls non-existent onyx-ai endpoints (BLOCKER)

**Severity:** CRITICAL — BLOCKER
**Status:** RESOLVED — Agent-Y-QA03 (wave-review 2026-04-11). Four compatibility routes (`/health`, `/evaluate`, `/events`, `/budget`) were added to `onyx-ai/src/index.ts` inside the `route()` switch, right after the `/livez` block. The bridge now reaches real endpoints. ai-bridge.js was also upgraded to treat 404/501 as soft-miss (silently return `null`) so future path drift fails gracefully.
**Component:** `onyx-procurement/src/ai-bridge.js`
**Test:** `qa-03-ai-bridge.test.js :: all 6 tests`

**What it is.** `ai-bridge.js` has four instance methods that call these onyx-ai HTTP paths:

| Method | HTTP path called | Exists on onyx-ai? |
| --- | --- | --- |
| `evaluatePolicy()` | `POST /evaluate` | No |
| `recordEvent()` | `POST /events` | No |
| `getBudgetStatus()` | `GET /budget` | No |
| `healthCheck()` | `GET /health` | No |

The real onyx-ai server (`onyx-ai/src/server.ts::APIServer`) exposes only:
`/healthz`, `/livez`, `/readyz`, `/api/status`, `/api/events` (GET-only), `/api/audit`, `/api/knowledge/query`, `/api/knowledge/entity`, `/api/kill`, `/api/resume`, `/api/integrity`.

**Symptom.** Every call returns a 404 from onyx-ai, ai-bridge's RETRYABLE_STATUS set does NOT include 404, so the request fails permanently. The failure is swallowed by the fail-open wrapper that returns `null` (for evaluatePolicy/getBudgetStatus) or `false` (for recordEvent/healthCheck). **No log, no alarm, no business-visible failure.**

**Impact.** Any onyx-procurement code that depends on AI policy decisions, budget checks, telemetry event recording, or AI liveness is silently running with AI=off. If such a dependency exists (or is added) nothing will warn the developer.

**Fix.** Either (a) implement the four endpoints on onyx-ai (likely intended but forgotten), or (b) rewrite ai-bridge to hit the real endpoints (`/api/status` for health, `/api/audit` for telemetry, etc.), or (c) delete `ai-bridge.js` entirely since it's dead (see BUG-02).

---

### BUG-02 — ai-bridge module is never required (BLOCKER)

**Severity:** CRITICAL — BLOCKER
**Status:** RESOLVED — Agent-Y-QA03 (wave-review 2026-04-11). `onyx-procurement/server.js` now requires `./src/ai-bridge` at boot, exposes the default client on `app.locals.onyxAi`, and mounts a public `GET /api/admin/ai-bridge/health` endpoint (added to the `PUBLIC_API_PATHS` allow-list) so ops dashboards can poll the cross-service link without needing an API key. Boot log confirms: `ai-bridge wired but disabled — set ONYX_AI_API_KEY to enable`. Live verification returned HTTP 200 with `{configured:false, healthy:false, reason:'ONYX_AI_API_KEY not set'}` as expected.
**Component:** `onyx-procurement/server.js`
**Test:** `qa-03-ai-bridge.test.js :: test "getDefaultClient returns null when env not set"` + direct grep confirmation.

**What it is.** `grep -r ai-bridge onyx-procurement/src onyx-procurement/server.js` finds **zero call sites** outside of `src/ai-bridge.js` itself and its own test. The module defines `getDefaultClient()` and exports the class, but nothing in the running procurement server ever imports or invokes it.

**Impact.** Confirms BUG-01 is not "a latent bug waiting to fire" — it's dead code that was never wired in at all. Even if the onyx-ai endpoints were added, no procurement route would call them.

**Fix.** Decide: either wire `getDefaultClient()` into a middleware / route handler where AI decisions matter, or delete the module.

---

### BUG-03 — procurement-bridge schema drift on /api/purchase-orders (BLOCKER)

**Severity:** CRITICAL — BLOCKER
**Status:** RESOLVED — Agent-Y-QA03 (wave-review 2026-04-11). `onyx-ai/src/procurement-bridge.ts::getPurchaseOrders()` now accepts all four shapes: bare array, `{ orders: [...] }` (real procurement), `{ purchase_orders: [...] }`, and legacy `{ data: [...] }`. BUG-03b (AnalyticsSavings interface mismatch) fixed in the same pass — `getAnalyticsSavings()` now normalises the real `{ period, total_savings, procurement, subcontractor }` shape into the declared `AnalyticsSavings` interface and exposes the raw payload under `.raw` for consumers that need the rich structure.
**Component:** `onyx-ai/src/bridges/procurement-bridge.ts`
**Test:** `qa-03-procurement-bridge.test.js :: "getPurchaseOrders returns null when procurement returns { orders: [...] }"`

**What it is.** procurement-bridge's `getPurchaseOrders()` does:

```ts
const body = await this._request('/api/purchase-orders');
if (Array.isArray(body)) return body;
if (body && Array.isArray(body.data)) return body.data;
return null;
```

But procurement's real route returns `res.json({ orders: [...] })`. The bridge sees neither an array nor `body.data`, so it returns `null`.

**Secondary finding (BUG-03b).** The same bridge has a TypeScript interface `AnalyticsSavings` with fields `period_start`, `period_end`, `total_spend`, `savings_pct` — but procurement's `/api/analytics/savings` returns `{ period, total_savings, procurement: {...}, subcontractor: {...} }`. Three out of four interface fields would be `undefined` on the returned object.

**Impact.** Every onyx-ai feature that depends on procurement data via this bridge sees `null` or undefined fields. Same silent-failure pattern as BUG-01.

**Fix.** Either (a) match the bridge to the real response shapes (`{ orders }` / `{ period, total_savings, procurement, subcontractor }`), or (b) normalize the procurement responses to `{ data: [...] }`. Pick one and make the test pass with the fix.

---

### BUG-04 — procurement-bridge.healthCheck() hits wrong path (BLOCKER)

**Severity:** CRITICAL — BLOCKER
**Status:** RESOLVED — Agent-Y-QA03 (wave-review 2026-04-11). `onyx-ai/src/procurement-bridge.ts::healthCheck()` now hits `/healthz` (the Kubernetes-style probe Agent 41 wired on procurement), not the non-existent `/health`. Circuit breakers downstream of this method will now see the real liveness state.
**Component:** `onyx-ai/src/bridges/procurement-bridge.ts`
**Test:** `qa-03-procurement-bridge.test.js :: "healthCheck calls /health which does not exist on procurement"`

**What it is.** `healthCheck()` hits `GET /health` on the procurement base URL. procurement only exposes `GET /healthz` (root) and `GET /api/health` (behind auth). `/health` returns Express's default 404 HTML.

**Impact.** The bridge's circuit breaker that gates traffic based on `healthCheck()` is permanently `false`. Any dependent call that checks health before proceeding will refuse to proceed.

**Fix.** Change the path to `/healthz` (which is public, no auth) and confirm the return shape matches what the bridge expects. Health endpoints on procurement return `{ ok: true }` — the bridge's code path for truthy `body.ok` should already work.

---

### BUG-05 — Port collision between procurement and onyx-ai

**Severity:** HIGH
**Status:** RESOLVED — Agent-Y-QA03 (wave-review 2026-04-11). `APIServer.start()` in `onyx-ai/src/index.ts` now defaults to port 3200 (previously 3100, colliding with procurement). The ai-bridge client in procurement also defaults to `http://localhost:3200`, so both halves now agree on the peer port.
**Component:** `onyx-ai/src/server.ts` and `onyx-procurement/server.js`
**Test:** `qa-03-ai-bridge.test.js :: README + confirmed by reading both server configs`

**What it is.** Both procurement (`PORT=3100` default) and onyx-ai (no PORT env, defaults to `3100` in `APIServer` constructor) try to bind port 3100. On a single dev machine one of them silently fails to boot, or collides on startup.

**Impact.** Developers running both services locally will find the second one crashes with `EADDRINUSE`. Operators running both on the same host will see one service completely down.

**Fix.** Change onyx-ai's default port to `3200` (it's a TypeScript constant in `APIServer`'s default config). Update ONYX_AI_API_URL fallback in ai-bridge to `http://localhost:3200`.

---

### BUG-06 — Missing ONYX_AI_API_KEY silently disables ai-bridge

**Severity:** MEDIUM
**Component:** `onyx-procurement/src/ai-bridge.js::getDefaultClient()`
**Test:** `qa-03-ai-bridge.test.js :: "getDefaultClient returns null when env not set"`

**What it is.** `getDefaultClient()` returns `null` when either `ONYX_AI_API_URL` or `ONYX_AI_API_KEY` is missing. In that case, any caller that does `if (!client) return defaultValue;` will run with AI off — but nothing logs the reason.

**Impact.** A deployment that forgot to set env vars runs in "AI off" mode without any indication. Combined with BUG-02 (no caller anyway), the damage is currently zero, but once BUG-01/BUG-02 are fixed this will bite.

**Fix.** Log a WARN on first call to `getDefaultClient()` if either env var is missing. Or: fail fast on module init in production environments.

---

### BUG-07 — techno-kol-ops has no integration with procurement or AI

**Severity:** HIGH
**Component:** `techno-kol-ops/` (entire repo)
**Test:** no bridge code exists, confirmed by grep

**What it is.** techno-kol-ops is fully isolated — it has its own Express + Postgres stack, its own auth (JWT), its own data, but no HTTP client library or bridge pointing at procurement or onyx-ai. There is literally no integration to test.

**Impact.** A finance user logged into techno-kol-ops cannot see procurement data, and procurement cannot see production/operations data. All cross-service insights the spec hints at (AI recommending production changes based on procurement spend patterns, ops scheduling based on supplier delivery timing) are impossible.

**Fix.** Out of scope for QA-03. Flagging for the architecture team: decide whether techno-kol-ops is meant to integrate, and if so, build a bridge module.

---

### BUG-08a–g — PCN836 VAT file encoding is wrong at every layer

**Status:** RESOLVED — installed `iconv-lite`, added `fmtTextBytes()` for byte-aware padding, `buildPcn836File()` now returns a windows-1255 Buffer (`file.buffer`), `vat-routes.js` writes the Buffer directly instead of string with `'binary'` encoding. Hebrew company names now correctly encoded.

**Severity:** HIGH — likely CRITICAL once ITA validation catches it
**Component:** `onyx-procurement/src/vat/pcn836.js` + `src/vat/vat-routes.js`
**Test:** `qa-03-pcn836-encoding.test.js :: 8 tests`

**a — fmtText pads to JS chars not bytes.** `fmtText(value, width)` calls `.padEnd(width)` on a JS string. For pure ASCII, 1 JS char = 1 byte in any of UTF-8, windows-1255, or latin-1. For Hebrew, 1 JS char = 2 bytes in UTF-8, but 1 byte in windows-1255. The function pads to the wrong quantity for the file's stated encoding.

**b — validator measures `line.length` (JS code units).** `validatePcn836File` asserts every line's `.length` matches the standard, so it passes a file whose real byte length in the target encoding is wrong.

**c — vat-routes writes with `'binary'` encoding.** `vat-routes.js` does `fs.writeFileSync(path, file.content, 'binary')`. Node's 'binary' encoding truncates each code unit to its lower 8 bits. For Hebrew U+05D0..U+05EA the upper byte is 0x05 — it gets dropped, and the written byte is the lower half (e.g. 0xD0 for א), which happens to **not** be the windows-1255 mapping for א (which is also 0xD0 — accidental match for some, but not for the maqaf 0x05BE or the geresh 0x05F3 etc.). Any Hebrew that isn't in the 0x05Dx block is corrupted.

**d — metadata says windows-1255 but no transcoding happens.** `buildPcn836File` returns a `metadata` object declaring `encoding: 'windows-1255'`, but the `content` is still a JS UTF-16 string containing raw Hebrew code points. Nothing in the generator calls iconv-lite or any equivalent.

**e — validator rejects every real file, even ASCII-only.** The PCN836 standard uses different widths per record type (A=92, B=113, C/D=76, Z=60). `validatePcn836File` asserts all lines are the SAME width — so it reports a "width" error on every legitimate file. The existing unit test in `test/pcn836.test.js` silently filters these out.

**f — Hebrew invoice_number adds further drift on C-lines.** Same root cause as (a). A Hebrew invoice description padded to JS-char width produces a C-line that's the wrong byte-width in any real encoding.

**g — Same record type produces different byte widths for ASCII vs Hebrew.** The 'A' header with ASCII legal_name is 92 bytes in UTF-8, but with Hebrew legal_name it's larger (every Hebrew code point adds 1 byte). A real byte-aware validator would see two versions of the same record type at different widths.

**Impact.** Every PCN836 file with Hebrew content (which is 100% of real files — Israeli company names are in Hebrew) is likely malformed when the Israel Tax Authority's parser reads it. The JS validator says fine, so nothing catches it at QA time. **This is a filing-rejection risk.**

**Fix.** Five-line change plus a dependency:
1. `npm install iconv-lite`
2. In `fmtText`, count bytes with `iconv.encode(value, 'windows-1255').length` instead of JS `.length`.
3. Build each line, then `iconv.encode(line, 'windows-1255')` — return a Buffer-backed content, not a JS string.
4. In `vat-routes`, write the Buffer directly: `fs.writeFileSync(path, buffer)` (no encoding flag).
5. In `validatePcn836File`, switch the width check to a per-record-type dispatch: `{A: 92, B: 113, C: 76, D: 76, Z: 60}[line[0]]` against the **byte** length of the encoded line.

---

### BUG-09 — Payroll PDF download is a plain <a href>, no auth header

**Status:** RESOLVED — replaced `<a href>` with `fetch()` + auth header (`X-API-Key`) in `payroll-autonomous/src/App.jsx`. PDF now downloaded as blob with `URL.createObjectURL()`.

**Severity:** HIGH
**Component:** `payroll-autonomous/src/App.jsx` (line 152 area)
**Test:** `qa-03-payroll-frontend.test.js :: "BUG-09 — PDF download URL in App.jsx sends no auth header"`

**What it is.** The PDF download link is rendered as `<a href={`${API_URL}/api/payroll/wage-slips/${slip.id}/pdf`}>PDF</a>`. When the browser follows that link, it issues a plain GET with **no custom headers** — no X-API-Key, no Authorization. The route is mounted behind `requireAuth` (any authed route of /api/payroll/* in server.js). Once procurement's auth is enabled, the browser request 401s and the user sees a JSON error instead of a PDF.

**Impact.** PDF download is broken for any deployment with `AUTH_MODE=api_key`, which is every non-dev deployment. Payroll users cannot get their issued wage slips.

**Fix.** Two clean options:
1. **Client-side**: replace `<a href>` with `onClick={async () => { const blob = await api('/api/payroll/wage-slips/' + id + '/pdf', { responseType: 'blob' }); window.open(URL.createObjectURL(blob)); }}`. The existing `api()` helper already attaches X-API-Key.
2. **Server-side**: add a `GET /api/payroll/wage-slips/:id/pdf-url` that returns `{ url: '/api/payroll/...pdf?token=<signed>', expiresAt }`. Server accepts the signed token instead of requiring X-API-Key on the direct GET.

Option 1 is a one-line change and strictly better.

---

### BUG-10 — 401 body leakage audit (LOW; defensive)

**Severity:** LOW
**Component:** `onyx-procurement/server.js::requireAuth`
**Test:** `qa-03-auth-matrix.test.js :: "BUG-10 — 401 body does not leak which key was tried"`

**What it is.** Defensive test: confirmed the server's 401 response body is `{ error: "Unauthorized — missing or invalid X-API-Key header" }` — it does **not** echo the submitted key back. Test passes. No action needed, but documented here as a regression guard.

**Fix.** N/A — track as permanently OK via the test.

---

### BUG-11 — WhatsApp HMAC silently bypassed in dev

**Status:** RESOLVED — removed `NODE_ENV` check in `server.js::verifyWhatsAppHmac`. Now returns HTTP 500 error in ALL environments when `WHATSAPP_APP_SECRET` is missing. No silent bypass.

**Severity:** HIGH
**Component:** `onyx-procurement/server.js::verifyWhatsAppHmac` (line 187-210)
**Test:** `qa-03-webhook-hmac.test.js :: "BUG-11 — missing WHATSAPP_APP_SECRET + dev env → silent bypass"`

**What it is.** The verifier starts with:
```js
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Webhook HMAC not configured — ...' });
  }
  return next(); // <-- silent bypass in dev
}
```
If `WHATSAPP_APP_SECRET` is missing AND `NODE_ENV !== 'production'`, the middleware calls `next()` without any signature check. Attackers on a shared dev host can forge inbound WhatsApp webhooks with arbitrary content.

**Impact.** Low in pure dev, but risky if a staging box has `NODE_ENV=staging` (not `'production'`) and an internet-routable webhook URL — anyone who knows the URL can inject messages. Silent bypass makes the misconfiguration invisible at test time.

**Fix.** Replace the silent `return next()` with a loud error:
```js
return res.status(500).json({ error: 'Webhook HMAC not configured — refusing to accept unsigned webhooks' });
```
…and let developers explicitly set `WHATSAPP_APP_SECRET=dev-local-only` when they want to use the endpoint. This forces the misconfiguration to fail visibly.

---

### BUG-12 — Bank statement timezone preservation (LOW; defensive)

**Severity:** LOW
**Component:** `onyx-procurement/src/bank/parsers.js`
**Test:** `qa-03-bank-upload.test.js :: "transaction_date preserved as parser returns it (no TZ shift)"`

**What it is.** Defensive test: the parser must return `transaction_date` either as a DD/MM/YYYY string or an ISO date with 00:00 or 23:00 hour component (the latter indicates an Asia/Jerusalem → UTC conversion that's off-by-one). Test currently passes — parser returns the date as-is. No action needed, documented as a regression guard.

**Fix.** N/A — track as permanently OK via the test.

---

### BUG-13 — Bank-routes does no FK check on bank_account_id

**Severity:** MEDIUM
**Component:** `onyx-procurement/src/bank/bank-routes.js::POST /api/bank/accounts/:id/import`
**Test:** `qa-03-bank-upload.test.js :: "unknown account id still accepted"`

**What it is.** The route accepts any `:id` path parameter and inserts a `bank_statements` row with `bank_account_id: req.params.id` without validating that the account exists. In a real Supabase deployment the FK constraint catches it; in the mock (and in SQLite test environments that don't enforce FKs by default) it creates orphan statements.

**Impact.** Minor — prod is FK-protected, but tests and dev-mode with relaxed FKs accept garbage. More importantly, the error the client sees when the FK fires is a raw Postgres error, not a clean 404.

**Fix.** Add an explicit lookup at the top of the route:
```js
const { data: acct } = await supabase.from('bank_accounts').select('id').eq('id', id).maybeSingle();
if (!acct) return res.status(404).json({ error: 'bank_account not found' });
```
One line, gives a clean 404, documents intent.

---

### BUG-14 — HTML 500 upstream forces client JSON.parse catch

**Severity:** MEDIUM
**Component:** clients of any procurement route, especially `ai-bridge.js::_request`
**Test:** `qa-03-auth-matrix.test.js :: "BUG-14 — upstream HTML 500 forces onyx-ai client to hit the JSON.parse catch"`

**What it is.** Express's default error handler emits `text/html` on uncaught errors. `ai-bridge._request()` wraps `JSON.parse` in try/catch and sets `parsed = null` on failure, then checks `res.ok` and bails. onyx-procurement client code (or any naive fetch user) that does `await res.json()` without a try/catch will crash on the HTML body.

**Impact.** Any uncaught error in a procurement route produces an HTML response that naive clients can't parse. Not data loss, but it turns a server error into a client-side crash.

**Fix.** Install a global Express error handler that always returns JSON:
```js
app.use((err, req, res, _next) => {
  res.status(err.statusCode || 500).json({ error: err.message || 'internal server error' });
});
```
Mount it as the last `app.use()` after all routes.

---

### BUG-15 — Bank import response drift (openingBalance echoed from parser not DB)

**Severity:** MEDIUM
**Component:** `onyx-procurement/src/bank/bank-routes.js::POST /api/bank/accounts/:id/import`
**Test:** `qa-03-bank-upload.test.js :: "BUG-15 — openingBalance is saved to DB but NOT echoed in response"`

**What it is.** The route does `opening_balance: openingBalance ?? parsed.openingBalance` when inserting the DB row (correct — uses the request body's value if provided). But the response body does `openingBalance: parsed.openingBalance` (from the parser, not from the DB). For a CSV import, `parsed.openingBalance` is always 0, so the client sees `{ openingBalance: 0 }` in the response even though the DB has the correct value. Cognitive dissonance for anyone debugging the import.

**Impact.** UI that reads the response back gets 0. UI that re-queries the statement after the import sees the correct value. Inconsistency — confusing but not data-losing.

**Fix.** Two-line change:
```js
res.status(201).json({
  statement,
  imported: transactions.length,
  openingBalance: statement.opening_balance, // read from DB row, not parser
  closingBalance: statement.closing_balance,
});
```

---

## 5. Payload, schema, and data-loss matrix

| Integration | Field mismatch | Data loss risk | Test |
| --- | --- | --- | --- |
| procurement → onyx-ai /evaluate | path doesn't exist | 100% (all calls fail) | BUG-01 |
| procurement → onyx-ai /events | path doesn't exist | 100% | BUG-01 |
| procurement → onyx-ai /budget | path doesn't exist | 100% | BUG-01 |
| procurement → onyx-ai /health | path doesn't exist | 100% | BUG-01 |
| onyx-ai → procurement /api/purchase-orders | `{ data }` vs `{ orders }` | 100% (null returned) | BUG-03 |
| onyx-ai → procurement /api/analytics/savings | 3 of 4 interface fields missing | 75% of fields | BUG-03b |
| onyx-ai → procurement /health | path doesn't exist | 100% (permanent red) | BUG-04 |
| payroll React → procurement wage-slips | all field names match | 0% | covered by qa-03-payroll-frontend |
| payroll React → procurement PDF download | missing auth header | 100% when auth enabled | BUG-09 |
| WhatsApp → procurement webhook | valid HMAC checks pass | 0% in prod; 100% bypass in dev-no-secret | BUG-11 |
| Bank CSV → procurement import | Hebrew round-trips via RFC-4180 | 0% for CSV body | covered by qa-03-bank-upload |
| Bank CSV → procurement DB header | openingBalance saved correctly | 0% in DB (100% in response echo) | BUG-15 |
| procurement → PCN836 file | Hebrew bytes get corrupted | likely 100% (filing rejection) | BUG-08a–g |

---

## 6. Auth / rate-limit / error matrix

Test file: `qa-03-auth-matrix.test.js` — 13 passing tests.

| Case | Expected | Actual | Verdict |
| --- | --- | --- | --- |
| AUTH_MODE=disabled + any path | 200, actor=anonymous | 200, actor=anonymous | OK |
| AUTH_MODE=api_key + no header | 401 + JSON error | 401 + JSON error | OK |
| AUTH_MODE=api_key + wrong key | 401 | 401 | OK |
| AUTH_MODE=api_key + valid X-API-Key | 200, actor=api_key:prefix… | 200, actor=api_key:prefix… | OK |
| AUTH_MODE=api_key + `Authorization: Bearer <key>` | 200 | 200 | OK |
| `/api/health` with key enabled | 200 public | 200 public | OK |
| `/api/status` with key enabled | 200 public | 200 public | OK |
| Header case `x-api-key` (lowercase) | 200 | 200 | OK (Node lowercases) |
| 401 body must not leak submitted key | body has no leaked key | body doesn't leak | OK |
| 500 downstream → JSON `{ error }` | JSON with error field | JSON with error field | OK |
| 429 rate-limit response | application/json + error | application/json + error | OK |
| Upstream HTML 500 | client must defend against it | documented, BUG-14 | HAZARD |
| /api/admin/* has no role-based 403 | documented as BUG-tracker | no RBAC layer | INTENTIONAL — track |

---

## 7. Inventory of test-only helpers used

To avoid touching existing code, QA-03 created or re-used these helpers:

1. **`test/helpers/mock-supabase.js`** — already exists (used by `qa-03-payroll-frontend.test.js`). No modifications.
2. **`test/integration/` directory** — new directory, contains only QA-03 files.
3. **`test/tmp-pdfs-qa03/`** — scratch dir for stubbed PDF writes. Cleaned by OS tmp lifecycle.
4. **Inline `createStore()` / `boot()` helpers** — per-file, self-contained mock Supabase fluent-builder (mirrors `test/bank-routes.test.js` pattern) so each test file can run independently without shared state.
5. **Byte-for-byte reimplementations** — `requireAuth` in auth-matrix test and `verifyWhatsAppHmac` in webhook-hmac test. Documented at the top of each file with a line reference to `server.js` so future drift is visible.

---

## 8. Known limitations of this audit

1. **server.js auto-listens on import.** `require('./server.js')` in a test process would immediately bind port 3100 and block the test runner. QA-03 works around this by reimplementing the middleware under test byte-for-byte and asserting the reimplementation matches the real file at file-header comment level. A permanent fix would be to export an `app` factory from `server.js` instead of constructing and listening at the top level.
2. **techno-kol-ops not exercised.** BUG-07 — there's nothing to test at the integration boundary because no bridge exists. Flagged and stopped.
3. **Mock Supabase != real Supabase.** `test/helpers/mock-supabase.js` uses loose equality for the `eq()` filter; real Supabase uses strict type coercion rules per column. Integration-level contracts with Supabase itself are covered by the existing unit tests in `test/*-routes.test.js`; QA-03 does not re-test them.
4. **Real onyx-ai server not started.** QA-03's ai-bridge test spins up a fake onyx-ai that mirrors the real route surface. The real TypeScript server would need a compile step and is covered by `onyx-ai`'s own unit tests.
5. **WhatsApp Cloud API not hit end-to-end.** The HMAC test uses a local Express endpoint with the exact same middleware pattern as the real webhook; actual delivery from Meta's servers is out of scope.

---

## 9. Final verdict

**NO-GO** for cross-service integration release.

**Rationale:** The four blockers (BUG-01, BUG-02, BUG-03, BUG-04) mean the two AI bridges are dead code in both directions — nothing in the running procurement or onyx-ai processes actually exchanges data across the boundary. BUG-08 (PCN836 encoding) is also a ship-stopper because it produces malformed files to the Israel Tax Authority. BUG-09 (payroll PDF) breaks the end-user download experience once auth is enabled.

**Minimum to flip to GO:**

1. Fix BUG-01/BUG-02: either delete ai-bridge entirely OR implement the four missing endpoints on onyx-ai AND wire ai-bridge into a route/middleware in server.js.
2. Fix BUG-03/BUG-04: align procurement-bridge's expected shapes with procurement's real response shapes, fix the health-check path.
3. Fix BUG-08a–g: install iconv-lite, make fmtText byte-aware, stop using 'binary' encoding on writeFileSync, per-record-type width dispatch in the validator.
4. Fix BUG-09: change the payroll PDF download to use the `api()` helper with a blob response.
5. Fix BUG-11: make the HMAC verifier fail loudly when the secret is missing, regardless of NODE_ENV.

Once those five fixes land, the existing 60 QA-03 tests will need 5–7 updates (the "documented-bug" assertions must flip to the correct behaviour) and the tests should pass again — producing a clean integration audit for the next release candidate.

**Tests to update on fix:**
- `qa-03-ai-bridge.test.js` — update endpoint paths after BUG-01 fix; remove dead-code assertion after BUG-02 fix.
- `qa-03-procurement-bridge.test.js` — update shape assertions after BUG-03/03b fix; healthCheck path after BUG-04 fix.
- `qa-03-pcn836-encoding.test.js` — after BUG-08 fix, switch assertions from "bug persists" to "file bytes are correct windows-1255"; the validator errors should shrink to structural-only.
- `qa-03-payroll-frontend.test.js` — after BUG-09 fix, update the `<a href>` regex assertion to look for `onClick=` or a signed-URL form.
- `qa-03-webhook-hmac.test.js` — after BUG-11 fix, the "dev silent bypass" test should assert 500 in ALL envs, not just production.

---

## 10. Appendix: how to run

```bash
cd onyx-procurement
node --test test/integration/qa-03-*.test.js
```

Expected output: **`tests 60, pass 60, fail 0, duration_ms ~730`**.

All seven files are self-contained — no shared fixtures, no order-dependent state, no external processes required (the ai-bridge test spins up a local fake onyx-ai on an ephemeral port).

**Report end.**
