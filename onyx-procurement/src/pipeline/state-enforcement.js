/**
 * State Machine Enforcement — runtime transition guard
 *
 * Imported by server.js and sub-modules to validate every status change
 * against the canonical state machines defined in state-machines.js.
 *
 * Usage:
 *   const { enforceTransition, recordTransition } = require('./pipeline/state-enforcement');
 *
 *   // Before updating status:
 *   const check = enforceTransition('po', currentRow.status, 'approved');
 *   if (!check.valid) return res.status(409).json({ error: check.error, allowed: check.allowed });
 *
 *   // After updating status:
 *   await recordTransition(supabase, { entityType, entityId, from, to, actor, reason });
 */

'use strict';

const { STATE_MACHINES } = require('./state-machines');

// ═══════════════════════════════════════════════════════════════
// ENFORCE TRANSITION — validate before writing
// ═══════════════════════════════════════════════════════════════

/**
 * Check whether moving from `currentStatus` to `targetStatus` is a legal
 * transition for the given entity type.
 *
 * Returns:
 *   { valid: true,  transition: <transitionName>, triggers: [...] }
 *   { valid: false, error: '...', allowed: ['status_a','status_b'] }
 *
 * If the entity type has no state machine defined, the function returns
 * `{ valid: true }` so callers that guard generic entities degrade gracefully.
 */
function enforceTransition(entityType, currentStatus, targetStatus) {
  const sm = STATE_MACHINES[entityType];
  if (!sm) {
    // No state machine for this entity — allow (graceful degradation)
    return { valid: true, transition: null, triggers: [] };
  }

  const stateNode = sm.states[currentStatus];
  if (!stateNode) {
    return {
      valid: false,
      error: `Unknown current status "${currentStatus}" for entity "${entityType}". ` +
             `Known states: ${Object.keys(sm.states).join(', ')}`,
      allowed: [],
    };
  }

  // The state machine uses named transitions: { transitionName: targetState }
  // We need to find if *any* transition from the current state leads to targetStatus.
  const validTargets = Object.entries(stateNode.transitions);
  const match = validTargets.find(([_name, target]) => target === targetStatus);

  if (!match) {
    const allowedTargets = validTargets.map(([_n, t]) => t);
    return {
      valid: false,
      error: `Invalid transition: "${currentStatus}" → "${targetStatus}" is not allowed ` +
             `for entity "${entityType}". ` +
             (allowedTargets.length
               ? `Valid targets from "${currentStatus}": ${allowedTargets.join(', ')}`
               : `"${currentStatus}" is a final state — no transitions allowed`),
      allowed: allowedTargets,
    };
  }

  // Gather triggers defined for this transition
  const transitionName = match[0];
  const triggerKey = `${currentStatus}\u2192${targetStatus}`;
  const triggers = (sm.triggers && sm.triggers[triggerKey]) || [];

  return { valid: true, transition: transitionName, triggers };
}

// ═══════════════════════════════════════════════════════════════
// RECORD TRANSITION — audit trail in state_history
// ═══════════════════════════════════════════════════════════════

/**
 * Write a row to `state_history` so every transition is queryable.
 * Falls back silently on DB errors (never breaks the caller).
 */
async function recordTransition(supabase, {
  entityType,
  entityId,
  from,
  to,
  actor = 'system',
  reason = null,
  metadata = null,
}) {
  try {
    await supabase.from('state_history').insert({
      entity_type: entityType,
      entity_id: entityId,
      from_status: from,
      to_status: to,
      changed_by: actor,
      changed_at: new Date().toISOString(),
      reason,
      metadata: metadata || null,
    });
  } catch (err) {
    // Log but never let history-write failures block the business operation
    console.error(`[state-enforcement] failed to record transition ${entityType}:${entityId} `
      + `${from}→${to}: ${err.message}`);
  }
}

module.exports = { enforceTransition, recordTransition };
