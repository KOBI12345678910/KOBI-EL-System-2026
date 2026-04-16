'use strict';

/**
 * @module shared-observability
 * @description Barrel export for the Techno-Kol Uzi ERP 2026 observability package.
 *
 * Provides structured logging, metrics collection, health checks, and
 * cross-service correlation tracing for all four services:
 *   - TECHNO_KOL_OPS (3200)
 *   - ONYX_PROCUREMENT (3100)
 *   - PAYROLL_AUTONOMOUS (5173)
 *   - ONYX_AI (3300)
 *
 * @example
 *   const {
 *     createLogger,
 *     MetricsCollector,
 *     HealthChecker,
 *     correlationMiddleware,
 *     propagateHeaders,
 *   } = require('@techno-kol/shared-observability');
 */

// ── Logger ───────────────────────────────────────────────────────────────
const {
  Logger,
  createLogger,
  LOG_LEVELS,
  PII_FIELDS,
  stripPii,
} = require('./logger');

// ── Metrics ──────────────────────────────────────────────────────────────
const {
  MetricsCollector,
  METRIC_TYPES,
  DEFAULT_HISTOGRAM_BUCKETS,
} = require('./metrics');

// ── Tracing ──────────────────────────────────────────────────────────────
const {
  TRACE_HEADERS,
  getOrCreateCorrelationId,
  generateRequestId,
  correlationMiddleware,
  propagateHeaders,
  extractTraceContext,
} = require('./tracing');

// ── Health ───────────────────────────────────────────────────────────────
const {
  HealthChecker,
  HEALTH_STATUSES,
  DEFAULT_CHECK_TIMEOUT_MS,
} = require('./health');

module.exports = {
  // Logger
  Logger,
  createLogger,
  LOG_LEVELS,
  PII_FIELDS,
  stripPii,

  // Metrics
  MetricsCollector,
  METRIC_TYPES,
  DEFAULT_HISTOGRAM_BUCKETS,

  // Tracing
  TRACE_HEADERS,
  getOrCreateCorrelationId,
  generateRequestId,
  correlationMiddleware,
  propagateHeaders,
  extractTraceContext,

  // Health
  HealthChecker,
  HEALTH_STATUSES,
  DEFAULT_CHECK_TIMEOUT_MS,
};
