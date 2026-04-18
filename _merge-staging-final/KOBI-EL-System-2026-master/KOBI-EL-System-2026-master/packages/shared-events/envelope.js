'use strict';
const crypto = require('crypto');

/**
 * @module shared-events/envelope
 * @description Event envelope factory for the Techno-Kol Uzi event bus standard.
 *
 * Every domain event flowing through the system is wrapped in a standard envelope
 * that carries routing metadata, tracing identifiers, and the event payload.
 *
 * Envelope fields:
 *  - event_id         — globally unique UUID
 *  - event_name       — dot-delimited name, e.g. 'invoice.issued'
 *  - event_version    — schema version (default 1)
 *  - topic_name       — logical topic, e.g. 'finance.invoices'
 *  - source_service   — originating service constant (ONYX_PROCUREMENT, etc.)
 *  - source_module    — optional sub-module within the service
 *  - entity_type      — entity kind, e.g. 'Invoice'
 *  - entity_id        — primary key of the affected entity
 *  - partition_key    — deterministic key for ordered processing
 *  - emitted_at       — ISO-8601 timestamp of emission
 *  - correlation_id   — trace ID shared across a business transaction
 *  - causation_id     — ID of the event that directly caused this one
 *  - actor_type       — 'user' | 'system' | 'service'
 *  - actor_id         — identifier of the actor that triggered the event
 *  - payload          — event-specific data (must be JSON-serialisable)
 *  - metadata         — optional bag of extra context (tags, feature flags, etc.)
 */

/**
 * Create a domain event envelope per the Techno-Kol Uzi event bus standard.
 *
 * @param {Object}        params
 * @param {string}        params.eventName      - Dot-delimited event name, e.g. 'invoice.issued'
 * @param {string}        params.topicName      - Logical topic, e.g. 'finance.invoices'
 * @param {string}        params.sourceService  - Originating service, e.g. 'ONYX_PROCUREMENT'
 * @param {string}        [params.sourceModule] - Sub-module within the service, e.g. 'invoices'
 * @param {string}        params.entityType     - Entity kind, e.g. 'Invoice'
 * @param {number|string} params.entityId       - Primary key of the affected entity
 * @param {Object}        [params.payload={}]   - Event-specific data
 * @param {string}        [params.correlationId] - Trace ID; auto-generated when omitted
 * @param {string}        [params.causationId]  - ID of the directly-causing event
 * @param {string}        [params.actorType]    - 'user' | 'system' | 'service' (default 'system')
 * @param {string|number} [params.actorId]      - Identifier of the triggering actor
 * @param {number}        [params.eventVersion=1] - Schema version of the event
 * @param {Object}        [params.metadata]     - Extra context (tags, feature flags, etc.)
 * @returns {Readonly<Object>} Frozen event envelope
 * @throws {TypeError} If required parameters are missing or invalid
 *
 * @example
 * const evt = createEvent({
 *   eventName:     'invoice.issued',
 *   topicName:     'finance.invoices',
 *   sourceService: 'ONYX_PROCUREMENT',
 *   sourceModule:  'invoices',
 *   entityType:    'Invoice',
 *   entityId:      42,
 *   payload:       { total: 15000, currency: 'ILS' },
 *   actorType:     'user',
 *   actorId:       7,
 * });
 */
function createEvent({
  eventName,
  topicName,
  sourceService,
  sourceModule,
  entityType,
  entityId,
  payload,
  correlationId,
  causationId,
  actorType,
  actorId,
  eventVersion,
  metadata,
}) {
  // --- validation -----------------------------------------------------------
  if (!eventName || typeof eventName !== 'string') {
    throw new TypeError('createEvent: eventName is required and must be a non-empty string');
  }
  if (!topicName || typeof topicName !== 'string') {
    throw new TypeError('createEvent: topicName is required and must be a non-empty string');
  }
  if (!sourceService || typeof sourceService !== 'string') {
    throw new TypeError('createEvent: sourceService is required and must be a non-empty string');
  }
  if (!entityType || typeof entityType !== 'string') {
    throw new TypeError('createEvent: entityType is required and must be a non-empty string');
  }
  if (entityId === undefined || entityId === null) {
    throw new TypeError('createEvent: entityId is required');
  }

  // --- build envelope -------------------------------------------------------
  return Object.freeze({
    event_id:       crypto.randomUUID(),
    event_name:     eventName,
    event_version:  eventVersion || 1,
    topic_name:     topicName,
    source_service: sourceService,
    source_module:  sourceModule || null,
    entity_type:    entityType,
    entity_id:      entityId,
    partition_key:  `${entityType}:${entityId}`,
    emitted_at:     new Date().toISOString(),
    correlation_id: correlationId || crypto.randomUUID(),
    causation_id:   causationId || null,
    actor_type:     actorType || 'system',
    actor_id:       actorId || null,
    payload:        payload || {},
    metadata:       metadata || null,
  });
}

module.exports = { createEvent };
