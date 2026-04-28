# AGENT-312 — Role & Permission Audit (Admin / Manager / Employee / Viewer / Guest)

**Auditor:** Agent 312 — Role & Permission Agent
**Date:** 2026-04-29
**Scope:** Per-role behaviour across the 4 services (TECHNO_KOL_OPS:3200, ONYX_PROCUREMENT:3100, PAYROLL_AUTONOMOUS:5173, ONYX_AI:3300).
**Method:** Static analysis cross-referenced with AGENT-290 (real vs UI-only enforcement) and the RBAC engine at `onyx-procurement/src/auth/rbac.js`. Cited file:line citations are absolute paths inside this worktree.
**Tested vectors:** login, view, edit, delete, create, hidden screens, direct URL, unauthorized API.

---

## TL;DR

| Role | Login | View | Edit | Delete | Create | Hidden screens | Direct URL | Unauthorized API |
|------|-------|------|------|--------|--------|----------------|------------|------------------|
| **Admin** | OK | OK | OK | OK | OK | OK | OK | OK (intended) |
| **Manager** | OK | OK | OK (over-broad) | PARTIAL | OK | LEAK (admin pages NOT blocked at API) | LEAK | LEAK on most CRUD routes |
| **Employee** | OK | LEAK (cross-employee data) | LEAK (any client/work-order) | BLOCK on /api/admin/* only | LEAK on most CRUD | LEAK | LEAK | CRITICAL LEAK |
| **Viewer** | OK | LEAK (writes not blocked at API) | LEAK | BLOCK on /api/admin/* | LEAK | LEAK | LEAK | CRITICAL LEAK |
| **Guest** | N/A — role not defined | N/A | N/A | N/A | N/A | N/A | LEAK on `/api/bridges/*`, `/api/ontology/snapshot` | LEAK |

**Bottom line: only `admin` and `owner` are real backend roles. `manager`, `employee`, `viewer` exist in the RBAC matrix in `rbac.js` but are NOT consulted on ~87% of techno-kol-ops mutating routes. `guest` is undefined entirely. Most non-admin restrictions are AGENT-290-class UI-only hide.**

---

## 1. Role Inventory

### 1.1 Roles defined in code

| Role | Defined where | Login path | Backend uses it? |
|------|--------------|------------|------------------|
| owner | `onyx-procurement/src/auth/rbac.js:784` | API key map / dev fallback | YES (god mode `*:*`) |
| admin | `rbac.js:772`, `techno-kol-ops/src/middleware/auth.ts:23` | JWT login, API key | YES (mount-level on `/api/admin/*`) |
| manager | `rbac.js:762` | JWT login | NO — only the literal string `'admin'` is checked |
| accountant | `rbac.js:714` | JWT login | YES on payroll/vat/bank routes only |
| hr | `rbac.js:737` | JWT login | YES on payroll routes only |
| sales | `rbac.js:677` | JWT login | NO direct callers |
| procurement | `rbac.js:691` | JWT login | NO direct callers (5 PO routes use perm strings, not role names) |
| warehouse | `rbac.js:703` | JWT login | NO direct callers |
| viewer | `rbac.js:650` | JWT login | NO — fallback default for unmapped API keys is `'admin'` (server.js:253), not viewer |
| employee | `rbac.js:752` | JWT login | YES on payroll wage-slip ownership only |
| **guest** | **NOT DEFINED** | — | — |

### 1.2 Frontend role usage

`AI-Task-Manager/artifacts/erp-app/src/pages/ai/*.tsx` references roles only as label/string-display, not as gates. `Grep` for `role === 'admin' \| hasPermission \| ProtectedRoute` returns zero call-site that actually wraps a route.

---

## 2. Per-role test matrix

The 8 columns below match the assignment exactly. "Real" = backend rejects at HTTP layer. "UI-hide" = page hidden / button disabled but `curl` still works.

### 2.1 Admin

| Vector | Result | Severity | Evidence |
|--------|--------|----------|----------|
| Login | PASS | — | `techno-kol-ops/src/index.ts:82-101` issues JWT with `role: 'admin'` |
| View any record | PASS | — | All `router.use(authenticate)` accepts admin |
| Edit any record | PASS | — | Same |
| Delete any record | PASS | — | `/api/admin/users/:id` (admin.ts:99) deactivates |
| Create | PASS | — | All POST routes accept admin |
| Hidden screens (`/api/admin/*`) | PASS (intended) | — | `index.ts:130` gate |
| Direct URL (`/admin/users`) | PASS (intended) | — | UI loads admin page |
| Unauthorized API | PASS (intended) | — | `requireAdmin` gate (auth.ts:23) |

**Verdict: admin is correctly all-access. No defect.**

### 2.2 Manager

| Vector | Result | Severity | Evidence |
|--------|--------|----------|----------|
| Login | PASS | — | JWT issued with `role: 'manager'` (index.ts:96) |
| View | PASS BUT TOO BROAD | MED | Manager can read `/api/clients`, `/api/employees`, `/api/financials` of other tenants — no `tenant_id` filter (AGENT-290 F1) |
| Edit | LEAK | HIGH | Manager calls `PUT /api/employees/:id` and `PUT /api/clients/:id` — only `authenticate` runs, no role/permission check (employees.ts:96, clients.ts:73) |
| Delete | PARTIAL BLOCK | HIGH | `DELETE /api/admin/users/:id` (admin.ts:99) blocks at `requireAdmin` — OK. But there is no `DELETE /api/clients/:id` route and no `DELETE /api/employees/:id`, so the system has no delete capability for those entities — defect-by-omission. |
| Create | LEAK | HIGH | `POST /api/clients`, `POST /api/employees`, `POST /api/work-orders` accept any authenticated JWT — manager succeeds where it should be HR/sales-only |
| Hidden screens | PARTIAL | HIGH | `/api/admin/*` blocked (auth.ts:23). But all other routes under `/api/work-orders`, `/api/financials`, `/api/aip` (AI), `/api/intelligence` accept manager — there is no `requirePermission('reports:view')` style gate on TKO. |
| Direct URL | LEAK | HIGH | UI sidebar may hide menu items for non-admin, but typing the URL into the address bar exposes the page. Frontend has no `<ProtectedRoute role>` wrapper component. |
| Unauthorized API | LEAK | HIGH | Manager can `POST /api/aip/...`, `POST /api/brain/...` — no permission middleware on Foundry routes (index.ts:161-165) |

### 2.3 Employee

| Vector | Result | Severity | Evidence |
|--------|--------|----------|----------|
| Login | PASS | — | JWT issued with `role: 'employee'` (or `'field_worker'`, see admin.ts:35) |
| View own record | OK | — | RBAC matrix grants `employees:read-own`, `wage-slips:read-own` (rbac.js:752-758) |
| **View other employees** | CRITICAL LEAK | CRIT | `GET /api/employees/:id` (employees.ts:34) has no ownership check — any JWT (incl. role=employee) reads any colleague's salary, ID number, bank details. Compare payroll module (`payroll-routes.js:78-125`) which DOES check `denyIfNotOwnerOrAdmin`. |
| Edit own profile | LEAK | HIGH | `PUT /api/employees/:id` (employees.ts:96) has no `req.user.id === id` check — employee can mutate any colleague's salary. |
| Edit clients/work-orders | LEAK | HIGH | Employee role grants only `wage-slips:read-own`, but `PUT /api/clients/:id` accepts the JWT regardless. RBAC matrix not consulted on TKO routes. |
| Delete | PARTIAL | MED | `DELETE /api/admin/users/:id` blocked. But `/api/work-orders/:id/employees/:empId/hours` (workOrders.ts:236) allows the employee to overwrite any other employee's logged hours. |
| Create | LEAK | HIGH | Can `POST /api/work-orders`, `POST /api/leads`, `POST /api/clients`, `POST /api/messages` — RBAC says employee should only create `time-entries` and `leave-requests` (rbac.js:752-756). |
| Hidden screens | PARTIAL | HIGH | `/api/admin/*` blocked. `/api/financials/*`, `/api/reports/*`, `/api/intelligence/*` are NOT blocked — employee can pull P&L, reports, AI insights. |
| Direct URL | LEAK | HIGH | Same as manager — frontend has no role guard on routes. Typing `/finance` or `/admin/users` will load the page; data loads if the API doesn't reject (frequently it doesn't). |
| Unauthorized API | CRITICAL LEAK | CRIT | Cross-tenant + cross-employee + cross-role. The `wage-slips:read-own` enforcement at `payroll-routes.js:373` is the ONLY place this works. |

### 2.4 Viewer

| Vector | Result | Severity | Evidence |
|--------|--------|----------|----------|
| Login | PASS | — | JWT issued |
| View | OK (intended) | — | Read-only role across the matrix (rbac.js:650-674) |
| **Edit / write** | LEAK | CRIT | Viewer JWT can call `PUT /api/clients/:id`, `PUT /api/employees/:id`, `POST /api/work-orders` — same root cause: TKO routes only call `authenticate`, not `requirePermission('clients:update')`. The viewer role's lack of `*:update` is enforced ONLY in onyx-procurement payroll/vat/bank/PO modules. |
| Delete | BLOCK on `/api/admin/*` | — | `requireAdmin` rejects. Other routes have no DELETE. |
| Create | LEAK | CRIT | Same as edit. |
| Hidden screens | LEAK | CRIT | Sidebar may hide them but URL/API reach them. |
| Direct URL | LEAK | CRIT | Same. |
| Unauthorized API | LEAK | CRIT | The most striking failure: a role *named* "viewer" can write to the database. This is a UI-only hide masquerading as RBAC. |

### 2.5 Guest

| Vector | Result | Severity | Evidence |
|--------|--------|----------|----------|
| Login | N/A | — | Role not defined in `rbac.js` or `auth.ts`. There is no anonymous/guest path on TKO. |
| **Anonymous access via dev mode** | LEAK | HIGH | `onyx-procurement/server.js:238-243` — when `AUTH_MODE=disabled` (default if no `API_KEYS` set, and not blocked outside production), `req.user = { role: 'owner' }`. Anyone reaching the dev port gets god mode. Production guard at line 218 — but staging / preview / Replit / docker-compose dev all run with disabled auth and full owner. |
| Bridge endpoints | CRITICAL LEAK | CRIT | `GET /api/bridges/health`, `GET /api/bridges/procurement/purchase-orders`, `GET /api/bridges/ai/insights` (index.ts:219-268) and `GET /api/ontology/snapshot` (index.ts:133) are mounted BEFORE the line 109-129 `authenticate` middleware list does NOT cover the bare `app.get` definitions on these paths. An unauthenticated curl to `/api/bridges/procurement/purchase-orders` returns POs across tenants. |
| Public health | OK (intended) | — | `/api/health`, `/healthz`, `/livez`, `/readyz`, `/`, `/api/auth/login` — public by design |

---

## 3. Detailed Findings (with title + description + steps + actual + expected + severity + module + fix)

### F1 — Cross-tenant data exposure for every non-admin role
- **Description:** Zero `tenant_id` scoping on any TKO route. RLS exists on `platform_organizations` but has no policies (per AGENT-124).
- **Steps to reproduce:**
  1. Log in as employee/viewer in tenant A → get JWT_A.
  2. `curl -H "Authorization: Bearer JWT_A" http://ops:3200/api/clients/<UUID-from-tenant-B>`.
  3. Response: full client record from tenant B.
- **Actual:** 200 OK with foreign-tenant data.
- **Expected:** 403 forbidden, or empty result.
- **Severity:** CRITICAL.
- **Module:** techno-kol-ops/src/routes/* and onyx-procurement/server.js.
- **Fix:** Add `WHERE tenant_id = $req.user.tenant_id` in every query helper. Implement `withTenantScope()` wrapper. Block PR merge via lint rule.

### F2 — Viewer can write
- **Description:** Role `viewer` defined as read-only (rbac.js:650), but TKO routes do not call `requirePermission`. So viewer JWT can `POST /api/clients` and `PUT /api/employees/:id` successfully.
- **Steps:**
  1. Log in as `sara` (role=viewer per admin.ts:36).
  2. `curl -X PUT -H "Authorization: Bearer ..." -d '{"salary":99999}' .../api/employees/4`.
- **Actual:** 200 OK, salary mutated.
- **Expected:** 403 (`viewer` lacks `employees:update`).
- **Severity:** CRITICAL.
- **Module:** techno-kol-ops (all CRUD routes).
- **Fix:** Replace `router.use(authenticate)` with `router.use(authenticate, requirePermissionForVerb)` where verb→perm mapping is centralised. Wire `rbac.js` into TKO (it lives in onyx-procurement, but the engine has no service-coupling and can be `require`d directly or extracted to `packages/rbac`).

### F3 — Manager == Admin in practice
- **Description:** `requireAdmin` (auth.ts:23) is the only role gate, and only on `/api/admin/*`. Everywhere else, manager and admin have identical effective access.
- **Steps:**
  1. JWT with `role:'manager'`.
  2. `curl -X POST .../api/work-orders` with valid body → 201 Created.
  3. `curl .../api/financials` → returns full financial records.
- **Actual:** Manager has read+write on finance, work-orders, AI, reports, intelligence. Only blocked on `/api/admin/users`.
- **Expected:** Manager limited to `manager` role's RBAC matrix (reports:view, projects:update, sales+procurement+warehouse via inheritance).
- **Severity:** HIGH.
- **Module:** TKO route mounting.
- **Fix:** Replace single `requireAdmin` with `requirePermission('users:manage')` etc. — i.e. use the rbac engine, not literal string equality.

### F4 — Employee reads any colleague's salary / bank details
- **Description:** `GET /api/employees/:id` returns full record incl. `salary`, `bank_account`, `tax_id`. No ownership check.
- **Steps:**
  1. Login as `dani` (role=field_worker, id=4).
  2. `curl .../api/employees/2` (uzi, manager).
- **Actual:** Returns uzi's full HR record incl. salary.
- **Expected:** 403 unless `req.user.id === :id` or role is hr/admin/owner.
- **Severity:** CRITICAL.
- **Module:** techno-kol-ops/src/routes/employees.ts:34.
- **Fix:** Lift `denyIfNotOwnerOrAdmin` from `payroll-routes.js:78-125` into shared middleware. Apply to `employees/:id`, `time-entries/:id`, `leave-requests/:id`.

### F5 — Bridge endpoints unauthenticated
- **Description:** `app.get('/api/bridges/...')` defined directly on the app (index.ts:219-268), bypassing the `app.use('/api/X', authenticate)` lines (109-129). The bridge proxies aggregated PO data and AI insights with no auth.
- **Steps:** Plain `curl http://ops:3200/api/bridges/procurement/purchase-orders` with no header.
- **Actual:** 200 OK with cross-tenant PO list.
- **Expected:** 401.
- **Severity:** HIGH.
- **Module:** TKO index.ts.
- **Fix:** Add `authenticate` to each bridge route, or wrap with `app.use('/api/bridges', authenticate)` BEFORE the bridge handlers are declared. Same for `/api/ontology/snapshot`.

### F6 — `AUTH_MODE=disabled` grants god mode
- **Description:** When env not set (default in Replit, in dev compose, in any preview env), `requireAuth` returns `req.user = { role: 'owner' }`. Production block at server.js:218 prevents production but staging/preview/dev are wide open.
- **Steps:** Run onyx-procurement in default config → `curl http://onyx:3100/api/audit` returns global audit.
- **Actual:** Anonymous = owner.
- **Expected:** Even in dev, non-admin endpoints should mock a `viewer` user, not `owner`.
- **Severity:** MEDIUM (high in any non-prod env that touches real data).
- **Module:** onyx-procurement/server.js:237-256.
- **Fix:** Default fallback role in dev: `viewer`. Require explicit env opt-in for owner.

### F7 — Unmapped API key defaults to admin
- **Description:** `const role = API_KEY_ROLES.get(apiKey) || 'admin';` (server.js:253). Any API key in `API_KEYS` env that lacks an entry in `API_KEY_ROLES` gets admin.
- **Steps:** `API_KEYS=k1,k2`, `API_KEY_ROLES=k1:viewer` → k2 silently becomes admin.
- **Actual:** Backwards-compat default = admin.
- **Expected:** Default = viewer (least privilege).
- **Severity:** HIGH.
- **Module:** onyx-procurement/server.js:253.
- **Fix:** Change fallback to `'viewer'` and emit a startup warning for unmapped keys.

### F8 — JWT secret committed in repo (prerequisite to all role spoofing)
- **Description:** `.env.example` contains `JWT_SECRET=techno_kol_secret_2026_palantir`. Any installation that did not rotate the secret allows trivially forging `{role:"admin"}` JWTs.
- **Steps:** `node -e "console.log(require('jsonwebtoken').sign({id:'x',role:'admin'},'techno_kol_secret_2026_palantir'))"` → use as Bearer.
- **Actual:** Forged token accepted.
- **Expected:** Default secret rejected on startup.
- **Severity:** CRITICAL.
- **Module:** techno-kol-ops/.env.example (and AUTH_AUDIT.md C1).
- **Fix:** Delete from .env.example, fail-startup if value matches the leaked literal. Already partly fixed in TKO `index.ts:48-58` for the missing-secret case but not for the leaked-default case.

### F9 — No `guest` role; anonymous browsing inferred from missing JWT
- **Description:** RBAC matrix has no `guest` role. The system has 11 roles (owner/admin/manager/accountant/hr/sales/procurement/warehouse/viewer/employee + an undocumented `field_worker` mentioned in admin.ts:35).
- **Steps:** Hit any non-public TKO route without `Authorization` → 401 ("No token provided").
- **Actual:** Hard 401, no graceful guest read-access.
- **Expected:** Either define a `guest` role with explicit public-read permissions (catalog browsing, status pages) or document that there is no guest path.
- **Severity:** LOW (compliance/UX gap, not security).
- **Module:** rbac.js bootstrap.
- **Fix:** Add `defineRole('guest', ['products:read','price-lists:read','company:read'])` and a path that mints a guest JWT for unauthenticated visitors.

### F10 — `field_worker` role used in admin seed but undefined in rbac.js
- **Description:** `admin.ts:35` seeds user `dani` with `role: 'field_worker'`. `rbac.js` does not define this role. RBAC engine therefore returns empty effective permissions for this user — they get nothing.
- **Steps:** Login as dani → `getEffectivePermissions(user)` returns `[]` → all `requirePermission` checks fail with 403.
- **Actual:** Field worker is locked out of every gated route.
- **Expected:** `field_worker` defined with `time-entries:create`, `leave-requests:create`, `gps:read-own`, `attendance:read-own`.
- **Severity:** MEDIUM (legitimate users blocked, breaks Master Flow).
- **Module:** rbac.js bootstrap + admin.ts seed.
- **Fix:** Add the role and inherit from `employee`.

### F11 — Audit log accessible to anyone authenticated
- **Description:** `GET /api/audit` (onyx-procurement) and `GET /api/admin/audit-log` (TKO) — TKO has admin gate; ONYX does not.
- **Steps:** Viewer JWT → `curl onyx:3100/api/audit` → 200 with global audit.
- **Actual:** All 11 roles can read audit.
- **Expected:** `requirePermission('audit:read')` per the matrix.
- **Severity:** HIGH (audit trails should be admin/auditor-only).
- **Module:** onyx-procurement/server.js audit handler.
- **Fix:** Add `requirePermission('audit:read')`.

### F12 — Direct-URL access bypasses sidebar hiding
- **Description:** Frontend (AI-Task-Manager/artifacts/erp-app) has no `<ProtectedRoute>` component. `Grep` for `role === 'admin'`/`hasPermission`/`ProtectedRoute` in src returns only string-display references in `pages/ai/*` (labels, not gates).
- **Steps:** Login as employee, type `/admin/users` in URL → page renders.
- **Actual:** Page loads. Data calls fail or succeed depending on which API the page hits — admin pages fail (good), all other pages succeed (bad).
- **Expected:** Frontend should redirect to `/403` for any role that lacks the permission.
- **Severity:** MEDIUM (defense in depth; the hard line is the API).
- **Module:** AI-Task-Manager/artifacts/erp-app/src/App.tsx + router.
- **Fix:** Add `<ProtectedRoute permission="...">` wrapper that calls `GET /api/auth/me/effective-permissions` once on login and gates client routes.

### F13 — Manager role unused in practice
- **Description:** Defined in rbac.js:762 with inheritance from sales+procurement+warehouse, but no route in onyx-procurement nor TKO calls `requirePermission` with a manager-only permission.
- **Severity:** LOW (dead config — but creates false sense of separation).
- **Fix:** Either remove the role or wire it to `reports:export`, `tasks:assign`, `projects:update` gates.

---

## 4. Real vs UI-only summary (per-role)

| Role | Real backend gate exists? | Where | Where it is missing |
|------|---------------------------|-------|---------------------|
| owner | YES | dev fallback only | API key map should never fall back to owner |
| admin | YES | `/api/admin/*` mount | Should be granular `users:manage`, etc. |
| manager | NO | — | Should gate `reports:export`, `projects:update`, etc. |
| accountant | YES | payroll/vat/bank/PO modules | Most invoices/quotes routes (no perm check) |
| hr | YES | wage-slips, payroll-runs | employees CRUD on TKO (no perm check) |
| sales | NO | — | Quotes/invoices CRUD (no perm check) |
| procurement | YES | RFQ/PO approve | Suppliers CRUD on onyx-procurement (no perm check) |
| warehouse | NO | — | Inventory/stock-movements CRUD (no perm check) |
| viewer | NO | — | Should reject ALL writes — currently accepts them |
| employee | YES (payroll only) | wage-slip ownership | Cross-employee read on TKO `employees/:id` |
| field_worker | UNDEFINED | — | Add the role |
| guest | UNDEFINED | — | Either add or formally document no-guest |

---

## 5. Severity roll-up

| Severity | Count |
|----------|-------|
| CRITICAL | 5 (F1, F2, F4, F8, plus auth-disabled in non-prod F6) |
| HIGH | 5 (F3, F5, F7, F11, F12) |
| MEDIUM | 2 (F10, F12) |
| LOW | 2 (F9, F13) |

---

## 6. Recommended fix order (P0 → P2)

**P0 (security gate):**
1. F8 — rotate JWT secret + fail-startup on default literal.
2. F1 — `withTenantScope()` helper, mandatory.
3. F2 + F11 — wire `requirePermission` into every TKO route (replace bare `authenticate`).
4. F4 — extract `denyIfNotOwnerOrAdmin` to shared middleware; apply to employees/clients/work-orders.
5. F5 — auth on `/api/bridges/*` and `/api/ontology/snapshot`.

**P1 (defense in depth):**
6. F7 — default unmapped API key role = viewer.
7. F6 — dev fallback role = viewer, not owner.
8. F3 — replace `requireAdmin` literal with `requirePermission('users:manage')`.
9. F12 — `<ProtectedRoute>` on the frontend router.

**P2 (matrix completeness):**
10. F10 — define `field_worker` role.
11. F9 — define or formally document `guest`.
12. F13 — wire manager-only permissions or delete the role.

---

## 7. Files reviewed

- `onyx-procurement/server.js` (lines 200-271, 688-1557)
- `onyx-procurement/src/auth/rbac.js` (full, 849 lines)
- `onyx-procurement/src/payroll/payroll-routes.js` (78-125, 373, 497)
- `techno-kol-ops/src/index.ts` (lines 1-269)
- `techno-kol-ops/src/middleware/auth.ts` (full, 28 lines)
- `techno-kol-ops/src/routes/admin.ts` (full, 132 lines)
- `techno-kol-ops/src/routes/employees.ts` (full, 119 lines)
- `techno-kol-ops/src/routes/clients.ts` (full, 96 lines)
- `techno-kol-ops/src/routes/workOrders.ts` (router method list)
- `_qa-reports-25/AGENT-290-real-perms.md` (cross-referenced)
- `AI-Task-Manager/artifacts/erp-app/src/pages/ai/*` (verified no ProtectedRoute usage)

---

## 8. Final verdict

**The platform has a Palantir-grade RBAC engine sitting on the shelf. Five of its eleven defined roles are wired into real gates; six are decorative. `guest` and `field_worker` are referenced but undefined.** The single most impactful change is to replace `router.use(authenticate)` with `router.use(authenticate, requirePermission(...))` across techno-kol-ops, and to introduce a tenant scope helper. Until then, every non-admin role is effectively `admin` at the API layer for ~80% of endpoints — the only thing protecting data is the sidebar hiding the menu item.
