/**
 * ONYX — Circuit Breaker
 * ═══════════════════════════════════════════════════════════════
 *
 * Standard three-state breaker:
 *
 *           failures >= threshold in window
 *   CLOSED ──────────────────────────────────▶ OPEN
 *     ▲                                         │
 *     │ successes >= successThreshold           │ timeoutMs elapsed
 *     │                                         ▼
 *     └────────────────── HALF_OPEN  ◀──────────┘
 *                          (one trial at a time)
 *
 * State semantics:
 *   - CLOSED:    requests pass through; failures are counted in a
 *                sliding window of `windowMs`. If count reaches
 *                `failureThreshold`, we open the breaker.
 *   - OPEN:      requests are short-circuited with CircuitOpenError
 *                until `timeoutMs` has elapsed since opening, then
 *                transition to HALF_OPEN.
 *   - HALF_OPEN: only the first `halfOpenMaxConcurrent` requests are
 *                allowed through as probes. Every success increments
 *                a counter; hitting `successThreshold` returns to
 *                CLOSED. Any failure in HALF_OPEN reopens.
 *
 * Usage:
 *   const cb = new CircuitBreaker({
 *     failureThreshold: 5,          // 5 failures
 *     windowMs: 30_000,             // in 30s → OPEN
 *     timeoutMs: 60_000,            // stay OPEN for 60s then HALF_OPEN
 *     successThreshold: 2,          // 2 probes pass → CLOSED
 *     name: 'upstream-pcn836',
 *     onStateChange: (from, to) => logger.warn(...),
 *   });
 *
 *   try {
 *     const result = await cb.execute(() => callUpstream());
 *   } catch (err) {
 *     if (err instanceof CircuitOpenError) { ... }
 *   }
 *
 * Notes:
 *   - Zero deps, process-local. For multi-instance deployments use a
 *     shared store (Redis) keyed by `name`.
 *   - `execute` passes through fn's resolved value unchanged.
 *   - `failures` in window are pruned lazily on each call.
 *   - `halfOpenMaxConcurrent` defaults to 1 — single-probe breaker is
 *     safer than letting many requests in at once during recovery.
 */

'use strict';

const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

// ─── Typed error for short-circuited calls ──────────────────────
class CircuitOpenError extends Error {
  constructor(name, openedAt, retryAt) {
    super(`Circuit '${name}' is OPEN (retry after ${new Date(retryAt).toISOString()})`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.openedAt = openedAt;
    this.retryAt = retryAt;
    this.isCircuitOpen = true;
  }
}

class CircuitBreaker {
  /**
   * @param {Object}   opts
   * @param {string}   [opts.name='default']
   * @param {number}   [opts.failureThreshold=5]
   * @param {number}   [opts.windowMs=30000]    sliding failure window
   * @param {number}   [opts.timeoutMs=60000]   time OPEN before HALF_OPEN
   * @param {number}   [opts.successThreshold=2] probes to close from HALF_OPEN
   * @param {number}   [opts.halfOpenMaxConcurrent=1]
   * @param {Function} [opts.onStateChange]     (from, to, ctx) => void
   * @param {Function} [opts.now]               injectable clock for tests
   */
  constructor(opts = {}) {
    this.name = opts.name || 'default';
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.windowMs = opts.windowMs ?? 30_000;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.successThreshold = opts.successThreshold ?? 2;
    this.halfOpenMaxConcurrent = opts.halfOpenMaxConcurrent ?? 1;
    this.onStateChange = typeof opts.onStateChange === 'function'
      ? opts.onStateChange
      : () => {};
    this._now = typeof opts.now === 'function' ? opts.now : () => Date.now();

    if (this.failureThreshold < 1) {
      throw new RangeError('failureThreshold must be >= 1');
    }
    if (this.successThreshold < 1) {
      throw new RangeError('successThreshold must be >= 1');
    }

    this._state = STATES.CLOSED;
    this._failures = [];             // timestamps (ms) of failures
    this._openedAt = 0;              // ms since epoch when we went OPEN
    this._halfOpenInFlight = 0;      // probes currently running
    this._halfOpenSuccesses = 0;     // successes accumulated in HALF_OPEN
  }

  // ─── Public state accessor (pure read — never mutates) ──────
  get state() {
    // Transparently promote OPEN → HALF_OPEN when timeoutMs elapsed.
    if (this._state === STATES.OPEN && this._now() - this._openedAt >= this.timeoutMs) {
      this._transition(STATES.HALF_OPEN);
    }
    return this._state;
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this._activeFailureCount(),
      openedAt: this._openedAt || null,
      halfOpenInFlight: this._halfOpenInFlight,
      halfOpenSuccesses: this._halfOpenSuccesses,
    };
  }

  // ─── Main entrypoint ────────────────────────────────────────
  async execute(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('CircuitBreaker.execute: fn must be a function');
    }

    const st = this.state; // may auto-transition OPEN → HALF_OPEN

    if (st === STATES.OPEN) {
      throw new CircuitOpenError(
        this.name,
        this._openedAt,
        this._openedAt + this.timeoutMs,
      );
    }

    if (st === STATES.HALF_OPEN) {
      if (this._halfOpenInFlight >= this.halfOpenMaxConcurrent) {
        // Too many probes already — behave as OPEN for the overflow.
        throw new CircuitOpenError(
          this.name,
          this._openedAt,
          this._openedAt + this.timeoutMs,
        );
      }
      this._halfOpenInFlight += 1;
      try {
        const result = await fn();
        this._onSuccess();
        return result;
      } catch (err) {
        this._onFailure();
        throw err;
      } finally {
        this._halfOpenInFlight = Math.max(0, this._halfOpenInFlight - 1);
      }
    }

    // CLOSED
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  // ─── Explicit controls (for ops / tests) ────────────────────
  reset() {
    this._failures = [];
    this._openedAt = 0;
    this._halfOpenInFlight = 0;
    this._halfOpenSuccesses = 0;
    if (this._state !== STATES.CLOSED) this._transition(STATES.CLOSED);
  }

  forceOpen() {
    this._openedAt = this._now();
    this._transition(STATES.OPEN);
  }

  // ─── Internals ──────────────────────────────────────────────
  _activeFailureCount() {
    const cutoff = this._now() - this.windowMs;
    // prune in place (amortized O(1) per call)
    while (this._failures.length && this._failures[0] < cutoff) {
      this._failures.shift();
    }
    return this._failures.length;
  }

  _onSuccess() {
    if (this._state === STATES.HALF_OPEN) {
      this._halfOpenSuccesses += 1;
      if (this._halfOpenSuccesses >= this.successThreshold) {
        // Recovery complete — clear history & close.
        this._failures = [];
        this._halfOpenSuccesses = 0;
        this._openedAt = 0;
        this._transition(STATES.CLOSED);
      }
      return;
    }
    // CLOSED success — nothing to track beyond existing pruning.
  }

  _onFailure() {
    const now = this._now();
    if (this._state === STATES.HALF_OPEN) {
      // Any probe failure during recovery → re-open.
      this._openedAt = now;
      this._halfOpenSuccesses = 0;
      this._transition(STATES.OPEN);
      return;
    }

    // CLOSED: append & possibly trip.
    this._failures.push(now);
    if (this._activeFailureCount() >= this.failureThreshold) {
      this._openedAt = now;
      this._transition(STATES.OPEN);
    }
  }

  _transition(nextState) {
    const prev = this._state;
    if (prev === nextState) return;
    this._state = nextState;
    try {
      this.onStateChange(prev, nextState, {
        name: this.name,
        at: this._now(),
      });
    } catch (_err) { /* must never throw from a state hook */ }
  }
}

module.exports = {
  CircuitBreaker,
  CircuitOpenError,
  STATES,
};
