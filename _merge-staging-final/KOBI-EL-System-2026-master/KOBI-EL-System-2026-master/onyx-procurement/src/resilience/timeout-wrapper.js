/**
 * ONYX — Promise Timeout Wrapper
 * ═══════════════════════════════════════════════════════════════
 *
 * `withTimeout(promise, ms, errorMsg?)`
 *
 * Races a promise against a timer. If the timer wins, the returned
 * promise rejects with a TimeoutError. If the underlying operation
 * exposes an AbortController / cancel method / .abort(), we invoke it
 * so resources aren't leaked after a timeout.
 *
 * Two flavors:
 *
 *   1) Plain promise:
 *        const result = await withTimeout(somePromise, 5000);
 *
 *   2) Task factory (recommended — gives us an AbortSignal to cancel):
 *        const result = await withTimeout(
 *          (signal) => fetch(url, { signal }),
 *          5000,
 *          'fetch timed out'
 *        );
 *      The factory is called with a fresh AbortController.signal that
 *      is aborted automatically when the timeout fires.
 *
 * Properties:
 *   - Always clears its internal timer so the event loop isn't pinned.
 *   - If the underlying promise settles first, the timer is cleared.
 *   - On timeout, throws a TimeoutError (instance of Error, name=TimeoutError,
 *     err.timeoutMs is the configured duration, err.code='ETIMEDOUT').
 *
 * Zero external dependencies.
 */

'use strict';

class TimeoutError extends Error {
  constructor(message, ms) {
    super(message || `Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.code = 'ETIMEDOUT';
    this.timeoutMs = ms;
    this.isTimeout = true;
  }
}

/**
 * _bestEffortCancel — try every known cancel hook on a settle-able target.
 *
 * We deliberately support multiple shapes because callers will pass many
 * different upstream primitives (axios cancel tokens, node-fetch, xhr-style
 * objects, custom promises with `.cancel()`).
 */
function _bestEffortCancel(target, controller) {
  if (controller && typeof controller.abort === 'function') {
    try { controller.abort(); } catch (_e) {}
  }
  if (!target) return;
  if (typeof target.cancel === 'function') {
    try { target.cancel(); } catch (_e) {}
  }
  if (typeof target.abort === 'function') {
    try { target.abort(); } catch (_e) {}
  }
  if (target.controller && typeof target.controller.abort === 'function') {
    try { target.controller.abort(); } catch (_e) {}
  }
}

/**
 * withTimeout — race a promise or promise-factory against a timer.
 *
 * @param {Promise|Function} input        Promise OR (signal)=>Promise
 * @param {number}           ms           timeout in milliseconds
 * @param {string}           [errorMsg]   custom error message
 * @returns {Promise<any>}
 */
function withTimeout(input, ms, errorMsg) {
  if (!Number.isFinite(ms) || ms < 0) {
    return Promise.reject(new RangeError('withTimeout: ms must be a non-negative number'));
  }

  // Factory form — create an AbortController so we can cancel.
  const isFactory = typeof input === 'function';
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;

  let promise;
  if (isFactory) {
    try {
      promise = Promise.resolve(input(controller ? controller.signal : undefined));
    } catch (err) {
      return Promise.reject(err);
    }
  } else {
    if (!input || typeof input.then !== 'function') {
      return Promise.reject(new TypeError('withTimeout: input must be a Promise or factory'));
    }
    promise = input;
  }

  let timer = null;
  let settled = false;

  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      _bestEffortCancel(promise, controller);
      reject(new TimeoutError(errorMsg, ms));
    }, ms);

    // Allow the process to exit even if the timer is still pending.
    if (timer && typeof timer.unref === 'function') {
      try { timer.unref(); } catch (_e) {}
    }

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

module.exports = {
  withTimeout,
  TimeoutError,
  _bestEffortCancel,
};
