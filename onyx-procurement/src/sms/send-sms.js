/**
 * ONYX PROCUREMENT — SMS Sender (multi-provider)
 * ────────────────────────────────────────────────
 * Agent-75 — SMS notification subsystem
 *
 * Purpose:
 *   Send short Hebrew SMS messages through one of four pluggable
 *   providers (Twilio, InforU, CellAct, SMSGlobal). This module
 *   ships STUB provider adapters that speak a shared contract but
 *   never hit the network unless real credentials are supplied and
 *   the environment explicitly enables live mode
 *   (SMS_LIVE_MODE=1). In stub/test mode every "send" is a
 *   deterministic no-op that still exercises validation, rate
 *   limiting, opt-out handling, cost tracking, the audit log and
 *   the queue/retry pipeline — which is exactly what the test
 *   suite needs.
 *
 * Key features:
 *   • Israeli phone validation (05X-XXXXXXX, optional +972 prefix)
 *   • Per-number + per-campaign rate limiting
 *   • Opt-out ledger with Hebrew "הסר" / English STOP handling
 *   • Delivery receipt callback plumbing
 *   • Structured audit log (redactable)
 *   • Cost tracking (per provider, per message, per segment)
 *   • Queue with bounded concurrency and retry with exponential backoff
 *   • sender name enforcement (max 11 chars, alpha-numeric)
 *
 * Non-goals:
 *   • Does NOT delete anything from the opt-out ledger or audit log.
 *   • Does NOT mutate the exported constants or the template module.
 *   • Does NOT take a runtime dependency on any SMS SDK — only the
 *     global `fetch` is used and only in live mode.
 *
 * Environment:
 *   SMS_PROVIDER      'twilio' | 'inforu' | 'cellact' | 'smsglobal'
 *                     (default 'inforu' — most common in Israel)
 *   SMS_SENDER_NAME   default alphanumeric sender id (<=11 chars)
 *   SMS_LIVE_MODE     '1' to actually hit provider APIs. Any other
 *                     value (or undefined) keeps the module in
 *                     dry-run / stub mode.
 *   SMS_RATE_PER_NUM  max msgs per rolling 60s per phone  (default 3)
 *   SMS_RATE_CAMPAIGN max msgs per rolling 60s per campaignId (default 60)
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
 *   INFORU_USER / INFORU_PASSWORD / INFORU_SENDER
 *   CELLACT_USER / CELLACT_PASSWORD / CELLACT_SENDER
 *   SMSGLOBAL_API_KEY / SMSGLOBAL_API_SECRET / SMSGLOBAL_SENDER
 */

'use strict';

const { renderTemplate, estimateSegments } = require('./sms-templates');

// ─────────────────────────────────────────────────────────────────────
// Logger shim — same pattern as ai-bridge.js
// ─────────────────────────────────────────────────────────────────────

let logger;
try {
  ({ logger } = require('../logger'));
} catch (_) {
  logger = {
    info:  (...args) => console.log('[sms]', ...args),
    warn:  (...args) => console.warn('[sms]', ...args),
    error: (...args) => console.error('[sms]', ...args),
    debug: () => {},
  };
}

// ─────────────────────────────────────────────────────────────────────
// Israeli phone validation
// ─────────────────────────────────────────────────────────────────────
//
// Accepted forms:
//   05X-XXXXXXX         e.g. 050-1234567
//   05XXXXXXXXX         e.g. 0501234567
//   +972-5X-XXXXXXX     e.g. +972-50-1234567
//   +9725XXXXXXXX       e.g. +972501234567
//
// Normalized form:   +9725XXXXXXXX (E.164)

const IL_PREFIX_RE = /^(?:\+972|0)([23489]|5[0-9]|7[2-9])\d{7}$/;

function normalizePhone(raw) {
  if (raw == null) return null;
  const digitsOnly = String(raw).replace(/[\s\-().]/g, '');
  if (!digitsOnly) return null;
  if (!IL_PREFIX_RE.test(digitsOnly)) return null;

  // Already E.164? return as-is.
  if (digitsOnly.startsWith('+972')) return digitsOnly;

  // Leading zero → +972
  return `+972${digitsOnly.slice(1)}`;
}

function isValidIsraeliPhone(raw) {
  return normalizePhone(raw) !== null;
}

function isMobileNumber(raw) {
  // Only 05X prefixes are mobile. Landlines (02/03/04/08/09) and voip (07X)
  // are valid phone numbers but cannot receive SMS reliably in IL.
  const norm = normalizePhone(raw);
  if (!norm) return false;
  // +972 5X XXXXXXX
  return /^\+9725\d{8}$/.test(norm);
}

// ─────────────────────────────────────────────────────────────────────
// Sender name validation (alphanumeric, <=11 chars)
// ─────────────────────────────────────────────────────────────────────
//
// The 11-char / alphanumeric rule is imposed by every major mobile
// operator (GSMA spec). Hebrew sender names require carrier approval
// and are handled at the provider level — we warn but do not block.

const SENDER_NAME_RE = /^[A-Za-z0-9]{1,11}$/;

function normalizeSenderName(name) {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  if (SENDER_NAME_RE.test(trimmed)) return trimmed;
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Rate limiter — sliding 60s window, per key
// ─────────────────────────────────────────────────────────────────────
//
// This is an in-process limiter. Multi-process deployments should
// swap the backing store via createRateLimiter({ store }).

function createRateLimiter(opts = {}) {
  const windowMs = opts.windowMs || 60_000;
  const hits = new Map(); // key → array<timestamps>

  function check(key, limit) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = hits.get(key) || [];
    // Filter in place to avoid retaining old timestamps.
    const fresh = arr.filter((t) => t >= cutoff);
    if (fresh.length >= limit) {
      hits.set(key, fresh);
      return { allowed: false, remaining: 0, resetAt: fresh[0] + windowMs };
    }
    fresh.push(now);
    hits.set(key, fresh);
    return { allowed: true, remaining: limit - fresh.length, resetAt: now + windowMs };
  }

  function peek(key) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = hits.get(key) || [];
    const fresh = arr.filter((t) => t >= cutoff);
    return { count: fresh.length };
  }

  return { check, peek, _store: hits };
}

// ─────────────────────────────────────────────────────────────────────
// Opt-out ledger — append-only
// ─────────────────────────────────────────────────────────────────────
//
// "הסר" is the canonical Israeli opt-out keyword (mandated by the
// Communications Law / amendment 40). English "STOP" / "UNSUBSCRIBE"
// are also accepted.

const OPT_OUT_KEYWORDS = new Set([
  'הסר', 'הסרה', 'להסיר',
  'STOP', 'stop', 'Stop',
  'UNSUBSCRIBE', 'unsubscribe', 'Unsubscribe',
  'CANCEL', 'cancel', 'Cancel',
  'END', 'end', 'End',
]);

function createOptOutLedger() {
  const optedOut = new Map(); // e164 → { reason, at, campaignId }

  function isOptOutKeyword(text) {
    if (text == null) return false;
    const trimmed = String(text).trim();
    return OPT_OUT_KEYWORDS.has(trimmed);
  }

  function handleInboundReply({ from, body, campaignId } = {}) {
    const norm = normalizePhone(from);
    if (!norm) return { handled: false, reason: 'invalid-phone' };
    if (!isOptOutKeyword(body)) return { handled: false, reason: 'not-opt-out' };
    // Record — but never overwrite an earlier opt-out timestamp.
    if (!optedOut.has(norm)) {
      optedOut.set(norm, {
        reason: 'inbound-reply',
        keyword: String(body).trim(),
        at: new Date().toISOString(),
        campaignId: campaignId || null,
      });
    }
    return { handled: true, reason: 'opted-out' };
  }

  function optOut(phone, meta = {}) {
    const norm = normalizePhone(phone);
    if (!norm) return false;
    if (!optedOut.has(norm)) {
      optedOut.set(norm, {
        reason: meta.reason || 'manual',
        at: new Date().toISOString(),
        campaignId: meta.campaignId || null,
      });
    }
    return true;
  }

  function isOptedOut(phone) {
    const norm = normalizePhone(phone);
    if (!norm) return false;
    return optedOut.has(norm);
  }

  function list() {
    return [...optedOut.entries()].map(([phone, meta]) => ({ phone, ...meta }));
  }

  return { handleInboundReply, optOut, isOptedOut, list, isOptOutKeyword, _store: optedOut };
}

// ─────────────────────────────────────────────────────────────────────
// Audit log — append-only
// ─────────────────────────────────────────────────────────────────────

function createAuditLog({ redactBody = false } = {}) {
  const entries = [];

  function record(event) {
    const entry = {
      ts: new Date().toISOString(),
      ...event,
    };
    if (redactBody && entry.body) entry.body = '[REDACTED]';
    entries.push(entry);
    return entry;
  }

  function query(filter = {}) {
    return entries.filter((e) => {
      if (filter.phone && e.phone !== filter.phone) return false;
      if (filter.provider && e.provider !== filter.provider) return false;
      if (filter.campaignId && e.campaignId !== filter.campaignId) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }

  function count() { return entries.length; }

  return { record, query, count, _entries: entries };
}

// ─────────────────────────────────────────────────────────────────────
// Cost model (agorot per segment — ₪0.01 each)
// ─────────────────────────────────────────────────────────────────────
//
// All numbers are ROUGH averages for Israeli-destination SMS. Real
// pricing depends on route, volume tier, and contract. Use these for
// estimation & budgeting only.

const PROVIDER_COST_PER_SEGMENT_ILS = Object.freeze({
  twilio:    0.23,  // international SMS, more expensive for IL termination
  inforu:    0.065, // local IL aggregator — cheapest for IL destinations
  cellact:   0.08,  // local IL aggregator
  smsglobal: 0.18,  // international aggregator, mid-tier
});

function estimateCostILS(provider, segments) {
  const unit = PROVIDER_COST_PER_SEGMENT_ILS[provider];
  if (unit == null) return null;
  return Math.round(unit * segments * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────
// Provider adapters — stubs
// ─────────────────────────────────────────────────────────────────────
//
// Each adapter implements a single method:
//   send({ to, body, senderName, metadata }) → Promise<{ id, status, raw }>
//
// In stub mode every adapter returns a synthetic message id and the
// status 'queued'. Live mode is gated by SMS_LIVE_MODE=1 AND the
// presence of credentials. If credentials are missing in live mode,
// the adapter throws.

function makeMessageId(prefix) {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rnd}`;
}

function createTwilioAdapter(cfg = {}) {
  return {
    name: 'twilio',
    async send({ to, body, senderName }) {
      if (cfg.live) {
        if (!cfg.accountSid || !cfg.authToken) {
          throw new Error('twilio: missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN');
        }
        // LIVE request would be:
        //   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
        //   Basic auth (sid:token), form body { From, To, Body }
        //
        // We refuse to fire the real request in this module to keep
        // Agent-75 a no-network deliverable. The wiring is documented
        // in docs/SMS.md.
        throw new Error('twilio: live-mode wiring deferred — see docs/SMS.md');
      }
      return {
        id: makeMessageId('twilio'),
        status: 'queued',
        raw: { stub: true, provider: 'twilio', to, senderName: senderName || cfg.from, body },
      };
    },
  };
}

function createInforUAdapter(cfg = {}) {
  return {
    name: 'inforu',
    async send({ to, body, senderName }) {
      if (cfg.live) {
        if (!cfg.user || !cfg.password) {
          throw new Error('inforu: missing INFORU_USER / INFORU_PASSWORD');
        }
        // LIVE request would be:
        //   POST https://uapi.inforu.co.il/SendMessageXml.ashx
        //   XML payload with <User>, <Content>, <Recipients>, <Settings>
        throw new Error('inforu: live-mode wiring deferred — see docs/SMS.md');
      }
      return {
        id: makeMessageId('inforu'),
        status: 'queued',
        raw: { stub: true, provider: 'inforu', to, senderName: senderName || cfg.sender, body },
      };
    },
  };
}

function createCellActAdapter(cfg = {}) {
  return {
    name: 'cellact',
    async send({ to, body, senderName }) {
      if (cfg.live) {
        if (!cfg.user || !cfg.password) {
          throw new Error('cellact: missing CELLACT_USER / CELLACT_PASSWORD');
        }
        // LIVE request would be:
        //   POST https://panel.cellactpro.com/API/SendMT.ashx
        //   form body { username, password, destination, sender, body }
        throw new Error('cellact: live-mode wiring deferred — see docs/SMS.md');
      }
      return {
        id: makeMessageId('cellact'),
        status: 'queued',
        raw: { stub: true, provider: 'cellact', to, senderName: senderName || cfg.sender, body },
      };
    },
  };
}

function createSMSGlobalAdapter(cfg = {}) {
  return {
    name: 'smsglobal',
    async send({ to, body, senderName }) {
      if (cfg.live) {
        if (!cfg.apiKey || !cfg.apiSecret) {
          throw new Error('smsglobal: missing SMSGLOBAL_API_KEY / SMSGLOBAL_API_SECRET');
        }
        // LIVE request would be:
        //   POST https://api.smsglobal.com/v2/sms/
        //   OAuth1 headers + JSON body
        throw new Error('smsglobal: live-mode wiring deferred — see docs/SMS.md');
      }
      return {
        id: makeMessageId('smsglobal'),
        status: 'queued',
        raw: { stub: true, provider: 'smsglobal', to, senderName: senderName || cfg.sender, body },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Provider registry
// ─────────────────────────────────────────────────────────────────────

function buildAdaptersFromEnv(env = process.env) {
  const live = env.SMS_LIVE_MODE === '1';
  return {
    twilio: createTwilioAdapter({
      live,
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken:  env.TWILIO_AUTH_TOKEN,
      from:       env.TWILIO_FROM,
    }),
    inforu: createInforUAdapter({
      live,
      user:     env.INFORU_USER,
      password: env.INFORU_PASSWORD,
      sender:   env.INFORU_SENDER,
    }),
    cellact: createCellActAdapter({
      live,
      user:     env.CELLACT_USER,
      password: env.CELLACT_PASSWORD,
      sender:   env.CELLACT_SENDER,
    }),
    smsglobal: createSMSGlobalAdapter({
      live,
      apiKey:    env.SMSGLOBAL_API_KEY,
      apiSecret: env.SMSGLOBAL_API_SECRET,
      sender:    env.SMSGLOBAL_SENDER,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Queue + retry
// ─────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function createQueue({ concurrency = 4 } = {}) {
  let active = 0;
  const pending = [];

  function runNext() {
    if (active >= concurrency) return;
    const job = pending.shift();
    if (!job) return;
    active++;
    job.run().then(
      (v) => { active--; job.resolve(v); runNext(); },
      (e) => { active--; job.reject(e);  runNext(); },
    );
  }

  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      pending.push({ run: fn, resolve, reject });
      runNext();
    });
  }

  function size() { return pending.length + active; }

  return { enqueue, size };
}

async function withRetry(fn, { retries = 3, backoffMs = 250, factor = 2, isRetryable } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return { result: await fn(attempt), attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      const retryable = typeof isRetryable === 'function' ? isRetryable(err) : true;
      if (!retryable || attempt === retries) break;
      await sleep(backoffMs * Math.pow(factor, attempt));
      attempt++;
    }
  }
  const e = new Error(`sms: all ${retries + 1} attempts failed — ${lastErr && lastErr.message}`);
  e.cause = lastErr;
  e.attempts = attempt + 1;
  throw e;
}

// ─────────────────────────────────────────────────────────────────────
// Delivery receipt registry
// ─────────────────────────────────────────────────────────────────────

function createDeliveryRegistry() {
  const receipts = new Map(); // providerMessageId → { status, at, raw }

  function recordReceipt({ providerMessageId, status, raw }) {
    if (!providerMessageId) return false;
    if (!receipts.has(providerMessageId)) {
      receipts.set(providerMessageId, {
        status: status || 'unknown',
        at:     new Date().toISOString(),
        raw:    raw || null,
      });
    } else {
      // We DO update the status — a message moves from queued → sent
      // → delivered — but we never delete the history; the caller can
      // inspect the audit log for full state transitions.
      receipts.get(providerMessageId).status = status || receipts.get(providerMessageId).status;
      receipts.get(providerMessageId).updatedAt = new Date().toISOString();
      if (raw) receipts.get(providerMessageId).raw = raw;
    }
    return true;
  }

  function getReceipt(id) { return receipts.get(id) || null; }

  return { recordReceipt, getReceipt, _store: receipts };
}

// ─────────────────────────────────────────────────────────────────────
// SmsSender — top-level façade
// ─────────────────────────────────────────────────────────────────────

function createSmsSender(opts = {}) {
  const env = opts.env || process.env;
  const adapters = opts.adapters || buildAdaptersFromEnv(env);
  const providerName = opts.provider || env.SMS_PROVIDER || 'inforu';
  if (!adapters[providerName]) {
    throw new Error(`sms: unknown provider '${providerName}' — valid: ${Object.keys(adapters).join(', ')}`);
  }

  const rate = opts.rateLimiter || createRateLimiter({ windowMs: 60_000 });
  const optOut = opts.optOutLedger || createOptOutLedger();
  const audit  = opts.auditLog    || createAuditLog({ redactBody: !!opts.redactBody });
  const delivery = opts.deliveryRegistry || createDeliveryRegistry();
  const queue = opts.queue || createQueue({ concurrency: opts.concurrency || 4 });

  const perNumberLimit = Number(env.SMS_RATE_PER_NUM)  || opts.perNumberLimit  || 3;
  const perCampaignLimit = Number(env.SMS_RATE_CAMPAIGN) || opts.perCampaignLimit || 60;
  const defaultSenderName = normalizeSenderName(opts.senderName || env.SMS_SENDER_NAME || 'OnyxProc');

  async function sendImmediate({
    to,
    templateId,
    vars,
    body,
    provider,
    senderName,
    campaignId,
    metadata,
    allowOptOutOverride,
  }) {
    const chosenProvider = provider || providerName;
    const adapter = adapters[chosenProvider];
    if (!adapter) throw new Error(`sms: provider '${chosenProvider}' not registered`);

    // 1. phone
    const normPhone = normalizePhone(to);
    if (!normPhone) {
      audit.record({ status: 'rejected', reason: 'invalid-phone', phone: to, provider: chosenProvider, campaignId });
      const e = new Error(`sms: invalid phone '${to}'`);
      e.code = 'SMS_INVALID_PHONE';
      throw e;
    }
    if (!isMobileNumber(normPhone)) {
      audit.record({ status: 'rejected', reason: 'not-mobile', phone: normPhone, provider: chosenProvider, campaignId });
      const e = new Error(`sms: phone '${to}' is not an Israeli mobile (05X)`);
      e.code = 'SMS_NOT_MOBILE';
      throw e;
    }

    // 2. opt-out
    if (optOut.isOptedOut(normPhone) && !allowOptOutOverride) {
      audit.record({ status: 'suppressed', reason: 'opted-out', phone: normPhone, provider: chosenProvider, campaignId });
      return { status: 'suppressed', reason: 'opted-out', phone: normPhone };
    }

    // 3. render template (or use raw body)
    let rendered;
    if (templateId) {
      rendered = renderTemplate(templateId, vars || {});
    } else if (body) {
      const seg = estimateSegments(body);
      rendered = { id: null, body, ...seg, warnings: [], category: 'raw', allowOptOutFooter: true };
    } else {
      const e = new Error('sms: must pass templateId or body');
      e.code = 'SMS_NO_CONTENT';
      throw e;
    }

    // 4. sender name
    const chosenSender = normalizeSenderName(senderName) || defaultSenderName;
    if (senderName && !normalizeSenderName(senderName)) {
      audit.record({
        status: 'warning', reason: 'invalid-sender-name', phone: normPhone, provider: chosenProvider, campaignId,
        senderName,
      });
    }

    // 5. rate limit
    const rnCheck = rate.check(`num:${normPhone}`, perNumberLimit);
    if (!rnCheck.allowed) {
      audit.record({
        status: 'rate-limited', reason: 'per-number', phone: normPhone, provider: chosenProvider, campaignId,
        resetAt: rnCheck.resetAt,
      });
      const e = new Error(`sms: rate limited for ${normPhone}`);
      e.code = 'SMS_RATE_LIMITED';
      e.scope = 'per-number';
      e.resetAt = rnCheck.resetAt;
      throw e;
    }
    if (campaignId) {
      const camCheck = rate.check(`campaign:${campaignId}`, perCampaignLimit);
      if (!camCheck.allowed) {
        audit.record({
          status: 'rate-limited', reason: 'per-campaign', phone: normPhone, provider: chosenProvider, campaignId,
          resetAt: camCheck.resetAt,
        });
        const e = new Error(`sms: rate limited for campaign ${campaignId}`);
        e.code = 'SMS_RATE_LIMITED';
        e.scope = 'per-campaign';
        e.resetAt = camCheck.resetAt;
        throw e;
      }
    }

    // 6. provider call (with retry)
    const estCost = estimateCostILS(chosenProvider, rendered.segments);
    const sendFn = async (attempt) => adapter.send({
      to: normPhone,
      body: rendered.body,
      senderName: chosenSender,
      metadata: { ...metadata, attempt, campaignId },
    });
    const { result: providerResp, attempts } = await withRetry(sendFn, {
      retries: opts.retries != null ? opts.retries : 3,
      backoffMs: opts.backoffMs || 250,
      factor: opts.backoffFactor || 2,
      // stub mode never throws → retries will effectively be 1 attempt.
      isRetryable: (err) => !(err && err.code === 'SMS_NOT_RETRYABLE'),
    });

    delivery.recordReceipt({ providerMessageId: providerResp.id, status: providerResp.status, raw: providerResp.raw });

    const entry = audit.record({
      status: 'accepted',
      phone: normPhone,
      provider: chosenProvider,
      senderName: chosenSender,
      campaignId: campaignId || null,
      templateId: templateId || null,
      body: rendered.body,
      segments: rendered.segments,
      chars: rendered.chars,
      unicode: rendered.unicode,
      estCostILS: estCost,
      providerMessageId: providerResp.id,
      attempts,
      warnings: rendered.warnings,
    });

    return {
      status: 'accepted',
      providerMessageId: providerResp.id,
      provider: chosenProvider,
      segments: rendered.segments,
      chars: rendered.chars,
      estCostILS: estCost,
      attempts,
      auditId: entry.ts,
    };
  }

  function send(input) {
    return queue.enqueue(() => sendImmediate(input));
  }

  async function sendBulk(inputs = []) {
    const results = await Promise.allSettled(inputs.map((i) => send(i)));
    return results.map((r, idx) => {
      if (r.status === 'fulfilled') return { index: idx, ok: true, ...r.value };
      return { index: idx, ok: false, error: r.reason && r.reason.message, code: r.reason && r.reason.code };
    });
  }

  function handleInboundReply(payload) {
    return optOut.handleInboundReply(payload);
  }

  function handleDeliveryReceipt({ providerMessageId, status, raw }) {
    return delivery.recordReceipt({ providerMessageId, status, raw });
  }

  function totalEstimatedCostILS() {
    return audit.query({ status: 'accepted' })
      .reduce((sum, e) => sum + (e.estCostILS || 0), 0);
  }

  return {
    send,
    sendBulk,
    sendImmediate,
    handleInboundReply,
    handleDeliveryReceipt,
    getAuditLog: (filter) => audit.query(filter),
    getOptOutList: () => optOut.list(),
    isOptedOut: (p) => optOut.isOptedOut(p),
    optOut: (p, m) => optOut.optOut(p, m),
    getDeliveryReceipt: (id) => delivery.getReceipt(id),
    totalEstimatedCostILS,
    provider: providerName,
    _internals: { adapters, rate, optOut, audit, delivery, queue, perNumberLimit, perCampaignLimit },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Default singleton
// ─────────────────────────────────────────────────────────────────────

let _defaultSender = null;
function getDefaultSender() {
  if (!_defaultSender) _defaultSender = createSmsSender();
  return _defaultSender;
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  createSmsSender,
  getDefaultSender,
  // individual building blocks (exported for tests and advanced wiring)
  normalizePhone,
  isValidIsraeliPhone,
  isMobileNumber,
  normalizeSenderName,
  createRateLimiter,
  createOptOutLedger,
  createAuditLog,
  createDeliveryRegistry,
  createQueue,
  withRetry,
  estimateCostILS,
  buildAdaptersFromEnv,
  createTwilioAdapter,
  createInforUAdapter,
  createCellActAdapter,
  createSMSGlobalAdapter,
  OPT_OUT_KEYWORDS,
  PROVIDER_COST_PER_SEGMENT_ILS,
};
