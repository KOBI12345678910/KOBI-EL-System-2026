/**
 * Health Insurance Calculator — דמי ביטוח בריאות
 * Mega-ERP Techno-Kol Uzi — BL (Bituach Leumi) module
 *
 * Computes Israeli National Health Insurance contributions per חוק ביטוח
 * בריאות ממלכתי, התשנ"ד-1994. Health insurance is collected by המוסד לביטוח
 * לאומי (NII / BL) alongside national insurance, then transferred to the four
 * statutory health funds (קופות חולים): Clalit, Maccabi, Meuhedet, Leumit.
 *
 * Contract (public API):
 *   computeHealth({ income, status, year, ... })
 *     → { rate, base, tax, fund, supplemental, breakdown, meta, ... }
 *
 *   kupaSelector(employee)
 *     → { fund, fundCode, supplemental, supplementalCode, labels }
 *
 *   generateBLHealthFile(period, employees)
 *     → { header, rows, totals, text }   // plain-text BL submission payload
 *
 * Principle: לא מוחקים — רק משדרגים ומגדלים.
 *   This file is additive. It does NOT replace
 *   `onyx-procurement/src/payroll/wage-slip-calculator.js :: computeBituachLeumiAndHealth`.
 *   That function remains the canonical path for employee wage-slip calculation.
 *   THIS module generalises health insurance to all statuses (self-employed,
 *   pensioner, non-working, foreign resident, olim, reservists) and adds
 *   kupa + supplemental tracking + BL-file generation.
 *
 * Zero runtime dependencies (Node built-ins only).
 * Bilingual output: Hebrew (labels_he) + English (labels_en) on every result.
 *
 * @module onyx-procurement/src/bl/health-insurance
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 2026 CONSTANTS — דמי ביטוח בריאות
// Source: חוק ביטוח בריאות ממלכתי התשנ"ד-1994 ,
//         btl.gov.il rate tables,
//         aligned with onyx-procurement/src/payroll/wage-slip-calculator.js
//         (CONSTANTS_2026.HEALTH_TAX)  → see CONSTANTS_VERIFICATION.md
// ═══════════════════════════════════════════════════════════════

const HEALTH_INSURANCE_2026 = Object.freeze({
  year: 2026,

  // Monthly thresholds (NIS)
  MONTHLY_THRESHOLD: 7522,        // מדרגה נמוכה (60% שכר ממוצע)
  MONTHLY_MAX_BASE:  49030,       // תקרת הכנסה לביטוח בריאות

  // Employee rates (שכירים)
  EMPLOYEE_LOW_RATE:  0.031,      // 3.1% עד המדרגה
  EMPLOYEE_HIGH_RATE: 0.05,       // 5.0% מעל המדרגה

  // Self-employed rates (עצמאי) — same as employee for health, on net business income
  SELF_EMPLOYED_LOW_RATE:  0.031,
  SELF_EMPLOYED_HIGH_RATE: 0.05,

  // Pensioner (פנסיונר) — reduced flat rate on pension income
  // Flat minimum below threshold; 5% above threshold only on the excess.
  PENSIONER_FLAT_RATE: 0.031,
  PENSIONER_HIGH_RATE: 0.05,

  // Non-working / housewife / unemployed — דמי מינימום לבריאות
  // Statutory minimum monthly health payment for a non-working resident,
  // paid directly to BL. ~116 NIS/month in 2026 (rounded).
  MINIMUM_PAYMENT_MONTHLY: 116,

  // Foreign resident (תושב חוץ) — default exempt unless specifically liable
  // When liable (e.g. foreign resident employed by Israeli employer under specific
  // agreements), the standard employee rates apply. Most common case: exempt.
  FOREIGN_RESIDENT_LIABLE_BY_DEFAULT: false,

  // Discounts
  OLIM_DISCOUNT_MONTHS: 12,       // עולה חדש — פטור חלקי ל-12 חודשים ראשונים
  OLIM_DISCOUNT_RATE:   0.5,      // 50% הנחה בתקופת הזכאות
  RESERVIST_DISCOUNT_RATE: 0.25,  // מילואים — עד 25% הנחה לפי ימי שירות

  // Rounding
  ROUND_TO: 2,
});

// ─────────────────────────────────────────────────────────────
// Status codes (canonical)
// ─────────────────────────────────────────────────────────────
const STATUS = Object.freeze({
  EMPLOYEE:           'employee',
  SELF_EMPLOYED:      'self-employed',
  PENSIONER:          'pensioner',
  NON_WORKING:        'non-working',     // לא עובד / עקרת בית
  NON_WORKING_SPOUSE: 'non-working-spouse',
  FOREIGN_RESIDENT:   'foreign-resident',
});

// Status aliases → canonical
const STATUS_ALIASES = Object.freeze({
  'שכיר':             STATUS.EMPLOYEE,
  'employee':         STATUS.EMPLOYEE,
  'worker':           STATUS.EMPLOYEE,

  'עצמאי':            STATUS.SELF_EMPLOYED,
  'self-employed':    STATUS.SELF_EMPLOYED,
  'self_employed':    STATUS.SELF_EMPLOYED,
  'selfemployed':     STATUS.SELF_EMPLOYED,
  'osek':             STATUS.SELF_EMPLOYED,

  'פנסיונר':          STATUS.PENSIONER,
  'גמלאי':            STATUS.PENSIONER,
  'pensioner':        STATUS.PENSIONER,
  'retired':          STATUS.PENSIONER,

  'לא עובד':          STATUS.NON_WORKING,
  'לא-עובד':          STATUS.NON_WORKING,
  'עקרת בית':         STATUS.NON_WORKING,
  'non-working':      STATUS.NON_WORKING,
  'non_working':      STATUS.NON_WORKING,
  'unemployed':       STATUS.NON_WORKING,

  'בן/בת זוג לא עובד': STATUS.NON_WORKING_SPOUSE,
  'non-working-spouse': STATUS.NON_WORKING_SPOUSE,
  'non_working_spouse': STATUS.NON_WORKING_SPOUSE,
  'spouse':           STATUS.NON_WORKING_SPOUSE,

  'תושב חוץ':         STATUS.FOREIGN_RESIDENT,
  'foreign':          STATUS.FOREIGN_RESIDENT,
  'foreign-resident': STATUS.FOREIGN_RESIDENT,
  'foreign_resident': STATUS.FOREIGN_RESIDENT,
  'non-resident':     STATUS.FOREIGN_RESIDENT,
});

// ─────────────────────────────────────────────────────────────
// Health fund (קופת חולים) registry
// Codes per BL standard (Form BL-102 / Form BL-126 fund field)
// ─────────────────────────────────────────────────────────────
const HEALTH_FUNDS = Object.freeze({
  clalit: {
    code: '01',
    name_he: 'כללית',
    name_en: 'Clalit',
    full_name_he: 'שירותי בריאות כללית',
  },
  maccabi: {
    code: '02',
    name_he: 'מכבי',
    name_en: 'Maccabi',
    full_name_he: 'מכבי שירותי בריאות',
  },
  meuhedet: {
    code: '03',
    name_he: 'מאוחדת',
    name_en: 'Meuhedet',
    full_name_he: 'קופת חולים מאוחדת',
  },
  leumit: {
    code: '04',
    name_he: 'לאומית',
    name_en: 'Leumit',
    full_name_he: 'קופת חולים לאומית',
  },
});

// Supplemental tiers (ביטוח משלים) — common across funds
const SUPPLEMENTAL_TIERS = Object.freeze({
  none:     { code: '0', name_he: 'ללא',      name_en: 'None' },
  silver:   { code: '1', name_he: 'כסף',      name_en: 'Silver'   }, // כסף (basic)
  gold:     { code: '2', name_he: 'זהב',      name_en: 'Gold'     }, // זהב
  platinum: { code: '3', name_he: 'פלטינה',   name_en: 'Platinum' }, // פלטינה
});

// ═══════════════════════════════════════════════════════════════
// Low-level helpers
// ═══════════════════════════════════════════════════════════════

function round(n, decimals) {
  const d = decimals == null ? HEALTH_INSURANCE_2026.ROUND_TO : decimals;
  const factor = Math.pow(10, d);
  return Math.round((Number(n) || 0) * factor) / factor;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeStatus(status) {
  if (!status) return STATUS.EMPLOYEE;
  const s = String(status).trim().toLowerCase();
  // Try exact match on aliases (case-insensitive for english, case-preserving for hebrew)
  if (STATUS_ALIASES[s] !== undefined) return STATUS_ALIASES[s];
  // Hebrew aliases are keyed in their natural case
  if (STATUS_ALIASES[String(status).trim()] !== undefined) {
    return STATUS_ALIASES[String(status).trim()];
  }
  // Allow passing the canonical value directly
  const values = Object.values(STATUS);
  if (values.includes(s)) return s;
  throw new Error(
    `Unknown status "${status}". Expected one of: ${values.join(', ')} ` +
    `or aliases (${Object.keys(STATUS_ALIASES).join(', ')}).`
  );
}

/**
 * Two-tier base calculation shared by most statuses.
 * Applies floor(0), cap at MONTHLY_MAX_BASE, splits into low/high portions.
 */
function splitBase(income, thresholdOverride, capOverride) {
  const T = thresholdOverride == null ? HEALTH_INSURANCE_2026.MONTHLY_THRESHOLD : thresholdOverride;
  const M = capOverride == null ? HEALTH_INSURANCE_2026.MONTHLY_MAX_BASE : capOverride;
  const raw = Math.max(0, toNum(income));
  const base = Math.min(raw, M);
  const low  = Math.min(base, T);
  const high = Math.max(0, base - T);
  return { base, low, high, cappedOut: raw > M ? raw - M : 0 };
}

// ═══════════════════════════════════════════════════════════════
// Per-status computation
// ═══════════════════════════════════════════════════════════════

function computeEmployee(income, C) {
  const { base, low, high, cappedOut } = splitBase(income);
  const lowTax  = low  * C.EMPLOYEE_LOW_RATE;
  const highTax = high * C.EMPLOYEE_HIGH_RATE;
  const tax = round(lowTax + highTax);
  const effectiveRate = base > 0 ? tax / base : 0;
  return {
    base,
    tax,
    rate: effectiveRate,
    breakdown: {
      low_base: round(low),
      low_rate: C.EMPLOYEE_LOW_RATE,
      low_tax:  round(lowTax),
      high_base: round(high),
      high_rate: C.EMPLOYEE_HIGH_RATE,
      high_tax:  round(highTax),
      capped_out: round(cappedOut),
    },
  };
}

function computeSelfEmployed(netBusinessIncome, C) {
  const { base, low, high, cappedOut } = splitBase(netBusinessIncome);
  const lowTax  = low  * C.SELF_EMPLOYED_LOW_RATE;
  const highTax = high * C.SELF_EMPLOYED_HIGH_RATE;
  const tax = round(lowTax + highTax);
  const effectiveRate = base > 0 ? tax / base : 0;
  return {
    base,
    tax,
    rate: effectiveRate,
    breakdown: {
      low_base: round(low),
      low_rate: C.SELF_EMPLOYED_LOW_RATE,
      low_tax:  round(lowTax),
      high_base: round(high),
      high_rate: C.SELF_EMPLOYED_HIGH_RATE,
      high_tax:  round(highTax),
      capped_out: round(cappedOut),
      note_he: 'מחושב על הכנסה חייבת נטו מעסק',
      note_en: 'Computed on net taxable business income',
    },
  };
}

function computePensioner(pensionIncome, C) {
  // Pensioners pay a reduced flat rate on pension; progression still applies at
  // the BL threshold for very high pensions.
  const { base, low, high, cappedOut } = splitBase(pensionIncome);
  const lowTax  = low  * C.PENSIONER_FLAT_RATE;
  const highTax = high * C.PENSIONER_HIGH_RATE;
  const tax = round(lowTax + highTax);
  const effectiveRate = base > 0 ? tax / base : 0;
  return {
    base,
    tax,
    rate: effectiveRate,
    breakdown: {
      low_base: round(low),
      low_rate: C.PENSIONER_FLAT_RATE,
      low_tax:  round(lowTax),
      high_base: round(high),
      high_rate: C.PENSIONER_HIGH_RATE,
      high_tax:  round(highTax),
      capped_out: round(cappedOut),
      note_he: 'שיעור פנסיונר מופחת על קצבה',
      note_en: 'Reduced pensioner rate on pension income',
    },
  };
}

function computeNonWorking(C) {
  // Flat statutory minimum regardless of income.
  return {
    base: 0,
    tax: round(C.MINIMUM_PAYMENT_MONTHLY),
    rate: 0,
    breakdown: {
      minimum_payment: round(C.MINIMUM_PAYMENT_MONTHLY),
      note_he: 'דמי מינימום לבריאות (לא-עובד / עקרת בית)',
      note_en: 'Statutory minimum health payment (non-working resident)',
    },
  };
}

function computeNonWorkingSpouse() {
  // A non-working spouse of an insured resident is covered without separate
  // payment (פטור לפי חוק ביטוח בריאות ממלכתי — הכיסוי נובע מבן/בת הזוג המבוטח).
  return {
    base: 0,
    tax: 0,
    rate: 0,
    breakdown: {
      note_he: 'בן/בת זוג לא עובד — פטור, הכיסוי דרך המבוטח השני',
      note_en: 'Non-working spouse — covered by insured partner, no separate payment',
    },
  };
}

function computeForeignResident(income, liable, C) {
  if (!liable) {
    return {
      base: 0,
      tax: 0,
      rate: 0,
      breakdown: {
        exempt: true,
        note_he: 'תושב חוץ — פטור מדמי ביטוח בריאות',
        note_en: 'Foreign resident — exempt from health insurance',
      },
    };
  }
  // When liable, treat as employee (Israeli-source employment income).
  const asEmp = computeEmployee(income, C);
  asEmp.breakdown.note_he = 'תושב חוץ — חייב לפי הסדר מיוחד, שיעור שכיר';
  asEmp.breakdown.note_en = 'Foreign resident — liable under special arrangement, employee rate';
  return asEmp;
}

// ═══════════════════════════════════════════════════════════════
// Discount stack (olim, reservists)
// ═══════════════════════════════════════════════════════════════

/**
 * Returns a multiplier in [0, 1] applied to the gross health tax.
 * 1.0 means no discount. Discounts compound multiplicatively.
 */
function computeDiscountMultiplier(options, C) {
  let multiplier = 1;

  // עולה חדש — 50% הנחה במהלך 12 חודשי זכאות
  if (options && options.oleh && options.oleh.active) {
    const monthsSinceAliyah = toNum(options.oleh.monthsSinceAliyah);
    if (monthsSinceAliyah >= 0 && monthsSinceAliyah < C.OLIM_DISCOUNT_MONTHS) {
      multiplier *= (1 - C.OLIM_DISCOUNT_RATE);
    }
  }

  // מילואים — עד 25% הנחה, פרופורציונלי לימי השירות בחודש (ימים/30)
  if (options && options.reservist && options.reservist.days > 0) {
    const days = Math.min(30, toNum(options.reservist.days));
    const discount = C.RESERVIST_DISCOUNT_RATE * (days / 30);
    multiplier *= (1 - discount);
  }

  return multiplier;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — computeHealth
// ═══════════════════════════════════════════════════════════════

/**
 * Compute monthly Israeli health insurance (דמי ביטוח בריאות).
 *
 * @param {Object}  args
 * @param {number}  args.income         Monthly income in NIS (employee: gross taxable;
 *                                       self-employed: net business income;
 *                                       pensioner: pension amount; non-working: ignored).
 * @param {string}  args.status         one of: employee / self-employed / pensioner /
 *                                       non-working / non-working-spouse / foreign-resident
 *                                       (Hebrew aliases accepted).
 * @param {number}  [args.year=2026]    Tax year; currently only 2026 implemented.
 * @param {boolean} [args.liable]       For foreign residents: override exempt default.
 * @param {Object}  [args.fund]         { fund, supplemental } pre-selected (else "clalit/none").
 * @param {Object}  [args.employee]     Employee record for kupaSelector fallback.
 * @param {Object}  [args.oleh]         { active:boolean, monthsSinceAliyah:number }
 * @param {Object}  [args.reservist]    { days:number }
 * @returns {{
 *   rate: number,
 *   base: number,
 *   tax: number,
 *   fund: string,
 *   supplemental: string,
 *   status: string,
 *   year: number,
 *   breakdown: Object,
 *   discounts: Object,
 *   labels_he: Object,
 *   labels_en: Object,
 *   meta: Object
 * }}
 */
function computeHealth(args) {
  if (!args || typeof args !== 'object') {
    throw new Error('computeHealth(args): args object required');
  }

  const year   = args.year || 2026;
  if (year !== 2026) {
    throw new Error(`Only 2026 rate tables implemented; got year=${year}`);
  }
  const C = HEALTH_INSURANCE_2026;

  const status = normalizeStatus(args.status);
  const income = toNum(args.income);

  // Route to the per-status calculator
  let result;
  switch (status) {
    case STATUS.EMPLOYEE:
      result = computeEmployee(income, C);
      break;
    case STATUS.SELF_EMPLOYED:
      result = computeSelfEmployed(income, C);
      break;
    case STATUS.PENSIONER:
      result = computePensioner(income, C);
      break;
    case STATUS.NON_WORKING:
      result = computeNonWorking(C);
      break;
    case STATUS.NON_WORKING_SPOUSE:
      result = computeNonWorkingSpouse();
      break;
    case STATUS.FOREIGN_RESIDENT: {
      const liable = args.liable === undefined
        ? C.FOREIGN_RESIDENT_LIABLE_BY_DEFAULT
        : Boolean(args.liable);
      result = computeForeignResident(income, liable, C);
      break;
    }
    default:
      throw new Error(`Unhandled status: ${status}`);
  }

  // Apply discount stack (olim, reservists)
  const discountMultiplier = computeDiscountMultiplier(
    { oleh: args.oleh, reservist: args.reservist },
    C
  );
  const preDiscountTax = result.tax;
  if (discountMultiplier !== 1) {
    result.tax = round(result.tax * discountMultiplier);
  }

  // Fund/supplemental selection
  let fundSel;
  if (args.fund && typeof args.fund === 'object' && args.fund.fund) {
    fundSel = kupaSelector({
      health_fund: args.fund.fund,
      supplemental: args.fund.supplemental,
    });
  } else if (args.employee) {
    fundSel = kupaSelector(args.employee);
  } else {
    fundSel = kupaSelector({});
  }

  return {
    // primary contract
    rate:         round(result.rate, 6),
    base:         round(result.base),
    tax:          round(result.tax),
    fund:         fundSel.fund,
    supplemental: fundSel.supplemental,

    // context
    status,
    year,
    income:       round(income),

    // detail
    breakdown:    result.breakdown,
    discounts: {
      pre_discount_tax: round(preDiscountTax),
      multiplier: round(discountMultiplier, 6),
      oleh: args.oleh || null,
      reservist: args.reservist || null,
      savings: round(preDiscountTax - result.tax),
    },
    fund_detail: fundSel,

    // bilingual labels for UI
    labels_he: {
      tax:    'דמי ביטוח בריאות',
      base:   'בסיס הכנסה לחישוב',
      rate:   'שיעור אפקטיבי',
      fund:   fundSel.labels.fund_he,
      supplemental: fundSel.labels.supplemental_he,
      status: statusHe(status),
    },
    labels_en: {
      tax:    'Health Insurance',
      base:   'Taxable base',
      rate:   'Effective rate',
      fund:   fundSel.labels.fund_en,
      supplemental: fundSel.labels.supplemental_en,
      status: statusEn(status),
    },
    meta: {
      threshold: C.MONTHLY_THRESHOLD,
      ceiling:   C.MONTHLY_MAX_BASE,
      minimum_payment: C.MINIMUM_PAYMENT_MONTHLY,
      law_he: 'חוק ביטוח בריאות ממלכתי, התשנ"ד-1994',
      law_en: 'National Health Insurance Law, 1994',
      module: 'onyx-procurement/src/bl/health-insurance',
      version: '1.0.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Status labels
// ═══════════════════════════════════════════════════════════════
function statusHe(status) {
  switch (status) {
    case STATUS.EMPLOYEE:           return 'שכיר';
    case STATUS.SELF_EMPLOYED:      return 'עצמאי';
    case STATUS.PENSIONER:          return 'פנסיונר';
    case STATUS.NON_WORKING:        return 'לא עובד';
    case STATUS.NON_WORKING_SPOUSE: return 'בן/בת זוג לא עובד';
    case STATUS.FOREIGN_RESIDENT:   return 'תושב חוץ';
    default:                        return status;
  }
}
function statusEn(status) {
  switch (status) {
    case STATUS.EMPLOYEE:           return 'Employee';
    case STATUS.SELF_EMPLOYED:      return 'Self-employed';
    case STATUS.PENSIONER:          return 'Pensioner';
    case STATUS.NON_WORKING:        return 'Non-working resident';
    case STATUS.NON_WORKING_SPOUSE: return 'Non-working spouse';
    case STATUS.FOREIGN_RESIDENT:   return 'Foreign resident';
    default:                        return status;
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — kupaSelector
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve health fund + supplemental tier from an employee record.
 * Accepts many input spellings — Hebrew and English, free text, or codes.
 *
 * @param {Object} employee
 * @param {string} [employee.health_fund]        e.g. 'clalit', 'מכבי', 'Maccabi', '02'
 * @param {string} [employee.kupa]               alias of health_fund
 * @param {string} [employee.supplemental]       'none' | 'silver' | 'gold' | 'platinum'
 *                                               or 'כסף' | 'זהב' | 'פלטינה'
 * @returns {{ fund:string, fundCode:string, supplemental:string, supplementalCode:string,
 *             labels:{ fund_he:string, fund_en:string, supplemental_he:string, supplemental_en:string } }}
 */
function kupaSelector(employee) {
  const emp = employee || {};
  const rawFund = emp.health_fund || emp.kupa || emp.fund || '';
  const rawSupp = emp.supplemental || emp.supp || emp.supplemental_tier || '';

  const fundKey = resolveFundKey(rawFund);
  const suppKey = resolveSupplementalKey(rawSupp);

  const fund = HEALTH_FUNDS[fundKey];
  const supp = SUPPLEMENTAL_TIERS[suppKey];

  return {
    fund:             fundKey,
    fundCode:         fund.code,
    supplemental:     suppKey,
    supplementalCode: supp.code,
    labels: {
      fund_he:         fund.name_he,
      fund_full_he:    fund.full_name_he,
      fund_en:         fund.name_en,
      supplemental_he: supp.name_he,
      supplemental_en: supp.name_en,
    },
  };
}

function resolveFundKey(raw) {
  if (!raw) return 'clalit'; // default — largest fund, sensible fallback
  const s = String(raw).trim().toLowerCase();

  // Direct key match
  if (HEALTH_FUNDS[s]) return s;

  // Hebrew / English name match
  for (const key of Object.keys(HEALTH_FUNDS)) {
    const f = HEALTH_FUNDS[key];
    if (
      s === f.name_en.toLowerCase() ||
      raw === f.name_he ||
      raw === f.full_name_he ||
      s === f.code
    ) {
      return key;
    }
  }

  // Partial matches (defensive — catches "Maccabi Health", "כללית שירותי בריאות")
  for (const key of Object.keys(HEALTH_FUNDS)) {
    const f = HEALTH_FUNDS[key];
    if (
      s.includes(f.name_en.toLowerCase()) ||
      String(raw).includes(f.name_he)
    ) {
      return key;
    }
  }

  // Unknown — default to Clalit but flag in result via caller
  return 'clalit';
}

function resolveSupplementalKey(raw) {
  if (!raw) return 'none';
  const s = String(raw).trim().toLowerCase();

  if (SUPPLEMENTAL_TIERS[s]) return s;

  const map = {
    '':         'none',
    'ללא':      'none',
    'none':     'none',
    'basic':    'silver',
    'silver':   'silver',
    'כסף':      'silver',
    '1':        'silver',
    'gold':     'gold',
    'זהב':      'gold',
    '2':        'gold',
    'platinum': 'platinum',
    'platina':  'platinum',
    'פלטינה':   'platinum',
    '3':        'platinum',
  };
  if (map[s] !== undefined) return map[s];
  if (map[String(raw).trim()] !== undefined) return map[String(raw).trim()];

  return 'none';
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — generateBLHealthFile
// ═══════════════════════════════════════════════════════════════

/**
 * Produce a plain-text submission file for BL that combines BL (national
 * insurance) + health insurance per-employee lines. Format is a fixed-width,
 * pipe-delimited text blob designed to be easy to validate, diff, and audit
 * — NOT the binary XML form that ביטוח לאומי accepts for its online API.
 *
 * This is the canonical internal "what we intend to report" file; a separate
 * adapter (src/tax-exports/form-102-xml.js) translates it into the official
 * BL-102 XML when ready.
 *
 * @param {Object} period  { year, month }
 * @param {Array}  employees  Array of employee objects. Each must provide:
 *                            { id, name, tz|id_number, status, income,
 *                              health_fund, supplemental, oleh?, reservist? }
 * @returns {{ header:Object, rows:Array, totals:Object, text:string, filename:string }}
 */
function generateBLHealthFile(period, employees) {
  if (!period || !period.year || !period.month) {
    throw new Error('generateBLHealthFile(period, employees): period {year, month} required');
  }
  if (!Array.isArray(employees)) {
    throw new Error('generateBLHealthFile: employees must be an array');
  }

  const periodTag = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const rows = [];
  const totals = {
    employees_count: employees.length,
    total_base: 0,
    total_health_tax: 0,
    total_bl_tax: 0,   // optional — if caller passed bl_tax on each record
    total_combined: 0,
    by_fund: { clalit: 0, maccabi: 0, meuhedet: 0, leumit: 0 },
    by_status: {},
  };

  for (const emp of employees) {
    const h = computeHealth({
      income:   emp.income,
      status:   emp.status || 'employee',
      year:     period.year,
      employee: emp,
      oleh:     emp.oleh,
      reservist: emp.reservist,
      liable:   emp.liable,
    });

    const blTax = toNum(emp.bl_tax);  // caller-provided BL national insurance line
    const combined = round(h.tax + blTax);

    const row = {
      id:            String(emp.id || ''),
      tz:            String(emp.tz || emp.id_number || ''),
      name:          String(emp.name || ''),
      status:        h.status,
      income:        round(h.income),
      base:          h.base,
      health_tax:    h.tax,
      bl_tax:        round(blTax),
      combined:      combined,
      fund:          h.fund,
      fund_code:     h.fund_detail.fundCode,
      supplemental:  h.supplemental,
      supplemental_code: h.fund_detail.supplementalCode,
    };
    rows.push(row);

    totals.total_base       = round(totals.total_base + h.base);
    totals.total_health_tax = round(totals.total_health_tax + h.tax);
    totals.total_bl_tax     = round(totals.total_bl_tax + blTax);
    totals.total_combined   = round(totals.total_combined + combined);
    totals.by_fund[h.fund]  = round((totals.by_fund[h.fund] || 0) + h.tax);
    totals.by_status[h.status] = round((totals.by_status[h.status] || 0) + h.tax);
  }

  // Text-format header + rows + totals
  const header = {
    file_type:     'BL-HEALTH-COMBINED',
    version:       '1.0.0',
    period:        periodTag,
    generated_at:  new Date().toISOString(),
    employer_count: 1,
    employees_count: rows.length,
  };

  const headerLine  = `HDR|${header.file_type}|${header.version}|${header.period}|${header.generated_at}|${header.employees_count}`;
  const colHeader   = `EMP|id|tz|name|status|income|base|health_tax|bl_tax|combined|fund_code|supp_code`;
  const rowLines    = rows.map(r =>
    `EMP|${r.id}|${r.tz}|${r.name}|${r.status}|${r.income.toFixed(2)}|${r.base.toFixed(2)}|${r.health_tax.toFixed(2)}|${r.bl_tax.toFixed(2)}|${r.combined.toFixed(2)}|${r.fund_code}|${r.supplemental_code}`
  );
  const totalsLine  =
    `TOT|employees=${totals.employees_count}|base=${totals.total_base.toFixed(2)}` +
    `|health=${totals.total_health_tax.toFixed(2)}|bl=${totals.total_bl_tax.toFixed(2)}` +
    `|combined=${totals.total_combined.toFixed(2)}`;
  const fundsLine   =
    `FND|clalit=${totals.by_fund.clalit.toFixed(2)}|maccabi=${totals.by_fund.maccabi.toFixed(2)}` +
    `|meuhedet=${totals.by_fund.meuhedet.toFixed(2)}|leumit=${totals.by_fund.leumit.toFixed(2)}`;

  const text = [headerLine, colHeader, ...rowLines, totalsLine, fundsLine].join('\n') + '\n';

  return {
    header,
    rows,
    totals,
    text,
    filename: `bl-health-${periodTag}.txt`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // constants / registries
  HEALTH_INSURANCE_2026,
  HEALTH_FUNDS,
  SUPPLEMENTAL_TIERS,
  STATUS,
  STATUS_ALIASES,

  // public API
  computeHealth,
  kupaSelector,
  generateBLHealthFile,

  // useful helpers (exported for reuse + testing)
  normalizeStatus,
  splitBase,
  resolveFundKey,
  resolveSupplementalKey,
  statusHe,
  statusEn,
  round,
};
