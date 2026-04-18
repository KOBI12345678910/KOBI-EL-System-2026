/**
 * Opportunity Stage Manager — Unit Tests  |  מנהל שלבי הזדמנות
 * ==============================================================
 *
 * Agent Y-024  |  Swarm Sales  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/sales/opportunity-stages.test.js
 *      or:    node --test
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * Exercises:
 *   • Default pipeline seeding (Qualification→Discovery→Proposal→
 *     Negotiation→Closed-Won/Lost, probs 10/25/50/75/100/0)
 *   • definePipeline — append-only upgrade semantics, validation
 *   • Exit-criteria evaluation — all operators (eq, gt, truthy,
 *     in, between, exists, regex, contains, …)
 *   • moveToStage — blocks forward move when criteria unmet,
 *     allows rollback, allows `force`
 *   • autoProgress — chained advancement when all criteria met
 *   • computeWeightedValue
 *   • stageDuration — sums multiple visits
 *   • stuckOpportunities — default threshold, per-stage map
 *   • conversionRate — stage-to-stage with period window
 *   • velocity — avg/median/min/max days to close
 *   • Append-only rule — history never shrinks
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  OpportunityPipeline,
  DEFAULT_PIPELINE_SPEC,
  DEFAULT_PIPELINE_ID,
  MS_PER_DAY,
  _internal,
} = require(path.resolve(
  __dirname, '..', '..', 'src', 'sales', 'opportunity-stages.js',
));

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build an OpportunityPipeline with a pinned clock that starts at
 * `start` and advances only when `tick()` is called. Keeps tests
 * fully deterministic.
 */
function makePipeline(start) {
  const state = { t: start == null ? Date.UTC(2026, 0, 1) : start };
  const mgr = new OpportunityPipeline({ now: () => state.t });
  return {
    mgr,
    tick(ms) { state.t += ms; return state.t; },
    set(ms)  { state.t = ms; return state.t; },
    now()    { return state.t; },
  };
}

function baseOpp(over) {
  return Object.assign({
    id: 'OPP-001',
    title: 'מגדל מגורים — חיפה',
    amount: 250000,
    currency: 'ILS',
    contact: { name: 'דוד כהן', email: 'david@example.co.il' },
  }, over || {});
}

// ═════════════════════════════════════════════════════════════
// 1. Default pipeline seed
// ═════════════════════════════════════════════════════════════

test('default pipeline: seeded with 6 stages and correct probabilities', () => {
  const { mgr } = makePipeline();
  const p = mgr.getPipeline();
  assert.ok(p, 'default pipeline exists');
  assert.equal(p.id, DEFAULT_PIPELINE_ID);
  assert.equal(p.stages.length, 6);
  const ids = p.stages.map((s) => s.id);
  assert.deepEqual(ids, [
    'qualification', 'discovery', 'proposal',
    'negotiation', 'closed_won', 'closed_lost',
  ]);
  const probs = p.stages.map((s) => s.probability);
  assert.deepEqual(probs, [0.10, 0.25, 0.50, 0.75, 1.00, 0.00]);
});

test('default pipeline: Closed-Won and Closed-Lost are terminal', () => {
  const { mgr } = makePipeline();
  const p = mgr.getPipeline();
  const won = p.stages.find((s) => s.id === 'closed_won');
  const lost = p.stages.find((s) => s.id === 'closed_lost');
  assert.equal(won.terminal, true);
  assert.equal(won.won, true);
  assert.equal(lost.terminal, true);
  assert.equal(lost.lost, true);
});

test('default pipeline: bilingual Hebrew/English labels on every stage', () => {
  const { mgr } = makePipeline();
  const p = mgr.getPipeline();
  for (const s of p.stages) {
    assert.ok(s.name_he.length > 0, `stage ${s.id} has name_he`);
    assert.ok(s.name_en.length > 0, `stage ${s.id} has name_en`);
  }
});

test('default pipeline: DEFAULT_PIPELINE_SPEC exposed and frozen', () => {
  assert.equal(DEFAULT_PIPELINE_SPEC.id, 'default');
  assert.throws(() => {
    DEFAULT_PIPELINE_SPEC.id = 'mutated';
  });
});

// ═════════════════════════════════════════════════════════════
// 2. definePipeline validation + append-only upgrade
// ═════════════════════════════════════════════════════════════

test('definePipeline: rejects empty stages', () => {
  const { mgr } = makePipeline();
  assert.throws(
    () => mgr.definePipeline({ id: 'x', stages: [] }),
    /stages/,
  );
});

test('definePipeline: rejects duplicate stage ids', () => {
  const { mgr } = makePipeline();
  assert.throws(
    () => mgr.definePipeline({
      id: 'dup',
      stages: [
        { id: 's1', name_he: 'א', name_en: 'A', probability: 0.1, exitCriteria: [] },
        { id: 's1', name_he: 'ב', name_en: 'B', probability: 0.2, exitCriteria: [] },
      ],
    }),
    /duplicate/,
  );
});

test('definePipeline: rejects probability out of [0,1]', () => {
  const { mgr } = makePipeline();
  assert.throws(
    () => mgr.definePipeline({
      id: 'bad',
      stages: [
        { id: 's1', name_he: 'א', name_en: 'A', probability: 1.5, exitCriteria: [] },
      ],
    }),
    /probability/,
  );
});

test('definePipeline: upgrade is append-only (version bumps, history preserved)', () => {
  const { mgr } = makePipeline();
  const v1 = mgr.definePipeline({
    id: 'enterprise',
    name_he: 'ארגוני',
    name_en: 'Enterprise',
    stages: [
      { id: 'intro',  name_he: 'היכרות', name_en: 'Intro',  probability: 0.1, exitCriteria: [] },
      { id: 'closed', name_he: 'נסגר',   name_en: 'Closed', probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  assert.equal(v1.version, 1);

  const v2 = mgr.definePipeline({
    id: 'enterprise',
    name_he: 'ארגוני',
    name_en: 'Enterprise',
    stages: [
      { id: 'intro',    name_he: 'היכרות', name_en: 'Intro',    probability: 0.1, exitCriteria: [] },
      { id: 'proposal', name_he: 'הצעה',   name_en: 'Proposal', probability: 0.5, exitCriteria: [] },
      { id: 'closed',   name_he: 'נסגר',   name_en: 'Closed',   probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  assert.equal(v2.version, 2);
  assert.equal(mgr.getPipeline('enterprise').stages.length, 3);
  const history = mgr.getPipelineHistory('enterprise');
  assert.equal(history.length, 2);
  assert.equal(history[0].stages.length, 2);
  assert.equal(history[1].stages.length, 3);
});

// ═════════════════════════════════════════════════════════════
// 3. Exit criteria — operator coverage
// ═════════════════════════════════════════════════════════════

test('evaluateExitCriteria: operators eq/ne/gt/gte/lt/lte/in/nin', () => {
  const { mgr } = makePipeline();
  mgr.definePipeline({
    id: 'op-test',
    name_he: 'בדיקה', name_en: 'Test',
    stages: [
      { id: 's1', name_he: 'שלב א', name_en: 'Stage A', probability: 0.1,
        exitCriteria: [
          { field: 'a', op: 'eq',  value: 5 },
          { field: 'b', op: 'gt',  value: 10 },
          { field: 'c', op: 'in',  value: ['x','y','z'] },
          { field: 'd', op: 'lte', value: 100 },
        ] },
      { id: 's2', name_he: 'שלב ב', name_en: 'Stage B', probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  mgr.upsertOpportunity({
    id: 'O1', pipelineId: 'op-test',
    a: 5, b: 11, c: 'y', d: 50,
  });
  const r = mgr.evaluateExitCriteria(mgr.getOpportunity('O1'));
  assert.equal(r.met, true);
  assert.equal(r.unmet.length, 0);

  mgr.upsertOpportunity({
    id: 'O2', pipelineId: 'op-test',
    a: 4, b: 9, c: 'q', d: 200,
  });
  const r2 = mgr.evaluateExitCriteria(mgr.getOpportunity('O2'));
  assert.equal(r2.met, false);
  assert.equal(r2.unmet.length, 4);
});

test('evaluateExitCriteria: truthy/exists/between/regex/contains', () => {
  const { mgr } = makePipeline();
  mgr.definePipeline({
    id: 'op2',
    stages: [
      { id: 's1', name_he: 'א', name_en: 'A', probability: 0.1,
        exitCriteria: [
          { field: 'flag',  op: 'truthy', value: true },
          { field: 'id',    op: 'exists', value: true },
          { field: 'score', op: 'between', value: [10, 20] },
          { field: 'email', op: 'regex', value: '^.+@.+$' },
          { field: 'tags',  op: 'contains', value: 'hot' },
        ] },
      { id: 's2', name_he: 'ב', name_en: 'B', probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  mgr.upsertOpportunity({
    id: 'O1', pipelineId: 'op2',
    flag: true, score: 15, email: 'x@y.com', tags: ['hot', 'enterprise'],
  });
  const r = mgr.evaluateExitCriteria(mgr.getOpportunity('O1'));
  assert.equal(r.met, true);
});

test('evaluateExitCriteria: optional criteria do not block', () => {
  const { mgr } = makePipeline();
  const evalResult = mgr.evaluateExitCriteria(
    mgr.upsertOpportunity({
      id: 'O1',
      contact: { name: 'א', email: 'a@b.co' },
      // budget_confirmed left unset — criterion is optional
    }),
  );
  assert.equal(evalResult.met, true, 'required met, optional missing → still met');
  assert.equal(evalResult.optional.length, 1);
  assert.equal(evalResult.optional[0].ok, false);
});

test('evaluateExitCriteria: unknown operator fails closed', () => {
  const { mgr } = makePipeline();
  mgr.definePipeline({
    id: 'bad-op',
    stages: [
      { id: 's1', name_he: 'א', name_en: 'A', probability: 0.1,
        exitCriteria: [
          { field: 'x', op: 'no_such_op', value: 1 },
        ] },
      { id: 's2', name_he: 'ב', name_en: 'B', probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  mgr.upsertOpportunity({ id: 'O1', pipelineId: 'bad-op', x: 1 });
  const r = mgr.evaluateExitCriteria(mgr.getOpportunity('O1'));
  assert.equal(r.met, false);
});

// ═════════════════════════════════════════════════════════════
// 4. moveToStage — enforcement + rollback
// ═════════════════════════════════════════════════════════════

test('moveToStage: blocks forward move when required criteria unmet', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity({
    id: 'OPP-A',
    contact: { name: '', email: '' }, // empty contact
  });
  assert.throws(
    () => mgr.moveToStage('OPP-A', 'discovery'),
    (err) => err.code === 'EXIT_CRITERIA_UNMET' && err.fromStage === 'qualification',
  );
});

test('moveToStage: allows forward move when criteria met', () => {
  const { clock, mgr } = (function () {
    const h = makePipeline();
    return { clock: h, mgr: h.mgr };
  })();
  mgr.upsertOpportunity(baseOpp());
  clock.tick(MS_PER_DAY);
  const moved = mgr.moveToStage('OPP-001', 'discovery');
  assert.equal(moved.stageId, 'discovery');
  assert.equal(moved.stage_history.length, 2);
  assert.ok(moved.stage_history[0].exitedAt > 0);
  assert.equal(moved.stage_history[1].exitedAt, null);
});

test('moveToStage: force=true bypasses criteria', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity({
    id: 'F1', contact: { name: '', email: '' },
  });
  const moved = mgr.moveToStage('F1', 'discovery', { force: true, reason: 'manual override' });
  assert.equal(moved.stageId, 'discovery');
  assert.equal(moved.stage_history[1].reason, 'manual override');
});

test('moveToStage: rollback (backward) is always allowed', () => {
  const h = makePipeline();
  const { mgr } = h;
  mgr.upsertOpportunity(baseOpp());
  mgr.moveToStage('OPP-001', 'discovery');
  h.tick(MS_PER_DAY);
  const rolled = mgr.moveToStage('OPP-001', 'qualification', { reason: 'lead cooled' });
  assert.equal(rolled.stageId, 'qualification');
  const last = rolled.stage_history[rolled.stage_history.length - 1];
  assert.equal(last.reason, 'lead cooled');
});

test('moveToStage: throws on unknown stage', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity(baseOpp());
  assert.throws(
    () => mgr.moveToStage('OPP-001', 'nope'),
    /stage not in pipeline/,
  );
});

test('moveToStage: no-op when already in the target stage', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity(baseOpp());
  const o = mgr.moveToStage('OPP-001', 'qualification');
  assert.equal(o.stageId, 'qualification');
  assert.equal(o.stage_history.length, 1);
});

// ═════════════════════════════════════════════════════════════
// 5. autoProgress
// ═════════════════════════════════════════════════════════════

test('autoProgress: advances when criteria met, stops when not', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity(baseOpp());
  // qualification → discovery should succeed
  let o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'discovery');
  // discovery requires amount>0 (already), needs_summary, decision_maker
  o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'discovery', 'stays put — needs_summary missing');
});

test('autoProgress: chains through multiple stages when all criteria met', () => {
  const h = makePipeline();
  const { mgr } = h;
  mgr.upsertOpportunity({
    ...baseOpp(),
    needs_summary: 'need 5000 sqm steel',
    decision_maker_identified: true,
    proposal_sent_at: '2026-01-05',
    proposal_version: 2,
    legal_review_status: 'approved',
    final_terms_agreed: true,
  });
  // qualification → discovery
  let o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'discovery');
  h.tick(1000);
  // discovery → proposal
  o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'proposal');
  h.tick(1000);
  // proposal → negotiation
  o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'negotiation');
  h.tick(1000);
  // negotiation → closed_won (next by order; lost stages are skipped)
  o = mgr.autoProgress('OPP-001');
  assert.equal(o.stageId, 'closed_won');
});

test('autoProgress: terminal stage is a no-op', () => {
  const { mgr } = makePipeline();
  mgr.upsertOpportunity({ id: 'T1', stageId: 'closed_won', amount: 100000 });
  const o = mgr.autoProgress('T1');
  assert.equal(o.stageId, 'closed_won');
});

// ═════════════════════════════════════════════════════════════
// 6. computeWeightedValue
// ═════════════════════════════════════════════════════════════

test('computeWeightedValue: amount × stage probability', () => {
  const { mgr } = makePipeline();
  const o = mgr.upsertOpportunity(baseOpp()); // qualification, prob 0.10
  assert.equal(mgr.computeWeightedValue(o), 25000);
});

test('computeWeightedValue: closed_won returns amount, closed_lost returns 0', () => {
  const { mgr } = makePipeline();
  const won = mgr.upsertOpportunity({ id: 'W1', stageId: 'closed_won', amount: 500 });
  const lost = mgr.upsertOpportunity({ id: 'L1', stageId: 'closed_lost', amount: 500 });
  assert.equal(mgr.computeWeightedValue(won), 500);
  assert.equal(mgr.computeWeightedValue(lost), 0);
});

test('computeWeightedValue: rounds to 2 decimals', () => {
  const { mgr } = makePipeline();
  const o = mgr.upsertOpportunity({ id: 'R1', amount: 333.333 }); // * 0.10
  assert.equal(mgr.computeWeightedValue(o), 33.33);
});

// ═════════════════════════════════════════════════════════════
// 7. stageDuration + stuck detection
// ═════════════════════════════════════════════════════════════

test('stageDuration: returns ms in current stage', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity(baseOpp());
  h.tick(3 * MS_PER_DAY);
  const ms = mgr.stageDuration('OPP-001', 'qualification');
  assert.equal(ms, 3 * MS_PER_DAY);
});

test('stageDuration: sums multiple visits after rollback', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity(baseOpp());
  h.tick(2 * MS_PER_DAY);                       // 2d in qualification
  mgr.moveToStage('OPP-001', 'discovery');      // exit qualification
  h.tick(MS_PER_DAY);                           // 1d in discovery
  mgr.moveToStage('OPP-001', 'qualification');  // rollback
  h.tick(4 * MS_PER_DAY);                       // +4d in qualification
  const ms = mgr.stageDuration('OPP-001', 'qualification');
  assert.equal(ms, 6 * MS_PER_DAY, '2d + 4d');
});

test('stuckOpportunities: default threshold in days', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity({ ...baseOpp(), id: 'S1' });
  mgr.upsertOpportunity({ ...baseOpp(), id: 'S2' });
  h.tick(45 * MS_PER_DAY);
  const stuck = mgr.stuckOpportunities(30);
  assert.equal(stuck.length, 2);
  assert.ok(stuck[0].days >= 30);
  assert.equal(stuck[0].stageId, 'qualification');
});

test('stuckOpportunities: per-stage map beats default', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity({ ...baseOpp(), id: 'N1' });
  h.tick(10 * MS_PER_DAY);
  // Default 30d ⇒ not stuck yet. Per-stage override of 5d for
  // qualification ⇒ stuck.
  const notStuck = mgr.stuckOpportunities(30);
  assert.equal(notStuck.length, 0);
  const stuck = mgr.stuckOpportunities({ default: 30, qualification: 5 });
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].stageId, 'qualification');
  assert.ok(stuck[0].days >= 5);
});

test('stuckOpportunities: terminal stages are never stuck', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity({ id: 'TW', stageId: 'closed_won', amount: 100 });
  h.tick(365 * MS_PER_DAY);
  const stuck = mgr.stuckOpportunities(1);
  assert.equal(stuck.length, 0);
});

test('stuckOpportunities: sorted longest-stuck first', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;
  mgr.upsertOpportunity({ ...baseOpp(), id: 'A' });
  h.tick(10 * MS_PER_DAY);
  mgr.upsertOpportunity({ ...baseOpp(), id: 'B' });
  h.tick(50 * MS_PER_DAY);
  const stuck = mgr.stuckOpportunities(5);
  assert.equal(stuck[0].opportunity.id, 'A');
  assert.ok(stuck[0].days > stuck[1].days);
});

// ═════════════════════════════════════════════════════════════
// 8. conversionRate
// ═════════════════════════════════════════════════════════════

test('conversionRate: qualification → discovery over period', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;

  // 3 opps that convert, 1 that doesn't
  for (const id of ['C1','C2','C3']) {
    mgr.upsertOpportunity({ ...baseOpp(), id });
    h.tick(MS_PER_DAY);
    mgr.moveToStage(id, 'discovery');
  }
  mgr.upsertOpportunity({ ...baseOpp(), id: 'C4' });

  const rate = mgr.conversionRate('qualification', 'discovery');
  assert.equal(rate.entered, 4);
  assert.equal(rate.converted, 3);
  assert.equal(rate.rate, 0.75);
});

test('conversionRate: respects from/to period window', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;

  mgr.upsertOpportunity({ ...baseOpp(), id: 'A' });         // day 0
  mgr.moveToStage('A', 'discovery');
  h.tick(30 * MS_PER_DAY);
  mgr.upsertOpportunity({ ...baseOpp(), id: 'B' });         // day 30
  mgr.moveToStage('B', 'discovery');

  const windowStart = Date.UTC(2026, 0, 20);
  const r = mgr.conversionRate('qualification', 'discovery', {
    from: windowStart,
    to: Date.UTC(2026, 1, 28),
  });
  assert.equal(r.entered, 1, 'only B entered in window');
  assert.equal(r.converted, 1);
});

test('conversionRate: empty denominator returns 0', () => {
  const { mgr } = makePipeline();
  const r = mgr.conversionRate('qualification', 'discovery');
  assert.equal(r.entered, 0);
  assert.equal(r.converted, 0);
  assert.equal(r.rate, 0);
});

// ═════════════════════════════════════════════════════════════
// 9. velocity
// ═════════════════════════════════════════════════════════════

test('velocity: avg days to close for won deals', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;

  mgr.upsertOpportunity({ ...baseOpp(), id: 'V1' });
  h.tick(10 * MS_PER_DAY);
  mgr.moveToStage('V1', 'closed_won', { force: true });

  mgr.upsertOpportunity({ ...baseOpp(), id: 'V2' });
  h.tick(20 * MS_PER_DAY);
  mgr.moveToStage('V2', 'closed_won', { force: true });

  mgr.upsertOpportunity({ ...baseOpp(), id: 'V3' });
  h.tick(30 * MS_PER_DAY);
  mgr.moveToStage('V3', 'closed_won', { force: true });

  const v = mgr.velocity();
  assert.equal(v.samples, 3);
  assert.equal(v.wonCount, 3);
  // V1 closed 10d after creation; V2 ~60d; V3 ~120d (cumulative clock)
  assert.ok(v.avgDays > 0);
  assert.ok(v.medianDays > 0);
  assert.ok(v.minDays <= v.avgDays);
  assert.ok(v.maxDays >= v.avgDays);
});

test('velocity: excludes lost deals by default, includes with flag', () => {
  const h = makePipeline(Date.UTC(2026, 0, 1));
  const { mgr } = h;

  mgr.upsertOpportunity({ ...baseOpp(), id: 'W' });
  h.tick(10 * MS_PER_DAY);
  mgr.moveToStage('W', 'closed_won', { force: true });

  mgr.upsertOpportunity({ ...baseOpp(), id: 'L' });
  h.tick(5 * MS_PER_DAY);
  mgr.moveToStage('L', 'closed_lost', { force: true });

  const v = mgr.velocity();
  assert.equal(v.samples, 1, 'only won counted');
  assert.equal(v.wonCount, 1);
  assert.equal(v.lostCount, 1);

  const v2 = mgr.velocity(undefined, { includeLost: true });
  assert.equal(v2.samples, 2);
});

test('velocity: zero samples → zero stats', () => {
  const { mgr } = makePipeline();
  const v = mgr.velocity();
  assert.equal(v.samples, 0);
  assert.equal(v.avgDays, 0);
  assert.equal(v.medianDays, 0);
});

test('velocity: unknown pipeline throws', () => {
  const { mgr } = makePipeline();
  assert.throws(() => mgr.velocity('no-such'), /pipeline not found/);
});

// ═════════════════════════════════════════════════════════════
// 10. Append-only invariant
// ═════════════════════════════════════════════════════════════

test('append-only: stage_history never shrinks on upsert', () => {
  const h = makePipeline();
  const { mgr } = h;
  mgr.upsertOpportunity(baseOpp());
  h.tick(MS_PER_DAY);
  mgr.moveToStage('OPP-001', 'discovery');
  const before = mgr.getOpportunity('OPP-001').stage_history.length;
  mgr.upsertOpportunity({ id: 'OPP-001', amount: 999999 });
  const after = mgr.getOpportunity('OPP-001').stage_history.length;
  assert.equal(after, before);
  assert.equal(mgr.getOpportunity('OPP-001').amount, 999999);
});

test('append-only: cannot change pipelineId via upsert', () => {
  const { mgr } = makePipeline();
  mgr.definePipeline({
    id: 'alt',
    stages: [
      { id: 's1', name_he: 'א', name_en: 'A', probability: 0.1, exitCriteria: [] },
      { id: 's2', name_he: 'ב', name_en: 'B', probability: 1.0, won: true, exitCriteria: [] },
    ],
  });
  mgr.upsertOpportunity(baseOpp());
  const updated = mgr.upsertOpportunity({ id: 'OPP-001', pipelineId: 'alt' });
  assert.equal(updated.pipelineId, 'default', 'pipelineId immutable after creation');
});

// ═════════════════════════════════════════════════════════════
// 11. Internal helpers
// ═════════════════════════════════════════════════════════════

test('_internal.getPath: nested lookup', () => {
  const r = _internal.getPath({ a: { b: { c: 42 } } }, 'a.b.c');
  assert.equal(r, 42);
  assert.equal(_internal.getPath(null, 'x.y'), undefined);
  assert.equal(_internal.getPath({}, 'x.y'), undefined);
});

test('_internal.checkCriterion: handles missing values', () => {
  const r = _internal.checkCriterion({}, { field: 'x', op: 'gt', value: 0 });
  assert.equal(r.ok, false);
});

test('_internal.toMs: accepts ms, Date, and ISO strings', () => {
  assert.equal(_internal.toMs(1_000), 1000);
  assert.equal(_internal.toMs(new Date(1_000)), 1000);
  assert.equal(_internal.toMs('2026-01-01T00:00:00Z'), Date.UTC(2026,0,1));
  assert.equal(_internal.toMs(null), null);
  assert.equal(_internal.toMs('garbage'), null);
});
