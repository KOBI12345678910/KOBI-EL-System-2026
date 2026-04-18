/**
 * Tests — Polls / Quick-Surveys Engine (Y-133)
 * Zero-dep: node:test + node:assert/strict
 *
 * Covers:
 *   - constant exports
 *   - all 5 poll types (single-choice, multiple-choice, yes-no, rating, emoji)
 *   - vote casting (happy path + validation)
 *   - single-vote enforcement
 *   - allowChange override flag
 *   - results computation (counts + percentages + rating avg)
 *   - multi-select percentage base
 *   - liveResults snapshot shape
 *   - closePoll preserves record and audit
 *   - extendPoll reactivates expired polls
 *   - listActive + audience filter
 *   - anonymous hashing (voter key reproducible, raw id not stored)
 *   - JSON export round-trip
 *   - CSV export with Hebrew RTL options
 *   - ban preserves original votes (status: excluded)
 *   - history append-only
 *   - voterParticipation with/without audienceSize
 *   - discussionThread add + hide preserves
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Polls,
  POLL_TYPES,
  POLL_STATE,
  DEFAULT_YES_NO,
  DEFAULT_RATING,
  DEFAULT_EMOJI,
  anonymizeVoter,
  normalizeOptions,
} = require('../../src/comms/polls');

// ---- helpers ----------------------------------------------------------------

function makePolls() {
  return new Polls();
}

function sampleSingle(pollsInstance, overrides = {}) {
  return pollsInstance.createPoll(Object.assign({
    id: 'p-single-1',
    question_he: 'מה התפריט המועדף?',
    question_en: 'Favourite lunch menu?',
    type: 'single-choice',
    options: [
      { id: 'meat',  he: 'בשרי',  en: 'Meat'   },
      { id: 'dairy', he: 'חלבי',  en: 'Dairy'  },
      { id: 'vegan', he: 'טבעוני', en: 'Vegan' },
    ],
    audience: ['shop-floor', 'office'],
    createdBy: 'hr-manager',
  }, overrides));
}

// ---- 1: constants -----------------------------------------------------------

test('constants export and include all 5 poll types', () => {
  assert.ok(POLL_TYPES['single-choice']);
  assert.ok(POLL_TYPES['multiple-choice']);
  assert.ok(POLL_TYPES['yes-no']);
  assert.ok(POLL_TYPES['rating']);
  assert.ok(POLL_TYPES['emoji']);
  assert.equal(POLL_TYPES['yes-no'].he, 'כן / לא');
  assert.equal(POLL_STATE.ACTIVE, 'active');
  assert.equal(DEFAULT_YES_NO.length, 2);
  assert.equal(DEFAULT_RATING.length, 5);
  assert.ok(DEFAULT_EMOJI.length >= 5);
});

// ---- 2: create single-choice poll -------------------------------------------

test('createPoll: single-choice with Hebrew options', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  assert.equal(poll.type, 'single-choice');
  assert.equal(poll.state, POLL_STATE.ACTIVE);
  assert.equal(poll.options.length, 3);
  assert.equal(poll.options[0].he, 'בשרי');
  assert.equal(poll.options[0].en, 'Meat');
  assert.equal(poll.allowMultiple, false);
  assert.equal(poll.anonymous, false);
});

// ---- 3: create multiple-choice poll -----------------------------------------

test('createPoll: multiple-choice enables allowMultiple', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-multi-1',
    question_he: 'אילו ימי חופשה נוחים?',
    question_en: 'Which holidays work?',
    type: 'multiple-choice',
    options: ['ראשון', 'שני', 'שלישי', 'רביעי'],
    allowMultiple: true,
  });
  assert.equal(poll.type, 'multiple-choice');
  assert.equal(poll.allowMultiple, true);
  assert.equal(poll.options.length, 4);
  assert.equal(poll.options[0].he, 'ראשון');
});

// ---- 4: yes-no auto-populated options ---------------------------------------

test('createPoll: yes-no auto-populates HE/EN options', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-yn-1',
    question_he: 'להמשיך בישיבה?',
    question_en: 'Continue the meeting?',
    type: 'yes-no',
  });
  assert.equal(poll.options.length, 2);
  assert.equal(poll.options[0].id, 'yes');
  assert.equal(poll.options[0].he, 'כן');
  assert.equal(poll.options[1].he, 'לא');
});

// ---- 5: rating poll ---------------------------------------------------------

test('createPoll: rating 1-5 yields 5 options and computes average', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-r-1',
    question_he: 'דרג את הארוחה',
    question_en: 'Rate the lunch',
    type: 'rating',
  });
  assert.equal(poll.options.length, 5);

  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: ['5'] });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: ['4'] });
  p.castVote({ pollId: poll.id, voterId: 'u-3', choices: ['3'] });
  const r = p.results(poll.id);
  assert.equal(r.totalBallots, 3);
  assert.equal(r.ratingAverage, 4);
});

// ---- 6: emoji poll ----------------------------------------------------------

test('createPoll: emoji yields emoji options with HE labels', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-e-1',
    question_he: 'איך הישיבה?',
    question_en: 'How was the meeting?',
    type: 'emoji',
  });
  assert.ok(poll.options.length >= 5);
  const labels = poll.options.map((o) => o.he);
  assert.ok(labels.includes('לייק'));
});

// ---- 7: castVote happy path + validation ------------------------------------

test('castVote: happy path + rejects invalid choice', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  const v = p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  assert.equal(v.status, 'counted');
  assert.deepEqual(v.choices, ['meat']);
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'nope' }),
    /invalid choice/
  );
});

// ---- 8: single-vote enforcement ---------------------------------------------

test('single-vote enforcement: second vote throws unless allowChange', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'vegan' }),
    /already cast/
  );
});

// ---- 9: allowChange supersedes prior vote -----------------------------------

test('allowChange: re-voting supersedes (append-only) prior ballot', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-change-1',
    question_he: 'מה דעתך?',
    question_en: 'What do you think?',
    type: 'single-choice',
    options: ['a', 'b', 'c'],
    allowChange: true,
  });
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'opt-1' });
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'opt-3' });

  const log = p.getVotes(poll.id);
  assert.equal(log.length, 2, 'append-only: both entries preserved');
  assert.equal(log[0].status, 'superseded');
  assert.equal(log[1].status, 'counted');

  const r = p.results(poll.id);
  assert.equal(r.totalBallots, 1);
  assert.equal(r.options.find((o) => o.id === 'opt-3').count, 1);
});

// ---- 10: results computation ------------------------------------------------

test('results: counts + percentages for single-choice', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-3', choices: 'dairy' });
  p.castVote({ pollId: poll.id, voterId: 'u-4', choices: 'vegan' });

  const r = p.results(poll.id);
  assert.equal(r.totalBallots, 4);
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  assert.equal(byId.meat.count, 2);
  assert.equal(byId.meat.pct, 50);
  assert.equal(byId.dairy.count, 1);
  assert.equal(byId.dairy.pct, 25);
  assert.equal(byId.vegan.pct, 25);
  // Bilingual labels preserved
  assert.equal(byId.meat.label.he, 'בשרי');
  assert.equal(byId.meat.label.en, 'Meat');
});

// ---- 11: multi-select percentages normalise to 100 --------------------------

test('results: multi-select percentages are computed on total picks', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-multi-2',
    question_he: 'מה לתקן?',
    question_en: 'What to fix?',
    type: 'multiple-choice',
    options: ['a', 'b', 'c', 'd'],
    allowMultiple: true,
  });
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: ['opt-1', 'opt-2'] });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: ['opt-1'] });
  p.castVote({ pollId: poll.id, voterId: 'u-3', choices: ['opt-3', 'opt-4'] });

  const r = p.results(poll.id);
  assert.equal(r.totalBallots, 3);
  assert.equal(r.totalPicks, 5);
  const pctSum = r.options.reduce((s, o) => s + o.pct, 0);
  // Sum of percentages should be 100 (rounding tolerant)
  assert.ok(Math.abs(pctSum - 100) < 0.1, `pct sum ${pctSum} should be ~100`);
});

// ---- 12: closePoll preserves record -----------------------------------------

test('closePoll: flips state, preserves votes, no data loss', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'dairy' });

  const closed = p.closePoll(poll.id, 'הסקר הושלם');
  assert.equal(closed.state, POLL_STATE.CLOSED);
  assert.equal(closed.closedReason, 'הסקר הושלם');
  assert.ok(closed.closedAt);

  // Votes still there
  const log = p.getVotes(poll.id);
  assert.equal(log.length, 2);

  // New votes are rejected
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'u-3', choices: 'vegan' }),
    /cannot vote/
  );

  // Results still computable
  const r = p.results(poll.id);
  assert.equal(r.totalBallots, 2);
});

// ---- 13: anonymous hashing --------------------------------------------------

test('anonymous mode: voterId is hashed, raw id not stored', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-anon-1',
    question_he: 'הצבעה סודית',
    question_en: 'Secret vote',
    type: 'yes-no',
    anonymous: true,
  });
  const v = p.castVote({ pollId: poll.id, voterId: 'alice@example.com', choices: 'yes' });
  assert.equal(v.anonymous, true);
  assert.equal(v.voterIdRaw, null);
  assert.ok(v.voterKey.startsWith('anon-'));
  // Deterministic for the same (pollId, voterId)
  const expected = anonymizeVoter('alice@example.com', poll.id);
  assert.equal(v.voterKey, expected);
  // Second vote by same voter also hashes identically — should be rejected as duplicate
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'alice@example.com', choices: 'no' }),
    /already cast/
  );
});

// ---- 14: export JSON --------------------------------------------------------

test('export: JSON contains poll, votes, results, comments', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'dairy' });
  const json = p.export(poll.id, 'json');
  const parsed = JSON.parse(json);
  assert.equal(parsed.poll.id, poll.id);
  assert.equal(parsed.votes.length, 2);
  assert.equal(parsed.results.totalBallots, 2);
  assert.ok(Array.isArray(parsed.comments));
  assert.ok(parsed.exportedAt);
});

// ---- 15: export CSV with Hebrew ---------------------------------------------

test('export: CSV has header + one row per choice, escapes Hebrew safely', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'dairy' });
  const csv = p.export(poll.id, 'csv');
  const lines = csv.split('\r\n');
  assert.ok(lines[0].startsWith('poll_id,poll_type'));
  assert.equal(lines.length, 3); // header + 2 votes
  // Hebrew preserved
  assert.ok(csv.includes('בשרי'));
  assert.ok(csv.includes('חלבי'));
  // Question with comma-free text fine; ensure escaping works for a multiline question
  const poll2 = p.createPoll({
    id: 'p-csv-2',
    question_he: 'שאלה, עם פסיק',
    question_en: 'Question, with comma',
    type: 'yes-no',
  });
  p.castVote({ pollId: poll2.id, voterId: 'u-1', choices: 'yes' });
  const csv2 = p.export(poll2.id, 'csv');
  assert.ok(csv2.includes('"שאלה, עם פסיק"'));
});

// ---- 16: ban preserves original vote ----------------------------------------

test('ban: annotates existing vote as excluded, never deletes', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'troll', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'good', choices: 'dairy' });

  const r1 = p.results(poll.id);
  assert.equal(r1.totalBallots, 2);

  const banRes = p.ban(poll.id, 'troll', 'spam');
  assert.equal(banRes.excludedCount, 1);

  // Vote still present in append-only log
  const log = p.getVotes(poll.id);
  assert.equal(log.length, 2);
  const trollVote = log.find((v) => v.voterKey === 'troll');
  assert.ok(trollVote);
  assert.equal(trollVote.status, 'excluded');
  assert.equal(trollVote.excludeReason, 'spam');
  assert.deepEqual(trollVote.choices, ['meat'], 'original choice preserved');

  // Results now exclude it
  const r2 = p.results(poll.id);
  assert.equal(r2.totalBallots, 1);

  // Banned voter cannot cast a new vote
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'troll', choices: 'vegan' }),
    /banned/
  );
});

// ---- 17: history append-only ------------------------------------------------

test('history: append-only audit for create, vote, close, ban', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.ban(poll.id, 'u-1', 'test');
  p.closePoll(poll.id, 'done');

  const h = p.history(poll.id);
  const actions = h.map((x) => x.action);
  assert.ok(actions.includes('createPoll'));
  assert.ok(actions.includes('castVote'));
  assert.ok(actions.includes('ban'));
  assert.ok(actions.includes('closePoll'));
  // Order preserved
  assert.equal(actions.indexOf('createPoll'), 0);
  assert.ok(actions.indexOf('closePoll') > actions.indexOf('ban'));
});

// ---- 18: listActive + audience filter ---------------------------------------

test('listActive: filters by audience and excludes closed polls', () => {
  const p = makePolls();
  const a = p.createPoll({
    id: 'p-a', question_he: 'א', question_en: 'A',
    type: 'yes-no', audience: ['shop-floor'],
  });
  p.createPoll({
    id: 'p-b', question_he: 'ב', question_en: 'B',
    type: 'yes-no', audience: ['office'],
  });
  p.createPoll({
    id: 'p-c', question_he: 'ג', question_en: 'C',
    type: 'yes-no', audience: ['all'],
  });
  p.closePoll(a.id, 'done');

  const active = p.listActive('shop-floor');
  const ids = active.map((x) => x.id);
  assert.ok(!ids.includes('p-a'));   // closed
  assert.ok(!ids.includes('p-b'));   // wrong audience
  assert.ok(ids.includes('p-c'));    // 'all' matches any audience
});

// ---- 19: extendPoll reactivates expired -------------------------------------

test('extendPoll: reactivates an expired poll with a future closesAt', () => {
  const p = makePolls();
  const poll = p.createPoll({
    id: 'p-exp-1',
    question_he: 'סקר בזק',
    question_en: 'Flash poll',
    type: 'yes-no',
    closesAt: new Date(Date.now() - 60_000).toISOString(), // already expired
  });
  // Trigger expiry check
  const r1 = p.results(poll.id);
  assert.equal(r1.state, POLL_STATE.EXPIRED);

  // Voting on expired poll should fail
  assert.throws(
    () => p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'yes' }),
    /cannot vote/
  );

  // Extend into the future
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const ext = p.extendPoll(poll.id, future);
  assert.equal(ext.state, POLL_STATE.ACTIVE);
  assert.equal(ext.closesAt, future);

  // Voting works again
  const v = p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'yes' });
  assert.equal(v.status, 'counted');
});

// ---- 20: voterParticipation -------------------------------------------------

test('voterParticipation: computes % against declared audienceSize', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.setAudienceSize(poll.id, 10);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-2', choices: 'meat' });
  p.castVote({ pollId: poll.id, voterId: 'u-3', choices: 'dairy' });

  const pr = p.voterParticipation(poll.id);
  assert.equal(pr.uniqueVoters, 3);
  assert.equal(pr.audienceSize, 10);
  assert.equal(pr.participationPct, 30);
});

// ---- 21: discussionThread --------------------------------------------------

test('discussionThread: add + hide preserves (לא מוחקים)', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  const c1 = p.discussionThread(poll.id, 'add', { userId: 'u-1', text: 'תגובה ראשונה' });
  const c2 = p.discussionThread(poll.id, 'add', { userId: 'u-2', text: 'Comment two' });
  assert.ok(c1.id);
  assert.equal(c1.text, 'תגובה ראשונה');
  assert.equal(c2.text, 'Comment two');

  const list1 = p.discussionThread(poll.id, 'list');
  assert.equal(list1.length, 2);

  const hidden = p.discussionThread(poll.id, 'hide', { commentId: c1.id, reason: 'off-topic' });
  assert.equal(hidden.status, 'hidden');
  assert.equal(hidden.hiddenReason, 'off-topic');

  const list2 = p.discussionThread(poll.id, 'list');
  assert.equal(list2.length, 2, 'hidden comment still present in append-only list');
  assert.equal(list2.find((c) => c.id === c1.id).status, 'hidden');
});

// ---- 22: liveResults snapshot ----------------------------------------------

test('liveResults: streaming snapshot shape', () => {
  const p = makePolls();
  const poll = sampleSingle(p);
  p.castVote({ pollId: poll.id, voterId: 'u-1', choices: 'meat' });
  const snap = p.liveResults(poll.id);
  assert.equal(snap.v, 1);
  assert.equal(snap.pollId, poll.id);
  assert.equal(snap.totalBallots, 1);
  assert.ok(Array.isArray(snap.options));
  assert.ok(snap.snapshotAt);
  // Each option has label.he and label.en
  for (const opt of snap.options) {
    assert.ok(opt.label.he !== undefined);
    assert.ok(opt.label.en !== undefined);
  }
});

// ---- 23: duplicate id ------------------------------------------------------

test('createPoll: duplicate id throws', () => {
  const p = makePolls();
  sampleSingle(p);
  assert.throws(() => sampleSingle(p), /already exists/);
});

// ---- 24: normalizeOptions rejects too few ----------------------------------

test('normalizeOptions: single-choice with <2 options throws', () => {
  assert.throws(
    () => normalizeOptions('single-choice', ['only-one']),
    /at least 2/
  );
});

// ---- 25: stats ------------------------------------------------------------

test('stats: reports counts across lifecycle', () => {
  const p = makePolls();
  const a = sampleSingle(p);
  p.createPoll({
    id: 'p-b', question_he: 'ב', question_en: 'B',
    type: 'yes-no',
  });
  p.castVote({ pollId: a.id, voterId: 'u-1', choices: 'meat' });
  p.closePoll(a.id, 'done');
  const s = p.stats();
  assert.equal(s.totalPolls, 2);
  assert.equal(s.active, 1);
  assert.equal(s.closed, 1);
  assert.ok(s.totalVotes >= 1);
  assert.ok(s.globalAuditEntries >= 3);
});
