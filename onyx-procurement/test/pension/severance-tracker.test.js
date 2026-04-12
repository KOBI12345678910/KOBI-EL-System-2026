/**
 * Severance Tracker — Unit Tests
 * Israeli 2026 pension / severance engine
 *
 * Run with:    node --test test/pension/severance-tracker.test.js
 *     or:      node test/run.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  SeveranceTracker,
  CONSTANTS_2026,
  _internal,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'pension', 'severance-tracker.js'),
);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function near(a, b, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

function assertNear(actual, expected, eps = 0.5, msg) {
  assert.ok(
    near(actual, expected, eps),
    `${msg || 'value'}: expected ${expected} ± ${eps}, got ${actual}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Balance accumulation
// ─────────────────────────────────────────────────────────────

test('balance: contributions-only (no returns)', () => {
  const t = new SeveranceTracker();
  const emp = 'E001';

  // 12 months at ₪1,000 each
  for (let m = 1; m <= 12; m++) {
    t.recordContribution({
      employeeId: emp,
      period: `2025-${String(m).padStart(2, '0')}`,
      amount: 1000,
      pensionFund: 'migdal_makefet',
    });
  }
  const b = t.getBalance(emp);
  assert.equal(b.contributed, 12000);
  assert.equal(b.balance, 12000);
  assert.equal(b.returnsEarned, 0);
  assert.equal(b.periods.length, 12);
});

test('balance: compounds monthly returns on running balance', () => {
  const t = new SeveranceTracker();
  const emp = 'E002';
  const fund = 'menora_mivtachim';

  // 3 months of 1000/mo contributions, +1% return each month.
  for (let m = 1; m <= 3; m++) {
    const period = `2025-${String(m).padStart(2, '0')}`;
    t.recordContribution({ employeeId: emp, period, amount: 1000, pensionFund: fund });
    t.recordReturn({ pensionFund: fund, period, returnPct: 0.01 });
  }

  const b = t.getBalance(emp);

  // Hand-calculated compound:
  //   M1: (0 + 1000) * 1.01 = 1010
  //   M2: (1010 + 1000) * 1.01 = 2030.10
  //   M3: (2030.10 + 1000) * 1.01 = 3060.401
  assertNear(b.balance, 3060.4, 0.05);
  assert.equal(b.contributed, 3000);
  assertNear(b.returnsEarned, 60.4, 0.05);
});

test('balance: negative returns reduce balance', () => {
  const t = new SeveranceTracker();
  const emp = 'E003';
  const fund = 'clal_pensia';

  for (let m = 1; m <= 2; m++) {
    const period = `2025-${String(m).padStart(2, '0')}`;
    t.recordContribution({ employeeId: emp, period, amount: 1000, pensionFund: fund });
    t.recordReturn({ pensionFund: fund, period, returnPct: -0.02 });
  }
  const b = t.getBalance(emp);
  // M1: (0+1000)*0.98 = 980
  // M2: (980+1000)*0.98 = 1940.4
  assertNear(b.balance, 1940.4, 0.05);
  assert.ok(b.returnsEarned < 0);
});

test('balance: asOf cutoff honoured', () => {
  const t = new SeveranceTracker();
  const emp = 'E004';
  for (let m = 1; m <= 6; m++) {
    t.recordContribution({
      employeeId: emp,
      period: `2025-${String(m).padStart(2, '0')}`,
      amount: 500,
      pensionFund: 'harel_pension',
    });
  }
  const b = t.getBalance(emp, { asOf: '2025-03' });
  assert.equal(b.contributed, 1500);
});

// ─────────────────────────────────────────────────────────────
// 2. Statutory severance & top-up calc
// ─────────────────────────────────────────────────────────────

test('severance: statutory = lastSalary × years, fund exactly covers', () => {
  const t = new SeveranceTracker();
  const emp = {
    id: 'E010',
    lastMonthlySalary: 12000,
  };
  // 5 years × 12000 = 60,000 statutory.
  // Seed fund with 60,000 contributions (no returns).
  for (let yy = 2021; yy <= 2025; yy++) {
    for (let m = 1; m <= 12; m++) {
      t.recordContribution({
        employeeId: emp.id,
        period: `${yy}-${String(m).padStart(2, '0')}`,
        amount: 1000, // 12 × 1000 × 5 = 60,000
        pensionFund: 'migdal_makefet',
      });
    }
  }
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-12',
    yearsEmployed: 5,
    reason: 'dismissal',
  });
  assert.equal(r.statutorySeverance, 60000);
  assert.equal(r.fundBalance, 60000);
  assert.equal(r.employerTopUp, 0);
  assert.equal(r.fundSurplus, 0);
  assert.equal(r.totalPaidToEmployee, 60000);
  assert.equal(r.rightsMultiplier, 1.0);
});

test('severance: employer top-up when fund is short', () => {
  const t = new SeveranceTracker();
  const emp = { id: 'E011', lastMonthlySalary: 15000 };
  // 4 years → statutory 60,000 — but fund only has 40,000.
  for (let i = 0; i < 40; i++) {
    t.recordContribution({
      employeeId: emp.id,
      period: `2024-${String((i % 12) + 1).padStart(2, '0')}`,
      amount: 1000,
      pensionFund: 'menora_mivtachim',
    });
  }
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2024-12',
    yearsEmployed: 4,
    reason: 'economic_layoff',
  });
  assert.equal(r.statutorySeverance, 60000);
  assert.equal(r.fundBalance, 40000);
  assert.equal(r.employerTopUp, 20000);
  assert.equal(r.totalPaidToEmployee, 60000);
});

test('severance: resignation → limited tier, no severance', () => {
  const t = new SeveranceTracker();
  const emp = { id: 'E012', lastMonthlySalary: 10000 };
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-06',
    yearsEmployed: 3,
    reason: 'resignation',
  });
  assert.equal(r.rightsMultiplier, 0);
  assert.equal(r.statutorySeverance, 0);
  assert.equal(r.employerTopUp, 0);
});

test('severance: relocation → partial (50%)', () => {
  const t = new SeveranceTracker();
  const emp = { id: 'E013', lastMonthlySalary: 20000 };
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-06',
    yearsEmployed: 2,
    reason: 'relocation',
  });
  assert.equal(r.rightsMultiplier, 0.5);
  assert.equal(r.statutorySeverance, 20000); // 20000 * 2 * 0.5
});

test('severance: death (estate) → full, paid to beneficiaries', () => {
  const t = new SeveranceTracker();
  const emp = { id: 'E014', lastMonthlySalary: 18000 };
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-06',
    yearsEmployed: 7,
    reason: 'death',
  });
  assert.equal(r.rightsTier, 'estate');
  assert.equal(r.statutorySeverance, 18000 * 7); // 126,000
});

test('severance: contract override upgrades resignation to full', () => {
  const t = new SeveranceTracker();
  const emp = {
    id: 'E015',
    lastMonthlySalary: 12000,
    overrideRightsMultiplier: 1.0, // contract gives 100% even on resignation
  };
  const r = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-06',
    yearsEmployed: 4,
    reason: 'resignation',
  });
  assert.equal(r.rightsMultiplier, 1.0);
  assert.equal(r.statutorySeverance, 48000);
});

// ─────────────────────────────────────────────────────────────
// 3. Tax exemption ceiling
// ─────────────────────────────────────────────────────────────

test('tax: severance fully inside exempt ceiling → zero tax', () => {
  const t = new SeveranceTracker();
  // 13,750 × 5 = 68,750 ceiling; severance = 50,000 < ceiling → 0 tax
  const r = t.computeTaxOnSeverance({
    severance: 50000,
    yearsEmployed: 5,
    employee: { marginalRate: 0.35 },
  });
  assert.equal(r.exemptCeiling, 68750);
  assert.equal(r.exemptAmount, 50000);
  assert.equal(r.taxableAmount, 0);
  assert.equal(r.taxDue, 0);
  assert.equal(r.netToEmployee, 50000);
});

test('tax: severance above ceiling → taxed at marginal rate', () => {
  const t = new SeveranceTracker();
  // 13,750 × 5 = 68,750 ceiling; severance 100,000.
  // taxable = 100,000 − 68,750 = 31,250 ; tax = 31,250 × 0.35 = 10,937.5
  const r = t.computeTaxOnSeverance({
    severance: 100000,
    yearsEmployed: 5,
    employee: { marginalRate: 0.35 },
  });
  assert.equal(r.exemptCeiling, 68750);
  assert.equal(r.exemptAmount, 68750);
  assert.equal(r.taxableAmount, 31250);
  assertNear(r.taxDue, 10937.5, 0.1);
  assertNear(r.netToEmployee, 89062.5, 0.1);
});

test('tax: uses default 35% marginal if no employee override', () => {
  const t = new SeveranceTracker();
  const r = t.computeTaxOnSeverance({
    severance: 200000,
    yearsEmployed: 10,
  });
  assert.equal(r.marginalRate, 0.35);
  // ceiling 13,750 * 10 = 137,500 → taxable = 62,500 → tax = 21,875
  assert.equal(r.exemptCeiling, 137500);
  assert.equal(r.taxableAmount, 62500);
  assertNear(r.taxDue, 21875, 0.1);
});

test('tax: ceiling scales with decimal years', () => {
  const t = new SeveranceTracker();
  const r = t.computeTaxOnSeverance({
    severance: 10000,
    yearsEmployed: 0.5,
  });
  // ceiling = 13,750 × 0.5 = 6,875; severance 10,000 → taxable 3,125
  assert.equal(r.exemptCeiling, 6875);
  assert.equal(r.taxableAmount, 3125);
});

test('tax: rejects out-of-bounds marginal rate', () => {
  const t = new SeveranceTracker();
  assert.throws(() =>
    t.computeTaxOnSeverance({
      severance: 100,
      yearsEmployed: 1,
      employee: { marginalRate: 0.9 },
    }),
  );
});

// ─────────────────────────────────────────────────────────────
// 4. Section 161 election
// ─────────────────────────────────────────────────────────────

test('section 161: offers both cash and pension-continuity options', () => {
  const t = new SeveranceTracker();
  const emp = { id: 'E020', lastMonthlySalary: 25000 };
  const severance = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-12',
    yearsEmployed: 10,
    reason: 'dismissal',
  });
  // statutory = 25,000 × 10 = 250,000. fundBalance 0 → topUp 250,000.
  const election = t.section161Election(severance, { marginalRate: 0.35 });
  // ceiling 13,750 * 10 = 137,500; taxable = 112,500 ; cash tax = 39,375
  assertNear(election.cashNow.taxDue, 39375, 0.1);
  assert.equal(election.pensionCredit.taxDueNow, 0);
  assertNear(election.pensionCredit.deferredTaxEstimate, 39375, 0.1);
  // 250,000 > 137,500 * 1.5 = 206,250 → recommended "pension"
  assert.equal(election.recommended, 'pension');
});

// ─────────────────────────────────────────────────────────────
// 5. Form 161 row
// ─────────────────────────────────────────────────────────────

test('form 161: row contains employer, employee, amounts & schema', () => {
  const t = new SeveranceTracker();
  const emp = {
    id: 'E030',
    lastMonthlySalary: 16000,
    teudatZehut: '000000018',
    nameHebrew: 'יוסי כהן',
    startDate: '2021-01-01',
    endDate: '2025-12-31',
    employerCompanyId: '520000012',
    employerName: 'טכנו-קול עוזי בע״מ',
    employerTaxFile: '9000001',
  };
  const severance = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-12',
    yearsEmployed: 5,
    reason: 'dismissal',
  });
  const row = t.generateForm161(emp, severance);

  assert.equal(row.schema, CONSTANTS_2026.FORM_161_VERSION);
  assert.match(row.formName, /טופס 161/);
  assert.equal(row.employer.companyId, '520000012');
  assert.equal(row.employee.nameHebrew, 'יוסי כהן');
  assert.equal(row.employee.yearsEmployed, 5);
  assert.equal(row.termination.reasonHebrew, 'פיטורים רגילים');
  assert.equal(row.amounts.statutorySeverance, 16000 * 5);
  assert.equal(row.amounts.exemptCeiling, 13750 * 5);
  assert.ok(row.generatedAt);
  // Form 161 row is persisted in the append-only ledger.
  assert.equal(t.form161Rows.length, 1);
});

test('form 161: tax withheld matches computeTaxOnSeverance', () => {
  const t = new SeveranceTracker();
  const emp = {
    id: 'E031',
    lastMonthlySalary: 30000,
    teudatZehut: '000000026',
    marginalRate: 0.35,
  };
  const severance = t.computeSeveranceOwed({
    employee: emp,
    finalMonth: '2025-12',
    yearsEmployed: 10,
    reason: 'dismissal',
  });
  const row = t.generateForm161(emp, severance);

  // statutory = 30,000 × 10 = 300,000 ; ceiling = 137,500 ;
  // taxable = 162,500 ; tax = 162,500 × 0.35 = 56,875
  assert.equal(row.amounts.statutorySeverance, 300000);
  assert.equal(row.amounts.taxableAmount, 162500);
  assertNear(row.amounts.taxWithheld, 56875, 0.1);
  assertNear(row.amounts.netToEmployee, 300000 - 56875, 0.1);
});

// ─────────────────────────────────────────────────────────────
// 6. Append-only guarantee (rule: לא מוחקים)
// ─────────────────────────────────────────────────────────────

test('append-only: contributions ledger never shrinks', () => {
  const t = new SeveranceTracker();
  t.recordContribution({
    employeeId: 'E040', period: '2025-01', amount: 500,
    pensionFund: 'migdal_makefet',
  });
  t.recordContribution({
    employeeId: 'E040', period: '2025-02', amount: 500,
    pensionFund: 'migdal_makefet',
  });
  const len = t.contributions.length;
  // Running getBalance or any other read must never mutate the ledger.
  t.getBalance('E040');
  t.getBalance('E040');
  assert.equal(t.contributions.length, len);
});

// ─────────────────────────────────────────────────────────────
// 7. terminateEmployee orchestration
// ─────────────────────────────────────────────────────────────

test('orchestration: terminateEmployee returns full bundle', () => {
  const t = new SeveranceTracker();
  const emp = {
    id: 'E050',
    lastMonthlySalary: 12000,
    marginalRate: 0.35,
  };
  // 5 years of exact-fit contributions.
  for (let yy = 2021; yy <= 2025; yy++) {
    for (let m = 1; m <= 12; m++) {
      t.recordContribution({
        employeeId: emp.id,
        period: `${yy}-${String(m).padStart(2, '0')}`,
        amount: 1000,
        pensionFund: 'migdal_makefet',
      });
    }
  }
  const bundle = t.terminateEmployee({
    employee: emp,
    finalMonth: '2025-12',
    yearsEmployed: 5,
    reason: 'economic_layoff',
  });
  assert.ok(bundle.severance);
  assert.ok(bundle.tax);
  assert.ok(bundle.election);
  assert.ok(bundle.form161);
  assert.equal(bundle.severance.statutorySeverance, 60000);
  // 60,000 < ceiling 68,750 → 0 tax
  assert.equal(bundle.tax.taxDue, 0);
  assert.equal(bundle.form161.amounts.taxWithheld, 0);
});

// ─────────────────────────────────────────────────────────────
// 8. Input validation
// ─────────────────────────────────────────────────────────────

test('validation: recordContribution rejects bad period format', () => {
  const t = new SeveranceTracker();
  assert.throws(() =>
    t.recordContribution({
      employeeId: 'X', period: '2025/01', amount: 100,
      pensionFund: 'x',
    }),
  );
});

test('validation: recordReturn rejects non-numeric returnPct', () => {
  const t = new SeveranceTracker();
  assert.throws(() =>
    t.recordReturn({ pensionFund: 'x', period: '2025-01', returnPct: 'NaN' }),
  );
});

test('validation: unknown termination reason throws', () => {
  const t = new SeveranceTracker();
  assert.throws(() =>
    t.computeSeveranceOwed({
      employee: { id: 'Z', lastMonthlySalary: 1000 },
      finalMonth: '2025-01',
      yearsEmployed: 1,
      reason: 'fired_by_llm',
    }),
  );
});

// ─────────────────────────────────────────────────────────────
// 9. Internal helper smoke
// ─────────────────────────────────────────────────────────────

test('internal: expandMonthRange crosses year boundary', () => {
  const months = _internal.expandMonthRange('2024-11', '2025-02');
  assert.deepEqual(months, ['2024-11', '2024-12', '2025-01', '2025-02']);
});

test('internal: round2 handles halves correctly', () => {
  assert.equal(_internal.round2(1.005), 1.01);
  assert.equal(_internal.round2(1.004), 1.0);
});
