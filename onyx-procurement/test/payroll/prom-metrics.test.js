/**
 * Unit tests for Prometheus /metrics exporter (prom-metrics.js)
 * בדיקות יחידה למייצא Prometheus
 *
 * Agent-X52 — Swarm 3 — Techno-Kol Uzi ERP
 *
 * Run: node --test test/payroll/prom-metrics.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRegistry,
  collectDefaultMetrics,
  registerErpMetrics,
  metricsEndpoint,
  Registry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  Info,
  DEFAULT_BUCKETS,
  DEFAULT_QUANTILES,
  CONTENT_TYPE,
  _internals,
} = require('../../src/ops/prom-metrics');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(body) { this.body = body; return this; },
    end(body) { if (body != null) this.body = body; return this; },
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. Registry factory
// ---------------------------------------------------------------------------
test('createRegistry returns a Registry instance with empty metrics', () => {
  const reg = createRegistry();
  assert.ok(reg instanceof Registry);
  assert.equal(reg.metricsByName.size, 0);
});

// ---------------------------------------------------------------------------
// 2. Registry contentType
// ---------------------------------------------------------------------------
test('registry.contentType returns Prometheus v0.0.4 content type', () => {
  const reg = createRegistry();
  assert.ok(/text\/plain/.test(reg.contentType()));
  assert.ok(/version=0\.0\.4/.test(reg.contentType()));
  assert.equal(reg.contentType(), CONTENT_TYPE);
});

// ---------------------------------------------------------------------------
// 3. Counter — basic increment
// ---------------------------------------------------------------------------
test('counter increments monotonically', () => {
  const reg = createRegistry();
  const c = reg.counter('widgets_total', 'Total widgets');
  c.inc();
  c.inc();
  c.inc(3);
  assert.equal(c.get(), 5);
});

// ---------------------------------------------------------------------------
// 4. Counter — rejects negative values
// ---------------------------------------------------------------------------
test('counter rejects negative increments', () => {
  const reg = createRegistry();
  const c = reg.counter('errors_total', 'Errors');
  assert.throws(() => c.inc(-1), /cannot decrease/);
});

// ---------------------------------------------------------------------------
// 5. Counter — rejects non-finite values
// ---------------------------------------------------------------------------
test('counter rejects NaN / Infinity', () => {
  const reg = createRegistry();
  const c = reg.counter('thing_total', 'Things');
  assert.throws(() => c.inc(Number.NaN));
  assert.throws(() => c.inc(Number.POSITIVE_INFINITY));
});

// ---------------------------------------------------------------------------
// 6. Counter — labels partition values
// ---------------------------------------------------------------------------
test('counter labels create separate series', () => {
  const reg = createRegistry();
  const c = reg.counter('http_requests_total', 'HTTP requests', ['method', 'status']);
  c.inc(1, { method: 'GET', status: '200' });
  c.inc(1, { method: 'GET', status: '200' });
  c.inc(1, { method: 'POST', status: '500' });
  assert.equal(c.get({ method: 'GET', status: '200' }), 2);
  assert.equal(c.get({ method: 'POST', status: '500' }), 1);
});

// ---------------------------------------------------------------------------
// 7. Counter — reset()
// ---------------------------------------------------------------------------
test('counter reset clears all values', () => {
  const reg = createRegistry();
  const c = reg.counter('thing_total', 'Things');
  c.inc(5);
  c.reset();
  assert.equal(c.get(), 0);
});

// ---------------------------------------------------------------------------
// 8. Counter — render output format
// ---------------------------------------------------------------------------
test('counter render produces HELP + TYPE + sample', () => {
  const reg = createRegistry();
  const c = reg.counter('foo_total', 'A foo');
  c.inc(7);
  const out = reg.collect();
  assert.match(out, /# HELP foo_total A foo/);
  assert.match(out, /# TYPE foo_total counter/);
  assert.match(out, /foo_total 7/);
});

// ---------------------------------------------------------------------------
// 9. Gauge — set / inc / dec
// ---------------------------------------------------------------------------
test('gauge supports set, inc, dec', () => {
  const reg = createRegistry();
  const g = reg.gauge('temperature', 'Temperature');
  g.set(20);
  assert.equal(g.get(), 20);
  g.inc(5);
  assert.equal(g.get(), 25);
  g.dec(10);
  assert.equal(g.get(), 15);
});

// ---------------------------------------------------------------------------
// 10. Gauge — accepts negative values (unlike counter)
// ---------------------------------------------------------------------------
test('gauge accepts negative values', () => {
  const reg = createRegistry();
  const g = reg.gauge('balance', 'Balance');
  g.set(-42);
  assert.equal(g.get(), -42);
});

// ---------------------------------------------------------------------------
// 11. Gauge — with labels
// ---------------------------------------------------------------------------
test('gauge with labels partitions values', () => {
  const reg = createRegistry();
  const g = reg.gauge('queue_size', 'Queue size', ['queue']);
  g.set(5, { queue: 'email' });
  g.set(12, { queue: 'sms' });
  assert.equal(g.get({ queue: 'email' }), 5);
  assert.equal(g.get({ queue: 'sms' }), 12);
});

// ---------------------------------------------------------------------------
// 12. Histogram — observe + buckets
// ---------------------------------------------------------------------------
test('histogram observations populate buckets', () => {
  const reg = createRegistry();
  const h = reg.histogram('latency_seconds', 'Latency', [0.1, 0.5, 1, 5]);
  h.observe(0.05); // in 0.1, 0.5, 1, 5
  h.observe(0.3);  // in 0.5, 1, 5
  h.observe(2);    // in 5
  h.observe(10);   // in +Inf only
  const out = reg.collect();
  // bucket le="0.1" should have count 1
  assert.match(out, /latency_seconds_bucket\{le="0\.1"\} 1/);
  // bucket le="0.5" should have count 2
  assert.match(out, /latency_seconds_bucket\{le="0\.5"\} 2/);
  // bucket le="1" should have count 2
  assert.match(out, /latency_seconds_bucket\{le="1"\} 2/);
  // bucket le="5" should have count 3
  assert.match(out, /latency_seconds_bucket\{le="5"\} 3/);
  // bucket le="+Inf" should have count 4
  assert.match(out, /latency_seconds_bucket\{le="\+Inf"\} 4/);
  // _count
  assert.match(out, /latency_seconds_count 4/);
  // _sum 0.05 + 0.3 + 2 + 10 = 12.35
  assert.match(out, /latency_seconds_sum 12\.35/);
});

// ---------------------------------------------------------------------------
// 13. Histogram — startTimer returns usable end function
// ---------------------------------------------------------------------------
test('histogram startTimer measures elapsed seconds', async () => {
  const reg = createRegistry();
  const h = reg.histogram('op_duration_seconds', 'Op duration', DEFAULT_BUCKETS);
  const end = h.startTimer();
  await new Promise((r) => setTimeout(r, 15));
  const seconds = end();
  assert.ok(seconds >= 0.01, `expected >=0.01s, got ${seconds}`);
  const out = reg.collect();
  assert.match(out, /op_duration_seconds_count 1/);
});

// ---------------------------------------------------------------------------
// 14. Histogram — with labels
// ---------------------------------------------------------------------------
test('histogram with labels produces labelled bucket lines', () => {
  const reg = createRegistry();
  const h = reg.histogram(
    'db_query_seconds',
    'DB query duration',
    [0.1, 1],
    ['operation', 'table']
  );
  h.observe(0.05, { operation: 'select', table: 'users' });
  h.observe(0.5, { operation: 'select', table: 'users' });
  const out = reg.collect();
  assert.match(out, /db_query_seconds_bucket\{operation="select",table="users",le="0\.1"\} 1/);
  assert.match(out, /db_query_seconds_bucket\{operation="select",table="users",le="1"\} 2/);
});

// ---------------------------------------------------------------------------
// 15. Summary — quantile estimates
// ---------------------------------------------------------------------------
test('summary produces quantile estimates', () => {
  const reg = createRegistry();
  const s = reg.summary('req_seconds', 'Requests', [0.5, 0.9, 0.99]);
  for (let i = 1; i <= 100; i++) s.observe(i);
  const out = reg.collect();
  assert.match(out, /# TYPE req_seconds summary/);
  assert.match(out, /req_seconds\{quantile="0\.5"\}/);
  assert.match(out, /req_seconds\{quantile="0\.9"\}/);
  assert.match(out, /req_seconds\{quantile="0\.99"\}/);
  assert.match(out, /req_seconds_count 100/);
});

// ---------------------------------------------------------------------------
// 16. Summary — out-of-range quantile throws
// ---------------------------------------------------------------------------
test('summary rejects quantile outside [0,1]', () => {
  const reg = createRegistry();
  assert.throws(
    () => reg.summary('bad', 'bad', [1.5]),
    /quantile/
  );
});

// ---------------------------------------------------------------------------
// 17. Info — labels-only with value 1
// ---------------------------------------------------------------------------
test('info metric renders as gauge with value 1', () => {
  const reg = createRegistry();
  reg.info('app_build_info', 'Build info', { version: '1.0.0', commit: 'abc' });
  const out = reg.collect();
  assert.match(out, /# TYPE app_build_info gauge/);
  assert.match(out, /app_build_info\{version="1\.0\.0",commit="abc"\} 1/);
});

// ---------------------------------------------------------------------------
// 18. Registry — collect() produces newline-terminated text
// ---------------------------------------------------------------------------
test('registry.collect text ends with newline', () => {
  const reg = createRegistry();
  const c = reg.counter('x_total', 'X');
  c.inc();
  const out = reg.collect();
  assert.ok(out.endsWith('\n'));
});

// ---------------------------------------------------------------------------
// 19. Registry — duplicate register throws
// ---------------------------------------------------------------------------
test('duplicate metric registration throws', () => {
  const reg = createRegistry();
  reg.counter('dup_total', 'Dup');
  assert.throws(() => reg.counter('dup_total', 'Dup'), /already registered/);
});

// ---------------------------------------------------------------------------
// 20. Invalid metric name rejected
// ---------------------------------------------------------------------------
test('invalid metric names are rejected', () => {
  const reg = createRegistry();
  assert.throws(() => reg.counter('0bad', 'bad'));
  assert.throws(() => reg.counter('with space', 'bad'));
  assert.throws(() => reg.counter('has-dash', 'bad'));
});

// ---------------------------------------------------------------------------
// 21. Invalid label name rejected
// ---------------------------------------------------------------------------
test('invalid label names are rejected', () => {
  const reg = createRegistry();
  assert.throws(() => reg.counter('ok_total', 'ok', ['0bad']));
  assert.throws(() => reg.counter('ok2_total', 'ok', ['__reserved']));
});

// ---------------------------------------------------------------------------
// 22. collectDefaultMetrics registers the required process metrics
// ---------------------------------------------------------------------------
test('collectDefaultMetrics registers the documented process metrics', () => {
  const reg = createRegistry();
  collectDefaultMetrics(reg);
  const expected = [
    'process_cpu_user_seconds_total',
    'process_cpu_system_seconds_total',
    'process_resident_memory_bytes',
    'process_heap_bytes',
    'process_open_fds',
    'process_start_time_seconds',
    'nodejs_eventloop_lag_seconds',
    'nodejs_active_handles',
    'nodejs_active_requests',
  ];
  for (const name of expected) {
    assert.ok(reg.get(name), `expected ${name} to be registered`);
  }
  const out = reg.collect();
  for (const name of expected) {
    assert.match(out, new RegExp(`# TYPE ${name.replace(/\+/g, '\\+')}`));
  }
});

// ---------------------------------------------------------------------------
// 23. registerErpMetrics exposes all ERP seed metrics
// ---------------------------------------------------------------------------
test('registerErpMetrics exposes documented ERP seed metrics', () => {
  const reg = createRegistry();
  const erp = registerErpMetrics(reg);
  assert.ok(erp.httpRequestsTotal instanceof Counter);
  assert.ok(erp.httpRequestDurationSeconds instanceof Histogram);
  assert.ok(erp.invoicesCreatedTotal instanceof Counter);
  assert.ok(erp.wageSlipsGeneratedTotal instanceof Counter);
  assert.ok(erp.dbQueryDurationSeconds instanceof Histogram);
  assert.ok(erp.queueSize instanceof Gauge);
  assert.ok(erp.cacheHitsTotal instanceof Counter);
  assert.ok(erp.cacheMissesTotal instanceof Counter);
});

// ---------------------------------------------------------------------------
// 24. ERP HTTP metrics end-to-end
// ---------------------------------------------------------------------------
test('ERP HTTP metrics increment and show up in collect()', () => {
  const reg = createRegistry();
  const erp = registerErpMetrics(reg);
  erp.httpRequestsTotal.inc(1, { method: 'GET', route: '/api/users', status: '200' });
  erp.httpRequestsTotal.inc(1, { method: 'POST', route: '/api/users', status: '201' });
  const out = reg.collect();
  assert.match(out, /erp_http_requests_total\{method="GET",route="\/api\/users",status="200"\} 1/);
  assert.match(out, /erp_http_requests_total\{method="POST",route="\/api\/users",status="201"\} 1/);
});

// ---------------------------------------------------------------------------
// 25. ERP invoices + wage slips counters
// ---------------------------------------------------------------------------
test('ERP invoices and wage slips counters work', () => {
  const reg = createRegistry();
  const erp = registerErpMetrics(reg);
  erp.invoicesCreatedTotal.inc(3);
  erp.wageSlipsGeneratedTotal.inc(17);
  const out = reg.collect();
  assert.match(out, /erp_invoices_created_total 3/);
  assert.match(out, /erp_wage_slips_generated_total 17/);
});

// ---------------------------------------------------------------------------
// 26. ERP cache ratio
// ---------------------------------------------------------------------------
test('ERP cache hits + misses counters', () => {
  const reg = createRegistry();
  const erp = registerErpMetrics(reg);
  erp.cacheHitsTotal.inc(80);
  erp.cacheMissesTotal.inc(20);
  assert.equal(erp.cacheHitsTotal.get(), 80);
  assert.equal(erp.cacheMissesTotal.get(), 20);
});

// ---------------------------------------------------------------------------
// 27. metricsEndpoint middleware responds 200 + text body
// ---------------------------------------------------------------------------
test('metricsEndpoint serves a 200 with correct content-type and body', () => {
  const reg = createRegistry();
  const c = reg.counter('m_total', 'M');
  c.inc(4);
  const handler = metricsEndpoint(reg);
  const res = makeMockRes();
  handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], CONTENT_TYPE);
  assert.match(res.body, /m_total 4/);
});

// ---------------------------------------------------------------------------
// 28. metricsEndpoint missing registry throws
// ---------------------------------------------------------------------------
test('metricsEndpoint throws without a registry', () => {
  assert.throws(() => metricsEndpoint(null), /registry/);
});

// ---------------------------------------------------------------------------
// 29. Label value escaping
// ---------------------------------------------------------------------------
test('label values are properly escaped in text output', () => {
  const reg = createRegistry();
  const c = reg.counter('esc_total', 'Escaping', ['path']);
  c.inc(1, { path: 'line\n"quote"\\back' });
  const out = reg.collect();
  // Must contain escaped newline, quote, backslash
  assert.ok(out.includes('\\n'));
  assert.ok(out.includes('\\"'));
  assert.ok(out.includes('\\\\'));
});

// ---------------------------------------------------------------------------
// 30. Default buckets are ascending
// ---------------------------------------------------------------------------
test('DEFAULT_BUCKETS are sorted ascending', () => {
  for (let i = 1; i < DEFAULT_BUCKETS.length; i++) {
    assert.ok(DEFAULT_BUCKETS[i] > DEFAULT_BUCKETS[i - 1]);
  }
});

// ---------------------------------------------------------------------------
// 31. Internal canonicalLabelKey stability
// ---------------------------------------------------------------------------
test('canonicalLabelKey is stable regardless of object key order', () => {
  const names = ['method', 'status'];
  const k1 = _internals.canonicalLabelKey({ method: 'GET', status: '200' }, names);
  const k2 = _internals.canonicalLabelKey({ status: '200', method: 'GET' }, names);
  assert.equal(k1, k2);
});

// ---------------------------------------------------------------------------
// 32. Full round-trip with default + ERP + custom
// ---------------------------------------------------------------------------
test('full round-trip: default + ERP + custom metrics all appear in output', () => {
  const reg = createRegistry();
  collectDefaultMetrics(reg);
  const erp = registerErpMetrics(reg);
  const custom = reg.counter('tenant_custom_total', 'Custom tenant metric');
  custom.inc(42);
  erp.queueSize.set(9, { queue: 'payroll' });
  const out = reg.collect();
  assert.match(out, /process_resident_memory_bytes/);
  assert.match(out, /nodejs_active_handles/);
  assert.match(out, /erp_queue_size\{queue="payroll"\} 9/);
  assert.match(out, /tenant_custom_total 42/);
  // Must end with a single newline
  assert.ok(out.endsWith('\n'));
});
