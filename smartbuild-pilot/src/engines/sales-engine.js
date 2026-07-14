/**
 * SmartBuild Pilot 2.0 — Sales Engine (חוק המכר)
 *
 * Sale-Law linkage rule: the first 20% of the contract price is paid
 * without indexation; every shekel beyond 20% is linked to the CPI at
 * only 50% of the index change since the contract's base index.
 */

'use strict';

const { TODAY } = require('../core/contracts');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const monthOf = (d) => String(d || '').slice(0, 7);

function monthAdd(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** ערך המדד בחודש נתון, או האחרון הידוע לפניו. */
function indexValueAt(store, indexType, month) {
  const series = store.find('index_rate', (r) => r.index_type === indexType)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  if (!series.length) return null;
  let best = null;
  for (const r of series) {
    if (r.month <= month) best = r;
    else break;
  }
  return (best || series[0]).value;
}

/**
 * חוק המכר: פיצול תשלום לחלק לא-צמוד (בתוך 20% הראשונים) וחלק צמוד (50% מהשינוי).
 * cumulativePaidBase — סך הבסיס ששולם לפני תשלום זה.
 */
function computeLinkage({ contractPrice, baseIndex, currentIndex, cumulativePaidBase, paymentBase }) {
  const price = n(contractPrice);
  const threshold = price * 0.2;
  const unlinkedPart = Math.max(0, Math.min(n(paymentBase), threshold - n(cumulativePaidBase)));
  const linkedPart = n(paymentBase) - unlinkedPart;
  const indexRatio = baseIndex ? Math.max(0, n(currentIndex) / n(baseIndex) - 1) : 0;
  const linkage = Math.round(linkedPart * indexRatio * 0.5);
  return { linkage, effectiveAmount: n(paymentBase) + linkage };
}

function computeSaleState(store, sale, asOf = TODAY) {
  const items = store.find('payment_schedule_item', (i) => i.sale_id === sale.id)
    .sort((a, b) => a.seq - b.seq);
  const payments = store.find('buyer_payment', (p) => p.sale_id === sale.id);
  const payByItem = new Map(payments.map((p) => [p.schedule_item_id, p]));
  const currentIndex = indexValueAt(store, 'cpi', monthOf(asOf));

  let cumulativePaidBase = 0;
  let totalPaid = 0;
  let totalLinkagePaid = 0;
  let nextDue = null;

  const schedule = items.map((item) => {
    const payment = payByItem.get(item.id) || null;
    const { effectiveAmount } = computeLinkage({
      contractPrice: sale.contract_price,
      baseIndex: sale.base_index_value,
      currentIndex,
      cumulativePaidBase,
      paymentBase: item.amount_base,
    });
    const paid = !!payment;
    const overdue = !paid && item.due_date < asOf;
    if (paid) {
      totalPaid += n(payment.amount_paid);
      totalLinkagePaid += n(payment.linkage_amount);
      cumulativePaidBase += n(item.amount_base);
    } else if (!nextDue) {
      nextDue = { seq: item.seq, due_date: item.due_date, amount_indexed: effectiveAmount, milestone_label: item.milestone_label };
    }
    return Object.assign({}, item, { amount_indexed: effectiveAmount, paid, overdue });
  });

  const paidBase = schedule.filter((s) => s.paid).reduce((a, s) => a + n(s.amount_base), 0);
  const balanceDue = n(sale.contract_price) - paidBase;

  return {
    saleId: sale.id,
    contractPrice: sale.contract_price,
    schedule,
    totalPaid,
    totalLinkagePaid,
    balanceDue,
    pctPaid: sale.contract_price ? Math.round((paidBase / sale.contract_price) * 10000) / 100 : 0,
    nextDue,
  };
}

function computeSales(store, projectId, asOf = TODAY) {
  const apartments = store.find('apartment', (a) => a.project_id === projectId);
  const sales = store.find('sale', (s) => s.project_id === projectId);
  const signed = sales.filter((s) => s.status === 'signed' || s.status === 'delivered');

  const unitsTotal = apartments.length;
  const unitsSold = apartments.filter((a) => a.status === 'sold' || a.status === 'delivered').length;
  const unitsReserved = apartments.filter((a) => a.status === 'reserved').length;
  const unitsAvailable = apartments.filter((a) => a.status === 'available').length;

  const signedRevenue = signed.reduce((a, s) => a + n(s.contract_price), 0);
  const unsoldRevenue = apartments
    .filter((a) => a.status === 'available' || a.status === 'reserved')
    .reduce((a, apt) => a + n(apt.current_price), 0);
  const projectedRevenue = signedRevenue + unsoldRevenue;

  let collected = 0;
  let outstanding = 0;
  let overdueAmount = 0;
  const saleStates = signed.map((sale) => {
    const st = computeSaleState(store, sale, asOf);
    collected += st.totalPaid;
    outstanding += st.balanceDue;
    overdueAmount += st.schedule.filter((x) => x.overdue).reduce((a, x) => a + n(x.amount_base), 0);
    return {
      saleId: st.saleId, apartment_id: sale.apartment_id, buyer_id: sale.buyer_id,
      contractPrice: st.contractPrice, pctPaid: st.pctPaid, totalPaid: st.totalPaid,
      totalLinkagePaid: st.totalLinkagePaid, balanceDue: st.balanceDue,
      overdueCount: st.schedule.filter((x) => x.overdue).length, nextDue: st.nextDue,
    };
  });

  // קצב מכירות: חתימות ב-6 החודשים שלפני asOf
  const sixMonthsAgo = monthAdd(monthOf(asOf), -6);
  const recentSigned = signed.filter((s) => monthOf(s.sign_date) > sixMonthsAgo && monthOf(s.sign_date) <= monthOf(asOf));
  const salesPacePerMonth = Math.round((recentSigned.length / 6) * 100) / 100;
  const remaining = unitsAvailable + unitsReserved;
  const monthsToSellOut = salesPacePerMonth > 0 ? Math.round((remaining / salesPacePerMonth) * 10) / 10 : null;

  return {
    projectId, unitsTotal, unitsSold, unitsReserved, unitsAvailable,
    soldPct: unitsTotal ? Math.round((unitsSold / unitsTotal) * 10000) / 100 : 0,
    signedRevenue, projectedRevenue, collected, outstanding, overdueAmount,
    salesPacePerMonth, monthsToSellOut, sales: saleStates,
  };
}

module.exports = { indexValueAt, computeLinkage, computeSaleState, computeSales };
