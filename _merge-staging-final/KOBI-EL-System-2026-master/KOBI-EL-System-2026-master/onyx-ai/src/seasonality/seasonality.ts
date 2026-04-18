/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI / Techno-Kol Uzi — Seasonality Decomposition (STL-lite)
 * Agent Y-155
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Classical additive decomposition:    Y(t) = T(t) + S(t) + R(t)
 *   - T(t): Trend        → centered moving average of window = period
 *   - S(t): Seasonality  → mean of de-trended values grouped by period index
 *   - R(t): Residual     → Y - T - S  (unexplained noise / shocks)
 *
 * Period detection is via normalized autocorrelation (ACF) with plausible
 * lag candidates: weekly (7), monthly (~30), yearly (~365).
 *
 * Hebrew calendar holiday flags:
 *   - Rosh HaShana, Yom Kippur, Sukkot, Chol HaMoed Sukkot, Pesach,
 *     Chol HaMoed Pesach, Shavuot.
 *   - We ship a pre-computed Gregorian approximation table for years
 *     5785→5792 (2024/25 → 2031/32). If your date is outside the bundled
 *     range, you can INJECT a custom calendar via `ctx.hebrewCalendar` to
 *     stay future-proof.
 *
 * Design rules:
 *   - "לא מוחקים רק משדרגים ומגדלים" — no deletions, only extensions.
 *   - Zero external dependencies (pure TypeScript, Node builtins only).
 *   - Bilingual (he/en) messaging ready — see `SeasonalityReport.messages`.
 *   - Deterministic and pure: same input → same output.
 *
 * Sister module: `src/modules/anomaly-detection` (Agent 100).
 * Residuals from this decomposition feed that detector cleanly.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A single observation in the time series.
 * The `date` is optional — if provided, Hebrew holiday flagging is possible.
 */
export interface TimeSeriesPoint {
  /** Gregorian date (Date object OR ISO-8601 'YYYY-MM-DD' string). */
  readonly date?: Date | string;
  /** The observed numeric value (e.g. daily revenue, procurement volume). */
  readonly value: number;
}

/**
 * Detected periodicity candidate with its autocorrelation strength.
 */
export interface PeriodCandidate {
  readonly lag: number;
  readonly label: 'weekly' | 'monthly' | 'yearly' | 'custom';
  /** Pearson autocorrelation in [-1, 1]. Higher = stronger seasonality. */
  readonly acf: number;
}

/**
 * Hebrew-calendar boolean flags for a single observation.
 * All fields are optional — absent means "no flag / unknown".
 */
export interface HebrewHolidayFlags {
  readonly roshHaShana?: boolean;
  readonly yomKippur?: boolean;
  readonly sukkot?: boolean;
  readonly cholHamoedSukkot?: boolean;
  readonly pesach?: boolean;
  readonly cholHamoedPesach?: boolean;
  readonly shavuot?: boolean;
  /** True on any chol-hamoed day (Sukkot or Pesach). */
  readonly cholHamoed?: boolean;
  /** True on any major holiday day (yom-tov or chol-hamoed). */
  readonly anyHoliday?: boolean;
}

/**
 * Full decomposition result for a single observation.
 */
export interface DecomposedPoint {
  readonly index: number;
  readonly date?: Date;
  readonly observed: number;
  readonly trend: number | null;         // null at the edges where MA is undefined
  readonly seasonal: number;
  readonly residual: number | null;      // null where trend is null
  readonly holidayFlags: HebrewHolidayFlags;
}

/**
 * Bilingual text pair.
 */
export interface Bilingual {
  readonly he: string;
  readonly en: string;
}

/**
 * Aggregated decomposition report.
 */
export interface SeasonalityReport {
  readonly length: number;
  readonly period: number;
  readonly detectedPeriods: readonly PeriodCandidate[];
  readonly points: readonly DecomposedPoint[];
  /** Seasonal pattern, one entry per period index (0..period-1). */
  readonly seasonalPattern: readonly number[];
  /** Variance explained by each component in [0,1]. */
  readonly strength: {
    readonly trend: number;
    readonly seasonal: number;
    readonly residual: number;
  };
  /** Pre-formatted, direction-aware bilingual messages. */
  readonly messages: readonly Bilingual[];
  /** Average value on each Hebrew holiday group (zero if no coverage). */
  readonly holidayImpact: Record<keyof HebrewHolidayFlags, number>;
}

/**
 * Options for decompose().
 */
export interface DecomposeOptions {
  /**
   * Force a specific period. If omitted, auto-detected via ACF.
   * Must be >= 2 and <= floor(length/2).
   */
  readonly period?: number;
  /**
   * Candidate lags to probe when auto-detecting. Default: [7, 14, 28, 30, 52, 90, 365].
   */
  readonly candidateLags?: readonly number[];
  /**
   * Minimum ACF for a candidate to beat the default (weekly). Default 0.15.
   */
  readonly minAcf?: number;
  /**
   * Inject a custom Hebrew calendar (overrides the bundled table).
   * Return the flags for a given Gregorian date.
   */
  readonly hebrewCalendar?: (d: Date) => HebrewHolidayFlags;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Constants & input guards
 * ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_CANDIDATE_LAGS: readonly number[] = [7, 14, 28, 30, 52, 90, 365];
const DEFAULT_MIN_ACF = 0.15;

/**
 * Coerce the `date` field of a TimeSeriesPoint into a Date (or undefined).
 */
export function toDate(input: Date | string | undefined): Date | undefined {
  if (input === undefined) return undefined;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input;
  }
  // 'YYYY-MM-DD' or any Date-parseable string
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Format a date as 'YYYY-MM-DD' in UTC.
 */
export function formatYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Statistics helpers (no-deps)
 * ────────────────────────────────────────────────────────────────────────── */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function variance(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - m;
    s += d * d;
  }
  return s / xs.length;
}

/**
 * Pearson autocorrelation at a single lag.
 * Returns 0 if the series is too short or has zero variance.
 */
export function autocorrelation(xs: readonly number[], lag: number): number {
  const n = xs.length;
  if (lag <= 0 || lag >= n) return 0;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const di = xs[i] - m;
    den += di * di;
    if (i + lag < n) {
      const dl = xs[i + lag] - m;
      num += di * dl;
    }
  }
  if (den === 0) return 0;
  return num / den;
}

/**
 * Centered moving average of window `w`.
 * For even w we use Cleveland's 2x(w/2) trick for exact centering.
 * Edges (< floor(w/2) from an end) are returned as null.
 */
export function movingAverage(xs: readonly number[], w: number): (number | null)[] {
  const n = xs.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (w < 2 || w > n) return out;

  if (w % 2 === 1) {
    const half = Math.floor(w / 2);
    let s = 0;
    for (let i = 0; i < w; i++) s += xs[i];
    out[half] = s / w;
    for (let i = half + 1; i + half < n; i++) {
      s += xs[i + half] - xs[i - half - 1];
      out[i] = s / w;
    }
  } else {
    // Even window: take (w+1)-point centered MA with half-weighted endpoints.
    const half = w / 2;
    for (let i = half; i < n - half; i++) {
      let s = 0.5 * xs[i - half] + 0.5 * xs[i + half];
      for (let k = i - half + 1; k < i + half; k++) s += xs[k];
      out[i] = s / w;
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Period detection
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Rank candidate lags by autocorrelation and return the list
 * (strongest first). Always includes a sensible weekly default.
 */
export function detectPeriods(
  xs: readonly number[],
  candidateLags: readonly number[] = DEFAULT_CANDIDATE_LAGS,
): PeriodCandidate[] {
  const n = xs.length;
  const lagSet = new Set(candidateLags);
  if (n >= 14) lagSet.add(7); // ensure weekly is probed whenever possible

  const out: PeriodCandidate[] = [];
  for (const lag of lagSet) {
    if (lag < 2 || lag >= n) continue;
    const acf = autocorrelation(xs, lag);
    out.push({
      lag,
      label: labelForLag(lag),
      acf,
    });
  }
  out.sort((a, b) => b.acf - a.acf);
  return out;
}

function labelForLag(lag: number): PeriodCandidate['label'] {
  if (lag === 7 || lag === 14) return 'weekly';
  if (lag >= 28 && lag <= 31) return 'monthly';
  if (lag >= 350 && lag <= 366) return 'yearly';
  return 'custom';
}

/**
 * Pick the best period for decomposition.
 * Defaults to 7 (weekly) if nothing beats `minAcf`.
 */
export function chooseBestPeriod(
  xs: readonly number[],
  opts: Pick<DecomposeOptions, 'candidateLags' | 'minAcf'> = {},
): { period: number; candidates: PeriodCandidate[] } {
  const candidates = detectPeriods(xs, opts.candidateLags);
  const minAcf = opts.minAcf ?? DEFAULT_MIN_ACF;
  const n = xs.length;

  for (const c of candidates) {
    if (c.acf >= minAcf && c.lag <= Math.floor(n / 2)) {
      return { period: c.lag, candidates };
    }
  }
  // Fallback: weekly if we have enough points, else floor(n/2)
  const fallback = n >= 14 ? 7 : Math.max(2, Math.floor(n / 2));
  return { period: fallback, candidates };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hebrew calendar (bundled approximation)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Tishrei 1 and Nissan 15 anchor dates for Hebrew years 5785..5792,
 * expressed as Gregorian 'YYYY-MM-DD' (UTC-interpreted).
 *
 * Source: standard published Jewish-calendar reference tables.
 * This is an APPROXIMATION — for years outside this range inject your own
 * `ctx.hebrewCalendar`.
 */
interface HebrewYearAnchors {
  readonly gregYearStart: number;   // Gregorian year containing Tishrei 1
  readonly tishrei1: string;        // Rosh HaShana (1st day) — 'YYYY-MM-DD'
  readonly nissan15: string;        // Pesach (1st day) — 'YYYY-MM-DD'
  readonly sivan6: string;          // Shavuot — 'YYYY-MM-DD'
}

const BUNDLED_HEBREW_YEARS: readonly HebrewYearAnchors[] = [
  // 5785 → Tishrei 1 = 2024-10-03, Nissan 15 = 2025-04-13, Sivan 6 = 2025-06-02
  { gregYearStart: 2024, tishrei1: '2024-10-03', nissan15: '2025-04-13', sivan6: '2025-06-02' },
  // 5786 → Tishrei 1 = 2025-09-23, Nissan 15 = 2026-04-02, Sivan 6 = 2026-05-22
  { gregYearStart: 2025, tishrei1: '2025-09-23', nissan15: '2026-04-02', sivan6: '2026-05-22' },
  // 5787 → Tishrei 1 = 2026-09-12, Nissan 15 = 2027-04-22, Sivan 6 = 2027-06-11
  { gregYearStart: 2026, tishrei1: '2026-09-12', nissan15: '2027-04-22', sivan6: '2027-06-11' },
  // 5788 → Tishrei 1 = 2027-10-02, Nissan 15 = 2028-04-11, Sivan 6 = 2028-05-31
  { gregYearStart: 2027, tishrei1: '2027-10-02', nissan15: '2028-04-11', sivan6: '2028-05-31' },
  // 5789 → Tishrei 1 = 2028-09-21, Nissan 15 = 2029-03-31, Sivan 6 = 2029-05-20
  { gregYearStart: 2028, tishrei1: '2028-09-21', nissan15: '2029-03-31', sivan6: '2029-05-20' },
  // 5790 → Tishrei 1 = 2029-09-10, Nissan 15 = 2030-04-18, Sivan 6 = 2030-06-07
  { gregYearStart: 2029, tishrei1: '2029-09-10', nissan15: '2030-04-18', sivan6: '2030-06-07' },
  // 5791 → Tishrei 1 = 2030-09-28, Nissan 15 = 2031-04-08, Sivan 6 = 2031-05-28
  { gregYearStart: 2030, tishrei1: '2030-09-28', nissan15: '2031-04-08', sivan6: '2031-05-28' },
  // 5792 → Tishrei 1 = 2031-09-18, Nissan 15 = 2032-03-27, Sivan 6 = 2032-05-16
  { gregYearStart: 2031, tishrei1: '2031-09-18', nissan15: '2032-03-27', sivan6: '2032-05-16' },
];

function addDays(d: Date, n: number): Date {
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}

function parseUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function sameYmd(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Bundled Hebrew-calendar lookup.
 *
 * Sukkot (Tishrei 15-21) = 7 days; days 2-7 are chol hamoed.
 * Pesach (Nissan 15-21) = 7 days; days 2-6 are chol hamoed.
 * Rosh HaShana (Tishrei 1-2), Yom Kippur (Tishrei 10), Shavuot (Sivan 6).
 *
 * For a Gregorian date outside the bundled 5785..5792 window this returns
 * an empty-flag object — callers should inject `hebrewCalendar` for other
 * years. The code path is bilingual-ready.
 */
export function bundledHebrewCalendar(d: Date): HebrewHolidayFlags {
  const flags: HebrewHolidayFlags = {};
  const year = d.getUTCFullYear();

  // Find the relevant anchor: Rosh HaShana of year Y is in Greg year Y or Y-1.
  let anchor: HebrewYearAnchors | undefined;
  for (const a of BUNDLED_HEBREW_YEARS) {
    if (a.gregYearStart === year || a.gregYearStart === year - 1) {
      // Check if date falls within that Hebrew year's window.
      const tishrei1 = parseUtc(a.tishrei1);
      const nextAnchor = BUNDLED_HEBREW_YEARS.find((x) => x.gregYearStart === a.gregYearStart + 1);
      const nextTishrei = nextAnchor ? parseUtc(nextAnchor.tishrei1) : addDays(tishrei1, 385);
      if (d.getTime() >= tishrei1.getTime() && d.getTime() < nextTishrei.getTime()) {
        anchor = a;
        break;
      }
    }
  }
  if (!anchor) return flags;

  const tishrei1 = parseUtc(anchor.tishrei1);
  const nissan15 = parseUtc(anchor.nissan15);
  const sivan6 = parseUtc(anchor.sivan6);

  // Rosh HaShana: Tishrei 1-2
  const rh1 = tishrei1;
  const rh2 = addDays(tishrei1, 1);
  const isRh = sameYmd(d, rh1) || sameYmd(d, rh2);

  // Yom Kippur: Tishrei 10
  const yk = addDays(tishrei1, 9);
  const isYk = sameYmd(d, yk);

  // Sukkot: Tishrei 15-21
  const suk1 = addDays(tishrei1, 14);
  const suk7 = addDays(tishrei1, 20);
  const inSukkot =
    d.getTime() >= suk1.getTime() && d.getTime() <= suk7.getTime();
  const cholSukkot = inSukkot && !sameYmd(d, suk1);

  // Pesach: Nissan 15-21
  const pes1 = nissan15;
  const pes7 = addDays(nissan15, 6);
  const inPesach =
    d.getTime() >= pes1.getTime() && d.getTime() <= pes7.getTime();
  const cholPesach =
    inPesach && !sameYmd(d, pes1) && !sameYmd(d, pes7);

  // Shavuot: Sivan 6
  const isShavuot = sameYmd(d, sivan6);

  const anyCholHamoed = cholSukkot || cholPesach;
  const anyHoliday = isRh || isYk || inSukkot || inPesach || isShavuot;

  return {
    roshHaShana: isRh || undefined,
    yomKippur: isYk || undefined,
    sukkot: inSukkot || undefined,
    cholHamoedSukkot: cholSukkot || undefined,
    pesach: inPesach || undefined,
    cholHamoedPesach: cholPesach || undefined,
    shavuot: isShavuot || undefined,
    cholHamoed: anyCholHamoed || undefined,
    anyHoliday: anyHoliday || undefined,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Decomposition core
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Compute the seasonal pattern (array of length `period`) from a de-trended
 * series by averaging all values that share the same period-index. NaN-safe.
 */
export function computeSeasonalPattern(
  detrended: readonly (number | null)[],
  period: number,
): number[] {
  if (period < 1) return [];
  const sums: number[] = new Array(period).fill(0);
  const counts: number[] = new Array(period).fill(0);
  for (let i = 0; i < detrended.length; i++) {
    const v = detrended[i];
    if (v === null || Number.isNaN(v)) continue;
    const k = i % period;
    sums[k] += v;
    counts[k] += 1;
  }
  const raw: number[] = sums.map((s, k) => (counts[k] > 0 ? s / counts[k] : 0));
  // Normalize so the pattern sums to zero (additive-model invariant).
  const avg = mean(raw);
  return raw.map((v) => v - avg);
}

/**
 * The headline API — run the classical additive decomposition.
 *
 * @throws Error when points is empty.
 */
export function decompose(
  points: readonly TimeSeriesPoint[],
  opts: DecomposeOptions = {},
): SeasonalityReport {
  if (!points || points.length === 0) {
    throw new Error('seasonality/decompose: points must be non-empty');
  }
  const xs = points.map((p) => p.value);

  // 1) Pick period
  const { period, candidates } = opts.period
    ? { period: opts.period, candidates: detectPeriods(xs, opts.candidateLags) }
    : chooseBestPeriod(xs, { candidateLags: opts.candidateLags, minAcf: opts.minAcf });

  if (period < 2) {
    throw new Error(`seasonality/decompose: period must be >= 2 (got ${period})`);
  }

  // 2) Trend via centered moving average
  const trend = movingAverage(xs, period);

  // 3) De-trended series, then seasonal pattern by period-index
  const detrended: (number | null)[] = xs.map((v, i) => (trend[i] === null ? null : v - (trend[i] as number)));
  const seasonalPattern = computeSeasonalPattern(detrended, period);

  // 4) Build per-point result
  const cal = opts.hebrewCalendar ?? bundledHebrewCalendar;
  const dpoints: DecomposedPoint[] = xs.map((v, i) => {
    const d = toDate(points[i].date);
    const seasonal = seasonalPattern[i % period];
    const t = trend[i];
    const residual = t === null ? null : v - t - seasonal;
    const flags = d ? cal(d) : {};
    return {
      index: i,
      date: d,
      observed: v,
      trend: t,
      seasonal,
      residual,
      holidayFlags: flags,
    };
  });

  // 5) Strength metrics (variance explained)
  const varY = variance(xs);
  const seasonalSeries = dpoints.map((p) => p.seasonal);
  const varS = variance(seasonalSeries);
  const residualSeries = dpoints
    .map((p) => p.residual)
    .filter((v): v is number => v !== null);
  const varR = variance(residualSeries);
  const trendSeries = dpoints
    .map((p) => p.trend)
    .filter((v): v is number => v !== null);
  const varT = variance(trendSeries);

  const safe = (x: number): number => (varY === 0 ? 0 : Math.max(0, Math.min(1, x / varY)));

  const strength = {
    trend: safe(varT),
    seasonal: safe(varS),
    residual: safe(varR),
  };

  // 6) Holiday impact (average observed on each flag)
  const holidayImpact: Record<keyof HebrewHolidayFlags, number> = {
    roshHaShana: 0,
    yomKippur: 0,
    sukkot: 0,
    cholHamoedSukkot: 0,
    pesach: 0,
    cholHamoedPesach: 0,
    shavuot: 0,
    cholHamoed: 0,
    anyHoliday: 0,
  };
  const holidayCounts: Record<keyof HebrewHolidayFlags, number> = {
    roshHaShana: 0,
    yomKippur: 0,
    sukkot: 0,
    cholHamoedSukkot: 0,
    pesach: 0,
    cholHamoedPesach: 0,
    shavuot: 0,
    cholHamoed: 0,
    anyHoliday: 0,
  };
  for (const p of dpoints) {
    for (const key of Object.keys(holidayImpact) as (keyof HebrewHolidayFlags)[]) {
      if (p.holidayFlags[key]) {
        holidayImpact[key] += p.observed;
        holidayCounts[key] += 1;
      }
    }
  }
  for (const key of Object.keys(holidayImpact) as (keyof HebrewHolidayFlags)[]) {
    if (holidayCounts[key] > 0) {
      holidayImpact[key] = holidayImpact[key] / holidayCounts[key];
    }
  }

  // 7) Bilingual messages
  const messages: Bilingual[] = [];
  messages.push({
    he: `פיצול סדרה: תקופה זוהתה = ${period} (מתוך ${candidates.length} מועמדות).`,
    en: `Decomposition: period = ${period} (tested ${candidates.length} candidates).`,
  });
  messages.push({
    he: `עוצמת עונתיות: ${(strength.seasonal * 100).toFixed(1)}% ; מגמה: ${(strength.trend * 100).toFixed(1)}% ; שארית: ${(strength.residual * 100).toFixed(1)}%.`,
    en: `Strength — seasonal: ${(strength.seasonal * 100).toFixed(1)}% ; trend: ${(strength.trend * 100).toFixed(1)}% ; residual: ${(strength.residual * 100).toFixed(1)}%.`,
  });
  if (strength.seasonal > 0.25) {
    messages.push({
      he: 'התבנית העונתית מובהקת — מומלץ להטמיע ב-Forecast של ONYX AI.',
      en: 'Seasonal pattern is significant — feed it into the ONYX AI forecast.',
    });
  }
  if (holidayCounts.anyHoliday > 0) {
    messages.push({
      he: `אותרו ${holidayCounts.anyHoliday} תצפיות בחגי ישראל (ממוצע: ${holidayImpact.anyHoliday.toFixed(2)}).`,
      en: `${holidayCounts.anyHoliday} observation(s) fall on Jewish holidays (avg: ${holidayImpact.anyHoliday.toFixed(2)}).`,
    });
  }

  return {
    length: xs.length,
    period,
    detectedPeriods: candidates,
    points: dpoints,
    seasonalPattern,
    strength,
    messages,
    holidayImpact,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Convenience helpers (growth path — for future expansion, not deletion)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Build a daily TimeSeriesPoint[] from a pair of parallel arrays.
 * Helpful when integrating with CSV / Excel imports.
 */
export function toTimeSeries(
  dates: readonly (Date | string)[],
  values: readonly number[],
): TimeSeriesPoint[] {
  if (dates.length !== values.length) {
    throw new Error('seasonality/toTimeSeries: dates and values must align');
  }
  return dates.map((d, i) => ({ date: d, value: values[i] }));
}

/**
 * Render a bilingual report block as plain text (he then en).
 */
export function renderBilingualReport(report: SeasonalityReport): string {
  const lines: string[] = [];
  lines.push('── ONYX AI ∙ Seasonality Report ──');
  for (const m of report.messages) {
    lines.push(`HE: ${m.he}`);
    lines.push(`EN: ${m.en}`);
  }
  lines.push('');
  lines.push(`Period = ${report.period}`);
  lines.push(`Points = ${report.length}`);
  lines.push('Seasonal pattern: ' + report.seasonalPattern.map((v) => v.toFixed(3)).join(', '));
  return lines.join('\n');
}
