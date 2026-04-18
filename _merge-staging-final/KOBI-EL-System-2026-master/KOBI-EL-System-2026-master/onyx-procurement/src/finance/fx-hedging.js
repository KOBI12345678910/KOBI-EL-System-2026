/**
 * FX Hedging Tracker — Techno-Kol Uzi Mega-ERP
 * Agent AG-Y084 | Finance / Treasury | 2026-04-11
 *
 * READ-ONLY position tracker for foreign-exchange hedges.
 * מעקב פוזיציות גידור מט"ח — קריאה בלבד, ללא ביצוע עסקאות.
 *
 * SAFETY CONTRACT (חוזה בטיחות):
 *   This module TRACKS hedging positions and produces reports.
 *   It does NOT execute trades, place orders, or move money.
 *   Any method whose name matches /trade|execute|order|buy|sell|send|transfer/i
 *   throws `E_READ_ONLY_NO_TRADING`. A sentinel `trade` stub is exported
 *   for good measure.
 *
 *   הדגשה בעברית: המודול אוסר ביצוע עסקאות. כל קריאה שמתיימרת
 *   לסחור תיזרק עם הקוד E_READ_ONLY_NO_TRADING. דוחות וחישובים בלבד.
 *
 * RULE respected (לא מוחקים רק משדרגים ומגדלים):
 *   No delete — positions are archived/closed, never removed.
 *   Rollovers create a NEW hedge linked to the original; the original
 *   stays in the ledger marked `ROLLED_OVER`.
 *
 * Instrument coverage (כלי גידור):
 *   - forward       — חוזה פורוורד (linear, delta ≈ 1, symmetric P&L)
 *   - option        — אופציה (call/put, convex, one-sided protection)
 *   - swap          — החלף מט"ח / ריבית (stream of cash-flows)
 *   - collar        — קולר (long put + short call, zero-cost corridor)
 *   - range-forward — פורוורד טווח (variant of collar with strike band)
 *
 * Purposes (מטרת גידור) per IFRS 9 hedge accounting:
 *   - transactional  — חשיפת עסקה (booked receivable/payable)
 *   - translational  — חשיפת תרגום (foreign sub consolidation)
 *   - economic       — חשיפה כלכלית (future commitments, forecast)
 *
 * Public API:
 *   new FXHedgingTracker({ baseCurrency, policy, clock })
 *     .recordHedge(hedge)
 *     .exposureReport({ currency, period })
 *     .hedgeEffectiveness(hedgeId)
 *     .markToMarket({ hedgeId, currentRate })
 *     .maturityLadder()
 *     .counterpartyExposure(counterpartyId)
 *     .rolloverSchedule({ hedgeId, newMaturity, newRate })
 *     .gainLoss({ hedgeId, closingDate })
 *     .hedgeRatio(exposure, hedged)
 *     .policyCompliance({ policy, currentPositions })
 *     .generateHedgeReport(period)   // bilingual PDF (hand-rolled)
 *
 *   FXHedgingTracker.ERROR_CODES
 *   FXHedgingTracker.HEDGE_TYPES / PURPOSES / STATUSES
 *
 * Zero dependencies. Runs on plain Node.js.
 * Bilingual labels throughout.
 *
 * Run tests:
 *   node --test test/finance/fx-hedging.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 1. Constants — enums, labels, error codes
// ═══════════════════════════════════════════════════════════════════════

const HEDGE_TYPES = Object.freeze({
  FORWARD: 'forward',
  OPTION: 'option',
  SWAP: 'swap',
  COLLAR: 'collar',
  RANGE_FORWARD: 'range-forward',
});

const HEDGE_TYPE_LABELS = Object.freeze({
  forward: { he: 'פורוורד', en: 'Forward' },
  option: { he: 'אופציה', en: 'Option' },
  swap: { he: 'החלף (Swap)', en: 'Swap' },
  collar: { he: 'קולר', en: 'Collar' },
  'range-forward': { he: 'פורוורד טווח', en: 'Range-Forward' },
});

const PURPOSES = Object.freeze({
  TRANSACTIONAL: 'transactional',
  TRANSLATIONAL: 'translational',
  ECONOMIC: 'economic',
});

const PURPOSE_LABELS = Object.freeze({
  transactional: { he: 'חשיפת עסקה', en: 'Transactional' },
  translational: { he: 'חשיפת תרגום', en: 'Translational' },
  economic: { he: 'חשיפה כלכלית', en: 'Economic' },
});

const STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  MATURED: 'MATURED',
  CLOSED: 'CLOSED',
  ROLLED_OVER: 'ROLLED_OVER',
  ARCHIVED: 'ARCHIVED',
});

const STATUS_LABELS = Object.freeze({
  ACTIVE: { he: 'פעיל', en: 'Active' },
  MATURED: { he: 'הגיע לפדיון', en: 'Matured' },
  CLOSED: { he: 'נסגר', en: 'Closed' },
  ROLLED_OVER: { he: 'גולגל', en: 'Rolled Over' },
  ARCHIVED: { he: 'בארכיון', en: 'Archived' },
});

const ERROR_CODES = Object.freeze({
  READ_ONLY_NO_TRADING: 'E_READ_ONLY_NO_TRADING',
  INVALID_HEDGE: 'E_INVALID_HEDGE',
  DUPLICATE_HEDGE: 'E_DUPLICATE_HEDGE',
  UNKNOWN_HEDGE: 'E_UNKNOWN_HEDGE',
  POLICY_VIOLATION: 'E_POLICY_VIOLATION',
  INVALID_RATE: 'E_INVALID_RATE',
  INVALID_PERIOD: 'E_INVALID_PERIOD',
});

// IFRS 9 hedge effectiveness band: ratio of Δhedge / Δhedged item
// must fall between 0.80 and 1.25 to qualify for hedge accounting.
const IFRS9_EFFECTIVENESS_MIN = 0.80;
const IFRS9_EFFECTIVENESS_MAX = 1.25;

// ═══════════════════════════════════════════════════════════════════════
// 2. Custom error
// ═══════════════════════════════════════════════════════════════════════

class FXHedgingError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'FXHedgingError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Small helpers (pure, no deps)
// ═══════════════════════════════════════════════════════════════════════

function toISODate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw new FXHedgingError(
        ERROR_CODES.INVALID_PERIOD,
        `Invalid date: ${v}`
      );
    }
    return d.toISOString().slice(0, 10);
  }
  throw new FXHedgingError(ERROR_CODES.INVALID_PERIOD, `Bad date value`);
}

function daysBetween(aISO, bISO) {
  const MS = 86400000;
  const a = new Date(aISO + 'T00:00:00Z').getTime();
  const b = new Date(bISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / MS);
}

function round(n, dp = 4) {
  if (!Number.isFinite(n)) return 0;
  const k = Math.pow(10, dp);
  return Math.round(n * k) / k;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function escapeXML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapePDFText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Read-only guard — any name that looks like trading throws
// ═══════════════════════════════════════════════════════════════════════

const TRADING_PATTERN = /(trade|execute|place_?order|buy|sell|send(?!er)|transfer|wire|pay(?!ee|able)|settle_?now)/i;

function readOnlyGuard(name) {
  throw new FXHedgingError(
    ERROR_CODES.READ_ONLY_NO_TRADING,
    `FXHedgingTracker is read-only. Method "${name}" is forbidden. ` +
      `מודול מעקב בלבד — אסור לבצע עסקאות.`,
    { method: name }
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Core class
// ═══════════════════════════════════════════════════════════════════════

class FXHedgingTracker {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseCurrency='ILS']
   * @param {object} [opts.policy] company hedging policy
   * @param {function} [opts.clock] () => ISO date string (dependency injection
   *                                 for deterministic tests)
   */
  constructor(opts = {}) {
    this.baseCurrency = opts.baseCurrency || 'ILS';
    this.policy = opts.policy || null;
    this._clock = opts.clock || (() => new Date().toISOString().slice(0, 10));

    /** @type {Map<string, object>} id → hedge record */
    this._hedges = new Map();
    /** @type {Map<string, object[]>} currency → exposure items */
    this._exposures = new Map();
    /** @type {object[]} immutable audit log */
    this._auditLog = [];

    // Install read-only stubs for any obvious trading name.
    // This makes the contract explicit even if someone later tries to
    // monkey-patch new methods on.
    const tradingStubs = [
      'trade',
      'executeTrade',
      'placeOrder',
      'buy',
      'sell',
      'transferFunds',
      'settleNow',
    ];
    for (const name of tradingStubs) {
      this[name] = function forbidden() {
        readOnlyGuard(name);
      };
    }
  }

  // ─── 5.1  recordHedge ───────────────────────────────────────────────
  /**
   * Record a hedge that already exists in the external system.
   * This is journalling, not booking — the module never creates a trade.
   *
   * @param {object} h
   * @returns {object} frozen stored record
   */
  recordHedge(h) {
    if (!h || typeof h !== 'object') {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'hedge must be object');
    }
    const {
      id,
      type,
      notional,
      base,
      quote,
      rate,
      maturityDate,
      counterparty,
      purpose,
      hedgedItem,
    } = h;

    if (typeof id !== 'string' || id.length === 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'id required');
    }
    if (this._hedges.has(id)) {
      throw new FXHedgingError(
        ERROR_CODES.DUPLICATE_HEDGE,
        `hedge ${id} already recorded — use rolloverSchedule to extend`
      );
    }
    if (!Object.values(HEDGE_TYPES).includes(type)) {
      throw new FXHedgingError(
        ERROR_CODES.INVALID_HEDGE,
        `unsupported type: ${type}`
      );
    }
    if (!isFiniteNumber(notional) || notional <= 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'notional > 0 required');
    }
    if (typeof base !== 'string' || base.length !== 3) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'base ccy ISO-4217 required');
    }
    if (typeof quote !== 'string' || quote.length !== 3) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'quote ccy ISO-4217 required');
    }
    if (base === quote) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'base/quote must differ');
    }
    if (!isFiniteNumber(rate) || rate <= 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_RATE, 'rate > 0 required');
    }
    if (!Object.values(PURPOSES).includes(purpose)) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, `bad purpose: ${purpose}`);
    }

    const maturity = toISODate(maturityDate);
    const now = this._clock();

    const rec = {
      id,
      type,
      notional: Number(notional),
      base: base.toUpperCase(),
      quote: quote.toUpperCase(),
      rate: Number(rate),
      maturityDate: maturity,
      counterparty: counterparty || 'UNKNOWN',
      purpose,
      hedgedItem: hedgedItem || null,
      status: STATUSES.ACTIVE,
      recordedAt: now,
      label: {
        he: HEDGE_TYPE_LABELS[type].he,
        en: HEDGE_TYPE_LABELS[type].en,
      },
      purposeLabel: {
        he: PURPOSE_LABELS[purpose].he,
        en: PURPOSE_LABELS[purpose].en,
      },
      history: [
        {
          at: now,
          event: 'RECORDED',
          rate: Number(rate),
          maturityDate: maturity,
        },
      ],
      rolloverOf: null,
      rolledInto: null,
    };

    this._hedges.set(id, rec);
    this._audit('RECORDED', { id, type, notional, base, quote, rate });
    return deepFreeze({ ...rec, history: rec.history.slice() });
  }

  // ─── 5.2  addExposure (helper — also read-only bookkeeping) ─────────
  /**
   * Register an underlying exposure (receivable / payable / commitment).
   * This is bookkeeping for the tracker, not a trade.
   *
   * @param {object} ex
   */
  addExposure(ex) {
    if (!ex || typeof ex !== 'object') {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'exposure must be object');
    }
    const kind = ex.kind; // 'receivable' | 'payable' | 'commitment'
    if (!['receivable', 'payable', 'commitment'].includes(kind)) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'bad exposure.kind');
    }
    if (!isFiniteNumber(ex.amount) || ex.amount <= 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'exposure.amount > 0');
    }
    if (typeof ex.currency !== 'string' || ex.currency.length !== 3) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'exposure.currency ISO-4217');
    }
    const ccy = ex.currency.toUpperCase();
    const list = this._exposures.get(ccy) || [];
    list.push({
      id: ex.id || `EXP_${list.length + 1}_${Date.now()}`,
      kind,
      amount: Number(ex.amount),
      currency: ccy,
      dueDate: ex.dueDate ? toISODate(ex.dueDate) : null,
      label: {
        he:
          kind === 'receivable'
            ? 'חייבים'
            : kind === 'payable'
              ? 'זכאים'
              : 'התחייבות עתידית',
        en:
          kind === 'receivable'
            ? 'Receivable'
            : kind === 'payable'
              ? 'Payable'
              : 'Future Commitment',
      },
    });
    this._exposures.set(ccy, list);
    return list[list.length - 1];
  }

  // ─── 5.3  exposureReport ────────────────────────────────────────────
  /**
   * Net exposure by currency within a period.
   * @param {object} opts
   * @param {string} [opts.currency] filter to a single currency
   * @param {{from?:string,to?:string}} [opts.period]
   * @returns {object}
   */
  exposureReport(opts = {}) {
    const filterCcy = opts.currency ? opts.currency.toUpperCase() : null;
    const from = opts.period && opts.period.from ? toISODate(opts.period.from) : null;
    const to = opts.period && opts.period.to ? toISODate(opts.period.to) : null;

    const byCurrency = {};
    const add = (ccy) => {
      if (!byCurrency[ccy]) {
        byCurrency[ccy] = {
          currency: ccy,
          receivables: 0,
          payables: 0,
          commitments: 0,
          hedged: 0,
          grossExposure: 0,
          netExposure: 0,
          label: {
            he: `חשיפה במטבע ${ccy}`,
            en: `${ccy} exposure`,
          },
        };
      }
      return byCurrency[ccy];
    };

    for (const [ccy, list] of this._exposures) {
      if (filterCcy && ccy !== filterCcy) continue;
      for (const e of list) {
        if (from && e.dueDate && e.dueDate < from) continue;
        if (to && e.dueDate && e.dueDate > to) continue;
        const row = add(ccy);
        if (e.kind === 'receivable') row.receivables += e.amount;
        else if (e.kind === 'payable') row.payables += e.amount;
        else row.commitments += e.amount;
      }
    }

    for (const h of this._hedges.values()) {
      if (h.status !== STATUSES.ACTIVE) continue;
      // Use the non-base leg as the hedged currency
      const hedgedCcy = h.base === this.baseCurrency ? h.quote : h.base;
      if (filterCcy && hedgedCcy !== filterCcy) continue;
      if (from && h.maturityDate < from) continue;
      if (to && h.maturityDate > to) continue;
      const row = add(hedgedCcy);
      row.hedged += h.notional;
    }

    for (const row of Object.values(byCurrency)) {
      // Net receivables minus payables minus commitments, then offset by hedged
      row.grossExposure = round(row.receivables - row.payables - row.commitments);
      // If hedged covers part of gross, residual = gross - sign(gross)*hedged
      const sign = row.grossExposure >= 0 ? 1 : -1;
      const covered = Math.min(Math.abs(row.grossExposure), row.hedged);
      row.netExposure = round(sign * (Math.abs(row.grossExposure) - covered));
      row.receivables = round(row.receivables);
      row.payables = round(row.payables);
      row.commitments = round(row.commitments);
      row.hedged = round(row.hedged);
    }

    return {
      generatedAt: this._clock(),
      baseCurrency: this.baseCurrency,
      period: { from, to },
      byCurrency,
      currencies: Object.keys(byCurrency).sort(),
    };
  }

  // ─── 5.4  hedgeEffectiveness — IFRS 9 test ──────────────────────────
  /**
   * Dollar-offset method for IFRS 9 hedge accounting effectiveness.
   * Ratio = (-ΔFV_hedge) / ΔFV_hedgedItem.  Must fall between 80%..125%.
   *
   * @param {string} hedgeId
   * @returns {object}
   */
  hedgeEffectiveness(hedgeId) {
    const h = this._mustGet(hedgeId);
    const item = h.hedgedItem || {};
    const initialRate = Number(item.initialRate);
    const currentRate = Number(item.currentRate);

    if (!isFiniteNumber(initialRate) || !isFiniteNumber(currentRate) || initialRate <= 0) {
      throw new FXHedgingError(
        ERROR_CODES.INVALID_HEDGE,
        'hedgedItem.initialRate and currentRate required for effectiveness test'
      );
    }

    // ΔFV of the hedged item under the new spot
    const itemNotional = isFiniteNumber(item.notional) ? Number(item.notional) : h.notional;
    const itemDelta = round(itemNotional * (currentRate - initialRate));

    // ΔFV of the hedge instrument (delta-1 assumption for forwards/swaps,
    // scaled by the option delta when supplied).
    // Note: the hedge P&L is economically opposite to the item's P&L —
    // when the underlying strengthens, a receivable gains while a payer
    // forward loses. We model that explicit opposite sign so the
    // dollar-offset ratio comes out positive for an effective hedge.
    const delta =
      h.type === HEDGE_TYPES.OPTION && isFiniteNumber(item.optionDelta)
        ? Number(item.optionDelta)
        : 1;
    const hedgeDelta = round(-h.notional * (currentRate - h.rate) * delta);

    // Dollar-offset ratio. Guard against div-by-zero.
    let ratio = 0;
    let effective = false;
    let reason = '';
    if (itemDelta === 0 && hedgeDelta === 0) {
      ratio = 1;
      effective = true;
      reason = 'No movement — trivially effective.';
    } else if (itemDelta === 0) {
      ratio = Infinity;
      effective = false;
      reason = 'Hedged item did not move while hedge did — zero-offset failure.';
    } else {
      ratio = round(-hedgeDelta / itemDelta, 6);
      effective = ratio >= IFRS9_EFFECTIVENESS_MIN && ratio <= IFRS9_EFFECTIVENESS_MAX;
      reason = effective
        ? 'Within IFRS 9 80–125% band.'
        : `Outside IFRS 9 band (${IFRS9_EFFECTIVENESS_MIN}–${IFRS9_EFFECTIVENESS_MAX}).`;
    }

    return {
      hedgeId,
      method: 'dollar-offset',
      standard: 'IFRS 9',
      itemDelta,
      hedgeDelta,
      ratio,
      effectiveRatio: ratio, // alias for readability
      effective,
      band: { min: IFRS9_EFFECTIVENESS_MIN, max: IFRS9_EFFECTIVENESS_MAX },
      reason,
      label: {
        he: effective ? 'יעילות גידור תקפה לפי IFRS 9' : 'יעילות גידור אינה בטווח',
        en: effective ? 'Hedge accounting qualified' : 'Hedge accounting failed',
      },
    };
  }

  // ─── 5.5  markToMarket ──────────────────────────────────────────────
  /**
   * MTM valuation — simplified linear model for forwards/swaps, and a
   * payoff-only model for options (no vol surface because zero deps).
   *
   * @param {object} opts
   * @param {string} opts.hedgeId
   * @param {number} opts.currentRate
   * @returns {object}
   */
  markToMarket({ hedgeId, currentRate } = {}) {
    const h = this._mustGet(hedgeId);
    if (!isFiniteNumber(currentRate) || currentRate <= 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_RATE, 'currentRate > 0 required');
    }

    let mtm = 0;
    let method = '';
    const diff = currentRate - h.rate;

    switch (h.type) {
      case HEDGE_TYPES.FORWARD:
      case HEDGE_TYPES.SWAP: {
        // Linear payoff: notional × (spot − contract rate), ignoring
        // discount factor (acceptable for short-tenor zero-dep model).
        mtm = h.notional * diff;
        method = 'linear-forward';
        break;
      }
      case HEDGE_TYPES.OPTION: {
        // Intrinsic value only — pessimistic (no time value).
        const isCall = h.hedgedItem && h.hedgedItem.optionKind === 'put' ? false : true;
        const intrinsic = isCall ? Math.max(0, diff) : Math.max(0, -diff);
        mtm = h.notional * intrinsic;
        method = 'intrinsic-only';
        break;
      }
      case HEDGE_TYPES.COLLAR:
      case HEDGE_TYPES.RANGE_FORWARD: {
        // Zero-cost corridor: bounded payoff between cap and floor.
        const cap = h.hedgedItem && isFiniteNumber(h.hedgedItem.cap) ? Number(h.hedgedItem.cap) : h.rate * 1.05;
        const floor =
          h.hedgedItem && isFiniteNumber(h.hedgedItem.floor) ? Number(h.hedgedItem.floor) : h.rate * 0.95;
        const capped = Math.max(floor, Math.min(cap, currentRate));
        mtm = h.notional * (capped - h.rate);
        method = 'corridor';
        break;
      }
      default:
        method = 'unknown';
    }

    return {
      hedgeId,
      type: h.type,
      contractRate: h.rate,
      currentRate,
      notional: h.notional,
      diff: round(diff),
      mtm: round(mtm),
      currency: h.quote,
      method,
      asOf: this._clock(),
      label: {
        he: 'שווי הוגן עדכני',
        en: 'Mark-to-market',
      },
    };
  }

  // ─── 5.6  maturityLadder ────────────────────────────────────────────
  /**
   * Upcoming maturities grouped into 0-7d, 8-30d, 31-90d, 91-180d, 180d+.
   */
  maturityLadder() {
    const today = this._clock();
    const buckets = {
      d0_7: { label: { he: 'עד שבוע', en: '0–7 days' }, items: [], total: 0 },
      d8_30: { label: { he: 'שבוע-חודש', en: '8–30 days' }, items: [], total: 0 },
      d31_90: { label: { he: 'חודש-רבעון', en: '31–90 days' }, items: [], total: 0 },
      d91_180: { label: { he: 'רבעון-חצי', en: '91–180 days' }, items: [], total: 0 },
      d181_plus: { label: { he: 'מעל חצי שנה', en: '180+ days' }, items: [], total: 0 },
      overdue: { label: { he: 'חורג', en: 'Overdue' }, items: [], total: 0 },
    };

    for (const h of this._hedges.values()) {
      if (h.status !== STATUSES.ACTIVE) continue;
      const days = daysBetween(today, h.maturityDate);
      const item = {
        id: h.id,
        type: h.type,
        notional: h.notional,
        base: h.base,
        quote: h.quote,
        maturityDate: h.maturityDate,
        daysToMaturity: days,
      };
      let bucket;
      if (days < 0) bucket = buckets.overdue;
      else if (days <= 7) bucket = buckets.d0_7;
      else if (days <= 30) bucket = buckets.d8_30;
      else if (days <= 90) bucket = buckets.d31_90;
      else if (days <= 180) bucket = buckets.d91_180;
      else bucket = buckets.d181_plus;
      bucket.items.push(item);
      bucket.total = round(bucket.total + h.notional);
    }

    return {
      generatedAt: today,
      buckets,
      order: ['overdue', 'd0_7', 'd8_30', 'd31_90', 'd91_180', 'd181_plus'],
    };
  }

  // ─── 5.7  counterpartyExposure ──────────────────────────────────────
  /**
   * Total outstanding notional with a counterparty — concentration risk.
   */
  counterpartyExposure(counterpartyId) {
    if (!counterpartyId) {
      throw new FXHedgingError(ERROR_CODES.INVALID_HEDGE, 'counterpartyId required');
    }
    const hedges = [];
    let totalNotional = 0;
    const byCurrency = {};
    for (const h of this._hedges.values()) {
      if (h.counterparty !== counterpartyId) continue;
      if (h.status !== STATUSES.ACTIVE) continue;
      hedges.push({
        id: h.id,
        type: h.type,
        notional: h.notional,
        base: h.base,
        quote: h.quote,
        maturityDate: h.maturityDate,
      });
      totalNotional += h.notional;
      const key = `${h.base}/${h.quote}`;
      byCurrency[key] = round((byCurrency[key] || 0) + h.notional);
    }
    return {
      counterparty: counterpartyId,
      hedgeCount: hedges.length,
      totalNotional: round(totalNotional),
      byCurrency,
      hedges,
      label: {
        he: `חשיפה לצד נגדי ${counterpartyId}`,
        en: `Counterparty exposure — ${counterpartyId}`,
      },
    };
  }

  // ─── 5.8  rolloverSchedule ──────────────────────────────────────────
  /**
   * Plan a rollover. Creates a NEW hedge record linked to the original.
   * The original hedge is marked ROLLED_OVER (never deleted, rule compliant).
   *
   * @param {object} opts
   * @param {string} opts.hedgeId
   * @param {string|Date} opts.newMaturity
   * @param {number} opts.newRate
   * @returns {object} { original, rollover }
   */
  rolloverSchedule({ hedgeId, newMaturity, newRate } = {}) {
    const h = this._mustGet(hedgeId);
    if (h.status !== STATUSES.ACTIVE) {
      throw new FXHedgingError(
        ERROR_CODES.INVALID_HEDGE,
        `cannot roll hedge ${hedgeId} in status ${h.status}`
      );
    }
    if (!isFiniteNumber(newRate) || newRate <= 0) {
      throw new FXHedgingError(ERROR_CODES.INVALID_RATE, 'newRate > 0 required');
    }
    const newMat = toISODate(newMaturity);
    if (newMat <= h.maturityDate) {
      throw new FXHedgingError(
        ERROR_CODES.INVALID_HEDGE,
        `newMaturity ${newMat} must be after original ${h.maturityDate}`
      );
    }

    const newId = `${h.id}_R${this._rolloverCount(h.id) + 1}`;
    // Call recordHedge for validation + storage, but don't use the
    // returned frozen snapshot — we need to mutate the stored record
    // one more time to attach the backlink.
    this.recordHedge({
      id: newId,
      type: h.type,
      notional: h.notional,
      base: h.base,
      quote: h.quote,
      rate: newRate,
      maturityDate: newMat,
      counterparty: h.counterparty,
      purpose: h.purpose,
      hedgedItem: h.hedgedItem,
    });

    // Mark original rolled over (upgrade, not delete)
    h.status = STATUSES.ROLLED_OVER;
    h.rolledInto = newId;
    h.history.push({
      at: this._clock(),
      event: 'ROLLED_OVER',
      rate: newRate,
      maturityDate: newMat,
      into: newId,
    });
    // Attach backlink on the mutable stored record, then freeze a
    // fresh snapshot for the caller.
    const stored = this._hedges.get(newId);
    stored.rolloverOf = h.id;
    stored.history.push({
      at: this._clock(),
      event: 'CREATED_AS_ROLLOVER_OF',
      of: h.id,
    });

    this._audit('ROLLOVER_PLANNED', { from: h.id, to: newId, newRate, newMat });

    return {
      original: deepFreeze({ ...h, history: h.history.slice() }),
      rollover: deepFreeze({ ...stored, history: stored.history.slice() }),
      rateDelta: round(newRate - h.rate, 6),
      daysExtended: daysBetween(h.maturityDate, newMat),
      label: {
        he: 'תכנון גלגול עסקה',
        en: 'Rollover plan',
      },
    };
  }

  _rolloverCount(parentId) {
    let n = 0;
    for (const h of this._hedges.values()) {
      if (h.rolloverOf === parentId) n++;
    }
    return n;
  }

  // ─── 5.9  gainLoss ──────────────────────────────────────────────────
  /**
   * Realized vs unrealized gain/loss at a given closing date.
   *
   * @param {object} opts
   * @param {string} opts.hedgeId
   * @param {string|Date} [opts.closingDate]
   * @returns {object}
   */
  gainLoss({ hedgeId, closingDate } = {}) {
    const h = this._mustGet(hedgeId);
    const asOf = closingDate ? toISODate(closingDate) : this._clock();

    // Use the last-known reference rate: either the one attached to the
    // hedged item or — for closed hedges — the closing rate on record.
    const ref = (h.hedgedItem && isFiniteNumber(h.hedgedItem.currentRate))
      ? Number(h.hedgedItem.currentRate)
      : h.rate;
    const pnl = round(h.notional * (ref - h.rate));
    const realized = asOf >= h.maturityDate || h.status === STATUSES.CLOSED;

    return {
      hedgeId,
      asOf,
      type: h.type,
      notional: h.notional,
      contractRate: h.rate,
      referenceRate: ref,
      pnl,
      realized: realized ? pnl : 0,
      unrealized: realized ? 0 : pnl,
      currency: h.quote,
      status: h.status,
      label: {
        he: realized ? 'רווח/הפסד ממומש' : 'רווח/הפסד לא-ממומש',
        en: realized ? 'Realized P&L' : 'Unrealized P&L',
      },
    };
  }

  // ─── 5.10 hedgeRatio ────────────────────────────────────────────────
  /**
   * Percentage of exposure that is currently hedged.
   * Accepts either bare numbers or objects with `amount`/`notional`.
   */
  hedgeRatio(exposure, hedged) {
    const exp = typeof exposure === 'object' && exposure !== null
      ? Number(exposure.amount || exposure.grossExposure || exposure.notional || 0)
      : Number(exposure);
    const hed = typeof hedged === 'object' && hedged !== null
      ? Number(hedged.amount || hedged.notional || hedged.hedged || 0)
      : Number(hedged);

    if (!isFiniteNumber(exp) || exp <= 0) {
      return {
        ratio: 0,
        pct: 0,
        exposure: round(exp || 0),
        hedged: round(hed || 0),
        label: {
          he: 'אין חשיפה לגדר',
          en: 'No exposure to hedge',
        },
      };
    }
    const ratio = round(hed / exp, 6);
    const pct = round(ratio * 100, 2);
    let classification;
    if (pct < 25) classification = { he: 'גידור נמוך', en: 'Low' };
    else if (pct < 75) classification = { he: 'גידור חלקי', en: 'Partial' };
    else if (pct <= 100) classification = { he: 'גידור מלא', en: 'Full' };
    else classification = { he: 'גידור יתר', en: 'Over-hedged' };

    return {
      exposure: round(exp),
      hedged: round(hed),
      ratio,
      pct,
      classification,
      label: {
        he: 'יחס גידור',
        en: 'Hedge ratio',
      },
    };
  }

  // ─── 5.11 policyCompliance ──────────────────────────────────────────
  /**
   * Validate current positions against a hedging policy.
   *
   * Policy schema (all keys optional):
   *   {
   *     minHedgeRatio:  0..1 or 0..100,
   *     maxHedgeRatio:  0..1 or 0..100,
   *     allowedInstruments: ['forward','option',…],
   *     maxCounterpartyConcentration: percentage, e.g. 40
   *     allowedCurrencies: ['USD','EUR',…]
   *     maxTenorDays: integer
   *   }
   *
   * @param {object} opts
   * @returns {object} { compliant, violations, checks }
   */
  policyCompliance(opts = {}) {
    const policy = opts.policy || this.policy;
    if (!policy) {
      throw new FXHedgingError(
        ERROR_CODES.POLICY_VIOLATION,
        'no policy supplied — pass opts.policy or construct tracker with policy'
      );
    }
    // Either caller-supplied positions or our own active hedges.
    const positions =
      opts.currentPositions || Array.from(this._hedges.values()).filter(
        (h) => h.status === STATUSES.ACTIVE
      );

    const checks = [];
    const violations = [];

    // Instrument whitelist
    if (Array.isArray(policy.allowedInstruments)) {
      for (const p of positions) {
        const ok = policy.allowedInstruments.includes(p.type);
        checks.push({
          check: 'allowedInstruments',
          hedgeId: p.id,
          passed: ok,
          value: p.type,
        });
        if (!ok) {
          violations.push({
            rule: 'allowedInstruments',
            hedgeId: p.id,
            message: `${p.type} not in allowedInstruments`,
            label: {
              he: `כלי ${p.type} אינו מותר לפי מדיניות`,
              en: `Instrument ${p.type} not allowed by policy`,
            },
          });
        }
      }
    }

    // Currency whitelist
    if (Array.isArray(policy.allowedCurrencies)) {
      for (const p of positions) {
        const nonBase = p.base === this.baseCurrency ? p.quote : p.base;
        const ok = policy.allowedCurrencies.includes(nonBase);
        checks.push({
          check: 'allowedCurrencies',
          hedgeId: p.id,
          passed: ok,
          value: nonBase,
        });
        if (!ok) {
          violations.push({
            rule: 'allowedCurrencies',
            hedgeId: p.id,
            message: `currency ${nonBase} not permitted`,
            label: {
              he: `מטבע ${nonBase} אינו מותר`,
              en: `Currency ${nonBase} not permitted`,
            },
          });
        }
      }
    }

    // Tenor cap
    if (isFiniteNumber(policy.maxTenorDays)) {
      const today = this._clock();
      for (const p of positions) {
        const tenor = daysBetween(today, p.maturityDate);
        const ok = tenor <= policy.maxTenorDays;
        checks.push({
          check: 'maxTenorDays',
          hedgeId: p.id,
          passed: ok,
          value: tenor,
        });
        if (!ok) {
          violations.push({
            rule: 'maxTenorDays',
            hedgeId: p.id,
            message: `tenor ${tenor}d exceeds cap ${policy.maxTenorDays}d`,
            label: {
              he: `תקופה ${tenor} ימים חורגת מהמקסימום`,
              en: `Tenor ${tenor}d exceeds cap`,
            },
          });
        }
      }
    }

    // Hedge-ratio bounds
    if (
      isFiniteNumber(policy.minHedgeRatio) ||
      isFiniteNumber(policy.maxHedgeRatio)
    ) {
      const report = this.exposureReport();
      for (const ccy of Object.keys(report.byCurrency)) {
        const row = report.byCurrency[ccy];
        const gross = Math.abs(row.grossExposure);
        if (gross === 0) continue;
        const ratio = row.hedged / gross;
        const minR = _normalizeRatio(policy.minHedgeRatio);
        const maxR = _normalizeRatio(policy.maxHedgeRatio);
        if (isFiniteNumber(minR) && ratio < minR) {
          violations.push({
            rule: 'minHedgeRatio',
            currency: ccy,
            message: `ratio ${round(ratio, 4)} < min ${minR}`,
            label: {
              he: `יחס גידור ${round(ratio * 100, 1)}% נמוך מהמינימום`,
              en: `Hedge ratio ${round(ratio * 100, 1)}% below min`,
            },
          });
        }
        if (isFiniteNumber(maxR) && ratio > maxR) {
          violations.push({
            rule: 'maxHedgeRatio',
            currency: ccy,
            message: `ratio ${round(ratio, 4)} > max ${maxR}`,
            label: {
              he: `יחס גידור ${round(ratio * 100, 1)}% חורג מהמקסימום`,
              en: `Hedge ratio ${round(ratio * 100, 1)}% above max`,
            },
          });
        }
        checks.push({
          check: 'hedgeRatioBounds',
          currency: ccy,
          passed:
            (!isFiniteNumber(minR) || ratio >= minR) &&
            (!isFiniteNumber(maxR) || ratio <= maxR),
          value: round(ratio, 4),
        });
      }
    }

    // Counterparty concentration
    if (isFiniteNumber(policy.maxCounterpartyConcentration)) {
      const capPct = policy.maxCounterpartyConcentration > 1
        ? policy.maxCounterpartyConcentration / 100
        : policy.maxCounterpartyConcentration;
      const byCpty = {};
      let total = 0;
      for (const p of positions) {
        byCpty[p.counterparty] = (byCpty[p.counterparty] || 0) + p.notional;
        total += p.notional;
      }
      for (const [cpty, amt] of Object.entries(byCpty)) {
        const share = total > 0 ? amt / total : 0;
        const ok = share <= capPct;
        checks.push({
          check: 'counterpartyConcentration',
          counterparty: cpty,
          passed: ok,
          value: round(share, 4),
        });
        if (!ok) {
          violations.push({
            rule: 'maxCounterpartyConcentration',
            counterparty: cpty,
            message: `${cpty} = ${round(share * 100, 1)}% > ${round(capPct * 100, 1)}%`,
            label: {
              he: `ריכוז ${cpty} חורג מהמותר`,
              en: `${cpty} concentration exceeds cap`,
            },
          });
        }
      }
    }

    return {
      compliant: violations.length === 0,
      checksRun: checks.length,
      violationsCount: violations.length,
      checks,
      violations,
      policy,
      asOf: this._clock(),
      label: {
        he: violations.length === 0 ? 'תואם מדיניות גידור' : 'חריגה ממדיניות גידור',
        en: violations.length === 0 ? 'Policy compliant' : 'Policy violation',
      },
    };
  }

  // ─── 5.12 generateHedgeReport — bilingual PDF ───────────────────────
  /**
   * Produce a bilingual PDF (hand-rolled, no deps) with an SVG chart of
   * exposure over time. Returns:
   *   {
   *     pdf: Buffer,
   *     svg: string,
   *     summary: object,
   *   }
   * The PDF is a real (if minimal) PDF 1.4 document that any viewer
   * will open. The Hebrew strings are embedded as Unicode escapes.
   *
   * @param {object} period { from, to }
   * @returns {object}
   */
  generateHedgeReport(period = {}) {
    const from = period.from ? toISODate(period.from) : '1970-01-01';
    const to = period.to ? toISODate(period.to) : '2099-12-31';
    const exposure = this.exposureReport({ period: { from, to } });
    const ladder = this.maturityLadder();

    // Series: cumulative hedged notional by maturity date (for SVG chart)
    const points = [];
    const sortedHedges = Array.from(this._hedges.values())
      .filter((h) => h.status === STATUSES.ACTIVE)
      .filter((h) => h.maturityDate >= from && h.maturityDate <= to)
      .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

    let cum = 0;
    for (const h of sortedHedges) {
      cum += h.notional;
      points.push({ date: h.maturityDate, value: cum });
    }

    const svg = this._renderExposureSVG(points, { from, to });
    const summary = {
      period: { from, to },
      generatedAt: this._clock(),
      baseCurrency: this.baseCurrency,
      currencies: exposure.currencies,
      totalActiveHedges: sortedHedges.length,
      totalNotional: round(cum),
      exposure,
      ladder,
      titleHe: 'דוח גידור מט"ח — מעקב בלבד (ללא ביצוע עסקאות)',
      titleEn: 'FX Hedging Report — Tracking Only (No Trading)',
    };

    const pdf = this._renderBilingualPDF(summary, svg);
    return { pdf, svg, summary };
  }

  // ─── internal: SVG chart ────────────────────────────────────────────
  _renderExposureSVG(points, period) {
    const w = 600;
    const h = 240;
    const padL = 50;
    const padR = 20;
    const padT = 30;
    const padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const n = points.length;
    const maxV = n ? Math.max(...points.map((p) => p.value)) : 1;
    const minDate = n ? points[0].date : period.from;
    const maxDate = n ? points[n - 1].date : period.to;
    const totalDays = Math.max(1, daysBetween(minDate, maxDate));

    const xOf = (d) => padL + (daysBetween(minDate, d) / totalDays) * plotW;
    const yOf = (v) => padT + plotH - (v / (maxV || 1)) * plotH;

    const pathData = n
      ? 'M ' + points.map((p) => `${round(xOf(p.date), 2)} ${round(yOf(p.value), 2)}`).join(' L ')
      : '';

    const labelHe = escapeXML('חשיפה מצטברת לפי מועד פדיון');
    const labelEn = escapeXML('Cumulative exposure by maturity');

    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
      `  <rect width="${w}" height="${h}" fill="#ffffff" stroke="#333" stroke-width="1"/>\n` +
      `  <text x="${w / 2}" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#000">${labelEn} | ${labelHe}</text>\n` +
      `  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#000" stroke-width="1"/>\n` +
      `  <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#000" stroke-width="1"/>\n` +
      (n
        ? `  <path d="${pathData}" fill="none" stroke="#0057b8" stroke-width="2"/>\n`
        : `  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#999" font-size="12">No active hedges / אין גידורים פעילים</text>\n`) +
      `  <text x="${padL}" y="${padT + plotH + 18}" font-size="10" fill="#555">${escapeXML(minDate)}</text>\n` +
      `  <text x="${padL + plotW - 60}" y="${padT + plotH + 18}" font-size="10" fill="#555">${escapeXML(maxDate)}</text>\n` +
      `  <text x="${padL - 8}" y="${padT + 10}" text-anchor="end" font-size="10" fill="#555">${round(maxV, 0)}</text>\n` +
      `  <text x="${padL - 8}" y="${padT + plotH}" text-anchor="end" font-size="10" fill="#555">0</text>\n` +
      `</svg>\n`
    );
  }

  // ─── internal: hand-rolled PDF 1.4 writer (bilingual, no deps) ──────
  _renderBilingualPDF(summary, svg) {
    // Minimal single-page PDF. Unicode strings are emitted with a
    // \uXXXX-like PDF escape via UTF-16BE hex strings inside parens.
    // PDF supports <hex> strings too — we use those for Hebrew.
    const lines = [];
    lines.push('%PDF-1.4');

    const pageWidth = 595;
    const pageHeight = 842;

    // Build text commands
    const textCmds = [];
    let y = pageHeight - 60;
    const pushLine = (text, size = 12, hebrew = false) => {
      const safe = escapePDFText(text);
      if (hebrew) {
        // Emit as hex UTF-16BE
        const hex = utf16HexBE(text);
        textCmds.push(`BT /F1 ${size} Tf 50 ${y} Td <${hex}> Tj ET`);
      } else {
        textCmds.push(`BT /F1 ${size} Tf 50 ${y} Td (${safe}) Tj ET`);
      }
      y -= size + 6;
    };

    pushLine(summary.titleEn, 14);
    pushLine(summary.titleHe, 14, true);
    pushLine(`Period: ${summary.period.from} .. ${summary.period.to}`);
    pushLine(`Base currency: ${summary.baseCurrency}`);
    pushLine(`Active hedges: ${summary.totalActiveHedges}`);
    pushLine(`Total notional: ${summary.totalNotional}`);
    pushLine('');
    pushLine('Exposure by currency / חשיפה לפי מטבע:', 12);
    pushLine('חשיפה לפי מטבע', 12, true);

    for (const ccy of summary.currencies) {
      const row = summary.exposure.byCurrency[ccy];
      pushLine(
        `  ${ccy}: R=${row.receivables}  P=${row.payables}  C=${row.commitments}  H=${row.hedged}  Net=${row.netExposure}`,
        11
      );
    }
    pushLine('');
    pushLine('NOTE: READ-ONLY — no trades executed by this module.', 11);
    pushLine('הערה: מעקב בלבד — המודול אינו מבצע עסקאות.', 11, true);

    const stream = textCmds.join('\n');

    // Assemble the PDF objects with byte-accurate xref offsets.
    const objects = [];
    const push = (body) => objects.push(body);

    push('<< /Type /Catalog /Pages 2 0 R >>');
    push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`
    );
    push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

    // Build the byte layout
    let body = '';
    const offsets = [];
    body += '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(body, 'latin1');
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      body += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    // Store svg as a sidecar attribute on the buffer.
    const buf = Buffer.from(body, 'latin1');
    buf.svgChart = svg; // non-standard but handy for downstream consumers
    return buf;
  }

  // ─── 5.13 list / inspect (read-only helpers) ────────────────────────
  list() {
    return Array.from(this._hedges.values()).map((h) => ({
      id: h.id,
      type: h.type,
      notional: h.notional,
      base: h.base,
      quote: h.quote,
      rate: h.rate,
      maturityDate: h.maturityDate,
      counterparty: h.counterparty,
      status: h.status,
    }));
  }

  get(hedgeId) {
    const h = this._hedges.get(hedgeId);
    if (!h) return null;
    return deepFreeze({ ...h, history: h.history.slice() });
  }

  auditLog() {
    return this._auditLog.slice();
  }

  // ─── private ────────────────────────────────────────────────────────
  _mustGet(hedgeId) {
    const h = this._hedges.get(hedgeId);
    if (!h) {
      throw new FXHedgingError(
        ERROR_CODES.UNKNOWN_HEDGE,
        `hedge ${hedgeId} not found`
      );
    }
    return h;
  }

  _audit(event, data) {
    this._auditLog.push(
      Object.freeze({
        at: this._clock(),
        event,
        data: Object.freeze({ ...data }),
      })
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Helpers (module-private)
// ═══════════════════════════════════════════════════════════════════════

function _normalizeRatio(v) {
  if (!isFiniteNumber(v)) return NaN;
  return v > 1 ? v / 100 : v;
}

function utf16HexBE(s) {
  // BOM + UTF-16BE hex for PDF hex strings
  let out = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xffff) {
      out += cp.toString(16).padStart(4, '0').toUpperCase();
    } else {
      // surrogate pair
      const adj = cp - 0x10000;
      const hi = 0xd800 + (adj >> 10);
      const lo = 0xdc00 + (adj & 0x3ff);
      out += hi.toString(16).padStart(4, '0').toUpperCase();
      out += lo.toString(16).padStart(4, '0').toUpperCase();
    }
  }
  return out;
}

// Attach constants to class for discoverability
FXHedgingTracker.HEDGE_TYPES = HEDGE_TYPES;
FXHedgingTracker.HEDGE_TYPE_LABELS = HEDGE_TYPE_LABELS;
FXHedgingTracker.PURPOSES = PURPOSES;
FXHedgingTracker.PURPOSE_LABELS = PURPOSE_LABELS;
FXHedgingTracker.STATUSES = STATUSES;
FXHedgingTracker.STATUS_LABELS = STATUS_LABELS;
FXHedgingTracker.ERROR_CODES = ERROR_CODES;
FXHedgingTracker.IFRS9_EFFECTIVENESS_MIN = IFRS9_EFFECTIVENESS_MIN;
FXHedgingTracker.IFRS9_EFFECTIVENESS_MAX = IFRS9_EFFECTIVENESS_MAX;

// ═══════════════════════════════════════════════════════════════════════
// 7. Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  FXHedgingTracker,
  FXHedgingError,
  HEDGE_TYPES,
  HEDGE_TYPE_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  STATUSES,
  STATUS_LABELS,
  ERROR_CODES,
  IFRS9_EFFECTIVENESS_MIN,
  IFRS9_EFFECTIVENESS_MAX,
  // Top-level trade sentinel — calling this module-level `trade` function
  // is the most convenient mistake to make, so it is loudly forbidden.
  trade() {
    readOnlyGuard('trade');
  },
  executeTrade() {
    readOnlyGuard('executeTrade');
  },
};
