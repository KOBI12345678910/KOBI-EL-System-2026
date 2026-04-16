'use strict';

/**
 * StateMachine -- validates and executes state transitions.
 *
 * A pure, in-memory state machine that does NOT touch the database.
 * It answers: "Can I do X from state Y?" and "What can I do from state Y?"
 *
 * Usage:
 *   const machine = new StateMachine({
 *     name: 'PurchaseOrder',
 *     states: ['Draft', 'PendingApproval', 'Approved', 'Cancelled'],
 *     transitions: {
 *       request_approval: { from: ['Draft'],            to: 'PendingApproval' },
 *       approve:          { from: ['PendingApproval'],  to: 'Approved' },
 *       reject:           { from: ['PendingApproval'],  to: 'Draft' },
 *       cancel:           { from: ['Draft', 'PendingApproval'], to: 'Cancelled' },
 *     },
 *   });
 *
 *   machine.canTransition('Draft', 'request_approval');
 *   // => { valid: true, from: 'Draft', to: 'PendingApproval' }
 *
 *   machine.canTransition('Approved', 'request_approval');
 *   // => { valid: false, reason: '...' }
 *
 *   machine.assertTransition('Draft', 'request_approval');
 *   // => 'PendingApproval'  (throws if invalid)
 *
 *   machine.getAvailableActions('Draft');
 *   // => [{ action: 'request_approval', to: 'PendingApproval' }, { action: 'cancel', to: 'Cancelled' }]
 */
class StateMachine {
  /**
   * @param {object} opts
   * @param {string} opts.name                   - Human-readable machine name (e.g. 'PurchaseOrder')
   * @param {string[]} opts.states               - Complete list of valid state names
   * @param {Record<string, { from: string[], to: string }>} opts.transitions
   *   Map of action_name -> { from: [allowedSourceStates], to: targetState }
   */
  constructor({ name, states, transitions }) {
    if (!name) throw new Error('StateMachine requires a name');
    if (!states || !Array.isArray(states) || states.length === 0) {
      throw new Error(`StateMachine "${name}" requires a non-empty states array`);
    }
    if (!transitions || typeof transitions !== 'object') {
      throw new Error(`StateMachine "${name}" requires a transitions object`);
    }

    /** @readonly */ this.name = name;
    /** @private  */ this._states = new Set(states);
    /** @private  */ this._transitions = transitions;

    // Validate all transitions reference known states
    for (const [action, def] of Object.entries(transitions)) {
      if (!def.from || !Array.isArray(def.from)) {
        throw new Error(`StateMachine "${name}": transition "${action}" must have a from[] array`);
      }
      if (!def.to || typeof def.to !== 'string') {
        throw new Error(`StateMachine "${name}": transition "${action}" must have a string to`);
      }
      for (const s of def.from) {
        if (!this._states.has(s)) {
          throw new Error(`StateMachine "${name}": transition "${action}" references unknown from-state "${s}"`);
        }
      }
      if (!this._states.has(def.to)) {
        throw new Error(`StateMachine "${name}": transition "${action}" references unknown to-state "${def.to}"`);
      }
    }
  }

  /**
   * Check whether an action is valid from the given state.
   *
   * @param {string} currentState - The entity's current state
   * @param {string} action       - The action/transition name to attempt
   * @returns {{ valid: boolean, from?: string, to?: string, reason?: string }}
   */
  canTransition(currentState, action) {
    if (!this._states.has(currentState)) {
      return { valid: false, reason: `Unknown state "${currentState}" in machine "${this.name}"` };
    }

    const def = this._transitions[action];
    if (!def) {
      return { valid: false, reason: `Unknown action "${action}" in machine "${this.name}"` };
    }

    if (!def.from.includes(currentState)) {
      return {
        valid: false,
        reason: `Action "${action}" is not allowed from state "${currentState}" in machine "${this.name}". Allowed from: [${def.from.join(', ')}]`,
      };
    }

    return { valid: true, from: currentState, to: def.to };
  }

  /**
   * Assert that a transition is valid. Returns the target state on success,
   * throws an Error on failure.
   *
   * @param {string} currentState
   * @param {string} action
   * @returns {string} The target state
   * @throws {Error} If the transition is not allowed
   */
  assertTransition(currentState, action) {
    const result = this.canTransition(currentState, action);
    if (!result.valid) {
      const err = new Error(result.reason);
      err.code = 'INVALID_TRANSITION';
      err.machine = this.name;
      err.currentState = currentState;
      err.action = action;
      throw err;
    }
    return result.to;
  }

  /**
   * List all actions available from a given state.
   *
   * @param {string} currentState
   * @returns {Array<{ action: string, to: string }>}
   */
  getAvailableActions(currentState) {
    if (!this._states.has(currentState)) return [];

    const actions = [];
    for (const [action, def] of Object.entries(this._transitions)) {
      if (def.from.includes(currentState)) {
        actions.push({ action, to: def.to });
      }
    }
    return actions;
  }

  /**
   * Get the target state for a given action from a given current state.
   * Returns null if the transition is invalid.
   *
   * @param {string} currentState
   * @param {string} action
   * @returns {string|null}
   */
  getNextState(currentState, action) {
    const result = this.canTransition(currentState, action);
    return result.valid ? result.to : null;
  }

  /**
   * Return the full list of valid states for this machine.
   *
   * @returns {string[]}
   */
  getAllStates() {
    return [...this._states];
  }

  /**
   * Return all transition definitions.
   *
   * @returns {Record<string, { from: string[], to: string }>}
   */
  getAllTransitions() {
    return { ...this._transitions };
  }

  /**
   * Serialise the machine to a plain JSON-safe object.
   * Useful for API responses (GET /api/state-machines/:type).
   *
   * @returns {{ name: string, states: string[], transitions: Record<string, { from: string[], to: string }> }}
   */
  toJSON() {
    return {
      name: this.name,
      states: this.getAllStates(),
      transitions: this.getAllTransitions(),
    };
  }
}

module.exports = { StateMachine };
