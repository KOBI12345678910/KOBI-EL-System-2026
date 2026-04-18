/**
 * Customer Lifetime Value (LTV) Calculator — Techno-Kol Uzi
 * ==========================================================
 * Agent Y-193 — 2026-04-11
 *
 * Hebrew / English bilingual customer LTV engine with three
 * complementary methods:
 *
 *   1. historicalLTV(customer)
 *      Sum of realised gross margin across all closed transactions,
 *      optionally discounted by the observed time-gap between
 *      transactions. "What this customer has given us so far."
 *      שיטה היסטורית — סכום הרווחים הגולמיים בפועל.
 *
 *   2. predictiveLTV(customer, options)
 *      Cohort-based expected value:
 *          LTV = (avgMarginPerPeriod / churnRate) * projectedPeriods
 *      Cohort churn rate is derived from the customer's cohort
 *      (same segment / same acquisition quarter). Hebrew label:
 *      שיטה חיזויית — בסיס קבוצת-עמיתים (cohort).
 *
 *   3. discountedLTV(customer, options)
 *      NPV of projected cash flows using WACC built from Israeli
 *      10-year government bond yield + company-specific premium
 *      (risk-free rate + equity-risk-premium + small-company beta).
 *      Hebrew label: שיטה מהוונת — ערך נוכחי נקי.
 *
 * Aggregation helpers:
 *   - segmentLTV(customers, key)    — group & roll up
 *   - ltvCacRatio(ltv, cac)         — classic SaaS / retail metric
 *   - healthBand(ratio)             — bad / ok / good bilingual
 *   - summary(customers, opts)      — full bilingual report payload
 *
 * RULES OF ENGAGEMENT (all strictly honoured):
 *   - never deletes anything (pure functions; no mutation of inputs)
 *   - Node built-ins only — zero third-party dependencies
 *   - bilingual he/en output on every user-facing field
 *   - deterministic: same input → same output (no Date.now, no rand)
 *
 * Shape contract for `customer` input:
 *   {
 *     id:              string,
 *     name:            string,
 *     segment?:        string,      // e.g. 'retail', 'contractor'
 *     acquisitionDate: string|Date, // first deal
 *     cohortId?:       string,      // falls back to YYYY-Qn_segment
 *     transactions: [
 *       { id, date, revenue, cost, margin? }
 *     ],
 *     churned?: boolean,
 *     churnDate?: string|Date,
 *     acquisitionCost?: number,     // CAC
 *   }
 *
 * All monetary values are in ILS (agorot-precision is lost at the
 * JS number boundary — callers should aggregate with integer
 * agorot if sub-1-ILS precision matters).
 *
 * Nothing in this file is hot-path — calculations are O(n) over
 * the transaction array. Safe to call from a reporting job or
 * an HTTP handler.
 */

'use strict';

// ─── constants ─────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_PERIOD = {
  month: 30.4375, // avg tropical month
  quarter: 91.3125,
  year: 365.25,
};

/**
 * Default WACC inputs — Israeli macro as of 2026-Q1.
 * Sources (all public): Bank of Israel 10Y bond yield, TASE ERP
 * (equity risk premium for small-cap industrials), sector beta
 * published by BOI Financial Stability department.
 *
 * Callers SHOULD override these via options for audited reports.
 * The numbers here are "sensible defaults" — not a statement of
 * truth.
 */
const DEFAULT_WACC = Object.freeze({
  riskFreeRate: 0.046,        // Israeli 10Y gov bond — April 2026
  equityRiskPremium: 0.055,   // TASE small-cap ERP
  beta: 1.10,                 // industrial / contractor beta
  taxShield: 0.23,            // Israeli corp tax rate
  debtWeight: 0.00,           // equity-only default
  costOfDebt: 0.065,
  sizePremium: 0.015,         // illiquidity + size
});

/**
 * Health bands as specified by product:
 *   ratio <  1  → bad  ("רע" / "bad")
 *   1 ≤ r < 3   → ok   ("סביר" / "ok")
 *   r ≥ 3       → good ("טוב" / "good")
 */
const HEALTH_BANDS = Object.freeze({
  bad: {
    he: 'רע',
    en: 'bad',
    description: {
      he: 'יחס LTV/CAC נמוך מ-1 — הלקוח לא מחזיר את עלות הרכישה',
      en: 'LTV/CAC below 1 — customer does not cover acquisition cost',
    },
  },
  ok: {
    he: 'סביר',
    en: 'ok',
    description: {
      he: 'יחס LTV/CAC בין 1 ל-3 — ריווחי אך יש מקום לשיפור',
      en: 'LTV/CAC between 1 and 3 — profitable but with room to improve',
    },
  },
  good: {
    he: 'טוב',
    en: 'good',
    description: {
      he: 'יחס LTV/CAC מעל 3 — לקוח בריא ורווחי מאוד',
      en: 'LTV/CAC above 3 — highly profitable, healthy customer',
    },
  },
});

// ─── utilities ─────────────────────────────────────────────────

function toDate(d) {
  if (d === null || d === undefined) return null;
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function round(n, places = 2) {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function marginOf(tx) {
  if (!tx || typeof tx !== 'object') return 0;
  if (typeof tx.margin === 'number' && Number.isFinite(tx.margin)) return tx.margin;
  const rev = typeof tx.revenue === 'number' ? tx.revenue : 0;
  const cost = typeof tx.cost === 'number' ? tx.cost : 0;
  return rev - cost;
}

function sortedTransactions(customer) {
  if (!customer || !Array.isArray(customer.transactions)) return [];
  return customer.transactions
    .filter((t) => t && toDate(t.date))
    .slice()
    .sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
}

function customerLifespanDays(customer) {
  const txs = sortedTransactions(customer);
  if (txs.length === 0) return 0;
  const first = toDate(txs[0].date).getTime();
  const last = toDate(customer.churnDate) || toDate(txs[txs.length - 1].date);
  const end = last ? last.getTime() : first;
  return Math.max(0, Math.round((end - first) / MS_PER_DAY));
}

function cohortIdFor(customer) {
  if (customer && typeof customer.cohortId === 'string' && customer.cohortId.length > 0) {
    return customer.cohortId;
  }
  const acquired = toDate(customer && customer.acquisitionDate);
  const segment = (customer && customer.segment) || 'default';
  if (!acquired) return `unknown_${segment}`;
  const y = acquired.getUTCFullYear();
  const q = Math.floor(acquired.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}_${segment}`;
}

function bilingualLabel(heText, enText) {
  return { he: heText, en: enText, bi: `${heText} / ${enText}` };
}

// ─── LTVCalculator ─────────────────────────────────────────────

class LTVCalculator {
  /**
   * @param {object} [options]
   * @param {object} [options.wacc]         — override DEFAULT_WACC fields
   * @param {string} [options.period]       — 'month' | 'quarter' | 'year'
   * @param {number} [options.projectedPeriods] — horizon for predictive & discounted
   * @param {number} [options.defaultChurnRate]  — fallback when cohort is thin
   */
  constructor(options = {}) {
    this.options = {
      period: 'year',
      projectedPeriods: 5,
      defaultChurnRate: 0.15,
      ...options,
      wacc: { ...DEFAULT_WACC, ...(options.wacc || {}) },
    };
    if (!DAYS_PER_PERIOD[this.options.period]) {
      throw new Error(
        `LTVCalculator: unknown period "${this.options.period}". Use month|quarter|year.`
      );
    }
  }

  // ─── method 1: historical ──────────────────────────────────

  /**
   * Sum of realised gross margin. Deterministic, never projects
   * forward. Optionally returns diagnostics.
   *
   * @param {object} customer
   * @returns {{
   *   method: 'historical',
   *   customerId: string,
   *   totalRevenue: number,
   *   totalCost: number,
   *   totalMargin: number,
   *   transactionCount: number,
   *   firstDate: string|null,
   *   lastDate: string|null,
   *   lifespanDays: number,
   *   avgMarginPerPeriod: number,
   *   value: number,                // == totalMargin, alias for API parity
   *   label: { he, en, bi },
   * }}
   */
  historicalLTV(customer) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('historicalLTV: customer must be an object');
    }
    const txs = sortedTransactions(customer);
    const totalRevenue = txs.reduce((s, t) => s + (Number(t.revenue) || 0), 0);
    const totalCost = txs.reduce((s, t) => s + (Number(t.cost) || 0), 0);
    const totalMargin = txs.reduce((s, t) => s + marginOf(t), 0);
    const lifespanDays = customerLifespanDays(customer);
    const periodsElapsed = lifespanDays / DAYS_PER_PERIOD[this.options.period];
    const avgMarginPerPeriod = periodsElapsed > 0 ? totalMargin / periodsElapsed : totalMargin;

    return {
      method: 'historical',
      customerId: customer.id || null,
      totalRevenue: round(totalRevenue),
      totalCost: round(totalCost),
      totalMargin: round(totalMargin),
      transactionCount: txs.length,
      firstDate: txs.length ? toDate(txs[0].date).toISOString() : null,
      lastDate: txs.length ? toDate(txs[txs.length - 1].date).toISOString() : null,
      lifespanDays,
      avgMarginPerPeriod: round(avgMarginPerPeriod),
      value: round(totalMargin),
      label: bilingualLabel('LTV היסטורי', 'Historical LTV'),
    };
  }

  // ─── method 2: predictive (cohort) ─────────────────────────

  /**
   * Cohort-based LTV:
   *
   *   LTV = (avgMarginPerPeriod / churnRate) * (1 - (1 - churnRate)^N)
   *
   * This is the classic constant-churn geometric formula, bounded
   * to N projected periods so it never runs to infinity.
   *
   * Cohort churn rate can be supplied two ways:
   *   a) options.cohortChurnRate is a number → use it directly
   *   b) options.cohort is an array of customers → compute from it
   *
   * Falls back to options.defaultChurnRate if both are missing.
   *
   * @param {object} customer
   * @param {object} [opts]
   * @param {number} [opts.cohortChurnRate]
   * @param {object[]} [opts.cohort]
   * @param {number} [opts.projectedPeriods]
   */
  predictiveLTV(customer, opts = {}) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('predictiveLTV: customer must be an object');
    }
    const hist = this.historicalLTV(customer);
    const avgMargin = hist.avgMarginPerPeriod;

    let churnRate;
    if (isPositiveNumber(opts.cohortChurnRate)) {
      churnRate = opts.cohortChurnRate;
    } else if (Array.isArray(opts.cohort) && opts.cohort.length > 0) {
      churnRate = this.cohortChurnRate(opts.cohort, customer);
    } else {
      churnRate = this.options.defaultChurnRate;
    }
    // hard-clip to a sane window
    if (!Number.isFinite(churnRate) || churnRate <= 0) churnRate = this.options.defaultChurnRate;
    if (churnRate > 0.95) churnRate = 0.95;

    const N = isPositiveNumber(opts.projectedPeriods)
      ? opts.projectedPeriods
      : this.options.projectedPeriods;

    // bounded geometric sum — see docstring
    const retention = 1 - churnRate;
    const bounded = avgMargin * (retention === 0 ? 1 : (1 - Math.pow(retention, N)) / churnRate);

    // expected remaining lifetime in chosen period, capped at N
    const expectedLifetime = Math.min(N, churnRate > 0 ? 1 / churnRate : N);

    return {
      method: 'predictive',
      customerId: customer.id || null,
      cohortId: cohortIdFor(customer),
      avgMarginPerPeriod: round(avgMargin),
      cohortChurnRate: round(churnRate, 4),
      projectedPeriods: N,
      expectedLifetimePeriods: round(expectedLifetime, 2),
      period: this.options.period,
      value: round(bounded),
      label: bilingualLabel('LTV חיזויי (cohort)', 'Predictive LTV (cohort)'),
    };
  }

  /**
   * Compute churn rate for a cohort as (churned / total) across
   * customers in the same cohortId as the reference customer (if
   * provided), else across the entire supplied list.
   *
   * @param {object[]} cohort
   * @param {object} [reference]
   * @returns {number} 0..1
   */
  cohortChurnRate(cohort, reference) {
    if (!Array.isArray(cohort) || cohort.length === 0) {
      return this.options.defaultChurnRate;
    }
    const refId = reference ? cohortIdFor(reference) : null;
    const peers = refId
      ? cohort.filter((c) => cohortIdFor(c) === refId)
      : cohort.slice();
    if (peers.length === 0) return this.options.defaultChurnRate;
    const churned = peers.filter((c) => c && c.churned === true).length;
    return churned / peers.length;
  }

  // ─── method 3: discounted (DCF) ────────────────────────────

  /**
   * Weighted Average Cost of Capital.
   *
   *   WACC = (E/V) * Re + (D/V) * Rd * (1 - t)
   *
   *   Re  = Rf + β * ERP + sizePremium
   *
   * Where Rf is the Israeli 10-year government bond yield.
   *
   * @param {object} [overrides]
   * @returns {number}
   */
  computeWACC(overrides = {}) {
    const w = { ...this.options.wacc, ...overrides };
    const costOfEquity = w.riskFreeRate + w.beta * w.equityRiskPremium + w.sizePremium;
    const equityWeight = 1 - w.debtWeight;
    const wacc = equityWeight * costOfEquity + w.debtWeight * w.costOfDebt * (1 - w.taxShield);
    return round(wacc, 6);
  }

  /**
   * DCF LTV:
   *    value = Σ CF_t / (1+wacc)^t   for t=1..N
   * where CF_t is the projected per-period margin times retention.
   *
   * If no predictive rate is supplied, defaults are the same as
   * predictiveLTV (cohort → defaultChurnRate).
   *
   * @param {object} customer
   * @param {object} [opts]
   */
  discountedLTV(customer, opts = {}) {
    if (!customer || typeof customer !== 'object') {
      throw new TypeError('discountedLTV: customer must be an object');
    }
    const pred = this.predictiveLTV(customer, opts);
    const wacc = this.computeWACC(opts.waccOverrides || {});
    const avg = pred.avgMarginPerPeriod;
    const churn = pred.cohortChurnRate;
    const N = pred.projectedPeriods;

    // periodise discount: if period=year, wacc is already yearly;
    // otherwise pro-rate so month/quarter makes sense.
    const periodFraction =
      DAYS_PER_PERIOD[this.options.period] / DAYS_PER_PERIOD.year;
    const periodicWacc = Math.pow(1 + wacc, periodFraction) - 1;

    const retention = 1 - churn;
    let pv = 0;
    const perPeriod = [];
    for (let t = 1; t <= N; t += 1) {
      const cashflow = avg * Math.pow(retention, t - 1);
      const discounted = cashflow / Math.pow(1 + periodicWacc, t);
      pv += discounted;
      perPeriod.push({ period: t, cashflow: round(cashflow), discounted: round(discounted) });
    }

    return {
      method: 'discounted',
      customerId: customer.id || null,
      wacc: round(wacc, 4),
      periodicWacc: round(periodicWacc, 4),
      period: this.options.period,
      projectedPeriods: N,
      churnRate: round(churn, 4),
      avgMarginPerPeriod: round(avg),
      perPeriod,
      value: round(pv),
      label: bilingualLabel('LTV מהוון (DCF)', 'Discounted LTV (DCF)'),
    };
  }

  // ─── aggregation: segment level ────────────────────────────

  /**
   * Roll up LTV per segment. For each unique segment key, the
   * function emits count, totalHistorical, totalPredictive,
   * totalDiscounted, plus averages.
   *
   * @param {object[]} customers
   * @param {string} [key='segment']
   */
  segmentLTV(customers, key = 'segment') {
    if (!Array.isArray(customers)) return [];
    const buckets = new Map();

    for (const c of customers) {
      if (!c) continue;
      const k = (c[key] !== undefined && c[key] !== null ? String(c[key]) : 'unknown');
      if (!buckets.has(k)) {
        buckets.set(k, {
          segment: k,
          count: 0,
          customerIds: [],
          totalHistorical: 0,
          totalPredictive: 0,
          totalDiscounted: 0,
          totalCAC: 0,
        });
      }
      const b = buckets.get(k);
      b.count += 1;
      b.customerIds.push(c.id || null);
      b.totalHistorical += this.historicalLTV(c).value;
      // use this segment as the cohort for predictive / dcf
      const cohort = customers.filter((x) => x && String(x[key] || 'unknown') === k);
      b.totalPredictive += this.predictiveLTV(c, { cohort }).value;
      b.totalDiscounted += this.discountedLTV(c, { cohort }).value;
      b.totalCAC += Number(c.acquisitionCost) || 0;
    }

    const out = [];
    for (const b of buckets.values()) {
      const avgHistorical = b.count > 0 ? b.totalHistorical / b.count : 0;
      const avgPredictive = b.count > 0 ? b.totalPredictive / b.count : 0;
      const avgDiscounted = b.count > 0 ? b.totalDiscounted / b.count : 0;
      const avgCAC = b.count > 0 ? b.totalCAC / b.count : 0;
      out.push({
        segment: b.segment,
        count: b.count,
        customerIds: b.customerIds,
        totalHistorical: round(b.totalHistorical),
        totalPredictive: round(b.totalPredictive),
        totalDiscounted: round(b.totalDiscounted),
        avgHistorical: round(avgHistorical),
        avgPredictive: round(avgPredictive),
        avgDiscounted: round(avgDiscounted),
        avgCAC: round(avgCAC),
        ltvCacRatio: avgCAC > 0 ? round(avgPredictive / avgCAC, 2) : null,
        label: bilingualLabel(`מקטע: ${b.segment}`, `Segment: ${b.segment}`),
      });
    }
    out.sort((a, b) => b.totalPredictive - a.totalPredictive);
    return out;
  }

  // ─── LTV / CAC ratio ──────────────────────────────────────

  /**
   * @param {number|object} ltvOrResult — plain number or LTV result obj
   * @param {number} cac
   * @returns {{ ratio: number|null, ltv: number, cac: number, health: object }}
   */
  ltvCacRatio(ltvOrResult, cac) {
    const ltvValue =
      typeof ltvOrResult === 'number'
        ? ltvOrResult
        : ltvOrResult && typeof ltvOrResult.value === 'number'
          ? ltvOrResult.value
          : 0;
    if (!isPositiveNumber(cac)) {
      return {
        ratio: null,
        ltv: round(ltvValue),
        cac: round(Number(cac) || 0),
        health: {
          band: 'unknown',
          he: 'לא ידוע',
          en: 'unknown',
          description: {
            he: 'CAC חסר או אפס — לא ניתן לחשב יחס',
            en: 'CAC missing or zero — cannot compute ratio',
          },
        },
      };
    }
    const ratio = ltvValue / cac;
    return {
      ratio: round(ratio, 2),
      ltv: round(ltvValue),
      cac: round(cac),
      health: this.healthBand(ratio),
    };
  }

  /**
   * Classification into the product-defined bands.
   *
   *   ratio <  1  → bad
   *   1 ≤ r < 3   → ok
   *   r ≥ 3       → good
   *
   * @param {number} ratio
   */
  healthBand(ratio) {
    let band;
    if (!Number.isFinite(ratio) || ratio < 1) band = 'bad';
    else if (ratio < 3) band = 'ok';
    else band = 'good';
    const b = HEALTH_BANDS[band];
    return {
      band,
      he: b.he,
      en: b.en,
      description: b.description,
      ratio: Number.isFinite(ratio) ? round(ratio, 2) : null,
    };
  }

  // ─── full summary ──────────────────────────────────────────

  /**
   * One-shot bilingual summary suitable for a dashboard or export.
   *
   * @param {object[]} customers
   * @param {object} [opts]
   */
  summary(customers, opts = {}) {
    if (!Array.isArray(customers)) {
      throw new TypeError('summary: customers must be an array');
    }
    const perCustomer = customers.filter(Boolean).map((c) => {
      const h = this.historicalLTV(c);
      const p = this.predictiveLTV(c, { cohort: customers });
      const d = this.discountedLTV(c, { cohort: customers });
      const cac = Number(c.acquisitionCost) || 0;
      const ratio = this.ltvCacRatio(p, cac);
      return {
        customerId: c.id || null,
        name: c.name || null,
        segment: c.segment || null,
        cohortId: cohortIdFor(c),
        historical: h,
        predictive: p,
        discounted: d,
        cac: round(cac),
        ltvCac: ratio,
      };
    });

    const segments = this.segmentLTV(customers, opts.segmentKey || 'segment');
    const totals = perCustomer.reduce(
      (acc, r) => {
        acc.historical += r.historical.value;
        acc.predictive += r.predictive.value;
        acc.discounted += r.discounted.value;
        acc.cac += r.cac;
        return acc;
      },
      { historical: 0, predictive: 0, discounted: 0, cac: 0 }
    );
    const avgRatio =
      totals.cac > 0 ? totals.predictive / totals.cac : null;

    return {
      generatedAt: null, // deterministic — caller stamps if desired
      currency: 'ILS',
      locale: { primary: 'he-IL', secondary: 'en-US' },
      title: bilingualLabel(
        'סיכום ערך חיי לקוח',
        'Customer Lifetime Value Summary'
      ),
      wacc: this.computeWACC(),
      period: this.options.period,
      projectedPeriods: this.options.projectedPeriods,
      totals: {
        customers: perCustomer.length,
        historical: round(totals.historical),
        predictive: round(totals.predictive),
        discounted: round(totals.discounted),
        cac: round(totals.cac),
        avgLtvCac: avgRatio === null ? null : round(avgRatio, 2),
        health: avgRatio === null ? this.healthBand(NaN) : this.healthBand(avgRatio),
      },
      segments,
      customers: perCustomer,
    };
  }
}

// ─── exports ───────────────────────────────────────────────────

module.exports = {
  LTVCalculator,
  DEFAULT_WACC,
  HEALTH_BANDS,
  DAYS_PER_PERIOD,
  // test hooks (not public API):
  _internals: {
    toDate,
    round,
    marginOf,
    sortedTransactions,
    customerLifespanDays,
    cohortIdFor,
    bilingualLabel,
  },
};
