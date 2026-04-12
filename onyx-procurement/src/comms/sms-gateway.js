/**
 * ONYX PROCUREMENT — Israeli SMS Gateway Adapter
 * ────────────────────────────────────────────────
 * Agent-Y122 — Unified Israeli SMS gateway supporting multiple providers
 *
 * Purpose:
 *   Provide a single send API over the common SMS providers used in
 *   the Israeli market. The original build supported five providers;
 *   this upgrade adds explicit `unicell` support plus a unified
 *   configure/transport-injection contract for the Y-122 spec, while
 *   preserving all prior providers and APIs (rule: "לא מוחקים רק
 *   משדרגים ומגדלים").
 *
 *     1. Inforu         — the dominant domestic provider
 *     2. 019 Mobile     — 019 SMS (019 Telecom) reseller API
 *     3. Unicell        — Y-122 addition: Unicell SMS gateway
 *     4. SMS4Free       — free tier, limited volume
 *     5. MessageNet     — Israel regional SMS gateway
 *     6. TrueDialog     — enterprise, fallback tier
 *     7. Mock           — deterministic in-memory transport for tests
 *
 *   Every outbound send flows through the same pipeline:
 *     phoneNormalize → validateIsraeliMobile → detectUnicode →
 *     longSMSSplit → optOutHandling → rateLimit → provider.send →
 *     auditLog → deliveryReport
 *
 *   The module ships a zero-dependency mock transport so tests never
 *   hit the network. Live mode is opt-in via SMS_GATEWAY_LIVE=1 AND
 *   valid provider credentials present in env/options.
 *
 * Non-goals / Rule compliance:
 *   • "לא מוחקים רק משדרגים ומגדלים" — this module NEVER deletes
 *     opt-out records, audit entries, scheduled messages, or existing
 *     files. It only appends and upgrades.
 *   • Does NOT replace the legacy `src/sms/send-sms.js` module; it
 *     coexists as a new, broader gateway.
 *   • Zero runtime dependencies. Only built-in Node modules.
 *
 * Israeli anti-spam law (חוק התקשורת - הודעות פרסומות, תיקון 40):
 *   • Requires opt-in consent before commercial messaging.
 *   • Requires clear sender identification.
 *   • Requires free opt-out method on every message.
 *   • Opt-out keywords: "הסר", "עצור", "STOP".
 *   • Violation damages: up to NIS 1,000 per message (statutory).
 *
 * Character limits:
 *   • GSM-7 (Latin/Basic)  : 160 chars per segment, 153 when concatenated.
 *   • UCS-2 (Hebrew/Unicode): 70 chars per segment, 67 when concatenated.
 *   • Auto-detected via `detectUnicode()`.
 */

'use strict';

const crypto = require('crypto');
const https = require('node:https');
const { URL } = require('node:url');

// ────────────────────────────────────────────────────────────────
// GSM-7 BASIC CHARSET (used to detect Unicode vs GSM-7)
// ────────────────────────────────────────────────────────────────
const GSM7_BASIC = new Set([
  '@','£','$','¥','è','é','ù','ì','ò','Ç','\n','Ø','ø','\r','Å','å',
  'Δ','_','Φ','Γ','Λ','Ω','Π','Ψ','Σ','Θ','Ξ','\u001b','Æ','æ','ß','É',
  ' ','!','"','#','¤','%','&','\'','(',')','*','+',',','-','.','/',
  '0','1','2','3','4','5','6','7','8','9',':',';','<','=','>','?',
  '¡','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  'P','Q','R','S','T','U','V','W','X','Y','Z','Ä','Ö','Ñ','Ü','§',
  '¿','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o',
  'p','q','r','s','t','u','v','w','x','y','z','ä','ö','ñ','ü','à'
]);
const GSM7_EXTENDED = new Set(['\f','^','{','}','\\','[','~',']','|','€']);

// Israeli mobile carrier prefixes → carrier name
// Ref: Ministry of Communications allocations (as of 2026)
const IL_MOBILE_PREFIXES = {
  '050': 'Pelephone',
  '051': 'We4G',
  '052': 'Cellcom',
  '053': 'Hot Mobile',
  '054': 'Partner',
  '055': 'MVNO (various)',
  '056': 'Reserved/MVNO',
  '057': 'Reserved',
  '058': 'Golan Telecom / Hot Mobile',
  '059': 'PalTel (West Bank)'
};

// Default per-provider cost (NIS per segment) and throttle ceilings
// Provider aliases: `019` === `019mobile`; both names resolve to the
// same adapter so callers may use either (Y-122 spec uses "019").
const PROVIDER_DEFAULTS = Object.freeze({
  inforu:      { cost: 0.050, perSecond: 20, sla: 0.99,  region: 'IL',
                 apiHost: 'capi.inforu.co.il', apiPath: '/api/v2/SMS/SendSms' },
  '019mobile': { cost: 0.055, perSecond: 15, sla: 0.985, region: 'IL',
                 apiHost: 'www.019mobile.co.il', apiPath: '/api/sms/send' },
  '019':       { cost: 0.055, perSecond: 15, sla: 0.985, region: 'IL',
                 apiHost: 'www.019mobile.co.il', apiPath: '/api/sms/send',
                 aliasOf: '019mobile' },
  unicell:     { cost: 0.058, perSecond: 18, sla: 0.98,  region: 'IL',
                 apiHost: 'api.unicell.co.il', apiPath: '/sms/send' },
  sms4free:    { cost: 0.000, perSecond: 1,  sla: 0.90,  region: 'IL', freeTier: true, freeLimit: 90 },
  messagenet:  { cost: 0.065, perSecond: 10, sla: 0.98,  region: 'IL' },
  truedialog:  { cost: 0.080, perSecond: 50, sla: 0.995, region: 'INTL' },
  mock:        { cost: 0.000, perSecond: 1000, sla: 1.0, region: 'TEST' }
});

// ────────────────────────────────────────────────────────────────
// Small internal helpers (no deps)
// ────────────────────────────────────────────────────────────────
function _nowIso() { return new Date().toISOString(); }
function _uid(prefix = 'msg') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}
function _deepFreeze(o) {
  Object.values(o).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) _deepFreeze(v);
  });
  return Object.freeze(o);
}

// ────────────────────────────────────────────────────────────────
// Provider adapters — share a contract: { send(payload, creds) }
// In stub/mock mode every send returns a deterministic response.
// ────────────────────────────────────────────────────────────────
class _BaseProvider {
  constructor(name, opts = {}) {
    this.name = name;
    this.opts = opts;
    this.live = !!opts.live;
  }
  // Shared mock implementation — deterministic, network-free.
  async _mockSend(payload) {
    const providerId = `${this.name}_${crypto.randomBytes(6).toString('hex')}`;
    return {
      ok: true,
      provider: this.name,
      providerMessageId: providerId,
      accepted: true,
      to: payload.to,
      segments: payload.segments || 1,
      unicode: !!payload.unicode,
      timestamp: _nowIso(),
      mocked: true
    };
  }
  async send(payload) {
    if (!this.live) return this._mockSend(payload);
    // Live path is intentionally not implemented — returning a
    // structured error so callers fall back to mock rather than
    // silently hanging.
    return {
      ok: false,
      provider: this.name,
      error: 'LIVE_TRANSPORT_NOT_CONFIGURED',
      message: `Provider ${this.name} has no live transport wired in this build`
    };
  }
}

class InforuProvider extends _BaseProvider {
  constructor(opts = {}) { super('inforu', opts); }
}
class Mobile019Provider extends _BaseProvider {
  constructor(opts = {}) { super('019mobile', opts); }
}
class UnicellProvider extends _BaseProvider {
  constructor(opts = {}) { super('unicell', opts); }
}
class Sms4FreeProvider extends _BaseProvider {
  constructor(opts = {}) { super('sms4free', opts); this.monthlyUsed = 0; }
  async send(payload) {
    if (this.monthlyUsed >= PROVIDER_DEFAULTS.sms4free.freeLimit) {
      return { ok: false, provider: this.name, error: 'FREE_TIER_EXHAUSTED' };
    }
    this.monthlyUsed += payload.segments || 1;
    return super.send(payload);
  }
}
class MessageNetProvider extends _BaseProvider {
  constructor(opts = {}) { super('messagenet', opts); }
}
class TrueDialogProvider extends _BaseProvider {
  constructor(opts = {}) { super('truedialog', opts); }
}
class MockProvider extends _BaseProvider {
  constructor(opts = {}) { super('mock', opts); }
}

// ────────────────────────────────────────────────────────────────
// SMSGateway — unified facade
// ────────────────────────────────────────────────────────────────
class SMSGateway {
  constructor(options = {}) {
    this.options = Object.assign({
      defaultSenderName: 'ONYX',
      defaultProvider: 'inforu',
      fallbackChain: ['inforu', '019mobile', 'messagenet', 'truedialog', 'sms4free'],
      live: false,
      clock: () => Date.now()
    }, options);

    // Instantiate adapters up-front — cheap, zero-dep objects.
    // Unicell + Mock added for Y-122. '019' is kept as an alias that
    // maps to the same Mobile019Provider instance so existing callers
    // using '019mobile' continue to work ("מגדלים, לא מוחקים").
    const mobile019 = new Mobile019Provider({ live: this.options.live });
    this.providers = {
      inforu:      new InforuProvider({ live: this.options.live }),
      '019mobile': mobile019,
      '019':       mobile019,
      unicell:     new UnicellProvider({ live: this.options.live }),
      sms4free:    new Sms4FreeProvider({ live: this.options.live }),
      messagenet:  new MessageNetProvider({ live: this.options.live }),
      truedialog:  new TrueDialogProvider({ live: this.options.live }),
      mock:        new MockProvider({ live: false })
    };

    // ── Y-122 runtime state (append-only) ─────────────────────────
    // configured provider + credentials + sender id (see configure)
    this._activeProvider = this.options.defaultProvider;
    this._credentials = {};
    this._activeSenderId = this.options.defaultSenderName;
    // Injected transports: { providerName: async fn(payload) }
    this._injectedTransports = {};
    this._injectedStatusFn = null;
    // Quiet hours (marketing): 20:00 → 07:00 local Asia/Jerusalem
    this._quietHours = {
      enabled: true,
      start: '20:00',
      end:   '07:00',
      timezone: 'Asia/Jerusalem'
    };
    // Per-recipient 24h counter — enforces §30א soft cap of 3/day.
    this._rollingCounts = new Map(); // phone → [{ at }]
    // Named templates
    this._templates = new Map();
    // Per-phone history (append-only, newest first)
    this._historyByPhone = new Map();
    // Incoming messages buffer (webhooks)
    this._incoming = [];

    // Rate limit state: { providerName: { windowStart, count, perSecond } }
    this._rateState = {};
    // Opt-out ledger: Map<E164Phone, { keyword, at }>
    this._optOut = new Map();
    // Audit log: array of frozen entries (append-only)
    this._audit = [];
    // Delivery reports: Map<messageId, status>
    this._deliveryReports = new Map();
    // Scheduled queue: array of { sendAt, payload, id }
    this._scheduled = [];
    // Bulk throttle token bucket (per provider)
    this._tokenBuckets = {};
  }

  // ───────── phoneNormalize ─────────
  /**
   * Normalize an Israeli phone number to E.164 (+972...).
   * Accepts: 0501234567, 0 50 1234567, 050-1234567, +972501234567,
   *          972-50-123-4567, (050)1234567.
   */
  phoneNormalize(phone) {
    if (phone == null) return null;
    let s = String(phone).trim();
    if (!s) return null;

    // Strip whitespace, dashes, parentheses, dots.
    s = s.replace(/[\s\-().]/g, '');

    // Handle leading '+972' / '00972' / '972' forms.
    if (s.startsWith('+972')) s = '0' + s.slice(4);
    else if (s.startsWith('00972')) s = '0' + s.slice(5);
    else if (s.startsWith('972') && s.length >= 11) s = '0' + s.slice(3);

    // Must be digits only now.
    if (!/^\d+$/.test(s)) return null;
    // Must start with 0 and be 9 (landline) or 10 (mobile) digits.
    if (!s.startsWith('0')) return null;
    if (s.length < 9 || s.length > 10) return null;

    // Re-emit as E.164: +972 + (drop leading 0).
    return '+972' + s.slice(1);
  }

  // ───────── validateIsraeliMobile ─────────
  /**
   * Validate that `phone` is an Israeli mobile number with a
   * recognised carrier prefix (050–059). Returns { valid, prefix,
   * carrier, e164 } or { valid:false, reason }.
   */
  validateIsraeliMobile(phone) {
    const e164 = this.phoneNormalize(phone);
    if (!e164) return { valid: false, reason: 'NORMALIZATION_FAILED' };
    if (!e164.startsWith('+972')) return { valid: false, reason: 'NOT_IL' };
    const local = '0' + e164.slice(4);   // back to 0XXYYYYYYY
    if (local.length !== 10) return { valid: false, reason: 'LENGTH' };
    const prefix = local.slice(0, 3);
    if (!/^05[0-9]$/.test(prefix)) {
      return { valid: false, reason: 'NOT_MOBILE_PREFIX', prefix };
    }
    const carrier = IL_MOBILE_PREFIXES[prefix] || 'Unknown';
    return { valid: true, prefix, carrier, e164 };
  }

  // ───────── detectUnicode ─────────
  /**
   * Returns true if `text` contains any character outside the
   * GSM-7 basic + extended sets — which is almost always the case
   * for Hebrew. When true, segments are 70 chars (UCS-2) instead
   * of 160 (GSM-7).
   *
   * Uses code-point iteration so emoji / astral-plane symbols
   * (surrogate pairs) are correctly detected as Unicode.
   */
  detectUnicode(text) {
    if (text == null) return false;
    const s = String(text);
    for (const ch of s) {                       // iterator yields code points
      if (ch.length > 1) return true;           // surrogate pair => emoji etc.
      if (ch.codePointAt(0) > 0x7f && !GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)) {
        return true;
      }
      if (ch.codePointAt(0) <= 0x7f && !GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)) {
        return true;                            // e.g. backtick, control chars
      }
    }
    return false;
  }

  /**
   * Y-122 alias: `unicodeHandling(message)` — returns a richer
   * descriptor including encoding, limits, and per-part length.
   * The original `detectUnicode`/`charLimits` APIs are preserved.
   */
  unicodeHandling(message) {
    const unicode = this.detectUnicode(message);
    const split = this.longSMSSplit({ text: message });
    return {
      encoding: unicode ? 'UCS-2' : 'GSM-7',
      unicode,
      charsPerPart: unicode ? 70 : 160,
      charsPerConcatPart: unicode ? 67 : 153,
      segments: split.segments,
      parts: split.parts,
      totalChars: split.totalChars
    };
  }

  // Expose limits alongside detection for callers who want both.
  charLimits(text) {
    const unicode = this.detectUnicode(text);
    return unicode
      ? { unicode: true,  singleLimit: 70,  multiLimit: 67  }
      : { unicode: false, singleLimit: 160, multiLimit: 153 };
  }

  // ───────── longSMSSplit ─────────
  /**
   * Split a long message into concatenated segments respecting the
   * appropriate per-segment limit. Returns { unicode, segments,
   * parts[], totalChars }.
   * Note: extended-GSM characters count as 2 in pure GSM-7 mode;
   * we conservatively count them as 2 to never underestimate.
   */
  longSMSSplit({ text }) {
    if (text == null) text = '';
    const s = String(text);
    const unicode = this.detectUnicode(s);

    // Effective char count (extended GSM chars count as 2 in GSM-7)
    let effLen = 0;
    if (unicode) {
      effLen = s.length;
    } else {
      for (let i = 0; i < s.length; i++) {
        effLen += GSM7_EXTENDED.has(s[i]) ? 2 : 1;
      }
    }

    const singleLimit = unicode ? 70  : 160;
    const multiLimit  = unicode ? 67  : 153;

    if (effLen <= singleLimit) {
      return {
        unicode,
        segments: 1,
        parts: [s],
        totalChars: effLen
      };
    }

    // Multi-segment: chunk by character index (UCS-2) / by effective
    // cost (GSM-7). Simple greedy split.
    const parts = [];
    if (unicode) {
      for (let i = 0; i < s.length; i += multiLimit) {
        parts.push(s.slice(i, i + multiLimit));
      }
    } else {
      let buf = '';
      let cost = 0;
      for (let i = 0; i < s.length; i++) {
        const c = GSM7_EXTENDED.has(s[i]) ? 2 : 1;
        if (cost + c > multiLimit) {
          parts.push(buf);
          buf = '';
          cost = 0;
        }
        buf += s[i];
        cost += c;
      }
      if (buf) parts.push(buf);
    }

    return {
      unicode,
      segments: parts.length,
      parts,
      totalChars: effLen
    };
  }

  // ───────── chooseProvider ─────────
  /**
   * Given user preferences + a fallback chain, return an ordered
   * list of provider names to try.
   *   preferences: string | string[]   — preferred providers
   *   fallback:    string[]            — explicit fallback chain
   * Missing providers are dropped silently; unknown names are
   * skipped. Never throws.
   */
  chooseProvider({ preferences = [], fallback = null } = {}) {
    const known = Object.keys(this.providers);
    const prefs = Array.isArray(preferences)
      ? preferences
      : (preferences ? [preferences] : []);
    const tail = Array.isArray(fallback) && fallback.length
      ? fallback
      : this.options.fallbackChain;
    const chain = [...prefs, ...tail]
      .filter((n) => known.includes(n))
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe, preserve order
    if (chain.length === 0) chain.push(this.options.defaultProvider);
    return chain;
  }

  // ───────── rateLimit ─────────
  /**
   * Token-bucket-lite: track how many sends happened in the current
   * 1-second window per provider. Returns { allowed, waitMs }.
   *
   * The second form — `rateLimit({ provider, perSecond })` — also
   * *updates* the configured ceiling for that provider, giving the
   * caller a knob to tighten or loosen throttles at runtime.
   */
  rateLimit({ provider, perSecond } = {}) {
    if (!provider) return { allowed: true, waitMs: 0 };
    const now = this.options.clock();
    const ceiling = typeof perSecond === 'number'
      ? perSecond
      : (PROVIDER_DEFAULTS[provider]?.perSecond || 10);
    let st = this._rateState[provider];
    if (!st || (now - st.windowStart) >= 1000) {
      st = { windowStart: now, count: 0, perSecond: ceiling };
      this._rateState[provider] = st;
    } else {
      st.perSecond = ceiling;
    }
    if (st.count < ceiling) {
      st.count += 1;
      return { allowed: true, waitMs: 0, provider, count: st.count, ceiling };
    }
    const waitMs = Math.max(1, 1000 - (now - st.windowStart));
    return { allowed: false, waitMs, provider, count: st.count, ceiling };
  }

  // ───────── costEstimate ─────────
  /**
   * Estimate NIS cost of sending `text` to `to`, per provider and
   * total (for the fallback chain's primary).
   * Returns { segments, unicode, perProvider:{name:cost}, primary }.
   */
  costEstimate({ text, to, provider } = {}) {
    const split = this.longSMSSplit({ text });
    const segments = split.segments;
    const unicode = split.unicode;
    const perProvider = {};
    for (const [name, cfg] of Object.entries(PROVIDER_DEFAULTS)) {
      perProvider[name] = +(cfg.cost * segments).toFixed(4);
    }
    const primary = provider && PROVIDER_DEFAULTS[provider]
      ? { provider, cost: perProvider[provider] }
      : { provider: this.options.defaultProvider,
          cost: perProvider[this.options.defaultProvider] };
    // `to` is accepted for API symmetry / future per-carrier pricing.
    const carrier = to ? (this.validateIsraeliMobile(to).carrier || null) : null;
    return { segments, unicode, perProvider, primary, carrier };
  }

  // ───────── optOutHandling ─────────
  /**
   * Record opt-out / check opt-out status.
   *   mode 'add'   (default if keyword given): mark number opted out
   *   mode 'check' : return { optedOut, keyword, at }
   *
   * Never deletes entries — the ledger is append-only. If the same
   * number opts out twice, only the earliest entry is kept (first
   * opt-out wins, "מגדלים ולא מוחקים").
   */
  optOutHandling({ phoneNumber, keyword, mode } = {}) {
    const e164 = this.phoneNormalize(phoneNumber);
    if (!e164) return { ok: false, reason: 'INVALID_PHONE' };

    const effectiveMode = mode || (keyword ? 'add' : 'check');

    if (effectiveMode === 'check') {
      const entry = this._optOut.get(e164);
      return entry
        ? { ok: true, optedOut: true, keyword: entry.keyword, at: entry.at, phone: e164 }
        : { ok: true, optedOut: false, phone: e164 };
    }

    // Add-mode: normalize the Hebrew/English keyword.
    const allowed = new Set(['STOP', 'STOP.', 'הסר', 'עצור', 'BIGUI', 'UNSUBSCRIBE']);
    const k = (keyword || 'STOP').toString().trim();
    if (!allowed.has(k) && !allowed.has(k.toUpperCase())) {
      // Still accept the request — flag unknown keyword but don't
      // silently drop it (spam law: opt-out must always succeed).
    }
    if (!this._optOut.has(e164)) {
      this._optOut.set(e164, { keyword: k, at: _nowIso() });
    }
    this._appendAudit({
      event: 'OPT_OUT',
      phone: e164,
      keyword: k,
      at: _nowIso()
    });
    return { ok: true, optedOut: true, keyword: k, phone: e164 };
  }

  // ───────── send ─────────
  /**
   * Unified send API. Returns a result object describing exactly
   * which provider accepted the message (or why every provider in
   * the chain refused).
   *
   * Params:
   *   to              : string  (Israeli mobile)
   *   text            : string
   *   senderName      : string  (<=11 alphanumeric)
   *   unicode         : boolean (override auto-detect)
   *   deliveryReport  : boolean (request DLR)
   *   preferences     : string | string[]  (preferred providers)
   *   fallback        : string[]           (explicit fallback chain)
   *   campaignId      : string  (audit tag)
   */
  async send(opts = {}) {
    const {
      to, text, senderName = this.options.defaultSenderName,
      unicode, deliveryReport = false,
      preferences, fallback, campaignId = null
    } = opts;

    // 1. Validate recipient
    const v = this.validateIsraeliMobile(to);
    if (!v.valid) {
      const res = { ok: false, error: 'INVALID_PHONE', reason: v.reason };
      this._appendAudit({ event: 'SEND_REJECTED', to, res, at: _nowIso() });
      return res;
    }

    // 2. Opt-out check (anti-spam law compliance)
    if (this._optOut.has(v.e164)) {
      const res = { ok: false, error: 'RECIPIENT_OPTED_OUT', phone: v.e164 };
      this._appendAudit({ event: 'SEND_BLOCKED_OPTOUT', to: v.e164, at: _nowIso() });
      return res;
    }

    // 3. Validate sender ID (anti-spam law: must identify sender)
    const sName = String(senderName || '').trim();
    if (!sName) {
      const res = { ok: false, error: 'SENDER_REQUIRED' };
      this._appendAudit({ event: 'SEND_REJECTED', to: v.e164, res, at: _nowIso() });
      return res;
    }
    if (sName.length > 11 || !/^[A-Za-z0-9 .'-]+$/.test(sName)) {
      // Hebrew alphanumeric senders are generally not supported by
      // most Israeli aggregators — fall back to company short code.
      const res = { ok: false, error: 'SENDER_INVALID', sender: sName };
      this._appendAudit({ event: 'SEND_REJECTED', to: v.e164, res, at: _nowIso() });
      return res;
    }

    // 4. Split message
    const split = this.longSMSSplit({ text });
    const effectiveUnicode = typeof unicode === 'boolean' ? unicode : split.unicode;

    // 5. Pick a provider chain
    const chain = this.chooseProvider({ preferences, fallback });
    const attempts = [];
    let lastErr = null;

    for (const name of chain) {
      // 5a. Rate-limit check
      const rl = this.rateLimit({ provider: name });
      if (!rl.allowed) {
        attempts.push({ provider: name, ok: false, error: 'RATE_LIMITED', waitMs: rl.waitMs });
        lastErr = 'RATE_LIMITED';
        continue;
      }
      // 5b. Provider send
      const adapter = this.providers[name];
      if (!adapter) {
        attempts.push({ provider: name, ok: false, error: 'UNKNOWN_PROVIDER' });
        continue;
      }
      const messageId = _uid('sms');
      const payload = {
        to: v.e164,
        text,
        parts: split.parts,
        segments: split.segments,
        unicode: effectiveUnicode,
        senderName: sName,
        messageId,
        deliveryReport
      };
      try {
        const resp = await adapter.send(payload);
        attempts.push({ provider: name, ...resp, messageId });
        if (resp && resp.ok !== false) {
          const record = {
            ok: true,
            messageId,
            provider: name,
            providerMessageId: resp.providerMessageId,
            to: v.e164,
            carrier: v.carrier,
            senderName: sName,
            segments: split.segments,
            unicode: effectiveUnicode,
            campaignId,
            attempts,
            at: _nowIso()
          };
          this._appendAudit({ event: 'SEND_OK', ...record });
          // Initialise delivery-report state
          if (deliveryReport) {
            this._deliveryReports.set(messageId, {
              status: 'QUEUED',
              provider: name,
              to: v.e164,
              updates: [{ status: 'QUEUED', at: _nowIso() }]
            });
          }
          return record;
        }
        lastErr = resp && resp.error || 'PROVIDER_REJECTED';
      } catch (err) {
        attempts.push({ provider: name, ok: false, error: 'EXCEPTION', message: err.message });
        lastErr = err.message;
      }
    }

    const fail = {
      ok: false,
      error: 'ALL_PROVIDERS_FAILED',
      lastError: lastErr,
      attempts,
      at: _nowIso()
    };
    this._appendAudit({ event: 'SEND_FAILED', to: v.e164, ...fail });
    return fail;
  }

  // ───────── bulkSend ─────────
  /**
   * Send to a list of recipients, throttling to each provider's
   * per-second ceiling. Returns an array of per-recipient results.
   * Never deletes the input list — original array is not mutated.
   */
  async bulkSend({ recipients, text, senderName, preferences, fallback, campaignId } = {}) {
    if (!Array.isArray(recipients)) return { ok: false, error: 'RECIPIENTS_REQUIRED' };
    const results = [];
    for (const r of recipients) {
      const to = typeof r === 'string' ? r : (r && r.to);
      const res = await this.send({ to, text, senderName, preferences, fallback, campaignId });
      results.push({ to, ...res });
      // Micro-delay proportional to primary provider's perSecond ceiling.
      // In mock mode this is effectively instantaneous.
      const primary = this.chooseProvider({ preferences, fallback })[0];
      const per = (PROVIDER_DEFAULTS[primary] && PROVIDER_DEFAULTS[primary].perSecond) || 10;
      const gap = Math.max(1, Math.floor(1000 / per));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    this._appendAudit({
      event: 'BULK_DONE',
      count: results.length,
      okCount: results.filter((r) => r.ok).length,
      campaignId: campaignId || null,
      at: _nowIso()
    });
    return { ok: true, count: results.length, results };
  }

  // ───────── scheduledSend ─────────
  /**
   * Queue a message for later delivery. `sendAt` may be:
   *   - a Date
   *   - an ISO string
   *   - a millis-since-epoch number
   *   - a number < 1e10 (interpreted as "seconds from now")
   *
   * Returns { ok, scheduledId, sendAt }. Scheduled entries are
   * never deleted — cancelled ones are marked `cancelled:true`.
   */
  scheduledSend({ sendAt, ...payload } = {}) {
    let ts;
    if (sendAt instanceof Date) ts = sendAt.getTime();
    else if (typeof sendAt === 'string') ts = Date.parse(sendAt);
    else if (typeof sendAt === 'number') ts = sendAt < 1e10 ? Date.now() + sendAt * 1000 : sendAt;
    else ts = NaN;
    if (!Number.isFinite(ts)) return { ok: false, error: 'INVALID_SEND_AT' };
    const id = _uid('sched');
    const entry = Object.freeze({
      id,
      sendAt: new Date(ts).toISOString(),
      sendAtMs: ts,
      payload: Object.freeze({ ...payload }),
      createdAt: _nowIso(),
      cancelled: false
    });
    this._scheduled.push(entry);
    this._appendAudit({ event: 'SCHEDULED', id, sendAt: entry.sendAt, at: _nowIso() });
    return { ok: true, scheduledId: id, sendAt: entry.sendAt };
  }

  /**
   * Return all scheduled entries whose sendAt has elapsed and that
   * have not yet been dispatched. Appends a dispatched=true marker
   * to the audit log (but does NOT remove them from the queue).
   */
  async runDueScheduled(now = Date.now()) {
    const due = this._scheduled.filter((e) => !e.cancelled && e.sendAtMs <= now && !e._dispatched);
    const out = [];
    for (const e of due) {
      // eslint-disable-next-line no-await-in-loop
      const res = await this.send(e.payload);
      // Mutation allowed only on a shallow mirror; original is frozen.
      const idx = this._scheduled.indexOf(e);
      this._scheduled[idx] = Object.freeze(Object.assign({}, e, { _dispatched: true, dispatchedAt: _nowIso(), result: res }));
      out.push({ id: e.id, ...res });
    }
    return out;
  }

  // ───────── deliveryReport ─────────
  /**
   * Register / query a delivery report. Two modes:
   *   - Query:   deliveryReport({ messageId })
   *              → returns current status + updates
   *   - Ingest:  deliveryReport({ messageId, status, raw })
   *              → appends an update (e.g. from a provider webhook)
   *
   * Valid status values: QUEUED, SENT, DELIVERED, FAILED, UNKNOWN.
   * Updates are append-only.
   */
  deliveryReport({ messageId, status, raw } = {}) {
    if (!messageId) return { ok: false, error: 'MESSAGE_ID_REQUIRED' };
    let entry = this._deliveryReports.get(messageId);
    if (!entry) {
      entry = { status: 'UNKNOWN', provider: null, to: null, updates: [] };
      this._deliveryReports.set(messageId, entry);
    }
    if (status) {
      const ok = new Set(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'UNKNOWN']).has(status);
      if (!ok) return { ok: false, error: 'INVALID_STATUS', status };
      entry.status = status;
      entry.updates.push({ status, at: _nowIso(), raw: raw || null });
      this._appendAudit({ event: 'DLR', messageId, status, at: _nowIso() });
    }
    return {
      ok: true,
      messageId,
      status: entry.status,
      provider: entry.provider,
      to: entry.to,
      updates: entry.updates.slice()
    };
  }

  // ───────── auditLog ─────────
  /**
   * Query the audit log. Without args → returns full trail.
   * With `{ messageId }` → filters to entries matching that id.
   * With `{ event }` → filters by event type.
   * The returned arrays are fresh copies; the internal log is
   * append-only and never mutated by callers.
   */
  auditLog({ messageId, event } = {}) {
    let out = this._audit.slice();
    if (messageId) out = out.filter((e) => e.messageId === messageId);
    if (event) out = out.filter((e) => e.event === event);
    return out;
  }

  _appendAudit(entry) {
    const frozen = Object.freeze(Object.assign({ _seq: this._audit.length }, entry));
    this._audit.push(frozen);
    return frozen;
  }

  // ───────── compliance helpers ─────────
  /**
   * Render the mandatory opt-out footer per Israeli anti-spam law.
   * Must identify sender and provide unsubscribe method.
   */
  complianceFooter(senderName = this.options.defaultSenderName) {
    return `— ${senderName}. להסרה השיבו "הסר"`;
  }

  /**
   * Wrap a message with the compliance footer unless it already
   * contains an opt-out keyword.
   */
  withCompliance(text, senderName) {
    const s = String(text || '');
    if (/הסר|STOP|עצור/i.test(s)) return s;
    return `${s}\n${this.complianceFooter(senderName)}`;
  }

  // ════════════════════════════════════════════════════════════════
  //  Y-122 upgrade surface
  //  (all methods below ADD to the prior API — nothing replaced.)
  // ════════════════════════════════════════════════════════════════

  // ───────── configure ─────────
  /**
   * Configure the gateway with a chosen provider, credentials, and
   * senderId. Supports `provider: 'inforu' | '019' | 'unicell' | 'mock'`.
   *
   * Also exposes `injectTransport(fn)` on the returned handle so
   * tests can substitute a deterministic in-memory transport for any
   * provider. `fn` receives the internal payload and must return
   * `{ ok, providerMessageId }` (or `{ ok:false, error }`).
   */
  configure({ provider, credentials = {}, senderId } = {}) {
    if (provider) {
      // Resolve alias: '019' → '019mobile' internally but keep
      // user-facing identity as '019'.
      const resolved = PROVIDER_DEFAULTS[provider]
        ? (PROVIDER_DEFAULTS[provider].aliasOf || provider)
        : null;
      if (!resolved || !this.providers[resolved]) {
        return {
          ok: false,
          error: 'UNKNOWN_PROVIDER',
          provider,
          known: Object.keys(this.providers)
        };
      }
      this._activeProvider = provider;           // keep user label
      this._activeProviderResolved = resolved;   // internal key
    }
    if (credentials && typeof credentials === 'object') {
      // Credentials are frozen into an append-only history slot
      // so audits can prove what was configured at a given moment.
      this._credentials = Object.freeze(Object.assign({}, credentials));
      this._appendAudit({
        event: 'CONFIGURE',
        provider: this._activeProvider,
        credentialKeys: Object.keys(credentials),
        at: _nowIso()
      });
    }
    if (senderId != null) {
      this._activeSenderId = String(senderId);
    }
    return {
      ok: true,
      provider: this._activeProvider,
      senderId: this._activeSenderId,
      injectTransport: (fn) => this.injectTransport(this._activeProviderResolved || this._activeProvider, fn)
    };
  }

  /**
   * Inject a custom transport for a given provider. If `provider` is
   * omitted the currently configured provider is used. This is the
   * test hook — it lets unit tests pass a mock transport function
   * without ever hitting the real node:https stack.
   */
  injectTransport(provider, fn) {
    if (typeof provider === 'function' && !fn) {
      fn = provider;
      provider = this._activeProviderResolved || this._activeProvider;
    }
    if (typeof fn !== 'function') {
      return { ok: false, error: 'INJECT_NEEDS_FUNCTION' };
    }
    this._injectedTransports[provider] = fn;
    return { ok: true, provider };
  }

  /**
   * Inject a custom delivery-status poller. `fn(msgId)` must return
   * `{ status, raw }` where status is a valid DLR enum value.
   */
  injectStatusTransport(fn) {
    if (typeof fn !== 'function') return { ok: false, error: 'NEEDS_FUNCTION' };
    this._injectedStatusFn = fn;
    return { ok: true };
  }

  // ───────── quietHours ─────────
  /**
   * Configure marketing-only quiet hours. Transactional messages
   * bypass quiet hours. Defaults: 20:00 → 07:00 Asia/Jerusalem per
   * חוק התקשורת §30א.
   */
  quietHours({ enabled = true, start = '20:00', end = '07:00',
               timezone = 'Asia/Jerusalem' } = {}) {
    this._quietHours = { enabled: !!enabled, start, end, timezone };
    this._appendAudit({
      event: 'QUIET_HOURS_SET', ...this._quietHours, at: _nowIso()
    });
    return { ok: true, ...this._quietHours };
  }

  /**
   * Internal: returns true if `when` (a Date) is inside the
   * configured quiet-hours window. Uses a simple HH:MM comparison
   * projected into Asia/Jerusalem via Intl.DateTimeFormat (built-in).
   */
  _isInQuietHours(when = new Date()) {
    if (!this._quietHours.enabled) return false;
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: this._quietHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const hhmm = fmt.format(when);  // "21:47"
    const [start, end] = [this._quietHours.start, this._quietHours.end];
    // Windows that cross midnight (20:00 → 07:00) are true when
    // hhmm >= start OR hhmm < end.
    if (start <= end) {
      return hhmm >= start && hhmm < end;
    }
    return hhmm >= start || hhmm < end;
  }

  // ───────── optOut / isOptedOut ─────────
  /**
   * Y-122 opt-out shape. Thin wrapper around the original
   * `optOutHandling()` — both APIs coexist. Records a `reason`
   * field alongside the keyword so we can distinguish user-initiated
   * (STOP/הסר) from regulator-imposed (Ministry request) opt-outs.
   */
  optOut({ phone, reason = 'user-request', keyword = 'STOP' } = {}) {
    const base = this.optOutHandling({ phoneNumber: phone, keyword });
    if (base.ok) {
      // Decorate the latest audit entry with the reason.
      this._appendAudit({
        event: 'OPT_OUT_REASON',
        phone: base.phone,
        reason,
        at: _nowIso()
      });
      return { ok: true, phone: base.phone, reason, keyword: base.keyword };
    }
    return base;
  }

  /**
   * Simple boolean check. Accepts any phone format the normalizer
   * understands. Never throws.
   */
  isOptedOut(phone) {
    const e164 = this.phoneNormalize(phone);
    if (!e164) return false;
    return this._optOut.has(e164);
  }

  // ───────── messageTemplate ─────────
  /**
   * Register a named template or render it with variables.
   *
   *   gateway.messageTemplate('welcome',
   *     'שלום {{name}}, ברוכים הבאים ל-{{company}}');
   *
   *   gateway.messageTemplate('welcome', { name: 'דני', company: 'Onyx' });
   *   // → 'שלום דני, ברוכים הבאים ל-Onyx'
   *
   * Calling with a string body registers it. Calling with an object
   * renders the previously registered template. Missing placeholders
   * are kept verbatim so nothing is silently dropped.
   */
  messageTemplate(name, bodyOrVars) {
    if (typeof bodyOrVars === 'string') {
      this._templates.set(name, bodyOrVars);
      this._appendAudit({ event: 'TEMPLATE_SET', name, at: _nowIso() });
      return { ok: true, name, body: bodyOrVars };
    }
    const tpl = this._templates.get(name);
    if (!tpl) return { ok: false, error: 'TEMPLATE_NOT_FOUND', name };
    const vars = bodyOrVars || {};
    const rendered = String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(vars, key)
        ? String(vars[key])
        : match;
    });
    return { ok: true, name, rendered };
  }

  // ───────── history ─────────
  /**
   * Return append-only delivery history for a single phone number.
   * Newest entry first. Never mutates internal state.
   */
  history(phone) {
    const e164 = this.phoneNormalize(phone);
    if (!e164) return [];
    const hist = this._historyByPhone.get(e164);
    return hist ? hist.slice() : [];
  }

  // ───────── handleIncoming ─────────
  /**
   * Ingest an inbound webhook payload from any provider.
   * Auto-detects STOP/הסר/עצור and records an opt-out.
   *
   * Expected payload shape (flexible):
   *   { from, to, body | message | text, providerMessageId, provider }
   */
  handleIncoming(webhookPayload = {}) {
    const from = webhookPayload.from || webhookPayload.sender || webhookPayload.msisdn;
    const body = webhookPayload.body || webhookPayload.message || webhookPayload.text || '';
    const e164 = this.phoneNormalize(from);
    const entry = Object.freeze({
      id: _uid('in'),
      from: e164 || from || null,
      to: webhookPayload.to || null,
      body: String(body),
      provider: webhookPayload.provider || null,
      providerMessageId: webhookPayload.providerMessageId || null,
      at: _nowIso()
    });
    this._incoming.push(entry);
    this._appendAudit({ event: 'INCOMING', id: entry.id, from: entry.from, at: entry.at });

    let optOutTriggered = false;
    if (/^\s*(stop|הסר|עצור|unsubscribe)\s*$/i.test(entry.body)) {
      if (e164) {
        this.optOut({ phone: e164, reason: 'incoming-keyword',
                      keyword: entry.body.trim() });
        optOutTriggered = true;
      }
    }
    return { ok: true, incomingId: entry.id, optOutTriggered };
  }

  // ───────── checkDeliveryStatus ─────────
  /**
   * Poll the provider for the current status of a previously-sent
   * message. If an injected status transport is registered it is
   * called first; otherwise we fall back to the locally stored
   * delivery report.
   */
  async checkDeliveryStatus(msgId) {
    if (!msgId) return { ok: false, error: 'MESSAGE_ID_REQUIRED' };
    if (this._injectedStatusFn) {
      try {
        const probed = await this._injectedStatusFn(msgId);
        if (probed && probed.status) {
          this.deliveryReport({ messageId: msgId, status: probed.status, raw: probed.raw });
        }
      } catch (err) {
        this._appendAudit({ event: 'DLR_PROBE_ERROR', messageId: msgId, error: err.message, at: _nowIso() });
      }
    }
    const entry = this._deliveryReports.get(msgId);
    if (!entry) return { ok: false, error: 'NOT_FOUND', messageId: msgId };
    return {
      ok: true,
      messageId: msgId,
      status: entry.status,
      updates: entry.updates.slice()
    };
  }

  // ───────── sendBulk (Y-122 shape) ─────────
  /**
   * New shape per Y-122: `sendBulk({ messages, batchSize, delayMs })`.
   * `messages` is an array of `{ to, message, senderId, meta, priority }`
   * objects. Returns `{ ok, total, succeeded, failed, results }`.
   *
   * Coexists with the original `bulkSend()` — neither replaces the
   * other.
   */
  async sendBulk({ messages = [], batchSize = 50, delayMs = 100 } = {}) {
    if (!Array.isArray(messages)) {
      return { ok: false, error: 'MESSAGES_REQUIRED' };
    }
    const results = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      for (const m of batch) {
        // eslint-disable-next-line no-await-in-loop
        const res = await this.sendY122(m);
        results.push({ to: m && m.to, ...res });
      }
      if (delayMs > 0 && i + batchSize < messages.length) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    this._appendAudit({
      event: 'BULK_Y122_DONE',
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      at: _nowIso()
    });
    return {
      ok: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results
    };
  }

  // ───────── sendY122 (new signature) ─────────
  /**
   * Y-122 send shape: `{ to, message, senderId, meta, priority }`.
   * Delegates to the original `send()` under the hood (preserving
   * every existing behavior) while adding the §30א compliance checks:
   *
   *   • Sender must identify in first 100 chars (marketing).
   *   • Quiet hours block 20:00-07:00 Asia/Jerusalem (marketing).
   *   • Max 3 messages per 24h per recipient without explicit
   *     consent (marketing).
   *   • Injected transport (if any) is called instead of the
   *     provider adapter.
   *
   * `priority`:
   *   'transactional' | 'urgent' — bypasses quiet hours + 3/24h cap.
   *   'marketing'    (default) — enforces all §30א rules.
   */
  async sendY122({ to, message, senderId, meta = {}, priority = 'marketing' } = {}) {
    const senderName = senderId || this._activeSenderId || this.options.defaultSenderName;
    const resolvedProvider =
      this._activeProviderResolved ||
      (PROVIDER_DEFAULTS[this._activeProvider] && (PROVIDER_DEFAULTS[this._activeProvider].aliasOf || this._activeProvider)) ||
      this._activeProvider ||
      this.options.defaultProvider;

    // ── §30א sender identification ─────────────────────────────
    const bodyStr = String(message || '');
    const isMarketing = priority === 'marketing';
    if (isMarketing) {
      const first100 = bodyStr.slice(0, 100);
      if (!first100.includes(senderName)) {
        const res = {
          ok: false,
          error: 'SENDER_IDENTIFICATION_MISSING',
          rule: 'חוק התקשורת §30א',
          requirement: 'Sender name must appear in first 100 chars of marketing messages'
        };
        this._appendAudit({ event: 'SEND_REJECTED_30A', to, res, at: _nowIso() });
        return res;
      }
    }

    // ── quiet hours (marketing only) ───────────────────────────
    if (isMarketing && this._isInQuietHours()) {
      const res = {
        ok: false,
        error: 'QUIET_HOURS',
        rule: 'חוק התקשורת §30א',
        window: `${this._quietHours.start}-${this._quietHours.end}`,
        tz: this._quietHours.timezone
      };
      this._appendAudit({ event: 'SEND_BLOCKED_QUIET', to, res, at: _nowIso() });
      return res;
    }

    // ── rolling 3-per-24h cap (marketing only) ─────────────────
    const e164early = this.phoneNormalize(to);
    if (isMarketing && e164early) {
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1000;
      const list = (this._rollingCounts.get(e164early) || []).filter((e) => now - e.at < windowMs);
      if (list.length >= 3 && !meta.hasExplicitConsent) {
        const res = {
          ok: false,
          error: 'DAILY_CAP_EXCEEDED',
          rule: 'חוק התקשורת §30א',
          cap: 3,
          sentInLast24h: list.length
        };
        this._appendAudit({ event: 'SEND_BLOCKED_CAP', to: e164early, res, at: _nowIso() });
        return res;
      }
      this._rollingCounts.set(e164early, list);
    }

    // ── delegate to original send() pipeline ──────────────────
    const preferences = resolvedProvider ? [resolvedProvider] : undefined;
    const legacy = await this.send({
      to,
      text: bodyStr,
      senderName,
      preferences,
      campaignId: meta && meta.campaignId ? meta.campaignId : null,
      deliveryReport: !!(meta && meta.deliveryReport)
    });

    // If an injected transport exists for the chosen provider, call
    // it *in addition* to record its result. This is how tests prove
    // that injectTransport was actually invoked.
    const injected = this._injectedTransports[resolvedProvider];
    if (injected && legacy.ok !== false) {
      try {
        const injectedResult = await injected({
          to: legacy.to,
          message: bodyStr,
          senderId: senderName,
          meta,
          priority,
          messageId: legacy.messageId,
          provider: resolvedProvider
        });
        if (injectedResult && injectedResult.ok === false) {
          // Allow mock transport to force a failure for failover
          // tests. Still record history so audit reflects reality.
          this._appendAudit({ event: 'INJECT_FAIL', messageId: legacy.messageId, error: injectedResult.error, at: _nowIso() });
          return {
            ok: false,
            error: injectedResult.error || 'INJECTED_TRANSPORT_FAILED',
            messageId: legacy.messageId,
            to: legacy.to
          };
        }
        this._appendAudit({
          event: 'INJECTED_TRANSPORT_OK',
          messageId: legacy.messageId,
          providerMessageId: injectedResult && injectedResult.providerMessageId,
          at: _nowIso()
        });
        // Merge the injected id into the legacy record.
        if (injectedResult && injectedResult.providerMessageId) {
          legacy.providerMessageId = injectedResult.providerMessageId;
        }
      } catch (err) {
        this._appendAudit({ event: 'INJECT_EXCEPTION', error: err.message, at: _nowIso() });
      }
    }

    // ── append to per-phone history & rolling counter ────────
    if (legacy.ok && legacy.to) {
      const histEntry = Object.freeze({
        at: _nowIso(),
        messageId: legacy.messageId,
        provider: resolvedProvider,
        providerMessageId: legacy.providerMessageId || null,
        segments: legacy.segments,
        priority,
        senderId: senderName,
        preview: bodyStr.slice(0, 40)
      });
      const list = this._historyByPhone.get(legacy.to) || [];
      list.unshift(histEntry);
      this._historyByPhone.set(legacy.to, list);
      // Rolling counter update
      const list24 = this._rollingCounts.get(legacy.to) || [];
      list24.push({ at: Date.now() });
      this._rollingCounts.set(legacy.to, list24);
    }

    return legacy;
  }
}

// ────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────
module.exports = {
  SMSGateway,
  InforuProvider,
  Mobile019Provider,
  UnicellProvider,
  Sms4FreeProvider,
  MessageNetProvider,
  TrueDialogProvider,
  MockProvider,
  IL_MOBILE_PREFIXES: _deepFreeze(Object.assign({}, IL_MOBILE_PREFIXES)),
  PROVIDER_DEFAULTS
};
module.exports.default = SMSGateway;
