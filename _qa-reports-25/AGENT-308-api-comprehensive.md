# AGENT-308 — API Comprehensive QA Report

**Agent:** 308 (API Test Agent)
**Date:** 2026-04-29
**Scope:** All HTTP endpoints across the 4 services (ONYX_PROCUREMENT 3100, TECHNO_KOL_OPS 3200, PAYROLL 5173, ONYX_AI 3300)
**Method:** Static analysis of Express route handlers — request validation, status codes, response shapes, auth, error handling, schema consistency.
**Files inspected (highlights):**
- `onyx-procurement/server.js` (1838 lines, ~38 top-level routes + sub-routers via `registerVatRoutes`/`registerBankRoutes`/`registerPayrollRoutes`/`registerEnterpriseRoutes`/`registerAnnualTaxRoutes`)
- `techno-kol-ops/dist/routes/*.js` (21 route files, JWT-auth via `authenticate` middleware)
- `techno-kol-ops/dist/middleware/auth.js`

---

## Executive summary

| Severity | Count |
|---|---|
| Critical | 5 |
| High | 9 |
| Medium | 8 |
| Low | 5 |
| **Total** | **27** |

The API surface is functional but inconsistent. Two services use **two different auth schemes** (X-API-Key on ONYX, Bearer JWT on OPS) with no shared session model. Response envelopes drift between endpoints (`{suppliers}`, `{orders}`, `[]`, `{rows}`). Many handlers swallow DB errors as generic 500s, hiding root cause from clients. Several mutating endpoints have no input validation beyond a single `name`-required check, and several mutating routes are missing RBAC guards.

---

## CRITICAL findings

### BUG-308-01 — Auth bypass possible when `AUTH_MODE=disabled` outside production
**Module:** `onyx-procurement/server.js:237-256`, `:215-221`
**Description:** When `API_KEYS` env var is empty, `AUTH_MODE` defaults to `'disabled'`. In that mode every `/api/*` request is granted `req.user = { role: 'owner' }` — i.e. the **god-mode** RBAC role that satisfies every `requirePermission(...)` check in the codebase. The hard-stop on line 218 only fires in `NODE_ENV=production`. Dev, staging, demo, and CI deployments are wide open by default.
**Steps to reproduce:**
1. Start server with no `API_KEYS` and `NODE_ENV != production`.
2. `curl -X POST http://localhost:3100/api/purchase-orders/123/approve -d '{}'` — no headers.
**Actual:** 200 OK, PO transitions to approved, audit log records actor `'anonymous'`.
**Expected:** 401 in any non-developer environment, or at minimum a loud banner + opt-in flag (`ALLOW_ANON=true`).
**Severity:** Critical
**Fix:** Tighten the gate to `NODE_ENV !== 'development'` *and* require an explicit `ONYX_ALLOW_ANON=true` opt-in. Never grant `owner` role to anonymous; downgrade to a read-only `viewer` role.

### BUG-308-02 — `requirePermission` not enforced on supplier mutation endpoints
**Module:** `onyx-procurement/server.js:605, 614, 623`
**Description:** `POST /api/suppliers`, `PATCH /api/suppliers/:id`, `POST /api/suppliers/:id/products` accept any authenticated request — no `requirePermission('suppliers:create' | 'suppliers:update')` middleware. Compare to `POST /api/rfq/send` which gates correctly with `requirePermission('purchase-orders:create')`. RBAC roles are wired but unenforced for the supplier domain.
**Steps:** Authenticate as a `viewer` (read-only role): `curl -H "X-API-Key: $VIEWER_KEY" -X POST /api/suppliers -d '{"name":"X"}'`.
**Actual:** 201 Created.
**Expected:** 403 Forbidden.
**Severity:** Critical
**Fix:** Add `requirePermission('suppliers:create')` / `'suppliers:update'` to all three handlers. Same pattern for `POST /api/purchase-requests` (line 652), `POST /api/quotes` (line 852), `POST /api/subcontractors` (line 1400), `PUT /api/subcontractors/:id/pricing` (line 1414).

### BUG-308-03 — `PUT /api/subcontractors/:id/pricing` has no RBAC and accepts unsigned numbers (fraud vector)
**Module:** `onyx-procurement/server.js:1414-1429`
**Description:** Comment on line 1413 explicitly says `// Set pricing — CRITICAL AUDIT: fraud vector if unlogged` yet the handler:
1. Has no `requirePermission(...)` middleware.
2. Accepts `percentage_rate` / `price_per_sqm` / `minimum_price` with **no numeric range validation** — negatives, NaN, or absurdly large values are upserted directly. A fraudulent operator could set `percentage_rate=-50` and the `costByPct` calculation in `/decide` (line 1453) would produce negative cost.
3. No `req.actor` resolution from auth — `audit(...)` falls back to `'api'` regardless of who made the call.
**Steps:** `curl -X PUT /api/subcontractors/X/pricing -d '{"work_type":"electric","percentage_rate":-99,"price_per_sqm":-1000}'`.
**Actual:** 200, pricing saved as negative.
**Expected:** 400 with `validation: percentage_rate must be 0..100`.
**Severity:** Critical
**Fix:** (a) Add `requirePermission('suppliers:update')`; (b) numeric guards (`0 <= pct <= 100`, `price_per_sqm > 0`, `minimum_price >= 0`); (c) require `work_type` from a known enum.

### BUG-308-04 — JWT secret used unconditionally; missing secret yields server crash, not 500
**Module:** `techno-kol-ops/dist/middleware/auth.js:16`
**Description:** `jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })` is called with no boot-time check that `JWT_SECRET` exists. If the env var is missing, `jwt.verify` throws synchronously inside the try, which the catch swallows and returns 401 *for every request including a valid-looking one*. There is no startup fail-fast (compare with ONYX which validates `SUPABASE_*` at boot, line 84-94).
**Steps:** Start `techno-kol-ops` without `JWT_SECRET`, send a valid token.
**Actual:** Every request → 401 Invalid token. No log line, no warning, ops thinks tokens are bad.
**Expected:** Refuse to boot if `JWT_SECRET` is missing.
**Severity:** Critical
**Fix:** Add boot-time `if (!process.env.JWT_SECRET) { console.error('JWT_SECRET required'); process.exit(1); }` and emit a startup banner showing JWT alg + secret length (never the secret itself).

### BUG-308-05 — Static dashboard mount serves any file in `web/` (no path traversal guard verified)
**Module:** `onyx-procurement/server.js:339-345`
**Description:** `app.use(express.static(WEB_DIR, { index: 'index.html', extensions: ['html'], fallthrough: true, maxAge: '5m' }))` is mounted *before* `requireAuth`. Any HTML/JS/JSON sitting under `onyx-procurement/web/` (including dev artefacts checked in by accident) is publicly served. If `web/` ever contains a backup like `web/.env.bak` or `web/secrets.json`, it is reachable unauthenticated. There is no `dotfiles: 'deny'` option — Express defaults to `'ignore'` which lets `.env`-style files through if explicitly requested.
**Steps:** `ls onyx-procurement/web/`, then `curl http://host:3100/<any-file-name>`.
**Actual:** File served, 5-minute cache.
**Expected:** Allow only known asset extensions.
**Severity:** Critical (data-leak class)
**Fix:** Pass `dotfiles: 'deny'` and a strict `index: ['index.html']` allow-list, or move the static dir under `/static/` so it cannot collide with API paths.

---

## HIGH findings

### BUG-308-06 — `POST /api/purchase-requests` skips required-field validation on items
**Module:** `onyx-procurement/server.js:652-673`
**Description:** Only `requested_by` is validated. `items[]` is inserted with `await supabase.from('purchase_request_items').insert(itemsWithRequestId)` — if any item lacks `name`/`quantity`/`unit`/`category` the DB returns the failure but the parent request is **already created and committed** (no transaction). Result: orphan request with zero or partial items, status `new`, never matched by `/api/rfq/send` because category is missing.
**Severity:** High
**Fix:** Validate each item against a schema (zod/joi), wrap both inserts in a Postgres function or Supabase RPC for atomicity, or roll the request back if items insert fails.

### BUG-308-07 — `POST /api/quotes` returns 400 with raw Postgres error.message, leaking schema
**Module:** `onyx-procurement/server.js:891`
**Description:** `if (error) return res.status(400).json({ error: error.message });` — the Supabase error message often includes column names and constraint identifiers (e.g. `null value in column "supplier_id" of relation "supplier_quotes" violates not-null constraint`). This is repeated in `POST /api/suppliers`, `PATCH /api/suppliers/:id`, `POST /api/subcontractors`, and `PUT /api/subcontractors/:id/pricing`.
**Severity:** High (information disclosure)
**Fix:** Map known error codes (`23502 not_null`, `23505 unique`, `23503 fk`) to safe, user-facing strings; only include raw `.message` in `NODE_ENV !== 'production'`.

### BUG-308-08 — `POST /api/quotes` has no authentication-derived `created_by`; allows arbitrary `supplier_id`
**Module:** `onyx-procurement/server.js:852-940`
**Description:** Quote insert spreads `...quoteData` directly with no field allowlist (contrast with `SUPPLIER_FIELDS` allowlist on line 602). A caller can pass arbitrary columns including `subtotal`, `total_with_vat`, `vat_amount` — bypassing the calculation logic the server just performed three lines earlier. Mass-assignment risk.
**Severity:** High
**Fix:** Use `pickFields(req.body, QUOTE_FIELDS)` like the supplier handler. The fields the server computes (`subtotal`, `vat_amount`, `total_with_vat`) must be **excluded** from the allowlist.

### BUG-308-09 — `GET /api/audit` ignores entity-scoped filters and exposes full audit log
**Module:** `onyx-procurement/server.js:1650-1654`
**Description:** Endpoint accepts only `?limit=` and returns every audit entry regardless of caller's role. Any authenticated user — `viewer` included — sees admin actions, financial mutations, supplier deletions, and the actor strings. RBAC says `audit:read` should be restricted but the route has no `requirePermission`.
**Severity:** High (privilege escalation pre-cursor — viewer learns who has admin)
**Fix:** Add `requirePermission('audit:read')`; accept `?entity_type=&entity_id=` filters; redact `previous_value`/`new_value` for callers who lack `audit:read:full`.

### BUG-308-10 — `POST /api/purchase-orders/:id/send` returns 502 but DB state is `send_failed` — no retry hint
**Module:** `onyx-procurement/server.js:1382-1387`
**Description:** When WhatsApp send fails the server writes `status='send_failed'` and returns 502 with `{ sent:false, error, message }`. There is no `retry_after`, no idempotency key, no correlation ID. Clients calling this twice in a row will produce two `send_failed` rows and two state-history entries because there's no de-dup, and the second call may succeed and silently overwrite the first failure record.
**Severity:** High
**Fix:** Honour `Idempotency-Key` request header; compare request hash before re-attempting; return `Retry-After` header with the configured backoff window.

### BUG-308-11 — `GET /api/admin/users` (`techno-kol-ops/dist/routes/admin.js:34`) exposes full user array including emails to any caller
**Module:** `techno-kol-ops/dist/routes/admin.js:34-36`
**Description:** Comment on line 6 says “Requires authentication + admin role (enforced at mount in index.ts)” — this is fragile. If the route file is ever mounted directly (test harness, dev-only path), every user record (including `lastLogin`, role, status) is exposed to any authenticated caller. There is no defense-in-depth check inside the handler.
**Severity:** High
**Fix:** Add `router.use(requireAdmin)` inside the file itself so the guard cannot be lost in mount refactors.

### BUG-308-12 — `POST /api/admin/users` accepts arbitrary `role` from request body
**Module:** `techno-kol-ops/dist/routes/admin.js:38-59`
**Description:** Line 51: `role: role || 'viewer'`. There is no enum check — caller can pass `role: 'admin'` or `role: 'owner'` (or even `role: 'whatever'` which the front-end will then quietly trust). Combined with the missing in-handler admin check above, this is a privilege-escalation chain.
**Severity:** High
**Fix:** Validate against `['admin', 'manager', 'accountant', 'field_worker', 'viewer']` enum; reject unknown values with 400.

### BUG-308-13 — In-memory user store loses state on every redeploy
**Module:** `techno-kol-ops/dist/routes/admin.js:10-16`
**Description:** Hard-coded `users` array is the source of truth. Any user created via `POST /api/admin/users` is gone on the next process restart. `pushAuditEntry` likewise truncates after 100 entries (line 30-31) — auditors will not believe this is a real audit trail.
**Severity:** High (compliance risk for an ERP that boasts SOC-grade RBAC)
**Fix:** Replace with the same Postgres-backed users + audit_log tables ONYX uses.

### BUG-308-14 — `POST /api/financials` has no validation on `type`, `amount`, `date`
**Module:** `techno-kol-ops/dist/routes/financials.js:85-97`
**Description:** Inserts `type`, `category`, `amount`, `date` directly with no checks. Negative amounts, future dates, `type='qwerty'` all succeed and pollute downstream `summary` aggregations (line 16-25 filters by `type IN ('income','advance','expense','material_cost','salary')` so junk types are dropped — but they remain in the table forever, and the front-end sees them in `GET /api/financials`).
**Severity:** High
**Fix:** Validate `type` against the same enum used in the SUM filter; reject negative amounts unless type is `refund`/`reversal`; reject dates more than 1 year in the future.

---

## MEDIUM findings

### BUG-308-15 — Inconsistent response envelopes across the same service
**Module:** `onyx-procurement/server.js` (multiple)
**Description:**
- `GET /api/suppliers` → `{ suppliers: [...] }` (line 584)
- `GET /api/purchase-orders` → `{ orders: [...] }` (line 1203)
- `GET /api/audit` → `{ entries: [...] }` (line 1653)
- `GET /api/analytics/spend-by-category` → `{ categories: [...] }` (line 1642)
- `GET /api/admin/users` (techno-kol-ops) → bare array `[...]` (line 35)
- `GET /api/employees` (techno-kol-ops) → bare array (line 27)
A unified client cannot pick a single shape. Pagination metadata (`total`, `next_cursor`) is absent everywhere.
**Severity:** Medium
**Fix:** Standardise on `{ data: [...], total, page, limit, next_cursor? }`.

### BUG-308-16 — `GET /api/suppliers/:id` returns 404 only when supplier missing, but silently returns nulls elsewhere
**Module:** `onyx-procurement/server.js:588-594`
**Description:** If `supplier_products` or `price_history` queries error out (network blip, RLS), the code uses `data: products = undefined` without checking `error`. Response is `{ supplier, products: null, priceHistory: null }` with 200. Client cannot tell partial failure from empty result.
**Severity:** Medium
**Fix:** Check `error` on each subquery; if any fail, return 502 `{ error, partial: true, supplier }`.

### BUG-308-17 — `GET /api/rfq/:id` returns 200 with `rfq: null` instead of 404 when RFQ missing
**Module:** `onyx-procurement/server.js:834-839`
**Description:** No null check after `.single()`. Client gets `{ rfq: null, recipients: [], quotes: [] }`. Same issue exists on `GET /api/purchase-orders/:id` (line 1206).
**Severity:** Medium
**Fix:** `if (!rfq) return res.status(404).json({ error: 'RFQ not found' });`.

### BUG-308-18 — `POST /api/rfq/send` does not require `purchase_request_id` to be a valid UUID
**Module:** `onyx-procurement/server.js:688-697`
**Description:** Pass `purchase_request_id: 'haha'` and Supabase returns a Postgres `invalid input syntax for type uuid` error. The handler's `if (!request) return 404` line never runs because Supabase rejected the query before — but the actual code path returns the destructured `data` as undefined and proceeds to `request.purchase_request_items` which throws TypeError → caught by global handler as 500.
**Severity:** Medium (wrong status code 500 instead of 400)
**Fix:** UUID-validate at the edge with a regex or `z.string().uuid()`.

### BUG-308-19 — `POST /api/rfq/:id/decide` weight normalization swallows `NaN`
**Module:** `onyx-procurement/server.js:967-983`
**Description:** `clamp = v => Math.max(0, Math.min(1, parseFloat(v) || 0))` — if a caller sends `price_weight: "abc"`, parseFloat returns NaN, `|| 0` makes it 0. Combined with default fallbacks (0.50/0.15/0.20/0.15), the silent zero distorts the weighted score *without telling the caller*. The 400 on `weightSum === 0` only fires when *all* four are bad.
**Severity:** Medium
**Fix:** Reject 400 on any non-numeric weight; require weights either all-present or all-absent.

### BUG-308-20 — `GET /api/analytics/spend-by-category` does an in-memory aggregation that scales O(N) on the table
**Module:** `onyx-procurement/server.js:1632-1643`
**Description:** Loads every `po_line_items` row into memory. With 100k+ line items this is multi-MB JSON over the wire from Supabase before aggregation. No `LIMIT`, no SQL `GROUP BY`. Same anti-pattern in `GET /api/analytics/savings` (line 1603-1621).
**Severity:** Medium (performance)
**Fix:** Use a Postgres view or Supabase RPC that GROUP BYs server-side.

### BUG-308-21 — Webhook verification token compared with `===`, not `crypto.timingSafeEqual`
**Module:** `onyx-procurement/server.js:1667`
**Description:** Verification challenge endpoint compares `token === process.env.WHATSAPP_VERIFY_TOKEN`. This is a string compare → susceptible to timing attacks. The signed-payload path (line 396-405) correctly uses `timingSafeEqual`. Inconsistent.
**Severity:** Medium
**Fix:** Convert both sides to Buffer of equal length; use `crypto.timingSafeEqual`.

### BUG-308-22 — `POST /api/notifications` (techno-kol-ops) lacks auth middleware in the file
**Module:** `techno-kol-ops/dist/routes/notifications.js:1-9`
**Description:** No `router.use(authenticate)` at the top of the file (compare to `clients.js:7`, `employees.js:7` etc which all do). The cross-service notification injected by ONYX (`X-Internal-Service: onyx-procurement`, see `onyx-procurement/server.js:40`) is the intended caller, but **anyone on the internal network** can also POST and any recipient sees it.
**Severity:** Medium
**Fix:** Either gate on `authenticate` and have ONYX mint a service-to-service JWT, or check `X-Internal-Service` against an allow-list HMAC.

---

## LOW findings

### BUG-308-23 — Health endpoints duplicate work
**Modules:** `onyx-procurement/server.js:1717, 1730, 1739, 1743, 559`
**Description:** `/api/status`, `/api/health`, `/healthz`, `/livez`, `/readyz` all exist. Three return slightly different shapes (`{status:'ok'}` vs `{ok:true}` vs `{ready:true}`). Pick one canonical readiness probe and document the others as aliases.
**Severity:** Low
**Fix:** Document in `/api/status` response which endpoint is canonical for which use case (k8s liveness vs ops dashboard).

### BUG-308-24 — `GET /api/admin/audit-log` returns `auditLog.slice(0, 100)` regardless of caller
**Module:** `techno-kol-ops/dist/routes/admin.js:87-89`
**Description:** No pagination, no filtering, no caller-scoped redaction. 100 hard-cap is also a silent ceiling — auditors who request "all events from last quarter" get only the most recent 100.
**Severity:** Low
**Fix:** Add `?from=&to=&entityType=&user=` filters, return `total` count.

### BUG-308-25 — `GET /api/financials` (techno-kol-ops) hard-coded `LIMIT 200`, no pagination params
**Module:** `techno-kol-ops/dist/routes/financials.js:69-83`
**Description:** Compare to `GET /api/clients` which honours `?limit=&offset=` (line 11-12). Inconsistency makes a UI grid with infinite-scroll impossible against this endpoint.
**Severity:** Low

### BUG-308-26 — `POST /api/employees` (techno-kol-ops) returns 500 with `err.message` from Postgres
**Module:** `techno-kol-ops/dist/routes/employees.js:80`
**Description:** Comment says "Failed to create employee" but the actual line returns the upstream error in production. Same pattern as 308-07 in OPS service.
**Severity:** Low (information disclosure)

### BUG-308-27 — `GET /api/work-orders` (techno-kol-ops) builds SQL with template-literal `WHERE` clauses dynamically
**Module:** `techno-kol-ops/dist/routes/workOrders.js:14-44`
**Description:** Although values are parameterised correctly, the construction style (`sql += '...'`) is harder to audit and one missed parameterisation would be a SQL-injection pit. Move to a query builder (e.g. `kysely`, `pg-promise`) or static prepared statements with optional clauses.
**Severity:** Low (defense-in-depth)

---

## Cross-cutting issues

1. **Atomicity** — Multiple endpoints write to 2-3 tables with no transaction wrapper. Examples: `POST /api/purchase-requests`, `POST /api/quotes`, `POST /api/rfq/:id/decide` (creates RFQ status update, PO row, line items, decision row, supplier stats — all separate Supabase calls). Any partial failure leaves the database in a torn state.
2. **Idempotency** — No `Idempotency-Key` header support anywhere. Mutation endpoints will double-write on client retries (mobile network blips, browser back-button).
3. **Schema validation** — Only one route uses an explicit field allowlist (`SUPPLIER_FIELDS`). Every other mutation is mass-assignment-prone. Adopt zod/joi at the edge.
4. **Pagination** — `GET /api/clients` and `GET /api/employees` take `limit/offset`. Almost no other list endpoint does. Standardise across the codebase.
5. **Error contract** — Decide between `{ error: string }` and `{ error: { code, message, details } }` and apply uniformly. The legacy form makes `code: 'INVALID_TRANSITION'` (line 1220) inconsistent with the rest of the API.
6. **CORS** — `ALLOWED_ORIGINS` defaults to `'*'` (line 114). In production this is risky combined with `credentials: true` (line 120) — `Access-Control-Allow-Credentials: true` plus wildcard origin is a browser security violation. Browsers will reject, but the server should also fail-fast.
7. **Logging hygiene** — Several `console.warn` calls embed `error.message` from Supabase including SQL fragments. Run logs through a redactor (`pino-redact` or similar) before shipping to log aggregation.

---

## Coverage notes

- I did **not** open the routers registered via `registerVatRoutes`, `registerBankRoutes`, `registerPayrollRoutes`, `registerAnnualTaxRoutes`, `registerEnterpriseRoutes` — they are loaded dynamically (server.js:1534-1561, 1764-1769) and may add another 50-100 endpoints. A follow-up pass should enumerate them.
- The deferred sibling-mount routes (`/ops`, `/payroll`, `/ai`) are static-only at the procurement edge; their actual API surfaces live in the respective microservices and need their own audit (see existing `_qa-reports-25/AGENT-03/04/05-runtime-*.md`).
- Webhook signature behaviour was verified by code-read only — runtime fuzzing with truncated/extra-padded HMACs is recommended.
- The 4 services share a `packages/shared-audit` package; signature consistency between them was not verified here.

---

## Suggested next agents

- **Agent 309** — Property-based fuzzer against the 38 routes catalogued above (using `fast-check` or `schemathesis`) for body-shape resilience.
- **Agent 310** — RBAC matrix audit: enumerate each `requirePermission` call and verify it matches the role registry in `src/auth/rbac.js`.
- **Agent 311** — Atomicity audit: every multi-table mutation should be a single Supabase RPC with `BEGIN/COMMIT`.
- **Agent 312** — Sub-router enumeration: VAT, payroll, bank, annual-tax, and enterprise routes were not opened.
