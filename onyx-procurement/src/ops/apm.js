/**
 * ONYX OPS — Application Performance Monitoring (APM)
 * =====================================================
 * Agent X-59  /  Techno-Kol Uzi mega-ERP  /  Swarm 3D
 *
 * Zero-dependency, bilingual (he/en) application-performance monitor for
 * the ONYX Procurement platform. Captures latency distributions, throughput,
 * error rates, runtime health, and produces aggregated views across rolling
 * windows (1m / 5m / 15m / 1h / 1d).
 *
 * ---------------------------------------------------------------------------
 * Measurements (10)
 *   1.  HTTP request latency (route-level)
 *   2.  Database query time (per table / per op)
 *   3.  External API call time (per endpoint)
 *   4.  Cache hit/miss ratios
 *   5.  Queue wait time + processing time
 *   6.  Background job duration
 *   7.  Memory allocation per request (heap delta)
 *   8.  Event loop lag
 *   9.  GC pressure  (gc count + duration, when PerformanceObserver available)
 *   10. CPU profiling (sample-based)
 *
 * Aggregation
 *   - Rolling windows: 60_000, 300_000, 900_000, 3_600_000, 86_400_000 ms
 *   - Quantiles: P50, P75, P90, P95, P99
 *   - Apdex score with apdex_t (default 500 ms)
 *   - Throughput (req/sec)
 *   - Error rate
 *   - Top-N slow routes / queries
 *
 * Exports
 *   createApm(opts) -> Apm
 *   apm.recordRequest({route, method, duration, status})
 *   apm.recordQuery({operation, table, duration, rows})
 *   apm.recordExternalCall({host, duration, status})
 *   apm.recordCacheAccess({key, hit})
 *   apm.recordJob({name, duration, success})
 *   apm.recordQueue({queue, wait, process, success})
 *   apm.getMetrics(window) -> aggregated stats
 *   apm.topSlowRoutes(limit, window)
 *   apm.topSlowQueries(limit, window)
 *   apm.apdex(window, t?)
 *   apm.healthScore() -> 0..100
 *   apm.apmMiddleware()  -> Express middleware (auto request latency)
 *   apm.wrapQuery(fn)    -> timed DB wrapper
 *
 * Integrations
 *   - feed() into prom-client-compatible registry (X-52 metrics.js)
 *   - feed() into JSONL log store (X-54 log-store.jsonl)
 *
 * Design goals
 *   - Zero npm dependencies — stdlib only (perf_hooks, process, fs, path)
 *   - Never throws from the hot path (swallows everything)
 *   - Bounded memory: ring buffers per measurement, capped at ~4096 samples
 *   - Hebrew + English labels via t(key, lang)
 *   - Safe to require in boot; monitors are optional (start/stop)
 */

'use strict';

const perf_hooks = require('perf_hooks');
const os = require('os');

// ═══════════════════════════════════════════════════════════════════════════
// i18n  — Hebrew / English labels used by healthScore + summary messages
// ═══════════════════════════════════════════════════════════════════════════

const I18N = {
  he: {
    healthy: 'תקין',
    degraded: 'ירידת ביצועים',
    critical: 'קריטי',
    apdex_excellent: 'מצוין',
    apdex_good: 'טוב',
    apdex_fair: 'סביר',
    apdex_poor: 'חלש',
    apdex_unacceptable: 'לא תקין',
    no_data: 'אין נתונים',
    route: 'נתיב',
    query: 'שאילתא',
    errors: 'שגיאות',
    throughput: 'תפוקה',
    p50: 'חציון',
    p95: 'אחוזון 95',
    hit_rate: 'אחוז פגיעות מטמון',
    event_loop: 'השהיית לולאה',
    gc_pause: 'השהיית איסוף זבל',
    cpu: 'מעבד',
  },
  en: {
    healthy: 'healthy',
    degraded: 'degraded',
    critical: 'critical',
    apdex_excellent: 'excellent',
    apdex_good: 'good',
    apdex_fair: 'fair',
    apdex_poor: 'poor',
    apdex_unacceptable: 'unacceptable',
    no_data: 'no data',
    route: 'route',
    query: 'query',
    errors: 'errors',
    throughput: 'throughput',
    p50: 'p50',
    p95: 'p95',
    hit_rate: 'cache hit rate',
    event_loop: 'event loop lag',
    gc_pause: 'gc pause',
    cpu: 'cpu',
  },
};

function t(key, lang) {
  const l = (lang === 'he' || lang === 'en') ? lang : 'en';
  return (I18N[l] && I18N[l][key]) || key;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const WINDOWS = Object.freeze({
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
});

const DEFAULT_WINDOW = '5m';
const DEFAULT_APDEX_T = 500; // ms
const DEFAULT_RING_CAP = 4096;
const DEFAULT_EL_SAMPLE_MS = 1000;
const DEFAULT_CPU_SAMPLE_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function now() { return Date.now(); }

function normalizeWindow(w) {
  if (!w) return WINDOWS[DEFAULT_WINDOW];
  if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w;
  if (typeof w === 'string' && WINDOWS[w] != null) return WINDOWS[w];
  return WINDOWS[DEFAULT_WINDOW];
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

// ---------------------------------------------------------------------------
// Quantile from a pre-sorted numeric array (linear interpolation).
// Accepts any sorted array; returns 0 on empty input.
// ---------------------------------------------------------------------------
function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[n - 1];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ---------------------------------------------------------------------------
// Ring buffer of { ts, v, ...meta } samples with time-window filtering.
// Bounded capacity; oldest samples are evicted when cap is hit.
// ---------------------------------------------------------------------------
class RingBuffer {
  constructor(cap) {
    this.cap = cap > 0 ? cap : DEFAULT_RING_CAP;
    this.buf = new Array(this.cap);
    this.head = 0;   // write position
    this.size = 0;   // number of valid entries (<= cap)
  }

  push(entry) {
    this.buf[this.head] = entry;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  // Returns [] of entries whose ts >= cutoff, newest last.
  // Iterates at most `size` items — never touches expired slots.
  sinceTs(cutoff) {
    const out = [];
    if (this.size === 0) return out;
    // Walk backwards from (head - 1) for `size` entries
    for (let i = 0; i < this.size; i++) {
      let idx = this.head - 1 - i;
      if (idx < 0) idx += this.cap;
      const entry = this.buf[idx];
      if (!entry) continue;
      if (entry.ts < cutoff) break;
      out.push(entry);
    }
    out.reverse();
    return out;
  }

  all() { return this.sinceTs(0); }

  clear() {
    this.head = 0;
    this.size = 0;
    // Leave buf allocated — push() will overwrite.
  }
}

// ---------------------------------------------------------------------------
// Summary stats from an array of numeric latency samples (unsorted).
// ---------------------------------------------------------------------------
function summarize(values) {
  const n = values.length;
  if (n === 0) {
    return {
      count: 0,
      min: 0, max: 0, mean: 0, sum: 0,
      p50: 0, p75: 0, p90: 0, p95: 0, p99: 0,
    };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    count: n,
    min, max,
    mean: sum / n,
    sum,
    p50: quantileSorted(sorted, 0.50),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.90),
    p95: quantileSorted(sorted, 0.95),
    p99: quantileSorted(sorted, 0.99),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// APM CLASS
// ═══════════════════════════════════════════════════════════════════════════

class Apm {
  constructor(opts) {
    opts = opts || {};
    this.lang = opts.lang || 'en';
    this.apdexT = safeNum(opts.apdexT, DEFAULT_APDEX_T);
    this.ringCap = opts.ringCap || DEFAULT_RING_CAP;
    this.elSampleMs = opts.eventLoopSampleMs || DEFAULT_EL_SAMPLE_MS;
    this.cpuSampleMs = opts.cpuSampleMs || DEFAULT_CPU_SAMPLE_MS;

    // Ring buffers per measurement type
    this.requests   = new RingBuffer(this.ringCap);   // {ts,v,route,method,status,error}
    this.queries    = new RingBuffer(this.ringCap);   // {ts,v,table,operation,rows}
    this.externals  = new RingBuffer(this.ringCap);   // {ts,v,host,status,error}
    this.cache      = new RingBuffer(this.ringCap);   // {ts,hit(bool),key}
    this.queueWait  = new RingBuffer(this.ringCap);   // {ts,v,queue}  (wait time)
    this.queueProc  = new RingBuffer(this.ringCap);   // {ts,v,queue}  (process time)
    this.jobs       = new RingBuffer(this.ringCap);   // {ts,v,name,success}
    this.memDelta   = new RingBuffer(this.ringCap);   // {ts,v,route}  (heap delta bytes)
    this.eventLoop  = new RingBuffer(this.ringCap);   // {ts,v}        (lag ms)
    this.gcPause    = new RingBuffer(this.ringCap);   // {ts,v,kind}   (pause ms)
    this.cpuSamples = new RingBuffer(this.ringCap);   // {ts,v}        (user+sys us delta)

    // Cumulative counters (never roll)
    this.counters = {
      requests_total: 0,
      requests_errors: 0,
      queries_total: 0,
      externals_total: 0,
      externals_errors: 0,
      cache_hits: 0,
      cache_misses: 0,
      jobs_total: 0,
      jobs_failures: 0,
      gc_major: 0,
      gc_minor: 0,
      gc_incremental: 0,
      gc_weakcb: 0,
    };

    // Integration sinks (lazy-bound; APM never hard-requires these)
    this._prom = null;        // prom-client-compatible registry or X-52 module
    this._logStore = null;    // X-54 log store (.append / .record)

    // Runtime monitors (started/stopped on demand)
    this._elTimer = null;
    this._cpuTimer = null;
    this._gcObserver = null;
    this._lastCpuUsage = null;

    // Start time for health checks
    this._startedAt = now();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECORDERS (public) — every recorder swallows its own errors
  // ─────────────────────────────────────────────────────────────────────────

  recordRequest(ev) {
    try {
      if (!ev) return;
      const duration = safeNum(ev.duration, 0);
      const status = safeNum(ev.status, 0);
      const isErr = status >= 500 || ev.error === true;
      this.requests.push({
        ts: ev.ts || now(),
        v: duration,
        route: String(ev.route || 'unknown'),
        method: String(ev.method || 'GET').toUpperCase(),
        status,
        error: isErr,
      });
      this.counters.requests_total++;
      if (isErr) this.counters.requests_errors++;
      this._feedProm('http', { route: ev.route, method: ev.method, status, duration });
      this._feedLog('http', { route: ev.route, method: ev.method, status, duration });
    } catch (_e) { /* swallow */ }
  }

  recordQuery(ev) {
    try {
      if (!ev) return;
      const duration = safeNum(ev.duration, 0);
      this.queries.push({
        ts: ev.ts || now(),
        v: duration,
        operation: String(ev.operation || 'select').toLowerCase(),
        table: String(ev.table || 'unknown'),
        rows: safeNum(ev.rows, 0),
      });
      this.counters.queries_total++;
      this._feedProm('db', { operation: ev.operation, table: ev.table, duration });
      this._feedLog('db', { operation: ev.operation, table: ev.table, duration });
    } catch (_e) { /* swallow */ }
  }

  recordExternalCall(ev) {
    try {
      if (!ev) return;
      const duration = safeNum(ev.duration, 0);
      const status = safeNum(ev.status, 0);
      const isErr = status >= 500 || ev.error === true;
      this.externals.push({
        ts: ev.ts || now(),
        v: duration,
        host: String(ev.host || 'unknown'),
        status,
        error: isErr,
      });
      this.counters.externals_total++;
      if (isErr) this.counters.externals_errors++;
      this._feedProm('ext', { host: ev.host, status, duration });
      this._feedLog('ext', { host: ev.host, status, duration });
    } catch (_e) { /* swallow */ }
  }

  recordCacheAccess(ev) {
    try {
      if (!ev) return;
      const hit = !!ev.hit;
      this.cache.push({
        ts: ev.ts || now(),
        hit,
        key: String(ev.key || ''),
      });
      if (hit) this.counters.cache_hits++;
      else this.counters.cache_misses++;
    } catch (_e) { /* swallow */ }
  }

  recordQueue(ev) {
    try {
      if (!ev) return;
      const ts = ev.ts || now();
      const queue = String(ev.queue || 'default');
      if (Number.isFinite(ev.wait)) {
        this.queueWait.push({ ts, v: Number(ev.wait), queue });
      }
      if (Number.isFinite(ev.process)) {
        this.queueProc.push({ ts, v: Number(ev.process), queue });
      }
    } catch (_e) { /* swallow */ }
  }

  recordJob(ev) {
    try {
      if (!ev) return;
      const duration = safeNum(ev.duration, 0);
      const success = ev.success !== false;
      this.jobs.push({
        ts: ev.ts || now(),
        v: duration,
        name: String(ev.name || 'anon'),
        success,
      });
      this.counters.jobs_total++;
      if (!success) this.counters.jobs_failures++;
      this._feedProm('job', { name: ev.name, success, duration });
      this._feedLog('job', { name: ev.name, success, duration });
    } catch (_e) { /* swallow */ }
  }

  recordMemoryDelta(ev) {
    try {
      if (!ev) return;
      this.memDelta.push({
        ts: ev.ts || now(),
        v: safeNum(ev.delta, 0),
        route: String(ev.route || 'unknown'),
      });
    } catch (_e) { /* swallow */ }
  }

  recordEventLoopLag(ms) {
    try {
      this.eventLoop.push({ ts: now(), v: safeNum(ms, 0) });
    } catch (_e) { /* swallow */ }
  }

  recordGcPause(ms, kind) {
    try {
      this.gcPause.push({ ts: now(), v: safeNum(ms, 0), kind: String(kind || '?') });
      if (kind === 'major') this.counters.gc_major++;
      else if (kind === 'minor') this.counters.gc_minor++;
      else if (kind === 'incremental') this.counters.gc_incremental++;
      else if (kind === 'weakcb') this.counters.gc_weakcb++;
    } catch (_e) { /* swallow */ }
  }

  recordCpuSample(microsDelta) {
    try {
      this.cpuSamples.push({ ts: now(), v: safeNum(microsDelta, 0) });
    } catch (_e) { /* swallow */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AGGREGATIONS
  // ─────────────────────────────────────────────────────────────────────────

  getMetrics(windowArg) {
    const windowMs = normalizeWindow(windowArg);
    const cutoff = now() - windowMs;

    const reqEntries = this.requests.sinceTs(cutoff);
    const reqValues = reqEntries.map(e => e.v);
    const requestSummary = summarize(reqValues);
    const errorCount = reqEntries.reduce((a, e) => a + (e.error ? 1 : 0), 0);

    const qEntries = this.queries.sinceTs(cutoff);
    const querySummary = summarize(qEntries.map(e => e.v));

    const extEntries = this.externals.sinceTs(cutoff);
    const externalSummary = summarize(extEntries.map(e => e.v));
    const externalErrorCount = extEntries.reduce((a, e) => a + (e.error ? 1 : 0), 0);

    const cacheEntries = this.cache.sinceTs(cutoff);
    let hits = 0, misses = 0;
    for (const e of cacheEntries) { if (e.hit) hits++; else misses++; }
    const cacheTotal = hits + misses;
    const cacheRatio = cacheTotal > 0 ? hits / cacheTotal : 0;

    const qwSummary = summarize(this.queueWait.sinceTs(cutoff).map(e => e.v));
    const qpSummary = summarize(this.queueProc.sinceTs(cutoff).map(e => e.v));

    const jobEntries = this.jobs.sinceTs(cutoff);
    const jobSummary = summarize(jobEntries.map(e => e.v));
    const jobFailures = jobEntries.reduce((a, e) => a + (e.success ? 0 : 1), 0);

    const memSummary = summarize(this.memDelta.sinceTs(cutoff).map(e => e.v));
    const elSummary  = summarize(this.eventLoop.sinceTs(cutoff).map(e => e.v));
    const gcSummary  = summarize(this.gcPause.sinceTs(cutoff).map(e => e.v));
    const cpuSummary = summarize(this.cpuSamples.sinceTs(cutoff).map(e => e.v));

    const windowSec = windowMs / 1000;
    const throughput = windowSec > 0 ? reqEntries.length / windowSec : 0;
    const errorRate = reqEntries.length > 0 ? errorCount / reqEntries.length : 0;

    return {
      window_ms: windowMs,
      generated_at: new Date().toISOString(),
      request: Object.assign({}, requestSummary, {
        throughput_per_sec: throughput,
        error_count: errorCount,
        error_rate: errorRate,
      }),
      query: querySummary,
      external: Object.assign({}, externalSummary, {
        error_count: externalErrorCount,
      }),
      cache: {
        hits, misses,
        total: cacheTotal,
        hit_ratio: cacheRatio,
        miss_ratio: cacheTotal > 0 ? misses / cacheTotal : 0,
      },
      queue: {
        wait: qwSummary,
        process: qpSummary,
      },
      job: Object.assign({}, jobSummary, {
        failures: jobFailures,
        failure_rate: jobEntries.length > 0 ? jobFailures / jobEntries.length : 0,
      }),
      memory_delta: memSummary,
      event_loop_lag_ms: elSummary,
      gc_pause_ms: gcSummary,
      cpu_us: cpuSummary,
      counters: Object.assign({}, this.counters),
      apdex: this.apdex(windowArg),
    };
  }

  topSlowRoutes(limit, windowArg) {
    const lim = limit > 0 ? limit : 10;
    const cutoff = now() - normalizeWindow(windowArg);
    const groups = new Map(); // key -> values[]
    for (const e of this.requests.sinceTs(cutoff)) {
      const key = `${e.method} ${e.route}`;
      let arr = groups.get(key);
      if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(e.v);
    }
    const out = [];
    for (const [key, arr] of groups) {
      const sum = arr.reduce((a, b) => a + b, 0);
      const sorted = arr.slice().sort((a, b) => a - b);
      out.push({
        route: key,
        count: arr.length,
        mean: sum / arr.length,
        p95: quantileSorted(sorted, 0.95),
        p99: quantileSorted(sorted, 0.99),
        total_ms: sum,
      });
    }
    out.sort((a, b) => b.p95 - a.p95);
    return out.slice(0, lim);
  }

  topSlowQueries(limit, windowArg) {
    const lim = limit > 0 ? limit : 10;
    const cutoff = now() - normalizeWindow(windowArg);
    const groups = new Map();
    for (const e of this.queries.sinceTs(cutoff)) {
      const key = `${e.operation}:${e.table}`;
      let arr = groups.get(key);
      if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(e.v);
    }
    const out = [];
    for (const [key, arr] of groups) {
      const sum = arr.reduce((a, b) => a + b, 0);
      const sorted = arr.slice().sort((a, b) => a - b);
      out.push({
        query: key,
        count: arr.length,
        mean: sum / arr.length,
        p95: quantileSorted(sorted, 0.95),
        p99: quantileSorted(sorted, 0.99),
        total_ms: sum,
      });
    }
    out.sort((a, b) => b.p95 - a.p95);
    return out.slice(0, lim);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APDEX  (Application Performance Index)
  //   satisfied: d <= t
  //   tolerating: t < d <= 4t
  //   frustrated: d > 4t  or  error
  //   score = (satisfied + tolerating/2) / total
  // ─────────────────────────────────────────────────────────────────────────
  apdex(windowArg, tArg) {
    const windowMs = normalizeWindow(windowArg);
    const cutoff = now() - windowMs;
    const t = Number.isFinite(tArg) && tArg > 0 ? tArg : this.apdexT;

    const entries = this.requests.sinceTs(cutoff);
    const total = entries.length;
    if (total === 0) {
      return { score: 1, total: 0, satisfied: 0, tolerating: 0, frustrated: 0, t };
    }
    let s = 0, tol = 0, fr = 0;
    for (const e of entries) {
      if (e.error) { fr++; continue; }
      if (e.v <= t) s++;
      else if (e.v <= 4 * t) tol++;
      else fr++;
    }
    const score = (s + tol / 2) / total;
    return {
      score: Math.round(score * 10000) / 10000,
      total,
      satisfied: s,
      tolerating: tol,
      frustrated: fr,
      t,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH SCORE  (0..100) — a weighted blend over APM signals
  //   - request p95 vs 1000 ms  (weight 25)
  //   - error rate vs 1 %        (weight 25)
  //   - apdex score              (weight 20)
  //   - event-loop lag p95 vs 100 ms  (weight 15)
  //   - cache hit ratio          (weight 10)
  //   - gc pause p95 vs 100 ms   (weight  5)
  // ─────────────────────────────────────────────────────────────────────────
  healthScore() {
    const m = this.getMetrics('5m');

    // score helpers: map (value, target) -> 0..1 where 0 means "at or beyond target"
    function invLinear(value, bad) {
      if (!Number.isFinite(value) || value <= 0) return 1;
      if (value >= bad) return 0;
      return 1 - (value / bad);
    }

    const reqP95Score = invLinear(m.request.p95, 1000);             // 1 s
    const errRateScore = invLinear(m.request.error_rate, 0.10);     // 10 %
    const apdexScore = m.apdex.score;                               // already 0..1
    const elLagScore = invLinear(m.event_loop_lag_ms.p95, 100);     // 100 ms
    const cacheScore = Number.isFinite(m.cache.hit_ratio) ? m.cache.hit_ratio : 1;
    const gcScore = invLinear(m.gc_pause_ms.p95, 100);              // 100 ms

    const weighted =
      reqP95Score * 25 +
      errRateScore * 25 +
      apdexScore * 20 +
      elLagScore * 15 +
      cacheScore * 10 +
      gcScore * 5;

    const score = Math.max(0, Math.min(100, Math.round(weighted)));
    const status =
      score >= 80 ? 'healthy' :
      score >= 50 ? 'degraded' : 'critical';

    return {
      score,
      status,
      label_he: t(status, 'he'),
      label_en: t(status, 'en'),
      components: {
        request_p95: m.request.p95,
        error_rate: m.request.error_rate,
        apdex: m.apdex.score,
        event_loop_lag_p95: m.event_loop_lag_ms.p95,
        cache_hit_ratio: m.cache.hit_ratio,
        gc_pause_p95: m.gc_pause_ms.p95,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPRESS MIDDLEWARE  — measures latency + heap delta + status
  // ─────────────────────────────────────────────────────────────────────────
  apmMiddleware() {
    const self = this;
    return function onyxApmMiddleware(req, res, next) {
      try {
        const start = process.hrtime.bigint();
        let heapStart = 0;
        try { heapStart = process.memoryUsage().heapUsed; } catch (_e) { /* noop */ }

        res.on('finish', () => {
          try {
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1e6; // ns -> ms
            const route =
              (req.route && (req.baseUrl || '') + req.route.path) ||
              ((req.originalUrl || req.url || '').split('?')[0]);
            self.recordRequest({
              route,
              method: (req.method || 'GET').toUpperCase(),
              duration,
              status: res.statusCode || 0,
            });
            let heapEnd = heapStart;
            try { heapEnd = process.memoryUsage().heapUsed; } catch (_e) { /* noop */ }
            self.recordMemoryDelta({
              route,
              delta: heapEnd - heapStart,
            });
          } catch (_e) { /* swallow */ }
        });
      } catch (_e) { /* swallow */ }
      next();
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WRAPQUERY  — wrap a DB .query(sql, params, [cb]) function with timings
  //   Supports both callback and Promise-based drivers.
  //   The wrapper inspects the SQL to infer operation + first table.
  // ─────────────────────────────────────────────────────────────────────────
  wrapQuery(originalQuery, context) {
    const self = this;
    const ctx = context || {};
    if (typeof originalQuery !== 'function') {
      throw new Error('wrapQuery requires a function');
    }
    return function wrappedQuery(...args) {
      const start = process.hrtime.bigint();
      const sql = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].text) || '';
      const opInfo = parseSqlForMetrics(sql);
      const finish = (err, result) => {
        try {
          const end = process.hrtime.bigint();
          const duration = Number(end - start) / 1e6;
          const rows =
            (result && (result.rowCount || (Array.isArray(result) ? result.length : (result.rows && result.rows.length)))) ||
            0;
          self.recordQuery({
            operation: opInfo.operation,
            table: ctx.table || opInfo.table,
            duration,
            rows,
          });
        } catch (_e) { /* swallow */ }
      };

      // Callback API: last arg is a function
      const maybeCb = args[args.length - 1];
      if (typeof maybeCb === 'function') {
        args[args.length - 1] = function wrappedCb(err, result) {
          finish(err, result);
          return maybeCb(err, result);
        };
        return originalQuery.apply(this, args);
      }

      // Promise API
      let pr;
      try { pr = originalQuery.apply(this, args); }
      catch (e) { finish(e, null); throw e; }

      if (pr && typeof pr.then === 'function') {
        return pr.then(
          (result) => { finish(null, result); return result; },
          (err) => { finish(err, null); throw err; },
        );
      }
      // Sync return (rare, but handled)
      finish(null, pr);
      return pr;
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RUNTIME MONITORS  — optional background samplers
  //   start() enables them;  stop() disables them.
  //   Each monitor is wrapped in try/catch so start() is always safe.
  // ─────────────────────────────────────────────────────────────────────────
  start() {
    try { this._startEventLoopMonitor(); } catch (_e) { /* swallow */ }
    try { this._startCpuMonitor(); } catch (_e) { /* swallow */ }
    try { this._startGcMonitor(); } catch (_e) { /* swallow */ }
    return this;
  }

  stop() {
    try {
      if (this._elTimer) {
        clearInterval(this._elTimer);
        this._elTimer = null;
      }
      if (this._cpuTimer) {
        clearInterval(this._cpuTimer);
        this._cpuTimer = null;
      }
      if (this._gcObserver) {
        try { this._gcObserver.disconnect(); } catch (_e) { /* noop */ }
        this._gcObserver = null;
      }
    } catch (_e) { /* swallow */ }
    return this;
  }

  _startEventLoopMonitor() {
    if (this._elTimer) return;
    let last = process.hrtime.bigint();
    const interval = this.elSampleMs;
    this._elTimer = setInterval(() => {
      try {
        const nowHr = process.hrtime.bigint();
        const elapsedMs = Number(nowHr - last) / 1e6;
        // lag = actual interval - expected interval, clamped >= 0
        const lag = Math.max(0, elapsedMs - interval);
        last = nowHr;
        this.recordEventLoopLag(lag);
      } catch (_e) { /* swallow */ }
    }, interval);
    // Allow the node process to exit even if APM is running
    if (this._elTimer && typeof this._elTimer.unref === 'function') this._elTimer.unref();
  }

  _startCpuMonitor() {
    if (this._cpuTimer) return;
    try { this._lastCpuUsage = process.cpuUsage(); } catch (_e) { this._lastCpuUsage = null; }
    this._cpuTimer = setInterval(() => {
      try {
        if (!process.cpuUsage) return;
        const diff = process.cpuUsage(this._lastCpuUsage || undefined);
        const total = (diff.user || 0) + (diff.system || 0);
        this.recordCpuSample(total);
        this._lastCpuUsage = process.cpuUsage();
      } catch (_e) { /* swallow */ }
    }, this.cpuSampleMs);
    if (this._cpuTimer && typeof this._cpuTimer.unref === 'function') this._cpuTimer.unref();
  }

  _startGcMonitor() {
    if (this._gcObserver) return;
    const { PerformanceObserver, constants } = perf_hooks;
    if (typeof PerformanceObserver !== 'function') return;
    const self = this;
    try {
      this._gcObserver = new PerformanceObserver((list) => {
        try {
          for (const entry of list.getEntries()) {
            const kind = gcKindFromFlags((entry.detail && entry.detail.kind) || entry.kind || 0, constants);
            self.recordGcPause(entry.duration, kind);
          }
        } catch (_e) { /* swallow */ }
      });
      this._gcObserver.observe({ entryTypes: ['gc'], buffered: false });
    } catch (_e) { /* swallow — not all Node versions expose gc entries */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION — feeds to X-52 (Prometheus) and X-54 (log store)
  // ─────────────────────────────────────────────────────────────────────────
  useProm(promOrRegistry) {
    this._prom = promOrRegistry || null;
    return this;
  }

  useLogStore(store) {
    this._logStore = store || null;
    return this;
  }

  _feedProm(kind, payload) {
    try {
      const p = this._prom;
      if (!p) return;
      // Accept either { metrics } (X-52 shape) or a bare object with observe methods
      const metrics = p.metrics || p;
      if (!metrics) return;
      if (kind === 'http' && metrics.httpRequestDurationSeconds) {
        metrics.httpRequestDurationSeconds.observe(
          { method: (payload.method || 'GET').toUpperCase(), route: payload.route || 'unknown' },
          (payload.duration || 0) / 1000,
        );
        if (metrics.httpRequestsTotal) {
          metrics.httpRequestsTotal.inc({
            method: (payload.method || 'GET').toUpperCase(),
            route: payload.route || 'unknown',
            status: String(payload.status || 0),
          });
        }
      } else if (kind === 'db' && metrics.dbQueryDurationSeconds) {
        metrics.dbQueryDurationSeconds.observe(
          { op: payload.operation || 'select' },
          (payload.duration || 0) / 1000,
        );
      }
    } catch (_e) { /* swallow — integration must never break hot path */ }
  }

  _feedLog(kind, payload) {
    try {
      const s = this._logStore;
      if (!s) return;
      const entry = {
        ts: new Date().toISOString(),
        source: 'apm',
        kind,
        payload,
      };
      if (typeof s.append === 'function') s.append(entry);
      else if (typeof s.record === 'function') s.record(entry);
      else if (typeof s.write === 'function') s.write(entry);
    } catch (_e) { /* swallow */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SNAPSHOT  — a compact view suitable for /api/apm/snapshot
  // ─────────────────────────────────────────────────────────────────────────
  snapshot() {
    return {
      started_at: new Date(this._startedAt).toISOString(),
      host: (os.hostname && os.hostname()) || 'unknown',
      pid: process.pid,
      windows: Object.keys(WINDOWS),
      counters: Object.assign({}, this.counters),
      health: this.healthScore(),
      metrics_5m: this.getMetrics('5m'),
      top_routes: this.topSlowRoutes(5, '5m'),
      top_queries: this.topSlowQueries(5, '5m'),
    };
  }

  reset() {
    this.requests.clear();
    this.queries.clear();
    this.externals.clear();
    this.cache.clear();
    this.queueWait.clear();
    this.queueProc.clear();
    this.jobs.clear();
    this.memDelta.clear();
    this.eventLoop.clear();
    this.gcPause.clear();
    this.cpuSamples.clear();
    for (const k of Object.keys(this.counters)) this.counters[k] = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SQL PARSER — best-effort operation + table extraction for wrapQuery()
// ═══════════════════════════════════════════════════════════════════════════

function parseSqlForMetrics(sql) {
  const out = { operation: 'unknown', table: 'unknown' };
  if (!sql || typeof sql !== 'string') return out;
  const trimmed = sql.trim().toLowerCase();

  // Operation
  if (trimmed.startsWith('select')) out.operation = 'select';
  else if (trimmed.startsWith('insert')) out.operation = 'insert';
  else if (trimmed.startsWith('update')) out.operation = 'update';
  else if (trimmed.startsWith('delete')) out.operation = 'delete';
  else if (trimmed.startsWith('with')) out.operation = 'select';
  else if (trimmed.startsWith('begin') || trimmed.startsWith('commit') || trimmed.startsWith('rollback')) {
    out.operation = 'tx';
  }

  // Table
  // Patterns we look for:
  //   from <table>, update <table>, insert into <table>, delete from <table>
  const patterns = [
    /\bfrom\s+([`"a-z0-9_\.]+)/,
    /\bupdate\s+([`"a-z0-9_\.]+)/,
    /\binto\s+([`"a-z0-9_\.]+)/,
    /\bjoin\s+([`"a-z0-9_\.]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) {
      out.table = m[1].replace(/[`"]/g, '');
      break;
    }
  }
  return out;
}

function gcKindFromFlags(flags, constants) {
  // perf_hooks exposes numeric flag constants — degrade gracefully when absent
  const c = constants || perf_hooks.constants || {};
  if (flags === c.NODE_PERFORMANCE_GC_MAJOR) return 'major';
  if (flags === c.NODE_PERFORMANCE_GC_MINOR) return 'minor';
  if (flags === c.NODE_PERFORMANCE_GC_INCREMENTAL) return 'incremental';
  if (flags === c.NODE_PERFORMANCE_GC_WEAKCB) return 'weakcb';
  if (flags === 1) return 'minor';
  if (flags === 2) return 'major';
  if (flags === 4) return 'incremental';
  if (flags === 8) return 'weakcb';
  return '?';
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

function createApm(opts) {
  return new Apm(opts);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  createApm,
  Apm,
  RingBuffer,
  WINDOWS,
  DEFAULT_APDEX_T,
  DEFAULT_RING_CAP,
  // internals exposed for tests
  _summarize: summarize,
  _quantileSorted: quantileSorted,
  _parseSqlForMetrics: parseSqlForMetrics,
  _t: t,
};
