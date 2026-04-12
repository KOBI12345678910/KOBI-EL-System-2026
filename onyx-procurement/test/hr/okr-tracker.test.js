/**
 * Unit tests for OKRTracker — Cascading OKR/KPI engine
 * Agent Y-066 • written 2026-04-11
 *
 * Run:   node --test test/hr/okr-tracker.test.js
 *
 * Covers:
 *   - createObjective shape + validation
 *   - addKeyResult validation per type
 *   - updateKR + history (append-only, never deleted)
 *   - krProgress math: numeric, percent, currency, boolean, inverse goal
 *   - objectiveScore: weighted mean
 *   - cascadeCheck: aligned / wrong_level / wrong_period
 *   - alignment: full up-chain for employee
 *   - grading thresholds: 0.0-0.3 red, 0.3-0.7 yellow, 0.7-1.0 green
 *   - stretchGoals: 70% = good
 *   - dashboardData aggregation
 *   - weeklyCheckIn + retrospective
 *   - archive (upgrade-only, never truly deleted)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OKRTracker,
  LEVELS,
  KR_TYPES,
  STATUS,
  GRADE_COLORS,
  isRed,
  isYellow,
  isGreen,
  gradeColor,
} = require('../../src/hr/okr-tracker.js');

// ──────────────────────────────────────────────────────────────
// Constants helpers
// ──────────────────────────────────────────────────────────────

test('01. isRed/isYellow/isGreen thresholds — 0.0 → red', () => {
  assert.equal(isRed(0.0), true);
  assert.equal(isYellow(0.0), false);
  assert.equal(isGreen(0.0), false);
  assert.equal(gradeColor(0.0), GRADE_COLORS.RED);
});

test('02. Grade threshold — 0.29 → red (just under 0.30)', () => {
  assert.equal(isRed(0.29), true);
  assert.equal(gradeColor(0.29), GRADE_COLORS.RED);
});

test('03. Grade threshold — 0.30 → yellow (inclusive boundary)', () => {
  assert.equal(isRed(0.30), false);
  assert.equal(isYellow(0.30), true);
  assert.equal(gradeColor(0.30), GRADE_COLORS.YELLOW);
});

test('04. Grade threshold — 0.69 → yellow', () => {
  assert.equal(isYellow(0.69), true);
  assert.equal(gradeColor(0.69), GRADE_COLORS.YELLOW);
});

test('05. Grade threshold — 0.70 → green (inclusive boundary, stretch "good")', () => {
  assert.equal(isYellow(0.70), false);
  assert.equal(isGreen(0.70), true);
  assert.equal(gradeColor(0.70), GRADE_COLORS.GREEN);
});

test('06. Grade threshold — 1.00 → green', () => {
  assert.equal(isGreen(1.00), true);
  assert.equal(gradeColor(1.00), GRADE_COLORS.GREEN);
});

// ──────────────────────────────────────────────────────────────
// createObjective
// ──────────────────────────────────────────────────────────────

test('07. createObjective — happy path returns an active objective', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    id:       'obj_co_2026q2',
    title_he: 'לצמוח כחברה',
    title_en: 'Grow the company',
    owner:    'emp_ceo',
    level:    LEVELS.COMPANY,
    period:   '2026-Q2',
  });
  assert.equal(obj.id, 'obj_co_2026q2');
  assert.equal(obj.level, LEVELS.COMPANY);
  assert.equal(obj.status, STATUS.ACTIVE);
  assert.equal(obj.parent, null);
  assert.deepEqual(obj.krIds, []);
});

test('08. createObjective — missing title_he throws', () => {
  const t = new OKRTracker();
  assert.throws(() => {
    t.createObjective({
      title_en: 'Grow', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
    });
  }, /title_he and title_en are required/);
});

test('09. createObjective — bad level throws', () => {
  const t = new OKRTracker();
  assert.throws(() => {
    t.createObjective({
      title_he: 'x', title_en: 'x', owner: 'e1', level: 'galactic', period: '2026-Q2',
    });
  }, /level must be one of/);
});

test('10. createObjective — parent must be at higher level (cascade rule)', () => {
  const t = new OKRTracker();
  const teamObj = t.createObjective({
    title_he: 'צוות', title_en: 'Team', owner: 'e1', level: LEVELS.TEAM, period: '2026-Q2',
  });
  // Try creating a COMPANY child of a TEAM parent — must throw
  assert.throws(() => {
    t.createObjective({
      title_he: 'חברה', title_en: 'Company',
      owner: 'e2', level: LEVELS.COMPANY, period: '2026-Q2',
      parent: teamObj.id,
    });
  }, /not higher than child level/);
});

// ──────────────────────────────────────────────────────────────
// addKeyResult
// ──────────────────────────────────────────────────────────────

test('11. addKeyResult — numeric KR initialises current to start', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'הכנסות',
    title_en: 'Revenue',
    metric: 'ILS',
    type: KR_TYPES.CURRENCY,
    start: 1_000_000,
    target: 2_000_000,
  });
  assert.equal(kr.current, 1_000_000);
  assert.equal(kr.history.length, 1);
  assert.equal(kr.weight, 1);
});

test('12. addKeyResult — boolean KR requires boolean target', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  assert.throws(() => {
    t.addKeyResult({
      objectiveId: obj.id,
      title_he: 'x', title_en: 'x',
      type: KR_TYPES.BOOLEAN,
      start: false,
      target: 'done', // wrong type
    });
  }, /boolean KR requires boolean target/);
});

test('13. addKeyResult — start must differ from target', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  assert.throws(() => {
    t.addKeyResult({
      objectiveId: obj.id,
      title_he: 'x', title_en: 'x',
      type: KR_TYPES.NUMERIC,
      start: 10, target: 10,
    });
  }, /start and target must differ/);
});

// ──────────────────────────────────────────────────────────────
// krProgress math
// ──────────────────────────────────────────────────────────────

test('14. krProgress — numeric 50% of the way', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 50,
  });
  assert.equal(t.krProgress(kr.id), 0.5);
});

test('15. krProgress — currency, start != 0', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.CURRENCY,
    start: 1_000_000, target: 2_000_000, current: 1_500_000,
  });
  assert.equal(t.krProgress(kr.id), 0.5);
});

test('16. krProgress — INVERSE goal (reduce defects) 10 → 2 with current 6', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 10, target: 2, current: 6,
  });
  // (6 - 10) / (2 - 10) = -4 / -8 = 0.5
  assert.equal(t.krProgress(kr.id), 0.5);
});

test('17. krProgress — clamps over-achievement at 1.0', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 150,
  });
  assert.equal(t.krProgress(kr.id), 1.0);
});

test('18. krProgress — clamps negative regression at 0', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: -5,
  });
  assert.equal(t.krProgress(kr.id), 0);
});

test('19. krProgress — boolean true hits target', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.BOOLEAN,
    start: false, target: true, current: false,
  });
  assert.equal(t.krProgress(kr.id), 0.0);
  t.updateKR({ krId: kr.id, value: true });
  assert.equal(t.krProgress(kr.id), 1.0);
});

// ──────────────────────────────────────────────────────────────
// updateKR + history
// ──────────────────────────────────────────────────────────────

test('20. updateKR — history is append-only (never deleted)', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const kr = t.addKeyResult({
    objectiveId: obj.id,
    title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 0,
  });
  t.updateKR({ krId: kr.id, value: 25, note: 'week 1' });
  t.updateKR({ krId: kr.id, value: 50, note: 'week 2' });
  t.updateKR({ krId: kr.id, value: 75, note: 'week 3' });
  const updated = t.getKR(kr.id);
  assert.equal(updated.history.length, 4); // initial + 3 updates
  assert.equal(updated.current, 75);
  assert.equal(updated.history[1].note, 'week 1');
  assert.equal(updated.history[3].note, 'week 3');
});

// ──────────────────────────────────────────────────────────────
// objectiveScore — weighted mean
// ──────────────────────────────────────────────────────────────

test('21. objectiveScore — two KRs, simple average', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'a', title_en: 'a', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 80,
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'b', title_en: 'b', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 40,
  });
  // (0.8 + 0.4) / 2 = 0.6
  assert.equal(t.objectiveScore(obj.id), 0.6);
});

test('22. objectiveScore — weighted mean (weight 2 vs 1)', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'a', title_en: 'a', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 100, weight: 2,
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'b', title_en: 'b', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 40, weight: 1,
  });
  // (1.0*2 + 0.4*1) / 3 = 2.4 / 3 = 0.8
  assert.equal(t.objectiveScore(obj.id), 0.8);
});

test('23. objectiveScore — no KRs returns 0', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  assert.equal(t.objectiveScore(obj.id), 0);
});

// ──────────────────────────────────────────────────────────────
// cascadeCheck
// ──────────────────────────────────────────────────────────────

test('24. cascadeCheck — all children aligned', () => {
  const t = new OKRTracker();
  const co = t.createObjective({
    id: 'co', title_he: 'ח', title_en: 'C', owner: 'e_ceo',
    level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.createObjective({
    id: 'd1', title_he: 'ד', title_en: 'D', owner: 'e_vp',
    level: LEVELS.DEPARTMENT, period: '2026-Q2', parent: co.id,
  });
  t.createObjective({
    id: 'd2', title_he: 'ד2', title_en: 'D2', owner: 'e_vp2',
    level: LEVELS.DEPARTMENT, period: '2026-Q2', parent: co.id,
  });
  const report = t.cascadeCheck('co');
  assert.equal(report.childCount, 2);
  assert.equal(report.alignedCount, 2);
  assert.equal(report.aligned, true);
  assert.equal(report.misaligned.length, 0);
});

test('25. cascadeCheck — flags wrong_period misalignment', () => {
  const t = new OKRTracker();
  const co = t.createObjective({
    id: 'co', title_he: 'ח', title_en: 'C', owner: 'e_ceo',
    level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.createObjective({
    id: 'd1', title_he: 'ד', title_en: 'D', owner: 'e_vp',
    level: LEVELS.DEPARTMENT, period: '2026-Q1', parent: co.id, // wrong period
  });
  const report = t.cascadeCheck('co');
  assert.equal(report.aligned, false);
  assert.equal(report.misaligned[0].reason, 'wrong_period');
});

test('26. cascadeCheck — leaf objective is trivially aligned', () => {
  const t = new OKRTracker();
  const ind = t.createObjective({
    title_he: 'אישי', title_en: 'Personal', owner: 'e1',
    level: LEVELS.INDIVIDUAL, period: '2026-Q2',
  });
  const report = t.cascadeCheck(ind.id);
  assert.equal(report.childCount, 0);
  assert.equal(report.aligned, true);
});

// ──────────────────────────────────────────────────────────────
// alignment
// ──────────────────────────────────────────────────────────────

test('27. alignment — employee up-chain reaches company', () => {
  const t = new OKRTracker();
  const co = t.createObjective({
    id: 'co', title_he: 'ח', title_en: 'C', owner: 'e_ceo',
    level: LEVELS.COMPANY, period: '2026-Q2',
  });
  const dept = t.createObjective({
    id: 'dept', title_he: 'ד', title_en: 'D', owner: 'e_vp',
    level: LEVELS.DEPARTMENT, period: '2026-Q2', parent: co.id,
  });
  const team = t.createObjective({
    id: 'team', title_he: 'צ', title_en: 'T', owner: 'e_mgr',
    level: LEVELS.TEAM, period: '2026-Q2', parent: dept.id,
  });
  t.createObjective({
    id: 'ind', title_he: 'א', title_en: 'I', owner: 'e_dev',
    level: LEVELS.INDIVIDUAL, period: '2026-Q2', parent: team.id,
  });
  const result = t.alignment('e_dev');
  assert.equal(result.objectiveCount, 1);
  assert.equal(result.chains[0].chain.length, 4);
  assert.equal(result.chains[0].chain[0].level, LEVELS.INDIVIDUAL);
  assert.equal(result.chains[0].chain[3].level, LEVELS.COMPANY);
  assert.equal(result.fullyAligned, true);
});

test('28. alignment — orphan individual is not fullyAligned', () => {
  const t = new OKRTracker();
  t.createObjective({
    title_he: 'א', title_en: 'I', owner: 'e_solo',
    level: LEVELS.INDIVIDUAL, period: '2026-Q2',
  });
  const result = t.alignment('e_solo');
  assert.equal(result.fullyAligned, false);
});

// ──────────────────────────────────────────────────────────────
// grading
// ──────────────────────────────────────────────────────────────

test('29. grading — bins 3 objectives into red/yellow/green', () => {
  const t = new OKRTracker();
  // Red: 20%
  const r = t.createObjective({
    id: 'or', title_he: 'א', title_en: 'R',
    owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: r.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 20,
  });
  // Yellow: 50%
  const y = t.createObjective({
    id: 'oy', title_he: 'צ', title_en: 'Y',
    owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: y.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 50,
  });
  // Green: 80%
  const g = t.createObjective({
    id: 'og', title_he: 'י', title_en: 'G',
    owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: g.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 80,
  });

  const report = t.grading('2026-Q2');
  assert.equal(report.total, 3);
  assert.equal(report.counts.red, 1);
  assert.equal(report.counts.yellow, 1);
  assert.equal(report.counts.green, 1);
});

// ──────────────────────────────────────────────────────────────
// stretchGoals
// ──────────────────────────────────────────────────────────────

test('30. stretchGoals — 70% considered "good"', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 70,
  });
  const s = t.stretchGoals(obj.id);
  assert.equal(s.score, 0.7);
  assert.equal(s.stretchMet, true);
  assert.equal(s.tooEasy, false);
});

test('31. stretchGoals — 100% hit flags "too easy" (target may be too low)', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 100,
  });
  const s = t.stretchGoals(obj.id);
  assert.equal(s.stretchMet, true);
  assert.equal(s.tooEasy, true);
});

// ──────────────────────────────────────────────────────────────
// dashboardData
// ──────────────────────────────────────────────────────────────

test('32. dashboardData — aggregates counts per level', () => {
  const t = new OKRTracker();
  const co = t.createObjective({
    id: 'co', title_he: 'ח', title_en: 'C', owner: 'e_ceo',
    level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: co.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 90,
  });
  t.createObjective({
    id: 'd', title_he: 'ד', title_en: 'D', owner: 'e_vp',
    level: LEVELS.DEPARTMENT, period: '2026-Q2', parent: co.id,
  });

  const data = t.dashboardData();
  assert.equal(data.orgLevel, 'all');
  assert.equal(data.byLevel.company.length, 1);
  assert.equal(data.byLevel.department.length, 1);
  assert.equal(data.overall.total, 2);
});

// ──────────────────────────────────────────────────────────────
// weeklyCheckIn + retrospective
// ──────────────────────────────────────────────────────────────

test('33. weeklyCheckIn — stores blockers and updates status', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: obj.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 30,
  });
  const entry = t.weeklyCheckIn(
    obj.id,
    STATUS.AT_RISK,
    ['גיוס עובדים איטי', 'תקציב לא מאושר'],
    'צריך עזרה',
    'e1'
  );
  assert.equal(entry.status, STATUS.AT_RISK);
  assert.equal(entry.blockers.length, 2);
  assert.equal(t.getObjective(obj.id).status, STATUS.AT_RISK);
});

test('34. retrospective — aggregates period data + stretch success rate', () => {
  const t = new OKRTracker();
  const o1 = t.createObjective({
    id: 'o1', title_he: 'א', title_en: 'A',
    owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: o1.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 80, // green / stretch met
  });
  const o2 = t.createObjective({
    id: 'o2', title_he: 'ב', title_en: 'B',
    owner: 'e2', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.addKeyResult({
    objectiveId: o2.id, title_he: 'x', title_en: 'x', type: KR_TYPES.NUMERIC,
    start: 0, target: 100, current: 20, // red / stretch not met
  });
  t.weeklyCheckIn(o1.id, STATUS.ON_TRACK, [], 'good week');
  const retro = t.retrospective('2026-Q2');
  assert.equal(retro.objectiveCount, 2);
  assert.equal(retro.counts.green, 1);
  assert.equal(retro.counts.red, 1);
  assert.equal(retro.stretchSuccessRate, 0.5);
});

// ──────────────────────────────────────────────────────────────
// archive (upgrade-only, no true delete)
// ──────────────────────────────────────────────────────────────

test('35. archive — soft-delete keeps the record but hides from active views', () => {
  const t = new OKRTracker();
  const obj = t.createObjective({
    title_he: 'x', title_en: 'x', owner: 'e1', level: LEVELS.COMPANY, period: '2026-Q2',
  });
  t.archive(obj.id, 'reorg — יעד התעדכן לרמה של החברה');
  const archived = t.getObjective(obj.id);
  assert.equal(archived.status, STATUS.ARCHIVED);
  assert.ok(archived.archivedAt);
  assert.ok(archived.archiveReason.includes('reorg'));
  // Not visible in default listObjectives
  assert.equal(t.listObjectives().length, 0);
  // Still visible with includeArchived
  assert.equal(t.listObjectives({ includeArchived: true }).length, 1);
});
