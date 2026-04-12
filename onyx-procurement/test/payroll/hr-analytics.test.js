/**
 * HR Analytics — Unit Tests
 * Agent X-12 • Techno-Kol Uzi • Swarm 3
 *
 * Run with:   node --test test/payroll/hr-analytics.test.js
 * or:         node test/run.js
 *
 * Requires Node >= 18 for node:test.
 *
 * 20+ scenarios covering all exported HR analytics endpoints,
 * Israeli labor law edge cases, privacy collapses, and regression
 * cases for reserve duty and maternity exclusions.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const hr = require(path.resolve(__dirname, '..', '..', 'src', 'hr', 'analytics.js'));

const {
  headcountReport,
  turnoverAnalysis,
  timeToHire,
  timeToProductivity,
  costPerHire,
  totalComp,
  overtimeCostRatio,
  absenceRate,
  tenureHistogram,
  diversityDashboard,
  trainingHours,
  payEquityAudit,
  retentionRisk,
  severance,
  form106,
  PRIVACY,
  _internals,
} = hr;

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function makeEmployee(overrides = {}) {
  return {
    id: 'e-001',
    hire_date: daysAgo(400),
    department: 'engineering',
    role: 'developer',
    employment_type: 'full_time',
    gender: 'male',
    birth_date: daysAgo(365 * 32),
    base_salary: 18000,
    payroll_history: [],
    benefits: { annual_value: 6000 },
    ...overrides,
  };
}

function makeCohort() {
  return [
    makeEmployee({ id: 'e-1', department: 'engineering', role: 'developer', gender: 'male',   base_salary: 22000, hire_date: daysAgo(1000) }),
    makeEmployee({ id: 'e-2', department: 'engineering', role: 'developer', gender: 'male',   base_salary: 21000, hire_date: daysAgo(800) }),
    makeEmployee({ id: 'e-3', department: 'engineering', role: 'developer', gender: 'male',   base_salary: 20000, hire_date: daysAgo(600) }),
    makeEmployee({ id: 'e-4', department: 'engineering', role: 'developer', gender: 'female', base_salary: 18000, hire_date: daysAgo(900) }),
    makeEmployee({ id: 'e-5', department: 'engineering', role: 'developer', gender: 'female', base_salary: 17500, hire_date: daysAgo(700) }),
    makeEmployee({ id: 'e-6', department: 'engineering', role: 'developer', gender: 'female', base_salary: 17000, hire_date: daysAgo(500) }),
    makeEmployee({ id: 'e-7', department: 'ops', role: 'operator', gender: 'male', base_salary: 14000, hire_date: daysAgo(1500) }),
    makeEmployee({ id: 'e-8', department: 'ops', role: 'operator', gender: 'male', base_salary: 14500, hire_date: daysAgo(100) }),
    makeEmployee({ id: 'e-9', department: 'ops', role: 'operator', gender: 'female', base_salary: 13500, hire_date: daysAgo(200) }),
    makeEmployee({
      id: 'e-10',
      department: 'hr',
      role: 'hr_manager',
      gender: 'female',
      base_salary: 25000,
      hire_date: daysAgo(2000),
      termination_date: daysAgo(30),
    }),
  ];
}

// ═══════════════════════════════════════════════════════════════
// 1. HEADCOUNT
// ═══════════════════════════════════════════════════════════════

test('headcountReport: total counts only active employees', () => {
  const r = headcountReport(makeCohort(), { year: new Date().getUTCFullYear() });
  assert.equal(r.total, 9); // e-10 is terminated
  assert.equal(r.by_department.engineering, 6);
  assert.equal(r.by_department.ops, 3);
  assert.ok(!r.by_department.hr); // terminated should not appear
});

test('headcountReport: returns bilingual label and trend array', () => {
  const r = headcountReport(makeCohort(), {
    start: daysAgo(90),
    end: new Date().toISOString(),
  });
  assert.ok(r.label && r.label.he && r.label.en);
  assert.ok(Array.isArray(r.trend));
  assert.ok(r.trend.length >= 1);
  for (const row of r.trend) {
    assert.match(row.month, /^\d{4}-\d{2}$/);
    assert.equal(typeof row.count, 'number');
  }
});

test('headcountReport: empty list → total 0, no crash', () => {
  const r = headcountReport([], {});
  assert.equal(r.total, 0);
  assert.deepEqual(r.by_department, {});
});

// ═══════════════════════════════════════════════════════════════
// 2. TURNOVER
// ═══════════════════════════════════════════════════════════════

test('turnoverAnalysis: excludes reserve duty (מילואים)', () => {
  const employees = makeCohort();
  const separations = [
    { employee_id: 'e-1', date: daysAgo(10), reason: 'מילואים', type: 'reserve_duty', voluntary: false },
    { employee_id: 'e-2', date: daysAgo(20), reason: 'personal', voluntary: true },
  ];
  const r = turnoverAnalysis(
    { employees, separations },
    { start: daysAgo(60), end: new Date().toISOString() }
  );
  assert.equal(r.separations, 1, 'reserve duty must be excluded');
  assert.equal(r.voluntary, 1);
  assert.equal(r.involuntary, 0);
  assert.equal(r.reserve_duty_excluded, true);
});

test('turnoverAnalysis: voluntary vs involuntary and by_reason', () => {
  const employees = makeCohort();
  const separations = [
    { employee_id: 'e-1', date: daysAgo(5),  reason: 'relocation', voluntary: true },
    { employee_id: 'e-2', date: daysAgo(8),  reason: 'performance', voluntary: false },
    { employee_id: 'e-3', date: daysAgo(20), reason: 'relocation', voluntary: true },
  ];
  const r = turnoverAnalysis(
    { employees, separations },
    { start: daysAgo(30), end: new Date().toISOString() }
  );
  assert.equal(r.voluntary, 2);
  assert.equal(r.involuntary, 1);
  assert.equal(r.by_reason.relocation, 2);
  assert.equal(r.by_reason.performance, 1);
});

test('turnoverAnalysis: rolling_12m and ytd blocks present', () => {
  const r = turnoverAnalysis(
    { employees: makeCohort(), separations: [] },
    { year: new Date().getUTCFullYear() }
  );
  assert.ok(r.ytd);
  assert.ok(r.rolling_12m);
  assert.equal(typeof r.ytd.rate, 'number');
  assert.equal(typeof r.rolling_12m.rate, 'number');
});

// ═══════════════════════════════════════════════════════════════
// 3. TIME TO HIRE
// ═══════════════════════════════════════════════════════════════

test('timeToHire: computes avg / median / p90 correctly', () => {
  const records = [
    { requisition_open_at: daysAgo(30), offer_accepted_at: daysAgo(15), department: 'engineering' }, // 15 days
    { requisition_open_at: daysAgo(40), offer_accepted_at: daysAgo(20), department: 'engineering' }, // 20 days
    { requisition_open_at: daysAgo(50), offer_accepted_at: daysAgo(20), department: 'ops' },         // 30 days
  ];
  const r = timeToHire(records, {
    start: daysAgo(90),
    end: new Date().toISOString(),
  });
  assert.equal(r.count, 3);
  assert.ok(r.avg_days >= 20 && r.avg_days <= 25);
  assert.ok(r.median_days > 0);
  assert.equal(r.by_department.engineering, 17.5);
  assert.equal(r.by_department.ops, 30);
});

// ═══════════════════════════════════════════════════════════════
// 4. TIME TO PRODUCTIVITY
// ═══════════════════════════════════════════════════════════════

test('timeToProductivity: uses productivity_reached_at when present', () => {
  const employees = [
    { id: 'p-1', hire_date: daysAgo(100), productivity_reached_at: daysAgo(30) }, // 70 days
    { id: 'p-2', hire_date: daysAgo(60),  productivity_reached_at: daysAgo(10) }, // 50 days
  ];
  const r = timeToProductivity(employees, {
    start: daysAgo(365),
    end: new Date().toISOString(),
  });
  assert.equal(r.count, 2);
  assert.ok(r.avg_days >= 55 && r.avg_days <= 65);
});

// ═══════════════════════════════════════════════════════════════
// 5. COST PER HIRE
// ═══════════════════════════════════════════════════════════════

test('costPerHire: totals spend and divides by hires', () => {
  const spend = { job_board_fees: 2000, agency_fees: 10000, referral_bonuses: 3000, internal_cost: 5000 };
  const hires = [
    { id: 'h-1', hire_date: daysAgo(10) },
    { id: 'h-2', hire_date: daysAgo(20) },
    { id: 'h-3', hire_date: daysAgo(30) },
    { id: 'h-4', hire_date: daysAgo(400) }, // outside period
  ];
  const r = costPerHire(spend, hires, { start: daysAgo(90), end: new Date().toISOString() });
  assert.equal(r.total_spend, 20000);
  assert.equal(r.hires, 3);
  assert.equal(r.cost_per_hire, round2(20000 / 3));
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// 6. TOTAL COMP
// ═══════════════════════════════════════════════════════════════

test('totalComp: sums all cost components per period', () => {
  const emp = makeEmployee({
    payroll_history: [
      { period: daysAgo(15), gross: 18000, overtime: 1500, pension_employer: 1170, severance_employer: 1499, bituach_leumi_employer: 1368, study_fund_employer: 1350 },
      { period: daysAgo(45), gross: 18000, overtime:    0, pension_employer: 1170, severance_employer: 1499, bituach_leumi_employer: 1368, study_fund_employer: 1350 },
    ],
    benefits: { annual_value: 12000 },
  });
  const r = totalComp(emp, { start: daysAgo(60), end: new Date().toISOString() });
  assert.equal(r.gross, 36000);
  assert.equal(r.overtime, 1500);
  assert.equal(r.pension_employer, 2340);
  assert.ok(r.total_employer_cost > r.gross, 'total cost > gross');
  assert.ok(r.benefits > 0, 'benefits prorated');
});

// ═══════════════════════════════════════════════════════════════
// 7. OVERTIME RATIO
// ═══════════════════════════════════════════════════════════════

test('overtimeCostRatio: overtime / base ratio', () => {
  const rows = [
    { period: daysAgo(5),  base: 10000, overtime: 1500 },
    { period: daysAgo(35), base: 10000, overtime: 500 },
  ];
  const r = overtimeCostRatio(rows, { start: daysAgo(60), end: new Date().toISOString() });
  assert.equal(r.base, 20000);
  assert.equal(r.overtime, 2000);
  assert.equal(r.ratio, 0.1);
});

// ═══════════════════════════════════════════════════════════════
// 8. ABSENCE RATE
// ═══════════════════════════════════════════════════════════════

test('absenceRate: maternity and reserve duty excluded from rate', () => {
  const absences = [
    { employee_id: 'a', date: daysAgo(5),  days: 3, type: 'sick' },
    { employee_id: 'a', date: daysAgo(10), days: 5, type: 'vacation' },
    { employee_id: 'b', date: daysAgo(15), days: 20, type: 'maternity' },  // excluded
    { employee_id: 'c', date: daysAgo(20), days: 30, type: 'reserve_duty' }, // excluded
    { employee_id: 'd', date: daysAgo(25), days: 2, type: 'unpaid' },
  ];
  const r = absenceRate(absences, 200, { start: daysAgo(60), end: new Date().toISOString() });
  assert.equal(r.days_absent_counted, 10); // 3+5+2 only
  assert.equal(r.buckets.maternity.days, 20);
  assert.equal(r.buckets.reserve_duty.days, 30);
  assert.equal(r.rate, 0.05);
});

// ═══════════════════════════════════════════════════════════════
// 9. TENURE HISTOGRAM
// ═══════════════════════════════════════════════════════════════

test('tenureHistogram: buckets employees correctly', () => {
  const r = tenureHistogram(makeCohort(), new Date());
  // e-10 is terminated, excluded
  const sum = Object.values(r.buckets).reduce((a, b) => a + b, 0);
  assert.equal(sum, 9);
  assert.ok(r.avg_tenure_years > 0);
});

// ═══════════════════════════════════════════════════════════════
// 10. DIVERSITY DASHBOARD (PRIVACY)
// ═══════════════════════════════════════════════════════════════

test('diversityDashboard: collapses small groups into "other"', () => {
  // Only 2 females in engineering role (below MIN_GROUP_SIZE=5)
  const small = [
    makeEmployee({ id: 's-1', gender: 'male' }),
    makeEmployee({ id: 's-2', gender: 'male' }),
    makeEmployee({ id: 's-3', gender: 'male' }),
    makeEmployee({ id: 's-4', gender: 'male' }),
    makeEmployee({ id: 's-5', gender: 'male' }),
    makeEmployee({ id: 's-6', gender: 'female' }),
    makeEmployee({ id: 's-7', gender: 'female' }),
  ];
  const r = diversityDashboard(small);
  assert.equal(r.total, 7);
  assert.equal(r.gender.male, 5);
  assert.ok(r.gender.other === 2 || r.gender.female === undefined, 'small female group collapsed');
  assert.equal(r.individual_pii_exposed, false);
  assert.ok(r.compliant_with.includes('חוק שוויון הזדמנויות בעבודה'));
});

test('diversityDashboard: empty returns total 0', () => {
  const r = diversityDashboard([]);
  assert.equal(r.total, 0);
  assert.equal(r.individual_pii_exposed, false);
});

// ═══════════════════════════════════════════════════════════════
// 11. TRAINING HOURS
// ═══════════════════════════════════════════════════════════════

test('trainingHours: totals and avg per employee', () => {
  const people = makeCohort(); // 9 active
  const records = [
    { employee_id: 'e-1', date: daysAgo(10), hours: 8, topic: 'safety' },
    { employee_id: 'e-2', date: daysAgo(20), hours: 16, topic: 'safety' },
    { employee_id: 'e-3', date: daysAgo(30), hours: 4, topic: 'compliance' },
  ];
  const r = trainingHours(records, people, { start: daysAgo(60), end: new Date().toISOString() });
  assert.equal(r.total_hours, 28);
  assert.equal(r.records_count, 3);
  assert.equal(r.by_topic.safety, 24);
  assert.ok(r.avg_hours_per_employee > 0);
});

// ═══════════════════════════════════════════════════════════════
// 12. PAY EQUITY AUDIT
// ═══════════════════════════════════════════════════════════════

test('payEquityAudit: detects pay gap when sample is sufficient', () => {
  const cohort = makeCohort(); // 3 male devs ~21k, 3 female devs ~17.5k
  const r = payEquityAudit(cohort);
  const dev = r.by_role.find((x) => x.role === 'developer');
  assert.ok(dev, 'developer row present');
  assert.ok(!dev.suppressed, 'developer row should have enough samples (3 each)');
  assert.ok(dev.gap_pct > 0, 'expect positive gap (male higher)');
  assert.equal(typeof dev.t_statistic, 'number');
});

test('payEquityAudit: suppresses small groups', () => {
  const r = payEquityAudit(makeCohort());
  const hr = r.by_role.find((x) => x.role === 'hr_manager');
  // hr_manager role has only 1 employee and she's terminated → suppressed or absent
  assert.ok(!hr || hr.suppressed, 'small role must be suppressed');
});

// ═══════════════════════════════════════════════════════════════
// 13. RETENTION RISK
// ═══════════════════════════════════════════════════════════════

test('retentionRisk: high risk employee', () => {
  const emp = makeEmployee({
    id: 'risk-1',
    hire_date: daysAgo(300), // < 1y
    base_salary: 14000,
    overtime_ratio: 0.4,
    absence_rate: 0.15,
    training_hours_annual: 2,
    performance_score: 2,
    flight_risk_signal: true,
  });
  const r = retentionRisk(emp, { role_median_salary: 20000 });
  assert.ok(r.risk_score >= 70, 'should be high risk');
  assert.equal(r.band, 'high');
  assert.ok(r.factors.length >= 5);
  assert.ok(r.suggested_interventions.length >= 3);
  assert.ok(r.suggested_interventions.some((i) => i.he && i.en));
});

test('retentionRisk: low risk employee', () => {
  const emp = makeEmployee({
    id: 'safe-1',
    hire_date: daysAgo(365 * 5),
    base_salary: 30000,
    overtime_ratio: 0.05,
    absence_rate: 0.02,
    training_hours_annual: 40,
    performance_score: 5,
    last_promotion_at: daysAgo(200),
  });
  const r = retentionRisk(emp, { role_median_salary: 28000 });
  assert.equal(r.band, 'low');
  assert.ok(r.risk_score < 40);
});

test('retentionRisk: null employee → unknown band', () => {
  const r = retentionRisk(null, {});
  assert.equal(r.band, 'unknown');
  assert.equal(r.risk_score, 0);
});

// ═══════════════════════════════════════════════════════════════
// 14. SEVERANCE (pitzuim)
// ═══════════════════════════════════════════════════════════════

test('severance: 1 month per year, partial years pro-rated', () => {
  const emp = { id: 's-1', hire_date: daysAgo(365 * 3), base_salary: 12000 };
  const r = severance(emp, new Date());
  // 3 years × 12000 = 36000 (small rounding for leap years OK)
  assert.ok(r.amount >= 35000 && r.amount <= 37000);
  assert.equal(r.monthly_base, 12000);
  assert.ok(r.years >= 2.9 && r.years <= 3.1);
  assert.ok(r.law.includes('פיצויי פיטורים'));
});

test('severance: zero-tenure returns zero', () => {
  const emp = { id: 's-2', hire_date: new Date().toISOString(), base_salary: 12000 };
  const r = severance(emp, new Date());
  assert.equal(r.amount, 0);
});

// ═══════════════════════════════════════════════════════════════
// 15. FORM 106 (YTD)
// ═══════════════════════════════════════════════════════════════

test('form106: aggregates YTD for the requested year', () => {
  const y = new Date().getUTCFullYear();
  const emp = makeEmployee({
    id: '106-1',
    teudat_zehut: '123456782',
    payroll_history: [
      { period: new Date(Date.UTC(y, 0, 31)).toISOString(),  gross: 18000, income_tax: 2500, bituach_leumi_employee: 540, health_tax_employee: 360, pension_employee: 1080, study_fund_employee: 450 },
      { period: new Date(Date.UTC(y, 1, 28)).toISOString(),  gross: 18000, income_tax: 2500, bituach_leumi_employee: 540, health_tax_employee: 360, pension_employee: 1080, study_fund_employee: 450 },
      { period: new Date(Date.UTC(y - 1, 10, 30)).toISOString(), gross: 18000, income_tax: 2500 }, // wrong year — excluded
    ],
  });
  const r = form106(emp, y);
  assert.equal(r.form, '106');
  assert.equal(r.year, y);
  assert.equal(r.employee_tz, '123456782');
  assert.equal(r.totals.gross_ytd, 36000);
  assert.equal(r.totals.income_tax_withheld, 5000);
  assert.equal(r.totals.pension_employee, 2160);
  assert.ok(r.totals.net_ytd < r.totals.gross_ytd);
  assert.equal(r.payroll_rows_count, 2);
});

// ═══════════════════════════════════════════════════════════════
// 16. INTERNAL HELPERS (sanity)
// ═══════════════════════════════════════════════════════════════

test('_internals: safeDiv / daysBetween / isActiveAt', () => {
  assert.equal(_internals.safeDiv(10, 0), 0);
  assert.equal(_internals.safeDiv(10, 2), 5);
  assert.equal(_internals.daysBetween(daysAgo(10), new Date().toISOString()), 10);

  const now = new Date();
  assert.equal(
    _internals.isActiveAt(
      { hire_date: daysAgo(100), termination_date: daysAgo(10) },
      now
    ),
    false
  );
  assert.equal(
    _internals.isActiveAt({ hire_date: daysAgo(100) }, now),
    true
  );
});

test('_internals: mean / stddev are population-style and safe', () => {
  assert.equal(_internals.mean([]), 0);
  assert.equal(_internals.mean([10, 20, 30]), 20);
  assert.equal(_internals.stddev([]), 0);
  assert.ok(_internals.stddev([10, 20, 30]) > 0);
});

test('_internals: normalizePeriod accepts multiple shapes', () => {
  const a = _internals.normalizePeriod({ year: 2025 });
  assert.equal(a.start.getUTCFullYear(), 2025);
  const b = _internals.normalizePeriod({ year: 2025, month: 7 });
  assert.equal(b.start.getUTCMonth(), 6); // 0-indexed
  const c = _internals.normalizePeriod({ start: daysAgo(30), end: daysAgo(1) });
  assert.ok(c.start && c.end);
});

// ═══════════════════════════════════════════════════════════════
// 17. PRIVACY INVARIANT
// ═══════════════════════════════════════════════════════════════

test('privacy: diversityDashboard never exposes individual PII', () => {
  const r = diversityDashboard(makeCohort());
  const json = JSON.stringify(r);
  assert.equal(json.includes('e-1'), false, 'no employee IDs in diversity output');
  assert.equal(json.includes('base_salary'), false, 'no salaries in diversity output');
  assert.equal(json.includes('teudat_zehut'), false);
});

test('privacy: payEquityAudit never leaks individual salaries', () => {
  const r = payEquityAudit(makeCohort());
  const json = JSON.stringify(r);
  // group means OK — but no employee IDs
  assert.equal(json.includes('e-1'), false);
  assert.equal(json.includes('e-10'), false);
});

// ═══════════════════════════════════════════════════════════════
// 18. CONSTANTS SANITY
// ═══════════════════════════════════════════════════════════════

test('PRIVACY.MIN_GROUP_SIZE and MIN_EQUITY_GROUP are set', () => {
  assert.equal(typeof PRIVACY.MIN_GROUP_SIZE, 'number');
  assert.ok(PRIVACY.MIN_GROUP_SIZE >= 3);
  assert.ok(PRIVACY.MIN_EQUITY_GROUP >= 3);
});
