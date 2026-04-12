/**
 * Unit tests for src/ai-bridge.js (OnyxAiClient).
 * Agent-20 — Wave 2
 *
 * Run:
 *   node --test src/ai-bridge.test.js
 *
 * Strategy:
 *   - Mock globalThis.fetch with a queue-based stub. Save/restore before
 *     and after each test so tests are hermetic.
 *   - Use a tiny backoffBaseMs so retry tests finish in <100ms.
 *   - Verify:
 *       • constructor validates baseUrl/apiKey
 *       • successful POST returns parsed body
 *       • X-API-Key header is sent on every request
 *       • network failure yields null (no throw)
 *       • timeout yields null
 *       • 5xx triggers retry; eventual success returns body
 *       • 5xx on all attempts returns null
 *       • 4xx is NOT retried and returns null
 *       • healthCheck returns bool
 *       • recordEvent auto-fills timestamp and returns bool
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OnyxAiClient } = require('./ai-bridge');

// ───────────────────────────────────────────────────────────────
// fetch mocking helpers
// ───────────────────────────────────────────────────────────────

/**
 * installFetchMock — replace globalThis.fetch with a queue-driven stub.
 * Returns { restore, calls, queue } where:
 *   calls  — array of [url, init] for every invocation
 *   queue  — push Response-like objects or Error instances to dictate
 *            what the next fetch call should return/throw.
 */
function installFetchMock() {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const queue = [];

  globalThis.fetch = async function mockedFetch(url, init) {
    calls.push([url, init]);
    if (queue.length === 0) {
      throw new Error('mock fetch queue exhausted');
    }
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(url, init);
    return next;
  };

  return {
    calls,
    queue,
    restore() { globalThis.fetch = originalFetch; },
  };
}

/** Build a minimal Response-like object accepted by OnyxAiClient. */
function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}

/** Error shaped like an AbortError — used to simulate timeouts. */
function abortError() {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

/** Silent logger — tests don't want warning noise in the output. */
const silentLogger = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
  debug: () => {},
};

// ───────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────

test('constructor rejects missing baseUrl', () => {
  assert.throws(() => new OnyxAiClient('', 'key'), /baseUrl/);
  assert.throws(() => new OnyxAiClient(null, 'key'), /baseUrl/);
});

test('constructor rejects missing apiKey', () => {
  assert.throws(() => new OnyxAiClient('http://localhost:3200', ''), /apiKey/);
  assert.throws(() => new OnyxAiClient('http://localhost:3200', null), /apiKey/);
});

test('constructor strips trailing slashes from baseUrl', () => {
  const c = new OnyxAiClient('http://localhost:3200///', 'k');
  assert.equal(c.baseUrl, 'http://localhost:3200');
});

test('evaluatePolicy — happy path returns parsed body', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(200, { allow: true, reason: 'ok', cost: 0.02 }));

    const client = new OnyxAiClient('http://localhost:3200', 'secret-key', {
      logger: silentLogger,
      backoffBaseMs: 1,
    });
    const result = await client.evaluatePolicy({
      action: 'create_po',
      amount: 1000,
      currency: 'ILS',
    });

    assert.deepEqual(result, { allow: true, reason: 'ok', cost: 0.02 });
    assert.equal(mock.calls.length, 1);
    const [url, init] = mock.calls[0];
    assert.equal(url, 'http://localhost:3200/evaluate');
    assert.equal(init.method, 'POST');
  } finally {
    mock.restore();
  }
});

test('X-API-Key header is sent on every request', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(200, { ok: true }));
    const client = new OnyxAiClient('http://localhost:3200', 'super-secret', {
      logger: silentLogger,
      backoffBaseMs: 1,
    });
    await client.getBudgetStatus();

    const [, init] = mock.calls[0];
    assert.equal(init.headers['X-API-Key'], 'super-secret');
    assert.equal(init.headers['Accept'], 'application/json');
  } finally {
    mock.restore();
  }
});

test('evaluatePolicy with bad input returns null without calling fetch', async () => {
  const mock = installFetchMock();
  try {
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
    });
    assert.equal(await client.evaluatePolicy(null), null);
    assert.equal(await client.evaluatePolicy('nope'), null);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test('network error returns null (fail-open)', async () => {
  const mock = installFetchMock();
  try {
    // maxRetries=0 to avoid burning the queue.
    mock.queue.push(new Error('ECONNREFUSED'));
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      maxRetries: 0,
      backoffBaseMs: 1,
    });
    const result = await client.evaluatePolicy({ action: 'create_po', amount: 1, currency: 'ILS' });
    assert.equal(result, null);
  } finally {
    mock.restore();
  }
});

test('timeout (AbortError) returns null', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(abortError());
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      maxRetries: 0,
      backoffBaseMs: 1,
      timeoutMs: 10,
    });
    const result = await client.getBudgetStatus();
    assert.equal(result, null);
  } finally {
    mock.restore();
  }
});

test('retries on 5xx and eventually succeeds', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(503, { err: 'down' }));
    mock.queue.push(mockResponse(500, { err: 'down' }));
    mock.queue.push(mockResponse(200, { allow: false, reason: 'budget', cost: 0 }));

    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      maxRetries: 3,
      backoffBaseMs: 1,
    });
    const result = await client.evaluatePolicy({
      action: 'create_po',
      amount: 100,
      currency: 'ILS',
    });

    assert.deepEqual(result, { allow: false, reason: 'budget', cost: 0 });
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test('gives up after maxRetries on persistent 5xx', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(500, { err: 'down' }));
    mock.queue.push(mockResponse(500, { err: 'down' }));
    mock.queue.push(mockResponse(500, { err: 'down' }));
    mock.queue.push(mockResponse(500, { err: 'down' }));

    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      maxRetries: 3,
      backoffBaseMs: 1,
    });
    const result = await client.getBudgetStatus();
    assert.equal(result, null);
    assert.equal(mock.calls.length, 4); // 1 initial + 3 retries
  } finally {
    mock.restore();
  }
});

test('4xx is NOT retried and returns null', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(400, { err: 'bad request' }));
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      maxRetries: 3,
      backoffBaseMs: 1,
    });
    const result = await client.evaluatePolicy({
      action: 'create_po',
      amount: 100,
      currency: 'ILS',
    });
    assert.equal(result, null);
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test('healthCheck returns true on 200, false on error', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(200, { status: 'ok' }));
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      backoffBaseMs: 1,
      maxRetries: 0,
    });
    assert.equal(await client.healthCheck(), true);

    mock.queue.push(new Error('ECONNREFUSED'));
    assert.equal(await client.healthCheck(), false);
  } finally {
    mock.restore();
  }
});

test('recordEvent auto-fills timestamp and returns boolean', async () => {
  const mock = installFetchMock();
  try {
    mock.queue.push(mockResponse(202, { queued: true }));
    const client = new OnyxAiClient('http://localhost:3200', 'k', {
      logger: silentLogger,
      backoffBaseMs: 1,
    });
    const ok = await client.recordEvent({
      type: 'po.created',
      actor: 'user-1',
      subject: 'po-42',
    });
    assert.equal(ok, true);
    const sent = JSON.parse(mock.calls[0][1].body);
    assert.ok(sent.timestamp, 'timestamp should be auto-filled');
    assert.equal(sent.type, 'po.created');
  } finally {
    mock.restore();
  }
});

test('fetchImpl override is honored (no global mutation needed)', async () => {
  let seen = null;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return mockResponse(200, { allow: true, reason: 'override', cost: 0 });
  };
  const client = new OnyxAiClient('http://localhost:3200', 'k', {
    logger: silentLogger,
    fetchImpl: fakeFetch,
    backoffBaseMs: 1,
  });
  const result = await client.evaluatePolicy({
    action: 'create_po',
    amount: 1,
    currency: 'ILS',
  });
  assert.deepEqual(result, { allow: true, reason: 'override', cost: 0 });
  assert.equal(seen.url, 'http://localhost:3200/evaluate');
});
