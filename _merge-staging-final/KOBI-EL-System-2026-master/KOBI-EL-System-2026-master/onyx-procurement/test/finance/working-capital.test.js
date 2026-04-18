/* ============================================================================
 * Unit tests — Working Capital Dashboard (Agent Y-078)
 *
 * Run: node --test onyx-procurement/test/finance/working-capital.test.js
 *
 * Covers:
 *   1. All seven formulas — DSO, DPO, DIO, CCC, currentRatio, quickRatio, wcGap
 *   2. Input validation (must-be-number, must-be-positive, etc.)
 *   3. Snapshot recording + append-only rule
 *   4. trend() month-over-month calc (direction classification included)
 *   5. benchmarkVsIndustry() quartile assignment for all four industries
 *   6. whatIfScenario() for the three canonical levers + arbitrary N
 *   7. dashboard() integration (sparklines, alerts, labels)
 *   8. alertThresholds() read + write modes, severity ladder
 *   9. driverDecomposition() for DSO, DPO, DIO, CCC, quickRatio, wcGap
 *  10. Rule "לא מוחקים" — no delete / remove / clear
 * ========================================================================== */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  WorkingCapital,
  METRICS,
  INDUSTRY_BENCHMARKS,
  DEFAULT_ALERT_THRESHOLDS,
  normalisePeriod,
  previousPeriod,
  round1,
  round2
} = require('../../src/finance/working-capital');

/* ----------------------------------------------------------------------------
 * Helpers — realistic Techno-Kol fab-shop seed data
 * -------------------------------------------------------------------------- */

function seed(wc) {
  // Four consecutive months, plausible metal-fab trajectory:
  //   Jan — baseline
  //   Feb — AR creeps up (slow payer), DSO worsens
  //   Mar — push on DPO (we extend supplier terms), DPO improves
  //   Apr — trim inventory (JIT project), DIO improves
  wc.recordSnapshot({
    period: '2026-01',
    ar:                 600_000,
    ap:                 420_000,
    inventory:          850_000,
    revenue:            900_000,
    cogs:               700_000,
    currentAssets:    1_800_000,
    currentLiabilities: 1_100_000,
    workingCapitalRequired:  1_500_000,
    workingCapitalAvailable: 1_450_000,
    days: 30
  });
  wc.recordSnapshot({
    period: '2026-02',
    ar:                 720_000,
    ap:                 440_000,
    inventory:          840_000,
    revenue:            900_000,
    cogs:               700_000,
    currentAssets:    1_830_000,
    currentLiabilities: 1_130_000,
    workingCapitalRequired:  1_560_000,
    workingCapitalAvailable: 1_420_000,
    days: 30
  });
  wc.recordSnapshot({
    period: '2026-03',
    ar:                 700_000,
    ap:                 560_000,   // DPO push
    inventory:          820_000,
    revenue:            930_000,
    cogs:               720_000,
    currentAssets:    1_850_000,
    currentLiabilities: 1_180_000,
    workingCapitalRequired:  1_580_000,
    workingCapitalAvailable: 1_500_000,
    days: 30
  });
  wc.recordSnapshot({
    period: '2026-04',
    ar:                 680_000,
    ap:                 560_000,
    inventory:          720_000,   // JIT — cut by 100k
    revenue:            950_000,
    cogs:               740_000,
    currentAssets:    1_800_000,
    currentLiabilities: 1_180_000,
    workingCapitalRequired:  1_540_000,
    workingCapitalAvailable: 1_560_000, // surplus now
    days: 30
  });
}

/* ============================================================================
 * 0. Sanity
 * ========================================================================== */

describe('WorkingCapital — module surface', () => {
  test('exports the class and helper catalogs', () => {
    assert.equal(typeof WorkingCapital, 'function');
    assert.ok(METRICS.dso && METRICS.dpo && METRICS.dio && METRICS.ccc);
    assert.ok(METRICS.currentRatio && METRICS.quickRatio && METRICS.wcGap);
    assert.ok(INDUSTRY_BENCHMARKS.metal_fab);
    assert.ok(Object.isFrozen(METRICS));
    assert.ok(Object.isFrozen(INDUSTRY_BENCHMARKS));
    assert.ok(Object.isFrozen(DEFAULT_ALERT_THRESHOLDS));
  });

  test('every metric has a he + en label', () => {
    for (const key of Object.keys(METRICS)) {
      const m = METRICS[key];
      assert.ok(m.he && m.he.length > 0, `${key} missing hebrew label`);
      assert.ok(m.en && m.en.length > 0, `${key} missing english label`);
      assert.ok(['lower_is_better', 'higher_is_better'].includes(m.direction));
    }
  });

  test('industry benchmarks cover metal_fab, construction, retail, services', () => {
    assert.deepEqual(
      Object.keys(INDUSTRY_BENCHMARKS).sort(),
      ['construction', 'metal_fab', 'retail', 'services']
    );
    for (const ind of Object.values(INDUSTRY_BENCHMARKS)) {
      for (const m of ['dso', 'dpo', 'dio', 'ccc', 'currentRatio', 'quickRatio']) {
        assert.ok(ind[m], `${ind.id} missing ${m}`);
        assert.ok(ind[m].p25 !== undefined);
        assert.ok(ind[m].median !== undefined);
        assert.ok(ind[m].p75 !== undefined);
      }
      assert.ok(ind.source && ind.source.length > 0, `${ind.id} missing source`);
    }
  });
});

/* ============================================================================
 * 1. Period helpers
 * ========================================================================== */

describe('period helpers', () => {
  test('normalisePeriod accepts YYYY-MM / YYYY-MM-DD / slashes / Date', () => {
    assert.equal(normalisePeriod('2026-04'), '2026-04');
    assert.equal(normalisePeriod('2026-04-15'), '2026-04');
    assert.equal(normalisePeriod('2026/04'), '2026-04');
    assert.equal(normalisePeriod('2026-4'), '2026-04');
    assert.equal(normalisePeriod(new Date(Date.UTC(2026, 3, 15))), '2026-04');
  });

  test('normalisePeriod rejects garbage', () => {
    assert.throws(() => normalisePeriod('hello'));
    assert.throws(() => normalisePeriod(12345));
    assert.throws(() => normalisePeriod(null));
  });

  test('previousPeriod wraps the year boundary', () => {
    assert.equal(previousPeriod('2026-01'), '2025-12');
    assert.equal(previousPeriod('2026-05'), '2026-04');
  });
});

/* ============================================================================
 * 2. Pure formulas
 * ========================================================================== */

describe('WorkingCapital — formulas', () => {
  const wc = new WorkingCapital();

  test('computeDSO: 600k / 900k × 30 = 20.0', () => {
    assert.equal(wc.computeDSO({ ar: 600_000, revenue: 900_000, days: 30 }), 20.0);
  });

  test('computeDSO: defaults days to 30', () => {
    assert.equal(wc.computeDSO({ ar: 450_000, revenue: 900_000 }), 15.0);
  });

  test('computeDSO rejects zero revenue', () => {
    assert.throws(() => wc.computeDSO({ ar: 100, revenue: 0, days: 30 }));
  });

  test('computeDSO rejects negative AR', () => {
    assert.throws(() => wc.computeDSO({ ar: -5, revenue: 900_000, days: 30 }));
  });

  test('computeDPO: 420k / 700k × 30 = 18.0', () => {
    assert.equal(wc.computeDPO({ ap: 420_000, cogs: 700_000, days: 30 }), 18.0);
  });

  test('computeDPO rejects zero cogs', () => {
    assert.throws(() => wc.computeDPO({ ap: 420_000, cogs: 0, days: 30 }));
  });

  test('computeDIO: 850k / 700k × 30 ≈ 36.4', () => {
    const dio = wc.computeDIO({ inventory: 850_000, cogs: 700_000, days: 30 });
    assert.ok(Math.abs(dio - 36.4) < 0.1, `got ${dio}`);
  });

  test('computeCCC: 20 + 36 - 18 = 38', () => {
    assert.equal(wc.computeCCC({ dso: 20, dio: 36, dpo: 18 }), 38);
  });

  test('computeCCC accepts negative (collectors faster than we pay)', () => {
    assert.equal(wc.computeCCC({ dso: 10, dio: 20, dpo: 45 }), -15);
  });

  test('computeCurrentRatio: 1.8M / 1.1M ≈ 1.64', () => {
    const r = wc.computeCurrentRatio({
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    assert.equal(r, 1.64);
  });

  test('computeCurrentRatio rejects zero liabilities', () => {
    assert.throws(() => wc.computeCurrentRatio({
      currentAssets: 1_000_000, currentLiabilities: 0
    }));
  });

  test('computeQuickRatio: (1.8M - 850k) / 1.1M ≈ 0.86', () => {
    const r = wc.computeQuickRatio({
      ca: 1_800_000, inventory: 850_000, cl: 1_100_000
    });
    assert.equal(r, 0.86);
  });

  test('computeWCGap: 1.5M required - 1.45M avail = 50k short', () => {
    const g = wc.computeWCGap({
      workingCapitalRequired: 1_500_000, workingCapitalAvailable: 1_450_000
    });
    assert.equal(g, 50_000);
  });

  test('computeWCGap supports surplus (negative gap)', () => {
    const g = wc.computeWCGap({
      workingCapitalRequired: 1_540_000, workingCapitalAvailable: 1_560_000
    });
    assert.equal(g, -20_000);
  });
});

/* ============================================================================
 * 3. Snapshot recording
 * ========================================================================== */

describe('recordSnapshot', () => {
  test('accepts a full snapshot and computes every metric', () => {
    const wc = new WorkingCapital();
    const snap = wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000,
      workingCapitalRequired: 1_500_000, workingCapitalAvailable: 1_450_000
    });
    assert.equal(snap.period, '2026-01');
    assert.equal(snap.metrics.dso, 20.0);
    assert.equal(snap.metrics.dpo, 18.0);
    assert.ok(Math.abs(snap.metrics.dio - 36.4) < 0.1);
    assert.equal(snap.metrics.wcGap, 50_000);
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.inputs));
    assert.ok(Object.isFrozen(snap.metrics));
  });

  test('refuses silent overwrite (append-only rule)', () => {
    const wc = new WorkingCapital();
    wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    assert.throws(() => wc.recordSnapshot({
      period: '2026-01',
      ar: 650_000, ap: 430_000, inventory: 860_000,
      revenue: 910_000, cogs: 710_000,
      currentAssets: 1_810_000, currentLiabilities: 1_110_000
    }), /already exists/);
  });

  test('upgradeSnapshot preserves history', () => {
    const wc = new WorkingCapital();
    wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    const upgraded = wc.upgradeSnapshot({
      period: '2026-01',
      ar: 610_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    assert.ok(Math.abs(upgraded.metrics.dso - 20.33) < 0.1);
    assert.ok(wc._history.get('2026-01').length === 1);
  });

  test('allows wcGap-less snapshots', () => {
    const wc = new WorkingCapital();
    const s = wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    assert.equal(s.metrics.wcGap, null);
  });

  test('validation catches missing / bad fields', () => {
    const wc = new WorkingCapital();
    assert.throws(() => wc.recordSnapshot({ period: '2026-01' }));
    assert.throws(() => wc.recordSnapshot({
      period: '2026-01',
      ar: -1, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    }));
  });
});

/* ============================================================================
 * 4. Trend — month over month
 * ========================================================================== */

describe('trend() — month over month', () => {
  test('baseline row when no prior period', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const t = wc.trend({ period: '2026-01' });
    assert.equal(t.priorPeriod, null);
    for (const row of t.rows) {
      assert.equal(row.prior, null);
      assert.equal(row.delta, null);
      assert.equal(row.direction, 'baseline');
    }
  });

  test('DSO worsens from Jan → Feb (AR climbs)', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const t = wc.trend({ period: '2026-02' });
    const dsoRow = t.rows.find((r) => r.metric === 'dso');
    assert.ok(dsoRow.delta > 0, 'DSO delta should be positive');
    assert.equal(dsoRow.direction, 'worsening');
  });

  test('DPO improves from Feb → Mar (AP up, we hold cash longer)', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const t = wc.trend({ period: '2026-03' });
    const dpoRow = t.rows.find((r) => r.metric === 'dpo');
    assert.ok(dpoRow.delta > 0);
    assert.equal(dpoRow.direction, 'improving');
  });

  test('DIO improves Mar → Apr (JIT inventory trim)', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const t = wc.trend({ period: '2026-04' });
    const dioRow = t.rows.find((r) => r.metric === 'dio');
    assert.ok(dioRow.delta < 0);
    assert.equal(dioRow.direction, 'improving');
  });

  test('throws for unknown period', () => {
    const wc = new WorkingCapital();
    seed(wc);
    assert.throws(() => wc.trend({ period: '2999-09' }));
  });
});

/* ============================================================================
 * 5. Industry benchmarks
 * ========================================================================== */

describe('benchmarkVsIndustry()', () => {
  test('metal_fab classifies DSO for Apr snapshot', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const b = wc.benchmarkVsIndustry({ industry: 'metal_fab' });
    const dsoRow = b.rows.find((r) => r.metric === 'dso');
    assert.ok(dsoRow);
    assert.equal(b.industry, 'metal_fab');
    assert.equal(b.industryEn, 'Metal fabrication / job-shop');
    // Apr DSO ≈ 21.5 days — that's way under the p25=45 top quartile.
    assert.equal(dsoRow.quartile, 'top_quartile');
    assert.ok(typeof dsoRow.gapToMedian === 'number');
  });

  test('supports all four industries', () => {
    const wc = new WorkingCapital();
    seed(wc);
    for (const ind of ['metal_fab', 'construction', 'retail', 'services']) {
      const b = wc.benchmarkVsIndustry({ industry: ind, period: '2026-04' });
      assert.ok(b.rows.length >= 6);
      assert.ok(b.source && b.source.length > 0);
    }
  });

  test('throws for unknown industry', () => {
    const wc = new WorkingCapital();
    seed(wc);
    assert.throws(() => wc.benchmarkVsIndustry({ industry: 'aerospace' }));
  });

  test('classifies bottom_quartile correctly', () => {
    const wc = new WorkingCapital();
    // A distressed shop: DSO 120 days, DIO 150 days, DPO 20 days
    wc.recordSnapshot({
      period: '2026-04',
      ar: 3_600_000, ap: 500_000, inventory: 3_750_000,
      revenue: 900_000, cogs: 750_000,
      currentAssets: 8_000_000, currentLiabilities: 6_000_000
    });
    const b = wc.benchmarkVsIndustry({ industry: 'metal_fab', period: '2026-04' });
    const dsoRow = b.rows.find((r) => r.metric === 'dso');
    assert.equal(dsoRow.quartile, 'bottom_quartile');
  });
});

/* ============================================================================
 * 6. What-if scenarios
 * ========================================================================== */

describe('whatIfScenario()', () => {
  test('extend-DPO-7-days releases ~7 days of daily COGS', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const r = wc.whatIfScenario({ scenario: 'extend-DPO-7-days' });
    assert.equal(r.lever, 'dpo');
    assert.equal(r.deltaDays, 7);
    // April: cogs 740k / 30 days × 7 = ~172,666
    assert.ok(Math.abs(r.cashReleased - 172_666.67) < 1);
    assert.ok(r.newMetrics.dpo > r.baseMetrics.dpo);
    assert.ok(r.newMetrics.ccc < r.baseMetrics.ccc);
    assert.ok(r.narrativeHe.includes('DPO'));
    assert.ok(r.narrativeEn.includes('DPO'));
  });

  test('collect-DSO-5-days releases 5 days of daily revenue', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const r = wc.whatIfScenario({ scenario: 'collect-DSO-5-days' });
    assert.equal(r.lever, 'dso');
    assert.equal(r.deltaDays, 5);
    // April: revenue 950k / 30 × 5 ≈ 158,333
    assert.ok(Math.abs(r.cashReleased - 158_333.33) < 1);
    assert.ok(r.newMetrics.dso < r.baseMetrics.dso);
    assert.ok(r.newMetrics.ccc < r.baseMetrics.ccc);
  });

  test('reduce-DIO-10-days releases 10 days of daily COGS', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const r = wc.whatIfScenario({ scenario: 'reduce-DIO-10-days' });
    assert.equal(r.lever, 'dio');
    assert.equal(r.deltaDays, 10);
    // April: cogs 740k / 30 × 10 ≈ 246,666
    assert.ok(Math.abs(r.cashReleased - 246_666.67) < 1);
    assert.ok(r.newMetrics.dio < r.baseMetrics.dio);
  });

  test('supports arbitrary N values via regex', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const r = wc.whatIfScenario({ scenario: 'extend-DPO-14-days' });
    assert.equal(r.deltaDays, 14);
    assert.ok(r.cashReleased > 0);
  });

  test('uses basePeriod when supplied', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const r = wc.whatIfScenario({
      scenario: 'collect-DSO-5-days', basePeriod: '2026-01'
    });
    assert.equal(r.basePeriod, '2026-01');
  });

  test('rejects unknown scenarios', () => {
    const wc = new WorkingCapital();
    seed(wc);
    assert.throws(() => wc.whatIfScenario({ scenario: 'freeze-everything' }));
  });
});

/* ============================================================================
 * 7. Dashboard
 * ========================================================================== */

describe('dashboard()', () => {
  test('returns a fully integrated view', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const dash = wc.dashboard('2026-04');
    assert.equal(dash.period, '2026-04');
    assert.ok(dash.metrics.dso > 0);
    assert.ok(Array.isArray(dash.trend));
    assert.equal(dash.trend.length, Object.keys(METRICS).length);
    assert.ok(dash.benchmark);
    assert.ok(dash.alerts);
    assert.ok(dash.sparklines.dso);
    assert.ok(dash.sparklines.dso.includes('<svg'));
    assert.ok(dash.sparklines.dso.includes('polyline'));
  });

  test('defaults to the latest snapshot', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const dash = wc.dashboard();
    assert.equal(dash.period, '2026-04');
  });

  test('throws when there is nothing to show', () => {
    const wc = new WorkingCapital();
    assert.throws(() => wc.dashboard());
  });

  test('sparkline SVGs carry accessibility labels', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const dash = wc.dashboard();
    for (const key of Object.keys(dash.sparklines)) {
      const svg = dash.sparklines[key];
      assert.ok(svg.includes('role="img"'));
      assert.ok(svg.includes('aria-label'));
    }
  });

  test('sparkline handles single-point series', () => {
    const wc = new WorkingCapital();
    wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    const dash = wc.dashboard();
    assert.ok(dash.sparklines.dso.includes('<svg'));
  });
});

/* ============================================================================
 * 8. Alert thresholds
 * ========================================================================== */

describe('alertThresholds()', () => {
  test('no alerts for healthy Apr snapshot', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const a = wc.alertThresholds();
    assert.equal(a.period, '2026-04');
    // April is healthy: DSO ≈ 21.5, DPO ≈ 22.7, DIO ≈ 29.2 — no breaches for most,
    // but DPO < 30 threshold → 1 alert.
    assert.ok(a.count >= 1);
    const dpoAlert = a.alerts.find((x) => x.metric === 'dpo');
    assert.ok(dpoAlert);
  });

  test('fires on slow collections (DSO 120 > 85)', () => {
    const wc = new WorkingCapital();
    wc.recordSnapshot({
      period: '2026-04',
      ar: 3_600_000, ap: 400_000, inventory: 600_000,
      revenue: 900_000, cogs: 750_000,
      currentAssets: 5_000_000, currentLiabilities: 1_000_000
    });
    const a = wc.alertThresholds();
    const dsoAlert = a.alerts.find((x) => x.metric === 'dso');
    assert.ok(dsoAlert, 'expected dso alert');
    assert.ok(['high', 'critical', 'medium'].includes(dsoAlert.severity));
    assert.ok(dsoAlert.messageHe.length > 0);
    assert.ok(dsoAlert.messageEn.length > 0);
  });

  test('write mode upgrades threshold + logs history', () => {
    const wc = new WorkingCapital();
    const r = wc.alertThresholds({ metric: 'dso', threshold: 70 });
    assert.equal(r.action, 'upgraded');
    const read = wc.alertThresholds({});
    assert.ok(Array.isArray(read.thresholdHistory));
    assert.equal(read.thresholdHistory.length, 1);
    assert.equal(read.thresholdHistory[0].metric, 'dso');
    assert.equal(read.thresholdHistory[0].next, 70);
  });

  test('rejects unknown metric in write mode', () => {
    const wc = new WorkingCapital();
    assert.throws(() => wc.alertThresholds({ metric: 'xyz', threshold: 50 }));
  });

  test('severity ladder: critical > high > medium > low', () => {
    const wc = new WorkingCapital();
    // DSO 130 against threshold 85 → ratio 1.53 → critical
    wc.recordSnapshot({
      period: '2026-04',
      ar: 3_900_000, ap: 400_000, inventory: 600_000,
      revenue: 900_000, cogs: 750_000,
      currentAssets: 5_500_000, currentLiabilities: 1_000_000
    });
    const a = wc.alertThresholds();
    const dsoAlert = a.alerts.find((x) => x.metric === 'dso');
    assert.equal(dsoAlert.severity, 'critical');
  });

  test('no alerts when no snapshot', () => {
    const wc = new WorkingCapital();
    const a = wc.alertThresholds();
    assert.equal(a.count, 0);
  });
});

/* ============================================================================
 * 9. Driver decomposition
 * ========================================================================== */

describe('driverDecomposition()', () => {
  test('dso splits into ar + revenue contributions', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('dso');
    assert.equal(d.metric, 'dso');
    assert.equal(d.period, '2026-04');
    assert.equal(d.drivers.length, 2);
    const ar = d.drivers.find((x) => x.name === 'ar');
    const rev = d.drivers.find((x) => x.name === 'revenue');
    assert.ok(ar);
    assert.ok(rev);
    assert.ok(typeof d.totalDelta === 'number');
  });

  test('dpo: ap + cogs', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('dpo');
    assert.equal(d.drivers.length, 2);
  });

  test('dio: inventory + cogs', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('dio');
    assert.equal(d.drivers.length, 2);
    const inv = d.drivers.find((x) => x.name === 'inventory');
    assert.ok(inv);
    // April cut inventory from 820k → 720k → inventory driver improves DIO
    assert.equal(inv.direction, 'improving');
  });

  test('ccc decomposes into DSO + DIO + DPO with DPO inverted', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('ccc');
    assert.equal(d.drivers.length, 3);
    const dpo = d.drivers.find((x) => x.name === 'dpo');
    assert.ok(dpo);
  });

  test('quickRatio splits into 3 drivers (CA, CL, inventory)', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('quickRatio');
    assert.equal(d.drivers.length, 3);
    const inv = d.drivers.find((x) => x.name === 'inventory');
    assert.ok(inv);
  });

  test('currentRatio splits into CA + CL', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('currentRatio');
    assert.equal(d.drivers.length, 2);
  });

  test('wcGap splits into required + available', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const d = wc.driverDecomposition('wcGap');
    assert.equal(d.drivers.length, 2);
  });

  test('returns baseline note when no prior period exists', () => {
    const wc = new WorkingCapital();
    wc.recordSnapshot({
      period: '2026-01',
      ar: 600_000, ap: 420_000, inventory: 850_000,
      revenue: 900_000, cogs: 700_000,
      currentAssets: 1_800_000, currentLiabilities: 1_100_000
    });
    const d = wc.driverDecomposition('dso');
    assert.equal(d.priorPeriod, null);
    assert.equal(d.drivers.length, 0);
  });

  test('rejects unknown metric', () => {
    const wc = new WorkingCapital();
    seed(wc);
    assert.throws(() => wc.driverDecomposition('mystery'));
  });
});

/* ============================================================================
 * 10. House rule — לא מוחקים (no delete / remove / clear)
 * ========================================================================== */

describe('house rule — לא מוחקים, רק משדרגים', () => {
  test('WorkingCapital exposes no delete/remove/clear methods', () => {
    const wc = new WorkingCapital();
    const props = Object.getOwnPropertyNames(Object.getPrototypeOf(wc));
    for (const name of props) {
      assert.ok(!/^delete/i.test(name), `forbidden public method: ${name}`);
      assert.ok(!/^remove/i.test(name), `forbidden public method: ${name}`);
      assert.ok(!/^clear/i.test(name),  `forbidden public method: ${name}`);
      assert.ok(!/^drop/i.test(name),   `forbidden public method: ${name}`);
    }
  });

  test('snapshots are frozen after recording', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const s = wc.getSnapshot('2026-01');
    assert.ok(Object.isFrozen(s));
    assert.ok(Object.isFrozen(s.metrics));
    assert.ok(Object.isFrozen(s.inputs));
  });

  test('listSnapshots returns all records in insertion order', () => {
    const wc = new WorkingCapital();
    seed(wc);
    const list = wc.listSnapshots();
    assert.equal(list.length, 4);
    assert.equal(list[0].period, '2026-01');
    assert.equal(list[3].period, '2026-04');
  });
});
