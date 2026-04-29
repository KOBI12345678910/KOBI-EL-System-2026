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
// File builder API — IL Bituach Leumi monthly fixed-width / JSON / XML export
// (parallel surface to form-856 / pcn874; this is the simpler row-oriented
//  interface used by the form-102-routes Express layer.)
// ═══════════════════════════════════════════════════════════════════════════

const F102_ICONV = (() => {
  try { return require('iconv-lite'); } catch { return null; }
})();

/**
 * Field layout for the per-employee Form 102 monthly detail line.
 * Fixed width = 110 chars. Numeric amounts are whole shekels (לא אגורות),
 * dates are YYYYMM. All strings space-padded; numbers zero-padded.
 *
 * Header layout = same width with record_type='102' / Trailer = '999'.
 *
 *   1   record_type      "102" (data) / "100" (header) / "999" (trailer)
 *   9   employer_id      ח.פ. / ת.ז. מעסיק
 *   6   period           YYYYMM
 *   9   employee_id      ת"ז עובד
 *  40   employee_name    שם העובד (Hebrew, windows-1255)
 *  10   gross_wages      שכר ברוטו
 *  10   bl_employee      ביטוח לאומי — חלק עובד
 *  10   bl_employer      ביטוח לאומי — חלק מעסיק
 *  10   health_employee  דמי בריאות — חלק עובד
 *   5   filler           רזרבה
 */
const FORM102_FIELD_LAYOUT = Object.freeze([
  { name: 'record_type',     width:  3, type: 'A', pad: ' ' },
  { name: 'employer_id',     width:  9, type: 'N', pad: '0' },
  { name: 'period',          width:  6, type: 'N', pad: '0' },
  { name: 'employee_id',     width:  9, type: 'N', pad: '0' },
  { name: 'employee_name',   width: 40, type: 'H', pad: ' ' },
  { name: 'gross_wages',     width: 10, type: 'N', pad: '0' },
  { name: 'bl_employee',     width: 10, type: 'N', pad: '0' },
  { name: 'bl_employer',     width: 10, type: 'N', pad: '0' },
  { name: 'health_employee', width: 10, type: 'N', pad: '0' },
  { name: 'filler',          width:  5, type: 'A', pad: ' ' },
]);
const FORM102_RECORD_WIDTH =
  FORM102_FIELD_LAYOUT.reduce((s, f) => s + f.width, 0);

/** Field labels — Hebrew per IL Bituach Leumi standard headings. */
const FORM102_LABELS = Object.freeze({
  he: Object.freeze({
    form_title:       'טופס 102 — דיווח חודשי על ניכויי שכר',
    employer:         'מעסיק',
    employer_id:      'ח.פ. / ת.ז. מעסיק',
    period:           'תקופת דיווח',
    period_year:      'שנת מס',
    period_month:     'חודש',
    employee:         'עובד',
    employee_id:      'תעודת זהות',
    employee_name:    'שם העובד',
    gross_wages:      'שכר ברוטו',
    bl_employee:      'ביטוח לאומי — חלק עובד',
    bl_employer:      'ביטוח לאומי — חלק מעסיק',
    health_employee:  'דמי בריאות — חלק עובד',
    totals:           'סה"כ',
    record_count:     'מספר רשומות',
    submission_type:  'סוג הגשה',
    initial:          'ראשוני',
    correction:       'תיקון',
    generated:        'הופק בתאריך',
    deadline:         'מועד הגשה',
  }),
  en: Object.freeze({
    form_title:       'Form 102 — Monthly Bituach Leumi Withholding Report',
    employer:         'Employer',
    employer_id:      'Employer ID (חפ/תז)',
    period:           'Reporting Period',
    period_year:      'Tax Year',
    period_month:     'Month',
    employee:         'Employee',
    employee_id:      'National ID',
    employee_name:    'Employee Name',
    gross_wages:      'Gross Wages',
    bl_employee:      'BL — Employee Portion',
    bl_employer:      'BL — Employer Portion',
    health_employee:  'Health Tax — Employee',
    totals:           'Totals',
    record_count:     'Record Count',
    submission_type:  'Submission Type',
    initial:          'initial',
    correction:       'correction',
    generated:        'Generated at',
    deadline:         'Submission Deadline',
  }),
});

function f102PadNumber(v, width, pad = '0') {
  const n = Math.max(0, Math.trunc(toNumber(v, 0)));
  const s = String(n);
  return s.length >= width ? s.slice(-width) : pad.repeat(width - s.length) + s;
}

function f102PadString(v, width, pad = ' ') {
  const s = (v === undefined || v === null) ? '' : String(v);
  if (s.length >= width) return s.slice(0, width);
  return s + pad.repeat(width - s.length);
}

/**
 * Build a single fixed-width line from a values map keyed by field name.
 * Numbers are rounded to whole shekels; Hebrew strings are length-truncated
 * by character count (the windows-1255 encoder later rejects bytes > width).
 */
function f102SerializeLine(values) {
  return FORM102_FIELD_LAYOUT.map(f => {
    const v = values[f.name];
    switch (f.type) {
      case 'N': return f102PadNumber(Math.round(toNumber(v, 0)), f.width, f.pad);
      case 'A':
      case 'H':
      default:  return f102PadString(v, f.width, f.pad);
    }
  }).join('');
}

/**
 * Compute the IL deadline for Form 102: the 15th of the month FOLLOWING
 * the reporting period. Returns YYYY-MM-DD string.
 */
function form102Deadline(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const next = new Date(Date.UTC(y, m, 15)); // m is 1-12; Date.UTC month is 0-11 so y/m gives next month
  return next.toISOString().slice(0, 10);
}

/**
 * buildForm102File({ year, month, rows, employer, submission_type })
 *
 * @param {Object}   payload
 * @param {number}   payload.year                e.g. 2026
 * @param {number}   payload.month               1..12
 * @param {Array}    payload.rows                per-employee detail rows.
 *   Each row: { employee_id, employee_name, gross_wages,
 *               bl_employee, bl_employer, health_employee }
 * @param {Object}   [payload.employer]          { id, name, tax_file_number }
 * @param {string}   [payload.submission_type]   'initial' | 'correction'
 * @returns {Object} {
 *   formCode, year, month, period, deadline,
 *   header, detail, trailer, totals,
 *   fixedWidth: string,        // \r\n CRLF, ready for windows-1255
 *   buffer:     Buffer|null,   // windows-1255 encoded bytes
 *   json:       Object,        // structured representation
 *   xml:        string,        // XML envelope
 *   metadata: { encoding, recordWidth, lineCount, filename, generatedAt }
 * }
 */
function buildForm102File(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('form-102.buildForm102File: payload required');
  }
  const year  = Number(payload.year);
  const month = Number(payload.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('form-102.buildForm102File: payload.year must be a 4-digit year');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('form-102.buildForm102File: payload.month must be 1..12');
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const employer = payload.employer || {};
  const submissionType =
    payload.submission_type === 'correction' ? 'correction' : 'initial';

  const period = `${year}${String(month).padStart(2, '0')}`;
  const employerIdRaw = String(employer.id || employer.employer_id || employer.company_id || '')
    .replace(/\D/g, '');

  // ── Header (record_type=100) — same width as data lines ──────────────
  const header = f102SerializeLine({
    record_type:     '100',
    employer_id:     employerIdRaw,
    period,
    employee_id:     0,
    employee_name:   String(employer.name || employer.legal_name || '').slice(0, 40),
    gross_wages:     0,
    bl_employee:     0,
    bl_employer:     0,
    health_employee: 0,
    filler:          submissionType === 'correction' ? 'CORR' : 'INIT',
  });

  // ── Detail rows (record_type=102) + accumulate totals ─────────────────
  let totGross = 0, totBlEmp = 0, totBlEr = 0, totHealth = 0;
  const detail = rows.map((r, idx) => {
    const gross = round2(toNumber(r.gross_wages));
    const blEmp = round2(toNumber(r.bl_employee));
    const blEr  = round2(toNumber(r.bl_employer));
    const heal  = round2(toNumber(r.health_employee));
    totGross  += gross;
    totBlEmp  += blEmp;
    totBlEr   += blEr;
    totHealth += heal;
    return f102SerializeLine({
      record_type:     '102',
      employer_id:     employerIdRaw,
      period,
      employee_id:     String(r.employee_id || r.national_id || '').replace(/\D/g, ''),
      employee_name:   String(r.employee_name || r.full_name || `Employee ${idx + 1}`).slice(0, 40),
      gross_wages:     gross,
      bl_employee:     blEmp,
      bl_employer:     blEr,
      health_employee: heal,
      filler:          '',
    });
  });

  // ── Trailer (record_type=999) — totals row ────────────────────────────
  const trailer = f102SerializeLine({
    record_type:     '999',
    employer_id:     employerIdRaw,
    period,
    employee_id:     rows.length,           // record_count packed into employee_id slot
    employee_name:   'TOTALS',
    gross_wages:     Math.round(totGross),
    bl_employee:     Math.round(totBlEmp),
    bl_employer:     Math.round(totBlEr),
    health_employee: Math.round(totHealth),
    filler:          '',
  });

  const lines = [header, ...detail, trailer];

  // Sanity — every line must be the canonical width.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length !== FORM102_RECORD_WIDTH) {
      throw new Error(
        `form-102.buildForm102File: line ${i} width ${lines[i].length}, expected ${FORM102_RECORD_WIDTH}`
      );
    }
  }
  const fixedWidth = lines.join('\r\n') + '\r\n';
  const buffer = F102_ICONV ? F102_ICONV.encode(fixedWidth, 'windows-1255') : null;

  // ── Totals object (used by JSON + UI) ─────────────────────────────────
  const totals = {
    record_count:    rows.length,
    gross_wages:     round2(totGross),
    bl_employee:     round2(totBlEmp),
    bl_employer:     round2(totBlEr),
    health_employee: round2(totHealth),
    payable_total:   round2(totBlEmp + totBlEr + totHealth),
  };

  // ── JSON representation ───────────────────────────────────────────────
  const json = {
    formCode: '102',
    version:  '2026.1',
    year,
    month,
    period,
    submission_type: submissionType,
    employer: {
      id:               employer.id || employer.employer_id || employer.company_id || '',
      name:             employer.name || employer.legal_name || '',
      tax_file_number:  employer.tax_file_number || employer.deductionFileNumber || '',
      bituach_leumi_no: employer.bituach_leumi_number || employer.bituachLeumiNumber || '',
    },
    rows: rows.map((r, idx) => ({
      employee_id:     String(r.employee_id || r.national_id || ''),
      employee_name:   String(r.employee_name || r.full_name || `Employee ${idx + 1}`),
      gross_wages:     round2(toNumber(r.gross_wages)),
      bl_employee:     round2(toNumber(r.bl_employee)),
      bl_employer:     round2(toNumber(r.bl_employer)),
      health_employee: round2(toNumber(r.health_employee)),
    })),
    totals,
    deadline: form102Deadline(year, month),
    generated_at: new Date().toISOString(),
  };

  // ── XML envelope ──────────────────────────────────────────────────────
  const x = (tag, body) =>
    body == null || body === ''
      ? `<${tag}/>`
      : `<${tag}>${typeof body === 'string' ? body : xmlEscape(body)}</${tag}>`;
  const rowXml = json.rows.map(r => [
    '<Employee>',
      x('NationalId',     xmlEscape(r.employee_id)),
      x('FullName',       xmlEscape(r.employee_name)),
      x('GrossWages',     Math.round(r.gross_wages)),
      x('BlEmployee',     Math.round(r.bl_employee)),
      x('BlEmployer',     Math.round(r.bl_employer)),
      x('HealthEmployee', Math.round(r.health_employee)),
    '</Employee>',
  ].join('')).join('');
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Form102 version="2026.1">' +
      '<Header>' +
        x('FormCode',       '102') +
        x('Year',           year) +
        x('Month',          month) +
        x('Period',         period) +
        x('SubmissionType', submissionType) +
        x('EmployerId',     xmlEscape(json.employer.id)) +
        x('EmployerName',   xmlEscape(json.employer.name)) +
        x('TaxFile',        xmlEscape(json.employer.tax_file_number)) +
        x('BituachLeumiNo', xmlEscape(json.employer.bituach_leumi_no)) +
        x('GeneratedAt',    xmlEscape(json.generated_at)) +
      '</Header>' +
      '<Employees>' + rowXml + '</Employees>' +
      '<Totals>' +
        x('RecordCount',    totals.record_count) +
        x('GrossWages',     Math.round(totals.gross_wages)) +
        x('BlEmployee',     Math.round(totals.bl_employee)) +
        x('BlEmployer',     Math.round(totals.bl_employer)) +
        x('HealthEmployee', Math.round(totals.health_employee)) +
        x('PayableTotal',   Math.round(totals.payable_total)) +
      '</Totals>' +
    '</Form102>';

  return {
    formCode: '102',
    version:  '2026.1',
    year,
    month,
    period,
    deadline: json.deadline,
    submission_type: submissionType,
    header,
    detail,
    trailer,
    totals,
    fixedWidth,
    buffer,
    json,
    xml,
    metadata: {
      encoding:    'windows-1255',
      recordWidth: FORM102_RECORD_WIDTH,
      lineCount:   lines.length,
      filename:    `form-102-${period}.txt`,
      generatedAt: json.generated_at,
    },
  };
}

/**
 * validateForm102File — structural check on a buildForm102File() result.
 * Returns an array of error strings (empty when the file is valid).
 */
function validateForm102File(file) {
  const errors = [];
  if (!file || typeof file !== 'object') return ['file is missing'];
  if (file.formCode !== '102') errors.push(`formCode mismatch: ${file.formCode}`);
  if (typeof file.fixedWidth !== 'string' || file.fixedWidth.length === 0) {
    errors.push('fixedWidth payload is missing');
  }
  if (typeof file.header !== 'string' || file.header.length !== FORM102_RECORD_WIDTH) {
    errors.push(`header width ${file.header?.length} != ${FORM102_RECORD_WIDTH}`);
  }
  if (file.header?.slice(0, 3) !== '100') errors.push('header record_type must be "100"');
  if (typeof file.trailer !== 'string' || file.trailer.length !== FORM102_RECORD_WIDTH) {
    errors.push(`trailer width ${file.trailer?.length} != ${FORM102_RECORD_WIDTH}`);
  }
  if (file.trailer?.slice(0, 3) !== '999') errors.push('trailer record_type must be "999"');
  if (!Array.isArray(file.detail)) errors.push('detail must be an array');
  else {
    file.detail.forEach((line, i) => {
      if (typeof line !== 'string' || line.length !== FORM102_RECORD_WIDTH) {
        errors.push(`detail[${i}] width ${line?.length} != ${FORM102_RECORD_WIDTH}`);
      } else if (line.slice(0, 3) !== '102') {
        errors.push(`detail[${i}] record_type must be "102"`);
      }
    });
  }
  if (!file.totals || typeof file.totals !== 'object') {
    errors.push('totals object missing');
  } else if (file.totals.record_count !== (file.detail?.length || 0)) {
    errors.push(`totals.record_count (${file.totals.record_count}) != detail length (${file.detail?.length})`);
  }
  if (!Number.isInteger(file.year) || file.year < 2000 || file.year > 2100) {
    errors.push('year must be a 4-digit integer');
  }
  if (!Number.isInteger(file.month) || file.month < 1 || file.month > 12) {
    errors.push('month must be 1..12');
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  generate102,
  submitXML102,

  // File builder API (parallel to form-856 / pcn874)
  buildForm102File,
  validateForm102File,
  form102Deadline,
  FORM102_FIELD_LAYOUT,
  FORM102_RECORD_WIDTH,
  FORM102_LABELS,

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
