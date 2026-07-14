/**
 * SmartBuild Pilot 2.0 — State Machines
 *
 * 17 state machines with 70+ transitions. Every transition declares its
 * triggering action, a Hebrew label, an optional guard description and
 * side effects (events to publish, alerts to raise).
 */

'use strict';

function machine(entity, initial, states, transitions) {
  return { entity, initial, states, transitions };
}
const t = (from, to, action, label, extras = {}) => Object.assign({ from, to, action, label, sideEffects: [] }, extras);
const ev = (event) => ({ type: 'publish_event', event });

const STATE_MACHINES = {
  apartment: machine('apartment', 'available',
    ['available', 'reserved', 'sold', 'delivered'], [
      t('available', 'reserved', 'reserve_apartment', 'שריון דירה'),
      t('reserved', 'available', 'release_reservation', 'שחרור שריון'),
      t('available', 'sold', 'sign_sale', 'חתימת חוזה מכר', { sideEffects: [ev('sale_signed')] }),
      t('reserved', 'sold', 'sign_sale', 'חתימת חוזה מכר', { sideEffects: [ev('sale_signed')] }),
      t('sold', 'available', 'cancel_sale', 'ביטול מכירה', { sideEffects: [ev('sale_cancelled')] }),
      t('sold', 'delivered', 'complete_delivery', 'מסירת דירה', { sideEffects: [ev('delivery_completed')] }),
    ]),

  sale: machine('sale', 'reserved',
    ['reserved', 'signed', 'cancelled', 'delivered'], [
      t('reserved', 'signed', 'sign_sale', 'חתימת חוזה', { sideEffects: [ev('sale_signed')] }),
      t('reserved', 'cancelled', 'cancel_sale', 'ביטול שריון'),
      t('signed', 'cancelled', 'cancel_sale', 'ביטול חוזה', { guard: 'בכפוף לסעיפי ביטול בחוזה', sideEffects: [ev('sale_cancelled')] }),
      t('signed', 'delivered', 'complete_delivery', 'מסירה', { guard: 'כל התשלומים שולמו', sideEffects: [ev('delivery_completed')] }),
    ]),

  payment_schedule_item: machine('payment_schedule_item', 'pending',
    ['pending', 'paid', 'overdue'], [
      t('pending', 'paid', 'record_buyer_payment', 'תשלום התקבל', { sideEffects: [ev('buyer_payment')] }),
      t('pending', 'overdue', 'mark_overdue', 'סימון פיגור', { guard: 'עבר מועד הפירעון', sideEffects: [{ type: 'create_alert', rule: 'buyer_payment_overdue' }] }),
      t('overdue', 'paid', 'record_buyer_payment', 'גביית פיגור', { sideEffects: [ev('buyer_payment')] }),
    ]),

  budget_transfer: machine('budget_transfer', 'pending',
    ['pending', 'approved', 'rejected'], [
      t('pending', 'approved', 'approve_budget_transfer', 'אישור העברה', { guard: 'זמינות תקציבית בסעיף המקור', sideEffects: [ev('budget_transfer')] }),
      t('pending', 'rejected', 'reject_budget_transfer', 'דחיית העברה'),
    ]),

  change_order: machine('change_order', 'pending',
    ['pending', 'approved', 'rejected'], [
      t('pending', 'approved', 'approve_change_order', 'אישור שינוי', { guard: 'רמת אישור לפי גודל השינוי (pm_finance/cfo/ic/board)', sideEffects: [ev('change_order_approved'), ev('budget_revision')] }),
      t('pending', 'rejected', 'reject_change_order', 'דחיית שינוי'),
    ]),

  contract: machine('contract', 'draft',
    ['draft', 'signed', 'active', 'completed', 'terminated'], [
      t('draft', 'signed', 'sign_contract', 'חתימת חוזה', { sideEffects: [ev('commitment_created')] }),
      t('signed', 'active', 'activate_contract', 'תחילת ביצוע'),
      t('active', 'completed', 'complete_contract', 'סיום חוזה', { guard: 'חשבון סופי אושר ושוחרר עכבון' }),
      t('active', 'terminated', 'terminate_contract', 'ביטול חוזה', { guard: 'אישור יועץ משפטי' }),
    ]),

  payment_request: machine('payment_request', 'submitted',
    ['submitted', 'supervisor_review', 'approved', 'paid', 'rejected'], [
      t('submitted', 'supervisor_review', 'send_to_supervisor', 'העברה לבדיקת מפקח'),
      t('supervisor_review', 'approved', 'approve_payment_request', 'אישור חשבון', { guard: 'בדיקת כמויות מפקח + יתרה תקציבית', sideEffects: [ev('invoice_received')] }),
      t('submitted', 'approved', 'approve_payment_request', 'אישור ישיר', { guard: 'חשבון קטן מסף הבדיקה' }),
      t('supervisor_review', 'rejected', 'reject_payment_request', 'דחיית חשבון'),
      t('submitted', 'rejected', 'reject_payment_request', 'דחיית חשבון'),
      t('approved', 'paid', 'pay_payment_request', 'ביצוע תשלום', { sideEffects: [ev('payment_executed')] }),
    ]),

  tender: machine('tender', 'draft',
    ['draft', 'published', 'bidding', 'evaluation', 'awarded', 'cancelled'], [
      t('draft', 'published', 'publish_tender', 'פרסום מכרז'),
      t('published', 'bidding', 'open_bidding', 'פתיחת הגשה'),
      t('bidding', 'evaluation', 'close_bidding', 'סגירת הגשה', { guard: 'עבר מועד הסגירה' }),
      t('bidding', 'awarded', 'award_tender', 'הכרזת זוכה', { sideEffects: [ev('tender_awarded'), ev('commitment_created')] }),
      t('evaluation', 'awarded', 'award_tender', 'הכרזת זוכה', { sideEffects: [ev('tender_awarded'), ev('commitment_created')] }),
      t('draft', 'cancelled', 'cancel_tender', 'ביטול מכרז'),
      t('published', 'cancelled', 'cancel_tender', 'ביטול מכרז'),
      t('bidding', 'cancelled', 'cancel_tender', 'ביטול מכרז'),
    ]),

  bid: machine('bid', 'submitted',
    ['submitted', 'shortlisted', 'won', 'lost'], [
      t('submitted', 'shortlisted', 'shortlist_bid', 'העלאה לרשימה קצרה'),
      t('submitted', 'won', 'award_tender', 'זכייה'),
      t('shortlisted', 'won', 'award_tender', 'זכייה'),
      t('submitted', 'lost', 'award_tender', 'הפסד'),
      t('shortlisted', 'lost', 'award_tender', 'הפסד'),
    ]),

  loan: machine('loan', 'approved',
    ['approved', 'active', 'repaid'], [
      t('approved', 'active', 'drawdown_loan', 'משיכה ראשונה', { sideEffects: [ev('loan_drawdown')] }),
      t('active', 'repaid', 'repay_loan', 'פירעון מלא', { guard: 'היתרה אופסה', sideEffects: [ev('loan_repayment')] }),
    ]),

  covenant: machine('covenant', 'ok',
    ['ok', 'warning', 'breach'], [
      t('ok', 'warning', 'run_covenant_test', 'כניסה לטווח אזהרה', { sideEffects: [ev('covenant_test')] }),
      t('ok', 'breach', 'run_covenant_test', 'הפרה', { sideEffects: [ev('covenant_test'), { type: 'create_alert', rule: 'covenant_risk' }] }),
      t('warning', 'breach', 'run_covenant_test', 'הפרה', { sideEffects: [ev('covenant_test'), { type: 'create_alert', rule: 'covenant_risk' }] }),
      t('warning', 'ok', 'run_covenant_test', 'חזרה לתקין', { sideEffects: [ev('covenant_test')] }),
      t('breach', 'warning', 'run_covenant_test', 'שיפור', { sideEffects: [ev('covenant_test')] }),
      t('breach', 'ok', 'run_covenant_test', 'חזרה לתקין', { sideEffects: [ev('covenant_test')] }),
    ]),

  milestone: machine('milestone', 'planned',
    ['planned', 'in_progress', 'completed', 'delayed'], [
      t('planned', 'in_progress', 'start_milestone', 'תחילת ביצוע'),
      t('planned', 'delayed', 'mark_delayed', 'סימון איחור', { guard: 'עבר המועד המתוכנן' }),
      t('in_progress', 'delayed', 'mark_delayed', 'סימון איחור'),
      t('in_progress', 'completed', 'complete_milestone', 'השלמה', { sideEffects: [ev('milestone_completed')] }),
      t('planned', 'completed', 'complete_milestone', 'השלמה', { sideEffects: [ev('milestone_completed')] }),
      t('delayed', 'completed', 'complete_milestone', 'השלמה באיחור', { sideEffects: [ev('milestone_completed')] }),
    ]),

  permit: machine('permit', 'preparing',
    ['preparing', 'submitted', 'granted', 'expired', 'rejected'], [
      t('preparing', 'submitted', 'submit_permit', 'הגשה לרשות'),
      t('submitted', 'granted', 'grant_permit', 'קבלת היתר', { sideEffects: [ev('permit_granted')] }),
      t('submitted', 'rejected', 'reject_permit', 'דחייה'),
      t('rejected', 'submitted', 'submit_permit', 'הגשה מחודשת'),
      t('granted', 'expired', 'expire_permit', 'פקיעת תוקף', { sideEffects: [{ type: 'create_alert', rule: 'permit_expiring' }] }),
    ]),

  risk: machine('risk', 'open',
    ['open', 'mitigating', 'closed'], [
      t('open', 'mitigating', 'start_mitigation', 'תחילת מיטיגציה'),
      t('mitigating', 'closed', 'close_risk', 'סגירת סיכון'),
      t('open', 'closed', 'close_risk', 'סגירת סיכון'),
      t('mitigating', 'open', 'reopen_risk', 'פתיחה מחדש'),
    ]),

  delivery: machine('delivery', 'scheduled',
    ['scheduled', 'completed', 'delayed'], [
      t('scheduled', 'completed', 'complete_delivery', 'השלמת מסירה', { guard: 'פרוטוקול חתום + יתרת תשלומים אפס', sideEffects: [ev('delivery_completed')] }),
      t('scheduled', 'delayed', 'delay_delivery', 'דחיית מסירה'),
      t('delayed', 'completed', 'complete_delivery', 'השלמה באיחור', { sideEffects: [ev('delivery_completed')] }),
    ]),

  warranty_claim: machine('warranty_claim', 'open',
    ['open', 'in_repair', 'closed'], [
      t('open', 'in_repair', 'assign_repair', 'שיבוץ תיקון', { sideEffects: [ev('defect_reported')] }),
      t('in_repair', 'closed', 'close_claim', 'סגירת תביעה'),
      t('open', 'closed', 'close_claim', 'סגירה ללא תיקון'),
    ]),

  decision_gate: machine('decision_gate', 'pending',
    ['pending', 'approved', 'rejected'], [
      t('pending', 'approved', 'approve_gate', 'אישור שער', { guard: 'כל הקריטריונים מולאו', sideEffects: [ev('stage_advanced')] }),
      t('pending', 'rejected', 'reject_gate', 'דחיית שער'),
    ]),

  alert: machine('alert', 'active',
    ['active', 'acknowledged', 'resolved'], [
      t('active', 'acknowledged', 'acknowledge_alert', 'אישור קבלה'),
      t('active', 'resolved', 'resolve_alert', 'פתרון'),
      t('acknowledged', 'resolved', 'resolve_alert', 'פתרון'),
    ]),
};

function getMachine(type) {
  return STATE_MACHINES[type] || null;
}

function availableTransitions(type, currentState) {
  const m = getMachine(type);
  if (!m) return [];
  return m.transitions.filter((tr) => tr.from === currentState);
}

function canTransition(type, from, to) {
  const m = getMachine(type);
  if (!m) return false;
  return m.transitions.some((tr) => tr.from === from && tr.to === to);
}

module.exports = { STATE_MACHINES, getMachine, availableTransitions, canTransition };
