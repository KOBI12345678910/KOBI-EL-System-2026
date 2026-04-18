/**
 * Marketing Attribution Model — Unit Tests
 * Agent Y-192 — Techno-Kol Uzi mega-ERP / onyx-procurement
 * Date: 2026-04-11
 *
 * Run with:   node --test test/reporting/attribution.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  AttributionModel,
  CHANNEL_LABELS,
  MODEL_NAMES,
  MODEL_LABELS,
  __internal__,
} = require(path.resolve(__dirname, '..', '..', 'src', 'reporting', 'attribution.js'));

const { CREDIT_EPSILON, sumCredits } = __internal__;

// ─── fixtures ──────────────────────────────────────────────────────────────

function ts(daysFromBase) {
  const base = Date.UTC(2026, 3, 1, 0, 0, 0); // 2026-04-01
  return new Date(base + daysFromBase * 24 * 60 * 60 * 1000).toISOString();
}

function makeSimpleJourney() {
  return {
    id: 'J-001',
    touchpoints: [
      { channel: 'google_ads', timestamp: ts(0) },
      { channel: 'facebook',   timestamp: ts(2) },
      { channel: 'email',      timestamp: ts(5) },
      { channel: 'direct',     timestamp: ts(10) },
    ],
    converted: true,
    revenue: 10000,
  };
}

function makeLongJourney() {
  return {
    id: 'J-002',
    touchpoints: [
      { channel: 'organic',    timestamp: ts(0) },
      { channel: 'google_ads', timestamp: ts(1) },
      { channel: 'facebook',   timestamp: ts(3) },
      { channel: 'instagram',  timestamp: ts(4) },
      { channel: 'email',      timestamp: ts(6) },
      { channel: 'whatsapp',   timestamp: ts(8) },
      { channel: 'direct',     timestamp: ts(12) },
    ],
    converted: true,
    revenue: 25000,
  };
}

function makeSingleTouchJourney() {
  return {
    id: 'J-003',
    touchpoints: [
      { channel: 'direct', timestamp: ts(0) },
    ],
    converted: true,
    revenue: 500,
  };
}

function makeNonConvertedJourney() {
  return {
    id: 'J-004',
    touchpoints: [
      { channel: 'facebook',  timestamp: ts(0) },
      { channel: 'instagram', timestamp: ts(2) },
    ],
    converted: false,
    revenue: 0,
  };
}

function makeMultiJourneyCorpus() {
  return [
    makeSimpleJourney(),
    makeLongJourney(),
    makeSingleTouchJourney(),
    makeNonConvertedJourney(),
    {
      id: 'J-005',
      touchpoints: [
        { channel: 'google_ads', timestamp: ts(0) },
        { channel: 'google_ads', timestamp: ts(1) },
        { channel: 'direct',     timestamp: ts(3) },
      ],
      converted: true,
      revenue: 7500,
    },
  ];
}

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// ─── 1. First-Touch ────────────────────────────────────────────────────────

test('firstTouch assigns 100% credit to the first touchpoint', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const credits = model.firstTouch(j);
  assert.equal(credits.google_ads, 1);
  assert.equal(credits.facebook, undefined);
  assert.equal(credits.email, undefined);
  assert.equal(credits.direct, undefined);
  assert.ok(approxEqual(sumCredits(credits), 1));
});

// ─── 2. Last-Touch ─────────────────────────────────────────────────────────

test('lastTouch assigns 100% credit to the last touchpoint', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const credits = model.lastTouch(j);
  assert.equal(credits.direct, 1);
  assert.equal(credits.google_ads, undefined);
  assert.ok(approxEqual(sumCredits(credits), 1));
});

// ─── 3. Linear ─────────────────────────────────────────────────────────────

test('linear splits credit evenly across all touchpoints', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const credits = model.linear(j);
  assert.ok(approxEqual(credits.google_ads, 0.25));
  assert.ok(approxEqual(credits.facebook,   0.25));
  assert.ok(approxEqual(credits.email,      0.25));
  assert.ok(approxEqual(credits.direct,     0.25));
  assert.ok(approxEqual(sumCredits(credits), 1));
});

test('linear stacks credit for repeated channels in the same journey', () => {
  const model = new AttributionModel();
  const j = {
    id: 'J-dup',
    touchpoints: [
      { channel: 'email', timestamp: ts(0) },
      { channel: 'email', timestamp: ts(1) },
      { channel: 'email', timestamp: ts(2) },
      { channel: 'direct', timestamp: ts(3) },
    ],
    converted: true,
    revenue: 1000,
  };
  const credits = model.linear(j);
  assert.ok(approxEqual(credits.email,  0.75));
  assert.ok(approxEqual(credits.direct, 0.25));
});

// ─── 4. Time-Decay ─────────────────────────────────────────────────────────

test('timeDecay weights recent touchpoints more than older ones', () => {
  const model = new AttributionModel({ halfLifeDays: 7 });
  const j = makeSimpleJourney();
  const credits = model.timeDecay(j);
  // Last touch (direct) should have the highest share
  assert.ok(credits.direct > credits.google_ads);
  assert.ok(credits.direct > credits.facebook);
  assert.ok(credits.direct > credits.email);
  assert.ok(approxEqual(sumCredits(credits), 1));
});

test('timeDecay with very short half-life concentrates on last touch', () => {
  const model = new AttributionModel({ halfLifeDays: 0.5 });
  const j = makeSimpleJourney();
  const credits = model.timeDecay(j);
  // The last touch should have overwhelming share because anything older
  // than ~1 day loses most of its weight.
  assert.ok(credits.direct > 0.9);
});

test('timeDecay with very long half-life approximates linear', () => {
  const model = new AttributionModel({ halfLifeDays: 100000 });
  const j = makeSimpleJourney();
  const credits = model.timeDecay(j);
  // Every touch should be very close to 0.25
  for (const ch of ['google_ads', 'facebook', 'email', 'direct']) {
    assert.ok(Math.abs(credits[ch] - 0.25) < 0.01, `${ch} should be ~0.25, got ${credits[ch]}`);
  }
});

// ─── 5. Position-Based (U-Shaped) ─────────────────────────────────────────

test('positionBased gives 40/20/40 split for 4-touch journey by default', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const credits = model.positionBased(j);
  // First: 0.40, Last: 0.40, 2 middle touches share 0.20 → 0.10 each
  assert.ok(approxEqual(credits.google_ads, 0.40));
  assert.ok(approxEqual(credits.direct,     0.40));
  assert.ok(approxEqual(credits.facebook,   0.10));
  assert.ok(approxEqual(credits.email,      0.10));
  assert.ok(approxEqual(sumCredits(credits), 1));
});

test('positionBased with 1 touchpoint gives 100% to it', () => {
  const model = new AttributionModel();
  const credits = model.positionBased(makeSingleTouchJourney());
  assert.equal(credits.direct, 1);
});

test('positionBased with 2 touchpoints splits 50/50 by default weights', () => {
  const model = new AttributionModel();
  const j = {
    id: 'J-2tp',
    touchpoints: [
      { channel: 'google_ads', timestamp: ts(0) },
      { channel: 'email',      timestamp: ts(3) },
    ],
    converted: true,
    revenue: 1000,
  };
  const credits = model.positionBased(j);
  assert.ok(approxEqual(credits.google_ads, 0.5));
  assert.ok(approxEqual(credits.email, 0.5));
});

// ─── 6. Markov chain removal-effect ───────────────────────────────────────

test('markov returns a valid probability distribution summing to 1', () => {
  const model = new AttributionModel();
  const journeys = makeMultiJourneyCorpus();
  const credits = model.markov(journeys);
  const total = sumCredits(credits);
  assert.ok(Math.abs(total - 1) < 1e-6, `markov credits should sum to 1, got ${total}`);
  // All values must be non-negative.
  for (const ch of Object.keys(credits)) {
    assert.ok(credits[ch] >= 0, `channel ${ch} has negative credit`);
  }
});

test('markov assigns more credit to channels with higher conversion impact', () => {
  const model = new AttributionModel();
  // Build a corpus where `direct` appears only in converted journeys, and
  // `tiktok` appears only in non-converted journeys. Direct must end up
  // with markedly more credit than tiktok.
  const journeys = [
    { id: 'A', touchpoints: [{ channel: 'organic' }, { channel: 'direct' }], converted: true, revenue: 1000 },
    { id: 'B', touchpoints: [{ channel: 'organic' }, { channel: 'direct' }], converted: true, revenue: 1000 },
    { id: 'C', touchpoints: [{ channel: 'organic' }, { channel: 'direct' }], converted: true, revenue: 1000 },
    { id: 'D', touchpoints: [{ channel: 'tiktok' }],  converted: false, revenue: 0 },
    { id: 'E', touchpoints: [{ channel: 'tiktok' }],  converted: false, revenue: 0 },
  ];
  const credits = model.markov(journeys);
  assert.ok((credits.direct || 0) > (credits.tiktok || 0));
});

// ─── 7. Revenue attribution ───────────────────────────────────────────────

test('attributeRevenue multiplies credit by journey revenue (first_touch)', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const revenue = model.attributeRevenue(j, 'first_touch');
  assert.equal(revenue.google_ads, 10000);
});

test('attributeRevenue multiplies credit by journey revenue (linear)', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const revenue = model.attributeRevenue(j, 'linear');
  assert.ok(approxEqual(revenue.google_ads, 2500));
  assert.ok(approxEqual(revenue.facebook,   2500));
  assert.ok(approxEqual(revenue.email,      2500));
  assert.ok(approxEqual(revenue.direct,     2500));
});

test('attributeRevenue throws on unknown model', () => {
  const model = new AttributionModel();
  assert.throws(() => model.attributeRevenue(makeSimpleJourney(), 'bogus'));
});

// ─── 8. Empty & edge cases ─────────────────────────────────────────────────

test('empty journey returns empty credit map for every model', () => {
  const model = new AttributionModel();
  const j = { id: 'J-empty', touchpoints: [], converted: false, revenue: 0 };
  assert.equal(Object.keys(model.firstTouch(j)).length, 0);
  assert.equal(Object.keys(model.lastTouch(j)).length, 0);
  assert.equal(Object.keys(model.linear(j)).length, 0);
  assert.equal(Object.keys(model.timeDecay(j)).length, 0);
  assert.equal(Object.keys(model.positionBased(j)).length, 0);
});

// ─── 9. compareModels ─────────────────────────────────────────────────────

test('compareModels returns credits for every model', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const comp = model.compareModels(j);
  for (const m of MODEL_NAMES) {
    assert.ok(comp[m], `missing model ${m}`);
    assert.equal(typeof comp[m], 'object');
  }
  // first_touch must credit google_ads
  assert.equal(comp.first_touch.google_ads, 1);
  // last_touch must credit direct
  assert.equal(comp.last_touch.direct, 1);
});

// ─── 10. compareModelsAcrossJourneys ──────────────────────────────────────

test('compareModelsAcrossJourneys aggregates revenue per model', () => {
  const model = new AttributionModel();
  const journeys = makeMultiJourneyCorpus();
  const result = model.compareModelsAcrossJourneys(journeys);
  // Total revenue attributed by first_touch must equal total converted revenue
  const totalConvertedRevenue = journeys
    .filter((j) => j.converted)
    .reduce((acc, j) => acc + j.revenue, 0);
  const firstTouchTotal = Object.values(result.first_touch).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(firstTouchTotal - totalConvertedRevenue) < 1e-6,
    `first_touch total should be ${totalConvertedRevenue}, got ${firstTouchTotal}`);
});

test('compareModelsAcrossJourneys excludes non-converted journeys from linear revenue', () => {
  const model = new AttributionModel();
  const journeys = [
    { id: 'conv',    touchpoints: [{ channel: 'email' }], converted: true,  revenue: 1000 },
    { id: 'noconv',  touchpoints: [{ channel: 'email' }], converted: false, revenue: 999999 },
  ];
  const result = model.compareModelsAcrossJourneys(journeys);
  assert.ok(approxEqual(result.linear.email || 0, 1000));
});

// ─── 11. generateReport bilingual ─────────────────────────────────────────

test('generateReport produces a bilingual report by default', () => {
  const model = new AttributionModel();
  const journeys = makeMultiJourneyCorpus();
  const report = model.generateReport(journeys);
  assert.equal(typeof report, 'string');
  // English header
  assert.ok(report.includes('Marketing Attribution Report'));
  // Hebrew header
  assert.ok(report.includes('דו"ח ייחוס שיווקי'));
  // Every model label should be present
  assert.ok(report.includes('First Touch'));
  assert.ok(report.includes('Last Touch'));
  assert.ok(report.includes('Linear'));
  assert.ok(report.includes('Time Decay'));
  assert.ok(report.includes('Position'));
  assert.ok(report.includes('Markov'));
  // Hebrew model names
  assert.ok(report.includes('מגע ראשון'));
  assert.ok(report.includes('מגע אחרון'));
  assert.ok(report.includes('ליניארי'));
  assert.ok(report.includes('שרשרת מרקוב'));
});

test('generateReport honours locale="en" and locale="he"', () => {
  const model = new AttributionModel();
  const journeys = makeMultiJourneyCorpus();
  const en = model.generateReport(journeys, { locale: 'en' });
  const he = model.generateReport(journeys, { locale: 'he' });
  assert.ok(en.includes('Total journeys'));
  assert.ok(!en.includes('מגע ראשון'));
  assert.ok(he.includes('סה"כ מסעות לקוח'));
  assert.ok(!he.includes('Total journeys'));
});

// ─── 12. Determinism ──────────────────────────────────────────────────────

test('all models are fully deterministic — same input, same output', () => {
  const model1 = new AttributionModel();
  const model2 = new AttributionModel();
  const journeys = makeMultiJourneyCorpus();

  const a1 = JSON.stringify(model1.compareModelsAcrossJourneys(journeys));
  const a2 = JSON.stringify(model2.compareModelsAcrossJourneys(journeys));
  const a3 = JSON.stringify(model1.compareModelsAcrossJourneys(journeys));
  assert.equal(a1, a2);
  assert.equal(a1, a3);

  const r1 = model1.generateReport(journeys);
  const r2 = model2.generateReport(journeys);
  assert.equal(r1, r2);
});

// ─── 13. Input immutability ──────────────────────────────────────────────

test('models never mutate the input journey', () => {
  const model = new AttributionModel();
  const j = makeLongJourney();
  const snapshot = JSON.stringify(j);
  model.firstTouch(j);
  model.lastTouch(j);
  model.linear(j);
  model.timeDecay(j);
  model.positionBased(j);
  model.markov([j]);
  model.compareModels(j);
  assert.equal(JSON.stringify(j), snapshot, 'journey was mutated');
});

// ─── 14. Channel label bilingual map ─────────────────────────────────────

test('CHANNEL_LABELS includes Hebrew labels for every canonical channel', () => {
  const required = ['google_ads', 'facebook', 'email', 'direct', 'whatsapp', 'organic'];
  for (const ch of required) {
    assert.ok(CHANNEL_LABELS[ch], `missing ${ch} in CHANNEL_LABELS`);
    assert.equal(typeof CHANNEL_LABELS[ch].en, 'string');
    assert.equal(typeof CHANNEL_LABELS[ch].he, 'string');
    assert.ok(CHANNEL_LABELS[ch].en.length > 0);
    assert.ok(CHANNEL_LABELS[ch].he.length > 0);
  }
});

// ─── 15. Markov convergence & robustness ─────────────────────────────────

test('markov handles single-channel corpus without throwing', () => {
  const model = new AttributionModel();
  const journeys = [
    { id: 'solo1', touchpoints: [{ channel: 'email' }], converted: true, revenue: 1000 },
    { id: 'solo2', touchpoints: [{ channel: 'email' }], converted: true, revenue: 500 },
  ];
  const credits = model.markov(journeys);
  // Only one channel → it gets all the credit.
  assert.ok(approxEqual(credits.email, 1));
});

test('markov falls back gracefully on all-non-converted corpus', () => {
  const model = new AttributionModel();
  const journeys = [
    { id: 'nope1', touchpoints: [{ channel: 'tv' }, { channel: 'radio' }], converted: false, revenue: 0 },
    { id: 'nope2', touchpoints: [{ channel: 'radio' }], converted: false, revenue: 0 },
  ];
  const credits = model.markov(journeys);
  // With zero baseline, the engine falls back to a uniform distribution.
  assert.ok(credits.tv !== undefined);
  assert.ok(credits.radio !== undefined);
  assert.ok(Math.abs(sumCredits(credits) - 1) < 1e-6);
});

// ─── 16. Custom position weights ─────────────────────────────────────────

test('positionBased respects custom first/last weights', () => {
  const model = new AttributionModel();
  const j = makeSimpleJourney();
  const credits = model.positionBased(j, { firstWeight: 0.5, lastWeight: 0.3 });
  assert.ok(approxEqual(credits.google_ads, 0.5));
  assert.ok(approxEqual(credits.direct, 0.3));
  // 0.2 split across 2 middle touches
  assert.ok(approxEqual(credits.facebook, 0.1));
  assert.ok(approxEqual(credits.email, 0.1));
});

// ─── 17. Type guards ──────────────────────────────────────────────────────

test('every method throws TypeError on non-object journey', () => {
  const model = new AttributionModel();
  assert.throws(() => model.firstTouch(null), TypeError);
  assert.throws(() => model.lastTouch('nope'), TypeError);
  assert.throws(() => model.linear(42), TypeError);
  assert.throws(() => model.timeDecay(undefined), TypeError);
  assert.throws(() => model.positionBased(true), TypeError);
  assert.throws(() => model.markov('nope'), TypeError);
  assert.throws(() => model.compareModelsAcrossJourneys('nope'), TypeError);
});

// ─── 18. Sum-to-one invariant across models ──────────────────────────────

test('every model except markov on a single empty journey sums to exactly 1', () => {
  const model = new AttributionModel();
  const j = makeLongJourney();
  const ft = sumCredits(model.firstTouch(j));
  const lt = sumCredits(model.lastTouch(j));
  const ln = sumCredits(model.linear(j));
  const td = sumCredits(model.timeDecay(j));
  const pb = sumCredits(model.positionBased(j));
  assert.ok(Math.abs(ft - 1) < CREDIT_EPSILON);
  assert.ok(Math.abs(lt - 1) < CREDIT_EPSILON);
  assert.ok(Math.abs(ln - 1) < CREDIT_EPSILON);
  assert.ok(Math.abs(td - 1) < 1e-6);
  assert.ok(Math.abs(pb - 1) < 1e-6);
});
