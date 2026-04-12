/**
 * Upsell / Cross-sell Suggester — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent Y020
 *
 * Run with:  node --test test/sales/upsell.test.js
 *
 * Uses only the Node built-in test runner — zero external deps.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  Upseller,
  DEFAULTS,
  runApriori,
  deriveRules,
  buildItemItemVectors,
  buildSeasonalIndex,
  cosineSim,
  weekOfYear,
  sortedUnique,
  explainRule,
  evaluateOne,
  evaluateMany,
} = require(path.resolve(__dirname, '..', '..', 'src', 'sales', 'upsell.js'));

// ─────────────────────────────────────────────────────────────
// Synthetic data helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build an order-history with a KNOWN planted association:
 *    WHENEVER SKU-A is in an order, SKU-B is in that order 80% of the time.
 * Plus background noise so Apriori has to separate signal from noise.
 */
function buildPlantedHistory(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const items = [];
    // 50% of orders contain A
    const hasA = i % 2 === 0;
    if (hasA) items.push('SKU-A');
    // If A is present, B in 80% of those orders
    if (hasA && i % 10 !== 0) items.push('SKU-B');
    // C appears independently in 20% of orders
    if (i % 5 === 0) items.push('SKU-C');
    // Rotating filler items
    items.push('SKU-F' + (i % 7));
    out.push({
      id: 'ord-' + String(i).padStart(4, '0'),
      customerId: 'cust-' + (i % 11),
      date: '2026-' + String((i % 12) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0'),
      items,
    });
  }
  return out;
}

/**
 * A very strict "market-basket" data set used to verify exact
 * support / confidence / lift values by hand.
 *
 *   Transactions (N=10):
 *     1: {A, B, C}
 *     2: {A, B}
 *     3: {A, B, D}
 *     4: {A, C}
 *     5: {A, B, C}
 *     6: {B, C}
 *     7: {A}
 *     8: {B, D}
 *     9: {A, C, D}
 *    10: {A, B}
 *
 *   Single-item counts:
 *     count(A) = 8, count(B) = 7, count(C) = 5, count(D) = 3
 *
 *   Pair counts:
 *     {A,B}=5, {A,C}=4, {A,D}=2, {B,C}=3, {B,D}=2, {C,D}=1
 *
 *   support(A)=0.8, support(B)=0.7, support(C)=0.5, support(D)=0.3
 *
 *   Key rules (confidence, lift):
 *     A→B:  5/8 = 0.625,  lift = 0.625/0.7 ≈ 0.8929
 *     B→A:  5/7 ≈ 0.7143, lift ≈ 0.8929
 *     A→C:  4/8 = 0.500,  lift = 0.500/0.5 = 1.0000
 *     C→A:  4/5 = 0.800,  lift = 0.800/0.8 = 1.0000
 *     B→C:  3/7 ≈ 0.4286, lift ≈ 0.8571
 *     C→B:  3/5 = 0.600,  lift ≈ 0.8571
 *     D→A:  2/3 ≈ 0.6667, lift ≈ 0.8333
 *     D→B:  2/3 ≈ 0.6667, lift ≈ 0.9524
 *
 * So with the default minLift=1.5 this dataset produces NO rules.
 * We use a loosened model (minLift=0.5, minConfidence=0.3) to
 * verify numeric outputs.
 */
const STRICT_TXS = [
  { id: 't1', items: ['A', 'B', 'C'] },
  { id: 't2', items: ['A', 'B'] },
  { id: 't3', items: ['A', 'B', 'D'] },
  { id: 't4', items: ['A', 'C'] },
  { id: 't5', items: ['A', 'B', 'C'] },
  { id: 't6', items: ['B', 'C'] },
  { id: 't7', items: ['A'] },
  { id: 't8', items: ['B', 'D'] },
  { id: 't9', items: ['A', 'C', 'D'] },
  { id: 't10', items: ['A', 'B'] },
];

// ═══════════════════════════════════════════════════════════════
// 1. Utilities sanity
// ═══════════════════════════════════════════════════════════════

test('sortedUnique: deterministic and unique', () => {
  assert.deepEqual(sortedUnique(['b', 'a', 'c', 'a']), ['a', 'b', 'c']);
  assert.deepEqual(sortedUnique([]), []);
  assert.deepEqual(sortedUnique([null, undefined, 'x']), ['x']);
});

test('weekOfYear: valid ISO week numbers', () => {
  const w1 = weekOfYear('2026-01-05'); // Monday of week 2 (2026-01-01 is Thursday)
  assert.ok(w1 >= 1 && w1 <= 53);
  const w2 = weekOfYear('2026-06-15');
  assert.ok(w2 >= 22 && w2 <= 26);
  assert.equal(weekOfYear(''), 0);
  assert.equal(weekOfYear('not-a-date'), 0);
});

test('cosineSim: identical vectors = 1, orthogonal = 0', () => {
  const a = new Map([
    ['x', 1],
    ['y', 2],
  ]);
  const b = new Map([
    ['x', 1],
    ['y', 2],
  ]);
  assert.ok(Math.abs(cosineSim(a, b) - 1) < 1e-9);
  const c = new Map([['z', 5]]);
  assert.equal(cosineSim(a, c), 0);
  const d = new Map();
  assert.equal(cosineSim(a, d), 0);
});

// ═══════════════════════════════════════════════════════════════
// 2. Apriori: numeric correctness on hand-checked dataset
// ═══════════════════════════════════════════════════════════════

test('Apriori recovers single-item supports correctly', () => {
  const txs = STRICT_TXS.map((t) => sortedUnique(t.items));
  const ap = runApriori(txs, {
    minSupport: 0.1,
    minConfidence: 0.3,
    minLift: 0.5,
    maxItemsetSize: 3,
  });
  assert.equal(ap.totalTransactions, 10);
  assert.equal(ap.itemCounts.get('A'), 8);
  assert.equal(ap.itemCounts.get('B'), 7);
  assert.equal(ap.itemCounts.get('C'), 5);
  assert.equal(ap.itemCounts.get('D'), 3);
  const singles = ap.frequentItemsets.filter((x) => x.items.length === 1);
  // All 4 items satisfy minSupport=0.1 (3/10 = 0.30 for D, lowest)
  assert.equal(singles.length, 4);
});

test('Apriori recovers pair supports correctly', () => {
  const txs = STRICT_TXS.map((t) => sortedUnique(t.items));
  const ap = runApriori(txs, {
    minSupport: 0.1,
    minConfidence: 0.3,
    minLift: 0.5,
    maxItemsetSize: 3,
  });
  const pairs = ap.frequentItemsets.filter((x) => x.items.length === 2);
  const map = new Map(pairs.map((p) => [p.items.join(','), p.count]));
  assert.equal(map.get('A,B'), 5);
  assert.equal(map.get('A,C'), 4);
  assert.equal(map.get('A,D'), 2);
  assert.equal(map.get('B,C'), 3);
  assert.equal(map.get('B,D'), 2);
  assert.equal(map.get('C,D'), 1);
});

test('deriveRules: confidence calc matches hand-computed values', () => {
  const txs = STRICT_TXS.map((t) => sortedUnique(t.items));
  const ap = runApriori(txs, {
    minSupport: 0.1,
    minConfidence: 0.3,
    minLift: 0.5,
    maxItemsetSize: 3,
  });
  const rules = deriveRules(ap, { minConfidence: 0.3, minLift: 0.5 });
  // Find rule B→A (pair {A,B})
  const bToA = rules.find(
    (r) => r.consequent === 'A' && r.antecedent.length === 1 && r.antecedent[0] === 'B'
  );
  assert.ok(bToA, 'expected rule B→A');
  // confidence = support(A,B) / support(B) = 0.5 / 0.7
  assert.ok(Math.abs(bToA.confidence - 5 / 7) < 1e-9);
  // lift = conf / support(A) = (5/7) / 0.8
  assert.ok(Math.abs(bToA.lift - 5 / 7 / 0.8) < 1e-9);
  // support (joint) = 0.5
  assert.ok(Math.abs(bToA.support - 0.5) < 1e-9);

  const cToA = rules.find(
    (r) => r.consequent === 'A' && r.antecedent.length === 1 && r.antecedent[0] === 'C'
  );
  assert.ok(cToA, 'expected rule C→A');
  // confidence = support(A,C) / support(C) = 0.4 / 0.5 = 0.8
  assert.ok(Math.abs(cToA.confidence - 4 / 5) < 1e-9);
  // lift = 0.8 / support(A) = 0.8 / 0.8 = 1.0
  assert.ok(Math.abs(cToA.lift - 1.0) < 1e-9);
});

test('deriveRules respects minLift threshold', () => {
  const txs = STRICT_TXS.map((t) => sortedUnique(t.items));
  const ap = runApriori(txs, {
    minSupport: 0.1,
    minConfidence: 0.3,
    minLift: 0.5, // permissive
    maxItemsetSize: 3,
  });
  const permissive = deriveRules(ap, { minConfidence: 0.3, minLift: 0.5 });
  const strict = deriveRules(ap, { minConfidence: 0.3, minLift: 1.5 });
  assert.ok(permissive.length > strict.length, 'strict minLift must cull rules');
  // With minLift=1.5 in this dataset, no rules should survive.
  assert.equal(strict.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// 3. Apriori on planted signal
// ═══════════════════════════════════════════════════════════════

test('Upseller recovers planted association A → B from noisy history', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  const history = buildPlantedHistory(200);
  const summary = up.train(history);
  assert.ok(summary.rules > 0, 'expected some rules');
  const rules = up.getRules();
  const aToB = rules.find(
    (r) => r.consequent === 'SKU-B' && r.antecedent.length === 1 && r.antecedent[0] === 'SKU-A'
  );
  assert.ok(aToB, 'expected rule SKU-A → SKU-B');
  // Planted 80% of A-orders also contain B (we used i % 10 !== 0 so 90%)
  assert.ok(aToB.confidence >= 0.7, 'confidence should be high for planted association');
  assert.ok(aToB.lift >= 1.2, 'lift should indicate meaningful association');
});

// ═══════════════════════════════════════════════════════════════
// 4. Cart suggestions — ranking & stability
// ═══════════════════════════════════════════════════════════════

test('suggest(): recommends SKU-B when cart contains SKU-A', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const out = up.suggest({ currentCart: ['SKU-A'], limit: 5 });
  assert.ok(out.length > 0);
  const top = out[0];
  assert.equal(top.item, 'SKU-B');
  assert.equal(top.source, 'apriori');
  assert.ok(top.score > 0);
  assert.ok(top.rule && top.rule.consequent === 'SKU-B');
});

test('suggest(): does not recommend items already in cart', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const out = up.suggest({ currentCart: ['SKU-A', 'SKU-B'], limit: 5 });
  for (const s of out) {
    assert.notEqual(s.item, 'SKU-A');
    assert.notEqual(s.item, 'SKU-B');
  }
});

test('suggest(): ranking is stable — two identical calls return identical arrays', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const a = up.suggest({ currentCart: ['SKU-A'], limit: 5 });
  const b = up.suggest({ currentCart: ['SKU-A'], limit: 5 });
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].item, b[i].item);
    assert.equal(a[i].source, b[i].source);
    assert.equal(a[i].score, b[i].score);
  }
});

test('suggest(): respects limit parameter', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const out = up.suggest({ currentCart: ['SKU-A'], limit: 2 });
  assert.ok(out.length <= 2);
});

test('suggest(): collaborative-filtering fallback kicks in when no rules match', () => {
  // Build a dataset where an item has NO Apriori rules but co-occurs.
  const history = [];
  for (let i = 0; i < 30; i++) {
    history.push({ id: 'o' + i, items: ['X', 'Y'] });
  }
  for (let i = 0; i < 30; i++) {
    history.push({ id: 'o' + (100 + i), items: ['Y', 'Z'] });
  }
  const up = new Upseller({ minSupport: 0.4, minConfidence: 0.99, minLift: 5 });
  up.train(history);
  // With very tight thresholds + dataset, rules exist for Y→X and Y→Z only
  // but using cart=[X] we should still get Y (apriori) and Z via cf.
  const out = up.suggest({ currentCart: ['X'], limit: 5 });
  const items = out.map((s) => s.item);
  assert.ok(items.includes('Y') || items.includes('Z'), 'expected some suggestion');
});

// ═══════════════════════════════════════════════════════════════
// 5. Customer-history suggestions
// ═══════════════════════════════════════════════════════════════

test('suggestByCustomerHistory: returns items the customer bought + similar items', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  const history = [
    { id: 'h1', customerId: 'c1', items: ['M', 'N'] },
    { id: 'h2', customerId: 'c1', items: ['M', 'O'] },
    { id: 'h3', customerId: 'c2', items: ['N', 'O'] },
    { id: 'h4', customerId: 'c3', items: ['P', 'Q'] },
  ];
  // pad with noise so training works
  for (let i = 0; i < 50; i++) {
    history.push({ id: 'pad' + i, items: ['M', 'N', 'O'] });
  }
  up.train(history);
  const out = up.suggestByCustomerHistory('c1', 5);
  assert.ok(out.length > 0);
  const items = out.map((s) => s.item);
  // customer c1 bought M, N, O — they should all be present
  // (re-fill suggestions) — at least one of them.
  assert.ok(items.includes('M') || items.includes('N') || items.includes('O'));
});

test('suggestByCustomerHistory: unknown customer → empty', () => {
  const up = new Upseller();
  up.train([
    { id: '1', customerId: 'a', items: ['X', 'Y'] },
    { id: '2', customerId: 'a', items: ['Y', 'Z'] },
  ]);
  const out = up.suggestByCustomerHistory('no-such-customer', 5);
  assert.deepEqual(out, []);
});

// ═══════════════════════════════════════════════════════════════
// 6. Seasonality
// ═══════════════════════════════════════════════════════════════

test('suggestBySeasonality: boosts items popular in the week-of-year', () => {
  const history = [];
  // Item WINTER only appears in January orders
  for (let i = 1; i <= 15; i++) {
    history.push({
      id: 'w' + i,
      items: ['WINTER', 'BASIC'],
      date: '2026-01-' + String(i).padStart(2, '0'),
    });
  }
  // Item SUMMER only appears in July orders
  for (let i = 1; i <= 15; i++) {
    history.push({
      id: 's' + i,
      items: ['SUMMER', 'BASIC'],
      date: '2026-07-' + String(i).padStart(2, '0'),
    });
  }
  const up = new Upseller({ minSupport: 0.05 });
  up.train(history);

  const winter = up.suggestBySeasonality({ date: '2026-01-10', limit: 5, halfWindow: 0 });
  const summer = up.suggestBySeasonality({ date: '2026-07-10', limit: 5, halfWindow: 0 });
  const winterItems = winter.map((s) => s.item);
  const summerItems = summer.map((s) => s.item);

  assert.ok(winterItems.includes('WINTER'));
  assert.ok(!winterItems.includes('SUMMER'));
  assert.ok(summerItems.includes('SUMMER'));
  assert.ok(!summerItems.includes('WINTER'));
});

// ═══════════════════════════════════════════════════════════════
// 7. Bilingual explanations
// ═══════════════════════════════════════════════════════════════

test('explainRule: bilingual and mentions confidence + lift', () => {
  const r = {
    antecedent: ['A'],
    consequent: 'B',
    support: 0.5,
    confidence: 0.8,
    lift: 1.6,
  };
  const exp = explainRule(r);
  assert.ok(exp.he.length > 0);
  assert.ok(exp.en.length > 0);
  assert.ok(exp.he.includes('B'));
  assert.ok(exp.en.includes('A'));
  assert.ok(exp.en.includes('80.0%'));
  assert.ok(exp.en.includes('1.60'));
  // Hebrew text should include the bought/also-bought phrasing
  assert.ok(/קנו/.test(exp.he));
});

test('explainSuggestion: returns stored reasoning for a suggestion object', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const out = up.suggest({ currentCart: ['SKU-A'], limit: 1 });
  assert.ok(out.length > 0);
  const exp = up.explainSuggestion(out[0]);
  assert.ok(exp.he.length > 0);
  assert.ok(exp.en.length > 0);
});

// ═══════════════════════════════════════════════════════════════
// 8. Evaluation metrics
// ═══════════════════════════════════════════════════════════════

test('evaluateOne: perfect match → precision=recall=f1=1', () => {
  const m = evaluateOne(['X', 'Y'], ['X', 'Y']);
  assert.equal(m.precision, 1);
  assert.equal(m.recall, 1);
  assert.equal(m.f1, 1);
});

test('evaluateOne: partial match math', () => {
  // predicted {A,B,C}, actual {B,C,D}
  // tp=2, fp=1, fn=1 → p=2/3, r=2/3, f1=2/3
  const m = evaluateOne(['A', 'B', 'C'], ['B', 'C', 'D']);
  assert.ok(Math.abs(m.precision - 2 / 3) < 1e-9);
  assert.ok(Math.abs(m.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(m.f1 - 2 / 3) < 1e-9);
});

test('evaluateOne: disjoint → zero', () => {
  const m = evaluateOne(['A'], ['B']);
  assert.equal(m.precision, 0);
  assert.equal(m.recall, 0);
  assert.equal(m.f1, 0);
});

test('evaluateMany: macro-averaged across rows', () => {
  const preds = [
    ['A', 'B'],
    ['X', 'Y'],
  ];
  const acts = [
    ['A', 'B'],
    ['Y', 'Z'],
  ];
  // row1 p=r=f=1, row2 p=1/2, r=1/2, f=1/2
  const m = evaluateMany(preds, acts);
  assert.ok(Math.abs(m.precision - 0.75) < 1e-9);
  assert.ok(Math.abs(m.recall - 0.75) < 1e-9);
  assert.ok(Math.abs(m.f1 - 0.75) < 1e-9);
});

test('Upseller.evaluate accepts suggestion objects', () => {
  const up = new Upseller();
  up.train(buildPlantedHistory(100));
  const suggestions = [{ item: 'SKU-B' }, { item: 'SKU-X' }];
  const m = up.evaluate(suggestions, ['SKU-B', 'SKU-Y']);
  assert.ok(m.precision === 0.5);
  assert.ok(m.recall === 0.5);
});

// ═══════════════════════════════════════════════════════════════
// 9. Robustness
// ═══════════════════════════════════════════════════════════════

test('train(): handles empty orders gracefully', () => {
  const up = new Upseller();
  const summary = up.train([
    { id: 'x', items: [] },
    { id: 'y', items: null },
    { id: 'z', items: ['A', 'A'] }, // duplicates collapsed
  ]);
  assert.equal(summary.transactions, 1);
  assert.equal(summary.uniqueItems, 1);
});

test('train(): throws on non-array input', () => {
  const up = new Upseller();
  assert.throws(() => up.train('not an array'), TypeError);
});

test('suggest(): throws when model is not trained', () => {
  const up = new Upseller();
  assert.throws(() => up.suggest({ currentCart: ['X'] }), /not trained/);
});

test('suggest(): empty cart returns limited history/seasonal results without crashing', () => {
  const up = new Upseller({ minSupport: 0.05, minConfidence: 0.3, minLift: 1.2 });
  up.train(buildPlantedHistory(200));
  const out = up.suggest({ currentCart: [], customerId: 'cust-1', limit: 5 });
  assert.ok(Array.isArray(out));
});

test('Apriori handles single-item transactions', () => {
  const up = new Upseller({ minSupport: 0.01 });
  const summary = up.train([
    { id: '1', items: ['A'] },
    { id: '2', items: ['A'] },
    { id: '3', items: ['B'] },
  ]);
  assert.equal(summary.transactions, 3);
  assert.equal(summary.uniqueItems, 2);
});

test('Upseller: DEFAULTS has expected fields', () => {
  assert.equal(DEFAULTS.minSupport, 0.01);
  assert.equal(DEFAULTS.minConfidence, 0.3);
  assert.equal(DEFAULTS.minLift, 1.5);
});
