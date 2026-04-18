'use strict';

const { checkIdempotency, markProcessed, markFailed } = require('./idempotency');

/**
 * @module shared-events/consumer
 * @description EventConsumer — base class for idempotent event processing.
 *
 * Before executing a handler, the consumer checks the `event_deliveries` table
 * to ensure the same event is not processed twice by the same consumer group.
 *
 * Usage:
 * ```js
 * const consumer = new EventConsumer({
 *   supabase:      supabaseClient,
 *   consumerGroup: 'payroll-salary-calc',
 *   logger:        console,
 * });
 *
 * await consumer.processEvent(event, async (evt) => {
 *   // your idempotent business logic here
 *   return { success: true };
 * });
 * ```
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

/** Default maximum retry attempts before giving up. */
const DEFAULT_MAX_RETRIES = 5;

/**
 * EventConsumer — base class for idempotent event processing.
 * Checks event_deliveries for duplicates before processing.
 */
class EventConsumer {
  /**
   * @param {Object}         opts
   * @param {SupabaseClient} opts.supabase      - Initialised Supabase client
   * @param {string}         opts.consumerGroup - Unique consumer group identifier
   * @param {Logger}         [opts.logger]      - Optional logger (defaults to console)
   * @param {number}         [opts.maxRetries]  - Max retry attempts (default 5)
   */
  constructor({ supabase, consumerGroup, logger, maxRetries }) {
    if (!supabase) {
      throw new TypeError('EventConsumer: supabase client is required');
    }
    if (!consumerGroup || typeof consumerGroup !== 'string') {
      throw new TypeError('EventConsumer: consumerGroup is required and must be a non-empty string');
    }

    /** @private */
    this._supabase = supabase;
    /** @private */
    this._consumerGroup = consumerGroup;
    /** @private */
    this._log = logger || console;
    /** @private */
    this._maxRetries = maxRetries || DEFAULT_MAX_RETRIES;
  }

  /**
   * Process an event through the given handler with full idempotency protection.
   *
   * Flow:
   * 1. Check idempotency — skip if already successfully processed.
   * 2. Execute the handler function.
   * 3. On success: record delivery as successful.
   * 4. On failure: record delivery as failed with error details and attempt count.
   *
   * @param {Object}   event   - The event envelope (as returned by createEvent / producer.publish)
   * @param {Function} handler - Async function that receives the event and returns a result
   * @returns {Promise<{ skipped: boolean, result?: any, error?: string }>}
   *
   * @example
   * const outcome = await consumer.processEvent(event, async (evt) => {
   *   await recalculateSalary(evt.entity_id, evt.payload);
   *   return { recalculated: true };
   * });
   * // outcome => { skipped: false, result: { recalculated: true } }
   */
  async processEvent(event, handler) {
    if (!event || !event.event_id) {
      throw new TypeError('EventConsumer.processEvent: event with event_id is required');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('EventConsumer.processEvent: handler must be a function');
    }

    const eventId = event.event_id;

    // 1. Idempotency check ------------------------------------------------------
    const alreadyProcessed = await this.isProcessed(eventId);
    if (alreadyProcessed) {
      this._log.debug('[EventConsumer] Skipping already-processed event', {
        event_id:       eventId,
        consumer_group: this._consumerGroup,
      });
      return { skipped: true };
    }

    // Check retry limit ---------------------------------------------------------
    const currentAttempt = await this._getCurrentAttempt(eventId);
    if (currentAttempt >= this._maxRetries) {
      this._log.warn('[EventConsumer] Max retries exceeded, marking as dead-letter', {
        event_id:       eventId,
        consumer_group: this._consumerGroup,
        attempts:       currentAttempt,
      });
      await this.recordDelivery(eventId, false, `Max retries (${this._maxRetries}) exceeded`);
      return { skipped: false, error: `Max retries (${this._maxRetries}) exceeded` };
    }

    // 2. Execute handler --------------------------------------------------------
    try {
      const result = await handler(event);

      // 3. Record success -------------------------------------------------------
      await this.recordDelivery(eventId, true, null, result);

      this._log.info('[EventConsumer] Event processed successfully', {
        event_id:       eventId,
        event_name:     event.event_name,
        consumer_group: this._consumerGroup,
      });

      return { skipped: false, result };
    } catch (err) {
      // 4. Record failure -------------------------------------------------------
      const attempt = currentAttempt + 1;
      const errorMessage = err.message || String(err);

      await this.recordDelivery(eventId, false, errorMessage, null, attempt);

      this._log.error('[EventConsumer] Event processing failed', {
        event_id:       eventId,
        event_name:     event.event_name,
        consumer_group: this._consumerGroup,
        attempt,
        error:          errorMessage,
      });

      return { skipped: false, error: errorMessage };
    }
  }

  /**
   * Check whether an event has already been successfully processed by this consumer group.
   *
   * @param {string} eventId - The event_id to check
   * @returns {Promise<boolean>} true if the event was already processed successfully
   */
  async isProcessed(eventId) {
    return checkIdempotency(this._supabase, eventId, this._consumerGroup);
  }

  /**
   * Record a delivery outcome for an event.
   *
   * @param {string}      eventId         - The event_id
   * @param {boolean}     success         - Whether processing succeeded
   * @param {string|null} [error]         - Error message on failure
   * @param {Object|null} [responsePayload] - Handler return value on success
   * @param {number}      [attempt]       - Current attempt number
   * @returns {Promise<void>}
   */
  async recordDelivery(eventId, success, error, responsePayload, attempt) {
    if (success) {
      await markProcessed(
        this._supabase,
        eventId,
        this._consumerGroup,
        true,
        responsePayload || null,
      );
    } else {
      await markFailed(
        this._supabase,
        eventId,
        this._consumerGroup,
        attempt || 1,
        error || 'Unknown error',
      );
    }
  }

  /**
   * Get the current attempt count for an event in this consumer group.
   *
   * @private
   * @param {string} eventId
   * @returns {Promise<number>}
   */
  async _getCurrentAttempt(eventId) {
    const { data, error: queryError } = await this._supabase
      .from('event_deliveries')
      .select('attempt')
      .eq('event_id', eventId)
      .eq('consumer_group', this._consumerGroup)
      .order('attempt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      this._log.debug('[EventConsumer] Could not query current attempt (table may not exist yet)', {
        error: queryError.message,
      });
      return 0;
    }

    return data ? (data.attempt || 0) : 0;
  }
}

module.exports = { EventConsumer };
