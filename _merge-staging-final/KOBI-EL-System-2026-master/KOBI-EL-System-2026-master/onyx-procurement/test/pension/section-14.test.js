/**
 * Section 14 Pension Arrangement Tracker — Unit Tests
 * Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/pension/section-14.test.js
 *     or:     node test/run.js
 *
 * Covers:
 *   1. createArrangement validation & classification (full vs partial)
 *   2. calculateMonthlyContribution — breakdown correctness
 *   3. calculateSeveranceOnTermination
 *        a. FULL arrangement: no top-up on dismissal or resignation
 *        b. PARTIAL 6%-only: proportional top-up
 *        c. Years before arrangement: additional top-up
 *        d. Forfeiture (theft): zero top-up
 *   4. isFullyReleased — structural boolean
 *   5. generateArrangementLetter — Hebrew letter content
 *   6. trackContributionHistory — month-by-month aggregation
 *   7. upgradeArrangement — "לא מוחקים, רק משדרגים"
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const S14 = require(path.resolve(__dirname, '..', '..', 'src', 'pension', 'section-14.js'));

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function near(a, b, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}
function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ±${eps}, got ${actual} (delta ${actual - expected})`
  );
}

function makeEmployee(overrides = {}) {
  return {
    id: 'e-001',
    full_name: 'Dana Levi',
    national_id: '302020202',
    position: 'Site Engineer',
    department: 'Engineering',
    ...overrides,
  };
}

function makeFullArrangement(overrides = {}) {
  S14._resetAll();
  return S14.createArrangement({
    employee: makeEmployee(),
    startDate: '2020-01-01',
    percentages: {
      employerPension: 0.065,
      severance: 0.0833,
      employeeContribution: 0.06,
      studyFund: 0.075,
    },
    signed: true,
    signedDate: '2019-12-20',
    fundName: 'מגדל מקפת',
    fundPolicyNumber: 'MCP-998877',
    ...overrides,
  });
}

function makePartialArrangement(overrides = {}) {
  S14._resetAll();
  return S14.createArrangement({
    employee: makeEmployee(),
    startDate: '2020-01-01',
    percentages: {
      employerPension: 0.06,
      severance: 0.06, // only 6% instead of 8.33% → partial
      employeeContribution: 0.06,
    },
    signed: true,
    signedDate: '2019-12-20',
    fundName: 'הראל פנסיה',
    fundPolicyNumber: 'HRL-112233',
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 1. createArrangement — validation and classification
// ═══════════════════════════════════════════════════════════════════════

test('createArrangement: full arrangement is flagged correctly', () => {
  const a = makeFullArrangement();
  assert.equal(a.arrangement_type, 'full');
  assert.equal(a.arrangement_type_he, 'הסדר מלא');
  assertNear(a.coverage_ratio, 1.0, 0.01);
  assert.equal(a.status, 'active');
  assert.equal(a.release_prerequisites.signed_agreement, true);
  assert.equal(a.release_prerequisites.severance_rate_positive, true);
  assert.equal(a.employee_snapshot.full_name, 'Dana Levi');
});

test('createArrangement: partial arrangement is flagged correctly', () => {
  const a = makePartialArrangement();
  assert.equal(a.arrangement_type, 'partial');
  assert.equal(a.arrangement_type_he, 'הסדר חלקי');
  assert.ok(a.coverage_ratio < 1.0);
  assertNear(a.coverage_ratio, 0.06 / (1 / 12), 0.001);
});

test('createArrangement: rejects severance above statutory 8.33%', () => {
  S14._resetAll();
  assert.throws(() =>
    S14.createArrangement({
      employee: makeEmployee(),
      startDate: '2020-01-01',
      percentages: {
        employerPension: 0.065,
        severance: 0.10,           // illegal: > 8.33%
        employeeContribution: 0.06,
      },
    })
  );
});

test('createArrangement: rejects employer pension below 6%', () => {
  S14._resetAll();
  assert.throws(() =>
    S14.createArrangement({
      employee: makeEmployee(),
      startDate: '2020-01-01',
      percentages: {
        employerPension: 0.04,     // illegal
        severance: 0.0833,
        employeeContribution: 0.06,
      },
    })
  );
});

test('createArrangement: rejects employee contribution below 6%', () => {
  S14._resetAll();
  assert.throws(() =>
    S14.createArrangement({
      employee: makeEmployee(),
      startDate: '2020-01-01',
      percentages: {
        employerPension: 0.065,
        severance: 0.0833,
        employeeContribution: 0.05, // illegal
      },
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 2. calculateMonthlyContribution — breakdown correctness
// ═══════════════════════════════════════════════════════════════════════

test('calculateMonthlyContribution: computes all components for full arrangement', () => {
  const a = makeFullArrangement();
  const c = S14.calculateMonthlyContribution(12000, a);

  assertNear(c.employer.pension,    12000 * 0.065);  // 780
  assertNear(c.employer.severance,  12000 * 0.0833); // 999.6
  assertNear(c.employer.study_fund, 12000 * 0.075);  // 900
  assertNear(c.employer.total,      12000 * (0.065 + 0.0833 + 0.075)); // 2679.6

  assertNear(c.employee.pension,    12000 * 0.06);   // 720
  assertNear(c.employee.study_fund, 12000 * 0.025);  // 300
  assertNear(c.employee.total,      12000 * 0.085);  // 1020

  assertNear(c.total_contribution,  12000 * (0.065 + 0.0833 + 0.075 + 0.06 + 0.025));
});

test('calculateMonthlyContribution: partial arrangement lower employer severance', () => {
  const a = makePartialArrangement();
  const c = S14.calculateMonthlyContribution(10000, a);
  assertNear(c.employer.severance, 10000 * 0.06); // 600, not 833
});

// ═══════════════════════════════════════════════════════════════════════
// 3. calculateSeveranceOnTermination
// ═══════════════════════════════════════════════════════════════════════

test('terminate: FULL arrangement — NO top-up on dismissal', () => {
  const a = makeFullArrangement();
  const t = S14.calculateSeveranceOnTermination({
    employee: makeEmployee(),
    arrangement: a,
    finalSalary: 12000,
    yearsEmployed: 5,
    reason: 'dismissal',
    terminationDate: '2025-01-01',
  });
  assertNear(t.statutory_severance, 12000 * 5);
  assertNear(t.top_up_owed, 0, 0.5);
  assert.equal(t.fully_released, true);
});

test('terminate: FULL arrangement — NO top-up on resignation (key Section 14 benefit)', () => {
  const a = makeFullArrangement();
  const t = S14.calculateSeveranceOnTermination({
    employee: makeEmployee(),
    arrangement: a,
    finalSalary: 15000,
    yearsEmployed: 3,
    reason: 'resignation',
    terminationDate: '2023-01-01',
  });
  assertNear(t.top_up_owed, 0, 0.5);
  assert.equal(t.fully_released, true);
});

test('terminate: PARTIAL (6% only) — proportional top-up required', () => {
  const a = makePartialArrangement();
  const t = S14.calculateSeveranceOnTermination({
    employee: makeEmployee(),
    arrangement: a,
    finalSalary: 10000,
    yearsEmployed: 5,
    reason: 'dismissal',
    terminationDate: '2025-01-01',
  });
  const statutory = 10000 * 5; // 50,000
  const alreadyDeposited = 10000 * 12 * 0.06 * 5; // 36,000
  const expectedTopUp = statutory - alreadyDeposited;

  assertNear(t.statutory_severance, statutory, 1);
  assertNear(t.already_deposited_under_section_14, alreadyDeposited, 1);
  assertNear(t.top_up_owed, expectedTopUp, 1);
  assert.equal(t.fully_released, false);
});

test('terminate: years BEFORE arrangement start trigger extra top-up', () => {
  const a = makeFullArrangement(); // start 2020-01-01
  const t = S14.calculateSeveranceOnTermination({
    employee: makeEmployee(),
    arrangement: a,
    finalSalary: 10000,
    yearsEmployed: 7, // 2018-01-01 → 2025-01-01 → 2 yrs before arrangement
    reason: 'dismissal',
    terminationDate: '2025-01-01',
  });
  // 2 years before the arrangement must be topped up at full salary.
  // Allow a small tolerance because _yearsBetween uses 365.25 days/year,
  // which introduces ~2h/year drift vs calendar years.
  assertNear(t.breakdown.top_up_for_pre_arrangement, 10000 * 2, 30);
  assert.ok(t.top_up_owed >= 10000 * 2 - 30);
});

test('terminate: forfeiture (theft) → zero top-up', () => {
  const a = makeFullArrangement();
  const t = S14.calculateSeveranceOnTermination({
    employee: makeEmployee(),
    arrangement: a,
    finalSalary: 12000,
    yearsEmployed: 5,
    reason: 'theft_or_fraud',
    terminationDate: '2025-01-01',
  });
  assert.equal(t.forfeited, true);
  assertNear(t.top_up_owed, 0);
});

test('terminate: unknown reason throws', () => {
  const a = makeFullArrangement();
  assert.throws(() =>
    S14.calculateSeveranceOnTermination({
      employee: makeEmployee(),
      arrangement: a,
      finalSalary: 12000,
      yearsEmployed: 5,
      reason: 'made_up_reason',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 4. isFullyReleased
// ═══════════════════════════════════════════════════════════════════════

test('isFullyReleased: true for full + signed', () => {
  const a = makeFullArrangement();
  assert.equal(S14.isFullyReleased(a), true);
});

test('isFullyReleased: false for partial', () => {
  const a = makePartialArrangement();
  assert.equal(S14.isFullyReleased(a), false);
});

test('isFullyReleased: false if not signed', () => {
  S14._resetAll();
  const a = S14.createArrangement({
    employee: makeEmployee(),
    startDate: '2020-01-01',
    percentages: {
      employerPension: 0.065,
      severance: 0.0833,
      employeeContribution: 0.06,
    },
    signed: false,
  });
  assert.equal(S14.isFullyReleased(a), false);
});

// ═══════════════════════════════════════════════════════════════════════
// 5. generateArrangementLetter
// ═══════════════════════════════════════════════════════════════════════

test('generateArrangementLetter: contains key Hebrew clauses', () => {
  const a = makeFullArrangement();
  const letter = S14.generateArrangementLetter(a);
  assert.ok(letter.text_he.includes('סעיף 14 לחוק פיצויי פיטורים'));
  assert.ok(letter.text_he.includes('היתר הכללי'));
  assert.ok(letter.text_he.includes('8.33%') || letter.text_he.includes('8.330%'));
  assert.ok(letter.text_he.includes('Dana Levi'));
  assert.equal(letter.direction, 'rtl');
  assert.equal(letter.language_primary, 'he');
  assert.ok(letter.text_en.includes('Section 14'));
});

test('generateArrangementLetter: partial arrangement mentions top-up', () => {
  const a = makePartialArrangement();
  const letter = S14.generateArrangementLetter(a);
  assert.ok(letter.text_he.includes('השלמה') || letter.text_he.includes('חלקי'));
  assert.ok(letter.text_en.includes('top up') || letter.text_en.includes('PARTIAL'));
});

// ═══════════════════════════════════════════════════════════════════════
// 6. trackContributionHistory — month-by-month aggregation
// ═══════════════════════════════════════════════════════════════════════

test('trackContributionHistory: aggregates month-by-month rows correctly', () => {
  const a = makeFullArrangement();
  // Record 6 months at 10,000 each
  for (let m = 1; m <= 6; m++) {
    const pad = m < 10 ? '0' + m : String(m);
    S14.recordMonthlyContribution(a.id, {
      period: `2020-${pad}`,
      salary: 10000,
    });
  }
  const history = S14.trackContributionHistory('e-001');
  assert.equal(history.employee_id, 'e-001');
  assert.equal(history.arrangements.length, 1);
  assert.equal(history.arrangements[0].monthly_history.length, 6);

  const agg = history.arrangements[0].aggregate;
  assertNear(agg.salary_sum, 60000, 1);
  assertNear(agg.employer_pension, 60000 * 0.065, 1);    // 3,900
  assertNear(agg.severance,        60000 * 0.0833, 1);   // 4,998
  assertNear(agg.employee_contribution, 60000 * 0.06, 1); // 3,600

  assertNear(history.grand_total.salary_sum, 60000, 1);
  assert.equal(history.grand_total.months, 6);
});

test('trackContributionHistory: spans multiple (upgraded) arrangements', () => {
  const a1 = makeFullArrangement();
  S14.recordMonthlyContribution(a1.id, { period: '2020-01', salary: 10000 });
  S14.recordMonthlyContribution(a1.id, { period: '2020-02', salary: 10000 });

  const a2 = S14.upgradeArrangement(a1.id, {
    employerPension: 0.07, // bumped
  });
  S14.recordMonthlyContribution(a2.id, { period: '2020-03', salary: 10000 });

  const history = S14.trackContributionHistory('e-001');
  assert.equal(history.arrangements.length, 2);
  assert.equal(history.grand_total.months, 3);
  assertNear(history.grand_total.salary_sum, 30000, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// 7. upgradeArrangement — "לא מוחקים, רק משדרגים"
// ═══════════════════════════════════════════════════════════════════════

test('upgradeArrangement: old version is preserved with superseded_by', () => {
  const a1 = makeFullArrangement();
  const a2 = S14.upgradeArrangement(a1.id, { employerPension: 0.07 });

  const oldRecord = S14.getArrangement(a1.id);
  const newRecord = S14.getArrangement(a2.id);

  assert.equal(oldRecord.superseded_by, a2.id);
  assert.equal(oldRecord.status, 'superseded');
  assert.ok(oldRecord.superseded_at);
  assert.equal(newRecord.version, 2);
  assert.equal(newRecord.supersedes, a1.id);
  assertNear(newRecord.percentages.employer_pension, 0.07, 0.0001);
});

test('upgradeArrangement: cannot double-supersede', () => {
  const a1 = makeFullArrangement();
  S14.upgradeArrangement(a1.id, { employerPension: 0.07 });
  assert.throws(() => S14.upgradeArrangement(a1.id, { employerPension: 0.08 }));
});
