/**
 * ONYX AI — Outlier Explainer Tests (Agent Y-161)
 * ------------------------------------------------------------
 * Run with:
 *   npx node --test --require ts-node/register test/stats/outlier-explainer.test.ts
 *
 * 20 tests — node:test built-in runner, zero external deps.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  OutlierExplainer,
  computeStats,
  computeQuartiles,
  modifiedZScore,
  percentileRank,
  groupBy,
  countSimilarCasesLast12Months,
  affectedCategories,
  defaultOutlierExplainer,
} from '../../src/stats/outlier-explainer';
import type {
  ReferenceRow,
  TargetRow,
} from '../../src/stats/outlier-explainer';

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

/** Fixed clock so `similarCasesLast12Months` is reproducible. */
const FIXED_NOW = new Date('2026-04-11T12:00:00Z');

function daysAgo(n: number): string {
  const d = new Date(FIXED_NOW.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** A 12-month vendor-invoice reference with three vendors. */
function buildReference(): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  // Vendor A — tight cluster around 1000
  for (let i = 0; i < 20; i++) {
    rows.push({
      value: 1000 + ((i * 37) % 100) - 50, // 950..1049 spread
      vendorId: 'A',
      category: 'materials',
      department: 'construction',
      projectId: 'P-1',
      timestamp: daysAgo(300 - i * 10),
    });
  }
  // Vendor B — wider cluster around 500
  for (let i = 0; i < 15; i++) {
    rows.push({
      value: 500 + ((i * 53) % 200) - 100,
      vendorId: 'B',
      category: 'services',
      department: 'operations',
      projectId: 'P-2',
      timestamp: daysAgo(250 - i * 12),
    });
  }
  // Vendor C — small sample
  for (let i = 0; i < 6; i++) {
    rows.push({
      value: 300 + ((i * 17) % 40) - 20,
      vendorId: 'C',
      category: 'materials',
      department: 'construction',
      projectId: 'P-1',
      timestamp: daysAgo(180 - i * 20),
    });
  }
  return rows;
}

function makeExplainer(): OutlierExplainer {
  return new OutlierExplainer({ now: () => FIXED_NOW });
}

// ----------------------------------------------------------------
// 1. Pure-math helpers
// ----------------------------------------------------------------

test('computeStats — mean / stdev on a known dataset', () => {
  const s = computeStats([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(s.n, 8);
  assert.equal(s.mean, 5);
  // Sample stdev = sqrt(32/7) ~= 2.138
  assert.ok(Math.abs(s.stdev - Math.sqrt(32 / 7)) < 1e-9);
  assert.equal(s.min, 2);
  assert.equal(s.max, 9);
  assert.equal(s.sum, 40);
});

test('computeStats — empty array is safe', () => {
  const s = computeStats([]);
  assert.equal(s.n, 0);
  assert.equal(s.mean, 0);
  assert.equal(s.stdev, 0);
});

test('computeQuartiles — Tukey fences on a simple series', () => {
  const q = computeQuartiles([1, 2, 3, 4, 5, 6, 7, 8, 9], 1.5);
  assert.equal(q.q2, 5);
  assert.ok(q.q1 < q.q3);
  assert.ok(q.upperFence > q.q3);
  assert.ok(q.lowerFence < q.q1);
  assert.ok(Math.abs(q.iqr - (q.q3 - q.q1)) < 1e-9);
});

test('modifiedZScore — honors 0.6745 scaling and zero MAD', () => {
  // With median 5 and MAD 2: mz(9) = 0.6745 * (9-5) / 2 = 1.349
  assert.ok(Math.abs(modifiedZScore(9, 5, 2) - 1.349) < 1e-6);
  // MAD == 0 must NOT throw — returns 0.
  assert.equal(modifiedZScore(100, 5, 0), 0);
});

test('percentileRank — midpoint gives ~50, max ~100', () => {
  const series = [10, 20, 30, 40, 50];
  assert.equal(percentileRank(30, series), 50); // 2 below + 0.5*1 equal / 5 = 50
  assert.equal(percentileRank(50, series), 90); // 4 below + 0.5 equal / 5 = 90
  assert.equal(percentileRank(5, series), 0);
});

test('groupBy — groups by a dimension and skips missing keys', () => {
  const rows = [
    { value: 1, vendorId: 'A' },
    { value: 2, vendorId: 'A' },
    { value: 3, vendorId: 'B' },
    { value: 4 }, // missing vendorId — must be skipped
  ];
  const g = groupBy(rows, 'vendorId');
  assert.equal(g.size, 2);
  assert.equal(g.get('A')!.length, 2);
  assert.equal(g.get('B')!.length, 1);
});

test('countSimilarCasesLast12Months — respects time + tolerance window', () => {
  const target: TargetRow = { value: 1000 };
  const ref: ReferenceRow[] = [
    { value: 1005, timestamp: daysAgo(10) }, // within 10%, recent
    { value: 900, timestamp: daysAgo(100) }, // 10% — edge
    { value: 2000, timestamp: daysAgo(50) }, // outside tolerance
    { value: 1002, timestamp: daysAgo(500) }, // outside 12-month window
  ];
  const n = countSimilarCasesLast12Months(target, ref, {
    now: FIXED_NOW,
    windowDays: 365,
    tolerance: 0.1,
  });
  assert.equal(n, 2);
});

test('affectedCategories — collects flagged buckets only', () => {
  const cats = affectedCategories([
    {
      dimension: 'vendorId',
      bucket: 'A',
      sampleSize: 10,
      mean: 1,
      stdev: 1,
      median: 1,
      mad: 1,
      zScore: 5,
      modifiedZScore: 0,
      isOutlier: true,
    },
    {
      dimension: 'category',
      bucket: 'materials',
      sampleSize: 5,
      mean: 1,
      stdev: 1,
      median: 1,
      mad: 1,
      zScore: 0.5,
      modifiedZScore: 0,
      isOutlier: false,
    },
  ]);
  assert.deepEqual(cats, ['vendorId=A']);
});

// ----------------------------------------------------------------
// 2. OutlierExplainer — end-to-end
// ----------------------------------------------------------------

test('explain — clearly high value is flagged with narrative (he+en)', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 50000, // ~50x the mean — guaranteed outlier
    vendorId: 'A',
    category: 'materials',
    department: 'construction',
    projectId: 'P-1',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  assert.equal(out.isOutlier, true);
  assert.equal(out.direction, 'high');
  assert.ok(out.stdDeviationsFromMean > 2.5);
  assert.ok(out.narrative.he.length > 10);
  assert.ok(out.narrative.en.length > 10);
  // Hebrew narrative MUST include "חריג" (outlier) keyword.
  assert.ok(out.narrative.he.includes('חריג'));
  // English narrative MUST include "standard deviations".
  assert.ok(out.narrative.en.toLowerCase().includes('standard deviations'));
});

test('explain — in-range value is NOT flagged and still bilingual', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 1000, // exactly at vendor-A mean
    vendorId: 'A',
    category: 'materials',
    department: 'construction',
    projectId: 'P-1',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  assert.equal(out.isOutlier, false);
  assert.equal(out.reasonCode, 'within_expected_range');
  assert.equal(out.method, 'none');
  // Both languages still produced.
  assert.ok(out.narrative.he.length > 0);
  assert.ok(out.narrative.en.length > 0);
  // English narrative confirms within range.
  assert.ok(out.narrative.en.toLowerCase().includes('within'));
});

test('explain — insufficient sample returns inconclusive, bilingual', () => {
  const ex = makeExplainer();
  const tinyRef: ReferenceRow[] = [
    { value: 1, timestamp: daysAgo(10) },
    { value: 2, timestamp: daysAgo(20) },
  ];
  const row: TargetRow = { value: 9999 };
  const out = ex.explain(row, tinyRef);
  assert.equal(out.isOutlier, false);
  assert.equal(out.reasonCode, 'insufficient_sample');
  assert.equal(out.method, 'none');
  assert.ok(out.narrative.he.includes('לא ניתן'));
  assert.ok(out.narrative.en.toLowerCase().includes('cannot'));
});

test('explain — low-direction outlier detected', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: -5000, // far below the mean
    vendorId: 'A',
    category: 'materials',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  assert.equal(out.isOutlier, true);
  assert.equal(out.direction, 'low');
  assert.ok(out.stdDeviationsFromMean < -2.5);
  assert.ok(
    ['low_zscore', 'low_mad', 'below_lower_fence'].includes(out.reasonCode),
  );
});

test('explain — contributions are broken down by dimension', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 20000,
    vendorId: 'A',
    category: 'materials',
    department: 'construction',
    projectId: 'P-1',
    timestamp: daysAgo(2),
  };
  const out = ex.explain(row, ref);
  // All four default dims should produce a contribution.
  const dims = out.contributions.map((c) => c.dimension).sort();
  assert.deepEqual(dims.sort(), [
    'category',
    'department',
    'projectId',
    'vendorId',
  ]);
  // The top contributor (after sort) must have the largest |z|.
  for (let i = 1; i < out.contributions.length; i++) {
    assert.ok(
      Math.abs(out.contributions[i - 1].zScore) >=
        Math.abs(out.contributions[i].zScore),
    );
  }
});

test('explain — affectedCategories lists at least one flagged bucket', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 99999,
    vendorId: 'A',
    category: 'materials',
    department: 'construction',
    projectId: 'P-1',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  assert.ok(out.affectedCategories.length >= 1);
  // The narrative must surface the dimension=bucket format.
  assert.ok(out.affectedCategories.some((s) => s.includes('=')));
});

test('explain — similar cases count reflects reference rows in window', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  // Row value 1000 matches many vendor-A rows within 10%.
  const row: TargetRow = {
    value: 1000,
    vendorId: 'A',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  assert.ok(out.similarCasesLast12Months >= 10);
});

test('explain — narrative contains required keywords in both languages', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 100000,
    vendorId: 'B',
    category: 'services',
    timestamp: daysAgo(1),
  };
  const out = ex.explain(row, ref);
  // Hebrew must include "סטיות תקן" (standard deviations)
  assert.ok(out.narrative.he.includes('סטיות תקן'));
  // English must include "percentile"
  assert.ok(out.narrative.en.toLowerCase().includes('percentile'));
  // Both must include the actual NIS value (comma-formatted)
  assert.ok(out.narrative.he.includes('100,000'));
  assert.ok(out.narrative.en.includes('100,000'));
});

test('explain — custom options override defaults', () => {
  // Extremely permissive thresholds: nothing should trip, no matter
  // how extreme the value is (|z| would have to exceed 10_000).
  const permissive = new OutlierExplainer({
    zThreshold: 10_000,
    madThreshold: 10_000,
    iqrK: 10_000,
    now: () => FIXED_NOW,
  });
  const ref = buildReference();
  const row: TargetRow = {
    value: 50000,
    vendorId: 'A',
    timestamp: daysAgo(1),
  };
  const out = permissive.explain(row, ref);
  assert.equal(out.isOutlier, false);
  // Inversely, with ultra-strict thresholds a moderate value trips:
  const strict = new OutlierExplainer({
    zThreshold: 0.5,
    madThreshold: 0.5,
    iqrK: 0.01,
    now: () => FIXED_NOW,
  });
  const outStrict = strict.explain(
    { value: 1200, vendorId: 'A', timestamp: daysAgo(1) },
    ref,
  );
  assert.equal(outStrict.isOutlier, true);
});

test('explainValue — convenience scalar+series wrapper works', () => {
  const ex = makeExplainer();
  const series = [10, 11, 9, 10, 12, 11, 9, 10, 10, 11];
  const out = ex.explainValue(100, series);
  assert.equal(out.isOutlier, true);
  assert.equal(out.direction, 'high');
  // No dims => no contributions.
  assert.equal(out.contributions.length, 0);
  assert.ok(out.narrative.en.includes('100.00'));
});

test('narrate — returns the same narrative the explanation carries', () => {
  const ex = makeExplainer();
  const out = ex.explainValue(100, [10, 11, 9, 10, 12, 11, 9, 10, 10, 11]);
  const n = ex.narrate(out);
  assert.equal(n.he, out.narrative.he);
  assert.equal(n.en, out.narrative.en);
});

test('explain — flat distribution (stdev=0) does not crash and is not flagged', () => {
  const ex = makeExplainer();
  const ref: ReferenceRow[] = Array.from({ length: 10 }, () => ({
    value: 5,
    timestamp: daysAgo(10),
  }));
  const row: TargetRow = { value: 5, timestamp: daysAgo(1) };
  const out = ex.explain(row, ref);
  // stdev is 0; z returns 0; value is the same => not an outlier.
  assert.equal(out.isOutlier, false);
  assert.equal(out.stdDeviationsFromMean, 0);
  assert.equal(out.globalStats.stdev, 0);
});

test('defaultOutlierExplainer — singleton is usable out of the box', () => {
  const out = defaultOutlierExplainer.explainValue(
    1000,
    Array.from({ length: 30 }, (_, i) => 10 + i * 0.1),
  );
  assert.equal(out.isOutlier, true);
  assert.ok(out.narrative.he.length > 0);
  assert.ok(out.narrative.en.length > 0);
});

test('explain — deterministic: same input twice yields same narrative', () => {
  const ex = makeExplainer();
  const ref = buildReference();
  const row: TargetRow = {
    value: 25000,
    vendorId: 'A',
    category: 'materials',
    department: 'construction',
    projectId: 'P-1',
    timestamp: daysAgo(1),
  };
  const a = ex.explain(row, ref);
  const b = ex.explain(row, ref);
  assert.equal(a.narrative.he, b.narrative.he);
  assert.equal(a.narrative.en, b.narrative.en);
  assert.equal(a.similarCasesLast12Months, b.similarCasesLast12Months);
  assert.equal(a.reasonCode, b.reasonCode);
});
