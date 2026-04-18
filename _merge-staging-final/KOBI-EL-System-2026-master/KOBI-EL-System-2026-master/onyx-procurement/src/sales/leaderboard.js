/**
 * Sales Leaderboard Engine
 * Agent Y-022 / Techno-Kol Uzi mega-ERP 2026
 *
 * Pure, deterministic, zero-dependency ranking engine for sales teams.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade & grow).
 *
 * Public API
 *   rank(salespeople, metric, period)
 *     Sorts an array of salesperson records by the chosen metric, returns
 *     a new ranked array with { rank, movementFromPrev?, ... } added.
 *
 *   movement(current, previous)
 *     Compares two ranked arrays by id and returns a map
 *       id -> { direction: 'up'|'down'|'same'|'new', delta, previousRank }
 *
 *   generateBadges(salesperson)
 *     Scans a salesperson's metrics + history and returns an array of
 *     milestone badge descriptors. Deterministic, no I/O.
 *
 * Supported metrics
 *   revenue          — total revenue closed in period (ILS)
 *   margin           — gross margin absolute (ILS) — (revenue - cogs)
 *   deals-closed     — number of closed/won deals
 *   conversion-rate  — closed / (closed + lost)   (0..1, rendered as %)
 *   avg-deal-size    — revenue / dealsClosed
 *   new-customers    — distinct new customer acquisitions in period
 *   attainment       — revenue / quota (0..n)
 *
 * Tiebreak ladder (deterministic; applies to ALL metrics):
 *   1. primary metric (desc)
 *   2. revenue (desc)       — the universal sanity anchor
 *   3. dealsClosed (desc)
 *   4. name ascending (he-IL locale)
 *   5. id ascending
 *
 * Hebrew-first labels are exported for the UI layer.
 *
 * Salesperson record shape (all fields optional; engine never throws on missing):
 *   {
 *     id: string,
 *     name: string,
 *     avatarUrl?: string,
 *     revenue: number,
 *     cogs?: number,
 *     dealsClosed: number,
 *     dealsLost?: number,
 *     newCustomers?: number,
 *     quota?: number,
 *     winStreak?: number,        // consecutive won deals (current streak)
 *     firstSaleAt?: string|Date, // ISO or Date; presence = has sold at least once
 *     history?: [{ period, revenue, dealsClosed, ... }],
 *   }
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Metric constants                                                    */
/* ------------------------------------------------------------------ */

const METRIC_REVENUE         = 'revenue';
const METRIC_MARGIN          = 'margin';
const METRIC_DEALS_CLOSED    = 'deals-closed';
const METRIC_CONVERSION_RATE = 'conversion-rate';
const METRIC_AVG_DEAL_SIZE   = 'avg-deal-size';
const METRIC_NEW_CUSTOMERS   = 'new-customers';
const METRIC_ATTAINMENT      = 'attainment';

const METRICS = Object.freeze([
  METRIC_REVENUE,
  METRIC_MARGIN,
  METRIC_DEALS_CLOSED,
  METRIC_CONVERSION_RATE,
  METRIC_AVG_DEAL_SIZE,
  METRIC_NEW_CUSTOMERS,
  METRIC_ATTAINMENT,
]);

const METRIC_LABELS_HE = Object.freeze({
  [METRIC_REVENUE]:         'הכנסות',
  [METRIC_MARGIN]:          'רווח גולמי',
  [METRIC_DEALS_CLOSED]:    'עסקאות שנסגרו',
  [METRIC_CONVERSION_RATE]: 'שיעור המרה',
  [METRIC_AVG_DEAL_SIZE]:   'גודל עסקה ממוצע',
  [METRIC_NEW_CUSTOMERS]:   'לקוחות חדשים',
  [METRIC_ATTAINMENT]:      'עמידה ביעד',
});

const METRIC_LABELS_EN = Object.freeze({
  [METRIC_REVENUE]:         'Revenue',
  [METRIC_MARGIN]:          'Margin',
  [METRIC_DEALS_CLOSED]:    'Deals Closed',
  [METRIC_CONVERSION_RATE]: 'Conversion Rate',
  [METRIC_AVG_DEAL_SIZE]:   'Avg Deal Size',
  [METRIC_NEW_CUSTOMERS]:   'New Customers',
  [METRIC_ATTAINMENT]:      'Quota Attainment',
});

const PERIOD_MONTH   = 'month';
const PERIOD_QUARTER = 'quarter';
const PERIOD_YEAR    = 'year';

const PERIODS = Object.freeze([PERIOD_MONTH, PERIOD_QUARTER, PERIOD_YEAR]);

const PERIOD_LABELS_HE = Object.freeze({
  [PERIOD_MONTH]:   'חודש',
  [PERIOD_QUARTER]: 'רבעון',
  [PERIOD_YEAR]:    'שנה',
});

const PERIOD_LABELS_EN = Object.freeze({
  [PERIOD_MONTH]:   'Month',
  [PERIOD_QUARTER]: 'Quarter',
  [PERIOD_YEAR]:    'Year',
});

/* ------------------------------------------------------------------ */
/* Badge catalog                                                       */
/* ------------------------------------------------------------------ */

const BADGE_FIRST_SALE  = 'first-sale';
const BADGE_TEN_DEALS   = 'ten-deals';
const BADGE_HUNDRED_K   = 'hundred-k';
const BADGE_QUARTER_M   = 'quarter-million';
const BADGE_MILLION     = 'million';
const BADGE_BEAT_QUOTA  = 'beat-quota';
const BADGE_WIN_STREAK  = 'win-streak';         // 5+ consecutive wins
const BADGE_HOT_STREAK  = 'hot-streak';         // 10+ consecutive wins
const BADGE_CENTURY     = 'century-club';       // 100+ closed deals in history
const BADGE_ROOKIE      = 'rookie-of-month';    // best new seller (flagged externally)

/** Canonical catalog — stable, deterministic, importable by UI + tests. */
const BADGE_CATALOG = Object.freeze({
  [BADGE_FIRST_SALE]: {
    id:      BADGE_FIRST_SALE,
    name_he: 'מכירה ראשונה',
    name_en: 'First Sale',
    desc_he: 'העסקה הראשונה נסגרה בהצלחה',
    desc_en: 'First deal closed',
    symbol:  'star',
    color:   '#f0c674', // sand / gold
    tier:    1,
  },
  [BADGE_TEN_DEALS]: {
    id:      BADGE_TEN_DEALS,
    name_he: '10 עסקאות',
    name_en: '10 Deals Closed',
    desc_he: 'עשר עסקאות שנסגרו בתקופה',
    desc_en: 'Ten deals closed in period',
    symbol:  'trophy',
    color:   '#4a9eff', // accent blue
    tier:    2,
  },
  [BADGE_HUNDRED_K]: {
    id:      BADGE_HUNDRED_K,
    name_he: '₪100K הכנסות',
    name_en: '100K Revenue',
    desc_he: '100,000 ₪ הכנסות בתקופה',
    desc_en: '100,000 ILS revenue in period',
    symbol:  'coin',
    color:   '#3fb950', // green
    tier:    2,
  },
  [BADGE_QUARTER_M]: {
    id:      BADGE_QUARTER_M,
    name_he: '₪250K הכנסות',
    name_en: '250K Revenue',
    desc_he: 'רבע מיליון ₪ הכנסות בתקופה',
    desc_en: 'Quarter-million ILS revenue in period',
    symbol:  'gem',
    color:   '#a371f7', // purple
    tier:    3,
  },
  [BADGE_MILLION]: {
    id:      BADGE_MILLION,
    name_he: '₪1M מועדון המיליון',
    name_en: 'Million Club',
    desc_he: 'מיליון ₪ הכנסות בתקופה',
    desc_en: 'One million ILS revenue in period',
    symbol:  'crown',
    color:   '#e86bb5', // pink
    tier:    4,
  },
  [BADGE_BEAT_QUOTA]: {
    id:      BADGE_BEAT_QUOTA,
    name_he: 'יעד הושלם',
    name_en: 'Beat Quota',
    desc_he: 'היעד הושלם ב־100% ומעלה',
    desc_en: 'Quota attained (>=100%)',
    symbol:  'target',
    color:   '#39c5cf', // teal
    tier:    3,
  },
  [BADGE_WIN_STREAK]: {
    id:      BADGE_WIN_STREAK,
    name_he: 'רצף ניצחונות',
    name_en: 'Win Streak',
    desc_he: '5 עסקאות רצופות שנסגרו בהצלחה',
    desc_en: 'Five consecutive wins',
    symbol:  'flame',
    color:   '#ff8b5b', // orange
    tier:    2,
  },
  [BADGE_HOT_STREAK]: {
    id:      BADGE_HOT_STREAK,
    name_he: 'רצף לוהט',
    name_en: 'Hot Streak',
    desc_he: '10 עסקאות רצופות שנסגרו בהצלחה',
    desc_en: 'Ten consecutive wins',
    symbol:  'bolt',
    color:   '#f85149', // danger red
    tier:    4,
  },
  [BADGE_CENTURY]: {
    id:      BADGE_CENTURY,
    name_he: 'מועדון המאה',
    name_en: 'Century Club',
    desc_he: '100 עסקאות סגורות בהיסטוריה',
    desc_en: '100 total deals closed in history',
    symbol:  'shield',
    color:   '#8cb4ff', // light blue
    tier:    4,
  },
  [BADGE_ROOKIE]: {
    id:      BADGE_ROOKIE,
    name_he: 'כוכב עולה',
    name_en: 'Rookie of the Month',
    desc_he: 'המכירה המוצלחת ביותר מבין עובדים חדשים',
    desc_en: 'Top performer among new hires',
    symbol:  'sparkle',
    color:   '#d29922', // amber
    tier:    3,
  },
});

/* ------------------------------------------------------------------ */
/* Safe number helpers                                                 */
/* ------------------------------------------------------------------ */

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const safeDiv = (num, den) => {
  const d = toNum(den);
  if (d === 0) return 0;
  return toNum(num) / d;
};

/* ------------------------------------------------------------------ */
/* Metric extractors                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute the numeric value for a metric against a salesperson record.
 * Always returns a finite number. Never throws.
 */
function metricValue(sp, metric) {
  if (!sp || typeof sp !== 'object') return 0;

  switch (metric) {
    case METRIC_REVENUE:
      return toNum(sp.revenue);

    case METRIC_MARGIN: {
      const revenue = toNum(sp.revenue);
      const cogs    = toNum(sp.cogs);
      return revenue - cogs;
    }

    case METRIC_DEALS_CLOSED:
      return toNum(sp.dealsClosed);

    case METRIC_CONVERSION_RATE: {
      const closed = toNum(sp.dealsClosed);
      const lost   = toNum(sp.dealsLost);
      const total  = closed + lost;
      return safeDiv(closed, total); // 0..1
    }

    case METRIC_AVG_DEAL_SIZE:
      return safeDiv(sp.revenue, sp.dealsClosed);

    case METRIC_NEW_CUSTOMERS:
      return toNum(sp.newCustomers);

    case METRIC_ATTAINMENT:
      return safeDiv(sp.revenue, sp.quota); // 0..n

    default:
      // Unknown metric → treat as revenue to be forgiving
      return toNum(sp.revenue);
  }
}

/* ------------------------------------------------------------------ */
/* rank()                                                              */
/* ------------------------------------------------------------------ */

/**
 * Sort & rank salespeople by the given metric.
 *
 * @param {Array<Object>} salespeople
 * @param {string} metric     — one of METRICS; unknown falls back to revenue
 * @param {string} period     — month | quarter | year (label/meta only; the
 *                              caller is responsible for pre-filtering data)
 * @returns {Array<Object>}   — new array, same objects copied, with fields:
 *                              { rank, metricValue, metric, period }
 */
function rank(salespeople, metric, period) {
  if (!Array.isArray(salespeople)) return [];
  const m = METRICS.includes(metric) ? metric : METRIC_REVENUE;
  const p = PERIODS.includes(period) ? period : PERIOD_MONTH;

  const enriched = salespeople
    .filter((sp) => sp && typeof sp === 'object' && sp.id != null)
    .map((sp) => ({
      ...sp,
      metricValue: metricValue(sp, m),
      metric:      m,
      period:      p,
    }));

  // Deterministic multi-key sort. Hebrew locale-aware name tiebreak.
  enriched.sort((a, b) => {
    // 1. primary metric desc
    if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
    // 2. revenue desc
    const bRev = toNum(b.revenue);
    const aRev = toNum(a.revenue);
    if (bRev !== aRev) return bRev - aRev;
    // 3. dealsClosed desc
    const bDeals = toNum(b.dealsClosed);
    const aDeals = toNum(a.dealsClosed);
    if (bDeals !== aDeals) return bDeals - aDeals;
    // 4. name asc (he-IL collation)
    const aName = String(a.name || '');
    const bName = String(b.name || '');
    const nameCmp = aName.localeCompare(bName, 'he-IL');
    if (nameCmp !== 0) return nameCmp;
    // 5. id asc (final deterministic anchor)
    return String(a.id).localeCompare(String(b.id));
  });

  // Assign dense ranks. Tied rows get the same rank (competition ranking).
  // 1, 2, 2, 4, 5 — classic sports style so "the #2s" stay #2.
  let prevValue = null;
  let prevRank  = 0;
  enriched.forEach((row, idx) => {
    const position = idx + 1;
    if (prevValue !== null && row.metricValue === prevValue) {
      row.rank = prevRank;
    } else {
      row.rank  = position;
      prevRank  = position;
      prevValue = row.metricValue;
    }
  });

  return enriched;
}

/* ------------------------------------------------------------------ */
/* movement()                                                          */
/* ------------------------------------------------------------------ */

/**
 * Compute period-over-period movement for a ranked list.
 *
 * @param {Array<Object>} current   — ranked rows from rank()
 * @param {Array<Object>} previous  — ranked rows from rank() for the prior period
 * @returns {Object}                — map id -> { direction, delta, previousRank, currentRank }
 *                                    direction ∈ 'up' | 'down' | 'same' | 'new'
 *                                    delta is previousRank - currentRank (positive = moved up)
 *                                    previousRank is null for 'new' entries
 */
function movement(current, previous) {
  const result = Object.create(null);
  if (!Array.isArray(current)) return result;

  const prevMap = Object.create(null);
  if (Array.isArray(previous)) {
    for (const row of previous) {
      if (row && row.id != null && Number.isFinite(row.rank)) {
        prevMap[row.id] = row.rank;
      }
    }
  }

  for (const row of current) {
    if (!row || row.id == null || !Number.isFinite(row.rank)) continue;
    const id = row.id;
    const prevRank = prevMap[id];
    if (prevRank == null) {
      result[id] = {
        direction:    'new',
        delta:        null,
        previousRank: null,
        currentRank:  row.rank,
      };
      continue;
    }
    const delta = prevRank - row.rank; // positive = improved
    let direction;
    if (delta > 0)      direction = 'up';
    else if (delta < 0) direction = 'down';
    else                direction = 'same';
    result[id] = {
      direction,
      delta,
      previousRank: prevRank,
      currentRank:  row.rank,
    };
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* generateBadges()                                                    */
/* ------------------------------------------------------------------ */

/**
 * Inspect a salesperson record and return the badges they have earned.
 * Deterministic, side-effect-free, safe on partial data.
 *
 * Badges are returned in the order defined by BADGE_CATALOG, deduped.
 * Each returned entry is the catalog descriptor (a copy), enriched with
 * an `earnedAt` marker when available.
 *
 * @param {Object} sp   — salesperson record
 * @returns {Array<Object>}
 */
function generateBadges(sp) {
  if (!sp || typeof sp !== 'object') return [];

  const earned = new Set();

  const revenue     = toNum(sp.revenue);
  const dealsClosed = toNum(sp.dealsClosed);
  const winStreak   = toNum(sp.winStreak);
  const quota       = toNum(sp.quota);

  // first-sale — any evidence of a closed deal
  if (dealsClosed >= 1 || sp.firstSaleAt) {
    earned.add(BADGE_FIRST_SALE);
  }

  // ten-deals
  if (dealsClosed >= 10) earned.add(BADGE_TEN_DEALS);

  // revenue tiers (lower tiers also awarded so the UI can show progression)
  if (revenue >= 100_000)   earned.add(BADGE_HUNDRED_K);
  if (revenue >= 250_000)   earned.add(BADGE_QUARTER_M);
  if (revenue >= 1_000_000) earned.add(BADGE_MILLION);

  // beat-quota — attainment >= 100%
  if (quota > 0 && revenue / quota >= 1) {
    earned.add(BADGE_BEAT_QUOTA);
  }

  // win-streak / hot-streak
  if (winStreak >= 5)  earned.add(BADGE_WIN_STREAK);
  if (winStreak >= 10) earned.add(BADGE_HOT_STREAK);

  // century-club — 100+ deals across all known history
  const historicalDeals = Array.isArray(sp.history)
    ? sp.history.reduce((acc, h) => acc + toNum(h && h.dealsClosed), 0)
    : 0;
  const lifetimeDeals = dealsClosed + historicalDeals;
  if (lifetimeDeals >= 100) earned.add(BADGE_CENTURY);

  // rookie-of-month — externally flagged (the server decides this)
  if (sp.isRookieOfMonth === true) earned.add(BADGE_ROOKIE);

  // Also honor explicit flags on the record (e.g. legacy badges imported).
  if (Array.isArray(sp.badges)) {
    for (const b of sp.badges) {
      if (typeof b === 'string' && BADGE_CATALOG[b]) earned.add(b);
    }
  }

  // Return in catalog order so the UI paints consistently every render.
  const out = [];
  for (const key of Object.keys(BADGE_CATALOG)) {
    if (earned.has(key)) {
      out.push({ ...BADGE_CATALOG[key] });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Convenience helpers used by the UI                                  */
/* ------------------------------------------------------------------ */

/**
 * Format a metric value for display. Returns a string.
 */
function formatMetric(value, metric) {
  const v = toNum(value);
  switch (metric) {
    case METRIC_REVENUE:
    case METRIC_MARGIN:
    case METRIC_AVG_DEAL_SIZE:
      return '\u20AA ' + v.toLocaleString('he-IL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    case METRIC_CONVERSION_RATE:
      return (v * 100).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + '%';
    case METRIC_ATTAINMENT:
      return (v * 100).toLocaleString('he-IL', { maximumFractionDigits: 0 }) + '%';
    case METRIC_DEALS_CLOSED:
    case METRIC_NEW_CUSTOMERS:
      return v.toLocaleString('he-IL', { maximumFractionDigits: 0 });
    default:
      return String(v);
  }
}

/**
 * Return the index/rank of a specific salesperson in a ranked list.
 * Useful for the "Your rank: #X" header. Returns null if not found.
 */
function findRank(rankedList, id) {
  if (!Array.isArray(rankedList) || id == null) return null;
  for (const row of rankedList) {
    if (row && row.id === id) return row.rank;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

module.exports = {
  // primary API
  rank,
  movement,
  generateBadges,

  // helpers
  metricValue,
  formatMetric,
  findRank,

  // constants
  METRICS,
  METRIC_REVENUE,
  METRIC_MARGIN,
  METRIC_DEALS_CLOSED,
  METRIC_CONVERSION_RATE,
  METRIC_AVG_DEAL_SIZE,
  METRIC_NEW_CUSTOMERS,
  METRIC_ATTAINMENT,
  METRIC_LABELS_HE,
  METRIC_LABELS_EN,

  PERIODS,
  PERIOD_MONTH,
  PERIOD_QUARTER,
  PERIOD_YEAR,
  PERIOD_LABELS_HE,
  PERIOD_LABELS_EN,

  BADGE_CATALOG,
  BADGE_FIRST_SALE,
  BADGE_TEN_DEALS,
  BADGE_HUNDRED_K,
  BADGE_QUARTER_M,
  BADGE_MILLION,
  BADGE_BEAT_QUOTA,
  BADGE_WIN_STREAK,
  BADGE_HOT_STREAK,
  BADGE_CENTURY,
  BADGE_ROOKIE,
};
