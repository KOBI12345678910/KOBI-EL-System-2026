'use strict';

/**
 * @module api-response
 * @description Standard API response envelope for every endpoint in the
 * Techno-Kol Uzi ERP 2026 system.
 *
 * All four services (ONYX_PROCUREMENT, TECHNO_KOL_OPS, PAYROLL_AUTONOMOUS,
 * ONYX_AI) MUST use these helpers to build their JSON responses so that
 * every client — the SPA, the mobile app, cross-service calls, and external
 * integrations — receives a uniform shape.
 *
 * Response contract:
 * ```
 * // Success
 * { success: true, data: <any>, meta?: <object> }
 *
 * // Created with domain events
 * { success: true, data: <any>, emitted_events?: string[] }
 *
 * // Error
 * { success: false, error: { code: <string>, message: <string>, details?: <any> } }
 *
 * // Paginated list
 * { success: true, data: <any[]>, pagination: { page, pageSize, total, totalPages } }
 * ```
 *
 * @example
 *   const { success, error, paginated } = require('@techno-kol/shared-types/api-response');
 *   res.json(success(customer));
 *   res.status(404).json(error('NOT_FOUND', 'Customer not found'));
 *   res.json(paginated(items, 1, 25, 142));
 */

/* ═══════════════════════════════════════════════════════════════
 *  RESPONSE BUILDERS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Build a standard success response.
 *
 * @param {*} data - The primary payload (entity, array, summary, etc.)
 * @param {Object} [meta] - Optional metadata (timing, cache info, feature flags).
 * @returns {{ success: true, data: *, meta?: Object }}
 */
function success(data, meta) {
  /** @type {any} */
  const envelope = { success: true, data: data };
  if (meta !== undefined && meta !== null) {
    envelope.meta = meta;
  }
  return envelope;
}

/**
 * Build a response for resource creation.
 * Optionally includes the list of domain events emitted as a result
 * so the caller can react (e.g. refresh a timeline, show a toast).
 *
 * @param {*} data - The newly created entity.
 * @param {string[]} [emittedEvents] - Domain event names fired during creation.
 * @returns {{ success: true, data: *, emitted_events?: string[] }}
 */
function created(data, emittedEvents) {
  /** @type {any} */
  const envelope = { success: true, data: data };
  if (Array.isArray(emittedEvents) && emittedEvents.length > 0) {
    envelope.emitted_events = emittedEvents;
  }
  return envelope;
}

/**
 * Build a standard error response.
 *
 * @param {string} code    - Machine-readable error code (e.g. `'VALIDATION_ERROR'`, `'NOT_FOUND'`).
 * @param {string} message - Human-readable description.
 * @param {*}      [details] - Optional structured detail (field errors, stack in dev, etc.)
 * @returns {{ success: false, error: { code: string, message: string, details?: * } }}
 */
function error(code, message, details) {
  /** @type {any} */
  const err = { code: code, message: message };
  if (details !== undefined && details !== null) {
    err.details = details;
  }
  return { success: false, error: err };
}

/**
 * Build a paginated list response.
 *
 * @param {any[]}  items    - The current page of results.
 * @param {number} page     - 1-based page number.
 * @param {number} pageSize - Maximum items per page.
 * @param {number} total    - Total matching records across all pages.
 * @returns {{
 *   success: true,
 *   data: any[],
 *   pagination: { page: number, pageSize: number, total: number, totalPages: number }
 * }}
 */
function paginated(items, page, pageSize, total) {
  return {
    success: true,
    data: items,
    pagination: {
      page:       page,
      pageSize:   pageSize,
      total:      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  COMMON ERROR CODES
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Predefined error codes used system-wide.
 * Services MAY define additional codes but SHOULD prefer reusing these.
 *
 * @readonly
 * @enum {string}
 */
const ERROR_CODES = Object.freeze({
  /** Generic validation failure (400) */
  VALIDATION_ERROR:   'VALIDATION_ERROR',
  /** Entity not found (404) */
  NOT_FOUND:          'NOT_FOUND',
  /** Missing or invalid auth token (401) */
  UNAUTHORIZED:       'UNAUTHORIZED',
  /** Authenticated but insufficient permissions (403) */
  FORBIDDEN:          'FORBIDDEN',
  /** State-machine transition not allowed (409) */
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  /** Business rule precondition failed (422) */
  PRECONDITION_FAILED:'PRECONDITION_FAILED',
  /** Duplicate resource (409) */
  CONFLICT:           'CONFLICT',
  /** Downstream service unavailable (502) */
  SERVICE_UNAVAILABLE:'SERVICE_UNAVAILABLE',
  /** Unhandled server error (500) */
  INTERNAL_ERROR:     'INTERNAL_ERROR',
  /** Rate limit exceeded (429) */
  RATE_LIMITED:       'RATE_LIMITED',
});

module.exports = {
  success,
  created,
  error,
  paginated,
  ERROR_CODES,
};
