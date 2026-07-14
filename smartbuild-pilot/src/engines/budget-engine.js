/**
 * SmartBuild Pilot 2.0 — Budget Engine
 *
 * Implements the original SmartBuildPilot blueprint formulas (§3.3):
 * revised budget, open commitments/invoices, FAC, variance, risk level.
 * Pure computation — never mutates the store.
 */

'use strict';

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function computeBudgetLine(item) {
  const revised_budget = n(item.approved_budget) + n(item.transferred_in) - n(item.transferred_out)
    + n(item.approved_change_orders) + n(item.contingency_used);
  const open_commitment_amount = n(item.committed_amount) - n(item.invoiced_amount);
  const open_invoice_amount = n(item.invoiced_amount) - n(item.paid_amount);
  const available_budget = revised_budget - n(item.committed_amount) - open_invoice_amount;
  const forecast_at_completion = n(item.paid_amount) + open_invoice_amount
    + n(item.estimated_remaining_cost) + n(item.price_change_impact);
  const budget_variance = forecast_at_completion - revised_budget;
  const budget_variance_percent = revised_budget ? (budget_variance / revised_budget) * 100 : 0;

  let risk_level = 'low';
  if (budget_variance_percent > 15) risk_level = 'critical';
  else if (budget_variance_percent > 10) risk_level = 'high';
  else if (budget_variance_percent > 5) risk_level = 'medium';

  let status = 'planned';
  if (budget_variance_percent > 10) status = 'over_budget';
  else if (n(item.paid_amount) > 0 && available_budget <= 0) status = 'executed';
  else if (n(item.committed_amount) > 0) status = 'committed';

  return Object.assign({}, item, {
    revised_budget, open_commitment_amount, open_invoice_amount, available_budget,
    forecast_at_completion, budget_variance,
    budget_variance_percent: Math.round(budget_variance_percent * 100) / 100,
    risk_level, status,
  });
}

function computeBudget(store, projectId) {
  const all = store.find('budget_item', (b) => b.project_id === projectId);
  const lines = all.filter((b) => b.parent_id).map((b) => computeBudgetLine(b));

  const byCategory = {};
  for (const line of lines) {
    if (!byCategory[line.category]) {
      byCategory[line.category] = { revised: 0, fac: 0, paid: 0, variance: 0 };
    }
    const cat = byCategory[line.category];
    cat.revised += line.revised_budget;
    cat.fac += line.forecast_at_completion;
    cat.paid += line.paid_amount;
    cat.variance += line.budget_variance;
  }

  const sum = (fn) => lines.reduce((acc, l) => acc + n(fn(l)), 0);
  const totals = {
    original: sum((l) => l.original_budget),
    approved: sum((l) => l.approved_budget),
    revised: sum((l) => l.revised_budget),
    committed: sum((l) => l.committed_amount),
    invoiced: sum((l) => l.invoiced_amount),
    paid: sum((l) => l.paid_amount),
    fac: sum((l) => l.forecast_at_completion),
    variance: sum((l) => l.budget_variance),
    available: sum((l) => l.available_budget),
  };
  totals.variance_percent = totals.revised
    ? Math.round((totals.variance / totals.revised) * 10000) / 100 : 0;

  const contingencyLines = lines.filter((l) => l.category === 'contingency');
  const allocated = contingencyLines.reduce((a, l) => a + n(l.original_budget), 0);
  const used = contingencyLines.reduce((a, l) => a + n(l.transferred_out) + n(l.contingency_used), 0);
  const contingency = { allocated, used, remaining: allocated - used };

  return { projectId, lines, byCategory, totals, contingency };
}

module.exports = { computeBudgetLine, computeBudget };
