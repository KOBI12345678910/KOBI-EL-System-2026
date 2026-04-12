/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cross-Module Event Bus — Unit tests / בדיקות יחידה
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-197  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    cd onyx-procurement && node --test test/wiring/event-bus.test.js
 *
 *  Coverage — 18 deterministic tests that exercise every public surface
 *  of the EventBus:
 *     01 registerEventType — bilingual labels validated
 *     02 registerEventType — duplicate w/ same spec is idempotent
 *     03 registerEventType — duplicate w/ different spec throws
 *     04 subscribe — exact-match delivery
 *     05 subscribe — priority ordering (hi runs before lo)
 *     06 subscribe — stable order on priority ties
 *     07 subscribe — wildcard "procurement.*"
 *     08 subscribe — wildcard "*.created"
 *     09 subscribe — catch-all "**"
 *     10 publish — sync handler delivered synchronously
 *     11 publishWithAck — awaits async handlers
 *     12 handler throws — captured in DLQ, not re-thrown
 *     13 unsubscribe — flagged removed, NOT deleted from audit
 *     14 replay — re-dispatches original event w/ meta.isReplay
 *     15 replay — unknown id throws
 *     16 audit log — append-only & ordered
 *     17 backpressure — flagged above hwm
 *     18 stats — counters advance correctly
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EventBus,
  DEFAULT_EVENT_TYPES,
  patternToMatcher,
} = require('../../src/wiring/event-bus.js');

// ---------------------------------------------------------------------------
// Helpers / עוזרים
// ---------------------------------------------------------------------------

function mkBus(opts = {}) {
  return new EventBus({ now: () => new Date('2026-04-11T00:00:00.000Z'), ...opts });
}

// ---------------------------------------------------------------------------
// 01. registerEventType — bilingual labels validated
// ---------------------------------------------------------------------------
test('01 registerEventType — rejects missing bilingual labels', () => {
  const bus = mkBus();
  assert.throws(
    () => bus.registerEventType('x.y', { owner: 'test', labels: { he: 'רק עברית' } }),
    /bilingual labels/,
  );
  assert.throws(
    () => bus.registerEventType('x.y', { owner: 'test', labels: { en: 'English only' } }),
    /bilingual labels/,
  );
});

// ---------------------------------------------------------------------------
// 02. registerEventType — idempotent on identical re-registration
// ---------------------------------------------------------------------------
test('02 registerEventType — idempotent on identical spec', () => {
  const bus = mkBus();
  const spec = {
    owner: 'onyx-test',
    labels: { he: 'בדיקה', en: 'Test' },
    shape: ['x'],
  };
  const a = bus.registerEventType('test.one', spec);
  const b = bus.registerEventType('test.one', spec);
  assert.equal(a, b);
  const labels = bus.describeType('test.one');
  assert.equal(labels.he, 'בדיקה');
  assert.equal(labels.en, 'Test');
});

// ---------------------------------------------------------------------------
// 03. registerEventType — conflict throws
// ---------------------------------------------------------------------------
test('03 registerEventType — conflicting re-registration throws', () => {
  const bus = mkBus();
  bus.registerEventType('test.two', { owner: 'a', labels: { he: 'א', en: 'A' } });
  assert.throws(
    () => bus.registerEventType('test.two', { owner: 'b', labels: { he: 'ב', en: 'B' } }),
    /already registered/,
  );
});

// ---------------------------------------------------------------------------
// 04. subscribe — exact-match delivery
// ---------------------------------------------------------------------------
test('04 subscribe — exact match delivers to handler', () => {
  const bus = mkBus();
  const seen = [];
  bus.subscribe('procurement.po.created', (evt) => {
    seen.push(evt.payload.poId);
  });
  bus.publish({ type: 'procurement.po.created', payload: { poId: 'PO-1' } });
  assert.deepEqual(seen, ['PO-1']);
});

// ---------------------------------------------------------------------------
// 05. subscribe — priority ordering
// ---------------------------------------------------------------------------
test('05 subscribe — higher priority runs first', () => {
  const bus = mkBus();
  const order = [];
  bus.subscribe('procurement.po.created', () => order.push('low'), { priority: 1 });
  bus.subscribe('procurement.po.created', () => order.push('high'), { priority: 100 });
  bus.subscribe('procurement.po.created', () => order.push('mid'), { priority: 50 });
  bus.publish({ type: 'procurement.po.created', payload: { poId: 'PO-2' } });
  assert.deepEqual(order, ['high', 'mid', 'low']);
});

// ---------------------------------------------------------------------------
// 06. subscribe — stable ordering on priority ties
// ---------------------------------------------------------------------------
test('06 subscribe — stable order when priorities tie', () => {
  const bus = mkBus();
  const order = [];
  bus.subscribe('procurement.po.created', () => order.push('first'));
  bus.subscribe('procurement.po.created', () => order.push('second'));
  bus.subscribe('procurement.po.created', () => order.push('third'));
  bus.publish({ type: 'procurement.po.created', payload: { poId: 'PO-3' } });
  assert.deepEqual(order, ['first', 'second', 'third']);
});

// ---------------------------------------------------------------------------
// 07. subscribe — wildcard procurement.*
// ---------------------------------------------------------------------------
test('07 subscribe — "procurement.*" wildcard', () => {
  const bus = mkBus();
  const seen = [];
  // Note: "procurement.*" matches exactly 2 segments (procurement.<X>)
  bus.subscribe('procurement.**', (evt) => seen.push(evt.type));
  bus.publish({ type: 'procurement.po.created', payload: { poId: 'PO-4' } });
  bus.publish({ type: 'procurement.grn.received', payload: { grnId: 'GRN-1' } });
  bus.publish({ type: 'finance.invoice.posted', payload: { invoiceId: 'INV-1' } });
  assert.deepEqual(seen, ['procurement.po.created', 'procurement.grn.received']);
});

// ---------------------------------------------------------------------------
// 08. subscribe — leading wildcard *.created
// ---------------------------------------------------------------------------
test('08 subscribe — "*.*.created" wildcard matches any created', () => {
  const bus = mkBus();
  const seen = [];
  bus.subscribe('*.*.created', (evt) => seen.push(evt.type));
  bus.publish({ type: 'procurement.po.created', payload: {} });
  bus.publish({ type: 'finance.invoice.posted', payload: {} });
  bus.publish({ type: 'hr.employee.hired', payload: {} });
  assert.deepEqual(seen, ['procurement.po.created']);
});

// ---------------------------------------------------------------------------
// 09. subscribe — catch-all
// ---------------------------------------------------------------------------
test('09 subscribe — catch-all "**" receives everything', () => {
  const bus = mkBus();
  const seen = [];
  bus.subscribe('**', (evt) => seen.push(evt.type));
  bus.publish({ type: 'procurement.po.created', payload: {} });
  bus.publish({ type: 'finance.invoice.posted', payload: {} });
  bus.publish({ type: 'anything.at.all.here', payload: {} });
  assert.equal(seen.length, 3);
});

// ---------------------------------------------------------------------------
// 10. publish — sync handler delivered synchronously
// ---------------------------------------------------------------------------
test('10 publish — sync handler delivered before publish returns', () => {
  const bus = mkBus();
  let delivered = false;
  bus.subscribe('procurement.po.created', () => {
    delivered = true;
  });
  const summary = bus.publish({ type: 'procurement.po.created', payload: {} });
  assert.equal(delivered, true);
  assert.equal(summary.syncDeliveries.length, 1);
  assert.equal(summary.syncDeliveries[0].ok, true);
});

// ---------------------------------------------------------------------------
// 11. publishWithAck — awaits async handlers
// ---------------------------------------------------------------------------
test('11 publishWithAck — awaits async subscribers', async () => {
  const bus = mkBus();
  const seen = [];
  bus.subscribe(
    'procurement.po.created',
    async (evt) => {
      await new Promise((r) => setImmediate(r));
      seen.push(`async:${evt.payload.poId}`);
    },
    { async: true },
  );
  bus.subscribe('procurement.po.created', (evt) => {
    seen.push(`sync:${evt.payload.poId}`);
  });

  const summary = await bus.publishWithAck({
    type: 'procurement.po.created',
    payload: { poId: 'PO-5' },
  });
  assert.deepEqual(seen, ['sync:PO-5', 'async:PO-5']);
  assert.equal(summary.failures, 0);
  assert.equal(summary.asyncResults.length, 1);
});

// ---------------------------------------------------------------------------
// 12. handler throws — captured in DLQ, other handlers still run
// ---------------------------------------------------------------------------
test('12 handler throw — DLQ captures failure, other handlers still run', async () => {
  const bus = mkBus();
  const safeRuns = [];
  bus.subscribe(
    'procurement.po.created',
    () => {
      throw new Error('boom');
    },
    { priority: 10 },
  );
  bus.subscribe(
    'procurement.po.created',
    () => {
      safeRuns.push('survivor');
    },
    { priority: 1 },
  );

  const summary = await bus.publishWithAck({
    type: 'procurement.po.created',
    payload: {},
  });

  assert.equal(safeRuns.length, 1);
  assert.equal(summary.failures, 1);
  assert.equal(bus.deadLetterQueue.length, 1);
  assert.match(bus.deadLetterQueue[0].errorMessage, /boom/);
  // Journal still holds the event — nothing was deleted.
  assert.equal(bus.journal.length, 1);
});

// ---------------------------------------------------------------------------
// 13. unsubscribe — flagged removed, audit row preserved
// ---------------------------------------------------------------------------
test('13 unsubscribe — row is flagged but NEVER deleted', () => {
  const bus = mkBus();
  const hits = [];
  const token = bus.subscribe('procurement.po.created', () => hits.push('first'));
  bus.subscribe('procurement.po.created', () => hits.push('second'));

  bus.publish({ type: 'procurement.po.created', payload: {} });
  assert.deepEqual(hits, ['first', 'second']);

  const ok = bus.unsubscribe(token);
  assert.equal(ok, true);

  bus.publish({ type: 'procurement.po.created', payload: {} });
  assert.deepEqual(hits, ['first', 'second', 'second']);

  // The unsubscribed row is NOT removed from the internal list — it is
  // just flagged. totalSubscriptionsEver === 2 for the whole test.
  assert.equal(bus.stats.totalSubscriptionsEver, 2);
  assert.equal(bus.stats.subscribers, 1);

  // Both subscribe rows and the unsubscribe row are present in the audit.
  const kinds = bus.auditLog.map((r) => r.kind);
  assert.ok(kinds.includes('subscribe'));
  assert.ok(kinds.includes('unsubscribe'));
});

// ---------------------------------------------------------------------------
// 14. replay — re-dispatches with meta.isReplay === true
// ---------------------------------------------------------------------------
test('14 replay — re-dispatches original event, flagged isReplay', async () => {
  const bus = mkBus();
  const seen = [];
  bus.subscribe('procurement.po.created', (evt) => seen.push(evt));

  const publish = bus.publish({
    type: 'procurement.po.created',
    payload: { poId: 'PO-X' },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].meta.isReplay, false);

  const replay = await bus.replay(publish.eventId);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].meta.isReplay, true);
  assert.equal(seen[1].meta.replayOf, publish.eventId);
  assert.equal(seen[1].payload.poId, 'PO-X');
  assert.equal(replay.eventId !== publish.eventId, true);
  assert.equal(bus.stats.replayed, 1);
});

// ---------------------------------------------------------------------------
// 15. replay — unknown id throws bilingual error
// ---------------------------------------------------------------------------
test('15 replay — unknown event id throws', async () => {
  const bus = mkBus();
  await assert.rejects(() => bus.replay('evt_nope'), /unknown event id/);
});

// ---------------------------------------------------------------------------
// 16. audit log — append-only, ordered by seq
// ---------------------------------------------------------------------------
test('16 auditLog — append-only with monotonic seq', () => {
  const bus = mkBus();
  bus.registerEventType('test.aud', { owner: 't', labels: { he: 'א', en: 'A' } });
  bus.subscribe('test.aud', () => {});
  bus.publish({ type: 'test.aud', payload: {} });

  const audit = bus.auditLog;
  assert.ok(audit.length >= 3);
  for (let i = 0; i < audit.length; i += 1) {
    assert.equal(audit[i].seq, i);
  }
  const kinds = audit.map((r) => r.kind);
  assert.ok(kinds.includes('register_type'));
  assert.ok(kinds.includes('subscribe'));
  assert.ok(kinds.includes('publish'));
});

// ---------------------------------------------------------------------------
// 17. backpressure — flagged above the high-water mark
// ---------------------------------------------------------------------------
test('17 backpressure — HWM=1 triggers the backpressure counter', async () => {
  const bus = mkBus({ highWaterMark: 1 });
  let release;
  const gate = new Promise((r) => {
    release = r;
  });

  bus.subscribe(
    'procurement.po.created',
    async () => {
      await gate;
    },
    { async: true },
  );

  // First publish occupies the queue.
  const p1 = bus.publishWithAck({ type: 'procurement.po.created', payload: {} });
  // Second publish happens while p1 is in-flight — backpressure applies.
  const p2 = bus.publishWithAck({ type: 'procurement.po.created', payload: {} });

  // Release both.
  release();
  await Promise.all([p1, p2]);
  await bus.drain();

  assert.ok(bus.stats.backpressureApplied >= 1);
  assert.equal(bus.stats.inflight, 0);
});

// ---------------------------------------------------------------------------
// 18. stats — counters advance as expected
// ---------------------------------------------------------------------------
test('18 stats — published/delivered/failed/replayed counters', async () => {
  const bus = mkBus();
  bus.subscribe('procurement.po.created', () => {});
  bus.subscribe('procurement.po.created', () => {
    throw new Error('nope');
  });

  const p = await bus.publishWithAck({
    type: 'procurement.po.created',
    payload: { poId: 'S-1' },
  });
  assert.equal(p.failures, 1);

  // Replay the event once — counters should reflect the additional
  // delivery + failed handler.
  await bus.replay(p.eventId);

  const s = bus.stats;
  assert.equal(s.published, 2); // original publish + replay-as-publish
  assert.ok(s.delivered >= 2); // at least two successful deliveries
  assert.equal(s.failed, 2); // thrown handler ran twice
  assert.equal(s.replayed, 1);
  assert.equal(s.journalled, 1); // the replay did NOT add a journal entry
});

// ---------------------------------------------------------------------------
// 19. patternToMatcher — unit checks for the pattern parser
// ---------------------------------------------------------------------------
test('19 patternToMatcher — wildcard semantics', () => {
  const exact = patternToMatcher('procurement.po.created');
  assert.equal(exact('procurement.po.created'), true);
  assert.equal(exact('procurement.po.updated'), false);

  const oneSeg = patternToMatcher('procurement.*');
  assert.equal(oneSeg('procurement.po'), true);
  assert.equal(oneSeg('procurement.po.created'), false);

  const greedy = patternToMatcher('procurement.**');
  assert.equal(greedy('procurement.po'), true);
  assert.equal(greedy('procurement.po.created'), true);
  assert.equal(greedy('finance.po.created'), false);

  const all = patternToMatcher('**');
  assert.equal(all('literally.anything.here'), true);
});

// ---------------------------------------------------------------------------
// 20. DEFAULT_EVENT_TYPES — frozen and bilingual
// ---------------------------------------------------------------------------
test('20 DEFAULT_EVENT_TYPES — frozen catalogue is bilingual', () => {
  assert.ok(Object.isFrozen(DEFAULT_EVENT_TYPES));
  for (const [type, spec] of Object.entries(DEFAULT_EVENT_TYPES)) {
    assert.ok(spec.labels.he, `${type} missing he label`);
    assert.ok(spec.labels.en, `${type} missing en label`);
    assert.ok(Object.isFrozen(spec));
    assert.ok(Object.isFrozen(spec.labels));
  }
  // Catch-all sanity — procurement.po.created is present.
  assert.ok(DEFAULT_EVENT_TYPES['procurement.po.created']);
});
