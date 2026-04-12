/* ============================================================================
 * Techno-Kol Uzi mega-ERP — Wire Transfer Approval Workflow Engine
 *                          מנוע אישורים להעברות בנקאיות — חתימות מרובות + בדיקות הונאה
 *
 * Agent Y-083 / Swarm Finance / Mega-ERP Kobi EL 2026
 * Complements Y-081 signatory workflow + Y-148 sanctions + Y-92 IBAN validator.
 * ----------------------------------------------------------------------------
 * Purpose / מטרה:
 *   Provide a dedicated, plan-only approval engine for outbound wire transfers
 *   with amount-tiered multi-signature routing, a SHA-256 chained signature
 *   ledger, a six-signal fraud check, out-of-band callback verification for
 *   high-value intents, and output in SWIFT MT103 / MASAV / CSV formats.
 *
 *   מודול זה הוא מנוע אישורים בלבד (PLAN-ONLY). הוא יוצר "מעטפות" לחתימה —
 *   עם ניתוב לפי סכום, חתימות דיגיטליות משורשרות ב-SHA-256, 6 בדיקות הונאה,
 *   אימות חוזר בטלפון/פנים-אל-פנים על סכומים גבוהים, ופלט בפורמט MT103 / מס"ב /
 *   CSV — ללא שום קריאה לבנק. בן אדם מורשה מבצע את ההעברה בפועל בערוץ הבנק.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CRITICAL SAFETY DISCLAIMER / הצהרת בטיחות קריטית
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   "Intent + approvals recorded. Execution must be performed by authorized
 *    human through bank channel."
 *
 *   "כוונת תשלום ואישורים נרשמים בלבד. הביצוע בפועל חייב להיעשות על-ידי
 *    מורשה חתימה דרך ערוץ הבנק."
 *
 *   Every wire envelope emitted by this module carries this disclaimer in
 *   both Hebrew and English. The module:
 *     • NEVER calls a bank API, webhook, or payment rail.
 *     • NEVER holds a credential to move money.
 *     • NEVER auto-executes on a schedule.
 *     • Only records intent, signatures, fraud checks and audit entries.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RULES (immutable) / חוקי ברזל:
 *   - לא מוחקים רק משדרגים ומגדלים   → append-only, never delete.
 *   - Zero external dependencies    → Node built-ins only (node:crypto).
 *   - Bilingual Hebrew/English      → every user-facing label.
 *   - RTL-safe                      → direction markers on Hebrew strings.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Public API / ממשק ציבורי:
 *   new WireApproval({ clock?, ibanValidator?, sanctionsHook?,
 *                      whitelist?, historicalAmounts?, businessHours?,
 *                      velocityLimit?, anomalySigma?, beneficiaryMinAgeDays? })
 *
 *   createWireRequest(args)         → wire envelope (intent)
 *   validateBeneficiary(ben)        → { valid, findings[], checks }
 *   routeForApproval(wireId)        → routing object (tier + required roles)
 *   addSignature(args)              → updated wire + chain hash
 *   fraudCheck(wireId)              → { score, signals[], flagged }
 *   callbackVerification(args)      → verified out-of-band record
 *   executeMarker(wireId, ref, d)   → marks human-executed through bank channel
 *   voidWire(wireId, reason)        → wire with voided status, record preserved
 *   auditTrail(wireId)              → append-only chain (immutable clone)
 *   dailyReport(period)             → bilingual aggregated report
 *   generateBankInstructions(...)   → { format, text, fields }
 *   listWires()                     → all wire envelopes (immutable clone)
 *   getWire(wireId)                 → one wire envelope (immutable clone)
 *
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual catalogs / קטלוגים דו-לשוניים
 * -------------------------------------------------------------------------- */

/** Wire envelope lifecycle states. */
const WIRE_STATUS = Object.freeze({
  draft:               'draft',
  awaiting_signatures: 'awaiting_signatures',
  partially_signed:    'partially_signed',
  fully_signed:        'fully_signed',
  awaiting_callback:   'awaiting_callback',
  ready_to_execute:    'ready_to_execute',
  executed_by_human:   'executed_by_human',
  voided:              'voided',
  fraud_hold:          'fraud_hold',
});

const WIRE_STATUS_LABELS = Object.freeze({
  draft:               { he: 'טיוטה',                         en: 'Draft' },
  awaiting_signatures: { he: 'ממתין לחתימות',                  en: 'Awaiting signatures' },
  partially_signed:    { he: 'נחתם חלקית',                    en: 'Partially signed' },
  fully_signed:        { he: 'נחתם במלואו',                   en: 'Fully signed' },
  awaiting_callback:   { he: 'ממתין לאימות חוזר',              en: 'Awaiting callback verification' },
  ready_to_execute:    { he: 'מוכן לביצוע ידני דרך הבנק',       en: 'Ready — human must execute via bank' },
  executed_by_human:   { he: 'בוצע ידנית על-ידי מורשה',         en: 'Human-executed via bank channel' },
  voided:              { he: 'בוטל (נשמר ברשומה)',              en: 'Voided (record preserved)' },
  fraud_hold:          { he: 'מוקפא לחשד הונאה',                en: 'Held for fraud review' },
});

/** Amount-tier approval routing. */
const APPROVAL_TIERS = Object.freeze({
  T1_SINGLE: {
    id: 'T1_SINGLE',
    amountRange: { minILS: 0, maxILS: 10_000 },
    signersRequired: 1,
    roles: ['finance_manager'],
    mustInclude: [],
    labels: { he: 'רמה 1 — חתימה יחידה', en: 'Tier 1 — single signature' },
    callbackRequired: false,
  },
  T2_DUAL: {
    id: 'T2_DUAL',
    amountRange: { minILS: 10_000, maxILS: 100_000 },
    signersRequired: 2,
    roles: ['finance_manager', 'controller'],
    mustInclude: ['finance_manager'],
    labels: { he: 'רמה 2 — חתימה זוגית', en: 'Tier 2 — dual signature' },
    callbackRequired: false,
  },
  T3_CFO: {
    id: 'T3_CFO',
    amountRange: { minILS: 100_000, maxILS: 1_000_000 },
    signersRequired: 2,
    roles: ['finance_manager', 'controller', 'cfo'],
    mustInclude: ['cfo'],
    labels: { he: 'רמה 3 — אישור סמנכ"ל כספים', en: 'Tier 3 — CFO approval' },
    callbackRequired: true,
  },
  T4_BOARD: {
    id: 'T4_BOARD',
    amountRange: { minILS: 1_000_000, maxILS: Number.POSITIVE_INFINITY },
    signersRequired: 3,
    roles: ['cfo', 'ceo', 'board_member'],
    mustInclude: ['cfo', 'ceo', 'board_member'],
    labels: { he: 'רמה 4 — סמנכ"ל כספים + מנכ"ל + דירקטוריון', en: 'Tier 4 — CFO + CEO + Board' },
    callbackRequired: true,
  },
});

/** Signature methods. */
const SIGNATURE_METHODS = Object.freeze({
  digital:          { id: 'digital',          he: 'חתימה דיגיטלית',       en: 'Digital signature' },
  '2fa':            { id: '2fa',              he: 'אימות דו-שלבי',         en: 'Two-factor authentication' },
  'hardware-token': { id: 'hardware-token',   he: 'טוקן חומרה',             en: 'Hardware token' },
  physical:         { id: 'physical',         he: 'חתימה פיזית (נייר)',     en: 'Physical (wet-ink) signature' },
});

/** Fraud signal identifiers. */
const FRAUD_SIGNALS = Object.freeze({
  velocity:       { id: 'velocity',       he: 'תדירות חריגה לאותו מוטב',    en: 'Velocity — unusual frequency to same beneficiary' },
  amount_anomaly: { id: 'amount_anomaly', he: 'אנומליית סכום (> 3σ)',        en: 'Amount anomaly (>3σ from historical)' },
  new_beneficiary:{ id: 'new_beneficiary',he: 'מוטב חדש (< 30 יום)',         en: 'New beneficiary (<30 days old)' },
  after_hours:    { id: 'after_hours',    he: 'מחוץ לשעות העבודה (09:00-17:00 ישראל)', en: 'After-hours (outside 09:00-17:00 Israel time)' },
  round_number:   { id: 'round_number',   he: 'סכום עגול חשוד (10k/100k/1M)', en: 'Round-number amount (10k/100k/1M multiple)' },
  duplicate_24h:  { id: 'duplicate_24h',  he: 'העברה כפולה תוך 24 שעות',     en: 'Duplicate within 24h (same amount+beneficiary)' },
});

/** Disclaimer plastered on every wire envelope. */
const DISCLAIMER_EN =
  'Intent + approvals recorded. Execution must be performed by authorized ' +
  'human through bank channel.';

const DISCLAIMER_HE =
  'כוונת תשלום ואישורים נרשמים בלבד. הביצוע בפועל חייב להיעשות על-ידי ' +
  'מורשה חתימה דרך ערוץ הבנק.';

/** RTL marker used around Hebrew fields in mixed layouts. */
const RTL_MARK = '\u200F';

/** ISO currencies this engine understands for approval thresholds. */
const SUPPORTED_CURRENCIES = Object.freeze(['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'JPY']);

/** FX rates for tier classification (indicative, caller can override). */
const DEFAULT_FX_TO_ILS = Object.freeze({
  ILS: 1,
  USD: 3.7,
  EUR: 4.0,
  GBP: 4.7,
  CHF: 4.2,
  JPY: 0.025,
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (pure, no deps beyond node:crypto)
 * -------------------------------------------------------------------------- */

/** Stable JSON serializer (sorted keys) — so hashes are deterministic. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/** SHA-256 hex of arbitrary value (via stableStringify). */
function sha256Hex(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

/** Deep-freeze clone for immutable returns. */
function frozenClone(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  const freezeRec = (o) => {
    if (o && typeof o === 'object') {
      Object.freeze(o);
      for (const k of Object.keys(o)) freezeRec(o[k]);
    }
  };
  freezeRec(clone);
  return clone;
}

/** Require a non-empty string and return trimmed. */
function requireStr(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`WireApproval: ${name} is required (non-empty string)`);
  }
  return value.trim();
}

/** Require a positive finite number. */
function requirePositiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`WireApproval: ${name} must be a positive finite number`);
  }
  return value;
}

/** Mean + stdev helpers for anomaly check. */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/* ----------------------------------------------------------------------------
 * 2. IBAN validator (Y-92 integration point — local fallback checksum)
 * -------------------------------------------------------------------------- */

/** ISO 13616 country → expected IBAN length. */
const IBAN_LENGTH_BY_COUNTRY = Object.freeze({
  IL: 23, // Israel
  GB: 22, // United Kingdom
  DE: 22, // Germany
  FR: 27, // France
  CH: 21, // Switzerland
  US: 0,  // No IBAN — fallback accepts account+routing
  AT: 20, AD: 24, BE: 16, BG: 22, HR: 21, CY: 28, CZ: 24, DK: 18,
  EE: 20, FI: 18, GR: 27, HU: 28, IS: 26, IE: 22, IT: 27, LV: 21,
  LT: 20, LU: 20, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24,
  SK: 24, SI: 19, ES: 24, SE: 24, TR: 26, SA: 24, AE: 23, QA: 29,
  KW: 30, BH: 22, JO: 30, LB: 28, PS: 29, EG: 29,
});

/**
 * Validate an IBAN using ISO 13616 mod-97 checksum.
 * Returns { valid, reason?, country?, length? }.
 */
function validateIBANChecksum(iban) {
  if (typeof iban !== 'string') return { valid: false, reason: 'not_string' };
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, reason: 'bad_format' };
  }
  const country = cleaned.slice(0, 2);
  const expectedLen = IBAN_LENGTH_BY_COUNTRY[country];
  if (expectedLen && cleaned.length !== expectedLen) {
    return { valid: false, reason: 'bad_length', country, length: cleaned.length };
  }
  // Mod-97 check:
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let remainder = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) remainder += ch;
    else remainder += (code - 55).toString(); // A=10..Z=35
  }
  // Process in chunks to avoid BigInt (keep pure ES).
  let mod = 0;
  for (const ch of remainder) {
    mod = (mod * 10 + Number(ch)) % 97;
  }
  if (mod !== 1) return { valid: false, reason: 'checksum', country };
  return { valid: true, country, length: cleaned.length };
}

/**
 * Validate SWIFT/BIC format: AAAA BB CC (DDD) — 8 or 11 chars.
 * Positions 1-4 bank, 5-6 country, 7-8 location, 9-11 branch.
 */
function validateSWIFTFormat(swift) {
  if (typeof swift !== 'string') return { valid: false, reason: 'not_string' };
  const cleaned = swift.replace(/\s+/g, '').toUpperCase();
  if (!(cleaned.length === 8 || cleaned.length === 11)) {
    return { valid: false, reason: 'bad_length', length: cleaned.length };
  }
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)) {
    return { valid: false, reason: 'bad_format' };
  }
  return { valid: true, bank: cleaned.slice(0, 4), country: cleaned.slice(4, 6), location: cleaned.slice(6, 8), branch: cleaned.slice(8) || null };
}

/* ----------------------------------------------------------------------------
 * 3. The class / המחלקה
 * -------------------------------------------------------------------------- */

class WireApproval {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.clock]              - epoch ms clock (injectable for tests)
   * @param {(iban:string) => {valid:boolean}} [opts.ibanValidator] - Y-92 integration point
   * @param {(ben:object) => {clean:boolean, reason?:string}} [opts.sanctionsHook] - Y-148 integration point
   * @param {Array<{iban?:string, swift?:string, name?:string}>} [opts.whitelist] - trusted beneficiaries
   * @param {Array<number>} [opts.historicalAmounts] - historical wire amounts (ILS) for sigma check
   * @param {{startHour:number, endHour:number}} [opts.businessHours] - Israel business window
   * @param {number} [opts.velocityLimit] - max wires to same beneficiary per 24h before flag
   * @param {number} [opts.anomalySigma]  - sigma multiple considered anomalous (default 3)
   * @param {number} [opts.beneficiaryMinAgeDays] - "new beneficiary" threshold (default 30)
   * @param {object} [opts.fxToILS] - FX table override
   */
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
    this._ibanValidator = typeof opts.ibanValidator === 'function' ? opts.ibanValidator : validateIBANChecksum;
    this._sanctionsHook = typeof opts.sanctionsHook === 'function' ? opts.sanctionsHook : null;
    this._whitelist = Array.isArray(opts.whitelist) ? opts.whitelist.slice() : [];
    this._historicalAmounts = Array.isArray(opts.historicalAmounts) ? opts.historicalAmounts.slice() : [];
    this._businessHours = opts.businessHours || { startHour: 9, endHour: 17 };
    this._velocityLimit = typeof opts.velocityLimit === 'number' ? opts.velocityLimit : 3;
    this._anomalySigma = typeof opts.anomalySigma === 'number' ? opts.anomalySigma : 3;
    this._beneficiaryMinAgeDays = typeof opts.beneficiaryMinAgeDays === 'number' ? opts.beneficiaryMinAgeDays : 30;
    this._fxToILS = Object.assign({}, DEFAULT_FX_TO_ILS, opts.fxToILS || {});

    // Append-only storage (never removed, only marked).
    this._wires = new Map();            // wireId → envelope
    this._auditByWire = new Map();      // wireId → [entries]
    this._beneficiaryFirstSeen = new Map(); // key → epoch ms
    this._seq = 0;
  }

  /* ─────────────────────────── internal ids & audit ────────────────────── */

  _nextId(prefix) {
    this._seq += 1;
    const rand = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${this._seq.toString().padStart(5, '0')}-${rand}`;
  }

  _audit(wireId, action, payload) {
    const list = this._auditByWire.get(wireId) || [];
    const prev = list.length ? list[list.length - 1].chainHash : null;
    const entry = {
      seq: list.length + 1,
      at: this._clock(),
      action,
      payload: payload || {},
      prevHash: prev,
    };
    entry.chainHash = sha256Hex({ wireId, seq: entry.seq, at: entry.at, action, payload: entry.payload, prevHash: prev });
    list.push(entry);
    this._auditByWire.set(wireId, list);
    return entry;
  }

  _beneficiaryKey(ben) {
    const parts = [
      (ben.iban || '').replace(/\s+/g, '').toUpperCase(),
      (ben.swift || '').replace(/\s+/g, '').toUpperCase(),
      (ben.name  || '').trim().toLowerCase(),
      (ben.bank  || '').trim().toLowerCase(),
      (ben.country || '').trim().toUpperCase(),
    ];
    return parts.join('|');
  }

  _toILS(amount, currency) {
    const rate = this._fxToILS[currency];
    if (!rate) throw new TypeError(`WireApproval: unsupported currency ${currency}`);
    return amount * rate;
  }

  _inWhitelist(ben) {
    const keyIban = (ben.iban || '').replace(/\s+/g, '').toUpperCase();
    const keySwift = (ben.swift || '').replace(/\s+/g, '').toUpperCase();
    const name = (ben.name || '').trim().toLowerCase();
    return this._whitelist.some((w) => {
      if (w.iban  && w.iban.replace(/\s+/g, '').toUpperCase() === keyIban && keyIban)  return true;
      if (w.swift && w.swift.replace(/\s+/g, '').toUpperCase() === keySwift && keySwift) return true;
      if (w.name  && w.name.trim().toLowerCase() === name && name) return true;
      return false;
    });
  }

  /* ───────────────────────────── createWireRequest ──────────────────────── */

  /**
   * Create a wire-transfer intent envelope. PLAN-ONLY.
   *
   * @param {object} args
   * @param {number} args.amount
   * @param {string} args.currency
   * @param {{name:string, iban?:string, swift?:string, bank:string, country:string}} args.beneficiary
   * @param {string} args.purpose
   * @param {string} [args.valueDate] - ISO date for requested value date
   * @param {{id:string, name:string, role?:string}} args.initiator
   * @returns {object} wire envelope
   */
  createWireRequest(args) {
    if (!args || typeof args !== 'object') {
      throw new TypeError('WireApproval.createWireRequest: args object required');
    }
    const amount = requirePositiveNumber(args.amount, 'amount');
    const currency = requireStr(args.currency, 'currency').toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new TypeError(`WireApproval: currency ${currency} not supported`);
    }
    const purpose = requireStr(args.purpose, 'purpose');
    const beneficiary = args.beneficiary;
    if (!beneficiary || typeof beneficiary !== 'object') {
      throw new TypeError('WireApproval: beneficiary object required');
    }
    requireStr(beneficiary.name,    'beneficiary.name');
    requireStr(beneficiary.bank,    'beneficiary.bank');
    requireStr(beneficiary.country, 'beneficiary.country');

    const initiator = args.initiator;
    if (!initiator || typeof initiator !== 'object') {
      throw new TypeError('WireApproval: initiator object required');
    }
    requireStr(initiator.id,   'initiator.id');
    requireStr(initiator.name, 'initiator.name');

    const now = this._clock();
    const wireId = this._nextId('WIRE');
    const amountILS = this._toILS(amount, currency);

    // Track first-seen for "new beneficiary" signal.
    const benKey = this._beneficiaryKey(beneficiary);
    if (!this._beneficiaryFirstSeen.has(benKey)) {
      this._beneficiaryFirstSeen.set(benKey, now);
    }

    const envelope = {
      wireId,
      status: WIRE_STATUS.draft,
      statusLabel: WIRE_STATUS_LABELS[WIRE_STATUS.draft],
      amount,
      currency,
      amountILS,
      beneficiary: {
        name:    beneficiary.name.trim(),
        iban:    (beneficiary.iban  || '').replace(/\s+/g, '').toUpperCase() || null,
        swift:   (beneficiary.swift || '').replace(/\s+/g, '').toUpperCase() || null,
        bank:    beneficiary.bank.trim(),
        country: beneficiary.country.trim().toUpperCase(),
      },
      purpose,
      valueDate: args.valueDate ? String(args.valueDate) : null,
      initiator: {
        id:   initiator.id.trim(),
        name: initiator.name.trim(),
        role: initiator.role ? String(initiator.role).trim() : null,
      },
      createdAt: now,
      signatures: [],           // each: {signerId, role, method, timestamp, prevHash, chainHash}
      chainHead: null,          // latest signature chain hash
      fraudSignals: [],
      fraudFlagged: false,
      callback: null,           // {verifiedBy, method, notes, at}
      execution: null,          // {ref, bankDate, by}
      void: null,               // {reason, at}
      routing: null,            // {tier, required, roles, mustInclude, callbackRequired}
      disclaimerEN: DISCLAIMER_EN,
      disclaimerHE: DISCLAIMER_HE,
      rtlMark: RTL_MARK,
      envelopeHash: null,
    };

    // Compute and freeze an immutable envelope fingerprint (used by audit).
    envelope.envelopeHash = sha256Hex({
      wireId,
      amount, currency, beneficiary: envelope.beneficiary,
      purpose, valueDate: envelope.valueDate, initiator: envelope.initiator,
      createdAt: now,
    });

    this._wires.set(wireId, envelope);
    this._audit(wireId, 'create', {
      actor: envelope.initiator,
      amount, currency, amountILS,
      envelopeHash: envelope.envelopeHash,
    });

    // Auto-move to awaiting_signatures once routed.
    envelope.status = WIRE_STATUS.awaiting_signatures;
    envelope.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.awaiting_signatures];
    envelope.routing = this.routeForApproval(wireId);

    return this.getWire(wireId);
  }

  /* ───────────────────────────── validateBeneficiary ────────────────────── */

  /**
   * Runs the 4 integration checks on a beneficiary:
   *   (1) IBAN checksum (Y-92),
   *   (2) SWIFT format,
   *   (3) sanctions hook (Y-148 integration point),
   *   (4) whitelist lookup.
   *
   * @param {{name:string, iban?:string, swift?:string, bank:string, country:string}} beneficiary
   * @returns {{valid:boolean, findings:Array<{code:string, he:string, en:string}>, checks:object}}
   */
  validateBeneficiary(beneficiary) {
    if (!beneficiary || typeof beneficiary !== 'object') {
      throw new TypeError('WireApproval.validateBeneficiary: beneficiary object required');
    }
    const findings = [];
    const checks = { iban: null, swift: null, sanctions: null, whitelist: null };

    // (1) IBAN — only if provided (US wires use routing number).
    if (beneficiary.iban) {
      const ibanResult = this._ibanValidator(beneficiary.iban);
      checks.iban = ibanResult;
      if (!ibanResult || ibanResult.valid !== true) {
        findings.push({
          code: 'iban_invalid',
          he: `${RTL_MARK}IBAN אינו תקין (${ibanResult && ibanResult.reason ? ibanResult.reason : 'unknown'})`,
          en: `IBAN invalid (${ibanResult && ibanResult.reason ? ibanResult.reason : 'unknown'})`,
        });
      }
    } else {
      checks.iban = { valid: null, reason: 'not_provided' };
    }

    // (2) SWIFT format — optional but required for cross-border.
    if (beneficiary.swift) {
      const swiftResult = validateSWIFTFormat(beneficiary.swift);
      checks.swift = swiftResult;
      if (!swiftResult.valid) {
        findings.push({
          code: 'swift_invalid',
          he: `${RTL_MARK}SWIFT/BIC אינו תקין`,
          en: 'SWIFT/BIC format invalid',
        });
      }
    } else {
      checks.swift = { valid: null, reason: 'not_provided' };
    }

    // (3) sanctions hook (Y-148 integration point).
    if (this._sanctionsHook) {
      try {
        const result = this._sanctionsHook(beneficiary);
        checks.sanctions = result;
        if (result && result.clean === false) {
          findings.push({
            code: 'sanctions_hit',
            he: `${RTL_MARK}חשד התאמה לרשימת סנקציות: ${result.reason || 'לא צוין'}`,
            en: `Sanctions hit: ${result.reason || 'unspecified'}`,
          });
        }
      } catch (err) {
        checks.sanctions = { clean: null, error: err.message };
        findings.push({
          code: 'sanctions_error',
          he: `${RTL_MARK}שגיאה בבדיקת סנקציות: ${err.message}`,
          en: `Sanctions check error: ${err.message}`,
        });
      }
    } else {
      checks.sanctions = { clean: null, reason: 'hook_not_configured' };
    }

    // (4) whitelist lookup.
    const isWhitelisted = this._inWhitelist(beneficiary);
    checks.whitelist = { whitelisted: isWhitelisted };
    if (!isWhitelisted) {
      findings.push({
        code: 'not_in_whitelist',
        he: `${RTL_MARK}מוטב אינו ברשימת המוטבים המאושרים — נדרש אימות חוזר`,
        en: 'Beneficiary not in approved whitelist — callback recommended',
      });
    }

    // valid == no hard failures on iban/swift/sanctions (whitelist miss is a warning).
    const hard = findings.filter((f) =>
      f.code === 'iban_invalid' || f.code === 'swift_invalid' || f.code === 'sanctions_hit' || f.code === 'sanctions_error'
    );

    return frozenClone({ valid: hard.length === 0, findings, checks });
  }

  /* ───────────────────────────── routeForApproval ───────────────────────── */

  /**
   * Amount-tier routing. Computes the required signer roles for the wire.
   * Reads amount-in-ILS to decide tier.
   *
   * @param {string} wireId
   * @returns {object} routing record
   */
  routeForApproval(wireId) {
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);
    const amountILS = wire.amountILS;

    let tier;
    if      (amountILS <  10_000)     tier = APPROVAL_TIERS.T1_SINGLE;
    else if (amountILS <  100_000)    tier = APPROVAL_TIERS.T2_DUAL;
    else if (amountILS <= 1_000_000)  tier = APPROVAL_TIERS.T3_CFO;
    else                              tier = APPROVAL_TIERS.T4_BOARD;

    const routing = {
      tier:            tier.id,
      labels:          tier.labels,
      signersRequired: tier.signersRequired,
      roles:           tier.roles.slice(),
      mustInclude:     tier.mustInclude.slice(),
      callbackRequired: tier.callbackRequired,
      amountILS,
    };

    wire.routing = routing;
    this._audit(wireId, 'route', routing);
    return frozenClone(routing);
  }

  /* ───────────────────────────── addSignature ──────────────────────────── */

  /**
   * Append a signature to the chain. Each new signature hashes in the
   * previous chain head, creating a tamper-evident sequence.
   *
   * @param {object} args
   * @param {string} args.wireId
   * @param {string} args.signerId
   * @param {string} [args.signerName]
   * @param {string} [args.role]
   * @param {string} args.method  - one of SIGNATURE_METHODS
   * @param {number} [args.timestamp] - epoch ms; defaults to clock()
   * @returns {object} updated wire envelope
   */
  addSignature(args) {
    if (!args || typeof args !== 'object') {
      throw new TypeError('WireApproval.addSignature: args required');
    }
    const wireId   = requireStr(args.wireId,   'wireId');
    const signerId = requireStr(args.signerId, 'signerId');
    const method   = requireStr(args.method,   'method');
    if (!SIGNATURE_METHODS[method]) {
      throw new TypeError(`WireApproval: unknown signature method ${method}`);
    }
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);

    if (wire.status === WIRE_STATUS.voided || wire.status === WIRE_STATUS.executed_by_human) {
      throw new Error(`WireApproval: cannot sign wire in status ${wire.status}`);
    }

    // SoD: initiator cannot sign their own wire.
    if (signerId === wire.initiator.id) {
      throw new Error('WireApproval: segregation-of-duties — initiator cannot sign');
    }

    // No duplicate signer.
    if (wire.signatures.some((s) => s.signerId === signerId)) {
      throw new Error('WireApproval: signer already signed this wire');
    }

    const role = args.role ? String(args.role).trim() : null;
    const ts = typeof args.timestamp === 'number' ? args.timestamp : this._clock();
    const prev = wire.chainHead;
    const sig = {
      seq:       wire.signatures.length + 1,
      signerId,
      signerName: args.signerName ? String(args.signerName).trim() : null,
      role,
      method,
      methodLabel: { he: SIGNATURE_METHODS[method].he, en: SIGNATURE_METHODS[method].en },
      timestamp: ts,
      prevHash:  prev,
    };
    sig.chainHash = sha256Hex({
      wireId, envelope: wire.envelopeHash, seq: sig.seq,
      signerId, role, method, timestamp: ts, prevHash: prev,
    });
    wire.signatures.push(sig);
    wire.chainHead = sig.chainHash;

    // Update status based on required signers.
    const required = wire.routing ? wire.routing.signersRequired : 1;
    if (wire.signatures.length >= required) {
      // check mustInclude roles
      const mustInclude = (wire.routing && wire.routing.mustInclude) || [];
      const haveAllMandatory = mustInclude.every((r) => wire.signatures.some((s) => s.role === r));
      if (haveAllMandatory) {
        wire.status = WIRE_STATUS.fully_signed;
        wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.fully_signed];

        if (wire.routing && wire.routing.callbackRequired && !wire.callback) {
          wire.status = WIRE_STATUS.awaiting_callback;
          wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.awaiting_callback];
        } else {
          wire.status = WIRE_STATUS.ready_to_execute;
          wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.ready_to_execute];
        }
      } else {
        wire.status = WIRE_STATUS.partially_signed;
        wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.partially_signed];
      }
    } else {
      wire.status = WIRE_STATUS.partially_signed;
      wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.partially_signed];
    }

    this._audit(wireId, 'signature', { signerId, role, method, chainHash: sig.chainHash });
    return this.getWire(wireId);
  }

  /* ───────────────────────────── fraudCheck ───────────────────────────── */

  /**
   * Six-signal fraud check. Does NOT block — only flags.
   * Flips wire status to fraud_hold when any signal fires, so that a
   * human reviewer must release it (via voidWire or another explicit flow).
   *
   * Signals:
   *  1. velocity        - > velocityLimit wires to same beneficiary in 24h
   *  2. amount_anomaly  - amountILS > (historicalMean + anomalySigma * historicalStdev)
   *  3. new_beneficiary - first-seen < beneficiaryMinAgeDays
   *  4. after_hours     - outside businessHours (Israel local time)
   *  5. round_number    - amount exactly 10k / 100k / 1M multiple
   *  6. duplicate_24h   - same amount + beneficiary within 24h
   *
   * @param {string} wireId
   * @returns {{score:number, signals:Array, flagged:boolean}}
   */
  fraudCheck(wireId) {
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);

    const signals = [];
    const now = this._clock();
    const DAY = 24 * 60 * 60 * 1000;
    const benKey = this._beneficiaryKey(wire.beneficiary);

    // Count prior wires for same beneficiary in past 24h (excluding this wire).
    const sameBeneficiary = Array.from(this._wires.values()).filter((w) =>
      w.wireId !== wireId && this._beneficiaryKey(w.beneficiary) === benKey
    );
    const recent24h = sameBeneficiary.filter((w) => (now - w.createdAt) <= DAY);

    // 1. velocity
    if (recent24h.length >= this._velocityLimit) {
      signals.push({
        id: FRAUD_SIGNALS.velocity.id,
        he: FRAUD_SIGNALS.velocity.he,
        en: FRAUD_SIGNALS.velocity.en,
        detail: { countIn24h: recent24h.length + 1, limit: this._velocityLimit },
      });
    }

    // 2. amount anomaly
    if (this._historicalAmounts.length >= 2) {
      const m = mean(this._historicalAmounts);
      const s = stdev(this._historicalAmounts);
      const threshold = m + this._anomalySigma * s;
      if (wire.amountILS > threshold && s > 0) {
        signals.push({
          id: FRAUD_SIGNALS.amount_anomaly.id,
          he: FRAUD_SIGNALS.amount_anomaly.he,
          en: FRAUD_SIGNALS.amount_anomaly.en,
          detail: { amountILS: wire.amountILS, mean: m, stdev: s, sigma: this._anomalySigma, threshold },
        });
      }
    }

    // 3. new beneficiary
    const firstSeen = this._beneficiaryFirstSeen.get(benKey) || now;
    const ageDays = (now - firstSeen) / DAY;
    if (ageDays < this._beneficiaryMinAgeDays) {
      signals.push({
        id: FRAUD_SIGNALS.new_beneficiary.id,
        he: FRAUD_SIGNALS.new_beneficiary.he,
        en: FRAUD_SIGNALS.new_beneficiary.en,
        detail: { ageDays: Number(ageDays.toFixed(2)), minDays: this._beneficiaryMinAgeDays },
      });
    }

    // 4. after hours (Israel time = UTC+2/+3; we approximate by UTC+2 for test determinism).
    const israelOffsetMs = 2 * 60 * 60 * 1000;
    const israelHour = new Date(wire.createdAt + israelOffsetMs).getUTCHours();
    if (israelHour < this._businessHours.startHour || israelHour >= this._businessHours.endHour) {
      signals.push({
        id: FRAUD_SIGNALS.after_hours.id,
        he: FRAUD_SIGNALS.after_hours.he,
        en: FRAUD_SIGNALS.after_hours.en,
        detail: { israelHour, window: this._businessHours },
      });
    }

    // 5. round numbers (exact multiples of 10k / 100k / 1M in the wire's own currency).
    const raw = wire.amount;
    if (raw > 0 && (raw % 1_000_000 === 0 || raw % 100_000 === 0 || raw % 10_000 === 0)) {
      signals.push({
        id: FRAUD_SIGNALS.round_number.id,
        he: FRAUD_SIGNALS.round_number.he,
        en: FRAUD_SIGNALS.round_number.en,
        detail: { amount: raw, currency: wire.currency },
      });
    }

    // 6. duplicate within 24h (same amount + beneficiary).
    const dupes = recent24h.filter((w) =>
      w.amount === wire.amount && w.currency === wire.currency
    );
    if (dupes.length > 0) {
      signals.push({
        id: FRAUD_SIGNALS.duplicate_24h.id,
        he: FRAUD_SIGNALS.duplicate_24h.he,
        en: FRAUD_SIGNALS.duplicate_24h.en,
        detail: { duplicates: dupes.map((w) => w.wireId) },
      });
    }

    const score = signals.length;
    const flagged = score > 0;

    wire.fraudSignals = signals.slice();
    wire.fraudFlagged = flagged;
    if (flagged && wire.status !== WIRE_STATUS.executed_by_human && wire.status !== WIRE_STATUS.voided) {
      wire.status = WIRE_STATUS.fraud_hold;
      wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.fraud_hold];
    }

    this._audit(wireId, 'fraud_check', { score, signals: signals.map((s) => s.id) });
    return frozenClone({ score, signals, flagged });
  }

  /* ───────────────────────────── callbackVerification ──────────────────── */

  /**
   * Record an out-of-band callback verification. Required when
   * routing.callbackRequired === true (tiers T3 and T4; i.e. > 100k ILS).
   *
   * @param {object} args
   * @param {string} args.wireId
   * @param {string} args.verifiedBy   - user id of verifier
   * @param {'phone'|'in-person'} args.method
   * @param {string} [args.notes]
   * @returns {object} updated wire envelope
   */
  callbackVerification(args) {
    if (!args || typeof args !== 'object') {
      throw new TypeError('WireApproval.callbackVerification: args required');
    }
    const wireId = requireStr(args.wireId, 'wireId');
    const verifiedBy = requireStr(args.verifiedBy, 'verifiedBy');
    const method = requireStr(args.method, 'method');
    if (!(method === 'phone' || method === 'in-person')) {
      throw new TypeError('WireApproval: callback method must be "phone" or "in-person"');
    }
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);
    if (wire.status === WIRE_STATUS.voided || wire.status === WIRE_STATUS.executed_by_human) {
      throw new Error(`WireApproval: cannot verify wire in status ${wire.status}`);
    }

    // If amount > 100k ILS, callback is mandatory; otherwise, allowed as extra precaution.
    const mandatory = wire.amountILS > 100_000;

    wire.callback = {
      verifiedBy,
      method,
      methodLabel: { he: method === 'phone' ? 'טלפון' : 'פנים-אל-פנים', en: method === 'phone' ? 'Phone' : 'In-person' },
      notes: args.notes ? String(args.notes) : '',
      at: this._clock(),
      mandatory,
    };

    // If wire was awaiting callback and is fully signed, promote to ready_to_execute.
    if (wire.status === WIRE_STATUS.awaiting_callback) {
      wire.status = WIRE_STATUS.ready_to_execute;
      wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.ready_to_execute];
    }

    this._audit(wireId, 'callback_verification', wire.callback);
    return this.getWire(wireId);
  }

  /* ───────────────────────────── executeMarker ────────────────────────── */

  /**
   * PLAN-ONLY enforcement: the caller asserts that a HUMAN executed the wire
   * through the bank channel (branch, portal, wet-ink). We record a marker
   * linking our envelope to the bank's execution reference. We NEVER touch
   * a bank API here — only update the status for reconciliation.
   *
   * @param {string} wireId
   * @param {string} bankExecutionRef  - ref from bank confirmation
   * @param {string} bankDate          - ISO date string
   * @param {{id:string, name:string}} [executedBy]
   * @returns {object} updated wire envelope
   */
  executeMarker(wireId, bankExecutionRef, bankDate, executedBy) {
    requireStr(wireId, 'wireId');
    const ref = requireStr(bankExecutionRef, 'bankExecutionRef');
    const d   = requireStr(bankDate, 'bankDate');
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);

    if (wire.status !== WIRE_STATUS.ready_to_execute) {
      throw new Error(`WireApproval: executeMarker requires status ready_to_execute (current: ${wire.status})`);
    }

    wire.execution = {
      ref,
      bankDate: d,
      by: executedBy ? { id: String(executedBy.id), name: String(executedBy.name) } : null,
      at: this._clock(),
      note: DISCLAIMER_EN,
      noteHe: DISCLAIMER_HE,
    };
    wire.status = WIRE_STATUS.executed_by_human;
    wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.executed_by_human];
    this._audit(wireId, 'execute_marker', wire.execution);
    return this.getWire(wireId);
  }

  /* ───────────────────────────── voidWire ─────────────────────────────── */

  /**
   * Void a wire envelope. Status flips, but the record (and its signatures,
   * fraud signals, audit trail) is preserved — per the immutable rule
   * "לא מוחקים רק משדרגים ומגדלים".
   *
   * @param {string} wireId
   * @param {string} reason
   * @returns {object} updated wire envelope
   */
  voidWire(wireId, reason) {
    requireStr(wireId, 'wireId');
    const why = requireStr(reason, 'reason');
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);

    // Preserve everything — we just record the void.
    wire.void = { reason: why, at: this._clock() };
    const prevStatus = wire.status;
    wire.status = WIRE_STATUS.voided;
    wire.statusLabel = WIRE_STATUS_LABELS[WIRE_STATUS.voided];
    this._audit(wireId, 'void', { reason: why, prevStatus });
    return this.getWire(wireId);
  }

  /* ───────────────────────────── auditTrail ───────────────────────────── */

  /**
   * Return the append-only audit chain for a wire, as a frozen clone.
   * Includes a verifyChain() helper result so callers can confirm integrity.
   */
  auditTrail(wireId) {
    const list = this._auditByWire.get(wireId);
    if (!list) return frozenClone({ wireId, entries: [], verified: true });
    // Re-verify the chain.
    let prev = null;
    let ok = true;
    for (const e of list) {
      if (e.prevHash !== prev) { ok = false; break; }
      const recalculated = sha256Hex({
        wireId, seq: e.seq, at: e.at, action: e.action, payload: e.payload, prevHash: prev,
      });
      if (recalculated !== e.chainHash) { ok = false; break; }
      prev = e.chainHash;
    }
    return frozenClone({ wireId, entries: list, verified: ok });
  }

  /* ───────────────────────────── dailyReport ──────────────────────────── */

  /**
   * Aggregate a bilingual operations report.
   *
   * @param {{fromMs:number, toMs:number}} [period] - defaults to today
   * @returns {object}
   */
  dailyReport(period) {
    const now = this._clock();
    const DAY = 24 * 60 * 60 * 1000;
    const fromMs = (period && period.fromMs) || (now - DAY);
    const toMs   = (period && period.toMs)   || now;

    const inPeriod = Array.from(this._wires.values()).filter(
      (w) => w.createdAt >= fromMs && w.createdAt <= toMs
    );

    const byTier = {};
    const byStatus = {};
    const byCurrency = {};
    let totalILS = 0;
    let fraudFlaggedCount = 0;

    for (const w of inPeriod) {
      const tier = (w.routing && w.routing.tier) || 'unrouted';
      byTier[tier] = (byTier[tier] || 0) + 1;
      byStatus[w.status] = (byStatus[w.status] || 0) + 1;
      byCurrency[w.currency] = (byCurrency[w.currency] || 0) + 1;
      totalILS += w.amountILS;
      if (w.fraudFlagged) fraudFlaggedCount += 1;
    }

    return frozenClone({
      period: { fromMs, toMs, fromISO: new Date(fromMs).toISOString(), toISO: new Date(toMs).toISOString() },
      count: inPeriod.length,
      totalILS,
      byTier,
      byStatus,
      byCurrency,
      fraudFlaggedCount,
      disclaimer: { he: DISCLAIMER_HE, en: DISCLAIMER_EN },
      headers: {
        he: {
          title: `${RTL_MARK}דו"ח יומי — בקשות העברה בנקאית`,
          tier: 'רמת אישור',
          status: 'סטטוס',
          total: 'סה"כ בשקלים',
          fraud: 'סומנו לבדיקת הונאה',
        },
        en: {
          title: 'Daily Report — Wire Transfer Requests',
          tier: 'Approval tier',
          status: 'Status',
          total: 'Total (ILS)',
          fraud: 'Flagged for fraud',
        },
      },
    });
  }

  /* ───────────────────────────── generateBankInstructions ───────────────── */

  /**
   * Generate output text ONLY. Never sends.
   *
   * @param {string} wireId
   * @param {{format:'SWIFT-MT103'|'MASAV'|'CSV'}} opts
   * @returns {{format:string, text:string, fields:object}}
   */
  generateBankInstructions(wireId, opts) {
    const wire = this._wires.get(wireId);
    if (!wire) throw new Error(`WireApproval: wire ${wireId} not found`);
    if (!opts || !opts.format) throw new TypeError('WireApproval: format required');
    const format = String(opts.format).toUpperCase();

    if (format === 'SWIFT-MT103') return this._genMT103(wire);
    if (format === 'MASAV')       return this._genMASAV(wire);
    if (format === 'CSV')         return this._genCSV(wire);
    throw new TypeError(`WireApproval: unsupported format ${opts.format}`);
  }

  _genMT103(wire) {
    const txnRef = wire.wireId.replace(/[^A-Z0-9]/gi, '').slice(0, 16).toUpperCase();
    const valueDate = (wire.valueDate || new Date(this._clock()).toISOString().slice(0, 10)).replace(/-/g, '').slice(2, 8);
    const amountField = wire.amount.toFixed(2).replace('.', ',');
    const lines = [
      '{1:F01TKOLILITAXXX0000000000}',
      '{2:I103' + (wire.beneficiary.swift || 'XXXXXXXXXXXX') + 'N}',
      '{4:',
      ':20:' + txnRef,
      ':23B:CRED',
      ':32A:' + valueDate + wire.currency + amountField,
      ':50K:/TECHNO-KOL-UZI-LTD',
      '  Techno-Kol Uzi Ltd',
      '  Netanya, Israel',
      ':59:' + (wire.beneficiary.iban ? '/' + wire.beneficiary.iban : ''),
      '  ' + wire.beneficiary.name,
      '  ' + wire.beneficiary.bank,
      '  ' + wire.beneficiary.country,
      ':70:' + wire.purpose.slice(0, 140),
      ':71A:SHA',
      '-}',
      '{5:{CHK:000000000000}}',
      '// PLAN-ONLY — ' + DISCLAIMER_EN,
      '// ' + DISCLAIMER_HE,
    ];
    return {
      format: 'SWIFT-MT103',
      text: lines.join('\n'),
      fields: {
        20: txnRef,
        '23B': 'CRED',
        '32A': valueDate + wire.currency + amountField,
        '50K': 'TECHNO-KOL-UZI-LTD',
        59:   wire.beneficiary.iban,
        70:   wire.purpose,
        '71A': 'SHA',
      },
      disclaimerEN: DISCLAIMER_EN,
      disclaimerHE: DISCLAIMER_HE,
    };
  }

  _genMASAV(wire) {
    // Israeli MASAV (מס"ב) record layout — simplified PLAN-ONLY fixture.
    const headerLine = [
      'K',                                                // record type
      '0000001',                                          // institute
      (wire.valueDate || new Date(this._clock()).toISOString().slice(0, 10)).replace(/-/g, ''),
      wire.beneficiary.name.padEnd(22).slice(0, 22),
      Math.round(wire.amount * 100).toString().padStart(13, '0'),
      wire.currency,
    ].join('|');
    return {
      format: 'MASAV',
      text: headerLine + '\n// PLAN-ONLY — ' + DISCLAIMER_EN + '\n// ' + DISCLAIMER_HE,
      fields: {
        recordType: 'K',
        date: (wire.valueDate || new Date(this._clock()).toISOString().slice(0, 10)),
        beneficiary: wire.beneficiary.name,
        amountAgorot: Math.round(wire.amount * 100),
        currency: wire.currency,
      },
      disclaimerEN: DISCLAIMER_EN,
      disclaimerHE: DISCLAIMER_HE,
    };
  }

  _genCSV(wire) {
    const header = 'wireId,amount,currency,beneficiary,iban,swift,bank,country,purpose,status,disclaimer';
    const row = [
      wire.wireId,
      wire.amount,
      wire.currency,
      JSON.stringify(wire.beneficiary.name),
      wire.beneficiary.iban || '',
      wire.beneficiary.swift || '',
      JSON.stringify(wire.beneficiary.bank),
      wire.beneficiary.country,
      JSON.stringify(wire.purpose),
      wire.status,
      JSON.stringify(DISCLAIMER_EN),
    ].join(',');
    return {
      format: 'CSV',
      text: header + '\n' + row,
      fields: { header: header.split(','), row },
      disclaimerEN: DISCLAIMER_EN,
      disclaimerHE: DISCLAIMER_HE,
    };
  }

  /* ───────────────────────────── read helpers ─────────────────────────── */

  listWires() {
    return frozenClone(Array.from(this._wires.values()));
  }

  getWire(wireId) {
    const wire = this._wires.get(wireId);
    if (!wire) return null;
    return frozenClone(wire);
  }
}

/* ----------------------------------------------------------------------------
 * 4. Exports
 * -------------------------------------------------------------------------- */

module.exports = {
  WireApproval,
  WIRE_STATUS,
  WIRE_STATUS_LABELS,
  APPROVAL_TIERS,
  SIGNATURE_METHODS,
  FRAUD_SIGNALS,
  DISCLAIMER_EN,
  DISCLAIMER_HE,
  DEFAULT_FX_TO_ILS,
  SUPPORTED_CURRENCIES,
  validateIBANChecksum,
  validateSWIFTFormat,
};
