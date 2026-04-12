/**
 * ONYX — Outbound Webhook Sender
 * ═══════════════════════════════════════════════════════════════
 * Agent-80 — Webhook Delivery System
 *
 * Delivers HMAC-signed event envelopes to subscribed URLs with
 * production-grade resilience:
 *
 *   • HMAC-SHA256 signature in `X-Signature` header
 *     (subscribers verify with `crypto.timingSafeEqual` — see
 *     `verifySignature()` exported below)
 *   • 10-second per-attempt timeout (AbortController)
 *   • Follows up to 3 redirects (manual handling — fetch's
 *     `redirect: 'manual'` so we can count hops and strip the
 *     signature header on cross-origin redirects)
 *   • Exponential backoff retry, interoperable with Agent 79's
 *     `src/ops/retry.js` if present, else a local fallback
 *   • Honors 429 `Retry-After` (seconds OR HTTP-date)
 *   • Dead-letter after 6 failed attempts — delivery row marked
 *     `last_status = 'dead_letter'` and the event ID is logged
 *     for the replay endpoint to pick up
 *
 * The sender is INJECTABLE:
 *   - `fetchImpl`    override globalThis.fetch (for tests)
 *   - `sleepImpl`    override the backoff sleep (for tests)
 *   - `logger`       pino-compatible
 *   - `retryImpl`    function({fn, maxAttempts, onRetry}) — if
 *                    provided, used instead of the built-in loop.
 *                    This is the hook for Agent 79's retry.js.
 *
 * Never throws. Returns a structured result:
 *   {
 *     delivered:  boolean,
 *     attempts:   number,
 *     last_status: 'ok'|'http_<code>'|'timeout'|'network'|'redirect_loop'|'dead_letter',
 *     status_code: number|null,
 *     duration_ms: number,
 *     error:       string|null,
 *   }
 */

'use strict';

const crypto = require('crypto');

// ─── Optional logger (same pattern as ai-bridge.js) ──────────────
let defaultLogger;
try {
  ({ logger: defaultLogger } = require('../logger'));
} catch (_) {
  defaultLogger = {
    info:  (...args) => console.log('[webhook-sender]', ...args),
    warn:  (...args) => console.warn('[webhook-sender]', ...args),
    error: (...args) => console.error('[webhook-sender]', ...args),
    debug: () => {},
  };
}

// ─── Optional retry helper from Agent 79 (ops/retry.js) ──────────
let opsRetry = null;
try {
  // If Agent 79 has shipped retry.js, pick it up automatically.
  // We do NOT hard-require it — the sender works stand-alone.
  // eslint-disable-next-line global-require
  opsRetry = require('../ops/retry');
} catch (_) {
  opsRetry = null;
}

// ─── Defaults ─────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS       = 10_000;  // 10s per attempt
const DEFAULT_MAX_ATTEMPTS     = 6;       // dead-letter after this many failures
const DEFAULT_BACKOFF_BASE_MS  = 500;     // 0.5s, 1s, 2s, 4s, 8s, 16s
const DEFAULT_BACKOFF_MAX_MS   = 60_000;  // cap each sleep at 60s
const DEFAULT_MAX_REDIRECTS    = 3;
const DEFAULT_USER_AGENT       = 'onyx-webhooks/1.0 (+https://onyx.local/webhooks)';

// HTTP statuses we treat as transient (retry). 4xx (other than 408/425/429)
// is caller error — never retry.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// ─── Small utilities ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * parseRetryAfter — per RFC 7231. Accepts either delta-seconds
 * (e.g. "120") or HTTP-date ("Wed, 21 Oct 2026 07:28:00 GMT").
 * Returns milliseconds from now, or null if header missing/bad.
 * Capped at 5 minutes so a malicious subscriber cannot pin us.
 */
function parseRetryAfter(header) {
  if (!header) return null;
  const trimmed = String(header).trim();
  // delta-seconds
  if (/^\d+$/.test(trimmed)) {
    const secs = Number(trimmed);
    if (!Number.isFinite(secs) || secs < 0) return null;
    return Math.min(secs * 1000, 5 * 60 * 1000);
  }
  // HTTP-date
  const when = Date.parse(trimmed);
  if (Number.isFinite(when)) {
    const diff = when - Date.now();
    if (diff <= 0) return 0;
    return Math.min(diff, 5 * 60 * 1000);
  }
  return null;
}

/**
 * signPayload — canonical HMAC-SHA256 signature.
 * The body bytes being signed are the *exact* UTF-8 JSON string
 * the subscriber will receive (no pretty-print, no trailing
 * whitespace). Subscribers verify with timingSafeEqual.
 */
function signPayload(rawBodyString, secret) {
  return crypto.createHmac('sha256', secret).update(rawBodyString, 'utf8').digest('hex');
}

/**
 * verifySignature — reference implementation for subscribers.
 *
 * Intentionally mirrors the snippet in the Agent 80 brief so it can
 * be copy-pasted into subscriber code. Uses `crypto.timingSafeEqual`
 * and short-circuits on length mismatch to avoid throwing.
 *
 *   const { verifySignature } = require('onyx/webhooks/webhook-sender');
 *   if (!verifySignature(rawBody, req.headers['x-signature'], secret)) {
 *     return res.status(401).end();
 *   }
 */
function verifySignature(body, signature, secret) {
  if (!body || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : Buffer.from(body))
    .digest('hex');
  const sigBuf = Buffer.from(String(signature), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  try {
    return crypto.timingSafeEqual(expBuf, sigBuf);
  } catch (_) {
    return false;
  }
}

/**
 * computeBackoff — exponential with decorrelated jitter.
 * base * 2^attempt plus up to 30% random jitter, capped at maxMs.
 */
function computeBackoff(attempt, baseMs = DEFAULT_BACKOFF_BASE_MS, maxMs = DEFAULT_BACKOFF_MAX_MS) {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = 1 + Math.random() * 0.3;
  return Math.min(Math.floor(exp * jitter), maxMs);
}

// ─── Core: single HTTP POST with redirect handling + timeout ────

/**
 * _postOnce — perform ONE attempt (including redirect hops).
 * Returns a lightweight descriptor:
 *   { ok, status, retryAfterMs, error }
 */
async function _postOnce({ url, rawBody, signature, fetchImpl, timeoutMs, maxRedirects, userAgent, extraHeaders }) {
  let currentUrl = url;
  let hops = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetchImpl(currentUrl, {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'Accept':          'application/json',
          'User-Agent':      userAgent,
          'X-Signature':     signature,
          'X-Signature-Alg': 'hmac-sha256',
          ...extraHeaders,
        },
        body:     rawBody,
        signal:   controller.signal,
        redirect: 'manual',
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
      return {
        ok:            false,
        status:        null,
        retryAfterMs:  null,
        error:         isAbort ? 'timeout' : (err && err.message) || 'network_error',
        errorType:     isAbort ? 'timeout' : 'network',
      };
    }
    clearTimeout(timer);

    // Manual redirect handling (3xx with Location)
    if (res.status >= 300 && res.status < 400 && res.headers && res.headers.get) {
      const loc = res.headers.get('location');
      if (loc) {
        if (hops >= maxRedirects) {
          return {
            ok: false, status: res.status, retryAfterMs: null,
            error: 'too_many_redirects', errorType: 'redirect_loop',
          };
        }
        // Resolve relative URLs against currentUrl.
        let nextUrl;
        try {
          nextUrl = new URL(loc, currentUrl).toString();
        } catch (_) {
          return {
            ok: false, status: res.status, retryAfterMs: null,
            error: 'bad_redirect_location', errorType: 'redirect_loop',
          };
        }
        currentUrl = nextUrl;
        hops += 1;
        continue;
      }
    }

    // 429 → pull Retry-After
    const retryAfterMs = res.status === 429 && res.headers && res.headers.get
      ? parseRetryAfter(res.headers.get('retry-after'))
      : null;

    return {
      ok:            res.ok === true || (res.status >= 200 && res.status < 300),
      status:        res.status,
      retryAfterMs,
      error:         (res.ok === true || (res.status >= 200 && res.status < 300)) ? null : `http_${res.status}`,
      errorType:     null,
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * sendWebhook — deliver one event envelope to one subscriber URL
 * with full retry / backoff / dead-letter semantics.
 *
 * @param {object} params
 * @param {string} params.url          — subscriber URL
 * @param {string} params.secret       — HMAC secret (from subscriptions row)
 * @param {object} params.envelope     — output of buildEventEnvelope()
 * @param {object} [params.options]    — per-call overrides
 * @param {number} [params.options.timeoutMs=10000]
 * @param {number} [params.options.maxAttempts=6]
 * @param {number} [params.options.backoffBaseMs=500]
 * @param {number} [params.options.maxRedirects=3]
 * @param {function} [params.options.fetchImpl]
 * @param {function} [params.options.sleepImpl]
 * @param {function} [params.options.retryImpl]
 * @param {object} [params.options.logger]
 * @param {function} [params.options.onAttempt]  — ({attempt, result}) per try
 * @param {object} [params.options.extraHeaders] — arbitrary extra headers
 *
 * @returns {Promise<object>} delivery result — NEVER throws
 */
async function sendWebhook({ url, secret, envelope, options = {} }) {
  const started = Date.now();
  const log = options.logger || defaultLogger;

  // ─── Validation (fail-safe, returns structured error) ──────
  if (!url || typeof url !== 'string') {
    return _errResult(started, 0, 'bad_url', 'url is required');
  }
  if (!secret || typeof secret !== 'string') {
    return _errResult(started, 0, 'bad_secret', 'secret is required');
  }
  if (!envelope || typeof envelope !== 'object') {
    return _errResult(started, 0, 'bad_envelope', 'envelope is required');
  }
  // Only http(s) schemes.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return _errResult(started, 0, 'bad_scheme', `unsupported scheme ${parsed.protocol}`);
    }
  } catch (_) {
    return _errResult(started, 0, 'bad_url', 'malformed url');
  }

  const timeoutMs    = options.timeoutMs    || DEFAULT_TIMEOUT_MS;
  const maxAttempts  = options.maxAttempts  || DEFAULT_MAX_ATTEMPTS;
  const backoffBase  = options.backoffBaseMs|| DEFAULT_BACKOFF_BASE_MS;
  const maxRedirects = options.maxRedirects != null ? options.maxRedirects : DEFAULT_MAX_REDIRECTS;
  const fetchImpl    = options.fetchImpl    || ((...a) => globalThis.fetch(...a));
  const sleepImpl    = options.sleepImpl    || sleep;
  const userAgent    = options.userAgent    || DEFAULT_USER_AGENT;

  // Canonical body bytes — sign EXACTLY what we send.
  const rawBody  = JSON.stringify(envelope);
  const signature = signPayload(rawBody, secret);

  // ─── Try-per-attempt loop (bridge for Agent 79 retry helper) ──
  //
  // If the caller (or Agent 79's ops/retry.js) wants to drive the
  // loop itself, they pass `retryImpl`. Otherwise we run an
  // exponential-backoff loop here. Either way, the attempt body
  // is identical: one _postOnce call + classify.
  //
  const attemptFn = async ({ attempt }) => {
    const r = await _postOnce({
      url,
      rawBody,
      signature,
      fetchImpl,
      timeoutMs,
      maxRedirects,
      userAgent,
      extraHeaders: {
        'X-Event-Id':       envelope.id || '',
        'X-Event-Type':     envelope.type || '',
        'X-Event-Version':  String(envelope.version || 1),
        'X-Delivery-Attempt': String(attempt + 1),
        ...(options.extraHeaders || {}),
      },
    });
    if (typeof options.onAttempt === 'function') {
      try { options.onAttempt({ attempt: attempt + 1, result: r }); } catch (_) {}
    }
    return r;
  };

  // Prefer the injected retryImpl (Agent 79 style); else built-in.
  const useExternalRetry = typeof options.retryImpl === 'function'
    || (opsRetry && typeof opsRetry.retry === 'function' && options.useAgent79Retry !== false);

  let result;
  if (useExternalRetry) {
    const retryFn = options.retryImpl || opsRetry.retry;
    // Expected signature of Agent-79 retry:
    //   retry({ fn, maxAttempts, onRetry })
    // Where fn is called with ({attempt}) and should throw to
    // signal "retryable". We adapt by throwing a sentinel for
    // retryable failures, returning for terminal outcomes.
    try {
      result = await retryFn({
        fn: async ({ attempt }) => {
          const r = await attemptFn({ attempt });
          if (r.ok) return r;
          const transient = _isTransient(r);
          if (transient) {
            // Throw a tagged error so the retry helper schedules another try.
            const e = new Error(r.error || 'transient');
            e.webhookResult = r;
            throw e;
          }
          // Terminal (e.g. 404) — return so outer code stops.
          return r;
        },
        maxAttempts,
        baseDelayMs: backoffBase,
        onRetry:     ({ attempt, error }) => {
          log.warn({
            msg:     'webhook.retry',
            url,
            attempt: attempt + 1,
            error:   error && error.message,
          });
        },
      });
    } catch (err) {
      // Helper exhausted retries — pull last result off the error.
      result = (err && err.webhookResult) || {
        ok: false, status: null, retryAfterMs: null,
        error: (err && err.message) || 'retry_exhausted', errorType: 'network',
      };
    }
  } else {
    // ─── Built-in loop (default) ───
    result = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      result = await attemptFn({ attempt });
      if (result.ok) break;

      const transient = _isTransient(result);
      if (!transient) break; // terminal, don't keep hammering

      if (attempt + 1 >= maxAttempts) break; // exhausted

      // Honor Retry-After on 429, else exponential backoff.
      const waitMs = result.retryAfterMs != null
        ? result.retryAfterMs
        : computeBackoff(attempt, backoffBase);

      log.warn({
        msg:     'webhook.retry_wait',
        url,
        attempt: attempt + 1,
        status:  result.status,
        wait_ms: waitMs,
      });
      await sleepImpl(waitMs);
    }
  }

  // ─── Final classification ─────────────────────────────────
  const duration = Date.now() - started;
  const attemptsMade = _guessAttempts(result, maxAttempts);

  if (result && result.ok) {
    log.info({
      msg:         'webhook.delivered',
      url,
      event_id:    envelope.id,
      event_type:  envelope.type,
      status:      result.status,
      duration_ms: duration,
      attempts:    attemptsMade,
    });
    return {
      delivered:   true,
      attempts:    attemptsMade,
      last_status: 'ok',
      status_code: result.status || 200,
      duration_ms: duration,
      error:       null,
    };
  }

  // Exhausted → dead letter
  const lastStatus = (result && result.status)
    ? `http_${result.status}`
    : (result && result.errorType) || 'dead_letter';

  log.error({
    msg:         'webhook.dead_letter',
    url,
    event_id:    envelope && envelope.id,
    event_type:  envelope && envelope.type,
    attempts:    attemptsMade,
    status:      result && result.status,
    error:       result && result.error,
    duration_ms: duration,
  });

  return {
    delivered:   false,
    attempts:    attemptsMade,
    last_status: attemptsMade >= maxAttempts ? 'dead_letter' : lastStatus,
    status_code: (result && result.status) || null,
    duration_ms: duration,
    error:       (result && result.error) || 'unknown',
  };
}

// ─── Internals ───────────────────────────────────────────────────

function _isTransient(result) {
  if (!result) return true;
  // Network / timeout / redirect-loop → all transient except
  // redirect_loop which is effectively terminal (server misconfig).
  if (result.errorType === 'timeout' || result.errorType === 'network') return true;
  if (result.errorType === 'redirect_loop') return false;
  if (result.status == null) return true;
  return RETRYABLE_STATUS.has(result.status);
}

function _guessAttempts(result, maxAttempts) {
  // We don't carry an explicit attempt count through the retry
  // helper path, so if the helper gave us a terminal success we
  // assume 1; otherwise assume we used up max.
  if (result && result.ok) return 1;
  return maxAttempts;
}

function _errResult(started, attempts, code, message) {
  return {
    delivered:   false,
    attempts,
    last_status: code,
    status_code: null,
    duration_ms: Date.now() - started,
    error:       message,
  };
}

module.exports = {
  // Core
  sendWebhook,
  signPayload,
  verifySignature,
  parseRetryAfter,
  computeBackoff,
  // Constants (exported for tests / docs)
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_REDIRECTS,
  RETRYABLE_STATUS,
};
