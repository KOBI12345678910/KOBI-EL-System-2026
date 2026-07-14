/**
 * SmartBuild Pilot 2.0 — Entity Map
 *
 * Single source of truth for all 26 entity types: labels, relations,
 * statuses, next steps, actions, top fields and related sections.
 * Every 360 view derives from this map (the "No Dead Pages" rule).
 */

'use strict';

const ENTITY_MAP = {
  project: {
    label: 'פרויקט', labelEn: 'Project', icon: '🏗️', service: 'smartbuild',
    purpose: 'פרויקט יזמות נדל"ן — הישות המרכזית שכל השאר נקשרות אליה',
    links: ['apartment', 'sale', 'budget_item', 'contract', 'loan', 'milestone', 'permit', 'risk', 'tender', 'delivery', 'decision_gate', 'alert'],
    statuses: ['land', 'feasibility', 'planning', 'permits', 'financing', 'tendering', 'contracting', 'sales', 'execution', 'payment_control', 'delivery', 'registration', 'warranty', 'closure'],
    nextSteps: [
      { id: 'advance_stage', label: 'קדם שלב בצנרת', icon: '⏭️' },
      { id: 'run_covenant_test', label: 'הרץ בדיקת קובננטים', icon: '🏦' },
      { id: 'view_zero_report', label: 'הצג דוח אפס', icon: '📊' },
    ],
    actions: [
      { id: 'view_cashflow', label: 'תזרים מזומנים', icon: '💧' },
      { id: 'run_montecarlo', label: 'סימולציית מונטה-קרלו', icon: '🎲' },
      { id: 'view_insights', label: 'תובנות חכמות', icon: '🧠' },
    ],
    topFields: ['name', 'city', 'status', 'units_planned', 'equity_committed', 'start_date', 'expected_end_date'],
    relatedSections: ['apartments', 'budget', 'sales', 'loans', 'milestones', 'risks', 'alerts', 'audit_log'],
  },

  apartment: {
    label: 'דירה', labelEn: 'Apartment', icon: '🏠', service: 'smartbuild',
    purpose: 'יחידת דיור למכירה בפרויקט',
    links: ['project', 'sale', 'delivery', 'warranty_claim'],
    statuses: ['available', 'reserved', 'sold', 'delivered'],
    nextSteps: [
      { id: 'reserve_apartment', label: 'שריין לרוכש', icon: '📌', targetStatus: 'reserved' },
      { id: 'sign_sale', label: 'החתם חוזה מכר', icon: '✍️', creates: 'sale', targetStatus: 'sold' },
      { id: 'schedule_delivery', label: 'תזמן מסירה', icon: '🔑', creates: 'delivery' },
    ],
    actions: [
      { id: 'reprice_apartment', label: 'עדכן מחיר', icon: '💰' },
      { id: 'view_profitability', label: 'רווחיות יחידה', icon: '📈' },
    ],
    topFields: ['unit_number', 'building', 'floor', 'rooms', 'area_sqm', 'list_price', 'current_price', 'status'],
    relatedSections: ['sale', 'delivery', 'warranty_claims', 'audit_log'],
  },

  buyer: {
    label: 'רוכש', labelEn: 'Buyer', icon: '👤', service: 'smartbuild',
    purpose: 'רוכש דירה — מהתעניינות ועד מסירה',
    links: ['sale', 'buyer_payment'],
    statuses: ['lead', 'negotiation', 'signed', 'delivered'],
    nextSteps: [
      { id: 'sign_sale', label: 'החתם חוזה', icon: '✍️', creates: 'sale', targetStatus: 'signed' },
      { id: 'record_buyer_payment', label: 'תעד תקבול', icon: '💵' },
    ],
    actions: [
      { id: 'send_payment_reminder', label: 'שלח תזכורת תשלום', icon: '📨' },
      { id: 'view_statement', label: 'דוח יתרות רוכש', icon: '🧾' },
    ],
    topFields: ['name', 'phone', 'email', 'status'],
    relatedSections: ['sales', 'payments', 'audit_log'],
  },

  sale: {
    label: 'מכירה', labelEn: 'Sale', icon: '📝', service: 'smartbuild',
    purpose: 'חוזה מכר של דירה, כולל לוח תשלומים צמוד לפי חוק המכר',
    links: ['project', 'apartment', 'buyer', 'payment_schedule_item', 'buyer_payment', 'delivery'],
    statuses: ['reserved', 'signed', 'cancelled', 'delivered'],
    nextSteps: [
      { id: 'record_buyer_payment', label: 'תעד תקבול', icon: '💵' },
      { id: 'schedule_delivery', label: 'תזמן מסירה', icon: '🔑', creates: 'delivery' },
      { id: 'cancel_sale', label: 'בטל מכירה', icon: '❌', targetStatus: 'cancelled' },
    ],
    actions: [
      { id: 'view_schedule', label: 'לוח תשלומים', icon: '📅' },
      { id: 'view_linkage', label: 'חישוב הצמדה', icon: '🧮' },
    ],
    topFields: ['apartment_id', 'buyer_id', 'contract_price', 'sign_date', 'base_index_value', 'status'],
    relatedSections: ['schedule', 'payments', 'delivery', 'audit_log'],
  },

  payment_schedule_item: {
    label: 'שורת לוח תשלומים', labelEn: 'Payment Schedule Item', icon: '📅', service: 'smartbuild',
    purpose: 'תשלום מתוכנן של רוכש, צמוד מדד לפי חוק המכר',
    links: ['sale', 'buyer_payment'],
    statuses: ['pending', 'paid', 'overdue'],
    nextSteps: [
      { id: 'record_buyer_payment', label: 'תעד תשלום', icon: '💵', targetStatus: 'paid' },
    ],
    actions: [{ id: 'view_linkage', label: 'פירוט הצמדה', icon: '🧮' }],
    topFields: ['seq', 'milestone_label', 'due_date', 'amount_base', 'pct_of_price', 'status'],
    relatedSections: ['sale', 'payment', 'audit_log'],
  },

  buyer_payment: {
    label: 'תקבול רוכש', labelEn: 'Buyer Payment', icon: '💵', service: 'smartbuild',
    purpose: 'תשלום שבוצע בפועל, כולל רכיב ההצמדה ששולם',
    links: ['sale', 'payment_schedule_item'],
    statuses: [],
    nextSteps: [],
    actions: [{ id: 'view_receipt', label: 'הצג קבלה', icon: '🧾' }],
    topFields: ['pay_date', 'amount_paid', 'linkage_amount', 'receipt_number'],
    relatedSections: ['sale', 'audit_log'],
  },

  budget_item: {
    label: 'סעיף תקציב', labelEn: 'Budget Item', icon: '💼', service: 'smartbuild',
    purpose: 'סעיף תקציב היררכי — כל השדות הפיננסיים מחושבים בזמן אמת',
    links: ['project', 'contract', 'change_order', 'budget_transfer', 'tender'],
    statuses: ['planned', 'committed', 'executed', 'over_budget', 'revised', 'pending_approval', 'closed'],
    nextSteps: [
      { id: 'request_budget_transfer', label: 'בקש העברת תקציב', icon: '🔀', creates: 'budget_transfer' },
      { id: 'approve_change_order', label: 'אשר הוראת שינוי', icon: '✅' },
    ],
    actions: [
      { id: 'view_variance', label: 'ניתוח סטיות', icon: '📉' },
      { id: 'view_commitments', label: 'התחייבויות פתוחות', icon: '📎' },
    ],
    topFields: ['budget_code', 'budget_name', 'category', 'original_budget', 'committed_amount', 'paid_amount'],
    relatedSections: ['contracts', 'change_orders', 'transfers', 'audit_log'],
  },

  budget_transfer: {
    label: 'העברת תקציב', labelEn: 'Budget Transfer', icon: '🔀', service: 'smartbuild',
    purpose: 'העברת סכום בין סעיפי תקציב, בכפוף לזמינות ואישור',
    links: ['project', 'budget_item'],
    statuses: ['pending', 'approved', 'rejected'],
    nextSteps: [
      { id: 'approve_budget_transfer', label: 'אשר העברה', icon: '✅', targetStatus: 'approved' },
    ],
    actions: [{ id: 'view_source_line', label: 'הצג סעיף מקור', icon: '👁️' }],
    topFields: ['from_budget_item_id', 'to_budget_item_id', 'amount', 'reason', 'status'],
    relatedSections: ['budget_items', 'audit_log'],
  },

  change_order: {
    label: 'הוראת שינוי', labelEn: 'Change Order', icon: '📋', service: 'smartbuild',
    purpose: 'שינוי כמות/מחיר/היקף בחוזה — רמת האישור נגזרת מגודל השינוי',
    links: ['project', 'budget_item', 'contract'],
    statuses: ['pending', 'approved', 'rejected'],
    nextSteps: [
      { id: 'approve_change_order', label: 'אשר שינוי', icon: '✅', targetStatus: 'approved' },
    ],
    actions: [{ id: 'view_impact', label: 'השפעה תקציבית', icon: '📊' }],
    topFields: ['change_type', 'old_value', 'new_value', 'difference', 'approval_level', 'approval_status'],
    relatedSections: ['budget_item', 'contract', 'audit_log'],
  },

  contractor: {
    label: 'קבלן', labelEn: 'Contractor', icon: '👷', service: 'smartbuild',
    purpose: 'קבלן מבצע — דירוג, חוזים וחשבונות',
    links: ['contract', 'bid', 'payment_request'],
    statuses: ['active', 'suspended', 'blacklisted'],
    nextSteps: [
      { id: 'submit_bid', label: 'הגש הצעה למכרז', icon: '📨', creates: 'bid' },
    ],
    actions: [
      { id: 'view_performance', label: 'ביצועים היסטוריים', icon: '📈' },
      { id: 'view_exposure', label: 'חשיפה כוללת', icon: '⚖️' },
    ],
    topFields: ['name', 'trade', 'rating', 'status', 'contact_name', 'phone'],
    relatedSections: ['contracts', 'payment_requests', 'bids', 'audit_log'],
  },

  contract: {
    label: 'חוזה קבלן', labelEn: 'Contract', icon: '📜', service: 'smartbuild',
    purpose: 'חוזה התקשרות עם קבלן — יוצר התחייבות תקציבית',
    links: ['project', 'contractor', 'tender', 'budget_item', 'payment_request', 'change_order'],
    statuses: ['draft', 'signed', 'active', 'completed', 'terminated'],
    nextSteps: [
      { id: 'submit_payment_request', label: 'הגש חשבון', icon: '🧾', creates: 'payment_request' },
      { id: 'approve_change_order', label: 'הוראת שינוי', icon: '📋', creates: 'change_order' },
    ],
    actions: [{ id: 'view_billing', label: 'מצב חשבונות', icon: '💳' }],
    topFields: ['title', 'contractor_id', 'contract_sum', 'signed_date', 'retention_pct', 'status'],
    relatedSections: ['payment_requests', 'change_orders', 'budget_item', 'audit_log'],
  },

  payment_request: {
    label: 'חשבון קבלן', labelEn: 'Payment Request', icon: '🧾', service: 'smartbuild',
    purpose: 'חשבון חודשי של קבלן — הגשה → מפקח → אישור → תשלום',
    links: ['project', 'contract', 'contractor'],
    statuses: ['submitted', 'supervisor_review', 'approved', 'paid', 'rejected'],
    nextSteps: [
      { id: 'approve_payment_request', label: 'אשר חשבון', icon: '✅', targetStatus: 'approved' },
      { id: 'pay_payment_request', label: 'בצע תשלום', icon: '💸', targetStatus: 'paid' },
    ],
    actions: [{ id: 'view_retention', label: 'עכבון מצטבר', icon: '🔒' }],
    topFields: ['seq', 'period', 'amount_requested', 'amount_approved', 'retention_held', 'status'],
    relatedSections: ['contract', 'contractor', 'audit_log'],
  },

  tender: {
    label: 'מכרז', labelEn: 'Tender', icon: '📢', service: 'smartbuild',
    purpose: 'מכרז קבלנים על סעיף תקציב — נעילת מחיר וודאות תקציבית',
    links: ['project', 'budget_item', 'bid', 'contract'],
    statuses: ['draft', 'published', 'bidding', 'evaluation', 'awarded', 'cancelled'],
    nextSteps: [
      { id: 'publish_tender', label: 'פרסם מכרז', icon: '📣', targetStatus: 'published' },
      { id: 'award_tender', label: 'הכרז על זוכה', icon: '🏆', targetStatus: 'awarded', creates: 'contract' },
    ],
    actions: [{ id: 'compare_bids', label: 'השוואת הצעות', icon: '⚖️' }],
    topFields: ['title', 'trade', 'estimate_amount', 'closing_date', 'status'],
    relatedSections: ['bids', 'budget_item', 'contract', 'audit_log'],
  },

  bid: {
    label: 'הצעת מחיר במכרז', labelEn: 'Bid', icon: '📨', service: 'smartbuild',
    purpose: 'הצעת קבלן למכרז, כולל ציון איכות',
    links: ['tender', 'contractor'],
    statuses: ['submitted', 'shortlisted', 'won', 'lost'],
    nextSteps: [
      { id: 'award_tender', label: 'בחר כזוכה', icon: '🏆', targetStatus: 'won' },
    ],
    actions: [{ id: 'view_analysis', label: 'ניתוח מול אומדן', icon: '🧮' }],
    topFields: ['contractor_id', 'amount', 'days_to_complete', 'score_quality', 'status'],
    relatedSections: ['tender', 'contractor', 'audit_log'],
  },

  loan: {
    label: 'הלוואה / מסגרת ליווי', labelEn: 'Loan', icon: '🏦', service: 'smartbuild',
    purpose: 'מסגרת אשראי בנקאית — משיכות, ריבית וקובננטים',
    links: ['project', 'loan_transaction', 'covenant'],
    statuses: ['approved', 'active', 'repaid'],
    nextSteps: [
      { id: 'drawdown_loan', label: 'משוך מהמסגרת', icon: '⬇️' },
      { id: 'repay_loan', label: 'פרע', icon: '⬆️' },
      { id: 'run_covenant_test', label: 'בדוק קובננטים', icon: '🧪' },
    ],
    actions: [{ id: 'view_amortization', label: 'לוח תנועות', icon: '📜' }],
    topFields: ['lender', 'facility_type', 'facility_amount', 'drawn_amount', 'interest_rate_annual', 'status'],
    relatedSections: ['transactions', 'covenants', 'audit_log'],
  },

  loan_transaction: {
    label: 'תנועת הלוואה', labelEn: 'Loan Transaction', icon: '🔁', service: 'smartbuild',
    purpose: 'משיכה, פירעון או חיוב ריבית במסגרת',
    links: ['loan'],
    statuses: [],
    nextSteps: [],
    actions: [],
    topFields: ['tx_type', 'tx_date', 'amount'],
    relatedSections: ['loan', 'audit_log'],
  },

  covenant: {
    label: 'קובננט בנקאי', labelEn: 'Covenant', icon: '⚖️', service: 'smartbuild',
    purpose: 'התניה פיננסית של הבנק המלווה — נבדקת חיה מול המנועים',
    links: ['loan'],
    statuses: ['ok', 'warning', 'breach'],
    nextSteps: [
      { id: 'run_covenant_test', label: 'הרץ בדיקה', icon: '🧪' },
    ],
    actions: [{ id: 'view_headroom', label: 'מרווח מהסף', icon: '📏' }],
    topFields: ['name', 'metric', 'operator', 'threshold', 'status'],
    relatedSections: ['loan', 'audit_log'],
  },

  index_rate: {
    label: 'מדד', labelEn: 'Index Rate', icon: '📈', service: 'smartbuild',
    purpose: 'סדרת מדדים חודשית (מדד כללי / תשומות בנייה) לחישובי הצמדה',
    links: [],
    statuses: [],
    nextSteps: [],
    actions: [{ id: 'view_series', label: 'גרף סדרה', icon: '📉' }],
    topFields: ['index_type', 'month', 'value'],
    relatedSections: ['audit_log'],
  },

  milestone: {
    label: 'אבן דרך', labelEn: 'Milestone', icon: '🚩', service: 'smartbuild',
    purpose: 'אבן דרך ביצועית עם משקל להתקדמות הפרויקט',
    links: ['project'],
    statuses: ['planned', 'in_progress', 'completed', 'delayed'],
    nextSteps: [
      { id: 'complete_milestone', label: 'סמן כהושלמה', icon: '✅', targetStatus: 'completed' },
    ],
    actions: [{ id: 'view_impact', label: 'השפעה על לוח תשלומים', icon: '🔗' }],
    topFields: ['name', 'stage', 'planned_date', 'actual_date', 'weight_pct', 'status'],
    relatedSections: ['project', 'audit_log'],
  },

  permit: {
    label: 'היתר', labelEn: 'Permit', icon: '📄', service: 'smartbuild',
    purpose: 'היתר רגולטורי — תב"ע, היתר בנייה, טופס 4, אכלוס',
    links: ['project'],
    statuses: ['preparing', 'submitted', 'granted', 'expired', 'rejected'],
    nextSteps: [
      { id: 'grant_permit', label: 'עדכן קבלה', icon: '✅', targetStatus: 'granted' },
    ],
    actions: [{ id: 'view_authority', label: 'פרטי רשות', icon: '🏛️' }],
    topFields: ['permit_type', 'authority', 'submitted_date', 'granted_date', 'expiry_date', 'status'],
    relatedSections: ['project', 'audit_log'],
  },

  risk: {
    label: 'סיכון', labelEn: 'Risk', icon: '⚠️', service: 'smartbuild',
    purpose: 'רשומת מרשם סיכונים — הסתברות × השפעה, מיטיגציה ובעלים',
    links: ['project'],
    statuses: ['open', 'mitigating', 'closed'],
    nextSteps: [
      { id: 'update_mitigation', label: 'עדכן מיטיגציה', icon: '🛡️' },
    ],
    actions: [{ id: 'view_heatmap', label: 'מיקום במפת החום', icon: '🗺️' }],
    topFields: ['title', 'category', 'probability', 'impact', 'score', 'owner', 'status'],
    relatedSections: ['project', 'audit_log'],
  },

  alert: {
    label: 'התראה', labelEn: 'Alert', icon: '🔔', service: 'smartbuild',
    purpose: 'התראה שנוצרה על-ידי מנוע החוקים — עם ישות מקור וחומרה',
    links: ['project'],
    statuses: ['active', 'acknowledged', 'resolved'],
    nextSteps: [
      { id: 'acknowledge_alert', label: 'אשר קבלה', icon: '👁️', targetStatus: 'acknowledged' },
    ],
    actions: [{ id: 'goto_entity', label: 'עבור לישות המקור', icon: '↗️' }],
    topFields: ['severity', 'title', 'message', 'entity_type', 'created_at', 'status'],
    relatedSections: ['source_entity', 'audit_log'],
  },

  delivery: {
    label: 'מסירה', labelEn: 'Delivery', icon: '🔑', service: 'smartbuild',
    purpose: 'מסירת דירה לרוכש כולל פרוטוקול וליקויים',
    links: ['project', 'apartment', 'sale', 'warranty_claim'],
    statuses: ['scheduled', 'completed', 'delayed'],
    nextSteps: [
      { id: 'complete_delivery', label: 'השלם מסירה', icon: '✅', targetStatus: 'completed' },
    ],
    actions: [{ id: 'view_protocol', label: 'פרוטוקול מסירה', icon: '📋' }],
    topFields: ['apartment_id', 'scheduled_date', 'actual_date', 'protocol_signed', 'defects_count', 'status'],
    relatedSections: ['apartment', 'sale', 'warranty_claims', 'audit_log'],
  },

  warranty_claim: {
    label: 'תביעת בדק', labelEn: 'Warranty Claim', icon: '🔧', service: 'smartbuild',
    purpose: 'ליקוי שדווח בתקופת הבדק',
    links: ['project', 'apartment'],
    statuses: ['open', 'in_repair', 'closed'],
    nextSteps: [
      { id: 'close_claim', label: 'סגור תביעה', icon: '✅', targetStatus: 'closed' },
    ],
    actions: [{ id: 'assign_contractor', label: 'שבץ קבלן מתקן', icon: '👷' }],
    topFields: ['apartment_id', 'description', 'reported_date', 'severity', 'status'],
    relatedSections: ['apartment', 'audit_log'],
  },

  decision_gate: {
    label: 'שער החלטה', labelEn: 'Decision Gate', icon: '🚪', service: 'smartbuild',
    purpose: 'נקודת החלטה פורמלית בין שלבים — קריטריונים ואישור',
    links: ['project'],
    statuses: ['pending', 'approved', 'rejected'],
    nextSteps: [
      { id: 'decide_gate', label: 'קבל החלטה', icon: '⚖️' },
    ],
    actions: [{ id: 'view_criteria', label: 'קריטריונים', icon: '📋' }],
    topFields: ['gate_name', 'stage', 'status', 'decided_by', 'decided_at'],
    relatedSections: ['project', 'audit_log'],
  },

  audit_event: {
    label: 'רשומת ביקורת', labelEn: 'Audit Event', icon: '🧾', service: 'smartbuild',
    purpose: 'תיעוד בלתי-ניתן-לשינוי של כל פעולה במערכת',
    links: [],
    statuses: [],
    nextSteps: [],
    actions: [],
    topFields: ['ts', 'actor', 'action', 'entity_type', 'entity_id'],
    relatedSections: [],
  },
};

function getEntityDef(type) {
  return ENTITY_MAP[type] || null;
}

module.exports = { ENTITY_MAP, getEntityDef };
