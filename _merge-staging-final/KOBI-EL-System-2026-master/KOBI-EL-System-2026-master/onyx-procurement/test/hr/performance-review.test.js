/**
 * Performance Review Engine — Unit Tests
 * Agent Y-065 • Techno-Kol Uzi • Kobi's mega-ERP • 2026-04-11
 *
 * Run with:
 *   node --test test/hr/performance-review.test.js
 *
 * Requires Node >= 18 for node:test.
 *
 * Coverage:
 *   01. Template creation (validation, scale, weights)
 *   02. Template version-bump (Kobi's law: never lose old version)
 *   03. scheduleReview happy path
 *   04. scheduleReview validation errors
 *   05. submitReview score calculation — equal weights
 *   06. submitReview score calculation — unequal weights
 *   07. submitReview rejects out-of-range scores
 *   08. submitReview append-only — second submission keeps history
 *   09. calibrate — bell curve enforces 10/20/40/20/10 distribution
 *   10. calibrate — adjustments report on re-calibration
 *   11. generate360Feedback — anonymity preserved
 *   12. generate360Feedback — k-anonymity redacts groups < 3
 *   13. generate360Feedback — reviewer count returned but not identity
 *   14. linkToCompGrade — salary delta + history append
 *   15. exportPDI — strengths/weaknesses/training extraction
 *   16. flagPerformanceIssue — minor severity does NOT trigger PIP
 *   17. flagPerformanceIssue — moderate severity triggers PIP w/ Israeli law fields
 *   18. PIP milestones append-only + completion outcomes
 *   19. PIP duration clamped to 90..180 days (Israeli case-law)
 *   20. history — multi-year roll-up + trend
 *   21. generateReport — bilingual labels + filter
 *   22. archive — cannot archive unsubmitted; archived survives
 *   23. Kobi's law — status transitions are monotonic, no rollback allowed
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const pr = require(path.resolve(__dirname, '..', '..', 'src', 'hr', 'performance-review.js'));
const {
  PerformanceReview,
  STATUS,
  PIP_SEVERITY,
  REVIEWER_KIND,
  K_ANON,
  MIN_PIP_DAYS,
  MAX_PIP_DAYS,
  LABELS,
} = pr;

// ─────────────────────────────────────────────────────────────
// Test helpers — deterministic clock + id generator
// ─────────────────────────────────────────────────────────────

let nowMs = Date.parse('2026-04-11T08:00:00Z');
function fakeClock() { return new Date(nowMs); }
function advance(days) { nowMs += days * 86400000; }
function resetClock() { nowMs = Date.parse('2026-04-11T08:00:00Z'); }

let idCounter = 0;
function fakeId(prefix) { idCounter += 1; return `${prefix}-${idCounter}`; }

function makeEngine(opts = {}) {
  idCounter = 0;
  resetClock();
  return new PerformanceReview({
    clock: fakeClock,
    randomId: fakeId,
    anonSalt: 'test-salt-fixed',
    ...opts,
  });
}

function defaultTemplate(engine, overrides = {}) {
  return engine.defineTemplate({
    id: 'tpl-eng-2026',
    name_he: 'הערכת מהנדס/ת',
    name_en: 'Engineer review',
    scale: 5,
    competencies: [
      {
        id: 'tech',
        label_he: 'מצוינות טכנית',
        label_en: 'Technical excellence',
        weight: 3,
        rubric: { 1: 'חלש', 5: 'מצוין' },
      },
      {
        id: 'collab',
        label_he: 'שיתוף פעולה',
        label_en: 'Collaboration',
        weight: 2,
      },
      {
        id: 'delivery',
        label_he: 'אספקה בזמן',
        label_en: 'On-time delivery',
        weight: 1,
      },
    ],
    ...overrides,
  });
}

// ═════════════════════════════════════════════════════════════
// 01. defineTemplate — happy path
// ═════════════════════════════════════════════════════════════
test('01. defineTemplate creates a template with bilingual labels and weights', () => {
  const engine = makeEngine();
  const tpl = defaultTemplate(engine);
  assert.equal(tpl.id, 'tpl-eng-2026');
  assert.equal(tpl.name_he, 'הערכת מהנדס/ת');
  assert.equal(tpl.name_en, 'Engineer review');
  assert.equal(tpl.scale, 5);
  assert.equal(tpl.competencies.length, 3);
  assert.equal(tpl.competencies[0].weight, 3);
  assert.deepEqual(tpl.competencies[0].rubric, { 1: 'חלש', 5: 'מצוין' });
  assert.equal(tpl.version, 1);
});

// ═════════════════════════════════════════════════════════════
// 02. Template upgrade preserves prior version (Kobi's law)
// ═════════════════════════════════════════════════════════════
test('02. defineTemplate upgrade keeps previousVersion (לא מוחקים)', () => {
  const engine = makeEngine();
  const v1 = defaultTemplate(engine);
  // Re-define with one extra competency.
  const v2 = engine.defineTemplate({
    id: 'tpl-eng-2026',
    name_he: 'הערכת מהנדס/ת',
    name_en: 'Engineer review',
    scale: 5,
    competencies: [
      ...v1.competencies.map(c => ({
        id: c.id,
        label_he: c.label_he,
        label_en: c.label_en,
        weight: c.weight,
      })),
      {
        id: 'innovation',
        label_he: 'חדשנות',
        label_en: 'Innovation',
        weight: 1,
      },
    ],
  });
  assert.equal(v2.version, 2);
  assert.ok(v2.previousVersion, 'previousVersion stored');
  assert.equal(v2.previousVersion.version, 1);
  assert.equal(v2.competencies.length, 4);
});

// ═════════════════════════════════════════════════════════════
// 03. scheduleReview happy path
// ═════════════════════════════════════════════════════════════
test('03. scheduleReview wires reviewer + due date + status=scheduled', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-1',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
    departmentId: 'dept-eng',
    managerId: 'mgr-1',
  });
  assert.ok(rev.id.startsWith('rev-'));
  assert.equal(rev.employeeId, 'emp-1');
  assert.equal(rev.templateId, 'tpl-eng-2026');
  assert.equal(rev.status, STATUS.SCHEDULED);
  assert.equal(rev.period, '2026-H1');
  assert.equal(rev.departmentId, 'dept-eng');
  assert.equal(rev.managerId, 'mgr-1');
});

// ═════════════════════════════════════════════════════════════
// 04. scheduleReview validation errors
// ═════════════════════════════════════════════════════════════
test('04. scheduleReview rejects missing fields and unknown template', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  assert.throws(() => engine.scheduleReview({}), /spec object|employeeId/);
  assert.throws(
    () =>
      engine.scheduleReview({
        employeeId: 'emp-1',
        templateId: 'no-such',
        reviewerId: 'mgr-1',
        period: '2026-H1',
        dueDate: '2026-06-30',
      }),
    /not found/,
  );
});

// ═════════════════════════════════════════════════════════════
// 05. submitReview — equal weights
// ═════════════════════════════════════════════════════════════
test('05. submitReview computes weighted overall score (equal weights)', () => {
  const engine = makeEngine();
  engine.defineTemplate({
    id: 'tpl-eq',
    name_he: 'שווה',
    name_en: 'Equal',
    scale: 5,
    competencies: [
      { id: 'a', label_he: 'A', label_en: 'A', weight: 1 },
      { id: 'b', label_he: 'B', label_en: 'B', weight: 1 },
      { id: 'c', label_he: 'C', label_en: 'C', weight: 1 },
    ],
  });
  const rev = engine.scheduleReview({
    employeeId: 'emp-2',
    templateId: 'tpl-eq',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  const submitted = engine.submitReview({
    reviewId: rev.id,
    scores: { a: 5, b: 4, c: 3 },
  });
  // (5+4+3)/3 = 4
  assert.equal(submitted.overall, 4);
  assert.equal(submitted.overallNormalized, 0.8);
  assert.equal(submitted.status, STATUS.SUBMITTED);
});

// ═════════════════════════════════════════════════════════════
// 06. submitReview — unequal weights
// ═════════════════════════════════════════════════════════════
test('06. submitReview computes weighted overall score (unequal weights)', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-3',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  // weights: tech=3, collab=2, delivery=1, total=6
  // scores: 5, 3, 2 → (5*3 + 3*2 + 2*1) / 6 = 23/6 = 3.8333
  const submitted = engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 5, collab: 3, delivery: 2 },
    comments: 'Strong technical lead — collaboration could grow',
  });
  assert.ok(Math.abs(submitted.overall - 3.8333) < 0.001);
  assert.equal(submitted.comments, 'Strong technical lead — collaboration could grow');
});

// ═════════════════════════════════════════════════════════════
// 07. submitReview rejects scores out of range
// ═════════════════════════════════════════════════════════════
test('07. submitReview rejects out-of-range and missing scores', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-4',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  assert.throws(
    () => engine.submitReview({ reviewId: rev.id, scores: { tech: 5, collab: 3 } }),
    /missing score/,
  );
  assert.throws(
    () => engine.submitReview({ reviewId: rev.id, scores: { tech: 9, collab: 3, delivery: 2 } }),
    /must be 1\.\.5/,
  );
  assert.throws(
    () => engine.submitReview({ reviewId: rev.id, scores: { tech: 0, collab: 3, delivery: 2 } }),
    /must be 1\.\.5/,
  );
});

// ═════════════════════════════════════════════════════════════
// 08. submitReview is append-only
// ═════════════════════════════════════════════════════════════
test('08. submitReview is append-only — second submission keeps history', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-5',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 3, collab: 3, delivery: 3 },
  });
  advance(1);
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 5, collab: 5, delivery: 5 },
  });
  const stored = engine.getReview(rev.id);
  assert.equal(stored.submissions.length, 2);
  assert.equal(stored.submissions[0].overall, 3);
  assert.equal(stored.submissions[1].overall, 5);
  // canonical fields reflect the LAST submission
  assert.equal(stored.overall, 5);
});

// ═════════════════════════════════════════════════════════════
// 09. calibrate enforces bell curve 10/20/40/20/10
// ═════════════════════════════════════════════════════════════
test('09. calibrate enforces forced bell-curve distribution', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  // Create 10 reviews with descending scores so the order is deterministic.
  const scoreSet = [5, 5, 4.5, 4.2, 4, 3.8, 3.5, 3, 2.5, 2];
  for (let i = 0; i < 10; i += 1) {
    const rev = engine.scheduleReview({
      employeeId: `emp-${i + 100}`,
      templateId: 'tpl-eng-2026',
      reviewerId: 'mgr-cal',
      period: '2026-H1',
      dueDate: '2026-06-30',
      managerId: 'mgr-cal',
    });
    const s = scoreSet[i];
    engine.submitReview({
      reviewId: rev.id,
      scores: { tech: s, collab: s, delivery: s },
    });
  }
  const result = engine.calibrate({
    managerId: 'mgr-cal',
    period: '2026-H1',
  });
  assert.equal(result.cohortSize, 10);
  // 10/20/40/20/10 of 10 = 1/2/4/2/1
  const expected = { top: 1, above: 2, meets: 4, below: 2, unsatisfactory: 1 };
  for (const b of result.buckets) {
    assert.equal(b.expected, expected[b.id], `bucket ${b.id} expected ${expected[b.id]}, got ${b.expected}`);
  }
  // Highest scorer must be in 'top'
  const topAssign = result.assignments.find(a => a.bucket === 'top');
  assert.equal(topAssign.rank, 1);
  assert.equal(topAssign.overall, 5);
});

// ═════════════════════════════════════════════════════════════
// 10. calibrate produces an adjustments report
// ═════════════════════════════════════════════════════════════
test('10. calibrate adjustments report shows movements between buckets', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  for (let i = 0; i < 5; i += 1) {
    const rev = engine.scheduleReview({
      employeeId: `emp-2${i}`,
      templateId: 'tpl-eng-2026',
      reviewerId: 'mgr-x',
      period: '2026-H2',
      dueDate: '2026-12-31',
      managerId: 'mgr-x',
    });
    engine.submitReview({
      reviewId: rev.id,
      scores: { tech: 5 - i * 0.5, collab: 5 - i * 0.5, delivery: 5 - i * 0.5 },
    });
  }
  const r1 = engine.calibrate({ managerId: 'mgr-x', period: '2026-H2' });
  // First calibration produces no adjustments (no prior).
  assert.equal(r1.adjustments.length, 0);
  // Custom rule: skew everyone above expectations.
  const r2 = engine.calibrate({
    managerId: 'mgr-x',
    period: '2026-H2',
    rule: {
      kind: 'bell',
      buckets: [
        { id: 'top',           pct: 0.20, he: 'מצטיינים', en: 'Top' },
        { id: 'above',         pct: 0.40, he: 'מעל',      en: 'Above' },
        { id: 'meets',         pct: 0.40, he: 'עומד',     en: 'Meets' },
        { id: 'below',         pct: 0.00, he: 'מתחת',     en: 'Below' },
        { id: 'unsatisfactory',pct: 0.00, he: 'לא משביע', en: 'Unsat' },
      ],
    },
  });
  // Almost everyone should have moved at least one bucket.
  assert.ok(r2.adjustments.length >= 1, 'adjustments should be reported on re-calibration');
});

// ═════════════════════════════════════════════════════════════
// 11. generate360Feedback — anonymity preserved
// ═════════════════════════════════════════════════════════════
test('11. generate360Feedback hashes reviewer ids by default', () => {
  const engine = makeEngine();
  const bundle = engine.generate360Feedback({
    employeeId: 'emp-360',
    period: '2026-H1',
    reviewers: [
      { reviewerId: 'mgr-1',   kind: REVIEWER_KIND.MANAGER,     scores: { tech: 5, collab: 4 } },
      { reviewerId: 'peer-1',  kind: REVIEWER_KIND.PEER,        scores: { tech: 4, collab: 4 } },
      { reviewerId: 'peer-2',  kind: REVIEWER_KIND.PEER,        scores: { tech: 4, collab: 5 } },
      { reviewerId: 'peer-3',  kind: REVIEWER_KIND.PEER,        scores: { tech: 3, collab: 5 } },
      { reviewerId: 'sub-1',   kind: REVIEWER_KIND.SUBORDINATE, scores: { tech: 4, collab: 3 } },
      { reviewerId: 'sub-2',   kind: REVIEWER_KIND.SUBORDINATE, scores: { tech: 5, collab: 4 } },
      { reviewerId: 'sub-3',   kind: REVIEWER_KIND.SUBORDINATE, scores: { tech: 4, collab: 4 } },
      { reviewerId: 'emp-360', kind: REVIEWER_KIND.SELF,        scores: { tech: 4, collab: 4 } },
    ],
  });
  // No raw reviewerId should appear anywhere in the bundle.
  const json = JSON.stringify(bundle);
  assert.ok(!json.includes('peer-1'), 'raw peer-1 must not leak');
  assert.ok(!json.includes('mgr-1'),  'raw mgr-1 must not leak');
  assert.ok(!json.includes('sub-1'),  'raw sub-1 must not leak');
  assert.equal(bundle.anonymous, true);
  assert.equal(bundle.reviewerCount, 8);
  // Counts must still be returned.
  assert.equal(bundle.countsByKind.peer, 3);
  assert.equal(bundle.countsByKind.subordinate, 3);
  assert.equal(bundle.countsByKind.manager, 1);
  assert.equal(bundle.countsByKind.self, 1);
});

// ═════════════════════════════════════════════════════════════
// 12. generate360Feedback k-anonymity
// ═════════════════════════════════════════════════════════════
test('12. generate360Feedback redacts groups with fewer than 3 respondents', () => {
  const engine = makeEngine();
  const bundle = engine.generate360Feedback({
    employeeId: 'emp-360',
    reviewers: [
      // manager group has only 2 — must be redacted (not self)
      { reviewerId: 'mgr-1', kind: REVIEWER_KIND.MANAGER, scores: { tech: 5, collab: 5 } },
      { reviewerId: 'mgr-2', kind: REVIEWER_KIND.MANAGER, scores: { tech: 4, collab: 4 } },
      // peer group has 3 — survives
      { reviewerId: 'p1', kind: REVIEWER_KIND.PEER, scores: { tech: 3, collab: 3 } },
      { reviewerId: 'p2', kind: REVIEWER_KIND.PEER, scores: { tech: 4, collab: 4 } },
      { reviewerId: 'p3', kind: REVIEWER_KIND.PEER, scores: { tech: 5, collab: 5 } },
      // self always returned
      { reviewerId: 'emp-360', kind: REVIEWER_KIND.SELF, scores: { tech: 4, collab: 4 } },
    ],
  });
  assert.equal(bundle.aggregated.manager.redacted, true);
  assert.equal(bundle.aggregated.manager.count, 2);
  assert.equal(bundle.aggregated.manager.reason, 'k-anonymity');
  assert.equal(bundle.aggregated.peer.redacted, undefined);
  assert.equal(bundle.aggregated.peer.count, 3);
  assert.equal(bundle.aggregated.peer.scores.tech, 4);
  // Self is never k-constrained.
  assert.equal(bundle.aggregated.self.count, 1);
  assert.equal(bundle.aggregated.self.scores.tech, 4);
  // K_ANON constant exposed
  assert.equal(K_ANON, 3);
});

// ═════════════════════════════════════════════════════════════
// 13. reviewer count returned but identity hidden
// ═════════════════════════════════════════════════════════════
test('13. generate360Feedback returns reviewer count without revealing identity', () => {
  const engine = makeEngine();
  const bundle = engine.generate360Feedback({
    employeeId: 'emp-x',
    reviewers: [
      { reviewerId: 'secret-1', kind: REVIEWER_KIND.PEER, scores: { tech: 4 } },
      { reviewerId: 'secret-2', kind: REVIEWER_KIND.PEER, scores: { tech: 5 } },
      { reviewerId: 'secret-3', kind: REVIEWER_KIND.PEER, scores: { tech: 3 } },
    ],
  });
  assert.equal(bundle.reviewerCount, 3);
  assert.equal(bundle.countsByKind.peer, 3);
  // Hashes are present but they are NOT the original ids
  const allHashes = bundle.reviewerHashes.map(h => h.anonId);
  for (const h of allHashes) {
    assert.ok(!h.startsWith('secret-'), `anon id should not contain raw id, got ${h}`);
    assert.equal(h.length, 12);
  }
});

// ═════════════════════════════════════════════════════════════
// 14. linkToCompGrade
// ═════════════════════════════════════════════════════════════
test('14. linkToCompGrade attaches grade change with salary delta', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-7',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 5, collab: 5, delivery: 5 },
  });
  const link = engine.linkToCompGrade(rev.id, {
    fromGrade: 'L4',
    toGrade: 'L5',
    salaryFrom: 18000,
    salaryTo: 21500,
    reason: 'Outstanding annual performance',
  });
  assert.equal(link.fromGrade, 'L4');
  assert.equal(link.toGrade, 'L5');
  assert.equal(link.salaryDelta, 3500);

  // Linking again keeps the previous link in compLinkHistory.
  engine.linkToCompGrade(rev.id, {
    fromGrade: 'L5',
    toGrade: 'L6',
    salaryFrom: 21500,
    salaryTo: 24000,
  });
  const stored = engine.getReview(rev.id);
  assert.equal(stored.compLinkHistory.length, 1);
  assert.equal(stored.compLinkHistory[0].toGrade, 'L5');
  assert.equal(stored.compLink.toGrade, 'L6');
});

// ═════════════════════════════════════════════════════════════
// 15. exportPDI — strengths / weaknesses / training
// ═════════════════════════════════════════════════════════════
test('15. exportPDI extracts strengths, weaknesses, and training', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-9',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 5, collab: 2, delivery: 4 },
  });
  const pdi = engine.exportPDI('emp-9');
  assert.equal(pdi.employeeId, 'emp-9');
  assert.equal(pdi.basedOnReviewId, rev.id);
  // tech=5 is a strength (>= 3.5), delivery=4 too
  assert.ok(pdi.strengths.find(s => s.competencyId === 'tech'));
  assert.ok(pdi.strengths.find(s => s.competencyId === 'delivery'));
  // collab=2 is a weakness (< 3) → goal + training
  assert.ok(pdi.weaknesses.find(w => w.competencyId === 'collab'));
  assert.ok(pdi.goals.find(g => g.competencyId === 'collab'));
  assert.ok(pdi.training.find(t => t.competencyId === 'collab'));
  // Bilingual labels in training
  const tr = pdi.training.find(t => t.competencyId === 'collab');
  assert.ok(tr.recommendation_he.includes('שיתוף פעולה'));
  assert.ok(tr.recommendation_en.includes('Collaboration'));
});

// ═════════════════════════════════════════════════════════════
// 16. flagPerformanceIssue — minor severity does NOT trigger PIP
// ═════════════════════════════════════════════════════════════
test('16. flagPerformanceIssue with minor severity does NOT trigger PIP', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-min',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 4, collab: 4, delivery: 3 },
  });
  const out = engine.flagPerformanceIssue(rev.id, 'minor', 'Verbal coaching reminder');
  assert.equal(out.flag.severity, 'minor');
  assert.equal(out.flag.pipRequired, false);
  assert.equal(out.pip, null);
});

// ═════════════════════════════════════════════════════════════
// 17. flagPerformanceIssue — moderate triggers PIP w/ Israeli law
// ═════════════════════════════════════════════════════════════
test('17. flagPerformanceIssue with moderate severity triggers PIP per Israeli labor law', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-pip',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
    managerId: 'mgr-1',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 2, collab: 2, delivery: 2 },
  });
  const out = engine.flagPerformanceIssue(rev.id, 'moderate', {
    summary: 'Multiple deadline misses, customer escalation',
  });
  assert.equal(out.flag.pipRequired, true);
  assert.ok(out.pip, 'pip should be created');
  // Statutory checklist:
  assert.equal(out.pip.writtenNoticeIssued, true);
  assert.ok(out.pip.writtenNoticeDate);
  assert.equal(out.pip.fairHearingScheduled, true);
  assert.equal(out.pip.mentorId, 'mgr-1', 'mentor defaults to direct manager');
  assert.ok(out.pip.durationDays >= MIN_PIP_DAYS);
  assert.ok(out.pip.durationDays <= MAX_PIP_DAYS);
  assert.ok(Array.isArray(out.pip.statutoryReferences));
  assert.ok(out.pip.statutoryReferences.length >= 2);
  // PIP linked back to review
  const stored = engine.getReview(rev.id);
  assert.equal(stored.pipId, out.pip.id);
});

// ═════════════════════════════════════════════════════════════
// 18. PIP milestones append-only and outcomes
// ═════════════════════════════════════════════════════════════
test('18. PIP milestones append-only + completePIP outcomes', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-pip2',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
    managerId: 'mgr-1',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 2, collab: 2, delivery: 2 },
  });
  const { pip } = engine.flagPerformanceIssue(rev.id, 'serious', 'Below standard');
  engine.recordPIPMilestone(pip.id, { title: 'Week 4 check-in', progress: 0.25, author: 'mgr-1' });
  advance(7);
  engine.recordPIPMilestone(pip.id, { title: 'Week 8 check-in', progress: 0.6, author: 'mgr-1' });

  // Extend the PIP
  const extended = engine.completePIP(pip.id, 'extended', { extraDays: 30, reason: 'Improvement noticed' });
  assert.equal(extended.status, 'extended');
  assert.equal(extended.extensions.length, 1);

  // Final outcome — completed successfully
  const completed = engine.completePIP(pip.id, 'completed', { notes: 'Met all KPIs' });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.outcome.outcome, 'completed');
  assert.equal(completed.milestones.length, 2);
});

// ═════════════════════════════════════════════════════════════
// 19. PIP duration clamped to 90..180 days
// ═════════════════════════════════════════════════════════════
test('19. PIP duration is clamped to 90..180 days (Israeli case-law)', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-clamp',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
    managerId: 'mgr-1',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 2, collab: 2, delivery: 2 },
  });
  // Try to ask for 30 days — should be clamped UP to 90.
  const tooShort = engine.triggerPIP(rev.id, { severity: 'moderate', durationDays: 30 });
  assert.equal(tooShort.durationDays, MIN_PIP_DAYS);
  // Try to ask for 365 days — should be clamped DOWN to 180.
  const tooLong = engine.triggerPIP(rev.id, { severity: 'critical', durationDays: 365 });
  assert.equal(tooLong.durationDays, MAX_PIP_DAYS);
});

// ═════════════════════════════════════════════════════════════
// 20. history — multi-year roll-up + trend
// ═════════════════════════════════════════════════════════════
test('20. history returns full multi-year history with trend', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  // 3 reviews across 3 periods, ascending performance
  const periods = ['2024-H1', '2025-H1', '2026-H1'];
  const scores = [3, 4, 5];
  for (let i = 0; i < periods.length; i += 1) {
    const r = engine.scheduleReview({
      employeeId: 'emp-hist',
      templateId: 'tpl-eng-2026',
      reviewerId: 'mgr-1',
      period: periods[i],
      dueDate: `${periods[i].slice(0, 4)}-06-30`,
      managerId: 'mgr-1',
    });
    engine.submitReview({
      reviewId: r.id,
      scores: { tech: scores[i], collab: scores[i], delivery: scores[i] },
    });
    advance(180);
  }
  const h = engine.history('emp-hist');
  assert.equal(h.total, 3);
  assert.ok(h.byYear['2024']);
  assert.ok(h.byYear['2025']);
  assert.ok(h.byYear['2026']);
  // Trend: from 0.6 → 1.0 = +0.4 normalized
  assert.ok(h.trend > 0, 'trend should be positive');
  assert.ok(Math.abs(h.trend - 0.4) < 0.001);
});

// ═════════════════════════════════════════════════════════════
// 21. generateReport — bilingual labels + filter
// ═════════════════════════════════════════════════════════════
test('21. generateReport produces bilingual roll-up with filter', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  // Two departments
  for (let i = 0; i < 4; i += 1) {
    const r = engine.scheduleReview({
      employeeId: `emp-eng-${i}`,
      templateId: 'tpl-eng-2026',
      reviewerId: 'mgr-eng',
      period: '2026-H1',
      dueDate: '2026-06-30',
      departmentId: 'eng',
      managerId: 'mgr-eng',
    });
    engine.submitReview({
      reviewId: r.id,
      scores: { tech: 4, collab: 4, delivery: 4 },
    });
  }
  for (let i = 0; i < 2; i += 1) {
    const r = engine.scheduleReview({
      employeeId: `emp-ops-${i}`,
      templateId: 'tpl-eng-2026',
      reviewerId: 'mgr-ops',
      period: '2026-H1',
      dueDate: '2026-06-30',
      departmentId: 'ops',
      managerId: 'mgr-ops',
    });
    engine.submitReview({
      reviewId: r.id,
      scores: { tech: 3, collab: 3, delivery: 3 },
    });
  }

  const all = engine.generateReport('2026-H1');
  assert.equal(all.counts.total, 6);
  assert.equal(all.counts.submitted, 6);
  assert.ok(all.labels.he.title.includes('דו"ח'));
  assert.ok(all.labels.en.title.includes('Report'));

  const engOnly = engine.generateReport('2026-H1', { departmentId: 'eng' });
  assert.equal(engOnly.counts.total, 4);
  assert.equal(engOnly.averageOverall, 4);

  const opsOnly = engine.generateReport('2026-H1', { managerId: 'mgr-ops' });
  assert.equal(opsOnly.counts.total, 2);
  assert.equal(opsOnly.averageOverall, 3);
});

// ═════════════════════════════════════════════════════════════
// 22. archive — soft-archive only
// ═════════════════════════════════════════════════════════════
test('22. archive cannot run on unsubmitted; archived review is preserved', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-arch',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
  });
  // Cannot archive a scheduled (unsubmitted) review.
  assert.throws(() => engine.archive(rev.id, 'no longer needed'), /unsubmitted/);
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 3, collab: 3, delivery: 3 },
  });
  const archived = engine.archive(rev.id, 'duplicate of rev-2');
  assert.equal(archived.status, STATUS.ARCHIVED);
  // History method still surfaces archived reviews
  const h = engine.history('emp-arch');
  assert.equal(h.total, 1);
  assert.equal(h.reviews[0].status, STATUS.ARCHIVED);
});

// ═════════════════════════════════════════════════════════════
// 23. Status monotonicity — Kobi's law
// ═════════════════════════════════════════════════════════════
test('23. status transitions are monotonic forward — never roll back', () => {
  const engine = makeEngine();
  defaultTemplate(engine);
  const rev = engine.scheduleReview({
    employeeId: 'emp-mono',
    templateId: 'tpl-eng-2026',
    reviewerId: 'mgr-1',
    period: '2026-H1',
    dueDate: '2026-06-30',
    managerId: 'mgr-1',
  });
  engine.submitReview({
    reviewId: rev.id,
    scores: { tech: 5, collab: 5, delivery: 5 },
  });
  // Calibrate forward
  engine.calibrate({ managerId: 'mgr-1', period: '2026-H1' });
  const stored = engine.getReview(rev.id);
  assert.equal(stored.status, STATUS.CALIBRATED);
  assert.ok(stored.statusHistory.length >= 3);
  // Sequence must be strictly increasing
  const order = ['draft', 'scheduled', 'submitted', 'calibrated'];
  let lastIdx = -1;
  for (const entry of stored.statusHistory) {
    const idx = order.indexOf(entry.status);
    if (idx >= 0) {
      assert.ok(idx >= lastIdx, `status went backwards: ${entry.status} after index ${lastIdx}`);
      lastIdx = idx;
    }
  }
});
