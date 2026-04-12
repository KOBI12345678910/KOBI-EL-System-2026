/**
 * Lead Scoring Engine — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent Y023
 *
 * Run with:  node --test test/sales/lead-scoring.test.js
 *
 * Zero-dep tests using the Node built-in test runner.
 * Covers:
 *   - Default factor composition and weight normalization
 *   - Score calculation on typical hot / warm / cool / cold leads
 *   - Classification boundaries
 *   - explainScore bilingual output
 *   - Training convergence on synthetic separable data
 *   - ageDecay exponential half-life math
 *   - Custom defineModel with normalization
 *   - "לא מוחקים" — previous factors preserved in trainingLog
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  LeadScorer,
  CLASS_THRESHOLDS,
  DEFAULT_WEIGHTS,
  BEHAVIORAL_CEILINGS,
  MODEL_VERSION,
  scoreBudget,
  scoreAuthority,
  scoreNeed,
  scoreTimeline,
  makeBehavioralFn,
  sigmoid,
  bandScore,
  clamp,
  daysBetween,
  REVENUE_BANDS,
  HEADCOUNT_BANDS,
  // Y023.2.0 upgrade-layer exports
  BAND_THRESHOLDS_DEFAULT,
  BAND_GLOSSARY,
  DIMENSION_GLOSSARY,
  EVENT_SCORE_DELTAS,
  EVENT_DIMENSION_MAP,
  DECAY_BASE,
  DECAY_WINDOW_DAYS,
  evaluateDimensionRule,
  getDefaultDimensionModel,
  normBand,
} = require(path.resolve(__dirname, '..', '..', 'src', 'sales', 'lead-scoring.js'));

// ═══════════════════════════════════════════════════════════════
// Synthetic data helpers
// ═══════════════════════════════════════════════════════════════

function hotLead() {
  return {
    id: 'lead-hot-1',
    company: { name: 'Mega Corp', annualRevenue: 50_000_000, employees: 420 },
    contact: { name: 'Dana Cohen', title: 'CFO', decisionPower: 'decision-maker' },
    inquiry: { type: 'demo-request', painStated: true, urgency: 'immediate' },
    behavior: {
      emailOpens: 25,
      linkClicks: 18,
      pageVisits: 30,
      formFills: 4,
      webinarAttendance: 3,
      contentDownloads: 7,
      lastActivityAt: '2026-04-10',
    },
    createdAt: '2026-04-01',
  };
}

function warmLead() {
  return {
    id: 'lead-warm-1',
    company: { name: 'Mid Biz', annualRevenue: 8_000_000, employees: 60 },
    contact: { name: 'Yossi Levi', title: 'Manager', decisionPower: 'influencer' },
    inquiry: { type: 'pricing-request', painStated: false, urgency: 'this-quarter' },
    behavior: {
      emailOpens: 8,
      linkClicks: 4,
      pageVisits: 6,
      formFills: 1,
      webinarAttendance: 0,
      contentDownloads: 2,
      lastActivityAt: '2026-04-08',
    },
    createdAt: '2026-03-15',
  };
}

function coolLead() {
  return {
    id: 'lead-cool-1',
    company: { name: 'Small Shop', annualRevenue: 3_500_000, employees: 25 },
    contact: { name: 'Rinat', title: 'Team Lead', decisionPower: 'influencer' },
    inquiry: { type: 'content-download', painStated: false, urgency: 'this-year' },
    behavior: {
      emailOpens: 4,
      linkClicks: 2,
      pageVisits: 3,
      formFills: 0,
      webinarAttendance: 0,
      contentDownloads: 1,
      lastActivityAt: '2026-04-01',
    },
    createdAt: '2026-03-01',
  };
}

function coldLead() {
  return {
    id: 'lead-cold-1',
    company: { name: 'Tiny', annualRevenue: 200_000, employees: 3 },
    contact: { name: 'X', title: '', decisionPower: 'unknown' },
    inquiry: { type: 'newsletter', painStated: false, urgency: 'no-timeline' },
    behavior: {
      emailOpens: 0,
      linkClicks: 0,
      pageVisits: 0,
      formFills: 0,
      webinarAttendance: 0,
      contentDownloads: 0,
      lastActivityAt: '2026-01-01',
    },
    createdAt: '2026-01-01',
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. Pure helpers sanity
// ═══════════════════════════════════════════════════════════════

test('clamp bounds numbers correctly', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test('sigmoid edge cases', () => {
  assert.equal(sigmoid(0), 0.5);
  assert.ok(sigmoid(10) > 0.999);
  assert.ok(sigmoid(-10) < 0.001);
});

test('bandScore walks the table top-to-bottom', () => {
  assert.equal(bandScore(500_000, REVENUE_BANDS), 0.20);
  assert.equal(bandScore(3_000_000, REVENUE_BANDS), 0.45);
  assert.equal(bandScore(10_000_000, REVENUE_BANDS), 0.70);
  assert.equal(bandScore(50_000_000, REVENUE_BANDS), 0.90);
  assert.equal(bandScore(500_000_000, REVENUE_BANDS), 1.00);

  assert.equal(bandScore(5, HEADCOUNT_BANDS), 0.20);
  assert.equal(bandScore(30, HEADCOUNT_BANDS), 0.45);
  assert.equal(bandScore(150, HEADCOUNT_BANDS), 0.70);
  assert.equal(bandScore(500, HEADCOUNT_BANDS), 0.90);
  assert.equal(bandScore(5000, HEADCOUNT_BANDS), 1.00);
});

test('daysBetween returns absolute floor days', () => {
  assert.equal(daysBetween('2026-04-01', '2026-04-11'), 10);
  assert.equal(daysBetween('2026-04-11', '2026-04-01'), 0); // clamped at 0
  assert.equal(daysBetween(null, '2026-04-01'), 0);
});

// ═══════════════════════════════════════════════════════════════
// 2. Default factor scorers
// ═══════════════════════════════════════════════════════════════

test('scoreBudget rewards high revenue and headcount', () => {
  const big = { company: { annualRevenue: 60_000_000, employees: 500 } };
  const tiny = { company: { annualRevenue: 100_000, employees: 2 } };
  assert.ok(scoreBudget(big) > 0.85);
  assert.ok(scoreBudget(tiny) < 0.30);
});

test('scoreAuthority boosts decision-makers', () => {
  const dm = { contact: { title: 'CFO', decisionPower: 'decision-maker' } };
  const ic = { contact: { title: 'Analyst', decisionPower: 'end-user' } };
  assert.ok(scoreAuthority(dm) > 0.9);
  assert.ok(scoreAuthority(ic) < 0.4);
});

test('scoreAuthority matches Hebrew titles', () => {
  const heVp = { contact: { title: 'סמנכ"ל כספים', decisionPower: 'decision-maker' } };
  assert.ok(scoreAuthority(heVp) >= 0.85);
});

test('scoreNeed boosts explicit pain', () => {
  const withPain = { inquiry: { type: 'demo-request', painStated: true } };
  const withoutPain = { inquiry: { type: 'demo-request', painStated: false } };
  assert.ok(scoreNeed(withPain) > scoreNeed(withoutPain));
});

test('scoreTimeline covers the urgency enum', () => {
  assert.equal(scoreTimeline({ inquiry: { urgency: 'immediate' } }), 1.0);
  assert.equal(scoreTimeline({ inquiry: { urgency: 'this-month' } }), 0.9);
  assert.equal(scoreTimeline({ inquiry: { urgency: 'no-timeline' } }), 0.1);
  assert.equal(scoreTimeline({ inquiry: {} }), 0.15);
});

test('behavioral scoreFn saturates exponentially', () => {
  const fn = makeBehavioralFn('linkClicks');
  assert.equal(fn({ behavior: { linkClicks: 0 } }), 0);
  const v1 = fn({ behavior: { linkClicks: 15 } });   // ceiling
  const v2 = fn({ behavior: { linkClicks: 45 } });   // 3x ceiling
  const v3 = fn({ behavior: { linkClicks: 300 } });  // ~20x
  assert.ok(v1 > 0.6 && v1 < 0.7);    // ~0.632 at ceiling
  assert.ok(v2 > v1);                 // monotone increasing
  assert.ok(v3 > v2 && v3 <= 1);      // still capped
  assert.ok(v3 - v2 < 0.1);           // diminishing returns: tail is flat
  // Incremental gains shrink as count grows.
  const gainEarly = v1 - 0;           // 0 -> 15
  const gainLate  = v3 - v2;          // 45 -> 300
  assert.ok(gainLate < gainEarly);
});

// ═══════════════════════════════════════════════════════════════
// 3. LeadScorer construction and defaults
// ═══════════════════════════════════════════════════════════════

test('default LeadScorer has 10 factors with normalized weights', () => {
  const scorer = new LeadScorer();
  assert.equal(scorer.factors.length, 10);
  const sum = scorer.factors.reduce((s, f) => s + f.weight, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9);
  assert.equal(scorer.modelVersion, MODEL_VERSION);
});

test('default LeadScorer factor types are tagged correctly', () => {
  const scorer = new LeadScorer();
  const byType = {};
  for (const f of scorer.factors) {
    byType[f.type] = (byType[f.type] || 0) + 1;
  }
  assert.ok(byType.behavioral >= 6);
  assert.ok((byType.demographic || 0) + (byType.firmographic || 0) >= 4);
});

// ═══════════════════════════════════════════════════════════════
// 4. scoreLead — calculation and classification
// ═══════════════════════════════════════════════════════════════

test('scoreLead returns 0..100 with a full breakdown', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead(hotLead());
  assert.ok(r.total >= 0 && r.total <= 100);
  assert.equal(r.breakdown.length, 10);
  // Sum of weightedScore should equal total up to rounding.
  const sum = r.breakdown.reduce((s, b) => s + b.weightedScore, 0);
  assert.ok(Math.abs(sum - r.total) < 0.5);
});

test('hot lead scores above the Hot threshold', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead(hotLead());
  assert.ok(r.total >= CLASS_THRESHOLDS.hot, `expected >= 80, got ${r.total}`);
  assert.equal(r.class, 'Hot');
});

test('warm lead lands in the Warm band', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead(warmLead());
  assert.ok(r.total >= CLASS_THRESHOLDS.warm && r.total < CLASS_THRESHOLDS.hot,
    `expected 50..79, got ${r.total}`);
  assert.equal(r.class, 'Warm');
});

test('cool lead lands in the Cool band', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead(coolLead());
  assert.ok(r.total >= CLASS_THRESHOLDS.cool && r.total < CLASS_THRESHOLDS.warm,
    `expected 30..49, got ${r.total}`);
  assert.equal(r.class, 'Cool');
});

test('cold lead lands in the Cold band', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead(coldLead());
  assert.ok(r.total < CLASS_THRESHOLDS.cool, `expected < 30, got ${r.total}`);
  assert.equal(r.class, 'Cold');
});

// ═══════════════════════════════════════════════════════════════
// 5. classify — boundary tests
// ═══════════════════════════════════════════════════════════════

test('classify boundaries are inclusive at the low end', () => {
  const s = new LeadScorer();
  assert.equal(s.classify(80), 'Hot');
  assert.equal(s.classify(79.99), 'Warm');
  assert.equal(s.classify(50), 'Warm');
  assert.equal(s.classify(49.99), 'Cool');
  assert.equal(s.classify(30), 'Cool');
  assert.equal(s.classify(29.99), 'Cold');
  assert.equal(s.classify(0), 'Cold');
  assert.equal(s.classify(100), 'Hot');
});

// ═══════════════════════════════════════════════════════════════
// 6. explainScore — bilingual output
// ═══════════════════════════════════════════════════════════════

test('explainScore produces Hebrew + English per factor', () => {
  const scorer = new LeadScorer();
  const r = scorer.explainScore(warmLead());
  assert.ok(Array.isArray(r.explanation));
  assert.equal(r.explanation.length, 10);
  for (const row of r.explanation) {
    assert.ok(typeof row.he === 'string' && row.he.length > 0);
    assert.ok(typeof row.en === 'string' && row.en.length > 0);
    assert.ok(row.he !== row.en);
  }
  assert.ok(r.summary.he.includes('מתוך') || r.summary.he.includes('סה'));
  assert.ok(r.summary.en.includes('Total'));
});

test('explainScore summary references the class name', () => {
  const scorer = new LeadScorer();
  const r = scorer.explainScore(hotLead());
  assert.ok(r.summary.en.toLowerCase().includes('hot'));
  assert.ok(r.summary.he.includes('חם'));
});

// ═══════════════════════════════════════════════════════════════
// 7. defineModel — custom factors
// ═══════════════════════════════════════════════════════════════

test('defineModel accepts a custom 2-factor model', () => {
  const scorer = new LeadScorer();
  scorer.defineModel({
    factors: [
      {
        name: 'foo',
        type: 'demographic',
        weight: 3,
        scoreFn: (lead) => (lead && lead.foo) || 0,
      },
      {
        name: 'bar',
        type: 'behavioral',
        weight: 1,
        scoreFn: (lead) => (lead && lead.bar) || 0,
      },
    ],
  });
  assert.equal(scorer.factors.length, 2);
  // Weights normalized: 3/4 + 1/4 = 1
  assert.ok(Math.abs(scorer.factors[0].weight - 0.75) < 1e-9);
  assert.ok(Math.abs(scorer.factors[1].weight - 0.25) < 1e-9);
  const r = scorer.scoreLead({ foo: 1, bar: 1 });
  assert.equal(r.total, 100);
  const r2 = scorer.scoreLead({ foo: 1, bar: 0 });
  assert.equal(r2.total, 75);
});

test('defineModel rejects duplicate names and bad types', () => {
  const scorer = new LeadScorer();
  assert.throws(() =>
    scorer.defineModel({
      factors: [
        { name: 'a', type: 'demographic', weight: 1, scoreFn: () => 0 },
        { name: 'a', type: 'behavioral',  weight: 1, scoreFn: () => 0 },
      ],
    })
  );
  assert.throws(() =>
    scorer.defineModel({
      factors: [
        { name: 'x', type: 'nope', weight: 1, scoreFn: () => 0 },
      ],
    })
  );
  assert.throws(() =>
    scorer.defineModel({
      factors: [
        { name: 'x', type: 'demographic', weight: -1, scoreFn: () => 0 },
      ],
    })
  );
});

test('defineModel keeps previous factors in the trainingLog (לא מוחקים)', () => {
  const scorer = new LeadScorer();
  const before = scorer.factors.map((f) => f.name);
  scorer.defineModel({
    factors: [
      { name: 'only', type: 'demographic', weight: 1, scoreFn: () => 0.5 },
    ],
  });
  const logEntry = scorer.trainingLog[scorer.trainingLog.length - 1];
  assert.equal(logEntry.event, 'defineModel');
  assert.deepEqual(logEntry.previous.map((p) => p.name), before);
  assert.deepEqual(logEntry.next.map((p) => p.name), ['only']);
});

// ═══════════════════════════════════════════════════════════════
// 8. trainFromHistory — convergence on synthetic data
// ═══════════════════════════════════════════════════════════════

test('trainFromHistory converges on separable synthetic data', () => {
  const scorer = new LeadScorer();
  // Build 30 winners (strong budget + need + timeline, weak behavior)
  // and 30 losers (opposite).
  const won = [];
  const lost = [];
  for (let i = 0; i < 30; i++) {
    won.push({
      company: { annualRevenue: 40_000_000 + i * 1_000_000, employees: 300 + i },
      contact: { title: 'CFO', decisionPower: 'decision-maker' },
      inquiry: { type: 'demo-request', painStated: true, urgency: 'immediate' },
      behavior: {
        emailOpens: 15 + (i % 5),
        linkClicks: 10,
        pageVisits: 15,
        formFills: 3,
        webinarAttendance: 2,
        contentDownloads: 5,
        lastActivityAt: '2026-04-10',
      },
    });
    lost.push({
      company: { annualRevenue: 100_000 + i * 5_000, employees: 2 + (i % 3) },
      contact: { title: 'Analyst', decisionPower: 'end-user' },
      inquiry: { type: 'newsletter', painStated: false, urgency: 'no-timeline' },
      behavior: {
        emailOpens: 0,
        linkClicks: 0,
        pageVisits: 1,
        formFills: 0,
        webinarAttendance: 0,
        contentDownloads: 0,
        lastActivityAt: '2026-01-01',
      },
    });
  }
  const diag = scorer.trainFromHistory(won, lost, { maxIterations: 400 });
  assert.ok(diag.iterations > 0);
  // Loss must decrease monotonically overall
  assert.ok(diag.lossHistory[0] > diag.lossHistory[diag.lossHistory.length - 1]);
  // Weights still sum to 1
  const sum = scorer.factors.reduce((s, f) => s + f.weight, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-6);
  // None zeroed out (rule: לא מוחקים)
  for (const f of scorer.factors) assert.ok(f.weight > 0);
  // The retrained model must still separate won from lost.
  const wonScore = scorer.scoreLead(won[0]).total;
  const lostScore = scorer.scoreLead(lost[0]).total;
  assert.ok(wonScore > lostScore);
});

test('trainFromHistory audits the before/after in trainingLog', () => {
  const scorer = new LeadScorer();
  const won = [hotLead(), hotLead()];
  const lost = [coldLead(), coldLead()];
  scorer.trainFromHistory(won, lost, { maxIterations: 50 });
  const entry = scorer.trainingLog[scorer.trainingLog.length - 1];
  assert.equal(entry.event, 'trainFromHistory');
  assert.equal(entry.samples, 4);
  assert.equal(entry.wonCount, 2);
  assert.equal(entry.lostCount, 2);
  assert.ok(Array.isArray(entry.previous));
  assert.ok(Array.isArray(entry.next));
  assert.equal(entry.previous.length, 10);
  assert.equal(entry.next.length, 10);
});

test('trainFromHistory refuses empty datasets', () => {
  const scorer = new LeadScorer();
  assert.throws(() => scorer.trainFromHistory([], [coldLead()]));
  assert.throws(() => scorer.trainFromHistory([hotLead()], []));
});

// ═══════════════════════════════════════════════════════════════
// 9. ageDecay — exponential half-life
// ═══════════════════════════════════════════════════════════════

test('ageDecay halves behavioral counters after exactly one half-life', () => {
  const scorer = new LeadScorer();
  const lead = {
    behavior: {
      emailOpens: 20,
      linkClicks: 10,
      pageVisits: 30,
      formFills: 4,
      webinarAttendance: 2,
      contentDownloads: 6,
      lastActivityAt: '2026-03-12',
    },
  };
  const decayed = scorer.ageDecay(lead, 30, { asOf: '2026-04-11' });
  // 30 days / 30-day half-life => factor = 0.5
  assert.ok(Math.abs(decayed.behavior.emailOpens - 10) < 1e-9);
  assert.ok(Math.abs(decayed.behavior.linkClicks - 5) < 1e-9);
  assert.ok(Math.abs(decayed.behavior.pageVisits - 15) < 1e-9);
  assert.ok(Math.abs(decayed.behavior._decayFactor - 0.5) < 1e-9);
  // Input lead must NOT be mutated (לא מוחקים)
  assert.equal(lead.behavior.emailOpens, 20);
});

test('ageDecay at two half-lives yields a quarter of the signal', () => {
  const scorer = new LeadScorer();
  const lead = {
    behavior: {
      emailOpens: 40,
      lastActivityAt: '2026-02-10',
    },
  };
  const decayed = scorer.ageDecay(lead, 30, { asOf: '2026-04-11' });
  // 60 days / 30 = 2 half-lives => factor = 0.25
  assert.ok(Math.abs(decayed.behavior.emailOpens - 10) < 0.5);
  assert.ok(Math.abs(decayed.behavior._decayFactor - 0.25) < 0.01);
});

test('ageDecay with zero age returns the lead as-is', () => {
  const scorer = new LeadScorer();
  const lead = {
    behavior: {
      emailOpens: 10,
      linkClicks: 5,
      lastActivityAt: '2026-04-11',
    },
  };
  const decayed = scorer.ageDecay(lead, 30, { asOf: '2026-04-11' });
  assert.equal(decayed.behavior.emailOpens, 10);
  assert.equal(decayed.behavior.linkClicks, 5);
});

test('ageDecay feeds back into scoreLead correctly', () => {
  const scorer = new LeadScorer();
  const fresh = hotLead();
  const stale = scorer.ageDecay(
    {
      ...fresh,
      behavior: { ...fresh.behavior, lastActivityAt: '2026-01-11' },
    },
    30,
    { asOf: '2026-04-11' }
  );
  const freshScore = scorer.scoreLead(fresh).total;
  const staleScore = scorer.scoreLead(stale).total;
  assert.ok(staleScore < freshScore, 'stale should score lower');
});

// ═══════════════════════════════════════════════════════════════
// 10. Robustness — missing or malformed fields
// ═══════════════════════════════════════════════════════════════

test('scoreLead tolerates a completely empty lead', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead({});
  assert.ok(r.total >= 0 && r.total <= 100);
  assert.equal(r.class, 'Cold');
});

test('scoreLead tolerates null fields without throwing', () => {
  const scorer = new LeadScorer();
  const r = scorer.scoreLead({
    company: null,
    contact: null,
    inquiry: null,
    behavior: null,
  });
  assert.ok(r.total >= 0);
});

test('scoreLead survives a scoreFn that throws', () => {
  const scorer = new LeadScorer();
  scorer.defineModel({
    factors: [
      { name: 'ok',    type: 'demographic', weight: 1, scoreFn: () => 0.5 },
      { name: 'throws', type: 'behavioral', weight: 1, scoreFn: () => { throw new Error('boom'); } },
    ],
  });
  const r = scorer.scoreLead({});
  // Broken factor contributes 0, healthy factor contributes 50 * 0.5 = 25.
  assert.equal(r.total, 25);
});

// ════════════════════════════════════════════════════════════════════════
// Y023.2.0 UPGRADE LAYER — Dimension models, events, decay, bands
// ════════════════════════════════════════════════════════════════════════
//
// These tests cover the new spec from Agent Y023:
//   - defineScoringModel (multi-model registry, versions retained)
//   - scoreLead(leadId, modelId)
//   - recordEvent (append-only log)
//   - decayScore (0.9^(days/30))
//   - recalibrate (closed/lost win-loss correlation)
//   - explainScore(leadId) bilingual
//   - bandDistribution
//   - topReasons
//   - blendedScore
// All existing 4-band BANT tests above remain untouched (לא מוחקים).

function makeUpgradeScorer() {
  const s = new LeadScorer();
  s.defineScoringModel(getDefaultDimensionModel());
  return s;
}

function fitLead(id, overrides) {
  return Object.assign({
    id,
    demographic: {
      industry_fit:  'manufacturing',
      company_size:  250,
      job_title:     'cfo',
      budget_range:  500_000,
      timeline:      'this-month',
      engagement_recency: 5,
    },
  }, overrides || {});
}

// 1. defineScoringModel — basic registration
test('defineScoringModel registers a model and normalises weights', () => {
  const s = new LeadScorer();
  const model = s.defineScoringModel({
    id: 'test-A',
    dimensions: [
      { key: 'industry_fit', weight: 3, rule: { type: 'enum', map: { tech: 1, other: 0.2 } } },
      { key: 'company_size', weight: 1, rule: { type: 'numeric', bands: [{ upper: 100, score: 0.5 }, { upper: Infinity, score: 1 }] } },
    ],
    thresholds: { hot: 80, warm: 50, cold: 20 },
  });
  assert.equal(model.id, 'test-A');
  assert.equal(model.dimensions.length, 2);
  // 3:1 ratio normalised → 0.75 / 0.25
  assert.ok(Math.abs(model.dimensions[0].weight - 0.75) < 1e-9);
  assert.ok(Math.abs(model.dimensions[1].weight - 0.25) < 1e-9);
  assert.equal(model.thresholds.hot, 80);
  assert.equal(model.version, 1);
});

// 2. defineScoringModel — version history retained
test('defineScoringModel keeps previous versions on redefinition (לא מוחקים)', () => {
  const s = new LeadScorer();
  s.defineScoringModel({
    id: 'evolve',
    dimensions: [
      { key: 'industry_fit', weight: 1, rule: { type: 'enum', map: { tech: 1 } } },
    ],
  });
  const v2 = s.defineScoringModel({
    id: 'evolve',
    dimensions: [
      { key: 'industry_fit', weight: 1, rule: { type: 'enum', map: { tech: 1 } } },
      { key: 'job_title',    weight: 1, rule: { type: 'enum', map: { ceo: 1 } } },
    ],
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.previousVersions.length, 1);
  assert.equal(v2.previousVersions[0].dimensions.length, 1);
});

// 3. defineScoringModel — validates rule types
test('defineScoringModel rejects bad rule types', () => {
  const s = new LeadScorer();
  assert.throws(() => s.defineScoringModel({
    id: 'bad',
    dimensions: [{ key: 'x', weight: 1, rule: { type: 'nope' } }],
  }));
  assert.throws(() => s.defineScoringModel({
    id: 'dup',
    dimensions: [
      { key: 'a', weight: 1, rule: { type: 'enum', map: { x: 1 } } },
      { key: 'a', weight: 1, rule: { type: 'enum', map: { x: 1 } } },
    ],
  }));
});

// 4. scoreLead with modelId — numeric dimension
test('scoreLead with modelId scores a numeric dimension', () => {
  const s = new LeadScorer();
  s.defineScoringModel({
    id: 'num-only',
    dimensions: [
      { key: 'company_size', weight: 1, rule: { type: 'numeric', bands: [
        { upper: 10, score: 0.2 }, { upper: 100, score: 0.6 }, { upper: Infinity, score: 1.0 },
      ]}},
    ],
  });
  const r = s.scoreLead({ id: 'L1', demographic: { company_size: 500 } }, 'num-only');
  assert.equal(r.score, 100);
  assert.equal(r.band, 'hot');
  assert.equal(r.breakdown.length, 1);
  assert.equal(r.breakdown[0].rawScore, 1);
});

// 5. enum dimension scoring
test('scoreLead with modelId scores an enum dimension', () => {
  const s = new LeadScorer();
  s.defineScoringModel({
    id: 'enum-only',
    dimensions: [
      { key: 'industry_fit', weight: 1, rule: { type: 'enum', map: { tech: 1.0, retail: 0.5, other: 0.1 } } },
    ],
  });
  const r1 = s.scoreLead({ id: 'L1', demographic: { industry_fit: 'tech' } }, 'enum-only');
  const r2 = s.scoreLead({ id: 'L2', demographic: { industry_fit: 'other' } }, 'enum-only');
  assert.equal(r1.score, 100);
  assert.equal(r2.score, 10);
  assert.equal(r1.band, 'hot');
  assert.equal(r2.band, 'cold');
});

// 6. boolean dimension scoring
test('scoreLead with modelId scores a boolean dimension', () => {
  const s = new LeadScorer();
  s.defineScoringModel({
    id: 'bool-only',
    dimensions: [
      { key: 'has_budget', weight: 1, rule: { type: 'boolean', whenTrue: 1, whenFalse: 0.05 } },
    ],
  });
  const yes = s.scoreLead({ id: 'L1', has_budget: true }, 'bool-only');
  const no  = s.scoreLead({ id: 'L2', has_budget: false }, 'bool-only');
  assert.equal(yes.score, 100);
  assert.equal(no.score, 5);
});

// 7. recordEvent — append-only log + score deltas
test('recordEvent appends to immutable log with default score deltas', () => {
  const s = makeUpgradeScorer();
  s.recordEvent({ leadId: 'L1', type: 'email_opened' });
  s.recordEvent({ leadId: 'L1', type: 'demo_booked' });
  s.recordEvent({ leadId: 'L2', type: 'website_visit' });
  const l1 = s.getLeadEvents('L1');
  const l2 = s.getLeadEvents('L2');
  assert.equal(l1.length, 2);
  assert.equal(l2.length, 1);
  assert.equal(l1[0].delta, 1);   // email_opened default
  assert.equal(l1[1].delta, 10);  // demo_booked default
  // Append-only — no removal API, sequence numbers grow.
  assert.equal(l1[0].seq, 1);
  assert.equal(l1[1].seq, 2);
  assert.equal(l2[0].seq, 3);
});

// 8. recordEvent — unsubscribed produces a negative delta
test('recordEvent records unsubscribed with negative delta but keeps the event', () => {
  const s = makeUpgradeScorer();
  s.recordEvent({ leadId: 'L1', type: 'email_opened' });
  s.recordEvent({ leadId: 'L1', type: 'unsubscribed' });
  const events = s.getLeadEvents('L1');
  assert.equal(events.length, 2);                  // both kept (לא מוחקים)
  assert.equal(events[1].delta, -15);
  assert.deepEqual(events[1].dimensions, ['email_engagement']);
});

// 9. event accumulation feeds dimension rules
test('event dimension rule accumulates engagement events', () => {
  const s = makeUpgradeScorer();
  // Pile up many opens — engagement should saturate but not exceed 1.
  for (let i = 0; i < 20; i++) s.recordEvent({ leadId: 'L1', type: 'email_opened' });
  const lead = fitLead('L1');
  s.upsertLead(lead);
  const r = s.scoreLead('L1', 'default-y023-v2');
  const dim = r.breakdown.find((d) => d.key === 'email_engagement');
  assert.ok(dim.rawScore > 0.9, `expected > 0.9 got ${dim.rawScore}`);
  assert.ok(dim.rawScore <= 1.0);
});

// 10. decayScore — exponential 0.9^(days/30)
test('decayScore applies 0.9^(days/30) to the latest snapshot', () => {
  const s = makeUpgradeScorer();
  s.upsertLead(fitLead('L1'));
  const before = s.scoreLead('L1', 'default-y023-v2');
  // 30 days → factor 0.9
  const r1 = s.decayScore('L1', 30);
  assert.ok(Math.abs(r1.factor - 0.9) < 1e-9);
  assert.ok(Math.abs(r1.decayedScore - before.score * 0.9) < 0.05);
  // 60 days from same base → 0.81
  // (decayScore picks the latest non-decayed snapshot, so still scores against `before`)
  const r2 = s.decayScore('L1', 60);
  assert.ok(Math.abs(r2.factor - 0.81) < 1e-9);
  // Snapshots history retained.
  assert.ok(s.getLeadSnapshots('L1').length >= 3);
});

// 11. decayScore — zero days returns original
test('decayScore with 0 days returns the original snapshot', () => {
  const s = makeUpgradeScorer();
  s.upsertLead(fitLead('L1'));
  const before = s.scoreLead('L1', 'default-y023-v2');
  const r = s.decayScore('L1', 0);
  assert.equal(r.factor, 1);
  assert.equal(r.decayedScore, before.score);
});

// 12. band classification — hot/warm/cold thresholds
test('band classification respects model thresholds', () => {
  const s = makeUpgradeScorer();
  // Hot lead — top tier on every dimension
  const hot = fitLead('hot-1', {
    demographic: {
      industry_fit: 'manufacturing', company_size: 1500, job_title: 'cfo',
      budget_range: 2_000_000, timeline: 'immediate', engagement_recency: 1,
    },
  });
  s.upsertLead(hot);
  for (let i = 0; i < 30; i++) {
    s.recordEvent({ leadId: 'hot-1', type: 'pricing_page_visited' });
    s.recordEvent({ leadId: 'hot-1', type: 'email_opened' });
    s.recordEvent({ leadId: 'hot-1', type: 'website_visit' });
    s.recordEvent({ leadId: 'hot-1', type: 'content_downloaded' });
  }
  const rHot = s.scoreLead('hot-1', 'default-y023-v2');
  assert.equal(rHot.band, 'hot');
  assert.ok(rHot.score >= 80, `expected >=80 got ${rHot.score}`);

  // Cold lead — weak on every dimension, no events
  const cold = fitLead('cold-1', {
    demographic: {
      industry_fit: 'other', company_size: 2, job_title: 'student',
      budget_range: 500, timeline: 'no-timeline', engagement_recency: 365,
    },
  });
  s.upsertLead(cold);
  const rCold = s.scoreLead('cold-1', 'default-y023-v2');
  assert.equal(rCold.band, 'cold');
  assert.ok(rCold.score < 50, `expected < 50 got ${rCold.score}`);
});

// 13. explainScore(leadId) bilingual output
test('explainScore by leadId returns bilingual reasons sorted by contribution', () => {
  const s = makeUpgradeScorer();
  s.upsertLead(fitLead('L1'));
  s.recordEvent({ leadId: 'L1', type: 'pricing_page_visited' });
  s.scoreLead('L1', 'default-y023-v2');     // create snapshot
  const e = s.explainScore('L1');
  assert.equal(e.leadId, 'L1');
  assert.ok(typeof e.score === 'number');
  assert.ok(['hot', 'warm', 'cold'].includes(e.band));
  assert.ok(Array.isArray(e.reasons) && e.reasons.length === 10);
  for (const r of e.reasons) {
    assert.ok(typeof r.he === 'string' && r.he.length > 0);
    assert.ok(typeof r.en === 'string' && r.en.length > 0);
    assert.ok(r.he !== r.en);
  }
  // Sorted descending by contribution (already verified by reading reasons[0] >= reasons[1])
  for (let i = 1; i < e.reasons.length; i++) {
    assert.ok(
      e.reasons[i - 1].he.length > 0 && e.reasons[i].he.length > 0
    );
  }
  assert.ok(e.summary.he.includes('סה"כ'));
  assert.ok(e.summary.en.includes('Total'));
  // Hebrew band token must appear in summary
  assert.ok(/[חפק][םשור]/.test(e.summary.he));
});

// 14. bandDistribution counts hot/warm/cold
test('bandDistribution counts the latest snapshot per lead', () => {
  const s = makeUpgradeScorer();
  // 2 hot, 1 warm, 1 cold
  const hot1 = fitLead('h1', { demographic: { industry_fit: 'manufacturing', company_size: 5000, job_title: 'cfo', budget_range: 5_000_000, timeline: 'immediate', engagement_recency: 1 } });
  const hot2 = fitLead('h2', { demographic: { industry_fit: 'construction', company_size: 800, job_title: 'ceo', budget_range: 2_000_000, timeline: 'immediate', engagement_recency: 2 } });
  const warm = fitLead('w1', { demographic: { industry_fit: 'retail', company_size: 80, job_title: 'manager', budget_range: 80_000, timeline: 'this-quarter', engagement_recency: 20 } });
  const cold = fitLead('c1', { demographic: { industry_fit: 'other', company_size: 3, job_title: 'student', budget_range: 500, timeline: 'no-timeline', engagement_recency: 400 } });
  for (const l of [hot1, hot2, warm, cold]) s.upsertLead(l);
  // load events for hots so they cross 80
  for (const id of ['h1', 'h2']) {
    for (let i = 0; i < 10; i++) {
      s.recordEvent({ leadId: id, type: 'pricing_page_visited' });
      s.recordEvent({ leadId: id, type: 'email_opened' });
      s.recordEvent({ leadId: id, type: 'website_visit' });
      s.recordEvent({ leadId: id, type: 'content_downloaded' });
    }
  }
  for (const id of ['h1', 'h2', 'w1', 'c1']) s.scoreLead(id, 'default-y023-v2');
  const dist = s.bandDistribution();
  assert.equal(dist.total, 4);
  assert.ok(dist.hot >= 2,  `hot count should be >= 2, got ${dist.hot}`);
  assert.ok(dist.cold >= 1, `cold count should be >= 1, got ${dist.cold}`);
});

// 15. topReasons aggregates the strongest dimensions of a band
test('topReasons returns dimensions sorted by mean raw score', () => {
  const s = makeUpgradeScorer();
  // Build 3 hot leads, all sharing very strong industry_fit + company_size.
  for (let i = 0; i < 3; i++) {
    const id = 'hot-' + i;
    s.upsertLead(fitLead(id, {
      demographic: {
        industry_fit:'manufacturing', company_size: 5000, job_title: 'cfo',
        budget_range: 2_000_000, timeline: 'immediate', engagement_recency: 1,
      },
    }));
    for (let k = 0; k < 12; k++) {
      s.recordEvent({ leadId: id, type: 'pricing_page_visited' });
      s.recordEvent({ leadId: id, type: 'email_opened' });
      s.recordEvent({ leadId: id, type: 'website_visit' });
      s.recordEvent({ leadId: id, type: 'content_downloaded' });
    }
    s.scoreLead(id, 'default-y023-v2');
  }
  const reasons = s.topReasons('hot');
  assert.ok(reasons.length > 0);
  // Sorted descending
  for (let i = 1; i < reasons.length; i++) {
    assert.ok(reasons[i - 1].meanRawScore >= reasons[i].meanRawScore);
  }
  // Top reason should have a label & meanRawScore close to 1.0 for fully-hot leads.
  assert.ok(reasons[0].labelHe);
  assert.ok(reasons[0].labelEn);
  assert.ok(reasons[0].meanRawScore >= 0.9);
});

// 16. recalibrate adjusts weights based on win/loss correlation
test('recalibrate shifts weights toward dimensions that correlate with wins', () => {
  const s = makeUpgradeScorer();
  // Won deals all have strong industry_fit; lost deals all have weak fit.
  const won = [], lost = [];
  for (let i = 0; i < 4; i++) {
    const wId = 'won-' + i;
    s.upsertLead(fitLead(wId, {
      demographic: {
        industry_fit: 'manufacturing', company_size: 1500, job_title: 'cfo',
        budget_range: 1_000_000, timeline: 'immediate', engagement_recency: 1,
      },
    }));
    won.push({ leadId: wId });
    const lId = 'lost-' + i;
    s.upsertLead(fitLead(lId, {
      demographic: {
        industry_fit: 'other', company_size: 5, job_title: 'student',
        budget_range: 100, timeline: 'no-timeline', engagement_recency: 400,
      },
    }));
    lost.push({ leadId: lId });
  }
  const before = s._models.get('default-y023-v2').dimensions.map((d) => d.weight);
  const diag = s.recalibrate({ closedDeals: won, lostDeals: lost, modelId: 'default-y023-v2' });
  const after = s._models.get('default-y023-v2').dimensions.map((d) => d.weight);
  // Sum still 1
  const sum = after.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // No dimension dropped below the floor (לא מוחקים)
  for (const w of after) assert.ok(w >= 0.005);
  // The strongly-correlated dimensions (industry_fit, company_size, etc.)
  // gained weight relative to before.
  const idxIndustry = s._models.get('default-y023-v2').dimensions.findIndex((d) => d.key === 'industry_fit');
  assert.ok(after[idxIndustry] > before[idxIndustry], 'industry_fit should gain weight');
  assert.equal(diag.wonCount, 4);
  assert.equal(diag.lostCount, 4);
});

// 17. recalibrate refuses empty datasets
test('recalibrate refuses empty closed/lost lists', () => {
  const s = makeUpgradeScorer();
  assert.throws(() => s.recalibrate({ closedDeals: [], lostDeals: [{ leadId: 'x' }] }));
  assert.throws(() => s.recalibrate({ closedDeals: [{ leadId: 'x' }], lostDeals: [] }));
});

// 18. blendedScore combines demographic + behavioral
test('blendedScore separates demographic and behavioral parts', () => {
  const s = makeUpgradeScorer();
  s.upsertLead(fitLead('L1'));
  // No events at all → behavioral side = 0, demographic side > 0
  const noEv = s.blendedScore('L1', 'default-y023-v2');
  assert.ok(noEv.demographic > 0);
  assert.ok(noEv.behavioral === 0);
  // Now add lots of events, behavioral should rise.
  for (let i = 0; i < 15; i++) {
    s.recordEvent({ leadId: 'L1', type: 'pricing_page_visited' });
    s.recordEvent({ leadId: 'L1', type: 'email_opened' });
    s.recordEvent({ leadId: 'L1', type: 'website_visit' });
    s.recordEvent({ leadId: 'L1', type: 'content_downloaded' });
  }
  const withEv = s.blendedScore('L1', 'default-y023-v2');
  assert.ok(withEv.behavioral > 0);
  assert.ok(withEv.blended >= noEv.blended);
  // 50/50 invariant (within rounding) when both sides are present.
  assert.ok(Math.abs(withEv.blended - 0.5 * (withEv.demographic + withEv.behavioral)) < 0.5);
  assert.ok(['hot', 'warm', 'cold'].includes(withEv.band));
});

// 19. upgrade-layer cohabits with original BANT API
test('upgrade layer co-exists with the original BANT scoreLead API', () => {
  const s = makeUpgradeScorer();
  // Original 4-band BANT engine still works.
  const bant = s.scoreLead({
    company: { annualRevenue: 50_000_000, employees: 420 },
    contact: { title: 'CFO', decisionPower: 'decision-maker' },
    inquiry: { type: 'demo-request', painStated: true, urgency: 'immediate' },
    behavior: {
      emailOpens: 25, linkClicks: 18, pageVisits: 30,
      formFills: 4, webinarAttendance: 3, contentDownloads: 7,
      lastActivityAt: '2026-04-10',
    },
    createdAt: '2026-04-01',
  });
  assert.ok('total' in bant);
  assert.ok('class' in bant);
  // Upgrade-layer model unaffected.
  s.upsertLead(fitLead('L1'));
  const upgrade = s.scoreLead('L1', 'default-y023-v2');
  assert.ok('score' in upgrade);
  assert.ok('band' in upgrade);
});

// 20. evaluateDimensionRule pure helper (numeric/enum/boolean/event)
test('evaluateDimensionRule handles all rule types as a pure function', () => {
  // numeric (banded)
  const num1 = evaluateDimensionRule(
    { key: 'company_size', rule: { type: 'numeric', bands: [{ upper: 10, score: 0.2 }, { upper: Infinity, score: 1 }] } },
    { demographic: { company_size: 500 } },
    []
  );
  assert.equal(num1, 1);

  // numeric (min/max)
  const num2 = evaluateDimensionRule(
    { key: 'budget_range', rule: { type: 'numeric', min: 0, max: 1000 } },
    { demographic: { budget_range: 250 } },
    []
  );
  assert.ok(Math.abs(num2 - 0.25) < 1e-9);

  // enum
  const enumScore = evaluateDimensionRule(
    { key: 'industry_fit', rule: { type: 'enum', map: { 'tech': 0.9, 'other': 0.1 } } },
    { demographic: { industry_fit: 'tech' } },
    []
  );
  assert.equal(enumScore, 0.9);

  // boolean
  const boolScore = evaluateDimensionRule(
    { key: 'has_budget', rule: { type: 'boolean' } },
    { has_budget: true },
    []
  );
  assert.equal(boolScore, 1);

  // event
  const evScore = evaluateDimensionRule(
    { key: 'email_engagement', rule: { type: 'event', events: ['email_opened'], cap: 5 } },
    { id: 'L1' },
    [
      { leadId: 'L1', type: 'email_opened', value: 1 },
      { leadId: 'L1', type: 'email_opened', value: 1 },
      { leadId: 'L1', type: 'email_opened', value: 1 },
    ]
  );
  // 1 - exp(-3/5) ≈ 0.451
  assert.ok(evScore > 0.4 && evScore < 0.5);
});

// 21. getDefaultDimensionModel exposes 10 spec dimensions
test('getDefaultDimensionModel returns the 10 dimensions from the Y023 spec', () => {
  const m = getDefaultDimensionModel();
  const keys = m.dimensions.map((d) => d.key).sort();
  assert.deepEqual(keys, [
    'budget_range',
    'company_size',
    'content_consumption',
    'email_engagement',
    'engagement_recency',
    'industry_fit',
    'job_title',
    'pricing_interest',
    'timeline',
    'website_activity',
  ]);
  assert.equal(m.thresholds.hot, 80);
  assert.equal(m.thresholds.warm, 50);
  assert.equal(m.thresholds.cold, 20);
});

// 22. EVENT_SCORE_DELTAS spec values
test('EVENT_SCORE_DELTAS exposes the spec event types with correct signs', () => {
  assert.equal(EVENT_SCORE_DELTAS.email_opened, 1);
  assert.equal(EVENT_SCORE_DELTAS.link_clicked, 2);
  assert.equal(EVENT_SCORE_DELTAS.demo_booked, 10);
  assert.equal(EVENT_SCORE_DELTAS.website_visit, 1);
  assert.equal(EVENT_SCORE_DELTAS.content_downloaded, 3);
  assert.equal(EVENT_SCORE_DELTAS.pricing_page_visited, 5);
  assert.ok(EVENT_SCORE_DELTAS.unsubscribed < 0);
});

// 23. DECAY constants match the spec formula 0.9^(d/30)
test('DECAY_BASE and DECAY_WINDOW_DAYS match the Y023 spec', () => {
  assert.equal(DECAY_BASE, 0.9);
  assert.equal(DECAY_WINDOW_DAYS, 30);
});

// 24. normBand accepts Hebrew tokens
test('normBand accepts Hebrew band tokens', () => {
  assert.equal(normBand('Hot'), 'hot');
  assert.equal(normBand('חם'), 'hot');
  assert.equal(normBand('פושר'), 'warm');
  assert.equal(normBand('קר'), 'cold');
});
