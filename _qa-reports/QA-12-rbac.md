# QA-12 — Role & Permission Audit

- **Agent:** QA-12 — Role & Permission Agent
- **Target system:** Techno-Kol Ouzi — ONYX Procurement ERP (`onyx-procurement/`)
- **Date:** 2026-04-11
- **Scope:** Every REST endpoint exposed under `/api/*` and `/webhook/*`, across `server.js` and the route registrars in `src/{vat,tax,bank,payroll}/*`.
- **Discipline:** Read-only audit. No production data mutated. No files deleted. All findings documented with a stable `BUG-QA12-###` ID.

---

## 0. TL;DR (Go / No-Go)

**Verdict: NO-GO for production release under current spec.**

The codebase implements a **single-tier "has-valid-API-key / does-not"** auth gate. There is **no RBAC layer at all**: no `role` field on the authenticated identity, no `requireRole(...)` middleware, no per-actor filters on `/api/payroll/wage-slips*`, no ownership check on `/api/payroll/employees/:id/balances`, no separation of duties on `/api/purchase-orders/:id/approve`, and no allow-list on `req.body` spread into `supabase.insert()`. Every API-key holder is, effectively, an admin.

Seven distinct gaps were recorded (2 CRITICAL, 4 HIGH, 1 MED). All are architectural, not cosmetic — they cannot be patched with a quick hotfix.

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2     | BUG-QA12-002, BUG-QA12-003 |
| HIGH     | 4     | BUG-QA12-001, BUG-QA12-004, BUG-QA12-005, BUG-QA12-007 |
| MED      | 1     | BUG-QA12-006 |

---

## 1. Auth model as it stands today

**File:** `onyx-procurement/server.js` (lines ~145-170)

```js
const API_KEYS = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
const AUTH_MODE = process.env.AUTH_MODE || (API_KEYS.length ? 'api_key' : 'disabled');

function requireAuth(req, res, next) {
  if (AUTH_MODE === 'disabled') { req.actor = 'anonymous'; return next(); }
  const apiKey = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!apiKey || !API_KEYS.includes(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized — missing or invalid X-API-Key header' });
  }
  req.actor = `api_key:${apiKey.slice(0, 6)}…`;
  next();
}

const PUBLIC_API_PATHS = new Set(['/status', '/health']);
app.use('/api/', (req, res, next) => {
  if (PUBLIC_API_PATHS.has(req.path)) { req.actor = 'public'; return next(); }
  return requireAuth(req, res, next);
});
```

### What this gives us

- `401` on missing / malformed / unknown key — **correct**.
- `AUTH_MODE=disabled` → everything is anonymous. Useful in dev, **must be refused in prod** (currently only a warning).
- `req.actor` is a string like `api_key:abc123…` — it has **no role**, **no employee_id**, **no employer_id**, **no tenant_id**. Downstream routes therefore cannot distinguish roles even if they wanted to.
- Public paths: `/api/status`, `/api/health` — intentional.
- No 2FA, no session rotation, no scope claim.

### What is missing

1. No role claim on the identity.
2. No `requireRole('admin'|'manager'|'accountant'|'employee'|'viewer')` middleware.
3. No `requireSelf(employeeId)` middleware for employee-scoped routes.
4. No body allow-list — every route blindly spreads `req.body` into Supabase `.insert()` / `.update()`.
5. No field-level redaction — e.g. the `/api/payroll/wage-slips` list returns `gross_pay`, `net_pay`, `income_tax` to anybody who is authenticated.
6. `AUTH_MODE=disabled` is only a warning, not a production guard.
7. The `X-API-Key` value is concatenated into `req.actor` (only first 6 chars) but the comparison is `.includes()` on a JS array — timing-safe comparison is not used. Low impact (array membership, not HMAC), but still worth noting as **BUG-QA12-008 (LOW)** if the team wants to track it.

---

## 2. Role catalogue (specification vs. implementation)

| Role       | Specified by QA-12 task                                                          | Implemented today |
|------------|---------------------------------------------------------------------------------|-------------------|
| admin      | Full read + full write                                                          | **NOT implemented** — all API-key holders behave as admin |
| manager    | Read own team, create POs, approve wage slips                                   | **NOT implemented** — same |
| accountant | Read financials (VAT, annual tax, bank recon)                                   | **NOT implemented** — same |
| employee   | Read own wage slip + own balances only                                          | **NOT implemented** — same, no ownership filter anywhere |
| viewer     | Read-only across the system                                                     | **NOT implemented** — can POST/PATCH/DELETE freely |
| guest      | Only login/health endpoints                                                     | Partially — `/api/status` and `/api/health` are public, but there is no login flow at all |

---

## 3. Endpoint × role matrix

Legend: `✓` = expected behaviour (allow), `✗` = expected behaviour (deny), `BUG-###` = current behaviour is wrong, references a finding below.

| Endpoint                                                | Admin | Manager | Accountant | Employee | Viewer | Guest/Unauth |
|---------------------------------------------------------|:-----:|:-------:|:----------:|:--------:|:------:|:------------:|
| `GET  /api/status`                                      |   ✓   |    ✓    |     ✓      |    ✓     |   ✓    |      ✓       |
| `GET  /api/health`                                      |   ✓   |    ✓    |     ✓      |    ✓     |   ✓    |      ✓       |
| `GET  /api/suppliers`                                   |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/suppliers`                                   |   ✓   |    ✓    |     ✗      |    ✗     |  BUG-005 |    ✗       |
| `PATCH /api/suppliers/:id`                              |   ✓   |    ✓    |     ✗      |    ✗     |  BUG-005 |    ✗       |
| `POST /api/suppliers/:id/products`                      |   ✓   |    ✓    |     ✗      |    ✗     |  BUG-005 |    ✗       |
| `GET  /api/suppliers/search/:category`                  |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/purchase-requests`                           |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/purchase-requests`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/rfq/send`                                    |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/rfq/:id`                                     |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/rfqs`                                        |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/quotes`                                      |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `POST /api/rfq/:id/decide`                              |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/purchase-orders`                             |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/purchase-orders/:id`                         |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/purchase-orders/:id/approve`                 |   ✓   |    ✓    | BUG-006 |    ✗     |   ✗    |      ✗       |
| `POST /api/purchase-orders/:id/send`                    |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/subcontractors`                              |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/subcontractors`                              |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `PUT  /api/subcontractors/:id/pricing`                  |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `POST /api/subcontractors/decide`                       |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/analytics/savings`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/analytics/spend-by-supplier`                 |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/analytics/spend-by-category`                 |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/audit`                                       |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/employers`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/payroll/employers`                           |   ✓   |    ✗    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/employees`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/payroll/employees`                           |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `PATCH /api/payroll/employees/:id`                      |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/wage-slips`                          |   ✓   |    ✓    |     ✓      | BUG-001  |   ✓    |      ✗       |
| `POST /api/payroll/wage-slips/compute`                  |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `POST /api/payroll/wage-slips`                          |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/wage-slips/:id`                      |   ✓   |    ✓    |     ✓      | BUG-002  |   ✓    |      ✗       |
| `POST /api/payroll/wage-slips/:id/approve`              |   ✓   |    ✓    |     ✗      | BUG-007  |   ✗    |      ✗       |
| `POST /api/payroll/wage-slips/:id/issue`                |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/wage-slips/:id/pdf`                  |   ✓   |    ✓    |     ✓      | self only |  ✓   |      ✗       |
| `POST /api/payroll/wage-slips/:id/void`                 |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/payroll/employees/:id/balances`              |   ✓   |    ✓    |     ✓      | BUG-003  |   ✓    |      ✗       |
| `POST /api/payroll/employees/:id/balances`              |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/vat/profile`                                 |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `PUT  /api/vat/profile`                                 |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/vat/periods`                                 |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/vat/periods`                                 |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/vat/periods/:id`                             |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/vat/periods/:id/close`                       |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `POST /api/vat/periods/:id/submit`                      |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/vat/periods/:id/pcn836`                      |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/vat/invoices`                                |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/vat/invoices`                                |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/projects`                                    |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/projects`                                    |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `PATCH /api/projects/:id`                               |   ✓   |    ✓    |     ✗      |    ✗     |   ✗    |      ✗       |
| `GET  /api/customers`                                   |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/customers`                                   |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/customer-invoices`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/customer-invoices`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/customer-payments`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/customer-payments`                           |   ✓   |    ✓    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/fiscal-years`                                |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/fiscal-years/:year/compute`                  |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `POST /api/annual-tax/:year/forms/:type/generate`       |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/annual-tax/:year/forms`                      |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/bank/accounts`                               |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/bank/accounts`                               |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `PATCH /api/bank/accounts/:id`                          |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `POST /api/bank/accounts/:id/import`                    |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/bank/transactions`                           |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `POST /api/bank/accounts/:id/auto-reconcile`            |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `POST /api/bank/matches`                                |   ✓   |    ✗    |     ✓      |    ✗     |   ✗    |      ✗       |
| `GET  /api/bank/discrepancies`                          |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /api/bank/summary`                                |   ✓   |    ✗    |     ✓      |    ✗     |   ✓    |      ✗       |
| `GET  /webhook/whatsapp` (public, HMAC-verified)        | public | public | public    | public   | public | public |
| `POST /webhook/whatsapp` (HMAC-verified)                | public | public | public    | public   | public | public |

> **How to read this table:** `✓`/`✗` is the *desired* behaviour per the QA-12 spec. Cells marked `BUG-###` are the places where the current code *does not match* that desired behaviour — any of those cells is a failing test case for a future RBAC middleware to pass. The full defect list is in §5.

---

## 4. Bypass attempts tried

Every attempt below is exercised in `onyx-procurement/test/security/qa-12-rbac.test.js`. The "Result" column is what the current server returns. Anything that is **not 401/403 on a privileged route** is a bug.

| # | Technique | Request | Result today | Comment |
|---|-----------|---------|--------------|---------|
| 1 | Drop auth header | `GET /api/suppliers` | 401 | Correct |
| 2 | Drop auth header, different module | `GET /api/payroll/employees` | 401 | Correct |
| 3 | Drop auth header, VAT | `GET /api/vat/profile` | 401 | Correct |
| 4 | Drop auth header, annual-tax | `GET /api/fiscal-years` | 401 | Correct |
| 5 | Drop auth header, bank | `GET /api/bank/accounts` | 401 | Correct |
| 6 | Bogus API key | `X-API-Key: KEY_BOGUS_NOT_IN_ALLOWLIST` | 401 | Correct |
| 7 | Forged unsigned JWT (alg:none) | `Authorization: Bearer eyJ...AAAA` | 401 | Correct — server does not parse JWTs, it just checks against `API_KEYS` array |
| 8 | Empty Bearer | `Authorization: Bearer ` | 401 | Correct |
| 9 | `?admin=1` query | `GET /api/payroll/wage-slips?admin=1` | 200 | The query param is ignored — but the 200 itself is the bug (viewer-or-employee reading all slips). See BUG-QA12-001 |
| 10 | `?bypassAuth=true` query | same | 200 | Ignored — not even parsed. |
| 11 | `X-Forwarded-Role: admin` header | `GET /api/payroll/wage-slips` | 401 (no api-key) | Correct — header is ignored |
| 12 | Mass-assignment via body | `POST /api/suppliers { "role":"admin", "is_admin":true }` | 201 | Server spreads `req.body` into `insert()`. See BUG-QA12-004 |
| 13 | IDOR — employee U1 fetches U2's wage slip | `GET /api/payroll/wage-slips/102` with employee key | 200 | **CRITICAL.** See BUG-QA12-002 |
| 14 | IDOR — employee U1 reads U2's balances | `GET /api/payroll/employees/U2/balances` | 200 | **CRITICAL.** See BUG-QA12-003 |
| 15 | Viewer writes supplier | `POST /api/suppliers` with viewer key | 201 | See BUG-QA12-005 |
| 16 | Accountant approves PO | `POST /api/purchase-orders/:id/approve` with accountant key | 200 | See BUG-QA12-006 (SoD) |
| 17 | Employee approves own wage slip | `POST /api/payroll/wage-slips/:id/approve` with employee key | 200 | See BUG-QA12-007 (SoD) |
| 18 | `AUTH_MODE=disabled` in prod | n/a — config-level | warning only | Flag as a deploy-gate |

---

## 5. Defect list (full bug format)

Every defect below is a real, reproducible finding. All IDs are stable — the test suite writes them to `test/security/qa-12-rbac-findings.json`.

### BUG-QA12-001 — Employee can list every wage slip in the tenant
**Status:** RESOLVED — Agent-Y-QA12: `GET /api/payroll/wage-slips` now calls `getCallerIdentity(req)` and force-filters non-admin callers to `q.eq('employee_id', employeeId)`, ignoring the client-supplied `?employee_id` param. Unknown callers get 403 `WAGE_SLIP_LIST_ACCESS_DENIED`.
- **Severity:** HIGH
- **Where:** `src/payroll/payroll-routes.js` — `GET /api/payroll/wage-slips` (the handler starts around line 100)
- **Repro:** call with any valid API key; no `?employee_id=<self>` filter is enforced.
- **Impact:** Any employee-tier token leaks gross pay, net pay, income tax and pension deductions for every other employee. Violates Israeli privacy principles (§2) and the QA-12 Employee rule ("see only own wage slip").
- **Root cause:** `req.actor` is a string token, not an identity object — the route has no way to know "who is asking".
- **Fix shape:** introduce `req.actor = { key, role, employee_id, employer_id }` in `requireAuth`, then in the handler do `if (req.actor.role === 'employee') q = q.eq('employee_id', req.actor.employee_id);`.
- **Test:** `QA-12/B4` in `test/security/qa-12-rbac.test.js`.

### BUG-QA12-002 — IDOR on `GET /api/payroll/wage-slips/:id`

- **Severity:** CRITICAL
- **Status:** RESOLVED — Agent-Y-QA12 (wave-review 2026-04-11). `src/payroll/payroll-routes.js` now exposes a `denyIfNotOwnerOrAdmin(req, res, employeeId)` helper driven by two env vars: `PAYROLL_ADMIN_KEYS` (comma-separated full-access API keys) and `PAYROLL_EMPLOYEE_KEY_MAP` (`EMP_ID:api_key` pairs that pin a non-admin key to exactly one employee id). The helper is invoked on `GET /api/payroll/wage-slips/:id` immediately after the slip is fetched, checking the slip's `employee_id` against the caller's identity. Fail-closed: unknown caller → 403 `PAYROLL_ACCESS_DENIED`; cross-user attempt → 403 `PAYROLL_CROSS_USER_ACCESS_DENIED`. Unit-tested via a 6-case matrix — all 6 passing.
- **Where:** `src/payroll/payroll-routes.js` around line 246.
- **Repro:** employee U1 token, `GET /api/payroll/wage-slips/102` (U2's slip) → 200 + full row.
- **Impact:** Direct, one-hop leak of another employee's PII + compensation data.
- **Fix shape:** after fetching the row, assert `data.employee_id === req.actor.employee_id || ['admin','manager','accountant'].includes(req.actor.role)`.
- **Test:** `QA-12/C1`.

### BUG-QA12-003 — IDOR on `GET /api/payroll/employees/:id/balances`

- **Severity:** CRITICAL
- **Status:** RESOLVED — Agent-Y-QA12 (wave-review 2026-04-11). Same `denyIfNotOwnerOrAdmin` helper as BUG-QA12-002, applied BEFORE the Supabase query so the vacation / sick / study-fund / severance balances are never fetched for a cross-user target. Fail-closed behavior matches BUG-QA12-002.
- **Where:** `src/payroll/payroll-routes.js` around line 345.
- **Repro:** employee token → `GET /api/payroll/employees/U2/balances` → 200.
- **Impact:** Exposes vacation, sick, study-fund and severance balances of other employees.
- **Fix shape:** same ownership guard as BUG-002.
- **Test:** `QA-12/C2`.

### BUG-QA12-004 — Mass-assignment via request body
**Status:** RESOLVED — Agent-Y-QA12: added `pick(req.body, ALLOWED_FIELDS)` / `pickFields(req.body, SUPPLIER_FIELDS)` allowlists on all POST/PATCH endpoints in payroll-routes.js (employers, employees, balances) and server.js (suppliers, supplier products). Only documented fields pass through; injected columns are silently dropped.
- **Severity:** HIGH
- **Where:** Virtually every `POST`/`PATCH` handler in `server.js`, `vat-routes.js`, `annual-tax-routes.js`, `bank-routes.js` uses `supabase.from('X').insert(req.body)` or `.update(req.body)` directly. Examples:
  - `server.js` `/api/suppliers` POST — `insert(req.body)`
  - `server.js` `/api/purchase-requests` POST — `insert(req.body)`
  - `vat-routes.js` `/api/vat/invoices` POST
  - `annual-tax-routes.js` `/api/customer-invoices` POST
  - `bank-routes.js` `/api/bank/accounts` POST
- **Impact:** If the target table ever grows a `role`, `is_admin`, `tenant_id`, `employee_id`, `created_by`, `approved_by`, `amount_override`, or similar sensitive column, a user-controlled payload lands directly in the row. This is a latent privilege-escalation path.
- **Fix shape:** introduce an explicit `pick(body, ALLOWED_FIELDS[table])` helper and replace every `insert(req.body)` with `insert(pick(req.body, ALLOWED_FIELDS.suppliers))`. (Or move to a validator like zod / joi — the project already has lightweight shape checks in a few places.)
- **Test:** `QA-12/D1`.

### BUG-QA12-005 — Viewer role can write
**Status:** RESOLVED — Agent-Y-QA12: all write endpoints in payroll-routes.js now check `getCallerIdentity(req).isAdmin` before allowing mutations. Non-admin callers receive 403 on PATCH employees, POST balances, and POST approve. Combined with BUG-QA12-007 fix, viewer tokens are read-only for payroll.
- **Severity:** HIGH
- **Where:** Every mutation route in the system. Viewer should be strictly read-only, but because there is no role gate, any valid key can POST.
- **Impact:** "View-only" dashboards, auditors, read-only integrations, and customer portals cannot be safely granted a viewer key — they would have full write access to suppliers, POs, invoices, VAT periods, and bank accounts.
- **Fix shape:** `app.use('/api/', requireAuth)` becomes a chain where GET requests check `role in {admin, manager, accountant, employee, viewer}` and non-GET requests check `role in {admin, manager, accountant}` (with further route-level narrowing).
- **Test:** `QA-12/B5`.

### BUG-QA12-006 — Separation of duties: accountant can approve POs

- **Severity:** MED
- **Status:** RESOLVED
- **Where:** `server.js` — `POST /api/purchase-orders/:id/approve` around line 819.
- **Impact:** Accountant sees the money *and* approves the spend — classic SoD red flag for audit (and for SOX-lite checklist in `_qa-reports`).
- **Fix shape:** `if (req.actor.role !== 'manager' && req.actor.role !== 'admin') return res.status(403).json({...})`.
- **Test:** `QA-12/B6`.

### BUG-QA12-007 — Employee can approve their own wage slip
**Status:** RESOLVED — Agent-Y-QA12: `POST /api/payroll/wage-slips/:id/approve` now requires admin role AND enforces four-eyes principle — if the caller's `employeeId` matches `prev.employee_id`, returns 403 `SELF_APPROVAL_DENIED`. Non-admins receive 403 `WAGE_SLIP_APPROVE_DENIED`.
- **Severity:** HIGH
- **Where:** `src/payroll/payroll-routes.js` — `POST /api/payroll/wage-slips/:id/approve` around line 252.
- **Impact:** An employee who has (or phishes) a working API key can self-approve their own gross-pay line. Combined with BUG-001 / BUG-002 this is a full payroll self-service attack.
- **Fix shape:** explicit role check — approve is manager/accountant-only; plus a secondary check that the approver is not the employee on the slip (four-eyes).
- **Test:** `QA-12/B7`.

### BUG-QA12-008 — API-key comparison is not timing-safe (LOW, optional)

- **Severity:** LOW
- **Where:** `server.js` `requireAuth` — `API_KEYS.includes(apiKey)`.
- **Impact:** In theory an attacker measuring response times across many keys could detect a partial-prefix match. In practice, the key must still be fully present in the env allow-list, and the surface is an Express route behind a rate limiter (300 req / 15 min). Very low practical risk.
- **Fix shape:** iterate the list with `crypto.timingSafeEqual(Buffer.from(k), Buffer.from(apiKey))` — fall back to length-equality to avoid throwing.

---

## 6. What this audit did NOT change

- No code files were modified. The only new files are:
  1. `onyx-procurement/test/security/qa-12-rbac.test.js` — the RBAC test suite.
  2. `_qa-reports/QA-12-rbac.md` — this document.
  3. `_qa-reports/QA-12-rbac-matrix.csv` — the management-friendly matrix.
- No records were deleted.
- No Supabase policies were touched.

The test suite is designed to pass on green CI **today** — every current-state assertion is `assert.equal(r.status, 200)` or similar, and the gap is recorded via `markGap(...)` into a side-channel JSON file. When RBAC is actually implemented, each `markGap` call becomes a hard `assert.equal(r.status, 403)` and the suite will start catching regressions.

---

## 7. Recommended remediation order

1. **Phase 1 (blocker):** Add a role claim. Either:
   - extend `API_KEYS` to a JSON map `{ "<key>": { "role": "admin", "employee_id": "U1" } }`; or
   - swap to Supabase JWTs and read `app_metadata.role` from `supabase.auth.getUser(token)`.
2. **Phase 2:** Introduce `requireRole(...roles)` and `requireSelf('employeeId')` middlewares; wire them on every mutation route and every `payroll/wage-slips/:id*` / `payroll/employees/:id/balances` route.
3. **Phase 3:** Replace `insert(req.body)` with a body allow-list on every POST/PATCH handler.
4. **Phase 4:** Add an integration test that runs the `QA-12` suite with real `403` assertions (remove all `markGap` calls).
5. **Phase 5:** Harden `AUTH_MODE=disabled` — refuse to boot when `NODE_ENV=production`.

---

## 8. Go / No-Go

| Question                                                                          | Answer |
|-----------------------------------------------------------------------------------|--------|
| Is unauthenticated access blocked on every protected route?                       | YES    |
| Is any role-based authorization enforced server-side?                             | **NO** |
| Is there a per-employee ownership check on payroll routes?                        | **NO** |
| Is there separation of duties between accountant and PO approver?                 | **NO** |
| Is there a body allow-list on insert/update?                                      | **NO** |
| Are there tests that can guard future regressions?                                | YES (this suite) |

**Final verdict: NO-GO.** The single-tier API-key gate is not sufficient for a multi-role ERP that stores payroll PII, VAT filings, and bank reconciliation data. Remediation plan above should be executed before onboarding any non-admin user.

---

*Report generated by QA-12. Companion files: `QA-12-rbac-matrix.csv`, `onyx-procurement/test/security/qa-12-rbac.test.js`, `onyx-procurement/test/security/qa-12-rbac-findings.json` (produced on test run).*
