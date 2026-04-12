/**
 * Sales-Side Forecasting — SalesForecast
 * Agent Y-030 — Mega-ERP Techno-Kol Uzi (Kobi EL), Wave 2026.
 *
 * Complements X-04 / X-11 demand forecasting (which is finance/inventory
 * driven). This module is **sales-side**: it projects bookings / closed-won
 * revenue off the CRM opportunity pipeline using five industry-standard
 * methods and one Monte Carlo simulation.
 *
 * Zero dependencies. Pure JavaScript. Fully deterministic (the Monte Carlo
 * simulation uses a seedable PRNG so convergence tests can pin exact values).
 * Bilingual — all user-visible strings ship with `he` and `en` variants.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 * Future waves may add methods / fields to the return shape. They MUST NOT
 * remove existing fields; existing tests pin the fields they care about.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *
 * FORECAST METHODS
 *
 *   1. commit              — conservative. Only include deals with
 *                            probability >= 0.90 and closeDate within period.
 *                            This is what the sales rep will "commit" to the
 *                            board and be held accountable for.
 *
 *   2. best-case           — optimistic. Include every deal whose closeDate
 *                            is within period, summed raw (amount). No
 *                            probability discount. This is the "if the
 *                            stars align" number.
 *
 *   3. stage-weighted      — classical CRM forecast. amount × stageProbability
 *                            for every deal in period. Stage probabilities
 *                            default to the Salesforce/HubSpot-style ladder
 *                            but callers can pass custom `stageProbabilities`.
 *
 *   4. historical-win-rate — amount × rep.historicalWinRate. Useful when
 *                            stage probabilities are biased (sandbaggers
 *                            inflate late-stage, optimists inflate early
 *                            stage). Uses the rep's own track record.
 *
 *   5. monte-carlo         — runs N trials (default 10,000). Each trial,
 *                            each deal either closes-won (with its deal-level
 *                            probability) or closes-lost. The output is a
 *                            full distribution: mean, median, p10, p25, p50,
 *                            p75, p90, p95, stdev, plus the confidence bands.
 *                            The PRNG is seedable so reruns are bit-exact.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *
 * INPUT SHAPE — pipeline item (an "opportunity")
 *
 *   {
 *     id:            String,            // unique deal id
 *     name:          String,             // deal/account name (optional)
 *     amount:        Number,             // total contract value, NIS (or any currency)
 *     stage:         String,             // e.g. 'qualification' | 'proposal' | 'commit' | 'closed_won'
 *     probability:   Number,             // deal-level probability in [0,1]
 *                                        //   if omitted, stageProbabilities[stage] is used
 *     closeDate:     String | Date,      // ISO YYYY-MM-DD or Date
 *     owner:         String,             // salesperson id (e.g. 'rep_42')
 *     managerId:     String,             // optional manager id (for rollup)
 *     category:      String,             // optional manual category
 *     updatedAt:     String | Date,      // last modified (for sandbagging detection)
 *     ...                                // any other fields are preserved
 *   }
 *
 * ───────────────────────────────────────────────────────────────────────────
 *
 * PERIOD SHAPE
 *
 *   { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', label?: String }
 *
 * A deal is "in period" iff period.start <= deal.closeDate <= period.end.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *
 * PUBLIC API
 *
 *   const { SalesForecast } = require('./src/sales/sales-forecast.js');
 *   const sf = new SalesForecast(opts);
 *
 *   sf.buildForecast({ pipeline, period, method, ...opts })
 *   sf.rollup(salespeopleForecasts, managerId)
 *   sf.variance(forecast, actual)
 *   sf.snapshotForecast(date)
 *   sf.forecastTrend(period)
 *   sf.categorizeDeal(opportunity)
 *   sf.generateForecastCall(forecast)
 *
 * Plus a couple of useful helpers exported individually:
 *
 *   DEFAULT_STAGE_PROBABILITIES
 *   FORECAST_METHOD_LABELS
 *   CATEGORY_LABELS
 *   mulberry32                   — seedable PRNG (for tests)
 *   standardNormal               — Box-Muller N(0,1) sampler (for Monte Carlo
 *                                   confidence bands on non-binary models)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS + BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default stage-to-probability ladder. Matches the Salesforce /
 * HubSpot / classical-enterprise convention. Callers can override per-org.
 * Keys are lowercased and snake/kebab cased so user data can come in either.
 */
const DEFAULT_STAGE_PROBABILITIES = Object.freeze({
  // discovery / early stages
  prospect:        0.05,
  lead:            0.05,
  qualification:   0.10,
  qualified:       0.15,
  discovery:       0.20,
  needs_analysis:  0.25,

  // mid-funnel
  proposal:        0.40,
  value_proposition: 0.45,
  decision_maker:  0.50,
  'id_decision_makers': 0.50,
  perception:      0.55,

  // late-funnel
  negotiation:     0.75,
  negotiate:       0.75,
  'proposal_sent': 0.65,
  commit:          0.90,
  verbal:          0.90,

  // terminal
  closed_won:      1.00,
  won:             1.00,
  closed_lost:     0.00,
  lost:            0.00,
});

/**
 * Labels for the five forecast methods. Hebrew strings use simple
 * bidi-safe glyphs.
 */
const FORECAST_METHOD_LABELS = Object.freeze({
  commit:                 { he: 'מחויב (Commit)',             en: 'Commit' },
  'best-case':            { he: 'תרחיש אופטימי',              en: 'Best case' },
  'stage-weighted':       { he: 'משוקלל לפי שלב',             en: 'Stage-weighted' },
  'historical-win-rate':  { he: 'אחוז זכייה היסטורי',         en: 'Historical win-rate' },
  'monte-carlo':          { he: 'סימולציית מונטה-קרלו',        en: 'Monte Carlo (10k trials)' },
});

/**
 * Deal categorization buckets. These are the three groups a sales
 * manager uses on every forecast call.
 */
const CATEGORY_LABELS = Object.freeze({
  commit:    { he: 'מחויב',         en: 'Commit' },
  'best-case': { he: 'תרחיש אופטימי', en: 'Best case' },
  pipeline:  { he: 'צנרת',           en: 'Pipeline' },
  omitted:   { he: 'לא נכלל',        en: 'Omitted' },
});

const DEFAULT_MONTE_CARLO_TRIALS = 10000;

// Sandbagging detection defaults. A rep is flagged if the ratio between
// their historical win-rate-based forecast and their stage-weighted forecast
// diverges by more than the tolerance — i.e. the two forecasting methods
// disagree, which usually means the rep is either sandbagging (pessimistic
// on purpose to beat expectations) or inflating (optimistic to look good).
const SANDBAGGING_LOW_RATIO  = 0.80; // stageWeighted / winRate < 0.80 → sandbag
const SANDBAGGING_HIGH_RATIO = 1.25; // > 1.25 → inflation ("happy ears")

// Tolerance for "stale" opportunities. If `updatedAt` is more than this many
// days before `closeDate`, the deal is considered stale and flagged.
const STALE_DAYS_DEFAULT = 30;

// ═══════════════════════════════════════════════════════════════════════════
// 1. SMALL UTILITIES (validation, math, dates)
// ═══════════════════════════════════════════════════════════════════════════

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function toFinite(x, fallback) {
  return isFiniteNumber(x) ? x : fallback;
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

function round2(x) {
  // EPSILON-bumped round to avoid classic IEEE-754 drift
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function mean(arr) {
  return arr.length === 0 ? 0 : sum(arr) / arr.length;
}

function stdev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (n - 1));
}

/**
 * Percentile via linear interpolation (the "nearest-rank" method is too
 * coarse at 10k samples — we want smooth convergence for tests).
 */
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = clamp(p, 0, 1);
  const idx = clamped * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/**
 * Normalize a stage string for lookup. Accepts any of:
 *   'Proposal', 'proposal', 'PROPOSAL_SENT', 'proposal-sent'
 * and returns the snake_case key used in DEFAULT_STAGE_PROBABILITIES.
 */
function normalizeStageKey(stage) {
  if (typeof stage !== 'string') return '';
  return stage
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Parse a date that may already be a Date. Rejects nonsense. Timezone-
 * normalized to UTC midnight so period comparisons are exact.
 */
function toDate(d) {
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (typeof d === 'string') {
    // Accept YYYY-MM-DD or full ISO. Extract the date portion.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (!m) {
      const parsed = new Date(d);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  return null;
}

function toISODate(d) {
  if (!(d instanceof Date)) {
    const parsed = toDate(d);
    if (!parsed) return null;
    d = parsed;
  }
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function inPeriod(closeDate, period) {
  const cd = toDate(closeDate);
  if (!cd) return false;
  const start = toDate(period.start);
  const end = toDate(period.end);
  if (!start || !end) return false;
  return cd.getTime() >= start.getTime() && cd.getTime() <= end.getTime();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. PSEUDO-RANDOM NUMBER GENERATION — seedable for deterministic tests
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mulberry32 PRNG — tiny, fast, high-quality uniform in [0,1).
 * Seed is a 32-bit integer; identical seeds produce identical streams.
 */
function mulberry32(seed) {
  let a = (seed | 0) >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal N(0,1) sampler via Box-Muller. Takes a uniform PRNG.
 * Rejects u=0 to avoid log(0). Returns a single sample per call.
 */
function standardNormal(rng) {
  let u1 = rng();
  while (u1 <= 0) u1 = rng();
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return r * Math.cos(theta);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PIPELINE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize an opportunity to the canonical shape used internally.
 * Never mutates the input. Non-finite numbers fall back to safe defaults.
 */
function normalizeDeal(opp, stageProbabilities) {
  if (!opp || typeof opp !== 'object') {
    throw new TypeError('opportunity must be an object');
  }
  const amount = toFinite(opp.amount, 0);
  const stageKey = normalizeStageKey(opp.stage);
  const stageDefaultP = toFinite(stageProbabilities[stageKey], 0);
  const rawP = isFiniteNumber(opp.probability) ? opp.probability : stageDefaultP;
  const probability = clamp(rawP, 0, 1);
  return {
    id: String(opp.id == null ? '' : opp.id),
    name: opp.name ? String(opp.name) : '',
    amount: Math.max(0, amount),
    stage: opp.stage ? String(opp.stage) : '',
    stageKey,
    probability,
    stageProbability: clamp(stageDefaultP, 0, 1),
    closeDate: opp.closeDate == null ? null : opp.closeDate,
    owner: opp.owner ? String(opp.owner) : '',
    managerId: opp.managerId ? String(opp.managerId) : '',
    category: opp.category ? String(opp.category) : '',
    updatedAt: opp.updatedAt == null ? null : opp.updatedAt,
    // Preserve any additional fields verbatim for downstream consumers.
    meta: opp,
  };
}

function normalizePipeline(pipeline, stageProbabilities) {
  if (!Array.isArray(pipeline)) {
    throw new TypeError('pipeline must be an array of opportunities');
  }
  const out = new Array(pipeline.length);
  for (let i = 0; i < pipeline.length; i++) {
    out[i] = normalizeDeal(pipeline[i], stageProbabilities);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FORECAST METHODS — pure functions, each returns { total, deals, ... }
// ═══════════════════════════════════════════════════════════════════════════

function filterInPeriod(deals, period) {
  const out = [];
  for (let i = 0; i < deals.length; i++) {
    if (inPeriod(deals[i].closeDate, period)) out.push(deals[i]);
  }
  return out;
}

/**
 * Commit: only probability >= 0.90 deals. Full amount, not weighted.
 * This matches how most sales orgs define "commit" — a deal you're willing
 * to stake your reputation on.
 */
function forecastCommit(deals, period) {
  const inWindow = filterInPeriod(deals, period);
  const committed = inWindow.filter((d) => d.probability >= 0.90);
  const total = round2(sum(committed.map((d) => d.amount)));
  return {
    method: 'commit',
    total,
    dealCount: committed.length,
    totalPipelineCount: inWindow.length,
    deals: committed,
  };
}

/**
 * Best case: every deal in period, raw amount (no weighting).
 * This is the upper bound — if absolutely everything closes.
 */
function forecastBestCase(deals, period) {
  const inWindow = filterInPeriod(deals, period);
  // "all weighted opportunities" per spec — include every deal with p > 0.
  const candidates = inWindow.filter((d) => d.probability > 0);
  const total = round2(sum(candidates.map((d) => d.amount)));
  return {
    method: 'best-case',
    total,
    dealCount: candidates.length,
    totalPipelineCount: inWindow.length,
    deals: candidates,
  };
}

/**
 * Stage-weighted: amount × stageProbability for every deal in period.
 * This is the classical CRM forecast (called "weighted pipeline" in most
 * tools). Uses the deal's own probability if set, else falls back to
 * the stage default.
 */
function forecastStageWeighted(deals, period) {
  const inWindow = filterInPeriod(deals, period);
  let total = 0;
  const weighted = new Array(inWindow.length);
  for (let i = 0; i < inWindow.length; i++) {
    const d = inWindow[i];
    const w = d.amount * d.probability;
    weighted[i] = { ...d, weightedAmount: round2(w) };
    total += w;
  }
  return {
    method: 'stage-weighted',
    total: round2(total),
    dealCount: inWindow.length,
    totalPipelineCount: inWindow.length,
    deals: weighted,
  };
}

/**
 * Historical win-rate: amount × rep.historicalWinRate.
 *
 * `winRates` is a map of `{ [repId]: winRate in [0,1] }`. If a rep isn't in
 * the map, the global average (or 0.20 fallback) is used. If you pass a
 * scalar number instead of a map, it's applied uniformly to every deal —
 * handy for tests.
 */
function forecastHistoricalWinRate(deals, period, winRates, fallbackRate) {
  const inWindow = filterInPeriod(deals, period);
  const fallback = clamp(toFinite(fallbackRate, 0.20), 0, 1);

  let getRate;
  if (typeof winRates === 'number') {
    const uniform = clamp(winRates, 0, 1);
    getRate = () => uniform;
  } else if (winRates && typeof winRates === 'object') {
    getRate = (repId) => {
      const r = winRates[repId];
      return isFiniteNumber(r) ? clamp(r, 0, 1) : fallback;
    };
  } else {
    getRate = () => fallback;
  }

  let total = 0;
  const weighted = new Array(inWindow.length);
  for (let i = 0; i < inWindow.length; i++) {
    const d = inWindow[i];
    const rate = getRate(d.owner);
    const w = d.amount * rate;
    weighted[i] = { ...d, repWinRate: rate, weightedAmount: round2(w) };
    total += w;
  }
  return {
    method: 'historical-win-rate',
    total: round2(total),
    dealCount: inWindow.length,
    totalPipelineCount: inWindow.length,
    deals: weighted,
  };
}

/**
 * Monte Carlo: run `trials` simulations over the in-period pipeline.
 * For each trial, each deal independently closes-won with its own
 * `probability`, otherwise contributes zero. The trial total is the sum.
 *
 * Returns a full distribution: mean, stdev, percentiles (p10/p25/p50/p75/
 * p90/p95) and the confidence bands derived from them. The PRNG is
 * seedable so a given (pipeline, seed, trials) always yields identical
 * output — required for the convergence tests.
 *
 * The law of large numbers gives
 *   E[total]   = Σ amount_i × p_i     (== stage-weighted forecast)
 *   Var[total] = Σ amount_i^2 × p_i × (1 - p_i)
 * so the expected value converges to the stage-weighted total and the
 * standard deviation converges to sqrt(Σ amount_i^2 × p_i × (1-p_i)).
 * Tests pin both analytical invariants.
 */
function forecastMonteCarlo(deals, period, opts) {
  const trials = Math.max(1, Math.floor(toFinite(opts && opts.trials, DEFAULT_MONTE_CARLO_TRIALS)));
  const seed = (opts && isFiniteNumber(opts.seed)) ? (opts.seed | 0) : 0xC0FFEE;
  const rng = mulberry32(seed);
  const inWindow = filterInPeriod(deals, period);

  const results = new Array(trials);
  if (inWindow.length === 0) {
    // Zero-pipeline: everything is zero, but still return a well-formed shape.
    for (let t = 0; t < trials; t++) results[t] = 0;
  } else {
    for (let t = 0; t < trials; t++) {
      let total = 0;
      for (let i = 0; i < inWindow.length; i++) {
        const d = inWindow[i];
        const u = rng();
        if (u < d.probability) total += d.amount;
      }
      results[t] = total;
    }
  }

  results.sort((a, b) => a - b);
  const m = mean(results);
  const sd = stdev(results);

  // Analytical invariants — useful for convergence tests & sanity checks.
  const analyticalMean = sum(inWindow.map((d) => d.amount * d.probability));
  const analyticalVar = sum(
    inWindow.map((d) => d.amount * d.amount * d.probability * (1 - d.probability))
  );
  const analyticalStdev = Math.sqrt(analyticalVar);

  return {
    method: 'monte-carlo',
    total: round2(m),
    dealCount: inWindow.length,
    totalPipelineCount: inWindow.length,
    trials,
    seed,
    mean: round2(m),
    stdev: round2(sd),
    percentiles: {
      p10: round2(percentile(results, 0.10)),
      p25: round2(percentile(results, 0.25)),
      p50: round2(percentile(results, 0.50)),
      p75: round2(percentile(results, 0.75)),
      p90: round2(percentile(results, 0.90)),
      p95: round2(percentile(results, 0.95)),
    },
    confidence_bands: {
      p80: [round2(percentile(results, 0.10)), round2(percentile(results, 0.90))],
      p90: [round2(percentile(results, 0.05)), round2(percentile(results, 0.95))],
    },
    analytical: {
      mean: round2(analyticalMean),
      stdev: round2(analyticalStdev),
      variance: round2(analyticalVar),
    },
    deals: inWindow,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. SalesForecast class
// ═══════════════════════════════════════════════════════════════════════════

class SalesForecast {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.stageProbabilities] — override DEFAULT_STAGE_PROBABILITIES
   * @param {Object} [opts.winRates] — { [repId]: winRate in [0,1] }
   * @param {Number} [opts.fallbackWinRate=0.20] — used when rep not in winRates
   * @param {Object} [opts.hierarchy] — { [repId]: managerId } — reporting tree
   * @param {Number} [opts.staleDays=30] — threshold for stale-deal detection
   */
  constructor(opts = {}) {
    this.stageProbabilities = Object.freeze({
      ...DEFAULT_STAGE_PROBABILITIES,
      ...(opts.stageProbabilities || {}),
    });
    this.winRates = opts.winRates && typeof opts.winRates === 'object'
      ? { ...opts.winRates }
      : {};
    this.fallbackWinRate = clamp(toFinite(opts.fallbackWinRate, 0.20), 0, 1);
    this.hierarchy = opts.hierarchy && typeof opts.hierarchy === 'object'
      ? { ...opts.hierarchy }
      : {};
    this.staleDays = Math.max(1, Math.floor(toFinite(opts.staleDays, STALE_DAYS_DEFAULT)));

    // In-memory snapshot store. Key: ISO date. Value: frozen forecast.
    this._snapshots = new Map();

    // Keep the last pipeline used so forecastTrend / snapshot can work on it.
    this._lastPipeline = null;
    this._lastPeriod = null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.1 buildForecast — main dispatcher
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Build a forecast using one of the five methods.
   *
   * @param {Object} args
   * @param {Array}  args.pipeline — array of opportunities
   * @param {Object} args.period   — { start, end, label? }
   * @param {String} args.method   — one of the FORECAST_METHOD_LABELS keys
   * @param {Number} [args.trials] — Monte Carlo trial count
   * @param {Number} [args.seed]   — Monte Carlo PRNG seed
   * @param {Object} [args.winRates] — override this.winRates for this call
   * @returns {Object}
   */
  buildForecast({ pipeline, period, method, trials, seed, winRates } = {}) {
    if (!Array.isArray(pipeline)) {
      throw new TypeError('pipeline must be an array');
    }
    if (!period || typeof period !== 'object') {
      throw new TypeError('period must be an object { start, end }');
    }
    if (!period.start || !period.end) {
      throw new TypeError('period must have start and end');
    }
    if (!FORECAST_METHOD_LABELS[method]) {
      throw new TypeError(`unknown forecast method: ${method}`);
    }

    const deals = normalizePipeline(pipeline, this.stageProbabilities);
    const effectiveWinRates = winRates || this.winRates;

    let result;
    switch (method) {
      case 'commit':
        result = forecastCommit(deals, period);
        break;
      case 'best-case':
        result = forecastBestCase(deals, period);
        break;
      case 'stage-weighted':
        result = forecastStageWeighted(deals, period);
        break;
      case 'historical-win-rate':
        result = forecastHistoricalWinRate(
          deals,
          period,
          effectiveWinRates,
          this.fallbackWinRate
        );
        break;
      case 'monte-carlo':
        result = forecastMonteCarlo(deals, period, { trials, seed });
        break;
      default:
        /* istanbul ignore next — guarded above */
        throw new TypeError(`unknown forecast method: ${method}`);
    }

    // Attach period, label, timestamp, method bilingual label.
    const out = {
      ...result,
      period: {
        start: toISODate(period.start),
        end: toISODate(period.end),
        label: period.label || '',
      },
      method_label: FORECAST_METHOD_LABELS[method],
      generatedAt: new Date().toISOString(),
    };

    // Cache for snapshot / trend.
    this._lastPipeline = deals;
    this._lastPeriod = out.period;

    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.2 rollup — aggregate per-rep forecasts to a manager
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Roll up a set of per-salesperson forecasts to a manager.
   *
   * `salespeopleForecasts` is a map / object:
   *   { [repId]: { commit, bestCase, stageWeighted, winRate, ... } }
   * each value can be either:
   *   (a) a single forecast object (totals only)
   *   (b) an object with multiple method totals keyed by method name
   *
   * The rollup sums the numeric totals across reports. It also runs
   * sandbagging detection by comparing `stage-weighted` vs `historical-
   * win-rate` per rep and flagging the rep when the ratio is outside
   * [SANDBAGGING_LOW_RATIO, SANDBAGGING_HIGH_RATIO].
   *
   * @param {Object} salespeopleForecasts — { [repId]: forecastBundle }
   * @param {String} managerId — the manager rolling up
   * @returns {{
   *   managerId, reps, totals: { commit, bestCase, stageWeighted, winRate,
   *   monteCarlo }, sandbagging: Array, generatedAt
   * }}
   */
  rollup(salespeopleForecasts, managerId) {
    if (!salespeopleForecasts || typeof salespeopleForecasts !== 'object') {
      throw new TypeError('salespeopleForecasts must be an object');
    }
    const totals = {
      commit: 0,
      'best-case': 0,
      'stage-weighted': 0,
      'historical-win-rate': 0,
      'monte-carlo': 0,
    };
    const reps = [];
    const sandbagging = [];

    const repIds = Object.keys(salespeopleForecasts);
    for (let i = 0; i < repIds.length; i++) {
      const repId = repIds[i];
      const bundle = salespeopleForecasts[repId];
      if (!bundle) continue;

      // Respect hierarchy filter — if a hierarchy map was supplied, only
      // aggregate reps that actually report to the requested manager.
      if (managerId && this.hierarchy[repId] && this.hierarchy[repId] !== managerId) {
        continue;
      }

      // Extract per-method totals from whichever shape was passed in.
      const methodTotals = this._extractMethodTotals(bundle);
      for (const key of Object.keys(totals)) {
        if (isFiniteNumber(methodTotals[key])) totals[key] += methodTotals[key];
      }

      // Sandbagging detection: compare stage-weighted vs historical-win-rate.
      const sw = methodTotals['stage-weighted'];
      const wr = methodTotals['historical-win-rate'];
      const sandbagResult = detectSandbagging(sw, wr);

      reps.push({
        repId,
        totals: methodTotals,
        sandbag: sandbagResult,
      });
      if (sandbagResult.flagged) {
        sandbagging.push({ repId, ...sandbagResult });
      }
    }

    // Round every total for display.
    for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

    return {
      managerId: managerId || '',
      reps,
      totals,
      sandbagging,
      generatedAt: new Date().toISOString(),
    };
  }

  _extractMethodTotals(bundle) {
    // Shape (a): { method: 'commit', total: 1000 }  — single forecast
    if (bundle && typeof bundle === 'object' && typeof bundle.method === 'string'
        && isFiniteNumber(bundle.total)) {
      return { [bundle.method]: bundle.total };
    }
    // Shape (b): { commit: {total}, 'stage-weighted': {total}, ... }
    // or simpler: { commit: 1000, 'stage-weighted': 800 }
    const out = {};
    if (bundle && typeof bundle === 'object') {
      for (const key of Object.keys(bundle)) {
        const val = bundle[key];
        if (isFiniteNumber(val)) {
          out[key] = val;
        } else if (val && typeof val === 'object' && isFiniteNumber(val.total)) {
          out[key] = val.total;
        }
      }
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.3 variance — forecast accuracy vs actual
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute variance between a forecast and the actual result. Works on a
   * single { total } pair or on a bundle of method totals.
   *
   * Returns absolute variance, signed variance, variance percentage (signed),
   * and an accuracy score in [0,1] (1 = perfect, 0 = total miss or worse).
   *
   *   variance     = actual - forecast
   *   variancePct  = variance / forecast        (0 if forecast is 0)
   *   accuracy     = 1 - min(|variancePct|, 1)
   */
  variance(forecast, actual) {
    const f = this._extractTotal(forecast);
    const a = this._extractTotal(actual);
    const variance = a - f;
    const absVariance = Math.abs(variance);
    const variancePct = Math.abs(f) < Number.EPSILON ? 0 : variance / f;
    const accuracyScore = clamp(1 - Math.min(Math.abs(variancePct), 1), 0, 1);

    // Signed bias classification for the forecast call script.
    let bias;
    if (absVariance < 1e-6) bias = 'accurate';
    else if (variance > 0) bias = 'under-forecast';   // actual beat forecast
    else bias = 'over-forecast';                      // forecast exceeded actual

    return {
      forecast: round2(f),
      actual: round2(a),
      variance: round2(variance),
      absVariance: round2(absVariance),
      variancePct: Math.round(variancePct * 10000) / 10000, // 4dp
      accuracyScore: Math.round(accuracyScore * 10000) / 10000,
      bias,
    };
  }

  _extractTotal(x) {
    if (isFiniteNumber(x)) return x;
    if (x && typeof x === 'object') {
      if (isFiniteNumber(x.total)) return x.total;
      if (isFiniteNumber(x.amount)) return x.amount;
    }
    return 0;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.4 snapshotForecast — freeze the current forecast at a date
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Freeze the most-recent forecast at `date`, so forecastTrend() can
   * compare week-over-week. If you want to snapshot a specific forecast
   * (not the last one built), pass `opts.forecast`.
   *
   * The returned value is a deep-copied, frozen object. The snapshot is
   * stored in-memory under key = ISO date (YYYY-MM-DD).
   *
   * @param {String|Date} date
   * @param {Object} [opts]
   * @param {Object} [opts.forecast] — explicit forecast object to snapshot
   * @returns {Object} the stored snapshot
   */
  snapshotForecast(date, opts = {}) {
    const iso = toISODate(date);
    if (!iso) throw new TypeError('snapshotForecast: invalid date');

    const src = opts.forecast || this._lastForecast;
    if (!src) {
      throw new Error('snapshotForecast: no forecast to snapshot — call buildForecast first or pass opts.forecast');
    }
    const frozen = deepFreeze(JSON.parse(JSON.stringify({
      ...src,
      snapshotDate: iso,
    })));
    this._snapshots.set(iso, frozen);
    return frozen;
  }

  /**
   * Build-and-snapshot convenience used by forecastTrend. Stores the last
   * forecast under `_lastForecast` so a bare `snapshotForecast(date)` works.
   */
  buildAndRemember(args) {
    const f = this.buildForecast(args);
    this._lastForecast = f;
    return f;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.5 forecastTrend — week-over-week change, detect slipping deals
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute week-over-week change across stored snapshots whose period
   * matches `period`. Returns the trend (newest first), total delta,
   * absolute slipping count (deals that fell out of period between
   * snapshots), and bilingual summary strings.
   *
   * @param {Object} period — same shape as buildForecast
   * @returns {Object}
   */
  forecastTrend(period) {
    if (!period || !period.start || !period.end) {
      throw new TypeError('period must be { start, end }');
    }
    const periodKey = `${toISODate(period.start)}..${toISODate(period.end)}`;
    const relevant = [];
    for (const [dateKey, snap] of this._snapshots.entries()) {
      if (!snap || !snap.period) continue;
      const snapKey = `${snap.period.start}..${snap.period.end}`;
      if (snapKey === periodKey) {
        relevant.push({ dateKey, snap });
      }
    }
    relevant.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

    const points = relevant.map(({ dateKey, snap }) => ({
      date: dateKey,
      total: toFinite(snap.total, 0),
      dealCount: toFinite(snap.dealCount, 0),
      dealIds: Array.isArray(snap.deals) ? snap.deals.map((d) => d.id) : [],
    }));

    let totalDelta = 0;
    let wowDelta = 0;
    const slipping = [];
    if (points.length >= 2) {
      totalDelta = points[points.length - 1].total - points[0].total;
      wowDelta = points[points.length - 1].total - points[points.length - 2].total;

      // Deals that were in the previous snapshot but dropped out of the latest.
      const prev = new Set(points[points.length - 2].dealIds);
      const curr = new Set(points[points.length - 1].dealIds);
      for (const id of prev) {
        if (!curr.has(id)) slipping.push(id);
      }
    }

    return {
      period: { start: toISODate(period.start), end: toISODate(period.end) },
      points,
      totalDelta: round2(totalDelta),
      wowDelta: round2(wowDelta),
      slippingDealIds: slipping,
      summary_he: slipping.length
        ? `${slipping.length} עסקאות נשמטו מהתקופה; שינוי שבועי: ${round2(wowDelta)}`
        : `אין עסקאות נשמטות; שינוי שבועי: ${round2(wowDelta)}`,
      summary_en: slipping.length
        ? `${slipping.length} deals slipped out of period; WoW change: ${round2(wowDelta)}`
        : `no slipping deals; WoW change: ${round2(wowDelta)}`,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.6 categorizeDeal — bucket into commit / best-case / pipeline
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Auto-categorize a single opportunity. Rules:
   *
   *   probability >= 0.90  → 'commit'
   *   0.50 <= p < 0.90     → 'best-case'
   *   0.10 <= p < 0.50     → 'pipeline'
   *   p <  0.10            → 'omitted'   (too long tail)
   *
   * Also flags the deal as stale if `updatedAt` is more than `staleDays`
   * before `closeDate` — this indicates a deal the rep hasn't touched in
   * a while which is a classic sandbagging / slippage signal.
   *
   * @param {Object} opportunity
   * @returns {{ category, categoryLabel, stale, probability }}
   */
  categorizeDeal(opportunity) {
    const d = normalizeDeal(opportunity, this.stageProbabilities);
    let category;
    if (d.probability >= 0.90) category = 'commit';
    else if (d.probability >= 0.50) category = 'best-case';
    else if (d.probability >= 0.10) category = 'pipeline';
    else category = 'omitted';

    // Stale detection: if closeDate is in the future and updatedAt is more
    // than staleDays ago, the deal hasn't moved. Use _now override for tests.
    let stale = false;
    const now = this._now ? this._now() : new Date();
    if (d.updatedAt) {
      const daysSinceUpdate = daysBetween(d.updatedAt, now);
      if (daysSinceUpdate > this.staleDays) stale = true;
    }

    return {
      id: d.id,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      stale,
      probability: d.probability,
      amount: d.amount,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5.7 generateForecastCall — bilingual review script
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Generate a bilingual (HE+EN) forecast-call script that a sales manager
   * can read in a weekly review meeting. Structured so every section has
   * both languages side-by-side.
   *
   * @param {Object} forecast — output of buildForecast()
   * @returns {{ script_he, script_en, sections }}
   */
  generateForecastCall(forecast) {
    if (!forecast || typeof forecast !== 'object') {
      throw new TypeError('forecast must be a buildForecast() result');
    }
    const method = forecast.method || 'unknown';
    const methodLabel = FORECAST_METHOD_LABELS[method] || { he: method, en: method };
    const period = forecast.period || {};
    const total = toFinite(forecast.total, 0);
    const dealCount = toFinite(forecast.dealCount, 0);

    // Section 1 — opener
    const openerHe = `שיחת תחזית — ${methodLabel.he} — תקופה ${period.start || '?'} עד ${period.end || '?'}`;
    const openerEn = `Forecast Call — ${methodLabel.en} — period ${period.start || '?'} to ${period.end || '?'}`;

    // Section 2 — headline number
    const headlineHe = `סה"כ תחזית: ₪${formatMoney(total)} מתוך ${dealCount} עסקאות.`;
    const headlineEn = `Total forecast: ₪${formatMoney(total)} across ${dealCount} deals.`;

    // Section 3 — method-specific color
    let detailHe = '';
    let detailEn = '';
    if (method === 'monte-carlo' && forecast.percentiles) {
      detailHe = `התפלגות מונטה-קרלו: p10=${formatMoney(forecast.percentiles.p10)}, p50=${formatMoney(forecast.percentiles.p50)}, p90=${formatMoney(forecast.percentiles.p90)}. סטיית תקן: ${formatMoney(forecast.stdev)}.`;
      detailEn = `Monte Carlo distribution: p10=${formatMoney(forecast.percentiles.p10)}, p50=${formatMoney(forecast.percentiles.p50)}, p90=${formatMoney(forecast.percentiles.p90)}. Stdev: ${formatMoney(forecast.stdev)}.`;
    } else if (method === 'commit') {
      detailHe = `כל עסקה בתחזית זו מחויבת (הסתברות ≥ 90%).`;
      detailEn = `Every deal in this forecast is committed (probability ≥ 90%).`;
    } else if (method === 'best-case') {
      detailHe = `תרחיש אופטימי — הכל נסגר.`;
      detailEn = `Best case — everything closes.`;
    } else if (method === 'stage-weighted') {
      detailHe = `כל עסקה משוקללת לפי הסתברות השלב שלה.`;
      detailEn = `Each deal weighted by its stage probability.`;
    } else if (method === 'historical-win-rate') {
      detailHe = `כל עסקה משוקללת לפי אחוז הזכייה ההיסטורי של נציג המכירות.`;
      detailEn = `Each deal weighted by the rep's historical win rate.`;
    }

    // Section 4 — review questions (classic "forecast call" checklist)
    const questionsHe = [
      'מה התקדם השבוע בעסקאות המחויבות?',
      'האם יש עסקאות שהוזזו ברבעון? מדוע?',
      'מהן 3 העסקאות הגדולות ביותר בסיכון?',
      'אילו צעדים נדרשים כדי לסגור את הפער?',
      'האם ההסתברויות שלך עדכניות?',
    ];
    const questionsEn = [
      'What moved in the commit deals this week?',
      'Any deals that slipped out of quarter? Why?',
      'What are the top 3 at-risk deals?',
      'What actions are needed to close the gap?',
      'Are your probabilities up-to-date?',
    ];

    // Compose full scripts
    const script_he = [
      openerHe,
      '',
      headlineHe,
      detailHe,
      '',
      'שאלות סקירה:',
      ...questionsHe.map((q, i) => `${i + 1}. ${q}`),
    ].filter(Boolean).join('\n');

    const script_en = [
      openerEn,
      '',
      headlineEn,
      detailEn,
      '',
      'Review questions:',
      ...questionsEn.map((q, i) => `${i + 1}. ${q}`),
    ].filter(Boolean).join('\n');

    return {
      script_he,
      script_en,
      sections: {
        opener: { he: openerHe, en: openerEn },
        headline: { he: headlineHe, en: headlineEn },
        detail: { he: detailHe, en: detailEn },
        questions: { he: questionsHe, en: questionsEn },
      },
      method,
      method_label: methodLabel,
      total: round2(total),
      dealCount,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. HELPERS — sandbagging detection, money formatting, deep-freeze
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sandbagging detection: compare stage-weighted vs historical-win-rate.
 *
 * If the rep's stage-weighted forecast is much lower than what their
 * historical win rate would predict, they're probably pessimistic
 * (sandbagging — saving upside for later). If much higher, "happy ears"
 * — over-optimistic.
 */
function detectSandbagging(stageWeighted, winRate) {
  if (!isFiniteNumber(stageWeighted) || !isFiniteNumber(winRate)) {
    return { flagged: false, kind: 'unknown', ratio: 0 };
  }
  if (Math.abs(winRate) < 1e-9) {
    return { flagged: false, kind: 'insufficient-data', ratio: 0 };
  }
  const ratio = stageWeighted / winRate;
  let kind = 'ok';
  let flagged = false;
  if (ratio < SANDBAGGING_LOW_RATIO) {
    kind = 'sandbagging';
    flagged = true;
  } else if (ratio > SANDBAGGING_HIGH_RATIO) {
    kind = 'inflation';
    flagged = true;
  }
  return {
    flagged,
    kind,
    ratio: Math.round(ratio * 10000) / 10000,
    stageWeighted: round2(stageWeighted),
    winRateBased: round2(winRate),
    note_he: kind === 'sandbagging'
      ? 'הנציג עשוי לשמור עסקאות לרבעון הבא — יש לחקור'
      : kind === 'inflation'
      ? 'הנציג עשוי להיות אופטימי מדי — יש לבחון הסתברויות'
      : 'בטווח הנורמלי',
    note_en: kind === 'sandbagging'
      ? 'rep may be saving deals for next quarter — investigate'
      : kind === 'inflation'
      ? 'rep may be over-optimistic ("happy ears") — review probabilities'
      : 'within normal range',
  };
}

function formatMoney(x) {
  const n = toFinite(x, 0);
  // Thousands separator, 2 decimals.
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withSep}.${dec}`;
}

/**
 * Recursive deep-freeze. Used on snapshots so they can never be mutated
 * after the fact — snapshots are historical facts.
 */
function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  SalesForecast,
  DEFAULT_STAGE_PROBABILITIES,
  FORECAST_METHOD_LABELS,
  CATEGORY_LABELS,
  // Utilities useful in tests / downstream
  mulberry32,
  standardNormal,
  detectSandbagging,
  normalizeDeal,
  normalizePipeline,
  forecastCommit,
  forecastBestCase,
  forecastStageWeighted,
  forecastHistoricalWinRate,
  forecastMonteCarlo,
  // Internal helpers re-exported for tests
  percentile,
  inPeriod,
  toDate,
  toISODate,
};
