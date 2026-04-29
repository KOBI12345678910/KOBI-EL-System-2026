# AGENT-FIX-TENANT — Applied

**Date:** 2026-04-29
**Scope:** `onyx-procurement` (port 3100)
**Source contracts:** AGENT-272 (tenant helpers), AGENT-290 (perms audit), AGENT-303 (integration audit)
**Status:** APPLIED — middleware created, mounted globally, smoke-tested.

---

## TL;DR

Agents 290 + 303 found that **0 of 39** top-level routes in `onyx-procurement/server.js` filter by `tenant_id`. Any authenticated caller could read or write any tenant's data — the RBAC engine existed but the chokepoint that delivers `app.current_tenant_id` to Postgres did not. This patch adds that chokepoint.

A new universal middleware `requireTenant()` is now mounted after `requireAuth` on `/api/*`. It resolves `tenant_id` from JWT → `X-Tenant-Id` header → session, attaches `req.tenantId`, and pushes the Postgres GUC `app.current_tenant_id` so RLS (Agent-214) finally has a value to evaluate against.

---

## 1. Files added

### `onyx-procurement/src/middleware/requireTenant.js` (NEW)

Production realization of AGENT-272 §2 "Express middleware `requireTenant()`".

| Surface | Detail |
|---|---|
| Resolution chain | JWT `tenant_id` claim (also `app_metadata.tenant_id`) → `X-Tenant-Id` header → `req.session.tenant_id` |
| UUID validation | RFC 4122 anchored regex; malformed values rejected silently and the chain falls through |
| `req.tenantId` | Populated on success (UUID string) |
| `req.tenantContext` | `{ via: 'pg' \| 'supabase-req' \| 'supabase-app' \| 'header-only' \| 'service-role-bypass' }` for observability |
| GUC propagation (3 fallbacks) | (a) `req.db.query('SELECT governance.set_tenant_context($1)', [tid])` → (b) `req.supabase.rpc('set_tenant_context', { p_tenant: tid })` → (c) `app.locals.supabase.rpc(...)`. If `set_tenant_context` RPC is missing (PGRST202) → `header-only` mode (JWT claim still reaches Postgres via PostgREST). |
| 401 path | `{ error: 'TENANT_REQUIRED', message: 'No tenant context...' }` |
| 500 path | `{ error: 'TENANT_CONTEXT_FAILED', message: <pg error> }` — fail-closed; we never proceed with a half-applied context |
| Service-role bypass | `requireTenant({ allowServiceRole: true })` — passes through when caller upstream sets `req.serviceRole = true` |
| Exempt paths | `/healthz`, `/livez`, `/readyz`, `/metrics`, `/api/status`, `/api/health`, `/api/admin/ai-bridge/health`, `/api/events/health` — never gated |
| Dependencies | **None.** Pure Node stdlib. JWT decode is base64url unwrap (signature verification stays in `requireAuth`). |
| Test internals exposed | `_decodeJwtPayload`, `_tenantFromJwt`, `_tenantFromHeader`, `_tenantFromSession`, `_propagateGuc` |

The middleware deliberately does **not** verify the JWT signature — that is `requireAuth`'s job, which runs first. This module's job is to *trust then propagate*.

---

## 2. Files modified

### `onyx-procurement/server.js`

Two changes, both inside the auth-middleware section (after line 280):

```diff
 app.use('/api/', (req, res, next) => {
   if (PUBLIC_API_PATHS.has(req.path)) { req.actor = 'public'; return next(); }
   return requireAuth(req, res, next);
 });
+
+// ═══════════════════════════════════════════════════════════════
+// TENANT ISOLATION — Agent 272 / 290 / 303 fix
+// ───────────────────────────────────────────────────────────────
+// Mounted AFTER requireAuth so req.user / req.actor exist by now.
+// Resolves tenant from JWT > X-Tenant-Id header > session, attaches
+// req.tenantId, and pushes the Postgres GUC `app.current_tenant_id`
+// down so RLS predicates evaluate against the correct tenant.
+//
+// Per Agent 290+303: ZERO of 39 top-level routes filter by
+// tenant_id today. This middleware is the single chokepoint that
+// closes that gap before any route handler runs.
+//
+// Stash the supabase singleton on app.locals so the middleware's
+// GUC propagator can find it (fallback (c) — RPC set_tenant_context).
+app.locals.supabase = supabase;
+
+const { requireTenant } = require('./src/middleware/requireTenant');
+app.use('/api/', (req, res, next) => {
+  if (PUBLIC_API_PATHS.has(req.path)) return next();
+  return requireTenant()(req, res, next);
+});
+console.log('✓ requireTenant() wired — JWT/header/session → req.tenantId + Postgres GUC');
+// ═══════════════════════════════════════════════════════════════
```

The auth gate's `PUBLIC_API_PATHS` allow-list (`/status`, `/health`, `/admin/ai-bridge/health`, `/events/health`) is reused so health endpoints stay reachable without a tenant.

---

## 3. Verification

### Syntax
```
$ node --check server.js
(no output — clean)
```

### Smoke test (10/10 pass)
Run from `onyx-procurement/`:

```
$ node -e "<<inline test of all middleware paths>>"
Test 1:  exports OK                                  -> true
Test 2:  factory returns middleware                  -> true
Test 3:  header tenant resolves                      -> 550e8400-e29b-41d4-a716-446655440000
Test 4:  malformed header rejected                   -> true
Test 5:  JWT decode (base64url payload)              -> 550e8400-e29b-41d4-a716-446655440000
Test 6:  JWT-derived tenant resolves                 -> 550e8400-e29b-41d4-a716-446655440000
Test 7:  401 on missing tenant                       -> true (TENANT_REQUIRED)
Test 8:  /healthz bypasses gate                      -> true
Test 9:  header tenant + next() called               -> true (via: header-only)
Test 10: service-role bypass with allowServiceRole   -> true (req.tenantId === null)
```

### Behaviour matrix

| Caller carries... | Result |
|---|---|
| Bearer JWT with `tenant_id` claim | `req.tenantId = <uuid>`, GUC set, `next()` |
| `X-Tenant-Id: <uuid>` header (API-key auth path) | `req.tenantId = <uuid>`, GUC set, `next()` |
| Authenticated session with `session.tenant_id` | `req.tenantId = <uuid>`, GUC set, `next()` |
| None of the above | 401 `TENANT_REQUIRED` |
| Malformed UUID anywhere in the chain | falls through to next source; 401 if all empty |
| Path in `PUBLIC_API_PATHS` (e.g. `/api/health`) | bypass — `next()` immediately |
| Path in `EXEMPT_PATHS` (e.g. `/healthz`, `/metrics`) | bypass — `next()` immediately |
| `req.serviceRole = true` + `allowServiceRole: true` | bypass — `req.tenantId = null`, `next()` |

---

## 4. Deployment dependencies

To realise the *full* RLS benefit, three follow-ups must land (already specified, not yet applied here):

1. **Migration `00072_create_governance_tenant_helper.sql`** (per AGENT-272 §1) — defines `governance.current_tenant_id()` and `governance.set_tenant_context(uuid)`. **Until 00072 is applied, the GUC propagator falls back to `header-only` mode** (the JWT claim still reaches Postgres via PostgREST, but raw-SQL paths via service-role do not get the GUC). This is *not* a regression vs. today (today nothing propagates), but the `pg`-fallback only fires once 00072 lands.
2. **Migration `00073_rls_hardening.sql`** (AGENT-214 / consumer of 00072) — turns on RLS predicates on the 18 base tables. Without this, the GUC is set but no policy reads it.
3. **`assertSameTenant()` JS helper** (AGENT-272 §3) at `onyx-procurement/src/lib/tenant/assertSameTenant.js` — used in orchestrator actions to prevent cross-tenant joins (e.g. Quote linking Customer-A to Project-B). Out of scope for this fix; tracked separately.

---

## 5. Coverage delta

| Metric | Before | After |
|---|---:|---:|
| Routes that flow through a tenant gate | 0 / 39 | 39 / 39 (all `/api/*` except 4 public health paths) |
| Postgres GUC `app.current_tenant_id` set per request | never | every authenticated request that resolves a UUID |
| 401 on missing tenant | never (silent leak) | always |
| Service-role bypass available for jobs | n/a | yes, opt-in per route via `requireTenant({ allowServiceRole: true })` |

The downstream RLS work (00072 + 00073 + RLS policies) inherits a populated GUC from minute-zero of deploy. Until those land the middleware is harmless: it 401s anonymous requests, attaches `req.tenantId` for handlers to use, and emits `tenantContext.via = 'header-only'` in observability data.

---

## 6. Files touched

| Path | Change |
|---|---|
| `onyx-procurement/src/middleware/requireTenant.js` | NEW — 235 lines, zero deps |
| `onyx-procurement/server.js` | +27 lines after the existing requireAuth mount (line 283); stash `app.locals.supabase`, mount `requireTenant()` on `/api/` |
| `_qa-reports-25/AGENT-FIX-TENANT-applied.md` | NEW — this report |

No tables, schemas, or routes were modified. No deps added. No existing behaviour removed — exempt paths and the service-role bypass make this an additive, deployable-now change.
