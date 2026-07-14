/**
 * SmartBuild Pilot 2.0 — Health Engine
 *
 * Data completeness meter + weighted project health score across five
 * dimensions: budget, schedule, sales, finance, risk.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales } = require('./sales-engine');
const { computeFinance } = require('./finance-engine');
const { computeRisks } = require('./risk-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// שדות חובה לצורך מד שלמות הנתונים
const REQUIRED_FIELDS = {
  project: ['name', 'start_date', 'expected_end_date', 'equity_committed', 'total_sellable_sqm'],
  apartment: ['unit_number', 'area_sqm', 'list_price', 'status'],
  sale: ['contract_price', 'sign_date', 'base_index_value'],
  budget_item: ['budget_name', 'category', 'original_budget'],
  contract: ['contract_sum', 'signed_date', 'budget_item_id'],
  loan: ['facility_amount', 'interest_rate_annual', 'maturity_date'],
  milestone: ['planned_date', 'weight_pct'],
  risk: ['probability', 'impact', 'mitigation'],
};

function computeHealth(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return null;

  // ── מד שלמות נתונים ──
  let totalChecks = 0;
  let passed = 0;
  const missing = [];
  for (const [type, fields] of Object.entries(REQUIRED_FIELDS)) {
    const records = type === 'project'
      ? [project]
      : store.find(type, (r) => r.project_id === projectId || type === 'loan' && r.project_id === projectId);
    for (const field of fields) {
      const bad = records.filter((r) => r[field] === null || r[field] === undefined || r[field] === '');
      totalChecks += records.length;
      passed += records.length - bad.length;
      if (bad.length) missing.push({ entity_type: type, field, count: bad.length });
    }
  }
  const dataCompleteness = {
    pct: totalChecks ? Math.round((passed / totalChecks) * 10000) / 100 : 100,
    missing,
  };

  // ── ממדי בריאות ──
  const budget = computeBudget(store, projectId);
  const sales = computeSales(store, projectId, asOf);
  const finance = computeFinance(store, projectId, asOf);
  const risks = computeRisks(store, projectId);

  // תקציב: 100 בסטייה 0, יורד 8 נק' לכל אחוז סטייה
  const budgetScore = clamp(100 - Math.abs(budget.totals.variance_percent) * 8, 0, 100);

  // לו"ז: יחס אבני דרך שעבר מועדן ולא הושלמו
  const milestones = store.find('milestone', (m) => m.project_id === projectId);
  const due = milestones.filter((m) => m.planned_date < asOf);
  const late = due.filter((m) => m.status !== 'completed');
  const scheduleScore = due.length ? clamp(100 - (late.length / due.length) * 100, 0, 100) : 100;

  // מכירות: יחס מול יעד המכירות המוקדמות (יעד = 100 נק' כשעוברים פי 1.5)
  const target = n(project.required_presales_pct) || 30;
  const salesScore = clamp((sales.soldPct / (target * 1.5)) * 100, 0, 100);

  // מימון: קובננטים תקינים + מרווח ניצול
  let financeScore = 100;
  if (finance) {
    for (const cov of finance.covenants) {
      if (cov.status_computed === 'breach') financeScore -= 40;
      else if (cov.status_computed === 'warning') financeScore -= 15;
    }
  }
  financeScore = clamp(financeScore, 0, 100);

  // סיכונים: ציון ממוצע 25=0 נק', 0=100 נק'
  const riskScore = clamp(100 - (risks.avgScore / 25) * 100, 0, 100);

  const dimensions = {
    budget: { score: Math.round(budgetScore), weight: 0.25 },
    schedule: { score: Math.round(scheduleScore), weight: 0.2 },
    sales: { score: Math.round(salesScore), weight: 0.25 },
    finance: { score: Math.round(financeScore), weight: 0.2 },
    risk: { score: Math.round(riskScore), weight: 0.1 },
  };

  const healthScore = Math.round(Object.values(dimensions)
    .reduce((acc, d) => acc + d.score * d.weight, 0));
  const grade = healthScore >= 85 ? 'A' : healthScore >= 70 ? 'B' : healthScore >= 55 ? 'C' : 'D';

  const weakest = Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)[0];
  const dimNames = { budget: 'תקציב', schedule: 'לוח זמנים', sales: 'מכירות', finance: 'מימון', risk: 'סיכונים' };
  const summary = `בריאות הפרויקט: ${healthScore}/100 (ציון ${grade}). הממד החלש ביותר: ${dimNames[weakest[0]]} (${weakest[1].score}). שלמות נתונים: ${dataCompleteness.pct}%.`;

  return { dataCompleteness, healthScore, grade, dimensions, summary };
}

module.exports = { computeHealth };
