'use strict';

/**
 * @module ownership-checker
 * @description Object-level ownership checks for portal users and
 * employee self-service. These guards complement the role-based
 * permission layer by ensuring a user can only touch records they own,
 * unless they are an admin or manager.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extracts the acting user's role from the request object.
 * @param {import('express').Request} req
 * @returns {string|undefined}
 * @private
 */
function _role(req) {
  return req.user?.role || req.actor?.role;
}

/**
 * Extracts the acting user's ID from the request object.
 * @param {import('express').Request} req
 * @returns {string|undefined}
 * @private
 */
function _userId(req) {
  return req.user?.id || req.user?.userId || req.actor?.id || req.actor?.userId;
}

/**
 * Returns `true` if the role is `admin` or `manager`.
 * @param {string|undefined} role
 * @returns {boolean}
 * @private
 */
function _isPrivileged(role) {
  return role === 'admin' || role === 'manager';
}

/* ------------------------------------------------------------------ */
/*  Public guards                                                      */
/* ------------------------------------------------------------------ */

/**
 * Ensures the requesting user either owns the target resource or is an
 * admin. Sends a 403 JSON response and returns `false` when denied;
 * returns `true` when access is granted so callers can short-circuit.
 *
 * @param {import('express').Request}  req       - Express request.
 * @param {import('express').Response} res       - Express response.
 * @param {string}                     targetId  - The owner/target ID to compare against.
 * @param {string}                     [idField='id'] - Which field on the user object holds their ID.
 * @returns {boolean} `true` if access is granted; `false` if a 403 was sent.
 *
 * @example
 *   app.get('/api/employees/:id', (req, res) => {
 *     if (!requireOwnerOrAdmin(req, res, req.params.id)) return;
 *     // ...fetch and return employee
 *   });
 */
function requireOwnerOrAdmin(req, res, targetId, idField = 'id') {
  const role = _role(req);

  // Admins always pass
  if (_isPrivileged(role)) return true;

  const userId = (req.user && req.user[idField]) || _userId(req);

  if (!userId || String(userId) !== String(targetId)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only access your own records',
      },
    });
    return false;
  }

  return true;
}

/**
 * Ensures a portal user can only access entities that belong to their
 * own organisation/customer/supplier scope.
 *
 * Portal roles store a `scopeId` on the user object that represents
 * their customer or supplier ID.  This function compares that against
 * the requested entity's owner.
 *
 * @param {import('express').Request}  req         - Express request.
 * @param {import('express').Response} res         - Express response.
 * @param {string}                     entityType  - `'customer'` or `'supplier'`.
 * @param {string}                     entityId    - The customer/supplier ID the resource belongs to.
 * @returns {boolean} `true` if access is granted; `false` if a 403 was sent.
 *
 * @example
 *   app.get('/api/portal/invoices/:invoiceId', (req, res) => {
 *     const invoice = db.getInvoice(req.params.invoiceId);
 *     if (!requirePortalScope(req, res, 'customer', invoice.customer_id)) return;
 *     res.json(invoice);
 *   });
 */
function requirePortalScope(req, res, entityType, entityId) {
  const role = _role(req);

  // Admins and managers bypass portal scope
  if (_isPrivileged(role)) return true;

  // Verify role matches entity type
  const expectedRole = `portal_${entityType}`;
  if (role !== expectedRole) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Role '${role}' cannot access ${entityType} portal resources`,
      },
    });
    return false;
  }

  // Compare scope — stored on user as scopeId, customerId, or supplierId
  const scopeId =
    req.user?.scopeId ||
    req.user?.customerId ||
    req.user?.supplierId ||
    req.actor?.scopeId ||
    req.actor?.customerId ||
    req.actor?.supplierId;

  if (!scopeId || String(scopeId) !== String(entityId)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `You can only access your own ${entityType} records`,
        entityType,
      },
    });
    return false;
  }

  return true;
}

/**
 * Ensures the requester is either the employee themselves or their
 * manager (or admin). Used for self-service HR flows like viewing
 * payslips, attendance, or personal data.
 *
 * @param {import('express').Request}  req          - Express request.
 * @param {import('express').Response} res          - Express response.
 * @param {string}                     employeeId   - The target employee ID.
 * @returns {boolean} `true` if access is granted; `false` if a 403 was sent.
 *
 * @example
 *   app.get('/api/payslips/:empId', (req, res) => {
 *     if (!requireSelfOrManager(req, res, req.params.empId)) return;
 *     // ...return payslips
 *   });
 */
function requireSelfOrManager(req, res, employeeId) {
  const role = _role(req);

  // Admin and manager pass
  if (_isPrivileged(role)) return true;

  const userId = _userId(req);
  const empId = req.user?.employeeId || req.actor?.employeeId || userId;

  if (!empId || String(empId) !== String(employeeId)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only access your own employee records',
      },
    });
    return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Middleware factories (optional convenience wrappers)               */
/* ------------------------------------------------------------------ */

/**
 * Express middleware that extracts a target ID from `req.params` and
 * runs {@link requireOwnerOrAdmin}.
 *
 * @param {string} paramName  - The route param that holds the owner ID (e.g. `'id'`).
 * @returns {import('express').RequestHandler}
 */
function ownerOrAdminMiddleware(paramName = 'id') {
  return (req, res, next) => {
    if (requireOwnerOrAdmin(req, res, req.params[paramName])) next();
  };
}

/**
 * Express middleware that extracts a target employee ID from
 * `req.params` and runs {@link requireSelfOrManager}.
 *
 * @param {string} paramName - The route param holding the employee ID.
 * @returns {import('express').RequestHandler}
 */
function selfOrManagerMiddleware(paramName = 'employeeId') {
  return (req, res, next) => {
    if (requireSelfOrManager(req, res, req.params[paramName])) next();
  };
}

module.exports = {
  requireOwnerOrAdmin,
  requirePortalScope,
  requireSelfOrManager,
  ownerOrAdminMiddleware,
  selfOrManagerMiddleware,
};
