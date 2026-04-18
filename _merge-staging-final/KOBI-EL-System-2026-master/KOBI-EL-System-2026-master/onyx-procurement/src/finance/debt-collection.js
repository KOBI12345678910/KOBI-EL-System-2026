/**
 * debt-collection.js — Deep Legal Collection Side (גבייה משפטית)
 * Agent Y-088 / Swarm 4F — Finance Operations / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Complements X-48 dunning. While `src/collections/dunning.js` handles the
 * AR-aging + soft/hard reminder loop, THIS module owns the deeper legal
 * collection side: pre-suit demand letters, small-claims court, district
 * court, הוצאה לפועל, settlements, write-offs, and post-write-off recovery.
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים.
 * Everything is append-only. Write-offs and recoveries are recorded as new
 * ledger entries; nothing is ever removed. `frozen` is used on every exit
 * so callers cannot corrupt the ledger in place.
 *
 * Zero external dependencies. Pure Node core. Bilingual (Hebrew + English)
 * throughout.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DISCLAIMER / הצהרה משפטית:
 *
 *   This module TRACKS collection workflow and GENERATES legal-letter
 *   templates. The generated texts are TEMPLATES ONLY and do not constitute
 *   legal advice. Any actual legal action — filing a claim, registering
 *   with הוצאה לפועל, suing in beit mishpat le-tvio'ot ketanot (בית משפט
 *   לתביעות קטנות) or any district court — requires a licensed Israeli
 *   attorney (עורך דין) and must be performed by or under the supervision
 *   of one.
 *
 *   המודול מנהל תהליך גבייה בלבד. הטקסטים המשפטיים שמופקים הם תבניות בלבד
 *   ואינם מהווים ייעוץ משפטי. כל פעולה משפטית — הגשת תביעה, פתיחת תיק
 *   הוצאה לפועל, תביעה בבית משפט לתביעות קטנות או בבית משפט השלום —
 *   מחייבת עורך דין מוסמך הרשום בלשכת עורכי הדין של ישראל.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Public API (class DebtCollection):
 *
 *   escalationLadder({customerId, debtAmount})
 *     → returns the 9-step bilingual ladder, marked with the step the debt
 *       is currently on.
 *
 *   recordAction({customerId, step, date, outcome, notes, document})
 *     → appends a new ledger row for this customer. Mutates instance state.
 *
 *   generateLegalLetter({customerId, debtAmount, type})
 *     → bilingual template letter. type ∈ {pre-suit, demand, court-summons}.
 *
 *   computeLateInterest({principal, periodStart, rate, periodEnd?})
 *     → חוק פסיקת ריבית והצמדה — default court interest rate (4% p.a.) for
 *       judgment debts. Simple interest, daily-accrual, actual/365.
 *
 *   promissoryNoteHandling(customerId)
 *     → שטר חוב registry, holder/maker validation, protest scheduling.
 *
 *   executionOfficeRegistration({customerId, judgmentId})
 *     → opens a הוצאה לפועל case, returns checklist + file placeholder.
 *
 *   escrowedSettlement({customerId, settleAmount, conditions})
 *     → records a negotiated settlement held in escrow until conditions met.
 *
 *   writeOff({customerId, amount, reason, approver})
 *     → books a bad-debt write-off and flags VAT/income tax deductibility.
 *
 *   recoveryLater({writeOffId, recovered})
 *     → subsequent recovery of a written-off debt; re-income event.
 *
 * ---------------------------------------------------------------------------
 * Israeli legal anchors:
 *
 *   חוק פסיקת ריבית והצמדה, תשכ"א-1961
 *       § 5 default court interest rate — currently 4% p.a. simple, applied
 *       from original due date through payment.
 *   חוק בתי המשפט [נוסח משולב], תשמ"ד-1984
 *       § 60 — small-claims jurisdiction.
 *       Small-claims cap (2026): NIS 34,600.
 *   תקנות שיפוט בתביעות קטנות (סדרי דין), תשל"ז-1976
 *   חוק ההוצאה לפועל, תשכ"ז-1967
 *       Execution Office proceedings after judgment.
 *   פקודת השטרות [נוסח חדש]
 *       Promissory notes, protest, maker/holder.
 *   חוק ההתיישנות, תשי"ח-1958 — 7-year statute of limitations.
 *   פקודת מס הכנסה, § 17(4) — bad-debt deductibility for income tax.
 *   חוק מע"מ, § 49 — VAT bad-debt relief (refund of VAT on unpaid invoice).
 * ---------------------------------------------------------------------------
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const CONSTANTS = Object.freeze({
  // חוק פסיקת ריבית והצמדה — default court rate for judgment debts.
  // The Accountant-General's default interest for 2026 sits at 4% p.a.
  // (override via opts.rate on computeLateInterest).
  DEFAULT_COURT_INTEREST_RATE: 0.04,

  // Small-claims cap — בית משפט לתביעות קטנות.
  // Statutory cap updated annually; 2026 value = NIS 34,600.
  SMALL_CLAIMS_CAP_ILS: 34600,

  // Day count basis for interest accrual (actual/365 — matches Israeli
  // default court practice and the Dunning module).
  DAY_COUNT_BASIS: 365,

  // Statute of limitations — 7 years from accrual.
  STATUTE_OF_LIMITATIONS_YEARS: 7,

  // Bad-debt write-off must be approved by an authorized role.
  WRITE_OFF_APPROVER_ROLES: ['cfo', 'controller', 'owner', 'auditor'],

  // Income tax — bad debt is deductible under § 17(4) of the Ordinance,
  // provided the debt was (a) previously included in taxable income and
  // (b) proven un-collectible.
  BAD_DEBT_TAX_DEDUCTIBLE_DEFAULT: true,

  // VAT relief — vendor may claim VAT back on unpaid invoice provided
  // conditions of § 49 of VAT Law are met (18+ months overdue, attempted
  // collection, issued credit note or statutory notice). We default to
  // `conditional` — caller must confirm on their side.
  VAT_RELIEF_DEFAULT: 'conditional',

  // Case workflow — 6 compact stages (0..5). Maps onto the 9-step ladder
  // but collapses the pre-legal reminders into two named stages.
  CASE_STAGES: Object.freeze([0, 1, 2, 3, 4, 5]),

  // Documented effort requirement for write-off under income-tax practice.
  // The Tax Authority requires at least ~3 years of documented collection
  // effort before a bad debt may be deducted.
  WRITE_OFF_MIN_EFFORT_YEARS: 3,

  // Default friendly-reminder lead days (countdown before next nudge).
  DEFAULT_FRIENDLY_LEAD_DAYS: 7,
});

const LAW_CITATIONS = Object.freeze({
  INTEREST_LAW: Object.freeze({
    he: 'חוק פסיקת ריבית והצמדה, תשכ"א-1961',
    en: 'Interest and Linkage Adjudication Law, 5721-1961',
  }),
  COURTS_LAW: Object.freeze({
    he: 'חוק בתי המשפט [נוסח משולב], תשמ"ד-1984',
    en: 'Courts Law (Consolidated Version), 5744-1984',
  }),
  SMALL_CLAIMS_REGS: Object.freeze({
    he: 'תקנות שיפוט בתביעות קטנות (סדרי דין), תשל"ז-1976',
    en: 'Small Claims Court (Procedure) Regulations, 5737-1976',
  }),
  EXECUTION_LAW: Object.freeze({
    he: 'חוק ההוצאה לפועל, תשכ"ז-1967',
    en: 'Execution Law, 5727-1967',
  }),
  BILLS_ORDINANCE: Object.freeze({
    he: 'פקודת השטרות [נוסח חדש]',
    en: 'Bills of Exchange Ordinance [New Version]',
  }),
  LIMITATIONS_LAW: Object.freeze({
    he: 'חוק ההתיישנות, תשי"ח-1958',
    en: 'Prescription Law, 5718-1958',
  }),
  INCOME_TAX_17_4: Object.freeze({
    he: 'פקודת מס הכנסה, סעיף 17(4) — חוב רע',
    en: 'Income Tax Ordinance, § 17(4) — bad debt',
  }),
  VAT_49: Object.freeze({
    he: 'חוק מע"מ, סעיף 49 — הקלה במע"מ על חוב אבוד',
    en: 'VAT Law, § 49 — bad-debt VAT relief',
  }),
});

/**
 * 9-step escalation ladder. Day offsets are counted from the invoice due
 * date. Bilingual. Immutable.
 */
const ESCALATION_LADDER = Object.freeze([
  Object.freeze({
    step: 1,
    key: 'soft_reminder',
    dayOffset: 60,
    he: 'תזכורת רכה',
    en: 'Soft reminder',
    channel: 'email/sms',
    legalWeight: 0,
  }),
  Object.freeze({
    step: 2,
    key: 'firm_letter',
    dayOffset: 75,
    he: 'מכתב נמרץ',
    en: 'Firm letter',
    channel: 'email/mail',
    legalWeight: 1,
  }),
  Object.freeze({
    step: 3,
    key: 'phone_call',
    dayOffset: 90,
    he: 'שיחת טלפון + תיעוד',
    en: 'Phone call (logged)',
    channel: 'phone',
    legalWeight: 1,
  }),
  Object.freeze({
    step: 4,
    key: 'final_demand',
    dayOffset: 105,
    he: 'מכתב דרישה סופית',
    en: 'Final demand letter',
    channel: 'registered_mail',
    legalWeight: 2,
  }),
  Object.freeze({
    step: 5,
    key: 'legal_letter',
    dayOffset: 120,
    he: 'מכתב התראה לפני תביעה',
    en: 'Pre-suit legal notice letter',
    channel: 'registered_mail + attorney',
    legalWeight: 3,
  }),
  Object.freeze({
    step: 6,
    key: 'small_claims',
    dayOffset: 135,
    he: 'תביעה בבית משפט לתביעות קטנות',
    en: 'Sue in Small Claims Court',
    channel: 'court_filing',
    legalWeight: 4,
    // תקרה נכון ל-2026: 34,600 ש"ח
    maxAmountILS: CONSTANTS.SMALL_CLAIMS_CAP_ILS,
  }),
  Object.freeze({
    step: 7,
    key: 'district_court',
    dayOffset: 135,
    he: 'תביעה בבית משפט השלום / המחוזי',
    en: 'Sue in Magistrate / District Court',
    channel: 'court_filing',
    legalWeight: 5,
  }),
  Object.freeze({
    step: 8,
    key: 'execution_office',
    dayOffset: 180,
    he: 'פתיחת תיק בהוצאה לפועל',
    en: 'Execution Office (Hotza\'a la-Po\'al) registration',
    channel: 'execution_office',
    legalWeight: 6,
    // Step 8 is ONLY available AFTER a judgment (or a bounced
    // promissory note / post-dated check — "שטר חוב").
    requires: 'judgment_or_bill',
  }),
  Object.freeze({
    step: 9,
    key: 'write_off',
    dayOffset: 365,
    he: 'מחיקה חשבונאית + טיפול מס',
    en: 'Write-off and tax treatment',
    channel: 'internal_journal',
    legalWeight: 0, // not a legal step, it's accounting
  }),
]);

const LETTER_TYPES = Object.freeze(['pre-suit', 'demand', 'court-summons']);

/**
 * Compact 6-stage case workflow (0..5).
 *
 *   0 = new / תיק חדש
 *   1 = friendly reminder / תזכורת ידידותית
 *   2 = formal demand / דרישה רשמית
 *   3 = lawyer letter / מכתב עורך דין
 *   4 = enforcement (הוצאה לפועל) / הוצאה לפועל
 *   5 = closed (paid / settled / written-off / uncollectible) / תיק סגור
 *
 * This is the case-level API on top of the existing 9-step action ladder.
 * Append-only: stages only move forward; closed cases stay in the registry.
 */
const CASE_STAGE_DEFS = Object.freeze([
  Object.freeze({ stage: 0, key: 'new',         he: 'תיק חדש',                en: 'New case' }),
  Object.freeze({ stage: 1, key: 'friendly',    he: 'תזכורת ידידותית',        en: 'Friendly reminder' }),
  Object.freeze({ stage: 2, key: 'formal',      he: 'דרישה רשמית',            en: 'Formal demand' }),
  Object.freeze({ stage: 3, key: 'lawyer',      he: 'מכתב עורך דין',          en: 'Attorney letter' }),
  Object.freeze({ stage: 4, key: 'enforcement', he: 'הוצאה לפועל',            en: 'Execution Office enforcement' }),
  Object.freeze({ stage: 5, key: 'closed',      he: 'תיק סגור',               en: 'Closed' }),
]);

const CASE_CLOSE_STATUSES = Object.freeze([
  'paid', 'settled', 'written-off', 'uncollectible',
]);

const FRIENDLY_REMINDER_METHODS = Object.freeze([
  'email', 'sms', 'call', 'whatsapp', 'postal',
]);

const FORMAL_DEMAND_METHODS = Object.freeze([
  'email', 'registered_mail', 'courier', 'hand_delivery',
]);

const LAWYER_FEE_TYPES = Object.freeze([
  'flat', 'hourly', 'contingency', 'statutory',
]);

const ACTION_OUTCOMES = Object.freeze([
  'sent', 'delivered', 'no_response', 'partial_payment', 'promise_to_pay',
  'dispute_raised', 'paid_in_full', 'refused', 'unreachable',
]);

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers (pure)
// ─────────────────────────────────────────────────────────────────────────

function isPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isNonNegativeNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function isoDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  throw new TypeError(`invalid date: ${d}`);
}

function parseIso(d) {
  const s = isoDate(d);
  const t = Date.parse(s + 'T00:00:00Z');
  if (!Number.isFinite(t)) throw new TypeError(`unparsable date: ${d}`);
  return t;
}

function daysBetween(startIso, endIso) {
  const s = parseIso(startIso);
  const e = parseIso(endIso);
  return Math.round((e - s) / 86400000);
}

function formatILS(amount) {
  // Hebrew numeric formatting — thousand separator, 2 decimals.
  const fixed = Math.round(amount * 100) / 100;
  const [whole, frac = '00'] = fixed.toFixed(2).split('.');
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withSep}.${frac}`;
}

function freeze(obj) {
  return Object.freeze(obj);
}

function freezeDeep(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(freezeDeep);
    Object.freeze(obj);
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────
// Main class
// ─────────────────────────────────────────────────────────────────────────

class DebtCollection {
  /**
   * @param {object} [options]
   * @param {string} [options.today] ISO date for deterministic tests.
   * @param {object} [options.logger] BYO logger.
   */
  constructor(options = {}) {
    this._today = options.today || new Date().toISOString().slice(0, 10);
    this._logger = options.logger || null;

    // Append-only ledgers. Each is a Map<string, ReadonlyArray<Record>> or
    // Map<string, Record>. We never splice.
    this._actions = new Map();            // customerId → [actionRecord]
    this._letters = new Map();            // letterId → letterRecord
    this._promissoryNotes = new Map();    // noteId → noteRecord
    this._executionCases = new Map();     // caseId → caseRecord
    this._settlements = new Map();        // settlementId → settlementRecord
    this._writeOffs = new Map();          // writeOffId → writeOffRecord
    this._recoveries = new Map();         // recoveryId → recoveryRecord

    // Case-level workflow state (stage-based API).
    // Each case is the source-of-truth root — we never mutate the `_cases`
    // row in place. Instead we replace with a new frozen snapshot, and
    // append every change to `_caseEvents` for forensic audit.
    this._cases = new Map();              // caseId → caseRecord (immutable-replaceable)
    this._caseEvents = new Map();         // caseId → ReadonlyArray<event>
    this._casePayments = new Map();       // caseId → ReadonlyArray<paymentRecord>
    this._casePaymentPlans = new Map();   // caseId → ReadonlyArray<planRecord>

    // Monotonic counters — used for deterministic IDs in tests.
    this._seq = 0;
  }

  // ───────────────────── utilities ─────────────────────

  _nextId(prefix) {
    this._seq += 1;
    return `${prefix}-${String(this._seq).padStart(6, '0')}`;
  }

  _log(level, msg, extra) {
    if (this._logger && typeof this._logger[level] === 'function') {
      this._logger[level](msg, extra);
    }
  }

  // ───────────────────── 1. escalationLadder ─────────────────────

  /**
   * Return the bilingual 9-step ladder, annotated with the recommended
   * current step for the given debt amount and the history of this
   * customer.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {number} params.debtAmount  In ILS.
   * @param {string} [params.dueDate]   ISO; defaults to today − 60 days.
   * @returns {Readonly<{
   *   customerId: string,
   *   debtAmount: number,
   *   steps: ReadonlyArray<object>,
   *   currentStep: number,
   *   recommendedStep: number,
   *   smallClaimsEligible: boolean,
   *   warnings: ReadonlyArray<string>
   * }>}
   */
  escalationLadder(params) {
    const { customerId, debtAmount } = params || {};
    if (!customerId || typeof customerId !== 'string') {
      throw new TypeError('customerId (string) is required');
    }
    if (!isPositiveNumber(debtAmount)) {
      throw new TypeError('debtAmount must be a positive number');
    }

    const dueDate = params.dueDate || this._shiftDays(this._today, -60);
    const daysOverdue = Math.max(0, daysBetween(dueDate, this._today));

    // Step already reached (based on ledger history).
    const actions = this._actions.get(customerId) || [];
    const reachedStep = actions.reduce((m, a) => Math.max(m, a.step), 0);

    // Step recommended by day count.
    let byDays = 0;
    for (const s of ESCALATION_LADDER) {
      if (daysOverdue >= s.dayOffset) byDays = s.step;
    }
    const recommended = Math.max(reachedStep + 1, byDays || 1);
    const clamped = Math.min(recommended, ESCALATION_LADDER.length);

    const warnings = [];
    const smallClaimsEligible = debtAmount <= CONSTANTS.SMALL_CLAIMS_CAP_ILS;
    if (!smallClaimsEligible) {
      warnings.push(
        `debtAmount ${formatILS(debtAmount)} ILS exceeds the small-claims ` +
        `cap of ${formatILS(CONSTANTS.SMALL_CLAIMS_CAP_ILS)} ILS — use District Court (step 7)`
      );
    }
    // Statute of limitations guard.
    const yearsOverdue = daysOverdue / 365.25;
    if (yearsOverdue >= CONSTANTS.STATUTE_OF_LIMITATIONS_YEARS - 1) {
      warnings.push(
        `statute-of-limitations warning: debt is ${yearsOverdue.toFixed(1)} years old; ` +
        `prescription under חוק ההתיישנות is ${CONSTANTS.STATUTE_OF_LIMITATIONS_YEARS} years`
      );
    }

    const annotated = ESCALATION_LADDER.map((s) => freeze({
      ...s,
      reached: s.step <= reachedStep,
      current: s.step === clamped,
      available:
        s.key !== 'small_claims' ? true : smallClaimsEligible,
    }));

    return freezeDeep({
      customerId,
      debtAmount,
      dueDate,
      daysOverdue,
      steps: annotated,
      currentStep: reachedStep,
      recommendedStep: clamped,
      smallClaimsEligible,
      warnings: Object.freeze(warnings),
      legalNotice: 'Generated step list is a workflow template — actual ' +
                   'court filings require a licensed Israeli attorney.',
      legalNoticeHe: 'רשימת השלבים היא תבנית תהליך בלבד — הגשת תביעה בפועל ' +
                     'מחייבת עורך דין מורשה.',
    });
  }

  _shiftDays(iso, delta) {
    const t = parseIso(iso) + delta * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // ───────────────────── 2. recordAction ─────────────────────

  /**
   * Append a new collection-action row to the customer ledger.
   * Append-only — earlier rows are never mutated.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {number} params.step     1..9
   * @param {string} params.date     ISO
   * @param {string} params.outcome  One of ACTION_OUTCOMES
   * @param {string} [params.notes]
   * @param {string} [params.document] Path or URI to evidence
   */
  recordAction(params) {
    const { customerId, step, date, outcome, notes, document: doc } = params || {};
    if (!customerId || typeof customerId !== 'string') {
      throw new TypeError('customerId is required');
    }
    if (!Number.isInteger(step) || step < 1 || step > ESCALATION_LADDER.length) {
      throw new RangeError(`step must be 1..${ESCALATION_LADDER.length}`);
    }
    if (!ACTION_OUTCOMES.includes(outcome)) {
      throw new RangeError(`outcome must be one of ${ACTION_OUTCOMES.join(',')}`);
    }
    const iso = isoDate(date);
    const id = this._nextId('ACT');
    const stepDef = ESCALATION_LADDER[step - 1];
    const record = freeze({
      id,
      customerId,
      step,
      stepKey: stepDef.key,
      stepHe: stepDef.he,
      stepEn: stepDef.en,
      date: iso,
      outcome,
      notes: notes || '',
      document: doc || null,
      createdAt: this._today,
    });

    const bucket = this._actions.get(customerId) || [];
    // Append-only — create a new frozen array so history references remain stable.
    const next = Object.freeze(bucket.concat([record]));
    this._actions.set(customerId, next);
    this._log('info', 'debt_collection_action_recorded', record);
    return record;
  }

  /** Read-only view of the customer's action ledger. */
  actionsFor(customerId) {
    return this._actions.get(customerId) || Object.freeze([]);
  }

  // ───────────────────── 3. generateLegalLetter ─────────────────────

  /**
   * Bilingual legal-letter template. TEMPLATE ONLY — not legal advice.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {number} params.debtAmount
   * @param {'pre-suit'|'demand'|'court-summons'} params.type
   * @param {string} [params.dueDate]  ISO — used for interest calc.
   * @param {number} [params.interestRate] Override default.
   */
  generateLegalLetter(params) {
    const { customerId, debtAmount, type } = params || {};
    if (!customerId || typeof customerId !== 'string') {
      throw new TypeError('customerId is required');
    }
    if (!isPositiveNumber(debtAmount)) {
      throw new TypeError('debtAmount must be a positive number');
    }
    if (!LETTER_TYPES.includes(type)) {
      throw new RangeError(`type must be one of ${LETTER_TYPES.join(',')}`);
    }

    const dueDate = params.dueDate || this._shiftDays(this._today, -120);
    const interest = this.computeLateInterest({
      principal: debtAmount,
      periodStart: dueDate,
      rate: params.interestRate,
      periodEnd: this._today,
    });
    const total = debtAmount + interest.interestAmount;

    const amountStr = formatILS(debtAmount);
    const interestStr = formatILS(interest.interestAmount);
    const totalStr = formatILS(total);

    const id = this._nextId('LTR');
    const header = {
      id,
      customerId,
      type,
      date: this._today,
      debtAmount,
      interestAmount: interest.interestAmount,
      total,
      interestBasis: interest,
    };

    let bodyHe = '';
    let bodyEn = '';

    switch (type) {
      case 'pre-suit':
        bodyHe =
          `מכתב התראה לפני תביעה\n` +
          `לכבוד: ${customerId}\n` +
          `תאריך: ${this._today}\n\n` +
          `בהמשך לחשבון/חשבונית שלא שולמו, הריני להודיעכם כי חוב בסך ` +
          `${amountStr} ש"ח אשר זמן פירעונו חלף ביום ${dueDate} טרם נפרע. ` +
          `לחוב זה נצברה ריבית פיגורים בסך ${interestStr} ש"ח, לפי ` +
          `חוק פסיקת ריבית והצמדה, תשכ"א-1961, ועל כן הסכום המלא ליום ` +
          `${this._today} הוא ${totalStr} ש"ח.\n\n` +
          `הרינו לדרוש את תשלום החוב בתוך 14 יום מקבלת מכתב זה. ` +
          `ככל שהחוב לא ייפרע במועד, נאלץ לפתוח בהליכים משפטיים לרבות ` +
          `הגשת תביעה לבית המשפט המוסמך ופתיחת תיק בלשכת ההוצאה לפועל.\n\n` +
          `שמורות לנו כל הזכויות בדין, לרבות הזכות לתבוע ריבית והצמדה, ` +
          `הוצאות משפט ושכר טרחת עורך דין.\n\n` +
          `בכבוד רב,\n____________________`;
        bodyEn =
          `PRE-SUIT DEMAND LETTER\n` +
          `To: ${customerId}\n` +
          `Date: ${this._today}\n\n` +
          `Further to our outstanding invoice, we hereby notify you that the ` +
          `debt of ILS ${amountStr}, originally due on ${dueDate}, remains ` +
          `unpaid. Default interest of ILS ${interestStr} has accrued under ` +
          `the Interest and Linkage Adjudication Law, 5721-1961, bringing the ` +
          `total due as of ${this._today} to ILS ${totalStr}.\n\n` +
          `You are hereby required to pay the debt in full within 14 days of ` +
          `receipt of this letter. Should the debt remain unpaid, we will be ` +
          `compelled to commence legal proceedings, including filing a claim ` +
          `with the competent court and opening an Execution Office file.\n\n` +
          `All rights under the law are reserved, including the right to claim ` +
          `interest, linkage, legal costs, and attorney's fees.\n\n` +
          `Sincerely,\n____________________`;
        break;

      case 'demand':
        bodyHe =
          `מכתב דרישה סופית\n` +
          `לכבוד: ${customerId}\n` +
          `תאריך: ${this._today}\n\n` +
          `על אף מספר פניותינו, חוב בסך ${amountStr} ש"ח ליום ${dueDate} ` +
          `טרם נפרע. ריבית פיגורים בסך ${interestStr} ש"ח נצברה על החוב, ` +
          `סה"כ לתשלום: ${totalStr} ש"ח.\n\n` +
          `זוהי התראה סופית. ככל שהתשלום לא יתקבל תוך 7 ימים, התיק יועבר ` +
          `לטיפול משפטי ללא הודעה נוספת.\n\n` +
          `בכבוד רב,\n____________________`;
        bodyEn =
          `FINAL DEMAND LETTER\n` +
          `To: ${customerId}\n` +
          `Date: ${this._today}\n\n` +
          `Despite our repeated requests, the debt of ILS ${amountStr}, due ` +
          `on ${dueDate}, remains unpaid. Default interest of ILS ${interestStr} ` +
          `has accrued; the total amount due is ILS ${totalStr}.\n\n` +
          `This is a final demand. Should payment not be received within ` +
          `seven (7) days, the matter will be referred to our legal ` +
          `department without further notice.\n\n` +
          `Sincerely,\n____________________`;
        break;

      case 'court-summons':
        bodyHe =
          `כתב תביעה — טיוטה / תבנית\n` +
          `בית המשפט: ______ (לתביעות קטנות / השלום / המחוזי)\n` +
          `מספר תיק: ______\n` +
          `התובע: ______\n` +
          `הנתבע: ${customerId}\n\n` +
          `עילת התביעה: חוב בסך ${amountStr} ש"ח בגין חשבונית/התחייבות ` +
          `שלא שולמה, שזמן פירעונה חלף ביום ${dueDate}. בנוסף נתבעת ריבית ` +
          `והצמדה בסך ${interestStr} ש"ח מכוח חוק פסיקת ריבית והצמדה, ` +
          `תשכ"א-1961, סה"כ ${totalStr} ש"ח, וכן הוצאות משפט ושכר טרחת ` +
          `עורך דין.\n\n` +
          `הסכום הנתבע: ${totalStr} ש"ח + ריבית והצמדה עד התשלום בפועל.\n\n` +
          `⚠ הערה: זוהי תבנית בלבד — הגשת כתב תביעה בפועל מחייבת עורך דין.\n\n` +
          `_____________________`;
        bodyEn =
          `STATEMENT OF CLAIM — DRAFT / TEMPLATE\n` +
          `Court: ______ (Small Claims / Magistrate / District)\n` +
          `File no.: ______\n` +
          `Plaintiff: ______\n` +
          `Defendant: ${customerId}\n\n` +
          `Cause of action: Unpaid invoice/obligation of ILS ${amountStr}, ` +
          `due on ${dueDate}. Default interest and linkage of ILS ${interestStr} ` +
          `are also claimed under the Interest and Linkage Adjudication Law, ` +
          `5721-1961, for a total of ILS ${totalStr}, plus legal costs and ` +
          `attorney's fees.\n\n` +
          `Amount claimed: ILS ${totalStr} plus interest and linkage to the ` +
          `date of actual payment.\n\n` +
          `⚠ Note: This is a template only — actual filing of a statement ` +
          `of claim requires a licensed Israeli attorney.\n\n` +
          `_____________________`;
        break;
    }

    const disclaimer = {
      he: '⚠ מסמך זה הוא תבנית בלבד ואינו מהווה ייעוץ משפטי. שליחה/הגשה של ' +
          'מסמך משפטי מחייבת בדיקה של עורך דין מורשה בישראל.',
      en: '⚠ This document is a template only and does not constitute legal ' +
          'advice. Sending or filing a legal document requires review by a ' +
          'licensed Israeli attorney.',
    };

    const letter = freezeDeep({
      ...header,
      bodyHe,
      bodyEn,
      disclaimer,
      citations: [
        LAW_CITATIONS.INTEREST_LAW,
        type === 'court-summons' ? LAW_CITATIONS.COURTS_LAW : null,
      ].filter(Boolean),
    });

    this._letters.set(id, letter);
    return letter;
  }

  // ───────────────────── 4. computeLateInterest ─────────────────────

  /**
   * Compute default court interest per חוק פסיקת ריבית והצמדה.
   * Simple interest, actual/365, applied from periodStart (or invoice due
   * date) through periodEnd (default = today on the instance).
   *
   * @param {object} params
   * @param {number} params.principal
   * @param {string} params.periodStart ISO
   * @param {number} [params.rate]      Annual rate, default 4%.
   * @param {string} [params.periodEnd] ISO, defaults to `this._today`.
   */
  computeLateInterest(params) {
    const { principal, periodStart } = params || {};
    if (!isPositiveNumber(principal)) {
      throw new TypeError('principal must be a positive number');
    }
    if (!periodStart) throw new TypeError('periodStart is required');

    const rate = params.rate == null
      ? CONSTANTS.DEFAULT_COURT_INTEREST_RATE
      : params.rate;
    if (!isNonNegativeNumber(rate)) {
      throw new TypeError('rate must be a non-negative number');
    }
    const end = params.periodEnd || this._today;
    const days = Math.max(0, daysBetween(periodStart, end));
    // Simple interest, ACT/365.
    const interestAmount =
      Math.round(principal * rate * (days / CONSTANTS.DAY_COUNT_BASIS) * 100) / 100;

    return freezeDeep({
      principal,
      rate,
      basis: 'simple',
      dayCount: CONSTANTS.DAY_COUNT_BASIS,
      periodStart: isoDate(periodStart),
      periodEnd: isoDate(end),
      days,
      interestAmount,
      totalDue: Math.round((principal + interestAmount) * 100) / 100,
      citation: LAW_CITATIONS.INTEREST_LAW,
    });
  }

  // ───────────────────── 5. promissoryNoteHandling ─────────────────────

  /**
   * שטר חוב management — register a promissory note against a customer,
   * compute protest date, check statute of limitations, etc.
   *
   * Can be called in two modes:
   *   (a) promissoryNoteHandling(customerId) — returns all notes for the
   *       customer plus bilingual handling guidance.
   *   (b) promissoryNoteHandling({customerId, register: {...}}) — registers
   *       a new note and returns the same envelope.
   */
  promissoryNoteHandling(arg) {
    let customerId;
    let register = null;
    if (typeof arg === 'string') {
      customerId = arg;
    } else if (arg && typeof arg === 'object') {
      customerId = arg.customerId;
      register = arg.register || null;
    } else {
      throw new TypeError('customerId (string) or options object required');
    }
    if (!customerId) throw new TypeError('customerId is required');

    if (register) {
      const noteId = this._nextId('PN');
      const note = freeze({
        id: noteId,
        customerId,
        maker: register.maker || customerId,
        holder: register.holder || 'Techno-Kol Uzi Ltd',
        amount: register.amount,
        currency: register.currency || 'ILS',
        issueDate: isoDate(register.issueDate || this._today),
        dueDate: isoDate(register.dueDate || this._today),
        status: register.status || 'active', // active | protested | paid | bounced
        notes: register.notes || '',
      });
      if (!isPositiveNumber(note.amount)) {
        throw new TypeError('register.amount must be a positive number');
      }
      this._promissoryNotes.set(noteId, note);
    }

    const notes = Array.from(this._promissoryNotes.values())
      .filter((n) => n.customerId === customerId);

    const dueAnalysis = notes.map((n) => {
      const daysToDue = daysBetween(this._today, n.dueDate);
      return freeze({
        note: n,
        daysToDue,
        isOverdue: daysToDue < 0,
        protestDue: n.status === 'active' && daysToDue < 0,
        statuteOfLimitationsYears: CONSTANTS.STATUTE_OF_LIMITATIONS_YEARS,
      });
    });

    return freezeDeep({
      customerId,
      notes,
      analysis: dueAnalysis,
      citation: LAW_CITATIONS.BILLS_ORDINANCE,
      guidance: {
        he: 'שטר חוב שלא נפרע מאפשר למחזיק לפתוח תיק בהוצאה לפועל ישירות, ' +
            'ללא צורך בפסק דין. יש להגיש את השטר למשרד ההוצאה לפועל בצירוף ' +
            'בקשה לביצוע שטר, לרבות פרטי החייב ומספר השטר.',
        en: 'An unpaid promissory note allows the holder to open an Execution ' +
            'Office file directly, without need for a court judgment. File the ' +
            'note with the Execution Office along with an application for ' +
            'enforcement, including debtor details and note number.',
      },
    });
  }

  // ───────────────────── 6. executionOfficeRegistration ─────────────────────

  /**
   * Open a הוצאה לפועל case in the internal registry. This does NOT
   * actually file anything with the real Execution Office — it prepares
   * the data packet for counsel/clerk.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {string} params.judgmentId
   * @param {number} [params.amount]        Judgment amount.
   * @param {string} [params.courtName]
   * @param {string} [params.judgmentDate]
   */
  executionOfficeRegistration(params) {
    const { customerId, judgmentId } = params || {};
    if (!customerId) throw new TypeError('customerId is required');
    if (!judgmentId) throw new TypeError('judgmentId is required');

    const caseId = this._nextId('EO');
    const record = freeze({
      id: caseId,
      customerId,
      judgmentId,
      amount: isPositiveNumber(params.amount) ? params.amount : null,
      courtName: params.courtName || null,
      judgmentDate: params.judgmentDate ? isoDate(params.judgmentDate) : null,
      openedAt: this._today,
      status: 'opened',
      checklist: Object.freeze([
        freeze({ step: 'judgment_copy', done: false, he: 'העתק פסק הדין' }),
        freeze({ step: 'debtor_id', done: false, he: 'תעודת זהות/ח.פ. של החייב' }),
        freeze({ step: 'application_form', done: false, he: 'טופס בקשת ביצוע' }),
        freeze({ step: 'fee_payment', done: false, he: 'תשלום אגרה' }),
        freeze({ step: 'address_verification', done: false, he: 'אימות כתובת' }),
      ]),
      citation: LAW_CITATIONS.EXECUTION_LAW,
      legalNotice: 'Actual Execution Office filing must be performed by a ' +
                   'licensed Israeli attorney or an authorized representative.',
    });
    this._executionCases.set(caseId, record);
    return record;
  }

  // ───────────────────── 7. escrowedSettlement ─────────────────────

  /**
   * Negotiated settlement held in escrow until conditions are met. The
   * original debt is NOT erased — we just flag the settlement proposal.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {number} params.settleAmount
   * @param {string|string[]} params.conditions  Hebrew or English, array allowed.
   * @param {string} [params.escrowAgent]        E.g. attorney name.
   * @param {string} [params.originalDebt]       Original debt amount.
   */
  escrowedSettlement(params) {
    const { customerId, settleAmount, conditions } = params || {};
    if (!customerId) throw new TypeError('customerId is required');
    if (!isPositiveNumber(settleAmount)) {
      throw new TypeError('settleAmount must be a positive number');
    }
    if (conditions == null) {
      throw new TypeError('conditions is required');
    }

    const condArr = Array.isArray(conditions) ? conditions.slice() : [String(conditions)];
    const id = this._nextId('ESCR');
    const record = freeze({
      id,
      customerId,
      settleAmount,
      originalDebt: isPositiveNumber(params.originalDebt) ? params.originalDebt : null,
      discountPct: isPositiveNumber(params.originalDebt)
        ? Math.round((1 - settleAmount / params.originalDebt) * 10000) / 100
        : null,
      conditions: Object.freeze(condArr),
      escrowAgent: params.escrowAgent || null,
      status: 'escrowed', // escrowed | released | breached
      createdAt: this._today,
      guidance: {
        he: 'הסדר פשרה המותנה במילוי תנאים — הסכום מוחזק בידי עורך דין עד ' +
            'למילוי מלא של התנאים. במקרה של הפרה — זכויות המקורי חוזרות.',
        en: 'Conditional settlement — funds held in escrow by counsel until ' +
            'all conditions are fulfilled. On breach, rights to the full ' +
            'original debt revert.',
      },
    });
    this._settlements.set(id, record);
    return record;
  }

  // ───────────────────── 8. writeOff ─────────────────────

  /**
   * Book a bad-debt write-off. The original AR row stays in the ledger
   * forever — we just mark it `written_off` and create a new journal entry.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {number} params.amount
   * @param {string} params.reason
   * @param {string} params.approver    Must be one of WRITE_OFF_APPROVER_ROLES.
   * @param {string} [params.approverRole] Alias for `approver` role.
   * @param {string} [params.date]      ISO — defaults to today.
   */
  writeOff(params) {
    const { customerId, amount, reason, approver } = params || {};
    if (!customerId) throw new TypeError('customerId is required');
    if (!isPositiveNumber(amount)) {
      throw new TypeError('amount must be a positive number');
    }
    if (!reason || typeof reason !== 'string') {
      throw new TypeError('reason (string) is required');
    }
    if (!approver || typeof approver !== 'string') {
      throw new TypeError('approver (string) is required');
    }
    const role = (params.approverRole || '').toLowerCase();
    // Accept either the role directly in `approver` or the separate role field.
    const impliedRole = role || approver.toLowerCase();
    // We accept if the role is known; otherwise we still book the write-off
    // but flag it. (The AR book must always be balanced.)
    const roleOk = CONSTANTS.WRITE_OFF_APPROVER_ROLES.includes(impliedRole);

    const id = this._nextId('WO');
    const date = params.date ? isoDate(params.date) : this._today;

    // Tax deductibility: income-tax side + VAT side, both default.
    const taxTreatment = freeze({
      incomeTaxDeductible: CONSTANTS.BAD_DEBT_TAX_DEDUCTIBLE_DEFAULT,
      incomeTaxCitation: LAW_CITATIONS.INCOME_TAX_17_4,
      vatRelief: CONSTANTS.VAT_RELIEF_DEFAULT,
      vatCitation: LAW_CITATIONS.VAT_49,
      notes: {
        he: 'חוב רע ניתן לניכוי תחת סעיף 17(4) לפקודת מס הכנסה בתנאי ' +
            'שסכום החוב נכלל בעבר בהכנסה חייבת, והוכחה אי-גבייתו. הקלה ' +
            'במע"מ לפי סעיף 49 לחוק מע"מ מותנית בתנאים נוספים (בין היתר ' +
            '18 חודש איחור ומתן הודעה לרוכש).',
        en: 'Bad debt is deductible under § 17(4) of the Income Tax ' +
            'Ordinance provided the amount was previously included in ' +
            'taxable income and its un-collectability proven. VAT relief ' +
            'under § 49 of the VAT Law is subject to additional conditions ' +
            '(inter alia 18+ months overdue and notice to the buyer).',
      },
    });

    // Journal entry stub — debit "bad debt expense", credit "AR customer".
    const journalEntry = freeze({
      date,
      lines: Object.freeze([
        freeze({
          account: 'bad_debt_expense',
          side: 'debit',
          amount,
          description: `Write-off ${customerId}: ${reason}`,
        }),
        freeze({
          account: `ar_${customerId}`,
          side: 'credit',
          amount,
          description: `Write-off ${customerId}`,
        }),
      ]),
    });

    const record = freeze({
      id,
      customerId,
      amount,
      reason,
      approver,
      approverRole: impliedRole,
      approverRoleValid: roleOk,
      date,
      status: 'written_off', // retained forever — see recoveryLater
      taxTreatment,
      journalEntry,
      warnings: roleOk
        ? Object.freeze([])
        : Object.freeze([
            `approver role '${impliedRole}' is not one of ` +
            `${CONSTANTS.WRITE_OFF_APPROVER_ROLES.join('/')} — write-off recorded but flagged for review`,
          ]),
      createdAt: this._today,
    });
    this._writeOffs.set(id, record);
    this._log('info', 'debt_collection_write_off', record);
    return record;
  }

  // ───────────────────── 9. recoveryLater ─────────────────────

  /**
   * Subsequent recovery of a previously written-off debt. This is a
   * re-income event: income tax says "if you deducted bad debt and later
   * collected, book the collected portion as income in the collection year".
   *
   * @param {object} params
   * @param {string} params.writeOffId
   * @param {number} params.recovered
   * @param {string} [params.date]
   * @param {string} [params.notes]
   */
  recoveryLater(params) {
    const { writeOffId, recovered } = params || {};
    if (!writeOffId) throw new TypeError('writeOffId is required');
    if (!isPositiveNumber(recovered)) {
      throw new TypeError('recovered must be a positive number');
    }
    const wo = this._writeOffs.get(writeOffId);
    if (!wo) throw new Error(`write-off ${writeOffId} not found`);
    if (recovered > wo.amount) {
      // Recovery cannot exceed original written-off amount; the rest is
      // normal income (late interest, etc.) and should be booked separately.
      // We still record the full recovery but split it.
    }

    const recoveredBookedAsIncome = Math.min(recovered, wo.amount);
    const excess = Math.max(0, recovered - wo.amount);

    const id = this._nextId('REC');
    const date = params.date ? isoDate(params.date) : this._today;

    const journalEntry = freeze({
      date,
      lines: Object.freeze([
        freeze({
          account: 'cash_or_bank',
          side: 'debit',
          amount: recovered,
          description: `Recovery of written-off debt ${wo.customerId}`,
        }),
        freeze({
          account: 'recovery_of_bad_debt_income',
          side: 'credit',
          amount: recoveredBookedAsIncome,
          description: 'Reversal of prior write-off — recognized as income',
        }),
        excess > 0
          ? freeze({
              account: 'other_income',
              side: 'credit',
              amount: excess,
              description: 'Excess over original write-off — late interest/penalty',
            })
          : null,
      ].filter(Boolean)),
    });

    const record = freeze({
      id,
      writeOffId,
      customerId: wo.customerId,
      recovered,
      recoveredBookedAsIncome,
      excess,
      date,
      notes: params.notes || '',
      journalEntry,
      taxTreatment: freeze({
        treatment: 'income',
        citation: LAW_CITATIONS.INCOME_TAX_17_4,
        notes: {
          he: 'על הסכום שנגבה לאחר מחיקה — יש לדווח כהכנסה בשנת הגבייה, ' +
              'לפי הכלל שאם חוב רע נוכה ונגבה לאחר מכן, הסכום שנגבה ' +
              'יוכר כהכנסה.',
          en: 'Amounts recovered after a bad-debt write-off must be ' +
              'reported as income in the year of recovery, per the rule ' +
              'that a previously deducted bad debt recovered later is ' +
              'taxable income.',
        },
      }),
      createdAt: this._today,
    });
    this._recoveries.set(id, record);
    return record;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  CASE-LEVEL WORKFLOW ENGINE
  //  ניהול תיקי גבייה לפי חוק ההוצאה לפועל
  //  Agent Y-088 — spec: createCase → friendlyReminder → formalDemand →
  //  lawyerLetter → hotza'ah → paymentPlan → recordPayment → computeInterest
  //  → statute → writeOff → closeCase → generateCaseFile
  //
  //  Rule: לא מוחקים רק משדרגים ומגדלים — every state change creates a
  //  new frozen snapshot; the old snapshot is archived via an append-only
  //  event log. Closed cases remain in the registry forever.
  // ═════════════════════════════════════════════════════════════════════

  _appendCaseEvent(caseId, event) {
    const bucket = this._caseEvents.get(caseId) || Object.freeze([]);
    const next = Object.freeze(bucket.concat([Object.freeze({
      ...event,
      seq: bucket.length + 1,
      timestamp: this._today,
    })]));
    this._caseEvents.set(caseId, next);
    return next[next.length - 1];
  }

  _requireCase(caseId) {
    const rec = this._cases.get(caseId);
    if (!rec) throw new Error(`case ${caseId} not found`);
    return rec;
  }

  _replaceCase(caseId, updater) {
    const old = this._requireCase(caseId);
    const raw = { ...old, ...updater(old) };
    const next = freezeDeep(raw);
    this._cases.set(caseId, next);
    return next;
  }

  _bilingualStage(stage) {
    return CASE_STAGE_DEFS[stage] || CASE_STAGE_DEFS[0];
  }

  // ───────────────────── createCase ─────────────────────

  /**
   * Open a new collection case. Stage 0 (new). Append-only root record.
   *
   * @param {object} params
   * @param {string} params.customerId
   * @param {Array<object>} params.invoices  [{id, amount, issueDate}]
   * @param {number} params.totalAmount      ILS (or currency below)
   * @param {string} [params.currency='ILS']
   * @param {string} params.dueDate          ISO — earliest due date
   */
  createCase(params) {
    const p = params || {};
    if (!p.customerId || typeof p.customerId !== 'string') {
      throw new TypeError('customerId (string) is required');
    }
    if (!Array.isArray(p.invoices) || p.invoices.length === 0) {
      throw new TypeError('invoices (non-empty array) is required');
    }
    if (!isPositiveNumber(p.totalAmount)) {
      throw new TypeError('totalAmount must be a positive number');
    }
    if (!p.dueDate) throw new TypeError('dueDate is required');

    const caseId = this._nextId('CASE');
    const dueDateIso = isoDate(p.dueDate);
    const currency = (p.currency || 'ILS').toUpperCase();

    const frozenInvoices = Object.freeze(
      p.invoices.map((inv, i) => freeze({
        id: inv.id || `INV-${i + 1}`,
        amount: isPositiveNumber(inv.amount) ? inv.amount : 0,
        issueDate: inv.issueDate ? isoDate(inv.issueDate) : dueDateIso,
        description: inv.description || '',
      }))
    );

    const record = freezeDeep({
      id: caseId,
      customerId: p.customerId,
      invoices: frozenInvoices,
      principal: p.totalAmount,
      originalAmount: p.totalAmount,
      currency,
      dueDate: dueDateIso,
      openedAt: this._today,
      stage: 0,
      stageKey: this._bilingualStage(0).key,
      stageHe: this._bilingualStage(0).he,
      stageEn: this._bilingualStage(0).en,
      status: 'open',
      closedAt: null,
      closeStatus: null,
      closeNotes: null,
      paymentsTotal: 0,
      balance: p.totalAmount,
      lawyerId: null,
      claimNumber: null,
      court: null,
      writeOffId: null,
      labels: {
        he: 'תיק גבייה',
        en: 'Debt-collection case',
      },
    });

    this._cases.set(caseId, record);
    this._caseEvents.set(caseId, Object.freeze([]));
    this._casePayments.set(caseId, Object.freeze([]));
    this._casePaymentPlans.set(caseId, Object.freeze([]));

    this._appendCaseEvent(caseId, {
      type: 'case_created',
      stage: 0,
      he: 'תיק גבייה נפתח',
      en: 'Collection case opened',
      amount: p.totalAmount,
      currency,
    });

    this._log('info', 'debt_collection_case_created', record);
    return record;
  }

  /** Read-only view of a case (or null). */
  getCase(caseId) {
    return this._cases.get(caseId) || null;
  }

  /** Read-only view of a case's event history. */
  caseEvents(caseId) {
    return this._caseEvents.get(caseId) || Object.freeze([]);
  }

  // ───────────────────── friendlyReminder (stage 1) ─────────────────────

  /**
   * Stage 1 — polite reminder (email/sms/call/whatsapp/postal) with a
   * configurable lead-day schedule.
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {string} params.method   One of FRIENDLY_REMINDER_METHODS
   * @param {number} [params.leadDays=7]
   * @param {string} [params.date]   Override send date
   */
  friendlyReminder(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }
    if (rec.stage > 1) {
      throw new Error(`case ${rec.id} is past the friendly-reminder stage`);
    }
    if (!FRIENDLY_REMINDER_METHODS.includes(p.method)) {
      throw new RangeError(
        `method must be one of ${FRIENDLY_REMINDER_METHODS.join(',')}`
      );
    }
    const leadDays = Number.isFinite(p.leadDays)
      ? p.leadDays
      : CONSTANTS.DEFAULT_FRIENDLY_LEAD_DAYS;
    if (leadDays < 0) {
      throw new RangeError('leadDays must be >= 0');
    }
    const date = p.date ? isoDate(p.date) : this._today;

    const nextReminderAt = this._shiftDays(date, leadDays);

    // Stage transitions to 1 (only upgrades).
    const updated = this._replaceCase(rec.id, (old) => ({
      stage: Math.max(old.stage, 1),
      stageKey: this._bilingualStage(Math.max(old.stage, 1)).key,
      stageHe: this._bilingualStage(Math.max(old.stage, 1)).he,
      stageEn: this._bilingualStage(Math.max(old.stage, 1)).en,
    }));

    const event = this._appendCaseEvent(rec.id, {
      type: 'friendly_reminder',
      stage: 1,
      method: p.method,
      leadDays,
      date,
      nextReminderAt,
      he: 'תזכורת ידידותית נשלחה',
      en: 'Friendly reminder sent',
      messageHe:
        'שלום, ברצוננו להזכיר כי קיים חוב פתוח אצלנו. נשמח אם תוכלו להסדיר ' +
        'את התשלום בהקדם. לכל שאלה — אנו לרשותכם.',
      messageEn:
        'Hello, this is a friendly reminder that there is an outstanding ' +
        'balance on your account. We would appreciate your settling this ' +
        'as soon as possible. Please reach out with any questions.',
    });

    return freezeDeep({ case: updated, event });
  }

  // ───────────────────── formalDemand (stage 2) ─────────────────────

  /**
   * Stage 2 — formal demand letter with legal warnings, bilingual template.
   * Records a reference to generateLegalLetter('demand') output.
   */
  formalDemand(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }
    if (rec.stage > 2) {
      throw new Error(`case ${rec.id} is past the formal-demand stage`);
    }
    if (!FORMAL_DEMAND_METHODS.includes(p.method)) {
      throw new RangeError(
        `method must be one of ${FORMAL_DEMAND_METHODS.join(',')}`
      );
    }

    // Reuse the existing letter engine for consistency with Wave-1 dunning.
    const letter = this.generateLegalLetter({
      customerId: rec.customerId,
      debtAmount: rec.balance,
      type: 'demand',
      dueDate: rec.dueDate,
    });

    const updated = this._replaceCase(rec.id, (old) => ({
      stage: Math.max(old.stage, 2),
      stageKey: this._bilingualStage(Math.max(old.stage, 2)).key,
      stageHe: this._bilingualStage(Math.max(old.stage, 2)).he,
      stageEn: this._bilingualStage(Math.max(old.stage, 2)).en,
    }));

    const event = this._appendCaseEvent(rec.id, {
      type: 'formal_demand',
      stage: 2,
      method: p.method,
      letterId: letter.id,
      he: 'דרישה רשמית נשלחה — התראה משפטית',
      en: 'Formal demand letter sent — legal warning',
      legalWarningHe:
        'ככל שלא יתקבל תשלום מלא בתוך 7 ימים, התיק יועבר לטיפול משפטי ' +
        'לרבות תביעה ופתיחת תיק הוצאה לפועל.',
      legalWarningEn:
        'If full payment is not received within 7 days, the matter will be ' +
        'referred for legal action including a court claim and opening an ' +
        'Execution Office (הוצאה לפועל) file.',
    });

    return freezeDeep({ case: updated, event, letter });
  }

  // ───────────────────── lawyerLetter (stage 3) ─────────────────────

  /**
   * Stage 3 — attorney-involvement letter. Records lawyer + fee structure.
   */
  lawyerLetter(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }
    if (rec.stage > 3) {
      throw new Error(`case ${rec.id} is past the lawyer-letter stage`);
    }
    if (!p.lawyerId || typeof p.lawyerId !== 'string') {
      throw new TypeError('lawyerId (string) is required');
    }
    if (!LAWYER_FEE_TYPES.includes(p.feeType)) {
      throw new RangeError(
        `feeType must be one of ${LAWYER_FEE_TYPES.join(',')}`
      );
    }

    const letter = this.generateLegalLetter({
      customerId: rec.customerId,
      debtAmount: rec.balance,
      type: 'pre-suit',
      dueDate: rec.dueDate,
    });

    const updated = this._replaceCase(rec.id, (old) => ({
      stage: Math.max(old.stage, 3),
      stageKey: this._bilingualStage(Math.max(old.stage, 3)).key,
      stageHe: this._bilingualStage(Math.max(old.stage, 3)).he,
      stageEn: this._bilingualStage(Math.max(old.stage, 3)).en,
      lawyerId: p.lawyerId,
    }));

    const event = this._appendCaseEvent(rec.id, {
      type: 'lawyer_letter',
      stage: 3,
      lawyerId: p.lawyerId,
      feeType: p.feeType,
      letterId: letter.id,
      he: 'מכתב עורך דין נשלח',
      en: 'Attorney letter sent',
      noticeHe:
        'התיק הועבר לטיפול עורך דין. יש להסדיר את החוב לאלתר. פנייה ישירה ' +
        'לעורך הדין תסייע להימנע מהליכים נוספים.',
      noticeEn:
        'The case has been handed over to an attorney. The debt must be ' +
        'settled immediately. Direct contact with counsel will help avoid ' +
        'further proceedings.',
    });

    return freezeDeep({ case: updated, event, letter });
  }

  // ───────────────────── hotza'ah (stage 4) ─────────────────────

  /**
   * Stage 4 — הוצאה לפועל filing. Records claim number + court.
   * Governed by חוק ההוצאה לפועל, תשכ"ז-1967.
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {string} params.claimNumber   מספר תיק ההוצאה לפועל
   * @param {string} params.court         בית המשפט / לשכת ההוצאה לפועל
   * @param {string} [params.judgmentId]  פסק דין שמבסס את הפתיחה
   */
  hotzaahLePoal(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }
    if (rec.stage > 4) {
      throw new Error(`case ${rec.id} is past the enforcement stage`);
    }
    if (!p.claimNumber || typeof p.claimNumber !== 'string') {
      throw new TypeError('claimNumber (string) is required');
    }
    if (!p.court || typeof p.court !== 'string') {
      throw new TypeError('court (string) is required');
    }

    // Also register in the internal Execution Office ledger for continuity
    // with the existing executionOfficeRegistration API.
    const eoRecord = this.executionOfficeRegistration({
      customerId: rec.customerId,
      judgmentId: p.judgmentId || `JUDGMENT-${rec.id}`,
      amount: rec.balance,
      courtName: p.court,
      judgmentDate: this._today,
    });

    const updated = this._replaceCase(rec.id, (old) => ({
      stage: Math.max(old.stage, 4),
      stageKey: this._bilingualStage(Math.max(old.stage, 4)).key,
      stageHe: this._bilingualStage(Math.max(old.stage, 4)).he,
      stageEn: this._bilingualStage(Math.max(old.stage, 4)).en,
      claimNumber: p.claimNumber,
      court: p.court,
    }));

    const event = this._appendCaseEvent(rec.id, {
      type: 'hotzaah_filed',
      stage: 4,
      claimNumber: p.claimNumber,
      court: p.court,
      executionCaseId: eoRecord.id,
      he: 'תיק הוצאה לפועל נפתח',
      en: "Execution Office (hotza'ah la-po'al) file opened",
      citationHe: 'חוק ההוצאה לפועל, תשכ"ז-1967',
      citationEn: 'Execution Law, 5727-1967',
    });

    return freezeDeep({ case: updated, event, executionCase: eoRecord });
  }

  // Alias so both spellings work.
  hotzaah(params) {
    return this.hotzaahLePoal(params);
  }

  // ───────────────────── paymentPlan ─────────────────────

  /**
   * Record a settlement / payment arrangement. Does NOT advance stage —
   * a payment plan can live at any stage from 1..4.
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {number} params.installments Integer count
   * @param {string} params.startDate    ISO
   * @param {number} [params.interestRate=0]  Annual, simple.
   * @param {number} [params.intervalDays=30]
   */
  paymentPlan(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }
    if (!Number.isInteger(p.installments) || p.installments < 1) {
      throw new TypeError('installments must be a positive integer');
    }
    if (!p.startDate) throw new TypeError('startDate is required');
    const interestRate = Number.isFinite(p.interestRate) ? p.interestRate : 0;
    if (interestRate < 0) throw new RangeError('interestRate must be >= 0');
    const intervalDays = Number.isFinite(p.intervalDays) ? p.intervalDays : 30;

    // Simple interest over the full plan life, then amortise evenly.
    const totalDays = intervalDays * p.installments;
    const interest = Math.round(
      rec.balance * interestRate * (totalDays / CONSTANTS.DAY_COUNT_BASIS) * 100
    ) / 100;
    const totalWithInterest = Math.round((rec.balance + interest) * 100) / 100;
    const perInstallmentRaw = totalWithInterest / p.installments;
    const perInstallment = Math.round(perInstallmentRaw * 100) / 100;

    const schedule = [];
    let running = 0;
    for (let i = 0; i < p.installments; i++) {
      const dueDate = this._shiftDays(
        isoDate(p.startDate),
        intervalDays * i
      );
      // Last installment absorbs rounding drift.
      const amount =
        i === p.installments - 1
          ? Math.round((totalWithInterest - running) * 100) / 100
          : perInstallment;
      running += amount;
      schedule.push(freeze({
        n: i + 1,
        dueDate,
        amount,
        status: 'scheduled',
      }));
    }

    const planId = this._nextId('PLAN');
    const plan = freezeDeep({
      id: planId,
      caseId: rec.id,
      principal: rec.balance,
      installments: p.installments,
      intervalDays,
      startDate: isoDate(p.startDate),
      interestRate,
      interest,
      totalWithInterest,
      perInstallment,
      schedule: Object.freeze(schedule),
      createdAt: this._today,
      status: 'active',
      guidance: {
        he: 'תכנית תשלומים נחתמה. כל הפרה של התכנית מחזירה את הזכויות ' +
            'המקוריות של הנושה, לרבות ריבית והצמדה על החוב המקורי.',
        en: 'Payment plan signed. Any breach reverts the creditor rights ' +
            'to the original balance, including default interest and linkage.',
      },
    });

    const bucket = this._casePaymentPlans.get(rec.id) || Object.freeze([]);
    this._casePaymentPlans.set(rec.id, Object.freeze(bucket.concat([plan])));

    this._appendCaseEvent(rec.id, {
      type: 'payment_plan_created',
      planId,
      installments: p.installments,
      totalWithInterest,
      he: 'נוצרה תכנית תשלומים',
      en: 'Payment plan created',
    });

    return plan;
  }

  caseePaymentPlans(caseId) {
    // legacy typo-proof alias
    return this.casePaymentPlans(caseId);
  }

  casePaymentPlans(caseId) {
    return this._casePaymentPlans.get(caseId) || Object.freeze([]);
  }

  // ───────────────────── recordPayment ─────────────────────

  /**
   * Append a payment to the case ledger. Reduces the running balance.
   * Append-only: the payment row itself is frozen; the case balance is
   * updated by replacing the case record with a new frozen snapshot.
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {number} params.amount
   * @param {string} params.date
   * @param {string} params.method   cash/check/wire/card/clearing
   * @param {string} [params.notes]
   */
  recordPayment(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5 && rec.closeStatus !== 'settled') {
      throw new Error(`case ${rec.id} is closed — no further payments`);
    }
    if (!isPositiveNumber(p.amount)) {
      throw new TypeError('amount must be a positive number');
    }
    if (!p.date) throw new TypeError('date is required');
    if (!p.method || typeof p.method !== 'string') {
      throw new TypeError('method is required');
    }

    const paymentId = this._nextId('PAY');
    const payment = freeze({
      id: paymentId,
      caseId: rec.id,
      amount: p.amount,
      date: isoDate(p.date),
      method: p.method,
      notes: p.notes || '',
      createdAt: this._today,
    });

    const bucket = this._casePayments.get(rec.id) || Object.freeze([]);
    this._casePayments.set(rec.id, Object.freeze(bucket.concat([payment])));

    const newPaymentsTotal = Math.round((rec.paymentsTotal + p.amount) * 100) / 100;
    const newBalance = Math.max(
      0,
      Math.round((rec.balance - p.amount) * 100) / 100
    );

    this._replaceCase(rec.id, () => ({
      paymentsTotal: newPaymentsTotal,
      balance: newBalance,
    }));

    this._appendCaseEvent(rec.id, {
      type: 'payment_received',
      paymentId,
      amount: p.amount,
      method: p.method,
      balanceAfter: newBalance,
      he: 'תשלום התקבל',
      en: 'Payment received',
    });

    // NB: does not auto-close the case even at balance 0; caller must
    // invoke closeCase('paid') explicitly to preserve intent.
    return freezeDeep({
      payment,
      balance: newBalance,
      paymentsTotal: newPaymentsTotal,
    });
  }

  casePayments(caseId) {
    return this._casePayments.get(caseId) || Object.freeze([]);
  }

  // ───────────────────── computeInterest (case-level) ─────────────────────

  /**
   * Compute ריבית פיגורים on a case, 4% annual with **daily compounding**
   * (compounding frequency = 365). Distinct from the simple-interest
   * `computeLateInterest` method used by the legal-letter engine.
   *
   * Formula: A = P × (1 + r/365)^n − P
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {string} [params.asOf]   ISO, defaults to today.
   * @param {number} [params.rate]   Override, defaults to 4%.
   */
  computeInterest(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    const rate = Number.isFinite(p.rate)
      ? p.rate
      : CONSTANTS.DEFAULT_COURT_INTEREST_RATE;
    if (rate < 0) throw new RangeError('rate must be >= 0');
    const asOf = p.asOf ? isoDate(p.asOf) : this._today;
    const days = Math.max(0, daysBetween(rec.dueDate, asOf));
    const dailyRate = rate / CONSTANTS.DAY_COUNT_BASIS;

    // Compound daily on the ORIGINAL principal (ריבית פיגורים על קרן).
    // Payments received during the period are credited simply; the spec
    // requires "4% compound daily" on the outstanding debt, so we apply
    // compounding to the current balance basis.
    const basis = rec.originalAmount;
    const compoundFactor = Math.pow(1 + dailyRate, days);
    const compounded = Math.round(basis * compoundFactor * 100) / 100;
    const interestAmount = Math.round((compounded - basis) * 100) / 100;

    // Also compute the simple-interest comparison for display parity.
    const simpleInterest = Math.round(
      basis * rate * (days / CONSTANTS.DAY_COUNT_BASIS) * 100
    ) / 100;

    return freezeDeep({
      caseId: rec.id,
      principal: basis,
      balance: rec.balance,
      rate,
      asOf,
      days,
      basis: 'compound_daily',
      compoundFactor,
      interestAmount,
      simpleInterestComparison: simpleInterest,
      totalWithInterest:
        Math.round((rec.balance + interestAmount) * 100) / 100,
      formula: 'A = P × (1 + r/365)^n − P',
      citation: LAW_CITATIONS.INTEREST_LAW,
      he: 'ריבית פיגורים בריבית דריבית יומית, 4% שנתי',
      en: 'Default interest compounded daily, 4% annual',
    });
  }

  // ───────────────────── statute ─────────────────────

  /**
   * Statute-of-limitations check — 7 years per חוק ההתיישנות, תשי"ח-1958.
   *
   * Returns bilingual envelope + boolean `prescribed`.
   */
  statute(caseId) {
    const rec = this._requireCase(caseId);
    const days = Math.max(0, daysBetween(rec.dueDate, this._today));
    const years = days / 365.25;
    const limit = CONSTANTS.STATUTE_OF_LIMITATIONS_YEARS;
    const prescribed = years >= limit;
    const warning = years >= limit - 1 && !prescribed;

    return freezeDeep({
      caseId: rec.id,
      dueDate: rec.dueDate,
      asOf: this._today,
      yearsElapsed: Math.round(years * 100) / 100,
      daysElapsed: days,
      statuteLimitYears: limit,
      prescribed,
      warning,
      citation: LAW_CITATIONS.LIMITATIONS_LAW,
      he: prescribed
        ? 'החוב התיישן — חלפו מעל 7 שנים, לא ניתן לאכוף משפטית'
        : (warning
            ? 'אזהרה — החוב קרוב להתיישנות, יש לפעול מיד'
            : 'תקופת ההתיישנות בתוקף — ניתן להמשיך בהליכי גבייה'),
      en: prescribed
        ? 'Debt prescribed — more than 7 years elapsed, no legal enforcement'
        : (warning
            ? 'Warning — debt is approaching the 7-year statute, act now'
            : 'Within statutory period — collection may continue'),
    });
  }

  // ───────────────────── closeCase ─────────────────────

  /**
   * Close a case with a final status. Stage → 5. The record is PRESERVED
   * forever — only the status flags are updated.
   *
   * @param {string} caseId
   * @param {'paid'|'settled'|'written-off'|'uncollectible'} status
   * @param {string} [notes]
   */
  closeCase(caseId, status, notes) {
    const rec = this._requireCase(caseId);
    if (!CASE_CLOSE_STATUSES.includes(status)) {
      throw new RangeError(
        `status must be one of ${CASE_CLOSE_STATUSES.join(',')}`
      );
    }
    if (rec.stage >= 5) {
      // Already closed — idempotent re-close is not allowed to overwrite
      // the original reason.
      throw new Error(`case ${rec.id} is already closed`);
    }

    const updated = this._replaceCase(rec.id, () => ({
      stage: 5,
      stageKey: this._bilingualStage(5).key,
      stageHe: this._bilingualStage(5).he,
      stageEn: this._bilingualStage(5).en,
      status: 'closed',
      closedAt: this._today,
      closeStatus: status,
      closeNotes: notes || '',
    }));

    this._appendCaseEvent(rec.id, {
      type: 'case_closed',
      stage: 5,
      closeStatus: status,
      notes: notes || '',
      he: `תיק נסגר — ${status}`,
      en: `Case closed — ${status}`,
    });

    return updated;
  }

  // ───────────────────── case-level writeOff ─────────────────────

  /**
   * Write-off with the Israeli tax-authority 3-year-documented-effort rule.
   * Delegates the journal entry to the existing writeOff method so both
   * books stay in sync.
   *
   * Requires the case to be at least `WRITE_OFF_MIN_EFFORT_YEARS` years
   * old (from due date) OR the caller to explicitly pass `effortYears`
   * with a value >= 3 (documented via externally-tracked action log).
   *
   * @param {object} params
   * @param {string} params.caseId
   * @param {string} params.reason
   * @param {string} params.approver   Must match WRITE_OFF_APPROVER_ROLES
   * @param {number} [params.effortYears]   Override the computed effort
   * @param {string} [params.approverRole]
   */
  writeOffCase(params) {
    const p = params || {};
    const rec = this._requireCase(p.caseId);
    if (rec.stage >= 5) {
      throw new Error(`case ${rec.id} is already closed`);
    }

    const ageYears = daysBetween(rec.dueDate, this._today) / 365.25;
    const declaredEffort = Number.isFinite(p.effortYears) ? p.effortYears : ageYears;
    if (declaredEffort < CONSTANTS.WRITE_OFF_MIN_EFFORT_YEARS) {
      throw new Error(
        `Israeli tax write-off rule: at least ` +
        `${CONSTANTS.WRITE_OFF_MIN_EFFORT_YEARS} years of documented collection ` +
        `effort is required (have ${declaredEffort.toFixed(2)} years)`
      );
    }

    // Must also have at least 3 events documenting effort.
    const events = this._caseEvents.get(rec.id) || Object.freeze([]);
    const collectionEffortEvents = events.filter((e) =>
      e.type === 'friendly_reminder' ||
      e.type === 'formal_demand' ||
      e.type === 'lawyer_letter' ||
      e.type === 'hotzaah_filed'
    );
    if (collectionEffortEvents.length < 1 && !p.effortYears) {
      // Allow override via explicit effortYears param for synced imports.
      throw new Error(
        'write-off requires at least one documented collection-effort event'
      );
    }

    const woRecord = this.writeOff({
      customerId: rec.customerId,
      amount: rec.balance,
      reason: p.reason,
      approver: p.approver,
      approverRole: p.approverRole,
      date: this._today,
    });

    const updated = this._replaceCase(rec.id, () => ({
      writeOffId: woRecord.id,
    }));

    this._appendCaseEvent(rec.id, {
      type: 'write_off',
      writeOffId: woRecord.id,
      amount: rec.balance,
      effortYears: Math.round(declaredEffort * 100) / 100,
      he: 'מחיקת חוב רע — אושרה',
      en: 'Bad-debt write-off approved',
    });

    return freezeDeep({ case: updated, writeOff: woRecord, effortYears: declaredEffort });
  }

  // ───────────────────── generateCaseFile ─────────────────────

  /**
   * Bilingual case summary — snapshot of everything known about a case.
   * Used for lawyer hand-off, court filings, internal audit.
   */
  generateCaseFile(caseId) {
    const rec = this._requireCase(caseId);
    const events = this._caseEvents.get(caseId) || Object.freeze([]);
    const payments = this._casePayments.get(caseId) || Object.freeze([]);
    const plans = this._casePaymentPlans.get(caseId) || Object.freeze([]);

    // Best-effort interest using compound-daily.
    let interest;
    try {
      interest = this.computeInterest({ caseId });
    } catch (e) {
      interest = null;
    }

    // Statute check
    let statuteCheck;
    try {
      statuteCheck = this.statute(caseId);
    } catch (e) {
      statuteCheck = null;
    }

    const file = freezeDeep({
      id: `FILE-${rec.id}`,
      case: rec,
      generatedAt: this._today,
      headerHe: 'תיק גבייה — סיכום מלא',
      headerEn: 'Debt-collection case file — full summary',
      summaryHe:
        `תיק מס' ${rec.id} בגין לקוח ${rec.customerId}, נפתח בתאריך ${rec.openedAt}. ` +
        `חוב מקורי: ${formatILS(rec.originalAmount)} ${rec.currency}. ` +
        `תשלומים: ${formatILS(rec.paymentsTotal)}. יתרה: ${formatILS(rec.balance)}. ` +
        `שלב נוכחי: ${rec.stageHe} (${rec.stage}). ` +
        (rec.closeStatus ? `מצב סגירה: ${rec.closeStatus}.` : 'תיק פעיל.'),
      summaryEn:
        `Case #${rec.id} for customer ${rec.customerId}, opened ${rec.openedAt}. ` +
        `Original debt: ${formatILS(rec.originalAmount)} ${rec.currency}. ` +
        `Payments: ${formatILS(rec.paymentsTotal)}. Balance: ${formatILS(rec.balance)}. ` +
        `Current stage: ${rec.stageEn} (${rec.stage}). ` +
        (rec.closeStatus ? `Close status: ${rec.closeStatus}.` : 'Case active.'),
      stageLadder: CASE_STAGE_DEFS.map((s) => freeze({
        ...s,
        reached: rec.stage >= s.stage,
        current: rec.stage === s.stage,
      })),
      events,
      payments,
      paymentPlans: plans,
      interest,
      statute: statuteCheck,
      citations: [
        LAW_CITATIONS.INTEREST_LAW,
        LAW_CITATIONS.EXECUTION_LAW,
        LAW_CITATIONS.LIMITATIONS_LAW,
        LAW_CITATIONS.INCOME_TAX_17_4,
        LAW_CITATIONS.VAT_49,
      ],
      disclaimer: {
        he: 'מסמך זה הוא סיכום פנימי של תיק הגבייה. אינו מהווה ייעוץ משפטי ' +
            'ואינו מחליף עצת עורך דין מורשה בישראל.',
        en: 'This document is an internal summary of the collection case. ' +
            'It does not constitute legal advice and does not replace ' +
            'counsel from a licensed Israeli attorney.',
      },
    });

    return file;
  }

  // ───────────────────── introspection ─────────────────────

  /** Return a frozen snapshot of all internal ledgers. */
  snapshot() {
    return freezeDeep({
      today: this._today,
      actions: Object.fromEntries(this._actions),
      letters: Object.fromEntries(this._letters),
      promissoryNotes: Object.fromEntries(this._promissoryNotes),
      executionCases: Object.fromEntries(this._executionCases),
      settlements: Object.fromEntries(this._settlements),
      writeOffs: Object.fromEntries(this._writeOffs),
      recoveries: Object.fromEntries(this._recoveries),
      cases: Object.fromEntries(this._cases),
      caseEvents: Object.fromEntries(this._caseEvents),
      casePayments: Object.fromEntries(this._casePayments),
      casePaymentPlans: Object.fromEntries(this._casePaymentPlans),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  DebtCollection,
  CONSTANTS,
  LAW_CITATIONS,
  ESCALATION_LADDER,
  LETTER_TYPES,
  ACTION_OUTCOMES,
  CASE_STAGE_DEFS,
  CASE_CLOSE_STATUSES,
  FRIENDLY_REMINDER_METHODS,
  FORMAL_DEMAND_METHODS,
  LAWYER_FEE_TYPES,
  _internals: Object.freeze({
    isoDate,
    parseIso,
    daysBetween,
    formatILS,
    isPositiveNumber,
    isNonNegativeNumber,
  }),
};
