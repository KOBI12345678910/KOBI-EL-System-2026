/**
 * Tests — Employee Offboarding Workflow Engine
 * Agent Y-064 • Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency — uses only node:assert and node:test.
 * Covers: reason validation, notice-period bands, shimua ≥3 business days,
 * asset state machine, exit-interview bilingual, status progression,
 * final payroll, severance/Form-161 emit-only bridge, append-only log,
 * never-delete rule.
 *
 * Run: node --test test/hr/offboarding.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Offboarding,
  REASONS,
  REASON_CODES,
  STATUS,
  STATUS_ORDER,
  ASSET_TYPES,
  ASSET_STATUS,
  DEFAULT_SYSTEMS,
  LETTER_TYPES,
  RECOMMENDATION_TYPES,
  EXIT_INTERVIEW_TEMPLATE,
  LABELS,
  isBusinessDay,
  addBusinessDays,
  computeNoticePeriodDays,
} = require('../../src/hr/offboarding.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

// Fixed clock — Saturday 2026-04-11 08:00 UTC.
// 2026-04-11 = Saturday in Israel; pick a Sunday for "today" so the
// shimua tests can lean on a normal business-day baseline.
const FIXED_NOW = new Date('2026-04-12T08:00:00.000Z'); // Sunday

function makeEngine(opts = {}) {
  return new Offboarding({
    now: () => new Date(FIXED_NOW),
    store: new Map(),
    ...opts,
  });
}

function makeEmployee(overrides = {}) {
  return {
    id: 'EMP-001',
    name: 'דני כהן',
    position: 'Welder',
    department: 'Production',
    startDate: new Date('2024-01-01T00:00:00Z'),  // ~27 months at FIXED_NOW
    monthlySalary: 12000,
    unusedVacationDays: 10,
    ...overrides,
  };
}

function makeOpenCase(eng, overrides = {}, employee) {
  const emp = employee || makeEmployee();
  return eng.initiateOffboarding({
    employeeId: emp.id,
    reason: 'dismissal',
    lastDay: new Date('2026-05-30T00:00:00Z'),
    initiatedBy: 'hr_admin',
    employee: emp,
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────
// 1. INITIATE
// ──────────────────────────────────────────────────────────────────

test('initiateOffboarding — happy path creates record at INITIATED', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);

  assert.ok(rec.id.startsWith('off_'));
  assert.equal(rec.status, STATUS.INITIATED);
  assert.equal(rec.reason, 'dismissal');
  assert.equal(rec.employeeId, 'EMP-001');
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0].type, 'created');
  assert.equal(rec.events[0].labelHe, LABELS.EVENT_CREATED.he);
});

test('initiateOffboarding — validates required fields and reason enum', () => {
  const eng = makeEngine();
  assert.throws(() => eng.initiateOffboarding({}), /employeeId/);
  assert.throws(
    () => eng.initiateOffboarding({ employeeId: 'x' }),
    /reason/,
  );
  assert.throws(
    () => eng.initiateOffboarding({ employeeId: 'x', reason: 'banana' }),
    /Unknown reason/,
  );
  assert.throws(
    () => eng.initiateOffboarding({ employeeId: 'x', reason: 'voluntary' }),
    /lastDay/,
  );
  assert.throws(
    () => eng.initiateOffboarding({
      employeeId: 'x', reason: 'voluntary', lastDay: new Date(),
    }),
    /initiatedBy/,
  );
});

test('initiateOffboarding — accepts every documented reason', () => {
  const expected = [
    'voluntary', 'dismissal', 'retirement', 'end_of_contract',
    'death', 'layoff', 'relocation',
  ];
  for (const r of expected) {
    assert.ok(REASON_CODES.includes(r), 'reason ' + r + ' missing');
    const eng = makeEngine();
    const rec = eng.initiateOffboarding({
      employeeId: 'E', reason: r, lastDay: new Date('2026-06-01'), initiatedBy: 'hr',
    });
    assert.equal(rec.reason, r);
    assert.ok(rec.reasonMeta.he, 'reason ' + r + ' missing he');
    assert.ok(rec.reasonMeta.en, 'reason ' + r + ' missing en');
  }
});

// ──────────────────────────────────────────────────────────────────
// 2. NOTICE PERIOD — three statutory bands
// ──────────────────────────────────────────────────────────────────

test('computeNoticePeriod — under 6 months: 1 day per full month worked', () => {
  // 3 full months → 3 days
  const emp = {
    startDate: new Date('2026-01-01T00:00:00Z'),
    terminationDate: new Date('2026-04-15T00:00:00Z'),
  };
  const result = computeNoticePeriodDays(emp, 'dismissal');
  assert.equal(result.band, 'under_six');
  assert.equal(result.monthsWorked, 3);
  assert.equal(result.days, 3);
  assert.match(result.statute, /הודעה מוקדמת/);
});

test('computeNoticePeriod — 6 to 12 months: 6 days + 2.5 per month after 6th', () => {
  // 9 full months → 6 + ceil(3*2.5) = 6 + 8 = 14
  const emp = {
    startDate: new Date('2025-07-01T00:00:00Z'),
    terminationDate: new Date('2026-04-12T00:00:00Z'),
  };
  const result = computeNoticePeriodDays(emp, 'dismissal');
  assert.equal(result.band, 'six_to_twelve');
  assert.equal(result.monthsWorked, 9);
  assert.equal(result.days, 14);

  // Edge: exactly 6 months → 6 days, no extra
  const emp6 = {
    startDate: new Date('2025-10-12T00:00:00Z'),
    terminationDate: new Date('2026-04-12T00:00:00Z'),
  };
  const r6 = computeNoticePeriodDays(emp6, 'dismissal');
  assert.equal(r6.monthsWorked, 6);
  assert.equal(r6.days, 6);
});

test('computeNoticePeriod — year+: full month (30 days)', () => {
  const emp = {
    startDate: new Date('2024-01-01T00:00:00Z'),
    terminationDate: new Date('2026-04-12T00:00:00Z'),
  };
  const result = computeNoticePeriodDays(emp, 'dismissal');
  assert.equal(result.band, 'year_plus');
  assert.ok(result.monthsWorked >= 12);
  assert.equal(result.days, 30);
});

test('computeNoticePeriod — death suspends notice obligation', () => {
  const result = computeNoticePeriodDays(makeEmployee(), 'death');
  assert.equal(result.days, 0);
  assert.equal(result.band, 'death');
});

test('serveNotice — transitions INITIATED → NOTICE_SERVED and stores result', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  const notice = eng.serveNotice(rec.id);
  assert.equal(notice.days, 30); // 27 months tenure
  assert.equal(notice.band, 'year_plus');
  assert.ok(notice.noticeEnd);
  const after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.NOTICE_SERVED);
  assert.ok(after.events.some((e) => e.type === 'transition' && e.data.to === STATUS.NOTICE_SERVED));
});

// ──────────────────────────────────────────────────────────────────
// 3. SHIMUA letter — minimum 3 business days
// ──────────────────────────────────────────────────────────────────

test('generateShimuaLetter — bilingual + hearing date ≥ 3 business days', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  const letter = eng.generateShimuaLetter(rec.id, {
    allegations: ['התנהגות פוגענית', 'היעדרויות חוזרות'],
  });

  // Bilingual structure
  assert.ok(letter.he && letter.en);
  assert.match(letter.he.title, /שימוע/);
  assert.match(letter.en.title, /Shimua|Pre-Dismissal/);
  assert.equal(letter.type, LETTER_TYPES.SHIMUA);

  // Issued on a Sunday (FIXED_NOW), so +3 business days = Wednesday
  const issued = new Date(letter.issuedAt);
  const hearing = new Date(letter.hearingDate);
  const diffMs = hearing.getTime() - issued.getTime();
  const diffDays = diffMs / 86_400_000;
  assert.ok(diffDays >= 3, 'gap should be at least 3 calendar days, got ' + diffDays);

  // Hearing date itself must fall on a business day (Sun-Thu)
  assert.ok(isBusinessDay(hearing), 'hearing must land on a business day');

  // The gap in business days must be exactly 3 (or more if weekend straddled)
  let businessDaysBetween = 0;
  for (let d = new Date(issued.getTime() + 86_400_000); d <= hearing; d = new Date(d.getTime() + 86_400_000)) {
    if (isBusinessDay(d)) businessDaysBetween++;
  }
  assert.ok(businessDaysBetween >= 3, 'must be at least 3 business days, got ' + businessDaysBetween);

  // Allegations and witness rights present
  assert.deepEqual(letter.he.allegations, ['התנהגות פוגענית', 'היעדרויות חוזרות']);
  assert.deepEqual(letter.en.allegations, ['התנהגות פוגענית', 'היעדרויות חוזרות']);
  assert.ok(letter.witnessRights.he);
  assert.ok(letter.witnessRights.en);
});

test('generateShimuaLetter — straddling weekend still ≥ 3 business days', () => {
  // Issue on Wednesday → +3 business days lands on Monday (skips Fri+Sat)
  const wed = new Date('2026-04-15T08:00:00Z'); // Wednesday
  const eng = makeEngine({ now: () => new Date(wed) });
  const rec = makeOpenCase(eng);
  const letter = eng.generateShimuaLetter(rec.id);

  const hearing = new Date(letter.hearingDate);
  // Should be Monday Apr 20 (skipping Fri 17 & Sat 18)
  assert.equal(hearing.getDay(), 1, 'should land on Monday (Sun=0, Mon=1)');
  assert.ok(isBusinessDay(hearing));
});

test('generateShimuaLetter — appends event to log', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.generateShimuaLetter(rec.id);
  const evts = eng.history(rec.id);
  assert.ok(evts.some((e) => e.type === 'shimua_generated'));
  assert.ok(evts.some((e) => e.labelHe === LABELS.EVENT_SHIMUA.he));
});

// ──────────────────────────────────────────────────────────────────
// 4. ASSET COLLECTION
// ──────────────────────────────────────────────────────────────────

test('collectAssets — tracks returned/missing/damaged states', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);

  const summary = eng.collectAssets(rec.id, [
    { type: 'laptop',     serialNumber: 'LP-001', status: 'returned' },
    { type: 'phone',      serialNumber: 'PH-001', status: 'damaged'  },
    { type: 'access_card',serialNumber: 'AC-001', status: 'missing'  },
    { type: 'uniform',    serialNumber: 'UN-001', status: 'returned' },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.returned, 2);
  assert.equal(summary.damaged,  1);
  assert.equal(summary.missing,  1);

  // Each asset has bilingual label and history
  for (const a of summary.assets) {
    assert.ok(a.labelHe && a.labelEn, 'asset missing bilingual labels');
    assert.equal(a.history.length, 1);
  }

  // Workflow auto-advanced because all assets reached final states
  const after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.ASSETS_COLLECTED);
});

test('collectAssets — pending assets do NOT advance workflow', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);

  eng.collectAssets(rec.id, [
    { type: 'laptop', serialNumber: 'L1', status: 'pending' },
  ]);

  const after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.NOTICE_SERVED);
});

test('collectAssets — rejects unknown type or status', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);

  assert.throws(
    () => eng.collectAssets(rec.id, [{ type: 'spaceship', status: 'returned' }]),
    /Unknown asset type/,
  );
  assert.throws(
    () => eng.collectAssets(rec.id, [{ type: 'laptop', status: 'levitating' }]),
    /Invalid asset status/,
  );
  assert.throws(() => eng.collectAssets(rec.id, 'not-an-array'), /array/);
});

// ──────────────────────────────────────────────────────────────────
// 5. ACCESS REVOCATION
// ──────────────────────────────────────────────────────────────────

test('revokeAccess — logs requests, emits bus event, can be confirmed', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  const created = eng.revokeAccess(rec.id, ['email', 'vpn', 'github']);

  assert.equal(created.length, 3);
  for (const c of created) {
    assert.equal(c.status, 'requested');
    assert.ok(c.labelHe && c.labelEn);
  }

  // Bus events emitted
  const emitted = eng.events.filter((e) => e.name === 'access:revoke');
  assert.equal(emitted.length, 3);

  // Confirm one
  const confirmed = eng.confirmRevocation(rec.id, 'email', 'it_admin');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmedBy, 'it_admin');
  // History preserved (append-only)
  assert.equal(confirmed.history.length, 2);
  assert.equal(confirmed.history[0].to, 'requested');
  assert.equal(confirmed.history[1].to, 'confirmed');
});

// ──────────────────────────────────────────────────────────────────
// 6. EXIT INTERVIEW — bilingual template
// ──────────────────────────────────────────────────────────────────

test('conductExitInterview — bilingual template stored with answers', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);
  eng.collectAssets(rec.id, [
    { type: 'laptop', serialNumber: 'L1', status: 'returned' },
  ]);

  const interview = eng.conductExitInterview({
    offboardingId: rec.id,
    answers: {
      reason_open: 'הזדמנות חדשה',
      satisfaction_role: '4 מתוך 5',
      culture_feedback: 'תרבות חיובית',
    },
    reviewerId: 'hr_partner',
  });

  // Every template question is in the result
  assert.equal(interview.entries.length, EXIT_INTERVIEW_TEMPLATE.questions.length);
  for (const e of interview.entries) {
    assert.ok(e.he && e.en, 'entry missing bilingual labels');
  }

  // Answered ones carry the value
  const reasonEntry = interview.entries.find((e) => e.key === 'reason_open');
  assert.equal(reasonEntry.answer, 'הזדמנות חדשה');

  // Workflow advanced
  const after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.EXIT_INTERVIEW);
});

test('conductExitInterview — validates required arguments', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  assert.throws(() => eng.conductExitInterview({}), /offboardingId/);
  assert.throws(
    () => eng.conductExitInterview({ offboardingId: rec.id }),
    /answers/,
  );
  assert.throws(
    () => eng.conductExitInterview({ offboardingId: rec.id, answers: {} }),
    /reviewerId/,
  );
});

// ──────────────────────────────────────────────────────────────────
// 7. STATUS PROGRESSION enforcement
// ──────────────────────────────────────────────────────────────────

test('status progression — must follow strict order', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);

  // Cannot finalPayroll without going through prior states
  // The method itself only advances via the status transition guard.
  // Direct attempt to skip to COMPLETED should throw.
  assert.throws(
    () => eng.complete(rec.id, 'hr'),
    /must be at status final_payroll/,
  );

  // Walk through correctly
  eng.serveNotice(rec.id);
  eng.collectAssets(rec.id, [{ type: 'laptop', serialNumber: 'L1', status: 'returned' }]);
  eng.conductExitInterview({
    offboardingId: rec.id,
    answers: { reason_open: 'x' },
    reviewerId: 'hr',
  });
  eng.finalPayroll(rec.id);
  const completed = eng.complete(rec.id, 'hr');
  assert.equal(completed.status, STATUS.COMPLETED);

  // Strict order should be reflected in the events log
  const transitions = eng.history(rec.id)
    .filter((e) => e.type === 'transition')
    .map((e) => e.data.to);
  assert.deepEqual(transitions, [
    STATUS.NOTICE_SERVED,
    STATUS.ASSETS_COLLECTED,
    STATUS.EXIT_INTERVIEW,
    STATUS.FINAL_PAYROLL,
    STATUS.COMPLETED,
  ]);
});

test('status progression — pause / resume preserves prior state', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);
  eng.pause(rec.id, 'hr', 'awaiting legal review');
  let after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.ON_HOLD);
  assert.equal(after.previousStatus, STATUS.NOTICE_SERVED);

  eng.resume(rec.id, 'hr');
  after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.NOTICE_SERVED);

  // Both events present
  const types = eng.history(rec.id).map((e) => e.type);
  assert.ok(types.includes('paused'));
  assert.ok(types.includes('resumed'));
});

// ──────────────────────────────────────────────────────────────────
// 8. FINAL PAYROLL
// ──────────────────────────────────────────────────────────────────

test('finalPayroll — computes vacation, salary, severance placeholder', () => {
  const eng = makeEngine();
  const emp = makeEmployee({
    monthlySalary: 12500,
    unusedVacationDays: 12,
  });
  const rec = makeOpenCase(eng, {}, emp);
  eng.serveNotice(rec.id);
  eng.collectAssets(rec.id, [{ type: 'laptop', serialNumber: 'L1', status: 'returned' }]);
  eng.conductExitInterview({ offboardingId: rec.id, answers: { reason_open: 'x' }, reviewerId: 'hr' });

  const payroll = eng.finalPayroll(rec.id);

  // Daily rate = 12500/25 = 500; vacation pay-out = 12 * 500 = 6000
  const vac = payroll.lineItems.find((l) => l.code === 'unused_vacation');
  assert.equal(vac.amount, 6000);
  assert.equal(vac.days, 12);
  assert.equal(vac.dailyRate, 500);
  assert.match(vac.legal, /חופשה שנתית/);

  const sal = payroll.lineItems.find((l) => l.code === 'final_salary');
  assert.equal(sal.amount, 12500);

  const sev = payroll.lineItems.find((l) => l.code === 'severance_owed');
  assert.equal(sev.amount, null);
  assert.equal(sev.bridgeAgent, 'Y-015');

  // Total known excludes the null severance
  assert.equal(payroll.totalKnown, 18500);
  assert.equal(payroll.pilotFlag, false);
  assert.deepEqual(payroll.pendingFromBridge, ['severance_owed']);

  // Workflow advanced
  const after = eng.getOffboarding(rec.id);
  assert.equal(after.status, STATUS.FINAL_PAYROLL);
});

test('finalPayroll — pilot flag surfaces for pilot role', () => {
  const eng = makeEngine();
  const emp = makeEmployee({ position: 'Pilot', monthlySalary: 30000, unusedVacationDays: 5 });
  const rec = makeOpenCase(eng, {}, emp);

  const payroll = eng.finalPayroll(rec.id, { pilot: true, severanceAmount: 100000 });
  assert.equal(payroll.pilotFlag, true);
  assert.ok(payroll.lineItems.some((l) => l.code === 'pilot_flag'));

  // Severance now provided via override → totalKnown includes it
  const sev = payroll.lineItems.find((l) => l.code === 'severance_owed');
  assert.equal(sev.amount, 100000);
});

// ──────────────────────────────────────────────────────────────────
// 9. SEVERANCE / FORM 161 — emit-only bridge
// ──────────────────────────────────────────────────────────────────

test('computeSeverance + generateForm161 — emit events without importing Y-015', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.serveNotice(rec.id);

  const emp = makeEmployee();
  const sev = eng.computeSeverance(emp, 'dismissal');
  assert.equal(sev.bridgeAgent, 'Y-015');
  assert.equal(sev.bridgeEvent, 'severance:compute');

  const sevEvts = eng.events.filter((e) => e.name === 'severance:compute');
  assert.equal(sevEvts.length, 1);
  assert.equal(sevEvts[0].payload.reason, 'dismissal');

  // Form 161
  const form = eng.generateForm161(rec.id);
  assert.equal(form.bridgeAgent, 'Y-015');
  assert.equal(form.bridgeEvent, 'form161:request');
  assert.match(form.formVersion, /161/);
  const formEvts = eng.events.filter((e) => e.name === 'form161:request');
  assert.equal(formEvts.length, 1);
  assert.equal(formEvts[0].payload.offboardingId, rec.id);
});

// ──────────────────────────────────────────────────────────────────
// 10. APPROVAL & RECOMMENDATION letters
// ──────────────────────────────────────────────────────────────────

test('generateApprovalLetter — bilingual + cites חוק הודעה לעובד', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  const letter = eng.generateApprovalLetter(rec.id);
  assert.equal(letter.type, LETTER_TYPES.APPROVAL);
  assert.match(letter.he.title, /אישור העסקה/);
  assert.match(letter.en.title, /Employment Confirmation/);
  assert.match(letter.he.legal, /הודעה לעובד/);
  assert.match(letter.en.legal, /Notice to Employee/);
});

test('generateRecommendationLetter — discretionary, three tones supported', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);

  for (const tone of ['warm', 'neutral', 'formal']) {
    const letter = eng.generateRecommendationLetter(rec.id, {
      type: tone,
      highlights: ['עבודה מצוינת בצוות', 'יוזמה'],
    });
    assert.equal(letter.tone, tone);
    assert.equal(letter.type, LETTER_TYPES.RECOMMENDATION);
    assert.match(letter.he.title, new RegExp(RECOMMENDATION_TYPES[tone].he));
    assert.match(letter.en.title, new RegExp(RECOMMENDATION_TYPES[tone].en));
    assert.match(letter.he.disclaimer, /חובה חוקית/);
  }
  assert.throws(
    () => eng.generateRecommendationLetter(rec.id, { type: 'sarcastic' }),
    /Unknown recommendation type/,
  );
});

// ──────────────────────────────────────────────────────────────────
// 11. APPEND-ONLY HISTORY / never-delete rule
// ──────────────────────────────────────────────────────────────────

test('history — append-only and frozen against mutation', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  eng.generateShimuaLetter(rec.id);
  eng.serveNotice(rec.id);

  const log = eng.history(rec.id);
  assert.ok(Object.isFrozen(log));
  // Each entry is frozen too
  for (const e of log) {
    assert.ok(Object.isFrozen(e));
    assert.throws(() => { e.type = 'tampered'; }, /TypeError|Cannot assign/);
  }

  // Initial create + shimua + notice transition + notice_computed
  const types = log.map((e) => e.type);
  assert.ok(types.includes('created'));
  assert.ok(types.includes('shimua_generated'));
  assert.ok(types.includes('notice_computed'));
  assert.ok(types.includes('transition'));
});

test('store has no delete method — לא מוחקים רק משדרגים ומגדלים', () => {
  const eng = makeEngine();
  const rec = makeOpenCase(eng);
  // The Map IS used as the store; we audit the engine surface for dangerous methods.
  for (const method of ['deleteOffboarding', 'remove', 'destroy', 'purge']) {
    assert.equal(typeof eng[method], 'undefined', 'engine must not expose ' + method);
  }
  // Even pause does not remove the record from the store
  eng.pause(rec.id, 'hr', 'review');
  assert.ok(eng.getOffboarding(rec.id));
  // List still contains it
  assert.equal(eng.list().length, 1);
});

// ──────────────────────────────────────────────────────────────────
// 12. BUSINESS-DAY HELPERS
// ──────────────────────────────────────────────────────────────────

test('isBusinessDay — Sun-Thu true, Fri-Sat false', () => {
  // 2026-04-12 = Sunday → true
  assert.equal(isBusinessDay(new Date('2026-04-12T08:00:00Z')), true);
  // 2026-04-16 = Thursday → true
  assert.equal(isBusinessDay(new Date('2026-04-16T08:00:00Z')), true);
  // 2026-04-17 = Friday → false
  assert.equal(isBusinessDay(new Date('2026-04-17T08:00:00Z')), false);
  // 2026-04-18 = Saturday → false
  assert.equal(isBusinessDay(new Date('2026-04-18T08:00:00Z')), false);
});

test('addBusinessDays — skips Friday and Saturday', () => {
  // From Wed 2026-04-15, +3 business days → Mon 2026-04-20
  const start = new Date('2026-04-15T08:00:00Z'); // Wed
  const result = addBusinessDays(start, 3);
  // Day-of-week: Mon = 1
  assert.equal(result.getDay(), 1);
});

// ──────────────────────────────────────────────────────────────────
// 13. BILINGUAL coverage smoke-test
// ──────────────────────────────────────────────────────────────────

test('every reason, asset type, system, label has bilingual pair', () => {
  for (const code of REASON_CODES) {
    assert.ok(REASONS[code].he, 'reason ' + code + ' missing he');
    assert.ok(REASONS[code].en, 'reason ' + code + ' missing en');
  }
  for (const code of Object.keys(ASSET_TYPES)) {
    assert.ok(ASSET_TYPES[code].he, 'asset ' + code + ' missing he');
    assert.ok(ASSET_TYPES[code].en, 'asset ' + code + ' missing en');
  }
  for (const sys of DEFAULT_SYSTEMS) {
    assert.ok(sys.he && sys.en, 'system ' + sys.id + ' missing labels');
  }
  for (const q of EXIT_INTERVIEW_TEMPLATE.questions) {
    assert.ok(q.he && q.en, 'question ' + q.key + ' missing labels');
  }
  // Status order is exhaustive
  assert.equal(STATUS_ORDER.length, 6);
  assert.equal(STATUS_ORDER[0], STATUS.INITIATED);
  assert.equal(STATUS_ORDER[STATUS_ORDER.length - 1], STATUS.COMPLETED);
});
