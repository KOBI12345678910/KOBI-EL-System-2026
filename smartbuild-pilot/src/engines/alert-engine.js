/**
 * SmartBuild Pilot 2.0 — Alert Engine
 *
 * Rule-based alerts evaluated over live engine state. evaluateAlerts is
 * pure; refreshAlerts syncs the results into store.alert (creates new
 * active alerts, resolves stale ones) keyed by rule_id + entity_id.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales } = require('./sales-engine');
const { computeCashflow } = require('./cashflow-engine');
const { computeFinance } = require('./finance-engine');

const M = (v) => `₪${Math.round(v).toLocaleString('en-US')}`;

function monthAdd(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// ctx = { store, projectId, asOf, project, budget, sales, cashflow, finance }
const ALERT_RULES = [
  {
    id: 'budget_line_overrun', severity: 'critical', entity_type: 'budget_item',
    title: 'חריגת תקציב בסעיף',
    check: (ctx) => ctx.budget.lines
      .filter((l) => l.budget_variance_percent > 10)
      .map((l) => ({
        message: `הסעיף "${l.budget_name}" חורג ב-${l.budget_variance_percent}% (${M(l.budget_variance)}) מהתקציב המעודכן`,
        entity_type: 'budget_item', entity_id: l.id,
      })),
  },
  {
    id: 'contingency_depleted', severity: 'warning', entity_type: 'budget_item',
    title: 'שחיקת בצ"מ',
    check: (ctx) => {
      const { allocated, used } = ctx.budget.contingency;
      if (!allocated || used / allocated <= 0.6) return [];
      return [{
        message: `נוצלו ${Math.round((used / allocated) * 100)}% מהבצ"מ (${M(used)} מתוך ${M(allocated)})`,
        entity_type: 'budget_item', entity_id: 'bl-contingency',
      }];
    },
  },
  {
    id: 'covenant_risk', severity: 'critical', entity_type: 'covenant',
    title: 'קובננט בסיכון',
    check: (ctx) => (ctx.finance ? ctx.finance.covenants : [])
      .filter((c) => c.status_computed !== 'ok')
      .map((c) => ({
        message: `${c.name}: ${c.status_computed === 'breach' ? 'הפרה!' : 'התראה'} — ערך בפועל ${c.actual} מול סף ${c.operator} ${c.threshold}`,
        entity_type: 'covenant', entity_id: c.id,
      })),
  },
  {
    id: 'buyer_payment_overdue', severity: 'warning', entity_type: 'sale',
    title: 'תשלום רוכש בפיגור',
    check: (ctx) => ctx.sales.sales
      .filter((s) => s.overdueCount > 0)
      .map((s) => ({
        message: `מכירה ${s.saleId}: ${s.overdueCount} תשלומים בפיגור, יתרה לגבייה ${M(s.balanceDue)}`,
        entity_type: 'sale', entity_id: s.saleId,
      })),
  },
  {
    id: 'payment_request_stuck', severity: 'warning', entity_type: 'payment_request',
    title: 'חשבון קבלן ממתין מעל 45 יום',
    check: (ctx) => ctx.store.find('payment_request', (pr) =>
      pr.project_id === ctx.projectId
      && ['submitted', 'supervisor_review', 'approved'].includes(pr.status)
      && pr.submitted_date && pr.submitted_date < addDaysStr(ctx.asOf, -45))
      .map((pr) => ({
        message: `חשבון ${pr.seq} של ${nameOfContractor(ctx.store, pr.contractor_id)} ממתין מאז ${pr.submitted_date} (${M(pr.amount_approved)})`,
        entity_type: 'payment_request', entity_id: pr.id,
      })),
  },
  {
    id: 'presales_below_required', severity: 'critical', entity_type: 'project',
    title: 'מכירות מוקדמות מתחת לנדרש',
    check: (ctx) => {
      if (ctx.project.current_stage !== 'execution' && ctx.project.current_stage !== 'sales') return [];
      if (ctx.sales.soldPct >= ctx.project.required_presales_pct) return [];
      return [{
        message: `נמכרו ${ctx.sales.soldPct}% מהיחידות — מתחת ליעד ${ctx.project.required_presales_pct}% בשלב הביצוע`,
        entity_type: 'project', entity_id: ctx.projectId,
      }];
    },
  },
  {
    id: 'funding_gap', severity: 'critical', entity_type: 'project',
    title: 'פער מימון מול הון עצמי',
    check: (ctx) => {
      if (!ctx.cashflow || ctx.cashflow.fundingGap <= 0) return [];
      return [{
        message: `ההון הנדרש (${M(ctx.cashflow.equityRequired)}) עולה על ההון שהוקצה (${M(ctx.project.equity_committed)}) — פער ${M(ctx.cashflow.fundingGap)}`,
        entity_type: 'project', entity_id: ctx.projectId,
      }];
    },
  },
  {
    id: 'milestone_delayed', severity: 'warning', entity_type: 'milestone',
    title: 'אבן דרך באיחור',
    check: (ctx) => ctx.store.find('milestone', (m) =>
      m.project_id === ctx.projectId
      && (m.status === 'delayed' || (m.status !== 'completed' && m.planned_date < ctx.asOf)))
      .map((m) => ({
        message: `"${m.name}" תוכננה ל-${m.planned_date} וטרם הושלמה`,
        entity_type: 'milestone', entity_id: m.id,
      })),
  },
  {
    id: 'permit_expiring', severity: 'warning', entity_type: 'permit',
    title: 'היתר פג או עומד לפוג',
    check: (ctx) => ctx.store.find('permit', (p) =>
      p.project_id === ctx.projectId && p.expiry_date
      && p.expiry_date < addDaysStr(ctx.asOf, 60))
      .map((p) => ({
        message: `היתר ${p.permit_type} יפוג ב-${p.expiry_date}`,
        entity_type: 'permit', entity_id: p.id,
      })),
  },
  {
    id: 'price_below_breakeven', severity: 'critical', entity_type: 'project',
    title: 'מחיר מכירה מתחת לנקודת איזון',
    check: (ctx) => {
      const sellable = ctx.project.total_sellable_sqm;
      if (!sellable) return [];
      const breakevenPerSqm = ctx.budget.totals.fac / sellable;
      const unsold = ctx.store.find('apartment', (a) =>
        a.project_id === ctx.projectId && a.status === 'available');
      const below = unsold.filter((a) => a.area_sqm && (a.current_price / a.area_sqm) < breakevenPerSqm);
      if (!below.length) return [];
      return [{
        message: `${below.length} דירות זמינות מתומחרות מתחת למחיר האיזון למ"ר (${M(breakevenPerSqm)})`,
        entity_type: 'project', entity_id: ctx.projectId,
      }];
    },
  },
  {
    id: 'tender_no_bids', severity: 'warning', entity_type: 'tender',
    title: 'מכרז ללא הצעות לקראת סגירה',
    check: (ctx) => ctx.store.find('tender', (t) =>
      t.project_id === ctx.projectId && t.status === 'bidding' && t.closing_date
      && t.closing_date < addDaysStr(ctx.asOf, 21))
      .filter((t) => ctx.store.find('bid', (b) => b.tender_id === t.id).length === 0)
      .map((t) => ({
        message: `המכרז "${t.title}" נסגר ב-${t.closing_date} וטרם הוגשו הצעות`,
        entity_type: 'tender', entity_id: t.id,
      })),
  },
  {
    id: 'contractor_concentration', severity: 'info', entity_type: 'contractor',
    title: 'ריכוזיות קבלן',
    check: (ctx) => {
      const hard = ctx.budget.lines
        .filter((l) => l.category === 'hard_costs')
        .reduce((a, l) => a + l.revised_budget, 0);
      if (!hard) return [];
      const byContractor = {};
      for (const c of ctx.store.find('contract', (x) => x.project_id === ctx.projectId && x.status === 'active')) {
        byContractor[c.contractor_id] = (byContractor[c.contractor_id] || 0) + (c.contract_sum || 0);
      }
      return Object.entries(byContractor)
        .filter(([, sum]) => sum / hard > 0.4)
        .map(([contractorId, sum]) => ({
          message: `${nameOfContractor(ctx.store, contractorId)} מרכז ${Math.round((sum / hard) * 100)}% מתקציב הבנייה — סיכון צד נגדי`,
          entity_type: 'contractor', entity_id: contractorId,
        }));
    },
  },
  {
    id: 'index_exposure', severity: 'info', entity_type: 'project',
    title: 'פער הצמדה בין תשומות למכר',
    check: (ctx) => {
      const { indexValueAt } = require('./sales-engine');
      const month = ctx.asOf.slice(0, 7);
      const ci = indexValueAt(ctx.store, 'construction_inputs', month);
      const cpi = indexValueAt(ctx.store, 'cpi', month);
      if (!ci || !cpi || ci - cpi < 2) return [];
      return [{
        message: `מדד תשומות הבנייה (${ci}) גבוה מהמדד הכללי (${cpi}) — העלויות מתייקרות מהר מהכנסות המכר הצמודות`,
        entity_type: 'project', entity_id: ctx.projectId,
      }];
    },
  },
];

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function nameOfContractor(store, id) {
  const c = store.get('contractor', id);
  return c ? c.name : id;
}

function evaluateAlerts(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return [];
  const ctx = {
    store, projectId, asOf, project,
    budget: computeBudget(store, projectId),
    sales: computeSales(store, projectId, asOf),
    cashflow: computeCashflow(store, projectId, { asOf }),
    finance: computeFinance(store, projectId, asOf),
  };
  const out = [];
  for (const rule of ALERT_RULES) {
    let hits = [];
    try { hits = rule.check(ctx) || []; } catch (err) { hits = []; }
    for (const hit of hits) {
      out.push({
        project_id: projectId, rule_id: rule.id, severity: rule.severity,
        title: rule.title, message: hit.message,
        entity_type: hit.entity_type, entity_id: hit.entity_id,
        created_at: asOf, status: 'active',
      });
    }
  }
  return out;
}

function refreshAlerts(store, projectId, asOf = TODAY) {
  const current = evaluateAlerts(store, projectId, asOf);
  const keyOf = (a) => `${a.rule_id}|${a.entity_id}`;
  const currentKeys = new Set(current.map(keyOf));
  const existing = store.find('alert', (a) => a.project_id === projectId);
  const existingByKey = new Map(existing.map((a) => [keyOf(a), a]));

  for (const alert of current) {
    const prev = existingByKey.get(keyOf(alert));
    if (!prev) store.create('alert', alert);
    else if (prev.status === 'resolved') store.update('alert', prev.id, { status: 'active', message: alert.message, created_at: asOf });
    else store.update('alert', prev.id, { message: alert.message });
  }
  for (const prev of existing) {
    if (!currentKeys.has(keyOf(prev)) && prev.status === 'active') {
      store.update('alert', prev.id, { status: 'resolved' });
    }
  }
  return store.find('alert', (a) => a.project_id === projectId && a.status !== 'resolved');
}

module.exports = { ALERT_RULES, evaluateAlerts, refreshAlerts };
