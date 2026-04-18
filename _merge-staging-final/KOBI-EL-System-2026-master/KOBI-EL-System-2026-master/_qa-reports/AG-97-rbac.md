# AG-97 — RBAC Module (Role-Based Access Control)

- **Agent:** 97
- **Date:** 2026-04-11
- **Scope:** `onyx-procurement` — new module `src/auth/rbac.js` + test suite `test/payroll/rbac.test.js`
- **Rule of engagement:** additive only, nothing deleted, zero external deps, security-critical.
- **Status:** GREEN — 54 / 54 tests passing.

---

## 0. TL;DR

Agent 97 delivers a full RBAC implementation that closes the architectural gaps flagged by QA-12 (Role & Permission Audit). The module is:

- **Zero-dep.** No `npm install`, no transitive surface, runs on Node built-ins only.
- **Fail-closed.** Unknown roles, missing users, malformed permissions, unknown permissions — all return `false` / `403`. There are no silent "well, it must be fine" paths.
- **Diamond-safe.** The inheritance walker distinguishes a real cycle (`a → b → a`) from a benign DAG diamond (`manager → sales → viewer` *and* `manager → procurement → viewer`). No false-positive cycle warnings in the canonical role graph.
- **Express-ready.** `requirePermission(perm)` drops straight into any route definition, returning deterministic `401` / `403` JSON bodies.
- **Explicit deny wins.** A per-user `denyPermission` overrides every inherited role grant — critical for PIP / suspend / post-incident scenarios where access must be surgically removed without stripping the whole role.

Verdict: **production-ready** as the RBAC primitive layer. Routes still need to adopt it — that is out of scope for Agent 97 and belongs to the next wave.

---

## 1. Files created

| Path | Purpose | Lines | Deps |
|------|---------|------:|------|
| `onyx-procurement/src/auth/rbac.js` | RBAC engine | ~570 | zero |
| `onyx-procurement/test/payroll/rbac.test.js` | Unit tests | ~490 | `node:test`, `node:assert/strict` |
| `_qa-reports/AG-97-rbac.md` | This report | — | — |

No existing files were modified. No files were deleted.

---

## 2. Role catalogue (for Techno-Kol Uzi)

Ten canonical roles are bootstrapped at module load — `defineRole` is idempotent so reloading is safe.

| Role         | Inherits from                           | Summary |
|--------------|-----------------------------------------|---------|
| `owner`      | `admin` + direct `*:*`                  | Kobi. God mode. Only role that can `company:delete` and `billing:manage`. |
| `admin`      | `manager`, `accountant`, `hr`           | Everything except owner-only ops. Manages users, roles, settings, webhooks, backups. |
| `manager`    | `sales`, `procurement`, `warehouse`     | Operational supervisor. Cross-domain read/write but cannot touch auth/billing/payroll internals beyond HR's read-all surface (not inherited). |
| `accountant` | `viewer`                                | Financial + tax. VAT / annual / PCN836 / journal entries / bank rec. `reports:export` + `reports:schedule`. |
| `hr`         | `viewer`                                | Payroll, wage slips (read-all + generate + sign), employees, pension, severance, `tax-form-101`. |
| `sales`      | `viewer`                                | Clients, leads, opportunities, deals, invoices, quotes, credit notes, receipts, campaigns. |
| `procurement`| `viewer`                                | Vendors, POs (approve + cancel), goods receipts, bills, supplier portal, vendor onboarding. |
| `warehouse`  | `viewer`                                | Inventory, stock movements, products, warehouses, GR updates. |
| `viewer`     | —                                       | Read-only across the ERP. 50+ `*:read` / `*:view` permissions. |
| `employee`   | —                                       | Limited to `wage-slips:read-own`, own time entries, own leave requests, own 101. |

### Inheritance diagram

```
           owner
             │ *:*
             ▼
           admin ──────┬──────┬──────┐
                       │      │      │
                     manager  accountant  hr
                       │        │         │
              ┌────────┼────────┤         ▼
              │        │        │       viewer
           sales procurement warehouse    ▲
              │        │        │         │
              └────────┴────────┴─────────┘
```

The diamond is real (viewer is reached 3× via manager's parents) — the walker resolves it by tracking `path` (for cycles) and `done` (for memoization) separately.

---

## 3. Permission model

### 3.1 Format

`resource:action`, all lowercase, no whitespace. Matched by:

```
_normalize:  /^[a-z0-9._*-]+:[a-z0-9._*-]+$/
```

Any permission string that fails the regex is silently dropped in `defineRole` / `grantCustomPermission` and returns `false` from `can` — misconfiguration becomes a deny, not a runtime crash.

### 3.2 Wildcards

| Pattern        | Meaning                                    | Who uses it    |
|----------------|--------------------------------------------|----------------|
| `*:*`          | Root god permission — matches everything. | owner only     |
| `resource:*`   | Every action on a single resource.         | power-user cases (e.g. `invoices:*` for a billing runner) |
| `*:action`     | **NOT supported** — would be too risky (accountant would suddenly inherit `roles:read` etc.). The normalizer accepts it shape-wise, but `_permMatches` does not treat resource `*` as a wildcard. |

### 3.3 Evaluation order in `can(user, perm)`

1. `getEffectivePermissions(user)` — roles ∪ direct grants \ direct denies.
2. Denies-first sweep: if any deny matches `perm`, return `false`. Overrides role grants. This is the PIP / incident-response hook.
3. Grants sweep: first match wins, returns `true`.
4. Otherwise `false`.

### 3.4 Resource catalogue

`RESOURCES` exports a frozen array of **~100** canonical resource names, grouped:

- Sales (9): `invoices`, `quotes`, `credit-notes`, `receipts`, `clients`, `leads`, `opportunities`, `deals`, `campaigns`
- Procurement (6): `vendors`, `purchase-orders`, `goods-receipts`, `bills`, `vendor-onboarding`, `supplier-portal`
- Inventory (6): `inventory`, `stock-movements`, `products`, `price-lists`, `categories`, `warehouses`
- Payroll (7): `wage-slips`, `employees`, `time-entries`, `leave-requests`, `pension`, `severance`, `payroll-runs`
- Finance (8): `expenses`, `bank-accounts`, `bank-statements`, `bank-reconciliation`, `payments`, `transfers`, `journal-entries`, `ledger`
- Tax (6): `tax-vat`, `tax-annual`, `tax-form-30a`, `tax-form-101`, `tax-pcn836`, `tax-reports`
- Analytics (4): `reports`, `dashboards`, `kpis`, `search`
- Governance (10): `audit`, `users`, `roles`, `permissions`, `settings`, `billing`, `company`, `api-keys`, `sessions`, `backups`
- Ops (9): `exports`, `imports`, `templates`, `webhooks`, `integrations`, `jobs`, `queues`, `schedules`, `notifications`
- Comms (5): `emails`, `sms`, `whatsapp`, `calendar`, `chat`
- Data/AI (5): `ai-assistant`, `prompts`, `ontology`, `pipelines`, `data-stores`
- Content (5): `brand-kits`, `designs`, `files`, `attachments`, `notes`
- Verticals (9): `real-estate`, `permits`, `construction-pm`, `maintenance`, `assets`, `insurance`, `grants`, `contracts`, `projects`, `tasks`
- Support (6): `tickets`, `cases`, `support-tickets`, `knowledge-base`, `help-desk`, `kyc`, `compliance`

The catalogue is **advisory, not enforcing** — new modules may add resources without touching `rbac.js`.

---

## 4. Public API surface

```js
const rbac = require('./src/auth/rbac');
```

| Symbol                         | Type                                  | Use |
|--------------------------------|---------------------------------------|-----|
| `defineRole(name, perms, {inherits?})` | `(string, string[], opts) => roleSnapshot` | Declare a role. Redefining replaces (does not append). |
| `getRole(name)`                | `string => roleSnapshot \| null`       | Read-only snapshot. |
| `listRoles()`                  | `() => string[]`                       | Sorted list of defined role names. |
| `can(user, perm)`              | `(user, string) => boolean`            | Single-permission check. Fails closed. |
| `canAny(user, perms[])`        | `(user, string[]) => boolean`          | True if any match. |
| `canAll(user, perms[])`        | `(user, string[]) => boolean`          | True if all match. |
| `requirePermission(perm)`      | `string => ExpressMiddleware`          | `401` / `403` gate. |
| `requireAnyPermission(perms)`  | `string[] => ExpressMiddleware`        | Gate that accepts any of the listed perms. |
| `getEffectivePermissions(user)`| `user => string[]`                     | Debug + UI — merged roles ∪ grants \ denies. |
| `assignRole(userId, name)`     | `(string, string) => userSnapshot`     | In-memory user store (bootstrap/test). |
| `revokeRole(userId, name)`     | `(string, string) => userSnapshot`     | Remove one role. |
| `grantCustomPermission(id, p)` | `(string, string) => userSnapshot`     | Per-user override. Clears any matching deny. |
| `denyCustomPermission(id, p)`  | `(string, string) => userSnapshot`     | Per-user hard deny. Wins over role grants. |
| `getUserRecord(id)`            | `string => userSnapshot \| null`       | Inspect the in-memory user store. |
| `RESOURCES`                    | `readonly string[]`                    | Frozen catalogue. |
| `ACTIONS`                      | `readonly string[]`                    | Frozen catalogue. |
| `ROOT_PERMISSION`              | `'*:*'`                                | Constant used by `owner`. |

**Internals (test-only, underscore-prefixed):** `_resetAll`, `_snapshot`, `_normalizePerm`, `_permMatches`, `_resolveRolePerms`. Never call these from application code.

---

## 5. Express integration example

```js
const rbac = require('./src/auth/rbac');

// On an existing /api/invoices route
app.get('/api/invoices',
  requireAuth,                            // existing auth: populates req.user
  rbac.requirePermission('invoices:read'),
  listInvoicesHandler
);

app.post('/api/invoices',
  requireAuth,
  rbac.requirePermission('invoices:create'),
  createInvoiceHandler
);

app.post('/api/invoices/:id/export',
  requireAuth,
  rbac.requireAnyPermission(['invoices:export', 'reports:export']),
  exportInvoiceHandler
);

// Payroll routes (QA-12 CRITICAL-2: employee read-own)
app.get('/api/payroll/wage-slips/:id',
  requireAuth,
  rbac.requirePermission('wage-slips:read-all'),  // HR / admin / owner
  readWageSlipHandler
);

app.get('/api/me/wage-slips',
  requireAuth,
  rbac.requirePermission('wage-slips:read-own'),  // anyone with the role
  readOwnWageSlipsHandler
);
```

### Contract for `req.user`

`requirePermission` expects an earlier auth layer to populate `req.user` with at least one of:

```js
req.user = { id: 'u-42', role: 'accountant' };              // simple
req.user = { id: 'u-42', roles: ['accountant', 'viewer'] }; // multi-role
req.user = {
  id: 'u-42',
  role: 'viewer',
  permissions: ['invoices:delete'],       // direct grant
  denyPermissions: ['audit:read'],        // direct deny
};
```

If `req.user` is missing → `401 { error: 'unauthenticated', required }`.
If the user lacks the permission → `403 { error: 'forbidden', required, user_id }`.

The response bodies are stable and safe for client-side display.

---

## 6. Test suite — `test/payroll/rbac.test.js`

**Run:** `node --test test/payroll/rbac.test.js`
**Result:** `54 passing, 0 failing, ~180ms`.

### 6.1 Coverage matrix

| Area                                  | Cases | Examples |
|---------------------------------------|------:|----------|
| `defineRole` + `getRole` + `listRoles`|     6 | create / rename / reject empty / drop malformed / lookup unknown / bootstrap list |
| Normalizer + matcher                  |     5 | valid canonicalization, bad shapes, exact, resource wildcard, `*:*` |
| `can()` happy-path per role           |     8 | viewer / sales / accountant / hr / employee / owner / admin / manager |
| `can()` fail-closed                   |     3 | unknown role, null user, malformed perm |
| `canAny` / `canAll`                   |     3 | true, false, empty |
| Inheritance                           |     3 | multi-level, cycle detection, missing parent |
| Effective permissions                 |     3 | merge grants + denies, multi-role, null user |
| `assignRole` / `revokeRole`           |     3 | persist + affect, unknown role, collapse |
| `grantCustomPermission` / `deny…`     |     5 | one-off grant, malformed, deny override, grant-after-deny flip, user record |
| Express middleware                    |     8 | 401 no user, 403 no perm, next() happy, owner god, admin vs owner-only, bad construction, requireAny pass/fail |
| Wildcards                             |     2 | `resource:*`, `*:*` |
| Catalogues                            |     2 | frozen, non-empty |
| Realistic flows                       |     3 | temp grant, PIP deny, redefinition |
| **Total**                             |  **54** | |

### 6.2 Key guarantees exercised

1. **Diamond inheritance** — the manager → {sales, procurement, warehouse} → viewer graph resolves without any spurious cycle warning.
2. **Real cycles** — `a → b → a` is broken and logged exactly once per role.
3. **Deny-first** — explicit user deny wipes an inherited role grant; a subsequent explicit grant restores it (last write wins).
4. **Fail-closed** — every error path returns `false` or `403`, never `true` or `500`.
5. **Middleware safety** — bad permission string at `requirePermission(...)` call-site throws AT CONSTRUCTION, not at request time, so misconfigured routes fail startup instead of production traffic.

---

## 7. Security-critical properties

| Property                          | How it's enforced |
|-----------------------------------|-------------------|
| No implicit admin                 | Unknown roles = empty permission set. `AUTH_MODE=disabled` in upstream auth does not elevate users. |
| No permission forgery             | `req.user.permissions` is merged but each entry is re-normalized — malformed entries are dropped, not passed through. |
| Explicit deny is absolute         | Processed before any grant check, includes wildcard matching, cleared only by explicit grant call (audit-friendly). |
| No cycle-induced DoS              | `MAX_INHERITANCE_DEPTH = 32` hard cap + per-path tracking. |
| No timing side-channels           | All checks are `===` / Set lookups — no string concat / crypto / network. |
| No global mutation from caller    | `getRole`, `listRoles`, `getEffectivePermissions` return new arrays. Internal `Set`/`Map` is never leaked. |
| Middleware returns stable JSON    | No stack traces, no internal role names leaked, no sanitization-bypass in the `user_id` field (coerced via `String(...)`). |
| Root permission is explicit       | `*:*` is a named constant `ROOT_PERMISSION`, granted only to `owner`. Admin does NOT hold it. |

---

## 8. Gaps & follow-ups (intentionally out of scope)

1. **Route adoption.** The 30+ `/api/*` routes enumerated in QA-12 still need `requirePermission(...)` inserted. That is a mechanical pass across `src/vat/*-routes.js`, `src/tax/*-routes.js`, `src/bank/*-routes.js`, `src/payroll/*-routes.js`, and `server.js`. It must be coordinated with the route-aware rate limiter (`src/middleware/rate-limits.js`) so the tier and the perm check share one source of truth.
2. **User store persistence.** The in-memory `_userStore` in `rbac.js` is for tests and CLI bootstraps only. Production should persist roles/grants/denies in Supabase and overlay via `req.user` per request. The API is designed so this swap is trivial (same function shapes).
3. **Audit log emission.** `grantCustomPermission` / `denyCustomPermission` / `assignRole` / `revokeRole` should emit to the existing audit trail (QA-50). Current module is audit-neutral; the hook point is the return-snapshot.
4. **Field-level ACL.** RBAC answers "can this user hit this endpoint?" but NOT "which columns may they see?". The wage-slip endpoint still needs a column-level filter on `gross_pay`, `net_pay`, `income_tax`. That is a separate concern (row/column policies in Postgres + a `viewModel` layer).
5. **`*:action` wildcard.** Intentionally rejected; can be revisited if a controlled use-case emerges.
6. **Time-bound grants / delegations.** Not implemented. All grants are permanent until revoked. If needed, wrap `grantCustomPermission` with a TTL scheduler (QA-84 cron) that calls `denyCustomPermission` at expiry.

None of these block Agent 97 from being merged. They are queued for the next RBAC wave.

---

## 9. Run log

```
$ cd onyx-procurement
$ node --test test/payroll/rbac.test.js
...
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~180
```

Single intentional cycle warning is emitted by the `a ↔ b` test and is expected. Bootstrapped roles (`manager`, `admin`, `owner`) produce zero warnings — the DAG is clean.

---

## 10. File index

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\auth\rbac.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\payroll\rbac.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-97-rbac.md`

— Agent 97
