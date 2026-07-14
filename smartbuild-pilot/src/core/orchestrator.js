/**
 * SmartBuild Pilot 2.0 — Orchestrator
 *
 * 21 executable business actions. Each action validates preconditions,
 * mutates the store, and publishes financial events on the bus.
 * This is the ONLY layer allowed to mutate business state.
 */

'use strict';

const { TODAY } = require('./contracts');
const { computeBudgetLine } = require('../engines/budget-engine');
const { computeLinkage, indexValueAt } = require('../engines/sales-engine');

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const monthOf = (d) => String(d || '').slice(0, 7);

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const maxDate = (a, b) => (a > b ? a : b);
const fail = (error) => ({ ok: false, error });

// לוח תשלומים סטנדרטי לפי חוק המכר: 7% / 13% / 4×15% / 20%
const SCHEDULE_TEMPLATE = [
  { pct: 7, label: 'חתימת חוזה' },
  { pct: 13, label: 'תשלום שני (45 יום)' },
  { pct: 15, label: 'גמר שלד קומה 2' },
  { pct: 15, label: 'גמר שלד קומה 6' },
  { pct: 15, label: 'גמר שלד מלא' },
  { pct: 15, label: 'טיח וריצוף' },
  { pct: 20, label: 'מסירה' },
];

const ACTIONS = [
  {
    id: 'reserve_apartment', label: 'שריין דירה', entity: 'apartment',
    description: 'שריון דירה זמינה לרוכש מתעניין',
    preconditions: ['הדירה במצב available'], effects: ['apartment.status → reserved'], emits: ['entity_updated'],
    run(ctx, params) {
      const apt = ctx.store.get('apartment', params.apartment_id);
      if (!apt) return fail('דירה לא נמצאה');
      if (apt.status !== 'available') return fail(`הדירה אינה זמינה (סטטוס: ${apt.status})`);
      const updated = ctx.store.update('apartment', apt.id, { status: 'reserved' });
      ctx.bus.publish('entity_updated', { entity_type: 'apartment', entity_id: apt.id, action: 'reserve_apartment' });
      return { ok: true, result: updated };
    },
  },
  {
    id: 'sign_sale', label: 'החתם חוזה מכר', entity: 'sale',
    description: 'יצירת מכירה + לוח תשלומים לפי חוק המכר (מדד בסיס נקבע בחתימה)',
    preconditions: ['דירה available/reserved', 'רוכש קיים'], effects: ['sale נוצר', 'apartment → sold', 'לוח תשלומים 100%'], emits: ['sale_signed'],
    run(ctx, params) {
      const apt = ctx.store.get('apartment', params.apartment_id);
      if (!apt) return fail('דירה לא נמצאה');
      if (apt.status !== 'available' && apt.status !== 'reserved') return fail(`הדירה אינה פנויה לחתימה (סטטוס: ${apt.status})`);
      const buyer = ctx.store.get('buyer', params.buyer_id);
      if (!buyer) return fail('רוכש לא נמצא');
      const price = n(params.price) || n(apt.current_price) || n(apt.list_price);
      if (!price) return fail('מחיר חוזה חסר');
      const signDate = params.sign_date || ctx.asOf;
      const baseIndex = indexValueAt(ctx.store, 'cpi', monthOf(signDate));

      const sale = ctx.store.create('sale', {
        project_id: apt.project_id, apartment_id: apt.id, buyer_id: buyer.id,
        contract_price: price, sign_date: signDate, base_index_value: baseIndex,
        status: 'signed', broker_fee_pct: n(params.broker_fee_pct), notes: params.notes || '',
      });

      const project = ctx.store.get('project', apt.project_id);
      const deliveryDate = (project && project.expected_end_date) || addDays(signDate, 540);
      const milestoneGap = [null, 45, 120, 240, 360, 480, null]; // ימים מהחתימה לכל שורה
      let allocated = 0;
      SCHEDULE_TEMPLATE.forEach((row, idx) => {
        const isLast = idx === SCHEDULE_TEMPLATE.length - 1;
        const amount = isLast ? price - allocated : Math.round((price * row.pct) / 100);
        allocated += amount;
        const due = idx === 0 ? signDate
          : isLast ? maxDate(deliveryDate, addDays(signDate, 60))
            : addDays(signDate, milestoneGap[idx]);
        ctx.store.create('payment_schedule_item', {
          sale_id: sale.id, seq: idx + 1, due_date: due, amount_base: amount,
          pct_of_price: row.pct, milestone_label: row.label, status: 'pending',
        });
      });

      ctx.store.update('apartment', apt.id, { status: 'sold' });
      ctx.store.update('buyer', buyer.id, { status: 'signed' });
      ctx.bus.publish('sale_signed', { entity_type: 'sale', entity_id: sale.id, price, apartment_id: apt.id });
      return { ok: true, result: sale };
    },
  },
  {
    id: 'cancel_sale', label: 'בטל מכירה', entity: 'sale',
    description: 'ביטול חוזה מכר והחזרת הדירה למלאי',
    preconditions: ['המכירה במצב reserved/signed'], effects: ['sale → cancelled', 'apartment → available'], emits: ['sale_cancelled'],
    run(ctx, params) {
      const sale = ctx.store.get('sale', params.sale_id);
      if (!sale) return fail('מכירה לא נמצאה');
      if (sale.status === 'cancelled') return fail('המכירה כבר בוטלה');
      if (sale.status === 'delivered') return fail('לא ניתן לבטל מכירה שנמסרה');
      ctx.store.update('sale', sale.id, { status: 'cancelled', notes: params.reason || sale.notes });
      ctx.store.update('apartment', sale.apartment_id, { status: 'available' });
      ctx.bus.publish('sale_cancelled', { entity_type: 'sale', entity_id: sale.id, reason: params.reason });
      return { ok: true, result: ctx.store.get('sale', sale.id) };
    },
  },
  {
    id: 'record_buyer_payment', label: 'תעד תקבול רוכש', entity: 'buyer_payment',
    description: 'רישום תשלום בפועל כולל חישוב הצמדה לפי חוק המכר',
    preconditions: ['שורת לוח תשלומים במצב pending/overdue'], effects: ['buyer_payment נוצר', 'item → paid'], emits: ['buyer_payment'],
    run(ctx, params) {
      const item = ctx.store.get('payment_schedule_item', params.schedule_item_id);
      if (!item) return fail('שורת תשלום לא נמצאה');
      if (item.status === 'paid') return fail('השורה כבר שולמה');
      const sale = ctx.store.get('sale', item.sale_id);
      if (!sale) return fail('מכירה לא נמצאה');
      const payDate = params.pay_date || ctx.asOf;

      // בסיס מצטבר ששולם עד כה — לקביעת החלק הצמוד לפי סף ה-20%
      const paidItems = ctx.store.find('buyer_payment', (p) => p.sale_id === sale.id)
        .map((p) => ctx.store.get('payment_schedule_item', p.schedule_item_id))
        .filter(Boolean);
      const cumulativePaidBase = paidItems.reduce((a, i) => a + n(i.amount_base), 0);
      const currentIndex = indexValueAt(ctx.store, 'cpi', monthOf(payDate));
      const { linkage, effectiveAmount } = computeLinkage({
        contractPrice: sale.contract_price, baseIndex: sale.base_index_value,
        currentIndex, cumulativePaidBase, paymentBase: item.amount_base,
      });

      const payment = ctx.store.create('buyer_payment', {
        sale_id: sale.id, schedule_item_id: item.id, pay_date: payDate,
        amount_paid: n(item.amount_base) + linkage, index_value_at_payment: currentIndex,
        linkage_amount: linkage, receipt_number: params.receipt_number || `RCP-${sale.id}-${item.seq}`,
      });
      ctx.store.update('payment_schedule_item', item.id, { status: 'paid' });
      ctx.bus.publish('buyer_payment', { entity_type: 'buyer_payment', entity_id: payment.id, amount: payment.amount_paid, linkage });
      return { ok: true, result: payment };
    },
  },
  {
    id: 'reprice_apartment', label: 'עדכן מחיר דירה', entity: 'apartment',
    description: 'עדכון מחיר נוכחי לדירה לא-מכורה',
    preconditions: ['הדירה available/reserved', 'מחיר חדש חיובי'], effects: ['apartment.current_price מעודכן'], emits: ['price_change'],
    run(ctx, params) {
      const apt = ctx.store.get('apartment', params.apartment_id);
      if (!apt) return fail('דירה לא נמצאה');
      if (apt.status === 'sold' || apt.status === 'delivered') return fail('לא ניתן לתמחר דירה מכורה');
      const newPrice = n(params.new_price);
      if (newPrice <= 0) return fail('מחיר חדש חייב להיות חיובי');
      const old = apt.current_price;
      ctx.store.update('apartment', apt.id, { current_price: newPrice });
      ctx.bus.publish('price_change', { entity_type: 'apartment', entity_id: apt.id, old_price: old, new_price: newPrice });
      return { ok: true, result: ctx.store.get('apartment', apt.id) };
    },
  },
  {
    id: 'publish_tender', label: 'פרסם מכרז', entity: 'tender',
    description: 'פרסום מכרז ופתיחתו להגשת הצעות',
    preconditions: ['המכרז במצב draft'], effects: ['tender → bidding'], emits: ['entity_updated'],
    run(ctx, params) {
      const tender = ctx.store.get('tender', params.tender_id);
      if (!tender) return fail('מכרז לא נמצא');
      if (tender.status !== 'draft') return fail(`המכרז אינו בטיוטה (סטטוס: ${tender.status})`);
      ctx.store.update('tender', tender.id, {
        status: 'bidding',
        published_date: params.published_date || ctx.asOf,
        closing_date: params.closing_date || addDays(ctx.asOf, 45),
      });
      ctx.bus.publish('entity_updated', { entity_type: 'tender', entity_id: tender.id, action: 'publish_tender' });
      return { ok: true, result: ctx.store.get('tender', tender.id) };
    },
  },
  {
    id: 'submit_bid', label: 'הגש הצעה למכרז', entity: 'bid',
    description: 'קליטת הצעת קבלן למכרז פתוח',
    preconditions: ['המכרז במצב bidding', 'קבלן פעיל'], effects: ['bid נוצר'], emits: ['entity_created'],
    run(ctx, params) {
      const tender = ctx.store.get('tender', params.tender_id);
      if (!tender) return fail('מכרז לא נמצא');
      if (tender.status !== 'bidding') return fail('המכרז אינו פתוח להגשה');
      const contractor = ctx.store.get('contractor', params.contractor_id);
      if (!contractor) return fail('קבלן לא נמצא');
      if (contractor.status !== 'active') return fail('הקבלן אינו פעיל');
      if (n(params.amount) <= 0) return fail('סכום הצעה חסר');
      const bid = ctx.store.create('bid', {
        tender_id: tender.id, contractor_id: contractor.id, amount: n(params.amount),
        days_to_complete: n(params.days_to_complete) || null,
        score_quality: n(params.score_quality) || 70, status: 'submitted',
      });
      ctx.bus.publish('entity_created', { entity_type: 'bid', entity_id: bid.id });
      return { ok: true, result: bid };
    },
  },
  {
    id: 'award_tender', label: 'הכרז על זוכה במכרז', entity: 'tender',
    description: 'בחירת הצעה זוכה, יצירת חוזה והתחייבות תקציבית',
    preconditions: ['מכרז bidding/evaluation', 'הצעה קיימת'], effects: ['tender → awarded', 'contract נוצר', 'budget.committed גדל'], emits: ['tender_awarded', 'commitment_created'],
    run(ctx, params) {
      const tender = ctx.store.get('tender', params.tender_id);
      if (!tender) return fail('מכרז לא נמצא');
      if (tender.status !== 'bidding' && tender.status !== 'evaluation') return fail(`המכרז אינו בשלב הערכה (סטטוס: ${tender.status})`);
      const bid = ctx.store.get('bid', params.bid_id);
      if (!bid || bid.tender_id !== tender.id) return fail('הצעה לא נמצאה במכרז זה');

      for (const other of ctx.store.find('bid', (b) => b.tender_id === tender.id)) {
        ctx.store.update('bid', other.id, { status: other.id === bid.id ? 'won' : 'lost' });
      }
      ctx.store.update('tender', tender.id, { status: 'awarded', awarded_bid_id: bid.id });

      const contract = ctx.store.create('contract', {
        project_id: tender.project_id, contractor_id: bid.contractor_id, tender_id: tender.id,
        title: `חוזה — ${tender.title}`, contract_sum: bid.amount,
        signed_date: params.signed_date || ctx.asOf, retention_pct: 5, index_linked: true,
        budget_item_id: tender.budget_item_id, status: 'signed',
      });
      const line = ctx.store.get('budget_item', tender.budget_item_id);
      if (line) {
        ctx.store.update('budget_item', line.id, { committed_amount: n(line.committed_amount) + n(bid.amount) });
      }
      ctx.bus.publish('tender_awarded', { entity_type: 'tender', entity_id: tender.id, winning_bid: bid.id, amount: bid.amount });
      ctx.bus.publish('commitment_created', { entity_type: 'contract', entity_id: contract.id, amount: bid.amount, budget_item_id: tender.budget_item_id });
      return { ok: true, result: contract };
    },
  },
  {
    id: 'submit_payment_request', label: 'הגש חשבון קבלן', entity: 'payment_request',
    description: 'קבלן מגיש חשבון חודשי על חוזה פעיל',
    preconditions: ['חוזה active/signed'], effects: ['payment_request נוצר'], emits: ['entity_created'],
    run(ctx, params) {
      const contract = ctx.store.get('contract', params.contract_id);
      if (!contract) return fail('חוזה לא נמצא');
      if (contract.status !== 'active' && contract.status !== 'signed') return fail('החוזה אינו פעיל');
      const amount = n(params.amount_requested);
      if (amount <= 0) return fail('סכום חשבון חסר');
      const prev = ctx.store.find('payment_request', (pr) => pr.contract_id === contract.id);
      const pr = ctx.store.create('payment_request', {
        project_id: contract.project_id, contract_id: contract.id, contractor_id: contract.contractor_id,
        seq: prev.length + 1, period: params.period || monthOf(ctx.asOf),
        amount_requested: amount, amount_approved: null, retention_held: null,
        status: 'submitted', submitted_date: ctx.asOf, paid_date: null,
      });
      ctx.bus.publish('entity_created', { entity_type: 'payment_request', entity_id: pr.id });
      return { ok: true, result: pr };
    },
  },
  {
    id: 'approve_payment_request', label: 'אשר חשבון קבלן', entity: 'payment_request',
    description: 'אישור חשבון (מפקח/הנהלה) — מגדיל invoiced בסעיף התקציב',
    preconditions: ['חשבון submitted/supervisor_review'], effects: ['payment_request → approved', 'budget.invoiced גדל'], emits: ['invoice_received'],
    run(ctx, params) {
      const pr = ctx.store.get('payment_request', params.payment_request_id);
      if (!pr) return fail('חשבון לא נמצא');
      if (pr.status !== 'submitted' && pr.status !== 'supervisor_review') return fail(`החשבון אינו ממתין לאישור (סטטוס: ${pr.status})`);
      const approved = n(params.amount_approved) || n(pr.amount_requested);
      const contract = ctx.store.get('contract', pr.contract_id);
      ctx.store.update('payment_request', pr.id, {
        status: 'approved', amount_approved: approved,
        retention_held: Math.round(approved * ((contract ? n(contract.retention_pct) : 5) / 100)),
      });
      if (contract && contract.budget_item_id) {
        const line = ctx.store.get('budget_item', contract.budget_item_id);
        if (line) ctx.store.update('budget_item', line.id, { invoiced_amount: n(line.invoiced_amount) + approved });
      }
      ctx.bus.publish('invoice_received', { entity_type: 'payment_request', entity_id: pr.id, amount: approved });
      return { ok: true, result: ctx.store.get('payment_request', pr.id) };
    },
  },
  {
    id: 'pay_payment_request', label: 'שלם חשבון קבלן', entity: 'payment_request',
    description: 'ביצוע תשלום — מגדיל paid בסעיף התקציב ומעדכן תזרים',
    preconditions: ['חשבון approved'], effects: ['payment_request → paid', 'budget.paid גדל'], emits: ['payment_executed'],
    run(ctx, params) {
      const pr = ctx.store.get('payment_request', params.payment_request_id);
      if (!pr) return fail('חשבון לא נמצא');
      if (pr.status !== 'approved') return fail(`החשבון אינו מאושר לתשלום (סטטוס: ${pr.status})`);
      ctx.store.update('payment_request', pr.id, { status: 'paid', paid_date: params.paid_date || ctx.asOf });
      const contract = ctx.store.get('contract', pr.contract_id);
      if (contract && contract.budget_item_id) {
        const line = ctx.store.get('budget_item', contract.budget_item_id);
        if (line) ctx.store.update('budget_item', line.id, { paid_amount: n(line.paid_amount) + n(pr.amount_approved) });
      }
      ctx.bus.publish('payment_executed', { entity_type: 'payment_request', entity_id: pr.id, amount: pr.amount_approved });
      return { ok: true, result: ctx.store.get('payment_request', pr.id) };
    },
  },
  {
    id: 'request_budget_transfer', label: 'בקש העברת תקציב', entity: 'budget_transfer',
    description: 'פתיחת בקשת העברה בין סעיפים',
    preconditions: ['שני הסעיפים קיימים', 'סכום חיובי'], effects: ['budget_transfer נוצר (pending)'], emits: ['entity_created'],
    run(ctx, params) {
      const from = ctx.store.get('budget_item', params.from_budget_item_id);
      const to = ctx.store.get('budget_item', params.to_budget_item_id);
      if (!from || !to) return fail('סעיף מקור או יעד לא נמצא');
      if (n(params.amount) <= 0) return fail('סכום העברה חסר');
      const transfer = ctx.store.create('budget_transfer', {
        project_id: from.project_id, from_budget_item_id: from.id, to_budget_item_id: to.id,
        amount: n(params.amount), reason: params.reason || '', status: 'pending',
        requested_by: params.requested_by || 'system', decided_at: null,
      });
      ctx.bus.publish('entity_created', { entity_type: 'budget_transfer', entity_id: transfer.id });
      return { ok: true, result: transfer };
    },
  },
  {
    id: 'approve_budget_transfer', label: 'אשר העברת תקציב', entity: 'budget_transfer',
    description: 'אישור העברה — בכפוף לזמינות תקציבית בסעיף המקור',
    preconditions: ['העברה pending', 'available_budget במקור ≥ סכום'], effects: ['transferred_in/out מתעדכנים', 'transfer → approved'], emits: ['budget_transfer'],
    run(ctx, params) {
      const transfer = ctx.store.get('budget_transfer', params.transfer_id);
      if (!transfer) return fail('העברה לא נמצאה');
      if (transfer.status !== 'pending') return fail(`ההעברה אינה ממתינה (סטטוס: ${transfer.status})`);
      const from = ctx.store.get('budget_item', transfer.from_budget_item_id);
      const to = ctx.store.get('budget_item', transfer.to_budget_item_id);
      if (!from || !to) return fail('סעיף מקור או יעד לא נמצא');
      const computed = computeBudgetLine(from);
      if (computed.available_budget < transfer.amount) {
        return fail(`אין זמינות תקציבית בסעיף המקור: זמין ₪${Math.round(computed.available_budget).toLocaleString('en-US')} מול בקשה ₪${transfer.amount.toLocaleString('en-US')}`);
      }
      ctx.store.update('budget_item', from.id, { transferred_out: n(from.transferred_out) + transfer.amount });
      ctx.store.update('budget_item', to.id, { transferred_in: n(to.transferred_in) + transfer.amount });
      ctx.store.update('budget_transfer', transfer.id, { status: 'approved', decided_at: ctx.asOf });
      ctx.bus.publish('budget_transfer', { entity_type: 'budget_transfer', entity_id: transfer.id, amount: transfer.amount });
      return { ok: true, result: ctx.store.get('budget_transfer', transfer.id) };
    },
  },
  {
    id: 'approve_change_order', label: 'אשר הוראת שינוי', entity: 'change_order',
    description: 'אישור שינוי — רמת האישור נגזרת אוטומטית מגודל השינוי',
    preconditions: ['שינוי pending'], effects: ['change_order → approved', 'approved_change_orders גדל'], emits: ['change_order_approved', 'budget_revision'],
    run(ctx, params) {
      const co = ctx.store.get('change_order', params.change_order_id);
      if (!co) return fail('הוראת שינוי לא נמצאה');
      if (co.approval_status !== 'pending') return fail(`ההוראה אינה ממתינה (סטטוס: ${co.approval_status})`);
      const line = ctx.store.get('budget_item', co.budget_item_id);
      if (!line) return fail('סעיף תקציב לא נמצא');
      const computed = computeBudgetLine(line);
      const ratio = computed.revised_budget ? Math.abs(n(co.difference)) / computed.revised_budget : 1;
      const requiredLevel = ratio < 0.02 ? 'pm_finance' : ratio < 0.1 ? 'cfo' : ratio < 0.2 ? 'ic' : 'board';
      ctx.store.update('change_order', co.id, { approval_status: 'approved', approval_level: requiredLevel });
      ctx.store.update('budget_item', line.id, { approved_change_orders: n(line.approved_change_orders) + n(co.difference) });
      ctx.bus.publish('change_order_approved', { entity_type: 'change_order', entity_id: co.id, difference: co.difference, approval_level: requiredLevel });
      ctx.bus.publish('budget_revision', { entity_type: 'budget_item', entity_id: line.id });
      return { ok: true, result: ctx.store.get('change_order', co.id) };
    },
  },
  {
    id: 'drawdown_loan', label: 'משוך מהמסגרת', entity: 'loan',
    description: 'משיכת כספים ממסגרת ליווי — לא ניתן לעבור את המסגרת',
    preconditions: ['הלוואה approved/active', 'drawn+amount ≤ facility'], effects: ['loan_transaction נוצר', 'drawn_amount גדל'], emits: ['loan_drawdown'],
    run(ctx, params) {
      const loan = ctx.store.get('loan', params.loan_id);
      if (!loan) return fail('הלוואה לא נמצאה');
      if (loan.status === 'repaid') return fail('ההלוואה נפרעה');
      const amount = n(params.amount);
      if (amount <= 0) return fail('סכום משיכה חסר');
      if (n(loan.drawn_amount) + amount > n(loan.facility_amount)) {
        return fail(`המשיכה חורגת מהמסגרת: נוצלו ₪${n(loan.drawn_amount).toLocaleString('en-US')} מתוך ₪${n(loan.facility_amount).toLocaleString('en-US')}`);
      }
      const tx = ctx.store.create('loan_transaction', { loan_id: loan.id, tx_type: 'drawdown', tx_date: params.tx_date || ctx.asOf, amount });
      ctx.store.update('loan', loan.id, { drawn_amount: n(loan.drawn_amount) + amount, status: 'active' });
      ctx.bus.publish('loan_drawdown', { entity_type: 'loan', entity_id: loan.id, amount });
      return { ok: true, result: tx };
    },
  },
  {
    id: 'repay_loan', label: 'פרע הלוואה', entity: 'loan',
    description: 'פירעון חלקי או מלא של יתרת ההלוואה',
    preconditions: ['הלוואה active', 'סכום ≤ יתרה'], effects: ['loan_transaction נוצר'], emits: ['loan_repayment'],
    run(ctx, params) {
      const loan = ctx.store.get('loan', params.loan_id);
      if (!loan) return fail('הלוואה לא נמצאה');
      if (loan.status !== 'active') return fail('ההלוואה אינה פעילה');
      const txs = ctx.store.find('loan_transaction', (x) => x.loan_id === loan.id);
      const balance = txs.filter((x) => x.tx_type === 'drawdown').reduce((a, x) => a + n(x.amount), 0)
        - txs.filter((x) => x.tx_type === 'repayment').reduce((a, x) => a + n(x.amount), 0);
      const amount = n(params.amount);
      if (amount <= 0) return fail('סכום פירעון חסר');
      if (amount > balance) return fail(`סכום הפירעון עולה על היתרה (₪${balance.toLocaleString('en-US')})`);
      const tx = ctx.store.create('loan_transaction', { loan_id: loan.id, tx_type: 'repayment', tx_date: params.tx_date || ctx.asOf, amount });
      if (amount === balance) ctx.store.update('loan', loan.id, { status: 'repaid' });
      ctx.bus.publish('loan_repayment', { entity_type: 'loan', entity_id: loan.id, amount });
      return { ok: true, result: tx };
    },
  },
  {
    id: 'run_covenant_test', label: 'הרץ בדיקת קובננטים', entity: 'covenant',
    description: 'בדיקה חיה של כל הקובננטים מול המנועים ועדכון סטטוסים',
    preconditions: [], effects: ['covenant.status מעודכן לכולם'], emits: ['covenant_test'],
    run(ctx, params) {
      const { computeFinance } = require('../engines/finance-engine');
      const projectId = params.project_id || 'proj-1';
      const finance = computeFinance(ctx.store, projectId, ctx.asOf);
      if (!finance) return fail('פרויקט לא נמצא');
      const results = [];
      for (const cov of finance.covenants) {
        ctx.store.update('covenant', cov.id, { status: cov.status_computed });
        results.push({ id: cov.id, name: cov.name, actual: cov.actual, threshold: cov.threshold, status: cov.status_computed });
        ctx.bus.publish('covenant_test', { entity_type: 'covenant', entity_id: cov.id, status: cov.status_computed, actual: cov.actual });
      }
      return { ok: true, result: results };
    },
  },
  {
    id: 'complete_milestone', label: 'השלם אבן דרך', entity: 'milestone',
    description: 'סימון אבן דרך כהושלמה — מזין את התקדמות הצנרת',
    preconditions: ['אבן הדרך לא הושלמה'], effects: ['milestone → completed'], emits: ['milestone_completed'],
    run(ctx, params) {
      const ms = ctx.store.get('milestone', params.milestone_id);
      if (!ms) return fail('אבן דרך לא נמצאה');
      if (ms.status === 'completed') return fail('אבן הדרך כבר הושלמה');
      ctx.store.update('milestone', ms.id, { status: 'completed', actual_date: params.actual_date || ctx.asOf });
      ctx.bus.publish('milestone_completed', { entity_type: 'milestone', entity_id: ms.id, name: ms.name });
      return { ok: true, result: ctx.store.get('milestone', ms.id) };
    },
  },
  {
    id: 'grant_permit', label: 'עדכן קבלת היתר', entity: 'permit',
    description: 'עדכון היתר שהתקבל מהרשות',
    preconditions: ['היתר submitted'], effects: ['permit → granted'], emits: ['permit_granted'],
    run(ctx, params) {
      const permit = ctx.store.get('permit', params.permit_id);
      if (!permit) return fail('היתר לא נמצא');
      if (permit.status !== 'submitted') return fail(`ההיתר אינו בהמתנה (סטטוס: ${permit.status})`);
      ctx.store.update('permit', permit.id, {
        status: 'granted', granted_date: params.granted_date || ctx.asOf,
        expiry_date: params.expiry_date || null,
      });
      ctx.bus.publish('permit_granted', { entity_type: 'permit', entity_id: permit.id, permit_type: permit.permit_type });
      return { ok: true, result: ctx.store.get('permit', permit.id) };
    },
  },
  {
    id: 'schedule_delivery', label: 'תזמן מסירה', entity: 'delivery',
    description: 'קביעת מועד מסירה לדירה מכורה',
    preconditions: ['דירה sold', 'מכירה signed'], effects: ['delivery נוצר'], emits: ['entity_created'],
    run(ctx, params) {
      const apt = ctx.store.get('apartment', params.apartment_id);
      if (!apt) return fail('דירה לא נמצאה');
      if (apt.status !== 'sold') return fail('ניתן לתזמן מסירה רק לדירה מכורה');
      const sale = ctx.store.find('sale', (x) => x.apartment_id === apt.id && x.status === 'signed')[0];
      if (!sale) return fail('לא נמצא חוזה מכר פעיל לדירה');
      const delivery = ctx.store.create('delivery', {
        project_id: apt.project_id, apartment_id: apt.id, sale_id: sale.id,
        scheduled_date: params.scheduled_date || ctx.asOf, actual_date: null,
        protocol_signed: false, defects_count: 0, status: 'scheduled',
      });
      ctx.bus.publish('entity_created', { entity_type: 'delivery', entity_id: delivery.id });
      return { ok: true, result: delivery };
    },
  },
  {
    id: 'complete_delivery', label: 'השלם מסירה', entity: 'delivery',
    description: 'מסירת מפתח — הדירה והמכירה עוברות ל-delivered',
    preconditions: ['מסירה scheduled/delayed'], effects: ['delivery → completed', 'apartment/sale → delivered'], emits: ['delivery_completed'],
    run(ctx, params) {
      const delivery = ctx.store.get('delivery', params.delivery_id);
      if (!delivery) return fail('מסירה לא נמצאה');
      if (delivery.status === 'completed') return fail('המסירה כבר הושלמה');
      ctx.store.update('delivery', delivery.id, {
        status: 'completed', actual_date: params.actual_date || ctx.asOf,
        protocol_signed: true, defects_count: n(params.defects_count),
      });
      ctx.store.update('apartment', delivery.apartment_id, { status: 'delivered' });
      if (delivery.sale_id) ctx.store.update('sale', delivery.sale_id, { status: 'delivered' });
      ctx.bus.publish('delivery_completed', { entity_type: 'delivery', entity_id: delivery.id });
      return { ok: true, result: ctx.store.get('delivery', delivery.id) };
    },
  },
];

function createOrchestrator(store, bus, asOf = TODAY) {
  const ctx = { store, bus, asOf };
  const byId = new Map(ACTIONS.map((a) => [a.id, a]));

  return {
    listActions() {
      return ACTIONS.map(({ id, label, entity, description, preconditions, effects, emits }) => (
        { id, label, entity, description, preconditions, effects, emits }));
    },
    execute(actionId, params = {}) {
      const action = byId.get(actionId);
      if (!action) return fail(`פעולה לא מוכרת: ${actionId}`);
      const before = bus.ledger().length;
      let outcome;
      try {
        outcome = action.run(ctx, params || {});
      } catch (err) {
        return fail(`שגיאה בהרצת הפעולה: ${err.message}`);
      }
      if (!outcome.ok) return outcome;
      bus.publish('action_executed', { action: actionId, entity_type: action.entity });
      return { ok: true, result: outcome.result, events: bus.ledger().slice(before).map((e) => e.event_type) };
    },
  };
}

module.exports = { createOrchestrator, ACTIONS };
