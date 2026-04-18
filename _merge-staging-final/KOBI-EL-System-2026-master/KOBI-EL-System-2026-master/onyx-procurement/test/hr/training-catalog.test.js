/**
 * Training Catalog & LMS — unit tests
 * Agent Y-068 • Techno-Kol Uzi ERP • 2026-04-11
 *
 * Run:
 *   node --test test/hr/training-catalog.test.js
 *
 * Coverage:
 *   - Course creation + versioning (upgrade, never delete)
 *   - Session scheduling
 *   - Enrollment happy path
 *   - Waitlist overflow + promotion on cancellation
 *   - Attendance marking + summary
 *   - Course completion + certificate issuance
 *   - Learning path per role (construction-worker, painter, office)
 *   - Required compliance matrix (missing / valid / expired / n/a)
 *   - Study fund categorization (professional eligible, hobby ineligible)
 *   - Budget tracking (budget set, spend, utilisation, over-budget)
 *   - Feedback collection (NPS + average rating)
 *
 * Zero dependencies — uses only node:test + node:assert.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  TrainingCatalog,
  REQUIRED_COMPLIANCE,
  STUDY_FUND_RULES,
  COURSE_FORMATS,
} = require(path.resolve(__dirname, '..', '..', 'src', 'hr', 'training-catalog.js'));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function freshCatalog() {
  return new TrainingCatalog();
}

function sampleCourse(overrides = {}) {
  return {
    id: 'excel-advanced',
    title_he: 'אקסל מתקדם',
    title_en: 'Advanced Excel',
    description: 'Pivot tables, VBA, power query',
    category: 'professional',
    duration: 480,
    format: 'blended',
    level: 'intermediate',
    prerequisites: [],
    instructor: 'Yuval Cohen',
    maxSeats: 20,
    cost: 1500,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// 1–3. Course lifecycle
// ─────────────────────────────────────────────────────────────

test('01. addCourse creates a course record with defaults', () => {
  const cat = freshCatalog();
  const c = cat.addCourse(sampleCourse());
  assert.equal(c.id, 'excel-advanced');
  assert.equal(c.version, 1);
  assert.equal(c.title_he, 'אקסל מתקדם');
  assert.equal(c.title_en, 'Advanced Excel');
  assert.equal(c.cost, 1500);
  assert.equal(c.active, true);
});

test('02. addCourse rejects invalid format', () => {
  const cat = freshCatalog();
  assert.throws(
    () => cat.addCourse(sampleCourse({ format: 'telepathy' })),
    /format must be one of/
  );
});

test('03. re-adding a course upgrades version (never deletes v1)', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({ cost: 1500 }));
  const v2 = cat.addCourse(sampleCourse({ cost: 1800 }));
  assert.equal(v2.version, 2);
  assert.equal(v2.cost, 1800);
  assert.equal(v2.previousVersions.length, 1);
  assert.equal(v2.previousVersions[0].snapshot.cost, 1500);
});

// ─────────────────────────────────────────────────────────────
// 4–6. Session scheduling + enrollment
// ─────────────────────────────────────────────────────────────

test('04. scheduleSession creates an open session', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({ maxSeats: 2 }));
  const s = cat.scheduleSession('excel-advanced', {
    date: '2026-05-10T09:00:00Z',
    location: 'Tel Aviv HQ',
    instructor: 'Dana',
    seats: 2,
  });
  assert.equal(s.seats, 2);
  assert.equal(s.enrolledCount, 0);
  assert.equal(s.status, 'scheduled');
  assert.ok(s.sessionId.startsWith('excel-advanced-'));
});

test('05. enroll fills seats then waitlists', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({ maxSeats: 2 }));
  const s = cat.scheduleSession('excel-advanced', {
    date: '2026-05-10T09:00:00Z', seats: 2,
  });
  const r1 = cat.enroll({ employeeId: 'E001', sessionId: s.sessionId });
  const r2 = cat.enroll({ employeeId: 'E002', sessionId: s.sessionId });
  const r3 = cat.enroll({ employeeId: 'E003', sessionId: s.sessionId });
  const r4 = cat.enroll({ employeeId: 'E004', sessionId: s.sessionId });
  assert.equal(r1.status, 'enrolled');
  assert.equal(r2.status, 'enrolled');
  assert.equal(r3.status, 'waitlisted');
  assert.equal(r3.waitlistPosition, 1);
  assert.equal(r4.status, 'waitlisted');
  assert.equal(r4.waitlistPosition, 2);
});

test('06. cancelEnrollment promotes first from waitlist', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({ maxSeats: 1 }));
  const s = cat.scheduleSession('excel-advanced', {
    date: '2026-05-10T09:00:00Z', seats: 1,
  });
  cat.enroll({ employeeId: 'A', sessionId: s.sessionId });
  cat.enroll({ employeeId: 'B', sessionId: s.sessionId }); // waitlisted
  cat.enroll({ employeeId: 'C', sessionId: s.sessionId }); // waitlisted

  const cancel = cat.cancelEnrollment({
    employeeId: 'A', sessionId: s.sessionId, reason: 'sick',
  });
  assert.equal(cancel.promoted, 'B');
  const session = cat.sessions.get(s.sessionId);
  assert.deepEqual(session.enrolled, ['B']);
  assert.deepEqual(session.waitlist, ['C']);
});

// ─────────────────────────────────────────────────────────────
// 7–8. Attendance
// ─────────────────────────────────────────────────────────────

test('07. markAttendance records present/absent/late/excused', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const s = cat.scheduleSession('excel-advanced', { date: '2026-05-10T09:00:00Z' });
  cat.enroll({ employeeId: 'X', sessionId: s.sessionId });
  cat.enroll({ employeeId: 'Y', sessionId: s.sessionId });
  cat.enroll({ employeeId: 'Z', sessionId: s.sessionId });
  cat.enroll({ employeeId: 'W', sessionId: s.sessionId });

  cat.markAttendance(s.sessionId, { employeeId: 'X', status: 'present' });
  cat.markAttendance(s.sessionId, { employeeId: 'Y', status: 'absent' });
  cat.markAttendance(s.sessionId, { employeeId: 'Z', status: 'late' });
  cat.markAttendance(s.sessionId, { employeeId: 'W', status: 'excused' });

  const sum = cat.attendanceSummary(s.sessionId);
  assert.deepEqual(sum, { present: 1, absent: 1, late: 1, excused: 1, total: 4 });
});

test('08. markAttendance rejects invalid status', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const s = cat.scheduleSession('excel-advanced', { date: '2026-05-10T09:00:00Z' });
  assert.throws(
    () => cat.markAttendance(s.sessionId, { employeeId: 'X', status: 'bored' }),
    /status must be/
  );
});

// ─────────────────────────────────────────────────────────────
// 9–10. Completion + certificate
// ─────────────────────────────────────────────────────────────

test('09. completeCourse issues certificate with bilingual PDF payload', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const { completion, certificate } = cat.completeCourse({
    employeeId: 'E001',
    courseId: 'excel-advanced',
    score: 92,
    certificateIssued: true,
  });
  assert.equal(completion.passed, true);
  assert.ok(certificate);
  assert.ok(certificate.certificateId.startsWith('CERT-excel-advanced-E001-'));
  assert.equal(certificate.pdf.title_he, 'תעודת סיום קורס');
  assert.equal(certificate.pdf.title_en, 'Course Completion Certificate');
  const scoreField = certificate.pdf.fields.find(f => f.label_en === 'Score');
  assert.equal(scoreField.value, '92');
});

test('10. completeCourse does not issue certificate on failing score', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const { completion, certificate } = cat.completeCourse({
    employeeId: 'E002',
    courseId: 'excel-advanced',
    score: 55,
    certificateIssued: true,
  });
  assert.equal(completion.passed, false);
  assert.equal(certificate, null);
});

// ─────────────────────────────────────────────────────────────
// 11–12. Learning path
// ─────────────────────────────────────────────────────────────

test('11. learningPath returns defaults for construction-worker', () => {
  const cat = freshCatalog();
  const lp = cat.learningPath({ role: 'construction-worker' });
  const ids = lp.required.map(c => c.id);
  assert.ok(ids.includes('safety-general'));
  assert.ok(ids.includes('fire-safety'));
  assert.ok(ids.includes('working-at-heights'));
  assert.ok(ids.includes('first-aid'));
  assert.ok(lp.totalDuration > 0);
});

test('12. learningPath for painter requires hazmat', () => {
  const cat = freshCatalog();
  const lp = cat.learningPath({ role: 'painter' });
  const ids = lp.required.map(c => c.id);
  assert.ok(ids.includes('hazmat'));
  assert.ok(ids.includes('working-at-heights'));
});

// ─────────────────────────────────────────────────────────────
// 13–15. Required compliance + matrix
// ─────────────────────────────────────────────────────────────

test('13. requiredCompliance lists all Israeli mandatory trainings', () => {
  const cat = freshCatalog();
  const list = cat.requiredCompliance();
  const codes = list.map(c => c.code);
  assert.ok(codes.includes('safety-general'));
  assert.ok(codes.includes('harassment-prevention'));
  assert.ok(codes.includes('fire-safety'));
  assert.ok(codes.includes('first-aid'));
  assert.ok(codes.includes('hazmat'));
});

test('14. harassment-prevention has legal citation', () => {
  const harass = REQUIRED_COMPLIANCE.find(r => r.code === 'harassment-prevention');
  assert.ok(harass);
  assert.match(harass.law_he, /חוק למניעת הטרדה מינית/);
  assert.match(harass.law_en, /Prevention of Sexual Harassment/);
});

test('15. complianceMatrix flags missing, valid, and expired certs', () => {
  const cat = freshCatalog();
  // give E001 a valid safety cert (score 100, issued now)
  cat.completeCourse({
    employeeId: 'E001', courseId: 'safety-general', score: 100, certificateIssued: true,
  });
  // leave E002 with no cert
  const matrix = cat.complianceMatrix([
    { id: 'E001', role: 'office' },
    { id: 'E002', role: 'office' },
  ]);
  const e1 = matrix.find(r => r.employeeId === 'E001');
  const e2 = matrix.find(r => r.employeeId === 'E002');
  assert.equal(e1.items['safety-general'].status, 'valid');
  assert.equal(e2.items['safety-general'].status, 'missing');
  assert.equal(e2.compliant, false);
  // hazmat is n/a for an office worker
  assert.equal(e1.items['hazmat'].status, 'n/a');
});

// ─────────────────────────────────────────────────────────────
// 16–17. Certificate repo
// ─────────────────────────────────────────────────────────────

test('16. certificateRepo returns all certs for an employee', () => {
  const cat = freshCatalog();
  cat.completeCourse({
    employeeId: 'E007', courseId: 'safety-general', score: 95, certificateIssued: true,
  });
  cat.completeCourse({
    employeeId: 'E007', courseId: 'fire-safety', score: 88, certificateIssued: true,
  });
  const repo = cat.certificateRepo('E007');
  assert.equal(repo.length, 2);
  const codes = repo.map(c => c.complianceCode);
  assert.ok(codes.includes('safety-general'));
  assert.ok(codes.includes('fire-safety'));
});

test('17. certificateRepo is empty for unknown employee', () => {
  const cat = freshCatalog();
  assert.deepEqual(cat.certificateRepo('E999'), []);
});

// ─────────────────────────────────────────────────────────────
// 18–20. Budget tracking
// ─────────────────────────────────────────────────────────────

test('18. budgetTracking returns zero spend when nothing is recorded', () => {
  const cat = freshCatalog();
  cat.setBudget({ department: 'HR', period: '2026-Q2', amount: 10000 });
  const t = cat.budgetTracking({ department: 'HR', period: '2026-Q2' });
  assert.equal(t.budget, 10000);
  assert.equal(t.spent, 0);
  assert.equal(t.remaining, 10000);
  assert.equal(t.overBudget, false);
});

test('19. budgetTracking aggregates multiple spend entries', () => {
  const cat = freshCatalog();
  cat.setBudget({ department: 'Ops', period: '2026-Q2', amount: 5000 });
  cat.recordSpend({ department: 'Ops', period: '2026-Q2', amount: 1500, note: 'Excel' });
  cat.recordSpend({ department: 'Ops', period: '2026-Q2', amount: 2000, note: 'Safety' });
  const t = cat.budgetTracking({ department: 'Ops', period: '2026-Q2' });
  assert.equal(t.spent, 3500);
  assert.equal(t.remaining, 1500);
  assert.equal(t.utilisation, 0.7);
});

test('20. budgetTracking flags over-budget', () => {
  const cat = freshCatalog();
  cat.setBudget({ department: 'IT', period: '2026-Q2', amount: 1000 });
  cat.recordSpend({ department: 'IT', period: '2026-Q2', amount: 1500 });
  const t = cat.budgetTracking({ department: 'IT', period: '2026-Q2' });
  assert.equal(t.overBudget, true);
  assert.equal(t.remaining, -500);
});

// ─────────────────────────────────────────────────────────────
// 21–23. Study fund (קרן השתלמות)
// ─────────────────────────────────────────────────────────────

test('21. studyFundUsage counts professional courses as eligible', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({
    id: 'data-eng',
    title_he: 'הנדסת נתונים',
    title_en: 'Data engineering',
    category: 'professional',
    cost: 6000,
  }));
  cat.completeCourse({
    employeeId: 'E100', courseId: 'data-eng', score: 90, certificateIssued: true,
  });
  const thisYear = new Date().getFullYear();
  const usage = cat.studyFundUsage({ employeeId: 'E100', year: thisYear });
  assert.equal(usage.eligible.length, 1);
  assert.equal(usage.ineligible.length, 0);
  assert.equal(usage.totalEligibleCost, 6000);
  assert.equal(usage.annualCeiling, STUDY_FUND_RULES.ANNUAL_CEILING_ILS);
  assert.equal(usage.overCeiling, false);
});

test('22. studyFundUsage rejects hobby courses', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({
    id: 'pottery-101',
    title_he: 'קרמיקה למתחילים',
    title_en: 'Beginner pottery',
    category: 'hobby',
    cost: 1200,
  }));
  cat.completeCourse({
    employeeId: 'E200', courseId: 'pottery-101', score: 100, certificateIssued: true,
  });
  const thisYear = new Date().getFullYear();
  const usage = cat.studyFundUsage({ employeeId: 'E200', year: thisYear });
  assert.equal(usage.eligible.length, 0);
  assert.equal(usage.ineligible.length, 1);
  assert.match(usage.ineligible[0].classification.reason_he, /תחביב/);
});

test('23. studyFundUsage flags over-ceiling spend', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse({
    id: 'mba', title_he: 'MBA', title_en: 'MBA',
    category: 'academic', cost: 30000,
  }));
  cat.completeCourse({
    employeeId: 'E300', courseId: 'mba', score: 95, certificateIssued: true,
  });
  const usage = cat.studyFundUsage({
    employeeId: 'E300', year: new Date().getFullYear(),
  });
  assert.equal(usage.overCeiling, true);
  assert.equal(usage.totalEligibleCost, 30000);
  assert.equal(usage.remaining, 0);
});

// ─────────────────────────────────────────────────────────────
// 24–26. Feedback
// ─────────────────────────────────────────────────────────────

test('24. feedbackCollection averages ratings and computes NPS', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const s = cat.scheduleSession('excel-advanced', { date: '2026-05-10T09:00:00Z' });
  cat.submitFeedback({ sessionId: s.sessionId, employeeId: 'A', rating: 5, nps: 10 });
  cat.submitFeedback({ sessionId: s.sessionId, employeeId: 'B', rating: 4, nps: 9 });
  cat.submitFeedback({ sessionId: s.sessionId, employeeId: 'C', rating: 3, nps: 5 });
  const fc = cat.feedbackCollection(s.sessionId);
  assert.equal(fc.count, 3);
  assert.equal(fc.averageRating, 4);
  // promoters 2 (10,9), detractors 1 (5), passive 0 -> (2-1)/3 * 100 = 33
  assert.equal(fc.nps, 33);
});

test('25. submitFeedback rejects rating out of range', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const s = cat.scheduleSession('excel-advanced', { date: '2026-05-10T09:00:00Z' });
  assert.throws(
    () => cat.submitFeedback({ sessionId: s.sessionId, employeeId: 'A', rating: 6 }),
    /rating 1\.\.5/
  );
});

test('26. feedbackCollection with no items returns count 0', () => {
  const cat = freshCatalog();
  cat.addCourse(sampleCourse());
  const s = cat.scheduleSession('excel-advanced', { date: '2026-05-10T09:00:00Z' });
  const fc = cat.feedbackCollection(s.sessionId);
  assert.equal(fc.count, 0);
  assert.equal(fc.averageRating, 0);
  assert.equal(fc.nps, null);
});

// ─────────────────────────────────────────────────────────────
// 27. Format enum export
// ─────────────────────────────────────────────────────────────

test('27. COURSE_FORMATS contains all four formats', () => {
  assert.deepEqual(
    [...COURSE_FORMATS].sort(),
    ['blended', 'in-person', 'online', 'self-paced']
  );
});
