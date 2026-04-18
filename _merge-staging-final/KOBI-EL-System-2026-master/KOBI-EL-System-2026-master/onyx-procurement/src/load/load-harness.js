/**
 * load-harness.js — Mega-ERP Techno-Kol Uzi — Agent X87 (Load Harness)
 * =====================================================================
 *
 * A k6/vegeta-style HTTP load test harness, zero external dependencies.
 * Built on Node core only: `http`, `https`, `url`, `perf_hooks`,
 * `worker_threads`, `fs`, `os`, `events`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The existing `test/load/qa-15-lib.js` gives us 4 primitives tuned to QA-15
 * scenarios. This is its larger sibling: a reusable LIBRARY, not a one-shot
 * runner. Other agents (UI teams, backend teams, release engineering) can
 * `require('./src/load/load-harness')`, wire up scenarios, and produce
 * JUnit / JSON / HTML reports without touching the QA-15 wiring.
 *
 *   const { LoadTester } = require('./src/load/load-harness');
 *   const lt = new LoadTester({ baseUrl: 'http://localhost:3100' });
 *   lt.addScenario({ name:'list-invoices', url:'/api/invoices', method:'GET', weight:3 });
 *   lt.addScenario({ name:'create-invoice', url:'/api/invoices', method:'POST',
 *                    body:{ supplier_id:1, total:1000 }, weight:1 });
 *   const result = await lt.run({ vus:20, duration:30000, rampUp:5000, rampDown:5000,
 *                                  thresholds:{ http_req_duration:'p(95)<500',
 *                                               http_req_failed:'rate<0.01' } });
 *   lt.exportJSON('./report.json');
 *   lt.exportHTML('./report.html');
 *   lt.exportJUnit('./junit.xml');
 *
 * HARD CONSTRAINTS (RULE: לא מוחקים רק משדרגים ומגדלים)
 * ------------------------------------------------------
 * - ZERO external dependencies. Node core only.
 * - NEVER deletes or overwrites data. The harness only READS over HTTP; write
 *   scenarios are callers' responsibility (they compose POSTs knowing the impact).
 * - Reports are OPTIONAL. Every export is triggered by explicit method calls.
 * - Latency record path is hot-loop safe: constant-time `push` during run,
 *   sort+percentile deferred to `report()`.
 * - TWO execution modes:
 *     a) worker_threads — heavyweight, true OS threads, N virtual users
 *     b) coroutines via setImmediate — single-threaded, async I/O fanout
 *   Caller picks via `{ runner: 'workers' | 'coroutines' }`; default = 'coroutines'
 *   for scenarios that mostly wait on sockets, which is 95% of web load testing.
 *
 * METRICS (k6-compatible names)
 * -----------------------------
 *   http_reqs               — total requests sent
 *   http_req_duration       — total request wallclock (connect + send + wait + recv)
 *   http_req_waiting        — time waiting for first byte (TTFB)
 *   http_req_connecting     — time to establish TCP connection
 *   http_req_receiving      — time to download response body
 *   http_req_sending        — time to upload request body
 *   http_req_failed         — boolean series of failures → rate
 *   data_sent               — bytes uploaded
 *   data_received           — bytes downloaded
 *   vus                     — current virtual users (trend over time)
 *   vus_max                 — peak virtual users
 *   iterations              — scenario-loop iterations completed
 *
 * THRESHOLDS SYNTAX (k6 subset)
 * -----------------------------
 *   'p(95)<500'             — P95 latency below 500ms
 *   'p(99)<1000'            — P99 latency below 1s
 *   'avg<200'               — average below 200ms
 *   'min<10'                — minimum below 10ms
 *   'max<5000'              — maximum below 5s
 *   'med<250'               — median (=p50) below 250ms
 *   'rate<0.01'             — rate (for boolean metrics) below 1%
 *   'rate>0.99'             — rate above 99%
 *   'count<1000'            — total count below 1000
 *   'value<42'              — simple scalar comparison (vus, vus_max, etc.)
 *
 * STAGES (k6-compatible)
 * ----------------------
 *   runStages([
 *     { duration: 10000, target: 20 },   // ramp to 20 VUs over 10s
 *     { duration: 30000, target: 20 },   // hold at 20 VUs for 30s
 *     { duration:  5000, target: 50 },   // spike to 50 VUs in 5s
 *     { duration: 10000, target:  0 },   // ramp down to zero over 10s
 *   ])
 *
 * BILINGUAL REPORTS
 * -----------------
 * HTML export headers are bilingual HE/EN. Embedded SVG charts reuse the
 * Palantir dark palette from `payroll-autonomous/src/components/BIDashboard.jsx`
 * so the whole ERP has a consistent visual language.
 *
 *   bg:     #0b0d10   panel: #13171c    accent:  #4a9eff
 *   text:   #e6edf3   dim:   #8b96a5    success: #3fb950
 *   warn:   #d29922   danger: #f85149   grid:    #232a33
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Worker threads are imported lazily so bundle/require cost is zero unless used.
let _workerThreads = null;
function _loadWorkerThreads() {
  if (!_workerThreads) _workerThreads = require('worker_threads');
  return _workerThreads;
}

// ═══════════════════════════════════════════════════════════════════════
// THEME (reused from BIDashboard — one source of truth across the ERP)
// ═══════════════════════════════════════════════════════════════════════

const BI_THEME = Object.freeze({
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
  grid: '#232a33',
  palette: [
    '#4a9eff', '#3fb950', '#d29922', '#f85149', '#a371f7',
    '#ff8b5b', '#39c5cf', '#e86bb5', '#f0c674', '#8cb4ff',
  ],
});

// ═══════════════════════════════════════════════════════════════════════
// SMALL PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * percentile(sortedAsc, p) — nearest-rank percentile on a PRE-SORTED array.
 * Returns 0 on empty input. p in [0, 100]. Matches k6 percentile behavior.
 */
function percentile(sortedAsc, p) {
  if (!sortedAsc || sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.max(0, Math.min(sortedAsc.length - 1, rank));
  return sortedAsc[idx];
}

/**
 * weightedPick(scenarios) — probabilistic weighted selection from a list of
 * { weight } entries. Returns the selected index. Weights default to 1 if
 * missing. Always returns a valid index for non-empty lists.
 */
function weightedPick(scenarios) {
  if (!scenarios.length) return -1;
  // Coerce weights: explicit 0 means "never pick", missing → 1.
  const weights = scenarios.map(s => {
    if (s.weight === 0) return 0;
    const w = s.weight || 1;
    return w > 0 ? w : 0;
  });
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  // Strict inequality: r < cumulative. This ensures a zero-weight slot
  // cannot be picked because its cumulative band has zero width.
  let r = Math.random() * total;
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r < cum) return i;
  }
  return scenarios.length - 1;
}

/**
 * escapeHtml(s) — minimal HTML escape. Used for embedding scenario names /
 * URLs into the HTML report without opening XSS.
 */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * escapeXml(s) — XML escape for JUnit output. Same as HTML plus nothing.
 */
function escapeXml(s) {
  return escapeHtml(s);
}

/**
 * formatBytes(n) — human-readable IEC suffix (B/KB/MB/GB).
 */
function formatBytes(n) {
  if (!n && n !== 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * formatMs(ms) — latency with adaptive precision.
 */
function formatMs(ms) {
  if (!ms && ms !== 0) return '0 ms';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ═══════════════════════════════════════════════════════════════════════
// HTTP CLIENT — with phase timings (connect / send / wait / receive)
// ═══════════════════════════════════════════════════════════════════════

/**
 * httpRequest(baseUrl, opts) — timed HTTP call with per-phase measurements.
 *
 * Always resolves (never rejects). Transport failures resolve with `ok:false`.
 *
 * opts: {
 *   method,       // 'GET' | 'POST' | ... (default 'GET')
 *   url,          // relative or absolute
 *   headers,      // object
 *   body,         // object | string | Buffer | null
 *   timeout,      // ms (default 30000)
 *   expect,       // number[] of OK status codes (default [200..399])
 * }
 *
 * resolves to: {
 *   ok, status,
 *   duration, waiting, connecting, receiving, sending,  // ms
 *   bytesSent, bytesReceived,
 *   error,
 * }
 */
function httpRequest(baseUrl, opts) {
  const method = (opts.method || 'GET').toUpperCase();
  const timeout = opts.timeout || 30000;
  const expect = opts.expect || null; // null → treat 2xx/3xx as OK

  let bodyBuf = null;
  const headers = Object.assign({
    'Accept': 'application/json',
    'User-Agent': 'onyx-load-harness/1.0',
  }, opts.headers || {});

  if (opts.body != null) {
    if (Buffer.isBuffer(opts.body)) {
      bodyBuf = opts.body;
    } else if (typeof opts.body === 'string') {
      bodyBuf = Buffer.from(opts.body, 'utf8');
    } else {
      bodyBuf = Buffer.from(JSON.stringify(opts.body), 'utf8');
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    headers['Content-Length'] = String(bodyBuf.length);
  }

  let urlObj;
  try {
    urlObj = new URL(opts.url, baseUrl);
  } catch (e) {
    return Promise.resolve({
      ok: false, status: 0,
      duration: 0, waiting: 0, connecting: 0, receiving: 0, sending: 0,
      bytesSent: 0, bytesReceived: 0,
      error: `bad-url: ${e.message}`,
    });
  }

  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise(resolve => {
    const tStart = performance.now();
    let tSocket = 0;
    let tConnect = 0;
    let tRequestSent = 0;
    let tFirstByte = 0;
    let tEnd = 0;
    let bytesReceived = 0;
    const bytesSent = bodyBuf ? bodyBuf.length : 0;
    let finished = false;

    const req = lib.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
    }, (res) => {
      res.on('data', (chunk) => {
        if (!tFirstByte) tFirstByte = performance.now();
        bytesReceived += chunk.length;
      });
      res.on('end', () => {
        if (finished) return;
        finished = true;
        tEnd = performance.now();
        if (!tFirstByte) tFirstByte = tEnd;
        const code = res.statusCode;
        const ok = expect
          ? expect.includes(code)
          : (code >= 200 && code < 400);
        resolve({
          ok, status: code,
          duration: tEnd - tStart,
          connecting: Math.max(0, tConnect - tSocket),
          sending: Math.max(0, tRequestSent - tConnect),
          waiting: Math.max(0, tFirstByte - tRequestSent),
          receiving: Math.max(0, tEnd - tFirstByte),
          bytesSent, bytesReceived,
          error: ok ? null : `http-${code}`,
        });
      });
      res.on('error', (err) => {
        if (finished) return;
        finished = true;
        tEnd = performance.now();
        resolve({
          ok: false, status: res.statusCode || 0,
          duration: tEnd - tStart,
          connecting: 0, sending: 0, waiting: 0, receiving: 0,
          bytesSent, bytesReceived,
          error: `res-error: ${err.message}`,
        });
      });
    });

    req.on('socket', (sock) => {
      tSocket = performance.now();
      if (sock.connecting) {
        sock.once('connect', () => {
          tConnect = performance.now();
        });
      } else {
        tConnect = tSocket;
      }
    });

    req.setTimeout(timeout, () => {
      if (finished) return;
      finished = true;
      req.destroy();
      tEnd = performance.now();
      resolve({
        ok: false, status: 0,
        duration: tEnd - tStart,
        connecting: 0, sending: 0, waiting: 0, receiving: 0,
        bytesSent, bytesReceived,
        error: `timeout-${timeout}ms`,
      });
    });

    req.on('error', (err) => {
      if (finished) return;
      finished = true;
      tEnd = performance.now();
      resolve({
        ok: false, status: 0,
        duration: tEnd - tStart,
        connecting: 0, sending: 0, waiting: 0, receiving: 0,
        bytesSent, bytesReceived,
        error: `req-error: ${err.message}`,
      });
    });

    if (bodyBuf) {
      req.write(bodyBuf);
      tRequestSent = performance.now();
    } else {
      tRequestSent = performance.now();
    }
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// METRIC (k6-style) — a named series with sampling and helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Metric kinds:
 *   - 'trend'    → numeric samples, percentile-capable
 *   - 'rate'     → boolean samples, produces a fraction 0..1
 *   - 'counter'  → monotonic additive counter
 *   - 'gauge'    → last-wins scalar
 */
class Metric {
  constructor(name, kind) {
    this.name = name;
    this.kind = kind;
    this.samples = [];      // trend: numbers, rate: booleans
    this.count = 0;         // counter
    this.value = 0;         // gauge
  }

  add(v) {
    if (this.kind === 'trend') {
      this.samples.push(v);
    } else if (this.kind === 'rate') {
      this.samples.push(v ? 1 : 0);
    } else if (this.kind === 'counter') {
      this.count += v;
    } else if (this.kind === 'gauge') {
      this.value = v;
    }
  }

  stats() {
    if (this.kind === 'trend') {
      if (!this.samples.length) {
        return { count: 0, min: 0, max: 0, avg: 0, med: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
      }
      const sorted = this.samples.slice().sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      return {
        count: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sum / sorted.length,
        med: percentile(sorted, 50),
        p50: percentile(sorted, 50),
        p90: percentile(sorted, 90),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      };
    }
    if (this.kind === 'rate') {
      const total = this.samples.length;
      const truthy = this.samples.reduce((a, b) => a + b, 0);
      return {
        count: total,
        rate: total ? truthy / total : 0,
        passes: truthy,
        fails: total - truthy,
      };
    }
    if (this.kind === 'counter') {
      return { count: this.count, value: this.count };
    }
    if (this.kind === 'gauge') {
      return { value: this.value };
    }
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════
// THRESHOLD PARSER + EVALUATOR — k6-compatible subset
// ═══════════════════════════════════════════════════════════════════════

/**
 * parseThreshold('p(95)<500') → { aggregate:'p95', op:'<', target:500 }
 *
 * Supported aggregates:
 *   p(N)    → pN (any integer 0..100)
 *   avg     → arithmetic mean
 *   min     → minimum
 *   max     → maximum
 *   med     → median (alias p50)
 *   rate    → rate for boolean metrics
 *   count   → count for counters / total samples for trends
 *   value   → raw scalar for gauges / counters
 *
 * Supported operators: <, >, <=, >=, ==, !=
 */
function parseThreshold(expr) {
  const s = String(expr).trim();
  // operator must be matched longest-first so '<=' doesn't parse as '<'
  const ops = ['<=', '>=', '==', '!=', '<', '>'];
  let op = null, opIdx = -1;
  for (const candidate of ops) {
    const i = s.indexOf(candidate);
    if (i >= 0 && (opIdx === -1 || i < opIdx)) {
      op = candidate;
      opIdx = i;
    }
  }
  if (!op) {
    throw new Error(`bad threshold: no operator in "${expr}"`);
  }
  const left = s.slice(0, opIdx).trim();
  const right = s.slice(opIdx + op.length).trim();
  const target = Number(right);
  if (Number.isNaN(target)) {
    throw new Error(`bad threshold: rhs not numeric in "${expr}"`);
  }

  let aggregate;
  const pMatch = left.match(/^p\(\s*(\d+(?:\.\d+)?)\s*\)$/i);
  if (pMatch) {
    aggregate = `p${Number(pMatch[1])}`;
  } else if (['avg', 'min', 'max', 'med', 'rate', 'count', 'value'].includes(left)) {
    aggregate = left;
  } else {
    throw new Error(`bad threshold: unknown aggregate "${left}" in "${expr}"`);
  }
  return { aggregate, op, target, raw: s };
}

/**
 * evalThreshold(metric, thresholdExpr) → { ok, actual, target, op, aggregate, raw }
 */
function evalThreshold(metric, thresholdExpr) {
  const parsed = parseThreshold(thresholdExpr);
  const stats = metric.stats();
  let actual;
  if (parsed.aggregate.startsWith('p')) {
    const pNum = Number(parsed.aggregate.slice(1));
    // compute on-the-fly if not pre-computed (e.g., p42)
    if (stats[parsed.aggregate] != null) {
      actual = stats[parsed.aggregate];
    } else if (metric.kind === 'trend') {
      const sorted = metric.samples.slice().sort((a, b) => a - b);
      actual = percentile(sorted, pNum);
    } else {
      actual = 0;
    }
  } else {
    actual = stats[parsed.aggregate];
    if (actual == null) actual = 0;
  }

  let ok;
  switch (parsed.op) {
    case '<':  ok = actual <  parsed.target; break;
    case '>':  ok = actual >  parsed.target; break;
    case '<=': ok = actual <= parsed.target; break;
    case '>=': ok = actual >= parsed.target; break;
    case '==': ok = actual === parsed.target; break;
    case '!=': ok = actual !== parsed.target; break;
    default: ok = false;
  }
  return {
    ok, actual, target: parsed.target,
    op: parsed.op, aggregate: parsed.aggregate,
    raw: parsed.raw,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// LOADTESTER — the main class
// ═══════════════════════════════════════════════════════════════════════

class LoadTester extends EventEmitter {
  /**
   * new LoadTester({ baseUrl, defaultHeaders, runner })
   *
   *   baseUrl         string — prefix for scenario URLs
   *   defaultHeaders  object — merged into every request
   *   runner          'workers' | 'coroutines' (default 'coroutines')
   */
  constructor(opts = {}) {
    super();
    this.baseUrl = opts.baseUrl || 'http://localhost:3100';
    this.defaultHeaders = opts.defaultHeaders || {};
    this.runner = opts.runner || 'coroutines';
    this.scenarios = [];
    this.metrics = {};
    this.lastReport = null;
    this.vusTimeline = [];  // [{ t_ms, vus }] — sampled during run
    this.startedAt = null;
    this.endedAt = null;
    this.thresholdsUsed = null;
    this.thresholdResults = null;
    this._resetMetrics();
  }

  _resetMetrics() {
    this.metrics = {
      http_reqs:           new Metric('http_reqs', 'counter'),
      http_req_duration:   new Metric('http_req_duration', 'trend'),
      http_req_waiting:    new Metric('http_req_waiting', 'trend'),
      http_req_connecting: new Metric('http_req_connecting', 'trend'),
      http_req_receiving:  new Metric('http_req_receiving', 'trend'),
      http_req_sending:    new Metric('http_req_sending', 'trend'),
      http_req_failed:     new Metric('http_req_failed', 'rate'),
      data_sent:           new Metric('data_sent', 'counter'),
      data_received:       new Metric('data_received', 'counter'),
      vus:                 new Metric('vus', 'gauge'),
      vus_max:             new Metric('vus_max', 'gauge'),
      iterations:          new Metric('iterations', 'counter'),
    };
    this.vusTimeline = [];
  }

  /**
   * addScenario({ name, url, method, headers, body, weight })
   *
   * Registers a scenario. Weights are relative — a scenario with weight 3
   * runs 3× as often as weight 1 during the loop.
   */
  addScenario(scenario) {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error('addScenario: missing scenario object');
    }
    if (!scenario.name) throw new Error('addScenario: scenario.name is required');
    if (!scenario.url)  throw new Error('addScenario: scenario.url is required');
    const s = {
      name:    scenario.name,
      url:     scenario.url,
      method:  (scenario.method || 'GET').toUpperCase(),
      headers: scenario.headers || {},
      body:    scenario.body == null ? null : scenario.body,
      weight:  Number.isFinite(scenario.weight) ? scenario.weight : 1,
      timeout: scenario.timeout || 30000,
      expect:  scenario.expect || null,
    };
    this.scenarios.push(s);
    return this;
  }

  _pickScenario() {
    const idx = weightedPick(this.scenarios);
    return idx >= 0 ? this.scenarios[idx] : null;
  }

  async _fireOne(scenario) {
    const merged = Object.assign({}, this.defaultHeaders, scenario.headers);
    const result = await httpRequest(this.baseUrl, {
      method:  scenario.method,
      url:     scenario.url,
      headers: merged,
      body:    scenario.body,
      timeout: scenario.timeout,
      expect:  scenario.expect,
    });

    this.metrics.http_reqs.add(1);
    this.metrics.http_req_duration.add(result.duration);
    this.metrics.http_req_waiting.add(result.waiting);
    this.metrics.http_req_connecting.add(result.connecting);
    this.metrics.http_req_receiving.add(result.receiving);
    this.metrics.http_req_sending.add(result.sending);
    this.metrics.http_req_failed.add(!result.ok);
    this.metrics.data_sent.add(result.bytesSent);
    this.metrics.data_received.add(result.bytesReceived);

    this.emit('request', { scenario: scenario.name, result });
    return result;
  }

  /**
   * run({ vus, duration, rampUp, rampDown, thresholds, runner })
   *
   * Runs a classic 3-phase test: rampUp → steady → rampDown.
   *
   *   vus           target virtual users (peak)
   *   duration      total wallclock in ms (rampUp + steady + rampDown)
   *   rampUp        ms to climb from 0 → vus  (default 0)
   *   rampDown      ms to climb from vus → 0  (default 0)
   *   thresholds    { metric_name: 'p(95)<500' | [...exprs] }
   *   runner        override instance runner for this call
   *
   * Returns the same report object as `getReport()`.
   */
  async run(opts = {}) {
    const vus = Math.max(1, opts.vus || 1);
    const duration = Math.max(1, opts.duration || 10000);
    const rampUp = Math.max(0, opts.rampUp || 0);
    const rampDown = Math.max(0, opts.rampDown || 0);
    const thresholds = opts.thresholds || {};
    const runner = opts.runner || this.runner;

    if (rampUp + rampDown > duration) {
      throw new Error('run: rampUp + rampDown must not exceed duration');
    }

    // Translate run() into the equivalent stages[] and delegate.
    const stages = [];
    if (rampUp > 0)   stages.push({ duration: rampUp,                   target: vus });
    const steady = duration - rampUp - rampDown;
    if (steady > 0)   stages.push({ duration: steady,                   target: vus });
    if (rampDown > 0) stages.push({ duration: rampDown,                 target: 0   });
    if (!stages.length) stages.push({ duration, target: vus });

    return this._runStages(stages, thresholds, runner);
  }

  /**
   * runStages(stages) — multi-stage test (ramp-up, hold, spike, ramp-down).
   *
   * stages: [{ duration, target }, ...]
   *   - target is the VU level to reach by the end of this stage
   *   - duration is ms of the stage
   *   - first stage ramps from 0 to its target
   *   - each subsequent stage ramps from prev.target to this.target
   *
   *   e.g.:
   *     [
   *       { duration: 10000, target: 20 },   // 0 → 20 VUs in 10s
   *       { duration: 30000, target: 20 },   // hold 20 VUs for 30s
   *       { duration:  5000, target: 50 },   // spike to 50 VUs in 5s
   *       { duration: 10000, target:  0 },   // drain to 0 in 10s
   *     ]
   */
  async runStages(stages, opts = {}) {
    return this._runStages(stages, opts.thresholds || {}, opts.runner || this.runner);
  }

  async _runStages(stages, thresholds, runner) {
    if (!Array.isArray(stages) || !stages.length) {
      throw new Error('runStages: at least one stage is required');
    }
    if (!this.scenarios.length) {
      throw new Error('runStages: no scenarios registered — call addScenario() first');
    }

    this._resetMetrics();
    this.thresholdsUsed = thresholds;
    this.thresholdResults = null;
    this.startedAt = new Date();
    const t0 = performance.now();

    // We implement both 'coroutines' and 'workers' as a set of "slots".
    // Each slot is a virtual user. We keep `activeSlots` count matching the
    // current desired VU level (interpolated over the stage).
    // Slots started above current level are quiesced.
    const MAX_SLOTS = Math.max(1, ...stages.map(s => s.target || 0));
    const slots = [];   // { id, running, loopPromise, stopRequested }

    // A running slot repeatedly picks a scenario and fires it until told to stop.
    const startSlot = (id) => {
      const slot = { id, running: true, stopRequested: false, loopPromise: null };
      slots[id] = slot;
      slot.loopPromise = (async () => {
        while (!slot.stopRequested) {
          const scenario = this._pickScenario();
          if (!scenario) break;
          try {
            await this._fireOne(scenario);
          } catch (_e) {
            // swallow — stats collector is the source of truth
          }
          this.metrics.iterations.add(1);
          // give the event loop a chance to breathe & register stops
          await new Promise(r => setImmediate(r));
        }
        slot.running = false;
      })();
      return slot;
    };

    const stopSlot = (id) => {
      const slot = slots[id];
      if (slot && !slot.stopRequested) {
        slot.stopRequested = true;
      }
    };

    // worker_threads runner path.
    // We create one worker per VU. Each worker receives a batch of commands
    // (`fire`) via parentPort and posts back the result record. The main
    // thread drives the stages. If worker_threads isn't available or errors,
    // we fall back to coroutines automatically.
    let workerList = null;
    let workerIdx = 0;
    if (runner === 'workers') {
      try {
        workerList = this._initWorkers(MAX_SLOTS);
      } catch (_e) {
        // fall back silently — warn via event
        this.emit('warn', { msg: 'workers unavailable; falling back to coroutines', err: _e.message });
        workerList = null;
      }
    }

    let currentActive = 0;
    let maxActive = 0;

    // Stage loop — compute target VUs via linear interpolation, adjust slot count.
    const SAMPLE_MS = 100; // timeline sample rate
    const stageStartVus = []; // vus at the start of each stage
    {
      let prev = 0;
      for (const s of stages) {
        stageStartVus.push(prev);
        prev = s.target;
      }
    }

    let stageOffset = 0;
    for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
      const stage = stages[stageIdx];
      const stageT0 = performance.now();
      const stageDuration = stage.duration;
      const fromVus = stageStartVus[stageIdx];
      const toVus = stage.target;

      while (true) {
        const now = performance.now();
        const localElapsed = now - stageT0;
        if (localElapsed >= stageDuration) break;
        const frac = localElapsed / stageDuration;
        const targetVus = Math.round(fromVus + (toVus - fromVus) * frac);

        // scale up
        while (currentActive < targetVus && currentActive < MAX_SLOTS) {
          if (workerList) {
            this._markWorkerActive(workerList, currentActive);
          } else {
            startSlot(currentActive);
          }
          currentActive++;
          if (currentActive > maxActive) maxActive = currentActive;
        }
        // scale down
        while (currentActive > targetVus) {
          currentActive--;
          if (workerList) {
            this._markWorkerIdle(workerList, currentActive);
          } else {
            stopSlot(currentActive);
          }
        }

        this.metrics.vus.add(currentActive);
        if (currentActive > (this.metrics.vus_max.value || 0)) {
          this.metrics.vus_max.add(currentActive);
        }
        this.vusTimeline.push({ t_ms: now - t0, vus: currentActive });

        await sleep(SAMPLE_MS);
      }

      stageOffset += stageDuration;
    }

    // End of stages — stop everything.
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]) slots[i].stopRequested = true;
    }
    if (workerList) {
      for (let i = 0; i < workerList.length; i++) this._markWorkerIdle(workerList, i);
    }
    // Wait for slot loops to drain.
    await Promise.all(slots.filter(Boolean).map(s => s.loopPromise));
    // Shutdown workers cleanly.
    if (workerList) await this._shutdownWorkers(workerList);

    this.endedAt = new Date();
    this.metrics.vus.add(0);
    this.vusTimeline.push({ t_ms: performance.now() - t0, vus: 0 });

    const report = this.getReport();
    this.thresholdResults = this.checkThresholds(thresholds);
    report.thresholds = this.thresholdResults;
    report.passed = Object.values(this.thresholdResults).every(arr =>
      arr.every(r => r.ok)
    );
    this.lastReport = report;
    this.emit('end', report);
    return report;
  }

  // ── worker_threads helpers ───────────────────────────────────────────
  //
  // We pre-spin MAX_SLOTS workers. Each worker has its own event loop that
  // fires requests until told to stop. We mark slots "active" by sending them
  // a 'run' message with the baseUrl + scenarios list; "idle" by sending
  // 'pause'. Results come back via 'result' messages which we fold into
  // the metrics.

  _initWorkers(n) {
    const { Worker } = _loadWorkerThreads();
    const workers = [];
    const workerSource = this._workerSource();
    for (let i = 0; i < n; i++) {
      const w = new Worker(workerSource, { eval: true });
      w.on('message', (msg) => {
        if (msg && msg.type === 'result') {
          const r = msg.result;
          this.metrics.http_reqs.add(1);
          this.metrics.http_req_duration.add(r.duration);
          this.metrics.http_req_waiting.add(r.waiting);
          this.metrics.http_req_connecting.add(r.connecting);
          this.metrics.http_req_receiving.add(r.receiving);
          this.metrics.http_req_sending.add(r.sending);
          this.metrics.http_req_failed.add(!r.ok);
          this.metrics.data_sent.add(r.bytesSent);
          this.metrics.data_received.add(r.bytesReceived);
          this.metrics.iterations.add(1);
          this.emit('request', { scenario: msg.scenarioName, result: r });
        }
      });
      w.on('error', (err) => { this.emit('warn', { msg: 'worker error', err: err.message }); });
      workers.push({ worker: w, active: false });
    }
    return workers;
  }

  _markWorkerActive(workers, idx) {
    const slot = workers[idx];
    if (!slot || slot.active) return;
    slot.active = true;
    slot.worker.postMessage({
      type: 'run',
      baseUrl: this.baseUrl,
      scenarios: this.scenarios,
    });
  }

  _markWorkerIdle(workers, idx) {
    const slot = workers[idx];
    if (!slot || !slot.active) return;
    slot.active = false;
    slot.worker.postMessage({ type: 'pause' });
  }

  async _shutdownWorkers(workers) {
    await Promise.all(workers.map(slot => new Promise(resolve => {
      slot.worker.postMessage({ type: 'shutdown' });
      const t = setTimeout(() => { slot.worker.terminate(); resolve(); }, 500);
      slot.worker.once('exit', () => { clearTimeout(t); resolve(); });
    })));
  }

  // The worker source is stringified here so we stay zero-file and zero-dep.
  // It reimplements a narrow version of `httpRequest` to avoid the serialization
  // cost of shipping the full library across thread boundaries.
  _workerSource() {
    return `
      const { parentPort } = require('worker_threads');
      const http = require('http');
      const https = require('https');
      const { URL } = require('url');
      const { performance } = require('perf_hooks');

      let running = false;
      let baseUrl = '';
      let scenarios = [];

      function weightedPick(list) {
        let total = 0;
        for (const s of list) total += Math.max(0, s.weight || 1);
        let r = Math.random() * total;
        for (let i = 0; i < list.length; i++) {
          r -= Math.max(0, list[i].weight || 1);
          if (r <= 0) return i;
        }
        return list.length - 1;
      }

      function doRequest(scenario) {
        return new Promise(resolve => {
          let urlObj;
          try { urlObj = new URL(scenario.url, baseUrl); }
          catch (e) {
            return resolve({ ok: false, status: 0, duration: 0, waiting:0, connecting:0, sending:0, receiving:0, bytesSent:0, bytesReceived:0, error: 'bad-url' });
          }
          const isHttps = urlObj.protocol === 'https:';
          const lib = isHttps ? https : http;
          const headers = Object.assign({ 'Accept':'application/json','User-Agent':'onyx-load-harness/1.0(worker)' }, scenario.headers || {});
          let bodyBuf = null;
          if (scenario.body != null) {
            bodyBuf = Buffer.from(typeof scenario.body === 'string' ? scenario.body : JSON.stringify(scenario.body), 'utf8');
            if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = String(bodyBuf.length);
          }
          const tStart = performance.now();
          let tSocket=0,tConnect=0,tSent=0,tFirst=0,tEnd=0,bytesRx=0;
          const req = lib.request({
            protocol: urlObj.protocol, hostname: urlObj.hostname,
            port: urlObj.port || (isHttps?443:80),
            path: urlObj.pathname + urlObj.search,
            method: scenario.method || 'GET', headers,
          }, (res) => {
            res.on('data', c => { if(!tFirst) tFirst = performance.now(); bytesRx += c.length; });
            res.on('end', () => {
              tEnd = performance.now();
              if (!tFirst) tFirst = tEnd;
              const code = res.statusCode;
              const ok = scenario.expect ? scenario.expect.includes(code) : (code >=200 && code <400);
              resolve({ ok, status: code, duration: tEnd-tStart,
                connecting: Math.max(0,tConnect-tSocket),
                sending: Math.max(0,tSent-tConnect),
                waiting: Math.max(0,tFirst-tSent),
                receiving: Math.max(0,tEnd-tFirst),
                bytesSent: bodyBuf ? bodyBuf.length : 0,
                bytesReceived: bytesRx,
                error: ok ? null : 'http-'+code });
            });
          });
          req.on('socket', sock => {
            tSocket = performance.now();
            if (sock.connecting) sock.once('connect', () => { tConnect = performance.now(); });
            else tConnect = tSocket;
          });
          req.setTimeout(scenario.timeout || 30000, () => {
            req.destroy();
            resolve({ ok:false, status:0, duration: performance.now()-tStart,
              connecting:0, sending:0, waiting:0, receiving:0,
              bytesSent: bodyBuf?bodyBuf.length:0, bytesReceived: bytesRx, error:'timeout' });
          });
          req.on('error', err => {
            resolve({ ok:false, status:0, duration: performance.now()-tStart,
              connecting:0, sending:0, waiting:0, receiving:0,
              bytesSent: bodyBuf?bodyBuf.length:0, bytesReceived: bytesRx, error:'req-error:'+err.message });
          });
          if (bodyBuf) req.write(bodyBuf);
          tSent = performance.now();
          req.end();
        });
      }

      async function loop() {
        while (running) {
          const idx = weightedPick(scenarios);
          if (idx < 0) break;
          const scenario = scenarios[idx];
          const result = await doRequest(scenario);
          parentPort.postMessage({ type:'result', scenarioName: scenario.name, result });
          await new Promise(r => setImmediate(r));
        }
      }

      parentPort.on('message', (msg) => {
        if (msg.type === 'run') {
          baseUrl = msg.baseUrl;
          scenarios = msg.scenarios;
          if (!running) { running = true; loop(); }
        } else if (msg.type === 'pause') {
          running = false;
        } else if (msg.type === 'shutdown') {
          running = false;
          setImmediate(() => process.exit(0));
        }
      });
    `;
  }

  /**
   * getReport() — compute and return the full result bundle. Safe to call any
   * time; gives the current state even mid-run.
   */
  getReport() {
    const m = this.metrics;
    const dur = m.http_req_duration.stats();
    const wait = m.http_req_waiting.stats();
    const conn = m.http_req_connecting.stats();
    const recv = m.http_req_receiving.stats();
    const send = m.http_req_sending.stats();
    const failed = m.http_req_failed.stats();
    const wallSeconds = this.startedAt && this.endedAt
      ? Math.max(0.001, (this.endedAt - this.startedAt) / 1000)
      : 0;

    return {
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      endedAt:   this.endedAt   ? this.endedAt.toISOString()   : null,
      durationSec: wallSeconds,
      baseUrl: this.baseUrl,
      scenarios: this.scenarios.map(s => ({
        name: s.name, url: s.url, method: s.method, weight: s.weight,
      })),
      metrics: {
        http_reqs:           m.http_reqs.stats(),
        http_req_duration:   dur,
        http_req_waiting:    wait,
        http_req_connecting: conn,
        http_req_receiving:  recv,
        http_req_sending:    send,
        http_req_failed:     failed,
        data_sent:           m.data_sent.stats(),
        data_received:       m.data_received.stats(),
        vus:                 m.vus.stats(),
        vus_max:             m.vus_max.stats(),
        iterations:          m.iterations.stats(),
      },
      throughput: wallSeconds > 0
        ? m.http_reqs.count / wallSeconds
        : 0,
      errorRate: failed.rate != null ? failed.rate : 0,
      vusTimeline: this.vusTimeline.slice(),
      thresholds: this.thresholdResults || null,
    };
  }

  /**
   * checkThresholds(thresholds) — evaluate threshold expressions against the
   * current metric state. Returns:
   *   { metric_name: [{ ok, actual, target, op, aggregate, raw }, ...] }
   *
   * thresholds may be:
   *   { http_req_duration: 'p(95)<500' }           // single expr
   *   { http_req_duration: ['p(95)<500','p(99)<1000'] }  // array of exprs
   */
  checkThresholds(thresholds) {
    const out = {};
    for (const [metricName, exprs] of Object.entries(thresholds || {})) {
      const list = Array.isArray(exprs) ? exprs : [exprs];
      const metric = this.metrics[metricName];
      if (!metric) {
        out[metricName] = list.map(expr => ({
          ok: false, actual: null, target: null, op: null,
          aggregate: null, raw: String(expr), error: 'unknown-metric',
        }));
        continue;
      }
      out[metricName] = list.map(expr => {
        try {
          return evalThreshold(metric, expr);
        } catch (e) {
          return { ok: false, error: e.message, raw: String(expr) };
        }
      });
    }
    return out;
  }

  // ── exporters ────────────────────────────────────────────────────────

  /**
   * exportJSON(filepath) — write full report as JSON. Creates parent dirs.
   */
  exportJSON(filepath) {
    const report = this.lastReport || this.getReport();
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
    return filepath;
  }

  /**
   * exportJUnit(filepath) — write JUnit XML report where each threshold is a
   * <testcase> under a <testsuite name="LoadHarness">. Failed thresholds have
   * a <failure> child with the actual vs target breakdown.
   */
  exportJUnit(filepath) {
    const report = this.lastReport || this.getReport();
    const ts = report.thresholds || {};
    const cases = [];
    let failures = 0;
    let total = 0;

    for (const [metricName, results] of Object.entries(ts)) {
      for (const r of results) {
        total++;
        const name = `${metricName} ${r.raw}`;
        const time = (report.durationSec || 0).toFixed(3);
        if (r.ok) {
          cases.push(`    <testcase classname="load" name="${escapeXml(name)}" time="${time}"/>`);
        } else {
          failures++;
          const detail = r.error
            ? `error: ${escapeXml(r.error)}`
            : `actual=${r.actual} ${r.op} target=${r.target}  → FAIL`;
          cases.push(
            `    <testcase classname="load" name="${escapeXml(name)}" time="${time}">` +
            `\n      <failure type="threshold" message="${escapeXml(detail)}"/>` +
            `\n    </testcase>`
          );
        }
      }
    }
    // If no thresholds, still emit a single passing case so CI shows green.
    if (!total) {
      total = 1;
      cases.push(`    <testcase classname="load" name="run completed — no thresholds" time="${(report.durationSec || 0).toFixed(3)}"/>`);
    }

    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="OnyxLoadHarness" tests="${total}" failures="${failures}">
  <testsuite name="LoadTester" tests="${total}" failures="${failures}" time="${(report.durationSec || 0).toFixed(3)}" timestamp="${report.startedAt || ''}">
${cases.join('\n')}
  </testsuite>
</testsuites>
`;
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, xml, 'utf8');
    return filepath;
  }

  /**
   * exportHTML(filepath) — self-contained HTML report with embedded SVG charts.
   * Zero external assets; safe to open from disk or email.
   */
  exportHTML(filepath) {
    const report = this.lastReport || this.getReport();
    const html = renderHTMLReport(report);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, html, 'utf8');
    return filepath;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HTML REPORT RENDERER — bilingual, inline SVG charts
// ═══════════════════════════════════════════════════════════════════════

/**
 * niceTicks(min, max, count) — compute "nice" round-number axis ticks.
 * Reused from BIDashboard pattern (equivalent algorithm, kept independent
 * to avoid a cross-package require).
 */
function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  const rough = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if      (norm < 1.5) step = 1 * mag;
  else if (norm < 3)   step = 2 * mag;
  else if (norm < 7)   step = 5 * mag;
  else                 step = 10 * mag;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return { ticks, niceMin, niceMax, step };
}

function renderVusChart(timeline) {
  const W = 860, H = 220, M = { top: 20, right: 30, bottom: 30, left: 50 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  if (!timeline.length) {
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="VU timeline — no data">
      <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="${BI_THEME.textDim}">אין נתונים · No data</text>
    </svg>`;
  }

  const tMin = 0;
  const tMax = Math.max(1, ...timeline.map(p => p.t_ms));
  const vMin = 0;
  const vMax = Math.max(1, ...timeline.map(p => p.vus));
  const { ticks: yTicks, niceMax: yMax } = niceTicks(vMin, vMax, 5);

  const sx = (t) => M.left + ((t - tMin) / (tMax - tMin)) * innerW;
  const sy = (v) => M.top + innerH - ((v - vMin) / (yMax - vMin)) * innerH;

  let pathD = '';
  for (let i = 0; i < timeline.length; i++) {
    const p = timeline[i];
    pathD += (i === 0 ? 'M' : ' L') + sx(p.t_ms).toFixed(2) + ',' + sy(p.vus).toFixed(2);
  }
  const areaD = pathD
    + ` L${sx(tMax).toFixed(2)},${sy(0).toFixed(2)}`
    + ` L${sx(tMin).toFixed(2)},${sy(0).toFixed(2)} Z`;

  const gridLines = yTicks.map(v => `
    <line x1="${M.left}" x2="${M.left + innerW}" y1="${sy(v).toFixed(2)}" y2="${sy(v).toFixed(2)}" class="grid-line"/>
    <text x="${M.left - 6}" y="${sy(v).toFixed(2) + 4}" text-anchor="end" fill="${BI_THEME.textDim}">${v}</text>
  `).join('');

  // time axis ticks: 5 evenly spaced
  const xTicks = [];
  for (let i = 0; i <= 4; i++) {
    const t = tMin + ((tMax - tMin) * i) / 4;
    xTicks.push(`<text x="${sx(t).toFixed(2)}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${BI_THEME.textDim}">${(t/1000).toFixed(0)}s</text>`);
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="VU timeline">
    <title>VUs over time · משתמשים וירטואליים לאורך זמן</title>
    <defs>
      <linearGradient id="vusGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${BI_THEME.accent}" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="${BI_THEME.accent}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#vusGrad)"/>
    <path d="${pathD}" fill="none" stroke="${BI_THEME.accent}" stroke-width="2"/>
    ${xTicks.join('')}
  </svg>`;
}

function renderLatencyBarChart(durationStats) {
  const W = 860, H = 220, M = { top: 20, right: 30, bottom: 40, left: 70 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const bars = [
    { label: 'min',  value: durationStats.min },
    { label: 'avg',  value: durationStats.avg },
    { label: 'p50',  value: durationStats.p50 },
    { label: 'p90',  value: durationStats.p90 },
    { label: 'p95',  value: durationStats.p95 },
    { label: 'p99',  value: durationStats.p99 },
    { label: 'max',  value: durationStats.max },
  ];
  const vMax = Math.max(1, ...bars.map(b => b.value));
  const { ticks: yTicks, niceMax: yNice } = niceTicks(0, vMax, 5);

  const barW = innerW / bars.length * 0.7;
  const step = innerW / bars.length;

  const sy = (v) => M.top + innerH - (v / yNice) * innerH;

  const rects = bars.map((b, i) => {
    const x = M.left + step * i + (step - barW) / 2;
    const y = sy(b.value);
    const h = M.top + innerH - y;
    const color = (b.label === 'p95' || b.label === 'p99')
      ? BI_THEME.warning : BI_THEME.accent;
    return `
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0,h).toFixed(2)}" fill="${color}" rx="2"/>
      <text x="${(x + barW/2).toFixed(2)}" y="${(y - 6).toFixed(2)}" text-anchor="middle" fill="${BI_THEME.text}" font-size="11">${formatMs(b.value)}</text>
      <text x="${(x + barW/2).toFixed(2)}" y="${(M.top + innerH + 18).toFixed(2)}" text-anchor="middle" fill="${BI_THEME.textDim}">${b.label}</text>
    `;
  }).join('');

  const grid = yTicks.map(v => `
    <line x1="${M.left}" x2="${M.left + innerW}" y1="${sy(v).toFixed(2)}" y2="${sy(v).toFixed(2)}" class="grid-line"/>
    <text x="${M.left - 6}" y="${(sy(v) + 4).toFixed(2)}" text-anchor="end" fill="${BI_THEME.textDim}">${formatMs(v)}</text>
  `).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Latency distribution">
    <title>Latency distribution · התפלגות השהיה</title>
    ${grid}
    ${rects}
  </svg>`;
}

function renderHTMLReport(report) {
  const m = report.metrics;
  const thresholdRows = [];
  if (report.thresholds) {
    for (const [metricName, results] of Object.entries(report.thresholds)) {
      for (const r of results) {
        thresholdRows.push({
          metric: metricName,
          expr: r.raw,
          actual: r.actual,
          ok: r.ok,
          error: r.error,
        });
      }
    }
  }
  const tRowsHTML = thresholdRows.length
    ? thresholdRows.map(r => `
        <tr class="${r.ok ? 'ok' : 'fail'}">
          <td>${escapeHtml(r.metric)}</td>
          <td><code>${escapeHtml(r.expr)}</code></td>
          <td>${r.actual != null ? escapeHtml(typeof r.actual === 'number' ? (r.actual > 10 ? r.actual.toFixed(1) : r.actual.toFixed(3)) : r.actual) : '—'}</td>
          <td class="verdict">${r.ok ? 'PASS ✓' : 'FAIL ✗'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">אין ספי בדיקה · No thresholds defined</td></tr>`;

  const scenarioRows = report.scenarios.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td><code>${escapeHtml(s.method)} ${escapeHtml(s.url)}</code></td>
      <td>${s.weight}</td>
    </tr>
  `).join('');

  const vusChart = renderVusChart(report.vusTimeline || []);
  const latChart = renderLatencyBarChart(m.http_req_duration);

  const overallPass = report.passed !== false && (!thresholdRows.length || thresholdRows.every(r => r.ok));

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Onyx Load Harness · דו"ח עומס</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${BI_THEME.bg};
      color: ${BI_THEME.text};
      font-family: -apple-system, 'Segoe UI', Heebo, Arial, sans-serif;
      direction: rtl;
      padding: 20px;
    }
    h1, h2, h3 { margin: 0 0 6px; color: ${BI_THEME.text}; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 22px; }
    .subtitle { color: ${BI_THEME.textDim}; font-size: 12px; direction: ltr; text-align: right; margin-bottom: 16px; }
    .card {
      background: ${BI_THEME.panel};
      border: 1px solid ${BI_THEME.border};
      border-radius: 8px;
      padding: 16px 18px;
      margin-bottom: 16px;
    }
    .card .card-sub {
      color: ${BI_THEME.textDim};
      font-size: 11px;
      direction: ltr;
      text-align: right;
      letter-spacing: 0.04em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi {
      background: ${BI_THEME.panel};
      border: 1px solid ${BI_THEME.border};
      border-radius: 8px;
      padding: 14px 16px;
    }
    .kpi .k-label { color: ${BI_THEME.textDim}; font-size: 11px; direction: ltr; text-align: right; }
    .kpi .k-value { color: ${BI_THEME.text}; font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      direction: ltr;
      text-align: left;
    }
    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid ${BI_THEME.border};
    }
    th {
      color: ${BI_THEME.textDim};
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    td code {
      background: ${BI_THEME.panel2};
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      color: ${BI_THEME.accent};
    }
    tr.ok .verdict { color: ${BI_THEME.success}; font-weight: 700; }
    tr.fail .verdict { color: ${BI_THEME.danger}; font-weight: 700; }
    tr.fail td { background: rgba(248,81,73,0.05); }
    .empty { text-align: center; color: ${BI_THEME.textDim}; padding: 20px; }
    .chart { width: 100%; height: auto; display: block; }
    .chart .grid-line { stroke: ${BI_THEME.grid}; stroke-width: 1; stroke-dasharray: 2 3; }
    .chart text { font-family: inherit; font-size: 11px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      direction: ltr;
    }
    .badge.pass { background: rgba(63,185,80,0.15); color: ${BI_THEME.success}; }
    .badge.fail { background: rgba(248,81,73,0.15); color: ${BI_THEME.danger}; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 960px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
      .two-col { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>דו"ח עומס · Load Test Report</h1>
    <div class="subtitle">Techno-Kol Uzi Mega-ERP · Load Harness Agent X87 · ${escapeHtml(report.startedAt || '')}</div>
    <span class="badge ${overallPass ? 'pass' : 'fail'}">${overallPass ? 'PASS · עבר' : 'FAIL · נכשל'}</span>
  </header>

  <section class="grid" aria-label="KPIs">
    <div class="kpi"><div class="k-label">Total requests · סה"כ בקשות</div><div class="k-value">${m.http_reqs.count.toLocaleString('en-US')}</div></div>
    <div class="kpi"><div class="k-label">Throughput · תפוקה</div><div class="k-value">${report.throughput.toFixed(1)} rps</div></div>
    <div class="kpi"><div class="k-label">Error rate · שיעור שגיאות</div><div class="k-value">${(report.errorRate * 100).toFixed(2)}%</div></div>
    <div class="kpi"><div class="k-label">P95 latency · השהיה P95</div><div class="k-value">${formatMs(m.http_req_duration.p95)}</div></div>
    <div class="kpi"><div class="k-label">P99 latency · השהיה P99</div><div class="k-value">${formatMs(m.http_req_duration.p99)}</div></div>
    <div class="kpi"><div class="k-label">Data sent · נתונים נשלחו</div><div class="k-value">${formatBytes(m.data_sent.count)}</div></div>
    <div class="kpi"><div class="k-label">Data received · נתונים התקבלו</div><div class="k-value">${formatBytes(m.data_received.count)}</div></div>
    <div class="kpi"><div class="k-label">VUs peak · שיא משתמשים</div><div class="k-value">${m.vus_max.value || 0}</div></div>
  </section>

  <section class="two-col">
    <div class="card">
      <h2>משתמשים וירטואליים לאורך זמן</h2>
      <div class="card-sub">Virtual Users Timeline</div>
      ${vusChart}
    </div>
    <div class="card">
      <h2>התפלגות השהיה</h2>
      <div class="card-sub">Latency distribution (http_req_duration)</div>
      ${latChart}
    </div>
  </section>

  <section class="card">
    <h2>ספי קבלה · Thresholds</h2>
    <div class="card-sub">PASS/FAIL per k6-style threshold expression</div>
    <table>
      <thead>
        <tr><th>Metric</th><th>Expression</th><th>Actual</th><th>Verdict</th></tr>
      </thead>
      <tbody>${tRowsHTML}</tbody>
    </table>
  </section>

  <section class="card">
    <h2>תרחישים · Scenarios</h2>
    <div class="card-sub">Scenario registry (name / method+URL / weight)</div>
    <table>
      <thead><tr><th>Name</th><th>Request</th><th>Weight</th></tr></thead>
      <tbody>${scenarioRows || '<tr><td colspan="3" class="empty">No scenarios</td></tr>'}</tbody>
    </table>
  </section>

  <section class="card">
    <h2>מדדים מפורטים · Detailed metrics</h2>
    <div class="card-sub">All k6-compatible metrics captured during the run</div>
    <table>
      <thead><tr><th>Metric</th><th>Count</th><th>Avg</th><th>P50</th><th>P90</th><th>P95</th><th>P99</th><th>Min</th><th>Max</th></tr></thead>
      <tbody>
        ${renderMetricRow('http_req_duration', m.http_req_duration)}
        ${renderMetricRow('http_req_waiting',  m.http_req_waiting)}
        ${renderMetricRow('http_req_connecting', m.http_req_connecting)}
        ${renderMetricRow('http_req_sending',  m.http_req_sending)}
        ${renderMetricRow('http_req_receiving', m.http_req_receiving)}
      </tbody>
    </table>
    <table style="margin-top:12px">
      <thead><tr><th>Counter / Rate / Gauge</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td><code>http_reqs</code></td><td>${m.http_reqs.count}</td></tr>
        <tr><td><code>iterations</code></td><td>${m.iterations.count}</td></tr>
        <tr><td><code>data_sent</code></td><td>${formatBytes(m.data_sent.count)}</td></tr>
        <tr><td><code>data_received</code></td><td>${formatBytes(m.data_received.count)}</td></tr>
        <tr><td><code>http_req_failed (rate)</code></td><td>${(m.http_req_failed.rate * 100).toFixed(2)}%</td></tr>
        <tr><td><code>vus_max</code></td><td>${m.vus_max.value || 0}</td></tr>
      </tbody>
    </table>
  </section>

  <footer class="subtitle" style="margin-top:20px; text-align:center;">
    Generated by onyx-procurement/src/load/load-harness.js · לא מוחקים רק משדרגים ומגדלים
  </footer>
</body>
</html>`;
}

function renderMetricRow(name, s) {
  return `<tr>
    <td><code>${name}</code></td>
    <td>${s.count}</td>
    <td>${formatMs(s.avg)}</td>
    <td>${formatMs(s.p50)}</td>
    <td>${formatMs(s.p90)}</td>
    <td>${formatMs(s.p95)}</td>
    <td>${formatMs(s.p99)}</td>
    <td>${formatMs(s.min)}</td>
    <td>${formatMs(s.max)}</td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  LoadTester,
  Metric,
  parseThreshold,
  evalThreshold,
  percentile,
  weightedPick,
  httpRequest,
  formatMs,
  formatBytes,
  niceTicks,
  BI_THEME,
  // exposed for tests / introspection
  _internals: { renderHTMLReport, renderVusChart, renderLatencyBarChart },
};
