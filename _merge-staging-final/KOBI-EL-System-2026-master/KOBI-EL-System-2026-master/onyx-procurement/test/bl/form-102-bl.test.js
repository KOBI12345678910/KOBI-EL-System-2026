/**
 * form-102-bl.test.js — tests for the Israeli NII Form 102 BL exporter
 * Agent Y-012
 *
 * Run:   node --test test/bl/form-102-bl.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'bl', 'form-102-bl.js'
));

const {
  BL_CONSTANTS_2026,
  STATUS_CODES,
  SECTORS,
  FILE_FORMAT,
  generate102BL,
  computeEmployeeBL,
  buildPayrollFile,
  importBLResponse,
  computeInterest,
  validate,
} = mod;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function near(a, b, eps = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}
function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

function makeEmployer(overrides = {}) {
  return {
    employerId: '513579246',
    employerName: 'Techno-Kol Uzi בע"מ',
    tikNikuyim: '513579246',
    ...overrides,
  };
}

function makeEmp(overrides = {}) {
  return {
    id: 'e-001',
    tz: '012345678',
    name: 'Test Worker',
    grossWage: 10000,
    statusCode: STATUS_CODES.REGULAR.code,
    sector: 'STANDARD',
    workDays: 22,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ═════════════════════════════════════════════════════════════

test('BL_CONSTANTS_2026 — correct threshold and ceiling', () => {
  assert.equal(BL_CONSTANTS_2026.YEAR, 2026);
  assert.equal(BL_CONSTANTS_2026.MONTHLY_THRESHOLD, 7522);
  assert.equal(BL_CONSTANTS_2026.MONTHLY_CEILING, 49030);
});

test('BL_CONSTANTS_2026 — employee rates 0.4% / 7%', () => {
  assert.equal(BL_CONSTANTS_2026.EMPLOYEE.LOW_RATE, 0.004);
  assert.equal(BL_CONSTANTS_2026.EMPLOYEE.HIGH_RATE, 0.07);
});

test('BL_CONSTANTS_2026 — employer rates 3.55% / 7.6%', () => {
  assert.equal(BL_CONSTANTS_2026.EMPLOYER.LOW_RATE, 0.0355);
  assert.equal(BL_CONSTANTS_2026.EMPLOYER.HIGH_RATE, 0.076);
});

test('BL_CONSTANTS_2026 — health rates 3.1% / 5%', () => {
  assert.equal(BL_CONSTANTS_2026.HEALTH.LOW_RATE, 0.031);
  assert.equal(BL_CONSTANTS_2026.HEALTH.HIGH_RATE, 0.05);
});

// ═════════════════════════════════════════════════════════════
// 2. CALCULATION — threshold boundary
// ═════════════════════════════════════════════════════════════

test('computeEmployeeBL — wage below threshold uses only LOW rate', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 5000 }));
  // 5000 * 0.004 = 20
  assertNear(r.employeeBL, 20);
  // 5000 * 0.0355 = 177.5
  assertNear(r.employerBL, 177.5);
  // 5000 * 0.031 = 155
  assertNear(r.healthTax, 155);
  assert.equal(r.highBase, 0);
});

test('computeEmployeeBL — wage exactly at threshold (7522) uses only LOW rate', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 7522 }));
  // 7522 * 0.004 = 30.088
  assertNear(r.employeeBL, 30.09);
  // 7522 * 0.0355 = 267.031
  assertNear(r.employerBL, 267.03);
  // 7522 * 0.031 = 233.182
  assertNear(r.healthTax, 233.18);
  assert.equal(r.highBase, 0);
  assert.equal(r.lowBase, 7522);
});

test('computeEmployeeBL — wage just above threshold splits correctly', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 7523 }));
  // lowBase = 7522, highBase = 1
  assert.equal(r.lowBase, 7522);
  assert.equal(r.highBase, 1);
  // 7522*0.004 + 1*0.07 = 30.088 + 0.07 = 30.158
  assertNear(r.employeeBL, 30.16);
  // 7522*0.0355 + 1*0.076 = 267.031 + 0.076 = 267.107
  assertNear(r.employerBL, 267.11);
});

test('computeEmployeeBL — wage split threshold + extra (20000 NIS)', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 20000 }));
  const low = 7522, high = 20000 - 7522; // 12478
  assertNear(r.employeeBL, low * 0.004 + high * 0.07);            // 30.088 + 873.46 = 903.548
  assertNear(r.employerBL, low * 0.0355 + high * 0.076);          // 267.031 + 948.328 = 1215.359
  assertNear(r.healthTax,  low * 0.031 + high * 0.05);            // 233.182 + 623.9 = 857.082
});

// ═════════════════════════════════════════════════════════════
// 3. CEILING CAP
// ═════════════════════════════════════════════════════════════

test('computeEmployeeBL — wage at ceiling (49030) caps', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 49030 }));
  assert.equal(r.insurableBase, 49030);
  const low = 7522, high = 49030 - 7522; // 41508
  assertNear(r.employeeBL, low * 0.004 + high * 0.07);
});

test('computeEmployeeBL — wage above ceiling (100000) clamps at ceiling', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 100000 }));
  assert.equal(r.insurableBase, 49030, 'insurable base must clamp to ceiling');
  // Should be identical to computing at exactly the ceiling
  const rCeil = computeEmployeeBL(makeEmp({ grossWage: 49030 }));
  assert.equal(r.employeeBL, rCeil.employeeBL);
  assert.equal(r.employerBL, rCeil.employerBL);
  assert.equal(r.healthTax, rCeil.healthTax);
  // And the gross is still reported as the real gross
  assert.equal(r.grossWage, 100000);
});

test('computeEmployeeBL — wage zero → zero contributions', () => {
  const r = computeEmployeeBL(makeEmp({ grossWage: 0 }));
  assert.equal(r.employeeBL, 0);
  assert.equal(r.employerBL, 0);
  assert.equal(r.healthTax, 0);
});

// ═════════════════════════════════════════════════════════════
// 4. STATUS CODES
// ═════════════════════════════════════════════════════════════

test('status — controlling shareholder has zero employer BL', () => {
  const r = computeEmployeeBL(makeEmp({
    grossWage: 20000,
    statusCode: STATUS_CODES.CONTROLLING.code,
  }));
  assert.equal(r.statusCode, '02');
  assert.equal(r.employerBL, 0);
  assert.ok(r.employeeBL > 0, 'employee portion still withheld');
});

test('status — foreign worker has zero health tax', () => {
  const r = computeEmployeeBL(makeEmp({
    grossWage: 12000,
    statusCode: STATUS_CODES.FOREIGN.code,
  }));
  assert.equal(r.healthTax, 0);
  assert.ok(r.employeeBL > 0);
  assert.ok(r.employerBL > 0);
});

test('status — visitor visa has zero health tax', () => {
  const r = computeEmployeeBL(makeEmp({
    grossWage: 12000,
    statusCode: STATUS_CODES.VISITOR_VISA.code,
  }));
  assert.equal(r.healthTax, 0);
});

test('status — youth (under 18) employer portion at low rate only', () => {
  const r = computeEmployeeBL(makeEmp({
    grossWage: 20000,
    statusCode: STATUS_CODES.YOUTH.code,
  }));
  // 7522 * 0.0355 = 267.031 (only low portion contributes for youth)
  assertNear(r.employerBL, 7522 * 0.0355);
});

test('status — retiree no employee BL, health still applies', () => {
  const r = computeEmployeeBL(makeEmp({
    grossWage: 10000,
    statusCode: STATUS_CODES.RETIREE.code,
  }));
  assert.equal(r.employeeBL, 0);
  assert.ok(r.healthTax > 0);
});

test('status — Hebrew aliases map to correct codes', () => {
  const r1 = computeEmployeeBL(makeEmp({ grossWage: 5000, statusCode: 'בעל שליטה' }));
  assert.equal(r1.statusCode, STATUS_CODES.CONTROLLING.code);

  const r2 = computeEmployeeBL(makeEmp({ grossWage: 5000, statusCode: 'עובד זר' }));
  assert.equal(r2.statusCode, STATUS_CODES.FOREIGN.code);

  const r3 = computeEmployeeBL(makeEmp({ grossWage: 5000, statusCode: 'גמלאי' }));
  assert.equal(r3.statusCode, STATUS_CODES.RETIREE.code);

  const r4 = computeEmployeeBL(makeEmp({ grossWage: 5000, statusCode: 'נוער' }));
  assert.equal(r4.statusCode, STATUS_CODES.YOUTH.code);

  const r5 = computeEmployeeBL(makeEmp({ grossWage: 5000, statusCode: 'עצמאי במעמד שכיר' }));
  assert.equal(r5.statusCode, STATUS_CODES.SELF_AS_EMP.code);
});

// ═════════════════════════════════════════════════════════════
// 5. SECTORS
// ═════════════════════════════════════════════════════════════

test('sector — kibbutz has reduced employer portion', () => {
  const base = computeEmployeeBL(makeEmp({ grossWage: 12000 }));
  const kib  = computeEmployeeBL(makeEmp({ grossWage: 12000, sector: 'KIBBUTZ' }));
  assert.ok(kib.employerBL < base.employerBL, 'kibbutz employer < standard');
  assertNear(kib.employerBL / base.employerBL, 0.93, 0.001);
  // employee side unchanged
  assert.equal(kib.employeeBL, base.employeeBL);
});

test('sector — security adds employer surcharge (0.2%)', () => {
  const base = computeEmployeeBL(makeEmp({ grossWage: 10000 }));
  const sec  = computeEmployeeBL(makeEmp({ grossWage: 10000, sector: 'SECURITY' }));
  assertNear(sec.employerBL - base.employerBL, 10000 * 0.002);
});

test('sector — agriculture has reduced employer portion', () => {
  const base = computeEmployeeBL(makeEmp({ grossWage: 12000 }));
  const agr  = computeEmployeeBL(makeEmp({ grossWage: 12000, sector: 'AGRICULTURE' }));
  assert.ok(agr.employerBL < base.employerBL);
  assertNear(agr.employerBL / base.employerBL, 0.85, 0.001);
});

test('sector — Hebrew aliases resolve', () => {
  const kib = computeEmployeeBL(makeEmp({ grossWage: 10000, sector: 'קיבוץ' }));
  assert.equal(kib.sector, 'KIB');
  const agr = computeEmployeeBL(makeEmp({ grossWage: 10000, sector: 'חקלאות' }));
  assert.equal(agr.sector, 'AGR');
  const sec = computeEmployeeBL(makeEmp({ grossWage: 10000, sector: 'אבטחה' }));
  assert.equal(sec.sector, 'SEC');
});

// ═════════════════════════════════════════════════════════════
// 6. generate102BL — totals and structure
// ═════════════════════════════════════════════════════════════

test('generate102BL — totals sum per-employee values', () => {
  const r = generate102BL({
    period: { year: 2026, month: 3 },
    employer: makeEmployer(),
    employees: [
      makeEmp({ id: 'e1', tz: '100000001', grossWage: 5000 }),
      makeEmp({ id: 'e2', tz: '100000002', grossWage: 15000 }),
      makeEmp({ id: 'e3', tz: '100000003', grossWage: 60000 }), // over ceiling
    ],
  });
  assert.equal(r.employees.length, 3);
  assert.equal(r.totals.count, 3);
  assertNear(r.totals.grossWages, 5000 + 15000 + 60000);
  const sumEE = r.employees.reduce((s, x) => s + x.employeeBL, 0);
  assertNear(r.totals.employeeBL, sumEE);
  const sumER = r.employees.reduce((s, x) => s + x.employerBL, 0);
  assertNear(r.totals.employerBL, sumER);
  const sumH  = r.employees.reduce((s, x) => s + x.healthTax, 0);
  assertNear(r.totals.healthTax, sumH);
  assertNear(r.totals.totalToRemit,
    r.totals.employeeBL + r.totals.employerBL + r.totals.healthTax);
});

test('generate102BL — period string YYYYMM format', () => {
  const r = generate102BL({
    period: { year: 2026, month: 1 },
    employer: makeEmployer(),
    employees: [makeEmp({ grossWage: 8000 })],
  });
  assert.equal(r.periodString, '202601');
});

test('generate102BL — bilingual titles present', () => {
  const r = generate102BL({
    period: { year: 2026, month: 6 },
    employer: makeEmployer(),
    employees: [],
  });
  assert.match(r.formTitle_he, /טופס 102/);
  assert.match(r.formTitle_en, /National Insurance/);
});

test('generate102BL — invalid period throws', () => {
  assert.throws(() => generate102BL({
    period: { year: 2026, month: 13 },
    employer: makeEmployer(),
    employees: [],
  }), RangeError);
});

// ═════════════════════════════════════════════════════════════
// 7. FILE FORMAT — fixed-width export
// ═════════════════════════════════════════════════════════════

test('buildPayrollFile — header/detail/footer widths match spec', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [
      makeEmp({ id: 'e1', tz: '100000001', name: 'Alice', grossWage: 8000 }),
      makeEmp({ id: 'e2', tz: '100000002', name: 'Bob',   grossWage: 15000 }),
    ],
  });
  const file = buildPayrollFile(report);
  const rawLines = file.content.split(FILE_FORMAT.EOL).filter(l => l.length);
  assert.equal(rawLines.length, 4, '1 header + 2 details + 1 footer');
  assert.equal(rawLines[0].length, FILE_FORMAT.HEADER_LEN, 'header width');
  assert.equal(rawLines[0][0], 'H');
  assert.equal(rawLines[1].length, FILE_FORMAT.DETAIL_LEN, 'detail 1 width');
  assert.equal(rawLines[1][0], 'D');
  assert.equal(rawLines[2].length, FILE_FORMAT.DETAIL_LEN, 'detail 2 width');
  assert.equal(rawLines[2][0], 'D');
  assert.equal(rawLines[3].length, FILE_FORMAT.FOOTER_LEN, 'footer width');
  assert.equal(rawLines[3][0], 'T');
});

test('buildPayrollFile — header contains tik nikuyim and period', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer({ employerId: '513579246' }),
    employees: [makeEmp({ grossWage: 8000 })],
  });
  const file = buildPayrollFile(report);
  const header = file.content.split(FILE_FORMAT.EOL)[0];
  // pos 2-10: employer id (9 digits)
  assert.equal(header.slice(1, 10), '513579246');
  // pos 11-16: period
  assert.equal(header.slice(10, 16), '202604');
});

test('buildPayrollFile — detail record encodes amounts in agorot', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [makeEmp({ tz: '012345678', grossWage: 10000 })],
  });
  const file = buildPayrollFile(report);
  const detail = file.content.split(FILE_FORMAT.EOL)[1];
  // gross wage at position 46-57 (12 chars) = 1000000 agorot
  const grossField = detail.slice(45, 57);
  assert.equal(grossField, '000001000000'); // 10000.00 NIS = 1,000,000 agorot
});

test('buildPayrollFile — footer record count matches details', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [
      makeEmp({ id: 'e1', tz: '100000001', grossWage: 8000 }),
      makeEmp({ id: 'e2', tz: '100000002', grossWage: 9000 }),
      makeEmp({ id: 'e3', tz: '100000003', grossWage: 10000 }),
    ],
  });
  const file = buildPayrollFile(report);
  const lines = file.content.split(FILE_FORMAT.EOL).filter(l => l.length);
  const footer = lines[lines.length - 1];
  assert.equal(footer[0], 'T');
  // record count = 3 at pos 2-7 (6 chars)
  assert.equal(footer.slice(1, 7), '000003');
});

test('buildPayrollFile — filename includes employer and period', () => {
  const report = generate102BL({
    period: { year: 2026, month: 12 },
    employer: makeEmployer({ employerId: '513579246' }),
    employees: [makeEmp({ grossWage: 5000 })],
  });
  const file = buildPayrollFile(report);
  assert.match(file.filename, /^BL102_513579246_202612\.txt$/);
});

test('buildPayrollFile — UTF-8 byte count reported', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [makeEmp({ name: 'שלום', grossWage: 6000 })],
  });
  const file = buildPayrollFile(report);
  assert.ok(file.bytes > 0);
  assert.equal(file.lines, 3);
});

// ═════════════════════════════════════════════════════════════
// 8. importBLResponse
// ═════════════════════════════════════════════════════════════

test('importBLResponse — ACK parses cleanly', () => {
  const text =
    'ACK\r\n' +
    '202604\r\n' +
    '513579246\r\n' +
    '20260415120000\r\n' +
    '12\r\n' +
    'END\r\n';
  const res = importBLResponse(text);
  assert.equal(res.status, 'ACK');
  assert.equal(res.ok, true);
  assert.deepEqual(res.period, { year: 2026, month: 4 });
  assert.equal(res.tikNikuyim, '513579246');
  assert.equal(res.totalRecords, 12);
  assert.equal(res.errors.length, 0);
});

test('importBLResponse — REJ with error lines', () => {
  const text =
    'REJ\n' +
    '202604\n' +
    '513579246\n' +
    '20260416093000\n' +
    '5\n' +
    'E 123456789 E01 invalid tz checksum\n' +
    'E 987654321 E02 wage below minimum\n' +
    'W 111111111 W07 name contains non-hebrew chars\n' +
    'END\n';
  const res = importBLResponse(text);
  assert.equal(res.status, 'REJ');
  assert.equal(res.ok, false);
  assert.equal(res.records.length, 3);
  assert.equal(res.errors.length, 2);
  assert.equal(res.warnings.length, 1);
});

test('importBLResponse — JSON payload supported', () => {
  const json = JSON.stringify({
    status: 'PARTIAL',
    period: '202603',
    tikNikuyim: '513579246',
    totalRecords: 10,
    records: [{ severity: 'error', tz: '000000001', code: 'E99', message: 'test' }],
    errors: ['one error'],
    warnings: [],
  });
  const res = importBLResponse(json);
  assert.equal(res.status, 'PARTIAL');
  assert.equal(res.ok, false);
  assert.deepEqual(res.period, { year: 2026, month: 3 });
  assert.equal(res.errors.length, 1);
});

test('importBLResponse — Buffer input accepted', () => {
  const buf = Buffer.from('ACK\n202601\n999888777\n20260201000000\n0\nEND\n', 'utf8');
  const res = importBLResponse(buf);
  assert.equal(res.status, 'ACK');
  assert.equal(res.tikNikuyim, '999888777');
});

test('importBLResponse — empty file returns UNKNOWN', () => {
  const res = importBLResponse('');
  assert.equal(res.status, 'UNKNOWN');
  assert.equal(res.ok, false);
});

// ═════════════════════════════════════════════════════════════
// 9. computeInterest
// ═════════════════════════════════════════════════════════════

test('computeInterest — zero days → zero interest', () => {
  const r = computeInterest(10000, 0);
  assert.equal(r.interest, 0);
  assert.equal(r.total, 10000);
});

test('computeInterest — formula: amount × rate × days/365', () => {
  const r = computeInterest(10000, 30);
  // 10000 * 0.04 * 30/365 = 32.876... ≈ 32.88
  assertNear(r.interest, 10000 * 0.04 * (30 / 365));
  assertNear(r.total, 10000 + r.interest);
});

test('computeInterest — full year = 4% of principal', () => {
  const r = computeInterest(50000, 365);
  assertNear(r.interest, 2000); // 50000 * 0.04
});

test('computeInterest — custom annual rate honored', () => {
  const r = computeInterest(1000, 365, { annualRate: 0.06 });
  assertNear(r.interest, 60);
});

test('computeInterest — negative / non-numeric inputs coerce safely', () => {
  const r1 = computeInterest(-500, 30);
  assert.equal(r1.amount, 0);
  assert.equal(r1.interest, 0);

  const r2 = computeInterest('abc', 'xyz');
  assert.equal(r2.amount, 0);
  assert.equal(r2.daysLate, 0);
});

// ═════════════════════════════════════════════════════════════
// 10. VALIDATE
// ═════════════════════════════════════════════════════════════

test('validate — missing period flagged', () => {
  const errs = validate({ employer: makeEmployer(), employees: [] });
  assert.ok(errs.some(e => /period/.test(e)));
});

test('validate — missing employerId flagged', () => {
  const errs = validate({
    period: { year: 2026, month: 4 },
    employer: {},
    employees: [],
  });
  assert.ok(errs.some(e => /employerId/.test(e)));
});

test('validate — negative wage flagged', () => {
  const errs = validate({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [{ grossWage: -100 }],
  });
  assert.ok(errs.some(e => /grossWage/.test(e)));
});

test('validate — happy path returns no errors', () => {
  const errs = validate({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [makeEmp({ grossWage: 9000 })],
  });
  assert.equal(errs.length, 0);
});

// ═════════════════════════════════════════════════════════════
// 11. ROUND-TRIP — generate → file → parsing structure
// ═════════════════════════════════════════════════════════════

test('round-trip — complete run with mixed statuses and sectors', () => {
  const report = generate102BL({
    period: { year: 2026, month: 4 },
    employer: makeEmployer(),
    employees: [
      makeEmp({ id: 'a', tz: '100000001', grossWage: 5000, statusCode: 'שכיר רגיל' }),
      makeEmp({ id: 'b', tz: '100000002', grossWage: 20000, statusCode: 'בעל שליטה' }),
      makeEmp({ id: 'c', tz: '100000003', grossWage: 8000, sector: 'קיבוץ' }),
      makeEmp({ id: 'd', tz: '100000004', grossWage: 60000, statusCode: 'עובד זר' }),
      makeEmp({ id: 'e', tz: '100000005', grossWage: 3500, statusCode: 'נוער' }),
    ],
  });
  assert.equal(report.employees.length, 5);

  // controlling shareholder has no employer BL
  const ctrl = report.employees.find(e => e.id === 'b');
  assert.equal(ctrl.employerBL, 0);

  // foreign worker has no health tax
  const foreign = report.employees.find(e => e.id === 'd');
  assert.equal(foreign.healthTax, 0);
  // and wage is clamped to ceiling
  assert.equal(foreign.insurableBase, 49030);

  // kibbutz has reduced employer
  const kib = report.employees.find(e => e.id === 'c');
  const std = computeEmployeeBL(makeEmp({ grossWage: 8000 }));
  assert.ok(kib.employerBL < std.employerBL);

  const file = buildPayrollFile(report);
  const lines = file.content.split(FILE_FORMAT.EOL).filter(l => l.length);
  // 1 header + 5 details + 1 footer
  assert.equal(lines.length, 7);
});
