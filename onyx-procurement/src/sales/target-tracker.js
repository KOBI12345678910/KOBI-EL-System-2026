/**
 * Sales Target Tracker  |  מעקב יעדי מכירות
 * =============================================================
 *
 * Agent Y-21  |  Swarm 4 (growth)  |  Techno-Kol Uzi mega-ERP
 * Project rule: לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow).
 *
 * A zero-dependency, in-memory sales-quota / attainment / pacing
 * engine. No external libs — only ECMAScript built-ins. Pure and
 * deterministic (no Math.random, no Date.now except via the `now`
 * you pass in). Runs under Node 16+, Electron, or any bundler.
 *
 * -------------------------------------------------------------
 * DOMAIN
 * -------------------------------------------------------------
 *
 *   Quota {
 *     salespersonId, period:{type, year, q?, m?}, targetAmount,
 *     targetDeals, metric:'revenue'|'margin'|'units',
 *     hireDate?, prorated?, labels:{he, en}
 *   }
 *
 *   Sale {
 *     salespersonId, amount, margin, units, closedDate (YYYY-MM-DD)
 *   }
 *
 *   Period types: 'month' | 'quarter' | 'year'
 *     period keys:
 *       'year'    → `${year}`
 *       'quarter' → `${year}-Q${q}`   (q ∈ 1..4)
 *       'month'   → `${year}-${mm}`   (mm ∈ 01..12)
 *
 *   Working days: Sunday..Thursday (Israeli work week).
 *   Configurable via `setWorkingDays([0,1,2,3,4])`
 *   (0=Sunday, 5=Friday, 6=Saturday).
 *
 * -------------------------------------------------------------
 * PACING FORMULA
 * -------------------------------------------------------------
 *   expected(today) = targetAmount * (elapsedWorkingDays / totalWorkingDays)
 *   actual(today)   = Σ sale.amount where sale in-period and closedDate <= today
 *   pace_pct        = actual / expected                  (null if expected == 0)
 *   status          =
 *       'ahead'     if pace_pct >= 1.10
 *     | 'on_track'  if 0.95 <= pace_pct < 1.10
 *     | 'behind'    if 0.80 <= pace_pct < 0.95
 *     | 'critical'  if pace_pct  < 0.80
 *   projected_full  = actual / (elapsedWorkingDays / totalWorkingDays)
 *                     (straight-line projection to end of period)
 *
 *   Mid-period hire proration:
 *     prorationFactor = remainingWorkingDaysFromHire / totalWorkingDays
 *     effectiveTarget = baseTarget * prorationFactor
 *     (applied whenever `hireDate` falls inside the period; never grows
 *     the target, only shrinks it, so early-hire quotas match the untouched
 *     base target.)
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   new SalesTargetTracker({ now?, workingDays?, locale? })
 *   tracker.setQuota({salespersonId, period, targetAmount,
 *                     targetDeals, metric, hireDate?})
 *   tracker.getQuota(salespersonId, period)
 *   tracker.recordSale({salespersonId, amount, margin, units, closedDate})
 *   tracker.attainment(salespersonId, period)
 *       → { target, actual, pct, gap, deals, dealsTarget, metric, labels }
 *   tracker.pacingAnalysis(salespersonId, period)
 *       → { expected, actual, pacePct, status, elapsed,
 *           total, remaining, projectedFull, gapToExpected, labels }
 *   tracker.addDirectReport(managerId, salespersonId)
 *   tracker.teamRollup(managerId, period)
 *       → { managerId, members[], totals:{target,actual,pct,deals} }
 *   tracker.historicalTrend(salespersonId, periods)
 *       → [{ period, target, actual, pct }]
 *   tracker.generateLeaderboard(period)
 *       → [{ rank, salespersonId, target, actual, pct, deals }]
 *   tracker.alertBelowThreshold(threshold, period)
 *       → [{ salespersonId, pct, pacePct, gap, severity }]
 *
 *   Labels helper:
 *     SalesTargetTracker.LABELS   (bilingual {he, en})
 *     SalesTargetTracker.STATUS_LABELS
 *     SalesTargetTracker.METRIC_LABELS
 *     SalesTargetTracker.PERIOD_LABELS
 *
 * No delete method exists — by design (project rule).
 * Every mutation is additive. Quotas can be re-set (upgrade), sales are
 * append-only.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. LABELS, CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LABELS = {
  quota:          { he: 'יעד מכירות',         en: 'Sales Quota' },
  target:         { he: 'יעד',                  en: 'Target' },
  actual:         { he: 'בפועל',                en: 'Actual' },
  attainment:     { he: 'אחוז השגה',           en: 'Attainment %' },
  gap:            { he: 'פער',                  en: 'Gap' },
  pacing:         { he: 'קצב התקדמות',         en: 'Pacing' },
  expected:       { he: 'צפוי',                 en: 'Expected' },
  projected:      { he: 'תחזית סוף תקופה',     en: 'Projected Full-Period' },
  deals:          { he: 'עסקאות',               en: 'Deals' },
  leaderboard:    { he: 'טבלת מובילים',        en: 'Leaderboard' },
  salesperson:    { he: 'איש מכירות',          en: 'Salesperson' },
  manager:        { he: 'מנהל',                 en: 'Manager' },
  team:           { he: 'צוות',                 en: 'Team' },
  trend:          { he: 'מגמה היסטורית',       en: 'Historical Trend' },
  alert:          { he: 'התרעה',                en: 'Alert' },
  threshold:      { he: 'סף התרעה',            en: 'Threshold' },
  period:         { he: 'תקופה',                en: 'Period' },
  rank:           { he: 'דירוג',                en: 'Rank' },
  proration:      { he: 'חלוקה יחסית',         en: 'Proration' },
  hireDate:       { he: 'תאריך תחילת עבודה',   en: 'Hire Date' },
  workingDays:    { he: 'ימי עבודה',           en: 'Working Days' },
  elapsed:        { he: 'ימים שחלפו',          en: 'Elapsed Days' },
  remaining:      { he: 'ימים נותרו',          en: 'Remaining Days' },
  total:          { he: 'סה״כ',                en: 'Total' },
};

const METRIC_LABELS = {
  revenue: { he: 'הכנסות',  en: 'Revenue' },
  margin:  { he: 'רווח',    en: 'Margin' },
  units:   { he: 'יחידות',  en: 'Units' },
};

const STATUS_LABELS = {
  ahead:    { he: 'לפני הקצב',  en: 'Ahead of Pace',  threshold: 1.10 },
  on_track: { he: 'בקצב',        en: 'On Track',       threshold: 0.95 },
  behind:   { he: 'בפיגור',      en: 'Behind',         threshold: 0.80 },
  critical: { he: 'קריטי',       en: 'Critical',       threshold: 0.00 },
};

const PERIOD_LABELS = {
  month:   { he: 'חודש',   en: 'Month' },
  quarter: { he: 'רבעון',  en: 'Quarter' },
  year:    { he: 'שנה',    en: 'Year' },
};

const VALID_METRICS = new Set(['revenue', 'margin', 'units']);
const VALID_PERIOD_TYPES = new Set(['month', 'quarter', 'year']);

// Israeli work week: Sunday..Thursday (0..4 where 0=Sunday)
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

// ═══════════════════════════════════════════════════════════════════════════
// 1. DATE / PERIOD UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a YYYY-MM-DD string into a UTC Date.
 * Returns null if invalid. Accepts Date instances unchanged.
 */
function parseDate(input) {
  if (input == null) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return new Date(Date.UTC(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate()
    ));
  }
  if (typeof input !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function formatDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

function addDays(dt, n) {
  return new Date(Date.UTC(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate() + n
  ));
}

/**
 * Validate + normalize a period descriptor.
 *
 *   {type:'year',    year:2026}                     → {type, year, key:'2026'}
 *   {type:'quarter', year:2026, q:2}                → {type, year, q, key:'2026-Q2'}
 *   {type:'month',   year:2026, m:4}                → {type, year, m, key:'2026-04'}
 *
 * Throws on invalid input.
 */
function normalizePeriod(period) {
  if (!period || typeof period !== 'object') {
    throw new Error('period must be an object {type, year, q?, m?}');
  }
  const { type, year } = period;
  if (!VALID_PERIOD_TYPES.has(type)) {
    throw new Error(`period.type must be one of: ${Array.from(VALID_PERIOD_TYPES).join(', ')}`);
  }
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error('period.year must be an integer in [1970..2100]');
  }
  if (type === 'year') {
    return { type, year, key: String(year) };
  }
  if (type === 'quarter') {
    const q = period.q;
    if (!Number.isInteger(q) || q < 1 || q > 4) {
      throw new Error('period.q must be 1..4 for quarter');
    }
    return { type, year, q, key: `${year}-Q${q}` };
  }
  // month
  const m = period.m;
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('period.m must be 1..12 for month');
  }
  return { type, year, m, key: `${year}-${String(m).padStart(2, '0')}` };
}

/**
 * Start / end dates (UTC, inclusive) of a normalized period.
 * Month:   first..last day of the month
 * Quarter: first day of Q*3-2 month .. last day of Q*3 month
 * Year:    Jan 1 .. Dec 31
 */
function periodBounds(period) {
  const p = normalizePeriod(period);
  if (p.type === 'year') {
    return {
      start: new Date(Date.UTC(p.year, 0, 1)),
      end:   new Date(Date.UTC(p.year, 11, 31)),
    };
  }
  if (p.type === 'quarter') {
    const firstMonth = (p.q - 1) * 3;
    const lastMonth  = firstMonth + 2;
    return {
      start: new Date(Date.UTC(p.year, firstMonth, 1)),
      end:   new Date(Date.UTC(p.year, lastMonth + 1, 0)),
    };
  }
  // month
  return {
    start: new Date(Date.UTC(p.year, p.m - 1, 1)),
    end:   new Date(Date.UTC(p.year, p.m, 0)),
  };
}

/**
 * Count working days between `start` and `end` inclusive, honoring the
 * configured working-day mask (default Sun..Thu).
 *
 * If `from` > `to`, returns 0.
 */
function countWorkingDays(start, end, workingDays) {
  if (start.getTime() > end.getTime()) return 0;
  const mask = workingDays || DEFAULT_WORKING_DAYS;
  const set = new Set(mask);
  let count = 0;
  let cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    if (set.has(cursor.getUTCDay())) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * Is the given YYYY-MM-DD date within the (inclusive) period bounds?
 */
function isInPeriod(closedDate, period) {
  const dt = parseDate(closedDate);
  if (!dt) return false;
  const { start, end } = periodBounds(period);
  return dt.getTime() >= start.getTime() && dt.getTime() <= end.getTime();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. PRORATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute proration factor for a quota when the salesperson was hired
 * inside the target period.
 *
 *   factor = workingDays(hireDate..end) / workingDays(start..end)
 *
 *   - If hireDate is null or <= start → factor = 1 (full target)
 *   - If hireDate  >  end             → factor = 0 (no target)
 *   - Otherwise fractional
 *
 * Factor is clamped to [0, 1].
 */
function computeProrationFactor(period, hireDateStr, workingDays) {
  const { start, end } = periodBounds(period);
  const totalWD = countWorkingDays(start, end, workingDays);
  if (totalWD === 0) return 0;
  if (!hireDateStr) return 1;
  const hire = parseDate(hireDateStr);
  if (!hire) return 1;
  if (hire.getTime() <= start.getTime()) return 1;
  if (hire.getTime() >  end.getTime())   return 0;
  const effStart = hire;
  const wdFromHire = countWorkingDays(effStart, end, workingDays);
  const raw = wdFromHire / totalWD;
  return Math.max(0, Math.min(1, raw));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

class SalesTargetTracker {
  /**
   * @param {object} [opts]
   * @param {string|Date} [opts.now]          — "today" override (YYYY-MM-DD or Date)
   * @param {number[]}    [opts.workingDays]  — day-of-week mask [0..6]
   * @param {string}      [opts.locale]       — 'he' | 'en' (default 'he')
   */
  constructor(opts = {}) {
    this._now = opts.now ? parseDate(opts.now) : null;
    this._workingDays = Array.isArray(opts.workingDays) && opts.workingDays.length
      ? opts.workingDays.slice()
      : DEFAULT_WORKING_DAYS.slice();
    this._locale = opts.locale === 'en' ? 'en' : 'he';

    // quotas: Map<salespersonId, Map<periodKey, Quota>>
    this._quotas = new Map();
    // sales (append-only log): Sale[]
    this._sales = [];
    // manager → [salespersonId]
    this._team = new Map();
  }

  // ────────────────────────────────────────────────────────────────────
  // configuration helpers
  // ────────────────────────────────────────────────────────────────────

  setNow(dateLike) {
    this._now = parseDate(dateLike);
    return this;
  }

  setWorkingDays(mask) {
    if (!Array.isArray(mask) || !mask.length) {
      throw new Error('workingDays mask must be a non-empty array of 0..6');
    }
    for (const d of mask) {
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        throw new Error(`workingDays: invalid day ${d}`);
      }
    }
    this._workingDays = mask.slice();
    return this;
  }

  _today() {
    return this._now || new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    ));
  }

  // ────────────────────────────────────────────────────────────────────
  // quota CRUD (additive only — re-setting is treated as an upgrade)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Set (or upgrade) a quota for a salesperson in a period.
   *
   * @param {object} p
   * @param {string} p.salespersonId
   * @param {object} p.period            — {type:'month'|'quarter'|'year', year, q?, m?}
   * @param {number} p.targetAmount      — quota value in the chosen metric
   * @param {number} [p.targetDeals]     — optional deal-count quota
   * @param {string} [p.metric]          — 'revenue'|'margin'|'units' (default 'revenue')
   * @param {string} [p.hireDate]        — YYYY-MM-DD, triggers proration if inside period
   * @returns {Quota}
   */
  setQuota(p) {
    if (!p || typeof p !== 'object') throw new Error('setQuota: missing payload');
    const { salespersonId, period, targetAmount } = p;
    const metric = p.metric || 'revenue';
    const targetDeals = p.targetDeals == null ? 0 : Number(p.targetDeals);
    const hireDate = p.hireDate || null;

    if (!salespersonId || typeof salespersonId !== 'string') {
      throw new Error('setQuota: salespersonId required');
    }
    if (!VALID_METRICS.has(metric)) {
      throw new Error(`setQuota: metric must be one of ${Array.from(VALID_METRICS).join(', ')}`);
    }
    if (!Number.isFinite(targetAmount) || targetAmount < 0) {
      throw new Error('setQuota: targetAmount must be a non-negative number');
    }
    if (!Number.isFinite(targetDeals) || targetDeals < 0) {
      throw new Error('setQuota: targetDeals must be non-negative');
    }

    const np = normalizePeriod(period);
    const proration = computeProrationFactor(np, hireDate, this._workingDays);
    const prorated = proration < 1 && proration >= 0;

    const quota = {
      salespersonId,
      period: np,
      baseTargetAmount: targetAmount,
      targetAmount: round2(targetAmount * proration),
      baseTargetDeals: targetDeals,
      targetDeals: Math.round(targetDeals * proration),
      metric,
      hireDate,
      prorationFactor: round4(proration),
      prorated,
      labels: {
        he: `${LABELS.quota.he} — ${METRIC_LABELS[metric].he}`,
        en: `${LABELS.quota.en} — ${METRIC_LABELS[metric].en}`,
      },
      createdAt: formatDate(this._today()),
    };

    if (!this._quotas.has(salespersonId)) {
      this._quotas.set(salespersonId, new Map());
    }
    this._quotas.get(salespersonId).set(np.key, quota);
    return quota;
  }

  /**
   * Retrieve a stored quota. Returns null if none.
   */
  getQuota(salespersonId, period) {
    const np = normalizePeriod(period);
    const perSp = this._quotas.get(salespersonId);
    if (!perSp) return null;
    return perSp.get(np.key) || null;
  }

  /**
   * List every quota stored for a salesperson, newest period first.
   */
  listQuotas(salespersonId) {
    const perSp = this._quotas.get(salespersonId);
    if (!perSp) return [];
    return Array.from(perSp.values()).sort((a, b) => (
      a.period.key < b.period.key ? 1 : a.period.key > b.period.key ? -1 : 0
    ));
  }

  // ────────────────────────────────────────────────────────────────────
  // sales (append-only log)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Record a closed sale. Append-only — never mutates existing entries.
   *
   * @param {object} s
   * @param {string} s.salespersonId
   * @param {number} [s.amount]      — revenue (default 0)
   * @param {number} [s.margin]      — gross margin value (default 0)
   * @param {number} [s.units]       — unit count (default 0)
   * @param {string} s.closedDate    — YYYY-MM-DD
   * @returns {Sale} the stored sale (with a deterministic id)
   */
  recordSale(s) {
    if (!s || typeof s !== 'object') throw new Error('recordSale: missing payload');
    if (!s.salespersonId || typeof s.salespersonId !== 'string') {
      throw new Error('recordSale: salespersonId required');
    }
    const dt = parseDate(s.closedDate);
    if (!dt) throw new Error('recordSale: closedDate must be YYYY-MM-DD');

    const sale = {
      id: `SALE_${(this._sales.length + 1).toString().padStart(6, '0')}`,
      salespersonId: s.salespersonId,
      amount: Number.isFinite(s.amount) ? Number(s.amount) : 0,
      margin: Number.isFinite(s.margin) ? Number(s.margin) : 0,
      units:  Number.isFinite(s.units)  ? Number(s.units)  : 0,
      closedDate: formatDate(dt),
    };
    this._sales.push(sale);
    return sale;
  }

  /**
   * Internal: sum the appropriate metric for a salesperson across
   * sales that fall inside `period` and have closedDate <= `asOf` (inclusive).
   * If `asOf` is null the whole period is considered.
   */
  _aggregate(salespersonId, period, metric, asOf) {
    const { start, end } = periodBounds(period);
    const cap = asOf || end;
    let sum = 0;
    let deals = 0;
    for (const sale of this._sales) {
      if (sale.salespersonId !== salespersonId) continue;
      const dt = parseDate(sale.closedDate);
      if (!dt) continue;
      if (dt.getTime() < start.getTime()) continue;
      if (dt.getTime() > end.getTime())   continue;
      if (dt.getTime() > cap.getTime())   continue;
      if      (metric === 'revenue') sum += sale.amount;
      else if (metric === 'margin')  sum += sale.margin;
      else                           sum += sale.units;
      deals++;
    }
    return { sum, deals };
  }

  // ────────────────────────────────────────────────────────────────────
  // attainment
  // ────────────────────────────────────────────────────────────────────

  /**
   * Current attainment against a stored quota.
   * Returns {target, actual, pct, gap, deals, dealsTarget, metric, labels}.
   * Throws if no quota exists for the pair.
   */
  attainment(salespersonId, period) {
    const quota = this.getQuota(salespersonId, period);
    if (!quota) {
      throw new Error(`attainment: no quota for ${salespersonId} @ ${normalizePeriod(period).key}`);
    }
    const { sum, deals } = this._aggregate(salespersonId, quota.period, quota.metric, null);
    const target = quota.targetAmount;
    const pct = target > 0 ? sum / target : null;
    const gap = target - sum;

    return {
      salespersonId,
      period: quota.period,
      metric: quota.metric,
      target: round2(target),
      actual: round2(sum),
      pct:    pct == null ? null : round4(pct),
      gap:    round2(gap),
      deals,
      dealsTarget: quota.targetDeals,
      dealsGap:    quota.targetDeals - deals,
      prorated:    quota.prorated,
      prorationFactor: quota.prorationFactor,
      labels: {
        he: `${LABELS.attainment.he} — ${METRIC_LABELS[quota.metric].he}`,
        en: `${LABELS.attainment.en} — ${METRIC_LABELS[quota.metric].en}`,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // pacing analysis
  // ────────────────────────────────────────────────────────────────────

  /**
   * Pacing analysis vs expected run-rate (working days elapsed).
   */
  pacingAnalysis(salespersonId, period) {
    const quota = this.getQuota(salespersonId, period);
    if (!quota) {
      throw new Error(`pacingAnalysis: no quota for ${salespersonId} @ ${normalizePeriod(period).key}`);
    }

    const today = this._today();
    const { start, end } = periodBounds(quota.period);

    // clamp today into [start, end] so elapsed is bounded
    let asOf = today;
    if (today.getTime() < start.getTime()) asOf = start;
    if (today.getTime() > end.getTime())   asOf = end;

    const totalWD    = countWorkingDays(start, end, this._workingDays);
    const elapsedWD  = today.getTime() <  start.getTime()
      ? 0
      : countWorkingDays(start, asOf, this._workingDays);
    const remainingWD = Math.max(0, totalWD - elapsedWD);

    const fraction = totalWD > 0 ? elapsedWD / totalWD : 0;
    const expected = round2(quota.targetAmount * fraction);

    const { sum: actual, deals } = this._aggregate(
      salespersonId, quota.period, quota.metric, asOf
    );

    const pacePct = expected > 0 ? actual / expected : null;
    const projectedFull = fraction > 0 ? actual / fraction : 0;
    const gapToExpected = expected - actual;

    const status = classifyPace(pacePct);

    return {
      salespersonId,
      period: quota.period,
      metric: quota.metric,
      target:    round2(quota.targetAmount),
      expected,
      actual:    round2(actual),
      pacePct:   pacePct == null ? null : round4(pacePct),
      status,
      statusLabel: {
        he: STATUS_LABELS[status].he,
        en: STATUS_LABELS[status].en,
      },
      elapsed:   elapsedWD,
      total:     totalWD,
      remaining: remainingWD,
      fraction:  round4(fraction),
      projectedFull: round2(projectedFull),
      gapToExpected: round2(gapToExpected),
      deals,
      asOf: formatDate(asOf),
      prorated: quota.prorated,
      prorationFactor: quota.prorationFactor,
      labels: {
        he: LABELS.pacing.he,
        en: LABELS.pacing.en,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // team management + rollup
  // ────────────────────────────────────────────────────────────────────

  /**
   * Register a direct report under a manager. Idempotent.
   */
  addDirectReport(managerId, salespersonId) {
    if (!managerId || !salespersonId) {
      throw new Error('addDirectReport: managerId and salespersonId required');
    }
    if (!this._team.has(managerId)) this._team.set(managerId, []);
    const list = this._team.get(managerId);
    if (!list.includes(salespersonId)) list.push(salespersonId);
    return this;
  }

  /**
   * Return the direct report list for a manager (copy).
   */
  getDirectReports(managerId) {
    return (this._team.get(managerId) || []).slice();
  }

  /**
   * Aggregate attainment across every direct report. Members without a
   * quota for the period are skipped (with a note in `skipped`).
   */
  teamRollup(managerId, period) {
    const members = this.getDirectReports(managerId);
    const np = normalizePeriod(period);
    const rows = [];
    const skipped = [];
    let totalTarget = 0;
    let totalActual = 0;
    let totalDeals  = 0;
    let totalDealsTarget = 0;

    for (const spId of members) {
      const quota = this.getQuota(spId, np);
      if (!quota) {
        skipped.push(spId);
        continue;
      }
      const att  = this.attainment(spId, np);
      const pace = this.pacingAnalysis(spId, np);
      rows.push({
        salespersonId: spId,
        target: att.target,
        actual: att.actual,
        pct:    att.pct,
        gap:    att.gap,
        deals:  att.deals,
        dealsTarget: att.dealsTarget,
        pacePct: pace.pacePct,
        status:  pace.status,
      });
      totalTarget      += att.target;
      totalActual      += att.actual;
      totalDeals       += att.deals;
      totalDealsTarget += att.dealsTarget;
    }

    const pct = totalTarget > 0 ? totalActual / totalTarget : null;
    const gap = totalTarget - totalActual;

    return {
      managerId,
      period: np,
      members: rows,
      skipped,
      totals: {
        target:      round2(totalTarget),
        actual:      round2(totalActual),
        pct:         pct == null ? null : round4(pct),
        gap:         round2(gap),
        deals:       totalDeals,
        dealsTarget: totalDealsTarget,
      },
      labels: {
        he: `${LABELS.team.he} — ${LABELS.attainment.he}`,
        en: `${LABELS.team.en} — ${LABELS.attainment.en}`,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // historical trend
  // ────────────────────────────────────────────────────────────────────

  /**
   * Attainment over the supplied period list (order preserved).
   * Missing quotas return {target:0, actual:0, pct:null}.
   */
  historicalTrend(salespersonId, periods) {
    if (!Array.isArray(periods)) {
      throw new Error('historicalTrend: periods must be an array');
    }
    const out = [];
    for (const p of periods) {
      const np = normalizePeriod(p);
      const quota = this.getQuota(salespersonId, np);
      if (!quota) {
        out.push({
          period: np,
          target: 0,
          actual: 0,
          pct:    null,
          gap:    0,
          deals:  0,
          hadQuota: false,
        });
        continue;
      }
      const att = this.attainment(salespersonId, np);
      out.push({
        period: np,
        target: att.target,
        actual: att.actual,
        pct:    att.pct,
        gap:    att.gap,
        deals:  att.deals,
        hadQuota: true,
      });
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────
  // leaderboard
  // ────────────────────────────────────────────────────────────────────

  /**
   * Ranked leaderboard of every salesperson that has a quota for `period`.
   *
   * Primary sort: actual DESC.
   * Ties broken by pct DESC (attainment %).
   * Further ties broken by salespersonId ASC (stable deterministic order).
   */
  generateLeaderboard(period) {
    const np = normalizePeriod(period);
    const rows = [];
    for (const [spId] of this._quotas.entries()) {
      const quota = this.getQuota(spId, np);
      if (!quota) continue;
      const att = this.attainment(spId, np);
      rows.push({
        salespersonId: spId,
        target: att.target,
        actual: att.actual,
        pct:    att.pct,
        gap:    att.gap,
        deals:  att.deals,
        metric: att.metric,
      });
    }
    rows.sort((a, b) => {
      if (b.actual !== a.actual) return b.actual - a.actual;
      // tie-break by pct DESC (nulls last)
      const ap = a.pct == null ? -Infinity : a.pct;
      const bp = b.pct == null ? -Infinity : b.pct;
      if (bp !== ap) return bp - ap;
      // final deterministic fallback
      return a.salespersonId < b.salespersonId ? -1
           : a.salespersonId > b.salespersonId ? 1 : 0;
    });

    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }

  // ────────────────────────────────────────────────────────────────────
  // alerting
  // ────────────────────────────────────────────────────────────────────

  /**
   * Return every salesperson whose *pacing %* is strictly below `threshold`
   * (a 0..1 fraction — e.g. 0.80 means "below 80% of expected pace").
   */
  alertBelowThreshold(threshold, period) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('alertBelowThreshold: threshold must be a non-negative number');
    }
    const np = normalizePeriod(period);
    const alerts = [];
    for (const [spId] of this._quotas.entries()) {
      const quota = this.getQuota(spId, np);
      if (!quota) continue;
      const pace = this.pacingAnalysis(spId, np);
      if (pace.pacePct == null) continue;
      if (pace.pacePct < threshold) {
        alerts.push({
          salespersonId: spId,
          pacePct: pace.pacePct,
          pct:     pace.pacePct,
          expected: pace.expected,
          actual:   pace.actual,
          gap:      pace.gapToExpected,
          status:   pace.status,
          severity: severityFromPace(pace.pacePct, threshold),
          period:   np,
          labels: {
            he: `${LABELS.alert.he} — ${pace.statusLabel.he}`,
            en: `${LABELS.alert.en} — ${pace.statusLabel.en}`,
          },
        });
      }
    }
    // worst first
    alerts.sort((a, b) => a.pacePct - b.pacePct);
    return alerts;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function classifyPace(pct) {
  if (pct == null) return 'on_track';  // no expected yet (period not started)
  if (pct >= STATUS_LABELS.ahead.threshold)    return 'ahead';
  if (pct >= STATUS_LABELS.on_track.threshold) return 'on_track';
  if (pct >= STATUS_LABELS.behind.threshold)   return 'behind';
  return 'critical';
}

function severityFromPace(pct, threshold) {
  if (pct >= threshold) return 'info';
  const ratio = threshold > 0 ? pct / threshold : 0;
  if (ratio >= 0.90) return 'low';
  if (ratio >= 0.75) return 'medium';
  if (ratio >= 0.50) return 'high';
  return 'critical';
}

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

SalesTargetTracker.LABELS = LABELS;
SalesTargetTracker.METRIC_LABELS = METRIC_LABELS;
SalesTargetTracker.STATUS_LABELS = STATUS_LABELS;
SalesTargetTracker.PERIOD_LABELS = PERIOD_LABELS;
SalesTargetTracker.DEFAULT_WORKING_DAYS = DEFAULT_WORKING_DAYS;

// Utility functions exposed for testing / reuse
SalesTargetTracker.util = {
  normalizePeriod,
  periodBounds,
  countWorkingDays,
  computeProrationFactor,
  parseDate,
  formatDate,
  daysBetween,
  classifyPace,
  severityFromPace,
};

module.exports = {
  SalesTargetTracker,
  LABELS,
  METRIC_LABELS,
  STATUS_LABELS,
  PERIOD_LABELS,
  DEFAULT_WORKING_DAYS,
  normalizePeriod,
  periodBounds,
  countWorkingDays,
  computeProrationFactor,
};
module.exports.default = SalesTargetTracker;
