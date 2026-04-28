# AGENT-272 - Tenant Logic Helpers (PG Function + Middleware + Assertion)

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Date:** 2026-04-29
**Author:** Agent 272 - LOGIC #2
**Consumer:** Agent 214 (`00073_rls_hardening.sql`), all Express services
**Source contracts:** AGENT-213 (column), AGENT-214 (RLS), AGENT-09 (audit)

---

## Status

**READY.** Three artifacts:

| # | Artifact | Path | Owner |
|---|----------|------|-------|
| 1 | `governance.current_tenant_id()` PG function | `supabase/migrations/00072_create_governance_tenant_helper.sql` | RLS, all DB queries |
| 2 | `requireTenant()` Express middleware | `onyx-procurement/src/middleware/requireTenant.js` | All `/api/*` routes |
| 3 | `assertSameTenant()` JS helper | `onyx-procurement/src/lib/tenant/assertSameTenant.js` | Cross-entity actions |

All three resolve tenant via the **same precedence chain**: JWT claim `tenant_id` > Postgres GUC `app.current_tenant_id` > `governance.users_profile.tenant_id`.

---

## 1. PG function `governance.current_tenant_id()`

```sql
-- supabase/migrations/00072_create_governance_tenant_helper.sql
-- Idempotent. Run BEFORE 00073_rls_hardening.sql.
BEGIN;

CREATE SCHEMA IF NOT EXISTS governance;

CREATE OR REPLACE FUNCTION governance.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = governance, public
AS $fn$
DECLARE
  v_tenant uuid;
BEGIN
  -- (a) JWT claim 'tenant_id' (preferred - app sets on auth)
  BEGIN
    v_tenant := nullif(
      current_setting('request.jwt.claim.tenant_id', true), ''
    )::uuid;
    IF v_tenant IS NOT NULL THEN RETURN v_tenant; END IF;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- (b) Postgres session GUC (cron / edge functions / migrations)
  BEGIN
    v_tenant := nullif(
      current_setting('app.current_tenant_id', true), ''
    )::uuid;
    IF v_tenant IS NOT NULL THEN RETURN v_tenant; END IF;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- (c) Fallback: lookup the active auth user's profile
  SELECT up.tenant_id INTO v_tenant
  FROM governance.users_profile up
  WHERE up.auth_user_id = auth.uid()
    AND up.deleted_at IS NULL
  LIMIT 1;

  RETURN v_tenant;  -- NULL means RLS will block the row
END;
$fn$;

GRANT EXECUTE ON FUNCTION governance.current_tenant_id()
  TO authenticated, anon, service_role;

COMMENT ON FUNCTION governance.current_tenant_id() IS
  'Resolves active tenant: JWT > GUC > profile. NULL = no tenant context (RLS blocks).';

-- Convenience setter for server-side jobs that bypass JWT:
--   SELECT governance.set_tenant_context('00000000-0000-0000-0000-000000000000');
CREATE OR REPLACE FUNCTION governance.set_tenant_context(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant::text, false);
END;
$fn$;

GRANT EXECUTE ON FUNCTION governance.set_tenant_context(uuid)
  TO authenticated, service_role;

COMMIT;
```

`STABLE` lets the planner cache the value within a query; `SECURITY DEFINER`
lets it read `users_profile` when the caller lacks direct SELECT.

---

## 2. Express middleware `requireTenant()`

Path: `onyx-procurement/src/middleware/requireTenant.js`

```javascript
// onyx-procurement/src/middleware/requireTenant.js
// Resolves tenant_id from JWT > header > session, attaches to req.tenantId,
// sets the Postgres GUC for the request's DB pool, rejects if unresolved.

const jwt = require('jsonwebtoken');

const HEADER = 'x-tenant-id';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeJwtClaim(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.decode(auth.slice(7));
    return payload?.tenant_id || payload?.app_metadata?.tenant_id || null;
  } catch {
    return null;
  }
}

function resolveTenant(req) {
  // Order matches governance.current_tenant_id() in SQL.
  const fromJwt = decodeJwtClaim(req);
  if (fromJwt && UUID_RE.test(fromJwt)) return fromJwt;

  const fromHeader = req.headers[HEADER];
  if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;

  const fromSession = req.session?.tenant_id;
  if (fromSession && UUID_RE.test(fromSession)) return fromSession;

  return null;
}

/**
 * requireTenant() — Express middleware factory.
 *
 *  app.use('/api', requireTenant());
 *  app.get('/api/customers', requireTenant({ allowServiceRole: true }), ...);
 *
 * - Attaches req.tenantId
 * - Sets Postgres GUC `app.current_tenant_id` on req.db (pg client) so every
 *   subsequent query in this request runs scoped.
 * - Returns 401 / 403 on missing or malformed tenant.
 */
function requireTenant(opts = {}) {
  const { allowServiceRole = false } = opts;

  return async function requireTenantMiddleware(req, res, next) {
    // Service-role bypass (background jobs, internal sync). Caller must
    // pre-set req.serviceRole = true after verifying a signed header.
    if (allowServiceRole && req.serviceRole === true) {
      req.tenantId = null;
      return next();
    }

    const tenantId = resolveTenant(req);
    if (!tenantId) {
      return res.status(401).json({
        error: 'TENANT_REQUIRED',
        message: 'No tenant context. Provide JWT, x-tenant-id header, or session.',
      });
    }

    req.tenantId = tenantId;

    // Push GUC down to the per-request pg client so RLS sees it server-side.
    if (req.db && typeof req.db.query === 'function') {
      try {
        await req.db.query('SELECT governance.set_tenant_context($1)', [tenantId]);
      } catch (err) {
        return res.status(500).json({
          error: 'TENANT_CONTEXT_FAILED',
          message: err.message,
        });
      }
    }

    next();
  };
}

module.exports = { requireTenant, resolveTenant, HEADER };
```

**Mounting** (OPS / PROCUREMENT / PAYROLL / AI services):
`app.use('/api', pgPoolPerRequest, requireTenant());`

---

## 3. Helper `assertSameTenant()`

Path: `onyx-procurement/src/lib/tenant/assertSameTenant.js`

Used in orchestrator actions and 360-page handlers to prevent cross-tenant
joins (e.g., creating a Quote that links a Customer from tenant A to a
Project from tenant B).

```javascript
// onyx-procurement/src/lib/tenant/assertSameTenant.js
// Throws TenantMismatchError when records or ids span > 1 tenant.

class TenantMismatchError extends Error {
  constructor(expected, found, context) {
    super(
      `Tenant mismatch in ${context || 'operation'}: expected ${expected}, found ${found}`
    );
    this.name = 'TenantMismatchError';
    this.code = 'TENANT_MISMATCH';
    this.status = 403;
    this.expected = expected;
    this.found = found;
    this.context = context;
  }
}

/**
 * assertSameTenant(expected, items, opts)
 *
 *   expected  string  the request's req.tenantId
 *   items     array   records, each with .tenant_id, OR strings (uuids handled
 *                     by opts.lookup)
 *   opts.context   string   label used in the error
 *   opts.lookup    async fn (id) => record, used when items are bare ids
 *
 *  Throws TenantMismatchError on first mismatch.
 *  Throws when expected is falsy (defends against forgetting requireTenant).
 */
async function assertSameTenant(expected, items, opts = {}) {
  if (!expected) {
    throw new TenantMismatchError(
      '<unset>',
      '<any>',
      opts.context || 'assertSameTenant'
    );
  }
  if (!Array.isArray(items)) items = [items];

  for (const item of items) {
    if (item == null) continue;

    let record = item;
    if (typeof item === 'string') {
      if (!opts.lookup) {
        throw new Error('assertSameTenant: opts.lookup required for id strings');
      }
      record = await opts.lookup(item);
      if (!record) continue; // 404 surfaced by caller
    }

    const tid = record.tenant_id ?? record.tenantId;
    if (tid && tid !== expected) {
      throw new TenantMismatchError(expected, tid, opts.context);
    }
  }
}

module.exports = { assertSameTenant, TenantMismatchError };
```

**Example call** in `orchestrator.execute('Quote.send')`:

```js
const customer = await db.customers.findById(input.customer_id);
const project  = await db.projects.findById(input.project_id);
await assertSameTenant(req.tenantId, [customer, project], {
  context: 'Quote.send',
});
```

---

## Wiring contract (for AGENT-214)

| Layer | Reads | Sets |
|-------|-------|------|
| HTTP | JWT / header / session | `req.tenantId` |
| pg pool | `req.tenantId` | GUC via `governance.set_tenant_context()` |
| RLS | `governance.current_tenant_id()` | predicate |
| Action | `req.tenantId` + record | `assertSameTenant()` |

No-tenant requests 401 at HTTP. Cron/edge sets the GUC via `governance.set_tenant_context()`. Otherwise `current_tenant_id()` returns NULL and AGENT-214 RLS blocks every row.

---

## Tests required

- `requireTenant.test.js` - valid/missing JWT, malformed UUID, service-role bypass, GUC propagation.
- `assertSameTenant.test.js` - same tenant, mixed tenants, empty array, null `expected`, lookup mode.
- `00072_create_governance_tenant_helper.test.sql` - JWT, GUC, profile fallback, NULL when none.

**Ready for AGENT-214.** Run `00072` before `00073`.
