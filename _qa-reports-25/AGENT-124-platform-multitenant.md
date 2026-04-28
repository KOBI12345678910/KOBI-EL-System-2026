# AGENT-124 - Multi-Tenant Platform Tables Audit

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Scope:** `platform_organizations`, `platform_subscriptions`, `platform_plans`, `platform_invoices`, `platform_modules`, `tenant_modules`, `tenant_users` (row-level isolation, billing flow)
**Date:** 2026-04-29
**Auditor:** Agent 124

---

## Status

**FAIL - the platform-tier control plane is half-wired and unsafe.** The schema exists, but RLS policies are missing on the most sensitive tables, identity helpers are inconsistent across schemas, and the entire billing flow is dormant. Two parallel `tenant_users`/`tenant_modules` implementations (one in `public.*`, one in `platform.*`) coexist, with the `platform.*` copies completely empty.

| Check | Result | Severity |
|-------|--------|----------|
| Tables present (live row counts) | `platform_organizations`=10, `platform_subscriptions`=0, `platform_plans`=5, `platform_invoices`=0, `platform_modules`=14, `tenant_modules`=149, `tenant_users`=3 | OK |
| Duplicate `tenant_users` / `tenant_modules` (`public.*` vs `platform.*`) | YES, both pairs exist | HIGH |
| RLS enabled but ZERO policies | `platform_organizations`, `platform_invoices` | CRITICAL |
| Inconsistent identity helper across policies | `email`-from-JWT vs `auth.uid()` | HIGH |
| FK indexes missing | `platform_subscriptions.org_id`, `platform_subscriptions.plan_id`, `platform_invoices.org_id`, `platform_invoices.subscription_id`, `tenant_users.tenant_id`, `tenant_modules.module_key` | HIGH |
| Duplicate FK constraints on same column | `tenant_modules.tenant_id` and `tenant_users.tenant_id` each declared 3x (mix of CASCADE / NO ACTION) | HIGH |
| Subscriptions / invoices populated | 0 / 0 - billing flow is dormant | HIGH |
| Orphaned tenants | 13 tenants in `public.tenants`, only 10 `platform_organizations`, only 3 `tenant_users` | MEDIUM |

---

## 1 - Schema and live data

### 1.1 Tables and row counts (live)
```
public.platform_organizations  10
public.platform_subscriptions   0
public.platform_plans           5
public.platform_invoices        0
public.platform_modules        14
public.tenant_modules         149  (across 13 distinct tenant_ids)
public.tenant_users             3  (only 3 owners present)
platform.tenant_modules         0  (empty parallel table)
platform.tenant_users           0  (empty parallel table)
public.tenants                 13
```

`platform_organizations.id` matches `public.tenants.id` for all 10 orgs (likely intentional aliasing), but the `org_id <-> tenant_id` linkage is **NOT enforced by an FK**. There is no `platform_organizations.tenant_id` column, and no FK from `platform_organizations.id` -> `public.tenants.id`. A future change that diverges these UUIDs will silently break every cross-table join.

### 1.2 Plans (catalog)
The 5 `platform_plans` are populated and price-laddered:

| plan_code | max_users | max_end_users | $/mo |
|-----------|-----------|---------------|------|
| starter | 5 | 1,000 | $49 |
| growth | 20 | 50,000 | $199 |
| professional | 100 | 500,000 | $599 |
| enterprise | 1,000 | 100,000,000 | $1,999 |
| global | 10,000 | 1,000,000,000 | $9,999 |

Catalog read is publicly allowed via policy `public_plans` (`SELECT WHERE is_active = true`) - acceptable.

### 1.3 Modules (catalog)
14 platform modules, also publicly readable via `public_modules` (`SELECT WHERE is_active = true`). 149 `tenant_modules` rows distributed across 13 tenants:
- `43298624-...` (test-restaurant): 59 modules
- `4d60841d-...` (kobiellkayam@gmail.com / TECHNO-KOL): 30 modules
- `b9412bb0-...`: 10 modules
- `5e600427-...` (demo@pizzapalace.com): 7 modules
- `00b4bd4d-...`: 6 modules

13 distinct tenants in `tenant_modules` but only 3 `tenant_users` rows - **10 tenants have installed modules but have no user row**, meaning their RLS predicates return zero rows and the org cannot self-administer.

---

## 2 - Row-level isolation

### 2.1 RLS state per table
```
platform_organizations  RLS=ON  policies=0   <-- INACCESSIBLE except service_role
platform_subscriptions  RLS=ON  policies=1
platform_plans          RLS=ON  policies=1   (public read)
platform_invoices       RLS=ON  policies=0   <-- INACCESSIBLE except service_role
platform_modules        RLS=ON  policies=1   (public read)
tenant_modules          RLS=ON  policies=1   (public.* version)
tenant_users            RLS=ON  policies=1   (public.* version)
```

`platform_organizations` and `platform_invoices` have RLS enabled with **zero policies**. Under PostgREST anon/auth roles this means rows are invisible. The frontend dashboard at `erp-app/src/pages/platform/PlatformDashboard.tsx` (line 53) calls `supabase.from('platform_organizations').select('*')` - this query will return an empty array for any non-service-role caller, which matches the dashboard's "Ready for 3,000 Businesses" empty-state fallback. This is not a working setup; it is RLS-by-omission.

### 2.2 Existing policies (verbatim)
- `platform_subscriptions.tenant_isolation_subscriptions` -> `org_id = (SELECT org_id FROM platform_users WHERE auth_user_id = auth.uid() LIMIT 1)` - references `platform_users` (which exists per `information_schema.tables`) but **NOT** `tenant_users`. So the platform tier uses `platform_users.auth_user_id` as the identity hook, while...
- `public.tenant_users.tenant_users_select_policy` -> `tenant_id IN (SELECT tenant_id FROM tenant_users WHERE email = auth.jwt() ->> 'email')`
- `public.tenant_modules.tenant_modules_select_policy` -> same email-from-JWT pattern.
- `platform.tenant_users.tenant_users_select_own` -> `tenant_id IN (SELECT tu.tenant_id FROM platform.tenant_users tu WHERE tu.user_id = auth.uid())` - uses `auth.uid()`, not email.

**Three different identity hooks** (`platform_users.auth_user_id`, `tenant_users.email`, `platform.tenant_users.user_id`) are in active production. A user who exists in one table but not the others will see partial data. There is no shared `current_tenant_id()` SECURITY DEFINER function (matches AGENT-09's M1 recommendation - never landed).

### 2.3 What is missing
- `platform_organizations` needs a tenant-scoped SELECT policy (`id = current_tenant_id()`) **plus** a platform-admin policy (`auth.uid() IN platform_admins`). Today neither exists.
- `platform_invoices` needs `org_id = current_tenant_id()` for the org's own bookkeeping plus an admin override.
- `platform_modules`, `platform_plans` are catalogs and the public-read policy is correct, but write paths (INSERT/UPDATE/DELETE) have **no policy at all**, meaning anon/authed users cannot mutate. That is fine, but the absence is implicit, not deliberate.

---

## 3 - Foreign keys, indexes, structural bugs

### 3.1 Duplicate FK constraints (HIGH)
`tenant_modules.tenant_id` and `tenant_users.tenant_id` each appear **6 times** in `information_schema.referential_constraints` (3 distinct constraints, with both `CASCADE` and `NO ACTION` rules on the same column). On DELETE this means Postgres has to evaluate every constraint - and the existence of mixed CASCADE/NO ACTION rules on the same column is itself a logic bug. Suspected source: a migration was re-run without `IF NOT EXISTS` guards.

### 3.2 FK indexes missing (HIGH)
Indexes that exist:
- `platform_organizations`: `idx_platform_orgs_country`, `idx_platform_orgs_plan`, `idx_platform_orgs_status` - GOOD
- `tenant_modules`: `idx_tenant_modules_tenant`, unique `(tenant_id, module_key)` - GOOD

Indexes MISSING (every one of these is referenced by a join or RLS predicate):
- `platform_subscriptions.org_id` (FK -> `platform_organizations`, used by RLS via `platform_users.org_id`)
- `platform_subscriptions.plan_id`
- `platform_invoices.org_id`
- `platform_invoices.subscription_id`
- `tenant_users.tenant_id` (the RLS predicate joins it 1-N)
- `tenant_users.email` (every RLS check on `tenant_modules`/`tenant_users` re-derives via JWT email lookup)

Without `tenant_users(email)` and `tenant_users(tenant_id)` indexes, every RLS predicate on `tenant_modules` does a sequential scan of `tenant_users` per row. Today that is 3 rows; at production scale it will collapse.

### 3.3 CHECK constraints missing
Per AGENT-09:
- `platform_organizations.status`, `platform_subscriptions.status`, `platform_invoices.status`, `tenant_modules.status` all `text` with no enum check.
- `platform_subscriptions.amount` numeric with no `>= 0`.
- `platform_organizations.max_users / max_end_users / current_users / current_end_users` numeric with no `>= 0`.

---

## 4 - Billing flow

The billing pipeline is wired structurally (`platform_organizations.plan_id -> platform_plans.id`, `platform_subscriptions.org_id -> platform_organizations.id` CASCADE, `platform_invoices.org_id -> platform_organizations.id`, `platform_invoices.subscription_id -> platform_subscriptions.id`), but **non-functional**:

1. All 10 `platform_organizations` have `plan_id` populated but **0 of 10 have a `platform_subscriptions` row**. The intended flow `org plan -> subscription -> invoice` is broken at step 2.
2. `platform_invoices` has 0 rows. No invoicing has ever run.
3. There is no Stripe / Paddle / Tranzila integration anywhere in `api-server/` (grep confirms no provider client). `platform_subscriptions.metadata` JSONB is the only attachment point and is unused.
4. `platform_organizations.trial_ends_at`, `plan_expires_at` are nullable with no scheduled job to enforce them. A trial does not actually end.
5. There is no usage-metering table linking `platform_modules` consumption to invoice line items - the only counters are denormalised `platform_organizations.current_users / current_end_users / storage_used_gb`, all of which are zero for every org.

The frontend dashboard renders `Monthly Revenue $2.4M` as a **hardcoded literal** (`erp-app/src/pages/platform/PlatformDashboard.tsx` line 124), not from any aggregation over `platform_invoices`. The `chartData` and `planDist` arrays are also hardcoded. The dashboard is a mock - the only live values it pulls are org/module/plan lists from `from(...).select('*')`, all three of which return [] for the anon role thanks to the missing policies on `platform_organizations`.

---

## 5 - Cross-tenant leak risk

| Path | Today | After naive fix |
|------|-------|-----------------|
| `SELECT * FROM platform_organizations WHERE id = $1` (anon) | 0 rows (RLS=on, no policy) | Will leak to any authenticated user unless tenant predicate is added |
| `SELECT * FROM platform_invoices WHERE org_id = $1` (anon) | 0 rows | Same |
| `SELECT * FROM tenant_users WHERE tenant_id = $1` (auth) | Filtered by `email = auth.jwt() ->> 'email'` | OK if email is the user's own; **fails open** if a user has multiple `tenant_users` rows under different tenants (i.e. multi-tenant admin) - they see all of those tenants' rows and there is no separate role check |
| `SELECT * FROM tenant_modules` (auth) | Filtered by tenant via `tenant_users.email` | Same fail-open as above for cross-tenant admins |
| `INSERT INTO platform_invoices` (any role) | Blocked (no policy) | Currently impossible from anon/auth - so any future billing job must run as `service_role` |

Email-as-identity (`auth.jwt() ->> 'email'`) is replaceable: a token forged with a different `email` claim would impersonate. With Supabase Auth this is mostly mitigated (JWT is server-signed), but combining email-based RLS in `public.tenant_users` with `auth.uid()`-based RLS in `platform.tenant_users` means any inconsistency between the two pathways becomes a privilege boundary issue.

---

## 6 - Recommended migrations (ordered)

### M1 - `00072_unify_tenant_identity.sql`
- Drop the `platform.tenant_users` and `platform.tenant_modules` tables OR drop the `public.*` ones - pick one schema. Right now both exist; the `platform.*` ones are empty so dropping them is the cheap path.
- Create `governance.current_tenant_id() RETURNS uuid` reading from `tenant_users.tenant_id` keyed by `auth.uid()` (move identity off email).
- Add `tenant_users.user_id uuid REFERENCES auth.users(id)`, backfill from `email`, add UNIQUE constraint, then deprecate the email path.

### M2 - `00073_platform_organizations_rls.sql`
```sql
CREATE POLICY platform_orgs_select_own ON platform_organizations FOR SELECT
  USING (id = governance.current_tenant_id() OR governance.is_platform_admin());
CREATE POLICY platform_orgs_update_own ON platform_organizations FOR UPDATE
  USING (id = governance.current_tenant_id())
  WITH CHECK (id = governance.current_tenant_id());
CREATE POLICY platform_orgs_admin_all ON platform_organizations FOR ALL
  USING (governance.is_platform_admin());
```

### M3 - `00074_platform_invoices_rls.sql`
- `SELECT`: `org_id = governance.current_tenant_id() OR is_platform_admin()`.
- `INSERT/UPDATE/DELETE`: platform-admin only (invoices are issued by the platform, not the tenant).

### M4 - `00075_platform_billing_indexes.sql`
- `CREATE INDEX CONCURRENTLY idx_platform_subscriptions_org ON platform_subscriptions(org_id);`
- `CREATE INDEX CONCURRENTLY idx_platform_subscriptions_plan ON platform_subscriptions(plan_id);`
- `CREATE INDEX CONCURRENTLY idx_platform_invoices_org ON platform_invoices(org_id);`
- `CREATE INDEX CONCURRENTLY idx_platform_invoices_subscription ON platform_invoices(subscription_id);`
- `CREATE INDEX CONCURRENTLY idx_tenant_users_tenant ON tenant_users(tenant_id);`
- `CREATE INDEX CONCURRENTLY idx_tenant_users_email ON tenant_users(email);` (kept until M1 finishes the email -> uid migration)

### M5 - `00076_dedupe_tenant_fk_constraints.sql`
- `ALTER TABLE tenant_modules DROP CONSTRAINT ...` for the 2 redundant constraints on `tenant_id`. Keep one CASCADE constraint.
- Same for `tenant_users`.

### M6 - `00077_billing_check_constraints.sql`
- `platform_organizations.status IN ('trial','active','suspended','cancelled')`.
- `platform_subscriptions.status IN ('trial','active','past_due','cancelled')`.
- `platform_invoices.status IN ('draft','sent','paid','void')`.
- `platform_subscriptions.amount >= 0`.
- `platform_organizations.max_users >= 0`, `max_end_users >= 0`, `current_users >= 0`, `current_end_users >= 0`.
- `platform_organizations.current_users <= max_users` (soft-cap warning - or trigger).

### M7 - `00078_seed_subscriptions_for_existing_orgs.sql`
- For each of the 10 `platform_organizations`, create a `platform_subscriptions` row using the org's `plan_id`. Without this, every billing query returns no rows and the dashboard is forever empty.

### M8 - `00079_billing_provider_integration.sql` (separate epic)
- Add `platform_subscriptions.provider`, `provider_subscription_id`, `provider_customer_id`.
- Cron job to mark `trial_ends_at` -> `status='past_due'`.
- Webhook receiver to ingest invoice events.

---

## 7 - Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\platform\PlatformDashboard.tsx` (frontend reads `platform_organizations`, `platform_modules`, `platform_plans`; revenue chart data is hardcoded)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\db\src\schema\platform-modules.ts` (Drizzle schema for `platform_modules` only - none of the other 6 platform/tenant tables are in Drizzle, they are Supabase-only)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\db\src\schema\tenants.ts` (legacy `tenants` table, unrelated to `platform_organizations`)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md` (overlapping findings on `platform_*` RLS gaps and orphaned tables - this report extends those findings to billing flow specifics)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\QA-AGENT-55-MULTI-TENANT.md` (predates the platform tier - documented the gap that this tier is meant to fill, but the implementation is incomplete)

---

## 8 - Bottom line

The platform schema is the right shape (org -> plan, org -> subscription -> invoice, tenant -> users, tenant -> modules), but the actual control surface is unsafe and inert:

1. **Two of the three sensitive tables (`platform_organizations`, `platform_invoices`) are accessible only to `service_role`.** Any client-side code calling them returns empty.
2. **Three different identity hooks** (`platform_users.auth_user_id`, `tenant_users.email`, `platform.tenant_users.user_id`) are wired to RLS predicates simultaneously. Pick one.
3. **Billing flow is dormant** - 0 subscriptions, 0 invoices, no provider integration, the trial clock does not tick, and the dashboard's revenue figure is a hardcoded literal.
4. **Schema bugs**: duplicate FK constraints on `tenant_modules.tenant_id` and `tenant_users.tenant_id`, missing indexes on every billing FK, no CHECK constraints on `status` columns.
5. **Drift from Drizzle**: only `platform_modules` is mirrored in `lib-client/db/src/schema/`. The other 6 tables exist only in Supabase and are not under migration version control in the application repo.

Land M1-M7 above before letting any non-service-role traffic near these tables.
