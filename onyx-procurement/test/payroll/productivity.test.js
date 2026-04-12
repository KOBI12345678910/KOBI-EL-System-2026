/**
 * Productivity Analytics — Unit Tests
 * Agent X-10 — Swarm 3 — 2026-04-11
 *
 * Run with:    node --test test/payroll/productivity.test.js
 *
 * Covers:
 *   1.  jobsPerShift — happy path
 *   2.  defectRate & reworkRate
 *   3.  throughputVsStandard with custom standards
 *   4.  overtimeTrends — weekly slope
 *   5.  absencePatterns — protected reasons excluded
 *   6.  trainingCompletion
 *   7.  taskCycleTime — mean + median
 *   8.  revenuePerEmployee (sales role)
 *   9.  customerSatisfaction — refuses when n < 3
 *   10. computeProductivity — full employee profile
 *   11. computeProductivity — opted-out employee returns empty
 *   12. computeProductivity — refuses narrow window (<6h)
 *   13. teamDashboard — k-anonymity enforcement
 *   14. teamDashboard — eligible team aggregates
 *   15. standardTimes — default + custom lookup
 *   16. identifyBottlenecks — slow step detection
 *   17. suggestTraining — maps metrics to advisory suggestions
 *   18. Refused anti-patterns throw
 *   19. Privacy notice present in every individual response
 *   20. Peer benchmark returns percentiles, never peer names
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'analytics', 'productivity.js'
));

const {
  computeProductivity,
  teamDashboard,
  standardTimes,
  identifyBottlenecks,
  suggestTraining,
  jobsPerShift,
  defectRate,
  reworkRate,
  throughputVsStandard,
  overtimeTrends,
  absencePatterns,
  trainingCompletion,
  taskCycleTime,
  revenuePerEmployee,
  customerSatisfaction,
  DEFAULT_STANDARD_TIMES,
  K_ANONYMITY_MIN,
  PRIVACY_NOTICE_HE,
  attendanceBasedScore,
  peerRanking,
  automaticWarning,
  perSecondTracking,
} = mod;

// ─────────────────────────────────────────────────────────────
// Fixtures / פיקסצ'רים
// ─────────────────────────────────────────────────────────────

function makeWeekPeriod() {
  // One full week — 7 × 24h = 168h, well above MIN_AGG_HOURS.
  return {
    start: new Date('2026-04-01T00:00:00Z'),
    end:   new Date('2026-04-08T00:00:00Z'),
    granularity: 'week',
  };
}

function makePeople(count, overrides = {}) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `emp-${String(i + 1).padStart(3, '0')}`,
      role: overrides.role || 'workshop',
      team_id: overrides.team_id || 'team-alpha',
      opted_out: false,
    });
  }
  return arr;
}

function makeFullContext() {
  const people = makePeople(6);  // ≥ K=5 so team dashboards work
  return {
    people,
    jobs: [
      { employeeId: 'emp-001', type: 'weld-frame', actualMinutes: 80, completed: true, reworked: false, defective: false, date: '2026-04-02' },
      { employeeId: 'emp-001', type: 'weld-frame', actualMinutes: 95, completed: true, reworked: true,  defective: false, date: '2026-04-03' },
      { employeeId: 'emp-001', type: 'cut-steel',  actualMinutes: 40, completed: true, reworked: false, defective: false, date: '2026-04-04' },
      { employeeId: 'emp-001', type: 'cut-steel',  actualMinutes: 50, completed: true, reworked: false, defective: true,  date: '2026-04-05' },
      { employeeId: 'emp-002', type: 'weld-frame', actualMinutes: 70, completed: true, reworked: false, defective: false, date: '2026-04-03' },
      { employeeId: 'emp-002', type: 'cut-steel',  actualMinutes: 35, completed: true, reworked: false, defective: false, date: '2026-04-04' },
      { employeeId: 'emp-003', type: 'weld-frame', actualMinutes: 90, completed: true, reworked: false, defective: false, date: '2026-04-03' },
    ],
    outputs: [
      { employeeId: 'emp-001', defective: false, date: '2026-04-02' },
      { employeeId: 'emp-001', defective: false, date: '2026-04-03' },
      { employeeId: 'emp-001', defective: false, date: '2026-04-04' },
      { employeeId: 'emp-001', defective: true,  date: '2026-04-05' },
    ],
    hours: [
      { employeeId: 'emp-001', shiftId: 'S-01', date: '2026-04-02', regularH: 8, overtimeH: 0 },
      { employeeId: 'emp-001', shiftId: 'S-02', date: '2026-04-03', regularH: 8, overtimeH: 1 },
      { employeeId: 'emp-001', shiftId: 'S-03', date: '2026-04-04', regularH: 8, overtimeH: 2 },
      { employeeId: 'emp-001', shiftId: 'S-04', date: '2026-04-05', regularH: 8, overtimeH: 0 },
      { employeeId: 'emp-002', shiftId: 'S-05', date: '2026-04-03', regularH: 8, overtimeH: 0 },
      { employeeId: 'emp-002', shiftId: 'S-06', date: '2026-04-04', regularH: 8, overtimeH: 0 },
      { employeeId: 'emp-003', shiftId: 'S-07', date: '2026-04-03', regularH: 8, overtimeH: 0 },
    ],
    absences: [
      { employeeId: 'emp-001', date: '2026-04-06', reason: 'sick' },      // protected
      { employeeId: 'emp-001', date: '2026-04-07', reason: 'personal' }, // not protected
    ],
    trainings: [
      { employeeId: 'emp-001', assigned: true, completed: true,  code: 'QA-101' },
      { employeeId: 'emp-001', assigned: true, completed: false, code: 'TOOL-150' },
    ],
    tasks: [
      { employeeId: 'emp-001', startedAt: '2026-04-02T08:00:00Z', completedAt: '2026-04-02T09:20:00Z' },
      { employeeId: 'emp-001', startedAt: '2026-04-03T08:00:00Z', completedAt: '2026-04-03T10:00:00Z' },
      { employeeId: 'emp-001', startedAt: '2026-04-04T08:00:00Z', completedAt: '2026-04-04T08:45:00Z' },
    ],
    deals: [],
    csat: [],
  };
}

// ─────────────────────────────────────────────────────────────
// 1. jobsPerShift
// ─────────────────────────────────────────────────────────────
test('jobsPerShift returns completed-jobs / shifts-worked', () => {
  const jobs = [
    { completed: true },
    { completed: true },
    { completed: true },
    { completed: false }, // not counted
  ];
  assert.equal(jobsPerShift(jobs, 2), 1.5);
  assert.equal(jobsPerShift([], 5), 0);
  assert.equal(jobsPerShift(jobs, 0), 0);          // divide-by-zero guarded
  assert.equal(jobsPerShift(null, 3), 0);          // null safe
});

// ─────────────────────────────────────────────────────────────
// 2. defectRate & reworkRate
// ─────────────────────────────────────────────────────────────
test('defectRate and reworkRate compute correct fractions', () => {
  const outs = [
    { defective: false },
    { defective: true },
    { defective: false },
    { defective: true },
  ];
  assert.equal(defectRate(outs), 0.5);
  assert.equal(defectRate([]), 0);

  const jobs = [
    { reworked: false },
    { reworked: true },
    { reworked: false },
    { reworked: false },
  ];
  assert.equal(reworkRate(jobs), 0.25);
});

// ─────────────────────────────────────────────────────────────
// 3. throughputVsStandard
// ─────────────────────────────────────────────────────────────
test('throughputVsStandard honors custom standards per jobType', () => {
  const jobs = [
    { type: 'weld-frame', actualMinutes: 90 }, // 90/90 = 1.0
    { type: 'weld-frame', actualMinutes: 60 }, // 90/60 = 1.5
    { type: 'cut-steel',  actualMinutes: 45 }, // 45/45 = 1.0
  ];
  const t = throughputVsStandard(jobs, DEFAULT_STANDARD_TIMES);
  // mean(1.0, 1.5, 1.0) = 1.166...
  assert.ok(Math.abs(t - 1.167) < 0.005, `got ${t}`);

  // Custom standards override defaults.
  const t2 = throughputVsStandard(
    [{ type: 'special', actualMinutes: 50 }],
    { special: 100, default: 60 }
  );
  assert.equal(t2, 2);

  // Falls back gracefully with no standards arg.
  const t3 = throughputVsStandard([{ type: 'weld-frame', actualMinutes: 90 }]);
  assert.equal(t3, 1);
});

// ─────────────────────────────────────────────────────────────
// 4. overtimeTrends
// ─────────────────────────────────────────────────────────────
test('overtimeTrends produces weekly buckets and linear slope', () => {
  const weeks = [
    { weekISO: '2026-W01', regularH: 40, overtimeH: 0  }, // 0.0
    { weekISO: '2026-W02', regularH: 40, overtimeH: 10 }, // 0.2
    { weekISO: '2026-W03', regularH: 40, overtimeH: 20 }, // 0.333
  ];
  const trend = overtimeTrends(weeks);
  assert.equal(trend.byWeek.length, 3);
  assert.equal(trend.byWeek[0].rate, 0);
  assert.equal(trend.byWeek[1].rate, 0.2);
  assert.ok(trend.trendSlope > 0, 'slope should be positive');

  // Empty input
  const empty = overtimeTrends([]);
  assert.deepEqual(empty, { byWeek: [], avgRate: 0, trendSlope: 0 });
});

// ─────────────────────────────────────────────────────────────
// 5. absencePatterns — protected reasons excluded
// ─────────────────────────────────────────────────────────────
test('absencePatterns excludes protected reasons from unprotected bucket', () => {
  const result = absencePatterns([
    { reason: 'sick' },
    { reason: 'miluim' },
    { reason: 'personal' },
    { reason: 'personal' },
    { reason: 'vacation' },
    { reason: 'maternity' },
  ]);
  assert.equal(result.protectedDays, 3); // sick + miluim + maternity
  assert.equal(result.unprotected.personal, 2);
  assert.equal(result.unprotected.vacation, 1);
  assert.equal(result.totalDays, 6);
  // Protected reasons must NOT leak into unprotected.
  assert.equal(result.unprotected.sick, undefined);
  assert.equal(result.unprotected.miluim, undefined);
});

// ─────────────────────────────────────────────────────────────
// 6. trainingCompletion
// ─────────────────────────────────────────────────────────────
test('trainingCompletion reports assigned/completed/rate', () => {
  const r = trainingCompletion([
    { assigned: true,  completed: true  },
    { assigned: true,  completed: false },
    { assigned: true,  completed: true  },
    { assigned: false, completed: true  }, // not assigned — ignored
  ]);
  assert.equal(r.assigned, 3);
  assert.equal(r.completed, 2);
  assert.ok(Math.abs(r.completionRate - 0.6667) < 0.001);
});

// ─────────────────────────────────────────────────────────────
// 7. taskCycleTime — mean + median
// ─────────────────────────────────────────────────────────────
test('taskCycleTime computes mean and median duration in minutes', () => {
  const t = taskCycleTime([
    { startedAt: '2026-04-02T08:00:00Z', completedAt: '2026-04-02T08:10:00Z' }, // 10
    { startedAt: '2026-04-02T09:00:00Z', completedAt: '2026-04-02T09:30:00Z' }, // 30
    { startedAt: '2026-04-02T10:00:00Z', completedAt: '2026-04-02T10:50:00Z' }, // 50
  ]);
  assert.equal(t.count, 3);
  assert.equal(t.meanMinutes, 30);
  assert.equal(t.medianMinutes, 30);
});

// ─────────────────────────────────────────────────────────────
// 8. revenuePerEmployee (sales)
// ─────────────────────────────────────────────────────────────
test('revenuePerEmployee sums valid deal amounts', () => {
  const r = revenuePerEmployee([
    { amount: 1000 },
    { amount: 250.5 },
    { amount: 'invalid' }, // ignored
    { amount: 2000 },
  ]);
  assert.equal(r, 3250.5);
  assert.equal(revenuePerEmployee([]), 0);
});

// ─────────────────────────────────────────────────────────────
// 9. customerSatisfaction — guards against low n
// ─────────────────────────────────────────────────────────────
test('customerSatisfaction refuses samples with n<3', () => {
  const low = customerSatisfaction([{ score: 5 }, { score: 4 }]);
  assert.equal(low.mean, null);
  assert.equal(low.reason, 'insufficient_data');

  const ok = customerSatisfaction([
    { score: 5 }, { score: 4 }, { score: 5 }, { score: 3 },
  ]);
  assert.equal(ok.n, 4);
  assert.equal(ok.mean, 4.25);

  // Out-of-range scores are filtered.
  const mixed = customerSatisfaction([
    { score: 5 }, { score: 10 }, { score: 0 }, { score: 3 }, { score: 4 },
  ]);
  assert.equal(mixed.n, 3);
});

// ─────────────────────────────────────────────────────────────
// 10. computeProductivity — full profile
// ─────────────────────────────────────────────────────────────
test('computeProductivity returns metrics + peer_benchmark + trend', () => {
  const ctx = makeFullContext();
  const period = makeWeekPeriod();
  const r = computeProductivity('emp-001', period, ctx);

  assert.equal(r.employeeId, 'emp-001');
  assert.equal(r.role, 'workshop');
  assert.ok(r.metrics, 'metrics should exist');
  assert.ok(_isFiniteNum(r.metrics.jobsPerShift));
  assert.ok(_isFiniteNum(r.metrics.defectRate));
  assert.ok(_isFiniteNum(r.metrics.reworkRate));
  assert.ok(_isFiniteNum(r.metrics.throughputVsStandard));
  assert.ok(r.metrics.overtimeTrends);
  assert.ok(r.metrics.absencePatterns);
  assert.ok(r.metrics.trainingCompletion);
  assert.ok(r.metrics.taskCycleTime);
  // Workshop worker — revenue should be null (sales only).
  assert.equal(r.metrics.revenuePerEmployee, null);
  assert.ok(r.meta);
  assert.equal(r.meta.opted_out, false);

  // Expected metrics sanity checks on the fixture.
  // emp-001 worked 4 distinct shifts, completed 4 jobs => 1 job/shift
  assert.equal(r.metrics.jobsPerShift, 1);
  // 1 defective output of 4 => 0.25
  assert.equal(r.metrics.defectRate, 0.25);
});

function _isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

// ─────────────────────────────────────────────────────────────
// 11. computeProductivity — opted-out employees
// ─────────────────────────────────────────────────────────────
test('computeProductivity respects opt-out (returns empty response)', () => {
  const ctx = makeFullContext();
  ctx.people[0].opted_out = true;        // emp-001 opts out
  const r = computeProductivity('emp-001', makeWeekPeriod(), ctx);
  assert.equal(r.metrics, null);
  assert.equal(r.peer_benchmark, null);
  assert.equal(r.meta.opted_out, true);
  assert.equal(r.meta.reason, 'opted_out');
  assert.ok(r.meta.privacyNoticeHe.includes('חוק הגנת הפרטיות'));
});

// ─────────────────────────────────────────────────────────────
// 12. computeProductivity — refuses narrow windows
// ─────────────────────────────────────────────────────────────
test('computeProductivity refuses windows shorter than 6 hours', () => {
  const ctx = makeFullContext();
  const narrow = {
    start: new Date('2026-04-02T09:00:00Z'),
    end:   new Date('2026-04-02T11:00:00Z'), // only 2h
    granularity: 'shift',
  };
  assert.throws(
    () => computeProductivity('emp-001', narrow, ctx),
    /period too narrow/
  );
});

// ─────────────────────────────────────────────────────────────
// 13. teamDashboard — k-anonymity enforcement
// ─────────────────────────────────────────────────────────────
test('teamDashboard blocks teams below k-anonymity floor', () => {
  const ctx = makeFullContext();
  // Shrink team to below K
  ctx.people = ctx.people.slice(0, K_ANONYMITY_MIN - 1);
  const r = teamDashboard('team-alpha', makeWeekPeriod(), ctx);
  assert.equal(r.eligible, false);
  assert.match(r.reason, /k-anonymity/);
  assert.ok(r.reasonHe.includes('חסם k-אנונימיות'));
  assert.equal(r.aggregates, null);
});

// ─────────────────────────────────────────────────────────────
// 14. teamDashboard — eligible team returns anonymized aggregates
// ─────────────────────────────────────────────────────────────
test('teamDashboard returns anonymized aggregates when k met', () => {
  const ctx = makeFullContext(); // 6 members, K=5 → eligible
  const r = teamDashboard('team-alpha', makeWeekPeriod(), ctx);
  assert.equal(r.eligible, true);
  assert.equal(r.memberCount, 6);
  assert.ok(r.aggregates);
  assert.ok('mean' in r.aggregates.jobsPerShift);
  assert.ok('p25'  in r.aggregates.jobsPerShift);
  assert.ok('p75'  in r.aggregates.jobsPerShift);
  // Anonymized — member list must NOT be present.
  assert.equal(r.members, undefined);
  assert.equal(r.memberIds, undefined);
  assert.equal(r.meta.anonymized, true);
});

// ─────────────────────────────────────────────────────────────
// 15. standardTimes — default + custom lookup
// ─────────────────────────────────────────────────────────────
test('standardTimes resolves job types with builtin and custom tables', () => {
  const a = standardTimes('weld-frame');
  assert.equal(a.standardMinutes, 90);
  assert.equal(a.source, 'builtin');

  const b = standardTimes('never-heard-of');
  assert.equal(b.standardMinutes, 60); // default fallback
  assert.equal(b.source, 'default_fallback');

  const c = standardTimes('weld-frame', { 'weld-frame': 45, default: 30 });
  assert.equal(c.standardMinutes, 45);
  assert.equal(c.source, 'custom');

  const d = standardTimes('');
  assert.equal(d.source, 'default_fallback');
});

// ─────────────────────────────────────────────────────────────
// 16. identifyBottlenecks
// ─────────────────────────────────────────────────────────────
test('identifyBottlenecks flags slow steps and queue buildups', () => {
  const wf = {
    workflowId: 'wf-A',
    steps: [
      { stepId: 'cut',    name: 'Cut',    meanMinutes: 20, queueLength: 1 },
      { stepId: 'weld',   name: 'Weld',   meanMinutes: 25, queueLength: 2 },
      { stepId: 'paint',  name: 'Paint',  meanMinutes: 80, queueLength: 5 }, // slow + big queue
      { stepId: 'pack',   name: 'Pack',   meanMinutes: 15, queueLength: 1 },
    ],
  };
  const r = identifyBottlenecks(wf);
  assert.equal(r.workflowId, 'wf-A');
  assert.ok(r.bottlenecks.length >= 1);
  const paint = r.bottlenecks.find(b => b.stepId === 'paint');
  assert.ok(paint, 'paint should be flagged');
  assert.ok(paint.reasons.includes('slow_relative_to_median'));
  assert.ok(paint.reasons.includes('queue_above_mean'));
  assert.ok(paint.suggestionHe.length > 0);

  // Empty / invalid input handled gracefully.
  const empty = identifyBottlenecks({ workflowId: 'x', steps: [] });
  assert.deepEqual(empty.bottlenecks, []);
});

// ─────────────────────────────────────────────────────────────
// 17. suggestTraining — metric-driven advisory suggestions
// ─────────────────────────────────────────────────────────────
test('suggestTraining maps metric gaps to advisory suggestions', () => {
  const s = suggestTraining({
    id: 'emp-001',
    role: 'workshop',
    metrics: {
      defectRate: 0.12,              // > 5% → QA-101
      reworkRate: 0.15,              // > 8% → PROC-210
      throughputVsStandard: 0.5,     // < 0.8 → TOOL-150
    },
    completedTrainings: [],
  });
  const codes = s.suggestions.map(x => x.code);
  assert.ok(codes.includes('QA-101'));
  assert.ok(codes.includes('PROC-210'));
  assert.ok(codes.includes('TOOL-150'));
  assert.equal(s.meta.advisoryOnly, true);
  assert.equal(s.meta.requiresHumanReview, true);

  // Already-completed courses are NOT suggested again.
  const s2 = suggestTraining({
    id: 'emp-002',
    metrics: { defectRate: 0.12 },
    completedTrainings: ['QA-101'],
  });
  assert.equal(s2.suggestions.find(x => x.code === 'QA-101'), undefined);

  // Missing id throws.
  assert.throws(() => suggestTraining({}), /employee\.id required/);
});

// ─────────────────────────────────────────────────────────────
// 18. Refused anti-patterns all throw
// ─────────────────────────────────────────────────────────────
test('refused anti-patterns throw explicit errors', () => {
  assert.throws(() => attendanceBasedScore(), /REFUSED: attendanceBasedScore/);
  assert.throws(() => peerRanking(),          /REFUSED: peerRanking/);
  assert.throws(() => automaticWarning(),     /REFUSED: automatic warnings/);
  assert.throws(() => perSecondTracking(),    /REFUSED: per-second/);
});

// ─────────────────────────────────────────────────────────────
// 19. Privacy notice present in every individual response
// ─────────────────────────────────────────────────────────────
test('Hebrew privacy notice is embedded in individual responses', () => {
  const ctx = makeFullContext();
  const r = computeProductivity('emp-001', makeWeekPeriod(), ctx);
  assert.ok(r.meta.privacyNoticeHe);
  assert.ok(r.meta.privacyNoticeHe.includes('תקנות הגנת הפרטיות') ||
            r.meta.privacyNoticeHe.includes('חוק הגנת הפרטיות'));
  // Exact constant available too
  assert.ok(PRIVACY_NOTICE_HE.length > 100);
});

// ─────────────────────────────────────────────────────────────
// 20. Peer benchmark returns percentiles, never peer identities
// ─────────────────────────────────────────────────────────────
test('peer_benchmark exposes percentiles only, never peer identities', () => {
  const ctx = makeFullContext();
  const r = computeProductivity('emp-001', makeWeekPeriod(), ctx);
  const pb = r.peer_benchmark;
  assert.ok(pb);
  if (pb.available) {
    assert.ok(_isFiniteNum(pb.jobsPerShiftPercentile));
    assert.ok(pb.jobsPerShiftPercentile >= 0 && pb.jobsPerShiftPercentile <= 100);
    // Must NOT include raw peer values or names.
    assert.equal(pb.peerIds, undefined);
    assert.equal(pb.peerNames, undefined);
    assert.equal(pb.peerValues, undefined);
  }
});
