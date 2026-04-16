'use strict';

const { randomUUID } = require('crypto');

/**
 * AuditWriter -- writes audit_logs entries for every critical mutation.
 *
 * Follows the DB schema:
 *   audit_logs table with columns:
 *     id              UUID  PRIMARY KEY
 *     entity_type     TEXT  NOT NULL
 *     entity_id       UUID  NOT NULL
 *     action_name     TEXT  NOT NULL
 *     old_values      JSONB
 *     new_values      JSONB
 *     performed_by_user_id  UUID
 *     source_service  TEXT  NOT NULL
 *     source_module   TEXT
 *     source_page     TEXT
 *     correlation_id  UUID
 *     performed_at    TIMESTAMPTZ  DEFAULT now()
 *
 * Usage:
 *   const writer = new AuditWriter({ supabase, serviceName: 'ONYX_PROCUREMENT', moduleName: 'po' });
 *   await writer.logCreate('purchase_order', poId, newPO, userId, correlationId);
 *   await writer.logUpdate('purchase_order', poId, oldPO, newPO, userId, correlationId);
 *   await writer.logAction('purchase_order', poId, 'approve', { approvedBy: managerId }, userId, correlationId);
 *   await writer.logDelete('purchase_order', poId, oldPO, userId, correlationId);
 */
class AuditWriter {
  /**
   * @param {object} opts
   * @param {object} opts.supabase           - Supabase client instance
   * @param {string} opts.serviceName        - Source service identifier (e.g. 'ONYX_PROCUREMENT')
   * @param {string} [opts.moduleName]       - Source module within the service (e.g. 'po', 'rfq')
   * @param {string} [opts.tableName='audit_logs'] - Override the audit table name
   */
  constructor({ supabase, serviceName, moduleName, tableName }) {
    if (!supabase) throw new Error('AuditWriter requires a supabase client');
    if (!serviceName) throw new Error('AuditWriter requires a serviceName');

    /** @private */ this._supabase = supabase;
    /** @private */ this._serviceName = serviceName;
    /** @private */ this._moduleName = moduleName || null;
    /** @private */ this._tableName = tableName || 'audit_logs';
  }

  // ---------------------------------------------------------------
  // Core log method
  // ---------------------------------------------------------------

  /**
   * Write a single audit log entry.
   *
   * @param {object} opts
   * @param {string} opts.entityType      - Entity type (e.g. 'purchase_order', 'invoice')
   * @param {string} opts.entityId        - Entity primary key
   * @param {string} opts.actionName      - Action performed (e.g. 'create', 'update', 'approve')
   * @param {object|null} opts.oldValues  - Previous state (JSONB)
   * @param {object|null} opts.newValues  - New state (JSONB)
   * @param {string|null} opts.userId     - User who performed the action
   * @param {string|null} opts.correlationId - Correlation ID for tracing across services
   * @param {string|null} opts.sourcePage - Page/UI context that triggered the action
   * @returns {Promise<string>} The id of the newly created audit log entry
   */
  async log({ entityType, entityId, actionName, oldValues, newValues, userId, correlationId, sourcePage }) {
    if (!entityType) throw new Error('entityType is required for audit logging');
    if (!entityId) throw new Error('entityId is required for audit logging');
    if (!actionName) throw new Error('actionName is required for audit logging');

    const id = randomUUID();

    const row = {
      id,
      entity_type: entityType,
      entity_id: entityId,
      action_name: actionName,
      old_values: oldValues || null,
      new_values: newValues || null,
      performed_by_user_id: userId || null,
      source_service: this._serviceName,
      source_module: this._moduleName,
      source_page: sourcePage || null,
      correlation_id: correlationId || null,
      performed_at: new Date().toISOString(),
    };

    const { error } = await this._supabase
      .from(this._tableName)
      .insert(row);

    if (error) {
      const msg = `AuditWriter.log failed for ${entityType}/${entityId}/${actionName}: ${error.message}`;
      console.error(msg, { row, error });
      throw new Error(msg);
    }

    return id;
  }

  // ---------------------------------------------------------------
  // Convenience methods
  // ---------------------------------------------------------------

  /**
   * Log a CREATE action.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} newValues   - The newly created entity
   * @param {string|null} userId
   * @param {string|null} correlationId
   * @returns {Promise<string>} Audit log id
   */
  async logCreate(entityType, entityId, newValues, userId, correlationId) {
    return this.log({
      entityType,
      entityId,
      actionName: 'create',
      oldValues: null,
      newValues,
      userId,
      correlationId,
    });
  }

  /**
   * Log an UPDATE action. Stores both old and new values so the diff can
   * be reconstructed at query time.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} oldValues   - State before the update
   * @param {object} newValues   - State after the update
   * @param {string|null} userId
   * @param {string|null} correlationId
   * @returns {Promise<string>} Audit log id
   */
  async logUpdate(entityType, entityId, oldValues, newValues, userId, correlationId) {
    return this.log({
      entityType,
      entityId,
      actionName: 'update',
      oldValues,
      newValues,
      userId,
      correlationId,
    });
  }

  /**
   * Log a named business action (e.g. 'approve', 'reject', 'send_to_supplier').
   * The `details` object is stored as newValues for context.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {string} actionName  - Business action name
   * @param {object} details     - Contextual data about the action
   * @param {string|null} userId
   * @param {string|null} correlationId
   * @returns {Promise<string>} Audit log id
   */
  async logAction(entityType, entityId, actionName, details, userId, correlationId) {
    return this.log({
      entityType,
      entityId,
      actionName,
      oldValues: null,
      newValues: details || null,
      userId,
      correlationId,
    });
  }

  /**
   * Log a DELETE (soft or hard) action. Stores the entity snapshot as oldValues
   * so the data is recoverable from the audit trail.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} oldValues   - The entity state before deletion
   * @param {string|null} userId
   * @param {string|null} correlationId
   * @returns {Promise<string>} Audit log id
   */
  async logDelete(entityType, entityId, oldValues, userId, correlationId) {
    return this.log({
      entityType,
      entityId,
      actionName: 'delete',
      oldValues,
      newValues: null,
      userId,
      correlationId,
    });
  }
}

module.exports = { AuditWriter };
