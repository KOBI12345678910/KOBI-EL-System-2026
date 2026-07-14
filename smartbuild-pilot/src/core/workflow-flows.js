/**
 * SmartBuild Pilot 2.0 — Business Flows
 *
 * Six end-to-end flows connecting entities, actions and events.
 */

'use strict';

const FLOWS = {
  flow_land_to_delivery: {
    id: 'flow_land_to_delivery',
    label: 'קרקע → מסירה (המאסטר)',
    description: 'זרימת-העל של פרויקט יזמות: מרכישת קרקע ועד סגירת שנת הבדק',
    steps: [
      { seq: 1, entity: 'project', action: 'acquire_land', description: 'רכישת קרקע ומימון ראשוני (הלוואת קרקע)' },
      { seq: 2, entity: 'decision_gate', action: 'approve_gate', description: 'שער היתכנות: דוח אפס ראשוני, מרווח יעד, אישור ועדת השקעות' },
      { seq: 3, entity: 'permit', action: 'submit_permit', description: 'תכנון והיתרים: תב"ע, היתר בנייה', triggers_event: 'permit_granted' },
      { seq: 4, entity: 'loan', action: 'drawdown_loan', description: 'סגירת ליווי בנקאי וקביעת קובננטים', triggers_event: 'loan_drawdown' },
      { seq: 5, entity: 'tender', action: 'award_tender', description: 'מכרזי קבלנים והתקשרויות', triggers_event: 'tender_awarded' },
      { seq: 6, entity: 'sale', action: 'sign_sale', description: 'מכירות מוקדמות עד יעד ה-presales', triggers_event: 'sale_signed' },
      { seq: 7, entity: 'milestone', action: 'complete_milestone', description: 'ביצוע: אבני דרך, חשבונות קבלן, בקרה תקציבית', triggers_event: 'milestone_completed' },
      { seq: 8, entity: 'permit', action: 'grant_permit', description: 'טופס 4 ואישורי אכלוס' },
      { seq: 9, entity: 'delivery', action: 'complete_delivery', description: 'מסירות לרוכשים', triggers_event: 'delivery_completed' },
      { seq: 10, entity: 'project', action: 'close_project', description: 'רישום, שנת בדק וסגירה' },
    ],
    kpis: ['מרווח יזמי %', 'IRR', 'סטיית תקציב %', '% מכירות', 'ציון בריאות'],
  },

  flow_sale_to_cash: {
    id: 'flow_sale_to_cash',
    label: 'מכירה → מזומן (חוק המכר)',
    description: 'מחתימת חוזה מכר ועד גביית מלוא התמורה הצמודה',
    steps: [
      { seq: 1, entity: 'apartment', action: 'reserve_apartment', description: 'שריון דירה לרוכש' },
      { seq: 2, entity: 'sale', action: 'sign_sale', description: 'חתימת חוזה — נקבע מדד הבסיס ונוצר לוח תשלומים (7/13/4×15/20)', triggers_event: 'sale_signed' },
      { seq: 3, entity: 'payment_schedule_item', action: 'record_buyer_payment', description: '20% ראשונים ללא הצמדה', triggers_event: 'buyer_payment' },
      { seq: 4, entity: 'payment_schedule_item', action: 'record_buyer_payment', description: 'יתרת התשלומים צמודה ב-50% משינוי המדד', triggers_event: 'buyer_payment' },
      { seq: 5, entity: 'delivery', action: 'complete_delivery', description: 'תשלום מסירה (20%) ומסירת מפתח', triggers_event: 'delivery_completed' },
    ],
    kpis: ['% גבייה', 'הצמדה שנגבתה ₪', 'ימי פיגור ממוצעים', 'יתרות פתוחות'],
  },

  flow_tender_to_contract: {
    id: 'flow_tender_to_contract',
    label: 'מכרז → חוזה → התחייבות',
    description: 'ממכרז ועד חוזה חתום שמייצר התחייבות תקציבית',
    steps: [
      { seq: 1, entity: 'tender', action: 'publish_tender', description: 'פרסום מכרז על סעיף תקציב' },
      { seq: 2, entity: 'bid', action: 'submit_bid', description: 'קבלת הצעות קבלנים' },
      { seq: 3, entity: 'bid', action: 'compare_bids', description: 'השוואת מחיר/איכות/לו"ז מול אומדן (זיהוי הצעות גירעוניות)' },
      { seq: 4, entity: 'tender', action: 'award_tender', description: 'הכרזת זוכה ויצירת חוזה', triggers_event: 'tender_awarded' },
      { seq: 5, entity: 'contract', action: 'sign_contract', description: 'חתימה — הסעיף התקציבי מקבל committed_amount', triggers_event: 'commitment_created' },
    ],
    kpis: ['פער זכייה מול אומדן %', 'מס\' הצעות למכרז', 'ימים לפרסום→חתימה'],
  },

  flow_payment_request: {
    id: 'flow_payment_request',
    label: 'חשבון קבלן → תשלום',
    description: 'מהגשת חשבון חודשי ועד תשלום בפועל ועדכון התקציב',
    steps: [
      { seq: 1, entity: 'payment_request', action: 'submit_payment_request', description: 'קבלן מגיש חשבון חודשי' },
      { seq: 2, entity: 'payment_request', action: 'send_to_supervisor', description: 'בדיקת כמויות של המפקח' },
      { seq: 3, entity: 'payment_request', action: 'approve_payment_request', description: 'אישור סופי (כולל בדיקת יתרה תקציבית)', triggers_event: 'invoice_received' },
      { seq: 4, entity: 'payment_request', action: 'pay_payment_request', description: 'תשלום בניכוי עכבון 5% — מעדכן paid_amount ותזרים', triggers_event: 'payment_executed' },
    ],
    kpis: ['ימי אישור ממוצעים', 'עכבון מצטבר ₪', 'חשבונות תקועים'],
  },

  flow_budget_change: {
    id: 'flow_budget_change',
    label: 'שינוי תקציב → אישור מדורג',
    description: 'העברות תקציב והוראות שינוי עם רמת אישור לפי גודל',
    steps: [
      { seq: 1, entity: 'budget_item', action: 'request_budget_transfer', description: 'זיהוי סטייה (מנוע התקציב) ובקשת העברה' },
      { seq: 2, entity: 'budget_transfer', action: 'approve_budget_transfer', description: 'בדיקת זמינות בסעיף המקור ואישור', triggers_event: 'budget_transfer' },
      { seq: 3, entity: 'change_order', action: 'approve_change_order', description: 'הוראת שינוי: <2% מנהל כספים, <10% CFO, <20% ועדת השקעות, מעל — דירקטוריון', triggers_event: 'change_order_approved' },
      { seq: 4, entity: 'budget_item', action: 'recalculate', description: 'המנוע מחשב מחדש: revised, FAC, סטייה, רמת סיכון', triggers_event: 'budget_revision' },
    ],
    kpis: ['סטיית תקציב כוללת %', 'ניצול בצ"מ %', 'שינויים ממתינים'],
  },

  flow_delivery_warranty: {
    id: 'flow_delivery_warranty',
    label: 'מסירה → בדק',
    description: 'מסירת דירות, פרוטוקולים וטיפול בליקויי בדק',
    steps: [
      { seq: 1, entity: 'permit', action: 'grant_permit', description: 'קבלת טופס 4', triggers_event: 'permit_granted' },
      { seq: 2, entity: 'delivery', action: 'schedule_delivery', description: 'תיאום מסירות מול רוכשים' },
      { seq: 3, entity: 'delivery', action: 'complete_delivery', description: 'מסירה: פרוטוקול, מונים, מפתח. הדירה → delivered', triggers_event: 'delivery_completed' },
      { seq: 4, entity: 'warranty_claim', action: 'assign_repair', description: 'קליטת ליקויי בדק ושיבוץ תיקונים', triggers_event: 'defect_reported' },
      { seq: 5, entity: 'warranty_claim', action: 'close_claim', description: 'סגירת תביעות וסיום שנת הבדק' },
    ],
    kpis: ['מסירות בזמן %', 'ליקויים ממוצעים למסירה', 'ימי טיפול בתביעה'],
  },
};

function getFlow(id) {
  return FLOWS[id] || null;
}

module.exports = { FLOWS, getFlow };
