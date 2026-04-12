/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — Auto-Insights Generator (Agent Y-152)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scans tabular datasets and produces ranked, bilingual (Hebrew + English)
 * observations for the Techno-Kol Uzi mega-ERP.
 *
 * PRINCIPLES:
 *   - "לא מוחקים רק משדרגים ומגדלים" — only additive additions; no deletions
 *   - Zero external dependencies — Node built-ins only (none imported here)
 *   - Bilingual RTL output with raw numeric evidence for audit
 *   - Deterministic: same input → same ranked output
 *
 * DETECTORS:
 *   1.  spikeDip          — 3-sigma spike / dip detection on time-series
 *   2.  topMovers         — largest period-over-period deltas by dimension
 *   3.  unusualCategories — categories far from median share (IQR fence)
 *   4.  correlations      — Pearson correlation surprises between numerics
 *   5.  missingStale      — missing / stale data alerts
 *   6.  concentrationHHI  — Herfindahl–Hirschman concentration risk
 *   7.  plateauGrowth     — flat vs trending windows (linear fit)
 *
 * Each insight obeys the Insight interface below and carries raw numeric
 * evidence so downstream reviewers can reproduce the claim by hand.
 *
 * Severity scale (integer 1..10):
 *   1-3  informational  — useful context, no action required
 *   4-6  notable        — worth reviewing this week
 *   7-8  high           — action recommended within 24-48h
 *   9-10 critical       — investigate immediately
 *
 * Confidence scale (float 0..1): statistical confidence, NOT severity.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row in a tabular dataset. Dynamic keys by design. */
export type Row = Record<string, unknown>;

/** The raw numeric evidence attached to every insight. */
export interface Evidence {
  // Generic numeric slots — detectors fill the ones relevant to them.
  // Unused slots stay undefined so the JSON payload stays compact.
  mean?: number;
  stdev?: number;
  median?: number;
  min?: number;
  max?: number;
  z?: number;
  value?: number;
  previous?: number;
  delta?: number;
  deltaPct?: number;
  share?: number;
  hhi?: number;
  correlation?: number;
  slope?: number;
  sampleSize?: number;
  threshold?: number;
  days?: number;
  // Optional category / index payload
  category?: string;
  column?: string;
  xColumn?: string;
  yColumn?: string;
  index?: number;
  // Catch-all for any detector that wants to attach extra numeric facts
  extras?: Record<string, number | string>;
}

/**
 * A single ranked insight. The id is stable across runs when given the
 * same input, and is prefixed with the detector name so callers can group
 * insights by source.
 */
export interface Insight {
  id: string;
  severity: number;          // 1..10
  confidence: number;        // 0..1
  detector: InsightDetector; // which detector emitted this
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  evidence: Evidence;
  suggestion: { he: string; en: string };
}

export type InsightDetector =
  | 'spikeDip'
  | 'topMovers'
  | 'unusualCategories'
  | 'correlations'
  | 'missingStale'
  | 'concentrationHHI'
  | 'plateauGrowth';

/** Column declarations driving the detectors. All fields optional. */
export interface InsightConfig {
  /** Columns to treat as numeric (spike/dip, correlations, plateau, etc.) */
  numericColumns?: string[];
  /** Columns to treat as categorical (unusualCategories, HHI, topMovers) */
  categoricalColumns?: string[];
  /** Single timestamp / period column (ISO date or Date) */
  timestampColumn?: string;
  /** Optional "value" column to aggregate by category for HHI / topMovers */
  valueColumn?: string;

  /** 3-sigma threshold (default 3.0) */
  zThreshold?: number;
  /** Minimum series length to run spike / plateau analyses */
  minSeriesLength?: number;
  /** HHI thresholds: >= highRisk → concentration critical (default 0.25) */
  hhiHighRisk?: number;
  /** HHI moderate risk threshold (default 0.15) */
  hhiModerateRisk?: number;
  /** Stale-data threshold in days (default 30) */
  staleDays?: number;
  /** Correlation |r| threshold to treat as a surprise (default 0.7) */
  correlationThreshold?: number;
  /** Plateau: slope magnitude below which we call "plateau" (default 0.01) */
  plateauSlopeThreshold?: number;
  /** Today's date for staleness math. Defaults to new Date(). */
  asOf?: Date;
  /** Maximum insights returned. Defaults to unlimited (0). */
  maxResults?: number;
  /** Minimum severity to emit. Defaults to 1 (all). */
  minSeverity?: number;
}

// ---------------------------------------------------------------------------
// Internal numeric helpers (pure, no side-effects)
// ---------------------------------------------------------------------------

/** Robust mean that ignores non-finite numbers. */
export function mean(values: readonly number[]): number {
  if (!values.length) return 0;
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/** Sample standard deviation (n-1) — ignores non-finite numbers. */
export function stdev(values: readonly number[]): number {
  const finite: number[] = [];
  for (const v of values) {
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length < 2) return 0;
  const m = mean(finite);
  let sumSq = 0;
  for (const v of finite) {
    const d = v - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (finite.length - 1));
}

/** Median (linear interpolation at the midpoint of even-length series). */
export function median(values: readonly number[]): number {
  const finite: number[] = [];
  for (const v of values) {
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Quartile (simple method: sort + index). q ∈ {0.25, 0.5, 0.75}. */
export function quartile(values: readonly number[], q: number): number {
  const finite: number[] = [];
  for (const v of values) {
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[Math.min(base + 1, sorted.length - 1)];
  return sorted[base] + rest * (next - sorted[base]);
}

/** Pearson correlation coefficient in [-1, 1]; returns 0 if degenerate. */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length) return 0;
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let valid = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    valid += 1;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  if (valid < 2) return 0;
  const num = valid * sumXY - sumX * sumY;
  const denom = Math.sqrt(
    (valid * sumX2 - sumX * sumX) * (valid * sumY2 - sumY * sumY),
  );
  return denom === 0 ? 0 : num / denom;
}

/** Ordinary least-squares slope of y on x (per unit x). 0 if degenerate. */
export function linearSlope(
  xs: readonly number[],
  ys: readonly number[],
): number {
  if (xs.length !== ys.length) return 0;
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

/** HHI = sum of squared shares (0..1). */
export function herfindahl(shares: readonly number[]): number {
  let sum = 0;
  for (const s of shares) {
    if (Number.isFinite(s)) sum += s * s;
  }
  return sum;
}

/** Coerce any cell to a finite number, or NaN if impossible. */
export function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  if (v instanceof Date) return v.getTime();
  return NaN;
}

/** Coerce any cell to a Date or null. Accepts Date, ISO string, epoch ms. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Clamp n into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Format a number with up to 2 decimals and thousands separators. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const parts = n.toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** Signed-percent formatting for deltas. */
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmt(n * 100)}%`;
}

// ---------------------------------------------------------------------------
// AutoInsights — main class
// ---------------------------------------------------------------------------

export class AutoInsights {
  private readonly cfg: Required<InsightConfig>;

  constructor(config: InsightConfig = {}) {
    this.cfg = {
      numericColumns: config.numericColumns ?? [],
      categoricalColumns: config.categoricalColumns ?? [],
      timestampColumn: config.timestampColumn ?? '',
      valueColumn: config.valueColumn ?? '',
      zThreshold: config.zThreshold ?? 3.0,
      minSeriesLength: config.minSeriesLength ?? 5,
      hhiHighRisk: config.hhiHighRisk ?? 0.25,
      hhiModerateRisk: config.hhiModerateRisk ?? 0.15,
      staleDays: config.staleDays ?? 30,
      correlationThreshold: config.correlationThreshold ?? 0.7,
      plateauSlopeThreshold: config.plateauSlopeThreshold ?? 0.01,
      asOf: config.asOf ?? new Date(),
      maxResults: config.maxResults ?? 0,
      minSeverity: config.minSeverity ?? 1,
    };
  }

  /**
   * Scan the dataset with all detectors, rank, de-duplicate and return.
   * Safe to call on an empty dataset — returns an empty array.
   */
  analyze(dataset: readonly Row[], configOverride?: InsightConfig): Insight[] {
    // Allow per-call overrides without mutating the instance config.
    const effective = configOverride
      ? new AutoInsights({ ...this.cfg, ...configOverride })
      : this;
    const cfg = effective.cfg;
    const rows = Array.isArray(dataset) ? dataset : [];

    const out: Insight[] = [];

    // 1. Spike / dip detector on every numeric column
    for (const col of cfg.numericColumns) {
      out.push(...effective.detectSpikeDip(rows, col));
    }

    // 2. Top movers (requires timestamp + value + categorical)
    if (cfg.timestampColumn && cfg.valueColumn) {
      for (const cat of cfg.categoricalColumns) {
        out.push(...effective.detectTopMovers(rows, cat));
      }
    }

    // 3. Unusual categories — IQR fence on category shares
    if (cfg.valueColumn) {
      for (const cat of cfg.categoricalColumns) {
        out.push(...effective.detectUnusualCategories(rows, cat));
      }
    }

    // 4. Correlation surprises — all pairs of numeric columns
    if (cfg.numericColumns.length >= 2) {
      out.push(...effective.detectCorrelations(rows));
    }

    // 5. Missing / stale data alerts
    out.push(...effective.detectMissingStale(rows));

    // 6. Concentration risk (HHI) per categorical column
    if (cfg.valueColumn) {
      for (const cat of cfg.categoricalColumns) {
        out.push(...effective.detectConcentration(rows, cat));
      }
    }

    // 7. Plateau / growth per numeric column (time-series)
    for (const col of cfg.numericColumns) {
      out.push(...effective.detectPlateauGrowth(rows, col));
    }

    // Apply severity floor
    const filtered = out.filter((i) => i.severity >= cfg.minSeverity);

    // Rank: severity desc → confidence desc → id asc (stable)
    filtered.sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.id.localeCompare(b.id);
    });

    if (cfg.maxResults > 0 && filtered.length > cfg.maxResults) {
      filtered.length = cfg.maxResults;
    }
    return filtered;
  }

  // -------------------------------------------------------------------------
  // Detector 1 — spike / dip (3-sigma)
  // -------------------------------------------------------------------------

  detectSpikeDip(rows: readonly Row[], column: string): Insight[] {
    const series = rows
      .map((r, idx) => ({ idx, v: toNum(r[column]) }))
      .filter((p) => Number.isFinite(p.v));
    if (series.length < this.cfg.minSeriesLength) return [];

    const values = series.map((p) => p.v);
    const m = mean(values);
    const s = stdev(values);
    if (s === 0) return [];

    const out: Insight[] = [];
    for (const point of series) {
      const z = (point.v - m) / s;
      if (Math.abs(z) < this.cfg.zThreshold) continue;
      const isSpike = z > 0;
      const severity = clamp(Math.round(4 + Math.abs(z)), 4, 10);
      const confidence = clamp(1 - 1 / (1 + Math.abs(z)), 0.5, 0.99);

      out.push({
        id: `spikeDip:${column}:${point.idx}`,
        severity,
        confidence,
        detector: 'spikeDip',
        titleHe: isSpike
          ? `זינוק חריג ב-${column} (שורה ${point.idx + 1})`
          : `צניחה חריגה ב-${column} (שורה ${point.idx + 1})`,
        titleEn: isSpike
          ? `Extreme spike in ${column} (row ${point.idx + 1})`
          : `Extreme dip in ${column} (row ${point.idx + 1})`,
        bodyHe:
          `הערך ${fmt(point.v)} סוטה ב-${fmt(z)} סטיות תקן מהממוצע ` +
          `${fmt(m)} (σ=${fmt(s)}). סף זיהוי: ${fmt(this.cfg.zThreshold)}σ.`,
        bodyEn:
          `Value ${fmt(point.v)} is ${fmt(z)} standard deviations from ` +
          `the mean ${fmt(m)} (σ=${fmt(s)}). Threshold: ${fmt(
            this.cfg.zThreshold,
          )}σ.`,
        evidence: {
          value: point.v,
          mean: m,
          stdev: s,
          z,
          threshold: this.cfg.zThreshold,
          sampleSize: values.length,
          column,
          index: point.idx,
        },
        suggestion: {
          he: isSpike
            ? 'בדקו האם מדובר בחיוב כפול, מבצע חד-פעמי או טעות הקלדה.'
            : 'בדקו האם בוצע זיכוי, ביטול עסקה או נפילה טכנית של המקור.',
          en: isSpike
            ? 'Verify whether this is a double charge, one-off promo, or data-entry error.'
            : 'Verify whether a refund, cancellation, or upstream outage occurred.',
        },
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Detector 2 — top movers (largest period-over-period delta by category)
  // -------------------------------------------------------------------------

  detectTopMovers(rows: readonly Row[], categoricalColumn: string): Insight[] {
    const tsCol = this.cfg.timestampColumn;
    const valCol = this.cfg.valueColumn;
    if (!tsCol || !valCol) return [];

    // Aggregate value by (period, category) where period = yyyy-mm.
    const periodTotals = new Map<string, Map<string, number>>();
    const periods = new Set<string>();
    for (const r of rows) {
      const d = toDate(r[tsCol]);
      const v = toNum(r[valCol]);
      const cat = r[categoricalColumn];
      if (!d || !Number.isFinite(v) || cat == null) continue;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        '0',
      )}`;
      periods.add(key);
      const catKey = String(cat);
      if (!periodTotals.has(catKey)) periodTotals.set(catKey, new Map());
      const row = periodTotals.get(catKey)!;
      row.set(key, (row.get(key) ?? 0) + v);
    }
    const sortedPeriods = [...periods].sort();
    if (sortedPeriods.length < 2) return [];
    const last = sortedPeriods[sortedPeriods.length - 1];
    const prev = sortedPeriods[sortedPeriods.length - 2];

    const out: Insight[] = [];
    for (const [cat, byPeriod] of periodTotals) {
      const curr = byPeriod.get(last) ?? 0;
      const before = byPeriod.get(prev) ?? 0;
      if (curr === 0 && before === 0) continue;
      const delta = curr - before;
      if (Math.abs(delta) < 1e-9) continue;
      const deltaPct = before === 0 ? 1 : delta / Math.abs(before);
      if (Math.abs(deltaPct) < 0.25) continue; // skip < 25% swings

      const isGain = delta > 0;
      const severity = clamp(Math.round(3 + Math.abs(deltaPct) * 6), 3, 10);
      const confidence = clamp(
        0.55 + Math.min(Math.abs(deltaPct), 1) * 0.35,
        0.55,
        0.95,
      );

      out.push({
        id: `topMovers:${categoricalColumn}:${cat}`,
        severity,
        confidence,
        detector: 'topMovers',
        titleHe: isGain
          ? `עלייה חדה בקטגוריה "${cat}"`
          : `ירידה חדה בקטגוריה "${cat}"`,
        titleEn: isGain
          ? `Sharp increase in category "${cat}"`
          : `Sharp decrease in category "${cat}"`,
        bodyHe:
          `בחודש ${last} הקטגוריה "${cat}" הגיעה ל-${fmt(curr)} לעומת ` +
          `${fmt(before)} בחודש ${prev} — שינוי של ${fmtPct(deltaPct)}.`,
        bodyEn:
          `In ${last}, category "${cat}" reached ${fmt(curr)} versus ` +
          `${fmt(before)} in ${prev} — a swing of ${fmtPct(deltaPct)}.`,
        evidence: {
          value: curr,
          previous: before,
          delta,
          deltaPct,
          category: String(cat),
          column: categoricalColumn,
        },
        suggestion: {
          he: isGain
            ? 'ודאו שיש כיסוי מלאי ותזרים תומך לצמיחה, ובדקו אם הצמיחה בת-קיימא.'
            : 'הפעילו שיחה עם בעל הקטגוריה ובדקו אם נדרשת התאמת רכש או תקציב.',
          en: isGain
            ? 'Ensure inventory & cash flow cover the spike; verify it is sustainable.'
            : 'Escalate with the category owner and review procurement / budget alignment.',
        },
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Detector 3 — unusual categories (IQR fence on per-category totals)
  // -------------------------------------------------------------------------

  detectUnusualCategories(
    rows: readonly Row[],
    categoricalColumn: string,
  ): Insight[] {
    const valCol = this.cfg.valueColumn;
    if (!valCol) return [];
    const totals = new Map<string, number>();
    for (const r of rows) {
      const v = toNum(r[valCol]);
      const cat = r[categoricalColumn];
      if (!Number.isFinite(v) || cat == null) continue;
      const key = String(cat);
      totals.set(key, (totals.get(key) ?? 0) + v);
    }
    if (totals.size < 4) return [];

    const values = [...totals.values()];
    const q1 = quartile(values, 0.25);
    const q3 = quartile(values, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) return [];
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const med = median(values);
    const grand = values.reduce((a, b) => a + b, 0);

    const out: Insight[] = [];
    for (const [cat, total] of totals) {
      if (total <= upperFence && total >= lowerFence) continue;
      const isHigh = total > upperFence;
      const share = grand === 0 ? 0 : total / grand;
      const severity = clamp(
        Math.round(5 + (Math.abs(total - med) / (iqr || 1)) * 0.5),
        5,
        9,
      );
      const confidence = clamp(0.6 + share * 0.3, 0.6, 0.95);

      out.push({
        id: `unusualCategories:${categoricalColumn}:${cat}`,
        severity,
        confidence,
        detector: 'unusualCategories',
        titleHe: isHigh
          ? `קטגוריה חריגה כלפי מעלה: "${cat}"`
          : `קטגוריה חריגה כלפי מטה: "${cat}"`,
        titleEn: isHigh
          ? `Unusually large category: "${cat}"`
          : `Unusually small category: "${cat}"`,
        bodyHe:
          `הסכום הכולל של "${cat}" עומד על ${fmt(total)}, ` +
          `מול חציון של ${fmt(med)} וגבולות IQR [${fmt(lowerFence)}..${fmt(
            upperFence,
          )}]. נתח מסך הנתונים: ${fmtPct(share)}.`,
        bodyEn:
          `Category "${cat}" totals ${fmt(total)} vs median ${fmt(med)} ` +
          `and IQR fence [${fmt(lowerFence)}..${fmt(upperFence)}]. Share: ${fmtPct(
            share,
          )}.`,
        evidence: {
          value: total,
          median: med,
          min: lowerFence,
          max: upperFence,
          share,
          category: String(cat),
          column: categoricalColumn,
          sampleSize: values.length,
        },
        suggestion: {
          he: isHigh
            ? 'בדקו אם הקטגוריה צריכה להתפצל או אם יש כפילויות בסיווג.'
            : 'בחנו אם הקטגוריה רלוונטית, או שיש לאחד אותה עם קטגוריה סמוכה.',
          en: isHigh
            ? 'Consider splitting or deduplicating this category in master data.'
            : 'Consider merging this category with an adjacent one or archiving it.',
        },
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Detector 4 — correlation surprises between numeric columns
  // -------------------------------------------------------------------------

  detectCorrelations(rows: readonly Row[]): Insight[] {
    const cols = this.cfg.numericColumns;
    const out: Insight[] = [];
    for (let i = 0; i < cols.length; i += 1) {
      for (let j = i + 1; j < cols.length; j += 1) {
        const a = cols[i];
        const b = cols[j];
        const xs: number[] = [];
        const ys: number[] = [];
        for (const r of rows) {
          const x = toNum(r[a]);
          const y = toNum(r[b]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
          }
        }
        if (xs.length < this.cfg.minSeriesLength) continue;
        const r = pearson(xs, ys);
        if (Math.abs(r) < this.cfg.correlationThreshold) continue;
        const positive = r > 0;
        const severity = clamp(Math.round(4 + Math.abs(r) * 5), 4, 9);
        const confidence = clamp(Math.abs(r), 0.6, 0.99);

        out.push({
          id: `correlations:${a}:${b}`,
          severity,
          confidence,
          detector: 'correlations',
          titleHe: positive
            ? `מתאם חזק חיובי בין ${a} ל-${b}`
            : `מתאם חזק שלילי בין ${a} ל-${b}`,
          titleEn: positive
            ? `Strong positive correlation between ${a} and ${b}`
            : `Strong negative correlation between ${a} and ${b}`,
          bodyHe:
            `מקדם פירסון r=${fmt(r)} מעל סף ${fmt(
              this.cfg.correlationThreshold,
            )} על ${xs.length} נקודות. יש קשר סטטיסטי עקבי בין ${a} ל-${b}.`,
          bodyEn:
            `Pearson r=${fmt(r)} above threshold ${fmt(
              this.cfg.correlationThreshold,
            )} over ${xs.length} observations. Consistent link between ${a} and ${b}.`,
          evidence: {
            correlation: r,
            threshold: this.cfg.correlationThreshold,
            sampleSize: xs.length,
            xColumn: a,
            yColumn: b,
          },
          suggestion: {
            he: 'שקלו להוסיף את הצמד כתכונות לחיזוי במודל תחזית הביקוש או התקציב.',
            en: 'Consider feeding this pair into the demand / budget forecasting model.',
          },
        });
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Detector 5 — missing / stale data alerts
  // -------------------------------------------------------------------------

  detectMissingStale(rows: readonly Row[]): Insight[] {
    const out: Insight[] = [];
    if (rows.length === 0) {
      out.push({
        id: 'missingStale:emptyDataset',
        severity: 10,
        confidence: 1,
        detector: 'missingStale',
        titleHe: 'מאגר הנתונים ריק',
        titleEn: 'Dataset is empty',
        bodyHe: 'לא התקבלו שורות לניתוח. ודאו שה-ETL פעל בהצלחה.',
        bodyEn: 'No rows received for analysis. Verify the ETL run succeeded.',
        evidence: { sampleSize: 0 },
        suggestion: {
          he: 'בדקו את יומן ה-ETL וטריגר את טעינת הנתונים מחדש.',
          en: 'Inspect the ETL log and re-trigger the dataset load.',
        },
      });
      return out;
    }

    // Missing value ratio per configured numeric/categorical column.
    const cols = new Set<string>([
      ...this.cfg.numericColumns,
      ...this.cfg.categoricalColumns,
    ]);
    if (this.cfg.valueColumn) cols.add(this.cfg.valueColumn);

    for (const col of cols) {
      let missing = 0;
      for (const r of rows) {
        const v = r[col];
        if (v === null || v === undefined || v === '') missing += 1;
      }
      const share = missing / rows.length;
      if (share < 0.1) continue;
      const severity = clamp(Math.round(4 + share * 6), 4, 9);
      out.push({
        id: `missingStale:missing:${col}`,
        severity,
        confidence: clamp(0.7 + share * 0.25, 0.7, 0.99),
        detector: 'missingStale',
        titleHe: `שיעור ערכים חסרים גבוה בעמודה ${col}`,
        titleEn: `High missing-value rate in column ${col}`,
        bodyHe:
          `בעמודה ${col} חסרים ${missing} מתוך ${rows.length} שורות ` +
          `(${fmtPct(share)}). החורים פוגעים באיכות הדוחות.`,
        bodyEn:
          `Column ${col} has ${missing} of ${rows.length} rows missing ` +
          `(${fmtPct(share)}). Reporting quality is impacted.`,
        evidence: {
          value: missing,
          sampleSize: rows.length,
          share,
          column: col,
        },
        suggestion: {
          he: 'הגדירו כלל חובה במקור הנתונים או הוסיפו ערך ברירת מחדל ב-ETL.',
          en: 'Add a NOT-NULL rule at the source or set a default in the ETL.',
        },
      });
    }

    // Stale-data alert based on timestamp column.
    if (this.cfg.timestampColumn) {
      let latest: number | null = null;
      for (const r of rows) {
        const d = toDate(r[this.cfg.timestampColumn]);
        if (!d) continue;
        const ms = d.getTime();
        if (latest === null || ms > latest) latest = ms;
      }
      if (latest !== null) {
        const ageDays = (this.cfg.asOf.getTime() - latest) / 86_400_000;
        if (ageDays >= this.cfg.staleDays) {
          const severity = clamp(
            Math.round(4 + (ageDays / this.cfg.staleDays) * 2),
            4,
            10,
          );
          out.push({
            id: `missingStale:stale:${this.cfg.timestampColumn}`,
            severity,
            confidence: 0.95,
            detector: 'missingStale',
            titleHe: `הנתונים בעמודה ${this.cfg.timestampColumn} מיושנים`,
            titleEn: `Data in column ${this.cfg.timestampColumn} is stale`,
            bodyHe:
              `הנתון האחרון הוא לפני ${fmt(ageDays)} ימים. ` +
              `סף התרעה: ${this.cfg.staleDays} ימים.`,
            bodyEn:
              `Most recent record is ${fmt(ageDays)} days old. ` +
              `Alert threshold: ${this.cfg.staleDays} days.`,
            evidence: {
              days: ageDays,
              threshold: this.cfg.staleDays,
              column: this.cfg.timestampColumn,
              sampleSize: rows.length,
            },
            suggestion: {
              he: 'הפעילו מחדש את משימת הסנכרון או בדקו תקלה במקור הנתונים.',
              en: 'Re-run the sync job or investigate the upstream source.',
            },
          });
        }
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Detector 6 — concentration risk (Herfindahl index)
  // -------------------------------------------------------------------------

  detectConcentration(
    rows: readonly Row[],
    categoricalColumn: string,
  ): Insight[] {
    const valCol = this.cfg.valueColumn;
    if (!valCol) return [];
    const totals = new Map<string, number>();
    let grand = 0;
    for (const r of rows) {
      const v = toNum(r[valCol]);
      const cat = r[categoricalColumn];
      if (!Number.isFinite(v) || cat == null || v <= 0) continue;
      const key = String(cat);
      totals.set(key, (totals.get(key) ?? 0) + v);
      grand += v;
    }
    if (totals.size < 2 || grand === 0) return [];
    const shares: number[] = [];
    let topShare = 0;
    let topName = '';
    for (const [cat, total] of totals) {
      const s = total / grand;
      shares.push(s);
      if (s > topShare) {
        topShare = s;
        topName = cat;
      }
    }
    const hhi = herfindahl(shares);
    if (hhi < this.cfg.hhiModerateRisk) return [];
    const critical = hhi >= this.cfg.hhiHighRisk;
    const severity = critical ? clamp(Math.round(7 + hhi * 3), 7, 10) : 5;
    const confidence = clamp(0.7 + hhi * 0.25, 0.7, 0.99);
    return [
      {
        id: `concentrationHHI:${categoricalColumn}`,
        severity,
        confidence,
        detector: 'concentrationHHI',
        titleHe: critical
          ? `סיכון ריכוזיות קריטי בעמודה ${categoricalColumn}`
          : `ריכוזיות מוגברת בעמודה ${categoricalColumn}`,
        titleEn: critical
          ? `Critical concentration risk in ${categoricalColumn}`
          : `Elevated concentration in ${categoricalColumn}`,
        bodyHe:
          `מדד הרפינדל HHI=${fmt(hhi)} (סף קריטי ${fmt(
            this.cfg.hhiHighRisk,
          )}). השחקן הדומיננטי: "${topName}" עם נתח של ${fmtPct(topShare)}.`,
        bodyEn:
          `Herfindahl HHI=${fmt(hhi)} (critical threshold ${fmt(
            this.cfg.hhiHighRisk,
          )}). Dominant player: "${topName}" at ${fmtPct(topShare)} share.`,
        evidence: {
          hhi,
          threshold: this.cfg.hhiHighRisk,
          share: topShare,
          category: topName,
          column: categoricalColumn,
          sampleSize: totals.size,
        },
        suggestion: {
          he: critical
            ? 'התחילו תוכנית גיוון ספקים/לקוחות כדי להקטין תלות אסטרטגית.'
            : 'שקלו להוסיף ספק/לקוח משני כדי להוריד את הריכוזיות.',
          en: critical
            ? 'Launch a diversification plan to reduce strategic dependency.'
            : 'Consider onboarding a secondary vendor/client to lower concentration.',
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Detector 7 — plateau / growth identifiers (linear-fit slope)
  // -------------------------------------------------------------------------

  detectPlateauGrowth(rows: readonly Row[], column: string): Insight[] {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const v = toNum(rows[i][column]);
      if (Number.isFinite(v)) {
        xs.push(i);
        ys.push(v);
      }
    }
    if (ys.length < this.cfg.minSeriesLength) return [];

    const m = mean(ys);
    if (m === 0) return [];
    const slope = linearSlope(xs, ys);
    // Normalize slope by mean so thresholds work across magnitudes.
    const normSlope = slope / Math.abs(m);
    const out: Insight[] = [];

    if (Math.abs(normSlope) < this.cfg.plateauSlopeThreshold) {
      // Plateau
      out.push({
        id: `plateauGrowth:plateau:${column}`,
        severity: 3,
        confidence: 0.7,
        detector: 'plateauGrowth',
        titleHe: `עמודה "${column}" בפלאט — צמיחה אפסית`,
        titleEn: `Column "${column}" plateauing — no growth`,
        bodyHe:
          `שיפוע נירמל=${fmt(normSlope)} מתחת לסף ${fmt(
            this.cfg.plateauSlopeThreshold,
          )}. ממוצע=${fmt(m)} לאורך ${ys.length} נקודות.`,
        bodyEn:
          `Normalized slope=${fmt(normSlope)} below threshold ${fmt(
            this.cfg.plateauSlopeThreshold,
          )}. Mean=${fmt(m)} over ${ys.length} points.`,
        evidence: {
          slope,
          mean: m,
          sampleSize: ys.length,
          threshold: this.cfg.plateauSlopeThreshold,
          column,
        },
        suggestion: {
          he: 'שקלו מנוף גידול: מחיר, מוצר חדש או ערוץ הפצה נוסף.',
          en: 'Consider a growth lever: pricing, new SKU, or another distribution channel.',
        },
      });
    } else {
      const growth = normSlope > 0;
      const magnitude = Math.abs(normSlope);
      const severity = clamp(Math.round(3 + magnitude * 50), 3, 8);
      out.push({
        id: `plateauGrowth:${growth ? 'growth' : 'decline'}:${column}`,
        severity,
        confidence: clamp(0.6 + magnitude * 5, 0.6, 0.95),
        detector: 'plateauGrowth',
        titleHe: growth
          ? `מגמת צמיחה ב-"${column}"`
          : `מגמת ירידה ב-"${column}"`,
        titleEn: growth
          ? `Growth trend in "${column}"`
          : `Decline trend in "${column}"`,
        bodyHe:
          `שיפוע נירמל=${fmt(normSlope)} (נקודות: ${ys.length}, ממוצע: ${fmt(
            m,
          )}). ` + `זיהוי מגמה ${growth ? 'חיובית' : 'שלילית'}.`,
        bodyEn:
          `Normalized slope=${fmt(normSlope)} (n=${ys.length}, mean=${fmt(m)}). ` +
          `${growth ? 'Upward' : 'Downward'} trend identified.`,
        evidence: {
          slope,
          mean: m,
          sampleSize: ys.length,
          threshold: this.cfg.plateauSlopeThreshold,
          column,
        },
        suggestion: {
          he: growth
            ? 'ודאו שתשתית הרכש / כוח האדם / התקציב יכולים לתמוך במגמה.'
            : 'תזמנו תכנית התאוששות ובדקו אם הירידה מבנית או זמנית.',
          en: growth
            ? 'Ensure procurement / headcount / budget can sustain the trend.'
            : 'Draft a recovery plan and identify whether the decline is structural.',
        },
      });
    }
    return out;
  }
}

/** Convenience factory for callers that do not want to instantiate a class. */
export function analyzeDataset(
  dataset: readonly Row[],
  config: InsightConfig = {},
): Insight[] {
  return new AutoInsights(config).analyze(dataset);
}

export default AutoInsights;
