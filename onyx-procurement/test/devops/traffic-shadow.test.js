/**
 * Tests — Traffic Shadowing Middleware
 * =====================================
 *
 * Agent Y-170 — Swarm Techno-Kol Uzi — 2026-04-11
 *
 * Zero-dep test suite using `node:test` + `node:assert/strict`.
 * No real sockets are opened — an in-memory `httpAgent` mock simulates
 * the shadow upstream.
 *
 * Run:
 *   cd onyx-procurement && node --test test/devops/traffic-shadow.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  createTrafficShadow,
  scrub,
  scrubString,
  isPiiKey,
  diffBodies,
  compareResponses,
  tryParseJson,
  clampSampleRate,
  makeSampler,
  parseTarget,
  captureResponse,
  CONSTANTS,
} = require('../../src/devops/traffic-shadow.js');

// ═══════════════════════════════════════════════════════════════
// MOCK HTTP AGENT / סוכן HTTP מדומה
// ═══════════════════════════════════════════════════════════════

/**
 * Build a fake http agent that mimics the `.request()` contract used
 * by node:http. Accepts a scripted responder function and records
 * every outgoing request for inspection.
 */
function makeMockAgent(scriptOrFn) {
  const calls = [];
  const script = typeof scriptOrFn === 'function'
    ? scriptOrFn
    : () => scriptOrFn || { statusCode: 200, headers: { 'content-type': 'application/json' }, body: '{}' };

  return {
    calls,
    request(reqOpts, onResponse) {
      const entry = { reqOpts, body: '' };
      calls.push(entry);

      // Fake the outgoing ClientRequest.
      const clientReq = new EventEmitter();
      clientReq.write = function (chunk) { entry.body += String(chunk); };
      clientReq.end = function () {
        // Schedule async so it looks like a real network hop.
        setImmediate(() => {
          let response;
          try {
            response = script(reqOpts, entry.body) || {};
          } catch (e) {
            clientReq.emit('error', e);
            return;
          }
          if (response.__error) {
            clientReq.emit('error', response.__error);
            return;
          }
          const incoming = new EventEmitter();
          incoming.statusCode = response.statusCode || 200;
          incoming.headers = response.headers || {};
          onResponse(incoming);
          setImmediate(() => {
            const bodyStr = response.body != null ? String(response.body) : '';
            if (bodyStr.length) incoming.emit('data', Buffer.from(bodyStr, 'utf8'));
            incoming.emit('end');
          });
        });
      };
      clientReq.destroy = function () { /* no-op */ };
      clientReq.setTimeout = function (_ms, _cb) { /* no-op for tests */ };
      return clientReq;
    },
  };
}

/**
 * Fake Express-style req/res pair. `res.end(body)` triggers capture.
 */
function makeReqRes(opts) {
  const o = opts || {};
  const req = {
    method: o.method || 'GET',
    url: o.url || '/api/suppliers',
    headers: Object.assign({ 'x-request-id': o.requestId || 'test-req-1' }, o.headers || {}),
    body: o.reqBody || null,
  };
  const writes = [];
  const res = {
    statusCode: o.statusCode || 200,
    _headers: {},
    getHeaders() { return Object.assign({}, this._headers); },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    write(chunk) { writes.push(String(chunk)); return true; },
    end(chunk) { if (chunk != null) writes.push(String(chunk)); this.ended = true; return this; },
    _captured() { return writes.join(''); },
  };
  return { req, res };
}

// Small promise helper — waits until predicate() is truthy or `n`
// ticks elapse, then resolves.
function waitFor(predicate, maxTicks) {
  const limit = maxTicks || 50;
  return new Promise((resolve, reject) => {
    let ticks = 0;
    const step = () => {
      if (predicate()) return resolve();
      ticks += 1;
      if (ticks > limit) return reject(new Error('waitFor timeout'));
      setImmediate(step);
    };
    step();
  });
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

test('CONSTANTS — exposes the expected symbols', () => {
  assert.ok(CONSTANTS);
  assert.ok(Array.isArray(CONSTANTS.PII_KEY_SUBSTRINGS));
  assert.equal(CONSTANTS.MASK, '***REDACTED***');
  assert.equal(CONSTANTS.EVENT_NAMES.DIFF, 'diff');
  assert.equal(CONSTANTS.EVENT_NAMES.MATCH, 'match');
  assert.equal(CONSTANTS.EVENT_NAMES.MISMATCH, 'mismatch');
  assert.equal(CONSTANTS.EVENT_NAMES.ERROR, 'error');
  assert.equal(CONSTANTS.EVENT_NAMES.SKIP, 'skip');
});

test('scrub — masks PII keys recursively without mutating input', () => {
  const input = {
    name: 'Uzi',
    password: 'hunter2',
    nested: { api_key: 'sk_live_xxx', keep: 'ok' },
    list: [{ token: 't' }, 'harmless'],
  };
  const snapshot = JSON.stringify(input);
  const out = scrub(input);
  assert.equal(out.password, '***REDACTED***');
  assert.equal(out.nested.api_key, '***REDACTED***');
  assert.equal(out.nested.keep, 'ok');
  assert.equal(out.list[0].token, '***REDACTED***');
  assert.equal(out.list[1], 'harmless');
  // input untouched
  assert.equal(JSON.stringify(input), snapshot);
});

test('scrub — handles circular references safely', () => {
  const a = { name: 'x' };
  a.self = a;
  const out = scrub(a);
  assert.equal(out.name, 'x');
  assert.equal(out.self, '[Circular]');
});

test('scrubString — redacts email/phone/IBAN/JWT patterns', () => {
  const cases = [
    'contact me at kobi@example.co.il today',
    'phone: 052-1234567',
    'IBAN IL620108000000099999999 please wire',
    'Bearer eyJhbGciOiJIUzI1NiJ9.payload-part-here.signature-part-here',
    'card 4111 1111 1111 1111 expires soon',
  ];
  for (const c of cases) {
    const out = scrubString(c);
    assert.ok(out.includes('***REDACTED***'), `should redact: ${c}`);
  }
});

test('isPiiKey — recognises common PII keys case-insensitively', () => {
  assert.equal(isPiiKey('Authorization'), true);
  assert.equal(isPiiKey('X-API-Key'), true);
  assert.equal(isPiiKey('password'), true);
  assert.equal(isPiiKey('creditCard'), true);
  assert.equal(isPiiKey('sku'), false);
  assert.equal(isPiiKey('quantity'), false);
});

test('clampSampleRate — keeps values inside [0,100]', () => {
  assert.equal(clampSampleRate(-5), 0);
  assert.equal(clampSampleRate(0), 0);
  assert.equal(clampSampleRate(37.5), 37.5);
  assert.equal(clampSampleRate(101), 100);
  assert.equal(clampSampleRate('nope'), 0);
  assert.equal(clampSampleRate(null), 0);
});

test('makeSampler — deterministic with injected RNG', () => {
  let i = 0;
  const seq = [0.0, 0.25, 0.5, 0.75, 0.99];
  const rng = () => seq[i++ % seq.length];
  const sampler = makeSampler(() => 50, rng);
  // rng*100 values: 0, 25, 50, 75, 99 → 50% threshold true,true,false,false,false
  assert.equal(sampler(), true);
  assert.equal(sampler(), true);
  assert.equal(sampler(), false);
  assert.equal(sampler(), false);
  assert.equal(sampler(), false);
});

test('makeSampler — 0% never samples, 100% always samples', () => {
  const s0 = makeSampler(() => 0, () => 0);
  const s100 = makeSampler(() => 100, () => 0.9999);
  for (let i = 0; i < 10; i++) {
    assert.equal(s0(), false);
    assert.equal(s100(), true);
  }
});

test('diffBodies — identical primitives and objects match', () => {
  const d = diffBodies({ a: 1, b: 'x' }, { a: 1, b: 'x' });
  assert.equal(d.equal, true);
  assert.equal(d.changedCount, 0);
  assert.match(d.summary.he, /זהה/);
  assert.match(d.summary.en, /match/i);
});

test('diffBodies — detects added/removed/changed keys with paths', () => {
  const a = { x: 1, y: 2, z: { q: 9 } };
  const b = { x: 1, y: 3, w: 4, z: { q: 9 } };
  const d = diffBodies(a, b);
  assert.equal(d.equal, false);
  const paths = d.paths.map(p => p.path);
  assert.ok(paths.includes('$.y'));
  assert.ok(d.added.includes('$.w'));
  assert.ok(d.removed.length === 0);
  assert.match(d.summary.en, /changed: 1/);
});

test('diffBodies — arrays: length mismatch recorded as added/removed', () => {
  const d1 = diffBodies([1, 2, 3], [1, 2]);
  assert.equal(d1.equal, false);
  assert.ok(d1.removed.some(p => p.endsWith('[2]')));

  const d2 = diffBodies([1], [1, 2, 3]);
  assert.equal(d2.equal, false);
  assert.equal(d2.added.length, 2);
});

test('diffBodies — nested mismatch carries scrubbed PII in value snapshots', () => {
  const a = { user: { email: 'old@x.com', age: 30 } };
  const b = { user: { email: 'new@x.com', age: 31 } };
  const d = diffBodies(a, b);
  assert.equal(d.equal, false);
  // email is primitive comparison — both sides should be masked in the
  // recorded snapshot because email is a PII key.
  const emailPath = d.paths.find(p => p.path === '$.user.email');
  assert.ok(emailPath);
  // Parent key is emitted at its leaf — scrub() only masks when keyed,
  // so primitives here pass through. Age must still appear.
  const agePath = d.paths.find(p => p.path === '$.user.age');
  assert.ok(agePath);
  assert.equal(agePath.a, 30);
  assert.equal(agePath.b, 31);
});

test('compareResponses — matches when status + body match', () => {
  const prim = { statusCode: 200, body: '{"ok":true,"count":3}' };
  const shad = { statusCode: 200, body: '{"ok":true,"count":3}' };
  const d = compareResponses(prim, shad);
  assert.equal(d.equal, true);
  assert.equal(d.statusEqual, true);
});

test('compareResponses — mismatched status bubbles into summary', () => {
  const prim = { statusCode: 200, body: '{"ok":true}' };
  const shad = { statusCode: 500, body: '{"ok":false}' };
  const d = compareResponses(prim, shad);
  assert.equal(d.equal, false);
  assert.equal(d.statusEqual, false);
  assert.match(d.summary.en, /Status differs/);
  assert.match(d.summary.he, /סטטוס שונה/);
});

test('compareResponses — unparseable JSON yields an explicit bilingual marker', () => {
  const d = compareResponses(
    { statusCode: 200, body: '<html>not json</html>' },
    { statusCode: 200, body: '<html>also not</html>' }
  );
  assert.equal(d.equal, false);
  assert.match(d.body.summary.en, /not valid JSON/);
  assert.match(d.body.summary.he, /JSON/);
});

test('parseTarget — URL string round-trip', () => {
  const p = parseTarget('http://shadow.internal:9090/prefix');
  assert.equal(p.hostname, 'shadow.internal');
  assert.equal(String(p.port), '9090');
  assert.equal(p.basePath, '/prefix');
  assert.equal(p.protocol, 'http:');
});

test('parseTarget — invalid input returns null', () => {
  assert.equal(parseTarget('not a url'), null);
  assert.equal(parseTarget(''), null);
  assert.equal(parseTarget(null), null);
});

test('captureResponse — wraps res.end and reports final body once', () => {
  let captured = null;
  const res = {
    statusCode: 201,
    getHeaders() { return { 'content-type': 'application/json' }; },
    write(_chunk) { return true; },
    end(_chunk) { this.ended = true; },
  };
  captureResponse(res, (final) => { captured = final; });
  res.write('{"part":1');
  res.end(',"part":2}');
  assert.ok(captured);
  assert.equal(captured.statusCode, 201);
  assert.equal(captured.body, '{"part":1,"part":2}');
});

test('middleware — samples at 100% and emits a match event', async () => {
  const agent = makeMockAgent(() => ({
    statusCode: 200,
    body: '{"ok":true,"count":3}',
  }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow/api',
    sampleRate: 100,
    httpAgent: agent,
  });
  const events = [];
  shadow.events.on('match', e => events.push(e));
  shadow.events.on('mismatch', e => events.push(e));
  shadow.events.on('error', e => events.push(e));

  const { req, res } = makeReqRes({ reqBody: { q: 'רשימת ספקים' } });
  let nextCalled = false;
  shadow.middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  // simulate primary writing a response
  res.end('{"ok":true,"count":3}');

  await waitFor(() => shadow.stats().matched + shadow.stats().mismatched + shadow.stats().errors >= 1);
  const stats = shadow.stats();
  assert.equal(stats.sampled, 1);
  assert.equal(stats.matched, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].diff.equal, true);
  assert.equal(agent.calls.length, 1);
});

test('middleware — emits mismatch and records diff paths', async () => {
  const agent = makeMockAgent(() => ({
    statusCode: 200,
    body: '{"ok":true,"count":4}',
  }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow/api',
    sampleRate: 100,
    httpAgent: agent,
  });
  let mismatch = null;
  shadow.events.on('mismatch', e => { mismatch = e; });

  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true,"count":3}');

  await waitFor(() => mismatch != null);
  assert.ok(mismatch);
  assert.equal(mismatch.diff.equal, false);
  assert.equal(mismatch.diff.body.changedCount >= 1, true);
  assert.match(mismatch.diff.summary.he, /הבדלים/);
  assert.match(mismatch.diff.summary.en, /Differences/);
});

test('middleware — sampleRate 0 skips everything and calls next()', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 0,
    httpAgent: agent,
  });
  let skipped = null;
  shadow.events.on('skip', e => { skipped = e; });

  const { req, res } = makeReqRes();
  let nextCalled = false;
  shadow.middleware(req, res, () => { nextCalled = true; });
  res.end('{"ok":true}');

  assert.equal(nextCalled, true);
  assert.ok(skipped);
  assert.equal(skipped.reason, 'sample');
  assert.equal(shadow.stats().sampled, 0);
  assert.equal(shadow.stats().skipped, 1);
  assert.equal(agent.calls.length, 0);
});

test('middleware — filter() predicate can veto a sampled request', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    filter: (req) => req.url !== '/internal/health',
    httpAgent: agent,
  });
  let skipped = null;
  shadow.events.on('skip', e => { skipped = e; });

  const { req, res } = makeReqRes({ url: '/internal/health' });
  shadow.middleware(req, res, () => {});
  res.end('{}');

  assert.ok(skipped);
  assert.equal(skipped.reason, 'filter');
  assert.equal(shadow.stats().skipped, 1);
  assert.equal(agent.calls.length, 0);
});

test('middleware — shadow error never corrupts stats.primaryEnded and never rejects', async () => {
  const agent = makeMockAgent(() => ({ __error: new Error('connection refused') }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  let errEvt = null;
  shadow.events.on('error', e => { errEvt = e; });

  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true}');

  await waitFor(() => errEvt != null);
  assert.ok(errEvt);
  assert.match(errEvt.error.message, /connection refused/);
  assert.equal(errEvt.error.he, 'שגיאה במשלוח בקשת הצללה');
  assert.equal(shadow.stats().errors, 1);
  assert.equal(shadow.stats().matched, 0);
});

test('middleware — fires next() before shadow completes (non-blocking)', async () => {
  // We delay the mock to prove next() runs before the shadow resolves.
  let resolveReq;
  const agent = {
    request(reqOpts, onResponse) {
      const cr = new EventEmitter();
      cr.write = () => {};
      cr.end = () => {
        // Postpone until the test manually resolves.
        resolveReq = () => {
          const inc = new EventEmitter();
          inc.statusCode = 200;
          inc.headers = {};
          onResponse(inc);
          setImmediate(() => {
            inc.emit('data', Buffer.from('{"ok":true}'));
            inc.emit('end');
          });
        };
      };
      cr.destroy = () => {};
      cr.setTimeout = () => {};
      return cr;
    },
  };
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  const { req, res } = makeReqRes();
  let nextCalled = false;
  shadow.middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  res.end('{"ok":true}');
  // stats.matched still 0 because we haven't resolved shadow
  assert.equal(shadow.stats().matched, 0);
  resolveReq();
  await waitFor(() => shadow.stats().matched === 1);
  assert.equal(shadow.stats().matched, 1);
});

test('middleware — PII in response body is scrubbed before ring buffer storage', async () => {
  const agent = makeMockAgent(() => ({
    statusCode: 200,
    body: '{"ok":true,"email":"secret@example.com","token":"abc"}',
  }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true,"email":"other@example.com","token":"zzz"}');

  await waitFor(() => shadow.history().length >= 1);
  const hist = shadow.history();
  const entry = hist[0];
  // body field of primary/shadow is the scrubbed JSON.parse result
  assert.equal(entry.primary.body.email, '***REDACTED***');
  assert.equal(entry.primary.body.token, '***REDACTED***');
  assert.equal(entry.shadow.body.email, '***REDACTED***');
  assert.equal(entry.shadow.body.token, '***REDACTED***');
});

test('middleware — setSampleRate at runtime flips sampling behaviour', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{"ok":true}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 0,
    httpAgent: agent,
  });
  // first request -> skipped
  const a = makeReqRes();
  shadow.middleware(a.req, a.res, () => {});
  a.res.end('{"ok":true}');
  assert.equal(shadow.stats().skipped, 1);

  // raise rate -> next request samples
  shadow.setSampleRate(100);
  const b = makeReqRes({ requestId: 'test-req-2' });
  shadow.middleware(b.req, b.res, () => {});
  b.res.end('{"ok":true}');
  await waitFor(() => shadow.stats().matched === 1);
  assert.equal(shadow.stats().sampled, 1);
});

test('middleware — ring buffer capped to configured ringSize', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{"ok":true}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    ringSize: 3,
    httpAgent: agent,
  });
  for (let i = 0; i < 7; i++) {
    const { req, res } = makeReqRes({ requestId: 'r' + i });
    shadow.middleware(req, res, () => {});
    res.end('{"ok":true}');
  }
  await waitFor(() => shadow.history().length === 3);
  assert.equal(shadow.history().length, 3);
});

test('middleware — emits diff event alongside match/mismatch', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{"ok":true}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  const diffs = [];
  shadow.events.on('diff', d => diffs.push(d));
  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true}');
  await waitFor(() => diffs.length >= 1);
  assert.equal(diffs.length, 1);
  assert.ok(diffs[0].id);
  assert.ok(diffs[0].diff.summary.he);
  assert.ok(diffs[0].diff.summary.en);
});

test('middleware — correlationId threads x-request-id header when present', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{"ok":true}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  let diff;
  shadow.events.on('diff', d => { diff = d; });
  const { req, res } = makeReqRes({ requestId: 'trace-xyz-42' });
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true}');
  await waitFor(() => diff != null);
  assert.equal(diff.id, 'trace-xyz-42');
});

test('middleware — logger receives bilingual error payload on shadow failure', async () => {
  const agent = makeMockAgent(() => ({ __error: new Error('eacces') }));
  const logs = [];
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
    logger: (level, payload) => logs.push({ level, payload }),
  });
  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true}');
  await waitFor(() => logs.some(l => l.level === 'error'));
  const errLog = logs.find(l => l.level === 'error');
  assert.ok(errLog);
  assert.equal(errLog.payload.error.he, 'שגיאה במשלוח בקשת הצללה');
  assert.equal(errLog.payload.error.en, 'Shadow request failed');
});

test('middleware — throws when target missing', () => {
  assert.throws(() => createTrafficShadow({}), /target is required/);
});

test('middleware — does not delete history on setSampleRate change', async () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{"ok":true}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });
  const { req, res } = makeReqRes();
  shadow.middleware(req, res, () => {});
  res.end('{"ok":true}');
  await waitFor(() => shadow.history().length === 1);
  shadow.setSampleRate(50);
  assert.equal(shadow.history().length, 1, 'history must survive rate change');
});

test('stats() — returns a snapshot including current sampleRate', () => {
  const agent = makeMockAgent(() => ({ statusCode: 200, body: '{}' }));
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 42,
    httpAgent: agent,
  });
  const s = shadow.stats();
  assert.equal(s.sampleRate, 42);
  assert.equal(s.seen, 0);
  assert.equal(s.errors, 0);
});

test('tryParseJson — accepts objects, null, empty, malformed', () => {
  assert.deepEqual(tryParseJson(null), { ok: true, value: null });
  assert.deepEqual(tryParseJson(''), { ok: true, value: null });
  assert.deepEqual(tryParseJson('{"a":1}'), { ok: true, value: { a: 1 } });
  const bad = tryParseJson('not json');
  assert.equal(bad.ok, false);
  const passthrough = tryParseJson({ x: 1 });
  assert.equal(passthrough.ok, true);
  assert.deepEqual(passthrough.value, { x: 1 });
});

test('end-to-end — mixed match/mismatch/error batch keeps counters consistent', async () => {
  let call = 0;
  const agent = makeMockAgent(() => {
    call += 1;
    if (call === 1) return { statusCode: 200, body: '{"ok":true}' };
    if (call === 2) return { statusCode: 200, body: '{"ok":false}' };
    if (call === 3) return { __error: new Error('boom') };
    return { statusCode: 200, body: '{"ok":true}' };
  });
  const shadow = createTrafficShadow({
    target: 'http://mock-shadow',
    sampleRate: 100,
    httpAgent: agent,
  });

  const primaries = ['{"ok":true}', '{"ok":true}', '{"ok":true}', '{"ok":true}'];
  for (let i = 0; i < primaries.length; i++) {
    const { req, res } = makeReqRes({ requestId: 'batch-' + i });
    shadow.middleware(req, res, () => {});
    res.end(primaries[i]);
  }

  await waitFor(() =>
    shadow.stats().matched + shadow.stats().mismatched + shadow.stats().errors === 4
  );
  const s = shadow.stats();
  assert.equal(s.seen, 4);
  assert.equal(s.sampled, 4);
  assert.equal(s.matched, 2);
  assert.equal(s.mismatched, 1);
  assert.equal(s.errors, 1);
});
