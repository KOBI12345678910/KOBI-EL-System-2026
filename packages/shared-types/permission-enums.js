'use strict';

/**
 * @module permission-enums
 * @description Canonical permission codes and role definitions for the
 * Techno-Kol Uzi ERP 2026 RBAC system.
 *
 * Every route guard, UI button visibility check, and audit-log annotation
 * MUST reference constants from this module. Raw permission strings are
 * forbidden in production code.
 *
 * Permission naming convention: `<domain>.<verb>`
 *   e.g. `customers.read`, `po.approve`, `admin.full_access`
 *
 * @example
 *   const { QUOTE_PERMISSIONS, ROLES } = require('@techno-kol/shared-types/permission-enums');
 *   if (user.permissions.includes(QUOTE_PERMISSIONS.APPROVE)) { ... }
 */

/* ═══════════════════════════════════════════════════════════════
 *  COMMERCIAL PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Customer entity permissions.
 * @readonly
 * @enum {string}
 */
const CUSTOMER_PERMISSIONS = Object.freeze({
  READ:   'customers.read',
  CREATE: 'customers.create',
  UPDATE: 'customers.update',
  DELETE: 'customers.delete',
});

/**
 * Supplier entity permissions.
 * @readonly
 * @enum {string}
 */
const SUPPLIER_PERMISSIONS = Object.freeze({
  READ:   'suppliers.read',
  CREATE: 'suppliers.create',
  UPDATE: 'suppliers.update',
  BLOCK:  'suppliers.block',
});

/**
 * Quote entity permissions.
 * @readonly
 * @enum {string}
 */
const QUOTE_PERMISSIONS = Object.freeze({
  READ:    'quotes.read',
  CREATE:  'quotes.create',
  APPROVE: 'quotes.approve',
  REJECT:  'quotes.reject',
});

/* ═══════════════════════════════════════════════════════════════
 *  PROCUREMENT PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * RFQ entity permissions.
 * @readonly
 * @enum {string}
 */
const RFQ_PERMISSIONS = Object.freeze({
  READ:    'rfq.read',
  CREATE:  'rfq.create',
  SEND:    'rfq.send',
  APPROVE: 'rfq.approve',
});

/**
 * Purchase Order permissions.
 * @readonly
 * @enum {string}
 */
const PO_PERMISSIONS = Object.freeze({
  READ:    'po.read',
  CREATE:  'po.create',
  APPROVE: 'po.approve',
  SEND:    'po.send',
  RECEIVE: 'po.receive',
});

/* ═══════════════════════════════════════════════════════════════
 *  EXECUTION PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Project entity permissions.
 * @readonly
 * @enum {string}
 */
const PROJECT_PERMISSIONS = Object.freeze({
  READ:         'projects.read',
  CREATE:       'projects.create',
  CHANGE_STATE: 'projects.change_state',
});

/**
 * Work Order entity permissions.
 * @readonly
 * @enum {string}
 */
const WORKORDER_PERMISSIONS = Object.freeze({
  READ:     'workorders.read',
  CREATE:   'workorders.create',
  ASSIGN:   'workorders.assign',
  START:    'workorders.start',
  COMPLETE: 'workorders.complete',
});

/**
 * Task entity permissions.
 * @readonly
 * @enum {string}
 */
const TASK_PERMISSIONS = Object.freeze({
  READ:   'tasks.read',
  CREATE: 'tasks.create',
  ASSIGN: 'tasks.assign',
});

/* ═══════════════════════════════════════════════════════════════
 *  FINANCE PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Invoice entity permissions.
 * @readonly
 * @enum {string}
 */
const INVOICE_PERMISSIONS = Object.freeze({
  READ:   'invoices.read',
  CREATE: 'invoices.create',
  ISSUE:  'invoices.issue',
});

/**
 * Payment entity permissions.
 * @readonly
 * @enum {string}
 */
const PAYMENT_PERMISSIONS = Object.freeze({
  READ:      'payments.read',
  CREATE:    'payments.create',
  RECONCILE: 'payments.reconcile',
});

/* ═══════════════════════════════════════════════════════════════
 *  WORKFORCE PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Payroll permissions.
 * @readonly
 * @enum {string}
 */
const PAYROLL_PERMISSIONS = Object.freeze({
  READ:    'payroll.read',
  CREATE:  'payroll.create',
  APPROVE: 'payroll.approve',
  EXPORT:  'payroll.export',
});

/**
 * Attendance permissions.
 * @readonly
 * @enum {string}
 */
const ATTENDANCE_PERMISSIONS = Object.freeze({
  READ:    'attendance.read',
  CREATE:  'attendance.create',
  APPROVE: 'attendance.approve',
});

/**
 * Employee entity permissions.
 * @readonly
 * @enum {string}
 */
const EMPLOYEE_PERMISSIONS = Object.freeze({
  READ:   'employees.read',
  CREATE: 'employees.create',
  UPDATE: 'employees.update',
});

/* ═══════════════════════════════════════════════════════════════
 *  GOVERNANCE PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Document entity permissions.
 * @readonly
 * @enum {string}
 */
const DOCUMENT_PERMISSIONS = Object.freeze({
  READ:     'documents.read',
  UPLOAD:   'documents.upload',
  CLASSIFY: 'documents.classify',
});

/* ═══════════════════════════════════════════════════════════════
 *  AI PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * AI module permissions.
 * @readonly
 * @enum {string}
 */
const AI_PERMISSIONS = Object.freeze({
  READ:      'ai.read',
  ACT:       'ai.act',
  CONFIGURE: 'ai.configure',
});

/* ═══════════════════════════════════════════════════════════════
 *  ADMIN PERMISSIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * System administration permissions.
 * @readonly
 * @enum {string}
 */
const ADMIN_PERMISSIONS = Object.freeze({
  FULL_ACCESS:  'admin.full_access',
  MANAGE_ROLES: 'admin.manage_roles',
  MANAGE_USERS: 'admin.manage_users',
});

/* ═══════════════════════════════════════════════════════════════
 *  ROLE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * System roles. Each role maps to a predefined set of permissions
 * configured at deployment time.
 *
 * @readonly
 * @enum {string}
 */
const ROLES = Object.freeze({
  /** Full system access — IT / super-admin */
  ADMIN:           'admin',
  /** Department / team manager with approval rights */
  MANAGER:         'manager',
  /** Finance team member — invoices, payments, payroll */
  ACCOUNTANT:      'accountant',
  /** Regular employee — attendance, tasks, self-service */
  EMPLOYEE:        'employee',
  /** Read-only access across all modules */
  VIEWER:          'viewer',
  /** External customer portal access */
  PORTAL_CUSTOMER: 'portal_customer',
  /** External supplier portal access */
  PORTAL_SUPPLIER: 'portal_supplier',
});

/* ═══════════════════════════════════════════════════════════════
 *  AGGREGATES
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Map of domain name -> permission enum for dynamic lookup.
 * @readonly
 */
const PERMISSION_DOMAINS = Object.freeze({
  CUSTOMER:   CUSTOMER_PERMISSIONS,
  SUPPLIER:   SUPPLIER_PERMISSIONS,
  QUOTE:      QUOTE_PERMISSIONS,
  RFQ:        RFQ_PERMISSIONS,
  PO:         PO_PERMISSIONS,
  PROJECT:    PROJECT_PERMISSIONS,
  WORKORDER:  WORKORDER_PERMISSIONS,
  TASK:       TASK_PERMISSIONS,
  INVOICE:    INVOICE_PERMISSIONS,
  PAYMENT:    PAYMENT_PERMISSIONS,
  PAYROLL:    PAYROLL_PERMISSIONS,
  ATTENDANCE: ATTENDANCE_PERMISSIONS,
  EMPLOYEE:   EMPLOYEE_PERMISSIONS,
  DOCUMENT:   DOCUMENT_PERMISSIONS,
  AI:         AI_PERMISSIONS,
  ADMIN:      ADMIN_PERMISSIONS,
});

/**
 * Flat array of every permission code string for validation.
 * @readonly
 * @type {string[]}
 */
const ALL_PERMISSIONS = Object.freeze(
  Object.values(PERMISSION_DOMAINS).flatMap((domain) => Object.values(domain)),
);

/**
 * Check whether a string is a recognised permission code.
 * @param {string} code
 * @returns {boolean}
 */
function isValidPermission(code) {
  return ALL_PERMISSIONS.includes(code);
}

module.exports = {
  // Domain permission groups
  CUSTOMER_PERMISSIONS,
  SUPPLIER_PERMISSIONS,
  QUOTE_PERMISSIONS,
  RFQ_PERMISSIONS,
  PO_PERMISSIONS,
  PROJECT_PERMISSIONS,
  WORKORDER_PERMISSIONS,
  TASK_PERMISSIONS,
  INVOICE_PERMISSIONS,
  PAYMENT_PERMISSIONS,
  PAYROLL_PERMISSIONS,
  ATTENDANCE_PERMISSIONS,
  EMPLOYEE_PERMISSIONS,
  DOCUMENT_PERMISSIONS,
  AI_PERMISSIONS,
  ADMIN_PERMISSIONS,

  // Roles
  ROLES,

  // Aggregates
  PERMISSION_DOMAINS,
  ALL_PERMISSIONS,

  // Validation
  isValidPermission,
};
