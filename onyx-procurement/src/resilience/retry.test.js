/**
 * Unit tests for src/resilience/retry.js
 * Agent-79 — Resilience pack.
 *
 * Run:
 *   node --test src/resilience/retry.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  retry,
  _computeDelay,
  _defaultRetryOn,
} = require('./retry');

// ───────────────────────────────────────────────────────────────
// _computeDelay — pure function, no timers
// ───────────────────────────────────────────────────────────────

test('_computeDelay: exponential backoff doubles each attempt', () => {
  assert.equal(_computeDelay('exponential', 1, 100, 10_000), 100);
  assert.equal(_computeDelay('exponential', 2, 100, 10_000), 200);
  assert.equal(_computeDelay('exponential', 3, 100, 10_000), 400);
  assert.equal(_computeDelay('exponential', 4, 100, 10_000), 800);
});

test('_computeDelay: linear backoff scales by attempt', () => {
  assert.equal(_computeDelay('linear', 1, 100, 10_000), 100);
  assert.equal(_computeDelay('linear', 2, 100, 10_000), 200);
  assert.equal(_computeDelay('linear', 3, 100, 10_000), 300);
});

test('_computeDelay: fixed backoff returns initial regardless of attempt', () => {
  assert.equal(_computeDelay('fixed', 1, 250, 10_000), 250);
  assert.equal(_computeDelay('fixed', 5, 250, 10_000), 250);
  assert.equal(_computeDelay('fixed', 99, 250, 10_000), 250);
});

test('_computeDelay: maxDelayMs caps the result', () => {
  assert.equal(_computeDelay('exponential', 10, 100, 500), 500);
  assert.equal(_computeDelay('linear', 100, 100, 500), 500);
});

// ───────────────────────────────────────────────────────────────
// _defaultRetryOn — predicate behavior
// ───────────────────────────────────────────────────────────────

test('_defaultRetryOn: retries 5xx', () => {
  assert.equal(_defaultRetryOn({ status: 500 }), true);
  assert.equal(_defaultRetryOn({ statusCode: 503 }), true);
});

test('_defaultRetryOn: does not retry 4xx', () => {
  assert.equal(_defaultRetryOn({ status: 400 }), false);
  assert.equal(_defaultRetryOn({ status: 404 }), false);
  assert.equal(_defaultRetryOn({ statusCode: 429 }), false);
});

test('_defaultRetryOn: retries generic Errors with no status', () => {
  assert.equal(_defaultRetryOn(new Error('ETIMEDOUT')), true);
});

// ───────────────────────────────────────────────────────────────
// retry() — happy path
// ───────────────────────────────────────────────────────────────

test('retry: returns value on first success without waiting', async () => {
  let calls = 0;
  const fn = async () => { calls += 1; return 'ok'; };
  const wrapped = retry(fn, { maxAttempts: 3, initialDelayMs: 1_000 });
  const start = Date.now();
  const result = await wrapped();
  const elapsed = Date.now() - start;
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
  assert.ok(elapsed < 100, `expected <100ms, got ${elapsed}ms`);
});

test('retry: retries until success and forwards args', async () => {
  let calls = 0;
  const fn = async (a, b) => {
    calls += 1;
    if (calls < 3) throw new Error('transient');
    return a + b;
  };
  const wrapped = retry(fn, {
    maxAttempts: 5,
    initialDelayMs: 1,
    maxDelayMs: 1,
    jitter: false,
  });
  const result = await wrapped(2, 3);
  assert.equal(result, 5);
  assert.equal(calls, 3);
});

test('retry: throws last error after maxAttempts', async () => {
  let calls = 0;
  const fn = async () => { calls += 1; throw new Error(`boom-${calls}`); };
  const wrapped = retry(fn, {
    maxAttempts: 3,
    initialDelayMs: 1,
    maxDelayMs: 1,
    jitter: false,
  });
  await assert.rejects(wrapped(), /boom-3/);
  assert.equal(calls, 3);
});

test('retry: stops immediately when retryOn returns false', async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    const err = new Error('bad request');
    err.status = 400;
    throw err;
  };
  const wrapped = retry(fn, {
    maxAttempts: 5,
    initialDelayMs: 1,
    jitter: false,
  });
  await assert.rejects(wrapped(), /bad request/);
  assert.equal(calls, 1, 'should not retry on 4xx');
});

test('retry: custom retryOn predicate is honored', async () => {
  let calls = 0;
  const fn = async () => { calls += 1; const e = new Error('fatal'); e.fatal = true; throw e; };
  const wrapped = retry(fn, {
    maxAttempts: 5,
    initialDelayMs: 1,
    jitter: false,
    retryOn: (e) => !e.fatal,
  });
  await assert.rejects(wrapped(), /fatal/);
  assert.equal(calls, 1);
});

test('retry: onRetry hook is called with (attempt, err, delay)', async () => {
  const calls = [];
  let tries = 0;
  const fn = async () => {
    tries += 1;
    if (tries < 3) throw new Error(`t${tries}`);
    return 'done';
  };
  const wrapped = retry(fn, {
    maxAttempts: 5,
    initialDelayMs: 1,
    jitter: false,
    onRetry: (attempt, err, delay) => calls.push({ attempt, msg: err.message, delay }),
  });
  await wrapped();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].attempt, 1);
  assert.equal(calls[0].msg, 't1');
  assert.equal(calls[1].attempt, 2);
  assert.equal(calls[1].msg, 't2');
});

test('retry: onRetry exception does not break the retry loop', async () => {
  let tries = 0;
  const fn = async () => { tries += 1; if (tries < 2) throw new Error('nope'); return 'yes'; };
  const wrapped = retry(fn, {
    maxAttempts: 3,
    initialDelayMs: 1,
    jitter: false,
    onRetry: () => { throw new Error('observer crashed'); },
  });
  assert.equal(await wrapped(), 'yes');
});

test('retry: rejects invalid maxAttempts', () => {
  assert.throws(() => retry(async () => 1, { maxAttempts: 0 }), RangeError);
  assert.throws(() => retry(async () => 1, { maxAttempts: -1 }), RangeError);
  assert.throws(() => retry(async () => 1, { maxAttempts: 1.5 }), RangeError);
});

test('retry: rejects invalid backoff strategy', () => {
  assert.throws(() => retry(async () => 1, { backoff: 'fancy' }), RangeError);
});

test('retry: rejects non-function fn', () => {
  assert.throws(() => retry('not a fn'), TypeError);
});

test('retry: jitter=false produces deterministic delays', async () => {
  // Indirect: measure that total wall time is in expected range.
  let tries = 0;
  const fn = async () => { tries += 1; if (tries < 3) throw new Error('x'); return 'ok'; };
  const wrapped = retry(fn, {
    maxAttempts: 5,
    backoff: 'fixed',
    initialDelayMs: 20,
    maxDelayMs: 20,
    jitter: false,
  });
  const start = Date.now();
  await wrapped();
  const elapsed = Date.now() - start;
  // Two retries × 20ms = 40ms minimum. Allow slack for timer drift.
  assert.ok(elapsed >= 30, `expected >=30ms, got ${elapsed}`);
  assert.ok(elapsed < 300, `expected <300ms, got ${elapsed}`);
});

test('retry: honors AbortSignal between attempts', async () => {
  let tries = 0;
  const ac = new AbortController();
  const fn = async () => { tries += 1; throw new Error('again'); };
  const wrapped = retry(fn, {
    maxAttempts: 10,
    initialDelayMs: 1_000,
    maxDelayMs: 1_000,
    jitter: false,
    signal: ac.signal,
  });
  const p = wrapped();
  // Abort shortly after first failure is recorded.
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(p, /aborted|again/);
  // We should have fewer than 10 calls because abort cut us short.
  assert.ok(tries < 10, `expected early termination, got ${tries}`);
});
