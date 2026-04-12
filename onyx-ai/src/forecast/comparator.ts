/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — Forecast Comparator  (Agent Y-162)
 * סוכן השוואת תחזיות
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Module:       onyx-ai/src/forecast/comparator.ts
 * System:       Techno-Kol Uzi mega-ERP
 * Purpose:      Compare multiple forecast models against a single actual
 *               series and rank them with classical forecast-accuracy
 *               metrics, plus pairwise Diebold-Mariano significance.
 *
 * Dependencies: ZERO external packages. Node built-ins only.
 *               (Type-only: `node:assert` is not imported at runtime.)
 *
 * Metrics implemented:
 *
 *   MAE              Mean Absolute Error
 *                    שגיאה מוחלטת ממוצעת
 *
 *   MAPE             Mean Absolute Percentage Error
 *                    (guarded against zero / near-zero actuals —
 *                    the offending points are removed from the MAPE
 *                    average and reported back in `mapeSkipped`.
 *                    If ALL points are dropped, MAPE falls back to
 *                    WAPE (weighted absolute percentage error) and
 *                    the `mapeFallback` flag is set.)
 *                    שגיאה אחוזית מוחלטת ממוצעת
 *
 *   sMAPE            Symmetric MAPE  (Makridakis 1993 convention:
 *                    denominator = (|a|+|f|)/2, clipped to 200%).
 *                    שגיאה אחוזית סימטרית
 *
 *   WAPE             Weighted Absolute Percentage Error
 *                    = Σ|a-f| / Σ|a|  (robust alternative to MAPE).
 *                    שגיאה אחוזית משוקללת
 *
 *   RMSE             Root Mean Squared Error
 *                    שורש השגיאה הריבועית הממוצעת
 *
 *   MASE             Mean Absolute Scaled Error
 *                    (Hyndman & Koehler 2006 — scale by the in-sample
 *                    one-step naive MAE; if `seasonality=m`, use a
 *                    seasonal-naive denominator. Denominator is taken
 *                    from the `actual` series itself — no separate
 *                    training series is required.)
 *                    שגיאה מוחלטת מנורמלת
 *
 *   Theil's U        Theil's inequality coefficient U2
 *                    (= RMSE_model / RMSE_naive).
 *                    U<1  → model beats naive.
 *                    U=1  → model equivalent to naive.
 *                    U>1  → model worse than naive.
 *                    מקדם תאיל
 *
 *   Directional      Percentage of forecast steps whose DIRECTION
 *   Accuracy         (sign of Δ vs previous actual) matches the
 *                    actual direction. First step is undefined and
 *                    therefore excluded.
 *                    דיוק כיווני
 *
 * Pairwise test:     Diebold-Mariano (DM) test of equal forecast
 *                    accuracy with squared-error loss, using a
 *                    Newey-West HAC variance estimator (Harvey
 *                    1997 small-sample correction). Returns a
 *                    DM statistic, the asymptotic two-sided
 *                    p-value, and a bilingual verdict.
 *                    מבחן דיבולד-מריאנו
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT: this file NEVER removes prior functionality. The
 * comparator is a new, additive module. Nothing in the rest of the
 * onyx-ai tree depends on it yet; it is consumed by a dedicated test
 * suite at `test/forecast/comparator.test.ts`.
 * ---------------------------------------------------------------------------
 */

// ───────────────────────── Public types ──────────────────────────────────

/**
 * A single named forecast series. `values.length` must match the
 * length of the `actual` vector passed to `ForecastComparator.compare()`.
 *
 * `labelHe` / `labelEn` are optional per-forecast display strings. If
 * omitted, `name` is used for both locales.
 */
export interface ForecastSeries {
  name: string;
  values: number[];
  labelHe?: string;
  labelEn?: string;
}

/**
 * Option bag for `compare()`.
 *
 *   seasonality        Period `m` for the seasonal-naive denominator
 *                      in MASE. Default 1 (non-seasonal). If the
 *                      actual series is shorter than `m+1`, the code
 *                      silently falls back to `m=1`.
 *
 *   mapeEpsilon        Any actual whose |value| is ≤ mapeEpsilon is
 *                      considered "zero / near-zero" and is skipped
 *                      from the MAPE numerator. Default = 1e-9.
 *
 *   smapeClipPercent   sMAPE is clipped to this ceiling (in percent)
 *                      so divide-by-zero at |a|+|f|=0 resolves to 0,
 *                      not NaN. Default = 200.
 *
 *   dmHorizon          Forecast horizon h used inside the DM test's
 *                      HAC variance (default 1). Harvey-Leybourne-
 *                      Newbold small-sample correction is always on.
 *
 *   naiveValues        Optional explicit naive baseline used by
 *                      Theil's U. If omitted, the comparator builds
 *                      a one-step random-walk baseline from `actual`
 *                      itself: `naive[t] = actual[t-1]`.
 */
export interface ComparatorOptions {
  seasonality?: number;
  mapeEpsilon?: number;
  smapeClipPercent?: number;
  dmHorizon?: number;
  naiveValues?: number[];
}

/**
 * Per-forecast metric block.
 */
export interface MetricRow {
  name: string;
  labelHe: string;
  labelEn: string;

  mae: number;
  mape: number;        // percent, NaN-safe
  mapeSkipped: number; // how many points were dropped from the MAPE numerator
  mapeFallback: boolean; // true  → `mape` column actually contains WAPE
  smape: number;       // percent
  wape: number;        // percent
  rmse: number;
  mase: number;
  theilU: number;
  directionalAccuracy: number; // percent

  n: number; // aligned sample size used in the averages
}

/**
 * Full comparison result returned by `ForecastComparator.compare()`.
 */
export interface ComparisonResult {
  rows: MetricRow[];
  ranked: RankedEntry[];

  winners: {
    mae: string;
    mape: string;
    smape: string;
    wape: string;
    rmse: string;
    mase: string;
    theilU: string;
    directionalAccuracy: string;
    overall: string;
  };

  diebold: DMPairResult[];

  // Bilingual column headers for UI consumers.
  headers: {
    he: Record<string, string>;
    en: Record<string, string>;
  };
}

export interface RankedEntry {
  name: string;
  labelHe: string;
  labelEn: string;
  score: number; // normalized aggregate (lower = better)
  rank: number;
}

export interface DMPairResult {
  a: string;
  b: string;
  dmStatistic: number;
  pValue: number;
  h: number;
  verdict: {
    he: string;
    en: string;
  };
}

// ───────────────────────── Internals ─────────────────────────────────────

/** Finite check — rejects NaN, Infinity, undefined, null. */
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Validate that a vector is a non-empty array of finite numbers. */
function validateSeries(name: string, v: readonly unknown[]): number[] {
  if (!Array.isArray(v)) {
    throw new TypeError(
      `ForecastComparator: "${name}" must be an array of numbers / חובה להעביר מערך מספרי`,
    );
  }
  if (v.length === 0) {
    throw new RangeError(
      `ForecastComparator: "${name}" is empty / מערך ריק אינו תקף`,
    );
  }
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!isFiniteNumber(x)) {
      throw new RangeError(
        `ForecastComparator: "${name}"[${i}] is not a finite number / ערך לא מספרי באינדקס ${i}`,
      );
    }
    out[i] = x;
  }
  return out;
}

/** Arithmetic mean of a numeric vector. Empty → 0. */
function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

/** Sum of a numeric vector. */
function sum(xs: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s;
}

/** Sample variance (divides by n). Returns 0 for length ≤ 1. */
function varianceN(xs: readonly number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m;
    s += d * d;
  }
  return s / xs.length;
}

// ───────────────────────── Metric kernels ────────────────────────────────

/** Mean Absolute Error. */
export function computeMAE(actual: readonly number[], forecast: readonly number[]): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(actual[i] - forecast[i]);
  return s / n;
}

/** Root Mean Squared Error. */
export function computeRMSE(actual: readonly number[], forecast: readonly number[]): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = actual[i] - forecast[i];
    s += d * d;
  }
  return Math.sqrt(s / n);
}

/**
 * MAPE with zero-guard.
 *
 * Any index where |actual[i]| ≤ epsilon is dropped. The returned object
 * reports:
 *
 *   mape        — percent, averaged over the retained indices
 *   skipped     — number of dropped indices
 *   fallback    — true if ALL indices were dropped and we emit WAPE instead
 */
export function computeMAPEGuarded(
  actual: readonly number[],
  forecast: readonly number[],
  epsilon = 1e-9,
): { mape: number; skipped: number; fallback: boolean } {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return { mape: 0, skipped: 0, fallback: false };

  let acc = 0;
  let kept = 0;
  let skipped = 0;

  for (let i = 0; i < n; i++) {
    const a = actual[i];
    if (Math.abs(a) <= epsilon) {
      skipped++;
      continue;
    }
    acc += Math.abs((a - forecast[i]) / a);
    kept++;
  }

  if (kept === 0) {
    // Full fallback — return WAPE in percent (and flag it).
    return { mape: computeWAPE(actual, forecast), skipped, fallback: true };
  }
  return { mape: (acc / kept) * 100, skipped, fallback: false };
}

/**
 * Symmetric MAPE.
 * sMAPE_t = 2·|a-f| / (|a|+|f|),  clipped to 2 (200%) where denominator=0.
 */
export function computeSMAPE(
  actual: readonly number[],
  forecast: readonly number[],
  clipPercent = 200,
): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  const clipFraction = clipPercent / 100;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const f = forecast[i];
    const denom = (Math.abs(a) + Math.abs(f)) / 2;
    if (denom === 0) {
      // both series are zero at this point → no error contribution
      continue;
    }
    let term = Math.abs(a - f) / denom;
    if (term > clipFraction) term = clipFraction;
    s += term;
  }
  return (s / n) * 100;
}

/** Weighted Absolute Percentage Error = Σ|a-f| / Σ|a|. */
export function computeWAPE(
  actual: readonly number[],
  forecast: readonly number[],
): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += Math.abs(actual[i] - forecast[i]);
    den += Math.abs(actual[i]);
  }
  if (den === 0) return 0;
  return (num / den) * 100;
}

/**
 * MASE — Mean Absolute Scaled Error.
 *
 * Denominator = in-sample (seasonal) naive MAE of the `actual` series.
 * If `m >= actual.length`, falls back to m=1.
 * If the denominator is zero (flat series), returns 0 for a perfect
 * match and +∞ otherwise; +∞ is capped at Number.MAX_SAFE_INTEGER so
 * ranking arithmetic stays finite.
 */
export function computeMASE(
  actual: readonly number[],
  forecast: readonly number[],
  seasonality = 1,
): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;

  const m = Number.isInteger(seasonality) && seasonality >= 1 && seasonality < actual.length
    ? seasonality
    : 1;

  // in-sample naive MAE on the ACTUAL series
  let denomAcc = 0;
  let denomCount = 0;
  for (let i = m; i < actual.length; i++) {
    denomAcc += Math.abs(actual[i] - actual[i - m]);
    denomCount++;
  }
  const denom = denomCount === 0 ? 0 : denomAcc / denomCount;

  // numerator: MAE of the forecast
  let numAcc = 0;
  for (let i = 0; i < n; i++) numAcc += Math.abs(actual[i] - forecast[i]);
  const num = numAcc / n;

  if (denom === 0) {
    return num === 0 ? 0 : Number.MAX_SAFE_INTEGER;
  }
  return num / denom;
}

/**
 * Theil's U2 inequality coefficient.
 *
 *   U2 = RMSE(model) / RMSE(naive)
 *
 * The naive baseline is either the one provided in `ComparatorOptions.naiveValues`
 * or the canonical random-walk baseline  `naive[t] = actual[t-1]`
 * aligned so index 0 is skipped on both sides.
 */
export function computeTheilU(
  actual: readonly number[],
  forecast: readonly number[],
  naiveValues?: readonly number[],
): number {
  const n = Math.min(actual.length, forecast.length);
  if (n < 2) return 0;

  // Align windows so the random-walk baseline (which needs t-1) is valid.
  const startIdx = naiveValues ? 0 : 1;
  const aligned: number[] = [];
  const modelErrs: number[] = [];
  const naiveErrs: number[] = [];

  for (let i = startIdx; i < n; i++) {
    aligned.push(actual[i]);
    modelErrs.push(actual[i] - forecast[i]);
    const naiveAt = naiveValues ? naiveValues[i] : actual[i - 1];
    naiveErrs.push(actual[i] - naiveAt);
  }

  if (aligned.length === 0) return 0;

  const rmseModel = Math.sqrt(mean(modelErrs.map(e => e * e)));
  const rmseNaive = Math.sqrt(mean(naiveErrs.map(e => e * e)));

  if (rmseNaive === 0) {
    return rmseModel === 0 ? 0 : Number.MAX_SAFE_INTEGER;
  }
  return rmseModel / rmseNaive;
}

/**
 * Directional accuracy.
 *
 * Percentage of steps where `sign(actual[t]-actual[t-1])`
 * equals `sign(forecast[t]-actual[t-1])`. A tie (Δ=0) is counted as
 * matching if both directions are zero, otherwise mismatching.
 */
export function computeDirectionalAccuracy(
  actual: readonly number[],
  forecast: readonly number[],
): number {
  const n = Math.min(actual.length, forecast.length);
  if (n < 2) return 0;
  let hits = 0;
  let denom = 0;
  for (let i = 1; i < n; i++) {
    const da = Math.sign(actual[i] - actual[i - 1]);
    const df = Math.sign(forecast[i] - actual[i - 1]);
    if (da === df) hits++;
    denom++;
  }
  return denom === 0 ? 0 : (hits / denom) * 100;
}

// ───────────────────────── Diebold-Mariano test ──────────────────────────

/**
 * Standard normal PDF.
 */
function normalPDF(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF via Abramowitz & Stegun 7.1.26 (max error ≈ 1.5e-7).
 * Good enough for reporting a DM p-value.
 */
function normalCDF(x: number): number {
  // Save a call to erf; the A&S rational is fine.
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  // constants
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value for a standard-normal statistic. */
function twoSidedPValueNormal(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/**
 * Diebold-Mariano test of equal predictive accuracy, squared-error
 * loss, HAC-HLN variance. Returns the DM statistic and a two-sided
 * asymptotic p-value.
 *
 *    d_t = (a_t - f1_t)^2 - (a_t - f2_t)^2
 *    dbar = mean(d_t)
 *    gamma_k = autocovariance of d at lag k
 *    var_dbar = (1/n) * ( gamma_0 + 2 * Σ_{k=1..h-1} gamma_k )
 *    DM = dbar / sqrt(var_dbar)
 *
 * Harvey-Leybourne-Newbold small-sample correction:
 *
 *    DM* = DM * sqrt( (n + 1 - 2h + h*(h-1)/n) / n )
 */
export function dieboldMariano(
  actual: readonly number[],
  f1: readonly number[],
  f2: readonly number[],
  h = 1,
): { dmStatistic: number; pValue: number; n: number } {
  const n = Math.min(actual.length, f1.length, f2.length);
  if (n < 3) {
    return { dmStatistic: 0, pValue: 1, n };
  }

  const d: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e1 = actual[i] - f1[i];
    const e2 = actual[i] - f2[i];
    d[i] = e1 * e1 - e2 * e2;
  }

  const dbar = mean(d);
  const g0 = varianceN(d); // biased, divisor n (matches classical DM)

  // HAC sum of autocovariances up to lag h-1
  let hacSum = g0;
  for (let k = 1; k < h; k++) {
    let acc = 0;
    for (let t = k; t < n; t++) {
      acc += (d[t] - dbar) * (d[t - k] - dbar);
    }
    const gk = acc / n;
    hacSum += 2 * gk;
  }

  if (!(hacSum > 0)) {
    // degenerate (zero difference series, or numeric noise)
    return { dmStatistic: 0, pValue: 1, n };
  }

  const varDbar = hacSum / n;
  const dm = dbar / Math.sqrt(varDbar);

  // HLN small-sample correction
  const correction = Math.sqrt(
    (n + 1 - 2 * h + (h * (h - 1)) / n) / n,
  );
  const dmStar = dm * correction;

  return {
    dmStatistic: dmStar,
    pValue: twoSidedPValueNormal(dmStar),
    n,
  };
}

// ───────────────────────── Ranking helpers ───────────────────────────────

/**
 * Given a vector of rows and a "lower-is-better" column getter,
 * produce a 1-based rank (ties share the smaller rank).
 */
function rankLowerBetter<T>(rows: readonly T[], get: (r: T) => number): number[] {
  const indexed = rows.map((r, i) => ({ v: get(r), i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(rows.length);
  let currentRank = 1;
  for (let k = 0; k < indexed.length; k++) {
    if (k > 0 && indexed[k].v !== indexed[k - 1].v) currentRank = k + 1;
    ranks[indexed[k].i] = currentRank;
  }
  return ranks;
}

function rankHigherBetter<T>(rows: readonly T[], get: (r: T) => number): number[] {
  return rankLowerBetter(rows, r => -get(r));
}

function argminByKey<T>(rows: readonly T[], get: (r: T) => number): T {
  let best = rows[0];
  let bestV = get(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const v = get(rows[i]);
    if (v < bestV) {
      best = rows[i];
      bestV = v;
    }
  }
  return best;
}

function argmaxByKey<T>(rows: readonly T[], get: (r: T) => number): T {
  let best = rows[0];
  let bestV = get(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const v = get(rows[i]);
    if (v > bestV) {
      best = rows[i];
      bestV = v;
    }
  }
  return best;
}

// ───────────────────────── Bilingual labels ──────────────────────────────

/** Column headers used by UI tables and by the bilingual QA report. */
export const HEADERS_HE: Record<string, string> = {
  name: 'מודל',
  mae: 'שגיאה מוחלטת ממוצעת (MAE)',
  mape: 'שגיאה אחוזית מוחלטת (MAPE %)',
  smape: 'שגיאה אחוזית סימטרית (sMAPE %)',
  wape: 'שגיאה אחוזית משוקללת (WAPE %)',
  rmse: 'שורש שגיאה ריבועית (RMSE)',
  mase: 'שגיאה מנורמלת (MASE)',
  theilU: 'מקדם תאיל U',
  directionalAccuracy: 'דיוק כיווני (%)',
  rank: 'דירוג משוקלל',
  winner: 'המודל המנצח',
};

export const HEADERS_EN: Record<string, string> = {
  name: 'Model',
  mae: 'Mean Absolute Error (MAE)',
  mape: 'Mean Abs Percent Error (MAPE %)',
  smape: 'Symmetric MAPE (sMAPE %)',
  wape: 'Weighted Abs Percent Error (WAPE %)',
  rmse: 'Root Mean Squared Error (RMSE)',
  mase: 'Mean Abs Scaled Error (MASE)',
  theilU: "Theil's U",
  directionalAccuracy: 'Directional Accuracy (%)',
  rank: 'Weighted Rank',
  winner: 'Winner',
};

// ───────────────────────── Main class ────────────────────────────────────

/**
 * ForecastComparator — stateless façade that bundles:
 *
 *   • a `compare(actual, forecasts)` entry-point that evaluates every
 *     forecast against a single actual vector and produces a ranked
 *     table with bilingual labels,
 *
 *   • a `dieboldMariano(a, b)` pairwise helper for significance
 *     testing,
 *
 *   • and an individual static method for each metric for callers
 *     that want to wire a single number into a dashboard.
 */
export class ForecastComparator {
  private readonly options: Required<Omit<ComparatorOptions, 'naiveValues'>> & {
    naiveValues?: number[];
  };

  constructor(options: ComparatorOptions = {}) {
    this.options = {
      seasonality: options.seasonality ?? 1,
      mapeEpsilon: options.mapeEpsilon ?? 1e-9,
      smapeClipPercent: options.smapeClipPercent ?? 200,
      dmHorizon: options.dmHorizon ?? 1,
      naiveValues: options.naiveValues ? [...options.naiveValues] : undefined,
    };
  }

  /**
   * Evaluate every forecast in `forecasts` against `actual`, rank
   * them, pick per-metric winners, and run pairwise DM tests across
   * every unordered pair.
   */
  compare(actual: readonly number[], forecasts: readonly ForecastSeries[]): ComparisonResult {
    const act = validateSeries('actual', actual);

    if (!Array.isArray(forecasts) || forecasts.length === 0) {
      throw new RangeError(
        'ForecastComparator.compare: need at least one forecast / דרושה לפחות תחזית אחת',
      );
    }

    // Build per-forecast metric rows.
    const rows: MetricRow[] = forecasts.map((fs, idx) => {
      if (!fs || typeof fs.name !== 'string' || fs.name.length === 0) {
        throw new TypeError(
          `ForecastComparator.compare: forecast[${idx}] missing name / תחזית ללא שם`,
        );
      }
      const values = validateSeries(`forecasts[${idx}].values`, fs.values);
      if (values.length !== act.length) {
        throw new RangeError(
          `ForecastComparator.compare: forecast "${fs.name}" length ${values.length} ` +
            `does not match actual length ${act.length} / אורך התחזית אינו תואם לסדרת הערכים בפועל`,
        );
      }

      const { mape, skipped, fallback } = computeMAPEGuarded(
        act,
        values,
        this.options.mapeEpsilon,
      );

      return {
        name: fs.name,
        labelHe: fs.labelHe ?? fs.name,
        labelEn: fs.labelEn ?? fs.name,

        mae: computeMAE(act, values),
        mape,
        mapeSkipped: skipped,
        mapeFallback: fallback,
        smape: computeSMAPE(act, values, this.options.smapeClipPercent),
        wape: computeWAPE(act, values),
        rmse: computeRMSE(act, values),
        mase: computeMASE(act, values, this.options.seasonality),
        theilU: computeTheilU(act, values, this.options.naiveValues),
        directionalAccuracy: computeDirectionalAccuracy(act, values),

        n: values.length,
      };
    });

    // Per-metric winners.
    const winners = {
      mae: argminByKey(rows, r => r.mae).name,
      mape: argminByKey(rows, r => r.mape).name,
      smape: argminByKey(rows, r => r.smape).name,
      wape: argminByKey(rows, r => r.wape).name,
      rmse: argminByKey(rows, r => r.rmse).name,
      mase: argminByKey(rows, r => r.mase).name,
      theilU: argminByKey(rows, r => r.theilU).name,
      directionalAccuracy: argmaxByKey(rows, r => r.directionalAccuracy).name,
      overall: '',
    };

    // Aggregate rank = mean of per-metric ranks.
    const maeR = rankLowerBetter(rows, r => r.mae);
    const mapeR = rankLowerBetter(rows, r => r.mape);
    const smapeR = rankLowerBetter(rows, r => r.smape);
    const wapeR = rankLowerBetter(rows, r => r.wape);
    const rmseR = rankLowerBetter(rows, r => r.rmse);
    const maseR = rankLowerBetter(rows, r => r.mase);
    const theilR = rankLowerBetter(rows, r => r.theilU);
    const daR = rankHigherBetter(rows, r => r.directionalAccuracy);

    const ranked: RankedEntry[] = rows.map((r, i) => ({
      name: r.name,
      labelHe: r.labelHe,
      labelEn: r.labelEn,
      score:
        (maeR[i] +
          mapeR[i] +
          smapeR[i] +
          wapeR[i] +
          rmseR[i] +
          maseR[i] +
          theilR[i] +
          daR[i]) / 8,
      rank: 0,
    }));
    ranked.sort((a, b) => a.score - b.score);
    ranked.forEach((r, idx) => (r.rank = idx + 1));

    winners.overall = ranked[0]?.name ?? '';

    // Pairwise Diebold-Mariano tests.
    const diebold: DMPairResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i].name;
        const b = rows[j].name;
        const fa = forecasts[i].values;
        const fb = forecasts[j].values;
        const { dmStatistic, pValue } = dieboldMariano(act, fa, fb, this.options.dmHorizon);

        const significant = pValue < 0.05;
        const favorsA = dmStatistic < 0; // lower squared-error on model a
        const favoured = favorsA ? a : b;
        const loser = favorsA ? b : a;

        diebold.push({
          a,
          b,
          dmStatistic,
          pValue,
          h: this.options.dmHorizon,
          verdict: {
            he: significant
              ? `הבדל מובהק: ${favoured} עדיף על ${loser} (p=${pValue.toFixed(4)})`
              : `אין הבדל מובהק בין ${a} ל-${b} (p=${pValue.toFixed(4)})`,
            en: significant
              ? `Significant: ${favoured} beats ${loser} (p=${pValue.toFixed(4)})`
              : `No significant difference between ${a} and ${b} (p=${pValue.toFixed(4)})`,
          },
        });
      }
    }

    return {
      rows,
      ranked,
      winners,
      diebold,
      headers: { he: HEADERS_HE, en: HEADERS_EN },
    };
  }

  /**
   * Thin wrapper so external callers can run a DM test without
   * constructing a full comparison.
   */
  dieboldMariano(
    actual: readonly number[],
    f1: readonly number[],
    f2: readonly number[],
    h = this.options.dmHorizon,
  ): { dmStatistic: number; pValue: number; n: number } {
    return dieboldMariano(
      validateSeries('actual', actual),
      validateSeries('f1', f1),
      validateSeries('f2', f2),
      h,
    );
  }

  // Static mirrors so tests and consumers can dot-access.
  static mae = computeMAE;
  static rmse = computeRMSE;
  static mape = computeMAPEGuarded;
  static smape = computeSMAPE;
  static wape = computeWAPE;
  static mase = computeMASE;
  static theilU = computeTheilU;
  static directionalAccuracy = computeDirectionalAccuracy;
  static dieboldMariano = dieboldMariano;
}

export default ForecastComparator;
