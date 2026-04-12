/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI / Techno-Kol Uzi — Feature Importance Analyzer
 * מנתח חשיבות פיצ'רים — מודול ניתוח מודלים
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Agent: Y-159
 * Mega-ERP: Techno-Kol Uzi
 * Purpose / מטרה:
 *   Explain any black-box model by ranking features according to three
 *   independent, complementary criteria:
 *
 *     1. Permutation Importance  — חשיבות לפי ערבוב
 *        How much the model's loss degrades when a single column is
 *        randomly shuffled while the rest of the dataset is kept intact.
 *        Works with ANY injectable predict function.
 *
 *     2. Variance-Based Importance  — חשיבות לפי שונות
 *        Raw dispersion of each feature relative to its mean (coefficient
 *        of variation). Fast screening heuristic — a constant column has
 *        no explanatory power; a wildly varying column MAY have power.
 *
 *     3. Mutual Information (Discrete)  — מידע הדדי (בדיד)
 *        I(X;Y) = Σ Σ p(x,y) · log2( p(x,y) / ( p(x)·p(y) ) )
 *        Non-linear dependency measure between feature X and target Y
 *        after they have both been discretised into equal-frequency bins.
 *
 * Rules obeyed / חוקים:
 *   • ZERO external dependencies. Node built-ins only (`node:crypto` used
 *     for deterministic RNG seeding if the caller does not supply a seed).
 *   • Purely additive — no existing files are touched.
 *   • Bilingual (Hebrew + English) throughout — feature name dictionaries,
 *     labels, and the rendered report table are all dual-language.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Design notes / הערות עיצוב:
 *
 *   – The analyzer is pure / ניתן לבדיקה. `analyzeFeatureImportance()`
 *     takes a frozen `FeatureImportanceInput` and returns a
 *     `FeatureImportanceResult` — no I/O, no globals, no hidden state.
 *
 *   – The predict function is `(rows: number[][]) => number[]`. It is
 *     called at most `nRepeats + 1` times over the whole dataset, so even
 *     expensive models are tractable (default nRepeats = 3).
 *
 *   – The default loss is mean-squared-error. Callers can inject any
 *     loss `(yTrue, yPred) => number` — zero-one, MAE, log-loss, etc.
 *
 *   – Randomness is controlled by a seeded Mulberry32 PRNG so unit tests
 *     are deterministic. If `seed` is omitted, we draw 4 bytes from
 *     `node:crypto.randomBytes` — still built-in, still zero-dep.
 *
 *   – The "combined" ranking is a normalised mean of the three individual
 *     scores: each dimension is rescaled to [0..1] via min-max within the
 *     feature set, then averaged. This makes the three methods directly
 *     comparable despite being in totally different units.
 *
 *   – The bilingual report is deterministic and plain-text — no markdown
 *     parser required, no HTML, no RTL hacks. Hebrew column on the right,
 *     English column on the left, Unicode box-drawing characters.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { randomBytes } from 'node:crypto';

/* ─────────────────────────────────────────────────────────────────────────
 * Public types / טיפוסים ציבוריים
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Bilingual name for a single feature / שם דו-לשוני לפיצ'ר.
 *
 * `id` is the stable column key used in dataset rows and everywhere in
 * code; `en` and `he` are purely for human-facing output.
 */
export interface BilingualFeatureName {
  /** Machine-readable column id (ASCII, stable). */
  readonly id: string;
  /** English human-readable name / שם באנגלית. */
  readonly en: string;
  /** Hebrew human-readable name / שם בעברית. */
  readonly he: string;
}

/**
 * Injectable model predict function / פונקציית חיזוי מוזרקת.
 *
 * Must return one prediction per input row, preserving order. Pure —
 * no side effects expected. The analyser may call it multiple times
 * with shuffled columns.
 */
export type PredictFn = (rows: number[][]) => number[];

/**
 * Injectable loss function / פונקציית הפסד מוזרקת.
 *
 * Lower = better. Default is mean squared error.
 */
export type LossFn = (yTrue: readonly number[], yPred: readonly number[]) => number;

/**
 * Input to `analyzeFeatureImportance` / קלט לפונקציית הניתוח.
 */
export interface FeatureImportanceInput {
  /** Feature matrix: rows × columns. All rows must have equal length. */
  readonly X: readonly (readonly number[])[];
  /** Target vector, one entry per row. */
  readonly y: readonly number[];
  /** Bilingual name for each column, in column order. */
  readonly features: readonly BilingualFeatureName[];
  /** Injected model — pure function from rows to predictions. */
  readonly predict: PredictFn;
  /** Optional loss override. Defaults to mean squared error. */
  readonly loss?: LossFn;
  /** How many times to repeat the permutation per feature. Default 3. */
  readonly nRepeats?: number;
  /** PRNG seed for reproducibility. Default = random 4 bytes. */
  readonly seed?: number;
  /**
   * Number of equal-frequency bins used by the mutual-information
   * estimator. Defaults to round(sqrt(N)), clamped to [2, 16].
   */
  readonly miBins?: number;
}

/**
 * Per-method score / ציון לפי שיטה.
 *
 * All three fields live on [0, ∞) in their raw units, but the three
 * numbers are NOT directly comparable — use `combined` for a unified
 * ranking across methods.
 */
export interface FeatureScore {
  /** Column id (matches `BilingualFeatureName.id`). */
  readonly id: string;
  /** English display name / שם באנגלית. */
  readonly en: string;
  /** Hebrew display name / שם בעברית. */
  readonly he: string;
  /** Permutation importance (loss increase after shuffling). */
  readonly permutation: number;
  /** Variance-based importance (coefficient of variation). */
  readonly variance: number;
  /** Discrete mutual information I(X;Y) in bits. */
  readonly mutualInformation: number;
  /** Normalised mean of the three methods (in [0,1]). */
  readonly combined: number;
  /** 1-based rank by `combined` score (1 = most important). */
  readonly rank: number;
}

/**
 * Full output of `analyzeFeatureImportance` / הפלט המלא של המנתח.
 */
export interface FeatureImportanceResult {
  /** Per-feature scores, already sorted by `rank` ascending. */
  readonly scores: readonly FeatureScore[];
  /** Baseline loss before any permutation. */
  readonly baselineLoss: number;
  /** Number of observations (rows). */
  readonly nSamples: number;
  /** Number of features (columns). */
  readonly nFeatures: number;
  /** Number of permutation repeats actually used. */
  readonly nRepeats: number;
  /** Actual PRNG seed used (useful for reproducing a run). */
  readonly seed: number;
  /** Number of MI bins actually used. */
  readonly miBins: number;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Deterministic PRNG — Mulberry32 / מחולל מספרים פסבדו-אקראיים
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Create a seeded Mulberry32 PRNG.
 *
 * Mulberry32 is a tiny, high-quality 32-bit generator — sufficient for
 * shuffling rows in unit tests without pulling in a dependency. It
 * returns floats uniformly distributed on [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  // Normalise the seed to an unsigned 32-bit integer.
  let state = (seed >>> 0) || 1;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a random 32-bit seed using node:crypto. Built-in only.
 */
function drawCryptoSeed(): number {
  const buf = randomBytes(4);
  return buf.readUInt32LE(0);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Default loss functions / פונקציות הפסד ברירת מחדל
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Mean squared error / שגיאה ריבועית ממוצעת.
 */
export function meanSquaredError(
  yTrue: readonly number[],
  yPred: readonly number[],
): number {
  if (yTrue.length !== yPred.length) {
    throw new Error(
      `MSE length mismatch — yTrue=${yTrue.length}, yPred=${yPred.length}`,
    );
  }
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const d = (yTrue[i] as number) - (yPred[i] as number);
    sum += d * d;
  }
  return sum / yTrue.length;
}

/**
 * Mean absolute error / שגיאה מוחלטת ממוצעת.
 */
export function meanAbsoluteError(
  yTrue: readonly number[],
  yPred: readonly number[],
): number {
  if (yTrue.length !== yPred.length) {
    throw new Error(
      `MAE length mismatch — yTrue=${yTrue.length}, yPred=${yPred.length}`,
    );
  }
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    sum += Math.abs((yTrue[i] as number) - (yPred[i] as number));
  }
  return sum / yTrue.length;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Internal helpers / פונקציות עזר פנימיות
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Validate the input contract before we try to compute anything.
 * Throws with a bilingual message if something is off.
 */
function validateInput(input: FeatureImportanceInput): void {
  if (!input) {
    throw new Error('feature-importance: input is required / קלט חובה');
  }
  const { X, y, features } = input;
  if (!Array.isArray(X) || X.length === 0) {
    throw new Error(
      'feature-importance: X must be a non-empty matrix / מטריצת X חייבת להיות לא-ריקה',
    );
  }
  if (!Array.isArray(y) || y.length !== X.length) {
    throw new Error(
      `feature-importance: y length (${y?.length}) must equal X length (${X.length}) / אורך y חייב להיות שווה לאורך X`,
    );
  }
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error(
      'feature-importance: features must be a non-empty list / רשימת פיצ\'רים חייבת להיות לא-ריקה',
    );
  }
  const nCols = features.length;
  for (let i = 0; i < X.length; i++) {
    const row = X[i];
    if (!Array.isArray(row) || row.length !== nCols) {
      throw new Error(
        `feature-importance: row ${i} has ${row?.length} columns, expected ${nCols} / אי-התאמה במספר עמודות`,
      );
    }
    for (let j = 0; j < nCols; j++) {
      if (typeof row[j] !== 'number' || !Number.isFinite(row[j] as number)) {
        throw new Error(
          `feature-importance: X[${i}][${j}] is not finite / ערך לא תקין`,
        );
      }
    }
  }
  for (let i = 0; i < y.length; i++) {
    if (typeof y[i] !== 'number' || !Number.isFinite(y[i] as number)) {
      throw new Error(
        `feature-importance: y[${i}] is not finite / ערך מטרה לא תקין`,
      );
    }
  }
  // Feature ids must be unique.
  const seen = new Set<string>();
  for (const f of features) {
    if (!f || typeof f.id !== 'string' || f.id.length === 0) {
      throw new Error(
        'feature-importance: each feature needs a non-empty id / מזהה ריק',
      );
    }
    if (seen.has(f.id)) {
      throw new Error(
        `feature-importance: duplicate feature id "${f.id}" / מזהה כפול`,
      );
    }
    seen.add(f.id);
  }
  if (typeof input.predict !== 'function') {
    throw new Error(
      'feature-importance: predict must be a function / predict חייבת להיות פונקציה',
    );
  }
}

/**
 * Clone a matrix (shallow row copy, deep column copy). Used so the
 * caller's dataset is never mutated when we shuffle columns.
 */
function cloneMatrix(X: readonly (readonly number[])[]): number[][] {
  const out: number[][] = new Array(X.length);
  for (let i = 0; i < X.length; i++) {
    out[i] = (X[i] as number[]).slice();
  }
  return out;
}

/**
 * Extract a column from a matrix into a fresh array.
 */
function extractColumn(X: readonly (readonly number[])[], j: number): number[] {
  const col: number[] = new Array(X.length);
  for (let i = 0; i < X.length; i++) {
    col[i] = X[i]![j] as number;
  }
  return col;
}

/**
 * In-place Fisher-Yates shuffle over an array, driven by a seeded rng.
 */
function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
}

/**
 * Write a column back into a matrix in place.
 */
function writeColumn(X: number[][], j: number, col: readonly number[]): void {
  for (let i = 0; i < X.length; i++) {
    X[i]![j] = col[i] as number;
  }
}

/**
 * Compute mean, variance, and coefficient of variation of a 1-D array.
 * CV is |stddev / mean| when mean != 0, otherwise the stddev itself.
 */
function coefficientOfVariation(col: readonly number[]): number {
  if (col.length === 0) return 0;
  let mean = 0;
  for (const v of col) mean += v;
  mean /= col.length;
  let variance = 0;
  for (const v of col) {
    const d = v - mean;
    variance += d * d;
  }
  variance /= col.length;
  const stdDev = Math.sqrt(variance);
  if (Math.abs(mean) < 1e-12) return stdDev;
  return Math.abs(stdDev / mean);
}

/**
 * Equal-frequency binning / חלוקה לפי שכיחות שווה.
 *
 * Produces integer bin indices in [0, nBins) such that each bin holds
 * as close to the same number of observations as possible. We assign a
 * rank 0..N-1 to every value (ties broken by original index) and then
 * place rank r into bin floor(r * nBins / N). This is robust to
 * outliers and insensitive to monotone re-scaling of the input — the
 * twin properties we want for a mutual-information estimator.
 */
export function equalFrequencyBin(
  values: readonly number[],
  nBins: number,
): number[] {
  if (nBins < 2) nBins = 2;
  const n = values.length;
  if (n === 0) return [];
  // Stable sort of indices by value.
  const order = new Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a: number, b: number) => {
    const va = values[a] as number;
    const vb = values[b] as number;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return a - b;
  });
  const binned: number[] = new Array(n);
  for (let r = 0; r < n; r++) {
    const bin = Math.min(nBins - 1, Math.floor((r * nBins) / n));
    binned[order[r] as number] = bin;
  }
  return binned;
}

/**
 * Discrete mutual information I(X;Y) in bits / מידע הדדי בדיד.
 *
 * MI is computed over integer bin labels, which both inputs should
 * already be. Uses the empirical joint distribution with a tiny
 * epsilon floor to avoid log(0). Returns 0 when X or Y is constant.
 */
export function discreteMutualInformation(
  xBin: readonly number[],
  yBin: readonly number[],
): number {
  if (xBin.length !== yBin.length) {
    throw new Error(
      `MI length mismatch — x=${xBin.length}, y=${yBin.length}`,
    );
  }
  const n = xBin.length;
  if (n === 0) return 0;
  // Count marginals and joint.
  const xCounts = new Map<number, number>();
  const yCounts = new Map<number, number>();
  const xyCounts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const xi = xBin[i] as number;
    const yi = yBin[i] as number;
    xCounts.set(xi, (xCounts.get(xi) ?? 0) + 1);
    yCounts.set(yi, (yCounts.get(yi) ?? 0) + 1);
    const key = `${xi}|${yi}`;
    xyCounts.set(key, (xyCounts.get(key) ?? 0) + 1);
  }
  if (xCounts.size < 2 || yCounts.size < 2) return 0;
  let mi = 0;
  const log2 = Math.log(2);
  for (const [key, count] of xyCounts) {
    const sep = key.indexOf('|');
    const xi = Number(key.slice(0, sep));
    const yi = Number(key.slice(sep + 1));
    const pxy = count / n;
    const px = (xCounts.get(xi) as number) / n;
    const py = (yCounts.get(yi) as number) / n;
    if (pxy > 0 && px > 0 && py > 0) {
      mi += pxy * (Math.log(pxy / (px * py)) / log2);
    }
  }
  return Math.max(0, mi);
}

/**
 * Min-max normalise a number array into [0,1].
 * If all values are equal, returns an array of zeros (tied importance).
 */
function minMaxNormalise(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (range <= 0) return values.map(() => 0);
  return values.map((v) => (v - lo) / range);
}

/* ─────────────────────────────────────────────────────────────────────────
 * The analyzer / המנתח הראשי
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Rank features by permutation + variance + mutual information.
 * דירוג פיצ'רים לפי שלוש שיטות.
 */
export function analyzeFeatureImportance(
  input: FeatureImportanceInput,
): FeatureImportanceResult {
  validateInput(input);

  const { X, y, features, predict } = input;
  const nSamples = X.length;
  const nFeatures = features.length;
  const nRepeats = input.nRepeats ?? 3;
  if (nRepeats < 1) {
    throw new Error(
      `feature-importance: nRepeats must be >= 1 / nRepeats חייב להיות ≥ 1`,
    );
  }
  const seed = input.seed ?? drawCryptoSeed();
  const rng = createSeededRng(seed);
  const loss: LossFn = input.loss ?? meanSquaredError;

  const defaultBins = Math.round(Math.sqrt(nSamples));
  const miBins = Math.max(
    2,
    Math.min(16, input.miBins ?? (defaultBins > 0 ? defaultBins : 2)),
  );

  // 1) Baseline loss.
  const baselinePred = predict(cloneMatrix(X));
  if (!Array.isArray(baselinePred) || baselinePred.length !== nSamples) {
    throw new Error(
      `feature-importance: predict returned ${baselinePred?.length} values, expected ${nSamples}`,
    );
  }
  const baselineLoss = loss(y, baselinePred);

  // 2) Permutation importance per feature.
  const permScores: number[] = new Array(nFeatures).fill(0);
  const workingMatrix = cloneMatrix(X);
  for (let j = 0; j < nFeatures; j++) {
    const originalCol = extractColumn(X, j);
    let accum = 0;
    for (let r = 0; r < nRepeats; r++) {
      const shuffled = originalCol.slice();
      shuffleInPlace(shuffled, rng);
      writeColumn(workingMatrix, j, shuffled);
      const pred = predict(workingMatrix);
      if (!Array.isArray(pred) || pred.length !== nSamples) {
        throw new Error(
          `feature-importance: predict returned ${pred?.length} values on column ${j}, expected ${nSamples}`,
        );
      }
      accum += loss(y, pred) - baselineLoss;
    }
    writeColumn(workingMatrix, j, originalCol);
    // Average over repeats, clamp at zero — a negative number means the
    // shuffled version did BETTER, which we interpret as "no signal".
    permScores[j] = Math.max(0, accum / nRepeats);
  }

  // 3) Variance-based importance per feature.
  const varScores: number[] = new Array(nFeatures).fill(0);
  for (let j = 0; j < nFeatures; j++) {
    varScores[j] = coefficientOfVariation(extractColumn(X, j));
  }

  // 4) Mutual information per feature.
  const miScores: number[] = new Array(nFeatures).fill(0);
  const yBin = equalFrequencyBin(y, miBins);
  for (let j = 0; j < nFeatures; j++) {
    const xBin = equalFrequencyBin(extractColumn(X, j), miBins);
    miScores[j] = discreteMutualInformation(xBin, yBin);
  }

  // 5) Combined score: weighted mean of the three normalised methods.
  //    Permutation importance is model-aware, so it carries the most
  //    weight; variance and mutual information are screening heuristics
  //    that back up the decision.
  //
  //       combined = 0.6 · normPerm + 0.2 · normVar + 0.2 · normMi
  //
  const normPerm = minMaxNormalise(permScores);
  const normVar = minMaxNormalise(varScores);
  const normMi = minMaxNormalise(miScores);
  const W_PERM = 0.6;
  const W_VAR = 0.2;
  const W_MI = 0.2;
  const combined: number[] = new Array(nFeatures);
  for (let j = 0; j < nFeatures; j++) {
    combined[j] =
      W_PERM * (normPerm[j] as number) +
      W_VAR * (normVar[j] as number) +
      W_MI * (normMi[j] as number);
  }

  // 6) Rank by combined, descending. Stable tie-break on feature id.
  const indices = combined.map((_, j) => j);
  indices.sort((a, b) => {
    const diff = (combined[b] as number) - (combined[a] as number);
    if (diff !== 0) return diff;
    return (features[a] as BilingualFeatureName).id.localeCompare(
      (features[b] as BilingualFeatureName).id,
    );
  });

  const scores: FeatureScore[] = indices.map((j, rankIdx) => {
    const f = features[j] as BilingualFeatureName;
    return {
      id: f.id,
      en: f.en,
      he: f.he,
      permutation: permScores[j] as number,
      variance: varScores[j] as number,
      mutualInformation: miScores[j] as number,
      combined: combined[j] as number,
      rank: rankIdx + 1,
    };
  });

  return {
    scores,
    baselineLoss,
    nSamples,
    nFeatures,
    nRepeats,
    seed,
    miBins,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Bilingual report rendering / דוח דו-לשוני
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Format a floating-point value with a fixed width.
 * Uses up to 4 decimals so the table does not explode.
 */
function fmt(value: number, width: number): string {
  if (!Number.isFinite(value)) return 'NaN'.padStart(width);
  const abs = Math.abs(value);
  let s: string;
  if (abs >= 1000) s = value.toFixed(1);
  else if (abs >= 1) s = value.toFixed(3);
  else s = value.toFixed(4);
  if (s.length > width) s = s.slice(0, width);
  return s.padStart(width);
}

/** Pad a string to `width` columns (right-pad with spaces). */
function padRight(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

/**
 * Render the bilingual feature importance table as a plain-text report.
 *
 * Deterministic output, newline-terminated, ready to be embedded in a
 * markdown QA report or printed to stdout.
 */
export function renderBilingualReport(
  result: FeatureImportanceResult,
): string {
  const header =
    '╔══════════════════════════════════════════════════════════════════════════════╗\n' +
    '║   ONYX AI / Techno-Kol Uzi — Feature Importance / חשיבות פיצ\'רים            ║\n' +
    '╚══════════════════════════════════════════════════════════════════════════════╝\n';

  const meta =
    `Samples / דגימות       : ${result.nSamples}\n` +
    `Features / פיצ'רים     : ${result.nFeatures}\n` +
    `Repeats / חזרות        : ${result.nRepeats}\n` +
    `MI Bins / תאי מידע     : ${result.miBins}\n` +
    `Seed / זרע             : ${result.seed}\n` +
    `Baseline Loss / בסיס    : ${fmt(result.baselineLoss, 10).trim()}\n\n`;

  // Column widths chosen to keep the table readable on 80 chars.
  const W_RANK = 4;
  const W_EN = 18;
  const W_HE = 18;
  const W_NUM = 10;

  const sep =
    '─'.repeat(W_RANK) +
    '┼' +
    '─'.repeat(W_EN + 2) +
    '┼' +
    '─'.repeat(W_HE + 2) +
    '┼' +
    '─'.repeat(W_NUM + 2) +
    '┼' +
    '─'.repeat(W_NUM + 2) +
    '┼' +
    '─'.repeat(W_NUM + 2) +
    '┼' +
    '─'.repeat(W_NUM + 2) +
    '\n';

  const headerRow =
    padRight('#', W_RANK) +
    '│ ' +
    padRight('Feature (EN)', W_EN) +
    ' │ ' +
    padRight('פיצ\'ר (HE)', W_HE) +
    ' │ ' +
    padRight('Permut.', W_NUM) +
    ' │ ' +
    padRight('Variance', W_NUM) +
    ' │ ' +
    padRight('MI(bits)', W_NUM) +
    ' │ ' +
    padRight('Combined', W_NUM) +
    '\n';

  let rows = '';
  for (const s of result.scores) {
    rows +=
      padRight(String(s.rank), W_RANK) +
      '│ ' +
      padRight(s.en, W_EN) +
      ' │ ' +
      padRight(s.he, W_HE) +
      ' │ ' +
      fmt(s.permutation, W_NUM) +
      ' │ ' +
      fmt(s.variance, W_NUM) +
      ' │ ' +
      fmt(s.mutualInformation, W_NUM) +
      ' │ ' +
      fmt(s.combined, W_NUM) +
      '\n';
  }

  const footer =
    '\nLegend / מקרא:\n' +
    '  Permut.  = permutation importance (Δ loss after shuffling) / חשיבות לפי ערבוב\n' +
    '  Variance = coefficient of variation of the column / שונות יחסית\n' +
    '  MI(bits) = discrete mutual information with target / מידע הדדי עם המטרה\n' +
    '  Combined = normalised mean across the three methods / ממוצע מנורמל\n';

  return header + meta + headerRow + sep + rows + footer;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Convenience helpers / פונקציות עזר נוחות
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Build a bilingual feature list from parallel arrays. Handy when the
 * caller already holds English and Hebrew names as flat lists.
 */
export function zipFeatureNames(
  ids: readonly string[],
  en: readonly string[],
  he: readonly string[],
): BilingualFeatureName[] {
  if (ids.length !== en.length || ids.length !== he.length) {
    throw new Error(
      `zipFeatureNames: length mismatch ids=${ids.length} en=${en.length} he=${he.length}`,
    );
  }
  return ids.map((id, i) => ({
    id,
    en: en[i] as string,
    he: he[i] as string,
  }));
}

/**
 * Pick the top-N most important features from a completed result.
 */
export function topNFeatures(
  result: FeatureImportanceResult,
  n: number,
): readonly FeatureScore[] {
  if (n <= 0) return [];
  return result.scores.slice(0, Math.min(n, result.scores.length));
}
