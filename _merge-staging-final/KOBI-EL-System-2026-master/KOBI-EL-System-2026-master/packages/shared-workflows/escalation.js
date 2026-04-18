'use strict';

/**
 * SLA timer and escalation primitives.
 *
 * These are pure functions -- no database access. They calculate whether
 * an entity has breached its SLA and what escalation level applies.
 *
 * Usage:
 *   const result = checkSLA({
 *     entity: purchaseOrder,
 *     stateField: 'status',
 *     enteredAtField: 'status_changed_at',
 *     maxDurationHours: 48,
 *     currentTime: new Date(),
 *   });
 *   // => { breached: true, hoursInState: 72.5, hoursOverdue: 24.5 }
 *
 *   const level = getEscalationLevel(24.5, [
 *     { hours: 0,  level: 1, label: 'Team Lead' },
 *     { hours: 24, level: 2, label: 'Department Manager' },
 *     { hours: 72, level: 3, label: 'VP Operations' },
 *   ]);
 *   // => { level: 2, label: 'Department Manager', nextLevel: { hours: 72, level: 3, label: 'VP Operations' }, hoursToNext: 47.5 }
 */

// ---------------------------------------------------------------
// SLA Check
// ---------------------------------------------------------------

/**
 * Check whether an entity has breached its SLA for the current state.
 *
 * @param {object} opts
 * @param {object} opts.entity                 - The entity object
 * @param {string} [opts.stateField='status']  - Field holding the current state
 * @param {string} [opts.enteredAtField='status_changed_at'] - Field holding the timestamp when the entity entered the current state
 * @param {number} opts.maxDurationHours       - Maximum allowed hours in the current state
 * @param {Date}   [opts.currentTime]          - Current time (defaults to now)
 * @returns {{ breached: boolean, currentState: string, hoursInState: number, hoursOverdue: number, enteredAt: string }}
 */
function checkSLA({ entity, stateField, enteredAtField, maxDurationHours, currentTime }) {
  if (!entity) throw new Error('checkSLA requires an entity');
  if (maxDurationHours == null || maxDurationHours <= 0) {
    throw new Error('checkSLA requires a positive maxDurationHours');
  }

  const sField = stateField || 'status';
  const eField = enteredAtField || 'status_changed_at';
  const now = currentTime || new Date();

  const currentState = entity[sField];
  const enteredAtRaw = entity[eField];

  if (!enteredAtRaw) {
    // No timestamp available -- cannot compute SLA
    return {
      breached: false,
      currentState: currentState || 'unknown',
      hoursInState: 0,
      hoursOverdue: 0,
      enteredAt: null,
    };
  }

  const enteredAt = new Date(enteredAtRaw);
  const elapsedMs = now.getTime() - enteredAt.getTime();
  const hoursInState = Math.max(0, elapsedMs / (1000 * 60 * 60));
  const hoursOverdue = Math.max(0, hoursInState - maxDurationHours);
  const breached = hoursInState > maxDurationHours;

  return {
    breached,
    currentState: currentState || 'unknown',
    hoursInState: _round2(hoursInState),
    hoursOverdue: _round2(hoursOverdue),
    enteredAt: enteredAt.toISOString(),
  };
}

// ---------------------------------------------------------------
// Escalation Level
// ---------------------------------------------------------------

/**
 * @typedef {object} EscalationTier
 * @property {number} hours   - Hours overdue threshold for this tier
 * @property {number} level   - Numeric level (1, 2, 3, ...)
 * @property {string} label   - Human-readable label (e.g. 'Team Lead', 'VP Operations')
 */

/**
 * Determine the current escalation level given how many hours the SLA
 * has been overdue.
 *
 * Levels must be sorted by ascending `hours` threshold. The function
 * returns the highest tier whose threshold has been exceeded.
 *
 * @param {number} hoursOverdue           - How many hours past the SLA deadline
 * @param {EscalationTier[]} levels       - Escalation tiers sorted ascending by hours
 * @returns {{ level: number, label: string, hours: number, nextLevel: EscalationTier|null, hoursToNext: number|null } | null}
 *   Returns null if hoursOverdue <= 0 or no levels match.
 */
function getEscalationLevel(hoursOverdue, levels) {
  if (!levels || levels.length === 0) return null;
  if (hoursOverdue <= 0) return null;

  // Sort ascending by hours (defensive -- caller should already sort)
  const sorted = [...levels].sort((a, b) => a.hours - b.hours);

  let matched = null;
  let matchedIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    if (hoursOverdue >= sorted[i].hours) {
      matched = sorted[i];
      matchedIndex = i;
    } else {
      break;
    }
  }

  if (!matched) return null;

  const nextLevel = matchedIndex + 1 < sorted.length ? sorted[matchedIndex + 1] : null;
  const hoursToNext = nextLevel ? _round2(nextLevel.hours - hoursOverdue) : null;

  return {
    level: matched.level,
    label: matched.label,
    hours: matched.hours,
    nextLevel,
    hoursToNext: hoursToNext !== null && hoursToNext > 0 ? hoursToNext : 0,
  };
}

// ---------------------------------------------------------------
// Batch SLA check
// ---------------------------------------------------------------

/**
 * Check SLA for multiple entities at once. Returns only those that breached.
 *
 * @param {object} opts
 * @param {object[]} opts.entities               - Array of entity objects
 * @param {string} [opts.stateField='status']
 * @param {string} [opts.enteredAtField='status_changed_at']
 * @param {number} opts.maxDurationHours
 * @param {Date} [opts.currentTime]
 * @param {string} [opts.idField='id']           - Field name for the entity primary key
 * @returns {Array<{ entityId: string, breached: boolean, hoursInState: number, hoursOverdue: number, currentState: string }>}
 */
function checkSLABatch({ entities, stateField, enteredAtField, maxDurationHours, currentTime, idField }) {
  if (!entities || !Array.isArray(entities)) return [];
  const idf = idField || 'id';

  return entities
    .map((entity) => {
      const result = checkSLA({ entity, stateField, enteredAtField, maxDurationHours, currentTime });
      return { entityId: entity[idf], ...result };
    })
    .filter((r) => r.breached);
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Round to 2 decimal places.
 *
 * @private
 * @param {number} n
 * @returns {number}
 */
function _round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { checkSLA, getEscalationLevel, checkSLABatch };
