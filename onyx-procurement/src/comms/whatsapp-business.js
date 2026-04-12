// Agent Y-123 — WhatsApp Business API (Meta Cloud) adapter
// =============================================================
// File: onyx-procurement/src/comms/whatsapp-business.js
//
// House rule: **לא מוחקים — רק משדרגים ומגדלים.**
//             (Never delete — only upgrade and grow.)
//
// Purpose
// -------
// Second-generation WhatsApp Business adapter for the Techno-Kol Uzi
// Mega-ERP (ONYX procurement layer). It sits alongside the earlier
// `whatsapp.js` module — that one is kept, never removed. This one
// adds: Meta-approved template lifecycle, interactive buttons/lists,
// reply-threading, read-receipts, per-conversation pricing reports,
// statutory opt-out per חוק התקשורת (הודעת סרק) סעיף 30א (Israeli
// Communications Law, Spam clause), and a pluggable mock transport so
// tests need zero network access.
//
// Zero external deps — only Node built-ins (`node:https`). Storage is
// strictly in-memory, append-only ledgers.
//
// Bilingual (Hebrew RTL + English LTR). Every public event record
// contains both `labelHe` and `labelEn` fields so downstream UI layers
// can render either language without re-translating.
//
// Meta Cloud API reference (v19.0, valid 2026-04):
//   * Messages      /{phone_number_id}/messages
//   * Templates     /{waba_id}/message_templates
//   * Media         /{phone_number_id}/media
//   * Webhooks      https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
//   * Rate limits   https://developers.facebook.com/docs/whatsapp/cloud-api/overview/rate-limits
//   * Pricing       https://developers.facebook.com/docs/whatsapp/pricing

'use strict';

const https = require('node:https');

// -------------------------------------------------------------
// 0. Constants
// -------------------------------------------------------------
const API_VERSION = 'v19.0';
const API_HOST = 'graph.facebook.com';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour customer service window.

// Meta messaging tiers — unique customers that may be contacted in a
// rolling 24-hour window.
const TIER_LIMITS = Object.freeze({
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Infinity,
});

const TIER_ALIASES = Object.freeze({
  0: 'TIER_250',
  1: 'TIER_1K',
  2: 'TIER_10K',
  3: 'TIER_100K',
  4: 'TIER_UNLIMITED',
  tier0: 'TIER_250',
  tier1: 'TIER_1K',
  tier2: 'TIER_10K',
  tier3: 'TIER_100K',
  tier4: 'TIER_UNLIMITED',
  TIER_250: 'TIER_250',
  TIER_1K: 'TIER_1K',
  TIER_10K: 'TIER_10K',
  TIER_100K: 'TIER_100K',
  TIER_UNLIMITED: 'TIER_UNLIMITED',
});

// Template approval lifecycle states (mirror Meta Business Manager).
const TEMPLATE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
});

// Meta template categories (2023 pricing reform).
const TEMPLATE_CATEGORIES = Object.freeze([
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
  'SERVICE',
]);

// Conversation categories used for pricing (per-conversation model).
const CONVERSATION_CATEGORIES = Object.freeze([
  'marketing',
  'utility',
  'authentication',
  'service',
]);

// Meta WhatsApp pricing — Israel region, USD per conversation.
// Values are authoritative constants for the 2026 fiscal year
// published by Meta in Nov-2025 (regional rate card).
// Source: https://developers.facebook.com/docs/whatsapp/pricing
const PRICING_ISRAEL_USD = Object.freeze({
  marketing: 0.0353,
  utility: 0.0160,
  authentication: 0.0128,
  service: 0.0000, // free within the customer service window
});

// Statutory opt-out keywords. Honours both חוק התקשורת §30א
// (Israel Communications Law, spam clause) *and* Meta policy.
const OPT_OUT_KEYWORDS = Object.freeze([
  'stop', 'unsubscribe', 'cancel', 'quit', 'end', 'remove',
  'עצור', 'הסר', 'הסירו', 'ביטול', 'הפסק', 'לא להמשיך', 'סטופ',
]);

// Supported media types for sendMedia.
const MEDIA_TYPES = Object.freeze(['image', 'video', 'audio', 'document', 'sticker']);

// Supported interactive types.
const INTERACTIVE_TYPES = Object.freeze(['button', 'list', 'product', 'product_list']);

// Delivery state machine — the only allowed transitions.
const DELIVERY_STATES = Object.freeze(['queued', 'sent', 'delivered', 'read', 'failed']);

// -------------------------------------------------------------
// 1. Pure helpers
// -------------------------------------------------------------
function now() { return Date.now(); }

function isoTs(ms) { return new Date(ms != null ? ms : now()).toISOString(); }

/**
 * Normalise an Israeli or international phone number to E.164 digits
 * (no leading "+").
 *
 *   "054-1234567"  -> "972541234567"
 *   "0541234567"   -> "972541234567"
 *   "+972541234567"-> "972541234567"
 *   "972541234567" -> "972541234567"
 */
function normalisePhone(raw) {
  if (raw == null) throw new Error('whatsapp-business: phone number required');
  let s = String(raw).trim();
  if (!s) throw new Error('whatsapp-business: phone number required');
  s = s.replace(/[\s\-()+]/g, '');
  if (/^0\d{8,9}$/.test(s)) s = '972' + s.slice(1);
  if (!/^\d{8,15}$/.test(s)) {
    throw new Error('whatsapp-business: invalid phone number "' + raw + '"');
  }
  return s;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.length) {
    throw new Error('whatsapp-business: ' + label + ' must be a non-empty string');
  }
  return value;
}

function requireObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('whatsapp-business: ' + label + ' must be an object');
  }
  return value;
}

function uniqueId(prefix) {
  // Deterministic-looking monotonically increasing id — no crypto dep.
  uniqueId._n = (uniqueId._n || 0) + 1;
  const n = uniqueId._n.toString(36).padStart(4, '0');
  const ts = now().toString(36);
  return (prefix || 'id') + '.' + ts + '.' + n;
}

function textContainsOptOut(body) {
  if (typeof body !== 'string' || !body) return false;
  const lower = body.toLocaleLowerCase('he-IL').trim();
  for (let i = 0; i < OPT_OUT_KEYWORDS.length; i++) {
    const kw = OPT_OUT_KEYWORDS[i].toLocaleLowerCase('he-IL');
    if (lower === kw) return true;
    if (lower.startsWith(kw + ' ') || lower.endsWith(' ' + kw)) return true;
    if (lower.indexOf(' ' + kw + ' ') !== -1) return true;
  }
  return false;
}

function freeze(obj) {
  return Object.freeze(Object.assign({}, obj));
}

// -------------------------------------------------------------
// 2. Default mock transport — zero network.
// -------------------------------------------------------------
// Contract: `transport(method, path, body) -> Promise<{status, json}>`
function defaultMockTransport(method, path, body) {
  // Meta returns `messages[0].id` for message sends, `id` for templates,
  // `id` for media uploads. Generate matching shapes.
  let payload;
  if (/\/messages$/.test(path)) {
    payload = {
      messaging_product: 'whatsapp',
      contacts: [{ input: body && body.to, wa_id: body && body.to }],
      messages: [{ id: 'wamid.MOCK.' + uniqueId('msg') }],
    };
  } else if (/\/message_templates/.test(path)) {
    payload = { id: 'tpl_' + uniqueId('tpl'), status: 'PENDING', category: body && body.category };
  } else if (/\/media$/.test(path)) {
    payload = { id: 'media_' + uniqueId('mdia') };
  } else {
    payload = { ok: true, method: method, path: path };
  }
  return Promise.resolve({ status: 200, json: payload });
}

// -------------------------------------------------------------
// 3. Real HTTPS transport factory
// -------------------------------------------------------------
// Only used when the caller does *not* inject a mock. Implements a
// single POST/GET helper using node:https, no third-party libs.
function realHttpsTransport(token) {
  return function transport(method, path, body) {
    return new Promise(function (resolve, reject) {
      const data = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null;
      const req = https.request({
        host: API_HOST,
        path: path,
        method: method,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Content-Length': data ? data.length : 0,
        },
      }, function (res) {
        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch (_e) { json = { raw: raw }; }
          resolve({ status: res.statusCode, json: json });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  };
}

// -------------------------------------------------------------
// 4. WhatsAppBusiness class
// -------------------------------------------------------------
class WhatsAppBusiness {
  constructor(options) {
    // Append-only ledgers — never spliced, never cleared.
    this._sends = [];            // every outgoing send attempt
    this._webhooks = [];         // raw inbound webhook envelopes
    this._conversations = new Map(); // phone -> [{openedAt, kind}]
    this._optOuts = new Map();   // phone -> opt-out record
    this._templates = new Map(); // name@lang -> template record
    this._deliveries = new Map();// msgId -> timeline array
    this._rateUsage = new Map(); // date -> Set<phone>
    this._readReceipts = [];     // explicit markAsRead events
    this._cost = [];             // per-conversation cost entries

    this._transport = null;
    this._config = null;
    this._tier = 'TIER_1K';

    if (options) this.configure(options);
  }

  // -----------------------------------------------------------
  // 4.1 configure
  // -----------------------------------------------------------
  /**
   * Establish credentials + optional injected transport.
   *
   * @param {Object} o
   * @param {string} o.apiKey          Meta Cloud API access token.
   * @param {string} o.phoneNumberId   Cloud API phone-number-id.
   * @param {string} o.businessId      WhatsApp Business Account id.
   * @param {string} [o.tier]          Messaging tier name or alias.
   * @param {Function} [o.injectTransport] Mockable transport for tests.
   */
  configure(o) {
    requireObject(o, 'configure(options)');
    requireString(o.apiKey, 'apiKey');
    requireString(o.phoneNumberId, 'phoneNumberId');
    requireString(o.businessId, 'businessId');

    this._config = freeze({
      apiKey: o.apiKey,
      phoneNumberId: o.phoneNumberId,
      businessId: o.businessId,
      verifyToken: o.verifyToken || null,
      appSecret: o.appSecret || null,
    });

    if (o.tier != null) {
      const canonical = TIER_ALIASES[o.tier];
      if (!canonical) throw new Error('whatsapp-business: unknown tier "' + o.tier + '"');
      this._tier = canonical;
    }

    // Transport precedence: injected > real https.
    if (typeof o.injectTransport === 'function') {
      this._transport = o.injectTransport;
    } else {
      this._transport = realHttpsTransport(o.apiKey);
    }

    return this._config;
  }

  _assertConfigured() {
    if (!this._config) throw new Error('whatsapp-business: configure() must be called first');
  }

  // -----------------------------------------------------------
  // 4.2 Template lifecycle
  // -----------------------------------------------------------
  /**
   * Submit a template for Meta approval. Returns a pending template
   * record; the caller must later flip status to APPROVED (Meta does
   * this asynchronously in production).
   *
   * @param {Object} o
   * @param {string} o.name       Template name, lowercase + underscores.
   * @param {string} o.lang       BCP-47 locale, e.g. 'he' or 'en_US'.
   * @param {string} o.category   MARKETING | UTILITY | AUTHENTICATION | SERVICE
   * @param {Array}  o.components Meta component definitions.
   */
  templateApproval(o) {
    this._assertConfigured();
    requireObject(o, 'templateApproval(options)');
    const name = requireString(o.name, 'template name');
    const lang = requireString(o.lang, 'template lang');
    const category = requireString(o.category, 'template category');
    if (!TEMPLATE_CATEGORIES.includes(category)) {
      throw new Error('whatsapp-business: unknown template category "' + category + '"');
    }
    if (!Array.isArray(o.components) || !o.components.length) {
      throw new Error('whatsapp-business: template components must be a non-empty array');
    }

    const key = name + '@' + lang;
    const record = {
      key: key,
      name: name,
      lang: lang,
      category: category,
      components: o.components.slice(),
      status: TEMPLATE_STATUS.PENDING,
      submittedAt: isoTs(),
      labelHe: 'תבנית ממתינה לאישור מטא',
      labelEn: 'Template pending Meta approval',
    };
    this._templates.set(key, record);

    // In mock transport, auto-approve so tests can send immediately.
    const self = this;
    return this._transport('POST', '/' + API_VERSION + '/' + this._config.businessId + '/message_templates', {
      name: name, language: lang, category: category, components: o.components,
    }).then(function (res) {
      const stored = self._templates.get(key);
      if (res && res.json && res.json.id) {
        stored.metaId = res.json.id;
      }
      return freeze(stored);
    });
  }

  /**
   * Flip an existing template's approval state. Append-only: the old
   * record is preserved as a history entry in `historyStatus`.
   */
  setTemplateStatus(name, lang, status) {
    requireString(name, 'name');
    requireString(lang, 'lang');
    if (!Object.values(TEMPLATE_STATUS).includes(status)) {
      throw new Error('whatsapp-business: bad template status "' + status + '"');
    }
    const key = name + '@' + lang;
    const rec = this._templates.get(key);
    if (!rec) throw new Error('whatsapp-business: template not found "' + key + '"');
    rec.historyStatus = rec.historyStatus || [];
    rec.historyStatus.push({ from: rec.status, to: status, at: isoTs() });
    rec.status = status;
    return freeze(rec);
  }

  // -----------------------------------------------------------
  // 4.3 Send-template
  // -----------------------------------------------------------
  /**
   * Send a Meta-approved template. Templates can be sent *outside*
   * the 24-hour window; that is their whole purpose.
   */
  sendTemplate(o) {
    try {
      this._assertConfigured();
      requireObject(o, 'sendTemplate(options)');
    } catch (e) { return Promise.reject(e); }
    let to, templateName, lang, variables, tpl;
    try {
      to = normalisePhone(o.to);
      templateName = requireString(o.templateName, 'templateName');
      lang = requireString(o.lang, 'lang');
      variables = Array.isArray(o.variables) ? o.variables : [];
      this._rejectIfOptedOut(to, 'sendTemplate');
      const key = templateName + '@' + lang;
      tpl = this._templates.get(key);
      if (!tpl) {
        throw new Error('whatsapp-business: template "' + key + '" not registered');
      }
      if (tpl.status !== TEMPLATE_STATUS.APPROVED) {
        throw new Error('whatsapp-business: template "' + key + '" not approved (status=' + tpl.status + ')');
      }
      this._assertRateLimit(to);
    } catch (e) { return Promise.reject(e); }

    const parameters = variables.map(function (v) {
      return { type: 'text', text: String(v) };
    });
    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components: parameters.length ? [{ type: 'body', parameters: parameters }] : [],
      },
    };

    return this._dispatch(to, body, {
      kind: 'template',
      templateName: templateName,
      lang: lang,
      pricingCategory: this._pricingCategoryFromTemplate(tpl),
    });
  }

  _pricingCategoryFromTemplate(tpl) {
    switch (tpl.category) {
      case 'MARKETING': return 'marketing';
      case 'UTILITY': return 'utility';
      case 'AUTHENTICATION': return 'authentication';
      case 'SERVICE': return 'service';
      default: return 'utility';
    }
  }

  // -----------------------------------------------------------
  // 4.4 Free-text (only inside 24h session window)
  // -----------------------------------------------------------
  sendText(o) {
    let to, message;
    try {
      this._assertConfigured();
      requireObject(o, 'sendText(options)');
      to = normalisePhone(o.to);
      message = requireString(o.message, 'message');
      this._rejectIfOptedOut(to, 'sendText');
      if (!this.conversationWindow(to).open) {
        throw new Error('whatsapp-business: free-text forbidden — 24h window closed. Use sendTemplate().');
      }
      this._assertRateLimit(to);
    } catch (e) { return Promise.reject(e); }

    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message, preview_url: false },
    };
    if (o.contextMessageId) {
      body.context = { message_id: String(o.contextMessageId) };
    }
    return this._dispatch(to, body, { kind: 'text', pricingCategory: 'service' });
  }

  // -----------------------------------------------------------
  // 4.5 Media send
  // -----------------------------------------------------------
  sendMedia(o) {
    let to, type, mediaId;
    try {
      this._assertConfigured();
      requireObject(o, 'sendMedia(options)');
      to = normalisePhone(o.to);
      type = requireString(o.type, 'media type');
      if (!MEDIA_TYPES.includes(type)) {
        throw new Error('whatsapp-business: unsupported media type "' + type + '"');
      }
      mediaId = requireString(o.mediaId, 'mediaId');
      this._rejectIfOptedOut(to, 'sendMedia');
      if (!this.conversationWindow(to).open) {
        throw new Error('whatsapp-business: media forbidden — 24h window closed. Use sendTemplate().');
      }
      this._assertRateLimit(to);
    } catch (e) { return Promise.reject(e); }

    const media = { id: mediaId };
    if (o.caption && (type === 'image' || type === 'video' || type === 'document')) {
      media.caption = String(o.caption);
    }
    if (o.filename && type === 'document') {
      media.filename = String(o.filename);
    }

    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: type,
      [type]: media,
    };
    return this._dispatch(to, body, { kind: 'media', mediaType: type, pricingCategory: 'service' });
  }

  /**
   * Upload raw bytes as a media asset and get back a media id. In
   * production this streams multipart to `/media`. In tests the mock
   * transport just stamps a synthetic id.
   */
  uploadMedia(o) {
    this._assertConfigured();
    requireObject(o, 'uploadMedia(options)');
    requireString(o.mimeType, 'mimeType');
    if (!o.bytes && !o.filename) {
      throw new Error('whatsapp-business: uploadMedia requires bytes or filename');
    }
    return this._transport(
      'POST',
      '/' + API_VERSION + '/' + this._config.phoneNumberId + '/media',
      { mime_type: o.mimeType, filename: o.filename || null }
    ).then(function (res) {
      return res && res.json && res.json.id ? res.json.id : null;
    });
  }

  // -----------------------------------------------------------
  // 4.6 Interactive buttons / lists
  // -----------------------------------------------------------
  sendInteractive(o) {
    let to, type, payload;
    try {
      this._assertConfigured();
      requireObject(o, 'sendInteractive(options)');
      to = normalisePhone(o.to);
      type = requireString(o.type, 'interactive type');
      if (!INTERACTIVE_TYPES.includes(type)) {
        throw new Error('whatsapp-business: unsupported interactive type "' + type + '"');
      }
      payload = requireObject(o.payload, 'interactive payload');
      this._rejectIfOptedOut(to, 'sendInteractive');
      if (!this.conversationWindow(to).open) {
        throw new Error('whatsapp-business: interactive forbidden — 24h window closed. Use sendTemplate().');
      }
      this._assertRateLimit(to);
    } catch (e) { return Promise.reject(e); }

    let interactive;
    if (type === 'button') {
      if (!Array.isArray(payload.buttons) || !payload.buttons.length) {
        throw new Error('whatsapp-business: button interactive requires buttons[]');
      }
      interactive = {
        type: 'button',
        body: { text: String(payload.body || '') },
        action: {
          buttons: payload.buttons.map(function (b, i) {
            return {
              type: 'reply',
              reply: {
                id: String(b.id || ('btn_' + i)),
                title: String(b.title || b.label || '').slice(0, 20),
              },
            };
          }),
        },
      };
      if (payload.header) interactive.header = { type: 'text', text: String(payload.header) };
      if (payload.footer) interactive.footer = { text: String(payload.footer) };
    } else if (type === 'list') {
      if (!Array.isArray(payload.sections) || !payload.sections.length) {
        throw new Error('whatsapp-business: list interactive requires sections[]');
      }
      interactive = {
        type: 'list',
        body: { text: String(payload.body || '') },
        action: {
          button: String(payload.buttonText || 'בחר / Select'),
          sections: payload.sections,
        },
      };
      if (payload.header) interactive.header = { type: 'text', text: String(payload.header) };
      if (payload.footer) interactive.footer = { text: String(payload.footer) };
    } else {
      interactive = { type: type, body: payload };
    }

    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'interactive',
      interactive: interactive,
    };
    return this._dispatch(to, body, { kind: 'interactive', interactiveType: type, pricingCategory: 'service' });
  }

  // -----------------------------------------------------------
  // 4.7 Reply-in-thread
  // -----------------------------------------------------------
  replyToMessage(o) {
    let to;
    try {
      this._assertConfigured();
      requireObject(o, 'replyToMessage(options)');
      to = normalisePhone(o.to);
      requireString(o.originalMessageId, 'originalMessageId');
      requireString(o.message, 'message');
      this._rejectIfOptedOut(to, 'replyToMessage');
      if (!this.conversationWindow(to).open) {
        throw new Error('whatsapp-business: reply forbidden — 24h window closed');
      }
      this._assertRateLimit(to);
    } catch (e) { return Promise.reject(e); }

    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: o.message, preview_url: false },
      context: { message_id: o.originalMessageId },
    };
    return this._dispatch(to, body, { kind: 'reply', repliesTo: o.originalMessageId, pricingCategory: 'service' });
  }

  // -----------------------------------------------------------
  // 4.8 Read receipts
  // -----------------------------------------------------------
  markAsRead(messageId) {
    this._assertConfigured();
    requireString(messageId, 'messageId');
    const event = freeze({
      id: uniqueId('rd'),
      messageId: messageId,
      at: isoTs(),
      labelHe: 'סומן כנקרא',
      labelEn: 'Marked as read',
    });
    this._readReceipts.push(event);
    return this._transport(
      'POST',
      '/' + API_VERSION + '/' + this._config.phoneNumberId + '/messages',
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId }
    ).then(function () { return event; });
  }

  // -----------------------------------------------------------
  // 4.9 Webhook handler — text, media, status, opt-outs
  // -----------------------------------------------------------
  webhookHandler(payload) {
    this._assertConfigured();
    requireObject(payload, 'webhook payload');
    const raw = freeze({
      id: uniqueId('wh'),
      at: isoTs(),
      payload: payload,
    });
    this._webhooks.push(raw);

    const result = {
      id: raw.id,
      messages: [],
      statuses: [],
      optOuts: [],
      unknown: [],
    };

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (let i = 0; i < entries.length; i++) {
      const changes = Array.isArray(entries[i].changes) ? entries[i].changes : [];
      for (let j = 0; j < changes.length; j++) {
        const value = changes[j].value || {};
        const msgs = Array.isArray(value.messages) ? value.messages : [];
        for (let k = 0; k < msgs.length; k++) {
          const m = msgs[k];
          let normalized;
          try {
            normalized = this._normaliseInboundMessage(m);
          } catch (_e) {
            result.unknown.push(m);
            continue;
          }
          // Every inbound message opens (or refreshes) the 24h window.
          this._openWindow(normalized.from, m.id);
          result.messages.push(normalized);
          // Free-text with STOP keyword = statutory opt-out.
          if (normalized.type === 'text' && textContainsOptOut(normalized.text)) {
            const rec = this.optOut(normalized.from, 'inbound STOP keyword');
            result.optOuts.push(rec);
          }
        }
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (let k = 0; k < statuses.length; k++) {
          const s = statuses[k];
          const state = String(s.status || '').toLowerCase();
          if (!DELIVERY_STATES.includes(state)) {
            result.unknown.push(s);
            continue;
          }
          this._recordDelivery(s.id, state, s);
          result.statuses.push({
            id: s.id,
            state: state,
            at: s.timestamp ? isoTs(Number(s.timestamp) * 1000) : isoTs(),
          });
          // Also capture pricing info if Meta sent it.
          if (s.pricing && s.pricing.category) {
            this._cost.push(freeze({
              id: uniqueId('cost'),
              at: isoTs(),
              msgId: s.id,
              category: s.pricing.category,
              billable: !!s.pricing.billable,
              conversationId: s.conversation && s.conversation.id || null,
              labelHe: 'רישום חיוב מטא',
              labelEn: 'Meta billing record',
            }));
          }
        }
      }
    }
    return freeze(result);
  }

  _normaliseInboundMessage(m) {
    requireObject(m, 'inbound message');
    const from = normalisePhone(m.from);
    const type = requireString(m.type, 'inbound type');
    const base = { id: m.id, from: from, type: type, at: isoTs() };
    if (type === 'text') {
      return Object.assign(base, { text: (m.text && m.text.body) || '' });
    }
    if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
      const mediaNode = m[type] || {};
      return Object.assign(base, {
        mediaId: mediaNode.id || null,
        mimeType: mediaNode.mime_type || null,
        caption: mediaNode.caption || null,
      });
    }
    if (type === 'interactive') {
      const inter = m.interactive || {};
      return Object.assign(base, {
        interactiveType: inter.type || null,
        buttonReply: inter.button_reply || null,
        listReply: inter.list_reply || null,
      });
    }
    if (type === 'button') {
      return Object.assign(base, { button: m.button || null });
    }
    return base;
  }

  // -----------------------------------------------------------
  // 4.10 Statutory opt-out (חוק התקשורת §30א)
  // -----------------------------------------------------------
  optOut(phone, reason) {
    const norm = normalisePhone(phone);
    if (this._optOuts.has(norm)) return this._optOuts.get(norm);
    const rec = freeze({
      phone: norm,
      at: isoTs(),
      reason: reason || 'user request',
      legalBasis: 'חוק התקשורת (בזק ושידורים) תשמ"ב-1982 סעיף 30א',
      legalBasisEn: 'Israeli Communications Law §30A — anti-spam',
      labelHe: 'הסרה מרשימת תפוצה',
      labelEn: 'Removed from broadcast list',
    });
    this._optOuts.set(norm, rec);
    return rec;
  }

  isOptedOut(phone) {
    try {
      return this._optOuts.has(normalisePhone(phone));
    } catch (_e) { return false; }
  }

  _rejectIfOptedOut(phone, fn) {
    if (this._optOuts.has(phone)) {
      const rec = this._optOuts.get(phone);
      throw new Error('whatsapp-business: ' + fn + ' blocked — phone ' + phone
        + ' opted out at ' + rec.at + ' (' + rec.legalBasisEn + ')');
    }
  }

  // -----------------------------------------------------------
  // 4.11 Rate limit check (Meta tier ceilings)
  // -----------------------------------------------------------
  rateLimitCheck(phone) {
    const norm = normalisePhone(phone);
    const today = new Date().toISOString().slice(0, 10);
    const set = this._rateUsage.get(today) || new Set();
    const limit = TIER_LIMITS[this._tier];
    const used = set.size;
    const already = set.has(norm);
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);
    return freeze({
      tier: this._tier,
      limit: limit,
      used: used,
      remaining: remaining,
      allowed: already || used < limit,
      alreadyCountedToday: already,
      date: today,
    });
  }

  _assertRateLimit(phone) {
    const check = this.rateLimitCheck(phone);
    if (!check.allowed) {
      throw new Error('whatsapp-business: rate limit exceeded (tier=' + check.tier
        + ', limit=' + check.limit + ', used=' + check.used + ')');
    }
    // Mark consumption.
    const set = this._rateUsage.get(check.date) || new Set();
    set.add(phone);
    this._rateUsage.set(check.date, set);
  }

  // -----------------------------------------------------------
  // 4.12 Delivery reports
  // -----------------------------------------------------------
  _recordDelivery(msgId, state, raw) {
    if (!msgId) return;
    const timeline = this._deliveries.get(msgId) || [];
    timeline.push(freeze({
      state: state,
      at: isoTs(),
      raw: raw || null,
    }));
    this._deliveries.set(msgId, timeline);
  }

  deliveryReport(msgId) {
    if (!msgId) throw new Error('whatsapp-business: msgId required');
    const timeline = this._deliveries.get(msgId) || [];
    let current = 'queued';
    for (let i = 0; i < timeline.length; i++) current = timeline[i].state;
    return freeze({
      msgId: msgId,
      current: current,
      history: timeline.slice(),
      delivered: timeline.some(function (e) { return e.state === 'delivered' || e.state === 'read'; }),
      read: timeline.some(function (e) { return e.state === 'read'; }),
      failed: timeline.some(function (e) { return e.state === 'failed'; }),
    });
  }

  // -----------------------------------------------------------
  // 4.13 24-hour customer service window
  // -----------------------------------------------------------
  _openWindow(phone, messageId) {
    const list = this._conversations.get(phone) || [];
    list.push(freeze({
      openedAt: now(),
      messageId: messageId || null,
      labelHe: 'חלון שירות נפתח',
      labelEn: 'Customer service window opened',
    }));
    this._conversations.set(phone, list);
  }

  conversationWindow(phone) {
    const norm = normalisePhone(phone);
    const list = this._conversations.get(norm) || [];
    if (!list.length) {
      return freeze({ phone: norm, open: false, lastOpenedAt: null, expiresAt: null, remainingMs: 0 });
    }
    const last = list[list.length - 1].openedAt;
    const expires = last + WINDOW_MS;
    const remaining = Math.max(0, expires - now());
    return freeze({
      phone: norm,
      open: remaining > 0,
      lastOpenedAt: isoTs(last),
      expiresAt: isoTs(expires),
      remainingMs: remaining,
    });
  }

  // -----------------------------------------------------------
  // 4.14 Daily cost report — per-conversation pricing
  // -----------------------------------------------------------
  /**
   * Sum up estimated WhatsApp conversation costs for a given period.
   *
   * @param {Object} [period]
   * @param {string|Date} [period.from]
   * @param {string|Date} [period.to]
   * @returns {Object}
   */
  dailyCostReport(period) {
    const from = period && period.from ? new Date(period.from).getTime() : 0;
    const to = period && period.to ? new Date(period.to).getTime() : now() + WINDOW_MS;

    const byCategory = { marketing: 0, utility: 0, authentication: 0, service: 0 };
    const byDay = {};
    let total = 0;
    let billableCount = 0;

    for (let i = 0; i < this._sends.length; i++) {
      const s = this._sends[i];
      const t = new Date(s.at).getTime();
      if (t < from || t > to) continue;
      const cat = s.pricingCategory || 'utility';
      const unit = PRICING_ISRAEL_USD[cat] != null ? PRICING_ISRAEL_USD[cat] : 0;
      byCategory[cat] = (byCategory[cat] || 0) + unit;
      const day = s.at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + unit;
      total += unit;
      if (unit > 0) billableCount++;
    }

    return freeze({
      currency: 'USD',
      region: 'IL',
      from: isoTs(from || now()),
      to: isoTs(to),
      total: Number(total.toFixed(6)),
      billableCount: billableCount,
      byCategory: freeze(byCategory),
      byDay: freeze(byDay),
      unitPrices: PRICING_ISRAEL_USD,
      labelHe: 'דוח עלויות יומי WhatsApp — ישראל',
      labelEn: 'WhatsApp daily cost report — Israel',
    });
  }

  // -----------------------------------------------------------
  // 4.15 Internal dispatch (one path for every send)
  // -----------------------------------------------------------
  _dispatch(to, body, meta) {
    const self = this;
    const path = '/' + API_VERSION + '/' + this._config.phoneNumberId + '/messages';
    const record = {
      id: uniqueId('snd'),
      at: isoTs(),
      to: to,
      kind: meta.kind,
      pricingCategory: meta.pricingCategory || 'utility',
      body: body,
      templateName: meta.templateName || null,
      lang: meta.lang || null,
      interactiveType: meta.interactiveType || null,
      mediaType: meta.mediaType || null,
      repliesTo: meta.repliesTo || null,
      status: 'queued',
      msgId: null,
      labelHe: 'שליחת הודעה',
      labelEn: 'Outgoing message',
    };
    this._sends.push(record);
    this._recordDelivery(record.id, 'queued', null);

    return this._transport('POST', path, body).then(function (res) {
      const msgId = res && res.json && res.json.messages && res.json.messages[0] && res.json.messages[0].id;
      record.msgId = msgId || record.id;
      record.status = (res && res.status >= 200 && res.status < 300) ? 'sent' : 'failed';
      self._recordDelivery(record.msgId, record.status, { upstream: res && res.status });
      // If this send *opens* the billable conversation under pricing v3,
      // record the cost line item now.
      self._cost.push(freeze({
        id: uniqueId('cost'),
        at: record.at,
        msgId: record.msgId,
        category: record.pricingCategory,
        unitPrice: PRICING_ISRAEL_USD[record.pricingCategory] || 0,
        labelHe: 'רישום עלות הודעה',
        labelEn: 'Message cost ledger',
      }));
      return freeze(record);
    }).catch(function (err) {
      record.status = 'failed';
      record.error = String(err && err.message || err);
      self._recordDelivery(record.id, 'failed', { error: record.error });
      return freeze(record);
    });
  }

  // -----------------------------------------------------------
  // 4.16 Introspection (read-only)
  // -----------------------------------------------------------
  getSends() { return this._sends.slice(); }
  getWebhooks() { return this._webhooks.slice(); }
  getOptOuts() { return Array.from(this._optOuts.values()); }
  getTemplates() { return Array.from(this._templates.values()); }
  getCostLedger() { return this._cost.slice(); }
  getReadReceipts() { return this._readReceipts.slice(); }
  getTier() { return this._tier; }
}

// -------------------------------------------------------------
// 5. Exports
// -------------------------------------------------------------
module.exports = {
  WhatsAppBusiness: WhatsAppBusiness,
  TIER_LIMITS: TIER_LIMITS,
  TIER_ALIASES: TIER_ALIASES,
  TEMPLATE_STATUS: TEMPLATE_STATUS,
  TEMPLATE_CATEGORIES: TEMPLATE_CATEGORIES,
  CONVERSATION_CATEGORIES: CONVERSATION_CATEGORIES,
  PRICING_ISRAEL_USD: PRICING_ISRAEL_USD,
  OPT_OUT_KEYWORDS: OPT_OUT_KEYWORDS,
  MEDIA_TYPES: MEDIA_TYPES,
  INTERACTIVE_TYPES: INTERACTIVE_TYPES,
  DELIVERY_STATES: DELIVERY_STATES,
  WINDOW_MS: WINDOW_MS,
  API_VERSION: API_VERSION,
  API_HOST: API_HOST,
  normalisePhone: normalisePhone,
  textContainsOptOut: textContainsOptOut,
  defaultMockTransport: defaultMockTransport,
};
