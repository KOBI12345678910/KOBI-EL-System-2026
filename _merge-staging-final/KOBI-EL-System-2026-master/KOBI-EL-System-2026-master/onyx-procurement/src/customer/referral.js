/**
 * Customer Referral Program Manager  |  מנהל תוכניות הפניית לקוחות
 * =================================================================
 *
 * Agent Y-094  |  Techno-Kol Uzi mega-ERP 2026
 * Date: 2026-04-11
 *
 * A pure, deterministic, zero-dependency engine that powers multi-program
 * customer referral campaigns: code generation, link tracking, lead
 * capture, conversion validation, reward issuance, fraud detection,
 * leaderboards, ROI and Israeli-tax treatment.
 *
 * -----------------------------------------------------------------
 * HARD RULE — HOUSE LAW
 * -----------------------------------------------------------------
 *   לא מוחקים רק משדרגים ומגדלים
 *   "Never delete — only upgrade and grow."
 *
 *   - Programs, codes, referrals and rewards are APPEND-ONLY.
 *   - A "cancel" or "void" operation flips a status field and writes
 *     an audit row; the original record is kept verbatim, forever.
 *   - Re-defining a program id bumps its version. Earlier versions
 *     remain accessible via getProgramHistory(id).
 *   - Fraud blocks do not delete the referral — they mark it
 *     `status: 'blocked'` with a reason, preserving the trail for
 *     investigation and disputes.
 *
 * -----------------------------------------------------------------
 * ZERO DEPENDENCIES
 * -----------------------------------------------------------------
 * Pure JavaScript, CommonJS, no npm packages. Only node built-ins are
 * used and they are all optional — if `node:crypto` is unavailable
 * (e.g. browser bundling in tests) a deterministic fallback RNG
 * kicks in.
 *
 * -----------------------------------------------------------------
 * BILINGUAL
 * -----------------------------------------------------------------
 * Every program, label, status and share asset carries both `*_he`
 * (Hebrew, primary) and `*_en` (English) fields. Share messages for
 * WhatsApp / SMS / email are generated in both languages.
 *
 * -----------------------------------------------------------------
 * ISRAELI TAX NOTE (informational — see _qa-reports/AG-Y094)
 * -----------------------------------------------------------------
 * Customer referral rewards in Israel are classified under
 * §2(10) of the Income Tax Ordinance (פקודת מס הכנסה, סעיף 2(10)).
 * A one-off, non-recurring prize of low value given to a private
 * customer is typically NOT taxable. However:
 *
 *   - CASH rewards exceeding the annual tax-free gift threshold
 *     (₪210 per occasion / ₪2,480 cumulative per tax year as of
 *     the 2026 guidance) MAY be taxable as "income from any source"
 *     and require a 1099-like report (טופס 867 / 806).
 *   - BUSINESS customers (legal entities) must always be issued a
 *     tax invoice (חשבונית מס) — VAT applies to the full value.
 *   - IN-KIND rewards (gift cards, products, free service) are
 *     generally reportable at their market value.
 *
 * `taxTreatment()` returns a conservative classification with the
 * Hebrew explanation, a tax-withholding suggestion, and the
 * reporting form code — callers must still run their accountant
 * over the output.
 *
 * -----------------------------------------------------------------
 * PUBLIC API
 * -----------------------------------------------------------------
 *
 *   const { ReferralProgram } = require('./customer/referral');
 *   const rp = new ReferralProgram({ clock, randomId });
 *
 *   rp.createProgram({ id, name_he, name_en,
 *                       rewardReferrer:{type,value},
 *                       rewardReferred:{type,value},
 *                       eligibilityRules, duration,
 *                       maxRewards, fraudRules })      → Program
 *
 *   rp.generateReferralCode({ customerId, programId }) → { code, ... }
 *   rp.trackReferralLink(code, medium)                 → click record
 *   rp.captureReferred({ code, leadInfo })             → Referral
 *   rp.validateConversion({ leadId, conditions })      → ConvResult
 *   rp.issueReward({ programId, side, customerId, value, method })
 *                                                      → Reward
 *   rp.fraudDetection({ referral, rules })             → FraudVerdict
 *   rp.leaderboard(programId)                          → Row[]
 *   rp.programROI(programId)                           → RoiReport
 *   rp.generateShareAssets(code, channels)             → ShareAssets
 *   rp.taxTreatment(reward)                            → TaxVerdict
 *
 * Internal data lives in the instance (append-only). Callers persist
 * by JSON-serialising `rp.snapshot()` and rehydrating via
 * `ReferralProgram.fromSnapshot(json)`.
 * -----------------------------------------------------------------
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Crypto / RNG — optional node:crypto                                 */
/* ------------------------------------------------------------------ */

let _crypto = null;
try {
  // eslint-disable-next-line global-require
  _crypto = require('node:crypto');
} catch (e) {
  _crypto = null;
}

function _defaultRandomHex(bytes) {
  if (_crypto && typeof _crypto.randomBytes === 'function') {
    return _crypto.randomBytes(bytes).toString('hex');
  }
  // Deterministic-ish fallback: Math.random + monotonic counter
  let s = '';
  for (let i = 0; i < bytes; i++) {
    s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Constants — reward types, methods, statuses                         */
/* ------------------------------------------------------------------ */

const REWARD_TYPE_FIXED      = 'fixed';       // fixed NIS amount
const REWARD_TYPE_PERCENT    = 'percent';     // percent of first purchase
const REWARD_TYPE_CREDIT     = 'credit';      // store credit (NIS)
const REWARD_TYPE_GIFT       = 'gift';        // physical gift / voucher
const REWARD_TYPE_DISCOUNT   = 'discount';    // discount code / coupon
const REWARD_TYPE_POINTS     = 'points';      // loyalty points

const REWARD_TYPES = Object.freeze([
  REWARD_TYPE_FIXED,
  REWARD_TYPE_PERCENT,
  REWARD_TYPE_CREDIT,
  REWARD_TYPE_GIFT,
  REWARD_TYPE_DISCOUNT,
  REWARD_TYPE_POINTS,
]);

const REWARD_METHOD_CREDIT   = 'credit';      // store credit balance
const REWARD_METHOD_CASH     = 'cash';        // bank transfer / cash
const REWARD_METHOD_DISCOUNT = 'discount';    // discount code
const REWARD_METHOD_GIFT     = 'gift';        // physical / gift card

const REWARD_METHODS = Object.freeze([
  REWARD_METHOD_CREDIT,
  REWARD_METHOD_CASH,
  REWARD_METHOD_DISCOUNT,
  REWARD_METHOD_GIFT,
]);

const SIDE_REFERRER = 'referrer';
const SIDE_REFERRED = 'referred';
const SIDES = Object.freeze([SIDE_REFERRER, SIDE_REFERRED]);

const REFERRAL_STATUS_PENDING   = 'pending';
const REFERRAL_STATUS_CAPTURED  = 'captured';
const REFERRAL_STATUS_CONVERTED = 'converted';
const REFERRAL_STATUS_BLOCKED   = 'blocked';
const REFERRAL_STATUS_EXPIRED   = 'expired';
const REFERRAL_STATUSES = Object.freeze([
  REFERRAL_STATUS_PENDING,
  REFERRAL_STATUS_CAPTURED,
  REFERRAL_STATUS_CONVERTED,
  REFERRAL_STATUS_BLOCKED,
  REFERRAL_STATUS_EXPIRED,
]);

const REWARD_STATUS_PENDING  = 'pending';
const REWARD_STATUS_ISSUED   = 'issued';
const REWARD_STATUS_REDEEMED = 'redeemed';
const REWARD_STATUS_VOIDED   = 'voided';

const FRAUD_SELF        = 'self-referral';
const FRAUD_CIRCULAR    = 'circular-referral';
const FRAUD_VELOCITY    = 'velocity';
const FRAUD_IP_MATCH    = 'ip-match';
const FRAUD_DEVICE      = 'device-match';
const FRAUD_DISPOSABLE  = 'disposable-email';
const FRAUD_EMAIL_MATCH = 'email-match';
const FRAUD_PHONE_MATCH = 'phone-match';
const FRAUD_BLACKLIST   = 'blacklist';

/* Hebrew + English glossary (for UI / reports) */
const LABELS_HE = Object.freeze({
  referral:      'הפניה',
  referrer:      'מַפנה',
  referred:      'מוּפנה',
  code:          'קוד הפניה',
  program:       'תוכנית הפניות',
  reward:        'תגמול',
  conversion:    'המרה',
  fraud:         'הונאה',
  leaderboard:   'טבלת מובילים',
  roi:           'תשואה על ההשקעה',
  share:         'שיתוף',
  click:         'הקלקה',
  lead:          'ליד',
  customer:      'לקוח',
  issued:        'הונפק',
  pending:       'ממתין',
  converted:     'הומר',
  blocked:       'חסום',
  expired:       'פג תוקף',
  tax:           'מיסוי',
  taxFree:       'פטור ממס',
  taxable:       'חייב במס',
});

const LABELS_EN = Object.freeze({
  referral:      'Referral',
  referrer:      'Referrer',
  referred:      'Referred',
  code:          'Referral code',
  program:       'Referral program',
  reward:        'Reward',
  conversion:    'Conversion',
  fraud:         'Fraud',
  leaderboard:   'Leaderboard',
  roi:           'ROI',
  share:         'Share',
  click:         'Click',
  lead:          'Lead',
  customer:      'Customer',
  issued:        'Issued',
  pending:       'Pending',
  converted:     'Converted',
  blocked:       'Blocked',
  expired:       'Expired',
  tax:           'Tax',
  taxFree:       'Tax-free',
  taxable:       'Taxable',
});

/* ------------------------------------------------------------------ */
/* Israeli tax constants (2026 guidance — see AG-Y094 report)          */
/* ------------------------------------------------------------------ */

/**
 * The annual cumulative tax-free threshold for one-off gifts /
 * promotional rewards to private individuals (Israeli Income Tax
 * Ordinance §2(10) + accountant guidance circular 34/2026).
 *
 * Above this threshold, cash-equivalent rewards become reportable as
 * "income from any source" and trigger form 806 / 867 filing.
 *
 * CAUTION: these are operational defaults. Override via the
 * `taxRules` argument to the constructor if your accountant says
 * otherwise.
 */
const IL_TAX_FREE_PER_OCCASION      = 210;      // ₪ per single reward
const IL_TAX_FREE_ANNUAL_CUMULATIVE = 2480;     // ₪ per tax year, one customer
const IL_VAT_RATE                    = 0.18;    // 18% — 2026 Israeli VAT
const IL_WITHHOLDING_DEFAULT         = 0.25;    // 25% default on prizes

/* ------------------------------------------------------------------ */
/* Safe-number helpers                                                 */
/* ------------------------------------------------------------------ */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toPosInt(v, fallback) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function nowIso(clock) {
  try {
    const d = clock ? clock() : new Date();
    return new Date(d).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

function sameDay(aIso, bIso) {
  return String(aIso).slice(0, 10) === String(bIso).slice(0, 10);
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(a - b) / 86400000;
}

/* ------------------------------------------------------------------ */
/* Disposable-email & blacklist stubs                                  */
/* ------------------------------------------------------------------ */

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'throwawaymail.com',
  'yopmail.com',
  'fakeinbox.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'maildrop.cc',
]);

function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/* ------------------------------------------------------------------ */
/* Code generator                                                      */
/* ------------------------------------------------------------------ */

/**
 * Referral codes are uppercase alphanumeric, easy to type, with a
 * checksum to reject manual typos. Format:
 *     <PREFIX>-<PAYLOAD>-<CHECK>
 * where PREFIX is a 3-char program slug, PAYLOAD is 6 base-32 chars
 * derived from random bytes, and CHECK is a single char Luhn-style.
 *
 * Example: "KOB-7QXP42-3"
 */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I/L/O/U, 32 chars

function _toBase32(bytesHex, len) {
  // bytesHex is a hex string; interpret as a big integer and encode base32
  let s = '';
  let carry = 0n;
  let n = 0n;
  try {
    n = BigInt('0x' + (bytesHex || '0'));
  } catch (e) {
    n = 0n;
  }
  const B = 32n;
  for (let i = 0; i < len; i++) {
    const r = Number(n % B);
    s = BASE32[r] + s;
    n = n / B;
    carry = (carry + BigInt(r)) & 0xffffn;
  }
  return s;
}

function _luhnCheckChar(str) {
  // Simple mod-32 checksum over BASE32 alphabet. Not crypto, just typo-catching.
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = BASE32.indexOf(str[i]);
    if (idx < 0) continue;
    sum += (i % 2 === 0) ? idx : idx * 3;
  }
  return BASE32[sum % 32];
}

function _slugify(s, len) {
  if (!s) return 'KOB';
  const up = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (up.length >= len) return up.slice(0, len);
  return (up + 'KOB').slice(0, len);
}

/* ------------------------------------------------------------------ */
/* The class                                                           */
/* ------------------------------------------------------------------ */

class ReferralProgram {
  /**
   * @param {Object} [opts]
   * @param {() => Date} [opts.clock]      custom time source
   * @param {() => string} [opts.randomId] custom id generator
   * @param {Object} [opts.taxRules]       override IL tax defaults
   */
  constructor(opts = {}) {
    this._clock    = typeof opts.clock === 'function' ? opts.clock : () => new Date();
    this._randomId = typeof opts.randomId === 'function'
      ? opts.randomId
      : () => _defaultRandomHex(8);

    this._taxRules = Object.freeze({
      taxFreePerOccasion:      toNum(opts.taxRules?.taxFreePerOccasion) || IL_TAX_FREE_PER_OCCASION,
      taxFreeAnnualCumulative: toNum(opts.taxRules?.taxFreeAnnualCumulative) || IL_TAX_FREE_ANNUAL_CUMULATIVE,
      vatRate:                 toNum(opts.taxRules?.vatRate)            || IL_VAT_RATE,
      withholdingDefault:      toNum(opts.taxRules?.withholdingDefault) || IL_WITHHOLDING_DEFAULT,
    });

    // Append-only stores
    this._programs       = new Map(); // id -> latest Program
    this._programHistory = new Map(); // id -> [Program versions]
    this._codes          = new Map(); // code -> CodeRecord
    this._codesByOwner   = new Map(); // customerId::programId -> code
    this._clicks         = [];        // ClickEvent[]
    this._referrals      = new Map(); // referralId -> Referral
    this._rewards        = new Map(); // rewardId -> Reward
    this._audit          = [];        // audit trail

    // Known code set for uniqueness enforcement
    this._usedCodes      = new Set();
  }

  /* ---------------------------------------------------------------- */
  /* Audit                                                             */
  /* ---------------------------------------------------------------- */

  _log(event, payload) {
    this._audit.push({
      at:      nowIso(this._clock),
      event:   String(event),
      payload: payload,
    });
  }

  /* ---------------------------------------------------------------- */
  /* createProgram                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Define or upgrade a referral program. Re-passing an existing id
   * bumps the program version — the prior version is kept in history.
   *
   * @param {Object} spec
   * @param {string} spec.id
   * @param {string} spec.name_he
   * @param {string} spec.name_en
   * @param {{type:string,value:number}} spec.rewardReferrer
   * @param {{type:string,value:number}} spec.rewardReferred
   * @param {Object} [spec.eligibilityRules]
   * @param {Object} [spec.duration]         {startAt, endAt}
   * @param {number} [spec.maxRewards]       total cap across the program
   * @param {Object} [spec.fraudRules]       see fraudDetection()
   * @returns {Program}
   */
  createProgram(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('createProgram: spec is required');
    }
    if (!spec.id || typeof spec.id !== 'string') {
      throw new Error('createProgram: id is required');
    }
    if (!spec.name_he || !spec.name_en) {
      throw new Error('createProgram: bilingual name_he and name_en required');
    }
    this._validateReward(spec.rewardReferrer, 'rewardReferrer');
    this._validateReward(spec.rewardReferred, 'rewardReferred');

    const existing = this._programs.get(spec.id);
    const version  = existing ? (existing.version + 1) : 1;

    const program = Object.freeze({
      id:                spec.id,
      version,
      name_he:           String(spec.name_he),
      name_en:           String(spec.name_en),
      rewardReferrer: Object.freeze({
        type:  String(spec.rewardReferrer.type),
        value: toNum(spec.rewardReferrer.value),
      }),
      rewardReferred: Object.freeze({
        type:  String(spec.rewardReferred.type),
        value: toNum(spec.rewardReferred.value),
      }),
      eligibilityRules: Object.freeze({
        minFirstPurchase:   toNum(spec.eligibilityRules?.minFirstPurchase),       // ₪
        newCustomersOnly:   spec.eligibilityRules?.newCustomersOnly !== false,
        allowedChannels:    Array.isArray(spec.eligibilityRules?.allowedChannels)
          ? [...spec.eligibilityRules.allowedChannels]
          : ['whatsapp', 'sms', 'email', 'link'],
        minReferrerTenureDays: toNum(spec.eligibilityRules?.minReferrerTenureDays),
        requiredCountries:    Array.isArray(spec.eligibilityRules?.requiredCountries)
          ? [...spec.eligibilityRules.requiredCountries]
          : null,
      }),
      duration: Object.freeze({
        startAt: spec.duration?.startAt ? new Date(spec.duration.startAt).toISOString() : nowIso(this._clock),
        endAt:   spec.duration?.endAt   ? new Date(spec.duration.endAt).toISOString()   : null,
      }),
      maxRewards: toPosInt(spec.maxRewards, Infinity),
      fraudRules: Object.freeze({
        blockSelfReferral:    spec.fraudRules?.blockSelfReferral   !== false,
        blockCircular:        spec.fraudRules?.blockCircular       !== false,
        maxPerDayPerReferrer: toPosInt(spec.fraudRules?.maxPerDayPerReferrer, 20),
        maxPerMonthPerReferrer: toPosInt(spec.fraudRules?.maxPerMonthPerReferrer, 100),
        blockSameIp:          spec.fraudRules?.blockSameIp         !== false,
        blockSameDevice:      spec.fraudRules?.blockSameDevice     !== false,
        blockDisposableEmail: spec.fraudRules?.blockDisposableEmail !== false,
        blockSameEmail:       spec.fraudRules?.blockSameEmail      !== false,
        blockSamePhone:       spec.fraudRules?.blockSamePhone      !== false,
        ipDenyList:           Array.isArray(spec.fraudRules?.ipDenyList)    ? [...spec.fraudRules.ipDenyList] : [],
        emailDenyList:        Array.isArray(spec.fraudRules?.emailDenyList) ? [...spec.fraudRules.emailDenyList] : [],
      }),
      status:    'active',
      createdAt: existing ? existing.createdAt : nowIso(this._clock),
      updatedAt: nowIso(this._clock),
    });

    this._programs.set(program.id, program);
    if (!this._programHistory.has(program.id)) {
      this._programHistory.set(program.id, []);
    }
    this._programHistory.get(program.id).push(program);

    this._log(existing ? 'program.upgraded' : 'program.created', {
      id: program.id, version: program.version,
    });

    return program;
  }

  _validateReward(r, field) {
    if (!r || typeof r !== 'object') {
      throw new Error('createProgram: ' + field + ' is required');
    }
    if (!REWARD_TYPES.includes(r.type)) {
      throw new Error('createProgram: ' + field + '.type must be one of ' + REWARD_TYPES.join(','));
    }
    if (!Number.isFinite(Number(r.value)) || Number(r.value) < 0) {
      throw new Error('createProgram: ' + field + '.value must be >= 0');
    }
  }

  getProgram(id) {
    return this._programs.get(id) || null;
  }

  getProgramHistory(id) {
    return (this._programHistory.get(id) || []).slice();
  }

  /* ---------------------------------------------------------------- */
  /* generateReferralCode                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Generate — or re-use — a unique referral code for a customer/program
   * pair. The code is deterministic per (customerId, programId) in the
   * sense that the SAME customer for the SAME program always gets the
   * SAME code back (idempotent).
   *
   * @param {Object} args
   * @param {string} args.customerId
   * @param {string} args.programId
   * @returns {CodeRecord}
   */
  generateReferralCode({ customerId, programId } = {}) {
    if (!customerId) throw new Error('generateReferralCode: customerId required');
    if (!programId)  throw new Error('generateReferralCode: programId required');

    const program = this._programs.get(programId);
    if (!program) throw new Error('generateReferralCode: unknown programId ' + programId);

    const key = String(customerId) + '::' + String(programId);
    const existing = this._codesByOwner.get(key);
    if (existing) {
      return this._codes.get(existing);
    }

    // Generate with retry on collisions
    let code = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const prefix  = _slugify(program.id, 3);
      const payload = _toBase32(_defaultRandomHex(6), 6);
      const core    = prefix + '-' + payload;
      const check   = _luhnCheckChar(prefix + payload);
      const candidate = core + '-' + check;
      if (!this._usedCodes.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      // Fallback — embed the random id
      code = _slugify(program.id, 3) + '-' +
             _toBase32(_defaultRandomHex(8), 8) + '-' +
             _luhnCheckChar(String(this._randomId()));
    }

    const record = {
      code,
      programId,
      programVersion: program.version,
      customerId,
      createdAt: nowIso(this._clock),
      status:    'active',
      clicks:    0,
      captures:  0,
      conversions: 0,
    };
    this._codes.set(code, record);
    this._codesByOwner.set(key, code);
    this._usedCodes.add(code);
    this._log('code.generated', { code, customerId, programId });
    return record;
  }

  /**
   * Validate a code's structure (checksum) and existence.
   */
  validateCode(code) {
    if (!code || typeof code !== 'string') return { valid: false, reason: 'empty' };
    const parts = code.split('-');
    if (parts.length !== 3) return { valid: false, reason: 'format' };
    const [prefix, payload, check] = parts;
    if (prefix.length !== 3) return { valid: false, reason: 'prefix' };
    if (payload.length < 6)  return { valid: false, reason: 'payload' };
    if (check.length !== 1)  return { valid: false, reason: 'check' };
    const expected = _luhnCheckChar(prefix + payload);
    if (expected !== check)  return { valid: false, reason: 'checksum' };
    if (!this._codes.has(code)) return { valid: false, reason: 'unknown' };
    return { valid: true };
  }

  /* ---------------------------------------------------------------- */
  /* trackReferralLink                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Record a click / touch on a referral link. Updates the code
   * counters and appends a click record. Never throws on unknown code
   * — instead returns a `{ tracked:false }` record, because analytics
   * should never break on noise.
   *
   * @param {string} code
   * @param {string} medium  whatsapp|sms|email|link|facebook|instagram|tiktok|...
   * @returns {ClickRecord}
   */
  trackReferralLink(code, medium) {
    const mediumN = String(medium || 'link').toLowerCase();
    const record  = this._codes.get(code);
    const click = {
      id:        this._newId('clk'),
      code:      code || null,
      medium:    mediumN,
      at:        nowIso(this._clock),
      tracked:   !!record,
    };
    this._clicks.push(click);
    if (record) {
      record.clicks = toNum(record.clicks) + 1;
      this._log('link.tracked', { code, medium: mediumN });
    }
    return click;
  }

  getClicks(codeOrFilter) {
    if (!codeOrFilter) return this._clicks.slice();
    if (typeof codeOrFilter === 'string') {
      return this._clicks.filter((c) => c.code === codeOrFilter);
    }
    return this._clicks.slice();
  }

  /* ---------------------------------------------------------------- */
  /* captureReferred                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * A new lead arrives via a referral link. Creates a Referral record
   * and runs fraud pre-checks. If a fraud rule blocks it, the record
   * is NOT deleted — it gets status:'blocked' with a reason.
   *
   * @param {Object} args
   * @param {string} args.code
   * @param {Object} args.leadInfo  { leadId, email, phone, ip, deviceId, country, ... }
   * @returns {Referral}
   */
  captureReferred({ code, leadInfo } = {}) {
    if (!code) throw new Error('captureReferred: code required');
    const codeRec = this._codes.get(code);
    if (!codeRec) {
      throw new Error('captureReferred: unknown code ' + code);
    }
    const program = this._programs.get(codeRec.programId);
    if (!program) {
      throw new Error('captureReferred: program not found for code ' + code);
    }
    const info = leadInfo || {};
    const id   = this._newId('ref');

    const referral = {
      id,
      code,
      programId:    codeRec.programId,
      referrerId:   codeRec.customerId,
      leadId:       info.leadId || this._newId('lead'),
      leadEmail:    info.email   || null,
      leadPhone:    info.phone   || null,
      leadIp:       info.ip      || null,
      leadDeviceId: info.deviceId || null,
      leadCountry:  info.country  || null,
      channel:      info.channel  || null,
      status:       REFERRAL_STATUS_CAPTURED,
      blockedReason: null,
      capturedAt:   nowIso(this._clock),
      convertedAt:  null,
      conversionValue: 0,
    };

    codeRec.captures = toNum(codeRec.captures) + 1;
    this._referrals.set(id, referral);

    // Run fraud checks using the program rules
    const verdict = this.fraudDetection({ referral, rules: program.fraudRules });
    if (verdict.blocked) {
      referral.status = REFERRAL_STATUS_BLOCKED;
      referral.blockedReason = verdict.reasons.join(',');
      this._log('referral.blocked', { id, code, reasons: verdict.reasons });
    } else {
      this._log('referral.captured', { id, code });
    }

    return referral;
  }

  getReferral(id) {
    return this._referrals.get(id) || null;
  }

  /* ---------------------------------------------------------------- */
  /* validateConversion                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Determine whether a lead has met the conversion criteria for its
   * program. Does NOT issue rewards by itself (that is a separate
   * operation, `issueReward`). Instead returns a verdict and marks the
   * referral as 'converted' on success.
   *
   * Criteria supported:
   *   - minFirstPurchase (₪)   — from program.eligibilityRules
   *   - conditions.firstPurchase          — ₪
   *   - conditions.purchaseCompleted      — bool
   *   - conditions.accountAge_days        — min age
   *   - conditions.country                — required country
   *
   * @param {Object} args
   * @param {string} args.leadId
   * @param {Object} [args.conditions]
   * @returns {ConvResult}
   */
  validateConversion({ leadId, conditions } = {}) {
    if (!leadId) throw new Error('validateConversion: leadId required');
    const referral = this._findReferralByLead(leadId);
    if (!referral) {
      return { valid: false, leadId, reason: 'no-referral' };
    }
    if (referral.status === REFERRAL_STATUS_BLOCKED) {
      return { valid: false, leadId, referralId: referral.id, reason: 'blocked' };
    }
    if (referral.status === REFERRAL_STATUS_CONVERTED) {
      return { valid: true, leadId, referralId: referral.id, alreadyConverted: true };
    }
    const program = this._programs.get(referral.programId);
    if (!program) {
      return { valid: false, leadId, referralId: referral.id, reason: 'no-program' };
    }
    const c = conditions || {};

    // Purchase-completed gate
    if (c.purchaseCompleted === false) {
      return { valid: false, leadId, referralId: referral.id, reason: 'no-purchase' };
    }

    // Minimum first purchase
    const minReq = Math.max(
      toNum(program.eligibilityRules.minFirstPurchase),
      toNum(c.minFirstPurchase),
    );
    const actual = toNum(c.firstPurchase);
    if (minReq > 0 && actual < minReq) {
      return {
        valid:      false,
        leadId,
        referralId: referral.id,
        reason:     'below-min-purchase',
        required:   minReq,
        actual,
      };
    }

    // Required country
    if (program.eligibilityRules.requiredCountries && c.country) {
      if (!program.eligibilityRules.requiredCountries.includes(c.country)) {
        return {
          valid:      false,
          leadId,
          referralId: referral.id,
          reason:     'country-not-allowed',
          country:    c.country,
        };
      }
    }

    // Account age
    if (toNum(c.minAccountAgeDays) > 0 && toNum(c.accountAgeDays) < toNum(c.minAccountAgeDays)) {
      return {
        valid:      false,
        leadId,
        referralId: referral.id,
        reason:     'account-too-young',
      };
    }

    // Program duration
    if (program.duration.endAt && nowIso(this._clock) > program.duration.endAt) {
      return {
        valid:      false,
        leadId,
        referralId: referral.id,
        reason:     'program-expired',
      };
    }

    // ACCEPT — mark the referral converted (append-only: no delete)
    referral.status         = REFERRAL_STATUS_CONVERTED;
    referral.convertedAt    = nowIso(this._clock);
    referral.conversionValue = actual;
    const codeRec = this._codes.get(referral.code);
    if (codeRec) codeRec.conversions = toNum(codeRec.conversions) + 1;
    this._log('referral.converted', { id: referral.id, leadId, value: actual });

    return {
      valid:      true,
      leadId,
      referralId: referral.id,
      value:      actual,
    };
  }

  _findReferralByLead(leadId) {
    for (const r of this._referrals.values()) {
      if (r.leadId === leadId) return r;
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* issueReward                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Issue (post) a reward to either the referrer or the referred
   * customer. The reward is never deleted — voiding flips the status.
   *
   * @param {Object} args
   * @param {string} args.programId
   * @param {'referrer'|'referred'} args.side
   * @param {string} args.customerId
   * @param {number} [args.value]  override program default
   * @param {'credit'|'cash'|'discount'|'gift'} [args.method]
   * @returns {Reward}
   */
  issueReward({ programId, side, customerId, value, method } = {}) {
    if (!programId)  throw new Error('issueReward: programId required');
    if (!customerId) throw new Error('issueReward: customerId required');
    if (!SIDES.includes(side)) {
      throw new Error('issueReward: side must be referrer or referred');
    }
    const program = this._programs.get(programId);
    if (!program) throw new Error('issueReward: unknown program ' + programId);

    const spec = side === SIDE_REFERRER ? program.rewardReferrer : program.rewardReferred;
    const resolvedValue = Number.isFinite(Number(value)) && Number(value) >= 0
      ? toNum(value) : toNum(spec.value);

    const resolvedMethod = REWARD_METHODS.includes(method) ? method : this._defaultMethod(spec.type);

    // MaxRewards cap
    const issuedCount = this._countIssuedForProgram(programId);
    if (issuedCount >= program.maxRewards) {
      throw new Error('issueReward: program cap reached');
    }

    const id = this._newId('rwd');
    const reward = {
      id,
      programId,
      programVersion: program.version,
      side,
      customerId,
      type:      spec.type,
      value:     resolvedValue,
      currency:  'ILS',
      method:    resolvedMethod,
      status:    REWARD_STATUS_ISSUED,
      issuedAt:  nowIso(this._clock),
      redeemedAt: null,
      voidedAt:   null,
      voidReason: null,
    };
    this._rewards.set(id, reward);
    this._log('reward.issued', {
      id, programId, side, customerId, value: resolvedValue, method: resolvedMethod,
    });
    return reward;
  }

  _defaultMethod(rewardType) {
    switch (rewardType) {
      case REWARD_TYPE_CREDIT:   return REWARD_METHOD_CREDIT;
      case REWARD_TYPE_DISCOUNT: return REWARD_METHOD_DISCOUNT;
      case REWARD_TYPE_GIFT:     return REWARD_METHOD_GIFT;
      case REWARD_TYPE_FIXED:    return REWARD_METHOD_CREDIT;
      case REWARD_TYPE_PERCENT:  return REWARD_METHOD_DISCOUNT;
      case REWARD_TYPE_POINTS:   return REWARD_METHOD_CREDIT;
      default:                   return REWARD_METHOD_CREDIT;
    }
  }

  _countIssuedForProgram(programId) {
    let n = 0;
    for (const r of this._rewards.values()) {
      if (r.programId === programId &&
          (r.status === REWARD_STATUS_ISSUED || r.status === REWARD_STATUS_REDEEMED)) {
        n++;
      }
    }
    return n;
  }

  voidReward(id, reason) {
    const r = this._rewards.get(id);
    if (!r) return null;
    r.status     = REWARD_STATUS_VOIDED;
    r.voidedAt   = nowIso(this._clock);
    r.voidReason = String(reason || 'unspecified');
    this._log('reward.voided', { id, reason: r.voidReason });
    return r;
  }

  getReward(id) {
    return this._rewards.get(id) || null;
  }

  /* ---------------------------------------------------------------- */
  /* fraudDetection                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Inspect a referral for fraud indicators.
   *
   * @param {Object} args
   * @param {Referral} args.referral
   * @param {Object} args.rules   see program.fraudRules
   * @returns {{blocked:boolean, reasons:string[], score:number}}
   */
  fraudDetection({ referral, rules } = {}) {
    const reasons = [];
    let score = 0;
    if (!referral || typeof referral !== 'object') {
      return { blocked: false, reasons, score: 0 };
    }
    const r = rules || {};
    const ref = referral;

    // 1. Self-referral — the referrer is the same person as the lead
    const referrer = ref.referrerId;
    const leadId   = ref.leadId;
    const leadEmail = ref.leadEmail || null;
    const leadPhone = ref.leadPhone || null;
    const leadIp    = ref.leadIp || null;
    const leadDevice = ref.leadDeviceId || null;

    if (r.blockSelfReferral !== false) {
      if (referrer && (referrer === leadId)) {
        reasons.push(FRAUD_SELF);
        score += 100;
      }
      // email / phone identity match also counts as self
      if (referrer && leadEmail && this._getCustomerEmail(referrer) &&
          this._getCustomerEmail(referrer) === String(leadEmail).toLowerCase()) {
        reasons.push(FRAUD_SELF);
        score += 100;
      }
    }

    // 2. Circular — the lead is already a referrer who referred this referrer
    if (r.blockCircular !== false) {
      if (this._isCircular(referrer, leadId)) {
        reasons.push(FRAUD_CIRCULAR);
        score += 90;
      }
    }

    // 3. Velocity — too many referrals in a window
    const maxDay   = toNum(r.maxPerDayPerReferrer)   || 20;
    const maxMonth = toNum(r.maxPerMonthPerReferrer) || 100;
    const now = ref.capturedAt || nowIso(this._clock);
    let dayCount = 0;
    let monthCount = 0;
    for (const other of this._referrals.values()) {
      if (other.id === ref.id) continue;
      if (other.referrerId !== referrer) continue;
      const d = daysBetween(now, other.capturedAt);
      if (d <= 1) dayCount++;
      if (d <= 30) monthCount++;
    }
    if (maxDay > 0 && dayCount >= maxDay) {
      reasons.push(FRAUD_VELOCITY);
      score += 70;
    }
    if (maxMonth > 0 && monthCount >= maxMonth) {
      if (!reasons.includes(FRAUD_VELOCITY)) reasons.push(FRAUD_VELOCITY);
      score += 40;
    }

    // 4. IP match — lead IP equals referrer IP, or any prior referral IP
    if (r.blockSameIp !== false && leadIp) {
      const referrerIps = this._getCustomerIps(referrer);
      if (referrerIps.has(String(leadIp))) {
        reasons.push(FRAUD_IP_MATCH);
        score += 60;
      } else {
        // Also check sibling leads from same referrer sharing the same IP
        for (const other of this._referrals.values()) {
          if (other.id === ref.id) continue;
          if (other.referrerId === referrer && other.leadIp === leadIp) {
            reasons.push(FRAUD_IP_MATCH);
            score += 50;
            break;
          }
        }
      }
      // IP deny list
      if (Array.isArray(r.ipDenyList) && r.ipDenyList.includes(String(leadIp))) {
        reasons.push(FRAUD_BLACKLIST);
        score += 100;
      }
    }

    // 5. Device match
    if (r.blockSameDevice !== false && leadDevice) {
      const referrerDevices = this._getCustomerDevices(referrer);
      if (referrerDevices.has(String(leadDevice))) {
        reasons.push(FRAUD_DEVICE);
        score += 60;
      } else {
        for (const other of this._referrals.values()) {
          if (other.id === ref.id) continue;
          if (other.referrerId === referrer && other.leadDeviceId === leadDevice) {
            if (!reasons.includes(FRAUD_DEVICE)) reasons.push(FRAUD_DEVICE);
            score += 40;
            break;
          }
        }
      }
    }

    // 6. Disposable email
    if (r.blockDisposableEmail !== false && leadEmail && isDisposableEmail(leadEmail)) {
      reasons.push(FRAUD_DISPOSABLE);
      score += 80;
    }

    // 7. Email / phone deny list
    if (Array.isArray(r.emailDenyList) && leadEmail) {
      if (r.emailDenyList.includes(String(leadEmail).toLowerCase())) {
        reasons.push(FRAUD_BLACKLIST);
        score += 100;
      }
    }

    // 8. Email already used in another referral from the same referrer
    if (r.blockSameEmail !== false && leadEmail) {
      for (const other of this._referrals.values()) {
        if (other.id === ref.id) continue;
        if (other.referrerId === referrer && other.leadEmail === leadEmail) {
          reasons.push(FRAUD_EMAIL_MATCH);
          score += 50;
          break;
        }
      }
    }

    // 9. Phone already used in another referral from the same referrer
    if (r.blockSamePhone !== false && leadPhone) {
      for (const other of this._referrals.values()) {
        if (other.id === ref.id) continue;
        if (other.referrerId === referrer && other.leadPhone === leadPhone) {
          reasons.push(FRAUD_PHONE_MATCH);
          score += 50;
          break;
        }
      }
    }

    const blocked = reasons.length > 0;
    return { blocked, reasons, score };
  }

  // Hooks — subclasses / tests can override to provide customer-level
  // data (email, IPs, devices). Default implementations return empty sets.
  _getCustomerEmail(/* customerId */) { return null; }
  _getCustomerIps(/* customerId */)   { return new Set(); }
  _getCustomerDevices(/* customerId */){ return new Set(); }

  _isCircular(referrerId, leadId) {
    if (!referrerId || !leadId) return false;
    // Is there a historical referral where leadId referred the referrer?
    for (const r of this._referrals.values()) {
      if (r.referrerId === leadId && r.leadId === referrerId) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* leaderboard                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Rank referrers for a program by conversions, captures, and value.
   *
   * @param {string} programId
   * @returns {Array<{customerId,rank,captures,conversions,blockedCount,totalValue}>}
   */
  leaderboard(programId) {
    if (!programId) return [];
    const rows = new Map(); // customerId -> row
    for (const r of this._referrals.values()) {
      if (r.programId !== programId) continue;
      const key = r.referrerId;
      if (!rows.has(key)) {
        rows.set(key, {
          customerId:   key,
          captures:     0,
          conversions:  0,
          blockedCount: 0,
          totalValue:   0,
        });
      }
      const row = rows.get(key);
      row.captures++;
      if (r.status === REFERRAL_STATUS_CONVERTED) {
        row.conversions++;
        row.totalValue += toNum(r.conversionValue);
      }
      if (r.status === REFERRAL_STATUS_BLOCKED) row.blockedCount++;
    }
    const list = Array.from(rows.values());
    // Sort: conversions desc, totalValue desc, captures desc, customerId asc
    list.sort((a, b) => {
      if (b.conversions !== a.conversions) return b.conversions - a.conversions;
      if (b.totalValue  !== a.totalValue)  return b.totalValue  - a.totalValue;
      if (b.captures    !== a.captures)    return b.captures    - a.captures;
      return String(a.customerId).localeCompare(String(b.customerId));
    });

    // Dense rank with ties
    let prevKey = null;
    let prevRank = 0;
    list.forEach((row, idx) => {
      const key = row.conversions + ':' + row.totalValue + ':' + row.captures;
      if (key === prevKey) {
        row.rank = prevRank;
      } else {
        row.rank = idx + 1;
        prevKey  = key;
        prevRank = row.rank;
      }
    });
    return list;
  }

  /* ---------------------------------------------------------------- */
  /* programROI                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Compute cost / revenue / ROI for a program.
   *
   * revenue   = sum of conversionValue on CONVERTED referrals
   * rewardCost = sum of VALID (issued/redeemed) reward values
   * netRevenue = revenue - rewardCost
   * roi        = netRevenue / rewardCost  (as ratio; Infinity when cost=0)
   * costPerConversion = rewardCost / conversions
   * costPerAcquisition = rewardCost / uniqueNewCustomers
   *
   * @param {string} programId
   * @returns {RoiReport}
   */
  programROI(programId) {
    const program = this._programs.get(programId);
    let captures = 0;
    let conversions = 0;
    let blocked = 0;
    let revenue = 0;
    const uniqueNewCustomers = new Set();

    for (const r of this._referrals.values()) {
      if (r.programId !== programId) continue;
      captures++;
      if (r.status === REFERRAL_STATUS_CONVERTED) {
        conversions++;
        revenue += toNum(r.conversionValue);
        if (r.leadId) uniqueNewCustomers.add(r.leadId);
      }
      if (r.status === REFERRAL_STATUS_BLOCKED) blocked++;
    }

    let rewardCost = 0;
    let rewardsIssued = 0;
    let rewardsVoided = 0;
    for (const rw of this._rewards.values()) {
      if (rw.programId !== programId) continue;
      if (rw.status === REWARD_STATUS_ISSUED || rw.status === REWARD_STATUS_REDEEMED) {
        rewardCost += toNum(rw.value);
        rewardsIssued++;
      } else if (rw.status === REWARD_STATUS_VOIDED) {
        rewardsVoided++;
      }
    }

    const netRevenue         = revenue - rewardCost;
    const roi                = rewardCost > 0 ? netRevenue / rewardCost : (revenue > 0 ? Infinity : 0);
    const conversionRate     = captures > 0 ? conversions / captures : 0;
    const costPerConversion  = conversions > 0 ? rewardCost / conversions : 0;
    const costPerAcquisition = uniqueNewCustomers.size > 0
      ? rewardCost / uniqueNewCustomers.size
      : 0;

    return {
      programId,
      programName_he: program ? program.name_he : null,
      programName_en: program ? program.name_en : null,
      captures,
      conversions,
      blockedCount:   blocked,
      uniqueNewCustomers: uniqueNewCustomers.size,
      revenue,
      rewardCost,
      rewardsIssued,
      rewardsVoided,
      netRevenue,
      roi,
      conversionRate,
      costPerConversion,
      costPerAcquisition,
      currency: 'ILS',
      asOf:     nowIso(this._clock),
    };
  }

  /* ---------------------------------------------------------------- */
  /* generateShareAssets                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Produce bilingual share assets (WhatsApp/SMS/email) for a code.
   *
   * @param {string} code
   * @param {string[]} channels  subset of ['whatsapp','sms','email','facebook','link']
   * @returns {{code, link, he, en}}
   */
  generateShareAssets(code, channels) {
    const rec = this._codes.get(code);
    const program = rec ? this._programs.get(rec.programId) : null;
    const baseUrl = 'https://referral.techno-kol.co.il/r/';
    const link    = baseUrl + encodeURIComponent(code || '');
    const wanted  = Array.isArray(channels) && channels.length > 0
      ? channels.map((c) => String(c).toLowerCase())
      : ['whatsapp', 'sms', 'email', 'facebook', 'link'];

    const progNameHe = program ? program.name_he : 'תוכנית ההפניות';
    const progNameEn = program ? program.name_en : 'our referral program';
    const rewardHe   = program
      ? this._rewardSummary(program.rewardReferred, 'he')
      : 'הטבה מיוחדת';
    const rewardEn   = program
      ? this._rewardSummary(program.rewardReferred, 'en')
      : 'a special offer';

    // Hebrew templates
    const he = {};
    const en = {};

    if (wanted.includes('whatsapp')) {
      he.whatsapp = 'שלום! הצטרפו אליי ל' + progNameHe + ' וקבלו ' + rewardHe + '.\n'
                   + 'השתמשו בקוד שלי: ' + code + '\n'
                   + link;
      en.whatsapp = 'Hi! Join me on ' + progNameEn + ' and get ' + rewardEn + '.\n'
                   + 'Use my code: ' + code + '\n'
                   + link;
    }
    if (wanted.includes('sms')) {
      he.sms = progNameHe + ': ' + rewardHe + '. קוד ' + code + ' ' + link;
      en.sms = progNameEn + ': ' + rewardEn + '. Code ' + code + ' ' + link;
    }
    if (wanted.includes('email')) {
      he.emailSubject = 'הצטרפו אליי ל' + progNameHe + ' – ' + rewardHe;
      he.emailBody    = 'שלום,\n\n'
                      + 'אני משתמש ב' + progNameHe + ' וחשבתי שזה יכול לעניין גם אתכם. '
                      + 'כשאתם נרשמים עם קוד ההפניה שלי אתם מקבלים ' + rewardHe + '.\n\n'
                      + 'הקוד שלי: ' + code + '\n'
                      + 'קישור ישיר: ' + link + '\n\n'
                      + 'בהצלחה!\n';
      en.emailSubject = 'Join me on ' + progNameEn + ' — ' + rewardEn;
      en.emailBody    = 'Hello,\n\n'
                      + 'I\'ve been using ' + progNameEn + ' and thought you might be interested too. '
                      + 'When you sign up with my referral code you get ' + rewardEn + '.\n\n'
                      + 'My code: ' + code + '\n'
                      + 'Direct link: ' + link + '\n\n'
                      + 'Enjoy!\n';
    }
    if (wanted.includes('facebook')) {
      he.facebook = 'גליתי את ' + progNameHe + ' וחבל שלא ניצלתם את זה. '
                  + 'עם הקוד שלי ' + code + ' מקבלים ' + rewardHe + ': ' + link;
      en.facebook = 'Found out about ' + progNameEn + '. Use my code ' + code
                  + ' for ' + rewardEn + ': ' + link;
    }
    if (wanted.includes('link')) {
      he.link = link;
      en.link = link;
    }

    return { code, link, he, en };
  }

  _rewardSummary(spec, lang) {
    if (!spec) return lang === 'he' ? 'הטבה' : 'a reward';
    const v = toNum(spec.value);
    const nis = lang === 'he' ? '₪' : 'ILS';
    switch (spec.type) {
      case REWARD_TYPE_FIXED:
      case REWARD_TYPE_CREDIT:
        return lang === 'he'
          ? v.toLocaleString('he-IL') + ' ' + nis + ' זיכוי'
          : v.toLocaleString('en-US') + ' ' + nis + ' credit';
      case REWARD_TYPE_PERCENT:
        return lang === 'he'
          ? v + '% הנחה'
          : v + '% off';
      case REWARD_TYPE_DISCOUNT:
        return lang === 'he'
          ? 'קופון הנחה של ' + v + ' ' + nis
          : 'a ' + v + ' ' + nis + ' discount coupon';
      case REWARD_TYPE_GIFT:
        return lang === 'he' ? 'מתנה' : 'a gift';
      case REWARD_TYPE_POINTS:
        return lang === 'he'
          ? v + ' נקודות נאמנות'
          : v + ' loyalty points';
      default:
        return lang === 'he' ? 'הטבה' : 'a reward';
    }
  }

  /* ---------------------------------------------------------------- */
  /* taxTreatment                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Classify the Israeli tax treatment of a reward (conservative).
   *
   * @param {Reward|Object} reward
   *   Either a full Reward record or a bag {type,value,method,customerId}.
   * @returns {TaxVerdict}
   */
  taxTreatment(reward) {
    if (!reward || typeof reward !== 'object') {
      return {
        taxable: false, reason: 'no-reward',
        note_he: 'אין תגמול — אין מס.',
        note_en: 'No reward — no tax.',
      };
    }
    const rules = this._taxRules;
    const val   = toNum(reward.value);
    const type  = String(reward.type || '');
    const method = String(reward.method || '');
    const customerId = reward.customerId;

    // Cumulative year-to-date for the same customer
    let ytd = 0;
    const year = new Date(nowIso(this._clock)).getUTCFullYear();
    for (const r of this._rewards.values()) {
      if (r.customerId !== customerId) continue;
      if (r.status !== REWARD_STATUS_ISSUED && r.status !== REWARD_STATUS_REDEEMED) continue;
      if (new Date(r.issuedAt).getUTCFullYear() !== year) continue;
      ytd += toNum(r.value);
    }
    // Include the reward in question if it is not yet counted
    if (reward.id && !this._rewards.has(reward.id)) {
      ytd += val;
    }

    const isCashLike = method === REWARD_METHOD_CASH ||
                       type === REWARD_TYPE_FIXED ||
                       type === REWARD_TYPE_CREDIT;

    // 1. Discount / percent / coupon — treated as a price reduction, NOT income
    if (type === REWARD_TYPE_DISCOUNT || type === REWARD_TYPE_PERCENT) {
      return {
        taxable: false,
        classification: 'price-reduction',
        reason: 'discount',
        reportingForm: null,
        withholding:   0,
        vatRate:       rules.vatRate,
        grossValue:    val,
        netValue:      val,
        note_he: 'הנחה על מחיר המכירה — אינה נחשבת הכנסה בידי הלקוח ואינה חייבת בדיווח.',
        note_en: 'A discount on sale price is treated as a price reduction, not taxable income for the customer.',
      };
    }

    // 2. Small gift — under per-occasion threshold AND ytd under annual
    if (val <= rules.taxFreePerOccasion && ytd <= rules.taxFreeAnnualCumulative) {
      return {
        taxable: false,
        classification: 'de-minimis-gift',
        reason: 'under-threshold',
        reportingForm: null,
        withholding:   0,
        vatRate:       rules.vatRate,
        grossValue:    val,
        netValue:      val,
        thresholdPerOccasion: rules.taxFreePerOccasion,
        thresholdAnnual:      rules.taxFreeAnnualCumulative,
        ytd,
        note_he: 'הטבה חד־פעמית נמוכה (מתחת לסף שנתי/פר־אירוע) — פטורה ממס לפי פקודת מס הכנסה §2(10).',
        note_en: 'Low one-off promo reward below per-occasion and annual thresholds — tax-exempt under Income Tax Ordinance §2(10).',
      };
    }

    // 3. In-kind / gift — reportable at market value (withholding optional)
    if (type === REWARD_TYPE_GIFT) {
      return {
        taxable: true,
        classification: 'in-kind-gift',
        reason: 'in-kind-above-threshold',
        reportingForm: 'טופס 806',
        withholding:   rules.withholdingDefault,
        vatRate:       rules.vatRate,
        grossValue:    val,
        netValue:      val * (1 - rules.withholdingDefault),
        ytd,
        note_he: 'מתנה בעין מעל לסף — חייבת בדיווח בטופס 806 ובניכוי מס במקור של ' +
                 Math.round(rules.withholdingDefault * 100) + '%.',
        note_en: 'In-kind reward above threshold — reportable on form 806 with ' +
                 Math.round(rules.withholdingDefault * 100) + '% withholding at source.',
      };
    }

    // 4. Cash-like over threshold
    if (isCashLike && (val > rules.taxFreePerOccasion || ytd > rules.taxFreeAnnualCumulative)) {
      return {
        taxable: true,
        classification: 'cash-prize',
        reason: 'above-threshold',
        reportingForm: 'טופס 867',
        withholding:   rules.withholdingDefault,
        vatRate:       rules.vatRate,
        grossValue:    val,
        netValue:      val * (1 - rules.withholdingDefault),
        ytd,
        note_he: 'תגמול כספי מעל לסף (פר אירוע או מצטבר שנתי) — חייב במס הכנסה ובניכוי במקור ' +
                 Math.round(rules.withholdingDefault * 100) + '%. לדווח בטופס 867.',
        note_en: 'Cash-equivalent reward above threshold — income-taxable with ' +
                 Math.round(rules.withholdingDefault * 100) + '% withholding; report on form 867.',
      };
    }

    // 5. Loyalty points — not taxable until redeemed (follow-up required)
    if (type === REWARD_TYPE_POINTS) {
      return {
        taxable: false,
        classification: 'loyalty-points',
        reason: 'points',
        reportingForm: null,
        withholding:   0,
        vatRate:       rules.vatRate,
        grossValue:    val,
        netValue:      val,
        note_he: 'נקודות נאמנות אינן חייבות במס עד מימושן להטבה כספית. לעקוב בעת המימוש.',
        note_en: 'Loyalty points are not taxable until redeemed for a cash-equivalent benefit.',
      };
    }

    // Fallback
    return {
      taxable: false,
      classification: 'unknown',
      reason: 'review',
      reportingForm: null,
      withholding:   0,
      vatRate:       rules.vatRate,
      grossValue:    val,
      netValue:      val,
      ytd,
      note_he: 'סיווג לא ודאי — יש להעביר לסקירת רו״ח.',
      note_en: 'Uncertain classification — route to accountant review.',
    };
  }

  /* ---------------------------------------------------------------- */
  /* Snapshots / misc                                                  */
  /* ---------------------------------------------------------------- */

  snapshot() {
    return {
      v: 1,
      programs:       [...this._programs.values()],
      programHistory: Array.from(this._programHistory.entries()).map(([k, vs]) => ({ id: k, versions: vs })),
      codes:          [...this._codes.values()],
      clicks:         this._clicks.slice(),
      referrals:      [...this._referrals.values()],
      rewards:        [...this._rewards.values()],
      audit:          this._audit.slice(),
    };
  }

  static fromSnapshot(snap, opts) {
    const rp = new ReferralProgram(opts || {});
    if (!snap || typeof snap !== 'object') return rp;
    if (Array.isArray(snap.programs)) {
      for (const p of snap.programs) rp._programs.set(p.id, p);
    }
    if (Array.isArray(snap.programHistory)) {
      for (const h of snap.programHistory) rp._programHistory.set(h.id, h.versions.slice());
    }
    if (Array.isArray(snap.codes)) {
      for (const c of snap.codes) {
        rp._codes.set(c.code, c);
        rp._usedCodes.add(c.code);
        rp._codesByOwner.set(c.customerId + '::' + c.programId, c.code);
      }
    }
    if (Array.isArray(snap.clicks))    rp._clicks = snap.clicks.slice();
    if (Array.isArray(snap.referrals)) for (const r of snap.referrals) rp._referrals.set(r.id, r);
    if (Array.isArray(snap.rewards))   for (const r of snap.rewards)   rp._rewards.set(r.id, r);
    if (Array.isArray(snap.audit))     rp._audit = snap.audit.slice();
    return rp;
  }

  _newId(prefix) {
    return String(prefix || 'id') + '-' + this._randomId() + _defaultRandomHex(4);
  }

  /* ---------------------------------------------------------------- */
  /* Diagnostics                                                       */
  /* ---------------------------------------------------------------- */

  stats() {
    return {
      programs:      this._programs.size,
      codes:         this._codes.size,
      clicks:        this._clicks.length,
      referrals:     this._referrals.size,
      rewards:       this._rewards.size,
      auditEntries:  this._audit.length,
    };
  }

  audit() {
    return this._audit.slice();
  }
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

module.exports = {
  ReferralProgram,

  // constants
  REWARD_TYPES,
  REWARD_TYPE_FIXED,
  REWARD_TYPE_PERCENT,
  REWARD_TYPE_CREDIT,
  REWARD_TYPE_GIFT,
  REWARD_TYPE_DISCOUNT,
  REWARD_TYPE_POINTS,

  REWARD_METHODS,
  REWARD_METHOD_CREDIT,
  REWARD_METHOD_CASH,
  REWARD_METHOD_DISCOUNT,
  REWARD_METHOD_GIFT,

  SIDES,
  SIDE_REFERRER,
  SIDE_REFERRED,

  REFERRAL_STATUSES,
  REFERRAL_STATUS_PENDING,
  REFERRAL_STATUS_CAPTURED,
  REFERRAL_STATUS_CONVERTED,
  REFERRAL_STATUS_BLOCKED,
  REFERRAL_STATUS_EXPIRED,

  REWARD_STATUS_PENDING,
  REWARD_STATUS_ISSUED,
  REWARD_STATUS_REDEEMED,
  REWARD_STATUS_VOIDED,

  FRAUD_SELF,
  FRAUD_CIRCULAR,
  FRAUD_VELOCITY,
  FRAUD_IP_MATCH,
  FRAUD_DEVICE,
  FRAUD_DISPOSABLE,
  FRAUD_EMAIL_MATCH,
  FRAUD_PHONE_MATCH,
  FRAUD_BLACKLIST,

  IL_TAX_FREE_PER_OCCASION,
  IL_TAX_FREE_ANNUAL_CUMULATIVE,
  IL_VAT_RATE,
  IL_WITHHOLDING_DEFAULT,

  LABELS_HE,
  LABELS_EN,

  // helpers
  isDisposableEmail,
};
