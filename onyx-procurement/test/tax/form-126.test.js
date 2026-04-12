/**
 * form-126.test.js — unit + integration tests for טופס 126 engine.
 * Agent Y-004 — Techno-Kol Uzi Mega-ERP
 *
 * Run:    node --test test/tax/form-126.test.js
 *
 * Covers:
 *   • aggregate across 12 months per employee
 *   • leaver (mid-year termination) calculation
 *   • joiner (mid-year hire) calculation
 *   • employer column totals
 *   • reconciliation against Form 102 (match + mismatch)
 *   • electronic fixed-width file format + round-trip
 *   • XML envelope well-formedness
 *   • distributeToEmployees fallback text output
 *   • input immutability — "לא מוחקים רק משדרגים"
 *
 * Zero external test deps — built-in node:test runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
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
  RECORD_WIDTH,
  TRAILER_WIDTH,
  createEngine,
} = require(path.resolve(__dirname, '..', '..', 'src', 'tax', 'form-126.js'));

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function makeSlip(year, month, overrides = {}) {
  return {
    slip_id: `slip-${year}-${String(month).padStart(2, '0')}-${overrides.employee_id || 'x'}`,
    employee_id: overrides.employee_id || 'E001',
    period_year: year,
    period_month: month,
    period_label: `${year}-${String(month).padStart(2, '0')}`,
    pay_date: `${year}-${String(month).padStart(2, '0')}-28`,
    gross_pay: 10000,
    taxable_base: 10000,
    income_tax: 1200,
    bituach_leumi: 400,
    health_tax: 310,
    pension_employee: 600,
    study_fund_employee: 250,
    net_pay: 10000 - (1200 + 400 + 310 + 600 + 250),
    loans: 0,
    garnishments: 0,
    other_deductions: 0,
    pension_employer: 650,
    study_fund_employer: 750,
    severance_employer: 833,
    bituach_leumi_employer: 760,
    health_tax_employer: 0,
    ...overrides,
  };
}

function makeEmployer() {
  return {
    company_id: '513456789',
    legal_name: 'Onyx Construction Ltd',
    tax_file_number: '946123456',
    address: 'Tel Aviv',
    contact: 'Uzi',
  };
}

function makeFullYearEmployee(year, overrides = {}) {
  const slips = [];
  for (let m = 1; m <= 12; m++) {
    slips.push(makeSlip(year, m, { employee_id: overrides.id || 'E001' }));
  }
  return {
    id: 'E001',
    national_id: '039123456',
    employee_number: 'EMP-0001',
    full_name: 'Uzi Tekno Test',
    hire_date: '2024-06-01',
    termination_date: null,
    tax_credits: 2.25,
    slips,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// TEST 1 — Multi-month aggregation (full year)
// ─────────────────────────────────────────────────────────────

test('aggregateEmployee — full year sums 12 months correctly', () => {
  const year = 2026;
  const emp = makeFullYearEmployee(year);
  const rec = aggregateEmployee(emp, year);

  assert.equal(rec.year, year);
  assert.equal(rec.full_name, 'Uzi Tekno Test');
  assert.equal(rec.national_id, '039123456');
  assert.equal(rec.gross_total,        120000, 'gross = 12 × 10000');
  assert.equal(rec.income_tax_total,   14400,  'tax = 12 × 1200');
  assert.equal(rec.bituach_leumi_total, 4800);
  assert.equal(rec.health_tax_total,   3720);
  assert.equal(rec.pension_total,      7200);
  assert.equal(rec.study_fund_total,   3000);
  // 10000 - (1200+400+310+600+250) = 7240 net/mo × 12 = 86880
  assert.equal(rec.net_total,          86880);
  assert.equal(rec.employment_period.months_worked, 12);
  assert.equal(rec.employment_period.is_leaver, false);
  assert.equal(rec.employment_period.is_joiner, false);
  assert.equal(rec.credit_points, 2.25);
  assert.equal(Object.keys(rec.months_detail).length, 12);
  assert.equal(rec._self_check.ok, true, 'net self-check must reconcile');
});

test('aggregateEmployee — ignores slips outside the reporting year', () => {
  const emp = makeFullYearEmployee(2026);
  emp.slips.push(makeSlip(2025, 12, { gross_pay: 99999 })); // noise
  const rec = aggregateEmployee(emp, 2026);
  assert.equal(rec.gross_total, 120000);
});

test('aggregateEmployee — ignores slips with invalid month', () => {
  const emp = makeFullYearEmployee(2026);
  emp.slips.push(makeSlip(2026, 13, { gross_pay: 99999 })); // invalid
  const rec = aggregateEmployee(emp, 2026);
  assert.equal(rec.gross_total, 120000);
});

// ─────────────────────────────────────────────────────────────
// TEST 2 — Leaver (mid-year termination)
// ─────────────────────────────────────────────────────────────

test('aggregateEmployee — leaver terminates in June, 6 months worked', () => {
  const year = 2026;
  const slips = [];
  for (let m = 1; m <= 6; m++) {
    slips.push(makeSlip(year, m, { employee_id: 'E002' }));
  }
  const emp = {
    id: 'E002',
    national_id: '028999111',
    employee_number: 'EMP-0002',
    full_name: 'Rina Leaver',
    hire_date: '2020-03-01',
    termination_date: '2026-06-30',
    tax_credits: 2.25,
    slips,
  };
  const rec = aggregateEmployee(emp, year);

  assert.equal(rec.employment_period.is_leaver, true);
  assert.equal(rec.employment_period.is_joiner, false);
  assert.equal(rec.employment_period.months_worked, 6);
  assert.equal(rec.employment_period.from, '2026-01-01');
  assert.equal(rec.employment_period.to, '2026-06-30');
  assert.equal(rec.gross_total, 60000, '6 × 10000');
  assert.equal(rec.net_total, 43440, '7240 × 6');
});

// ─────────────────────────────────────────────────────────────
// TEST 3 — Joiner (mid-year hire)
// ─────────────────────────────────────────────────────────────

test('aggregateEmployee — joiner starts July, 6 months worked', () => {
  const year = 2026;
  const slips = [];
  for (let m = 7; m <= 12; m++) {
    slips.push(makeSlip(year, m, { employee_id: 'E003' }));
  }
  const emp = {
    id: 'E003',
    national_id: '301234567',
    employee_number: 'EMP-0003',
    full_name: 'Avi Joiner',
    hire_date: '2026-07-01',
    termination_date: null,
    tax_credits: 2.25,
    slips,
  };
  const rec = aggregateEmployee(emp, year);

  assert.equal(rec.employment_period.is_joiner, true);
  assert.equal(rec.employment_period.is_leaver, false);
  assert.equal(rec.employment_period.months_worked, 6);
  assert.equal(rec.employment_period.from, '2026-07-01');
  assert.equal(rec.employment_period.to, '2026-12-31');
  assert.equal(rec.gross_total, 60000);
});

// ─────────────────────────────────────────────────────────────
// TEST 4 — Employer summary
// ─────────────────────────────────────────────────────────────

test('buildEmployerSummary — sums totals across employees', () => {
  const year = 2026;
  const r1 = aggregateEmployee(makeFullYearEmployee(year), year);
  const r2 = aggregateEmployee(makeFullYearEmployee(year, {
    id: 'E002',
    national_id: '028999111',
    employee_number: 'EMP-0002',
    full_name: 'Second Uzi',
    slips: Array.from({ length: 12 }, (_, i) =>
      makeSlip(year, i + 1, { employee_id: 'E002', gross_pay: 15000,
        income_tax: 2500, bituach_leumi: 600, health_tax: 450,
        pension_employee: 900, study_fund_employee: 375,
        net_pay: 15000 - (2500 + 600 + 450 + 900 + 375) })),
  }), year);

  const s = buildEmployerSummary([r1, r2], year, makeEmployer());
  assert.equal(s.record_count, 2);
  assert.equal(s.gross_total, 120000 + 180000);
  assert.equal(s.income_tax_total, 14400 + 30000);
  assert.equal(s.employer_id, '513456789');
  assert.equal(s.employer_name, 'Onyx Construction Ltd');
  assert.equal(s.leavers_count, 0);
  assert.equal(s.joiners_count, 0);
});

// ─────────────────────────────────────────────────────────────
// TEST 5 — Reconciliation against Form 102
// ─────────────────────────────────────────────────────────────

test('reconcileWith102 — matches when monthly totals agree', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);

  const form102 = [];
  for (let m = 1; m <= 12; m++) {
    form102.push({
      year, month: m,
      total_gross: 10000,
      total_income_tax: 1200,
      total_bituach_leumi: 400,
      total_health_tax: 310,
      total_pension_employee: 600,
      total_study_fund_employee: 250,
    });
  }
  const rec = reconcileWith102([r], form102);
  assert.equal(rec.ok, true);
  assert.equal(rec.diffs.length, 0);
  assert.equal(rec.months_checked, 12);
});

test('reconcileWith102 — flags mismatches when 102 differs from 126', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);

  const form102 = [{
    year, month: 3,
    total_gross: 9000,                  // wrong (10000 expected)
    total_income_tax: 1200,
    total_bituach_leumi: 400,
    total_health_tax: 310,
    total_pension_employee: 600,
    total_study_fund_employee: 250,
  }];
  const rec = reconcileWith102([r], form102);
  assert.equal(rec.ok, false);
  assert.equal(rec.diffs.length, 1);
  assert.equal(rec.diffs[0].field, 'gross');
  assert.equal(rec.diffs[0].delta, 1000);
});

test('reconcileWith102 — tolerance swallows rounding noise', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);

  const form102 = [{
    year, month: 1,
    total_gross: 10000.5,               // half a shekel off
    total_income_tax: 1200,
    total_bituach_leumi: 400,
    total_health_tax: 310,
    total_pension_employee: 600,
    total_study_fund_employee: 250,
  }];
  const rec = reconcileWith102([r], form102, { tolerance: 1 });
  assert.equal(rec.ok, true);
});

// ─────────────────────────────────────────────────────────────
// TEST 6 — Electronic file (fixed-width) format & round-trip
// ─────────────────────────────────────────────────────────────

test('buildElectronicFile — line widths are consistent', () => {
  const year = 2026;
  const records = [aggregateEmployee(makeFullYearEmployee(year), year)];
  const summary = buildEmployerSummary(records, year, makeEmployer());
  const { fixedWidth, lineCount, recordWidth } = buildElectronicFile(
    records, summary
  );
  assert.equal(recordWidth, RECORD_WIDTH);
  // IMPORTANT: do NOT .trim() — trailing spaces are significant in fixed width.
  // Drop only the terminating newline(s) so the final trailer keeps its filler.
  const lines = fixedWidth.replace(/\n+$/, '').split('\n');
  assert.equal(lineCount, lines.length);
  assert.equal(lineCount, 3, '1 header + 1 record + 1 trailer');

  // Header and data lines share RECORD_WIDTH; trailer uses TRAILER_WIDTH.
  assert.equal(lines[0].length, RECORD_WIDTH, 'header width');
  assert.equal(lines[1].length, RECORD_WIDTH, 'data line width');
  assert.equal(lines[2].length, TRAILER_WIDTH, 'trailer width');
});

test('buildElectronicFile — data line round-trips through parseDataLine', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);
  const summary = buildEmployerSummary([r], year, makeEmployer());
  const { fixedWidth } = buildElectronicFile([r], summary);
  const lines = fixedWidth.replace(/\n+$/, '').split('\n');
  const parsed = parseDataLine(lines[1]);

  assert.equal(parsed.record_type, 126);
  assert.equal(parsed.employer_id, 513456789);
  assert.equal(parsed.tax_year, year);
  assert.equal(parsed.national_id, 39123456);     // leading 0 stripped in numeric
  assert.equal(parsed.full_name.trim(), 'Uzi Tekno Test');
  assert.equal(parsed.months_worked, 12);
  assert.equal(parsed.credit_points, 2.25);
  assert.equal(parsed.gross_total, 120000);
  assert.equal(parsed.income_tax_total, 14400);
  assert.equal(parsed.net_total, 86880);
});

test('buildElectronicFile — trailer totals match data lines', () => {
  const year = 2026;
  const records = [
    aggregateEmployee(makeFullYearEmployee(year), year),
    aggregateEmployee(makeFullYearEmployee(year, {
      id: 'E002', national_id: '028999111', employee_number: 'EMP-0002',
      full_name: 'Second Uzi' }), year),
  ];
  const summary = buildEmployerSummary(records, year, makeEmployer());
  const { fixedWidth } = buildElectronicFile(records, summary);
  const lines = fixedWidth.replace(/\n+$/, '').split('\n');
  const trailer = parseTrailerLine(lines[lines.length - 1]);

  assert.equal(trailer.record_type, 999);
  assert.equal(trailer.record_count, 2);
  assert.equal(trailer.gross_total, 240000);
  assert.equal(trailer.income_tax_total, 28800);
});

test('buildElectronicFile — XML envelope is well-formed & contains key tags', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);
  const summary = buildEmployerSummary([r], year, makeEmployer());
  const { xml } = buildElectronicFile([r], summary);
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /<Form126[^>]*version="2026\.1"/);
  assert.match(xml, /<FormCode>126<\/FormCode>/);
  assert.match(xml, /<TaxYear>2026<\/TaxYear>/);
  assert.match(xml, /<EmployerId>513456789<\/EmployerId>/);
  assert.match(xml, /<RecordCount>1<\/RecordCount>/);
  assert.match(xml, /<Gross>120000<\/Gross>/);
  // tag balance sanity
  const opens = (xml.match(/<[^/!?][^>]*[^/]>/g) || []).length;
  const closes = (xml.match(/<\/[^>]+>/g) || []).length;
  assert.equal(opens, closes, 'every opening tag has a matching close');
});

// ─────────────────────────────────────────────────────────────
// TEST 7 — Top-level generate126 entry point
// ─────────────────────────────────────────────────────────────

test('generate126 — end-to-end with reconciliation', () => {
  const year = 2026;
  const e1 = makeFullYearEmployee(year);
  const e2 = {
    id: 'E002',
    national_id: '028999111',
    employee_number: 'EMP-0002',
    full_name: 'Second Uzi',
    hire_date: '2026-07-01',   // joiner
    termination_date: null,
    tax_credits: 2.25,
    slips: Array.from({ length: 6 }, (_, i) =>
      makeSlip(year, i + 7, { employee_id: 'E002' })),
  };

  const form102 = [];
  for (let m = 1; m <= 12; m++) {
    const isSecond = m >= 7;
    form102.push({
      year, month: m,
      total_gross:              10000 + (isSecond ? 10000 : 0),
      total_income_tax:         1200  + (isSecond ? 1200 : 0),
      total_bituach_leumi:      400   + (isSecond ? 400 : 0),
      total_health_tax:         310   + (isSecond ? 310 : 0),
      total_pension_employee:   600   + (isSecond ? 600 : 0),
      total_study_fund_employee:250   + (isSecond ? 250 : 0),
    });
  }

  const result = generate126({
    year, employees: [e1, e2], employer: makeEmployer(),
    form102Submissions: form102,
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.summary.record_count, 2);
  assert.equal(result.summary.joiners_count, 1);
  assert.equal(result.summary.leavers_count, 0);
  assert.equal(result.summary.gross_total, 120000 + 60000);
  assert.equal(result.reconciliation.ok, true);
  assert.ok(result.electronicFile.fixedWidth.length > 0);
  assert.ok(result.electronicFile.xml.length > 0);
});

test('generate126 — throws on bad payload', () => {
  assert.throws(() => generate126(null));
  assert.throws(() => generate126({ year: 'x', employees: [] }));
  assert.throws(() => generate126({ year: 2026, employees: 'not-array' }));
});

// ─────────────────────────────────────────────────────────────
// TEST 8 — distributeToEmployees + Form 106
// ─────────────────────────────────────────────────────────────

test('buildForm106 — contains Hebrew labels and employee data', () => {
  const year = 2026;
  const r = aggregateEmployee(makeFullYearEmployee(year), year);
  const body = buildForm106(r, makeEmployer(), year, 'he');

  assert.match(body, /טופס 106/);
  assert.match(body, /Uzi Tekno Test/);
  assert.match(body, /039123456/);
  assert.match(body, /120,000\.00/);
  assert.match(body, /שנת מס: 2026/);
});

test('distributeToEmployees — produces text fallback when pdfkit unavailable', async () => {
  const year = 2026;
  const result = generate126({
    year,
    employees: [makeFullYearEmployee(year)],
    employer: makeEmployer(),
  });

  const dist = await distributeToEmployees(result, { lang: 'he' });
  assert.equal(dist.count, 1);
  assert.equal(dist.pdfs[0].employee_number, 'EMP-0001');
  // Fallback is text when pdfkit isn't installed in this repo.
  assert.ok(['text', 'pdf'].includes(dist.pdfs[0].format));
  if (dist.pdfs[0].format === 'text') {
    assert.match(dist.pdfs[0].content, /טופס 106/);
    assert.match(dist.pdfs[0].filename, /\.txt$/);
  } else {
    assert.ok(Buffer.isBuffer(dist.pdfs[0].content));
    assert.match(dist.pdfs[0].filename, /\.pdf$/);
  }
});

// ─────────────────────────────────────────────────────────────
// TEST 9 — Immutability ("לא מוחקים רק משדרגים")
// ─────────────────────────────────────────────────────────────

test('generate126 — does NOT mutate input employees/slips', () => {
  const year = 2026;
  const e = makeFullYearEmployee(year);
  const beforeJson = JSON.stringify(e);
  generate126({ year, employees: [e], employer: makeEmployer() });
  const afterJson = JSON.stringify(e);
  assert.equal(beforeJson, afterJson, 'input employee must be untouched');
});

// ─────────────────────────────────────────────────────────────
// TEST 10 — createEngine isolates state
// ─────────────────────────────────────────────────────────────

test('createEngine — returns an isolated instance', () => {
  const eng = createEngine();
  assert.equal(typeof eng.generate126, 'function');
  assert.equal(typeof eng.aggregateEmployee, 'function');
  assert.equal(typeof eng.reconcileWith102, 'function');
  assert.equal(eng.RECORD_WIDTH, RECORD_WIDTH);
  assert.ok(Array.isArray(eng.FIELD_LAYOUT));
});

// ─────────────────────────────────────────────────────────────
// TEST 11 — Layout width matches constant
// ─────────────────────────────────────────────────────────────

test('FIELD_LAYOUT — width sum equals RECORD_WIDTH constant', () => {
  const sum = FIELD_LAYOUT.reduce((s, f) => s + f.width, 0);
  assert.equal(sum, RECORD_WIDTH);
});
