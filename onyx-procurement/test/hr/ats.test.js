/**
 * Tests — Applicant Tracking System (ATS)
 * Agent Y-061 • Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency — uses only node:assert and node:test.
 * Covers: requisition creation + version bumping, blind-review
 * pseudonymization, funnel/pipeline metrics, feedback scoring
 * range guards, bilingual offer letter rendering, time-to-hire,
 * rejection-preserves-record, anti-discrimination invariants.
 *
 * Run: node --test test/hr/ats.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ATS,
  REQ_STATUS,
  CANDIDATE_STATUS,
  STAGES,
  CHANNELS,
  INTERVIEW_TYPES,
  COMPETENCIES,
  COMPETENCY_KEYS,
  LABELS,
  pseudonymize,
  blindCopy,
  createMemoryStore,
} = require('../../src/hr/ats.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-11T08:00:00.000Z');

function makeATS(opts = {}) {
  let tick = 0;
  return new ATS({
    // Each call advances time slightly so timestamps are unique &
    // tests for "first acceptance" are deterministic.
    now: () => new Date(FIXED_NOW.getTime() + (tick++ * 60_000)),
    store: createMemoryStore(),
    ...opts,
  });
}

function makeReqInput(overrides = {}) {
  return {
    title_he: 'מהנדס ייצור בכיר',
    title_en: 'Senior Production Engineer',
    department: 'Production',
    level: 'Senior',
    grade: 'L5',
    location: 'Petah Tikva',
    hiringManagerId: 'mgr_001',
    budget: 28000,
    opening_date: new Date('2026-04-01T00:00:00Z'),
    target_date: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    name: 'דנה לוי',
    email: 'dana@example.co.il',
    phone: '050-9876543',
    resume: 'B.Sc. Mechanical Engineering, 7 yrs CNC, ISO9001',
    coverLetter: 'אני מתעניינת מאוד במשרה...',
    source: 'LinkedIn',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// REQUISITIONS
// ══════════════════════════════════════════════════════════════════

test('createRequisition — creates v1 with all fields and append-only versions', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  assert.ok(req.id.startsWith('req_'));
  assert.equal(req.status, REQ_STATUS.OPEN);
  assert.equal(req.versions.length, 1);
  assert.equal(req.versions[0].version, 1);
  assert.equal(req.versions[0].title_he, 'מהנדס ייצור בכיר');
  assert.equal(req.versions[0].title_en, 'Senior Production Engineer');
  assert.equal(req.versions[0].budget, 28000);
});

test('createRequisition — required fields enforced', () => {
  const ats = makeATS();
  assert.throws(() => ats.createRequisition({}), /Missing requisition fields/);
  assert.throws(
    () => ats.createRequisition({ title_he: 'a', title_en: 'a' }),
    /Missing requisition fields/,
  );
});

test('editRequisition — appends new version, never overwrites v1', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  ats.editRequisition(req.id, { budget: 32000 }, 'mgr_001');
  ats.editRequisition(req.id, { location: 'Tel Aviv' }, 'mgr_001');

  assert.equal(req.versions.length, 3);
  assert.equal(req.versions[0].version, 1);
  assert.equal(req.versions[0].budget, 28000);     // immutable v1
  assert.equal(req.versions[2].budget, 32000);
  assert.equal(req.versions[2].location, 'Tel Aviv');
});

// ══════════════════════════════════════════════════════════════════
// PUBLICATION
// ══════════════════════════════════════════════════════════════════

test('publishJob — multi-channel publish + idempotent re-publish', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  ats.publishJob(req.id, [CHANNELS.LINKEDIN, CHANNELS.DRUSHIM]);
  assert.equal(req.status, REQ_STATUS.PUBLISHED);
  assert.deepEqual(req.channels.sort(), ['Drushim', 'LinkedIn']);

  // Re-publish to LinkedIn — should NOT duplicate channel name
  ats.publishJob(req.id, [CHANNELS.LINKEDIN, CHANNELS.ALLJOBS]);
  assert.equal(req.channels.filter((c) => c === 'LinkedIn').length, 1);
  assert.ok(req.channels.includes('AllJobs'));
});

test('publishJob — rejects unknown channels', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  assert.throws(() => ats.publishJob(req.id, ['Facebook']), /Invalid channels/);
});

// ══════════════════════════════════════════════════════════════════
// APPLICATIONS + BLIND REVIEW
// ══════════════════════════════════════════════════════════════════

test('receiveApplication — stores PII separately and starts at APPLIED stage', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({
    reqId: req.id,
    candidate: makeCandidate(),
  });

  assert.ok(cand.id.startsWith('cand_'));
  assert.equal(cand.stage, STAGES.APPLIED);
  assert.equal(cand.status, CANDIDATE_STATUS.ACTIVE);
  assert.equal(cand.raw.email, 'dana@example.co.il');
  assert.ok(cand.pseudonym.startsWith('CAND-'));
  assert.equal(req.candidates.length, 1);
});

test('receiveApplication — blind review pseudonymizes reviewer view', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({
    reqId: req.id,
    candidate: makeCandidate(),
    blindReview: true,
  });

  // Reviewer view: NO PII
  const view = ats.candidateView(cand.id, { audience: 'reviewer' });
  assert.equal(view.email, null);
  assert.equal(view.phone, null);
  assert.equal(view.source, null);
  assert.equal(view.name, view.code);
  assert.ok(view.code.startsWith('CAND-'));
  // Resume content remains visible
  assert.ok(view.resume.includes('CNC'));

  // Staff view (no blind override) sees full PII
  const staffView = ats.candidateView(cand.id, { audience: 'staff' });
  assert.equal(staffView.email, 'dana@example.co.il');
  assert.equal(staffView.name, 'דנה לוי');
});

test('pseudonymize — deterministic across calls, unique per email', () => {
  const a1 = pseudonymize('a@x.com');
  const a2 = pseudonymize('a@x.com');
  const b1 = pseudonymize('b@x.com');
  assert.equal(a1, a2);
  assert.notEqual(a1, b1);
  assert.ok(a1.startsWith('CAND-'));
});

// ══════════════════════════════════════════════════════════════════
// SCREENING
// ══════════════════════════════════════════════════════════════════

test('screenCandidate — pass advances stage and stores append-only history', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });

  ats.screenCandidate(cand.id, { passed: true, notes: 'good fit', reviewerId: 'rec_01' });

  assert.equal(cand.stage, STAGES.SCREENED);
  assert.equal(cand.screenings.length, 1);
  assert.equal(cand.screenings[0].passed, true);
  // stageHistory has both APPLIED and SCREENED
  const stages = cand.stageHistory.map((h) => h.stage);
  assert.deepEqual(stages, [STAGES.APPLIED, STAGES.SCREENED]);
});

test('screenCandidate — fail rejects but preserves record', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });

  ats.screenCandidate(cand.id, { passed: false, notes: 'no match', reviewerId: 'rec_01' });
  assert.equal(cand.status, CANDIDATE_STATUS.REJECTED);
  assert.equal(cand.stage, STAGES.REJECTED);
  // Record still exists
  assert.ok(ats.store.candidates.has(cand.id));
  assert.ok(cand.rejection);
  assert.equal(cand.rejection.stage, STAGES.SCREENED);
});

// ══════════════════════════════════════════════════════════════════
// INTERVIEWS + FEEDBACK
// ══════════════════════════════════════════════════════════════════

test('scheduleInterview — creates interview, transitions stage to INTERVIEWED', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.screenCandidate(cand.id, { passed: true, reviewerId: 'rec_01' });

  const intv = ats.scheduleInterview({
    candId: cand.id,
    round: 1,
    interviewers: ['mgr_001', 'mgr_002'],
    date: new Date('2026-04-20T09:00Z'),
    type: INTERVIEW_TYPES.TECHNICAL,
  });

  assert.ok(intv.id.startsWith('int_'));
  assert.equal(intv.type, 'technical');
  assert.equal(intv.interviewers.length, 2);
  assert.equal(cand.stage, STAGES.INTERVIEWED);
});

test('scheduleInterview — rejects unknown type and missing interviewers', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  assert.throws(
    () => ats.scheduleInterview({
      candId: cand.id, round: 1, interviewers: ['x'],
      date: new Date('2026-04-20'), type: 'lunch_chat',
    }),
    /Invalid interview type/,
  );
  assert.throws(
    () => ats.scheduleInterview({
      candId: cand.id, round: 1, interviewers: [],
      date: new Date('2026-04-20'), type: INTERVIEW_TYPES.PHONE,
    }),
    /At least one interviewer/,
  );
});

test('recordFeedback — accepts 1-5 scores, computes average, append-only', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.screenCandidate(cand.id, { passed: true, reviewerId: 'rec_01' });
  const intv = ats.scheduleInterview({
    candId: cand.id, round: 1, interviewers: ['mgr_001'],
    date: new Date('2026-04-20T09:00Z'), type: INTERVIEW_TYPES.TECHNICAL,
  });

  const fb = ats.recordFeedback({
    interviewId: intv.id,
    reviewerId: 'mgr_001',
    scores: { technical: 5, communication: 4, problem: 5, teamwork: 4, culture: 4 },
    notes: 'strong technical, calm under pressure',
    recommendation: 'hire',
  });

  assert.equal(fb.averageScore, 4.4);
  assert.equal(fb.scores.technical, 5);
  assert.equal(cand.feedbacks.length, 1);

  // Second feedback by another reviewer — both preserved
  ats.recordFeedback({
    interviewId: intv.id,
    reviewerId: 'mgr_002',
    scores: { technical: 4, communication: 5, problem: 4, teamwork: 5, culture: 5 },
    recommendation: 'hire',
  });
  assert.equal(cand.feedbacks.length, 2);
});

test('recordFeedback — out-of-range scores rejected', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  const intv = ats.scheduleInterview({
    candId: cand.id, round: 1, interviewers: ['mgr_001'],
    date: new Date('2026-04-20T09:00Z'), type: INTERVIEW_TYPES.PHONE,
  });
  assert.throws(
    () => ats.recordFeedback({
      interviewId: intv.id, reviewerId: 'mgr_001',
      scores: { technical: 6 },
    }),
    /out of range/,
  );
  assert.throws(
    () => ats.recordFeedback({
      interviewId: intv.id, reviewerId: 'mgr_001',
      scores: { technical: 0 },
    }),
    /out of range/,
  );
});

// ══════════════════════════════════════════════════════════════════
// OFFER LETTER (BILINGUAL)
// ══════════════════════════════════════════════════════════════════

test('makeOffer — generates bilingual letter with EEO clause and salary', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  const offer = ats.makeOffer({
    candId: cand.id,
    reqId: req.id,
    salary: 30000,
    startDate: new Date('2026-05-01T00:00Z'),
    signingBonus: 10000,
    equity: { shares: 5000, vesting: '4y/1y cliff' },
  });

  assert.ok(offer.id.startsWith('off_'));
  assert.equal(offer.salary, 30000);

  // Hebrew letter — has Hebrew title, EEO note, currency
  assert.ok(offer.letter.he.includes('הצעת עבודה רשמית'));
  assert.ok(offer.letter.he.includes('₪30,000'));
  assert.ok(offer.letter.he.includes('שלום דנה לוי'));
  assert.ok(offer.letter.he.includes('חוק שוויון ההזדמנויות'));

  // English letter — has English title, EEO note, currency
  assert.ok(offer.letter.en.includes('Formal Offer of Employment'));
  assert.ok(offer.letter.en.includes('₪30,000'));
  assert.ok(offer.letter.en.includes('Dear דנה לוי'));
  assert.ok(offer.letter.en.includes('Equal Employment Opportunities Law'));

  // Stage transitioned
  assert.equal(cand.stage, STAGES.OFFERED);
  assert.equal(cand.status, CANDIDATE_STATUS.PENDING);
});

test('recordDecision — accepted moves candidate to HIRED', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.makeOffer({
    candId: cand.id, reqId: req.id, salary: 28000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: cand.id, status: CANDIDATE_STATUS.ACCEPTED });
  assert.equal(cand.stage, STAGES.HIRED);
  assert.equal(cand.status, CANDIDATE_STATUS.ACCEPTED);
});

test('recordDecision — declined keeps record but does not promote to hired', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.makeOffer({
    candId: cand.id, reqId: req.id, salary: 28000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: cand.id, status: CANDIDATE_STATUS.DECLINED });
  assert.equal(cand.status, CANDIDATE_STATUS.DECLINED);
  assert.equal(cand.stage, STAGES.OFFERED); // didn't progress to HIRED
  assert.ok(ats.store.candidates.has(cand.id));
});

// ══════════════════════════════════════════════════════════════════
// REJECTION — never delete
// ══════════════════════════════════════════════════════════════════

test('rejectCandidate — flips status, preserves record + resume + history', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.screenCandidate(cand.id, { passed: true, reviewerId: 'rec_01' });
  const intv = ats.scheduleInterview({
    candId: cand.id, round: 1, interviewers: ['mgr_001'],
    date: new Date('2026-04-20T09:00Z'), type: INTERVIEW_TYPES.PHONE,
  });
  ats.recordFeedback({
    interviewId: intv.id, reviewerId: 'mgr_001',
    scores: { technical: 2, communication: 2 },
    recommendation: 'no_hire',
  });
  ats.rejectCandidate({
    candId: cand.id,
    reason: 'insufficient experience',
    stage: STAGES.INTERVIEWED,
  });

  assert.equal(cand.status, CANDIDATE_STATUS.REJECTED);
  assert.equal(cand.stage, STAGES.REJECTED);
  // Record survives
  assert.ok(ats.store.candidates.has(cand.id));
  // Resume preserved
  assert.ok(cand.resume.includes('CNC'));
  // Feedback preserved
  assert.equal(cand.feedbacks.length, 1);
  // Rejection metadata captured
  assert.equal(cand.rejection.reason, 'insufficient experience');
});

// ══════════════════════════════════════════════════════════════════
// PIPELINE / FUNNEL METRICS
// ══════════════════════════════════════════════════════════════════

test('pipeline — counts each stage reached, even after rejection', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());

  // Cand A — applied only
  ats.receiveApplication({ reqId: req.id, candidate: makeCandidate({ email: 'a@x.com' }) });
  // Cand B — screened then rejected
  const b = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate({ email: 'b@x.com' }) });
  ats.screenCandidate(b.id, { passed: true, reviewerId: 'r' });
  ats.rejectCandidate({ candId: b.id, reason: 'budget cut', stage: STAGES.SCREENED });
  // Cand C — full path to hired
  const c = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate({ email: 'c@x.com' }) });
  ats.screenCandidate(c.id, { passed: true, reviewerId: 'r' });
  const ic = ats.scheduleInterview({
    candId: c.id, round: 1, interviewers: ['m1'],
    date: new Date('2026-04-20T09:00Z'), type: INTERVIEW_TYPES.PHONE,
  });
  ats.recordFeedback({
    interviewId: ic.id, reviewerId: 'm1',
    scores: { technical: 5, culture: 5 }, recommendation: 'hire',
  });
  ats.makeOffer({
    candId: c.id, reqId: req.id, salary: 27000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: c.id, status: CANDIDATE_STATUS.ACCEPTED });

  const p = ats.pipeline(req.id);
  assert.equal(p.counts.applied, 3);
  assert.equal(p.counts.screened, 2);
  assert.equal(p.counts.interviewed, 1);
  assert.equal(p.counts.offered, 1);
  assert.equal(p.counts.hired, 1);
  assert.equal(p.counts.rejected, 1);
  // Conversion ratios
  assert.equal(p.conversion.applied_to_screened, 66.7);
  assert.equal(p.conversion.offered_to_hired, 100);
});

// ══════════════════════════════════════════════════════════════════
// DIVERSITY REPORT — k-anonymous
// ══════════════════════════════════════════════════════════════════

test('diversityReport — aggregates only, suppresses small buckets', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  for (let i = 0; i < 6; i++) {
    ats.receiveApplication({
      reqId: req.id,
      candidate: makeCandidate({ email: `f${i}@x.com`, voluntary_gender: 'female' }),
    });
  }
  for (let i = 0; i < 2; i++) {
    ats.receiveApplication({
      reqId: req.id,
      candidate: makeCandidate({ email: `m${i}@x.com`, voluntary_gender: 'male' }),
    });
  }

  const r = ats.diversityReport(req.id);
  assert.equal(r.total_applications, 8);
  // 6 ≥ 5 → reported as number
  assert.equal(r.voluntary_gender_breakdown.female, 6);
  // 2 < 5 → suppressed
  assert.equal(r.voluntary_gender_breakdown.male, '<5');
  assert.ok(r.note_he.includes('אנונימי'));
  assert.ok(r.note_en.includes('Aggregate'));
});

// ══════════════════════════════════════════════════════════════════
// TIME TO HIRE
// ══════════════════════════════════════════════════════════════════

test('timeToHire — days from opening_date to first acceptance', () => {
  const ats = new ATS({
    // Start clock at 2026-04-01; advance manually so the acceptance lands later
    now: ((arr) => () => arr.shift() || new Date('2026-04-30T00:00Z'))([
      new Date('2026-04-01T00:00Z'), // createRequisition (createdAt + v1.editedAt)
      new Date('2026-04-01T00:00Z'),
      new Date('2026-04-02T00:00Z'), // receiveApplication appliedAt
      new Date('2026-04-02T00:00Z'), // event ts
      new Date('2026-04-15T00:00Z'), // makeOffer createdAt
      new Date('2026-04-15T00:00Z'), // stage history
      new Date('2026-04-15T00:00Z'), // candidate offeredAt
      new Date('2026-04-15T00:00Z'), // event
      new Date('2026-04-20T00:00Z'), // recordDecision decisionAt
      new Date('2026-04-20T00:00Z'),
      new Date('2026-04-20T00:00Z'),
      new Date('2026-04-30T00:00Z'),
    ]),
    store: createMemoryStore(),
  });
  const req = ats.createRequisition(makeReqInput({
    opening_date: new Date('2026-04-01T00:00Z'),
  }));
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.makeOffer({
    candId: cand.id, reqId: req.id, salary: 30000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: cand.id, status: CANDIDATE_STATUS.ACCEPTED });

  const t = ats.timeToHire(req.id);
  assert.equal(typeof t.days, 'number');
  assert.ok(t.days >= 18 && t.days <= 20, 'time to hire ~19 days, got ' + t.days);
  assert.ok(t.firstAcceptance);
});

test('timeToHire — null when no acceptance yet', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  const t = ats.timeToHire(req.id);
  assert.equal(t.days, null);
  assert.equal(t.firstAcceptance, null);
});

// ══════════════════════════════════════════════════════════════════
// COHORT REPORT
// ══════════════════════════════════════════════════════════════════

test('cohortReport — aggregates hires by source and department in window', () => {
  const ats = makeATS();
  const req1 = ats.createRequisition(makeReqInput());
  const req2 = ats.createRequisition(makeReqInput({
    title_he: 'מנהל QA',
    title_en: 'QA Manager',
    department: 'Quality',
  }));

  // Two LinkedIn hires from Production
  for (const e of ['p1@x.com', 'p2@x.com']) {
    const c = ats.receiveApplication({
      reqId: req1.id,
      candidate: makeCandidate({ email: e, source: 'LinkedIn' }),
    });
    ats.makeOffer({
      candId: c.id, reqId: req1.id, salary: 25000,
      startDate: new Date('2026-05-01T00:00Z'),
    });
    ats.recordDecision({ candId: c.id, status: CANDIDATE_STATUS.ACCEPTED });
  }
  // One Drushim hire from Quality
  const q = ats.receiveApplication({
    reqId: req2.id,
    candidate: makeCandidate({ email: 'q1@x.com', source: 'Drushim' }),
  });
  ats.makeOffer({
    candId: q.id, reqId: req2.id, salary: 24000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: q.id, status: CANDIDATE_STATUS.ACCEPTED });

  const r = ats.cohortReport({
    from: new Date('2026-04-01'),
    to:   new Date('2026-05-01'),
  });
  assert.equal(r.totalHires, 3);
  assert.equal(r.bySource.LinkedIn, 2);
  assert.equal(r.bySource.Drushim, 1);
  assert.equal(r.byDepartment.Production, 2);
  assert.equal(r.byDepartment.Quality, 1);
});

// ══════════════════════════════════════════════════════════════════
// EVENT LOG — append-only
// ══════════════════════════════════════════════════════════════════

test('event log — every action appends, never mutates', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  const cand = ats.receiveApplication({ reqId: req.id, candidate: makeCandidate() });
  ats.screenCandidate(cand.id, { passed: true, reviewerId: 'r' });
  const intv = ats.scheduleInterview({
    candId: cand.id, round: 1, interviewers: ['m'],
    date: new Date('2026-04-20T09:00Z'), type: INTERVIEW_TYPES.PHONE,
  });
  ats.recordFeedback({
    interviewId: intv.id, reviewerId: 'm',
    scores: { technical: 4 }, recommendation: 'hire',
  });
  ats.makeOffer({
    candId: cand.id, reqId: req.id, salary: 28000,
    startDate: new Date('2026-05-01T00:00Z'),
  });
  ats.recordDecision({ candId: cand.id, status: CANDIDATE_STATUS.ACCEPTED });

  const events = ats.getEvents(cand.id);
  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    'application_received',
    'screened',
    'interview_scheduled',
    'feedback_recorded',
    'offer_made',
    'decision_recorded',
  ]);
  // Each event entry is frozen
  for (const e of events) {
    assert.ok(Object.isFrozen(e));
  }
});

// ══════════════════════════════════════════════════════════════════
// ANTI-DISCRIMINATION INVARIANTS
// ══════════════════════════════════════════════════════════════════

test('candidate schema has no protected-class slots (age, religion, etc.)', () => {
  const ats = makeATS();
  const req = ats.createRequisition(makeReqInput());
  // Caller passes a candidate stuffed with disallowed fields — they MUST
  // not appear on the stored record
  const cand = ats.receiveApplication({
    reqId: req.id,
    candidate: {
      ...makeCandidate(),
      age: 42,
      religion: 'jewish',
      nationality: 'IL',
      maritalStatus: 'married',
      disability: 'none',
    },
  });
  // raw object has only the four whitelisted PII slots
  const allowed = new Set(['name', 'email', 'phone', 'source']);
  for (const key of Object.keys(cand.raw)) {
    assert.ok(allowed.has(key), `Disallowed PII slot leaked: ${key}`);
  }
  // Top-level record must not store the discriminatory fields either
  assert.equal(cand.age, undefined);
  assert.equal(cand.religion, undefined);
  assert.equal(cand.nationality, undefined);
  assert.equal(cand.disability, undefined);
});

test('store has no delete/remove/clear method — לא מוחקים', () => {
  const store = createMemoryStore();
  assert.equal(typeof store.delete, 'undefined');
  assert.equal(typeof store.remove, 'undefined');
  assert.equal(typeof store.clear, 'undefined');
});

// ══════════════════════════════════════════════════════════════════
// BILINGUAL COVERAGE
// ══════════════════════════════════════════════════════════════════

test('every label and competency has bilingual {he,en}', () => {
  for (const key of Object.keys(LABELS)) {
    const lbl = LABELS[key];
    assert.ok(lbl.he, `${key} missing he`);
    assert.ok(lbl.en, `${key} missing en`);
  }
  for (const c of COMPETENCIES) {
    assert.ok(c.he, `${c.key} missing he`);
    assert.ok(c.en, `${c.key} missing en`);
    assert.ok(COMPETENCY_KEYS.includes(c.key));
  }
});

// ══════════════════════════════════════════════════════════════════
// BLIND COPY UTILITY
// ══════════════════════════════════════════════════════════════════

test('blindCopy — strips email, phone, source; preserves resume', () => {
  const view = blindCopy({
    id: 'cand_x',
    name: 'real name',
    email: 'a@x.com',
    phone: '050',
    source: 'LinkedIn',
    resume: 'lots of skills',
    coverLetter: 'hello',
  });
  assert.equal(view.email, null);
  assert.equal(view.phone, null);
  assert.equal(view.source, null);
  assert.notEqual(view.name, 'real name');
  assert.equal(view.blinded, true);
  assert.ok(view.resume.includes('skills'));
});
