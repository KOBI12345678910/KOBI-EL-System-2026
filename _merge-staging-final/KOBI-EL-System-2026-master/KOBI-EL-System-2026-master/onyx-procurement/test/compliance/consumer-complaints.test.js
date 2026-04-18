/**
 * ════════════════════════════════════════════════════════════════════════
 * ConsumerComplaints — unit tests
 * ════════════════════════════════════════════════════════════════════════
 * Agent Y-142 — Techno-Kol Uzi Mega-ERP
 * Run: node --test onyx-procurement/test/compliance/consumer-complaints.test.js
 *
 * Zero external deps. Uses node:test + node:assert/strict.
 * House rule: לא מוחקים רק משדרגים ומגדלים — only add new tests.
 *
 * Coverage map (≥18 tests):
 *   1.  construction defaults
 *   2.  receiveComplaint — basic + id format
 *   3.  receiveComplaint — rejects unknown category
 *   4.  classifyComplaint — critical keyword (Hebrew)
 *   5.  classifyComplaint — critical amount threshold
 *   6.  classifyComplaint — major by refund keyword
 *   7.  classifyComplaint — minor default
 *   8.  assignInvestigator — routes by category ("auto")
 *   9.  assignInvestigator — moves status to under-investigation
 *   10. statutoryDeadline — 14/60 day windows
 *   11. recordResponse — refund resolves complaint
 *   12. recordResponse — reject does NOT resolve
 *   13. recordResponse — rejects unknown responseType
 *   14. refundEligibility — defective always refundable
 *   15. refundEligibility — §14ג online, within window
 *   16. refundEligibility — §14ג online, window expired
 *   17. refundEligibility — §14ג1 elderly extended to 120 days
 *   18. refundEligibility — in-store not eligible (cooling-off N/A)
 *   19. escalateToCommissioner — records + caps fine
 *   20. templateResponse — bilingual + Hebrew RTL content
 *   21. trackSLA — no breach
 *   22. trackSLA — ack breach after 20 days
 *   23. bulkClass — aggregates by category & period
 *   24. consumerRights — bilingual citations include §14ג
 *   25. append-only event log — hash chain integrity
 *   26. listComplaints filter by status
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ConsumerComplaints,
  COMPLAINT_CATEGORIES,
  SEVERITY,
  STATUS,
  PURCHASE_CHANNELS,
  RESPONSE_TYPES,
  COOLING_OFF_DAYS_DEFAULT,
  COOLING_OFF_DAYS_PROTECTED,
  FINE_CEILING_ILS,
  DEFAULT_ACK_HOURS,
  DEFAULT_RESOLVE_HOURS,
} = require('../../src/compliance/consumer-complaints');

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function makeClock(initialIso) {
  let ms = Date.parse(initialIso);
  const fn = () => new Date(ms);
  fn.advanceMs = (n) => { ms += n; };
  fn.advanceHours = (n) => { ms += n * 3_600_000; };
  fn.advanceDays = (n) => { ms += n * 86_400_000; };
  fn.set = (iso) => { ms = Date.parse(iso); };
  return fn;
}

function makeHandler(overrides = {}) {
  return new ConsumerComplaints({
    clock: overrides.clock || makeClock('2026-04-11T09:00:00Z'),
    idSalt: 'test-salt-Y142',
    ...overrides,
  });
}

function basicComplaint(over = {}) {
  return {
    customerId: '123456789',
    orderId: 'ORD-1000',
    category: 'quality',
    description: 'מוצר לא עובד כמצופה',
    channel: 'email',
    purchaseChannel: PURCHASE_CHANNELS.IN_STORE,
    amountIls: 300,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════
//  1. Construction defaults
// ═════════════════════════════════════════════════════════════

test('1. construction — default SLA matches statutory best practice (14/60 days)', () => {
  const h = makeHandler();
  assert.equal(h._slaAckHours, DEFAULT_ACK_HOURS);
  assert.equal(h._slaResolveHours, DEFAULT_RESOLVE_HOURS);
  assert.equal(DEFAULT_ACK_HOURS, 14 * 24);
  assert.equal(DEFAULT_RESOLVE_HOURS, 60 * 24);
});

// ═════════════════════════════════════════════════════════════
//  2. receiveComplaint — basics
// ═════════════════════════════════════════════════════════════

test('2. receiveComplaint — assigns id, hashes customer, records received', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  assert.match(c.id, /^CC-2026-\d{6}$/);
  assert.equal(c.customerIdHash.length, 32);
  assert.notEqual(c.customerIdHash, '123456789');
  assert.equal(c.status, STATUS.RECEIVED);
  assert.equal(c.category, 'quality');
  assert.ok(c.receivedAt);
});

// ═════════════════════════════════════════════════════════════
//  3. receiveComplaint — rejects unknown category
// ═════════════════════════════════════════════════════════════

test('3. receiveComplaint — rejects unknown category', () => {
  const h = makeHandler();
  assert.throws(
    () => h.receiveComplaint(basicComplaint({ category: 'spam' })),
    /unknown category/,
  );
});

// ═════════════════════════════════════════════════════════════
//  4. classifyComplaint — critical keyword (Hebrew)
// ═════════════════════════════════════════════════════════════

test('4. classifyComplaint — Hebrew critical keyword (שריפה) → critical', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'defective-product',
    description: 'המוצר גרם שריפה קטנה בבית',
  }));
  assert.equal(c.severity, SEVERITY.CRITICAL);
});

// ═════════════════════════════════════════════════════════════
//  5. classifyComplaint — amount threshold
// ═════════════════════════════════════════════════════════════

test('5. classifyComplaint — amount ≥₪20,000 auto-escalates to critical', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'delivery',
    description: 'ההזמנה לא הגיעה',
    amountIls: 25_000,
  }));
  assert.equal(c.severity, SEVERITY.CRITICAL);
});

// ═════════════════════════════════════════════════════════════
//  6. classifyComplaint — major by refund keyword
// ═════════════════════════════════════════════════════════════

test('6. classifyComplaint — refund keyword → major', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'warranty',
    description: 'I want a refund because the item is defect',
    amountIls: 500,
  }));
  assert.equal(c.severity, SEVERITY.MAJOR);
});

// ═════════════════════════════════════════════════════════════
//  7. classifyComplaint — minor default
// ═════════════════════════════════════════════════════════════

test('7. classifyComplaint — delivery minor note → minor', () => {
  const h = makeHandler();
  const c = h.receiveComplaint({
    customerId: 'c99',
    category: 'delivery',
    description: 'mail arrived one day late',
    amountIls: 100,
  });
  assert.equal(c.severity, SEVERITY.MINOR);
});

// ═════════════════════════════════════════════════════════════
//  8. assignInvestigator — auto-routes by category
// ═════════════════════════════════════════════════════════════

test('8. assignInvestigator — "auto" routes by category', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({ category: 'privacy', description: 'data leak' }));
  const assigned = h.assignInvestigator({ complaintId: c.id, investigatorId: 'auto' });
  assert.equal(assigned.investigatorId, 'dpo-team');

  const c2 = h.receiveComplaint(basicComplaint({ category: 'delivery', description: 'late' }));
  const a2 = h.assignInvestigator({ complaintId: c2.id, investigatorId: 'auto' });
  assert.equal(a2.investigatorId, 'logistics-team');
});

// ═════════════════════════════════════════════════════════════
//  9. assignInvestigator — transitions status
// ═════════════════════════════════════════════════════════════

test('9. assignInvestigator — moves status to under-investigation + records ack', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  assert.equal(c.status, STATUS.RECEIVED);
  const assigned = h.assignInvestigator({
    complaintId: c.id,
    investigatorId: 'agent-007',
    slaHours: 48,
  });
  assert.equal(assigned.status, STATUS.UNDER_INVESTIGATION);
  assert.equal(assigned.slaHours, 48);
  assert.ok(assigned.acknowledgedAt);
});

// ═════════════════════════════════════════════════════════════
//  10. statutoryDeadline — 14/60 day windows
// ═════════════════════════════════════════════════════════════

test('10. statutoryDeadline — 14 day ack + 60 day resolution', () => {
  const h = makeHandler({ clock: makeClock('2026-04-11T09:00:00Z') });
  const c = h.receiveComplaint(basicComplaint());
  const d = h.statutoryDeadline(c);
  assert.equal(d.acknowledgmentDays, 14);
  assert.equal(d.resolutionDays, 60);
  // ack = receivedAt + 14 days
  const rec = Date.parse(d.receivedAt);
  assert.equal(Date.parse(d.acknowledgmentDeadline) - rec, 14 * 86_400_000);
  assert.equal(Date.parse(d.resolutionDeadline) - rec, 60 * 86_400_000);
  assert.match(d.statute, /חוק הגנת הצרכן/);
});

// ═════════════════════════════════════════════════════════════
//  11. recordResponse — refund resolves
// ═════════════════════════════════════════════════════════════

test('11. recordResponse — refund transitions to resolved', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  h.assignInvestigator({ complaintId: c.id, investigatorId: 'auto' });
  const res = h.recordResponse({
    complaintId: c.id,
    responseType: RESPONSE_TYPES.REFUND,
    amount: 300,
    notes: 'Full refund issued',
  });
  assert.equal(res.status, STATUS.RESOLVED);
  assert.equal(res.responses.length, 1);
  assert.equal(res.responses[0].responseType, 'refund');
  assert.equal(res.responses[0].amountIls, 300);
  assert.ok(res.resolvedAt);
});

// ═════════════════════════════════════════════════════════════
//  12. recordResponse — reject does NOT resolve
// ═════════════════════════════════════════════════════════════

test('12. recordResponse — reject response keeps status "responded"', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  const res = h.recordResponse({
    complaintId: c.id,
    responseType: RESPONSE_TYPES.REJECT,
    notes: 'Outside warranty',
  });
  assert.equal(res.status, STATUS.RESPONDED);
  assert.equal(res.resolvedAt, null);
});

// ═════════════════════════════════════════════════════════════
//  13. recordResponse — rejects unknown responseType
// ═════════════════════════════════════════════════════════════

test('13. recordResponse — invalid responseType throws', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  assert.throws(
    () => h.recordResponse({ complaintId: c.id, responseType: 'ignore' }),
    /invalid responseType/,
  );
});

// ═════════════════════════════════════════════════════════════
//  14. refundEligibility — defective always refundable
// ═════════════════════════════════════════════════════════════

test('14. refundEligibility — defective product always refundable', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'defective-product',
    purchaseChannel: PURCHASE_CHANNELS.IN_STORE,
    purchaseDate: '2025-01-01T00:00:00Z', // > 1 year ago
  }));
  const r = h.refundEligibility(c);
  assert.equal(r.eligible, true);
  assert.match(r.statute, /חוק האחריות למוצרים פגומים/);
  assert.equal(r.coolingOffApplies, false);
});

// ═════════════════════════════════════════════════════════════
//  15. refundEligibility — §14ג within window
// ═════════════════════════════════════════════════════════════

test('15. refundEligibility — online purchase within 14-day §14ג window', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const h = makeHandler({ clock });
  const c = h.receiveComplaint(basicComplaint({
    category: 'refund-denied',
    purchaseChannel: PURCHASE_CHANNELS.ONLINE,
    purchaseDate: '2026-04-05T00:00:00Z', // 6 days ago
  }));
  const r = h.refundEligibility(c);
  assert.equal(r.eligible, true);
  assert.equal(r.coolingOffApplies, true);
  assert.equal(r.windowDays, COOLING_OFF_DAYS_DEFAULT);
  assert.match(r.statute, /§14ג/);
  assert.equal(r.isProtected, false);
});

// ═════════════════════════════════════════════════════════════
//  16. refundEligibility — §14ג window expired
// ═════════════════════════════════════════════════════════════

test('16. refundEligibility — online purchase past 14-day window → not eligible', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const h = makeHandler({ clock });
  const c = h.receiveComplaint(basicComplaint({
    category: 'refund-denied',
    purchaseChannel: PURCHASE_CHANNELS.ONLINE,
    purchaseDate: '2026-03-01T00:00:00Z', // 41 days ago
  }));
  const r = h.refundEligibility(c);
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'cooling-off-expired');
});

// ═════════════════════════════════════════════════════════════
//  17. refundEligibility — §14ג1 elderly extended
// ═════════════════════════════════════════════════════════════

test('17. refundEligibility — elderly (≥65) get 4-month window under §14ג1', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const h = makeHandler({ clock });
  const c = h.receiveComplaint(basicComplaint({
    category: 'refund-denied',
    purchaseChannel: PURCHASE_CHANNELS.ONLINE,
    purchaseDate: '2026-02-01T00:00:00Z', // 69 days ago — would fail normal §14ג
    customerAge: 72,
  }));
  const r = h.refundEligibility(c);
  assert.equal(r.eligible, true);
  assert.equal(r.windowDays, COOLING_OFF_DAYS_PROTECTED);
  assert.equal(r.isProtected, true);
  assert.match(r.statute, /§14ג1/);
});

// ═════════════════════════════════════════════════════════════
//  18. refundEligibility — in-store
// ═════════════════════════════════════════════════════════════

test('18. refundEligibility — in-store non-defective = no cooling-off', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'refund-denied',
    purchaseChannel: PURCHASE_CHANNELS.IN_STORE,
    purchaseDate: '2026-04-10T00:00:00Z',
  }));
  const r = h.refundEligibility(c);
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'not-distance-sale');
});

// ═════════════════════════════════════════════════════════════
//  19. escalateToCommissioner — records + caps fine
// ═════════════════════════════════════════════════════════════

test('19. escalateToCommissioner — records escalation and caps fine at §22 ceiling', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'misleading-ad',
    description: 'פרסום מטעה חמור',
  }));
  const esc = h.escalateToCommissioner(c.id, { fineIls: 100_000, notes: 'Repeat offence' });
  assert.equal(esc.fineCeilingIls, FINE_CEILING_ILS);
  assert.equal(esc.proposedFineIls, FINE_CEILING_ILS); // capped down
  assert.match(esc.commissioner, /הרשות להגנת הצרכן/);
  const after = h.getComplaint(c.id);
  assert.equal(after.status, STATUS.ESCALATED);
  assert.equal(after.escalations.length, 1);
});

// ═════════════════════════════════════════════════════════════
//  20. templateResponse — bilingual
// ═════════════════════════════════════════════════════════════

test('20. templateResponse — bilingual Hebrew + English with statute citation', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint({
    category: 'misleading-ad',
    description: 'פרסום מטעה',
  }));
  const both = h.templateResponse(c, 'bilingual');
  assert.equal(both.lang, 'bilingual');
  assert.ok(both.he.includes('שלום רב'));
  assert.ok(both.he.includes('חוק הגנת הצרכן'));
  assert.ok(both.en.includes('Dear Customer'));
  assert.ok(both.en.includes('Consumer Protection Law'));

  const heOnly = h.templateResponse(c, 'he');
  assert.equal(heOnly.lang, 'he');
  assert.ok(heOnly.body.includes('פרסום מטעה'));

  const enOnly = h.templateResponse(c, 'en');
  assert.equal(enOnly.lang, 'en');
  assert.ok(enOnly.body.includes('Misleading'));
});

// ═════════════════════════════════════════════════════════════
//  21. trackSLA — no breach
// ═════════════════════════════════════════════════════════════

test('21. trackSLA — within window, no breach', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const h = makeHandler({ clock });
  const c = h.receiveComplaint(basicComplaint());
  clock.advanceHours(6);
  const sla = h.trackSLA(c.id);
  assert.equal(sla.breach, false);
  assert.equal(sla.ackBreached, false);
  assert.equal(sla.resolveBreached, false);
  assert.ok(sla.elapsedHours >= 6);
});

// ═════════════════════════════════════════════════════════════
//  22. trackSLA — breach after 20 days
// ═════════════════════════════════════════════════════════════

test('22. trackSLA — ack breach after 20 days without acknowledgment', () => {
  const clock = makeClock('2026-04-11T09:00:00Z');
  const h = makeHandler({ clock });
  const c = h.receiveComplaint(basicComplaint());
  clock.advanceDays(20);
  const sla = h.trackSLA(c.id);
  assert.equal(sla.ackBreached, true);
  assert.equal(sla.breach, true);
});

// ═════════════════════════════════════════════════════════════
//  23. bulkClass — aggregate report
// ═════════════════════════════════════════════════════════════

test('23. bulkClass — aggregates by category, severity, status', () => {
  const clock = makeClock('2026-04-01T09:00:00Z');
  const h = makeHandler({ clock });
  h.receiveComplaint(basicComplaint({ category: 'quality', description: 'minor stain', amountIls: 100 }));
  h.receiveComplaint(basicComplaint({
    category: 'defective-product',
    description: 'שריפה',
    amountIls: 8000,
  }));
  h.receiveComplaint(basicComplaint({
    category: 'refund-denied',
    description: 'סירוב החזר',
    amountIls: 500,
  }));
  const rpt = h.bulkClass({ from: '2026-04-01T00:00:00Z', to: '2026-05-01T00:00:00Z' });
  assert.equal(rpt.total, 3);
  assert.equal(rpt.byCategory['quality'], 1);
  assert.equal(rpt.byCategory['defective-product'], 1);
  assert.equal(rpt.byCategory['refund-denied'], 1);
  // All 9 categories present (shape-stable output)
  for (const c of COMPLAINT_CATEGORIES) {
    assert.ok(Object.prototype.hasOwnProperty.call(rpt.byCategory, c), `missing ${c}`);
  }
  assert.ok(rpt.bySeverity.critical >= 1);
  assert.equal(rpt.totalAmountIls, 8600);
});

// ═════════════════════════════════════════════════════════════
//  24. consumerRights — bilingual citations
// ═════════════════════════════════════════════════════════════

test('24. consumerRights — bilingual rights summary including §14ג', () => {
  const h = makeHandler();
  const r = h.consumerRights();
  assert.match(r.he.title, /חוק הגנת הצרכן/);
  assert.ok(r.he.rights.some((x) => x.section === '§14ג'));
  assert.ok(r.he.rights.some((x) => x.section === '§7'));
  assert.ok(r.he.rights.some((x) => x.section === '§22'));
  assert.ok(r.en.rights.some((x) => x.section === '§14C'));
  assert.match(r.he.regulator, /הרשות להגנת הצרכן/);
  assert.match(r.en.regulator, /Consumer Protection/);
});

// ═════════════════════════════════════════════════════════════
//  25. Append-only event log — hash chain integrity
// ═════════════════════════════════════════════════════════════

test('25. event log — append-only hash chain with no deletions', () => {
  const h = makeHandler();
  const c = h.receiveComplaint(basicComplaint());
  h.assignInvestigator({ complaintId: c.id, investigatorId: 'auto' });
  h.recordResponse({ complaintId: c.id, responseType: 'refund', amount: 300 });
  const events = h.events();
  assert.ok(events.length >= 3);
  assert.equal(events[0].type, 'complaint.received');
  assert.equal(events[1].type, 'complaint.assigned');
  assert.equal(events[2].type, 'complaint.responded');
  // Hash chain: each event's prevHash == previous event's hash
  for (let i = 1; i < events.length; i++) {
    assert.equal(events[i].prevHash, events[i - 1].hash);
  }
  // None of the events are mutable
  assert.throws(() => { events[0].type = 'tampered'; });
});

// ═════════════════════════════════════════════════════════════
//  26. listComplaints filter
// ═════════════════════════════════════════════════════════════

test('26. listComplaints — filter by status + category', () => {
  const h = makeHandler();
  const a = h.receiveComplaint(basicComplaint({ category: 'quality' }));
  const b = h.receiveComplaint(basicComplaint({ category: 'warranty' }));
  h.recordResponse({ complaintId: a.id, responseType: 'refund', amount: 200 });

  const resolved = h.listComplaints({ status: STATUS.RESOLVED });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, a.id);

  const received = h.listComplaints({ status: STATUS.RECEIVED });
  assert.equal(received.length, 1);
  assert.equal(received[0].id, b.id);

  const warranty = h.listComplaints({ category: 'warranty' });
  assert.equal(warranty.length, 1);
});

// ═════════════════════════════════════════════════════════════
//  27. All 9 statutory categories accepted
// ═════════════════════════════════════════════════════════════

test('27. all 9 statutory categories are accepted by receiveComplaint', () => {
  const h = makeHandler();
  for (const cat of COMPLAINT_CATEGORIES) {
    const c = h.receiveComplaint({
      customerId: 'c-' + cat,
      category: cat,
      description: 'test ' + cat,
      amountIls: 50,
    });
    assert.equal(c.category, cat);
  }
  assert.equal(h.listComplaints().length, COMPLAINT_CATEGORIES.length);
  assert.equal(COMPLAINT_CATEGORIES.length, 9);
});
