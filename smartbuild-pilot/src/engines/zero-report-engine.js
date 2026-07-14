/**
 * SmartBuild Pilot 2.0 — Zero Report Engine (דוח אפס)
 *
 * GDV, gross profit, development margins, break-even, IRR and NPV —
 * all derived live from the budget FAC and the sales engine.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales } = require('./sales-engine');
const { computeCashflow } = require('./cashflow-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

/** IRR חודשי בניוטון-רפסון, מוחזר כשיעור שנתי (ratio). null אם אין התכנסות. */
function irr(monthlyCashflows, guessAnnual = 0.1) {
  const flows = (monthlyCashflows || []).map(n);
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null;
  let rate = Math.pow(1 + guessAnnual, 1 / 12) - 1;
  for (let iter = 0; iter < 100; iter++) {
    let npvVal = 0;
    let dNpv = 0;
    for (let t = 0; t < flows.length; t++) {
      const disc = Math.pow(1 + rate, t);
      npvVal += flows[t] / disc;
      if (t > 0) dNpv -= (t * flows[t]) / (disc * (1 + rate));
    }
    if (Math.abs(npvVal) < 1e-6) break;
    if (!isFinite(dNpv) || dNpv === 0) return null;
    const next = rate - npvVal / dNpv;
    if (!isFinite(next) || next <= -0.99) return null;
    if (Math.abs(next - rate) < 1e-10) { rate = next; break; }
    rate = next;
  }
  const annual = Math.pow(1 + rate, 12) - 1;
  return isFinite(annual) ? Math.round(annual * 10000) / 10000 : null;
}

/** NPV של תזרים חודשי בהיוון שנתי. */
function npv(monthlyCashflows, annualRate) {
  const flows = (monthlyCashflows || []).map(n);
  return Math.round(flows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + n(annualRate), i / 12), 0));
}

function computeZeroReport(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return null;

  const budget = computeBudget(store, projectId);
  const sales = computeSales(store, projectId, asOf);
  const facOf = (cat) => (budget.byCategory[cat] ? budget.byCategory[cat].fac : 0);

  const costs = {
    land: facOf('land'),
    construction: facOf('hard_costs'),
    soft: facOf('soft_costs'),
    financing: facOf('financing'),
    tax: facOf('permits_tax'),
    contingency: facOf('contingency'),
    guarantees: facOf('guarantees'),
    marketing: facOf('marketing'),
  };
  costs.total = Object.values(costs).reduce((a, v) => a + v, 0);

  const apartments = store.find('apartment', (a) => a.project_id === projectId);
  const revenue = {
    expected: apartments.reduce((a, apt) => a + n(apt.list_price), 0),
    contracted: sales.signedRevenue,
    forecast: sales.projectedRevenue,
    gdv: sales.projectedRevenue,
  };

  const gross = revenue.gdv - costs.total;
  const profit = {
    gross: Math.round(gross),
    margin_on_revenue: revenue.gdv ? Math.round((gross / revenue.gdv) * 10000) / 100 : 0,
    margin_on_cost: costs.total ? Math.round((gross / costs.total) * 10000) / 100 : 0,
  };

  const breakeven = {
    revenue: Math.round(costs.total),
    price_per_sqm: project.total_sellable_sqm
      ? Math.round(costs.total / project.total_sellable_sqm) : null,
  };

  const cashflow = computeCashflow(store, projectId, { asOf });
  const nets = cashflow ? cashflow.months.map((m) => m.net) : [];
  const irrAnnual = irr(nets, n(project.discount_rate_annual) || 0.1);
  const npvValue = npv(nets, n(project.discount_rate_annual) || 0.09);

  const equityRequired = cashflow ? cashflow.equityRequired : 0;
  return {
    projectId,
    costs,
    revenue,
    profit,
    breakeven,
    irr_annual: irrAnnual,
    npv: npvValue,
    equity: {
      committed: n(project.equity_committed),
      required: equityRequired,
      multiple: equityRequired ? Math.round((gross / equityRequired) * 100) / 100 : null,
    },
  };
}

module.exports = { irr, npv, computeZeroReport };
