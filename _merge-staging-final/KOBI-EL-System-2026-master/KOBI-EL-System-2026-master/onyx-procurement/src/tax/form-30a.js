/**
 * form-30a.js — Israeli self-employed quarterly advance payments
 *                (מקדמות של עצמאים) — טופס 30א ו-30ב
 * Agent Y-005 / Swarm Tax-Forms / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Quarterly advance-payment forms for Israeli self-employed individuals and
 * small businesses (עצמאים ותאגידים), filed with רשות המסים each quarter.
 *
 *   • טופס 30א — Regular quarterly advance (מקדמה) report.
 *                The taxpayer reports the period turnover (מחזור) and
 *                multiplies it by the advance-rate (אחוז מקדמות) set in the
 *                Tax Authority notice for the current year. That rate is
 *                derived from the PRIOR year's actual tax divided by the
 *                prior year's turnover.
 *
 *   • טופס 30ב — Adjusted quarterly advance. Used mid-year when current-year
 *                actuals diverge from the initial rate. The taxpayer proposes
 *                a revised rate based on current-year performance.
 *
 * Due date: the 15th day of the month AFTER the quarter ends —
 *             Q1 (Jan-Mar) → 15-Apr
 *             Q2 (Apr-Jun) → 15-Jul
 *             Q3 (Jul-Sep) → 15-Oct
 *             Q4 (Oct-Dec) → 15-Jan  (of the following year)
 *
 * Logic summary (per תקנות מס הכנסה — מקדמות, תשל"א-1971):
 *
 *     rate      = priorYearTax / priorYearRevenue        (decimal)
 *     base      = currentTurnover − eligibleDeductions
 *     advance   = round( base × rate , 2 )
 *     due date  = 15th day of month immediately following quarter close
 *
 * Never mutates inputs, never deletes data. Zero external dependencies.
 * Bilingual (HE + EN) — every label is exposed in both languages.
 *
 * Rule of the system (לא מוחקים רק משדרגים ומגדלים):
 *   - generate30a and generate30b are PURE — they return a NEW form object
 *     every call. Existing forms stored elsewhere are never touched.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *
 *   • generate30a({ taxpayer, priorYearTax, priorYearRevenue, quarter,
 *                   year, currentTurnover, adjustments })
 *       → { rate, base, advance, due, form }
 *
 *   • generate30b({ taxpayer, quarter, year,
 *                   actualRevenue, actualTaxEstimate, currentTurnover,
 *                   adjustments })
 *       → { rate, base, advance, due, form }
 *
 *   • computeAdvanceRate(priorYearTax, priorYearRevenue)   → number (decimal)
 *   • applyAdvanceToTurnover(rate, currentTurnover)        → number
 *   • dueDateFor(quarter, year)                            → ISO date string
 *   • quarterWindow(quarter, year)                         → { start, end }
 *   • FORM_LABELS                                          → bilingual labels
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Bilingual labels — HE + EN. Exposed so UI/PDF renderers share one source.
// ═══════════════════════════════════════════════════════════════════════════

const FORM_LABELS = Object.freeze({
  form_30a: {
    he: 'טופס 30א — מקדמות לעצמאי',
    en: 'Form 30A — Self-Employed Quarterly Advance',
  },
  form_30b: {
    he: 'טופס 30ב — מקדמות מתואמות',
    en: 'Form 30B — Adjusted Quarterly Advance',
  },
  taxpayer: {
    he: 'פרטי הנישום',
    en: 'Taxpayer Details',
  },
  tax_file_number: {
    he: 'מספר תיק במס הכנסה',
    en: 'Income Tax File Number',
  },
  id_number: {
    he: 'מספר תעודת זהות / ח.פ.',
    en: 'ID / Company Number',
  },
  legal_name: {
    he: 'שם הנישום',
    en: 'Legal Name',
  },
  quarter: {
    he: 'רבעון',
    en: 'Quarter',
  },
  year: {
    he: 'שנת המס',
    en: 'Tax Year',
  },
  prior_year_tax: {
    he: 'המס לפי הדוח השנתי האחרון',
    en: 'Tax from Last Annual Report',
  },
  prior_year_revenue: {
    he: 'המחזור לפי הדוח השנתי האחרון',
    en: 'Turnover from Last Annual Report',
  },
  advance_rate: {
    he: 'אחוז המקדמות',
    en: 'Advance Rate',
  },
  current_turnover: {
    he: 'מחזור לרבעון המדווח',
    en: 'Current Quarter Turnover',
  },
  deductions: {
    he: 'ניכויים וזיכויים',
    en: 'Deductions & Credits',
  },
  base_amount: {
    he: 'בסיס לחישוב המקדמה',
    en: 'Advance Calculation Base',
  },
  advance_due: {
    he: 'סכום המקדמה לתשלום',
    en: 'Advance Amount Due',
  },
  due_date: {
    he: 'תאריך יעד לתשלום',
    en: 'Due Date',
  },
  adjustment_reason: {
    he: 'נימוק לבקשת התאמה',
    en: 'Adjustment Justification',
  },
  adjusted_rate: {
    he: 'אחוז מקדמות מוצע',
    en: 'Proposed Advance Rate',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Round to 2 decimals without introducing floating-point drift.
 *   round2(123.456)  → 123.46
 *   round2(-0.005)   → -0.01
 */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  // EPSILON bump defeats classic "0.1 + 0.2 !== 0.3" drift on boundaries.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Validate quarter is one of 1..4. Throws on bad input — never silently
 * coerces, so callers get an immediate clear error.
 */
function assertQuarter(q) {
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw new Error(`Invalid quarter ${q}: must be integer 1..4`);
  }
  return n;
}

/**
 * Validate year is a 4-digit positive integer.
 */
function assertYear(y) {
  const n = Number(y);
  if (!Number.isInteger(n) || n < 1900 || n > 9999) {
    throw new Error(`Invalid year ${y}: must be integer between 1900..9999`);
  }
  return n;
}

/**
 * Sum a numeric list. Missing / non-finite values become 0.
 */
function sumSafe(values) {
  if (!Array.isArray(values)) return 0;
  let total = 0;
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * Normalize the optional `adjustments` argument into a flat
 * `{ deductions, credits, total }` bundle. Accepts:
 *   • undefined / null          → zeros
 *   • number                    → single deduction
 *   • array of numbers          → summed as deductions
 *   • { deductions, credits }   → object form with either a number or array
 */
function normalizeAdjustments(adjustments) {
  if (adjustments === undefined || adjustments === null) {
    return { deductions: 0, credits: 0, total: 0 };
  }
  if (typeof adjustments === 'number') {
    const d = Number.isFinite(adjustments) ? adjustments : 0;
    return { deductions: d, credits: 0, total: d };
  }
  if (Array.isArray(adjustments)) {
    const d = sumSafe(adjustments);
    return { deductions: d, credits: 0, total: d };
  }
  if (typeof adjustments === 'object') {
    const d = Array.isArray(adjustments.deductions)
      ? sumSafe(adjustments.deductions)
      : Number.isFinite(adjustments.deductions)
        ? Number(adjustments.deductions)
        : 0;
    const c = Array.isArray(adjustments.credits)
      ? sumSafe(adjustments.credits)
      : Number.isFinite(adjustments.credits)
        ? Number(adjustments.credits)
        : 0;
    return { deductions: d, credits: c, total: d + c };
  }
  return { deductions: 0, credits: 0, total: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public helpers — quarter dates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * quarterWindow(quarter, year) — start/end ISO dates (inclusive) for the
 * calendar quarter. Uses UTC so no local-timezone drift.
 *
 *   Q1 → 01-Jan .. 31-Mar
 *   Q2 → 01-Apr .. 30-Jun
 *   Q3 → 01-Jul .. 30-Sep
 *   Q4 → 01-Oct .. 31-Dec
 */
function quarterWindow(quarter, year) {
  const q = assertQuarter(quarter);
  const y = assertYear(year);
  const startMonth = (q - 1) * 3;                        // 0, 3, 6, 9
  const endMonth   = startMonth + 2;                     // 2, 5, 8, 11
  const start      = new Date(Date.UTC(y, startMonth, 1));
  // Day-0 of next month = last day of current month.
  const end        = new Date(Date.UTC(y, endMonth + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

/**
 * dueDateFor(quarter, year) — the 15th of the month following the quarter.
 *
 *   Q1 2026 → 2026-04-15
 *   Q2 2026 → 2026-07-15
 *   Q3 2026 → 2026-10-15
 *   Q4 2026 → 2027-01-15    (rolls into next calendar year)
 */
function dueDateFor(quarter, year) {
  const q = assertQuarter(quarter);
  const y = assertYear(year);
  if (q === 4) {
    return `${y + 1}-01-15`;
  }
  const month = q * 3 + 1;                                // 4, 7, 10
  const mm    = String(month).padStart(2, '0');
  return `${y}-${mm}-15`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public helpers — rate math
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeAdvanceRate(priorYearTax, priorYearRevenue)
 *
 * Derive the advance-rate notified by רשות המסים. That notice is:
 *
 *     rate = totalTaxFromLastAnnualReturn / totalRevenueFromLastAnnualReturn
 *
 * Returned as a decimal (0.073 = 7.3%). Floored at 0, capped at 1
 * (i.e. no negative rates, no rates above 100% — the Tax Authority notice
 * likewise caps). Non-finite / zero-revenue inputs return 0.
 */
function computeAdvanceRate(priorYearTax, priorYearRevenue) {
  const tax = Number(priorYearTax);
  const rev = Number(priorYearRevenue);
  if (!Number.isFinite(tax) || !Number.isFinite(rev)) return 0;
  if (rev <= 0) return 0;
  const rawRate = tax / rev;
  if (rawRate <= 0) return 0;
  if (rawRate >= 1) return 1;
  // Preserve full precision — callers may round for display only.
  return rawRate;
}

/**
 * applyAdvanceToTurnover(rate, currentTurnover)
 *
 * Multiply a (decimal) advance-rate by the reported current-period
 * turnover. Returned value rounded to 2 decimals (shekels+agorot).
 * Negative turnover / negative rate return 0 — never issue a refund
 * via this function (refunds go through annual reconciliation).
 */
function applyAdvanceToTurnover(rate, currentTurnover) {
  const r = Number(rate);
  const t = Number(currentTurnover);
  if (!Number.isFinite(r) || !Number.isFinite(t)) return 0;
  if (r <= 0 || t <= 0) return 0;
  return round2(r * t);
}

// ═══════════════════════════════════════════════════════════════════════════
// Taxpayer validation — keeps a bad payload from reaching downstream PDF/XML
// ═══════════════════════════════════════════════════════════════════════════

function normalizeTaxpayer(taxpayer) {
  if (!taxpayer || typeof taxpayer !== 'object') {
    throw new Error('taxpayer is required (object with tax_file_number, id_number, legal_name)');
  }
  const tfn  = (taxpayer.tax_file_number || '').toString().trim();
  const idn  = (taxpayer.id_number || taxpayer.company_id || '').toString().trim();
  const name = (taxpayer.legal_name || taxpayer.name || '').toString().trim();
  if (!tfn)  throw new Error('taxpayer.tax_file_number is required');
  if (!idn)  throw new Error('taxpayer.id_number (or company_id) is required');
  if (!name) throw new Error('taxpayer.legal_name (or name) is required');
  return {
    tax_file_number: tfn,
    id_number:       idn,
    legal_name:      name,
    address:         taxpayer.address || null,
    phone:           taxpayer.phone   || null,
    email:           taxpayer.email   || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// generate30a — regular quarterly advance (מקדמה שוטפת)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate30a({
 *   taxpayer:          { tax_file_number, id_number, legal_name, … },
 *   priorYearTax:      number,        // total tax from last annual return
 *   priorYearRevenue:  number,        // total turnover from last annual return
 *   quarter:           1|2|3|4,
 *   year:              number,        // tax year (default: current UTC year)
 *   currentTurnover:   number,        // turnover for the reported quarter
 *   adjustments?:      number|array|{deductions,credits},
 * })
 *
 * Returns:
 *   {
 *     rate:     number,   // decimal advance-rate from Tax Authority notice
 *     base:     number,   // base amount after deductions/credits
 *     advance:  number,   // amount payable this quarter
 *     due:      string,   // ISO due date (15th of month after quarter)
 *     form:     {...}     // fully serialized form payload (bilingual)
 *   }
 */
function generate30a(params) {
  const {
    taxpayer,
    priorYearTax,
    priorYearRevenue,
    quarter,
    year = new Date().getUTCFullYear(),
    currentTurnover,
    adjustments,
  } = params || {};

  const person = normalizeTaxpayer(taxpayer);
  const q      = assertQuarter(quarter);
  const y      = assertYear(year);

  if (!Number.isFinite(Number(currentTurnover)) || Number(currentTurnover) < 0) {
    throw new Error('currentTurnover must be a non-negative number');
  }
  if (!Number.isFinite(Number(priorYearTax)) || Number(priorYearTax) < 0) {
    throw new Error('priorYearTax must be a non-negative number');
  }
  if (!Number.isFinite(Number(priorYearRevenue)) || Number(priorYearRevenue) < 0) {
    throw new Error('priorYearRevenue must be a non-negative number');
  }

  const rate  = computeAdvanceRate(priorYearTax, priorYearRevenue);
  const adj   = normalizeAdjustments(adjustments);
  const base  = Math.max(0, round2(Number(currentTurnover) - adj.deductions));
  // Credits directly reduce the *advance* after the base is multiplied —
  // matching the Tax Authority booklet worksheet.
  const grossAdvance = applyAdvanceToTurnover(rate, base);
  const advance      = round2(Math.max(0, grossAdvance - adj.credits));
  const due          = dueDateFor(q, y);
  const window       = quarterWindow(q, y);

  const form = {
    formType: '30a',
    formLabel: { ...FORM_LABELS.form_30a },
    formVersion: String(y),
    preparedAt: new Date().toISOString(),

    // Section 1 — taxpayer
    taxpayer: { ...person },

    // Section 2 — reporting period
    period: {
      quarter: q,
      year:    y,
      start:   window.start,
      end:     window.end,
      dueDate: due,
    },

    // Section 3 — rate derivation (from Tax Authority notice)
    rateSource: {
      priorYearTax:     round2(Number(priorYearTax)),
      priorYearRevenue: round2(Number(priorYearRevenue)),
      ratePercent:      round2(rate * 100),  // display-friendly percent
      rateDecimal:      rate,
      formula: 'priorYearTax / priorYearRevenue',
      notes_he: 'אחוז המקדמות לפי הודעת רשות המסים, מבוסס על הדוח השנתי האחרון',
      notes_en: 'Advance rate from Tax Authority notice, based on last annual return',
    },

    // Section 4 — calculation
    calculation: {
      currentTurnover: round2(Number(currentTurnover)),
      deductions:      round2(adj.deductions),
      credits:         round2(adj.credits),
      base:            base,
      grossAdvance:    grossAdvance,
      advance:         advance,
    },

    // Section 5 — submission metadata
    submission: {
      dueDate: due,
      channel: 'online', // רשות המסים portal / שע"מ
      status:  'draft',
    },
  };

  return { rate, base, advance, due, form };
}

// ═══════════════════════════════════════════════════════════════════════════
// generate30b — adjusted advance (מקדמה מתואמת) based on current-year actuals
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate30b({
 *   taxpayer,
 *   quarter, year,
 *   actualRevenue,     // current-year realized revenue (YTD)
 *   actualTaxEstimate, // current-year estimated tax on that revenue
 *   currentTurnover,   // quarter turnover being paid on
 *   adjustments?,
 *   reason?            // string — justification captured on the form
 * })
 *
 * The difference from 30A: the rate is NOT taken from the Tax Authority
 * notice. Instead, the self-employed computes a PROPOSED rate from the
 * current year's own actuals:
 *
 *     rate = actualTaxEstimate / actualRevenue
 *
 * then applies that rate to the current turnover. The form records the
 * reason for the adjustment so רשות המסים can review it.
 */
function generate30b(params) {
  const {
    taxpayer,
    quarter,
    year = new Date().getUTCFullYear(),
    actualRevenue,
    actualTaxEstimate,
    currentTurnover,
    adjustments,
    reason,
  } = params || {};

  const person = normalizeTaxpayer(taxpayer);
  const q      = assertQuarter(quarter);
  const y      = assertYear(year);

  if (!Number.isFinite(Number(actualRevenue)) || Number(actualRevenue) < 0) {
    throw new Error('actualRevenue must be a non-negative number');
  }
  if (!Number.isFinite(Number(actualTaxEstimate)) || Number(actualTaxEstimate) < 0) {
    throw new Error('actualTaxEstimate must be a non-negative number');
  }
  if (!Number.isFinite(Number(currentTurnover)) || Number(currentTurnover) < 0) {
    throw new Error('currentTurnover must be a non-negative number');
  }

  // Proposed rate — same formula, different inputs.
  const rate = computeAdvanceRate(actualTaxEstimate, actualRevenue);
  const adj  = normalizeAdjustments(adjustments);
  const base = Math.max(0, round2(Number(currentTurnover) - adj.deductions));
  const grossAdvance = applyAdvanceToTurnover(rate, base);
  const advance      = round2(Math.max(0, grossAdvance - adj.credits));
  const due          = dueDateFor(q, y);
  const window       = quarterWindow(q, y);

  const form = {
    formType: '30b',
    formLabel: { ...FORM_LABELS.form_30b },
    formVersion: String(y),
    preparedAt: new Date().toISOString(),

    taxpayer: { ...person },

    period: {
      quarter: q,
      year:    y,
      start:   window.start,
      end:     window.end,
      dueDate: due,
    },

    rateSource: {
      actualRevenue:     round2(Number(actualRevenue)),
      actualTaxEstimate: round2(Number(actualTaxEstimate)),
      ratePercent:       round2(rate * 100),
      rateDecimal:       rate,
      formula: 'actualTaxEstimate / actualRevenue',
      notes_he: 'בקשה לתיאום אחוז המקדמות על בסיס ביצועי השנה השוטפת',
      notes_en: 'Request to adjust advance rate based on current-year actuals',
    },

    adjustment: {
      basis:  'current_year_actuals',
      reason: reason ? String(reason) : null,
    },

    calculation: {
      currentTurnover: round2(Number(currentTurnover)),
      deductions:      round2(adj.deductions),
      credits:         round2(adj.credits),
      base:            base,
      grossAdvance:    grossAdvance,
      advance:         advance,
    },

    submission: {
      dueDate: due,
      channel: 'online',
      status:  'draft',
    },
  };

  return { rate, base, advance, due, form };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports — CommonJS, zero external deps
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // primary generators
  generate30a,
  generate30b,
  // helpers (public for reuse + tests)
  computeAdvanceRate,
  applyAdvanceToTurnover,
  dueDateFor,
  quarterWindow,
  // constants
  FORM_LABELS,
};
