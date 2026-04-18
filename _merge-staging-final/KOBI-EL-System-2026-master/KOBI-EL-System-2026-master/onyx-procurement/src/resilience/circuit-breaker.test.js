/**
 * Unit tests for src/resilience/circuit-breaker.js
 * Agent-79 — Resilience pack.
 *
 * Run:
 *   node --test src/resilience/circuit-breaker.test.js
 *
 * Strategy:
 *   - Inject a fake clock via `now()` so state transitions can be
 *     driven deterministically without real sleeps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CircuitBreaker,
  CircuitOpenError,
  STATES,
} = require('./circuit-breaker');

// ─── Fake clock helper ─────────────────────────────────────────
function makeClock(start = 1_000_000) {
  const state = { t: start };
  return {
    now: () => state.t,
    advance: (ms) => { state.t += ms; },
    set: (ms) => { state.t = ms; },
  };
}

// ───────────────────────────────────────────────────────────────
test('CircuitBreaker: starts CLOSED', () => {
  const cb = new CircuitBreaker({ name: 't' });
  assert.equal(cb.state, STATES.CLOSED);
  assert.equal(cb.snapshot().failureCount, 0);
});

test('CircuitBreaker: passes through success', async () => {
  const cb = new CircuitBreaker({ name: 't' });
  const result = await cb.execute(async () => 42);
  assert.equal(result, 42);
  assert.equal(cb.state, STATES.CLOSED);
});

test('CircuitBreaker: opens after failureThreshold failures in window', async () => {
  const clock = makeClock();
  const transitions = [];
  const cb = new CircuitBreaker({
    name: 't',
    failureThreshold: 3,
    windowMs: 10_000,
    timeoutMs: 5_000,
    now: clock.now,
    onStateChange: (from, to) => transitions.push([from, to]),
  });

  const failing = async () => { throw new Error('boom'); };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(cb.execute(failing), /boom/);
  }
  assert.equal(cb.state, STATES.CLOSED, 'still closed at 2 failures');

  await assert.rejects(cb.execute(failing), /boom/);
  assert.equal(cb.state, STATES.OPEN);
  assert.deepEqual(transitions.at(-1), [STATES.CLOSED, STATES.OPEN]);
});

test('CircuitBreaker: OPEN throws CircuitOpenError without running fn', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    name: 'upstream',
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 5_000,
    now: clock.now,
  });

  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  assert.equal(cb.state, STATES.OPEN);

  let ran = false;
  await assert.rejects(
    cb.execute(async () => { ran = true; return 1; }),
    (err) => err instanceof CircuitOpenError && err.circuitName === 'upstream',
  );
  assert.equal(ran, false, 'fn must not run while OPEN');
});

test('CircuitBreaker: OPEN → HALF_OPEN after timeoutMs', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 5_000,
    successThreshold: 2,
    now: clock.now,
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  assert.equal(cb.state, STATES.OPEN);

  clock.advance(4_999);
  assert.equal(cb.state, STATES.OPEN, 'still open before timeout');

  clock.advance(2);
  // reading state should auto-promote
  assert.equal(cb.state, STATES.HALF_OPEN);
});

test('CircuitBreaker: HALF_OPEN → CLOSED after successThreshold successes', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 10,
    successThreshold: 2,
    halfOpenMaxConcurrent: 5,
    now: clock.now,
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  assert.equal(cb.state, STATES.OPEN);
  clock.advance(11);
  assert.equal(cb.state, STATES.HALF_OPEN);

  // First probe succeeds → still HALF_OPEN, 1/2 successes
  await cb.execute(async () => 'a');
  assert.equal(cb.state, STATES.HALF_OPEN);

  // Second probe succeeds → closes
  await cb.execute(async () => 'b');
  assert.equal(cb.state, STATES.CLOSED);
  assert.equal(cb.snapshot().failureCount, 0);
});

test('CircuitBreaker: failure in HALF_OPEN reopens immediately', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 10,
    successThreshold: 3,
    halfOpenMaxConcurrent: 5,
    now: clock.now,
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  clock.advance(11);
  assert.equal(cb.state, STATES.HALF_OPEN);

  await assert.rejects(cb.execute(async () => { throw new Error('still broken'); }));
  assert.equal(cb.state, STATES.OPEN);
});

test('CircuitBreaker: HALF_OPEN limits concurrent probes', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 10,
    successThreshold: 1,
    halfOpenMaxConcurrent: 1,
    now: clock.now,
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  clock.advance(11);
  assert.equal(cb.state, STATES.HALF_OPEN);

  // Start a probe that never resolves
  let unblock;
  const blocked = new Promise((r) => { unblock = r; });
  const probe1 = cb.execute(() => blocked);

  // A second concurrent probe should be rejected with CircuitOpenError
  await assert.rejects(
    cb.execute(async () => 'other'),
    (err) => err instanceof CircuitOpenError,
  );

  unblock('ok');
  assert.equal(await probe1, 'ok');
});

test('CircuitBreaker: sliding window prunes old failures', async () => {
  const clock = makeClock();
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    windowMs: 1_000,
    timeoutMs: 5_000,
    now: clock.now,
  });

  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  clock.advance(500);
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  clock.advance(600); // the first failure is now > 1000ms old → pruned
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  // Only 2 in-window failures → still CLOSED
  assert.equal(cb.state, STATES.CLOSED);
});

test('CircuitBreaker: reset() returns to CLOSED and clears state', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, windowMs: 1_000 });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  assert.equal(cb.state, STATES.OPEN);
  cb.reset();
  assert.equal(cb.state, STATES.CLOSED);
  assert.equal(cb.snapshot().failureCount, 0);
});

test('CircuitBreaker: forceOpen transitions immediately', () => {
  const cb = new CircuitBreaker();
  cb.forceOpen();
  assert.equal(cb.state, STATES.OPEN);
});

test('CircuitBreaker: CircuitOpenError exposes retryAt metadata', async () => {
  const clock = makeClock(1000);
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    windowMs: 1_000,
    timeoutMs: 5_000,
    now: clock.now,
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  try {
    await cb.execute(async () => 1);
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof CircuitOpenError);
    assert.equal(err.openedAt, 1000);
    assert.equal(err.retryAt, 6000);
    assert.equal(err.isCircuitOpen, true);
  }
});

test('CircuitBreaker: rejects invalid thresholds', () => {
  assert.throws(() => new CircuitBreaker({ failureThreshold: 0 }), RangeError);
  assert.throws(() => new CircuitBreaker({ successThreshold: 0 }), RangeError);
});

test('CircuitBreaker: onStateChange errors do not propagate', async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    onStateChange: () => { throw new Error('observer crashed'); },
  });
  await assert.rejects(cb.execute(async () => { throw new Error('x'); }));
  // Should still have opened cleanly.
  assert.equal(cb.state, STATES.OPEN);
});
