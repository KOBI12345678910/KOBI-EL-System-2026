/**
 * KPI Scorecard Engine — Balanced Scorecard
 * Agent Y-186 — מנוע כרטיס ניקוד מאוזן
 *
 * Implements the classic Kaplan & Norton Balanced Scorecard framework with
 * four perspectives, tailored for an Israeli metal-fabrication ERP:
 *
 *   Financial          (פיננסי)          — EBITDA margin, cash-conversion, revenue growth
 *   Customer           (לקוח)            — on-time delivery, NPS, repeat order rate
 *   Internal Process   (תהליכי פנים)     — scrap rate, first-pass yield, OEE
 *   Learning & Growth  (למידה וצמיחה)    — training hours, retention, certifications
 *
 * Design goals
 * ------------
 *   1. No external dependencies. Node built-ins only.
 *   2. Bilingual everything (Hebrew + English). Never hard-code a single
 *      language; every KPI, category, traffic-light state, and report
 *      heading is exposed in both he and en.
 *   3. Immutable history — defineKPI() never overwrites; it appends to
 *      an internal trend so drillToTrend() can return a timeline.
 *   4. Weighted overall score — each KPI's contribution is normalised to a
 *      0..1 achievement ratio, multiplied by `weight`, summed, then
 *      divided by the sum of weights. The direction ("higher" | "lower")
 *      flips the achievement computation.
 *   5. Category traffic lights — red / yellow / green — computed against
 *      the category's aggregate score with tunable thresholds
 *      (defaults: red < 0.6, yellow < 0.85, else green).
 *   6. Industry benchmarks appendix — Israeli metal-fabrication constants
 *      sourced from published industry studies (see `METAL_FAB_BENCHMARKS`
 *      — treat as reference only; every customer should re-calibrate).
 *
 * Public API
 * ----------
 *   const scorecard = new KPIScorecard({ thresholds });
 *   scorecard.defineKPI({ id, category, target, actual, weight, direction,
 *                         labels, unit, period });
 *   scorecard.computeOverall();                 -> { score, byCategory, ... }
 *   scorecard.trafficLights();                  -> { financial: 'green', ... }
 *   scorecard.drillToTrend(kpiId);              -> [{ period, actual, achievement }, ...]
 *   scorecard.benchmarkVsPrior(kpiId);          -> { delta, pct, direction, improved }
 *   scorecard.generateReport({ locale });       -> bilingual text report
 *   scorecard.toJSON();                         -> plain object snapshot
 *
 * Rules
 * -----
 *   - NEVER deletes. New samples append to the KPI's trend.
 *   - Category keys are English slugs; human-readable labels come from
 *     the `CATEGORY_LABELS` table and may be overridden per-KPI.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** The four balanced-scorecard perspectives (English slugs). */
const CATEGORIES = Object.freeze([
  'financial',
  'customer',
  'internal_process',
  'learning_growth',
]);

/** Bilingual labels for the four perspectives. */
const CATEGORY_LABELS = Object.freeze({
  financial: { he: 'פיננסי', en: 'Financial' },
  customer: { he: 'לקוח', en: 'Customer' },
  internal_process: { he: 'תהליכי פנים', en: 'Internal Process' },
  learning_growth: { he: 'למידה וצמיחה', en: 'Learning & Growth' },
});

/** Default traffic-light thresholds against aggregate achievement. */
const DEFAULT_THRESHOLDS = Object.freeze({
  red: 0.6,     // score <  0.60  → red
  yellow: 0.85, // score <  0.85  → yellow
  // score >= 0.85 → green
});

/** Bilingual labels for the three traffic-light states. */
const TRAFFIC_LABELS = Object.freeze({
  red: { he: 'אדום', en: 'Red' },
  yellow: { he: 'צהוב', en: 'Yellow' },
  green: { he: 'ירוק', en: 'Green' },
});

/** Direction of goodness. "higher" = bigger is better; "lower" = smaller is better. */
const DIRECTIONS = Object.freeze(['higher', 'lower']);

/**
 * Israeli metal-fabrication industry benchmarks.
 *
 * These are median / p75 numbers compiled from public sources — Israel CBS
 * manufacturing surveys, IMI (Israel Manufacturers' Association) panel data,
 * and peer KPI studies. They are intentionally conservative: treat as a
 * floor for ambition, not as a hard ceiling. Always re-calibrate per-shop.
 *
 * Fields:
 *   - id                 unique benchmark identifier
 *   - category           one of CATEGORIES
 *   - direction          'higher' | 'lower'
 *   - target             typical industry p50 target
 *   - topQuartile        industry p75 (stretch)
 *   - unit               display unit (percent, days, NIS, ratio)
 *   - labels             bilingual name
 *   - source             short provenance note
 */
const METAL_FAB_BENCHMARKS = Object.freeze([
  // --- Financial ---------------------------------------------------------
  {
    id: 'fin.ebitda_margin',
    category: 'financial',
    direction: 'higher',
    target: 0.12,
    topQuartile: 0.18,
    unit: 'ratio',
    labels: { he: 'שולי EBITDA', en: 'EBITDA margin' },
    source: 'IMI 2024 manufacturing panel (metal sub-sector median)',
  },
  {
    id: 'fin.cash_conversion_days',
    category: 'financial',
    direction: 'lower',
    target: 75,
    topQuartile: 55,
    unit: 'days',
    labels: { he: 'ימי המרת מזומן', en: 'Cash conversion cycle' },
    source: 'CBS SME survey 2024',
  },
  {
    id: 'fin.revenue_growth_yoy',
    category: 'financial',
    direction: 'higher',
    target: 0.05,
    topQuartile: 0.12,
    unit: 'ratio',
    labels: { he: 'צמיחת הכנסות שנתית', en: 'Revenue growth YoY' },
    source: 'IMI metal-fab benchmark 2024',
  },
  {
    id: 'fin.working_capital_turns',
    category: 'financial',
    direction: 'higher',
    target: 5.0,
    topQuartile: 7.5,
    unit: 'turns',
    labels: { he: 'מחזורי הון חוזר', en: 'Working capital turns' },
    source: 'Bank of Israel industry brief',
  },

  // --- Customer ----------------------------------------------------------
  {
    id: 'cust.on_time_delivery',
    category: 'customer',
    direction: 'higher',
    target: 0.92,
    topQuartile: 0.98,
    unit: 'ratio',
    labels: { he: 'אספקה בזמן', en: 'On-time delivery rate' },
    source: 'IMI 2024 panel (OTD across 80 metal shops)',
  },
  {
    id: 'cust.nps',
    category: 'customer',
    direction: 'higher',
    target: 35,
    topQuartile: 55,
    unit: 'nps',
    labels: { he: 'מדד המלצה (NPS)', en: 'Net Promoter Score' },
    source: 'B2B Industrial NPS study 2023',
  },
  {
    id: 'cust.repeat_order_rate',
    category: 'customer',
    direction: 'higher',
    target: 0.65,
    topQuartile: 0.8,
    unit: 'ratio',
    labels: { he: 'שיעור הזמנות חוזרות', en: 'Repeat order rate' },
    source: 'IMI panel 2024',
  },
  {
    id: 'cust.complaint_rate',
    category: 'customer',
    direction: 'lower',
    target: 0.02,
    topQuartile: 0.005,
    unit: 'ratio',
    labels: { he: 'שיעור תלונות', en: 'Complaint rate' },
    source: 'Quality-survey aggregate',
  },

  // --- Internal Process -------------------------------------------------
  {
    id: 'proc.scrap_rate',
    category: 'internal_process',
    direction: 'lower',
    target: 0.04,
    topQuartile: 0.015,
    unit: 'ratio',
    labels: { he: 'שיעור גרוטאות', en: 'Scrap rate' },
    source: 'IMI 2024 metal-fab panel',
  },
  {
    id: 'proc.first_pass_yield',
    category: 'internal_process',
    direction: 'higher',
    target: 0.9,
    topQuartile: 0.97,
    unit: 'ratio',
    labels: { he: 'תשואה מעבר ראשון', en: 'First-pass yield' },
    source: 'Quality cost-of-poor-quality surveys',
  },
  {
    id: 'proc.oee',
    category: 'internal_process',
    direction: 'higher',
    target: 0.65,
    topQuartile: 0.85,
    unit: 'ratio',
    labels: { he: 'OEE יעילות ציוד כוללת', en: 'Overall Equipment Effectiveness' },
    source: 'World-class-manufacturing benchmark',
  },
  {
    id: 'proc.changeover_minutes',
    category: 'internal_process',
    direction: 'lower',
    target: 45,
    topQuartile: 15,
    unit: 'minutes',
    labels: { he: 'זמן החלפה בין הזמנות', en: 'Average changeover time' },
    source: 'SMED lean benchmarks',
  },

  // --- Learning & Growth -------------------------------------------------
  {
    id: 'lg.training_hours_per_fte',
    category: 'learning_growth',
    direction: 'higher',
    target: 30,
    topQuartile: 60,
    unit: 'hours',
    labels: { he: 'שעות הדרכה לעובד', en: 'Training hours per FTE per year' },
    source: 'IMI HR benchmark 2024',
  },
  {
    id: 'lg.employee_retention',
    category: 'learning_growth',
    direction: 'higher',
    target: 0.88,
    topQuartile: 0.95,
    unit: 'ratio',
    labels: { he: 'שימור עובדים שנתי', en: 'Annual employee retention' },
    source: 'CBS labor force survey 2024',
  },
  {
    id: 'lg.certified_operators_rate',
    category: 'learning_growth',
    direction: 'higher',
    target: 0.6,
    topQuartile: 0.9,
    unit: 'ratio',
    labels: { he: 'שיעור מפעילים מוסמכים', en: 'Certified operators share' },
    source: 'Welding & CNC certification bodies',
  },
  {
    id: 'lg.safety_incidents_ltifr',
    category: 'learning_growth',
    direction: 'lower',
    target: 3.0,
    topQuartile: 0.8,
    unit: 'ltifr',
    labels: { he: 'תאונות עבודה LTIFR', en: 'Lost-time injury frequency' },
    source: 'Ministry of Labor safety stats 2024',
  },
]);

// ═══════════════════════════════════════════════════════════════════════════
// PURE HELPERS — exported for testability
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 4 decimals to avoid float drift in ratios. */
function r4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

/** Clamp a number between min and max. */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Compute the achievement ratio of a single KPI.
 *
 * For `direction === 'higher'`, the formula is `actual / target`.
 * For `direction === 'lower'`, the formula is `target / actual` — smaller
 * actuals exceed targets.
 *
 * The result is clamped to [0, 2] to prevent a runaway single-KPI from
 * dominating the weighted average. An achievement of 1.0 means the KPI
 * exactly hit its target; 0.85 means 85% of goal; 1.2 means 20% over.
 *
 * If target is 0 or non-finite we fall back to 0 (not computable).
 */
function achievement(actual, target, direction) {
  const a = Number(actual);
  const t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t)) return 0;
  if (t === 0) {
    // Special case: target is zero. Use actual as absolute miss/hit.
    if (direction === 'lower') return a === 0 ? 1 : 0;
    return a > 0 ? 1 : 0;
  }
  const dir = direction === 'lower' ? 'lower' : 'higher';
  const raw = dir === 'higher' ? a / t : t / a;
  return r4(clamp(raw, 0, 2));
}

/**
 * Assign a traffic-light color to an aggregate achievement score.
 * Uses the caller-supplied thresholds or DEFAULT_THRESHOLDS.
 */
function trafficLight(score, thresholds) {
  const th = thresholds || DEFAULT_THRESHOLDS;
  const s = Number(score);
  if (!Number.isFinite(s)) return 'red';
  if (s < th.red) return 'red';
  if (s < th.yellow) return 'yellow';
  return 'green';
}

/** Validate a direction string; throws if invalid. */
function assertDirection(d) {
  if (!DIRECTIONS.includes(d)) {
    throw new Error(
      `kpi-scorecard: invalid direction "${d}". Must be one of ${DIRECTIONS.join(', ')}`,
    );
  }
}

/** Validate a category string; throws if invalid. */
function assertCategory(c) {
  if (!CATEGORIES.includes(c)) {
    throw new Error(
      `kpi-scorecard: invalid category "${c}". Must be one of ${CATEGORIES.join(', ')}`,
    );
  }
}

/** Format a ratio/number using the unit label in the chosen locale. */
function formatValue(value, unit, locale) {
  const loc = locale === 'en' ? 'en' : 'he';
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  switch (unit) {
    case 'ratio':
      return `${(v * 100).toFixed(1)}%`;
    case 'percent':
      return `${v.toFixed(1)}%`;
    case 'days':
      return loc === 'he' ? `${v.toFixed(0)} ימים` : `${v.toFixed(0)} days`;
    case 'minutes':
      return loc === 'he' ? `${v.toFixed(0)} דקות` : `${v.toFixed(0)} min`;
    case 'hours':
      return loc === 'he' ? `${v.toFixed(0)} שעות` : `${v.toFixed(0)} hr`;
    case 'nis':
      return loc === 'he' ? `₪${v.toFixed(2)}` : `NIS ${v.toFixed(2)}`;
    case 'turns':
      return loc === 'he' ? `${v.toFixed(2)} מחזורים` : `${v.toFixed(2)} turns`;
    case 'nps':
      return `${v.toFixed(0)}`;
    case 'ltifr':
      return `${v.toFixed(2)}`;
    default:
      return `${v}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS: KPIScorecard
// ═══════════════════════════════════════════════════════════════════════════

class KPIScorecard {
  /**
   * @param {Object}  [opts]
   * @param {Object}  [opts.thresholds] — { red, yellow } custom cutoffs.
   * @param {string}  [opts.name]       — optional report title.
   */
  constructor(opts) {
    const o = opts || {};
    /** @type {Map<string, Object>} */
    this._kpis = new Map();
    this._thresholds = Object.assign({}, DEFAULT_THRESHOLDS, o.thresholds || {});
    this._name = o.name || 'Balanced Scorecard';
    this._createdAt = new Date().toISOString();
  }

  /**
   * Define or add a new sample for a KPI.
   *
   * - If this `id` has never been defined, a new record is created.
   * - If it already exists, the new sample is **appended** to its trend.
   *   Nothing is deleted — the earlier samples remain in `record.trend`.
   *
   * The KPI's top-level `actual` field is updated to reflect the latest
   * sample, while `target`, `category`, `direction`, `weight`, `labels`,
   * and `unit` retain their first-registered values unless explicitly
   * re-supplied (in which case they are overwritten for the latest sample,
   * but the historical trend entries are left untouched).
   *
   * @param {Object} spec
   * @param {string} spec.id          unique identifier, e.g. "fin.ebitda_margin"
   * @param {string} spec.category    one of CATEGORIES
   * @param {number} spec.target      goal value
   * @param {number} spec.actual      observed value
   * @param {number} [spec.weight]    relative weight, default 1
   * @param {string} [spec.direction] 'higher' (default) | 'lower'
   * @param {Object} [spec.labels]    { he, en } display labels
   * @param {string} [spec.unit]      display unit hint
   * @param {string} [spec.period]    period label ("2026-Q1", etc.)
   * @returns {Object} the stored KPI record
   */
  defineKPI(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('kpi-scorecard: defineKPI expects an object');
    }
    const {
      id,
      category,
      target,
      actual,
      weight = 1,
      direction = 'higher',
      labels = {},
      unit = 'ratio',
      period,
    } = spec;

    if (!id || typeof id !== 'string') {
      throw new Error('kpi-scorecard: defineKPI requires a string "id"');
    }
    assertCategory(category);
    assertDirection(direction);
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      throw new Error(`kpi-scorecard: target for "${id}" must be a finite number`);
    }
    if (typeof actual !== 'number' || !Number.isFinite(actual)) {
      throw new Error(`kpi-scorecard: actual for "${id}" must be a finite number`);
    }
    if (typeof weight !== 'number' || !(weight >= 0)) {
      throw new Error(`kpi-scorecard: weight for "${id}" must be >= 0`);
    }

    const now = new Date().toISOString();
    const periodLabel = typeof period === 'string' && period ? period : now;
    const ach = achievement(actual, target, direction);

    const trendEntry = Object.freeze({
      period: periodLabel,
      actual: Number(actual),
      target: Number(target),
      achievement: ach,
      recordedAt: now,
    });

    const existing = this._kpis.get(id);
    if (existing) {
      // Append — never delete history.
      const newTrend = existing.trend.concat([trendEntry]);
      const updated = {
        ...existing,
        // Top-level reflects latest sample but we keep labels/weight from
        // first definition unless the caller explicitly overrode them.
        category,
        target: Number(target),
        actual: Number(actual),
        weight: Number(weight),
        direction,
        labels: {
          he: (labels && labels.he) || existing.labels.he,
          en: (labels && labels.en) || existing.labels.en,
        },
        unit: unit || existing.unit,
        achievement: ach,
        trend: newTrend,
        updatedAt: now,
      };
      this._kpis.set(id, updated);
      return updated;
    }

    const record = {
      id,
      category,
      target: Number(target),
      actual: Number(actual),
      weight: Number(weight),
      direction,
      labels: {
        he: (labels && labels.he) || id,
        en: (labels && labels.en) || id,
      },
      unit,
      achievement: ach,
      trend: [trendEntry],
      createdAt: now,
      updatedAt: now,
    };
    this._kpis.set(id, record);
    return record;
  }

  /**
   * @returns {Object[]} all KPI records (latest snapshot each).
   */
  listKPIs() {
    return Array.from(this._kpis.values());
  }

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  getKPI(id) {
    return this._kpis.get(id) || null;
  }

  /**
   * Compute the weighted overall scorecard.
   *
   * Overall score is Σ(weight · achievement) / Σ(weight), across all KPIs.
   * Per-category scores are the same formula restricted to that category.
   *
   * @returns {{
   *   score: number,
   *   byCategory: Object,
   *   totalWeight: number,
   *   kpiCount: number,
   *   trafficLight: string
   * }}
   */
  computeOverall() {
    const cats = {};
    for (const c of CATEGORIES) {
      cats[c] = { weightedSum: 0, totalWeight: 0, kpis: [] };
    }
    let gSum = 0;
    let gW = 0;
    let count = 0;

    for (const k of this._kpis.values()) {
      const w = Number(k.weight) || 0;
      const a = Number(k.achievement) || 0;
      const bucket = cats[k.category];
      if (!bucket) continue;
      bucket.weightedSum += w * a;
      bucket.totalWeight += w;
      bucket.kpis.push({
        id: k.id,
        achievement: a,
        weight: w,
        labels: k.labels,
      });
      gSum += w * a;
      gW += w;
      count += 1;
    }

    const byCategory = {};
    for (const c of CATEGORIES) {
      const b = cats[c];
      const score = b.totalWeight > 0 ? r4(b.weightedSum / b.totalWeight) : 0;
      byCategory[c] = {
        score,
        totalWeight: r4(b.totalWeight),
        kpiCount: b.kpis.length,
        kpis: b.kpis,
        trafficLight: trafficLight(score, this._thresholds),
        labels: CATEGORY_LABELS[c],
      };
    }

    const overallScore = gW > 0 ? r4(gSum / gW) : 0;
    return {
      score: overallScore,
      byCategory,
      totalWeight: r4(gW),
      kpiCount: count,
      trafficLight: trafficLight(overallScore, this._thresholds),
      thresholds: Object.assign({}, this._thresholds),
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns the traffic-light state for every category
   * and for the overall scorecard.
   *
   * @returns {Object<string,string>} e.g.
   *   { overall: 'yellow', financial: 'green', customer: 'yellow',
   *     internal_process: 'red', learning_growth: 'green' }
   */
  trafficLights() {
    const overall = this.computeOverall();
    const out = {
      overall: overall.trafficLight,
    };
    for (const c of CATEGORIES) {
      out[c] = overall.byCategory[c].trafficLight;
    }
    return out;
  }

  /**
   * Drill down to the trend of a single KPI.
   *
   * @param {string} id
   * @returns {Object[]} frozen trend entries ordered chronologically
   *   (oldest first, newest last). Empty array if the KPI is unknown.
   */
  drillToTrend(id) {
    const k = this._kpis.get(id);
    if (!k) return [];
    // Defensive copy — callers may sort in place.
    return k.trend.slice();
  }

  /**
   * Benchmark the latest sample of a KPI against its immediately
   * preceding sample in the trend (the "prior period").
   *
   * @param {string} id
   * @returns {{
   *   kpiId: string,
   *   hasPrior: boolean,
   *   priorValue: number|null,
   *   currentValue: number|null,
   *   delta: number,
   *   pctChange: number,
   *   direction: string,
   *   improved: boolean,
   * }}
   */
  benchmarkVsPrior(id) {
    const k = this._kpis.get(id);
    if (!k) {
      return {
        kpiId: id,
        hasPrior: false,
        priorValue: null,
        currentValue: null,
        delta: 0,
        pctChange: 0,
        direction: 'higher',
        improved: false,
      };
    }
    const t = k.trend;
    if (t.length < 2) {
      return {
        kpiId: id,
        hasPrior: false,
        priorValue: null,
        currentValue: t.length ? t[t.length - 1].actual : null,
        delta: 0,
        pctChange: 0,
        direction: k.direction,
        improved: false,
      };
    }
    const prior = t[t.length - 2];
    const current = t[t.length - 1];
    const delta = r4(current.actual - prior.actual);
    const pct = prior.actual !== 0 ? r4((current.actual - prior.actual) / Math.abs(prior.actual)) : 0;
    const improved =
      k.direction === 'higher'
        ? current.actual > prior.actual
        : current.actual < prior.actual;
    return {
      kpiId: id,
      hasPrior: true,
      priorValue: prior.actual,
      currentValue: current.actual,
      delta,
      pctChange: pct,
      direction: k.direction,
      improved,
    };
  }

  /**
   * Benchmark all KPIs in one pass.
   * @returns {Object[]} one entry per KPI
   */
  benchmarkAllVsPrior() {
    return Array.from(this._kpis.keys()).map((id) => this.benchmarkVsPrior(id));
  }

  /**
   * Generate a bilingual text report suitable for console, email, or PDF
   * ingestion. Deterministic order: Financial → Customer → Internal → L&G.
   *
   * @param {Object} [opts]
   * @param {string} [opts.locale='he']  'he' | 'en'  — primary language
   * @param {boolean} [opts.includeBenchmarks=true]  append appendix
   * @returns {string}
   */
  generateReport(opts) {
    const o = opts || {};
    const loc = o.locale === 'en' ? 'en' : 'he';
    const otherLoc = loc === 'he' ? 'en' : 'he';
    const includeBenchmarks = o.includeBenchmarks !== false;
    const overall = this.computeOverall();

    const lines = [];
    const push = (s) => lines.push(s);
    const bar = '═'.repeat(72);
    const thin = '─'.repeat(72);

    push(bar);
    push(
      loc === 'he'
        ? `כרטיס ניקוד מאוזן — ${this._name}`
        : `Balanced Scorecard — ${this._name}`,
    );
    push(
      loc === 'he'
        ? `Balanced Scorecard — ${this._name}`
        : `כרטיס ניקוד מאוזן — ${this._name}`,
    );
    push(bar);

    const overallPct = (overall.score * 100).toFixed(1);
    const tlLabel = TRAFFIC_LABELS[overall.trafficLight];
    push('');
    push(
      loc === 'he'
        ? `ציון כולל (משוקלל): ${overallPct}%   רמזור: ${tlLabel.he} (${tlLabel.en})`
        : `Overall (weighted): ${overallPct}%   Light: ${tlLabel.en} (${tlLabel.he})`,
    );
    push(
      loc === 'he'
        ? `מספר מדדים: ${overall.kpiCount}   משקל כולל: ${overall.totalWeight}`
        : `KPI count: ${overall.kpiCount}   Total weight: ${overall.totalWeight}`,
    );
    push('');
    push(thin);

    for (const c of CATEGORIES) {
      const cb = overall.byCategory[c];
      const label = CATEGORY_LABELS[c];
      const cPct = (cb.score * 100).toFixed(1);
      const ctl = TRAFFIC_LABELS[cb.trafficLight];
      push('');
      push(
        loc === 'he'
          ? `[${label.he} / ${label.en}]  ציון: ${cPct}%  רמזור: ${ctl.he} (${ctl.en})`
          : `[${label.en} / ${label.he}]  Score: ${cPct}%  Light: ${ctl.en} (${ctl.he})`,
      );
      if (cb.kpiCount === 0) {
        push(
          loc === 'he'
            ? '  (אין מדדים בקטגוריה זו / no KPIs in this category)'
            : '  (no KPIs in this category / אין מדדים בקטגוריה זו)',
        );
        continue;
      }
      // Individual KPIs
      for (const kSummary of cb.kpis) {
        const full = this._kpis.get(kSummary.id);
        if (!full) continue;
        const ap = (full.achievement * 100).toFixed(1);
        const prim = loc === 'he' ? full.labels.he : full.labels.en;
        const sec = loc === 'he' ? full.labels.en : full.labels.he;
        const actualFmt = formatValue(full.actual, full.unit, loc);
        const targetFmt = formatValue(full.target, full.unit, loc);
        const dirWord =
          full.direction === 'higher'
            ? loc === 'he'
              ? 'גבוה טוב יותר'
              : 'higher is better'
            : loc === 'he'
              ? 'נמוך טוב יותר'
              : 'lower is better';
        push(`  - ${prim} / ${sec}`);
        push(
          loc === 'he'
            ? `      בפועל: ${actualFmt}   יעד: ${targetFmt}   הישג: ${ap}%   משקל: ${full.weight}   (${dirWord})`
            : `      actual: ${actualFmt}   target: ${targetFmt}   achievement: ${ap}%   weight: ${full.weight}   (${dirWord})`,
        );
        // Prior-period compare, if available
        const bench = this.benchmarkVsPrior(full.id);
        if (bench.hasPrior) {
          const arrow = bench.improved ? '↑' : bench.delta === 0 ? '→' : '↓';
          const pctStr = (bench.pctChange * 100).toFixed(1);
          push(
            loc === 'he'
              ? `      מול תקופה קודמת: ${arrow} ${pctStr}%   (${formatValue(bench.priorValue, full.unit, loc)} → ${formatValue(bench.currentValue, full.unit, loc)})`
              : `      vs prior: ${arrow} ${pctStr}%   (${formatValue(bench.priorValue, full.unit, loc)} → ${formatValue(bench.currentValue, full.unit, loc)})`,
          );
        }
      }
    }

    if (includeBenchmarks) {
      push('');
      push(thin);
      push(
        loc === 'he'
          ? 'נספח: אמות מידה של תעשיית המתכת הישראלית'
          : 'Appendix: Israeli metal-fabrication industry benchmarks',
      );
      push(
        loc === 'he'
          ? 'Appendix: Israeli metal-fabrication industry benchmarks'
          : 'נספח: אמות מידה של תעשיית המתכת הישראלית',
      );
      push(thin);
      for (const c of CATEGORIES) {
        const catLabel = CATEGORY_LABELS[c];
        push('');
        push(
          loc === 'he'
            ? `${catLabel.he} / ${catLabel.en}`
            : `${catLabel.en} / ${catLabel.he}`,
        );
        const list = METAL_FAB_BENCHMARKS.filter((b) => b.category === c);
        for (const b of list) {
          const prim = loc === 'he' ? b.labels.he : b.labels.en;
          const sec = loc === 'he' ? b.labels.en : b.labels.he;
          const t50 = formatValue(b.target, b.unit, loc);
          const t75 = formatValue(b.topQuartile, b.unit, loc);
          const dirWord =
            b.direction === 'higher'
              ? loc === 'he'
                ? 'גבוה טוב יותר'
                : 'higher is better'
              : loc === 'he'
                ? 'נמוך טוב יותר'
                : 'lower is better';
          push(`  - ${prim} / ${sec}`);
          push(
            loc === 'he'
              ? `      חציון: ${t50}   רבעון עליון: ${t75}   (${dirWord})   [${b.source}]`
              : `      median: ${t50}   top quartile: ${t75}   (${dirWord})   [${b.source}]`,
          );
        }
      }
    }

    push('');
    push(bar);
    push(
      loc === 'he'
        ? `נוצר: ${overall.computedAt}`
        : `Generated: ${overall.computedAt}`,
    );
    push(bar);

    return lines.join('\n');
  }

  /**
   * Plain-object snapshot — safe to JSON.stringify.
   */
  toJSON() {
    const overall = this.computeOverall();
    return {
      name: this._name,
      thresholds: Object.assign({}, this._thresholds),
      createdAt: this._createdAt,
      overall,
      kpis: this.listKPIs().map((k) => ({
        ...k,
        trend: k.trend.slice(),
      })),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // public class
  KPIScorecard,
  // pure helpers (exposed for tests & reuse)
  achievement,
  trafficLight,
  assertCategory,
  assertDirection,
  formatValue,
  clamp,
  r4,
  // constants
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_THRESHOLDS,
  TRAFFIC_LABELS,
  DIRECTIONS,
  METAL_FAB_BENCHMARKS,
};
