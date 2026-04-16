'use strict';

/**
 * @module event-types
 * @description Canonical domain event name registry for the Techno-Kol Uzi ERP 2026
 * event-driven architecture.
 *
 * Every event that flows through the system bus — whether emitted by the
 * orchestrator, state machines, or service-level business logic — MUST be
 * declared here. Raw strings are forbidden in production code; import
 * constants from this module instead.
 *
 * Events follow the naming convention: `<entity>.<past_tense_verb>`
 *   e.g. `lead.created`, `po.fully_received`, `anomaly.detected`
 *
 * Organised into 8 topic groups mirroring the service domains.
 *
 * @example
 *   const { COMMERCIAL_EVENTS, ALL_EVENTS } = require('@techno-kol/shared-types/event-types');
 *   bus.emit(COMMERCIAL_EVENTS.LEAD_CREATED, payload);
 */

/* ────────────────────────────────────────────────────────────────
 *  Helper — freeze a plain object recursively (one level deep)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Freeze an object of string constants.
 * @param {Record<string, string>} obj
 * @returns {Readonly<Record<string, string>>}
 */
function _freeze(obj) {
  return Object.freeze(obj);
}

/* ═══════════════════════════════════════════════════════════════
 *  COMMERCIAL EVENTS
 *  Covers: Lead, Quote, Customer
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const COMMERCIAL_EVENTS = _freeze({
  LEAD_CREATED:                'lead.created',
  LEAD_QUALIFIED:              'lead.qualified',
  LEAD_CONVERTED_TO_CUSTOMER:  'lead.converted_to_customer',
  LEAD_LOST:                   'lead.lost',

  QUOTE_CREATED:               'quote.created',
  QUOTE_SENT:                  'quote.sent',
  QUOTE_APPROVED:              'quote.approved',
  QUOTE_REJECTED:              'quote.rejected',
  QUOTE_CONVERTED_TO_PROJECT:  'quote.converted_to_project',

  CUSTOMER_CREATED:            'customer.created',
  CUSTOMER_UPDATED:            'customer.updated',
});

/* ═══════════════════════════════════════════════════════════════
 *  PROCUREMENT EVENTS
 *  Covers: RFQ, PurchaseOrder, Supplier
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const PROCUREMENT_EVENTS = _freeze({
  RFQ_CREATED:            'rfq.created',
  RFQ_SENT:               'rfq.sent',
  RFQ_QUOTES_RECEIVED:    'rfq.quotes_received',
  RFQ_APPROVED:           'rfq.approved',
  RFQ_REJECTED:           'rfq.rejected',
  RFQ_CONVERTED_TO_PO:    'rfq.converted_to_po',

  PO_CREATED:             'po.created',
  PO_APPROVAL_REQUESTED:  'po.approval_requested',
  PO_APPROVED:            'po.approved',
  PO_REJECTED:            'po.rejected',
  PO_SENT:                'po.sent',
  PO_PARTIALLY_RECEIVED:  'po.partially_received',
  PO_FULLY_RECEIVED:      'po.fully_received',
  PO_CLOSED:              'po.closed',

  SUPPLIER_CREATED:       'supplier.created',
  SUPPLIER_UPDATED:       'supplier.updated',
  SUPPLIER_BLOCKED:       'supplier.blocked',
});

/* ═══════════════════════════════════════════════════════════════
 *  EXECUTION EVENTS
 *  Covers: Project, WorkOrder, Task, Material
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const EXECUTION_EVENTS = _freeze({
  PROJECT_CREATED:             'project.created',
  PROJECT_CREATED_FROM_QUOTE:  'project.created_from_quote',
  PROJECT_STATE_CHANGED:       'project.state_changed',
  PROJECT_BLOCKED:             'project.blocked',
  PROJECT_COMPLETED:           'project.completed',
  PROJECT_CLOSED:              'project.closed',

  WORKORDER_CREATED:           'workorder.created',
  WORKORDER_ASSIGNED:          'workorder.assigned',
  WORKORDER_STARTED:           'workorder.started',
  WORKORDER_PROGRESS_UPDATED:  'workorder.progress_updated',
  WORKORDER_COMPLETED:         'workorder.completed',
  WORKORDER_SIGNED_OFF:        'workorder.signed_off',

  TASK_CREATED:                'task.created',
  TASK_ASSIGNED:               'task.assigned',
  TASK_COMPLETED:              'task.completed',
  TASK_ESCALATED:              'task.escalated',

  MATERIAL_REQUESTED:          'material.requested',
});

/* ═══════════════════════════════════════════════════════════════
 *  INVENTORY EVENTS
 *  Covers: Inventory movements, reservations, counts
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const INVENTORY_EVENTS = _freeze({
  INVENTORY_RECEIVED_FROM_PO:   'inventory.received_from_po',
  INVENTORY_ISSUED:             'inventory.issued',
  INVENTORY_RESERVED:           'inventory.reserved',
  INVENTORY_TRANSFERRED:        'inventory.transferred',
  INVENTORY_SHORTAGE_DETECTED:  'inventory.shortage_detected',
  INVENTORY_COUNT_ADJUSTED:     'inventory.count_adjusted',
});

/* ═══════════════════════════════════════════════════════════════
 *  FINANCE EVENTS
 *  Covers: Invoice, Payment, Collection, GL, VAT, Tax, Cashflow, Costing
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const FINANCE_EVENTS = _freeze({
  INVOICE_CREATED:        'invoice.created',
  INVOICE_ISSUED:         'invoice.issued',
  INVOICE_OVERDUE:        'invoice.overdue',
  INVOICE_CANCELLED:      'invoice.cancelled',

  PAYMENT_REGISTERED:     'payment.registered',
  PAYMENT_RECONCILED:     'payment.reconciled',
  PAYMENT_REVERSED:       'payment.reversed',

  COLLECTION_CASE_OPENED: 'collection.case_opened',

  GL_TRANSACTION_POSTED:  'gl.transaction_posted',
  VAT_RECORDED:           'vat.recorded',
  TAX_EXPORTED:           'tax.exported',
  CASHFLOW_UPDATED:       'cashflow.updated',
  COSTING_UPDATED:        'costing.updated',
});

/* ═══════════════════════════════════════════════════════════════
 *  WORKFORCE EVENTS
 *  Covers: Employee, Attendance, Payroll
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const WORKFORCE_EVENTS = _freeze({
  EMPLOYEE_CREATED:       'employee.created',
  EMPLOYEE_UPDATED:       'employee.updated',
  EMPLOYEE_TERMINATED:    'employee.terminated',

  ATTENDANCE_SUBMITTED:   'attendance.submitted',
  ATTENDANCE_APPROVED:    'attendance.approved',
  ATTENDANCE_REJECTED:    'attendance.rejected',

  PAYROLL_CALCULATED:     'payroll.calculated',
  PAYROLL_APPROVED:       'payroll.approved',
  PAYROLL_EXPORTED:       'payroll.exported',
  PAYROLL_PAID:           'payroll.paid',
});

/* ═══════════════════════════════════════════════════════════════
 *  GOVERNANCE EVENTS
 *  Covers: Alert, Audit, Document
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const GOVERNANCE_EVENTS = _freeze({
  ALERT_CREATED:          'alert.created',
  ALERT_ACKNOWLEDGED:     'alert.acknowledged',
  ALERT_RESOLVED:         'alert.resolved',
  ALERT_REOPENED:         'alert.reopened',

  AUDIT_RECORDED:         'audit.recorded',

  DOCUMENT_UPLOADED:      'document.uploaded',
  DOCUMENT_CLASSIFIED:    'document.classified',
  DOCUMENT_OCR_COMPLETED: 'document.ocr_completed',
  DOCUMENT_SIGNED:        'document.signed',
});

/* ═══════════════════════════════════════════════════════════════
 *  AI & INTELLIGENCE EVENTS
 *  Covers: Signals, Insights, Anomalies, Forecasts
 * ═══════════════════════════════════════════════════════════════ */

/** @readonly @enum {string} */
const AI_EVENTS = _freeze({
  AI_SIGNAL_INGESTED:           'ai.signal.ingested',
  AI_INSIGHT_GENERATED:         'ai.insight.generated',
  AI_INSIGHT_ACKNOWLEDGED:      'ai.insight.acknowledged',
  AI_RECOMMENDATION_GENERATED:  'ai.recommendation.generated',

  ANOMALY_DETECTED:             'anomaly.detected',
  ANOMALY_CONFIRMED:            'anomaly.confirmed',
  ANOMALY_DISMISSED:            'anomaly.dismissed',
  ANOMALY_CONVERTED_TO_ALERT:   'anomaly.converted_to_alert',

  FORECAST_GENERATED:           'forecast.generated',
  FORECAST_PUBLISHED:           'forecast.published',
});

/* ═══════════════════════════════════════════════════════════════
 *  AGGREGATE MAPS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Topic name -> event enum mapping.
 * Useful for subscribing to all events within a domain.
 * @readonly
 */
const EVENT_TOPICS = Object.freeze({
  COMMERCIAL:  COMMERCIAL_EVENTS,
  PROCUREMENT: PROCUREMENT_EVENTS,
  EXECUTION:   EXECUTION_EVENTS,
  INVENTORY:   INVENTORY_EVENTS,
  FINANCE:     FINANCE_EVENTS,
  WORKFORCE:   WORKFORCE_EVENTS,
  GOVERNANCE:  GOVERNANCE_EVENTS,
  AI:          AI_EVENTS,
});

/**
 * Flat object merging every event constant from all topics.
 * Provides a single namespace for code that doesn't care about topic grouping.
 *
 * @readonly
 * @type {Readonly<Record<string, string>>}
 */
const ALL_EVENTS = Object.freeze(
  Object.assign(
    {},
    COMMERCIAL_EVENTS,
    PROCUREMENT_EVENTS,
    EXECUTION_EVENTS,
    INVENTORY_EVENTS,
    FINANCE_EVENTS,
    WORKFORCE_EVENTS,
    GOVERNANCE_EVENTS,
    AI_EVENTS,
  ),
);

/**
 * Array of every event name string for validation.
 * @readonly
 * @type {string[]}
 */
const ALL_EVENT_NAMES = Object.freeze(Object.values(ALL_EVENTS));

/**
 * Check whether a string is a recognised domain event name.
 * @param {string} name
 * @returns {boolean}
 */
function isValidEventName(name) {
  return ALL_EVENT_NAMES.includes(name);
}

module.exports = {
  // Topic groups
  COMMERCIAL_EVENTS,
  PROCUREMENT_EVENTS,
  EXECUTION_EVENTS,
  INVENTORY_EVENTS,
  FINANCE_EVENTS,
  WORKFORCE_EVENTS,
  GOVERNANCE_EVENTS,
  AI_EVENTS,

  // Aggregates
  EVENT_TOPICS,
  ALL_EVENTS,
  ALL_EVENT_NAMES,

  // Validation
  isValidEventName,
};
