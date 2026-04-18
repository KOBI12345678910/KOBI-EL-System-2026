/**
 * Sales Forecast — Unit Tests
 * Agent Y-030 — Mega-ERP Techno-Kol Uzi.
 *
 * Covers:
 *   - All 5 forecast methods on synthetic pipelines (known-truth values)
 *   - Monte Carlo convergence (analytical mean & stdev vs simulated)
 *   - Variance calculation (signed, absolute, pct, accuracy score, bias)
 *   - Rollup aggregation (per-rep totals + sandbagging detection)
 *   - Categorization (commit / best-case / pipeline / omitted, stale)
 *   - Snapshot + trend (slipping deal detection)
 *   - Bilingual forecast call script (HE + EN)
 *   - Purity / non-mutation of inputs
 *
 * Run:  node --test test/sales/sales-forecast.test.js
 * Requires Node >= 16 (node:test + assert/strict).
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  SalesForecast,
  DEFAULT_STAGE_PROBABILITIES,
  FORECAST_METHOD_LABELS,
  CATEGORY_LABELS,
  mulberry32,
  standardNormal,
  detectSandbagging,
  normalizeDeal,
  forecastCommit,
  forecastBestCase,
  forecastStageWeighted,
  forecastHistoricalWinRate,
  forecastMonteCarlo,
  percentile,
  inPeriod,
} = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'sales',
  'sales-forecast.js'
));

// ─────────────────────────────────────────────────────────────────────────
// Fixtures — deterministic synthetic pipelines
// ─────────────────────────────────────────────────────────────────────────

function mkDeal(over = {}) {
  return {
    id: 'deal-0',
    name: 'Acme',
    amount: 10000,
    stage: 'proposal',
    probability: 0.40,
    closeDate: '2026-05-15',
    owner: 'rep_1',
    managerId: 'mgr_1',
    updatedAt: '2026-04-01',
    ...over,
  };
}

const Q2_2026 = { start: '2026-04-01', end: '2026-06-30', label: 'Q2-2026' };

function samplePipeline() {
  return [
    mkDeal({ id: 'd1', amount: 100000, probability: 0.95, stage: 'commit',      closeDate: '2026-05-01', owner: 'rep_a' }),
    mkDeal({ id: 'd2', amount: 50000,  probability: 0.75, stage: 'negotiation', closeDate: '2026-05-10', owner: 'rep_a' }),
    mkDeal({ id: 'd3', amount: 30000,  probability: 0.40, stage: 'proposal',    closeDate: '2026-06-01', owner: 'rep_b' }),
    mkDeal({ id: 'd4', amount: 20000,  probability: 0.10, stage: 'qualification', closeDate: '2026-06-20', owner: 'rep_b' }),
    mkDeal({ id: 'd5', amount: 80000,  probability: 0.90, stage: 'commit',      closeDate: '2026-06-05', owner: 'rep_c' }),
    // Out of period — must be ignored
    mkDeal({ id: 'd6', amount: 999999, probability: 0.95, stage: 'commit',      closeDate: '2026-07-15', owner: 'rep_a' }),
    // Lost — probability 0, must not appear in best-case
    mkDeal({ id: 'd7', amount: 500,    probability: 0,    stage: 'closed_lost', closeDate: '2026-05-05', owner: 'rep_a' }),
  ];
}

function approx(actual, expected, tol, msg) {
  const d = Math.abs(actual - expected);
  if (d > tol) {
    assert.fail(
      `${msg || 'approx'}: expected ${expected}, got ${actual} (|Δ|=${d} > ${tol})`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 1 — Date helpers & period filter
// ═════════════════════════════════════════════════════════════════════════

describe('SF.1 date & period helpers', () => {
  test('1.01 inPeriod true for ISO string within window', () => {
    assert.equal(inPeriod('2026-05-15', Q2_2026), true);
  });
  test('1.02 inPeriod false for date after window', () => {
    assert.equal(inPeriod('2026-07-01', Q2_2026), false);
  });
  test('1.03 inPeriod true at boundary start', () => {
    assert.equal(inPeriod('2026-04-01', Q2_2026), true);
  });
  test('1.04 inPeriod true at boundary end', () => {
    assert.equal(inPeriod('2026-06-30', Q2_2026), true);
  });
  test('1.05 inPeriod accepts Date instances', () => {
    assert.equal(inPeriod(new Date('2026-05-15T00:00:00Z'), Q2_2026), true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 2 — Deal normalization
// ═════════════════════════════════════════════════════════════════════════

describe('SF.2 normalizeDeal', () => {
  test('2.01 stage lookup with default probabilities when probability absent', () => {
    const d = normalizeDeal(
      { id: 'x', amount: 1000, stage: 'negotiation', closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    approx(d.probability, 0.75, 1e-9);
  });
  test('2.02 explicit probability wins over stage default', () => {
    const d = normalizeDeal(
      { id: 'x', amount: 1000, stage: 'proposal', probability: 0.33, closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    approx(d.probability, 0.33, 1e-9);
  });
  test('2.03 unknown stage + no probability → 0', () => {
    const d = normalizeDeal(
      { id: 'x', amount: 1000, stage: 'no_such_stage', closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    approx(d.probability, 0, 1e-9);
  });
  test('2.04 negative amount → clamped to 0', () => {
    const d = normalizeDeal(
      { id: 'x', amount: -1000, stage: 'proposal', closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    assert.equal(d.amount, 0);
  });
  test('2.05 probability > 1 clamped', () => {
    const d = normalizeDeal(
      { id: 'x', amount: 1000, stage: 'proposal', probability: 3.2, closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    assert.equal(d.probability, 1);
  });
  test('2.06 stage normalization handles casing and dashes', () => {
    const d = normalizeDeal(
      { id: 'x', amount: 1000, stage: 'Proposal-Sent', closeDate: '2026-05-01' },
      DEFAULT_STAGE_PROBABILITIES
    );
    approx(d.probability, 0.65, 1e-9);
  });
  test('2.07 throws on non-object', () => {
    assert.throws(() => normalizeDeal(null, DEFAULT_STAGE_PROBABILITIES));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 3 — Forecast method: commit
// ═════════════════════════════════════════════════════════════════════════

describe('SF.3 commit method', () => {
  test('3.01 only includes p >= 0.90 deals in period', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'commit',
    });
    // d1 (100k, p=0.95) + d5 (80k, p=0.90) = 180,000
    assert.equal(f.total, 180000);
    assert.equal(f.dealCount, 2);
  });
  test('3.02 empty pipeline → 0', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({ pipeline: [], period: Q2_2026, method: 'commit' });
    assert.equal(f.total, 0);
    assert.equal(f.dealCount, 0);
  });
  test('3.03 ignores out-of-period deals even if p=1', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [mkDeal({ id: 'x', amount: 999999, probability: 1, closeDate: '2027-01-01' })],
      period: Q2_2026,
      method: 'commit',
    });
    assert.equal(f.total, 0);
  });
  test('3.04 boundary: p=0.895 NOT committed, p=0.900 IS committed', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [
        mkDeal({ id: 'x', amount: 1000, probability: 0.895, closeDate: '2026-05-01' }),
        mkDeal({ id: 'y', amount: 1000, probability: 0.900, closeDate: '2026-05-01' }),
      ],
      period: Q2_2026,
      method: 'commit',
    });
    assert.equal(f.total, 1000);
    assert.equal(f.dealCount, 1);
    assert.equal(f.deals[0].id, 'y');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 4 — Forecast method: best-case
// ═════════════════════════════════════════════════════════════════════════

describe('SF.4 best-case method', () => {
  test('4.01 sum of all in-period deals with p > 0', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'best-case',
    });
    // d1+d2+d3+d4+d5 = 100k + 50k + 30k + 20k + 80k = 280,000
    // d6 out of period, d7 p=0 excluded
    assert.equal(f.total, 280000);
    assert.equal(f.dealCount, 5);
  });
  test('4.02 p=0 deals excluded', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [mkDeal({ id: 'x', amount: 5000, probability: 0, closeDate: '2026-05-01' })],
      period: Q2_2026,
      method: 'best-case',
    });
    assert.equal(f.total, 0);
  });
  test('4.03 best-case >= stage-weighted always', () => {
    const sf = new SalesForecast();
    const bc = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'best-case',
    });
    const sw = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'stage-weighted',
    });
    assert.ok(bc.total >= sw.total, `best-case (${bc.total}) must >= stage-weighted (${sw.total})`);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 5 — Forecast method: stage-weighted
// ═════════════════════════════════════════════════════════════════════════

describe('SF.5 stage-weighted method', () => {
  test('5.01 matches manual Σ(amount×p)', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'stage-weighted',
    });
    // d1: 100k*0.95 = 95000
    // d2: 50k*0.75  = 37500
    // d3: 30k*0.40  = 12000
    // d4: 20k*0.10  = 2000
    // d5: 80k*0.90  = 72000
    //                 ───────
    //                 218,500
    approx(f.total, 218500, 1e-6);
    assert.equal(f.dealCount, 6); // includes d7 (p=0) which contributes 0
  });
  test('5.02 each weighted deal has weightedAmount field', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [mkDeal({ id: 'x', amount: 1000, probability: 0.30, closeDate: '2026-05-01' })],
      period: Q2_2026,
      method: 'stage-weighted',
    });
    approx(f.deals[0].weightedAmount, 300, 1e-9);
  });
  test('5.03 stage-weighted = monte-carlo analytical mean', () => {
    const sf = new SalesForecast();
    const sw = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'stage-weighted',
    });
    const mc = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 1,
      seed: 1,
    });
    approx(mc.analytical.mean, sw.total, 1e-6);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 6 — Forecast method: historical-win-rate
// ═════════════════════════════════════════════════════════════════════════

describe('SF.6 historical-win-rate method', () => {
  test('6.01 uses per-rep rates', () => {
    const sf = new SalesForecast({
      winRates: { rep_a: 0.80, rep_b: 0.20, rep_c: 0.50 },
    });
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'historical-win-rate',
    });
    // d1 rep_a: 100k*0.80 = 80000
    // d2 rep_a: 50k*0.80  = 40000
    // d3 rep_b: 30k*0.20  = 6000
    // d4 rep_b: 20k*0.20  = 4000
    // d5 rep_c: 80k*0.50  = 40000
    // d7 rep_a: 500*0.80  = 400
    //                      ──────
    //                      170,400
    approx(f.total, 170400, 1e-6);
  });
  test('6.02 unknown rep falls back to fallbackWinRate', () => {
    const sf = new SalesForecast({ winRates: {}, fallbackWinRate: 0.25 });
    const f = sf.buildForecast({
      pipeline: [mkDeal({ id: 'x', amount: 1000, owner: 'unknown_rep', closeDate: '2026-05-01' })],
      period: Q2_2026,
      method: 'historical-win-rate',
    });
    approx(f.total, 250, 1e-6);
  });
  test('6.03 scalar winRates applies uniformly', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [
        mkDeal({ id: 'a', amount: 1000, closeDate: '2026-05-01' }),
        mkDeal({ id: 'b', amount: 2000, closeDate: '2026-05-01' }),
      ],
      period: Q2_2026,
      method: 'historical-win-rate',
      winRates: 0.50,
    });
    approx(f.total, 1500, 1e-6);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 7 — Forecast method: monte-carlo (convergence!)
// ═════════════════════════════════════════════════════════════════════════

describe('SF.7 monte-carlo method', () => {
  test('7.01 simulated mean ≈ analytical mean at 10k trials', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 42,
    });
    // Analytical mean = stage-weighted total = 218,500
    approx(f.mean, f.analytical.mean, f.analytical.mean * 0.02,
      '10k-trial MC mean should be within 2% of analytical expected value');
  });

  test('7.02 simulated stdev ≈ analytical stdev at 10k trials', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 42,
    });
    approx(f.stdev, f.analytical.stdev, f.analytical.stdev * 0.05,
      '10k-trial MC stdev should be within 5% of analytical expected value');
  });

  test('7.03 determinism: same seed → same mean', () => {
    const sf = new SalesForecast();
    const a = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 5000,
      seed: 7,
    });
    const b = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 5000,
      seed: 7,
    });
    assert.equal(a.mean, b.mean);
    assert.equal(a.stdev, b.stdev);
    assert.equal(a.percentiles.p50, b.percentiles.p50);
  });

  test('7.04 different seeds produce different sample paths but similar means', () => {
    const sf = new SalesForecast();
    const a = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 1,
    });
    const b = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 999,
    });
    // Both should converge to the same analytical mean (they share the
    // same pipeline) but the exact sample means should differ.
    approx(a.mean, b.mean, a.analytical.mean * 0.03);
    approx(a.mean, a.analytical.mean, a.analytical.mean * 0.02);
  });

  test('7.05 percentiles are monotonically increasing', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 42,
    });
    const p = f.percentiles;
    assert.ok(p.p10 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p90 && p.p90 <= p.p95,
      `percentiles must be monotonic, got ${JSON.stringify(p)}`);
  });

  test('7.06 all-committed pipeline → analytical stdev very small', () => {
    // When every p = 1.0, variance = 0, so every trial gives the same total.
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [
        mkDeal({ id: 'a', amount: 1000, probability: 1.0, closeDate: '2026-05-01' }),
        mkDeal({ id: 'b', amount: 2000, probability: 1.0, closeDate: '2026-05-15' }),
      ],
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 1000,
      seed: 42,
    });
    assert.equal(f.analytical.stdev, 0);
    approx(f.stdev, 0, 1e-9);
    approx(f.mean, 3000, 1e-9);
  });

  test('7.07 coin-flip pipeline: mean ≈ 50% of total amount, nonzero stdev', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [
        mkDeal({ id: 'a', amount: 1000, probability: 0.5, closeDate: '2026-05-01' }),
        mkDeal({ id: 'b', amount: 1000, probability: 0.5, closeDate: '2026-05-05' }),
        mkDeal({ id: 'c', amount: 1000, probability: 0.5, closeDate: '2026-05-10' }),
        mkDeal({ id: 'd', amount: 1000, probability: 0.5, closeDate: '2026-05-15' }),
      ],
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 10000,
      seed: 123,
    });
    approx(f.mean, 2000, 100);
    approx(f.analytical.mean, 2000, 1e-6);
    // var = 4 * 1000^2 * 0.5 * 0.5 = 1,000,000  → sd = 1000
    approx(f.analytical.stdev, 1000, 1e-6);
    approx(f.stdev, 1000, 50);
  });

  test('7.08 empty pipeline → 0 mean, 0 stdev, well-formed shape', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: [],
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 100,
      seed: 42,
    });
    assert.equal(f.mean, 0);
    assert.equal(f.stdev, 0);
    assert.ok(f.percentiles);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 8 — Variance calculation
// ═════════════════════════════════════════════════════════════════════════

describe('SF.8 variance', () => {
  test('8.01 perfect forecast → variance 0, accuracy 1', () => {
    const sf = new SalesForecast();
    const v = sf.variance({ total: 100000 }, { total: 100000 });
    assert.equal(v.variance, 0);
    assert.equal(v.accuracyScore, 1);
    assert.equal(v.bias, 'accurate');
  });
  test('8.02 under-forecast: actual > forecast → bias under-forecast', () => {
    const sf = new SalesForecast();
    const v = sf.variance({ total: 100000 }, { total: 110000 });
    assert.equal(v.variance, 10000);
    approx(v.variancePct, 0.10, 1e-9);
    assert.equal(v.bias, 'under-forecast');
  });
  test('8.03 over-forecast: actual < forecast → bias over-forecast', () => {
    const sf = new SalesForecast();
    const v = sf.variance({ total: 100000 }, { total: 80000 });
    assert.equal(v.variance, -20000);
    approx(v.variancePct, -0.20, 1e-9);
    assert.equal(v.bias, 'over-forecast');
    approx(v.accuracyScore, 0.80, 1e-9);
  });
  test('8.04 accepts raw numbers', () => {
    const sf = new SalesForecast();
    const v = sf.variance(50000, 45000);
    assert.equal(v.variance, -5000);
  });
  test('8.05 accuracy score floors at 0 for huge misses', () => {
    const sf = new SalesForecast();
    const v = sf.variance(1000, 5000);
    assert.equal(v.accuracyScore, 0);
  });
  test('8.06 forecast of 0 is handled safely (no divide by zero)', () => {
    const sf = new SalesForecast();
    const v = sf.variance({ total: 0 }, { total: 1000 });
    assert.equal(Number.isFinite(v.variancePct), true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 9 — Rollup aggregation + sandbagging detection
// ═════════════════════════════════════════════════════════════════════════

describe('SF.9 rollup', () => {
  test('9.01 sums per-method totals across reps', () => {
    const sf = new SalesForecast();
    const roll = sf.rollup({
      rep_a: { commit: 100000, 'stage-weighted': 150000, 'historical-win-rate': 140000 },
      rep_b: { commit: 50000,  'stage-weighted': 80000,  'historical-win-rate': 85000 },
    }, 'mgr_1');
    assert.equal(roll.totals.commit, 150000);
    assert.equal(roll.totals['stage-weighted'], 230000);
    assert.equal(roll.totals['historical-win-rate'], 225000);
  });

  test('9.02 respects hierarchy filter', () => {
    const sf = new SalesForecast({
      hierarchy: { rep_a: 'mgr_1', rep_b: 'mgr_2' },
    });
    const roll = sf.rollup({
      rep_a: { commit: 100000 },
      rep_b: { commit: 50000 },
    }, 'mgr_1');
    assert.equal(roll.totals.commit, 100000);
    assert.equal(roll.reps.length, 1);
    assert.equal(roll.reps[0].repId, 'rep_a');
  });

  test('9.03 detects sandbagging (stage-weighted << historical-win-rate)', () => {
    const sf = new SalesForecast();
    const roll = sf.rollup({
      rep_a: { 'stage-weighted': 50000, 'historical-win-rate': 100000 },
    }, 'mgr_1');
    assert.equal(roll.sandbagging.length, 1);
    assert.equal(roll.sandbagging[0].kind, 'sandbagging');
    assert.equal(roll.sandbagging[0].repId, 'rep_a');
  });

  test('9.04 detects inflation (stage-weighted >> historical-win-rate)', () => {
    const sf = new SalesForecast();
    const roll = sf.rollup({
      rep_b: { 'stage-weighted': 200000, 'historical-win-rate': 100000 },
    });
    assert.equal(roll.sandbagging.length, 1);
    assert.equal(roll.sandbagging[0].kind, 'inflation');
  });

  test('9.05 does not flag reps within the normal band', () => {
    const sf = new SalesForecast();
    const roll = sf.rollup({
      rep_a: { 'stage-weighted': 100000, 'historical-win-rate': 100000 },
      rep_b: { 'stage-weighted':  90000, 'historical-win-rate': 100000 },
    });
    assert.equal(roll.sandbagging.length, 0);
  });

  test('9.06 detectSandbagging unit: edge case insufficient data', () => {
    const r = detectSandbagging(100, 0);
    assert.equal(r.kind, 'insufficient-data');
    assert.equal(r.flagged, false);
  });

  test('9.07 rolls up from nested forecast shape { commit: { total } }', () => {
    const sf = new SalesForecast();
    const roll = sf.rollup({
      rep_a: {
        commit: { total: 50000, method: 'commit' },
        'stage-weighted': { total: 70000 },
      },
    });
    assert.equal(roll.totals.commit, 50000);
    assert.equal(roll.totals['stage-weighted'], 70000);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 10 — Snapshot + trend
// ═════════════════════════════════════════════════════════════════════════

describe('SF.10 snapshot + forecastTrend', () => {
  test('10.01 snapshotForecast stores a frozen copy', () => {
    const sf = new SalesForecast();
    const f = sf.buildAndRemember({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'stage-weighted',
    });
    const snap = sf.snapshotForecast('2026-04-05');
    assert.ok(Object.isFrozen(snap));
    assert.equal(snap.total, f.total);
    assert.equal(snap.snapshotDate, '2026-04-05');
  });

  test('10.02 snapshotForecast accepts explicit forecast', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'commit',
    });
    const snap = sf.snapshotForecast('2026-04-05', { forecast: f });
    assert.equal(snap.total, f.total);
  });

  test('10.03 throws when nothing to snapshot', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.snapshotForecast('2026-04-05'));
  });

  test('10.04 forecastTrend returns total delta across snapshots', () => {
    const sf = new SalesForecast();

    // Snapshot 1
    sf.buildAndRemember({
      pipeline: [
        mkDeal({ id: 'a', amount: 100000, probability: 0.95, stage: 'commit', closeDate: '2026-05-01' }),
        mkDeal({ id: 'b', amount: 50000,  probability: 0.95, stage: 'commit', closeDate: '2026-05-10' }),
      ],
      period: Q2_2026,
      method: 'commit',
    });
    sf.snapshotForecast('2026-04-01');

    // Snapshot 2 — deal 'b' slipped out (moved to 2026-07-01)
    sf.buildAndRemember({
      pipeline: [
        mkDeal({ id: 'a', amount: 100000, probability: 0.95, stage: 'commit', closeDate: '2026-05-01' }),
        mkDeal({ id: 'b', amount: 50000,  probability: 0.95, stage: 'commit', closeDate: '2026-07-01' }),
      ],
      period: Q2_2026,
      method: 'commit',
    });
    sf.snapshotForecast('2026-04-08');

    const trend = sf.forecastTrend(Q2_2026);
    assert.equal(trend.points.length, 2);
    assert.equal(trend.totalDelta, -50000);
    assert.equal(trend.wowDelta, -50000);
    assert.deepEqual(trend.slippingDealIds, ['b']);
  });

  test('10.05 forecastTrend with no slipping returns empty slippingDealIds', () => {
    const sf = new SalesForecast();
    const p = samplePipeline();
    sf.buildAndRemember({ pipeline: p, period: Q2_2026, method: 'stage-weighted' });
    sf.snapshotForecast('2026-04-01');
    sf.buildAndRemember({ pipeline: p, period: Q2_2026, method: 'stage-weighted' });
    sf.snapshotForecast('2026-04-08');
    const trend = sf.forecastTrend(Q2_2026);
    assert.deepEqual(trend.slippingDealIds, []);
    assert.equal(trend.wowDelta, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 11 — categorizeDeal
// ═════════════════════════════════════════════════════════════════════════

describe('SF.11 categorizeDeal', () => {
  test('11.01 p >= 0.90 → commit', () => {
    const sf = new SalesForecast();
    const c = sf.categorizeDeal(mkDeal({ probability: 0.95 }));
    assert.equal(c.category, 'commit');
  });
  test('11.02 0.50 <= p < 0.90 → best-case', () => {
    const sf = new SalesForecast();
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.75 })).category, 'best-case');
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.50 })).category, 'best-case');
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.899 })).category, 'best-case');
  });
  test('11.03 0.10 <= p < 0.50 → pipeline', () => {
    const sf = new SalesForecast();
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.10 })).category, 'pipeline');
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.49 })).category, 'pipeline');
  });
  test('11.04 p < 0.10 → omitted', () => {
    const sf = new SalesForecast();
    assert.equal(sf.categorizeDeal(mkDeal({ probability: 0.05 })).category, 'omitted');
  });
  test('11.05 stale detection flags old updatedAt', () => {
    const sf = new SalesForecast({ staleDays: 30 });
    sf._now = () => new Date('2026-04-11T00:00:00Z');
    const c = sf.categorizeDeal(mkDeal({ updatedAt: '2026-02-01', probability: 0.6 }));
    assert.equal(c.stale, true);
  });
  test('11.06 fresh deal is not stale', () => {
    const sf = new SalesForecast({ staleDays: 30 });
    sf._now = () => new Date('2026-04-11T00:00:00Z');
    const c = sf.categorizeDeal(mkDeal({ updatedAt: '2026-04-05', probability: 0.6 }));
    assert.equal(c.stale, false);
  });
  test('11.07 categoryLabel is bilingual', () => {
    const sf = new SalesForecast();
    const c = sf.categorizeDeal(mkDeal({ probability: 0.95 }));
    assert.ok(c.categoryLabel.he);
    assert.ok(c.categoryLabel.en);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 12 — generateForecastCall (bilingual)
// ═════════════════════════════════════════════════════════════════════════

describe('SF.12 generateForecastCall', () => {
  test('12.01 produces both Hebrew and English scripts', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'stage-weighted',
    });
    const call = sf.generateForecastCall(f);
    assert.ok(call.script_he.length > 0);
    assert.ok(call.script_en.length > 0);
    // Must contain Hebrew characters in HE script
    assert.ok(/[\u0590-\u05FF]/.test(call.script_he), 'HE script must contain Hebrew');
    // EN script must contain ASCII
    assert.ok(/[A-Za-z]/.test(call.script_en), 'EN script must contain English');
  });
  test('12.02 sections include opener, headline, detail, questions', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'commit',
    });
    const call = sf.generateForecastCall(f);
    assert.ok(call.sections.opener.he && call.sections.opener.en);
    assert.ok(call.sections.headline.he && call.sections.headline.en);
    assert.ok(Array.isArray(call.sections.questions.he));
    assert.ok(Array.isArray(call.sections.questions.en));
    assert.equal(call.sections.questions.he.length, call.sections.questions.en.length);
  });
  test('12.03 monte-carlo forecast mentions percentiles', () => {
    const sf = new SalesForecast();
    const f = sf.buildForecast({
      pipeline: samplePipeline(),
      period: Q2_2026,
      method: 'monte-carlo',
      trials: 5000,
      seed: 42,
    });
    const call = sf.generateForecastCall(f);
    assert.ok(call.sections.detail.he.includes('p10'));
    assert.ok(call.sections.detail.en.includes('p10'));
  });
  test('12.04 throws on non-forecast input', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.generateForecastCall(null));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 13 — Purity / non-mutation
// ═════════════════════════════════════════════════════════════════════════

describe('SF.13 purity', () => {
  test('13.01 buildForecast does not mutate pipeline', () => {
    const sf = new SalesForecast();
    const pipeline = samplePipeline();
    const snapshot = JSON.parse(JSON.stringify(pipeline));
    sf.buildForecast({ pipeline, period: Q2_2026, method: 'stage-weighted' });
    assert.deepEqual(pipeline, snapshot);
  });
  test('13.02 buildForecast does not mutate period', () => {
    const sf = new SalesForecast();
    const period = { ...Q2_2026 };
    const before = JSON.stringify(period);
    sf.buildForecast({ pipeline: samplePipeline(), period, method: 'commit' });
    assert.equal(JSON.stringify(period), before);
  });
  test('13.03 snapshot is deep-frozen', () => {
    const sf = new SalesForecast();
    sf.buildAndRemember({ pipeline: samplePipeline(), period: Q2_2026, method: 'stage-weighted' });
    const snap = sf.snapshotForecast('2026-04-05');
    assert.ok(Object.isFrozen(snap));
    if (snap.deals && snap.deals.length) {
      assert.ok(Object.isFrozen(snap.deals[0]));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 14 — PRNG & standardNormal
// ═════════════════════════════════════════════════════════════════════════

describe('SF.14 PRNG + standardNormal', () => {
  test('14.01 mulberry32 is deterministic', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      assert.equal(r1(), r2());
    }
  });
  test('14.02 mulberry32 output in [0,1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });
  test('14.03 standardNormal mean ≈ 0 at 10k samples', () => {
    const r = mulberry32(42);
    let s = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) s += standardNormal(r);
    approx(s / n, 0, 0.05);
  });
  test('14.04 standardNormal stdev ≈ 1 at 10k samples', () => {
    const r = mulberry32(42);
    const samples = [];
    for (let i = 0; i < 10000; i++) samples.push(standardNormal(r));
    const m = samples.reduce((a, b) => a + b, 0) / samples.length;
    let ss = 0;
    for (const s of samples) ss += (s - m) * (s - m);
    approx(Math.sqrt(ss / (samples.length - 1)), 1, 0.05);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 15 — percentile helper
// ═════════════════════════════════════════════════════════════════════════

describe('SF.15 percentile', () => {
  test('15.01 p50 of [1..100] ≈ 50.5', () => {
    const arr = [];
    for (let i = 1; i <= 100; i++) arr.push(i);
    approx(percentile(arr, 0.50), 50.5, 1e-9);
  });
  test('15.02 p0 = min, p100 = max', () => {
    const arr = [10, 20, 30, 40, 50];
    assert.equal(percentile(arr, 0), 10);
    assert.equal(percentile(arr, 1), 50);
  });
  test('15.03 empty array → 0', () => {
    assert.equal(percentile([], 0.5), 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 16 — Labels completeness (bilingual guarantee)
// ═════════════════════════════════════════════════════════════════════════

describe('SF.16 bilingual labels', () => {
  test('16.01 every forecast method has he+en labels', () => {
    for (const key of Object.keys(FORECAST_METHOD_LABELS)) {
      const lbl = FORECAST_METHOD_LABELS[key];
      assert.ok(lbl.he && lbl.en, `method ${key} missing label`);
      assert.ok(/[\u0590-\u05FF]/.test(lbl.he), `method ${key} he must contain Hebrew`);
    }
  });
  test('16.02 every category label is bilingual', () => {
    for (const key of Object.keys(CATEGORY_LABELS)) {
      const lbl = CATEGORY_LABELS[key];
      assert.ok(lbl.he && lbl.en, `category ${key} missing label`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SECTION 17 — Error handling
// ═════════════════════════════════════════════════════════════════════════

describe('SF.17 error handling', () => {
  test('17.01 buildForecast throws on non-array pipeline', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.buildForecast({ pipeline: 'nope', period: Q2_2026, method: 'commit' }));
  });
  test('17.02 buildForecast throws on missing period', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.buildForecast({ pipeline: [], method: 'commit' }));
  });
  test('17.03 buildForecast throws on unknown method', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.buildForecast({ pipeline: [], period: Q2_2026, method: 'psychic' }));
  });
  test('17.04 rollup throws on non-object', () => {
    const sf = new SalesForecast();
    assert.throws(() => sf.rollup(null, 'mgr'));
  });
});
