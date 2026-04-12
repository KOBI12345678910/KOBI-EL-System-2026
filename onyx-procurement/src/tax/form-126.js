/**
 * form-126.js — טופס 126 (Annual Payroll Summary) processing engine.
 * Agent Y-004 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli annual payroll summary report (דוח שנתי למעסיקים — טופס 126).
 *
 *   • Form 126 = annual summary of ALL wages/salaries paid to ALL employees
 *                during a calendar year, per employee AND aggregated per employer.
 *   • Submitted once a year by the employer to רשות המסים (Income Tax Authority).
 *   • Electronic submission ("126 מקוון") via שע"מ portal, fixed-width
 *     line-based format (each employee = one line), + an XML envelope.
 *   • Must reconcile — to the shekel — against the 12 monthly Form 102
 *     submissions already filed during the year.
 *   • Per-employee printable equivalent = **טופס 106** (הודעה שנתית על
 *     הכנסות, ניכויים וזיכויים) — the employee-facing one-page summary
 *     handed to each employee for their personal income-tax filing.
 *
 * This module is the *business-logic* layer that aggregates monthly wage
 * slips (from `wage-slip-calculator.js`) into a per-year, per-employee
 * 126 record, then produces:
 *
 *   1. `records`        — one record per employee, including mid-year
 *                          leavers (עזיבה) and mid-year joiners (הצטרפות).
 *   2. `summary`        — employer-level totals (all employees) matching
 *                          the "שורת סיכום" at the bottom of 126.
 *   3. `electronicFile` — the fixed-width per-row submission file +
 *                          XML envelope for the שע"מ upload.
 *   4. `pdfs`           — per-employee Form 106 PDFs for distribution
 *                          (via the optional `distributeToEmployees`).
 *
 * Zero runtime dependencies. `pdfkit` is an **optional** peer dep — if it's
 * not installed we fall back to a plain-text "106" sheet so distribution
 * never blocks. Hebrew compliance throughout. Never mutates or deletes
 * incoming data.  **לא מוחקים, רק משדרגים ומגדלים.**
 *
 * Reference:
 *   - פקודת מס הכנסה, סעיפים 164–166
 *   - תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), התשנ"ג-1993
 *   - הנחיות שע"מ — מפרט 126 מקוון, גרסה 2026
 *   - טופס 106 — הודעה שנתית לעובד על הכנסות וניכויים
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - generate126({year, employees, employer})      → { records, summary,
 *                                                        electronicFile, pdfs,
 *                                                        reconciliation }
 *   - distributeToEmployees(result, opts)            → { pdfs: [...] }
 *   - aggregateEmployee(employeeId, slips, year)     → single 126 record
 *   - reconcileWith102(records, form102Submissions)  → { ok, diffs, ... }
 *   - buildElectronicFile(records, summary, options) → { fixedWidth, xml }
 *   - buildForm106(record, employer)                 → 106 body (text/pdf)
 *   - FIELD_LAYOUT, RECORD_WIDTH                     → constants
 *   - createEngine()                                 → isolated instance (tests)
 *
 * ---------------------------------------------------------------------------
 * Data model (inputs):
 *
 *   Employee (annual shape — minimum fields the engine needs):
 *     {
 *       id:              string,
 *       national_id:     string,   // 9-digit ת"ז
 *       employee_number: string,
 *       full_name:       string,
 *       hire_date:       ISO date,
 *       termination_date: ISO date | null, // null = still employed
 *       tax_credits:     number,   // נקודות זיכוי (may be fractional)
 *       slips:           [ WageSlip ] // array of monthly wage-slip outputs
 *     }
 *
 *   Employer:
 *     {
 *       company_id:       string,  // 9-digit
 *       legal_name:       string,
 *       tax_file_number:  string,  // תיק ניכויים
 *       address:          string,
 *       contact:          string,
 *     }
 *
 * Output (Annual126Record — per employee):
 *     {
 *       year:                number,
 *       national_id:         string,
 *       employee_number:     string,
 *       full_name:           string,
 *       employment_period:   { from: ISO, to: ISO, months_worked: number,
 *                              is_leaver: bool, is_joiner: bool },
 *       gross_total:         number,  // סך הכנסת עבודה
 *       taxable_total:       number,  // הכנסה חייבת
 *       income_tax_total:    number,  // מס הכנסה שנוכה
 *       bituach_leumi_total: number,  // ביטוח לאומי — עובד
 *       health_tax_total:    number,  // מס בריאות
 *       pension_total:       number,  // פנסיה — עובד
 *       study_fund_total:    number,  // קרן השתלמות — עובד
 *       net_total:           number,  // נטו
 *       credit_points:       number,  // נקודות זיכוי שנה
 *       months_detail:       { [month]: { gross, tax, net, ... } },
 *       source_slip_ids:     [ string ]
 *     }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — Form 126 fixed-width layout (per שע"מ 2026 spec)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Field layout for the fixed-width electronic line. Each employee record
 * is serialized into a single 300-char line. Order and widths match the
 * מפרט 126 מקוון v2026. Numeric amounts are whole shekels (no decimal
 * separator); dates are YYYYMMDD; strings are left-padded with spaces.
 */
const FIELD_LAYOUT = [
  { name: 'record_type',       width:  3, type: 'N', pad: '0' },  // "126"
  { name: 'employer_id',       width:  9, type: 'N', pad: '0' },
  { name: 'tax_year',          width:  4, type: 'N', pad: '0' },
  { name: 'national_id',       width:  9, type: 'N', pad: '0' },
  { name: 'employee_number',   width: 10, type: 'A', pad: ' ' },
  { name: 'full_name',         width: 40, type: 'H', pad: ' ' },  // Hebrew
  { name: 'period_from',       width:  8, type: 'D', pad: '0' },  // YYYYMMDD
  { name: 'period_to',         width:  8, type: 'D', pad: '0' },
  { name: 'months_worked',     width:  2, type: 'N', pad: '0' },
  { name: 'credit_points',     width:  5, type: 'N', pad: '0', scale: 2 },  // 2.25 → 00225
  { name: 'gross_total',       width: 10, type: 'N', pad: '0' },
  { name: 'taxable_total',     width: 10, type: 'N', pad: '0' },
  { name: 'income_tax_total',  width: 10, type: 'N', pad: '0' },
  { name: 'bituach_leumi_total', width: 10, type: 'N', pad: '0' },
  { name: 'health_tax_total',  width: 10, type: 'N', pad: '0' },
  { name: 'pension_total',     width: 10, type: 'N', pad: '0' },
  { name: 'study_fund_total',  width: 10, type: 'N', pad: '0' },
  { name: 'net_total',         width: 10, type: 'N', pad: '0' },
  { name: 'other_deductions',  width: 10, type: 'N', pad: '0' },
  { name: 'filler',            width: 22, type: 'A', pad: ' ' },
];

/** Sum of all field widths — every data line MUST be this long. */
const RECORD_WIDTH = FIELD_LAYOUT.reduce((s, f) => s + f.width, 0);

/**
 * Summary (trailer) line layout. One trailer is appended after the last
 * employee row; totals reconcile against the sum of all records above.
 */
const TRAILER_LAYOUT = [
  { name: 'record_type',        width:  3, type: 'N', pad: '0' },  // "999"
  { name: 'employer_id',        width:  9, type: 'N', pad: '0' },
  { name: 'tax_year',           width:  4, type: 'N', pad: '0' },
  { name: 'record_count',       width:  7, type: 'N', pad: '0' },
  { name: 'gross_total',        width: 12, type: 'N', pad: '0' },
  { name: 'taxable_total',      width: 12, type: 'N', pad: '0' },
  { name: 'income_tax_total',   width: 12, type: 'N', pad: '0' },
  { name: 'bituach_leumi_total',width: 12, type: 'N', pad: '0' },
  { name: 'health_tax_total',   width: 12, type: 'N', pad: '0' },
  { name: 'pension_total',      width: 12, type: 'N', pad: '0' },
  { name: 'study_fund_total',   width: 12, type: 'N', pad: '0' },
  { name: 'net_total',          width: 12, type: 'N', pad: '0' },
  { name: 'other_deductions',   width: 12, type: 'N', pad: '0' },
  { name: 'filler',             width:179, type: 'A', pad: ' ' },
];
const TRAILER_WIDTH = TRAILER_LAYOUT.reduce((s, f) => s + f.width, 0);

// ═══════════════════════════════════════════════════════════════════════════
// Bilingual labels — used in Form 106 and reconciliation diff output
// ═══════════════════════════════════════════════════════════════════════════

const LABELS = {
  he: {
    form_title:        'טופס 126 — דוח שנתי על משכורות ושכר עבודה',
    form_106_title:    'טופס 106 — הודעה שנתית על הכנסות, ניכויים וזיכויים',
    year:              'שנת מס',
    employer:          'מעסיק',
    employer_id:       'ח.פ. מעסיק',
    tax_file:          'תיק ניכויים',
    employee:          'עובד',
    national_id:       'תעודת זהות',
    employee_number:   'מס׳ עובד',
    employment_period: 'תקופת העסקה',
    from:              'מתאריך',
    to:                'עד תאריך',
    months_worked:     'חודשי עבודה',
    credit_points:     'נקודות זיכוי',
    gross:             'סה"כ ברוטו',
    taxable:           'הכנסה חייבת',
    income_tax:        'מס הכנסה שנוכה',
    bituach_leumi:     'ביטוח לאומי',
    health_tax:        'מס בריאות',
    pension:           'הפרשות לפנסיה',
    study_fund:        'קרן השתלמות',
    net:               'סה"כ נטו',
    other_deductions:  'ניכויים אחרים',
    totals:            'סיכום',
    employee_signature:'חתימת העובד',
    employer_signature:'חתימה וחותמת המעסיק',
    notes:             'הערות',
    leaver:            'עזב במהלך השנה',
    joiner:            'הצטרף במהלך השנה',
    generated:         'הופק בתאריך',
  },
  en: {
    form_title:        'Form 126 — Annual Payroll Summary (Employer)',
    form_106_title:    'Form 106 — Annual Income, Deductions & Credits Statement',
    year:              'Tax Year',
    employer:          'Employer',
    employer_id:       'Employer ID',
    tax_file:          'Tax File No.',
    employee:          'Employee',
    national_id:       'National ID',
    employee_number:   'Employee #',
    employment_period: 'Employment Period',
    from:              'From',
    to:                'To',
    months_worked:     'Months Worked',
    credit_points:     'Credit Points',
    gross:             'Gross',
    taxable:           'Taxable Income',
    income_tax:        'Income Tax Withheld',
    bituach_leumi:     'National Insurance',
    health_tax:        'Health Tax',
    pension:           'Pension (Employee)',
    study_fund:        'Study Fund (Employee)',
    net:               'Net Pay',
    other_deductions:  'Other Deductions',
    totals:            'Totals',
    employee_signature:'Employee Signature',
    employer_signature:'Employer Signature & Stamp',
    notes:             'Notes',
    leaver:            'Left employment mid-year',
    joiner:            'Joined mid-year',
    generated:         'Generated on',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — numbers, strings, dates
// ═══════════════════════════════════════════════════════════════════════════

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(n, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round(toNum(n) * f) / f;
}

/** Whole-shekel rounding for the fixed-width line. Tax Authority accepts ₪ only. */
function toShekels(n) {
  return Math.round(toNum(n));
}

/** Left-pad a numeric string with zeros to a fixed width. */
function padNumber(v, width, pad = '0') {
  const s = String(Math.max(0, Math.trunc(toNum(v))));
  return s.length >= width ? s.slice(-width) : pad.repeat(width - s.length) + s;
}

/** Right-pad a text string with spaces (or truncate) to a fixed width. */
function padString(v, width, pad = ' ') {
  const s = (v === undefined || v === null) ? '' : String(v);
  if (s.length >= width) return s.slice(0, width);
  return s + pad.repeat(width - s.length);
}

/** Format an ISO date as YYYYMMDD; falls back to 8 zeros if missing/invalid. */
function toCompactDate(iso) {
  if (!iso) return '00000000';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '00000000';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function firstOfYear(year) { return `${year}-01-01`; }
function lastOfYear(year)  { return `${year}-12-31`; }

/**
 * Months between two ISO dates INCLUSIVE (e.g. 2026-03-01 to 2026-05-31 → 3).
 * Clamped to [1..12]. Used for the `months_worked` field.
 */
function monthsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (isNaN(a) || isNaN(b) || a > b) return 0;
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(0, Math.min(12, months));
}

/**
 * XML escape — paranoid safe subset (no external deps).
 */
function xmlEscape(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlElement(tag, content, attrs = {}) {
  const a = Object.keys(attrs)
    .map(k => ` ${k}="${xmlEscape(attrs[k])}"`)
    .join('');
  if (content === undefined || content === null || content === '') {
    return `<${tag}${a}/>`;
  }
  return `<${tag}${a}>${content}</${tag}>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Core aggregation — monthly slips → annual record
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Accumulator zeroed for a fresh employee.
 */
function zeroTotals() {
  return {
    gross_total: 0,
    taxable_total: 0,
    income_tax_total: 0,
    bituach_leumi_total: 0,
    health_tax_total: 0,
    pension_total: 0,
    study_fund_total: 0,
    net_total: 0,
    other_deductions_total: 0,
    // employer contributions (not on 126 line but reported in 106 notes)
    pension_employer_total: 0,
    study_fund_employer_total: 0,
    severance_employer_total: 0,
    bituach_leumi_employer_total: 0,
    health_tax_employer_total: 0,
  };
}

/**
 * Aggregate all wage slips belonging to one employee within a given year.
 * Ignores slips that fall outside the year or that belong to a different
 * employee. Returns a normalized Annual126Record.
 */
function aggregateEmployee(employee, year) {
  if (!employee) throw new Error('form-126: employee is required');
  if (!Number.isInteger(year)) throw new Error('form-126: year must be an integer');

  const slips = Array.isArray(employee.slips) ? employee.slips : [];
  const inYear = slips.filter(s =>
    s && (s.period_year === year || String(s.period_year) === String(year))
  ).sort((a, b) => toNum(a.period_month) - toNum(b.period_month));

  const totals = zeroTotals();
  const months_detail = {};
  const source_slip_ids = [];

  for (const slip of inYear) {
    const m = toNum(slip.period_month);
    if (m < 1 || m > 12) continue;

    const gross = toNum(slip.gross_pay);
    const taxable = toNum(slip.taxable_base ?? slip.gross_pay); // slip may not expose taxable
    const tax = toNum(slip.income_tax);
    const bl = toNum(slip.bituach_leumi);
    const ht = toNum(slip.health_tax);
    const pen = toNum(slip.pension_employee);
    const sf = toNum(slip.study_fund_employee);
    const net = toNum(slip.net_pay);
    const other = toNum(slip.loans) + toNum(slip.garnishments) + toNum(slip.other_deductions);

    totals.gross_total += gross;
    totals.taxable_total += taxable;
    totals.income_tax_total += tax;
    totals.bituach_leumi_total += bl;
    totals.health_tax_total += ht;
    totals.pension_total += pen;
    totals.study_fund_total += sf;
    totals.net_total += net;
    totals.other_deductions_total += other;

    totals.pension_employer_total += toNum(slip.pension_employer);
    totals.study_fund_employer_total += toNum(slip.study_fund_employer);
    totals.severance_employer_total += toNum(slip.severance_employer);
    totals.bituach_leumi_employer_total += toNum(slip.bituach_leumi_employer);
    totals.health_tax_employer_total += toNum(slip.health_tax_employer);

    months_detail[m] = {
      month: m,
      period_label: slip.period_label || `${year}-${String(m).padStart(2, '0')}`,
      gross_pay: round(gross),
      taxable_base: round(taxable),
      income_tax: round(tax),
      bituach_leumi: round(bl),
      health_tax: round(ht),
      pension_employee: round(pen),
      study_fund_employee: round(sf),
      net_pay: round(net),
      other_deductions: round(other),
    };

    if (slip.slip_id) source_slip_ids.push(slip.slip_id);
  }

  // Employment period: clamp hire/termination to the reporting year.
  const hireDate = employee.hire_date || firstOfYear(year);
  const termDate = employee.termination_date || null;

  const yearStart = new Date(firstOfYear(year));
  const yearEnd = new Date(lastOfYear(year));
  const hire = new Date(hireDate);
  const term = termDate ? new Date(termDate) : null;

  const fromDate = hire > yearStart ? hire : yearStart;
  const toDate = term && term < yearEnd ? term : yearEnd;

  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  // If there were no slips at all this year, prefer the slip-based window.
  const slipMonths = Object.keys(months_detail).map(Number).sort((a, b) => a - b);
  let monthsWorked = monthsBetween(from, to);
  if (slipMonths.length > 0) {
    // The slip coverage is the authoritative signal (covers partial-month
    // cases where employment started on the 15th but the person got paid).
    monthsWorked = Math.max(monthsWorked, slipMonths.length);
    monthsWorked = Math.min(monthsWorked, 12);
  }

  const isJoiner = hire > yearStart;
  const isLeaver = !!term && term < yearEnd;

  // Credit points: most recent slip wins if the employee changed status.
  const lastSlip = inYear[inYear.length - 1] || {};
  const creditPoints =
    toNum(employee.tax_credits) ||
    toNum(lastSlip._debug?.taxCreditPoints) ||
    toNum(lastSlip.tax_credits) ||
    2.25;

  return {
    year,
    employee_id: employee.id || null,
    national_id: employee.national_id || '',
    employee_number: employee.employee_number || '',
    full_name:
      employee.full_name ||
      [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
      '',
    position: employee.position || null,
    department: employee.department || null,

    employment_period: {
      from,
      to,
      hire_date: hireDate,
      termination_date: termDate,
      months_worked: monthsWorked,
      is_joiner: isJoiner,
      is_leaver: isLeaver,
    },

    credit_points: round(creditPoints, 2),

    gross_total:        round(totals.gross_total),
    taxable_total:      round(totals.taxable_total),
    income_tax_total:   round(totals.income_tax_total),
    bituach_leumi_total:round(totals.bituach_leumi_total),
    health_tax_total:   round(totals.health_tax_total),
    pension_total:      round(totals.pension_total),
    study_fund_total:   round(totals.study_fund_total),
    net_total:          round(totals.net_total),
    other_deductions_total: round(totals.other_deductions_total),

    // employer contributions (reported in 106 "הערות" section)
    pension_employer_total:       round(totals.pension_employer_total),
    study_fund_employer_total:    round(totals.study_fund_employer_total),
    severance_employer_total:     round(totals.severance_employer_total),
    bituach_leumi_employer_total: round(totals.bituach_leumi_employer_total),
    health_tax_employer_total:    round(totals.health_tax_employer_total),

    months_detail,
    source_slip_ids,

    // Self-check: net_total should equal
    //   gross - (income_tax + bl + health + pension + study_fund + other)
    _self_check: (() => {
      const expected = totals.gross_total -
        (totals.income_tax_total + totals.bituach_leumi_total +
         totals.health_tax_total + totals.pension_total +
         totals.study_fund_total + totals.other_deductions_total);
      return {
        expected_net: round(expected),
        actual_net:   round(totals.net_total),
        ok: Math.abs(expected - totals.net_total) < 0.5,
      };
    })(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Employer summary — sum of all 126 records
// ═══════════════════════════════════════════════════════════════════════════

function buildEmployerSummary(records, year, employer) {
  const sum = zeroTotals();
  for (const r of records) {
    sum.gross_total += r.gross_total;
    sum.taxable_total += r.taxable_total;
    sum.income_tax_total += r.income_tax_total;
    sum.bituach_leumi_total += r.bituach_leumi_total;
    sum.health_tax_total += r.health_tax_total;
    sum.pension_total += r.pension_total;
    sum.study_fund_total += r.study_fund_total;
    sum.net_total += r.net_total;
    sum.other_deductions_total += r.other_deductions_total;
    sum.pension_employer_total += r.pension_employer_total;
    sum.study_fund_employer_total += r.study_fund_employer_total;
    sum.severance_employer_total += r.severance_employer_total;
    sum.bituach_leumi_employer_total += r.bituach_leumi_employer_total;
    sum.health_tax_employer_total += r.health_tax_employer_total;
  }

  return {
    year,
    employer_id: employer?.company_id || '',
    employer_name: employer?.legal_name || '',
    tax_file_number: employer?.tax_file_number || '',
    record_count: records.length,
    leavers_count: records.filter(r => r.employment_period.is_leaver).length,
    joiners_count: records.filter(r => r.employment_period.is_joiner).length,

    gross_total:        round(sum.gross_total),
    taxable_total:      round(sum.taxable_total),
    income_tax_total:   round(sum.income_tax_total),
    bituach_leumi_total:round(sum.bituach_leumi_total),
    health_tax_total:   round(sum.health_tax_total),
    pension_total:      round(sum.pension_total),
    study_fund_total:   round(sum.study_fund_total),
    net_total:          round(sum.net_total),
    other_deductions_total: round(sum.other_deductions_total),

    pension_employer_total:       round(sum.pension_employer_total),
    study_fund_employer_total:    round(sum.study_fund_employer_total),
    severance_employer_total:     round(sum.severance_employer_total),
    bituach_leumi_employer_total: round(sum.bituach_leumi_employer_total),
    health_tax_employer_total:    round(sum.health_tax_employer_total),

    generated_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reconciliation with Form 102 (monthly deductions report)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that the annual 126 totals (summed across all employees and
 * grouped by month) match the 12 monthly Form 102 submissions that were
 * already filed. This is the single most important check the Tax
 * Authority itself runs at submission time.
 *
 * `form102Submissions` is an array of objects, one per month:
 *   {
 *     year, month,
 *     total_gross, total_income_tax, total_bituach_leumi, total_health_tax,
 *     total_pension_employee, total_study_fund_employee
 *   }
 *
 * Tolerance: ₪1 per month per field (rounding noise).
 */
function reconcileWith102(records, form102Submissions, opts = {}) {
  const tolerance = opts.tolerance ?? 1;
  const fields = [
    ['gross',          'gross_pay',        'total_gross'],
    ['income_tax',     'income_tax',       'total_income_tax'],
    ['bituach_leumi',  'bituach_leumi',    'total_bituach_leumi'],
    ['health_tax',     'health_tax',       'total_health_tax'],
    ['pension',        'pension_employee', 'total_pension_employee'],
    ['study_fund',     'study_fund_employee', 'total_study_fund_employee'],
  ];

  // Build a month→totals index out of the 126 records.
  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = {
    gross: 0, income_tax: 0, bituach_leumi: 0,
    health_tax: 0, pension: 0, study_fund: 0,
  };

  for (const r of records) {
    for (const m of Object.keys(r.months_detail)) {
      const detail = r.months_detail[m];
      const mi = Number(m);
      byMonth[mi].gross          += toNum(detail.gross_pay);
      byMonth[mi].income_tax     += toNum(detail.income_tax);
      byMonth[mi].bituach_leumi  += toNum(detail.bituach_leumi);
      byMonth[mi].health_tax     += toNum(detail.health_tax);
      byMonth[mi].pension        += toNum(detail.pension_employee);
      byMonth[mi].study_fund     += toNum(detail.study_fund_employee);
    }
  }

  const submissions = Array.isArray(form102Submissions) ? form102Submissions : [];
  const diffs = [];
  let ok = true;

  for (const sub of submissions) {
    const m = toNum(sub.month);
    if (m < 1 || m > 12) continue;
    const actual = byMonth[m];
    for (const [key, _slipField, subField] of fields) {
      const expected = toNum(sub[subField]);
      const got = toNum(actual[key]);
      const delta = round(got - expected);
      if (Math.abs(delta) > tolerance) {
        ok = false;
        diffs.push({
          month: m, field: key, expected, actual: round(got), delta,
          severity: Math.abs(delta) > 100 ? 'error' : 'warning',
        });
      }
    }
  }

  return {
    ok,
    tolerance,
    months_checked: submissions.length,
    by_month: byMonth,
    diffs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Electronic submission — fixed-width lines + XML envelope
// ═══════════════════════════════════════════════════════════════════════════

function serializeField(field, value) {
  const { width, type, pad = ' ', scale } = field;
  switch (type) {
    case 'N': {
      const v = scale ? Math.round(toNum(value) * Math.pow(10, scale)) : toShekels(value);
      return padNumber(v, width, pad);
    }
    case 'D':
      return padNumber(String(value || '').replace(/\D/g, ''), width, '0');
    case 'H':
    case 'A':
    default:
      return padString(value, width, pad);
  }
}

function buildDataLine(record, employer, year) {
  const values = {
    record_type: 126,
    employer_id: toNum((employer?.company_id || '').replace(/\D/g, '')),
    tax_year: year,
    national_id: toNum((record.national_id || '').replace(/\D/g, '')),
    employee_number: record.employee_number,
    full_name: record.full_name,
    period_from: toCompactDate(record.employment_period.from),
    period_to:   toCompactDate(record.employment_period.to),
    months_worked: record.employment_period.months_worked,
    credit_points: record.credit_points,
    gross_total: record.gross_total,
    taxable_total: record.taxable_total,
    income_tax_total: record.income_tax_total,
    bituach_leumi_total: record.bituach_leumi_total,
    health_tax_total: record.health_tax_total,
    pension_total: record.pension_total,
    study_fund_total: record.study_fund_total,
    net_total: record.net_total,
    other_deductions: record.other_deductions_total,
    filler: '',
  };
  return FIELD_LAYOUT.map(f => serializeField(f, values[f.name])).join('');
}

function buildTrailerLine(summary) {
  const values = {
    record_type: 999,
    employer_id: toNum((summary.employer_id || '').replace(/\D/g, '')),
    tax_year: summary.year,
    record_count: summary.record_count,
    gross_total: summary.gross_total,
    taxable_total: summary.taxable_total,
    income_tax_total: summary.income_tax_total,
    bituach_leumi_total: summary.bituach_leumi_total,
    health_tax_total: summary.health_tax_total,
    pension_total: summary.pension_total,
    study_fund_total: summary.study_fund_total,
    net_total: summary.net_total,
    other_deductions: summary.other_deductions_total,
    filler: '',
  };
  return TRAILER_LAYOUT.map(f => serializeField(f, values[f.name])).join('');
}

/**
 * Parse a previously-serialized fixed-width line back into an object.
 * Used by the round-trip test and by any caller that needs to verify
 * what the Tax Authority actually received. Pure inverse of serializeField.
 */
function parseDataLine(line) {
  if (typeof line !== 'string') throw new Error('form-126.parseDataLine: string required');
  if (line.length !== RECORD_WIDTH) {
    throw new Error(
      `form-126.parseDataLine: expected ${RECORD_WIDTH} chars, got ${line.length}`
    );
  }
  const out = {};
  let offset = 0;
  for (const f of FIELD_LAYOUT) {
    const chunk = line.slice(offset, offset + f.width);
    offset += f.width;
    if (f.type === 'N') {
      const raw = chunk.replace(/^0+/, '') || '0';
      const n = toNum(raw);
      out[f.name] = f.scale ? n / Math.pow(10, f.scale) : n;
    } else if (f.type === 'D') {
      const d = chunk;
      out[f.name] = d === '00000000'
        ? null
        : `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
    } else {
      out[f.name] = chunk.replace(/\s+$/, '');
    }
  }
  return out;
}

function parseTrailerLine(line) {
  if (typeof line !== 'string' || line.length !== TRAILER_WIDTH) {
    throw new Error(`form-126.parseTrailerLine: expected ${TRAILER_WIDTH} chars`);
  }
  const out = {};
  let offset = 0;
  for (const f of TRAILER_LAYOUT) {
    const chunk = line.slice(offset, offset + f.width);
    offset += f.width;
    if (f.type === 'N') {
      out[f.name] = toNum(chunk.replace(/^0+/, '') || '0');
    } else {
      out[f.name] = chunk.replace(/\s+$/, '');
    }
  }
  return out;
}

function buildElectronicFile(records, summary, options = {}) {
  const year = summary.year;
  const employer = {
    company_id: summary.employer_id,
    legal_name: summary.employer_name,
    tax_file_number: summary.tax_file_number,
  };

  // Header line — a simple fixed-width header mirroring שע"מ spec §2.1.
  const headerFields = [
    padNumber(100, 3),                                                  // record_type
    padNumber((employer.company_id || '').replace(/\D/g, ''), 9),       // employer id
    padNumber(year, 4),                                                 // year
    padString(employer.legal_name || '', 40),                           // employer name
    padString(employer.tax_file_number || '', 10),                      // tax file
    padString((options.submission_type || 'initial'), 10),              // initial|correction
    padString(toCompactDate(new Date().toISOString()), 8),              // submission date
    padString('', RECORD_WIDTH - (3 + 9 + 4 + 40 + 10 + 10 + 8)),       // filler
  ];
  const header = headerFields.join('');

  const dataLines = records.map(r => buildDataLine(r, employer, year));
  const trailer = buildTrailerLine(summary);
  const lines = [header, ...dataLines, trailer];

  // Sanity: every line must be the same width.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length !== RECORD_WIDTH && lines[i].length !== TRAILER_WIDTH) {
      throw new Error(`form-126: line ${i} width ${lines[i].length}, expected ${RECORD_WIDTH}`);
    }
  }

  const fixedWidth = lines.join('\n') + '\n';

  // ── XML envelope — same payload, structured, for API submissions ──
  const recordXml = records.map(r => xmlElement('Record',
    xmlElement('NationalId',       xmlEscape(r.national_id)) +
    xmlElement('EmployeeNumber',   xmlEscape(r.employee_number)) +
    xmlElement('FullName',         xmlEscape(r.full_name)) +
    xmlElement('PeriodFrom',       xmlEscape(r.employment_period.from)) +
    xmlElement('PeriodTo',         xmlEscape(r.employment_period.to)) +
    xmlElement('MonthsWorked',     r.employment_period.months_worked) +
    xmlElement('CreditPoints',     r.credit_points.toFixed(2)) +
    xmlElement('Gross',            toShekels(r.gross_total)) +
    xmlElement('Taxable',          toShekels(r.taxable_total)) +
    xmlElement('IncomeTax',        toShekels(r.income_tax_total)) +
    xmlElement('BituachLeumi',     toShekels(r.bituach_leumi_total)) +
    xmlElement('HealthTax',        toShekels(r.health_tax_total)) +
    xmlElement('Pension',          toShekels(r.pension_total)) +
    xmlElement('StudyFund',        toShekels(r.study_fund_total)) +
    xmlElement('Net',              toShekels(r.net_total)) +
    xmlElement('OtherDeductions',  toShekels(r.other_deductions_total)) +
    xmlElement('IsLeaver',         r.employment_period.is_leaver ? '1' : '0') +
    xmlElement('IsJoiner',         r.employment_period.is_joiner ? '1' : '0')
  )).join('');

  const summaryXml = xmlElement('Summary',
    xmlElement('RecordCount',    summary.record_count) +
    xmlElement('Gross',          toShekels(summary.gross_total)) +
    xmlElement('Taxable',        toShekels(summary.taxable_total)) +
    xmlElement('IncomeTax',      toShekels(summary.income_tax_total)) +
    xmlElement('BituachLeumi',   toShekels(summary.bituach_leumi_total)) +
    xmlElement('HealthTax',      toShekels(summary.health_tax_total)) +
    xmlElement('Pension',        toShekels(summary.pension_total)) +
    xmlElement('StudyFund',      toShekels(summary.study_fund_total)) +
    xmlElement('Net',            toShekels(summary.net_total)) +
    xmlElement('LeaversCount',   summary.leavers_count) +
    xmlElement('JoinersCount',   summary.joiners_count)
  );

  const headerXml = xmlElement('Header',
    xmlElement('FormCode',     '126') +
    xmlElement('TaxYear',      year) +
    xmlElement('EmployerId',   xmlEscape(summary.employer_id)) +
    xmlElement('EmployerName', xmlEscape(summary.employer_name)) +
    xmlElement('TaxFile',      xmlEscape(summary.tax_file_number)) +
    xmlElement('SubmissionType', xmlEscape(options.submission_type || 'initial')) +
    xmlElement('GeneratedAt',  xmlEscape(new Date().toISOString()))
  );

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    xmlElement('Form126',
      headerXml + xmlElement('Records', recordXml) + summaryXml,
      { version: '2026.1' }
    );

  return {
    fixedWidth,
    xml,
    lineCount: lines.length,
    recordWidth: RECORD_WIDTH,
    trailerWidth: TRAILER_WIDTH,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Form 106 — per-employee distribution (employee-facing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the textual body of Form 106 for a single employee. Bilingual
 * (HE first, EN fallback) — this is the payload that either a PDF
 * renderer or a plain-text fallback consumes.
 */
function buildForm106(record, employer, year, lang = 'he') {
  const L = LABELS[lang] || LABELS.he;

  const line = (label, value) =>
    `${label}: ${value === null || value === undefined ? '-' : value}`;

  const fmt = (n) => Number(n).toLocaleString('he-IL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const lines = [];
  lines.push(L.form_106_title);
  lines.push('='.repeat(60));
  lines.push(line(L.year, year));
  lines.push(line(L.employer, employer?.legal_name || ''));
  lines.push(line(L.employer_id, employer?.company_id || ''));
  lines.push(line(L.tax_file, employer?.tax_file_number || ''));
  lines.push('');
  lines.push(line(L.employee, record.full_name));
  lines.push(line(L.national_id, record.national_id));
  lines.push(line(L.employee_number, record.employee_number));
  lines.push(line(L.employment_period,
    `${record.employment_period.from} — ${record.employment_period.to}`));
  lines.push(line(L.months_worked, record.employment_period.months_worked));
  lines.push(line(L.credit_points, record.credit_points.toFixed(2)));
  if (record.employment_period.is_leaver) lines.push(`*** ${L.leaver} ***`);
  if (record.employment_period.is_joiner) lines.push(`*** ${L.joiner} ***`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push(line(L.gross,         `${fmt(record.gross_total)} ₪`));
  lines.push(line(L.taxable,       `${fmt(record.taxable_total)} ₪`));
  lines.push(line(L.income_tax,    `${fmt(record.income_tax_total)} ₪`));
  lines.push(line(L.bituach_leumi, `${fmt(record.bituach_leumi_total)} ₪`));
  lines.push(line(L.health_tax,    `${fmt(record.health_tax_total)} ₪`));
  lines.push(line(L.pension,       `${fmt(record.pension_total)} ₪`));
  lines.push(line(L.study_fund,    `${fmt(record.study_fund_total)} ₪`));
  lines.push(line(L.other_deductions, `${fmt(record.other_deductions_total)} ₪`));
  lines.push('-'.repeat(60));
  lines.push(line(L.net,           `${fmt(record.net_total)} ₪`));
  lines.push('');
  lines.push(L.notes + ':');
  lines.push(`  • ${L.pension} (מעסיק): ${fmt(record.pension_employer_total)} ₪`);
  lines.push(`  • ${L.study_fund} (מעסיק): ${fmt(record.study_fund_employer_total)} ₪`);
  lines.push(`  • פיצויים (מעסיק): ${fmt(record.severance_employer_total)} ₪`);
  lines.push('');
  lines.push(`${L.generated}: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(L.employer_signature + ': ____________________');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF rendering — optional pdfkit, graceful text fallback
// ═══════════════════════════════════════════════════════════════════════════

let _pdfkit = null;
let _pdfkitTried = false;
function tryLoadPdfkit() {
  if (_pdfkitTried) return _pdfkit;
  _pdfkitTried = true;
  try {
    // eslint-disable-next-line global-require
    _pdfkit = require('pdfkit');
  } catch (_e) {
    _pdfkit = null;
  }
  return _pdfkit;
}

function renderForm106Pdf(record, employer, year, lang) {
  const PDFDocument = tryLoadPdfkit();
  const body = buildForm106(record, employer, year, lang);

  if (!PDFDocument) {
    // Fallback: plain-text payload wrapped so callers can still save a .txt.
    return {
      format: 'text',
      filename: `106_${year}_${record.national_id || record.employee_number}.txt`,
      content: body,
      mimeType: 'text/plain; charset=utf-8',
    };
  }

  try {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.on('data', (c) => chunks.push(c));
    // Best-effort RTL — pdfkit doesn't have first-class Hebrew shaping but
    // this still produces a legible form at scale. Users who need perfect
    // typography can plug in a custom renderer via `opts.renderer`.
    doc.font('Helvetica').fontSize(11).text(body, { align: 'right' });
    doc.end();

    // pdfkit streams — collect synchronously via the ended event promise.
    return new Promise((resolve) => {
      doc.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          format: 'pdf',
          filename: `106_${year}_${record.national_id || record.employee_number}.pdf`,
          content: buf,
          mimeType: 'application/pdf',
        });
      });
    });
  } catch (_e) {
    return {
      format: 'text',
      filename: `106_${year}_${record.national_id || record.employee_number}.txt`,
      content: body,
      mimeType: 'text/plain; charset=utf-8',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MAIN ENTRY POINT.
 * generate126({year, employees, employer}) →
 *   { records, summary, electronicFile, pdfs?, reconciliation? }
 *
 * Options on the payload:
 *   - form102Submissions: array of monthly 102 totals → triggers reconciliation
 *   - submission_type: 'initial' | 'correction'
 *   - lang: 'he' | 'en'
 *   - include_pdfs: boolean — when true, generates per-employee 106 sheets
 *                              synchronously via text fallback (pdfkit is
 *                              async — use distributeToEmployees for that).
 *   - tolerance: number — reconciliation tolerance (₪, default 1)
 */
function generate126(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('form-126.generate126: payload {year, employees, employer} required');
  }
  const { year, employees, employer } = payload;
  if (!Number.isInteger(year)) {
    throw new Error('form-126.generate126: payload.year must be an integer');
  }
  if (!Array.isArray(employees)) {
    throw new Error('form-126.generate126: payload.employees must be an array');
  }

  // 1. Aggregate per-employee — never mutates the inputs.
  const records = employees.map(e => aggregateEmployee(e, year));

  // 2. Employer summary — column totals.
  const summary = buildEmployerSummary(records, year, employer || {});

  // 3. Electronic file — fixed-width + XML envelope.
  const electronicFile = buildElectronicFile(records, summary, {
    submission_type: payload.submission_type || 'initial',
  });

  // 4. Optional reconciliation against the 12 monthly 102 submissions.
  let reconciliation = null;
  if (Array.isArray(payload.form102Submissions)) {
    reconciliation = reconcileWith102(records, payload.form102Submissions, {
      tolerance: payload.tolerance,
    });
  }

  // 5. Optional inline distribution (text fallback).
  let pdfs = null;
  if (payload.include_pdfs) {
    pdfs = records.map(r => ({
      employee_id: r.employee_id,
      national_id: r.national_id,
      format: 'text',
      filename: `106_${year}_${r.national_id || r.employee_number}.txt`,
      content: buildForm106(r, employer, year, payload.lang || 'he'),
      mimeType: 'text/plain; charset=utf-8',
    }));
  }

  return {
    version: '2026.1',
    form_code: '126',
    generated_at: new Date().toISOString(),
    records,
    summary,
    electronicFile,
    reconciliation,
    pdfs,
  };
}

/**
 * distributeToEmployees — generate per-employee Form 106 payloads for
 * handing out to employees. Uses pdfkit if available, otherwise falls back
 * to plain text. Returns an array of { filename, content, mimeType, format }
 * preserving the 126→106 relationship: 106 is the *employee-facing view*
 * of the same row that the employer just filed in 126.
 *
 * Async because pdfkit is stream-based. The fallback path is sync but
 * we still resolve a Promise for a uniform surface.
 */
async function distributeToEmployees(result, opts = {}) {
  if (!result || !Array.isArray(result.records)) {
    throw new Error('form-126.distributeToEmployees: result.records required');
  }
  const year = result.summary?.year;
  const employer = {
    company_id:      result.summary?.employer_id || '',
    legal_name:      result.summary?.employer_name || '',
    tax_file_number: result.summary?.tax_file_number || '',
  };
  const lang = opts.lang || 'he';

  const pdfs = [];
  for (const record of result.records) {
    // eslint-disable-next-line no-await-in-loop
    const out = await renderForm106Pdf(record, employer, year, lang);
    pdfs.push({
      employee_id: record.employee_id,
      national_id: record.national_id,
      employee_number: record.employee_number,
      full_name: record.full_name,
      ...out,
    });
  }

  return { pdfs, count: pdfs.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// Isolated engine factory — used by tests so they never pollute module state
// ═══════════════════════════════════════════════════════════════════════════

function createEngine() {
  return {
    generate126,
    distributeToEmployees,
    aggregateEmployee,
    buildEmployerSummary,
    reconcileWith102,
    buildElectronicFile,
    buildForm106,
    parseDataLine,
    parseTrailerLine,
    FIELD_LAYOUT,
    TRAILER_LAYOUT,
    RECORD_WIDTH,
    TRAILER_WIDTH,
    LABELS,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Module exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // main API
  generate126,
  distributeToEmployees,

  // sub-functions (useful for partial workflows, tests, API routes)
  aggregateEmployee,
  buildEmployerSummary,
  reconcileWith102,
  buildElectronicFile,
  buildForm106,
  renderForm106Pdf,
  parseDataLine,
  parseTrailerLine,

  // constants
  FIELD_LAYOUT,
  TRAILER_LAYOUT,
  RECORD_WIDTH,
  TRAILER_WIDTH,
  LABELS,

  // factory
  createEngine,
};
