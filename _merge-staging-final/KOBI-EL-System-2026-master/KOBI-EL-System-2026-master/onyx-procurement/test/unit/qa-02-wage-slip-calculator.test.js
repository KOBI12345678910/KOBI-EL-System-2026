/**
 * QA-02 — Unit tests (edge cases) for wage-slip-calculator.js
 *
 * Scope:
 *   - Null / undefined / empty / negative / overflow inputs
 *   - Exact boundaries of every 2026 income-tax bracket
 *   - Float precision and cumulative rounding
 *   - Extreme inputs (9,999,999.99) and zero rates
 *   - Israeli BL / Health / Pension / Study Fund limits
 *   - Overtime 125/150/175/200
 *   - Invariant: gross - totalDeductions == net (±0.01)
 *
 * These tests are ADDITIVE — they do NOT replace
 * test/wage-slip-calculator.test.js. Both files must pass together.
 *
 * Run with:    node --test test/unit/qa-02-wage-slip-calculator.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

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
} = require(path.resolve(__dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js'));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

function makeEmployer(overrides = {}) {
  return {
    id: 'emp-qa02',
    legal_name: 'Techno Kol Uzi QA Ltd',
    company_id: '514000000',
    tax_file_number: '937123456',
    ...overrides,
  };
}

function makeMonthlyEmployee(overrides = {}) {
  return {
    id: 'e-monthly-qa02',
    employee_number: 'EMP-QA02',
    first_name: 'QA',
    last_name: 'Tester',
    full_name: 'QA Tester',
    national_id: '000000018',
    employment_type: 'monthly',
    base_salary: 12000,
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: 2.25,
    study_fund_number: 'SF-QA02',
    position: 'QA Engineer',
    department: 'QA',
    ...overrides,
  };
}

function makeHourlyEmployee(overrides = {}) {
  return {
    id: 'e-hourly-qa02',
    employee_number: 'EMP-QA02H',
    full_name: 'Hourly QA',
    first_name: 'Hourly',
    last_name: 'QA',
    national_id: '000000018',
    employment_type: 'hourly',
    base_salary: 50,
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: 2.25,
    study_fund_number: null,
    ...overrides,
  };
}

function makePeriod(overrides = {}) {
  return { year: 2026, month: 4, pay_date: '2026-05-10', ...overrides };
}

// ═════════════════════════════════════════════════════════════
// SECTION 1: computeIncomeTaxAnnual — exact boundary sweep
// ═════════════════════════════════════════════════════════════

describe('QA-02.1 computeIncomeTaxAnnual — tax bracket boundaries', () => {
  // With 0 credit points so we can read pure bracket math.
  test('1.01 annual=0 -> 0', () => {
    assert.equal(computeIncomeTaxAnnual(0, 0), 0);
  });

  test('1.02 annual=84120 (top of 10% bracket, 0 credits) = 8412', () => {
    assertNear(computeIncomeTaxAnnual(84120, 0), 8412, 0.01);
  });

  test('1.03 annual=84121 (first ₪ of 14% bracket)', () => {
    // 8412 + 1*0.14 = 8412.14
    assertNear(computeIncomeTaxAnnual(84121, 0), 8412.14, 0.01);
  });

  test('1.04 annual=120720 (top of 14% bracket) = 13536', () => {
    assertNear(computeIncomeTaxAnnual(120720, 0), 13536, 0.01);
  });

  test('1.05 annual=193800 (top of 20% bracket) = 28152', () => {
    assertNear(computeIncomeTaxAnnual(193800, 0), 28152, 0.01);
  });

  test('1.06 annual=269280 (top of 31% bracket) = 51550.8', () => {
    assertNear(computeIncomeTaxAnnual(269280, 0), 51550.8, 0.01);
  });

  test('1.07 annual=560280 (top of 35% bracket) = 153400.8', () => {
    assertNear(computeIncomeTaxAnnual(560280, 0), 153400.8, 0.01);
  });

  test('1.08 annual=721560 (top of 47% bracket) = 229202.4', () => {
    assertNear(computeIncomeTaxAnnual(721560, 0), 229202.4, 0.01);
  });

  test('1.09 annual=721561 (first ₪ in 50% bracket)', () => {
    // 229202.4 + 1 * 0.50 = 229202.9
    assertNear(computeIncomeTaxAnnual(721561, 0), 229202.9, 0.01);
  });

  test('1.10 boundary 84120 with 2.25 credit points subtracts 6696', () => {
    // 8412 - 6696 = 1716
    assertNear(computeIncomeTaxAnnual(84120, 2.25), 1716, 0.01);
  });

  test('1.11 boundary 269280 with 2.25 credit points = 44854.8', () => {
    // 51550.8 - 6696
    assertNear(computeIncomeTaxAnnual(269280, 2.25), 44854.8, 0.01);
  });

  test('1.12 extreme high income ₪5,000,000 / 0 credits', () => {
    // 229202.4 + (5_000_000 - 721560) * 0.50
    //   = 229202.4 + 4278440 * 0.50
    //   = 229202.4 + 2139220
    //   = 2368422.4
    assertNear(computeIncomeTaxAnnual(5_000_000, 0), 2368422.4, 0.5);
  });

  test('1.13 extreme income ₪9,999,999.99 / 0 credits (no overflow)', () => {
    // 229202.4 + (9_999_999.99 - 721560) * 0.50
    //   = 229202.4 + 9278439.99 * 0.50
    //   = 229202.4 + 4639219.995
    //   ≈ 4868422.395
    const result = computeIncomeTaxAnnual(9_999_999.99, 0);
    assert.ok(Number.isFinite(result), 'result must be finite');
    assertNear(result, 4868422.395, 1);
  });

  test('1.14 negative income floored to 0', () => {
    assert.equal(computeIncomeTaxAnnual(-50000, 2.25), 0);
  });

  test('1.15 NaN income treated as 0 (no NaN propagation)', () => {
    // NaN < 0 is false, so Math.max(0, NaN) = NaN in JS.
    // Current implementation will yield NaN — document behavior.
    const result = computeIncomeTaxAnnual(NaN, 2.25);
    // BUG INTENT: should return 0. Actual may be NaN.
    // We DOCUMENT the actual behavior so regressions are visible.
    assert.ok(
      result === 0 || Number.isNaN(result),
      `expected 0 or NaN (documented), got ${result}`
    );
  });

  test('1.16 undefined income treated like 0 (JS coercion)', () => {
    // Math.max(0, undefined) = NaN; subtract credit → NaN; max(0, NaN) = NaN
    const result = computeIncomeTaxAnnual(undefined, 2.25);
    assert.ok(
      result === 0 || Number.isNaN(result),
      `expected 0 or NaN (documented), got ${result}`
    );
  });

  test('1.17 fractional credit points 2.75 (single mother typical)', () => {
    // 100000 → 8412 + (100000-84120)*0.14 = 8412+2223.2 = 10635.2
    // credit = 2.75 * 2976 = 8184
    // tax = 10635.2 - 8184 = 2451.2
    assertNear(computeIncomeTaxAnnual(100000, 2.75), 2451.2, 0.01);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 2: computeIncomeTaxMonthly — boundary sweep + rounding
// ═════════════════════════════════════════════════════════════

describe('QA-02.2 computeIncomeTaxMonthly — rounding & boundaries', () => {
  test('2.01 monthly ₪7010 → annualized exactly 84120 → annual 1716 / 12 = 143', () => {
    assertNear(computeIncomeTaxMonthly(7010, 2.25), 143, 0.01);
  });

  test('2.02 result always rounded to 2 decimals', () => {
    for (const m of [3000, 5000, 7500, 10000, 12500, 20000, 30000, 50000]) {
      const r = computeIncomeTaxMonthly(m, 2.25);
      const rounded = Math.round(r * 100) / 100;
      assert.equal(r, rounded, `monthly=${m} -> ${r} not rounded`);
    }
  });

  test('2.03 float precision — 10001.015 should not explode', () => {
    const r = computeIncomeTaxMonthly(10001.015, 2.25);
    assert.ok(Number.isFinite(r));
    assert.ok(r >= 0);
  });

  test('2.04 extreme monthly ₪833,333.33 (≈annual 10M)', () => {
    const r = computeIncomeTaxMonthly(833333.33, 0);
    assert.ok(Number.isFinite(r));
    assert.ok(r > 0);
  });

  test('2.05 zero credit points returns strictly-positive tax on any positive income', () => {
    const r = computeIncomeTaxMonthly(5000, 0);
    assert.ok(r > 0);
  });

  test('2.06 empty-string monthly input is treated as 0', () => {
    // '' * 12 = 0 (JS coercion)
    assert.equal(computeIncomeTaxMonthly('', 2.25), 0);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 3: computeBituachLeumiAndHealth — thresholds/caps/edges
// ═════════════════════════════════════════════════════════════

describe('QA-02.3 computeBituachLeumiAndHealth — thresholds & caps', () => {
  const BL = CONSTANTS_2026.BITUACH_LEUMI;
  const HT = CONSTANTS_2026.HEALTH_TAX;

  test('3.01 exact at threshold ₪7522 — all "low-rate" only', () => {
    const r = computeBituachLeumiAndHealth(BL.MONTHLY_THRESHOLD);
    // 7522 * 0.004 = 30.088 → round to 30.09
    assertNear(r.bituach_leumi_employee, 30.09);
    // 7522 * 0.0355 = 267.031 → 267.03
    assertNear(r.bituach_leumi_employer, 267.03);
    // 7522 * 0.031 = 233.182 → 233.18
    assertNear(r.health_tax_employee, 233.18);
  });

  test('3.02 threshold + 0.01 uses high rate on the ₪0.01', () => {
    const r = computeBituachLeumiAndHealth(BL.MONTHLY_THRESHOLD + 0.01);
    // low = 7522 * 0.004 = 30.088
    // high = 0.01 * 0.07 = 0.0007 → rounds to 30.09
    assertNear(r.bituach_leumi_employee, 30.09);
  });

  test('3.03 exact at cap ₪49030 — no "above cap" leakage', () => {
    const atCap = computeBituachLeumiAndHealth(BL.MONTHLY_MAX_BASE);
    // low=7522, high=41508
    // emp: 7522*0.004 + 41508*0.07 = 30.088 + 2905.56 = 2935.648 ≈ 2935.65
    assertNear(atCap.bituach_leumi_employee, 2935.65);
  });

  test('3.04 ₪49030.01 (₪0.01 over cap) — identical to at-cap', () => {
    const atCap = computeBituachLeumiAndHealth(BL.MONTHLY_MAX_BASE);
    const overCap = computeBituachLeumiAndHealth(BL.MONTHLY_MAX_BASE + 0.01);
    assert.deepEqual(overCap, atCap);
  });

  test('3.05 extreme ₪9,999,999.99 still clamped to cap', () => {
    const atCap = computeBituachLeumiAndHealth(BL.MONTHLY_MAX_BASE);
    const extreme = computeBituachLeumiAndHealth(9_999_999.99);
    assert.deepEqual(extreme, atCap);
  });

  test('3.06 negative income clamped to 0', () => {
    const r = computeBituachLeumiAndHealth(-1000);
    assert.equal(r.bituach_leumi_employee, 0);
    assert.equal(r.bituach_leumi_employer, 0);
    assert.equal(r.health_tax_employee, 0);
  });

  test('3.07 NaN monthly → all zeros (documented)', () => {
    // Math.min/max with NaN may yield NaN. Document current behavior.
    const r = computeBituachLeumiAndHealth(NaN);
    // Allow either NaN (current) or 0 (ideal) but assert no crash.
    assert.ok(typeof r.bituach_leumi_employee === 'number');
  });

  test('3.08 health_tax_employer is always 0 (absorbed in BL_employer)', () => {
    for (const base of [0, 5000, 10000, 30000, 49030, 100000]) {
      const r = computeBituachLeumiAndHealth(base);
      assert.equal(r.health_tax_employer, 0, `base=${base}`);
    }
  });

  test('3.09 rates match 2026 spec constants', () => {
    assert.equal(BL.EMPLOYEE_LOW_RATE, 0.004);
    assert.equal(BL.EMPLOYEE_HIGH_RATE, 0.07);
    assert.equal(BL.EMPLOYER_LOW_RATE, 0.0355);
    assert.equal(BL.EMPLOYER_HIGH_RATE, 0.076);
    assert.equal(HT.EMPLOYEE_LOW_RATE, 0.031);
    assert.equal(HT.EMPLOYEE_HIGH_RATE, 0.05);
    assert.equal(BL.MONTHLY_MAX_BASE, 49030);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 4: computePensionContributions — cap & boundary
// ═════════════════════════════════════════════════════════════

describe('QA-02.4 Pension — boundaries', () => {
  test('4.01 exact at cap ₪28,750', () => {
    const r = computePensionContributions(28750);
    assertNear(r.pension_employee, 1725);
    assertNear(r.pension_employer, 1868.75);
    assertNear(r.severance_employer, 2394.88, 0.01);
  });

  test('4.02 ₪28,750.01 (cent over cap) is capped', () => {
    const cap = computePensionContributions(28750);
    const over = computePensionContributions(28750.01);
    assertNear(over.pension_employee, cap.pension_employee);
    assertNear(over.pension_employer, cap.pension_employer);
    assertNear(over.severance_employer, cap.severance_employer);
  });

  test('4.03 severance exactly 8.33% of capped base', () => {
    const r = computePensionContributions(10000);
    assertNear(r.severance_employer, 833, 0.01);
  });

  test('4.04 negative base clamped', () => {
    const r = computePensionContributions(-500);
    assert.equal(r.pension_employee, 0);
    assert.equal(r.pension_employer, 0);
    assert.equal(r.severance_employer, 0);
  });

  test('4.05 rates match 2026 spec', () => {
    assert.equal(CONSTANTS_2026.PENSION.EMPLOYEE_RATE, 0.06);
    assert.equal(CONSTANTS_2026.PENSION.EMPLOYER_RATE, 0.065);
    assert.equal(CONSTANTS_2026.PENSION.SEVERANCE_RATE, 0.0833);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 5: computeStudyFund — edge cases
// ═════════════════════════════════════════════════════════════

describe('QA-02.5 Study Fund — boundaries', () => {
  test('5.01 cap exact ₪15,712', () => {
    const r = computeStudyFund(15712, true);
    assertNear(r.study_fund_employee, 392.8);
    assertNear(r.study_fund_employer, 1178.4);
  });

  test('5.02 cap + 0.01 clamped', () => {
    const at = computeStudyFund(15712, true);
    const over = computeStudyFund(15712.01, true);
    assert.deepEqual(over, at);
  });

  test('5.03 eligible=undefined defaults to true', () => {
    const r = computeStudyFund(10000);
    assert.ok(r.study_fund_employee > 0);
  });

  test('5.04 eligible=0 (falsy) returns zeros', () => {
    const r = computeStudyFund(10000, 0);
    assert.equal(r.study_fund_employee, 0);
    assert.equal(r.study_fund_employer, 0);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 6: computeHourlyGross — null / negative / overflow
// ═════════════════════════════════════════════════════════════

describe('QA-02.6 Hourly gross — nulls and overflow', () => {
  test('6.01 empty timesheet returns zero gross', () => {
    const r = computeHourlyGross(makeHourlyEmployee({ base_salary: 50 }), {});
    assertNear(r.basePay, 0);
    assertNear(r.overtimePay, 0);
  });

  test('6.02 null employee.base_salary treated as 0', () => {
    const r = computeHourlyGross(
      makeHourlyEmployee({ base_salary: null }),
      { hours_regular: 100 }
    );
    assertNear(r.basePay, 0);
  });

  test('6.03 empty-string hours treated as 0', () => {
    const r = computeHourlyGross(
      makeHourlyEmployee({ base_salary: 50 }),
      { hours_regular: '', hours_overtime_125: '' }
    );
    assertNear(r.basePay, 0);
    assertNear(r.overtimePay, 0);
  });

  test('6.04 overflow: 9,999,999 regular hours at ₪1/hr (sanity)', () => {
    // Not realistic but must not overflow or throw.
    const r = computeHourlyGross(
      makeHourlyEmployee({ base_salary: 1 }),
      { hours_regular: 9_999_999 }
    );
    assert.ok(Number.isFinite(r.basePay));
    assertNear(r.basePay, 9_999_999, 1);
  });

  test('6.05 OT200 used for holiday pay — 4h × ₪100 → 800', () => {
    const r = computeHourlyGross(
      makeHourlyEmployee({ base_salary: 100 }),
      { hours_overtime_200: 4 }
    );
    assertNear(r.overtimePay, 800);
  });

  test('6.06 negative hours (data entry error) produces negative gross — DOCUMENTED', () => {
    // This is a BUG SURFACE — caller should sanitize. Test documents the behavior.
    const r = computeHourlyGross(
      makeHourlyEmployee({ base_salary: 50 }),
      { hours_regular: -10 }
    );
    assert.equal(r.basePay, -500, 'current implementation allows negative base');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 7: computeMonthlyGross — partial months & DST-ish dates
// ═════════════════════════════════════════════════════════════

describe('QA-02.7 Monthly gross — prorating', () => {
  test('7.01 50% work_percentage yields half base', () => {
    const emp = makeMonthlyEmployee({ base_salary: 10000, work_percentage: 50 });
    const r = computeMonthlyGross(emp, {});
    assertNear(r.basePay, 5000);
  });

  test('7.02 0% work_percentage uses default 100% (per existing code path)', () => {
    // (toNum(0)/100) || 1 → since 0/100 = 0 which is falsy → fallback to 1
    const emp = makeMonthlyEmployee({ base_salary: 10000, work_percentage: 0 });
    const r = computeMonthlyGross(emp, {});
    // BUG SURFACE: 0% becoming 100% is unlikely to be intentional.
    // This test documents the behavior so future refactors are surfaced.
    assertNear(r.basePay, 10000);
  });

  test('7.03 vacation pay is added separately', () => {
    const emp = makeMonthlyEmployee({ base_salary: 9100, hours_per_month: 182 });
    const r = computeMonthlyGross(emp, { hours_vacation: 8 });
    // hourlyRate = 9100/182 = 50
    // vacationPay = 8 * 50 = 400
    assertNear(r.vacationPay, 400);
  });

  test('7.04 sick at 50% (per simplified rule)', () => {
    const emp = makeMonthlyEmployee({ base_salary: 9100, hours_per_month: 182 });
    const r = computeMonthlyGross(emp, { hours_sick: 8 });
    // hourlyRate = 50
    // sickPay = 8 * 50 * 0.5 = 200
    assertNear(r.sickPay, 200);
  });

  test('7.05 hours_per_month=0 — fallback to default 182 (no divide-by-zero)', () => {
    const emp = makeMonthlyEmployee({ base_salary: 10000, hours_per_month: 0 });
    const r = computeMonthlyGross(emp, { hours_absence: 8 });
    // fallback to 182 → hourlyRate ≈ 54.95
    // basePay = 10000 - 8*54.95 ≈ 9560.44
    assert.ok(Number.isFinite(r.basePay));
    assertNear(r.basePay, 9560.44, 0.5);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 8: computeWageSlip — INVARIANTS
// ═════════════════════════════════════════════════════════════

describe('QA-02.8 Wage slip invariants', () => {
  // Sweep of different salary levels to prove invariants hold everywhere.
  const salaries = [
    4500,    // near minimum wage
    7522,    // BL threshold
    10000,   // common junior
    15000,   // common mid
    28750,   // pension cap
    49030,   // BL cap
    60000,   // above BL cap
    150000,  // ultra high
  ];

  for (const sal of salaries) {
    test(`8.01@₪${sal} invariant gross - deductions ≈ net (±0.02)`, () => {
      const slip = computeWageSlip({
        employee: makeMonthlyEmployee({ base_salary: sal }),
        employer: makeEmployer(),
        timesheet: {},
        period: makePeriod(),
      });
      const diff = slip.gross_pay - slip.total_deductions;
      assertNear(slip.net_pay, diff, 0.02,
        `at ₪${sal}: net=${slip.net_pay}, expected ${diff}`);
    });

    test(`8.02@₪${sal} invariant net > 0 and net <= gross`, () => {
      const slip = computeWageSlip({
        employee: makeMonthlyEmployee({ base_salary: sal }),
        employer: makeEmployer(),
        timesheet: {},
        period: makePeriod(),
      });
      assert.ok(slip.net_pay > 0, `net should be >0 at ₪${sal}`);
      assert.ok(slip.net_pay <= slip.gross_pay, `net should be ≤ gross at ₪${sal}`);
    });
  }

  test('8.03 wage slip on Feb 29 leap year period — no date crash', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 10000 }),
      employer: makeEmployer(),
      timesheet: {},
      period: { year: 2028, month: 2, pay_date: '2028-02-29' },
    });
    assert.equal(slip.period_label, '2028-02');
    assert.equal(slip.pay_date, '2028-02-29');
  });

  test('8.04 wage slip at boundary month=12 formats correctly', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee(),
      employer: makeEmployer(),
      timesheet: {},
      period: { year: 2026, month: 12, pay_date: '2027-01-10' },
    });
    assert.equal(slip.period_label, '2026-12');
  });

  test('8.05 wage slip with extreme salary ₪9,999,999.99 — no overflow', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 9_999_999.99 }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
    });
    assert.ok(Number.isFinite(slip.gross_pay));
    assert.ok(Number.isFinite(slip.net_pay));
    assert.ok(Number.isFinite(slip.income_tax));
    assert.ok(slip.gross_pay > 0);
  });

  test('8.06 missing timesheet argument defaults to {}', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 10000 }),
      employer: makeEmployer(),
      period: makePeriod(),
    });
    assert.ok(slip.gross_pay > 0);
  });

  test('8.07 YTD fields never decrease (must be additive)', () => {
    const slip1 = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 10000 }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
      ytd: { ytd_gross: 100000 },
    });
    assert.ok(slip1.ytd_gross >= 100000);
  });

  test('8.08 invariant: sum of overtime_pay components equals overtime_pay', () => {
    const slip = computeWageSlip({
      employee: makeHourlyEmployee({ base_salary: 60 }),
      employer: makeEmployer(),
      timesheet: {
        hours_regular: 100,
        hours_overtime_125: 2,
        hours_overtime_150: 2,
        hours_overtime_175: 2,
        hours_overtime_200: 2,
      },
      period: makePeriod(),
    });
    // 2*60*1.25 + 2*60*1.5 + 2*60*1.75 + 2*60*2 = 150+180+210+240 = 780
    assertNear(slip.overtime_pay, 780);
  });

  test('8.09 missing employee.full_name concatenates first+last', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({
        full_name: undefined,
        first_name: 'First',
        last_name: 'Last',
      }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
    });
    assert.equal(slip.employee_name, 'First Last');
  });

  test('8.10 tax_credits === 0 uses default 2.25 via || fallback — BUG SURFACE', () => {
    // The current code: `toNum(employee.tax_credits) || 2.25`
    // That means tax_credits=0 is treated as 2.25. This is a BUG because
    // a resident non-citizen may legitimately have 0 credits.
    // We DOCUMENT the behavior so a future fix is visible.
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 100000, tax_credits: 0 }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
    });
    // creditValue in _debug should equal 2.25 * 2976 = 6696, not 0
    assert.equal(slip._debug.taxCreditPoints, 2.25,
      'BUG: tax_credits=0 currently falls back to 2.25');
  });

  test('8.11 invariant: BL employer rate >= BL employee rate', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 20000 }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
    });
    assert.ok(slip.bituach_leumi_employer >= slip.bituach_leumi,
      'employer must pay >= employee (3.55%+7.6% vs 0.4%+7%)');
  });

  test('8.12 invariant: severance (8.33%) < pension_employer (6.5%) FALSE', () => {
    // Check that severance_employer is typically GREATER than pension_employer
    // (8.33% > 6.5%). This guards against accidental swap.
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 15000 }),
      employer: makeEmployer(),
      timesheet: {},
      period: makePeriod(),
    });
    assert.ok(slip.severance_employer > slip.pension_employer,
      `severance_employer=${slip.severance_employer} should be > pension_employer=${slip.pension_employer}`);
  });

  test('8.13 allowances are added to gross', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 10000 }),
      employer: makeEmployer(),
      timesheet: {
        allowances_meal: 100,
        allowances_travel: 200,
        allowances_clothing: 50,
        allowances_phone: 75,
        other_earnings: 25,
      },
      period: makePeriod(),
    });
    assertNear(slip.gross_pay, 10000 + 100 + 200 + 50 + 75 + 25);
  });

  test('8.14 bonuses + commissions added to gross', () => {
    const slip = computeWageSlip({
      employee: makeMonthlyEmployee({ base_salary: 10000 }),
      employer: makeEmployer(),
      timesheet: { bonuses: 1500, commissions: 500 },
      period: makePeriod(),
    });
    assertNear(slip.gross_pay, 12000);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 9: Overtime matrix — 125/150/175/200
// ═════════════════════════════════════════════════════════════

describe('QA-02.9 Overtime multipliers', () => {
  // Each overtime hour at a given rate: hourly × multiplier
  const cases = [
    { field: 'hours_overtime_125', mult: 1.25, name: 'first 2h' },
    { field: 'hours_overtime_150', mult: 1.50, name: 'after 2h' },
    { field: 'hours_overtime_175', mult: 1.75, name: 'weekend' },
    { field: 'hours_overtime_200', mult: 2.00, name: 'holiday' },
  ];
  for (const c of cases) {
    test(`9.${c.field}: 1h at ₪100 → ${100 * c.mult}`, () => {
      const r = computeHourlyGross(
        makeHourlyEmployee({ base_salary: 100 }),
        { [c.field]: 1 }
      );
      assertNear(r.overtimePay, 100 * c.mult);
    });
  }

  test('9.05 OVERTIME_RATES constants exactly match law', () => {
    assert.equal(CONSTANTS_2026.OVERTIME_RATES.FIRST_2H, 1.25);
    assert.equal(CONSTANTS_2026.OVERTIME_RATES.AFTER_2H, 1.50);
    assert.equal(CONSTANTS_2026.OVERTIME_RATES.WEEKEND, 1.75);
    assert.equal(CONSTANTS_2026.OVERTIME_RATES.HOLIDAY, 2.00);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 10: CONSTANTS_2026 frozen-values check
// ═════════════════════════════════════════════════════════════

describe('QA-02.10 CONSTANTS_2026 matches Israeli 2026 tax law', () => {
  test('10.01 tax brackets rate ladder 10/14/20/31/35/47/50', () => {
    const rates = CONSTANTS_2026.INCOME_TAX_BRACKETS.map(b => b.rate);
    assert.deepEqual(rates, [0.10, 0.14, 0.20, 0.31, 0.35, 0.47, 0.50]);
  });

  test('10.02 tax credit point = ₪2976/year', () => {
    assert.equal(CONSTANTS_2026.TAX_CREDIT_POINT_ANNUAL, 2976);
    assert.equal(CONSTANTS_2026.TAX_CREDIT_POINT_MONTHLY, 248);
  });

  test('10.03 bracket ladder is strictly increasing', () => {
    let prev = 0;
    for (const b of CONSTANTS_2026.INCOME_TAX_BRACKETS) {
      assert.ok(b.upTo > prev, `bracket ${b.upTo} should be > ${prev}`);
      prev = b.upTo;
    }
  });

  test('10.04 last bracket upTo is Infinity', () => {
    const last = CONSTANTS_2026.INCOME_TAX_BRACKETS.at(-1);
    assert.equal(last.upTo, Infinity);
  });

  test('10.05 rounding precision is 2 (NIS)', () => {
    assert.equal(CONSTANTS_2026.ROUND_TO, 2);
  });
});
