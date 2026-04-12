/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — AutoInsights unit tests (Agent Y-152)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Runner:
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register \
 *     test/insights/auto-insights.test.ts
 *
 * These tests exercise the AutoInsights pipeline on synthetic sales +
 * procurement datasets. Every test is isolated (no shared state, no
 * filesystem, no network — purely in-memory).
 *
 * Coverage map:
 *   T01  empty dataset → single missingStale insight (severity 10)
 *   T02  spike detector finds a 3-sigma outlier
 *   T03  spike detector ignores non-outliers
 *   T04  dip detector fires on downward outlier
 *   T05  top-movers picks sharpest monthly swing
 *   T06  top-movers ignores swings below 25%
 *   T07  unusual categories catches a whale that breaks the IQR fence
 *   T08  correlations detects a positive Pearson link
 *   T09  correlations detects a negative Pearson link
 *   T10  correlations ignores a pair below the threshold
 *   T11  missing-value detector flags a column >= 10% missing
 *   T12  stale-data detector flags old timestamps
 *   T13  HHI concentration flags a dominant supplier
 *   T14  HHI concentration stays silent when shares are balanced
 *   T15  plateau detector fires on a flat numeric column
 *   T16  growth detector fires on a trending numeric column
 *   T17  ranking — higher severity is returned first
 *   T18  maxResults — caps the number of returned insights
 *   T19  minSeverity — filters low-severity noise
 *   T20  bilingual shape — every insight has HE + EN fields + evidence
 *   T21  synthetic procurement dataset end-to-end produces multi-detector output
 *   T22  pure numeric helpers (mean / stdev / pearson / HHI) are accurate
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AutoInsights,
  analyzeDataset,
  mean,
  stdev,
  median,
  quartile,
  pearson,
  linearSlope,
  herfindahl,
  toNum,
  toDate,
  type Row,
  type Insight,
  type InsightConfig,
} from '../../src/insights/auto-insights';

// ---------------------------------------------------------------------------
// Synthetic dataset fixtures
// ---------------------------------------------------------------------------

/** Builds a sales dataset with `n` rows, monthly cadence, and one spike. */
function buildSalesDataset(
  opts: { n?: number; spikeRow?: number; spikeMult?: number } = {},
): Row[] {
  const n = opts.n ?? 24;
  const rows: Row[] = [];
  const base = new Date(Date.UTC(2025, 0, 1));
  for (let i = 0; i < n; i += 1) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + i);
    let amount = 1000 + i * 10;
    if (opts.spikeRow === i) amount *= opts.spikeMult ?? 10;
    rows.push({
      date: d.toISOString(),
      amount,
      units: 100 + i * 2,
      category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
      region: i % 2 === 0 ? 'North' : 'South',
    });
  }
  return rows;
}

/** Builds a procurement dataset with one dominant supplier. */
function buildProcurementDataset(): Row[] {
  const rows: Row[] = [];
  const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
  const suppliers = [
    { name: 'Mega-Corp', base: 50_000 },
    { name: 'Local-Shop', base: 2_000 },
    { name: 'Mid-Vendor', base: 8_000 },
  ];
  let idx = 0;
  for (const m of months) {
    for (const s of suppliers) {
      rows.push({
        date: `${m}-15T00:00:00.000Z`,
        supplier: s.name,
        amount: s.base + Math.sin(idx) * 100,
        category: s.name === 'Mega-Corp' ? 'steel' : 'misc',
      });
      idx += 1;
    }
  }
  return rows;
}

const SALES_CFG: InsightConfig = {
  numericColumns: ['amount', 'units'],
  categoricalColumns: ['category', 'region'],
  timestampColumn: 'date',
  valueColumn: 'amount',
  zThreshold: 3.0,
  asOf: new Date(Date.UTC(2027, 1, 1)),
};

// ---------------------------------------------------------------------------
// Helper: find an insight by id prefix
// ---------------------------------------------------------------------------

function findById(list: readonly Insight[], prefix: string): Insight | null {
  for (const i of list) {
    if (i.id.startsWith(prefix)) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T01 empty dataset emits a severity-10 missingStale insight', () => {
  const out = analyzeDataset([], SALES_CFG);
  assert.equal(out.length, 1);
  assert.equal(out[0].detector, 'missingStale');
  assert.equal(out[0].severity, 10);
  assert.match(out[0].titleHe, /ריק/);
  assert.match(out[0].titleEn, /empty/i);
});

test('T02 spike detector catches a 3-sigma outlier', () => {
  const data = buildSalesDataset({ spikeRow: 20, spikeMult: 15 });
  const ai = new AutoInsights(SALES_CFG);
  const insights = ai.analyze(data);
  const spike = findById(insights, 'spikeDip:amount');
  assert.ok(spike, 'expected a spikeDip insight');
  assert.ok(spike.severity >= 7, `severity ${spike.severity} should be >= 7`);
  assert.ok(spike.evidence.z !== undefined);
  assert.ok(Math.abs(spike.evidence.z!) >= 3);
  assert.match(spike.titleHe, /זינוק/);
  assert.match(spike.titleEn, /spike/i);
});

test('T03 spike detector stays silent on a clean series', () => {
  const clean: Row[] = [];
  for (let i = 0; i < 12; i += 1) clean.push({ amount: 1000 + i });
  const ai = new AutoInsights({ numericColumns: ['amount'] });
  const insights = ai.analyze(clean);
  const spike = findById(insights, 'spikeDip:amount');
  assert.equal(spike, null, 'no spike expected in a near-linear series');
});

test('T04 dip detector fires on a sharp downward outlier', () => {
  const data = buildSalesDataset({ spikeRow: 10, spikeMult: 0.01 });
  const ai = new AutoInsights(SALES_CFG);
  const insights = ai.analyze(data);
  const dip = findById(insights, 'spikeDip:amount');
  assert.ok(dip, 'expected a dip insight');
  assert.ok(dip.evidence.z !== undefined && dip.evidence.z < 0);
  assert.match(dip.titleHe, /צניחה/);
  assert.match(dip.titleEn, /dip/i);
});

test('T05 top-movers picks up sharpest last-month swing', () => {
  const rows: Row[] = [
    { date: '2026-01-15', category: 'A', amount: 1000 },
    { date: '2026-01-15', category: 'B', amount: 1000 },
    { date: '2026-02-15', category: 'A', amount: 5000 }, // +400%
    { date: '2026-02-15', category: 'B', amount: 1100 }, // +10%, filtered
  ];
  const ai = new AutoInsights({
    ...SALES_CFG,
    numericColumns: [],
    categoricalColumns: ['category'],
  });
  const insights = ai.analyze(rows);
  const mover = findById(insights, 'topMovers:category:A');
  assert.ok(mover, 'expected topMovers insight for A');
  assert.ok(mover.evidence.deltaPct! > 0.25);
  assert.match(mover.titleHe, /עלייה/);
  assert.equal(findById(insights, 'topMovers:category:B'), null);
});

test('T06 top-movers ignores swings below 25%', () => {
  const rows: Row[] = [
    { date: '2026-01-15', category: 'A', amount: 1000 },
    { date: '2026-02-15', category: 'A', amount: 1100 },
  ];
  const ai = new AutoInsights({
    ...SALES_CFG,
    numericColumns: [],
    categoricalColumns: ['category'],
  });
  const insights = ai.analyze(rows);
  assert.equal(findById(insights, 'topMovers:category:A'), null);
});

test('T07 unusual categories detects a whale breaking the IQR fence', () => {
  const rows: Row[] = [];
  // Varied normal categories so IQR > 0 (required by the detector), plus
  // one whale that sits well above the upper IQR fence.
  const normal: Array<[string, number]> = [
    ['A', 95],
    ['B', 100],
    ['C', 105],
    ['D', 110],
    ['E', 115],
    ['F', 120],
    ['G', 125],
  ];
  for (const [name, amt] of normal) rows.push({ category: name, amount: amt });
  rows.push({ category: 'WHALE', amount: 10_000 });
  const ai = new AutoInsights({
    categoricalColumns: ['category'],
    valueColumn: 'amount',
  });
  const insights = ai.analyze(rows);
  const whale = findById(insights, 'unusualCategories:category:WHALE');
  assert.ok(whale, 'expected whale insight');
  assert.ok(whale.evidence.share! > 0.9);
  assert.match(whale.titleEn, /large/i);
});

test('T08 correlations detects a strong positive Pearson link', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i += 1) {
    rows.push({ a: i, b: 2 * i + 3 });
  }
  const ai = new AutoInsights({ numericColumns: ['a', 'b'] });
  const insights = ai.analyze(rows);
  const corr = findById(insights, 'correlations:a:b');
  assert.ok(corr);
  assert.ok(corr.evidence.correlation! > 0.99);
  assert.match(corr.titleHe, /חיובי/);
});

test('T09 correlations detects a strong negative Pearson link', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i += 1) {
    rows.push({ a: i, b: 100 - 3 * i });
  }
  const ai = new AutoInsights({ numericColumns: ['a', 'b'] });
  const insights = ai.analyze(rows);
  const corr = findById(insights, 'correlations:a:b');
  assert.ok(corr);
  assert.ok(corr.evidence.correlation! < -0.99);
  assert.match(corr.titleEn, /negative/i);
});

test('T10 correlations ignores pairs below threshold', () => {
  // Noise: uncorrelated-ish pseudo-random values
  const rows: Row[] = [
    { a: 1, b: 9 },
    { a: 2, b: 3 },
    { a: 3, b: 7 },
    { a: 4, b: 2 },
    { a: 5, b: 8 },
    { a: 6, b: 4 },
    { a: 7, b: 5 },
    { a: 8, b: 1 },
  ];
  const ai = new AutoInsights({
    numericColumns: ['a', 'b'],
    correlationThreshold: 0.9,
  });
  const insights = ai.analyze(rows);
  assert.equal(findById(insights, 'correlations:a:b'), null);
});

test('T11 missing-value detector flags a sparse column', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i += 1) {
    rows.push({ amount: i < 5 ? null : 100, category: 'A' });
  }
  const ai = new AutoInsights({
    numericColumns: ['amount'],
    categoricalColumns: ['category'],
    valueColumn: 'amount',
  });
  const insights = ai.analyze(rows);
  const miss = findById(insights, 'missingStale:missing:amount');
  assert.ok(miss);
  assert.ok(miss.evidence.share! >= 0.1);
});

test('T12 stale-data detector flags old timestamps', () => {
  const rows: Row[] = [{ date: '2024-01-01', amount: 100 }];
  const ai = new AutoInsights({
    numericColumns: ['amount'],
    timestampColumn: 'date',
    valueColumn: 'amount',
    staleDays: 30,
    asOf: new Date('2026-04-11T00:00:00Z'),
  });
  const insights = ai.analyze(rows);
  const stale = findById(insights, 'missingStale:stale:date');
  assert.ok(stale);
  assert.ok((stale.evidence.days ?? 0) > 30);
  assert.match(stale.titleEn, /stale/i);
});

test('T13 HHI concentration flags a dominant supplier', () => {
  const rows = buildProcurementDataset();
  const ai = new AutoInsights({
    categoricalColumns: ['supplier'],
    valueColumn: 'amount',
  });
  const insights = ai.analyze(rows);
  const hhi = findById(insights, 'concentrationHHI:supplier');
  assert.ok(hhi);
  assert.ok((hhi.evidence.hhi ?? 0) > 0.25);
  assert.ok(hhi.severity >= 7);
  assert.match(hhi.titleEn, /Critical|Elevated/i);
});

test('T14 HHI concentration is silent when shares are balanced', () => {
  // 10 equal suppliers → HHI = 10 * 0.1^2 = 0.10 (< 0.15 moderate threshold)
  const rows: Row[] = [];
  for (const s of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
    rows.push({ supplier: s, amount: 1000 });
  }
  const ai = new AutoInsights({
    categoricalColumns: ['supplier'],
    valueColumn: 'amount',
  });
  const insights = ai.analyze(rows);
  assert.equal(findById(insights, 'concentrationHHI:supplier'), null);
});

test('T15 plateau detector fires on a flat numeric column', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 12; i += 1) rows.push({ amount: 1000 });
  const ai = new AutoInsights({ numericColumns: ['amount'] });
  const insights = ai.analyze(rows);
  const plateau = findById(insights, 'plateauGrowth:plateau:amount');
  assert.ok(plateau);
  assert.match(plateau.titleEn, /plateau/i);
});

test('T16 growth detector fires on a trending column', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 12; i += 1) rows.push({ amount: 100 + i * 50 });
  const ai = new AutoInsights({ numericColumns: ['amount'] });
  const insights = ai.analyze(rows);
  const growth = findById(insights, 'plateauGrowth:growth:amount');
  assert.ok(growth);
  assert.ok(growth.evidence.slope! > 0);
  assert.match(growth.titleHe, /צמיחה/);
});

test('T17 ranking returns highest severity first', () => {
  const rows = buildSalesDataset({ spikeRow: 5, spikeMult: 20 });
  const ai = new AutoInsights(SALES_CFG);
  const insights = ai.analyze(rows);
  for (let i = 1; i < insights.length; i += 1) {
    assert.ok(
      insights[i - 1].severity >= insights[i].severity,
      `out of order at index ${i}: ${insights[i - 1].severity} < ${insights[i].severity}`,
    );
  }
});

test('T18 maxResults caps the output length', () => {
  const rows = buildSalesDataset({ spikeRow: 5, spikeMult: 20 });
  const ai = new AutoInsights({ ...SALES_CFG, maxResults: 3 });
  const insights = ai.analyze(rows);
  assert.ok(insights.length <= 3);
});

test('T19 minSeverity filters out low-severity noise', () => {
  const rows: Row[] = [];
  for (let i = 0; i < 10; i += 1) rows.push({ amount: 1000 });
  const ai = new AutoInsights({
    numericColumns: ['amount'],
    minSeverity: 4,
  });
  const insights = ai.analyze(rows);
  // Plateau is severity 3 and should be filtered out
  const plateau = findById(insights, 'plateauGrowth:plateau:amount');
  assert.equal(plateau, null);
});

test('T20 every insight carries HE + EN + evidence + suggestion', () => {
  const rows = buildSalesDataset({ spikeRow: 10, spikeMult: 12 });
  const ai = new AutoInsights(SALES_CFG);
  const insights = ai.analyze(rows);
  assert.ok(insights.length > 0, 'expected at least one insight');
  for (const i of insights) {
    assert.ok(i.titleHe && i.titleHe.length > 0, `missing titleHe on ${i.id}`);
    assert.ok(i.titleEn && i.titleEn.length > 0, `missing titleEn on ${i.id}`);
    assert.ok(i.bodyHe && i.bodyHe.length > 0, `missing bodyHe on ${i.id}`);
    assert.ok(i.bodyEn && i.bodyEn.length > 0, `missing bodyEn on ${i.id}`);
    assert.ok(i.evidence, `missing evidence on ${i.id}`);
    assert.ok(i.suggestion && i.suggestion.he && i.suggestion.en,
      `missing suggestion on ${i.id}`);
    assert.ok(i.severity >= 1 && i.severity <= 10);
    assert.ok(i.confidence >= 0 && i.confidence <= 1);
  }
});

test('T21 synthetic procurement dataset produces multi-detector output', () => {
  const rows = buildProcurementDataset();
  const ai = new AutoInsights({
    numericColumns: ['amount'],
    categoricalColumns: ['supplier', 'category'],
    timestampColumn: 'date',
    valueColumn: 'amount',
    asOf: new Date('2026-04-11T00:00:00Z'),
    staleDays: 30,
  });
  const insights = ai.analyze(rows);
  assert.ok(insights.length >= 2, 'expected multiple insights');
  const detectors = new Set(insights.map((i) => i.detector));
  // Procurement dataset should at least trigger concentration risk
  assert.ok(detectors.has('concentrationHHI'));
});

test('T22 numeric helpers are accurate', () => {
  // mean / stdev
  assert.equal(mean([1, 2, 3, 4, 5]), 3);
  assert.ok(Math.abs(stdev([1, 2, 3, 4, 5]) - 1.5811) < 0.001);
  // median
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  // quartile
  assert.equal(quartile([1, 2, 3, 4, 5], 0.5), 3);
  // pearson — perfect positive
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  // linear slope
  assert.ok(Math.abs(linearSlope([0, 1, 2, 3], [0, 2, 4, 6]) - 2) < 1e-9);
  // herfindahl
  assert.equal(herfindahl([0.5, 0.5]), 0.5);
  assert.equal(herfindahl([1]), 1);
  // toNum
  assert.equal(toNum('42'), 42);
  assert.ok(Number.isNaN(toNum('abc')));
  // toDate
  assert.ok(toDate('2026-01-01') instanceof Date);
  assert.equal(toDate('not-a-date'), null);
});

test('T23 detector id stability — same input → same ids', () => {
  const rows = buildSalesDataset({ spikeRow: 7, spikeMult: 11 });
  const ai = new AutoInsights(SALES_CFG);
  const ids1 = ai.analyze(rows).map((i) => i.id);
  const ids2 = ai.analyze(rows).map((i) => i.id);
  assert.deepEqual(ids1, ids2, 'ids should be deterministic');
});
