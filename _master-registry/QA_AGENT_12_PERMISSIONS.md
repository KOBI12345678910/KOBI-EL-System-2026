# QA Agent 12 — Roles & Permissions

Generated: 2026-04-18
Scope: file-based audit of JWT auth middleware, RLS policies, role/permission seeds, and route guards

---

## Headline numbers

- **roles defined (governance.roles seed):** 17
  - `supabase/migrations/00009_seed_roles_permissions.sql:7-23`
  - codes: admin, executive, sales, sales_manager, procurement, procurement_manager, ops, ops_manager, finance, finance_manager, hr, hr_manager, payroll, payroll_manager, inventory_manager, ai_analyst, platform_admin
- **permissions defined (governance.permissions seed):** 69
  - `supabase/migrations/00009_seed_roles_permissions.sql:26-103`
- **role → permission mappings:** defined for 10 of 17 roles in `00013_seed_role_permission_mapping.sql` (sales, sales_manager, procurement, procurement_manager, finance, finance_manager, hr, hr_manager, payroll, payroll_manager plus platform_admin/executive fallback). 7 roles have no mapping rows (ops, ops_manager, inventory_manager, ai_analyst are silently empty-permission roles).
- **RLS policies (supabase `create policy` count):** 303 across 5 migration files
  - 00001_rls_helpers_and_policies.sql — 128
  - 00005_rls_policies.sql — 44
  - 00014_rls_policies_expansion_tables.sql — 40
  - 00017_app_menu.sql — 2
  - 00029_enterprise_30_tables_rls.sql — 89
- **middleware files with auth imports:** 30 (117 `requireRole|requirePermission|requireAuth|authenticate` tokens). Most are the `attachPermissions` import, not a 401-enforcer.
- **route files using any permission guard** (`requireEntityAccess|requireModuleAccess|requireActionAccess|requireSuperAdmin|requireBuilderAccess`): 20 of 335 route files (6%). 99 total guard invocations across those 20 files.
- **route files with ZERO auth/permission guard:** **~315 of 335** (94%)
- **`requireRole`/`requirePermission` helpers:** **ZERO usages** in any route. They are referenced nowhere in `api-server/src/lib/permission-middleware.ts` either — the abstraction advertised by the spec is not implemented as a function.

---

## CRITICAL: `authMiddleware` exported but never wired

File: `api-server/src/middleware/auth.ts:44`

```
export function authMiddleware(req, res, next) {
  // ... jwt.verify, 401 if missing/invalid
}
```

- `authMiddleware` is the ONLY function in the codebase that returns `401` when a token is missing or invalid.
- Grep shows it is referenced in **exactly one file**: `api-server/src/middleware/auth.ts:44` (its own definition).
- `api-server/src/app.ts:1139` mounts the API router as:
  ```
  app.use("/api", apiLimiter, requestTimeout, attachPermissions, auditMiddleware, router);
  ```
  — no `authMiddleware`.
- `attachPermissions` (`lib/permission-middleware.ts:46`) validates a token only if one is provided and **silently falls through with `userId=""`** when no token is presented (line 46-67, 112-147). It never returns 401. In dev, it even grants `isSuperAdmin: true` / `builderAccess: true` when no role assignments exist yet (line 134-146).
- Net effect: **every `/api/*` endpoint that does not explicitly call `requireEntityAccess|requireModuleAccess|requireActionAccess|requireSuperAdmin|requireBuilderAccess` is reachable with NO auth token**.

**Severity: CRITICAL.** Production default: anonymous reach to ~315 route files — thousands of endpoints.

---

## Endpoints reachable anonymously (top 30 by risk)

All of these are in route files that import `Router` and register `router.get|post|put|delete|patch(...)` with NO guard middleware on the handlers. Sample of the highest-impact ones:

| # | File | Risk |
|---|------|------|
| 1 | `api-server/src/routes/ar-enterprise.ts` | AR: invoices, payments |
| 2 | `api-server/src/routes/ap-enterprise.ts` | AP: vendor invoices, payments |
| 3 | `api-server/src/routes/finance.ts` | finance core |
| 4 | `api-server/src/routes/finance-enterprise.ts` | finance |
| 5 | `api-server/src/routes/finance-enterprise2.ts` | finance |
| 6 | `api-server/src/routes/finance-enterprise3.ts` | finance |
| 7 | `api-server/src/routes/finance-enterprise4.ts` | finance |
| 8 | `api-server/src/routes/finance-accounting.ts` | GL |
| 9 | `api-server/src/routes/finance-sap-upgrade.ts` | ERP upgrade |
| 10 | `api-server/src/routes/oracle-financial-core.ts` | financial core |
| 11 | `api-server/src/routes/israeli-payroll.ts` | salary data |
| 12 | `api-server/src/routes/payroll-engine.ts` | salary data |
| 13 | `api-server/src/routes/payroll-module.ts` | salary data |
| 14 | `api-server/src/routes/smart-payroll.ts` | salary |
| 15 | `api-server/src/routes/hr-enterprise.ts` | HR/PII |
| 16 | `api-server/src/routes/hr-workforce.ts` | HR/PII |
| 17 | `api-server/src/routes/hr-sap-upgrade.ts` | HR |
| 18 | `api-server/src/routes/hr-attendance-advanced.ts` | HR |
| 19 | `api-server/src/routes/recruitment.ts` | PII candidates |
| 20 | `api-server/src/routes/contracts.ts` | contracts |
| 21 | `api-server/src/routes/contract-templates.ts` | contracts |
| 22 | `api-server/src/routes/contract-lifecycle.ts` | contracts |
| 23 | `api-server/src/routes/digital-contracts-signatures-engine.ts` | e-sign |
| 24 | `api-server/src/routes/intercompany.ts` | intercompany postings |
| 25 | `api-server/src/routes/tax-management.ts` | tax data |
| 26 | `api-server/src/routes/three-way-match.ts` | AP match |
| 27 | `api-server/src/routes/three-way-matching.ts` | AP match (duplicate) |
| 28 | `api-server/src/routes/procurement-rfq.ts` | RFQ |
| 29 | `api-server/src/routes/security.ts` | security endpoints |
| 30 | `api-server/src/routes/sso.ts` | SSO config |

The 20 route files that DO use guards are mostly `platform/*` (admin UI, governance, roles, role-permissions, entities, modules, fields, menu-definitions, settings, translations, locales, actions, records, dms-migration, hr-migration, purchase-migration, strategy-modules-migration) plus `admin-cron-triggers.ts`, `builder-seed.ts`, `factory-seed.ts`, `recycle-bin.ts`, `system-data-reset.ts`. Platform/admin is at least partially fenced. Everything else is open.

---

## Tables without RLS policy (spot-check via AUDIT_REAL counts)

Prior audit (`AUDIT_REAL.md` line 36) reports 213 RLS policies against 237 total migration-defined tables. Delta implies ~24 tables without ANY policy. Exact enumeration would require a per-table diff scan; flagged as follow-up. In addition, `00029_enterprise_30_tables_rls.sql` was a catch-up migration, which confirms prior drift: expansion tables in `00010`/`00011`/`00027` were initially policy-less.

---

## Segregation-of-Duties violations

From `00013_seed_role_permission_mapping.sql`:

1. **`finance` role has `invoices.create|issue` + `payments.create|update|reconcile`** (lines 156-166). Same person can generate an invoice AND reconcile/disburse a payment — classic AP fraud surface.
2. **`finance_manager` same combo**, additionally with `customers.update` (lines 173-189) — can edit customer record, issue an invoice, approve and reconcile payment end-to-end.
3. **`platform_admin` has no permission restrictions** — seeded with all permissions via unfiltered wildcard (line 281+). Whoever holds this role can modify role-permission mappings for themselves AND edit other users' assignments via `routes/platform/role-permissions.ts`. No 4-eyes control on self-privilege-escalation.
4. **`admin` role has no explicit permissions seeded** — relies on `req.permissions.isSuperAdmin` short-circuit. In dev fallback (permission-middleware.ts:134-146), *any anonymous caller* becomes `isSuperAdmin` when no role assignments exist → instant admin impersonation on a freshly-seeded dev DB that accidentally runs in prod mode before seeds complete. Bootstrap risk.
5. **No role can edit `audit_logs` under RLS** — not verified exhaustively; audit policy file not found (`audit_logs` policy grep returned no matches in migration `*policy*` files). Gap flagged: no explicit RLS denying write/delete on the audit log table.

---

## Frontend route checks (spot-check)

Frontend uses `<PermissionGate>` / `role-based-nav.tsx` per `erp-app/src/components/permissions/` but `AUDIT_REAL.md` line 96 flags a broken import: `role-based-nav.tsx → ./PermissionGate` — gate component missing. Nav rendering proceeds without the gate on this file path (fail-open).

---

## Verdict

- roles_defined: 17
- permissions_defined: 69
- rls_policies: 303 (across 5 migrations)
- endpoints_without_auth (route-file level): ~315 of 335 (94%)
- tables_without_policy (est.): ~24
- admin_endpoints_reachable_anonymously: **HIGH** — all non-`platform/*` finance/HR/payroll endpoints, because `authMiddleware` is not mounted
- SoD_violations: **5** (finance create+pay+reconcile; finance_manager same; platform_admin self-privilege; admin dev fallback; audit_log write not explicitly denied)

**Verdict: FAIL (critical).** The single most important finding: `authMiddleware` in `api-server/src/middleware/auth.ts:44` is DEFINED but NEVER APPLIED in `app.ts` or `index.ts`. `attachPermissions` does not reject requests with no token. Per-route guards exist on only 20 of 335 route files. This is an auth-bypass at framework level, not a bug in any single endpoint.

Remediation (out of scope for this read-only report): mount `authMiddleware` before `attachPermissions` on `/api/*`, exempting `/api/auth/*` and the SSE token-via-query paths.
