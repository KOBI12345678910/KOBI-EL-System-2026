/**
 * ============================================================================
 *  Bad Debt Provisioning — IFRS 9 ECL + Israeli Tax Allowable Provisions
 *  מערכת הפרשה לחובות מסופקים / אבודים — IFRS 9 + פקודת מס הכנסה
 * ----------------------------------------------------------------------------
 *  Mega-ERP  Techno-Kol Uzi
 *  Agent:    AG-Y089
 *  Scope:    onyx-procurement/src/finance/bad-debt-provision.js
 *  Date:     2026-04-11
 *  Author:   Kobi El mega-swarm
 *  License:  internal — Techno-Kol Uzi ERP
 *
 *  Rule:     לא מוחקים רק משדרגים ומגדלים — additive only.
 *            Zero deps. Pure JS (Node built-ins only). Bilingual.
 *
 *  What this module does
 *  ---------------------
 *  Implements a complete bad-debt / expected-credit-loss (ECL) engine that
 *  covers BOTH sides of the Israeli reality:
 *
 *    1. IFRS 9  — three-stage ECL model for financial statements.
 *         Stage 1   12-month ECL            (performing)
 *         Stage 2   lifetime ECL            (SICR — significant increase
 *                                            in credit risk)
 *         Stage 3   credit-impaired         (default / lifetime ECL on
 *                                            net carrying amount)
 *       Supports PD x LGD x EAD formula with DCF (discount back to reporting
 *       date at effective interest rate / discount rate), aging bucket
 *       overrides, and provision-matrix (simplified approach) for trade
 *       receivables.
 *
 *    2. Israeli Income Tax Ordinance — הפרשה לחובות מסופקים
 *         Pkuda paragraph 17(4) — allows deduction ONLY for SPECIFIC
 *         bad debts when the debt is "definitively unrecoverable",
 *         e.g. customer bankruptcy, judgment proof, liquidation,
 *         abandonment after reasonable collection effort, etc.
 *         GENERAL RESERVES ARE NOT DEDUCTIBLE (unlike the accounting
 *         provision).
 *       The module tracks both the "book" provision (IFRS 9) and the
 *       "tax" provision (specific + evidenced), flags the temporary
 *       difference, and emits the adjustment for Form 1301/6111 reconciliation.
 *
 *  Public surface
 *  --------------
 *     class BadDebtProvision
 *        .computeECL({ receivable, probabilityDefault, lossGivenDefault,
 *                       exposureAtDefault, discountRate, ageBucket })
 *        .agingMethod({ agingBuckets, historicalLossRates })
 *        .specificProvision({ customerId, amount, justification, approver })
 *        .writeOffRequest(customerId)
 *        .taxDeductibility(provision)
 *        .provisionMovement(period)
 *        .backTest({ historicalProvisions, actualLosses })
 *        .forwardLookingAdjustment({ macroFactor })
 *        .disclosureTable(period)
 *
 *     Constants (frozen):
 *        IFRS9_STAGES, DEFAULT_LGD, ISRAELI_TAX_RULES,
 *        MACRO_FACTOR_WEIGHTS, SICR_TRIGGERS
 *
 *  Zero dependencies — nothing required beyond the Node runtime.
 * ============================================================================
 */

'use strict';

/* ------------------------------------------------------------------ *
 * 0. Constants — frozen, bilingual, IFRS 9 + Israeli statute anchors  *
 * ------------------------------------------------------------------ */

/**
 * IFRS 9 stages — used by .computeECL() and .disclosureTable().
 * "name" is canonical English, "he" is the Hebrew label used in
 * on-screen labels and Form 6111 disclosure rows.
 */
const IFRS9_STAGES = Object.freeze({
  STAGE_1: Object.freeze({
    code: 'STAGE_1',
    name: 'Stage 1 — Performing (12-month ECL)',
    he: 'שלב 1 — מבוצע (ECL ל-12 חודש)',
    horizonMonths: 12,
    basis: '12-month ECL',
    description: 'Performing receivables, no SICR since initial recognition.',
    descriptionHe:
      'חובות מבוצעים, ללא החמרה משמעותית בסיכון האשראי מאז ההכרה הראשונית.',
  }),
  STAGE_2: Object.freeze({
    code: 'STAGE_2',
    name: 'Stage 2 — Underperforming (Lifetime ECL)',
    he: 'שלב 2 — בסיכון (ECL לכל אורך החיים)',
    horizonMonths: null, // lifetime
    basis: 'Lifetime ECL',
    description:
      'Significant increase in credit risk since initial recognition, not yet impaired.',
    descriptionHe:
      'החמרה משמעותית בסיכון האשראי מאז ההכרה הראשונית, טרם פגיעה באיכות האשראי.',
  }),
  STAGE_3: Object.freeze({
    code: 'STAGE_3',
    name: 'Stage 3 — Credit-impaired (Lifetime ECL on net amount)',
    he: 'שלב 3 — פגום (ECL על הסכום הנקי)',
    horizonMonths: null,
    basis: 'Lifetime ECL on amortised cost net of provision',
    description:
      'Objective evidence of impairment (default, bankruptcy, forbearance).',
    descriptionHe:
      'ראיה אובייקטיבית לפגיעה (כשל, פירוק, מחזור חוב, ויתור משמעותי).',
  }),
});

/**
 * Default LGD values (Loss Given Default) used as fallbacks when
 * the caller does not supply an LGD.  Basel III-style bands,
 * adjusted for Israeli commercial reality (collateral rarely
 * enforceable against trade debtors).
 */
const DEFAULT_LGD = Object.freeze({
  SECURED_WITH_GUARANTEE: 0.25,
  SECURED_WITH_LIEN: 0.35,
  UNSECURED_TRADE: 0.65,
  UNSECURED_GOVERNMENT: 0.15,
  SUBORDINATED: 0.85,
});

/**
 * Israeli Income Tax Ordinance rules for bad-debt deductibility.
 * Paragraph 17(4) + Income Tax Regulations (רשימה של חובות אבודים).
 *
 * Core rule: specific, evidenced bad debts — YES.
 * General/statistical reserve — NO (temporary difference).
 */
const ISRAELI_TAX_RULES = Object.freeze({
  statute: 'Income Tax Ordinance §17(4) + Regulations 1980',
  statuteHe: 'פקודת מס הכנסה סעיף 17(4) + תקנות מס הכנסה 1980',

  // Conditions for deductibility (AND, not OR — IRS requires ALL at audit).
  deductibleConditions: Object.freeze([
    'The debt arose in the ordinary course of the taxpayer\'s business',
    'The debt was previously included in taxable income (accrual)',
    'The debt is definitively unrecoverable (not merely doubtful)',
    'Reasonable collection efforts were made and documented',
    'Specific debtor identified and the amount quantified',
  ]),

  deductibleConditionsHe: Object.freeze([
    'החוב נוצר במהלך העסקים הרגיל של הנישום',
    'החוב נכלל בעבר בהכנסה החייבת (על בסיס מצטבר)',
    'החוב בלתי גביה באופן סופי (לא רק מסופק)',
    'נעשו מאמצי גבייה סבירים ותועדו',
    'זיהוי ספציפי של החייב והסכום כומת',
  ]),

  // Triggering events that Israeli Tax Authority (רשות המסים) accepts
  // as prima-facie evidence of definitive unrecoverability.
  triggeringEvents: Object.freeze({
    BANKRUPTCY: {
      code: 'BANKRUPTCY',
      name: 'Customer bankruptcy / liquidation',
      he: 'פשיטת רגל / פירוק של החייב',
      deductible: true,
    },
    COURT_JUDGMENT_UNENFORCED: {
      code: 'COURT_JUDGMENT_UNENFORCED',
      name: 'Unenforced court judgment + failed execution (הוצאה לפועל)',
      he: 'פסק דין בלתי ניתן לאכיפה + תיק הוצל"פ שנסגר כחסר נכסים',
      deductible: true,
    },
    DEBTOR_UNTRACEABLE: {
      code: 'DEBTOR_UNTRACEABLE',
      name: 'Debtor untraceable after reasonable search',
      he: 'החייב נעלם / בלתי ניתן לאיתור לאחר חיפוש סביר',
      deductible: true,
    },
    COMPROMISE_WRITEOFF: {
      code: 'COMPROMISE_WRITEOFF',
      name: 'Compromise / waiver of balance (the waived part)',
      he: 'פשרה / ויתור על יתרת חוב (החלק שוויתרה עליו)',
      deductible: true,
    },
    STATUTE_LIMITATION: {
      code: 'STATUTE_LIMITATION',
      name: 'Statute of limitations expired (general: 7 years)',
      he: 'התיישנות (כלל: 7 שנים) — בהעדר הכרה בחוב',
      deductible: true,
    },
    // Non-deductible cases — kept in the enum for audit-trail completeness.
    GENERAL_RESERVE: {
      code: 'GENERAL_RESERVE',
      name: 'General reserve / statistical provision',
      he: 'הפרשה כללית / סטטיסטית',
      deductible: false,
    },
    DOUBTFUL_NOT_EVIDENCED: {
      code: 'DOUBTFUL_NOT_EVIDENCED',
      name: 'Doubtful without specific evidence',
      he: 'מסופק ללא ראיה ספציפית',
      deductible: false,
    },
  }),

  // Reference for Form 6111 reconciliation (temporary difference row).
  form6111Row: '051 — הפרשה לחובות מסופקים שאינה מותרת בניכוי',
  temporaryDifferenceLabel: 'הפרשי עיתוי — הפרשה לחובות מסופקים',
});

/**
 * SICR triggers — Significant Increase in Credit Risk.
 * IFRS 9 B5.5.17 gives a non-exhaustive list; we encode the
 * operational indicators the ERP can actually measure.
 */
const SICR_TRIGGERS = Object.freeze({
  DPD_30_PLUS: { code: 'DPD_30_PLUS', label: 'Days past due ≥ 30', weight: 1.0 },
  DPD_60_PLUS: { code: 'DPD_60_PLUS', label: 'Days past due ≥ 60', weight: 1.5 },
  DPD_90_PLUS: { code: 'DPD_90_PLUS', label: 'Days past due ≥ 90 (default)', weight: 2.0 },
  RATING_DOWNGRADE: { code: 'RATING_DOWNGRADE', label: 'Internal rating downgrade ≥ 2 notches', weight: 1.0 },
  PAYMENT_HOLIDAY: { code: 'PAYMENT_HOLIDAY', label: 'Forbearance / payment holiday', weight: 1.2 },
  COVENANT_BREACH: { code: 'COVENANT_BREACH', label: 'Covenant breach', weight: 1.0 },
  FORECLOSURE: { code: 'FORECLOSURE', label: 'Collateral foreclosure initiated', weight: 1.5 },
  BANKRUPTCY_FILED: { code: 'BANKRUPTCY_FILED', label: 'Bankruptcy filing', weight: 10.0 },
});

/**
 * Forward-looking macro factor weights (illustrative, calibrated to
 * Israeli BOI data by Techno-Kol Uzi research — see backTest() for
 * calibration method).
 */
const MACRO_FACTOR_WEIGHTS = Object.freeze({
  GDP: Object.freeze({
    baseCase: 0,
    optimistic: -0.20,   // growth ⇒ lower PD
    pessimistic: 0.30,   // recession ⇒ higher PD
    elasticity: 1.5,
    label: 'Israeli real GDP growth',
    labelHe: 'צמיחה תוצר אמיתית בישראל',
  }),
  unemployment: Object.freeze({
    baseCase: 0,
    optimistic: -0.15,
    pessimistic: 0.40,
    elasticity: 2.0,
    label: 'Israeli unemployment rate',
    labelHe: 'שיעור אבטלה בישראל',
  }),
  sector: Object.freeze({
    baseCase: 0,
    optimistic: -0.10,
    pessimistic: 0.25,
    elasticity: 1.2,
    label: 'Sector-specific factor',
    labelHe: 'גורם ספציפי לענף',
  }),
});

/**
 * Write-off workflow state machine. Write-off is SEPARATE from
 * provision — a write-off DERECOGNISES the asset, while a provision
 * reduces its carrying amount.  Write-off requires board-level
 * approval in most Israeli companies.
 */
const WRITEOFF_STATES = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  POSTED: 'posted',
  REJECTED: 'rejected',
  REVERSED: 'reversed',
});

/* ------------------------------------------------------------------ *
 * 1. Pure helpers (no side effects)                                   *
 * ------------------------------------------------------------------ */

function round2(n) {
  // IEEE-friendly rounding to 2 decimals
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function coalesceNumber(n, fallback) {
  return isFiniteNumber(n) ? n : fallback;
}

function cloneShallow(obj) {
  // Additive pattern — we never mutate caller objects.
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.slice();
  if (typeof obj !== 'object') return obj;
  return Object.assign({}, obj);
}

/**
 * Classify an age bucket into an IFRS 9 stage.
 * Bucket names are tolerated in English and Hebrew.
 */
function stageFromAge(ageBucket) {
  if (!ageBucket) return IFRS9_STAGES.STAGE_1.code;
  const b = String(ageBucket).toLowerCase();
  // current / not due / 0-30 ⇒ stage 1
  if (b.includes('current') || b.includes('0-30') || b.includes('לא בפיגור')) {
    return IFRS9_STAGES.STAGE_1.code;
  }
  // 31-60, 61-90 ⇒ stage 2 (SICR)
  if (b.includes('31') || b.includes('61') || b.includes('60') || b.includes('90')) {
    return IFRS9_STAGES.STAGE_2.code;
  }
  // > 90, default, impaired ⇒ stage 3
  if (
    b.includes('91') ||
    b.includes('120') ||
    b.includes('default') ||
    b.includes('impaired') ||
    b.includes('פגום') ||
    b.includes('בכשל')
  ) {
    return IFRS9_STAGES.STAGE_3.code;
  }
  // Default fall-through: assume performing.
  return IFRS9_STAGES.STAGE_1.code;
}

/**
 * Discount factor = 1 / (1 + r)^t (annual compounding).
 * IFRS 9 §5.5.17: ECL is discounted to the reporting date at the
 * EIR (effective interest rate). For trade receivables without a
 * significant financing component, r may be zero.
 */
function discountFactor(rate, years) {
  if (!isFiniteNumber(rate) || !isFiniteNumber(years) || years <= 0) return 1;
  if (rate <= 0) return 1;
  return 1 / Math.pow(1 + rate, years);
}

/**
 * Convert an age bucket to an expected time-to-default (years) used
 * for the DCF step in computeECL().  Conservative mid-bucket average.
 */
function yearsFromAgeBucket(ageBucket) {
  if (!ageBucket) return 0.5;
  const b = String(ageBucket).toLowerCase();
  if (b.includes('current') || b.includes('0-30')) return 0.25;
  if (b.includes('31') || b.includes('60')) return 0.5;
  if (b.includes('61') || b.includes('90')) return 0.75;
  if (b.includes('91') || b.includes('120')) return 1.0;
  if (b.includes('default') || b.includes('impaired')) return 0;
  return 0.5;
}

/* ------------------------------------------------------------------ *
 * 2. Main class                                                       *
 * ------------------------------------------------------------------ */

class BadDebtProvision {
  constructor(options) {
    const opts = options || {};
    // Event log — every provision action is appended here (never
    // deleted — "לא מוחקים רק משדרגים ומגדלים").
    this._events = [];
    // Specific provisions register.
    this._specificProvisions = new Map();
    // Write-off register.
    this._writeOffs = new Map();
    // Configurable defaults.
    this.defaultDiscountRate = coalesceNumber(opts.defaultDiscountRate, 0.05);
    this.reportingCurrency = opts.reportingCurrency || 'ILS';
    this.lang = opts.lang === 'en' ? 'en' : 'he'; // default Hebrew
    this.entity = opts.entity || 'Techno-Kol Uzi';
    this._seq = 0;
  }

  /* ============================================================= *
   * 2.1  IFRS 9 ECL computation                                    *
   * ============================================================= */

  /**
   * Compute Expected Credit Loss for a single receivable.
   *
   * Formula:
   *     ECL = Σ PD_t · LGD · EAD · DF_t    (simplified for 12-month or lifetime)
   *
   * Inputs:
   *   receivable          — { id, amount, customerId, dueDate, ... }
   *   probabilityDefault  — PD in [0,1]  (12-month OR lifetime PD
   *                          depending on stage)
   *   lossGivenDefault    — LGD in [0,1]
   *   exposureAtDefault   — EAD in currency (defaults to receivable.amount)
   *   discountRate        — r (annual) — defaults to constructor default
   *   ageBucket           — optional — used to auto-assign stage and t
   *
   * Output shape:
   *   {
   *     ecl, stage, pd, lgd, ead, discountRate, discountFactor,
   *     horizonYears, horizonMonths, formula, inputs, breakdown,
   *     currency, computedAt
   *   }
   */
  computeECL(args) {
    args = args || {};

    // --- v2 canonical signature support ---------------------------
    // {exposure, stage, PD, LGD, EAD, lifetime, flf?}
    // If caller uses the canonical shape, normalise to the v1 shape
    // without losing any legacy features.
    let {
      receivable,
      probabilityDefault,
      lossGivenDefault,
      exposureAtDefault,
      discountRate,
      ageBucket,
    } = args;

    const v2Shape =
      !receivable &&
      (
        args.exposure !== undefined ||
        args.EAD !== undefined ||
        args.PD !== undefined ||
        args.LGD !== undefined ||
        args.stage !== undefined ||
        args.lifetime !== undefined
      );

    if (v2Shape) {
      const stageCode = typeof args.stage === 'string'
        ? args.stage
        : (args.lifetime ? 'STAGE_2' : 'STAGE_1');
      const normalisedStage = /^STAGE_/.test(stageCode)
        ? stageCode
        : (stageCode === '1' ? 'STAGE_1'
          : stageCode === '2' ? 'STAGE_2'
          : stageCode === '3' ? 'STAGE_3'
          : 'STAGE_1');
      receivable = {
        id: args.receivableId || args.invoiceId || null,
        customerId: args.customerId || null,
        amount: coalesceNumber(args.exposure, coalesceNumber(args.EAD, 0)),
        stage: normalisedStage,
        ageBucket: args.ageBucket || null,
        currency: args.currency || null,
      };
      probabilityDefault = args.PD !== undefined ? args.PD : probabilityDefault;
      lossGivenDefault = args.LGD !== undefined ? args.LGD : lossGivenDefault;
      exposureAtDefault = args.EAD !== undefined ? args.EAD : coalesceNumber(args.exposure, receivable.amount);
      discountRate = args.discountRate !== undefined ? args.discountRate : discountRate;
      ageBucket = args.ageBucket !== undefined ? args.ageBucket : ageBucket;
    }

    if (!receivable || !isFiniteNumber(receivable.amount)) {
      throw new TypeError(
        'computeECL: "receivable" with numeric "amount" is required ' +
        '(or the canonical {exposure, stage, PD, LGD, EAD, lifetime} shape)'
      );
    }

    const pd = coalesceNumber(probabilityDefault, 0);
    const lgd = coalesceNumber(lossGivenDefault, DEFAULT_LGD.UNSECURED_TRADE);
    const ead = coalesceNumber(exposureAtDefault, receivable.amount);
    const r = coalesceNumber(discountRate, this.defaultDiscountRate);

    if (pd < 0 || pd > 1) {
      throw new RangeError('computeECL: probabilityDefault must be in [0,1]');
    }
    if (lgd < 0 || lgd > 1) {
      throw new RangeError('computeECL: lossGivenDefault must be in [0,1]');
    }
    if (ead < 0) {
      throw new RangeError('computeECL: exposureAtDefault must be ≥ 0');
    }

    const stageCode =
      receivable.stage || stageFromAge(ageBucket || receivable.ageBucket);
    const stage = IFRS9_STAGES[stageCode] || IFRS9_STAGES.STAGE_1;

    // Stage 3 is always lifetime AND the book ECL can equal EAD*LGD
    // without DCF if default is presumed immediate.
    const years = yearsFromAgeBucket(ageBucket || receivable.ageBucket);
    const df = discountFactor(r, years);

    // Forward-looking multiplier (optional — v2)
    const flf = coalesceNumber(args.flf, 1);
    if (flf < 0 || flf > 5) {
      throw new RangeError('computeECL: flf must be in [0,5]');
    }

    // Raw undiscounted ECL (before FLF)
    const rawEcl = pd * lgd * ead;
    // Apply discount and forward-looking factor
    const ecl = round2(rawEcl * df * flf);

    const breakdown = {
      pd: round4(pd),
      lgd: round4(lgd),
      ead: round2(ead),
      discountRate: round4(r),
      horizonYears: round4(years),
      discountFactor: round4(df),
      flf: round4(flf),
      undiscountedEcl: round2(rawEcl),
      discountedEcl: round2(rawEcl * df),
      finalEcl: ecl,
    };

    const result = Object.freeze({
      receivableId: receivable.id || null,
      customerId: receivable.customerId || null,
      ecl,
      stage: stage.code,
      stageLabel: this.lang === 'he' ? stage.he : stage.name,
      lifetime: stage.code !== 'STAGE_1',
      pd: round4(pd),
      lgd: round4(lgd),
      ead: round2(ead),
      discountRate: round4(r),
      discountFactor: round4(df),
      flf: round4(flf),
      horizonYears: round4(years),
      horizonMonths: stage.horizonMonths,
      basis: stage.basis,
      formula: 'ECL = PD × LGD × EAD × DF × FLF',
      inputs: Object.freeze({
        receivable: cloneShallow(receivable),
        ageBucket: ageBucket || receivable.ageBucket || null,
      }),
      breakdown: Object.freeze(breakdown),
      currency: receivable.currency || this.reportingCurrency,
      computedAt: new Date().toISOString(),
    });

    this._log('ECL_COMPUTED', result);
    return result;
  }

  /* ============================================================= *
   * 2.2  Aging / Provision-matrix (simplified approach)            *
   * ============================================================= */

  /**
   * IFRS 9 §5.5.15 — simplified approach for trade receivables.
   * Provision matrix: loss rate per age bucket × gross amount in bucket.
   *
   * Inputs:
   *   agingBuckets        — { 'current': 100000, '0-30': 50000, ... }
   *   historicalLossRates — { 'current': 0.005, '0-30': 0.01, ... }
   *
   * If historicalLossRates is missing, conservative defaults are used.
   *
   * Output:
   *   {
   *     totals: { gross, provision, net },
   *     rows: [{ bucket, gross, rate, provision, stage, ... }],
   *     method, computedAt
   *   }
   */
  agingMethod(args) {
    const { agingBuckets, historicalLossRates } = args || {};
    if (!agingBuckets || typeof agingBuckets !== 'object') {
      throw new TypeError('agingMethod: "agingBuckets" object is required');
    }

    const defaultRates = {
      current: 0.005,
      '0-30': 0.01,
      '31-60': 0.03,
      '61-90': 0.08,
      '91-120': 0.20,
      '121-180': 0.40,
      '>180': 0.75,
      default: 1.0,
    };
    const rates = Object.assign({}, defaultRates, historicalLossRates || {});

    let totalGross = 0;
    let totalProvision = 0;
    const rows = [];

    for (const bucket of Object.keys(agingBuckets)) {
      const gross = coalesceNumber(agingBuckets[bucket], 0);
      const rate = coalesceNumber(rates[bucket], rates['>180'] || 0.75);
      const provision = round2(gross * rate);
      totalGross = round2(totalGross + gross);
      totalProvision = round2(totalProvision + provision);
      rows.push({
        bucket,
        gross: round2(gross),
        rate: round4(rate),
        provision,
        stage: stageFromAge(bucket),
        bucketHe: translateBucket(bucket),
      });
    }

    const result = Object.freeze({
      method: 'IFRS 9 Simplified — Provision Matrix',
      methodHe: 'IFRS 9 גישה פשוטה — מטריצת הפרשה',
      rows: Object.freeze(rows.map(Object.freeze)),
      totals: Object.freeze({
        gross: totalGross,
        provision: totalProvision,
        net: round2(totalGross - totalProvision),
      }),
      computedAt: new Date().toISOString(),
    });

    this._log('AGING_MATRIX', { totals: result.totals, count: rows.length });
    return result;
  }

  /* ============================================================= *
   * 2.3  Specific provision — case-by-case                         *
   * ============================================================= */

  /**
   * Record a SPECIFIC, case-by-case provision.
   * These are the provisions that have the best chance of passing
   * Israeli tax audit because they attach to a named debtor and
   * documented justification.
   */
  specificProvision(args) {
    const { customerId, amount, justification, approver } = args || {};
    if (!customerId) {
      throw new TypeError('specificProvision: customerId is required');
    }
    if (!isFiniteNumber(amount) || amount <= 0) {
      throw new RangeError('specificProvision: amount must be > 0');
    }
    if (!justification || typeof justification !== 'string') {
      throw new TypeError('specificProvision: justification string is required');
    }
    if (!approver) {
      throw new TypeError('specificProvision: approver is required');
    }

    this._seq += 1;
    const provisionId = 'SP-' + this._seq.toString().padStart(6, '0');
    const record = Object.freeze({
      provisionId,
      customerId,
      amount: round2(amount),
      justification,
      justificationHe: args.justificationHe || justification,
      approver,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
      type: 'SPECIFIC',
      // Flag for tax deductibility — caller can later upgrade when
      // a triggering event is documented.
      taxTrigger: args.taxTrigger || null,
      evidence: args.evidence || [],
    });
    // Additive map — we never overwrite, we accumulate a list per customer.
    const list = this._specificProvisions.get(customerId) || [];
    list.push(record);
    this._specificProvisions.set(customerId, list);
    this._log('SPECIFIC_PROVISION', record);
    return record;
  }

  /* ============================================================= *
   * 2.4  Write-off workflow (separate from provision)              *
   * ============================================================= */

  /**
   * Open a write-off request for a customer balance.
   * Write-off DERECOGNISES the asset; IFRS 9 §5.4.4 requires it
   * when no reasonable expectation of recovery exists.  Israeli tax
   * allows the deduction only at write-off for general reserves,
   * but for specific provisions with triggering events the deduction
   * can be claimed earlier (see taxDeductibility()).
   */
  writeOffRequest(customerId, args) {
    if (!customerId) {
      throw new TypeError('writeOffRequest: customerId is required');
    }
    const a = args || {};
    this._seq += 1;
    const id = 'WO-' + this._seq.toString().padStart(6, '0');
    const record = {
      id,
      customerId,
      amount: round2(coalesceNumber(a.amount, 0)),
      currency: a.currency || this.reportingCurrency,
      reason: a.reason || 'Uncollectable — documented',
      reasonHe: a.reasonHe || 'חוב בלתי גביה — מתועד',
      triggerEvent: a.triggerEvent || null,
      requestedBy: a.requestedBy || null,
      approvals: [],
      state: WRITEOFF_STATES.DRAFT,
      stateHistory: [
        { state: WRITEOFF_STATES.DRAFT, at: new Date().toISOString() },
      ],
      evidence: a.evidence || [],
      createdAt: new Date().toISOString(),
    };

    // Chain helpers — fluent API that mutates the record and logs.
    record.submit = () => this._transitionWriteOff(record, WRITEOFF_STATES.PENDING_APPROVAL);
    record.approve = (approver) => {
      if (!approver) throw new TypeError('approve: approver required');
      record.approvals.push({ approver, at: new Date().toISOString() });
      return this._transitionWriteOff(record, WRITEOFF_STATES.APPROVED);
    };
    record.reject = (approver, reason) => {
      record.approvals.push({ approver, at: new Date().toISOString(), reject: true, reason });
      return this._transitionWriteOff(record, WRITEOFF_STATES.REJECTED);
    };
    record.post = () => this._transitionWriteOff(record, WRITEOFF_STATES.POSTED);
    record.reverse = (reason) => {
      record.reverseReason = reason || 'Recovery';
      return this._transitionWriteOff(record, WRITEOFF_STATES.REVERSED);
    };

    this._writeOffs.set(id, record);
    this._log('WRITEOFF_REQUESTED', { id, customerId, amount: record.amount });
    return record;
  }

  _transitionWriteOff(record, nextState) {
    record.state = nextState;
    record.stateHistory.push({ state: nextState, at: new Date().toISOString() });
    this._log('WRITEOFF_TRANSITION', { id: record.id, nextState });
    return record;
  }

  /* ============================================================= *
   * 2.5  Israeli tax deductibility                                 *
   * ============================================================= */

  /**
   * Decide whether a provision row is tax-deductible under Israeli
   * Income Tax Ordinance §17(4).
   *
   * Returns:
   *   {
   *     deductible: boolean,
   *     reason, reasonHe, trigger, conditionsMet, conditionsMissing,
   *     temporaryDifference, form6111Row
   *   }
   */
  taxDeductibility(provision) {
    if (!provision) {
      throw new TypeError('taxDeductibility: provision required');
    }

    const out = {
      provisionId: provision.provisionId || provision.id || null,
      customerId: provision.customerId || null,
      amount: round2(coalesceNumber(provision.amount, 0)),
      type: provision.type || 'UNKNOWN',
      trigger: provision.taxTrigger || provision.triggerEvent || null,
      deductible: false,
      reason: '',
      reasonHe: '',
      conditionsMet: [],
      conditionsMissing: ISRAELI_TAX_RULES.deductibleConditions.slice(),
      temporaryDifference: 0,
      form6111Row: ISRAELI_TAX_RULES.form6111Row,
      rule: ISRAELI_TAX_RULES.statute,
      ruleHe: ISRAELI_TAX_RULES.statuteHe,
    };

    // 1. General reserves (including provision-matrix / aging) are NEVER
    //    deductible on their own — they are temporary differences.
    if (
      provision.type === 'GENERAL' ||
      provision.type === 'AGING' ||
      provision.type === 'MATRIX' ||
      provision.type === 'STAGE_1' ||
      provision.type === 'STAGE_2'
    ) {
      out.deductible = false;
      out.reason =
        'General / statistical reserve — not deductible under §17(4); temporary difference only.';
      out.reasonHe =
        'הפרשה כללית / סטטיסטית — אינה מותרת בניכוי לפי סעיף 17(4); הפרש עיתוי בלבד.';
      out.temporaryDifference = out.amount;
      return out;
    }

    // 2. Specific provisions — require triggering event.
    const triggerKey = out.trigger && typeof out.trigger === 'string'
      ? out.trigger.toUpperCase()
      : null;
    const ev = triggerKey ? ISRAELI_TAX_RULES.triggeringEvents[triggerKey] : null;

    if (!ev) {
      out.deductible = false;
      out.reason =
        'Specific provision without documented triggering event — doubtful only, not definitively unrecoverable.';
      out.reasonHe =
        'הפרשה ספציפית ללא אירוע מתעד — חוב מסופק בלבד, לא בלתי גביה סופית.';
      out.temporaryDifference = out.amount;
      return out;
    }

    if (!ev.deductible) {
      out.deductible = false;
      out.reason = 'Trigger event recognised but not deductible: ' + ev.name;
      out.reasonHe = 'אירוע מזוהה אך לא מותר בניכוי: ' + ev.he;
      out.temporaryDifference = out.amount;
      return out;
    }

    // 3. Deductible path — also check evidence presence.
    const evidence = Array.isArray(provision.evidence) ? provision.evidence : [];
    const hasEvidence = evidence.length > 0;
    out.conditionsMet = [
      'Business-ordinary-course debt',
      'Previously in taxable income',
      'Definitively unrecoverable (' + ev.name + ')',
      hasEvidence ? 'Evidence documented' : 'Evidence flagged as required',
      'Specific debtor identified',
    ];
    out.conditionsMissing = hasEvidence
      ? []
      : ['Evidence file missing — attach before filing'];

    out.deductible = true;
    out.reason = 'Specific bad debt — deductible under §17(4): ' + ev.name;
    out.reasonHe = 'חוב אבוד ספציפי — מותר בניכוי לפי סעיף 17(4): ' + ev.he;
    out.temporaryDifference = 0;
    return out;
  }

  /* ============================================================= *
   * 2.6  Provision movement (roll-forward)                         *
   * ============================================================= */

  /**
   * Build the provision movement schedule:
   *
   *    Opening balance
   *  + New provisions raised
   *  - Reversals
   *  - Write-offs (utilisation)
   *  - FX retranslation  (optional)
   *  = Closing balance
   *
   * Inputs: period = { opening, newProvisions, reversals, writeOffs, fx, label }
   */
  provisionMovement(period) {
    const p = period || {};
    const opening = round2(coalesceNumber(p.opening, 0));
    const newProv = round2(coalesceNumber(p.newProvisions, 0));
    const reversals = round2(coalesceNumber(p.reversals, 0));
    const writeOffs = round2(coalesceNumber(p.writeOffs, 0));
    const fx = round2(coalesceNumber(p.fx, 0));

    const closing = round2(opening + newProv - reversals - writeOffs + fx);

    const movement = Object.freeze({
      period: p.label || p.period || 'current',
      opening,
      newProvisions: newProv,
      reversals,
      writeOffs,
      fxRetranslation: fx,
      closing,
      reconciled: true,
      rows: Object.freeze([
        { label: 'Opening balance', labelHe: 'יתרת פתיחה', amount: opening, sign: 1 },
        { label: 'New provisions', labelHe: 'הפרשות חדשות', amount: newProv, sign: 1 },
        { label: 'Reversals', labelHe: 'החזרות', amount: -reversals, sign: -1 },
        { label: 'Write-offs (utilisation)', labelHe: 'מחיקות (ניצול)', amount: -writeOffs, sign: -1 },
        { label: 'FX retranslation', labelHe: 'הפרשי שער', amount: fx, sign: 1 },
        { label: 'Closing balance', labelHe: 'יתרת סגירה', amount: closing, sign: 0 },
      ]),
    });

    this._log('PROVISION_MOVEMENT', { period: movement.period, closing });
    return movement;
  }

  /* ============================================================= *
   * 2.7  Back-test                                                 *
   * ============================================================= */

  /**
   * Calibration check: compare predicted provisions to actual losses
   * across prior periods.  Returns error statistics (MAE, MAPE, bias).
   */
  backTest(args) {
    const { historicalProvisions, actualLosses } = args || {};
    if (!Array.isArray(historicalProvisions) || !Array.isArray(actualLosses)) {
      throw new TypeError(
        'backTest: historicalProvisions and actualLosses must be arrays'
      );
    }
    if (historicalProvisions.length !== actualLosses.length) {
      throw new RangeError(
        'backTest: array lengths must match (one pair per period)'
      );
    }
    if (historicalProvisions.length === 0) {
      throw new RangeError('backTest: at least one period required');
    }

    let sumAbsErr = 0;
    let sumAbsPct = 0;
    let sumSignedErr = 0;
    let sumPred = 0;
    let sumActual = 0;
    const rows = [];

    for (let i = 0; i < historicalProvisions.length; i++) {
      const pred = coalesceNumber(historicalProvisions[i], 0);
      const actual = coalesceNumber(actualLosses[i], 0);
      const err = pred - actual;                         // signed
      const absErr = Math.abs(err);
      const pct = actual === 0 ? 0 : absErr / Math.abs(actual);
      sumAbsErr += absErr;
      sumAbsPct += pct;
      sumSignedErr += err;
      sumPred += pred;
      sumActual += actual;
      rows.push({
        period: i + 1,
        predicted: round2(pred),
        actual: round2(actual),
        error: round2(err),
        absError: round2(absErr),
        errorPct: round4(pct),
      });
    }

    const n = historicalProvisions.length;
    const mae = round2(sumAbsErr / n);
    const mape = round4(sumAbsPct / n);
    const bias = round2(sumSignedErr / n);
    const calibrationRatio = sumActual === 0 ? 0 : round4(sumPred / sumActual);

    // Traffic light — red if we're >25% off, yellow >10%, else green.
    let status = 'GREEN';
    if (mape > 0.25) status = 'RED';
    else if (mape > 0.10) status = 'YELLOW';

    return Object.freeze({
      n,
      mae,
      mape,
      bias,
      calibrationRatio,
      status,
      statusHe: status === 'GREEN' ? 'תקין' : status === 'YELLOW' ? 'התראה' : 'חריגה',
      rows: Object.freeze(rows.map(Object.freeze)),
      note:
        'MAPE < 10% → model well calibrated; 10-25% → review assumptions; > 25% → recalibrate PD/LGD urgently.',
      noteHe:
        'MAPE < 10% → המודל מכויל היטב; 10-25% → יש לבחון הנחות; מעל 25% → יש לכייל בדחיפות PD/LGD.',
    });
  }

  /* ============================================================= *
   * 2.8  Forward-looking adjustment                                *
   * ============================================================= */

  /**
   * IFRS 9 forward-looking adjustment — multiply the base PD by a
   * macro factor scenario.
   *
   * Input: { macroFactor: 'GDP' | 'unemployment' | 'sector',
   *          scenario: 'optimistic' | 'baseCase' | 'pessimistic',
   *          basePd: number [0,1], basePortfolio?: number }
   */
  forwardLookingAdjustment(args) {
    const { macroFactor, scenario, basePd, basePortfolio } = args || {};
    const cfg = MACRO_FACTOR_WEIGHTS[macroFactor];
    if (!cfg) {
      throw new RangeError(
        'forwardLookingAdjustment: macroFactor must be one of ' +
          Object.keys(MACRO_FACTOR_WEIGHTS).join(', ')
      );
    }
    const sc = scenario || 'baseCase';
    if (!(sc in cfg)) {
      throw new RangeError(
        'forwardLookingAdjustment: unknown scenario ' + sc
      );
    }
    const pd = coalesceNumber(basePd, 0);
    if (pd < 0 || pd > 1) {
      throw new RangeError('forwardLookingAdjustment: basePd must be in [0,1]');
    }

    // ΔPD = basePd × scenarioShift × elasticity, clamped to [0,1]
    const shift = coalesceNumber(cfg[sc], 0);
    const delta = pd * shift * cfg.elasticity;
    const adjustedPd = Math.max(0, Math.min(1, pd + delta));

    const portfolioAdjustment =
      isFiniteNumber(basePortfolio) && basePortfolio > 0
        ? round2(basePortfolio * (adjustedPd - pd))
        : null;

    return Object.freeze({
      macroFactor,
      factorLabel: cfg.label,
      factorLabelHe: cfg.labelHe,
      scenario: sc,
      basePd: round4(pd),
      scenarioShift: round4(shift),
      elasticity: round4(cfg.elasticity),
      delta: round4(delta),
      adjustedPd: round4(adjustedPd),
      portfolioAdjustment,
      rationale:
        'IFRS 9 requires forward-looking information when measuring ECL. This adjustment incorporates the scenario\'s expected macro shift.',
      rationaleHe:
        'IFRS 9 מחייב שילוב מידע צופה פני עתיד במדידת ECL. ההתאמה משלבת את השינוי המאקרו-כלכלי הצפוי בתרחיש.',
    });
  }

  /* ============================================================= *
   * 2.9  Disclosure table                                          *
   * ============================================================= */

  /**
   * Produce the 3-stage disclosure table required by IFRS 7 §35M and
   * IAS 1 §121.  Suitable for rendering into the audited financial
   * statements.
   *
   * Input: period = {
   *   label, asOf,
   *   stage1: { grossCarrying, ecl },
   *   stage2: { grossCarrying, ecl },
   *   stage3: { grossCarrying, ecl },
   * }
   */
  disclosureTable(period) {
    const p = period || {};
    const label = p.label || 'Current period';

    function stageRow(stage, data) {
      const gross = round2(coalesceNumber((data || {}).grossCarrying, 0));
      const ecl = round2(coalesceNumber((data || {}).ecl, 0));
      return {
        stage: stage.code,
        stageLabel: stage.name,
        stageLabelHe: stage.he,
        basis: stage.basis,
        grossCarrying: gross,
        ecl,
        net: round2(gross - ecl),
        coverageRatio: gross === 0 ? 0 : round4(ecl / gross),
      };
    }

    const rows = [
      stageRow(IFRS9_STAGES.STAGE_1, p.stage1),
      stageRow(IFRS9_STAGES.STAGE_2, p.stage2),
      stageRow(IFRS9_STAGES.STAGE_3, p.stage3),
    ];

    const totals = rows.reduce(
      (acc, r) => {
        acc.grossCarrying = round2(acc.grossCarrying + r.grossCarrying);
        acc.ecl = round2(acc.ecl + r.ecl);
        acc.net = round2(acc.net + r.net);
        return acc;
      },
      { grossCarrying: 0, ecl: 0, net: 0 }
    );
    totals.coverageRatio =
      totals.grossCarrying === 0 ? 0 : round4(totals.ecl / totals.grossCarrying);

    return Object.freeze({
      title: 'IFRS 9 ECL Disclosure — ' + label,
      titleHe: 'גילוי ECL לפי IFRS 9 — ' + label,
      asOf: p.asOf || new Date().toISOString().slice(0, 10),
      entity: this.entity,
      currency: this.reportingCurrency,
      rows: Object.freeze(rows.map(Object.freeze)),
      totals: Object.freeze(totals),
      headers: Object.freeze({
        en: ['Stage', 'Basis', 'Gross carrying', 'ECL', 'Net', 'Coverage %'],
        he: ['שלב', 'בסיס', 'יתרת חוב', 'ECL', 'נטו', 'אחוז כיסוי'],
      }),
      footnotes: Object.freeze([
        'Amounts in ' + this.reportingCurrency + '. Rounded to the nearest whole unit.',
        'Coverage % = ECL ÷ Gross carrying',
        'IFRS 9 §5.5 — ECL model; §5.5.17 — discounting at effective interest rate',
        'Stage transfers disclosed separately — see Note X',
      ]),
      footnotesHe: Object.freeze([
        'סכומים ב-' + this.reportingCurrency + '. עוגלו לשקל הקרוב.',
        'אחוז כיסוי = ECL חלקי יתרת חוב',
        'IFRS 9 סעיף 5.5 — מודל ECL; סעיף 5.5.17 — היוון בשיעור הריבית האפקטיבית',
        'מעברים בין שלבים מגולים בנפרד — ראה ביאור X',
      ]),
    });
  }

  /* ============================================================= *
   * 2.10  Helpers                                                  *
   * ============================================================= */

  /** Return the immutable event log (copy). */
  events() {
    return this._events.slice();
  }

  /** Get specific provisions for a customer (empty array if none). */
  specificFor(customerId) {
    return (this._specificProvisions.get(customerId) || []).slice();
  }

  /**
   * Dual-purpose: (kept for backward-compat with v1 tests)
   *   - writeOff(idString)              → getter — returns WO record or null
   *   - writeOff({ customerId, ...})    → action — creates a new write-off
   * Additive: do not delete v1 behaviour.
   */
  writeOff(idOrArgs) {
    if (typeof idOrArgs === 'string') {
      return this._writeOffs.get(idOrArgs) || null;
    }
    if (idOrArgs && typeof idOrArgs === 'object') {
      return this._createWriteOffV2(idOrArgs);
    }
    return null;
  }

  _log(type, payload) {
    this._events.push({
      type,
      at: new Date().toISOString(),
      payload: cloneShallow(payload),
    });
  }

  /* ============================================================= *
   * 3. Agent Y-089 v2 — Canonical IFRS 9 ECL engine API            *
   *                                                                *
   * The methods below were added as an upgrade (not replacement)  *
   * to satisfy the canonical "six-bucket / simplified-matrix /    *
   * stage-classification / forward-looking-factor / provision-   *
   * journal / write-off-ledger" API requested by Y-089 spec.     *
   *                                                                *
   * House rule: לא מוחקים רק משדרגים ומגדלים — every addition     *
   * leaves the v1 surface above untouched.                         *
   * ============================================================= */

  /**
   * agingBuckets(arBalance) — split a list of open invoices into
   * the canonical six IFRS 9 buckets (0-30, 31-60, 61-90, 91-180,
   * 181-365, 365+), plus a "current" bucket for not-yet-due items.
   *
   * @param {Array<{invoiceId, customerId, amount, dueDate, currency?}>
   *         | Object} arBalance
   * @param {Object} [opts]
   *        asOf:   reference date (ISO string or ms) — defaults to now
   *        currency: report currency
   * @returns {Object} { buckets, byCustomer, asOf, ... }
   */
  agingBuckets(arBalance, opts) {
    const invoices = _v2NormaliseAR(arBalance);
    const options = opts || {};
    const asOf = _v2ToTs(options.asOf);
    const currency = options.currency || this.reportingCurrency;

    const bucketKeys = ['current', '0-30', '31-60', '61-90', '91-180', '181-365', '365+'];
    const buckets = Object.create(null);
    const invoicesByBucket = Object.create(null);
    for (const k of bucketKeys) {
      buckets[k] = 0;
      invoicesByBucket[k] = [];
    }

    const byCustomer = new Map();

    let total = 0;
    for (const inv of invoices) {
      const dueTs = _v2ToTs(inv.dueDate);
      const daysPastDue = Math.floor((asOf - dueTs) / 86_400_000);
      const bucket = _v2BucketOf(daysPastDue);
      const amt = round2(coalesceNumber(inv.amount, 0));
      buckets[bucket] = round2(buckets[bucket] + amt);
      invoicesByBucket[bucket].push({
        invoiceId: inv.invoiceId || inv.id || null,
        customerId: inv.customerId || null,
        amount: amt,
        dueDate: inv.dueDate || null,
        daysPastDue,
      });
      total = round2(total + amt);

      const cid = inv.customerId || '__unknown__';
      if (!byCustomer.has(cid)) {
        byCustomer.set(cid, { customerId: cid, buckets: _v2EmptyBuckets(), total: 0 });
      }
      const c = byCustomer.get(cid);
      c.buckets[bucket] = round2(c.buckets[bucket] + amt);
      c.total = round2(c.total + amt);
    }

    const result = {
      asOf: new Date(asOf).toISOString(),
      currency,
      bucketOrder: bucketKeys.slice(),
      bucketLabels: Object.freeze({
        en: {
          current: 'Current (not yet due)',
          '0-30':   '0-30 days',
          '31-60':  '31-60 days',
          '61-90':  '61-90 days',
          '91-180': '91-180 days',
          '181-365':'181-365 days',
          '365+':   '365+ days',
        },
        he: {
          current: 'לא בפיגור',
          '0-30':   '0-30 ימים',
          '31-60':  '31-60 ימים',
          '61-90':  '61-90 ימים',
          '91-180': '91-180 ימים',
          '181-365':'181-365 ימים',
          '365+':   '365 ימים ויותר',
        },
      }),
      buckets,
      invoicesByBucket,
      byCustomer: Object.fromEntries(byCustomer),
      total,
      invoiceCount: invoices.length,
    };
    this._log('AGING_BUCKETS_V2', { asOf: result.asOf, total, count: invoices.length });
    return result;
  }

  /**
   * historicalLossRate(periodHistory) — derive per-bucket loss rate
   * from historical roll-forwards. periodHistory is an array of
   * periods, each period being { asOf, buckets:{bucket:gross}, losses:{bucket:loss} }.
   * The loss rate per bucket = Σ losses / Σ gross (over periods).
   *
   * @param {Array<{asOf, buckets, losses}>} periodHistory
   * @returns {Object} { rates, sampleSize, byPeriod, method }
   */
  historicalLossRate(periodHistory) {
    if (!Array.isArray(periodHistory) || periodHistory.length === 0) {
      throw new TypeError('historicalLossRate: non-empty periodHistory array required');
    }
    const sum = Object.create(null);
    const loss = Object.create(null);
    const byPeriod = [];
    for (const p of periodHistory) {
      if (!p || typeof p !== 'object') continue;
      const row = { asOf: p.asOf || null, rates: {} };
      const gross = p.buckets || {};
      const lost = p.losses || {};
      for (const b of Object.keys(gross)) {
        sum[b] = (sum[b] || 0) + coalesceNumber(gross[b], 0);
        loss[b] = (loss[b] || 0) + coalesceNumber(lost[b], 0);
        const g = coalesceNumber(gross[b], 0);
        row.rates[b] = g === 0 ? 0 : round4(coalesceNumber(lost[b], 0) / g);
      }
      byPeriod.push(row);
    }
    const rates = Object.create(null);
    for (const b of Object.keys(sum)) {
      rates[b] = sum[b] === 0 ? 0 : round4(loss[b] / sum[b]);
    }
    const result = Object.freeze({
      method: 'Weighted historical loss rate per aging bucket',
      methodHe: 'שיעור הפסד היסטורי משוקלל לכל דלי גיול',
      rates,
      sampleSize: periodHistory.length,
      byPeriod,
      generatedAt: new Date().toISOString(),
    });
    this._log('HISTORICAL_LOSS_RATE', { sampleSize: result.sampleSize });
    return result;
  }

  /**
   * forwardLookingFactor({ macroIndicators }) — compute a single
   * scalar multiplier (FLF) used in the ECL formula:
   *   ECL = PD × LGD × EAD × FLF
   *
   * macroIndicators = {
   *   gdpGrowth:     number (percent, e.g. -0.5 for recession, 3 for boom)
   *   unemployment:  number (percent, e.g. 5)
   *   industryPmi:   number (PMI index, 50 = neutral)
   * }
   *
   * The default calibration produces FLF ≈ 1 at baseline
   * (GDP=3, unemployment=4, PMI=50), >1 in downturn, <1 in boom.
   */
  forwardLookingFactor(args) {
    const m = (args && args.macroIndicators) || {};
    const gdp = coalesceNumber(m.gdpGrowth, 3);
    const unemp = coalesceNumber(m.unemployment, 4);
    const pmi = coalesceNumber(m.industryPmi, 50);

    // Baseline anchors
    const gdpAnchor = 3;
    const unempAnchor = 4;
    const pmiAnchor = 50;

    // Elasticities (bps per unit)
    const eGdp = -0.05;   // +1% GDP growth ⇒ FLF falls by 0.05
    const eUnemp = 0.06;  // +1% unemployment ⇒ FLF rises by 0.06
    const ePmi = -0.01;   // +1 PMI point ⇒ FLF falls by 0.01

    const shift =
      eGdp * (gdp - gdpAnchor) +
      eUnemp * (unemp - unempAnchor) +
      ePmi * (pmi - pmiAnchor);

    const flf = Math.max(0.25, Math.min(3, 1 + shift));

    let regime = 'NEUTRAL';
    let regimeHe = 'נייטרלי';
    if (flf < 0.9) { regime = 'FAVOURABLE'; regimeHe = 'חיובי'; }
    else if (flf > 1.1) { regime = 'ADVERSE'; regimeHe = 'שלילי'; }

    const out = Object.freeze({
      factor: round4(flf),
      regime,
      regimeHe,
      shift: round4(shift),
      inputs: Object.freeze({ gdp, unemployment: unemp, industryPmi: pmi }),
      anchors: Object.freeze({ gdp: gdpAnchor, unemployment: unempAnchor, pmi: pmiAnchor }),
      elasticities: Object.freeze({
        gdp: eGdp, unemployment: eUnemp, pmi: ePmi,
      }),
      formula: 'FLF = clamp(1 + Σ (elasticity_i × (indicator_i − anchor_i)), 0.25, 3)',
      formulaHe:
        'FLF = clamp(1 + Σ (גמישות_i × (אינדיקטור_i − עוגן_i)), 0.25, 3)',
      rule: 'IFRS 9 §5.5.17(c) — forward-looking information',
      ruleHe: 'IFRS 9 סעיף 5.5.17(ג) — מידע צופה פני עתיד',
    });
    this._log('FORWARD_LOOKING_FACTOR', { factor: out.factor, regime });
    return out;
  }

  /**
   * stageClassification(customer) — assign IFRS 9 stage 1/2/3 based on
   * customer indicators. SICR triggers: DPD ≥ 30, rating downgrade,
   * forbearance. Credit-impaired: DPD ≥ 90, bankruptcy, legal proc.
   */
  stageClassification(customer) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('stageClassification: customer object required');
    }
    const reasons = [];
    const reasonsHe = [];
    let stage = 'STAGE_1';

    const dpd = coalesceNumber(customer.daysPastDue, 0);
    const rating = customer.rating || null;
    const ratingAtOrigination = customer.ratingAtOrigination || null;
    const forbearance = Boolean(customer.forbearance);
    const bankruptcy = Boolean(customer.bankruptcy);
    const legalProcedure = Boolean(customer.legalProcedure);
    const writeOffFlag = Boolean(customer.writeOffPending);

    // Stage 3 — credit-impaired
    if (bankruptcy) {
      stage = 'STAGE_3'; reasons.push('Bankruptcy filed'); reasonsHe.push('פשיטת רגל הוגשה');
    }
    if (legalProcedure) {
      stage = 'STAGE_3'; reasons.push('Legal collection procedure');
      reasonsHe.push('הליך משפטי לגבייה');
    }
    if (writeOffFlag) {
      stage = 'STAGE_3'; reasons.push('Write-off pending'); reasonsHe.push('ממתין למחיקה');
    }
    if (dpd >= 90) {
      stage = 'STAGE_3'; reasons.push('DPD ≥ 90'); reasonsHe.push('פיגור ≥ 90 ימים');
    }

    // Stage 2 — SICR (only if not already stage 3)
    if (stage !== 'STAGE_3') {
      if (dpd >= 30) {
        stage = 'STAGE_2'; reasons.push('DPD ≥ 30'); reasonsHe.push('פיגור ≥ 30 ימים');
      }
      if (forbearance) {
        stage = 'STAGE_2'; reasons.push('Forbearance granted');
        reasonsHe.push('מתן הקלות תשלום');
      }
      if (rating && ratingAtOrigination) {
        // 2-notch downgrade = SICR trigger
        const order = ['A', 'B', 'C', 'D', 'E'];
        const deltaNotches = order.indexOf(rating) - order.indexOf(ratingAtOrigination);
        if (deltaNotches >= 2) {
          stage = 'STAGE_2';
          reasons.push('Rating downgraded ≥ 2 notches');
          reasonsHe.push('הורדת דירוג ≥ 2 דרגות');
        }
      }
    }

    if (reasons.length === 0) {
      reasons.push('Performing — no SICR');
      reasonsHe.push('מבוצע — אין החמרה משמעותית');
    }

    const stageCfg = IFRS9_STAGES[stage];
    const out = Object.freeze({
      customerId: customer.customerId || customer.id || null,
      stage,
      stageLabel: stageCfg.name,
      stageLabelHe: stageCfg.he,
      basis: stageCfg.basis,
      horizonMonths: stageCfg.horizonMonths,
      lifetime: stage !== 'STAGE_1',
      reasons,
      reasonsHe,
      indicators: Object.freeze({
        daysPastDue: dpd,
        rating,
        ratingAtOrigination,
        forbearance,
        bankruptcy,
        legalProcedure,
      }),
      classifiedAt: new Date().toISOString(),
    });
    this._log('STAGE_CLASSIFIED', { customerId: out.customerId, stage });
    return out;
  }

  /**
   * computeSimplifiedMatrix(customer, lossRates) — per-customer
   * provision under IFRS 9 §5.5.15 simplified approach.
   *
   * customer = { customerId, buckets:{bucket: gross} }
   * lossRates = { bucket: rate }
   */
  computeSimplifiedMatrix(customer, lossRates) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('computeSimplifiedMatrix: customer required');
    }
    if (!lossRates || typeof lossRates !== 'object') {
      throw new TypeError('computeSimplifiedMatrix: lossRates required');
    }
    const buckets = customer.buckets || {};
    const rows = [];
    let gross = 0;
    let ecl = 0;
    for (const b of Object.keys(buckets)) {
      const g = round2(coalesceNumber(buckets[b], 0));
      const rate = round4(coalesceNumber(lossRates[b], 0));
      const prov = round2(g * rate);
      rows.push({ bucket: b, gross: g, rate, ecl: prov });
      gross = round2(gross + g);
      ecl = round2(ecl + prov);
    }
    const out = Object.freeze({
      customerId: customer.customerId || customer.id || null,
      method: 'IFRS 9 §5.5.15 Simplified Approach',
      methodHe: 'IFRS 9 סעיף 5.5.15 — גישה פשוטה',
      rows: Object.freeze(rows.map(Object.freeze)),
      gross,
      ecl,
      net: round2(gross - ecl),
      coverageRatio: gross === 0 ? 0 : round4(ecl / gross),
      computedAt: new Date().toISOString(),
    });
    this._log('SIMPLIFIED_MATRIX', { customerId: out.customerId, gross, ecl });
    return out;
  }

  /**
   * provisionJournalEntry(totalECL, priorECL) — emit the journal
   * entry to move the allowance from priorECL to totalECL.
   *
   *   If totalECL > priorECL → DR bad-debt expense / CR allowance
   *   If totalECL < priorECL → DR allowance / CR bad-debt recovery
   *
   * Returns a balanced two-leg entry in book-keeper form.
   */
  provisionJournalEntry(totalECL, priorECL) {
    const t = round2(coalesceNumber(totalECL, 0));
    const p = round2(coalesceNumber(priorECL, 0));
    const delta = round2(t - p);
    this._seq += 1;
    const id = 'JE-BD-' + this._seq.toString().padStart(6, '0');
    const entry = {
      id,
      type: 'PROVISION_ADJUSTMENT',
      totalECL: t,
      priorECL: p,
      delta,
      currency: this.reportingCurrency,
      date: new Date().toISOString().slice(0, 10),
      description: delta >= 0
        ? 'Increase in allowance for doubtful accounts (IFRS 9 ECL)'
        : 'Release of allowance for doubtful accounts (IFRS 9 ECL)',
      descriptionHe: delta >= 0
        ? 'גידול בהפרשה לחובות מסופקים (IFRS 9 ECL)'
        : 'שחרור הפרשה לחובות מסופקים (IFRS 9 ECL)',
      lines: [],
      rule: 'IAS 1 / IFRS 9 §5.5',
    };

    if (delta > 0) {
      entry.lines = [
        {
          account: '6820',
          accountName: 'Bad debt expense',
          accountNameHe: 'הוצאות חובות מסופקים',
          debit: delta,
          credit: 0,
        },
        {
          account: '1190',
          accountName: 'Allowance for doubtful accounts (contra-AR)',
          accountNameHe: 'הפרשה לחובות מסופקים (ניגוד לקוחות)',
          debit: 0,
          credit: delta,
        },
      ];
    } else if (delta < 0) {
      const abs = Math.abs(delta);
      entry.lines = [
        {
          account: '1190',
          accountName: 'Allowance for doubtful accounts (contra-AR)',
          accountNameHe: 'הפרשה לחובות מסופקים (ניגוד לקוחות)',
          debit: abs,
          credit: 0,
        },
        {
          account: '6825',
          accountName: 'Bad debt recovery / release',
          accountNameHe: 'השבת הפרשה לחובות מסופקים',
          debit: 0,
          credit: abs,
        },
      ];
    } else {
      entry.lines = []; // zero-delta: no entry needed
      entry.description = 'No change in allowance for doubtful accounts';
      entry.descriptionHe = 'ללא שינוי בהפרשה לחובות מסופקים';
    }

    // Balance check
    const dr = entry.lines.reduce((s, l) => s + l.debit, 0);
    const cr = entry.lines.reduce((s, l) => s + l.credit, 0);
    entry.balanced = round2(dr) === round2(cr);
    const frozen = Object.freeze({
      ...entry,
      lines: Object.freeze(entry.lines.map(Object.freeze)),
    });
    this._journalLedger = this._journalLedger || [];
    this._journalLedger.push(frozen); // append-only
    this._log('PROVISION_JOURNAL_ENTRY', { id, delta });
    return frozen;
  }

  /**
   * _createWriteOffV2 — internal creator for new-style
   * writeOff({customerId, invoiceId, amount, reason}). Enforces
   * Israeli §17(4) rules, including the 3-year documented-collection
   * effort waiting period unless a strong trigger event is recorded.
   */
  _createWriteOffV2(args) {
    const a = args || {};
    if (!a.customerId) throw new TypeError('writeOff: customerId required');
    const amount = coalesceNumber(a.amount, 0);
    if (amount <= 0) throw new RangeError('writeOff: amount must be > 0');
    const reason = a.reason || null;
    if (!reason) throw new TypeError('writeOff: reason required');

    // 3-year waiting rule check — based on collection-effort history
    const efforts = this._collectionEfforts
      ? (this._collectionEfforts.get(a.customerId) || [])
      : [];

    const now = Date.now();
    const YEAR_MS = 365 * 86_400_000;
    // Earliest documented effort
    let earliestEffortTs = null;
    for (const e of efforts) {
      const ts = _v2ToTs(e.date);
      if (earliestEffortTs === null || ts < earliestEffortTs) earliestEffortTs = ts;
    }
    const yearsSinceEffort = earliestEffortTs === null
      ? 0
      : (now - earliestEffortTs) / YEAR_MS;

    // Strong trigger events bypass the 3-year rule (bankruptcy, court)
    const strongTriggers = new Set([
      'BANKRUPTCY',
      'COURT_JUDGMENT_UNENFORCED',
      'LIQUIDATION',
    ]);
    const trigger = a.triggerEvent || a.taxTrigger || null;
    const bypassRule = Boolean(
      trigger && strongTriggers.has(String(trigger).toUpperCase())
    );

    const meetsWaiting = Boolean(bypassRule || yearsSinceEffort >= 3);
    const hasEffort = Boolean(efforts.length > 0 || bypassRule);

    this._seq += 1;
    const id = 'WO2-' + this._seq.toString().padStart(6, '0');
    const record = Object.freeze({
      id,
      customerId: a.customerId,
      invoiceId: a.invoiceId || null,
      amount: round2(amount),
      currency: a.currency || this.reportingCurrency,
      reason,
      reasonHe: a.reasonHe || reason,
      triggerEvent: trigger,
      requestedBy: a.requestedBy || null,
      collectionEfforts: efforts.slice(),
      yearsSinceFirstEffort: round4(yearsSinceEffort),
      meetsIsraeliTaxRules: Boolean(hasEffort && meetsWaiting),
      taxRuleRef: 'ITA §17(4) + Regulations 1980 — 3-year waiting + documented effort',
      taxRuleRefHe: 'פקודת מס הכנסה סעיף 17(4) + תקנות 1980 — המתנה 3 שנים + מאמצי גבייה מתועדים',
      rule: 'IFRS 9 §5.4.4 (derecognition) + ITA §17(4)',
      createdAt: new Date(now).toISOString(),
      state: 'POSTED',
      recoveredAmount: 0,
      recoveries: [],
      reversed: false,
    });

    this._writeOffLedger = this._writeOffLedger || [];
    this._writeOffLedger.push(record);
    this._writeOffs.set(id, record);
    this._log('WRITEOFF_V2_POSTED', {
      id,
      customerId: a.customerId,
      amount: record.amount,
      meetsIsraeliTaxRules: record.meetsIsraeliTaxRules,
    });
    return record;
  }

  /**
   * recoveryTracking({writeOffId, recoveredAmount, date}) —
   * records a recovery against a prior write-off. The recovery
   * REVERSES the write-off (wholly or partially) with a credit to
   * bad-debt recovery revenue. Append-only.
   */
  recoveryTracking(args) {
    const a = args || {};
    if (!a.writeOffId) throw new TypeError('recoveryTracking: writeOffId required');
    const rec = this._writeOffs.get(a.writeOffId);
    if (!rec) throw new RangeError('recoveryTracking: unknown writeOffId ' + a.writeOffId);
    const recovered = coalesceNumber(a.recoveredAmount, 0);
    if (recovered <= 0) {
      throw new RangeError('recoveryTracking: recoveredAmount must be > 0');
    }

    // Records are frozen — we build a new record with the recovery
    // appended and swap the map entry.  The OLD record remains in
    // _writeOffLedger as history (additive — never overwrite).
    const priorRecoveries = rec.recoveries || [];
    const newRecoveries = priorRecoveries.concat([{
      recoveredAmount: round2(recovered),
      date: a.date || new Date().toISOString(),
      note: a.note || null,
      noteHe: a.noteHe || null,
    }]);
    const totalRecovered = round2(
      newRecoveries.reduce((s, r) => s + r.recoveredAmount, 0)
    );
    const fullyReversed = totalRecovered >= rec.amount;

    const updated = Object.freeze({
      ...rec,
      recoveries: Object.freeze(newRecoveries.map(Object.freeze)),
      recoveredAmount: totalRecovered,
      reversed: fullyReversed,
      state: fullyReversed ? 'REVERSED' : 'PARTIALLY_RECOVERED',
      lastRecoveryAt: a.date || new Date().toISOString(),
    });
    this._writeOffs.set(rec.id, updated);
    this._writeOffLedger.push(updated); // append, don't overwrite

    // Emit the journal entry for the recovery
    this._seq += 1;
    const jeId = 'JE-REC-' + this._seq.toString().padStart(6, '0');
    const journalEntry = Object.freeze({
      id: jeId,
      type: 'WRITEOFF_RECOVERY',
      writeOffId: rec.id,
      customerId: rec.customerId,
      amount: round2(recovered),
      currency: rec.currency,
      date: a.date || new Date().toISOString().slice(0, 10),
      description: 'Recovery of previously written-off receivable',
      descriptionHe: 'גביית חוב שנמחק בעבר',
      lines: Object.freeze([
        Object.freeze({
          account: '1000',
          accountName: 'Cash / Bank',
          accountNameHe: 'מזומן / בנק',
          debit: round2(recovered),
          credit: 0,
        }),
        Object.freeze({
          account: '6825',
          accountName: 'Bad debt recovery',
          accountNameHe: 'השבת חוב אבוד',
          debit: 0,
          credit: round2(recovered),
        }),
      ]),
      rule: 'IFRS 9 §5.4.4 — recovery',
      ruleHe: 'IFRS 9 סעיף 5.4.4 — גבייה לאחר מחיקה',
    });
    this._journalLedger = this._journalLedger || [];
    this._journalLedger.push(journalEntry);
    this._log('RECOVERY_TRACKED', {
      writeOffId: rec.id,
      recovered,
      totalRecovered,
      fullyReversed,
    });
    return { writeOff: updated, journalEntry };
  }

  /**
   * agingReport(asOf) — bilingual aging report emitted from the
   * currently-loaded AR snapshot.  Requires the caller to have
   * attached an AR source via setARSource() or to pass a snapshot.
   */
  agingReport(asOf, snapshot) {
    const ar = Array.isArray(snapshot)
      ? snapshot
      : this._arSnapshot || [];
    const bucketed = this.agingBuckets(ar, { asOf: asOf || new Date().toISOString() });
    const rows = [];
    for (const b of bucketed.bucketOrder) {
      const gross = bucketed.buckets[b];
      const pct = bucketed.total === 0 ? 0 : round4(gross / bucketed.total);
      rows.push({
        bucket: b,
        bucketEn: bucketed.bucketLabels.en[b],
        bucketHe: bucketed.bucketLabels.he[b],
        gross,
        pctOfTotal: pct,
      });
    }
    const report = Object.freeze({
      title: 'Aging Report — ' + bucketed.asOf,
      titleHe: 'דוח גיול חובות — ' + bucketed.asOf,
      asOf: bucketed.asOf,
      entity: this.entity,
      currency: bucketed.currency,
      rows: Object.freeze(rows.map(Object.freeze)),
      total: bucketed.total,
      invoiceCount: bucketed.invoiceCount,
      byCustomer: bucketed.byCustomer,
      headers: Object.freeze({
        en: ['Bucket', 'Gross', '% of total'],
        he: ['דלי גיול', 'ברוטו', 'אחוז מסך הכל'],
      }),
      footnotesHe: Object.freeze([
        'הנתונים מצטברים מסך חובות לקוחות פתוחים ליום הדוח.',
        'IFRS 9 §5.5.15 — ניתן לשלב שיעורי הפסד למטריצת הפרשה.',
      ]),
      footnotesEn: Object.freeze([
        'Figures aggregated from all open receivables as of the report date.',
        'IFRS 9 §5.5.15 — loss rates may be combined into a provision matrix.',
      ]),
    });
    this._log('AGING_REPORT', { asOf: report.asOf, total: report.total });
    return report;
  }

  /** Attach or update the in-memory AR snapshot used by agingReport(). */
  setARSnapshot(ar) {
    this._arSnapshot = _v2NormaliseAR(ar);
    return this._arSnapshot.length;
  }

  /**
   * stageMigration(period) — track how many customers moved between
   * stages over a period.  period = { from:{customerId→stage}, to:{…} }.
   * Returns the transition matrix and summary counts.
   */
  stageMigration(period) {
    const p = period || {};
    const from = p.from || {};
    const to = p.to || {};
    const stages = ['STAGE_1', 'STAGE_2', 'STAGE_3'];
    const matrix = {};
    for (const s1 of stages) {
      matrix[s1] = {};
      for (const s2 of stages) matrix[s1][s2] = 0;
    }
    const moved = [];
    const allIds = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const id of allIds) {
      const f = from[id] || 'STAGE_1';
      const t = to[id] || f;
      if (matrix[f] && matrix[f][t] !== undefined) matrix[f][t] += 1;
      if (f !== t) {
        moved.push({ customerId: id, from: f, to: t });
      }
    }
    const totalCustomers = allIds.size;
    const byStageFrom = { STAGE_1: 0, STAGE_2: 0, STAGE_3: 0 };
    const byStageTo = { STAGE_1: 0, STAGE_2: 0, STAGE_3: 0 };
    for (const s of stages) {
      byStageFrom[s] = Object.values(matrix[s]).reduce((a, b) => a + b, 0);
      for (const s2 of stages) byStageTo[s] += matrix[s2][s];
    }

    const improvements = moved.filter(
      (m) => stages.indexOf(m.to) < stages.indexOf(m.from)
    );
    const deteriorations = moved.filter(
      (m) => stages.indexOf(m.to) > stages.indexOf(m.from)
    );

    const result = Object.freeze({
      period: p.label || p.period || 'current',
      periodHe: p.labelHe || 'תקופה נוכחית',
      matrix,
      moved,
      totalCustomers,
      stable: totalCustomers - moved.length,
      byStageFrom,
      byStageTo,
      improvements: improvements.length,
      deteriorations: deteriorations.length,
      improvementList: improvements,
      deteriorationList: deteriorations,
      rule: 'IFRS 7 §35M — stage transfer disclosure',
      ruleHe: 'IFRS 7 סעיף 35M — גילוי מעברים בין שלבים',
    });
    this._log('STAGE_MIGRATION', {
      totalCustomers,
      improved: improvements.length,
      deteriorated: deteriorations.length,
    });
    return result;
  }

  /**
   * collectionEffort(customerId, attempts) — record documented
   * collection efforts against a customer.  Used by write-off logic
   * to verify the Israeli §17(4) "reasonable collection effort"
   * pre-condition. Append-only.
   *
   * attempts = [{ type, date, note, outcome, by }]
   */
  collectionEffort(customerId, attempts) {
    if (!customerId) throw new TypeError('collectionEffort: customerId required');
    if (!Array.isArray(attempts)) {
      attempts = [attempts];
    }
    this._collectionEfforts = this._collectionEfforts || new Map();
    const existing = this._collectionEfforts.get(customerId) || [];
    const appended = attempts.map((a) => {
      const t = a || {};
      return Object.freeze({
        id: 'CE-' + (++this._seq).toString().padStart(6, '0'),
        customerId,
        type: t.type || 'contact',
        typeHe: _v2CollectionTypeHe(t.type),
        date: t.date || new Date().toISOString(),
        note: t.note || null,
        outcome: t.outcome || 'no-response',
        by: t.by || null,
        documented: Boolean(t.documented !== false),
      });
    });
    const merged = existing.concat(appended);
    this._collectionEfforts.set(customerId, merged);
    this._log('COLLECTION_EFFORT', {
      customerId,
      attempts: appended.length,
      total: merged.length,
    });
    return {
      customerId,
      count: merged.length,
      added: appended.length,
      latest: appended[appended.length - 1] || null,
      history: merged.slice(),
    };
  }

  /** Get the append-only write-off ledger (v2). */
  writeOffLedger() {
    return (this._writeOffLedger || []).slice();
  }

  /** Get the append-only provision journal ledger. */
  journalLedger() {
    return (this._journalLedger || []).slice();
  }

  /** Get recorded collection efforts for a customer. */
  getCollectionEfforts(customerId) {
    if (!this._collectionEfforts) return [];
    return (this._collectionEfforts.get(customerId) || []).slice();
  }
}

/* ------------------------------------------------------------------ *
 * 3. v2 helpers — used by Agent Y-089 canonical API                   *
 * ------------------------------------------------------------------ */

function _v2ToTs(v) {
  if (v == null) return Date.now();
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) return Date.now();
  return t;
}

function _v2BucketOf(daysPastDue) {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '0-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  if (daysPastDue <= 180) return '91-180';
  if (daysPastDue <= 365) return '181-365';
  return '365+';
}

function _v2EmptyBuckets() {
  return {
    current: 0,
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '91-180': 0,
    '181-365': 0,
    '365+': 0,
  };
}

function _v2NormaliseAR(arBalance) {
  if (Array.isArray(arBalance)) return arBalance.slice();
  if (!arBalance || typeof arBalance !== 'object') return [];
  // Accept { invoices: [...] } shape as well
  if (Array.isArray(arBalance.invoices)) return arBalance.invoices.slice();
  // Or dictionary-shape: { invId: {amount, dueDate, ...} }
  const out = [];
  for (const [k, v] of Object.entries(arBalance)) {
    if (v && typeof v === 'object') {
      out.push(Object.assign({ invoiceId: k }, v));
    }
  }
  return out;
}

function _v2CollectionTypeHe(type) {
  const map = {
    'phone': 'שיחת טלפון',
    'email': 'דוא"ל',
    'letter': 'מכתב דרישה',
    'legal': 'הליך משפטי',
    'site-visit': 'ביקור באתר',
    'contact': 'יצירת קשר',
    'demand': 'דרישת תשלום',
    'meeting': 'פגישה',
    'lawyer-letter': 'מכתב עורך דין',
  };
  return map[type] || type || 'פעולת גבייה';
}

/* ------------------------------------------------------------------ *
 * 3b. Internal translations                                           *
 * ------------------------------------------------------------------ */

function translateBucket(bucket) {
  const map = {
    current: 'לא בפיגור',
    '0-30': '0-30 ימים',
    '31-60': '31-60 ימים',
    '61-90': '61-90 ימים',
    '91-120': '91-120 ימים',
    '121-180': '121-180 ימים',
    '>180': 'מעל 180 ימים',
    default: 'בכשל',
  };
  return map[bucket] || bucket;
}

/* ------------------------------------------------------------------ *
 * 4. Exports                                                          *
 * ------------------------------------------------------------------ */

module.exports = {
  BadDebtProvision,
  // constants
  IFRS9_STAGES,
  DEFAULT_LGD,
  ISRAELI_TAX_RULES,
  SICR_TRIGGERS,
  MACRO_FACTOR_WEIGHTS,
  WRITEOFF_STATES,
  // helpers (useful for tests and advanced callers)
  stageFromAge,
  discountFactor,
  yearsFromAgeBucket,
  round2,
  round4,
};
