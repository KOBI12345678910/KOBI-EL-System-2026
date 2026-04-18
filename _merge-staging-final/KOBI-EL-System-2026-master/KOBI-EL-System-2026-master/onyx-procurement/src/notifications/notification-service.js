/**
 * Unified Notification Service — Main Module
 * ─────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Aggregates five delivery channels:
 *   • email    — integration with Agent-73 (src/emails)
 *   • whatsapp — integration with Agent-74 (src/whatsapp)
 *   • sms      — integration with Agent-75 (src/sms)
 *   • push     — zero-dep stub (logs to data/notification-push.jsonl)
 *   • in_app   — stored via NotificationHistory and surfaced on GET /api/notifications
 *
 * Core API:
 *
 *   const svc = new NotificationService({ supabase });
 *   await svc.notify('user_42', 'wage_slip_ready', {
 *     employeeName: 'דנה',
 *     month:        '2026-03',
 *   });
 *
 *   svc.notify() returns:
 *     {
 *       notificationId,        // history record id
 *       requestedChannels,     // channels chosen by the policy
 *       deliveredOn,           // channels that succeeded
 *       failedOn,              // channels that failed → queued for retry
 *       skippedReason,         // non-null when nothing was sent
 *     }
 *
 * Design principles:
 *   • Fail-open — every external call is wrapped in try/catch.
 *   • Sibling channel modules (src/emails, src/whatsapp, src/sms) are required
 *     defensively; if any are missing, that channel is simply skipped.
 *   • Priority routing is enforced here, not in notification-types.
 *   • Frequency cap & throttle are enforced via NotificationHistory counters.
 *
 * Zero external deps.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const types       = require('./notification-types');
const { NotificationQueue }       = require('./notification-queue');
const { NotificationPreferences } = require('./notification-preferences');
const { NotificationHistory }     = require('./notification-history');

const { CHANNELS, PRIORITIES } = types;

// ───────────────────────────────────────────────────────────────
// Defensive adapter loading
// ───────────────────────────────────────────────────────────────
/**
 * tryRequire — returns the module or null if not installed.
 * Silent on purpose; the service logs once at boot which adapters are live.
 */
function tryRequire(id) {
  try { return require(id); } catch (_) { return null; }
}

function tryGet(mod, candidates) {
  if (!mod) return null;
  for (const c of candidates) {
    if (typeof mod[c] === 'function') return mod[c].bind(mod);
    if (mod[c] && typeof mod[c].send === 'function') return mod[c].send.bind(mod[c]);
  }
  if (typeof mod === 'function') return mod;
  return null;
}

// ───────────────────────────────────────────────────────────────
// NotificationService
// ───────────────────────────────────────────────────────────────

class NotificationService {
  /**
   * @param {object} [opts]
   * @param {object} [opts.supabase]         optional supabase client
   * @param {NotificationQueue} [opts.queue]
   * @param {NotificationPreferences} [opts.preferences]
   * @param {NotificationHistory} [opts.history]
   * @param {object} [opts.adapters]         override adapters for tests
   * @param {object} [opts.logger]
   */
  constructor(opts = {}) {
    this.logger = opts.logger || {
      info:  (...a) => console.log('[notification-service]', ...a),
      warn:  (...a) => console.warn('[notification-service]', ...a),
      error: (...a) => console.error('[notification-service]', ...a),
      debug: () => {},
    };

    this.queue       = opts.queue       || new NotificationQueue({ logger: this.logger });
    this.preferences = opts.preferences || new NotificationPreferences({ supabase: opts.supabase, logger: this.logger });
    this.history     = opts.history     || new NotificationHistory({ supabase: opts.supabase, logger: this.logger });

    this.pushLogPath = path.join(process.cwd(), 'data', 'notification-push.jsonl');

    // Adapters resolved at construction time. Tests can inject via opts.adapters.
    this.adapters = Object.assign({
      email:    null,
      whatsapp: null,
      sms:      null,
      push:     null,
    }, opts.adapters || {});

    if (!opts.adapters) this._loadAdapters();
  }

  // ─────────────────────────────────────────────────────────────
  // Adapter wiring
  // ─────────────────────────────────────────────────────────────
  _loadAdapters() {
    // Email (Agent-73)
    const emailMod = tryRequire('./emails') || tryRequire('../emails');
    const emailFn  = tryGet(emailMod, ['send', 'sendEmail', 'dispatch', 'notify']);
    if (emailFn) this.adapters.email = emailFn;

    // WhatsApp (Agent-74)
    const waMod = tryRequire('./whatsapp') || tryRequire('../whatsapp');
    const waFn  = tryGet(waMod, ['send', 'sendWhatsApp', 'dispatch', 'notify']);
    if (waFn) this.adapters.whatsapp = waFn;

    // SMS (Agent-75)
    const smsMod = tryRequire('./sms') || tryRequire('../sms');
    const smsFn  = tryGet(smsMod, ['send', 'sendSMS', 'dispatch', 'notify']);
    if (smsFn) this.adapters.sms = smsFn;

    // Push — no external module; use internal JSONL stub
    this.adapters.push = this.adapters.push || this._pushStub.bind(this);

    this.logger.info('adapters', {
      email:    Boolean(this.adapters.email),
      whatsapp: Boolean(this.adapters.whatsapp),
      sms:      Boolean(this.adapters.sms),
      push:     Boolean(this.adapters.push),
      in_app:   true,
    });
  }

  async _pushStub({ userId, title, body, data, notificationId }) {
    try {
      const dir = path.dirname(this.pushLogPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.pushLogPath, JSON.stringify({
        ts: Date.now(), userId, title, body, data, notificationId,
      }) + '\n', 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Priority routing
  // ─────────────────────────────────────────────────────────────

  /**
   * resolveChannels — compute the ordered channel list for a given type and
   * the user's preferences, honouring priority rules.
   *
   * Returns an array of channel strings. Never returns null.
   */
  async resolveChannels(userId, typeDef) {
    if (!typeDef) return [];

    // Priority = critical → always both SMS + PUSH (plus in_app/email if enabled)
    if (typeDef.priority === PRIORITIES.CRITICAL) {
      const forced = [CHANNELS.SMS, CHANNELS.PUSH, CHANNELS.IN_APP];
      // Include email only if configured
      const emailOk = await this.preferences.isChannelEnabled(userId, CHANNELS.EMAIL);
      if (emailOk) forced.push(CHANNELS.EMAIL);
      return Array.from(new Set(forced));
    }

    // Priority = info → email only
    if (typeDef.priority === PRIORITIES.INFO) {
      const emailOk = await this.preferences.isChannelEnabled(userId, CHANNELS.EMAIL);
      return emailOk ? [CHANNELS.EMAIL, CHANNELS.IN_APP] : [CHANNELS.IN_APP];
    }

    // normal / high: intersect defaultChans with user prefs, respect shouldDeliver
    const out = [];
    for (const ch of typeDef.defaultChans) {
      const decision = await this.preferences.shouldDeliver(userId, ch, typeDef);
      if (decision.allow) out.push(ch);
    }
    // Always include in_app as a sink if not already present
    if (!out.includes(CHANNELS.IN_APP)) out.push(CHANNELS.IN_APP);
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // Frequency cap & throttle
  // ─────────────────────────────────────────────────────────────

  /**
   * _checkRateLimits — returns { ok, reason } based on user prefs & history.
   * Critical priority always passes.
   */
  async _checkRateLimits(userId, typeDef) {
    if (typeDef.priority === PRIORITIES.CRITICAL) return { ok: true };

    // per-type throttle
    if (typeDef.throttleSec && typeDef.throttleSec > 0) {
      const last = this.history.lastEmissionOfType(userId, typeDef.id);
      if (last && (Date.now() - last) < typeDef.throttleSec * 1000) {
        return { ok: false, reason: 'throttled' };
      }
    }

    // frequency cap — skip for high-priority
    if (typeDef.priority === PRIORITIES.HIGH) return { ok: true };

    const prefs = await this.preferences.get(userId);
    if (prefs.frequencyCap && prefs.frequencyCap > 0) {
      const n = this.history.countRecent(userId, 60 * 60 * 1000);
      if (n >= prefs.frequencyCap) return { ok: false, reason: 'frequency_cap' };
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Dispatch
  // ─────────────────────────────────────────────────────────────

  /**
   * notify — high-level entry point.
   *
   * @param {string} userId
   * @param {string} notificationType  registered type id
   * @param {object} data              template placeholders + adapter payload
   * @param {object} [opts]
   * @param {boolean} [opts.queueOnly] enqueue only, don't dispatch inline
   * @param {object}  [opts.recipient] { email, phone, pushToken } — explicit target
   *
   * @returns {Promise<object>}
   */
  async notify(userId, notificationType, data, opts = {}) {
    const typeDef = types.get(notificationType);
    if (!typeDef) {
      this.logger.warn('unknown notification type', notificationType);
      return { notificationId: null, skippedReason: 'unknown_type', requestedChannels: [], deliveredOn: [], failedOn: [] };
    }

    // Rate limits
    const rl = await this._checkRateLimits(userId, typeDef);
    if (!rl.ok) {
      this.logger.debug('notify rate-limited', userId, typeDef.id, rl.reason);
      return { notificationId: null, skippedReason: rl.reason, requestedChannels: [], deliveredOn: [], failedOn: [] };
    }

    // Channels
    const channels = await this.resolveChannels(userId, typeDef);
    if (channels.length === 0) {
      return { notificationId: null, skippedReason: 'no_channels', requestedChannels: [], deliveredOn: [], failedOn: [] };
    }

    // Render
    const rendered = types.renderType(notificationType, data || {});
    if (!rendered) {
      return { notificationId: null, skippedReason: 'render_failed', requestedChannels: channels, deliveredOn: [], failedOn: [] };
    }

    // Create history record upfront so the in_app channel is immediately visible
    const record = await this.history.record({
      userId,
      typeId:     typeDef.id,
      priority:   typeDef.priority,
      title:      rendered.title,
      body:       rendered.body,
      channels,
      deliveredOn: channels.includes(CHANNELS.IN_APP) ? [CHANNELS.IN_APP] : [],
      failedOn:    [],
      data,
    });

    // Channels to actually dispatch (everything except in_app)
    const dispatchables = channels.filter(c => c !== CHANNELS.IN_APP);

    if (opts.queueOnly) {
      for (const ch of dispatchables) {
        this.queue.enqueue({
          userId, channel: ch, typeId: typeDef.id,
          title: rendered.title, body: rendered.body,
          data, recipient: opts.recipient || null, notificationId: record.id,
        });
      }
      return {
        notificationId:    record.id,
        requestedChannels: channels,
        deliveredOn:       channels.includes(CHANNELS.IN_APP) ? [CHANNELS.IN_APP] : [],
        failedOn:          [],
        queued:            dispatchables.length,
      };
    }

    // Inline dispatch per channel
    const deliveredOn = channels.includes(CHANNELS.IN_APP) ? [CHANNELS.IN_APP] : [];
    const failedOn    = [];
    for (const ch of dispatchables) {
      const outcome = await this._dispatchOne({
        channel:  ch,
        userId,
        typeId:   typeDef.id,
        title:    rendered.title,
        body:     rendered.body,
        data,
        recipient: opts.recipient || null,
        notificationId: record.id,
      });
      if (outcome.ok) {
        deliveredOn.push(ch);
      } else {
        failedOn.push(ch);
        // queue for retry
        this.queue.enqueue({
          userId, channel: ch, typeId: typeDef.id,
          title: rendered.title, body: rendered.body,
          data, recipient: opts.recipient || null, notificationId: record.id,
          initialError: outcome.error,
        });
      }
    }

    // Update the history record in-place (writer is append-only, but the
    // in-memory view is the one the REST endpoint reads).
    record.deliveredOn = deliveredOn;
    record.failedOn    = failedOn;

    return {
      notificationId:    record.id,
      requestedChannels: channels,
      deliveredOn,
      failedOn,
    };
  }

  /**
   * _dispatchOne — send a single channel. Returns { ok, error? }.
   */
  async _dispatchOne(job) {
    const { channel } = job;
    const adapter = this.adapters[channel];
    if (!adapter) {
      // Silently skip when the channel has no adapter configured
      return { ok: false, error: `no_adapter:${channel}` };
    }
    try {
      const result = await adapter(job);
      if (result && (result.success === true || result.ok === true)) return { ok: true };
      if (result && result.success === false) return { ok: false, error: result.error || 'adapter_failed' };
      // Some legacy adapters return void on success
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  /**
   * drainQueue — try to deliver a batch of queued jobs. Intended for a cron
   * tick or a long-running worker. Returns the queue summary.
   */
  async drainQueue(limit) {
    return this.queue.tryDrain(async (job) => {
      const outcome = await this._dispatchOne(job.payload);
      return { ok: outcome.ok, error: outcome.error };
    }, limit);
  }

  /**
   * stats — snapshot for /metrics or admin panels.
   */
  stats() {
    return {
      queue:   this.queue.stats(),
      history: this.history.stats(),
      adapters: Object.fromEntries(Object.entries(this.adapters).map(([k, v]) => [k, Boolean(v)])),
    };
  }
}

// ───────────────────────────────────────────────────────────────
// Default singleton — lazy
// ───────────────────────────────────────────────────────────────
let defaultSingleton = null;
function getDefaultService(opts) {
  if (!defaultSingleton) defaultSingleton = new NotificationService(opts);
  return defaultSingleton;
}

function resetDefaultService() {
  defaultSingleton = null;
}

module.exports = {
  NotificationService,
  getDefaultService,
  resetDefaultService,
  // re-exports for convenience
  types,
  CHANNELS,
  PRIORITIES,
};
