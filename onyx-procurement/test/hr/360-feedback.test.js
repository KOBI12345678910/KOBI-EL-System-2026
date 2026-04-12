/**
 * 360-Feedback — Unit Tests
 * Techno-Kol Uzi mega-ERP • Agent Y-067
 *
 * Run with:   node --test test/hr/360-feedback.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  ThreeSixtyFeedback,
  CONSTANTS,
  LABELS,
  _internals,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'hr', '360-feedback.js'),
);

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function baseQuestions() {
  return [
    {
      id: 'q1',
      text_he: 'מוביל/ה בצורה אפקטיבית',
      text_en: 'Leads effectively',
      type: 'rating',
      scale: 5,
      competency: 'leadership',
    },
    {
      id: 'q2',
      text_he: 'תקשורת ברורה',
      text_en: 'Clear communication',
      type: 'rating',
      scale: 5,
      competency: 'communication',
    },
    {
      id: 'q3',
      text_he: 'מקצוענות טכנית',
      text_en: 'Technical excellence',
      type: 'rating',
      scale: 5,
      competency: 'technical',
    },
    {
      id: 'q4',
      text_he: 'מה היית משפר/ת?',
      text_en: 'What would you improve?',
      type: 'text',
    },
  ];
}

function baseRespondents() {
  return {
    self: true,
    manager: 'M1',
    skipLevel: 'SL1',
    peers: ['P1', 'P2', 'P3', 'P4'],
    reports: ['R1', 'R2', 'R3'],
    clients: ['C1', 'C2', 'C3'],
  };
}

function launchBasic(engine, overrides = {}) {
  return engine.launchSurvey({
    subject: 'E001',
    questions: baseQuestions(),
    respondents: baseRespondents(),
    deadline: '2026-05-01',
    cycle: '2026-H1',
    ...overrides,
  });
}

// ═════════════════════════════════════════════════════════════
// 1. launchSurvey + sendInvites
// ═════════════════════════════════════════════════════════════

test('launchSurvey: creates survey with normalized questions and respondent totals', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId, questionCount, expectedResponses } = launchBasic(eng);

  assert.ok(surveyId.startsWith('s360_'));
  assert.equal(questionCount, 4);
  // self + manager + skipLevel + 4 peers + 3 reports + 3 clients = 13
  assert.equal(expectedResponses, 13);
});

test('launchSurvey: validates required fields', () => {
  const eng = new ThreeSixtyFeedback();
  assert.throws(() =>
    eng.launchSurvey({
      subject: '',
      questions: baseQuestions(),
      respondents: baseRespondents(),
      deadline: '2026-05-01',
    }),
  );
  assert.throws(() =>
    eng.launchSurvey({
      subject: 'E1',
      questions: [],
      respondents: baseRespondents(),
      deadline: '2026-05-01',
    }),
  );
  assert.throws(() =>
    eng.launchSurvey({
      subject: 'E1',
      questions: baseQuestions(),
      respondents: null,
      deadline: '2026-05-01',
    }),
  );
  assert.throws(() =>
    eng.launchSurvey({
      subject: 'E1',
      questions: baseQuestions(),
      respondents: baseRespondents(),
      deadline: '',
    }),
  );
});

test('sendInvites: produces one bilingual envelope per respondent with unique tokens', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);
  const envelopes = eng.sendInvites(surveyId);

  assert.equal(envelopes.length, 13);
  const tokens = new Set();
  for (const env of envelopes) {
    assert.ok(env.subject.includes('360'));
    assert.ok(env.bodyHe.includes('/360/respond/'));
    assert.ok(env.bodyEn.includes('/360/respond/'));
    assert.ok(env.bodyHe.includes('2026-05-01'));
    assert.ok(env.bodyEn.includes('2026-05-01'));
    assert.ok(env.link.startsWith('/360/respond/'));
    assert.ok(env.token && env.token.length >= 16);
    tokens.add(env.token);
  }
  assert.equal(tokens.size, 13, 'all tokens must be unique');

  // stored tokens are hashed, not raw
  const stored = eng.invites.get(surveyId);
  assert.equal(stored.length, 13);
  for (const row of stored) {
    assert.ok(row.tokenHash);
    assert.ok(row.tokenHash.length === 64); // sha256 hex
    assert.equal(row.redeemed, false);
  }
});

test('sendInvites: groups match configured respondents', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);
  const envs = eng.sendInvites(surveyId);
  const groupCounts = envs.reduce((acc, e) => {
    acc[e.group] = (acc[e.group] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(groupCounts, {
    self: 1,
    manager: 1,
    skipLevel: 1,
    peers: 4,
    reports: 3,
    clients: 3,
  });
});

// ═════════════════════════════════════════════════════════════
// 2. collectResponse
// ═════════════════════════════════════════════════════════════

test('collectResponse: stores anonymized response and clamps ratings', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  const r = eng.collectResponse({
    surveyId,
    responderGroup: 'manager',
    answers: { q1: 6, q2: 3, q3: -1, q4: '  Great team player  ' },
  });
  assert.ok(r.stored);
  assert.ok(r.responseId.startsWith('r360_'));

  const row = eng.responses.get(surveyId)[0];
  // q1 clamped to 5, q3 clamped to 1
  assert.equal(row.answers.q1, 5);
  assert.equal(row.answers.q2, 3);
  assert.equal(row.answers.q3, 1);
  assert.equal(row.answers.q4, 'Great team player');
  // stored row never carries the respondent's identity
  assert.equal(row.group, 'manager');
  assert.equal('respondent' in row, false);
});

test('collectResponse: rejects unknown responder group', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);
  assert.throws(() =>
    eng.collectResponse({
      surveyId,
      responderGroup: 'alien',
      answers: { q1: 3 },
    }),
  );
});

test('collectResponse: token marks invite as redeemed (append-only)', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);
  const envs = eng.sendInvites(surveyId);
  const managerEnv = envs.find((e) => e.group === 'manager');

  eng.collectResponse({
    surveyId,
    responderGroup: 'manager',
    answers: { q1: 4 },
    token: managerEnv.token,
  });

  const stored = eng.invites.get(surveyId);
  const matching = stored.find(
    (row) =>
      row.tokenHash === _internals.hashToken(managerEnv.token),
  );
  assert.ok(matching);
  assert.equal(matching.redeemed, true);
  assert.ok(matching.redeemedAt);
});

// ═════════════════════════════════════════════════════════════
// 3. aggregateBySource
// ═════════════════════════════════════════════════════════════

test('aggregateBySource: averages per question per group with k-anonymity redaction', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  // self — n=1 — allowed (unconstrained)
  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 5, q2: 5, q3: 5 },
  });
  // manager — n=1 — must be redacted (below k=3)
  eng.collectResponse({
    surveyId,
    responderGroup: 'manager',
    answers: { q1: 2, q2: 2, q3: 2 },
  });
  // peers — n=3 — must be revealed
  for (const v of [3, 4, 5]) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: { q1: v, q2: v, q3: v },
    });
  }

  const agg = eng.aggregateBySource(surveyId);
  assert.equal(agg.questions.length, 3); // rating questions only

  const q1 = agg.questions.find((q) => q.id === 'q1');
  assert.equal(q1.byGroup.self.avg, 5);
  assert.equal(q1.byGroup.self.redacted, false);
  assert.equal(q1.byGroup.manager.avg, null);
  assert.equal(q1.byGroup.manager.redacted, true);
  assert.equal(q1.byGroup.peers.avg, 4); // (3+4+5)/3
  assert.equal(q1.byGroup.peers.redacted, false);
  assert.equal(q1.byGroup.reports.avg, null);
  assert.equal(q1.byGroup.reports.redacted, true);

  assert.deepEqual(agg.groupCounts, {
    self: 1,
    manager: 1,
    skipLevel: 0,
    peers: 3,
    reports: 0,
    clients: 0,
  });
});

// ═════════════════════════════════════════════════════════════
// 4. gapAnalysis
// ═════════════════════════════════════════════════════════════

test('gapAnalysis: classifies blind spots, hidden strengths and alignment', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  // self rates HIGH across the board
  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 5, q2: 2, q3: 4 },
  });
  // peers (n=3) — reveal this group
  //   q1 — blind spot: peers avg 3.0 vs self 5.0 -> gap = +2.0
  //   q2 — hidden strength: peers avg 4.0 vs self 2.0 -> gap = -2.0
  //   q3 — aligned: peers avg 4.0 vs self 4.0 -> gap = 0
  for (const set of [
    { q1: 3, q2: 4, q3: 4 },
    { q1: 3, q2: 4, q3: 4 },
    { q1: 3, q2: 4, q3: 4 },
  ]) {
    eng.collectResponse({ surveyId, responderGroup: 'peers', answers: set });
  }

  const gap = eng.gapAnalysis(surveyId);
  const byId = Object.fromEntries(gap.perQuestion.map((q) => [q.id, q]));

  assert.equal(byId.q1.classification, 'blind_spot');
  assert.equal(byId.q1.gap, 2);
  assert.equal(byId.q2.classification, 'hidden_strength');
  assert.equal(byId.q2.gap, -2);
  assert.equal(byId.q3.classification, 'aligned');
  assert.equal(byId.q3.gap, 0);

  assert.equal(gap.blindSpots.length, 1);
  assert.equal(gap.hiddenStrengths.length, 1);
  assert.equal(gap.alignment.length, 1);
  assert.equal(gap.blindSpots[0].id, 'q1');
  assert.equal(gap.hiddenStrengths[0].id, 'q2');
});

test('gapAnalysis: ignores redacted groups when computing "others" mean', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 5, q2: 5, q3: 5 },
  });
  // manager n=1 — redacted — must not contaminate "others"
  eng.collectResponse({
    surveyId,
    responderGroup: 'manager',
    answers: { q1: 1, q2: 1, q3: 1 },
  });
  // peers n=3 — revealed, all 4s
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: { q1: 4, q2: 4, q3: 4 },
    });
  }

  const gap = eng.gapAnalysis(surveyId);
  for (const g of gap.perQuestion) {
    // others must == 4.0 (only peers count), not (1+4)/2 = 2.5
    assert.equal(g.othersAvg, 4);
    assert.equal(g.gap, 1);
  }
});

// ═════════════════════════════════════════════════════════════
// 5. thematicAnalysis
// ═════════════════════════════════════════════════════════════

test('thematicAnalysis: bilingual keyword clustering drops stop-words and short tokens', () => {
  const eng = new ThreeSixtyFeedback();
  const responses = [
    'The team communication is great and the team is supportive',
    'Strong communication skills, strong team leadership',
    'Needs better delegation and more empowerment',
    'תקשורת מצוינת והובלה של הצוות בצורה מקצועית',
    'תקשורת טובה אבל חסרה האצלת סמכויות',
  ];
  const themes = eng.thematicAnalysis(responses, { topN: 5 });
  assert.ok(themes.length > 0);

  // stop-words should not appear
  const terms = themes.map((t) => t.term);
  for (const stop of ['the', 'and', 'is', 'של', 'את']) {
    assert.ok(!terms.includes(stop), `stop-word leaked: ${stop}`);
  }

  // "communication" must rank highly because it appears 3 times
  const comm = themes.find((t) => t.term === 'communication');
  assert.ok(comm, 'communication keyword expected');
  assert.ok(comm.count >= 2);

  // Hebrew term "תקשורת" must also be found (3 occurrences)
  const commHe = eng.thematicAnalysis(responses, { topN: 30 }).find(
    (t) => t.term === 'תקשורת',
  );
  assert.ok(commHe);
  assert.ok(commHe.count >= 2);

  // samples should be attached
  for (const t of themes) {
    assert.ok(Array.isArray(t.samples));
    assert.ok(t.samples.length > 0);
  }
});

test('thematicAnalysis: empty / blank input returns empty array', () => {
  const eng = new ThreeSixtyFeedback();
  assert.deepEqual(eng.thematicAnalysis([]), []);
  assert.deepEqual(eng.thematicAnalysis(['', '   ', null]), []);
});

// ═════════════════════════════════════════════════════════════
// 6. kForAnonymity
// ═════════════════════════════════════════════════════════════

test('kForAnonymity: enforces k=3 floor and reports unsafe groups', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  // self — 1 is fine (unconstrained)
  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 4 },
  });
  // manager — 1, unsafe
  eng.collectResponse({
    surveyId,
    responderGroup: 'manager',
    answers: { q1: 3 },
  });
  // peers — 3, safe
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: { q1: 4 },
    });
  }

  const k = eng.kForAnonymity(surveyId);
  assert.equal(k.k, 3);
  assert.equal(k.byGroup.self.meetsK, true);
  assert.equal(k.byGroup.manager.meetsK, false);
  assert.equal(k.byGroup.peers.meetsK, true);
  assert.equal(k.allMeetK, false);
  assert.ok(k.safeGroups.includes('self'));
  assert.ok(k.safeGroups.includes('peers'));
  assert.ok(k.unsafeGroups.includes('manager'));
});

test('kForAnonymity: custom threshold via constructor', () => {
  const eng = new ThreeSixtyFeedback({ kAnonymity: 5 });
  const { surveyId } = launchBasic(eng);
  for (let i = 0; i < 4; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: { q1: 4 },
    });
  }
  const k = eng.kForAnonymity(surveyId);
  assert.equal(k.k, 5);
  assert.equal(k.byGroup.peers.n, 4);
  assert.equal(k.byGroup.peers.meetsK, false); // 4 < 5
});

// ═════════════════════════════════════════════════════════════
// 7. SVG radar + PDF report + trend
// ═════════════════════════════════════════════════════════════

test('generateReport: produces SVG radar, bilingual summaries and PDF buffer', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);

  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 5, q2: 3, q3: 4, q4: 'I focus on execution' },
  });
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: {
        q1: 3,
        q2: 4,
        q3: 4,
        q4: 'Great communication and strong team skills',
      },
    });
  }
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'reports',
      answers: {
        q1: 3,
        q2: 4,
        q3: 3,
        q4: 'Empowers the team and clear direction',
      },
    });
  }

  const rep = eng.generateReport(surveyId);
  const svg = rep.competencyRadar.svg;
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('polygon')); // at least one polygon drawn
  assert.ok(svg.includes('Self /')); // legend present
  assert.ok(svg.includes('leadership') || svg.includes('מוביל'));

  // bilingual anonymity note exists
  assert.ok(rep.meta.anonymityNote.he.length > 0);
  assert.ok(rep.meta.anonymityNote.en.length > 0);

  // strengths / dev areas populated, suggestions bilingual
  assert.ok(Array.isArray(rep.strengths));
  assert.ok(Array.isArray(rep.developmentAreas));
  assert.ok(rep.suggestions.length > 0);
  for (const s of rep.suggestions) {
    assert.ok(s.he && s.en, 'suggestion must have Hebrew and English');
  }

  // PDF buffer is a valid PDF 1.4 document
  assert.ok(Buffer.isBuffer(rep.pdf));
  assert.ok(rep.pdf.length > 200);
  const head = rep.pdf.slice(0, 8).toString('latin1');
  assert.ok(head.startsWith('%PDF-1.4'));
  const tail = rep.pdf.slice(-6).toString('latin1');
  assert.ok(tail.includes('%%EOF'));
});

test('trendAcrossCycles: append-only history with per-competency deltas', () => {
  const eng = new ThreeSixtyFeedback();

  // ── cycle 1
  const c1 = launchBasic(eng, { cycle: '2026-H1' }).surveyId;
  eng.collectResponse({
    surveyId: c1,
    responderGroup: 'self',
    answers: { q1: 3, q2: 3, q3: 3 },
  });
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId: c1,
      responderGroup: 'peers',
      answers: { q1: 3, q2: 3, q3: 3 },
    });
  }
  eng.generateReport(c1);

  // ── cycle 2 — others improve by 1 point
  const c2 = launchBasic(eng, { cycle: '2026-H2' }).surveyId;
  eng.collectResponse({
    surveyId: c2,
    responderGroup: 'self',
    answers: { q1: 4, q2: 4, q3: 4 },
  });
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId: c2,
      responderGroup: 'peers',
      answers: { q1: 4, q2: 4, q3: 4 },
    });
  }
  eng.generateReport(c2);

  const trend = eng.trendAcrossCycles('E001');
  assert.equal(trend.length, 2);
  assert.equal(trend[0].cycle, '2026-H1');
  assert.equal(trend[1].cycle, '2026-H2');
  // deltas only on the second entry
  assert.deepEqual(trend[0].deltaVsPrev, {});
  assert.equal(trend[1].deltaVsPrev.leadership, 1);
  assert.equal(trend[1].deltaVsPrev.communication, 1);
  assert.equal(trend[1].deltaVsPrev.technical, 1);
});

test('history is append-only: previous cycle rows never overwritten', () => {
  const eng = new ThreeSixtyFeedback();
  const { surveyId } = launchBasic(eng);
  eng.collectResponse({
    surveyId,
    responderGroup: 'self',
    answers: { q1: 2 },
  });
  for (let i = 0; i < 3; i++) {
    eng.collectResponse({
      surveyId,
      responderGroup: 'peers',
      answers: { q1: 2 },
    });
  }
  eng.generateReport(surveyId);
  // regenerating the report should NOT shrink the history or rewrite it
  const before = eng.history.get('E001').length;
  eng.generateReport(surveyId);
  assert.equal(eng.history.get('E001').length, before + 1);
});

// ═════════════════════════════════════════════════════════════
// 8. Internals / sanity
// ═════════════════════════════════════════════════════════════

test('internals: tokenize handles Hebrew + drops stop-words', () => {
  const toks = _internals.tokenize('תקשורת טובה של הצוות but and team');
  assert.ok(toks.includes('תקשורת'));
  assert.ok(toks.includes('טובה'));
  assert.ok(toks.includes('הצוות'));
  assert.ok(toks.includes('team'));
  assert.ok(!toks.includes('של'));
  assert.ok(!toks.includes('but'));
  assert.ok(!toks.includes('and'));
});

test('internals: classifyGap thresholds', () => {
  assert.equal(_internals.classifyGap(null), 'unknown');
  assert.equal(_internals.classifyGap(1.0), 'blind_spot');
  assert.equal(_internals.classifyGap(1.5), 'blind_spot');
  assert.equal(_internals.classifyGap(-1.0), 'hidden_strength');
  assert.equal(_internals.classifyGap(-1.5), 'hidden_strength');
  assert.equal(_internals.classifyGap(0), 'aligned');
  assert.equal(_internals.classifyGap(0.5), 'aligned');
  assert.equal(_internals.classifyGap(-0.5), 'aligned');
});

test('constants & labels are bilingual and frozen', () => {
  assert.equal(CONSTANTS.K_ANONYMITY, 3);
  assert.ok(Object.isFrozen(CONSTANTS));
  assert.ok(LABELS.he.self && LABELS.en.self);
  assert.ok(LABELS.he.blind_spots && LABELS.en.blind_spots);
});
