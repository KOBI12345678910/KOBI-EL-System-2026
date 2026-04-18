/**
 * form-102.js — טופס 102 (דיווח חודשי על ניכויי שכר) processing engine.
 * Agent Y-003 / Swarm 4A / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli monthly employer-withholding report (Form 102 / טופס 102).
 *
 * This is the central monthly filing an Israeli employer submits to:
 *   • רשות המסים (Tax Authority)       — for income-tax withheld from wages
 *   • ביטוח לאומי (National Insurance) — for social-security + health
 *
 * A single 102 consolidates:
 *
 *   1. מס הכנסה מנוכה         (income tax withheld from employees)
 *   2. ביטוח לאומי — עובד     (employee's national-insurance share)
 *   3. ביטוח לאומי — מעסיק    (employer's national-insurance share)
 *   4. דמי בריאות — עובד      (employee's health-insurance share)
 *   5. ניכויים וזיכויים נוספים (additional deductions & advances)
 *
 * The filing + payment is due on the **15th of the following month**
 * (חוק הביטוח הלאומי, סעיף 355 & תקנות מס הכנסה (ניכוי ממשכורת)).
 *
 * This module is the *business-logic* layer that sits on top of the
 * existing XML skeleton at `onyx-procurement/src/tax-exports/form-102-xml.js`
 * (which only knows how to serialize a ready Object → XML). Here we:
 *
 *   1. Aggregate a payroll run into Form-102 sections.
 *   2. Apply Bituach-Leumi + Health threshold logic per row, then sum.
 *   3. Handle מנהל / בעל-שליטה (controlling shareholder) special rates.
 *   4. Compute the grand total + payableBy + dueDate.
 *   5. Emit a stub XML for the מקוון submission envelope.
 *   6. Emit `pdfFields` dictionary ready to stamp the printable 102 PDF.
 *
 * Zero external dependencies. Bilingual (Hebrew + English). Never mutates
 * or deletes incoming data — the engine is pure.
 *
 *   Rule of the house: *לא מוחקים — רק משדרגים ומגדלים*.
 *
 * ---------------------------------------------------------------------------
 * Primary exports
 *
 *   - generate102(payrollPeriod, employerDetails) →
 *       { sections, total, payableBy, dueDate, xml, pdfFields,
 *         period, employer, meta, warnings }
 *
 *   - submitXML102(data) → { xml, envelope, headers, endpoint, status }
 *       Stub for שידור מקוון to רשות המסים / ביטוח לאומי.
 *       EXACT real envelope format must be confirmed with the Tax Authority
 *       web-service documentation — stub only.
 *
 * Helper exports (for tests, tooling, wage-slip reuse):
 *
 *   - CONSTANTS_2026          — the threshold + rate table used this year
 *   - computeBituachLeumi(row)
 *   - computeHealth(row)
 *   - computeIncomeTax(row)
 *   - dueDateFor({year, month})
 *   - buildPdfFields(result)
 *   - buildStubXml(result)
 *   - aggregate(rows)
 *
 * ---------------------------------------------------------------------------
 * Data model
 *
 *   PayrollPeriod (input):
 *     {
 *       year:   number,              // e.g. 2026
 *       month:  number,              // 1-12
 *       rows:   [ PayrollRow ],      // one per employee per run
 *       adjustments?: {              // optional manual adjustments
 *         incomeTaxAdvance?: number, // mid-month prepayment
 *         priorCredit?:      number, // יתרת זכות מחודש קודם
 *         otherDeductions?:  number, // additional withholdings (savings, מזונות…)
 *       },
 *     }
 *
 *   PayrollRow (per employee, per payroll-run):
 *     {
 *       employeeId:           string,
 *       employeeName?:        string,
 *       grossWages:           number,   // total gross this period
 *       incomeTaxWithheld:    number,   // already-computed by wage-slip-calc
 *       blEmployeePortion?:   number,   // optional: already computed
 *       blEmployerPortion?:   number,   // optional: already computed
 *       healthPortion?:       number,   // optional: already computed
 *       isControllingShareholder?: boolean,  // בעל שליטה
 *       isManagerSpecialRate?:     boolean,  // מנהל בשיעור מיוחד
 *       blExempt?:            boolean,       // exempt from BL (e.g. minor)
 *     }
 *
 *   EmployerDetails (input):
 *     {
 *       employerId:           string,   // ח.פ. / ת.ז.
 *       employerName:         string,
 *       deductionFileNumber?: string,   // תיק ניכויים
 *       bituachLeumiNumber?:  string,   // תיק ביטוח לאומי
 *       branchCode?:          string,
 *       address?:             string,
 *       bankAccount?:         string,   // for payment reference
 *     }
 *
 * ---------------------------------------------------------------------------
 * Reference:
 *   • פקודת מס הכנסה (נוסח חדש) התשכ"א-1961
 *   • תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), התשנ"ג-1993
 *   • חוק הביטוח הלאומי (נוסח משולב), התשנ"ה-1995 (סעיף 355 + לוחות י'-י"א)
 *   • חוק ביטוח בריאות ממלכתי, התשנ"ד-1994
 *   • ISRAELI_TAX_CONSTANTS_2026.md (project-level source of truth)
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 2026 Constants (single source of truth for this module)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CONSTANTS_2026 — every rate / threshold used by Form 102 for tax year 2026.
 * Mirrors `wage-slip-calculator.CONSTANTS_2026` but is intentionally kept
 * local so the module stays zero-dependency.
 */
const CONSTANTS_2026 = Object.freeze({
  YEAR: 2026,

  // Bituach Leumi (National Insurance) — 2026
  // Monthly threshold: 60% of average salary → ~₪7,522 / month.
  // Employee pays 0.4% on income below threshold, 7% above.
  // Employer pays 3.55% below, 7.6% above.
  BITUACH_LEUMI: Object.freeze({
    MONTHLY_THRESHOLD:   7522,    // ₪ / month
    MONTHLY_MAX_BASE:    49030,   // ₪ / month — ceiling on insurable earnings
    EMPLOYEE_LOW_RATE:   0.004,   // 0.4%
    EMPLOYEE_HIGH_RATE:  0.07,    // 7%
    EMPLOYER_LOW_RATE:   0.0355,  // 3.55%
    EMPLOYER_HIGH_RATE:  0.076,   // 7.6%
  }),

  // Health Insurance (מס בריאות / דמי בריאות) — 2026
  // Employee-only contribution. 3.1% below threshold, 5% above.
  HEALTH: Object.freeze({
    MONTHLY_THRESHOLD:   7522,    // ₪ / month — same threshold as BL
    MONTHLY_MAX_BASE:    49030,
    EMPLOYEE_LOW_RATE:   0.031,   // 3.1%
    EMPLOYEE_HIGH_RATE:  0.05,    // 5%
  }),

  // Controlling-shareholder / מנהל בעל שליטה — special treatment.
  // Under 129/129א income-tax regs a controlling shareholder has a
  // distinct reporting bucket but (for 2026) uses the same rate table —
  // the difference is how the payment is reconciled at year-end.
  // We still flag the rows in the output so Form 126 (annual) can pick
  // them up cleanly.
  CONTROLLING_SHAREHOLDER: Object.freeze({
    // NB: BL threshold does NOT apply to יחיד בעל שליטה in certain cases;
    // we support an override rate below. Defaults match the standard table.
    BL_EMPLOYEE_RATE:    0.07,    // flat 7% (full rate), no low-bracket
    BL_EMPLOYER_RATE:    0.076,   // flat 7.6%
    HEALTH_EMPLOYEE_RATE: 0.05,   // flat 5%
    REPORT_BUCKET:       'controlling_shareholder',
  }),

  // Rounding — NIS precision for reported totals
  ROUND_TO: 2,

  // Due-date rule: 15th of month following the payroll period.
  DUE_DAY_OF_NEXT_MONTH: 15,
});

// Hebrew/English labels for sections (used in output + PDF field names)
const SECTION_LABELS = Object.freeze({
  incomeTax: Object.freeze({
    he: 'מס הכנסה מנוכה',
    en: 'Income Tax Withheld',
    code: '042',  // box on printed form (indicative)
  }),
  bituachLeumiEmployee: Object.freeze({
    he: 'ביטוח לאומי — חלק עובד',
    en: 'National Insurance — Employee Portion',
    code: '052',
  }),
  bituachLeumiEmployer: Object.freeze({
    he: 'ביטוח לאומי — חלק מעסיק',
    en: 'National Insurance — Employer Portion',
    code: '053',
  }),
  healthEmployee: Object.freeze({
    he: 'דמי בריאות — חלק עובד',
    en: 'Health Insurance — Employee Portion',
    code: '054',
  }),
  controllingShareholder: Object.freeze({
    he: 'בעל שליטה / מנהל בשיעור מיוחד',
    en: 'Controlling Shareholder / Manager Special Rate',
    code: '061',
  }),
  otherDeductions: Object.freeze({
    he: 'ניכויים וזיכויים נוספים',
    en: 'Other Deductions & Credits',
    code: '070',
  }),
  advances: Object.freeze({
    he: 'מקדמות ששולמו',
    en: 'Advances Paid',
    code: '080',
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers
// ═══════════════════════════════════════════════════════════════════════════

function round2(n) {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toNumber(n, fallback = 0) {
  const x = Number(n);
  return isFinite(x) ? x : fallback;
}

function isoDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function xmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// Core per-row computations (pure)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * computeBituachLeumi — apply BL threshold logic to a single payroll row.
 *
 *   • 0.4% (employee) / 3.55% (employer) on the portion ≤ threshold
 *   • 7%   (employee) / 7.6%  (employer) on the portion > threshold and ≤ max
 *   • 0%   on the portion > max base
 *
 * Controlling-shareholder rows use the flat high-rate table.
 * Rows with `blExempt: true` or `blEmployeePortion`/`blEmployerPortion`
 * already supplied are returned as-is.
 */
function computeBituachLeumi(row, constants = CONSTANTS_2026) {
  const r = row || {};
  if (r.blExempt) return { employee: 0, employer: 0, capped: false };

  // If wage-slip-calc has already computed these, trust and return them.
  if (r.blEmployeePortion != null || r.blEmployerPortion != null) {
    return {
      employee: round2(toNumber(r.blEmployeePortion)),
      employer: round2(toNumber(r.blEmployerPortion)),
      capped: false,
    };
  }

  const gross = toNumber(r.grossWages);
  if (gross <= 0) return { employee: 0, employer: 0, capped: false };

  const { MONTHLY_THRESHOLD, MONTHLY_MAX_BASE } = constants.BITUACH_LEUMI;

  // Controlling shareholder — flat high rates, no low bracket.
  if (r.isControllingShareholder) {
    const insurable = Math.min(gross, MONTHLY_MAX_BASE);
    const cs = constants.CONTROLLING_SHAREHOLDER;
    return {
      employee: round2(insurable * cs.BL_EMPLOYEE_RATE),
      employer: round2(insurable * cs.BL_EMPLOYER_RATE),
      capped: gross > MONTHLY_MAX_BASE,
    };
  }

  const bl = constants.BITUACH_LEUMI;
  // Below-threshold slice:
  const lowPortion = Math.min(gross, MONTHLY_THRESHOLD);
  // Above-threshold slice, capped at MAX_BASE:
  const highPortion = Math.max(0, Math.min(gross, MONTHLY_MAX_BASE) - MONTHLY_THRESHOLD);

  const employee = lowPortion * bl.EMPLOYEE_LOW_RATE + highPortion * bl.EMPLOYEE_HIGH_RATE;
  const employer = lowPortion * bl.EMPLOYER_LOW_RATE + highPortion * bl.EMPLOYER_HIGH_RATE;

  return {
    employee: round2(employee),
    employer: round2(employer),
    capped: gross > MONTHLY_MAX_BASE,
  };
}

/**
 * computeHealth — apply health-insurance bracket logic.
 *
 *   • 3.1% on income ≤ threshold
 *   • 5%   on income >  threshold (up to MAX_BASE)
 *
 * Controlling shareholders use the flat high rate.
 */
function computeHealth(row, constants = CONSTANTS_2026) {
  const r = row || {};
  if (r.blExempt) return { employee: 0, capped: false };

  if (r.healthPortion != null) {
    return { employee: round2(toNumber(r.healthPortion)), capped: false };
  }

  const gross = toNumber(r.grossWages);
  if (gross <= 0) return { employee: 0, capped: false };

  const { MONTHLY_THRESHOLD, MONTHLY_MAX_BASE } = constants.HEALTH;

  if (r.isControllingShareholder) {
    const insurable = Math.min(gross, MONTHLY_MAX_BASE);
    return {
      employee: round2(insurable * constants.CONTROLLING_SHAREHOLDER.HEALTH_EMPLOYEE_RATE),
      capped: gross > MONTHLY_MAX_BASE,
    };
  }

  const h = constants.HEALTH;
  const lowPortion = Math.min(gross, MONTHLY_THRESHOLD);
  const highPortion = Math.max(0, Math.min(gross, MONTHLY_MAX_BASE) - MONTHLY_THRESHOLD);

  const employee = lowPortion * h.EMPLOYEE_LOW_RATE + highPortion * h.EMPLOYEE_HIGH_RATE;

  return {
    employee: round2(employee),
    capped: gross > MONTHLY_MAX_BASE,
  };
}

/**
 * computeIncomeTax — pass-through of per-row withheld income tax.
 *
 * Form 102 does NOT recompute the progressive brackets; it only *sums* what
 * the wage-slip calculator already withheld. We still normalize the shape
 * so tests and downstream exporters can rely on `{ withheld, gross }`.
 */
function computeIncomeTax(row) {
  const r = row || {};
  return {
    withheld: round2(toNumber(r.incomeTaxWithheld)),
    gross:    round2(toNumber(r.grossWages)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Aggregation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * aggregate — reduce an array of payroll rows into Form 102 sections.
 *
 * Returns a plain object (no `total`/`dueDate`/`xml` yet — that's added
 * on top by `generate102`).
 */
function aggregate(rows, constants = CONSTANTS_2026) {
  const list = Array.isArray(rows) ? rows : [];
  const warnings = [];

  let totalGrossWages = 0;
  let employeesCount = 0;

  // Section totals
  let incomeTaxTotal = 0;
  let blEmployeeTotal = 0;
  let blEmployerTotal = 0;
  let healthEmployeeTotal = 0;

  // Controlling-shareholder bucket (reported separately on 102)
  let csGrossWages = 0;
  let csCount = 0;
  let csIncomeTax = 0;
  let csBlEmployee = 0;
  let csBlEmployer = 0;
  let csHealth = 0;

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      warnings.push('form-102: skipped non-object row');
      continue;
    }
    const row = raw; // never mutate

    const gross = toNumber(row.grossWages);
    if (gross < 0) {
      warnings.push(`form-102: negative gross for employee ${row.employeeId || '?'} — skipped`);
      continue;
    }

    employeesCount += 1;
    totalGrossWages += gross;

    const it = computeIncomeTax(row);
    const bl = computeBituachLeumi(row, constants);
    const h  = computeHealth(row, constants);

    incomeTaxTotal     += it.withheld;
    blEmployeeTotal    += bl.employee;
    blEmployerTotal    += bl.employer;
    healthEmployeeTotal += h.employee;

    if (row.isControllingShareholder || row.isManagerSpecialRate) {
      csCount       += 1;
      csGrossWages  += gross;
      csIncomeTax   += it.withheld;
      csBlEmployee  += bl.employee;
      csBlEmployer  += bl.employer;
      csHealth      += h.employee;
    }

    if (bl.capped || h.capped) {
      warnings.push(`form-102: row for ${row.employeeId || '?'} exceeded BL/Health max base — capped`);
    }
  }

  return {
    employeesCount,
    totalGrossWages:    round2(totalGrossWages),
    incomeTaxTotal:     round2(incomeTaxTotal),
    blEmployeeTotal:    round2(blEmployeeTotal),
    blEmployerTotal:    round2(blEmployerTotal),
    healthEmployeeTotal: round2(healthEmployeeTotal),
    controllingShareholder: {
      count:       csCount,
      grossWages:  round2(csGrossWages),
      incomeTax:   round2(csIncomeTax),
      blEmployee:  round2(csBlEmployee),
      blEmployer:  round2(csBlEmployer),
      health:      round2(csHealth),
    },
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Due-date computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * dueDateFor — Form 102 payment is due by the 15th of the month
 * FOLLOWING the payroll period.
 *
 *   Jan 2026 payroll → due 2026-02-15
 *   Dec 2026 payroll → due 2027-01-15
 *
 * If the 15th falls on Shabbat or חג, payment is effectively due the
 * next business day — but the statutory due date remains the 15th and
 * we report that. Business-day logic is left to the payment runner.
 */
function dueDateFor(period, constants = CONSTANTS_2026) {
  const p = period || {};
  const year = Number(p.year);
  const month = Number(p.month);
  if (!isFinite(year) || !isFinite(month) || month < 1 || month > 12) {
    return '';
  }
  // Next month
  let nextMonth = month + 1;
  let nextYear  = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const day = constants.DUE_DAY_OF_NEXT_MONTH;
  const dt = new Date(Date.UTC(nextYear, nextMonth - 1, day));
  return isoDate(dt);
}

// ═══════════════════════════════════════════════════════════════════════════
// Build output shapes: sections, totals, pdfFields, stub xml
// ═══════════════════════════════════════════════════════════════════════════

function buildSections(agg, adjustments) {
  const adj = adjustments || {};
  const advance = round2(toNumber(adj.incomeTaxAdvance));
  const priorCredit = round2(toNumber(adj.priorCredit));
  const otherDeductions = round2(toNumber(adj.otherDeductions));

  const sections = [
    {
      key: 'incomeTax',
      label: SECTION_LABELS.incomeTax,
      amount: agg.incomeTaxTotal,
      count: agg.employeesCount,
      base:  agg.totalGrossWages,
    },
    {
      key: 'bituachLeumiEmployee',
      label: SECTION_LABELS.bituachLeumiEmployee,
      amount: agg.blEmployeeTotal,
      count: agg.employeesCount,
      base:  agg.totalGrossWages,
    },
    {
      key: 'bituachLeumiEmployer',
      label: SECTION_LABELS.bituachLeumiEmployer,
      amount: agg.blEmployerTotal,
      count: agg.employeesCount,
      base:  agg.totalGrossWages,
    },
    {
      key: 'healthEmployee',
      label: SECTION_LABELS.healthEmployee,
      amount: agg.healthEmployeeTotal,
      count: agg.employeesCount,
      base:  agg.totalGrossWages,
    },
  ];

  if (agg.controllingShareholder && agg.controllingShareholder.count > 0) {
    sections.push({
      key: 'controllingShareholder',
      label: SECTION_LABELS.controllingShareholder,
      amount: round2(
        agg.controllingShareholder.incomeTax +
        agg.controllingShareholder.blEmployee +
        agg.controllingShareholder.blEmployer +
        agg.controllingShareholder.health
      ),
      count: agg.controllingShareholder.count,
      base:  agg.controllingShareholder.grossWages,
      // detail for Form 126 reconciliation at year-end
      detail: Object.freeze({
        incomeTax:  agg.controllingShareholder.incomeTax,
        blEmployee: agg.controllingShareholder.blEmployee,
        blEmployer: agg.controllingShareholder.blEmployer,
        health:     agg.controllingShareholder.health,
      }),
      note: 'Included in the four main sections above — do NOT double-count.',
    });
  }

  if (otherDeductions > 0) {
    sections.push({
      key: 'otherDeductions',
      label: SECTION_LABELS.otherDeductions,
      amount: otherDeductions,
    });
  }

  if (advance > 0) {
    sections.push({
      key: 'advances',
      label: SECTION_LABELS.advances,
      amount: -advance, // advance reduces the remaining payable
      note: 'Already paid in advance — deducted from total.',
    });
  }

  if (priorCredit > 0) {
    sections.push({
      key: 'priorCredit',
      label: Object.freeze({
        he: 'יתרת זכות מחודש קודם',
        en: 'Credit carryover from prior month',
        code: '090',
      }),
      amount: -priorCredit,
      note: 'Carried over from prior 102 — reduces current payable.',
    });
  }

  return sections;
}

function buildPdfFields(result) {
  const r = result || {};
  const agg = r.meta?.aggregation || {};
  const emp = r.employer || {};
  const per = r.period || {};
  return {
    // box ids are indicative labels — actual PDF template maps on stamping
    form_code:                 '102',
    tax_year:                  per.year,
    tax_month:                 per.month,
    period_label_he:           `${String(per.month || '').padStart(2,'0')}/${per.year || ''}`,
    employer_id:               emp.employerId || '',
    employer_name:             emp.employerName || '',
    deduction_file_number:     emp.deductionFileNumber || '',
    bituach_leumi_number:      emp.bituachLeumiNumber || '',
    branch_code:               emp.branchCode || '',
    employees_count:           agg.employeesCount || 0,
    total_gross_wages:         agg.totalGrossWages || 0,
    income_tax_withheld:       agg.incomeTaxTotal || 0,
    bl_employee:               agg.blEmployeeTotal || 0,
    bl_employer:               agg.blEmployerTotal || 0,
    bl_total:                  round2((agg.blEmployeeTotal || 0) + (agg.blEmployerTotal || 0)),
    health_employee:           agg.healthEmployeeTotal || 0,
    cs_count:                  agg.controllingShareholder?.count || 0,
    cs_gross:                  agg.controllingShareholder?.grossWages || 0,
    grand_total:               r.total || 0,
    due_date:                  r.dueDate || '',
    payable_by:                r.payableBy || '',
  };
}

/**
 * buildStubXml — construct a stub שידור מקוון envelope.
 *
 * NOTE: this is a **stub**. The Israeli Tax Authority's online submission
 * format (שע"מ / מקוון) uses a specific envelope + digital signature +
 * authentication token that must be confirmed against the live portal
 * documentation at:
 *
 *   https://www.gov.il/he/service/report-102-online-deduction
 *
 * The stub below preserves the same *section semantics* so plumbing can
 * be wired end-to-end before the real schema is finalized.
 */
function buildStubXml(result) {
  const r = result || {};
  const emp = r.employer || {};
  const per = r.period || {};
  const agg = r.meta?.aggregation || {};
  const cs  = agg.controllingShareholder || {};

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!-- טופס 102 — דיווח חודשי על ניכויים — STUB XML -->');
  lines.push('<!-- Real format: confirm via רשות המסים / שע"מ documentation -->');
  lines.push('<Form102 xmlns="urn:il-tax:form-102:2026" version="2026.1">');
  lines.push('  <Meta>');
  lines.push(`    <FormCode>102</FormCode>`);
  lines.push(`    <TaxYear>${xmlEscape(per.year)}</TaxYear>`);
  lines.push(`    <TaxMonth>${xmlEscape(per.month)}</TaxMonth>`);
  lines.push(`    <GeneratedAt>${xmlEscape(new Date().toISOString())}</GeneratedAt>`);
  lines.push(`    <GeneratorAgent>techno-kol-uzi/form-102@2026</GeneratorAgent>`);
  lines.push('  </Meta>');
  lines.push('  <Employer>');
  lines.push(`    <EmployerId>${xmlEscape(emp.employerId)}</EmployerId>`);
  lines.push(`    <EmployerName>${xmlEscape(emp.employerName)}</EmployerName>`);
  if (emp.deductionFileNumber) lines.push(`    <DeductionFileNumber>${xmlEscape(emp.deductionFileNumber)}</DeductionFileNumber>`);
  if (emp.bituachLeumiNumber)  lines.push(`    <BituachLeumiNumber>${xmlEscape(emp.bituachLeumiNumber)}</BituachLeumiNumber>`);
  if (emp.branchCode)          lines.push(`    <BranchCode>${xmlEscape(emp.branchCode)}</BranchCode>`);
  if (emp.address)             lines.push(`    <Address>${xmlEscape(emp.address)}</Address>`);
  lines.push('  </Employer>');
  lines.push('  <Period>');
  lines.push(`    <Year>${xmlEscape(per.year)}</Year>`);
  lines.push(`    <Month>${xmlEscape(per.month)}</Month>`);
  lines.push('  </Period>');
  lines.push('  <IncomeTax>');
  lines.push(`    <EmployeesCount>${xmlEscape(agg.employeesCount || 0)}</EmployeesCount>`);
  lines.push(`    <TotalGrossWages>${xmlEscape(agg.totalGrossWages || 0)}</TotalGrossWages>`);
  lines.push(`    <TotalTaxWithheld>${xmlEscape(agg.incomeTaxTotal || 0)}</TotalTaxWithheld>`);
  lines.push('  </IncomeTax>');
  lines.push('  <BituachLeumi>');
  lines.push(`    <EmployeePortion>${xmlEscape(agg.blEmployeeTotal || 0)}</EmployeePortion>`);
  lines.push(`    <EmployerPortion>${xmlEscape(agg.blEmployerTotal || 0)}</EmployerPortion>`);
  lines.push(`    <TotalRemitted>${xmlEscape(round2((agg.blEmployeeTotal || 0) + (agg.blEmployerTotal || 0)))}</TotalRemitted>`);
  lines.push('  </BituachLeumi>');
  lines.push('  <HealthInsurance>');
  lines.push(`    <EmployeePortion>${xmlEscape(agg.healthEmployeeTotal || 0)}</EmployeePortion>`);
  lines.push('  </HealthInsurance>');
  if (cs && cs.count > 0) {
    lines.push('  <ControllingShareholders>');
    lines.push(`    <Count>${xmlEscape(cs.count)}</Count>`);
    lines.push(`    <GrossWages>${xmlEscape(cs.grossWages)}</GrossWages>`);
    lines.push(`    <IncomeTax>${xmlEscape(cs.incomeTax)}</IncomeTax>`);
    lines.push(`    <BlEmployee>${xmlEscape(cs.blEmployee)}</BlEmployee>`);
    lines.push(`    <BlEmployer>${xmlEscape(cs.blEmployer)}</BlEmployer>`);
    lines.push(`    <Health>${xmlEscape(cs.health)}</Health>`);
    lines.push('    <Note>Included in main totals — do not double-count</Note>');
    lines.push('  </ControllingShareholders>');
  }
  lines.push('  <Summary>');
  lines.push(`    <GrandTotal>${xmlEscape(r.total || 0)}</GrandTotal>`);
  lines.push(`    <DueDate>${xmlEscape(r.dueDate || '')}</DueDate>`);
  lines.push(`    <PayableBy>${xmlEscape(r.payableBy || '')}</PayableBy>`);
  lines.push('  </Summary>');
  lines.push('</Form102>');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API — generate102
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate102 — aggregate a payroll run into Form 102.
 *
 * @param {object} payrollPeriod  { year, month, rows[], adjustments? }
 * @param {object} employerDetails { employerId, employerName, … }
 * @returns {object} { sections, total, payableBy, dueDate, xml, pdfFields,
 *                     period, employer, meta, warnings }
 */
function generate102(payrollPeriod, employerDetails) {
  const period = payrollPeriod || {};
  const employer = employerDetails || {};
  const year  = Number(period.year);
  const month = Number(period.month);

  const warnings = [];

  if (!isFinite(year) || year < 2000 || year > 2100) {
    warnings.push('form-102: period.year is missing or out of range');
  }
  if (!isFinite(month) || month < 1 || month > 12) {
    warnings.push('form-102: period.month is missing or invalid (must be 1-12)');
  }
  if (!employer.employerId) {
    warnings.push('form-102: employer.employerId is missing (required for submission)');
  }
  if (!employer.employerName) {
    warnings.push('form-102: employer.employerName is missing (required for submission)');
  }

  const rows = Array.isArray(period.rows) ? period.rows : [];
  const agg = aggregate(rows, CONSTANTS_2026);
  warnings.push(...agg.warnings);

  const sections = buildSections(agg, period.adjustments);

  // Grand total = sum of *signed* amounts in sections.
  // Negative entries (advances / prior credits) reduce the total.
  const total = round2(
    sections.reduce((sum, s) => {
      // Controlling-shareholder row is a *detail roll-up* — never counted
      // toward the grand total (its amounts are already in the main buckets).
      if (s.key === 'controllingShareholder') return sum;
      return sum + toNumber(s.amount);
    }, 0)
  );

  const dueDate = dueDateFor({ year, month });
  const payableBy = dueDate; // alias for clarity; kept distinct for future business-day shifting

  const result = {
    period: Object.freeze({ year, month }),
    employer: Object.freeze({
      employerId:          employer.employerId || '',
      employerName:        employer.employerName || '',
      deductionFileNumber: employer.deductionFileNumber || '',
      bituachLeumiNumber:  employer.bituachLeumiNumber || '',
      branchCode:          employer.branchCode || '',
      address:             employer.address || '',
      bankAccount:         employer.bankAccount || '',
    }),
    sections,
    total,
    payableBy,
    dueDate,
    meta: Object.freeze({
      formCode:     '102',
      constantsYear: CONSTANTS_2026.YEAR,
      generatedAt:  new Date().toISOString(),
      aggregation:  agg,
    }),
    warnings,
  };

  // Populate xml + pdfFields with the full result context in hand.
  result.xml = buildStubXml(result);
  result.pdfFields = buildPdfFields(result);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API — submitXML102  (stub online submission)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * submitXML102 — build a submission envelope for the online (מקוון) channel.
 *
 * IMPORTANT — STUB ONLY. This function prepares the structural pieces
 * the Tax Authority's online portal expects, but the exact envelope
 * (namespaces, signature, authentication token, endpoint URL) MUST be
 * confirmed from:
 *
 *   • https://www.gov.il/he/service/report-102-online-deduction
 *   • רשות המסים / שע"מ webservice documentation
 *   • ביטוח לאומי B2B channel for the social-security portion
 *
 * We do NOT perform any network I/O here — the returned `endpoint` is a
 * placeholder, `status: 'prepared'` indicates the envelope is built and
 * ready to hand off to the actual transport layer. Integration tests
 * should wire up a signed mock server before flipping to `'submitted'`.
 *
 * @param {object} data — the result of generate102() OR a pre-built shape
 *                        with { xml, employer, period }
 * @returns {object} { xml, envelope, headers, endpoint, status }
 */
function submitXML102(data) {
  const d = data || {};
  if (!d.xml) {
    throw new Error('form-102.submitXML102: `data.xml` is required (run generate102 first)');
  }

  const emp = d.employer || {};
  const per = d.period || {};

  const envelope = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- שידור מקוון — טופס 102 — STUB envelope -->',
    '<SubmissionEnvelope xmlns="urn:il-tax:envelope:2026" version="2026.1">',
    '  <Header>',
    `    <SubmitterId>${xmlEscape(emp.employerId || '')}</SubmitterId>`,
    `    <SubmitterName>${xmlEscape(emp.employerName || '')}</SubmitterName>`,
    `    <FormCode>102</FormCode>`,
    `    <Period>${xmlEscape(per.year || '')}-${String(per.month || '').padStart(2,'0')}</Period>`,
    `    <Channel>online</Channel>`,
    `    <Timestamp>${xmlEscape(new Date().toISOString())}</Timestamp>`,
    '    <!-- TODO: real portal requires digital signature + auth token -->',
    '    <DigitalSignature>PLACEHOLDER</DigitalSignature>',
    '    <AuthToken>PLACEHOLDER</AuthToken>',
    '  </Header>',
    '  <Payload>',
    // embed the form xml, stripping its own xml declaration
    d.xml.replace(/^<\?xml[^?]*\?>\s*/, '').split('\n').map(l => '    ' + l).join('\n'),
    '  </Payload>',
    '</SubmissionEnvelope>',
  ].join('\n');

  return {
    xml: d.xml,
    envelope,
    headers: Object.freeze({
      'Content-Type':   'application/xml; charset=utf-8',
      'X-Form-Code':    '102',
      'X-Channel':      'online',
      'X-Submitter-Id': emp.employerId || '',
      // Real portal likely requires:
      //   Authorization: Bearer <otp-token>
      //   X-Digital-Signature: <pkcs7 signature over the payload>
    }),
    endpoint: 'https://PLACEHOLDER.tax.gov.il/webservices/form102/submit',
    status:   'prepared',
    note:     'STUB envelope. Real format must be confirmed from רשות המסים online documentation.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  generate102,
  submitXML102,

  // Helpers (public for tests + reuse)
  CONSTANTS_2026,
  SECTION_LABELS,
  computeBituachLeumi,
  computeHealth,
  computeIncomeTax,
  aggregate,
  dueDateFor,
  buildSections,
  buildPdfFields,
  buildStubXml,

  // Metadata
  FORM_CODE: '102',
  MODULE_VERSION: '2026.1.0',
};
