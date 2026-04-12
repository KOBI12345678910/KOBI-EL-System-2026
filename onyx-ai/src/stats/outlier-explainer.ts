/**
 * ONYX AI — Outlier Explainer (Agent Y-161)
 * ------------------------------------------------------------
 * Techno-Kol Uzi mega-ERP — bilingual (he/en) plain-language
 * explanation of WHY a value is an outlier. This module does not
 * only detect outliers: it decomposes the contributing dimensions
 * and generates a natural-language narrative a non-technical
 * reviewer (accountant / project manager) can act on.
 *
 * Design constraints (rules from mission brief):
 *   - Zero external dependencies (Node built-ins only).
 *   - Never deletes any existing file / module.
 *   - Bilingual output: both `he` (Hebrew) and `en` (English)
 *     narratives are ALWAYS produced, never just one.
 *   - Pure functions + one thin class (`OutlierExplainer`).
 *   - Deterministic: same inputs => same explanation.
 *   - Safe on empty / degenerate reference distributions:
 *     returns an explanation object with `isOutlier = false`
 *     and a reason describing why detection was inconclusive.
 *
 * Mathematical methods used (all implemented inline):
 *   1. Robust mean + sample standard deviation (Welford one-pass).
 *   2. Median + MAD (median absolute deviation) for a robust
 *      fallback when the distribution is heavy-tailed.
 *   3. Modified z-score based on MAD (Iglewicz & Hoaglin, 1993).
 *   4. Tukey IQR fences (Q1 - k*IQR, Q3 + k*IQR, k = 1.5).
 *   5. Percentile rank of the value within the reference set.
 *   6. Dimensional breakdown: same computation re-run per
 *      category-bucket so the narrative can point the reviewer
 *      at the precise contributing dimension (e.g. "vendor X
 *      contributes +3.2 sigma vs. its own 12-month history").
 *
 * Public surface:
 *
 *   class OutlierExplainer
 *     constructor(opts?: OutlierExplainerOptions)
 *     explain(row, reference): OutlierExplanation
 *     explainValue(value, series, context?): OutlierExplanation
 *     narrate(exp): { he: string; en: string }
 *
 *   Helpers exported for unit tests and other modules:
 *     computeStats, computeQuartiles, modifiedZScore,
 *     percentileRank, groupBy, countSimilarCasesLast12Months,
 *     affectedCategories.
 *
 * Integration:
 *   - The Anomaly Detection Engine (AG-100) produces anomaly
 *     records with `.value`, `.vendorId`, `.category`, `.timestamp`.
 *     Feed one such record as `row` and the engine's reference
 *     history as `reference`; `explain()` returns the bilingual
 *     narrative to be surfaced on the dashboard next to the flag.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Lang = 'he' | 'en';

/** A single record in the reference distribution. */
export interface ReferenceRow {
  /** Numeric value being analysed (e.g. invoice amount, NIS). */
  value: number;
  /** ISO-8601 timestamp or epoch ms. Optional — enables 12-month window. */
  timestamp?: string | number | Date;
  /** Category dimensions. Arbitrary key/value pairs. */
  category?: string;
  vendorId?: string;
  department?: string;
  projectId?: string;
  [dim: string]: any;
}

/** The row being explained. Must at least carry a `value`. */
export interface TargetRow extends ReferenceRow {
  value: number;
}

/** Tunable options — all have sane defaults. */
export interface OutlierExplainerOptions {
  /** Number of standard deviations above/below which the value
   *  is declared an outlier. Default: 2.5. */
  zThreshold?: number;
  /** Modified z-score (MAD-based) threshold. Default: 3.5
   *  — per Iglewicz & Hoaglin (1993). */
  madThreshold?: number;
  /** IQR multiplier k. Default: 1.5 (Tukey fences). */
  iqrK?: number;
  /** Dimensions to break down contributions by. Default:
   *  ['vendorId', 'category', 'department', 'projectId']. */
  dimensions?: string[];
  /** Minimum reference sample size required for statistical
   *  inference. Below this the explainer returns an inconclusive
   *  explanation rather than a spurious verdict. Default: 5. */
  minSample?: number;
  /** Window (days) for the "similar cases in past K months" count. */
  similarWindowDays?: number;
  /** Relative tolerance used when counting similar cases by value.
   *  Two values are "similar" when |a-b|/max(|a|,|b|,1) <= tolerance.
   *  Default: 0.10 (10%). */
  similarTolerance?: number;
  /** Clock override for deterministic tests. Defaults to now. */
  now?: () => Date;
}

/** Method by which the value was judged. */
export type OutlierMethod = 'zscore' | 'mad' | 'iqr' | 'none';

/** Per-dimension contribution. */
export interface DimensionContribution {
  /** Dimension name, e.g. "vendorId". */
  dimension: string;
  /** Bucket value, e.g. "VENDOR-42". */
  bucket: string;
  /** Number of reference rows in that bucket. */
  sampleSize: number;
  /** Bucket mean, stdev, median, mad. */
  mean: number;
  stdev: number;
  median: number;
  mad: number;
  /** Classical z-score of the target value against this bucket. */
  zScore: number;
  /** Modified (MAD-based) z-score against this bucket. */
  modifiedZScore: number;
  /** Whether this bucket considers the value an outlier. */
  isOutlier: boolean;
}

export interface BasicStats {
  n: number;
  mean: number;
  stdev: number;
  min: number;
  max: number;
  sum: number;
}

export interface Quartiles {
  q1: number;
  q2: number; // == median
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
}

export interface OutlierExplanation {
  /** Verdict. */
  isOutlier: boolean;
  /** The value itself. */
  value: number;
  /** Primary method that flagged it (or "none"). */
  method: OutlierMethod;
  /** Number of standard deviations above (positive) / below
   *  (negative) the reference mean. */
  stdDeviationsFromMean: number;
  /** Modified (MAD-based) z-score — robust fallback. */
  modifiedZScore: number;
  /** Percentile rank of the value in the reference set (0..100). */
  percentile: number;
  /** Direction: 'high' if above mean, 'low' if below. */
  direction: 'high' | 'low' | 'equal';
  /** Global stats of the reference distribution. */
  globalStats: BasicStats;
  /** Global quartiles / fences. */
  quartiles: Quartiles;
  /** Ranked dimensional contributions, worst-first. */
  contributions: DimensionContribution[];
  /** Count of similar rows in the past K months. */
  similarCasesLast12Months: number;
  /** Categories that were affected (dimension buckets where
   *  the row looks anomalous vs. its own subset). */
  affectedCategories: string[];
  /** Bilingual narrative. */
  narrative: { he: string; en: string };
  /** Optional machine-readable reason code — for UI filters. */
  reasonCode:
    | 'high_zscore'
    | 'low_zscore'
    | 'high_mad'
    | 'low_mad'
    | 'above_upper_fence'
    | 'below_lower_fence'
    | 'within_expected_range'
    | 'insufficient_sample';
}

// ----------------------------------------------------------------
// Low-level math helpers (pure, unit-tested)
// ----------------------------------------------------------------

/** Compute mean, sample stdev, min, max, sum in one pass (Welford). */
export function computeStats(values: number[]): BasicStats {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: 0, stdev: 0, min: 0, max: 0, sum: 0 };
  }
  let mean = 0;
  let m2 = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = values[i];
    sum += x;
    if (x < min) min = x;
    if (x > max) max = x;
    const delta = x - mean;
    mean += delta / (i + 1);
    const delta2 = x - mean;
    m2 += delta * delta2;
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const stdev = Math.sqrt(variance);
  return { n, mean, stdev, min, max, sum };
}

/** Median of an array (does not mutate). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Median absolute deviation — a robust scale estimator. */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  const devs = values.map((v) => Math.abs(v - m));
  return median(devs);
}

/** Tukey quartiles Q1/Q2/Q3 + IQR fences. Uses linear
 *  interpolation (aka the "method 7" / R default). */
export function computeQuartiles(values: number[], k = 1.5): Quartiles {
  if (values.length === 0) {
    return {
      q1: 0,
      q2: 0,
      q3: 0,
      iqr: 0,
      lowerFence: 0,
      upperFence: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number): number => {
    if (sorted.length === 1) return sorted[0];
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = pct(0.25);
  const q2 = pct(0.5);
  const q3 = pct(0.75);
  const iqr = q3 - q1;
  return {
    q1,
    q2,
    q3,
    iqr,
    lowerFence: q1 - k * iqr,
    upperFence: q3 + k * iqr,
  };
}

/** Classical z-score. Returns 0 if stdev === 0 (avoid NaN). */
export function zScore(value: number, mean: number, stdev: number): number {
  if (stdev === 0 || !Number.isFinite(stdev)) return 0;
  return (value - mean) / stdev;
}

/** Iglewicz-Hoaglin modified z-score using MAD.
 *  Formula: M_i = 0.6745 * (x_i - median) / MAD
 *  Returns 0 when MAD is 0 to avoid division by zero. */
export function modifiedZScore(
  value: number,
  medianVal: number,
  madVal: number,
): number {
  if (madVal === 0 || !Number.isFinite(madVal)) return 0;
  return (0.6745 * (value - medianVal)) / madVal;
}

/** Percentile rank of `value` within `values` (0..100). */
export function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  // Standard definition: (below + 0.5 * equal) / n * 100
  return ((below + 0.5 * equal) / values.length) * 100;
}

/** Group rows by a dimension key. */
export function groupBy<T extends Record<string, any>>(
  rows: T[],
  dim: string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = r[dim];
    if (k === undefined || k === null || k === '') continue;
    const key = String(k);
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

/** Parse a timestamp into epoch ms. Accepts Date, number, string. */
export function toEpochMs(t: unknown): number | null {
  if (t === undefined || t === null || t === '') return null;
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'number') return t;
  if (typeof t === 'string') {
    const parsed = Date.parse(t);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Count rows in the reference that are "similar" to the target
 *  in both value (within `tolerance` relative) and time window. */
export function countSimilarCasesLast12Months(
  target: TargetRow,
  reference: ReferenceRow[],
  opts: {
    now: Date;
    windowDays: number;
    tolerance: number;
  },
): number {
  const nowMs = opts.now.getTime();
  const cutoffMs = nowMs - opts.windowDays * 24 * 60 * 60 * 1000;
  const targetVal = target.value;
  let count = 0;
  for (const r of reference) {
    const ts = toEpochMs(r.timestamp);
    if (ts === null) continue;
    if (ts < cutoffMs || ts > nowMs) continue;
    const denom = Math.max(Math.abs(targetVal), Math.abs(r.value), 1);
    const diff = Math.abs(targetVal - r.value) / denom;
    if (diff <= opts.tolerance) count++;
  }
  return count;
}

/** Which categorical buckets flag the row as anomalous? */
export function affectedCategories(
  contributions: DimensionContribution[],
): string[] {
  const set = new Set<string>();
  for (const c of contributions) {
    if (c.isOutlier) set.add(`${c.dimension}=${c.bucket}`);
  }
  return [...set];
}

// ----------------------------------------------------------------
// Default option set
// ----------------------------------------------------------------

const DEFAULTS: Required<OutlierExplainerOptions> = {
  zThreshold: 2.5,
  madThreshold: 3.5,
  iqrK: 1.5,
  dimensions: ['vendorId', 'category', 'department', 'projectId'],
  minSample: 5,
  similarWindowDays: 365, // 12 months
  similarTolerance: 0.1,
  now: () => new Date(),
};

// ----------------------------------------------------------------
// Narrative generation — bilingual, template-driven
// ----------------------------------------------------------------

function fmtNis(v: number): string {
  // Locale-neutral — we build both strings ourselves to avoid Intl
  // surprises on minimal runtimes. Two decimals, group separator
  // every 3 digits, no currency code (caller may add one).
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const fixed = abs.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${dec}`;
}

function fmtSigned(v: number, digits = 2): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
}

function buildNarrative(exp: Omit<OutlierExplanation, 'narrative'>): {
  he: string;
  en: string;
} {
  if (exp.reasonCode === 'insufficient_sample') {
    return {
      he:
        `לא ניתן לקבוע אם הערך ${fmtNis(exp.value)} חריג — ` +
        `מספר הרשומות בהתפלגות הייחוס (${exp.globalStats.n}) קטן מדי ` +
        `לצורך מסקנה סטטיסטית.`,
      en:
        `Cannot determine whether ${fmtNis(exp.value)} is an outlier — ` +
        `the reference distribution has only ${exp.globalStats.n} rows, ` +
        `which is below the minimum required for inference.`,
    };
  }

  if (!exp.isOutlier) {
    return {
      he:
        `הערך ${fmtNis(exp.value)} נמצא בתחום הצפוי ` +
        `(ממוצע ${fmtNis(exp.globalStats.mean)}, סטיית תקן ${fmtNis(
          exp.globalStats.stdev,
        )}; ` +
        `אחוזון ${exp.percentile.toFixed(1)}). אין צורך בבדיקה נוספת.`,
      en:
        `Value ${fmtNis(exp.value)} is within the expected range ` +
        `(mean ${fmtNis(exp.globalStats.mean)}, stdev ${fmtNis(
          exp.globalStats.stdev,
        )}; ` +
        `percentile ${exp.percentile.toFixed(1)}). No further review needed.`,
    };
  }

  const dirHe = exp.direction === 'high' ? 'גבוה' : 'נמוך';
  const dirEn = exp.direction === 'high' ? 'above' : 'below';
  const sigmaAbs = Math.abs(exp.stdDeviationsFromMean).toFixed(2);

  const catsHe =
    exp.affectedCategories.length > 0
      ? exp.affectedCategories.join(', ')
      : '—';
  const catsEn =
    exp.affectedCategories.length > 0
      ? exp.affectedCategories.join(', ')
      : '—';

  const topContrib = exp.contributions[0];
  const contribHe = topContrib
    ? ` הגורם העיקרי: ${topContrib.dimension}=${topContrib.bucket} ` +
      `(z=${fmtSigned(topContrib.zScore)}, n=${topContrib.sampleSize}).`
    : '';
  const contribEn = topContrib
    ? ` Top contributing dimension: ${topContrib.dimension}=${topContrib.bucket} ` +
      `(z=${fmtSigned(topContrib.zScore)}, n=${topContrib.sampleSize}).`
    : '';

  const he =
    `הערך חריג כי ${fmtNis(exp.value)} ${dirHe} ` +
    `ב-${sigmaAbs} סטיות תקן מהממוצע (${fmtNis(exp.globalStats.mean)}). ` +
    `אחוזון ${exp.percentile.toFixed(1)}. ` +
    `מקרים דומים ב-12 החודשים האחרונים: ${exp.similarCasesLast12Months}. ` +
    `קטגוריות מושפעות: [${catsHe}].${contribHe}`;

  const en =
    `Value ${fmtNis(exp.value)} is ${sigmaAbs} standard deviations ${dirEn} ` +
    `the mean (${fmtNis(exp.globalStats.mean)}). ` +
    `Percentile ${exp.percentile.toFixed(1)}. ` +
    `Similar cases in past 12 months: ${exp.similarCasesLast12Months}. ` +
    `Affected categories: [${catsEn}].${contribEn}`;

  return { he, en };
}

// ----------------------------------------------------------------
// The class
// ----------------------------------------------------------------

export class OutlierExplainer {
  private readonly opts: Required<OutlierExplainerOptions>;

  constructor(opts: OutlierExplainerOptions = {}) {
    this.opts = {
      zThreshold: opts.zThreshold ?? DEFAULTS.zThreshold,
      madThreshold: opts.madThreshold ?? DEFAULTS.madThreshold,
      iqrK: opts.iqrK ?? DEFAULTS.iqrK,
      dimensions: opts.dimensions ?? DEFAULTS.dimensions,
      minSample: opts.minSample ?? DEFAULTS.minSample,
      similarWindowDays: opts.similarWindowDays ?? DEFAULTS.similarWindowDays,
      similarTolerance: opts.similarTolerance ?? DEFAULTS.similarTolerance,
      now: opts.now ?? DEFAULTS.now,
    };
  }

  /**
   * Explain a row given a reference distribution.
   * Always returns a fully populated `OutlierExplanation`.
   */
  explain(row: TargetRow, reference: ReferenceRow[]): OutlierExplanation {
    const values = reference
      .map((r) => r.value)
      .filter((v) => Number.isFinite(v));
    const globalStats = computeStats(values);
    const quartiles = computeQuartiles(values, this.opts.iqrK);

    // Insufficient sample — bail out gracefully, still bilingual.
    if (globalStats.n < this.opts.minSample) {
      const base: Omit<OutlierExplanation, 'narrative'> = {
        isOutlier: false,
        value: row.value,
        method: 'none',
        stdDeviationsFromMean: 0,
        modifiedZScore: 0,
        percentile: percentileRank(row.value, values),
        direction: 'equal',
        globalStats,
        quartiles,
        contributions: [],
        similarCasesLast12Months: 0,
        affectedCategories: [],
        reasonCode: 'insufficient_sample',
      };
      return { ...base, narrative: buildNarrative(base) };
    }

    // Primary detection methods.
    const z = zScore(row.value, globalStats.mean, globalStats.stdev);
    const medianVal = median(values);
    const madVal = mad(values);
    const mz = modifiedZScore(row.value, medianVal, madVal);

    const aboveFence = row.value > quartiles.upperFence;
    const belowFence = row.value < quartiles.lowerFence;

    let isOutlier = false;
    let method: OutlierMethod = 'none';
    let reasonCode: OutlierExplanation['reasonCode'] = 'within_expected_range';

    if (Math.abs(z) >= this.opts.zThreshold) {
      isOutlier = true;
      method = 'zscore';
      reasonCode = z > 0 ? 'high_zscore' : 'low_zscore';
    } else if (Math.abs(mz) >= this.opts.madThreshold) {
      isOutlier = true;
      method = 'mad';
      reasonCode = mz > 0 ? 'high_mad' : 'low_mad';
    } else if (aboveFence || belowFence) {
      isOutlier = true;
      method = 'iqr';
      reasonCode = aboveFence ? 'above_upper_fence' : 'below_lower_fence';
    }

    // Direction (high / low / equal) relative to the mean.
    let direction: 'high' | 'low' | 'equal' = 'equal';
    if (row.value > globalStats.mean) direction = 'high';
    else if (row.value < globalStats.mean) direction = 'low';

    // Dimensional breakdown.
    const contributions: DimensionContribution[] = [];
    for (const dim of this.opts.dimensions) {
      const bucketKey = row[dim];
      if (bucketKey === undefined || bucketKey === null || bucketKey === '') {
        continue;
      }
      const bucket = String(bucketKey);
      const rowsInBucket = reference.filter(
        (r) => r[dim] !== undefined && String(r[dim]) === bucket,
      );
      if (rowsInBucket.length < 2) continue;
      const bucketValues = rowsInBucket.map((r) => r.value);
      const bucketStats = computeStats(bucketValues);
      const bMedian = median(bucketValues);
      const bMad = mad(bucketValues);
      const bz = zScore(row.value, bucketStats.mean, bucketStats.stdev);
      const bmz = modifiedZScore(row.value, bMedian, bMad);
      const bucketIsOutlier =
        Math.abs(bz) >= this.opts.zThreshold ||
        Math.abs(bmz) >= this.opts.madThreshold;
      contributions.push({
        dimension: dim,
        bucket,
        sampleSize: bucketStats.n,
        mean: bucketStats.mean,
        stdev: bucketStats.stdev,
        median: bMedian,
        mad: bMad,
        zScore: bz,
        modifiedZScore: bmz,
        isOutlier: bucketIsOutlier,
      });
    }

    // Rank contributions by |z| desc — worst-first is actionable.
    contributions.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

    const similarCount = countSimilarCasesLast12Months(row, reference, {
      now: this.opts.now(),
      windowDays: this.opts.similarWindowDays,
      tolerance: this.opts.similarTolerance,
    });

    const base: Omit<OutlierExplanation, 'narrative'> = {
      isOutlier,
      value: row.value,
      method,
      stdDeviationsFromMean: z,
      modifiedZScore: mz,
      percentile: percentileRank(row.value, values),
      direction,
      globalStats,
      quartiles,
      contributions,
      similarCasesLast12Months: similarCount,
      affectedCategories: affectedCategories(contributions),
      reasonCode,
    };

    return { ...base, narrative: buildNarrative(base) };
  }

  /**
   * Convenience overload when only a scalar + series is available.
   * Uses a synthetic row with a single `value` field and no dims.
   */
  explainValue(
    value: number,
    series: number[],
    context?: Partial<TargetRow>,
  ): OutlierExplanation {
    const reference: ReferenceRow[] = series.map((v) => ({ value: v }));
    const row: TargetRow = { value, ...(context ?? {}) };
    return this.explain(row, reference);
  }

  /** Expose the narrative builder publicly for re-formatting UIs. */
  narrate(exp: OutlierExplanation): { he: string; en: string } {
    return exp.narrative;
  }
}

// ----------------------------------------------------------------
// Default export: a singleton using DEFAULTS. Import as needed.
// ----------------------------------------------------------------

export const defaultOutlierExplainer = new OutlierExplainer();
