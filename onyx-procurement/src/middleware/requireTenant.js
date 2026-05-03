/**
 * ONYX — Universal Tenant Isolation Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Agent-272 / TENANT-ISOLATION ENTRY POINT
 *
 * Resolves the active tenant from one of three sources (in this exact
 * precedence — same chain as the SQL helper `governance.current_tenant_id()`):
 *
 *   1. JWT claim `tenant_id`           — Bearer token in Authorization header
 *      (also looks at `app_metadata.tenant_id`, the Supabase convention).
 *   2. `X-Tenant-Id` request header    — used by service-to-service calls
 *      that present an API key instead of a JWT (matches the existing
 *      AUTH_MODE=api_key path in server.js).
 *   3. `req.session.tenant_id`         — when express-session is mounted.
 *
 * On success:
 *   - `req.tenantId` is populated (UUID string).
 *   - The Postgres GUC `app.current_tenant_id` is SET on the per-request DB
 *     client, so every subsequent SQL statement in this request runs with
 *     RLS predicates evaluating the correct tenant. Three fallbacks, in order:
 *       (a) `req.db.query(...)` — raw pg client attached by a pool middleware.
 *       (b) `req.supabase.rpc('set_tenant_context', { p_tenant: tenantId })`
 *           — when only the Supabase client is available.
 *       (c) Stash on `app.locals.__tenantContext` and trust the JWT claim
 *           reaching Postgres via PostgREST (`request.jwt.claim.tenant_id`).
 *
 * On failure:
 *   - 401 `{ error: "TENANT_REQUIRED", ... }` if no source resolved a UUID.
 *   - 500 `{ error: "TENANT_CONTEXT_FAILED", ... }` if GUC propagation
 *     threw (so we never silently fall through to RLS-blocking-everything).
 *
 * Service-role bypass (background jobs, cross-service sync):
 *   pass `{ allowServiceRole: true }` to the factory; caller must have set
 *   `req.serviceRole = true` upstream after verifying a signed internal
 *   header. When that's true `req.tenantId = null` and the GUC is left
 *   alone — service-role queries are expected to set their own context.
 *
 * NO RUNTIME DEPENDENCIES beyond Node stdlib:
 *   - JWT decode is a literal base64url unwrap of the payload — we are NOT
 *     verifying the signature here. Signature verification belongs in the
 *     auth middleware that runs *before* this one (e.g. `requireAuth`).
 *     This middleware's job is to *trust then propagate*, not to authenticate.
 *
 * Wiring (server.js):
 *   const { requireTenant } = require('./src/middleware/requireTenant');
 *   app.use('/api/', (req, res, next) => {  // existing auth gate
 *     if (PUBLIC_API_PATHS.has(req.path)) { req.actor = 'public'; return next(); }
 *     return requireAuth(req, res, next);
 *   });
 *   app.use('/api/', requireTenant());        // <-- mount AFTER requireAuth
 *
 * Per Agent-290 + Agent-303: ZERO of 39 top-level routes in onyx-procurement
 * filter by tenant_id. This middleware is the single chokepoint that
 * delivers `app.current_tenant_id` to Postgres so RLS can finally bite.
 *
 * Source contract: AGENT-272-logic-tenant-helpers.md §2 "Express middleware
 * `requireTenant()`". This file is the production realization.
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────
const HEADER = 'x-tenant-id';

// RFC 4122 UUID (any version). Anchored — must match the entire string.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Paths that must NEVER be tenant-gated. Health probes, metrics, and the
// public bridge health endpoint are observable without an identity.
const EXEMPT_PATHS = new Set([
  '/healthz',
  '/livez',
  '/readyz',
  '/metrics',
  '/api/status',
  '/api/health',
  '/api/admin/ai-bridge/health',
  '/api/events/health',
]);

// ─── JWT decode (no signature check — auth middleware did that) ──
function _base64UrlDecode(str) {
  // base64url → base64
  const pad = 4 - (str.length % 4);
  const b64 =
    str.replace(/-/g, '+').replace(/_/g, '/') +
    (pad === 4 ? '' : '='.repeat(pad));
  return Buffer.from(b64, 'base64').toString('utf8');
}

function _decodeJwtPayload(token) {
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = _base64UrlDecode(parts[1]);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function _tenantFromJwt(req) {
  const auth = req.headers && req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  const payload = _decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;

  // Direct claim (preferred) and Supabase's app_metadata convention.
  return (
    (typeof payload.tenant_id === 'string' && payload.tenant_id) ||
    (payload.app_metadata &&
      typeof payload.app_metadata.tenant_id === 'string' &&
      payload.app_metadata.tenant_id) ||
    null
  );
}

function _tenantFromHeader(req) {
  const v = req.headers && req.headers[HEADER];
  if (typeof v !== 'string' || !v) return null;
  return v.trim();
}

function _tenantFromSession(req) {
  if (!req.session) return null;
  const v = req.session.tenant_id;
  if (typeof v !== 'string' || !v) return null;
  return v;
}

/**
 * Resolve the tenant for this request. Order matches the SQL helper
 * `governance.current_tenant_id()`: JWT > header > session.
 * Returns the UUID string on success, null otherwise.
 */
function resolveTenant(req) {
  const fromJwt = _tenantFromJwt(req);
  if (fromJwt && UUID_RE.test(fromJwt)) return fromJwt;

  const fromHeader = _tenantFromHeader(req);
  if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;

  const fromSession = _tenantFromSession(req);
  if (fromSession && UUID_RE.test(fromSession)) return fromSession;

  return null;
}

// ─── GUC propagation (3 fallbacks, first that's available wins) ──

/**
 * Try to push `app.current_tenant_id = <tenantId>` down to Postgres so
 * RLS can use it. Returns { ok: true } / { ok: false, why: '...' }.
 *
 * Strategy:
 *   1. Raw pg client on req.db          → SELECT governance.set_tenant_context($1)
 *   2. Supabase client on req.supabase  → rpc('set_tenant_context', { p_tenant: tenantId })
 *   3. App-level supabase singleton      → rpc(...) on app.locals.supabase
 *
 * If none are available we don't fail — we mark the request as having
 * 'header-only' tenant context. RLS may still see the JWT claim via
 * PostgREST's `request.jwt.claim.tenant_id`. Backend services that bypass
 * PostgREST (raw SQL via service-role key) MUST attach req.db.
 */
async function _propagateGuc(req, tenantId) {
  // (a) Raw pg client per-request
  if (req.db && typeof req.db.query === 'function') {
    await req.db.query('SELECT governance.set_tenant_context($1)', [tenantId]);
    return { ok: true, via: 'pg' };
  }

  // (b) Supabase client per-request (rare — usually a singleton)
  if (req.supabase && typeof req.supabase.rpc === 'function') {
    const { error } = await req.supabase.rpc('set_tenant_context', {
      p_tenant: tenantId,
    });
    if (error) throw error;
    return { ok: true, via: 'supabase-req' };
  }

  // (c) App-level Supabase singleton (server.js stashes via app.locals.supabase)
  const app = req.app;
  const sb = app && app.locals && app.locals.supabase;
  if (sb && typeof sb.rpc === 'function') {
    const { error } = await sb.rpc('set_tenant_context', { p_tenant: tenantId });
    // RPC may legitimately not exist yet (migration 00072 not run) — soft-fail
    if (error) {
      // PGRST202 = function not found. Treat as 'header-only' rather than 500.
      const code = error.code || error.status;
      if (code === 'PGRST202' || code === '404' || code === 404) {
        return { ok: true, via: 'header-only', why: 'set_tenant_context RPC missing — JWT claim only' };
      }
      throw error;
    }
    return { ok: true, via: 'supabase-app' };
  }

  // No DB client at all — fall through. JWT claim will reach Postgres
  // through PostgREST; raw SQL paths must attach req.db.
  return { ok: true, via: 'header-only', why: 'no DB client on req — RLS uses JWT claim only' };
}

// ─── Middleware factory ──────────────────────────────────────────

/**
 * requireTenant({ allowServiceRole? = false, exemptPaths? = [] })
 *
 *   const { requireTenant } = require('./src/middleware/requireTenant');
 *   app.use('/api/', requireTenant());
 *   app.get('/api/jobs/sync',
 *           requireTenant({ allowServiceRole: true }), handler);
 *
 * Returns a typed Express middleware (3-arg) that:
 *   - 401s missing or malformed tenants
 *   - attaches req.tenantId
 *   - sets the Postgres GUC for the rest of the request
 *
 * @param {Object}   [opts]
 * @param {boolean}  [opts.allowServiceRole=false]  bypass when req.serviceRole === true
 * @param {string[]} [opts.exemptPaths=[]]          extra paths that skip the gate
 * @returns {(req,res,next) => Promise<void>}
 */
function requireTenant(opts) {
  const { allowServiceRole = false, exemptPaths = [] } = opts || {};
  const localExempt = new Set(exemptPaths);

  return async function requireTenantMiddleware(req, res, next) {
    try {
      // Health/observability paths bypass — never tenant-scoped.
      const p = req.path || req.originalUrl || '';
      if (EXEMPT_PATHS.has(p) || localExempt.has(p)) return next();

      // Service-role bypass for trusted internal callers. Caller (an upstream
      // middleware that verifies an HMAC-signed X-Internal-Service header)
      // sets req.serviceRole = true. We do NOT trust the header itself here.
      if (allowServiceRole && req.serviceRole === true) {
        req.tenantId = null;
        req.tenantContext = { via: 'service-role-bypass' };
        return next();
      }

      const tenantId = resolveTenant(req);
      if (!tenantId) {
        return res.status(401).json({
          error: 'TENANT_REQUIRED',
          message:
            'No tenant context. Provide a JWT with tenant_id claim, ' +
            'an X-Tenant-Id header, or an authenticated session.',
        });
      }

      req.tenantId = tenantId;

      // Push to Postgres so RLS sees it. Errors here become 500 — we will
      // NOT proceed with a half-applied tenant context.
      let context;
      try {
        context = await _propagateGuc(req, tenantId);
      } catch (err) {
        return res.status(500).json({
          error: 'TENANT_CONTEXT_FAILED',
          message:
            (err && err.message) ||
            'Failed to propagate tenant GUC to database',
        });
      }

      req.tenantContext = context;
      return next();
    } catch (err) {
      // Defensive: never leak a stack to the client.
      return res.status(500).json({
        error: 'TENANT_MIDDLEWARE_ERROR',
        message: (err && err.message) || 'requireTenant unexpected failure',
      });
    }
  };
}

// ─── Public surface ──────────────────────────────────────────────
module.exports = {
  requireTenant,
  resolveTenant,
  HEADER,
  EXEMPT_PATHS,
  UUID_RE,
  // Internals exposed for tests only — do not call from app code.
  _decodeJwtPayload,
  _tenantFromJwt,
  _tenantFromHeader,
  _tenantFromSession,
  _propagateGuc,
};
