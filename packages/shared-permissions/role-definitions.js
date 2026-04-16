'use strict';

/**
 * @module role-definitions
 * @description Role definitions for Techno-Kol Uzi ERP 2026.
 * Maps roles to their permission sets. Every permission follows the
 * convention `entity.action` (e.g. `customers.read`, `po.approve`).
 *
 * Special values:
 *  - `'*'` grants unrestricted access (admin wildcard).
 *  - `entity.*` grants all actions on a specific entity.
 *  - `portal.*` scopes access to portal-level features only.
 */

/** @type {Record<string, { description: string, permissions: string[] }>} */
const ROLE_PERMISSIONS = {
  admin: {
    description: 'Full system access',
    permissions: ['*'],
  },

  manager: {
    description: 'Department manager',
    permissions: [
      'customers.read', 'customers.create', 'customers.update',
      'suppliers.read', 'suppliers.create', 'suppliers.update',
      'quotes.read', 'quotes.create', 'quotes.approve',
      'rfq.read', 'rfq.create', 'rfq.send', 'rfq.approve',
      'po.read', 'po.create', 'po.approve', 'po.send', 'po.receive',
      'projects.read', 'projects.create', 'projects.change_state',
      'workorders.read', 'workorders.create', 'workorders.assign', 'workorders.start', 'workorders.complete',
      'invoices.read', 'invoices.create', 'invoices.issue',
      'payments.read', 'payments.create', 'payments.reconcile',
      'employees.read',
      'attendance.read', 'attendance.approve',
      'tasks.read', 'tasks.create', 'tasks.assign',
      'documents.read', 'documents.upload',
      'ai.read',
    ],
  },

  accountant: {
    description: 'Finance and accounting',
    permissions: [
      'customers.read', 'suppliers.read',
      'quotes.read',
      'invoices.read', 'invoices.create', 'invoices.issue',
      'payments.read', 'payments.create', 'payments.reconcile',
      'po.read',
      'documents.read', 'documents.upload',
      'ai.read',
    ],
  },

  employee: {
    description: 'Regular employee — own data only',
    permissions: [
      'attendance.read', 'attendance.create',
      'tasks.read',
      'documents.read',
    ],
  },

  viewer: {
    description: 'Read-only access',
    permissions: [
      'customers.read', 'suppliers.read', 'quotes.read', 'rfq.read',
      'po.read', 'projects.read', 'workorders.read',
      'invoices.read', 'payments.read',
      'employees.read', 'attendance.read',
      'tasks.read', 'documents.read', 'ai.read',
    ],
  },

  portal_customer: {
    description: 'Customer portal user — own records only',
    permissions: [
      'portal.customer.read',
      'portal.customer.documents',
      'portal.customer.support',
    ],
  },

  portal_supplier: {
    description: 'Supplier portal user — own records only',
    permissions: [
      'portal.supplier.read',
      'portal.supplier.quotes',
      'portal.supplier.documents',
    ],
  },
};

/**
 * Returns an array of all known role names.
 * @returns {string[]}
 */
function getRoleNames() {
  return Object.keys(ROLE_PERMISSIONS);
}

/**
 * Returns the permission set for a given role.
 * @param {string} role
 * @returns {{ description: string, permissions: string[] } | undefined}
 */
function getRoleDefinition(role) {
  return ROLE_PERMISSIONS[role];
}

/**
 * Returns a flat list of all unique permissions across every role.
 * @returns {string[]}
 */
function getAllPermissions() {
  const set = new Set();
  for (const def of Object.values(ROLE_PERMISSIONS)) {
    for (const p of def.permissions) set.add(p);
  }
  return [...set].sort();
}

module.exports = {
  ROLE_PERMISSIONS,
  getRoleNames,
  getRoleDefinition,
  getAllPermissions,
};
