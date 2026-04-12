/**
 * ONYX OPS — Prometheus /metrics exporter
 *
 * Zero-dependency, prom-client-compatible text exporter implemented from
 * scratch. Emits the Prometheus text exposition format (v0.0.4):
 *   https://prometheus.io/docs/instrumenting/exposition_formats/
 *
 * Exposed metrics:
 *   - http_requests_total{method,route,status}       (counter)
 *   - http_request_duration_seconds{method,route}    (histogram)
 *   - db_query_duration_seconds{op}                  (histogram)
 *   - payroll_slips_generated_total{status}          (counter)
 *   - vat_exports_total{period}                      (counter)
 *   - process_uptime_seconds                         (gauge)
 *   - process_resident_memory_bytes                  (gauge, rss)
 *
 * Usage (see server.js wiring block):
 *   const { metricsMiddleware, metricsHandler, metrics } = require('./src/ops/metrics');
 *   app.use(metricsMiddleware);
 *   app.get('/metrics', metricsHandler);
 *   metrics.payrollSlipsGenerated.inc({ status: 'ok' });
 *   metrics.vatExports.inc({ period: '2026-Q1' });
 *   metrics.dbQueryDuration.observe({ op: 'select' }, seconds);
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// HISTOGRAM BUCKETS (seconds) — default buckets used by both HTTP + DB timing
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10];

// ─────────────────────────────────────────────────────────────────────────────
// LABEL SERIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
function escapeLabelValue(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function labelKey(labels, labelNames) {
  // Canonical key: names in declared order. Missing = ''.
  const parts = [];
  for (const name of labelNames) {
    parts.push(name + '=' + escapeLabelValue(labels[name] || ''));
  }
  return parts.join(',');
}

function renderLabels(labels, labelNames, extra) {
  const parts = [];
  for (const name of labelNames) {
    parts.push(`${name}="${escapeLabelValue(labels[name] || '')}"`);
  }
  if (extra) {
    for (const k of Object.keys(extra)) {
      parts.push(`${k}="${escapeLabelValue(extra[k])}"`);
    }
  }
  return parts.length ? '{' + parts.join(',') + '}' : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTER
// ─────────────────────────────────────────────────────────────────────────────
class Counter {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map(); // key -> { labels, value }
  }

  inc(labels = {}, delta = 1) {
    if (delta < 0) throw new Error(`Counter ${this.name} cannot decrease`);
    const key = labelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    if (cur) cur.value += delta;
    else this.values.set(key, { labels: { ...labels }, value: delta });
  }

  reset() { this.values.clear(); }

  render() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(labels, this.labelNames)} ${value}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAUGE
// ─────────────────────────────────────────────────────────────────────────────
class Gauge {
  constructor(name, help, labelNames = [], collectFn = null) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
    this.collectFn = collectFn;
  }

  set(labels, value) {
    if (typeof labels === 'number') { value = labels; labels = {}; }
    const key = labelKey(labels, this.labelNames);
    this.values.set(key, { labels: { ...labels }, value });
  }

  inc(labels = {}, delta = 1) {
    if (typeof labels === 'number') { delta = labels; labels = {}; }
    const key = labelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    if (cur) cur.value += delta;
    else this.values.set(key, { labels: { ...labels }, value: delta });
  }

  dec(labels = {}, delta = 1) { this.inc(labels, -delta); }

  render() {
    if (typeof this.collectFn === 'function') {
      try { this.collectFn(this); } catch { /* swallow */ }
    }
    const lines = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(labels, this.labelNames)} ${value}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTOGRAM
// ─────────────────────────────────────────────────────────────────────────────
class Histogram {
  constructor(name, help, labelNames = [], buckets = DEFAULT_BUCKETS) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets.slice().sort((a, b) => a - b);
    // key -> { labels, counts: [], sum, count }
    this.values = new Map();
  }

  observe(labels, value) {
    if (typeof labels === 'number') { value = labels; labels = {}; }
    if (!Number.isFinite(value)) return;
    const key = labelKey(labels, this.labelNames);
    let entry = this.values.get(key);
    if (!entry) {
      entry = {
        labels: { ...labels },
        counts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.values.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) entry.counts[i]++;
    }
    entry.sum += value;
    entry.count++;
  }

  startTimer(labels = {}) {
    const start = process.hrtime.bigint();
    return (endLabels = {}) => {
      const end = process.hrtime.bigint();
      const seconds = Number(end - start) / 1e9;
      this.observe({ ...labels, ...endLabels }, seconds);
      return seconds;
    };
  }

  render() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    for (const entry of this.values.values()) {
      // counts[i] is already cumulative (observe() increments every bucket
      // whose upper-bound the value does not exceed), so emit directly.
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(
          `${this.name}_bucket${renderLabels(entry.labels, this.labelNames, { le: this.buckets[i] })} ${entry.counts[i]}`
        );
      }
      lines.push(
        `${this.name}_bucket${renderLabels(entry.labels, this.labelNames, { le: '+Inf' })} ${entry.count}`
      );
      lines.push(`${this.name}_sum${renderLabels(entry.labels, this.labelNames)} ${entry.sum}`);
      lines.push(`${this.name}_count${renderLabels(entry.labels, this.labelNames)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
class Registry {
  constructor() { this.metrics = []; }
  register(m) { this.metrics.push(m); return m; }
  contentType() { return 'text/plain; version=0.0.4; charset=utf-8'; }
  render() {
    return this.metrics.map(m => m.render()).join('\n') + '\n';
  }
}

const registry = new Registry();

// ─────────────────────────────────────────────────────────────────────────────
// METRICS — declared up front, registered with the default registry
// ─────────────────────────────────────────────────────────────────────────────
const httpRequestsTotal = registry.register(new Counter(
  'http_requests_total',
  'Total number of HTTP requests handled, labelled by method, route, and status code.',
  ['method', 'route', 'status'],
));

const httpRequestDurationSeconds = registry.register(new Histogram(
  'http_request_duration_seconds',
  'HTTP request latency in seconds, labelled by method and route.',
  ['method', 'route'],
  DEFAULT_BUCKETS,
));

const dbQueryDurationSeconds = registry.register(new Histogram(
  'db_query_duration_seconds',
  'Database query latency in seconds, labelled by operation kind.',
  ['op'],
  DEFAULT_BUCKETS,
));

const payrollSlipsGenerated = registry.register(new Counter(
  'payroll_slips_generated_total',
  'Total number of payroll slips generated, labelled by outcome status.',
  ['status'],
));

const vatExports = registry.register(new Counter(
  'vat_exports_total',
  'Total number of VAT export files produced, labelled by reporting period.',
  ['period'],
));

const processUptimeSeconds = registry.register(new Gauge(
  'process_uptime_seconds',
  'Process uptime in seconds since start.',
  [],
  (g) => g.set({}, process.uptime()),
));

const processResidentMemoryBytes = registry.register(new Gauge(
  'process_resident_memory_bytes',
  'Resident set size (RSS) of the Node.js process, in bytes.',
  [],
  (g) => {
    try { g.set({}, process.memoryUsage().rss); } catch { /* noop */ }
  },
));

const metrics = {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  dbQueryDuration: dbQueryDurationSeconds,
  dbQueryDurationSeconds,
  payrollSlipsGenerated,
  vatExports,
  processUptimeSeconds,
  processResidentMemoryBytes,
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE — records method/route/status + duration
// ─────────────────────────────────────────────────────────────────────────────
function routeLabel(req) {
  // Prefer matched route template (e.g. /api/suppliers/:id) over raw url
  // to keep cardinality under control.
  if (req.route && req.route.path) {
    const base = (req.baseUrl || '') + req.route.path;
    return base || req.route.path;
  }
  // Fallback: strip query string from originalUrl
  const url = req.originalUrl || req.url || '';
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

function metricsMiddleware(req, res, next) {
  // Skip self-scrapes to avoid polluting metrics
  if ((req.originalUrl || req.url || '') === '/metrics') return next();
  const start = process.hrtime.bigint();
  const method = (req.method || 'GET').toUpperCase();

  res.on('finish', () => {
    try {
      const end = process.hrtime.bigint();
      const seconds = Number(end - start) / 1e9;
      const route = routeLabel(req);
      const status = String(res.statusCode || 0);
      httpRequestsTotal.inc({ method, route, status });
      httpRequestDurationSeconds.observe({ method, route }, seconds);
    } catch { /* swallow — metrics must never break the request */ }
  });

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /metrics — Prometheus text format
// ─────────────────────────────────────────────────────────────────────────────
function metricsHandler(_req, res) {
  try {
    const body = registry.render();
    res.setHeader('Content-Type', registry.contentType());
    res.status(200).send(body);
  } catch (err) {
    res.status(500).send(`# metrics render error: ${err && err.message}\n`);
  }
}

module.exports = {
  // Classes (for power users / tests)
  Counter,
  Gauge,
  Histogram,
  Registry,
  DEFAULT_BUCKETS,
  // Default registry + metric instances
  registry,
  metrics,
  // Express integration
  metricsMiddleware,
  metricsHandler,
};
