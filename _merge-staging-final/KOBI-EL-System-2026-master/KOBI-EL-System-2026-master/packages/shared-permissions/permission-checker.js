'use strict';

/**
 * @module permission-checker
 * @description PermissionChecker — checks if a user/role has a specific
 * permission. Supports wildcard (`*`), domain wildcards (`customers.*`),
 * and exact match.  Ships with an Express middleware factory so routes
 * can declare their required permissions declaratively.
 */

const { ROLE_PERMISSIONS } = require('./role-definitions');

class PermissionChecker {
  /**
   * @param {Record<string, { description: string, permissions: string[] }>} [rolePermissions]
   *   Optional override; defaults to the built-in ROLE_PERMISSIONS.
   */
  constructor(rolePermissions) {
    /** @type {Record<string, { description: string, permissions: string[] }>} */
    this.rolePermissions = rolePermissions || ROLE_PERMISSIONS;
  }

  /* ------------------------------------------------------------------ */
  /*  Core checks                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Check whether a role has a specific permission.
   *
   * Resolution order:
   *  1. Global wildcard `*`         — admin catch-all.
   *  2. Exact match                 — `customers.read` === `customers.read`.
   *  3. Domain wildcard             — role has `customers.*` and the
   *     required permission starts with `customers.`.
   *
   * @param {string} userRole            The user's role key.
   * @param {string} requiredPermission  The permission to verify.
   * @returns {boolean}
   */
  hasPermission(userRole, requiredPermission) {
    const roleDef = this.rolePermissions[userRole];
    if (!roleDef) return false;

    const perms = roleDef.permissions;

    // 1. Global wildcard
    if (perms.includes('*')) return true;

    // 2. Exact match
    if (perms.includes(requiredPermission)) return true;

    // 3. Domain wildcard — e.g. 'customers.*' covers 'customers.read'
    const dotIdx = requiredPermission.indexOf('.');
    if (dotIdx !== -1) {
      const domain = requiredPermission.substring(0, dotIdx);
      if (perms.includes(`${domain}.*`)) return true;
    }

    // 4. Multi-level domain wildcard — e.g. 'portal.*' covers 'portal.customer.read'
    const segments = requiredPermission.split('.');
    for (let i = 1; i < segments.length; i++) {
      const prefix = segments.slice(0, i).join('.');
      if (perms.includes(`${prefix}.*`)) return true;
    }

    return false;
  }

  /**
   * Returns `true` if the role has **at least one** of the listed permissions.
   * @param {string} userRole
   * @param {string[]} permissions
   * @returns {boolean}
   */
  hasAnyPermission(userRole, permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) return false;
    return permissions.some((p) => this.hasPermission(userRole, p));
  }

  /**
   * Returns `true` only if the role has **every** listed permission.
   * @param {string} userRole
   * @param {string[]} permissions
   * @returns {boolean}
   */
  hasAllPermissions(userRole, permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) return false;
    return permissions.every((p) => this.hasPermission(userRole, p));
  }

  /* ------------------------------------------------------------------ */
  /*  Express middleware                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Express middleware factory. Requires the request to carry a user with
   * **at least one** of the specified permissions.
   *
   * The middleware reads the role from `req.user.role` or `req.actor.role`.
   * If neither exists the response is `401 Unauthorized`.
   * If the role lacks the permission the response is `403 Forbidden`.
   *
   * @param {...string} permissions  One or more permission strings.
   * @returns {import('express').RequestHandler}
   *
   * @example
   *   const checker = new PermissionChecker();
   *   app.get('/api/customers', checker.requirePermission('customers.read'), handler);
   */
  requirePermission(...permissions) {
    return (req, res, next) => {
      const role = req.user?.role || req.actor?.role;

      if (!role) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      if (!this.hasAnyPermission(role, permissions)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            required: permissions,
            userRole: role,
          },
        });
      }

      next();
    };
  }

  /**
   * Like {@link requirePermission} but enforces that the role has **all**
   * listed permissions (logical AND).
   *
   * @param {...string} permissions
   * @returns {import('express').RequestHandler}
   */
  requireAllPermissions(...permissions) {
    return (req, res, next) => {
      const role = req.user?.role || req.actor?.role;

      if (!role) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      if (!this.hasAllPermissions(role, permissions)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions — all listed permissions are required',
            required: permissions,
            userRole: role,
          },
        });
      }

      next();
    };
  }
}

module.exports = { PermissionChecker };
