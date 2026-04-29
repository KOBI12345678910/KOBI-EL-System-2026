# AGENT-288 — REAL CRUD Persistence Audit
**Date:** 2026-04-29
**Auditor:** Agent 288 (REAL-SYS #3)
**Scope:** Save buttons across all 4 services. Does data actually persist to DB? Is it readable on refresh? Tenant-scoped?
**Verdict:** **AMBER** — most core writes persist, but several CRITICAL paths use in-memory stores or localStorage. **Tenant scoping is non-existent across the entire ERP** (single-tenant by design, despite "3000 businesses / 3B users" claim in the latest commit).

---

## 1. Coverage Map

| Service | Persistence backend | Tenant scoping |
|---------|---------------------|----------------|
| TECHNO_KOL_OPS (3200) | Postgres (`pool.query`) | NONE — JWT has `{id, username, role}` only, no `tenant_id` |
| ONYX_PROCUREMENT (3100) | Supabase (`supabase.from(...)`) | NONE — RLS commented out in 001-supabase-schema.sql |
| PAYROLL_AUTONOMOUS (5173) | API → onyx Postgres | NONE |
| ONYX_AI (3300) | Mostly stateless | N/A |
| api-server (legacy / AI Task Manager) | Drizzle / pg `pool` | NONE |

`grep tenant_id|company_id|org_id` across `techno-kol-ops` and `onyx-procurement/server.js` → **zero matches in any INSERT/UPDATE**.

---

## 2. CRITICAL — Pages that pretend to save but lose data on refresh

### 2.1 `techno-kol-ops/src/routes/admin.ts` — Admin Users + Audit Log
**File:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\admin.ts`
- Line 9: `/* ─── In-memory stores (used until DB tables are ready) ─── */`
- Line 31: `const users: UserRecord[] = [...]` — 5 hard-coded mock users
- Line 39: `const auditLog: AuditEntry[] = [...]` — 8 mock entries pre-seeded
- Endpoints `POST /api/admin/users`, `PUT /api/admin/users/:id`, `DELETE /api/admin/users/:id` all mutate the JS array — **lost on every restart**.
- `GET /api/admin/audit-log` returns the in-memory list. The audit log shown to admins is **fabricated**, not derived from real activity.
- `GET /api/admin/stats` reports `database.migrations: 34` as a **hard-coded literal**, not queried.
- **Impact:** any admin role/user changes vanish on deploy or process restart. Security-critical.

### 2.2 `techno-kol-ops/src/routes/notifications.ts` — Notifications
**File:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\notifications.ts`
- Line 17: `// In-memory store (replace with DB queries when table is available)`
- Line 18: `const notificationsStore: Notification[] = []`
- All four endpoints (`GET /`, `POST /`, `POST /:id/read`, `POST /read-all`) operate on the array.
- Line 30 caps at 500 entries. Older notifications silently dropped, no archive.
- **Impact:** "Mark all read" survives until the next pod recycle. Inter-service notifications (onyx-procurement → techno-kol-ops via fire-and-forget POST in onyx server.js:33) hit this in-memory bucket and are lost.

### 2.3 `AI-Task-Manager/artifacts/erp-app/src/pages/finance/accounting-portal.tsx` — Accounting Settings
**File:** `...\AI-Task-Manager\artifacts\erp-app\src\pages\finance\accounting-portal.tsx`
- Line 1862: state initialised with company name "טכנו-כל עוזי", VAT rate, accountant name/phone/email
- Line 1866-1867: `localStorage.getItem("erp_accounting_settings")`
- Line 1870-1874: `save = () => { localStorage.setItem(...); setSaved(true); }` — no API call
- **Impact:** Critical accounting metadata (VAT rate, company tax ID, accountant contact) lives only in the user's browser. Switch browser/device → all settings are blank. Cannot be used for real BKMV-874 / 856 forms because the data the user entered isn't on the server.
- **Note:** A duplicate of this file exists in `erp-app/src/pages/finance/accounting-portal.tsx:1871` with identical bug.

### 2.4 `api-server/src/routes/anomaly-detection.ts` — Anomaly Acknowledgements
**File:** `...\api-server\src\routes\anomaly-detection.ts`
- Line 22: `const anomalyStore: Map<string, Anomaly> = new Map()`
- Lines 350-368: acknowledge / dismiss endpoints update the Map only.
- **Impact:** Operator clicks "Acknowledge" on a critical anomaly. Pod restarts → anomaly is back to "active". No audit trail of who acknowledged what.

### 2.5 `api-server/src/routes/techno-kol-uzi-ai-engine.ts` — AI Engine Subscriptions / Rules / Sync
**File:** `...\api-server\src\routes\techno-kol-uzi-ai-engine.ts`
- Line 470: `private subscriptions: Map<string, Subscription> = new Map()`
- Line 673: `private dataStore: Map<ModuleId, any[]> = new Map()` (capped at 1000 points/module)
- Line 1092: `private rules: Map<string, AutomationRule> = new Map()`
- Line 1307-1309: sync configs and intervals in Maps
- **Impact:** AI automation rules and external system sync configurations are **never persisted**. Any custom rule is lost on restart.

### 2.6 `erp-app/src/pages/platform/PlatformDashboard.tsx` — Global Business Platform
**File:** `...\erp-app\src\pages\platform\PlatformDashboard.tsx`
- Lines 53-55: queries `platform_organizations`, `platform_modules`, `platform_plans` from supabase.
- **No `CREATE TABLE platform_*` migration exists** in `onyx-procurement/supabase/migrations/` or `techno-kol-ops/src/db/schema.sql`. The only matches for `platform_organizations` in the repo are inside `lib-client/db/drizzle/0000_motionless_bishop.sql` and the AI-Task-Manager equivalent — neither wired to the running services.
- The 7-day revenue chart (lines 64-69) is **hard-coded** literal numbers.
- File is also **syntactically broken**: closing tags written as `</p>p>`, `</div>div>`, `</Card>Card>` (lines 23-39, 96-99). It will not compile.
- **Impact:** the marquee dashboard advertised in commit `7a02049 feat(platform): Add Global Business Platform Dashboard - 3000 businesses / 3B users` is non-functional both at compile-time and at the schema level.

---

## 3. PERSISTS but NOT TENANT-SCOPED (architectural CRITICAL)

Every save below writes to a real DB. None filters by tenant. Any authenticated user of ANY tenant can read/write everyone else's data.

### 3.1 techno-kol-ops Postgres
- `clients` (POST/PUT — `clients.ts:52,73`): no `tenant_id` column in `db/schema.sql:8`.
- `work_orders` (POST/PUT/PUT-progress — `workOrders.ts:88,142,168`): no tenant column (`schema.sql:83`).
- `tasks`, `leads`, `materials`, `gps_locations`, `employees`, `attendance`, `financial_transactions`, `order_events`: same — no `tenant_id` anywhere.
- `auth.ts:5` JWT shape `{ id, username, role }` — no tenant claim. Adding tenant scoping later means re-signing all tokens AND retrofitting every route.

### 3.2 onyx-procurement Supabase
- `suppliers`, `supplier_products`, `purchase_requests`, `quotes`, `purchase_orders`, `subcontractors` all persist via `supabase.from(...).insert()`. No tenant column declared.
- `001-supabase-schema.sql:421-423` (final block): `-- ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;` is **commented out**. RLS is OFF.
- Mass-assignment is now properly guarded (BUG-QA12-004 — `pickFields` allowlist), but cross-tenant read/write is wide open because there are no tenants.
- **NB:** `_merge-incoming/techno-uzi-erp` contains a separate Supabase tree (`00000_master_schema.sql` … `00071_remove_dangerous_anon_read_policies.sql`) with full RLS and `tenant_id`. That tree is **not running** — the live `onyx-procurement/supabase/migrations` directory has only 8 migrations and they are all single-tenant.

### 3.3 api-server (AI Task Manager artifacts)
- `projects-module.ts:44` — INSERT INTO projects, no tenant.
- `quote-builder.ts` reads `platform_settings` table for company branding — **single shared row**, every business in every tenant gets the same logo / VAT rate.

---

## 4. PERSISTS CORRECTLY (verified, non-tenant)

These do hit the DB and survive restarts. Listed here so the report is balanced:

| Path | Storage | File |
|------|---------|------|
| `POST /api/suppliers` | supabase suppliers + audit_log | onyx-procurement/server.js:605 |
| `PATCH /api/suppliers/:id` | supabase + audit | server.js:614 |
| `POST /api/purchase-requests` | supabase (parent + items in 2 inserts, **no transaction**) | server.js:652 |
| `POST /api/rfq/send`, `/api/rfq/:id/decide` | supabase | server.js:688,942 |
| `POST /api/quotes` | supabase | server.js:852 |
| `POST /api/purchase-orders/:id/approve|send` | supabase + audit | server.js:1212,1267 |
| `POST /api/subcontractors` + pricing | supabase | server.js:1400-1414 |
| `POST /api/payroll/wage-slips` | API → wage_slips table | payroll-autonomous/src/App.jsx:476 |
| `POST /api/clients`, `PUT /api/clients/:id` | Postgres clients | techno-kol-ops/.../clients.ts |
| `POST /api/work-orders` (+ events + financials) | Postgres, no transaction wrapper | workOrders.ts:88 |
| `POST /api/leads` | Postgres leads | leads.ts:29 |
| `POST /api/tasks`, `PUT /api/tasks/:id/status` | Postgres tasks + order_events | tasks.ts:37,69 |
| `POST /api/gps/update` | Postgres gps_locations + employee_current_location upsert | gps.ts:10 |
| Signature flow `POST /api/sign/:token` | Postgres signatures + document_audit_log | signatures.ts:197 |
| Audit log writes (onyx) | dual-write to `audit_logs` + legacy `audit_log` + domain event | server.js:498 |

---

## 5. Transaction / atomicity issues observed

`onyx-procurement/server.js:652-672` POST `/api/purchase-requests`: parent INSERT then child items INSERT in two awaits, no `BEGIN/COMMIT`. If the second insert fails, the request row is orphaned with zero items.

`techno-kol-ops/src/routes/workOrders.ts:88-115` POST `/`: order INSERT, then `order_events` INSERT, then conditional `financial_transactions` INSERT — three separate queries, no transaction. Partial state possible.

---

## 6. Refresh test — what survives a process restart?

| Action | Persists? | Reason |
|--------|-----------|--------|
| Create supplier (onyx) | YES | Supabase insert |
| Create work order (techno-kol-ops) | YES | pg insert |
| Add admin user (techno-kol-ops admin panel) | **NO** | in-memory `users[]` |
| View audit log (techno-kol-ops admin panel) | **FAKE** | hard-coded mock data |
| Mark notification read | **NO** | in-memory store |
| Save accounting settings (VAT rate, company ID) | **NO** | localStorage only |
| Acknowledge anomaly | **NO** | in-memory Map |
| Configure AI automation rule | **NO** | in-memory Map |
| Submit signed contract | YES | document_audit_log + signatures |
| Update GPS location | YES | gps_locations |
| Switch browsers and view "your" data | YES (single-tenant: everyone sees the same data) | no `tenant_id` filter exists |

---

## 7. Recommended fixes (priority order)

1. **P0 — kill the in-memory stores.** Replace `admin.ts` users[] / auditLog[] with `users` and `audit_logs` tables. Replace `notifications.ts` store with a `notifications` table. Replace `anomaly-detection.ts` `anomalyStore` Map with an `anomalies` table.
2. **P0 — accounting-portal SettingsTab.** Wire `save()` to `PUT /api/platform-settings` (the table already exists per quote-builder.ts:32). Remove the localStorage path entirely.
3. **P0 — Platform Dashboard.** Either delete `erp-app/src/pages/platform/PlatformDashboard.tsx` or fix its broken JSX AND ship a `platform_organizations / platform_modules / platform_plans` migration. Right now the route either won't compile or 404s on the table.
4. **P1 — wrap multi-statement writes in transactions** (purchase-requests, work-order create).
5. **P1 — multi-tenant retrofit:** add `tenant_id UUID` to every business table, add `tenant_id` claim to JWT, add a `tenantScope()` helper that injects `WHERE tenant_id = $X` into every route. Until this lands, the "3000 businesses" pitch is fiction.
6. **P2 — turn on RLS** in onyx-procurement Supabase (uncomment `001-supabase-schema.sql:421-423` and write real policies, not the placeholder `auth.role() = 'authenticated'`).

---

## 8. Files cited (absolute)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\admin.ts`
- `...\techno-kol-ops\src\routes\notifications.ts`
- `...\techno-kol-ops\src\routes\workOrders.ts`
- `...\techno-kol-ops\src\routes\clients.ts`
- `...\techno-kol-ops\src\routes\tasks.ts`
- `...\techno-kol-ops\src\routes\gps.ts`
- `...\techno-kol-ops\src\routes\leads.ts`
- `...\techno-kol-ops\src\routes\signatures.ts`
- `...\techno-kol-ops\src\middleware\auth.ts`
- `...\techno-kol-ops\src\db\schema.sql`
- `...\onyx-procurement\server.js`
- `...\onyx-procurement\supabase\migrations\001-supabase-schema.sql`
- `...\api-server\src\routes\anomaly-detection.ts`
- `...\api-server\src\routes\techno-kol-uzi-ai-engine.ts`
- `...\api-server\src\routes\projects-module.ts`
- `...\api-server\src\routes\quote-builder.ts`
- `...\AI-Task-Manager\artifacts\erp-app\src\pages\finance\accounting-portal.tsx`
- `...\erp-app\src\pages\finance\accounting-portal.tsx` (duplicate)
- `...\erp-app\src\pages\platform\PlatformDashboard.tsx`
- `...\payroll-autonomous\src\App.jsx`
