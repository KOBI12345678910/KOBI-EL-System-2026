/**
 * ONYX AI — Clustering Engine / מנוע אשכולות
 * ------------------------------------------------------------
 * Agent Y-156 — Techno-Kol Uzi mega-ERP
 *
 * Pure-TypeScript, zero-dependency clustering toolkit covering:
 *
 *   1. K-means (deterministic k-means++ seeding)
 *   2. Hierarchical agglomerative clustering
 *        - single  linkage (nearest neighbour)
 *        - complete linkage (farthest neighbour)
 *        - average linkage (UPGMA)
 *   3. DBSCAN (density-based)
 *
 * Utilities:
 *   - Euclidean + Manhattan distance
 *   - Z-score + Min-Max normalisation
 *   - Silhouette score (cluster quality)
 *   - Elbow method (K selection for K-means)
 *   - Deterministic PRNG (Mulberry32) — no Math.random()
 *
 * Use cases covered:
 *   - Customer segmentation / סגמנטציית לקוחות
 *   - Supplier clustering / אשכול ספקים
 *   - Defect pattern grouping / קיבוץ תקלות
 *
 * Constraints observed:
 *   - Zero external deps (Node built-ins only, and this file uses none).
 *   - Deterministic: no Math.random, no Date.now, no process.env.
 *   - Bilingual: every public result carries Hebrew + English labels.
 *   - Never mutates the input arrays.
 */

// ======================================================================
// Types / טיפוסים
// ======================================================================

/** A single point in d-dimensional space. */
export type Vector = readonly number[];

/** Distance function signature. */
export type DistanceFn = (a: Vector, b: Vector) => number;

/** Supported distance metric names. */
export type DistanceName = 'euclidean' | 'manhattan';

/** Linkage criteria for hierarchical clustering. */
export type Linkage = 'single' | 'complete' | 'average';

/** Normalisation strategy for the helper. */
export type NormalizeMethod = 'zscore' | 'minmax';

/** Bilingual label pair. */
export interface BilingualLabel {
  he: string;
  en: string;
}

/** Result of a K-means run. */
export interface KMeansResult {
  k: number;
  labels: number[];            // length = n, cluster index per point
  centroids: number[][];       // length = k
  iterations: number;
  inertia: number;             // sum of squared distances to centroids (WCSS)
  converged: boolean;
  silhouette: number;          // -1..1 (0 for k < 2)
  label: BilingualLabel;
}

/** Result of a hierarchical clustering run cut at K clusters. */
export interface HierarchicalResult {
  k: number;
  linkage: Linkage;
  labels: number[];
  merges: Array<{ a: number; b: number; distance: number; size: number }>;
  silhouette: number;
  label: BilingualLabel;
}

/** Result of DBSCAN. */
export interface DBSCANResult {
  labels: number[];            // -1 = noise
  clusterCount: number;
  noiseCount: number;
  eps: number;
  minPts: number;
  silhouette: number;
  label: BilingualLabel;
}

/** Result of the elbow analysis. */
export interface ElbowResult {
  kValues: number[];
  inertias: number[];
  recommendedK: number;        // K at the maximum curvature point
  label: BilingualLabel;
}

// ======================================================================
// Deterministic PRNG — Mulberry32 / מחולל פסבדו-אקראי דטרמיניסטי
// ======================================================================

/**
 * Mulberry32: 32-bit state, tiny, deterministic, perfectly adequate
 * for tie-breaking in k-means++. Returns a function that yields
 * values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ======================================================================
// Distances / מרחקים
// ======================================================================

/** Euclidean (L2) distance. Throws on length mismatch. */
export function euclidean(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(
      `euclidean: dimension mismatch (${a.length} vs ${b.length})`
    );
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Manhattan (L1) distance. */
export function manhattan(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(
      `manhattan: dimension mismatch (${a.length} vs ${b.length})`
    );
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += Math.abs(a[i] - b[i]);
  }
  return s;
}

/** Squared Euclidean — cheaper when you only need to compare. */
export function sqEuclidean(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(
      `sqEuclidean: dimension mismatch (${a.length} vs ${b.length})`
    );
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/** Pick the distance function by name. */
export function getDistance(name: DistanceName): DistanceFn {
  if (name === 'manhattan') return manhattan;
  return euclidean;
}

// ======================================================================
// Normalisation / נרמול
// ======================================================================

/** Column-wise Z-score normalisation: (x - mean) / stdev. */
export function zScoreNormalize(data: Vector[]): number[][] {
  if (data.length === 0) return [];
  const d = data[0].length;
  const means = new Array<number>(d).fill(0);
  const stds = new Array<number>(d).fill(0);

  for (const row of data) {
    for (let i = 0; i < d; i++) means[i] += row[i];
  }
  for (let i = 0; i < d; i++) means[i] /= data.length;

  for (const row of data) {
    for (let i = 0; i < d; i++) {
      const dif = row[i] - means[i];
      stds[i] += dif * dif;
    }
  }
  for (let i = 0; i < d; i++) {
    stds[i] = Math.sqrt(stds[i] / data.length);
    if (stds[i] === 0) stds[i] = 1; // avoid divide-by-zero for constant cols
  }

  return data.map((row) => row.map((v, i) => (v - means[i]) / stds[i]));
}

/** Column-wise Min-Max normalisation: (x - min) / (max - min). */
export function minMaxNormalize(data: Vector[]): number[][] {
  if (data.length === 0) return [];
  const d = data[0].length;
  const mins = new Array<number>(d).fill(Infinity);
  const maxs = new Array<number>(d).fill(-Infinity);

  for (const row of data) {
    for (let i = 0; i < d; i++) {
      if (row[i] < mins[i]) mins[i] = row[i];
      if (row[i] > maxs[i]) maxs[i] = row[i];
    }
  }

  const ranges = mins.map((mn, i) => {
    const r = maxs[i] - mn;
    return r === 0 ? 1 : r;
  });

  return data.map((row) => row.map((v, i) => (v - mins[i]) / ranges[i]));
}

/** Unified normalise helper — picks the requested method. */
export function normalize(
  data: Vector[],
  method: NormalizeMethod = 'zscore'
): number[][] {
  if (method === 'minmax') return minMaxNormalize(data);
  return zScoreNormalize(data);
}

// ======================================================================
// K-means / אמצע-K
// ======================================================================

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  tolerance?: number;
  seed?: number;              // deterministic seed for k-means++
  distance?: DistanceName;
}

/**
 * Deterministic k-means++ initialisation.
 *
 * Algorithm (Arthur & Vassilvitskii 2007):
 *   1. Choose the first centroid index deterministically from the seed.
 *   2. For each subsequent centroid, pick a point with probability
 *      proportional to D(x)^2, where D(x) is the distance to the nearest
 *      already-chosen centroid.
 *
 * Using Mulberry32 seeded with `opts.seed ?? 42` guarantees repeatable
 * runs — critical for accounting / auditing contexts.
 */
export function kMeansPPInit(
  data: Vector[],
  k: number,
  seed: number = 42
): number[][] {
  if (k <= 0) throw new Error('kMeansPPInit: k must be >= 1');
  if (data.length < k) {
    throw new Error(
      `kMeansPPInit: need at least k=${k} points, got ${data.length}`
    );
  }

  const rand = mulberry32(seed);
  const centroids: number[][] = [];

  // Step 1: deterministic first pick.
  const first = Math.floor(rand() * data.length);
  centroids.push([...data[first]]);

  const distSq = new Array<number>(data.length).fill(Infinity);

  for (let c = 1; c < k; c++) {
    // Update nearest-centroid squared distance for each point.
    const newCentroid = centroids[c - 1];
    let total = 0;
    for (let i = 0; i < data.length; i++) {
      const d = sqEuclidean(data[i], newCentroid);
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i];
    }

    if (total === 0) {
      // All points collapse onto existing centroids — duplicate the last.
      centroids.push([...centroids[c - 1]]);
      continue;
    }

    // Weighted random pick.
    const target = rand() * total;
    let running = 0;
    let chosen = data.length - 1;
    for (let i = 0; i < data.length; i++) {
      running += distSq[i];
      if (running >= target) {
        chosen = i;
        break;
      }
    }
    centroids.push([...data[chosen]]);
  }

  return centroids;
}

/** Run K-means with k-means++ seeding and convergence tracking. */
export function kMeans(data: Vector[], opts: KMeansOptions): KMeansResult {
  const k = opts.k;
  if (k <= 0) throw new Error('kMeans: k must be >= 1');
  if (data.length === 0) throw new Error('kMeans: empty dataset');
  if (data.length < k) {
    throw new Error(`kMeans: need at least k=${k} points, got ${data.length}`);
  }

  const maxIter = opts.maxIterations ?? 300;
  const tol = opts.tolerance ?? 1e-6;
  const seed = opts.seed ?? 42;
  const dist = getDistance(opts.distance ?? 'euclidean');
  const dims = data[0].length;

  let centroids = kMeansPPInit(data, k, seed);
  const labels = new Array<number>(data.length).fill(0);

  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // Assignment step.
    let assignmentChanged = false;
    for (let i = 0; i < data.length; i++) {
      let best = 0;
      let bestDist = dist(data[i], centroids[0]);
      for (let c = 1; c < k; c++) {
        const d = dist(data[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        assignmentChanged = true;
        labels[i] = best;
      }
    }

    // Update step.
    const newCentroids: number[][] = [];
    const counts = new Array<number>(k).fill(0);
    for (let c = 0; c < k; c++) {
      newCentroids.push(new Array<number>(dims).fill(0));
    }
    for (let i = 0; i < data.length; i++) {
      const c = labels[i];
      counts[c]++;
      for (let j = 0; j < dims; j++) {
        newCentroids[c][j] += data[i][j];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < dims; j++) newCentroids[c][j] /= counts[c];
      } else {
        // Empty cluster — reseed from the point furthest from its centroid.
        let furthest = 0;
        let furthestDist = -Infinity;
        for (let i = 0; i < data.length; i++) {
          const d = dist(data[i], centroids[labels[i]]);
          if (d > furthestDist) {
            furthestDist = d;
            furthest = i;
          }
        }
        newCentroids[c] = [...data[furthest]];
      }
    }

    // Convergence check — max centroid shift under tolerance.
    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      const shift = dist(centroids[c], newCentroids[c]);
      if (shift > maxShift) maxShift = shift;
    }

    centroids = newCentroids;

    if (!assignmentChanged || maxShift < tol) {
      converged = true;
      break;
    }
  }

  // Inertia: sum of squared distances to assigned centroids.
  let inertia = 0;
  for (let i = 0; i < data.length; i++) {
    inertia += sqEuclidean(data[i], centroids[labels[i]]);
  }

  const sil = silhouetteScore(data, labels, dist);

  return {
    k,
    labels,
    centroids,
    iterations,
    inertia,
    converged,
    silhouette: sil,
    label: {
      he: `K-Means עם ${k} אשכולות`,
      en: `K-Means with ${k} clusters`,
    },
  };
}

// ======================================================================
// Elbow method / שיטת המרפק
// ======================================================================

/**
 * Elbow method: run K-means for k=1..kMax and return the inertias.
 * Recommended K is the point of maximum curvature — we use the
 * "distance from the line" heuristic between (1, inertia[1]) and
 * (kMax, inertia[kMax]).
 */
export function elbow(
  data: Vector[],
  kMax: number,
  opts: { seed?: number; distance?: DistanceName } = {}
): ElbowResult {
  if (kMax < 2) throw new Error('elbow: kMax must be >= 2');
  const safeMax = Math.min(kMax, data.length);

  const kValues: number[] = [];
  const inertias: number[] = [];
  for (let k = 1; k <= safeMax; k++) {
    const r = kMeans(data, {
      k,
      seed: opts.seed ?? 42,
      distance: opts.distance ?? 'euclidean',
    });
    kValues.push(k);
    inertias.push(r.inertia);
  }

  // Distance-from-line for each point.
  const n = kValues.length;
  let recommendedK = kValues[0];
  if (n >= 2) {
    const x1 = kValues[0];
    const y1 = inertias[0];
    const x2 = kValues[n - 1];
    const y2 = inertias[n - 1];
    const denom = Math.hypot(x2 - x1, y2 - y1) || 1;
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const x0 = kValues[i];
      const y0 = inertias[i];
      // Perpendicular distance from (x0, y0) to the line (x1,y1)-(x2,y2).
      const num = Math.abs(
        (y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1
      );
      const d = num / denom;
      if (d > best) {
        best = d;
        recommendedK = kValues[i];
      }
    }
  }

  return {
    kValues,
    inertias,
    recommendedK,
    label: {
      he: `שיטת המרפק: K מומלץ = ${recommendedK}`,
      en: `Elbow method: recommended K = ${recommendedK}`,
    },
  };
}

// ======================================================================
// Silhouette score / מדד צל
// ======================================================================

/**
 * Silhouette score for a clustering assignment.
 * Range: [-1, 1]. Higher is better. Returns 0 if k < 2 or k == n.
 */
export function silhouetteScore(
  data: Vector[],
  labels: number[],
  dist: DistanceFn = euclidean
): number {
  const n = data.length;
  if (n === 0 || labels.length !== n) return 0;

  // Unique labels (ignoring -1 noise from DBSCAN).
  const uniq = new Set<number>();
  for (const l of labels) if (l >= 0) uniq.add(l);
  const k = uniq.size;
  if (k < 2 || k >= n) return 0;

  // Group indices by cluster.
  const byCluster = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (labels[i] < 0) continue;
    const arr = byCluster.get(labels[i]) ?? [];
    arr.push(i);
    byCluster.set(labels[i], arr);
  }

  let total = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const ci = labels[i];
    if (ci < 0) continue;
    const own = byCluster.get(ci)!;
    if (own.length <= 1) {
      // Singleton clusters contribute 0 by convention.
      count++;
      continue;
    }
    // a(i) — mean intra-cluster distance.
    let aSum = 0;
    for (const j of own) if (j !== i) aSum += dist(data[i], data[j]);
    const a = aSum / (own.length - 1);

    // b(i) — minimum mean distance to any other cluster.
    let b = Infinity;
    for (const [cj, members] of byCluster) {
      if (cj === ci) continue;
      let s = 0;
      for (const j of members) s += dist(data[i], data[j]);
      const mean = s / members.length;
      if (mean < b) b = mean;
    }

    const denom = Math.max(a, b);
    const s = denom === 0 ? 0 : (b - a) / denom;
    total += s;
    count++;
  }

  return count > 0 ? total / count : 0;
}

// ======================================================================
// Hierarchical clustering / אשכול היררכי
// ======================================================================

/**
 * Agglomerative hierarchical clustering with configurable linkage.
 * O(n^2) memory for the distance matrix, O(n^3) worst-case runtime.
 *
 * Returns labels cut at k clusters plus the merge history.
 */
export function hierarchical(
  data: Vector[],
  k: number,
  linkage: Linkage = 'single',
  distance: DistanceName = 'euclidean'
): HierarchicalResult {
  const n = data.length;
  if (n === 0) throw new Error('hierarchical: empty dataset');
  if (k <= 0 || k > n) {
    throw new Error(`hierarchical: k must be in 1..${n}, got ${k}`);
  }

  const dist = getDistance(distance);

  // Pairwise distance matrix.
  const dm: number[][] = [];
  for (let i = 0; i < n; i++) {
    dm.push(new Array<number>(n).fill(0));
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(data[i], data[j]);
      dm[i][j] = d;
      dm[j][i] = d;
    }
  }

  // Each index i maps to a cluster id. Cluster "active" flag via map.
  const active = new Set<number>();
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    active.add(i);
    clusters.set(i, [i]);
  }
  let nextId = n;

  const merges: Array<{
    a: number;
    b: number;
    distance: number;
    size: number;
  }> = [];

  // Linkage function: distance between two clusters given their members.
  const clusterDist = (aMembers: number[], bMembers: number[]): number => {
    if (linkage === 'single') {
      let best = Infinity;
      for (const ai of aMembers) {
        for (const bi of bMembers) {
          if (dm[ai][bi] < best) best = dm[ai][bi];
        }
      }
      return best;
    }
    if (linkage === 'complete') {
      let worst = -Infinity;
      for (const ai of aMembers) {
        for (const bi of bMembers) {
          if (dm[ai][bi] > worst) worst = dm[ai][bi];
        }
      }
      return worst;
    }
    // average (UPGMA)
    let s = 0;
    for (const ai of aMembers) {
      for (const bi of bMembers) s += dm[ai][bi];
    }
    return s / (aMembers.length * bMembers.length);
  };

  while (active.size > k) {
    // Find the closest pair of active clusters.
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    const ids = [...active];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const d = clusterDist(clusters.get(ids[i])!, clusters.get(ids[j])!);
        if (d < bestD) {
          bestD = d;
          bestA = ids[i];
          bestB = ids[j];
        }
      }
    }
    if (bestA === -1) break;

    // Merge bestA + bestB into a new cluster id.
    const merged = [
      ...clusters.get(bestA)!,
      ...clusters.get(bestB)!,
    ];
    const newId = nextId++;
    clusters.set(newId, merged);
    active.delete(bestA);
    active.delete(bestB);
    active.add(newId);
    merges.push({
      a: bestA,
      b: bestB,
      distance: bestD,
      size: merged.length,
    });
  }

  // Assign final labels by ordering the remaining active clusters.
  const labels = new Array<number>(n).fill(-1);
  const finalIds = [...active].sort((x, y) => x - y);
  for (let c = 0; c < finalIds.length; c++) {
    for (const idx of clusters.get(finalIds[c])!) labels[idx] = c;
  }

  const sil = silhouetteScore(data, labels, dist);

  return {
    k,
    linkage,
    labels,
    merges,
    silhouette: sil,
    label: {
      he: `אשכול היררכי (${linkage}) עם ${k} אשכולות`,
      en: `Hierarchical clustering (${linkage}) with ${k} clusters`,
    },
  };
}

// ======================================================================
// DBSCAN / DBSCAN
// ======================================================================

export interface DBSCANOptions {
  eps: number;
  minPts: number;
  distance?: DistanceName;
}

/**
 * Density-Based Spatial Clustering of Applications with Noise.
 *
 * Classic Ester et al. 1996 formulation. Points labelled -1 are noise.
 * Time complexity O(n^2) — no spatial index, keeps the zero-dep promise.
 */
export function dbscan(data: Vector[], opts: DBSCANOptions): DBSCANResult {
  const { eps, minPts } = opts;
  if (eps <= 0) throw new Error('dbscan: eps must be > 0');
  if (minPts < 1) throw new Error('dbscan: minPts must be >= 1');

  const dist = getDistance(opts.distance ?? 'euclidean');
  const n = data.length;
  const labels = new Array<number>(n).fill(-2); // -2 = unvisited, -1 = noise
  let clusterId = 0;

  const regionQuery = (i: number): number[] => {
    const neighbours: number[] = [];
    for (let j = 0; j < n; j++) {
      if (dist(data[i], data[j]) <= eps) neighbours.push(j);
    }
    return neighbours;
  };

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue;
    const neighbours = regionQuery(i);
    if (neighbours.length < minPts) {
      labels[i] = -1;
      continue;
    }
    labels[i] = clusterId;

    // Expand — seed queue without mutating the regionQuery result.
    const seeds: number[] = [];
    for (const q of neighbours) if (q !== i) seeds.push(q);

    while (seeds.length > 0) {
      const q = seeds.shift()!;
      if (labels[q] === -1) {
        labels[q] = clusterId; // border point
      }
      if (labels[q] !== -2) continue;
      labels[q] = clusterId;
      const qNeighbours = regionQuery(q);
      if (qNeighbours.length >= minPts) {
        for (const r of qNeighbours) {
          if (labels[r] === -2 || labels[r] === -1) seeds.push(r);
        }
      }
    }
    clusterId++;
  }

  let noiseCount = 0;
  for (const l of labels) if (l === -1) noiseCount++;

  const sil = silhouetteScore(data, labels, dist);

  return {
    labels,
    clusterCount: clusterId,
    noiseCount,
    eps,
    minPts,
    silhouette: sil,
    label: {
      he: `DBSCAN: ${clusterId} אשכולות, ${noiseCount} נקודות רעש`,
      en: `DBSCAN: ${clusterId} clusters, ${noiseCount} noise points`,
    },
  };
}

// ======================================================================
// Use-case wrappers / עטיפות שימוש
// ======================================================================

/**
 * Customer segmentation — wraps K-means with sensible defaults and
 * returns bilingual segment names.
 */
export function segmentCustomers(
  features: Vector[],
  k: number,
  opts: { seed?: number; distance?: DistanceName; normalize?: NormalizeMethod } = {}
): KMeansResult & { segments: BilingualLabel[] } {
  const prep =
    opts.normalize === undefined ? features : normalize(features, opts.normalize);
  const r = kMeans(prep, {
    k,
    seed: opts.seed ?? 42,
    distance: opts.distance ?? 'euclidean',
  });
  const segments: BilingualLabel[] = [];
  for (let i = 0; i < k; i++) {
    segments.push({
      he: `סגמנט לקוחות ${i + 1}`,
      en: `Customer segment ${i + 1}`,
    });
  }
  return { ...r, segments };
}

/**
 * Supplier clustering — groups suppliers by their performance vectors.
 */
export function clusterSuppliers(
  features: Vector[],
  k: number,
  opts: { linkage?: Linkage; distance?: DistanceName } = {}
): HierarchicalResult & { groups: BilingualLabel[] } {
  const r = hierarchical(
    features,
    k,
    opts.linkage ?? 'average',
    opts.distance ?? 'euclidean'
  );
  const groups: BilingualLabel[] = [];
  for (let i = 0; i < k; i++) {
    groups.push({
      he: `קבוצת ספקים ${i + 1}`,
      en: `Supplier group ${i + 1}`,
    });
  }
  return { ...r, groups };
}

/**
 * Defect pattern grouping — DBSCAN finds dense clusters of similar
 * defects without requiring the number of clusters up-front.
 */
export function groupDefects(
  features: Vector[],
  opts: DBSCANOptions
): DBSCANResult & { patterns: BilingualLabel[] } {
  const r = dbscan(features, opts);
  const patterns: BilingualLabel[] = [];
  for (let i = 0; i < r.clusterCount; i++) {
    patterns.push({
      he: `תבנית תקלות ${i + 1}`,
      en: `Defect pattern ${i + 1}`,
    });
  }
  return { ...r, patterns };
}

// ======================================================================
// Default export — grouped API / ייצוא מקובץ
// ======================================================================

export default {
  // distances
  euclidean,
  manhattan,
  sqEuclidean,
  getDistance,
  // normalisation
  zScoreNormalize,
  minMaxNormalize,
  normalize,
  // kmeans
  kMeans,
  kMeansPPInit,
  elbow,
  // hierarchical
  hierarchical,
  // dbscan
  dbscan,
  // quality
  silhouetteScore,
  // wrappers
  segmentCustomers,
  clusterSuppliers,
  groupDefects,
  // prng
  mulberry32,
};
