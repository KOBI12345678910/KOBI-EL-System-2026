/**
 * Dunning & Collections — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent X-48 (Swarm 3C)
 *
 * Run with:  node --test test/payroll/dunning.test.js
 *
 * 30+ test cases covering aging buckets, dunning schedule, promises,
 * disputes, payments, plans, write-off, metrics, bilingual rendering,
 * and every Israeli legal constraint (cooling period, harassment cap,
 * statute of limitations, interest cap).
 *
 * Zero external deps — uses only the Node built-in test runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const dun = require(path.resolve(__dirname, '..', '..', 'src', 'collections', 'dunning.js'));

const {
  runDunning,
  sendReminder,
  recordPromise,
  reconcilePromises,
  flagDispute,
  clearDispute,
  recordPayment,
  agingReport,
  writeOff,
  collectionMetrics,
  upsertInvoice,
  upsertCustomer,
  createPaymentPlan,
  assignAgent,
  customerCommLog,
  maxLegalInterest,
  computeLateInterest,
  createStore,
  configure,
  daysBetween,
  addDays,
  bucketFor,
  outstandingOf,
  stageForDay,
  renderMessage,
  formatTemplate,
  STAGES,
  CHANNELS,
  BUCKETS,
  DUNNING_SCHEDULE,
} = dun;

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

function seed(asOf) {
  const s = createStore();
  upsertCustomer({ id: 'C1', name: 'Acme Ltd', language: 'he', email: 'ap@acme.co.il' }, s);
  upsertCustomer({ id: 'C2', name: 'Beta Co', language: 'en' }, s);
  const base = asOf || new Date('2026-04-11T00:00:00Z');
  upsertInvoice({ id: 'INV-CURR', customer_id: 'C1', amount: 1000, due_date: addDays(base, 5).toISOString() }, s);
  upsertInvoice({ id: 'INV-01',   customer_id: 'C1', amount: 2000, due_date: addDays(base, -1).toISOString()  }, s);
  upsertInvoice({ id: 'INV-07',   customer_id: 'C1', amount: 3000, due_date: addDays(base, -7).toISOString()  }, s);
  upsertInvoice({ id: 'INV-15',   customer_id: 'C1', amount: 4000, due_date: addDays(base, -15).toISOString() }, s);
  upsertInvoice({ id: 'INV-30',   customer_id: 'C2', amount: 5000, due_date: addDays(base, -30).toISOString() }, s);
  upsertInvoice({ id: 'INV-45',   customer_id: 'C2', amount: 6000, due_date: addDays(base, -45).toISOString() }, s);
  upsertInvoice({ id: 'INV-60',   customer_id: 'C2', amount: 7000, due_date: addDays(base, -60).toISOString() }, s);
  upsertInvoice({ id: 'INV-91',   customer_id: 'C2', amount: 8000, due_date: addDays(base, -91).toISOString() }, s);
  return { store: s, asOf: base };
}

// ─────────────────────────────────────────────────────────────
// 1. Date & math primitives
// ─────────────────────────────────────────────────────────────

test('daysBetween returns positive for past dates', () => {
  const a = new Date('2026-01-01T00:00:00Z');
  const b = new Date('2026-01-11T00:00:00Z');
  assert.equal(daysBetween(a, b), 10);
});

test('daysBetween handles DST boundary without drift', () => {
  const a = new Date('2026-03-27T00:00:00Z');
  const b = new Date('2026-03-28T00:00:00Z');
  assert.equal(daysBetween(a, b), 1);
});

test('addDays returns new date; does not mutate input', () => {
  const a = new Date('2026-04-11T00:00:00Z');
  const b = addDays(a, 7);
  assert.equal(b.toISOString().slice(0, 10), '2026-04-18');
  assert.equal(a.toISOString().slice(0, 10), '2026-04-11');
});

// ─────────────────────────────────────────────────────────────
// 2. Aging buckets
// ─────────────────────────────────────────────────────────────

test('bucketFor classifies every overdue range correctly', () => {
  assert.equal(bucketFor(-5), 'current');
  assert.equal(bucketFor(0),  'current');
  assert.equal(bucketFor(1),  '1_30');
  assert.equal(bucketFor(30), '1_30');
  assert.equal(bucketFor(31), '31_60');
  assert.equal(bucketFor(60), '31_60');
  assert.equal(bucketFor(61), '61_90');
  assert.equal(bucketFor(90), '61_90');
  assert.equal(bucketFor(91), '91_plus');
  assert.equal(bucketFor(9999), '91_plus');
});

test('agingReport totals outstanding amounts across buckets', () => {
  const { store, asOf } = seed();
  const rep = agingReport(asOf, store);
  // Current = 1000, 1_30 = 2000+3000+4000+5000=14000, 31_60=6000+7000=13000, 91_plus=8000
  assert.equal(rep.buckets.current,    1000);
  assert.equal(rep.buckets['1_30'],    14000);
  assert.equal(rep.buckets['31_60'],   13000);
  assert.equal(rep.buckets['61_90'],   0);
  assert.equal(rep.buckets['91_plus'], 8000);
  assert.equal(rep.totals.outstanding, 36000);
  assert.equal(rep.totals.overdue_count, 7);
});

test('agingReport groups by customer with per-customer totals', () => {
  const { store, asOf } = seed();
  const rep = agingReport(asOf, store);
  assert.equal(rep.by_customer.C1.total, 10000); // 1000+2000+3000+4000
  assert.equal(rep.by_customer.C2.total, 26000); // 5000+6000+7000+8000
  assert.equal(rep.by_customer.C1.current, 1000);
});

test('agingReport excludes written-off invoices', () => {
  const { store, asOf } = seed();
  writeOff('INV-91', 'uncollectible', 'cfo_approval', store);
  const rep = agingReport(asOf, store);
  assert.equal(rep.buckets['91_plus'], 0);
  assert.equal(rep.totals.outstanding, 28000);
});

// ─────────────────────────────────────────────────────────────
// 3. Dunning schedule lookup
// ─────────────────────────────────────────────────────────────

test('stageForDay picks the latest matching schedule entry', () => {
  assert.equal(stageForDay(0),  null);
  assert.equal(stageForDay(1).stage,  STAGES.COURTESY);
  assert.equal(stageForDay(6).stage,  STAGES.COURTESY);
  assert.equal(stageForDay(7).stage,  STAGES.FRIENDLY);
  assert.equal(stageForDay(14).stage, STAGES.FRIENDLY);
  assert.equal(stageForDay(15).stage, STAGES.FORMAL);
  assert.equal(stageForDay(30).stage, STAGES.SECOND);
  assert.equal(stageForDay(45).stage, STAGES.PRE_LEGAL);
  assert.equal(stageForDay(60).stage, STAGES.LEGAL);
  assert.equal(stageForDay(90).stage, STAGES.WRITE_OFF);
  assert.equal(stageForDay(200).stage, STAGES.WRITE_OFF);
});

test('DUNNING_SCHEDULE has all 7 mandatory stages', () => {
  const days = DUNNING_SCHEDULE.map((e) => e.day);
  assert.deepEqual(days, [1, 7, 15, 30, 45, 60, 90]);
});

// ─────────────────────────────────────────────────────────────
// 4. runDunning — core orchestration
// ─────────────────────────────────────────────────────────────

test('runDunning fires a touch for each overdue invoice at the right stage', () => {
  const { store, asOf } = seed();
  const { actions, counts_by_stage } = runDunning(asOf, { store });
  // Stages hit: courtesy(INV-01), friendly(INV-07), formal(INV-15),
  // second(INV-30), pre_legal(INV-45), legal should be SKIPPED (no prior pre_legal),
  // write_off recommendation(INV-91).
  assert.ok(counts_by_stage[STAGES.COURTESY]  >= 1);
  assert.ok(counts_by_stage[STAGES.FRIENDLY]  >= 1);
  assert.ok(counts_by_stage[STAGES.FORMAL]    >= 1);
  assert.ok(counts_by_stage[STAGES.SECOND]    >= 1);
  assert.ok(counts_by_stage[STAGES.PRE_LEGAL] >= 1);
  // Every action should carry bilingual text.
  for (const a of actions.filter((x) => x.message_he)) {
    assert.ok(a.message_he.length > 0);
    assert.ok(a.message_en.length > 0);
    assert.ok(/ש"ח|חשבונית|הודעה|תזכורת|הפניה|המלצה/.test(a.message_he));
  }
});

test('runDunning cooling period blocks legal until 30d after pre-legal', () => {
  const s = createStore();
  const base = new Date('2026-01-01T00:00:00Z');
  upsertInvoice({ id: 'L1', customer_id: 'C1', amount: 10000, due_date: addDays(base, -46).toISOString() }, s);

  // Day 46: pre-legal fires.
  const pre = runDunning(addDays(base, 0), { store: s });
  assert.ok(pre.counts_by_stage[STAGES.PRE_LEGAL] === 1);

  // Day 61: legal attempted, but only 15d have passed → cooling block.
  const day61 = runDunning(addDays(base, 15), { store: s });
  const blocked = day61.skipped.find((sk) => sk.invoice_id === 'L1' && sk.reason === 'cooling_period');
  assert.ok(blocked, 'legal should be blocked by cooling period');

  // Day 76: 30d have passed → legal referral fires.
  const day76 = runDunning(addDays(base, 30), { store: s });
  const legal = day76.actions.find((a) => a.stage === STAGES.LEGAL);
  assert.ok(legal, 'legal stage should eventually fire');
  const referral = day76.actions.find((a) => a.type === 'legal_referral');
  assert.ok(referral);
  assert.match(referral.law_reference, /ההוצאה לפועל/);
});

test('runDunning skips paused invoices (disputed, paid, promised)', () => {
  const { store, asOf } = seed();
  flagDispute('INV-07', 'quantity mismatch', store);
  recordPayment('INV-15', 4000, asOf, store);
  recordPromise('INV-30', { date: addDays(asOf, 10).toISOString(), amount: 5000 }, store);

  const { skipped } = runDunning(asOf, { store });
  const reasons = skipped.map((sk) => sk.invoice_id + ':' + sk.reason);
  assert.ok(reasons.some((r) => r === 'INV-07:disputed'));
  assert.ok(reasons.some((r) => r === 'INV-15:paid'));
  assert.ok(reasons.some((r) => r === 'INV-30:promised'));
});

test('runDunning enforces anti-harassment 72h cap', () => {
  const s = createStore();
  // Use direct canContact() — runDunning has its own "already_touched_today"
  // idempotency guard that fires before the harassment check, so we assert on
  // the underlying rule to prove the 72h window is enforced.
  upsertInvoice({ id: 'H1', customer_id: 'C1', amount: 500, due_date: '2026-04-01T00:00:00Z' }, s);
  // First touch at day-10 overdue.
  runDunning('2026-04-11T00:00:00Z', { store: s });
  const inv = s.invoices.get('H1');
  assert.ok(inv.last_touch_at, 'first touch recorded');
  // 30h later — still inside 72h window → canContact must return false.
  assert.equal(dun.canContact(inv, '2026-04-12T06:00:00Z'), false);
  // 80h later — outside 72h window → canContact must return true.
  assert.equal(dun.canContact(inv, '2026-04-14T08:00:00Z'), true);
});

test('runDunning respects statute of limitations (7y)', () => {
  const s = createStore();
  upsertInvoice({ id: 'OLD', customer_id: 'C1', amount: 999, due_date: '2018-01-01T00:00:00Z' }, s);
  const { skipped } = runDunning('2026-04-11T00:00:00Z', { store: s });
  assert.ok(skipped.some((sk) => sk.invoice_id === 'OLD' && sk.reason === 'statute_of_limitations'));
});

test('runDunning write-off recommendation at 90+ days requires approver', () => {
  const { store, asOf } = seed();
  const { actions } = runDunning(asOf, { store });
  const rec = actions.find((a) => a.type === 'write_off_recommendation');
  assert.ok(rec);
  assert.equal(rec.requires_approver, true);
  assert.equal(rec.invoice_id, 'INV-91');
});

// ─────────────────────────────────────────────────────────────
// 5. sendReminder (manual)
// ─────────────────────────────────────────────────────────────

test('sendReminder delivers bilingual message on the primary channel', () => {
  const { store, asOf } = seed();
  const r = sendReminder('INV-07', STAGES.FRIENDLY, { store, asOf });
  assert.equal(r.delivered, true);
  assert.equal(r.channel, CHANNELS.EMAIL);
  assert.ok(r.message_he.includes('INV-07'));
  assert.ok(r.message_en.includes('INV-07'));
});

test('sendReminder respects dispute pause', () => {
  const { store, asOf } = seed();
  flagDispute('INV-07', 'goods not received', store);
  const r = sendReminder('INV-07', STAGES.FRIENDLY, { store, asOf });
  assert.equal(r.delivered, false);
  assert.equal(r.reason, 'disputed');
});

test('sendReminder throws on unknown invoice', () => {
  const s = createStore();
  assert.throws(() => sendReminder('NOPE', STAGES.FRIENDLY, { store: s }), /invoice not found/);
});

// ─────────────────────────────────────────────────────────────
// 6. Promises & broken promises
// ─────────────────────────────────────────────────────────────

test('recordPromise pauses dunning until promise_date', () => {
  const { store, asOf } = seed();
  recordPromise('INV-30', { date: addDays(asOf, 14).toISOString(), amount: 5000 }, store);
  const inv = store.invoices.get('INV-30');
  assert.equal(inv.stage, STAGES.PROMISED);
  assert.ok(inv.promise_until);
});

test('reconcilePromises marks kept when payment covers the promise', () => {
  const { store, asOf } = seed();
  const p = recordPromise('INV-30', { date: addDays(asOf, 7).toISOString(), amount: 5000 }, store);
  recordPayment('INV-30', 5000, addDays(asOf, 3).toISOString(), store);
  reconcilePromises(addDays(asOf, 8).toISOString(), store);
  assert.equal(p.status, 'kept');
});

test('reconcilePromises marks broken and bumps severity on shortfall', () => {
  const { store, asOf } = seed();
  const p = recordPromise('INV-30', { date: addDays(asOf, 7).toISOString(), amount: 5000 }, store);
  recordPayment('INV-30', 100, addDays(asOf, 3).toISOString(), store); // shortfall
  const inv = store.invoices.get('INV-30');
  const sev0 = inv.severity;
  const broken = reconcilePromises(addDays(asOf, 8).toISOString(), store);
  assert.equal(p.status, 'broken');
  assert.equal(broken.length, 1);
  assert.equal(inv.broken_promises, 1);
  assert.ok(inv.severity >= sev0 + 1);
});

test('recordPromise rejects non-positive amounts and missing date', () => {
  const { store } = seed();
  assert.throws(() => recordPromise('INV-30', { date: new Date(), amount: 0 }, store), /positive/);
  assert.throws(() => recordPromise('INV-30', { amount: 100 }, store), /date/);
});

// ─────────────────────────────────────────────────────────────
// 7. Disputes
// ─────────────────────────────────────────────────────────────

test('flagDispute then clearDispute toggles pause state', () => {
  const { store } = seed();
  flagDispute('INV-15', 'pricing error', store);
  assert.equal(store.invoices.get('INV-15').disputed, true);
  clearDispute('INV-15', store);
  assert.equal(store.invoices.get('INV-15').disputed, false);
});

test('disputes are logged to comm_log', () => {
  const { store } = seed();
  flagDispute('INV-15', 'quantity', store);
  const entries = store.comm_log.filter((e) => e.type === 'dispute_flag');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reason, 'quantity');
});

// ─────────────────────────────────────────────────────────────
// 8. Payments
// ─────────────────────────────────────────────────────────────

test('recordPayment reduces outstanding and marks paid when zeroed', () => {
  const { store, asOf } = seed();
  recordPayment('INV-15', 2000, asOf, store);
  assert.equal(outstandingOf(store.invoices.get('INV-15')), 2000);
  recordPayment('INV-15', 2000, asOf, store);
  assert.equal(store.invoices.get('INV-15').stage, STAGES.PAID);
});

test('recordPayment ledger is append-only (never deletes)', () => {
  const { store, asOf } = seed();
  recordPayment('INV-15', 500, asOf, store);
  recordPayment('INV-15', 300, asOf, store);
  assert.equal(store.payments.filter((p) => p.invoice_id === 'INV-15').length, 2);
});

test('recordPayment rejects zero or negative amounts', () => {
  const { store, asOf } = seed();
  assert.throws(() => recordPayment('INV-15', 0, asOf, store), /positive/);
  assert.throws(() => recordPayment('INV-15', -10, asOf, store), /positive/);
});

// ─────────────────────────────────────────────────────────────
// 9. Payment plans
// ─────────────────────────────────────────────────────────────

test('createPaymentPlan splits debt into equal installments with promises', () => {
  const s = createStore();
  upsertInvoice({ id: 'P1', customer_id: 'C1', amount: 1200, due_date: '2026-04-01T00:00:00Z' }, s);
  const plan = createPaymentPlan('P1', {
    installments: 4, every_days: 30, start: '2026-05-01T00:00:00Z',
  }, s);
  assert.equal(plan.schedule.length, 4);
  const total = plan.schedule.reduce((acc, x) => acc + x.amount, 0);
  assert.equal(Math.round(total), 1200);
  // Each installment should have created a promise entry.
  assert.equal(s.promises.length, 4);
});

test('createPaymentPlan rejects invalid parameters', () => {
  const { store } = seed();
  assert.throws(() => createPaymentPlan('INV-15', { installments: 0, every_days: 10 }, store), /installments/);
  assert.throws(() => createPaymentPlan('INV-15', { installments: 3, every_days: 0 }, store), /every_days/);
});

// ─────────────────────────────────────────────────────────────
// 10. Write-off workflow
// ─────────────────────────────────────────────────────────────

test('writeOff produces a balanced journal entry (Dr Bad Debt / Cr AR)', () => {
  const { store } = seed();
  const je = writeOff('INV-91', 'debtor insolvent', 'cfo', store);
  const debits  = je.lines.reduce((acc, l) => acc + l.debit, 0);
  const credits = je.lines.reduce((acc, l) => acc + l.credit, 0);
  assert.equal(debits, 8000);
  assert.equal(credits, 8000);
  assert.equal(debits, credits);
});

test('writeOff requires approver by default', () => {
  const { store } = seed();
  assert.throws(() => writeOff('INV-91', 'x', null, store), /approver/);
});

test('writeOff never deletes — invoice remains with written_off flag', () => {
  const { store } = seed();
  writeOff('INV-91', 'reason', 'cfo', store);
  const inv = store.invoices.get('INV-91');
  assert.ok(inv); // still here
  assert.equal(inv.written_off, true);
  assert.equal(inv.stage, STAGES.WRITTEN_OFF);
});

test('writeOff twice throws', () => {
  const { store } = seed();
  writeOff('INV-91', 'r', 'cfo', store);
  assert.throws(() => writeOff('INV-91', 'r', 'cfo', store), /already/);
});

// ─────────────────────────────────────────────────────────────
// 11. Agent assignment + comm log accessor
// ─────────────────────────────────────────────────────────────

test('assignAgent records on store and invoice', () => {
  const { store } = seed();
  assignAgent('INV-60', 'agent_kobi', store);
  assert.equal(store.assignments.get('INV-60'), 'agent_kobi');
  assert.equal(store.invoices.get('INV-60').assigned_agent, 'agent_kobi');
});

test('customerCommLog returns only events for that customer', () => {
  const { store, asOf } = seed();
  runDunning(asOf, { store });
  const c1 = customerCommLog('C1', store);
  const c2 = customerCommLog('C2', store);
  assert.ok(c1.length >= 1);
  assert.ok(c2.length >= 1);
  assert.ok(c1.every((e) => e.customer_id === 'C1'));
});

// ─────────────────────────────────────────────────────────────
// 12. Legal helpers (interest cap)
// ─────────────────────────────────────────────────────────────

test('maxLegalInterest returns prime + 3% default', () => {
  configure({ boi_prime: 0.06, max_interest_spread: 0.03 });
  assert.equal(maxLegalInterest(), 0.09);
});

test('computeLateInterest caps at legal max even when higher rate supplied', () => {
  configure({ boi_prime: 0.06, max_interest_spread: 0.03 });
  // 10000 ILS principal × 365 days × 0.09 = 900
  const capped = computeLateInterest(10000, 365, 0.25); // user asks 25% — illegal
  assert.equal(capped, 900);
});

test('computeLateInterest handles zero principal / days', () => {
  assert.equal(computeLateInterest(0, 100, 0.09), 0);
  assert.equal(computeLateInterest(1000, 0, 0.09), 0);
});

// ─────────────────────────────────────────────────────────────
// 13. Metrics
// ─────────────────────────────────────────────────────────────

test('collectionMetrics returns DSO, collection_rate, aging_trend', () => {
  const { store, asOf } = seed();
  runDunning(asOf, { store });
  recordPayment('INV-15', 4000, asOf, store);
  runDunning(addDays(asOf, 1), { store });
  const m = collectionMetrics({ from: addDays(asOf, -90).toISOString(), to: addDays(asOf, 2).toISOString() }, store);
  assert.ok(typeof m.dso === 'number');
  assert.ok(typeof m.collection_rate === 'number');
  assert.ok(m.collected >= 4000);
  assert.ok(m.aging_trend, 'trend should exist when 2+ snapshots');
});

test('collectionMetrics returns 0 when no sales in period', () => {
  const s = createStore();
  const m = collectionMetrics({ from: '2026-01-01', to: '2026-02-01' }, s);
  assert.equal(m.dso, 0);
  assert.equal(m.collection_rate, 0);
});

// ─────────────────────────────────────────────────────────────
// 14. Bilingual templates
// ─────────────────────────────────────────────────────────────

test('formatTemplate substitutes placeholders', () => {
  const out = formatTemplate('חשבונית {x} בסך {y} ש"ח', { x: 'INV-1', y: '500' });
  assert.equal(out, 'חשבונית INV-1 בסך 500 ש"ח');
});

test('renderMessage produces non-empty Hebrew + English for every schedule entry', () => {
  const { store } = seed();
  const inv = store.invoices.get('INV-01');
  for (const entry of DUNNING_SCHEDULE) {
    const msg = renderMessage(entry, inv);
    assert.ok(msg.he.length > 0, 'he empty for ' + entry.stage);
    assert.ok(msg.en.length > 0, 'en empty for ' + entry.stage);
  }
});

// ─────────────────────────────────────────────────────────────
// 15. Integrity / never-delete guarantees
// ─────────────────────────────────────────────────────────────

test('upsertInvoice preserves mutable state on replacement', () => {
  const s = createStore();
  upsertInvoice({ id: 'U1', customer_id: 'C1', amount: 1000, due_date: '2026-04-01T00:00:00Z' }, s);
  recordPayment('U1', 300, '2026-04-05T00:00:00Z', s);
  // Re-upsert (e.g., invoice description edited upstream).
  upsertInvoice({ id: 'U1', customer_id: 'C1', amount: 1000, due_date: '2026-04-01T00:00:00Z', description: 'edited' }, s);
  assert.equal(s.invoices.get('U1').paid, 300);
  assert.equal(s.invoices.get('U1').description, 'edited');
});

test('runDunning never deletes comm_log entries', () => {
  const { store, asOf } = seed();
  runDunning(asOf, { store });
  const n = store.comm_log.length;
  runDunning(addDays(asOf, 7), { store });
  assert.ok(store.comm_log.length >= n);
});

test('idempotency: running dunning twice on the same day does not duplicate touches', () => {
  const { store, asOf } = seed();
  const r1 = runDunning(asOf, { store });
  const r2 = runDunning(asOf, { store });
  // Second run should skip with already_touched_today for every invoice that already had a touch.
  assert.ok(r2.skipped.some((sk) => sk.reason === 'already_touched_today'));
  // Actions count for the second run should be strictly less than first.
  assert.ok(r2.actions.length < r1.actions.length);
});
