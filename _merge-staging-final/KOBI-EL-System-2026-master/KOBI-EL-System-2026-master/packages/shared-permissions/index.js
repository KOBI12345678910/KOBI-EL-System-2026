'use strict';

/**
 * @module shared-permissions
 * @description Barrel export for the Techno-Kol Uzi ERP 2026
 * shared-permissions package.
 *
 * Re-exports:
 *  - Role definitions and lookup helpers.
 *  - PermissionChecker class (role-based checks + Express middleware).
 *  - Ownership-level guards for portal and self-service flows.
 */

const {
  ROLE_PERMISSIONS,
  getRoleNames,
  getRoleDefinition,
  getAllPermissions,
} = require('./role-definitions');

const { PermissionChecker } = require('./permission-checker');

const {
  requireOwnerOrAdmin,
  requirePortalScope,
  requireSelfOrManager,
  ownerOrAdminMiddleware,
  selfOrManagerMiddleware,
} = require('./ownership-checker');

module.exports = {
  // Role definitions
  ROLE_PERMISSIONS,
  getRoleNames,
  getRoleDefinition,
  getAllPermissions,

  // Permission checker
  PermissionChecker,

  // Ownership checks
  requireOwnerOrAdmin,
  requirePortalScope,
  requireSelfOrManager,
  ownerOrAdminMiddleware,
  selfOrManagerMiddleware,
};
