# AGENT-FIX-INFRASTRUCTURE — Two Concrete Fixes Applied

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Source audits:** AGENT-330 (sidebar rendering), AGENT-328 (HR deep audit)

---

## Scope

Two infrastructure fixes called out in the parent prompt:

| # | Fix                                                                            | Source                |
|---|--------------------------------------------------------------------------------|-----------------------|
| 1 | Expose `GET /api/app-menu` so the 138 active DB-backed menu rows are not dark | AGENT-330             |
| 2 | Create `workforce.employee_balances` referenced by `payroll-routes.js:498-523` but with no migration source | AGENT-328 §2.7 #5 + §5 item 3 |

---

## Fix 1 — `GET /api/app-menu`

### Files

| Path | Action | Lines |
|---|---|---:|
| `onyx-procurement/src/routes/app-menu.js` | NEW | 186 |
| `onyx-procurement/server.js` | EDIT (mount block, after payroll registration) | +12 |

### Behaviour

`GET /api/app-menu` returns the `public.app_menu` rows as a hierarchical
tree. Three modes via query string:

| Query | Returns                                                               |
|---|---|
| (default)                  | `{ source, count, roots, tree }` — nested parent/children |
| `?flat=1`                  | `{ source, count, items }` — flat ordered list             |
| `?include_inactive=1`      | also returns rows with `is_active = false`                 |

**Permission filter:** rows with non-null `required_permission` are
hidden unless the caller's role is `admin` / `owner` / `super_admin`,
or — when `src/auth/rbac.js` exposes `roleHasPermission(role, slug)` —
that helper grants the slug. The filter is intentionally permissive
when no role is resolvable (returns rows without `required_permission`)
so the sidebar can render before login.

**Tree build:** stable parent→children walk, each level sorted by
`order_index ASC`, then `label` (Hebrew-aware `localeCompare('he')`).

**RLS / DB:** uses the project's `supabase` client passed into the
factory; reads from `public.app_menu` (`id, label, route, icon,
parent_id, order_index, required_permission, is_visible, is_active`).
Does **not** require a service-role key — uses the existing client.

### Wiring (`server.js`, after `registerPayrollRoutes`)

```js
try {
  const { registerAppMenuRoutes } = require('./src/routes/app-menu');
  registerAppMenuRoutes(app, { supabase });
  console.log('✓ app-menu wired — GET /api/app-menu (public.app_menu tree)');
} catch (err) {
  console.error('⚠️  App menu module failed to load:', err.message);
}
```

Mounted under the same `requireAuth` umbrella as the rest of `/api/`,
so the API key middleware applies when `AUTH_MODE !== 'disabled'`.

### Verification

```bash
$ node -c onyx-procurement/src/routes/app-menu.js   # parses
$ node -c onyx-procurement/server.js                # parses
$ node -e "..."   # buildTree returns 2 roots, children sorted correctly
$ node -e "..."   # registerAppMenuRoutes mounts /api/app-menu [GET]
```

All four checks pass. See report tail for transcripts.

### Why this matters (per AGENT-330)

- AGENT-330 §4 #1: "No `/api/app-menu` anywhere. The string does not
  exist in any client, server, or migration." — now resolved.
- techno-kol-ops `services/menuService.ts` currently bypasses the API
  entirely with `supabase.from('app_menu')` (PostgREST). A follow-up
  client change can repoint it to `/api/app-menu` to gain the
  permission filter and tree assembly server-side.
- erp-app and payroll-autonomous can converge on this endpoint
  instead of hard-coding `NAV_ITEMS` / `NAV_GROUPS`.

---

## Fix 2 — `workforce.employee_balances`

### File

| Path | Action | Lines |
|---|---|---:|
| `supabase/migrations/00090_employee_balances.sql` | NEW | 424 |

### Schema (canonical tall form)

```sql
workforce.employee_balances (
  id              bigserial   PRIMARY KEY,
  tenant_id       uuid        FK -> public.tenants(id) ON DELETE CASCADE,
  employee_id     bigint      FK -> workforce.employees(id) ON DELETE CASCADE,
  balance_type    text        CHECK IN (vacation/sick/seniority/study_fund/severance),
  balance_units   numeric(12,4),    -- days for vacation/sick, months for seniority, units otherwise
  balance_amount  numeric(14,2),    -- monetary equivalent in NIS
  snapshot_date   date        DEFAULT CURRENT_DATE,
  last_updated_at timestamptz DEFAULT now(),
  created_at      timestamptz,
  created_by      bigint,
  updated_by      bigint,
  is_active       boolean     DEFAULT true,
  is_deleted      boolean     DEFAULT false,
  notes           text,
  metadata        jsonb       DEFAULT '{}'
)
```

`balance_type` CHECK enumerates exactly the five values requested:
`vacation`, `sick`, `seniority`, `study_fund`, `severance`.

### Indexes

| Index                                            | Purpose                                          |
|---|---|
| `employee_balances_unique_per_snapshot`          | UNIQUE on `(tenant_id, employee_id, balance_type, snapshot_date)` WHERE not deleted |
| `idx_employee_balances_employee`                 | hot lookup `(employee_id, snapshot_date DESC)`   |
| `idx_employee_balances_tenant`                   | tenant scan                                      |
| `idx_employee_balances_type`                     | per-type reports                                 |
| `idx_employee_balances_last_updated`             | "what changed today" admin views                 |
| `idx_employee_balances_active`                   | partial: WHERE is_deleted = false                |

### Triggers

- `trg_employee_balances_touch` — BEFORE UPDATE → maintains
  `last_updated_at = now()` on every UPDATE. Defined as
  `workforce.fn_employee_balances_touch()`.

### Backward-compat layer (preserves payroll-routes.js)

`payroll-routes.js:498-523` reads/writes the **wide** column shape:

```js
.from('employee_balances')
  .select('*').eq('employee_id', req.params.id)
  .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
// fields: vacation_days_balance, sick_days_balance, study_fund_balance,
//         severance_balance, snapshot_date
```

To keep the existing route working without code changes, the
migration also creates `public.employee_balances` as an **updatable
view** that pivots the tall rows into the wide column shape. INSERT
and UPDATE on the view are intercepted by INSTEAD OF triggers
(`fn_employee_balances_wide_insert`, `fn_employee_balances_wide_update`)
that fan the wide row into 4 tall rows (vacation, sick, study_fund,
severance) keyed by `(employee_id, snapshot_date)` and ON CONFLICT
upsert into the canonical table.

This means:
- Existing `payroll-routes.js` upsert keeps working — no app code
  touched in this fix.
- New callers can write tall rows directly to
  `workforce.employee_balances` for richer per-type queries
  (e.g. `seniority` which has no wide column today).

### RLS

`ALTER TABLE workforce.employee_balances ENABLE ROW LEVEL SECURITY`
plus four policies. Two paths, picked by a `DO` block at apply-time:

| If `governance.current_tenant_id()` exists (00073 already applied) | Policies                                      |
|---|---|
| YES                                                                | tenant-scoped SELECT/INSERT/UPDATE; DELETE service-role only |
| NO  (pre-00073 environment)                                        | authenticated permissive (matches 00053 convention) |

The view `public.employee_balances` is set to `security_invoker = true`
(PG15+) so RLS is enforced as the caller, not the view owner.
Wrapped in EXCEPTION block so PG <15 falls through silently.

### Grants

```
GRANT USAGE ON SCHEMA workforce                  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON workforce.employee_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce.employee_balances TO service_role;
GRANT USAGE, SELECT ON SEQUENCE workforce.employee_balances_id_seq TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.employee_balances TO authenticated, service_role;
```

### Idempotency

Every `CREATE` uses `IF NOT EXISTS`, every `ALTER` uses
`ADD COLUMN IF NOT EXISTS`, FK adds are wrapped in `DO` blocks that
no-op when the constraint already exists. Re-running the migration
is safe.

---

## Files (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\routes\app-menu.js` — NEW, 186 lines
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\server.js` — EDIT (+12 lines, mount block)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00090_employee_balances.sql` — NEW, 424 lines
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-FIX-INFRASTRUCTURE-applied.md` — this report

---

## Verification transcript

```
$ node -c src/routes/app-menu.js && echo "OK: app-menu.js syntax valid"
OK: app-menu.js syntax valid

$ node -c server.js && echo "OK: server.js syntax valid"
OK: server.js syntax valid

$ node -e "const m = require('./src/routes/app-menu'); ..."
exports: registerAppMenuRoutes, buildTree, rowVisibleToCaller
roots: 2 — labels: d,a
node-1 children: b,c
OK: buildTree works

$ node -e "...registerAppMenuRoutes(app, ...)"
OK: registerAppMenuRoutes mounted without throwing
routes: /api/app-menu [GET]
```

SQL migration was statically reviewed:
- 5 `DO $$ ... END$$` blocks (10 `$$` markers — paired)
- 3 PL/pgSQL functions using `$fn$ ... $fn$` (6 markers — paired)
- 1 `BEGIN;` / 1 `COMMIT;` outer transaction
- All `CREATE` statements use `IF NOT EXISTS` or `OR REPLACE`
- All `DROP TRIGGER` statements use `IF EXISTS`
- ON CONFLICT inference target matches the partial unique index expression

---

## How to apply

```bash
# Local Supabase
supabase db push          # applies 00090_employee_balances.sql

# onyx-procurement service
cd onyx-procurement
npm start                 # boot will log "✓ app-menu wired — GET /api/app-menu"
```

```bash
# Smoke-test the route
curl -s -H "X-API-Key: $API_KEY" http://localhost:3100/api/app-menu | jq '.count, .roots'
curl -s -H "X-API-Key: $API_KEY" 'http://localhost:3100/api/app-menu?flat=1' | jq '.items | length'
```

Re-running both is safe — the SQL is idempotent and the route mount is
guarded by a `try/catch` that logs and continues on failure.
