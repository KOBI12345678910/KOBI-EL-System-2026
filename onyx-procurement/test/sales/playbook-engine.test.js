/**
 * Sales Playbook Engine — unit tests
 * Agent Y-027 — 2026-04-11
 *
 * Run:  node --test test/sales/playbook-engine.test.js
 *
 * Covers:
 *   - definition & versioning (never-delete)
 *   - seed — 5 default playbooks
 *   - trigger matching (every trigger type)
 *   - step progression happy path
 *   - skip tracking (append-only, reason logged)
 *   - metrics aggregation
 *   - bilingual labels on every trigger + step type
 *   - edge cases (invalid trigger, wrong step id, cancelled execution)
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  SalesPlaybook,
  buildDefaultPlaybooks,
  TRIGGER_TYPES,
  STEP_TYPES,
  CONSTANTS,
} = require('../../src/sales/playbook-engine.js');

// ─────────────────────────────────────────────────────────────
// 1. Seed + bilingual catalog
// ─────────────────────────────────────────────────────────────

test('01. seed ships 5 default playbooks with bilingual names', () => {
  const eng = new SalesPlaybook();
  const list = eng.listPlaybooks();
  assert.equal(list.length, 5);
  for (const pb of list) {
    assert.ok(pb.name_he.length > 0, `missing name_he for ${pb.id}`);
    assert.ok(pb.name_en.length > 0, `missing name_en for ${pb.id}`);
    assert.ok(Array.isArray(pb.steps) && pb.steps.length > 0);
    for (const s of pb.steps) {
      assert.ok(s.content_he.length > 0);
      assert.ok(s.content_en.length > 0);
      assert.ok(STEP_TYPES[s.type], `unknown step type ${s.type}`);
    }
  }
});

test('02. seed — new inbound lead has 5 steps spanning ~10 days', () => {
  const eng = new SalesPlaybook();
  const pb = eng.getPlaybook('pb-new-inbound-lead');
  assert.ok(pb);
  assert.equal(pb.steps.length, 5);
  const totalWait = pb.steps.reduce((s, x) => s + x.waitDays, 0);
  assert.equal(totalWait, 10,
    `new inbound lead should span exactly 10 wait-days, got ${totalWait}`);
});

test('03. seed — every default playbook exists by id', () => {
  const eng = new SalesPlaybook();
  const ids = [
    'pb-new-inbound-lead',
    'pb-renewal-60d',
    'pb-stuck-in-proposal',
    'pb-lost-to-competitor-recovery',
    'pb-upsell-existing',
  ];
  for (const id of ids) {
    const pb = eng.getPlaybook(id);
    assert.ok(pb, `missing default playbook: ${id}`);
  }
});

test('04. TRIGGER_TYPES catalog is complete and bilingual', () => {
  const required = [
    'new-lead',
    'stage-change',
    'stuck-in-stage-X-days',
    'competitor-detected',
    'objection-raised',
    'deal-slipping',
  ];
  for (const t of required) {
    assert.ok(TRIGGER_TYPES[t], `missing trigger type ${t}`);
    assert.ok(TRIGGER_TYPES[t].he.length > 0);
    assert.ok(TRIGGER_TYPES[t].en.length > 0);
  }
});

test('05. STEP_TYPES catalog includes call/email/meeting/demo/task', () => {
  for (const k of ['call', 'email', 'meeting', 'demo', 'task']) {
    assert.ok(STEP_TYPES[k], `missing step type ${k}`);
    assert.ok(STEP_TYPES[k].he && STEP_TYPES[k].en);
  }
});

test('06. CONSTANTS table is frozen (never-delete)', () => {
  assert.ok(Object.isFrozen(CONSTANTS));
  assert.ok(Object.isFrozen(CONSTANTS.TRIGGER_TYPES));
  assert.ok(Object.isFrozen(CONSTANTS.STEP_TYPES));
});

// ─────────────────────────────────────────────────────────────
// 2. definePlaybook + versioning (never-delete)
// ─────────────────────────────────────────────────────────────

test('07. definePlaybook: redefining an id bumps version, history preserved', () => {
  const eng = new SalesPlaybook({ seed: false });
  const v1 = eng.definePlaybook({
    id: 'pb-test',
    name_he: 'בדיקה',
    name_en: 'Test',
    trigger: { type: 'new-lead' },
    steps: [{
      id: 's1', type: 'call', content_he: 'שיחה', content_en: 'Call',
      waitDays: 0, dueDays: 1,
    }],
  });
  assert.equal(v1.version, 1);

  const v2 = eng.definePlaybook({
    id: 'pb-test',
    name_he: 'בדיקה מעודכנת',
    name_en: 'Test v2',
    trigger: { type: 'new-lead' },
    steps: [
      { id: 's1', type: 'call',  content_he: 'שיחה',  content_en: 'Call',  waitDays: 0, dueDays: 1 },
      { id: 's2', type: 'email', content_he: 'אימייל', content_en: 'Email', waitDays: 1, dueDays: 1 },
    ],
  });
  assert.equal(v2.version, 2);

  const history = eng.getPlaybookHistory('pb-test');
  assert.equal(history.length, 2, 'version 1 must remain in history');
  assert.equal(history[0].version, 1);
  assert.equal(history[1].version, 2);
  assert.equal(history[0].name_en, 'Test');
  assert.equal(history[1].name_en, 'Test v2');
});

test('08. definePlaybook rejects invalid input', () => {
  const eng = new SalesPlaybook({ seed: false });
  assert.throws(() => eng.definePlaybook({}), /id is required/);
  assert.throws(() => eng.definePlaybook({ id: 'x' }), /name_he is required/);
  assert.throws(() => eng.definePlaybook({
    id: 'x', name_he: 'x', name_en: 'x',
  }), /trigger is required/);
  assert.throws(() => eng.definePlaybook({
    id: 'x', name_he: 'x', name_en: 'x',
    trigger: { type: 'nope' },
    steps: [],
  }), /invalid trigger type/);
  assert.throws(() => eng.definePlaybook({
    id: 'x', name_he: 'x', name_en: 'x',
    trigger: { type: 'new-lead' },
    steps: [],
  }), /steps array is required/);
  assert.throws(() => eng.definePlaybook({
    id: 'x', name_he: 'x', name_en: 'x',
    trigger: { type: 'new-lead' },
    steps: [{ id: 's1', type: 'carrier-pigeon', content_he: 'x', content_en: 'x' }],
  }), /invalid step type/);
});

// ─────────────────────────────────────────────────────────────
// 3. Trigger matching
// ─────────────────────────────────────────────────────────────

test('09. trigger: new-lead fires matching playbook', () => {
  const eng = new SalesPlaybook();
  const out = eng.trigger('new-lead', {
    opportunity_id: 'opp-100',
    source: 'website',
  });
  assert.ok(out.length >= 1);
  const exec = out.find((e) => e.playbook_id === 'pb-new-inbound-lead');
  assert.ok(exec, 'expected pb-new-inbound-lead to fire');
  assert.equal(exec.opportunity_id, 'opp-100');
  assert.equal(exec.status, 'active');
  assert.equal(exec.current_step_index, 0);
});

test('10. trigger: stuck-in-stage-X-days — days threshold is a lower bound', () => {
  const eng = new SalesPlaybook();
  // Proposal threshold is 7 days → 3 days should NOT fire
  const tooEarly = eng.trigger('stuck-in-stage-X-days', {
    stage: 'Proposal', days: 3, opportunity_id: 'opp-201',
  });
  assert.equal(
    tooEarly.filter((e) => e.playbook_id === 'pb-stuck-in-proposal').length,
    0,
    'should not fire before the 7-day threshold',
  );
  // 8 days should fire
  const onTime = eng.trigger('stuck-in-stage-X-days', {
    stage: 'Proposal', days: 8, opportunity_id: 'opp-202',
  });
  assert.equal(
    onTime.filter((e) => e.playbook_id === 'pb-stuck-in-proposal').length,
    1,
    'should fire at or above the 7-day threshold',
  );
});

test('11. trigger: competitor-detected fires recovery playbook', () => {
  const eng = new SalesPlaybook();
  const out = eng.trigger('competitor-detected', {
    competitor: 'SAP',
    opportunity_id: 'opp-300',
  });
  const exec = out.find((e) => e.playbook_id === 'pb-lost-to-competitor-recovery');
  assert.ok(exec);
});

test('12. trigger: stage-change only fires upsell when toStage=Customer', () => {
  const eng = new SalesPlaybook();
  const noMatch = eng.trigger('stage-change', {
    fromStage: 'Lead', toStage: 'Proposal', opportunity_id: 'opp-400',
  });
  assert.equal(
    noMatch.filter((e) => e.playbook_id === 'pb-upsell-existing').length,
    0,
  );
  const match = eng.trigger('stage-change', {
    fromStage: 'Negotiation', toStage: 'Customer', opportunity_id: 'opp-401',
  });
  assert.equal(
    match.filter((e) => e.playbook_id === 'pb-upsell-existing').length,
    1,
  );
});

test('13. trigger: invalid event throws bilingual error', () => {
  const eng = new SalesPlaybook();
  assert.throws(() => eng.trigger('astral-projection', {}), /invalid trigger event/);
});

// ─────────────────────────────────────────────────────────────
// 4. Step progression
// ─────────────────────────────────────────────────────────────

test('14. getCurrentStep returns the active step with bilingual content', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-500', source: 'web',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  const step = eng.getCurrentStep(exec.id);
  assert.equal(step.step_index, 0);
  assert.equal(step.step_id, 'step-1');
  assert.equal(step.type, 'call');
  assert.ok(step.content_he.length > 0);
  assert.ok(step.content_en.length > 0);
  assert.ok(step.type_label_he.length > 0);
  assert.ok(step.type_label_en.length > 0);
});

test('15. completeStep advances to the next step', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-600',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  const updated = eng.completeStep(exec.id, 'step-1', {
    result: 'positive', notes: 'good fit',
  });
  assert.equal(updated.current_step_index, 1);
  assert.equal(updated.status, 'active');
  assert.equal(updated.steps_state[0].status, 'completed');
  assert.equal(updated.steps_state[0].outcome.result, 'positive');
  assert.equal(updated.steps_state[1].status, 'active');
});

test('16. completing the final step marks execution completed', () => {
  const eng = new SalesPlaybook({ seed: false });
  eng.definePlaybook({
    id: 'pb-tiny',
    name_he: 'זעיר', name_en: 'Tiny',
    trigger: { type: 'new-lead' },
    steps: [
      { id: 's1', type: 'call',  content_he: 'א', content_en: 'A', waitDays: 0, dueDays: 1 },
      { id: 's2', type: 'email', content_he: 'ב', content_en: 'B', waitDays: 1, dueDays: 1 },
    ],
  });
  const [exec] = eng.trigger('new-lead', { opportunity_id: 'opp-700' });
  eng.completeStep(exec.id, 's1', { result: 'positive' });
  const final = eng.completeStep(exec.id, 's2', { result: 'won' });
  assert.equal(final.status, 'completed');
  assert.ok(final.completed_at);
  assert.equal(eng.getCurrentStep(exec.id), null);
});

test('17. completeStep rejects wrong step id', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-800',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  assert.throws(
    () => eng.completeStep(exec.id, 'step-5', {}),
    /is not the current step/,
  );
});

// ─────────────────────────────────────────────────────────────
// 5. Skip tracking (append-only, reason logged)
// ─────────────────────────────────────────────────────────────

test('18. skipStep: status=skipped, reason logged, step NOT removed', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-900',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  const before = eng.getExecution(exec.id);
  const beforeCount = before.steps_state.length;

  const updated = eng.skipStep(exec.id, 'step-1', 'לקוח לא זמין');
  assert.equal(updated.current_step_index, 1);
  assert.equal(updated.steps_state[0].status, 'skipped');
  assert.equal(updated.steps_state[0].skipped, true);
  assert.equal(updated.steps_state[0].skip_reason, 'לקוח לא זמין');
  // Step count is preserved — never delete
  assert.equal(updated.steps_state.length, beforeCount);
});

test('19. skipStep requires a reason', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-901',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  assert.throws(() => eng.skipStep(exec.id, 'step-1', ''), /skip reason is required/);
  assert.throws(() => eng.skipStep(exec.id, 'step-1'), /skip reason is required/);
});

test('20. cancelExecution keeps the execution (append-only)', () => {
  const eng = new SalesPlaybook();
  const [exec] = eng.trigger('new-lead', {
    opportunity_id: 'opp-902',
  }).filter((e) => e.playbook_id === 'pb-new-inbound-lead');
  const cancelled = eng.cancelExecution(exec.id, 'lead disqualified');
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.cancelled_at);
  // It's still in the store
  const fetched = eng.getExecution(exec.id);
  assert.ok(fetched);
  assert.equal(fetched.status, 'cancelled');
});

// ─────────────────────────────────────────────────────────────
// 6. Metrics aggregation
// ─────────────────────────────────────────────────────────────

test('21. metrics aggregates executions, completions, skip rate', () => {
  const eng = new SalesPlaybook();
  // Five leads trigger the same playbook
  const execs = [];
  for (let i = 0; i < 5; i += 1) {
    const [e] = eng.trigger('new-lead', { opportunity_id: `opp-m${i}` })
      .filter((x) => x.playbook_id === 'pb-new-inbound-lead');
    execs.push(e);
  }
  // Complete all 5 steps on the first 3 execs
  for (let i = 0; i < 3; i += 1) {
    const e = execs[i];
    for (let s = 1; s <= 5; s += 1) {
      eng.completeStep(e.id, `step-${s}`, { result: s === 5 ? 'won' : 'positive' });
    }
  }
  // Skip step-2 on exec 4, then complete
  eng.completeStep(execs[3].id, 'step-1', { result: 'positive' });
  eng.skipStep(execs[3].id, 'step-2', 'נמסר בטלפון');
  // Cancel exec 5
  eng.cancelExecution(execs[4].id, 'timing bad');

  const m = eng.metrics('pb-new-inbound-lead');
  assert.equal(m.total_executions, 5);
  assert.equal(m.completed, 3);
  assert.equal(m.cancelled, 1);
  assert.equal(m.active, 1);
  assert.equal(m.completion_rate, 0.6);
  assert.ok(m.steps_completed > 0);
  assert.equal(m.steps_skipped, 1);
  assert.ok(m.outcome_breakdown.won >= 3);
  assert.ok(m.outcome_breakdown.positive >= 3);
  assert.equal(m.top_skip_reasons[0].reason, 'נמסר בטלפון');
  assert.equal(m.top_skip_reasons[0].count, 1);
});

test('22. metrics respects period window', () => {
  const eng = new SalesPlaybook();
  eng.trigger('new-lead', { opportunity_id: 'opp-p1' });
  // Future window — should exclude everything
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const later  = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);
  const m = eng.metrics('pb-new-inbound-lead', { from: future, to: later });
  assert.equal(m.total_executions, 0);
});

test('23. metrics throws for unknown playbook', () => {
  const eng = new SalesPlaybook();
  assert.throws(() => eng.metrics('pb-does-not-exist'), /playbook not found/);
});

// ─────────────────────────────────────────────────────────────
// 7. Listing / filtering
// ─────────────────────────────────────────────────────────────

test('24. listExecutions filters by playbook_id and status', () => {
  const eng = new SalesPlaybook();
  eng.trigger('new-lead', { opportunity_id: 'opp-l1' });
  eng.trigger('new-lead', { opportunity_id: 'opp-l2' });
  eng.trigger('competitor-detected', { opportunity_id: 'opp-l3', competitor: 'x' });

  const newLeadExecs = eng.listExecutions({ playbook_id: 'pb-new-inbound-lead' });
  assert.equal(newLeadExecs.length, 2);
  const activeOnly = eng.listExecutions({ status: 'active' });
  assert.ok(activeOnly.every((e) => e.status === 'active'));
  const byOpp = eng.listExecutions({ opportunity_id: 'opp-l1' });
  assert.equal(byOpp.length, 1);
});

test('25. seedDefaults is idempotent (never duplicates ids)', () => {
  const eng = new SalesPlaybook();
  eng.seedDefaults();
  eng.seedDefaults();
  const ids = eng.listPlaybooks().map((p) => p.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size);
  assert.equal(ids.length, 5);
});

test('26. buildDefaultPlaybooks is a pure factory (fresh objects)', () => {
  const a = buildDefaultPlaybooks();
  const b = buildDefaultPlaybooks();
  assert.notEqual(a, b);
  assert.equal(a.length, b.length);
  assert.equal(a[0].id, b[0].id);
});
