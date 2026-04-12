/**
 * Customer Segmentation Engine — מנוע פילוח לקוחות
 * Agent Y-091 — Techno-Kol Uzi mega-ERP 2026 / onyx-procurement
 * Date: 2026-04-11
 *
 * Zero-dependency, deterministic, pure-JavaScript segmentation engine that
 * slices the customer base by RFM score, named RFM segments, lifecycle stage,
 * behavioural bucket, and feature-vector k-means clusters. It also forecasts
 * simple Customer Lifetime Value (CLV), exposes segment overlap analytics for
 * Venn-style reports, and emits ready-to-use customer-ID lists for marketing
 * campaigns.
 *
 * ─── Rule: "לא מוחקים רק משדרגים ומגדלים" ──────────────────────────────────
 * This module NEVER deletes, archives, or deactivates any customer. It only
 * reads read-only arrays and returns fresh descriptive objects. Callers may
 * use the output to target campaigns, trigger workflows, or annotate CRM
 * records — but the engine itself has no side effects.
 *
 * ─── RFM Model ─────────────────────────────────────────────────────────────
 * R (Recency)   — days since the customer's last purchase (smaller = better).
 * F (Frequency) — number of orders in the observed period.
 * M (Monetary)  — total spend in the observed period (ILS by convention).
 *
 * Each dimension is bucketed into an integer score 1..5 using a deterministic
 * quintile-like threshold table. No random numbers, no sampling, no external
 * calls — the same input always produces the same score.
 *
 * ─── Named RFM Segments ────────────────────────────────────────────────────
 * Champions, Loyal, Potential Loyalists, New Customers, Promising,
 * Need Attention, About to Sleep, At Risk, Cannot Lose Them, Hibernating,
 * Lost — each returned with a Hebrew label, English label, and recommended
 * marketing action.
 *
 * ─── Lifecycle Stages ──────────────────────────────────────────────────────
 * prospect → first_time → repeat → loyal → champion → at_risk → churned
 *
 * A lifecycle stage is a coarser, time-based label that describes *where*
 * the customer sits on the relationship arc, independent of spend quintiles.
 *
 * ─── Behavioural Segments ──────────────────────────────────────────────────
 * price_sensitive  — responds to discounts, picks the cheapest SKUs
 * quality_seeker   — buys premium SKUs, low return rate
 * convenience      — repeat buys, low touchpoints, fast reorders
 * brand_loyal      — consistent brand preference across SKUs
 * promo_driven     — orders cluster around promo windows
 *
 * ─── k-Means Clustering ────────────────────────────────────────────────────
 * A zero-dependency, deterministic k-means implementation with k-means++
 * seeding (using a deterministic LCG — no Math.random) and a configurable
 * maximum iteration count. Works on any numeric feature vector.
 *
 * ─── CLV Forecast ──────────────────────────────────────────────────────────
 * A simple, transparent CLV formula:
 *
 *   CLV = (avgOrderValue × ordersPerYear × grossMargin × retentionFactor) ×
 *         horizonYears
 *
 *   retentionFactor models the probability the customer stays active across
 *   the horizon; see {@link forecastValue} for the exact math.
 *
 * @module onyx-procurement/src/customer/segmentation
 */

'use strict';

// ─── constants ────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default RFM quintile thresholds (tunable via constructor). */
const DEFAULT_RFM_THRESHOLDS = Object.freeze({
  // Recency: days since last purchase. Fewer days -> HIGHER R score.
  // Score 5 if <= 14 days, 4 if <= 30, 3 if <= 60, 2 if <= 120, 1 otherwise.
  recency: Object.freeze([14, 30, 60, 120]),

  // Frequency: orders in period. More orders -> HIGHER F score.
  // Score 1 if <= 1, 2 if <= 3, 3 if <= 6, 4 if <= 12, 5 if > 12.
  frequency: Object.freeze([1, 3, 6, 12]),

  // Monetary: total spend in period (ILS). More -> HIGHER M score.
  // Score 1 if <= 1000, 2 if <= 5000, 3 if <= 15000, 4 if <= 50000, 5 if >.
  monetary: Object.freeze([1000, 5000, 15000, 50000]),
});

/** Named RFM segments. Each entry defines membership rules in R/F/M space. */
const RFM_SEGMENTS = Object.freeze([
  {
    id: 'champions',
    he: 'אלופים',
    en: 'Champions',
    description_he: 'לקוחות הכי טובים — רכשו לאחרונה, קונים הרבה, מוציאים הרבה',
    description_en: 'Best customers — bought recently, buy often, spend the most',
    action: 'retain',
    match: (r, f, m) => r >= 4 && f >= 4 && m >= 4,
  },
  {
    id: 'loyal',
    he: 'נאמנים',
    en: 'Loyal',
    description_he: 'מוציאים כסף באופן עקבי, מגיבים טוב למבצעים',
    description_en: 'Spend good money often, respond well to promotions',
    action: 'retain',
    // Loyal requires decent recency (>=3) so that "big spenders who
    // stopped coming" still fall into at_risk / cannot_lose below.
    match: (r, f, m) => f >= 4 && m >= 4 && r >= 3,
  },
  {
    id: 'potential_loyalists',
    he: 'נאמנים פוטנציאליים',
    en: 'Potential Loyalists',
    description_he: 'לקוחות חדשים-יחסית עם תדירות ממוצעת — יש פוטנציאל לגדול',
    description_en: 'Recent customers with average frequency — room to grow',
    action: 'grow',
    match: (r, f, m) => r >= 4 && f >= 2 && f <= 3 && m >= 2,
  },
  {
    id: 'new_customers',
    he: 'לקוחות חדשים',
    en: 'New Customers',
    description_he: 'קנו לאחרונה בפעם הראשונה, תדירות נמוכה',
    description_en: 'Bought recently for the first time, low frequency',
    action: 'nurture',
    match: (r, f, m) => r >= 4 && f <= 1,
  },
  {
    id: 'promising',
    he: 'מבטיחים',
    en: 'Promising',
    description_he: 'קונים לאחרונה אך מוציאים מעט — נתן לטפח',
    description_en: 'Recent shoppers but spent little — worth nurturing',
    action: 'nurture',
    match: (r, f, m) => r >= 3 && f <= 2 && m <= 2,
  },
  {
    id: 'need_attention',
    he: 'דרושה תשומת לב',
    en: 'Need Attention',
    description_he: 'אמצע הדרך — R/F/M ממוצעים, עלולים להישחק',
    description_en: 'Above-average recency and frequency, may be slipping',
    action: 'grow',
    match: (r, f, m) => r === 3 && f === 3 && m >= 2,
  },
  {
    id: 'about_to_sleep',
    he: 'עומדים להירדם',
    en: 'About to Sleep',
    description_he: 'ערכים נמוכים מהממוצע — מתחילים להתרחק',
    description_en: 'Below-average R and F, starting to drift',
    action: 'win-back',
    match: (r, f, m) => r <= 3 && r >= 2 && f <= 2,
  },
  {
    id: 'at_risk',
    he: 'בסיכון',
    en: 'At Risk',
    description_he: 'הוציאו הרבה וקנו הרבה, אבל לא חזרו זמן רב',
    description_en: 'Spent and bought a lot, but long time ago',
    action: 'win-back',
    match: (r, f, m) => r <= 2 && f >= 3 && m >= 3,
  },
  {
    id: 'cannot_lose',
    he: 'אסור לאבד',
    en: 'Cannot Lose Them',
    description_he: 'לקוחות גדולים שנעלמו — דרוש מהלך הצלה',
    description_en: 'Made big purchases, and often, but not for a long time',
    action: 'win-back',
    match: (r, f, m) => r <= 2 && f >= 4 && m >= 4,
  },
  {
    id: 'hibernating',
    he: 'רדומים',
    en: 'Hibernating',
    description_he: 'רכישה אחרונה מזמן, תדירות נמוכה, הוצאה נמוכה',
    description_en: 'Last purchase long ago, low frequency, low spend',
    action: 'win-back',
    match: (r, f, m) => r <= 2 && f <= 2 && m >= 2,
  },
  {
    id: 'lost',
    he: 'אבודים',
    en: 'Lost',
    description_he: 'ציון נמוך מאוד בכל השלושה — ההסתברות להחזרה קטנה',
    description_en: 'Lowest scores across the board — very low return odds',
    action: 'win-back',
    match: (r, f, m) => r === 1 && f === 1,
  },
]);

/** Lifecycle stages, ordered. Progression is the default happy-path. */
const LIFECYCLE_STAGES = Object.freeze([
  { id: 'prospect',   he: 'ליד',            en: 'Prospect' },
  { id: 'first_time', he: 'ראשוני',         en: 'First-time' },
  { id: 'repeat',     he: 'חוזר',           en: 'Repeat' },
  { id: 'loyal',      he: 'נאמן',           en: 'Loyal' },
  { id: 'champion',   he: 'אלוף',           en: 'Champion' },
  { id: 'at_risk',    he: 'בסיכון',         en: 'At Risk' },
  { id: 'churned',    he: 'עזב',            en: 'Churned' },
]);

/** Marketing actions keyed by segment action string. */
const ACTION_PLAYBOOK = Object.freeze({
  retain: {
    he: 'שימור — תגמול, VIP, תוכנית נאמנות, גישה מוקדמת למבצעים',
    en: 'Retain — reward, VIP program, loyalty benefits, early access',
    channels: ['email', 'whatsapp', 'phone'],
    priority: 'high',
  },
  grow: {
    he: 'הגדלה — המלצות מוצרים (cross-sell/up-sell), חבילות, הצעות מותאמות',
    en: 'Grow — cross-sell, up-sell, bundles, tailored offers',
    channels: ['email', 'sms', 'whatsapp'],
    priority: 'medium',
  },
  'win-back': {
    he: 'החזרה — הנחה אישית, שיחת רפרנט, סקר "מה קרה"',
    en: 'Win back — personal discount, rep call, win-back survey',
    channels: ['email', 'phone', 'whatsapp'],
    priority: 'high',
  },
  nurture: {
    he: 'טיפוח — תוכן חינוכי, הדגמות, הצעת קנייה שנייה',
    en: 'Nurture — educational content, demos, 2nd-purchase offer',
    channels: ['email', 'sms'],
    priority: 'medium',
  },
  welcome: {
    he: 'ברוך הבא — מייל פתיחה, שובר התחלה, סקר הכנסה',
    en: 'Welcome — welcome email, starter voucher, onboarding survey',
    channels: ['email'],
    priority: 'low',
  },
});

/** Behavioural segment catalogue. */
const BEHAVIOURAL_SEGMENTS = Object.freeze([
  {
    id: 'price_sensitive',
    he: 'רגיש-למחיר',
    en: 'Price Sensitive',
    description_he: 'בוחר את המוצרים הכי זולים, רגיש לאחוזי הנחה',
    description_en: 'Picks cheapest SKUs, reacts to discount percentages',
  },
  {
    id: 'quality_seeker',
    he: 'מחפש-איכות',
    en: 'Quality Seeker',
    description_he: 'קונה מוצרים יוקרתיים, אחוז החזרות נמוך',
    description_en: 'Buys premium SKUs, low return rate',
  },
  {
    id: 'convenience',
    he: 'מחפש-נוחות',
    en: 'Convenience',
    description_he: 'רכישות חוזרות, מעט מגע עם שירות, הזמנות מהירות',
    description_en: 'Repeat buys, low touch, fast reorders',
  },
  {
    id: 'brand_loyal',
    he: 'נאמן-מותג',
    en: 'Brand Loyal',
    description_he: 'מעדיף מותג מסוים באופן עקבי',
    description_en: 'Consistently prefers a single brand',
  },
  {
    id: 'promo_driven',
    he: 'מונע-מבצעים',
    en: 'Promo Driven',
    description_he: 'רוב ההזמנות נופלות בחלון של מבצע',
    description_en: 'Most orders cluster inside promo windows',
  },
]);

/** Hebrew + English glossary. Exposed for UI tooltips. */
const GLOSSARY = Object.freeze({
  rfm: { he: 'מודל RFM — עדכניות, תדירות, כסף', en: 'RFM — Recency, Frequency, Monetary' },
  recency: { he: 'עדכניות — כמה זמן עבר מהרכישה האחרונה', en: 'Recency — days since last purchase' },
  frequency: { he: 'תדירות — מספר רכישות בתקופה', en: 'Frequency — number of orders in period' },
  monetary: { he: 'כסף — סכום ההוצאה בתקופה', en: 'Monetary — total spend in period' },
  lifecycle: { he: 'מחזור חיים — שלב הלקוח במערכת היחסים', en: 'Lifecycle — stage in the relationship arc' },
  clv: { he: 'CLV — ערך הלקוח לכל אורך חייו', en: 'CLV — Customer Lifetime Value' },
  churn: { he: 'נטישה — עזיבת לקוח', en: 'Churn — customer departure' },
  cohort: { he: 'קוהורט — קבוצה שהצטרפה באותה תקופה', en: 'Cohort — group that joined in a shared period' },
  kmeans: { he: 'k-means — אשכול לקוחות לפי דמיון', en: 'k-means — clustering by similarity' },
  segment: { he: 'פלח — קבוצת לקוחות עם מאפיינים משותפים', en: 'Segment — a group of customers sharing traits' },
});

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Deterministic LCG PRNG — NO Math.random so tests are reproducible.
 * Returns a function that yields pseudo-random floats in [0,1).
 */
function makeDeterministicRng(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    // Numerical Recipes LCG constants.
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Safely parse a date-like value and return an epoch-ms number.
 * Accepts Date, number, ISO string. Returns NaN for invalid input.
 */
function toEpoch(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? NaN : parsed;
  }
  return NaN;
}

/**
 * Bucket a value into a 1..5 score given ascending thresholds.
 * `direction` = 'higher_better' (more -> 5) or 'lower_better' (less -> 5).
 */
function scoreByThresholds(value, thresholds, direction) {
  const t = thresholds;
  if (!Number.isFinite(value)) return 1;
  if (direction === 'lower_better') {
    if (value <= t[0]) return 5;
    if (value <= t[1]) return 4;
    if (value <= t[2]) return 3;
    if (value <= t[3]) return 2;
    return 1;
  }
  // higher_better (default)
  if (value <= t[0]) return 1;
  if (value <= t[1]) return 2;
  if (value <= t[2]) return 3;
  if (value <= t[3]) return 4;
  return 5;
}

/** Sum a list of numbers, ignoring non-finite entries. */
function safeSum(arr) {
  let s = 0;
  for (const v of arr) if (Number.isFinite(v)) s += v;
  return s;
}

/** Mean of an array. Returns 0 for empty / non-numeric. */
function mean(arr) {
  const filtered = arr.filter((v) => Number.isFinite(v));
  if (!filtered.length) return 0;
  return safeSum(filtered) / filtered.length;
}

/** Squared Euclidean distance between two same-length vectors. */
function squaredDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    s += d * d;
  }
  return s;
}

/** Shallow-clone a vector. */
function cloneVector(v) {
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}

// ─── main class ───────────────────────────────────────────────────────────

/**
 * CustomerSegmentation — main segmentation engine.
 * All methods are pure: same input → same output. No side effects.
 */
class CustomerSegmentation {
  /**
   * @param {object} [options]
   * @param {Date|string|number} [options.referenceDate] — "today" for the
   *        engine. Defaults to current time. Pin this in tests for determinism.
   * @param {object} [options.thresholds] — Override RFM thresholds.
   * @param {number} [options.churnDays] — Days of inactivity before churned.
   * @param {number} [options.atRiskDays] — Days of inactivity before at-risk.
   * @param {number} [options.loyalOrders] — Orders required to be "loyal".
   * @param {number} [options.championOrders] — Orders required to be "champion".
   * @param {number} [options.championSpend] — Spend required to be "champion".
   */
  constructor(options = {}) {
    const {
      referenceDate = new Date(),
      thresholds = DEFAULT_RFM_THRESHOLDS,
      churnDays = 365,
      atRiskDays = 180,
      loyalOrders = 6,
      championOrders = 12,
      championSpend = 50000,
    } = options;

    const refEpoch = toEpoch(referenceDate);
    if (!Number.isFinite(refEpoch)) {
      throw new TypeError('CustomerSegmentation: referenceDate is invalid');
    }
    this.referenceDate = new Date(refEpoch);
    this.thresholds = Object.freeze({
      recency: Object.freeze(Array.from(thresholds.recency || DEFAULT_RFM_THRESHOLDS.recency)),
      frequency: Object.freeze(Array.from(thresholds.frequency || DEFAULT_RFM_THRESHOLDS.frequency)),
      monetary: Object.freeze(Array.from(thresholds.monetary || DEFAULT_RFM_THRESHOLDS.monetary)),
    });
    this.churnDays = churnDays;
    this.atRiskDays = atRiskDays;
    this.loyalOrders = loyalOrders;
    this.championOrders = championOrders;
    this.championSpend = championSpend;
    this._cachedSegments = new Map(); // segmentId -> [customerId]
  }

  // ── RFM ────────────────────────────────────────────────────────────────

  /**
   * computeRFM({ customer, period }) — compute raw + scored R, F, M.
   *
   * @param {object} args
   * @param {object} args.customer — must have `orders` array of
   *        { date, amount } or top-level fields `lastOrderDate`, `orderCount`,
   *        `totalSpend` (for pre-aggregated records).
   * @param {{start?: Date|string|number, end?: Date|string|number}} [args.period]
   *        — optional inclusive window. If omitted, all orders are used and
   *        `end` defaults to `this.referenceDate`.
   * @returns {{R:number,F:number,M:number,raw:{recencyDays:number,
   *            frequency:number,monetary:number}}}
   */
  computeRFM({ customer, period } = {}) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('computeRFM: customer object is required');
    }

    const endEpoch = toEpoch(period && period.end) || this.referenceDate.getTime();
    const startEpoch = toEpoch(period && period.start);
    const end = new Date(endEpoch);

    let recencyDays = Number.POSITIVE_INFINITY;
    let frequency = 0;
    let monetary = 0;

    const orders = Array.isArray(customer.orders) ? customer.orders : null;
    if (orders) {
      let mostRecent = -Infinity;
      for (const ord of orders) {
        const ts = toEpoch(ord && ord.date);
        if (!Number.isFinite(ts)) continue;
        if (Number.isFinite(startEpoch) && ts < startEpoch) continue;
        if (ts > endEpoch) continue;
        frequency += 1;
        const amount = Number(ord.amount) || 0;
        monetary += amount;
        if (ts > mostRecent) mostRecent = ts;
      }
      if (mostRecent > -Infinity) {
        recencyDays = Math.max(
          0,
          Math.floor((end.getTime() - mostRecent) / MS_PER_DAY),
        );
      }
    } else {
      // pre-aggregated customer record
      const lastEpoch = toEpoch(customer.lastOrderDate);
      if (Number.isFinite(lastEpoch)) {
        recencyDays = Math.max(0, Math.floor((end.getTime() - lastEpoch) / MS_PER_DAY));
      }
      frequency = Number(customer.orderCount) || 0;
      monetary = Number(customer.totalSpend) || 0;
    }

    if (!Number.isFinite(recencyDays)) recencyDays = Number.MAX_SAFE_INTEGER;

    const R = scoreByThresholds(recencyDays, this.thresholds.recency, 'lower_better');
    const F = scoreByThresholds(frequency, this.thresholds.frequency, 'higher_better');
    const M = scoreByThresholds(monetary, this.thresholds.monetary, 'higher_better');

    return {
      R,
      F,
      M,
      raw: { recencyDays, frequency, monetary },
    };
  }

  /**
   * segmentRFM(rfm) — map {R,F,M} scores to a named segment entry.
   * The first matching segment in {@link RFM_SEGMENTS} wins.
   *
   * @param {{R:number,F:number,M:number}} rfm
   * @returns {{id:string, he:string, en:string, action:string,
   *            description_he:string, description_en:string, code:string}}
   */
  segmentRFM(rfm) {
    const { R, F, M } = rfm || {};
    if (![R, F, M].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
      throw new RangeError('segmentRFM: R, F, M must be integers in 1..5');
    }
    for (const seg of RFM_SEGMENTS) {
      if (seg.match(R, F, M)) {
        return Object.freeze({
          id: seg.id,
          he: seg.he,
          en: seg.en,
          action: seg.action,
          description_he: seg.description_he,
          description_en: seg.description_en,
          code: `${R}${F}${M}`,
        });
      }
    }
    // Fallback: "need attention" bucket — never return nothing.
    return Object.freeze({
      id: 'need_attention',
      he: 'דרושה תשומת לב',
      en: 'Need Attention',
      action: 'grow',
      description_he: 'לא תואם לפלח מוגדר — דורש ביקורת ידנית',
      description_en: 'Did not match a defined segment — needs manual review',
      code: `${R}${F}${M}`,
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────

  /**
   * lifecycleStage(customer) — coarse lifecycle bucket.
   * @param {object} customer
   * @returns {{id:string, he:string, en:string, daysSinceLastOrder:number|null,
   *            orderCount:number, totalSpend:number}}
   */
  lifecycleStage(customer) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('lifecycleStage: customer object is required');
    }
    const rfm = this.computeRFM({ customer });
    const daysSince = Number.isFinite(rfm.raw.recencyDays) &&
                      rfm.raw.recencyDays !== Number.MAX_SAFE_INTEGER
      ? rfm.raw.recencyDays
      : null;
    const orderCount = rfm.raw.frequency;
    const totalSpend = rfm.raw.monetary;

    let stageId;
    if (orderCount === 0) {
      stageId = 'prospect';
    } else if (daysSince !== null && daysSince > this.churnDays) {
      stageId = 'churned';
    } else if (daysSince !== null && daysSince > this.atRiskDays) {
      stageId = 'at_risk';
    } else if (orderCount >= this.championOrders && totalSpend >= this.championSpend) {
      stageId = 'champion';
    } else if (orderCount >= this.loyalOrders) {
      stageId = 'loyal';
    } else if (orderCount >= 2) {
      stageId = 'repeat';
    } else {
      stageId = 'first_time';
    }

    const entry = LIFECYCLE_STAGES.find((s) => s.id === stageId);
    return Object.freeze({
      id: stageId,
      he: entry.he,
      en: entry.en,
      daysSinceLastOrder: daysSince,
      orderCount,
      totalSpend,
    });
  }

  // ── k-means clustering ───────────────────────────────────────────────

  /**
   * kMeansCluster(customers, k, features) — zero-dependency k-means.
   *
   * @param {Array<object>} customers — list of customer objects.
   * @param {number} k — number of clusters (>= 1). If k exceeds unique
   *        customers, it is clamped down.
   * @param {Array<string|function>} features — feature extractors. Strings are
   *        treated as property names (`cust[name]`), functions receive the
   *        customer and return a number.
   * @param {object} [options]
   * @param {number} [options.maxIterations=100]
   * @param {number} [options.tolerance=1e-6]
   * @param {number} [options.seed=42] — PRNG seed for reproducibility.
   * @returns {{centroids: number[][], assignments: number[], clusters:
   *           Array<Array<object>>, iterations: number, converged: boolean,
   *           inertia: number}}
   */
  kMeansCluster(customers, k, features, options = {}) {
    if (!Array.isArray(customers)) {
      throw new TypeError('kMeansCluster: customers must be an array');
    }
    if (!Array.isArray(features) || features.length === 0) {
      throw new TypeError('kMeansCluster: features must be a non-empty array');
    }
    if (!Number.isInteger(k) || k < 1) {
      throw new RangeError('kMeansCluster: k must be a positive integer');
    }
    if (customers.length === 0) {
      return {
        centroids: [],
        assignments: [],
        clusters: [],
        iterations: 0,
        converged: true,
        inertia: 0,
      };
    }
    const {
      maxIterations = 100,
      tolerance = 1e-6,
      seed = 42,
    } = options;

    // 1. Build feature matrix.
    const vectors = customers.map((cust) =>
      features.map((feat) => {
        const v = typeof feat === 'function' ? feat(cust) : cust[feat];
        return Number.isFinite(v) ? Number(v) : 0;
      }),
    );
    const dim = vectors[0].length;

    // 2. Normalise (z-score) so features compete on equal footing.
    const means = new Array(dim).fill(0);
    const stds = new Array(dim).fill(0);
    for (const v of vectors) for (let i = 0; i < dim; i++) means[i] += v[i];
    for (let i = 0; i < dim; i++) means[i] /= vectors.length;
    for (const v of vectors)
      for (let i = 0; i < dim; i++) stds[i] += (v[i] - means[i]) ** 2;
    for (let i = 0; i < dim; i++) {
      stds[i] = Math.sqrt(stds[i] / vectors.length) || 1; // avoid /0
    }
    const normed = vectors.map((v) => v.map((x, i) => (x - means[i]) / stds[i]));

    // 3. Clamp k to available points.
    const effectiveK = Math.min(k, normed.length);

    // 4. k-means++ seeding (deterministic).
    const rng = makeDeterministicRng(seed);
    const centroids = [];
    const firstIdx = Math.floor(rng() * normed.length);
    centroids.push(cloneVector(normed[firstIdx]));
    while (centroids.length < effectiveK) {
      const dists = normed.map((v) => {
        let best = Infinity;
        for (const c of centroids) {
          const d = squaredDistance(v, c);
          if (d < best) best = d;
        }
        return best;
      });
      const total = safeSum(dists);
      if (total === 0) {
        // All remaining points collapse onto an existing centroid — pick
        // the next index deterministically to break ties.
        for (let i = 0; i < normed.length; i++) {
          const candidate = normed[i];
          if (!centroids.some((c) => squaredDistance(c, candidate) === 0)) {
            centroids.push(cloneVector(candidate));
            break;
          }
        }
        if (centroids.length < effectiveK) break; // truly degenerate
        continue;
      }
      const target = rng() * total;
      let acc = 0;
      let picked = normed.length - 1;
      for (let i = 0; i < dists.length; i++) {
        acc += dists[i];
        if (acc >= target) {
          picked = i;
          break;
        }
      }
      centroids.push(cloneVector(normed[picked]));
    }

    // 5. Lloyd iterations.
    const assignments = new Array(normed.length).fill(-1);
    let iterations = 0;
    let converged = false;
    for (; iterations < maxIterations; iterations++) {
      let changed = 0;
      // assign
      for (let i = 0; i < normed.length; i++) {
        let bestIdx = 0;
        let bestDist = squaredDistance(normed[i], centroids[0]);
        for (let c = 1; c < centroids.length; c++) {
          const d = squaredDistance(normed[i], centroids[c]);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = c;
          }
        }
        if (assignments[i] !== bestIdx) {
          assignments[i] = bestIdx;
          changed += 1;
        }
      }
      // update
      const sums = centroids.map(() => new Array(dim).fill(0));
      const counts = new Array(centroids.length).fill(0);
      for (let i = 0; i < normed.length; i++) {
        const a = assignments[i];
        counts[a] += 1;
        for (let d = 0; d < dim; d++) sums[a][d] += normed[i][d];
      }
      let maxShift = 0;
      for (let c = 0; c < centroids.length; c++) {
        if (counts[c] === 0) continue;
        const newCentroid = sums[c].map((s) => s / counts[c]);
        const shift = Math.sqrt(squaredDistance(centroids[c], newCentroid));
        if (shift > maxShift) maxShift = shift;
        centroids[c] = newCentroid;
      }
      if (changed === 0 || maxShift < tolerance) {
        converged = true;
        iterations += 1;
        break;
      }
    }

    // 6. Build output clusters (customer objects grouped by assignment).
    const clusters = centroids.map(() => []);
    for (let i = 0; i < customers.length; i++) {
      clusters[assignments[i]].push(customers[i]);
    }

    // 7. Compute inertia (sum of squared distances to assigned centroid).
    let inertia = 0;
    for (let i = 0; i < normed.length; i++) {
      inertia += squaredDistance(normed[i], centroids[assignments[i]]);
    }

    return {
      centroids,
      assignments,
      clusters,
      iterations,
      converged,
      inertia,
      normalization: { means, stds },
    };
  }

  // ── behavioural segmentation ─────────────────────────────────────────

  /**
   * behavioralSegment(customer) — classify by behaviour signals.
   * Looks at (in priority order):
   *   - avgDiscountPct ≥ 0.15              → price_sensitive
   *   - avgOrderValue  ≥ 3000 && returnRate ≤ 0.05 → quality_seeker
   *   - reorderRate    ≥ 0.5 && touchpoints ≤ 3     → convenience
   *   - topBrandShare  ≥ 0.6                        → brand_loyal
   *   - promoShare     ≥ 0.5                        → promo_driven
   * Falls back to `convenience` for ambiguous cases.
   *
   * Accepts either raw signal fields on `customer` or an `orders` array,
   * from which it derives the needed stats.
   */
  behavioralSegment(customer) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('behavioralSegment: customer object is required');
    }
    const stats = this._deriveBehaviouralStats(customer);

    let segmentId;
    if (stats.avgDiscountPct >= 0.15) {
      segmentId = 'price_sensitive';
    } else if (stats.avgOrderValue >= 3000 && stats.returnRate <= 0.05) {
      segmentId = 'quality_seeker';
    } else if (stats.reorderRate >= 0.5 && stats.touchpoints <= 3) {
      segmentId = 'convenience';
    } else if (stats.topBrandShare >= 0.6) {
      segmentId = 'brand_loyal';
    } else if (stats.promoShare >= 0.5) {
      segmentId = 'promo_driven';
    } else {
      segmentId = 'convenience';
    }
    const entry = BEHAVIOURAL_SEGMENTS.find((s) => s.id === segmentId);
    return Object.freeze({ ...entry, stats });
  }

  _deriveBehaviouralStats(customer) {
    // honour explicit fields first
    const explicit = {
      avgDiscountPct: customer.avgDiscountPct,
      avgOrderValue: customer.avgOrderValue,
      returnRate: customer.returnRate,
      reorderRate: customer.reorderRate,
      touchpoints: customer.touchpoints,
      topBrandShare: customer.topBrandShare,
      promoShare: customer.promoShare,
    };

    const orders = Array.isArray(customer.orders) ? customer.orders : [];
    const amounts = orders.map((o) => Number(o.amount) || 0);
    const discounts = orders
      .map((o) => Number(o.discountPct))
      .filter((v) => Number.isFinite(v));
    const returnedCount = orders.filter((o) => o.returned === true).length;
    const reorderCount = orders.filter((o) => o.isReorder === true).length;
    const promoCount = orders.filter((o) => o.promo === true).length;

    const avgOrderValue = amounts.length
      ? safeSum(amounts) / amounts.length
      : Number(customer.avgOrderValue) || 0;
    const returnRate = orders.length ? returnedCount / orders.length : 0;
    const reorderRate = orders.length ? reorderCount / orders.length : 0;
    const promoShare = orders.length ? promoCount / orders.length : 0;

    // topBrandShare: if orders expose a `brand` field, compute max share.
    let topBrandShare = 0;
    if (orders.length && orders[0] && orders[0].brand != null) {
      const counts = new Map();
      for (const o of orders) {
        const key = String(o.brand || '');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = Math.max(...counts.values());
      topBrandShare = top / orders.length;
    }

    return {
      avgDiscountPct: Number.isFinite(explicit.avgDiscountPct)
        ? Number(explicit.avgDiscountPct)
        : mean(discounts),
      avgOrderValue: Number.isFinite(explicit.avgOrderValue)
        ? Number(explicit.avgOrderValue)
        : avgOrderValue,
      returnRate: Number.isFinite(explicit.returnRate)
        ? Number(explicit.returnRate)
        : returnRate,
      reorderRate: Number.isFinite(explicit.reorderRate)
        ? Number(explicit.reorderRate)
        : reorderRate,
      touchpoints: Number.isFinite(explicit.touchpoints)
        ? Number(explicit.touchpoints)
        : Number(customer.touchpointCount) || 0,
      topBrandShare: Number.isFinite(explicit.topBrandShare)
        ? Number(explicit.topBrandShare)
        : topBrandShare,
      promoShare: Number.isFinite(explicit.promoShare)
        ? Number(explicit.promoShare)
        : promoShare,
    };
  }

  // ── Venn-like segment overlap ────────────────────────────────────────

  /**
   * segmentOverlap(seg1, seg2) — Venn-style analysis of two customer ID
   * lists. Returns intersection, unions, and Jaccard similarity.
   *
   * @param {string[]|{customerIds:string[]}} seg1
   * @param {string[]|{customerIds:string[]}} seg2
   * @returns {{intersection:string[], union:string[], onlyA:string[],
   *            onlyB:string[], jaccard:number, sizeA:number, sizeB:number}}
   */
  segmentOverlap(seg1, seg2) {
    const a = CustomerSegmentation._toIdArray(seg1);
    const b = CustomerSegmentation._toIdArray(seg2);
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [];
    const unionSet = new Set();
    for (const id of setA) {
      unionSet.add(id);
      if (setB.has(id)) intersection.push(id);
    }
    for (const id of setB) unionSet.add(id);
    const onlyA = [];
    for (const id of setA) if (!setB.has(id)) onlyA.push(id);
    const onlyB = [];
    for (const id of setB) if (!setA.has(id)) onlyB.push(id);
    const union = Array.from(unionSet);
    const jaccard = union.length === 0 ? 0 : intersection.length / union.length;
    return {
      intersection: intersection.sort(),
      union: union.sort(),
      onlyA: onlyA.sort(),
      onlyB: onlyB.sort(),
      jaccard,
      sizeA: setA.size,
      sizeB: setB.size,
    };
  }

  static _toIdArray(input) {
    if (Array.isArray(input)) return input.map(String);
    if (input && Array.isArray(input.customerIds)) return input.customerIds.map(String);
    if (input && input instanceof Set) return Array.from(input, String);
    return [];
  }

  // ── recommendation ────────────────────────────────────────────────────

  /**
   * recommendAction(segmentId) — human-readable marketing action for a
   * segment ID (RFM segment, lifecycle stage, or behavioural).
   */
  recommendAction(segmentId) {
    // 1. RFM segment?
    const rfm = RFM_SEGMENTS.find((s) => s.id === segmentId);
    if (rfm) {
      const play = ACTION_PLAYBOOK[rfm.action] || ACTION_PLAYBOOK.grow;
      return Object.freeze({
        segmentId,
        kind: 'rfm',
        action: rfm.action,
        he: play.he,
        en: play.en,
        channels: play.channels.slice(),
        priority: play.priority,
      });
    }
    // 2. Lifecycle?
    const life = LIFECYCLE_STAGES.find((s) => s.id === segmentId);
    if (life) {
      const mapping = {
        prospect:   ACTION_PLAYBOOK.welcome,
        first_time: ACTION_PLAYBOOK.welcome,
        repeat:     ACTION_PLAYBOOK.grow,
        loyal:      ACTION_PLAYBOOK.retain,
        champion:   ACTION_PLAYBOOK.retain,
        at_risk:    ACTION_PLAYBOOK['win-back'],
        churned:    ACTION_PLAYBOOK['win-back'],
      };
      const play = mapping[segmentId] || ACTION_PLAYBOOK.nurture;
      const actionKey = Object.keys(ACTION_PLAYBOOK).find((k) => ACTION_PLAYBOOK[k] === play) || 'nurture';
      return Object.freeze({
        segmentId,
        kind: 'lifecycle',
        action: actionKey,
        he: play.he,
        en: play.en,
        channels: play.channels.slice(),
        priority: play.priority,
      });
    }
    // 3. Behavioural?
    const beh = BEHAVIOURAL_SEGMENTS.find((s) => s.id === segmentId);
    if (beh) {
      const mapping = {
        price_sensitive: ACTION_PLAYBOOK.grow,
        quality_seeker:  ACTION_PLAYBOOK.retain,
        convenience:     ACTION_PLAYBOOK.retain,
        brand_loyal:     ACTION_PLAYBOOK.retain,
        promo_driven:    ACTION_PLAYBOOK.grow,
      };
      const play = mapping[segmentId] || ACTION_PLAYBOOK.nurture;
      const actionKey = Object.keys(ACTION_PLAYBOOK).find((k) => ACTION_PLAYBOOK[k] === play) || 'nurture';
      return Object.freeze({
        segmentId,
        kind: 'behavioural',
        action: actionKey,
        he: play.he,
        en: play.en,
        channels: play.channels.slice(),
        priority: play.priority,
      });
    }
    // 4. Unknown — safe default.
    return Object.freeze({
      segmentId,
      kind: 'unknown',
      action: 'nurture',
      he: ACTION_PLAYBOOK.nurture.he,
      en: ACTION_PLAYBOOK.nurture.en,
      channels: ACTION_PLAYBOOK.nurture.channels.slice(),
      priority: ACTION_PLAYBOOK.nurture.priority,
    });
  }

  // ── CLV forecast ──────────────────────────────────────────────────────

  /**
   * forecastValue(customer, horizon) — simple, transparent CLV projection.
   *
   * CLV = AOV × Frequency/yr × GrossMargin × RetentionFactor × horizonYears
   *
   * Where:
   *   - AOV (avg order value) comes from orders or `customer.avgOrderValue`.
   *   - Frequency/yr is derived from orderCount / yearsActive, or
   *     `customer.annualFrequency`.
   *   - GrossMargin defaults to 0.35 (overridable via `customer.grossMargin`).
   *   - RetentionFactor is a geometric decay driven by `customer.retentionRate`
   *     (default 0.8). For a horizon of H years, the factor is the mean of
   *     (1 + r + r² + ... + r^(H-1)) / H, which is the standard simple CLV
   *     discount used in introductory marketing texts (no WACC).
   *   - horizonYears — positive number, default 3.
   *
   * @param {object} customer
   * @param {number|{horizonYears?:number, discountRate?:number}} [horizon]
   * @returns {{clv:number, inputs:object}}
   */
  forecastValue(customer, horizon) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('forecastValue: customer object is required');
    }
    let horizonYears = 3;
    let discountRate = 0; // optional WACC-style discount
    if (typeof horizon === 'number' && Number.isFinite(horizon)) {
      horizonYears = horizon;
    } else if (horizon && typeof horizon === 'object') {
      if (Number.isFinite(horizon.horizonYears)) horizonYears = horizon.horizonYears;
      if (Number.isFinite(horizon.discountRate)) discountRate = horizon.discountRate;
    }
    if (horizonYears <= 0) {
      return { clv: 0, inputs: { horizonYears, reason: 'non-positive horizon' } };
    }

    const orders = Array.isArray(customer.orders) ? customer.orders : null;
    let aov, annualFreq;
    if (orders && orders.length) {
      const amounts = orders.map((o) => Number(o.amount) || 0);
      aov = mean(amounts);
      // derive yearsActive from first/last order
      const ts = orders
        .map((o) => toEpoch(o.date))
        .filter((t) => Number.isFinite(t));
      let years = 1;
      if (ts.length >= 2) {
        ts.sort((a, b) => a - b);
        years = Math.max(
          1 / 12,
          (ts[ts.length - 1] - ts[0]) / (MS_PER_DAY * 365),
        );
      }
      annualFreq = orders.length / years;
    } else {
      aov = Number(customer.avgOrderValue) || 0;
      annualFreq = Number(customer.annualFrequency) || 0;
    }

    const grossMargin = Number.isFinite(customer.grossMargin)
      ? Number(customer.grossMargin)
      : 0.35;
    const retentionRate = Number.isFinite(customer.retentionRate)
      ? Number(customer.retentionRate)
      : 0.8;

    // Retention factor: mean of geometric series over horizon years.
    // Σ r^i for i in [0, H-1] = (1 - r^H) / (1 - r), averaged by H.
    let retentionFactor;
    if (retentionRate >= 1) {
      retentionFactor = 1;
    } else if (retentionRate <= 0) {
      retentionFactor = horizonYears > 0 ? 1 / horizonYears : 0;
    } else {
      const series = (1 - Math.pow(retentionRate, horizonYears)) / (1 - retentionRate);
      retentionFactor = series / horizonYears;
    }

    // Optional discount-rate adjustment (present-value style).
    let discountFactor = 1;
    if (discountRate > 0 && discountRate < 1) {
      const pvSeries = (1 - Math.pow(1 / (1 + discountRate), horizonYears)) / discountRate;
      discountFactor = pvSeries / horizonYears;
    }

    const annualContribution = aov * annualFreq * grossMargin * retentionFactor * discountFactor;
    const clv = annualContribution * horizonYears;

    return {
      clv: Math.round(clv * 100) / 100,
      inputs: {
        aov,
        annualFrequency: annualFreq,
        grossMargin,
        retentionRate,
        retentionFactor,
        discountRate,
        discountFactor,
        horizonYears,
      },
    };
  }

  // ── export for campaign ──────────────────────────────────────────────

  /**
   * indexCustomers(customers) — pre-compute segments for all customers.
   * Stores `{segmentId: [customerId]}` maps on the instance so later calls
   * to `exportSegments()` are O(1).
   *
   * The method never mutates the input array.
   */
  indexCustomers(customers) {
    if (!Array.isArray(customers)) {
      throw new TypeError('indexCustomers: customers must be an array');
    }
    const map = new Map();
    const add = (segId, id) => {
      if (!map.has(segId)) map.set(segId, []);
      map.get(segId).push(id);
    };
    for (const cust of customers) {
      const id = cust && (cust.id || cust.customerId || cust._id);
      if (id == null) continue;
      const rfm = this.computeRFM({ customer: cust });
      const seg = this.segmentRFM(rfm);
      add(seg.id, String(id));
      const life = this.lifecycleStage(cust);
      add(life.id, String(id));
      const beh = this.behavioralSegment(cust);
      add(beh.id, String(id));
    }
    this._cachedSegments = map;
    return map;
  }

  /**
   * exportSegments(segmentId) — list of customer IDs for a campaign.
   * Returns a fresh array (caller-owned).
   */
  exportSegments(segmentId) {
    if (!segmentId || typeof segmentId !== 'string') {
      throw new TypeError('exportSegments: segmentId string is required');
    }
    const list = this._cachedSegments.get(segmentId);
    return list ? list.slice() : [];
  }

  // ── static catalogues (for UI) ────────────────────────────────────────

  static get RFM_SEGMENTS() { return RFM_SEGMENTS; }
  static get LIFECYCLE_STAGES() { return LIFECYCLE_STAGES; }
  static get BEHAVIOURAL_SEGMENTS() { return BEHAVIOURAL_SEGMENTS; }
  static get ACTION_PLAYBOOK() { return ACTION_PLAYBOOK; }
  static get GLOSSARY() { return GLOSSARY; }
  static get DEFAULT_RFM_THRESHOLDS() { return DEFAULT_RFM_THRESHOLDS; }
}

// ─── exports ──────────────────────────────────────────────────────────────

module.exports = {
  CustomerSegmentation,
  RFM_SEGMENTS,
  LIFECYCLE_STAGES,
  BEHAVIOURAL_SEGMENTS,
  ACTION_PLAYBOOK,
  GLOSSARY,
  DEFAULT_RFM_THRESHOLDS,
  // exposed helpers (useful for tests / callers)
  __internal__: {
    scoreByThresholds,
    makeDeterministicRng,
    squaredDistance,
    toEpoch,
    mean,
  },
};
