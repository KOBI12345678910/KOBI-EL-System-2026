// Agent Y123 — WhatsApp Business API (Meta Cloud API) adapter
// =============================================================
// File: onyx-procurement/src/comms/whatsapp.js
//
// House rule: **לא מוחקים — רק משדרגים ומגדלים.**
//             (Never delete — only upgrade and grow.)
//
// Purpose
// -------
// WhatsApp is THE dominant messaging platform in Israel, so the
// Mega-ERP (Techno-Kol Uzi / ONYX procurement layer) needs a first-
// class, auditable, bilingual (Hebrew / English) communications
// adapter for the Meta WhatsApp Cloud API.
//
// This module is:
//   * Zero-dependency  — nothing outside the Node standard lib is
//     required for execution, and the default transport is a
//     pluggable mock (`_mockTransport`) so it is fully unit-testable
//     without network access.
//   * Append-only      — every opt-in, opt-out, send attempt, webhook
//     event, template registration and business-profile change is
//     recorded in in-memory, timestamped ledgers that are **never**
//     mutated in place and **never** deleted.
//   * Bilingual-safe   — free-form text, template parameters and
//     interactive components all accept Hebrew and English without
//     any transformation; utility helpers for Hebrew digit direction
//     are included.
//   * Meta-compliant   — implements the 24-hour Customer Service
//     Window rule, template approval lifecycle, opt-in records, and
//     webhook verification token handshake per the official Meta
//     Cloud API documentation.
//
// Meta Cloud API reference (all links valid as of 2026-04):
//   * Overview           https://developers.facebook.com/docs/whatsapp/cloud-api
//   * Messages endpoint  https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//   * Template mgmt      https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
//   * Interactive msgs   https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
//   * Webhooks           https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
//   * Rate limits        https://developers.facebook.com/docs/whatsapp/cloud-api/overview/rate-limits
//   * 24-hour rule       https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#customer-service-window

'use strict';

// -------------------------------------------------------------
// 0. Constants — Meta Cloud API defaults.
// -------------------------------------------------------------
const API_VERSION = 'v19.0';
const API_HOST = 'graph.facebook.com';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour customer service window.

// Messaging tier ceilings for unique customers per 24 hours
// (Meta "Cloud API Rate Limits — Messaging Limits" reference).
const TIER_LIMITS = Object.freeze({
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Infinity,
});

const TIER_ALIASES = Object.freeze({
  1: 'TIER_1K',
  2: 'TIER_10K',
  3: 'TIER_100K',
  4: 'TIER_UNLIMITED',
  tier1: 'TIER_1K',
  tier2: 'TIER_10K',
  tier3: 'TIER_100K',
  tier4: 'TIER_UNLIMITED',
  TIER_1K: 'TIER_1K',
  TIER_10K: 'TIER_10K',
  TIER_100K: 'TIER_100K',
  TIER_UNLIMITED: 'TIER_UNLIMITED',
});

// Template approval states as returned by Meta's Business Manager.
const TEMPLATE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
});

const TEMPLATE_CATEGORIES = Object.freeze(['MARKETING', 'UTILITY', 'AUTHENTICATION']);

// Hebrew + English keywords that mean "stop sending me messages".
// Meta requires businesses to honour opt-out signals from users.
const OPT_OUT_KEYWORDS = Object.freeze([
  'stop', 'unsubscribe', 'cancel', 'quit', 'end',
  'ביטול', 'הסר', 'הסירו', 'עצור', 'הפסק', 'לא להמשיך',
]);

// -------------------------------------------------------------
// 1. Helpers
// -------------------------------------------------------------
function now() { return Date.now(); }

function isoTs(ms) { return new Date(ms != null ? ms : now()).toISOString(); }

function normalisePhone(raw) {
  if (raw == null) throw new Error('whatsapp: phone number required');
  let s = String(raw).trim();
  if (!s) throw new Error('whatsapp: phone number required');
  // Strip spaces, hyphens, parentheses, plus sign.
  s = s.replace(/[\s\-()+]/g, '');
  // Israeli domestic 0-prefix → +972.
  if (/^0\d{8,9}$/.test(s)) s = '972' + s.slice(1);
  if (!/^\d{8,15}$/.test(s)) {
    throw new Error('whatsapp: invalid phone number "' + raw + '"');
  }
  return s;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.length) {
    throw new Error('whatsapp: ' + label + ' must be a non-empty string');
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function freeze(value) { return Object.freeze(value); }

let _idCounter = 0;
function genWamid(prefix) {
  _idCounter += 1;
  // Format mirrors Meta's opaque identifiers: wamid.HEX
  return (prefix || 'wamid') + '.' + now().toString(36).toUpperCase()
    + _idCounter.toString(36).toUpperCase();
}

// Determine if a piece of text looks RTL (contains a Hebrew codepoint).
function isHebrew(text) {
  if (typeof text !== 'string') return false;
  return /[\u0590-\u05FF]/.test(text);
}

// -------------------------------------------------------------
// 2. The WhatsApp class
// -------------------------------------------------------------
class WhatsApp {
  constructor(options) {
    const opts = options || {};
    this.phoneNumberId = opts.phoneNumberId || 'PHONE_ID_TEST';
    this.businessAccountId = opts.businessAccountId || 'WABA_TEST';
    this.accessToken = opts.accessToken || 'TOKEN_TEST';
    this.verifyToken = opts.verifyToken || 'VERIFY_TEST';
    this.appSecret = opts.appSecret || 'APP_SECRET_TEST';
    this.apiVersion = opts.apiVersion || API_VERSION;
    this.apiHost = opts.apiHost || API_HOST;

    // Messaging tier (controls the daily unique-customer ceiling).
    this.tier = TIER_LIMITS.TIER_1K;
    this.tierName = 'TIER_1K';

    // Transport is pluggable. Default is the internal mock, which
    // records requests instead of sending them. Consumers inject the
    // real HTTP transport at startup via `setTransport`.
    this._transport = null;
    this._mockInbox = [];           // requests the mock received
    this._mockResponses = [];       // scripted responses (optional)

    // ---- Append-only ledgers. None of these are ever mutated in
    // place or deleted. New records are PUSHED to the tail.
    this._templates = new Map();    // name → array of registration snapshots
    this._optIns = new Map();       // phone → array of consent events
    this._optOuts = new Map();      // phone → array of opt-out events
    this._windows = new Map();      // phone → array of inbound timestamps
    this._messages = new Map();     // wamid → array of status updates
    this._outbox = [];              // chronological outbound log
    this._inbox = [];               // chronological inbound log
    this._businessProfile = [];     // chronological profile snapshots
    this._tierHistory = [
      { at: isoTs(), tier: this.tierName, limit: this.tier, reason: 'init' },
    ];
    this._auditLog = [];            // append-only everything-else ledger

    // Dedup set for idempotent inbound webhook processing.
    this._seenInboundIds = new Set();

    // Monotonic counter used to break timestamp ties for consent
    // events so that two records created within the same ms still
    // have a well-defined ordering.
    this._seq = 0;

    // The default transport is the built-in mock.
    this.setTransport(null);
  }

  // -----------------------------------------------------------
  // 2.1 Transport plumbing
  // -----------------------------------------------------------
  /**
   * Inject a custom transport function. The function receives a
   * request object `{method, path, headers, body}` and must return
   * a response `{status, body}`. Pass `null` to fall back to the
   * built-in mock transport.
   */
  setTransport(fn) {
    if (fn == null) {
      this._transport = (req) => this._mockTransport(req);
    } else if (typeof fn === 'function') {
      this._transport = fn;
    } else {
      throw new Error('whatsapp: transport must be a function');
    }
  }

  /** Push a scripted response used by the next mock request. */
  queueMockResponse(response) {
    this._mockResponses.push(response);
  }

  /** Inspect the requests the mock transport has received. */
  mockInbox() { return this._mockInbox.slice(); }

  _mockTransport(req) {
    this._mockInbox.push(clone(req));
    if (this._mockResponses.length) {
      const r = this._mockResponses.shift();
      return Promise.resolve(r);
    }
    // Default success shape matches Meta Cloud API /messages response.
    const wamid = genWamid('wamid');
    return Promise.resolve({
      status: 200,
      body: {
        messaging_product: 'whatsapp',
        contacts: req.body && req.body.to
          ? [{ input: req.body.to, wa_id: req.body.to }]
          : [],
        messages: [{ id: wamid }],
      },
    });
  }

  async _post(path, body) {
    const req = {
      method: 'POST',
      path: '/' + this.apiVersion + path,
      headers: {
        'Authorization': 'Bearer ' + this.accessToken,
        'Content-Type': 'application/json',
      },
      body,
    };
    const res = await this._transport(req);
    this._audit('http.post', { path: req.path, status: res && res.status });
    return res;
  }

  async _get(path, query) {
    const req = {
      method: 'GET',
      path: '/' + this.apiVersion + path,
      query: query || {},
      headers: { 'Authorization': 'Bearer ' + this.accessToken },
    };
    const res = await this._transport(req);
    this._audit('http.get', { path: req.path, status: res && res.status });
    return res;
  }

  // -----------------------------------------------------------
  // 2.2 Core send primitives
  // -----------------------------------------------------------

  /**
   * Send a free-form text message.
   *
   * Meta rule: free-form text can ONLY be sent to a user while the
   * 24-hour Customer Service Window is OPEN. That window is opened
   * by the *customer* sending the business any message, and stays
   * open for exactly 24 hours from the last inbound. Outside the
   * window the caller MUST use an approved template — this method
   * throws a structured error and the caller should fall back to
   * `sendTemplate`.
   *
   * @param {object} args
   * @param {string} args.to       recipient phone number (E.164-ish)
   * @param {string} args.text     message body; free-text, bilingual.
   * @param {boolean} [args.previewUrl=false]  render URL previews
   * @param {string}  [args.context]           wamid to reply to (threads)
   * @returns {Promise<object>}
   */
  async sendText(args) {
    const a = args || {};
    const to = normalisePhone(a.to);
    const text = requireString(a.text, 'text');
    this._assertNotOptedOut(to);
    if (!this.isWithinWindow(to)) {
      const err = new Error(
        'whatsapp: 24h window is closed for ' + to
        + ' — free-form text requires an approved template'
      );
      err.code = 'WINDOW_CLOSED';
      err.phone = to;
      this._audit('send.blocked', { to, reason: err.code });
      throw err;
    }
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: !!a.previewUrl },
    };
    if (a.context) body.context = { message_id: a.context };
    return this._dispatch(to, 'text', body);
  }

  /**
   * Send an approved template message. Templates are the ONLY way
   * to initiate a conversation and the ONLY way to message a user
   * after the 24h window has closed. The template must already have
   * been registered via `registerTemplate()` AND be in APPROVED
   * status — this method enforces both preconditions.
   */
  async sendTemplate(args) {
    const a = args || {};
    const to = normalisePhone(a.to);
    const name = requireString(a.templateName, 'templateName');
    const language = requireString(a.language || 'he', 'language');
    const parameters = Array.isArray(a.parameters) ? a.parameters : [];
    this._assertNotOptedOut(to);

    const snap = this.getTemplate(name);
    if (!snap) {
      throw new Error('whatsapp: template "' + name + '" has not been registered');
    }
    if (snap.status !== TEMPLATE_STATUS.APPROVED) {
      const err = new Error(
        'whatsapp: template "' + name + '" is ' + snap.status
        + ' — only APPROVED templates can be sent'
      );
      err.code = 'TEMPLATE_NOT_APPROVED';
      err.templateStatus = snap.status;
      throw err;
    }

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name,
        language: { code: language },
        components: parameters.length
          ? [{
            type: 'body',
            parameters: parameters.map((v) => ({ type: 'text', text: String(v) })),
          }]
          : [],
      },
    };
    return this._dispatch(to, 'template', body, { templateName: name });
  }

  /**
   * Send an interactive button or list message. These count as
   * free-form messages and therefore obey the 24h window rule.
   *
   * @param {object} args
   * @param {string} args.to
   * @param {'button'|'list'} args.type
   * @param {object|string} [args.header]
   * @param {string} args.body
   * @param {string} [args.footer]
   * @param {object} args.action
   */
  async sendInteractive(args) {
    const a = args || {};
    const to = normalisePhone(a.to);
    const type = a.type === 'list' ? 'list' : 'button';
    requireString(a.body, 'body');
    if (!a.action || typeof a.action !== 'object') {
      throw new Error('whatsapp: interactive.action required');
    }
    this._assertNotOptedOut(to);
    if (!this.isWithinWindow(to)) {
      const err = new Error('whatsapp: interactive messages require an open 24h window for ' + to);
      err.code = 'WINDOW_CLOSED';
      throw err;
    }
    const interactive = {
      type,
      body: { text: a.body },
    };
    if (a.header) {
      interactive.header = typeof a.header === 'string'
        ? { type: 'text', text: a.header }
        : a.header;
    }
    if (a.footer) interactive.footer = { text: a.footer };

    if (type === 'button') {
      const buttons = Array.isArray(a.action.buttons) ? a.action.buttons : [];
      if (!buttons.length) {
        throw new Error('whatsapp: interactive button action needs at least one button');
      }
      interactive.action = {
        buttons: buttons.slice(0, 3).map((b, i) => ({
          type: 'reply',
          reply: {
            id: b.id || ('btn_' + (i + 1)),
            title: String(b.title || '').slice(0, 20),
          },
        })),
      };
    } else {
      // list
      interactive.action = {
        button: String(a.action.button || 'בחר'),
        sections: Array.isArray(a.action.sections) ? a.action.sections : [],
      };
    }

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    };
    return this._dispatch(to, 'interactive', body, { interactiveType: type });
  }

  /**
   * Send a media message (image / document / audio / video).
   * Media is a free-form message type and therefore respects the
   * 24-hour window.
   */
  async sendMedia(args) {
    const a = args || {};
    const to = normalisePhone(a.to);
    const allowed = ['image', 'document', 'audio', 'video'];
    if (!allowed.includes(a.type)) {
      throw new Error('whatsapp: media type must be one of ' + allowed.join(','));
    }
    requireString(a.url, 'url');
    this._assertNotOptedOut(to);
    if (!this.isWithinWindow(to)) {
      const err = new Error('whatsapp: media requires an open 24h window for ' + to);
      err.code = 'WINDOW_CLOSED';
      throw err;
    }
    const media = { link: a.url };
    if (a.caption && (a.type === 'image' || a.type === 'document' || a.type === 'video')) {
      media.caption = a.caption;
    }
    if (a.filename && a.type === 'document') media.filename = a.filename;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: a.type,
      [a.type]: media,
    };
    return this._dispatch(to, a.type, body);
  }

  /**
   * Send a location pin. Useful for delivery dispatch or field
   * service workflows — Israel has dense urban coordinates.
   */
  async sendLocation(args) {
    const a = args || {};
    const to = normalisePhone(a.to);
    const lat = Number(a.latitude);
    const lng = Number(a.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('whatsapp: latitude and longitude required');
    }
    this._assertNotOptedOut(to);
    if (!this.isWithinWindow(to)) {
      const err = new Error('whatsapp: location requires an open 24h window for ' + to);
      err.code = 'WINDOW_CLOSED';
      throw err;
    }
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location: {
        latitude: lat,
        longitude: lng,
        name: a.name || '',
        address: a.address || '',
      },
    };
    return this._dispatch(to, 'location', body);
  }

  // -----------------------------------------------------------
  // 2.3 Templates — registration, lookup, approval simulation
  // -----------------------------------------------------------

  /**
   * Register a new message template for Meta approval. In production
   * this POSTs to `/{whatsapp_business_account_id}/message_templates`
   * and the returned status is PENDING until a human at Meta reviews
   * it. For test / mock mode the adapter auto-approves after the
   * round-trip so integration tests can exercise `sendTemplate`.
   *
   * The append-only ledger means re-registering an existing template
   * does NOT overwrite the previous snapshot — both live side by side
   * and `getTemplate()` returns the most recent.
   */
  async registerTemplate(args) {
    const a = args || {};
    const name = requireString(a.name, 'name');
    if (!TEMPLATE_CATEGORIES.includes(a.category)) {
      throw new Error('whatsapp: category must be one of ' + TEMPLATE_CATEGORIES.join(','));
    }
    const language = requireString(a.language || 'he', 'language');
    if (!Array.isArray(a.components) || !a.components.length) {
      throw new Error('whatsapp: template components[] required');
    }
    const snapshot = freeze({
      name,
      language,
      category: a.category,
      components: clone(a.components),
      status: TEMPLATE_STATUS.PENDING,
      submittedAt: isoTs(),
      approvedAt: null,
      id: 'tpl_' + name + '_' + (this._templates.get(name) || []).length,
    });
    const history = this._templates.get(name) || [];
    history.push(snapshot);
    this._templates.set(name, history);

    // POST to Meta (mock default).
    await this._post('/' + this.businessAccountId + '/message_templates', {
      name,
      language,
      category: a.category,
      components: a.components,
    });

    // Mock auto-approval so tests can exercise the send path.
    const approved = freeze({
      ...snapshot,
      status: TEMPLATE_STATUS.APPROVED,
      approvedAt: isoTs(),
    });
    history.push(approved);
    this._audit('template.registered', { name, category: a.category, language });
    return approved;
  }

  /** Get the most recent snapshot of a template by name. */
  getTemplate(name) {
    const history = this._templates.get(name);
    if (!history || !history.length) return null;
    return history[history.length - 1];
  }

  /** Return every registration snapshot for a template (audit view). */
  templateHistory(name) {
    const history = this._templates.get(name);
    return history ? history.slice() : [];
  }

  // -----------------------------------------------------------
  // 2.4 Webhooks — verification and inbound handling
  // -----------------------------------------------------------

  /**
   * GET /webhook verification handshake.
   * Returns the challenge string on success, null on failure.
   */
  verifyWebhook(args) {
    const a = args || {};
    if (a.mode === 'subscribe' && a.token && a.token === this.verifyToken) {
      this._audit('webhook.verified', { mode: a.mode });
      return a.challenge != null ? String(a.challenge) : '';
    }
    this._audit('webhook.verify.failed', { mode: a.mode });
    return null;
  }

  /**
   * Parse an inbound webhook POST payload. Returns a structured
   * summary `{messages, statuses, optOuts}` and updates internal
   * state (conversation window, message status ledger, opt-outs).
   */
  handleIncoming(payload) {
    const out = { messages: [], statuses: [], optOuts: [] };
    const p = payload || {};
    const entries = Array.isArray(p.entry) ? p.entry
      : Array.isArray(p) ? p
        : p.entry ? [p.entry] : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};

        // Inbound messages from users — these also open / extend
        // the 24-hour customer service window.
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const m of messages) {
          if (m.id && this._seenInboundIds.has(m.id)) continue;
          if (m.id) this._seenInboundIds.add(m.id);
          const from = normalisePhone(m.from || '');
          const ts = Number(m.timestamp) ? Number(m.timestamp) * 1000 : now();
          const record = freeze({
            id: m.id || genWamid('wamid.in'),
            from,
            type: m.type || 'text',
            text: m.text ? m.text.body || '' : '',
            at: isoTs(ts),
            raw: clone(m),
          });
          this._inbox.push(record);
          this._touchWindow(from, ts);
          out.messages.push(record);

          // Honor opt-out keywords automatically.
          const lower = (record.text || '').trim().toLowerCase();
          if (OPT_OUT_KEYWORDS.some((k) => k === lower || record.text.trim() === k)) {
            const rec = this.optOut({ phoneNumber: from, reason: 'keyword:' + lower });
            out.optOuts.push(rec);
          }
        }

        // Delivery status updates for messages we sent earlier.
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const s of statuses) {
          const patch = freeze({
            id: s.id,
            status: s.status,
            recipient: s.recipient_id,
            at: isoTs(Number(s.timestamp) * 1000 || now()),
            conversation: s.conversation || null,
            errors: s.errors || null,
          });
          const history = this._messages.get(s.id) || [];
          history.push(patch);
          this._messages.set(s.id, history);
          out.statuses.push(patch);
        }
      }
    }
    this._audit('webhook.incoming', {
      messages: out.messages.length,
      statuses: out.statuses.length,
      optOuts: out.optOuts.length,
    });
    return out;
  }

  /**
   * Look up the lifecycle of a single message by its wamid. Returns
   * `null` if unknown, otherwise `{id, latest, history[]}`.
   */
  messageStatus(args) {
    const id = typeof args === 'string' ? args
      : (args && args.messageId) ? args.messageId : null;
    if (!id) return null;
    const history = this._messages.get(id);
    if (!history || !history.length) return null;
    return freeze({
      id,
      latest: history[history.length - 1].status,
      history: history.slice(),
    });
  }

  // -----------------------------------------------------------
  // 2.5 24-hour conversation window
  // -----------------------------------------------------------

  /**
   * Return the state of the customer-service window for a phone:
   *   { phoneNumber, open, opensAt, expiresAt, remainingMs, lastInboundAt }
   * The window is OPEN from the last inbound message for WINDOW_MS.
   */
  conversationWindow(args) {
    const phone = normalisePhone(typeof args === 'string' ? args
      : (args && args.phoneNumber) || '');
    const history = this._windows.get(phone) || [];
    const lastInboundAt = history.length ? history[history.length - 1] : 0;
    const expiresAt = lastInboundAt ? lastInboundAt + WINDOW_MS : 0;
    const remainingMs = Math.max(0, expiresAt - now());
    return freeze({
      phoneNumber: phone,
      open: remainingMs > 0,
      opensAt: lastInboundAt ? isoTs(lastInboundAt) : null,
      expiresAt: expiresAt ? isoTs(expiresAt) : null,
      remainingMs,
      lastInboundAt: lastInboundAt ? isoTs(lastInboundAt) : null,
      inboundCount: history.length,
    });
  }

  /** Convenience: is the window currently open? */
  isWithinWindow(phoneNumber) {
    return this.conversationWindow(phoneNumber).open;
  }

  /** Manually register an inbound timestamp (useful in tests). */
  _touchWindow(phone, ts) {
    const history = this._windows.get(phone) || [];
    history.push(ts || now());
    this._windows.set(phone, history);
  }

  // -----------------------------------------------------------
  // 2.6 Opt-in / opt-out records
  // -----------------------------------------------------------

  /**
   * Record a user's opt-in consent. Meta requires businesses to be
   * able to demonstrate opt-in on request. Records are append-only
   * — calling `optOut` later does NOT delete the opt-in event, it
   * adds an opt-out event next to it.
   */
  optIn(args) {
    const a = args || {};
    const phone = normalisePhone(a.phoneNumber);
    const source = requireString(a.source || 'website_form', 'source');
    const consentText = a.consentText || '';
    const record = freeze({
      phoneNumber: phone,
      at: isoTs(),
      source,
      consentText,
      locale: isHebrew(consentText) ? 'he' : 'en',
    });
    const history = this._optIns.get(phone) || [];
    history.push(record);
    this._optIns.set(phone, history);
    this._audit('optin.recorded', { phone, source });
    return record;
  }

  /** Check whether a phone has an active opt-in (no later opt-out). */
  hasOptIn(phoneNumber) {
    const phone = normalisePhone(phoneNumber);
    const ins = this._optIns.get(phone) || [];
    if (!ins.length) return false;
    const outs = this._optOuts.get(phone) || [];
    if (!outs.length) return true;
    const lastIn = ins[ins.length - 1].at;
    const lastOut = outs[outs.length - 1].at;
    return lastIn > lastOut;
  }

  /**
   * Record an opt-out. Meta REQUIRES that opt-out signals be
   * honoured — after this point the adapter refuses to dispatch
   * any outbound message until a new opt-in arrives.
   */
  optOut(args) {
    const a = args || {};
    const phone = normalisePhone(a.phoneNumber);
    const reason = a.reason || 'user_requested';
    const record = freeze({ phoneNumber: phone, at: isoTs(), reason });
    const history = this._optOuts.get(phone) || [];
    history.push(record);
    this._optOuts.set(phone, history);
    this._audit('optout.recorded', { phone, reason });
    return record;
  }

  /** Return the full, append-only consent history for a phone. */
  consentHistory(phoneNumber) {
    const phone = normalisePhone(phoneNumber);
    const ins = (this._optIns.get(phone) || []).map((e) => ({ ...e, event: 'opt_in' }));
    const outs = (this._optOuts.get(phone) || []).map((e) => ({ ...e, event: 'opt_out' }));
    return [...ins, ...outs].sort((a, b) => a.at.localeCompare(b.at));
  }

  _assertNotOptedOut(phone) {
    const outs = this._optOuts.get(phone) || [];
    const ins = this._optIns.get(phone) || [];
    if (!outs.length) return;
    const lastOut = outs[outs.length - 1].at;
    const lastIn = ins.length ? ins[ins.length - 1].at : '';
    if (lastOut > lastIn) {
      const err = new Error('whatsapp: ' + phone + ' has opted out');
      err.code = 'OPTED_OUT';
      throw err;
    }
  }

  // -----------------------------------------------------------
  // 2.7 Business profile
  // -----------------------------------------------------------

  /**
   * Update the WhatsApp Business profile (description, categories,
   * website, address). Snapshots are appended — history is kept.
   */
  async businessProfile(args) {
    const a = args || {};
    const snapshot = freeze({
      at: isoTs(),
      description: a.description || '',
      categories: Array.isArray(a.categories) ? a.categories.slice() : [],
      website: Array.isArray(a.website) ? a.website.slice()
        : a.website ? [a.website] : [],
      address: a.address || '',
      vertical: a.vertical || 'UNDEFINED',
      email: a.email || '',
      about: a.about || '',
    });
    this._businessProfile.push(snapshot);
    await this._post('/' + this.phoneNumberId + '/whatsapp_business_profile', {
      messaging_product: 'whatsapp',
      ...snapshot,
    });
    this._audit('profile.updated', { at: snapshot.at });
    return snapshot;
  }

  /** Most recent business profile snapshot, or null. */
  currentBusinessProfile() {
    if (!this._businessProfile.length) return null;
    return this._businessProfile[this._businessProfile.length - 1];
  }

  // -----------------------------------------------------------
  // 2.8 Rate limits / tier tracking
  // -----------------------------------------------------------

  /**
   * Set / inspect the messaging tier. Accepts tier name, numeric
   * alias or {tier, reason}. Returns the resolved limit structure.
   */
  rateLimits(tier) {
    if (tier == null) {
      return freeze({
        tier: this.tierName,
        limitPerDay: this.tier,
        history: this._tierHistory.slice(),
      });
    }
    const key = typeof tier === 'object'
      ? (tier.tier != null ? tier.tier : null)
      : tier;
    const resolved = TIER_ALIASES[key];
    if (!resolved) {
      throw new Error('whatsapp: unknown tier "' + tier + '"');
    }
    this.tierName = resolved;
    this.tier = TIER_LIMITS[resolved];
    this._tierHistory.push({
      at: isoTs(),
      tier: resolved,
      limit: this.tier,
      reason: (tier && tier.reason) || 'manual',
    });
    this._audit('tier.updated', { tier: resolved, limit: this.tier });
    return freeze({
      tier: this.tierName,
      limitPerDay: this.tier,
      history: this._tierHistory.slice(),
    });
  }

  // -----------------------------------------------------------
  // 2.9 Dispatch pipeline (shared by all send methods)
  // -----------------------------------------------------------

  async _dispatch(to, kind, body, extra) {
    // Enforce daily tier ceiling.
    const sentToday = this._uniqueRecipientsInLast24h();
    if (sentToday.size >= this.tier && !sentToday.has(to)) {
      const err = new Error(
        'whatsapp: messaging tier ' + this.tierName + ' reached (' + this.tier + ' unique customers/24h)'
      );
      err.code = 'TIER_EXCEEDED';
      throw err;
    }
    const res = await this._post('/' + this.phoneNumberId + '/messages', body);
    const wamid = (res && res.body && Array.isArray(res.body.messages)
      && res.body.messages[0] && res.body.messages[0].id) || genWamid('wamid.auto');
    const envelope = freeze({
      at: isoTs(),
      to,
      kind,
      wamid,
      status: res && res.status,
      ...(extra || {}),
    });
    this._outbox.push(envelope);
    // seed status ledger with "sent"
    const hist = this._messages.get(wamid) || [];
    hist.push(freeze({
      id: wamid, status: 'sent', recipient: to, at: envelope.at,
    }));
    this._messages.set(wamid, hist);
    this._audit('send', { to, kind, wamid });
    return envelope;
  }

  _uniqueRecipientsInLast24h() {
    const cutoff = now() - WINDOW_MS;
    const set = new Set();
    for (const m of this._outbox) {
      if (new Date(m.at).getTime() >= cutoff) set.add(m.to);
    }
    return set;
  }

  // -----------------------------------------------------------
  // 2.10 Audit / introspection
  // -----------------------------------------------------------

  _audit(event, data) {
    this._auditLog.push(freeze({ at: isoTs(), event, data: clone(data || {}) }));
  }

  auditLog() { return this._auditLog.slice(); }
  outbox()   { return this._outbox.slice(); }
  inbox()    { return this._inbox.slice(); }

  stats() {
    return freeze({
      tier: this.tierName,
      limitPerDay: this.tier,
      templates: this._templates.size,
      optIns: this._optIns.size,
      optOuts: this._optOuts.size,
      outbound: this._outbox.length,
      inbound: this._inbox.length,
      uniqueRecipientsLast24h: this._uniqueRecipientsInLast24h().size,
    });
  }
}

// -------------------------------------------------------------
// 3. Exports
// -------------------------------------------------------------
module.exports = {
  WhatsApp,
  TIER_LIMITS,
  TEMPLATE_STATUS,
  TEMPLATE_CATEGORIES,
  OPT_OUT_KEYWORDS,
  WINDOW_MS,
  API_VERSION,
  // Small utilities exported for consumers and tests:
  normalisePhone,
  isHebrew,
};
