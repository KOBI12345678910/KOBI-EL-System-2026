'use strict';

/**
 * @module shared-events/topic-map
 * @description Complete topic catalog for the Techno-Kol Uzi event bus.
 *
 * Every topic maps to an array of valid event names that may be emitted on it.
 * The module exposes helpers for reverse-lookup, validation, and enumeration.
 */

/**
 * Master topic-to-events map.
 * Keys are topic names; values are arrays of valid event names for that topic.
 * @type {Object<string, string[]>}
 */
const TOPIC_MAP = Object.freeze({
  // ── Commercial ──────────────────────────────────────────────────────────
  'commercial.leads': [
    'lead.created',
    'lead.updated',
    'lead.qualified',
    'lead.disqualified',
    'lead.converted',
    'lead.assigned',
    'lead.contacted',
    'lead.scored',
    'lead.archived',
  ],
  'commercial.quotes': [
    'quote.created',
    'quote.updated',
    'quote.submitted',
    'quote.approved',
    'quote.rejected',
    'quote.revised',
    'quote.expired',
    'quote.accepted',
    'quote.converted_to_order',
    'quote.cancelled',
  ],
  'commercial.customers': [
    'customer.created',
    'customer.updated',
    'customer.activated',
    'customer.deactivated',
    'customer.credit_updated',
    'customer.merged',
    'customer.archived',
    'customer.contact_added',
    'customer.contact_removed',
  ],

  // ── Procurement ─────────────────────────────────────────────────────────
  'procurement.rfq': [
    'rfq.created',
    'rfq.updated',
    'rfq.sent',
    'rfq.response_received',
    'rfq.evaluated',
    'rfq.awarded',
    'rfq.cancelled',
    'rfq.expired',
    'rfq.closed',
  ],
  'procurement.po': [
    'po.created',
    'po.updated',
    'po.submitted',
    'po.approved',
    'po.rejected',
    'po.sent_to_supplier',
    'po.acknowledged',
    'po.partially_received',
    'po.fully_received',
    'po.cancelled',
    'po.closed',
  ],
  'procurement.suppliers': [
    'supplier.created',
    'supplier.updated',
    'supplier.activated',
    'supplier.deactivated',
    'supplier.rated',
    'supplier.blacklisted',
    'supplier.compliance_updated',
    'supplier.contact_added',
    'supplier.contact_removed',
    'supplier.archived',
  ],

  // ── Execution ───────────────────────────────────────────────────────────
  'execution.projects': [
    'project.created',
    'project.updated',
    'project.started',
    'project.milestone_reached',
    'project.delayed',
    'project.on_hold',
    'project.resumed',
    'project.completed',
    'project.cancelled',
    'project.budget_updated',
    'project.team_changed',
  ],
  'execution.workorders': [
    'workorder.created',
    'workorder.updated',
    'workorder.assigned',
    'workorder.started',
    'workorder.paused',
    'workorder.resumed',
    'workorder.completed',
    'workorder.cancelled',
    'workorder.material_requested',
    'workorder.inspected',
  ],
  'execution.tasks': [
    'task.created',
    'task.updated',
    'task.assigned',
    'task.started',
    'task.completed',
    'task.blocked',
    'task.unblocked',
    'task.cancelled',
    'task.overdue',
    'task.comment_added',
  ],

  // ── Inventory ───────────────────────────────────────────────────────────
  'inventory.materials': [
    'material.created',
    'material.updated',
    'material.price_changed',
    'material.reorder_triggered',
    'material.discontinued',
    'material.substituted',
    'material.specification_updated',
  ],
  'inventory.stock': [
    'stock.received',
    'stock.issued',
    'stock.transferred',
    'stock.adjusted',
    'stock.counted',
    'stock.reserved',
    'stock.released',
    'stock.below_minimum',
    'stock.above_maximum',
    'stock.expired',
  ],

  // ── Finance ─────────────────────────────────────────────────────────────
  'finance.invoices': [
    'invoice.created',
    'invoice.updated',
    'invoice.issued',
    'invoice.sent',
    'invoice.partially_paid',
    'invoice.fully_paid',
    'invoice.overdue',
    'invoice.cancelled',
    'invoice.credit_note_issued',
    'invoice.disputed',
  ],
  'finance.payments': [
    'payment.created',
    'payment.approved',
    'payment.processed',
    'payment.completed',
    'payment.failed',
    'payment.refunded',
    'payment.cancelled',
    'payment.reconciled',
    'payment.scheduled',
  ],
  'finance.collections': [
    'collection.created',
    'collection.reminder_sent',
    'collection.escalated',
    'collection.promise_received',
    'collection.partial_received',
    'collection.full_received',
    'collection.written_off',
    'collection.legal_action',
    'collection.closed',
  ],
  'finance.ledger': [
    'ledger.entry_created',
    'ledger.entry_posted',
    'ledger.entry_reversed',
    'ledger.period_closed',
    'ledger.period_reopened',
    'ledger.reconciliation_completed',
    'ledger.adjustment_posted',
    'ledger.year_end_closed',
    // AGENT-229 — Year-End Close Orchestrator
    'ledger.tax_provision_posted',
    'ledger.opening_balances_posted',
  ],

  // ── Workforce ───────────────────────────────────────────────────────────
  'workforce.employees': [
    'employee.created',
    'employee.updated',
    'employee.onboarded',
    'employee.promoted',
    'employee.transferred',
    'employee.terminated',
    'employee.suspended',
    'employee.reinstated',
    'employee.document_uploaded',
    'employee.certification_updated',
  ],
  'workforce.attendance': [
    'attendance.clock_in',
    'attendance.clock_out',
    'attendance.break_start',
    'attendance.break_end',
    'attendance.absence_reported',
    'attendance.absence_approved',
    'attendance.overtime_logged',
    'attendance.correction_requested',
    'attendance.correction_approved',
  ],
  'workforce.payroll': [
    'payroll.run_started',
    'payroll.run_calculated',
    'payroll.run_approved',
    'payroll.run_processed',
    'payroll.run_completed',
    'payroll.run_reversed',
    'payroll.slip_generated',
    'payroll.slip_sent',
    'payroll.tax_filed',
    'payroll.bonus_calculated',
  ],

  // ── Governance ──────────────────────────────────────────────────────────
  'governance.alerts': [
    'alert.created',
    'alert.acknowledged',
    'alert.escalated',
    'alert.resolved',
    'alert.dismissed',
    'alert.auto_resolved',
    'alert.sla_breached',
  ],
  'governance.audit': [
    'audit.entry_created',
    'audit.review_requested',
    'audit.review_completed',
    'audit.finding_raised',
    'audit.finding_resolved',
    'audit.report_generated',
    'audit.compliance_checked',
  ],
  'governance.documents': [
    'document.uploaded',
    'document.updated',
    'document.approved',
    'document.rejected',
    'document.signed',
    'document.expired',
    'document.archived',
    'document.version_created',
    'document.shared',
  ],

  // ── AI ──────────────────────────────────────────────────────────────────
  'ai.signals': [
    'signal.detected',
    'signal.confirmed',
    'signal.dismissed',
    'signal.escalated',
    'signal.expired',
  ],
  'ai.insights': [
    'insight.generated',
    'insight.delivered',
    'insight.acknowledged',
    'insight.acted_upon',
    'insight.dismissed',
    'insight.feedback_received',
  ],
  'ai.anomalies': [
    'anomaly.detected',
    'anomaly.confirmed',
    'anomaly.investigating',
    'anomaly.resolved',
    'anomaly.false_positive',
    'anomaly.escalated',
  ],
  'ai.forecasts': [
    'forecast.generated',
    'forecast.updated',
    'forecast.approved',
    'forecast.expired',
    'forecast.accuracy_measured',
    'forecast.feedback_received',
  ],
});

// ── Pre-computed reverse index (event_name -> topic_name) ─────────────────
/** @type {Map<string, string>} */
const _eventToTopicIndex = new Map();

for (const [topic, events] of Object.entries(TOPIC_MAP)) {
  for (const evt of events) {
    _eventToTopicIndex.set(evt, topic);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Reverse-lookup: find the topic a given event name belongs to.
 *
 * @param {string} eventName - e.g. 'invoice.issued'
 * @returns {string|null} The topic name, or null if not found
 *
 * @example
 * getTopicForEvent('invoice.issued'); // => 'finance.invoices'
 */
function getTopicForEvent(eventName) {
  if (!eventName || typeof eventName !== 'string') {
    return null;
  }
  return _eventToTopicIndex.get(eventName) || null;
}

/**
 * Validate whether an event name is allowed on a given topic.
 *
 * @param {string} topicName - e.g. 'finance.invoices'
 * @param {string} eventName - e.g. 'invoice.issued'
 * @returns {boolean} true if the event is valid for the topic
 *
 * @example
 * isValidEvent('finance.invoices', 'invoice.issued'); // => true
 * isValidEvent('finance.invoices', 'po.created');     // => false
 */
function isValidEvent(topicName, eventName) {
  if (!topicName || !eventName) {
    return false;
  }
  const events = TOPIC_MAP[topicName];
  if (!events) {
    return false;
  }
  return events.includes(eventName);
}

/**
 * List every registered topic name.
 *
 * @returns {string[]} Sorted array of topic names
 *
 * @example
 * getAllTopics(); // => ['ai.anomalies', 'ai.forecasts', ..., 'workforce.payroll']
 */
function getAllTopics() {
  return Object.keys(TOPIC_MAP).sort();
}

/**
 * List every registered event name across all topics.
 *
 * @returns {string[]} Sorted array of event names
 */
function getAllEvents() {
  return Array.from(_eventToTopicIndex.keys()).sort();
}

/**
 * Get the array of valid event names for a topic.
 *
 * @param {string} topicName - e.g. 'finance.invoices'
 * @returns {string[]|null} Array of event names, or null if topic not found
 */
function getEventsForTopic(topicName) {
  if (!topicName || typeof topicName !== 'string') {
    return null;
  }
  const events = TOPIC_MAP[topicName];
  return events ? [...events] : null;
}

module.exports = {
  TOPIC_MAP,
  getTopicForEvent,
  isValidEvent,
  getAllTopics,
  getAllEvents,
  getEventsForTopic,
};
