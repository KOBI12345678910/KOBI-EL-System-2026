'use strict';

/**
 * Domain Event Wiring for ONYX_PROCUREMENT
 *
 * Bridges the in-process EventBus (src/wiring/event-bus.js) with the shared-events
 * EventProducer (packages/shared-events). Events are:
 *   1. Emitted locally via the EventBus (instant, in-process subscribers)
 *   2. Persisted to domain_events via EventProducer (fire-and-forget, graceful failure)
 *
 * Usage:
 *   const { initDomainEvents, emitDomainEvent } = require('./src/wiring/domain-events');
 *   initDomainEvents({ supabase });
 *   await emitDomainEvent('procurement.po.approved', { ... });
 */

const { EventBus } = require('./event-bus');

// Lazy-load shared-events — path is relative to this module
let EventProducer = null;
let sharedEvents = null;
try {
  sharedEvents = require('../../packages/shared-events');
  EventProducer = sharedEvents.EventProducer;
} catch (_) {
  // shared-events might not be resolvable via relative path, try from project root
  try {
    sharedEvents = require('../../../packages/shared-events');
    EventProducer = sharedEvents.EventProducer;
  } catch (__) {
    console.warn('[domain-events] shared-events package not found -- local-only mode');
  }
}

// ── Singleton instances ──

/** @type {EventBus} */
let bus = null;

/** @type {import('../../packages/shared-events/producer').EventProducer | null} */
let producer = null;

/** Whether the module is initialised */
let _initialized = false;

// ── Event-type registrations for the local EventBus ──
// These supplement the defaults already baked into event-bus.js
const ONYX_EVENT_TYPES = {
  'procurement.po.created': {
    owner: 'onyx-procurement',
    labels: { he: 'הזמנת רכש נוצרה', en: 'PO created' },
    shape: ['poId', 'supplierId', 'total', 'rfqId'],
  },
  'procurement.po.approved': {
    owner: 'onyx-procurement',
    labels: { he: 'הזמנת רכש אושרה', en: 'PO approved' },
    shape: ['poId', 'approverId', 'total'],
  },
  'procurement.rfq.sent': {
    owner: 'onyx-procurement',
    labels: { he: 'בקשת הצעת מחיר נשלחה', en: 'RFQ sent to suppliers' },
    shape: ['rfqId', 'supplierCount', 'purchaseRequestId'],
  },
  'commercial.quote.approved': {
    owner: 'onyx-procurement',
    labels: { he: 'הצעת מחיר אושרה', en: 'Quote approved / decided' },
    shape: ['decisionId', 'rfqId', 'selectedSupplierId', 'total'],
  },
  'finance.invoice.issued': {
    owner: 'onyx-procurement',
    labels: { he: 'חשבונית הונפקה', en: 'Invoice issued' },
    shape: ['invoiceId', 'amount', 'customerId'],
  },
  'finance.payment.registered': {
    owner: 'onyx-procurement',
    labels: { he: 'תשלום נרשם', en: 'Payment registered' },
    shape: ['paymentId', 'invoiceId', 'amount'],
  },
  'workforce.payroll.calculated': {
    owner: 'onyx-procurement',
    labels: { he: 'שכר חושב', en: 'Payroll run calculated' },
    shape: ['runId', 'employeeCount', 'totalGross'],
  },
  'governance.audit.created': {
    owner: 'onyx-procurement',
    labels: { he: 'רשומת ביקורת נוצרה', en: 'Audit entry created' },
    shape: ['entityType', 'entityId', 'action'],
  },
};

/**
 * Initialise the domain event system.
 *
 * @param {Object} opts
 * @param {Object} opts.supabase  - Supabase client (for shared-events persistence)
 * @param {Object} [opts.logger]  - Optional logger (defaults to console)
 */
function initDomainEvents({ supabase, logger, services } = {}) {
  if (_initialized) return { bus, producer };

  const log = logger || console;

  // 1. Create the in-process event bus
  bus = new EventBus({ highWaterMark: 500 });

  // Register our event types
  for (const [type, spec] of Object.entries(ONYX_EVENT_TYPES)) {
    try {
      bus.registerEventType(type, spec);
    } catch (_) {
      // May already exist from DEFAULT_EVENT_TYPES -- safe to ignore
    }
  }

  // 2. Create the shared-events producer (persists to Supabase)
  if (EventProducer && supabase) {
    try {
      producer = new EventProducer({
        supabase,
        serviceName: 'ONYX_PROCUREMENT',
        logger: log,
      });
      log.info('[domain-events] EventProducer initialised -- events will persist to domain_events table');
    } catch (err) {
      log.warn('[domain-events] EventProducer init failed (non-fatal):', err.message);
      producer = null;
    }
  } else {
    log.info('[domain-events] EventProducer not available -- local bus only');
  }

  // 3. Wire cross-service event consumers (examples)
  _registerCrossServiceConsumers(log);

  // 4. Register the 12 orchestrator listeners (AGENT-212)
  try {
    const { registerOrchestratorListeners } = require('./orchestrator-listeners');
    const summary = registerOrchestratorListeners({ bus, services: services || {}, logger: log });
    log.info(`[domain-events] Orchestrator listeners wired: ${summary.count}/12 (missing: ${summary.missing.length})`);
  } catch (err) {
    log.warn('[domain-events] registerOrchestratorListeners failed (non-fatal):', err.message);
  }

  _initialized = true;
  log.info('[domain-events] Domain event system initialised');

  return { bus, producer };
}

/**
 * Emit a domain event through both the local bus and the shared-events producer.
 *
 * @param {string} eventType    - Dotted event type, e.g. 'procurement.po.approved'
 * @param {Object} opts
 * @param {string} opts.entityType   - Entity kind, e.g. 'PurchaseOrder'
 * @param {string|number} opts.entityId - PK of affected entity
 * @param {string} opts.action       - Action verb, e.g. 'approved'
 * @param {string} [opts.actor]      - Who triggered the event
 * @param {string} [opts.correlationId] - Trace ID for the business transaction
 * @param {Object} [opts.payload]    - Event-specific data
 * @returns {Promise<{ localResult: Object, persistResult: Object|null }>}
 */
async function emitDomainEvent(eventType, {
  entityType,
  entityId,
  action,
  actor = 'system',
  correlationId,
  payload = {},
} = {}) {
  const results = { localResult: null, persistResult: null };

  // 1. Emit on the local in-process bus
  if (bus) {
    try {
      results.localResult = bus.publish({
        type: eventType,
        payload: {
          entity_type: entityType,
          entity_id: entityId,
          action,
          actor,
          timestamp: new Date().toISOString(),
          correlation_id: correlationId || null,
          ...payload,
        },
        source: 'ONYX_PROCUREMENT',
        correlationId,
      });
    } catch (err) {
      console.warn(`[domain-events] Local bus publish failed for ${eventType}:`, err.message);
    }
  }

  // 2. Persist via shared-events producer (fire-and-forget, graceful failure)
  if (producer) {
    try {
      // Map the dotted event type to the topic-map event name
      // e.g. 'procurement.po.approved' -> 'po.approved'
      const shortName = _toShortEventName(eventType);

      results.persistResult = await producer.publish({
        eventName: shortName,
        entityType: entityType,
        entityId: entityId,
        payload: { action, ...payload },
        correlationId,
        actorType: actor === 'system' ? 'system' : 'user',
        actorId: actor,
        sourceModule: eventType.split('.')[0], // 'procurement', 'finance', etc.
      });
    } catch (err) {
      // Non-fatal: table may not exist yet, or event name not in topic-map
      console.debug(`[domain-events] Persist failed for ${eventType} (non-fatal):`, err.message);
    }
  }

  return results;
}

/**
 * Convert a full dotted event type to the short form used by the topic-map.
 * e.g. 'procurement.po.approved' -> 'po.approved'
 *      'commercial.quote.approved' -> 'quote.approved'
 *      'finance.invoice.issued' -> 'invoice.issued'
 *      'governance.audit.created' -> 'audit.entry_created'
 */
function _toShortEventName(fullType) {
  const REMAP = {
    'procurement.po.created':       'po.created',
    'procurement.po.approved':      'po.approved',
    'procurement.rfq.sent':         'rfq.sent',
    'commercial.quote.approved':    'quote.approved',
    'finance.invoice.issued':       'invoice.issued',
    'finance.payment.registered':   'payment.completed',
    'workforce.payroll.calculated': 'payroll.run_calculated',
    'governance.audit.created':     'audit.entry_created',
  };
  return REMAP[fullType] || fullType.split('.').slice(1).join('.');
}

/**
 * Register cross-service event consumers on the local bus.
 * These demonstrate the pattern for reactive workflows.
 * @private
 */
function _registerCrossServiceConsumers(log) {
  if (!bus) return;

  // Consumer 1: When a quote is decided (approved), log that project creation should follow
  bus.subscribe('commercial.quote.approved', (envelope) => {
    const p = envelope.payload || {};
    log.info(
      `[CROSS-SERVICE] commercial.quote.approved --> ` +
      `Project creation should be triggered for supplier=${p.selectedSupplierId || p.supplier_id}, ` +
      `decision=${p.decisionId || p.entity_id}, total=${p.total || 'N/A'}`
    );
  }, { id: 'cross-svc:quote-to-project', priority: -10 });

  // Consumer 2: When a PO is approved, log that inventory reservation should follow
  bus.subscribe('procurement.po.approved', (envelope) => {
    const p = envelope.payload || {};
    log.info(
      `[CROSS-SERVICE] procurement.po.approved --> ` +
      `Inventory reservation should be triggered for PO=${p.poId || p.entity_id}, ` +
      `supplier=${p.supplierId || 'N/A'}`
    );
  }, { id: 'cross-svc:po-to-inventory', priority: -10 });

  // Consumer 3: When a PO is created, log that the finance module should prepare for invoice matching
  bus.subscribe('procurement.po.created', (envelope) => {
    const p = envelope.payload || {};
    log.info(
      `[CROSS-SERVICE] procurement.po.created --> ` +
      `Finance should prepare invoice matching for PO=${p.poId || p.entity_id}, ` +
      `total=${p.total || 'N/A'}`
    );
  }, { id: 'cross-svc:po-to-finance', priority: -10 });

  // Consumer 4: When payment is registered, log that collection should be closed
  bus.subscribe('finance.payment.registered', (envelope) => {
    const p = envelope.payload || {};
    log.info(
      `[CROSS-SERVICE] finance.payment.registered --> ` +
      `Collection record should be closed for invoice=${p.invoiceId || 'N/A'}, ` +
      `amount=${p.amount || 'N/A'}`
    );
  }, { id: 'cross-svc:payment-to-collection', priority: -10 });

  // Wildcard consumer: log all procurement events for observability
  bus.subscribe('procurement.**', (envelope) => {
    log.debug(
      `[EVENT-LOG] ${envelope.type} | entity=${envelope.payload?.entity_type}:${envelope.payload?.entity_id} | actor=${envelope.payload?.actor}`
    );
  }, { id: 'observability:procurement-all', priority: -100 });

  log.info('[domain-events] Cross-service event consumers registered (5 consumers)');
}

/**
 * Get the local event bus instance (for direct subscriptions in sub-modules).
 * @returns {EventBus|null}
 */
function getEventBus() {
  return bus;
}

/**
 * Get the shared-events producer instance.
 * @returns {EventProducer|null}
 */
function getProducer() {
  return producer;
}

module.exports = {
  initDomainEvents,
  emitDomainEvent,
  getEventBus,
  getProducer,
  ONYX_EVENT_TYPES,
};
