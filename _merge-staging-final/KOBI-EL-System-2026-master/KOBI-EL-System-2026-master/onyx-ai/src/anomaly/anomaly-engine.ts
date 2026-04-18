/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — AnomalyEngine (Agent Y-153)
 * מנוע איתור חריגות סטטיסטיות — Techno-Kol Uzi mega-ERP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Statistical anomaly detection with ZERO external dependencies.
 * איתור חריגות סטטיסטיות ללא כל תלויות חיצוניות.
 *
 * Detectors / גלאים:
 *   1. Z-Score              — סטיית תקן קלאסית (רגישות גבוהה, מושפעת חריגים)
 *   2. MAD                   — Median Absolute Deviation (robust, חסין לחריגים)
 *   3. IQR (Tukey box-plot)  — 1.5 × IQR מחוץ לרבעונים
 *   4. EWMA control chart    — Exponentially Weighted Moving Average
 *   5. Page-Hinkley           — change-point detection לגילוי שינויי מגמה
 *   6. Seasonal residual      — הפרש מול עונתיות תקופתית (לוח זמן Ɣ)
 *
 * Modes / מצבים:
 *   • Streaming — update(value) נקודה-נקודה, אירועי 'alert' נפלטים מיידית
 *   • Batch      — analyze(series) מחזיר דו"ח מלא על סדרה שלמה
 *
 * Event system / מערכת אירועים:
 *   engine.on('alert',   handler) — כל אזעקה (לפני דיכוי)
 *   engine.on('fired',   handler) — אזעקות שעברו את מסנן ה-cooldown
 *   engine.on('cleared', handler) — מצב חוזר לנורמה
 *
 * Suppression / דיכוי:
 *   • cooldownMs: חלון זמן שבו אזעקה מאותו סוג+detector חסומה
 *   • maxAlertsPerWindow: מספר מרבי של אזעקות בחלון נתון
 *
 * Design principle: "לא מוחקים רק משדרגים ומגדלים"
 *   - Append-only detector registry (addDetector) — אין מחיקה
 *   - History buffer משתמר גם במצב streaming (ring buffer)
 *   - התרחבות דרך composition ולא מחיקה של קוד קיים
 *
 * Bilingual RTL: כל ההסברים נפלטים בעברית ובאנגלית.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * Types / טיפוסים
 * ────────────────────────────────────────────────────────────────────────── */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type DetectorName =
  | 'zScore'
  | 'mad'
  | 'iqr'
  | 'ewma'
  | 'pageHinkley'
  | 'seasonal'
  | string; // extensible — custom detectors allowed (append-only)

export interface AnomalyAlert {
  /** Detector that flagged the anomaly / שם הגלאי */
  detector: DetectorName;
  /** Index within the analyzed series / מיקום בסדרה */
  index: number;
  /** Observed value / הערך הנצפה */
  value: number;
  /** Expected/baseline value / ערך מצופה לפי המודל */
  expected: number;
  /** Deviation score (method-specific) / ציון סטייה */
  score: number;
  /** Threshold crossed / סף שנחצה */
  threshold: number;
  /** Severity tier / דרגת חומרה */
  severity: Severity;
  /** Human-readable explanation (Hebrew + English) */
  explanation: {
    he: string;
    en: string;
  };
  /** Monotonic timestamp (ms) / חותם זמן */
  timestamp: number;
  /** Optional tag/label for the series / תג לסדרה */
  tag?: string;
}

export interface AnomalyReport {
  /** Total points analyzed / סך הנקודות שנבדקו */
  pointCount: number;
  /** Alerts from all detectors / אזעקות מכל הגלאים */
  alerts: AnomalyAlert[];
  /** Per-detector summary statistics / סטטיסטיקות לפי גלאי */
  summary: Record<
    DetectorName,
    { ran: boolean; alerts: number; notes: string }
  >;
  /** Per-series descriptive stats / סטטיסטיקה תיאורית */
  stats: SeriesStats;
}

export interface SeriesStats {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdev: number;
  mad: number;
  q1: number;
  q3: number;
  iqr: number;
}

export interface AnomalyEngineConfig {
  // Z-score
  zScoreThreshold?: number;
  // MAD
  madThreshold?: number;
  // IQR Tukey factor
  iqrK?: number;
  // EWMA
  ewmaAlpha?: number;
  ewmaL?: number; // control-limit multiplier (L sigma)
  // Page-Hinkley
  phDelta?: number; // minimum magnitude of change
  phLambda?: number; // alarm threshold
  // Seasonal
  seasonalPeriod?: number;
  seasonalThreshold?: number; // how many MADs above seasonal median
  // Suppression
  cooldownMs?: number;
  maxAlertsPerWindow?: number;
  suppressionWindowMs?: number;
  // Streaming
  historyCap?: number;
  // Time provider (testable clock)
  now?: () => number;
}

export type EventName = 'alert' | 'fired' | 'cleared' | 'reset';
export type EventHandler = (payload: AnomalyAlert | { reason: string }) => void;

/* ──────────────────────────────────────────────────────────────────────────
 * Numeric helpers (defensive — no throws on degenerate input)
 * פונקציות עזר נומריות חסינות לקלטים פתולוגיים
 * ────────────────────────────────────────────────────────────────────────── */

function isFiniteNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function sanitize(series: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of series) {
    if (isFiniteNum(v)) out.push(v);
  }
  return out;
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

function variance(xs: readonly number[], m?: number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  let s = 0;
  for (const v of xs) {
    const d = v - mu;
    s += d * d;
  }
  // sample variance (n-1) — robust for small n, reduces bias
  return s / (xs.length - 1);
}

function stdev(xs: readonly number[], m?: number): number {
  return Math.sqrt(variance(xs, m));
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Median Absolute Deviation (consistent scale estimator when ×1.4826) */
function madConsistent(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const dev: number[] = [];
  for (const v of xs) dev.push(Math.abs(v - med));
  return 1.4826 * median(dev);
}

function rawMad(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const dev: number[] = [];
  for (const v of xs) dev.push(Math.abs(v - med));
  return median(dev);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Severity classifier / מסווג חומרה
 * ────────────────────────────────────────────────────────────────────────── */

function classifySeverity(score: number, threshold: number): Severity {
  if (!isFiniteNum(score) || !isFiniteNum(threshold) || threshold <= 0) {
    return 'info';
  }
  const ratio = Math.abs(score) / threshold;
  if (ratio >= 4) return 'critical';
  if (ratio >= 2.5) return 'high';
  if (ratio >= 1.5) return 'medium';
  if (ratio >= 1) return 'low';
  return 'info';
}

/* ──────────────────────────────────────────────────────────────────────────
 * AnomalyEngine — main class / מנוע האיתור הראשי
 * ────────────────────────────────────────────────────────────────────────── */

export class AnomalyEngine {
  private readonly cfg: Required<Omit<AnomalyEngineConfig, 'now'>> & {
    now: () => number;
  };

  // Ring buffer of recent points (streaming mode)
  private history: number[] = [];

  // Page-Hinkley state
  private phMean = 0;
  private phN = 0;
  private phMt = 0; // cumulative deviation
  private phMinMt = 0;

  // EWMA state
  private ewmaS = 0;
  private ewmaInit = false;

  // Cooldown / suppression state: key = `${detector}:${tag ?? 'default'}`
  private lastFired = new Map<string, number>();
  private alertHistory: Array<{ key: string; ts: number }> = [];

  // Event subscribers
  private handlers: Record<EventName, EventHandler[]> = {
    alert: [],
    fired: [],
    cleared: [],
    reset: [],
  };

  // Extended detectors (append-only — no deletion)
  private customDetectors: Array<{
    name: string;
    fn: (series: readonly number[], self: AnomalyEngine) => AnomalyAlert[];
  }> = [];

  constructor(cfg: AnomalyEngineConfig = {}) {
    this.cfg = {
      zScoreThreshold: cfg.zScoreThreshold ?? 3,
      madThreshold: cfg.madThreshold ?? 3.5,
      iqrK: cfg.iqrK ?? 1.5,
      ewmaAlpha: cfg.ewmaAlpha ?? 0.3,
      ewmaL: cfg.ewmaL ?? 3,
      phDelta: cfg.phDelta ?? 0.005,
      phLambda: cfg.phLambda ?? 50,
      seasonalPeriod: cfg.seasonalPeriod ?? 7,
      seasonalThreshold: cfg.seasonalThreshold ?? 3.5,
      cooldownMs: cfg.cooldownMs ?? 60_000,
      maxAlertsPerWindow: cfg.maxAlertsPerWindow ?? 10,
      suppressionWindowMs: cfg.suppressionWindowMs ?? 300_000,
      historyCap: cfg.historyCap ?? 10_000,
      now: cfg.now ?? (() => Date.now()),
    };
  }

  /* ───────────── Event API / ממשק אירועים ───────────── */

  on(event: EventName, handler: EventHandler): this {
    this.handlers[event].push(handler);
    return this;
  }

  off(event: EventName, handler: EventHandler): this {
    const arr = this.handlers[event];
    const i = arr.indexOf(handler);
    if (i >= 0) arr.splice(i, 1);
    return this;
  }

  private emit(event: EventName, payload: AnomalyAlert | { reason: string }): void {
    for (const h of this.handlers[event]) {
      try {
        h(payload);
      } catch {
        // swallow subscriber errors — never let consumer bugs crash the engine
      }
    }
  }

  /* ───────────── Extensibility (append-only) ───────────── */

  /**
   * Register an additional detector. Custom detectors run AFTER built-ins.
   * לא ניתן למחוק detector קיים — רק להוסיף. עיקרון "לא מוחקים רק מגדלים".
   */
  addDetector(
    name: string,
    fn: (series: readonly number[], self: AnomalyEngine) => AnomalyAlert[],
  ): this {
    if (!name || typeof fn !== 'function') return this;
    // prevent overriding built-ins
    const builtIns = new Set([
      'zScore',
      'mad',
      'iqr',
      'ewma',
      'pageHinkley',
      'seasonal',
    ]);
    if (builtIns.has(name)) return this;
    this.customDetectors.push({ name, fn });
    return this;
  }

  /* ───────────── Descriptive stats / סטטיסטיקה תיאורית ───────────── */

  computeStats(series: readonly number[]): SeriesStats {
    const xs = sanitize(series);
    const n = xs.length;
    if (n === 0) {
      return {
        n: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdev: 0,
        mad: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
      };
    }
    const mu = mean(xs);
    const med = median(xs);
    const sd = stdev(xs, mu);
    const q1 = quantile(xs, 0.25);
    const q3 = quantile(xs, 0.75);
    let lo = xs[0];
    let hi = xs[0];
    for (const v of xs) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return {
      n,
      min: lo,
      max: hi,
      mean: mu,
      median: med,
      stdev: sd,
      mad: madConsistent(xs),
      q1,
      q3,
      iqr: q3 - q1,
    };
  }

  /* ───────────── Detectors — batch implementations ───────────── */

  detectZScore(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    if (xs.length < 3) return out;
    const mu = mean(xs);
    const sd = stdev(xs, mu);
    if (sd === 0) return out; // constant series — nothing to flag
    const T = this.cfg.zScoreThreshold;
    for (let i = 0; i < xs.length; i++) {
      const z = (xs[i] - mu) / sd;
      if (Math.abs(z) >= T) {
        out.push(
          this.buildAlert({
            detector: 'zScore',
            index: i,
            value: xs[i],
            expected: mu,
            score: z,
            threshold: T,
            tag,
            explainHe: `ציון Z = ${z.toFixed(2)} חורג מהסף ${T}. הערך ${xs[i].toFixed(2)} רחוק מהממוצע ${mu.toFixed(2)} יותר מ-${T} סטיות תקן.`,
            explainEn: `Z-score = ${z.toFixed(2)} exceeds threshold ${T}. Value ${xs[i].toFixed(2)} deviates from mean ${mu.toFixed(2)} by more than ${T} standard deviations.`,
          }),
        );
      }
    }
    return out;
  }

  detectMAD(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    if (xs.length < 3) return out;
    const med = median(xs);
    const m = madConsistent(xs);
    if (m === 0) return out; // all equal to median
    const T = this.cfg.madThreshold;
    for (let i = 0; i < xs.length; i++) {
      const score = (xs[i] - med) / m;
      if (Math.abs(score) >= T) {
        out.push(
          this.buildAlert({
            detector: 'mad',
            index: i,
            value: xs[i],
            expected: med,
            score,
            threshold: T,
            tag,
            explainHe: `ציון MAD = ${score.toFixed(2)} חורג מהסף ${T}. הערך ${xs[i].toFixed(2)} רחוק מהחציון ${med.toFixed(2)} לפי מדידה חסינה לחריגים.`,
            explainEn: `MAD score = ${score.toFixed(2)} exceeds threshold ${T}. Value ${xs[i].toFixed(2)} is far from median ${med.toFixed(2)} under a robust scale estimator.`,
          }),
        );
      }
    }
    return out;
  }

  detectIQR(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    if (xs.length < 4) return out;
    const q1 = quantile(xs, 0.25);
    const q3 = quantile(xs, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) return out;
    const k = this.cfg.iqrK;
    const lo = q1 - k * iqr;
    const hi = q3 + k * iqr;
    const center = (q1 + q3) / 2;
    for (let i = 0; i < xs.length; i++) {
      const v = xs[i];
      if (v < lo || v > hi) {
        const dist = v > hi ? v - hi : lo - v;
        const score = dist / iqr;
        out.push(
          this.buildAlert({
            detector: 'iqr',
            index: i,
            value: v,
            expected: center,
            score,
            threshold: k,
            tag,
            explainHe: `הערך ${v.toFixed(2)} מחוץ ל-[${lo.toFixed(2)}, ${hi.toFixed(2)}] (${k}×IQR, IQR=${iqr.toFixed(2)}).`,
            explainEn: `Value ${v.toFixed(2)} outside [${lo.toFixed(2)}, ${hi.toFixed(2)}] (${k}×IQR whiskers, IQR=${iqr.toFixed(2)}).`,
          }),
        );
      }
    }
    return out;
  }

  detectEWMA(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    if (xs.length < 4) return out;
    const alpha = this.cfg.ewmaAlpha;
    const L = this.cfg.ewmaL;

    // Use first-half as warmup to estimate baseline mean + variance
    const warmupEnd = Math.max(2, Math.floor(xs.length / 3));
    const warmup = xs.slice(0, warmupEnd);
    const mu0 = mean(warmup);
    const sd0 = stdev(warmup, mu0);
    if (sd0 === 0) return out;

    let s = mu0;
    for (let i = 0; i < xs.length; i++) {
      s = alpha * xs[i] + (1 - alpha) * s;
      // EWMA variance scaling
      const factor = Math.sqrt(
        (alpha / (2 - alpha)) * (1 - Math.pow(1 - alpha, 2 * (i + 1))),
      );
      const ucl = mu0 + L * sd0 * factor;
      const lcl = mu0 - L * sd0 * factor;
      if (s > ucl || s < lcl) {
        const dev = s - mu0;
        const score = dev / (sd0 * factor || 1);
        out.push(
          this.buildAlert({
            detector: 'ewma',
            index: i,
            value: xs[i],
            expected: mu0,
            score,
            threshold: L,
            tag,
            explainHe: `EWMA (α=${alpha}) חצה גבולות בקרה ${L}σ. הממוצע המשוקלל ${s.toFixed(2)} חורג מהבסיס ${mu0.toFixed(2)}.`,
            explainEn: `EWMA (α=${alpha}) breached ${L}σ control limits. Smoothed mean ${s.toFixed(2)} deviates from baseline ${mu0.toFixed(2)}.`,
          }),
        );
      }
    }
    return out;
  }

  detectPageHinkley(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    if (xs.length < 4) return out;
    const delta = this.cfg.phDelta;
    const lambda = this.cfg.phLambda;

    let runningMean = xs[0];
    let mT = 0;
    let minMT = 0;
    let maxMT = 0;

    for (let i = 1; i < xs.length; i++) {
      runningMean = runningMean + (xs[i] - runningMean) / (i + 1);
      const increment = xs[i] - runningMean - delta;
      mT += increment;
      if (mT < minMT) minMT = mT;
      if (mT > maxMT) maxMT = mT;
      const phUp = mT - minMT;
      const phDown = maxMT - mT;
      if (phUp > lambda || phDown > lambda) {
        const isUp = phUp > lambda;
        const score = isUp ? phUp : phDown;
        out.push(
          this.buildAlert({
            detector: 'pageHinkley',
            index: i,
            value: xs[i],
            expected: runningMean,
            score,
            threshold: lambda,
            tag,
            explainHe: `Page-Hinkley זיהה נקודת שינוי (${isUp ? 'עלייה' : 'ירידה'}). PH=${score.toFixed(2)} מעל λ=${lambda}. ממוצע רץ ${runningMean.toFixed(2)}.`,
            explainEn: `Page-Hinkley change-point detected (${isUp ? 'upward' : 'downward'}). PH=${score.toFixed(2)} exceeded λ=${lambda}. Running mean ${runningMean.toFixed(2)}.`,
          }),
        );
        // reset — allow detecting subsequent change points
        mT = 0;
        minMT = 0;
        maxMT = 0;
      }
    }
    return out;
  }

  detectSeasonal(series: readonly number[], tag?: string): AnomalyAlert[] {
    const xs = sanitize(series);
    const out: AnomalyAlert[] = [];
    const P = Math.max(2, Math.floor(this.cfg.seasonalPeriod));
    if (xs.length < P * 2) return out;

    // Group values by phase (index mod P) and compute median per phase
    const phaseValues: number[][] = [];
    for (let p = 0; p < P; p++) phaseValues.push([]);
    for (let i = 0; i < xs.length; i++) phaseValues[i % P].push(xs[i]);

    const phaseMedian: number[] = new Array<number>(P).fill(0);
    const phaseMad: number[] = new Array<number>(P).fill(0);
    for (let p = 0; p < P; p++) {
      phaseMedian[p] = median(phaseValues[p]);
      phaseMad[p] = madConsistent(phaseValues[p]);
    }

    // Fallback global MAD if phase MAD is zero
    const globalMad = madConsistent(xs);
    const T = this.cfg.seasonalThreshold;

    for (let i = 0; i < xs.length; i++) {
      const p = i % P;
      const expected = phaseMedian[p];
      const scale = phaseMad[p] > 0 ? phaseMad[p] : globalMad;
      if (scale === 0) continue;
      const residual = xs[i] - expected;
      const score = residual / scale;
      if (Math.abs(score) >= T) {
        out.push(
          this.buildAlert({
            detector: 'seasonal',
            index: i,
            value: xs[i],
            expected,
            score,
            threshold: T,
            tag,
            explainHe: `שארית עונתית = ${score.toFixed(2)} (שלב ${p}/${P}). הערך ${xs[i].toFixed(2)} חורג מהדפוס החציוני ${expected.toFixed(2)}.`,
            explainEn: `Seasonal residual = ${score.toFixed(2)} (phase ${p}/${P}). Value ${xs[i].toFixed(2)} deviates from phase median ${expected.toFixed(2)}.`,
          }),
        );
      }
    }
    return out;
  }

  /* ───────────── Batch entry point / ניתוח אצווה ───────────── */

  analyze(series: readonly number[], tag?: string): AnomalyReport {
    const xs = sanitize(series);
    const stats = this.computeStats(xs);

    const alerts: AnomalyAlert[] = [];
    const summary: AnomalyReport['summary'] = {};

    const runDetector = (
      name: DetectorName,
      fn: () => AnomalyAlert[],
      minSamples: number,
      note: string,
    ) => {
      if (xs.length < minSamples) {
        summary[name] = {
          ran: false,
          alerts: 0,
          notes: `skipped — need ≥ ${minSamples} samples`,
        };
        return;
      }
      const det = fn();
      summary[name] = { ran: true, alerts: det.length, notes: note };
      for (const a of det) alerts.push(a);
    };

    runDetector('zScore', () => this.detectZScore(xs, tag), 3, 'classic mean ± kσ');
    runDetector('mad', () => this.detectMAD(xs, tag), 3, 'robust median ± k·MAD');
    runDetector('iqr', () => this.detectIQR(xs, tag), 4, 'Tukey 1.5×IQR whiskers');
    runDetector('ewma', () => this.detectEWMA(xs, tag), 4, 'EWMA control chart');
    runDetector(
      'pageHinkley',
      () => this.detectPageHinkley(xs, tag),
      4,
      'change-point detection',
    );
    runDetector(
      'seasonal',
      () => this.detectSeasonal(xs, tag),
      this.cfg.seasonalPeriod * 2,
      `phase period = ${this.cfg.seasonalPeriod}`,
    );

    // Custom detectors (append-only extensions)
    for (const d of this.customDetectors) {
      try {
        const extra = d.fn(xs, this);
        summary[d.name] = {
          ran: true,
          alerts: extra.length,
          notes: 'custom detector',
        };
        for (const a of extra) alerts.push(a);
      } catch (e) {
        summary[d.name] = {
          ran: false,
          alerts: 0,
          notes: `custom detector error: ${(e as Error).message}`,
        };
      }
    }

    // Suppression pass — report is full, but 'fired' events respect cooldown
    for (const a of alerts) {
      this.emit('alert', a);
      if (!this.isSuppressed(a)) {
        this.recordFire(a);
        this.emit('fired', a);
      }
    }

    return {
      pointCount: xs.length,
      alerts,
      summary,
      stats,
    };
  }

  /* ───────────── Streaming mode / מצב זרימה ───────────── */

  /**
   * Feed a single value. Maintains a ring buffer, runs lightweight detectors
   * (EWMA + Page-Hinkley incrementally, z-score/MAD over history window),
   * and emits 'alert'/'fired' events as appropriate.
   */
  update(value: number, tag?: string): AnomalyAlert[] {
    if (!isFiniteNum(value)) return [];

    // Append to history
    this.history.push(value);
    if (this.history.length > this.cfg.historyCap) {
      this.history.shift();
    }

    const fired: AnomalyAlert[] = [];

    // Incremental EWMA + control limits (use running warmup baseline)
    if (!this.ewmaInit) {
      this.ewmaS = value;
      this.ewmaInit = true;
    } else {
      const a = this.cfg.ewmaAlpha;
      this.ewmaS = a * value + (1 - a) * this.ewmaS;
    }
    if (this.history.length >= 5) {
      const warmup = this.history.slice(
        0,
        Math.max(2, Math.floor(this.history.length / 3)),
      );
      const mu0 = mean(warmup);
      const sd0 = stdev(warmup, mu0);
      if (sd0 > 0) {
        const L = this.cfg.ewmaL;
        const alpha = this.cfg.ewmaAlpha;
        const n = this.history.length;
        const factor = Math.sqrt(
          (alpha / (2 - alpha)) * (1 - Math.pow(1 - alpha, 2 * n)),
        );
        const ucl = mu0 + L * sd0 * factor;
        const lcl = mu0 - L * sd0 * factor;
        if (this.ewmaS > ucl || this.ewmaS < lcl) {
          const dev = this.ewmaS - mu0;
          const score = dev / (sd0 * factor || 1);
          const alert = this.buildAlert({
            detector: 'ewma',
            index: this.history.length - 1,
            value,
            expected: mu0,
            score,
            threshold: L,
            tag,
            explainHe: `זרימה: EWMA חצה ${L}σ. ממוצע משוקלל ${this.ewmaS.toFixed(2)}, בסיס ${mu0.toFixed(2)}.`,
            explainEn: `Streaming: EWMA breached ${L}σ. Smoothed ${this.ewmaS.toFixed(2)} vs baseline ${mu0.toFixed(2)}.`,
          });
          this.processAlert(alert, fired);
        }
      }
    }

    // Incremental Page-Hinkley
    this.phN++;
    this.phMean = this.phMean + (value - this.phMean) / this.phN;
    if (this.phN > 1) {
      const inc = value - this.phMean - this.cfg.phDelta;
      this.phMt += inc;
      if (this.phMt < this.phMinMt) this.phMinMt = this.phMt;
      const phUp = this.phMt - this.phMinMt;
      if (phUp > this.cfg.phLambda) {
        const alert = this.buildAlert({
          detector: 'pageHinkley',
          index: this.history.length - 1,
          value,
          expected: this.phMean,
          score: phUp,
          threshold: this.cfg.phLambda,
          tag,
          explainHe: `זרימה: Page-Hinkley זיהה שינוי מגמה (PH=${phUp.toFixed(2)}).`,
          explainEn: `Streaming: Page-Hinkley change-point (PH=${phUp.toFixed(2)}).`,
        });
        this.processAlert(alert, fired);
        // reset
        this.phMt = 0;
        this.phMinMt = 0;
      }
    }

    // Windowed z-score / MAD on history (once we have enough points)
    if (this.history.length >= 20) {
      const win = this.history.slice(-Math.min(200, this.history.length));
      const mu = mean(win);
      const sd = stdev(win, mu);
      if (sd > 0) {
        const z = (value - mu) / sd;
        if (Math.abs(z) >= this.cfg.zScoreThreshold) {
          const alert = this.buildAlert({
            detector: 'zScore',
            index: this.history.length - 1,
            value,
            expected: mu,
            score: z,
            threshold: this.cfg.zScoreThreshold,
            tag,
            explainHe: `זרימה: ציון Z=${z.toFixed(2)} בחלון ${win.length} נקודות.`,
            explainEn: `Streaming: z-score=${z.toFixed(2)} over ${win.length}-point window.`,
          });
          this.processAlert(alert, fired);
        }
      }
      const med = median(win);
      const m = madConsistent(win);
      if (m > 0) {
        const madScore = (value - med) / m;
        if (Math.abs(madScore) >= this.cfg.madThreshold) {
          const alert = this.buildAlert({
            detector: 'mad',
            index: this.history.length - 1,
            value,
            expected: med,
            score: madScore,
            threshold: this.cfg.madThreshold,
            tag,
            explainHe: `זרימה: MAD=${madScore.toFixed(2)} בחלון ${win.length} נקודות.`,
            explainEn: `Streaming: MAD score=${madScore.toFixed(2)} over ${win.length}-point window.`,
          });
          this.processAlert(alert, fired);
        }
      }
    }

    return fired;
  }

  private processAlert(alert: AnomalyAlert, fired: AnomalyAlert[]): void {
    this.emit('alert', alert);
    if (!this.isSuppressed(alert)) {
      this.recordFire(alert);
      this.emit('fired', alert);
      fired.push(alert);
    }
  }

  /* ───────────── Suppression / דיכוי אזעקות ───────────── */

  private keyFor(a: AnomalyAlert): string {
    return `${a.detector}:${a.tag ?? 'default'}`;
  }

  private isSuppressed(a: AnomalyAlert): boolean {
    const now = this.cfg.now();
    const key = this.keyFor(a);

    // Cooldown check
    const last = this.lastFired.get(key);
    if (last !== undefined && now - last < this.cfg.cooldownMs) return true;

    // Rate-limit window check
    // Clean outdated entries first
    const winStart = now - this.cfg.suppressionWindowMs;
    this.alertHistory = this.alertHistory.filter((e) => e.ts >= winStart);
    const recentSameKey = this.alertHistory.filter((e) => e.key === key).length;
    if (recentSameKey >= this.cfg.maxAlertsPerWindow) return true;
    return false;
  }

  private recordFire(a: AnomalyAlert): void {
    const now = this.cfg.now();
    this.lastFired.set(this.keyFor(a), now);
    this.alertHistory.push({ key: this.keyFor(a), ts: now });
  }

  /**
   * Explicitly clear suppression state for a key (or all).
   * Does NOT delete detectors or history — only the cooldown tracker.
   */
  clearSuppression(detector?: DetectorName, tag?: string): void {
    if (!detector) {
      this.lastFired.clear();
      this.alertHistory = [];
      this.emit('cleared', { reason: 'all suppression cleared' });
      return;
    }
    const key = `${detector}:${tag ?? 'default'}`;
    this.lastFired.delete(key);
    this.alertHistory = this.alertHistory.filter((e) => e.key !== key);
    this.emit('cleared', { reason: `suppression cleared for ${key}` });
  }

  /**
   * Reset streaming state (EWMA, Page-Hinkley, history) but NEVER deletes
   * registered detectors or event subscribers. Upgrade-only philosophy.
   */
  resetStream(): void {
    this.history = [];
    this.phMean = 0;
    this.phN = 0;
    this.phMt = 0;
    this.phMinMt = 0;
    this.ewmaS = 0;
    this.ewmaInit = false;
    this.emit('reset', { reason: 'stream state reset' });
  }

  /* ───────────── Introspection helpers ───────────── */

  getHistory(): readonly number[] {
    return this.history.slice();
  }

  getConfig(): Readonly<Required<Omit<AnomalyEngineConfig, 'now'>>> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { now: _now, ...rest } = this.cfg;
    return rest;
  }

  /* ───────────── Internal builders ───────────── */

  private buildAlert(p: {
    detector: DetectorName;
    index: number;
    value: number;
    expected: number;
    score: number;
    threshold: number;
    tag?: string;
    explainHe: string;
    explainEn: string;
  }): AnomalyAlert {
    const severity = classifySeverity(p.score, p.threshold);
    return {
      detector: p.detector,
      index: p.index,
      value: p.value,
      expected: p.expected,
      score: p.score,
      threshold: p.threshold,
      severity,
      explanation: {
        he: `[${severity.toUpperCase()}] ${p.explainHe}`,
        en: `[${severity.toUpperCase()}] ${p.explainEn}`,
      },
      timestamp: this.cfg.now(),
      tag: p.tag,
    };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Named exports for tests / ייצוא שמי עבור טסטים
 * ────────────────────────────────────────────────────────────────────────── */

export const __internals__ = {
  mean,
  stdev,
  median,
  quantile,
  madConsistent,
  rawMad,
  classifySeverity,
  sanitize,
};
