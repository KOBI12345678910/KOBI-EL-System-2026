'use strict';

/**
 * Transition guards -- common pre-condition checks that run before a
 * state transition is executed.
 *
 * Each guard returns `{ ok: true }` on success or `{ ok: false, reason: string }`
 * on failure, so callers can collect all failures and return them together.
 *
 * Usage:
 *   const checks = [
 *     requireState(po, ['Draft']),
 *     requireOwnership(po, userId),
 *     requireFieldPresent(po, 'supplier_id'),
 *     requirePositiveAmount(po.total_amount),
 *   ];
 *   const failures = checks.filter(c => !c.ok);
 *   if (failures.length) throw new GuardError(failures);
 */

// ---------------------------------------------------------------
// Guard result type (all guards return this shape)
// ---------------------------------------------------------------

/**
 * @typedef {{ ok: true } | { ok: false, reason: string }} GuardResult
 */

// ---------------------------------------------------------------
// Guards
// ---------------------------------------------------------------

/**
 * Assert that the entity's current state/status is one of the allowed values.
 *
 * @param {object} entity                - The entity object
 * @param {string[]} allowedStates       - List of states that pass the check
 * @param {string} [statusField='status'] - Field name on the entity that holds the state
 * @returns {GuardResult}
 */
function requireState(entity, allowedStates, statusField) {
  const field = statusField || 'status';
  if (!entity) {
    return { ok: false, reason: 'Entity is null or undefined' };
  }
  const current = entity[field];
  if (!current) {
    return { ok: false, reason: `Entity has no "${field}" field` };
  }
  if (!allowedStates.includes(current)) {
    return {
      ok: false,
      reason: `Current state "${current}" is not in allowed states [${allowedStates.join(', ')}]`,
    };
  }
  return { ok: true };
}

/**
 * Assert that the entity belongs to (or was created by) the given user.
 *
 * @param {object} entity               - The entity object
 * @param {string} userId               - The user id to check
 * @param {string} [ownerField='created_by'] - Field name that holds the owner user id
 * @returns {GuardResult}
 */
function requireOwnership(entity, userId, ownerField) {
  const field = ownerField || 'created_by';
  if (!entity) {
    return { ok: false, reason: 'Entity is null or undefined' };
  }
  if (!userId) {
    return { ok: false, reason: 'userId is required for ownership check' };
  }
  if (entity[field] !== userId) {
    return {
      ok: false,
      reason: `User "${userId}" is not the owner of this entity (owner: "${entity[field]}")`,
    };
  }
  return { ok: true };
}

/**
 * Four-eyes principle: assert that the acting user is NOT the same as
 * the user who performed a prior step (e.g. creator cannot approve).
 *
 * @param {object} entity          - The entity object
 * @param {string} userId          - The user trying to perform the action
 * @param {string} field           - Field on the entity that holds the prior user id
 *                                   (e.g. 'created_by', 'submitted_by')
 * @returns {GuardResult}
 */
function requireNotSelf(entity, userId, field) {
  if (!entity) {
    return { ok: false, reason: 'Entity is null or undefined' };
  }
  if (!userId) {
    return { ok: false, reason: 'userId is required for four-eyes check' };
  }
  if (!field) {
    return { ok: false, reason: 'field parameter is required for four-eyes check' };
  }
  if (entity[field] === userId) {
    return {
      ok: false,
      reason: `Four-eyes violation: user "${userId}" matches entity.${field}. A different user must perform this action.`,
    };
  }
  return { ok: true };
}

/**
 * Assert that a required field is present and non-empty on the entity.
 *
 * @param {object} entity   - The entity object
 * @param {string} field    - Field name that must be present
 * @returns {GuardResult}
 */
function requireFieldPresent(entity, field) {
  if (!entity) {
    return { ok: false, reason: 'Entity is null or undefined' };
  }
  if (!field) {
    return { ok: false, reason: 'field parameter is required' };
  }
  const value = entity[field];
  if (value === null || value === undefined || value === '') {
    return {
      ok: false,
      reason: `Required field "${field}" is missing or empty`,
    };
  }
  return { ok: true };
}

/**
 * Assert that a numeric value is greater than zero.
 *
 * @param {*} value        - The value to check
 * @param {string} [label] - Optional label for the error message
 * @returns {GuardResult}
 */
function requirePositiveAmount(value, label) {
  const tag = label || 'value';
  if (value === null || value === undefined) {
    return { ok: false, reason: `${tag} is null or undefined` };
  }
  const num = Number(value);
  if (isNaN(num)) {
    return { ok: false, reason: `${tag} is not a valid number: "${value}"` };
  }
  if (num <= 0) {
    return { ok: false, reason: `${tag} must be positive, got ${num}` };
  }
  return { ok: true };
}

/**
 * Assert that an entity was actually loaded (exists and is not null).
 *
 * @param {*} entity           - The entity object (or null/undefined if not found)
 * @param {string} entityType  - Entity type name for the error message (e.g. 'PurchaseOrder')
 * @returns {GuardResult}
 */
function requireEntityExists(entity, entityType) {
  if (!entity) {
    return {
      ok: false,
      reason: `${entityType || 'Entity'} not found`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------
// Aggregation helper
// ---------------------------------------------------------------

/**
 * Run an array of guard results and throw a combined error if any failed.
 *
 * @param {GuardResult[]} results     - Array of guard results
 * @param {string} [context]          - Optional context string for the error message
 * @throws {Error} with code 'GUARD_FAILED' and a `failures` property
 */
function assertAllGuards(results, context) {
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) return;

  const reasons = failures.map((f) => f.reason);
  const prefix = context ? `[${context}] ` : '';
  const err = new Error(`${prefix}Guard checks failed: ${reasons.join('; ')}`);
  err.code = 'GUARD_FAILED';
  err.failures = failures;
  throw err;
}

module.exports = {
  requireState,
  requireOwnership,
  requireNotSelf,
  requireFieldPresent,
  requirePositiveAmount,
  requireEntityExists,
  assertAllGuards,
};
