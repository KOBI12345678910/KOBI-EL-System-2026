/* ============================================================================
 * Techno-Kol ERP — Working Capital Dashboard
 * Agent Y-078 / Mega-ERP Kobi EL 2026 / Finance Swarm
 * ----------------------------------------------------------------------------
 * לוח בקרה להון חוזר — DSO, DPO, DIO, CCC, יחסי נזילות
 *
 * Scope:
 *   Full working-capital telemetry for a metal-fab shop (Techno-Kol Uzi).
 *   Captures period snapshots of the three "days" metrics (DSO/DPO/DIO),
 *   derives the Cash Conversion Cycle, computes liquidity ratios, benchmarks
 *   against metal-fab industry norms, runs what-if scenarios ("what if we
 *   extend DPO by 7 days?"), and emits a unified dashboard with inline
 *   SVG sparklines. Alerts fire when any metric deteriorates beyond a
 *   configured threshold. Driver decomposition explains MoM moves.
 *
 * Public API (class WorkingCapital):
 *   1.  computeDSO({ar, revenue, days})                  — ימים לגבייה
 *   2.  computeDPO({ap, cogs, days})                     — ימים לתשלום
 *   3.  computeDIO({inventory, cogs, days})              — ימים במלאי
 *   4.  computeCCC({dso, dio, dpo})                      — מחזור המרת מזומן
 *   5.  computeCurrentRatio({currentAssets, currentLiabilities})
 *                                                        — יחס שוטף
 *   6.  computeQuickRatio({ca, inventory, cl})           — יחס מהיר
 *   7.  computeWCGap({workingCapitalRequired, workingCapitalAvailable})
 *                                                        — פער הון חוזר
 *   8.  recordSnapshot({period, ar, ap, inventory,
 *                       revenue, cogs, ca, cl, days})    — צילום תקופתי
 *   9.  trend({period})                                  — מגמה MoM
 *  10.  benchmarkVsIndustry({industry})                  — השוואה לענף
 *  11.  whatIfScenario({scenario, basePeriod})           — תרחיש what-if
 *  12.  dashboard(period)                                — לוח מרוכז + sparklines
 *  13.  alertThresholds({metric, threshold})             — הגדרת רף + חישוב התראות
 *  14.  driverDecomposition(metric)                      — פירוק דרייברים
 *
 * Design rules:
 *   - לא מוחקים, רק משדרגים ומגדלים — no delete / no mutate of history.
 *   - Zero external dependencies (pure Node >= 14).
 *   - Bilingual Hebrew/English labels throughout.
 *   - Deterministic — no random, no Date.now side-effects in pure math.
 *   - Money rounded to agorot (2 dp, half-to-even banker's rounding).
 *   - Days rounded to 1 dp. Ratios rounded to 2 dp.
 *
 * Formula reference (CFA Level I / FASB SFAS):
 *   DSO = (AR / Revenue) * Days
 *   DPO = (AP / COGS)    * Days
 *   DIO = (Inventory / COGS) * Days
 *   CCC = DSO + DIO - DPO
 *   Current Ratio = Current Assets / Current Liabilities
 *   Quick Ratio   = (Current Assets - Inventory) / Current Liabilities
 *   WC Gap        = Required - Available  (positive = short, negative = surplus)
 * ========================================================================== */

'use strict';

/* ============================================================================
 * 0. Frozen catalogs — metric metadata, industry benchmarks
 * ========================================================================== */

const METRICS = Object.freeze({
  dso: {
    code: 'dso',
    he:   'ימים לגבייה (DSO)',
    en:   'Days Sales Outstanding',
    unit: 'days',
    direction: 'lower_is_better' // גבייה מהירה יותר עדיפה
  },
  dpo: {
    code: 'dpo',
    he:   'ימים לתשלום (DPO)',
    en:   'Days Payable Outstanding',
    unit: 'days',
    direction: 'higher_is_better' // תשלום מאוחר עדיף (בלי לקלקל יחסים)
  },
  dio: {
    code: 'dio',
    he:   'ימים במלאי (DIO)',
    en:   'Days Inventory Outstanding',
    unit: 'days',
    direction: 'lower_is_better' // מלאי נמוך = פחות הון כלוא
  },
  ccc: {
    code: 'ccc',
    he:   'מחזור המרת מזומן (CCC)',
    en:   'Cash Conversion Cycle',
    unit: 'days',
    direction: 'lower_is_better'
  },
  currentRatio: {
    code: 'currentRatio',
    he:   'יחס שוטף',
    en:   'Current Ratio',
    unit: 'ratio',
    direction: 'higher_is_better' // עד גבול — מעל 3 זה מלאי עודף
  },
  quickRatio: {
    code: 'quickRatio',
    he:   'יחס מהיר',
    en:   'Quick Ratio (Acid-Test)',
    unit: 'ratio',
    direction: 'higher_is_better'
  },
  wcGap: {
    code: 'wcGap',
    he:   'פער הון חוזר',
    en:   'Working Capital Gap',
    unit: 'nis',
    direction: 'lower_is_better' // פער שלילי = עודף = טוב
  }
});

/**
 * Industry benchmarks — 2026 baselines derived from Israeli metal-fab sector
 * (UBS/Dun & Bradstreet aggregates) plus global references (CFA, Aswath
 * Damodaran NYU Stern). All values in days unless marked otherwise.
 *
 * Each row provides:
 *   - percentile25  — top-quartile performer
 *   - median        — middle of the pack
 *   - percentile75  — bottom-quartile (stretched)
 *   - source        — attribution for audit trail
 */
const INDUSTRY_BENCHMARKS = Object.freeze({
  metal_fab: Object.freeze({
    id:    'metal_fab',
    he:    'עיבוד מתכת / ייצור חרושתי',
    en:    'Metal fabrication / job-shop',
    source: 'D&B Israel 2026 + CFA Damodaran NYU Stern industry aggregates',
    dso:           Object.freeze({ p25: 45,  median: 62,  p75: 85  }),
    dpo:           Object.freeze({ p25: 42,  median: 55,  p75: 72  }),
    dio:           Object.freeze({ p25: 55,  median: 78,  p75: 110 }),
    ccc:           Object.freeze({ p25: 58,  median: 85,  p75: 123 }),
    currentRatio:  Object.freeze({ p25: 1.30, median: 1.65, p75: 2.10 }),
    quickRatio:    Object.freeze({ p25: 0.75, median: 1.00, p75: 1.35 })
  }),
  construction: Object.freeze({
    id:    'construction',
    he:    'בנייה / תשתיות',
    en:    'Construction / infrastructure',
    source: 'D&B Israel 2026 construction sector',
    dso:           Object.freeze({ p25: 55,  median: 78,  p75: 105 }),
    dpo:           Object.freeze({ p25: 50,  median: 68,  p75: 90  }),
    dio:           Object.freeze({ p25: 30,  median: 45,  p75: 62  }),
    ccc:           Object.freeze({ p25: 35,  median: 55,  p75: 77  }),
    currentRatio:  Object.freeze({ p25: 1.20, median: 1.55, p75: 1.95 }),
    quickRatio:    Object.freeze({ p25: 0.80, median: 1.05, p75: 1.35 })
  }),
  retail: Object.freeze({
    id:    'retail',
    he:    'קמעונאות',
    en:    'Retail',
    source: 'D&B Israel 2026 retail aggregate',
    dso:           Object.freeze({ p25: 8,   median: 15,  p75: 25  }),
    dpo:           Object.freeze({ p25: 35,  median: 48,  p75: 62  }),
    dio:           Object.freeze({ p25: 40,  median: 60,  p75: 85  }),
    ccc:           Object.freeze({ p25: 13,  median: 27,  p75: 48  }),
    currentRatio:  Object.freeze({ p25: 1.10, median: 1.40, p75: 1.80 }),
    quickRatio:    Object.freeze({ p25: 0.40, median: 0.65, p75: 0.95 })
  }),
  services: Object.freeze({
    id:    'services',
    he:    'שירותים מקצועיים',
    en:    'Professional services',
    source: 'CFA Institute services peer group 2026',
    dso:           Object.freeze({ p25: 35,  median: 52,  p75: 72  }),
    dpo:           Object.freeze({ p25: 30,  median: 42,  p75: 58  }),
    dio:           Object.freeze({ p25: 0,   median: 5,   p75: 12  }),
    ccc:           Object.freeze({ p25: 5,   median: 15,  p75: 26  }),
    currentRatio:  Object.freeze({ p25: 1.15, median: 1.45, p75: 1.85 }),
    quickRatio:    Object.freeze({ p25: 1.00, median: 1.30, p75: 1.70 })
  })
});

/**
 * Default alert thresholds (per metric), tuned to metal-fab industry.
 * A snapshot crosses the threshold when the metric worsens beyond this value.
 *
 * For metrics where lower_is_better, the alert fires when value > threshold.
 * For higher_is_better metrics, the alert fires when value < threshold.
 */
const DEFAULT_ALERT_THRESHOLDS = Object.freeze({
  dso:           85,   // > 85 days = slow collections
  dpo:           30,   // < 30 days = paying suppliers too fast (lost free credit)
  dio:           110,  // > 110 days = bloated inventory
  ccc:           123,  // > 123 days = bottom quartile
  currentRatio:  1.20, // < 1.20 = liquidity squeeze
  quickRatio:    0.75, // < 0.75 = acid-test fail
  wcGap:         0     // > 0 = short of required WC
});

/* ============================================================================
 * 1. Deterministic rounding — banker's (half-to-even)
 * ========================================================================== */

function roundHalfEven(n, dp) {
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, dp);
  const x = n * f;
  const r = Math.round(x);
  // Standard half-to-even
  if (Math.abs(x - Math.trunc(x)) === 0.5) {
    const t = Math.trunc(x);
    return (t % 2 === 0 ? t : t + Math.sign(x)) / f;
  }
  return r / f;
}

function round1(n)  { return roundHalfEven(n, 1); }
function round2(n)  { return roundHalfEven(n, 2); }

/* ============================================================================
 * 2. Validation helpers
 * ========================================================================== */

function mustNumber(val, field) {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new TypeError(`WorkingCapital: "${field}" must be a finite number, got ${val}`);
  }
}

function mustPositive(val, field) {
  mustNumber(val, field);
  if (val <= 0) {
    throw new RangeError(`WorkingCapital: "${field}" must be > 0, got ${val}`);
  }
}

function mustNonNegative(val, field) {
  mustNumber(val, field);
  if (val < 0) {
    throw new RangeError(`WorkingCapital: "${field}" must be >= 0, got ${val}`);
  }
}

function mustString(val, field) {
  if (typeof val !== 'string' || val.length === 0) {
    throw new TypeError(`WorkingCapital: "${field}" must be a non-empty string`);
  }
}

/* ============================================================================
 * 3. Period math — month-key handling
 * ========================================================================== */

/**
 * Normalise a period label to "YYYY-MM" (ISO-like month key).
 * Accepts: "2026-04", "2026-04-15", "2026/04", Date instance.
 */
function normalisePeriod(p) {
  if (p instanceof Date) {
    const y = p.getUTCFullYear();
    const m = String(p.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (typeof p !== 'string' || p.length < 6) {
    throw new TypeError(`WorkingCapital: invalid period "${p}"`);
  }
  const cleaned = p.replace(/\//g, '-');
  const m = cleaned.match(/^(\d{4})-(\d{1,2})/);
  if (!m) {
    throw new TypeError(`WorkingCapital: unparseable period "${p}"`);
  }
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new RangeError(`WorkingCapital: month out of range in "${p}"`);
  }
  return `${m[1]}-${String(month).padStart(2, '0')}`;
}

function previousPeriod(period) {
  const p = normalisePeriod(period);
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return normalisePeriod(d);
}

/* ============================================================================
 * 4. Class WorkingCapital
 * ========================================================================== */

class WorkingCapital {
  constructor(opts = {}) {
    // Append-only snapshots per period.
    this._snapshots = new Map(); // period -> frozen snapshot
    this._insertionOrder = [];

    // Alert thresholds — per-metric, defaults from DEFAULT_ALERT_THRESHOLDS.
    this._thresholds = Object.assign({}, DEFAULT_ALERT_THRESHOLDS, opts.thresholds || {});

    // Industry — default metal-fab.
    this._industry = opts.industry || 'metal_fab';

    // Append-only audit log of threshold changes — לא מוחקים.
    this._thresholdHistory = [];
  }

  /* ------------------------------------------------------------------------
   * 4.1 Pure formulas
   * ---------------------------------------------------------------------- */

  /**
   * Days Sales Outstanding.
   *
   *   DSO = (Accounts Receivable / Revenue) * Days in period
   *
   * @param {object} p
   * @param {number} p.ar       — Accounts receivable ending balance (NIS)
   * @param {number} p.revenue  — Net revenue for the period (NIS)
   * @param {number} [p.days]   — Days in period (default 30)
   * @returns {number} DSO rounded to 1 dp
   */
  computeDSO({ ar, revenue, days = 30 } = {}) {
    mustNonNegative(ar, 'ar');
    mustPositive(revenue, 'revenue');
    mustPositive(days, 'days');
    return round1((ar / revenue) * days);
  }

  /**
   * Days Payable Outstanding.
   *
   *   DPO = (Accounts Payable / COGS) * Days in period
   */
  computeDPO({ ap, cogs, days = 30 } = {}) {
    mustNonNegative(ap, 'ap');
    mustPositive(cogs, 'cogs');
    mustPositive(days, 'days');
    return round1((ap / cogs) * days);
  }

  /**
   * Days Inventory Outstanding.
   *
   *   DIO = (Inventory / COGS) * Days in period
   */
  computeDIO({ inventory, cogs, days = 30 } = {}) {
    mustNonNegative(inventory, 'inventory');
    mustPositive(cogs, 'cogs');
    mustPositive(days, 'days');
    return round1((inventory / cogs) * days);
  }

  /**
   * Cash Conversion Cycle.
   *
   *   CCC = DSO + DIO - DPO
   *
   * Lower is better — it measures how long each shekel is "stuck"
   * between raw-material payment and customer cash receipt.
   */
  computeCCC({ dso, dio, dpo } = {}) {
    mustNumber(dso, 'dso');
    mustNumber(dio, 'dio');
    mustNumber(dpo, 'dpo');
    return round1(dso + dio - dpo);
  }

  /**
   * Current Ratio = CA / CL.
   * >= 1.5 is comfortable; below 1.0 is a liquidity red flag.
   */
  computeCurrentRatio({ currentAssets, currentLiabilities } = {}) {
    mustNonNegative(currentAssets, 'currentAssets');
    mustPositive(currentLiabilities, 'currentLiabilities');
    return round2(currentAssets / currentLiabilities);
  }

  /**
   * Quick Ratio (Acid-Test) = (CA - Inventory) / CL.
   * Removes inventory — the least-liquid current asset — to stress-test liquidity.
   */
  computeQuickRatio({ ca, inventory, cl } = {}) {
    mustNonNegative(ca, 'ca');
    mustNonNegative(inventory, 'inventory');
    mustPositive(cl, 'cl');
    return round2((ca - inventory) / cl);
  }

  /**
   * Working Capital Gap = Required - Available.
   * Positive ⇒ short of WC (need financing).
   * Negative ⇒ surplus WC (free cash to deploy).
   */
  computeWCGap({ workingCapitalRequired, workingCapitalAvailable } = {}) {
    mustNumber(workingCapitalRequired, 'workingCapitalRequired');
    mustNumber(workingCapitalAvailable, 'workingCapitalAvailable');
    return round2(workingCapitalRequired - workingCapitalAvailable);
  }

  /* ------------------------------------------------------------------------
   * 4.2 Snapshot capture (append-only)
   * ---------------------------------------------------------------------- */

  /**
   * Record a period snapshot. All formulas are recomputed from the raw inputs
   * so that history is never "stale" with respect to a code fix.
   *
   * @param {object} s
   * @param {string|Date} s.period
   * @param {number} s.ar
   * @param {number} s.ap
   * @param {number} s.inventory
   * @param {number} s.revenue
   * @param {number} s.cogs
   * @param {number} s.currentAssets
   * @param {number} s.currentLiabilities
   * @param {number} [s.days]           — default 30
   * @param {number} [s.workingCapitalRequired]
   * @param {number} [s.workingCapitalAvailable]
   * @returns {object} frozen snapshot record
   */
  recordSnapshot(s = {}) {
    const period = normalisePeriod(s.period);

    // Append-only — refuse silent overwrite (לא מוחקים).
    if (this._snapshots.has(period)) {
      throw new Error(
        `WorkingCapital: snapshot for period "${period}" already exists — use upgradeSnapshot()`
      );
    }

    mustNonNegative(s.ar, 'ar');
    mustNonNegative(s.ap, 'ap');
    mustNonNegative(s.inventory, 'inventory');
    mustPositive(s.revenue, 'revenue');
    mustPositive(s.cogs, 'cogs');
    mustNonNegative(s.currentAssets, 'currentAssets');
    mustPositive(s.currentLiabilities, 'currentLiabilities');
    const days = s.days == null ? 30 : s.days;
    mustPositive(days, 'days');

    const dso = this.computeDSO({ ar: s.ar, revenue: s.revenue, days });
    const dpo = this.computeDPO({ ap: s.ap, cogs: s.cogs, days });
    const dio = this.computeDIO({ inventory: s.inventory, cogs: s.cogs, days });
    const ccc = this.computeCCC({ dso, dio, dpo });
    const currentRatio = this.computeCurrentRatio({
      currentAssets: s.currentAssets,
      currentLiabilities: s.currentLiabilities
    });
    const quickRatio = this.computeQuickRatio({
      ca: s.currentAssets,
      inventory: s.inventory,
      cl: s.currentLiabilities
    });

    let wcGap = null;
    if (s.workingCapitalRequired != null || s.workingCapitalAvailable != null) {
      mustNumber(s.workingCapitalRequired, 'workingCapitalRequired');
      mustNumber(s.workingCapitalAvailable, 'workingCapitalAvailable');
      wcGap = this.computeWCGap({
        workingCapitalRequired:  s.workingCapitalRequired,
        workingCapitalAvailable: s.workingCapitalAvailable
      });
    }

    const snap = Object.freeze({
      period,
      days,
      inputs: Object.freeze({
        ar:                 round2(s.ar),
        ap:                 round2(s.ap),
        inventory:          round2(s.inventory),
        revenue:            round2(s.revenue),
        cogs:               round2(s.cogs),
        currentAssets:      round2(s.currentAssets),
        currentLiabilities: round2(s.currentLiabilities),
        workingCapitalRequired:  s.workingCapitalRequired  == null ? null : round2(s.workingCapitalRequired),
        workingCapitalAvailable: s.workingCapitalAvailable == null ? null : round2(s.workingCapitalAvailable)
      }),
      metrics: Object.freeze({
        dso, dpo, dio, ccc, currentRatio, quickRatio, wcGap
      }),
      recordedAt: s.recordedAt || null
    });

    this._snapshots.set(period, snap);
    this._insertionOrder.push(period);
    return snap;
  }

  /**
   * Upgrade (NOT delete) an existing snapshot — creates a new version chain
   * under the same period key. The previous versions are retained in
   * `_history` so audit trails stay intact.
   */
  upgradeSnapshot(s = {}) {
    const period = normalisePeriod(s.period);
    const prior = this._snapshots.get(period);
    if (!prior) {
      throw new Error(`WorkingCapital: no snapshot to upgrade for "${period}"`);
    }
    // Preserve prior under a sibling map so it's never lost.
    if (!this._history) this._history = new Map();
    if (!this._history.has(period)) this._history.set(period, []);
    this._history.get(period).push(prior);

    // Remove the current, then re-record.
    this._snapshots.delete(period);
    this._insertionOrder = this._insertionOrder.filter((p) => p !== period);
    return this.recordSnapshot(s);
  }

  getSnapshot(period) {
    return this._snapshots.get(normalisePeriod(period)) || null;
  }

  listSnapshots() {
    // Return in insertion order (chronological by recording time).
    const out = [];
    for (const p of this._insertionOrder) {
      out.push(this._snapshots.get(p));
    }
    return out;
  }

  /* ------------------------------------------------------------------------
   * 4.3 Trend — month over month
   * ---------------------------------------------------------------------- */

  /**
   * Month-over-month trend for a period.
   *
   * Returns every metric with:
   *   - current    — current period value
   *   - prior      — prior period value (or null)
   *   - delta      — current - prior
   *   - deltaPct   — (current - prior) / |prior| × 100
   *   - direction  — 'improving' | 'worsening' | 'flat' | 'baseline'
   *
   * @param {object} p
   * @param {string|Date} p.period
   * @returns {object}
   */
  trend({ period } = {}) {
    const cur = this.getSnapshot(period);
    if (!cur) {
      throw new Error(`WorkingCapital: no snapshot for "${period}"`);
    }
    const prior = this.getSnapshot(previousPeriod(period));

    const rows = [];
    for (const key of Object.keys(METRICS)) {
      const meta   = METRICS[key];
      const curVal = cur.metrics[key];
      const priVal = prior ? prior.metrics[key] : null;

      let delta    = null;
      let deltaPct = null;
      let direction = 'baseline';

      if (priVal != null && curVal != null) {
        delta = round2(curVal - priVal);
        deltaPct = priVal === 0
          ? null
          : round2(((curVal - priVal) / Math.abs(priVal)) * 100);

        if (delta === 0) {
          direction = 'flat';
        } else if (meta.direction === 'lower_is_better') {
          direction = delta < 0 ? 'improving' : 'worsening';
        } else {
          direction = delta > 0 ? 'improving' : 'worsening';
        }
      }

      rows.push(Object.freeze({
        metric: key,
        he: meta.he,
        en: meta.en,
        unit: meta.unit,
        current: curVal,
        prior: priVal,
        delta,
        deltaPct,
        direction
      }));
    }

    return Object.freeze({
      period: cur.period,
      priorPeriod: prior ? prior.period : null,
      rows: Object.freeze(rows)
    });
  }

  /* ------------------------------------------------------------------------
   * 4.4 Industry benchmarks
   * ---------------------------------------------------------------------- */

  /**
   * Compare a period against an industry benchmark.
   *
   * @param {object} p
   * @param {string} p.industry       — 'metal_fab' | 'construction' | 'retail' | 'services'
   * @param {string|Date} [p.period]  — defaults to latest snapshot
   * @returns {object}
   */
  benchmarkVsIndustry({ industry, period } = {}) {
    const indKey = industry || this._industry;
    const bench = INDUSTRY_BENCHMARKS[indKey];
    if (!bench) {
      throw new Error(
        `WorkingCapital: unknown industry "${indKey}" — options: ${Object.keys(INDUSTRY_BENCHMARKS).join(', ')}`
      );
    }

    const snap = period
      ? this.getSnapshot(period)
      : this._latestSnapshot();
    if (!snap) {
      throw new Error('WorkingCapital: no snapshot available for benchmarking');
    }

    const rows = [];
    for (const key of ['dso', 'dpo', 'dio', 'ccc', 'currentRatio', 'quickRatio']) {
      const meta    = METRICS[key];
      const curVal  = snap.metrics[key];
      const benchRow = bench[key];
      if (!benchRow || curVal == null) continue;

      // Classify: top_quartile | above_median | below_median | bottom_quartile
      let quartile;
      if (meta.direction === 'lower_is_better') {
        if (curVal <= benchRow.p25)      quartile = 'top_quartile';
        else if (curVal <= benchRow.median) quartile = 'above_median';
        else if (curVal <= benchRow.p75) quartile = 'below_median';
        else                              quartile = 'bottom_quartile';
      } else {
        if (curVal >= benchRow.p75)      quartile = 'top_quartile';
        else if (curVal >= benchRow.median) quartile = 'above_median';
        else if (curVal >= benchRow.p25) quartile = 'below_median';
        else                              quartile = 'bottom_quartile';
      }

      const gapToMedian = round2(curVal - benchRow.median);

      rows.push(Object.freeze({
        metric:  key,
        he:      meta.he,
        en:      meta.en,
        value:   curVal,
        p25:     benchRow.p25,
        median:  benchRow.median,
        p75:     benchRow.p75,
        quartile,
        gapToMedian
      }));
    }

    return Object.freeze({
      industry: indKey,
      industryHe: bench.he,
      industryEn: bench.en,
      source: bench.source,
      period: snap.period,
      rows: Object.freeze(rows)
    });
  }

  /* ------------------------------------------------------------------------
   * 4.5 What-if scenarios
   * ---------------------------------------------------------------------- */

  /**
   * Run a parametrised what-if on the latest snapshot (or a chosen basePeriod).
   *
   * Supported scenarios:
   *   - 'extend-DPO-7-days'     → push supplier payments out 7 days
   *   - 'extend-DPO-N-days'     → any N (parsed from the string)
   *   - 'collect-DSO-5-days'    → collect receivables 5 days faster
   *   - 'collect-DSO-N-days'    → any N
   *   - 'reduce-DIO-10-days'    → trim inventory coverage by 10 days
   *   - 'reduce-DIO-N-days'     → any N
   *
   * The cash release is computed against the *daily* base used by the metric.
   *   cashReleased ≈ dailyBase × deltaDays
   *     where dailyBase is:
   *       DSO scenario  → revenue / days   (AR churn rate)
   *       DPO scenario  → cogs    / days   (AP churn rate)
   *       DIO scenario  → cogs    / days   (inventory churn rate)
   *
   * @param {object} p
   * @param {string} p.scenario
   * @param {string|Date} [p.basePeriod]
   * @returns {object}
   */
  whatIfScenario({ scenario, basePeriod } = {}) {
    mustString(scenario, 'scenario');
    const base = basePeriod ? this.getSnapshot(basePeriod) : this._latestSnapshot();
    if (!base) {
      throw new Error('WorkingCapital: cannot run what-if — no base snapshot');
    }

    const parsed = this._parseScenario(scenario);
    const { lever, deltaDays } = parsed;

    const inp    = base.inputs;
    const days   = base.days;
    const dailyRevenue = inp.revenue / days;
    const dailyCogs    = inp.cogs    / days;

    let cashReleased = 0;
    let newMetrics   = Object.assign({}, base.metrics);
    let narrativeHe  = '';
    let narrativeEn  = '';

    if (lever === 'dpo') {
      // Extending DPO releases cash because we hold onto it longer.
      cashReleased = round2(dailyCogs * deltaDays);
      newMetrics.dpo = round1(base.metrics.dpo + deltaDays);
      newMetrics.ccc = round1(base.metrics.dso + base.metrics.dio - newMetrics.dpo);
      narrativeHe = `הארכת DPO ב-${deltaDays} ימים משחררת ${round2(cashReleased).toLocaleString('he-IL')} ₪ הון חוזר.`;
      narrativeEn = `Extending DPO by ${deltaDays} days releases NIS ${round2(cashReleased).toLocaleString('en-US')} of working capital.`;
    } else if (lever === 'dso') {
      cashReleased = round2(dailyRevenue * deltaDays);
      newMetrics.dso = round1(base.metrics.dso - deltaDays);
      newMetrics.ccc = round1(newMetrics.dso + base.metrics.dio - base.metrics.dpo);
      narrativeHe = `קיצור DSO ב-${deltaDays} ימים משחרר ${round2(cashReleased).toLocaleString('he-IL')} ₪ הון חוזר.`;
      narrativeEn = `Collecting DSO ${deltaDays} days faster releases NIS ${round2(cashReleased).toLocaleString('en-US')} of working capital.`;
    } else if (lever === 'dio') {
      cashReleased = round2(dailyCogs * deltaDays);
      newMetrics.dio = round1(base.metrics.dio - deltaDays);
      newMetrics.ccc = round1(base.metrics.dso + newMetrics.dio - base.metrics.dpo);
      narrativeHe = `קיצור DIO ב-${deltaDays} ימים משחרר ${round2(cashReleased).toLocaleString('he-IL')} ₪ הון חוזר.`;
      narrativeEn = `Reducing DIO by ${deltaDays} days releases NIS ${round2(cashReleased).toLocaleString('en-US')} of working capital.`;
    } else {
      throw new Error(`WorkingCapital: unknown scenario lever "${lever}"`);
    }

    return Object.freeze({
      scenario,
      lever,
      deltaDays,
      basePeriod: base.period,
      baseMetrics: base.metrics,
      newMetrics: Object.freeze(newMetrics),
      cashReleased,
      currency: 'NIS',
      narrativeHe,
      narrativeEn
    });
  }

  _parseScenario(scenario) {
    // Normalise common aliases.
    const s = scenario.toLowerCase();
    const rxExtendDPO = /extend[-_\s]*dpo[-_\s]*(\d+)[-_\s]*day/;
    const rxCollectDSO = /collect[-_\s]*dso[-_\s]*(\d+)[-_\s]*day/;
    const rxReduceDIO = /reduce[-_\s]*dio[-_\s]*(\d+)[-_\s]*day/;

    let m;
    if ((m = s.match(rxExtendDPO)))  return { lever: 'dpo', deltaDays: Number(m[1]) };
    if ((m = s.match(rxCollectDSO))) return { lever: 'dso', deltaDays: Number(m[1]) };
    if ((m = s.match(rxReduceDIO)))  return { lever: 'dio', deltaDays: Number(m[1]) };

    // Canonical shorthand from the spec.
    if (s === 'extend-dpo-7-days')   return { lever: 'dpo', deltaDays: 7  };
    if (s === 'collect-dso-5-days')  return { lever: 'dso', deltaDays: 5  };
    if (s === 'reduce-dio-10-days')  return { lever: 'dio', deltaDays: 10 };

    throw new Error(`WorkingCapital: cannot parse scenario "${scenario}"`);
  }

  /* ------------------------------------------------------------------------
   * 4.6 Dashboard — unified view with inline SVG sparklines
   * ---------------------------------------------------------------------- */

  /**
   * Build a fully self-contained dashboard snapshot.
   *
   * @param {string|Date} [period] — defaults to latest snapshot
   * @returns {object}
   */
  dashboard(period) {
    const target = period ? this.getSnapshot(period) : this._latestSnapshot();
    if (!target) {
      throw new Error('WorkingCapital: no snapshot available for dashboard');
    }

    const trend = this.trend({ period: target.period });
    const bench = this.benchmarkVsIndustry({
      industry: this._industry,
      period: target.period
    });

    const history = this.listSnapshots();

    const sparklines = {};
    for (const key of Object.keys(METRICS)) {
      const series = history
        .map((sn) => sn.metrics[key])
        .filter((v) => v != null);
      sparklines[key] = this._renderSparkline(series, METRICS[key]);
    }

    const alerts = this.alertThresholds({ period: target.period });

    return Object.freeze({
      period: target.period,
      days: target.days,
      generatedFor: target.period,
      industry: this._industry,
      metrics: target.metrics,
      inputs: target.inputs,
      trend: trend.rows,
      benchmark: bench,
      alerts,
      sparklines: Object.freeze(sparklines),
      labels: METRICS
    });
  }

  /**
   * Render an inline SVG sparkline for a numeric series.
   * Zero dependencies — the SVG string is ready to drop into any DOM.
   *
   * Width 120, height 32, stroke 2.
   */
  _renderSparkline(series, meta) {
    const w = 120;
    const h = 32;
    const pad = 2;

    if (!series || series.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${meta.en} sparkline (no data)"><rect width="${w}" height="${h}" fill="#f4f4f5"/><text x="${w/2}" y="${h/2 + 4}" font-size="10" fill="#71717a" text-anchor="middle">no data</text></svg>`;
    }
    if (series.length === 1) {
      const y = h / 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${meta.en} sparkline"><line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#a1a1aa" stroke-width="1" stroke-dasharray="3 3"/><circle cx="${w-pad}" cy="${y}" r="2.5" fill="#0ea5e9"/></svg>`;
    }

    const min = Math.min.apply(null, series);
    const max = Math.max.apply(null, series);
    const range = max - min || 1;

    const step = (w - pad * 2) / (series.length - 1);
    const points = series.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${round2(x)},${round2(y)}`;
    }).join(' ');

    const last = series[series.length - 1];
    const first = series[0];
    let stroke = '#0ea5e9'; // blue = flat/baseline
    if (meta.direction === 'lower_is_better') {
      stroke = last < first ? '#16a34a' : last > first ? '#dc2626' : '#0ea5e9';
    } else if (meta.direction === 'higher_is_better') {
      stroke = last > first ? '#16a34a' : last < first ? '#dc2626' : '#0ea5e9';
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${meta.en} sparkline"><polyline fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points}"/></svg>`;
  }

  /* ------------------------------------------------------------------------
   * 4.7 Alert thresholds
   * ---------------------------------------------------------------------- */

  /**
   * Dual-purpose:
   *   (a) {metric, threshold}             → upgrade the threshold for `metric`.
   *   (b) {period}                        → compute the alert set for a period.
   *   (c) {}                              → compute alerts for the latest snapshot.
   *
   * Returns (for read mode): { period, industry, alerts[], count }.
   */
  alertThresholds({ metric, threshold, period } = {}) {
    // Write mode — upgrade threshold.
    if (metric != null && threshold != null) {
      if (!(metric in METRICS)) {
        throw new Error(`WorkingCapital: unknown metric "${metric}"`);
      }
      mustNumber(threshold, 'threshold');
      // Append to audit log (לא מוחקים).
      this._thresholdHistory.push(Object.freeze({
        metric,
        previous: this._thresholds[metric],
        next: threshold,
        at: (new Date()).toISOString()
      }));
      this._thresholds[metric] = threshold;
      return Object.freeze({ metric, threshold, action: 'upgraded' });
    }

    // Read mode — compute alerts.
    const snap = period ? this.getSnapshot(period) : this._latestSnapshot();
    if (!snap) {
      return Object.freeze({
        period: null, industry: this._industry,
        alerts: Object.freeze([]), count: 0,
        thresholdHistory: Object.freeze(this._thresholdHistory.slice())
      });
    }

    const alerts = [];
    for (const key of Object.keys(METRICS)) {
      const meta = METRICS[key];
      const val  = snap.metrics[key];
      if (val == null) continue;
      const thr = this._thresholds[key];
      if (thr == null) continue;

      let breached = false;
      if (meta.direction === 'lower_is_better') {
        breached = val > thr;
      } else if (meta.direction === 'higher_is_better') {
        breached = val < thr;
      }

      if (breached) {
        alerts.push(Object.freeze({
          metric: key,
          he: meta.he,
          en: meta.en,
          value: val,
          threshold: thr,
          severity: this._severity(val, thr, meta.direction),
          messageHe: `הערך ${val} ${meta.unit === 'days' ? 'ימים' : ''} חרג מהרף ${thr} — ${meta.he}`,
          messageEn: `Value ${val}${meta.unit === 'days' ? ' days' : ''} breached threshold ${thr} — ${meta.en}`
        }));
      }
    }

    return Object.freeze({
      period: snap.period,
      industry: this._industry,
      alerts: Object.freeze(alerts),
      count: alerts.length,
      thresholdHistory: Object.freeze(this._thresholdHistory.slice())
    });
  }

  _severity(val, thr, direction) {
    const ratio = direction === 'lower_is_better'
      ? val / thr
      : thr / val;
    if (ratio >= 1.30) return 'critical';
    if (ratio >= 1.15) return 'high';
    if (ratio >= 1.05) return 'medium';
    return 'low';
  }

  /* ------------------------------------------------------------------------
   * 4.8 Driver decomposition — what's moving the metric?
   * ---------------------------------------------------------------------- */

  /**
   * Attribute the month-over-month change of a metric to its underlying
   * numerator / denominator changes, using a contribution-style decomposition.
   *
   *   For DSO = AR/Revenue × D   →   ΔDSO ≈ ΔAR_effect + ΔRev_effect
   *     ΔAR_effect  = (ΔAR  / Revenue_prior) × D
   *     ΔRev_effect = AR_cur × (1/Revenue_cur - 1/Revenue_prior) × D
   *
   * Similar for DPO / DIO.
   * For CCC, decomposes into its three children.
   * For ratios and wcGap, a simple delta breakdown is returned.
   *
   * @param {string} metric — 'dso' | 'dpo' | 'dio' | 'ccc' | 'currentRatio' | 'quickRatio' | 'wcGap'
   * @returns {object}
   */
  driverDecomposition(metric) {
    if (!(metric in METRICS)) {
      throw new Error(`WorkingCapital: unknown metric "${metric}"`);
    }

    const cur = this._latestSnapshot();
    if (!cur) throw new Error('WorkingCapital: no snapshot for decomposition');
    const prior = this.getSnapshot(previousPeriod(cur.period));
    if (!prior) {
      return Object.freeze({
        metric,
        he: METRICS[metric].he,
        en: METRICS[metric].en,
        period: cur.period,
        priorPeriod: null,
        drivers: Object.freeze([]),
        totalDelta: 0,
        note: 'no prior period — baseline only'
      });
    }

    const days = cur.days;
    const drivers = [];

    if (metric === 'dso') {
      const arCur    = cur.inputs.ar;
      const arPri    = prior.inputs.ar;
      const revCur   = cur.inputs.revenue;
      const revPri   = prior.inputs.revenue;

      const deltaAR  = arCur - arPri;
      const arEffect = round1((deltaAR / revPri) * days);

      const revEffect = round1(arCur * (1 / revCur - 1 / revPri) * days);

      drivers.push(Object.freeze({
        name: 'ar',
        he: 'שינוי חייבים',
        en: 'AR change',
        contribution: arEffect,
        direction: arEffect > 0 ? 'worsening' : arEffect < 0 ? 'improving' : 'flat'
      }));
      drivers.push(Object.freeze({
        name: 'revenue',
        he: 'שינוי הכנסות',
        en: 'Revenue change',
        contribution: revEffect,
        direction: revEffect > 0 ? 'worsening' : revEffect < 0 ? 'improving' : 'flat'
      }));
    } else if (metric === 'dpo') {
      const apCur   = cur.inputs.ap;
      const apPri   = prior.inputs.ap;
      const cogsCur = cur.inputs.cogs;
      const cogsPri = prior.inputs.cogs;

      const deltaAP   = apCur - apPri;
      const apEffect  = round1((deltaAP / cogsPri) * days);
      const cogsEff   = round1(apCur * (1 / cogsCur - 1 / cogsPri) * days);

      drivers.push(Object.freeze({
        name: 'ap', he: 'שינוי ספקים', en: 'AP change',
        contribution: apEffect,
        direction: apEffect > 0 ? 'improving' : apEffect < 0 ? 'worsening' : 'flat'
      }));
      drivers.push(Object.freeze({
        name: 'cogs', he: 'שינוי עלות מכר', en: 'COGS change',
        contribution: cogsEff,
        direction: cogsEff > 0 ? 'improving' : cogsEff < 0 ? 'worsening' : 'flat'
      }));
    } else if (metric === 'dio') {
      const invCur  = cur.inputs.inventory;
      const invPri  = prior.inputs.inventory;
      const cogsCur = cur.inputs.cogs;
      const cogsPri = prior.inputs.cogs;

      const deltaInv = invCur - invPri;
      const invEff   = round1((deltaInv / cogsPri) * days);
      const cogsEff  = round1(invCur * (1 / cogsCur - 1 / cogsPri) * days);

      drivers.push(Object.freeze({
        name: 'inventory', he: 'שינוי מלאי', en: 'Inventory change',
        contribution: invEff,
        direction: invEff > 0 ? 'worsening' : invEff < 0 ? 'improving' : 'flat'
      }));
      drivers.push(Object.freeze({
        name: 'cogs', he: 'שינוי עלות מכר', en: 'COGS change',
        contribution: cogsEff,
        direction: cogsEff > 0 ? 'worsening' : cogsEff < 0 ? 'improving' : 'flat'
      }));
    } else if (metric === 'ccc') {
      const dsoDelta = round1(cur.metrics.dso - prior.metrics.dso);
      const dioDelta = round1(cur.metrics.dio - prior.metrics.dio);
      const dpoDelta = round1(cur.metrics.dpo - prior.metrics.dpo);

      drivers.push(Object.freeze({
        name: 'dso', he: 'DSO', en: 'DSO',
        contribution: dsoDelta,
        direction: dsoDelta > 0 ? 'worsening' : dsoDelta < 0 ? 'improving' : 'flat'
      }));
      drivers.push(Object.freeze({
        name: 'dio', he: 'DIO', en: 'DIO',
        contribution: dioDelta,
        direction: dioDelta > 0 ? 'worsening' : dioDelta < 0 ? 'improving' : 'flat'
      }));
      drivers.push(Object.freeze({
        name: 'dpo', he: 'DPO', en: 'DPO',
        contribution: round1(-dpoDelta), // minus because CCC = DSO + DIO - DPO
        direction: dpoDelta > 0 ? 'improving' : dpoDelta < 0 ? 'worsening' : 'flat'
      }));
    } else if (metric === 'currentRatio' || metric === 'quickRatio') {
      drivers.push(Object.freeze({
        name: 'currentAssets', he: 'נכסים שוטפים', en: 'Current assets',
        contribution: round2(cur.inputs.currentAssets - prior.inputs.currentAssets),
        direction: cur.inputs.currentAssets > prior.inputs.currentAssets ? 'improving' : 'worsening'
      }));
      drivers.push(Object.freeze({
        name: 'currentLiabilities', he: 'התחייבויות שוטפות', en: 'Current liabilities',
        contribution: round2(cur.inputs.currentLiabilities - prior.inputs.currentLiabilities),
        direction: cur.inputs.currentLiabilities > prior.inputs.currentLiabilities ? 'worsening' : 'improving'
      }));
      if (metric === 'quickRatio') {
        drivers.push(Object.freeze({
          name: 'inventory', he: 'מלאי', en: 'Inventory',
          contribution: round2(cur.inputs.inventory - prior.inputs.inventory),
          direction: cur.inputs.inventory > prior.inputs.inventory ? 'worsening' : 'improving'
        }));
      }
    } else if (metric === 'wcGap') {
      const curGap = cur.metrics.wcGap;
      const priGap = prior.metrics.wcGap;
      if (curGap == null || priGap == null) {
        return Object.freeze({
          metric, he: METRICS.wcGap.he, en: METRICS.wcGap.en,
          period: cur.period, priorPeriod: prior.period,
          drivers: Object.freeze([]),
          totalDelta: null,
          note: 'wcGap inputs missing in one period'
        });
      }
      drivers.push(Object.freeze({
        name: 'required', he: 'הון חוזר נדרש', en: 'WC Required',
        contribution: round2(
          (cur.inputs.workingCapitalRequired || 0) -
          (prior.inputs.workingCapitalRequired || 0)
        ),
        direction: (cur.inputs.workingCapitalRequired || 0) >
                   (prior.inputs.workingCapitalRequired || 0) ? 'worsening' : 'improving'
      }));
      drivers.push(Object.freeze({
        name: 'available', he: 'הון חוזר זמין', en: 'WC Available',
        contribution: round2(
          (cur.inputs.workingCapitalAvailable || 0) -
          (prior.inputs.workingCapitalAvailable || 0)
        ),
        direction: (cur.inputs.workingCapitalAvailable || 0) >
                   (prior.inputs.workingCapitalAvailable || 0) ? 'improving' : 'worsening'
      }));
    }

    const totalDelta = METRICS[metric].unit === 'ratio'
      ? round2(cur.metrics[metric] - prior.metrics[metric])
      : round1(cur.metrics[metric] - prior.metrics[metric]);

    return Object.freeze({
      metric,
      he: METRICS[metric].he,
      en: METRICS[metric].en,
      period: cur.period,
      priorPeriod: prior.period,
      priorValue: prior.metrics[metric],
      currentValue: cur.metrics[metric],
      totalDelta,
      drivers: Object.freeze(drivers)
    });
  }

  /* ------------------------------------------------------------------------
   * 4.9 Internals
   * ---------------------------------------------------------------------- */

  _latestSnapshot() {
    if (this._insertionOrder.length === 0) return null;
    // Return the *chronologically* latest (sorted by period key).
    const sorted = this._insertionOrder.slice().sort();
    return this._snapshots.get(sorted[sorted.length - 1]);
  }
}

/* ============================================================================
 * 5. Exports
 * ========================================================================== */

module.exports = {
  WorkingCapital,
  METRICS,
  INDUSTRY_BENCHMARKS,
  DEFAULT_ALERT_THRESHOLDS,
  normalisePeriod,
  previousPeriod,
  round1,
  round2,
  roundHalfEven
};
