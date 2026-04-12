/**
 * ONYX OPS — Prometheus text-format metrics exporter
 * מייצא מטריקות בפורמט Prometheus (טקסט) עבור נקודת קצה /metrics
 *
 * Agent-X52 — Swarm 3 — Techno-Kol Uzi ERP (mega-ERP)
 *
 * Zero-dependency, fully RFC-compliant Prometheus text format v0.0.4 exporter.
 * Supports all five standard metric types:
 *   1. Counter   — monotonically increasing values (increments only)
 *   2. Gauge     — arbitrary values (may go up or down)
 *   3. Histogram — observations bucketed with sum + count
 *   4. Summary   — quantile estimates with sum + count
 *   5. Info      — label-only constant (value always 1)
 *
 * This is a parallel module to src/ops/metrics.js (which it never replaces
 * or deletes). Provides a richer API with createRegistry, default process +
 * Node.js runtime metrics, ERP seed metrics, and an Express middleware for
 * serving /metrics.
 *
 * Reference: https://prometheus.io/docs/instrumenting/exposition_formats/
 *
 * Usage:
 *   const {
 *     createRegistry,
 *     collectDefaultMetrics,
 *     registerErpMetrics,
 *     metricsEndpoint,
 *   } = require('./src/ops/prom-metrics');
 *
 *   const registry = createRegistry();
 *   collectDefaultMetrics(registry);
 *   const erp = registerErpMetrics(registry);
 *
 *   app.get('/metrics', metricsEndpoint(registry));
 *
 *   erp.httpRequestsTotal.inc(1, { method: 'GET', route: '/api', status: '200' });
 */

'use strict';

const process = require('node:process');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// קבועים
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

// Default histogram buckets — tuned for latency in seconds (web + DB ops).
// ברירת מחדל לדליים של היסטוגרמה — מכויל להשהיות HTTP ו-DB.
const DEFAULT_BUCKETS = Object.freeze([
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]);

// Default summary quantiles (φ values).
// ברירת מחדל לקוונטילים של Summary.
const DEFAULT_QUANTILES = Object.freeze([0.5, 0.9, 0.95, 0.99]);

// Valid metric name pattern per Prometheus spec.
// תבנית חוקית לשם מטריקה לפי מפרט Prometheus.
const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// פונקציות עזר פנימיות
// ─────────────────────────────────────────────────────────────────────────────

function validateMetricName(name) {
  if (typeof name !== 'string' || !METRIC_NAME_RE.test(name)) {
    throw new Error(`Invalid metric name: ${name}`);
  }
}

function validateLabelNames(names) {
  if (!Array.isArray(names)) {
    throw new Error('labelNames must be an array');
  }
  for (const n of names) {
    if (typeof n !== 'string' || !LABEL_NAME_RE.test(n)) {
      throw new Error(`Invalid label name: ${n}`);
    }
    if (n.startsWith('__')) {
      throw new Error(`Label name may not start with "__": ${n}`);
    }
  }
}

function escapeHelp(text) {
  if (text == null) return '';
  return String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function escapeLabelValue(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function canonicalLabelKey(labels, labelNames) {
  const parts = [];
  for (const name of labelNames) {
    const val = labels && labels[name] != null ? String(labels[name]) : '';
    parts.push(name + '=' + val);
  }
  return parts.join('\x1f');
}

function renderLabelBlock(labels, labelNames, extra) {
  const parts = [];
  for (const name of labelNames) {
    const val = labels && labels[name] != null ? labels[name] : '';
    parts.push(`${name}="${escapeLabelValue(val)}"`);
  }
  if (extra) {
    for (const k of Object.keys(extra)) {
      parts.push(`${k}="${escapeLabelValue(extra[k])}"`);
    }
  }
  return parts.length ? '{' + parts.join(',') + '}' : '';
}

function formatValue(v) {
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  if (Number.isNaN(v)) return 'NaN';
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC BASE CLASS
// ─────────────────────────────────────────────────────────────────────────────

class Metric {
  constructor(name, help, labelNames = []) {
    validateMetricName(name);
    validateLabelNames(labelNames);
    this.name = name;
    this.help = help || '';
    this.labelNames = labelNames.slice();
  }

  // Subclasses override.
  collect() { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTER — monotonic, increment only
// מונה — עולה בלבד
// ─────────────────────────────────────────────────────────────────────────────

class Counter extends Metric {
  constructor(name, help, labelNames = []) {
    super(name, help, labelNames);
    this.type = 'counter';
    this.values = new Map(); // canonicalKey → { labels, value }
  }

  inc(value = 1, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      // inc({labels}) legacy form
      labels = value;
      value = 1;
    }
    if (!Number.isFinite(value)) {
      throw new TypeError(`Counter ${this.name}: value must be a finite number`);
    }
    if (value < 0) {
      throw new Error(`Counter ${this.name}: cannot decrease (got ${value})`);
    }
    const key = canonicalLabelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    if (cur) {
      cur.value += value;
    } else {
      this.values.set(key, { labels: { ...labels }, value });
    }
  }

  get(labels = {}) {
    const key = canonicalLabelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    return cur ? cur.value : 0;
  }

  reset() {
    this.values.clear();
  }

  collect() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${escapeHelp(this.help)}`);
    lines.push(`# TYPE ${this.name} counter`);
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const { labels, value } of this.values.values()) {
        lines.push(`${this.name}${renderLabelBlock(labels, this.labelNames)} ${formatValue(value)}`);
      }
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAUGE — up/down
// מד — עולה ויורד
// ─────────────────────────────────────────────────────────────────────────────

class Gauge extends Metric {
  constructor(name, help, labelNames = [], collectFn = null) {
    super(name, help, labelNames);
    this.type = 'gauge';
    this.values = new Map();
    this.collectFn = typeof collectFn === 'function' ? collectFn : null;
  }

  set(value, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      // set({labels}, value) legacy form
      const tmp = labels;
      labels = value;
      value = tmp;
    }
    if (!Number.isFinite(value) && value !== Infinity && value !== -Infinity) {
      throw new TypeError(`Gauge ${this.name}: value must be a number`);
    }
    const key = canonicalLabelKey(labels, this.labelNames);
    this.values.set(key, { labels: { ...labels }, value });
  }

  inc(value = 1, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      labels = value;
      value = 1;
    }
    const key = canonicalLabelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    if (cur) {
      cur.value += value;
    } else {
      this.values.set(key, { labels: { ...labels }, value });
    }
  }

  dec(value = 1, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      labels = value;
      value = 1;
    }
    this.inc(-value, labels);
  }

  get(labels = {}) {
    const key = canonicalLabelKey(labels, this.labelNames);
    const cur = this.values.get(key);
    return cur ? cur.value : 0;
  }

  reset() {
    this.values.clear();
  }

  collect() {
    if (this.collectFn) {
      try { this.collectFn(this); } catch (_e) { /* swallow */ }
    }
    const lines = [];
    lines.push(`# HELP ${this.name} ${escapeHelp(this.help)}`);
    lines.push(`# TYPE ${this.name} gauge`);
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const { labels, value } of this.values.values()) {
        lines.push(`${this.name}${renderLabelBlock(labels, this.labelNames)} ${formatValue(value)}`);
      }
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTOGRAM — bucketed observations
// היסטוגרמה — תצפיות מתוקצבות בדליים
// ─────────────────────────────────────────────────────────────────────────────

class Histogram extends Metric {
  constructor(name, help, buckets = DEFAULT_BUCKETS, labelNames = []) {
    super(name, help, labelNames);
    this.type = 'histogram';
    if (!Array.isArray(buckets) || buckets.length === 0) {
      throw new Error(`Histogram ${name}: buckets must be a non-empty array`);
    }
    // Deduplicate + sort ascending.
    const uniq = Array.from(new Set(buckets.map(Number)));
    uniq.forEach((b) => {
      if (!Number.isFinite(b)) {
        throw new Error(`Histogram ${name}: bucket values must be finite numbers`);
      }
    });
    this.buckets = uniq.sort((a, b) => a - b);
    this.values = new Map(); // key → { labels, counts, sum, count }
  }

  observe(value, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      // observe({labels}, value) legacy
      const tmp = labels;
      labels = value;
      value = tmp;
    }
    if (!Number.isFinite(value)) return;
    const key = canonicalLabelKey(labels, this.labelNames);
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
      this.observe(seconds, { ...labels, ...endLabels });
      return seconds;
    };
  }

  reset() {
    this.values.clear();
  }

  collect() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${escapeHelp(this.help)}`);
    lines.push(`# TYPE ${this.name} histogram`);
    for (const entry of this.values.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(
          `${this.name}_bucket${renderLabelBlock(entry.labels, this.labelNames, { le: this.buckets[i] })} ${entry.counts[i]}`
        );
      }
      lines.push(
        `${this.name}_bucket${renderLabelBlock(entry.labels, this.labelNames, { le: '+Inf' })} ${entry.count}`
      );
      lines.push(`${this.name}_sum${renderLabelBlock(entry.labels, this.labelNames)} ${formatValue(entry.sum)}`);
      lines.push(`${this.name}_count${renderLabelBlock(entry.labels, this.labelNames)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY — quantile estimates
// סיכום — הערכות קוונטיל
// ─────────────────────────────────────────────────────────────────────────────

class Summary extends Metric {
  constructor(name, help, quantiles = DEFAULT_QUANTILES, labelNames = []) {
    super(name, help, labelNames);
    this.type = 'summary';
    if (!Array.isArray(quantiles) || quantiles.length === 0) {
      throw new Error(`Summary ${name}: quantiles must be a non-empty array`);
    }
    for (const q of quantiles) {
      if (typeof q !== 'number' || q < 0 || q > 1) {
        throw new Error(`Summary ${name}: quantile ${q} out of [0,1]`);
      }
    }
    this.quantiles = quantiles.slice().sort((a, b) => a - b);
    // Cap observation window to avoid unbounded memory.
    this.maxObservations = 1000;
    this.values = new Map(); // key → { labels, observations: number[], sum, count }
  }

  observe(value, labels = {}) {
    if (typeof value === 'object' && value !== null) {
      const tmp = labels;
      labels = value;
      value = tmp;
    }
    if (!Number.isFinite(value)) return;
    const key = canonicalLabelKey(labels, this.labelNames);
    let entry = this.values.get(key);
    if (!entry) {
      entry = {
        labels: { ...labels },
        observations: [],
        sum: 0,
        count: 0,
      };
      this.values.set(key, entry);
    }
    entry.observations.push(value);
    if (entry.observations.length > this.maxObservations) {
      // Ring drop: remove oldest.
      entry.observations.shift();
    }
    entry.sum += value;
    entry.count++;
  }

  reset() {
    this.values.clear();
  }

  _quantile(sorted, q) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  collect() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${escapeHelp(this.help)}`);
    lines.push(`# TYPE ${this.name} summary`);
    for (const entry of this.values.values()) {
      const sorted = entry.observations.slice().sort((a, b) => a - b);
      for (const q of this.quantiles) {
        const v = this._quantile(sorted, q);
        lines.push(
          `${this.name}${renderLabelBlock(entry.labels, this.labelNames, { quantile: q })} ${formatValue(v)}`
        );
      }
      lines.push(`${this.name}_sum${renderLabelBlock(entry.labels, this.labelNames)} ${formatValue(entry.sum)}`);
      lines.push(`${this.name}_count${renderLabelBlock(entry.labels, this.labelNames)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INFO — label-only constant (value always 1)
// מידע — תווית בלבד, ערך קבוע 1
// ─────────────────────────────────────────────────────────────────────────────

class Info extends Metric {
  constructor(name, help, labels = {}) {
    const labelNames = Object.keys(labels);
    super(name, help, labelNames);
    this.type = 'gauge'; // Prometheus has no explicit info type in v0.0.4
    this.staticLabels = { ...labels };
  }

  set(labels) {
    for (const k of Object.keys(labels || {})) {
      if (!LABEL_NAME_RE.test(k)) throw new Error(`Invalid label: ${k}`);
    }
    this.labelNames = Object.keys(labels);
    this.staticLabels = { ...labels };
  }

  collect() {
    const lines = [];
    lines.push(`# HELP ${this.name} ${escapeHelp(this.help)}`);
    lines.push(`# TYPE ${this.name} gauge`);
    lines.push(`${this.name}${renderLabelBlock(this.staticLabels, this.labelNames)} 1`);
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// רישום מטריקות
// ─────────────────────────────────────────────────────────────────────────────

class Registry {
  constructor() {
    this.metricsByName = new Map();
    this.defaultLabels = {};
  }

  setDefaultLabels(labels) {
    this.defaultLabels = { ...labels };
  }

  register(metric) {
    if (this.metricsByName.has(metric.name)) {
      throw new Error(`Metric ${metric.name} already registered`);
    }
    this.metricsByName.set(metric.name, metric);
    return metric;
  }

  unregister(name) {
    return this.metricsByName.delete(name);
  }

  get(name) {
    return this.metricsByName.get(name);
  }

  counter(name, help, labelNames = []) {
    return this.register(new Counter(name, help, labelNames));
  }

  gauge(name, help, labelNames = [], collectFn = null) {
    return this.register(new Gauge(name, help, labelNames, collectFn));
  }

  histogram(name, help, buckets = DEFAULT_BUCKETS, labelNames = []) {
    return this.register(new Histogram(name, help, buckets, labelNames));
  }

  summary(name, help, quantiles = DEFAULT_QUANTILES, labelNames = []) {
    return this.register(new Summary(name, help, quantiles, labelNames));
  }

  info(name, help, labels = {}) {
    return this.register(new Info(name, help, labels));
  }

  /**
   * Collect all registered metrics and return the Prometheus text body.
   * איסוף כל המטריקות והחזרת גוף טקסט לפורמט Prometheus.
   */
  collect() {
    const blocks = [];
    for (const m of this.metricsByName.values()) {
      const rendered = m.collect();
      if (rendered) blocks.push(rendered);
    }
    return blocks.join('\n') + '\n';
  }

  /**
   * HTTP Content-Type header value for Prometheus text format.
   */
  contentType() {
    return CONTENT_TYPE;
  }

  clear() {
    this.metricsByName.clear();
  }
}

// Factory — matches task export signature.
function createRegistry() {
  return new Registry();
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT NODE.JS / PROCESS METRICS
// מטריקות ברירת מחדל לתהליך Node.js
// ─────────────────────────────────────────────────────────────────────────────

function collectDefaultMetrics(registry) {
  if (!registry || typeof registry.register !== 'function') {
    throw new Error('collectDefaultMetrics: registry required');
  }

  const startTime = Math.floor(Date.now() / 1000);

  // process_cpu_user_seconds_total
  const cpuUser = new Counter(
    'process_cpu_user_seconds_total',
    'Total user CPU time spent in seconds.',
    []
  );
  // Override collect to sample live.
  const origCpuUserCollect = cpuUser.collect.bind(cpuUser);
  cpuUser.collect = function () {
    try {
      const u = process.cpuUsage();
      cpuUser.values.clear();
      cpuUser.values.set('', { labels: {}, value: u.user / 1e6 });
    } catch (_e) { /* ignore */ }
    return origCpuUserCollect();
  };
  registry.register(cpuUser);

  // process_cpu_system_seconds_total
  const cpuSys = new Counter(
    'process_cpu_system_seconds_total',
    'Total system CPU time spent in seconds.',
    []
  );
  const origCpuSysCollect = cpuSys.collect.bind(cpuSys);
  cpuSys.collect = function () {
    try {
      const u = process.cpuUsage();
      cpuSys.values.clear();
      cpuSys.values.set('', { labels: {}, value: u.system / 1e6 });
    } catch (_e) { /* ignore */ }
    return origCpuSysCollect();
  };
  registry.register(cpuSys);

  // process_resident_memory_bytes
  registry.register(new Gauge(
    'process_resident_memory_bytes',
    'Resident memory size (RSS) of the Node.js process in bytes.',
    [],
    (g) => {
      try { g.set(process.memoryUsage().rss); } catch (_e) { /* ignore */ }
    }
  ));

  // process_heap_bytes
  registry.register(new Gauge(
    'process_heap_bytes',
    'Process heap size used in bytes.',
    [],
    (g) => {
      try { g.set(process.memoryUsage().heapUsed); } catch (_e) { /* ignore */ }
    }
  ));

  // process_open_fds  — Linux only via /proc; best-effort, reports 0 otherwise
  registry.register(new Gauge(
    'process_open_fds',
    'Number of open file descriptors (0 if unavailable on this platform).',
    [],
    (g) => {
      // Zero-dep best-effort: /proc/self/fd is Linux-only.
      try {
        const fs = require('node:fs');
        if (fs.existsSync && fs.existsSync('/proc/self/fd')) {
          g.set(fs.readdirSync('/proc/self/fd').length);
          return;
        }
      } catch (_e) { /* ignore */ }
      g.set(0);
    }
  ));

  // process_start_time_seconds
  registry.register(new Gauge(
    'process_start_time_seconds',
    'Start time of the process since unix epoch in seconds.',
    [],
    (g) => g.set(startTime)
  ));

  // nodejs_eventloop_lag_seconds — lightweight self-sampling gauge
  let lastLagSample = 0;
  const lagProbe = () => {
    const t0 = process.hrtime.bigint();
    setImmediate(() => {
      const dt = Number(process.hrtime.bigint() - t0) / 1e9;
      lastLagSample = dt;
    });
  };
  // Probe once on registration so collect() always has a value.
  try { lagProbe(); } catch (_e) { /* ignore */ }

  registry.register(new Gauge(
    'nodejs_eventloop_lag_seconds',
    'Lag of the Node.js event loop in seconds.',
    [],
    (g) => {
      g.set(lastLagSample);
      try { lagProbe(); } catch (_e) { /* ignore */ }
    }
  ));

  // nodejs_active_handles
  registry.register(new Gauge(
    'nodejs_active_handles',
    'Number of active libuv handles held by the Node.js process.',
    [],
    (g) => {
      try {
        const arr = (typeof process._getActiveHandles === 'function')
          ? process._getActiveHandles() : [];
        g.set(arr.length);
      } catch (_e) { g.set(0); }
    }
  ));

  // nodejs_active_requests
  registry.register(new Gauge(
    'nodejs_active_requests',
    'Number of active libuv requests held by the Node.js process.',
    [],
    (g) => {
      try {
        const arr = (typeof process._getActiveRequests === 'function')
          ? process._getActiveRequests() : [];
        g.set(arr.length);
      } catch (_e) { g.set(0); }
    }
  ));

  return registry;
}

// ─────────────────────────────────────────────────────────────────────────────
// ERP SEED METRICS
// מטריקות זרע של ה-ERP
// ─────────────────────────────────────────────────────────────────────────────

function registerErpMetrics(registry) {
  if (!registry || typeof registry.register !== 'function') {
    throw new Error('registerErpMetrics: registry required');
  }

  const httpRequestsTotal = registry.counter(
    'erp_http_requests_total',
    'Total number of HTTP requests handled by the ERP application.',
    ['method', 'route', 'status']
  );

  const httpRequestDurationSeconds = registry.histogram(
    'erp_http_request_duration_seconds',
    'HTTP request latency in seconds (ERP app).',
    DEFAULT_BUCKETS,
    ['method', 'route']
  );

  const invoicesCreatedTotal = registry.counter(
    'erp_invoices_created_total',
    'Total number of invoices created by the ERP system.',
    []
  );

  const wageSlipsGeneratedTotal = registry.counter(
    'erp_wage_slips_generated_total',
    'Total number of wage slips (payroll slips) generated.',
    []
  );

  const dbQueryDurationSeconds = registry.histogram(
    'erp_db_query_duration_seconds',
    'Database query latency in seconds, by operation + table.',
    DEFAULT_BUCKETS,
    ['operation', 'table']
  );

  const queueSize = registry.gauge(
    'erp_queue_size',
    'Current size of ERP background queues.',
    ['queue']
  );

  const cacheHitsTotal = registry.counter(
    'erp_cache_hits_total',
    'Total number of ERP cache hits.',
    []
  );

  const cacheMissesTotal = registry.counter(
    'erp_cache_misses_total',
    'Total number of ERP cache misses.',
    []
  );

  return {
    httpRequestsTotal,
    httpRequestDurationSeconds,
    invoicesCreatedTotal,
    wageSlipsGeneratedTotal,
    dbQueryDurationSeconds,
    queueSize,
    cacheHitsTotal,
    cacheMissesTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE — /metrics endpoint
// תוכנת ביניים של Express — נקודת הקצה /metrics
// ─────────────────────────────────────────────────────────────────────────────

function metricsEndpoint(registry) {
  if (!registry || typeof registry.collect !== 'function') {
    throw new Error('metricsEndpoint: a registry is required');
  }
  return function metricsHandler(_req, res) {
    try {
      const body = registry.collect();
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', registry.contentType());
      }
      if (typeof res.status === 'function') {
        res.status(200);
      } else {
        res.statusCode = 200;
      }
      if (typeof res.send === 'function') {
        res.send(body);
      } else if (typeof res.end === 'function') {
        res.end(body);
      }
    } catch (err) {
      const msg = `# metrics render error: ${err && err.message}\n`;
      if (typeof res.status === 'function') res.status(500);
      else res.statusCode = 500;
      if (typeof res.send === 'function') res.send(msg);
      else if (typeof res.end === 'function') res.end(msg);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Factories / helpers
  createRegistry,
  collectDefaultMetrics,
  registerErpMetrics,
  metricsEndpoint,
  // Classes
  Registry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  Info,
  // Constants
  DEFAULT_BUCKETS,
  DEFAULT_QUANTILES,
  CONTENT_TYPE,
  // Internal helpers (exposed for tests)
  _internals: {
    escapeHelp,
    escapeLabelValue,
    canonicalLabelKey,
    renderLabelBlock,
    formatValue,
    validateMetricName,
    validateLabelNames,
  },
};
