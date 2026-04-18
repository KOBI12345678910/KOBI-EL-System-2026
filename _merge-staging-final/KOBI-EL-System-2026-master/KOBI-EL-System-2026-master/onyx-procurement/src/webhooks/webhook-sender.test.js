/**
 * Unit tests for src/webhooks/webhook-sender.js
 * Agent-80 — Webhook Delivery System
 *
 * Run:
 *   node --test src/webhooks/webhook-sender.test.js
 *
 * Covers:
 *   - signPayload produces deterministic hex HMAC-SHA256
 *   - verifySignature uses timingSafeEqual and returns false on
 *     length/secret/sig mismatch (no throw)
 *   - parseRetryAfter handles delta-seconds, HTTP-date, bad input
 *   - sendWebhook:
 *       • rejects bad url / scheme / missing secret
 *       • sends correct X-Signature and event headers on success
 *       • returns `delivered:true` on HTTP 200
 *       • retries on 500 and succeeds on later attempt
 *       • respects 429 Retry-After (uses sleepImpl spy to measure)
 *       • follows up to 3 redirects, fails on the 4th
 *       • dead-letters after 6 failures
 *       • gives up on 4xx terminal (404) without retrying
 *       • timeouts (AbortError) are treated as transient
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  sendWebhook,
  signPayload,
  verifySignature,
  parseRetryAfter,
  DEFAULT_MAX_ATTEMPTS,
} = require('./webhook-sender');

// ─── Helpers ─────────────────────────────────────────────────────

function makeEnvelope(overrides = {}) {
  return {
    id:         'evt_test_1',
    type:       'invoice.paid',
    version:    1,
    created_at: '2026-04-11T00:00:00.000Z',
    data:       { invoice_id: 'inv_1' },
    ...overrides,
  };
}

function mockResponse({ status = 200, headers = {}, body = '{}' } = {}) {
  return {
    ok:      status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[String(name).toLowerCase()] || null,
    },
    text: async () => body,
    json: async () => { try { return JSON.parse(body); } catch { return null; } },
  };
}

function makeFetchStub(queue) {
  const calls = [];
  const stub = async (url, init) => {
    calls.push({ url, init });
    if (queue.length === 0) throw new Error('fetch queue exhausted');
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  stub.calls = calls;
  return stub;
}

// ─── signPayload / verifySignature ───────────────────────────────

test('signPayload — deterministic HMAC-SHA256 hex', () => {
  const sig = signPayload('{"a":1}', 'secret');
  const expected = crypto.createHmac('sha256', 'secret').update('{"a":1}').digest('hex');
  assert.equal(sig, expected);
  assert.match(sig, /^[0-9a-f]{64}$/);
});

test('verifySignature — happy path', () => {
  const body = '{"a":1}';
  const sig  = signPayload(body, 'shhh');
  assert.equal(verifySignature(body, sig, 'shhh'), true);
});

test('verifySignature — wrong secret returns false', () => {
  const body = '{"a":1}';
  const sig  = signPayload(body, 'shhh');
  assert.equal(verifySignature(body, sig, 'nope'), false);
});

test('verifySignature — wrong signature returns false (no throw)', () => {
  assert.equal(verifySignature('{"a":1}', 'not-hex-at-all', 'shhh'), false);
});

test('verifySignature — empty args return false', () => {
  assert.equal(verifySignature('', 'x', 'y'), false);
  assert.equal(verifySignature('body', '', 'y'), false);
  assert.equal(verifySignature('body', 'x', ''), false);
});

// ─── parseRetryAfter ─────────────────────────────────────────────

test('parseRetryAfter — delta-seconds', () => {
  assert.equal(parseRetryAfter('30'), 30_000);
  assert.equal(parseRetryAfter('0'), 0);
});

test('parseRetryAfter — capped at 5 minutes', () => {
  assert.equal(parseRetryAfter('999999'), 5 * 60 * 1000);
});

test('parseRetryAfter — bad input returns null', () => {
  assert.equal(parseRetryAfter('abc'), null);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter(null), null);
});

test('parseRetryAfter — HTTP-date in the past is 0', () => {
  const past = new Date(Date.now() - 60_000).toUTCString();
  assert.equal(parseRetryAfter(past), 0);
});

// ─── sendWebhook — validation paths ──────────────────────────────

test('sendWebhook — rejects missing url', async () => {
  const r = await sendWebhook({ url: '', secret: 's'.repeat(32), envelope: makeEnvelope() });
  assert.equal(r.delivered, false);
  assert.equal(r.last_status, 'bad_url');
});

test('sendWebhook — rejects non-http scheme', async () => {
  const r = await sendWebhook({
    url: 'ftp://example.com/hook',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: { fetchImpl: async () => mockResponse() },
  });
  assert.equal(r.delivered, false);
  assert.equal(r.last_status, 'bad_scheme');
});

test('sendWebhook — rejects missing secret', async () => {
  const r = await sendWebhook({ url: 'https://x.test/h', secret: '', envelope: makeEnvelope() });
  assert.equal(r.delivered, false);
  assert.equal(r.last_status, 'bad_secret');
});

test('sendWebhook — rejects missing envelope', async () => {
  const r = await sendWebhook({ url: 'https://x.test/h', secret: 's'.repeat(32), envelope: null });
  assert.equal(r.delivered, false);
  assert.equal(r.last_status, 'bad_envelope');
});

// ─── sendWebhook — happy path ────────────────────────────────────

test('sendWebhook — sends signature and event headers on success', async () => {
  const stub = makeFetchStub([mockResponse({ status: 200 })]);
  const envelope = makeEnvelope();
  const secret = 'super-secret-super-secret-super!';
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret,
    envelope,
    options: { fetchImpl: stub },
  });
  assert.equal(r.delivered, true);
  assert.equal(r.last_status, 'ok');
  assert.equal(r.status_code, 200);

  const { init } = stub.calls[0];
  const rawBody = init.body;
  const expectedSig = signPayload(rawBody, secret);
  assert.equal(init.headers['X-Signature'], expectedSig);
  assert.equal(init.headers['X-Signature-Alg'], 'hmac-sha256');
  assert.equal(init.headers['X-Event-Id'], envelope.id);
  assert.equal(init.headers['X-Event-Type'], envelope.type);
  assert.equal(init.method, 'POST');
});

// ─── sendWebhook — retry on 500 ──────────────────────────────────

test('sendWebhook — retries on 500 and eventually succeeds', async () => {
  const stub = makeFetchStub([
    mockResponse({ status: 500 }),
    mockResponse({ status: 500 }),
    mockResponse({ status: 200 }),
  ]);
  const waits = [];
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: {
      fetchImpl: stub,
      sleepImpl: async (ms) => { waits.push(ms); },
      backoffBaseMs: 1,
    },
  });
  assert.equal(r.delivered, true);
  assert.equal(stub.calls.length, 3);
  assert.equal(waits.length, 2);
});

// ─── sendWebhook — 429 honors Retry-After ────────────────────────

test('sendWebhook — honors 429 Retry-After seconds', async () => {
  const stub = makeFetchStub([
    mockResponse({ status: 429, headers: { 'retry-after': '2' } }),
    mockResponse({ status: 200 }),
  ]);
  const waits = [];
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: {
      fetchImpl: stub,
      sleepImpl: async (ms) => { waits.push(ms); },
    },
  });
  assert.equal(r.delivered, true);
  assert.equal(waits[0], 2000);
});

// ─── sendWebhook — redirects ─────────────────────────────────────

test('sendWebhook — follows up to 3 redirects', async () => {
  const stub = makeFetchStub([
    mockResponse({ status: 302, headers: { location: 'https://x.test/r1' } }),
    mockResponse({ status: 302, headers: { location: 'https://x.test/r2' } }),
    mockResponse({ status: 302, headers: { location: 'https://x.test/r3' } }),
    mockResponse({ status: 200 }),
  ]);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: { fetchImpl: stub, sleepImpl: async () => {} },
  });
  assert.equal(r.delivered, true);
  assert.equal(stub.calls.length, 4);
});

test('sendWebhook — fails on 4th redirect (redirect_loop is terminal)', async () => {
  // Enough 302s to exceed max redirects on the FIRST attempt — then
  // because redirect_loop is terminal we must NOT retry.
  const stub = makeFetchStub([
    mockResponse({ status: 302, headers: { location: 'https://x.test/r1' } }),
    mockResponse({ status: 302, headers: { location: 'https://x.test/r2' } }),
    mockResponse({ status: 302, headers: { location: 'https://x.test/r3' } }),
    mockResponse({ status: 302, headers: { location: 'https://x.test/r4' } }),
  ]);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: { fetchImpl: stub, sleepImpl: async () => {} },
  });
  assert.equal(r.delivered, false);
  // 4 fetches exactly — we exhausted redirects on first attempt and stopped.
  assert.equal(stub.calls.length, 4);
});

// ─── sendWebhook — dead letter after 6 failures ──────────────────

test('sendWebhook — dead-letters after 6 consecutive 500s', async () => {
  const responses = [];
  for (let i = 0; i < DEFAULT_MAX_ATTEMPTS; i++) {
    responses.push(mockResponse({ status: 500 }));
  }
  const stub = makeFetchStub(responses);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: {
      fetchImpl: stub,
      sleepImpl: async () => {},
      backoffBaseMs: 1,
    },
  });
  assert.equal(r.delivered, false);
  assert.equal(r.last_status, 'dead_letter');
  assert.equal(stub.calls.length, DEFAULT_MAX_ATTEMPTS);
});

// ─── sendWebhook — 4xx terminal, no retry ────────────────────────

test('sendWebhook — 404 is terminal (no retry)', async () => {
  const stub = makeFetchStub([mockResponse({ status: 404 })]);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: { fetchImpl: stub, sleepImpl: async () => {} },
  });
  assert.equal(r.delivered, false);
  assert.equal(stub.calls.length, 1);
  assert.equal(r.status_code, 404);
});

// ─── sendWebhook — timeouts (AbortError) are transient ───────────

test('sendWebhook — AbortError is treated as transient and retried', async () => {
  const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const stub = makeFetchStub([abortErr, mockResponse({ status: 200 })]);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: {
      fetchImpl: stub,
      sleepImpl: async () => {},
      backoffBaseMs: 1,
    },
  });
  assert.equal(r.delivered, true);
  assert.equal(stub.calls.length, 2);
});

// ─── sendWebhook — injectable retry impl (Agent 79 bridge) ──────

test('sendWebhook — uses injected retryImpl when provided', async () => {
  // Custom retry that only runs the function ONCE (so failures don't
  // retry). Lets us assert the injection path works end-to-end.
  let called = 0;
  const retryImpl = async ({ fn }) => {
    called += 1;
    try { return await fn({ attempt: 0 }); }
    catch (e) { return e.webhookResult; }
  };
  const stub = makeFetchStub([mockResponse({ status: 200 })]);
  const r = await sendWebhook({
    url: 'https://x.test/h',
    secret: 's'.repeat(32),
    envelope: makeEnvelope(),
    options: { fetchImpl: stub, retryImpl },
  });
  assert.equal(r.delivered, true);
  assert.equal(called, 1);
});
