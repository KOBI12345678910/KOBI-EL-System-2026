/* ============================================================================
 * Techno-Kol Uzi mega-ERP — Wire Transfer Approval Workflow
 *                          ניהול העברות בנקאיות חוצות-גבולות
 *
 * Agent AG-Y083 — Swarm 4B — 2026-04-11
 * ----------------------------------------------------------------------------
 * End-to-end wire-transfer workflow and beneficiary database for international
 * (SWIFT / cross-border) payments. Designed for the finance office of a metal-
 * fabrication firm (Techno-Kol Uzi) that pays overseas suppliers, contractors
 * and consultants, alongside its domestic Masav (מס"ב) run.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CRITICAL SAFETY RULES / כללי בטיחות קריטיים
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. THIS MODULE DOES NOT TALK TO BANKS.
 *      The module produces SWIFT MT103 message data and an export file that a
 *      human finance operator carries to the bank portal / branch for
 *      execution. There is NO network call, NO webhook, NO banking API
 *      credential handling, NO ability to move money on its own.
 *      המודול לא מתקשר עם הבנק. הוא מייצר קובץ SWIFT MT103 שהגזבר/ת שמעביר/ה
 *      ידנית לאתר הבנק. אין API, אין webhook, אין אוטומציה סופית.
 *
 *   2. NEVER DELETES (רק משדרגים ומגדלים).
 *      Rejected, cancelled, reversed or failed wires are marked with a
 *      status and annotated with a reason — but the row is never removed.
 *      Each beneficiary, request, approval and audit entry lives forever.
 *
 *   3. DUAL CONTROL + COOLDOWN.
 *      New beneficiaries enter a 24-48h cooldown before the first payment is
 *      allowed. Large wires require two distinct approvers. Both rules exist
 *      specifically to defeat Business-Email-Compromise (BEC) and CEO-fraud
 *      (תרגיל המנכ"ל) scams where attackers pressure the finance clerk to
 *      wire money "urgently" to a freshly-invented supplier.
 *
 *   4. SANCTIONS SCREENING IS LOCAL ONLY.
 *      The sanctions check inside `verifyBeneficiary` compares the
 *      beneficiary against an **in-memory** list the caller seeds
 *      (OFAC / UN / EU / Israeli מעקב). It does NOT phone a SaaS provider.
 *      The finance office is expected to refresh the seeded list on a
 *      defined cadence (weekly) and feed it in via `setSanctionsList`.
 *
 *   5. 2FA IS ENFORCED STRUCTURALLY.
 *      `approveRequest` accepts a `verify2fa` callback at construction; if
 *      none is supplied the default verifier REJECTS every approval. There
 *      is no "skip 2FA" shortcut for convenience.
 *
 *   6. AUDIT TRAIL IS MANDATORY.
 *      Every state transition (create, verify, approve, reject, execute,
 *      reverse, reconcile) writes an immutable entry to `auditLog`. The
 *      caller can read the log but cannot mutate it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PUBLIC API / ממשק ציבורי
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   new WireTransferManager({ clock?, verify2fa?, dualApprovalThreshold?,
 *                             cooldownHours?, rateLimits?, currency? })
 *
 *   addBeneficiary(info)            → beneficiary record
 *   getBeneficiary(id)              → record | null
 *   listBeneficiaries()             → record[]
 *   setSanctionsList(list)          → count loaded
 *   setPepList(list)                → count loaded
 *   setShellCompanyList(list)       → count loaded
 *   verifyBeneficiary(id)           → { verified, findings[], status }
 *   cooldownPeriod(id)              → { active, hoursLeft, readyAt }
 *   createWireRequest(args)         → request record
 *   rateLimit(args)                 → { allowed, reason, reason_he, window }
 *   anomalyDetection(req)           → { flagged, score, reasons[] }
 *   dualApproval(req)               → { required, threshold }
 *   approveRequest(id, approver, tok) → request record
 *   rejectRequest(id, approver, reason) → request record
 *   executeRequest(id)              → { file, message, mt103, status }
 *   swiftMT103Format(id)            → { text, fields, block1..5 }
 *   reverseFailedWire(args)         → reversal record
 *   dailyReconcile(statement?)      → { matched, unmatched, exceptions }
 *   listWireRequests()              → request[]
 *   getWireRequest(id)              → request | null
 *   getAuditLog()                   → entry[]
 *
 * Zero runtime dependencies. Pure CommonJS. Node >= 16.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ───────────────────────────────────────────────────────────────────────
// Constants / קבועים
// ───────────────────────────────────────────────────────────────────────

/**
 * Request lifecycle states. Once entered, a state transition only moves
 * forward — it never rewinds. Failed or rejected states are terminal but
 * can seed a reversal row (which is itself a brand-new request).
 *
 * מצבי בקשת העברה. מצב שהוזן לא חוזר אחורה — רק מתקדם. בקשה שנדחתה/נכשלה
 * היא סופית אך יכולה להוליד בקשת-ביטול חדשה.
 */
const REQUEST_STATUS = Object.freeze({
  DRAFT: 'draft',                 // טיוטה
  PENDING_VERIFY: 'pending_verify', // ממתין לאימות מוטב
  COOLDOWN: 'cooldown',           // בתקופת צינון
  PENDING_APPROVAL: 'pending_approval', // ממתין לאישור
  PENDING_SECOND_APPROVAL: 'pending_second_approval', // ממתין לאישור שני
  APPROVED: 'approved',           // אושר, מוכן להעברה
  EXECUTED: 'executed',           // הקובץ SWIFT הופק
  CONFIRMED: 'confirmed',         // הבנק אישר ביצוע
  REJECTED: 'rejected',           // נדחה
  REVERSED: 'reversed',           // הוחזר / בוטל אחרי שליחה
  FAILED: 'failed',               // נכשל בבנק
});

/**
 * Canonical beneficiary statuses.
 */
const BENEFICIARY_STATUS = Object.freeze({
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  FLAGGED: 'flagged',
  BLOCKED: 'blocked',
});

/**
 * Default dual-approval threshold in ILS. Wires worth more than this
 * require two distinct approvers. Configurable per manager instance.
 */
const DEFAULT_DUAL_APPROVAL_ILS = 50_000;

/**
 * Default cooldown window for freshly-added beneficiaries.
 * The Israeli Banking Supervision guidance (2018) recommends 24-48h;
 * Techno-Kol's policy is 24h for ILS/EU beneficiaries and 48h for any
 * beneficiary outside FATF-compliant jurisdictions.
 */
const DEFAULT_COOLDOWN_HOURS = 24;
const HIGH_RISK_COOLDOWN_HOURS = 48;

/**
 * Jurisdictions that trigger the longer 48h cooldown by default. These
 * are countries Techno-Kol's compliance officer flags as "enhanced due
 * diligence" (EDD) — the list is seeded and can be overridden.
 */
const DEFAULT_HIGH_RISK_COUNTRIES = Object.freeze(new Set([
  'IR', 'KP', 'SY', 'CU', 'MM', 'AF', 'YE', 'BY', 'RU', 'VE',
  'ZW', 'SS', 'LY', 'SD', 'IQ',
]));

/**
 * Default rate-limit windows. These numbers are a sensible mid-market
 * start for a small metal-fab company — larger organizations should
 * override via the constructor.
 *
 *   daily:   ≤ 5 wires / day, ≤ ILS 100k / day
 *   weekly:  ≤ 20 wires / 7d, ≤ ILS 300k / 7d
 *   monthly: ≤ 60 wires / 30d, ≤ ILS 1,000,000 / 30d
 */
const DEFAULT_RATE_LIMITS = Object.freeze({
  daily:   { periodMs: 24 * 3600 * 1000,      maxCount: 5,  maxAmount: 100_000 },
  weekly:  { periodMs: 7 * 24 * 3600 * 1000,  maxCount: 20, maxAmount: 300_000 },
  monthly: { periodMs: 30 * 24 * 3600 * 1000, maxCount: 60, maxAmount: 1_000_000 },
});

/**
 * Anomaly-detection weights (0..1 each, summed, flagged at ≥ 0.5).
 * Tuned deliberately sensitive — false positives are acceptable, false
 * negatives cost the company its cash.
 */
const ANOMALY_WEIGHTS = Object.freeze({
  amountOutlier:       0.35, // amount far from beneficiary's median
  highRiskCountry:     0.25, // beneficiary sits in EDD jurisdiction
  oddHour:             0.10, // request created outside 07:00-20:00 Asia/Jerusalem
  newBeneficiary:      0.20, // beneficiary < 7 days old
  urgent:              0.15, // request flagged urgent
  roundNumber:         0.05, // suspiciously round amount (BEC hallmark)
  purposeKeyword:      0.20, // keywords ("gift", "consultancy", "urgent wire", "agent fee")
  unknownBank:         0.10, // swift BIC not in the approved list
  largeAmount:         0.15, // amount > dual-approval threshold
});

/**
 * SWIFT MT103 is the canonical customer-credit-transfer message format.
 * We implement the core tag set used by Israeli banks — enough for the
 * finance team to cut a file a human operator can upload to the bank's
 * corporate portal. Fields are in the Block-4 user data block.
 *
 *   :20:  Sender's Reference                      ערך ייחוס של השולח
 *   :23B: Bank Operation Code (CRED/SPRI/SSTD)    קוד פעולה בנקאי
 *   :32A: Value Date / Currency / Amount          תאריך ערך / מטבע / סכום
 *   :33B: Currency/Original Amount                מטבע/סכום מקורי
 *   :50K: Ordering Customer                       שולם על ידי
 *   :52A: Ordering Institution (BIC)              מוסד מורה (BIC)
 *   :53B: Sender's Correspondent                  סניף בנק השולח
 *   :57A: Account With Institution (BIC)          בנק המוטב
 *   :59:  Beneficiary Customer (/account + name)  מוטב
 *   :70:  Remittance Information                  פרטי התשלום
 *   :71A: Details of Charges (OUR/SHA/BEN)        חלוקת העמלות
 *   :72:  Sender to Receiver Info                 הערות בין בנקים
 *   :77B: Regulatory Reporting (Israel: BoI code) דיווח רגולטורי (בנק ישראל)
 *
 * Reference: SWIFT Standards MT Customer Payments & Cheques Category 1
 *            Bank of Israel directive 411 (Transfers Abroad).
 */
const MT103_FIELDS = Object.freeze({
  SENDER_REF: '20',
  BANK_OP_CODE: '23B',
  VALUE_DATE_CCY_AMT: '32A',
  ORIG_CCY_AMT: '33B',
  ORDERING_CUSTOMER: '50K',
  ORDERING_INST: '52A',
  SENDER_CORR: '53B',
  ACCT_WITH_INST: '57A',
  BENEFICIARY: '59',
  REMITTANCE: '70',
  CHARGES: '71A',
  SENDER_RCVR_INFO: '72',
  REG_REPORTING: '77B',
});

/**
 * Purpose-of-payment keywords that trip the anomaly detector. Drawn from
 * real BEC case law and the Israel Banking Association's fraud bulletin.
 */
const SUSPICIOUS_PURPOSE_KEYWORDS = Object.freeze([
  'gift', 'donation', 'cash advance', 'agent fee', 'consultancy',
  'urgent wire', 'facilitation', 'commission', 'per ceo', 'per mnkal',
  'מכתב מנכ"ל', 'דחוף מנכ"ל', 'עמלת סוכן', 'מתנה',
  'crypto', 'bitcoin', 'usdt', 'binance', 'escrow release',
]);

// ───────────────────────────────────────────────────────────────────────
// Utility helpers / עזרים
// ───────────────────────────────────────────────────────────────────────

function nowEpoch(clock) {
  if (typeof clock === 'function') return clock();
  return Date.now();
}

/**
 * Deterministic ID generator. Uses crypto.randomUUID if available, else
 * falls back to a time-seeded pseudo-random token (tests inject their
 * own clock to make this deterministic).
 */
function newId(prefix, clock) {
  const t = nowEpoch(clock);
  try {
    const { randomUUID } = require('node:crypto');
    return `${prefix}_${t}_${randomUUID().slice(0, 8)}`;
  } catch {
    const r = Math.floor((t * 1103515245 + 12345) & 0x7fffffff).toString(36);
    return `${prefix}_${t}_${r}`;
  }
}

function cloneDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cloneDeep);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = cloneDeep(obj[k]);
  return out;
}

/**
 * Normalize an IBAN the same way `validators/iban.js` does — pure local
 * copy, deliberately self-contained so the finance module stays zero-dep.
 */
function normalizeIban(iban) {
  if (iban === null || iban === undefined) return '';
  return String(iban).replace(/[\s\u00A0\u200E\u200F]+/g, '').toUpperCase();
}

/**
 * Local ISO-13616 MOD-97 check, implemented the same way as the main
 * iban validator. Kept inline so this module requires nothing outside
 * `node:crypto`.
 *
 * Returns:
 *   { valid: boolean, country: string|null, reason?: string, reason_he?: string }
 */
function validateIbanLocal(iban) {
  if (iban === null || iban === undefined || iban === '') {
    return { valid: false, country: null, reason: 'empty', reason_he: 'IBAN ריק' };
  }
  const clean = normalizeIban(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean) || clean.length < 5 || clean.length > 34) {
    return {
      valid: false,
      country: clean.length >= 2 ? clean.slice(0, 2) : null,
      reason: 'bad_format',
      reason_he: 'פורמט IBAN לא תקין',
    };
  }
  const country = clean.slice(0, 2);
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 48 && code <= 57) numeric += rearranged[i];
    else if (code >= 65 && code <= 90) numeric += String(code - 55);
    else return { valid: false, country, reason: 'bad_chars', reason_he: 'תווים לא חוקיים' };
  }
  let rem;
  try {
    rem = Number(BigInt(numeric) % 97n);
  } catch {
    return { valid: false, country, reason: 'mod97_error', reason_he: 'שגיאה בחישוב MOD-97' };
  }
  if (rem !== 1) {
    return { valid: false, country, reason: 'bad_check_digit', reason_he: 'ספרת ביקורת שגויה' };
  }
  return { valid: true, country, normalized: clean };
}

/**
 * SWIFT BIC validator (ISO 9362). BIC is 8 or 11 characters:
 *   AAAA BB CC [DDD]
 *     └── 4 letters institution
 *           └── 2 letters country
 *                 └── 2 alnum location
 *                       └── optional 3 alnum branch (XXX = head office)
 */
function validateBic(bic) {
  if (!bic) return { valid: false, reason: 'empty', reason_he: 'BIC ריק' };
  const clean = String(bic).replace(/\s+/g, '').toUpperCase();
  if (clean.length !== 8 && clean.length !== 11) {
    return { valid: false, reason: 'bad_length', reason_he: 'אורך BIC חייב להיות 8 או 11' };
  }
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean)) {
    return { valid: false, reason: 'bad_format', reason_he: 'פורמט BIC לא תקין' };
  }
  return {
    valid: true,
    institution: clean.slice(0, 4),
    country: clean.slice(4, 6),
    location: clean.slice(6, 8),
    branch: clean.length === 11 ? clean.slice(8, 11) : 'XXX',
    normalized: clean,
  };
}

/**
 * Simple currency code sanity-check (ISO 4217 alpha-3).
 */
function validateCurrency(ccy) {
  if (!ccy) return false;
  return /^[A-Z]{3}$/.test(String(ccy).toUpperCase());
}

/**
 * Israeli ת.ז (Teudat Zehut) or company-ID check using the canonical
 * mod-10 Luhn-style algorithm used by the Ministry of Interior.
 *
 * Returns true for both 9-digit individual IDs (ת.ז) and 9-digit
 * company IDs (ח.פ) — both use the same checksum scheme.
 */
function validateIsraeliId(id) {
  if (!id) return false;
  const digits = String(id).replace(/\D+/g, '');
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(padded[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    sum += step;
  }
  return sum % 10 === 0;
}

/**
 * Reduce a string or name to a canonical key for sanctions matching.
 * Removes punctuation, collapses whitespace, casefolds. This is a
 * deliberately loose match — sanctions lists must err on the side of
 * false positives.
 */
function sanctionKey(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '') // strip Hebrew cantillation/vowels
    .replace(/[^\w\u0590-\u05FF]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Compute a simple outlier score: how many standard deviations an
 * amount is from the beneficiary's historical median. Returns 0 if
 * there isn't enough history to compute.
 */
function amountOutlierScore(amount, history) {
  if (!Array.isArray(history) || history.length < 3) return 0;
  const sorted = [...history].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return 0;
  const ratio = amount / median;
  // 1x = no anomaly, 3x = moderate, 10x = extreme.
  if (ratio >= 10) return 1;
  if (ratio >= 5)  return 0.8;
  if (ratio >= 3)  return 0.5;
  if (ratio >= 2)  return 0.2;
  return 0;
}

/**
 * Format an ISO date (yyyy-mm-dd) from an epoch time in Asia/Jerusalem.
 * We do this manually (no Intl timezone) so the module stays zero-dep.
 * For SWIFT MT103 :32A: the date is YYMMDD.
 */
function swiftDateYYMMDD(epoch) {
  const d = new Date(epoch);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * SWIFT formats amounts as 15d, with ',' as the decimal separator and
 * no thousand separators. "1234567,89".
 */
function swiftAmount(amount) {
  const whole = Math.trunc(amount);
  const frac = Math.round((amount - whole) * 100);
  const fracStr = String(frac).padStart(2, '0');
  return `${whole},${fracStr}`;
}

// ───────────────────────────────────────────────────────────────────────
// Main class / מחלקה ראשית
// ───────────────────────────────────────────────────────────────────────

/**
 * @class WireTransferManager
 *
 * Self-contained wire transfer workflow + beneficiary master data store.
 * Every operation is append-only; nothing is ever deleted.
 */
class WireTransferManager {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.clock]  Injectable clock for determinism.
   * @param {(requestId, approver, token) => boolean} [opts.verify2fa]
   *        2FA verifier. REJECTS by default — callers must wire their own.
   * @param {number} [opts.dualApprovalThreshold]  Default 50,000 ILS.
   * @param {number} [opts.cooldownHours]          Default 24h.
   * @param {number} [opts.highRiskCooldownHours]  Default 48h.
   * @param {object} [opts.rateLimits]             Override rate limits.
   * @param {string} [opts.baseCurrency]           Default "ILS".
   * @param {string} [opts.orderingCustomer]       SWIFT :50K: line.
   * @param {string} [opts.orderingBic]            SWIFT :52A: BIC.
   * @param {Set<string>} [opts.highRiskCountries] Override EDD list.
   */
  constructor(opts = {}) {
    this._clock = opts.clock || (() => Date.now());
    this._verify2fa = opts.verify2fa || (() => false); // secure default
    this._dualApprovalThreshold = Number.isFinite(opts.dualApprovalThreshold)
      ? opts.dualApprovalThreshold
      : DEFAULT_DUAL_APPROVAL_ILS;
    this._cooldownHours = Number.isFinite(opts.cooldownHours)
      ? opts.cooldownHours
      : DEFAULT_COOLDOWN_HOURS;
    this._highRiskCooldownHours = Number.isFinite(opts.highRiskCooldownHours)
      ? opts.highRiskCooldownHours
      : HIGH_RISK_COOLDOWN_HOURS;
    this._rateLimits = opts.rateLimits
      ? cloneDeep(opts.rateLimits)
      : cloneDeep(DEFAULT_RATE_LIMITS);
    this._baseCurrency = (opts.baseCurrency || 'ILS').toUpperCase();
    this._orderingCustomer = opts.orderingCustomer || 'TECHNO-KOL UZI LTD';
    this._orderingBic = opts.orderingBic || '';
    this._highRiskCountries = opts.highRiskCountries instanceof Set
      ? new Set(opts.highRiskCountries)
      : new Set(DEFAULT_HIGH_RISK_COUNTRIES);

    /** @type {Map<string, object>} */
    this._beneficiaries = new Map();
    /** @type {Map<string, object>} */
    this._requests = new Map();
    /** @type {Array<object>} */
    this._auditLog = [];
    /** @type {Map<string, object>} payment history keyed by beneficiaryId */
    this._paymentHistory = new Map();
    /** @type {Array<object>} */
    this._reversals = [];
    /** @type {Array<object>} */
    this._approvedKnownBics = [];

    /** @type {Set<string>} canonical keys of sanctioned entities */
    this._sanctionsList = new Set();
    /** @type {Set<string>} canonical keys of PEPs */
    this._pepList = new Set();
    /** @type {Set<string>} shell-company canonical keys */
    this._shellList = new Set();
  }

  // ══════════════════════════════════════════════════════════════════
  // Audit trail / יומן ביקורת
  // ══════════════════════════════════════════════════════════════════

  _audit(event, payload) {
    const entry = {
      id: newId('audit', this._clock),
      event,
      ts: nowEpoch(this._clock),
      payload: cloneDeep(payload || {}),
    };
    this._auditLog.push(Object.freeze(entry));
    return entry;
  }

  getAuditLog() {
    // Returns a defensive copy. Callers cannot mutate the real log.
    return this._auditLog.map(cloneDeep);
  }

  // ══════════════════════════════════════════════════════════════════
  // Beneficiary management / ניהול מוטבים
  // ══════════════════════════════════════════════════════════════════

  /**
   * Register a new beneficiary.
   *
   * Required fields: id, name, bank, country.
   * At least one of { swift, iban, account } must be supplied — otherwise
   * there is no way to actually pay the beneficiary.
   *
   * @param {object} info
   * @param {string} info.id
   * @param {string} info.name
   * @param {string} [info['ת.ז']]    Israeli ת.ז (teudat zehut)
   * @param {string} [info.companyId] Israeli ח.פ (company-ID)
   * @param {string} info.bank        Human-readable bank name
   * @param {string} [info.swift]     BIC / SWIFT code
   * @param {string} [info.iban]
   * @param {string} [info.account]   Non-IBAN account #
   * @param {string} info.country     ISO 3166-1 alpha-2
   * @param {string} [info.purpose]   Business purpose in free text
   * @param {string} [info.address]
   */
  addBeneficiary(info) {
    if (!info || typeof info !== 'object') {
      throw new TypeError('addBeneficiary: info object required');
    }
    const { id, name, bank, country } = info;
    if (!id) throw new Error('addBeneficiary: id required');
    if (!name) throw new Error('addBeneficiary: name required');
    if (!bank) throw new Error('addBeneficiary: bank required');
    if (!country || !/^[A-Z]{2}$/.test(String(country).toUpperCase())) {
      throw new Error('addBeneficiary: country required (ISO alpha-2)');
    }
    if (this._beneficiaries.has(id)) {
      throw new Error(`addBeneficiary: id "${id}" already exists — rule: לא מוחקים`);
    }

    const taxId = info['ת.ז'] || info.taxId || info.companyId || null;
    if (taxId && country === 'IL' && !validateIsraeliId(taxId)) {
      throw new Error('addBeneficiary: Israeli ת.ז/ח.פ failed checksum');
    }

    // At least one routing identifier required.
    if (!info.swift && !info.iban && !info.account) {
      throw new Error('addBeneficiary: need swift, iban or account');
    }

    // IBAN validation — if present, it MUST pass ISO 13616.
    let ibanInfo = null;
    if (info.iban) {
      ibanInfo = validateIbanLocal(info.iban);
      if (!ibanInfo.valid) {
        throw new Error(`addBeneficiary: invalid IBAN (${ibanInfo.reason}) — ${ibanInfo.reason_he}`);
      }
    }

    // BIC validation (SWIFT code) — if present, it MUST be well-formed.
    let bicInfo = null;
    if (info.swift) {
      bicInfo = validateBic(info.swift);
      if (!bicInfo.valid) {
        throw new Error(`addBeneficiary: invalid SWIFT/BIC (${bicInfo.reason}) — ${bicInfo.reason_he}`);
      }
      // If both IBAN and BIC provided, their country codes must agree —
      // mismatches are a classic BEC red flag.
      if (ibanInfo && ibanInfo.country && bicInfo.country && ibanInfo.country !== bicInfo.country) {
        throw new Error(
          `addBeneficiary: IBAN country (${ibanInfo.country}) mismatches BIC country (${bicInfo.country})`,
        );
      }
    }

    const now = nowEpoch(this._clock);
    const record = {
      id,
      name,
      taxId: taxId || null,
      bank,
      swift: bicInfo ? bicInfo.normalized : null,
      iban: ibanInfo ? ibanInfo.normalized : (info.iban || null),
      account: info.account || null,
      country: String(country).toUpperCase(),
      purpose: info.purpose || '',
      address: info.address || '',
      status: BENEFICIARY_STATUS.UNVERIFIED,
      verificationFindings: [],
      createdAt: now,
      verifiedAt: null,
      firstPaymentAt: null,
      notes: [],
      history: [], // append-only — every mutation pushes a snapshot here
    };
    this._beneficiaries.set(id, record);
    this._audit('beneficiary.created', { id, name, country, bank });
    return cloneDeep(record);
  }

  getBeneficiary(id) {
    const rec = this._beneficiaries.get(id);
    return rec ? cloneDeep(rec) : null;
  }

  listBeneficiaries() {
    return Array.from(this._beneficiaries.values()).map(cloneDeep);
  }

  /**
   * Add an approved BIC to the "known good" list. Used by anomaly
   * detection to raise a yellow flag when a wire targets a BIC that
   * the company has never transacted with.
   */
  addApprovedBic(bic) {
    const info = validateBic(bic);
    if (info.valid) this._approvedKnownBics.push(info.normalized);
    return info.valid;
  }

  // ══════════════════════════════════════════════════════════════════
  // Sanctions / PEP / Shell lists / רשימות סנקציות
  // ══════════════════════════════════════════════════════════════════

  setSanctionsList(list) {
    this._sanctionsList = new Set();
    if (!Array.isArray(list)) return 0;
    for (const entry of list) {
      const key = sanctionKey(typeof entry === 'string' ? entry : entry.name);
      if (key) this._sanctionsList.add(key);
    }
    this._audit('sanctions.loaded', { count: this._sanctionsList.size });
    return this._sanctionsList.size;
  }

  setPepList(list) {
    this._pepList = new Set();
    if (!Array.isArray(list)) return 0;
    for (const entry of list) {
      const key = sanctionKey(typeof entry === 'string' ? entry : entry.name);
      if (key) this._pepList.add(key);
    }
    this._audit('pep.loaded', { count: this._pepList.size });
    return this._pepList.size;
  }

  setShellCompanyList(list) {
    this._shellList = new Set();
    if (!Array.isArray(list)) return 0;
    for (const entry of list) {
      const key = sanctionKey(typeof entry === 'string' ? entry : entry.name);
      if (key) this._shellList.add(key);
    }
    this._audit('shell.loaded', { count: this._shellList.size });
    return this._shellList.size;
  }

  /**
   * Run sanctions / PEP / shell-company screen on a beneficiary.
   * The screen is an in-memory substring match against the seeded lists
   * — no external API calls.
   *
   *   OFAC     — US Office of Foreign Assets Control (SDN list)
   *   UN       — UN Security Council Consolidated Sanctions List
   *   EU       — EU Consolidated Financial Sanctions List
   *   מעקב      — Israel NBCTF (National Bureau for Counter Terror Financing)
   *               known as "רשימת מעקב" (watch list)
   *
   * Caller is responsible for loading current versions of all four lists
   * via `setSanctionsList` on the scheduled cadence.
   *
   * @param {string} beneficiaryId
   * @returns {{ verified: boolean, findings: string[], status: string }}
   */
  verifyBeneficiary(beneficiaryId) {
    const rec = this._beneficiaries.get(beneficiaryId);
    if (!rec) throw new Error(`verifyBeneficiary: unknown beneficiary "${beneficiaryId}"`);

    const findings = [];
    const keys = [
      sanctionKey(rec.name),
      sanctionKey(rec.taxId),
      sanctionKey(rec.bank),
    ].filter(Boolean);

    // Sanctions — hard block.
    for (const key of keys) {
      for (const entry of this._sanctionsList) {
        if (key.includes(entry) || entry.includes(key)) {
          findings.push(`sanctions_hit:${entry}`);
        }
      }
    }

    // PEP — not an auto-block but requires extra care.
    for (const key of keys) {
      for (const entry of this._pepList) {
        if (key.includes(entry) || entry.includes(key)) {
          findings.push(`pep_hit:${entry}`);
        }
      }
    }

    // Shell-company — flag, don't block.
    for (const key of keys) {
      for (const entry of this._shellList) {
        if (key.includes(entry) || entry.includes(key)) {
          findings.push(`shell_hit:${entry}`);
        }
      }
    }

    // High-risk country is also a finding (EDD trigger).
    if (this._highRiskCountries.has(rec.country)) {
      findings.push(`high_risk_country:${rec.country}`);
    }

    // Persist findings + new status.
    const hasSanction = findings.some((f) => f.startsWith('sanctions_hit:'));
    const nextStatus = hasSanction
      ? BENEFICIARY_STATUS.BLOCKED
      : (findings.length > 0 ? BENEFICIARY_STATUS.FLAGGED : BENEFICIARY_STATUS.VERIFIED);

    rec.history.push({ ts: nowEpoch(this._clock), status: rec.status });
    rec.status = nextStatus;
    rec.verificationFindings = findings;
    rec.verifiedAt = nowEpoch(this._clock);

    this._audit('beneficiary.verified', {
      id: beneficiaryId,
      status: nextStatus,
      findings,
    });

    return {
      verified: !hasSanction,
      findings,
      status: nextStatus,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Cooldown / תקופת צינון
  // ══════════════════════════════════════════════════════════════════

  /**
   * Compute whether a beneficiary is still inside the cooldown window
   * before their first payment is allowed.
   *
   * The cooldown window is 24h by default, 48h for beneficiaries in
   * high-risk (EDD) jurisdictions. Once the beneficiary has been paid
   * even once, the cooldown is permanently lifted — it is a first-time-
   * pay check, not an ongoing throttle (rate-limits do the ongoing job).
   *
   * @param {string} beneficiaryId
   * @returns {{ active: boolean, hoursLeft: number, readyAt: number|null,
   *             reason?: string, reason_he?: string }}
   */
  cooldownPeriod(beneficiaryId) {
    const rec = this._beneficiaries.get(beneficiaryId);
    if (!rec) throw new Error(`cooldownPeriod: unknown beneficiary "${beneficiaryId}"`);

    // Already paid once — cooldown no longer applies.
    if (rec.firstPaymentAt != null) {
      return {
        active: false,
        hoursLeft: 0,
        readyAt: rec.firstPaymentAt,
        reason: 'already_paid',
        reason_he: 'המוטב כבר שולם בעבר — אין צינון נוסף',
      };
    }

    const hours = this._highRiskCountries.has(rec.country)
      ? this._highRiskCooldownHours
      : this._cooldownHours;

    const readyAt = rec.createdAt + hours * 3600 * 1000;
    const now = nowEpoch(this._clock);
    const msLeft = readyAt - now;
    const hoursLeft = Math.max(0, msLeft / 3600 / 1000);
    const active = msLeft > 0;

    return {
      active,
      hoursLeft: Number(hoursLeft.toFixed(4)),
      readyAt: active ? readyAt : rec.createdAt,
      reason: active ? 'cooldown_active' : 'cooldown_cleared',
      reason_he: active
        ? `בתקופת צינון — עוד ${Math.ceil(hoursLeft)} שעות`
        : 'תקופת צינון הסתיימה — אפשר לשלם',
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Rate limiting / velocity / הגבלת מהירות
  // ══════════════════════════════════════════════════════════════════

  /**
   * Check whether a proposed wire fits inside the configured rate-limit
   * windows. Returns { allowed, reason, window }.
   *
   * Each window (daily / weekly / monthly) has its own maxCount and
   * maxAmount ceiling. The caller can also pass a one-off override to
   * reconfigure the limits.
   *
   * @param {object} args
   * @param {string} args.beneficiaryId
   * @param {number} [args.amount]   Amount to test against the ceiling
   * @param {string} [args.period]   'daily'|'weekly'|'monthly' — all checked if omitted
   * @param {number} [args.maxAmount]
   * @param {number} [args.maxCount]
   * @returns {{ allowed: boolean, reason?: string, reason_he?: string, window?: string }}
   */
  rateLimit(args = {}) {
    const { beneficiaryId, amount, period } = args;
    if (!beneficiaryId) {
      return { allowed: false, reason: 'missing_beneficiary', reason_he: 'חסר מזהה מוטב' };
    }

    // Allow caller to patch the limits in place (append-only, of course).
    if (period && (args.maxAmount != null || args.maxCount != null)) {
      const prev = this._rateLimits[period];
      if (!prev) {
        this._rateLimits[period] = {
          periodMs: DEFAULT_RATE_LIMITS[period]?.periodMs || 24 * 3600 * 1000,
          maxCount: args.maxCount,
          maxAmount: args.maxAmount,
        };
      } else {
        this._rateLimits[period] = {
          periodMs: prev.periodMs,
          maxCount: args.maxCount != null ? args.maxCount : prev.maxCount,
          maxAmount: args.maxAmount != null ? args.maxAmount : prev.maxAmount,
        };
      }
      this._audit('rate_limit.updated', { period, maxAmount: args.maxAmount, maxCount: args.maxCount });
    }

    const hist = this._paymentHistory.get(beneficiaryId) || { entries: [] };
    const now = nowEpoch(this._clock);
    const windowsToCheck = period ? [period] : ['daily', 'weekly', 'monthly'];

    for (const w of windowsToCheck) {
      const limit = this._rateLimits[w];
      if (!limit) continue;
      const since = now - limit.periodMs;
      let count = 0;
      let sum = 0;
      for (const e of hist.entries) {
        if (e.at >= since && e.status !== REQUEST_STATUS.REJECTED && e.status !== REQUEST_STATUS.REVERSED) {
          count += 1;
          sum += e.amountIls || 0;
        }
      }
      if (limit.maxCount != null && count + 1 > limit.maxCount) {
        return {
          allowed: false,
          reason: `rate_limit_count:${w}`,
          reason_he: `חריגה בכמות העברות בתקופה (${w})`,
          window: w,
          count,
          limit: limit.maxCount,
        };
      }
      if (limit.maxAmount != null && sum + (amount || 0) > limit.maxAmount) {
        return {
          allowed: false,
          reason: `rate_limit_amount:${w}`,
          reason_he: `חריגה בסכום מצטבר לתקופה (${w})`,
          window: w,
          total: sum,
          limit: limit.maxAmount,
        };
      }
    }

    return { allowed: true, reason: 'ok', reason_he: 'תקין' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Anomaly detection / זיהוי חריגות
  // ══════════════════════════════════════════════════════════════════

  /**
   * Score a request against heuristic anomaly rules. Returns
   *   { flagged, score, reasons }
   * where score ∈ [0..1] and `flagged === score >= 0.5`.
   *
   * @param {object} request
   * @returns {{ flagged: boolean, score: number, reasons: string[] }}
   */
  anomalyDetection(request) {
    if (!request || !request.beneficiaryId) {
      return { flagged: true, score: 1, reasons: ['missing_beneficiary'] };
    }
    const ben = this._beneficiaries.get(request.beneficiaryId);
    if (!ben) {
      return { flagged: true, score: 1, reasons: ['unknown_beneficiary'] };
    }

    const reasons = [];
    let score = 0;

    // 1. Amount outlier vs history
    const hist = this._paymentHistory.get(request.beneficiaryId);
    const amounts = hist ? hist.entries.map((e) => e.amountIls || 0) : [];
    const outlier = amountOutlierScore(request.amountIls || request.amount || 0, amounts);
    if (outlier > 0) {
      const contrib = ANOMALY_WEIGHTS.amountOutlier * outlier;
      score += contrib;
      reasons.push(`amount_outlier:${outlier.toFixed(2)}`);
    }

    // 2. High-risk country
    if (this._highRiskCountries.has(ben.country)) {
      score += ANOMALY_WEIGHTS.highRiskCountry;
      reasons.push(`high_risk_country:${ben.country}`);
    }

    // 3. Odd hour (outside 07:00-20:00 UTC — we deliberately do not
    //    handle DST exactly; the goal is heuristic, not forensic)
    const d = new Date(nowEpoch(this._clock));
    const hr = d.getUTCHours();
    if (hr < 4 || hr >= 18) { // ~07:00-21:00 Asia/Jerusalem wall clock
      score += ANOMALY_WEIGHTS.oddHour;
      reasons.push(`odd_hour:${hr}`);
    }

    // 4. New beneficiary (< 7 days)
    const ageMs = nowEpoch(this._clock) - ben.createdAt;
    if (ageMs < 7 * 24 * 3600 * 1000) {
      score += ANOMALY_WEIGHTS.newBeneficiary;
      reasons.push('new_beneficiary');
    }

    // 5. Urgent flag
    if (request.urgent) {
      score += ANOMALY_WEIGHTS.urgent;
      reasons.push('urgent_flag');
    }

    // 6. Round-number amount (BEC hallmark)
    const amt = request.amountIls || request.amount || 0;
    if (amt >= 10_000 && amt % 1000 === 0) {
      score += ANOMALY_WEIGHTS.roundNumber;
      reasons.push('round_amount');
    }

    // 7. Purpose keywords
    const purpose = String(request.purpose || '').toLowerCase();
    for (const kw of SUSPICIOUS_PURPOSE_KEYWORDS) {
      if (purpose.includes(String(kw).toLowerCase())) {
        score += ANOMALY_WEIGHTS.purposeKeyword;
        reasons.push(`purpose_keyword:${kw}`);
        break;
      }
    }

    // 8. Unknown BIC
    if (ben.swift && this._approvedKnownBics.length > 0 &&
        !this._approvedKnownBics.includes(ben.swift)) {
      score += ANOMALY_WEIGHTS.unknownBank;
      reasons.push('unknown_bic');
    }

    // 9. Large amount
    if (amt > this._dualApprovalThreshold) {
      score += ANOMALY_WEIGHTS.largeAmount;
      reasons.push('large_amount');
    }

    // Clamp and decide
    score = Math.min(1, Number(score.toFixed(3)));
    return { flagged: score >= 0.5, score, reasons };
  }

  // ══════════════════════════════════════════════════════════════════
  // Dual approval / אישור כפול
  // ══════════════════════════════════════════════════════════════════

  /**
   * Returns whether a request requires two distinct approvers.
   * @param {object} request
   * @returns {{ required: boolean, threshold: number, amountIls: number }}
   */
  dualApproval(request) {
    const amt = Number(request && (request.amountIls || request.amount) || 0);
    return {
      required: amt > this._dualApprovalThreshold,
      threshold: this._dualApprovalThreshold,
      amountIls: amt,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Request lifecycle / מחזור חיי בקשה
  // ══════════════════════════════════════════════════════════════════

  /**
   * Create a new wire-transfer request. Does NOT approve anything — the
   * request starts in DRAFT and moves forward as the workflow runs.
   *
   * If the beneficiary is still in cooldown OR un-verified OR blocked,
   * the request is still created but with a blocking status so the UI
   * can show the user why they can't advance it.
   *
   * @param {object} args
   * @param {string} args.beneficiaryId
   * @param {number} args.amount        In `currency`
   * @param {string} args.currency      ISO 4217 alpha-3
   * @param {string} args.purpose       Free text
   * @param {string} [args.invoice]     Invoice number / reference
   * @param {boolean} [args.urgent]     Urgency flag
   * @param {number} [args.fxRate]      Optional FX rate to base currency
   */
  createWireRequest(args) {
    if (!args || typeof args !== 'object') {
      throw new TypeError('createWireRequest: args required');
    }
    const { beneficiaryId, amount, currency, purpose } = args;
    if (!beneficiaryId) throw new Error('createWireRequest: beneficiaryId required');
    const ben = this._beneficiaries.get(beneficiaryId);
    if (!ben) throw new Error(`createWireRequest: unknown beneficiary "${beneficiaryId}"`);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('createWireRequest: amount must be positive number');
    }
    if (!validateCurrency(currency)) {
      throw new Error(`createWireRequest: invalid currency "${currency}"`);
    }
    if (!purpose || String(purpose).trim() === '') {
      throw new Error('createWireRequest: purpose required (SWIFT :70: field)');
    }

    const ccy = String(currency).toUpperCase();
    const fxRate = Number.isFinite(args.fxRate) ? args.fxRate : (ccy === this._baseCurrency ? 1 : null);
    const amountIls = fxRate != null ? Number((amount * fxRate).toFixed(2)) : null;

    const now = nowEpoch(this._clock);
    const id = newId('wire', this._clock);

    // Determine initial status — the workflow walks forward from here.
    let status = REQUEST_STATUS.DRAFT;
    const blockReasons = [];

    if (ben.status === BENEFICIARY_STATUS.UNVERIFIED) {
      status = REQUEST_STATUS.PENDING_VERIFY;
      blockReasons.push('beneficiary_unverified');
    } else if (ben.status === BENEFICIARY_STATUS.BLOCKED) {
      status = REQUEST_STATUS.REJECTED;
      blockReasons.push('beneficiary_blocked');
    }

    const cooldown = this.cooldownPeriod(beneficiaryId);
    if (cooldown.active) {
      status = REQUEST_STATUS.COOLDOWN;
      blockReasons.push('cooldown_active');
    }

    // If nothing is blocking, move straight to pending approval.
    if (status === REQUEST_STATUS.DRAFT) {
      status = REQUEST_STATUS.PENDING_APPROVAL;
    }

    const request = {
      id,
      beneficiaryId,
      amount: Number(amount),
      currency: ccy,
      fxRate,
      amountIls,
      purpose: String(purpose).trim(),
      invoice: args.invoice || '',
      urgent: !!args.urgent,
      status,
      blockReasons,
      createdAt: now,
      approvals: [],      // each = { approver, ts, token, role }
      rejections: [],     // each = { approver, ts, reason }
      executedAt: null,
      confirmedAt: null,
      reversedAt: null,
      mt103: null,
      bankRef: null,
      history: [{ ts: now, status, note: 'created' }],
      anomaly: null,
    };

    // Run anomaly detection eagerly so the UI can warn the requester.
    request.anomaly = this.anomalyDetection({
      beneficiaryId,
      amount,
      amountIls,
      purpose,
      urgent: request.urgent,
    });

    this._requests.set(id, request);
    this._audit('request.created', {
      id,
      beneficiaryId,
      amount,
      currency: ccy,
      status,
      anomalyFlagged: request.anomaly.flagged,
    });

    return cloneDeep(request);
  }

  getWireRequest(id) {
    const rec = this._requests.get(id);
    return rec ? cloneDeep(rec) : null;
  }

  listWireRequests() {
    return Array.from(this._requests.values()).map(cloneDeep);
  }

  /**
   * Approve (or partially approve, for dual-approval wires) a request.
   * 2FA is required — the constructor-provided `verify2fa` callback is
   * called. If it returns anything falsy, the approval is rejected.
   *
   * @param {string} requestId
   * @param {string} approver   Approver user id — must be distinct
   *                            from any previous approver on this request.
   * @param {string} token2fa   One-time code
   * @returns {object}          Updated request snapshot
   */
  approveRequest(requestId, approver, token2fa) {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`approveRequest: unknown request "${requestId}"`);
    if (!approver) throw new Error('approveRequest: approver required');
    if (req.status === REQUEST_STATUS.EXECUTED ||
        req.status === REQUEST_STATUS.CONFIRMED ||
        req.status === REQUEST_STATUS.REJECTED ||
        req.status === REQUEST_STATUS.REVERSED ||
        req.status === REQUEST_STATUS.FAILED) {
      throw new Error(`approveRequest: cannot approve request in terminal state "${req.status}"`);
    }
    if (req.status === REQUEST_STATUS.COOLDOWN) {
      // Re-check: may have elapsed since creation.
      const cd = this.cooldownPeriod(req.beneficiaryId);
      if (cd.active) {
        throw new Error(`approveRequest: beneficiary still in cooldown — ${Math.ceil(cd.hoursLeft)}h left`);
      }
      req.status = REQUEST_STATUS.PENDING_APPROVAL;
    }
    if (req.status === REQUEST_STATUS.PENDING_VERIFY) {
      throw new Error('approveRequest: beneficiary not verified yet');
    }

    // 2FA check — hard requirement
    const tokOk = !!this._verify2fa(requestId, approver, token2fa);
    if (!tokOk) {
      this._audit('approve.2fa_rejected', { requestId, approver });
      throw new Error('approveRequest: 2FA token rejected');
    }

    // Prevent same approver reused for dual approval.
    if (req.approvals.some((a) => a.approver === approver)) {
      throw new Error(`approveRequest: approver "${approver}" already approved this request — dual approval requires distinct users`);
    }

    const now = nowEpoch(this._clock);
    req.approvals.push({ approver, ts: now, role: req.approvals.length === 0 ? 'primary' : 'secondary' });

    const dual = this.dualApproval(req);
    if (dual.required && req.approvals.length < 2) {
      req.status = REQUEST_STATUS.PENDING_SECOND_APPROVAL;
    } else {
      req.status = REQUEST_STATUS.APPROVED;
    }

    req.history.push({ ts: now, status: req.status, note: `approved by ${approver}` });
    this._audit('request.approved', {
      id: requestId,
      approver,
      status: req.status,
      approvalCount: req.approvals.length,
    });
    return cloneDeep(req);
  }

  rejectRequest(requestId, approver, reason) {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`rejectRequest: unknown request "${requestId}"`);
    if (req.status === REQUEST_STATUS.EXECUTED ||
        req.status === REQUEST_STATUS.CONFIRMED) {
      throw new Error(`rejectRequest: cannot reject a request that already executed`);
    }
    const now = nowEpoch(this._clock);
    req.rejections.push({ approver, ts: now, reason: reason || 'no_reason' });
    req.status = REQUEST_STATUS.REJECTED;
    req.history.push({ ts: now, status: REQUEST_STATUS.REJECTED, note: `rejected: ${reason || ''}` });
    this._audit('request.rejected', { id: requestId, approver, reason });
    return cloneDeep(req);
  }

  /**
   * Execute an approved request. **Does NOT send anything to the bank.**
   * Produces a SWIFT MT103 message plus an export envelope a human
   * finance operator manually uploads to the bank's corporate portal.
   *
   * @param {string} requestId
   * @returns {{ file: string, message: string, mt103: object, status: string }}
   */
  executeRequest(requestId) {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`executeRequest: unknown request "${requestId}"`);
    if (req.status !== REQUEST_STATUS.APPROVED) {
      throw new Error(`executeRequest: request status "${req.status}" — must be approved`);
    }

    // Rate-limit gate — run once more at execute-time, because time has
    // passed since creation and another wire may have slipped through.
    const rl = this.rateLimit({
      beneficiaryId: req.beneficiaryId,
      amount: req.amountIls || req.amount,
    });
    if (!rl.allowed) {
      req.status = REQUEST_STATUS.REJECTED;
      req.rejections.push({
        approver: 'SYSTEM',
        ts: nowEpoch(this._clock),
        reason: `rate_limit:${rl.reason}`,
      });
      this._audit('request.rejected', { id: requestId, reason: `rate_limit:${rl.reason}` });
      throw new Error(`executeRequest: rate limit exceeded (${rl.reason})`);
    }

    const mt103 = this._buildMt103Fields(req);
    const mt103Text = this._buildMt103Text(mt103);

    const now = nowEpoch(this._clock);
    req.mt103 = mt103;
    req.executedAt = now;
    req.status = REQUEST_STATUS.EXECUTED;
    req.history.push({ ts: now, status: REQUEST_STATUS.EXECUTED, note: 'swift_file_generated' });

    // Record payment in beneficiary history (so rate-limit works).
    const hist = this._paymentHistory.get(req.beneficiaryId) || { entries: [] };
    hist.entries.push({
      at: now,
      requestId,
      amountIls: req.amountIls || req.amount,
      currency: req.currency,
      status: REQUEST_STATUS.EXECUTED,
    });
    this._paymentHistory.set(req.beneficiaryId, hist);

    // Mark beneficiary firstPaymentAt so cooldown dissolves next time.
    const ben = this._beneficiaries.get(req.beneficiaryId);
    if (ben && ben.firstPaymentAt == null) {
      ben.history.push({ ts: now, note: 'first_payment' });
      ben.firstPaymentAt = now;
    }

    this._audit('request.executed', {
      id: requestId,
      beneficiaryId: req.beneficiaryId,
      amount: req.amount,
      currency: req.currency,
    });

    // The "file" is just the MT103 text wrapped in a filename convention
    // the finance operator can save to disk and upload to the bank.
    const filename = `MT103_${req.id}_${swiftDateYYMMDD(now)}.txt`;

    return {
      file: filename,
      message: mt103Text,
      mt103: cloneDeep(mt103),
      status: REQUEST_STATUS.EXECUTED,
      safetyNotice:
        'SAFETY: This file is NOT transmitted. A human finance operator must ' +
        'carry it to the bank portal for execution. / ' +
        'אזהרה: הקובץ לא נשלח אוטומטית — פעולה ידנית של גזבר/ת נדרשת.',
    };
  }

  /**
   * Build the MT103 field dictionary from a request. Separated so tests
   * can call it without firing the side-effects of executeRequest.
   */
  _buildMt103Fields(req) {
    const ben = this._beneficiaries.get(req.beneficiaryId);
    if (!ben) throw new Error('mt103: beneficiary missing');

    const valueDate = swiftDateYYMMDD(nowEpoch(this._clock));
    const amountStr = swiftAmount(req.amount);
    const fields = {};
    fields[MT103_FIELDS.SENDER_REF] = req.id.slice(0, 16); // max 16 chars
    fields[MT103_FIELDS.BANK_OP_CODE] = req.urgent ? 'SPRI' : 'CRED';
    fields[MT103_FIELDS.VALUE_DATE_CCY_AMT] = `${valueDate}${req.currency}${amountStr}`;
    if (req.fxRate && req.currency !== this._baseCurrency) {
      fields[MT103_FIELDS.ORIG_CCY_AMT] = `${req.currency}${amountStr}`;
    }
    fields[MT103_FIELDS.ORDERING_CUSTOMER] = this._orderingCustomer.slice(0, 35);
    if (this._orderingBic) {
      fields[MT103_FIELDS.ORDERING_INST] = this._orderingBic;
    }
    if (ben.swift) {
      fields[MT103_FIELDS.ACCT_WITH_INST] = ben.swift;
    }
    const benAcct = ben.iban || ben.account || '';
    fields[MT103_FIELDS.BENEFICIARY] = `/${benAcct}\n${ben.name.slice(0, 35)}`;
    fields[MT103_FIELDS.REMITTANCE] =
      (req.purpose + (req.invoice ? ` /INV/${req.invoice}` : '')).slice(0, 140);
    fields[MT103_FIELDS.CHARGES] = 'SHA';
    if (req.currency !== this._baseCurrency) {
      // Israeli regulatory reporting / דיווח לבנק ישראל
      fields[MT103_FIELDS.REG_REPORTING] =
        `/BENEFRES/${ben.country}//${(req.purpose || '').slice(0, 60)}`;
    }
    return fields;
  }

  /**
   * Render the MT103 fields to the canonical colon-prefixed layout used
   * inside Block 4 of the SWIFT message envelope.
   *
   * Output is intentionally plain text:
   *
   *   :20:WIRE123
   *   :23B:CRED
   *   :32A:260411USD12345,67
   *   ...
   */
  _buildMt103Text(fields) {
    const order = [
      MT103_FIELDS.SENDER_REF,
      MT103_FIELDS.BANK_OP_CODE,
      MT103_FIELDS.VALUE_DATE_CCY_AMT,
      MT103_FIELDS.ORIG_CCY_AMT,
      MT103_FIELDS.ORDERING_CUSTOMER,
      MT103_FIELDS.ORDERING_INST,
      MT103_FIELDS.SENDER_CORR,
      MT103_FIELDS.ACCT_WITH_INST,
      MT103_FIELDS.BENEFICIARY,
      MT103_FIELDS.REMITTANCE,
      MT103_FIELDS.CHARGES,
      MT103_FIELDS.SENDER_RCVR_INFO,
      MT103_FIELDS.REG_REPORTING,
    ];
    const lines = [];
    for (const tag of order) {
      if (fields[tag] != null && fields[tag] !== '') {
        lines.push(`:${tag}:${fields[tag]}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Public SWIFT accessor — returns a structured object. Safe to call
   * on a request in state APPROVED or EXECUTED; the MT103 is rebuilt
   * on demand so the caller always gets a fresh view.
   *
   * @param {string} requestId
   * @returns {{ text: string, fields: object, block1: string, block2: string,
   *             block3: string, block4: string, block5: string }}
   */
  swiftMT103Format(requestId) {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`swiftMT103Format: unknown request "${requestId}"`);
    const fields = this._buildMt103Fields(req);
    const block4Body = this._buildMt103Text(fields);

    // SWIFT message envelope blocks (see FIN User Handbook).
    //   {1: Basic Header}        sender address, session
    //   {2: Application Header}  MT class / receiver / priority
    //   {3: User Header}         optional tags (UUID, PDE, etc.)
    //   {4: Text Block}          the actual :20:..:77B: payload
    //   {5: Trailer}             MAC/CHK
    //
    // We fill only what a human operator needs to *preview*; the bank
    // portal generates real MAC/CHK when the operator uploads.
    const senderBic = (this._orderingBic || 'POALILITXXX').padEnd(12, 'X').slice(0, 12);
    const receiverBic = (req.beneficiaryId && this._beneficiaries.get(req.beneficiaryId)?.swift) || 'XXXXXXXX';
    const recvPadded = receiverBic.padEnd(12, 'X').slice(0, 12);
    const block1 = `{1:F01${senderBic}0000000000}`;
    const block2 = `{2:I103${recvPadded}N}`;
    const block3 = `{3:{108:${req.id.slice(0, 16)}}}`;
    const block4 = `{4:\n${block4Body}\n-}`;
    const block5 = `{5:{CHK:000000000000}}`;

    return {
      text: `${block1}${block2}${block3}${block4}${block5}`,
      fields: cloneDeep(fields),
      block1,
      block2,
      block3,
      block4,
      block5,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Reversal / ביטול / reclaim
  // ══════════════════════════════════════════════════════════════════

  /**
   * Record a reversal / reclaim for a failed or fraudulent wire.
   *
   * The module cannot actually reverse a wire — once a SWIFT message
   * has hit the correspondent network, only the receiving bank can
   * return funds (RTGS reversal or MT192/MT292 "Request for Cancellation
   * of Previous Payment"). What we do:
   *
   *   1. Flip the original request to status REVERSED.
   *   2. Record a reversal entry with the reason and the reclaim process
   *      the operator must follow (MT192 draft, contact points, SLA).
   *   3. Audit-log everything; never delete.
   *
   * @param {object} args
   * @param {string} args.wireId
   * @param {string} args.reason
   * @param {string} [args.reclaimProcess]
   */
  reverseFailedWire(args) {
    const { wireId, reason } = args || {};
    if (!wireId) throw new Error('reverseFailedWire: wireId required');
    if (!reason) throw new Error('reverseFailedWire: reason required');
    const req = this._requests.get(wireId);
    if (!req) throw new Error(`reverseFailedWire: unknown wireId "${wireId}"`);
    if (req.status !== REQUEST_STATUS.EXECUTED &&
        req.status !== REQUEST_STATUS.CONFIRMED &&
        req.status !== REQUEST_STATUS.FAILED) {
      throw new Error(`reverseFailedWire: request status "${req.status}" not reversible`);
    }

    const now = nowEpoch(this._clock);
    const reversalId = newId('reversal', this._clock);
    const reclaimProcess = args.reclaimProcess || [
      '1. Notify the sending bank (Techno-Kol corporate desk).',
      '2. Draft MT192 Request for Cancellation citing original :20:.',
      '3. Wait up to 10 business days for the MT196 answer.',
      '4. If funds are returned, reconcile against the original request ID.',
      '5. If rejected, escalate to legal and open a police case if fraud suspected.',
    ];
    const reversal = {
      id: reversalId,
      wireId,
      reason,
      reclaimProcess,
      ts: now,
      status: 'pending_bank_return',
    };
    this._reversals.push(reversal);

    req.status = REQUEST_STATUS.REVERSED;
    req.reversedAt = now;
    req.history.push({ ts: now, status: REQUEST_STATUS.REVERSED, note: `reversed: ${reason}` });

    this._audit('request.reversed', { id: wireId, reversalId, reason });
    return cloneDeep(reversal);
  }

  // ══════════════════════════════════════════════════════════════════
  // Daily reconciliation / פיוס יומי מול הבנק
  // ══════════════════════════════════════════════════════════════════

  /**
   * Match executed / confirmed wires against a bank statement. The
   * statement is an array of { ref, amount, currency, date, status }
   * rows the finance clerk downloads from the corporate banking portal.
   *
   * Matches are:
   *   - exact: request id present as the statement's ref
   *   - fuzzy: amount+currency+date-within-1 match
   *
   * @param {Array<object>} [statement]
   */
  dailyReconcile(statement = []) {
    const matched = [];
    const unmatched = [];
    const exceptions = [];

    const toReconcile = Array.from(this._requests.values())
      .filter((r) => r.status === REQUEST_STATUS.EXECUTED || r.status === REQUEST_STATUS.CONFIRMED);

    for (const req of toReconcile) {
      let hit = null;
      for (const row of statement) {
        if (row.ref && req.id && row.ref.includes(req.id.slice(0, 16))) {
          hit = row;
          break;
        }
      }
      if (!hit) {
        for (const row of statement) {
          const sameAmt = Math.abs((row.amount || 0) - req.amount) < 0.01;
          const sameCcy = String(row.currency || '').toUpperCase() === req.currency;
          if (sameAmt && sameCcy) {
            hit = row;
            break;
          }
        }
      }
      if (hit) {
        if (req.status !== REQUEST_STATUS.CONFIRMED) {
          req.status = REQUEST_STATUS.CONFIRMED;
          req.confirmedAt = nowEpoch(this._clock);
          req.bankRef = hit.ref || null;
          req.history.push({
            ts: nowEpoch(this._clock),
            status: REQUEST_STATUS.CONFIRMED,
            note: `reconciled against ${hit.ref || '(no-ref)'}`,
          });
        }
        matched.push({ requestId: req.id, statementRow: hit });
      } else {
        unmatched.push({ requestId: req.id, amount: req.amount, currency: req.currency });
      }
    }

    // Rows in the statement that do not match any request are exceptions
    // (possibly duplicate sends or rogue outgoing wires).
    for (const row of statement) {
      const ref = row.ref || '';
      const knownMatch = matched.some((m) => m.statementRow === row);
      if (!knownMatch) {
        const maybe = toReconcile.find((r) => ref && ref.includes(r.id.slice(0, 16)));
        if (!maybe) exceptions.push({ statementRow: row, reason: 'no_matching_request' });
      }
    }

    this._audit('reconcile.daily', {
      matched: matched.length,
      unmatched: unmatched.length,
      exceptions: exceptions.length,
    });

    return { matched, unmatched, exceptions };
  }
}

// ───────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────

module.exports = {
  WireTransferManager,
  // Static helpers re-exported for callers and tests
  REQUEST_STATUS,
  BENEFICIARY_STATUS,
  MT103_FIELDS,
  DEFAULT_DUAL_APPROVAL_ILS,
  DEFAULT_COOLDOWN_HOURS,
  HIGH_RISK_COOLDOWN_HOURS,
  DEFAULT_HIGH_RISK_COUNTRIES,
  DEFAULT_RATE_LIMITS,
  ANOMALY_WEIGHTS,
  SUSPICIOUS_PURPOSE_KEYWORDS,
  validateIbanLocal,
  validateBic,
  validateIsraeliId,
  sanctionKey,
  swiftAmount,
  swiftDateYYMMDD,
};
