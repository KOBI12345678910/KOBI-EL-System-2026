/**
 * Budget Planner — Unit Tests
 * Agent X-27 | Swarm 3B | Techno-Kol Uzi mega-ERP
 *
 * Covers the full public surface of src/budget/budget-planner.js:
 *   1.  createBudget (empty / seed array)
 *   2.  setAmount direct month
 *   3.  setAmount annual → phased even
 *   4.  setAmount annual → phased weighted (seasonality)
 *   5.  setAmount custom phasing curve
 *   6.  setAmount quarterly
 *   7.  Top-down allocation (company → cost centers)
 *   8.  Bottom-up rollup by category + cost center
 *   9.  Commitments reduce available budget
 *  10.  Actuals recording + getActuals
 *  11.  Variance favorable / unfavorable / on-target
 *  12.  Variance report at company / costCenter / account level
 *  13.  Forecast rest-of-year (run-rate extrapolation)
 *  14.  Approval workflow draft → pending → approved → locked
 *  15.  Cannot mutate after LOCK (enforced)
 *  16.  cloneBudget with uplift
 *  17.  reforecast of locked budget (archive + new draft)
 *  18.  Category classification against 6111 ranges
 *  19.  Hebrew bilingual labels present
 *  20.  Edge cases (unknown account, bad period, zero-budget variance)
 *
 * Run with:
 *   node --test test/payroll/budget-planner.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const bp = require(path.resolve(__dirname, '..', '..', 'src', 'budget', 'budget-planner.js'));

// ─── helpers ────────────────────────────────────────────────────────
function freshStore() {
  return bp.createStore();
}

function sumPeriods(line) {
  return Object.values(line.periods).reduce((a, b) => a + b, 0);
}

// ────────────────────────────────────────────────────────────────────
test('01 createBudget empty produces a draft budget', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  assert.ok(id.startsWith('BUD_'));
  const b = bp.getBudget(id, { store });
  assert.equal(b.year, 2026);
  assert.equal(b.status, bp.STATUS.DRAFT);
  assert.equal(b.scenario, bp.SCENARIOS.BASE);
  assert.deepEqual(b.lines, {});
});

test('02 createBudget from seed array phases evenly', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026,
    store,
    template: [
      { costCenter: 'CC-SALES', account: '0101', amount: 1200000 },  // revenue
      { costCenter: 'CC-OPS',   account: '0301', amount:  600000 },  // payroll
    ],
  });
  const b = bp.getBudget(id, { store });
  const sales = b.lines['CC-SALES']['0101'];
  assert.equal(sales.category, 'REVENUE');
  // even phasing → 100k / month
  assert.equal(sales.periods['2026-01'], 100000);
  assert.equal(sales.periods['2026-12'], 100000);
  assert.equal(sumPeriods(sales), 1200000);
  const ops = b.lines['CC-OPS']['0301'];
  assert.equal(ops.category, 'PAYROLL');
  assert.equal(ops.total, 600000);
});

test('03 setAmount direct month updates a single period only', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0401', '2026-03', 45000, { costCenter: 'CC-HQ', store });
  const b = bp.getBudget(id, { store });
  const line = b.lines['CC-HQ']['0401'];
  assert.equal(line.periods['2026-03'], 45000);
  assert.equal(line.periods['2026-01'], 0);
  assert.equal(line.total, 45000);
  assert.equal(line.category, 'GA');
});

test('04 setAmount annual with even phasing distributes evenly', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0301', 'annual', 120000, { costCenter: 'CC-DEV', store });
  const b = bp.getBudget(id, { store });
  const line = b.lines['CC-DEV']['0301'];
  assert.equal(line.total, 120000);
  for (let m = 1; m <= 12; m++) {
    const key = `2026-${String(m).padStart(2, '0')}`;
    assert.equal(line.periods[key], 10000, `period ${key} should be 10000`);
  }
});

test('05 setAmount annual with weighted phasing follows curve and sums exactly', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0101', 'annual', 1000000, {
    costCenter: 'CC-RETAIL',
    store,
    phasing: bp.PHASING_METHODS.WEIGHTED,
  });
  const b = bp.getBudget(id, { store });
  const line = b.lines['CC-RETAIL']['0101'];
  // Sum must match annual exactly (drift absorbed by December)
  const total = Object.values(line.periods).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total), 1000000);
  // Q4 months should be larger than Q1 months per the weighted curve
  assert.ok(line.periods['2026-10'] > line.periods['2026-01']);
  assert.ok(line.periods['2026-11'] > line.periods['2026-02']);
});

test('06 setAmount custom phasing curve is honoured and normalised', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  const curve = [2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2]; // front+back heavy
  bp.setAmount(id, '0401', 'annual', 240000, {
    costCenter: 'CC-HQ',
    store,
    phasing: bp.PHASING_METHODS.CUSTOM,
    curve,
  });
  const b = bp.getBudget(id, { store });
  const line = b.lines['CC-HQ']['0401'];
  const total = Object.values(line.periods).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total), 240000);
  // Jan (weight 2) should equal Dec (weight 2) approx
  assert.ok(Math.abs(line.periods['2026-01'] - line.periods['2026-12']) < 1);
  // Jan should be ~2× April
  assert.ok(line.periods['2026-01'] > line.periods['2026-04']);
});

test('07 setAmount quarterly spreads across 3 months of that quarter', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0201', 'Q2', 30000, { costCenter: 'CC-OPS', store });
  const b = bp.getBudget(id, { store });
  const line = b.lines['CC-OPS']['0201'];
  assert.equal(line.periods['2026-04'], 10000);
  assert.equal(line.periods['2026-05'], 10000);
  assert.equal(line.periods['2026-06'], 10000);
  assert.equal(line.periods['2026-01'], 0);
  assert.equal(line.total, 30000);
});

test('08 topDownAllocate splits proportionally across cost centers', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.topDownAllocate(id, {
    store,
    account: '0401',
    annual: 1000000,
    allocation: { 'CC-HQ': 50, 'CC-SALES': 30, 'CC-OPS': 20 },
  });
  const roll = bp.bottomUpRollup(id, { store });
  assert.equal(roll.byCostCenter['CC-HQ'].total, 500000);
  assert.equal(roll.byCostCenter['CC-SALES'].total, 300000);
  assert.equal(roll.byCostCenter['CC-OPS'].total, 200000);
  assert.equal(roll.company, 1000000);
  assert.equal(roll.byCategory.GA, 1000000);
});

test('09 bottomUpRollup groups totals by category and cost center', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026,
    store,
    template: [
      { costCenter: 'CC-SALES', account: '0101', amount: 2000000 }, // revenue
      { costCenter: 'CC-SALES', account: '0301', amount:  800000 }, // payroll
      { costCenter: 'CC-OPS',   account: '0201', amount:  500000 }, // cogs
      { costCenter: 'CC-OPS',   account: '0401', amount:  150000 }, // G&A
    ],
  });
  const roll = bp.bottomUpRollup(id, { store });
  assert.equal(roll.company, 3450000);
  assert.equal(roll.byCategory.REVENUE, 2000000);
  assert.equal(roll.byCategory.PAYROLL, 800000);
  assert.equal(roll.byCategory.COGS, 500000);
  assert.equal(roll.byCategory.GA, 150000);
  assert.equal(roll.byCostCenter['CC-SALES'].byCategory.REVENUE, 2000000);
  assert.equal(roll.byCostCenter['CC-OPS'].byCategory.COGS, 500000);
});

test('10 commit reduces available budget; actuals further reduce it', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-OPS', account: '0401', amount: 120000 }],
  });
  const res1 = bp.commit(id, { store, costCenter: 'CC-OPS', account: '0401', amount: 20000, reference: 'PO-1' });
  assert.equal(res1.available, 100000);
  const res2 = bp.commit(id, { store, costCenter: 'CC-OPS', account: '0401', amount: 15000, reference: 'PO-2' });
  assert.equal(res2.available, 85000);
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-01', amount: 5000, reference: 'INV-1' });
  const avail = bp.getAvailable(id, { store, costCenter: 'CC-OPS', account: '0401' });
  assert.equal(avail, 80000);
});

test('11 variance is FAVORABLE for revenue over budget and expense under budget', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [
      { costCenter: 'CC-SALES', account: '0101', amount: 1200000 }, // rev 100k/mo
      { costCenter: 'CC-OPS',   account: '0401', amount:  240000 }, // exp 20k/mo
    ],
  });
  // January: revenue above budget, expense below budget
  bp.actual(id, { store, costCenter: 'CC-SALES', account: '0101', period: '2026-01', amount: 115000 });
  bp.actual(id, { store, costCenter: 'CC-OPS',   account: '0401', period: '2026-01', amount:  18000 });

  const v = bp.variance(id, '2026-01', { store });
  assert.equal(v.budget, 120000);            // 100k rev + 20k exp
  assert.equal(v.actual, 133000);
  assert.ok(v.byCategory.REVENUE);
  assert.ok(v.byCategory.GA);
  assert.equal(v.byCategory.REVENUE.status, bp.VARIANCE_STATUS.FAVORABLE);
  assert.equal(v.byCategory.GA.status,      bp.VARIANCE_STATUS.FAVORABLE);
  // Hebrew bilingual labels
  assert.ok(v.label_he);
  assert.ok(v.label_en);
});

test('12 variance is UNFAVORABLE when expense exceeds budget', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-HQ', account: '0301', amount: 1200000 }], // 100k/mo
  });
  bp.actual(id, { store, costCenter: 'CC-HQ', account: '0301', period: '2026-02', amount: 125000 });
  const v = bp.variance(id, '2026-02', { store });
  assert.equal(v.budget, 100000);
  assert.equal(v.actual, 125000);
  assert.equal(v.variance, 25000);
  assert.equal(v.byCategory.PAYROLL.status, bp.VARIANCE_STATUS.UNFAVORABLE);
  assert.equal(v.byCategory.PAYROLL.label_he, 'שכר');
  assert.equal(v.byCategory.PAYROLL.label_en, 'Payroll');
});

test('13 variance ON_TARGET when actual ≈ budget within tolerance', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-HQ', account: '0401', amount: 1200000 }],
  });
  // 100000 / mo; post 100200 — within 0.5% tolerance (500)
  bp.actual(id, { store, costCenter: 'CC-HQ', account: '0401', period: '2026-03', amount: 100200 });
  const v = bp.variance(id, '2026-03', { store });
  assert.equal(v.byCategory.GA.status, bp.VARIANCE_STATUS.ON_TARGET);
});

test('14 varianceReport company / costCenter / account levels are consistent', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [
      { costCenter: 'CC-SALES', account: '0101', amount: 1200000 },
      { costCenter: 'CC-OPS',   account: '0401', amount:  240000 },
    ],
  });
  bp.actual(id, { store, costCenter: 'CC-SALES', account: '0101', period: '2026-01', amount: 110000 });
  bp.actual(id, { store, costCenter: 'CC-OPS',   account: '0401', period: '2026-01', amount:  25000 });

  const r1 = bp.varianceReport(id, 'company', { store, period: '2026-01' });
  assert.equal(r1.level, 'company');
  assert.equal(r1.company.budget, 120000);
  assert.equal(r1.company.actual, 135000);

  const r2 = bp.varianceReport(id, 'costCenter', { store, period: '2026-01' });
  assert.equal(r2.rows.length, 2);
  const sales = r2.rows.find(r => r.costCenter === 'CC-SALES');
  assert.equal(sales.budget, 100000);
  assert.equal(sales.actual, 110000);

  const r3 = bp.varianceReport(id, 'account', { store, period: '2026-01' });
  assert.equal(r3.rows.length, 2);
  const opsLine = r3.rows.find(r => r.account === '0401');
  assert.equal(opsLine.budget, 20000);
  assert.equal(opsLine.actual, 25000);
});

test('15 forecast extrapolates YTD run-rate to full year', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-OPS', account: '0401', amount: 1200000 }], // 100k/mo
  });
  // 3 months of actuals at 90k/month → run rate 90k × 12 = 1.08M projection
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-01', amount: 90000 });
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-02', amount: 90000 });
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-03', amount: 90000 });

  const f = bp.forecast(id, '2026-03', { store });
  assert.equal(f.monthsElapsed, 3);
  assert.equal(f.monthsRemaining, 9);
  assert.equal(f.ytdActual, 270000);
  assert.equal(f.annualBudget, 1200000);
  assert.equal(f.projectedAnnual, 1080000);
  assert.equal(f.projectedGap, -120000);  // under budget
  assert.equal(f.byCategory.GA.label_he, 'הוצאות הנהלה');
});

test('16 approval workflow: draft → pending → approved → locked', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0101', 'annual', 500000, { costCenter: 'CC-SALES', store });

  assert.equal(bp.getBudget(id, { store }).status, bp.STATUS.DRAFT);
  bp.submitForApproval(id, 'uzi@example.com', { store });
  assert.equal(bp.getBudget(id, { store }).status, bp.STATUS.PENDING);
  bp.approve(id, 'cfo@example.com', { store });
  assert.equal(bp.getBudget(id, { store }).status, bp.STATUS.APPROVED);
  bp.lock(id, 'cfo@example.com', { store });
  const locked = bp.getBudget(id, { store });
  assert.equal(locked.status, bp.STATUS.LOCKED);
  assert.ok(locked.lockedAt);
  assert.ok(locked.approvals.length >= 3);
});

test('17 cannot setAmount on a LOCKED budget', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.setAmount(id, '0101', 'annual', 500000, { costCenter: 'CC-SALES', store });
  bp.submitForApproval(id, 'u1', { store });
  bp.approve(id, 'cfo', { store });
  bp.lock(id, 'cfo', { store });

  assert.throws(
    () => bp.setAmount(id, '0101', 'annual', 600000, { costCenter: 'CC-SALES', store }),
    /LOCKED/,
  );
});

test('18 reject from PENDING returns budget to DRAFT with audit trail', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.submitForApproval(id, 'u1', { store });
  bp.reject(id, 'cfo', 'Revenue target too aggressive', { store });
  const b = bp.getBudget(id, { store });
  assert.equal(b.status, bp.STATUS.DRAFT);
  const rejectEntry = b.approvals.find(a => a.action === 'reject');
  assert.ok(rejectEntry);
  assert.equal(rejectEntry.reason, 'Revenue target too aggressive');
});

test('19 cloneBudget copies structure and applies uplift', () => {
  const store = freshStore();
  const srcId = bp.createBudget({
    year: 2026, store,
    template: [
      { costCenter: 'CC-SALES', account: '0101', amount: 1000000 },
      { costCenter: 'CC-OPS',   account: '0401', amount:  240000 },
    ],
  });
  const dstId = bp.cloneBudget(srcId, 2027, 5, { store }); // +5%
  const dst = bp.getBudget(dstId, { store });
  assert.equal(dst.year, 2027);
  assert.equal(dst.lines['CC-SALES']['0101'].total, 1050000);
  assert.equal(dst.lines['CC-OPS']['0401'].total,    252000);
  // Periods keyed by the new year
  assert.ok(dst.lines['CC-SALES']['0101'].periods['2027-01']);
  assert.equal(dst.lines['CC-SALES']['0101'].periods['2026-01'], undefined);
});

test('20 reforecast archives locked original and creates a new DRAFT clone', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-OPS', account: '0401', amount: 100000 }],
  });
  bp.submitForApproval(id, 'u1', { store });
  bp.approve(id, 'cfo', { store });
  bp.lock(id, 'cfo', { store });

  const newId = bp.reforecast(id, 'cfo', { store, reason: 'Q1 under plan, need to replan' });
  assert.notEqual(newId, id);
  const original = bp.getBudget(id, { store });
  const clone    = bp.getBudget(newId, { store });
  assert.equal(original.status, bp.STATUS.ARCHIVED);
  assert.ok(original.archivedAt);
  assert.equal(clone.status, bp.STATUS.DRAFT);
  // Archived original is NEVER deleted (rule)
  assert.ok(store.budgets.has(id));
  // The clone can now be edited
  bp.setAmount(newId, '0401', 'annual', 80000, { costCenter: 'CC-OPS', store });
  assert.equal(bp.getBudget(newId, { store }).lines['CC-OPS']['0401'].total, 80000);
});

test('21 category classifier maps all 6111 ranges correctly', () => {
  assert.equal(bp._categorize('0101').key, 'REVENUE');
  assert.equal(bp._categorize('0150').key, 'REVENUE');
  assert.equal(bp._categorize('0201').key, 'COGS');
  assert.equal(bp._categorize('0301').key, 'PAYROLL');
  assert.equal(bp._categorize('0450').key, 'GA');
  assert.equal(bp._categorize('0510').key, 'FINANCE');
  assert.equal(bp._categorize('0650').key, 'OTHER');
  assert.throws(() => bp._categorize('0999'), /does not map/);
});

test('22 Hebrew bilingual labels exist on all categories and statuses', () => {
  for (const key of Object.keys(bp.ACCOUNT_CATEGORIES)) {
    const c = bp.ACCOUNT_CATEGORIES[key];
    assert.ok(c.label_he, `${key} missing label_he`);
    assert.ok(c.label_en, `${key} missing label_en`);
  }
  for (const key of Object.keys(bp.STATUS_LABELS)) {
    assert.ok(bp.STATUS_LABELS[key].he);
    assert.ok(bp.STATUS_LABELS[key].en);
  }
  for (const key of Object.keys(bp.VARIANCE_LABELS)) {
    assert.ok(bp.VARIANCE_LABELS[key].he);
    assert.ok(bp.VARIANCE_LABELS[key].en);
  }
  // Specific expected Hebrew strings
  assert.equal(bp.ACCOUNT_CATEGORIES.REVENUE.label_he, 'הכנסות');
  assert.equal(bp.ACCOUNT_CATEGORIES.COGS.label_he,    'עלות מכר');
  assert.equal(bp.ACCOUNT_CATEGORIES.PAYROLL.label_he, 'שכר');
});

test('23 variance on a zero-budget line with actuals reports UNFAVORABLE', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  // No budget set for 0401 at all, but we post an actual.
  bp.actual(id, { store, costCenter: 'CC-HQ', account: '0401', period: '2026-01', amount: 500 });
  const v = bp.variance(id, '2026-01', { store });
  assert.equal(v.budget, 0);
  assert.equal(v.actual, 500);
  // budget 0, actual > 0 → unfavorable for expense
  assert.equal(v.byCategory.GA.status, bp.VARIANCE_STATUS.UNFAVORABLE);
});

test('24 scenarios: base / optimistic / pessimistic budgets coexist', () => {
  const store = freshStore();
  const base = bp.createBudget({ year: 2026, store, scenario: bp.SCENARIOS.BASE });
  const opt  = bp.createBudget({ year: 2026, store, scenario: bp.SCENARIOS.OPTIMISTIC });
  const pes  = bp.createBudget({ year: 2026, store, scenario: bp.SCENARIOS.PESSIMISTIC });
  bp.setAmount(base, '0101', 'annual', 1000000, { costCenter: 'CC', store });
  bp.setAmount(opt,  '0101', 'annual', 1300000, { costCenter: 'CC', store });
  bp.setAmount(pes,  '0101', 'annual',  800000, { costCenter: 'CC', store });
  const list = bp.listBudgets({ store, year: 2026 });
  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map(b => b.scenario).sort(),
    ['base', 'optimistic', 'pessimistic'].sort(),
  );
});

test('25 edge cases: bad year, bad period, bad account all throw', () => {
  const store = freshStore();
  assert.throws(() => bp.createBudget({ year: 1800, store }), /year/);
  const id = bp.createBudget({ year: 2026, store });
  assert.throws(() => bp.setAmount(id, '0101', '2026-13', 1000, { store }), /invalid/);
  assert.throws(() => bp.setAmount(id, 'ABCD', '2026-01', 1000, { store }), /numeric/);
  assert.throws(() => bp.setAmount(id, '0101', '2026-01', 'not-a-number', { store }), /numeric/);
});

test('26 getActuals aggregates by account for a period', () => {
  const store = freshStore();
  const id = bp.createBudget({ year: 2026, store });
  bp.actual(id, { store, costCenter: 'CC1', account: '0101', period: '2026-01', amount: 10000 });
  bp.actual(id, { store, costCenter: 'CC1', account: '0101', period: '2026-01', amount:  5000 });
  bp.actual(id, { store, costCenter: 'CC2', account: '0301', period: '2026-01', amount: 20000 });
  const a = bp.getActuals(id, '2026-01', { store });
  assert.equal(a.total, 35000);
  assert.equal(a.byAccount['0101'], 15000);
  assert.equal(a.byAccount['0301'], 20000);
});

test('27 listBudgets filters by status', () => {
  const store = freshStore();
  const a = bp.createBudget({ year: 2026, store });
  const b = bp.createBudget({ year: 2026, store });
  bp.submitForApproval(b, 'u', { store });
  const drafts = bp.listBudgets({ store, status: bp.STATUS.DRAFT });
  const pending = bp.listBudgets({ store, status: bp.STATUS.PENDING });
  assert.equal(drafts.length, 1);
  assert.equal(pending.length, 1);
  assert.equal(drafts[0].budgetId, a);
  assert.equal(pending[0].budgetId, b);
});

test('28 quarterly variance aggregates three months', () => {
  const store = freshStore();
  const id = bp.createBudget({
    year: 2026, store,
    template: [{ costCenter: 'CC-OPS', account: '0401', amount: 120000 }], // 10k/mo
  });
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-01', amount:  9000 });
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-02', amount: 11000 });
  bp.actual(id, { store, costCenter: 'CC-OPS', account: '0401', period: '2026-03', amount: 10500 });
  const v = bp.variance(id, 'Q1', { store });
  assert.equal(v.budget, 30000);
  assert.equal(v.actual, 30500);
});
