/**
 * Benchmark Comparator — Techno-Kol Uzi mega-ERP (Agent Y-188)
 * ============================================================
 *
 * Compares a company's own KPIs against industry benchmarks for
 * Israeli SMB metal fabrication and real estate portfolios.
 *
 * Design rules:
 *   - Pure Node (no third-party dependencies).
 *   - Bilingual: every human-readable label ships in Hebrew + English.
 *   - Append-only: the class never mutates inputs, never deletes
 *     prior benchmark snapshots, and exposes an injectable benchmark
 *     table so tests (and future regulators) can override values
 *     without touching the historical defaults.
 *   - Percentile ranking: 0..100 with an explicit "higher-is-better"
 *     vs "lower-is-better" direction per metric.
 *
 * Industries supported (string keys, case-insensitive):
 *   'metal_fab'      — Israeli SMB metal fabrication (ייצור מתכת)
 *   'real_estate'    — Real estate holdings/operations (נדל"ן)
 *
 * Size tiers (enum, case-insensitive):
 *   'micro'  : <  10 employees
 *   'small'  : 10-49 employees
 *   'medium' : 50-249 employees
 *   'large'  : 250+ employees
 *
 * Metrics covered (machine keys, not all are required in every call):
 *   - grossMargin              — higher is better
 *   - operatingMargin          — higher is better
 *   - netMargin                — higher is better
 *   - ebitdaMargin             — higher is better
 *   - revenuePerEmployee       — higher is better (ILS / year)
 *   - profitPerEmployee        — higher is better (ILS / year)
 *   - dso                      — lower is better (days sales outstanding)
 *   - dpo                      — higher is better (days payable outstanding)
 *   - inventoryTurnover        — higher is better (metal fab)
 *   - capRateResidential       — higher is better (within a band, real estate)
 *   - capRateCommercial        — higher is better (within a band, real estate)
 *   - occupancyRate            — higher is better (real estate)
 *   - noiMargin                — higher is better (real estate)
 *
 * Public surface (class BenchmarkComparator):
 *   loadBenchmarks(industry, size)      -> benchmark snapshot
 *   compare(myMetrics)                  -> full comparison report
 *   percentile(metricKey, value)        -> percentile 0..100
 *   rateMetric(metricKey, value)        -> status enum + bilingual note
 *   bilingualReport(cmp)                -> Hebrew+English text report
 *   industryNotes(industry)             -> list of bilingual industry notes
 *
 * The benchmark curves are stored as five anchor points
 * (p10, p25, p50, p75, p90) per metric per size tier. This is enough
 * to interpolate linear percentile, yet compact enough to embed in
 * tests or swap out entirely via `{ benchmarks: ... }` in the ctor.
 *
 * NO DELETIONS. This file is additive-only.
 */

'use strict';

// =====================================================================
//  Constants: status codes, directions, and enums
// =====================================================================

const STATUS_EXCELLENT = 'EXCELLENT';
const STATUS_ABOVE_AVG = 'ABOVE_AVG';
const STATUS_AVERAGE = 'AVERAGE';
const STATUS_BELOW_AVG = 'BELOW_AVG';
const STATUS_POOR = 'POOR';
const STATUS_UNKNOWN = 'UNKNOWN';

const STATUS_LABELS_HE = Object.freeze({
  [STATUS_EXCELLENT]: 'מצוין',
  [STATUS_ABOVE_AVG]: 'מעל הממוצע',
  [STATUS_AVERAGE]: 'ממוצע',
  [STATUS_BELOW_AVG]: 'מתחת לממוצע',
  [STATUS_POOR]: 'חלש',
  [STATUS_UNKNOWN]: 'לא ידוע',
});

const STATUS_LABELS_EN = Object.freeze({
  [STATUS_EXCELLENT]: 'Excellent',
  [STATUS_ABOVE_AVG]: 'Above average',
  [STATUS_AVERAGE]: 'Average',
  [STATUS_BELOW_AVG]: 'Below average',
  [STATUS_POOR]: 'Poor',
  [STATUS_UNKNOWN]: 'Unknown',
});

const DIR_HIGHER_BETTER = 'higher_better';
const DIR_LOWER_BETTER = 'lower_better';

// Canonical industry keys
const INDUSTRY_METAL_FAB = 'metal_fab';
const INDUSTRY_REAL_ESTATE = 'real_estate';

// Canonical size keys
const SIZE_MICRO = 'micro';
const SIZE_SMALL = 'small';
const SIZE_MEDIUM = 'medium';
const SIZE_LARGE = 'large';

const VALID_INDUSTRIES = Object.freeze([INDUSTRY_METAL_FAB, INDUSTRY_REAL_ESTATE]);
const VALID_SIZES = Object.freeze([SIZE_MICRO, SIZE_SMALL, SIZE_MEDIUM, SIZE_LARGE]);

// =====================================================================
//  Metric metadata: bilingual names, unit, direction
// =====================================================================

const METRIC_META = Object.freeze({
  grossMargin: {
    he: 'שולי רווח גולמי',
    en: 'Gross margin',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  operatingMargin: {
    he: 'שולי רווח תפעולי',
    en: 'Operating margin',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  netMargin: {
    he: 'שולי רווח נקי',
    en: 'Net margin',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  ebitdaMargin: {
    he: 'שולי EBITDA',
    en: 'EBITDA margin',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  revenuePerEmployee: {
    he: 'הכנסה לעובד (₪/שנה)',
    en: 'Revenue per employee (ILS/year)',
    unit: 'ILS',
    direction: DIR_HIGHER_BETTER,
    format: 'currency',
  },
  profitPerEmployee: {
    he: 'רווח לעובד (₪/שנה)',
    en: 'Profit per employee (ILS/year)',
    unit: 'ILS',
    direction: DIR_HIGHER_BETTER,
    format: 'currency',
  },
  dso: {
    he: 'ימי גבייה ממוצעים (DSO)',
    en: 'Days sales outstanding (DSO)',
    unit: 'days',
    direction: DIR_LOWER_BETTER,
    format: 'days',
  },
  dpo: {
    he: 'ימי תשלום ממוצעים (DPO)',
    en: 'Days payable outstanding (DPO)',
    unit: 'days',
    direction: DIR_HIGHER_BETTER,
    format: 'days',
  },
  inventoryTurnover: {
    he: 'מחזורי מלאי בשנה',
    en: 'Inventory turnover (per year)',
    unit: 'x',
    direction: DIR_HIGHER_BETTER,
    format: 'ratio',
  },
  capRateResidential: {
    he: 'Cap Rate — מגורים',
    en: 'Cap rate — residential',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  capRateCommercial: {
    he: 'Cap Rate — מסחרי',
    en: 'Cap rate — commercial',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  occupancyRate: {
    he: 'אחוז תפוסה',
    en: 'Occupancy rate',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
  noiMargin: {
    he: 'שולי NOI',
    en: 'NOI margin',
    unit: '%',
    direction: DIR_HIGHER_BETTER,
    format: 'percent',
  },
});

// =====================================================================
//  Default benchmark table — Israeli SMB, 2026 snapshot
// =====================================================================
//
// Every entry lists five anchors along the distribution:
//   p10, p25, p50 (median), p75, p90
//
// Metal fabrication anchors (Israeli SMB):
//   - Gross margin  : 25-35% typical band  (p50 ≈ 30%)
//   - Operating     :  8-15% typical band  (p50 ≈ 11.5%)
// Real estate anchors:
//   - Cap rate residential: 5-8%  (p50 ≈ 6.5%)
//   - Cap rate commercial : 6-9%  (p50 ≈ 7.5%)
//
// These come from publicly referenced Israeli SMB surveys and
// are provided as a conservative default. The whole table is
// `Object.freeze`d, and tests (or real deployments) can override
// it by passing `new BenchmarkComparator({ benchmarks: customTable })`.
//

function freezeDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.values(obj).forEach(freezeDeep);
  return Object.freeze(obj);
}

const DEFAULT_BENCHMARKS = freezeDeep({
  [INDUSTRY_METAL_FAB]: {
    [SIZE_MICRO]: {
      grossMargin: { p10: 18, p25: 22, p50: 27, p75: 32, p90: 38 },
      operatingMargin: { p10: 3, p25: 6, p50: 9, p75: 13, p90: 17 },
      netMargin: { p10: 1, p25: 3, p50: 6, p75: 9, p90: 12 },
      ebitdaMargin: { p10: 5, p25: 8, p50: 12, p75: 16, p90: 21 },
      revenuePerEmployee: { p10: 250000, p25: 350000, p50: 480000, p75: 620000, p90: 780000 },
      profitPerEmployee: { p10: 10000, p25: 25000, p50: 45000, p75: 70000, p90: 105000 },
      dso: { p10: 95, p25: 80, p50: 65, p75: 50, p90: 38 }, // lower better
      dpo: { p10: 25, p25: 35, p50: 45, p75: 58, p90: 72 },
      inventoryTurnover: { p10: 2.0, p25: 3.0, p50: 4.5, p75: 6.5, p90: 9.0 },
    },
    [SIZE_SMALL]: {
      grossMargin: { p10: 20, p25: 25, p50: 30, p75: 34, p90: 40 },
      operatingMargin: { p10: 4, p25: 8, p50: 11.5, p75: 14, p90: 18 },
      netMargin: { p10: 2, p25: 4, p50: 7, p75: 10, p90: 13 },
      ebitdaMargin: { p10: 6, p25: 10, p50: 14, p75: 18, p90: 23 },
      revenuePerEmployee: { p10: 350000, p25: 500000, p50: 680000, p75: 850000, p90: 1050000 },
      profitPerEmployee: { p10: 18000, p25: 38000, p50: 65000, p75: 95000, p90: 130000 },
      dso: { p10: 90, p25: 75, p50: 62, p75: 48, p90: 35 },
      dpo: { p10: 28, p25: 38, p50: 48, p75: 60, p90: 75 },
      inventoryTurnover: { p10: 2.5, p25: 3.5, p50: 5.0, p75: 7.0, p90: 10.0 },
    },
    [SIZE_MEDIUM]: {
      grossMargin: { p10: 22, p25: 27, p50: 32, p75: 36, p90: 42 },
      operatingMargin: { p10: 5, p25: 9, p50: 13, p75: 15, p90: 19 },
      netMargin: { p10: 3, p25: 5, p50: 8, p75: 11, p90: 14 },
      ebitdaMargin: { p10: 7, p25: 11, p50: 15.5, p75: 19, p90: 24 },
      revenuePerEmployee: { p10: 450000, p25: 650000, p50: 820000, p75: 1000000, p90: 1250000 },
      profitPerEmployee: { p10: 25000, p25: 50000, p50: 80000, p75: 115000, p90: 160000 },
      dso: { p10: 85, p25: 72, p50: 58, p75: 45, p90: 32 },
      dpo: { p10: 30, p25: 42, p50: 52, p75: 65, p90: 80 },
      inventoryTurnover: { p10: 3.0, p25: 4.0, p50: 5.5, p75: 7.5, p90: 11.0 },
    },
    [SIZE_LARGE]: {
      grossMargin: { p10: 23, p25: 28, p50: 33, p75: 37, p90: 43 },
      operatingMargin: { p10: 6, p25: 10, p50: 14, p75: 15, p90: 20 },
      netMargin: { p10: 3, p25: 6, p50: 9, p75: 12, p90: 15 },
      ebitdaMargin: { p10: 8, p25: 12, p50: 16.5, p75: 20, p90: 25 },
      revenuePerEmployee: { p10: 520000, p25: 720000, p50: 900000, p75: 1100000, p90: 1400000 },
      profitPerEmployee: { p10: 30000, p25: 60000, p50: 95000, p75: 135000, p90: 185000 },
      dso: { p10: 80, p25: 68, p50: 55, p75: 42, p90: 30 },
      dpo: { p10: 32, p25: 45, p50: 55, p75: 68, p90: 85 },
      inventoryTurnover: { p10: 3.5, p25: 4.5, p50: 6.0, p75: 8.0, p90: 12.0 },
    },
  },
  [INDUSTRY_REAL_ESTATE]: {
    [SIZE_MICRO]: {
      capRateResidential: { p10: 3.8, p25: 4.8, p50: 6.0, p75: 7.2, p90: 8.3 },
      capRateCommercial: { p10: 4.8, p25: 5.8, p50: 7.0, p75: 8.2, p90: 9.5 },
      occupancyRate: { p10: 75, p25: 82, p50: 88, p75: 93, p90: 97 },
      noiMargin: { p10: 45, p25: 52, p50: 60, p75: 68, p90: 75 },
      operatingMargin: { p10: 15, p25: 22, p50: 30, p75: 38, p90: 46 },
      netMargin: { p10: 5, p25: 10, p50: 18, p75: 26, p90: 34 },
      revenuePerEmployee: { p10: 600000, p25: 850000, p50: 1100000, p75: 1450000, p90: 1900000 },
      profitPerEmployee: { p10: 80000, p25: 140000, p50: 220000, p75: 320000, p90: 450000 },
      dso: { p10: 40, p25: 28, p50: 18, p75: 10, p90: 5 },
      dpo: { p10: 20, p25: 30, p50: 40, p75: 55, p90: 70 },
    },
    [SIZE_SMALL]: {
      capRateResidential: { p10: 4.0, p25: 5.0, p50: 6.3, p75: 7.5, p90: 8.5 },
      capRateCommercial: { p10: 5.0, p25: 6.0, p50: 7.3, p75: 8.5, p90: 9.8 },
      occupancyRate: { p10: 78, p25: 85, p50: 90, p75: 94, p90: 97 },
      noiMargin: { p10: 48, p25: 55, p50: 62, p75: 70, p90: 77 },
      operatingMargin: { p10: 17, p25: 24, p50: 32, p75: 40, p90: 48 },
      netMargin: { p10: 6, p25: 12, p50: 20, p75: 28, p90: 36 },
      revenuePerEmployee: { p10: 750000, p25: 1000000, p50: 1350000, p75: 1700000, p90: 2200000 },
      profitPerEmployee: { p10: 110000, p25: 180000, p50: 270000, p75: 380000, p90: 520000 },
      dso: { p10: 38, p25: 25, p50: 15, p75: 8, p90: 4 },
      dpo: { p10: 22, p25: 32, p50: 42, p75: 58, p90: 72 },
    },
    [SIZE_MEDIUM]: {
      capRateResidential: { p10: 4.2, p25: 5.2, p50: 6.5, p75: 7.7, p90: 8.7 },
      capRateCommercial: { p10: 5.2, p25: 6.2, p50: 7.5, p75: 8.7, p90: 10.0 },
      occupancyRate: { p10: 80, p25: 87, p50: 92, p75: 95, p90: 98 },
      noiMargin: { p10: 50, p25: 57, p50: 65, p75: 72, p90: 79 },
      operatingMargin: { p10: 18, p25: 26, p50: 34, p75: 42, p90: 50 },
      netMargin: { p10: 7, p25: 13, p50: 22, p75: 30, p90: 38 },
      revenuePerEmployee: { p10: 900000, p25: 1200000, p50: 1550000, p75: 1950000, p90: 2500000 },
      profitPerEmployee: { p10: 140000, p25: 220000, p50: 320000, p75: 440000, p90: 600000 },
      dso: { p10: 35, p25: 22, p50: 12, p75: 7, p90: 3 },
      dpo: { p10: 25, p25: 35, p50: 45, p75: 60, p90: 75 },
    },
    [SIZE_LARGE]: {
      capRateResidential: { p10: 4.5, p25: 5.4, p50: 6.6, p75: 7.8, p90: 8.8 },
      capRateCommercial: { p10: 5.4, p25: 6.4, p50: 7.6, p75: 8.8, p90: 10.2 },
      occupancyRate: { p10: 82, p25: 88, p50: 93, p75: 96, p90: 98 },
      noiMargin: { p10: 52, p25: 60, p50: 68, p75: 74, p90: 80 },
      operatingMargin: { p10: 20, p25: 28, p50: 36, p75: 44, p90: 52 },
      netMargin: { p10: 8, p25: 15, p50: 24, p75: 32, p90: 40 },
      revenuePerEmployee: { p10: 1000000, p25: 1400000, p50: 1750000, p75: 2200000, p90: 2800000 },
      profitPerEmployee: { p10: 170000, p25: 260000, p50: 370000, p75: 500000, p90: 680000 },
      dso: { p10: 32, p25: 20, p50: 10, p75: 5, p90: 2 },
      dpo: { p10: 28, p25: 38, p50: 48, p75: 62, p90: 78 },
    },
  },
});

// =====================================================================
//  Default industry notes (bilingual)
// =====================================================================

const DEFAULT_NOTES = freezeDeep({
  [INDUSTRY_METAL_FAB]: [
    {
      he: 'יצרני מתכת ישראלים מציגים בדרך כלל שולי רווח גולמי של 25%-35% ושולי רווח תפעולי של 8%-15%.',
      en: 'Israeli metal fabricators typically run 25%-35% gross margin and 8%-15% operating margin.',
    },
    {
      he: 'מחיר המתכת מוצמד בדרך כלל ל-LME, ולכן תנודות חודשיות במרווח הגולמי הן לגיטימיות ולא בהכרח אות לחולשה.',
      en: 'Metal input prices track the LME monthly, so short-term gross-margin swings do not necessarily signal weakness.',
    },
    {
      he: 'ימי גבייה (DSO) בענף נוטים להיות ארוכים (45-80 יום) בגלל עבודה מול קבלנים ראשיים.',
      en: 'DSO tends to be 45-80 days due to long payment cycles from general contractors.',
    },
    {
      he: 'מחזור מלאי של 4-6 פעמים בשנה נחשב בריא; מתחת ל-3 מעיד על עודף גלם או עבודה בתהליך.',
      en: 'Inventory turnover of 4-6x per year is healthy; below 3x suggests raw-material or WIP overstock.',
    },
    {
      he: 'הכנסה לעובד של 600K-900K ש"ח בשנה היא מדד פרודוקטיביות נפוץ לעסקים קטנים/בינוניים.',
      en: 'Revenue per employee of ILS 600K-900K/year is a common productivity benchmark for SMBs.',
    },
  ],
  [INDUSTRY_REAL_ESTATE]: [
    {
      he: 'Cap rate למגורים נע בדרך כלל בין 5%-8% בישראל; Cap rate מסחרי נוטה להיות גבוה ב-100-150 נ"ב.',
      en: 'Residential cap rates in Israel typically sit at 5%-8%; commercial is usually 100-150 bps higher.',
    },
    {
      he: 'תפוסה מעל 90% נחשבת טובה; תפוסה שמתחת ל-85% דורשת פעולה שיווקית.',
      en: 'Occupancy above 90% is healthy; below 85% warrants marketing / re-leasing action.',
    },
    {
      he: 'שולי NOI של 60%-70% מההכנסה ברוטו נחשבים סטנדרט לתיקים מנוהלים היטב.',
      en: 'NOI margins of 60%-70% of gross rent are the standard for well-managed portfolios.',
    },
    {
      he: 'ימי גבייה קצרים (פחות מ-20 יום) מעידים על ניהול דיירים טוב; מעבר ל-30 יום מחייב בחינת פיקדונות.',
      en: 'Short DSO (under 20 days) indicates strong tenant management; above 30 days calls for a deposit review.',
    },
  ],
});

// =====================================================================
//  Helpers: normalisation, interpolation, formatting
// =====================================================================

function normaliseString(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normaliseIndustry(industry) {
  const s = normaliseString(industry);
  if (s === 'metal_fab' || s === 'metalfabrication' || s === 'metal_fabrication' ||
      s === 'מתכת' || s === 'ייצור_מתכת') return INDUSTRY_METAL_FAB;
  if (s === 'real_estate' || s === 'realestate' || s === 'nadlan' || s === 'נדלן' ||
      s === 'נדל"ן' || s === 'נדל_ן') return INDUSTRY_REAL_ESTATE;
  return s;
}

function normaliseSize(size) {
  const s = normaliseString(size);
  if (s === 'micro' || s === 'zeira' || s === 'זעיר') return SIZE_MICRO;
  if (s === 'small' || s === 'sme_small' || s === 'קטן') return SIZE_SMALL;
  if (s === 'medium' || s === 'mid' || s === 'בינוני') return SIZE_MEDIUM;
  if (s === 'large' || s === 'big' || s === 'גדול') return SIZE_LARGE;
  return s;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function safeNum(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

/**
 * Linear interpolation between two anchor points to an arbitrary
 * percentile. Given (x0,y0) and (x1,y1), returns y at x.
 */
function lerp(x0, y0, x1, y1, x) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

/**
 * Convert an ascending-sorted list of anchor pairs
 * ([[p10, v10], [p25, v25], ...]) plus a value into a percentile 0..100.
 * Uses piecewise-linear interpolation; clamps to [0, 100] at the edges.
 *
 * `direction` decides whether larger values get larger percentiles
 * (higher-is-better) or smaller values get larger percentiles
 * (lower-is-better, e.g. DSO).
 */
function valueToPercentile(anchors, value, direction) {
  if (!isFiniteNumber(value)) return null;
  // anchors: [[percentile, value], ...] sorted by percentile asc.
  // For a higher-is-better metric, values should be sorted ascending
  // with percentile. For a lower-is-better metric the source curve
  // stores values descending with percentile (p10 is the worst/biggest,
  // p90 is the best/smallest); we flip the comparator here so that
  // the percentile still answers the question "better than X% of peers".
  const ascAnchors = direction === DIR_LOWER_BETTER
    ? [...anchors].map(([p, v]) => [p, v])
    : [...anchors].map(([p, v]) => [p, v]);

  // sort anchors by percentile ascending (defensive)
  ascAnchors.sort((a, b) => a[0] - b[0]);

  if (direction === DIR_HIGHER_BETTER) {
    // Values should be monotonically increasing with percentile.
    if (value <= ascAnchors[0][1]) {
      // below worst band — extrapolate toward 0 using first segment
      if (ascAnchors.length >= 2) {
        const p = lerp(ascAnchors[0][1], ascAnchors[0][0],
                       ascAnchors[1][1], ascAnchors[1][0], value);
        return clamp(p, 0, 100);
      }
      return 0;
    }
    if (value >= ascAnchors[ascAnchors.length - 1][1]) {
      if (ascAnchors.length >= 2) {
        const a = ascAnchors[ascAnchors.length - 2];
        const b = ascAnchors[ascAnchors.length - 1];
        const p = lerp(a[1], a[0], b[1], b[0], value);
        return clamp(p, 0, 100);
      }
      return 100;
    }
    for (let i = 0; i < ascAnchors.length - 1; i++) {
      const [pa, va] = ascAnchors[i];
      const [pb, vb] = ascAnchors[i + 1];
      if (value >= va && value <= vb) {
        return clamp(lerp(va, pa, vb, pb, value), 0, 100);
      }
    }
    return 50;
  }

  // DIR_LOWER_BETTER — value curve is stored with p10 biggest (worst)
  // and p90 smallest (best). We invert the "value" axis mentally.
  // For the math we sort anchors by value ascending, then linearly
  // interpolate percentile = sourcePercentileOf(valueBucket).
  const byValue = [...anchors].map(([p, v]) => [p, v]).sort((a, b) => a[1] - b[1]);
  // After sorting by value ascending, for lower-better metric the
  // first entry is the *best* (highest percentile), the last entry
  // is the *worst* (lowest percentile).
  if (value <= byValue[0][1]) return clamp(byValue[0][0], 0, 100);
  if (value >= byValue[byValue.length - 1][1]) return clamp(byValue[byValue.length - 1][0], 0, 100);
  for (let i = 0; i < byValue.length - 1; i++) {
    const [pa, va] = byValue[i];
    const [pb, vb] = byValue[i + 1];
    if (value >= va && value <= vb) {
      return clamp(lerp(va, pa, vb, pb, value), 0, 100);
    }
  }
  return 50;
}

function percentileToStatus(pct) {
  if (!isFiniteNumber(pct)) return STATUS_UNKNOWN;
  if (pct >= 80) return STATUS_EXCELLENT;
  if (pct >= 60) return STATUS_ABOVE_AVG;
  if (pct >= 40) return STATUS_AVERAGE;
  if (pct >= 20) return STATUS_BELOW_AVG;
  return STATUS_POOR;
}

function formatValue(value, format) {
  if (!isFiniteNumber(value)) return '—';
  switch (format) {
    case 'percent':
      return `${round1(value)}%`;
    case 'currency':
      return `₪${Math.round(value).toLocaleString('he-IL')}`;
    case 'days':
      return `${Math.round(value)}d`;
    case 'ratio':
      return `${round1(value)}x`;
    default:
      return String(round1(value));
  }
}

// =====================================================================
//  BenchmarkComparator class
// =====================================================================

class BenchmarkComparator {
  /**
   * @param {object} [opts]
   * @param {object} [opts.benchmarks] — full benchmark table override.
   * @param {object} [opts.notes]      — industry notes override.
   * @param {string} [opts.locale]     — 'he' | 'en' default 'he'.
   */
  constructor(opts = {}) {
    this.benchmarks = opts.benchmarks || DEFAULT_BENCHMARKS;
    this.notes = opts.notes || DEFAULT_NOTES;
    this.locale = (opts.locale === 'en') ? 'en' : 'he';
    this._currentIndustry = null;
    this._currentSize = null;
    this._currentSnapshot = null;
  }

  /**
   * Load a benchmark snapshot for the given industry and size.
   * Returns a plain object shaped like:
   *   { industry, size, metrics: { metricKey: { p10, p25, p50, p75, p90 } } }
   *
   * Throws on unknown industry / size if no explicit benchmark is
   * available.
   */
  loadBenchmarks(industry, size) {
    const ind = normaliseIndustry(industry);
    const sz = normaliseSize(size);

    if (!VALID_INDUSTRIES.includes(ind)) {
      throw new Error(`Unknown industry: ${industry}`);
    }
    if (!VALID_SIZES.includes(sz)) {
      throw new Error(`Unknown size tier: ${size}`);
    }

    const industryTable = this.benchmarks[ind];
    if (!industryTable) {
      throw new Error(`No benchmark data for industry: ${ind}`);
    }
    const sizeTable = industryTable[sz];
    if (!sizeTable) {
      throw new Error(`No benchmark data for size: ${ind}/${sz}`);
    }

    // Deep-ish clone so callers cannot mutate our frozen defaults.
    const metrics = {};
    for (const [key, anchors] of Object.entries(sizeTable)) {
      metrics[key] = { ...anchors };
    }

    const snapshot = {
      industry: ind,
      size: sz,
      metrics,
      loadedAt: new Date().toISOString(),
    };

    this._currentIndustry = ind;
    this._currentSize = sz;
    this._currentSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Percentile of a raw value against the currently loaded snapshot.
   * Returns null if the metric is not in the snapshot or if the value
   * is not a finite number.
   */
  percentile(metricKey, value) {
    if (!this._currentSnapshot) return null;
    const anchors = this._currentSnapshot.metrics[metricKey];
    if (!anchors) return null;
    const meta = METRIC_META[metricKey];
    if (!meta) return null;
    const pairs = [
      [10, safeNum(anchors.p10)],
      [25, safeNum(anchors.p25)],
      [50, safeNum(anchors.p50)],
      [75, safeNum(anchors.p75)],
      [90, safeNum(anchors.p90)],
    ];
    const pct = valueToPercentile(pairs, Number(value), meta.direction);
    return pct === null ? null : round1(pct);
  }

  /**
   * Rate a single metric — returns { percentile, status, labels, delta }.
   */
  rateMetric(metricKey, value) {
    const pct = this.percentile(metricKey, value);
    const meta = METRIC_META[metricKey];
    const snapshot = this._currentSnapshot;
    const anchors = snapshot ? snapshot.metrics[metricKey] : null;
    const median = anchors ? safeNum(anchors.p50) : null;
    let delta = null;
    if (meta && median !== null && isFiniteNumber(value)) {
      // delta vs median, directionalised ("positive" == better).
      const raw = Number(value) - median;
      delta = meta.direction === DIR_LOWER_BETTER ? -raw : raw;
    }
    const status = percentileToStatus(pct);
    return {
      metric: metricKey,
      value: isFiniteNumber(value) ? Number(value) : null,
      percentile: pct,
      status,
      labelHe: meta ? meta.he : metricKey,
      labelEn: meta ? meta.en : metricKey,
      statusHe: STATUS_LABELS_HE[status],
      statusEn: STATUS_LABELS_EN[status],
      median,
      delta: isFiniteNumber(delta) ? round1(delta) : null,
      direction: meta ? meta.direction : null,
      format: meta ? meta.format : 'default',
      formattedValue: meta ? formatValue(value, meta.format) : String(value),
      formattedMedian: meta ? formatValue(median, meta.format) : String(median),
    };
  }

  /**
   * Compare a full `myMetrics` object against the loaded benchmark.
   * Returns a report shaped like:
   *   {
   *     industry, size,
   *     generatedAt,
   *     metrics: [ rateMetric() result, ... ],
   *     summary: { average, excellentCount, poorCount, coverage, ... },
   *     notes:   [ { he, en }, ... ],
   *     strengths: [...],
   *     weaknesses: [...]
   *   }
   *
   * `myMetrics` may omit metrics; only metrics with both a value and a
   * benchmark entry are graded.
   */
  compare(myMetrics) {
    if (!this._currentSnapshot) {
      throw new Error('compare() called before loadBenchmarks()');
    }
    const input = myMetrics && typeof myMetrics === 'object' ? myMetrics : {};
    const ratings = [];
    for (const key of Object.keys(this._currentSnapshot.metrics)) {
      if (key in input && isFiniteNumber(Number(input[key]))) {
        ratings.push(this.rateMetric(key, Number(input[key])));
      }
    }
    // Sort by metric key so output is deterministic.
    ratings.sort((a, b) => a.metric.localeCompare(b.metric));

    const percentiles = ratings
      .map((r) => r.percentile)
      .filter((p) => isFiniteNumber(p));
    const avg = percentiles.length
      ? round1(percentiles.reduce((a, b) => a + b, 0) / percentiles.length)
      : null;

    const statusCounts = {
      [STATUS_EXCELLENT]: 0,
      [STATUS_ABOVE_AVG]: 0,
      [STATUS_AVERAGE]: 0,
      [STATUS_BELOW_AVG]: 0,
      [STATUS_POOR]: 0,
    };
    for (const r of ratings) {
      if (r.status in statusCounts) statusCounts[r.status]++;
    }

    const strengths = ratings
      .filter((r) => r.status === STATUS_EXCELLENT || r.status === STATUS_ABOVE_AVG)
      .sort((a, b) => (b.percentile || 0) - (a.percentile || 0));
    const weaknesses = ratings
      .filter((r) => r.status === STATUS_POOR || r.status === STATUS_BELOW_AVG)
      .sort((a, b) => (a.percentile || 0) - (b.percentile || 0));

    return {
      industry: this._currentIndustry,
      size: this._currentSize,
      generatedAt: new Date().toISOString(),
      metrics: ratings,
      summary: {
        averagePercentile: avg,
        metricCount: ratings.length,
        statusCounts,
        excellentCount: statusCounts[STATUS_EXCELLENT],
        poorCount: statusCounts[STATUS_POOR],
      },
      strengths,
      weaknesses,
      notes: this.industryNotes(this._currentIndustry),
    };
  }

  /**
   * Returns bilingual industry notes (array of { he, en }).
   */
  industryNotes(industry) {
    const ind = industry
      ? normaliseIndustry(industry)
      : this._currentIndustry;
    if (!ind || !this.notes[ind]) return [];
    return this.notes[ind].map((n) => ({ he: n.he, en: n.en }));
  }

  /**
   * Render a compact bilingual report (Hebrew + English block per line).
   * The caller may further format this into Markdown or PDF.
   */
  bilingualReport(cmp) {
    const c = cmp || this.compare({}); // defensive
    const lines = [];
    lines.push('=================================================');
    lines.push(`Industry / ענף : ${c.industry}`);
    lines.push(`Size tier / רמת גודל : ${c.size}`);
    lines.push(`Generated / נוצר : ${c.generatedAt}`);
    lines.push('=================================================');
    lines.push('');
    lines.push('METRICS / מדדים');
    lines.push('-------------------------------------------------');
    for (const r of c.metrics) {
      lines.push(
        `${r.labelHe} | ${r.labelEn}`
      );
      lines.push(
        `  value: ${r.formattedValue}  median: ${r.formattedMedian}  ` +
        `percentile: ${r.percentile === null ? '—' : r.percentile}  ` +
        `status: ${r.statusHe} / ${r.statusEn}`
      );
    }
    lines.push('');
    lines.push('SUMMARY / סיכום');
    lines.push('-------------------------------------------------');
    lines.push(
      `Average percentile / אחוזון ממוצע : ${c.summary.averagePercentile ?? '—'}`
    );
    lines.push(
      `Metrics graded / מדדים נמדדו : ${c.summary.metricCount}`
    );
    lines.push(
      `Excellent / מצוינים : ${c.summary.excellentCount}  |  ` +
      `Poor / חלשים : ${c.summary.poorCount}`
    );
    if (c.strengths.length) {
      lines.push('');
      lines.push('STRENGTHS / חוזקות');
      for (const s of c.strengths) {
        lines.push(`  + ${s.labelHe} / ${s.labelEn} — ${s.percentile}% (${s.statusHe} / ${s.statusEn})`);
      }
    }
    if (c.weaknesses.length) {
      lines.push('');
      lines.push('WEAKNESSES / חולשות');
      for (const w of c.weaknesses) {
        lines.push(`  - ${w.labelHe} / ${w.labelEn} — ${w.percentile}% (${w.statusHe} / ${w.statusEn})`);
      }
    }
    if (c.notes && c.notes.length) {
      lines.push('');
      lines.push('INDUSTRY NOTES / הערות ענפיות');
      for (const n of c.notes) {
        lines.push(`  • HE: ${n.he}`);
        lines.push(`    EN: ${n.en}`);
      }
    }
    lines.push('=================================================');
    return lines.join('\n');
  }
}

// =====================================================================
//  Exports
// =====================================================================

module.exports = {
  BenchmarkComparator,
  DEFAULT_BENCHMARKS,
  DEFAULT_NOTES,
  METRIC_META,
  STATUS_EXCELLENT,
  STATUS_ABOVE_AVG,
  STATUS_AVERAGE,
  STATUS_BELOW_AVG,
  STATUS_POOR,
  STATUS_UNKNOWN,
  STATUS_LABELS_HE,
  STATUS_LABELS_EN,
  DIR_HIGHER_BETTER,
  DIR_LOWER_BETTER,
  INDUSTRY_METAL_FAB,
  INDUSTRY_REAL_ESTATE,
  SIZE_MICRO,
  SIZE_SMALL,
  SIZE_MEDIUM,
  SIZE_LARGE,
  VALID_INDUSTRIES,
  VALID_SIZES,
  // internals exposed for tests — not part of the stable API surface.
  _internals: {
    valueToPercentile,
    percentileToStatus,
    normaliseIndustry,
    normaliseSize,
    formatValue,
    lerp,
    clamp,
  },
};
