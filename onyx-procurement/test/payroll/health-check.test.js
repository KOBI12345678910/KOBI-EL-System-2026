/**
 * Health Check — Unit Tests
 * Agent X-56 — Techno-Kol Uzi (Swarm 3D) Mega ERP
 *
 * Covers:
 *   - createHealthChecker / registerCheck / unregisterCheck / listChecks
 *   - setCriticalChecks
 *   - liveness / readiness / startup / detailed
 *   - Built-in checks: process, memory, event-loop, env vars, config, certs,
 *     queue, background jobs, DB ping, DB write, HTTP endpoint
 *   - Timeout / retry / cache / critical vs warning
 *   - aggregate precedence
 *   - Express middlewares (live / ready / startup / detailed)
 *   - Graceful shutdown (trackInflight + beginShutdown drain)
 *   - Bilingual HE/EN messages
 *   - Startup marker
 *   - startHealthRefresh / stopHealthRefresh
 *   - runAll parallelism
 *
 * Run with:  node --test test/payroll/health-check.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const hc = require(path.resolve(__dirname, '..', '..', 'src', 'ops', 'health-check.js'));

const {
  createHealthChecker,
  HealthChecker,
  checkProcess,
  checkMemory,
  checkEventLoopLag,
  checkEnvVars,
  checkConfig,
  checkCertificates,
  checkQueueDepth,
  checkBackgroundJobs,
  checkDbPing,
  checkDbWrite,
  checkHttpEndpoint,
  STATUS_OK,
  STATUS_WARN,
  STATUS_FAIL,
  STATUS_UNKNOWN,
  _aggregate,
  _withTimeout,
  _bilingual,
} = hc;

// ─── helpers ─────────────────────────────────────────────────

function makeRes() {
  const state = { statusCode: null, body: null, sent: false };
  const res = {
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; state.sent = true; return this; },
  };
  return { res, state };
}

function startLocalHttpServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── 1. factory + basic API ──────────────────────────────────
test('createHealthChecker returns a HealthChecker with defaults', () => {
  const checker = createHealthChecker({ serviceName: 'test-svc', version: '1.2.3' });
  assert.ok(checker instanceof HealthChecker);
  assert.equal(checker.serviceName, 'test-svc');
  assert.equal(checker.version, '1.2.3');
  assert.equal(checker.startupComplete, false);
  assert.equal(checker.shuttingDown, false);
  assert.deepEqual(checker.listChecks(), []);
});

// ─── 2. registerCheck ────────────────────────────────────────
test('registerCheck stores the check with options', () => {
  const checker = createHealthChecker();
  checker.registerCheck('my-check', async () => ({ status: STATUS_OK, message: 'ok' }), {
    timeout: 1000,
    cacheMs: 500,
    retries: 2,
    critical: true,
    category: 'custom',
  });
  assert.deepEqual(checker.listChecks(), ['my-check']);
  const stored = checker.checks.get('my-check');
  assert.equal(stored.timeout, 1000);
  assert.equal(stored.retries, 2);
  assert.equal(stored.critical, true);
  assert.ok(checker.criticalNames.has('my-check'));
});

// ─── 3. registerCheck input validation ───────────────────────
test('registerCheck rejects invalid args', () => {
  const checker = createHealthChecker();
  assert.throws(() => checker.registerCheck('', () => {}), /non-empty string/);
  assert.throws(() => checker.registerCheck('x', 'not-a-fn'), /must be a function/);
});

// ─── 4. unregisterCheck ──────────────────────────────────────
test('unregisterCheck removes a previously registered check', () => {
  const checker = createHealthChecker();
  checker.registerCheck('foo', () => ({ status: STATUS_OK }), { critical: true });
  assert.equal(checker.listChecks().length, 1);
  checker.unregisterCheck('foo');
  assert.equal(checker.listChecks().length, 0);
  assert.ok(!checker.criticalNames.has('foo'));
});

// ─── 5. setCriticalChecks ────────────────────────────────────
test('setCriticalChecks marks chosen checks as must-pass', () => {
  const checker = createHealthChecker();
  checker.registerCheck('a', () => ({ status: STATUS_OK }));
  checker.registerCheck('b', () => ({ status: STATUS_OK }));
  checker.registerCheck('c', () => ({ status: STATUS_OK }));
  checker.setCriticalChecks(['a', 'c']);
  assert.ok(checker.criticalNames.has('a'));
  assert.ok(!checker.criticalNames.has('b'));
  assert.ok(checker.criticalNames.has('c'));
  assert.throws(() => checker.setCriticalChecks('not-array'), /expected array/);
});

// ─── 6. liveness (alive) ─────────────────────────────────────
test('liveness() returns OK when not shutting down', () => {
  const checker = createHealthChecker();
  const body = checker.liveness();
  assert.equal(body.status, STATUS_OK);
  assert.equal(body.reason, 'alive');
  assert.ok(body.label.he);
  assert.ok(body.label.en);
});

// ─── 7. liveness (shutting down) ─────────────────────────────
test('liveness() returns FAIL when shuttingDown=true', () => {
  const checker = createHealthChecker();
  checker.shuttingDown = true;
  const body = checker.liveness();
  assert.equal(body.status, STATUS_FAIL);
  assert.equal(body.reason, 'shutting_down');
  assert.equal(body.label.he, 'מערכת בכיבוי');
});

// ─── 8. startup probe ────────────────────────────────────────
test('startup() reports FAIL until markStartupComplete()', () => {
  const checker = createHealthChecker();
  assert.equal(checker.startup().status, STATUS_FAIL);
  checker.markStartupComplete();
  assert.equal(checker.startup().status, STATUS_OK);
  assert.equal(checker.startup().startup_complete, true);
});

// ─── 9. readiness: no critical checks → OK ───────────────────
test('readiness() returns OK when no critical checks are registered', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('non-critical', () => ({ status: STATUS_FAIL, message: 'should not fail ready' }));
  const body = await checker.readiness();
  assert.equal(body.status, STATUS_OK);
});

// ─── 10. readiness: critical fail → FAIL ─────────────────────
test('readiness() returns FAIL when a critical check fails', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('db', () => ({ status: STATUS_FAIL, message: 'down' }), { critical: true });
  const body = await checker.readiness();
  assert.equal(body.status, STATUS_FAIL);
  assert.equal(body.failed_count, 1);
  assert.equal(body.reason, 'critical_checks_failed');
});

// ─── 11. readiness: warn is still ready ──────────────────────
test('readiness() stays OK if a critical check returns WARN', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('slowdb', () => ({ status: STATUS_WARN, message: 'slow' }), { critical: true });
  const body = await checker.readiness();
  assert.equal(body.status, STATUS_OK);
});

// ─── 12. detailed aggregate ──────────────────────────────────
test('detailed() aggregates overall status using precedence', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('a', () => ({ status: STATUS_OK }));
  checker.registerCheck('b', () => ({ status: STATUS_WARN }));
  checker.registerCheck('c', () => ({ status: STATUS_OK }));
  const body = await checker.detailed();
  assert.equal(body.overall_status, STATUS_WARN);
  assert.equal(body.summary.ok, 2);
  assert.equal(body.summary.warn, 1);
  assert.ok(body.categories);
});

// ─── 13. timeout enforcement ─────────────────────────────────
test('runCheck enforces per-check timeout', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('slow', () => new Promise((r) => setTimeout(() => r({ status: STATUS_OK }), 500)), {
    timeout: 50,
    retries: 0,
  });
  const res = await checker.runCheck('slow');
  assert.equal(res.status, STATUS_FAIL);
  assert.match(res.details.error, /timeout/);
});

// ─── 14. retry on transient failure ──────────────────────────
test('runCheck retries up to N times before failing', async () => {
  let calls = 0;
  const checker = createHealthChecker();
  checker.registerCheck('flaky', () => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return { status: STATUS_OK, message: 'recovered' };
  }, { retries: 3, timeout: 500 });
  const res = await checker.runCheck('flaky');
  assert.equal(res.status, STATUS_OK);
  assert.equal(calls, 3);
});

// ─── 15. cache duration ──────────────────────────────────────
test('runCheck uses cache until cacheMs expires', async () => {
  let calls = 0;
  const checker = createHealthChecker();
  checker.registerCheck('cached', () => {
    calls++;
    return { status: STATUS_OK };
  }, { cacheMs: 1000 });
  const r1 = await checker.runCheck('cached');
  const r2 = await checker.runCheck('cached');
  assert.equal(calls, 1);
  assert.equal(r1.cached, false);
  assert.equal(r2.cached, true);
  // force=true bypasses cache
  const r3 = await checker.runCheck('cached', { force: true });
  assert.equal(calls, 2);
  assert.equal(r3.cached, false);
});

// ─── 16. aggregate helper precedence ─────────────────────────
test('_aggregate: fail > warn > unknown > ok', () => {
  assert.equal(_aggregate([STATUS_OK, STATUS_OK]), STATUS_OK);
  assert.equal(_aggregate([STATUS_OK, STATUS_WARN]), STATUS_WARN);
  assert.equal(_aggregate([STATUS_WARN, STATUS_FAIL]), STATUS_FAIL);
  assert.equal(_aggregate([STATUS_OK, STATUS_UNKNOWN]), STATUS_UNKNOWN);
  assert.equal(_aggregate([]), STATUS_OK);
});

// ─── 17. _withTimeout helper ─────────────────────────────────
test('_withTimeout resolves fast path and rejects on timeout', async () => {
  const v = await _withTimeout(Promise.resolve('ok'), 100, 'x');
  assert.equal(v, 'ok');
  await assert.rejects(
    () => _withTimeout(new Promise((r) => setTimeout(() => r('late'), 500)), 50, 'late'),
    /timeout/
  );
});

// ─── 18. checkProcess built-in ───────────────────────────────
test('checkProcess built-in returns OK with pid & uptime', () => {
  const r = checkProcess();
  assert.equal(r.status, STATUS_OK);
  assert.equal(r.category, 'process');
  assert.equal(typeof r.details.pid, 'number');
  assert.equal(typeof r.details.uptime_seconds, 'number');
});

// ─── 19. checkMemory built-in ────────────────────────────────
test('checkMemory reports usage with numeric percent', () => {
  const r = checkMemory(90);
  assert.ok([STATUS_OK, STATUS_WARN, STATUS_FAIL].includes(r.status));
  assert.equal(r.category, 'memory');
  assert.equal(typeof r.details.used_percent, 'number');
});

// ─── 20. checkEventLoopLag built-in ──────────────────────────
test('checkEventLoopLag returns OK under a generous limit', async () => {
  const r = await checkEventLoopLag(5000);
  assert.equal(r.status, STATUS_OK);
  assert.equal(r.category, 'cpu');
  assert.equal(typeof r.details.lag_ms, 'number');
});

// ─── 21. checkEnvVars built-in ───────────────────────────────
test('checkEnvVars flags missing variables', () => {
  // Use an unlikely-to-exist var name.
  const rnd = 'X56_MISSING_' + Math.random().toString(36).slice(2);
  const missing = checkEnvVars([rnd]);
  assert.equal(missing.status, STATUS_FAIL);
  assert.deepEqual(missing.details.missing, [rnd]);

  process.env[rnd] = 'present';
  const present = checkEnvVars([rnd]);
  assert.equal(present.status, STATUS_OK);
  delete process.env[rnd];
});

// ─── 22. checkConfig built-in ────────────────────────────────
test('checkConfig handles valid / invalid / thrown', async () => {
  const ok = await checkConfig(() => true);
  assert.equal(ok.status, STATUS_OK);
  const bad = await checkConfig(() => ({ valid: false, error: 'missing x' }));
  assert.equal(bad.status, STATUS_FAIL);
  const thrown = await checkConfig(() => { throw new Error('boom'); });
  assert.equal(thrown.status, STATUS_FAIL);
  const none = await checkConfig(null);
  assert.equal(none.status, STATUS_OK);
});

// ─── 23. checkCertificates built-in ──────────────────────────
test('checkCertificates warns <30d, fails expired, OK far future', async () => {
  const now = Date.now();
  const certs = [
    { name: 'good', expiresAt: new Date(now + 365 * 86400000).toISOString() },
    { name: 'soon', expiresAt: new Date(now + 5 * 86400000).toISOString() },
    { name: 'dead', expiresAt: new Date(now - 86400000).toISOString() },
  ];
  const r = await checkCertificates(certs);
  assert.equal(r.status, STATUS_FAIL);
  const byName = Object.fromEntries(r.details.certs.map((c) => [c.name, c.status]));
  assert.equal(byName.good, STATUS_OK);
  assert.equal(byName.soon, STATUS_WARN);
  assert.equal(byName.dead, STATUS_FAIL);
});

// ─── 24. checkQueueDepth built-in ────────────────────────────
test('checkQueueDepth OK/WARN/FAIL across threshold', async () => {
  const ok = await checkQueueDepth(() => 10, 100);
  assert.equal(ok.status, STATUS_OK);
  const warn = await checkQueueDepth(() => 85, 100);
  assert.equal(warn.status, STATUS_WARN);
  const fail = await checkQueueDepth(() => 150, 100);
  assert.equal(fail.status, STATUS_FAIL);
  const thrown = await checkQueueDepth(() => { throw new Error('q gone'); }, 100);
  assert.equal(thrown.status, STATUS_FAIL);
});

// ─── 25. checkBackgroundJobs built-in ────────────────────────
test('checkBackgroundJobs detects stuck jobs', async () => {
  const now = Date.now();
  const jobs = {
    'fresh': { lastRunMs: now - 1000, maxStaleMs: 60000 },
    'stale': { lastRunMs: now - 120000, maxStaleMs: 60000 },
    'stuck': { lastRunMs: now, maxStaleMs: 60000, stuck: true },
  };
  const r = await checkBackgroundJobs(jobs);
  assert.equal(r.status, STATUS_FAIL);
  const byName = Object.fromEntries(r.details.jobs.map((j) => [j.name, j.status]));
  assert.equal(byName.fresh, STATUS_OK);
  assert.equal(byName.stale, STATUS_FAIL);
  assert.equal(byName.stuck, STATUS_FAIL);
});

// ─── 26. checkDbPing ─────────────────────────────────────────
test('checkDbPing reports OK/FAIL based on ping fn', async () => {
  const ok = await checkDbPing(async () => 1);
  assert.equal(ok.status, STATUS_OK);
  const bad = await checkDbPing(async () => { throw new Error('db refused'); });
  assert.equal(bad.status, STATUS_FAIL);
  const none = await checkDbPing(null);
  assert.equal(none.status, STATUS_OK);
});

// ─── 27. checkDbWrite ────────────────────────────────────────
test('checkDbWrite fails on false/throw, OK on truthy', async () => {
  const ok = await checkDbWrite(async () => true);
  assert.equal(ok.status, STATUS_OK);
  const falsy = await checkDbWrite(async () => false);
  assert.equal(falsy.status, STATUS_FAIL);
  const thrown = await checkDbWrite(async () => { throw new Error('readonly'); });
  assert.equal(thrown.status, STATUS_FAIL);
});

// ─── 28. checkHttpEndpoint against a local server ────────────
test('checkHttpEndpoint hits a local HTTP server', async () => {
  const { server, url: baseUrl } = await startLocalHttpServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('ok'); return; }
    if (req.url === '/bad') { res.writeHead(500); res.end('err'); return; }
    res.writeHead(404); res.end();
  });
  try {
    const okRes = await checkHttpEndpoint(`${baseUrl}/ok`, { label: 'local-ok', timeout: 2000 });
    assert.equal(okRes.status, STATUS_OK);
    const badRes = await checkHttpEndpoint(`${baseUrl}/bad`, { label: 'local-bad', timeout: 2000 });
    assert.equal(badRes.status, STATUS_FAIL);
    const missingRes = await checkHttpEndpoint(`${baseUrl}/missing`, { label: 'local-404', timeout: 2000 });
    assert.equal(missingRes.status, STATUS_FAIL);
    const invalidUrl = await checkHttpEndpoint('not a url', { label: 'invalid' });
    assert.equal(invalidUrl.status, STATUS_FAIL);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// ─── 29. Express middleware — liveness / readiness ───────────
test('livenessRoute handler returns 200 OK JSON', () => {
  const checker = createHealthChecker();
  const handler = checker.livenessRoute();
  const { res, state } = makeRes();
  handler({}, res);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.status, STATUS_OK);
});

test('readinessRoute returns 503 when critical check fails', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('db', () => ({ status: STATUS_FAIL }), { critical: true });
  const handler = checker.readinessRoute();
  const { res, state } = makeRes();
  await handler({}, res);
  assert.equal(state.statusCode, 503);
  assert.equal(state.body.status, STATUS_FAIL);
});

test('detailedRoute returns 200 when all green', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('a', () => ({ status: STATUS_OK }));
  const handler = checker.detailedRoute();
  const { res, state } = makeRes();
  await handler({}, res);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.overall_status, STATUS_OK);
});

// ─── 30. mountRoutes convenience ─────────────────────────────
test('mountRoutes attaches four routes to an Express-like app', () => {
  const routes = {};
  const app = {
    get(path, handler) { routes[path] = handler; },
  };
  const checker = createHealthChecker();
  checker.mountRoutes(app, '/healthz');
  assert.ok(routes['/healthz']);
  assert.ok(routes['/healthz/live']);
  assert.ok(routes['/healthz/ready']);
  assert.ok(routes['/healthz/startup']);
  assert.throws(() => checker.mountRoutes({}, '/x'), /Express-like/);
});

// ─── 31. graceful shutdown drains inflight requests ──────────
test('beginShutdown sets ready=false and drains inflight', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('db', () => ({ status: STATUS_OK }), { critical: true });
  // Simulate two inflight requests; one finishes "during drain".
  checker.inflightRequests = 2;
  const shutdownPromise = checker.beginShutdown({ drainMs: 500 });
  setTimeout(() => { checker.inflightRequests = 1; }, 50);
  setTimeout(() => { checker.inflightRequests = 0; }, 100);
  const result = await shutdownPromise;
  assert.equal(checker.shuttingDown, true);
  assert.equal(result.remaining_inflight, 0);
  // Readiness should be FAIL while shutting down.
  const r = await checker.readiness();
  assert.equal(r.status, STATUS_FAIL);
  assert.equal(r.reason, 'shutting_down');
});

// ─── 32. trackInflight middleware ────────────────────────────
test('trackInflight middleware increments/decrements counter', () => {
  const checker = createHealthChecker();
  const mw = checker.trackInflight();
  let finishCb;
  const res = {
    on(event, cb) { if (event === 'finish') finishCb = cb; },
  };
  let nextCalled = false;
  mw({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(checker.inflightRequests, 1);
  finishCb();
  assert.equal(checker.inflightRequests, 0);
});

// ─── 33. beginShutdown runs closers ──────────────────────────
test('beginShutdown executes provided closers sequentially', async () => {
  const checker = createHealthChecker();
  const calls = [];
  await checker.beginShutdown({
    drainMs: 10,
    closers: [
      async () => { calls.push('a'); },
      async () => { calls.push('b'); },
    ],
  });
  assert.deepEqual(calls, ['a', 'b']);
});

// ─── 34. closers are resilient to errors ─────────────────────
test('beginShutdown keeps running closers even if one throws', async () => {
  const checker = createHealthChecker();
  const calls = [];
  await checker.beginShutdown({
    drainMs: 10,
    closers: [
      async () => { calls.push('a'); },
      async () => { throw new Error('boom'); },
      async () => { calls.push('c'); },
    ],
  });
  assert.deepEqual(calls, ['a', 'c']);
});

// ─── 35. bilingual helper produces EN/HE/text ────────────────
test('_bilingual wraps EN+HE with combined text', () => {
  const b = _bilingual('alive', 'חי');
  assert.equal(b.en, 'alive');
  assert.equal(b.he, 'חי');
  assert.equal(b.text, 'alive / חי');
});

// ─── 36. background refresh populates cache ──────────────────
test('startHealthRefresh triggers runAll at interval', async () => {
  const checker = createHealthChecker();
  let calls = 0;
  checker.registerCheck('tick', () => {
    calls++;
    return { status: STATUS_OK };
  }, { cacheMs: 0 });

  checker.startHealthRefresh(50);
  await new Promise((r) => setTimeout(r, 180));
  checker.stopHealthRefresh();
  // Initial kick + at least one interval tick.
  assert.ok(calls >= 2, `expected ≥2 calls, got ${calls}`);
});

// ─── 37. runAll runs all checks in parallel ──────────────────
test('runAll() runs every registered check and returns array', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('a', () => ({ status: STATUS_OK }));
  checker.registerCheck('b', () => ({ status: STATUS_WARN }));
  checker.registerCheck('c', () => ({ status: STATUS_FAIL }));
  const results = await checker.runAll();
  assert.equal(results.length, 3);
  const byName = Object.fromEntries(results.map((r) => [r.name, r.status]));
  assert.equal(byName.a, STATUS_OK);
  assert.equal(byName.b, STATUS_WARN);
  assert.equal(byName.c, STATUS_FAIL);
});

// ─── 38. detailed() groups by category ───────────────────────
test('detailed() groups results by category with bilingual labels', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('mem', () => ({ status: STATUS_OK, category: 'memory' }));
  checker.registerCheck('db',  () => ({ status: STATUS_FAIL, category: 'db' }), { critical: true });
  checker.registerCheck('api', () => ({ status: STATUS_WARN, category: 'external' }));
  const body = await checker.detailed();
  assert.ok(body.categories.memory);
  assert.ok(body.categories.db);
  assert.ok(body.categories.external);
  assert.equal(body.categories.db.status, STATUS_FAIL);
  assert.ok(body.categories.db.label.he);
});

// ─── 39. critical non-registered name is OK ──────────────────
test('readiness() ignores unknown critical names without throwing', async () => {
  const checker = createHealthChecker();
  checker.setCriticalChecks(['non-existent']);
  const body = await checker.readiness();
  // Unknown checks produce STATUS_UNKNOWN, not STATUS_FAIL.
  assert.equal(body.status, STATUS_OK);
});

// ─── 40. readiness includeAll option ─────────────────────────
test('readiness({includeAll:true}) runs all checks regardless of critical flag', async () => {
  const checker = createHealthChecker();
  checker.registerCheck('a', () => ({ status: STATUS_OK }));
  checker.registerCheck('b', () => ({ status: STATUS_WARN }));
  const body = await checker.readiness({ includeAll: true });
  assert.equal(body.checks.length, 2);
});
