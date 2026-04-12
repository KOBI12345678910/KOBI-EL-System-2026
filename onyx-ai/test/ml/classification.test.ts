/**
 * ONYX AI — Classification Toolkit Tests (Agent Y-157)
 * =====================================================
 * Exercises the classification toolkit exported from
 * `src/ml/classification.ts`. Uses ONLY Node built-ins
 * (`node --test` + `node:assert/strict`) — no external deps.
 *
 * Run with:
 *   npx node --test --require ts-node/register test/ml/classification.test.ts
 *
 * Test count: 20 (>= 15 required).
 * בדיקות דו-לשוניות למערכת הסיווג.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  LogisticRegression,
  GaussianNaiveBayes,
  DecisionStump,
  trainTestSplit,
  kFoldCrossValidate,
  confusionMatrix,
  classificationReport,
  accuracyScore,
  formatConfusionMatrix,
  sigmoid,
  mulberry32,
  shuffleInPlace,
  BILINGUAL_FEATURES,
  translateLabel,
  featureLabelAt,
} from '../../src/ml/classification';
import type {
  FeatureMatrix,
  LabelVector,
  Classifier,
} from '../../src/ml/classification';

// ----------------------------------------------------------------
// Shared fixtures / מערכי דוגמה
// ----------------------------------------------------------------

/** Perfectly separable 2-D dataset (y = 1 if x0 + x1 > 1 else 0). */
function separableBinary(n = 60, seed = 7): { X: FeatureMatrix; y: LabelVector } {
  const rng = mulberry32(seed);
  const X: FeatureMatrix = [];
  const y: LabelVector = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * 2 - 1;
    const b = rng() * 2 - 1;
    X.push([a, b]);
    y.push(a + b > 0 ? 1 : 0);
  }
  return { X, y };
}

/** Three-class Gaussian blobs for Naive Bayes. */
function threeClassGaussian(
  perClass = 40,
  seed = 13,
): { X: FeatureMatrix; y: LabelVector } {
  const rng = mulberry32(seed);
  function normal(): number {
    // Box-Muller
    const u = Math.max(rng(), 1e-9);
    const v = Math.max(rng(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const X: FeatureMatrix = [];
  const y: LabelVector = [];
  const centers: Array<[number, number]> = [
    [0, 0],
    [5, 5],
    [-4, 6],
  ];
  for (let c = 0; c < centers.length; c++) {
    for (let i = 0; i < perClass; i++) {
      X.push([centers[c][0] + normal() * 0.8, centers[c][1] + normal() * 0.8]);
      y.push(c);
    }
  }
  return { X, y };
}

// ================================================================
// 1. Sigmoid boundary behaviour
// ================================================================
test('sigmoid — boundary values and symmetry / סיגמואיד גבולות וסימטריה', () => {
  assert.ok(Math.abs(sigmoid(0) - 0.5) < 1e-12);
  assert.ok(sigmoid(1000) > 0.99999);
  assert.ok(sigmoid(-1000) < 0.00001);
  // Symmetry: sigmoid(-x) = 1 - sigmoid(x)
  for (const x of [-3, -1.5, 0.7, 2.3]) {
    assert.ok(Math.abs(sigmoid(-x) + sigmoid(x) - 1) < 1e-9);
  }
});

// ================================================================
// 2. Deterministic RNG & shuffle
// ================================================================
test('mulberry32 + shuffle — reproducible / מחולל אקראי דטרמיניסטי', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8];
  const b = [1, 2, 3, 4, 5, 6, 7, 8];
  shuffleInPlace(a, mulberry32(42));
  shuffleInPlace(b, mulberry32(42));
  assert.deepEqual(a, b);
  // A different seed should (with overwhelming probability) produce a
  // different ordering for 8 elements — 8! = 40320.
  const c = [1, 2, 3, 4, 5, 6, 7, 8];
  shuffleInPlace(c, mulberry32(43));
  assert.notDeepEqual(a, c);
});

// ================================================================
// 3. trainTestSplit shapes and disjoint indices
// ================================================================
test('trainTestSplit — sizes & disjointness / חלוקת אימון ובדיקה', () => {
  const X: FeatureMatrix = [];
  const y: LabelVector = [];
  for (let i = 0; i < 100; i++) {
    X.push([i, i * 2]);
    y.push(i % 2);
  }
  const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.2, 1);
  assert.equal(xTrain.length, 80);
  assert.equal(yTrain.length, 80);
  assert.equal(xTest.length, 20);
  assert.equal(yTest.length, 20);
  // Every row in test should still exist in the original dataset
  const trainKeys = new Set(xTrain.map((r) => r.join(',')));
  const testKeys = new Set(xTest.map((r) => r.join(',')));
  for (const k of testKeys) {
    assert.equal(trainKeys.has(k), false, `row ${k} leaked into train set`);
  }
});

// ================================================================
// 4. trainTestSplit rejects invalid inputs
// ================================================================
test('trainTestSplit — guard rails / חלוקה — בדיקות תקינות', () => {
  assert.throws(() => trainTestSplit([[1, 2]], [0, 1] as LabelVector, 0.2));
  assert.throws(() => trainTestSplit([] as FeatureMatrix, [] as LabelVector, 0.2));
  assert.throws(() =>
    trainTestSplit([[1, 2]], [0] as LabelVector, 1.2),
  );
});

// ================================================================
// 5. LogisticRegression converges on a separable problem
// ================================================================
test('LogisticRegression — trains and generalises / רגרסיה לוגיסטית מתכנסת', () => {
  const { X, y } = separableBinary(80, 3);
  const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.25, 11);
  const model = new LogisticRegression({
    learningRate: 0.5,
    epochs: 1500,
  });
  model.fit(xTrain, yTrain);
  const preds = model.predict(xTest);
  const acc = accuracyScore(yTest, preds);
  assert.ok(acc >= 0.85, `expected test accuracy ≥ 0.85, got ${acc}`);
  // Loss should be strictly decreasing from start to end
  const first = model.lossHistory[0];
  const last = model.lossHistory[model.lossHistory.length - 1];
  assert.ok(last < first, `loss should decrease (${first} -> ${last})`);
});

// ================================================================
// 6. LogisticRegression predictProba returns a valid probability
// ================================================================
test('LogisticRegression — predictProba in [0,1] / טווח הסתברות', () => {
  const { X, y } = separableBinary(60, 9);
  const model = new LogisticRegression({ learningRate: 0.3, epochs: 600 });
  model.fit(X, y);
  for (const row of X.slice(0, 10)) {
    const p = model.predictProba(row);
    assert.ok(p >= 0 && p <= 1, `probability out of range: ${p}`);
  }
  const detailed = model.predictDetailed(X.slice(0, 5));
  assert.equal(detailed.length, 5);
  for (const d of detailed) {
    assert.ok(d.label === 0 || d.label === 1);
    assert.ok(typeof d.probability === 'number');
  }
});

// ================================================================
// 7. LogisticRegression handles string class labels
// ================================================================
test('LogisticRegression — string labels / תוויות מחרוזת', () => {
  const { X, y } = separableBinary(40, 5);
  const ySym: LabelVector = y.map((v) => (v === 1 ? 'fraud' : 'legit'));
  const model = new LogisticRegression({
    positiveClass: 'fraud',
    negativeClass: 'legit',
    learningRate: 0.3,
    epochs: 800,
  });
  model.fit(X, ySym);
  const preds = model.predict(X);
  for (const p of preds) assert.ok(p === 'fraud' || p === 'legit');
  assert.ok(accuracyScore(ySym, preds) >= 0.8);
});

// ================================================================
// 8. GaussianNaiveBayes — classifies 3 blobs with high accuracy
// ================================================================
test('GaussianNaiveBayes — multi-class / בייס נאיבי רב-מחלקות', () => {
  const { X, y } = threeClassGaussian(60, 21);
  const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.25, 4);
  const nb = new GaussianNaiveBayes();
  nb.fit(xTrain, yTrain);
  const preds = nb.predict(xTest);
  const acc = accuracyScore(yTest, preds);
  assert.ok(acc >= 0.9, `expected NB accuracy ≥ 0.9, got ${acc}`);
  // Probabilities should sum to ~1
  const probs = nb.predictProba(xTest[0]);
  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-6);
});

// ================================================================
// 9. GaussianNaiveBayes — predictDetailed returns scores
// ================================================================
test('GaussianNaiveBayes — predictDetailed scores / חיזוי מפורט', () => {
  const { X, y } = threeClassGaussian(30, 100);
  const nb = new GaussianNaiveBayes();
  nb.fit(X, y);
  const detailed = nb.predictDetailed(X.slice(0, 5));
  assert.equal(detailed.length, 5);
  for (const d of detailed) {
    assert.ok(typeof d.label === 'number' || typeof d.label === 'string');
    const keys = Object.keys(d.scores);
    assert.ok(keys.length >= 2);
    const total = Object.values(d.scores).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-6);
  }
});

// ================================================================
// 10. DecisionStump finds an obvious split
// ================================================================
test('DecisionStump — obvious split / גדם החלטה מוצא פיצול ברור', () => {
  // Feature 0 alone is perfectly separable at 0.5
  const X: FeatureMatrix = [
    [0, 9], [0.2, 7], [0.4, 5], [0.45, 3],
    [0.6, 2], [0.7, 4], [0.9, 6], [1.0, 8],
  ];
  const y: LabelVector = [0, 0, 0, 0, 1, 1, 1, 1];
  const stump = new DecisionStump({ criterion: 'gini' });
  stump.fit(X, y);
  assert.ok(stump.split !== null);
  assert.equal(stump.split!.featureIndex, 0);
  assert.ok(stump.split!.threshold > 0.4 && stump.split!.threshold < 0.6);
  const preds = stump.predict(X);
  assert.equal(accuracyScore(y, preds), 1);
});

// ================================================================
// 11. DecisionStump handles multi-class
// ================================================================
test('DecisionStump — multi-class majority / גדם רב-מחלקות', () => {
  const X: FeatureMatrix = [
    [0], [0.1], [0.2], [0.3],
    [0.7], [0.8], [0.9], [1.0],
  ];
  const y: LabelVector = ['a', 'a', 'a', 'b', 'b', 'c', 'c', 'c'];
  const stump = new DecisionStump();
  stump.fit(X, y);
  const preds = stump.predict(X);
  // Expect at least 6 / 8 correct (stump with 1 split can't separate all 3)
  assert.ok(accuracyScore(y, preds) >= 0.75);
});

// ================================================================
// 12. DecisionStump — entropy criterion works too
// ================================================================
test('DecisionStump — entropy criterion / קריטריון אנטרופיה', () => {
  const { X, y } = separableBinary(40, 777);
  const stump = new DecisionStump({ criterion: 'entropy' });
  stump.fit(X, y);
  const preds = stump.predict(X);
  assert.ok(accuracyScore(y, preds) >= 0.75);
});

// ================================================================
// 13. confusionMatrix correctness with explicit labels
// ================================================================
test('confusionMatrix — counts correct / מטריצת בלבול מדויקת', () => {
  const yTrue: LabelVector = [0, 0, 1, 1, 0, 1];
  const yPred: LabelVector = [0, 1, 1, 1, 0, 0];
  const cm = confusionMatrix(yTrue, yPred, [0, 1]);
  assert.deepEqual(cm.matrix, [
    [2, 1], // true=0: 2 correct + 1 wrong
    [1, 2], // true=1: 1 wrong + 2 correct
  ]);
  // accuracy 4/6
  assert.ok(Math.abs(accuracyScore(yTrue, yPred) - 4 / 6) < 1e-9);
});

// ================================================================
// 14. classificationReport — precision/recall/f1 sanity
// ================================================================
test('classificationReport — metrics sanity / מדדי דיוק-היזכרות-F1', () => {
  const yTrue: LabelVector = [0, 0, 0, 1, 1, 1];
  const yPred: LabelVector = [0, 0, 1, 1, 1, 1];
  const report = classificationReport(yTrue, yPred, [0, 1]);
  assert.equal(report.total, 6);
  // Class 0: precision 2/2=1, recall 2/3≈0.667
  // Class 1: precision 3/4=0.75, recall 3/3=1
  const c0 = report.perClass.find((c) => c.label === 0)!;
  const c1 = report.perClass.find((c) => c.label === 1)!;
  assert.ok(Math.abs(c0.precision - 1) < 1e-9);
  assert.ok(Math.abs(c0.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(c1.precision - 0.75) < 1e-9);
  assert.ok(Math.abs(c1.recall - 1) < 1e-9);
  assert.ok(report.macroF1 > 0 && report.macroF1 < 1);
  assert.ok(Math.abs(report.accuracy - 5 / 6) < 1e-9);
});

// ================================================================
// 15. formatConfusionMatrix renders bilingual header
// ================================================================
test('formatConfusionMatrix — bilingual header / כותרת דו-לשונית', () => {
  const cm = confusionMatrix([0, 1, 0], [0, 1, 1], [0, 1]);
  const txt = formatConfusionMatrix(cm);
  assert.ok(txt.includes('true\\pred'));
  assert.ok(txt.includes('אמת'));
  assert.ok(txt.split('\n').length >= 4);
});

// ================================================================
// 16. kFoldCrossValidate — 5-fold stability
// ================================================================
test('kFoldCrossValidate — stable mean / תיקוף צולב יציב', () => {
  const { X, y } = separableBinary(100, 55);
  const factory = (): Classifier =>
    new LogisticRegression({ learningRate: 0.3, epochs: 400 });
  const report = kFoldCrossValidate(factory, X, y, 5, 99);
  assert.equal(report.folds.length, 5);
  assert.ok(report.meanAccuracy >= 0.85);
  assert.ok(report.stdAccuracy >= 0);
  // Every fold should have a non-trivial size
  for (const f of report.folds) assert.ok(f.size >= 10);
});

// ================================================================
// 17. kFoldCrossValidate rejects bad k
// ================================================================
test('kFoldCrossValidate — rejects bad k / דוחה k לא חוקי', () => {
  const { X, y } = separableBinary(20, 1);
  const factory = (): Classifier => new DecisionStump();
  assert.throws(() => kFoldCrossValidate(factory, X, y, 1));
  assert.throws(() => kFoldCrossValidate(factory, X, y, 999));
});

// ================================================================
// 18. Bilingual feature dictionary is complete
// ================================================================
test('BILINGUAL_FEATURES — all four use cases / ארבעה מקרי שימוש', () => {
  const expected = [
    'invoiceFraud',
    'supplierDeliveryRisk',
    'defectClass',
    'paymentLateness',
  ];
  for (const k of expected) {
    assert.ok(BILINGUAL_FEATURES[k], `missing use case ${k}`);
    const fs = BILINGUAL_FEATURES[k];
    assert.ok(fs.name.en.length > 0);
    assert.ok(fs.name.he.length > 0);
    assert.ok(fs.features.length >= 2);
    assert.ok(fs.classes.length >= 2);
    for (const f of fs.features) {
      assert.ok(f.he.length > 0);
      assert.ok(f.en.length > 0);
    }
  }
});

// ================================================================
// 19. translateLabel + featureLabelAt helpers
// ================================================================
test('translateLabel / featureLabelAt — bilingual lookup / חיפוש דו-לשוני', () => {
  const fraud = translateLabel('invoiceFraud', 1);
  assert.ok(fraud);
  assert.equal(fraud!.en, 'fraud');
  assert.equal(fraud!.he, 'הונאה');
  const legit = translateLabel('invoiceFraud', 0);
  assert.equal(legit!.he, 'לגיטימית');
  const f0 = featureLabelAt('paymentLateness', 0);
  assert.equal(f0!.key, 'customerAgeMonths');
  assert.equal(f0!.he, 'ותק הלקוח (חודשים)');
  assert.equal(featureLabelAt('paymentLateness', 99), null);
});

// ================================================================
// 20. End-to-end: invoice fraud use-case pipeline
// ================================================================
test('end-to-end — invoice fraud pipeline / תרחיש מלא: הונאה בחשבונית', () => {
  // Feature order matches BILINGUAL_FEATURES.invoiceFraud
  // [amount, roundAmount, vendorAgeMonths, priorInvoices,
  //  submittedAfterHours, vatMismatch]
  const X: FeatureMatrix = [
    // Legitimate rows — high vendor age, few risk flags
    [1250, 0, 36, 40, 0, 0],
    [870,  0, 24, 25, 0, 0],
    [2100, 0, 60, 75, 0, 0],
    [450,  0, 18, 12, 0, 0],
    [3600, 0, 72, 90, 0, 0],
    [1800, 0, 48, 60, 0, 0],
    [950,  0, 30, 22, 0, 0],
    [1400, 0, 42, 35, 0, 0],
    // Fraudulent rows — round amounts, brand new vendor, after hours, VAT issues
    [10000, 1, 1, 0, 1, 1],
    [5000,  1, 2, 1, 1, 1],
    [20000, 1, 1, 0, 1, 1],
    [15000, 1, 0, 0, 1, 1],
    [8000,  1, 3, 0, 1, 1],
    [25000, 1, 1, 1, 1, 1],
    [12000, 1, 0, 0, 1, 1],
    [30000, 1, 2, 0, 1, 1],
  ];
  const y: LabelVector = [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 1,
  ];
  const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.25, 7);
  const lr = new LogisticRegression({
    learningRate: 0.01,
    epochs: 4000,
    l2: 0.001,
  });
  lr.fit(xTrain, yTrain);
  const preds = lr.predict(xTest);
  const acc = accuracyScore(yTest, preds);
  assert.ok(acc >= 0.75, `pipeline acc = ${acc}`);
  const cm = confusionMatrix(yTest, preds, [0, 1]);
  assert.equal(cm.labels.length, 2);
  assert.equal(cm.matrix.length, 2);
  // Every row of the confusion matrix should have exactly 2 columns
  for (const row of cm.matrix) assert.equal(row.length, 2);
  // Translate label back to Hebrew
  const translated = translateLabel('invoiceFraud', preds[0]);
  assert.ok(translated !== null);
  assert.ok(translated!.he.length > 0);
});
