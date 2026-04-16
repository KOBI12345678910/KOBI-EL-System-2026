'use strict';

/**
 * @module shared-events/idempotency
 * @description Idempotency helpers for the Techno-Kol Uzi event bus.
 *
 * These functions interact with the `event_deliveries` table to ensure
 * that a given event is processed at most once per consumer group.
 *
 * Table schema (expected):
 * ```sql
 * CREATE TABLE IF NOT EXISTS event_deliveries (
 *   id              BIGSERIAL PRIMARY KEY,
 *   event_id        UUID         NOT NULL,
 *   consumer_group  VARCHAR(255) NOT NULL,
 *   status          VARCHAR(50)  NOT NULL DEFAULT 'pending',
 *   attempt         INT          NOT NULL DEFAULT 0,
 *   error_message   TEXT,
 *   response_payload JSONB,
 *   processed_at    TIMESTAMPTZ,
 *   created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
 *   updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
 *   UNIQUE(event_id, consumer_group, attempt)
 * );
 * ```
 */

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/**
 * Check whether an event has already been successfully processed by a consumer group.
 *
 * @param {SupabaseClient} supabase       - Initialised Supabase client
 * @param {string}         eventId        - The event UUID to check
 * @param {string}         consumerGroup  - The consumer group identifier
 * @returns {Promise<boolean>} true if a successful delivery record exists
 * @throws {Error} If the query itself fails unexpectedly
 *
 * @example
 * const done = await checkIdempotency(supabase, 'abc-123', 'payroll-calc');
 * if (done) return; // already handled
 */
async function checkIdempotency(supabase, eventId, consumerGroup) {
  if (!supabase) {
    throw new TypeError('checkIdempotency: supabase client is required');
  }
  if (!eventId || typeof eventId !== 'string') {
    throw new TypeError('checkIdempotency: eventId is required and must be a non-empty string');
  }
  if (!consumerGroup || typeof consumerGroup !== 'string') {
    throw new TypeError('checkIdempotency: consumerGroup is required and must be a non-empty string');
  }

  const { data, error } = await supabase
    .from('event_deliveries')
    .select('id')
    .eq('event_id', eventId)
    .eq('consumer_group', consumerGroup)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle();

  if (error) {
    // If the table does not exist yet, treat as "not processed"
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      return false;
    }
    throw new Error(`checkIdempotency: query failed — ${error.message}`);
  }

  return data !== null;
}

/**
 * Record a successful processing of an event by a consumer group.
 *
 * @param {SupabaseClient} supabase         - Initialised Supabase client
 * @param {string}         eventId          - The event UUID
 * @param {string}         consumerGroup    - The consumer group identifier
 * @param {boolean}        success          - Whether processing succeeded
 * @param {Object|null}    [responsePayload] - Optional handler return value to store
 * @returns {Promise<void>}
 * @throws {Error} If the upsert fails
 *
 * @example
 * await markProcessed(supabase, 'abc-123', 'payroll-calc', true, { salary: 12000 });
 */
async function markProcessed(supabase, eventId, consumerGroup, success, responsePayload) {
  if (!supabase) {
    throw new TypeError('markProcessed: supabase client is required');
  }
  if (!eventId || typeof eventId !== 'string') {
    throw new TypeError('markProcessed: eventId is required and must be a non-empty string');
  }
  if (!consumerGroup || typeof consumerGroup !== 'string') {
    throw new TypeError('markProcessed: consumerGroup is required and must be a non-empty string');
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('event_deliveries')
    .upsert(
      {
        event_id:         eventId,
        consumer_group:   consumerGroup,
        status:           success ? 'success' : 'failed',
        attempt:          1,
        response_payload: responsePayload || null,
        error_message:    null,
        processed_at:     now,
        updated_at:       now,
      },
      { onConflict: 'event_id,consumer_group,attempt' }
    );

  if (error) {
    throw new Error(`markProcessed: upsert failed — ${error.message}`);
  }
}

/**
 * Record a failed processing attempt for an event.
 *
 * @param {SupabaseClient} supabase       - Initialised Supabase client
 * @param {string}         eventId        - The event UUID
 * @param {string}         consumerGroup  - The consumer group identifier
 * @param {number}         attempt        - Current attempt number (1-based)
 * @param {string|Error}   error          - Error message or Error object
 * @returns {Promise<void>}
 * @throws {Error} If the upsert fails
 *
 * @example
 * try {
 *   await handleEvent(event);
 * } catch (err) {
 *   await markFailed(supabase, event.event_id, 'payroll-calc', 1, err);
 * }
 */
async function markFailed(supabase, eventId, consumerGroup, attempt, error) {
  if (!supabase) {
    throw new TypeError('markFailed: supabase client is required');
  }
  if (!eventId || typeof eventId !== 'string') {
    throw new TypeError('markFailed: eventId is required and must be a non-empty string');
  }
  if (!consumerGroup || typeof consumerGroup !== 'string') {
    throw new TypeError('markFailed: consumerGroup is required and must be a non-empty string');
  }
  if (typeof attempt !== 'number' || attempt < 1) {
    throw new TypeError('markFailed: attempt must be a positive number');
  }

  const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from('event_deliveries')
    .upsert(
      {
        event_id:         eventId,
        consumer_group:   consumerGroup,
        status:           'failed',
        attempt,
        error_message:    errorMessage,
        response_payload: null,
        processed_at:     now,
        updated_at:       now,
      },
      { onConflict: 'event_id,consumer_group,attempt' }
    );

  if (upsertError) {
    throw new Error(`markFailed: upsert failed — ${upsertError.message}`);
  }
}

/**
 * Get the full delivery history for an event across all consumer groups.
 * Useful for debugging and observability dashboards.
 *
 * @param {SupabaseClient} supabase  - Initialised Supabase client
 * @param {string}         eventId   - The event UUID
 * @returns {Promise<Object[]>} Array of delivery records
 */
async function getDeliveryHistory(supabase, eventId) {
  if (!supabase) {
    throw new TypeError('getDeliveryHistory: supabase client is required');
  }
  if (!eventId || typeof eventId !== 'string') {
    throw new TypeError('getDeliveryHistory: eventId is required and must be a non-empty string');
  }

  const { data, error } = await supabase
    .from('event_deliveries')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getDeliveryHistory: query failed — ${error.message}`);
  }

  return data || [];
}

module.exports = {
  checkIdempotency,
  markProcessed,
  markFailed,
  getDeliveryHistory,
};
