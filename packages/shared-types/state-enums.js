'use strict';

/**
 * @module state-enums
 * @description Canonical state / status enumerations for every state machine
 * in the Techno-Kol Uzi ERP 2026 system.
 *
 * Each enum is a frozen object whose keys AND values are identical strings.
 * This makes comparisons obvious in code:
 *
 *   if (lead.state === LEAD_STATES.Qualified) { ... }
 *
 * The enums here are the single source of truth consumed by:
 *   - `state-machines.js`  (transition definitions)
 *   - `orchestrator.js`    (precondition / effect guards)
 *   - Every 360 page       (status badges, available actions)
 *   - Audit logs            (from/to state recording)
 *
 * @example
 *   const { LEAD_STATES, QUOTE_STATES } = require('@techno-kol/shared-types/state-enums');
 */

/* ────────────────────────────────────────────────────────────────
 *  Helper — builds a frozen enum where key === value
 * ──────────────────────────────────────────────────────────────── */

/**
 * Create a frozen enum object from a list of string values.
 * @param {string[]} values
 * @returns {Readonly<Record<string, string>>}
 */
function _enum(values) {
  const obj = {};
  for (const v of values) {
    obj[v] = v;
  }
  return Object.freeze(obj);
}

/* ═══════════════════════════════════════════════════════════════
 *  COMMERCIAL
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Lead lifecycle states.
 * Flow: New -> Contacted -> Qualified -> Quoted -> Won/Lost -> Converted
 * @readonly
 * @enum {string}
 */
const LEAD_STATES = _enum([
  'New',
  'Contacted',
  'Qualified',
  'Quoted',
  'Won',
  'Converted',
  'Lost',
]);

/**
 * Quote lifecycle states.
 * Flow: Draft -> Sent -> UnderReview -> Approved/Rejected -> ConvertedToProject
 * @readonly
 * @enum {string}
 */
const QUOTE_STATES = _enum([
  'Draft',
  'Sent',
  'UnderReview',
  'Approved',
  'Rejected',
  'ConvertedToProject',
]);

/**
 * Customer account statuses.
 * @readonly
 * @enum {string}
 */
const CUSTOMER_STATUSES = _enum([
  'Active',
  'Inactive',
  'Blocked',
]);

/* ═══════════════════════════════════════════════════════════════
 *  PROCUREMENT
 * ═══════════════════════════════════════════════════════════════ */

/**
 * RFQ (Request for Quotation) lifecycle states.
 * Flow: Draft -> Sent -> QuotesReceived -> UnderComparison -> Approved/Rejected -> ConvertedToPO
 * @readonly
 * @enum {string}
 */
const RFQ_STATES = _enum([
  'Draft',
  'Sent',
  'QuotesReceived',
  'UnderComparison',
  'Approved',
  'Rejected',
  'ConvertedToPO',
]);

/**
 * Purchase Order lifecycle states.
 * Flow: Draft -> PendingApproval -> Approved -> SentToSupplier ->
 *       PartiallyReceived -> FullyReceived -> Closed / Cancelled
 * @readonly
 * @enum {string}
 */
const PO_STATES = _enum([
  'Draft',
  'PendingApproval',
  'Approved',
  'SentToSupplier',
  'PartiallyReceived',
  'FullyReceived',
  'Closed',
  'Cancelled',
]);

/**
 * Supplier account statuses.
 * @readonly
 * @enum {string}
 */
const SUPPLIER_STATUSES = _enum([
  'Active',
  'Review',
  'Blocked',
  'Inactive',
]);

/* ═══════════════════════════════════════════════════════════════
 *  EXECUTION
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Project lifecycle states.
 * Flow: Draft -> Approved -> InPlanning -> InProcurement -> InExecution ->
 *       InDelivery -> Completed -> Closed / Cancelled
 * @readonly
 * @enum {string}
 */
const PROJECT_STATES = _enum([
  'Draft',
  'Approved',
  'InPlanning',
  'InProcurement',
  'InExecution',
  'InDelivery',
  'Completed',
  'Closed',
  'Cancelled',
]);

/**
 * Work Order lifecycle states.
 * Flow: Open -> Assigned -> WaitingMaterials -> InProgress -> QA ->
 *       Completed -> SignedOff / Cancelled
 * @readonly
 * @enum {string}
 */
const WORK_ORDER_STATES = _enum([
  'Open',
  'Assigned',
  'WaitingMaterials',
  'InProgress',
  'QA',
  'Completed',
  'SignedOff',
  'Cancelled',
]);

/**
 * Task lifecycle states.
 * Flow: Open -> Assigned -> InProgress -> Completed / Cancelled
 * @readonly
 * @enum {string}
 */
const TASK_STATES = _enum([
  'Open',
  'Assigned',
  'InProgress',
  'Completed',
  'Cancelled',
]);

/* ═══════════════════════════════════════════════════════════════
 *  FINANCE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Invoice lifecycle states.
 * Flow: Draft -> Issued -> PartiallyPaid -> Paid / Overdue / Cancelled
 * @readonly
 * @enum {string}
 */
const INVOICE_STATES = _enum([
  'Draft',
  'Issued',
  'PartiallyPaid',
  'Paid',
  'Overdue',
  'Cancelled',
]);

/**
 * Payment lifecycle states.
 * Flow: Draft -> Posted -> Reconciled / Reversed
 * @readonly
 * @enum {string}
 */
const PAYMENT_STATES = _enum([
  'Draft',
  'Posted',
  'Reconciled',
  'Reversed',
]);

/* ═══════════════════════════════════════════════════════════════
 *  WORKFORCE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Payroll run lifecycle states.
 * Flow: Draft -> Calculated -> Approved -> Exported -> Paid / Cancelled
 * @readonly
 * @enum {string}
 */
const PAYROLL_STATES = _enum([
  'Draft',
  'Calculated',
  'Approved',
  'Exported',
  'Paid',
  'Cancelled',
]);

/**
 * Attendance record lifecycle states.
 * Flow: Draft -> Submitted -> Approved / Rejected
 * @readonly
 * @enum {string}
 */
const ATTENDANCE_STATES = _enum([
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
]);

/**
 * Employee account statuses.
 * @readonly
 * @enum {string}
 */
const EMPLOYEE_STATUSES = _enum([
  'Active',
  'OnLeave',
  'Terminated',
]);

/* ═══════════════════════════════════════════════════════════════
 *  GOVERNANCE
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Alert lifecycle states.
 * Flow: New -> Acknowledged -> InProgress -> Resolved / Reopened
 * @readonly
 * @enum {string}
 */
const ALERT_STATES = _enum([
  'New',
  'Acknowledged',
  'InProgress',
  'Resolved',
  'Reopened',
]);

/**
 * Document lifecycle statuses.
 * @readonly
 * @enum {string}
 */
const DOCUMENT_STATUSES = _enum([
  'Draft',
  'Active',
  'Archived',
]);

/* ═══════════════════════════════════════════════════════════════
 *  AGGREGATE EXPORTS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Map of entity type key -> its state/status enum, for dynamic lookup.
 * @readonly
 */
const STATE_ENUM_MAP = Object.freeze({
  Lead:          LEAD_STATES,
  Quote:         QUOTE_STATES,
  Customer:      CUSTOMER_STATUSES,
  RFQ:           RFQ_STATES,
  PurchaseOrder: PO_STATES,
  Supplier:      SUPPLIER_STATUSES,
  Project:       PROJECT_STATES,
  WorkOrder:     WORK_ORDER_STATES,
  Task:          TASK_STATES,
  Invoice:       INVOICE_STATES,
  Payment:       PAYMENT_STATES,
  PayrollRun:    PAYROLL_STATES,
  Attendance:    ATTENDANCE_STATES,
  Employee:      EMPLOYEE_STATUSES,
  Alert:         ALERT_STATES,
  Document:      DOCUMENT_STATUSES,
});

module.exports = {
  // State machines (lifecycle)
  LEAD_STATES,
  QUOTE_STATES,
  RFQ_STATES,
  PO_STATES,
  PROJECT_STATES,
  WORK_ORDER_STATES,
  INVOICE_STATES,
  PAYMENT_STATES,
  PAYROLL_STATES,
  ATTENDANCE_STATES,
  TASK_STATES,
  ALERT_STATES,

  // Status enums (simpler — no transition graph)
  CUSTOMER_STATUSES,
  SUPPLIER_STATUSES,
  EMPLOYEE_STATUSES,
  DOCUMENT_STATUSES,

  // Lookup helper
  STATE_ENUM_MAP,
};
