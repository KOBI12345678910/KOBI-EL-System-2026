'use strict';

const { randomUUID } = require('crypto');

/**
 * StateHistoryWriter -- writes to state_history table on every state transition.
 *
 * DB schema:
 *   state_history table with columns:
 *     id                  UUID  PRIMARY KEY
 *     entity_type         TEXT  NOT NULL
 *     entity_id           UUID  NOT NULL
 *     from_state          TEXT  NOT NULL
 *     to_state            TEXT  NOT NULL
 *     changed_at          TIMESTAMPTZ  DEFAULT now()
 *     changed_by_user_id  UUID
 *     reason              TEXT
 *     correlation_id      UUID
 *     source_service      TEXT  NOT NULL
 *
 * Usage:
 *   const historian = new StateHistoryWriter({ supabase, serviceName: 'ONYX_PROCUREMENT' });
 *   await historian.recordTransition({
 *     entityType: 'purchase_order',
 *     entityId: poId,
 *     fromState: 'Draft',
 *     toState: 'PendingApproval',
 *     userId: currentUser.id,
 *     reason: 'Submitted for budget approval',
 *     correlationId,
 *   });
 */
class StateHistoryWriter {
  /**
   * @param {object} opts
   * @param {object} opts.supabase          - Supabase client instance
   * @param {string} opts.serviceName       - Source service identifier
   * @param {string} [opts.tableName='state_history'] - Override the state history table name
   */
  constructor({ supabase, serviceName, tableName }) {
    if (!supabase) throw new Error('StateHistoryWriter requires a supabase client');
    if (!serviceName) throw new Error('StateHistoryWriter requires a serviceName');

    /** @private */ this._supabase = supabase;
    /** @private */ this._serviceName = serviceName;
    /** @private */ this._tableName = tableName || 'state_history';
  }

  /**
   * Record a single state transition.
   *
   * @param {object} opts
   * @param {string} opts.entityType     - Entity type (e.g. 'purchase_order')
   * @param {string} opts.entityId       - Entity primary key
   * @param {string} opts.fromState      - State before the transition
   * @param {string} opts.toState        - State after the transition
   * @param {string|null} opts.userId    - User who triggered the transition
   * @param {string|null} opts.reason    - Human-readable reason / note
   * @param {string|null} opts.correlationId - Correlation ID for cross-service tracing
   * @returns {Promise<string>} The id of the new state_history row
   */
  async recordTransition({ entityType, entityId, fromState, toState, userId, reason, correlationId }) {
    if (!entityType) throw new Error('entityType is required for state history');
    if (!entityId) throw new Error('entityId is required for state history');
    if (!fromState) throw new Error('fromState is required for state history');
    if (!toState) throw new Error('toState is required for state history');

    const id = randomUUID();

    const row = {
      id,
      entity_type: entityType,
      entity_id: entityId,
      from_state: fromState,
      to_state: toState,
      changed_at: new Date().toISOString(),
      changed_by_user_id: userId || null,
      reason: reason || null,
      correlation_id: correlationId || null,
      source_service: this._serviceName,
    };

    const { error } = await this._supabase
      .from(this._tableName)
      .insert(row);

    if (error) {
      const msg = `StateHistoryWriter.recordTransition failed for ${entityType}/${entityId} (${fromState} -> ${toState}): ${error.message}`;
      console.error(msg, { row, error });
      throw new Error(msg);
    }

    return id;
  }

  /**
   * Retrieve the full state history for a given entity, ordered chronologically.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} [opts]
   * @param {number} [opts.limit=100]  - Max rows to return
   * @param {'asc'|'desc'} [opts.order='asc'] - Chronological order
   * @returns {Promise<Array<object>>}
   */
  async getHistory(entityType, entityId, opts) {
    const limit = (opts && opts.limit) || 100;
    const order = (opts && opts.order) || 'asc';

    const { data, error } = await this._supabase
      .from(this._tableName)
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('changed_at', { ascending: order === 'asc' })
      .limit(limit);

    if (error) {
      const msg = `StateHistoryWriter.getHistory failed for ${entityType}/${entityId}: ${error.message}`;
      console.error(msg, { error });
      throw new Error(msg);
    }

    return data || [];
  }

  /**
   * Get the latest recorded state for an entity.
   * Returns null if no history exists.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<object|null>}
   */
  async getLatest(entityType, entityId) {
    const rows = await this.getHistory(entityType, entityId, { limit: 1, order: 'desc' });
    return rows.length > 0 ? rows[0] : null;
  }
}

module.exports = { StateHistoryWriter };
