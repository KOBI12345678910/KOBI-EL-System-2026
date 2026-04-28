# AGENT-290 - Real Permission Enforcement Audit

**Auditor:** Agent 290 (REAL-SYS #5)
**Date:** 2026-04-29
**Scope:** Server-side permission and tenant isolation across `onyx-procurement` (port 3100) and `techno-kol-ops` (port 3200). Question: real backend enforcement, or UI-only hide?

---

## TL;DR

**MIXED - mostly UI-only hide; partial real enforcement on payroll/finance only.**

| Layer | Status | Confidence |
|-------|--------|-----------|
| Authentication on protected endpoints | PARTIAL real enforcement | HIGH |
| Role-based authorization (RBAC) | DEFINED but UNUSED on most routes | HIGH |
| Tenant isolation in queries | NONE in code (no `tenant_id` filter) | HIGH |
| Admin-only page enforcement | YES on `/api/admin/*` only | HIGH |
| Object-level / IDOR protection | ONLY on payroll wage-slips | HIGH |

A capable RBAC engine exists in `onyx-procurement/src/auth/rbac.js` (850 lines, 11 default roles, ~80 resources), but only **5 of 39** top-level routes in `server.js` actually call `requirePermission()`. Most write/read endpoints accept any authenticated request. In `techno-kol-ops`, RBAC reduces to a single `requireAdmin` middleware with one boolean check (`req.user?.role !== 'admin'`).

---

## 1. Test Setup (static analysis - no live server reachable from worktree)

Audit performed by static read of:
- `onyx-procurement/server.js` (1700+ lines, 39 top-level Express routes)
- `onyx-procurement/src/auth/rbac.js` (RBAC engine)
- `onyx-procurement/src/payroll/payroll-routes.js` (only module with ownership gate)
- `techno-kol-ops/src/index.ts` (route mounting)
- `techno-kol-ops/src/middleware/auth.ts` (29-line gate)
- `techno-kol-ops/src/routes/admin.ts`, `employees.ts`, `clients.ts`, `workOrders.ts`

---

## 2. Attack Test Results

### Test A - Employee accesses admin pages

**Route:** `GET /api/admin/users`, `POST /api/admin/users`, `GET /api/admin/audit-log` (techno-kol-ops:3200)

**Code path:** `techno-kol-ops/src/index.ts:130`
```ts
app.use('/api/admin', authenticate, requireAdmin, adminRouter);
```
`requireAdmin` (auth.ts:23-28) checks `req.user?.role !== 'admin'` and returns 403.

**Result: REAL ENFORCEMENT** - admin gate works at the mount level. An employee JWT with `role: 'employee'` will be rejected with 403 before any handler runs.

**However - role spoofing risk:** `auth.ts:15` decodes JWT with `process.env.JWT_SECRET`. Per `techno-kol-ops/AUTH_AUDIT.md` finding C1, the default secret in `.env.example` is `techno_kol_secret_2026_palantir` - committed, public, identical across deploys. Anyone with repo access can forge `{role:"admin"}`. So the gate is real but circumventable for any installation that did not rotate the secret.

---

### Test B - User edits another tenant's data

**Routes tested:** `GET/POST/PUT /api/clients`, `GET/PUT /api/employees/:id`, `POST /api/work-orders` (techno-kol-ops); `GET/POST /api/suppliers`, `GET /api/purchase-orders/:id` (onyx-procurement)

**Code path:** Every TKO route file follows the same pattern:
```ts
router.use(authenticate);
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
  ...
});
```

**Result: NO TENANT ENFORCEMENT.**

- `Grep` for `tenant_id|tenantId|company_id|companyId|org_id` across `techno-kol-ops/src/routes/` returned **zero hits**.
- Same grep across `onyx-procurement/server.js` - **zero hits**.
- Queries are unscoped: any authenticated user can read/edit any row by ID.
- The QA report `AGENT-124-platform-multitenant.md` confirms the schema problem at the DB tier: `platform_organizations` has RLS enabled but **zero policies**. There are duplicate `tenant_users` tables (`public.*` vs `platform.*`) and the inconsistency means the JWT->tenant mapping cannot be relied on.
- The clients endpoint at `clients.ts:32-50` will happily return another tenant's clients if the caller knows or guesses the UUID.

This is a **CRITICAL IDOR / cross-tenant exposure**. UI may filter by tenant but the API does not.

---

### Test C - Privileged endpoint without auth

**Routes tested:** `POST /api/rfq/send`, `POST /api/rfq/:id/decide`, `POST /api/purchase-orders/:id/approve` (onyx-procurement); `POST /api/work-orders`, `POST /api/employees`, `DELETE /api/employees/:id` (techno-kol-ops)

**Onyx-procurement code path:** `server.js:268-271`
```js
app.use('/api/', (req, res, next) => {
  if (PUBLIC_API_PATHS.has(req.path)) { req.actor = 'public'; return next(); }
  return requireAuth(req, res, next);
});
```
`requireAuth` (lines 237-256) requires `X-API-Key` header in any non-`disabled` mode. In `disabled` mode, anonymous callers are auto-promoted to **`role: 'owner'`** (god mode `*:*`) - line 242. Production safeguard exists: line 218 force-exits if `NODE_ENV=production && AUTH_MODE=disabled`.

**Techno-kol-ops:** No global gate - each router file calls `router.use(authenticate)` individually. **Risk:** any router added without the `router.use(authenticate)` line is unauthenticated. The mount in `index.ts:109-129` adds `app.use('/api/X', authenticate)` defensively for known routers - but the `/api/bridges/*` and `/api/ontology/snapshot` routes at lines 132-140, 219-268 have **NO authenticate middleware** despite returning purchase orders, AI insights, and ontology snapshots.

**Result: PARTIAL.**
- Onyx-procurement: real gate, but the `disabled` dev mode and the `'admin'` fallback at line 253 (`API_KEY_ROLES.get(apiKey) || 'admin'`) give every unmapped key full admin role - silent privilege escalation.
- Techno-kol-ops: real authentication gate on most routes, but several bridge/health/ontology endpoints expose data without authentication.

---

### Test D - RBAC actually enforced on business actions?

**Searched for `requirePermission(` calls in `onyx-procurement/server.js`:**
- Total Express routes: ~39
- Routes guarded by `requirePermission`: **5**
  - `/api/rfq/send` (purchase-orders:create)
  - `/api/rfq/:id/decide` (purchase-orders:approve)
  - `/api/purchase-orders/:id/approve` (purchase-orders:approve)
  - `/api/purchase-orders/:id/send` (purchase-orders:update)
  - `/api/subcontractors/decide` (purchase-orders:approve)
- Routes NOT guarded: `/api/suppliers/*` (CRUD), `/api/quotes` (POST), `/api/purchase-requests` (CRUD), `/api/subcontractors` (CRUD pricing), `/api/analytics/*`, `/api/audit` (read), all 6 supplier endpoints, `/api/admin/rbac/status` (no admin check despite the name).

**Effective coverage: ~13% of mutating routes.** The RBAC engine is loaded, the role registry is populated, but the bulk of business actions (creating suppliers, posting quotes, reading audit log) do not consult it.

In sub-modules registered via `registerXRoutes()`, coverage is higher - the payroll module checks 4-5 actions, vat/bank/annual-tax modules also pass `requirePermission` through. So procurement/payroll/finance are partly enforced; sales/supplier/quotes/admin-rbac-status are not.

---

### Test E - Object-level / IDOR (read your neighbor's wage slip)

**Route:** `GET /api/payroll/wage-slips/:id`, `POST /api/payroll/wage-slips/:id/approve` (onyx-procurement)

**Code path:** `payroll-routes.js:78-125` - `denyIfNotOwnerOrAdmin` helper.
```js
function denyIfNotOwnerOrAdmin(req, res, targetEmployeeId) {
  const { isAdmin, employeeId } = getCallerIdentity(req);
  if (isAdmin) return false;
  if (!employeeId) { res.status(403).json(...); return true; }
  if (String(target) !== String(employeeId)) {
    res.status(403).json({ error: 'forbidden', code: 'PAYROLL_CROSS_USER_ACCESS_DENIED' });
    return true;
  }
  return false;
}
```

**Result: REAL ENFORCEMENT** for payroll wage-slip detail (line 373) and balances (line 497). Identity is read from `X-Employee-Id` header (proxy-trusted) or `PAYROLL_EMPLOYEE_KEY_MAP` env mapping.

This is the **only** module in the codebase with object-level access control. Same pattern is missing on:
- `GET /api/employees/:id` (techno-kol-ops) - any authenticated user reads any employee record
- `GET /api/clients/:id` (techno-kol-ops) - any user reads any client + financials
- `GET /api/purchase-orders/:id` (onyx-procurement) - no scoping
- `GET /api/audit` (onyx-procurement) - any authenticated key reads global audit

---

## 3. Severity Summary

| # | Finding | Severity | Real or UI? |
|---|---------|----------|-------------|
| F1 | Cross-tenant access: zero `tenant_id` scoping in any route handler | CRITICAL | UI-only hide |
| F2 | RBAC engine exists but only 13% of routes call it | HIGH | UI-only hide for the gap |
| F3 | Default JWT secret committed in `.env.example` (techno-kol-ops) | CRITICAL | Real, but trivially bypassed |
| F4 | Unmapped API keys default to `admin` role (server.js:253) | HIGH | Real, but mis-defaults open |
| F5 | `/api/bridges/*`, `/api/ontology/snapshot` skip `authenticate` | HIGH | Not enforced |
| F6 | IDOR everywhere except payroll wage-slips | CRITICAL | UI-only hide |
| F7 | Admin pages: real `requireAdmin` gate at mount | OK | Real |
| F8 | Payroll wage-slip ownership: real `denyIfNotOwnerOrAdmin` | OK | Real |
| F9 | `AUTH_MODE=disabled` grants `owner` god mode anonymously (dev only, prod blocked) | MEDIUM | Real (dev) |
| F10 | `requireAdmin` only checks `role === 'admin'` literal - no inheritance, no permission strings | MEDIUM | Real but coarse |

---

## 4. Real Enforcement vs UI-Only Hide

**REAL backend enforcement (will reject unauthorized request):**
- `/api/admin/*` admin gate (techno-kol-ops)
- `/api/rfq/*`, `/api/purchase-orders/:id/approve`, subcontractors decide (onyx-procurement)
- `/api/payroll/wage-slips/:id` ownership (onyx-procurement)
- `/api/payroll/wage-slips/compute|sign|generate` permission gates
- `/api/vat/*`, `/api/annual-tax/*`, `/api/bank/*` (registered with `requirePermission` injected)

**UI-ONLY HIDE (server returns data to anyone authenticated):**
- All cross-tenant data: client read/write, employee read/write, work-order read/write across **every** tenant
- `/api/suppliers/*` CRUD - no permission check
- `/api/purchase-requests` CRUD - no permission check
- `/api/quotes` POST - no permission check
- `/api/audit` read - no permission check
- `/api/analytics/*` - no permission check
- `/api/bridges/procurement/purchase-orders` and `/api/bridges/ai/insights` - no `authenticate` at all
- Employee personal records on techno-kol-ops side: only one boolean role check (`admin`), no `read-own` enforcement matching the rbac.js definition

---

## 5. Recommended Fixes (P0)

1. **Mandatory tenant scope helper.** Add `withTenantScope(query, req)` that injects `WHERE tenant_id = $req.user.tenant_id` to every query. No exceptions. Block PR merge if a route uses raw `query` without it.
2. **Wrap every Express route in `requirePermission`.** The engine exists - call it. Add an ESLint rule `no-unguarded-route` that flags `app.(get|post|put|delete|patch)('/api/...'` lacking a permission middleware in the same line.
3. **Rotate and remove the committed JWT secret.** Delete from `.env.example`, fail-startup if value matches the leaked default.
4. **Default unmapped API keys to `viewer`, not `admin`.** Line 253 in server.js: change fallback from `'admin'` to `'viewer'` (least privilege).
5. **Add object-level checks beyond payroll.** `denyIfNotOwnerOrAdmin` pattern needs to extend to `clients/:id`, `employees/:id`, `work-orders/:id`. Use `req.user.tenant_id === row.tenant_id`.
6. **Apply `authenticate` to `/api/bridges/*` and `/api/ontology/snapshot`.**
7. **Replace `requireAdmin` with `requirePermission('users:manage')`** on techno-kol-ops to align with the proper role/permission matrix.
8. **DB-tier defense in depth:** finish RLS policies on `platform_organizations` and `platform_invoices` (per AGENT-124).

---

## 6. Files Reviewed

- `onyx-procurement/server.js` (1700+ lines)
- `onyx-procurement/src/auth/rbac.js`
- `onyx-procurement/src/payroll/payroll-routes.js`
- `onyx-procurement/src/middleware/rate-limits.js`
- `techno-kol-ops/src/index.ts`
- `techno-kol-ops/src/middleware/auth.ts`
- `techno-kol-ops/src/routes/admin.ts`
- `techno-kol-ops/src/routes/employees.ts`
- `techno-kol-ops/src/routes/clients.ts`
- `techno-kol-ops/src/routes/workOrders.ts`
- `techno-kol-ops/AUTH_AUDIT.md`
- `_qa-reports-25/AGENT-124-platform-multitenant.md`

**Verdict:** the platform has the components for real Palantir-grade RBAC but the wiring is selective. Today, a forged or unmapped API key plus a known UUID will exfiltrate or mutate any tenant's clients, employees, suppliers, and work orders. Admin pages and the payroll module are the only places where the gate is real and tight.
