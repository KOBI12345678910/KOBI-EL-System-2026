/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI / Techno-Kol Uzi — Feature Importance Tests
 * בדיקות חשיבות פיצ'רים
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Agent: Y-159
 *
 * Run (mirrors the pattern used by sibling test files in this repo):
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register \
 *       test/ml/feature-importance.test.ts
 *
 * 15+ tests / 15+ בדיקות — pure, deterministic, no I/O, no external deps.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeFeatureImportance,
  createSeededRng,
  discreteMutualInformation,
  equalFrequencyBin,
  meanAbsoluteError,
  meanSquaredError,
  renderBilingualReport,
  topNFeatures,
  zipFeatureNames,
  type BilingualFeatureName,
  type FeatureImportanceInput,
  type PredictFn,
} from '../../src/ml/feature-importance';

/* ─────────────────────────────────────────────────────────────────────────
 * Shared fixtures / נתוני בדיקה משותפים
 * ───────────────────────────────────────────────────────────────────────── */

const FEATURES: BilingualFeatureName[] = [
  { id: 'price', en: 'Unit Price', he: 'מחיר ליחידה' },
  { id: 'qty', en: 'Quantity', he: 'כמות' },
  { id: 'noise', en: 'Noise Column', he: 'עמודת רעש' },
];

/**
 * Deterministic synthetic dataset:
 *   target = 2*price + 5*qty  (no dependency on `noise`).
 *
 * The rows are laid out so that
 *   – `price` and `qty` vary independently,
 *   – `noise` is a deterministic-but-unrelated sine wave.
 *
 * This gives every test a ground truth: a correct analyzer MUST rank
 * `noise` strictly below `price` and `qty`.
 */
function buildLinearDataset(n: number) {
  const rng = createSeededRng(424242);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const price = 10 + Math.floor(rng() * 90); // 10..99
    const qty = 1 + Math.floor(rng() * 20); // 1..20
    const noise = Math.sin(i * 0.37) * 3;
    X.push([price, qty, noise]);
    y.push(2 * price + 5 * qty);
  }
  return { X, y };
}

/** Linear model predict: exactly matches the generator above. */
const linearOraclePredict: PredictFn = (rows) =>
  rows.map((r) => 2 * (r[0] as number) + 5 * (r[1] as number));

/** A broken predictor that ignores every feature. */
const constantPredict: PredictFn = (rows) => rows.map(() => 0);

/* ─────────────────────────────────────────────────────────────────────────
 * Tests / בדיקות
 * ───────────────────────────────────────────────────────────────────────── */

test('01 — meanSquaredError: zero when predictions are perfect', () => {
  assert.equal(meanSquaredError([1, 2, 3], [1, 2, 3]), 0);
});

test('02 — meanSquaredError: basic known value', () => {
  // errors = [1, -1, 2]  ->  squared = [1, 1, 4] -> mean = 2
  assert.equal(meanSquaredError([1, 2, 3], [2, 1, 5]), 2);
});

test('03 — meanAbsoluteError: basic known value', () => {
  // |errors| = [1, 1, 2] -> mean = 4/3
  const mae = meanAbsoluteError([1, 2, 3], [2, 1, 5]);
  assert.ok(Math.abs(mae - 4 / 3) < 1e-9, `mae=${mae}`);
});

test('04 — createSeededRng: deterministic and bounded', () => {
  const a = createSeededRng(7);
  const b = createSeededRng(7);
  for (let i = 0; i < 50; i++) {
    const va = a();
    const vb = b();
    assert.equal(va, vb, `draw #${i} differs`);
    assert.ok(va >= 0 && va < 1, `draw #${i} out of [0,1): ${va}`);
  }
});

test('05 — equalFrequencyBin: assigns expected bin indices', () => {
  const bins = equalFrequencyBin([10, 20, 30, 40, 50, 60], 3);
  // With 3 bins over 6 values, each bin should hold exactly two.
  const counts = new Map<number, number>();
  for (const b of bins) counts.set(b, (counts.get(b) ?? 0) + 1);
  assert.equal(counts.size, 3);
  for (const v of counts.values()) assert.equal(v, 2);
});

test('06 — discreteMutualInformation: zero for independent columns', () => {
  const x = [0, 1, 0, 1, 0, 1, 0, 1];
  const y = [0, 0, 1, 1, 0, 0, 1, 1];
  const mi = discreteMutualInformation(x, y);
  // Four equally-populated cells -> MI should be 0.
  assert.ok(mi < 1e-9, `mi=${mi} should be ~0`);
});

test('07 — discreteMutualInformation: one bit for perfectly matched columns', () => {
  const x = [0, 0, 0, 0, 1, 1, 1, 1];
  const y = [0, 0, 0, 0, 1, 1, 1, 1];
  const mi = discreteMutualInformation(x, y);
  assert.ok(Math.abs(mi - 1) < 1e-9, `mi=${mi} should be 1 bit`);
});

test('08 — analyzeFeatureImportance: detects noise column as least important', () => {
  const { X, y } = buildLinearDataset(80);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 101,
  });
  assert.equal(res.scores.length, 3);
  // The last-ranked (highest rank number) feature must be "noise".
  const last = res.scores[res.scores.length - 1]!;
  assert.equal(last.id, 'noise');
});

test('09 — analyzeFeatureImportance: permutation importance is zero for unused column', () => {
  const { X, y } = buildLinearDataset(60);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 202,
  });
  const noise = res.scores.find((s) => s.id === 'noise')!;
  // The oracle predictor doesn't read noise, so shuffling it cannot
  // change predictions -> permutation importance is exactly 0.
  assert.equal(noise.permutation, 0);
});

test('10 — analyzeFeatureImportance: permutation importance is positive for used columns', () => {
  const { X, y } = buildLinearDataset(60);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 303,
  });
  const price = res.scores.find((s) => s.id === 'price')!;
  const qty = res.scores.find((s) => s.id === 'qty')!;
  assert.ok(price.permutation > 0, `price perm=${price.permutation}`);
  assert.ok(qty.permutation > 0, `qty perm=${qty.permutation}`);
});

test('11 — analyzeFeatureImportance: ranks are strict and 1-based', () => {
  const { X, y } = buildLinearDataset(50);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 404,
  });
  const ranks = res.scores.map((s) => s.rank);
  assert.deepEqual(ranks, [1, 2, 3]);
});

test('12 — analyzeFeatureImportance: combined scores are in [0,1]', () => {
  const { X, y } = buildLinearDataset(40);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 505,
  });
  for (const s of res.scores) {
    assert.ok(s.combined >= 0 && s.combined <= 1, `combined=${s.combined}`);
  }
});

test('13 — analyzeFeatureImportance: deterministic given a seed', () => {
  const { X, y } = buildLinearDataset(40);
  const a = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 999,
    nRepeats: 2,
  });
  const b = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 999,
    nRepeats: 2,
  });
  assert.deepEqual(
    a.scores.map((s) => [s.id, s.permutation, s.combined, s.rank]),
    b.scores.map((s) => [s.id, s.permutation, s.combined, s.rank]),
  );
});

test('14 — analyzeFeatureImportance: constant predictor yields zero permutation importance for all features', () => {
  const { X, y } = buildLinearDataset(30);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: constantPredict,
    seed: 606,
  });
  for (const s of res.scores) {
    assert.equal(s.permutation, 0, `feature ${s.id} perm=${s.permutation}`);
  }
});

test('15 — analyzeFeatureImportance: throws on mismatched y length', () => {
  const { X } = buildLinearDataset(10);
  assert.throws(() =>
    analyzeFeatureImportance({
      X,
      y: [1, 2, 3], // wrong length
      features: FEATURES,
      predict: linearOraclePredict,
    }),
  );
});

test('16 — analyzeFeatureImportance: throws on duplicate feature id', () => {
  const { X, y } = buildLinearDataset(10);
  const dupes: BilingualFeatureName[] = [
    { id: 'x', en: 'X', he: 'איקס' },
    { id: 'x', en: 'X2', he: 'איקס2' },
    { id: 'n', en: 'Noise', he: 'רעש' },
  ];
  assert.throws(() =>
    analyzeFeatureImportance({
      X,
      y,
      features: dupes,
      predict: linearOraclePredict,
    }),
  );
});

test('17 — analyzeFeatureImportance: throws on non-finite cell', () => {
  const features: BilingualFeatureName[] = [
    { id: 'a', en: 'A', he: 'א' },
    { id: 'b', en: 'B', he: 'ב' },
  ];
  const X = [
    [1, 2],
    [3, Number.NaN],
  ];
  const y = [1, 2];
  assert.throws(() =>
    analyzeFeatureImportance({
      X,
      y,
      features,
      predict: () => [0, 0],
    }),
  );
});

test('18 — analyzeFeatureImportance: mutual information peaks on the true driver', () => {
  // y = 4 * drive + small noise, so MI(drive, y) should be highest.
  const rng = createSeededRng(77);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 120; i++) {
    const drive = Math.floor(rng() * 8);
    const decoy = Math.floor(rng() * 8);
    X.push([drive, decoy]);
    y.push(4 * drive);
  }
  const feats: BilingualFeatureName[] = [
    { id: 'drive', en: 'Driver', he: 'משתנה מניע' },
    { id: 'decoy', en: 'Decoy', he: 'משתנה מטעה' },
  ];
  const res = analyzeFeatureImportance({
    X,
    y,
    features: feats,
    predict: (rows) => rows.map((r) => 4 * (r[0] as number)),
    seed: 11,
    miBins: 8,
  });
  const driveScore = res.scores.find((s) => s.id === 'drive')!;
  const decoyScore = res.scores.find((s) => s.id === 'decoy')!;
  assert.ok(
    driveScore.mutualInformation > decoyScore.mutualInformation,
    `MI drive=${driveScore.mutualInformation} decoy=${decoyScore.mutualInformation}`,
  );
});

test('19 — renderBilingualReport: contains Hebrew header and all feature names', () => {
  const { X, y } = buildLinearDataset(30);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 21,
  });
  const report = renderBilingualReport(res);
  assert.ok(report.includes('פיצ\'רים'), 'missing Hebrew header');
  assert.ok(report.includes('Feature Importance'), 'missing English header');
  for (const f of FEATURES) {
    assert.ok(report.includes(f.en), `missing ${f.en}`);
    assert.ok(report.includes(f.he), `missing ${f.he}`);
  }
});

test('20 — zipFeatureNames: builds parallel lists, errors on mismatch', () => {
  const list = zipFeatureNames(
    ['a', 'b'],
    ['A', 'B'],
    ['א', 'ב'],
  );
  assert.equal(list.length, 2);
  assert.equal(list[0]!.he, 'א');
  assert.throws(() => zipFeatureNames(['a'], ['A', 'B'], ['א']));
});

test('21 — topNFeatures: returns requested slice, handles over-large N', () => {
  const { X, y } = buildLinearDataset(25);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 42,
  });
  const top2 = topNFeatures(res, 2);
  assert.equal(top2.length, 2);
  assert.equal(top2[0]!.rank, 1);
  assert.equal(top2[1]!.rank, 2);

  // Asking for more than we have must not crash.
  const top99 = topNFeatures(res, 99);
  assert.equal(top99.length, 3);

  // Non-positive N returns empty array.
  assert.equal(topNFeatures(res, 0).length, 0);
});

test('22 — analyzeFeatureImportance: injectable custom loss (MAE) still ranks correctly', () => {
  const { X, y } = buildLinearDataset(40);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    loss: meanAbsoluteError,
    seed: 13,
  });
  const ids = res.scores.map((s) => s.id);
  // Noise must still land last even under a different loss.
  assert.equal(ids[ids.length - 1], 'noise');
});

test('23 — analyzeFeatureImportance: result metadata matches input shape', () => {
  const { X, y } = buildLinearDataset(55);
  const res = analyzeFeatureImportance({
    X,
    y,
    features: FEATURES,
    predict: linearOraclePredict,
    seed: 555,
    nRepeats: 4,
    miBins: 5,
  });
  assert.equal(res.nSamples, 55);
  assert.equal(res.nFeatures, 3);
  assert.equal(res.nRepeats, 4);
  assert.equal(res.miBins, 5);
  assert.equal(res.seed, 555);
  assert.ok(res.baselineLoss >= 0);
});
