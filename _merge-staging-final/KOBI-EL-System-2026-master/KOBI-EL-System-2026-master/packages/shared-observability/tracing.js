'use strict';

/**
 * @module shared-observability/tracing
 * @description Correlation ID propagation for cross-service tracing
 * in the Techno-Kol Uzi ERP 2026 system.
 *
 * Every request entering the system is assigned (or inherits) a correlation ID.
 * That ID flows through:
 *   - HTTP headers (`X-Correlation-Id`)
 *   - Event envelopes (`correlation_id`)
 *   - Audit log entries
 *   - Logger context
 *
 * Services:
 *   TECHNO_KOL_OPS (3200) <-> ONYX_PROCUREMENT (3100)
 *   TECHNO_KOL_OPS (3200) <-> PAYROLL_AUTONOMOUS (5173)
 *   TECHNO_KOL_OPS (3200) <-> ONYX_AI (3300)
 *
 * @example
 *   const { correlationMiddleware, propagateHeaders } = require('@techno-kol/shared-observability/tracing');
 *
 *   app.use(correlationMiddleware());
 *
 *   // When calling another service:
 *   const headers = propagateHeaders(req);
 *   await fetch(url, { headers });
 */

const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════
 *  HEADER CONSTANTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Standard header names for cross-service tracing.
 * @readonly
 * @enum {string}
 */
const TRACE_HEADERS = Object.freeze({
  /** Unique identifier for the full request chain. */
  CORRELATION_ID:  'X-Correlation-Id',
  /** The service that originated the current hop. */
  SOURCE_SERVICE:  'X-Source-Service',
  /** The module within the source service. */
  SOURCE_MODULE:   'X-Source-Module',
  /** Optional span/request ID for the individual hop. */
  REQUEST_ID:      'X-Request-Id',
  /** Timestamp when the originating service sent the request. */
  REQUEST_TIME:    'X-Request-Time',
});

/* ═══════════════════════════════════════════════════════════════
 *  CORE FUNCTIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Extract an existing correlation ID from the request, or generate a new UUID v4.
 *
 * Checks (in order):
 *   1. `req.headers['x-correlation-id']`
 *   2. `req.correlationId` (if previously set by middleware)
 *   3. Falls back to `crypto.randomUUID()`
 *
 * @param {Object} req - Express-like request object.
 * @returns {string} A correlation ID (UUID v4 format).
 */
function getOrCreateCorrelationId(req) {
  if (req && req.headers && req.headers['x-correlation-id']) {
    return req.headers['x-correlation-id'];
  }
  if (req && req.correlationId) {
    return req.correlationId;
  }
  return crypto.randomUUID();
}

/**
 * Generate a unique request ID for this individual hop.
 * @returns {string} UUID v4.
 */
function generateRequestId() {
  return crypto.randomUUID();
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPRESS MIDDLEWARE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Express middleware that ensures every request has a correlation ID.
 *
 * Sets:
 *   - `req.correlationId` (string)
 *   - `req.requestId` (string)
 *   - `res` headers: X-Correlation-Id, X-Request-Id
 *
 * @param {Object} [opts]
 * @param {string} [opts.serviceName] - Name of the current service (attached to req.sourceService).
 * @param {string} [opts.moduleName]  - Module name (attached to req.sourceModule).
 * @returns {Function} Express middleware `(req, res, next) => void`.
 *
 * @example
 *   app.use(correlationMiddleware({ serviceName: 'ONYX_PROCUREMENT' }));
 */
function correlationMiddleware(opts) {
  opts = opts || {};
  var serviceName = opts.serviceName || process.env.SERVICE_NAME || 'unknown';
  var moduleName  = opts.moduleName || null;

  return function _correlationMiddleware(req, res, next) {
    // Correlation ID (spans the entire request chain)
    req.correlationId = getOrCreateCorrelationId(req);

    // Request ID (unique to this hop)
    req.requestId = req.headers['x-request-id'] || generateRequestId();

    // Source tracking
    req.sourceService = req.headers['x-source-service'] || serviceName;
    req.sourceModule  = req.headers['x-source-module'] || moduleName || 'unknown';

    // Set response headers so downstream callers / browsers can see the IDs
    res.setHeader(TRACE_HEADERS.CORRELATION_ID, req.correlationId);
    res.setHeader(TRACE_HEADERS.REQUEST_ID, req.requestId);

    next();
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  OUTGOING HEADER BUILDER
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Build headers for an outgoing HTTP call to another service.
 * Propagates the correlation ID from the current request context
 * and identifies the calling service/module.
 *
 * @param {Object} req - Express request (must have `correlationId` set by middleware).
 * @param {Object} [overrides]
 * @param {string} [overrides.sourceService] - Override source service name.
 * @param {string} [overrides.sourceModule]  - Override source module name.
 * @returns {Object} Headers object ready to spread into fetch/axios options.
 *
 * @example
 *   const headers = propagateHeaders(req, { sourceModule: 'invoice-routes' });
 *   const resp = await fetch('http://localhost:5173/api/employees', { headers });
 */
function propagateHeaders(req, overrides) {
  overrides = overrides || {};
  return {
    'X-Correlation-Id': (req && req.correlationId) || crypto.randomUUID(),
    'X-Request-Id':     generateRequestId(),
    'X-Source-Service':  overrides.sourceService || (req && req.sourceService) || 'unknown',
    'X-Source-Module':   overrides.sourceModule || (req && req.sourceModule) || 'unknown',
    'X-Request-Time':    new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  EVENT ENVELOPE HELPERS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Extract tracing metadata suitable for embedding in an event envelope.
 *
 * @param {Object} req - Express request with correlation context.
 * @returns {Object} `{ correlation_id, source_service, source_module, request_id }`
 */
function extractTraceContext(req) {
  return {
    correlation_id: (req && req.correlationId) || null,
    source_service: (req && req.sourceService) || 'unknown',
    source_module:  (req && req.sourceModule) || 'unknown',
    request_id:     (req && req.requestId) || null,
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  TRACE_HEADERS:          TRACE_HEADERS,
  getOrCreateCorrelationId: getOrCreateCorrelationId,
  generateRequestId:      generateRequestId,
  correlationMiddleware:  correlationMiddleware,
  propagateHeaders:       propagateHeaders,
  extractTraceContext:    extractTraceContext,
};
