/**
 * Unified Notification Service — Notification Types Registry
 * ────────────────────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Purpose:
 *   Canonical registry of every notification type the system can emit.
 *   Each entry describes:
 *     - id           : stable machine key (snake_case)
 *     - category     : 'finance' | 'procurement' | 'hr' | 'ops' | 'security' | 'system' | 'tax'
 *     - priority     : 'critical' | 'high' | 'normal' | 'info'
 *     - defaultChans : default ordered channel list when user has no prefs
 *     - titleHe      : human readable Hebrew title
 *     - template     : text template using {{placeholders}}
 *     - throttleSec  : min seconds between two emissions of the SAME (userId, type)
 *
 * Priority rules (enforced by notification-service):
 *   critical → ALWAYS delivered, bypasses quiet hours, uses SMS + push
 *   high     → respects quiet hours but bypasses frequency cap
 *   normal   → respects everything; default channel mix
 *   info     → email ONLY, respects everything, can be aggregated
 *
 * Zero external deps — pure CommonJS.
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────
const PRIORITIES = Object.freeze({
  CRITICAL: 'critical',
  HIGH:     'high',
  NORMAL:   'normal',
  INFO:     'info',
});

const CHANNELS = Object.freeze({
  EMAIL:    'email',
  WHATSAPP: 'whatsapp',
  SMS:      'sms',
  PUSH:     'push',
  IN_APP:   'in_app',
});

const CATEGORIES = Object.freeze({
  FINANCE:     'finance',
  PROCUREMENT: 'procurement',
  HR:          'hr',
  OPS:         'ops',
  SECURITY:    'security',
  SYSTEM:      'system',
  TAX:         'tax',
});

// ───────────────────────────────────────────────────────────────
// Registry — ≥20 types
// ───────────────────────────────────────────────────────────────
/**
 * Each entry is frozen individually so the registry is tamper-proof at runtime.
 * Templates use {{key}} interpolation against the `data` object passed to notify().
 */
const TYPES = Object.freeze({

  // ── HR / Payroll ──
  wage_slip_ready: Object.freeze({
    id:            'wage_slip_ready',
    category:      CATEGORIES.HR,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP, CHANNELS.WHATSAPP],
    titleHe:       'תלוש שכר זמין',
    template:      'שלום {{employeeName}}, תלוש השכר עבור {{month}} זמין להורדה.',
    throttleSec:   3600,
  }),

  payroll_processed: Object.freeze({
    id:            'payroll_processed',
    category:      CATEGORIES.HR,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'שכר חודשי עובד',
    template:      'תלושי שכר ל-{{employeeCount}} עובדים הופקו. סכום כולל: {{totalAmount}} ₪.',
    throttleSec:   600,
  }),

  leave_request_submitted: Object.freeze({
    id:            'leave_request_submitted',
    category:      CATEGORIES.HR,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'בקשת חופשה חדשה',
    template:      '{{employeeName}} הגיש/ה בקשה לחופשה {{startDate}} – {{endDate}}.',
    throttleSec:   0,
  }),

  // ── Finance / AR / AP ──
  invoice_overdue: Object.freeze({
    id:            'invoice_overdue',
    category:      CATEGORIES.FINANCE,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.WHATSAPP, CHANNELS.IN_APP],
    titleHe:       'חשבונית חורגת מתאריך פרעון',
    template:      'חשבונית {{invoiceNumber}} ({{amount}} ₪) איחרה ב-{{daysLate}} ימים. לקוח: {{customerName}}.',
    throttleSec:   86400,
  }),

  payment_received: Object.freeze({
    id:            'payment_received',
    category:      CATEGORIES.FINANCE,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP, CHANNELS.PUSH],
    titleHe:       'תשלום התקבל',
    template:      'התקבל תשלום של {{amount}} ₪ מ-{{customerName}} עבור חשבונית {{invoiceNumber}}.',
    throttleSec:   0,
  }),

  payment_failed: Object.freeze({
    id:            'payment_failed',
    category:      CATEGORIES.FINANCE,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.SMS, CHANNELS.PUSH, CHANNELS.IN_APP],
    titleHe:       'כישלון בתשלום',
    template:      'תשלום של {{amount}} ₪ ל-{{vendorName}} נכשל. סיבה: {{reason}}.',
    throttleSec:   300,
  }),

  budget_exceeded: Object.freeze({
    id:            'budget_exceeded',
    category:      CATEGORIES.FINANCE,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP, CHANNELS.PUSH],
    titleHe:       'חריגה מתקציב',
    template:      'פרויקט {{projectName}} חרג מהתקציב ב-{{percent}}%. סכום נוכחי: {{current}} ₪ / {{budget}} ₪.',
    throttleSec:   3600,
  }),

  // ── Procurement ──
  po_approval_needed: Object.freeze({
    id:            'po_approval_needed',
    category:      CATEGORIES.PROCUREMENT,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.WHATSAPP, CHANNELS.IN_APP, CHANNELS.PUSH],
    titleHe:       'הזמנת רכש ממתינה לאישור',
    template:      'הזמנת רכש {{poNumber}} בסך {{amount}} ₪ ממתינה לאישורך. ספק: {{vendorName}}.',
    throttleSec:   1800,
  }),

  po_approved: Object.freeze({
    id:            'po_approved',
    category:      CATEGORIES.PROCUREMENT,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'הזמנת רכש אושרה',
    template:      'הזמנת רכש {{poNumber}} אושרה על-ידי {{approverName}}.',
    throttleSec:   0,
  }),

  po_rejected: Object.freeze({
    id:            'po_rejected',
    category:      CATEGORIES.PROCUREMENT,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP, CHANNELS.PUSH],
    titleHe:       'הזמנת רכש נדחתה',
    template:      'הזמנת רכש {{poNumber}} נדחתה. סיבה: {{reason}}.',
    throttleSec:   0,
  }),

  rfq_quote_received: Object.freeze({
    id:            'rfq_quote_received',
    category:      CATEGORIES.PROCUREMENT,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'הצעת מחיר התקבלה',
    template:      'הצעת מחיר חדשה מ-{{vendorName}} ל-RFQ {{rfqNumber}}: {{amount}} ₪.',
    throttleSec:   0,
  }),

  delivery_delayed: Object.freeze({
    id:            'delivery_delayed',
    category:      CATEGORIES.PROCUREMENT,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.WHATSAPP, CHANNELS.IN_APP],
    titleHe:       'עיכוב באספקה',
    template:      'אספקה עבור PO {{poNumber}} מ-{{vendorName}} מתעכבת. ETA חדש: {{newEta}}.',
    throttleSec:   7200,
  }),

  // ── Tax / VAT ──
  vat_report_ready: Object.freeze({
    id:            'vat_report_ready',
    category:      CATEGORIES.TAX,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'דו"ח מע"מ מוכן',
    template:      'דו"ח מע"מ לתקופה {{period}} מוכן. סכום לתשלום: {{amount}} ₪. מועד אחרון: {{deadline}}.',
    throttleSec:   3600,
  }),

  vat_deadline_approaching: Object.freeze({
    id:            'vat_deadline_approaching',
    category:      CATEGORIES.TAX,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.WHATSAPP, CHANNELS.SMS, CHANNELS.PUSH],
    titleHe:       'מועד הגשת מע"מ מתקרב',
    template:      'נותרו {{daysLeft}} ימים להגשת דו"ח מע"מ עבור {{period}}.',
    throttleSec:   86400,
  }),

  income_tax_annual_ready: Object.freeze({
    id:            'income_tax_annual_ready',
    category:      CATEGORIES.TAX,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'דו"ח מס הכנסה שנתי מוכן',
    template:      'דו"ח מס הכנסה לשנת {{year}} מוכן להגשה.',
    throttleSec:   0,
  }),

  // ── Security ──
  security_alert: Object.freeze({
    id:            'security_alert',
    category:      CATEGORIES.SECURITY,
    priority:      PRIORITIES.CRITICAL,
    defaultChans:  [CHANNELS.SMS, CHANNELS.PUSH, CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'התראת אבטחה',
    template:      'זוהתה פעילות חריגה: {{event}} מ-{{ipAddress}}.',
    throttleSec:   60,
  }),

  login_from_new_device: Object.freeze({
    id:            'login_from_new_device',
    category:      CATEGORIES.SECURITY,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.PUSH, CHANNELS.IN_APP],
    titleHe:       'התחברות ממכשיר חדש',
    template:      'זוהתה התחברות מ-{{device}} ({{location}}) בתאריך {{timestamp}}.',
    throttleSec:   300,
  }),

  password_changed: Object.freeze({
    id:            'password_changed',
    category:      CATEGORIES.SECURITY,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.SMS],
    titleHe:       'סיסמה שונתה',
    template:      'סיסמת החשבון שלך שונתה ב-{{timestamp}}. אם לא אתה — פנה מיידית לתמיכה.',
    throttleSec:   0,
  }),

  mfa_enabled: Object.freeze({
    id:            'mfa_enabled',
    category:      CATEGORIES.SECURITY,
    priority:      PRIORITIES.NORMAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'אימות דו-שלבי הופעל',
    template:      'הגנת אימות דו-שלבי הופעלה בחשבונך.',
    throttleSec:   0,
  }),

  // ── System / Ops ──
  system_maintenance: Object.freeze({
    id:            'system_maintenance',
    category:      CATEGORIES.SYSTEM,
    priority:      PRIORITIES.INFO,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'תחזוקה מתוכננת',
    template:      'תחזוקה מתוכננת: {{startTime}} – {{endTime}}. {{description}}.',
    throttleSec:   3600,
  }),

  backup_failed: Object.freeze({
    id:            'backup_failed',
    category:      CATEGORIES.OPS,
    priority:      PRIORITIES.CRITICAL,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.SMS, CHANNELS.PUSH],
    titleHe:       'גיבוי נכשל',
    template:      'גיבוי {{backupName}} נכשל ב-{{timestamp}}. שגיאה: {{error}}.',
    throttleSec:   600,
  }),

  integration_error: Object.freeze({
    id:            'integration_error',
    category:      CATEGORIES.OPS,
    priority:      PRIORITIES.HIGH,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'שגיאת אינטגרציה',
    template:      'אינטגרציה {{integrationName}} נכשלה: {{error}}.',
    throttleSec:   600,
  }),

  data_export_ready: Object.freeze({
    id:            'data_export_ready',
    category:      CATEGORIES.SYSTEM,
    priority:      PRIORITIES.INFO,
    defaultChans:  [CHANNELS.EMAIL, CHANNELS.IN_APP],
    titleHe:       'ייצוא נתונים מוכן',
    template:      'ייצוא הנתונים שביקשת ({{exportType}}) מוכן להורדה. קישור פג תוקף ב-{{expiresAt}}.',
    throttleSec:   0,
  }),

  welcome: Object.freeze({
    id:            'welcome',
    category:      CATEGORIES.SYSTEM,
    priority:      PRIORITIES.INFO,
    defaultChans:  [CHANNELS.EMAIL],
    titleHe:       'ברוכים הבאים',
    template:      'ברוכים הבאים ל-ONYX, {{name}}! הנה הצעדים הראשונים שלך.',
    throttleSec:   0,
  }),
});

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

/**
 * get — retrieve a type definition, or null if unknown.
 * Never throws.
 */
function get(typeId) {
  if (typeof typeId !== 'string') return null;
  return TYPES[typeId] || null;
}

/**
 * has — check if a type id is registered.
 */
function has(typeId) {
  return Boolean(get(typeId));
}

/**
 * listIds — all registered type ids (sorted).
 */
function listIds() {
  return Object.keys(TYPES).sort();
}

/**
 * listByCategory — return [{id, ...def}, ...] filtered by category.
 */
function listByCategory(category) {
  return Object.values(TYPES).filter(t => t.category === category);
}

/**
 * listByPriority — return [{id, ...def}, ...] filtered by priority.
 */
function listByPriority(priority) {
  return Object.values(TYPES).filter(t => t.priority === priority);
}

/**
 * render — interpolate {{key}} placeholders in a template string.
 *
 * Unknown keys are rendered as empty string (graceful).
 * Non-string data values are coerced via String(). null/undefined → ''.
 */
function render(template, data) {
  if (typeof template !== 'string') return '';
  const d = data && typeof data === 'object' ? data : {};
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key) => {
    const parts = key.split('.');
    let v = d;
    for (const p of parts) {
      if (v && typeof v === 'object' && p in v) v = v[p]; else { v = undefined; break; }
    }
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

/**
 * renderType — shortcut that resolves a typeId and renders its template.
 * Returns { title, body } or null if type unknown.
 */
function renderType(typeId, data) {
  const def = get(typeId);
  if (!def) return null;
  return {
    title: def.titleHe,
    body:  render(def.template, data),
    priority: def.priority,
    category: def.category,
    defaultChans: def.defaultChans.slice(),
    throttleSec: def.throttleSec,
  };
}

module.exports = {
  PRIORITIES,
  CHANNELS,
  CATEGORIES,
  TYPES,
  get,
  has,
  listIds,
  listByCategory,
  listByPriority,
  render,
  renderType,
};
