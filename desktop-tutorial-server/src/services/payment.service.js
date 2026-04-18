/**
 * חישוב תאריכי תשלום לפי שיטת שוטף+
 * שוטף+30 = סוף החודש של החשבונית + 30 יום
 */

function getEndOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computeDueDate(invoiceDate, paymentTerms, customDays = 0) {
  const endOfMonth = getEndOfMonth(invoiceDate);

  switch (paymentTerms) {
    case 'immediate':
      return new Date(invoiceDate).toISOString().split('T')[0];
    case 'shotef_plus_0':
      return endOfMonth.toISOString().split('T')[0];
    case 'shotef_plus_30':
      return addDays(endOfMonth, 30).toISOString().split('T')[0];
    case 'shotef_plus_60':
      return addDays(endOfMonth, 60).toISOString().split('T')[0];
    case 'shotef_plus_90':
      return addDays(endOfMonth, 90).toISOString().split('T')[0];
    case 'custom':
      return addDays(endOfMonth, customDays).toISOString().split('T')[0];
    default:
      return addDays(endOfMonth, 30).toISOString().split('T')[0];
  }
}

function getPaymentTermsLabel(terms) {
  const labels = {
    immediate: 'מיידי',
    shotef_plus_0: 'שוטף',
    shotef_plus_30: 'שוטף + 30',
    shotef_plus_60: 'שוטף + 60',
    shotef_plus_90: 'שוטף + 90',
    custom: 'מותאם אישית',
  };
  return labels[terms] || terms;
}

function isOverdue(dueDate) {
  return new Date(dueDate) < new Date(new Date().toISOString().split('T')[0]);
}

function daysUntilDue(dueDate) {
  const now = new Date(new Date().toISOString().split('T')[0]);
  const due = new Date(dueDate);
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}

module.exports = { computeDueDate, getPaymentTermsLabel, isOverdue, daysUntilDue };
