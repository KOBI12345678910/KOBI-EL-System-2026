/**
 * form-102.test.js — tests for טופס 102 monthly withholding report.
 * Agent Y-003 / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Scope:
 *   • Bituach-Leumi threshold boundary (exactly 7,522 NIS)
 *   • Health-insurance brackets (low / high / capped)
 *   • Total reconciliation (section sums == grand total)
 *   • Controlling-shareholder special rates
 *   • Due-date rule (15th of following month, year rollover)
 *   • XML stub + submission envelope
 *   • Warnings for missing employer / invalid period
 */

'use strict';

const assert = require('node:assert/strict');
const test   = require('node:test');

const form102 = require('../../src/tax/form-102');

const {
  generate102,
  submitXML102,
  CONSTANTS_2026,
  computeBituachLeumi,
  computeHealth,
  computeIncomeTax,
  aggregate,
  dueDateFor,
  buildStubXml,
  buildPdfFields,
} = form102;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPLOYER = Object.freeze({
  employerId:          '513111111',
  employerName:        'טכנו קול עוזי בע"מ',
  deductionFileNumber: '940123456',
  bituachLeumiNumber:  '567890123',
  branchCode:          '001',
  address:             'רחוב הרצל 1, תל אביב',
  bankAccount:         'BANK-123',
});

const PERIOD_BASE = { year: 2026, month: 3 }; // March 2026 → due 2026-04-15

function row(overrides) {
  return Object.assign({
    employeeId:        'E001',
    employeeName:      'עובד לדוגמה',
    grossWages:        10000,
    incomeTaxWithheld: 1200,
    isControllingShareholder: false,
  }, overrides);
}

// ===========================================================================
// BL threshold boundary
// ===========================================================================

test('BL: gross exactly at threshold uses only low-rate bracket', () => {
  const bl = computeBituachLeumi({ grossWages: 7522 });
  const { BITUACH_LEUMI } = CONSTANTS_2026;

  // Expected: entire 7522 at low rate, zero at high rate
  const expectedEmployee = 7522 * BITUACH_LEUMI.EMPLOYEE_LOW_RATE;
  const expectedEmployer = 7522 * BITUACH_LEUMI.EMPLOYER_LOW_RATE;

  assert.equal(bl.employee, Math.round(expectedEmployee * 100) / 100);
  assert.equal(bl.employer, Math.round(expectedEmployer * 100) / 100);
  assert.equal(bl.capped, false);
});

test('BL: gross 1 shekel above threshold splits into two brackets', () => {
  const bl = computeBituachLeumi({ grossWages: 7523 });
  const { BITUACH_LEUMI } = CONSTANTS_2026;

  const expectedEmployee =
    7522 * BITUACH_LEUMI.EMPLOYEE_LOW_RATE +
       1 * BITUACH_LEUMI.EMPLOYEE_HIGH_RATE;
  const expectedEmployer =
    7522 * BITUACH_LEUMI.EMPLOYER_LOW_RATE +
       1 * BITUACH_LEUMI.EMPLOYER_HIGH_RATE;

  assert.equal(bl.employee, Math.round(expectedEmployee * 100) / 100);
  assert.equal(bl.employer, Math.round(expectedEmployer * 100) / 100);
});

test('BL: below threshold uses pure low rate', () => {
  const bl = computeBituachLeumi({ grossWages: 5000 });
  const { BITUACH_LEUMI } = CONSTANTS_2026;
  assert.equal(bl.employee, Math.round(5000 * BITUACH_LEUMI.EMPLOYEE_LOW_RATE * 100) / 100);
  assert.equal(bl.employer, Math.round(5000 * BITUACH_LEUMI.EMPLOYER_LOW_RATE * 100) / 100);
});

test('BL: above max base caps at MONTHLY_MAX_BASE', () => {
  const bl = computeBituachLeumi({ grossWages: 80000 });
  const { BITUACH_LEUMI } = CONSTANTS_2026;
  const low  = BITUACH_LEUMI.MONTHLY_THRESHOLD;
  const high = BITUACH_LEUMI.MONTHLY_MAX_BASE - BITUACH_LEUMI.MONTHLY_THRESHOLD;
  const expectedEmployee =
    low  * BITUACH_LEUMI.EMPLOYEE_LOW_RATE +
    high * BITUACH_LEUMI.EMPLOYEE_HIGH_RATE;

  assert.equal(bl.employee, Math.round(expectedEmployee * 100) / 100);
  assert.equal(bl.capped, true);
});

test('BL: blExempt row returns zeros', () => {
  const bl = computeBituachLeumi({ grossWages: 20000, blExempt: true });
  assert.equal(bl.employee, 0);
  assert.equal(bl.employer, 0);
});

test('BL: pre-supplied portions are trusted (wage-slip integration)', () => {
  const bl = computeBituachLeumi({
    grossWages:         10000,
    blEmployeePortion:  201.22,
    blEmployerPortion:  298.45,
  });
  assert.equal(bl.employee, 201.22);
  assert.equal(bl.employer, 298.45);
});

// ===========================================================================
// Health insurance brackets
// ===========================================================================

test('Health: exactly at threshold uses only low rate (3.1%)', () => {
  const h = computeHealth({ grossWages: 7522 });
  assert.equal(h.employee, Math.round(7522 * 0.031 * 100) / 100);
});

test('Health: 1 shekel above threshold splits brackets (3.1% + 5%)', () => {
  const h = computeHealth({ grossWages: 7523 });
  const expected = 7522 * 0.031 + 1 * 0.05;
  assert.equal(h.employee, Math.round(expected * 100) / 100);
});

test('Health: low bracket only for below-threshold income', () => {
  const h = computeHealth({ grossWages: 3000 });
  assert.equal(h.employee, Math.round(3000 * 0.031 * 100) / 100);
});

test('Health: caps at MONTHLY_MAX_BASE', () => {
  const h = computeHealth({ grossWages: 60000 });
  const { HEALTH } = CONSTANTS_2026;
  const low  = HEALTH.MONTHLY_THRESHOLD;
  const high = HEALTH.MONTHLY_MAX_BASE - HEALTH.MONTHLY_THRESHOLD;
  const expected = low * 0.031 + high * 0.05;
  assert.equal(h.employee, Math.round(expected * 100) / 100);
  assert.equal(h.capped, true);
});

// ===========================================================================
// Controlling-shareholder special rates
// ===========================================================================

test('Controlling shareholder: BL uses flat 7% / 7.6% (no low bracket)', () => {
  const bl = computeBituachLeumi({
    grossWages: 10000,
    isControllingShareholder: true,
  });
  // 10000 * 0.07 = 700 employee; 10000 * 0.076 = 760 employer
  assert.equal(bl.employee, 700);
  assert.equal(bl.employer, 760);
});

test('Controlling shareholder: Health uses flat 5%', () => {
  const h = computeHealth({
    grossWages: 10000,
    isControllingShareholder: true,
  });
  assert.equal(h.employee, 500);
});

test('Controlling shareholder row appears in its own section', () => {
  const result = generate102({
    year:  2026,
    month: 3,
    rows: [
      row({ employeeId: 'E100', grossWages: 15000, incomeTaxWithheld: 3000, isControllingShareholder: true }),
      row({ employeeId: 'E200', grossWages:  8000, incomeTaxWithheld:  700 }),
    ],
  }, EMPLOYER);

  const csSection = result.sections.find(s => s.key === 'controllingShareholder');
  assert.ok(csSection, 'expected a controllingShareholder section');
  assert.equal(csSection.count, 1);
  assert.equal(csSection.base, 15000);
  assert.ok(csSection.detail.incomeTax === 3000);
});

// ===========================================================================
// Total reconciliation
// ===========================================================================

test('Total reconciliation: sum of main sections == grand total', () => {
  const rows = [
    row({ employeeId: 'A', grossWages: 10000, incomeTaxWithheld: 1200 }),
    row({ employeeId: 'B', grossWages: 20000, incomeTaxWithheld: 4500 }),
    row({ employeeId: 'C', grossWages:  5000, incomeTaxWithheld:  300 }),
  ];
  const result = generate102({ year: 2026, month: 3, rows }, EMPLOYER);

  const it  = result.sections.find(s => s.key === 'incomeTax').amount;
  const blE = result.sections.find(s => s.key === 'bituachLeumiEmployee').amount;
  const blR = result.sections.find(s => s.key === 'bituachLeumiEmployer').amount;
  const he  = result.sections.find(s => s.key === 'healthEmployee').amount;

  const expected = Math.round((it + blE + blR + he) * 100) / 100;
  assert.equal(result.total, expected);
});

test('Total reconciliation: advances and prior credit reduce total', () => {
  const result = generate102({
    year:  2026,
    month: 3,
    rows: [row({ grossWages: 10000, incomeTaxWithheld: 1500 })],
    adjustments: { incomeTaxAdvance: 500, priorCredit: 100 },
  }, EMPLOYER);

  // Reconstruct: main sections total - 500 - 100 = grand total
  const mainTotal =
    result.sections.find(s => s.key === 'incomeTax').amount +
    result.sections.find(s => s.key === 'bituachLeumiEmployee').amount +
    result.sections.find(s => s.key === 'bituachLeumiEmployer').amount +
    result.sections.find(s => s.key === 'healthEmployee').amount;

  const expected = Math.round((mainTotal - 500 - 100) * 100) / 100;
  assert.equal(result.total, expected);
});

test('Total reconciliation: controlling-shareholder section NOT double-counted', () => {
  const rows = [
    row({ employeeId: 'CS1', grossWages: 20000, incomeTaxWithheld: 4000, isControllingShareholder: true }),
  ];
  const result = generate102({ year: 2026, month: 3, rows }, EMPLOYER);

  // Total should equal sum of the 4 main sections ONLY, even though the
  // CS section contains a roll-up amount field.
  const mainTotal =
    result.sections.find(s => s.key === 'incomeTax').amount +
    result.sections.find(s => s.key === 'bituachLeumiEmployee').amount +
    result.sections.find(s => s.key === 'bituachLeumiEmployer').amount +
    result.sections.find(s => s.key === 'healthEmployee').amount;

  assert.equal(result.total, Math.round(mainTotal * 100) / 100);
});

// ===========================================================================
// Due date
// ===========================================================================

test('Due date: March 2026 → 2026-04-15', () => {
  assert.equal(dueDateFor({ year: 2026, month: 3 }), '2026-04-15');
});

test('Due date: December rolls into next year (Dec 2026 → 2027-01-15)', () => {
  assert.equal(dueDateFor({ year: 2026, month: 12 }), '2027-01-15');
});

test('Due date: January (Jan 2026 → 2026-02-15)', () => {
  assert.equal(dueDateFor({ year: 2026, month: 1 }), '2026-02-15');
});

test('Due date: invalid period returns empty string', () => {
  assert.equal(dueDateFor({ year: 2026, month: 13 }), '');
  assert.equal(dueDateFor({}), '');
});

test('generate102: result.dueDate === result.payableBy', () => {
  const r = generate102({ year: 2026, month: 5, rows: [row()] }, EMPLOYER);
  assert.equal(r.dueDate, r.payableBy);
  assert.equal(r.dueDate, '2026-06-15');
});

// ===========================================================================
// XML + envelope
// ===========================================================================

test('XML: includes form code, period, and main sections', () => {
  const result = generate102({
    year: 2026,
    month: 3,
    rows: [row({ grossWages: 10000, incomeTaxWithheld: 1500 })],
  }, EMPLOYER);

  const xml = result.xml;
  assert.match(xml, /<FormCode>102<\/FormCode>/);
  assert.match(xml, /<TaxYear>2026<\/TaxYear>/);
  assert.match(xml, /<TaxMonth>3<\/TaxMonth>/);
  assert.match(xml, /<IncomeTax>/);
  assert.match(xml, /<BituachLeumi>/);
  assert.match(xml, /<HealthInsurance>/);
  assert.match(xml, /<Summary>/);
  assert.match(xml, /<DueDate>2026-04-15<\/DueDate>/);
});

test('XML: Hebrew employer name is properly escaped', () => {
  const result = generate102({ year: 2026, month: 3, rows: [row()] }, EMPLOYER);
  // Hebrew + quoted chars: name contains " which must be escaped
  assert.ok(result.xml.includes('טכנו קול עוזי'));
  assert.ok(result.xml.includes('&quot;מ'));
});

test('submitXML102: returns envelope with placeholder signature', () => {
  const result = generate102({ year: 2026, month: 3, rows: [row()] }, EMPLOYER);
  const submission = submitXML102(result);

  assert.ok(submission.envelope.includes('<SubmissionEnvelope'));
  assert.ok(submission.envelope.includes('PLACEHOLDER'));
  assert.equal(submission.status, 'prepared');
  assert.equal(submission.headers['X-Form-Code'], '102');
  assert.equal(submission.headers['X-Submitter-Id'], EMPLOYER.employerId);
});

test('submitXML102: throws when xml is missing', () => {
  assert.throws(() => submitXML102({}), /`data\.xml` is required/);
});

// ===========================================================================
// PDF fields
// ===========================================================================

test('pdfFields: contains all box codes', () => {
  const result = generate102({
    year: 2026,
    month: 3,
    rows: [
      row({ grossWages: 10000, incomeTaxWithheld: 1500 }),
      row({ employeeId: 'E002', grossWages: 8000, incomeTaxWithheld: 800 }),
    ],
  }, EMPLOYER);

  const pdf = result.pdfFields;
  assert.equal(pdf.form_code, '102');
  assert.equal(pdf.tax_year, 2026);
  assert.equal(pdf.tax_month, 3);
  assert.equal(pdf.period_label_he, '03/2026');
  assert.equal(pdf.employees_count, 2);
  assert.equal(pdf.total_gross_wages, 18000);
  assert.equal(pdf.employer_id, EMPLOYER.employerId);
  assert.equal(pdf.due_date, '2026-04-15');
  assert.equal(pdf.grand_total, result.total);
});

// ===========================================================================
// Warnings / validation
// ===========================================================================

test('Warnings: missing employerId is flagged', () => {
  const r = generate102({ year: 2026, month: 3, rows: [row()] }, { employerName: 'X' });
  assert.ok(r.warnings.some(w => /employerId/.test(w)));
});

test('Warnings: invalid month is flagged', () => {
  const r = generate102({ year: 2026, month: 14, rows: [row()] }, EMPLOYER);
  assert.ok(r.warnings.some(w => /month/.test(w)));
});

test('Empty payroll: zero totals, no crash', () => {
  const r = generate102({ year: 2026, month: 3, rows: [] }, EMPLOYER);
  assert.equal(r.total, 0);
  assert.equal(r.meta.aggregation.employeesCount, 0);
});

test('aggregate: skips negative gross rows with warning', () => {
  const agg = aggregate([
    row({ grossWages: -500, incomeTaxWithheld: 0 }),
    row({ grossWages:  1000, incomeTaxWithheld: 100 }),
  ]);
  assert.equal(agg.employeesCount, 1);
  assert.equal(agg.totalGrossWages, 1000);
  assert.ok(agg.warnings.some(w => /negative/.test(w)));
});

test('aggregate: skips non-object rows with warning', () => {
  const agg = aggregate([null, undefined, 42, row({ grossWages: 100, incomeTaxWithheld: 10 })]);
  assert.equal(agg.employeesCount, 1);
  assert.ok(agg.warnings.length >= 3);
});

// ===========================================================================
// Constants sanity — make sure we're testing the 2026 values
// ===========================================================================

test('CONSTANTS_2026: threshold is 7522', () => {
  assert.equal(CONSTANTS_2026.BITUACH_LEUMI.MONTHLY_THRESHOLD, 7522);
  assert.equal(CONSTANTS_2026.HEALTH.MONTHLY_THRESHOLD, 7522);
});

test('CONSTANTS_2026: BL employee rates 0.4% / 7%', () => {
  assert.equal(CONSTANTS_2026.BITUACH_LEUMI.EMPLOYEE_LOW_RATE,  0.004);
  assert.equal(CONSTANTS_2026.BITUACH_LEUMI.EMPLOYEE_HIGH_RATE, 0.07);
});

test('CONSTANTS_2026: BL employer rates 3.55% / 7.6%', () => {
  assert.equal(CONSTANTS_2026.BITUACH_LEUMI.EMPLOYER_LOW_RATE,  0.0355);
  assert.equal(CONSTANTS_2026.BITUACH_LEUMI.EMPLOYER_HIGH_RATE, 0.076);
});

test('CONSTANTS_2026: Health rates 3.1% / 5%', () => {
  assert.equal(CONSTANTS_2026.HEALTH.EMPLOYEE_LOW_RATE,  0.031);
  assert.equal(CONSTANTS_2026.HEALTH.EMPLOYEE_HIGH_RATE, 0.05);
});
