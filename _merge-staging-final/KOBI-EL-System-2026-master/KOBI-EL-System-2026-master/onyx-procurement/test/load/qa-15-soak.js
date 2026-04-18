/**
 * QA-15 — SCENARIO 7 — Soak Test (Memory-Leak Detection)
 * =======================================================
 *
 * SIMULATES: Steady 50 req/s for 30 minutes — the exact shape a bookkeeper
 *            hammering the system for half an hour looks like.
 *
 * WORKFLOW per iteration (rotating across cheap + medium + slightly heavy):
 *   GET /api/status                  (33%)
 *   GET /api/suppliers?limit=20      (33%)
 *   GET /api/purchase-orders?limit=10 (34%)
 *
 * CONFIGURATION:
 *   rps         = 50
 *   duration    = 30 * 60 * 1000 ms   (30 minutes)
 *
 * WHY THIS MATTERS:
 *   Crashes love long runs. A 1-byte-per-request leak at 50 req/s is 540,000
 *   bytes/minute — 16 MB over 30 min. That won't OOM, but it WILL show up as
 *   rising GC pause times and therefore rising p95 over the run. We split the
 *   run into 6 x 5-minute windows and report per-window p95/p99 so you can
 *   SEE the drift without external tooling.
 *
 * THRESHOLDS:
 *   per-window  p95 <= 1500ms   err <= 0.01
 *   trend: max(p95) over windows must be <= 1.30 × min(p95) over windows
 *          — that is, latency may NOT drift more than 30% across the run.
 *
 * SAFETY:
 *   - 100% read-only. No leaked test data ever.
 *   - Cancellable via process SIGINT — each worker checks a stop flag between
 *     requests. If you need to bail early, hit Ctrl+C; the report is still built
 *     from whatever windows completed.
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'soak-test';

const THRESHOLDS = {
  p95_ms: 1500,
  p99_ms: 3000,
  err_rate: 0.01,
  driftRatio: 1.30,
};

async function run(baseUrl, apiKey, opts = {}) {
  const rps = opts.rps || 50;
  const duration = opts.duration || 30 * 60 * 1000;
  const windowMs = opts.windowMs || 5 * 60 * 1000;

  const startedAt = new Date().toISOString();
  const windows = [];
  let stopped = false;

  // Signal handling — do not kill the process, just exit the loop cleanly.
  // We attach then detach to avoid polluting the global state when the scenario
  // is used from the runner.
  const sigHandler = () => { stopped = true; };
  process.on('SIGINT', sigHandler);

  const endpoints = [
    { tag: 'status', method: 'GET', path: '/api/status' },
    { tag: 'suppliers', method: 'GET', path: '/api/suppliers?limit=20' },
    { tag: 'pos', method: 'GET', path: '/api/purchase-orders?limit=10' },
  ];

  const windowCount = Math.ceil(duration / windowMs);

  try {
    for (let w = 0; w < windowCount && !stopped; w++) {
      const wStats = lib.createStats(`${scenarioName}:win${w + 1}`);
      await lib.runRateLimited({
        rps,
        duration: Math.min(windowMs, duration - w * windowMs),
        task: async ({ iter }) => {
          if (stopped) return;
          const op = endpoints[iter % endpoints.length];
          const r = await lib.request(baseUrl, apiKey, {
            method: op.method,
            path: op.path,
          });
          wStats.record(r, { tag: op.tag });
        },
      });
      windows.push(wStats.report({ thresholds: {
        p95_ms: THRESHOLDS.p95_ms,
        p99_ms: THRESHOLDS.p99_ms,
        err_rate: THRESHOLDS.err_rate,
      } }));
    }
  } finally {
    process.removeListener('SIGINT', sigHandler);
  }

  // Drift analysis — the real soak test verdict.
  const p95s = windows.map(w => w.latency.p95).filter(v => v > 0);
  const minP95 = p95s.length ? Math.min(...p95s) : 0;
  const maxP95 = p95s.length ? Math.max(...p95s) : 0;
  const driftRatio = minP95 > 0 ? maxP95 / minP95 : 0;
  const allPerWindowPass = windows.every(w => w.pass);
  const driftPass = driftRatio === 0 || driftRatio <= THRESHOLDS.driftRatio;
  const pass = allPerWindowPass && driftPass;

  // Aggregate the cross-window totals for the runner's flat summary.
  const agg = {
    totalCalls: windows.reduce((a, w) => a + w.totalCalls, 0),
    totalErrors: windows.reduce((a, w) => a + w.totalErrors, 0),
    totalBytes: windows.reduce((a, w) => a + w.totalBytes, 0),
    elapsedS: windows.reduce((a, w) => a + w.elapsedS, 0),
  };

  return {
    scenario: scenarioName,
    agent: 'QA-15',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    config: { rps, duration, windowMs, windowCount },
    stats: {
      windows,
      drift: { minP95, maxP95, driftRatio, limit: THRESHOLDS.driftRatio, pass: driftPass },
      thresholds: THRESHOLDS,
      pass,
      verdict: pass ? 'GO' : 'NO-GO',
      totalCalls: agg.totalCalls,
      totalErrors: agg.totalErrors,
      errRate: agg.totalCalls ? agg.totalErrors / agg.totalCalls : 0,
      rps: agg.elapsedS > 0 ? agg.totalCalls / agg.elapsedS : 0,
      elapsedS: agg.elapsedS,
      totalBytes: agg.totalBytes,
      latency: {
        min: Math.min(...windows.map(w => w.latency.min).filter(v => v > 0), 0),
        mean: windows.length ? windows.reduce((a, w) => a + w.latency.mean, 0) / windows.length : 0,
        p50: Math.max(0, ...windows.map(w => w.latency.p50)),
        p95: maxP95,
        p99: Math.max(0, ...windows.map(w => w.latency.p99)),
        max: Math.max(0, ...windows.map(w => w.latency.max)),
      },
      errorBuckets: windows.reduce((a, w) => {
        for (const [k, v] of Object.entries(w.errorBuckets || {})) a[k] = (a[k] || 0) + v;
        return a;
      }, {}),
      byTag: {},
    },
  };
}

module.exports = { scenarioName, run, THRESHOLDS };
