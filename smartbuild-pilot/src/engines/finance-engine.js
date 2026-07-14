/**
 * SmartBuild Pilot 2.0 — Finance Engine (הלוואות וקובננטים)
 *
 * Loan balances from the transaction ledger, covenant actuals computed
 * live (LTV, LTC, presales coverage, equity injection) with a 10%
 * warning band around each threshold.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales } = require('./sales-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function computeFinance(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return null;

  const budget = computeBudget(store, projectId);
  const sales = computeSales(store, projectId, asOf);
  const gdv = sales.projectedRevenue;
  const totalCost = budget.totals.fac;

  const loans = store.find('loan', (l) => l.project_id === projectId).map((loan) => {
    const txs = store.find('loan_transaction', (t) => t.loan_id === loan.id);
    const drawn = txs.filter((t) => t.tx_type === 'drawdown').reduce((a, t) => a + n(t.amount), 0);
    const repaid = txs.filter((t) => t.tx_type === 'repayment').reduce((a, t) => a + n(t.amount), 0);
    const balance = drawn - repaid;
    return Object.assign({}, loan, {
      balance,
      undrawn: n(loan.facility_amount) - drawn,
      accrued_interest_estimate: Math.round((balance * n(loan.interest_rate_annual)) / 12), // run-rate חודשי
      utilization_pct: loan.facility_amount ? Math.round((drawn / loan.facility_amount) * 10000) / 100 : 0,
    });
  });

  const totals = {
    facilities: loans.reduce((a, l) => a + n(l.facility_amount), 0),
    drawn: loans.reduce((a, l) => a + n(l.facility_amount) - n(l.undrawn), 0),
    balance: loans.reduce((a, l) => a + n(l.balance), 0),
    undrawn: loans.reduce((a, l) => a + n(l.undrawn), 0),
  };

  const ltv = gdv ? Math.round((totals.balance / gdv) * 10000) / 10000 : null;
  const ltc = totalCost ? Math.round((totals.balance / totalCost) * 10000) / 10000 : null;
  const presalesCoveragePct = totals.facilities
    ? Math.round((sales.signedRevenue / totals.facilities) * 10000) / 100 : null;

  const actualFor = (metric) => {
    if (metric === 'ltv') return ltv;
    if (metric === 'ltc') return ltc;
    if (metric === 'presales_coverage') return presalesCoveragePct;
    if (metric === 'equity_injection') return n(project.equity_committed);
    return null;
  };

  const loanIds = new Set(loans.map((l) => l.id));
  const covenants = store.find('covenant', (c) => loanIds.has(c.loan_id)).map((cov) => {
    const actual = actualFor(cov.metric);
    let status = 'ok';
    let headroom = null;
    if (actual !== null && actual !== undefined) {
      if (cov.operator === '<=') {
        headroom = Math.round((cov.threshold - actual) * 10000) / 10000;
        if (actual > cov.threshold) status = 'breach';
        else if (actual > cov.threshold * 0.9) status = 'warning';
      } else { // '>='
        headroom = Math.round((actual - cov.threshold) * 10000) / 10000;
        if (actual < cov.threshold) status = 'breach';
        else if (actual < cov.threshold * 1.1) status = 'warning';
      }
    }
    return Object.assign({}, cov, { actual, headroom, status_computed: status });
  });

  return { loans, totals, covenants, ltv, ltc, presalesCoveragePct };
}

module.exports = { computeFinance };
