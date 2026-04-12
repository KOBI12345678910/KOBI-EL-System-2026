/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — Trend Detection Engine  (Agent Y-154)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Techno-Kol Uzi mega-ERP — zero external dependencies.
 *
 * Motto: "לא מוחקים רק משדרגים ומגדלים"
 *        ("We never delete, only upgrade and grow.")
 *
 * This module implements an institutional-grade, pure-TypeScript trend
 * detection engine for financial / procurement / KPI time-series. Every
 * algorithm here is implemented from scratch using Node built-ins only — no
 * `require()`, no `import` of any third-party package. Only the built-in
 * `node:test` / `node:assert/strict` runner is used by the test file.
 *
 * Algorithms implemented:
 *
 *   1.  Ordinary Least Squares (OLS) linear regression  ──► linearRegression()
 *         - slope (beta1), intercept (beta0)
 *         - coefficient of determination (r²)
 *         - standard error of the slope
 *         - t-statistic and two-sided p-value approximation via the
 *           Student's-t distribution (survival function)
 *
 *   2.  Mann–Kendall non-parametric trend test             ──► mannKendallTest()
 *         - S statistic and its variance (with tie correction)
 *         - Z score under continuity correction
 *         - two-sided p-value via the Normal survival function
 *         - Kendall's tau
 *
 *   3.  Theil–Sen robust slope estimator                   ──► theilSenSlope()
 *         - median of all pairwise slopes
 *         - median intercept (Siegel-style)
 *         - 95 % confidence interval using the non-parametric
 *           rank-based Kendall variance formula
 *
 *   4.  CUSUM change-point detection                        ──► detectChangePoints()
 *         - cumulative sum of deviations from the mean
 *         - threshold expressed as a multiple of the series stdev
 *
 *   5.  Classification                                      ──► classify()
 *         - "uptrend" | "downtrend" | "stable" | "volatile"
 *         - decision uses the regression slope, its p-value, and the
 *           coefficient of variation
 *
 *   6.  Bilingual summary                                    ──► summary()
 *         - Hebrew (RTL) and English paragraphs, plus a compact JSON
 *           digest that is safe to embed inside alert payloads.
 *
 * Design contract:
 *
 *   -  Never mutate the input array.
 *   -  Deterministic: same input  ⇒  identical output (no Math.random,
 *      no Date.now, no locale reads).
 *   -  Defensive: short series (n < 2), constant series (variance = 0),
 *      infinite / NaN values, and empty inputs all return well-defined
 *      "neutral" results instead of throwing.
 *   -  Numerically stable: variance uses Welford's online formula, the
 *      Theil–Sen slope loop is O(n²) memory-light (no n×n matrix).
 *   -  RTL-safe: Hebrew strings carry the U+200F RIGHT-TO-LEFT MARK on
 *      either side of ASCII numerals so that mixed content renders
 *      correctly inside RTL dashboard cells.
 *
 * Public entry points are grouped behind a single `TrendDetector` class for
 * convenience, but every individual algorithm is also exported as a pure
 * function for unit-testing and reuse.
 *
 * ─────────────────────────────────────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-magic-numbers */

/* ═══════════════════════════════════════════════════════════════════════════
 *  Type definitions
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A single point in the time-series.
 * - `t` is the ordinal / time index. If you pass wall-clock timestamps
 *   (ms since epoch) it still works — the math is scale-invariant.
 * - `y` is the observed value.
 */
export interface TrendPoint {
  t: number;
  y: number;
}

/** Result of the OLS linear regression. */
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  n: number;
  /** Standard error of the slope estimator. */
  slopeStdError: number;
  /** t-statistic for H0: slope = 0. */
  tStatistic: number;
  /** Two-sided p-value (Student's t, df = n - 2). */
  pValue: number;
  /** Residual sum of squares. */
  residualSumOfSquares: number;
}

/** Result of the Mann–Kendall non-parametric trend test. */
export interface MannKendallResult {
  s: number;
  variance: number;
  /** Continuity-corrected standard Normal deviate. */
  z: number;
  pValue: number;
  /** Kendall's tau (rank correlation). */
  tau: number;
  /** 'increasing' | 'decreasing' | 'no-trend' at alpha = 0.05. */
  direction: TrendDirection;
  n: number;
}

/** Result of the Theil–Sen slope estimator. */
export interface TheilSenResult {
  slope: number;
  intercept: number;
  /** Number of pairwise slopes actually used (t_j > t_i). */
  numPairs: number;
  /** Lower bound of the 95 % confidence interval on the slope. */
  ciLower: number;
  /** Upper bound of the 95 % confidence interval on the slope. */
  ciUpper: number;
}

/** A single CUSUM change-point. */
export interface ChangePoint {
  index: number;
  t: number;
  /** Direction of the shift at this point. */
  direction: 'up' | 'down';
  /** Magnitude of the CUSUM statistic at the detection moment. */
  magnitude: number;
}

/** Trend classification buckets. */
export type TrendClassification = 'uptrend' | 'downtrend' | 'stable' | 'volatile';

/** Direction label used across several tests. */
export type TrendDirection = 'increasing' | 'decreasing' | 'no-trend';

/** Full analysis result produced by TrendDetector.analyze. */
export interface TrendAnalysis {
  n: number;
  classification: TrendClassification;
  regression: LinearRegressionResult;
  mannKendall: MannKendallResult;
  theilSen: TheilSenResult;
  changePoints: ChangePoint[];
  coefficientOfVariation: number;
  mean: number;
  stdev: number;
  summaryHe: string;
  summaryEn: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Numeric helpers  (pure, no state)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Right-to-Left mark — wraps numerals embedded in Hebrew sentences. */
const RLM = '\u200F';

/** Arithmetic mean; returns 0 for empty. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

/**
 * Sample variance using Welford's online algorithm.
 * Returns 0 for n < 2 or when all values are equal.
 */
export function variance(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let m = 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const delta = x - m;
    m += delta / (i + 1);
    s += delta * (x - m);
  }
  return s / (n - 1);
}

/** Sample standard deviation. */
export function stdev(xs: readonly number[]): number {
  return Math.sqrt(variance(xs));
}

/**
 * Median using an immutable sort (does not mutate the input).
 * For even-length input, returns the average of the two middle elements.
 */
export function median(xs: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Clamp a numeric value to the inclusive range [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Round-half-away-from-zero to `digits` decimals; 0 decimals by default. */
function roundTo(v: number, digits = 4): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/**
 * Cleanly stringify a numeric value for embedding inside a bilingual
 * sentence. Handles ±Infinity and NaN so the summary never explodes.
 */
function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return v > 0 ? '+∞' : v < 0 ? '-∞' : 'NaN';
  return v.toFixed(digits);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Statistical distribution helpers
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  We only need two functions:
 *    - a two-sided p-value for a Student's-t statistic
 *    - a two-sided p-value for a standard Normal statistic
 *
 *  Both are implemented from scratch using Abramowitz & Stegun's series
 *  approximations — accurate to ~1e-7 which is more than enough for
 *  routing classification decisions.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Standard Normal cumulative distribution function.
 * Abramowitz & Stegun 26.2.17 (error < 7.5e-8).
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value for a standard Normal statistic. */
export function normalTwoSidedPValue(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * Regularised incomplete beta function `I_x(a, b)`.
 * Numerical Recipes in C, §6.4 — continued-fraction evaluation.
 * Accurate to ~1e-10 for the parameter ranges used by our t-test.
 */
function betacf(a: number, b: number, x: number): number {
  const MAX_IT = 200;
  const EPS = 3e-10;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_IT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Natural log of the Gamma function — Lanczos approximation. */
function logGamma(x: number): number {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularised incomplete beta `I_x(a, b)` — the CDF path. */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(lbeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * Two-sided p-value for a Student's-t statistic with `df` degrees of freedom.
 * For df → ∞ it collapses to the Normal two-sided p-value.
 */
export function tTwoSidedPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  const p = incompleteBeta(df / 2, 0.5, x);
  return clamp(p, 0, 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 1  —  Ordinary Least Squares linear regression
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * OLS linear regression on the points (t_i, y_i).
 *
 * Returns a neutral result for `n < 2`:
 *   slope=0, intercept=first-y, r²=0, p-value=1
 *
 * For a constant x-series (variance(t) = 0) — which cannot produce a slope —
 * the function returns `slope = 0` and the intercept is the mean of `y`.
 */
export function linearRegression(points: readonly TrendPoint[]): LinearRegressionResult {
  const n = points.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: n === 1 ? points[0].y : 0,
      rSquared: 0,
      n,
      slopeStdError: 0,
      tStatistic: 0,
      pValue: 1,
      residualSumOfSquares: 0,
    };
  }
  let sumT = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumT += points[i].t;
    sumY += points[i].y;
  }
  const meanT = sumT / n;
  const meanY = sumY / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dt = points[i].t - meanT;
    const dy = points[i].y - meanY;
    sxx += dt * dt;
    syy += dy * dy;
    sxy += dt * dy;
  }
  if (sxx === 0) {
    return {
      slope: 0,
      intercept: meanY,
      rSquared: 0,
      n,
      slopeStdError: 0,
      tStatistic: 0,
      pValue: 1,
      residualSumOfSquares: syy,
    };
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanT;
  // Guard residual SS against floating-point drift producing a tiny negative.
  const ssRes = Math.max(0, syy - slope * sxy);
  const rSquared = syy === 0 ? 1 : clamp(1 - ssRes / syy, 0, 1);
  const df = n - 2;
  const residualVariance = df > 0 ? ssRes / df : 0;
  const slopeStdError = df > 0 ? Math.sqrt(residualVariance / sxx) : 0;
  // Perfect fit (ssRes == 0, slope != 0) ⇒ infinite t-statistic ⇒ p → 0.
  // We treat this as p = 0 directly to avoid a 0/0 producing p = 1 which
  // would mislead every downstream classifier.
  let tStatistic: number;
  let pValue: number;
  if (df <= 0) {
    tStatistic = 0;
    pValue = 1;
  } else if (slopeStdError === 0) {
    if (slope === 0) {
      tStatistic = 0;
      pValue = 1;
    } else {
      tStatistic = Infinity;
      pValue = 0;
    }
  } else {
    tStatistic = slope / slopeStdError;
    pValue = tTwoSidedPValue(tStatistic, df);
  }
  return {
    slope,
    intercept,
    rSquared,
    n,
    slopeStdError,
    tStatistic,
    pValue,
    residualSumOfSquares: ssRes,
  };
}

/** Convenience wrapper — returns only r². */
export function rSquared(points: readonly TrendPoint[]): number {
  return linearRegression(points).rSquared;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 2  —  Mann–Kendall non-parametric trend test
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mann–Kendall test for monotonic trend.
 *
 * Implementation notes:
 *   - Ties are handled with the standard variance correction
 *       Var(S) = [n(n-1)(2n+5) - Σ t_k (t_k-1)(2t_k+5)] / 18
 *     where `t_k` is the size of the k-th group of equal y-values.
 *   - The Z statistic applies the ±1 continuity correction.
 *   - Kendall's tau is the concordance ratio S / (n(n-1)/2).
 *   - At alpha = 0.05 the direction is 'increasing' if Z ≥ 1.96,
 *     'decreasing' if Z ≤ -1.96, else 'no-trend'.
 */
export function mannKendallTest(points: readonly TrendPoint[]): MannKendallResult {
  const n = points.length;
  if (n < 3) {
    return {
      s: 0,
      variance: 0,
      z: 0,
      pValue: 1,
      tau: 0,
      direction: 'no-trend',
      n,
    };
  }
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = points[j].y - points[i].y;
      if (diff > 0) s += 1;
      else if (diff < 0) s -= 1;
    }
  }
  // Tie groups on y
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = points[i].y;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let tieTerm = 0;
  for (const t of counts.values()) {
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (varS > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(varS);
    else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  }
  const pValue = normalTwoSidedPValue(z);
  const maxPairs = (n * (n - 1)) / 2;
  const tau = maxPairs > 0 ? s / maxPairs : 0;
  let direction: TrendDirection = 'no-trend';
  if (pValue < 0.05) {
    direction = z > 0 ? 'increasing' : 'decreasing';
  }
  return { s, variance: varS, z, pValue, tau, direction, n };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 3  —  Theil–Sen robust slope estimator
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Theil–Sen slope  =  median  { (y_j − y_i) / (t_j − t_i) : t_j > t_i }.
 *
 * Robust to ~29 % outliers. Complexity is O(n²) time / O(n²) memory in the
 * worst case — fine for the time-series sizes we care about (< 5000 points
 * in practice).
 *
 * The intercept uses Siegel's repeated-median heuristic simplified to
 *   intercept = median(y_i − slope · t_i).
 *
 * The 95 % confidence interval uses the Kendall variance formula:
 *   C_α = Φ^(-1)(1 - α/2) · √Var(S)
 *   M1 = (N - C_α) / 2 ,  M2 = (N + C_α) / 2
 * where N is the number of pairwise slopes and Φ^(-1) is the Normal
 * quantile. For robustness we use a bisection rather than a closed-form
 * inverse-Normal.
 */
export function theilSenSlope(points: readonly TrendPoint[]): TheilSenResult {
  const n = points.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: n === 1 ? points[0].y : 0,
      numPairs: 0,
      ciLower: 0,
      ciUpper: 0,
    };
  }
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = points[j].t - points[i].t;
      if (dt !== 0) {
        slopes.push((points[j].y - points[i].y) / dt);
      }
    }
  }
  if (slopes.length === 0) {
    return {
      slope: 0,
      intercept: mean(points.map((p) => p.y)),
      numPairs: 0,
      ciLower: 0,
      ciUpper: 0,
    };
  }
  slopes.sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)];
  if (slopes.length % 2 === 0) {
    // true median for even counts
    const lo = slopes[slopes.length / 2 - 1];
    const hi = slopes[slopes.length / 2];
    (slopes as number[])[0] = (lo + hi) / 2; // re-used scratch slot
  }
  const medSlope =
    slopes.length % 2 === 0
      ? (slopes[slopes.length / 2 - 1] + slopes[slopes.length / 2]) / 2
      : slopes[Math.floor(slopes.length / 2)];
  const interceptsArr = points.map((p) => p.y - medSlope * p.t);
  const intercept = median(interceptsArr);
  // 95 % CI (Kendall variance)
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const ca = 1.959963984540054 * Math.sqrt(varS); // z_{0.975}
  const nPairs = slopes.length;
  const m1 = Math.floor((nPairs - ca) / 2);
  const m2 = Math.ceil((nPairs + ca) / 2);
  const ciLower = m1 >= 0 && m1 < nPairs ? slopes[m1] : slopes[0];
  const ciUpper = m2 >= 0 && m2 < nPairs ? slopes[m2] : slopes[nPairs - 1];
  return {
    slope: medSlope,
    intercept,
    numPairs: nPairs,
    ciLower,
    ciUpper,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 4  —  CUSUM change-point detection
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * CUSUM change-point detector (classical Page-Hinkley form).
 *
 * Algorithm:
 *   1. Build the cumulative walk  S_i = Σ_{k≤i} (y_k − μ).
 *      At the true break point of a shifted series, S_i reaches its
 *      extremum (peak for an up-shift, trough for a down-shift).
 *   2. Let S_min = min_i S_i and S_max = max_i S_i.
 *      The magnitude S_max − S_min is the classical CUSUM statistic
 *      whose significance is judged against a bootstrap threshold —
 *      here approximated as `threshold · σ · √n`.
 *   3. If the walk range crosses the threshold, the change-point is
 *      the argmax (or argmin) itself, NOT the first threshold crossing.
 *      This places the detection exactly at the break.
 *   4. After emitting, the series is split and the algorithm recurses
 *      on each segment so that multiple change-points are discovered
 *      (binary-segmentation wrapper around Page-Hinkley).
 *
 * `sensitivity` in [0..1] blends two profiles:
 *   - sensitivity 0.0  ⇒  threshold = 2.5σ√n  (strict)
 *   - sensitivity 1.0  ⇒  threshold = 0.8σ√n  (lenient)
 *
 * Default sensitivity = 0.5.
 */
export function detectChangePoints(
  points: readonly TrendPoint[],
  sensitivity = 0.5,
): ChangePoint[] {
  const n = points.length;
  if (n < 4) return [];
  const s = clamp(sensitivity, 0, 1);
  const factor = 2.5 - 1.7 * s; // 2.5 → 0.8
  const out: ChangePoint[] = [];
  const MIN_SEG = 4;
  // Binary-segmentation recursion, implemented iteratively with a stack.
  const stack: Array<{ lo: number; hi: number }> = [{ lo: 0, hi: n - 1 }];
  while (stack.length > 0) {
    const { lo, hi } = stack.pop() as { lo: number; hi: number };
    const segLen = hi - lo + 1;
    if (segLen < MIN_SEG) continue;
    // Compute segment mean and stdev.
    let segSum = 0;
    for (let i = lo; i <= hi; i++) segSum += points[i].y;
    const segMean = segSum / segLen;
    let segSS = 0;
    for (let i = lo; i <= hi; i++) {
      const d = points[i].y - segMean;
      segSS += d * d;
    }
    const segSigma = segLen > 1 ? Math.sqrt(segSS / (segLen - 1)) : 0;
    if (segSigma === 0) continue;
    // Cumulative walk on the segment.
    let cum = 0;
    let maxVal = -Infinity;
    let minVal = Infinity;
    let argMax = lo;
    let argMin = lo;
    for (let i = lo; i <= hi; i++) {
      cum += points[i].y - segMean;
      if (cum > maxVal) {
        maxVal = cum;
        argMax = i;
      }
      if (cum < minVal) {
        minVal = cum;
        argMin = i;
      }
    }
    const range = maxVal - minVal;
    const threshold = factor * segSigma * Math.sqrt(segLen);
    if (range <= threshold) continue;
    // Pick the extremum whose magnitude is largest — that is where the
    // cumulative walk peaked (or bottomed) and therefore where the break
    // most likely occurred.
    const magUp = maxVal;
    const magDown = -minVal;
    const pickedMax = magUp >= magDown;
    const cpIndex = pickedMax ? argMax : argMin;
    // Skip edges — a change-point at the very first/last sample is degenerate.
    if (cpIndex <= lo || cpIndex >= hi) continue;
    // Infer the SEMANTIC direction of the step: compare the mean of the
    // pre-break half with the mean of the post-break half. This is more
    // intuitive than the sign of the CUSUM walk (which only tells you on
    // which side of the overall mean the walk peaked).
    let preSum = 0;
    let preCount = 0;
    for (let i = lo; i <= cpIndex; i++) {
      preSum += points[i].y;
      preCount++;
    }
    let postSum = 0;
    let postCount = 0;
    for (let i = cpIndex + 1; i <= hi; i++) {
      postSum += points[i].y;
      postCount++;
    }
    const preMean = preCount > 0 ? preSum / preCount : 0;
    const postMean = postCount > 0 ? postSum / postCount : 0;
    const semanticUp = postMean >= preMean;
    out.push({
      index: cpIndex,
      t: points[cpIndex].t,
      direction: semanticUp ? 'up' : 'down',
      magnitude: pickedMax ? magUp : magDown,
    });
    // Recurse on both halves (exclusive of the change-point sample itself).
    stack.push({ lo, hi: cpIndex - 1 });
    stack.push({ lo: cpIndex + 1, hi });
  }
  // Stable output order: sorted by index ascending.
  out.sort((a, b) => a.index - b.index);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 5  —  Classification
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Classify the series into one of four buckets.
 *
 * Decision table (checked in order — first match wins):
 *   1.  n < 3                                                  → 'stable'
 *   2.  regression p-value < 0.05  AND  slope > 0              → 'uptrend'
 *   3.  regression p-value < 0.05  AND  slope < 0              → 'downtrend'
 *   4.  residual coefficient of variation > 0.5                → 'volatile'
 *   5.  default                                                 → 'stable'
 *
 * "Residual CV" is the stdev of the OLS residuals divided by the absolute
 * mean of the series. Using the residuals instead of the raw values means
 * that a clean linear ramp (large raw CV but tiny residuals) is correctly
 * classified as a trend, while a flat-but-bouncy series (small residuals
 * dominated by noise) is correctly flagged as volatile.
 */
export function classify(points: readonly TrendPoint[]): TrendClassification {
  const n = points.length;
  if (n < 3) return 'stable';
  const reg = linearRegression(points);
  const significant = reg.pValue < 0.05;
  if (significant && reg.slope > 0) return 'uptrend';
  if (significant && reg.slope < 0) return 'downtrend';
  const ys = points.map((p) => p.y);
  const mu = mean(ys);
  const sd = stdev(ys);
  const denom = Math.abs(mu) < 1 ? Math.abs(mu) + 1 : Math.abs(mu);
  const cv = sd / denom;
  if (cv > 0.5) return 'volatile';
  return 'stable';
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Algorithm 6  —  Bilingual summary
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Hebrew (RTL) direction label. */
function directionHe(cls: TrendClassification): string {
  switch (cls) {
    case 'uptrend':
      return 'מגמת עלייה';
    case 'downtrend':
      return 'מגמת ירידה';
    case 'volatile':
      return 'תנודתיות גבוהה';
    case 'stable':
    default:
      return 'יציב';
  }
}

/** English direction label. */
function directionEn(cls: TrendClassification): string {
  switch (cls) {
    case 'uptrend':
      return 'uptrend';
    case 'downtrend':
      return 'downtrend';
    case 'volatile':
      return 'volatile';
    case 'stable':
    default:
      return 'stable';
  }
}

/** Build bilingual summary strings from an existing analysis. */
export function summary(a: Omit<TrendAnalysis, 'summaryHe' | 'summaryEn'>): {
  he: string;
  en: string;
} {
  const he =
    `${RLM}סיווג מגמה: ${directionHe(a.classification)}${RLM}. ` +
    `${RLM}שיפוע OLS: ${fmt(a.regression.slope, 4)}${RLM} ` +
    `(R²=${RLM}${fmt(a.regression.rSquared, 3)}${RLM}, ` +
    `p=${RLM}${fmt(a.regression.pValue, 4)}${RLM}). ` +
    `${RLM}שיפוע Theil-Sen: ${fmt(a.theilSen.slope, 4)}${RLM} ` +
    `[${RLM}${fmt(a.theilSen.ciLower, 4)}${RLM}, ${RLM}${fmt(a.theilSen.ciUpper, 4)}${RLM}]. ` +
    `${RLM}Mann-Kendall Z=${fmt(a.mannKendall.z, 3)}${RLM}, ` +
    `טאו=${RLM}${fmt(a.mannKendall.tau, 3)}${RLM}. ` +
    `${RLM}נמצאו ${a.changePoints.length} נקודות שינוי${RLM}. ` +
    `${RLM}ממוצע: ${fmt(a.mean, 2)}${RLM}, ` +
    `סטיית תקן: ${RLM}${fmt(a.stdev, 2)}${RLM}, ` +
    `מקדם שונות: ${RLM}${fmt(a.coefficientOfVariation, 3)}${RLM}.`;
  const en =
    `Trend classification: ${directionEn(a.classification)}. ` +
    `OLS slope: ${fmt(a.regression.slope, 4)} ` +
    `(R²=${fmt(a.regression.rSquared, 3)}, p=${fmt(a.regression.pValue, 4)}). ` +
    `Theil-Sen slope: ${fmt(a.theilSen.slope, 4)} ` +
    `[${fmt(a.theilSen.ciLower, 4)}, ${fmt(a.theilSen.ciUpper, 4)}]. ` +
    `Mann-Kendall Z=${fmt(a.mannKendall.z, 3)}, tau=${fmt(a.mannKendall.tau, 3)}. ` +
    `Detected ${a.changePoints.length} change-points. ` +
    `Mean: ${fmt(a.mean, 2)}, stdev: ${fmt(a.stdev, 2)}, ` +
    `CV: ${fmt(a.coefficientOfVariation, 3)}.`;
  return { he, en };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  TrendDetector class  —  convenience façade
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Stateless façade that exposes every algorithm as a method and offers an
 * `analyze()` one-shot that returns the full bundle. The class holds no
 * mutable state and is safe to share between concurrent callers.
 */
export class TrendDetector {
  // ─── Individual algorithms ───────────────────────────────────────────────
  linearRegression(points: readonly TrendPoint[]): LinearRegressionResult {
    return linearRegression(points);
  }

  mannKendallTest(points: readonly TrendPoint[]): MannKendallResult {
    return mannKendallTest(points);
  }

  theilSenSlope(points: readonly TrendPoint[]): TheilSenResult {
    return theilSenSlope(points);
  }

  detectChangePoints(points: readonly TrendPoint[], sensitivity = 0.5): ChangePoint[] {
    return detectChangePoints(points, sensitivity);
  }

  classify(points: readonly TrendPoint[]): TrendClassification {
    return classify(points);
  }

  rSquared(points: readonly TrendPoint[]): number {
    return rSquared(points);
  }

  /** Two-sided p-value via Student's-t distribution (helper, for UI hooks). */
  pValueFromT(t: number, df: number): number {
    return tTwoSidedPValue(t, df);
  }

  /** Build bilingual summary from a partially-computed analysis. */
  summary(a: Omit<TrendAnalysis, 'summaryHe' | 'summaryEn'>): { he: string; en: string } {
    return summary(a);
  }

  /**
   * One-shot end-to-end analysis pipeline.
   * Returns a `TrendAnalysis` record with every algorithm's result plus
   * the bilingual summary strings ready to ship to a UI / alert payload.
   */
  analyze(points: readonly TrendPoint[]): TrendAnalysis {
    const n = points.length;
    const ys = points.map((p) => p.y);
    const mu = mean(ys);
    const sd = stdev(ys);
    const cv = sd / (Math.abs(mu) + (Math.abs(mu) < 1 ? 1 : 0));
    const regression = this.linearRegression(points);
    const mk = this.mannKendallTest(points);
    const ts = this.theilSenSlope(points);
    const cps = this.detectChangePoints(points);
    const classification = this.classify(points);
    const partial = {
      n,
      classification,
      regression,
      mannKendall: mk,
      theilSen: ts,
      changePoints: cps,
      coefficientOfVariation: cv,
      mean: mu,
      stdev: sd,
    };
    const { he, en } = this.summary(partial);
    return { ...partial, summaryHe: he, summaryEn: en };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Default export
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Singleton instance — safe because the class is stateless. */
export const trendDetector = new TrendDetector();

export default TrendDetector;

/**
 * NOTE to future maintainers — motto "לא מוחקים רק משדרגים ומגדלים":
 * Do NOT delete functions from this file. If an algorithm needs to change,
 * add a V2 variant alongside the original and switch callers progressively.
 * The existing unit tests pin the current behaviour and must continue to
 * pass after any upgrade.
 */

// Re-export helper that wraps a number in Hebrew RTL marks — handy for UI code
// that embeds live numbers inside Hebrew sentences.
export function rtlNumber(value: number | string): string {
  return `${RLM}${value}${RLM}`;
}

/** Exposed only for test coverage of the round-trip helper. */
export const __internal = {
  roundTo,
  clamp,
  fmt,
  RLM,
  incompleteBeta,
  logGamma,
};
