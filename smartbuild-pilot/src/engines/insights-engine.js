/**
 * SmartBuild Pilot 2.0 — Insights Engine (השכבה החכמה)
 *
 * Deterministic heuristics that turn engine outputs into prioritized,
 * actionable insights with ₪ impact estimates, plus next-best-action
 * recommendations wired to orchestrator action ids.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeSales, indexValueAt } = require('./sales-engine');
const { computeCashflow } = require('./cashflow-engine');
const { computeFinance } = require('./finance-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const M = (v) => `₪${Math.round(v).toLocaleString('en-US')}`;
const monthOf = (d) => String(d || '').slice(0, 7);

function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

function computeInsights(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return { insights: [], nextBestActions: [] };

  const budget = computeBudget(store, projectId);
  const sales = computeSales(store, projectId, asOf);
  const cashflow = computeCashflow(store, projectId, { asOf });
  const finance = computeFinance(store, projectId, asOf);
  const insights = [];
  let seq = 0;
  const add = (kind, priority, title, detail, recommendation, impact, entityType, entityId) => {
    seq += 1;
    insights.push({
      id: `ins-${seq}`, kind, priority, title, detail, recommendation,
      impact_estimate: impact === null ? null : Math.round(impact),
      entity_type: entityType, entity_id: entityId,
    });
  };

  // 1. קצב מכירות מול לוח הפרויקט
  if (sales.monthsToSellOut !== null && project.expected_end_date) {
    const monthsToEnd = monthDiff(monthOf(asOf), monthOf(project.expected_end_date));
    if (sales.monthsToSellOut > monthsToEnd + 6) {
      const gapMonths = sales.monthsToSellOut - monthsToEnd;
      const carryCost = (finance ? finance.totals.balance : 0) * 0.062 / 12 * Math.min(gapMonths, 24);
      add('risk', 9, 'קצב המכירות איטי מלוח הפרויקט',
        `בקצב הנוכחי (${sales.salesPacePerMonth} דירות/חודש) המלאי ייגמר רק בעוד ${sales.monthsToSellOut} חודשים — ${Math.round(gapMonths)} חודשים אחרי המסירה המתוכננת.`,
        'לשקול קמפיין שיווקי ממוקד, הטבות מימון לרוכשים או עדכון תמחור לדירות איטיות.',
        carryCost, 'project', projectId);
    }
  }

  // 2. סעיפי תקציב קריטיים → העברת בצ"מ
  for (const line of budget.lines.filter((l) => l.risk_level === 'critical' || l.risk_level === 'high')) {
    const remaining = budget.contingency.remaining;
    add('action', line.risk_level === 'critical' ? 9 : 7, `סעיף "${line.budget_name}" בסיכון ${line.risk_level === 'critical' ? 'קריטי' : 'גבוה'}`,
      `תחזית לסיום ${M(line.forecast_at_completion)} מול תקציב מעודכן ${M(line.revised_budget)} — סטייה של ${line.budget_variance_percent}%.`,
      remaining >= line.budget_variance
        ? `לאשר העברת בצ"מ של ${M(line.budget_variance)} (נותר בצ"מ: ${M(remaining)}).`
        : `הבצ"מ הנותר (${M(remaining)}) אינו מכסה את הסטייה — נדרשת גרסת תקציב חדשה.`,
      line.budget_variance, 'budget_item', line.id);
  }

  // 3. אופטימיזציית משיכות אשראי
  if (finance) {
    for (const loan of finance.loans.filter((l) => l.status === 'active' && l.utilization_pct < 60 && l.facility_type !== 'land_loan')) {
      add('opportunity', 5, 'ניצול מסגרת ליווי נמוך',
        `נוצלו ${loan.utilization_pct}% ממסגרת ${loan.lender} — עלות ריבית חודשית נוכחית ${M(loan.accrued_interest_estimate)}.`,
        'לתאם את קצב המשיכות מול תחזית התזרים כדי למזער ריבית מיותרת ולשמר נזילות.',
        null, 'loan', loan.id);
    }
  }

  // 4. פער הצמדה: תשומות בנייה מול מדד המכר
  const month = monthOf(asOf);
  const ci = indexValueAt(store, 'construction_inputs', month);
  const cpi = indexValueAt(store, 'cpi', month);
  if (ci && cpi && ci - cpi >= 2) {
    const openCosts = budget.totals.fac - budget.totals.paid;
    const exposure = openCosts * ((ci - cpi) / 100);
    add('risk', 8, 'חשיפת מדד: תשומות מתייקרות מהר מההכנסות',
      `מדד תשומות הבנייה עלה ל-${ci} מול מדד כללי ${cpi}. יתרת העלויות הפתוחה (${M(openCosts)}) חשופה לפער.`,
      'לשקול הקדמת התקשרויות במחיר קבוע (מכרז הגמרים) או גידור מדד תשומות.',
      exposure, 'project', projectId);
  }

  // 5. הצעת מכרז נמוכה חשודה
  for (const tender of store.find('tender', (t) => t.project_id === projectId && (t.status === 'bidding' || t.status === 'evaluation'))) {
    for (const bid of store.find('bid', (b) => b.tender_id === tender.id && b.status === 'submitted')) {
      if (tender.estimate_amount && bid.amount < tender.estimate_amount * 0.85) {
        const contractor = store.get('contractor', bid.contractor_id);
        add('anomaly', 7, `הצעה נמוכה חשודה במכרז "${tender.title}"`,
          `הצעת ${contractor ? contractor.name : bid.contractor_id} (${M(bid.amount)}) נמוכה ב-${Math.round((1 - bid.amount / tender.estimate_amount) * 100)}% מהאומדן (${M(tender.estimate_amount)}).`,
          'לבצע בדיקת איתנות פיננסית ותמחור מעמיקה לפני הכרזה על זוכה — הצעה גירעונית מסכנת את הביצוע.',
          null, 'bid', bid.id);
      }
    }
  }

  // 6. דירות איטיות (ימי מדף גבוהים ביחס לקצב)
  const available = store.find('apartment', (a) => a.project_id === projectId && a.status === 'available');
  const slowTypes = {};
  for (const apt of available) {
    slowTypes[apt.apartment_type] = (slowTypes[apt.apartment_type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(slowTypes)) {
    const total = store.find('apartment', (a) => a.project_id === projectId && a.apartment_type === type).length;
    if (total >= 4 && count / total > 0.7) {
      const avgPrice = available.filter((a) => a.apartment_type === type)
        .reduce((a, x) => a + n(x.current_price), 0) / count;
      add('action', 6, `מלאי איטי: דירות ${type === 'penthouse' ? 'פנטהאוז' : type === 'garden' ? 'גן' : 'סטנדרט'}`,
        `${count} מתוך ${total} יחידות מסוג זה עדיין זמינות (${Math.round((count / total) * 100)}%).`,
        `לשקול התאמת תמחור או שיווק ממוקד. הנחת 3% תעלה ${M(avgPrice * 0.03 * count)} אך תאיץ מכירה ותחסוך ריבית ליווי.`,
        null, 'project', projectId);
    }
  }

  // 7. רוכשים עם ריבוי פיגורים
  for (const sale of sales.sales.filter((s) => s.overdueCount >= 2)) {
    const buyer = store.get('buyer', sale.buyer_id);
    add('risk', 8, `סיכון גבייה: ${buyer ? buyer.name : sale.buyer_id}`,
      `${sale.overdueCount} תשלומים בפיגור במכירה ${sale.saleId}; יתרת חוב ${M(sale.balanceDue)}.`,
      'לפתוח בהליך גבייה מדורג: מכתב התראה, עצירת שדרוגים, ובחינת ביטול חוזה לפי סעיפי ההסכם.',
      sale.balanceDue, 'sale', sale.saleId);
  }

  // 8. אנומליה: חשבון קבלן מעבר להתקדמות בפועל
  for (const contract of store.find('contract', (c) => c.project_id === projectId && c.status === 'active')) {
    const requested = store.find('payment_request', (pr) => pr.contract_id === contract.id)
      .reduce((a, pr) => a + n(pr.amount_approved), 0);
    const milestones = store.find('milestone', (m) => m.project_id === projectId && (m.stage === 'execution'));
    const doneWeight = milestones.filter((m) => m.status === 'completed').reduce((a, m) => a + n(m.weight_pct), 0);
    const totalWeight = milestones.reduce((a, m) => a + n(m.weight_pct), 0) || 1;
    const expected = contract.contract_sum * Math.min(1, (doneWeight / totalWeight) + 0.35);
    if (requested > expected * 1.2) {
      const contractor = store.get('contractor', contract.contractor_id);
      add('anomaly', 8, `חיוב חריג: ${contractor ? contractor.name : contract.contractor_id}`,
        `הצטברו חשבונות בסך ${M(requested)} — מעל 120% מהמצופה לפי התקדמות אבני הדרך (${M(expected)}).`,
        'לעצור אישור חשבונות עד בדיקת כמויות של המפקח ולוודא שאין כפל חיוב.',
        requested - expected, 'contract', contract.id);
    }
  }

  // 9. פער מימון
  if (cashflow && cashflow.fundingGap > 0) {
    add('risk', 10, 'פער מימון צפוי',
      `ההון הנדרש לפי התזרים (${M(cashflow.equityRequired)}) גבוה מההון שהוקצה (${M(project.equity_committed)}).`,
      `לגייס ${M(cashflow.fundingGap)} הון משלים, או להאיץ מכירות/משיכות ליווי לכיסוי הפער בשיא (${cashflow.peakDeficit.month}).`,
      cashflow.fundingGap, 'project', projectId);
  }

  // 10. מכרז פתוח על סעיף לא-מחויב גדול
  for (const line of budget.lines.filter((l) => l.committed_amount === 0 && l.revised_budget > 5000000)) {
    const tender = store.find('tender', (t) => t.budget_item_id === line.id && t.status !== 'awarded' && t.status !== 'cancelled')[0];
    if (tender) {
      add('action', 7, `לסגור התקשרות: "${line.budget_name}"`,
        `סעיף של ${M(line.revised_budget)} ללא חוזה חתום. מכרז "${tender.title}" במצב ${tender.status}.`,
        tender.status === 'draft' ? 'לפרסם את המכרז בהקדם — כל חודש עיכוב חושף את הסעיף להתייקרות מדד.' : 'להשלים הערכת הצעות ולהכריז על זוכה — נעילת מחיר תקבע ודאות תקציבית.',
        n(line.price_change_impact), 'tender', tender.id);
    }
  }

  insights.sort((a, b) => b.priority - a.priority);

  // ── Next Best Actions: מיפוי תובנות לפעולות orchestrator ──
  const nextBestActions = [];
  const push = (actionId, label, reason, entityType, entityId) => {
    if (nextBestActions.length < 5 && !nextBestActions.some((x) => x.action_id === actionId && x.entity_id === entityId)) {
      nextBestActions.push({ action_id: actionId, label, reason, entity_type: entityType, entity_id: entityId });
    }
  };
  for (const ins of insights) {
    if (ins.id && ins.title.startsWith('סעיף "') && budget.contingency.remaining > 0) {
      push('request_budget_transfer', 'בקש העברת בצ"מ', ins.title, 'budget_item', ins.entity_id);
    } else if (ins.title.startsWith('לסגור התקשרות')) {
      const tender = store.get('tender', ins.entity_id);
      if (tender && tender.status === 'draft') push('publish_tender', 'פרסם מכרז', ins.title, 'tender', ins.entity_id);
      else push('award_tender', 'הכרז על זוכה במכרז', ins.title, 'tender', ins.entity_id);
    } else if (ins.title.startsWith('סיכון גבייה')) {
      push('record_buyer_payment', 'תעד גביית פיגורים', ins.title, 'sale', ins.entity_id);
    } else if (ins.title === 'ניצול מסגרת ליווי נמוך') {
      push('drawdown_loan', 'תזמן משיכת ליווי', ins.title, 'loan', ins.entity_id);
    } else if (ins.title === 'קצב המכירות איטי מלוח הפרויקט') {
      push('reprice_apartment', 'עדכן תמחור דירות איטיות', ins.title, 'project', ins.entity_id);
    }
  }
  const pendingTransfer = store.find('budget_transfer', (t) => t.project_id === projectId && t.status === 'pending')[0];
  if (pendingTransfer) push('approve_budget_transfer', 'אשר העברת תקציב ממתינה', `העברה של ${M(pendingTransfer.amount)} ממתינה לאישור`, 'budget_transfer', pendingTransfer.id);
  const pendingPR = store.find('payment_request', (pr) => pr.project_id === projectId && pr.status === 'approved')[0];
  if (pendingPR) push('pay_payment_request', 'שלם חשבון קבלן מאושר', `חשבון ${pendingPR.seq} מאושר וממתין לתשלום`, 'payment_request', pendingPR.id);

  return { insights, nextBestActions };
}

/** הצעד החכם הבא לישות בודדת — לשימוש בתצוגת 360. */
function entityNextStep(store, entityType, entityId) {
  const e = store.get(entityType, entityId);
  if (!e) return null;
  switch (entityType) {
    case 'apartment':
      if (e.status === 'available') return { label: 'שריין דירה לרוכש מתעניין', action_id: 'reserve_apartment', reason: 'הדירה זמינה למכירה' };
      if (e.status === 'reserved') return { label: 'החתם חוזה מכר', action_id: 'sign_sale', reason: 'הדירה משוריינת — יש להשלים חתימה' };
      if (e.status === 'sold') return { label: 'תזמן מסירה', action_id: 'schedule_delivery', reason: 'הדירה מכורה' };
      return null;
    case 'sale': {
      const overdue = store.find('payment_schedule_item', (i) => i.sale_id === entityId && i.status === 'overdue');
      if (overdue.length) return { label: 'גבה תשלום בפיגור', action_id: 'record_buyer_payment', reason: `${overdue.length} תשלומים בפיגור` };
      const pending = store.find('payment_schedule_item', (i) => i.sale_id === entityId && i.status === 'pending')[0];
      if (pending) return { label: `תשלום הבא: ${pending.milestone_label}`, action_id: 'record_buyer_payment', reason: `לתשלום עד ${pending.due_date}` };
      return null;
    }
    case 'payment_schedule_item':
      if (e.status !== 'paid') return { label: 'תעד תשלום', action_id: 'record_buyer_payment', reason: `סטטוס: ${e.status}` };
      return null;
    case 'budget_item': {
      const { computeBudgetLine } = require('./budget-engine');
      const line = computeBudgetLine(e);
      if (line.risk_level === 'critical' || line.risk_level === 'high') {
        return { label: 'בקש העברת בצ"מ', action_id: 'request_budget_transfer', reason: `סטיית תקציב ${line.budget_variance_percent}%` };
      }
      return null;
    }
    case 'budget_transfer':
      if (e.status === 'pending') return { label: 'אשר העברה', action_id: 'approve_budget_transfer', reason: 'ממתינה להחלטה' };
      return null;
    case 'change_order':
      if (e.approval_status === 'pending') return { label: 'אשר הוראת שינוי', action_id: 'approve_change_order', reason: `רמת אישור נדרשת: ${e.approval_level}` };
      return null;
    case 'tender':
      if (e.status === 'draft') return { label: 'פרסם מכרז', action_id: 'publish_tender', reason: 'המכרז בטיוטה' };
      if (e.status === 'bidding' || e.status === 'evaluation') return { label: 'הכרז על זוכה', action_id: 'award_tender', reason: 'הצעות ממתינות להערכה' };
      return null;
    case 'payment_request':
      if (e.status === 'submitted' || e.status === 'supervisor_review') return { label: 'אשר חשבון', action_id: 'approve_payment_request', reason: 'ממתין לבדיקה' };
      if (e.status === 'approved') return { label: 'בצע תשלום', action_id: 'pay_payment_request', reason: 'מאושר וממתין לתשלום' };
      return null;
    case 'loan':
      if (e.status === 'active' && e.drawn_amount < e.facility_amount) {
        return { label: 'משוך מהמסגרת', action_id: 'drawdown_loan', reason: 'יתרת מסגרת פנויה' };
      }
      return null;
    case 'covenant':
      return { label: 'הרץ בדיקת קובננט', action_id: 'run_covenant_test', reason: 'בדיקה תקופתית' };
    case 'milestone':
      if (e.status !== 'completed') return { label: 'סמן כהושלמה', action_id: 'complete_milestone', reason: `סטטוס: ${e.status}` };
      return null;
    case 'permit':
      if (e.status === 'submitted') return { label: 'עדכן קבלת היתר', action_id: 'grant_permit', reason: 'בקשה מוגשת' };
      return null;
    case 'delivery':
      if (e.status === 'scheduled') return { label: 'השלם מסירה', action_id: 'complete_delivery', reason: `מתוכננת ל-${e.scheduled_date}` };
      return null;
    default:
      return null;
  }
}

module.exports = { computeInsights, entityNextStep };
