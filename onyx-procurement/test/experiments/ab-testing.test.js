/**
 * Unit tests for onyx-procurement/src/experiments/ab-testing.js
 * Agent AG-X99 — A/B testing framework
 *
 * Run with:  node --test test/experiments/ab-testing.test.js
 *
 * Coverage:
 *   - Sticky assignment (same user → same variant across calls)
 *   - Deterministic hashing (no randomness)
 *   - Weighted distribution across many synthetic users
 *   - Chi-square CDF / survival against Wikipedia reference values
 *   - Inverse normal CDF against known z-values (1.645, 1.96, 2.576)
 *   - t-distribution CDF against tabulated values
 *   - Welch t-test produces sane p-values for identical / divergent samples
 *   - Cohen's h / Wilson interval sanity
 *   - requiredSampleSize matches the textbook worked example
 *   - Full lifecycle: create → assign → expose → convert → results → conclude
 *   - listExperiments filters by status
 *   - Bilingual narrative strings are present
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '..', '..', 'src', 'experiments', 'ab-testing.js');
const {
  ABTesting,
  STATUS,
  fnv1a32,
  hashToUnit,
  chiSquareCDF,
  chiSquareSurvival,
  invNormalCDF,
  normalCDF,
  tCDF,
  tTwoTailedPValue,
  welchTTestBernoulli,
  wilsonInterval,
  cohenH,
  classifyEffect,
  normalizeWeights,
} = require(modulePath);

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function approx(actual, expected, tol = 1e-3, msg) {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${msg || ''} — expected ~${expected}, got ${actual} (tol ${tol})`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Hashing primitives
// ═══════════════════════════════════════════════════════════════════════════

describe('fnv1a32 hash', () => {
  test('returns the reference value for "hello"', () => {
    // FNV-1a 32-bit of "hello" = 0x4f9f2cab
    assert.equal(fnv1a32('hello'), 0x4f9f2cab);
  });

  test('returns 0x811c9dc5 for empty string (offset basis)', () => {
    assert.equal(fnv1a32(''), 0x811c9dc5);
  });

  test('differs for different inputs', () => {
    assert.notEqual(fnv1a32('abc'), fnv1a32('abd'));
  });

  test('hashToUnit output is in [0, 1)', () => {
    for (let i = 0; i < 1000; i += 1) {
      const u = hashToUnit('exp', 'user-' + i);
      assert.ok(u >= 0 && u < 1, `value out of bounds: ${u}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Inverse normal CDF — known z-values
// ═══════════════════════════════════════════════════════════════════════════

describe('invNormalCDF', () => {
  test('median', () => {
    approx(invNormalCDF(0.5), 0, 1e-6, 'p=0.5');
  });
  test('90% one-sided', () => {
    approx(invNormalCDF(0.95), 1.6448536269514722, 1e-5);
  });
  test('95% two-sided', () => {
    approx(invNormalCDF(0.975), 1.959963984540054, 1e-5);
  });
  test('99% two-sided', () => {
    approx(invNormalCDF(0.995), 2.5758293035489004, 1e-5);
  });

  test('roundtrip: normalCDF(invNormalCDF(p)) ≈ p', () => {
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      const z = invNormalCDF(p);
      const back = normalCDF(z);
      approx(back, p, 1e-4, `p=${p}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Chi-square CDF / survival — reference values
// ═══════════════════════════════════════════════════════════════════════════

describe('chiSquareCDF', () => {
  // Wikipedia chi² critical values table (https://en.wikipedia.org/wiki/Chi-squared_distribution)
  //   df=1,  χ²=3.841 → p = 0.05
  //   df=2,  χ²=5.991 → p = 0.05
  //   df=3,  χ²=7.815 → p = 0.05
  //   df=4,  χ²=9.488 → p = 0.05
  //   df=5,  χ²=11.070 → p = 0.05
  //   df=10, χ²=18.307 → p = 0.05
  //   df=1,  χ²=6.635 → p = 0.01
  //   df=2,  χ²=9.210 → p = 0.01

  test('df=1, χ²=3.841 ≈ p=0.05', () => {
    approx(chiSquareSurvival(3.841, 1), 0.05, 1e-3);
  });
  test('df=2, χ²=5.991 ≈ p=0.05', () => {
    approx(chiSquareSurvival(5.991, 2), 0.05, 1e-3);
  });
  test('df=3, χ²=7.815 ≈ p=0.05', () => {
    approx(chiSquareSurvival(7.815, 3), 0.05, 1e-3);
  });
  test('df=4, χ²=9.488 ≈ p=0.05', () => {
    approx(chiSquareSurvival(9.488, 4), 0.05, 1e-3);
  });
  test('df=5, χ²=11.070 ≈ p=0.05', () => {
    approx(chiSquareSurvival(11.070, 5), 0.05, 1e-3);
  });
  test('df=10, χ²=18.307 ≈ p=0.05', () => {
    approx(chiSquareSurvival(18.307, 10), 0.05, 1e-3);
  });
  test('df=1, χ²=6.635 ≈ p=0.01', () => {
    approx(chiSquareSurvival(6.635, 1), 0.01, 1e-3);
  });
  test('df=2, χ²=9.210 ≈ p=0.01', () => {
    approx(chiSquareSurvival(9.210, 2), 0.01, 1e-3);
  });

  test('CDF(0) = 0, CDF(∞) = 1', () => {
    assert.equal(chiSquareCDF(0, 5), 0);
    approx(chiSquareCDF(1000, 5), 1, 1e-6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Student's t CDF — tabulated values
// ═══════════════════════════════════════════════════════════════════════════

describe('tCDF', () => {
  // t(df=∞) ≈ normal, so tCDF(1.96, 1e6) ≈ 0.975
  test('large df converges to normal', () => {
    approx(tCDF(1.96, 1e6), 0.975, 1e-4);
  });

  // Tabulated t critical values, two-tailed p = 0.05 (upper tail p=0.025):
  //   df=10 → t = 2.228  (upper tail = 0.025 → tCDF = 0.975)
  //   df=20 → t = 2.086
  //   df=30 → t = 2.042
  test('df=10, t=2.228 ≈ CDF 0.975', () => {
    approx(tCDF(2.228, 10), 0.975, 1e-3);
  });
  test('df=20, t=2.086 ≈ CDF 0.975', () => {
    approx(tCDF(2.086, 20), 0.975, 1e-3);
  });
  test('df=30, t=2.042 ≈ CDF 0.975', () => {
    approx(tCDF(2.042, 30), 0.975, 1e-3);
  });

  test('two-tailed p-value of t=0 is 1', () => {
    approx(tTwoTailedPValue(0, 20), 1, 1e-12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Weighted distribution over many synthetic users
// ═══════════════════════════════════════════════════════════════════════════

describe('weighted bucket assignment', () => {
  test('50/50 split is close to the target in a large sample', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'exp-50-50',
      name_he: 'חצי חצי',
      name_en: 'half half',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
      metric: 'conversion',
    });
    const counts = { A: 0, B: 0 };
    const N = 10000;
    for (let i = 0; i < N; i += 1) {
      const v = ab.assignVariant('exp-50-50', 'u' + i);
      counts[v] += 1;
    }
    // Expected ±3% tolerance
    approx(counts.A / N, 0.5, 0.03, '50/50 A');
    approx(counts.B / N, 0.5, 0.03, '50/50 B');
  });

  test('70/20/10 split is close to target', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'exp-70-20-10',
      name_he: 'ניסוי משקולות',
      name_en: 'weighted exp',
      variants: [
        { id: 'A', weight: 70 },
        { id: 'B', weight: 20 },
        { id: 'C', weight: 10 },
      ],
      metric: 'conversion',
    });
    const counts = { A: 0, B: 0, C: 0 };
    const N = 20000;
    for (let i = 0; i < N; i += 1) {
      const v = ab.assignVariant('exp-70-20-10', 'user-' + i);
      counts[v] += 1;
    }
    approx(counts.A / N, 0.70, 0.02, '70% arm');
    approx(counts.B / N, 0.20, 0.02, '20% arm');
    approx(counts.C / N, 0.10, 0.02, '10% arm');
  });

  test('sticky: same user always gets the same variant', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'sticky',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
        { id: 'C', weight: 1 },
      ],
    });
    const first = ab.assignVariant('sticky', 'kobi-123');
    for (let i = 0; i < 100; i += 1) {
      assert.equal(ab.assignVariant('sticky', 'kobi-123'), first);
    }
  });

  test('different experiments → independent assignments for same user', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'exp-1',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
    });
    ab.createExperiment({
      id: 'exp-2',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
    });
    // Over many users, the mutual-information should be ~0 (independent)
    let sameBucket = 0;
    const N = 5000;
    for (let i = 0; i < N; i += 1) {
      const v1 = ab.assignVariant('exp-1', 'u' + i);
      const v2 = ab.assignVariant('exp-2', 'u' + i);
      if (v1 === v2) sameBucket += 1;
    }
    // Independent 50/50 ⇒ expected fraction ≈ 0.5
    approx(sameBucket / N, 0.5, 0.05);
  });

  test('normalizeWeights rejects non-positive total', () => {
    assert.throws(() => normalizeWeights([{ id: 'A', weight: 0 }, { id: 'B', weight: 0 }]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Welch t-test
// ═══════════════════════════════════════════════════════════════════════════

describe('Welch t-test (Bernoulli)', () => {
  test('identical samples produce p ≈ 1', () => {
    const a = { exposures: 1000, conversionRate: 0.1 };
    const b = { exposures: 1000, conversionRate: 0.1 };
    const r = welchTTestBernoulli(a, b);
    approx(r.p, 1, 1e-6);
  });

  test('very divergent samples produce p ≈ 0', () => {
    const a = { exposures: 1000, conversionRate: 0.1 };
    const b = { exposures: 1000, conversionRate: 0.2 };
    const r = welchTTestBernoulli(a, b);
    assert.ok(r.p < 1e-6, `expected p<1e-6, got ${r.p}`);
  });

  test('small sample → NaN (n<2)', () => {
    const r = welchTTestBernoulli(
      { exposures: 1, conversionRate: 1 },
      { exposures: 1, conversionRate: 0 }
    );
    assert.ok(Number.isNaN(r.t));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Wilson interval and Cohen's h
// ═══════════════════════════════════════════════════════════════════════════

describe('Wilson interval', () => {
  test('20/100 Wilson interval is roughly [0.13, 0.29]', () => {
    // z for 95% two-sided ≈ 1.96
    const ci = wilsonInterval(20, 100, 1.96);
    approx(ci.lower, 0.132, 0.01);
    approx(ci.upper, 0.292, 0.01);
  });
  test('0/n → [0,0]', () => {
    const ci = wilsonInterval(0, 100, 1.96);
    assert.equal(ci.lower, 0);
    assert.ok(ci.upper > 0);
  });
});

describe('Cohen h classification', () => {
  test('equal rates → 0 → negligible', () => {
    assert.equal(cohenH(0.1, 0.1), 0);
    assert.equal(classifyEffect(0), 'negligible');
  });
  test('0.1 vs 0.2 → small/medium range', () => {
    const h = cohenH(0.1, 0.2);
    assert.ok(h > 0.2 && h < 0.5);
    assert.equal(classifyEffect(h), 'small');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. requiredSampleSize — power analysis
// ═══════════════════════════════════════════════════════════════════════════

describe('requiredSampleSize', () => {
  test('baseline=0.1, mde=0.20, alpha=0.05, power=0.80 → ~3835/group', () => {
    // Reference: Evan Miller's A/B sample size calculator
    const ab = new ABTesting();
    const r = ab.requiredSampleSize({
      baseline: 0.10,
      mde: 0.20,
      alpha: 0.05,
      power: 0.80,
    });
    // Allow ±10% tolerance — different rounding conventions
    assert.ok(r.perVariant > 3400 && r.perVariant < 4300,
      `expected ~3835, got ${r.perVariant}`);
    assert.equal(r.total, r.perVariant * 2);
  });

  test('rejects baseline outside (0,1)', () => {
    const ab = new ABTesting();
    assert.throws(() => ab.requiredSampleSize({ baseline: 0, mde: 0.1 }));
    assert.throws(() => ab.requiredSampleSize({ baseline: 1, mde: 0.1 }));
  });

  test('rejects non-positive mde', () => {
    const ab = new ABTesting();
    assert.throws(() => ab.requiredSampleSize({ baseline: 0.1, mde: 0 }));
  });

  test('scales linearly in variant count', () => {
    const ab = new ABTesting();
    const r2 = ab.requiredSampleSize({ baseline: 0.1, mde: 0.2, variants: 2 });
    const r3 = ab.requiredSampleSize({ baseline: 0.1, mde: 0.2, variants: 3 });
    assert.equal(r2.perVariant, r3.perVariant);
    assert.equal(r3.total, r3.perVariant * 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. End-to-end lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('experiment lifecycle', () => {
  function fixedNow() {
    let i = 0;
    return () => `2026-04-11T00:00:${String(i++).padStart(2, '0')}Z`;
  }

  test('create → assign → expose → convert → results', () => {
    const ab = new ABTesting({ now: fixedNow() });
    ab.createExperiment({
      id: 'checkout-v2',
      name_he: 'מסך סליקה חדש',
      name_en: 'New checkout screen',
      variants: [
        { id: 'control', weight: 1, config: { button: 'blue' } },
        { id: 'treatment', weight: 1, config: { button: 'green' } },
      ],
      metric: 'conversion',
      minSampleSize: 200,
    });

    // Assign / expose 400 users, seed treatment with higher rate
    for (let i = 0; i < 400; i += 1) {
      const u = 'u-' + i;
      const v = ab.assignVariant('checkout-v2', u);
      ab.recordExposure('checkout-v2', u);
      // control: 10% conversion, treatment: 20% conversion (deterministic by id)
      const target = v === 'control' ? 0.1 : 0.2;
      if ((i * 2654435761) % 1000 / 1000 < target) {
        ab.recordConversion('checkout-v2', u, 1);
      }
    }

    const res = ab.getResults('checkout-v2');
    assert.equal(res.experimentId, 'checkout-v2');
    assert.ok(res.totalExposures >= 400);
    assert.ok(res.variants.length === 2);
    assert.ok(res.sampleSizeReached === true);
    assert.ok(res.summary_he.length > 0);
    assert.ok(res.summary_en.length > 0);

    // Significance
    const sig = ab.computeSignificance('checkout-v2');
    assert.equal(sig.chiSquare.df, 1);
    assert.ok(sig.chiSquare.statistic >= 0);
    assert.equal(sig.pairwise.length, 1);
    assert.ok(sig.variants[0].ci95Lower >= 0);
    assert.ok(sig.variants[0].ci95Upper <= 1);
    assert.ok(sig.narrative_he.length > 0);
    assert.ok(sig.narrative_en.length > 0);
  });

  test('concludeExperiment archives and freezes winner', () => {
    const ab = new ABTesting({ now: fixedNow() });
    ab.createExperiment({
      id: 'e1',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
    });
    for (let i = 0; i < 100; i += 1) {
      const u = 'u' + i;
      ab.assignVariant('e1', u);
      ab.recordExposure('e1', u);
      if (i % 5 === 0) ab.recordConversion('e1', u, 1);
    }

    const concluded = ab.concludeExperiment('e1', 'A');
    assert.equal(concluded.status, STATUS.ARCHIVED);
    assert.equal(concluded.winner, 'A');
    assert.ok(concluded.concludedAt);
    assert.ok(concluded.archivedAt);

    // Idempotent — second call is a no-op
    const again = ab.concludeExperiment('e1');
    assert.equal(again.winner, 'A');
  });

  test('assignVariant on archived experiment returns stored or winner', () => {
    const ab = new ABTesting({ now: fixedNow() });
    ab.createExperiment({
      id: 'e2',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
    });
    ab.assignVariant('e2', 'user-known');
    ab.concludeExperiment('e2', 'B');
    // known user → their original bucket
    const known = ab.assignVariant('e2', 'user-known');
    assert.ok(known === 'A' || known === 'B');
    // unknown user → winner
    assert.equal(ab.assignVariant('e2', 'user-unknown'), 'B');
  });

  test('listExperiments filters by status', () => {
    const ab = new ABTesting({ now: fixedNow() });
    ab.createExperiment({
      id: 'running-1',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    });
    ab.createExperiment({
      id: 'running-2',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    });
    ab.createExperiment({
      id: 'to-archive',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    });
    ab.concludeExperiment('to-archive', 'A');

    const running = ab.listExperiments({ status: STATUS.RUNNING });
    const archived = ab.listExperiments({ status: STATUS.ARCHIVED });
    const all = ab.listExperiments();
    assert.equal(running.length, 2);
    assert.equal(archived.length, 1);
    assert.equal(all.length, 3);
  });

  test('duplicate createExperiment throws', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'dup',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    });
    assert.throws(() => ab.createExperiment({
      id: 'dup',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    }));
  });

  test('createExperiment rejects single variant and duplicate ids', () => {
    const ab = new ABTesting();
    assert.throws(() => ab.createExperiment({
      id: 'x', variants: [{ id: 'A', weight: 1 }],
    }));
    assert.throws(() => ab.createExperiment({
      id: 'y', variants: [
        { id: 'A', weight: 1 },
        { id: 'A', weight: 1 },
      ],
    }));
  });

  test('recordConversion throws for never-assigned user', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'e',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
    });
    assert.throws(() => ab.recordConversion('e', 'ghost', 1));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. End-to-end significance on a known-good dataset
// ═══════════════════════════════════════════════════════════════════════════

describe('significance detection on a strong signal', () => {
  test('detects large effect on 2x1000 Bernoulli with p=0.1 vs 0.25', () => {
    const ab = new ABTesting();
    ab.createExperiment({
      id: 'strong',
      variants: [
        { id: 'A', weight: 1 },
        { id: 'B', weight: 1 },
      ],
      metric: 'conversion',
    });
    // Force exact counts: A=1000 exposures / 100 conversions
    //                    B=1000 exposures / 250 conversions
    for (let i = 0; i < 1000; i += 1) {
      const uA = 'A-' + i;
      const uB = 'B-' + i;
      // We bypass assignment by manually setting assignment via the public API.
      // Instead of hacking the Map, we call recordExposure with explicit variant.
      ab.recordExposure('strong', uA, 'A');
      // Assignment side-effect: assignVariant was NOT called, so assignments
      // Map is empty. Populate it so recordConversion works.
      // Use an internal-but-public route: call assignVariant then overwrite.
    }
    // The above loop exposed users but didn't bind assignments.
    // Simpler: just call assignVariant but use variant id to index.
    // Recreate experiment cleanly to do this properly:
    const ab2 = new ABTesting();
    ab2.createExperiment({
      id: 's2',
      variants: [{ id: 'A', weight: 1 }, { id: 'B', weight: 1 }],
      metric: 'conversion',
    });
    let aExp = 0;
    let bExp = 0;
    let aConv = 0;
    let bConv = 0;
    let i = 0;
    while (aExp < 1000 || bExp < 1000) {
      const u = 'user-' + i;
      const v = ab2.assignVariant('s2', u);
      if (v === 'A' && aExp < 1000) {
        ab2.recordExposure('s2', u, 'A');
        aExp += 1;
        if (aConv < 100) {
          ab2.recordConversion('s2', u, 1);
          aConv += 1;
        }
      } else if (v === 'B' && bExp < 1000) {
        ab2.recordExposure('s2', u, 'B');
        bExp += 1;
        if (bConv < 250) {
          ab2.recordConversion('s2', u, 1);
          bConv += 1;
        }
      }
      i += 1;
      if (i > 100000) throw new Error('loop safety break');
    }
    const sig = ab2.computeSignificance('s2');
    assert.ok(sig.chiSquare.significant, `expected significant, p=${sig.chiSquare.pValue}`);
    assert.ok(sig.chiSquare.pValue < 1e-10);
    assert.equal(sig.pairwise.length, 1);
    assert.ok(sig.pairwise[0].significant);
    assert.ok(Math.abs(sig.pairwise[0].cohenH) > 0.2);
  });
});
