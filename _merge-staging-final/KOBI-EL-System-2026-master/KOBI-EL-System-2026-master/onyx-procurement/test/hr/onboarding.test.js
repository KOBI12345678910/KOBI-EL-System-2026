/**
 * Tests — Employee Onboarding Workflow Engine
 * Agent Y-63 • Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency — uses only node:assert and node:test.
 * Covers: task sequencing, Form 101 field coverage, role-based equipment,
 * blocker detection, buddy assignment, never-delete rule.
 *
 * Run: node --test test/hr/onboarding.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OnboardingWorkflow,
  PHASES,
  PHASE_ORDER,
  TASK_STATUS,
  ONBOARDING_STATUS,
  FORM_101_FIELDS,
  ROLE_EQUIPMENT,
  TASK_TEMPLATES,
  createMemoryStore,
  isValidTz,
  normalizeRole,
  computeCreditPoints,
  computeCurrentPhase,
} = require('../../src/hr/onboarding.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-11T08:00:00.000Z');
const VALID_TZ   = '000000018';  // known-valid Luhn-compliant tz
const VALID_TZ_2 = '000000026';

function makeEmployee(overrides = {}) {
  return {
    name: 'דני כהן',
    id: VALID_TZ,
    email: 'dani@techno-kol.co.il',
    phone: '050-1234567',
    address: 'רחוב הרצל 1, תל אביב',
    startDate: new Date('2026-04-20T00:00:00Z'), // 9 days after FIXED_NOW
    position: 'Welder',
    department: 'Production',
    manager: 'moshe_levy',
    role: 'metal_fab',
    gender: 'male',
    maritalStatus: 'married',
    spouseWorks: false,
    childrenCount: 2,
    childrenUnder18: 2,
    isResident: true,
    ...overrides,
  };
}

function makeEngine(opts = {}) {
  return new OnboardingWorkflow({
    now: () => new Date(FIXED_NOW),
    store: createMemoryStore(),
    buddyPool: [
      { id: 'b1', name: 'אבי מזרחי', seniorityYears: 5, department: 'Production' },
      { id: 'b2', name: 'Noa Ben Ari', seniorityYears: 3, department: 'R&D' },
      { id: 'b3', name: 'Yossi Levy', seniorityYears: 8, department: 'Production' },
    ],
    ...opts,
  });
}

// ──────────────────────────────────────────────────────────────────
// UTILITY VALIDATION
// ──────────────────────────────────────────────────────────────────

test('isValidTz — passes for known-valid 9-digit IDs', () => {
  assert.equal(isValidTz('000000018'), true);
  assert.equal(isValidTz('000000026'), true);
  assert.equal(isValidTz(18), true); // numeric accepted
});

test('isValidTz — rejects malformed IDs', () => {
  assert.equal(isValidTz(''), false);
  assert.equal(isValidTz('abcdefghi'), false);
  assert.equal(isValidTz('123456789'), false); // checksum fail
  assert.equal(isValidTz(null), false);
  assert.equal(isValidTz(undefined), false);
});

test('normalizeRole — known roles, heuristics, and fallback', () => {
  assert.equal(normalizeRole('office_worker'), 'office_worker');
  assert.equal(normalizeRole('Manager'), 'manager');
  assert.equal(normalizeRole('Welder'), 'metal_fab');
  assert.equal(normalizeRole('Assembly Worker'), 'factory_worker');
  assert.equal(normalizeRole('Driver'), 'driver');
  assert.equal(normalizeRole(undefined), 'office_worker');
  assert.equal(normalizeRole('marketing analyst'), 'office_worker');
});

test('computeCreditPoints — 2026 base rules', () => {
  const male = computeCreditPoints({ isResident: true, gender: 'male' });
  assert.equal(male, 2.25);
  const female = computeCreditPoints({ isResident: true, gender: 'female' });
  assert.equal(female, 2.75);

  const mom3 = computeCreditPoints({
    isResident: true, gender: 'female', maritalStatus: 'married',
    spouseWorks: false, childrenUnder18: 3,
  });
  // 2.75 + 1 (spouse) + 1.5 (3 kids * 0.5) = 5.25
  assert.equal(mom3, 5.25);

  const oleh = computeCreditPoints({ isResident: true, gender: 'male', newImmigrant: true, academicDegree: true });
  // 2.25 + 1 + 0.5 = 3.75
  assert.equal(oleh, 3.75);

  const nonresident = computeCreditPoints({ isResident: false });
  assert.equal(nonresident, 0);
});

test('computeCurrentPhase — time math', () => {
  const start = new Date('2026-05-01');
  assert.equal(computeCurrentPhase(new Date('2026-04-20'), start), PHASES.PRE_BOARDING);
  assert.equal(computeCurrentPhase(new Date('2026-05-01T08:00Z'), start), PHASES.DAY_1);
  assert.equal(computeCurrentPhase(new Date('2026-05-04'), start), PHASES.WEEK_1);
  assert.equal(computeCurrentPhase(new Date('2026-05-15'), start), PHASES.MONTH_1);
  assert.equal(computeCurrentPhase(new Date('2026-07-01'), start), PHASES.MONTH_3);
});

// ──────────────────────────────────────────────────────────────────
// startOnboarding()
// ──────────────────────────────────────────────────────────────────

test('startOnboarding — happy path creates record with all phases', () => {
  const eng = makeEngine();
  const record = eng.startOnboarding({ employee: makeEmployee() });

  assert.ok(record.id.startsWith('onb_'));
  assert.equal(record.status, ONBOARDING_STATUS.ACTIVE);
  assert.deepEqual(record.phases, PHASE_ORDER);

  // Task count = templates count
  assert.equal(record.tasks.length, TASK_TEMPLATES.length);

  // Every phase represented
  for (const phase of PHASE_ORDER) {
    const tasksInPhase = record.tasks.filter((t) => t.phase === phase);
    assert.ok(tasksInPhase.length > 0, `phase ${phase} has at least one task`);
  }
});

test('startOnboarding — required field validation', () => {
  const eng = makeEngine();
  assert.throws(() => eng.startOnboarding({}), /employee/);
  assert.throws(
    () => eng.startOnboarding({ employee: { name: 'a' } }),
    /Missing employee fields/,
  );
});

test('startOnboarding — task sequencing (pre-boarding before day 1 before week 1…)', () => {
  const eng = makeEngine();
  const record = eng.startOnboarding({ employee: makeEmployee() });

  // Sort tasks by dueAt and verify phases don't regress
  const sorted = record.tasks.slice().sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const phaseIdx = (p) => PHASE_ORDER.indexOf(p);
  let lastIdx = -1;
  for (const task of sorted) {
    assert.ok(phaseIdx(task.phase) >= lastIdx, `task ${task.id} in phase ${task.phase} out of order`);
    lastIdx = phaseIdx(task.phase);
  }
});

test('startOnboarding — pre-boarding tasks are due BEFORE startDate', () => {
  const eng = makeEngine();
  const emp = makeEmployee();
  const record = eng.startOnboarding({ employee: emp });

  const preBoarding = record.tasks.filter((t) => t.phase === PHASES.PRE_BOARDING);
  assert.ok(preBoarding.length >= 5, 'at least 5 pre-boarding tasks');
  for (const t of preBoarding) {
    assert.ok(new Date(t.dueAt) < new Date(emp.startDate), `${t.id} due before start date`);
  }
});

test('startOnboarding — day 1 includes Israeli mandatory forms', () => {
  const eng = makeEngine();
  const record = eng.startOnboarding({ employee: makeEmployee() });
  const day1 = record.tasks.filter((t) => t.phase === PHASES.DAY_1).map((t) => t.id);

  assert.ok(day1.includes('form_101'), 'טופס 101 on day 1');
  assert.ok(day1.includes('employment_contract'), 'חוזה עבודה on day 1');
  assert.ok(day1.includes('form_shpar'), 'טופס השפ"ר on day 1');
  assert.ok(day1.includes('bl_report'), 'דוח קבלת עובד לביטוח לאומי on day 1');
});

test('startOnboarding — week 1 includes safety training & systems access', () => {
  const eng = makeEngine();
  const record = eng.startOnboarding({ employee: makeEmployee() });
  const week1 = record.tasks.filter((t) => t.phase === PHASES.WEEK_1).map((t) => t.id);
  assert.ok(week1.includes('safety_training'));
  assert.ok(week1.includes('systems_access'));
  assert.ok(week1.includes('team_intro'));
});

test('startOnboarding — month 3 probation review present', () => {
  const eng = makeEngine();
  const record = eng.startOnboarding({ employee: makeEmployee() });
  const m3 = record.tasks.filter((t) => t.phase === PHASES.MONTH_3).map((t) => t.id);
  assert.ok(m3.includes('probation_review'));
  assert.ok(m3.includes('ongoing_training'));
});

// ──────────────────────────────────────────────────────────────────
// markTaskComplete()
// ──────────────────────────────────────────────────────────────────

test('markTaskComplete — transitions and preserves history', () => {
  const eng = makeEngine();
  const rec = eng.startOnboarding({ employee: makeEmployee() });

  const task = eng.markTaskComplete(rec.id, 'welcome_email', 'moshe_levy', 'Sent via Outlook', 'email-ref-123');
  assert.equal(task.status, TASK_STATUS.DONE);
  assert.equal(task.completedBy, 'moshe_levy');
  assert.equal(task.notes, 'Sent via Outlook');
  assert.equal(task.evidence, 'email-ref-123');
  assert.equal(task.history.length, 1);
  assert.equal(task.history[0].from, TASK_STATUS.PENDING);
  assert.equal(task.history[0].to, TASK_STATUS.DONE);
});

test('markTaskComplete — completes the whole onboarding when all mandatory tasks done', () => {
  const eng = makeEngine();
  const rec = eng.startOnboarding({ employee: makeEmployee() });

  for (const t of rec.tasks) {
    if (t.mandatory) eng.markTaskComplete(rec.id, t.id, 'auto', 'test');
  }
  const after = eng.getOnboarding(rec.id);
  assert.equal(after.status, ONBOARDING_STATUS.COMPLETED);
});

test('markTaskComplete — throws for unknown IDs', () => {
  const eng = makeEngine();
  const rec = eng.startOnboarding({ employee: makeEmployee() });
  assert.throws(() => eng.markTaskComplete('bad_id', 'welcome_email', 'x'), /not found/);
  assert.throws(() => eng.markTaskComplete(rec.id, 'does_not_exist', 'x'), /Task not found/);
});

// ──────────────────────────────────────────────────────────────────
// Form 101
// ──────────────────────────────────────────────────────────────────

test('generate101 — full field coverage matches FORM_101_FIELDS', () => {
  const eng = makeEngine();
  const emp = makeEmployee({ gender: 'female', childrenUnder18: 3 });
  const form = eng.generate101({ employee: emp });

  assert.equal(form.formCode, '101');
  assert.ok(form.formHeName.includes('101'));
  assert.equal(form.fields.length, FORM_101_FIELDS.length);

  // Every field has a `values` entry (null or filled)
  for (const field of FORM_101_FIELDS) {
    assert.ok(field.key in form.values, `missing value slot for ${field.key}`);
  }
});

test('generate101 — pre-fills employee identity fields', () => {
  const eng = makeEngine();
  const form = eng.generate101({ employee: makeEmployee() });
  assert.equal(form.values.full_name, 'דני כהן');
  assert.equal(form.values.tz, VALID_TZ);
  assert.equal(form.values.email, 'dani@techno-kol.co.il');
  assert.equal(form.values.phone, '050-1234567');
});

test('generate101 — tzValid flag reflects Luhn check', () => {
  const eng = makeEngine();
  const ok = eng.generate101({ employee: makeEmployee() });
  assert.equal(ok.tzValid, true);

  const bad = eng.generate101({ employee: makeEmployee({ id: '123456789' }) });
  assert.equal(bad.tzValid, false);
});

test('generate101 — credit points computed', () => {
  const eng = makeEngine();
  const form = eng.generate101({
    employee: makeEmployee({
      gender: 'female', maritalStatus: 'married', spouseWorks: false, childrenUnder18: 2,
    }),
  });
  // 2.75 + 1 + (2*0.5) = 4.75
  assert.equal(form.values.credit_points_claimed, 4.75);
});

test('generate101 — missing required fields reported', () => {
  const eng = makeEngine();
  const form = eng.generate101({
    employee: makeEmployee({ maritalStatus: null, childrenCount: null }),
  });
  assert.ok(form.missing.includes('marital_status'));
  assert.ok(form.missing.includes('children_count'));
  assert.equal(form.isComplete, false);
});

test('generate101 — covers the four required sections (A,B,C,D)', () => {
  const sections = new Set(FORM_101_FIELDS.map((f) => f.section));
  assert.ok(sections.has('A'));
  assert.ok(sections.has('B'));
  assert.ok(sections.has('C'));
  assert.ok(sections.has('D'));
  assert.ok(sections.has('E'));
});

// ──────────────────────────────────────────────────────────────────
// equipmentChecklist() — role-based
// ──────────────────────────────────────────────────────────────────

test('equipmentChecklist — office worker default', () => {
  const eng = makeEngine();
  const list = eng.equipmentChecklist({ role: 'office_worker' });
  const ids = list.map((i) => i.id);
  assert.ok(ids.includes('laptop'));
  assert.ok(ids.includes('keyboard'));
  assert.ok(ids.includes('access_card'));
});

test('equipmentChecklist — factory worker gets uniform & time clock card', () => {
  const eng = makeEngine();
  const list = eng.equipmentChecklist({ role: 'factory_worker' });
  const ids = list.map((i) => i.id);
  assert.ok(ids.includes('uniform'));
  assert.ok(ids.includes('safety_shoes'));
  assert.ok(ids.includes('time_clock_card'));
  assert.ok(ids.includes('helmet'));
  assert.ok(ids.includes('vest'));
});

test('equipmentChecklist — metal fab gets full PPE bundle', () => {
  const eng = makeEngine();
  const list = eng.equipmentChecklist({ role: 'metal_fab' });
  const ids = list.map((i) => i.id);
  // Core PPE items per תקנות הבטיחות בעבודה
  const required = [
    'welding_helmet', 'welding_gloves', 'apron', 'goggles',
    'respirator', 'ear_protection', 'cut_resistant_gloves',
    'safety_shoes', 'uniform',
  ];
  for (const item of required) {
    assert.ok(ids.includes(item), `metal_fab missing PPE item ${item}`);
  }
  // Every metal_fab PPE item must be mandatory
  for (const item of list) {
    assert.equal(item.mandatory, true, `metal_fab ${item.id} must be mandatory PPE`);
  }
});

test('equipmentChecklist — unknown role falls back to office_worker', () => {
  const eng = makeEngine();
  const listA = eng.equipmentChecklist({ role: 'marketing' });
  const listB = eng.equipmentChecklist({ role: 'office_worker' });
  assert.equal(listA.length, listB.length);
});

test('equipmentChecklist — bilingual labels present on every item', () => {
  for (const [role, items] of Object.entries(ROLE_EQUIPMENT)) {
    for (const item of items) {
      assert.ok(item.he, `${role}.${item.id} missing he`);
      assert.ok(item.en, `${role}.${item.id} missing en`);
    }
  }
});

// ──────────────────────────────────────────────────────────────────
// buddyAssignment()
// ──────────────────────────────────────────────────────────────────

test('buddyAssignment — returns unassigned when pool empty', () => {
  const eng = new OnboardingWorkflow({
    now: () => FIXED_NOW,
    store: createMemoryStore(),
    buddyPool: [],
  });
  const buddy = eng.buddyAssignment('anyone');
  assert.equal(buddy.assigned, false);
  assert.ok(buddy.he);
});

test('buddyAssignment — prefers same-department, highest seniority', () => {
  const eng = makeEngine();
  const rec = eng.startOnboarding({ employee: makeEmployee() });
  assert.equal(rec.buddy.assigned, true);
  // Production dept, 8 years seniority → Yossi Levy
  assert.equal(rec.buddy.id, 'b3');
});

// ──────────────────────────────────────────────────────────────────
// alertBlockers()
// ──────────────────────────────────────────────────────────────────

test('alertBlockers — flags overdue mandatory tasks', () => {
  const eng = makeEngine({
    now: () => new Date('2026-04-11T08:00:00Z'),
  });
  // Start date 3 days ago → pre-boarding tasks are overdue
  const emp = makeEmployee({ startDate: new Date('2026-04-08T00:00:00Z') });
  const rec = eng.startOnboarding({ employee: emp });

  const alert = eng.alertBlockers(rec.id);
  assert.ok(alert.count > 0, 'has blockers');
  assert.ok(['low', 'medium', 'high'].includes(alert.severity));

  const blockerIds = alert.blockers.map((b) => b.taskId);
  assert.ok(blockerIds.includes('prep_desk') || blockerIds.includes('order_equip'));
});

test('alertBlockers — ignores completed tasks', () => {
  const eng = makeEngine({
    now: () => new Date('2026-04-11T08:00:00Z'),
  });
  const emp = makeEmployee({ startDate: new Date('2026-04-08T00:00:00Z') });
  const rec = eng.startOnboarding({ employee: emp });

  // Complete every pre-boarding mandatory task
  for (const t of rec.tasks) {
    if (t.phase === PHASES.PRE_BOARDING && t.mandatory) {
      eng.markTaskComplete(rec.id, t.id, 'mgr');
    }
  }
  const alert = eng.alertBlockers(rec.id);
  const preBoardingBlockers = alert.blockers.filter((b) => b.phase === PHASES.PRE_BOARDING);
  assert.equal(preBoardingBlockers.length, 0);
});

test('alertBlockers — empty list when nothing overdue', () => {
  const eng = makeEngine(); // FIXED_NOW = 2026-04-11, start = 2026-04-20
  const rec = eng.startOnboarding({ employee: makeEmployee() });
  const alert = eng.alertBlockers(rec.id);
  assert.equal(alert.count, 0);
  assert.equal(alert.severity, 'none');
});

test('alertBlockers — transitions task status to OVERDUE (not deleted)', () => {
  const eng = makeEngine();
  const emp = makeEmployee({ startDate: new Date('2026-04-01T00:00:00Z') });
  const rec = eng.startOnboarding({ employee: emp });

  eng.alertBlockers(rec.id);
  const after = eng.getOnboarding(rec.id);
  const overdue = after.tasks.filter((t) => t.status === TASK_STATUS.OVERDUE);
  assert.ok(overdue.length > 0);

  // History entries appended — original data preserved
  for (const t of overdue) {
    assert.ok(t.history.length >= 1);
    assert.equal(t.history[0].to, TASK_STATUS.OVERDUE);
  }
});

// ──────────────────────────────────────────────────────────────────
// Never-delete rule
// ──────────────────────────────────────────────────────────────────

test('store has no delete method — לא מוחקים', () => {
  const store = createMemoryStore();
  assert.equal(typeof store.delete, 'undefined');
  assert.equal(typeof store.remove, 'undefined');
  assert.equal(typeof store.clear,  'undefined');
});

test('task history is append-only through multiple transitions', () => {
  const eng = makeEngine();
  const emp = makeEmployee({ startDate: new Date('2026-04-01T00:00:00Z') });
  const rec = eng.startOnboarding({ employee: emp });

  eng.alertBlockers(rec.id);
  const beforeCount = eng.getOnboarding(rec.id).tasks.find((t) => t.id === 'prep_desk').history.length;

  eng.markTaskComplete(rec.id, 'prep_desk', 'mgr', 'done late');
  const after = eng.getOnboarding(rec.id).tasks.find((t) => t.id === 'prep_desk');
  assert.ok(after.history.length > beforeCount);
  // Both entries preserved
  assert.ok(after.history.some((h) => h.to === TASK_STATUS.OVERDUE));
  assert.ok(after.history.some((h) => h.to === TASK_STATUS.DONE));
});

// ──────────────────────────────────────────────────────────────────
// Bilingual coverage
// ──────────────────────────────────────────────────────────────────

test('every task template has bilingual label', () => {
  const eng = makeEngine();
  const rec = eng.startOnboarding({ employee: makeEmployee() });
  for (const t of rec.tasks) {
    assert.ok(t.label && t.label.he, `${t.id} missing Hebrew label`);
    assert.ok(t.label && t.label.en, `${t.id} missing English label`);
  }
});

test('every Form 101 field has bilingual labels and valid type', () => {
  const VALID_TYPES = ['string', 'id', 'date', 'enum', 'int', 'decimal', 'bool', 'address', 'array'];
  for (const field of FORM_101_FIELDS) {
    assert.ok(field.he, `${field.key} missing he`);
    assert.ok(field.en, `${field.key} missing en`);
    assert.ok(VALID_TYPES.includes(field.type), `${field.key} invalid type ${field.type}`);
    assert.ok(['A', 'B', 'C', 'D', 'E'].includes(field.section));
  }
});
