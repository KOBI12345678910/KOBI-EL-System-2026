/**
 * ============================================================================
 * Techno-Kol ERP — logger.test.js
 * Agent X-51 / Swarm 3D / Structured Logger
 * ----------------------------------------------------------------------------
 * Runs under `node --test`.  Zero deps.
 *
 * Covers 25 cases:
 *   01  createLogger returns all 6 level methods
 *   02  respects min level (info hides debug/trace)
 *   03  emits JSON-parsable newline-delimited events
 *   04  ISO-8601 timestamp with Asia/Jerusalem offset
 *   05  correlation-ID propagation via runWithContext
 *   06  logger.child merges bindings
 *   07  logger.withRequest binds request_id / user_id / method / url
 *   08  redactPii: Israeli ID (ת.ז) → ***-**-NNNN
 *   09  redactPii: phone (0501234567) → ***-***-NNNN
 *   10  redactPii: email → ***@domain
 *   11  redactPii: credit card (Luhn-valid) → ****-****-****-NNNN
 *   12  redactPii: credit card (Luhn-INVALID) NOT masked
 *   13  redactPii: key-based redaction (password / token / api_key)
 *   14  redactPii: bank_account key → ***NNN
 *   15  redactPii: handles cycles without throwing
 *   16  redactPii: Hebrew / UTF-8 preserved
 *   17  custom transport receives line + event
 *   18  multiple transports: all receive the same line
 *   19  sampling: sample.trace=0 suppresses all trace
 *   20  sampling: sample.debug=1 allows all debug
 *   21  lazy ctx function is NOT called when below level threshold
 *   22  safeStringify tolerates BigInt + function + circular
 *   23  fileTransport appends and is flushable
 *   24  correlationId middleware mints + echoes header
 *   25  requestLogger emits request.start + request.end with status
 * ============================================================================
 */

'use strict';

const test  = require('node:test');
const assert = require('node:assert/strict');
const fs    = require('node:fs');
const os    = require('node:os');
const path  = require('node:path');

// Resolve SUT across drive layouts — use repo-root lookup so the test
// works whether run from repo root or from test/payroll directly.
const SUT_PATH = path.resolve(
  __dirname, '..', '..',
  'onyx-procurement', 'src', 'ops', 'logger.js'
);
const {
  createLogger,
  runWithContext,
  getCurrentContext,
  redactPii,
  consoleTransport,
  fileTransport,
  httpTransport,
  correlationId,
  requestLogger,
  LEVELS,
  LEVEL_NAMES,
  DEFAULT_TZ,
  _internal,
} = require(SUT_PATH);

// ─── helpers ───────────────────────────────────────────────────

/** Build a capture transport — records every (line, event) pair in-memory. */
function captureTransport() {
  const lines = [];
  const events = [];
  return {
    transport: {
      name: 'capture',
      write(line, event) { lines.push(line); events.push(event); },
      flush() {},
      close() {},
    },
    lines,
    events,
    parse() { return lines.map((l) => JSON.parse(l)); },
    reset() { lines.length = 0; events.length = 0; },
  };
}

/** Mock Express req / res pair — just enough for middleware. */
function makeReqRes(overrides) {
  overrides = overrides || {};
  const req = {
    method: overrides.method || 'GET',
    originalUrl: overrides.url || '/api/test',
    url: overrides.url || '/api/test',
    headers: overrides.headers || {},
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  };
  const resListeners = {};
  const res = {
    statusCode: overrides.status || 200,
    _headers: {},
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    getHeader(k)    { return this._headers[k.toLowerCase()]; },
    on(evt, fn)     { resListeners[evt] = fn; },
    finish()        { if (resListeners.finish) resListeners.finish(); },
  };
  return { req, res };
}

// ─── tests ─────────────────────────────────────────────────────

test('01 createLogger exposes all 6 level methods', () => {
  const log = createLogger({ transports: [captureTransport().transport] });
  for (const lvl of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    assert.equal(typeof log[lvl], 'function', `${lvl} should be a function`);
  }
  assert.deepEqual(LEVEL_NAMES, ['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
  assert.equal(LEVELS.info < LEVELS.warn, true);
});

test('02 respects min level — info hides debug+trace', () => {
  const cap = captureTransport();
  const log = createLogger({ level: 'info', transports: [cap.transport] });
  log.trace('t'); log.debug('d'); log.info('i'); log.warn('w'); log.error('e'); log.fatal('f');
  const levels = cap.parse().map((e) => e.level);
  assert.deepEqual(levels, ['info', 'warn', 'error', 'fatal']);
});

test('03 emits JSON-parsable newline-delimited events', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  log.info('hello world');
  assert.equal(cap.lines.length, 1);
  const parsed = JSON.parse(cap.lines[0]);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.msg, 'hello world');
  assert.ok(parsed.timestamp);
});

test('04 ISO-8601 timestamp with Asia/Jerusalem offset', () => {
  const cap = captureTransport();
  // Force a fixed Date that we can reason about.
  const fixed = new Date('2026-04-11T12:00:00.000Z');
  const log = createLogger({
    transports: [cap.transport],
    now: () => fixed,
    timezone: 'Asia/Jerusalem',
  });
  log.info('t');
  const evt = cap.parse()[0];
  // April 11 is DST in Israel → +03:00.  2026-04-11T12:00 UTC = 15:00 IDT.
  assert.match(evt.timestamp, /^2026-04-11T15:00:00\.000\+03:00$/,
    `expected +03:00 IDT, got ${evt.timestamp}`);
});

test('05 correlation-ID propagation via runWithContext', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  runWithContext({ request_id: 'req-xyz', trace_id: 'trace-1', user_id: 'u-42' }, () => {
    log.info('work');
    assert.deepEqual(getCurrentContext(), {
      request_id: 'req-xyz', trace_id: 'trace-1', user_id: 'u-42',
    });
  });
  const evt = cap.parse()[0];
  assert.equal(evt.request_id, 'req-xyz');
  assert.equal(evt.trace_id, 'trace-1');
  assert.equal(evt.user_id, 'u-42');
});

test('06 logger.child merges bindings', () => {
  const cap = captureTransport();
  const root  = createLogger({ bindings: { service: 'svc-a' }, transports: [cap.transport] });
  const child = root.child({ component: 'rfq', tenant: 'techno-kol' });
  child.info('ping');
  const evt = cap.parse()[0];
  assert.equal(evt.service, 'svc-a');
  assert.equal(evt.component, 'rfq');
  assert.equal(evt.tenant, 'techno-kol');
});

test('07 logger.withRequest binds request_id / user_id / method / url', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  const req = {
    id: 'req-abc',
    method: 'POST',
    originalUrl: '/api/rfq',
    user: { id: 'u-99' },
    headers: { 'x-trace-id': 'tr-7' },
  };
  log.withRequest(req).info('handled');
  const evt = cap.parse()[0];
  assert.equal(evt.request_id, 'req-abc');
  assert.equal(evt.user_id, 'u-99');
  assert.equal(evt.method, 'POST');
  assert.equal(evt.url, '/api/rfq');
  assert.equal(evt.trace_id, 'tr-7');
});

test('08 redactPii: Israeli ID (ת.ז) → ***-**-NNNN', () => {
  const out = redactPii({ msg: 'יוסי ת.ז 123456782 ביקש מחיר' });
  assert.match(out.msg, /\*\*\*-\*\*-6782/);
  assert.ok(!/123456782/.test(out.msg));
});

test('09 redactPii: phone (0501234567) → ***-***-NNNN', () => {
  const out = redactPii({ note: 'call me at 050-123-4567 please' });
  assert.match(out.note, /\*\*\*-\*\*\*-4567/);
  assert.ok(!/1234567/.test(out.note));
});

test('10 redactPii: email in string → ***@domain', () => {
  const out = redactPii({ text: 'contact uzi@techno-kol.co.il now' });
  assert.match(out.text, /\*\*\*@techno-kol\.co\.il/);
  assert.ok(!/uzi@/.test(out.text));
});

test('11 redactPii: Luhn-valid credit card → ****-****-****-NNNN', () => {
  // 4111 1111 1111 1111 is the classic Visa test number — passes Luhn.
  const out = redactPii({ memo: 'paid with 4111111111111111 today' });
  assert.match(out.memo, /\*\*\*\*-\*\*\*\*-\*\*\*\*-1111/);
  assert.ok(!/4111111111111111/.test(out.memo));
});

test('12 redactPii: Luhn-INVALID 16-digit string is NOT masked as card', () => {
  // 1234567890123456 fails Luhn — must not be card-masked.
  const out = redactPii({ memo: 'reference 1234567890123456' });
  assert.ok(!/\*\*\*\*-\*\*\*\*-\*\*\*\*-3456/.test(out.memo),
    'should not apply CC mask to non-Luhn digits');
});

test('13 redactPii: key-based redaction (password / token / api_key)', () => {
  const out = redactPii({
    username: 'kobi',
    password: 'hunter2',
    token: 'abc.def.ghi',
    api_key: 'sk-xxxx',
    authorization: 'Bearer zzz',
    nested: { secret: 'x', client_secret: 'y' },
  });
  assert.equal(out.username, 'kobi');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.token, '[REDACTED]');
  assert.equal(out.api_key, '[REDACTED]');
  assert.equal(out.authorization, '[REDACTED]');
  assert.equal(out.nested.secret, '[REDACTED]');
  assert.equal(out.nested.client_secret, '[REDACTED]');
});

test('14 redactPii: bank_account key → ***NNN', () => {
  const out = redactPii({
    bank_account: '1234567890',
    iban: 'IL620108000000099999999',
  });
  assert.match(out.bank_account, /^\*\*\*890$/);
  // IBAN is matched as a known PII key — masked via bank-account rule.
  assert.match(out.iban, /^\*\*\*\d{3}$/);
  // The original IBAN digits must not leak.
  assert.ok(!/IL620108/.test(out.iban));
});

test('15 redactPii: handles cycles without throwing', () => {
  const a = { name: 'a' };
  const b = { name: 'b', ref: a };
  a.ref = b;
  let out;
  assert.doesNotThrow(() => { out = redactPii(a); });
  // Cycle should be broken somewhere in the graph.
  const s = JSON.stringify(out);
  assert.match(s, /\[Circular\]/);
});

test('16 redactPii: Hebrew / UTF-8 preserved end-to-end', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  log.info('הנפקת חשבונית ללקוח', { customer: 'טכנוקול עוזי' });
  const line = cap.lines[0];
  assert.match(line, /הנפקת חשבונית ללקוח/);
  const parsed = JSON.parse(line);
  assert.equal(parsed.customer, 'טכנוקול עוזי');
});

test('17 custom transport receives line + event', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  log.warn('hey', { code: 'W1' });
  assert.equal(cap.events.length, 1);
  assert.equal(cap.events[0].level, 'warn');
  assert.equal(cap.events[0].code, 'W1');
  assert.equal(typeof cap.lines[0], 'string');
});

test('18 multiple transports: both receive the same line', () => {
  const a = captureTransport();
  const b = captureTransport();
  const log = createLogger({ transports: [a.transport, b.transport] });
  log.info('broadcast');
  assert.equal(a.lines.length, 1);
  assert.equal(b.lines.length, 1);
  assert.equal(a.lines[0], b.lines[0]);
});

test('19 sampling: sample.trace=0 suppresses all trace', () => {
  const cap = captureTransport();
  const log = createLogger({
    level: 'trace',
    transports: [cap.transport],
    sample: { trace: 0 },
  });
  for (let i = 0; i < 50; i++) log.trace('hit ' + i);
  assert.equal(cap.lines.length, 0);
});

test('20 sampling: sample.debug=1 allows all debug', () => {
  const cap = captureTransport();
  const log = createLogger({
    level: 'debug',
    transports: [cap.transport],
    sample: { debug: 1 },
  });
  for (let i = 0; i < 10; i++) log.debug('x');
  assert.equal(cap.lines.length, 10);
});

test('21 lazy ctx fn is NOT called below level threshold', () => {
  const cap = captureTransport();
  const log = createLogger({ level: 'info', transports: [cap.transport] });
  let called = 0;
  log.debug('heavy', () => { called++; return { expensive: 'x' }; });
  assert.equal(called, 0, 'ctx function should not be invoked for suppressed level');
  log.info('heavy', () => { called++; return { expensive: 'y' }; });
  assert.equal(called, 1, 'ctx function should be invoked for emitted level');
  assert.equal(cap.parse()[0].expensive, 'y');
});

test('22 safeStringify tolerates BigInt + function + circular', () => {
  const { safeStringify } = _internal;
  const a = { x: 1 };
  a.self = a;
  const str = safeStringify({
    big: 9007199254740993n,
    fn:  function foo() {},
    sym: Symbol('s'),
    cycle: a,
  });
  assert.ok(str);
  const parsed = JSON.parse(str);
  assert.equal(parsed.big, '9007199254740993n');
  assert.equal(parsed.fn, '[function]');
});

test('23 fileTransport appends and is flushable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-logger-'));
  const file = path.join(dir, 'out.jsonl');
  const ft = fileTransport({ filePath: file, flushMs: 10 });
  const log = createLogger({ transports: [ft] });
  log.info('first');
  log.warn('second', { k: 1 });
  ft.flush();
  const contents = fs.readFileSync(file, 'utf8');
  const lines = contents.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].msg, 'first');
  assert.equal(lines[1].msg, 'second');
  assert.equal(lines[1].k, 1);
  ft.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
});

test('24 correlationId middleware mints + echoes x-request-id', () => {
  const mw = correlationId();
  const { req, res } = makeReqRes();
  let ran = false;
  mw(req, res, () => {
    ran = true;
    const ctx = getCurrentContext();
    assert.ok(ctx && ctx.request_id);
    assert.equal(req.id, ctx.request_id);
    assert.equal(res.getHeader('x-request-id'), ctx.request_id);
  });
  assert.equal(ran, true);

  // Incoming header is preserved, not overwritten.
  const second = makeReqRes({ headers: { 'x-request-id': 'supplied-123' } });
  mw(second.req, second.res, () => {
    assert.equal(second.req.id, 'supplied-123');
    assert.equal(second.res.getHeader('x-request-id'), 'supplied-123');
  });
});

test('25 requestLogger emits request.start + request.end with status', () => {
  const cap = captureTransport();
  const log = createLogger({ transports: [cap.transport] });
  const mw = requestLogger(log);
  const { req, res } = makeReqRes({ method: 'POST', url: '/api/rfq', status: 201 });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  res.finish();
  assert.equal(nextCalled, true);
  const events = cap.parse();
  assert.ok(events.length >= 2);
  const start = events.find((e) => e.msg === 'request.start');
  const end   = events.find((e) => e.msg === 'request.end');
  assert.ok(start, 'request.start emitted');
  assert.ok(end, 'request.end emitted');
  assert.equal(start.method, 'POST');
  assert.equal(start.url, '/api/rfq');
  assert.equal(end.status, 201);
  assert.equal(typeof end.duration_ms, 'number');
});

test('26 httpTransport stub batches and can flush (no-throw without fetch)', async () => {
  const ht = httpTransport({ url: 'http://localhost:0/logs', batch: 3, flushMs: 10 });
  const log = createLogger({ transports: [ht] });
  log.info('a'); log.info('b'); log.info('c');  // should hit batch=3
  await ht.flush();
  const snap = ht._inspect();
  assert.equal(typeof snap.queued, 'number');
  assert.equal(typeof snap.inflight, 'number');
  ht.close();
});

test('27 redactPii: redaction survives nested Hebrew + PII combos', () => {
  const out = redactPii({
    owner: 'אבי כהן',
    id:    '123456782',
    contact: {
      email: 'avi@kol.co.il',
      phone: '0521234567',
    },
    note: 'שולם בכרטיס 4111111111111111',
  });
  assert.equal(out.owner, 'אבי כהן');
  assert.equal(out.id, '***-**-6782');
  assert.match(out.contact.email, /^\*\*\*@/);
  assert.match(out.contact.phone, /\*\*\*-\*\*\*-\d{4}/);
  assert.match(out.note, /\*\*\*\*-\*\*\*\*-\*\*\*\*-1111/);
});

test('28 redactPii: DEFAULT_TZ is Asia/Jerusalem and luhnValid works', () => {
  assert.equal(DEFAULT_TZ, 'Asia/Jerusalem');
  assert.equal(_internal.luhnValid('4111111111111111'), true);
  assert.equal(_internal.luhnValid('1234567890123456'), false);
  assert.equal(_internal.luhnValid(''), false);
  assert.equal(_internal.luhnValid('4111111111111112'), false);
});
