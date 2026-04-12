/**
 * ONYX APM — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent X-59
 *
 * Run with:  node --test onyx-procurement/test/payroll/apm.test.js
 *
 * 25+ test cases covering every APM measurement, aggregation path, and
 * integration hook. Uses only the Node built-in test runner — zero deps.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  createApm,
  Apm,
  RingBuffer,
  WINDOWS,
  DEFAULT_APDEX_T,
  _summarize,
  _quantileSorted,
  _parseSqlForMetrics,
  _t,
} = require(path.resolve(__dirname, '..', '..', 'src', 'ops', 'apm.js'));

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function freshApm(opts) {
  return createApm(Object.assign({ ringCap: 1024 }, opts || {}));
}

function populateRequests(apm, samples) {
  for (const s of samples) {
    apm.recordRequest({
      route: s.route || '/api/x',
      method: s.method || 'GET',
      duration: s.duration,
      status: s.status || 200,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Factory + instance sanity
// ═══════════════════════════════════════════════════════════════════════════

test('createApm returns an Apm instance with default apdex T', () => {
  const apm = freshApm();
  assert.ok(apm instanceof Apm);
  assert.equal(apm.apdexT, DEFAULT_APDEX_T);
  assert.equal(typeof apm.recordRequest, 'function');
  assert.equal(typeof apm.getMetrics, 'function');
});

test('createApm accepts custom apdexT and lang', () => {
  const apm = freshApm({ apdexT: 800, lang: 'he' });
  assert.equal(apm.apdexT, 800);
  assert.equal(apm.lang, 'he');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Quantile + summarize pure helpers
// ═══════════════════════════════════════════════════════════════════════════

test('quantileSorted handles edges and interpolation', () => {
  assert.equal(_quantileSorted([], 0.5), 0);
  assert.equal(_quantileSorted([42], 0.95), 42);
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(_quantileSorted(s, 0.5), 5.5);
  assert.equal(_quantileSorted(s, 0), 1);
  assert.equal(_quantileSorted(s, 1), 10);
  // p90 of 1..10 → 9.1
  const p90 = _quantileSorted(s, 0.9);
  assert.ok(Math.abs(p90 - 9.1) < 1e-9, `got ${p90}`);
});

test('summarize computes all requested quantiles', () => {
  const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  const sum = _summarize(values);
  assert.equal(sum.count, 10);
  assert.equal(sum.min, 100);
  assert.equal(sum.max, 1000);
  assert.equal(sum.mean, 550);
  assert.ok(sum.p50 >= 500 && sum.p50 <= 600);
  assert.ok(sum.p95 >= 900);
  assert.ok(sum.p99 >= 990);
});

test('summarize of an empty array is all-zero', () => {
  const s = _summarize([]);
  assert.equal(s.count, 0);
  assert.equal(s.p50, 0);
  assert.equal(s.p99, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RingBuffer
// ═══════════════════════════════════════════════════════════════════════════

test('RingBuffer wraps around when capacity is exceeded', () => {
  const rb = new RingBuffer(4);
  for (let i = 1; i <= 6; i++) rb.push({ ts: Date.now(), v: i });
  const all = rb.all();
  assert.equal(all.length, 4);
  // oldest two should be evicted → we should see values 3..6
  assert.deepEqual(all.map(e => e.v).sort((a, b) => a - b), [3, 4, 5, 6]);
});

test('RingBuffer.sinceTs filters by cutoff', () => {
  const rb = new RingBuffer(16);
  const now = Date.now();
  rb.push({ ts: now - 10_000, v: 1 });
  rb.push({ ts: now - 1_000, v: 2 });
  rb.push({ ts: now, v: 3 });
  const recent = rb.sinceTs(now - 2_000);
  assert.equal(recent.length, 2);
  assert.deepEqual(recent.map(e => e.v), [2, 3]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. recordRequest + getMetrics + throughput + error rate
// ═══════════════════════════════════════════════════════════════════════════

test('recordRequest feeds the requests ring and updates counters', () => {
  const apm = freshApm();
  apm.recordRequest({ route: '/a', method: 'GET', duration: 100, status: 200 });
  apm.recordRequest({ route: '/a', method: 'GET', duration: 200, status: 500 });
  const m = apm.getMetrics('5m');
  assert.equal(m.request.count, 2);
  assert.equal(m.request.error_count, 1);
  assert.ok(m.request.mean > 0);
  assert.equal(apm.counters.requests_total, 2);
  assert.equal(apm.counters.requests_errors, 1);
});

test('error rate and throughput are computed correctly', () => {
  const apm = freshApm();
  for (let i = 0; i < 20; i++) {
    apm.recordRequest({
      route: '/r',
      method: 'GET',
      duration: 50,
      status: i % 5 === 0 ? 500 : 200,
    });
  }
  const m = apm.getMetrics('5m');
  assert.equal(m.request.count, 20);
  // 4 out of 20 are errors (20 %)
  assert.equal(m.request.error_count, 4);
  assert.ok(Math.abs(m.request.error_rate - 0.2) < 1e-9);
  assert.ok(m.request.throughput_per_sec > 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. APDEX scoring
// ═══════════════════════════════════════════════════════════════════════════

test('apdex score with mix of satisfied, tolerating, frustrated', () => {
  const apm = freshApm({ apdexT: 500 });
  // 4 satisfied (<=500), 2 tolerating (>500, <=2000), 1 frustrated (>2000)
  populateRequests(apm, [
    { duration: 100 }, { duration: 250 }, { duration: 400 }, { duration: 500 },
    { duration: 800 }, { duration: 1500 },
    { duration: 3000 },
  ]);
  const a = apm.apdex('5m');
  assert.equal(a.total, 7);
  assert.equal(a.satisfied, 4);
  assert.equal(a.tolerating, 2);
  assert.equal(a.frustrated, 1);
  // (4 + 2/2) / 7 = 5 / 7 ~ 0.7143
  assert.ok(Math.abs(a.score - 5 / 7) < 1e-3);
});

test('apdex returns 1 when there is no data', () => {
  const apm = freshApm();
  const a = apm.apdex('5m');
  assert.equal(a.score, 1);
  assert.equal(a.total, 0);
});

test('apdex counts errors as frustrated regardless of duration', () => {
  const apm = freshApm({ apdexT: 500 });
  populateRequests(apm, [
    { duration: 50, status: 500 },   // error → frustrated
    { duration: 50, status: 200 },   // satisfied
  ]);
  const a = apm.apdex('5m');
  assert.equal(a.satisfied, 1);
  assert.equal(a.frustrated, 1);
});

test('apdex respects per-call t override', () => {
  const apm = freshApm({ apdexT: 500 });
  populateRequests(apm, [{ duration: 300 }]);
  const a1 = apm.apdex('5m');       // t=500 → satisfied
  const a2 = apm.apdex('5m', 100);  // t=100 → tolerating
  assert.equal(a1.satisfied, 1);
  assert.equal(a2.tolerating, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Database measurements
// ═══════════════════════════════════════════════════════════════════════════

test('recordQuery aggregates per table', () => {
  const apm = freshApm();
  apm.recordQuery({ operation: 'select', table: 'users',    duration: 10, rows: 5 });
  apm.recordQuery({ operation: 'select', table: 'users',    duration: 20, rows: 3 });
  apm.recordQuery({ operation: 'insert', table: 'invoices', duration: 50, rows: 1 });
  const m = apm.getMetrics('5m');
  assert.equal(m.query.count, 3);
  assert.ok(m.query.mean > 0);
  assert.equal(apm.counters.queries_total, 3);
});

test('topSlowQueries sorts by p95 descending', () => {
  const apm = freshApm();
  // fast query (many samples)
  for (let i = 0; i < 20; i++) {
    apm.recordQuery({ operation: 'select', table: 'fast_t', duration: 1 });
  }
  // slow query with high p95
  for (let i = 0; i < 20; i++) {
    apm.recordQuery({ operation: 'select', table: 'slow_t', duration: 500 });
  }
  const top = apm.topSlowQueries(5, '5m');
  assert.ok(top.length >= 2);
  assert.equal(top[0].query, 'select:slow_t');
  assert.ok(top[0].p95 > top[top.length - 1].p95);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. External calls
// ═══════════════════════════════════════════════════════════════════════════

test('recordExternalCall tracks error counts per host', () => {
  const apm = freshApm();
  apm.recordExternalCall({ host: 'api.shoval.co.il', duration: 120, status: 200 });
  apm.recordExternalCall({ host: 'api.shoval.co.il', duration: 300, status: 502 });
  apm.recordExternalCall({ host: 'api.isracard.co.il', duration: 90, status: 200 });
  const m = apm.getMetrics('5m');
  assert.equal(m.external.count, 3);
  assert.equal(m.external.error_count, 1);
  assert.equal(apm.counters.externals_total, 3);
  assert.equal(apm.counters.externals_errors, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Cache hit/miss ratios
// ═══════════════════════════════════════════════════════════════════════════

test('cache hit ratio aggregates correctly', () => {
  const apm = freshApm();
  for (let i = 0; i < 7; i++) apm.recordCacheAccess({ key: 'k' + i, hit: true });
  for (let i = 0; i < 3; i++) apm.recordCacheAccess({ key: 'm' + i, hit: false });
  const m = apm.getMetrics('5m');
  assert.equal(m.cache.hits, 7);
  assert.equal(m.cache.misses, 3);
  assert.equal(m.cache.total, 10);
  assert.ok(Math.abs(m.cache.hit_ratio - 0.7) < 1e-9);
  assert.ok(Math.abs(m.cache.miss_ratio - 0.3) < 1e-9);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Queue wait + processing time
// ═══════════════════════════════════════════════════════════════════════════

test('recordQueue tracks both wait and process latencies', () => {
  const apm = freshApm();
  apm.recordQueue({ queue: 'emails', wait: 1000, process: 200 });
  apm.recordQueue({ queue: 'emails', wait: 2000, process: 400 });
  const m = apm.getMetrics('5m');
  assert.equal(m.queue.wait.count, 2);
  assert.equal(m.queue.process.count, 2);
  assert.equal(m.queue.wait.mean, 1500);
  assert.equal(m.queue.process.mean, 300);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Background jobs
// ═══════════════════════════════════════════════════════════════════════════

test('recordJob tracks failures and durations', () => {
  const apm = freshApm();
  apm.recordJob({ name: 'payroll-run', duration: 5000, success: true });
  apm.recordJob({ name: 'payroll-run', duration: 6000, success: false });
  apm.recordJob({ name: 'vat-export', duration: 2000, success: true });
  const m = apm.getMetrics('5m');
  assert.equal(m.job.count, 3);
  assert.equal(m.job.failures, 1);
  assert.ok(Math.abs(m.job.failure_rate - 1 / 3) < 1e-9);
  assert.equal(apm.counters.jobs_total, 3);
  assert.equal(apm.counters.jobs_failures, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Top slow routes
// ═══════════════════════════════════════════════════════════════════════════

test('topSlowRoutes returns slowest by p95 with mean + count', () => {
  const apm = freshApm();
  for (let i = 0; i < 10; i++) apm.recordRequest({ route: '/fast', duration: 10, status: 200 });
  for (let i = 0; i < 10; i++) apm.recordRequest({ route: '/slow', duration: 1200, status: 200 });
  const top = apm.topSlowRoutes(2, '5m');
  assert.equal(top.length, 2);
  assert.equal(top[0].route, 'GET /slow');
  assert.equal(top[0].count, 10);
  assert.ok(top[0].p95 > top[1].p95);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Health score 0..100
// ═══════════════════════════════════════════════════════════════════════════

test('healthScore with healthy traffic stays >= 80', () => {
  const apm = freshApm({ apdexT: 500 });
  for (let i = 0; i < 30; i++) {
    apm.recordRequest({ route: '/ok', duration: 50, status: 200 });
    apm.recordCacheAccess({ key: 'k' + i, hit: true });
  }
  const h = apm.healthScore();
  assert.ok(h.score >= 80, `expected healthy score, got ${h.score}`);
  assert.equal(h.status, 'healthy');
  assert.equal(h.label_he, 'תקין');
});

test('healthScore drops with high error rate', () => {
  const apm = freshApm({ apdexT: 500 });
  for (let i = 0; i < 30; i++) {
    apm.recordRequest({ route: '/bad', duration: 2000, status: 500 });
  }
  const h = apm.healthScore();
  assert.ok(h.score < 50, `expected critical score, got ${h.score}`);
  assert.equal(h.status, 'critical');
  assert.equal(h.label_he, 'קריטי');
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. wrapQuery — Promise-based driver
// ═══════════════════════════════════════════════════════════════════════════

test('wrapQuery times Promise-returning drivers and parses SQL', async () => {
  const apm = freshApm();
  const fakeDriver = (sql) => Promise.resolve({ rows: new Array(5), rowCount: 5 });
  const wrapped = apm.wrapQuery(fakeDriver);
  const res = await wrapped('SELECT id FROM suppliers WHERE id = 1');
  assert.equal(res.rowCount, 5);
  const m = apm.getMetrics('5m');
  assert.equal(m.query.count, 1);
});

test('wrapQuery propagates Promise rejections and still records', async () => {
  const apm = freshApm();
  const fakeDriver = (sql) => Promise.reject(new Error('fail'));
  const wrapped = apm.wrapQuery(fakeDriver);
  await assert.rejects(async () => wrapped('SELECT * FROM orders'));
  const m = apm.getMetrics('5m');
  assert.equal(m.query.count, 1);
});

test('wrapQuery times callback-based drivers', (_, done) => {
  const apm = freshApm();
  const fakeDriver = (sql, params, cb) => setImmediate(() => cb(null, { rows: [{ x: 1 }] }));
  const wrapped = apm.wrapQuery(fakeDriver);
  wrapped('SELECT 1 FROM dual', [], (err) => {
    try {
      assert.equal(err, null);
      const m = apm.getMetrics('5m');
      assert.equal(m.query.count, 1);
      done();
    } catch (e) { done(e); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. SQL parser
// ═══════════════════════════════════════════════════════════════════════════

test('parseSqlForMetrics recognises common operations + tables', () => {
  assert.deepEqual(
    _parseSqlForMetrics('SELECT * FROM suppliers WHERE id = 1'),
    { operation: 'select', table: 'suppliers' },
  );
  assert.deepEqual(
    _parseSqlForMetrics('INSERT INTO invoices (x) VALUES (1)'),
    { operation: 'insert', table: 'invoices' },
  );
  assert.deepEqual(
    _parseSqlForMetrics('UPDATE orders SET status=1 WHERE id=2'),
    { operation: 'update', table: 'orders' },
  );
  assert.deepEqual(
    _parseSqlForMetrics('DELETE FROM items WHERE id = 3'),
    { operation: 'delete', table: 'items' },
  );
  assert.deepEqual(
    _parseSqlForMetrics('WITH cte AS (SELECT 1) SELECT * FROM cte JOIN users u ON u.id = cte.id'),
    { operation: 'select', table: 'cte' },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. Bilingual labels
// ═══════════════════════════════════════════════════════════════════════════

test('i18n returns Hebrew + English labels', () => {
  assert.equal(_t('healthy', 'he'), 'תקין');
  assert.equal(_t('healthy', 'en'), 'healthy');
  assert.equal(_t('critical', 'he'), 'קריטי');
  assert.equal(_t('critical', 'en'), 'critical');
  // unknown keys return the key itself (not undefined)
  assert.equal(_t('nonexistent', 'en'), 'nonexistent');
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Integration hooks — Prometheus (X-52) + log store (X-54)
// ═══════════════════════════════════════════════════════════════════════════

test('useProm feeds http + db observations to a prom-client-compatible registry', () => {
  const apm = freshApm();
  const observed = { http: [], db: [], httpCount: 0 };
  const fakeProm = {
    metrics: {
      httpRequestDurationSeconds: {
        observe: (labels, seconds) => observed.http.push({ labels, seconds }),
      },
      httpRequestsTotal: {
        inc: () => { observed.httpCount++; },
      },
      dbQueryDurationSeconds: {
        observe: (labels, seconds) => observed.db.push({ labels, seconds }),
      },
    },
  };
  apm.useProm(fakeProm);
  apm.recordRequest({ route: '/p', method: 'POST', duration: 250, status: 201 });
  apm.recordQuery({ operation: 'select', table: 'x', duration: 10 });
  assert.equal(observed.http.length, 1);
  assert.equal(observed.httpCount, 1);
  assert.equal(observed.db.length, 1);
  // duration is converted to seconds
  assert.ok(Math.abs(observed.http[0].seconds - 0.25) < 1e-9);
});

test('useLogStore receives events with kind + payload', () => {
  const apm = freshApm();
  const entries = [];
  apm.useLogStore({ append: (e) => entries.push(e) });
  apm.recordRequest({ route: '/l', method: 'GET', duration: 12, status: 200 });
  apm.recordJob({ name: 'nightly', duration: 100, success: true });
  assert.ok(entries.length >= 2);
  const kinds = entries.map(e => e.kind);
  assert.ok(kinds.includes('http'));
  assert.ok(kinds.includes('job'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Express middleware
// ═══════════════════════════════════════════════════════════════════════════

test('apmMiddleware records request latency on res.finish', () => {
  const apm = freshApm();
  const mw = apm.apmMiddleware();

  // Fake req/res — res is an EventEmitter
  const { EventEmitter } = require('events');
  const res = new EventEmitter();
  res.statusCode = 200;
  const req = { method: 'GET', originalUrl: '/api/items?page=1', route: { path: '/api/items' }, baseUrl: '' };

  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  res.emit('finish');
  const m = apm.getMetrics('5m');
  assert.equal(m.request.count, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Memory + event-loop + CPU + GC recorders
// ═══════════════════════════════════════════════════════════════════════════

test('recordMemoryDelta / event loop / gc / cpu all flow into metrics', () => {
  const apm = freshApm();
  apm.recordMemoryDelta({ route: '/x', delta: 1024 * 256 });
  apm.recordMemoryDelta({ route: '/x', delta: 1024 * 128 });
  apm.recordEventLoopLag(15);
  apm.recordEventLoopLag(25);
  apm.recordGcPause(12, 'minor');
  apm.recordGcPause(80, 'major');
  apm.recordCpuSample(5000);
  apm.recordCpuSample(7500);
  const m = apm.getMetrics('5m');
  assert.equal(m.memory_delta.count, 2);
  assert.equal(m.event_loop_lag_ms.count, 2);
  assert.equal(m.gc_pause_ms.count, 2);
  assert.equal(m.cpu_us.count, 2);
  assert.equal(apm.counters.gc_minor, 1);
  assert.equal(apm.counters.gc_major, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. Window resolution
// ═══════════════════════════════════════════════════════════════════════════

test('getMetrics accepts window aliases 1m/5m/15m/1h/1d and raw ms', () => {
  const apm = freshApm();
  populateRequests(apm, [{ duration: 10 }]);
  for (const name of Object.keys(WINDOWS)) {
    const m = apm.getMetrics(name);
    assert.equal(m.window_ms, WINDOWS[name]);
    assert.equal(m.request.count, 1);
  }
  const mRaw = apm.getMetrics(30_000);
  assert.equal(mRaw.window_ms, 30_000);
  const mBad = apm.getMetrics('bogus');
  assert.equal(mBad.window_ms, WINDOWS['5m']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Never-throw guarantee
// ═══════════════════════════════════════════════════════════════════════════

test('recorders never throw when given garbage input', () => {
  const apm = freshApm();
  assert.doesNotThrow(() => apm.recordRequest(null));
  assert.doesNotThrow(() => apm.recordRequest({}));
  assert.doesNotThrow(() => apm.recordRequest({ duration: 'oops', status: 'nan' }));
  assert.doesNotThrow(() => apm.recordQuery(undefined));
  assert.doesNotThrow(() => apm.recordExternalCall(null));
  assert.doesNotThrow(() => apm.recordCacheAccess(null));
  assert.doesNotThrow(() => apm.recordQueue(null));
  assert.doesNotThrow(() => apm.recordJob(null));
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. Reset + snapshot
// ═══════════════════════════════════════════════════════════════════════════

test('reset clears ring buffers and counters', () => {
  const apm = freshApm();
  populateRequests(apm, [{ duration: 100 }, { duration: 200 }]);
  apm.reset();
  const m = apm.getMetrics('5m');
  assert.equal(m.request.count, 0);
  assert.equal(apm.counters.requests_total, 0);
});

test('snapshot returns a compact top-level view', () => {
  const apm = freshApm();
  populateRequests(apm, [{ duration: 100 }, { duration: 200 }]);
  const snap = apm.snapshot();
  assert.ok(snap.pid > 0);
  assert.ok(Array.isArray(snap.windows));
  assert.ok(snap.health);
  assert.ok(snap.metrics_5m);
  assert.ok(Array.isArray(snap.top_routes));
  assert.ok(Array.isArray(snap.top_queries));
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. Bounded ring memory (ringCap honoured)
// ═══════════════════════════════════════════════════════════════════════════

test('ring buffer capacity is respected across many requests', () => {
  const apm = createApm({ ringCap: 32 });
  for (let i = 0; i < 200; i++) {
    apm.recordRequest({ route: '/r', duration: i, status: 200 });
  }
  // window is generous, but the ring should cap at 32
  const m = apm.getMetrics('1d');
  assert.equal(m.request.count, 32);
  // counters, however, track cumulative totals
  assert.equal(apm.counters.requests_total, 200);
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. start/stop runtime monitors (safe)
// ═══════════════════════════════════════════════════════════════════════════

test('start/stop attaches and detaches runtime monitors without throwing', () => {
  const apm = createApm({ eventLoopSampleMs: 5, cpuSampleMs: 5 });
  assert.doesNotThrow(() => apm.start());
  assert.doesNotThrow(() => apm.stop());
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. Time-window isolation
// ═══════════════════════════════════════════════════════════════════════════

test('old samples outside the window are not counted', () => {
  const apm = freshApm();
  // Inject an ancient request directly via the ring so we do not depend on Date mocking.
  apm.requests.push({
    ts: Date.now() - 10 * 60 * 1000, // 10 minutes old
    v: 999,
    route: '/old',
    method: 'GET',
    status: 200,
    error: false,
  });
  // Recent ones
  apm.recordRequest({ route: '/new', duration: 10, status: 200 });
  const m1 = apm.getMetrics('1m');
  assert.equal(m1.request.count, 1);
  const m15 = apm.getMetrics('15m');
  assert.equal(m15.request.count, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// 25. topSlowRoutes/Queries respect limit argument
// ═══════════════════════════════════════════════════════════════════════════

test('topSlowRoutes honours the limit parameter', () => {
  const apm = freshApm();
  for (let i = 0; i < 5; i++) {
    apm.recordRequest({ route: '/r' + i, duration: 100 + i * 50, status: 200 });
  }
  const top = apm.topSlowRoutes(2, '5m');
  assert.equal(top.length, 2);
});

test('topSlowQueries honours the limit parameter', () => {
  const apm = freshApm();
  for (let i = 0; i < 5; i++) {
    apm.recordQuery({ operation: 'select', table: 't' + i, duration: 10 + i });
  }
  const top = apm.topSlowQueries(3, '5m');
  assert.equal(top.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════════
// 26. Integration hook failure isolation
// ═══════════════════════════════════════════════════════════════════════════

test('useProm / useLogStore sinks that throw do not break recorders', () => {
  const apm = freshApm();
  apm.useProm({
    metrics: {
      httpRequestDurationSeconds: { observe: () => { throw new Error('boom'); } },
      httpRequestsTotal: { inc: () => { throw new Error('boom'); } },
      dbQueryDurationSeconds: { observe: () => { throw new Error('boom'); } },
    },
  });
  apm.useLogStore({ append: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => {
    apm.recordRequest({ route: '/x', duration: 10, status: 200 });
    apm.recordQuery({ operation: 'select', table: 'x', duration: 1 });
    apm.recordJob({ name: 'x', duration: 5, success: true });
  });
  const m = apm.getMetrics('5m');
  assert.equal(m.request.count, 1);
  assert.equal(m.query.count, 1);
  assert.equal(m.job.count, 1);
});
