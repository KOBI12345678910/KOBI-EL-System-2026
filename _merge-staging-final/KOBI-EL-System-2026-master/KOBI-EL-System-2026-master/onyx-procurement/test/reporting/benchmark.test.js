/**
 * Unit tests for src/reporting/benchmark.js — Agent Y-188
 * =======================================================
 *
 * Scope:
 *   - BenchmarkComparator.loadBenchmarks() with valid / invalid inputs.
 *   - Percentile math: piecewise-linear interpolation for both
 *     higher-is-better (grossMargin) and lower-is-better (DSO).
 *   - Status mapping: EXCELLENT / ABOVE_AVG / AVERAGE / BELOW_AVG / POOR.
 *   - compare() surface: strengths, weaknesses, summary totals.
 *   - Industry notes (bilingual structure — every note has he+en).
 *   - bilingualReport() text contains both Hebrew and English.
 *   - Injectable benchmarks — overriding the default table works.
 *   - Real estate cap-rate bands (5-8% residential, 6-9% commercial).
 *   - Metal fab margin bands  (25-35% gross, 8-15% operating).
 *   - Hebrew industry synonyms ('נדל"ן', 'מתכת').
 *   - Error paths: compare() before loadBenchmarks() should throw.
 *   - Deterministic output ordering for metrics array.
 *   - No mutation of injected benchmark tables.
 *
 * Run:
 *   node --test onyx-procurement/test/reporting/benchmark.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BenchmarkComparator,
  DEFAULT_BENCHMARKS,
  DEFAULT_NOTES,
  METRIC_META,
  STATUS_EXCELLENT,
  STATUS_ABOVE_AVG,
  STATUS_AVERAGE,
  STATUS_BELOW_AVG,
  STATUS_POOR,
  DIR_HIGHER_BETTER,
  DIR_LOWER_BETTER,
  INDUSTRY_METAL_FAB,
  INDUSTRY_REAL_ESTATE,
  SIZE_SMALL,
  SIZE_MEDIUM,
  _internals,
} = require('../../src/reporting/benchmark');

// ─── Helpers ──────────────────────────────────────────────────────

function makeSmallMetalFab() {
  const c = new BenchmarkComparator();
  c.loadBenchmarks('metal_fab', 'small');
  return c;
}

function makeSmallRealEstate() {
  const c = new BenchmarkComparator();
  c.loadBenchmarks('real_estate', 'small');
  return c;
}

// =====================================================================
//  1. loadBenchmarks — valid inputs
// =====================================================================

test('Y-188/01 loadBenchmarks returns a snapshot with the canonical industry+size', () => {
  const c = new BenchmarkComparator();
  const snap = c.loadBenchmarks('metal_fab', 'small');
  assert.equal(snap.industry, INDUSTRY_METAL_FAB);
  assert.equal(snap.size, SIZE_SMALL);
  assert.ok(snap.metrics.grossMargin, 'grossMargin anchors present');
  assert.ok(snap.metrics.operatingMargin, 'operatingMargin anchors present');
  assert.ok(snap.loadedAt, 'loadedAt timestamp present');
});

// =====================================================================
//  2. loadBenchmarks — invalid industry
// =====================================================================

test('Y-188/02 loadBenchmarks throws on unknown industry', () => {
  const c = new BenchmarkComparator();
  assert.throws(() => c.loadBenchmarks('spaceship_factory', 'small'),
    /Unknown industry/);
});

// =====================================================================
//  3. loadBenchmarks — invalid size
// =====================================================================

test('Y-188/03 loadBenchmarks throws on unknown size tier', () => {
  const c = new BenchmarkComparator();
  assert.throws(() => c.loadBenchmarks('metal_fab', 'hyperscale'),
    /Unknown size tier/);
});

// =====================================================================
//  4. Metal fab gross margin 25-35% band — p50 sits in the 25-35 window
// =====================================================================

test('Y-188/04 metal fab gross-margin p50 lies in 25-35% band (small tier)', () => {
  const snap = new BenchmarkComparator().loadBenchmarks('metal_fab', 'small');
  const g = snap.metrics.grossMargin;
  assert.ok(g.p50 >= 25 && g.p50 <= 35,
    `p50 gross margin = ${g.p50}, expected 25-35%`);
});

// =====================================================================
//  5. Metal fab operating margin 8-15% band — p50 sits in 8-15
// =====================================================================

test('Y-188/05 metal fab operating-margin p50 lies in 8-15% band (small tier)', () => {
  const snap = new BenchmarkComparator().loadBenchmarks('metal_fab', 'small');
  const o = snap.metrics.operatingMargin;
  assert.ok(o.p50 >= 8 && o.p50 <= 15,
    `p50 op margin = ${o.p50}, expected 8-15%`);
});

// =====================================================================
//  6. Real estate residential cap rate 5-8% band
// =====================================================================

test('Y-188/06 real-estate residential cap-rate p50 lies in 5-8% band', () => {
  const snap = new BenchmarkComparator().loadBenchmarks('real_estate', 'small');
  const r = snap.metrics.capRateResidential;
  assert.ok(r.p50 >= 5 && r.p50 <= 8,
    `p50 residential cap rate = ${r.p50}, expected 5-8%`);
});

// =====================================================================
//  7. Real estate commercial cap rate 6-9% band
// =====================================================================

test('Y-188/07 real-estate commercial cap-rate p50 lies in 6-9% band', () => {
  const snap = new BenchmarkComparator().loadBenchmarks('real_estate', 'small');
  const r = snap.metrics.capRateCommercial;
  assert.ok(r.p50 >= 6 && r.p50 <= 9,
    `p50 commercial cap rate = ${r.p50}, expected 6-9%`);
});

// =====================================================================
//  8. percentile for higher-is-better metric (grossMargin)
// =====================================================================

test('Y-188/08 percentile: higher-is-better metric is monotone', () => {
  const c = makeSmallMetalFab();
  const lowPct = c.percentile('grossMargin', 20);   // below p10=20
  const medPct = c.percentile('grossMargin', 30);   // ≈ p50
  const hiPct = c.percentile('grossMargin', 42);   // at p90-ish
  assert.ok(lowPct < medPct, `low ${lowPct} < med ${medPct}`);
  assert.ok(medPct < hiPct, `med ${medPct} < hi ${hiPct}`);
  assert.ok(medPct >= 40 && medPct <= 60,
    `median value should land near p50, got ${medPct}`);
});

// =====================================================================
//  9. percentile for lower-is-better metric (DSO)
// =====================================================================

test('Y-188/09 percentile: lower-is-better (DSO) is inverted correctly', () => {
  const c = makeSmallMetalFab();
  // anchors for metal_fab/small DSO: p10:90, p25:75, p50:62, p75:48, p90:35
  const shortPct = c.percentile('dso', 35);  // excellent, should be ~90
  const midPct = c.percentile('dso', 62);  // median, should be ~50
  const longPct = c.percentile('dso', 95);  // worse than p10, should be <20
  assert.ok(shortPct > longPct, `short ${shortPct} > long ${longPct}`);
  assert.ok(shortPct > 80, `DSO=35 should be excellent, got ${shortPct}`);
  assert.ok(longPct < 20, `DSO=95 should be poor, got ${longPct}`);
  assert.ok(midPct >= 40 && midPct <= 60,
    `median DSO should land near p50, got ${midPct}`);
});

// =====================================================================
// 10. rateMetric — status labels are bilingual
// =====================================================================

test('Y-188/10 rateMetric returns bilingual labels + status', () => {
  const c = makeSmallMetalFab();
  const r = c.rateMetric('grossMargin', 40);
  assert.ok(r.labelHe && r.labelHe.length > 0, 'Hebrew label present');
  assert.ok(r.labelEn && r.labelEn.length > 0, 'English label present');
  assert.ok(r.statusHe && r.statusHe.length > 0, 'Hebrew status present');
  assert.ok(r.statusEn && r.statusEn.length > 0, 'English status present');
  assert.equal(r.status, STATUS_EXCELLENT);
});

// =====================================================================
// 11. compare returns metrics, summary, strengths, weaknesses
// =====================================================================

test('Y-188/11 compare() returns structured report with strengths & weaknesses', () => {
  const c = makeSmallMetalFab();
  const cmp = c.compare({
    grossMargin: 42,         // excellent
    operatingMargin: 4,      // poor
    netMargin: 7,            // ≈ average
    dso: 35,                 // excellent (low)
    dpo: 25,                 // weak
  });
  assert.equal(cmp.industry, INDUSTRY_METAL_FAB);
  assert.equal(cmp.size, SIZE_SMALL);
  assert.equal(cmp.metrics.length, 5);
  assert.ok(cmp.summary.averagePercentile >= 0 &&
            cmp.summary.averagePercentile <= 100,
    'average percentile in [0,100]');
  assert.ok(cmp.strengths.length >= 1, 'at least one strength');
  assert.ok(cmp.weaknesses.length >= 1, 'at least one weakness');
  // grossMargin 42 should be excellent.
  const gm = cmp.metrics.find((m) => m.metric === 'grossMargin');
  assert.equal(gm.status, STATUS_EXCELLENT);
  // operatingMargin 4 should be poor (below p10=4, borderline POOR).
  const om = cmp.metrics.find((m) => m.metric === 'operatingMargin');
  assert.ok(om.status === STATUS_POOR || om.status === STATUS_BELOW_AVG,
    `op margin 4 -> ${om.status}`);
});

// =====================================================================
// 12. industryNotes — bilingual, every entry has he AND en
// =====================================================================

test('Y-188/12 industryNotes returns bilingual notes for both industries', () => {
  const c = new BenchmarkComparator();
  const mf = c.industryNotes('metal_fab');
  const re = c.industryNotes('real_estate');
  assert.ok(mf.length >= 3, 'metal_fab has at least 3 notes');
  assert.ok(re.length >= 3, 'real_estate has at least 3 notes');
  for (const n of mf) {
    assert.ok(n.he && n.he.length > 0, 'metal fab note has Hebrew');
    assert.ok(n.en && n.en.length > 0, 'metal fab note has English');
  }
  for (const n of re) {
    assert.ok(n.he && n.he.length > 0, 're note has Hebrew');
    assert.ok(n.en && n.en.length > 0, 're note has English');
  }
});

// =====================================================================
// 13. bilingualReport contains Hebrew and English strings
// =====================================================================

test('Y-188/13 bilingualReport() contains both Hebrew and English text', () => {
  const c = makeSmallMetalFab();
  const cmp = c.compare({ grossMargin: 30, dso: 55 });
  const report = c.bilingualReport(cmp);
  assert.ok(/[\u0590-\u05FF]/.test(report),
    'report contains Hebrew characters');
  assert.ok(/[A-Za-z]/.test(report),
    'report contains ASCII/English characters');
  assert.ok(report.includes('SUMMARY') || report.includes('סיכום'),
    'report has summary section header');
});

// =====================================================================
// 14. Injectable benchmarks override the defaults
// =====================================================================

test('Y-188/14 injectable benchmarks replace the default table', () => {
  const customTable = {
    metal_fab: {
      small: {
        grossMargin: { p10: 10, p25: 15, p50: 20, p75: 25, p90: 30 },
        operatingMargin: { p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 },
        dso: { p10: 120, p25: 100, p50: 80, p75: 60, p90: 40 },
      },
    },
  };
  const c = new BenchmarkComparator({ benchmarks: customTable });
  const snap = c.loadBenchmarks('metal_fab', 'small');
  assert.equal(snap.metrics.grossMargin.p50, 20,
    'custom p50 gross margin applied');
  // With custom p50=20, a value of 20 should land near 50th percentile.
  const pct = c.percentile('grossMargin', 20);
  assert.ok(pct >= 45 && pct <= 55, `expected ~50, got ${pct}`);
});

// =====================================================================
// 15. percentile returns null for unknown metric / non-numeric value
// =====================================================================

test('Y-188/15 percentile returns null for missing metric or NaN', () => {
  const c = makeSmallMetalFab();
  assert.equal(c.percentile('nonexistent_metric', 42), null);
  assert.equal(c.percentile('grossMargin', 'banana'), null);
  assert.equal(c.percentile('grossMargin', NaN), null);
});

// =====================================================================
// 16. compare() before loadBenchmarks() should throw
// =====================================================================

test('Y-188/16 compare() before loadBenchmarks() throws', () => {
  const c = new BenchmarkComparator();
  assert.throws(() => c.compare({ grossMargin: 30 }),
    /loadBenchmarks/);
});

// =====================================================================
// 17. Hebrew industry aliases resolve correctly
// =====================================================================

test('Y-188/17 Hebrew industry aliases (נדל"ן / מתכת) resolve', () => {
  assert.equal(_internals.normaliseIndustry('נדל"ן'), INDUSTRY_REAL_ESTATE);
  assert.equal(_internals.normaliseIndustry('מתכת'), INDUSTRY_METAL_FAB);
  assert.equal(_internals.normaliseIndustry('ייצור_מתכת'), INDUSTRY_METAL_FAB);
  const c = new BenchmarkComparator();
  const snap = c.loadBenchmarks('נדל"ן', 'small');
  assert.equal(snap.industry, INDUSTRY_REAL_ESTATE);
});

// =====================================================================
// 18. Real-estate compare end-to-end
// =====================================================================

test('Y-188/18 real-estate compare end-to-end produces sensible ratings', () => {
  const c = makeSmallRealEstate();
  const cmp = c.compare({
    capRateResidential: 7.0,  // ≈ p75 band
    capRateCommercial: 6.0,   // ≈ p25 band
    occupancyRate: 95,        // ≈ p75 band
    dso: 10,                  // ≈ p75
    noiMargin: 65,            // ≈ p50
  });
  assert.equal(cmp.metrics.length, 5);
  const res = cmp.metrics.find((m) => m.metric === 'capRateResidential');
  assert.ok(res.percentile >= 50, `cap res pct = ${res.percentile}`);
  const occ = cmp.metrics.find((m) => m.metric === 'occupancyRate');
  assert.ok(occ.percentile >= 60, `occupancy pct = ${occ.percentile}`);
});

// =====================================================================
// 19. No mutation of injected benchmark table
// =====================================================================

test('Y-188/19 BenchmarkComparator does not mutate the injected table', () => {
  const table = {
    metal_fab: {
      small: {
        grossMargin: { p10: 10, p25: 15, p50: 20, p75: 25, p90: 30 },
      },
    },
  };
  const frozen = JSON.parse(JSON.stringify(table)); // deep snapshot
  const c = new BenchmarkComparator({ benchmarks: table });
  c.loadBenchmarks('metal_fab', 'small');
  c.compare({ grossMargin: 22 });
  // Original table should be unchanged.
  assert.deepEqual(table, frozen);
});

// =====================================================================
// 20. Deterministic metric order in compare output
// =====================================================================

test('Y-188/20 compare() metric array is sorted deterministically', () => {
  const c = makeSmallMetalFab();
  const cmp = c.compare({
    dso: 50,
    grossMargin: 30,
    operatingMargin: 11,
    dpo: 45,
  });
  const keys = cmp.metrics.map((m) => m.metric);
  const sorted = [...keys].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(keys, sorted);
});

// =====================================================================
// 21. METRIC_META has bilingual entries for every exposed metric
// =====================================================================

test('Y-188/21 METRIC_META has he/en labels, unit, and direction', () => {
  for (const [key, meta] of Object.entries(METRIC_META)) {
    assert.ok(meta.he, `${key} missing HE label`);
    assert.ok(meta.en, `${key} missing EN label`);
    assert.ok(meta.unit, `${key} missing unit`);
    assert.ok(meta.direction === DIR_HIGHER_BETTER ||
              meta.direction === DIR_LOWER_BETTER,
      `${key} direction must be higher/lower_better`);
  }
});

// =====================================================================
// 22. Status mapping sanity check (percentileToStatus)
// =====================================================================

test('Y-188/22 percentileToStatus maps to 5 tiers + unknown', () => {
  const { percentileToStatus } = _internals;
  assert.equal(percentileToStatus(95), STATUS_EXCELLENT);
  assert.equal(percentileToStatus(70), STATUS_ABOVE_AVG);
  assert.equal(percentileToStatus(50), STATUS_AVERAGE);
  assert.equal(percentileToStatus(30), STATUS_BELOW_AVG);
  assert.equal(percentileToStatus(10), STATUS_POOR);
  assert.equal(percentileToStatus(null), 'UNKNOWN');
});
