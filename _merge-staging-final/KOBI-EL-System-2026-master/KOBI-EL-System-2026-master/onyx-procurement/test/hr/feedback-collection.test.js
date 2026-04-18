/**
 * Feedback Collection Engine — Unit Tests
 * Techno-Kol Uzi mega-ERP • Agent Y-134
 *
 * Run with:   node --test test/hr/feedback-collection.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  FeedbackCollection,
  CONSTANTS,
  LABELS,
  _internals,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'hr', 'feedback-collection.js'),
);

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function pulseQuestions() {
  return [
    {
      id: 'q1',
      text_he: 'איך הרגשת השבוע?',
      text_en: 'How did you feel this week?',
      type: 'rating',
      scale: 5,
    },
    {
      id: 'q2',
      text_he: 'האם עומס העבודה סביר?',
      text_en: 'Is your workload reasonable?',
      type: 'rating',
      scale: 5,
    },
    {
      id: 'q3',
      text_he: 'הערות חופשיות',
      text_en: 'Open comments',
      type: 'text',
    },
  ];
}

function mkEngine(opts = {}) {
  return new FeedbackCollection({
    salt: 'fixed-salt-for-tests',
    ...opts,
  });
}

// ─────────────────────────────────────────────────────────────
// 1. Pulse survey launch
// ─────────────────────────────────────────────────────────────

test('launchPulseSurvey creates a survey with bilingual questions and TTL', () => {
  const fb = mkEngine();
  const survey = fb.launchPulseSurvey({
    id: 'pulse-2026-w15',
    questions: pulseQuestions(),
    audienceFilter: { team: 'ops' },
    anonymous: true,
    ttlDays: 7,
  });
  assert.equal(survey.id, 'pulse-2026-w15');
  assert.equal(survey.anonymous, true);
  assert.equal(survey.questions.length, 3);
  assert.ok(survey.launchedAt);
  assert.ok(survey.expiresAt);
  assert.deepEqual(survey.audienceFilter, { team: 'ops' });
});

test('launchPulseSurvey rejects >5 questions and duplicate ids', () => {
  const fb = mkEngine();
  const tooMany = [];
  for (let i = 0; i < 6; i += 1) {
    tooMany.push({ id: `q${i}`, type: 'rating', scale: 5 });
  }
  assert.throws(
    () => fb.launchPulseSurvey({ id: 'p1', questions: tooMany }),
    /max 5/,
  );
  fb.launchPulseSurvey({
    id: 'p-dup',
    questions: pulseQuestions(),
  });
  assert.throws(
    () => fb.launchPulseSurvey({ id: 'p-dup', questions: pulseQuestions() }),
    /already exists/,
  );
});

// ─────────────────────────────────────────────────────────────
// 2. Response submission + anonymity
// ─────────────────────────────────────────────────────────────

test('submitResponse stores hash (not employeeId) for anonymous surveys', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({
    id: 'pulse-anon',
    questions: pulseQuestions(),
    anonymous: true,
  });
  fb.submitResponse({
    surveyId: 'pulse-anon',
    employeeId: 'E42',
    answers: { q1: 4, q2: 3, q3: 'מרגיש טוב' },
  });
  const rows = fb.responses.get('pulse-anon');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employeeId, undefined);
  assert.ok(rows[0].anonymousHash);
  assert.notEqual(rows[0].anonymousHash, 'E42');
});

test('submitResponse stores employeeId when survey is non-anonymous', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({
    id: 'pulse-named',
    questions: pulseQuestions(),
    anonymous: false,
  });
  fb.submitResponse({
    surveyId: 'pulse-named',
    employeeId: 'E42',
    answers: { q1: 5, q2: 5 },
  });
  const rows = fb.responses.get('pulse-named');
  assert.equal(rows[0].employeeId, 'E42');
  assert.equal(rows[0].anonymousHash, undefined);
});

test('submitResponse rejects answers to unknown questions', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'p', questions: pulseQuestions() });
  assert.throws(
    () => fb.submitResponse({
      surveyId: 'p',
      employeeId: 'E1',
      answers: { qZZ: 5 },
    }),
    /unknown question/,
  );
});

// ─────────────────────────────────────────────────────────────
// 3. Aggregation + trend
// ─────────────────────────────────────────────────────────────

test('aggregatePulse returns averages, distributions and text samples', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'p-agg', questions: pulseQuestions() });
  const employees = ['E1', 'E2', 'E3', 'E4', 'E5'];
  const scores = [5, 4, 4, 3, 5];
  employees.forEach((e, i) => {
    fb.submitResponse({
      surveyId: 'p-agg',
      employeeId: e,
      answers: { q1: scores[i], q2: scores[i] - 1, q3: 'good' },
    });
  });
  const agg = fb.aggregatePulse('p-agg');
  assert.equal(agg.responses, 5);
  assert.equal(agg.redacted, false);
  assert.ok(Math.abs(agg.perQuestion.q1.average - 4.2) < 1e-9);
  assert.equal(agg.perQuestion.q1.distribution[5], 2);
  assert.equal(agg.perQuestion.q1.distribution[4], 2);
  assert.equal(agg.perQuestion.q1.distribution[3], 1);
  assert.equal(agg.perQuestion.q3.textSamples.length, 5);
});

test('aggregatePulse redacts anonymous surveys below k-anonymity', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({
    id: 'pulse-small',
    questions: pulseQuestions(),
    anonymous: true,
  });
  fb.submitResponse({
    surveyId: 'pulse-small',
    employeeId: 'E1',
    answers: { q1: 5, q2: 5 },
  });
  fb.submitResponse({
    surveyId: 'pulse-small',
    employeeId: 'E2',
    answers: { q1: 4, q2: 4 },
  });
  const agg = fb.aggregatePulse('pulse-small');
  assert.equal(agg.redacted, true);
  assert.equal(agg.overallAverage, null);
  assert.equal(agg.perQuestion.q1.average, null);
});

test('aggregatePulse shows trend vs prior survey in same family', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'weekly-1', questions: pulseQuestions() });
  ['E1', 'E2', 'E3'].forEach((e) => fb.submitResponse({
    surveyId: 'weekly-1',
    employeeId: e,
    answers: { q1: 3, q2: 3 },
  }));
  fb.launchPulseSurvey({ id: 'weekly-2', questions: pulseQuestions() });
  ['E1', 'E2', 'E3'].forEach((e) => fb.submitResponse({
    surveyId: 'weekly-2',
    employeeId: e,
    answers: { q1: 4, q2: 4 },
  }));
  const agg = fb.aggregatePulse('weekly-2');
  assert.equal(agg.trend.previous, 'weekly-1');
  assert.ok(agg.trend.delta > 0.9 && agg.trend.delta < 1.1);
});

// ─────────────────────────────────────────────────────────────
// 4. Suggestion box
// ─────────────────────────────────────────────────────────────

test('submitSuggestion stores title, category and priority', () => {
  const fb = mkEngine();
  const sug = fb.submitSuggestion({
    category: 'office',
    title: 'להתקין מכונת קפה חדשה',
    description: 'הישנה לא עובדת',
    priority: 'high',
    submitterId: 'E10',
  });
  assert.ok(sug.id.startsWith('sug_'));
  assert.equal(sug.category, 'office');
  assert.equal(sug.priority, 'high');
  assert.equal(sug.status, 'submitted');
  assert.equal(sug.submitterId, 'E10');
});

test('voteOnSuggestion rejects double-voting by the same voter', () => {
  const fb = mkEngine();
  const sug = fb.submitSuggestion({
    category: 'tech',
    title: 'CI faster',
  });
  const first = fb.voteOnSuggestion({
    suggestionId: sug.id,
    voterId: 'E1',
    vote: 'up',
  });
  assert.equal(first.tally.up, 1);
  assert.throws(
    () => fb.voteOnSuggestion({
      suggestionId: sug.id,
      voterId: 'E1',
      vote: 'up',
    }),
    /already voted/,
  );
  // different voter is allowed
  fb.voteOnSuggestion({
    suggestionId: sug.id,
    voterId: 'E2',
    vote: 'down',
  });
  const list = fb.listSuggestions();
  assert.equal(list[0].tally.up, 1);
  assert.equal(list[0].tally.down, 1);
});

test('listSuggestions filters by status, category and minVotes', () => {
  const fb = mkEngine();
  const a = fb.submitSuggestion({ category: 'hr', title: 'A' });
  const b = fb.submitSuggestion({ category: 'hr', title: 'B' });
  const c = fb.submitSuggestion({ category: 'tech', title: 'C' });
  fb.voteOnSuggestion({ suggestionId: a.id, voterId: 'v1', vote: 'up' });
  fb.voteOnSuggestion({ suggestionId: a.id, voterId: 'v2', vote: 'up' });
  fb.voteOnSuggestion({ suggestionId: b.id, voterId: 'v3', vote: 'down' });
  const hrTop = fb.listSuggestions({ category: 'hr', minVotes: 1 });
  assert.equal(hrTop.length, 1);
  assert.equal(hrTop[0].id, a.id);
  const tech = fb.listSuggestions({ category: 'tech' });
  assert.equal(tech.length, 1);
  assert.equal(tech[0].id, c.id);
});

test('reviewSuggestion appends review history (append-only)', () => {
  const fb = mkEngine();
  const sug = fb.submitSuggestion({ category: 'ops', title: 'X' });
  fb.reviewSuggestion({
    suggestionId: sug.id,
    reviewerId: 'HR1',
    decision: 'under-review',
    comment: 'לבדוק עלות',
  });
  fb.reviewSuggestion({
    suggestionId: sug.id,
    reviewerId: 'HR1',
    decision: 'accepted',
    comment: 'מאושר',
  });
  const history = fb.suggestionHistory(sug.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].decision, 'under-review');
  assert.equal(history[1].decision, 'accepted');
  assert.equal(fb.suggestions.get(sug.id).status, 'accepted');
});

test('reviewSuggestion rejects invalid decisions', () => {
  const fb = mkEngine();
  const sug = fb.submitSuggestion({ category: 'ops', title: 'X' });
  assert.throws(
    () => fb.reviewSuggestion({
      suggestionId: sug.id,
      decision: 'cancelled',
    }),
    /decision must be one of/,
  );
});

// ─────────────────────────────────────────────────────────────
// 5. Retro lifecycle
// ─────────────────────────────────────────────────────────────

test('retro lifecycle: start → add items → close → tasks created', () => {
  const fb = mkEngine();
  const retro = fb.startRetroSession({
    teamId: 'TEAM-A',
    sprintOrPeriod: 'Sprint-24',
    moderator: 'MOD1',
  });
  fb.addRetroItem({
    retroId: retro.id,
    category: 'start',
    content: 'להתחיל קוד-רוויו קבוצתי',
    author: 'E1',
  });
  fb.addRetroItem({
    retroId: retro.id,
    category: 'stop',
    content: 'to stop midnight deploys',
    author: 'E2',
  });
  fb.addRetroItem({
    retroId: retro.id,
    category: 'continue',
    content: 'demo day',
    author: 'E3',
  });
  fb.addRetroItem({
    retroId: retro.id,
    category: 'action',
    content: 'לכתוב תיעוד לסקריפט הפריסה',
    author: 'E1',
  });
  fb.addRetroItem({
    retroId: retro.id,
    category: 'action',
    content: 'set up on-call rotation',
    author: 'E2',
  });
  const { retro: closed, newTasks } = fb.closeRetro(retro.id);
  assert.equal(closed.state, 'closed');
  assert.ok(closed.closedAt);
  assert.equal(newTasks.length, 2);
  assert.equal(newTasks[0].source, 'retro');
  assert.equal(newTasks[0].teamId, 'TEAM-A');
  // cannot add items after close
  assert.throws(
    () => fb.addRetroItem({
      retroId: retro.id,
      category: 'start',
      content: 'late',
    }),
    /closed/,
  );
});

test('retroHistory returns all retros for a team (append-only)', () => {
  const fb = mkEngine();
  const r1 = fb.startRetroSession({
    teamId: 'TEAM-B',
    sprintOrPeriod: 'S1',
    moderator: 'M',
  });
  fb.addRetroItem({
    retroId: r1.id,
    category: 'continue',
    content: 'good',
  });
  fb.closeRetro(r1.id);
  const r2 = fb.startRetroSession({
    teamId: 'TEAM-B',
    sprintOrPeriod: 'S2',
    moderator: 'M',
  });
  fb.addRetroItem({
    retroId: r2.id,
    category: 'stop',
    content: 'noise',
  });
  const hist = fb.retroHistory('TEAM-B');
  assert.equal(hist.length, 2);
  assert.equal(hist[0].retro.sprintOrPeriod, 'S1');
  assert.equal(hist[1].retro.sprintOrPeriod, 'S2');
  assert.equal(hist[1].items.length, 1);
});

test('addRetroItem respects anonymity flag', () => {
  const fb = mkEngine();
  const retro = fb.startRetroSession({
    teamId: 'T',
    sprintOrPeriod: 'S',
    moderator: 'M',
  });
  const item = fb.addRetroItem({
    retroId: retro.id,
    category: 'stop',
    content: 'burnout risk',
    author: 'E99',
    anonymous: true,
  });
  assert.equal(item.author, null);
  assert.ok(item.authorHash);
});

// ─────────────────────────────────────────────────────────────
// 6. Sentiment + escalation
// ─────────────────────────────────────────────────────────────

test('sentimentAnalysis classifies Hebrew and English text answers', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'p-sent', questions: pulseQuestions() });
  fb.submitResponse({
    surveyId: 'p-sent',
    employeeId: 'E1',
    answers: { q1: 5, q3: 'עבודה טובה ומעולה, תודה' },
  });
  fb.submitResponse({
    surveyId: 'p-sent',
    employeeId: 'E2',
    answers: { q1: 2, q3: 'this is terrible and slow, frustrated' },
  });
  fb.submitResponse({
    surveyId: 'p-sent',
    employeeId: 'E3',
    answers: { q1: 3, q3: 'fine' },
  });
  const s = fb.sentimentAnalysis('p-sent');
  assert.equal(s.total, 3);
  assert.equal(s.counts.positive, 1);
  assert.equal(s.counts.negative, 1);
  assert.equal(s.counts.neutral, 1);
  assert.ok(Math.abs(s.ratios.positive - 1 / 3) < 1e-9);
});

test('classifyText unit — positive / negative / neutral', () => {
  const { classifyText } = _internals;
  assert.equal(classifyText('מצוין עבודה טובה'), 'positive');
  assert.equal(classifyText('גרוע מאוד, תקלה'), 'negative');
  assert.equal(classifyText('ok'), 'neutral');
  assert.equal(classifyText(''), 'neutral');
  assert.equal(classifyText(null), 'neutral');
});

test('triggerEscalation fires when >= pct responses score below threshold', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'p-esc', questions: pulseQuestions() });
  // 5 responses: 4 with low scores (1 or 2), 1 with high score
  [1, 2, 2, 1, 5].forEach((s, i) => fb.submitResponse({
    surveyId: 'p-esc',
    employeeId: `E${i}`,
    answers: { q1: s, q2: s },
  }));
  const alerts = fb.triggerEscalation({ threshold: 3, pctThreshold: 0.4 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].surveyId, 'p-esc');
  assert.ok(alerts[0].pctLow >= 0.4);
  assert.ok(alerts[0].message_he.includes('p-esc'));
  assert.ok(alerts[0].message_en.toLowerCase().includes('hr action'));
  assert.equal(fb.escalations.length, 1);
});

test('triggerEscalation stays silent when morale is healthy', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'p-good', questions: pulseQuestions() });
  [5, 5, 4, 5, 4].forEach((s, i) => fb.submitResponse({
    surveyId: 'p-good',
    employeeId: `E${i}`,
    answers: { q1: s, q2: s },
  }));
  const alerts = fb.triggerEscalation({ threshold: 3, pctThreshold: 0.4 });
  assert.equal(alerts.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 7. Anonymity guard self-audit
// ─────────────────────────────────────────────────────────────

test('anonymityGuard reports k-anonymity risk on small anonymous cohort', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({
    id: 'pulse-k',
    questions: pulseQuestions(),
    anonymous: true,
  });
  fb.submitResponse({
    surveyId: 'pulse-k',
    employeeId: 'E1',
    answers: { q1: 4, q2: 4 },
  });
  fb.submitResponse({
    surveyId: 'pulse-k',
    employeeId: 'E2',
    answers: { q1: 3, q2: 3 },
  });
  const audit = fb.anonymityGuard();
  assert.equal(audit.ok, false);
  assert.equal(audit.k, 3);
  assert.ok(audit.violations.some((v) => v.kind === 'k-anonymity-risk'));
  // add a 3rd respondent → k met → k risk clears
  fb.submitResponse({
    surveyId: 'pulse-k',
    employeeId: 'E3',
    answers: { q1: 5, q2: 5 },
  });
  const audit2 = fb.anonymityGuard();
  assert.ok(
    !audit2.violations.some((v) => v.kind === 'k-anonymity-risk'),
  );
});

test('anonymityGuard is clean when everything is consistent', () => {
  const fb = mkEngine();
  fb.launchPulseSurvey({ id: 'clean', questions: pulseQuestions() });
  fb.submitResponse({
    surveyId: 'clean',
    employeeId: 'E1',
    answers: { q1: 4, q2: 4 },
  });
  const audit = fb.anonymityGuard();
  assert.equal(audit.ok, true);
  assert.equal(audit.violations.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 8. LABELS, CONSTANTS sanity
// ─────────────────────────────────────────────────────────────

test('LABELS expose bilingual strings for pulse, suggestion and retro', () => {
  assert.ok(LABELS.he.pulse_title);
  assert.ok(LABELS.en.pulse_title);
  assert.ok(LABELS.he.suggestion_box);
  assert.ok(LABELS.en.suggestion_box);
  assert.ok(LABELS.he.retro_session);
  assert.ok(LABELS.en.retro_session);
  assert.equal(CONSTANTS.K_ANONYMITY, 3);
  assert.equal(CONSTANTS.MAX_PULSE_QUESTIONS, 5);
});
