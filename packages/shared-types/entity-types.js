'use strict';

/**
 * @module entity-types
 * @description Canonical entity type registry for the Techno-Kol Uzi ERP 2026 system.
 *
 * Every entity that participates in the Master Flow, state machines, 360 pages,
 * or cross-service contracts MUST be declared here. Services import these
 * constants instead of using raw strings so that typos are caught at load time
 * and refactors propagate automatically.
 *
 * 29 entity types covering all domains:
 *   Commercial (Lead, Customer, Supplier, Quote, QuoteLine)
 *   Procurement (RFQ, RFQItem, PurchaseOrder, PurchaseOrderLine, Contract)
 *   Execution  (Project, WorkOrder, Task)
 *   Inventory  (Material, Inventory, Warehouse)
 *   Workforce  (Employee, Attendance, PayrollRun, WageSlip)
 *   Finance    (Invoice, Payment, Expense)
 *   Governance (Document, Alert, AuditLog)
 *   AI         (AIInsight, AnomalyCase, ForecastModel)
 *
 * @example
 *   const { ENTITY_TYPES } = require('@techno-kol/shared-types/entity-types');
 *   console.log(ENTITY_TYPES.LEAD); // 'Lead'
 */

/** @typedef {typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES]} EntityType */

/**
 * Frozen map of every canonical entity type in the system.
 * Keys are UPPER_SNAKE constants; values are PascalCase display names
 * used in API payloads, event topics, and audit logs.
 *
 * @readonly
 * @enum {string}
 */
const ENTITY_TYPES = Object.freeze({
  /* ── Commercial ───────────────────────────────────────────────── */
  /** Sales lead — entry point of the Master Flow */
  LEAD: 'Lead',
  /** Converted customer account */
  CUSTOMER: 'Customer',
  /** External supplier / vendor */
  SUPPLIER: 'Supplier',
  /** Price quotation sent to a customer */
  QUOTE: 'Quote',
  /** Individual line item within a Quote */
  QUOTE_LINE: 'QuoteLine',

  /* ── Procurement ──────────────────────────────────────────────── */
  /** Request for Quotation sent to suppliers */
  RFQ: 'RFQ',
  /** Individual line item within an RFQ */
  RFQ_ITEM: 'RFQItem',
  /** Purchase Order issued to a supplier */
  PURCHASE_ORDER: 'PurchaseOrder',
  /** Individual line item within a Purchase Order */
  PO_LINE: 'PurchaseOrderLine',
  /** Long-term agreement with a customer or supplier */
  CONTRACT: 'Contract',

  /* ── Execution ────────────────────────────────────────────────── */
  /** Delivery project born from an approved Quote */
  PROJECT: 'Project',
  /** Discrete unit of work within a Project */
  WORK_ORDER: 'WorkOrder',
  /** Granular task assigned to a team member */
  TASK: 'Task',

  /* ── Inventory ────────────────────────────────────────────────── */
  /** Physical material / product SKU */
  MATERIAL: 'Material',
  /** Stock-on-hand record for a Material in a Warehouse */
  INVENTORY: 'Inventory',
  /** Physical or logical storage location */
  WAREHOUSE: 'Warehouse',

  /* ── Workforce ────────────────────────────────────────────────── */
  /** Company employee record */
  EMPLOYEE: 'Employee',
  /** Daily attendance / time-tracking entry */
  ATTENDANCE: 'Attendance',
  /** Monthly payroll calculation batch */
  PAYROLL_RUN: 'PayrollRun',
  /** Individual salary slip generated per employee per run */
  WAGE_SLIP: 'WageSlip',

  /* ── Finance ──────────────────────────────────────────────────── */
  /** Customer-facing invoice */
  INVOICE: 'Invoice',
  /** Incoming or outgoing payment transaction */
  PAYMENT: 'Payment',
  /** Expense claim or operational cost */
  EXPENSE: 'Expense',

  /* ── Governance ───────────────────────────────────────────────── */
  /** Uploaded or generated document / attachment */
  DOCUMENT: 'Document',
  /** System or business alert requiring attention */
  ALERT: 'Alert',
  /** Immutable audit trail entry */
  AUDIT_LOG: 'AuditLog',

  /* ── AI & Intelligence ────────────────────────────────────────── */
  /** AI-generated business insight */
  AI_INSIGHT: 'AIInsight',
  /** Detected anomaly requiring investigation */
  ANOMALY_CASE: 'AnomalyCase',
  /** Trained or published forecasting model */
  FORECAST_MODEL: 'ForecastModel',
});

/**
 * Array of all entity type values for iteration / validation.
 * @readonly
 * @type {string[]}
 */
const ALL_ENTITY_TYPES = Object.freeze(Object.values(ENTITY_TYPES));

/**
 * Validate that a given string is a known entity type.
 * @param {string} type - The value to check.
 * @returns {boolean} `true` when `type` is one of the canonical entity types.
 */
function isValidEntityType(type) {
  return ALL_ENTITY_TYPES.includes(type);
}

module.exports = { ENTITY_TYPES, ALL_ENTITY_TYPES, isValidEntityType };
