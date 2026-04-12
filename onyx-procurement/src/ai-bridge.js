/**
 * ONYX PROCUREMENT → ONYX AI Bridge
 * ────────────────────────────────────
 * Agent-20 — Integration Bridge (procurement side)
 *
 * Purpose:
 *   Thin, fail-open HTTP client that lets the procurement service call
 *   onyx-ai (port 3200) for:
 *     • policy evaluation   (POST /evaluate)
 *     • audit event ingest  (POST /events)
 *     • budget status       (GET  /budget)
 *     • health              (GET  /health)
 *
 * Design principles:
 *   1. Fail-open. Procurement is mission-critical; if onyx-ai is down,
 *      every method logs a warning and returns `null` — NEVER throws.
 *   2. Bounded latency. 5s timeout per attempt (AbortController).
 *   3. Retry only transient failures (network errors + HTTP 5xx), up to
 *      3 attempts with exponential backoff (250ms, 500ms, 1000ms).
 *   4. No new runtime dependencies — uses the global `fetch` shipped in
 *      Node 20+. Works under CommonJS (matches the rest of the repo).
 *   5. Authentication via X-API-Key header (ONYX_AI_API_KEY env var).
 *
 * Environment variables:
 *   ONYX_AI_URL       base url of onyx-ai   (default 'http://localhost:3200')
 *   ONYX_AI_API_KEY   shared secret sent as X-API-Key header  (required)
 *
 * Usage:
 *   const { OnyxAiClient, getDefaultClient } = require('./ai-bridge');
 *   const ai = getDefaultClient();
 *   const verdict = await ai.evaluatePolicy({ po_id, amount, vendor_id });
 *   if (verdict && verdict.allow === false) { ... }
 */

'use strict';

// logger is optional — the module loads cleanly even in test envs that
// mock it out. We fall back to console so ai-bridge.test.js can run in
// isolation without pulling pino.
let logger;
try {
  ({ logger } = require('./logger'));
} catch (_) {
  logger = {
    info:  (...args) => console.log('[onyx-ai-bridge]', ...args),
    warn:  (...args) => console.warn('[onyx-ai-bridge]', ...args),
    error: (...args) => console.error('[onyx-ai-bridge]', ...args),
    debug: () => {},
  };
}

// ───────────────────────────────────────────────────────────────
// Defaults & config
// ───────────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BASE_URL = 'http://localhost:3200';

// HTTP status codes that are worth retrying. 4xx is caller error — no point.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Agent-Y-QA03 FIX (BUG-01): 404 / 501 from the peer are not errors to be
// logged as warnings — they just mean the endpoint is not wired on this
// deployment. The module is fail-open, so we treat them as a clean soft-miss
// and return `null` without spamming the warn log.
const SOFT_MISS_STATUS = new Set([404, 501]);

/**
 * sleep — promise-based delay (cancel-safe).
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ───────────────────────────────────────────────────────────────
// OnyxAiClient — main class
// ───────────────────────────────────────────────────────────────
class OnyxAiClient {
  /**
   * @param {string} baseUrl  e.g. 'http://localhost:3200'
   * @param {string} apiKey   shared secret sent as X-API-Key
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs=5000]
   * @param {number} [opts.maxRetries=3]
   * @param {number} [opts.backoffBaseMs=250]
   * @param {object} [opts.logger]   pino-compatible logger
   * @param {Function} [opts.fetchImpl]   override for tests
   */
  constructor(baseUrl, apiKey, opts = {}) {
    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('OnyxAiClient: baseUrl is required and must be a string');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('OnyxAiClient: apiKey is required and must be a string');
    }

    // Strip trailing slash so we can join paths by concatenation.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries != null ? opts.maxRetries : DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs || DEFAULT_BACKOFF_BASE_MS;
    this.log = opts.logger || logger;
    // Allow tests to inject a fake fetch without monkey-patching global.
    this._fetch = opts.fetchImpl || ((...args) => globalThis.fetch(...args));
  }

  // ───────────────────────────────────────────────────────────
  // Low-level request with timeout + retry
  // Always returns { ok, status, body } | null (null = unrecoverable)
  // Never throws.
  // ───────────────────────────────────────────────────────────
  async _request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'User-Agent': 'onyx-procurement/1.1.0 (ai-bridge)',
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      init.signal = controller.signal;

      try {
        const res = await this._fetch(url, init);
        clearTimeout(timer);

        // Retry on transient 5xx / 429 / 408
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          this.log.warn({
            msg: 'onyx-ai.retryable_status',
            url,
            status: res.status,
            attempt: attempt + 1,
          });
          await sleep(this.backoffBaseMs * Math.pow(2, attempt));
          continue;
        }

        // Non-retryable: parse JSON if we can, return structured result.
        let parsed = null;
        try {
          const text = await res.text();
          parsed = text ? JSON.parse(text) : null;
        } catch (_parseErr) {
          parsed = null;
        }

        if (!res.ok) {
          if (SOFT_MISS_STATUS.has(res.status)) {
            // Expected: endpoint not wired on this onyx-ai deployment.
            // Stay quiet and let the caller treat null as "no answer".
            this.log.debug({ msg: 'onyx-ai.soft_miss', url, status: res.status });
            return null;
          }
          this.log.warn({
            msg: 'onyx-ai.non_ok',
            url,
            status: res.status,
            body: parsed,
          });
          return null;
        }

        return { ok: true, status: res.status, body: parsed };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
        this.log.warn({
          msg: isAbort ? 'onyx-ai.timeout' : 'onyx-ai.network_error',
          url,
          attempt: attempt + 1,
          error: err && err.message,
        });

        // Exhausted retries — give up, return null.
        if (attempt >= this.maxRetries) break;
        await sleep(this.backoffBaseMs * Math.pow(2, attempt));
      }
    }

    this.log.warn({
      msg: 'onyx-ai.unreachable',
      url,
      error: lastError && lastError.message,
    });
    return null;
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  /**
   * evaluatePolicy — ask onyx-ai whether a procurement action is permitted.
   *
   * Request shape:
   *   {
   *     action:       'create_po' | 'approve_po' | 'release_payment',
   *     po_id?:       string,
   *     vendor_id?:   string,
   *     amount:       number,
   *     currency:     string,            // 'ILS' | 'USD' | …
   *     metadata?:    Record<string, any>,
   *   }
   *
   * Response shape (on success):
   *   { allow: boolean, reason: string, cost: number }
   *
   * Returns `null` if onyx-ai is unreachable — callers MUST treat null as
   * "no answer" and follow their local fail-open policy (usually: allow).
   */
  async evaluatePolicy(request) {
    if (!request || typeof request !== 'object') {
      this.log.warn({ msg: 'onyx-ai.evaluatePolicy.bad_input' });
      return null;
    }
    const res = await this._request('POST', '/evaluate', request);
    return res ? res.body : null;
  }

  /**
   * recordEvent — fire-and-forget audit event ingest.
   *
   * Event shape:
   *   {
   *     type:       string,              // 'po.created' | 'payment.released' | …
   *     actor:      string,              // user id or service id
   *     timestamp:  string,              // ISO-8601 — auto-filled if missing
   *     subject:    string,              // resource id, e.g. 'po-42'
   *     payload?:   Record<string, any>,
   *   }
   *
   * The returned promise resolves to `true` on a successful enqueue,
   * `false` otherwise. Callers typically ignore the return value.
   */
  async recordEvent(event) {
    if (!event || typeof event !== 'object') {
      this.log.warn({ msg: 'onyx-ai.recordEvent.bad_input' });
      return false;
    }
    const enriched = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    const res = await this._request('POST', '/events', enriched);
    return res !== null;
  }

  /**
   * getBudgetStatus — how much of the daily AI/procurement budget is left.
   *
   * Response shape:
   *   { daily_spent: number, daily_limit: number, remaining: number }
   *
   * Returns `null` if onyx-ai is unreachable.
   */
  async getBudgetStatus() {
    const res = await this._request('GET', '/budget');
    return res ? res.body : null;
  }

  /**
   * healthCheck — is onyx-ai responsive?
   *
   * Returns `true` on HTTP 200, `false` otherwise. Never throws.
   */
  async healthCheck() {
    const res = await this._request('GET', '/health');
    return res !== null && res.ok === true;
  }
}

// ───────────────────────────────────────────────────────────────
// Singleton helper — lazy, env-driven
// ───────────────────────────────────────────────────────────────
let _defaultClient = null;

/**
 * getDefaultClient — module-wide singleton built from env vars.
 *   ONYX_AI_URL      default http://localhost:3200
 *   ONYX_AI_API_KEY  required (falls back to empty string with a warning)
 *
 * Returns `null` if the API key is missing — callers should treat the
 * bridge as unavailable and continue without AI assistance.
 */
function getDefaultClient() {
  if (_defaultClient) return _defaultClient;
  const url = process.env.ONYX_AI_URL || DEFAULT_BASE_URL;
  const key = process.env.ONYX_AI_API_KEY || '';
  if (!key) {
    logger.warn({
      msg: 'onyx-ai.bridge.disabled',
      reason: 'ONYX_AI_API_KEY not set — bridge disabled (fail-open)',
    });
    return null;
  }
  _defaultClient = new OnyxAiClient(url, key);
  return _defaultClient;
}

/**
 * Reset the cached singleton — used by tests.
 */
function _resetDefaultClient() {
  _defaultClient = null;
}

module.exports = {
  OnyxAiClient,
  getDefaultClient,
  _resetDefaultClient,
  // Exposed for tests / introspection.
  _internal: {
    RETRYABLE_STATUS,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_RETRIES,
    DEFAULT_BACKOFF_BASE_MS,
    DEFAULT_BASE_URL,
  },
};
