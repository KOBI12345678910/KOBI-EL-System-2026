// Agent 74 — WhatsApp Business Cloud API sender
// ---------------------------------------------------------------
// Responsibilities:
//   * Queue outgoing template messages with retry / backoff
//   * Respect the WhatsApp Business rate limit (80 msg/sec per WABA)
//   * Enforce opt-in / opt-out rules per Israeli privacy law
//   * Write an append-only audit log for every message attempt
//
// IMPORTANT:
//   * Templates must already be APPROVED in Meta WhatsApp Manager
//     (see docs/WHATSAPP.md). Until then the Cloud API rejects
//     sends with error 132001.
//   * This module NEVER deletes state. Opt-outs are stored as an
//     "opted_out_at" timestamp — the row remains for audit.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const { renderTemplatePayload, getTemplate } = require('./whatsapp-templates');

// ---------------------------------------------------------------
// Config (injected via env — no secrets committed)
// ---------------------------------------------------------------
const CONFIG = {
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  // WhatsApp Business Cloud API limit: 80 msg/sec per WABA.
  // We stay a touch below to absorb jitter.
  rateLimitPerSecond: parseInt(process.env.WHATSAPP_RATE_LIMIT || '80', 10),
  // Retry policy for 5xx and 429 responses.
  maxRetries: parseInt(process.env.WHATSAPP_MAX_RETRIES || '5', 10),
  retryBaseMs: parseInt(process.env.WHATSAPP_RETRY_BASE_MS || '500', 10),
  auditLogPath:
    process.env.WHATSAPP_AUDIT_LOG ||
    path.join(__dirname, '..', '..', 'logs', 'whatsapp-audit.log'),
  optInStorePath:
    process.env.WHATSAPP_OPTIN_STORE ||
    path.join(__dirname, '..', '..', 'data', 'whatsapp-optin.json'),
};

// ---------------------------------------------------------------
// Opt-in / opt-out store (JSON file, never deleted — only toggled)
// ---------------------------------------------------------------
function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function _loadOptInStore() {
  try {
    if (!fs.existsSync(CONFIG.optInStorePath)) return { entries: {} };
    const raw = fs.readFileSync(CONFIG.optInStorePath, 'utf8');
    if (!raw.trim()) return { entries: {} };
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt file — don't wipe, just refuse to send.
    return { entries: {}, _error: err.message };
  }
}

function _saveOptInStore(store) {
  _ensureDir(CONFIG.optInStorePath);
  fs.writeFileSync(CONFIG.optInStorePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Record that `phoneNumber` granted opt-in. The entry is kept
 * forever; a later opt-out flips `opted_out_at` without deleting.
 */
function recordOptIn(phoneNumber, source = 'unknown') {
  if (!phoneNumber) throw new Error('whatsapp: phoneNumber required');
  const store = _loadOptInStore();
  const prior = store.entries[phoneNumber] || {};
  store.entries[phoneNumber] = {
    ...prior,
    phoneNumber,
    opted_in_at: prior.opted_in_at || new Date().toISOString(),
    opted_out_at: null,
    source,
    history: [
      ...(prior.history || []),
      { action: 'opt_in', at: new Date().toISOString(), source },
    ],
  };
  _saveOptInStore(store);
  return store.entries[phoneNumber];
}

/**
 * Record opt-out. Data stays in the file for audit.
 */
function recordOptOut(phoneNumber, reason = 'user_request') {
  if (!phoneNumber) throw new Error('whatsapp: phoneNumber required');
  const store = _loadOptInStore();
  const prior = store.entries[phoneNumber] || { phoneNumber };
  store.entries[phoneNumber] = {
    ...prior,
    phoneNumber,
    opted_out_at: new Date().toISOString(),
    history: [
      ...(prior.history || []),
      { action: 'opt_out', at: new Date().toISOString(), reason },
    ],
  };
  _saveOptInStore(store);
  return store.entries[phoneNumber];
}

/**
 * Returns true iff the number has an active opt-in (opted_in_at
 * set and opted_out_at null).
 */
function hasOptIn(phoneNumber) {
  if (!phoneNumber) return false;
  const store = _loadOptInStore();
  const entry = store.entries[phoneNumber];
  if (!entry) return false;
  return !!entry.opted_in_at && !entry.opted_out_at;
}

// ---------------------------------------------------------------
// Audit log — append-only JSONL
// ---------------------------------------------------------------
function _audit(event) {
  try {
    _ensureDir(CONFIG.auditLogPath);
    const line =
      JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(CONFIG.auditLogPath, line, 'utf8');
  } catch (_e) {
    // Never throw from the audit path — surface via logger if present.
  }
}

// ---------------------------------------------------------------
// Rate limiter — simple leaky bucket per process.
// ---------------------------------------------------------------
const _rateState = {
  windowStartMs: 0,
  sentInWindow: 0,
};

async function _waitForRateSlot() {
  const now = Date.now();
  if (now - _rateState.windowStartMs >= 1000) {
    _rateState.windowStartMs = now;
    _rateState.sentInWindow = 0;
  }
  if (_rateState.sentInWindow >= CONFIG.rateLimitPerSecond) {
    const waitMs = 1000 - (now - _rateState.windowStartMs);
    await new Promise((r) => setTimeout(r, Math.max(waitMs, 10)));
    _rateState.windowStartMs = Date.now();
    _rateState.sentInWindow = 0;
  }
  _rateState.sentInWindow += 1;
}

// ---------------------------------------------------------------
// Queue — FIFO, processed sequentially on a single loop.
// The loop runs as fast as the rate limiter allows.
// ---------------------------------------------------------------
const _queue = [];
let _queueRunning = false;

function _enqueue(job) {
  _queue.push(job);
  if (!_queueRunning) _drainQueue();
}

async function _drainQueue() {
  if (_queueRunning) return;
  _queueRunning = true;
  try {
    while (_queue.length > 0) {
      const job = _queue.shift();
      try {
        await _waitForRateSlot();
        const result = await _httpSendWithRetry(job.payload, job.meta);
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    _queueRunning = false;
  }
}

// ---------------------------------------------------------------
// Raw HTTPS POST to the Cloud API — with retry/backoff.
// Accepts an optional `_httpImpl` override for tests.
// ---------------------------------------------------------------
function _postOnce(payload) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.phoneNumberId || !CONFIG.accessToken) {
      return reject(new Error('whatsapp: missing phoneNumberId/accessToken'));
    }
    const body = JSON.stringify(payload);
    const opts = {
      method: 'POST',
      hostname: 'graph.facebook.com',
      path: `/${CONFIG.apiVersion}/${CONFIG.phoneNumberId}/messages`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${CONFIG.accessToken}`,
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (_e) {
          /* leave as raw text */
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: text });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function _httpSendWithRetry(payload, meta) {
  const impl = _httpImpl || _postOnce;
  let attempt = 0;
  let lastErr = null;
  while (attempt <= CONFIG.maxRetries) {
    try {
      const res = await impl(payload);
      if (res.status >= 200 && res.status < 300) {
        _audit({
          level: 'info',
          event: 'whatsapp.sent',
          template: meta.templateName,
          to: meta.to,
          attempt,
          waMessageId:
            (res.body && res.body.messages && res.body.messages[0] && res.body.messages[0].id) ||
            null,
        });
        return res;
      }
      // 429 (rate) and 5xx → retry.
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error(`whatsapp: transient ${res.status}`);
        lastErr.response = res;
      } else {
        _audit({
          level: 'error',
          event: 'whatsapp.rejected',
          template: meta.templateName,
          to: meta.to,
          status: res.status,
          body: res.body,
        });
        const err = new Error(`whatsapp: rejected ${res.status}`);
        err.response = res;
        throw err;
      }
    } catch (err) {
      lastErr = err;
    }
    attempt += 1;
    if (attempt > CONFIG.maxRetries) break;
    const delay = CONFIG.retryBaseMs * Math.pow(2, attempt - 1);
    _audit({
      level: 'warn',
      event: 'whatsapp.retry',
      template: meta.templateName,
      to: meta.to,
      attempt,
      delayMs: delay,
      reason: lastErr && lastErr.message,
    });
    await new Promise((r) => setTimeout(r, delay));
  }
  _audit({
    level: 'error',
    event: 'whatsapp.failed',
    template: meta.templateName,
    to: meta.to,
    attempts: attempt,
    reason: lastErr && lastErr.message,
  });
  throw lastErr || new Error('whatsapp: unknown send failure');
}

// Test hook — allows unit tests to inject a fake HTTP layer.
let _httpImpl = null;
function __setHttpImpl(fn) {
  _httpImpl = fn;
}

// ---------------------------------------------------------------
// Phone number helpers
// ---------------------------------------------------------------
function _normalizeE164(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('whatsapp: phoneNumber required');
  }
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  // Israeli domestic numbers starting with 0 → +972.
  if (/^0\d{8,9}$/.test(s)) s = '972' + s.slice(1);
  if (!/^\d{8,15}$/.test(s)) {
    throw new Error(`whatsapp: invalid phone "${raw}"`);
  }
  return s;
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Send a template message. Returns a Promise that resolves once
 * the message is accepted by the Cloud API (or rejects on
 * non-retryable error).
 *
 * @param {string} phoneNumber E.164 or Israeli domestic format
 * @param {string} templateName key in TEMPLATES
 * @param {Array<string|number>} params positional params
 * @param {object} [options]
 * @param {boolean} [options.bypassOptIn=false] dangerous; audit logs
 */
function sendTemplate(phoneNumber, templateName, params = [], options = {}) {
  return new Promise((resolve, reject) => {
    let to;
    try {
      to = _normalizeE164(phoneNumber);
    } catch (err) {
      _audit({
        level: 'error',
        event: 'whatsapp.invalid_phone',
        to: phoneNumber,
        reason: err.message,
      });
      return reject(err);
    }

    const tpl = getTemplate(templateName);
    if (!tpl) {
      const err = new Error(`whatsapp: unknown template "${templateName}"`);
      _audit({
        level: 'error',
        event: 'whatsapp.unknown_template',
        template: templateName,
        to,
      });
      return reject(err);
    }

    // Opt-in enforcement. Urgent operational templates may set
    // bypassOptIn=true with explicit audit.
    if (!options.bypassOptIn && !hasOptIn(to)) {
      _audit({
        level: 'warn',
        event: 'whatsapp.blocked_no_optin',
        template: templateName,
        to,
      });
      return reject(new Error(`whatsapp: recipient ${to} has not opted in`));
    }
    if (options.bypassOptIn) {
      _audit({
        level: 'warn',
        event: 'whatsapp.optin_bypass_used',
        template: templateName,
        to,
        reason: options.bypassReason || 'unspecified',
      });
    }

    let payload;
    try {
      payload = renderTemplatePayload(templateName, to, params);
    } catch (err) {
      _audit({
        level: 'error',
        event: 'whatsapp.render_failed',
        template: templateName,
        to,
        reason: err.message,
      });
      return reject(err);
    }

    _audit({
      level: 'info',
      event: 'whatsapp.queued',
      template: templateName,
      to,
    });

    _enqueue({
      payload,
      meta: { templateName, to },
      resolve,
      reject,
    });
  });
}

/**
 * For tests — flush any pending queued jobs.
 */
function __flushQueue() {
  return new Promise((resolve) => {
    const tick = () => {
      if (_queue.length === 0 && !_queueRunning) return resolve();
      setTimeout(tick, 10);
    };
    tick();
  });
}

/**
 * For tests — reset the in-process rate limiter and queue so tests
 * don't leak state. Does NOT touch opt-in store or audit log.
 */
function __resetState() {
  _rateState.windowStartMs = 0;
  _rateState.sentInWindow = 0;
  _queue.length = 0;
  _queueRunning = false;
}

module.exports = {
  sendTemplate,
  recordOptIn,
  recordOptOut,
  hasOptIn,
  CONFIG,
  // test hooks
  __setHttpImpl,
  __flushQueue,
  __resetState,
};
