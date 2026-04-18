/**
 * TECHNO-KOL OPS — Audit Log Middleware
 * Agent-21 hardening pack (2026-04-11)
 *
 * Writes every mutating API call into the `audit_logs` table
 * (schema already declared in src/middleware/audit.ts — AUDIT_LOG_SCHEMA).
 *
 * IMPORTANT: this file coexists with the existing src/middleware/audit.ts.
 * The .ts file defines the LOW-LEVEL `auditLog(...)` function. This .js file
 * adds a HIGH-LEVEL Express middleware that attaches `req.audit(...)` and
 * an automatic `withAudit(handler)` wrapper for routes that want it, without
 * touching a single line of the existing audit.ts.
 *
 * Usage (CommonJS — safe to require from TS via tsx):
 *
 *   const { auditMiddleware, withAudit } = require('./middleware/audit.js');
 *
 *   // 1) Global: attach req.audit() so any handler can call it
 *   app.use(auditMiddleware);
 *
 *   // 2) Per-handler wrapper:
 *   router.post('/', withAudit('work_order', 'CREATE'),
 *     async (req, res) => {
 *       const { rows } = await query('INSERT ... RETURNING *', [...]);
 *       req.auditCtx.after = rows[0];
 *       req.auditCtx.resourceId = rows[0].id;
 *       res.json(rows[0]);
 *     }
 *   );
 *
 *   // 3) Manual:
 *   await req.audit({
 *     action: 'APPROVE',
 *     resource: 'invoice',
 *     resourceId: invoice.id,
 *     before: oldInvoice,
 *     after: newInvoice,
 *   });
 *
 * Schema (from src/middleware/audit.ts — do NOT redefine):
 *   audit_logs(id, user_id, action, resource, resource_id,
 *              before_data, after_data, ip_address, created_at)
 *
 * If the DB write fails, the audit call is logged to stderr but the
 * request is NOT blocked — the original business logic still succeeds.
 */

'use strict';

// The existing TS audit.ts exports an `auditLog(...)` helper. When running
// under tsx (dev) or compiled dist (prod) that file is resolvable as
// ../middleware/audit. We try that first; if it's not reachable (e.g. this
// file is loaded before tsx has transpiled audit.ts), we fall back to a
// direct pg query via db/connection.
let baseAuditLog = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  baseAuditLog = require('./audit').auditLog;
} catch (e) {
  baseAuditLog = null;
}

let dbQuery = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  dbQuery = require('../db/connection').query;
} catch (e) {
  dbQuery = null;
}

// ═══════════════════════════════════════════════════════════════
// Low-level writer (bypasses existing audit.ts so we can add ip_address)
// ═══════════════════════════════════════════════════════════════
async function writeAuditRow({
  userId = null,
  action,
  resource,
  resourceId = null,
  before = null,
  after = null,
  ipAddress = null,
}) {
  if (!action || !resource) {
    console.warn('[audit] refusing to write row — missing action/resource');
    return;
  }

  // Preferred path: reuse the existing auditLog() from audit.ts
  if (baseAuditLog) {
    try {
      await baseAuditLog(userId, action, resource, resourceId, before, after);
      return;
    } catch (err) {
      console.warn('[audit] baseAuditLog failed, falling back:', err.message);
    }
  }

  // Fallback: direct insert (also includes ip_address which baseAuditLog drops)
  if (!dbQuery) {
    console.warn('[audit] no db connection available — dropping row');
    return;
  }
  try {
    await dbQuery(
      `INSERT INTO audit_logs
         (user_id, action, resource, resource_id,
          before_data, after_data, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        userId,
        action,
        resource,
        resourceId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        ipAddress,
      ]
    );
  } catch (err) {
    // Never break a business request because audit failed.
    console.error('[audit] DB insert failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Express middleware — attach req.audit()
// ═══════════════════════════════════════════════════════════════
function auditMiddleware(req, _res, next) {
  req.audit = (opts = {}) => {
    return writeAuditRow({
      userId: (req.user && req.user.id) || null,
      ipAddress:
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        req.ip ||
        null,
      ...opts,
    });
  };
  // Context bucket the withAudit wrapper fills in
  req.auditCtx = {};
  next();
}

// ═══════════════════════════════════════════════════════════════
// Per-route wrapper — auto-logs on successful (2xx) response
// ═══════════════════════════════════════════════════════════════
function withAudit(resource, action) {
  return function auditWrapper(req, res, next) {
    req.auditCtx = req.auditCtx || {};
    req.auditCtx.resource = resource;
    req.auditCtx.action = action;

    // Patch res.json to fire the audit write after a successful reply.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 300) {
        // Fire-and-forget — do not block the response
        writeAuditRow({
          userId: (req.user && req.user.id) || null,
          action,
          resource,
          resourceId:
            req.auditCtx.resourceId ||
            (body && (body.id || body.uuid)) ||
            req.params.id ||
            null,
          before: req.auditCtx.before || null,
          after: req.auditCtx.after || body || null,
          ipAddress:
            req.headers['x-forwarded-for'] ||
            req.socket?.remoteAddress ||
            req.ip ||
            null,
        }).catch((e) =>
          console.warn('[audit] withAudit write failed:', e.message)
        );
      }
      return originalJson(body);
    };
    next();
  };
}

// ═══════════════════════════════════════════════════════════════
// Convenience: audit() function (not middleware) for use inside
// arbitrary service code where req is not in scope.
// ═══════════════════════════════════════════════════════════════
async function audit(opts) {
  return writeAuditRow(opts || {});
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  auditMiddleware,
  withAudit,
  audit,
  writeAuditRow,
};
