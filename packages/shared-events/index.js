'use strict';

/**
 * @module shared-events
 * @description Barrel export for the Techno-Kol Uzi shared event bus infrastructure.
 *
 * Provides everything needed to produce, consume, and manage domain events
 * across the four services (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, ONYX_AI).
 *
 * Quick-start (producer):
 * ```js
 * const { EventProducer } = require('@techno-kol/shared-events');
 * const producer = new EventProducer({ supabase, serviceName: 'ONYX_PROCUREMENT' });
 * await producer.publish({
 *   eventName:  'invoice.issued',
 *   entityType: 'Invoice',
 *   entityId:   42,
 *   payload:    { total: 15000, currency: 'ILS' },
 * });
 * ```
 *
 * Quick-start (consumer):
 * ```js
 * const { EventConsumer } = require('@techno-kol/shared-events');
 * const consumer = new EventConsumer({ supabase, consumerGroup: 'payroll-salary-calc' });
 * await consumer.processEvent(event, async (evt) => {
 *   // idempotent handler
 * });
 * ```
 */

// ── Envelope ──────────────────────────────────────────────────────────────
const { createEvent } = require('./envelope');

// ── Topic Map ─────────────────────────────────────────────────────────────
const {
  TOPIC_MAP,
  getTopicForEvent,
  isValidEvent,
  getAllTopics,
  getAllEvents,
  getEventsForTopic,
} = require('./topic-map');

// ── Producer ──────────────────────────────────────────────────────────────
const { EventProducer } = require('./producer');

// ── Consumer ──────────────────────────────────────────────────────────────
const { EventConsumer } = require('./consumer');

// ── Idempotency ───────────────────────────────────────────────────────────
const {
  checkIdempotency,
  markProcessed,
  markFailed,
  getDeliveryHistory,
} = require('./idempotency');

module.exports = {
  // Envelope
  createEvent,

  // Topic Map
  TOPIC_MAP,
  getTopicForEvent,
  isValidEvent,
  getAllTopics,
  getAllEvents,
  getEventsForTopic,

  // Producer
  EventProducer,

  // Consumer
  EventConsumer,

  // Idempotency
  checkIdempotency,
  markProcessed,
  markFailed,
  getDeliveryHistory,
};
