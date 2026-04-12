/**
 * Wage Slip Calculator — Unit Tests
 * Israeli 2026 payroll engine
 *
 * Run with:    node --test test/wage-slip-calculator.test.js
 *     or:      node test/run.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CONSTANTS_2026,
  computeIncomeTaxAnnual,
  computeIncomeTaxMonthly,
  computeBituachLeumiAndHealth,
  computePensionContributions,
  computeStudyFund,
  computeHourlyGross,
  computeMonthlyGross,
  computeWageSlip,
} = require(path.resolve(__dirname, '..', 'src', 'payroll', 'wage-slip-calculator.js'));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns true if |a-b| <= eps */
function near(a, b, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

/** Assert two numbers are within eps (default 0.02 NIS) */
function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

/** Fixture: baseline employer */
function makeEmployer(overrides = {}) {
  return {
    id: 'emp-001',
    legal_name: 'Onyx Construction Ltd',
    company_id: '514000000',
    tax_file_number: '937123456',
    ...overrides,
  };
}

/** Fixture: monthly-salaried employee (ideal case) */
function makeMonthlyEmployee(overrides = {}) {
  return {
    id: 'e-monthly-001',
    employee_number: 'EMP-001',
    first_name: 'Dana',
    last_name: 'Levi',
    full_name: 'Dana Levi',
    national_id: '302020202',
    employment_type: 'monthly',
    base_salary: 12000,
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: 2.25,
    study_fund_number: 'SF-123456',
    position: 'Site Engineer',
    department: 'Engineering',
    ...overrides,
  };
}

/** Fixture: hourly-paid employee */
function makeHourlyEmployee(overrides = {}) {
  return {
    id: 'e-hourly-001',
    employee_number: 'EMP-002',
    first_name: 'Yossi',
    last_name: 'Mizrahi',
    full_name: 'Yossi Mizrahi',
    national_id: '303030303',
    employment_type: 'hourly',
    base_salary: 50,          // ₪50/hour
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: 2.25,
    study_fund_number: null,  // not eligible
    position: 'Carpenter',
    department: 'Site',
    ...overrides,
  };
}

function makePeriod(overrides = {}) {
  return { year: 2026, month: 4, pay_date: '2026-05-10', ...overrides };
}

// ═════════════════════════════════════════════════════════════
// 1. computeIncomeTaxAnnual
// ═════════════════════════════════════════════════════════════

test('1.1 computeIncomeTaxAnnual: zero income returns 0', () => {
  assert.equal(computeIncomeTaxAnnual(0, 2.25), 0);
});

test('1.2 computeIncomeTaxAnnual: income under credit floor returns 0', () => {
  // 50000 @ 10% = 5000; credit value = 6696 → tax - credit < 0 → floored to 0
  const tax = computeIncomeTaxAnnual(50000, 2.25);
  assert.equal(tax, 0);
});

test('1.3 computeIncomeTaxAnnual: mid bracket ₪150k / 2.25 points', () => {
  // 84120*0.10 + 36600*0.14 + (150000-120720)*0.20
  //   = 8412 + 5124 + 5856 = 19392
  //   - 2.25*2976 (=6696) = 12696
  assertNear(computeIncomeTaxAnnual(150000, 2.25), 12696);
});

test('1.4 computeIncomeTaxAnnual: high bracket ₪1M / 2.25 points', () => {
  // brackets: 8412 + 5124 + 14616 + 23398.8 + 101850 + 75801.6 + 139220 = 368422.4
  // minus credit 6696 = 361726.4
  assertNear(computeIncomeTaxAnnual(1_000_000, 2.25), 361726.4, 0.5);
});

test('1.5 computeIncomeTaxAnnual: exact bracket boundary ₪84,120', () => {
  // 84120*0.10 = 8412; minus 6696 = 1716
  assertNear(computeIncomeTaxAnnual(84120, 2.25), 1716);
});

test('1.6 computeIncomeTaxAnnual: exact bracket boundary ₪120,720', () => {
  // 8412 + (120720-84120)*0.14 = 8412 + 5124 = 13536; minus 6696 = 6840
  assertNear(computeIncomeTaxAnnual(120720, 2.25), 6840);
});

test('1.7 computeIncomeTaxAnnual: negative credit points must not yield negative tax', () => {
  // credit = -1 → creditValue = -2976 → (tax - (-2976)) = tax + 2976
  // 100000 income: 8412 + (100000-84120)*0.14 = 8412 + 2223.2 = 10635.2
  // result = max(0, 10635.2 + 2976) = 13611.2 → must be >= 0
  const tax = computeIncomeTaxAnnual(100_000, -1);
  assert.ok(tax >= 0, `tax should never be negative, got ${tax}`);
  // Explicitly assert positive (current code adds instead of subtracts when creditValue<0)
  assertNear(tax, 13611.2, 0.5);
});

test('1.8 computeIncomeTaxAnnual: zero credit points (no credit)', () => {
  // 100000 → 10635.2 with no credit subtracted
  assertNear(computeIncomeTaxAnnual(100_000, 0), 10635.2, 0.5);
});

// ═════════════════════════════════════════════════════════════
// 2. computeIncomeTaxMonthly
// ═════════════════════════════════════════════════════════════

test('2.1 computeIncomeTaxMonthly: matches annual/12', () => {
  const monthly = 12500; // annualized 150000
  const annual = computeIncomeTaxAnnual(monthly * 12, 2.25);
  assertNear(computeIncomeTaxMonthly(monthly, 2.25), annual / 12, 0.02);
});

test('2.2 computeIncomeTaxMonthly: zero income returns 0', () => {
  assert.equal(computeIncomeTaxMonthly(0, 2.25), 0);
});

test('2.3 computeIncomeTaxMonthly: result rounded to 2 decimals', () => {
  const result = computeIncomeTaxMonthly(12500, 2.25);
  // Round check: value should equal round(value, 2)
  assert.equal(result, Math.round(result * 100) / 100);
});

// ═════════════════════════════════════════════════════════════
// 3. computeBituachLeumiAndHealth
// ═════════════════════════════════════════════════════════════

test('3.1 BL/Health: below threshold ₪6,000 — low rates only', () => {
  const r = computeBituachLeumiAndHealth(6000);
  assertNear(r.bituach_leumi_employee, 24);        // 6000*0.004
  assertNear(r.bituach_leumi_employer, 213);       // 6000*0.0355
  assertNear(r.health_tax_employee, 186);          // 6000*0.031
  assert.equal(r.health_tax_employer, 0);
});

test('3.2 BL/Health: above threshold ₪15,000 — mixed rates', () => {
  // low=7522, high=7478
  // emp = 7522*0.004 + 7478*0.07 = 30.088 + 523.46 = 553.548
  // employer = 7522*0.0355 + 7478*0.076 = 267.031 + 568.328 = 835.359
  // health = 7522*0.031 + 7478*0.05 = 233.182 + 373.9 = 607.082
  const r = computeBituachLeumiAndHealth(15000);
  assertNear(r.bituach_leumi_employee, 553.55);
  assertNear(r.bituach_leumi_employer, 835.36);
  assertNear(r.health_tax_employee, 607.08);
});

test('3.3 BL/Health: at max base ₪49,030 — capped', () => {
  // low=7522, high=41508
  // emp = 30.088 + 2905.56 = 2935.648
  // employer = 267.031 + 3154.608 = 3421.639
  // health = 233.182 + 2075.4 = 2308.582
  const r = computeBituachLeumiAndHealth(49030);
  assertNear(r.bituach_leumi_employee, 2935.65);
  assertNear(r.bituach_leumi_employer, 3421.64);
  assertNear(r.health_tax_employee, 2308.58);
});

test('3.4 BL/Health: above max base ₪60,000 — still capped at 49,030', () => {
  const above = computeBituachLeumiAndHealth(60000);
  const atCap = computeBituachLeumiAndHealth(49030);
  assert.deepEqual(above, atCap);
});

test('3.5 BL/Health: zero income — all zeros', () => {
  const r = computeBituachLeumiAndHealth(0);
  assert.equal(r.bituach_leumi_employee, 0);
  assert.equal(r.bituach_leumi_employer, 0);
  assert.equal(r.health_tax_employee, 0);
  assert.equal(r.health_tax_employer, 0);
});

// ═════════════════════════════════════════════════════════════
// 4. computePensionContributions
// ═════════════════════════════════════════════════════════════

test('4.1 Pension: below cap ₪20,000', () => {
  const r = computePensionContributions(20000);
  assertNear(r.pension_employee, 1200);             // 6%
  assertNear(r.pension_employer, 1300);             // 6.5%
  assertNear(r.severance_employer, 1666);           // 8.33%
});

test('4.2 Pension: above cap (₪30,000 → base capped at 28,750)', () => {
  const r = computePensionContributions(30000);
  assertNear(r.pension_employee, 1725);             // 28750*0.06
  assertNear(r.pension_employer, 1868.75);          // 28750*0.065
  assertNear(r.severance_employer, 2394.88);        // 28750*0.0833
});

test('4.3 Pension: zero income — all zeros', () => {
  const r = computePensionContributions(0);
  assert.equal(r.pension_employee, 0);
  assert.equal(r.pension_employer, 0);
  assert.equal(r.severance_employer, 0);
});

// ═════════════════════════════════════════════════════════════
// 5. computeStudyFund
// ═════════════════════════════════════════════════════════════

test('5.1 StudyFund: eligible at ₪10,000', () => {
  const r = computeStudyFund(10000, true);
  assertNear(r.study_fund_employee, 250);           // 2.5%
  assertNear(r.study_fund_employer, 750);           // 7.5%
});

test('5.2 StudyFund: ineligible returns zeros', () => {
  const r = computeStudyFund(10000, false);
  assert.equal(r.study_fund_employee, 0);
  assert.equal(r.study_fund_employer, 0);
});

test('5.3 StudyFund: capped at ₪15,712', () => {
  const r = computeStudyFund(20000, true);
  assertNear(r.study_fund_employee, 15712 * 0.025); // 392.8
  assertNear(r.study_fund_employer, 15712 * 0.075); // 1178.4
});

// ═════════════════════════════════════════════════════════════
// 6. computeHourlyGross
// ═════════════════════════════════════════════════════════════

test('6.1 Hourly: 100 reg + 10 ot125 + 5 ot150 @ ₪50/hr', () => {
  const emp = makeHourlyEmployee({ base_salary: 50 });
  const ts = {
    hours_regular: 100,
    hours_overtime_125: 10,
    hours_overtime_150: 5,
  };
  const r = computeHourlyGross(emp, ts);
  // base: 100*50 = 5000
  // OT:   10*50*1.25 + 5*50*1.5 = 625 + 375 = 1000
  assertNear(r.basePay, 5000);
  assertNear(r.overtimePay, 1000);
});

test('6.2 Hourly: all overtime tiers 125/150/175/200', () => {
  const emp = makeHourlyEmployee({ base_salary: 100 });
  const ts = {
    hours_regular: 0,
    hours_overtime_125: 1,  // 125
    hours_overtime_150: 1,  // 150
    hours_overtime_175: 1,  // 175
    hours_overtime_200: 1,  // 200
  };
  const r = computeHourlyGross(emp, ts);
  assertNear(r.basePay, 0);
  assertNear(r.overtimePay, 125 + 150 + 175 + 200);
});

// ═════════════════════════════════════════════════════════════
// 7. computeMonthlyGross
// ═════════════════════════════════════════════════════════════

test('7.1 Monthly: full month, no absence → full base', () => {
  const emp = makeMonthlyEmployee({ base_salary: 10000 });
  const r = computeMonthlyGross(emp, {});
  assertNear(r.basePay, 10000);
  assertNear(r.overtimePay, 0);
});

test('7.2 Monthly: partial month with 8h absence', () => {
  const emp = makeMonthlyEmployee({ base_salary: 10000, hours_per_month: 182 });
  const r = computeMonthlyGross(emp, { hours_absence: 8 });
  // hourlyRate = 10000/182 ≈ 54.9451
  // basePay = 10000 - 8 * 54.9451 = 9560.44
  assertNear(r.basePay, 9560.44, 0.1);
});

test('7.3 Monthly: with 10 hours overtime (125%)', () => {
  const emp = makeMonthlyEmployee({ base_salary: 10000, hours_per_month: 182 });
  const r = computeMonthlyGross(emp, { hours_overtime_125: 10 });
  // hourlyRate ≈ 54.9451
  // overtimePay = 10 * 54.9451 * 1.25 ≈ 686.81
  assertNear(r.overtimePay, 686.81, 0.1);
  assertNear(r.basePay, 10000); // base not affected by OT
});

// ═════════════════════════════════════════════════════════════
// 8. computeWageSlip — full integration
// ═════════════════════════════════════════════════════════════

test('8.1 Wage slip: monthly ₪12,000 / 2.25 points — net pay sanity', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee({ base_salary: 12000 }),
    employer: makeEmployer(),
    timesheet: {},
    period: makePeriod(),
  });

  // Gross
  assertNear(slip.gross_pay, 12000);

  // Income tax: annual 144000
  //   8412 + 5124 + 23280*0.20 = 8412 + 5124 + 4656 = 18192
  //   - 6696 = 11496 → /12 = 958
  assertNear(slip.income_tax, 958);

  // BL employee @12000: low 7522, high 4478
  //   7522*0.004 + 4478*0.07 = 30.088 + 313.46 = 343.548
  assertNear(slip.bituach_leumi, 343.55);

  // Health: 7522*0.031 + 4478*0.05 = 233.182 + 223.9 = 457.082
  assertNear(slip.health_tax, 457.08);

  // Pension employee: 12000*0.06 = 720
  assertNear(slip.pension_employee, 720);

  // Study fund employee: 12000*0.025 = 300
  assertNear(slip.study_fund_employee, 300);

  // Net sanity: must be clearly positive and <= gross
  assert.ok(slip.net_pay > 0, 'net should be positive');
  assert.ok(slip.net_pay < slip.gross_pay, 'net should be < gross');
});

test('8.2 Wage slip: hourly employee with overtime', () => {
  const slip = computeWageSlip({
    employee: makeHourlyEmployee({ base_salary: 60 }),
    employer: makeEmployer(),
    timesheet: {
      hours_regular: 182,
      hours_overtime_125: 10,
      hours_overtime_150: 4,
    },
    period: makePeriod(),
  });

  // base: 182*60 = 10920
  // OT:   10*60*1.25 + 4*60*1.5 = 750 + 360 = 1110
  // gross = 12030
  assertNear(slip.base_pay, 10920);
  assertNear(slip.overtime_pay, 1110);
  assertNear(slip.gross_pay, 12030);
  assert.ok(slip.net_pay > 0);
});

test('8.3 Wage slip: missing employee throws', () => {
  assert.throws(
    () => computeWageSlip({
      employer: makeEmployer(),
      period: makePeriod(),
    }),
    /employee required/,
  );
});

test('8.4 Wage slip: missing employer throws', () => {
  assert.throws(
    () => computeWageSlip({
      employee: makeMonthlyEmployee(),
      period: makePeriod(),
    }),
    /employer required/,
  );
});

test('8.5 Wage slip: missing period throws', () => {
  assert.throws(
    () => computeWageSlip({
      employee: makeMonthlyEmployee(),
      employer: makeEmployer(),
    }),
    /period/,
  );
});

test('8.6 Wage slip: period missing month throws', () => {
  assert.throws(
    () => computeWageSlip({
      employee: makeMonthlyEmployee(),
      employer: makeEmployer(),
      period: { year: 2026 },
    }),
    /period/,
  );
});

test('8.7 Wage slip: sum invariant — net = gross - total_deductions (±0.02)', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee({ base_salary: 15000 }),
    employer: makeEmployer(),
    timesheet: {
      bonuses: 500,
      allowances_travel: 200,
    },
    period: makePeriod(),
  });
  const diff = slip.gross_pay - slip.total_deductions;
  assertNear(slip.net_pay, diff, 0.02, `net=${slip.net_pay} expected ~${diff}`);
});

test('8.8 Wage slip: total_deductions sums individual deductions (±0.02)', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee({ base_salary: 18000 }),
    employer: makeEmployer(),
    timesheet: { loans: 100, garnishments: 50, other_deductions: 25 },
    period: makePeriod(),
  });
  const sum =
    slip.income_tax +
    slip.bituach_leumi +
    slip.health_tax +
    slip.pension_employee +
    slip.study_fund_employee +
    slip.loans +
    slip.garnishments +
    slip.other_deductions;
  assertNear(slip.total_deductions, sum, 0.02);
});

test('8.9 Wage slip: ineligible study fund (no study_fund_number) yields zero', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee({ base_salary: 12000, study_fund_number: null }),
    employer: makeEmployer(),
    timesheet: {},
    period: makePeriod(),
  });
  assert.equal(slip.study_fund_employee, 0);
  assert.equal(slip.study_fund_employer, 0);
});

test('8.10 Wage slip: period_label formatted as YYYY-MM', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee(),
    employer: makeEmployer(),
    timesheet: {},
    period: { year: 2026, month: 3, pay_date: '2026-04-10' },
  });
  assert.equal(slip.period_label, '2026-03');
});

test('8.11 Wage slip: YTD accumulators add to previous balances', () => {
  const slip = computeWageSlip({
    employee: makeMonthlyEmployee({ base_salary: 12000 }),
    employer: makeEmployer(),
    timesheet: {},
    period: makePeriod(),
    ytd: {
      ytd_gross: 36000,
      ytd_income_tax: 2874,
      ytd_bituach_leumi: 1030.65,
      ytd_pension: 2160,
    },
  });
  assertNear(slip.ytd_gross, 36000 + slip.gross_pay);
  assertNear(slip.ytd_income_tax, 2874 + slip.income_tax);
  assertNear(slip.ytd_bituach_leumi, 1030.65 + slip.bituach_leumi);
  assertNear(slip.ytd_pension, 2160 + slip.pension_employee);
});
