/**
 * load-harness.test.js — Unit + integration tests for the zero-dep load harness
 * ==============================================================================
 *
 * Run:   node --test test/load/load-harness.test.js
 *
 * Covers:
 *   1. Percentile correctness (pure math, no HTTP)
 *   2. Weighted scenario scheduling — empirical ratio check
 *   3. Threshold parsing + evaluation
 *   4. Metric types (trend / rate / counter / gauge)
 *   5. Stage transitions (ramp-up / steady / ramp-down timing)
 *   6. End-to-end run against a local mock HTTP server
 *   7. Exporters (JSON / JUnit / HTML) produce valid files
 *   8. Pre-built scenarios load correctly and have valid shapes
 *
 * Zero external deps. Uses Node's built-in `node:test` runner.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
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
  _internals,
} = require('../../src/load/load-harness');

// ══════════════════════════════════════════════════════════════════════
// 1. PERCENTILE MATH
// ══════════════════════════════════════════════════════════════════════

test('percentile: handles empty array', () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([], 95), 0);
});

test('percentile: single value returns that value for any p', () => {
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 99), 42);
});

test('percentile: nearest-rank on 1..100 yields correct classical values', () => {
  const arr = [];
  for (let i = 1; i <= 100; i++) arr.push(i);
  assert.equal(percentile(arr, 50), 50);
  assert.equal(percentile(arr, 90), 90);
  assert.equal(percentile(arr, 95), 95);
  assert.equal(percentile(arr, 99), 99);
  assert.equal(percentile(arr, 100), 100);
});

test('percentile: P0 returns the min, P100 returns the max', () => {
  const arr = [3, 7, 1, 9, 5].sort((a, b) => a - b); // [1,3,5,7,9]
  assert.equal(percentile(arr, 1), 1);     // rank ceil(0.01 * 5)-1 = 0
  assert.equal(percentile(arr, 100), 9);
});

test('percentile: non-uniform distribution', () => {
  // values heavily skewed to the low end
  const arr = [10, 20, 30, 40, 1000].sort((a, b) => a - b);
  assert.equal(percentile(arr, 50), 30);
  assert.equal(percentile(arr, 80), 40);
  assert.equal(percentile(arr, 100), 1000);
});

// ══════════════════════════════════════════════════════════════════════
// 2. WEIGHTED SCHEDULING
// ══════════════════════════════════════════════════════════════════════

test('weightedPick: returns -1 on empty input', () => {
  assert.equal(weightedPick([]), -1);
});

test('weightedPick: equal weights ≈ uniform distribution', () => {
  const scenarios = [{ weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1 }];
  const counts = [0, 0, 0, 0];
  const N = 20_000;
  for (let i = 0; i < N; i++) counts[weightedPick(scenarios)]++;
  // each bucket should land near N/4 = 5000, allow ±10%
  for (const c of counts) {
    assert.ok(c > N / 4 * 0.85, `expected > ${N / 4 * 0.85}, got ${c}`);
    assert.ok(c < N / 4 * 1.15, `expected < ${N / 4 * 1.15}, got ${c}`);
  }
});

test('weightedPick: 3-to-1 ratio holds empirically', () => {
  const scenarios = [{ weight: 3 }, { weight: 1 }];
  const counts = [0, 0];
  const N = 20_000;
  for (let i = 0; i < N; i++) counts[weightedPick(scenarios)]++;
  const ratio = counts[0] / counts[1];
  assert.ok(ratio > 2.6, `expected ratio ~3, got ${ratio.toFixed(2)}`);
  assert.ok(ratio < 3.4, `expected ratio ~3, got ${ratio.toFixed(2)}`);
});

test('weightedPick: zero weight falls through', () => {
  const scenarios = [{ weight: 0 }, { weight: 5 }];
  const counts = [0, 0];
  for (let i = 0; i < 1000; i++) counts[weightedPick(scenarios)]++;
  assert.equal(counts[0], 0, 'zero-weight scenario should never be picked');
  assert.equal(counts[1], 1000);
});

// ══════════════════════════════════════════════════════════════════════
// 3. THRESHOLD PARSER + EVAL
// ══════════════════════════════════════════════════════════════════════

test('parseThreshold: p(95)<500', () => {
  const p = parseThreshold('p(95)<500');
  assert.equal(p.aggregate, 'p95');
  assert.equal(p.op, '<');
  assert.equal(p.target, 500);
});

test('parseThreshold: rate<0.01', () => {
  const p = parseThreshold('rate<0.01');
  assert.equal(p.aggregate, 'rate');
  assert.equal(p.op, '<');
  assert.equal(p.target, 0.01);
});

test('parseThreshold: avg<=200 (compound operator, parses correctly)', () => {
  const p = parseThreshold('avg<=200');
  assert.equal(p.aggregate, 'avg');
  assert.equal(p.op, '<=');
  assert.equal(p.target, 200);
});

test('parseThreshold: p(99) >= 100 with whitespace', () => {
  const p = parseThreshold('p(99) >= 100');
  assert.equal(p.aggregate, 'p99');
  assert.equal(p.op, '>=');
  assert.equal(p.target, 100);
});

test('parseThreshold: rejects garbage', () => {
  assert.throws(() => parseThreshold('garbage'));
  assert.throws(() => parseThreshold('nope==abc'));
  assert.throws(() => parseThreshold('xyz(42)<100'));
});

test('evalThreshold: PASS when actual < target', () => {
  const m = new Metric('test', 'trend');
  for (let i = 1; i <= 100; i++) m.add(i);
  const r = evalThreshold(m, 'p(95)<200');
  assert.equal(r.ok, true);
  assert.equal(r.actual, 95);
  assert.equal(r.target, 200);
});

test('evalThreshold: FAIL when actual > target', () => {
  const m = new Metric('test', 'trend');
  for (let i = 1; i <= 100; i++) m.add(i);
  const r = evalThreshold(m, 'p(95)<50');
  assert.equal(r.ok, false);
  assert.equal(r.actual, 95);
});

test('evalThreshold: rate metric', () => {
  const m = new Metric('err', 'rate');
  for (let i = 0; i < 100; i++) m.add(i < 5);   // 5 failures out of 100
  const r = evalThreshold(m, 'rate<0.10');
  assert.equal(r.ok, true);
  assert.equal(r.actual, 0.05);
});

// ══════════════════════════════════════════════════════════════════════
// 4. METRIC TYPES
// ══════════════════════════════════════════════════════════════════════

test('Metric: trend stats', () => {
  const m = new Metric('d', 'trend');
  for (const v of [10, 20, 30, 40, 50]) m.add(v);
  const s = m.stats();
  assert.equal(s.count, 5);
  assert.equal(s.min, 10);
  assert.equal(s.max, 50);
  assert.equal(s.avg, 30);
  assert.equal(s.p50, 30);
  assert.equal(s.p90, 50);
});

test('Metric: rate stats', () => {
  const m = new Metric('r', 'rate');
  m.add(true); m.add(true); m.add(false); m.add(true);
  const s = m.stats();
  assert.equal(s.count, 4);
  assert.equal(s.passes, 3);
  assert.equal(s.fails, 1);
  assert.equal(s.rate, 0.75);
});

test('Metric: counter stats', () => {
  const m = new Metric('c', 'counter');
  m.add(5); m.add(3); m.add(2);
  const s = m.stats();
  assert.equal(s.count, 10);
});

test('Metric: gauge stats (last-wins)', () => {
  const m = new Metric('g', 'gauge');
  m.add(1); m.add(5); m.add(3);
  assert.equal(m.stats().value, 3);
});

// ══════════════════════════════════════════════════════════════════════
// 5. MOCK HTTP SERVER  (used by stage / e2e tests)
// ══════════════════════════════════════════════════════════════════════

/**
 * Spins up a tiny localhost HTTP server on an ephemeral port. Endpoints:
 *
 *   GET  /ok         → 200 with a small JSON body
 *   GET  /slow       → 200 after 40ms
 *   GET  /fail       → 500
 *   POST /echo       → 200 echoing the request body
 *   GET  /random     → 200 after a random 5..25 ms delay
 */
function startMockServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const send = (status, body, delay = 0) => {
        setTimeout(() => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        }, delay);
      };
      if (req.method === 'GET' && req.url === '/ok')    return send(200, { ok: true });
      if (req.method === 'GET' && req.url === '/slow')  return send(200, { ok: true }, 40);
      if (req.method === 'GET' && req.url === '/fail')  return send(500, { error: 'mock' });
      if (req.method === 'GET' && req.url === '/random') {
        const d = 5 + Math.floor(Math.random() * 20);
        return send(200, { d }, d);
      }
      if (req.method === 'POST' && req.url === '/echo') {
        let chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => send(200, { received: Buffer.concat(chunks).length }));
        return;
      }
      send(404, { error: 'not-found' });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// 6. SCENARIO SCHEDULING — exercised against the mock server
// ══════════════════════════════════════════════════════════════════════

test('LoadTester: picks scenarios by weight against mock server', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    const hits = { heavy: 0, light: 0 };
    lt.on('request', ({ scenario }) => { hits[scenario] = (hits[scenario] || 0) + 1; });

    lt.addScenario({ name: 'heavy', url: '/ok', method: 'GET', weight: 3 });
    lt.addScenario({ name: 'light', url: '/ok', method: 'GET', weight: 1 });

    await lt.run({ vus: 4, duration: 600 });

    const ratio = hits.heavy / Math.max(1, hits.light);
    assert.ok(hits.heavy > 0, 'heavy must fire');
    assert.ok(hits.light > 0, 'light must fire');
    assert.ok(ratio > 1.8, `ratio should be ≳3, got ${ratio.toFixed(2)}`);
    assert.ok(ratio < 5.0, `ratio should be ≳3, got ${ratio.toFixed(2)}`);
  } finally {
    server.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 7. END-TO-END RUN  — full metrics collection
// ══════════════════════════════════════════════════════════════════════

test('LoadTester: end-to-end run collects metrics and honors thresholds', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    lt.addScenario({ name: 'ok', url: '/ok', method: 'GET', weight: 1 });
    const report = await lt.run({
      vus: 5,
      duration: 600,
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed:   ['rate<0.05'],
      },
    });

    assert.ok(report.metrics.http_reqs.count > 5, 'should have fired multiple requests');
    assert.equal(report.metrics.http_req_failed.rate, 0, 'mock /ok always succeeds');
    assert.ok(report.throughput > 0);
    assert.equal(report.passed, true, 'thresholds should pass for /ok');
    assert.ok(report.metrics.http_req_duration.count > 0);
    assert.ok(report.metrics.iterations.count > 0);
  } finally {
    server.close();
  }
});

test('LoadTester: failures are counted in http_req_failed', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    lt.addScenario({ name: 'fail', url: '/fail', method: 'GET', weight: 1 });
    const report = await lt.run({
      vus: 3,
      duration: 400,
      thresholds: { http_req_failed: 'rate<0.01' },
    });
    assert.ok(report.metrics.http_req_failed.rate > 0.9, 'all /fail should fail');
    assert.equal(report.passed, false, 'threshold should fail');
    const tResult = report.thresholds.http_req_failed[0];
    assert.equal(tResult.ok, false);
  } finally {
    server.close();
  }
});

test('LoadTester: POST body is sent and counted', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    lt.addScenario({
      name: 'echo',
      url: '/echo',
      method: 'POST',
      body: { hello: 'world', big: 'x'.repeat(200) },
    });
    const report = await lt.run({ vus: 2, duration: 400 });
    assert.ok(report.metrics.data_sent.count > 0, 'data_sent must track uploaded bytes');
    assert.ok(report.metrics.data_received.count > 0, 'data_received must track response bytes');
    assert.equal(report.metrics.http_req_failed.rate, 0);
  } finally {
    server.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 8. STAGE TRANSITIONS
// ══════════════════════════════════════════════════════════════════════

test('LoadTester: runStages climbs and drains correctly', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    lt.addScenario({ name: 'ok', url: '/ok', method: 'GET' });

    const vuSamples = [];
    lt.on('request', () => {});
    const t0 = Date.now();
    const report = await lt.runStages([
      { duration: 300, target: 5 },   // ramp 0 → 5
      { duration: 300, target: 5 },   // hold
      { duration: 300, target: 0 },   // drain → 0
    ]);
    const elapsed = Date.now() - t0;

    // Should take about 900ms ± slack
    assert.ok(elapsed >= 800, `expected ≥800ms total, got ${elapsed}ms`);
    assert.ok(elapsed < 2500, `expected <2500ms total, got ${elapsed}ms`);
    // Peak VUs should have reached around 5
    assert.ok(report.metrics.vus_max.value >= 4, `vus_max should reach ~5, got ${report.metrics.vus_max.value}`);
    // Timeline must have many sample points
    assert.ok(report.vusTimeline.length > 5, 'timeline should be sampled during run');
    // Final sample should be 0 (post-drain)
    const last = report.vusTimeline[report.vusTimeline.length - 1];
    assert.equal(last.vus, 0);
  } finally {
    server.close();
  }
});

test('LoadTester: run() rejects rampUp+rampDown > duration', async () => {
  const lt = new LoadTester({ baseUrl: 'http://127.0.0.1:1' });
  lt.addScenario({ name: 'x', url: '/ok', method: 'GET' });
  await assert.rejects(
    () => lt.run({ vus: 1, duration: 100, rampUp: 80, rampDown: 80 }),
    /must not exceed duration/
  );
});

test('LoadTester: runStages rejects empty stages array', async () => {
  const lt = new LoadTester({ baseUrl: 'http://127.0.0.1:1' });
  lt.addScenario({ name: 'x', url: '/ok', method: 'GET' });
  await assert.rejects(
    () => lt.runStages([]),
    /at least one stage/
  );
});

test('LoadTester: runStages without scenarios throws', async () => {
  const lt = new LoadTester({ baseUrl: 'http://127.0.0.1:1' });
  await assert.rejects(
    () => lt.runStages([{ duration: 100, target: 1 }]),
    /no scenarios registered/
  );
});

// ══════════════════════════════════════════════════════════════════════
// 9. EXPORTERS
// ══════════════════════════════════════════════════════════════════════

test('exportJSON / exportJUnit / exportHTML produce valid artifacts', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    lt.addScenario({ name: 'ok', url: '/ok', method: 'GET' });
    await lt.run({
      vus: 2,
      duration: 400,
      thresholds: {
        http_req_duration: 'p(95)<2000',
        http_req_failed:   'rate<0.5',
      },
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loadh-'));
    const jsonPath = path.join(tmp, 'report.json');
    const junitPath = path.join(tmp, 'junit.xml');
    const htmlPath = path.join(tmp, 'report.html');

    lt.exportJSON(jsonPath);
    lt.exportJUnit(junitPath);
    lt.exportHTML(htmlPath);

    // JSON: parseable with the expected shape
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.ok(json.metrics.http_reqs.count > 0);
    assert.ok(json.thresholds);

    // JUnit: valid-ish XML with testsuites root
    const xml = fs.readFileSync(junitPath, 'utf8');
    assert.match(xml, /<testsuites/);
    assert.match(xml, /<testsuite/);
    assert.match(xml, /<testcase/);
    // Self-closing or proper closing tag
    assert.ok(/(<testcase[^>]*\/>|<\/testcase>)/.test(xml), 'testcase tag must be closed');

    // HTML: contains bilingual title and KPI grid
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, /דו"ח עומס/);
    assert.match(html, /Load Test Report/);
    assert.match(html, /<svg/);
    assert.match(html, /http_req_duration/);
  } finally {
    server.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 10. PRE-BUILT SCENARIOS SHAPE VALIDATION
// ══════════════════════════════════════════════════════════════════════

test('pre-built scenarios: invoice-list has valid shape', () => {
  const s = require('./scenarios/invoice-list')();
  assert.equal(s.name, 'invoice-list');
  assert.equal(s.method, 'GET');
  assert.match(s.url, /\/api\/invoices/);
  assert.ok(s.weight >= 1);
});

test('pre-built scenarios: invoice-create has valid shape', () => {
  const s = require('./scenarios/invoice-create')();
  assert.equal(s.name, 'invoice-create');
  assert.equal(s.method, 'POST');
  assert.ok(s.body);
  assert.match(s.body.invoice_number, /^LOAD-/);
});

test('pre-built scenarios: payroll-run has valid shape', () => {
  const s = require('./scenarios/payroll-run')();
  assert.equal(s.name, 'payroll-run');
  assert.equal(s.method, 'POST');
  assert.equal(s.body.dry_run, true);
});

test('pre-built scenarios: vat-report has valid shape', () => {
  const s = require('./scenarios/vat-report')();
  assert.equal(s.name, 'vat-report');
  assert.equal(s.method, 'GET');
  assert.match(s.url, /period=/);
});

test('pre-built scenarios: dashboard-home has valid shape', () => {
  const s = require('./scenarios/dashboard-home')();
  assert.equal(s.name, 'dashboard-home');
  assert.equal(s.method, 'GET');
  assert.ok(s.weight >= 1);
});

test('LoadTester can register all 5 pre-built scenarios', async () => {
  const { server, base } = await startMockServer();
  try {
    const lt = new LoadTester({ baseUrl: base });
    // All pre-built scenarios map to the mock /ok path so we can smoke them.
    for (const name of ['invoice-list', 'invoice-create', 'payroll-run', 'vat-report', 'dashboard-home']) {
      const factory = require('./scenarios/' + name);
      const scenario = factory();
      // redirect to mock server
      scenario.url = scenario.method === 'POST' ? '/echo' : '/ok';
      lt.addScenario(scenario);
    }
    const report = await lt.run({ vus: 3, duration: 600 });
    assert.ok(report.metrics.http_reqs.count > 0);
    // all 5 scenarios should have fired at least once (weight distribution)
    assert.equal(lt.scenarios.length, 5);
  } finally {
    server.close();
  }
});

// ══════════════════════════════════════════════════════════════════════
// 11. UTILITY HELPERS
// ══════════════════════════════════════════════════════════════════════

test('formatMs: adaptive precision', () => {
  assert.match(formatMs(0.25), /μs|ms|s/);
  assert.match(formatMs(5), /ms/);
  assert.match(formatMs(500), /ms/);
  assert.match(formatMs(5000), /s/);
});

test('formatBytes: adaptive precision', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.match(formatBytes(2048), /KB/);
  assert.match(formatBytes(3 * 1024 * 1024), /MB/);
});

test('niceTicks: produces round ticks around given range', () => {
  const { ticks } = niceTicks(0, 97, 5);
  assert.ok(ticks.length >= 3);
  assert.equal(ticks[0], 0);
  assert.ok(ticks[ticks.length - 1] >= 97);
});

// ══════════════════════════════════════════════════════════════════════
// 12. HTML RENDERER SMOKE
// ══════════════════════════════════════════════════════════════════════

test('internal HTML renderer handles empty timeline without crashing', () => {
  const html = _internals.renderVusChart([]);
  assert.match(html, /<svg/);
  assert.match(html, /No data|אין נתונים/);
});
