/**
 * ONYX PROCUREMENT — Structured Logger Module
 * ────────────────────────────────────────────
 * Agent-01 / 50-agent swarm upgrade.
 *
 * Purpose:
 *   Provide a single, environment-aware pino logger plus ready-to-wire
 *   Express middleware (request logger + error logger).  This module is
 *   PURELY ADDITIVE — it never replaces or removes existing console output.
 *   server.js is free to keep calling console.log/console.error as today;
 *   pino runs alongside as a structured, redacted, JSON/pretty stream.
 *
 * Environment variables:
 *   LOG_LEVEL    'trace'|'debug'|'info'|'warn'|'error'|'fatal'   (default 'info')
 *   LOG_FORMAT   'pretty' | 'json'
 *                  - 'pretty' → human-friendly dev output via pino-pretty
 *                  - 'json'   → raw newline-delimited JSON for prod/log shippers
 *                  - default  → 'pretty' when NODE_ENV !== 'production', else 'json'
 *   NODE_ENV     used for base.env and default format selection
 *
 * Exports:
 *   logger          — the root pino instance
 *   requestLogger   — Express middleware; attaches req.log (child logger)
 *                     with { requestId, method, url } bindings; request id
 *                     is taken from the x-request-id header or generated via
 *                     crypto.randomUUID().  Also sets the response header
 *                     x-request-id so clients can correlate.
 *   errorLogger     — Express error middleware; logs err with stack at
 *                     level='error' and forwards the error via next(err) so
 *                     existing handlers (e.g. the global error handler in
 *                     server.js) still run unchanged.
 *   createLogger    — factory for tests / worker processes that need an
 *                     isolated instance with custom options.
 *
 * Redacted paths:
 *   req.headers.authorization
 *   req.headers["x-api-key"]
 *   req.headers.cookie
 *   *.password
 *   *.token
 *   *.api_key
 */

'use strict';

const pino = require('pino');
const { randomUUID } = require('crypto');

// ───────────────────────────────────────────────────────────────
// Config resolution (pure — no side effects beyond reading env)
// ───────────────────────────────────────────────────────────────
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DEFAULT_FORMAT = NODE_ENV === 'production' ? 'json' : 'pretty';
const LOG_FORMAT = (process.env.LOG_FORMAT || DEFAULT_FORMAT).toLowerCase();

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.api_key',
];

const BASE_BINDINGS = {
  service: 'onyx-procurement',
  env: NODE_ENV,
  pid: process.pid,
};

/**
 * Build a pino options object.  Kept as a factory so tests can override
 * individual fields without reaching into the module's singleton.
 */
function buildPinoOptions(overrides = {}) {
  const opts = {
    level: overrides.level || LOG_LEVEL,
    base: { ...BASE_BINDINGS, ...(overrides.base || {}) },
    timestamp: pino.stdTimeFunctions.isoTime, // ISO-8601 timestamps
    redact: {
      paths: overrides.redact || REDACT_PATHS,
      censor: '[REDACTED]',
      remove: false,
    },
    formatters: {
      level(label) {
        // Emit level as string ("info") instead of numeric (30) — easier
        // to grep in pretty mode and in most log aggregators.
        return { level: label };
      },
    },
  };

  // Pretty transport only when explicitly requested; in prod we stream
  // raw JSON so log shippers (Loki, Datadog, CloudWatch) can parse it.
  if ((overrides.format || LOG_FORMAT) === 'pretty') {
    opts.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname,service,env',
        singleLine: false,
      },
    };
  }

  return opts;
}

/**
 * createLogger — factory for fresh pino instances.  Callers may pass
 * { level, base, redact, format } to override the module defaults.
 */
function createLogger(overrides = {}) {
  return pino(buildPinoOptions(overrides));
}

// ───────────────────────────────────────────────────────────────
// Singleton root logger — imported by server.js and submodules
// ───────────────────────────────────────────────────────────────
const logger = createLogger();

// ───────────────────────────────────────────────────────────────
// Express middleware: requestLogger
//   - mints/propagates a request id
//   - attaches a child logger to req.log
//   - logs the incoming request and (on 'finish') the response
// ───────────────────────────────────────────────────────────────
function requestLogger(req, res, next) {
  const headerId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    null;
  const requestId = (typeof headerId === 'string' && headerId.length > 0)
    ? headerId
    : randomUUID();

  // Echo back to client for easy correlation in multi-hop traces.
  try {
    res.setHeader('x-request-id', requestId);
  } catch (_) {
    // headers already sent / stream closed — non-fatal.
  }

  req.id = requestId;
  req.log = logger.child({
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
  });

  const startedAt = process.hrtime.bigint();
  req.log.info({ msg: 'request.start', ip: req.ip });

  res.on('finish', () => {
    const durNs = Number(process.hrtime.bigint() - startedAt);
    const durationMs = Math.round(durNs / 1e6);
    const level =
      res.statusCode >= 500 ? 'error' :
      res.statusCode >= 400 ? 'warn'  :
      'info';
    req.log[level]({
      msg: 'request.end',
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

// ───────────────────────────────────────────────────────────────
// Express error middleware: errorLogger
//   - signature (err, req, res, next) is REQUIRED so Express recognises
//     it as an error handler.
//   - logs the error with stack + request context at level='error'
//   - calls next(err) so the existing global error handler in
//     server.js still runs and sends the HTTP response unchanged.
// ───────────────────────────────────────────────────────────────
function errorLogger(err, req, res, next) {
  const log = (req && req.log) ? req.log : logger;
  log.error({
    msg: 'request.error',
    err: {
      type: err && err.name,
      message: err && err.message,
      stack: err && err.stack,
      code: err && err.code,
    },
    method: req && req.method,
    url: req && (req.originalUrl || req.url),
    statusCode: res && res.statusCode,
  });
  next(err);
}

// ───────────────────────────────────────────────────────────────
// Public surface
// ───────────────────────────────────────────────────────────────
module.exports = {
  logger,
  requestLogger,
  errorLogger,
  createLogger,
  // Exposed for tests / introspection — safe to ignore elsewhere.
  _internal: {
    buildPinoOptions,
    REDACT_PATHS,
    BASE_BINDINGS,
    LOG_LEVEL,
    LOG_FORMAT,
    NODE_ENV,
  },
};
