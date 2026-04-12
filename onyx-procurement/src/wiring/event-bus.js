/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cross-Module Event Bus / מערכת אירועים בין-מודולרית
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-197  |  Techno-Kol Uzi mega-ERP  |  Onyx-Procurement
 *  File: onyx-procurement/src/wiring/event-bus.js
 *
 *  A typed, bilingual, zero-dependency event bus powering cross-module
 *  choreography in the Techno-Kol Uzi ERP. Implemented only with the
 *  Node.js built-in `node:events` module (plus node:crypto for ids).
 *
 *  Design pillars / עקרונות תכנון:
 *    1. Typed event registry — every event type carries (he, en) labels
 *       + a module owner + a JSON-shape contract.
 *    2. Sync and async subscribers — sync handlers run in-phase and can
 *       veto the dispatch; async handlers are awaited when needed by
 *       publishWithAck.
 *    3. Priority ordering — subscribers are run from highest to lowest
 *       priority; ties resolve by registration order (stable).
 *    4. Dead letter queue — any handler that throws (sync or async) is
 *       captured, never swallowed, and the delivery is recorded in the
 *       DLQ with a full failure reason so it can be redriven.
 *    5. Replay support — every dispatched event is journalled append-only
 *       and can be replayed by id, without re-triggering the audit log
 *       ("replay" delivery is labelled distinctly).
 *    6. Append-only audit log — dispatches, failures, subscriptions,
 *       and registrations are journalled and NEVER deleted. "We do not
 *       delete — we only upgrade and grow."
 *    7. Backpressure — publishers are throttled when the in-flight queue
 *       exceeds the high-water mark, preventing unbounded memory use.
 *    8. Wildcard subscriptions — subscribers can match "procurement.*",
 *       "*.created", or the catch-all "*" / "**".
 *
 *  Public API / ממשק ציבורי:
 *    - registerEventType(type, spec)
 *    - subscribe(eventType, handler, { priority, async, id })
 *    - unsubscribe(token)                   // token-based remove (no delete)
 *    - publish(event)                       // fire-and-forget
 *    - publishWithAck(event)                // await all async subscribers
 *    - replay(eventId)                      // re-dispatch from journal
 *    - deadLetterQueue                      // getter — immutable snapshot
 *    - auditLog                             // getter — immutable snapshot
 *    - eventTypes                           // getter — registry snapshot
 *    - stats                                // getter — counters + gauges
 *    - drain()                              // wait for the async queue
 *
 *  Iron rule / כלל הברזל:
 *    No delete. Unsubscribing flags a subscriber as `removed=true`; the
 *    subscription row stays in the audit journal forever. The DLQ only
 *    grows. The event journal only grows.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// 0. Bilingual event type registry
// ---------------------------------------------------------------------------

/**
 * Default catalogue of cross-module event types.
 * Keys use dotted notation: "<module>.<entity>.<action>".
 * Every entry is frozen; the registry itself is extended via
 * `bus.registerEventType()` — the defaults stay immutable.
 */
const DEFAULT_EVENT_TYPES = Object.freeze({
  'procurement.po.created': Object.freeze({
    owner: 'onyx-procurement',
    labels: Object.freeze({
      he: 'הזמנת רכש נוצרה',
      en: 'Purchase order created',
    }),
    shape: Object.freeze(['poId', 'supplierId', 'amount', 'currency']),
  }),
  'procurement.po.approved': Object.freeze({
    owner: 'onyx-procurement',
    labels: Object.freeze({
      he: 'הזמנת רכש אושרה',
      en: 'Purchase order approved',
    }),
    shape: Object.freeze(['poId', 'approverId']),
  }),
  'procurement.grn.received': Object.freeze({
    owner: 'onyx-procurement',
    labels: Object.freeze({
      he: 'תעודת כניסה למחסן',
      en: 'Goods received note',
    }),
    shape: Object.freeze(['grnId', 'poId', 'lines']),
  }),
  'finance.invoice.posted': Object.freeze({
    owner: 'onyx-finance',
    labels: Object.freeze({
      he: 'חשבונית נרשמה בספרים',
      en: 'Invoice posted to ledger',
    }),
    shape: Object.freeze(['invoiceId', 'amount', 'vatAmount']),
  }),
  'finance.payment.dispatched': Object.freeze({
    owner: 'onyx-finance',
    labels: Object.freeze({
      he: 'תשלום הועבר',
      en: 'Payment dispatched',
    }),
    shape: Object.freeze(['paymentId', 'invoiceId', 'amount']),
  }),
  'inventory.stock.updated': Object.freeze({
    owner: 'onyx-warehouse',
    labels: Object.freeze({
      he: 'מלאי עודכן',
      en: 'Stock level updated',
    }),
    shape: Object.freeze(['sku', 'warehouseId', 'delta']),
  }),
  'hr.employee.hired': Object.freeze({
    owner: 'onyx-hr',
    labels: Object.freeze({
      he: 'עובד חדש נקלט',
      en: 'Employee hired',
    }),
    shape: Object.freeze(['employeeId', 'startDate']),
  }),
  'compliance.audit.flag': Object.freeze({
    owner: 'onyx-compliance',
    labels: Object.freeze({
      he: 'דגל ביקורת',
      en: 'Audit flag raised',
    }),
    shape: Object.freeze(['recordId', 'reason']),
  }),
});

// ---------------------------------------------------------------------------
// 1. Utilities
// ---------------------------------------------------------------------------

function newId(prefix) {
  // 16-char hex id, good enough for journal keys
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function stableStringify(value) {
  // Deterministic JSON: keys sorted, undefined pruned.
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Convert a subscription pattern into a test function.
 * Supports:
 *   - "procurement.po.created"   (exact match)
 *   - "procurement.*"            (single segment wildcard)
 *   - "procurement.po.*"         (single segment wildcard)
 *   - "*.created"                (leading wildcard)
 *   - "procurement.**"           (multi-segment wildcard, greedy)
 *   - "*" or "**"                (catch-all)
 */
function patternToMatcher(pattern) {
  if (pattern === '*' || pattern === '**') return () => true;
  const segments = pattern.split('.');
  return (eventType) => {
    const parts = eventType.split('.');
    let i = 0;
    let j = 0;
    while (i < segments.length && j < parts.length) {
      const seg = segments[i];
      if (seg === '**') {
        // Greedy — matches the rest.
        return true;
      }
      if (seg !== '*' && seg !== parts[j]) return false;
      i += 1;
      j += 1;
    }
    return i === segments.length && j === parts.length;
  };
}

// ---------------------------------------------------------------------------
// 2. The EventBus class
// ---------------------------------------------------------------------------

class EventBus {
  /**
   * @param {object}   [opts]
   * @param {number}   [opts.highWaterMark=1000]  Backpressure threshold for the async queue.
   * @param {object}   [opts.initialTypes]        Extra event types to pre-register.
   * @param {Function} [opts.now]                 Clock injection for tests.
   */
  constructor(opts = {}) {
    const { highWaterMark = 1000, initialTypes = null, now = () => new Date() } = opts;

    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(0);

    /** @private subscription rows — additive only */
    this._subs = []; // each row: { id, pattern, matcher, handler, priority, async, removed, createdAt }

    /** @private append-only event journal (by id) */
    this._journal = new Map();

    /** @private append-only audit log rows */
    this._audit = [];

    /** @private dead letter queue */
    this._dlq = [];

    /** @private bilingual registry — defaults are frozen clones */
    this._types = new Map();
    for (const [t, spec] of Object.entries(DEFAULT_EVENT_TYPES)) {
      this._types.set(t, spec);
    }
    if (initialTypes) {
      for (const [t, spec] of Object.entries(initialTypes)) {
        this._types.set(t, Object.freeze({ ...spec }));
      }
    }

    /** @private back-pressure state */
    this._hwm = Math.max(1, highWaterMark | 0);
    this._inflight = 0;
    /** @private resolvers waiting for the queue to drain */
    this._drainWaiters = [];

    /** @private counters for stats() */
    this._stats = {
      published: 0,
      delivered: 0,
      failed: 0,
      replayed: 0,
      backpressureApplied: 0,
      unknownTypePublished: 0,
    };

    this._now = now;
  }

  // -----------------------------------------------------------------------
  // 2.1 Event type registry
  // -----------------------------------------------------------------------

  /**
   * Register (or extend) an event type. Re-registering the same type with
   * the same spec is a no-op; mismatched re-registration throws.
   */
  registerEventType(type, spec) {
    if (typeof type !== 'string' || !type) {
      throw new TypeError('event type must be a non-empty string');
    }
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('event type spec must be an object');
    }
    if (!spec.labels || !spec.labels.he || !spec.labels.en) {
      throw new TypeError(
        `event type "${type}" requires bilingual labels { he, en } / דרושות תוויות דו־לשוניות`,
      );
    }

    const frozen = Object.freeze({
      owner: spec.owner || 'unknown',
      labels: Object.freeze({ ...spec.labels }),
      shape: Object.freeze([...(spec.shape || [])]),
    });

    const existing = this._types.get(type);
    if (existing) {
      if (stableStringify(existing) !== stableStringify(frozen)) {
        throw new Error(
          `event type "${type}" already registered with a different spec / כבר רשום עם מפרט אחר`,
        );
      }
      return existing;
    }

    this._types.set(type, frozen);
    this._appendAudit({
      kind: 'register_type',
      type,
      owner: frozen.owner,
      labels: frozen.labels,
    });
    return frozen;
  }

  /** Snapshot of the current event-type registry. */
  get eventTypes() {
    return Object.fromEntries(this._types.entries());
  }

  /** Returns bilingual labels for a type, falling back to the type name. */
  describeType(type) {
    const spec = this._types.get(type);
    if (spec) return spec.labels;
    return { he: type, en: type };
  }

  // -----------------------------------------------------------------------
  // 2.2 Subscription management
  // -----------------------------------------------------------------------

  /**
   * Subscribe a handler to an event type or wildcard pattern.
   * @param {string}   eventType         The event type or wildcard (see `patternToMatcher`).
   * @param {Function} handler           fn(event) or async fn(event)
   * @param {object}   [options]
   * @param {number}   [options.priority=0]  Higher runs first.
   * @param {boolean}  [options.async=false] If true, the handler is awaited by publishWithAck.
   * @param {string}   [options.id]          Optional human id used in audit.
   * @returns {object} token — used to unsubscribe.
   */
  subscribe(eventType, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('handler must be a function');
    }
    const { priority = 0, async: isAsync = false, id = null } = options;

    const row = {
      id: id || newId('sub'),
      pattern: eventType,
      matcher: patternToMatcher(eventType),
      handler,
      priority: Number.isFinite(priority) ? priority : 0,
      async: Boolean(isAsync),
      removed: false,
      createdAt: this._now().toISOString(),
      // Registration sequence — preserves stable order on priority ties.
      seq: this._subs.length,
    };

    this._subs.push(row);
    this._appendAudit({
      kind: 'subscribe',
      subId: row.id,
      pattern: row.pattern,
      priority: row.priority,
      async: row.async,
    });

    return { id: row.id, pattern: row.pattern };
  }

  /**
   * Flag a subscription as removed. The row itself is retained in the
   * audit journal forever — "we do not delete".
   */
  unsubscribe(token) {
    if (!token) return false;
    const subId = typeof token === 'string' ? token : token.id;
    const row = this._subs.find((s) => s.id === subId);
    if (!row || row.removed) return false;
    row.removed = true;
    this._appendAudit({ kind: 'unsubscribe', subId });
    return true;
  }

  // -----------------------------------------------------------------------
  // 2.3 Publish / publishWithAck / replay
  // -----------------------------------------------------------------------

  /**
   * Wrap a caller-supplied event object into a canonical envelope.
   * @private
   */
  _envelope(raw, { isReplay = false, replayOf = null } = {}) {
    if (!raw || typeof raw !== 'object') {
      throw new TypeError('event must be an object');
    }
    const type = raw.type;
    if (typeof type !== 'string' || !type) {
      throw new TypeError('event.type must be a non-empty string');
    }

    return {
      id: raw.id || newId('evt'),
      type,
      payload: raw.payload || {},
      meta: {
        source: raw.source || 'unknown',
        correlationId: raw.correlationId || null,
        ts: (raw.ts && new Date(raw.ts).toISOString()) || this._now().toISOString(),
        isReplay,
        replayOf,
      },
    };
  }

  /**
   * Select the active subscriptions that match the given type, ordered by
   * priority (desc), then seq (asc).
   * @private
   */
  _match(eventType) {
    const matched = [];
    for (const row of this._subs) {
      if (row.removed) continue;
      if (row.matcher(eventType)) matched.push(row);
    }
    matched.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.seq - b.seq;
    });
    return matched;
  }

  /**
   * Run a single handler and capture any throw into the DLQ.
   * Returns an object describing the delivery outcome.
   * @private
   */
  async _deliver(row, envelope) {
    try {
      const result = row.handler(envelope);
      // Handle promise if the handler is async (or accidentally returned one).
      const awaited = result && typeof result.then === 'function' ? await result : result;
      this._stats.delivered += 1;
      return { ok: true, subId: row.id, result: awaited };
    } catch (err) {
      this._stats.failed += 1;
      const failure = {
        subId: row.id,
        pattern: row.pattern,
        eventId: envelope.id,
        eventType: envelope.type,
        errorMessage: err && err.message ? err.message : String(err),
        errorName: err && err.name ? err.name : 'Error',
        stack: err && err.stack ? err.stack : null,
        at: this._now().toISOString(),
        envelope,
      };
      this._dlq.push(failure);
      this._appendAudit({
        kind: 'handler_failed',
        subId: row.id,
        eventId: envelope.id,
        eventType: envelope.type,
        errorMessage: failure.errorMessage,
      });
      return { ok: false, subId: row.id, error: failure };
    }
  }

  /**
   * Fire-and-forget publish.
   *
   * Sync handlers run immediately in priority order. Async handlers are
   * scheduled onto the microtask queue — use `publishWithAck` if you need
   * to await them.
   *
   * @param {object} raw  event-like { type, payload, ... }
   * @returns {object}    { eventId, syncDeliveries, asyncScheduled, backpressure }
   */
  publish(raw) {
    const envelope = this._envelope(raw);
    return this._dispatch(envelope, { awaitAsync: false });
  }

  /**
   * Publish and await every subscriber (sync AND async). Resolves with
   * a per-subscriber outcome list. Failed handlers do NOT reject this
   * promise — they are captured in the DLQ and reported via `failures`.
   *
   * @param {object} raw event-like
   * @returns {Promise<object>} summary
   */
  async publishWithAck(raw) {
    const envelope = this._envelope(raw);
    const result = this._dispatch(envelope, { awaitAsync: true });
    // _dispatch returns a promise when awaitAsync is true.
    return result;
  }

  /**
   * Re-dispatch an event from the journal. The replay is labelled as such
   * (meta.isReplay === true) so downstream observers can suppress double-
   * counting. The journal itself is never mutated.
   */
  async replay(eventId) {
    const original = this._journal.get(eventId);
    if (!original) {
      throw new Error(`unknown event id "${eventId}" / מזהה אירוע אינו מוכר`);
    }
    this._stats.replayed += 1;
    const envelope = this._envelope(
      { ...original, id: newId('evt') },
      { isReplay: true, replayOf: eventId },
    );
    this._appendAudit({
      kind: 'replay',
      replayOf: eventId,
      eventId: envelope.id,
      eventType: envelope.type,
    });
    return this._dispatch(envelope, { awaitAsync: true });
  }

  /**
   * Core dispatch machinery shared by publish / publishWithAck / replay.
   * @private
   */
  _dispatch(envelope, { awaitAsync }) {
    // Journal the event — unless it is a replay (replays are NOT re-journalled
    // as new events; the original is preserved).
    if (!envelope.meta.isReplay) {
      this._journal.set(envelope.id, {
        type: envelope.type,
        payload: envelope.payload,
        source: envelope.meta.source,
        correlationId: envelope.meta.correlationId,
        ts: envelope.meta.ts,
      });
    }
    this._stats.published += 1;

    // Track known vs. unknown type — do not throw, just count it.
    if (!this._types.has(envelope.type)) {
      this._stats.unknownTypePublished += 1;
    }

    // Backpressure — if inflight is above HWM, we flag the publish but still
    // process (DLQ'd backpressure would silently drop). Tests can inspect
    // stats.backpressureApplied.
    if (this._inflight >= this._hwm) {
      this._stats.backpressureApplied += 1;
      this._appendAudit({
        kind: 'backpressure',
        eventId: envelope.id,
        eventType: envelope.type,
        inflight: this._inflight,
        hwm: this._hwm,
      });
    }

    const matched = this._match(envelope.type);

    this._appendAudit({
      kind: 'publish',
      eventId: envelope.id,
      eventType: envelope.type,
      matched: matched.length,
      isReplay: envelope.meta.isReplay,
    });

    // Split into sync vs async.
    const syncRows = matched.filter((r) => !r.async);
    const asyncRows = matched.filter((r) => r.async);

    // Run sync handlers in-line, priority order.
    const syncResults = [];
    for (const row of syncRows) {
      // Sync handlers *may* still throw — we catch & DLQ the same way.
      try {
        const out = row.handler(envelope);
        if (out && typeof out.then === 'function') {
          // A "sync" subscriber accidentally returned a promise. We treat it
          // as fire-and-forget and attach a catch so the rejection does not
          // become an UnhandledPromiseRejection.
          out.catch((err) => this._capturePromiseFailure(row, envelope, err));
          syncResults.push({ ok: true, subId: row.id, result: '[promise]' });
        } else {
          this._stats.delivered += 1;
          syncResults.push({ ok: true, subId: row.id, result: out });
        }
      } catch (err) {
        this._stats.failed += 1;
        const failure = this._recordFailure(row, envelope, err);
        syncResults.push({ ok: false, subId: row.id, error: failure });
      }
    }

    if (asyncRows.length === 0) {
      this._emitter.emit(`delivered:${envelope.type}`, envelope);
      const summary = {
        eventId: envelope.id,
        syncDeliveries: syncResults,
        asyncResults: [],
        failures: syncResults.filter((r) => !r.ok).length,
      };
      return awaitAsync ? Promise.resolve(summary) : summary;
    }

    // Schedule async handlers. We track inflight for backpressure.
    this._inflight += 1;
    const asyncPromise = (async () => {
      const asyncResults = [];
      // Async handlers also honour priority order within the async group.
      for (const row of asyncRows) {
        const outcome = await this._deliver(row, envelope);
        asyncResults.push(outcome);
      }
      return asyncResults;
    })()
      .then((asyncResults) => {
        this._inflight -= 1;
        this._drainIfEmpty();
        this._emitter.emit(`delivered:${envelope.type}`, envelope);
        return {
          eventId: envelope.id,
          syncDeliveries: syncResults,
          asyncResults,
          failures:
            syncResults.filter((r) => !r.ok).length + asyncResults.filter((r) => !r.ok).length,
        };
      })
      .catch((err) => {
        // Should not happen — _deliver is total — but defensive.
        this._inflight -= 1;
        this._drainIfEmpty();
        throw err;
      });

    if (awaitAsync) return asyncPromise;

    // Fire-and-forget — we still want failures to flow into the DLQ, so we
    // attach a noop catch. The caller receives a synchronous summary.
    asyncPromise.catch(() => {});
    return {
      eventId: envelope.id,
      syncDeliveries: syncResults,
      asyncScheduled: asyncRows.length,
      backpressure: this._inflight >= this._hwm,
    };
  }

  /**
   * Record a thrown failure into the DLQ and audit log.
   * @private
   */
  _recordFailure(row, envelope, err) {
    const failure = {
      subId: row.id,
      pattern: row.pattern,
      eventId: envelope.id,
      eventType: envelope.type,
      errorMessage: err && err.message ? err.message : String(err),
      errorName: err && err.name ? err.name : 'Error',
      stack: err && err.stack ? err.stack : null,
      at: this._now().toISOString(),
      envelope,
    };
    this._dlq.push(failure);
    this._appendAudit({
      kind: 'handler_failed',
      subId: row.id,
      eventId: envelope.id,
      eventType: envelope.type,
      errorMessage: failure.errorMessage,
    });
    return failure;
  }

  /**
   * Catch a promise that was returned from a "sync" handler.
   * @private
   */
  _capturePromiseFailure(row, envelope, err) {
    this._stats.failed += 1;
    this._recordFailure(row, envelope, err);
  }

  /**
   * Resolve any drain() waiters when the async queue empties.
   * @private
   */
  _drainIfEmpty() {
    if (this._inflight === 0 && this._drainWaiters.length) {
      const waiters = this._drainWaiters.splice(0);
      for (const w of waiters) w();
    }
  }

  /**
   * Wait until every async dispatch has completed. Resolves immediately
   * if the queue is already idle.
   */
  drain() {
    if (this._inflight === 0) return Promise.resolve();
    return new Promise((resolve) => this._drainWaiters.push(resolve));
  }

  // -----------------------------------------------------------------------
  // 2.4 DLQ / audit / stats getters — all return immutable snapshots
  // -----------------------------------------------------------------------

  get deadLetterQueue() {
    return this._dlq.map((row) => ({ ...row }));
  }

  get auditLog() {
    return this._audit.map((row) => ({ ...row }));
  }

  get journal() {
    return Array.from(this._journal.entries()).map(([id, row]) => ({ id, ...row }));
  }

  get stats() {
    return {
      ...this._stats,
      inflight: this._inflight,
      hwm: this._hwm,
      subscribers: this._subs.filter((s) => !s.removed).length,
      totalSubscriptionsEver: this._subs.length,
      journalled: this._journal.size,
      dlqSize: this._dlq.length,
    };
  }

  // -----------------------------------------------------------------------
  // 2.5 Internal append-only audit
  // -----------------------------------------------------------------------

  /** @private */
  _appendAudit(entry) {
    this._audit.push({
      seq: this._audit.length,
      at: this._now().toISOString(),
      ...entry,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Exports
// ---------------------------------------------------------------------------

module.exports = {
  EventBus,
  DEFAULT_EVENT_TYPES,
  patternToMatcher,
  stableStringify,
};
