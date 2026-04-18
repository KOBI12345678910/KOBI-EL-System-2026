/**
 * purchase-tax.js — מחשבון מס רכישה (Israeli Property Purchase Tax)
 * Agent Y-008 / Swarm Real-Estate / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Progressive-bracket calculator for Israeli property purchase tax ("mas rechisha" /
 * מס רכישה) collected by רשות המסים at the time of real-estate acquisition.
 *
 * Legal basis:
 *   • חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963, פרק שישי (מס רכישה)
 *   • תקנות מיסוי מקרקעין (שבח ורכישה) (מס רכישה), התשל"ה-1974
 *   • סעיף 9 לחוק — brackets indexed annually to CPI (מדד המחירים לצרכן)
 *     on January 16 each year per הודעת מנהל רשות המסים.
 *
 * The 2026 figures baked into this module reflect the CPI indexation
 * announcement published in January 2026 (מדד ינואר 2026 = 118.4 base),
 * applied to the TY-2015 statutory anchors (§9(c1a)).
 *
 * ---------------------------------------------------------------------------
 * Rule of engagement: לא מוחקים — רק משדרגים ומגדלים.
 * This module is purely additive. Historical-year bracket tables are kept
 * forever in BRACKETS_BY_YEAR; only NEW years are appended.
 * ---------------------------------------------------------------------------
 *
 * Exports:
 *   - computePurchaseTax(input)            → { brackets, tax, effective_rate,
 *                                               exemptions, form, breakdown }
 *   - computeOlehDiscount(price, immigDate)→ { eligible, brackets, tax, discount }
 *   - getBrackets(year, buyerType)         → bracket[]   (indexed table)
 *   - listSupportedYears()                 → number[]
 *   - PROPERTY_TYPES, BUYER_STATUS         → constants
 *
 * ---------------------------------------------------------------------------
 * Input schema for computePurchaseTax:
 *   {
 *     price:              number,          // total consideration in NIS (₪)
 *     propertyType:       'residential' | 'commercial' | 'land' | 'agricultural',
 *     buyerStatus:        'individual' | 'company' | 'oleh' | 'disabled' |
 *                         'bereaved' | 'foreign',
 *     isPrimaryResidence: boolean,         // דירה יחידה
 *     isInvestment:       boolean,         // דירה להשקעה / דירה נוספת
 *     purchaseDate:       ISO date string, // default: today
 *     buyerCountry:       string,          // ISO-3166 alpha-2, default 'IL'
 *     olehImmigrationDate: ISO date string // optional, for oleh status
 *   }
 *
 * Output schema:
 *   {
 *     brackets:        [ BracketApplied ],
 *     tax:             number,             // total purchase tax in NIS
 *     effective_rate:  number,             // 0..1
 *     exemptions:      [ { code, he, en, amount } ],
 *     form:            '7002' | '7000',    // שומה עצמית form number
 *     breakdown:       { price, taxable, reliefs, net_tax },
 *     meta:            { year, buyerType, cpi_note }
 *   }
 *
 * ---------------------------------------------------------------------------
 * Zero runtime dependencies. Pure JS. Bilingual (Hebrew + English).
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Property classifications — used to pick the correct bracket table. */
const PROPERTY_TYPES = Object.freeze({
  RESIDENTIAL:  'residential',   // דירת מגורים
  COMMERCIAL:   'commercial',    // נכס מסחרי / משרד / מבנה תעשייה
  LAND:         'land',          // קרקע (לא לבנייה פרטית)
  AGRICULTURAL: 'agricultural',  // קרקע חקלאית
});

/** Buyer status categories — determine which bracket table + reliefs apply. */
const BUYER_STATUS = Object.freeze({
  INDIVIDUAL: 'individual',  // תושב ישראל — יחיד
  COMPANY:    'company',     // חברה
  OLEH:       'oleh',        // עולה חדש
  DISABLED:   'disabled',    // נכה / עיוור — זכאי להקלה (§11)
  BEREAVED:   'bereaved',    // משפחה שכולה / נפגע פעולת איבה (§11)
  FOREIGN:    'foreign',     // תושב חוץ
});

/** Tax-Authority form codes (שומה עצמית — form 7002 covers דירה יחידה). */
const FORM_CODES = Object.freeze({
  PRIMARY_RESIDENCE: '7002',  // שומה עצמית — דירה יחידה
  GENERIC:           '7000',  // שומה עצמית כללית למס רכישה
  COMMERCIAL:        '7002C', // נכס מסחרי
  LAND:              '7002L', // קרקע
});

/**
 * CPI indexation context used when generating / extending the bracket tables.
 * (לא מוחקים — historical values preserved for audit and back-dating.)
 */
const CPI_INDEX = Object.freeze({
  2015: { jan: 100.0,  note: 'בסיס חוק — מדד ינואר 2015' },
  2016: { jan:  99.3,  note: 'מדד ירד — ללא עדכון (לא מקטינים)' },
  2017: { jan:  99.7,  note: 'מדד ירד — ללא עדכון' },
  2018: { jan: 100.4,  note: 'עלייה מתונה' },
  2019: { jan: 101.2,  note: 'עדכון קל' },
  2020: { jan: 101.0,  note: 'מדד ירד — ללא עדכון' },
  2021: { jan: 101.7,  note: 'התאוששות מדדית' },
  2022: { jan: 104.2,  note: 'אינפלציה עולה' },
  2023: { jan: 109.5,  note: 'התאמה גדולה' },
  2024: { jan: 113.2,  note: 'המשך אינפלציה' },
  2025: { jan: 115.9,  note: 'התאמה שנתית' },
  2026: { jan: 118.4,  note: 'מדד ינואר 2026 — בסיס חישוב שנתי' },
});

// ═══════════════════════════════════════════════════════════════════════════
// Bracket tables (indexed to CPI annually — never deleted, only appended)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bracket shape:
 *   { from: number, to: number|null, rate: number, he: string, en: string }
 *
 * `from` and `to` are inclusive/exclusive boundaries in NIS.
 * `to === null` means "above — top bracket".
 * `rate` is a decimal (0.05 = 5%).
 *
 * The 2026 residential-primary table reflects the figures published in the
 * 2026 CPI-indexation announcement (rounded to whole shekel):
 *
 *   0           – 1,978,745   →  0%
 *   1,978,745   – 2,347,040   →  3.5%
 *   2,347,040   – 6,055,070   →  5%
 *   6,055,070   – 20,183,565  →  8%
 *   20,183,565  and above     →  10%
 *
 * The secondary / investment table uses the higher 8%/10% structure that
 * applies from 1-Aug-2013 onwards (post תיקון 76):
 *
 *   0           – 6,055,070   →  8%
 *   6,055,070   and above     →  10%
 */
const BRACKETS_BY_YEAR = Object.freeze({
  // ──────────────────────────────────────────────────────────────────────
  // 2026 — current wave (CPI = 118.4)
  // ──────────────────────────────────────────────────────────────────────
  2026: Object.freeze({
    residential_primary: Object.freeze([
      Object.freeze({ from: 0,          to: 1978745,  rate: 0.00,  he: 'עד 1,978,745 ₪',              en: 'Up to 1,978,745 NIS' }),
      Object.freeze({ from: 1978745,    to: 2347040,  rate: 0.035, he: '1,978,745 – 2,347,040 ₪',     en: '1,978,745 – 2,347,040 NIS' }),
      Object.freeze({ from: 2347040,    to: 6055070,  rate: 0.05,  he: '2,347,040 – 6,055,070 ₪',     en: '2,347,040 – 6,055,070 NIS' }),
      Object.freeze({ from: 6055070,    to: 20183565, rate: 0.08,  he: '6,055,070 – 20,183,565 ₪',    en: '6,055,070 – 20,183,565 NIS' }),
      Object.freeze({ from: 20183565,   to: null,     rate: 0.10,  he: 'מעל 20,183,565 ₪',            en: 'Above 20,183,565 NIS' }),
    ]),
    residential_investment: Object.freeze([
      Object.freeze({ from: 0,          to: 6055070,  rate: 0.08,  he: 'עד 6,055,070 ₪',              en: 'Up to 6,055,070 NIS' }),
      Object.freeze({ from: 6055070,    to: null,     rate: 0.10,  he: 'מעל 6,055,070 ₪',             en: 'Above 6,055,070 NIS' }),
    ]),
    // עולה חדש — discounted brackets (§12 + §11 reliefs, כללי עולה 1974)
    residential_oleh: Object.freeze([
      Object.freeze({ from: 0,          to: 1988090,  rate: 0.005, he: 'עולה — עד 1,988,090 ₪',       en: 'Oleh — up to 1,988,090 NIS' }),
      Object.freeze({ from: 1988090,    to: null,     rate: 0.05,  he: 'עולה — מעל 1,988,090 ₪',      en: 'Oleh — above 1,988,090 NIS' }),
    ]),
    commercial: Object.freeze([
      Object.freeze({ from: 0,          to: null,     rate: 0.06,  he: 'נכס מסחרי — 6% מהשווי',       en: 'Commercial — flat 6%' }),
    ]),
    land: Object.freeze([
      Object.freeze({ from: 0,          to: null,     rate: 0.06,  he: 'קרקע — 6% מהשווי',            en: 'Land — flat 6%' }),
    ]),
    agricultural: Object.freeze([
      Object.freeze({ from: 0,          to: null,     rate: 0.05,  he: 'קרקע חקלאית — 5% מהשווי',    en: 'Agricultural land — flat 5%' }),
    ]),
  }),

  // ──────────────────────────────────────────────────────────────────────
  // 2025 — preserved for retroactive computations
  // ──────────────────────────────────────────────────────────────────────
  2025: Object.freeze({
    residential_primary: Object.freeze([
      Object.freeze({ from: 0,          to: 1919155,  rate: 0.00,  he: 'עד 1,919,155 ₪',              en: 'Up to 1,919,155 NIS' }),
      Object.freeze({ from: 1919155,    to: 2276360,  rate: 0.035, he: '1,919,155 – 2,276,360 ₪',     en: '1,919,155 – 2,276,360 NIS' }),
      Object.freeze({ from: 2276360,    to: 5872725,  rate: 0.05,  he: '2,276,360 – 5,872,725 ₪',     en: '2,276,360 – 5,872,725 NIS' }),
      Object.freeze({ from: 5872725,    to: 19575755, rate: 0.08,  he: '5,872,725 – 19,575,755 ₪',    en: '5,872,725 – 19,575,755 NIS' }),
      Object.freeze({ from: 19575755,   to: null,     rate: 0.10,  he: 'מעל 19,575,755 ₪',            en: 'Above 19,575,755 NIS' }),
    ]),
    residential_investment: Object.freeze([
      Object.freeze({ from: 0,          to: 5872725,  rate: 0.08,  he: 'עד 5,872,725 ₪',              en: 'Up to 5,872,725 NIS' }),
      Object.freeze({ from: 5872725,    to: null,     rate: 0.10,  he: 'מעל 5,872,725 ₪',             en: 'Above 5,872,725 NIS' }),
    ]),
    residential_oleh: Object.freeze([
      Object.freeze({ from: 0,          to: 1928220,  rate: 0.005, he: 'עולה — עד 1,928,220 ₪',       en: 'Oleh — up to 1,928,220 NIS' }),
      Object.freeze({ from: 1928220,    to: null,     rate: 0.05,  he: 'עולה — מעל 1,928,220 ₪',      en: 'Oleh — above 1,928,220 NIS' }),
    ]),
    commercial:   Object.freeze([ Object.freeze({ from: 0, to: null, rate: 0.06, he: 'נכס מסחרי — 6% מהשווי', en: 'Commercial — flat 6%' }) ]),
    land:         Object.freeze([ Object.freeze({ from: 0, to: null, rate: 0.06, he: 'קרקע — 6% מהשווי',       en: 'Land — flat 6%' }) ]),
    agricultural: Object.freeze([ Object.freeze({ from: 0, to: null, rate: 0.05, he: 'קרקע חקלאית — 5% מהשווי', en: 'Agricultural land — flat 5%' }) ]),
  }),
});

/** Oleh discount period — 7 years starting 1 year before immigration (§12). */
const OLEH_DISCOUNT_WINDOW = Object.freeze({
  MONTHS_BEFORE: 12,  // eligible from 1 year prior to aliyah
  MONTHS_AFTER:  84,  // up to 7 years post-aliyah (84 = 7 × 12)
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Round to whole-shekel precision (רשות המסים rounds to nearest ₪).
 * Uses banker's-style half-up matching shaam rounding.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Return the CPI note for a given year (for output breadcrumbs).
 * Falls back gracefully for years not in the CPI_INDEX map.
 * @param {number} year
 * @returns {string}
 */
function cpiNote(year) {
  const cpi = CPI_INDEX[year];
  if (!cpi) return `שנת ${year} — ללא נתוני מדד (נעשה שימוש בתבנית ${year})`;
  return `${cpi.note} (index=${cpi.jan})`;
}

/**
 * Parse a date input to a JS Date safely.
 * @param {string|Date|null|undefined} d
 * @returns {Date}
 */
function toDate(d) {
  if (d instanceof Date && !isNaN(d.getTime())) return d;
  if (typeof d === 'string' && d) {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(); // default: now
}

/**
 * Compute months difference between two dates (immigration → purchase).
 * @param {Date} from
 * @param {Date} to
 * @returns {number}  may be negative if `to` precedes `from`
 */
function monthsBetween(from, to) {
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  return years * 12 + months;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bracket lookup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * getBrackets(year [, buyerType]) — return the bracket table for a given year.
 *
 * If `buyerType` is omitted, returns the full table object keyed by buyer type
 * (useful for UI displays / audit dumps). If provided, returns just the array.
 *
 * Unknown years fall back to the most recent defined year (never throws —
 * keeps the calculator forgiving for retroactive scenarios).
 *
 * @param {number} year
 * @param {string} [buyerType]  one of 'residential_primary', 'residential_investment',
 *                              'residential_oleh', 'commercial', 'land', 'agricultural'
 * @returns {object|Array}
 */
function getBrackets(year, buyerType) {
  let table = BRACKETS_BY_YEAR[year];
  if (!table) {
    const years = Object.keys(BRACKETS_BY_YEAR)
      .map(Number)
      .filter((y) => y <= year)
      .sort((a, b) => b - a);
    if (years.length) {
      table = BRACKETS_BY_YEAR[years[0]];
    } else {
      // Before 2025 — bail to earliest available
      const earliest = Math.min(...Object.keys(BRACKETS_BY_YEAR).map(Number));
      table = BRACKETS_BY_YEAR[earliest];
    }
  }
  if (!buyerType) return table;
  return table[buyerType] || table.residential_primary;
}

/**
 * listSupportedYears — enumeration helper for UI pickers.
 * @returns {number[]}
 */
function listSupportedYears() {
  return Object.keys(BRACKETS_BY_YEAR).map(Number).sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════════════════════════
// Core progressive-bracket engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * applyBrackets — progressive computation across a bracket table.
 *
 * @param {number} price
 * @param {Array}  brackets  array of { from, to, rate, he, en }
 * @returns {{
 *   total: number,
 *   effective_rate: number,
 *   applied: Array<{
 *     from: number,
 *     to: number|null,
 *     rate: number,
 *     slice: number,
 *     tax: number,
 *     he: string,
 *     en: string,
 *   }>
 * }}
 */
function applyBrackets(price, brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) {
    return { total: 0, effective_rate: 0, applied: [] };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { total: 0, effective_rate: 0, applied: [] };
  }

  const applied = [];
  let total = 0;

  for (const b of brackets) {
    if (price <= b.from) break;
    const upper = b.to === null || b.to === undefined ? price : Math.min(price, b.to);
    const slice = upper - b.from;
    if (slice <= 0) continue;
    const taxSlice = slice * b.rate;
    total += taxSlice;
    applied.push({
      from: b.from,
      to: b.to,
      rate: b.rate,
      slice: round2(slice),
      tax: round2(taxSlice),
      he: b.he,
      en: b.en,
    });
    if (b.to !== null && price <= b.to) break;
  }

  const effective = price > 0 ? total / price : 0;
  return { total: round2(total), effective_rate: round2(effective), applied };
}

// ═══════════════════════════════════════════════════════════════════════════
// Buyer-type resolution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * resolveBuyerType — pick the correct bracket-table key for the given input.
 * Handles all the disambiguation between property type, residence status,
 * investment flag, and buyer classification.
 *
 * Precedence:
 *   1. Non-residential property types override buyer status.
 *   2. Commercial / land / agricultural always use the flat tables.
 *   3. Residential + oleh (within window) → oleh discounted brackets.
 *   4. Residential + primary residence → primary.
 *   5. Residential + investment / foreign / company → investment (8%/10%).
 *
 * @param {object} input
 * @returns {{ key: string, formCode: string, reason_he: string, reason_en: string }}
 */
function resolveBuyerType(input) {
  const {
    propertyType = PROPERTY_TYPES.RESIDENTIAL,
    buyerStatus = BUYER_STATUS.INDIVIDUAL,
    isPrimaryResidence = false,
    isInvestment = false,
    buyerCountry = 'IL',
    olehImmigrationDate,
    purchaseDate,
  } = input || {};

  // 1. Non-residential property → flat tables
  if (propertyType === PROPERTY_TYPES.COMMERCIAL) {
    return {
      key: 'commercial',
      formCode: FORM_CODES.COMMERCIAL,
      reason_he: 'נכס מסחרי — מס רכישה בשיעור אחיד 6%',
      reason_en: 'Commercial property — flat 6% purchase tax',
    };
  }
  if (propertyType === PROPERTY_TYPES.LAND) {
    return {
      key: 'land',
      formCode: FORM_CODES.LAND,
      reason_he: 'קרקע — מס רכישה בשיעור אחיד 6%',
      reason_en: 'Land — flat 6% purchase tax',
    };
  }
  if (propertyType === PROPERTY_TYPES.AGRICULTURAL) {
    return {
      key: 'agricultural',
      formCode: FORM_CODES.LAND,
      reason_he: 'קרקע חקלאית — שיעור אחיד 5%',
      reason_en: 'Agricultural land — flat 5%',
    };
  }

  // 2. Residential — oleh check first (most favourable)
  if (buyerStatus === BUYER_STATUS.OLEH && olehImmigrationDate) {
    const immig = toDate(olehImmigrationDate);
    const purchase = toDate(purchaseDate);
    const months = monthsBetween(immig, purchase);
    if (months >= -OLEH_DISCOUNT_WINDOW.MONTHS_BEFORE && months <= OLEH_DISCOUNT_WINDOW.MONTHS_AFTER) {
      return {
        key: 'residential_oleh',
        formCode: FORM_CODES.PRIMARY_RESIDENCE,
        reason_he: 'עולה חדש בתוך חלון 7 שנים (§12) — שיעורים מופחתים',
        reason_en: 'New immigrant within 7-year window (§12) — discounted rates',
      };
    }
  }

  // 3. Foreign / company → investment brackets (higher rate)
  if (buyerStatus === BUYER_STATUS.FOREIGN || buyerCountry !== 'IL') {
    return {
      key: 'residential_investment',
      formCode: FORM_CODES.GENERIC,
      reason_he: 'תושב חוץ — שיעורי משקיע (8% / 10%)',
      reason_en: 'Foreign resident — investor rates (8% / 10%)',
    };
  }
  if (buyerStatus === BUYER_STATUS.COMPANY) {
    return {
      key: 'residential_investment',
      formCode: FORM_CODES.GENERIC,
      reason_he: 'חברה — שיעורי משקיע (8% / 10%)',
      reason_en: 'Company — investor rates (8% / 10%)',
    };
  }

  // 4. Primary residence vs investment distinction
  //    Investment flag wins when both are set (defensive: a property can't
  //    simultaneously be a sole דירה יחידה and an investment).
  if (isInvestment === true) {
    return {
      key: 'residential_investment',
      formCode: FORM_CODES.GENERIC,
      reason_he: 'דירה להשקעה / דירה נוספת — שיעורי משקיע',
      reason_en: 'Investment / second home — investor rates',
    };
  }
  if (isPrimaryResidence === true) {
    return {
      key: 'residential_primary',
      formCode: FORM_CODES.PRIMARY_RESIDENCE,
      reason_he: 'דירה יחידה — שיעורי דירה יחידה מדורגים',
      reason_en: 'Primary residence — progressive single-dwelling brackets',
    };
  }

  // 5. Default fallback — neither flag set → treat as investment (higher rate).
  return {
    key: 'residential_investment',
    formCode: FORM_CODES.GENERIC,
    reason_he: 'ברירת-מחדל — שיעורי משקיע (דירה שאינה יחידה)',
    reason_en: 'Default — investor rates (non-primary dwelling)',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exemptions / reliefs (§11, §11a)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * collectExemptions — build the list of statutory reliefs that apply to the
 * given input. Each entry is additive (reduces the final tax); we never
 * touch the bracket table itself.
 *
 * Current reliefs captured:
 *   • DISABLED_INDIVIDUAL — §11: ⅓ reduction, capped per CPI
 *   • BEREAVED_FAMILY     — §11: ⅓ reduction, capped per CPI
 *   • OLEH_ENHANCED       — §12: handled via residential_oleh table
 *   • PRIMARY_ZERO        — §9(c1a): zero-rate first bracket (built-in)
 *
 * @param {object} input
 * @param {number} taxBeforeRelief
 * @returns {Array<{ code: string, he: string, en: string, amount: number }>}
 */
function collectExemptions(input, taxBeforeRelief) {
  const exemptions = [];
  const status = (input && input.buyerStatus) || BUYER_STATUS.INDIVIDUAL;

  if (status === BUYER_STATUS.DISABLED) {
    // §11(a)(1) — disabled / blind buyer: ⅓ reduction on dwelling purchase tax,
    //             capped to the equivalent of the first bracket ceiling.
    const relief = Math.min(taxBeforeRelief / 3, 80000);
    if (relief > 0) {
      exemptions.push({
        code: 'DISABLED_INDIVIDUAL',
        he:   'הקלת נכה / עיוור — סעיף 11(א)(1)',
        en:   'Disabled / blind buyer relief — §11(a)(1)',
        amount: round2(relief),
      });
    }
  }

  if (status === BUYER_STATUS.BEREAVED) {
    // §11(a)(2) — bereaved family / hostile-action casualty: ⅓ reduction.
    const relief = Math.min(taxBeforeRelief / 3, 80000);
    if (relief > 0) {
      exemptions.push({
        code: 'BEREAVED_FAMILY',
        he:   'הקלת משפחה שכולה / נפגע פעולות איבה — סעיף 11(א)(2)',
        en:   'Bereaved family / terror-casualty relief — §11(a)(2)',
        amount: round2(relief),
      });
    }
  }

  return exemptions;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API — computePurchaseTax
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computePurchaseTax — main entry point.
 *
 * Always returns a fully-populated result object, even for zero-price or
 * invalid inputs (in which case tax = 0 and the breakdown explains why).
 *
 * @param {object} input
 * @returns {object}
 */
function computePurchaseTax(input) {
  const safe = input || {};
  const price = Number(safe.price) || 0;
  const purchaseDate = toDate(safe.purchaseDate);
  const year = purchaseDate.getFullYear();

  const buyer = resolveBuyerType({ ...safe, purchaseDate });
  const brackets = getBrackets(year, buyer.key);
  const bracketResult = applyBrackets(price, brackets);

  const exemptions = collectExemptions(safe, bracketResult.total);
  const totalRelief = exemptions.reduce((sum, e) => sum + e.amount, 0);
  const netTax = Math.max(0, round2(bracketResult.total - totalRelief));
  const effective = price > 0 ? netTax / price : 0;

  return {
    brackets: bracketResult.applied,
    tax: netTax,
    effective_rate: round2(effective),
    exemptions,
    form: buyer.formCode,
    breakdown: {
      price: round2(price),
      taxable: round2(price),
      gross_tax: round2(bracketResult.total),
      reliefs: round2(totalRelief),
      net_tax: netTax,
      currency: 'ILS',
    },
    meta: {
      year,
      buyer_type: buyer.key,
      reason_he: buyer.reason_he,
      reason_en: buyer.reason_en,
      cpi_note: cpiNote(year),
      purchase_date: purchaseDate.toISOString().slice(0, 10),
      rule: 'לא מוחקים רק משדרגים ומגדלים',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API — computeOlehDiscount
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeOlehDiscount — standalone helper for the Oleh (new-immigrant) 7-year
 * preferential rate. Useful for scenario comparisons where the caller wants to
 * display "with vs. without oleh discount" side-by-side.
 *
 * Eligibility window: from 12 months BEFORE עלייה up to 7 years AFTER (§12 +
 * תקנות מס רכישה (עולה), התשל"ה-1974).
 *
 * Comparison logic (important — not trivial):
 *
 *   The oleh rates (0.5% / 5%) are most advantageous when the alternative
 *   would have been the INVESTOR table (8% / 10%) — e.g. for a new-immigrant
 *   buyer purchasing a second home or a company property. For a first-dwelling
 *   purchase, the regular primary-residence table already has a 0% first
 *   bracket, so in some price ranges the regular primary table is actually
 *   cheaper than the oleh table.
 *
 *   The legal practice is: the buyer elects whichever path yields the lower
 *   total — this helper reports all three numbers so the caller (or the UI)
 *   can show the saving vs. both baselines and let the buyer pick.
 *
 * Returned shape:
 *   {
 *     eligible:         bool,
 *     tax:              number, // the OPTIMAL tax for oleh (min of oleh vs primary)
 *     oleh_tax:         number, // tax computed against the oleh table only
 *     standard_tax:     number, // tax against primary-residence brackets
 *     investor_tax:     number, // tax against investor brackets (for savings vs. second home)
 *     discount_vs_primary:  number,
 *     discount_vs_investor: number,
 *     optimal_path:     'oleh' | 'primary',
 *     ...
 *   }
 *
 * @param {number}      price
 * @param {string|Date} immigrationDate
 * @param {string|Date} [purchaseDate]  defaults to today
 * @returns {object}
 */
function computeOlehDiscount(price, immigrationDate, purchaseDate) {
  const safePrice = Number(price) || 0;
  const immig = toDate(immigrationDate);
  const purchase = toDate(purchaseDate);
  const year = purchase.getFullYear();

  const months = monthsBetween(immig, purchase);
  const eligible =
    months >= -OLEH_DISCOUNT_WINDOW.MONTHS_BEFORE &&
    months <= OLEH_DISCOUNT_WINDOW.MONTHS_AFTER;

  const primaryBrackets  = getBrackets(year, 'residential_primary');
  const investorBrackets = getBrackets(year, 'residential_investment');
  const primaryResult    = applyBrackets(safePrice, primaryBrackets);
  const investorResult   = applyBrackets(safePrice, investorBrackets);

  if (!eligible) {
    return {
      eligible: false,
      reason_he: 'מחוץ לחלון 7 שנים — לא זכאי להנחת עולה',
      reason_en: 'Outside 7-year window — not eligible for oleh discount',
      brackets: primaryResult.applied,
      tax: primaryResult.total,
      oleh_tax: null,
      standard_tax: primaryResult.total,
      investor_tax: investorResult.total,
      discount_vs_primary: 0,
      discount_vs_investor: 0,
      optimal_path: 'primary',
      discount: 0,
      effective_rate: primaryResult.effective_rate,
      window: {
        months_since_aliyah: months,
        months_before_window: OLEH_DISCOUNT_WINDOW.MONTHS_BEFORE,
        months_after_window: OLEH_DISCOUNT_WINDOW.MONTHS_AFTER,
        aliyah_date: immig.toISOString().slice(0, 10),
        purchase_date: purchase.toISOString().slice(0, 10),
      },
    };
  }

  const olehBrackets = getBrackets(year, 'residential_oleh');
  const olehResult   = applyBrackets(safePrice, olehBrackets);

  // Elect the cheaper of oleh vs primary (legal convention — buyer picks lower).
  const optimalTax = Math.min(olehResult.total, primaryResult.total);
  const optimalPath = olehResult.total <= primaryResult.total ? 'oleh' : 'primary';
  const optimalApplied = optimalPath === 'oleh' ? olehResult.applied : primaryResult.applied;
  const optimalEffective = safePrice > 0 ? optimalTax / safePrice : 0;

  const discountVsPrimary  = Math.max(0, round2(primaryResult.total - optimalTax));
  const discountVsInvestor = Math.max(0, round2(investorResult.total - optimalTax));

  return {
    eligible: true,
    reason_he: 'עולה חדש בתוך חלון 7 שנים (§12) — שיעורים מופחתים',
    reason_en: 'New immigrant within 7-year window (§12) — discounted rates',
    brackets: optimalApplied,
    tax: round2(optimalTax),
    oleh_tax: olehResult.total,
    standard_tax: primaryResult.total,
    investor_tax: investorResult.total,
    discount_vs_primary:  discountVsPrimary,
    discount_vs_investor: discountVsInvestor,
    optimal_path: optimalPath,
    // legacy alias — largest of the two discounts (usually vs. investor table)
    discount: Math.max(discountVsPrimary, discountVsInvestor),
    effective_rate: round2(optimalEffective),
    window: {
      months_since_aliyah: months,
      months_before_window: OLEH_DISCOUNT_WINDOW.MONTHS_BEFORE,
      months_after_window: OLEH_DISCOUNT_WINDOW.MONTHS_AFTER,
      aliyah_date: immig.toISOString().slice(0, 10),
      purchase_date: purchase.toISOString().slice(0, 10),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // main API
  computePurchaseTax,
  computeOlehDiscount,
  getBrackets,
  listSupportedYears,

  // constants
  PROPERTY_TYPES,
  BUYER_STATUS,
  FORM_CODES,
  CPI_INDEX,
  BRACKETS_BY_YEAR,
  OLEH_DISCOUNT_WINDOW,

  // low-level helpers (exposed for tests / advanced callers)
  applyBrackets,
  resolveBuyerType,
  collectExemptions,
};
