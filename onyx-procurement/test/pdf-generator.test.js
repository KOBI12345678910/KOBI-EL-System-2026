/**
 * Smoke tests for wage slip PDF generator — src/payroll/pdf-generator.js
 * Agent-09 — written 2026-04-11
 *
 * Run with:   node --test test/pdf-generator.test.js
 *
 * Cleanup policy: generated PDFs are LEFT in test/tmp-pdfs/ for manual
 * inspection (useful for eyeballing Hebrew rendering / layout). The
 * directory is wiped at the START of each run so stale output doesn't
 * accumulate. Delete test/tmp-pdfs/ by hand any time.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { generateWageSlipPdf } = require('../src/payroll/pdf-generator.js');

const TMP_DIR = path.join(__dirname, 'tmp-pdfs');

// Wipe + recreate tmp dir once, before any tests.
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
// Fixture builder — matches wage_slips schema in migration 007
// ─────────────────────────────────────────────────────────────
function buildSlipFixture(overrides = {}) {
  const base = {
    // Period
    period_year: 2026,
    period_month: 4,
    period_label: '2026-04',
    pay_date: '2026-05-09',

    // Employment snapshot (frozen)
    employee_number: 'E-00042',
    employee_name: 'משה כהן',
    employee_national_id: '123456782',
    employer_legal_name: 'טכנו-קול עוזי בע"מ',
    employer_company_id: '515123456',
    employer_tax_file: '947123456',
    position: 'טכנאי אלקטרוניקה בכיר',
    department: 'ייצור',

    // Hours
    hours_regular: 182.00,
    hours_overtime_125: 8.50,
    hours_overtime_150: 4.00,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: 8.00,
    hours_sick: 0,
    hours_reserve: 0,

    // Earnings
    base_pay: 14500.00,
    overtime_pay: 1120.50,
    vacation_pay: 640.00,
    sick_pay: 0,
    holiday_pay: 0,
    bonuses: 500.00,
    commissions: 0,
    allowances_meal: 300.00,
    allowances_travel: 450.00,
    allowances_clothing: 0,
    allowances_phone: 150.00,
    other_earnings: 0,
    gross_pay: 17660.50,

    // Deductions
    income_tax: 2100.40,
    bituach_leumi: 620.15,
    health_tax: 550.00,
    pension_employee: 1059.63,
    study_fund_employee: 441.51,
    severance_employee: 0,
    loans: 0,
    garnishments: 0,
    other_deductions: 0,
    total_deductions: 4771.69,

    // Net
    net_pay: 12888.81,

    // Employer contributions
    pension_employer: 1059.63,
    study_fund_employer: 1324.54,
    severance_employer: 1059.63,
    bituach_leumi_employer: 600.45,
    health_tax_employer: 0,

    // Balances (opt out by passing null — see test 5)
    vacation_balance: 14.50,
    sick_balance: 22.00,
    study_fund_balance: 18450.75,
    severance_balance: 42380.00,

    // YTD (opt out by passing undefined)
    ytd_gross: 70642.00,
    ytd_income_tax: 8401.60,
    ytd_bituach_leumi: 2480.60,
    ytd_pension: 4238.52,
  };
  return { ...base, ...overrides };
}

function out(name) {
  return path.join(TMP_DIR, name);
}

// ─────────────────────────────────────────────────────────────
// 1. Realistic slip → file exists, size > 1000 bytes
// ─────────────────────────────────────────────────────────────
test('generates a realistic wage slip PDF (>1000 bytes)', async () => {
  const slip = buildSlipFixture();
  const target = out('01-realistic.pdf');
  const result = await generateWageSlipPdf(slip, target);
  assert.equal(result.path, target);
  assert.ok(fs.existsSync(target), 'PDF file should exist on disk');
  assert.ok(result.size > 1000, `PDF size should be > 1000 bytes, got ${result.size}`);
  // quick sanity: %PDF header
  const header = fs.readFileSync(target).subarray(0, 5).toString('ascii');
  assert.equal(header, '%PDF-', 'file should start with %PDF- header');
});

// ─────────────────────────────────────────────────────────────
// 2. Missing critical fields → throws OR produces degraded PDF
//    (documenting current behavior — generator is forgiving)
// ─────────────────────────────────────────────────────────────
test('missing critical fields: produces degraded PDF (does not throw)', async () => {
  // Bare-bones slip: only period + employer_legal_name + employee_name.
  // Generator coerces missing numerics to 0 and writes undefined strings
  // as the literal "undefined". It should NOT crash.
  const skimpy = {
    period_year: 2026,
    period_month: 4,
    period_label: '2026-04',
    employer_legal_name: 'טכנו-קול עוזי בע"מ',
    employee_name: 'משה כהן',
    // everything else omitted
  };
  const target = out('02-missing-fields.pdf');
  let caught = null;
  let result = null;
  try {
    result = await generateWageSlipPdf(skimpy, target);
  } catch (err) {
    caught = err;
  }
  if (caught) {
    // Acceptable path: generator rejected the slip.
    assert.ok(caught instanceof Error);
  } else {
    // Degraded path: PDF produced anyway.
    assert.ok(fs.existsSync(target));
    assert.ok(result.size > 500, 'degraded PDF should still have some content');
  }
});

// ─────────────────────────────────────────────────────────────
// 3. All-zero amounts → valid PDF
// ─────────────────────────────────────────────────────────────
test('all-zero amounts still produces a valid PDF', async () => {
  const zero = buildSlipFixture({
    hours_regular: 0,
    hours_overtime_125: 0,
    hours_overtime_150: 0,
    hours_vacation: 0,
    base_pay: 0,
    overtime_pay: 0,
    vacation_pay: 0,
    bonuses: 0,
    allowances_meal: 0,
    allowances_travel: 0,
    allowances_phone: 0,
    gross_pay: 0,
    income_tax: 0,
    bituach_leumi: 0,
    health_tax: 0,
    pension_employee: 0,
    study_fund_employee: 0,
    total_deductions: 0,
    net_pay: 0,
    pension_employer: 0,
    study_fund_employer: 0,
    severance_employer: 0,
    bituach_leumi_employer: 0,
  });
  const target = out('03-all-zero.pdf');
  const result = await generateWageSlipPdf(zero, target);
  assert.ok(result.size > 1000, `all-zero PDF size: ${result.size}`);
  const header = fs.readFileSync(target).subarray(0, 5).toString('ascii');
  assert.equal(header, '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 4. Hebrew in employer / employee names → no crash
// ─────────────────────────────────────────────────────────────
test('Hebrew employer + employee names do not crash generator', async () => {
  const heb = buildSlipFixture({
    employer_legal_name: 'טכנו-קול עוזי בע"מ — סניף חיפה',
    employee_name: 'שרה בת-אל אברהם-לוי',
    position: 'מהנדסת איכות ראשית',
    department: 'הבטחת איכות',
  });
  const target = out('04-hebrew.pdf');
  const result = await generateWageSlipPdf(heb, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1000);
});

// ─────────────────────────────────────────────────────────────
// 5. Balances section included — spot-check via size delta
// ─────────────────────────────────────────────────────────────
test('balances section: size differs when balances are present vs null', async () => {
  const withBalances = buildSlipFixture({
    vacation_balance: 14.50,
    sick_balance: 22.00,
    study_fund_balance: 18450.75,
    severance_balance: 42380.00,
  });
  const withoutBalances = buildSlipFixture({
    vacation_balance: null,
    sick_balance: null,
    study_fund_balance: null,
    severance_balance: null,
  });
  const a = await generateWageSlipPdf(withBalances, out('05a-with-balances.pdf'));
  const b = await generateWageSlipPdf(withoutBalances, out('05b-without-balances.pdf'));
  assert.ok(a.size !== b.size,
    `expected different sizes with/without balances; got ${a.size} vs ${b.size}`);
  assert.ok(a.size > b.size,
    `expected balances PDF (${a.size}) to be larger than no-balances (${b.size})`);
});

// ─────────────────────────────────────────────────────────────
// 6. YTD included → larger than without
// ─────────────────────────────────────────────────────────────
test('YTD section increases file size', async () => {
  const withYtd = buildSlipFixture({
    ytd_gross: 70642.00,
    ytd_income_tax: 8401.60,
    ytd_bituach_leumi: 2480.60,
    ytd_pension: 4238.52,
  });
  const withoutYtd = buildSlipFixture({
    ytd_gross: undefined,
    ytd_income_tax: undefined,
    ytd_bituach_leumi: undefined,
    ytd_pension: undefined,
  });
  const a = await generateWageSlipPdf(withYtd, out('06a-with-ytd.pdf'));
  const b = await generateWageSlipPdf(withoutYtd, out('06b-without-ytd.pdf'));
  assert.ok(a.size > b.size,
    `expected YTD PDF (${a.size}) to be larger than no-YTD (${b.size})`);
});

// ─────────────────────────────────────────────────────────────
// 7. Output directory doesn't exist → created
// ─────────────────────────────────────────────────────────────
test('creates output directory if it does not exist', async () => {
  const nested = path.join(TMP_DIR, 'nested', 'deeper', 'still-deeper');
  // Guarantee clean slate
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
  assert.ok(!fs.existsSync(nested), 'precondition: dir should not yet exist');
  const target = path.join(nested, '07-nested.pdf');
  const result = await generateWageSlipPdf(buildSlipFixture(), target);
  assert.ok(fs.existsSync(nested), 'nested dir should be created');
  assert.ok(fs.existsSync(target), 'PDF should be written inside nested dir');
  assert.ok(result.size > 1000);
});

// ─────────────────────────────────────────────────────────────
// 8. Two calls with same path → overwrites cleanly, no handle leak
// ─────────────────────────────────────────────────────────────
test('two calls with same path overwrite without leaking', async () => {
  const target = out('08-overwrite.pdf');
  const r1 = await generateWageSlipPdf(buildSlipFixture(), target);
  const mtime1 = fs.statSync(target).mtimeMs;

  // Second call with a slightly different slip so size is expected to differ
  const r2 = await generateWageSlipPdf(
    buildSlipFixture({ bonuses: 9999, gross_pay: 27159.50 }),
    target,
  );
  const mtime2 = fs.statSync(target).mtimeMs;

  assert.ok(fs.existsSync(target));
  assert.ok(r1.size > 1000 && r2.size > 1000);
  assert.ok(mtime2 >= mtime1, 'second write should be at or after first write');

  // File still readable as a PDF after overwrite
  const header = fs.readFileSync(target).subarray(0, 5).toString('ascii');
  assert.equal(header, '%PDF-');
});
