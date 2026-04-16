'use strict';

const { createEvent } = require('./envelope');
const { getTopicForEvent, isValidEvent } = require('./topic-map');

/**
 * @module shared-events/producer
 * @description EventProducer wraps event creation, persistence, and optional broadcast.
 *
 * In the MVP phase events are written to the `domain_events` Supabase table.
 * The transport can be upgraded to Kafka / NATS / Redis Streams later without
 * changing the call sites — only this module needs to change.
 */

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/**
 * Minimal console-compatible logger interface.
 * @typedef {Object} Logger
 * @property {Function} info
 * @property {Function} warn
 * @property {Function} error
 * @property {Function} debug
 */

/**
 * EventProducer — wraps event creation + persistence + optional broadcast.
 * In MVP, events are written to the domain_events table.
 * Can be upgraded to Kafka/NATS/Redis Streams later.
 */
class EventProducer {
  /**
   * @param {Object}          opts
   * @param {SupabaseClient}  opts.supabase     - Initialised Supabase client
   * @param {string}          opts.serviceName  - Service constant, e.g. 'ONYX_PROCUREMENT'
   * @param {Logger}          [opts.logger]     - Optional logger (defaults to console)
   */
  constructor({ supabase, serviceName, logger }) {
    if (!supabase) {
      throw new TypeError('EventProducer: supabase client is required');
    }
    if (!serviceName || typeof serviceName !== 'string') {
      throw new TypeError('EventProducer: serviceName is required and must be a non-empty string');
    }

    /** @private */
    this._supabase = supabase;
    /** @private */
    this._serviceName = serviceName;
    /** @private */
    this._log = logger || console;
  }

  /**
   * Publish a single domain event.
   *
   * 1. Resolve the topic from the event name (via topic-map).
   * 2. Build a standard envelope.
   * 3. Persist to `domain_events` table.
   * 4. Optionally notify listeners via `event_subscriptions`.
   * 5. Return the persisted envelope.
   *
   * @param {Object}          params
   * @param {string}          params.eventName      - e.g. 'invoice.issued'
   * @param {string}          params.entityType     - e.g. 'Invoice'
   * @param {number|string}   params.entityId       - PK of affected entity
   * @param {Object}          [params.payload={}]   - Event-specific data
   * @param {string}          [params.correlationId]
   * @param {string}          [params.causationId]
   * @param {string}          [params.actorType]    - 'user' | 'system' | 'service'
   * @param {string|number}   [params.actorId]
   * @param {string}          [params.sourceModule] - Sub-module within the service
   * @param {number}          [params.eventVersion] - Schema version (default 1)
   * @param {Object}          [params.metadata]     - Extra context
   * @returns {Promise<Object>} The persisted event envelope
   * @throws {Error} If topic resolution fails, validation fails, or persistence fails
   *
   * @example
   * const evt = await producer.publish({
   *   eventName:  'invoice.issued',
   *   entityType: 'Invoice',
   *   entityId:   42,
   *   payload:    { total: 15000, currency: 'ILS' },
   *   actorType:  'user',
   *   actorId:    7,
   * });
   */
  async publish({
    eventName,
    entityType,
    entityId,
    payload,
    correlationId,
    causationId,
    actorType,
    actorId,
    sourceModule,
    eventVersion,
    metadata,
  }) {
    // 1. Resolve topic ----------------------------------------------------------
    const topicName = getTopicForEvent(eventName);
    if (!topicName) {
      throw new Error(
        `EventProducer.publish: unknown event name "${eventName}". ` +
        'Register it in topic-map.js first.'
      );
    }

    // Validate event belongs to topic (defensive — should always pass after getTopicForEvent)
    if (!isValidEvent(topicName, eventName)) {
      throw new Error(
        `EventProducer.publish: event "${eventName}" is not valid for topic "${topicName}".`
      );
    }

    // 2. Build envelope ---------------------------------------------------------
    const envelope = createEvent({
      eventName,
      topicName,
      sourceService: this._serviceName,
      sourceModule:  sourceModule || null,
      entityType,
      entityId,
      payload,
      correlationId,
      causationId,
      actorType,
      actorId,
      eventVersion,
      metadata,
    });

    // 3. Persist to domain_events -----------------------------------------------
    const { data, error: insertError } = await this._supabase
      .from('domain_events')
      .insert({
        event_id:       envelope.event_id,
        event_name:     envelope.event_name,
        event_version:  envelope.event_version,
        topic_name:     envelope.topic_name,
        source_service: envelope.source_service,
        source_module:  envelope.source_module,
        entity_type:    envelope.entity_type,
        entity_id:      String(envelope.entity_id),
        partition_key:  envelope.partition_key,
        emitted_at:     envelope.emitted_at,
        correlation_id: envelope.correlation_id,
        causation_id:   envelope.causation_id,
        actor_type:     envelope.actor_type,
        actor_id:       envelope.actor_id ? String(envelope.actor_id) : null,
        payload:        envelope.payload,
        metadata:       envelope.metadata,
      })
      .select()
      .single();

    if (insertError) {
      this._log.error('[EventProducer] Failed to persist event', {
        eventName,
        entityType,
        entityId,
        error: insertError.message,
      });
      throw new Error(`EventProducer.publish: persistence failed — ${insertError.message}`);
    }

    this._log.info('[EventProducer] Event published', {
      event_id:   envelope.event_id,
      event_name: envelope.event_name,
      topic_name: envelope.topic_name,
      entity:     envelope.partition_key,
    });

    // 4. Notify subscribers (fire-and-forget) -----------------------------------
    this._notifySubscribers(envelope).catch((err) => {
      this._log.warn('[EventProducer] Subscriber notification failed (non-fatal)', {
        event_id: envelope.event_id,
        error:    err.message,
      });
    });

    // 5. Return envelope --------------------------------------------------------
    return envelope;
  }

  /**
   * Publish a batch of events atomically (best-effort).
   *
   * Each item in the array uses the same shape as {@link publish}.
   * Events are inserted in a single Supabase batch call. If the batch insert
   * fails, the entire batch is rejected.
   *
   * @param {Array<Object>} events - Array of publish parameter objects
   * @returns {Promise<Object[]>} Array of persisted event envelopes
   * @throws {Error} If any envelope creation or the batch insert fails
   *
   * @example
   * const results = await producer.publishBatch([
   *   { eventName: 'po.created',  entityType: 'PurchaseOrder', entityId: 1, payload: {} },
   *   { eventName: 'po.approved', entityType: 'PurchaseOrder', entityId: 1, payload: {} },
   * ]);
   */
  async publishBatch(events) {
    if (!Array.isArray(events) || events.length === 0) {
      throw new TypeError('EventProducer.publishBatch: events must be a non-empty array');
    }

    // Build all envelopes first (fail fast on bad data) -------------------------
    const envelopes = events.map((params, idx) => {
      const topicName = getTopicForEvent(params.eventName);
      if (!topicName) {
        throw new Error(
          `EventProducer.publishBatch[${idx}]: unknown event name "${params.eventName}". ` +
          'Register it in topic-map.js first.'
        );
      }

      return createEvent({
        eventName:     params.eventName,
        topicName,
        sourceService: this._serviceName,
        sourceModule:  params.sourceModule || null,
        entityType:    params.entityType,
        entityId:      params.entityId,
        payload:       params.payload,
        correlationId: params.correlationId,
        causationId:   params.causationId,
        actorType:     params.actorType,
        actorId:       params.actorId,
        eventVersion:  params.eventVersion,
        metadata:      params.metadata,
      });
    });

    // Batch insert into domain_events -------------------------------------------
    const rows = envelopes.map((env) => ({
      event_id:       env.event_id,
      event_name:     env.event_name,
      event_version:  env.event_version,
      topic_name:     env.topic_name,
      source_service: env.source_service,
      source_module:  env.source_module,
      entity_type:    env.entity_type,
      entity_id:      String(env.entity_id),
      partition_key:  env.partition_key,
      emitted_at:     env.emitted_at,
      correlation_id: env.correlation_id,
      causation_id:   env.causation_id,
      actor_type:     env.actor_type,
      actor_id:       env.actor_id ? String(env.actor_id) : null,
      payload:        env.payload,
      metadata:       env.metadata,
    }));

    const { error: batchError } = await this._supabase
      .from('domain_events')
      .insert(rows);

    if (batchError) {
      this._log.error('[EventProducer] Batch insert failed', {
        count: rows.length,
        error: batchError.message,
      });
      throw new Error(`EventProducer.publishBatch: persistence failed — ${batchError.message}`);
    }

    this._log.info('[EventProducer] Batch published', { count: envelopes.length });

    // Notify subscribers for each event (fire-and-forget) -----------------------
    for (const env of envelopes) {
      this._notifySubscribers(env).catch((err) => {
        this._log.warn('[EventProducer] Batch subscriber notification failed (non-fatal)', {
          event_id: env.event_id,
          error:    err.message,
        });
      });
    }

    return envelopes;
  }

  /**
   * Notify event_subscriptions listeners (fire-and-forget).
   * Looks up rows in `event_subscriptions` matching the topic_name or event_name
   * and inserts pending delivery records into `event_deliveries`.
   *
   * @private
   * @param {Object} envelope - The published event envelope
   * @returns {Promise<void>}
   */
  async _notifySubscribers(envelope) {
    // Query subscriptions matching this event's topic or event name
    const { data: subscriptions, error: subError } = await this._supabase
      .from('event_subscriptions')
      .select('id, consumer_group, filter_event_name')
      .or(`topic_name.eq.${envelope.topic_name},filter_event_name.eq.${envelope.event_name}`)
      .eq('active', true);

    if (subError) {
      this._log.debug('[EventProducer] Could not query event_subscriptions (table may not exist yet)', {
        error: subError.message,
      });
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    // Create pending delivery records
    const deliveries = subscriptions.map((sub) => ({
      event_id:       envelope.event_id,
      consumer_group: sub.consumer_group,
      status:         'pending',
      attempt:        0,
      created_at:     new Date().toISOString(),
    }));

    const { error: delError } = await this._supabase
      .from('event_deliveries')
      .insert(deliveries);

    if (delError) {
      this._log.debug('[EventProducer] Could not insert event_deliveries (table may not exist yet)', {
        error: delError.message,
      });
    }
  }
}

module.exports = { EventProducer };
