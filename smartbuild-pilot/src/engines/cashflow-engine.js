/**
 * SmartBuild Pilot 2.0 — Cash Flow Engine (36-month projection)
 *
 * Past months use actual records (buyer payments, loan transactions,
 * paid contractor accounts via budget spread). Future months use
 * forecasts: unpaid payment schedules with projected Sale-Law linkage,
 * remaining budget (FAC minus paid) spread over each line's spend window,
 * and equity injection over the first 6 project months.
 */

'use strict';

const { TODAY } = require('../core/contracts');
const { computeBudget } = require('./budget-engine');
const { computeLinkage, indexValueAt } = require('./sales-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const monthOf = (d) => String(d || '').slice(0, 7);

function monthAdd(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
function monthDiff(a, b) { // b - a in months
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

const OUTFLOW_BUCKET = {
  hard_costs: 'contractors',
  land: 'land',
  soft_costs: 'soft_costs',
  financing: 'financing_interest',
  marketing: 'marketing',
  permits_tax: 'other',
  guarantees: 'other',
  contingency: 'other',
};

function computeCashflow(store, projectId, opts = {}) {
  const asOf = opts.asOf || TODAY;
  const project = store.get('project', projectId);
  if (!project) return null;

  const startMonth = monthOf(project.start_date);
  // ברירת מחדל: לפחות 36 חודשים, ומספיק כדי לכסות את סוף הפרויקט (כולל תקבולי מסירה)
  const horizonToEnd = project.expected_end_date
    ? monthDiff(startMonth, monthOf(project.expected_end_date)) + 4 : 36;
  const months = opts.months || Math.max(36, horizonToEnd);
  const currentMonth = monthOf(asOf);
  const emptyRow = (month) => ({
    month,
    inflows: { buyer_payments: 0, loan_drawdowns: 0, equity: 0, projected_sales: 0 },
    outflows: { contractors: 0, land: 0, soft_costs: 0, financing_interest: 0, marketing: 0, other: 0 },
    net: 0, cumulative: 0,
  });
  const rows = [];
  const rowByMonth = new Map();
  for (let i = 0; i < months; i++) {
    const row = emptyRow(monthAdd(startMonth, i));
    rows.push(row);
    rowByMonth.set(row.month, row);
  }
  const addTo = (month, side, bucket, amount) => {
    const row = rowByMonth.get(month);
    if (row && amount) row[side][bucket] += amount;
  };

  // ── הון עצמי: פריסה על 6 החודשים הראשונים ──
  const equityMonthly = n(project.equity_committed) / 6;
  for (let i = 0; i < 6; i++) addTo(monthAdd(startMonth, i), 'inflows', 'equity', equityMonthly);

  // ── תקבולי רוכשים: עבר בפועל, עתיד תחזית כולל הצמדה צפויה ──
  for (const payment of store.find('buyer_payment', (p) => {
    const sale = store.get('sale', p.sale_id);
    return sale && sale.project_id === projectId;
  })) {
    addTo(monthOf(payment.pay_date), 'inflows', 'buyer_payments', n(payment.amount_paid));
  }
  // תחזית מדד: סחיפה חודשית ממוצעת מ-12 החודשים האחרונים בסדרה
  const cpiNow = indexValueAt(store, 'cpi', currentMonth) || 100;
  const cpiYearAgo = indexValueAt(store, 'cpi', monthAdd(currentMonth, -12)) || cpiNow;
  const monthlyDrift = (cpiNow - cpiYearAgo) / 12;
  const projectedCpi = (month) => cpiNow + Math.max(0, monthDiff(currentMonth, month)) * monthlyDrift;

  const signedSales = store.find('sale', (s) => s.project_id === projectId && (s.status === 'signed' || s.status === 'delivered'));
  for (const sale of signedSales) {
    const items = store.find('payment_schedule_item', (i) => i.sale_id === sale.id).sort((a, b) => a.seq - b.seq);
    const paidItemIds = new Set(store.find('buyer_payment', (p) => p.sale_id === sale.id).map((p) => p.schedule_item_id));
    let cumulativePaidBase = 0;
    for (const item of items) {
      if (paidItemIds.has(item.id)) {
        cumulativePaidBase += n(item.amount_base);
        continue; // כבר נספר כתקבול בפועל
      }
      const dueMonth = monthOf(item.due_date);
      const expectedMonth = dueMonth < currentMonth ? currentMonth : dueMonth; // פיגורים — צפי גבייה החודש
      const { effectiveAmount } = computeLinkage({
        contractPrice: sale.contract_price,
        baseIndex: sale.base_index_value,
        currentIndex: projectedCpi(expectedMonth),
        cumulativePaidBase,
        paymentBase: item.amount_base,
      });
      addTo(expectedMonth, 'inflows', 'buyer_payments', effectiveAmount);
      cumulativePaidBase += n(item.amount_base);
    }
  }

  // ── תחזית מכירות עתידיות: יחידות לא-מכורות נמכרות בקצב ההיסטורי ──
  // כל מכירה חזויה: 20% במועד החתימה החזוי, 80% במסירה (אם בתוך האופק)
  const unsold = store.find('apartment', (a) => a.project_id === projectId
    && (a.status === 'available' || a.status === 'reserved'));
  if (unsold.length) {
    const recentSigned = signedSales.filter((s) => {
      const m = monthOf(s.sign_date);
      return m > monthAdd(currentMonth, -6) && m <= currentMonth;
    });
    const pace = recentSigned.length / 6;
    const avgPrice = unsold.reduce((a, apt) => a + n(apt.current_price), 0) / unsold.length;
    const deliveryMonth = monthOf(project.expected_end_date) || monthAdd(startMonth, months - 1);
    if (pace > 0) {
      let soldSoFar = 0;
      for (let i = 1; i < months && soldSoFar < unsold.length; i++) {
        const month = monthAdd(currentMonth, i);
        if (!rowByMonth.has(month)) break;
        const target = Math.min(unsold.length, Math.floor(pace * i));
        const newSales = target - soldSoFar;
        if (newSales <= 0) continue;
        soldSoFar = target;
        addTo(month, 'inflows', 'projected_sales', newSales * avgPrice * 0.2);
        const payoutMonth = deliveryMonth > month ? deliveryMonth : monthAdd(month, 1);
        addTo(payoutMonth, 'inflows', 'projected_sales', newSales * avgPrice * 0.8);
      }
    }
  }

  // ── הלוואות: משיכות בפועל פנימה, פירעונות החוצה ──
  for (const loan of store.find('loan', (l) => l.project_id === projectId)) {
    for (const tx of store.find('loan_transaction', (t) => t.loan_id === loan.id)) {
      if (tx.tx_type === 'drawdown') addTo(monthOf(tx.tx_date), 'inflows', 'loan_drawdowns', n(tx.amount));
      else if (tx.tx_type === 'repayment') addTo(monthOf(tx.tx_date), 'outflows', 'other', n(tx.amount));
      // עסקאות ריבית בפועל כלולות בפריסת סעיף המימון (bl-interest.paid) — לא נכפלות כאן
    }
  }

  // ── עלויות: פריסת תקציב — עבר לפי paid, עתיד לפי FAC-paid ──
  const budget = computeBudget(store, projectId);
  for (const line of budget.lines) {
    const bucket = OUTFLOW_BUCKET[line.category] || 'other';
    const start = line.spend_start_month || startMonth;
    const span = Math.max(1, n(line.spend_months) || 1);
    const end = monthAdd(start, span - 1);

    // עבר: paid_amount נפרס שווה על חודשי ההוצאה שכבר חלפו
    const pastEnd = end < currentMonth ? end : currentMonth;
    const pastSpan = Math.max(0, monthDiff(start, pastEnd) + 1);
    if (n(line.paid_amount) > 0 && pastSpan > 0) {
      const monthly = n(line.paid_amount) / pastSpan;
      for (let i = 0; i < pastSpan; i++) addTo(monthAdd(start, i), 'outflows', bucket, monthly);
    } else if (n(line.paid_amount) > 0) {
      addTo(start, 'outflows', bucket, n(line.paid_amount));
    }

    // עתיד: היתרה להשלמה נפרסת על חודשי ההוצאה שנותרו
    const remaining = Math.max(0, n(line.forecast_at_completion) - n(line.paid_amount));
    if (remaining > 0) {
      const futureStart = start > currentMonth ? start : monthAdd(currentMonth, 1);
      const futureSpan = Math.max(1, monthDiff(futureStart, end) + 1);
      const monthly = remaining / futureSpan;
      for (let i = 0; i < futureSpan; i++) addTo(monthAdd(futureStart, i), 'outflows', bucket, monthly);
    }
  }

  // ── סיכום, מצטבר, שיא גירעון ──
  let cumulative = 0;
  let cumulativeNoEquity = 0;
  let minNoEquity = 0;
  let peakDeficit = { month: rows.length ? rows[0].month : startMonth, amount: 0 };
  for (const row of rows) {
    const inflow = row.inflows.buyer_payments + row.inflows.loan_drawdowns
      + row.inflows.equity + row.inflows.projected_sales;
    const outflow = Object.values(row.outflows).reduce((a, v) => a + v, 0);
    row.net = Math.round(inflow - outflow);
    cumulative += row.net;
    row.cumulative = Math.round(cumulative);
    cumulativeNoEquity += row.net - row.inflows.equity;
    if (cumulativeNoEquity < minNoEquity) minNoEquity = cumulativeNoEquity;
    if (row.cumulative < peakDeficit.amount) peakDeficit = { month: row.month, amount: row.cumulative };
    for (const side of ['inflows', 'outflows']) {
      for (const key of Object.keys(row[side])) row[side][key] = Math.round(row[side][key]);
    }
  }

  const equityRequired = Math.round(Math.abs(minNoEquity));
  return {
    projectId,
    startMonth,
    months: rows,
    peakDeficit: { month: peakDeficit.month, amount: Math.round(peakDeficit.amount) },
    endBalance: rows.length ? rows[rows.length - 1].cumulative : 0,
    equityRequired,
    fundingGap: Math.max(0, equityRequired - n(project.equity_committed)),
  };
}

module.exports = { computeCashflow };
