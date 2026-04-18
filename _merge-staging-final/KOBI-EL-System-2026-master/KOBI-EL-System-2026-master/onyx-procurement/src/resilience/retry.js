/**
 * ONYX — Generic Retry Policy
 * ═══════════════════════════════════════════════════════════════
 *
 * Higher-order wrapper around any async function that adds retry with
 * configurable back-off (exponential / linear / fixed), jitter, and a
 * pluggable `retryOn` predicate so callers can opt-out of retrying
 * client errors (4xx) or non-transient failures.
 *
 * Zero external dependencies — pure Node / browser-safe.
 *
 * Example:
 *   const safeFetch = retry(fetchOnce, {
 *     maxAttempts: 5,
 *     backoff: 'exponential',
 *     initialDelayMs: 1000,
 *     maxDelayMs: 60000,
 *     jitter: true,
 *     retryOn: (err) => !(err && err.status >= 400 && err.status < 500),
 *     onRetry: (attempt, err, delay) => logger.warn({attempt, err, delay}),
 *   });
 *
 * Contract:
 *   - Calls `fn(...args)` up to `maxAttempts` times.
 *   - On success: returns fn's resolved value.
 *   - On failure: if `retryOn(err)` returns false, throws immediately.
 *     Otherwise, waits (backoff + optional jitter) and tries again.
 *   - After the last attempt, throws the most recent error.
 *   - `maxDelayMs` caps per-attempt sleep time.
 *
 * Notes:
 *   - `fn` may return any Promise — both sync-throw and async-reject are
 *     routed through the same retry path.
 *   - `onRetry` is invoked AFTER the failure but BEFORE the sleep, so
 *     logs see `(attempt, err, delay)` in order.
 *   - Pass `signal` (AbortSignal) in opts to cancel mid-sleep or
 *     between attempts (useful for shutdown hooks).
 */

'use strict';

// ─── Default predicate: retry everything except 4xx HTTP errors ──
// Treats 4xx as caller's problem (bad input, auth, not found) and
// 5xx / network errors / timeouts / thrown Errors as transient.
function _defaultRetryOn(err) {
  if (!err) return false;
  const s = err.status || err.statusCode;
  if (typeof s === 'number' && s >= 400 && s < 500) return false;
  return true;
}

// ─── Default onRetry: no-op ──────────────────────────────────────
function _noop() {}

// ─── Sleep with AbortSignal support ──────────────────────────────
function _sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new Error('retry aborted'));
    }
    const t = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new Error('retry aborted'));
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── Compute next delay by strategy ──────────────────────────────
// `attempt` is 1-indexed: first retry = attempt 1.
function _computeDelay(strategy, attempt, initialDelayMs, maxDelayMs) {
  let base;
  switch (strategy) {
    case 'fixed':
      base = initialDelayMs;
      break;
    case 'linear':
      base = initialDelayMs * attempt;
      break;
    case 'exponential':
    default:
      // 2^(attempt-1) * initial: 1x, 2x, 4x, 8x, 16x …
      base = initialDelayMs * Math.pow(2, attempt - 1);
      break;
  }
  return Math.min(base, maxDelayMs);
}

// ─── Apply jitter: full-jitter strategy (0 .. delay) ─────────────
// Using full-jitter per AWS guidance — better for thundering-herd
// avoidance than equal-jitter when many clients retry in lockstep.
function _applyJitter(delay) {
  return Math.floor(Math.random() * (delay + 1));
}

/**
 * retry — wrap an async function with retry+backoff semantics.
 *
 * @param {Function} fn                 async (or sync-throwing) function
 * @param {Object}   [opts]
 * @param {number}   [opts.maxAttempts=5]
 * @param {string}   [opts.backoff='exponential']  'exponential'|'linear'|'fixed'
 * @param {number}   [opts.initialDelayMs=1000]
 * @param {number}   [opts.maxDelayMs=60000]
 * @param {boolean}  [opts.jitter=true]
 * @param {Function} [opts.retryOn]     (err) => boolean — true to retry
 * @param {Function} [opts.onRetry]     (attempt, err, delayMs) => void
 * @param {AbortSignal} [opts.signal]   optional cancel signal
 * @returns {Function} wrapped function returning Promise
 */
function retry(fn, opts = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('retry: fn must be a function');
  }

  const {
    maxAttempts = 5,
    backoff = 'exponential',
    initialDelayMs = 1000,
    maxDelayMs = 60000,
    jitter = true,
    retryOn = _defaultRetryOn,
    onRetry = _noop,
    signal = null,
  } = opts;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('retry: maxAttempts must be a positive integer');
  }
  if (initialDelayMs < 0 || maxDelayMs < 0) {
    throw new RangeError('retry: delays must be >= 0');
  }
  if (!['exponential', 'linear', 'fixed'].includes(backoff)) {
    throw new RangeError(`retry: unknown backoff '${backoff}'`);
  }

  return async function retrying(...args) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal && signal.aborted) {
        throw new Error('retry aborted');
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        // Either out of attempts or predicate says "don't retry" → bubble.
        const isLast = attempt >= maxAttempts;
        let shouldRetry;
        try {
          shouldRetry = !!retryOn(err);
        } catch (_predicateErr) {
          shouldRetry = false; // predicate threw → don't retry
        }
        if (isLast || !shouldRetry) throw err;

        const raw = _computeDelay(backoff, attempt, initialDelayMs, maxDelayMs);
        const delay = jitter ? _applyJitter(raw) : raw;

        try {
          onRetry(attempt, err, delay);
        } catch (_hookErr) {
          /* onRetry must never break the flow */
        }

        // eslint-disable-next-line no-await-in-loop
        await _sleep(delay, signal);
      }
    }
    // Unreachable: loop either returns on success or throws on failure,
    // but kept as defensive fallthrough in case maxAttempts === 0 slipped.
    throw lastErr || new Error('retry: exhausted attempts');
  };
}

module.exports = {
  retry,
  // exposed for tests / custom callers
  _computeDelay,
  _applyJitter,
  _defaultRetryOn,
  _sleep,
};
