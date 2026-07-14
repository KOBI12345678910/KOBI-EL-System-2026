'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/data/store');
const { seed } = require('../src/data/seed');
const { computeBudgetLine, computeBudget } = require('../src/engines/budget-engine');
const { computeLinkage, computeSales } = require('../src/engines/sales-engine');
const { computeCashflow } = require('../src/engines/cashflow-engine');
const { irr, npv, computeZeroReport } = require('../src/engines/zero-report-engine');
const { runMonteCarlo } = require('../src/engines/montecarlo-engine');
const { evaluateAlerts } = require('../src/engines/alert-engine');
const { computeHealth } = require('../src/engines/health-engine');

function freshStore() {
  const store = createStore();
  store.reset(seed);
  return store;
}

test('budget formulas per blueprint §3.3', () => {
  const line = computeBudgetLine({
    approved_budget: 1000000, transferred_in: 100000, transferred_out: 50000,
    approved_change_orders: 25000, contingency_used: 0,
    committed_amount: 900000, invoiced_amount: 600000, paid_amount: 500000,
    estimated_remaining_cost: 550000, price_change_impact: 30000,
  });
  assert.equal(line.revised_budget, 1075000);
  assert.equal(line.open_commitment_amount, 300000);
  assert.equal(line.open_invoice_amount, 100000);
  assert.equal(line.available_budget, 1075000 - 900000 - 100000);
  assert.equal(line.forecast_at_completion, 500000 + 100000 + 550000 + 30000);
  assert.equal(line.budget_variance, line.forecast_at_completion - line.revised_budget);
  // variance = 105,000 / 1,075,000 ≈ 9.77% → risk 'medium'? no: >5 → medium, <=10
  assert.equal(line.risk_level, 'medium');
});

test('budget risk thresholds', () => {
  const mk = (fac, revised) => computeBudgetLine({
    approved_budget: revised, transferred_in: 0, transferred_out: 0,
    approved_change_orders: 0, contingency_used: 0, committed_amount: 0,
    invoiced_amount: 0, paid_amount: 0, estimated_remaining_cost: fac, price_change_impact: 0,
  });
  assert.equal(mk(1160, 1000).risk_level, 'critical'); // 16%
  assert.equal(mk(1120, 1000).risk_level, 'high');     // 12%
  assert.equal(mk(1080, 1000).risk_level, 'medium');   // 8%
  assert.equal(mk(1020, 1000).risk_level, 'low');      // 2%
  assert.equal(mk(1120, 1000).status, 'over_budget');
});

test('חוק המכר: 20% ראשונים ללא הצמדה, יתרה צמודה 50%', () => {
  // מחיר 1,000,000, מדד 100→110
  const first = computeLinkage({
    contractPrice: 1000000, baseIndex: 100, currentIndex: 110,
    cumulativePaidBase: 0, paymentBase: 200000,
  });
  assert.equal(first.linkage, 0, 'first 200k fully inside the 20% threshold');

  const second = computeLinkage({
    contractPrice: 1000000, baseIndex: 100, currentIndex: 110,
    cumulativePaidBase: 200000, paymentBase: 300000,
  });
  // 300k מעבר לסף: 300,000 * 10% * 50% = 15,000
  assert.equal(second.linkage, 15000);

  // תשלום שחוצה את הסף: 100k לפני הסף + 100k אחריו
  const straddle = computeLinkage({
    contractPrice: 1000000, baseIndex: 100, currentIndex: 110,
    cumulativePaidBase: 100000, paymentBase: 200000,
  });
  assert.equal(straddle.linkage, 5000); // רק 100k צמודים

  // מדד ירד — אין הצמדה שלילית
  const down = computeLinkage({
    contractPrice: 1000000, baseIndex: 110, currentIndex: 100,
    cumulativePaidBase: 500000, paymentBase: 100000,
  });
  assert.equal(down.linkage, 0);
});

test('irr/npv known values', () => {
  // השקעה 1000, החזר 100 × 12 חודשים
  const flows = [-1000, ...Array(12).fill(100)];
  const annual = irr(flows);
  assert.ok(annual > 0.2 && annual < 0.6, `irr annual out of range: ${annual}`);
  // NPV בהיוון 0: פשוט הסכום
  assert.equal(npv(flows, 0), 200);
  // אין שינוי סימן → null
  assert.equal(irr([100, 100]), null);
});

test('monte carlo deterministic and bounded', () => {
  const store = freshStore();
  const a = runMonteCarlo(store, 'proj-1', { runs: 800, seed: 7 });
  const b = runMonteCarlo(store, 'proj-1', { runs: 800, seed: 7 });
  assert.deepEqual(a.profit, b.profit, 'same seed → same distribution');
  assert.deepEqual(a.histogram, b.histogram);
  assert.ok(a.probLoss >= 0 && a.probLoss <= 100);
  assert.ok(a.profit.p5 <= a.profit.p50 && a.profit.p50 <= a.profit.p95);
  const c = runMonteCarlo(store, 'proj-1', { runs: 800, seed: 8 });
  assert.notDeepEqual(a.profit, c.profit, 'different seed → different draws');
});

test('cashflow invariant: sum(net) === endBalance', () => {
  const store = freshStore();
  const cf = computeCashflow(store, 'proj-1');
  const sum = cf.months.reduce((acc, m) => acc + m.net, 0);
  assert.ok(Math.abs(sum - cf.endBalance) <= 1, `sum ${sum} vs end ${cf.endBalance}`);
  assert.ok(cf.months.length >= 36);
  assert.equal(cf.startMonth, '2024-06');
});

test('zero report consistency', () => {
  const store = freshStore();
  const z = computeZeroReport(store, 'proj-1');
  const budget = computeBudget(store, 'proj-1');
  assert.ok(Math.abs(z.costs.total - budget.totals.fac) <= 1, 'costs.total == budget FAC');
  assert.ok(Math.abs(z.profit.gross - (z.revenue.gdv - z.costs.total)) <= 1);
  const margin = (z.profit.gross / z.revenue.gdv) * 100;
  assert.ok(Math.abs(z.profit.margin_on_revenue - margin) < 0.1);
  assert.equal(z.breakeven.revenue, Math.round(z.costs.total));
  assert.ok(z.profit.gross > 0, 'demo project should be profitable');
});

test('sales engine aggregates', () => {
  const store = freshStore();
  const s = computeSales(store, 'proj-1');
  assert.equal(s.unitsTotal, 48);
  assert.equal(s.unitsSold, 18);
  assert.ok(s.collected > 0 && s.outstanding > 0);
  assert.ok(s.overdueAmount > 0, 'sale-7 has overdue items');
  assert.ok(s.sales.every((x) => x.pctPaid >= 0 && x.pctPaid <= 100));
});

test('alert engine finds the seeded stories', () => {
  const store = freshStore();
  const alerts = evaluateAlerts(store, 'proj-1');
  const rules = new Set(alerts.map((a) => a.rule_id));
  assert.ok(rules.has('budget_line_overrun'), 'parking overrun');
  assert.ok(rules.has('buyer_payment_overdue'), 'sale-7 overdue');
  assert.ok(rules.has('covenant_risk'), 'presales covenant warning');
  assert.ok(rules.has('milestone_delayed'), 'shell A delayed');
  for (const a of alerts) {
    assert.ok(['info', 'warning', 'critical'].includes(a.severity));
    assert.ok(a.message && a.title);
  }
});

test('health score bounded and graded', () => {
  const store = freshStore();
  const h = computeHealth(store, 'proj-1');
  assert.ok(h.healthScore >= 0 && h.healthScore <= 100);
  assert.ok(['A', 'B', 'C', 'D'].includes(h.grade));
  assert.ok(h.dataCompleteness.pct > 90, 'seed data should be nearly complete');
  const weights = Object.values(h.dimensions).reduce((a, d) => a + d.weight, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9);
});
