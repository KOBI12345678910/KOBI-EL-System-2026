/**
 * QA-15 — Load Agent — Shared Harness (pure Node http/https, zero deps)
 * =====================================================================
 *
 * Owner:        QA-15 (Load Agent)
 * Consumers:    qa-15-*.js scenarios + qa-15-runner.js
 * Depends on:   node:http, node:https, node:url, node:perf_hooks
 *
 * WHY THIS EXISTS
 * ---------------
 * Every scenario needs: an http client, a latency recorder, a worker pool,
 * a rate limiter, and a report formatter. Re-implementing those seven times
 * would be both ugly and bug-prone. This module gives scenarios four primitives:
 *
 *   1. request(baseUrl, apiKey, opts)          — timed HTTP call → { status, ms, bytes, error? }
 *   2. createStats()                           — rolling latency collector with p50/p95/p99/max
 *   3. runConcurrent({ concurrency, duration, task })
 *                                              — worker pool, tight loop until wallclock expires
 *   4. runRateLimited({ rps, duration, task }) — token-bucket pacing for spike/soak tests
 *
 * Plus helpers: sleep, rid, randomInt, buildReport, formatReport.
 *
 * HARD CONSTRAINTS (per QA-15 charter)
 * ------------------------------------
 * - ZERO external dependencies. Node core only.
 * - ZERO writes to disk. Reports are returned as objects; callers may stringify/save.
 * - ZERO server boot / process spawn. Scenarios point at an already-running baseUrl.
 * - ZERO destructive calls unless the caller explicitly opts in — this file has no
 *   DELETE helpers; scenarios decide what to do.
 * - SAFE BY DEFAULT: every request has a 30s abort timeout. No infinite hangs.
 *
 * ACCEPTANCE THRESHOLDS (defaults, overrideable per scenario)
 * -----------------------------------------------------------
 * - p95_ms   <= 1500
 * - p99_ms   <= 3000
 * - err_rate <= 0.01 (1%)
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { performance } = require('perf_hooks');

// ═══════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_THRESHOLDS = Object.freeze({
  p95_ms: 1500,
  p99_ms: 3000,
  err_rate: 0.01,
});

// ═══════════════════════════════════════════════════════════════════════
// SMALL UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let _ridCounter = 0;
function rid(prefix = 'qa15') {
  _ridCounter = (_ridCounter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${_ridCounter.toString(36)}`;
}

/**
 * percentile(sortedAsc, p) — classic nearest-rank percentile on a PRE-SORTED array.
 * Returns 0 on empty input. Expects caller to sort beforehand for O(1) reuse.
 */
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank))];
}

// ═══════════════════════════════════════════════════════════════════════
// HTTP CLIENT — timed, aborted-on-timeout, always resolves (never rejects)
// ═══════════════════════════════════════════════════════════════════════

/**
 * request(baseUrl, apiKey, opts)
 *
 * opts: {
 *   method:   'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'   (default 'GET')
 *   path:     '/api/...'                                    (required)
 *   body:     object | string | Buffer | null               (JSON-stringified if object)
 *   headers:  { [k]: string }                               (merged over defaults)
 *   timeout:  ms                                            (default 30000)
 *   expect:   number[]                                      (status codes counted as OK; default [200,201,204])
 * }
 *
 * Resolves to: {
 *   ok:      boolean,          // matched expect[]
 *   status:  number,           // 0 on transport error
 *   ms:      number,           // wallclock incl. connect + body
 *   bytes:   number,           // response body size
 *   error:   string | null,    // one-line diagnostic on failure
 * }
 *
 * CONTRACT: this function NEVER throws. Load runs must not be derailed by
 * transient errors — every call returns a record the stats collector can
 * consume. Transport failures get status=0 and a meaningful `error` string.
 */
function request(baseUrl, apiKey, opts) {
  const method = (opts.method || 'GET').toUpperCase();
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const expect = opts.expect || [200, 201, 204];

  let bodyBuf = null;
  const headers = Object.assign({
    'Accept': 'application/json',
    'User-Agent': 'qa-15-load-agent/1.0',
  }, opts.headers || {});
  if (apiKey) headers['X-API-Key'] = apiKey;

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
    urlObj = new URL(opts.path, baseUrl);
  } catch (e) {
    return Promise.resolve({
      ok: false, status: 0, ms: 0, bytes: 0,
      error: `bad-url: ${e.message}`,
    });
  }

  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise(resolve => {
    const start = performance.now();
    let finished = false;
    let bytes = 0;

    const req = lib.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
    }, (res) => {
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => {
        if (finished) return;
        finished = true;
        const ms = performance.now() - start;
        const ok = expect.includes(res.statusCode);
        resolve({
          ok,
          status: res.statusCode,
          ms,
          bytes,
          error: ok ? null : `http-${res.statusCode}`,
        });
      });
      res.on('error', (err) => {
        if (finished) return;
        finished = true;
        resolve({
          ok: false, status: res.statusCode || 0,
          ms: performance.now() - start, bytes,
          error: `res-error: ${err.message}`,
        });
      });
    });

    req.setTimeout(timeout, () => {
      if (finished) return;
      finished = true;
      req.destroy();
      resolve({
        ok: false, status: 0,
        ms: performance.now() - start, bytes,
        error: `timeout-${timeout}ms`,
      });
    });

    req.on('error', (err) => {
      if (finished) return;
      finished = true;
      resolve({
        ok: false, status: 0,
        ms: performance.now() - start, bytes,
        error: `req-error: ${err.message}`,
      });
    });

    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// STATS COLLECTOR — append-only, report on demand
// ═══════════════════════════════════════════════════════════════════════

/**
 * createStats(label)
 *
 * Returns an object with:
 *   .record(result, { tag? })        — append one HTTP outcome
 *   .report({ thresholds? })         — compute percentiles + error rate
 *   .totalCalls / .totalErrors       — raw counters (read-only access)
 *
 * Stats are LATE-COMPUTED: we store raw latencies and only sort/percentile
 * at report() time. This keeps the record-path hot loop allocation-free.
 */
function createStats(label) {
  const latencies = [];
  const byTag = Object.create(null);  // tag → { calls, errors, totalMs, bytes }
  const errorBuckets = Object.create(null); // errorCode → count
  let totalCalls = 0;
  let totalErrors = 0;
  let totalBytes = 0;
  let startMs = performance.now();
  let endMs = startMs;

  function record(result, meta = {}) {
    const tag = meta.tag || 'default';
    totalCalls++;
    latencies.push(result.ms);
    totalBytes += result.bytes || 0;
    endMs = performance.now();
    if (!result.ok) {
      totalErrors++;
      const bucket = result.error || `http-${result.status}`;
      errorBuckets[bucket] = (errorBuckets[bucket] || 0) + 1;
    }
    if (!byTag[tag]) byTag[tag] = { calls: 0, errors: 0, totalMs: 0, bytes: 0 };
    byTag[tag].calls++;
    byTag[tag].totalMs += result.ms;
    byTag[tag].bytes += result.bytes || 0;
    if (!result.ok) byTag[tag].errors++;
  }

  function reset() {
    latencies.length = 0;
    for (const k of Object.keys(byTag)) delete byTag[k];
    for (const k of Object.keys(errorBuckets)) delete errorBuckets[k];
    totalCalls = 0;
    totalErrors = 0;
    totalBytes = 0;
    startMs = performance.now();
    endMs = startMs;
  }

  function report({ thresholds = DEFAULT_THRESHOLDS } = {}) {
    const sorted = latencies.slice().sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const max = sorted.length ? sorted[sorted.length - 1] : 0;
    const min = sorted.length ? sorted[0] : 0;
    const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const elapsedS = Math.max(0.001, (endMs - startMs) / 1000);
    const rps = totalCalls / elapsedS;
    const errRate = totalCalls ? totalErrors / totalCalls : 0;

    const tagReport = {};
    for (const [tag, t] of Object.entries(byTag)) {
      tagReport[tag] = {
        calls: t.calls,
        errors: t.errors,
        err_rate: t.calls ? t.errors / t.calls : 0,
        mean_ms: t.calls ? t.totalMs / t.calls : 0,
        bytes: t.bytes,
      };
    }

    const pass =
      p95 <= thresholds.p95_ms &&
      p99 <= thresholds.p99_ms &&
      errRate <= thresholds.err_rate;

    return {
      label,
      totalCalls,
      totalErrors,
      errRate,
      rps,
      elapsedS,
      totalBytes,
      latency: { min, mean, p50, p95, p99, max },
      thresholds,
      pass,
      verdict: pass ? 'GO' : 'NO-GO',
      errorBuckets: Object.assign({}, errorBuckets),
      byTag: tagReport,
    };
  }

  return {
    record,
    reset,
    report,
    get totalCalls() { return totalCalls; },
    get totalErrors() { return totalErrors; },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// WORKER POOL — N concurrent tasks, wallclock-bounded
// ═══════════════════════════════════════════════════════════════════════

/**
 * runConcurrent({ concurrency, duration, task, onTick? })
 *
 * Spawns `concurrency` parallel workers. Each worker calls `task(ctx)` in
 * a loop until the wallclock duration expires. `ctx` is { workerId, iter }.
 * `task` should return a Promise that resolves (never rejects — wrap in
 * try/catch if you call anything that might throw).
 *
 * Why a simple worker pool and not p-limit?
 *   - zero deps
 *   - exact semantic we want: "keep the system saturated at N in-flight"
 *
 * Duration is in milliseconds. Returns total iterations completed.
 */
async function runConcurrent({ concurrency, duration, task, onTick }) {
  const deadline = performance.now() + duration;
  let iter = 0;
  let stopped = false;

  const worker = async (workerId) => {
    while (!stopped && performance.now() < deadline) {
      const currentIter = iter++;
      try {
        await task({ workerId, iter: currentIter });
      } catch (e) {
        // Scenarios must not let exceptions escape, but we are defensive.
        // Silent swallow — the stats collector is the source of truth.
        void e;
      }
      if (onTick) onTick({ workerId, iter: currentIter });
    }
  };

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker(i));
  await Promise.all(workers);
  stopped = true;
  return iter;
}

// ═══════════════════════════════════════════════════════════════════════
// RATE LIMITER — steady RPS for spike/soak tests (token bucket, 100ms ticks)
// ═══════════════════════════════════════════════════════════════════════

/**
 * runRateLimited({ rps, duration, task })
 *
 * Fires requests at the requested target RPS (not "up to" — aims AT).
 * We use 100ms ticks: every tick we dispatch `rps/10` tasks fire-and-forget.
 * Tasks are awaited in a joinPool we drain at the end — so if the server
 * slows down and backs up, the drain time is reported accurately.
 *
 * Why not a true closed-loop token bucket? For spike/soak we want open-loop
 * arrival rates — the classic load-test shape. A backed-up server should
 * show up as latency, not as reduced RPS on the client side.
 */
async function runRateLimited({ rps, duration, task }) {
  const tickMs = 100;
  const ticks = Math.ceil(duration / tickMs);
  const perTick = Math.max(1, Math.round(rps / (1000 / tickMs)));
  const inflight = new Set();
  let iter = 0;

  for (let t = 0; t < ticks; t++) {
    const tickStart = performance.now();
    for (let k = 0; k < perTick; k++) {
      const currentIter = iter++;
      const p = Promise.resolve()
        .then(() => task({ iter: currentIter }))
        .catch(() => {})
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
    const elapsed = performance.now() - tickStart;
    const wait = tickMs - elapsed;
    if (wait > 0) await sleep(wait);
  }

  // Drain remaining in-flight requests (do not abandon — that skews stats).
  await Promise.all([...inflight]);
  return iter;
}

// ═══════════════════════════════════════════════════════════════════════
// REPORT FORMATTING
// ═══════════════════════════════════════════════════════════════════════

/**
 * buildReport(scenarioName, stats, meta)
 *
 * Wraps a stats.report() with scenario metadata (name, started_at, config).
 * Returns a plain-object record suitable for JSON.stringify or pretty-print.
 */
function buildReport(scenarioName, statsReport, meta = {}) {
  return {
    scenario: scenarioName,
    agent: 'QA-15',
    started_at: meta.started_at || new Date().toISOString(),
    finished_at: new Date().toISOString(),
    config: meta.config || {},
    stats: statsReport,
  };
}

/**
 * formatReport(report) — human-readable one-screen summary for terminal output.
 */
function formatReport(report) {
  const s = report.stats;
  const lines = [];
  const bar = '═'.repeat(72);
  lines.push(bar);
  lines.push(`SCENARIO: ${report.scenario}  [${s.verdict}]`);
  lines.push(bar);
  lines.push(`Duration:    ${s.elapsedS.toFixed(1)}s`);
  lines.push(`Calls:       ${s.totalCalls}  (${s.rps.toFixed(1)} rps)`);
  lines.push(`Errors:      ${s.totalErrors}  (${(s.errRate * 100).toFixed(2)}%)`);
  lines.push(`Bytes:       ${s.totalBytes}`);
  lines.push('Latency (ms):');
  lines.push(`  min=${s.latency.min.toFixed(0)}  mean=${s.latency.mean.toFixed(0)}`);
  lines.push(`  p50=${s.latency.p50.toFixed(0)}  p95=${s.latency.p95.toFixed(0)}  p99=${s.latency.p99.toFixed(0)}  max=${s.latency.max.toFixed(0)}`);
  lines.push('Thresholds:');
  lines.push(`  p95 <= ${s.thresholds.p95_ms}ms, p99 <= ${s.thresholds.p99_ms}ms, err <= ${(s.thresholds.err_rate * 100).toFixed(2)}%`);
  if (Object.keys(s.errorBuckets).length) {
    lines.push('Errors by bucket:');
    for (const [k, v] of Object.entries(s.errorBuckets)) lines.push(`  ${k}: ${v}`);
  }
  if (Object.keys(s.byTag).length > 1) {
    lines.push('By tag:');
    for (const [tag, t] of Object.entries(s.byTag)) {
      lines.push(`  ${tag}: calls=${t.calls} err=${t.errors} (${(t.err_rate * 100).toFixed(2)}%) mean=${t.mean_ms.toFixed(0)}ms`);
    }
  }
  lines.push(bar);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // primitives
  request,
  createStats,
  runConcurrent,
  runRateLimited,
  // helpers
  sleep,
  randomInt,
  rid,
  percentile,
  buildReport,
  formatReport,
  // constants
  DEFAULT_TIMEOUT_MS,
  DEFAULT_THRESHOLDS,
};
