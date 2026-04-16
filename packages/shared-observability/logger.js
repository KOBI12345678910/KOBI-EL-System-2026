'use strict';

/**
 * @module shared-observability/logger
 * @description Structured logger for Techno-Kol Uzi ERP 2026.
 *
 * Outputs JSON lines with correlation_id, service, module, level, and timestamp.
 * Automatically strips PII fields (password, secret, token, api_key, national_id,
 * bank_account) from context objects before writing.
 *
 * Levels (ascending severity): debug, info, warn, error, fatal
 *
 * @example
 *   const { createLogger } = require('@techno-kol/shared-observability/logger');
 *   const log = createLogger('ONYX_PROCUREMENT', 'invoice-routes');
 *   log.info('Invoice issued', { invoiceId: 42, total: 15000 });
 *   // => {"timestamp":"...","level":"info","service":"ONYX_PROCUREMENT","module":"invoice-routes","correlation_id":null,"message":"Invoice issued","invoiceId":42,"total":15000}
 *
 *   const child = log.child({ module: 'pdf-export', correlationId: 'abc-123' });
 *   child.debug('Generating PDF');
 */

/* ═══════════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Supported log levels ordered by severity (0 = least severe).
 * @readonly
 * @enum {number}
 */
const LOG_LEVELS = Object.freeze({
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
  fatal: 4,
});

/**
 * Field names that are considered PII and will be redacted from context objects.
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const PII_FIELDS = Object.freeze([
  'password',
  'secret',
  'token',
  'api_key',
  'apiKey',
  'national_id',
  'nationalId',
  'bank_account',
  'bankAccount',
  'credit_card',
  'creditCard',
  'ssn',
]);

/**
 * Default minimum log level. Override with LOG_LEVEL env var.
 * @type {string}
 */
const DEFAULT_LEVEL = 'debug';

/* ═══════════════════════════════════════════════════════════════
 *  PII STRIPPING
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Recursively strip PII fields from a plain object.
 * Returns a shallow-ish copy; nested objects are also cleaned.
 *
 * @param {*} obj - The value to sanitize.
 * @param {number} [depth=0] - Current recursion depth (max 5).
 * @returns {*} Sanitized copy.
 */
function stripPii(obj, depth) {
  if (depth === undefined) { depth = 0; }
  if (obj === null || obj === undefined) { return obj; }
  if (typeof obj !== 'object') { return obj; }
  if (depth > 5) { return '[nested]'; }
  if (Array.isArray(obj)) {
    return obj.map(function (item) { return stripPii(item, depth + 1); });
  }

  const cleaned = {};
  const keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (PII_FIELDS.indexOf(key) !== -1 || PII_FIELDS.indexOf(key.toLowerCase()) !== -1) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = stripPii(obj[key], depth + 1);
    }
  }
  return cleaned;
}

/* ═══════════════════════════════════════════════════════════════
 *  LOGGER CLASS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Structured JSON logger.
 *
 * @class
 * @param {Object} opts
 * @param {string} opts.service              - Service name (e.g. 'ONYX_PROCUREMENT').
 * @param {string} [opts.module]             - Module / file name within the service.
 * @param {string} [opts.defaultCorrelationId] - Correlation ID inherited from parent.
 * @param {string} [opts.minLevel]           - Minimum level to emit (default: env LOG_LEVEL or 'debug').
 * @param {Function} [opts.writer]           - Override output function (default: process.stdout.write).
 */
function Logger(opts) {
  if (!opts || !opts.service) {
    throw new Error('Logger requires opts.service');
  }
  this._service = opts.service;
  this._module = opts.module || null;
  this._correlationId = opts.defaultCorrelationId || null;
  this._minLevel = LOG_LEVELS[opts.minLevel || process.env.LOG_LEVEL || DEFAULT_LEVEL];
  if (this._minLevel === undefined) { this._minLevel = LOG_LEVELS[DEFAULT_LEVEL]; }
  this._writer = opts.writer || null;
}

/**
 * Log a debug-level message.
 * @param {string} message
 * @param {Object} [context]
 */
Logger.prototype.debug = function debug(message, context) {
  this._log('debug', message, context);
};

/**
 * Log an info-level message.
 * @param {string} message
 * @param {Object} [context]
 */
Logger.prototype.info = function info(message, context) {
  this._log('info', message, context);
};

/**
 * Log a warn-level message.
 * @param {string} message
 * @param {Object} [context]
 */
Logger.prototype.warn = function warn(message, context) {
  this._log('warn', message, context);
};

/**
 * Log an error-level message.
 * @param {string} message
 * @param {Object} [context]
 */
Logger.prototype.error = function error(message, context) {
  this._log('error', message, context);
};

/**
 * Log a fatal-level message.
 * @param {string} message
 * @param {Object} [context]
 */
Logger.prototype.fatal = function fatal(message, context) {
  this._log('fatal', message, context);
};

/**
 * Create a child logger that inherits the parent's service but overrides
 * module and/or correlationId.
 *
 * @param {Object} overrides
 * @param {string} [overrides.module]        - New module name.
 * @param {string} [overrides.correlationId] - New correlation ID.
 * @returns {Logger} A new Logger instance.
 */
Logger.prototype.child = function child(overrides) {
  overrides = overrides || {};
  return new Logger({
    service:              this._service,
    module:               overrides.module || this._module,
    defaultCorrelationId: overrides.correlationId || this._correlationId,
    minLevel:             Object.keys(LOG_LEVELS).find(function (k) { return LOG_LEVELS[k] === this._minLevel; }.bind(this)),
    writer:               this._writer,
  });
};

/**
 * Internal log method. Builds a structured JSON line and writes it.
 *
 * @private
 * @param {string} level   - One of: debug, info, warn, error, fatal.
 * @param {string} message - Human-readable log message.
 * @param {Object} [context] - Extra key-value pairs (PII fields auto-stripped).
 */
Logger.prototype._log = function _log(level, message, context) {
  if (LOG_LEVELS[level] < this._minLevel) { return; }

  var entry = {
    timestamp:      new Date().toISOString(),
    level:          level,
    service:        this._service,
    module:         this._module,
    correlation_id: this._correlationId,
    message:        message,
  };

  // Merge sanitized context
  if (context && typeof context === 'object') {
    var clean = stripPii(context);
    var keys = Object.keys(clean);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      // Don't overwrite core fields
      if (entry[k] === undefined) {
        entry[k] = clean[k];
      }
    }
  }

  var line = JSON.stringify(entry) + '\n';

  if (this._writer) {
    this._writer(line);
  } else {
    process.stdout.write(line);
  }
};

/* ═══════════════════════════════════════════════════════════════
 *  FACTORY
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Create a Logger instance with sensible defaults.
 *
 * @param {string} service - Service name.
 * @param {string} [module] - Module / filename.
 * @returns {Logger}
 *
 * @example
 *   const log = createLogger('PAYROLL_AUTONOMOUS', 'salary-calc');
 *   log.info('Calculation started', { month: '2026-04', employeeCount: 120 });
 */
function createLogger(service, module) {
  return new Logger({ service: service, module: module || null });
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  Logger:       Logger,
  createLogger: createLogger,
  LOG_LEVELS:   LOG_LEVELS,
  PII_FIELDS:   PII_FIELDS,
  stripPii:     stripPii,
};
