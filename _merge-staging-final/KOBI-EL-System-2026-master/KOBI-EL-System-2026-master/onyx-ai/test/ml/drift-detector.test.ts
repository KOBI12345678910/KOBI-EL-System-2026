/**
 * ONYX AI — DriftDetector Unit Tests
 * -------------------------------------------------------------
 * Agent:  Y-164
 * System: Techno-Kol Uzi mega-ERP
 * Date:   2026-04-11
 *
 * Uses the Node built-in test runner — no extra dependencies.
 * Run with:
 *   npx node --test --require ts-node/register test/ml/drift-detector.test.ts
 *
 * Coverage (18 tests, 15+ required):
 *   1.  PSI returns ~0 for identical distributions
 *   2.  PSI flags minor drift in the 0.10-0.25 band
 *   3.  PSI flags major drift above 0.25
 *   4.  Histogram bin edges cover the union of both samples
 *   5.  KS returns near-zero D for identical samples
 *   6.  KS detects shift in mean (rejects H0)
 *   7.  KS p-value decreases as samples diverge
 *   8.  Chi-square returns small statistic for stable categorical
 *   9.  Chi-square rejects when categorical proportions shift
 *  10.  compareDistributions numeric — stable case
 *  11.  compareDistributions numeric — major drift case
 *  12.  compareDistributions categorical — drift case
 *  13.  detectFeatureDrift rolls up multiple features correctly
 *  14.  detectConceptDrift flags model-output distribution change
 *  15.  triggerAlerts emits critical alerts for major drift
 *  16.  triggerAlerts is silent for fully-stable reports
 *  17.  Bilingual fields present on every report (he + en)
 *  18.  compareDistributions never mutates its inputs
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  DriftDetector,
  computePSI,
  ksTwoSample,
  chiSquareTest,
  buildBinEdges,
  buildHistogram,
  alignCategoricalCounts,
  psiSeverity,
  percentile,
  ecdf,
  DRIFT_DEFAULTS,
} from '../../src/ml/drift-detector';

// -------------------------------------------------------------
// Helpers — deterministic "random" generators (LCG) so results are
// reproducible across Node versions without touching Math.random.
// -------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function gaussianSample(
  rng: () => number,
  mean: number,
  stdev: number,
  n: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const mag = stdev * Math.sqrt(-2 * Math.log(u1));
    out.push(mean + mag * Math.cos(2 * Math.PI * u2));
    if (out.length < n) {
      out.push(mean + mag * Math.sin(2 * Math.PI * u2));
    }
  }
  return out.slice(0, n);
}

// -------------------------------------------------------------
// 1. PSI ~ 0 for identical distributions
// -------------------------------------------------------------
test('PSI is ~0 for identical histograms', () => {
  const hist = [10, 20, 30, 40, 50];
  const psi = computePSI(hist, hist);
  assert.ok(Math.abs(psi) < 1e-6, `expected PSI ~0, got ${psi}`);
  assert.equal(psiSeverity(psi), 'stable');
});

// -------------------------------------------------------------
// 2. PSI in the minor band (0.10 - 0.25)
// -------------------------------------------------------------
test('PSI flags minor drift in the 0.10–0.25 band', () => {
  // Design a histogram pair whose PSI lands in the minor band.
  const base = [100, 100, 100, 100, 100];
  const curr = [160, 130, 100, 70, 40];
  const psi = computePSI(base, curr);
  assert.ok(psi >= 0.10 && psi <= 0.25, `expected minor-band PSI, got ${psi}`);
  assert.equal(psiSeverity(psi), 'minor');
});

// -------------------------------------------------------------
// 3. PSI above 0.25 → major drift
// -------------------------------------------------------------
test('PSI above 0.25 is classified as major drift', () => {
  const base = [1000, 500, 50, 10, 5];
  const curr = [5, 10, 50, 500, 1000];
  const psi = computePSI(base, curr);
  assert.ok(psi > 0.25, `expected PSI > 0.25, got ${psi}`);
  assert.equal(psiSeverity(psi), 'major');
});

// -------------------------------------------------------------
// 4. Histogram bin edges cover both samples
// -------------------------------------------------------------
test('Histogram bin edges span the union of both samples', () => {
  const b = [1, 2, 3, 4, 5];
  const c = [4, 5, 6, 7, 8];
  const edges = buildBinEdges(b, c, 4);
  assert.equal(edges.length, 5);
  assert.ok(edges[0] <= 1);
  assert.ok(edges[edges.length - 1] >= 8);
  const histB = buildHistogram(b, edges);
  const histC = buildHistogram(c, edges);
  assert.equal(
    histB.reduce((a, v) => a + v, 0),
    b.length,
  );
  assert.equal(
    histC.reduce((a, v) => a + v, 0),
    c.length,
  );
});

// -------------------------------------------------------------
// 5. KS near-zero D for identical samples
// -------------------------------------------------------------
test('KS returns D ~0 for identical samples', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const res = ksTwoSample(xs, xs);
  assert.equal(res.statistic, 0);
  assert.ok(res.pValue > 0.9);
  assert.equal(res.reject, false);
});

// -------------------------------------------------------------
// 6. KS detects a shift in mean
// -------------------------------------------------------------
test('KS detects a mean shift between two samples', () => {
  const rng = lcg(42);
  const base = gaussianSample(rng, 0, 1, 300);
  const curr = gaussianSample(rng, 1.5, 1, 300);
  const res = ksTwoSample(base, curr, 0.05);
  assert.ok(res.statistic > 0.2, `expected D > 0.2, got ${res.statistic}`);
  assert.equal(res.reject, true);
  assert.ok(res.pValue < 0.01);
});

// -------------------------------------------------------------
// 7. KS p-value monotonically decreases as divergence grows
// -------------------------------------------------------------
test('KS p-value shrinks as distributions diverge', () => {
  const rng = lcg(7);
  const base = gaussianSample(rng, 0, 1, 250);
  const close = gaussianSample(rng, 0.2, 1, 250);
  const far = gaussianSample(rng, 2.0, 1, 250);
  const pClose = ksTwoSample(base, close).pValue;
  const pFar = ksTwoSample(base, far).pValue;
  assert.ok(
    pFar < pClose,
    `expected pFar (${pFar}) < pClose (${pClose})`,
  );
});

// -------------------------------------------------------------
// 8. Chi-square small statistic for stable categorical
// -------------------------------------------------------------
test('Chi-square has a small statistic for stable categorical data', () => {
  const base = [100, 100, 100, 100];
  const curr = [99, 101, 100, 100];
  const res = chiSquareTest(base, curr);
  assert.ok(res.statistic < 1, `expected small chi, got ${res.statistic}`);
  assert.ok(res.pValue > 0.5);
  assert.equal(res.reject, false);
});

// -------------------------------------------------------------
// 9. Chi-square rejects on categorical drift
// -------------------------------------------------------------
test('Chi-square rejects when categorical proportions shift', () => {
  const base = [1000, 500, 300, 200];
  const curr = [200, 300, 500, 1000];
  const res = chiSquareTest(base, curr);
  assert.ok(res.statistic > 100, `expected chi > 100, got ${res.statistic}`);
  assert.ok(res.pValue < 0.001);
  assert.equal(res.reject, true);
  assert.equal(res.degreesOfFreedom, 3);
});

// -------------------------------------------------------------
// 10. compareDistributions numeric — stable case
// -------------------------------------------------------------
test('compareDistributions numeric — stable case', () => {
  const detector = new DriftDetector();
  const rng = lcg(101);
  const base = gaussianSample(rng, 50, 10, 500);
  const curr = gaussianSample(rng, 50, 10, 500);
  const report = detector.compareDistributions(base, curr);
  assert.equal(report.kind, 'numeric');
  assert.equal(report.overallSeverity, 'stable');
  assert.equal(report.drifted, false);
  assert.equal(report.findings.length, 3);
});

// -------------------------------------------------------------
// 11. compareDistributions numeric — major drift
// -------------------------------------------------------------
test('compareDistributions numeric — major drift case', () => {
  const detector = new DriftDetector({
    freezeClockAt: '2026-04-11T00:00:00.000Z',
  });
  const rng = lcg(202);
  const base = gaussianSample(rng, 0, 1, 400);
  const curr = gaussianSample(rng, 4, 2, 400);
  const report = detector.compareDistributions(base, curr);
  assert.equal(report.drifted, true);
  assert.equal(report.overallSeverity, 'major');
  const psi = report.findings.find((f) => f.test === 'psi');
  assert.ok(psi, 'PSI finding expected');
  assert.ok(psi.statistic > 0.25);
  assert.equal(report.generatedAt, '2026-04-11T00:00:00.000Z');
});

// -------------------------------------------------------------
// 12. compareDistributions categorical — drift case
// -------------------------------------------------------------
test('compareDistributions categorical — drift case', () => {
  const detector = new DriftDetector();
  const base = Array.from({ length: 400 }, (_, i) =>
    i < 200 ? 'A' : i < 300 ? 'B' : 'C',
  );
  const curr = Array.from({ length: 400 }, (_, i) =>
    i < 50 ? 'A' : i < 150 ? 'B' : 'C',
  );
  const report = detector.compareDistributions(base, curr);
  assert.equal(report.kind, 'categorical');
  assert.equal(report.drifted, true);
  const psi = report.findings.find((f) => f.test === 'psi');
  const chi = report.findings.find((f) => f.test === 'chi_square');
  const ks = report.findings.find((f) => f.test === 'ks');
  assert.ok(psi && psi.statistic > 0.25);
  assert.ok(chi && chi.severity !== 'stable');
  assert.ok(ks && ks.severity === 'stable'); // KS is N/A for categorical
});

// -------------------------------------------------------------
// 13. detectFeatureDrift — multi-feature rollup
// -------------------------------------------------------------
test('detectFeatureDrift rolls up multiple features correctly', () => {
  const detector = new DriftDetector({
    freezeClockAt: '2026-04-11T12:00:00.000Z',
  });
  const rng = lcg(33);
  const baseline: Record<string, any>[] = [];
  const current: Record<string, any>[] = [];
  // Stable price: reuse the same underlying samples so baseline and
  // current are drawn from literally identical data — guarantees
  // stable PSI / KS / chi² regardless of seed.
  const stablePrices = gaussianSample(rng, 100, 5, 300);
  const driftedBaseline = gaussianSample(rng, 10, 1, 300);
  const driftedCurrent = gaussianSample(rng, 25, 3, 300);
  for (let i = 0; i < 300; i++) {
    baseline.push({
      price: stablePrices[i],
      latency_ms: driftedBaseline[i],
      region: i % 3 === 0 ? 'TLV' : i % 3 === 1 ? 'HFA' : 'JER',
    });
    current.push({
      price: stablePrices[i],
      latency_ms: driftedCurrent[i],
      region: i % 5 === 0 ? 'TLV' : 'EIL',
    });
  }
  const rollup = detector.detectFeatureDrift(baseline, current, [
    'price',
    'latency_ms',
    'region',
  ]);
  assert.equal(rollup.overallSeverity, 'major');
  assert.ok(rollup.driftedFeatures.includes('latency_ms'));
  assert.ok(rollup.driftedFeatures.includes('region'));
  assert.ok(!rollup.driftedFeatures.includes('price'));
  assert.equal(rollup.generatedAt, '2026-04-11T12:00:00.000Z');
});

// -------------------------------------------------------------
// 14. detectConceptDrift
// -------------------------------------------------------------
test('detectConceptDrift flags changes in model output distribution', () => {
  const detector = new DriftDetector();
  const rng = lcg(909);
  const basePredictions = gaussianSample(rng, 0.3, 0.05, 500);
  const currPredictions = gaussianSample(rng, 0.65, 0.08, 500);
  const report = detector.detectConceptDrift(
    basePredictions,
    currPredictions,
    'risk_score',
  );
  assert.equal(report.conceptDrift, true);
  assert.equal(report.target, 'risk_score');
  assert.ok(report.overallSeverity !== 'stable');
  assert.match(report.summary_he, /risk_score/);
  assert.match(report.summary_en, /risk_score/);
});

// -------------------------------------------------------------
// 15. triggerAlerts emits critical alerts for major drift
// -------------------------------------------------------------
test('triggerAlerts emits critical alerts for major drift', () => {
  const detector = new DriftDetector();
  const rng = lcg(5050);
  const base = gaussianSample(rng, 0, 1, 400);
  const curr = gaussianSample(rng, 5, 2, 400);
  const report = detector.compareDistributions(base, curr);
  const alerts = detector.triggerAlerts(report);
  assert.ok(alerts.length >= 1);
  const critical = alerts.filter((a) => a.level === 'critical');
  assert.ok(critical.length >= 1, 'expected at least 1 critical alert');
  for (const a of alerts) {
    assert.ok(a.title_he.length > 0);
    assert.ok(a.title_en.length > 0);
    assert.ok(a.body_he.length > 0);
    assert.ok(a.body_en.length > 0);
  }
});

// -------------------------------------------------------------
// 16. triggerAlerts is silent for fully-stable reports
// -------------------------------------------------------------
test('triggerAlerts is silent for stable reports', () => {
  const detector = new DriftDetector();
  const rng = lcg(1234);
  const base = gaussianSample(rng, 0, 1, 500);
  const curr = gaussianSample(rng, 0, 1, 500);
  const report = detector.compareDistributions(base, curr);
  const alerts = detector.triggerAlerts(report);
  assert.equal(alerts.length, 0);
});

// -------------------------------------------------------------
// 17. Bilingual fields are present everywhere
// -------------------------------------------------------------
test('Every report field carries bilingual Hebrew + English strings', () => {
  const detector = new DriftDetector();
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const curr = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const report = detector.compareDistributions(base, curr);
  assert.ok(report.summary_he.length > 0);
  assert.ok(report.summary_en.length > 0);
  // Hebrew string contains at least one Hebrew char.
  assert.match(report.summary_he, /[\u0590-\u05FF]/);
  for (const f of report.findings) {
    assert.ok(f.explanation_he.length > 0);
    assert.ok(f.explanation_en.length > 0);
    assert.match(f.explanation_he, /[\u0590-\u05FF]/);
  }
});

// -------------------------------------------------------------
// 18. compareDistributions must not mutate its inputs
// -------------------------------------------------------------
test('compareDistributions does not mutate its input arrays', () => {
  const detector = new DriftDetector();
  const base = [5, 2, 9, 1, 7, 3, 8, 4, 6];
  const curr = [6, 3, 1, 8, 2, 9, 4, 7, 5];
  const baseCopy = [...base];
  const currCopy = [...curr];
  detector.compareDistributions(base, curr);
  assert.deepEqual(base, baseCopy);
  assert.deepEqual(curr, currCopy);
});

// -------------------------------------------------------------
// 19. Helper: percentile + ecdf sanity
// -------------------------------------------------------------
test('percentile and ecdf behave sensibly', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(xs, 0.5), 5.5);
  assert.equal(percentile(xs, 0), 1);
  assert.equal(percentile(xs, 1), 10);
  const sorted = [...xs].sort((a, b) => a - b);
  assert.equal(ecdf(sorted, 5), 0.5);
  assert.equal(ecdf(sorted, 10), 1);
  assert.equal(ecdf(sorted, 0), 0);
});

// -------------------------------------------------------------
// 20. alignCategoricalCounts preserves sorted key order
// -------------------------------------------------------------
test('alignCategoricalCounts aligns on the sorted union of keys', () => {
  const base = ['A', 'A', 'B', 'C'];
  const curr = ['B', 'C', 'C', 'D'];
  const aligned = alignCategoricalCounts(base, curr);
  assert.deepEqual(aligned.keys, ['A', 'B', 'C', 'D']);
  assert.deepEqual(aligned.baseline, [2, 1, 1, 0]);
  assert.deepEqual(aligned.current, [0, 1, 2, 1]);
});

// -------------------------------------------------------------
// 21. DRIFT_DEFAULTS is frozen and correct
// -------------------------------------------------------------
test('DRIFT_DEFAULTS has the Y-164 specified thresholds', () => {
  assert.equal(DRIFT_DEFAULTS.psiStableMax, 0.10);
  assert.equal(DRIFT_DEFAULTS.psiMinorMax, 0.25);
  assert.equal(DRIFT_DEFAULTS.bins, 10);
  assert.equal(DRIFT_DEFAULTS.ksAlpha, 0.05);
  assert.equal(DRIFT_DEFAULTS.chiAlpha, 0.05);
  assert.throws(() => {
    (DRIFT_DEFAULTS as any).bins = 999;
  });
});
