/**
 * ONYX AI — Model Drift Detector
 * -------------------------------------------------------------
 * Agent: Y-164
 * System: Techno-Kol Uzi mega-ERP
 * Date:   2026-04-11
 *
 * Purpose
 * -------
 * Pure-TypeScript, zero-dependency statistical drift detector for
 * production ML models deployed inside ONYX AI. The detector compares
 * a baseline distribution (training / reference data) against a
 * current distribution (live / production data) and returns:
 *
 *   1. PSI  — Population Stability Index
 *   2. KS   — Kolmogorov-Smirnov two-sample test (numeric)
 *   3. Chi-square — Pearson's chi-square test (categorical / binned)
 *   4. Feature drift — per-feature rollup across all three tests
 *   5. Concept drift — target-variable / prediction drift signal
 *   6. Severity classification + alert triggering
 *
 * Design rules enforced by this file
 * ----------------------------------
 *   - Built-ins only. No npm dependencies beyond what onyx-ai already
 *     declares. All math is implemented in-house.
 *   - Never delete: additive evolution only. Every public surface is
 *     append-only and the module never mutates its inputs.
 *   - Bilingual. Every diagnostic carries Hebrew + English
 *     explanations, selectable via `lang: 'he' | 'en' | 'both'`.
 *   - Deterministic. Given the same inputs, the same output is
 *     returned (no Math.random, no wall-clock reads except in the
 *     top-level `generatedAt` timestamp which is opt-out via
 *     `opts.freezeClockAt`).
 *
 * Severity thresholds (Industry-standard PSI bands)
 * -------------------------------------------------
 *   PSI < 0.10           → 'stable'  (stable / יציב)
 *   0.10 ≤ PSI ≤ 0.25    → 'minor'   (drift קל)
 *   PSI > 0.25           → 'major'   (drift משמעותי)
 *
 * KS and chi-square supplement PSI: a feature is flagged as drifted
 * if ANY of the three tests crosses its threshold, but the overall
 * severity is bounded by the highest individual severity.
 *
 * Public API
 * ----------
 *   class DriftDetector {
 *     compareDistributions(baseline, current, opts?) → DriftReport
 *     detectFeatureDrift(baselineRecords, currentRecords, opts?)
 *     detectConceptDrift(baselinePredictions, currentPredictions, opts?)
 *     triggerAlerts(report) → DriftAlert[]
 *   }
 *
 *   Exported helpers (pure, stateless):
 *     computePSI, ksTwoSample, chiSquareTest,
 *     buildHistogram, percentile, ecdf
 * -------------------------------------------------------------
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

export type Lang = 'he' | 'en' | 'both';

/** Severity of drift — maps to PSI bands. */
export type DriftSeverity = 'stable' | 'minor' | 'major';

/** Which statistical test produced a finding. */
export type DriftTestKind = 'psi' | 'ks' | 'chi_square';

/** Shape of a single statistical finding. */
export interface DriftFinding {
  test: DriftTestKind;
  statistic: number;
  /** Threshold that was crossed (or not) to reach the severity. */
  threshold: number;
  /** Resulting severity band. */
  severity: DriftSeverity;
  /** p-value, when the test produces one. undefined for PSI. */
  pValue?: number;
  /** Degrees of freedom (chi-square only). */
  degreesOfFreedom?: number;
  /** Number of bins used (PSI / chi-square). */
  bins?: number;
  /** Bilingual explanation. */
  explanation_he: string;
  explanation_en: string;
}

/** A drift report for a single distribution pair (one feature). */
export interface DriftReport {
  feature?: string;
  kind: 'numeric' | 'categorical';
  sampleSizeBaseline: number;
  sampleSizeCurrent: number;
  findings: DriftFinding[];
  /** Worst severity across all findings. */
  overallSeverity: DriftSeverity;
  /** True when at least one finding crosses its threshold. */
  drifted: boolean;
  /** Bilingual human summary. */
  summary_he: string;
  summary_en: string;
  generatedAt: string;
}

/** Roll-up report for a full feature-matrix comparison. */
export interface FeatureDriftReport {
  generatedAt: string;
  features: Record<string, DriftReport>;
  driftedFeatures: string[];
  overallSeverity: DriftSeverity;
  summary_he: string;
  summary_en: string;
}

/** Concept-drift signal over a target / prediction column. */
export interface ConceptDriftReport extends DriftReport {
  target: string;
  /** True when the model output distribution itself moved. */
  conceptDrift: boolean;
}

/** Alert payload produced by triggerAlerts. */
export interface DriftAlert {
  level: 'info' | 'warn' | 'critical';
  severity: DriftSeverity;
  feature?: string;
  test: DriftTestKind | 'feature_rollup' | 'concept_drift';
  statistic?: number;
  threshold?: number;
  title_he: string;
  title_en: string;
  body_he: string;
  body_en: string;
  triggeredAt: string;
}

/** Options accepted by most public methods. */
export interface DriftOptions {
  lang?: Lang;
  /** Number of bins for PSI / chi-square numeric binning. Default 10. */
  bins?: number;
  /** KS critical-value alpha (0.05 → ~1.36 * sqrt(n+m/(nm))). */
  ksAlpha?: 0.1 | 0.05 | 0.01 | 0.005 | 0.001;
  /** Chi-square p-value alpha. Default 0.05. */
  chiAlpha?: number;
  /** PSI stable band upper bound. Default 0.10. */
  psiStableMax?: number;
  /** PSI minor band upper bound. Default 0.25. */
  psiMinorMax?: number;
  /** Freeze clock for deterministic output. ISO string. */
  freezeClockAt?: string;
  /** Smoothing epsilon to avoid log(0) / zero expected counts. */
  epsilon?: number;
  /** Optional explicit bin edges for numeric data (sorted ascending). */
  binEdges?: number[];
}

// -------------------------------------------------------------
// Defaults
// -------------------------------------------------------------

export const DRIFT_DEFAULTS = Object.freeze({
  bins: 10,
  ksAlpha: 0.05 as const,
  chiAlpha: 0.05,
  psiStableMax: 0.10,
  psiMinorMax: 0.25,
  epsilon: 1e-6,
});

/**
 * Two-sided KS critical-value coefficient c(alpha) such that
 *   D_crit = c(alpha) * sqrt((n+m) / (n*m))
 * Source: Smirnov, 1948, table reproduced in every stats text.
 */
const KS_C_ALPHA: Record<string, number> = {
  '0.1': 1.22,
  '0.05': 1.36,
  '0.01': 1.63,
  '0.005': 1.73,
  '0.001': 1.95,
};

// -------------------------------------------------------------
// Low-level numeric helpers (built-ins only)
// -------------------------------------------------------------

/**
 * Assert that the input is a finite numeric array. Returns a shallow
 * copy so downstream mutation is safe.
 */
function toFiniteNumbers(xs: readonly number[], label: string): number[] {
  if (!Array.isArray(xs)) {
    throw new TypeError(`${label} must be a number[]`);
  }
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(
        `${label}[${i}] is not a finite number (got ${String(v)})`,
      );
    }
    out.push(v);
  }
  return out;
}

/**
 * Min / max in one pass.
 */
function minMax(xs: readonly number[]): { min: number; max: number } {
  if (xs.length === 0) return { min: 0, max: 0 };
  let min = xs[0];
  let max = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const v = xs[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Sort-based percentile (linear interpolation). Accepts unsorted input.
 */
export function percentile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  if (q <= 0) return Math.min(...xs);
  if (q >= 1) return Math.max(...xs);
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Empirical CDF at value `x`. Returns fraction of samples <= x.
 */
export function ecdf(sortedXs: readonly number[], x: number): number {
  if (sortedXs.length === 0) return 0;
  // Binary search for the right-most index with value <= x.
  let lo = 0;
  let hi = sortedXs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedXs[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedXs.length;
}

/**
 * Build equal-width histogram bins. Returns bin edges of length
 * (bins + 1). Edges are derived from the union of both samples so
 * the baseline and current are always comparable under the same
 * partition.
 */
export function buildBinEdges(
  baseline: readonly number[],
  current: readonly number[],
  bins: number,
): number[] {
  if (bins < 1) throw new RangeError('bins must be >= 1');
  const all = baseline.concat(current);
  if (all.length === 0) return [0, 1];
  const { min, max } = minMax(all);
  if (min === max) {
    // Degenerate — give a tiny symmetric window so we still produce
    // `bins + 1` edges and every point lands in the central bin.
    const half = Math.max(1e-9, Math.abs(min) * 1e-6);
    const lo = min - half;
    const hi = max + half;
    const step = (hi - lo) / bins;
    return Array.from({ length: bins + 1 }, (_, i) => lo + step * i);
  }
  const step = (max - min) / bins;
  // Nudge the right-most edge so the max value lands inside the last
  // bin via the "value <= edge" rule.
  const edges: number[] = [];
  for (let i = 0; i <= bins; i++) edges.push(min + step * i);
  edges[bins] = max + step * 1e-9;
  return edges;
}

/**
 * Bucketise a numeric sample into the given bin edges. Returns the
 * raw counts (length == edges.length - 1).
 */
export function buildHistogram(
  xs: readonly number[],
  edges: readonly number[],
): number[] {
  const nBins = edges.length - 1;
  if (nBins < 1) throw new RangeError('edges must define at least 1 bin');
  const counts = new Array<number>(nBins).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    // Linear scan is fine for typical production drift jobs (10 bins).
    let placed = false;
    for (let b = 0; b < nBins; b++) {
      if (v <= edges[b + 1]) {
        counts[b]++;
        placed = true;
        break;
      }
    }
    if (!placed) counts[nBins - 1]++;
  }
  return counts;
}

/**
 * Compute categorical frequency tables aligned on the union of keys.
 * Returns two arrays of the same length plus the key order.
 */
export function alignCategoricalCounts(
  baseline: readonly string[],
  current: readonly string[],
): { keys: string[]; baseline: number[]; current: number[] } {
  const keys = new Set<string>();
  for (const v of baseline) keys.add(v);
  for (const v of current) keys.add(v);
  const orderedKeys = [...keys].sort();
  const baseMap = new Map<string, number>();
  const currMap = new Map<string, number>();
  for (const v of baseline) baseMap.set(v, (baseMap.get(v) ?? 0) + 1);
  for (const v of current) currMap.set(v, (currMap.get(v) ?? 0) + 1);
  return {
    keys: orderedKeys,
    baseline: orderedKeys.map((k) => baseMap.get(k) ?? 0),
    current: orderedKeys.map((k) => currMap.get(k) ?? 0),
  };
}

// -------------------------------------------------------------
// Test 1 — Population Stability Index (PSI)
// -------------------------------------------------------------

/**
 * Compute PSI between a baseline and a current histogram. The
 * histograms must have the same number of bins. Counts are converted
 * to proportions internally; smoothing is applied to empty bins so
 * that log is always defined.
 *
 *   PSI = Σ (p_curr - p_base) * ln(p_curr / p_base)
 */
export function computePSI(
  baselineCounts: readonly number[],
  currentCounts: readonly number[],
  epsilon: number = DRIFT_DEFAULTS.epsilon,
): number {
  if (baselineCounts.length !== currentCounts.length) {
    throw new RangeError(
      `PSI needs matching bin counts (baseline=${baselineCounts.length}, current=${currentCounts.length})`,
    );
  }
  if (baselineCounts.length === 0) return 0;
  const baseTot = baselineCounts.reduce((a, b) => a + b, 0);
  const currTot = currentCounts.reduce((a, b) => a + b, 0);
  if (baseTot <= 0 || currTot <= 0) return 0;
  let psi = 0;
  for (let i = 0; i < baselineCounts.length; i++) {
    const pBase = Math.max(epsilon, baselineCounts[i] / baseTot);
    const pCurr = Math.max(epsilon, currentCounts[i] / currTot);
    psi += (pCurr - pBase) * Math.log(pCurr / pBase);
  }
  return psi;
}

/**
 * Classify a PSI value into a severity band using the industry-
 * standard thresholds (10% / 25%) or caller-supplied cutoffs.
 */
export function psiSeverity(
  psi: number,
  stableMax: number = DRIFT_DEFAULTS.psiStableMax,
  minorMax: number = DRIFT_DEFAULTS.psiMinorMax,
): DriftSeverity {
  const mag = Math.abs(psi);
  if (mag < stableMax) return 'stable';
  if (mag <= minorMax) return 'minor';
  return 'major';
}

// -------------------------------------------------------------
// Test 2 — Kolmogorov-Smirnov two-sample
// -------------------------------------------------------------

export interface KSResult {
  statistic: number;
  criticalValue: number;
  pValue: number;
  n: number;
  m: number;
  reject: boolean;
  alpha: number;
}

/**
 * Two-sample Kolmogorov-Smirnov test (two-sided). Returns the
 * statistic D, an approximate p-value via the Marsaglia/Tsang
 * Q_KS series, and the critical value at the chosen alpha.
 */
export function ksTwoSample(
  baseline: readonly number[],
  current: readonly number[],
  alpha: 0.1 | 0.05 | 0.01 | 0.005 | 0.001 = DRIFT_DEFAULTS.ksAlpha,
): KSResult {
  const xs = [...baseline].sort((a, b) => a - b);
  const ys = [...current].sort((a, b) => a - b);
  const n = xs.length;
  const m = ys.length;
  if (n === 0 || m === 0) {
    return {
      statistic: 0,
      criticalValue: Infinity,
      pValue: 1,
      n,
      m,
      reject: false,
      alpha,
    };
  }
  // Merge scan. At every "event" (sample point) we compare the two
  // ECDFs and track the maximum absolute difference.
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < n && j < m) {
    const vx = xs[i];
    const vy = ys[j];
    if (vx <= vy) i++;
    if (vy <= vx) j++;
    const diff = Math.abs(i / n - j / m);
    if (diff > d) d = diff;
  }
  const c = KS_C_ALPHA[alpha.toString()];
  const crit = c * Math.sqrt((n + m) / (n * m));
  const pValue = ksPValue(d, n, m);
  return {
    statistic: d,
    criticalValue: crit,
    pValue,
    n,
    m,
    reject: d > crit,
    alpha,
  };
}

/**
 * Approximate two-sided KS p-value using the Marsaglia-style
 * Kolmogorov Q function:
 *
 *   Q(lambda) = 2 * Σ_{k=1..∞} (-1)^(k-1) * exp(-2 * k^2 * lambda^2)
 *
 * where lambda = (sqrt(en) + 0.12 + 0.11/sqrt(en)) * D
 * and en = sqrt(n*m / (n+m)).
 *
 * Series converges extremely fast (10 terms is more than enough for
 * double precision).
 */
function ksPValue(d: number, n: number, m: number): number {
  if (d <= 0) return 1;
  const en = Math.sqrt((n * m) / (n + m));
  const lambda = (en + 0.12 + 0.11 / en) * d;
  const l2 = -2 * lambda * lambda;
  let sum = 0;
  let sign = 1;
  for (let k = 1; k <= 100; k++) {
    const term = Math.exp(l2 * k * k);
    sum += sign * term;
    if (term < 1e-12) break;
    sign = -sign;
  }
  const p = 2 * sum;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

// -------------------------------------------------------------
// Test 3 — Pearson chi-square
// -------------------------------------------------------------

export interface ChiSquareResult {
  statistic: number;
  degreesOfFreedom: number;
  pValue: number;
  criticalValue: number;
  alpha: number;
  reject: boolean;
  cells: number;
}

/**
 * Pearson chi-square test of independence / goodness-of-fit on two
 * aligned count vectors. Treats `baselineCounts` as the reference
 * distribution and `currentCounts` as the observations.
 *
 *   χ² = Σ (O_i - E_i)^2 / E_i
 *
 * E_i is derived from the baseline proportions scaled to the
 * current total. Zero-count cells are handled two ways:
 *   1. Laplace (add-alpha) smoothing with α = 0.5 — the classic
 *      Krichevsky-Trofimov estimator — is applied to *both* count
 *      vectors before computing expected frequencies. This prevents
 *      the statistic from exploding on empty tail bins, which is
 *      the standard Cochran recommendation.
 *   2. Cells whose expected frequency remains below `epsilon` are
 *      dropped (and df is reduced accordingly) to avoid NaN.
 */
export function chiSquareTest(
  baselineCounts: readonly number[],
  currentCounts: readonly number[],
  alpha: number = DRIFT_DEFAULTS.chiAlpha,
  epsilon: number = DRIFT_DEFAULTS.epsilon,
): ChiSquareResult {
  if (baselineCounts.length !== currentCounts.length) {
    throw new RangeError('chi-square needs matching bin counts');
  }
  const k = baselineCounts.length;
  if (k < 2) {
    return {
      statistic: 0,
      degreesOfFreedom: 0,
      pValue: 1,
      criticalValue: Infinity,
      alpha,
      reject: false,
      cells: k,
    };
  }
  // Laplace smoothing — add 0.5 to every cell so empty tail bins do
  // not drive the statistic to infinity on otherwise-stable data.
  const SMOOTH = 0.5;
  const smoothedBase = baselineCounts.map((v) => v + SMOOTH);
  const smoothedCurr = currentCounts.map((v) => v + SMOOTH);
  const baseTot = smoothedBase.reduce((a, b) => a + b, 0);
  const currTot = smoothedCurr.reduce((a, b) => a + b, 0);
  if (baseTot <= 0 || currTot <= 0) {
    return {
      statistic: 0,
      degreesOfFreedom: k - 1,
      pValue: 1,
      criticalValue: Infinity,
      alpha,
      reject: false,
      cells: k,
    };
  }
  let chi = 0;
  let usedCells = 0;
  for (let i = 0; i < k; i++) {
    const expected = (smoothedBase[i] / baseTot) * currTot;
    if (expected < epsilon) continue;
    const diff = smoothedCurr[i] - expected;
    chi += (diff * diff) / expected;
    usedCells++;
  }
  const df = Math.max(1, usedCells - 1);
  const pValue = chiSquarePValue(chi, df);
  const criticalValue = chiSquareCriticalValue(df, alpha);
  return {
    statistic: chi,
    degreesOfFreedom: df,
    pValue,
    criticalValue,
    alpha,
    reject: pValue < alpha,
    cells: k,
  };
}

/**
 * Lower regularised incomplete gamma P(a, x), used for chi-square
 * CDF = P(df/2, x/2). Two branches (series / continued fraction)
 * cover the full range of (a, x).
 *
 * This is a direct, self-contained port of "Numerical Recipes in C",
 * 2nd ed., §6.2 — no third-party code imported.
 */
function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series representation.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction.
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  return 1 - q;
}

/**
 * Lanczos approximation to log Γ(z). Good to ~15 digits for z > 0.
 */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    // Reflection formula for z < 0.5.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
    );
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Chi-square CDF → p-value (upper tail).
 */
function chiSquarePValue(chi: number, df: number): number {
  if (chi <= 0 || df <= 0) return 1;
  return 1 - gammaP(df / 2, chi / 2);
}

/**
 * Invert the chi-square CDF to obtain the critical value at `alpha`.
 * Bisection on [0, 10*df] is ample for df ≤ 100, which covers every
 * realistic drift use-case. Returns +Infinity when the inversion
 * cannot converge.
 */
function chiSquareCriticalValue(df: number, alpha: number): number {
  if (df <= 0) return Infinity;
  let lo = 0;
  let hi = Math.max(10, 10 * df);
  // Expand upper bound if needed.
  while (1 - gammaP(df / 2, hi / 2) > alpha && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const upper = 1 - gammaP(df / 2, mid / 2);
    if (Math.abs(upper - alpha) < 1e-8) return mid;
    if (upper > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// -------------------------------------------------------------
// Bilingual messaging helpers
// -------------------------------------------------------------

/**
 * Severity → bilingual label.
 */
function severityLabel(sev: DriftSeverity): { he: string; en: string } {
  switch (sev) {
    case 'stable':
      return { he: 'יציב', en: 'stable' };
    case 'minor':
      return { he: 'סחיפה קלה', en: 'minor drift' };
    case 'major':
      return { he: 'סחיפה משמעותית', en: 'major drift' };
  }
}

/**
 * Build bilingual explanation for a PSI finding.
 */
function psiExplain(
  psi: number,
  sev: DriftSeverity,
  bins: number,
): { he: string; en: string } {
  const label = severityLabel(sev);
  const psiStr = psi.toFixed(4);
  return {
    he: `PSI = ${psiStr} על פני ${bins} פחים → ${label.he}`,
    en: `PSI = ${psiStr} over ${bins} bins → ${label.en}`,
  };
}

function ksExplain(
  d: number,
  pValue: number,
  sev: DriftSeverity,
): { he: string; en: string } {
  const label = severityLabel(sev);
  return {
    he: `KS D = ${d.toFixed(4)}, p = ${pValue.toFixed(4)} → ${label.he}`,
    en: `KS D = ${d.toFixed(4)}, p = ${pValue.toFixed(4)} → ${label.en}`,
  };
}

function chiExplain(
  chi: number,
  df: number,
  pValue: number,
  sev: DriftSeverity,
): { he: string; en: string } {
  const label = severityLabel(sev);
  return {
    he: `χ² = ${chi.toFixed(4)}, df = ${df}, p = ${pValue.toFixed(4)} → ${label.he}`,
    en: `chi² = ${chi.toFixed(4)}, df = ${df}, p = ${pValue.toFixed(4)} → ${label.en}`,
  };
}

/**
 * Reduce an array of severities to the worst one.
 */
function worstSeverity(sevs: readonly DriftSeverity[]): DriftSeverity {
  let worst: DriftSeverity = 'stable';
  for (const s of sevs) {
    if (s === 'major') return 'major';
    if (s === 'minor' && worst === 'stable') worst = 'minor';
  }
  return worst;
}

/**
 * Map a KS / chi-square p-value to the same three-band severity as
 * PSI, using conservative cut-points so that a purely statistical
 * "significant" result does not escalate to 'major' unless the
 * effect size is also large (p < 1e-4).
 *
 * The conservative cut-points (0.01 / 0.0001) match how ML drift
 * monitors are tuned in production: PSI is the primary tool, KS and
 * chi-square only corroborate. They should rarely disagree with PSI.
 */
function severityFromPValue(p: number): DriftSeverity {
  if (p >= 0.01) return 'stable';
  if (p >= 0.0001) return 'minor';
  return 'major';
}

/**
 * Resolve the clock in a deterministic-friendly way.
 */
function resolveNow(opts?: DriftOptions): string {
  if (opts?.freezeClockAt) return opts.freezeClockAt;
  return new Date().toISOString();
}

// -------------------------------------------------------------
// Public class — DriftDetector
// -------------------------------------------------------------

export class DriftDetector {
  private readonly lang: Lang;
  private readonly bins: number;
  private readonly ksAlpha: 0.1 | 0.05 | 0.01 | 0.005 | 0.001;
  private readonly chiAlpha: number;
  private readonly psiStableMax: number;
  private readonly psiMinorMax: number;
  private readonly epsilon: number;
  private readonly freezeClockAt?: string;

  constructor(defaults: DriftOptions = {}) {
    this.lang = defaults.lang ?? 'both';
    this.bins = defaults.bins ?? DRIFT_DEFAULTS.bins;
    this.ksAlpha = defaults.ksAlpha ?? DRIFT_DEFAULTS.ksAlpha;
    this.chiAlpha = defaults.chiAlpha ?? DRIFT_DEFAULTS.chiAlpha;
    this.psiStableMax = defaults.psiStableMax ?? DRIFT_DEFAULTS.psiStableMax;
    this.psiMinorMax = defaults.psiMinorMax ?? DRIFT_DEFAULTS.psiMinorMax;
    this.epsilon = defaults.epsilon ?? DRIFT_DEFAULTS.epsilon;
    this.freezeClockAt = defaults.freezeClockAt;
  }

  /**
   * Resolve per-call options on top of the constructor defaults.
   */
  private resolve(opts?: DriftOptions): Required<Omit<DriftOptions, 'freezeClockAt' | 'binEdges'>> & Pick<DriftOptions, 'freezeClockAt' | 'binEdges'> {
    return {
      lang: opts?.lang ?? this.lang,
      bins: opts?.bins ?? this.bins,
      ksAlpha: opts?.ksAlpha ?? this.ksAlpha,
      chiAlpha: opts?.chiAlpha ?? this.chiAlpha,
      psiStableMax: opts?.psiStableMax ?? this.psiStableMax,
      psiMinorMax: opts?.psiMinorMax ?? this.psiMinorMax,
      epsilon: opts?.epsilon ?? this.epsilon,
      freezeClockAt: opts?.freezeClockAt ?? this.freezeClockAt,
      binEdges: opts?.binEdges,
    };
  }

  /**
   * Compare two distributions and return a full drift report that
   * contains PSI, KS (numeric only) and chi-square findings.
   */
  compareDistributions(
    baseline: readonly number[] | readonly string[],
    current: readonly number[] | readonly string[],
    opts?: DriftOptions,
  ): DriftReport {
    const cfg = this.resolve(opts);
    const kind = this.detectKind(baseline, current);

    if (kind === 'numeric') {
      const b = toFiniteNumbers(baseline as number[], 'baseline');
      const c = toFiniteNumbers(current as number[], 'current');
      return this.compareNumeric(b, c, cfg);
    }
    return this.compareCategorical(
      baseline as readonly string[],
      current as readonly string[],
      cfg,
    );
  }

  /**
   * Run drift detection over a feature matrix. Each feature's values
   * are pulled from the supplied record arrays and passed through
   * compareDistributions.
   */
  detectFeatureDrift(
    baseline: ReadonlyArray<Record<string, any>>,
    current: ReadonlyArray<Record<string, any>>,
    featureNames?: readonly string[],
    opts?: DriftOptions,
  ): FeatureDriftReport {
    const cfg = this.resolve(opts);
    const features =
      featureNames && featureNames.length > 0
        ? [...featureNames]
        : this.inferFeatureNames(baseline, current);

    const out: Record<string, DriftReport> = {};
    const driftedFeatures: string[] = [];
    const sevList: DriftSeverity[] = [];

    for (const feat of features) {
      const bVals = this.extractColumn(baseline, feat);
      const cVals = this.extractColumn(current, feat);
      const report = this.compareDistributions(bVals, cVals, cfg);
      report.feature = feat;
      out[feat] = report;
      sevList.push(report.overallSeverity);
      if (report.drifted) driftedFeatures.push(feat);
    }

    const overall = worstSeverity(sevList);
    const overallLabel = severityLabel(overall);
    const generatedAt = resolveNow(cfg);
    return {
      generatedAt,
      features: out,
      driftedFeatures,
      overallSeverity: overall,
      summary_he: `נסרקו ${features.length} תכונות — סטטוס כולל: ${overallLabel.he} (${driftedFeatures.length} עם סחיפה)`,
      summary_en: `Scanned ${features.length} features — overall: ${overallLabel.en} (${driftedFeatures.length} drifted)`,
    };
  }

  /**
   * Concept-drift: compare target / prediction distributions between
   * baseline and current model outputs. A wrapper around
   * compareDistributions that annotates the report with `target`
   * and a boolean `conceptDrift` flag for alert routing.
   */
  detectConceptDrift(
    baselinePredictions: readonly number[] | readonly string[],
    currentPredictions: readonly number[] | readonly string[],
    target = 'prediction',
    opts?: DriftOptions,
  ): ConceptDriftReport {
    const report = this.compareDistributions(
      baselinePredictions,
      currentPredictions,
      opts,
    );
    const conceptDrift = report.drifted;
    const label = severityLabel(report.overallSeverity);
    return {
      ...report,
      target,
      conceptDrift,
      summary_he: `סחיפת מושג עבור "${target}": ${label.he} — ${conceptDrift ? 'זוהתה' : 'לא זוהתה'}`,
      summary_en: `Concept drift on "${target}": ${label.en} — ${conceptDrift ? 'detected' : 'none'}`,
    };
  }

  /**
   * Convert a DriftReport or FeatureDriftReport (or concept report)
   * into an array of alerts that routing layers can forward to
   * channels (email, Slack, on-call, dashboards, ...). Alerts are
   * bilingual.
   */
  triggerAlerts(
    report: DriftReport | FeatureDriftReport | ConceptDriftReport,
  ): DriftAlert[] {
    const alerts: DriftAlert[] = [];
    const now =
      'generatedAt' in report && report.generatedAt
        ? report.generatedAt
        : new Date().toISOString();

    if ('features' in report) {
      // Feature-drift rollup.
      for (const [feat, inner] of Object.entries(report.features)) {
        if (!inner.drifted) continue;
        const level = inner.overallSeverity === 'major' ? 'critical' : 'warn';
        const label = severityLabel(inner.overallSeverity);
        alerts.push({
          level,
          severity: inner.overallSeverity,
          feature: feat,
          test: 'feature_rollup',
          triggeredAt: now,
          title_he: `סחיפה ב-${feat}: ${label.he}`,
          title_en: `Drift on ${feat}: ${label.en}`,
          body_he: inner.summary_he,
          body_en: inner.summary_en,
        });
      }
      if (report.overallSeverity !== 'stable') {
        const label = severityLabel(report.overallSeverity);
        alerts.push({
          level: report.overallSeverity === 'major' ? 'critical' : 'warn',
          severity: report.overallSeverity,
          test: 'feature_rollup',
          triggeredAt: now,
          title_he: `סיכום סחיפה: ${label.he}`,
          title_en: `Drift summary: ${label.en}`,
          body_he: report.summary_he,
          body_en: report.summary_en,
        });
      }
      return alerts;
    }

    // Single DriftReport (possibly a ConceptDriftReport).
    const isConcept = 'conceptDrift' in report;
    for (const f of report.findings) {
      if (f.severity === 'stable') continue;
      const level =
        f.severity === 'major'
          ? 'critical'
          : f.severity === 'minor'
          ? 'warn'
          : 'info';
      alerts.push({
        level,
        severity: f.severity,
        feature: report.feature,
        test: isConcept ? 'concept_drift' : f.test,
        statistic: f.statistic,
        threshold: f.threshold,
        triggeredAt: now,
        title_he: `${isConcept ? 'סחיפת מושג' : 'סחיפה'}: ${severityLabel(f.severity).he}`,
        title_en: `${isConcept ? 'Concept drift' : 'Drift'}: ${severityLabel(f.severity).en}`,
        body_he: f.explanation_he,
        body_en: f.explanation_en,
      });
    }
    return alerts;
  }

  // ------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------

  private detectKind(
    baseline: readonly unknown[],
    current: readonly unknown[],
  ): 'numeric' | 'categorical' {
    const sample = baseline.length > 0 ? baseline[0] : current[0];
    if (typeof sample === 'number') return 'numeric';
    return 'categorical';
  }

  private inferFeatureNames(
    baseline: ReadonlyArray<Record<string, any>>,
    current: ReadonlyArray<Record<string, any>>,
  ): string[] {
    const keys = new Set<string>();
    for (const r of baseline) for (const k of Object.keys(r)) keys.add(k);
    for (const r of current) for (const k of Object.keys(r)) keys.add(k);
    return [...keys].sort();
  }

  private extractColumn(
    rows: ReadonlyArray<Record<string, any>>,
    feature: string,
  ): any[] {
    const out: any[] = [];
    for (const r of rows) {
      const v = r[feature];
      if (v === null || v === undefined) continue;
      out.push(v);
    }
    return out;
  }

  private compareNumeric(
    baseline: readonly number[],
    current: readonly number[],
    cfg: Required<Omit<DriftOptions, 'freezeClockAt' | 'binEdges'>> &
      Pick<DriftOptions, 'freezeClockAt' | 'binEdges'>,
  ): DriftReport {
    const edges =
      cfg.binEdges && cfg.binEdges.length >= 2
        ? [...cfg.binEdges]
        : buildBinEdges(baseline, current, cfg.bins);
    const baseHist = buildHistogram(baseline, edges);
    const currHist = buildHistogram(current, edges);

    // PSI
    const psi = computePSI(baseHist, currHist, cfg.epsilon);
    const psiSev = psiSeverity(psi, cfg.psiStableMax, cfg.psiMinorMax);
    const psiMsg = psiExplain(psi, psiSev, edges.length - 1);
    const psiFinding: DriftFinding = {
      test: 'psi',
      statistic: psi,
      threshold: cfg.psiStableMax,
      severity: psiSev,
      bins: edges.length - 1,
      explanation_he: psiMsg.he,
      explanation_en: psiMsg.en,
    };

    // KS
    const ks = ksTwoSample(baseline, current, cfg.ksAlpha);
    const ksSev: DriftSeverity = ks.reject
      ? severityFromPValue(ks.pValue)
      : 'stable';
    const ksMsg = ksExplain(ks.statistic, ks.pValue, ksSev);
    const ksFinding: DriftFinding = {
      test: 'ks',
      statistic: ks.statistic,
      threshold: ks.criticalValue,
      severity: ksSev,
      pValue: ks.pValue,
      explanation_he: ksMsg.he,
      explanation_en: ksMsg.en,
    };

    // Chi-square (on the same histogram)
    const chi = chiSquareTest(baseHist, currHist, cfg.chiAlpha, cfg.epsilon);
    const chiSev: DriftSeverity = chi.reject
      ? severityFromPValue(chi.pValue)
      : 'stable';
    const chiMsg = chiExplain(
      chi.statistic,
      chi.degreesOfFreedom,
      chi.pValue,
      chiSev,
    );
    const chiFinding: DriftFinding = {
      test: 'chi_square',
      statistic: chi.statistic,
      threshold: chi.criticalValue,
      severity: chiSev,
      pValue: chi.pValue,
      degreesOfFreedom: chi.degreesOfFreedom,
      bins: edges.length - 1,
      explanation_he: chiMsg.he,
      explanation_en: chiMsg.en,
    };

    const findings = [psiFinding, ksFinding, chiFinding];
    const overall = worstSeverity(findings.map((f) => f.severity));
    const label = severityLabel(overall);
    const drifted = overall !== 'stable';
    const now = resolveNow(cfg);
    return {
      kind: 'numeric',
      sampleSizeBaseline: baseline.length,
      sampleSizeCurrent: current.length,
      findings,
      overallSeverity: overall,
      drifted,
      summary_he: `סחיפה נומרית — ${label.he}. PSI=${psi.toFixed(4)}, KS D=${ks.statistic.toFixed(
        4,
      )} (p=${ks.pValue.toFixed(4)}), χ²=${chi.statistic.toFixed(
        4,
      )} (df=${chi.degreesOfFreedom}, p=${chi.pValue.toFixed(4)})`,
      summary_en: `Numeric drift — ${label.en}. PSI=${psi.toFixed(4)}, KS D=${ks.statistic.toFixed(
        4,
      )} (p=${ks.pValue.toFixed(4)}), chi²=${chi.statistic.toFixed(
        4,
      )} (df=${chi.degreesOfFreedom}, p=${chi.pValue.toFixed(4)})`,
      generatedAt: now,
    };
  }

  private compareCategorical(
    baseline: readonly string[],
    current: readonly string[],
    cfg: Required<Omit<DriftOptions, 'freezeClockAt' | 'binEdges'>> &
      Pick<DriftOptions, 'freezeClockAt' | 'binEdges'>,
  ): DriftReport {
    const aligned = alignCategoricalCounts(baseline, current);
    const psi = computePSI(aligned.baseline, aligned.current, cfg.epsilon);
    const psiSev = psiSeverity(psi, cfg.psiStableMax, cfg.psiMinorMax);
    const psiMsg = psiExplain(psi, psiSev, aligned.keys.length);
    const psiFinding: DriftFinding = {
      test: 'psi',
      statistic: psi,
      threshold: cfg.psiStableMax,
      severity: psiSev,
      bins: aligned.keys.length,
      explanation_he: psiMsg.he,
      explanation_en: psiMsg.en,
    };

    const chi = chiSquareTest(
      aligned.baseline,
      aligned.current,
      cfg.chiAlpha,
      cfg.epsilon,
    );
    const chiSev: DriftSeverity = chi.reject
      ? severityFromPValue(chi.pValue)
      : 'stable';
    const chiMsg = chiExplain(
      chi.statistic,
      chi.degreesOfFreedom,
      chi.pValue,
      chiSev,
    );
    const chiFinding: DriftFinding = {
      test: 'chi_square',
      statistic: chi.statistic,
      threshold: chi.criticalValue,
      severity: chiSev,
      pValue: chi.pValue,
      degreesOfFreedom: chi.degreesOfFreedom,
      bins: aligned.keys.length,
      explanation_he: chiMsg.he,
      explanation_en: chiMsg.en,
    };

    // KS is not meaningful for unordered categorical data, so we emit
    // a "stable/placeholder" finding that tests can still inspect
    // and that alerting never escalates on.
    const ksFinding: DriftFinding = {
      test: 'ks',
      statistic: 0,
      threshold: Infinity,
      severity: 'stable',
      pValue: 1,
      explanation_he: 'KS לא ישים על נתונים קטגוריאליים',
      explanation_en: 'KS not applicable to categorical data',
    };

    const findings = [psiFinding, ksFinding, chiFinding];
    const overall = worstSeverity(findings.map((f) => f.severity));
    const label = severityLabel(overall);
    const drifted = overall !== 'stable';
    const now = resolveNow(cfg);
    return {
      kind: 'categorical',
      sampleSizeBaseline: baseline.length,
      sampleSizeCurrent: current.length,
      findings,
      overallSeverity: overall,
      drifted,
      summary_he: `סחיפה קטגוריאלית — ${label.he}. PSI=${psi.toFixed(4)}, χ²=${chi.statistic.toFixed(
        4,
      )} (df=${chi.degreesOfFreedom}, p=${chi.pValue.toFixed(4)})`,
      summary_en: `Categorical drift — ${label.en}. PSI=${psi.toFixed(4)}, chi²=${chi.statistic.toFixed(
        4,
      )} (df=${chi.degreesOfFreedom}, p=${chi.pValue.toFixed(4)})`,
      generatedAt: now,
    };
  }
}

// -------------------------------------------------------------
// Default export convenience — a ready-to-use detector instance
// with the Techno-Kol production defaults. Users who need custom
// thresholds should instantiate DriftDetector directly.
// -------------------------------------------------------------

export const defaultDriftDetector = new DriftDetector();
