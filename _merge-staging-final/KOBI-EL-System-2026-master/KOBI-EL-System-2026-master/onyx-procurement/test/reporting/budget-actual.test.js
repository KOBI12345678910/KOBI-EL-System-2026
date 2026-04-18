/**
 * Budget vs Actual Engine — Unit Tests
 * Agent Y-189 | Reporting Swarm | Techno-Kol Uzi mega-ERP
 *
 * Covers the full public surface of src/reporting/budget-actual.js:
 *   1.  Constructor defaults + Israeli fiscal-year alignment
 *   2.  Period normalization (ISO / named / numeric / object)
 *   3.  loadBudget — single period + bilingual labels
 *   4.  loadBudget — cross-period, total sums correctly
 *   5.  loadActual — additive + history preserved
 *   6.  computeVariance — favorable expense line
 *   7.  computeVariance — unfavorable expense line (over 10%)
 *   8.  computeVariance — revenue direction flipped
 *   9.  computeVariance — on-target (zero variance)
 *  10.  computeVariance — zero-budget line (infinite percent)
 *  11.  ytd — aggregates through month correctly
 *  12.  fullYearOutlook — rolling forecast uses recent actuals
 *  13.  fullYearOutlook — annualization sanity check
 *  14.  ownerAssignment — bilingual owner metadata preserved
 *  15.  ownerAssignment — previous owner preserved (never deletes)
 *  16.  alerts — >10% unfavorable triggers warning
 *  17.  alerts — custom threshold
 *  18.  alerts — favorable variance never triggers
 *  19.  report — bilingual headline + totals
 *  20.  report — alerts embedded
 *  21.  history — audit trail is append-only
 *  22.  fiscalYear helpers (static + instance)
 *  23.  Edge: cross-year loadBudget is rejected
 *  24.  Edge: bad period / bad amount throws
 *
 * Run with:
 *   node --test test/reporting/budget-actual.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'reporting', 'budget-actual.js',
));
const { BudgetActual, DIRECTION, SEVERITY, _normalizePeriod } = mod;

// ─── helpers ─────────────────────────────────────────────────────────

function seedExpenses(ba, year = 2026) {
  // Six months of budget/actual for two expense lines + one revenue line.
  const lines = [
    { id: 'RENT',      label_en: 'Office Rent',    label_he: 'שכר דירה',       direction: DIRECTION.EXPENSE },
    { id: 'PAYROLL',   label_en: 'Payroll',        label_he: 'שכר עובדים',     direction: DIRECTION.EXPENSE },
    { id: 'REVENUE_A', label_en: 'Product Sales',  label_he: 'מכירות מוצר',     direction: DIRECTION.REVENUE },
  ];
  for (let m = 1; m <= 6; m++) {
    ba.loadBudget({ year, month: m }, [
      { id: 'RENT',      amount: 10_000, ...lines[0] },
      { id: 'PAYROLL',   amount: 50_000, ...lines[1] },
      { id: 'REVENUE_A', amount: 80_000, ...lines[2] },
    ]);
  }
}

// ═════════════════════════════════════════════════════════════════════
test('01 constructor defaults to current calendar year and honors Israeli fiscal rule', () => {
  const ba = new BudgetActual();
  assert.equal(typeof ba.fiscalYear(), 'number');
  assert.equal(BudgetActual.isCalendarFiscalYear(), true);

  const fixed = new BudgetActual({ fiscalYear: 2026 });
  assert.equal(fixed.fiscalYear(), 2026);
  assert.equal(
    BudgetActual.fiscalYearFromDate(new Date(Date.UTC(2026, 3, 11))),
    2026,
  );
  assert.throws(() => new BudgetActual({ fiscalYear: 1800 }), RangeError);
});

// ═════════════════════════════════════════════════════════════════════
test('02 period normalization accepts ISO / named / numeric / object', () => {
  assert.equal(_normalizePeriod('2026-04').key, '2026-04');
  assert.equal(_normalizePeriod('2026/4').key, '2026-04');
  assert.equal(_normalizePeriod('APR-2026').key, '2026-04');
  assert.equal(_normalizePeriod(202604).key, '2026-04');
  assert.equal(_normalizePeriod({ year: 2026, month: 4 }).key, '2026-04');
  assert.throws(() => _normalizePeriod('garbage'), RangeError);
  assert.throws(() => _normalizePeriod({ year: 2026, month: 13 }), RangeError);
});

// ═════════════════════════════════════════════════════════════════════
test('03 loadBudget registers bilingual line and stores amount', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  const res = ba.loadBudget('2026-01', [
    { id: 'RENT', amount: 12_500, label_en: 'Office Rent', label_he: 'שכר דירה', direction: DIRECTION.EXPENSE },
  ]);
  assert.equal(res.length, 1);
  assert.equal(res[0].amount, 12_500);

  const line = ba.getLine('RENT');
  assert.ok(line);
  assert.equal(line.label_en, 'Office Rent');
  assert.equal(line.label_he, 'שכר דירה');
  assert.equal(line.direction, DIRECTION.EXPENSE);
  assert.equal(ba.getBudget('RENT', '2026-01'), 12_500);
});

// ═════════════════════════════════════════════════════════════════════
test('04 loadBudget summed across periods returns full-year total', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  for (let m = 1; m <= 12; m++) {
    ba.loadBudget({ year: 2026, month: m }, [
      { id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' },
    ]);
  }
  assert.equal(ba.getBudget('RENT'), 120_000);
});

// ═════════════════════════════════════════════════════════════════════
test('05 loadActual is additive and leaves full history for audit', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-01', [{ id: 'RENT', amount:  9_500, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-01', [{ id: 'RENT', amount: 10_200, label_en: 'Office Rent', label_he: 'שכר דירה' }]);

  // Latest actual wins for reporting but every load is in the history.
  assert.equal(ba.getActual('RENT', '2026-01'), 10_200);
  const hist = ba.history('RENT');
  const actualHistory = hist.filter((h) => h.kind === 'ACTUAL');
  assert.equal(actualHistory.length, 2);
  assert.equal(actualHistory[0].amount, 9_500);
  assert.equal(actualHistory[1].amount, 10_200);
});

// ═════════════════════════════════════════════════════════════════════
test('06 computeVariance — favorable expense (actual below budget)', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-02', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-02', [{ id: 'RENT', amount:  9_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  const v = ba.computeVariance('2026-02', 'RENT');
  assert.equal(v.absolute, -1_000);
  assert.equal(v.percent, -10);
  assert.equal(v.unfavorable, false);
  assert.equal(v.status_en, 'Favorable');
  assert.equal(v.status_he, 'חיסכון חיובי');
});

// ═════════════════════════════════════════════════════════════════════
test('07 computeVariance — unfavorable expense over 10% threshold', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-03', [{ id: 'PAYROLL', amount: 50_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-03', [{ id: 'PAYROLL', amount: 58_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  const v = ba.computeVariance('2026-03', 'PAYROLL');
  assert.equal(v.absolute, 8_000);
  assert.equal(v.percent, 16);
  assert.equal(v.unfavorable, true);
  assert.equal(v.status_en, 'Unfavorable');
  assert.equal(v.severity_en, 'Warning');
  assert.equal(v.severity_he, 'אזהרה');
});

// ═════════════════════════════════════════════════════════════════════
test('08 computeVariance — revenue direction flipped (shortfall is unfavorable)', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-04', [{ id: 'REV', amount: 80_000, label_en: 'Product Sales', label_he: 'מכירות', direction: DIRECTION.REVENUE }]);
  ba.loadActual('2026-04', [{ id: 'REV', amount: 65_000, label_en: 'Product Sales', label_he: 'מכירות', direction: DIRECTION.REVENUE }]);
  const v = ba.computeVariance('2026-04', 'REV');
  assert.equal(v.absolute, -15_000);
  assert.equal(v.percent, -18.75);
  assert.equal(v.unfavorable, true, 'revenue shortfall must be unfavorable');
  assert.equal(v.status_en, 'Unfavorable');
  assert.equal(v.severity_en, 'Warning');
});

// ═════════════════════════════════════════════════════════════════════
test('09 computeVariance — on target returns zero', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-05', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-05', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  const v = ba.computeVariance('2026-05', 'RENT');
  assert.equal(v.absolute, 0);
  assert.equal(v.percent, 0);
  assert.equal(v.unfavorable, false);
  assert.equal(v.status_en, 'On target');
  assert.equal(v.status_he, 'עמידה ביעד');
});

// ═════════════════════════════════════════════════════════════════════
test('10 computeVariance — zero-budget line with actual spend yields infinite percent', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-06', [{ id: 'NEW_TOOL', amount: 0, label_en: 'New Tool', label_he: 'כלי חדש' }]);
  ba.loadActual('2026-06', [{ id: 'NEW_TOOL', amount: 4_500, label_en: 'New Tool', label_he: 'כלי חדש' }]);
  const v = ba.computeVariance('2026-06', 'NEW_TOOL');
  assert.equal(v.absolute, 4_500);
  assert.equal(v.percent, Infinity);
  assert.equal(v.unfavorable, true);
});

// ═════════════════════════════════════════════════════════════════════
test('11 ytd aggregates budget + actual through given month', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  seedExpenses(ba);
  // Load three months of actuals for RENT below budget
  for (let m = 1; m <= 3; m++) {
    ba.loadActual({ year: 2026, month: m }, [
      { id: 'RENT', amount: 9_500, label_en: 'Office Rent', label_he: 'שכר דירה' },
    ]);
  }
  const rows = ba.ytd(3);
  const rent = rows.find((r) => r.lineId === 'RENT');
  assert.equal(rent.budget, 30_000);
  assert.equal(rent.actual, 28_500);
  assert.equal(rent.absolute, -1_500);
  assert.equal(rent.percent, -5);
  assert.equal(rent.unfavorable, false);
});

// ═════════════════════════════════════════════════════════════════════
test('12 fullYearOutlook uses rolling average of recent actuals to forecast rest of year', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  seedExpenses(ba); // 6 months of budget
  // March..April actuals spike above budget.
  ba.loadActual('2026-01', [{ id: 'PAYROLL', amount: 51_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-02', [{ id: 'PAYROLL', amount: 52_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-03', [{ id: 'PAYROLL', amount: 60_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-04', [{ id: 'PAYROLL', amount: 62_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);

  const outlook = ba.fullYearOutlook(4, { rollingWindow: 3 });
  const pay = outlook.find((r) => r.lineId === 'PAYROLL');

  // Rolling window = last 3 actual months (Feb, Mar, Apr) = (52+60+62)/3
  assert.equal(pay.rollingAverage, 58_000);
  assert.equal(pay.ytdActual, 225_000);
  // Forecast rest = 8 remaining months * rollingAverage
  assert.equal(pay.forecastRest, 8 * 58_000);
  assert.equal(pay.projectedFullYear, 225_000 + 8 * 58_000);
  // Full year budget only covers the first 6 months (= 300_000 from seed)
  assert.equal(pay.fullYearBudget, 300_000);
  assert.equal(pay.unfavorable, true);
});

// ═════════════════════════════════════════════════════════════════════
test('13 fullYearOutlook annualized figure matches YTD run-rate', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'OPS', amount: 100_000, label_en: 'Ops', label_he: 'תפעול' }]);
  ba.loadBudget('2026-02', [{ id: 'OPS', amount: 100_000, label_en: 'Ops', label_he: 'תפעול' }]);
  ba.loadBudget('2026-03', [{ id: 'OPS', amount: 100_000, label_en: 'Ops', label_he: 'תפעול' }]);
  ba.loadActual('2026-01', [{ id: 'OPS', amount: 90_000,  label_en: 'Ops', label_he: 'תפעול' }]);
  ba.loadActual('2026-02', [{ id: 'OPS', amount: 95_000,  label_en: 'Ops', label_he: 'תפעול' }]);
  ba.loadActual('2026-03', [{ id: 'OPS', amount: 100_000, label_en: 'Ops', label_he: 'תפעול' }]);
  const out = ba.fullYearOutlook(3);
  const ops = out.find((r) => r.lineId === 'OPS');
  assert.equal(ops.ytdActual, 285_000);
  // YTD 285 * (12/3) = 1,140,000
  assert.equal(ops.annualized, 1_140_000);
});

// ═════════════════════════════════════════════════════════════════════
test('14 ownerAssignment stores bilingual department + name', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  const rec = ba.ownerAssignment('RENT', {
    name: 'עוזי כהן',
    email: 'uzi@technokoluzi.co.il',
    department: 'Facilities',
    department_he: 'אחזקה',
  });
  assert.equal(rec.name, 'עוזי כהן');
  assert.equal(rec.department, 'Facilities');
  assert.equal(rec.department_he, 'אחזקה');
  assert.equal(ba.getOwner('RENT').email, 'uzi@technokoluzi.co.il');
});

// ═════════════════════════════════════════════════════════════════════
test('15 reassigning an owner preserves the previous assignment (never delete)', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.ownerAssignment('RENT', { name: 'Alice', email: 'a@x.co' });
  const second = ba.ownerAssignment('RENT', { name: 'Bob', email: 'b@x.co' });
  assert.equal(second.name, 'Bob');
  assert.ok(second.previous, 'previous owner must be preserved');
  assert.equal(second.previous.name, 'Alice');

  // History should hold at least two OWNER events.
  const owners = ba.history('RENT').filter((h) => h.kind === 'OWNER');
  assert.equal(owners.length, 2);
});

// ═════════════════════════════════════════════════════════════════════
test('16 alerts >10% unfavorable fires with bilingual message', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'PAYROLL', amount: 50_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-01', [{ id: 'PAYROLL', amount: 58_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  const alerts = ba.alerts({ throughMonth: 1 });
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].message_en.includes('Payroll'));
  assert.ok(alerts[0].message_he.includes('שכר עובדים'));
  assert.ok(alerts[0].percent > 10);
});

// ═════════════════════════════════════════════════════════════════════
test('17 alerts custom threshold changes what fires', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'TOOLS', amount: 10_000, label_en: 'Tools', label_he: 'כלים' }]);
  ba.loadActual('2026-01', [{ id: 'TOOLS', amount: 10_700, label_en: 'Tools', label_he: 'כלים' }]);

  // 7% unfavorable — does not fire at 10%
  assert.equal(ba.alerts({ throughMonth: 1, thresholdPct: 10 }).length, 0);
  // But fires at 5%
  const strict = ba.alerts({ throughMonth: 1, thresholdPct: 5 });
  assert.equal(strict.length, 1);
  assert.ok(strict[0].message_en.includes('5%'));
});

// ═════════════════════════════════════════════════════════════════════
test('18 alerts — favorable variance never triggers', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-01', [{ id: 'RENT', amount:  7_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  const alerts = ba.alerts({ throughMonth: 1, thresholdPct: 1 });
  assert.equal(alerts.length, 0);
});

// ═════════════════════════════════════════════════════════════════════
test('19 report emits bilingual title + totals', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  seedExpenses(ba);
  for (let m = 1; m <= 3; m++) {
    ba.loadActual({ year: 2026, month: m }, [
      { id: 'RENT', amount: 10_500, label_en: 'Office Rent', label_he: 'שכר דירה' },
      { id: 'PAYROLL', amount: 55_000, label_en: 'Payroll', label_he: 'שכר עובדים' },
      { id: 'REVENUE_A', amount: 70_000, label_en: 'Product Sales', label_he: 'מכירות מוצר', direction: DIRECTION.REVENUE },
    ]);
  }
  const rpt = ba.report(3);
  assert.ok(rpt.title_en.includes('FY 2026'));
  assert.ok(rpt.title_he.includes('2026'));
  assert.ok(rpt.title_he.includes('מרץ'));
  assert.equal(rpt.fiscalYear, 2026);
  assert.equal(rpt.throughMonth, 3);

  // Every line must carry both language labels + an owner field (nullable)
  for (const line of rpt.lines) {
    assert.ok(line.label_en);
    assert.ok(line.label_he);
    assert.ok('owner' in line);
    assert.ok(line.ytdStatus_en);
    assert.ok(line.ytdStatus_he);
  }
  // Totals are finite numbers
  assert.equal(typeof rpt.totals.ytdBudget, 'number');
  assert.equal(typeof rpt.totals.ytdVariance, 'number');
});

// ═════════════════════════════════════════════════════════════════════
test('20 report embeds alerts for unfavorable lines', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'PAYROLL', amount: 50_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.loadActual('2026-01', [{ id: 'PAYROLL', amount: 65_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
  ba.ownerAssignment('PAYROLL', { name: 'CFO', email: 'cfo@tku.co.il' });

  const rpt = ba.report(1);
  assert.ok(rpt.alerts.length >= 1);
  const a = rpt.alerts[0];
  assert.equal(a.lineId, 'PAYROLL');
  assert.equal(a.owner.name, 'CFO');
  assert.ok(a.message_he.length > 0);
});

// ═════════════════════════════════════════════════════════════════════
test('21 history is append-only and fully queryable', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  ba.loadBudget('2026-01', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.loadActual('2026-01', [{ id: 'RENT', amount:  9_800, label_en: 'Office Rent', label_he: 'שכר דירה' }]);
  ba.ownerAssignment('RENT', { name: 'CFO' });
  const hist = ba.history();
  assert.ok(hist.length >= 3);
  const kinds = hist.map((h) => h.kind);
  assert.ok(kinds.includes('BUDGET'));
  assert.ok(kinds.includes('ACTUAL'));
  assert.ok(kinds.includes('OWNER'));

  // History entries are frozen so callers cannot mutate the audit trail.
  assert.throws(() => { hist[0].amount = 0; }, TypeError);
});

// ═════════════════════════════════════════════════════════════════════
test('22 fiscal year helpers confirm calendar-year alignment', () => {
  assert.equal(BudgetActual.isCalendarFiscalYear(), true);
  const ba = new BudgetActual({ fiscalYear: 2026 });
  assert.equal(ba.fiscalYear(), 2026);
  // Jan 1 and Dec 31 both map to the same fiscal year.
  assert.equal(BudgetActual.fiscalYearFromDate(new Date(Date.UTC(2026, 0, 1))), 2026);
  assert.equal(BudgetActual.fiscalYearFromDate(new Date(Date.UTC(2026, 11, 31))), 2026);
});

// ═════════════════════════════════════════════════════════════════════
test('23 cross-year loadBudget is rejected (never silently relabels data)', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  assert.throws(
    () => ba.loadBudget('2025-12', [{ id: 'RENT', amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' }]),
    /outside fiscal year/,
  );
});

// ═════════════════════════════════════════════════════════════════════
test('24 bad amount / missing id throw with clear messages', () => {
  const ba = new BudgetActual({ fiscalYear: 2026 });
  assert.throws(
    () => ba.loadBudget('2026-01', [{ id: 'RENT', amount: NaN, label_en: 'x', label_he: 'x' }]),
    TypeError,
  );
  assert.throws(
    () => ba.loadBudget('2026-01', [{ amount: 100 }]),
    TypeError,
  );
  assert.throws(() => ba.ytd(0), RangeError);
  assert.throws(() => ba.fullYearOutlook(13), RangeError);
  assert.throws(() => ba.ownerAssignment('UNKNOWN', { name: 'x' }), RangeError);
});
