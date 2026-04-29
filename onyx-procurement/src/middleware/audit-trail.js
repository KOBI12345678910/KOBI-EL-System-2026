/**
 * ONYX — Audit Trail Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Append-only writer for `governance.audit_logs` (compat view over
 * `governance.audit_log_v2` — see supabase/migrations/00088_audit_log_v2.sql).
 *
 * On every state-mutating API call (POST / PUT / PATCH / DELETE) the
 * middleware captures:
 *
 *   - method                 — HTTP verb
 *   - path                   — req.originalUrl (or req.path)
 *   - user_id                — req.user?.id (resolved by requireAuth)
 *   - tenant_id              — req.tenantId (resolved by requireTenant)
 *   - request_body_summary   — small JSON snapshot, secrets redacted,
 *                              capped at REQUEST_BODY_MAX_BYTES
 *   - status                 — response status code (after res.finish)
 *   - latency_ms             — wall time from middleware entry → finish
 *
 * Wiring (server.js):
 *
 *   const { auditTrail } = require('./src/middleware/audit-trail');
 *
 *   // mount AFTER requireAuth and requireTenant so req.user + req.tenantId
 *   // are populated; mounted on /api/ so health/metrics paths bypass.
 *   app.use('/api/', auditTrail({ supabase: app.locals.supabase }));
 *
 * Append-only contract:
 *   - Single INSERT per request. No UPDATE / DELETE on `audit_logs`.
 *   - Failures are logged with `console.warn` and do NOT fail the
 *     request (audit must never block the business path).
 *
 * Why a separate middleware (not the existing AuditWriter):
 *   The shared AuditWriter is entity-scoped (entity_type + entity_id +
 *   action_name on a specific row). It is for domain mutations.
 *   This middleware records the *HTTP envelope* of every mutation —
 *   the request itself, regardless of whether the handler emitted an
 *   entity audit event. Together they give full coverage:
 *     - HTTP audit  → "who hit what endpoint, when, with what payload"
 *     - Entity audit → "what changed in row X"
 *
 * Source contract: AGENT-269 (observability) §"add tenant_id and trace_id
 * to governance.audit_logs", AGENT-250 (audit log v2) §"append-only writes".
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────

// Methods that mutate state. GET / HEAD / OPTIONS skip the writer.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths the audit middleware never records — health probes and the
// observability endpoints have no actor and add log noise.
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

// Cap for the request_body_summary JSONB blob. Anything bigger gets
// truncated and a `__truncated: true` marker is appended. Keeping
// this small protects the audit table from runaway log bloat — the
// full body lives in the request log if needed.
const REQUEST_BODY_MAX_BYTES = 4 * 1024; // 4 KB

// Field names whose values must never reach the audit table. Match is
// case-insensitive and substring-based, so e.g. `clientSecret`,
// `api_key`, `Authorization`, `id_token` all redact.
const SECRET_FIELD_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'private_key',
  'privatekey',
  'credential',
];

const REDACTED_PLACEHOLDER = '[REDACTED]';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Recursively redact secret-like field names. Returns a new object —
 * never mutates the request body. Cycles are broken by a WeakSet.
 *
 * @param {*} value
 * @param {WeakSet} [seen]
 * @returns {*}
 */
function _redact(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const tracker = seen || new WeakSet();
  if (tracker.has(value)) return '[CIRCULAR]';
  tracker.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => _redact(v, tracker));
  }

  const out = {};
  for (const k of Object.keys(value)) {
    const lc = k.toLowerCase();
    const isSecret = SECRET_FIELD_PATTERNS.some((p) => lc.includes(p));
    out[k] = isSecret ? REDACTED_PLACEHOLDER : _redact(value[k], tracker);
  }
  return out;
}

/**
 * Build a JSON-safe, size-capped summary of the request body.
 *
 * @param {*} body
 * @returns {object|null}
 */
function _summarizeBody(body) {
  if (body === null || body === undefined) return null;
  // Non-object bodies (raw text, Buffer) — record only the type/size.
  if (typeof body !== 'object' || Buffer.isBuffer(body)) {
    return {
      __type: Buffer.isBuffer(body) ? 'Buffer' : typeof body,
      __size: Buffer.isBuffer(body) ? body.length : String(body).length,
    };
  }

  let redacted;
  try {
    redacted = _redact(body);
  } catch (_) {
    return { __error: 'redact_failed' };
  }

  let serialized;
  try {
    serialized = JSON.stringify(redacted);
  } catch (_) {
    return { __error: 'serialize_failed' };
  }

  if (serialized.length <= REQUEST_BODY_MAX_BYTES) {
    return redacted;
  }

  // Body is too large — truncate the serialized form and re-parse a
  // best-effort prefix; if that fails, just stash the raw truncated
  // string with a marker.
  const truncated = serialized.slice(0, REQUEST_BODY_MAX_BYTES);
  return {
    __truncated: true,
    __original_bytes: serialized.length,
    __preview: truncated,
  };
}

/**
 * Resolve the user_id from req.user. Schema column is `bigint`, but
 * onyx uses string IDs (api_key:abc123, dev-anonymous, UUIDs). We
 * stash the raw user identity in `new_values.user_id_text` instead
 * of the bigint column to avoid type errors against the view.
 */
function _resolveUserText(req) {
  if (req.user && typeof req.user.id !== 'undefined' && req.user.id !== null) {
    return String(req.user.id);
  }
  if (req.actor) return String(req.actor);
  return null;
}

// ─── Core middleware factory ─────────────────────────────────────

/**
 * Build the audit-trail middleware.
 *
 * @param {object}  opts
 * @param {object}  opts.supabase           - Supabase client (required).
 * @param {string}  [opts.serviceName]      - Source service label.
 * @param {string}  [opts.moduleName]       - Source module label.
 * @param {Set<string>} [opts.exemptPaths]  - Extra exempt paths.
 * @returns {(req,res,next) => void}
 */
function auditTrail(opts) {
  const o = opts || {};
  const supabase = o.supabase;
  const serviceName = o.serviceName || 'ONYX_PROCUREMENT';
  const moduleName = o.moduleName || 'http_audit';
  const localExempt = new Set(o.exemptPaths || []);

  if (!supabase) {
    // Fail-open at boot rather than at runtime: log a warning and
    // return a no-op so the server still starts in dev environments
    // that haven't wired a supabase client into app.locals yet.
    console.warn(
      '[audit-trail] no supabase client supplied — middleware mounted as no-op'
    );
    return function noop(_req, _res, next) { next(); };
  }

  return function auditTrailMiddleware(req, res, next) {
    // Fast-path: only mutations are recorded.
    const method = (req.method || 'GET').toUpperCase();
    if (!MUTATING_METHODS.has(method)) return next();

    // Skip exempt paths. `req.path` is the route-relative path
    // (when this middleware is app.use'd at /api/), `req.originalUrl`
    // is the full incoming URL — check both shapes.
    const fullPath = req.originalUrl || req.url || req.path || '';
    const routePath = req.path || fullPath;
    if (
      EXEMPT_PATHS.has(fullPath) ||
      EXEMPT_PATHS.has(routePath) ||
      localExempt.has(fullPath) ||
      localExempt.has(routePath)
    ) {
      return next();
    }

    const startedAt = process.hrtime.bigint();
    const summary = _summarizeBody(req.body);
    const userText = _resolveUserText(req);
    const tenantId =
      typeof req.tenantId === 'string' && req.tenantId ? req.tenantId : null;

    // We register the writer on `finish` so we can capture the final
    // status code and the wall-clock latency. `close` fires when the
    // client hangs up before finish — capture that case too as an
    // explicit `0` status so half-completed writes are visible.
    let written = false;
    const writeOnce = function () {
      if (written) return;
      written = true;

      const elapsedNs = process.hrtime.bigint() - startedAt;
      const latencyMs = Number(elapsedNs / 1000000n); // ns → ms

      // Snapshot of HTTP envelope. Stored under new_values JSONB so
      // querying is straightforward and we don't need to add columns
      // to the existing audit_logs view.
      const envelope = {
        method: method,
        path: fullPath,
        route_path: routePath,
        status: typeof res.statusCode === 'number' ? res.statusCode : 0,
        latency_ms: latencyMs,
        user_id_text: userText,
        tenant_id: tenantId,
        request_body_summary: summary,
        ip:
          (req.headers && req.headers['x-forwarded-for']) ||
          req.ip ||
          (req.connection && req.connection.remoteAddress) ||
          null,
        user_agent: (req.headers && req.headers['user-agent']) || null,
        timestamp: new Date().toISOString(),
      };

      // Schema: governance.audit_logs view requires entity_type,
      // entity_id (bigint), action_name, source_service, source_module.
      // We map HTTP audit to a synthetic entity:
      //   entity_type = 'http_request'
      //   entity_id   = 0   (no domain row to link)
      //   action_name = `${method} ${routePath}`  (truncated below)
      const action = (method + ' ' + routePath).slice(0, 200);

      const row = {
        entity_type: 'http_request',
        entity_id: 0,
        action_name: action,
        old_values: null,
        new_values: envelope,
        // performed_by_user_id is bigint — leave null and stash the
        // text id inside new_values.user_id_text. Backfill jobs that
        // resolve the bigint can update later if needed.
        performed_by_user_id: null,
        source_service: serviceName,
        source_module: moduleName,
        source_page: req.headers && req.headers['x-source-page']
          ? String(req.headers['x-source-page']).slice(0, 200)
          : null,
        correlation_id:
          (req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id'])) || null,
        // performed_at + created_at default to now() in the table.
      };

      // Append-only INSERT. Errors are intentionally swallowed (warn
      // only) — audit must never break the business path.
      Promise.resolve()
        .then(() => supabase.from('audit_logs').insert(row))
        .then((result) => {
          const error = result && result.error;
          if (error) {
            console.warn(
              '[audit-trail] insert failed (non-fatal):',
              error.message || error
            );
          }
        })
        .catch((err) => {
          console.warn(
            '[audit-trail] insert threw (non-fatal):',
            (err && err.message) || err
          );
        });
    };

    res.on('finish', writeOnce);
    res.on('close', writeOnce);

    return next();
  };
}

// ─── Public surface ──────────────────────────────────────────────
module.exports = {
  auditTrail,
  // Internals exposed for tests only — do not call from app code.
  MUTATING_METHODS,
  EXEMPT_PATHS,
  REQUEST_BODY_MAX_BYTES,
  SECRET_FIELD_PATTERNS,
  REDACTED_PLACEHOLDER,
  _redact,
  _summarizeBody,
  _resolveUserText,
};
