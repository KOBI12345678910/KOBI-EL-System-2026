/**
 * form-6111.js — טופס 6111 (דוח מתואם לצורכי מס) — Adjusted Financial Statements
 * Agent Y-002 / Swarm Tax / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli annual corporate tax return — Form 6111.
 *
 *   Form 6111 = "דוח מתואם לצורכי מס" — the official mapping of the
 *   company's trial balance to the tax authority's standardized row codes
 *   (1000–9999), grouped by מחלקה (section). Every active חברה in Israel
 *   must submit this alongside its 1214/1320 annual return.
 *
 * This module performs the full pipeline:
 *
 *   1. Map an internal COA account to the correct Form 6111 row code.
 *   2. Aggregate trial-balance figures into the canonical sections:
 *        - Revenues         (1000–1999)
 *        - COGS             (2000–2999)
 *        - Operating exp.   (3000–4999)
 *        - Financial items  (5000–5999)
 *        - Extraordinary    (6000–6999)
 *        - Current assets   (7000–7399)
 *        - Fixed assets     (7400–7699)
 *        - Liabilities      (7700–8799)
 *        - Equity           (8800–9999)
 *   3. Apply Israeli tax adjustments:
 *        - Non-deductible entertainment (80% / הוצאות כיבוד לא מוכרות)
 *        - Donations cap (30% of taxable income / §46)
 *        - Depreciation tax vs. book diff
 *        - FX / exchange differences (§9 פקודת מס הכנסה)
 *        - Accrual vs. cash basis differences
 *   4. Compute taxable income + apply 23% corporate tax rate for 2026.
 *   5. Subtract advances and credits.
 *   6. Emit structured JSON, XML for שע"מ/שידור, and optional PDF.
 *
 * Rule: "לא מוחקים רק משדרגים ומגדלים" — no destructive ops. All original
 * inputs are preserved; adjustments are additive and logged.
 *
 * Zero external dependencies. `pdfkit` is OPTIONAL — if not installed the
 * PDF path degrades to a plain-text stub so tests remain green.
 *
 * Reference sources (all cross-checked against ISRAELI_TAX_CONSTANTS_2026.md):
 *   - פקודת מס הכנסה [נוסח חדש], תשכ"א-1961
 *   - סעיף 9 — הפרשי שער ושערוך
 *   - סעיף 17 — ניכויים מותרים
 *   - סעיף 46 — זיכוי בגין תרומות (30% תקרת הכנסה)
 *   - תקנות מס הכנסה (ניכוי הוצאות מסוימות), התשל"ב-1972 — כיבוד 80%
 *   - תקנות מס הכנסה (פחת), התש"ט-1941
 *   - טופס 6111 — מבנה שורות רשות המסים
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - generate6111(trialBalance, adjustments, company) → full result object
 *   - mapCOAToForm6111(account)                        → 6111 row info
 *   - COA_MAP, SECTION_CODES, ADJ_RULES, CONSTANTS_2026
 *   - renderXml(result) / renderJson(result) / renderPdf(result, outPath)
 *   - computeCorporateTax(taxableIncome, year)
 *   - createEngine()                                    → isolated instance
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — Israeli 2026 corporate tax parameters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CONSTANTS_2026 — statutory numbers in effect for tax year 2026.
 * Mirror of ISRAELI_TAX_CONSTANTS_2026.md. Adjust here when the Treasury
 * publishes a new rate — never patch inline in functions.
 */
const CONSTANTS_2026 = Object.freeze({
  CORPORATE_TAX_RATE:        0.23,   // 23% מס חברות (unchanged since 2018)
  DONATIONS_CAP_RATE:        0.30,   // §46 — cap at 30% of taxable income
  DONATIONS_ABS_FLOOR:       200,    // Minimum recognised donation (₪)
  DONATIONS_ABS_CEILING:     10587000, // 2026 absolute ceiling (₪) per §46
  ENTERTAINMENT_DEDUCTIBLE:  0.80,   // 80% of כיבוד deductible
  VEHICLE_DEDUCTIBLE_RATE:   0.45,   // 45% usage default for private-use cars
  STD_DEPRECIATION_PROXY:    0.10,   // Fallback annual depreciation if none given
  YEAR:                      2026,
});

/**
 * SECTION_CODES — top-level מחלקות (sections) of Form 6111.
 * Each section owns a contiguous block of 4-digit row codes.
 * Order is the canonical printing/submission order.
 */
const SECTION_CODES = Object.freeze([
  { id: 'REVENUES',     range: [1000, 1999], he: 'הכנסות',                          en: 'Revenues'           },
  { id: 'COGS',         range: [2000, 2999], he: 'עלות המכירות',                    en: 'Cost of Goods Sold' },
  { id: 'OPEX',         range: [3000, 4999], he: 'הוצאות תפעוליות',                 en: 'Operating Expenses' },
  { id: 'FINANCIAL',    range: [5000, 5999], he: 'הכנסות והוצאות מימון',            en: 'Financial Items'    },
  { id: 'EXTRAORDINARY',range: [6000, 6999], he: 'הכנסות והוצאות חד-פעמיות',        en: 'Extraordinary Items'},
  { id: 'CURRENT_ASSETS',range:[7000, 7399], he: 'נכסים שוטפים',                    en: 'Current Assets'     },
  { id: 'FIXED_ASSETS', range: [7400, 7699], he: 'רכוש קבוע',                       en: 'Fixed Assets'       },
  { id: 'LIABILITIES',  range: [7700, 8799], he: 'התחייבויות',                      en: 'Liabilities'        },
  { id: 'EQUITY',       range: [8800, 9999], he: 'הון עצמי',                        en: 'Equity'             },
]);

// ═══════════════════════════════════════════════════════════════════════════
// COA MAP — internal chart-of-accounts → Form 6111 row codes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * COA_MAP — ordered mapping from internal account codes/types to
 * Form 6111 row codes. Built with a *longest-prefix-match* strategy:
 * an account "4110-001" first tries "4110-001", then "4110", then "4", then
 * falls back to `type` (asset|liability|equity|revenue|expense).
 *
 * Every row entry carries a bilingual label so consumers can render the
 * Hebrew statutory name OR the English title side-by-side.
 */
const COA_MAP = Object.freeze({
  // ───────────── Revenues 1000–1999 ─────────────
  '1000': { row: 1000, section: 'REVENUES',  he: 'מכירות ושירותים',                 en: 'Sales of goods & services' },
  '1010': { row: 1010, section: 'REVENUES',  he: 'מכירות בארץ',                      en: 'Domestic sales' },
  '1020': { row: 1020, section: 'REVENUES',  he: 'מכירות לחו"ל (יצוא)',              en: 'Export sales' },
  '1100': { row: 1100, section: 'REVENUES',  he: 'הכנסות משירותים',                  en: 'Service revenue' },
  '1200': { row: 1200, section: 'REVENUES',  he: 'הכנסות משכירות',                   en: 'Rental revenue' },
  '1300': { row: 1300, section: 'REVENUES',  he: 'הכנסות אחרות',                     en: 'Other revenue' },
  '1900': { row: 1900, section: 'REVENUES',  he: 'הנחות והחזרות',                    en: 'Discounts & returns', contra: true },

  // ───────────── Cost of Goods Sold 2000–2999 ─────────────
  '2000': { row: 2000, section: 'COGS',      he: 'עלות המכירות',                     en: 'Cost of goods sold' },
  '2010': { row: 2010, section: 'COGS',      he: 'מלאי פתיחה',                       en: 'Opening inventory' },
  '2020': { row: 2020, section: 'COGS',      he: 'קניות',                            en: 'Purchases' },
  '2030': { row: 2030, section: 'COGS',      he: 'מלאי סגירה',                       en: 'Closing inventory', contra: true },
  '2100': { row: 2100, section: 'COGS',      he: 'עבודה ישירה',                      en: 'Direct labor' },
  '2200': { row: 2200, section: 'COGS',      he: 'הוצאות ייצור',                     en: 'Manufacturing overhead' },
  '2300': { row: 2300, section: 'COGS',      he: 'קבלני משנה',                       en: 'Subcontractors' },

  // ───────────── Operating Expenses 3000–4999 ─────────────
  '3000': { row: 3000, section: 'OPEX',      he: 'הוצאות הנהלה וכלליות',             en: 'G&A expenses' },
  '3100': { row: 3100, section: 'OPEX',      he: 'שכר ונלוות',                        en: 'Salaries & benefits' },
  '3110': { row: 3110, section: 'OPEX',      he: 'ביטוח לאומי מעביד',                en: 'National insurance (employer)' },
  '3120': { row: 3120, section: 'OPEX',      he: 'פנסיה וקרן השתלמות',                en: 'Pension & study fund' },
  '3200': { row: 3200, section: 'OPEX',      he: 'שכר דירה',                          en: 'Rent' },
  '3210': { row: 3210, section: 'OPEX',      he: 'חשמל ומים',                         en: 'Utilities' },
  '3220': { row: 3220, section: 'OPEX',      he: 'תקשורת ואינטרנט',                    en: 'Communications' },
  '3300': { row: 3300, section: 'OPEX',      he: 'רכב ודלק',                          en: 'Vehicle & fuel' },
  '3310': { row: 3310, section: 'OPEX',      he: 'נסיעות ואש"ל',                      en: 'Travel & per-diem' },
  '3400': { row: 3400, section: 'OPEX',      he: 'כיבוד ואירוח',                      en: 'Entertainment & hospitality' },
  '3410': { row: 3410, section: 'OPEX',      he: 'מתנות ללקוחות',                     en: 'Client gifts' },
  '3500': { row: 3500, section: 'OPEX',      he: 'שירותים מקצועיים',                  en: 'Professional services' },
  '3510': { row: 3510, section: 'OPEX',      he: 'ייעוץ משפטי',                       en: 'Legal fees' },
  '3520': { row: 3520, section: 'OPEX',      he: 'רואי חשבון',                        en: 'Accounting fees' },
  '3600': { row: 3600, section: 'OPEX',      he: 'שיווק ופרסום',                       en: 'Marketing & advertising' },
  '3700': { row: 3700, section: 'OPEX',      he: 'אחזקה ותיקונים',                    en: 'Maintenance & repairs' },
  '3800': { row: 3800, section: 'OPEX',      he: 'ציוד משרדי',                         en: 'Office supplies' },
  '3900': { row: 3900, section: 'OPEX',      he: 'ביטוח',                              en: 'Insurance' },
  '4000': { row: 4000, section: 'OPEX',      he: 'פחת והפחתות',                        en: 'Depreciation & amortization' },
  '4100': { row: 4100, section: 'OPEX',      he: 'מסים ואגרות',                        en: 'Taxes & levies' },
  '4200': { row: 4200, section: 'OPEX',      he: 'תרומות',                             en: 'Donations' },
  '4300': { row: 4300, section: 'OPEX',      he: 'חובות אבודים',                       en: 'Bad debts' },
  '4900': { row: 4900, section: 'OPEX',      he: 'הוצאות תפעוליות אחרות',              en: 'Other operating expenses' },

  // ───────────── Financial Income & Expenses 5000–5999 ─────────────
  '5000': { row: 5000, section: 'FINANCIAL', he: 'הכנסות מימון',                       en: 'Financial income' },
  '5010': { row: 5010, section: 'FINANCIAL', he: 'ריבית שהתקבלה',                      en: 'Interest received' },
  '5020': { row: 5020, section: 'FINANCIAL', he: 'הפרשי שער חיוביים',                   en: 'FX gains' },
  '5030': { row: 5030, section: 'FINANCIAL', he: 'דיבידנד שהתקבל',                      en: 'Dividends received' },
  '5100': { row: 5100, section: 'FINANCIAL', he: 'הוצאות מימון',                        en: 'Financial expenses' },
  '5110': { row: 5110, section: 'FINANCIAL', he: 'ריבית בנקים',                         en: 'Bank interest' },
  '5120': { row: 5120, section: 'FINANCIAL', he: 'הפרשי שער שליליים',                    en: 'FX losses' },
  '5130': { row: 5130, section: 'FINANCIAL', he: 'עמלות בנק',                            en: 'Bank charges' },

  // ───────────── Extraordinary 6000–6999 ─────────────
  '6000': { row: 6000, section: 'EXTRAORDINARY', he: 'רווחי הון',                        en: 'Capital gains' },
  '6100': { row: 6100, section: 'EXTRAORDINARY', he: 'הפסדי הון',                         en: 'Capital losses' },
  '6200': { row: 6200, section: 'EXTRAORDINARY', he: 'הכנסות חד-פעמיות',                  en: 'One-time income' },
  '6300': { row: 6300, section: 'EXTRAORDINARY', he: 'הוצאות חד-פעמיות',                   en: 'One-time expenses' },

  // ───────────── Current Assets 7000–7399 ─────────────
  '7000': { row: 7000, section: 'CURRENT_ASSETS', he: 'מזומנים ושווי מזומנים',               en: 'Cash & equivalents' },
  '7010': { row: 7010, section: 'CURRENT_ASSETS', he: 'קופה',                                 en: 'Petty cash' },
  '7020': { row: 7020, section: 'CURRENT_ASSETS', he: 'חשבונות בנק — עו"ש',                  en: 'Bank — checking' },
  '7030': { row: 7030, section: 'CURRENT_ASSETS', he: 'פיקדונות קצרי טווח',                   en: 'Short-term deposits' },
  '7100': { row: 7100, section: 'CURRENT_ASSETS', he: 'לקוחות',                               en: 'Accounts receivable' },
  '7110': { row: 7110, section: 'CURRENT_ASSETS', he: 'המחאות לגבייה',                       en: 'Cheques for collection' },
  '7120': { row: 7120, section: 'CURRENT_ASSETS', he: 'הכנסות לקבל',                          en: 'Accrued income' },
  '7200': { row: 7200, section: 'CURRENT_ASSETS', he: 'מלאי',                                 en: 'Inventory' },
  '7300': { row: 7300, section: 'CURRENT_ASSETS', he: 'חייבים ויתרות חובה',                   en: 'Other debtors' },
  '7310': { row: 7310, section: 'CURRENT_ASSETS', he: 'מע"מ תשומות',                          en: 'Input VAT' },
  '7320': { row: 7320, section: 'CURRENT_ASSETS', he: 'הוצאות מראש',                          en: 'Prepaid expenses' },

  // ───────────── Fixed Assets 7400–7699 ─────────────
  '7400': { row: 7400, section: 'FIXED_ASSETS', he: 'רכוש קבוע',                              en: 'Fixed assets' },
  '7410': { row: 7410, section: 'FIXED_ASSETS', he: 'מקרקעין — עלות',                        en: 'Land & buildings (cost)' },
  '7420': { row: 7420, section: 'FIXED_ASSETS', he: 'מכונות וציוד — עלות',                   en: 'Machinery (cost)' },
  '7430': { row: 7430, section: 'FIXED_ASSETS', he: 'כלי רכב — עלות',                         en: 'Vehicles (cost)' },
  '7440': { row: 7440, section: 'FIXED_ASSETS', he: 'ריהוט וציוד משרדי — עלות',               en: 'Office equipment (cost)' },
  '7450': { row: 7450, section: 'FIXED_ASSETS', he: 'מחשבים וציוד טכנולוגי — עלות',           en: 'Computers (cost)' },
  '7500': { row: 7500, section: 'FIXED_ASSETS', he: 'פחת נצבר',                               en: 'Accumulated depreciation', contra: true },
  '7600': { row: 7600, section: 'FIXED_ASSETS', he: 'נכסים לא מוחשיים',                       en: 'Intangible assets' },

  // ───────────── Liabilities 7700–8799 ─────────────
  '7700': { row: 7700, section: 'LIABILITIES', he: 'התחייבויות שוטפות',                        en: 'Current liabilities' },
  '7710': { row: 7710, section: 'LIABILITIES', he: 'ספקים ונותני שירותים',                     en: 'Accounts payable' },
  '7720': { row: 7720, section: 'LIABILITIES', he: 'שיקים לפירעון',                            en: 'Cheques payable' },
  '7730': { row: 7730, section: 'LIABILITIES', he: 'זכאים ויתרות זכות',                        en: 'Other creditors' },
  '7740': { row: 7740, section: 'LIABILITIES', he: 'מע"מ עסקאות',                              en: 'Output VAT' },
  '7750': { row: 7750, section: 'LIABILITIES', he: 'ניכויי מקור לעובדים',                      en: 'Withholding — payroll' },
  '7760': { row: 7760, section: 'LIABILITIES', he: 'ניכויים למס הכנסה',                         en: 'Withholding — income tax' },
  '7770': { row: 7770, section: 'LIABILITIES', he: 'ביטוח לאומי',                               en: 'National insurance payable' },
  '7780': { row: 7780, section: 'LIABILITIES', he: 'הפרשות לחופשה והבראה',                     en: 'Vacation & recuperation provisions' },
  '7790': { row: 7790, section: 'LIABILITIES', he: 'הוצאות לשלם',                              en: 'Accrued expenses' },
  '8000': { row: 8000, section: 'LIABILITIES', he: 'הלוואות קצרות טווח',                        en: 'Short-term loans' },
  '8100': { row: 8100, section: 'LIABILITIES', he: 'הלוואות לזמן ארוך',                         en: 'Long-term loans' },
  '8200': { row: 8200, section: 'LIABILITIES', he: 'התחייבות לפיצויי פרישה',                    en: 'Severance liability' },
  '8300': { row: 8300, section: 'LIABILITIES', he: 'מסים נדחים',                                en: 'Deferred taxes' },

  // ───────────── Equity 8800–9999 ─────────────
  '8800': { row: 8800, section: 'EQUITY',     he: 'הון מניות',                                 en: 'Share capital' },
  '8900': { row: 8900, section: 'EQUITY',     he: 'פרמיה',                                     en: 'Share premium' },
  '9000': { row: 9000, section: 'EQUITY',     he: 'עודפים',                                    en: 'Retained earnings' },
  '9100': { row: 9100, section: 'EQUITY',     he: 'קרנות הון',                                  en: 'Capital reserves' },
  '9200': { row: 9200, section: 'EQUITY',     he: 'דיבידנד שהוכרז',                            en: 'Declared dividends', contra: true },
});

/**
 * Type-based fallback: if no numeric prefix matches, use the account's
 * logical `type` to land somewhere sane.
 */
const TYPE_FALLBACK = Object.freeze({
  revenue:    { row: 1300, section: 'REVENUES',       he: 'הכנסות אחרות',          en: 'Other revenue' },
  cogs:       { row: 2000, section: 'COGS',           he: 'עלות המכירות',          en: 'Cost of goods sold' },
  expense:    { row: 4900, section: 'OPEX',           he: 'הוצאות תפעוליות אחרות', en: 'Other operating expenses' },
  financial:  { row: 5100, section: 'FINANCIAL',      he: 'הוצאות מימון',          en: 'Financial expenses' },
  asset:      { row: 7300, section: 'CURRENT_ASSETS', he: 'חייבים ויתרות חובה',    en: 'Other debtors' },
  fixed:      { row: 7400, section: 'FIXED_ASSETS',   he: 'רכוש קבוע',             en: 'Fixed assets' },
  liability:  { row: 7730, section: 'LIABILITIES',    he: 'זכאים ויתרות זכות',     en: 'Other creditors' },
  equity:     { row: 9000, section: 'EQUITY',         he: 'עודפים',                en: 'Retained earnings' },
});

// ═══════════════════════════════════════════════════════════════════════════
// ADJUSTMENT RULES — book→tax differences
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ADJ_RULES — declarative table of Israeli book-to-tax adjustments.
 * Each rule is a function: (input, context) → { amount, explanation }
 * where a positive amount INCREASES taxable income (add-back) and a
 * negative amount DECREASES it (relief).
 */
const ADJ_RULES = Object.freeze({

  /**
   * כיבוד — only 80% deductible. Non-deductible 20% must be added back.
   * @param {object} input  { entertainmentExpense }
   */
  entertainment(input) {
    const exp = num(input?.entertainmentExpense);
    if (!exp) return { amount: 0, explanation: 'אין הוצאות כיבוד / no entertainment expense' };
    const nonDeductible = exp * (1 - CONSTANTS_2026.ENTERTAINMENT_DEDUCTIBLE);
    return {
      amount: round(nonDeductible),
      explanation: `כיבוד לא מוכר — ${pct(1 - CONSTANTS_2026.ENTERTAINMENT_DEDUCTIBLE)} מתוך ${round(exp)}₪`,
    };
  },

  /**
   * תרומות — §46. Deductible up to 30% of taxable income, floor 200₪,
   * absolute ceiling per annual Treasury notice.
   * @param {object} input  { donations }
   * @param {object} context  { taxableBeforeAdj }
   */
  donations(input, context) {
    const donated = num(input?.donations);
    if (!donated) return { amount: 0, explanation: 'אין תרומות / no donations' };
    if (donated < CONSTANTS_2026.DONATIONS_ABS_FLOOR) {
      // Below floor — entirely non-deductible, so add back full amount
      return {
        amount: round(donated),
        explanation: `תרומה מתחת ל-${CONSTANTS_2026.DONATIONS_ABS_FLOOR}₪ — לא מוכרת`,
      };
    }
    const taxableBase = Math.max(0, num(context?.taxableBeforeAdj) || 0);
    const cap30 = taxableBase * CONSTANTS_2026.DONATIONS_CAP_RATE;
    const cap = Math.min(cap30, CONSTANTS_2026.DONATIONS_ABS_CEILING);
    const excess = Math.max(0, donated - cap);
    return {
      amount: round(excess),
      explanation: `תרומות מעל תקרת 30% — ${round(excess)}₪ הוספה לחישוב (סף: ${round(cap)}₪)`,
    };
  },

  /**
   * פחת — difference between book depreciation and tax depreciation.
   * Positive diff means book > tax → add back (reduce recognised expense).
   * Negative diff means book < tax → deduct extra.
   * @param {object} input { bookDepreciation, taxDepreciation }
   */
  depreciationDiff(input) {
    const book = num(input?.bookDepreciation);
    const tax  = num(input?.taxDepreciation);
    if (book === 0 && tax === 0) {
      return { amount: 0, explanation: 'אין פער פחת / no depreciation diff' };
    }
    const diff = book - tax;
    return {
      amount: round(diff),
      explanation: `הפרש פחת: ספרי ${round(book)} − מס ${round(tax)} = ${round(diff)}₪`,
    };
  },

  /**
   * הפרשי שער — §9 פקודת מס הכנסה.
   * Realised FX is taxable, unrealised on monetary items is taxable,
   * but unrealised on capital items is NOT taxable → must be backed out.
   * @param {object} input { fxRealised, fxUnrealisedCapital, fxUnrealisedRevenue }
   */
  fxSection9(input) {
    const unrealCap = num(input?.fxUnrealisedCapital);
    if (unrealCap === 0) {
      return { amount: 0, explanation: 'אין הפרשי שער הוניים לא ממומשים / no §9 diff' };
    }
    // Unrealised FX on capital items should be REMOVED from book P&L.
    // If book recognised a GAIN (positive), subtract it; if LOSS, add it back.
    return {
      amount: round(-unrealCap),
      explanation: `הפרשי שער הוניים לא ממומשים (סעיף 9) — תיקון של ${round(-unrealCap)}₪`,
    };
  },

  /**
   * Accrual vs. cash — for cash-basis filers, revenues and expenses
   * already recognised on accrual must be reversed and real cash flows
   * substituted. Engine assumes caller has pre-computed the delta.
   * @param {object} input { accrualToCashDelta }
   */
  accrualVsCash(input) {
    const delta = num(input?.accrualToCashDelta);
    if (delta === 0) return { amount: 0, explanation: 'לא רלוונטי — בסיס מצטבר / not applicable' };
    return {
      amount: round(delta),
      explanation: `התאמת בסיס מזומן — ${round(delta)}₪`,
    };
  },

  /**
   * רכב — non-deductible portion (typically 45% usage-based).
   * @param {object} input { vehicleExpense, deductibleShare? }
   */
  vehicle(input) {
    const exp = num(input?.vehicleExpense);
    if (!exp) return { amount: 0, explanation: 'אין הוצאות רכב / no vehicle expense' };
    const share = input?.deductibleShare != null ? num(input.deductibleShare) : CONSTANTS_2026.VEHICLE_DEDUCTIBLE_RATE;
    const nonDeductible = exp * (1 - share);
    return {
      amount: round(nonDeductible),
      explanation: `רכב — ${pct(1 - share)} לא מוכר מתוך ${round(exp)}₪`,
    };
  },

  /**
   * קנסות ועונשין — always non-deductible.
   * @param {object} input { fines }
   */
  fines(input) {
    const f = num(input?.fines);
    if (!f) return { amount: 0, explanation: 'אין קנסות / no fines' };
    return { amount: round(f), explanation: `קנסות ועונשין — לא מוכרים ${round(f)}₪` };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PURE UTILITIES — no side effects, no mutation
// ═══════════════════════════════════════════════════════════════════════════

function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(v, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(num(v) * factor) / factor;
}

function pct(v) {
  return `${round(num(v) * 100, 1)}%`;
}

function findSection(code) {
  const n = typeof code === 'number' ? code : parseInt(String(code).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  for (const s of SECTION_CODES) {
    if (n >= s.range[0] && n <= s.range[1]) return s;
  }
  return null;
}

/**
 * rowKind(row) — classifies a 6111 row code as income|expense|asset|liability|equity.
 * Used to decide the sign of the raw debit-credit when presenting totals.
 *
 *   Raw TB convention: net = debit − credit.
 *     - Assets / expenses naturally carry positive raw net.
 *     - Revenues / liabilities / equity / financial-income naturally carry NEGATIVE raw net.
 *
 *   Display convention: we want every section rendered as a positive magnitude,
 *   so this helper tells callers whether to multiply raw net by -1 or not.
 */
function rowKind(row) {
  const n = typeof row === 'number' ? row : parseInt(String(row).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 1000 && n <= 1999) return 'income';        // revenues
  if (n >= 2000 && n <= 2999) return 'expense';       // cogs
  if (n >= 3000 && n <= 4999) return 'expense';       // opex
  if (n >= 5000 && n <= 5099) return 'income';        // financial income
  if (n >= 5100 && n <= 5999) return 'expense';       // financial expense
  if (n >= 6000 && n <= 6199) return 'income';        // extraordinary income
  if (n >= 6200 && n <= 6299) return 'income';        // extraordinary income (one-off)
  if (n >= 6100 && n <= 6199) return 'expense';       // capital losses (before 6200)
  if (n >= 6300 && n <= 6999) return 'expense';       // one-off expense
  if (n >= 7000 && n <= 7699) return 'asset';
  if (n >= 7700 && n <= 8799) return 'liability';
  if (n >= 8800 && n <= 9999) return 'equity';
  return 'unknown';
}

/**
 * Escape XML text content (no & < > quotes in names/values).
 */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE — COA mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * mapCOAToForm6111(account) — map one internal account to a Form 6111 row.
 *
 * @param {object} account
 * @param {string} account.code       Internal COA code (e.g. "3400-01")
 * @param {string} [account.type]     One of revenue|cogs|expense|financial|asset|fixed|liability|equity
 * @param {string} [account.name]     Human-readable name (for fallback heuristics)
 * @returns {{row:number, section:string, sectionHe:string, sectionEn:string,
 *            he:string, en:string, sign:number, source:string}}
 */
function mapCOAToForm6111(account) {
  if (!account || typeof account !== 'object') {
    throw new TypeError('mapCOAToForm6111: account object required');
  }
  const codeStr = String(account.code == null ? '' : account.code).trim();

  function buildResult(m, source) {
    const section = SECTION_CODES.find(s => s.id === m.section);
    return {
      row:       m.row,
      section:   m.section,
      sectionHe: section ? section.he : '',
      sectionEn: section ? section.en : '',
      he:        m.he,
      en:        m.en,
      contra:    !!m.contra,
      sign:      m.contra ? -1 : 1, // kept for backward compatibility
      source,
    };
  }

  // Longest-prefix-match against COA_MAP keys
  if (codeStr) {
    const digits = codeStr.replace(/\D.*/, ''); // strip anything after first non-digit
    for (let len = Math.min(4, digits.length); len >= 1; len--) {
      const key = digits.slice(0, len).padEnd(4, '0');
      if (COA_MAP[key]) {
        return buildResult(COA_MAP[key], `code_prefix_${key}`);
      }
    }
  }

  // Name-based heuristics for un-coded/legacy accounts
  const nameLower = String(account.name || '').toLowerCase();
  if (nameLower) {
    const hints = [
      { re: /entertain|hospital|כיבוד/i,     key: '3400' },
      { re: /donat|תרומ/i,                    key: '4200' },
      { re: /deprecia|פחת/i,                   key: '4000' },
      { re: /salar|wage|payroll|שכר/i,        key: '3100' },
      { re: /rent|שכירות|שכ"ד/i,              key: '3200' },
      { re: /bank.*fee|עמלת?.*בנק/i,          key: '5130' },
      { re: /interest.*expense|ריבית.*הוצ/i, key: '5110' },
      { re: /fx|exchange|הפרשי שער/i,         key: '5120' },
    ];
    for (const h of hints) {
      if (h.re.test(nameLower) || h.re.test(account.name || '')) {
        return buildResult(COA_MAP[h.key], `name_hint_${h.key}`);
      }
    }
  }

  // Type-based fallback
  const type = String(account.type || '').toLowerCase();
  if (TYPE_FALLBACK[type]) {
    return buildResult(TYPE_FALLBACK[type], `type_fallback_${type}`);
  }

  // Ultimate fallback — bucket into "other OPEX" but flag uncategorised
  return buildResult(COA_MAP['4900'], 'uncategorised_fallback');
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE — aggregation + tax computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate a trial-balance array into per-row and per-section totals.
 *
 * @param {Array} trialBalance  [{ code, name?, type?, debit, credit }]
 * @returns {{ rows: Map<number, object>, sections: Map<string, object>, warnings: string[] }}
 */
function aggregateTrialBalance(trialBalance) {
  const rows = new Map();
  const sections = new Map();
  const warnings = [];

  for (const s of SECTION_CODES) {
    sections.set(s.id, { ...s, total: 0, incomeTotal: 0, expenseTotal: 0, rowCount: 0 });
  }

  if (!Array.isArray(trialBalance)) {
    warnings.push('trial balance was not an array — empty aggregation');
    return { rows, sections, warnings };
  }

  for (const acc of trialBalance) {
    if (!acc || typeof acc !== 'object') {
      warnings.push(`skipping non-object entry: ${JSON.stringify(acc)}`);
      continue;
    }
    let mapping;
    try {
      mapping = mapCOAToForm6111(acc);
    } catch (e) {
      warnings.push(`mapping failed for ${acc.code}: ${e.message}`);
      continue;
    }

    // Raw net balance — debit minus credit.
    const raw = num(acc.debit) - num(acc.credit);

    // Per-row display sign based on the row's natural kind:
    //   income  (revenue, fin-income) → flip raw (credit balance → positive display)
    //   expense (cogs, opex, fin-exp) → keep raw (debit balance → positive display)
    //   asset                          → keep raw (debit balance → positive display)
    //   liability / equity             → flip raw (credit balance → positive display)
    const kind = rowKind(mapping.row);
    const flipKind =
      kind === 'income'    ||
      kind === 'liability' ||
      kind === 'equity';
    const natural = flipKind ? -raw : raw;

    // Contra rows (acc depn, discounts, closing inventory, declared dividends)
    // keep their natural sign — the raw debit-credit already reflects the
    // deducting direction, so we expose the negative value directly.
    const displayNet = mapping.contra ? raw : natural;

    if (!rows.has(mapping.row)) {
      rows.set(mapping.row, {
        row:       mapping.row,
        section:   mapping.section,
        he:        mapping.he,
        en:        mapping.en,
        sectionHe: mapping.sectionHe,
        sectionEn: mapping.sectionEn,
        kind,
        amount:    0,
        accounts:  [],
      });
    }
    const r = rows.get(mapping.row);
    r.amount = round(r.amount + displayNet);
    r.accounts.push({
      code:   acc.code,
      name:   acc.name,
      debit:  num(acc.debit),
      credit: num(acc.credit),
      net:    round(displayNet),
      kind,
      source: mapping.source,
    });

    // Section total uses the same display-net (every section is a positive
    // magnitude in the canonical Form 6111 presentation). We also keep
    // income/expense subtotals so callers can compute P&L without
    // guessing row ranges.
    const secAgg = sections.get(mapping.section);
    secAgg.total = round(secAgg.total + displayNet);
    if (kind === 'income')  secAgg.incomeTotal  = round(secAgg.incomeTotal  + displayNet);
    if (kind === 'expense') secAgg.expenseTotal = round(secAgg.expenseTotal + displayNet);
    secAgg.rowCount += 1;
  }

  return { rows, sections, warnings };
}

/**
 * Apply every adjustment rule and return a detailed list.
 *
 * @param {object} adjustments  Input for each rule.
 * @param {object} context      Shared context — at minimum `taxableBeforeAdj`.
 * @returns {{ total: number, list: Array<{rule:string, amount:number, explanation:string}> }}
 */
function applyAdjustments(adjustments, context) {
  const adj = adjustments || {};
  const list = [];
  let total = 0;
  for (const [name, fn] of Object.entries(ADJ_RULES)) {
    try {
      const result = fn(adj, context);
      const amount = num(result?.amount);
      list.push({
        rule:        name,
        amount:      round(amount),
        explanation: String(result?.explanation || ''),
      });
      total += amount;
    } catch (e) {
      list.push({ rule: name, amount: 0, explanation: `error: ${e.message}` });
    }
  }
  return { total: round(total), list };
}

/**
 * computeCorporateTax — apply the 2026 Israeli corporate rate (23%).
 * Taxable income is floored at 0 — losses are reported but produce no tax.
 */
function computeCorporateTax(taxableIncome, year) {
  const ti = num(taxableIncome);
  if (ti <= 0) return { rate: CONSTANTS_2026.CORPORATE_TAX_RATE, tax: 0, taxableIncome: 0, loss: -ti, year: year || CONSTANTS_2026.YEAR };
  const rate = CONSTANTS_2026.CORPORATE_TAX_RATE; // flat since 2018
  return {
    rate,
    tax:           round(ti * rate),
    taxableIncome: round(ti),
    loss:          0,
    year:          year || CONSTANTS_2026.YEAR,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY — generate6111
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate6111(trialBalance, adjustments, company)
 *
 * @param {Array}  trialBalance  Array of TB rows: { code, name?, type?, debit, credit }
 * @param {object} adjustments   Book-to-tax adjustment inputs (see ADJ_RULES)
 * @param {object} company       { company_id, legal_name, tax_file_number, fiscal_year, ... }
 * @returns {object}             Full Form 6111 result object (see docstring at top)
 */
function generate6111(trialBalance, adjustments, company) {
  const fiscalYear = num(company?.fiscal_year) || CONSTANTS_2026.YEAR;
  const { rows, sections, warnings } = aggregateTrialBalance(trialBalance);

  // Build section-ordered payload
  const payload = SECTION_CODES.map(s => {
    const secRows = [...rows.values()]
      .filter(r => r.section === s.id)
      .sort((a, b) => a.row - b.row);
    const secAgg = sections.get(s.id);
    return {
      id:       s.id,
      he:       s.he,
      en:       s.en,
      range:    s.range,
      total:    round(secAgg.total),
      rowCount: secAgg.rowCount,
      rows:     secRows,
    };
  });

  // Income statement aggregates
  const revenues      = sections.get('REVENUES').total;
  const cogs          = sections.get('COGS').total;
  const grossProfit   = round(revenues - cogs);
  const opex          = sections.get('OPEX').total;
  const operatingProfit = round(grossProfit - opex);
  // Financial section holds both income (5000-5099) and expense (5100-5999)
  // rows. The income/expense split was computed at aggregation time.
  const finSec        = sections.get('FINANCIAL');
  const financialIncome  = finSec.incomeTotal;
  const financialExpense = finSec.expenseTotal;
  const financialNet     = round(financialExpense - financialIncome);
  // Extraordinary section — same split.
  const xoSec         = sections.get('EXTRAORDINARY');
  const extraordinaryIncome  = xoSec.incomeTotal;
  const extraordinaryExpense = xoSec.expenseTotal;
  const extraordinaryNet     = round(extraordinaryIncome - extraordinaryExpense);
  const bookProfit    = round(operatingProfit - financialNet + extraordinaryNet);

  // Apply adjustments using bookProfit as context
  const adjResult = applyAdjustments(adjustments, { taxableBeforeAdj: bookProfit });
  const taxableIncome = round(bookProfit + adjResult.total);

  const taxResult = computeCorporateTax(taxableIncome, fiscalYear);

  // Advances and credits (already-paid / carried forward)
  const advances = num(adjustments?.advances);       // מקדמות ששולמו
  const credits  = num(adjustments?.credits);        // זיכויי מס
  const withholdingCredits = num(adjustments?.withholdingCredits); // ניכויים במקור
  const totalCredits = round(advances + credits + withholdingCredits);
  const taxDue       = round(taxResult.tax - totalCredits);

  // Balance sheet totals
  const currentAssets = sections.get('CURRENT_ASSETS').total;
  const fixedAssets   = sections.get('FIXED_ASSETS').total;
  const totalAssets   = round(currentAssets + fixedAssets);
  const liabilities   = sections.get('LIABILITIES').total;
  // Equity includes the current-year book profit that is still sitting
  // in the P&L until year-end closing. We close it into equity for the
  // purpose of the Form 6111 balance-check.
  const equityRaw       = sections.get('EQUITY').total;
  const equity          = round(equityRaw + bookProfit);
  const totalLiabEquity = round(liabilities + equity);
  const balanceCheck    = round(totalAssets - totalLiabEquity);

  // Internal sanity checks
  const sanity = [];
  if (Math.abs(balanceCheck) > 0.5) {
    sanity.push({ level: 'warning', code: 'BS_IMBALANCE', msg: `Balance sheet off by ${balanceCheck}₪` });
  }
  if (revenues < 0) {
    sanity.push({ level: 'warning', code: 'NEG_REVENUE', msg: 'Revenues are negative — check sign conventions' });
  }
  if (cogs < 0) {
    sanity.push({ level: 'info', code: 'NEG_COGS', msg: 'COGS is negative — inventory release may be unusual' });
  }
  for (const w of warnings) sanity.push({ level: 'info', code: 'MAPPING', msg: w });

  return {
    formType:    '6111',
    formVersion: String(fiscalYear),
    year:        fiscalYear,
    preparedAt:  new Date().toISOString(),

    company: {
      company_id:      company?.company_id || '',
      legal_name:      company?.legal_name || '',
      tax_file_number: company?.tax_file_number || '',
      fiscal_year:     fiscalYear,
    },

    // Income statement
    incomeStatement: {
      he: 'דוח רווח והפסד',
      en: 'Income Statement',
      revenues:          round(revenues),
      cogs:              round(cogs),
      grossProfit,
      operatingExpenses: round(opex),
      operatingProfit,
      financialIncome:   round(financialIncome),
      financialExpense:  round(financialExpense),
      financialNet,
      extraordinaryIncome: round(extraordinaryIncome),
      extraordinaryExpense:round(extraordinaryExpense),
      extraordinaryNet,
      bookProfit,
    },

    // Balance sheet
    balanceSheet: {
      he: 'מאזן',
      en: 'Balance Sheet',
      currentAssets: round(currentAssets),
      fixedAssets:   round(fixedAssets),
      totalAssets,
      liabilities:   round(liabilities),
      equity:        round(equity),
      totalLiabilitiesEquity: totalLiabEquity,
      balanceCheck,
    },

    // Adjustments
    adjustments: {
      he:      'התאמות לצורכי מס',
      en:      'Tax Adjustments',
      list:    adjResult.list,
      total:   adjResult.total,
    },

    // Tax computation
    taxComputation: {
      he:             'חישוב המס',
      en:             'Tax Computation',
      bookProfit,
      adjustmentsTotal: adjResult.total,
      taxableIncome:  taxResult.taxableIncome,
      loss:           taxResult.loss,
      rate:           taxResult.rate,
      corporateTax:   taxResult.tax,
      advances,
      credits,
      withholdingCredits,
      totalCredits,
      taxDue,
    },

    // Sectioned row payload — the canonical 6111 body
    sections: payload,

    // Diagnostics
    sanity,
    warnings,

    // Metadata
    metadata: {
      rule:              'לא מוחקים רק משדרגים ומגדלים',
      schemaVersion:     'onyx-form6111-2026.1',
      adjustmentRuleCount: adjResult.list.length,
      sectionCount:      SECTION_CODES.length,
      rowCount:          rows.size,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERERS — JSON / XML / PDF
// ═══════════════════════════════════════════════════════════════════════════

function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

/**
 * renderXml — emit a Shidur-compatible XML envelope.
 * Format is deliberately conservative and valid — a real submission will
 * still require a schema-driven serializer for רשות המסים, but this output
 * round-trips cleanly through any XML parser and is easy to diff.
 */
function renderXml(result) {
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<Form6111 xmlns="https://taxes.gov.il/form6111/2026">');

  // Header
  parts.push('  <Header>');
  parts.push(`    <FormType>${xmlEscape(result.formType)}</FormType>`);
  parts.push(`    <FormVersion>${xmlEscape(result.formVersion)}</FormVersion>`);
  parts.push(`    <Year>${xmlEscape(result.year)}</Year>`);
  parts.push(`    <PreparedAt>${xmlEscape(result.preparedAt)}</PreparedAt>`);
  parts.push('  </Header>');

  // Company
  parts.push('  <Company>');
  parts.push(`    <CompanyId>${xmlEscape(result.company.company_id)}</CompanyId>`);
  parts.push(`    <LegalName>${xmlEscape(result.company.legal_name)}</LegalName>`);
  parts.push(`    <TaxFileNumber>${xmlEscape(result.company.tax_file_number)}</TaxFileNumber>`);
  parts.push(`    <FiscalYear>${xmlEscape(result.company.fiscal_year)}</FiscalYear>`);
  parts.push('  </Company>');

  // Sections + rows
  parts.push('  <Sections>');
  for (const sec of result.sections) {
    parts.push(`    <Section id="${xmlEscape(sec.id)}" rangeFrom="${sec.range[0]}" rangeTo="${sec.range[1]}">`);
    parts.push(`      <LabelHe>${xmlEscape(sec.he)}</LabelHe>`);
    parts.push(`      <LabelEn>${xmlEscape(sec.en)}</LabelEn>`);
    parts.push(`      <Total>${round(sec.total)}</Total>`);
    parts.push('      <Rows>');
    for (const r of sec.rows) {
      parts.push(`        <Row code="${r.row}">`);
      parts.push(`          <LabelHe>${xmlEscape(r.he)}</LabelHe>`);
      parts.push(`          <LabelEn>${xmlEscape(r.en)}</LabelEn>`);
      parts.push(`          <Amount>${round(r.amount)}</Amount>`);
      parts.push('        </Row>');
    }
    parts.push('      </Rows>');
    parts.push('    </Section>');
  }
  parts.push('  </Sections>');

  // Income statement summary
  parts.push('  <IncomeStatement>');
  const is = result.incomeStatement;
  for (const k of ['revenues','cogs','grossProfit','operatingExpenses','operatingProfit','financialNet','extraordinaryNet','bookProfit']) {
    parts.push(`    <${capitalize(k)}>${round(is[k])}</${capitalize(k)}>`);
  }
  parts.push('  </IncomeStatement>');

  // Balance sheet summary
  parts.push('  <BalanceSheet>');
  const bs = result.balanceSheet;
  for (const k of ['currentAssets','fixedAssets','totalAssets','liabilities','equity','totalLiabilitiesEquity','balanceCheck']) {
    parts.push(`    <${capitalize(k)}>${round(bs[k])}</${capitalize(k)}>`);
  }
  parts.push('  </BalanceSheet>');

  // Adjustments
  parts.push('  <Adjustments>');
  parts.push(`    <Total>${round(result.adjustments.total)}</Total>`);
  for (const a of result.adjustments.list) {
    parts.push(`    <Adjustment rule="${xmlEscape(a.rule)}">`);
    parts.push(`      <Amount>${round(a.amount)}</Amount>`);
    parts.push(`      <Explanation>${xmlEscape(a.explanation)}</Explanation>`);
    parts.push('    </Adjustment>');
  }
  parts.push('  </Adjustments>');

  // Tax computation
  parts.push('  <TaxComputation>');
  const tc = result.taxComputation;
  parts.push(`    <BookProfit>${round(tc.bookProfit)}</BookProfit>`);
  parts.push(`    <AdjustmentsTotal>${round(tc.adjustmentsTotal)}</AdjustmentsTotal>`);
  parts.push(`    <TaxableIncome>${round(tc.taxableIncome)}</TaxableIncome>`);
  parts.push(`    <Rate>${tc.rate}</Rate>`);
  parts.push(`    <CorporateTax>${round(tc.corporateTax)}</CorporateTax>`);
  parts.push(`    <Advances>${round(tc.advances)}</Advances>`);
  parts.push(`    <Credits>${round(tc.credits)}</Credits>`);
  parts.push(`    <WithholdingCredits>${round(tc.withholdingCredits)}</WithholdingCredits>`);
  parts.push(`    <TotalCredits>${round(tc.totalCredits)}</TotalCredits>`);
  parts.push(`    <TaxDue>${round(tc.taxDue)}</TaxDue>`);
  parts.push('  </TaxComputation>');

  parts.push('</Form6111>');
  return parts.join('\n');
}

function capitalize(s) {
  return String(s || '').replace(/^./, c => c.toUpperCase());
}

/**
 * renderPdf — OPTIONAL PDF renderer. If pdfkit is available, emit a real
 * multi-page PDF. Otherwise return a plain-text equivalent so callers (and
 * tests) can still verify the content without a native dependency.
 */
function renderPdf(result, outPath) {
  let PDFDocument = null;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    PDFDocument = require('pdfkit');
  } catch (_) { /* pdfkit not installed — fall through */ }

  if (!PDFDocument) {
    const lines = [];
    lines.push(`Form 6111 — ${result.year}`);
    lines.push(`Company: ${result.company.legal_name} (${result.company.company_id})`);
    lines.push('');
    lines.push('Income Statement');
    const is = result.incomeStatement;
    lines.push(`  Revenues         ${is.revenues}`);
    lines.push(`  COGS             ${is.cogs}`);
    lines.push(`  Gross Profit     ${is.grossProfit}`);
    lines.push(`  Operating Exp.   ${is.operatingExpenses}`);
    lines.push(`  Operating Profit ${is.operatingProfit}`);
    lines.push(`  Financial (net)  ${is.financialNet}`);
    lines.push(`  Extraordinary    ${is.extraordinaryNet}`);
    lines.push(`  Book Profit      ${is.bookProfit}`);
    lines.push('');
    lines.push('Adjustments');
    for (const a of result.adjustments.list) {
      lines.push(`  ${a.rule.padEnd(18)} ${String(a.amount).padStart(12)}  ${a.explanation}`);
    }
    lines.push('');
    lines.push('Tax Computation');
    const tc = result.taxComputation;
    lines.push(`  Taxable Income   ${tc.taxableIncome}`);
    lines.push(`  Rate             ${tc.rate}`);
    lines.push(`  Corporate Tax    ${tc.corporateTax}`);
    lines.push(`  Total Credits    ${tc.totalCredits}`);
    lines.push(`  Tax Due          ${tc.taxDue}`);
    const text = lines.join('\n');
    if (outPath) {
      const fs = require('fs');
      fs.writeFileSync(outPath, text, 'utf8');
    }
    return { kind: 'text', content: text, path: outPath || null };
  }

  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  if (outPath) doc.pipe(fs.createWriteStream(outPath));
  doc.fontSize(18).text(`Form 6111 — ${result.year}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Company: ${result.company.legal_name}`);
  doc.text(`ID: ${result.company.company_id}`);
  doc.moveDown();
  doc.fontSize(14).text('Income Statement / דוח רווח והפסד');
  doc.fontSize(10);
  const is = result.incomeStatement;
  for (const [k, label] of [
    ['revenues',          'Revenues / הכנסות'],
    ['cogs',              'COGS / עלות המכירות'],
    ['grossProfit',       'Gross Profit / רווח גולמי'],
    ['operatingExpenses', 'Operating Expenses / הוצאות תפעוליות'],
    ['operatingProfit',   'Operating Profit / רווח תפעולי'],
    ['financialNet',      'Financial (net) / מימון נטו'],
    ['extraordinaryNet',  'Extraordinary / חד-פעמי'],
    ['bookProfit',        'Book Profit / רווח לפני מס'],
  ]) {
    doc.text(`${label}: ${is[k]}`);
  }
  doc.moveDown();
  doc.fontSize(14).text('Tax Adjustments / התאמות לצורכי מס');
  doc.fontSize(10);
  for (const a of result.adjustments.list) {
    doc.text(`${a.rule}: ${a.amount}  — ${a.explanation}`);
  }
  doc.moveDown();
  doc.fontSize(14).text('Tax Computation / חישוב המס');
  doc.fontSize(10);
  const tc = result.taxComputation;
  doc.text(`Taxable Income / הכנסה חייבת: ${tc.taxableIncome}`);
  doc.text(`Rate / שיעור: ${tc.rate}`);
  doc.text(`Corporate Tax / מס חברות: ${tc.corporateTax}`);
  doc.text(`Advances / מקדמות: ${tc.advances}`);
  doc.text(`Credits / זיכויים: ${tc.credits}`);
  doc.text(`Withholding / ניכויים במקור: ${tc.withholdingCredits}`);
  doc.text(`Tax Due / יתרה לתשלום: ${tc.taxDue}`);
  doc.end();
  return { kind: 'pdf', path: outPath || null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory — isolated engine (useful for tests that want clean state)
// ═══════════════════════════════════════════════════════════════════════════

function createEngine() {
  return {
    generate6111,
    mapCOAToForm6111,
    applyAdjustments,
    computeCorporateTax,
    renderJson,
    renderXml,
    renderPdf,
    COA_MAP,
    SECTION_CODES,
    ADJ_RULES,
    CONSTANTS_2026,
    TYPE_FALLBACK,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  generate6111,
  mapCOAToForm6111,
  applyAdjustments,
  computeCorporateTax,
  renderJson,
  renderXml,
  renderPdf,
  aggregateTrialBalance,
  COA_MAP,
  SECTION_CODES,
  ADJ_RULES,
  TYPE_FALLBACK,
  CONSTANTS_2026,
  createEngine,
  // Test-only internals
  _internals: { num, round, pct, findSection, xmlEscape, capitalize },
};
