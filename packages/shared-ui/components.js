'use strict';

/**
 * @module shared-ui/components
 * @description Shared UI component definitions for Techno-Kol Uzi ERP 2026.
 *
 * These are component contracts -- actual rendering depends on framework.
 * For React services (payroll-autonomous), these export component data structures.
 * For HTML services (onyx-procurement, techno-kol-ops), these export template helpers.
 *
 * Covers the design system elements used across all 9 Master 360 Pages:
 *   Customer360, Supplier360, Quote360, RFQ360, Project360,
 *   WorkOrder360, PO360, Finance360, Employee360
 *
 * @example
 *   const { getStateBadgeVariant, computeNextBestAction } = require('@techno-kol/shared-ui/components');
 *   const variant = getStateBadgeVariant('Approved'); // => 'success'
 *   const nba = computeNextBestAction('Invoice', { status: 'Issued', amount_outstanding: 5000 });
 *   // => { action: 'register_payment', label: 'Register Payment', ... }
 */

/* ═══════════════════════════════════════════════════════════════
 *  STATE BADGE VARIANTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Visual variants for state badge rendering.
 * Maps to CSS class names / Tailwind color tokens.
 * @readonly
 * @enum {string}
 */
const STATE_BADGE_VARIANTS = Object.freeze({
  neutral: 'gray',
  info:    'blue',
  success: 'green',
  warning: 'yellow',
  danger:  'red',
});

/**
 * States classified as SUCCESS (green badge).
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const SUCCESS_STATES = Object.freeze([
  'Completed', 'Paid', 'Approved', 'Exported', 'Resolved',
  'Active', 'FullyReceived', 'SignedOff', 'Reconciled',
  'Won', 'Converted', 'ConvertedToProject', 'ConvertedToPO',
  'Posted', 'Closed',
]);

/**
 * States classified as WARNING (yellow badge).
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const WARNING_STATES = Object.freeze([
  'PendingApproval', 'PartiallyPaid', 'PartiallyReceived',
  'InProgress', 'UnderReview', 'QA', 'Overdue',
  'WaitingMaterials', 'InPlanning', 'InProcurement',
  'InExecution', 'InDelivery', 'OnLeave', 'Submitted',
  'Acknowledged', 'QuotesReceived', 'UnderComparison',
  'Reopened', 'Review',
]);

/**
 * States classified as DANGER (red badge).
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const DANGER_STATES = Object.freeze([
  'Cancelled', 'Rejected', 'Blocked', 'Lost',
  'Terminated', 'Reversed',
]);

/**
 * States classified as INFO (blue badge).
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const INFO_STATES = Object.freeze([
  'Draft', 'New', 'Open', 'Sent', 'Issued',
  'Calculated', 'Assigned', 'Contacted', 'Qualified',
  'Quoted', 'SentToSupplier',
]);

/**
 * Determine the visual badge variant for a given entity state.
 *
 * @param {string} state - Entity state / status value.
 * @returns {'success'|'warning'|'danger'|'info'|'neutral'} Variant key.
 *
 * @example
 *   getStateBadgeVariant('Approved');  // => 'success'
 *   getStateBadgeVariant('Overdue');   // => 'warning'
 *   getStateBadgeVariant('Cancelled'); // => 'danger'
 */
function getStateBadgeVariant(state) {
  if (SUCCESS_STATES.indexOf(state) !== -1) { return 'success'; }
  if (WARNING_STATES.indexOf(state) !== -1) { return 'warning'; }
  if (DANGER_STATES.indexOf(state) !== -1)  { return 'danger'; }
  if (INFO_STATES.indexOf(state) !== -1)    { return 'info'; }
  return 'neutral';
}

/**
 * Get the CSS/Tailwind color token for a badge variant.
 *
 * @param {string} state - Entity state.
 * @returns {string} Color name (e.g. 'green', 'red').
 */
function getStateBadgeColor(state) {
  return STATE_BADGE_VARIANTS[getStateBadgeVariant(state)] || 'gray';
}

/* ═══════════════════════════════════════════════════════════════
 *  SUMMARY CARD
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Create data for a summary KPI card used in 360 headers and dashboards.
 *
 * @param {Object} opts
 * @param {string} opts.title         - Card title (English).
 * @param {string} [opts.titleHe]     - Card title (Hebrew).
 * @param {string|number} opts.value  - Primary displayed value.
 * @param {string} [opts.subtitle]    - Secondary text / description.
 * @param {string} [opts.icon]        - Icon identifier or emoji.
 * @param {'neutral'|'info'|'success'|'warning'|'danger'} [opts.variant='neutral'] - Visual variant.
 * @param {string} [opts.link]        - Navigation URL when clicked.
 * @param {string} [opts.trend]       - Trend indicator: 'up', 'down', 'flat'.
 * @param {number} [opts.trendValue]  - Numeric change (e.g. +12%).
 * @returns {Readonly<Object>} Frozen summary card data object.
 *
 * @example
 *   createSummaryCardData({ title: 'Open Invoices', titleHe: 'חשבוניות פתוחות', value: 23, icon: '💰', variant: 'warning' });
 */
function createSummaryCardData(opts) {
  return Object.freeze({
    title:      opts.title,
    titleHe:    opts.titleHe || null,
    value:      opts.value,
    subtitle:   opts.subtitle || null,
    icon:       opts.icon || null,
    variant:    opts.variant || 'neutral',
    link:       opts.link || null,
    trend:      opts.trend || null,
    trendValue: opts.trendValue || null,
  });
}

/* ═══════════════════════════════════════════════════════════════
 *  EMPTY STATE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Create data for an empty-state placeholder (shown when a list/section has no data).
 *
 * @param {Object} opts
 * @param {string} opts.message              - English message.
 * @param {string} [opts.messageHe]          - Hebrew message.
 * @param {string} [opts.icon]               - Icon/emoji for the empty state.
 * @param {string} [opts.primaryAction]      - Action identifier to offer.
 * @param {string} [opts.primaryActionLabel] - Button label (English).
 * @param {string} [opts.primaryActionLabelHe] - Button label (Hebrew).
 * @param {string} [opts.primaryActionIcon]  - Button icon.
 * @returns {Readonly<Object>} Frozen empty state data object.
 *
 * @example
 *   createEmptyState({ message: 'No invoices yet', messageHe: 'אין חשבוניות', primaryAction: 'create_invoice', primaryActionLabel: 'Create Invoice' });
 */
function createEmptyState(opts) {
  return Object.freeze({
    message:              opts.message,
    messageHe:            opts.messageHe || null,
    icon:                 opts.icon || null,
    primaryAction:        opts.primaryAction || null,
    primaryActionLabel:   opts.primaryActionLabel || null,
    primaryActionLabelHe: opts.primaryActionLabelHe || null,
    primaryActionIcon:    opts.primaryActionIcon || null,
  });
}

/* ═══════════════════════════════════════════════════════════════
 *  NEXT BEST ACTION ENGINE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} NextBestAction
 * @property {string} action   - Action identifier matching orchestrator action IDs.
 * @property {string} label    - English label for the action button.
 * @property {string} labelHe  - Hebrew label for the action button.
 * @property {string} endpoint - API endpoint to execute the action.
 * @property {string} method   - HTTP method (POST, PUT, PATCH).
 * @property {string} icon     - Icon/emoji for the button.
 * @property {number} priority - Priority weight (1 = highest).
 */

/**
 * Next-best-action rule definitions per entity type.
 * Each rule is tried in order; the first match wins.
 *
 * @private
 * @type {Object<string, Array<{ condition: Function, action: NextBestAction }>>}
 */
const _NBA_RULES = {

  /* ── Customer ────────────────────────────────────────────── */
  Customer: [
    {
      condition: function (e) { return e.status === 'prospect' || e.status === 'Active' && (!e.open_quotes || e.open_quotes === 0); },
      action: { action: 'create_quote', label: 'Create Quote', labelHe: 'צור הצעת מחיר', endpoint: '/api/quotes', method: 'POST', icon: '📋', priority: 1 },
    },
    {
      condition: function (e) { return e.open_balance > 0; },
      action: { action: 'send_reminder', label: 'Send Payment Reminder', labelHe: 'שלח תזכורת תשלום', endpoint: '/api/customers/{id}/remind', method: 'POST', icon: '🔔', priority: 2 },
    },
    {
      condition: function (e) { return e.status === 'Active' && e.total_revenue > 0; },
      action: { action: 'create_project', label: 'Create Project', labelHe: 'צור פרויקט', endpoint: '/api/projects', method: 'POST', icon: '📁', priority: 3 },
    },
    {
      condition: function () { return true; },
      action: { action: 'add_note', label: 'Add Note', labelHe: 'הוסף הערה', endpoint: '/api/customers/{id}/notes', method: 'POST', icon: '📝', priority: 5 },
    },
  ],

  /* ── Supplier ────────────────────────────────────────────── */
  Supplier: [
    {
      condition: function (e) { return e.status === 'Active' && (!e.open_rfqs || e.open_rfqs === 0); },
      action: { action: 'send_rfq', label: 'Send RFQ', labelHe: 'שלח בקשת הצעה', endpoint: '/api/rfqs', method: 'POST', icon: '📨', priority: 1 },
    },
    {
      condition: function (e) { return e.pending_invoices > 0; },
      action: { action: 'register_supplier_invoice', label: 'Register Invoice', labelHe: 'רשום חשבונית ספק', endpoint: '/api/supplier-invoices', method: 'POST', icon: '💰', priority: 2 },
    },
    {
      condition: function (e) { return e.status === 'Review' || e.overall_score < 60; },
      action: { action: 'view_score', label: 'Review Performance', labelHe: 'בדוק ביצועים', endpoint: '/api/suppliers/{id}/score', method: 'GET', icon: '📊', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Active'; },
      action: { action: 'create_po', label: 'Create PO', labelHe: 'צור הזמנת רכש', endpoint: '/api/purchase-orders', method: 'POST', icon: '🛒', priority: 3 },
    },
    {
      condition: function () { return true; },
      action: { action: 'add_document', label: 'Upload Document', labelHe: 'הוסף מסמך', endpoint: '/api/suppliers/{id}/documents', method: 'POST', icon: '📎', priority: 5 },
    },
  ],

  /* ── Quote ───────────────────────────────────────────────── */
  Quote: [
    {
      condition: function (e) { return e.status === 'Draft'; },
      action: { action: 'send', label: 'Send to Customer', labelHe: 'שלח ללקוח', endpoint: '/api/quotes/{id}/send', method: 'POST', icon: '📤', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Sent' || e.status === 'UnderReview'; },
      action: { action: 'approve', label: 'Approve Quote', labelHe: 'אשר הצעה', endpoint: '/api/quotes/{id}/approve', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Approved'; },
      action: { action: 'convert_to_project', label: 'Convert to Project', labelHe: 'המר לפרויקט', endpoint: '/api/quotes/{id}/convert', method: 'POST', icon: '📁', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Approved' && !e.has_contract; },
      action: { action: 'generate_contract', label: 'Generate Contract', labelHe: 'צור חוזה', endpoint: '/api/quotes/{id}/contract', method: 'POST', icon: '📄', priority: 2 },
    },
    {
      condition: function () { return true; },
      action: { action: 'edit', label: 'Edit Quote', labelHe: 'ערוך הצעה', endpoint: '/api/quotes/{id}', method: 'PUT', icon: '✏️', priority: 5 },
    },
  ],

  /* ── RFQ ─────────────────────────────────────────────────── */
  RFQ: [
    {
      condition: function (e) { return e.status === 'Draft'; },
      action: { action: 'send_to_suppliers', label: 'Send to Suppliers', labelHe: 'שלח לספקים', endpoint: '/api/rfqs/{id}/send', method: 'POST', icon: '📤', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Sent'; },
      action: { action: 'compare_quotes', label: 'Compare Responses', labelHe: 'השווה הצעות', endpoint: '/api/rfqs/{id}/compare', method: 'GET', icon: '⚖️', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'QuotesReceived' || e.status === 'UnderComparison'; },
      action: { action: 'approve', label: 'Approve Selection', labelHe: 'אשר בחירה', endpoint: '/api/rfqs/{id}/approve', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Approved'; },
      action: { action: 'convert_to_po', label: 'Create PO', labelHe: 'צור הזמנת רכש', endpoint: '/api/rfqs/{id}/convert-to-po', method: 'POST', icon: '🛒', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'add_supplier', label: 'Add Supplier', labelHe: 'הוסף ספק', endpoint: '/api/rfqs/{id}/suppliers', method: 'POST', icon: '🏭', priority: 4 },
    },
  ],

  /* ── Purchase Order ──────────────────────────────────────── */
  PO: [
    {
      condition: function (e) { return e.status === 'Draft'; },
      action: { action: 'approve', label: 'Submit for Approval', labelHe: 'שלח לאישור', endpoint: '/api/purchase-orders/{id}/approve', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'PendingApproval'; },
      action: { action: 'approve', label: 'Approve PO', labelHe: 'אשר הזמנה', endpoint: '/api/purchase-orders/{id}/approve', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Approved'; },
      action: { action: 'send_to_supplier', label: 'Send to Supplier', labelHe: 'שלח לספק', endpoint: '/api/purchase-orders/{id}/send', method: 'POST', icon: '📤', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'SentToSupplier' || e.status === 'PartiallyReceived'; },
      action: { action: 'receive_items', label: 'Receive Goods', labelHe: 'קבלת סחורה', endpoint: '/api/purchase-orders/{id}/receive', method: 'POST', icon: '📦', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'FullyReceived'; },
      action: { action: 'close', label: 'Close PO', labelHe: 'סגור הזמנה', endpoint: '/api/purchase-orders/{id}/close', method: 'POST', icon: '🔒', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'edit', label: 'Edit PO', labelHe: 'ערוך הזמנה', endpoint: '/api/purchase-orders/{id}', method: 'PUT', icon: '✏️', priority: 5 },
    },
  ],

  /* ── Project ─────────────────────────────────────────────── */
  Project: [
    {
      condition: function (e) { return e.status === 'Draft'; },
      action: { action: 'start_planning', label: 'Start Planning', labelHe: 'התחל תכנון', endpoint: '/api/projects/{id}/transition', method: 'POST', icon: '📐', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Approved' || e.status === 'InPlanning'; },
      action: { action: 'start_procurement', label: 'Start Procurement', labelHe: 'התחל רכש', endpoint: '/api/projects/{id}/transition', method: 'POST', icon: '🛒', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InProcurement'; },
      action: { action: 'start_execution', label: 'Start Execution', labelHe: 'התחל ביצוע', endpoint: '/api/projects/{id}/transition', method: 'POST', icon: '🏗️', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InExecution'; },
      action: { action: 'create_work_order', label: 'Create Work Order', labelHe: 'צור הזמנת עבודה', endpoint: '/api/work-orders', method: 'POST', icon: '🔧', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InExecution' && e.progress >= 90; },
      action: { action: 'start_delivery', label: 'Start Delivery', labelHe: 'התחל אספקה', endpoint: '/api/projects/{id}/transition', method: 'POST', icon: '🚚', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InDelivery'; },
      action: { action: 'complete', label: 'Mark Completed', labelHe: 'סמן כהושלם', endpoint: '/api/projects/{id}/transition', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Completed'; },
      action: { action: 'close', label: 'Close Project', labelHe: 'סגור פרויקט', endpoint: '/api/projects/{id}/close', method: 'POST', icon: '🔒', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'view_financials', label: 'View Financials', labelHe: 'דוח כספי', endpoint: '/api/projects/{id}/financials', method: 'GET', icon: '📊', priority: 4 },
    },
  ],

  /* ── Work Order ──────────────────────────────────────────── */
  WorkOrder: [
    {
      condition: function (e) { return e.status === 'Open'; },
      action: { action: 'assign', label: 'Assign Workers', labelHe: 'שבץ עובדים', endpoint: '/api/work-orders/{id}/assign', method: 'POST', icon: '👷', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Assigned'; },
      action: { action: 'start', label: 'Start Work', labelHe: 'התחל ביצוע', endpoint: '/api/work-orders/{id}/start', method: 'POST', icon: '▶️', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'WaitingMaterials'; },
      action: { action: 'reserve_materials', label: 'Reserve Materials', labelHe: 'הזמן חומרים', endpoint: '/api/work-orders/{id}/materials', method: 'POST', icon: '📦', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InProgress'; },
      action: { action: 'qa', label: 'QA Check', labelHe: 'בדיקת איכות', endpoint: '/api/work-orders/{id}/qa', method: 'POST', icon: '🔍', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'QA'; },
      action: { action: 'complete', label: 'Complete', labelHe: 'סמן כהושלם', endpoint: '/api/work-orders/{id}/complete', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Completed'; },
      action: { action: 'signoff', label: 'Sign Off', labelHe: 'חתימה וסגירה', endpoint: '/api/work-orders/{id}/signoff', method: 'POST', icon: '✍️', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'update_progress', label: 'Update Progress', labelHe: 'עדכן התקדמות', endpoint: '/api/work-orders/{id}/progress', method: 'PATCH', icon: '📊', priority: 4 },
    },
  ],

  /* ── Invoice ─────────────────────────────────────────────── */
  Invoice: [
    {
      condition: function (e) { return e.status === 'Draft'; },
      action: { action: 'issue', label: 'Issue Invoice', labelHe: 'הנפק חשבונית', endpoint: '/api/invoices/{id}/issue', method: 'POST', icon: '📤', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Issued'; },
      action: { action: 'send', label: 'Send to Customer', labelHe: 'שלח ללקוח', endpoint: '/api/invoices/{id}/send', method: 'POST', icon: '✉️', priority: 1 },
    },
    {
      condition: function (e) { return (e.status === 'Issued' || e.status === 'Sent' || e.status === 'PartiallyPaid') && e.amount_outstanding > 0; },
      action: { action: 'register_payment', label: 'Register Payment', labelHe: 'רשום תשלום', endpoint: '/api/invoices/{id}/payments', method: 'POST', icon: '💳', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Overdue'; },
      action: { action: 'send_reminder', label: 'Send Reminder', labelHe: 'שלח תזכורת', endpoint: '/api/invoices/{id}/remind', method: 'POST', icon: '🔔', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Overdue' && e.days_overdue > 30; },
      action: { action: 'move_collections', label: 'Move to Collections', labelHe: 'העבר לגביה', endpoint: '/api/invoices/{id}/collections', method: 'POST', icon: '⚠️', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'export_pdf', label: 'Export PDF', labelHe: 'ייצוא PDF', endpoint: '/api/invoices/{id}/pdf', method: 'GET', icon: '📥', priority: 5 },
    },
  ],

  /* ── Employee ────────────────────────────────────────────── */
  Employee: [
    {
      condition: function (e) { return e.status === 'Active' && e.missing_attendance; },
      action: { action: 'track_time', label: 'Log Attendance', labelHe: 'רשום שעות', endpoint: '/api/attendance', method: 'POST', icon: '⏰', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Active' && e.pending_payroll; },
      action: { action: 'calculate_payroll', label: 'Calculate Payroll', labelHe: 'חשב שכר', endpoint: '/api/payroll/calculate', method: 'POST', icon: '💰', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Active' && e.unassigned; },
      action: { action: 'assign_to_work', label: 'Assign to Work', labelHe: 'שבץ לעבודה', endpoint: '/api/work-orders/{id}/assign', method: 'POST', icon: '🔧', priority: 2 },
    },
    {
      condition: function (e) { return e.status === 'Active' && e.pending_expenses > 0; },
      action: { action: 'reimburse_expense', label: 'Reimburse Expense', labelHe: 'החזר הוצאה', endpoint: '/api/expenses/{id}/reimburse', method: 'POST', icon: '🧾', priority: 2 },
    },
    {
      condition: function (e) { return e.status === 'Active'; },
      action: { action: 'view_attendance', label: 'View Attendance', labelHe: 'צפה בנוכחות', endpoint: '/api/employees/{id}/attendance', method: 'GET', icon: '⏰', priority: 4 },
    },
    {
      condition: function () { return true; },
      action: { action: 'edit', label: 'Edit Employee', labelHe: 'ערוך עובד', endpoint: '/api/employees/{id}', method: 'PUT', icon: '✏️', priority: 5 },
    },
  ],

  /* ── Alert ───────────────────────────────────────────────── */
  Alert: [
    {
      condition: function (e) { return e.status === 'New'; },
      action: { action: 'acknowledge', label: 'Acknowledge', labelHe: 'אשר קבלה', endpoint: '/api/alerts/{id}/acknowledge', method: 'POST', icon: '👁️', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Acknowledged'; },
      action: { action: 'assign', label: 'Assign Handler', labelHe: 'שבץ לטיפול', endpoint: '/api/alerts/{id}/assign', method: 'POST', icon: '👷', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'InProgress' || e.status === 'Assigned'; },
      action: { action: 'resolve', label: 'Resolve', labelHe: 'פתור', endpoint: '/api/alerts/{id}/resolve', method: 'POST', icon: '✅', priority: 1 },
    },
    {
      condition: function (e) { return e.status === 'Reopened'; },
      action: { action: 'assign', label: 'Re-assign', labelHe: 'שבץ מחדש', endpoint: '/api/alerts/{id}/assign', method: 'POST', icon: '👷', priority: 1 },
    },
    {
      condition: function () { return true; },
      action: { action: 'add_note', label: 'Add Note', labelHe: 'הוסף הערה', endpoint: '/api/alerts/{id}/notes', method: 'POST', icon: '📝', priority: 5 },
    },
  ],
};

/**
 * Compute the next best action for an entity based on its current state.
 *
 * Evaluates rules in priority order for the given entity type.
 * The first matching rule's action is returned. If no rules match,
 * a generic fallback is returned.
 *
 * Supported entity types:
 *   Customer, Supplier, Quote, RFQ, PO, Project, WorkOrder,
 *   Invoice, Employee, Alert
 *
 * @param {string} entityType - One of the supported entity type names.
 * @param {Object} entity     - The entity record (must have at least `status`).
 * @returns {NextBestAction|null} The recommended next action, or null if no rules exist.
 *
 * @example
 *   const nba = computeNextBestAction('Quote', { status: 'Draft' });
 *   // => { action: 'send', label: 'Send to Customer', labelHe: 'שלח ללקוח', endpoint: '/api/quotes/{id}/send', method: 'POST', icon: '📤', priority: 1 }
 *
 *   const nba2 = computeNextBestAction('Invoice', { status: 'Overdue', days_overdue: 45, amount_outstanding: 10000 });
 *   // => { action: 'move_collections', label: 'Move to Collections', ... }
 */
function computeNextBestAction(entityType, entity) {
  // Normalize common aliases
  var typeKey = entityType;
  if (typeKey === 'PurchaseOrder') { typeKey = 'PO'; }

  var rules = _NBA_RULES[typeKey];
  if (!rules) { return null; }

  for (var i = 0; i < rules.length; i++) {
    try {
      if (rules[i].condition(entity || {})) {
        return Object.freeze(Object.assign({}, rules[i].action));
      }
    } catch (_err) {
      // Skip rules that error on missing fields
      continue;
    }
  }

  return null;
}

/**
 * Get all available next-best-actions for an entity (not just the top one).
 *
 * @param {string} entityType - Entity type name.
 * @param {Object} entity     - Entity record.
 * @returns {Array<NextBestAction>} All matching actions sorted by priority.
 */
function computeAllActions(entityType, entity) {
  var typeKey = entityType;
  if (typeKey === 'PurchaseOrder') { typeKey = 'PO'; }

  var rules = _NBA_RULES[typeKey];
  if (!rules) { return []; }

  var matches = [];
  for (var i = 0; i < rules.length; i++) {
    try {
      if (rules[i].condition(entity || {})) {
        matches.push(Object.freeze(Object.assign({}, rules[i].action)));
      }
    } catch (_err) {
      continue;
    }
  }

  matches.sort(function (a, b) { return a.priority - b.priority; });
  return matches;
}

/* ═══════════════════════════════════════════════════════════════
 *  ACTION BAR BUILDER
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Build the action bar configuration for a 360 page.
 * Combines the next-best-action (highlighted primary) with all available actions.
 *
 * @param {string} entityType
 * @param {Object} entity
 * @returns {Object} `{ primary: NextBestAction|null, secondary: NextBestAction[] }`
 */
function buildActionBar(entityType, entity) {
  var all = computeAllActions(entityType, entity);
  return {
    primary:   all.length > 0 ? all[0] : null,
    secondary: all.slice(1),
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

module.exports = {
  // Badge
  STATE_BADGE_VARIANTS: STATE_BADGE_VARIANTS,
  SUCCESS_STATES:       SUCCESS_STATES,
  WARNING_STATES:       WARNING_STATES,
  DANGER_STATES:        DANGER_STATES,
  INFO_STATES:          INFO_STATES,
  getStateBadgeVariant: getStateBadgeVariant,
  getStateBadgeColor:   getStateBadgeColor,

  // Summary card
  createSummaryCardData: createSummaryCardData,

  // Empty state
  createEmptyState: createEmptyState,

  // Next best action
  computeNextBestAction: computeNextBestAction,
  computeAllActions:     computeAllActions,
  buildActionBar:        buildActionBar,
};
