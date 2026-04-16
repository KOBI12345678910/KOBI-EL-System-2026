'use strict';

/**
 * @module shared-observability/metrics
 * @description Lightweight in-memory metrics collector for Techno-Kol Uzi ERP 2026.
 *
 * Tracks three metric types:
 *   - **Counter** -- monotonically increasing value (e.g. total API requests).
 *   - **Gauge** -- point-in-time value that goes up and down (e.g. active connections).
 *   - **Histogram** -- distribution of observed values with sum, count, and buckets.
 *
 * In the MVP phase all data is held in-process memory.
 * Call `toPrometheusFormat()` to expose a /metrics endpoint compatible with
 * Prometheus scraping, or `getMetrics()` for a plain JSON snapshot.
 *
 * Includes pre-built domain helpers for the most common ERP metrics.
 *
 * @example
 *   const { MetricsCollector } = require('@techno-kol/shared-observability/metrics');
 *   const metrics = new MetricsCollector({ service: 'ONYX_PROCUREMENT' });
 *
 *   metrics.increment('http_requests_total', { method: 'GET', path: '/api/customers', status: 200 });
 *   metrics.histogram('http_request_duration_ms', { method: 'GET', path: '/api/customers' }, 42);
 *
 *   app.get('/metrics', (req, res) => {
 *     res.type('text/plain').send(metrics.toPrometheusFormat());
 *   });
 */

/* ═══════════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Supported metric types.
 * @readonly
 * @enum {string}
 */
const METRIC_TYPES = Object.freeze({
  COUNTER:   'counter',
  GAUGE:     'gauge',
  HISTOGRAM: 'histogram',
});

/**
 * Default histogram buckets (milliseconds, suitable for HTTP request durations).
 * @readonly
 * @type {ReadonlyArray<number>}
 */
const DEFAULT_HISTOGRAM_BUCKETS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

/* ═══════════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Build a deterministic key from a metric name and label set.
 * @param {string} name
 * @param {Object} [labels]
 * @returns {string}
 */
function metricKey(name, labels) {
  if (!labels || Object.keys(labels).length === 0) { return name; }
  var parts = Object.keys(labels).sort().map(function (k) { return k + '=' + labels[k]; });
  return name + '{' + parts.join(',') + '}';
}

/**
 * Format labels as a Prometheus label string.
 * @param {Object} [labels]
 * @returns {string} e.g. '{method="GET",status="200"}'
 */
function promLabels(labels) {
  if (!labels || Object.keys(labels).length === 0) { return ''; }
  var parts = Object.keys(labels).sort().map(function (k) {
    return k + '="' + String(labels[k]).replace(/"/g, '\\"') + '"';
  });
  return '{' + parts.join(',') + '}';
}

/* ═══════════════════════════════════════════════════════════════
 *  METRICS COLLECTOR CLASS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * In-memory metrics collector.
 *
 * @class
 * @param {Object} opts
 * @param {string} opts.service - Service name added as a default label.
 * @param {number[]} [opts.histogramBuckets] - Custom histogram bucket boundaries.
 */
function MetricsCollector(opts) {
  if (!opts || !opts.service) {
    throw new Error('MetricsCollector requires opts.service');
  }

  /** @type {string} */
  this._service = opts.service;

  /** @type {number[]} */
  this._buckets = opts.histogramBuckets || DEFAULT_HISTOGRAM_BUCKETS.slice();

  /**
   * Internal storage.
   * @private
   * @type {Map<string, { type: string, name: string, labels: Object, value: number, histogram?: Object }>}
   */
  this._store = new Map();

  /** @type {number} Creation timestamp for uptime calculations. */
  this._startedAt = Date.now();
}

/* ── Core methods ─────────────────────────────────────────────── */

/**
 * Increment a counter metric.
 *
 * @param {string} name    - Metric name (e.g. 'http_requests_total').
 * @param {Object} [labels] - Key-value label pairs.
 * @param {number} [value=1] - Increment amount (must be >= 0).
 */
MetricsCollector.prototype.increment = function increment(name, labels, value) {
  if (value === undefined) { value = 1; }
  if (value < 0) { throw new Error('Counter increment must be >= 0'); }

  var key = metricKey(name, labels);
  var entry = this._store.get(key);
  if (!entry) {
    entry = { type: METRIC_TYPES.COUNTER, name: name, labels: labels || {}, value: 0 };
    this._store.set(key, entry);
  }
  entry.value += value;
};

/**
 * Set a gauge metric to an absolute value.
 *
 * @param {string} name    - Metric name (e.g. 'active_connections').
 * @param {Object} [labels] - Key-value label pairs.
 * @param {number} value   - The current value.
 */
MetricsCollector.prototype.gauge = function gauge(name, labels, value) {
  var key = metricKey(name, labels);
  var entry = this._store.get(key);
  if (!entry) {
    entry = { type: METRIC_TYPES.GAUGE, name: name, labels: labels || {}, value: 0 };
    this._store.set(key, entry);
  }
  entry.value = value;
};

/**
 * Record an observed value in a histogram metric.
 *
 * @param {string} name    - Metric name (e.g. 'http_request_duration_ms').
 * @param {Object} [labels] - Key-value label pairs.
 * @param {number} value   - Observed value.
 */
MetricsCollector.prototype.histogram = function histogram(name, labels, value) {
  var key = metricKey(name, labels);
  var entry = this._store.get(key);
  if (!entry) {
    var bucketCounts = {};
    for (var i = 0; i < this._buckets.length; i++) {
      bucketCounts[this._buckets[i]] = 0;
    }
    bucketCounts['+Inf'] = 0;
    entry = {
      type:      METRIC_TYPES.HISTOGRAM,
      name:      name,
      labels:    labels || {},
      value:     0,
      histogram: { sum: 0, count: 0, buckets: bucketCounts },
    };
    this._store.set(key, entry);
  }

  entry.histogram.sum += value;
  entry.histogram.count += 1;
  for (var j = 0; j < this._buckets.length; j++) {
    if (value <= this._buckets[j]) {
      entry.histogram.buckets[this._buckets[j]] += 1;
    }
  }
  entry.histogram.buckets['+Inf'] += 1;
};

/* ── Snapshot methods ─────────────────────────────────────────── */

/**
 * Return all collected metrics as a plain object keyed by metric name+labels.
 *
 * @returns {Object} Snapshot of all metrics.
 */
MetricsCollector.prototype.getMetrics = function getMetrics() {
  var result = {
    service:   this._service,
    uptimeMs:  Date.now() - this._startedAt,
    collectedAt: new Date().toISOString(),
    counters:   {},
    gauges:     {},
    histograms: {},
  };

  this._store.forEach(function (entry, key) {
    if (entry.type === METRIC_TYPES.COUNTER) {
      result.counters[key] = { name: entry.name, labels: entry.labels, value: entry.value };
    } else if (entry.type === METRIC_TYPES.GAUGE) {
      result.gauges[key] = { name: entry.name, labels: entry.labels, value: entry.value };
    } else if (entry.type === METRIC_TYPES.HISTOGRAM) {
      result.histograms[key] = {
        name:    entry.name,
        labels:  entry.labels,
        sum:     entry.histogram.sum,
        count:   entry.histogram.count,
        buckets: Object.assign({}, entry.histogram.buckets),
      };
    }
  });

  return result;
};

/**
 * Serialize all metrics in Prometheus exposition text format.
 *
 * @returns {string} Multi-line Prometheus-compatible output.
 */
MetricsCollector.prototype.toPrometheusFormat = function toPrometheusFormat() {
  var lines = [];
  var seenHelp = {};

  this._store.forEach(function (entry) {
    var baseName = entry.name;
    var lblStr = promLabels(entry.labels);

    if (!seenHelp[baseName]) {
      seenHelp[baseName] = true;
      lines.push('# HELP ' + baseName + ' ' + entry.type + ' metric from ' + this._service);
      lines.push('# TYPE ' + baseName + ' ' + entry.type);
    }

    if (entry.type === METRIC_TYPES.COUNTER || entry.type === METRIC_TYPES.GAUGE) {
      lines.push(baseName + lblStr + ' ' + entry.value);
    } else if (entry.type === METRIC_TYPES.HISTOGRAM) {
      var hist = entry.histogram;
      var bucketKeys = Object.keys(hist.buckets);
      for (var i = 0; i < bucketKeys.length; i++) {
        var le = bucketKeys[i];
        var bucketLabels = Object.assign({}, entry.labels, { le: String(le) });
        lines.push(baseName + '_bucket' + promLabels(bucketLabels) + ' ' + hist.buckets[le]);
      }
      lines.push(baseName + '_sum' + lblStr + ' ' + hist.sum);
      lines.push(baseName + '_count' + lblStr + ' ' + hist.count);
    }
  }.bind(this));

  return lines.join('\n') + '\n';
};

/**
 * Reset all collected metrics (useful in tests).
 */
MetricsCollector.prototype.reset = function reset() {
  this._store.clear();
};

/* ── Pre-built domain metrics ─────────────────────────────────── */

/**
 * Record an API request.
 *
 * @param {string} method - HTTP method (GET, POST, etc.).
 * @param {string} path   - Request path.
 * @param {number} status - HTTP response status code.
 */
MetricsCollector.prototype.apiRequestCounter = function apiRequestCounter(method, path, status) {
  this.increment('erp_http_requests_total', {
    service: this._service,
    method:  method,
    path:    path,
    status:  String(status),
  });
};

/**
 * Record a published event.
 *
 * @param {string} topic     - Event topic name.
 * @param {string} eventName - Specific event name.
 */
MetricsCollector.prototype.eventPublishedCounter = function eventPublishedCounter(topic, eventName) {
  this.increment('erp_events_published_total', {
    service: this._service,
    topic:   topic,
    event:   eventName,
  });
};

/**
 * Record a consumed event.
 *
 * @param {string} consumerGroup - Consumer group identifier.
 * @param {string} eventName     - Specific event name.
 * @param {boolean} success      - Whether processing succeeded.
 */
MetricsCollector.prototype.eventConsumedCounter = function eventConsumedCounter(consumerGroup, eventName, success) {
  this.increment('erp_events_consumed_total', {
    service:       this._service,
    consumerGroup: consumerGroup,
    event:         eventName,
    success:       String(!!success),
  });
};

/**
 * Record a database query duration.
 *
 * @param {string} operation  - DB operation (select, insert, update, delete).
 * @param {string} table      - Table or collection name.
 * @param {number} durationMs - Duration in milliseconds.
 */
MetricsCollector.prototype.dbQueryHistogram = function dbQueryHistogram(operation, table, durationMs) {
  this.histogram('erp_db_query_duration_ms', {
    service:   this._service,
    operation: operation,
    table:     table,
  }, durationMs);
};

/**
 * Record API response latency.
 *
 * @param {string} method     - HTTP method.
 * @param {string} path       - Request path.
 * @param {number} durationMs - Duration in milliseconds.
 */
MetricsCollector.prototype.apiLatencyHistogram = function apiLatencyHistogram(method, path, durationMs) {
  this.histogram('erp_http_request_duration_ms', {
    service: this._service,
    method:  method,
    path:    path,
  }, durationMs);
};

/* ═══════════════════════════════════════════════════════════════
 *  EXPRESS MIDDLEWARE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Express middleware that auto-records request count and latency.
 *
 * @returns {Function} Express middleware function.
 */
MetricsCollector.prototype.middleware = function middleware() {
  var self = this;
  return function metricsMiddleware(req, res, next) {
    var start = Date.now();
    res.on('finish', function () {
      var duration = Date.now() - start;
      self.apiRequestCounter(req.method, req.route ? req.route.path : req.path, res.statusCode);
      self.apiLatencyHistogram(req.method, req.route ? req.route.path : req.path, duration);
    });
    next();
  };
};

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  MetricsCollector:          MetricsCollector,
  METRIC_TYPES:              METRIC_TYPES,
  DEFAULT_HISTOGRAM_BUCKETS: DEFAULT_HISTOGRAM_BUCKETS,
};
