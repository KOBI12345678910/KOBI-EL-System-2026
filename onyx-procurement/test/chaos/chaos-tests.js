#!/usr/bin/env node
'use strict';
/**
 * test/chaos/chaos-tests.js
 * ─────────────────────────────────────────────────────────────
 * Scenario harness. For each chaos scenario, this module:
 *
 *   1. Captures a steady-state baseline (before fault).
 *   2. Injects the fault(s) via chaos-runner.
 *   3. Runs a bounded burst of API tests against the target
 *      server.
 *   4. Verifies the app meets the scenario's steady-state
 *      hypothesis — or records the deviation.
 *   5. Disposes every fault, even on thrown errors.
 *   6. Produces a per-scenario `RunResult` that is fed into
 *      chaos-report.js.
 *
 * Only Node built-ins. Safe to import in other test files.
 *
 * Run directly (does NOT actually fire requests unless
 *   CHAOS_DRY_RUN=0 and CHAOS_BASE_URL is set):
 *
 *     CHAOS_BASE_URL=http://localhost:3100 \
 *     CHAOS_API_KEY=dev-key \
 *     node test/chaos/chaos-tests.js
 *
 * Dry-run (default): validates the harness wiring, prints the
 *   scenarios it *would* run and exits 0. This is what CI
 *   should invoke first, since actually running chaos needs a
 *   supervised environment.
 *
 * Agent 55 — harness is preparation only. Per brief:
 *   "אל תריץ בפועל — רק הכן את התשתית".
 * ─────────────────────────────────────────────────────────────
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { performance } = require('node:perf_hooks');

const { ChaosRunner } = require('./chaos-runner');
const scenarios = require('./chaos-scenarios');

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const CFG = Object.freeze({
  baseUrl:   process.env.CHAOS_BASE_URL   || 'http://localhost:3100',
  apiKey:    process.env.CHAOS_API_KEY    || '',
  timeoutMs: Number(process.env.CHAOS_TIMEOUT_MS || 10_000),
  burstSize: Number(process.env.CHAOS_BURST_SIZE || 25),
  burstConcurrency: Number(process.env.CHAOS_BURST_CONC || 5),
  dryRun:    process.env.CHAOS_DRY_RUN !== '0',       // default: dry
  only:      (process.env.CHAOS_ONLY || '')
               .split(',').map((s) => s.trim()).filter(Boolean),
});

// Routes used as the "API surface" under chaos. These map to
// existing endpoints in onyx-procurement per test/load/api-load.js
// conventions; the harness tolerates 404 gracefully (we report
// it, we don't crash).
const PROBE_ROUTES = Object.freeze([
  { method: 'GET',  path: '/api/health',                    probe: 'health' },
  { method: 'GET',  path: '/api/vat/periods',                probe: 'read'   },
  { method: 'GET',  path: '/api/payroll/wage-slips',         probe: 'read'   },
  { method: 'GET',  path: '/api/bank/accounts',              probe: 'read'   },
  { method: 'POST', path: '/api/payroll/wage-slips/compute', probe: 'compute',
    body: { /* filled at runtime */ } },
]);

// ─────────────────────────────────────────────────────────────
// Minimal HTTP client (no deps)
// ─────────────────────────────────────────────────────────────
function request(method, urlStr, { headers = {}, body = null, timeoutMs = CFG.timeoutMs } = {}) {
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const started = performance.now();

  return new Promise((resolve) => {
    const req = lib.request({
      method,
      host: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: {
        'user-agent': 'onyx-chaos/1',
        'accept': 'application/json',
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': String(payload.length),
        } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          ok:       res.statusCode >= 200 && res.statusCode < 500,
          status:   res.statusCode,
          durationMs: performance.now() - started,
          headers:  res.headers,
          bodySize: chunks.reduce((n, c) => n + c.length, 0),
        });
      });
      res.on('error', (err) => resolve({
        ok: false, status: 0, durationMs: performance.now() - started,
        err: err.code || err.message,
      }));
    });
    req.on('error', (err) => resolve({
      ok: false, status: 0, durationMs: performance.now() - started,
      err: err.code || err.message,
    }));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`client timeout after ${timeoutMs}ms`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Steady-state sampler
// ─────────────────────────────────────────────────────────────
async function sampleSteadyState({ baseUrl, apiKey }) {
  const out = { routes: {}, errors: 0, count: 0, p95Ms: 0 };
  const times = [];
  for (const r of PROBE_ROUTES) {
    const result = await request(r.method, baseUrl + r.path, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      body: r.body ?? null,
    });
    out.routes[r.path] = { status: result.status, durationMs: result.durationMs };
    out.count++;
    if (!result.ok) out.errors++;
    times.push(result.durationMs);
  }
  times.sort((a, b) => a - b);
  out.p95Ms = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
  out.errorRate = out.count ? out.errors / out.count : 0;
  return out;
}

// ─────────────────────────────────────────────────────────────
// Burst runner — fires N requests with bounded concurrency
// ─────────────────────────────────────────────────────────────
async function burst({ baseUrl, apiKey, size, concurrency }) {
  const queue = [];
  for (let i = 0; i < size; i++) {
    queue.push(PROBE_ROUTES[i % PROBE_ROUTES.length]);
  }
  const results = [];
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (queue.length) {
      const r = queue.shift();
      const res = await request(r.method, baseUrl + r.path, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        body: r.body ?? null,
      });
      results.push({ path: r.path, method: r.method, ...res });
    }
  });
  await Promise.all(workers);
  return results;
}

// ─────────────────────────────────────────────────────────────
// Assertions over a burst result
// ─────────────────────────────────────────────────────────────
function summarise(results) {
  const total = results.length;
  const errors = results.filter((r) => !r.ok).length;
  const times = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))] || 0;
  return {
    total,
    errors,
    errorRate: total ? errors / total : 0,
    p50Ms: p(0.50),
    p95Ms: p(0.95),
    p99Ms: p(0.99),
  };
}

// ─────────────────────────────────────────────────────────────
// Observations: memory, process crash, error tracker, retries
// ─────────────────────────────────────────────────────────────
function observationsBefore() {
  return {
    rssMb:  process.memoryUsage().rss / (1024 * 1024),
    heapMb: process.memoryUsage().heapUsed / (1024 * 1024),
    uptimeSec: process.uptime(),
  };
}

function observationsAfter(before) {
  const now = observationsBefore();
  return {
    rssMb:  now.rssMb,
    heapMb: now.heapMb,
    rssDeltaMb:  now.rssMb - before.rssMb,
    heapDeltaMb: now.heapMb - before.heapMb,
    uptimeSec: now.uptimeSec,
  };
}

// ─────────────────────────────────────────────────────────────
// Scenario executor
// ─────────────────────────────────────────────────────────────
/**
 * Runs a single scenario end-to-end. In dry-run mode the
 * network calls are replaced by stubs so the wiring can be
 * verified on a machine with no server running.
 */
async function runScenario(scenario, opts = {}) {
  const cfg = { ...CFG, ...opts };
  const before = observationsBefore();
  const runner = new ChaosRunner({ seed: Number(process.env.CHAOS_SEED || 1) });
  const started = Date.now();

  /** @type {import('./chaos-report').RunResult} */
  const run = {
    id: scenario.id,
    title: scenario.title,
    startedAt: new Date(started).toISOString(),
    faults: scenario.faults.map(([n, o]) => ({ name: n, opts: { ...o, target: undefined } })),
    steadyBefore: null,
    underChaos: null,
    steadyAfter: null,
    observations: { before, after: null },
    deviations: [],
    status: 'unknown',
    log: [],
    error: null,
    dryRun: !!cfg.dryRun,
  };

  try {
    if (cfg.dryRun) {
      run.steadyBefore = { skipped: 'dry-run' };
      // Still enable + dispose each fault so patched references
      // exercise their restore path.
      for (const [name, optsF] of scenario.faults) {
        runner.enable(name, optsF);
      }
      run.underChaos = { skipped: 'dry-run' };
      run.steadyAfter = { skipped: 'dry-run' };
      run.status = 'dry-run';
    } else {
      run.steadyBefore = await sampleSteadyState(cfg);
      for (const [name, optsF] of scenario.faults) runner.enable(name, optsF);
      const res = await burst({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        size: cfg.burstSize,
        concurrency: cfg.burstConcurrency,
      });
      run.underChaos = summarise(res);

      // Dispose, then re-sample steady state (recovery check).
      await runner.disposeAll();
      run.steadyAfter = await sampleSteadyState(cfg);

      // Apply scenario steady-state hypothesis.
      run.deviations = checkHypothesis(scenario, run);
      run.status = classify(run.deviations, run);
    }
  } catch (e) {
    run.error = { message: e.message, stack: e.stack };
    run.status = 'failed';
  } finally {
    try { await runner.disposeAll(); } catch (_) {}
    run.log = runner.log();
    run.observations.after = observationsAfter(before);
    run.endedAt = new Date().toISOString();
    run.durationMs = Date.now() - started;
  }

  return run;
}

/**
 * Translate the scenario's `steadyState` block into concrete
 * checks against the burst summary + post-chaos health sample.
 */
function checkHypothesis(scenario, run) {
  const out = [];
  const ss = scenario.steadyState || {};
  const u = run.underChaos || {};

  if (ss.errorRateMax != null && u.errorRate > ss.errorRateMax) {
    out.push({
      rule: 'errorRateMax',
      expected: ss.errorRateMax,
      actual: u.errorRate,
      severity: u.errorRate > (ss.errorRateMax * 3) ? 'high' : 'medium',
    });
  }
  if (ss.p95MaxMs != null && u.p95Ms > ss.p95MaxMs) {
    out.push({
      rule: 'p95MaxMs',
      expected: ss.p95MaxMs,
      actual: u.p95Ms,
      severity: 'medium',
    });
  }
  if (ss.healthMaxMs != null && run.steadyAfter?.routes?.['/api/health']?.durationMs > ss.healthMaxMs) {
    out.push({
      rule: 'healthMaxMs',
      expected: ss.healthMaxMs,
      actual: run.steadyAfter.routes['/api/health'].durationMs,
      severity: 'high',
    });
  }
  if (ss.readRouteP95MaxMs != null && u.p95Ms > ss.readRouteP95MaxMs) {
    out.push({
      rule: 'readRouteP95MaxMs',
      expected: ss.readRouteP95MaxMs,
      actual: u.p95Ms,
      severity: 'medium',
    });
  }
  // Memory sanity.
  const mem = run.observations.after;
  if (scenario.abortConditions?.memoryMbAbove && mem?.rssMb > scenario.abortConditions.memoryMbAbove) {
    out.push({
      rule: 'memoryMbAbove',
      expected: scenario.abortConditions.memoryMbAbove,
      actual: mem.rssMb,
      severity: 'high',
    });
  }
  return out;
}

function classify(deviations, run) {
  if (run.error) return 'failed';
  if (deviations.length === 0) return 'resilient';
  const high = deviations.some((d) => d.severity === 'high');
  if (high) return 'failed';
  return 'degraded';
}

// ─────────────────────────────────────────────────────────────
// Top-level orchestration
// ─────────────────────────────────────────────────────────────
async function runAll(opts = {}) {
  const cfg = { ...CFG, ...opts };
  const selected = cfg.only.length
    ? scenarios.ALL_SCENARIOS.filter((s) => cfg.only.includes(s.id))
    : scenarios.ALL_SCENARIOS;

  console.log('═══════════════════════════════════════════════');
  console.log(' chaos-tests :: run plan');
  console.log('═══════════════════════════════════════════════');
  console.log(` baseUrl   : ${cfg.baseUrl}`);
  console.log(` dryRun    : ${cfg.dryRun}`);
  console.log(` scenarios : ${selected.map((s) => s.id).join(', ')}`);
  console.log('───────────────────────────────────────────────');

  const results = [];
  for (const s of selected) {
    console.log(`[chaos] running ${s.id} — ${s.title}`);
    const r = await runScenario(s, cfg);
    console.log(`[chaos]   status=${r.status}  deviations=${r.deviations.length}`);
    results.push(r);
  }
  return results;
}

module.exports = {
  CFG,
  PROBE_ROUTES,
  request,
  sampleSteadyState,
  burst,
  summarise,
  runScenario,
  runAll,
  checkHypothesis,
  classify,
};

if (require.main === module) {
  runAll()
    .then(async (results) => {
      // Hand off to the reporter if available.
      try {
        const { writeReport } = require('./chaos-report');
        const report = writeReport(results);
        console.log('\n' + report.text);
      } catch (e) {
        console.error('[chaos-tests] reporter unavailable:', e.message);
      }
      const anyFailed = results.some((r) => r.status === 'failed');
      process.exitCode = anyFailed ? 1 : 0;
    })
    .catch((e) => {
      console.error('[chaos-tests] crashed:', e);
      process.exitCode = 2;
    });
}
