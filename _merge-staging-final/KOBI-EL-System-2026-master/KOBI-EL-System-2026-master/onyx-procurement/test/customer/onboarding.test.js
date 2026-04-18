/**
 * Tests — Customer Onboarding Workflow Engine
 * Agent Y-98 • Techno-Kol Uzi mega-ERP • Swarm Customer Success
 *
 * Zero-dependency — uses only node:assert and node:test.
 * Covers: initiation, kickoff, requirements collection, setup,
 * configuration, training, UAT, go-live gates, success metrics,
 * risks, blocker escalation, days-in-phase, health scoring,
 * phase progression and handoff.
 *
 * Run: node --test test/customer/onboarding.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CustomerOnboarding,
  PHASES,
  PHASE_ORDER,
  TASK_STATUS,
  ONBOARDING_STATUS,
  HEALTH,
  RISK_LEVEL,
  ESCALATION_LEVEL,
  LABELS,
  PHASE_TASK_TEMPLATES,
  DISCOVERY_QUESTIONNAIRE,
  UAT_CHECKLIST_TEMPLATE,
  GO_LIVE_CHECKLIST_TEMPLATE,
  DEFAULT_SUCCESS_METRICS,
  RISK_CATALOG,
  PHASE_STUCK_THRESHOLD_DAYS,
  createMemoryStore,
  phaseIndex,
  nextPhase,
} = require('../../src/customer/onboarding.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-11T08:00:00.000Z');
const FAR_FUTURE = new Date('2026-07-11T08:00:00.000Z');

function makeClock(d = FIXED_NOW) {
  let t = new Date(d);
  return {
    get: () => new Date(t),
    advance(days) {
      t = new Date(t.getTime() + days * 86_400_000);
      return new Date(t);
    },
    set(newDate) { t = new Date(newDate); },
  };
}

function makeEngine(clock = makeClock()) {
  return new CustomerOnboarding({
    now: () => clock.get(),
    store: createMemoryStore(),
  });
}

function baseArgs(overrides = {}) {
  return {
    customerId: 'cust_001',
    product: 'onyx-procurement',
    package: 'enterprise',
    owner: 'onb_owner_1',
    startDate: new Date('2026-04-15T00:00:00Z'),
    targetGoLiveDate: new Date('2026-06-15T00:00:00Z'),
    ...overrides,
  };
}

function fullRequirements() {
  const out = {};
  DISCOVERY_QUESTIONNAIRE.forEach((q) => {
    if (q.required) out[q.id] = 'answer for ' + q.id;
  });
  return out;
}

// ──────────────────────────────────────────────────────────────────
// CONSTANTS & STRUCTURE
// ──────────────────────────────────────────────────────────────────

test('PHASES — exports all 8 standard phases in order', () => {
  assert.equal(PHASE_ORDER.length, 8);
  assert.deepEqual(PHASE_ORDER, [
    PHASES.KICKOFF,
    PHASES.DISCOVERY,
    PHASES.SETUP,
    PHASES.CONFIGURATION,
    PHASES.TRAINING,
    PHASES.UAT,
    PHASES.GO_LIVE,
    PHASES.REVIEW_30D,
  ]);
});

test('LABELS — every phase has bilingual he/en labels', () => {
  for (const phase of PHASE_ORDER) {
    const lbl = LABELS[phase.toUpperCase()];
    assert.ok(lbl, 'label missing for ' + phase);
    assert.ok(lbl.he && lbl.he.length > 0, 'he empty for ' + phase);
    assert.ok(lbl.en && lbl.en.length > 0, 'en empty for ' + phase);
  }
});

test('PHASE_TASK_TEMPLATES — every phase has at least one mandatory task', () => {
  for (const phase of PHASE_ORDER) {
    const tasks = PHASE_TASK_TEMPLATES[phase];
    assert.ok(Array.isArray(tasks) && tasks.length > 0, 'no tasks for ' + phase);
    assert.ok(tasks.some((t) => t.mandatory), 'no mandatory task for ' + phase);
  }
});

test('phaseIndex / nextPhase — helpers return correct neighbors', () => {
  assert.equal(phaseIndex(PHASES.KICKOFF), 0);
  assert.equal(phaseIndex(PHASES.REVIEW_30D), 7);
  assert.equal(nextPhase(PHASES.KICKOFF), PHASES.DISCOVERY);
  assert.equal(nextPhase(PHASES.REVIEW_30D), null);
});

// ──────────────────────────────────────────────────────────────────
// INITIATION
// ──────────────────────────────────────────────────────────────────

test('initiateOnboarding — creates a record with all phases & tasks', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.ok(rec.id.startsWith('conb_'));
  assert.equal(rec.customerId, 'cust_001');
  assert.equal(rec.product, 'onyx-procurement');
  assert.equal(rec.package, 'enterprise');
  assert.equal(rec.status, ONBOARDING_STATUS.ACTIVE);
  assert.equal(rec.currentPhase, PHASES.KICKOFF);
  assert.equal(rec.phases.length, 8);
  assert.ok(rec.phases.every((p) => p.tasks.length > 0));
  assert.equal(rec.phases[0].enteredAt !== null, true);
  assert.equal(rec.history[0].event, 'initiated');
});

test('initiateOnboarding — rejects missing fields', () => {
  const eng = makeEngine();
  assert.throws(() => eng.initiateOnboarding({}), /Missing required fields/);
  assert.throws(() => eng.initiateOnboarding(baseArgs({ customerId: '' })), /Missing required fields/);
});

test('initiateOnboarding — rejects invalid dates', () => {
  const eng = makeEngine();
  assert.throws(() => eng.initiateOnboarding(baseArgs({ startDate: 'not-a-date' })), /Invalid startDate/);
  assert.throws(() => eng.initiateOnboarding(baseArgs({
    startDate: new Date('2026-06-01'),
    targetGoLiveDate: new Date('2026-05-01'),
  })), />= startDate/);
});

// ──────────────────────────────────────────────────────────────────
// KICKOFF
// ──────────────────────────────────────────────────────────────────

test('kickoffMeeting — schedules with bilingual agenda', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const meeting = eng.kickoffMeeting(rec.id, { attendees: ['alice', 'bob'] });

  assert.ok(meeting.scheduledAt);
  assert.equal(meeting.attendees.length, 2);
  assert.ok(meeting.agenda.length >= 5);
  assert.ok(meeting.agenda.every((a) => a.he && a.en));

  // The kickoff tasks should be marked done
  const updated = eng.getOnboarding(rec.id);
  const kickoffPhase = updated.phases[0];
  const scheduleTask = kickoffPhase.tasks.find((t) => t.id === 'kickoff_schedule');
  const agendaTask = kickoffPhase.tasks.find((t) => t.id === 'kickoff_agenda');
  assert.equal(scheduleTask.status, TASK_STATUS.DONE);
  assert.equal(agendaTask.status, TASK_STATUS.DONE);
});

// ──────────────────────────────────────────────────────────────────
// DISCOVERY / REQUIREMENTS
// ──────────────────────────────────────────────────────────────────

test('collectRequirements — partial answers report missing fields', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const res = eng.collectRequirements(rec.id, { business_goals: 'grow revenue' });
  assert.equal(res.complete, false);
  assert.ok(res.missing.length > 0);
  assert.ok(res.missing.includes('success_definition'));
});

test('collectRequirements — full required answers mark discovery task done', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const res = eng.collectRequirements(rec.id, fullRequirements());
  assert.equal(res.complete, true);
  assert.equal(res.missing.length, 0);

  const updated = eng.getOnboarding(rec.id);
  const discoveryTask = updated.phases[1].tasks.find((t) => t.id === 'discovery_questions');
  assert.equal(discoveryTask.status, TASK_STATUS.DONE);
});

test('collectRequirements — rejects non-object input', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.collectRequirements(rec.id, 'nope'), /must be an object/);
});

// ──────────────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────────────

test('setupTasks — assigns due dates to all setup tasks', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const tasks = eng.setupTasks(rec.id);
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((t) => t.dueAt !== null));
  assert.ok(tasks.every((t) => t.assignee === rec.owner));
});

// ──────────────────────────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────────────────────────

test('configureProduct — stores config and completes matching tasks', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const cfg = eng.configureProduct(rec.id, {
    workflows: [{ name: 'approval' }],
    templates: ['invoice'],
    branding: { logo: 'logo.png' },
    features: ['multi_currency'],
  });
  assert.ok(cfg.appliedAt);
  assert.ok(cfg.workflows);

  const updated = eng.getOnboarding(rec.id);
  const cfgPhase = updated.phases.find((p) => p.phase === PHASES.CONFIGURATION);
  const wfTask = cfgPhase.tasks.find((t) => t.id === 'config_workflows');
  const tplTask = cfgPhase.tasks.find((t) => t.id === 'config_templates');
  assert.equal(wfTask.status, TASK_STATUS.DONE);
  assert.equal(tplTask.status, TASK_STATUS.DONE);
});

test('configureProduct — rejects non-object config', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.configureProduct(rec.id, null), /must be an object/);
});

// ──────────────────────────────────────────────────────────────────
// TRAINING
// ──────────────────────────────────────────────────────────────────

test('trainingSessions — schedules and marks training tasks in progress', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const sessions = eng.trainingSessions({
    onboardingId: rec.id,
    participants: [
      { id: 'u1', name: 'Dani', email: 'dani@example.com', role: 'admin' },
      { id: 'u2', name: 'Noa',  email: 'noa@example.com',  role: 'user' },
    ],
    sessions: [
      { title: { he: 'הדרכת מנהלים', en: 'Admin training' }, scheduledAt: new Date('2026-05-01T10:00:00Z'), trainer: 't1', mode: 'online' },
      { title: { he: 'הדרכת משתמשי קצה', en: 'End user training' }, scheduledAt: new Date('2026-05-02T10:00:00Z'), trainer: 't1', mode: 'online' },
    ],
  });

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].participants.length, 2);
  assert.ok(sessions[0].scheduledAt);

  const updated = eng.getOnboarding(rec.id);
  const trainPhase = updated.phases.find((p) => p.phase === PHASES.TRAINING);
  assert.ok(trainPhase.tasks.every((t) => t.status === TASK_STATUS.IN_PROGRESS));
});

test('trainingSessions — rejects empty sessions array', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.trainingSessions({ onboardingId: rec.id, sessions: [] }), /sessions\[\] is required/);
});

// ──────────────────────────────────────────────────────────────────
// UAT CHECKLIST
// ──────────────────────────────────────────────────────────────────

test('uatChecklist — initializes full template on first call', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const items = eng.uatChecklist(rec.id);
  assert.equal(items.length, UAT_CHECKLIST_TEMPLATE.length);
  assert.ok(items.every((i) => i.he && i.en));
  assert.ok(items.every((i) => i.status === TASK_STATUS.PENDING));
});

test('uatChecklist — marking all mandatory items passes the UAT exec task', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const items = eng.uatChecklist(rec.id);
  for (const it of items.filter((x) => x.mandatory)) {
    eng.updateUatItem(rec.id, it.id, true, 'checked');
  }
  const updated = eng.getOnboarding(rec.id);
  const uatPhase = updated.phases.find((p) => p.phase === PHASES.UAT);
  const execTask = uatPhase.tasks.find((t) => t.id === 'uat_exec');
  assert.equal(execTask.status, TASK_STATUS.DONE);
});

test('updateUatItem — failing an item records blocked status and history', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  eng.uatChecklist(rec.id);
  const first = eng.updateUatItem(rec.id, 'uat_hebrew_rtl', false, 'mirror bug');
  assert.equal(first.status, TASK_STATUS.BLOCKED);
  assert.equal(first.history.length, 1);
  assert.equal(first.history[0].to, TASK_STATUS.BLOCKED);
});

// ──────────────────────────────────────────────────────────────────
// GO-LIVE CHECKLIST
// ──────────────────────────────────────────────────────────────────

test('goLiveChecklist — initializes items and goLiveReady flags open gates', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const items = eng.goLiveChecklist(rec.id);
  assert.equal(items.length, GO_LIVE_CHECKLIST_TEMPLATE.length);
  assert.equal(eng.goLiveReady(rec.id).ready, false);
});

test('goLiveReady — all gates done yields ready=true', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const items = eng.goLiveChecklist(rec.id);
  for (const it of items) {
    eng.updateGoLiveItem(rec.id, it.id, true, 'ok');
  }
  const ready = eng.goLiveReady(rec.id);
  assert.equal(ready.ready, true);
  assert.equal(ready.openGates.length, 0);
});

// ──────────────────────────────────────────────────────────────────
// SUCCESS METRICS
// ──────────────────────────────────────────────────────────────────

test('successMetrics — merges defaults with custom metrics', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const metrics = eng.successMetrics({
    onboardingId: rec.id,
    metrics: [
      { id: 'time_to_value', target: 21 },
      { id: 'custom_roi', he: 'ROI', en: 'Return on Investment', target: 150, unit: '%', direction: 'max' },
    ],
  });
  const ttv = metrics.find((m) => m.id === 'time_to_value');
  const roi = metrics.find((m) => m.id === 'custom_roi');
  assert.equal(ttv.target, 21);
  assert.ok(roi);
  assert.equal(roi.target, 150);
  // Defaults retained
  assert.ok(metrics.find((m) => m.id === 'nps_score'));
});

test('successMetrics — rejects non-array input', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.successMetrics({ onboardingId: rec.id, metrics: 'nope' }), /must be an array/);
});

// ──────────────────────────────────────────────────────────────────
// PHASE PROGRESSION
// ──────────────────────────────────────────────────────────────────

test('advancePhase — refuses when mandatory tasks are open', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.advancePhase(rec.id), /mandatory task\(s\) open/);
});

test('advancePhase — advances when all mandatory tasks done', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  // Kickoff is first. Complete all its mandatory tasks
  eng.kickoffMeeting(rec.id);
  const after = eng.getOnboarding(rec.id);
  const kickoffPhase = after.phases[0];
  for (const t of kickoffPhase.tasks) {
    if (t.status !== TASK_STATUS.DONE && t.mandatory) {
      eng.completeTask(rec.id, PHASES.KICKOFF, t.id, rec.owner);
    }
  }
  const advanced = eng.advancePhase(rec.id);
  assert.equal(advanced.currentPhase, PHASES.DISCOVERY);
  assert.ok(advanced.phases[0].exitedAt);
  assert.ok(advanced.phases[1].enteredAt);
});

test('advancePhase — force=true bypasses check but keeps audit', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const advanced = eng.advancePhase(rec.id, { force: true });
  assert.equal(advanced.currentPhase, PHASES.DISCOVERY);
});

// ──────────────────────────────────────────────────────────────────
// DAYS IN PHASE & STUCK DETECTION
// ──────────────────────────────────────────────────────────────────

test('daysInPhase — returns 0 immediately after creation', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.equal(eng.daysInPhase(rec.id), 0);
});

test('daysInPhase — grows with injected clock', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.advance(5);
  assert.equal(eng.daysInPhase(rec.id), 5);
  clock.advance(3);
  assert.equal(eng.daysInPhase(rec.id), 8);
});

// ──────────────────────────────────────────────────────────────────
// RISK ASSESSMENT
// ──────────────────────────────────────────────────────────────────

test('riskAssessment — flags stuck phase after threshold days', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.advance(PHASE_STUCK_THRESHOLD_DAYS[PHASES.KICKOFF] + 1);
  const risks = eng.riskAssessment(rec.id);
  assert.ok(risks.some((r) => r.catalogId === 'stuck_phase'));
});

test('riskAssessment — flags discovery gaps when 5+ required questions missing', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  eng.collectRequirements(rec.id, { business_goals: 'x' });
  const risks = eng.riskAssessment(rec.id);
  assert.ok(risks.some((r) => r.key === 'discovery_gaps'));
});

test('riskAssessment — no duplicate risks on repeat scans', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.advance(PHASE_STUCK_THRESHOLD_DAYS[PHASES.KICKOFF] + 1);
  eng.riskAssessment(rec.id);
  const countA = eng.getOnboarding(rec.id).risks.length;
  eng.riskAssessment(rec.id);
  const countB = eng.getOnboarding(rec.id).risks.length;
  assert.equal(countA, countB);
});

// ──────────────────────────────────────────────────────────────────
// BLOCKER ESCALATION
// ──────────────────────────────────────────────────────────────────

test('blockerEscalation — low severity stays at L1_OWNER', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const out = eng.blockerEscalation(rec.id, { title: 'small issue', severity: RISK_LEVEL.LOW });
  assert.equal(out.escalation.level, ESCALATION_LEVEL.L1_OWNER);
  const updated = eng.getOnboarding(rec.id);
  assert.equal(updated.status, ONBOARDING_STATUS.ACTIVE);
});

test('blockerEscalation — critical severity jumps to L4_EXEC', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const out = eng.blockerEscalation(rec.id, {
    title: 'production down',
    severity: RISK_LEVEL.CRITICAL,
    description: 'system unavailable',
  });
  assert.equal(out.escalation.level, ESCALATION_LEVEL.L4_EXEC);
  const updated = eng.getOnboarding(rec.id);
  assert.equal(updated.status, ONBOARDING_STATUS.ESCALATED);
  assert.equal(updated.blockers.length, 1);
  assert.equal(updated.escalations.length, 1);
});

test('blockerEscalation — escalation ladder steps up with repeat blockers', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const a = eng.blockerEscalation(rec.id, { title: 'issue a', severity: RISK_LEVEL.LOW });
  const b = eng.blockerEscalation(rec.id, { title: 'issue b', severity: RISK_LEVEL.LOW });
  assert.equal(a.escalation.level, ESCALATION_LEVEL.L1_OWNER);
  // Second blocker with 1 active → bumps to L2_LEAD path
  assert.ok([ESCALATION_LEVEL.L2_LEAD, ESCALATION_LEVEL.L3_DIR].includes(b.escalation.level));
});

test('blockerEscalation — never deletes blockers, all preserved', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  eng.blockerEscalation(rec.id, { title: 'first',  severity: RISK_LEVEL.LOW });
  eng.blockerEscalation(rec.id, { title: 'second', severity: RISK_LEVEL.HIGH });
  eng.blockerEscalation(rec.id, { title: 'third',  severity: RISK_LEVEL.CRITICAL });
  const updated = eng.getOnboarding(rec.id);
  assert.equal(updated.blockers.length, 3);
  assert.equal(updated.escalations.length, 3);
});

// ──────────────────────────────────────────────────────────────────
// HEALTH STATUS
// ──────────────────────────────────────────────────────────────────

test('onboardingHealth — fresh record is GREEN', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const h = eng.onboardingHealth(rec.id);
  assert.equal(h.color, HEALTH.GREEN);
  assert.ok(h.label.he && h.label.en);
  assert.equal(h.stuckDays, 0);
});

test('onboardingHealth — YELLOW when phase is stuck past threshold', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.advance(PHASE_STUCK_THRESHOLD_DAYS[PHASES.KICKOFF] + 1);
  const h = eng.onboardingHealth(rec.id);
  assert.equal(h.color, HEALTH.YELLOW);
  assert.ok(h.reasons.some((r) => r.code === 'stuck'));
});

test('onboardingHealth — RED when phase is severely stuck', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.advance(PHASE_STUCK_THRESHOLD_DAYS[PHASES.KICKOFF] * 2 + 2);
  const h = eng.onboardingHealth(rec.id);
  assert.equal(h.color, HEALTH.RED);
  assert.ok(h.reasons.some((r) => r.code === 'severely_stuck'));
});

test('onboardingHealth — RED when critical blocker escalated', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  eng.blockerEscalation(rec.id, { title: 'prod down', severity: RISK_LEVEL.CRITICAL });
  const h = eng.onboardingHealth(rec.id);
  assert.equal(h.color, HEALTH.RED);
});

test('onboardingHealth — RED when target go-live date is missed', () => {
  const clock = makeClock();
  const eng = makeEngine(clock);
  const rec = eng.initiateOnboarding(baseArgs());
  clock.set(new Date('2026-07-01T00:00:00Z')); // past targetGoLiveDate
  const h = eng.onboardingHealth(rec.id);
  assert.equal(h.color, HEALTH.RED);
  assert.ok(h.reasons.some((r) => r.code === 'go_live_missed'));
});

// ──────────────────────────────────────────────────────────────────
// HANDOFF
// ──────────────────────────────────────────────────────────────────

test('handoffToSuccess — refuses when go-live tasks open', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.handoffToSuccess(rec.id, 'csm_1'), /Cannot handoff/);
});

test('handoffToSuccess — force completes and flips status', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  const out = eng.handoffToSuccess(rec.id, 'csm_1', { force: true });
  assert.equal(out.status, ONBOARDING_STATUS.HANDED_OFF);
  assert.equal(out.csmId, 'csm_1');
  assert.ok(out.handedOffAt);
});

test('handoffToSuccess — requires csmId', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  assert.throws(() => eng.handoffToSuccess(rec.id, null, { force: true }), /csmId is required/);
});

test('handoffToSuccess — full happy path completes all mandatory tasks', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  // Walk all phases: close mandatory tasks
  for (const phaseKey of PHASE_ORDER) {
    const snap = eng.getOnboarding(rec.id);
    const phase = snap.phases.find((p) => p.phase === phaseKey);
    for (const t of phase.tasks) {
      if (t.mandatory && t.status !== TASK_STATUS.DONE) {
        eng.completeTask(rec.id, phaseKey, t.id, rec.owner);
      }
    }
  }
  const out = eng.handoffToSuccess(rec.id, 'csm_42');
  assert.equal(out.csmId, 'csm_42');
  assert.equal(out.status, ONBOARDING_STATUS.HANDED_OFF);
  const updated = eng.getOnboarding(rec.id);
  assert.ok(updated.history.some((h) => h.event === 'handed_off'));
});

// ──────────────────────────────────────────────────────────────────
// NEVER-DELETE RULE
// ──────────────────────────────────────────────────────────────────

test('store — memory store has no delete method (never-delete rule)', () => {
  const store = createMemoryStore();
  assert.equal(typeof store.delete, 'undefined');
});

test('phase history — exited & completed phases keep history entries', () => {
  const eng = makeEngine();
  const rec = eng.initiateOnboarding(baseArgs());
  eng.advancePhase(rec.id, { force: true });
  const updated = eng.getOnboarding(rec.id);
  const kickoffPhase = updated.phases.find((p) => p.phase === PHASES.KICKOFF);
  assert.ok(kickoffPhase.exitedAt);
  assert.ok(kickoffPhase.history.some((h) => h.event === 'exited'));
  const discoveryPhase = updated.phases.find((p) => p.phase === PHASES.DISCOVERY);
  assert.ok(discoveryPhase.enteredAt);
});

test('audit log — every mutation appends to the engine audit trail', () => {
  const eng = makeEngine();
  const before = eng.audit.length;
  const rec = eng.initiateOnboarding(baseArgs());
  eng.kickoffMeeting(rec.id);
  eng.collectRequirements(rec.id, fullRequirements());
  const after = eng.audit.length;
  assert.ok(after > before);
  assert.ok(eng.audit.some((e) => e.action === 'initiateOnboarding'));
  assert.ok(eng.audit.some((e) => e.action === 'kickoffMeeting'));
  assert.ok(eng.audit.some((e) => e.action === 'collectRequirements'));
});
