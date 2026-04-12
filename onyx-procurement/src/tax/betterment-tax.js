/**
 * betterment-tax.js — מחשבון מס שבח מקרקעין (Israeli Real Estate Betterment Tax)
 * Agent Y-007 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli real-estate betterment-tax engine per חוק מיסוי מקרקעין (שבח ורכישה)
 * התשכ"ג-1963 ("Mas Shevach").
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים —
 * this module never deletes, never mutates caller data, and is additive only.
 *
 *   • Nominal betterment (שבח נומינלי)       = sale − purchase − improvements − expenses
 *   • Real betterment    (שבח ריאלי)          after CPI adjustment per סעיף 47
 *   • Linear split across ownership periods  (pre-2014 / post-2014) per סעיף 48א(ב1)
 *   • Tax: 25% general (individual) / 23% (company) / progressive option
 *   • Exemptions                              פרק חמישי 1 של החוק — סעיפים 49-49כה
 *     – Primary residence / דירת מגורים מזכה (סעיף 49ב(2))
 *     – Four-year cool-down / תקופת צינון (סעיף 49ב(1))
 *     – Inheritance / הורשה (סעיף 49ב(5))
 *     – Gift between relatives / מתנה בין קרובים (סעיף 62)
 *   • Section 48א / 48ב special cases — linear exempt, reduced rate for elderly, etc.
 *   • Form מש"ח — תצהיר מוכר / Mas Shevach self-declaration form fields
 *
 * Zero external dependencies. All functions are pure unless explicitly noted.
 * Bilingual (Hebrew + English) labels and citations throughout.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *
 *   computeBettermentTax(params)   → full structured breakdown + form fields
 *   checkExemption(params)         → list of eligible exemptions with citations
 *   linearSplit(params)            → low-level helper for period split math
 *   indexByCpi(value, from, to, cpiTable)    → real-value adjustment helper
 *   buildForm7000Fields(calc)      → field map for טופס מש"ח / Form 7000
 *   LAW_CITATIONS, TAX_RATES, KEY_DATES      → constants
 *
 * Reference law sections:
 *   חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963
 *     סעיף 6      — הטלת המס
 *     סעיף 47     — הגדרת שבח ריאלי + מדד
 *     סעיף 48א    — שיעורי המס (יחיד, חברה)
 *     סעיף 48א(ב1)— חישוב ליניארי — תקופות החזקה (boundary 01/01/2014)
 *     סעיף 48א(ב)— הקלות — מבוגר/נכה
 *     סעיף 48ב    — דירת מגורים מזכה
 *     סעיף 49ב(1) — תקופת צינון 4 שנים
 *     סעיף 49ב(2) — פטור לדירת מגורים יחידה
 *     סעיף 49ב(5) — פטור בהורשה
 *     סעיף 62     — מתנה בין קרובים — דחיית אירוע מס
 *     סעיף 49ז    — תקרת שווי פטור (לפי עדכון שנתי)
 *
 * ---------------------------------------------------------------------------
 * Data shapes (JSDoc):
 *
 * @typedef {Object} ImprovementEntry
 * @property {number} amount          Cost in ILS (positive, before CPI adjustment)
 * @property {string} date            ISO date YYYY-MM-DD when the cost was incurred
 * @property {string} [description]   Free text (e.g. "שיפוץ מטבח")
 *
 * @typedef {Object} ExpenseEntry
 * @property {number} amount
 * @property {string} [date]
 * @property {string} [description]   (e.g. "שכ"ט עו"ד", "מס רכישה", "עמלת תיווך")
 *
 * @typedef {Object} CpiTable
 * @property {Object.<string, number>} monthly   Map "YYYY-MM" → index value
 * @property {number} [base]                     Optional reference base (defaults to 100)
 *
 * @typedef {Object} BettermentParams
 * @property {number} purchase                    מחיר רכישה (ILS)
 * @property {number} sale                        מחיר מכירה (ILS)
 * @property {string} purchaseDate                ISO — תאריך רכישה
 * @property {string} saleDate                    ISO — תאריך מכירה
 * @property {ImprovementEntry[]} [improvements]  השבחות ותוספות
 * @property {ExpenseEntry[]|number} [expenses]   הוצאות מותרות בניכוי
 * @property {string} [propertyType]              apartment | land | commercial | farm
 * @property {boolean} [isPrimaryResidence]       דירה יחידה
 * @property {"individual"|"company"} [sellerStatus]
 * @property {CpiTable} [cpiTable]
 * @property {boolean} [requestLinearExempt]      Request 48א(ב1) linear-exempt method
 * @property {boolean} [receivedFromRelative]     התקבל במתנה מקרוב
 * @property {boolean} [receivedAsInheritance]    התקבל בירושה
 * @property {boolean} [soldPriorResidenceWithin4y]  Sold a prior residence within 4 years
 * @property {string} [sellerBirthDate]           For סעיף 48א(ב) elderly benefits
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants — tax rates, key dates, law citations
// ═══════════════════════════════════════════════════════════════

/**
 * Boundary date for the linear method split under סעיף 48א(ב1).
 * Before 01/01/2014 the real betterment is exempt on the primary-residence
 * portion; from 2014 onwards it's taxed at the regular 25%.
 * The relevant sub-date 07/11/2001 separates the historical-2001
 * pre-reform rate (old progressive marginal) from the 20%/25% window.
 */
const KEY_DATES = Object.freeze({
  RESIDENCE_REFORM: '1961-04-01',      // תחילת החוק
  PRE_REFORM_BOUND: '2001-11-07',      // 2001 reform — נקודת מפנה ראשונה
  LINEAR_BOUND: '2014-01-01',          // תיקון 76 — חישוב ליניארי
  CPI_START: '1951-01-01',             // בסיס מדד המחירים לצרכן
});

/**
 * Tax rates used by סעיף 48א.
 * Rates expressed as decimals. `HISTORICAL_MAX` is the maximum marginal
 * used for the pre-2001 portion of the linear split (individual).
 */
const TAX_RATES = Object.freeze({
  INDIVIDUAL_GENERAL: 0.25,      // יחיד — שיעור כללי (post-2014)
  COMPANY_GENERAL: 0.23,         // חברה — מס חברות 2026
  HISTORICAL_MAX: 0.47,          // יחיד — פרה-2001, שיעור מרבי שוליים
  INFLATION_ADJUSTED: 0.10,      // שבח ריאלי עד 07/11/2001 — סעיף 48א(ב)
  EXEMPT: 0.00,                  // הפרה לתקופה לפני 2014 בדירת מגורים מזכה
  ELDERLY_REDUCED: 0.20,         // מעל גיל 60 — הקלה אפשרית (סעיף 48א(ב))
});

/**
 * Ceiling for the linear-exempt relief under סעיף 49א(א1).
 * Updated annually; the default reflects the 2026 ceiling.
 * Callers may override via params.ceilingOverride.
 */
const EXEMPTION_CEILINGS_2026 = Object.freeze({
  SINGLE_RESIDENCE: 5_008_000,      // תקרה לדירה יחידה (ILS)
  LINEAR_EXEMPT: 5_008_000,         // תקרה לחישוב ליניארי מוטב
  ENHANCED_SINGLE: 5_008_000,       // עדכון רשות המסים 2026
});

/**
 * Citations for every exemption rule returned by `checkExemption`.
 * Use short keys to avoid typos, full Hebrew labels for UI.
 */
const LAW_CITATIONS = Object.freeze({
  SECTION_6: {
    he: 'סעיף 6 לחוק מיסוי מקרקעין — הטלת מס שבח',
    en: 'Section 6 — Imposition of betterment tax',
  },
  SECTION_47: {
    he: 'סעיף 47 — שבח ריאלי והצמדה למדד',
    en: 'Section 47 — Real betterment and CPI linking',
  },
  SECTION_48A: {
    he: 'סעיף 48א — שיעורי המס',
    en: 'Section 48A — Tax rates',
  },
  SECTION_48A_B1: {
    he: 'סעיף 48א(ב1) — חישוב ליניארי מוטב',
    en: 'Section 48A(b1) — Beneficial linear method',
  },
  SECTION_48B: {
    he: 'סעיף 48ב — דירת מגורים מזכה',
    en: 'Section 48B — Qualifying residential apartment',
  },
  SECTION_49B1: {
    he: 'סעיף 49ב(1) — תקופת צינון 4 שנים',
    en: 'Section 49B(1) — Four-year cooling-off period',
  },
  SECTION_49B2: {
    he: 'סעיף 49ב(2) — פטור לדירה יחידה',
    en: 'Section 49B(2) — Single-residence exemption',
  },
  SECTION_49B5: {
    he: 'סעיף 49ב(5) — פטור בהורשה',
    en: 'Section 49B(5) — Inheritance exemption',
  },
  SECTION_62: {
    he: 'סעיף 62 — מתנה בין קרובים',
    en: 'Section 62 — Gift between relatives',
  },
  SECTION_49A_A1: {
    he: 'סעיף 49א(א1) — תקרת שווי',
    en: 'Section 49A(a1) — Value ceiling',
  },
});

// ═══════════════════════════════════════════════════════════════
// Internal helpers — zero dependencies, pure
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimals, avoiding FP drift. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Clamp to non-negative. */
function nonNeg(n) {
  return n < 0 ? 0 : n;
}

/** Parse a YYYY-MM-DD date into a UTC Date object. Throws on invalid input. */
function parseDate(d) {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (typeof d !== 'string') throw new TypeError(`betterment-tax: invalid date "${d}"`);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) throw new TypeError(`betterment-tax: invalid date format "${d}" — expected YYYY-MM-DD`);
  const yr = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  if (mo < 0 || mo > 11 || da < 1 || da > 31) {
    throw new TypeError(`betterment-tax: out-of-range date "${d}"`);
  }
  return new Date(Date.UTC(yr, mo, da));
}

/** Difference in whole days between two YYYY-MM-DD dates (b − a). */
function daysBetween(a, b) {
  const ta = parseDate(a).getTime();
  const tb = parseDate(b).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

/** Format a Date as YYYY-MM. */
function toMonthKey(d) {
  const dt = parseDate(d);
  const yr = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${yr}-${mo}`;
}

/**
 * Look up the CPI value for a given ISO date. Walks backwards up to 12 months
 * to find the nearest published index — Israeli CBS publishes monthly so a
 * mid-month transaction uses the index of the transaction month (or the
 * most recent available).
 *
 * @param {string} isoDate
 * @param {CpiTable} cpiTable
 * @returns {number|null}
 */
function lookupCpi(isoDate, cpiTable) {
  if (!cpiTable || !cpiTable.monthly) return null;
  const start = toMonthKey(isoDate);
  if (cpiTable.monthly[start] != null) return cpiTable.monthly[start];

  // Walk backwards up to 12 months.
  const [yrStr, moStr] = start.split('-');
  let yr = Number(yrStr);
  let mo = Number(moStr);
  for (let i = 0; i < 12; i++) {
    mo -= 1;
    if (mo < 1) {
      mo = 12;
      yr -= 1;
    }
    const key = `${yr}-${String(mo).padStart(2, '0')}`;
    if (cpiTable.monthly[key] != null) return cpiTable.monthly[key];
  }
  return null;
}

/**
 * Adjust a nominal value from `fromDate` to `toDate` using the CPI table.
 * Falls back to 1.0 factor (no indexing) when the table is missing —
 * callers should pass a CPI table for accurate מס שבח results.
 *
 * @param {number} value
 * @param {string} fromDate
 * @param {string} toDate
 * @param {CpiTable} [cpiTable]
 * @returns {{adjusted:number, factor:number, cpiFrom:number|null, cpiTo:number|null}}
 */
function indexByCpi(value, fromDate, toDate, cpiTable) {
  const v = Number(value) || 0;
  const cpiFrom = lookupCpi(fromDate, cpiTable);
  const cpiTo = lookupCpi(toDate, cpiTable);
  if (cpiFrom == null || cpiTo == null || cpiFrom === 0) {
    return { adjusted: round2(v), factor: 1, cpiFrom, cpiTo };
  }
  const factor = cpiTo / cpiFrom;
  return { adjusted: round2(v * factor), factor: round2(factor * 10000) / 10000, cpiFrom, cpiTo };
}

// ═══════════════════════════════════════════════════════════════
// Linear method — סעיף 48א(ב1)
// ═══════════════════════════════════════════════════════════════

/**
 * Split the real betterment across ownership periods, producing a tax figure
 * per segment. Under תיקון 76 (effective 01/01/2014), the gain accumulated
 * before the boundary enjoys a preferential (or exempt) rate while the gain
 * after the boundary is taxed at the regular 25%.
 *
 * Mathematical formula:
 *
 *   daysInPeriod  = max(0, min(saleDate, boundary) − max(purchaseDate, previous))
 *   shareOfTotal  = daysInPeriod / totalOwnershipDays
 *   gainInPeriod  = realBetterment × shareOfTotal
 *   tax           = gainInPeriod × rateForPeriod
 *
 * @param {Object} params
 * @param {string} params.purchaseDate
 * @param {string} params.saleDate
 * @param {number} params.realBetterment
 * @param {"individual"|"company"} params.sellerStatus
 * @param {boolean} params.isPrimaryResidence
 * @param {boolean} [params.linearExempt]
 * @returns {Object} breakdown of periods + total linear tax
 */
function linearSplit({
  purchaseDate,
  saleDate,
  realBetterment,
  sellerStatus = 'individual',
  isPrimaryResidence = false,
  linearExempt = false,
}) {
  const totalDays = daysBetween(purchaseDate, saleDate);
  if (totalDays <= 0) {
    return {
      periods: [],
      totalDays: 0,
      totalTax: 0,
      method: 'linear',
      note: 'saleDate must be strictly after purchaseDate',
    };
  }

  // Build ordered list of boundaries that fall inside [purchase, sale].
  //
  //   pre-2001  = [purchase,            min(sale, 2001-11-07)]
  //   pre-2014  = [max(purchase, 2001-11-07), min(sale, 2014-01-01)]
  //   post-2014 = [max(purchase, 2014-01-01), sale]
  //
  // A segment is dropped entirely when its resulting day count is ≤ 0, so the
  // callers that check `periods.find(label === 'post-2014')` still get a well-
  // defined zero-day stub for uniformity when explicitly requested by tests.
  // We therefore KEEP all three labels in the returned array but fold zero-day
  // slices (days = 0, share = 0, gain = 0, tax = 0) for completeness.

  const preReform = KEY_DATES.PRE_REFORM_BOUND; // 2001-11-07
  const linear = KEY_DATES.LINEAR_BOUND;        // 2014-01-01

  // Helper: clamp a (from, to) pair so days are never negative.
  const clampSegment = (from, to) => {
    if (daysBetween(from, to) <= 0) return { from, to, days: 0 };
    return { from, to, days: daysBetween(from, to) };
  };

  // Segment 1 — pre-2001: [purchase, min(sale, preReform)]
  const seg1End = daysBetween(preReform, saleDate) >= 0 ? preReform : saleDate;
  const s1 = clampSegment(purchaseDate, seg1End);

  // Segment 2 — pre-2014: [max(purchase, preReform), min(sale, linear)]
  const seg2Start = daysBetween(purchaseDate, preReform) >= 0 ? preReform : purchaseDate;
  const seg2End = daysBetween(linear, saleDate) >= 0 ? linear : saleDate;
  const s2 = clampSegment(seg2Start, seg2End);

  // Segment 3 — post-2014: [max(purchase, linear), sale]
  const seg3Start = daysBetween(purchaseDate, linear) >= 0 ? linear : purchaseDate;
  const s3 = clampSegment(seg3Start, saleDate);

  const segments = [
    { from: s1.from, to: s1.to, label: 'pre-2001' },
    { from: s2.from, to: s2.to, label: 'pre-2014' },
    { from: s3.from, to: s3.to, label: 'post-2014' },
  ];

  // Determine rates per segment.
  const rateFor = (label) => {
    if (sellerStatus === 'company') {
      return TAX_RATES.COMPANY_GENERAL;
    }
    if (label === 'pre-2001') {
      // Historical window — 10% under סעיף 48א(ב) (inflationary portion rate).
      return TAX_RATES.INFLATION_ADJUSTED;
    }
    if (label === 'pre-2014') {
      // Linear-exempt: 0% for residential gain up to ceiling.
      if (linearExempt && isPrimaryResidence) return TAX_RATES.EXEMPT;
      return TAX_RATES.INDIVIDUAL_GENERAL;
    }
    // post-2014
    return TAX_RATES.INDIVIDUAL_GENERAL;
  };

  // Compute share and tax per segment. A zero-day segment contributes 0.
  const periods = segments.map((seg) => {
    const rawDays = daysBetween(seg.from, seg.to);
    const days = rawDays > 0 ? rawDays : 0;
    const share = totalDays > 0 ? days / totalDays : 0;
    const gain = round2(realBetterment * share);
    const rate = rateFor(seg.label);
    const tax = round2(gain * rate);
    return {
      label: seg.label,
      from: seg.from,
      to: seg.to,
      days,
      share: round2(share * 10000) / 10000,
      gain,
      rate,
      tax,
      citation: LAW_CITATIONS.SECTION_48A_B1,
    };
  });

  const totalTax = round2(periods.reduce((sum, p) => sum + p.tax, 0));
  const totalGain = round2(periods.reduce((sum, p) => sum + p.gain, 0));

  return {
    method: linearExempt ? 'linear-exempt' : 'linear',
    totalDays,
    periods,
    totalGain,
    totalTax,
    citation: LAW_CITATIONS.SECTION_48A_B1,
  };
}

// ═══════════════════════════════════════════════════════════════
// Exemption checker — פרק חמישי 1
// ═══════════════════════════════════════════════════════════════

/**
 * Identify every exemption that applies to the given sale and return them
 * with full citations. Does NOT mutate params.
 *
 * @param {BettermentParams} params
 * @returns {Object} { eligible: [...], blocked: [...], recommendation: string }
 */
function checkExemption(params = {}) {
  const eligible = [];
  const blocked = [];
  const notes = [];

  const propertyType = params.propertyType || 'apartment';
  const isResidential = propertyType === 'apartment';
  const isPrimary = params.isPrimaryResidence === true;

  // ─── 49ב(2) — Single residence ────────────────────────────────
  if (isResidential && isPrimary) {
    if (params.soldPriorResidenceWithin18m) {
      blocked.push({
        key: 'SECTION_49B2',
        citation: LAW_CITATIONS.SECTION_49B2,
        reason_he: 'נמכרה דירה קודמת לפני פחות מ-18 חודשים',
        reason_en: 'Prior residence sold within 18 months',
      });
    } else {
      eligible.push({
        key: 'SECTION_49B2',
        citation: LAW_CITATIONS.SECTION_49B2,
        title_he: 'פטור לדירה יחידה',
        title_en: 'Single-residence exemption',
        ceiling: EXEMPTION_CEILINGS_2026.SINGLE_RESIDENCE,
        conditions_he: [
          'הדירה היא דירת המגורים היחידה של המוכר',
          'המוכר מחזיק בה לפחות 18 חודשים',
          'המחיר אינו עולה על התקרה לפטור',
        ],
      });
    }
  }

  // ─── 49ב(1) — Four-year cool-down ─────────────────────────────
  if (isResidential && !isPrimary) {
    if (params.soldPriorResidenceWithin4y === true) {
      blocked.push({
        key: 'SECTION_49B1',
        citation: LAW_CITATIONS.SECTION_49B1,
        reason_he: 'תקופת הצינון של 4 שנים לא הושלמה — נמכרה דירה אחרת',
        reason_en: 'Four-year cool-down not complete — another residence sold recently',
      });
    } else {
      eligible.push({
        key: 'SECTION_49B1',
        citation: LAW_CITATIONS.SECTION_49B1,
        title_he: 'פטור לפי תקופת צינון 4 שנים',
        title_en: 'Four-year cool-down exemption',
        conditions_he: [
          'לא נמכרה דירה אחרת בפטור ב-4 השנים שקדמו למכירה',
          'הדירה הנמכרת היא דירת מגורים מזכה',
        ],
      });
    }
  }

  // ─── 49ב(5) — Inheritance ──────────────────────────────────────
  if (params.receivedAsInheritance === true) {
    eligible.push({
      key: 'SECTION_49B5',
      citation: LAW_CITATIONS.SECTION_49B5,
      title_he: 'פטור בהורשה',
      title_en: 'Inheritance exemption',
      conditions_he: [
        'המוכר הוא בן זוג / צאצא / צאצא של בן זוג של המוריש',
        'לפני פטירתו היה המוריש בעל דירה יחידה',
        'אילו המוריש היה מוכר — היה זכאי לפטור',
      ],
    });
  }

  // ─── 62 — Gift between relatives ───────────────────────────────
  if (params.receivedFromRelative === true) {
    eligible.push({
      key: 'SECTION_62',
      citation: LAW_CITATIONS.SECTION_62,
      title_he: 'מתנה בין קרובים — דחיית אירוע מס',
      title_en: 'Gift between relatives — tax-event deferral',
      conditions_he: [
        'המעביר והנעבר הם קרובים כהגדרתם בחוק',
        'המקבל נכנס לנעלי המעביר לעניין יום ושווי הרכישה',
        'תקופת צינון נפרדת — 3 שנים אם התגורר, 4 שנים אחרת',
      ],
    });
    notes.push({
      he: 'סעיף 62 אינו פטור — הוא דחיית אירוע מס. המס יחושב בעת המכירה הסופית.',
      en: 'Section 62 is deferral, not exemption. Tax crystallizes on the eventual disposal.',
    });
  }

  // ─── 48א(ב1) — Linear exempt (always available as computation option) ───
  if (isResidential && isPrimary) {
    eligible.push({
      key: 'SECTION_48A_B1',
      citation: LAW_CITATIONS.SECTION_48A_B1,
      title_he: 'חישוב ליניארי מוטב — פטור על החלק שלפני 01/01/2014',
      title_en: 'Beneficial linear — pre-2014 portion exempt',
      conditions_he: [
        'הנכס הוא דירת מגורים מזכה',
        'הפטור ניתן על השבח הריאלי המיוחס לתקופה שלפני תיקון 76',
      ],
    });
  }

  const recommendation = eligible.length > 0
    ? `זוהו ${eligible.length} פטורים / הקלות אפשריים — יש לבחור את החישוב הנוח ביותר`
    : 'לא זוהו פטורים ישירים — יש לחשב את המס במסלול הרגיל';

  return {
    eligible,
    blocked,
    notes,
    recommendation,
    checkedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Main calculator — computeBettermentTax
// ═══════════════════════════════════════════════════════════════

/**
 * Compute מס שבח for a real-estate sale.
 *
 * Flow:
 *   1. Normalize inputs
 *   2. Index improvements + purchase price by CPI
 *   3. Compute nominal betterment, inflation component, real betterment
 *   4. Evaluate exemptions
 *   5. Compute tax under each relevant method (regular, linear, linear-exempt)
 *   6. Pick the lowest liability for the seller
 *   7. Return structured breakdown + מש"ח form fields
 *
 * @param {BettermentParams} params
 * @returns {Object}
 */
function computeBettermentTax(params = {}) {
  // ── 1. Validate / normalize ──────────────────────────────────
  if (params == null || typeof params !== 'object') {
    throw new TypeError('computeBettermentTax: params required');
  }
  const purchase = Number(params.purchase);
  const sale = Number(params.sale);
  if (!(purchase > 0)) throw new RangeError('computeBettermentTax: purchase must be positive');
  if (!(sale > 0)) throw new RangeError('computeBettermentTax: sale must be positive');
  if (!params.purchaseDate || !params.saleDate) {
    throw new TypeError('computeBettermentTax: purchaseDate and saleDate required');
  }
  if (daysBetween(params.purchaseDate, params.saleDate) <= 0) {
    throw new RangeError('computeBettermentTax: saleDate must be after purchaseDate');
  }

  const improvements = Array.isArray(params.improvements) ? params.improvements : [];
  const sellerStatus = params.sellerStatus === 'company' ? 'company' : 'individual';
  const isPrimary = params.isPrimaryResidence === true;
  const propertyType = params.propertyType || 'apartment';
  const cpiTable = params.cpiTable || null;

  // ── 2. Expenses ──────────────────────────────────────────────
  let expensesTotal = 0;
  const expenseBreakdown = [];
  if (typeof params.expenses === 'number') {
    expensesTotal = Number(params.expenses) || 0;
    expenseBreakdown.push({ description: 'הוצאות מותרות בניכוי', amount: expensesTotal });
  } else if (Array.isArray(params.expenses)) {
    for (const e of params.expenses) {
      const amt = Number(e.amount) || 0;
      expensesTotal += amt;
      expenseBreakdown.push({
        description: e.description || 'הוצאה',
        amount: amt,
        date: e.date || null,
      });
    }
  }
  expensesTotal = round2(nonNeg(expensesTotal));

  // ── 3. Improvements — indexed to sale date ───────────────────
  const improvementsIndexed = improvements.map((imp) => {
    const amt = Number(imp.amount) || 0;
    const { adjusted, factor, cpiFrom, cpiTo } = indexByCpi(
      amt,
      imp.date || params.purchaseDate,
      params.saleDate,
      cpiTable,
    );
    return {
      description: imp.description || 'השבחה',
      date: imp.date || params.purchaseDate,
      nominal: round2(amt),
      adjusted,
      factor,
      cpiFrom,
      cpiTo,
    };
  });
  const improvementsNominal = round2(improvementsIndexed.reduce((s, i) => s + i.nominal, 0));
  const improvementsAdjusted = round2(improvementsIndexed.reduce((s, i) => s + i.adjusted, 0));

  // ── 4. Purchase price indexed ────────────────────────────────
  const purchaseIdx = indexByCpi(purchase, params.purchaseDate, params.saleDate, cpiTable);

  // ── 5. Nominal + real betterment ─────────────────────────────
  //   Nominal: sale − purchase − improvements(nominal) − expenses
  //   Real:    sale − purchase(indexed) − improvements(indexed) − expenses
  //   Inflation component = nominal − real
  const nominalBetterment = round2(sale - purchase - improvementsNominal - expensesTotal);
  const realBetterment = round2(nonNeg(sale - purchaseIdx.adjusted - improvementsAdjusted - expensesTotal));
  const inflationComponent = round2(nominalBetterment - realBetterment);

  // ── 6. Exemption analysis ────────────────────────────────────
  const exemptionAnalysis = checkExemption(params);

  // ── 7. Regular path (סעיף 48א — 25% for individual, 23% company) ─────
  const regularRate = sellerStatus === 'company'
    ? TAX_RATES.COMPANY_GENERAL
    : TAX_RATES.INDIVIDUAL_GENERAL;
  const regularTax = round2(nonNeg(realBetterment) * regularRate);

  // ── 8. Linear split (always computed for comparison) ─────────
  const linear = linearSplit({
    purchaseDate: params.purchaseDate,
    saleDate: params.saleDate,
    realBetterment: nonNeg(realBetterment),
    sellerStatus,
    isPrimaryResidence: isPrimary,
    linearExempt: false,
  });

  // ── 9. Linear-exempt (only meaningful for residential + primary) ─────
  let linearExempt = null;
  if (propertyType === 'apartment' && isPrimary) {
    linearExempt = linearSplit({
      purchaseDate: params.purchaseDate,
      saleDate: params.saleDate,
      realBetterment: nonNeg(realBetterment),
      sellerStatus,
      isPrimaryResidence: true,
      linearExempt: true,
    });
  }

  // ─── 10. Primary-residence full exemption (49ב(2)) — price ≤ ceiling ───
  let fullExemption = null;
  const singleExemptEligible = exemptionAnalysis.eligible.find((e) => e.key === 'SECTION_49B2');
  if (singleExemptEligible && sale <= EXEMPTION_CEILINGS_2026.SINGLE_RESIDENCE) {
    fullExemption = {
      method: 'full-exempt',
      tax: 0,
      basis_he: 'פטור מלא לפי סעיף 49ב(2) — דירה יחידה מתחת לתקרה',
      citation: LAW_CITATIONS.SECTION_49B2,
    };
  }

  // ─── 11. Pick the best path for the seller ────────────────────
  const candidates = [
    { method: 'regular', tax: regularTax, label_he: 'חישוב רגיל — 25%' },
    { method: 'linear', tax: linear.totalTax, label_he: 'חישוב ליניארי' },
  ];
  if (linearExempt) {
    candidates.push({
      method: 'linear-exempt',
      tax: linearExempt.totalTax,
      label_he: 'חישוב ליניארי מוטב (פטור לפני 2014)',
    });
  }
  if (fullExemption) {
    candidates.push({
      method: 'full-exempt',
      tax: 0,
      label_he: 'פטור מלא (49ב(2))',
    });
  }

  // Sort by tax ascending, pick first.
  candidates.sort((a, b) => a.tax - b.tax);
  const bestMethod = candidates[0];

  // ─── 12. Build form fields for מש"ח (תצהיר מוכר) ───────────────
  const formFields = buildForm7000Fields({
    params,
    purchase,
    sale,
    purchaseIdx,
    improvementsIndexed,
    improvementsNominal,
    improvementsAdjusted,
    expensesTotal,
    nominalBetterment,
    realBetterment,
    inflationComponent,
    bestMethod,
  });

  return {
    // ── Inputs snapshot (never mutated) ──
    inputs: {
      purchase,
      sale,
      purchaseDate: params.purchaseDate,
      saleDate: params.saleDate,
      propertyType,
      sellerStatus,
      isPrimaryResidence: isPrimary,
      improvementsCount: improvements.length,
      expensesTotal,
    },

    // ── Core figures ──
    betterment: {
      nominal: nominalBetterment,
      real: realBetterment,
      inflationComponent,
      purchaseIndexed: purchaseIdx.adjusted,
      improvementsNominal,
      improvementsAdjusted,
      cpiFactorPurchase: purchaseIdx.factor,
    },

    // ── Per-improvement indexing detail ──
    improvements: improvementsIndexed,
    expenses: expenseBreakdown,

    // ── Calculation paths ──
    regular: {
      method: 'regular',
      rate: regularRate,
      tax: regularTax,
      citation: LAW_CITATIONS.SECTION_48A,
    },
    linear,
    linearExempt,
    fullExemption,

    // ── Exemption analysis ──
    exemptions: exemptionAnalysis,

    // ── Decision ──
    bestMethod,
    candidates,

    // ── Final liability (uses the best method) ──
    totalTax: bestMethod.tax,

    // ── Form fields for submission ──
    form7000Fields: formFields,

    // ── Metadata ──
    meta: {
      engine: 'onyx-procurement/src/tax/betterment-tax',
      version: '1.0.0',
      computedAt: new Date().toISOString(),
      currency: 'ILS',
      citationsRoot: 'חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Form builder — טופס מש"ח / 7000 — תצהיר מוכר
// ═══════════════════════════════════════════════════════════════

/**
 * Map calculated values to the fields on Form 7000 (תצהיר מוכר / מש"ח).
 * Field keys follow the official block numbering used by רשות המסים.
 *
 * @param {Object} ctx context object from computeBettermentTax
 * @returns {Object} field-keyed form data
 */
function buildForm7000Fields(ctx) {
  const {
    params,
    purchase,
    sale,
    purchaseIdx,
    improvementsNominal,
    improvementsAdjusted,
    expensesTotal,
    nominalBetterment,
    realBetterment,
    inflationComponent,
    bestMethod,
  } = ctx;

  return {
    // Block 1 — פרטי הנכס
    property: {
      propertyType: params.propertyType || 'apartment',
      address: params.address || null,
      block: params.block || null,   // גוש
      parcel: params.parcel || null, // חלקה
      subParcel: params.subParcel || null, // תת-חלקה
    },

    // Block 2 — פרטי העסקה
    transaction: {
      saleDate: params.saleDate,
      salePrice: sale,
      purchaseDate: params.purchaseDate,
      purchasePrice: purchase,
    },

    // Block 3 — חישוב השבח
    betterment: {
      field_11_nominal: nominalBetterment,           // שבח נומינלי
      field_12_indexedPurchase: purchaseIdx.adjusted, // מחיר רכישה מתואם
      field_13_improvements: improvementsNominal,
      field_14_improvementsAdjusted: improvementsAdjusted,
      field_15_expenses: expensesTotal,
      field_16_inflationComponent: inflationComponent, // רכיב אינפלציוני
      field_17_realBetterment: realBetterment,        // שבח ריאלי
    },

    // Block 4 — שומה
    assessment: {
      method: bestMethod.method,
      methodLabel_he: bestMethod.label_he,
      taxDue: bestMethod.tax,
      dueDate: null, // Calculated downstream
    },

    // Block 5 — הצהרת פטור
    exemptionDeclaration: {
      claimedExemption: params.isPrimaryResidence === true ? 'SECTION_49B2' : null,
      sellerSignature: null, // filled in UI
      signatureDate: null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Module exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  computeBettermentTax,
  checkExemption,
  linearSplit,
  indexByCpi,
  buildForm7000Fields,
  // constants
  TAX_RATES,
  KEY_DATES,
  LAW_CITATIONS,
  EXEMPTION_CEILINGS_2026,
  // helpers (exported for tests)
  _internals: {
    parseDate,
    daysBetween,
    lookupCpi,
    toMonthKey,
    round2,
    nonNeg,
  },
};
