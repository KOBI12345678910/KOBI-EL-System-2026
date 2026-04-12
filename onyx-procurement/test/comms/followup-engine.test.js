/**
 * Tests — FollowupEngine (Agent Y-129)
 *
 * Zero-dep: node:test + node:assert/strict.
 *
 * Coverage:
 *   01 constants exports
 *   02 defineCadence validates trigger
 *   03 defineCadence validates steps
 *   04 defineCadence upgrade preserves prior revision
 *   05 enrollEntity on unknown cadence errors
 *   06 enrollEntity happy path
 *   07 processTick emits nothing before offset
 *   08 processTick emits due envelope at offset day
 *   09 processTick advances through multiple due steps in one tick
 *   10 conditional step skipping (not-replied gate)
 *   11 conditional step runs when condition met (replied gate)
 *   12 amount-gt / amount-lt conditions
 *   13 skipStep appends to skip log (append-only)
 *   14 pauseEnrollment blocks emits until date
 *   15 pauseEnrollment auto-resumes after due time
 *   16 completeEnrollment sets outcome
 *   17 completeEnrollment rejects invalid outcome
 *   18 emergencyStop halts all entity cadences
 *   19 emergencyStop blocks future enrollments for the entity
 *   20 effectiveness calculation (response/conversion/unsub rates)
 *   21 listActive filters by trigger / cadence
 *   22 append-only history never loses entries
 *   23 envelope carries bilingual labels + downstream routing
 *   24 recordResponse flips flags for later conditions
 *   25 getEnvelopes filter by channel
 *   26 auto-complete when all steps emitted
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FollowupEngine,
  TRIGGERS,
  TRIGGER_LABELS,
  CHANNELS,
  OUTCOMES,
  ENROLLMENT_STATE,
  CONDITION_OPERATORS
} = require('../../src/comms/followup-engine');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;

function mkEngine(now = new Date('2026-04-11T08:00:00Z').getTime()) {
  let clock = now;
  const engine = new FollowupEngine({ clock: () => clock });
  engine.__advance = (ms) => { clock += ms; };
  engine.__setClock = (ms) => { clock = ms; };
  engine.__now = () => clock;
  return engine;
}

function defineQuoteCadence(engine) {
  return engine.defineCadence({
    id: 'quote-followup',
    name_he: 'מעקב הצעת מחיר',
    name_en: 'Quote follow-up',
    trigger: 'quote-sent',
    steps: [
      { offsetDays: 0, channel: 'email',    template: 'quote-thank-you',  subject_he: 'תודה על ההתעניינות', subject_en: 'Thank you' },
      { offsetDays: 3, channel: 'email',    template: 'quote-nudge-3d',   condition: 'not-replied' },
      { offsetDays: 7, channel: 'whatsapp', template: 'quote-nudge-7d',   condition: 'not-replied' },
      { offsetDays: 14, channel: 'task',    template: 'quote-sales-call', condition: 'not-replied' }
    ]
  });
}

// ──────────────────────────────────────────────────────────────
// 01  constants export correctly
// ──────────────────────────────────────────────────────────────
test('01 constants exports — triggers, channels, outcomes, conditions', () => {
  assert.ok(Array.isArray(TRIGGERS));
  assert.equal(TRIGGERS.length, 8);
  for (const t of [
    'opportunity-created','quote-sent','demo-scheduled','invoice-due-soon',
    'invoice-overdue','support-ticket-open','customer-silent-90d','lead-stuck'
  ]) {
    assert.ok(TRIGGERS.includes(t), `missing trigger ${t}`);
    assert.ok(TRIGGER_LABELS[t].he && TRIGGER_LABELS[t].en, `missing bilingual label for ${t}`);
  }
  assert.deepEqual(CHANNELS, ['email', 'sms', 'whatsapp', 'task']);
  assert.deepEqual(OUTCOMES, ['responded', 'converted', 'dropped-out', 'escalated']);
  assert.equal(ENROLLMENT_STATE.ACTIVE, 'active');
  for (const op of ['replied','not-replied','opened','not-opened','clicked','not-clicked','amount-gt','amount-lt']) {
    assert.ok(CONDITION_OPERATORS.includes(op));
  }
});

// ──────────────────────────────────────────────────────────────
// 02  defineCadence validates trigger
// ──────────────────────────────────────────────────────────────
test('02 defineCadence rejects unknown trigger', () => {
  const e = mkEngine();
  assert.throws(
    () => e.defineCadence({
      id: 'bad',
      name_en: 'Bad',
      trigger: 'not-a-real-trigger',
      steps: [{ offsetDays: 0, channel: 'email', template: 'x' }]
    }),
    /invalid trigger/
  );
});

// ──────────────────────────────────────────────────────────────
// 03  defineCadence validates each step
// ──────────────────────────────────────────────────────────────
test('03 defineCadence validates every step', () => {
  const e = mkEngine();
  assert.throws(() => e.defineCadence({
    id: 'c', name_en: 'c', trigger: 'quote-sent', steps: []
  }), /at least one step/);

  assert.throws(() => e.defineCadence({
    id: 'c', name_en: 'c', trigger: 'quote-sent',
    steps: [{ offsetDays: 'soon', channel: 'email', template: 't' }]
  }), /offsetDays/);

  assert.throws(() => e.defineCadence({
    id: 'c', name_en: 'c', trigger: 'quote-sent',
    steps: [{ offsetDays: 1, channel: 'pigeon', template: 't' }]
  }), /channel/);

  assert.throws(() => e.defineCadence({
    id: 'c', name_en: 'c', trigger: 'quote-sent',
    steps: [{ offsetDays: 1, channel: 'email' }]
  }), /template/);
});

// ──────────────────────────────────────────────────────────────
// 04  defineCadence upgrade preserves prior revision
// ──────────────────────────────────────────────────────────────
test('04 defineCadence upgrade stores prior revision (לא מוחקים)', () => {
  const e = mkEngine();
  const v1 = e.defineCadence({
    id: 'quote-followup', name_en: 'Q v1', trigger: 'quote-sent',
    steps: [{ offsetDays: 0, channel: 'email', template: 'v1' }]
  });
  const v2 = e.defineCadence({
    id: 'quote-followup', name_en: 'Q v2', trigger: 'quote-sent',
    steps: [
      { offsetDays: 0, channel: 'email', template: 'v2a' },
      { offsetDays: 2, channel: 'sms', template: 'v2b' }
    ]
  });
  assert.equal(v2.steps.length, 2);
  assert.ok(Array.isArray(v2._revisions));
  assert.equal(v2._revisions.length, 1);
  assert.equal(v2._revisions[0].name_en, 'Q v1');
  assert.equal(v1.id, v2.id);
});

// ──────────────────────────────────────────────────────────────
// 05  enrollEntity rejects unknown cadence
// ──────────────────────────────────────────────────────────────
test('05 enrollEntity rejects unknown cadence', () => {
  const e = mkEngine();
  assert.throws(() => e.enrollEntity('opp-1', 'no-such-cadence'), /unknown cadenceId/);
});

// ──────────────────────────────────────────────────────────────
// 06  enrollEntity happy path
// ──────────────────────────────────────────────────────────────
test('06 enrollEntity happy path creates active enrollment', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const res = e.enrollEntity('opp-1', 'quote-followup', { amount: 5000 });
  assert.equal(res.ok, true);
  assert.ok(res.enrollmentId);
  const enr = e.getEnrollment(res.enrollmentId);
  assert.equal(enr.state, 'active');
  assert.equal(enr.currentStep, 0);
  assert.equal(enr.context.amount, 5000);
  // initial 'enrolled' history entry exists
  assert.ok(enr.history.some((h) => h.type === 'enrolled'));
});

// ──────────────────────────────────────────────────────────────
// 07  processTick emits nothing before offset
// ──────────────────────────────────────────────────────────────
test('07 processTick emits nothing when no step is due (beyond day-0)', () => {
  const e = mkEngine();
  // Cadence whose FIRST step is on day 3 — nothing should fire on day 0.
  e.defineCadence({
    id: 'delayed', name_en: 'delayed', trigger: 'quote-sent',
    steps: [{ offsetDays: 3, channel: 'email', template: 'hello' }]
  });
  e.enrollEntity('opp-2', 'delayed');
  const tick = e.processTick();
  assert.equal(tick.emitted.length, 0);
  assert.equal(tick.skipped.length, 0);
});

// ──────────────────────────────────────────────────────────────
// 08  processTick emits due envelope at offset day
// ──────────────────────────────────────────────────────────────
test('08 processTick emits envelope when offset reached', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const enroll = e.enrollEntity('opp-3', 'quote-followup');
  // Day 0 — first step due immediately
  const t0 = e.processTick();
  assert.equal(t0.emitted.length, 1);
  assert.equal(t0.emitted[0].channel, 'email');
  assert.equal(t0.emitted[0].template, 'quote-thank-you');
  assert.equal(t0.emitted[0].enrollmentId, enroll.enrollmentId);
  // Envelope must carry bilingual labels
  assert.equal(t0.emitted[0].cadenceName_he, 'מעקב הצעת מחיר');
});

// ──────────────────────────────────────────────────────────────
// 09  batch catch-up — multiple steps due in one tick
// ──────────────────────────────────────────────────────────────
test('09 processTick advances through multiple due steps (batch catchup)', () => {
  const e = mkEngine();
  // Simple 3-step cadence, no conditions.
  e.defineCadence({
    id: 'triple', name_en: 'triple', trigger: 'quote-sent',
    steps: [
      { offsetDays: 0, channel: 'email', template: 's1' },
      { offsetDays: 1, channel: 'email', template: 's2' },
      { offsetDays: 2, channel: 'email', template: 's3' }
    ]
  });
  e.enrollEntity('opp-4', 'triple');
  // Jump the clock forward 5 days — tick should emit all 3 steps.
  e.__advance(5 * DAY);
  const tick = e.processTick();
  assert.equal(tick.emitted.length, 3);
  assert.deepEqual(
    tick.emitted.map((x) => x.template),
    ['s1', 's2', 's3']
  );
});

// ──────────────────────────────────────────────────────────────
// 10  conditional step skipping — not-replied
// ──────────────────────────────────────────────────────────────
test('10 condition not-replied SKIPS when entity has replied', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const enr = e.enrollEntity('opp-5', 'quote-followup');
  // Day 0 — first step (unconditional) should emit.
  e.processTick();
  // Simulate a reply.
  e.recordResponse(enr.enrollmentId, 'replied');
  // Move to day 3 — the next step is gated by not-replied → should skip.
  e.__advance(3 * DAY);
  const t = e.processTick();
  assert.equal(t.emitted.length, 0);
  assert.equal(t.skipped.length, 1);
  assert.equal(t.skipped[0].reason, 'condition-false');
});

// ──────────────────────────────────────────────────────────────
// 11  condition runs when not-replied AND no reply registered
// ──────────────────────────────────────────────────────────────
test('11 condition not-replied RUNS when no reply registered', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  e.enrollEntity('opp-6', 'quote-followup');
  // Day 0
  const t0 = e.processTick();
  assert.equal(t0.emitted.length, 1);
  // Day 3 — no reply registered; the not-replied step should run.
  e.__advance(3 * DAY);
  const t1 = e.processTick();
  assert.equal(t1.emitted.length, 1);
  assert.equal(t1.emitted[0].template, 'quote-nudge-3d');
});

// ──────────────────────────────────────────────────────────────
// 12  amount-gt / amount-lt conditions
// ──────────────────────────────────────────────────────────────
test('12 amount-gt and amount-lt conditions gate steps', () => {
  const e = mkEngine();
  e.defineCadence({
    id: 'big-deal', name_en: 'Big deal', trigger: 'opportunity-created',
    steps: [
      { offsetDays: 0, channel: 'task',  template: 'vip-touch',     condition: 'amount-gt:50000' },
      { offsetDays: 0, channel: 'email', template: 'standard-touch',condition: 'amount-lt:50000' }
    ]
  });
  e.enrollEntity('opp-vip', 'big-deal', { amount: 120000 });
  e.enrollEntity('opp-smb', 'big-deal', { amount: 1500 });
  const t = e.processTick();
  const templates = t.emitted.map((x) => x.template).sort();
  assert.deepEqual(templates, ['standard-touch', 'vip-touch']);
});

// ──────────────────────────────────────────────────────────────
// 13  skipStep — append-only skip log
// ──────────────────────────────────────────────────────────────
test('13 skipStep appends to skip ledger and advances pointer', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const { enrollmentId } = e.enrollEntity('opp-7', 'quote-followup');
  const res = e.skipStep(enrollmentId, 0, 'customer-requested-quiet');
  assert.equal(res.ok, true);
  const enr = e.getEnrollment(enrollmentId);
  assert.equal(enr.skips.length, 1);
  assert.equal(enr.skips[0].stepIndex, 0);
  assert.equal(enr.skips[0].reason, 'customer-requested-quiet');
  assert.equal(enr.skips[0].auto, false);
  // Subsequent skip of a different step → still appended (not overwritten).
  e.skipStep(enrollmentId, 1, 'second-skip');
  const enr2 = e.getEnrollment(enrollmentId);
  assert.equal(enr2.skips.length, 2);
  // First skip record still present (לא מוחקים):
  assert.equal(enr2.skips[0].reason, 'customer-requested-quiet');
});

// ──────────────────────────────────────────────────────────────
// 14  pauseEnrollment blocks emits until due time
// ──────────────────────────────────────────────────────────────
test('14 pauseEnrollment holds emissions until the unpause time', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const { enrollmentId } = e.enrollEntity('opp-8', 'quote-followup');
  // Pause for 10 days.
  const pauseUntil = new Date(e.__now() + 10 * DAY).toISOString();
  const pauseRes = e.pauseEnrollment(enrollmentId, pauseUntil);
  assert.equal(pauseRes.ok, true);
  // Day 0 — no emissions (paused).
  const t = e.processTick();
  assert.equal(t.emitted.length, 0);
  // Still day 1 — still paused.
  e.__advance(1 * DAY);
  const t1 = e.processTick();
  assert.equal(t1.emitted.length, 0);
});

// ──────────────────────────────────────────────────────────────
// 15  pauseEnrollment auto-resumes after due time
// ──────────────────────────────────────────────────────────────
test('15 pauseEnrollment auto-resumes after the pause window', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const { enrollmentId } = e.enrollEntity('opp-9', 'quote-followup');
  e.pauseEnrollment(enrollmentId, new Date(e.__now() + 5 * DAY).toISOString());
  // Advance past the pause window.
  e.__advance(6 * DAY);
  const t = e.processTick();
  // First step had offset 0 → it's now 6 days overdue, so it fires.
  assert.equal(t.emitted.length >= 1, true);
  const enr = e.getEnrollment(enrollmentId);
  assert.equal(enr.state, 'active');
  // Pause was recorded in history → auto-resumed marker must also exist.
  const types = enr.history.map((h) => h.type);
  assert.ok(types.includes('paused'));
  assert.ok(types.includes('auto-resumed'));
});

// ──────────────────────────────────────────────────────────────
// 16  completeEnrollment sets outcome
// ──────────────────────────────────────────────────────────────
test('16 completeEnrollment sets outcome and freezes state', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const { enrollmentId } = e.enrollEntity('opp-10', 'quote-followup');
  const res = e.completeEnrollment(enrollmentId, 'converted');
  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'converted');
  const enr = e.getEnrollment(enrollmentId);
  assert.equal(enr.state, 'completed');
  assert.equal(enr.outcome, 'converted');
  // Subsequent tick must not emit anything.
  e.__advance(30 * DAY);
  const t = e.processTick();
  assert.equal(t.emitted.filter((x) => x.enrollmentId === enrollmentId).length, 0);
  // Second complete is idempotent.
  const again = e.completeEnrollment(enrollmentId, 'responded');
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
  assert.equal(again.outcome, 'converted');
});

// ──────────────────────────────────────────────────────────────
// 17  completeEnrollment rejects invalid outcome
// ──────────────────────────────────────────────────────────────
test('17 completeEnrollment rejects invalid outcome', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const { enrollmentId } = e.enrollEntity('opp-11', 'quote-followup');
  const res = e.completeEnrollment(enrollmentId, 'totally-made-up');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'INVALID_OUTCOME');
});

// ──────────────────────────────────────────────────────────────
// 18  emergencyStop halts all entity cadences
// ──────────────────────────────────────────────────────────────
test('18 emergencyStop halts every active cadence for the entity', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  e.defineCadence({
    id: 'silent-90', name_en: 'Silent 90', trigger: 'customer-silent-90d',
    steps: [{ offsetDays: 0, channel: 'sms', template: 'come-back' }]
  });
  const a = e.enrollEntity('customer-42', 'quote-followup');
  const b = e.enrollEntity('customer-42', 'silent-90');
  const stop = e.emergencyStop('customer-42', 'customer-requested-DNC');
  assert.equal(stop.ok, true);
  assert.equal(stop.affected, 2);
  const enrA = e.getEnrollment(a.enrollmentId);
  const enrB = e.getEnrollment(b.enrollmentId);
  assert.equal(enrA.state, 'stopped');
  assert.equal(enrB.state, 'stopped');
  assert.equal(enrA.flags.unsubscribed, true);
  // Subsequent tick must not emit anything for this entity.
  e.__advance(1 * DAY);
  const t = e.processTick();
  assert.equal(
    t.emitted.filter((x) => x.entityId === 'customer-42').length,
    0
  );
});

// ──────────────────────────────────────────────────────────────
// 19  emergencyStop blocks future enrollments
// ──────────────────────────────────────────────────────────────
test('19 emergencyStop blocks new enrollments for the same entity', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  e.emergencyStop('customer-dnc', 'do-not-contact');
  const res = e.enrollEntity('customer-dnc', 'quote-followup');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'ENTITY_EMERGENCY_STOPPED');
  assert.equal(e.isEmergencyStopped('customer-dnc'), true);
});

// ──────────────────────────────────────────────────────────────
// 20  effectiveness calculation
// ──────────────────────────────────────────────────────────────
test('20 effectiveness computes response / conversion / unsub rates', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  // 4 enrollments:
  //   A — replies, converts
  //   B — replies only
  //   C — ignores everything (drops)
  //   D — unsubscribes
  const A = e.enrollEntity('opp-A', 'quote-followup');
  const B = e.enrollEntity('opp-B', 'quote-followup');
  const C = e.enrollEntity('opp-C', 'quote-followup');
  const D = e.enrollEntity('opp-D', 'quote-followup');

  // Day 0 — first step fires for everyone.
  e.processTick();

  e.recordResponse(A.enrollmentId, 'replied');
  e.completeEnrollment(A.enrollmentId, 'converted');
  e.recordResponse(B.enrollmentId, 'replied');
  e.recordResponse(D.enrollmentId, 'unsubscribed');

  const metrics = e.effectiveness({ cadenceId: 'quote-followup' });
  assert.equal(metrics.ok, true);
  assert.equal(metrics.enrolled, 4);
  assert.equal(metrics.sent, 4);          // each got the first email
  assert.equal(metrics.responded, 2);
  assert.equal(metrics.converted, 1);
  assert.equal(metrics.unsub, 1);
  assert.equal(metrics.responseRate, 0.5);
  assert.equal(metrics.conversionRate, 0.25);
  assert.equal(metrics.unsubRate, 0.25);
});

// ──────────────────────────────────────────────────────────────
// 21  listActive filters
// ──────────────────────────────────────────────────────────────
test('21 listActive filters by trigger and cadenceId', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  e.defineCadence({
    id: 'overdue-nudge', name_en: 'Overdue', trigger: 'invoice-overdue',
    steps: [{ offsetDays: 0, channel: 'email', template: 'pay-up' }]
  });
  e.enrollEntity('opp-100', 'quote-followup');
  e.enrollEntity('opp-101', 'quote-followup');
  e.enrollEntity('inv-200', 'overdue-nudge');

  const byTrigger = e.listActive({ trigger: 'quote-sent' });
  assert.equal(byTrigger.length, 2);
  const byCadence = e.listActive({ cadenceId: 'overdue-nudge' });
  assert.equal(byCadence.length, 1);
  assert.equal(byCadence[0].entityId, 'inv-200');
});

// ──────────────────────────────────────────────────────────────
// 22  append-only history never loses entries
// ──────────────────────────────────────────────────────────────
test('22 history() returns full append-only trail (לא מוחקים)', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  const enroll = e.enrollEntity('opp-hist', 'quote-followup');
  e.processTick();
  e.recordResponse(enroll.enrollmentId, 'opened');
  e.skipStep(enroll.enrollmentId, 1, 'weekend');
  e.pauseEnrollment(enroll.enrollmentId, new Date(e.__now() + 2 * DAY).toISOString());
  e.completeEnrollment(enroll.enrollmentId, 'escalated');

  const hist = e.history('opp-hist');
  // Expected types in order: enrolled, step-emitted, response, manual-skip,
  // paused, completed
  const types = hist.map((h) => h.type);
  assert.ok(types.includes('enrolled'));
  assert.ok(types.includes('step-emitted'));
  assert.ok(types.includes('response'));
  assert.ok(types.includes('manual-skip'));
  assert.ok(types.includes('paused'));
  assert.ok(types.includes('completed'));
  // Count must grow, never shrink (no entry deletion anywhere).
  assert.ok(hist.length >= 6);
});

// ──────────────────────────────────────────────────────────────
// 23  envelope carries bilingual labels + downstream routing
// ──────────────────────────────────────────────────────────────
test('23 envelope includes bilingual labels and Y-agent routing hint', () => {
  const e = mkEngine();
  defineQuoteCadence(e);
  e.enrollEntity('opp-bilingual', 'quote-followup');
  const t = e.processTick();
  const env = t.emitted[0];
  assert.equal(env.cadenceName_he, 'מעקב הצעת מחיר');
  assert.equal(env.cadenceName_en, 'Quote follow-up');
  assert.equal(env.subject_he, 'תודה על ההתעניינות');
  assert.equal(env.subject_en, 'Thank you');
  // Routing hint should point to Y-121 for email.
  assert.equal(env.delivery, 'Y-121:email-templates');
  // Envelope must be frozen (append-only audit value).
  assert.throws(() => { env.template = 'hacked'; });
});

// ──────────────────────────────────────────────────────────────
// 24  recordResponse flips flags for later condition checks
// ──────────────────────────────────────────────────────────────
test('24 recordResponse flips flags for condition evaluation', () => {
  const e = mkEngine();
  // Cadence with opened gate
  e.defineCadence({
    id: 'open-gate', name_en: 'Open-gate', trigger: 'quote-sent',
    steps: [
      { offsetDays: 0, channel: 'email', template: 'first' },
      { offsetDays: 1, channel: 'email', template: 'upsell', condition: 'opened' }
    ]
  });
  // Entity A — opens the mail; Entity B — does not.
  const A = e.enrollEntity('A', 'open-gate');
  const B = e.enrollEntity('B', 'open-gate');
  e.processTick();
  e.recordResponse(A.enrollmentId, 'opened');
  e.__advance(2 * DAY);
  const t = e.processTick();
  const templates = t.emitted.map((x) => x.template);
  // Only A should receive the upsell (B's condition skipped).
  assert.equal(templates.filter((x) => x === 'upsell').length, 1);
  assert.equal(
    t.emitted.find((x) => x.template === 'upsell').enrollmentId,
    A.enrollmentId
  );
});

// ──────────────────────────────────────────────────────────────
// 25  getEnvelopes filter by channel
// ──────────────────────────────────────────────────────────────
test('25 getEnvelopes filter by channel', () => {
  const e = mkEngine();
  e.defineCadence({
    id: 'multi-channel', name_en: 'Multi', trigger: 'opportunity-created',
    steps: [
      { offsetDays: 0, channel: 'email',    template: 'hi-email' },
      { offsetDays: 0, channel: 'sms',      template: 'hi-sms' },
      { offsetDays: 0, channel: 'whatsapp', template: 'hi-wa' }
    ]
  });
  e.enrollEntity('opp-ch', 'multi-channel');
  e.processTick();
  assert.equal(e.getEnvelopes({ channel: 'sms' }).length, 1);
  assert.equal(e.getEnvelopes({ channel: 'whatsapp' }).length, 1);
  assert.equal(e.getEnvelopes({ channel: 'email' }).length, 1);
});

// ──────────────────────────────────────────────────────────────
// 26  auto-complete when all steps emitted
// ──────────────────────────────────────────────────────────────
test('26 processTick auto-completes enrollment after final step', () => {
  const e = mkEngine();
  e.defineCadence({
    id: 'short', name_en: 'Short', trigger: 'lead-stuck',
    steps: [
      { offsetDays: 0, channel: 'email', template: 'a' },
      { offsetDays: 1, channel: 'email', template: 'b' }
    ]
  });
  const { enrollmentId } = e.enrollEntity('lead-1', 'short');
  e.__advance(2 * DAY);
  e.processTick();
  const enr = e.getEnrollment(enrollmentId);
  assert.equal(enr.state, 'completed');
  // Auto-complete outcome depends on whether a reply was recorded.
  assert.ok(['responded', 'dropped-out'].includes(enr.outcome));
});
