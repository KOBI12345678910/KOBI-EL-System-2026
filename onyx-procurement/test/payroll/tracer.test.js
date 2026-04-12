/**
 * Distributed Tracer — Unit Tests / בדיקות יחידה למערכת המעקב
 * Agent X-53 — Swarm 3D — 2026-04-11
 *
 * Run with:   node --test test/payroll/tracer.test.js
 *
 * Covers:
 *   1.  ID generation: trace (128-bit) + span (64-bit), hex, unique
 *   2.  createTracer exposes service name & version
 *   3.  startSpan creates root span with new trace id
 *   4.  startSpan inherits trace id from active span (parent-child)
 *   5.  withSpan installs current span; getCurrentSpan resolves it
 *   6.  setAttribute / setAttributes stored on span
 *   7.  addEvent appends timestamped event
 *   8.  setStatus accepts OK / ERROR with message, rejects junk
 *   9.  recordException captures exception.* fields and flips to ERROR
 *   10. span.end() sets duration; subsequent mutations are no-ops
 *   11. Span kind: INTERNAL default; SERVER/CLIENT/PRODUCER/CONSUMER accepted
 *   12. parseTraceparent — valid header, invalid variants
 *   13. formatTraceparent — canonical serialization
 *   14. extractContext / injectContext round-trip
 *   15. Baggage parse + format round-trip (incl. encoding)
 *   16. Sampling: rate 0 never samples; rate 1 always samples
 *   17. Head sampler honors OTEL_SAMPLE_RATE env
 *   18. tail sampler can override head decision
 *   19. console exporter writes JSON lines
 *   20. OTLP HTTP exporter posts payload to collector (real http server)
 *   21. traceMiddleware (Express) — creates SERVER span, ends on finish
 *   22. wrapFetch auto-instruments outbound call + injects traceparent
 *   23. wrapDbQuery records SQL + rows_affected
 *   24. instrumentWageSlip creates payroll.wage_slip.generate span
 *   25. instrumentPdfGeneration records pdf.size_bytes
 *   26. Tracer#flush drains and dispatches through exporters
 *   27. Error path: tracer never throws when host code explodes
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

const tracerMod = require(path.resolve(
  __dirname, '..', '..', 'src', 'ops', 'tracer.js'
));

const {
  createTracer,
  getCurrentSpan,
  extractContext,
  injectContext,
  parseTraceparent,
  formatTraceparent,
  parseBaggage,
  formatBaggage,
  generateTraceId,
  generateSpanId,
  headSample,
  defaultSampleRate,
  consoleExporter,
  otlpHttpExporter,
  traceMiddleware,
  wrapFetch,
  wrapDbQuery,
  instrumentWageSlip,
  instrumentPdfGeneration,
  instrumentDbQuery,
  SPAN_KIND,
  SPAN_STATUS,
  FLAG_SAMPLED,
} = tracerMod;

// ─────────────────────────────────────────────────────────────
// Helpers / עזרים
// ─────────────────────────────────────────────────────────────

function mkTracer(opts) {
  return createTracer('onyx-procurement', '1.0.0', Object.assign({
    sampleRate: 1.0, // deterministic for tests
  }, opts || {}));
}

// ─────────────────────────────────────────────────────────────
// 1. ID generation
// ─────────────────────────────────────────────────────────────
test('1. generateTraceId / generateSpanId return hex IDs of correct length', () => {
  const t1 = generateTraceId();
  const t2 = generateTraceId();
  const s1 = generateSpanId();
  const s2 = generateSpanId();
  assert.equal(t1.length, 32, 'traceId must be 32 hex chars = 128 bits');
  assert.equal(s1.length, 16, 'spanId must be 16 hex chars = 64 bits');
  assert.match(t1, /^[0-9a-f]{32}$/);
  assert.match(s1, /^[0-9a-f]{16}$/);
  assert.notEqual(t1, t2, 'trace IDs must differ');
  assert.notEqual(s1, s2, 'span IDs must differ');
});

// ─────────────────────────────────────────────────────────────
// 2. createTracer
// ─────────────────────────────────────────────────────────────
test('2. createTracer exposes service name and version', () => {
  const t = createTracer('techno-kol', '2026.04.11');
  assert.equal(t.serviceName, 'techno-kol');
  assert.equal(t.serviceVersion, '2026.04.11');
});

// ─────────────────────────────────────────────────────────────
// 3. startSpan root
// ─────────────────────────────────────────────────────────────
test('3. startSpan with no parent creates a root span', () => {
  const t = mkTracer();
  const span = t.startSpan('root-op');
  assert.ok(span);
  assert.equal(span.name, 'root-op');
  assert.equal(span.parentSpanId, null);
  assert.equal(span.traceId.length, 32);
  assert.equal(span.spanId.length, 16);
  assert.equal(span.kind, SPAN_KIND.INTERNAL);
  span.end();
});

// ─────────────────────────────────────────────────────────────
// 4. parent-child inheritance
// ─────────────────────────────────────────────────────────────
test('4. child span inherits trace id and links to parent', () => {
  const t = mkTracer();
  const parent = t.startSpan('parent');
  let child;
  t.withSpan(parent, () => {
    child = t.startSpan('child');
  });
  assert.equal(child.traceId, parent.traceId);
  assert.equal(child.parentSpanId, parent.spanId);
  assert.notEqual(child.spanId, parent.spanId);
  child.end();
  parent.end();
});

// ─────────────────────────────────────────────────────────────
// 5. withSpan / getCurrentSpan
// ─────────────────────────────────────────────────────────────
test('5. withSpan installs current span; getCurrentSpan resolves inside', () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  assert.equal(getCurrentSpan(), null, 'outside withSpan there is no active span');
  t.withSpan(s, () => {
    assert.equal(getCurrentSpan(), s);
  });
  assert.equal(getCurrentSpan(), null);
  s.end();
});

// ─────────────────────────────────────────────────────────────
// 6. setAttribute / setAttributes
// ─────────────────────────────────────────────────────────────
test('6. setAttribute and setAttributes accumulate on the span', () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  s.setAttribute('user.id', 42);
  s.setAttributes({ 'http.method': 'GET', 'http.url': '/x' });
  assert.equal(s.attributes['user.id'], 42);
  assert.equal(s.attributes['http.method'], 'GET');
  assert.equal(s.attributes['http.url'], '/x');
  s.end();
});

// ─────────────────────────────────────────────────────────────
// 7. addEvent
// ─────────────────────────────────────────────────────────────
test('7. addEvent appends timestamped event with attrs', () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  s.addEvent('cache.miss', { key: 'invoice:42' });
  s.addEvent('retry', { attempt: 2 });
  assert.equal(s.events.length, 2);
  assert.equal(s.events[0].name, 'cache.miss');
  assert.equal(s.events[0].attributes.key, 'invoice:42');
  assert.equal(typeof s.events[0].time, 'number');
  s.end();
});

// ─────────────────────────────────────────────────────────────
// 8. setStatus
// ─────────────────────────────────────────────────────────────
test('8. setStatus accepts OK/ERROR and rejects garbage', () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  s.setStatus('OK');
  assert.equal(s.status.code, 'OK');
  s.setStatus('ERROR', 'boom');
  assert.equal(s.status.code, 'ERROR');
  assert.equal(s.status.message, 'boom');
  s.setStatus('NOT_A_STATUS');
  assert.equal(s.status.code, 'ERROR', 'garbage ignored');
  s.end();
});

// ─────────────────────────────────────────────────────────────
// 9. recordException
// ─────────────────────────────────────────────────────────────
test('9. recordException stores exception.* event and flips to ERROR', () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  s.recordException(new Error('disk full'));
  const ev = s.events.find(e => e.name === 'exception');
  assert.ok(ev, 'exception event present');
  assert.equal(ev.attributes['exception.type'], 'Error');
  assert.equal(ev.attributes['exception.message'], 'disk full');
  assert.equal(s.status.code, 'ERROR');
  s.end();
});

// ─────────────────────────────────────────────────────────────
// 10. end() + frozen
// ─────────────────────────────────────────────────────────────
test('10. span.end() computes duration and freezes mutations', async () => {
  const t = mkTracer();
  const s = t.startSpan('op');
  await new Promise((r) => setTimeout(r, 10));
  s.end();
  assert.ok(s.durationMs >= 5, 'duration must reflect elapsed time');
  assert.equal(s.ended, true);
  // Post-end mutations silently ignored
  s.setAttribute('late', true);
  assert.equal(s.attributes['late'], undefined);
});

// ─────────────────────────────────────────────────────────────
// 11. Span kind
// ─────────────────────────────────────────────────────────────
test('11. Span kind: defaults INTERNAL, accepts all OTLP kinds', () => {
  const t = mkTracer();
  for (const k of ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER']) {
    const s = t.startSpan('k', { kind: k });
    assert.equal(s.kind, k);
    s.end();
  }
  // bogus kinds fall back to INTERNAL
  const bogus = t.startSpan('b', { kind: 'WEIRD' });
  assert.equal(bogus.kind, SPAN_KIND.INTERNAL);
  bogus.end();
});

// ─────────────────────────────────────────────────────────────
// 12. parseTraceparent
// ─────────────────────────────────────────────────────────────
test('12. parseTraceparent — valid and invalid headers', () => {
  const good = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
  const ctx = parseTraceparent(good);
  assert.ok(ctx);
  assert.equal(ctx.traceId, '0af7651916cd43dd8448eb211c80319c');
  assert.equal(ctx.spanId,  'b7ad6b7169203331');
  assert.equal(ctx.sampled, true);

  assert.equal(parseTraceparent(''), null);
  assert.equal(parseTraceparent('junk'), null);
  assert.equal(parseTraceparent('ff-' + '0'.repeat(32) + '-' + '0'.repeat(16) + '-01'), null,
    'version ff forbidden');
  // all-zero trace id forbidden
  assert.equal(parseTraceparent('00-' + '0'.repeat(32) + '-b7ad6b7169203331-01'), null);
});

// ─────────────────────────────────────────────────────────────
// 13. formatTraceparent
// ─────────────────────────────────────────────────────────────
test('13. formatTraceparent produces canonical value', () => {
  const tid = '0af7651916cd43dd8448eb211c80319c';
  const sid = 'b7ad6b7169203331';
  assert.equal(formatTraceparent(tid, sid, 1), `00-${tid}-${sid}-01`);
  assert.equal(formatTraceparent(tid, sid, 0), `00-${tid}-${sid}-00`);
});

// ─────────────────────────────────────────────────────────────
// 14. extractContext / injectContext round-trip
// ─────────────────────────────────────────────────────────────
test('14. extractContext + injectContext round-trip headers', () => {
  const t = mkTracer();
  const parent = t.startSpan('server-handler', { kind: SPAN_KIND.SERVER });
  const outbound = {};
  injectContext(outbound, {
    traceId: parent.traceId,
    spanId:  parent.spanId,
    sampled: true,
  });
  assert.ok(outbound.traceparent);

  // Simulate receiving the header on the other side
  const extracted = extractContext({ traceparent: outbound.traceparent });
  assert.equal(extracted.traceId, parent.traceId);
  assert.equal(extracted.spanId,  parent.spanId);
  assert.equal(extracted.sampled, true);

  parent.end();
});

// ─────────────────────────────────────────────────────────────
// 15. Baggage round-trip
// ─────────────────────────────────────────────────────────────
test('15. baggage header parse + format round-trip (with encoding)', () => {
  const obj = { tenant: 'techno-kol', locale: 'he-IL', 'user id': '42' };
  const header = formatBaggage(obj);
  assert.ok(header.length > 0);
  const back = parseBaggage(header);
  assert.equal(back.tenant, 'techno-kol');
  assert.equal(back.locale, 'he-IL');
  assert.equal(back['user id'], '42');
  // Metadata after ; is ignored
  assert.deepEqual(parseBaggage('x=1;meta=foo,y=2'), { x: '1', y: '2' });
  assert.deepEqual(parseBaggage(''), {});
});

// ─────────────────────────────────────────────────────────────
// 16. Sampling rates 0 and 1
// ─────────────────────────────────────────────────────────────
test('16. head sampler: rate 0 never samples, rate 1 always samples', () => {
  for (let i = 0; i < 200; i++) {
    assert.equal(headSample(0), false);
    assert.equal(headSample(1), true);
  }
});

// ─────────────────────────────────────────────────────────────
// 17. Default sample rate from env
// ─────────────────────────────────────────────────────────────
test('17. defaultSampleRate honors OTEL_SAMPLE_RATE and NODE_ENV', () => {
  const origRate = process.env.OTEL_SAMPLE_RATE;
  const origEnv  = process.env.NODE_ENV;
  try {
    process.env.OTEL_SAMPLE_RATE = '0.42';
    assert.equal(defaultSampleRate(), 0.42);
    delete process.env.OTEL_SAMPLE_RATE;
    process.env.NODE_ENV = 'production';
    assert.equal(defaultSampleRate(), 0.10);
    process.env.NODE_ENV = 'development';
    assert.equal(defaultSampleRate(), 1.00);
  } finally {
    if (origRate === undefined) delete process.env.OTEL_SAMPLE_RATE;
    else process.env.OTEL_SAMPLE_RATE = origRate;
    if (origEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origEnv;
  }
});

// ─────────────────────────────────────────────────────────────
// 18. Tail sampler override
// ─────────────────────────────────────────────────────────────
test('18. tail sampler can override head decision', () => {
  // Head says "don't sample" (rate 0) but tail says "always export"
  const t = createTracer('svc', '1', { sampleRate: 0 });
  t.registerTailSampler((span) => span.attributes['force'] === true);
  const dropped = t.startSpan('dropped');
  dropped.end();
  const kept = t.startSpan('kept');
  kept.setAttribute('force', true);
  kept.end();
  const finished = t.drain();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].name, 'kept');
});

// ─────────────────────────────────────────────────────────────
// 19. Console exporter
// ─────────────────────────────────────────────────────────────
test('19. console exporter writes JSON lines to the supplied stream', () => {
  const lines = [];
  const fakeStream = { write: (s) => { lines.push(s); return true; } };
  const t = mkTracer({ exporters: [consoleExporter({ stream: fakeStream })] });
  const s = t.startSpan('op');
  s.setAttribute('x', 1);
  s.end();
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.name, 'op');
  assert.equal(parsed.attributes.x, 1);
  assert.ok(parsed.traceId);
});

// ─────────────────────────────────────────────────────────────
// 20. OTLP HTTP exporter (real loopback server)
// ─────────────────────────────────────────────────────────────
test('20. OTLP HTTP exporter POSTs JSON to the collector endpoint', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body });
      res.writeHead(200);
      res.end('ok');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const url  = `http://127.0.0.1:${addr.port}/v1/traces`;
  try {
    const exporter = otlpHttpExporter(url);
    const t = mkTracer({ exporters: [exporter] });
    const s = t.startSpan('remote-call');
    s.end();
    await t.flush();
    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'POST');
    assert.equal(received[0].url, '/v1/traces');
    const payload = JSON.parse(received[0].body);
    assert.ok(Array.isArray(payload.resourceSpans));
    assert.equal(payload.resourceSpans[0].name, 'remote-call');
  } finally {
    server.close();
  }
});

// ─────────────────────────────────────────────────────────────
// 21. traceMiddleware (Express)
// ─────────────────────────────────────────────────────────────
test('21. traceMiddleware creates SERVER span and ends on res.finish', async () => {
  const t = mkTracer();
  const mw = traceMiddleware(t);
  const listeners = {};
  const req = {
    method: 'GET',
    url:    '/invoices/42',
    originalUrl: '/invoices/42',
    headers: { 'user-agent': 'ava/1' },
    ip: '1.2.3.4',
  };
  const res = {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    on(event, fn) { listeners[event] = fn; },
  };
  await new Promise((resolve) => {
    mw(req, res, () => {
      const active = getCurrentSpan();
      assert.ok(active, 'span must be active during handler');
      assert.equal(active.kind, SPAN_KIND.SERVER);
      assert.equal(active.attributes['http.method'], 'GET');
      assert.match(res._headers.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
      // Simulate response finishing
      listeners.finish();
      resolve();
    });
  });
  const finished = t.drain();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].attributes['http.status_code'], 200);
  assert.equal(finished[0].status.code, 'OK');
});

// ─────────────────────────────────────────────────────────────
// 22. wrapFetch
// ─────────────────────────────────────────────────────────────
test('22. wrapFetch instruments outbound call and injects traceparent', async () => {
  const t = mkTracer();
  let capturedHeaders = null;
  const fakeFetch = async (url, init) => {
    capturedHeaders = init && init.headers;
    return { status: 200, url };
  };
  const fetchT = wrapFetch(t, fakeFetch);
  const res = await fetchT('https://api.example/pong', { method: 'GET' });
  assert.equal(res.status, 200);
  assert.ok(capturedHeaders && capturedHeaders.traceparent,
    'traceparent must be injected into outbound headers');
  const finished = t.drain();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].kind, SPAN_KIND.CLIENT);
  assert.equal(finished[0].attributes['http.status_code'], 200);
  assert.equal(finished[0].status.code, 'OK');
});

// ─────────────────────────────────────────────────────────────
// 23. wrapDbQuery
// ─────────────────────────────────────────────────────────────
test('23. wrapDbQuery records SQL statement and rows_affected', async () => {
  const t = mkTracer();
  const fakeQuery = async (sql, params) => ({
    rows: [{ id: 1 }, { id: 2 }],
    rowCount: 2,
  });
  const runT = wrapDbQuery(t, fakeQuery);
  const result = await runT('SELECT * FROM invoices WHERE vendor_id = ?', [7]);
  assert.equal(result.rowCount, 2);
  const finished = t.drain();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].attributes['db.statement'],
    'SELECT * FROM invoices WHERE vendor_id = ?');
  assert.equal(finished[0].attributes['db.params.count'], 1);
  assert.equal(finished[0].attributes['db.rows_affected'], 2);
});

// ─────────────────────────────────────────────────────────────
// 24. instrumentWageSlip
// ─────────────────────────────────────────────────────────────
test('24. instrumentWageSlip creates payroll span and records totals', async () => {
  const t = mkTracer();
  const gen = async (emp, period) => ({ id: 'slip-1', gross: 10000, net: 7500 });
  const genT = instrumentWageSlip(t, gen);
  const slip = await genT(
    { id: 'E-77', name: 'עובדת בדיקה' },
    { start: '2026-04-01', end: '2026-04-30' }
  );
  assert.equal(slip.gross, 10000);
  const finished = t.drain();
  assert.equal(finished.length, 1);
  const span = finished[0];
  assert.equal(span.name, 'payroll.wage_slip.generate');
  assert.equal(span.attributes['payroll.employee_id'], 'E-77');
  assert.equal(span.attributes['payroll.gross'], 10000);
  assert.equal(span.attributes['payroll.net'], 7500);
  assert.equal(span.status.code, 'OK');
});

// ─────────────────────────────────────────────────────────────
// 25. instrumentPdfGeneration
// ─────────────────────────────────────────────────────────────
test('25. instrumentPdfGeneration records pdf.size_bytes', async () => {
  const t = mkTracer();
  const pdfGen = async (doc) => ({ bytes: Buffer.from('%PDF-1.4 fake') });
  const pdfGenT = instrumentPdfGeneration(t, pdfGen);
  const out = await pdfGenT({ kind: 'wage-slip', id: 'slip-1' });
  assert.ok(out.bytes.length > 0);
  const finished = t.drain();
  assert.equal(finished.length, 1);
  const span = finished[0];
  assert.equal(span.name, 'pdf.generate');
  assert.equal(span.attributes['pdf.kind'], 'wage-slip');
  assert.equal(span.attributes['pdf.size_bytes'], out.bytes.length);
});

// ─────────────────────────────────────────────────────────────
// 26. flush dispatches through exporters
// ─────────────────────────────────────────────────────────────
test('26. Tracer#flush dispatches buffered spans through exporters', async () => {
  const received = [];
  const exporter = {
    immediate: false,
    export(spans) { received.push(spans.length); return Promise.resolve(); },
  };
  const t = mkTracer({ exporters: [exporter] });
  for (let i = 0; i < 3; i++) t.startSpan(`op${i}`).end();
  assert.equal(t.finished.length, 3);
  await t.flush();
  assert.equal(received[0], 3);
  assert.equal(t.finished.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 27. Tracer never throws when host code explodes
// ─────────────────────────────────────────────────────────────
test('27. tracer swallows exporter errors and host errors', () => {
  const t = mkTracer({
    exporters: [{
      immediate: true,
      export() { throw new Error('exporter bomb'); },
    }],
  });
  // Should NOT throw even though exporter is broken
  const s = t.startSpan('risky');
  s.end();

  // withSpan: host throws — span records exception, re-throws
  let caught = null;
  const s2 = t.startSpan('op');
  try {
    t.withSpan(s2, () => { throw new Error('host bomb'); });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught);
  assert.equal(caught.message, 'host bomb');
  assert.equal(s2.status.code, 'ERROR');
  assert.ok(s2.events.some(e => e.name === 'exception'));
  s2.end();
});

// ─────────────────────────────────────────────────────────────
// 28. instrumentDbQuery (seed)
// ─────────────────────────────────────────────────────────────
test('28. instrumentDbQuery applies a static SQL stub to every call', async () => {
  const t = mkTracer();
  const raw = async (sql, params) => ({ rowCount: (params || []).length });
  const seeded = instrumentDbQuery(t, raw,
    'SELECT id FROM employees WHERE tenant_id = ?');
  const out = await seeded(['techno-kol']);
  assert.equal(out.rowCount, 1);
  const finished = t.drain();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].attributes['db.statement'],
    'SELECT id FROM employees WHERE tenant_id = ?');
});
