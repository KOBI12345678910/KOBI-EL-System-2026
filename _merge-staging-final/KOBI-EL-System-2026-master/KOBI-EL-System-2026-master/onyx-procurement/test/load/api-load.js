#!/usr/bin/env node
/**
 * test/load/api-load.js
 * ─────────────────────────────────────────────────────────────
 * Zero-dependency load-test suite for onyx-procurement.
 *
 * Uses ONLY Node built-ins (`http`, `https`, `url`, `perf_hooks`).
 * No k6, no autocannon, no wrk — copy this file, run it, done.
 *
 * Usage:
 *     node test/load/api-load.js
 *     LOAD_TEST_BASE_URL=http://localhost:3100 \
 *       LOAD_TEST_API_KEY=dev-key \
 *       node test/load/api-load.js
 *
 * Environment:
 *     LOAD_TEST_BASE_URL   target base URL (default http://localhost:3100)
 *     LOAD_TEST_API_KEY    value for X-API-Key header (required for
 *                          suppliers/invoices/vat/payroll scenarios)
 *     LOAD_TEST_TIMEOUT_MS per-request timeout in ms (default 10_000)
 *     LOAD_TEST_ONLY       comma-separated scenario names to run (optional)
 *
 * Thresholds (hard-coded, see TASK):
 *     p95 <= 1500 ms   for every scenario
 *     fail-rate <= 1%  for every scenario
 *
 * Exit code:
 *     0  — all scenarios passed both thresholds
 *     1  — at least one scenario breached a threshold
 *     2  — configuration error (bad URL, unreachable host, etc.)
 *
 * Requires: Node.js >= 18 (for global fetch-free built-ins + perf_hooks).
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { performance } = require('perf_hooks');

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3100';
const API_KEY = process.env.LOAD_TEST_API_KEY || '';
const TIMEOUT_MS = Number(process.env.LOAD_TEST_TIMEOUT_MS || 10_000);
const ONLY = (process.env.LOAD_TEST_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const THRESHOLD_P95_MS = 1500;
const THRESHOLD_FAIL_RATE = 0.01; // 1%

// Fixture body for POST /api/payroll/wage-slips/compute.
// Matches the canonical `baseTimesheet` + `basePeriod` in
// test/payroll-routes.test.js so the server can actually service it.
const WAGE_SLIP_FIXTURE = {
  employee_id: 10,
  timesheet: {
    hours_regular: 182,
    hours_overtime_125: 0,
    hours_overtime_150: 0,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: 0,
    hours_sick: 0,
    bonuses: 0,
  },
  period: { year: 2026, month: 3 },
};

// ─────────────────────────────────────────────────────────────
// Scenarios (declarative — easy to add/remove/tweak)
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: 'healthz',
    method: 'GET',
    path: '/healthz',
    total: 500,
    concurrency: 50,
    needsKey: false,
  },
  {
    name: 'suppliers-list',
    method: 'GET',
    path: '/api/suppliers',
    total: 200,
    concurrency: 20,
    needsKey: true,
  },
  {
    name: 'invoices-list',
    method: 'GET',
    path: '/api/invoices?limit=50',
    total: 200,
    concurrency: 20,
    needsKey: true,
  },
  {
    name: 'payroll-wage-slip-compute',
    method: 'POST',
    path: '/api/payroll/wage-slips/compute',
    total: 100,
    concurrency: 10,
    needsKey: true,
    body: WAGE_SLIP_FIXTURE,
  },
  {
    name: 'vat-summary',
    method: 'GET',
    path: '/api/vat/summary?year=2026&month=3',
    total: 100,
    concurrency: 10,
    needsKey: true,
  },
];

// ─────────────────────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────────────────────

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  // Nearest-rank method. p in [0..100].
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1);
  return sortedAsc[idx];
}

function fmtMs(n) {
  if (!Number.isFinite(n)) return '  —  ';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${n.toFixed(1)}ms`;
}

function pad(str, n) {
  const s = String(str);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

// ─────────────────────────────────────────────────────────────
// HTTP client — one request, returns { ok, status, durationMs, error? }
// ─────────────────────────────────────────────────────────────

function makeRequest({ base, method, path, body, headers }) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(path, base);
    } catch (err) {
      resolve({ ok: false, status: 0, durationMs: 0, error: `bad-url:${err.message}` });
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body != null ? Buffer.from(JSON.stringify(body)) : null;

    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        accept: 'application/json',
        'user-agent': 'onyx-load-test/1.0',
        ...(payload
          ? { 'content-type': 'application/json', 'content-length': payload.length }
          : {}),
        ...headers,
      },
      timeout: TIMEOUT_MS,
    };

    const start = performance.now();
    const req = lib.request(opts, (res) => {
      // Drain body so socket can be reused by the agent.
      res.on('data', () => {});
      res.on('end', () => {
        const durationMs = performance.now() - start;
        const status = res.statusCode || 0;
        // Treat any 2xx/3xx as ok. 4xx/5xx count as failures.
        const ok = status >= 200 && status < 400;
        resolve({ ok, status, durationMs });
      });
      res.on('error', (err) => {
        resolve({
          ok: false,
          status: res.statusCode || 0,
          durationMs: performance.now() - start,
          error: `res:${err.message}`,
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        durationMs: performance.now() - start,
        error: `req:${err.message}`,
      });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Scenario runner — fixed total requests, bounded concurrency
// ─────────────────────────────────────────────────────────────

async function runScenario(scn, { base, apiKey }) {
  const headers = {};
  if (scn.needsKey && apiKey) headers['x-api-key'] = apiKey;

  const durations = []; // ms
  const statusBuckets = new Map(); // status -> count
  let ok = 0;
  let failed = 0;
  let inflight = 0;
  let dispatched = 0;
  const firstErrors = [];

  const start = performance.now();

  await new Promise((resolveAll) => {
    const tryDispatch = () => {
      while (inflight < scn.concurrency && dispatched < scn.total) {
        dispatched += 1;
        inflight += 1;
        makeRequest({
          base,
          method: scn.method,
          path: scn.path,
          body: scn.body,
          headers,
        }).then((r) => {
          durations.push(r.durationMs);
          statusBuckets.set(r.status, (statusBuckets.get(r.status) || 0) + 1);
          if (r.ok) ok += 1;
          else {
            failed += 1;
            if (firstErrors.length < 5) {
              firstErrors.push(
                `status=${r.status}${r.error ? ' err=' + r.error : ''}`
              );
            }
          }
          inflight -= 1;
          if (dispatched >= scn.total && inflight === 0) {
            resolveAll();
          } else {
            tryDispatch();
          }
        });
      }
    };
    tryDispatch();
  });

  const wallMs = performance.now() - start;
  durations.sort((a, b) => a - b);

  const total = durations.length;
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);
  const max = durations.length ? durations[durations.length - 1] : 0;
  const rps = wallMs > 0 ? (total / (wallMs / 1000)) : 0;
  const failRate = total > 0 ? failed / total : 1;

  const p95Ok = p95 <= THRESHOLD_P95_MS;
  const failOk = failRate <= THRESHOLD_FAIL_RATE;
  const passed = p95Ok && failOk;

  return {
    name: scn.name,
    method: scn.method,
    path: scn.path,
    concurrency: scn.concurrency,
    total,
    ok,
    failed,
    failRate,
    p50,
    p95,
    p99,
    max,
    rps,
    wallMs,
    statusBuckets,
    firstErrors,
    passed,
    p95Ok,
    failOk,
  };
}

// ─────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────

function printHeader() {
  const line = '═'.repeat(72);
  console.log(line);
  console.log(' onyx-procurement — lightweight API load test');
  console.log(line);
  console.log(` base URL   : ${BASE_URL}`);
  console.log(` api key    : ${API_KEY ? '(set, ' + API_KEY.length + ' chars)' : '(not set)'}`);
  console.log(` timeout    : ${TIMEOUT_MS} ms`);
  console.log(` thresholds : p95 <= ${THRESHOLD_P95_MS} ms, fail-rate <= ${(THRESHOLD_FAIL_RATE * 100).toFixed(1)}%`);
  console.log(` scenarios  : ${SCENARIOS.map((s) => s.name).join(', ')}`);
  console.log(line);
}

function printScenarioResult(r) {
  const head = `▶ ${r.name}  (${r.method} ${r.path})  conc=${r.concurrency}`;
  console.log('');
  console.log(head);
  console.log('─'.repeat(Math.max(head.length, 60)));
  console.log(
    `  total=${pad(r.total, 5)} ok=${pad(r.ok, 5)} failed=${pad(r.failed, 5)} ` +
      `fail-rate=${(r.failRate * 100).toFixed(2)}%  rps=${r.rps.toFixed(1)}`
  );
  console.log(
    `  p50=${pad(fmtMs(r.p50), 9)} p95=${pad(fmtMs(r.p95), 9)} ` +
      `p99=${pad(fmtMs(r.p99), 9)} max=${fmtMs(r.max)}  wall=${fmtMs(r.wallMs)}`
  );
  if (r.statusBuckets.size > 0) {
    const parts = [];
    const keys = [...r.statusBuckets.keys()].sort((a, b) => a - b);
    for (const k of keys) parts.push(`${k}:${r.statusBuckets.get(k)}`);
    console.log(`  status     ${parts.join('  ')}`);
  }
  if (r.firstErrors.length > 0) {
    console.log(`  first errs ${r.firstErrors.slice(0, 3).join(' | ')}`);
  }
  const p95Tag = r.p95Ok ? 'OK ' : 'FAIL';
  const failTag = r.failOk ? 'OK ' : 'FAIL';
  console.log(
    `  verdict    p95:${p95Tag}  failures:${failTag}  => ${r.passed ? 'PASSED' : 'FAILED'}`
  );
}

function printSummary(results) {
  const line = '═'.repeat(72);
  console.log('');
  console.log(line);
  console.log(' SUMMARY');
  console.log(line);
  console.log(
    `  ${pad('scenario', 28)}${pad('total', 8)}${pad('fail%', 8)}${pad('p95', 10)}${pad('rps', 8)}verdict`
  );
  console.log('  ' + '─'.repeat(68));
  for (const r of results) {
    console.log(
      `  ${pad(r.name, 28)}${pad(r.total, 8)}${pad((r.failRate * 100).toFixed(2), 8)}${pad(
        fmtMs(r.p95),
        10
      )}${pad(r.rps.toFixed(1), 8)}${r.passed ? 'PASS' : 'FAIL'}`
    );
  }
  console.log(line);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  // Validate base URL up front — exit 2 on config errors.
  try {
    // eslint-disable-next-line no-new
    new URL(BASE_URL);
  } catch (err) {
    console.error(`[config] invalid LOAD_TEST_BASE_URL: ${BASE_URL} (${err.message})`);
    process.exit(2);
  }

  printHeader();

  const pool = ONLY.length
    ? SCENARIOS.filter((s) => ONLY.includes(s.name))
    : SCENARIOS;

  if (pool.length === 0) {
    console.error(`[config] no scenarios selected (LOAD_TEST_ONLY=${process.env.LOAD_TEST_ONLY})`);
    process.exit(2);
  }

  const results = [];
  for (const scn of pool) {
    if (scn.needsKey && !API_KEY) {
      console.warn(
        `\n! scenario "${scn.name}" needs LOAD_TEST_API_KEY — it will likely fail with 401.`
      );
    }
    const r = await runScenario(scn, { base: BASE_URL, apiKey: API_KEY });
    printScenarioResult(r);
    results.push(r);
  }

  printSummary(results);

  const anyFailed = results.some((r) => !r.passed);
  if (anyFailed) {
    console.error('\n[FAIL] one or more scenarios breached thresholds');
    process.exit(1);
  }
  console.log('\n[OK] all scenarios within thresholds');
  process.exit(0);
}

main().catch((err) => {
  console.error('[fatal]', err && err.stack ? err.stack : err);
  process.exit(2);
});
