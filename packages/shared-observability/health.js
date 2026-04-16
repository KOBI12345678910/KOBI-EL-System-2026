'use strict';

/**
 * @module shared-observability/health
 * @description Health check builder for Kubernetes-style readiness and liveness probes
 * in the Techno-Kol Uzi ERP 2026 system.
 *
 * Each service (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, ONYX_AI)
 * creates a HealthChecker, registers its dependency checks, and mounts the
 * Express handler at `/api/health`.
 *
 * Response statuses:
 *   - `healthy`  (HTTP 200) -- all checks pass.
 *   - `degraded` (HTTP 200) -- at least one non-critical check failed.
 *   - `unhealthy` (HTTP 503) -- a critical check failed.
 *
 * @example
 *   const { HealthChecker } = require('@techno-kol/shared-observability/health');
 *
 *   const health = new HealthChecker({ service: 'ONYX_PROCUREMENT', version: '2.1.0' });
 *
 *   health.addCheck('database', async () => {
 *     const ok = await db.ping();
 *     return { healthy: ok, details: ok ? 'connected' : 'connection refused' };
 *   });
 *
 *   health.addCheck('redis', async () => {
 *     return { healthy: true, details: 'mock OK' };
 *   }, { critical: false });
 *
 *   app.get('/api/health', health.handler());
 */

/* ═══════════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Possible health statuses.
 * @readonly
 * @enum {string}
 */
const HEALTH_STATUSES = Object.freeze({
  HEALTHY:   'healthy',
  DEGRADED:  'degraded',
  UNHEALTHY: 'unhealthy',
});

/**
 * Default timeout for individual health checks (ms).
 * @readonly
 * @type {number}
 */
const DEFAULT_CHECK_TIMEOUT_MS = 5000;

/* ═══════════════════════════════════════════════════════════════
 *  HEALTH CHECKER CLASS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Health check orchestrator.
 *
 * @class
 * @param {Object} opts
 * @param {string} opts.service - Service name (e.g. 'ONYX_PROCUREMENT').
 * @param {string} [opts.version='0.0.0'] - Service version string.
 * @param {number} [opts.checkTimeout=5000] - Max time (ms) to wait for each check.
 */
function HealthChecker(opts) {
  if (!opts || !opts.service) {
    throw new Error('HealthChecker requires opts.service');
  }

  /** @type {string} */
  this._service = opts.service;

  /** @type {string} */
  this._version = opts.version || '0.0.0';

  /** @type {number} */
  this._checkTimeout = opts.checkTimeout || DEFAULT_CHECK_TIMEOUT_MS;

  /** @type {number} */
  this._startedAt = Date.now();

  /**
   * Registered health checks.
   * @private
   * @type {Array<{ name: string, checkFn: Function, critical: boolean }>}
   */
  this._checks = [];
}

/* ── Registration ─────────────────────────────────────────────── */

/**
 * Register a named health check function.
 *
 * @param {string} name      - Unique check name (e.g. 'database', 'redis', 'supabase').
 * @param {Function} checkFn - Async function returning `{ healthy: boolean, details?: string|Object }`.
 * @param {Object} [opts]
 * @param {boolean} [opts.critical=true] - If true, failure => unhealthy. If false, failure => degraded.
 * @returns {HealthChecker} `this` for chaining.
 *
 * @example
 *   health.addCheck('supabase', async () => {
 *     const { data, error } = await supabase.from('_health').select('1').limit(1);
 *     return { healthy: !error, details: error ? error.message : 'ok' };
 *   });
 */
HealthChecker.prototype.addCheck = function addCheck(name, checkFn, opts) {
  opts = opts || {};
  this._checks.push({
    name:     name,
    checkFn:  checkFn,
    critical: opts.critical !== undefined ? opts.critical : true,
  });
  return this;
};

/* ── Execution ────────────────────────────────────────────────── */

/**
 * Run all registered checks and compute aggregate health status.
 *
 * @returns {Promise<Object>} Health report:
 *   ```
 *   {
 *     status: 'healthy'|'degraded'|'unhealthy',
 *     service: string,
 *     version: string,
 *     uptime: number,      // seconds
 *     timestamp: string,
 *     checks: [
 *       { name, status, durationMs, details?, critical }
 *     ]
 *   }
 *   ```
 */
HealthChecker.prototype.check = async function check() {
  var uptimeSeconds = Math.floor((Date.now() - this._startedAt) / 1000);
  var checkResults = [];
  var hasCriticalFailure = false;
  var hasNonCriticalFailure = false;

  // Run all checks concurrently with individual timeouts
  var promises = this._checks.map(function (c) {
    var startMs = Date.now();
    return _runWithTimeout(c.checkFn, this._checkTimeout)
      .then(function (result) {
        var durationMs = Date.now() - startMs;
        var healthy = result && result.healthy;
        if (!healthy && c.critical) { hasCriticalFailure = true; }
        if (!healthy && !c.critical) { hasNonCriticalFailure = true; }
        checkResults.push({
          name:       c.name,
          status:     healthy ? HEALTH_STATUSES.HEALTHY : HEALTH_STATUSES.UNHEALTHY,
          durationMs: durationMs,
          details:    result ? result.details : null,
          critical:   c.critical,
        });
      })
      .catch(function (err) {
        var durationMs = Date.now() - startMs;
        if (c.critical) { hasCriticalFailure = true; }
        else { hasNonCriticalFailure = true; }
        checkResults.push({
          name:       c.name,
          status:     HEALTH_STATUSES.UNHEALTHY,
          durationMs: durationMs,
          details:    err.message || 'check threw an error',
          critical:   c.critical,
        });
      });
  }.bind(this));

  await Promise.all(promises);

  // Compute aggregate status
  var status;
  if (hasCriticalFailure) {
    status = HEALTH_STATUSES.UNHEALTHY;
  } else if (hasNonCriticalFailure) {
    status = HEALTH_STATUSES.DEGRADED;
  } else {
    status = HEALTH_STATUSES.HEALTHY;
  }

  return {
    status:    status,
    service:   this._service,
    version:   this._version,
    uptime:    uptimeSeconds,
    timestamp: new Date().toISOString(),
    checks:    checkResults,
  };
};

/**
 * Return an Express route handler for the health endpoint.
 *
 * Responds with:
 *   - HTTP 200 if healthy or degraded
 *   - HTTP 503 if unhealthy
 *
 * @returns {Function} `async (req, res) => void`
 *
 * @example
 *   app.get('/api/health', health.handler());
 */
HealthChecker.prototype.handler = function handler() {
  var self = this;
  return async function healthHandler(_req, res) {
    try {
      var result = await self.check();
      var httpStatus;
      if (result.status === HEALTH_STATUSES.HEALTHY) {
        httpStatus = 200;
      } else if (result.status === HEALTH_STATUSES.DEGRADED) {
        httpStatus = 200;
      } else {
        httpStatus = 503;
      }
      res.status(httpStatus).json(result);
    } catch (err) {
      res.status(503).json({
        status:    HEALTH_STATUSES.UNHEALTHY,
        service:   self._service,
        version:   self._version,
        uptime:    Math.floor((Date.now() - self._startedAt) / 1000),
        timestamp: new Date().toISOString(),
        checks:    [],
        error:     err.message,
      });
    }
  };
};

/**
 * Return a liveness probe handler (always 200 if the process is running).
 *
 * @returns {Function} `(req, res) => void`
 *
 * @example
 *   app.get('/api/health/live', health.livenessHandler());
 */
HealthChecker.prototype.livenessHandler = function livenessHandler() {
  var self = this;
  return function _livenessHandler(_req, res) {
    res.status(200).json({
      status:    'alive',
      service:   self._service,
      version:   self._version,
      uptime:    Math.floor((Date.now() - self._startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  };
};

/* ═══════════════════════════════════════════════════════════════
 *  INTERNAL HELPERS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Run an async function with a timeout.
 *
 * @private
 * @param {Function} fn        - Async function to execute.
 * @param {number} timeoutMs   - Maximum wait time in ms.
 * @returns {Promise<*>}
 */
function _runWithTimeout(fn, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('Health check timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    Promise.resolve()
      .then(fn)
      .then(function (result) {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  HealthChecker:          HealthChecker,
  HEALTH_STATUSES:        HEALTH_STATUSES,
  DEFAULT_CHECK_TIMEOUT_MS: DEFAULT_CHECK_TIMEOUT_MS,
};
