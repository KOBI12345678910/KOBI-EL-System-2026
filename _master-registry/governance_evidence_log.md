## Governance Domain — Evidence Log

**Generated:** 2026-04-18
**Branch:** claude/busy-faraday
**Target:** `C:\Users\kobi\Projects\techno-kol-uzi-2026`

### 1. Safe SQL helper (mandatory)
- **Path:** `api-server/src/routes/_safe-list-helpers.ts`
- **Primitives:** `buildSafeWhere`, `buildSafeOrderBy`, `buildSafeOrderByFragment`, `safeLimit`, `safeOffset`, `safeIdentifier`, `buildSafeSetClause`, `buildListResponse`, `safeDateParam`.
- **Decision:** every governance LIST endpoint MUST import from this module. No `sql.raw()` with user-derived input.

### 2. Existing governance tables (from 00000 + 00019)
- `governance.users_profile` (14 rows seeded)
- `governance.roles` (17 rows seeded)  — canonical (D003 flagged duplicate in 00000/00019)
- `governance.permissions` (62 rows) — canonical
- `governance.role_permissions` (317 rows)
- `governance.user_roles`
- `governance.set_updated_at()` trigger function exists
- `governance.current_user_profile_id()` helper exists
- `governance.audit_logs` (2 rows — legacy structure)
- `governance.config_entries` (6 rows)
- `governance.health_checks` (4 rows)

### 3. 00047 procurement mirror style
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for housekeeping (is_active, is_deleted, metadata, record_code).
- `CREATE TABLE IF NOT EXISTS` for missing tables.
- `CHECK` constraints for status lifecycles.
- Audit triggers call `governance.set_updated_at()`.
- RLS enabled on NEW tables with 3 baseline policies.
- Fully idempotent.

### 4. Route style — procurement/suppliers.ts + finance/invoices.ts
- `import { authMiddleware } from "../../middleware/auth"` → `router.use(authMiddleware)`.
- `import { logAudit } from "../../lib/audit-log"` — signature: `{ user_id, table_name, record_id, action, old_values?, new_values?, ip_address?, notes? }`.
- Zod `.safeParse` → 400 on failure.
- Drizzle `sql` tagged templates for parameterized queries.
- Hebrew user-facing error messages ("חשבונית לא נמצאה").

### 5. auth middleware
- `authMiddleware` sets `req.userId`, `req.username`, `req.isSuperAdmin`.
- `adminMiddleware` (already exported) blocks non-superadmin with 403 "אין הרשאה - דרוש גישה מנהל".
- For governance we reuse `adminMiddleware` as the `requireRole('admin')` equivalent — NO new middleware needed.

### 6. Zod barrel pattern (procurement/index.ts)
- One file per entity; `index.ts` re-exports.
- `_shared.ts` with `ListQueryBaseSchema`, `MetadataSchema`.
- Consumed as `@workspace/api-zod/procurement`; governance will expose `@workspace/api-zod/governance`.

### 7. Registry gates (governance.md §4)
- **recover_now:** canonicalize roles/permissions (done in 00019); build missing admin pages.
- **build_now:** webhook admin, integration admin, feature flags, config, SLA timers.
- 8 RED rows (built_not_exposed) this batch closes: escalation_rules, integration_connections, integration_sync_logs, object_permissions, webhook_endpoints, config_entries, workflow_step_executions, workflow_instances (workflow admin separate — retained internal for this tier).

### 8. App mounting conventions
- Domain routers are mounted under `/api/v2/<domain>` in `api-server/src/routes/index.ts`.
- Pages for admin surfaces live under `erp-app/src/pages/governance/` and are lazy-imported in `App.tsx` behind `adminGuard`.

### Reserved migrations
- 00059 — `governance_domain_complete.sql`
- 00060 — `governance_menu_wiring.sql`
