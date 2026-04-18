/**
 * cashflow-forecast.js
 * Techno-Kol Uzi Mega-ERP — Cash Flow Forecast (Direct + Indirect Methods)
 * תזרים מזומנים — שיטת ישירה + עקיפה
 *
 * Agent: AG-Y079 — Cash Flow Forecast
 * Wave:  Y — Finance / Treasury
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade/grow)
 * Zero external dependencies. Bilingual (Hebrew / English). Node + browser.
 *
 * Complementary to X-04 (Monte Carlo cash simulation):
 *   - X-04: stochastic / probabilistic liquidity simulation
 *   - Y079: deterministic operational forecast with direct + indirect views,
 *           13-week rolling bucket, Israeli payroll + tax calendar baked in.
 *
 * Features:
 *   - buildDirectMethod({period, receipts, disbursements, openingCash})
 *   - buildIndirectMethod({netIncome, dep, wcChanges, investing, financing})
 *   - weeklyRolling(period)               — 13-week rolling cash forecast
 *   - sources({ar, pipeline, recurring, events})
 *   - uses({ap, payroll, tax, loans, rent, other})
 *   - stressTest({shocks:[{item, pct}]})
 *   - minimumCashAlert(threshold)
 *   - coverageRatio({forecast, obligations})
 *   - actualsVsForecast(period)           — forecast accuracy tracking
 *   - generatePDF(forecast)               — bilingual PDF with embedded SVG chart
 *
 * Israeli calendar references:
 *   - חוק הגנת השכר, התשי"ח-1958 — שכר חודשי עד ה-9 לחודש שאחרי (practice: ~7th)
 *   - ביטוח לאומי / מס הכנסה מעסיקים — טופס 102 עד ה-15 לחודש שאחרי
 *   - חוק מע"מ, התשל"ו-1975 — דו"ח מע"מ ותשלום עד ה-15 לחודש שאחרי (monthly/bimonthly)
 *   - הפקדות פנסיה — עד ה-15 לחודש שאחרי (תקנות קופות גמל)
 */

'use strict';

// ───────────────────────── Constants ─────────────────────────

const FORECAST_METHODS = Object.freeze({
  DIRECT: 'direct',
  INDIRECT: 'indirect',
});

const FORECAST_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ROLLED: 'rolled',
  SUPERSEDED: 'superseded',
});

const PERIOD_GRANULARITY = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
});

/** Typical rolling horizon used by treasury for short-term cash forecast */
const DEFAULT_ROLLING_WEEKS = 13;

/**
 * Israeli payment calendar — days-of-month at which obligations are typically
 * due. These are the legal maxima or common-practice deadlines; callers can
 * override any of these via constructor options.
 *
 * Sources:
 *   - Wage Protection Law (חוק הגנת השכר) §9   — wages by the 9th of the
 *     following month; common practice pays around the 5-7th of the month.
 *     For a few sectors (construction, retail) wages are split into two
 *     payments (~7th and ~22nd): salary advance + end-of-month settlement.
 *   - Form 102 (טופס 102) — employer income-tax withholding + Bituach Leumi
 *     + health tax, due by the 15th of the following month.
 *   - VAT (מע"מ) — monthly or bi-monthly report + payment by the 15th of the
 *     following period-month.
 *   - Pension (פנסיה / קופות גמל) — contributions due by the 15th of the
 *     following month (Israeli Tax Regulations for Pension Funds, 1964).
 */
const ISRAELI_PAYMENT_DAYS = Object.freeze({
  PAYROLL_MAIN: 7,       // main payroll — חוק הגנת השכר — ~ 7th (within legal 9th)
  PAYROLL_ADVANCE: 22,   // bi-monthly advance — common in construction / retail
  VAT: 15,               // דו"ח מע"מ — 15th following
  INCOME_TAX: 15,        // מס הכנסה ניכויים (טופס 102) — 15th following
  BITUACH_LEUMI: 15,     // ביטוח לאומי — 15th following
  PENSION: 15,           // הפקדות פנסיה — 15th following
});

/** Default minimum-cash threshold ratio (10% of monthly operating spend) */
const DEFAULT_MIN_CASH_RATIO = 0.10;

// ─────────────────────── Utility helpers ───────────────────────

function _round2(n) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function _num(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}

function _pct(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function _parseDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  throw new TypeError('Invalid date value / תאריך לא תקין');
}

function _addDays(date, days) {
  const d = _parseDate(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)
  );
}

function _startOfWeek(date) {
  // ISO weeks in Israel typically start Sunday; we'll go with UTC Sunday.
  const d = _parseDate(date);
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  return _addDays(d, -dayOfWeek);
}

function _weeksBetween(a, b) {
  const ms = _parseDate(b).getTime() - _parseDate(a).getTime();
  return Math.max(0, Math.round(ms / (7 * 24 * 3600 * 1000)));
}

function _isoDate(d) {
  return _parseDate(d).toISOString().slice(0, 10);
}

function _yyyymm(d) {
  const x = _parseDate(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

function _clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_clone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = _clone(obj[k]);
  return out;
}

function _sum(arr, sel) {
  let s = 0;
  for (const x of arr) s += _num(sel ? sel(x) : x, 0);
  return s;
}

function _err(en, he) {
  return new Error(`${en} / ${he}`);
}

// ─────────────────────── Main class ───────────────────────

class CashFlowForecast {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.openingCash]          opening cash balance for built forecasts
   * @param {number} [opts.minCash]              minimum cash threshold (ILS)
   * @param {number} [opts.minCashRatio]         ratio of monthly uses (default 0.10)
   * @param {Object} [opts.paymentDays]          override Israeli payment days
   * @param {number} [opts.rollingWeeks]         default rolling horizon (13)
   * @param {string} [opts.currency]             default ILS
   * @param {function} [opts.now]                clock injector (testing)
   */
  constructor(opts = {}) {
    this.opts = {
      openingCash: _num(opts.openingCash, 0),
      minCash: _num(opts.minCash, 0),
      minCashRatio: _num(opts.minCashRatio, DEFAULT_MIN_CASH_RATIO),
      paymentDays: Object.assign({}, ISRAELI_PAYMENT_DAYS, opts.paymentDays || {}),
      rollingWeeks: _num(opts.rollingWeeks, DEFAULT_ROLLING_WEEKS),
      currency: opts.currency || 'ILS',
      now: typeof opts.now === 'function' ? opts.now : () => new Date(),
    };
    this.forecasts = new Map();       // forecastId -> forecast snapshot (append-only)
    this.actuals = new Map();         // period -> actuals totals
    this.history = [];                // append-only audit log
    this._seq = 0;
  }

  // ───────────── Audit / logging ─────────────

  _log(event, payload) {
    const entry = {
      id: this.history.length + 1,
      at: new Date(this.opts.now()).toISOString(),
      event,
      payload: _clone(payload || {}),
    };
    this.history.push(entry);
    return entry;
  }

  _genId(prefix) {
    this._seq += 1;
    return `${prefix}_${Date.now().toString(36)}_${String(this._seq).padStart(4, '0')}`;
  }

  /** Returns a defensive copy of the append-only history. */
  getHistory() {
    return this.history.slice();
  }

  // ═════════════════════════════════════════════════════════════
  // 1. DIRECT METHOD — receipts and disbursements
  // ═════════════════════════════════════════════════════════════

  /**
   * Build a direct-method cash flow forecast over arbitrary buckets.
   *
   * @param {Object} spec
   * @param {string} spec.period              period label, e.g. "2026-Q2"
   * @param {Array<{label,amount,date?}>} spec.receipts     cash in items
   * @param {Array<{label,amount,date?}>} spec.disbursements cash out items
   * @param {number} [spec.openingCash]       opening balance (defaults to opts.openingCash)
   * @param {string} [spec.currency]
   * @returns {Object} forecast snapshot
   */
  buildDirectMethod(spec = {}) {
    if (!spec || typeof spec !== 'object')
      throw _err('spec is required', 'יש להעביר אובייקט תיאור');
    const {
      period,
      receipts = [],
      disbursements = [],
      openingCash = this.opts.openingCash,
      currency = this.opts.currency,
    } = spec;

    if (!period || typeof period !== 'string')
      throw _err('period is required', 'תקופה נדרשת');
    if (!Array.isArray(receipts))
      throw _err('receipts must be an array', 'תקבולים חייבים להיות מערך');
    if (!Array.isArray(disbursements))
      throw _err('disbursements must be an array', 'תשלומים חייבים להיות מערך');

    // Normalize and validate line items
    const normRec = receipts.map((r, i) => this._normLine(r, 'receipt', i));
    const normDis = disbursements.map((d, i) => this._normLine(d, 'disbursement', i));

    const totalReceipts = _round2(_sum(normRec, (x) => x.amount));
    const totalDisbursements = _round2(_sum(normDis, (x) => x.amount));
    const netCashFlow = _round2(totalReceipts - totalDisbursements);
    const closingCash = _round2(_num(openingCash, 0) + netCashFlow);

    const forecastId = this._genId('DCF');
    const snapshot = {
      forecastId,
      method: FORECAST_METHODS.DIRECT,
      period,
      currency,
      openingCash: _round2(openingCash),
      receipts: normRec,
      disbursements: normDis,
      totalReceipts,
      totalDisbursements,
      netCashFlow,
      closingCash,
      status: FORECAST_STATUS.PUBLISHED,
      createdAt: new Date(this.opts.now()).toISOString(),
    };
    this.forecasts.set(forecastId, snapshot);
    this._log('buildDirectMethod', { forecastId, period, totalReceipts, totalDisbursements });
    return _clone(snapshot);
  }

  _normLine(line, kind, idx) {
    if (!line || typeof line !== 'object')
      throw _err(`${kind}[${idx}] must be an object`, `${kind}[${idx}] חייב להיות אובייקט`);
    const label = String(line.label || line.name || `${kind}-${idx + 1}`);
    const amount = _num(line.amount, NaN);
    if (!Number.isFinite(amount))
      throw _err(`${kind}[${idx}] amount is not numeric`, `סכום לא תקין ב־${kind}[${idx}]`);
    if (amount < 0)
      throw _err(
        `${kind}[${idx}] amount must be non-negative`,
        `הסכום ב־${kind}[${idx}] חייב להיות חיובי`
      );
    return {
      label,
      amount: _round2(amount),
      date: line.date ? _isoDate(line.date) : null,
      category: line.category || null,
      probability: line.probability !== undefined ? _pct(line.probability) : 1,
    };
  }

  // ═════════════════════════════════════════════════════════════
  // 2. INDIRECT METHOD — from net income
  // ═════════════════════════════════════════════════════════════

  /**
   * Build an indirect-method cash flow forecast starting from net income.
   *
   *  CFO = netIncome + depreciation/amortization
   *      +/- changes in working capital (AR, inventory, AP, other)
   *  CFI = investing inflows - investing outflows
   *  CFF = financing inflows - financing outflows
   *  net change = CFO + CFI + CFF
   *
   * @param {Object} spec
   * @param {number} spec.netIncome
   * @param {number} [spec.dep]                 depreciation + amortization
   * @param {Object} [spec.wcChanges]           {ar, inventory, ap, other}
   *                                            positive = use of cash, negative = source
   *                                            (i.e. increase in AR is a *use*)
   * @param {Object} [spec.investing]           {capex, assetSales, acquisitions}
   * @param {Object} [spec.financing]           {debtIssued, debtRepaid, dividends, equityIssued, equityRepurchased}
   * @param {string} spec.period
   * @param {number} [spec.openingCash]
   * @returns {Object} forecast snapshot
   */
  buildIndirectMethod(spec = {}) {
    if (!spec || typeof spec !== 'object')
      throw _err('spec is required', 'יש להעביר אובייקט תיאור');
    const {
      period,
      netIncome,
      dep = 0,
      wcChanges = {},
      investing = {},
      financing = {},
      openingCash = this.opts.openingCash,
      currency = this.opts.currency,
    } = spec;

    if (!period || typeof period !== 'string')
      throw _err('period is required', 'תקופה נדרשת');
    if (!Number.isFinite(Number(netIncome)))
      throw _err('netIncome must be numeric', 'הכנסה נטו חייבת להיות מספר');

    // Working-capital deltas: an *increase* in AR or inventory is a *use*
    // of cash; an *increase* in AP is a *source*. Therefore in the indirect
    // method, we subtract ΔAR and ΔInventory, and add ΔAP.
    const dAR = _num(wcChanges.ar, 0);
    const dInv = _num(wcChanges.inventory, 0);
    const dAP = _num(wcChanges.ap, 0);
    const dOther = _num(wcChanges.other, 0);

    const wcAdjustment = _round2(-dAR - dInv + dAP + dOther);
    const depreciation = _num(dep, 0);
    const cfo = _round2(_num(netIncome, 0) + depreciation + wcAdjustment);

    const capex = _num(investing.capex, 0);
    const assetSales = _num(investing.assetSales, 0);
    const acquisitions = _num(investing.acquisitions, 0);
    const cfi = _round2(assetSales - capex - acquisitions);

    const debtIssued = _num(financing.debtIssued, 0);
    const debtRepaid = _num(financing.debtRepaid, 0);
    const dividends = _num(financing.dividends, 0);
    const equityIssued = _num(financing.equityIssued, 0);
    const equityRepurchased = _num(financing.equityRepurchased, 0);
    const cff = _round2(
      debtIssued - debtRepaid - dividends + equityIssued - equityRepurchased
    );

    const netChange = _round2(cfo + cfi + cff);
    const closingCash = _round2(_num(openingCash, 0) + netChange);

    const forecastId = this._genId('ICF');
    const snapshot = {
      forecastId,
      method: FORECAST_METHODS.INDIRECT,
      period,
      currency,
      openingCash: _round2(openingCash),
      netIncome: _round2(netIncome),
      dep: _round2(depreciation),
      wcChanges: {
        ar: _round2(dAR),
        inventory: _round2(dInv),
        ap: _round2(dAP),
        other: _round2(dOther),
        adjustment: wcAdjustment,
      },
      investing: {
        capex: _round2(capex),
        assetSales: _round2(assetSales),
        acquisitions: _round2(acquisitions),
        net: cfi,
      },
      financing: {
        debtIssued: _round2(debtIssued),
        debtRepaid: _round2(debtRepaid),
        dividends: _round2(dividends),
        equityIssued: _round2(equityIssued),
        equityRepurchased: _round2(equityRepurchased),
        net: cff,
      },
      cfo,
      cfi,
      cff,
      netChange,
      closingCash,
      status: FORECAST_STATUS.PUBLISHED,
      createdAt: new Date(this.opts.now()).toISOString(),
    };
    this.forecasts.set(forecastId, snapshot);
    this._log('buildIndirectMethod', { forecastId, period, cfo, cfi, cff, netChange });
    return _clone(snapshot);
  }

  // ═════════════════════════════════════════════════════════════
  // 3. 13-week rolling cash forecast
  // ═════════════════════════════════════════════════════════════

  /**
   * Build a 13-week (or n-week) rolling direct-method cash forecast with
   * weekly buckets, starting at `period.startDate` (week-aligned).
   *
   * @param {Object} period
   * @param {string|Date} period.startDate         anchor — will snap to Sunday
   * @param {number} [period.weeks]                default 13
   * @param {Array} [period.receipts]              receipt items (see _normLine)
   * @param {Array} [period.disbursements]         disbursement items
   * @param {number} [period.openingCash]
   * @returns {Object}  {weeks: [...], totals, forecastId}
   */
  weeklyRolling(period = {}) {
    if (!period || typeof period !== 'object')
      throw _err('period is required', 'תקופה נדרשת');
    const weeks = _num(period.weeks, this.opts.rollingWeeks);
    if (weeks < 1 || weeks > 52)
      throw _err('weeks must be between 1 and 52', 'שבועות חייב להיות בין 1 ל־52');

    const startDate = _startOfWeek(period.startDate || new Date(this.opts.now()));
    const openingCash = _num(period.openingCash, this.opts.openingCash);
    const receipts = Array.isArray(period.receipts) ? period.receipts : [];
    const disbursements = Array.isArray(period.disbursements) ? period.disbursements : [];

    // Build empty buckets
    const buckets = [];
    for (let i = 0; i < weeks; i++) {
      const weekStart = _addDays(startDate, i * 7);
      const weekEnd = _addDays(weekStart, 6);
      buckets.push({
        index: i + 1,
        weekStart: _isoDate(weekStart),
        weekEnd: _isoDate(weekEnd),
        receipts: [],
        disbursements: [],
        receiptsTotal: 0,
        disbursementsTotal: 0,
        netFlow: 0,
        openingCash: 0,
        closingCash: 0,
      });
    }

    // Distribute items into buckets by date; items without a date go to week 1
    const placeItem = (item, kind, i) => {
      const norm = this._normLine(item, kind, i);
      const d = norm.date ? _parseDate(norm.date) : startDate;
      const w = Math.floor(_weeksBetween(startDate, d));
      if (w < 0 || w >= weeks) return; // outside horizon — skip
      buckets[w][kind === 'receipt' ? 'receipts' : 'disbursements'].push(norm);
    };

    receipts.forEach((r, i) => placeItem(r, 'receipt', i));
    disbursements.forEach((d, i) => placeItem(d, 'disbursement', i));

    // Roll cash forward
    let prevClosing = openingCash;
    for (const b of buckets) {
      b.receiptsTotal = _round2(_sum(b.receipts, (x) => x.amount));
      b.disbursementsTotal = _round2(_sum(b.disbursements, (x) => x.amount));
      b.netFlow = _round2(b.receiptsTotal - b.disbursementsTotal);
      b.openingCash = _round2(prevClosing);
      b.closingCash = _round2(b.openingCash + b.netFlow);
      prevClosing = b.closingCash;
    }

    const totals = {
      receipts: _round2(_sum(buckets, (b) => b.receiptsTotal)),
      disbursements: _round2(_sum(buckets, (b) => b.disbursementsTotal)),
      netFlow: _round2(_sum(buckets, (b) => b.netFlow)),
      openingCash: _round2(openingCash),
      closingCash: _round2(prevClosing),
    };

    const forecastId = this._genId('WRF');
    const snapshot = {
      forecastId,
      method: FORECAST_METHODS.DIRECT,
      granularity: PERIOD_GRANULARITY.WEEKLY,
      startDate: _isoDate(startDate),
      weeks,
      buckets,
      totals,
      status: FORECAST_STATUS.PUBLISHED,
      createdAt: new Date(this.opts.now()).toISOString(),
    };
    this.forecasts.set(forecastId, snapshot);
    this._log('weeklyRolling', { forecastId, startDate: snapshot.startDate, weeks });
    return _clone(snapshot);
  }

  // ═════════════════════════════════════════════════════════════
  // 4. Sources of cash — AR, pipeline, recurring, events
  // ═════════════════════════════════════════════════════════════

  /**
   * Classify and aggregate sources of cash with probability-weighted inflows.
   *
   * @param {Object} input
   * @param {Array<{customerId, amount, daysOutstanding?}>} [input.ar]
   *         open AR; each item uses aging buckets → collection probability.
   * @param {Array<{oppId, amount, closeProbability}>} [input.pipeline]
   *         sales opportunities; each has an explicit close probability.
   * @param {Array<{label, amount, frequency}>} [input.recurring]
   *         contracted recurring inflows (monthly SaaS, rent received, etc.)
   * @param {Array<{label, amount, date?, kind}>} [input.events]
   *         one-off investing/financing inflow events
   * @returns {Object}
   */
  sources(input = {}) {
    const ar = Array.isArray(input.ar) ? input.ar : [];
    const pipeline = Array.isArray(input.pipeline) ? input.pipeline : [];
    const recurring = Array.isArray(input.recurring) ? input.recurring : [];
    const events = Array.isArray(input.events) ? input.events : [];

    // AR aging → collection probability
    const agedAR = ar.map((item, i) => {
      const amount = _num(item.amount, 0);
      if (amount < 0)
        throw _err(`AR[${i}] amount must be non-negative`, `AR[${i}] לא יכול להיות שלילי`);
      const days = _num(item.daysOutstanding, 0);
      const bucket = this._arBucket(days);
      const probability = this._arProbability(bucket);
      return {
        customerId: item.customerId || `cust-${i + 1}`,
        amount: _round2(amount),
        daysOutstanding: days,
        bucket,
        probability,
        expected: _round2(amount * probability),
      };
    });

    // Pipeline
    const weightedPipeline = pipeline.map((opp, i) => {
      const amount = _num(opp.amount, 0);
      const p = _num(opp.closeProbability, 0);
      if (p < 0 || p > 1)
        throw _err(
          `pipeline[${i}] closeProbability must be 0..1`,
          `הסתברות סגירה חייבת להיות בין 0 ל־1`
        );
      return {
        oppId: opp.oppId || `opp-${i + 1}`,
        amount: _round2(amount),
        closeProbability: p,
        expected: _round2(amount * p),
      };
    });

    // Recurring
    const recurringSums = recurring.map((r, i) => ({
      label: r.label || `rec-${i + 1}`,
      amount: _round2(_num(r.amount, 0)),
      frequency: r.frequency || 'monthly',
    }));

    // Events
    const eventSums = events.map((e, i) => ({
      label: e.label || `event-${i + 1}`,
      amount: _round2(_num(e.amount, 0)),
      date: e.date ? _isoDate(e.date) : null,
      kind: e.kind || 'event',
    }));

    const totals = {
      arExpected: _round2(_sum(agedAR, (x) => x.expected)),
      pipelineExpected: _round2(_sum(weightedPipeline, (x) => x.expected)),
      recurring: _round2(_sum(recurringSums, (x) => x.amount)),
      events: _round2(_sum(eventSums, (x) => x.amount)),
    };
    totals.grandTotal = _round2(
      totals.arExpected + totals.pipelineExpected + totals.recurring + totals.events
    );

    this._log('sources', totals);
    return { ar: agedAR, pipeline: weightedPipeline, recurring: recurringSums, events: eventSums, totals };
  }

  _arBucket(days) {
    if (days <= 0) return 'current';
    if (days <= 30) return '1-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
  }

  _arProbability(bucket) {
    // Conservative aging probabilities — can be overridden via constructor
    const table = { current: 0.98, '1-30': 0.95, '31-60': 0.85, '61-90': 0.60, '90+': 0.25 };
    return table[bucket] !== undefined ? table[bucket] : 0.5;
  }

  // ═════════════════════════════════════════════════════════════
  // 5. Uses of cash — AP, payroll, tax, loans, rent
  // ═════════════════════════════════════════════════════════════

  /**
   * Classify uses of cash with Israeli statutory payment dates baked in.
   *
   * @param {Object} input
   * @param {Array<{vendor, amount, dueDate, terms?}>} [input.ap]
   * @param {Object}  [input.payroll]
   *                  {gross, employerCostRatio?, bimonthly?, month?(YYYY-MM)}
   *                  — gross payroll bill; Israeli cadence is typically once/month
   *                  paid by the 7th of the following month. If `bimonthly=true`
   *                  split 50/50 on advance (~22nd) + settlement (~7th).
   * @param {Object}  [input.tax]
   *                  {vat, incomeTax, bituachLeumi, pension, month?}
   *                  — all default due on the 15th of the following month.
   * @param {Array}   [input.loans]    [{label, amount, dueDate}]
   * @param {number|Array} [input.rent]  monthly rent or array of {label, amount, dueDate}
   * @param {Array}   [input.other]    other recurring disbursements
   * @returns {Object}  itemised uses with computed Israeli due dates
   */
  uses(input = {}) {
    const paymentDays = this.opts.paymentDays;
    const ap = Array.isArray(input.ap) ? input.ap : [];
    const items = [];

    // AP with explicit due dates
    for (const [i, item] of ap.entries()) {
      const amount = _num(item.amount, 0);
      if (amount < 0)
        throw _err(`AP[${i}] amount must be non-negative`, `AP[${i}] לא יכול להיות שלילי`);
      items.push({
        type: 'ap',
        label: item.vendor || `vendor-${i + 1}`,
        amount: _round2(amount),
        dueDate: item.dueDate ? _isoDate(item.dueDate) : null,
        category: item.category || 'accounts-payable',
      });
    }

    // Payroll (Israeli cadence)
    if (input.payroll) {
      const p = input.payroll;
      const gross = _num(p.gross, 0);
      if (gross < 0)
        throw _err('payroll.gross must be non-negative', 'שכר ברוטו לא יכול להיות שלילי');
      const ratio = _num(p.employerCostRatio, 1.25); // includes bituach leumi, pension employer
      const totalCost = _round2(gross * ratio);
      const month = p.month || _yyyymm(this.opts.now());
      const nextMonthDate = (day) => this._nextMonthDay(month, day);
      if (p.bimonthly) {
        items.push({
          type: 'payroll',
          label: 'Payroll advance / מקדמת שכר',
          amount: _round2(totalCost / 2),
          dueDate: this._sameMonthDay(month, paymentDays.PAYROLL_ADVANCE),
          category: 'payroll',
        });
        items.push({
          type: 'payroll',
          label: 'Payroll settlement / יתרת שכר',
          amount: _round2(totalCost / 2),
          dueDate: nextMonthDate(paymentDays.PAYROLL_MAIN),
          category: 'payroll',
        });
      } else {
        items.push({
          type: 'payroll',
          label: 'Payroll / שכר חודשי',
          amount: totalCost,
          dueDate: nextMonthDate(paymentDays.PAYROLL_MAIN),
          category: 'payroll',
        });
      }
    }

    // Tax bundle (VAT / income tax withholding / bituach leumi / pension)
    if (input.tax) {
      const t = input.tax;
      const month = t.month || _yyyymm(this.opts.now());
      const next = (day) => this._nextMonthDay(month, day);
      if (t.vat !== undefined) {
        items.push({
          type: 'tax',
          label: 'VAT / מע"מ',
          amount: _round2(_num(t.vat, 0)),
          dueDate: next(paymentDays.VAT),
          category: 'vat',
          reference: 'חוק מע"מ, התשל"ו-1975',
        });
      }
      if (t.incomeTax !== undefined) {
        items.push({
          type: 'tax',
          label: 'Income tax / מס הכנסה — ניכויים (טופס 102)',
          amount: _round2(_num(t.incomeTax, 0)),
          dueDate: next(paymentDays.INCOME_TAX),
          category: 'income-tax',
          reference: 'פקודת מס הכנסה — טופס 102',
        });
      }
      if (t.bituachLeumi !== undefined) {
        items.push({
          type: 'tax',
          label: 'Bituach Leumi / ביטוח לאומי',
          amount: _round2(_num(t.bituachLeumi, 0)),
          dueDate: next(paymentDays.BITUACH_LEUMI),
          category: 'bituach-leumi',
          reference: 'חוק הביטוח הלאומי — טופס 102',
        });
      }
      if (t.pension !== undefined) {
        items.push({
          type: 'tax',
          label: 'Pension / פנסיה',
          amount: _round2(_num(t.pension, 0)),
          dueDate: next(paymentDays.PENSION),
          category: 'pension',
          reference: 'תקנות קופות גמל — הפקדות חודשיות',
        });
      }
    }

    // Loans
    const loans = Array.isArray(input.loans) ? input.loans : [];
    for (const [i, loan] of loans.entries()) {
      items.push({
        type: 'loan',
        label: loan.label || `loan-${i + 1}`,
        amount: _round2(_num(loan.amount, 0)),
        dueDate: loan.dueDate ? _isoDate(loan.dueDate) : null,
        category: 'loan-payment',
      });
    }

    // Rent — can be scalar or array
    if (input.rent !== undefined) {
      if (typeof input.rent === 'number') {
        items.push({
          type: 'rent',
          label: 'Rent / שכר דירה',
          amount: _round2(input.rent),
          dueDate: null,
          category: 'rent',
        });
      } else if (Array.isArray(input.rent)) {
        for (const [i, r] of input.rent.entries()) {
          items.push({
            type: 'rent',
            label: r.label || `rent-${i + 1}`,
            amount: _round2(_num(r.amount, 0)),
            dueDate: r.dueDate ? _isoDate(r.dueDate) : null,
            category: 'rent',
          });
        }
      }
    }

    // Other recurring
    const other = Array.isArray(input.other) ? input.other : [];
    for (const [i, o] of other.entries()) {
      items.push({
        type: 'other',
        label: o.label || `other-${i + 1}`,
        amount: _round2(_num(o.amount, 0)),
        dueDate: o.dueDate ? _isoDate(o.dueDate) : null,
        category: o.category || 'other',
      });
    }

    const total = _round2(_sum(items, (x) => x.amount));
    const byCategory = {};
    for (const it of items) {
      byCategory[it.category] = _round2((byCategory[it.category] || 0) + it.amount);
    }

    this._log('uses', { count: items.length, total });
    return { items, total, byCategory };
  }

  _sameMonthDay(yyyymm, day) {
    const [y, m] = yyyymm.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  _nextMonthDay(yyyymm, day) {
    let [y, m] = yyyymm.split('-').map(Number);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // ═════════════════════════════════════════════════════════════
  // 6. Stress test — apply shocks
  // ═════════════════════════════════════════════════════════════

  /**
   * Apply a set of shocks to a previously built forecast, returning a new
   * snapshot. Each shock has a `item` key (e.g. 'receipts', 'ar', 'payroll',
   * 'totalReceipts', 'totalDisbursements', or a specific label) and a signed
   * percentage (pct) — e.g. -30 means that item is reduced by 30%.
   *
   * The original forecast is NOT mutated (append-only rule). The stressed
   * forecast is stored as a new snapshot with status 'draft' and linked to
   * the base forecast via `baseForecastId`.
   *
   * @param {Object} input
   * @param {string} input.forecastId
   * @param {Array<{item, pct}>} input.shocks
   * @returns {Object}  stressed forecast
   */
  stressTest(input = {}) {
    const base = this.forecasts.get(input.forecastId);
    if (!base)
      throw _err(`forecast not found: ${input.forecastId}`, `תחזית לא נמצאה: ${input.forecastId}`);
    const shocks = Array.isArray(input.shocks) ? input.shocks : [];
    for (const s of shocks) {
      if (!s || typeof s.pct !== 'number')
        throw _err('each shock requires {item, pct}', 'כל שוק חייב להיות {item, pct}');
    }

    const stressed = _clone(base);
    stressed.forecastId = this._genId('STR');
    stressed.baseForecastId = base.forecastId;
    stressed.method = base.method;
    stressed.scenario = 'stress';
    stressed.status = FORECAST_STATUS.DRAFT;
    stressed.shocks = shocks.map((s) => ({ item: s.item, pct: _num(s.pct, 0) }));
    stressed.createdAt = new Date(this.opts.now()).toISOString();

    // Apply shocks depending on forecast shape
    const applyPct = (v, pct) => _round2(v * (1 + pct / 100));

    // Helper to shock an array of line items matching a label / category / 'all'
    const shockLines = (arr, item, pct) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        if (
          item === 'all' ||
          item === '*' ||
          it.label === item ||
          it.category === item ||
          it.type === item
        ) {
          it.amount = applyPct(it.amount, pct);
        }
      }
    };

    for (const shock of stressed.shocks) {
      const { item, pct } = shock;
      // DIRECT-METHOD style
      if (Array.isArray(stressed.receipts) && (item === 'receipts' || item === 'totalReceipts' || item === 'ar')) {
        for (const r of stressed.receipts) r.amount = applyPct(r.amount, pct);
      } else if (Array.isArray(stressed.disbursements) && (item === 'disbursements' || item === 'totalDisbursements')) {
        for (const d of stressed.disbursements) d.amount = applyPct(d.amount, pct);
      } else if (Array.isArray(stressed.receipts)) {
        shockLines(stressed.receipts, item, pct);
      }
      if (Array.isArray(stressed.disbursements)) {
        shockLines(stressed.disbursements, item, pct);
      }
      // INDIRECT-METHOD style
      if (stressed.method === FORECAST_METHODS.INDIRECT) {
        if (item === 'netIncome') stressed.netIncome = applyPct(stressed.netIncome, pct);
        if (item === 'dep') stressed.dep = applyPct(stressed.dep, pct);
        if (item === 'capex' && stressed.investing) stressed.investing.capex = applyPct(stressed.investing.capex, pct);
      }
      // WEEKLY ROLLING
      if (Array.isArray(stressed.buckets)) {
        for (const b of stressed.buckets) {
          if (item === 'receipts' || item === 'ar') {
            for (const r of b.receipts) r.amount = applyPct(r.amount, pct);
          } else if (item === 'disbursements') {
            for (const d of b.disbursements) d.amount = applyPct(d.amount, pct);
          } else {
            shockLines(b.receipts, item, pct);
            shockLines(b.disbursements, item, pct);
          }
        }
      }
    }

    // Recompute totals after shocks
    this._recomputeTotals(stressed);

    this.forecasts.set(stressed.forecastId, stressed);
    this._log('stressTest', {
      forecastId: stressed.forecastId,
      baseForecastId: base.forecastId,
      shocks: stressed.shocks,
    });
    return _clone(stressed);
  }

  _recomputeTotals(f) {
    if (f.method === FORECAST_METHODS.DIRECT && Array.isArray(f.buckets)) {
      let prev = _num(f.totals ? f.totals.openingCash : 0, 0);
      for (const b of f.buckets) {
        b.receiptsTotal = _round2(_sum(b.receipts, (x) => x.amount));
        b.disbursementsTotal = _round2(_sum(b.disbursements, (x) => x.amount));
        b.netFlow = _round2(b.receiptsTotal - b.disbursementsTotal);
        b.openingCash = _round2(prev);
        b.closingCash = _round2(prev + b.netFlow);
        prev = b.closingCash;
      }
      f.totals = f.totals || {};
      f.totals.receipts = _round2(_sum(f.buckets, (b) => b.receiptsTotal));
      f.totals.disbursements = _round2(_sum(f.buckets, (b) => b.disbursementsTotal));
      f.totals.netFlow = _round2(_sum(f.buckets, (b) => b.netFlow));
      f.totals.closingCash = _round2(prev);
      return;
    }
    if (f.method === FORECAST_METHODS.DIRECT) {
      f.totalReceipts = _round2(_sum(f.receipts || [], (x) => x.amount));
      f.totalDisbursements = _round2(_sum(f.disbursements || [], (x) => x.amount));
      f.netCashFlow = _round2(f.totalReceipts - f.totalDisbursements);
      f.closingCash = _round2(_num(f.openingCash, 0) + f.netCashFlow);
      return;
    }
    if (f.method === FORECAST_METHODS.INDIRECT) {
      const wc = f.wcChanges;
      wc.adjustment = _round2(-_num(wc.ar) - _num(wc.inventory) + _num(wc.ap) + _num(wc.other));
      f.cfo = _round2(_num(f.netIncome) + _num(f.dep) + wc.adjustment);
      f.cfi = _round2(
        _num(f.investing.assetSales) - _num(f.investing.capex) - _num(f.investing.acquisitions)
      );
      f.investing.net = f.cfi;
      f.cff = _round2(
        _num(f.financing.debtIssued) -
          _num(f.financing.debtRepaid) -
          _num(f.financing.dividends) +
          _num(f.financing.equityIssued) -
          _num(f.financing.equityRepurchased)
      );
      f.financing.net = f.cff;
      f.netChange = _round2(f.cfo + f.cfi + f.cff);
      f.closingCash = _round2(_num(f.openingCash) + f.netChange);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 7. Minimum-cash alert
  // ═════════════════════════════════════════════════════════════

  /**
   * Return all periods/buckets where cash balance goes below the threshold.
   *
   * @param {number} [threshold]   absolute minimum cash threshold (ILS)
   * @param {string} [forecastId]  forecast to check; defaults to last built
   * @returns {{alerts, criticalPeriods, minCashReached}}
   */
  minimumCashAlert(threshold, forecastId) {
    const f = forecastId
      ? this.forecasts.get(forecastId)
      : [...this.forecasts.values()].pop();
    if (!f) throw _err('no forecast available', 'אין תחזית זמינה');
    const t = _num(threshold, this.opts.minCash);
    const alerts = [];
    let minReached = Infinity;
    let minReachedWhen = null;

    if (Array.isArray(f.buckets)) {
      for (const b of f.buckets) {
        if (b.closingCash < minReached) {
          minReached = b.closingCash;
          minReachedWhen = `${b.weekStart}..${b.weekEnd}`;
        }
        if (b.closingCash < t) {
          alerts.push({
            period: `week ${b.index} (${b.weekStart}..${b.weekEnd})`,
            closingCash: b.closingCash,
            shortfall: _round2(t - b.closingCash),
            severity: this._severity(b.closingCash, t),
          });
        }
      }
    } else {
      if (f.closingCash < minReached) {
        minReached = f.closingCash;
        minReachedWhen = f.period;
      }
      if (f.closingCash < t) {
        alerts.push({
          period: f.period,
          closingCash: f.closingCash,
          shortfall: _round2(t - f.closingCash),
          severity: this._severity(f.closingCash, t),
        });
      }
    }

    const result = {
      threshold: t,
      alerts,
      criticalPeriods: alerts.length,
      minCashReached: minReached === Infinity ? 0 : _round2(minReached),
      minCashReachedWhen: minReachedWhen,
      healthy: alerts.length === 0,
    };
    this._log('minimumCashAlert', { forecastId: f.forecastId, criticalPeriods: alerts.length });
    return result;
  }

  _severity(closing, threshold) {
    if (closing < 0) return 'critical';
    if (closing < threshold * 0.5) return 'high';
    if (closing < threshold) return 'medium';
    return 'low';
  }

  // ═════════════════════════════════════════════════════════════
  // 8. Coverage ratio
  // ═════════════════════════════════════════════════════════════

  /**
   * Coverage ratio = forecast cash inflows / obligations in the period.
   * >=1 means obligations are fully covered; <1 is a funding gap.
   *
   * @param {Object} input
   * @param {number|Object} input.forecast    numeric inflows or forecast snapshot
   * @param {number|Object} input.obligations numeric outflows or uses()-style
   * @returns {{ratio, gap, covered}}
   */
  coverageRatio(input = {}) {
    const inflow = this._extractInflow(input.forecast);
    const outflow = this._extractOutflow(input.obligations);
    if (outflow === 0) {
      return { ratio: inflow > 0 ? Infinity : 1, gap: 0, covered: true, inflow, outflow };
    }
    const ratio = _round2(inflow / outflow);
    const gap = _round2(outflow - inflow);
    const covered = inflow >= outflow;
    this._log('coverageRatio', { ratio, gap, covered });
    return { ratio, gap: gap > 0 ? gap : 0, surplus: gap < 0 ? _round2(-gap) : 0, covered, inflow, outflow };
  }

  _extractInflow(v) {
    if (typeof v === 'number') return _num(v, 0);
    if (!v || typeof v !== 'object') return 0;
    if (Array.isArray(v.buckets)) return _round2(_sum(v.buckets, (b) => b.receiptsTotal));
    if (typeof v.totalReceipts === 'number') return v.totalReceipts;
    if (v.totals && typeof v.totals.receipts === 'number') return v.totals.receipts;
    return 0;
  }

  _extractOutflow(v) {
    if (typeof v === 'number') return _num(v, 0);
    if (!v || typeof v !== 'object') return 0;
    if (typeof v.total === 'number') return v.total; // uses()-style
    if (Array.isArray(v.buckets)) return _round2(_sum(v.buckets, (b) => b.disbursementsTotal));
    if (typeof v.totalDisbursements === 'number') return v.totalDisbursements;
    if (v.totals && typeof v.totals.disbursements === 'number') return v.totals.disbursements;
    return 0;
  }

  // ═════════════════════════════════════════════════════════════
  // 9. Actuals vs forecast
  // ═════════════════════════════════════════════════════════════

  /**
   * Register actual cash inflows/outflows for a period, compare to the most
   * recent forecast of that period, and return an accuracy snapshot.
   *
   * @param {string} period
   * @param {Object} [actual]   {receipts, disbursements} to record before comparing
   * @returns {Object} accuracy snapshot
   */
  actualsVsForecast(period, actual) {
    if (!period) throw _err('period is required', 'תקופה נדרשת');
    if (actual) {
      this.actuals.set(period, {
        period,
        receipts: _round2(_num(actual.receipts, 0)),
        disbursements: _round2(_num(actual.disbursements, 0)),
        recordedAt: new Date(this.opts.now()).toISOString(),
      });
      this._log('registerActuals', { period, ...this.actuals.get(period) });
    }
    const a = this.actuals.get(period);
    if (!a) throw _err(`no actuals recorded for ${period}`, `אין נתונים בפועל עבור ${period}`);

    // Find the latest forecast covering that period
    const matching = [...this.forecasts.values()]
      .filter((f) => f.period === period && f.method === FORECAST_METHODS.DIRECT)
      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    const forecast = matching[0];
    if (!forecast) {
      return {
        period,
        actual: a,
        forecast: null,
        note: 'no forecast to compare / אין תחזית להשוואה',
      };
    }

    const variance = {
      receipts: _round2(a.receipts - forecast.totalReceipts),
      disbursements: _round2(a.disbursements - forecast.totalDisbursements),
      net: _round2(
        a.receipts - a.disbursements - (forecast.totalReceipts - forecast.totalDisbursements)
      ),
    };
    const denom = forecast.totalReceipts || 1;
    const accuracy = _round2(1 - Math.abs(variance.receipts) / denom);
    const mape = _round2((Math.abs(variance.receipts) / denom) * 100);
    const snapshot = {
      period,
      actual: a,
      forecast: {
        forecastId: forecast.forecastId,
        totalReceipts: forecast.totalReceipts,
        totalDisbursements: forecast.totalDisbursements,
      },
      variance,
      accuracy,       // 0..1
      mapePercent: mape, // mean abs % error on receipts
    };
    this._log('actualsVsForecast', { period, accuracy, mapePercent: mape });
    return snapshot;
  }

  // ═════════════════════════════════════════════════════════════
  // 10. PDF generator — bilingual, inline SVG chart
  // ═════════════════════════════════════════════════════════════

  /**
   * Generate a minimal self-contained PDF 1.4 document with a bilingual
   * cash-flow forecast summary and an embedded SVG bar chart of net cash
   * flow per week (for rolling forecasts) or per line (for period forecasts).
   *
   * Returns {buffer, text, svg, metadata}.
   */
  generatePDF(forecast) {
    const f = forecast && typeof forecast === 'object' ? forecast : null;
    if (!f) throw _err('forecast is required', 'תחזית נדרשת');

    const lines = this._renderPdfLines(f);
    const svg = this._renderSvgChart(f);

    // --- Minimal PDF 1.4 writer (text only; SVG is returned separately) ---
    const objects = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'
    );
    const stream = this._buildPdfStream(lines);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let body = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefStart = Buffer.byteLength(body, 'latin1');
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    const pdf = body + xref + trailer;
    const buffer = Buffer.from(pdf, 'latin1');

    const metadata = {
      forecastId: f.forecastId,
      method: f.method,
      period: f.period || (f.startDate ? `${f.startDate}+${f.weeks}w` : null),
      generatedAt: new Date(this.opts.now()).toISOString(),
      direction: 'rtl',
      language: 'he+en',
      size: buffer.length,
      pageCount: 1,
    };
    this._log('generatePDF', { forecastId: f.forecastId, size: buffer.length });
    return { buffer, text: lines.join('\n'), svg, metadata };
  }

  _buildPdfStream(lines) {
    const out = [];
    out.push('BT');
    out.push('/F1 11 Tf');
    out.push('50 800 Td');
    out.push('13 TL');
    for (const ln of lines) {
      const safe = String(ln).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      out.push(`(${safe}) Tj T*`);
    }
    out.push('ET');
    return out.join('\n');
  }

  _renderPdfLines(f) {
    const L = [];
    L.push('==============================================');
    L.push('Cash Flow Forecast / tazrim mezumanim');
    L.push('==============================================');
    L.push('');
    L.push(`Forecast ID / mis. tahzit: ${f.forecastId || '(ad-hoc)'}`);
    L.push(`Method / shita: ${f.method === FORECAST_METHODS.INDIRECT ? 'indirect / akifa' : 'direct / yeshira'}`);
    if (f.period) L.push(`Period / tkufa: ${f.period}`);
    if (f.startDate) L.push(`Start / tchila: ${f.startDate}`);
    if (f.weeks) L.push(`Horizon / ofek: ${f.weeks} weeks / shavuot`);
    L.push('');
    if (Array.isArray(f.buckets)) {
      L.push('--- Weekly rolling forecast / tazrim shavui ---');
      for (const b of f.buckets) {
        L.push(
          `W${b.index}  ${b.weekStart}..${b.weekEnd}  in=${b.receiptsTotal}  ` +
            `out=${b.disbursementsTotal}  net=${b.netFlow}  close=${b.closingCash}`
        );
      }
      L.push('');
      L.push(`Totals / sachakol:`);
      L.push(`  Receipts / tkabulim: ${f.totals.receipts}`);
      L.push(`  Disbursements / tashlumim: ${f.totals.disbursements}`);
      L.push(`  Net / neto: ${f.totals.netFlow}`);
      L.push(`  Closing cash / mezumanim sofi: ${f.totals.closingCash}`);
    } else if (f.method === FORECAST_METHODS.DIRECT) {
      L.push('--- Direct method / shita yeshira ---');
      L.push(`Opening cash / mezumanim ptikha: ${f.openingCash}`);
      L.push('');
      L.push('Receipts / tkabulim:');
      for (const r of f.receipts || []) L.push(`  + ${r.label}: ${r.amount}`);
      L.push(`  ----`);
      L.push(`  Total / sachakol: ${f.totalReceipts}`);
      L.push('');
      L.push('Disbursements / tashlumim:');
      for (const d of f.disbursements || []) L.push(`  - ${d.label}: ${d.amount}`);
      L.push(`  ----`);
      L.push(`  Total / sachakol: ${f.totalDisbursements}`);
      L.push('');
      L.push(`Net cash flow / tazrim neto: ${f.netCashFlow}`);
      L.push(`Closing cash / mezumanim sogerim: ${f.closingCash}`);
    } else if (f.method === FORECAST_METHODS.INDIRECT) {
      L.push('--- Indirect method / shita akifa ---');
      L.push(`Opening cash / mezumanim ptikha: ${f.openingCash}`);
      L.push(`Net income / revach neto: ${f.netIncome}`);
      L.push(`(+) Depreciation / pachat: ${f.dep}`);
      L.push(`(+/-) Working capital / hon chozer:`);
      L.push(`     AR / lakochot: ${f.wcChanges.ar}`);
      L.push(`     Inventory / melay: ${f.wcChanges.inventory}`);
      L.push(`     AP / sapkim: ${f.wcChanges.ap}`);
      L.push(`     Other / acher: ${f.wcChanges.other}`);
      L.push(`     Net WC adjust / hatama: ${f.wcChanges.adjustment}`);
      L.push(`CFO / peilut shotefet: ${f.cfo}`);
      L.push(`CFI / peilut hashaka (net): ${f.cfi}`);
      L.push(`CFF / peilut mimun (net): ${f.cff}`);
      L.push(`Net change / shinui neto: ${f.netChange}`);
      L.push(`Closing cash / mezumanim sogerim: ${f.closingCash}`);
    }
    L.push('');
    if (f.shocks && f.shocks.length) {
      L.push('--- Stress shocks / senarei lahatz ---');
      for (const s of f.shocks) L.push(`  ${s.item}: ${s.pct}%`);
    }
    L.push('');
    L.push(
      'Legal / hanhagot: Tax / mas: 15 ch.s.; Payroll / sachar: 7 ch.s. (9-cap under chok hagnat ha-sachar)'
    );
    return L;
  }

  /**
   * Build a minimal self-contained SVG chart of the forecast.
   * Safe HTML escaping; no external styles.
   */
  _renderSvgChart(f) {
    const WIDTH = 480;
    const HEIGHT = 200;
    const MARGIN = 30;
    const innerW = WIDTH - 2 * MARGIN;
    const innerH = HEIGHT - 2 * MARGIN;

    let series;
    if (Array.isArray(f.buckets) && f.buckets.length) {
      series = f.buckets.map((b) => ({
        label: `W${b.index}`,
        value: _num(b.netFlow, 0),
      }));
    } else if (f.method === FORECAST_METHODS.DIRECT) {
      series = [
        { label: 'Receipts', value: _num(f.totalReceipts, 0) },
        { label: 'Disbursements', value: -_num(f.totalDisbursements, 0) },
        { label: 'Net', value: _num(f.netCashFlow, 0) },
      ];
    } else if (f.method === FORECAST_METHODS.INDIRECT) {
      series = [
        { label: 'CFO', value: _num(f.cfo, 0) },
        { label: 'CFI', value: _num(f.cfi, 0) },
        { label: 'CFF', value: _num(f.cff, 0) },
        { label: 'Net', value: _num(f.netChange, 0) },
      ];
    } else {
      series = [];
    }

    const maxAbs = Math.max(1, ...series.map((s) => Math.abs(s.value)));
    const barW = series.length > 0 ? innerW / series.length : 0;
    const mid = MARGIN + innerH / 2;
    const scale = innerH / 2 / maxAbs;

    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const bars = series
      .map((s, i) => {
        const h = Math.abs(s.value) * scale;
        const y = s.value >= 0 ? mid - h : mid;
        const x = MARGIN + i * barW + barW * 0.1;
        const w = barW * 0.8;
        const color = s.value >= 0 ? '#2e8b57' : '#b22222';
        return (
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" ` +
          `height="${h.toFixed(1)}" fill="${color}" />` +
          `<text x="${(x + w / 2).toFixed(1)}" y="${(HEIGHT - 8).toFixed(1)}" ` +
          `font-size="9" text-anchor="middle">${esc(s.label)}</text>`
        );
      })
      .join('');

    const axis =
      `<line x1="${MARGIN}" y1="${mid}" x2="${WIDTH - MARGIN}" y2="${mid}" ` +
      `stroke="#333" stroke-width="1"/>`;

    const title = esc(
      `Cash Flow Forecast / tazrim mezumanim — ${f.method || 'direct'}`
    );

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
      `viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${title}">` +
      `<title>${title}</title>` +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>` +
      `<text x="${WIDTH / 2}" y="18" text-anchor="middle" font-size="12">${title}</text>` +
      axis +
      bars +
      `</svg>`;
    return svg;
  }

  // ═════════════════════════════════════════════════════════════
  // Accessors
  // ═════════════════════════════════════════════════════════════

  getForecast(id) {
    const f = this.forecasts.get(id);
    return f ? _clone(f) : null;
  }

  listForecasts() {
    return [...this.forecasts.values()].map(_clone);
  }
}

// ───────────────────── Exports ─────────────────────

module.exports = {
  CashFlowForecast,
  FORECAST_METHODS,
  FORECAST_STATUS,
  PERIOD_GRANULARITY,
  ISRAELI_PAYMENT_DAYS,
  DEFAULT_ROLLING_WEEKS,
};
module.exports.default = CashFlowForecast;
