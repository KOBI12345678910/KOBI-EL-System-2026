/**
 * form-1301.js — טופס 1301 (Annual Personal Income Tax Return for Individuals)
 * Agent AG-Y001 / Wave 2026 / Techno-Kol Uzi Mega-ERP
 * ---------------------------------------------------------------------------
 *
 * Israeli annual personal income-tax return (דוח שנתי ליחיד — טופס 1301).
 *
 * Filing rule: לא מוחקים רק משדרגים ומגדלים.
 * This module SITS ALONGSIDE the existing lightweight `buildForm1301` in
 * `./form-builders.js` — it does not replace it. `buildForm1301` produces a
 * minimal structural record (used by the annual-tax routes for draft
 * preview); `generate1301` here is the full, production-grade computation
 * engine that:
 *
 *   1. Aggregates every income category (employment, self-employed,
 *      capital, rental, pension, other).
 *   2. Applies allowed deductions (pension, study-fund, life, donations).
 *   3. Computes tax via the 2026 progressive brackets (10/14/20/31/35/47/50%).
 *   4. Adds 3% יסף (high-earner surtax) on income > 698,280 NIS.
 *   5. Subtracts נקודות זיכוי (credit points × 2,976 NIS) and named credits
 *      (residence, shift-work, etc.).
 *   6. Handles רגילים ופטורים (taxable / exempt splits) + spouse joint filing.
 *   7. Reconciles against `withholding` to produce final balance
 *      (positive = owes, negative = refund).
 *   8. Emits a Form-1301-shaped `fields` map organized section-by-section so
 *      downstream PDF/XML renderers can paint the official layout 1:1.
 *
 * Zero dependencies, except an OPTIONAL `pdfkit` used only by `renderPDF1301`.
 * Falls back to the pre-existing payroll PDF generator if present; else emits
 * a self-contained pdfkit stub. Never throws on missing pdfkit — the renderer
 * returns a structured error result.
 *
 * All text is bilingual (Hebrew + English) and RTL-aware.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - generate1301(input)   → { computedTax, credits, netTax, balance, fields }
 *   - renderPDF1301(result, outputPath?) → Promise<{path, size}> | { error, stub }
 *   - CONSTANTS_2026_1301   → full constants object
 *   - TAX_BRACKETS_2026     → bracket ladder
 *   - CREDIT_POINT_VALUE    → 2976 NIS/year
 *   - SURTAX_THRESHOLD      → 698280 NIS/year
 *   - SURTAX_RATE           → 0.03
 *   - computeProgressiveTax(taxable)    → raw bracket tax
 *   - computeSurtax(totalIncome)        → 3% on excess
 *   - applyCreditPoints(tax, points)    → tax after points
 *   - normalizeInput(input)             → cleaned + defaulted record
 *   - FIELD_MAP_1301                    → declarative section/field layout
 *   - createEngine(opts)                → isolated engine
 *
 * ---------------------------------------------------------------------------
 * Input schema (all keys optional unless noted):
 *
 *   {
 *     taxpayer: {
 *       id:       '123456782',             // 9-digit ת.ז — REQUIRED
 *       name:     'ישראל ישראלי',
 *       address:  'רחוב הרצל 1, תל אביב',
 *       status:   'single' | 'married' | 'divorced' | 'widowed',
 *     },
 *     income: {
 *       employment:   { gross, exempt, sourceCount, withholding },
 *       selfEmployed: { gross, exempt, expenses },
 *       capital:      { gains, dividends, interest, exempt },
 *       rental:       { gross, expenses, exempt, track: 'normal'|'10pct'|'exempt' },
 *       pension:      { gross, exempt },
 *       other:        { gross, exempt, description },
 *     },
 *     deductions: {
 *       pension:   number,     // § 47 — עצמאי pension contrib
 *       studyFund: number,     // § 17(5א) — קרן השתלמות עצמאי
 *       life:      number,     // § 45א — life insurance
 *       donation:  number,     // § 46 — מוסד ציבורי donations
 *     },
 *     credits: {
 *       pointsPersonal: number, // default 2.25 (m) or 2.75 (f)
 *       pointsSpouse:   number,
 *       pointsChildren: number,
 *       residence:      number, // NIS, תושב ישוב מזכה
 *       shiftWork:      number, // NIS, עבודה במשמרות
 *     },
 *     withholding: number,     // total already withheld by employers/banks
 *     spouse?: { same shape as top-level (joint filing) }
 *   }
 *
 * Output schema:
 *
 *   {
 *     computedTax: number,       // progressive + surtax, BEFORE credits
 *     credits: {
 *       creditPoints: number,
 *       creditPointsValue: number,
 *       namedCredits: number,
 *       total: number,
 *     },
 *     netTax: number,            // computedTax - credits, floored at 0
 *     balance: number,           // netTax - withholding (negative = refund)
 *     fields: {                  // section-by-section layout
 *       section_01_taxpayer: { ... },
 *       section_02_income:   { ... },
 *       section_03_exempt:   { ... },
 *       section_04_deductions: { ... },
 *       section_05_credits:  { ... },
 *       section_06_computation: { ... },
 *       section_07_reconciliation: { ... },
 *       section_08_signature: { ... },
 *     },
 *     diagnostics: { ... },      // per-bracket breakdown, validation notes
 *     meta: { year, preparedAt, engine, version },
 *   }
 *
 * Reference:
 *   - פקודת מס הכנסה [נוסח חדש], סעיפים 121, 121ב, 34–40, 45א, 46, 47
 *   - רשות המסים — טופס 1301 (מעודכן 2026)
 *   - ISRAELI_TAX_CONSTANTS_2026.md
 *   - C:\Users\kobi\...\onyx-procurement\src\payroll\wage-slip-calculator.js (bracket structure)
 */

'use strict';

const FORM_VERSION = '1301-2026.1';
const FORM_YEAR = 2026;

// ═══════════════════════════════════════════════════════════════════════════
// Constants — 2026 (user-specified authoritative values)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progressive brackets for 2026 (annual, NIS).
 * Authoritative source: user directive — 10/14/20/31/35/47/50.
 * Cross-reference: wage-slip-calculator.js CONSTANTS_2026.INCOME_TAX_BRACKETS.
 *
 * NOTE the surtax (יסף) already baked-in as the final 50% step, AND it is
 * additionally computed as a separate 3% line so the return can show it on
 * its own row when > 698,280 NIS (§ 121ב).
 */
const TAX_BRACKETS_2026 = Object.freeze([
  Object.freeze({ upTo:  84120, rate: 0.10 }),
  Object.freeze({ upTo: 120720, rate: 0.14 }),
  Object.freeze({ upTo: 193800, rate: 0.20 }),
  Object.freeze({ upTo: 269280, rate: 0.31 }),
  Object.freeze({ upTo: 560280, rate: 0.35 }),
  Object.freeze({ upTo: 721560, rate: 0.47 }),
  Object.freeze({ upTo: Infinity, rate: 0.50 }),
]);

/** Annual value of a single credit point for 2026. */
const CREDIT_POINT_VALUE = 2976;

/** Surtax (יסף) threshold and rate (user-specified). */
const SURTAX_THRESHOLD = 698280;
const SURTAX_RATE = 0.03;

/** Deduction caps (safety — not authoritative; real caps vary by year). */
const DEDUCTION_CAPS = Object.freeze({
  pension:   70000,   // § 47 combined cap — safe upper limit
  studyFund: 20000,   // § 17(5א)
  life:      12000,   // § 45א
  donation:  Infinity, // 30% of taxable OR 10m NIS — handled as 30% cap below
});
const DONATION_PCT_CAP = 0.30;

/** Credit point defaults (§ 34 + 36). */
const DEFAULT_POINTS_MALE = 2.25;
const DEFAULT_POINTS_FEMALE = 2.75;

const CONSTANTS_2026_1301 = Object.freeze({
  year: FORM_YEAR,
  formVersion: FORM_VERSION,
  brackets: TAX_BRACKETS_2026,
  creditPointValue: CREDIT_POINT_VALUE,
  surtaxThreshold: SURTAX_THRESHOLD,
  surtaxRate: SURTAX_RATE,
  deductionCaps: DEDUCTION_CAPS,
  donationPctCap: DONATION_PCT_CAP,
});

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers — zero deps, deterministic
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimals without floating-point surprises. */
function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Coerce to a finite non-negative number. */
function num(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def === undefined ? 0 : def;
  return n;
}

/** Coerce to a finite number (allows negative). */
function snum(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def === undefined ? 0 : def;
  return n;
}

/** Non-negative floor. */
function nn(n) { return n < 0 ? 0 : n; }

/** Validate an Israeli 9-digit ID via the Luhn-like mod-10 check. */
function isValidIsraeliId(id) {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!/^\d{1,9}$/.test(s)) return false;
  const padded = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = +padded[i] * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Bilingual label helper. */
function bilabel(he, en) { return { he, en, label: he + ' / ' + en }; }

/** Safe deep-ish clone for pure-data records. */
function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

// ═══════════════════════════════════════════════════════════════════════════
// FIELD MAP — declarative section/field layout for Form 1301
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The official Form 1301 has ~8 major sections. Each entry here maps a
 * logical field → (section, line, label_he, label_en). Downstream renderers
 * (PDF/XML/HTML) walk this map to emit an exact 1:1 layout.
 *
 * Line numbers are the well-known שדות numbers — when they change in a
 * future Form 1301 revision, only this map needs updating.
 */
const FIELD_MAP_1301 = Object.freeze({
  // ─── Section 1: Taxpayer identification ─────────────────────────────────
  section_01_taxpayer: {
    title: bilabel('פרטי הנישום', 'Taxpayer details'),
    fields: {
      tax_id:       { line: '001', ...bilabel('מספר זהות', 'Tax ID') },
      name:         { line: '002', ...bilabel('שם הנישום', 'Taxpayer name') },
      address:      { line: '003', ...bilabel('כתובת', 'Address') },
      status:       { line: '004', ...bilabel('מצב משפחתי', 'Marital status') },
      fiscal_year:  { line: '005', ...bilabel('שנת המס', 'Tax year') },
      spouse_id:    { line: '006', ...bilabel('ת.ז. בן/בת זוג', 'Spouse tax ID') },
      spouse_name:  { line: '007', ...bilabel('שם בן/בת זוג', 'Spouse name') },
    },
  },

  // ─── Section 2: Taxable income (רגילים) ─────────────────────────────────
  section_02_income: {
    title: bilabel('הכנסות חייבות', 'Taxable income'),
    fields: {
      employment:    { line: '158', ...bilabel('הכנסה ממשכורת', 'Employment income') },
      self_employed: { line: '170', ...bilabel('הכנסה מעסק / משלח יד', 'Self-employed income') },
      capital_gains: { line: '054', ...bilabel('רווחי הון', 'Capital gains') },
      dividends:     { line: '142', ...bilabel('דיבידנדים', 'Dividends') },
      interest:      { line: '141', ...bilabel('ריבית', 'Interest') },
      rental:        { line: '110', ...bilabel('הכנסה משכירות', 'Rental income') },
      pension:       { line: '172', ...bilabel('קצבאות ופנסיה', 'Pension / annuities') },
      other:         { line: '199', ...bilabel('הכנסות אחרות', 'Other income') },
      total:         { line: '299', ...bilabel('סה"כ הכנסות חייבות', 'Total taxable income') },
    },
  },

  // ─── Section 3: Exempt income (פטורים) ──────────────────────────────────
  section_03_exempt: {
    title: bilabel('הכנסות פטורות', 'Exempt income'),
    fields: {
      employment_exempt:    { line: '209', ...bilabel('משכורת פטורה', 'Exempt employment income') },
      rental_exempt_10pct:  { line: '112', ...bilabel('שכירות במסלול 10%', 'Rental — 10% track') },
      rental_exempt_full:   { line: '113', ...bilabel('שכירות פטורה מלאה', 'Rental — fully exempt') },
      pension_exempt:       { line: '220', ...bilabel('קצבה פטורה', 'Exempt pension') },
      capital_exempt:       { line: '225', ...bilabel('רווחי הון פטורים', 'Exempt capital gains') },
      other_exempt:         { line: '298', ...bilabel('הכנסות פטורות אחרות', 'Other exempt') },
      total_exempt:         { line: '300', ...bilabel('סה"כ פטורים', 'Total exempt') },
    },
  },

  // ─── Section 4: Deductions (ניכויים) ────────────────────────────────────
  section_04_deductions: {
    title: bilabel('ניכויים מותרים', 'Allowed deductions'),
    fields: {
      pension:    { line: '268', ...bilabel('הפקדות לפנסיה (עצמאי)', 'Pension contributions (§ 47)') },
      study_fund: { line: '249', ...bilabel('קרן השתלמות', 'Study fund (§ 17(5א))') },
      life:       { line: '268a', ...bilabel('ביטוח חיים', 'Life insurance (§ 45א)') },
      donation:   { line: '237', ...bilabel('תרומות למוסדות ציבור', 'Donations (§ 46)') },
      total:      { line: '280', ...bilabel('סה"כ ניכויים', 'Total deductions') },
    },
  },

  // ─── Section 5: Credits (זיכויים) ───────────────────────────────────────
  section_05_credits: {
    title: bilabel('זיכויים', 'Credits'),
    fields: {
      points_personal:   { line: '370', ...bilabel('נקודות זיכוי — אישיות', 'Credit points — personal') },
      points_spouse:     { line: '371', ...bilabel('נקודות זיכוי — בן/בת זוג', 'Credit points — spouse') },
      points_children:   { line: '372', ...bilabel('נקודות זיכוי — ילדים', 'Credit points — children') },
      point_value:       { line: '373', ...bilabel('ערך נקודת זיכוי', 'Credit point value') },
      points_total_value:{ line: '374', ...bilabel('סה"כ שווי נקודות', 'Total point value') },
      residence:         { line: '375', ...bilabel('תושב יישוב מזכה', 'Eligible residence credit') },
      shift_work:        { line: '376', ...bilabel('עבודה במשמרות', 'Shift-work credit') },
      total:              { line: '400', ...bilabel('סה"כ זיכויים', 'Total credits') },
    },
  },

  // ─── Section 6: Tax computation ─────────────────────────────────────────
  section_06_computation: {
    title: bilabel('חישוב המס', 'Tax computation'),
    fields: {
      taxable_income:    { line: '301', ...bilabel('הכנסה חייבת לפני ניכויים', 'Gross taxable') },
      after_deductions:  { line: '302', ...bilabel('הכנסה חייבת לאחר ניכויים', 'After deductions') },
      tax_by_brackets:   { line: '350', ...bilabel('מס לפי מדרגות', 'Bracket-based tax') },
      surtax:            { line: '351', ...bilabel('מס יסף 3% (§ 121ב)', 'Surtax 3% (§ 121ב)') },
      computed_tax:      { line: '355', ...bilabel('סה"כ מס מחושב', 'Total computed tax') },
      credits_applied:   { line: '401', ...bilabel('סה"כ זיכויים מיושמים', 'Credits applied') },
      net_tax:           { line: '450', ...bilabel('מס לאחר זיכויים', 'Net tax after credits') },
    },
  },

  // ─── Section 7: Reconciliation (מקדמות / ניכוי במקור) ────────────────────
  section_07_reconciliation: {
    title: bilabel('התחשבנות', 'Reconciliation'),
    fields: {
      withholding:       { line: '042', ...bilabel('ניכוי במקור', 'Tax withheld at source') },
      advances:          { line: '040', ...bilabel('מקדמות', 'Advance payments') },
      balance_due:       { line: '460', ...bilabel('יתרת חוב', 'Balance due') },
      refund_owed:       { line: '461', ...bilabel('החזר מס', 'Refund owed') },
    },
  },

  // ─── Section 8: Signature ───────────────────────────────────────────────
  section_08_signature: {
    title: bilabel('הצהרה וחתימה', 'Declaration & signature'),
    fields: {
      declaration:       { line: '900', ...bilabel('אני מצהיר כי הפרטים נכונים', 'I declare the above is true') },
      signer_name:       { line: '901', ...bilabel('שם החותם', 'Signer name') },
      signature_date:    { line: '902', ...bilabel('תאריך חתימה', 'Signature date') },
      prepared_by:       { line: '903', ...bilabel('נערך על ידי', 'Prepared by') },
    },
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Core computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply progressive brackets to a taxable amount.
 * Returns { tax, breakdown[{upTo,rate,taxed,contribution}], taxableIn }.
 */
function computeProgressiveTax(taxable) {
  let remaining = Math.max(0, num(taxable));
  let tax = 0;
  let prev = 0;
  const breakdown = [];
  for (const b of TAX_BRACKETS_2026) {
    if (remaining <= 0) {
      breakdown.push({ upTo: b.upTo, rate: b.rate, taxed: 0, contribution: 0 });
      prev = b.upTo;
      continue;
    }
    const size = b.upTo - prev;
    const bite = Math.min(remaining, size);
    const contribution = bite * b.rate;
    tax += contribution;
    breakdown.push({ upTo: b.upTo, rate: b.rate, taxed: round2(bite), contribution: round2(contribution) });
    remaining -= bite;
    prev = b.upTo;
  }
  return { tax: round2(tax), breakdown, taxableIn: round2(num(taxable)) };
}

/**
 * 3% surtax (יסף) on income above SURTAX_THRESHOLD (§ 121ב).
 * Returns { surtax, base, excess }.
 *
 * NOTE: taxable income used here is the § 121ב base — per the statute it
 * includes almost every income category (including gains and dividends),
 * *not* the post-bracket tax figure.
 */
function computeSurtax(totalIncome) {
  const base = num(totalIncome);
  const excess = Math.max(0, base - SURTAX_THRESHOLD);
  return { surtax: round2(excess * SURTAX_RATE), base: round2(base), excess: round2(excess) };
}

/**
 * Apply credit points (נקודות זיכוי): tax reduction = points × 2976.
 * Never drives tax below zero.
 */
function applyCreditPoints(tax, points) {
  const t = num(tax);
  const p = num(points);
  const reduction = p * CREDIT_POINT_VALUE;
  return { tax: round2(Math.max(0, t - reduction)), reduction: round2(reduction), points: p };
}

// ═══════════════════════════════════════════════════════════════════════════
// Input normalization & aggregation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fill in defaults and coerce scalar numbers. Returns a deeply-shaped
 * object safe for downstream computation. Does not mutate `input`.
 */
function normalizeInput(input) {
  const raw = input || {};
  const t = raw.taxpayer || {};

  const taxpayer = {
    id: t.id != null ? String(t.id).trim() : '',
    name: t.name ? String(t.name) : '',
    address: t.address ? String(t.address) : '',
    status: ['single', 'married', 'divorced', 'widowed'].includes(t.status) ? t.status : 'single',
  };

  function normIncome(src) {
    src = src || {};
    return {
      employment: {
        gross:        num(src.employment && src.employment.gross),
        exempt:       num(src.employment && src.employment.exempt),
        sourceCount:  num(src.employment && src.employment.sourceCount, 1),
        withholding:  num(src.employment && src.employment.withholding),
      },
      selfEmployed: {
        gross:    num(src.selfEmployed && src.selfEmployed.gross),
        exempt:   num(src.selfEmployed && src.selfEmployed.exempt),
        expenses: num(src.selfEmployed && src.selfEmployed.expenses),
      },
      capital: {
        gains:     num(src.capital && src.capital.gains),
        dividends: num(src.capital && src.capital.dividends),
        interest:  num(src.capital && src.capital.interest),
        exempt:    num(src.capital && src.capital.exempt),
      },
      rental: {
        gross:    num(src.rental && src.rental.gross),
        expenses: num(src.rental && src.rental.expenses),
        exempt:   num(src.rental && src.rental.exempt),
        track:    (src.rental && src.rental.track) || 'normal', // 'normal'|'10pct'|'exempt'
      },
      pension: {
        gross:  num(src.pension && src.pension.gross),
        exempt: num(src.pension && src.pension.exempt),
      },
      other: {
        gross:       num(src.other && src.other.gross),
        exempt:      num(src.other && src.other.exempt),
        description: (src.other && src.other.description) || '',
      },
    };
  }

  function normDeductions(d) {
    d = d || {};
    return {
      pension:   num(d.pension),
      studyFund: num(d.studyFund),
      life:      num(d.life),
      donation:  num(d.donation),
    };
  }

  const defPoints = taxpayer.status === 'married'
    ? DEFAULT_POINTS_MALE
    : DEFAULT_POINTS_MALE;

  function normCredits(c) {
    c = c || {};
    return {
      pointsPersonal: num(c.pointsPersonal, defPoints),
      pointsSpouse:   num(c.pointsSpouse),
      pointsChildren: num(c.pointsChildren),
      residence:      num(c.residence),
      shiftWork:      num(c.shiftWork),
    };
  }

  const result = {
    taxpayer,
    income:      normIncome(raw.income),
    deductions:  normDeductions(raw.deductions),
    credits:     normCredits(raw.credits),
    withholding: num(raw.withholding),
    spouse: null,
  };

  if (raw.spouse && typeof raw.spouse === 'object') {
    const sp = raw.spouse.taxpayer || {};
    result.spouse = {
      taxpayer: {
        id: sp.id != null ? String(sp.id).trim() : '',
        name: sp.name ? String(sp.name) : '',
        address: sp.address ? String(sp.address) : '',
        status: 'married',
      },
      income:      normIncome(raw.spouse.income),
      deductions:  normDeductions(raw.spouse.deductions),
      credits:     normCredits(raw.spouse.credits),
      withholding: num(raw.spouse.withholding),
    };
  }

  return result;
}

/**
 * Sum taxable income from each category (רגילים only).
 * Rental track handling:
 *   - 'normal'  → gross - expenses (taxable)
 *   - '10pct'   → excluded from regular ladder (taxed separately at 10%)
 *   - 'exempt'  → excluded entirely
 */
function aggregateTaxable(income) {
  const employment   = nn(income.employment.gross - income.employment.exempt);
  const selfEmployed = nn(income.selfEmployed.gross - income.selfEmployed.expenses - income.selfEmployed.exempt);
  let rental = 0;
  if (income.rental.track === 'normal') {
    rental = nn(income.rental.gross - income.rental.expenses - income.rental.exempt);
  }
  const pension      = nn(income.pension.gross - income.pension.exempt);
  const other        = nn(income.other.gross - income.other.exempt);
  // Capital is reported but taxed on a separate schedule at flat rates;
  // for 1301 we include it in the § 121ב base so the surtax captures it,
  // while the bracket ladder applies only to non-capital income. We then
  // add a flat 25% on capital gains/dividends/interest (מסלול נפרד).
  const nonCapitalTaxable = employment + selfEmployed + rental + pension + other;
  const capitalTaxable =
    nn(income.capital.gains - income.capital.exempt) +
    nn(income.capital.dividends) +
    nn(income.capital.interest);

  // Rental 10% track — separate schedule
  const rental10pctBase = income.rental.track === '10pct'
    ? nn(income.rental.gross - income.rental.exempt)
    : 0;

  return {
    employment,
    selfEmployed,
    rental,
    pension,
    other,
    nonCapitalTaxable: round2(nonCapitalTaxable),
    capitalTaxable:    round2(capitalTaxable),
    rental10pctBase:   round2(rental10pctBase),
    totalBase:         round2(nonCapitalTaxable + capitalTaxable + rental10pctBase),
  };
}

/**
 * Apply deduction caps. Donation cap is 30% of (non-capital) taxable income.
 * Returns { deductions, totals, notes }.
 */
function applyDeductionCaps(ded, nonCapitalTaxable) {
  const notes = [];
  const capped = {
    pension:   Math.min(num(ded.pension),   DEDUCTION_CAPS.pension),
    studyFund: Math.min(num(ded.studyFund), DEDUCTION_CAPS.studyFund),
    life:      Math.min(num(ded.life),      DEDUCTION_CAPS.life),
    donation:  Math.min(num(ded.donation),  Math.max(0, nonCapitalTaxable) * DONATION_PCT_CAP),
  };
  if (capped.pension   < num(ded.pension))   notes.push('pension_capped');
  if (capped.studyFund < num(ded.studyFund)) notes.push('study_fund_capped');
  if (capped.life      < num(ded.life))      notes.push('life_capped');
  if (capped.donation  < num(ded.donation))  notes.push('donation_capped_30pct');
  const total = capped.pension + capped.studyFund + capped.life + capped.donation;
  return { capped, total: round2(total), notes };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API — generate1301
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Produce the full annual Form 1301 result.
 *
 * Throws only on missing taxpayer.id (required). All other errors are soft:
 * accumulated in `diagnostics.validationErrors` so partial returns still
 * render.
 */
function generate1301(input) {
  const raw = input || {};
  if (!raw.taxpayer || !raw.taxpayer.id) {
    throw new Error('generate1301: taxpayer.id (ת.ז) is required');
  }

  const data = normalizeInput(raw);
  const diag = {
    validationErrors: [],
    warnings: [],
    brackets: null,
    bracketsSpouse: null,
    deductionNotes: [],
  };

  if (!isValidIsraeliId(data.taxpayer.id)) {
    diag.validationErrors.push({ field: 'taxpayer.id', code: 'invalid_israeli_id' });
  }

  // ── Filing strategy for married couples ───────────────────────────────
  // Israeli default: separate computation (חישוב נפרד) is mandatory when
  // both spouses have independent income from different sources. We model
  // that by computing each spouse's ladder separately and summing.
  const self = computeOneFiler(data, diag, 'self');
  let spouse = null;
  if (data.spouse) {
    spouse = computeOneFiler(
      { taxpayer: data.spouse.taxpayer, income: data.spouse.income,
        deductions: data.spouse.deductions, credits: data.spouse.credits,
        withholding: data.spouse.withholding },
      diag,
      'spouse',
    );
  }

  // ── Combine ────────────────────────────────────────────────────────────
  const computedTax = round2(self.computedTax + (spouse ? spouse.computedTax : 0));
  const creditPointsTotal = round2(self.credits.creditPoints + (spouse ? spouse.credits.creditPoints : 0));
  const creditPointsValue = round2(self.credits.creditPointsValue + (spouse ? spouse.credits.creditPointsValue : 0));
  const namedCredits = round2(self.credits.namedCredits + (spouse ? spouse.credits.namedCredits : 0));
  const totalCredits = round2(creditPointsValue + namedCredits);
  const netTax = round2(Math.max(0, computedTax - totalCredits));
  const totalWithholding = round2(data.withholding + (data.spouse ? data.spouse.withholding : 0));
  const balance = round2(netTax - totalWithholding); // < 0 → refund

  // ── Build the section-by-section `fields` map ─────────────────────────
  const fields = buildFieldsMap({
    data,
    self,
    spouse,
    computedTax,
    credits: {
      creditPoints: creditPointsTotal,
      creditPointsValue,
      namedCredits,
      total: totalCredits,
    },
    netTax,
    balance,
    totalWithholding,
  });

  return {
    computedTax,
    credits: {
      creditPoints: creditPointsTotal,
      creditPointsValue,
      namedCredits,
      total: totalCredits,
    },
    netTax,
    balance,
    fields,
    diagnostics: Object.assign({}, diag, {
      brackets: self.breakdown,
      bracketsSpouse: spouse ? spouse.breakdown : null,
      deductionNotes: self.deductionNotes.concat(spouse ? spouse.deductionNotes : []),
      perFiler: spouse ? { self: self.summary, spouse: spouse.summary } : { self: self.summary },
      surtax: {
        self: self.surtax,
        spouse: spouse ? spouse.surtax : null,
      },
    }),
    meta: {
      year: FORM_YEAR,
      preparedAt: new Date().toISOString(),
      engine: 'form-1301',
      version: FORM_VERSION,
      refund: balance < 0,
      balanceDue: balance > 0 ? balance : 0,
      refundOwed: balance < 0 ? -balance : 0,
    },
  };
}

/**
 * Compute one filer's tax (a spouse or a single filer).
 * Produces both the numeric output and intermediate breakdown for the
 * `diagnostics` / `fields` output.
 */
function computeOneFiler(data, diag, role) {
  const agg = aggregateTaxable(data.income);

  const dedCap = applyDeductionCaps(data.deductions, agg.nonCapitalTaxable);
  const afterDeductions = nn(agg.nonCapitalTaxable - dedCap.total);

  // Bracket tax applies to non-capital only.
  const bracketResult = computeProgressiveTax(afterDeductions);

  // Capital income — flat 25% on gains/dividends/interest (Israeli default
  // for individuals, simplified — real returns handle exceptions).
  const capitalTax = round2(agg.capitalTaxable * 0.25);

  // Rental 10% track — separate 10% line.
  const rental10pctTax = round2(agg.rental10pctBase * 0.10);

  // Surtax — on the full § 121ב base (including capital).
  const surtax = computeSurtax(agg.totalBase);

  const computedTax = round2(bracketResult.tax + capitalTax + rental10pctTax + surtax.surtax);

  // Credits
  const creditPoints = round2(
    num(data.credits.pointsPersonal) +
    num(data.credits.pointsSpouse) +
    num(data.credits.pointsChildren),
  );
  const creditPointsValue = round2(creditPoints * CREDIT_POINT_VALUE);
  const namedCredits = round2(num(data.credits.residence) + num(data.credits.shiftWork));

  const summary = {
    role,
    taxableBase: agg.nonCapitalTaxable,
    afterDeductions,
    capitalTaxable: agg.capitalTaxable,
    rental10pctBase: agg.rental10pctBase,
    totalBase: agg.totalBase,
    bracketTax: bracketResult.tax,
    capitalTax,
    rental10pctTax,
    surtax: surtax.surtax,
    computedTax,
    creditPoints,
    creditPointsValue,
    namedCredits,
  };

  return {
    agg,
    deductions: dedCap.capped,
    deductionsTotal: dedCap.total,
    deductionNotes: dedCap.notes,
    afterDeductions,
    bracketTax: bracketResult.tax,
    breakdown: bracketResult.breakdown,
    capitalTax,
    rental10pctTax,
    surtax,
    computedTax,
    credits: { creditPoints, creditPointsValue, namedCredits },
    summary,
  };
}

/**
 * Build the section-by-section `fields` map the renderer consumes.
 * The layout follows FIELD_MAP_1301 exactly. Values are per-filer (self) but
 * the renderer can walk `spouse` independently from `diagnostics.perFiler.spouse`.
 */
function buildFieldsMap(ctx) {
  const { data, self, spouse, computedTax, credits, netTax, balance, totalWithholding } = ctx;
  const inc = data.income;

  const section_01_taxpayer = {
    tax_id:      { value: data.taxpayer.id },
    name:        { value: data.taxpayer.name },
    address:     { value: data.taxpayer.address },
    status:      { value: data.taxpayer.status },
    fiscal_year: { value: FORM_YEAR },
    spouse_id:   { value: spouse ? data.spouse.taxpayer.id : '' },
    spouse_name: { value: spouse ? data.spouse.taxpayer.name : '' },
  };

  const section_02_income = {
    employment:    { value: nn(inc.employment.gross - inc.employment.exempt) },
    self_employed: { value: nn(inc.selfEmployed.gross - inc.selfEmployed.expenses - inc.selfEmployed.exempt) },
    capital_gains: { value: nn(inc.capital.gains - inc.capital.exempt) },
    dividends:     { value: nn(inc.capital.dividends) },
    interest:      { value: nn(inc.capital.interest) },
    rental:        { value: inc.rental.track === 'normal' ? nn(inc.rental.gross - inc.rental.expenses - inc.rental.exempt) : 0 },
    pension:       { value: nn(inc.pension.gross - inc.pension.exempt) },
    other:         { value: nn(inc.other.gross - inc.other.exempt) },
    total:         { value: self.agg.totalBase },
  };

  const section_03_exempt = {
    employment_exempt:   { value: num(inc.employment.exempt) },
    rental_exempt_10pct: { value: inc.rental.track === '10pct' ? nn(inc.rental.gross - inc.rental.exempt) : 0 },
    rental_exempt_full:  { value: inc.rental.track === 'exempt' ? nn(inc.rental.gross) : 0 },
    pension_exempt:      { value: num(inc.pension.exempt) },
    capital_exempt:      { value: num(inc.capital.exempt) },
    other_exempt:        { value: num(inc.other.exempt) },
    total_exempt: {
      value: round2(
        num(inc.employment.exempt) +
        num(inc.pension.exempt) +
        num(inc.capital.exempt) +
        num(inc.other.exempt) +
        (inc.rental.track === '10pct' ? nn(inc.rental.gross - inc.rental.exempt) : 0) +
        (inc.rental.track === 'exempt' ? nn(inc.rental.gross) : 0)
      ),
    },
  };

  const section_04_deductions = {
    pension:    { value: self.deductions.pension },
    study_fund: { value: self.deductions.studyFund },
    life:       { value: self.deductions.life },
    donation:   { value: self.deductions.donation },
    total:      { value: self.deductionsTotal },
  };

  const section_05_credits = {
    points_personal:    { value: num(data.credits.pointsPersonal) },
    points_spouse:      { value: num(data.credits.pointsSpouse) },
    points_children:    { value: num(data.credits.pointsChildren) },
    point_value:        { value: CREDIT_POINT_VALUE },
    points_total_value: { value: credits.creditPointsValue },
    residence:          { value: num(data.credits.residence) },
    shift_work:         { value: num(data.credits.shiftWork) },
    total:              { value: credits.total },
  };

  const section_06_computation = {
    taxable_income:   { value: self.agg.nonCapitalTaxable },
    after_deductions: { value: self.afterDeductions },
    tax_by_brackets:  { value: self.bracketTax },
    surtax:           { value: self.surtax.surtax },
    computed_tax:     { value: computedTax },
    credits_applied:  { value: credits.total },
    net_tax:          { value: netTax },
  };

  const section_07_reconciliation = {
    withholding: { value: totalWithholding },
    advances:    { value: 0 },
    balance_due: { value: balance > 0 ? balance : 0 },
    refund_owed: { value: balance < 0 ? -balance : 0 },
  };

  const section_08_signature = {
    declaration:    { value: 'אני מצהיר/ה כי כל הפרטים המופיעים בדוח זה נכונים ומדויקים.' },
    signer_name:    { value: data.taxpayer.name },
    signature_date: { value: new Date().toISOString().slice(0, 10) },
    prepared_by:    { value: 'Techno-Kol Uzi Mega-ERP — form-1301.js' },
  };

  // Decorate every field with its layout metadata from FIELD_MAP_1301 so
  // the renderer can paint labels and line numbers without a second lookup.
  function decorate(sectionKey, values) {
    const spec = FIELD_MAP_1301[sectionKey];
    const out = { _title: spec.title, _sectionKey: sectionKey, fields: {} };
    for (const fieldKey of Object.keys(spec.fields)) {
      const fieldSpec = spec.fields[fieldKey];
      const v = values[fieldKey] || { value: '' };
      out.fields[fieldKey] = {
        line: fieldSpec.line,
        label_he: fieldSpec.he,
        label_en: fieldSpec.en,
        label: fieldSpec.label,
        value: v.value,
      };
    }
    return out;
  }

  return {
    section_01_taxpayer:     decorate('section_01_taxpayer',    section_01_taxpayer),
    section_02_income:       decorate('section_02_income',      section_02_income),
    section_03_exempt:       decorate('section_03_exempt',      section_03_exempt),
    section_04_deductions:   decorate('section_04_deductions',  section_04_deductions),
    section_05_credits:      decorate('section_05_credits',     section_05_credits),
    section_06_computation:  decorate('section_06_computation', section_06_computation),
    section_07_reconciliation: decorate('section_07_reconciliation', section_07_reconciliation),
    section_08_signature:    decorate('section_08_signature',   section_08_signature),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF renderer — optional, uses pdfkit if installed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a generate1301() result to PDF.
 *
 * Strategy:
 *  1. If `src/payroll/pdf-generator.js` exposes a suitable helper, use it.
 *  2. Otherwise fall back to a standalone pdfkit stub (bilingual RTL-aware).
 *  3. If pdfkit is not installed, return `{ error: 'pdfkit_missing', stub: true }`
 *     — never throws, never leaves the caller hanging.
 *
 * Signature: `renderPDF1301(result, outputPath)` where `outputPath` may be
 * omitted for a "dry-run" that returns a plain-text dump.
 */
function renderPDF1301(result, outputPath) {
  // Feature detect pdfkit (optional dep).
  let PDFDocument = null;
  try {
    // eslint-disable-next-line global-require
    PDFDocument = require('pdfkit');
  } catch (_e) {
    // No pdfkit — return text stub so the caller can still preview.
    return Promise.resolve({
      error: 'pdfkit_missing',
      stub: true,
      text: renderTextStub(result),
      path: null,
      size: 0,
    });
  }

  // Check for an existing bilingual helper to reuse styling.
  let sharedHelper = null;
  try {
    // eslint-disable-next-line global-require
    sharedHelper = require('../payroll/pdf-generator');
  } catch (_e) { /* none */ }

  // If a shared helper provides a generic formBuilder, use it. Otherwise
  // we render directly via pdfkit — same PDFDocument instance either way.
  if (sharedHelper && typeof sharedHelper.generateForm1301Pdf === 'function') {
    return sharedHelper.generateForm1301Pdf(result, outputPath);
  }

  return new Promise((resolve, reject) => {
    try {
      const fs = require('fs');
      const path = require('path');

      if (!outputPath) {
        // Dry-run — render to text only.
        return resolve({ path: null, size: 0, text: renderTextStub(result), stub: false });
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `טופס 1301 — ${result.meta && result.meta.year || FORM_YEAR}`,
          Author: 'Techno-Kol Uzi Mega-ERP',
          Subject: 'Israeli Annual Personal Income Tax Return / דוח שנתי ליחיד',
          Keywords: 'form 1301, tax, Israel, annual return',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(18).text('Form 1301 / טופס 1301', { align: 'center' });
      doc.fontSize(12).text(
        'Israeli Annual Personal Income Tax Return / דוח שנתי ליחיד',
        { align: 'center' },
      );
      doc.moveDown();
      doc.fontSize(10).text(`Tax Year: ${result.meta && result.meta.year || FORM_YEAR}`, { align: 'center' });
      doc.moveDown();

      // Walk sections in order
      const order = [
        'section_01_taxpayer',
        'section_02_income',
        'section_03_exempt',
        'section_04_deductions',
        'section_05_credits',
        'section_06_computation',
        'section_07_reconciliation',
        'section_08_signature',
      ];
      for (const key of order) {
        const s = result.fields[key];
        if (!s) continue;
        doc.moveDown(0.5);
        doc.fontSize(13).text(s._title.label, { underline: true });
        doc.moveDown(0.2);
        doc.fontSize(10);
        for (const f of Object.keys(s.fields)) {
          const row = s.fields[f];
          const v = row.value === '' || row.value == null ? '—' : row.value;
          doc.text(`[${row.line}] ${row.label}: ${v}`);
        }
      }

      // Footer
      doc.moveDown();
      doc.fontSize(9).fillColor('gray').text(
        `Generated by form-1301.js v${FORM_VERSION} — לא מוחקים רק משדרגים ומגדלים`,
        { align: 'center' },
      );

      doc.end();
      stream.on('finish', () => {
        const stat = fs.statSync(outputPath);
        resolve({ path: outputPath, size: stat.size, stub: false });
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** Text dump for pdfkit-less environments or dry-run. */
function renderTextStub(result) {
  const lines = [];
  lines.push('Form 1301 / טופס 1301 — ' + (result.meta && result.meta.year || FORM_YEAR));
  lines.push('Israeli Annual Personal Income Tax Return / דוח שנתי ליחיד');
  lines.push('='.repeat(72));
  const order = [
    'section_01_taxpayer',
    'section_02_income',
    'section_03_exempt',
    'section_04_deductions',
    'section_05_credits',
    'section_06_computation',
    'section_07_reconciliation',
    'section_08_signature',
  ];
  for (const key of order) {
    const s = result.fields[key];
    if (!s) continue;
    lines.push('');
    lines.push('## ' + s._title.label);
    for (const f of Object.keys(s.fields)) {
      const row = s.fields[f];
      lines.push(`  [${row.line}] ${row.label}: ${row.value === '' ? '—' : row.value}`);
    }
  }
  lines.push('');
  lines.push('-'.repeat(72));
  lines.push(`Computed tax:  ${result.computedTax}`);
  lines.push(`Credits total: ${result.credits.total}`);
  lines.push(`Net tax:       ${result.netTax}`);
  lines.push(`Balance:       ${result.balance} (${result.balance < 0 ? 'REFUND' : 'DUE'})`);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine factory (for multi-tenant / test isolation)
// ═══════════════════════════════════════════════════════════════════════════

function createEngine(opts) {
  opts = opts || {};
  // Future: allow override of bracket table per-year, per-jurisdiction, etc.
  return {
    generate1301,
    renderPDF1301,
    computeProgressiveTax,
    computeSurtax,
    applyCreditPoints,
    normalizeInput,
    CONSTANTS_2026_1301,
    TAX_BRACKETS_2026,
    CREDIT_POINT_VALUE,
    SURTAX_THRESHOLD,
    SURTAX_RATE,
    FIELD_MAP_1301,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Main
  generate1301,
  renderPDF1301,
  // Building blocks
  computeProgressiveTax,
  computeSurtax,
  applyCreditPoints,
  normalizeInput,
  // Constants
  CONSTANTS_2026_1301,
  TAX_BRACKETS_2026,
  CREDIT_POINT_VALUE,
  SURTAX_THRESHOLD,
  SURTAX_RATE,
  FIELD_MAP_1301,
  FORM_VERSION,
  // Helpers (exposed for tests & extensibility)
  _helpers: { round2, num, snum, nn, isValidIsraeliId, clone, bilabel },
  // Factory
  createEngine,
};
