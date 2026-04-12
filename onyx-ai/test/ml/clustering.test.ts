/**
 * ONYX AI — Clustering Engine Tests / בדיקות מנוע אשכולות
 * ------------------------------------------------------------
 * Agent Y-156 — Techno-Kol Uzi mega-ERP
 *
 * Run with:
 *   npx node --test --require ts-node/register test/ml/clustering.test.ts
 *
 * 25 deterministic tests covering:
 *   - distance functions (euclidean, manhattan, squared)
 *   - normalisation (z-score + min-max)
 *   - deterministic PRNG (Mulberry32)
 *   - k-means++ init
 *   - k-means core algorithm
 *   - elbow method
 *   - silhouette score
 *   - hierarchical (single / complete / average linkages)
 *   - DBSCAN (cluster + noise)
 *   - use-case wrappers (customer / supplier / defect)
 *   - edge cases (empty, singleton, degenerate, high-dim)
 *   - bilingual labels
 *   - determinism (same seed -> same output)
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  euclidean,
  manhattan,
  sqEuclidean,
  getDistance,
  zScoreNormalize,
  minMaxNormalize,
  normalize,
  mulberry32,
  kMeansPPInit,
  kMeans,
  elbow,
  silhouetteScore,
  hierarchical,
  dbscan,
  segmentCustomers,
  clusterSuppliers,
  groupDefects,
} from '../../src/ml/clustering';

// ============================================================
// Fixtures / נתוני בדיקה
// ============================================================

/** Three very clearly separated blobs in 2D. */
const BLOBS_3: number[][] = [
  // Blob A: around (0, 0)
  [0, 0], [0.1, -0.1], [-0.1, 0.1], [0.2, 0.2], [-0.2, -0.2],
  // Blob B: around (10, 10)
  [10, 10], [10.1, 9.9], [9.9, 10.1], [10.2, 10.2], [9.8, 9.8],
  // Blob C: around (0, 10)
  [0, 10], [0.1, 10.1], [-0.1, 9.9], [0.2, 10.2], [-0.2, 9.8],
];

/** Two 1D groups — useful for silhouette sanity checks. */
const TWO_GROUPS_1D: number[][] = [
  [1], [1.1], [0.9], [1.05],
  [10], [10.2], [9.8], [10.1],
];

// ============================================================
// 1-3. Distance functions
// ============================================================

test('1. euclidean distance basic + zero-case', () => {
  assert.equal(euclidean([0, 0], [3, 4]), 5);
  assert.equal(euclidean([1, 2, 3], [1, 2, 3]), 0);
  assert.throws(() => euclidean([1, 2], [1, 2, 3]));
});

test('2. manhattan distance basic + zero-case', () => {
  assert.equal(manhattan([0, 0], [3, 4]), 7);
  assert.equal(manhattan([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(manhattan([-1, -1], [1, 1]), 4);
});

test('3. sqEuclidean matches euclidean squared + getDistance dispatch', () => {
  const a = [1, 2, 3];
  const b = [4, 5, 6];
  const e = euclidean(a, b);
  assert.equal(Math.round(sqEuclidean(a, b) * 1e6) / 1e6, Math.round(e * e * 1e6) / 1e6);
  assert.equal(getDistance('manhattan'), manhattan);
  assert.equal(getDistance('euclidean'), euclidean);
});

// ============================================================
// 4-5. Normalisation
// ============================================================

test('4. zScoreNormalize produces mean=0 and stdev=1 per column', () => {
  const data = [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]];
  const norm = zScoreNormalize(data);
  const d = norm[0].length;
  const means = new Array(d).fill(0);
  for (const row of norm) for (let i = 0; i < d; i++) means[i] += row[i];
  for (let i = 0; i < d; i++) means[i] /= norm.length;
  for (let i = 0; i < d; i++) {
    assert.ok(Math.abs(means[i]) < 1e-9, `mean col ${i} should be 0`);
  }
  // stdev
  const stds = new Array(d).fill(0);
  for (const row of norm) for (let i = 0; i < d; i++) stds[i] += (row[i] - means[i]) ** 2;
  for (let i = 0; i < d; i++) {
    stds[i] = Math.sqrt(stds[i] / norm.length);
    assert.ok(Math.abs(stds[i] - 1) < 1e-9, `stdev col ${i} should be 1`);
  }
});

test('5. minMaxNormalize maps to [0, 1] and normalize() dispatches', () => {
  const data = [[0, 100], [50, 200], [100, 300]];
  const mm = minMaxNormalize(data);
  for (const row of mm) {
    for (const v of row) {
      assert.ok(v >= 0 && v <= 1, `value ${v} out of [0,1]`);
    }
  }
  assert.deepEqual(mm[0], [0, 0]);
  assert.deepEqual(mm[2], [1, 1]);
  // normalize() helper
  const zs = normalize(data, 'zscore');
  assert.equal(zs.length, 3);
  const mmAgain = normalize(data, 'minmax');
  assert.deepEqual(mmAgain, mm);
  // constant column is not NaN
  const constCol = zScoreNormalize([[1, 5], [1, 5], [1, 5]]);
  for (const row of constCol) {
    for (const v of row) assert.ok(Number.isFinite(v));
  }
});

// ============================================================
// 6. Deterministic PRNG
// ============================================================

test('6. mulberry32 is deterministic and in [0, 1)', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    const v = r1();
    assert.equal(v, r2());
    assert.ok(v >= 0 && v < 1);
  }
  // Different seed produces different sequence.
  const r3 = mulberry32(999);
  assert.notEqual(r1(), r3());
});

// ============================================================
// 7-8. K-means++ initialisation
// ============================================================

test('7. kMeansPPInit picks k distinct centroids deterministically', () => {
  const init1 = kMeansPPInit(BLOBS_3, 3, 42);
  const init2 = kMeansPPInit(BLOBS_3, 3, 42);
  assert.equal(init1.length, 3);
  assert.deepEqual(init1, init2); // determinism
  // Different seeds can still land on the same points in small sets —
  // assert only that all centroids are valid data points.
  for (const c of init1) {
    assert.equal(c.length, 2);
    const found = BLOBS_3.some((p) => p[0] === c[0] && p[1] === c[1]);
    assert.ok(found, `centroid ${c} must be a data point`);
  }
});

test('8. kMeansPPInit throws on too-few points', () => {
  assert.throws(() => kMeansPPInit([[0, 0]], 5, 42));
  assert.throws(() => kMeansPPInit([[0, 0]], 0, 42));
});

// ============================================================
// 9-11. K-means core
// ============================================================

test('9. kMeans separates 3 well-separated blobs perfectly', () => {
  const r = kMeans(BLOBS_3, { k: 3, seed: 42 });
  assert.equal(r.k, 3);
  assert.equal(r.labels.length, BLOBS_3.length);
  assert.ok(r.converged, 'should converge');
  // Each blob of 5 points should land in a single cluster.
  const blobA = new Set(r.labels.slice(0, 5));
  const blobB = new Set(r.labels.slice(5, 10));
  const blobC = new Set(r.labels.slice(10, 15));
  assert.equal(blobA.size, 1);
  assert.equal(blobB.size, 1);
  assert.equal(blobC.size, 1);
  // And all three labels differ.
  const uniq = new Set([...blobA, ...blobB, ...blobC]);
  assert.equal(uniq.size, 3);
  // Silhouette on perfectly separated blobs should be high.
  assert.ok(r.silhouette > 0.8, `silhouette too low: ${r.silhouette}`);
});

test('10. kMeans is deterministic for the same seed', () => {
  const r1 = kMeans(BLOBS_3, { k: 3, seed: 7 });
  const r2 = kMeans(BLOBS_3, { k: 3, seed: 7 });
  assert.deepEqual(r1.labels, r2.labels);
  assert.deepEqual(r1.centroids, r2.centroids);
  assert.equal(r1.inertia, r2.inertia);
});

test('11. kMeans supports manhattan distance and bilingual labels', () => {
  const r = kMeans(BLOBS_3, { k: 3, seed: 42, distance: 'manhattan' });
  assert.equal(r.k, 3);
  assert.ok(r.label.he.includes('3'));
  assert.ok(r.label.en.toLowerCase().includes('3'));
  assert.ok(r.label.he.includes('K-Means'));
  assert.ok(r.label.en.includes('K-Means'));
});

// ============================================================
// 12. Elbow method
// ============================================================

test('12. elbow method recommends K=3 on the 3-blob fixture', () => {
  const r = elbow(BLOBS_3, 6, { seed: 42 });
  assert.equal(r.kValues.length, 6);
  assert.equal(r.inertias.length, 6);
  // Inertia strictly non-increasing.
  for (let i = 1; i < r.inertias.length; i++) {
    assert.ok(
      r.inertias[i] <= r.inertias[i - 1] + 1e-9,
      `inertia should non-increase (${i}: ${r.inertias[i - 1]} -> ${r.inertias[i]})`
    );
  }
  assert.equal(r.recommendedK, 3, `expected K=3, got ${r.recommendedK}`);
  assert.ok(r.label.he.includes('3'));
});

// ============================================================
// 13. Silhouette score
// ============================================================

test('13. silhouetteScore behaves well on known configurations', () => {
  // Perfect separation on the 1D fixture.
  const labelsGood = [0, 0, 0, 0, 1, 1, 1, 1];
  const sGood = silhouetteScore(TWO_GROUPS_1D, labelsGood);
  assert.ok(sGood > 0.9, `good labelling silhouette too low: ${sGood}`);

  // Totally random labelling should be near zero or negative.
  const labelsBad = [0, 1, 0, 1, 0, 1, 0, 1];
  const sBad = silhouetteScore(TWO_GROUPS_1D, labelsBad);
  assert.ok(sBad < sGood, `bad labelling should score worse`);

  // Degenerate inputs.
  assert.equal(silhouetteScore([], []), 0);
  assert.equal(silhouetteScore([[1]], [0]), 0); // k<2
});

// ============================================================
// 14-16. Hierarchical — three linkages
// ============================================================

test('14. hierarchical single-linkage recovers the 3 blobs', () => {
  const r = hierarchical(BLOBS_3, 3, 'single');
  assert.equal(r.k, 3);
  assert.equal(r.linkage, 'single');
  assert.equal(r.labels.length, BLOBS_3.length);
  const blobA = new Set(r.labels.slice(0, 5));
  const blobB = new Set(r.labels.slice(5, 10));
  const blobC = new Set(r.labels.slice(10, 15));
  assert.equal(blobA.size, 1);
  assert.equal(blobB.size, 1);
  assert.equal(blobC.size, 1);
  assert.ok(r.silhouette > 0.8);
  // Merge history should have n - k merges.
  assert.equal(r.merges.length, BLOBS_3.length - 3);
});

test('15. hierarchical complete-linkage also recovers the 3 blobs', () => {
  const r = hierarchical(BLOBS_3, 3, 'complete');
  assert.equal(r.linkage, 'complete');
  const blobA = new Set(r.labels.slice(0, 5));
  const blobB = new Set(r.labels.slice(5, 10));
  const blobC = new Set(r.labels.slice(10, 15));
  assert.equal(blobA.size, 1);
  assert.equal(blobB.size, 1);
  assert.equal(blobC.size, 1);
});

test('16. hierarchical average-linkage + manhattan distance', () => {
  const r = hierarchical(BLOBS_3, 3, 'average', 'manhattan');
  assert.equal(r.linkage, 'average');
  const labelsPerBlob = [
    new Set(r.labels.slice(0, 5)),
    new Set(r.labels.slice(5, 10)),
    new Set(r.labels.slice(10, 15)),
  ];
  for (const s of labelsPerBlob) assert.equal(s.size, 1);
  // All three distinct.
  assert.equal(
    new Set([...labelsPerBlob[0], ...labelsPerBlob[1], ...labelsPerBlob[2]]).size,
    3
  );
  assert.ok(r.label.he.includes('average'));
});

// ============================================================
// 17-19. DBSCAN
// ============================================================

test('17. dbscan finds the 3 blobs with no noise', () => {
  const r = dbscan(BLOBS_3, { eps: 1.0, minPts: 2 });
  assert.equal(r.clusterCount, 3, `expected 3 clusters, got ${r.clusterCount}`);
  assert.equal(r.noiseCount, 0);
  const blobA = new Set(r.labels.slice(0, 5));
  const blobB = new Set(r.labels.slice(5, 10));
  const blobC = new Set(r.labels.slice(10, 15));
  assert.equal(blobA.size, 1);
  assert.equal(blobB.size, 1);
  assert.equal(blobC.size, 1);
});

test('18. dbscan labels far-away points as noise (-1)', () => {
  const data = [
    ...BLOBS_3,
    [100, 100], // obvious outlier
    [-50, -50], // another outlier
  ];
  const r = dbscan(data, { eps: 1.0, minPts: 2 });
  assert.equal(r.labels[data.length - 1], -1);
  assert.equal(r.labels[data.length - 2], -1);
  assert.equal(r.noiseCount, 2);
  assert.ok(r.label.he.includes('רעש'));
  assert.ok(r.label.en.toLowerCase().includes('noise'));
});

test('19. dbscan with tiny eps marks everything as noise', () => {
  const r = dbscan(BLOBS_3, { eps: 0.0001, minPts: 5 });
  assert.equal(r.clusterCount, 0);
  assert.equal(r.noiseCount, BLOBS_3.length);
  for (const l of r.labels) assert.equal(l, -1);
});

// ============================================================
// 20-22. Use-case wrappers
// ============================================================

test('20. segmentCustomers returns bilingual segment names', () => {
  const features = [
    [100, 1], [110, 2], [105, 1],  // low spenders
    [5000, 50], [5200, 48], [4900, 52], // high spenders
  ];
  const r = segmentCustomers(features, 2, { seed: 42, normalize: 'zscore' });
  assert.equal(r.segments.length, 2);
  assert.ok(r.segments[0].he.includes('סגמנט'));
  assert.ok(r.segments[0].en.includes('segment'));
  // Low and high groups should land in different clusters.
  const low = new Set(r.labels.slice(0, 3));
  const high = new Set(r.labels.slice(3, 6));
  assert.equal(low.size, 1);
  assert.equal(high.size, 1);
  assert.notEqual([...low][0], [...high][0]);
});

test('21. clusterSuppliers (hierarchical) groups similar vendors', () => {
  const features = [
    // Group A — low price, high quality
    [100, 9.5], [105, 9.4], [102, 9.6],
    // Group B — high price, low quality
    [500, 4.5], [510, 4.6], [505, 4.4],
  ];
  const r = clusterSuppliers(features, 2, { linkage: 'average' });
  assert.equal(r.groups.length, 2);
  const a = new Set(r.labels.slice(0, 3));
  const b = new Set(r.labels.slice(3, 6));
  assert.equal(a.size, 1);
  assert.equal(b.size, 1);
  assert.notEqual([...a][0], [...b][0]);
  assert.ok(r.groups[0].he.includes('ספקים'));
  assert.ok(r.groups[0].en.toLowerCase().includes('supplier'));
});

test('22. groupDefects (DBSCAN) discovers defect patterns + noise', () => {
  const features = [
    // Pattern A: small leaks
    [0.1, 0.1], [0.12, 0.11], [0.09, 0.13],
    // Pattern B: electrical
    [5, 5], [5.1, 5.0], [4.9, 5.1],
    // One-off weird defect
    [50, 50],
  ];
  const r = groupDefects(features, { eps: 0.5, minPts: 2 });
  assert.equal(r.clusterCount, 2);
  assert.equal(r.noiseCount, 1);
  assert.equal(r.patterns.length, 2);
  assert.ok(r.patterns[0].he.includes('תקלות'));
  assert.ok(r.patterns[0].en.toLowerCase().includes('defect'));
});

// ============================================================
// 23-25. Edge cases + determinism
// ============================================================

test('23. kMeans throws on empty or under-sized data', () => {
  assert.throws(() => kMeans([], { k: 2 }));
  assert.throws(() => kMeans([[1, 2]], { k: 3 }));
  assert.throws(() => kMeans([[1, 2], [3, 4]], { k: 0 }));
});

test('24. hierarchical handles k == n (every point its own cluster)', () => {
  const r = hierarchical(BLOBS_3, BLOBS_3.length, 'single');
  assert.equal(r.merges.length, 0);
  const uniq = new Set(r.labels);
  assert.equal(uniq.size, BLOBS_3.length);
  // k == 1 collapses everything into one cluster.
  const r1 = hierarchical(BLOBS_3, 1, 'single');
  const uniq1 = new Set(r1.labels);
  assert.equal(uniq1.size, 1);
});

test('25. high-dimensional data — 6D with 3 blobs, deterministic result', () => {
  const hi: number[][] = [];
  // Blob near origin
  for (let i = 0; i < 5; i++) hi.push([0, 0, 0, 0, 0, 0].map((v) => v + i * 0.01));
  // Blob near (1,1,1,1,1,1) * 10
  for (let i = 0; i < 5; i++) hi.push([10, 10, 10, 10, 10, 10].map((v) => v + i * 0.01));
  // Blob near (1,0,1,0,1,0) * 20
  for (let i = 0; i < 5; i++) hi.push([20, 0, 20, 0, 20, 0].map((v) => v + i * 0.01));

  const r1 = kMeans(hi, { k: 3, seed: 123 });
  const r2 = kMeans(hi, { k: 3, seed: 123 });
  assert.deepEqual(r1.labels, r2.labels);
  // Each blob stays together.
  assert.equal(new Set(r1.labels.slice(0, 5)).size, 1);
  assert.equal(new Set(r1.labels.slice(5, 10)).size, 1);
  assert.equal(new Set(r1.labels.slice(10, 15)).size, 1);
  assert.equal(new Set(r1.labels).size, 3);
});
