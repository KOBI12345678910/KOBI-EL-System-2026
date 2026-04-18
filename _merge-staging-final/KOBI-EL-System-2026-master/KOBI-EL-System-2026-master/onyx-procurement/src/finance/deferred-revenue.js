/**
 * Deferred Revenue Tracker — IFRS 15 (Revenue from Contracts with Customers)
 * Agent Y-090 — Swarm: Mega-ERP Techno-Kol Uzi — Kobi EL
 *
 * ---------------------------------------------------------------
 *  A deterministic, fully-documented, zero-dependency, bilingual
 *  (Hebrew / English) deferred-revenue / contract-asset / contract-
 *  liability tracker for the ONYX / Techno-Kol Uzi Mega-ERP.
 *
 *  Design rules (הקדוש-קדושים):
 *    לא מוחקים — רק משדרגים ומגדלים.
 *    • This module NEVER deletes contracts, obligations, or
 *      recognition events. Contract modifications produce NEW
 *      versions; the old version is pushed onto `contract.history[]`.
 *    • All state changes are append-only in `contract.events[]`.
 *    • Zero runtime dependencies (pure Node / CommonJS).
 *    • Bilingual error messages and disclosure output.
 *    • All math in integer agorot internally, converted to ₪ on
 *      the way out, so no floating-point drift.
 *
 *  IFRS 15 five-step model (חמשת השלבים):
 *    1. Identify the contract with a customer
 *       (זיהוי החוזה עם הלקוח)
 *    2. Identify the performance obligations in the contract
 *       (זיהוי מחויבויות הביצוע)
 *    3. Determine the transaction price
 *       (קביעת מחיר העסקה)
 *    4. Allocate the transaction price to the performance obligations
 *       (הקצאת מחיר העסקה למחויבויות)
 *    5. Recognize revenue when (or as) each obligation is satisfied
 *       (הכרה בהכנסה עם קיום המחויבות)
 *
 *  Public surface (exported):
 *    class DeferredRevenue
 *      .createContract({customerId, total, performanceObligations, terms,
 *                       startDate, endDate})
 *      .allocatePrice({transactionPrice, obligations})
 *      .recognizeRevenue({contractId, obligationId, amount, period, method})
 *      .satisfyObligation({contractId, obligationId, date, proof})
 *      .scheduleSubscription({contractId, period, amount, recurring})
 *      .modifyContract({contractId, modificationType, impact})
 *      .recordBilling({contractId, obligationId, amount, date, invoice})
 *      .deferredBalance(contractId, asOfDate)
 *      .unbilledReceivable(contractId)
 *      .contractLiability(contractId)
 *      .rolloForward(period)
 *      .disclosureReport(period)
 *      .getContract(id)
 *      .listContracts()
 *    const CONSTANTS, RECOGNITION_METHODS, TIMING_TYPES,
 *          MODIFICATION_TYPES, EVENT_TYPES
 *
 *  Israeli specifics (התאמות ישראליות):
 *    • VAT reconciliation: Israeli VAT law (חוק מע"מ) requires VAT
 *      to be reported on the date of the *issued tax invoice*
 *      (חשבונית מס), regardless of when revenue is recognized under
 *      IFRS 15. The tracker keeps separate `billing` and `recognition`
 *      ledgers and exposes `vatReconciliation(period)` to expose the
 *      gap so the VAT report (דיווח מע"מ) stays consistent with the
 *      tax invoices actually issued.
 *    • Cash-basis accounting (מזומן) — a small-business option under
 *      the Israeli Tax Ordinance (פקודת מס הכנסה) allows certain
 *      "service" businesses below a turnover threshold to report
 *      income on a cash basis. When `mode='cash-basis'` the IFRS-15
 *      recognition schedule is kept untouched (for financial
 *      statements) but `disclosureReport().cashBasisTaxable` returns
 *      the cash-collected figure that the tax authority expects.
 *      Dual track — הנהלת חשבונות לפי IFRS, ומס הכנסה לפי מזומן.
 *
 *  House rule: לא מוחקים — רק משדרגים ומגדלים.
 * ---------------------------------------------------------------
 */

'use strict';

/* -------------------------------------------------------------- */
/* Constants                                                      */
/* -------------------------------------------------------------- */

const CONSTANTS = Object.freeze({
  VERSION: '1.1.0',
  AGENT: 'Y-090',
  // Rounding granularity (agorot). IFRS 15 §B16 allows the smallest
  // unit of currency rounding — here we use 1 agora (= ₪0.01).
  AGORA: 1,
  // Default currency symbol — ₪ (NIS / שקל חדש).
  CURRENCY_SYMBOL: '₪',
  // Over-time recognition check: IFRS 15 §35 — at least one of
  // three criteria must be met. We let the caller mark timing as
  // 'over-time' when they have performed this assessment.
  TOLERANCE_AGOROT: 1, // allocation rounding tolerance (₪0.01)
  // Israeli VAT standard rate (מע"מ) as of 2026 — 18%.
  VAT_RATE_2026: 0.18,
  // Small-business (עסק פטור) turnover threshold for cash basis —
  // the tracker stores it for reference only; the caller decides.
  CASH_BASIS_THRESHOLD_ILS: 120000,
});

const RECOGNITION_METHODS = Object.freeze({
  OUTPUT: 'output',             // units/milestones produced
  INPUT: 'input',               // resources consumed
  COST_TO_COST: 'cost-to-cost', // costs incurred / total expected
  UNITS_DELIVERED: 'units-delivered',
});

const TIMING_TYPES = Object.freeze({
  POINT: 'point',       // point-in-time (§38)
  OVER_TIME: 'over-time', // over-time (§35)
});

const MODIFICATION_TYPES = Object.freeze({
  // §20 — modification treated as a SEPARATE contract
  SEPARATE: 'separate',
  // §21(a) — PROSPECTIVE: termination of existing contract + creation
  // of a new one. Remaining consideration is re-allocated to the
  // remaining (plus new) performance obligations.
  PROSPECTIVE: 'prospective',
  // §21(b) — RETROSPECTIVE (cumulative catch-up): modification is
  // treated as if it were part of the existing contract. Revenue
  // recognized to date is adjusted by a catch-up.
  RETROSPECTIVE: 'retrospective',
});

const EVENT_TYPES = Object.freeze({
  CREATED: 'contract.created',
  OBLIGATION_ADDED: 'obligation.added',
  PRICE_ALLOCATED: 'price.allocated',
  RECOGNIZED: 'revenue.recognized',
  SATISFIED: 'obligation.satisfied',
  BILLED: 'billing.recorded',
  MODIFIED: 'contract.modified',
  SUBSCRIPTION_SCHEDULED: 'subscription.scheduled',
});

const MODES = Object.freeze({
  ACCRUAL: 'accrual',
  CASH_BASIS: 'cash-basis',
});

/* -------------------------------------------------------------- */
/* Integer-agorot arithmetic                                      */
/* -------------------------------------------------------------- */

/**
 * Convert ₪ to integer agorot. Rounds to nearest agora (banker's
 * neutral). Handles negative numbers.
 *
 * @param {number} shekels
 * @returns {number} integer agorot
 */
function toAgorot(shekels) {
  if (shekels == null || Number.isNaN(Number(shekels))) return 0;
  // Banker-friendly rounding — we use Math.round which is
  // deterministic in V8 and avoids the half-to-even quirk.
  return Math.round(Number(shekels) * 100);
}

/**
 * Convert integer agorot back to ₪ (number, two-decimal).
 *
 * @param {number} agorot
 * @returns {number}
 */
function toShekels(agorot) {
  return Math.round(Number(agorot) || 0) / 100;
}

/**
 * Format ₪ for display.
 * @param {number} agorot
 */
function formatILS(agorot) {
  const s = toShekels(agorot);
  return `${CONSTANTS.CURRENCY_SYMBOL}${s.toFixed(2)}`;
}

/* -------------------------------------------------------------- */
/* Date utilities (no deps)                                       */
/* -------------------------------------------------------------- */

function toISO(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isBefore(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getTime() < db.getTime();
}

function isOnOrBefore(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getTime() <= db.getTime();
}

function periodMatches(date, period) {
  // `period` is 'YYYY' or 'YYYY-MM' or 'YYYY-MM-DD' or
  // an object {start, end} ISO strings.
  if (!period) return true;
  const iso = toISO(date);
  if (!iso) return false;
  if (typeof period === 'string') {
    return iso.startsWith(period);
  }
  if (typeof period === 'object') {
    const s = toISO(period.start);
    const e = toISO(period.end);
    if (s && iso < s) return false;
    if (e && iso > e) return false;
    return true;
  }
  return true;
}

function deepClone(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

/* -------------------------------------------------------------- */
/* Bilingual errors                                               */
/* -------------------------------------------------------------- */

class DeferredRevenueError extends Error {
  constructor(msgHe, msgEn, code) {
    super(`${msgEn} / ${msgHe}`);
    this.name = 'DeferredRevenueError';
    this.code = code || 'DEFERRED_REVENUE_ERROR';
    this.he = msgHe;
    this.en = msgEn;
  }
}

function err(he, en, code) {
  return new DeferredRevenueError(he, en, code);
}

/* -------------------------------------------------------------- */
/* Validation                                                     */
/* -------------------------------------------------------------- */

function validateContractInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('createContract: input must be an object / הקלט חייב להיות אובייקט');
    return errors;
  }
  if (!input.customerId) {
    errors.push('createContract: customerId is required / customerId הוא שדה חובה');
  }
  if (input.total == null || Number.isNaN(Number(input.total)) || Number(input.total) < 0) {
    errors.push('createContract: total must be a non-negative number / הסכום הכולל חייב להיות מספר לא שלילי');
  }
  if (!Array.isArray(input.performanceObligations) || input.performanceObligations.length === 0) {
    errors.push('createContract: at least one performance obligation is required / חייבת להיות לפחות מחויבות ביצוע אחת');
  } else {
    input.performanceObligations.forEach((po, i) => {
      if (!po || typeof po !== 'object') {
        errors.push(`PO[${i}]: must be an object / חייב להיות אובייקט`);
        return;
      }
      if (!po.id) errors.push(`PO[${i}]: id is required / id הוא שדה חובה`);
      if (po.standaloneSSP == null || Number(po.standaloneSSP) < 0) {
        errors.push(`PO[${i}]: standaloneSSP must be a non-negative number / SSP חייב להיות מספר לא שלילי`);
      }
      if (po.timing && po.timing !== TIMING_TYPES.POINT && po.timing !== TIMING_TYPES.OVER_TIME) {
        errors.push(`PO[${i}]: timing must be 'point' or 'over-time' / עיתוי חייב להיות point או over-time`);
      }
    });
  }
  if (input.startDate && !parseDate(input.startDate)) {
    errors.push('createContract: startDate is invalid / תאריך תחילה לא תקין');
  }
  if (input.endDate && !parseDate(input.endDate)) {
    errors.push('createContract: endDate is invalid / תאריך סיום לא תקין');
  }
  if (input.startDate && input.endDate && isBefore(input.endDate, input.startDate)) {
    errors.push('createContract: endDate must be on or after startDate / תאריך הסיום חייב להיות אחרי תאריך התחלה');
  }
  return errors;
}

/* -------------------------------------------------------------- */
/* DeferredRevenue class                                          */
/* -------------------------------------------------------------- */

class DeferredRevenue {
  /**
   * @param {object} [opts]
   * @param {string} [opts.mode] - 'accrual' (default) or 'cash-basis'
   * @param {string} [opts.locale] - 'he' | 'en' (default 'he')
   * @param {number} [opts.vatRate] - override VAT rate (default 0.18)
   */
  constructor(opts = {}) {
    this._contracts = new Map();
    this._seq = 0;
    this._opts = {
      mode: opts.mode || MODES.ACCRUAL,
      locale: opts.locale || 'he',
      vatRate: typeof opts.vatRate === 'number' ? opts.vatRate : CONSTANTS.VAT_RATE_2026,
    };
  }

  /* ---------- Step 1: Identify the contract ------------------- */

  /**
   * Step 1 — Identify the contract with a customer
   * (זיהוי החוזה עם הלקוח).
   *
   * Creates a new contract record. The contract is stored with an
   * empty recognition and billing ledger. Allocation of the
   * transaction price happens automatically per IFRS 15 §74 (relative
   * standalone selling price method) unless the caller supplies a
   * pre-allocated `allocatedAmount` on each obligation.
   *
   * @param {{
   *   customerId: string,
   *   total: number,
   *   performanceObligations: Array<{
   *     id: string,
   *     description?: string,
   *     descriptionHe?: string,
   *     standaloneSSP: number,
   *     timing?: 'point'|'over-time',
   *     recognitionMethod?: string,
   *     allocatedAmount?: number,
   *   }>,
   *   terms?: string,
   *   startDate?: string,
   *   endDate?: string,
   *   currency?: string,
   *   id?: string,
   * }} input
   * @returns {object} contract (clone)
   */
  createContract(input) {
    const errors = validateContractInput(input);
    if (errors.length) {
      throw err(
        errors.join('; '),
        errors.join('; '),
        'INVALID_CONTRACT'
      );
    }

    this._seq += 1;
    const id = input.id || `CT-${String(this._seq).padStart(5, '0')}`;
    if (this._contracts.has(id)) {
      throw err(
        `חוזה בזיהוי ${id} כבר קיים`,
        `Contract ${id} already exists`,
        'DUPLICATE_CONTRACT'
      );
    }

    const obligations = input.performanceObligations.map((po, i) => ({
      id: po.id || `PO-${i + 1}`,
      description: po.description || po.descriptionHe || po.id,
      descriptionHe: po.descriptionHe || po.description || po.id,
      standaloneSSPAgorot: toAgorot(po.standaloneSSP),
      allocatedAgorot: po.allocatedAmount != null ? toAgorot(po.allocatedAmount) : 0,
      timing: po.timing || TIMING_TYPES.POINT,
      recognitionMethod: po.recognitionMethod || RECOGNITION_METHODS.OUTPUT,
      satisfied: false,
      satisfiedDate: null,
      satisfiedProof: null,
      recognizedAgorot: 0,
      recognitions: [], // append-only ledger of recognition events
      billings: [],     // append-only ledger of billing events
      subscriptionSchedule: null, // if present, SaaS / recurring plan
      // Cost-to-cost inputs
      incurredCostAgorot: 0,
      totalExpectedCostAgorot: 0,
    }));

    const contract = {
      id,
      customerId: input.customerId,
      totalAgorot: toAgorot(input.total),
      performanceObligations: obligations,
      terms: input.terms || '',
      startDate: toISO(input.startDate) || toISO(new Date()),
      endDate: toISO(input.endDate),
      currency: input.currency || 'ILS',
      createdAt: new Date().toISOString(),
      version: 1,
      history: [],
      events: [],
      modifications: [],
      status: 'active',
    };

    contract.events.push({
      type: EVENT_TYPES.CREATED,
      at: contract.createdAt,
      data: { totalAgorot: contract.totalAgorot, obligations: obligations.length },
    });

    // Auto-allocate the transaction price if no obligation was
    // supplied with a pre-allocated amount.
    const alreadyAllocated = obligations.every(o => o.allocatedAgorot > 0);
    if (!alreadyAllocated) {
      const alloc = this.allocatePrice({
        transactionPrice: input.total,
        obligations: obligations.map(o => ({
          id: o.id,
          standaloneSSP: toShekels(o.standaloneSSPAgorot),
        })),
      });
      for (const o of obligations) {
        const a = alloc.allocations.find(x => x.id === o.id);
        if (a) o.allocatedAgorot = a.allocatedAgorot;
      }
      contract.events.push({
        type: EVENT_TYPES.PRICE_ALLOCATED,
        at: new Date().toISOString(),
        data: { method: 'relative-SSP', allocations: alloc.allocations },
      });
    }

    this._contracts.set(id, contract);
    return deepClone(contract);
  }

  /* ---------- Step 4: Allocate transaction price -------------- */

  /**
   * Step 4 — Allocate the transaction price to the performance
   * obligations (הקצאת מחיר העסקה למחויבויות הביצוע).
   *
   * Implements the relative standalone-selling-price method
   * (IFRS 15 §74-§80). Residual approach is NOT used — callers that
   * need the residual approach should pre-allocate and pass the
   * allocation explicitly via `allocatedAmount`.
   *
   * The sum of the allocations equals the transaction price exactly
   * (rounding residue is absorbed by the last obligation).
   *
   * @param {{
   *   transactionPrice: number,
   *   obligations: Array<{id:string, standaloneSSP:number}>
   * }} input
   * @returns {{allocations: Array<{id, allocatedAgorot, allocated, ratio}>, totalSSP}}
   */
  allocatePrice({ transactionPrice, obligations }) {
    if (transactionPrice == null || Number(transactionPrice) < 0) {
      throw err(
        'מחיר עסקה חייב להיות מספר לא שלילי',
        'transactionPrice must be a non-negative number',
        'INVALID_PRICE'
      );
    }
    if (!Array.isArray(obligations) || obligations.length === 0) {
      throw err(
        'חייבות להיות מחויבויות ביצוע',
        'obligations array is required',
        'INVALID_OBLIGATIONS'
      );
    }
    const priceA = toAgorot(transactionPrice);
    const sspAgorot = obligations.map(o => ({
      id: o.id,
      ssp: toAgorot(o.standaloneSSP),
    }));
    const totalSSPAgorot = sspAgorot.reduce((s, o) => s + o.ssp, 0);

    if (totalSSPAgorot === 0) {
      // IFRS 15 §79 — if SSP is not directly observable, caller must
      // estimate. Here we fall back to even split.
      const each = Math.floor(priceA / obligations.length);
      const allocations = sspAgorot.map((o, i) => ({
        id: o.id,
        allocatedAgorot: i === obligations.length - 1
          ? priceA - each * (obligations.length - 1)
          : each,
        allocated: 0,
        ratio: 1 / obligations.length,
      }));
      allocations.forEach(a => (a.allocated = toShekels(a.allocatedAgorot)));
      return { allocations, totalSSP: 0, method: 'even-split' };
    }

    let assigned = 0;
    const allocations = sspAgorot.map((o, i) => {
      let agorot;
      if (i === sspAgorot.length - 1) {
        // Last obligation gets the residue so the sum matches exactly.
        agorot = priceA - assigned;
      } else {
        // Relative SSP ratio — floor to avoid overshoot, residue
        // settles on the last line.
        agorot = Math.floor((priceA * o.ssp) / totalSSPAgorot);
        assigned += agorot;
      }
      return {
        id: o.id,
        allocatedAgorot: agorot,
        allocated: toShekels(agorot),
        ratio: o.ssp / totalSSPAgorot,
      };
    });
    return { allocations, totalSSP: toShekels(totalSSPAgorot), method: 'relative-SSP' };
  }

  /* ---------- Step 5a: Over-time recognition ------------------ */

  /**
   * Step 5 (over-time) — Recognize revenue as an over-time obligation
   * is progressively satisfied (IFRS 15 §35–§45).
   *
   * Supported methods (RECOGNITION_METHODS):
   *   - output          (§B15) — units of output / milestones
   *   - input           (§B18) — resources consumed (hours, kg, ...)
   *   - cost-to-cost    (§B19) — costs incurred vs total expected
   *   - units-delivered         — units delivered / total units
   *
   * `amount` may be supplied directly (for output / units-delivered
   * methods) or implicitly computed from `percentComplete` +
   * allocated amount. For cost-to-cost the caller supplies
   * `incurredCost` and `totalExpectedCost` and the tracker does the
   * ratio itself.
   *
   * @param {{
   *   contractId: string,
   *   obligationId: string,
   *   amount?: number,
   *   percentComplete?: number,
   *   incurredCost?: number,
   *   totalExpectedCost?: number,
   *   unitsDelivered?: number,
   *   totalUnits?: number,
   *   period?: string,        // 'YYYY-MM' for the period of recognition
   *   date?: string,          // recognition date (default: today)
   *   method?: string,        // RECOGNITION_METHODS
   *   note?: string,
   * }} input
   * @returns {{recognizedAgorot, cumulativeAgorot, remainingAgorot, entry}}
   */
  recognizeRevenue(input) {
    const {
      contractId,
      obligationId,
      amount,
      percentComplete,
      incurredCost,
      totalExpectedCost,
      unitsDelivered,
      totalUnits,
      period,
      date,
      method = RECOGNITION_METHODS.OUTPUT,
      note = '',
    } = input || {};

    const contract = this._mustGetContract(contractId);
    const po = this._mustGetObligation(contract, obligationId);

    if (po.timing !== TIMING_TYPES.OVER_TIME) {
      throw err(
        'לא ניתן להכיר הכנסה ב-over-time למחויבות point-in-time',
        'Cannot over-time-recognize a point-in-time obligation — use satisfyObligation()',
        'WRONG_TIMING'
      );
    }

    if (!Object.values(RECOGNITION_METHODS).includes(method)) {
      throw err(
        `שיטה לא נתמכת: ${method}`,
        `Unsupported recognition method: ${method}`,
        'INVALID_METHOD'
      );
    }

    // Compute the recognized amount in agorot
    let recognizedAgorot = 0;

    if (method === RECOGNITION_METHODS.COST_TO_COST) {
      if (incurredCost == null || totalExpectedCost == null) {
        throw err(
          'שיטת cost-to-cost מחייבת incurredCost ו-totalExpectedCost',
          'cost-to-cost requires incurredCost and totalExpectedCost',
          'MISSING_COST'
        );
      }
      if (Number(totalExpectedCost) <= 0) {
        throw err(
          'עלות כוללת צפויה חייבת להיות חיובית',
          'totalExpectedCost must be positive',
          'INVALID_COST'
        );
      }
      const incA = toAgorot(incurredCost);
      const totA = toAgorot(totalExpectedCost);
      po.incurredCostAgorot = incA;
      po.totalExpectedCostAgorot = totA;
      const ratio = Math.min(1, incA / totA);
      const cumulative = Math.floor(po.allocatedAgorot * ratio);
      recognizedAgorot = cumulative - po.recognizedAgorot;
    } else if (method === RECOGNITION_METHODS.UNITS_DELIVERED) {
      if (unitsDelivered == null || totalUnits == null || Number(totalUnits) <= 0) {
        throw err(
          'שיטת units-delivered מחייבת unitsDelivered ו-totalUnits > 0',
          'units-delivered requires unitsDelivered and totalUnits > 0',
          'MISSING_UNITS'
        );
      }
      const ratio = Math.min(1, Number(unitsDelivered) / Number(totalUnits));
      const cumulative = Math.floor(po.allocatedAgorot * ratio);
      recognizedAgorot = cumulative - po.recognizedAgorot;
    } else {
      // 'output' or 'input' — caller supplies amount or percent
      if (amount != null) {
        recognizedAgorot = toAgorot(amount);
      } else if (percentComplete != null) {
        const pc = Math.max(0, Math.min(1, Number(percentComplete)));
        const cumulative = Math.floor(po.allocatedAgorot * pc);
        recognizedAgorot = cumulative - po.recognizedAgorot;
      } else {
        throw err(
          'יש לספק amount או percentComplete',
          'either amount or percentComplete is required',
          'MISSING_AMOUNT'
        );
      }
    }

    if (recognizedAgorot < 0) {
      // IFRS 15 §88 — a cumulative catch-up can be negative
      // (reversal). We allow it but warn.
      // No throw — just a recorded negative entry.
    }

    // Cap cumulative at allocated (IFRS 15 §B19 — ratio cannot exceed 1)
    const afterCum = po.recognizedAgorot + recognizedAgorot;
    if (afterCum > po.allocatedAgorot) {
      recognizedAgorot = po.allocatedAgorot - po.recognizedAgorot;
    }

    po.recognizedAgorot += recognizedAgorot;

    const entry = {
      type: EVENT_TYPES.RECOGNIZED,
      at: toISO(date) || toISO(new Date()),
      period: period || (toISO(date) || toISO(new Date())).slice(0, 7),
      method,
      amountAgorot: recognizedAgorot,
      amount: toShekels(recognizedAgorot),
      cumulativeAgorot: po.recognizedAgorot,
      cumulative: toShekels(po.recognizedAgorot),
      note,
    };
    po.recognitions.push(entry);
    contract.events.push({
      type: EVENT_TYPES.RECOGNIZED,
      at: entry.at,
      data: { obligationId, ...entry },
    });

    // If we hit 100% recognition, mark the over-time obligation as
    // satisfied (IFRS 15 §38 equivalent for over-time full delivery).
    if (po.recognizedAgorot >= po.allocatedAgorot) {
      po.satisfied = true;
      po.satisfiedDate = entry.at;
      po.satisfiedProof = po.satisfiedProof || { auto: true, reason: '100% recognized' };
    }

    return {
      recognizedAgorot,
      recognized: toShekels(recognizedAgorot),
      cumulativeAgorot: po.recognizedAgorot,
      cumulative: toShekels(po.recognizedAgorot),
      remainingAgorot: po.allocatedAgorot - po.recognizedAgorot,
      remaining: toShekels(po.allocatedAgorot - po.recognizedAgorot),
      entry,
    };
  }

  /* ---------- Step 5b: Point-in-time satisfaction ------------- */

  /**
   * Step 5 (point-in-time) — Recognize the full allocated amount of
   * a performance obligation when control of the good or service
   * transfers (IFRS 15 §38).
   *
   * @param {{
   *   contractId: string,
   *   obligationId: string,
   *   date?: string,
   *   proof?: object,   // e.g. {deliveryNote: '...', signedBy: '...'}
   *   note?: string,
   * }} input
   * @returns {{recognizedAgorot, contract}}
   */
  satisfyObligation({ contractId, obligationId, date, proof, note }) {
    const contract = this._mustGetContract(contractId);
    const po = this._mustGetObligation(contract, obligationId);

    if (po.satisfied) {
      throw err(
        `מחויבות ${obligationId} כבר קויימה`,
        `Obligation ${obligationId} already satisfied`,
        'ALREADY_SATISFIED'
      );
    }
    if (po.timing !== TIMING_TYPES.POINT) {
      throw err(
        'satisfyObligation מיועדת למחויבויות point-in-time בלבד',
        'satisfyObligation is for point-in-time obligations only',
        'WRONG_TIMING'
      );
    }

    const amt = po.allocatedAgorot - po.recognizedAgorot;
    po.recognizedAgorot = po.allocatedAgorot;
    po.satisfied = true;
    po.satisfiedDate = toISO(date) || toISO(new Date());
    po.satisfiedProof = proof || { signedAt: po.satisfiedDate };

    const entry = {
      type: EVENT_TYPES.SATISFIED,
      at: po.satisfiedDate,
      period: po.satisfiedDate.slice(0, 7),
      method: 'point-in-time',
      amountAgorot: amt,
      amount: toShekels(amt),
      cumulativeAgorot: po.recognizedAgorot,
      cumulative: toShekels(po.recognizedAgorot),
      proof: po.satisfiedProof,
      note: note || '',
    };
    po.recognitions.push(entry);
    contract.events.push({
      type: EVENT_TYPES.SATISFIED,
      at: entry.at,
      data: { obligationId, ...entry },
    });

    return {
      recognizedAgorot: amt,
      recognized: toShekels(amt),
      contract: deepClone(contract),
    };
  }

  /* ---------- Billing (separate ledger for VAT) --------------- */

  /**
   * Record the issuance of a tax invoice (חשבונית מס). Billing is
   * tracked *separately* from revenue recognition because Israeli
   * VAT law (מע"מ) taxes the moment the invoice is issued, not the
   * IFRS-15 recognition date. The gap between billing and
   * recognition drives `unbilledReceivable` and `contractLiability`.
   *
   * @param {{
   *   contractId: string,
   *   obligationId?: string,   // optional — null = general billing
   *   amount: number,
   *   date: string,
   *   invoice?: string,        // tax invoice number (חשבונית מס)
   *   vatRate?: number,
   * }} input
   */
  recordBilling(input) {
    const { contractId, obligationId, amount, date, invoice, vatRate } = input || {};
    const contract = this._mustGetContract(contractId);
    if (amount == null || Number(amount) < 0) {
      throw err(
        'סכום החיוב חייב להיות מספר לא שלילי',
        'billing amount must be a non-negative number',
        'INVALID_BILLING'
      );
    }
    const entry = {
      type: EVENT_TYPES.BILLED,
      at: toISO(date) || toISO(new Date()),
      amountAgorot: toAgorot(amount),
      amount: toShekels(toAgorot(amount)),
      invoice: invoice || null,
      vatRate: vatRate != null ? vatRate : this._opts.vatRate,
      vatAgorot: Math.round(toAgorot(amount) * (vatRate != null ? vatRate : this._opts.vatRate)),
      obligationId: obligationId || null,
    };
    if (obligationId) {
      const po = this._mustGetObligation(contract, obligationId);
      po.billings.push(entry);
    } else {
      // contract-level billing: allocated evenly across obligations
      // on the report side. Stored on the contract itself.
      if (!contract.contractBillings) contract.contractBillings = [];
      contract.contractBillings.push(entry);
    }
    contract.events.push({
      type: EVENT_TYPES.BILLED,
      at: entry.at,
      data: entry,
    });
    return entry;
  }

  /* ---------- Subscriptions / SaaS ---------------------------- */

  /**
   * Schedule a recurring subscription recognition pattern for a
   * performance obligation. SaaS / subscription revenue is
   * recognized evenly over the service period (IFRS 15 §B14 — series
   * of distinct services constituting a single performance obligation).
   *
   * @param {{
   *   contractId: string,
   *   obligationId?: string,
   *   period: 'monthly'|'quarterly'|'annual',
   *   amount: number,
   *   recurring: number,  // number of periods
   *   startDate?: string,
   * }} input
   * @returns {{schedule: Array<{period, amount, at}>}}
   */
  scheduleSubscription({ contractId, obligationId, period, amount, recurring, startDate }) {
    const contract = this._mustGetContract(contractId);
    const po = obligationId
      ? this._mustGetObligation(contract, obligationId)
      : contract.performanceObligations[0];
    if (!po) {
      throw err(
        'חוזה ללא מחויבות ביצוע — לא ניתן לתזמן מנוי',
        'contract has no obligation — cannot schedule subscription',
        'NO_OBLIGATION'
      );
    }
    if (po.timing !== TIMING_TYPES.OVER_TIME) {
      // A subscription is over-time by its nature.
      po.timing = TIMING_TYPES.OVER_TIME;
    }

    const pLower = String(period || '').toLowerCase();
    if (!['monthly', 'quarterly', 'annual', 'yearly'].includes(pLower)) {
      throw err(
        'תקופת חיוב לא נתמכת',
        `Unsupported subscription period: ${period}`,
        'INVALID_PERIOD'
      );
    }
    if (!Number.isInteger(recurring) || recurring <= 0) {
      throw err(
        'מספר התקופות חייב להיות מספר שלם חיובי',
        'recurring must be a positive integer',
        'INVALID_RECURRING'
      );
    }

    const monthsPerPeriod = pLower === 'monthly' ? 1
      : pLower === 'quarterly' ? 3
        : 12;
    // Use UTC-safe parsing so ISO strings like '2026-01-01' don't
    // shift across the local TZ boundary.
    const baseIso = toISO(startDate) || contract.startDate || toISO(new Date());
    const [by, bm, bd] = baseIso.split('-').map(Number);
    const schedule = [];
    for (let i = 0; i < recurring; i += 1) {
      const at = new Date(Date.UTC(by, (bm - 1) + i * monthsPerPeriod, bd));
      const atIso = at.toISOString().slice(0, 10);
      schedule.push({
        index: i + 1,
        period: atIso.slice(0, 7),
        at: atIso,
        amountAgorot: toAgorot(amount),
        amount: toShekels(toAgorot(amount)),
        recognized: false,
      });
    }
    po.subscriptionSchedule = {
      period: pLower,
      recurring,
      totalAgorot: toAgorot(amount) * recurring,
      schedule,
    };
    contract.events.push({
      type: EVENT_TYPES.SUBSCRIPTION_SCHEDULED,
      at: new Date().toISOString(),
      data: { obligationId: po.id, period: pLower, recurring, amountAgorot: toAgorot(amount) },
    });
    return deepClone(po.subscriptionSchedule);
  }

  /* ---------- Contract modifications (§18–§21) ----------------- */

  /**
   * IFRS 15 §18–§21 contract modification logic.
   *
   * Three flavours (MODIFICATION_TYPES):
   *   - separate     (§20)  — add new distinct goods/services at SSP.
   *                          A *new* contract is effectively created.
   *                          The old contract is untouched.
   *   - prospective  (§21a) — remaining goods/services are distinct
   *                          from those transferred. Unrecognized
   *                          consideration is re-allocated across the
   *                          remaining + new obligations going forward.
   *   - retrospective(§21b) — remaining goods/services are NOT
   *                          distinct from those transferred. A
   *                          cumulative catch-up is booked.
   *
   * `impact` shape depends on the flavour:
   *   {
   *     additionalPrice?: number,
   *     newObligations?: [{id, description, standaloneSSP, timing}],
   *     revisedTotal?: number,   // retrospective: new total price
   *   }
   *
   * All modifications are APPEND-ONLY — the old snapshot is pushed
   * to `contract.history[]`. Nothing is ever deleted.
   *
   * @returns {{
   *   modificationType, priorVersion, newVersion, catchUpAgorot?, contract
   * }}
   */
  modifyContract({ contractId, modificationType, impact = {} }) {
    const contract = this._mustGetContract(contractId);
    if (!Object.values(MODIFICATION_TYPES).includes(modificationType)) {
      throw err(
        `סוג שינוי לא נתמך: ${modificationType}`,
        `Unsupported modification type: ${modificationType}`,
        'INVALID_MOD_TYPE'
      );
    }

    // Snapshot before we mutate.
    const snapshot = deepClone(contract);
    contract.history.push({
      version: contract.version,
      snapshot,
      replacedAt: new Date().toISOString(),
      modificationType,
      impact: deepClone(impact),
    });
    contract.version += 1;

    const modEntry = {
      type: EVENT_TYPES.MODIFIED,
      at: new Date().toISOString(),
      modificationType,
      impact: deepClone(impact),
      priorVersion: contract.version - 1,
      newVersion: contract.version,
    };
    contract.events.push(modEntry);
    contract.modifications.push(modEntry);

    let catchUpAgorot = 0;

    if (modificationType === MODIFICATION_TYPES.SEPARATE) {
      // §20 — treat as a separate contract by increasing the total
      // and appending new obligations, but without touching existing
      // allocations.
      if (impact.additionalPrice != null) {
        contract.totalAgorot += toAgorot(impact.additionalPrice);
      }
      if (Array.isArray(impact.newObligations)) {
        impact.newObligations.forEach((po, i) => {
          const idx = contract.performanceObligations.length + i;
          contract.performanceObligations.push({
            id: po.id || `PO-MOD-${idx + 1}`,
            description: po.description || po.id,
            descriptionHe: po.descriptionHe || po.description || po.id,
            standaloneSSPAgorot: toAgorot(po.standaloneSSP),
            allocatedAgorot: toAgorot(po.allocatedAmount != null ? po.allocatedAmount : po.standaloneSSP),
            timing: po.timing || TIMING_TYPES.POINT,
            recognitionMethod: po.recognitionMethod || RECOGNITION_METHODS.OUTPUT,
            satisfied: false,
            satisfiedDate: null,
            satisfiedProof: null,
            recognizedAgorot: 0,
            recognitions: [],
            billings: [],
            subscriptionSchedule: null,
            incurredCostAgorot: 0,
            totalExpectedCostAgorot: 0,
          });
        });
      }
    } else if (modificationType === MODIFICATION_TYPES.PROSPECTIVE) {
      // §21(a) — termination of existing contract + creation of a new
      // one. Remaining (unrecognized) consideration + additional
      // price is re-allocated across remaining + new obligations
      // using relative SSP.
      const remainingObligations = contract.performanceObligations.filter(o => !o.satisfied);
      const newOnes = (impact.newObligations || []).map((po, i) => ({
        id: po.id || `PO-MOD-${contract.performanceObligations.length + i + 1}`,
        description: po.description || po.id,
        descriptionHe: po.descriptionHe || po.description || po.id,
        standaloneSSPAgorot: toAgorot(po.standaloneSSP),
        allocatedAgorot: 0,
        timing: po.timing || TIMING_TYPES.POINT,
        recognitionMethod: po.recognitionMethod || RECOGNITION_METHODS.OUTPUT,
        satisfied: false,
        satisfiedDate: null,
        satisfiedProof: null,
        recognizedAgorot: 0,
        recognitions: [],
        billings: [],
        subscriptionSchedule: null,
        incurredCostAgorot: 0,
        totalExpectedCostAgorot: 0,
      }));

      // Unrecognized consideration = sum of allocated − recognized
      // over all remaining obligations.
      const unrecognizedAgorot = remainingObligations.reduce(
        (s, o) => s + (o.allocatedAgorot - o.recognizedAgorot),
        0
      );
      const additionalAgorot = toAgorot(impact.additionalPrice || 0);
      const poolAgorot = unrecognizedAgorot + additionalAgorot;
      contract.totalAgorot += additionalAgorot;

      const pool = [...remainingObligations, ...newOnes];
      if (pool.length > 0) {
        const totalSSP = pool.reduce((s, o) => s + o.standaloneSSPAgorot, 0);
        let assigned = 0;
        pool.forEach((o, i) => {
          let newAlloc;
          if (totalSSP === 0) {
            newAlloc = Math.floor(poolAgorot / pool.length);
          } else if (i === pool.length - 1) {
            newAlloc = poolAgorot - assigned;
          } else {
            newAlloc = Math.floor((poolAgorot * o.standaloneSSPAgorot) / totalSSP);
            assigned += newAlloc;
          }
          // The new allocated amount is the recognized-so-far plus
          // the re-allocated remainder.
          o.allocatedAgorot = o.recognizedAgorot + newAlloc;
        });
      }

      newOnes.forEach(o => contract.performanceObligations.push(o));
    } else if (modificationType === MODIFICATION_TYPES.RETROSPECTIVE) {
      // §21(b) — cumulative catch-up. The modification is treated as
      // if it were part of the original contract from day 1. We
      // adjust allocated amounts across *all* obligations (both
      // satisfied and not) based on the revised total, and book a
      // catch-up recognition equal to the difference between the
      // new cumulative recognized and the old cumulative recognized.
      const revisedTotalAgorot = impact.revisedTotal != null
        ? toAgorot(impact.revisedTotal)
        : contract.totalAgorot + toAgorot(impact.additionalPrice || 0);

      contract.totalAgorot = revisedTotalAgorot;

      // Re-allocate total on relative SSP across all obligations
      const all = contract.performanceObligations;
      const totalSSP = all.reduce((s, o) => s + o.standaloneSSPAgorot, 0);
      let assigned = 0;
      const oldAllocated = all.map(o => o.allocatedAgorot);
      all.forEach((o, i) => {
        let newAlloc;
        if (totalSSP === 0) {
          newAlloc = Math.floor(revisedTotalAgorot / all.length);
        } else if (i === all.length - 1) {
          newAlloc = revisedTotalAgorot - assigned;
        } else {
          newAlloc = Math.floor((revisedTotalAgorot * o.standaloneSSPAgorot) / totalSSP);
          assigned += newAlloc;
        }
        o.allocatedAgorot = newAlloc;
      });

      // For each over-time obligation that has been partially
      // recognized, book a catch-up so cumulative recognition =
      // (new_allocated × old_progress_ratio). For satisfied point-in-
      // time obligations, the recognized amount is reset to the new
      // allocated amount (a direct catch-up).
      all.forEach((o, i) => {
        if (o.satisfied && o.timing === TIMING_TYPES.POINT) {
          const delta = o.allocatedAgorot - o.recognizedAgorot;
          if (delta !== 0) {
            o.recognizedAgorot += delta;
            catchUpAgorot += delta;
            o.recognitions.push({
              type: EVENT_TYPES.RECOGNIZED,
              at: new Date().toISOString().slice(0, 10),
              period: new Date().toISOString().slice(0, 7),
              method: 'retrospective-catch-up',
              amountAgorot: delta,
              amount: toShekels(delta),
              cumulativeAgorot: o.recognizedAgorot,
              cumulative: toShekels(o.recognizedAgorot),
              note: 'IFRS 15 §21(b) catch-up',
            });
          }
        } else if (o.timing === TIMING_TYPES.OVER_TIME && oldAllocated[i] > 0 && o.recognizedAgorot > 0) {
          const oldRatio = o.recognizedAgorot / oldAllocated[i];
          const target = Math.floor(o.allocatedAgorot * oldRatio);
          const delta = target - o.recognizedAgorot;
          if (delta !== 0) {
            o.recognizedAgorot = target;
            catchUpAgorot += delta;
            o.recognitions.push({
              type: EVENT_TYPES.RECOGNIZED,
              at: new Date().toISOString().slice(0, 10),
              period: new Date().toISOString().slice(0, 7),
              method: 'retrospective-catch-up',
              amountAgorot: delta,
              amount: toShekels(delta),
              cumulativeAgorot: o.recognizedAgorot,
              cumulative: toShekels(o.recognizedAgorot),
              note: 'IFRS 15 §21(b) catch-up',
            });
          }
        }
      });
    }

    return {
      modificationType,
      priorVersion: modEntry.priorVersion,
      newVersion: modEntry.newVersion,
      catchUpAgorot,
      catchUp: toShekels(catchUpAgorot),
      contract: deepClone(contract),
    };
  }

  /* ---------- Balance functions ------------------------------- */

  /**
   * Deferred balance (unearned revenue) — the sum, across all
   * obligations, of (allocated − recognized) up to `asOfDate`. This
   * is the amount the entity still owes the customer in goods or
   * services.
   *
   * @param {string} contractId
   * @param {string} [asOfDate] ISO date
   * @returns {number} ₪
   */
  deferredBalance(contractId, asOfDate) {
    const contract = this._mustGetContract(contractId);
    const asOf = toISO(asOfDate) || toISO(new Date());
    let totalAgorot = 0;
    for (const po of contract.performanceObligations) {
      const recognizedAsOf = po.recognitions
        .filter(r => isOnOrBefore(r.at, asOf))
        .reduce((s, r) => s + r.amountAgorot, 0);
      totalAgorot += (po.allocatedAgorot - recognizedAsOf);
    }
    return toShekels(totalAgorot);
  }

  /**
   * Contract asset — "unbilled receivable" (IFRS 15 §107). When
   * cumulative recognized revenue exceeds cumulative billed amount,
   * the entity has a receivable of the recognition-in-excess.
   *
   * @returns {number} ₪ (positive only; 0 if billing ≥ recognition)
   */
  unbilledReceivable(contractId) {
    const contract = this._mustGetContract(contractId);
    const recognizedAgorot = this._cumulativeRecognized(contract);
    const billedAgorot = this._cumulativeBilled(contract);
    const diff = recognizedAgorot - billedAgorot;
    return diff > 0 ? toShekels(diff) : 0;
  }

  /**
   * Contract liability — "deferred revenue" (IFRS 15 §106). When
   * cumulative billed amount exceeds cumulative recognized revenue,
   * the entity owes the customer the billing-in-excess.
   *
   * @returns {number} ₪ (positive only; 0 if recognition ≥ billing)
   */
  contractLiability(contractId) {
    const contract = this._mustGetContract(contractId);
    const recognizedAgorot = this._cumulativeRecognized(contract);
    const billedAgorot = this._cumulativeBilled(contract);
    const diff = billedAgorot - recognizedAgorot;
    return diff > 0 ? toShekels(diff) : 0;
  }

  /* ---------- Roll-forward ------------------------------------ */

  /**
   * Roll-forward of the contract-liability / deferred-revenue
   * position for a period.
   *
   *   opening + additions − recognized = closing
   *
   * IFRS 15 §118(c) requires a qualitative explanation of changes
   * in contract asset/liability; this function supplies the
   * quantitative movements.
   *
   * @param {string} period 'YYYY-MM' or 'YYYY'
   * @returns {{period, opening, additions, recognized, modifications, closing, byContract}}
   */
  rolloForward(period) {
    let opening = 0;
    let additions = 0;
    let recognized = 0;
    let modifications = 0;
    const byContract = [];

    for (const contract of this._contracts.values()) {
      // Per-contract opening = billings before period − recognized
      // before period (positive side only = liability).
      const start = this._periodStart(period);
      const end = this._periodEnd(period);

      const billedBefore = this._billingsBefore(contract, start);
      const recognizedBefore = this._recognitionsBefore(contract, start);
      const openAgorot = Math.max(0, billedBefore - recognizedBefore);

      const billedIn = this._billingsBetween(contract, start, end);
      const recognizedIn = this._recognitionsBetween(contract, start, end);
      const modsIn = contract.modifications.filter(m => periodMatches(m.at, period)).length;

      const billedAfter = billedBefore + billedIn;
      const recognizedAfter = recognizedBefore + recognizedIn;
      const closeAgorot = Math.max(0, billedAfter - recognizedAfter);

      opening += openAgorot;
      additions += billedIn;
      recognized += recognizedIn;
      modifications += modsIn;

      byContract.push({
        contractId: contract.id,
        customerId: contract.customerId,
        opening: toShekels(openAgorot),
        additions: toShekels(billedIn),
        recognized: toShekels(recognizedIn),
        closing: toShekels(closeAgorot),
        modifications: modsIn,
      });
    }

    const closingAgorot = opening + additions - recognized;

    return {
      period,
      opening: toShekels(opening),
      additions: toShekels(additions),
      recognized: toShekels(recognized),
      modifications,
      closing: toShekels(closingAgorot),
      byContract,
      formula_he: 'פתיחה + תוספות − הוכר = סגירה',
      formula_en: 'opening + additions − recognized = closing',
    };
  }

  /* ---------- Disclosure report ------------------------------- */

  /**
   * IFRS 15 §110–§129 disclosures bundled into one report.
   *
   * Returns:
   *   • remainingPerformanceObligations (§120) — the amount and
   *     timing of unsatisfied obligations ("backlog").
   *   • contractAssetsLiabilities (§116, §118)
   *   • revenueRecognized (§113(a))
   *   • vatReconciliation — Israeli specific: the gap between
   *     billed-to-date and recognized-to-date, to reconcile with
   *     the VAT report for the period.
   *   • cashBasisTaxable — when mode = 'cash-basis', the collected
   *     amount the Israeli tax authority expects as taxable income.
   */
  disclosureReport(period) {
    let backlogAgorot = 0;
    let recognizedAgorot = 0;
    let billedAgorot = 0;
    let contractAssetAgorot = 0;
    let contractLiabilityAgorot = 0;
    const byContract = [];

    for (const contract of this._contracts.values()) {
      const billedInPeriod = this._billingsBetween(
        contract,
        this._periodStart(period),
        this._periodEnd(period)
      );
      const recognizedInPeriod = this._recognitionsBetween(
        contract,
        this._periodStart(period),
        this._periodEnd(period)
      );
      const cumRec = this._cumulativeRecognized(contract);
      const cumBilled = this._cumulativeBilled(contract);

      backlogAgorot += (contract.totalAgorot - cumRec);
      recognizedAgorot += recognizedInPeriod;
      billedAgorot += billedInPeriod;
      if (cumRec > cumBilled) contractAssetAgorot += (cumRec - cumBilled);
      else contractLiabilityAgorot += (cumBilled - cumRec);

      byContract.push({
        contractId: contract.id,
        customerId: contract.customerId,
        totalAgorot: contract.totalAgorot,
        total: toShekels(contract.totalAgorot),
        cumulativeRecognized: toShekels(cumRec),
        cumulativeBilled: toShekels(cumBilled),
        remaining: toShekels(contract.totalAgorot - cumRec),
        contractAsset: toShekels(Math.max(0, cumRec - cumBilled)),
        contractLiability: toShekels(Math.max(0, cumBilled - cumRec)),
      });
    }

    const vatAgorot = Math.round(billedAgorot * this._opts.vatRate);
    // Cash-basis taxable income (Israeli tax authority preference
    // for עסק פטור / small services business) — we approximate as
    // "billed & collected" — in practice the caller's ERP knows
    // collection status; here we use billed as a proxy and flag it.
    const cashBasisTaxable = this._opts.mode === MODES.CASH_BASIS
      ? toShekels(billedAgorot)
      : null;

    return {
      period,
      he: {
        title: 'דוח גילוי IFRS 15 — תקופה ' + String(period),
        backlog: `יתרת מחויבויות לא מומשות (backlog): ${formatILS(backlogAgorot)}`,
        recognized: `הכנסות שהוכרו בתקופה: ${formatILS(recognizedAgorot)}`,
        billed: `חיובים בתקופה: ${formatILS(billedAgorot)}`,
        contractAsset: `נכס חוזי (חשבון חייבים לא שולחן): ${formatILS(contractAssetAgorot)}`,
        contractLiability: `התחייבות חוזית (הכנסות מראש): ${formatILS(contractLiabilityAgorot)}`,
        vat: `מע"מ על פי חשבוניות שיצאו (${(this._opts.vatRate * 100).toFixed(0)}%): ${formatILS(vatAgorot)}`,
      },
      en: {
        title: 'IFRS 15 Disclosure Report — period ' + String(period),
        backlog: `Remaining performance obligations (backlog): ${formatILS(backlogAgorot)}`,
        recognized: `Revenue recognized in period: ${formatILS(recognizedAgorot)}`,
        billed: `Billed in period: ${formatILS(billedAgorot)}`,
        contractAsset: `Contract asset (unbilled receivable): ${formatILS(contractAssetAgorot)}`,
        contractLiability: `Contract liability (deferred revenue): ${formatILS(contractLiabilityAgorot)}`,
        vat: `VAT on issued tax invoices (${(this._opts.vatRate * 100).toFixed(0)}%): ${formatILS(vatAgorot)}`,
      },
      totals: {
        backlogAgorot,
        backlog: toShekels(backlogAgorot),
        recognizedAgorot,
        recognized: toShekels(recognizedAgorot),
        billedAgorot,
        billed: toShekels(billedAgorot),
        contractAssetAgorot,
        contractAsset: toShekels(contractAssetAgorot),
        contractLiabilityAgorot,
        contractLiability: toShekels(contractLiabilityAgorot),
        vatAgorot,
        vat: toShekels(vatAgorot),
      },
      vatReconciliation: {
        note_he: 'בישראל: מע"מ מדווח על מועד הוצאת חשבונית המס, ללא קשר למועד ההכרה לפי IFRS 15. פער=חיובים-הכרה.',
        note_en: 'Israel: VAT is reported on the date of tax-invoice issuance, regardless of IFRS 15 recognition date. Gap = billed − recognized.',
        period,
        billed: toShekels(billedAgorot),
        recognized: toShekels(recognizedAgorot),
        gap: toShekels(billedAgorot - recognizedAgorot),
        vatRate: this._opts.vatRate,
        vatPayable: toShekels(vatAgorot),
      },
      cashBasisTaxable,
      mode: this._opts.mode,
      byContract,
    };
  }

  /* ---------- Queries / getters ------------------------------- */

  getContract(id) {
    const c = this._contracts.get(id);
    return c ? deepClone(c) : null;
  }

  listContracts() {
    return Array.from(this._contracts.values()).map(deepClone);
  }

  /* ---------- Internal helpers -------------------------------- */

  _mustGetContract(id) {
    const c = this._contracts.get(id);
    if (!c) {
      throw err(
        `חוזה ${id} לא נמצא`,
        `Contract ${id} not found`,
        'CONTRACT_NOT_FOUND'
      );
    }
    return c;
  }

  _mustGetObligation(contract, obligationId) {
    const po = contract.performanceObligations.find(o => o.id === obligationId);
    if (!po) {
      throw err(
        `מחויבות ${obligationId} לא נמצאה בחוזה ${contract.id}`,
        `Obligation ${obligationId} not found in contract ${contract.id}`,
        'OBLIGATION_NOT_FOUND'
      );
    }
    return po;
  }

  _cumulativeRecognized(contract) {
    let total = 0;
    for (const po of contract.performanceObligations) {
      total += po.recognizedAgorot;
    }
    return total;
  }

  _cumulativeBilled(contract) {
    let total = 0;
    for (const po of contract.performanceObligations) {
      for (const b of po.billings) total += b.amountAgorot;
    }
    if (Array.isArray(contract.contractBillings)) {
      for (const b of contract.contractBillings) total += b.amountAgorot;
    }
    return total;
  }

  _billingsBefore(contract, isoDate) {
    if (!isoDate) return 0;
    let total = 0;
    for (const po of contract.performanceObligations) {
      for (const b of po.billings) {
        if (isBefore(b.at, isoDate)) total += b.amountAgorot;
      }
    }
    if (Array.isArray(contract.contractBillings)) {
      for (const b of contract.contractBillings) {
        if (isBefore(b.at, isoDate)) total += b.amountAgorot;
      }
    }
    return total;
  }

  _billingsBetween(contract, startIso, endIso) {
    let total = 0;
    const inRange = (at) => {
      if (startIso && isBefore(at, startIso)) return false;
      if (endIso && !isOnOrBefore(at, endIso)) return false;
      return true;
    };
    for (const po of contract.performanceObligations) {
      for (const b of po.billings) if (inRange(b.at)) total += b.amountAgorot;
    }
    if (Array.isArray(contract.contractBillings)) {
      for (const b of contract.contractBillings) if (inRange(b.at)) total += b.amountAgorot;
    }
    return total;
  }

  _recognitionsBefore(contract, isoDate) {
    if (!isoDate) return 0;
    let total = 0;
    for (const po of contract.performanceObligations) {
      for (const r of po.recognitions) {
        if (isBefore(r.at, isoDate)) total += r.amountAgorot;
      }
    }
    return total;
  }

  _recognitionsBetween(contract, startIso, endIso) {
    let total = 0;
    const inRange = (at) => {
      if (startIso && isBefore(at, startIso)) return false;
      if (endIso && !isOnOrBefore(at, endIso)) return false;
      return true;
    };
    for (const po of contract.performanceObligations) {
      for (const r of po.recognitions) if (inRange(r.at)) total += r.amountAgorot;
    }
    return total;
  }

  _periodStart(period) {
    if (!period) return null;
    if (typeof period === 'object') return toISO(period.start);
    if (/^\d{4}$/.test(period)) return `${period}-01-01`;
    if (/^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
    return null;
  }

  _periodEnd(period) {
    if (!period) return null;
    if (typeof period === 'object') return toISO(period.end);
    if (/^\d{4}$/.test(period)) return `${period}-12-31`;
    if (/^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return `${period}-${String(last).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
    return null;
  }

  /* ==============================================================
   * ============  UPGRADE v1.1 — spec-aligned API  ==============
   * ==============================================================
   *
   * The upgrade layer below is ADDITIVE only. It provides the
   * spec-required method names (identifyContract, determineTransaction
   * Price, allocateTransactionPrice, straightLineRecognition,
   * percentageOfCompletion, milestoneRecognition, contractModification,
   * journalEntry, billingSchedule, reconcile, exportForAudit,
   * deferredRevenueRollforward) on top of the v1.0 surface without
   * removing any existing behaviour.
   *
   * House rule: לא מוחקים — רק משדרגים ומגדלים.
   * ============================================================ */

  /* ---------- Step 1 (spec alias): identifyContract ------------- */

  /**
   * IFRS 15 Step 1 — Identify the contract with a customer
   * (זיהוי החוזה עם הלקוח).
   *
   * Thin alias over `createContract()` with the spec-required
   * parameter shape. Supports either `total` or `totalAmount`,
   * `signedDate` (defaults to today), and either `performanceObligations`
   * as an array of PO descriptors or omitted for later identification.
   *
   * @param {{
   *   customerId: string,
   *   totalAmount?: number,
   *   total?: number,
   *   signedDate?: string,
   *   startDate?: string,
   *   endDate?: string,
   *   performanceObligations?: Array<object>,
   *   id?: string,
   *   terms?: string,
   * }} input
   * @returns {object} contract (clone)
   */
  identifyContract(input) {
    const total = input && (input.totalAmount != null ? input.totalAmount : input.total);
    const obligations = Array.isArray(input && input.performanceObligations)
      ? input.performanceObligations
      : [];
    const contract = this.createContract({
      id: input && input.id,
      customerId: input && input.customerId,
      total,
      terms: input && input.terms,
      startDate: input && input.startDate,
      endDate: input && input.endDate,
      performanceObligations: obligations.length > 0
        ? obligations
        : [{ id: 'PO-placeholder', standaloneSSP: Number(total) || 0, timing: 'point' }],
    });
    const signedDate = toISO(input && input.signedDate) || toISO(new Date());
    const stored = this._contracts.get(contract.id);
    if (stored) {
      stored.signedDate = signedDate;
      stored.step1_identified = true;
    }
    return deepClone(stored || contract);
  }

  /* ---------- Step 2 (spec alias): list obligations ------------- */

  /**
   * IFRS 15 Step 2 — Identify the performance obligations
   * (זיהוי מחויבויות הביצוע).
   *
   * Returns the list of distinct obligations on a contract, with
   * their descriptions, timings and standalone selling prices.
   *
   * @param {string} contractId
   * @returns {Array<object>}
   */
  identifyPerformanceObligations(contractId) {
    const contract = this._mustGetContract(contractId);
    return contract.performanceObligations.map(po => ({
      id: po.id,
      description: po.description,
      descriptionHe: po.descriptionHe,
      standaloneSSP: toShekels(po.standaloneSSPAgorot),
      timing: po.timing,
      recognitionMethod: po.recognitionMethod,
      allocatedAmount: toShekels(po.allocatedAgorot),
      satisfied: po.satisfied,
    }));
  }

  /* ---------- Step 3: determine transaction price --------------- */

  /**
   * IFRS 15 Step 3 — Determine the transaction price
   * (קביעת מחיר העסקה).
   *
   * Adjusts the contract total for:
   *   • variable consideration (§50) — e.g. volume rebates, bonuses,
   *     liquidated damages. Positive = addition, negative = discount.
   *   • significant financing component (§60) — when payment and
   *     performance are materially time-separated, the present value
   *     is recognized as revenue and interest as financing.
   *
   * Append-only: the adjustment is recorded on `contract.priceAdjustments[]`
   * and re-allocated across obligations using relative SSP.
   *
   * @param {string} contractId
   * @param {{variableConsideration?: number, financingComponent?: number, note?: string}} input
   * @returns {{totalAgorot, total, adjustmentAgorot, allocations}}
   */
  determineTransactionPrice(contractId, input = {}) {
    const contract = this._mustGetContract(contractId);
    const varA = toAgorot(input.variableConsideration || 0);
    const finA = toAgorot(input.financingComponent || 0);
    const adjustment = varA + finA;

    if (!Array.isArray(contract.priceAdjustments)) contract.priceAdjustments = [];
    contract.priceAdjustments.push({
      at: new Date().toISOString(),
      variableConsiderationAgorot: varA,
      variableConsideration: toShekels(varA),
      financingComponentAgorot: finA,
      financingComponent: toShekels(finA),
      deltaAgorot: adjustment,
      delta: toShekels(adjustment),
      note: input.note || '',
    });

    contract.totalAgorot += adjustment;

    // Re-allocate across all obligations by relative SSP.
    const alloc = this.allocatePrice({
      transactionPrice: toShekels(contract.totalAgorot),
      obligations: contract.performanceObligations.map(o => ({
        id: o.id,
        standaloneSSP: toShekels(o.standaloneSSPAgorot),
      })),
    });
    for (const po of contract.performanceObligations) {
      const a = alloc.allocations.find(x => x.id === po.id);
      if (a) po.allocatedAgorot = a.allocatedAgorot;
    }

    contract.events.push({
      type: EVENT_TYPES.PRICE_ALLOCATED,
      at: new Date().toISOString(),
      data: {
        source: 'determineTransactionPrice',
        variableConsiderationAgorot: varA,
        financingComponentAgorot: finA,
        newTotalAgorot: contract.totalAgorot,
      },
    });

    return {
      totalAgorot: contract.totalAgorot,
      total: toShekels(contract.totalAgorot),
      adjustmentAgorot: adjustment,
      adjustment: toShekels(adjustment),
      allocations: alloc.allocations,
    };
  }

  /* ---------- Step 4 (spec alias): allocateTransactionPrice ---- */

  /**
   * IFRS 15 Step 4 — Allocate the transaction price
   * (הקצאת מחיר העסקה למחויבויות הביצוע).
   *
   * Two allocation methods supported:
   *   - 'relative-SSP' (default, §74)
   *   - 'residual'     (§79(c)) — when SSP of one or more obligations
   *                    is highly variable / uncertain, the residual
   *                    is allocated to the last obligation.
   *
   * @param {string} contractId
   * @param {'relative-SSP'|'residual'} [allocationMethod]
   * @returns {{method, allocations: Array<{id, allocated}>}}
   */
  allocateTransactionPrice(contractId, allocationMethod = 'relative-SSP') {
    const contract = this._mustGetContract(contractId);
    if (allocationMethod !== 'relative-SSP' && allocationMethod !== 'residual') {
      throw err(
        `שיטת הקצאה לא נתמכת: ${allocationMethod}`,
        `Unsupported allocation method: ${allocationMethod}`,
        'INVALID_ALLOC_METHOD'
      );
    }

    const priceAgorot = contract.totalAgorot;
    const pos = contract.performanceObligations;

    if (allocationMethod === 'residual') {
      // §79(c) — allocate each PO with observable SSP at its SSP;
      // the residual goes to the last (marked) obligation. Our
      // convention: the PO with the highest `standaloneSSPAgorot`
      // or flagged `po.residual = true` receives the residual.
      let residualIdx = pos.findIndex(p => p.residual === true);
      if (residualIdx < 0) residualIdx = pos.length - 1;
      let sumOthers = 0;
      pos.forEach((po, i) => {
        if (i !== residualIdx) {
          po.allocatedAgorot = po.standaloneSSPAgorot;
          sumOthers += po.standaloneSSPAgorot;
        }
      });
      pos[residualIdx].allocatedAgorot = priceAgorot - sumOthers;
      contract.events.push({
        type: EVENT_TYPES.PRICE_ALLOCATED,
        at: new Date().toISOString(),
        data: { method: 'residual', residualObligationId: pos[residualIdx].id },
      });
      return {
        method: 'residual',
        allocations: pos.map(p => ({
          id: p.id,
          allocatedAgorot: p.allocatedAgorot,
          allocated: toShekels(p.allocatedAgorot),
        })),
      };
    }

    // relative-SSP (default)
    const alloc = this.allocatePrice({
      transactionPrice: toShekels(priceAgorot),
      obligations: pos.map(p => ({
        id: p.id,
        standaloneSSP: toShekels(p.standaloneSSPAgorot),
      })),
    });
    for (const po of pos) {
      const a = alloc.allocations.find(x => x.id === po.id);
      if (a) po.allocatedAgorot = a.allocatedAgorot;
    }
    contract.events.push({
      type: EVENT_TYPES.PRICE_ALLOCATED,
      at: new Date().toISOString(),
      data: { method: 'relative-SSP', source: 'allocateTransactionPrice' },
    });
    return {
      method: 'relative-SSP',
      allocations: alloc.allocations,
    };
  }

  /* ---------- Straight-line (subscriptions / licences) --------- */

  /**
   * Straight-line revenue recognition for time-based obligations
   * (licences, subscriptions, support contracts). Implements the
   * IFRS 15 §B14–§B17 "series of distinct goods/services" guidance.
   *
   * Given a PO (id and contractId) and a period ('YYYY-MM'), returns
   * the portion of the allocated amount that should be recognized in
   * that period, recognizes it, and returns the entry.
   *
   * Requires the contract to have `startDate` and `endDate` or the
   * PO to carry its own `startDate`/`endDate`.
   *
   * @param {{contractId: string, obligationId: string}} poRef
   * @param {string} period 'YYYY-MM'
   * @returns {{amountAgorot, amount, entry}}
   */
  straightLineRecognition(poRef, period) {
    const contract = this._mustGetContract(poRef.contractId);
    const po = this._mustGetObligation(contract, poRef.obligationId);
    if (po.timing !== TIMING_TYPES.OVER_TIME) {
      po.timing = TIMING_TYPES.OVER_TIME;
    }
    const start = toISO(po.startDate || contract.startDate);
    const end = toISO(po.endDate || contract.endDate);
    if (!start || !end) {
      throw err(
        'straight-line מחייב startDate ו-endDate',
        'straightLineRecognition requires startDate and endDate',
        'MISSING_DATES'
      );
    }
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    const totalMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    const perMonthAgorot = Math.floor(po.allocatedAgorot / totalMonths);
    const residue = po.allocatedAgorot - perMonthAgorot * totalMonths;

    // Final month absorbs the residue.
    const [py, pm] = period.split('-').map(Number);
    const monthIndex = (py - sy) * 12 + (pm - sm);
    if (monthIndex < 0 || monthIndex >= totalMonths) {
      throw err(
        `התקופה ${period} מחוץ לטווח החוזה ${start}..${end}`,
        `Period ${period} is outside contract range ${start}..${end}`,
        'OUT_OF_RANGE'
      );
    }
    const amountAgorot = monthIndex === totalMonths - 1
      ? perMonthAgorot + residue
      : perMonthAgorot;

    // Use the over-time recognizer with explicit amount.
    const res = this.recognizeRevenue({
      contractId: contract.id,
      obligationId: po.id,
      amount: toShekels(amountAgorot),
      method: RECOGNITION_METHODS.OUTPUT,
      period,
      date: `${period}-01`,
      note: `straight-line month ${monthIndex + 1}/${totalMonths}`,
    });
    return {
      amountAgorot: res.recognizedAgorot,
      amount: res.recognized,
      totalMonths,
      monthIndex: monthIndex + 1,
      entry: res.entry,
    };
  }

  /* ---------- Percentage-of-completion ------------------------- */

  /**
   * Percentage-of-completion (cost-to-cost) for construction and
   * long-term contracts. This is the legacy IAS 11 POC method,
   * permissible under IFRS 15 §B19 as an INPUT method.
   *
   * @param {{contractId: string, obligationId: string}} poRef
   * @param {{incurredCost: number, totalExpectedCost: number, date?: string, period?: string}} costs
   * @returns {{percentage, recognizedAgorot, recognized, cumulativeAgorot, cumulative}}
   */
  percentageOfCompletion(poRef, costs) {
    const contract = this._mustGetContract(poRef.contractId);
    const po = this._mustGetObligation(contract, poRef.obligationId);
    if (po.timing !== TIMING_TYPES.OVER_TIME) po.timing = TIMING_TYPES.OVER_TIME;
    const res = this.recognizeRevenue({
      contractId: contract.id,
      obligationId: po.id,
      incurredCost: costs.incurredCost,
      totalExpectedCost: costs.totalExpectedCost,
      method: RECOGNITION_METHODS.COST_TO_COST,
      date: costs.date,
      period: costs.period,
      note: 'percentage-of-completion',
    });
    const pct = costs.totalExpectedCost > 0
      ? Math.min(1, costs.incurredCost / costs.totalExpectedCost)
      : 0;
    return {
      percentage: pct,
      percentageStr: `${(pct * 100).toFixed(2)}%`,
      recognizedAgorot: res.recognizedAgorot,
      recognized: res.recognized,
      cumulativeAgorot: res.cumulativeAgorot,
      cumulative: res.cumulative,
      entry: res.entry,
    };
  }

  /* ---------- Milestone recognition ---------------------------- */

  /**
   * Milestone-based revenue recognition for project POs. Recognizes
   * a fixed amount when a milestone is marked complete. If the PO
   * is marked over-time, each milestone bumps cumulative recognition
   * by its weight proportion of the allocated amount; otherwise the
   * amount is taken as a direct ₪ figure per milestone.
   *
   * Milestones shape:
   *   [{ id, name, complete: boolean, weight?: number, amount?: number, date?: string }]
   *
   * @param {{contractId: string, obligationId: string}} poRef
   * @param {Array<{id, name, complete, weight?, amount?, date?}>} milestones
   * @returns {{recognizedAgorot, recognized, milestonesCompleted, entries}}
   */
  milestoneRecognition(poRef, milestones) {
    const contract = this._mustGetContract(poRef.contractId);
    const po = this._mustGetObligation(contract, poRef.obligationId);
    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw err('נדרשת רשימת אבני דרך', 'milestones array required', 'NO_MILESTONES');
    }
    if (po.timing !== TIMING_TYPES.OVER_TIME) po.timing = TIMING_TYPES.OVER_TIME;

    if (!Array.isArray(po.milestones)) po.milestones = [];

    let recognizedTotalAgorot = 0;
    const entries = [];
    let completedCount = 0;

    // If any milestone carries a `weight`, compute share of allocation
    // by sum of weights.
    const totalWeight = milestones.reduce((s, m) => s + (m.weight || 0), 0);

    for (const m of milestones) {
      if (!m.complete) continue;
      completedCount += 1;
      const already = po.milestones.find(x => x.id === m.id && x.recognized);
      if (already) continue;

      let amountAgorot;
      if (m.amount != null) {
        amountAgorot = toAgorot(m.amount);
      } else if (m.weight != null && totalWeight > 0) {
        amountAgorot = Math.floor((po.allocatedAgorot * m.weight) / totalWeight);
      } else {
        // Equal split across all milestones
        amountAgorot = Math.floor(po.allocatedAgorot / milestones.length);
      }

      // Don't exceed cumulative cap.
      const remaining = po.allocatedAgorot - po.recognizedAgorot;
      if (amountAgorot > remaining) amountAgorot = remaining;
      if (amountAgorot < 0) amountAgorot = 0;

      const res = this.recognizeRevenue({
        contractId: contract.id,
        obligationId: po.id,
        amount: toShekels(amountAgorot),
        method: RECOGNITION_METHODS.OUTPUT,
        date: m.date,
        note: `milestone ${m.id}: ${m.name || ''}`.trim(),
      });
      po.milestones.push({
        id: m.id,
        name: m.name || '',
        recognized: true,
        at: toISO(m.date) || toISO(new Date()),
        amountAgorot,
        amount: toShekels(amountAgorot),
      });
      entries.push(res.entry);
      recognizedTotalAgorot += res.recognizedAgorot;
    }

    return {
      recognizedAgorot: recognizedTotalAgorot,
      recognized: toShekels(recognizedTotalAgorot),
      milestonesCompleted: completedCount,
      entries,
    };
  }

  /* ---------- Contract modification (spec alias) --------------- */

  /**
   * IFRS 15 §18–§21 contract modification — spec alias.
   * Thin wrapper over `modifyContract` accepting `change` instead of
   * `modificationType` + `impact`, to match the spec surface.
   *
   * @param {{contractId: string, change: {type: 'separate'|'prospective'|'retrospective', ...}}} input
   */
  contractModification(input) {
    const { contractId, change = {} } = input || {};
    const type = change.type || change.modificationType;
    const impact = {
      additionalPrice: change.additionalPrice,
      newObligations: change.newObligations,
      revisedTotal: change.revisedTotal,
      ...change.impact,
    };
    return this.modifyContract({
      contractId,
      modificationType: type,
      impact,
    });
  }

  /* ---------- Billing schedule --------------------------------- */

  /**
   * Return the invoicing schedule for a contract independent of
   * recognition. This is what the AR team uses to know when to issue
   * tax invoices (חשבוניות מס), and is separate from IFRS 15
   * recognition timing.
   *
   * Schedule is derived from:
   *   • recorded billings (`recordBilling()`)
   *   • scheduled subscription periods (`scheduleSubscription()`)
   *
   * @param {string} contractId
   * @returns {{contractId, billings: Array, scheduled: Array, totalBilledAgorot, totalBilled}}
   */
  billingSchedule(contractId) {
    const contract = this._mustGetContract(contractId);
    const billings = [];
    for (const po of contract.performanceObligations) {
      for (const b of po.billings) {
        billings.push({
          obligationId: po.id,
          at: b.at,
          period: b.at.slice(0, 7),
          amountAgorot: b.amountAgorot,
          amount: b.amount,
          invoice: b.invoice,
          vatAgorot: b.vatAgorot,
        });
      }
    }
    if (Array.isArray(contract.contractBillings)) {
      for (const b of contract.contractBillings) {
        billings.push({
          obligationId: null,
          at: b.at,
          period: b.at.slice(0, 7),
          amountAgorot: b.amountAgorot,
          amount: b.amount,
          invoice: b.invoice,
          vatAgorot: b.vatAgorot,
        });
      }
    }
    billings.sort((a, b) => (a.at < b.at ? -1 : 1));

    const scheduled = [];
    for (const po of contract.performanceObligations) {
      if (po.subscriptionSchedule && Array.isArray(po.subscriptionSchedule.schedule)) {
        for (const row of po.subscriptionSchedule.schedule) {
          scheduled.push({
            obligationId: po.id,
            period: row.period,
            at: row.at,
            amountAgorot: row.amountAgorot,
            amount: row.amount,
            index: row.index,
          });
        }
      }
    }

    const totalBilledAgorot = billings.reduce((s, b) => s + b.amountAgorot, 0);

    return {
      contractId,
      billings,
      scheduled,
      totalBilledAgorot,
      totalBilled: toShekels(totalBilledAgorot),
      note_he: 'לוח החיוב (חשבוניות מס) נפרד מלוח ההכרה בהכנסה לפי IFRS 15.',
      note_en: 'The billing (tax-invoice) schedule is independent of IFRS 15 revenue recognition.',
    };
  }

  /* ---------- Deferred revenue roll-forward (spec alias) ------- */

  /**
   * Spec alias for `rolloForward()`. Accepts `{period}` object per
   * the spec surface.
   *
   * @param {{period: string}} input
   */
  deferredRevenueRollforward(input) {
    const period = input && input.period;
    return this.rolloForward(period);
  }

  /* ---------- Journal entries ---------------------------------- */

  /**
   * Generate double-entry journal entries for a contract (or a
   * specific type). Supported entry types:
   *
   *   - 'billing'      — DR Cash/AR   CR Deferred Revenue
   *                      (when invoice is issued ahead of delivery)
   *   - 'recognition'  — DR Deferred Revenue   CR Revenue
   *                      (when the PO is satisfied / progress made)
   *   - 'all'          — both (default)
   *
   * Amounts are in ₪; VAT is presented as a separate line on billing.
   *
   * @param {string} contractId
   * @param {'billing'|'recognition'|'all'} [type]
   * @returns {Array<{date, memo_he, memo_en, lines: Array<{account, dr, cr}>}>}
   */
  journalEntry(contractId, type = 'all') {
    const contract = this._mustGetContract(contractId);
    const entries = [];
    const vatRate = this._opts.vatRate;

    const pushBillings = () => {
      for (const po of contract.performanceObligations) {
        for (const b of po.billings) {
          const net = b.amountAgorot;
          const vat = Math.round(net * vatRate);
          entries.push({
            date: b.at,
            type: 'billing',
            contractId,
            obligationId: po.id,
            invoice: b.invoice,
            memo_he: `הוצאת חשבונית מס ${b.invoice || ''} — הכנסות מראש`,
            memo_en: `Tax invoice ${b.invoice || ''} issued — deferred revenue`,
            lines: [
              { account: 'AR / חייבים', dr: toShekels(net + vat), cr: 0 },
              { account: 'Deferred Revenue / הכנסות מראש', dr: 0, cr: toShekels(net) },
              { account: 'VAT Output / מע"מ עסקאות', dr: 0, cr: toShekels(vat) },
            ],
          });
        }
      }
      if (Array.isArray(contract.contractBillings)) {
        for (const b of contract.contractBillings) {
          const net = b.amountAgorot;
          const vat = Math.round(net * vatRate);
          entries.push({
            date: b.at,
            type: 'billing',
            contractId,
            obligationId: null,
            invoice: b.invoice,
            memo_he: `הוצאת חשבונית מס ${b.invoice || ''} — הכנסות מראש`,
            memo_en: `Tax invoice ${b.invoice || ''} issued — deferred revenue`,
            lines: [
              { account: 'AR / חייבים', dr: toShekels(net + vat), cr: 0 },
              { account: 'Deferred Revenue / הכנסות מראש', dr: 0, cr: toShekels(net) },
              { account: 'VAT Output / מע"מ עסקאות', dr: 0, cr: toShekels(vat) },
            ],
          });
        }
      }
    };

    const pushRecognitions = () => {
      for (const po of contract.performanceObligations) {
        for (const r of po.recognitions) {
          if (r.amountAgorot <= 0) continue;
          entries.push({
            date: r.at,
            type: 'recognition',
            contractId,
            obligationId: po.id,
            memo_he: `הכרה בהכנסה — IFRS 15 — ${po.descriptionHe || po.id}`,
            memo_en: `Revenue recognition — IFRS 15 — ${po.description || po.id}`,
            lines: [
              { account: 'Deferred Revenue / הכנסות מראש', dr: r.amount, cr: 0 },
              { account: 'Revenue / הכנסות', dr: 0, cr: r.amount },
            ],
          });
        }
      }
    };

    if (type === 'billing' || type === 'all') pushBillings();
    if (type === 'recognition' || type === 'all') pushRecognitions();

    // Sanity-check: each entry's debits must equal its credits.
    for (const e of entries) {
      const drSum = e.lines.reduce((s, l) => s + toAgorot(l.dr), 0);
      const crSum = e.lines.reduce((s, l) => s + toAgorot(l.cr), 0);
      if (drSum !== crSum) {
        throw err(
          `חוב-זכות לא מאוזנים בכניסה ${e.type}`,
          `Journal entry out of balance: ${e.type}`,
          'JE_IMBALANCED'
        );
      }
    }

    entries.sort((a, b) => (a.date < b.date ? -1 : 1));
    return entries;
  }

  /* ---------- Reconciliation ----------------------------------- */

  /**
   * Reconcile the deferred-revenue balance for a period. Asserts
   * the accounting identity:
   *
   *   opening + additions − recognized = closing
   *
   * and surfaces any exception (e.g. negative recognition, billing
   * above contract total). Returns a detailed reconciliation object
   * per contract.
   *
   * @param {string} period 'YYYY-MM' or 'YYYY'
   */
  reconcile(period) {
    const rf = this.rolloForward(period);
    const exceptions = [];
    const byContract = [];

    for (const contract of this._contracts.values()) {
      const totalAgorot = contract.totalAgorot;
      const cumRec = this._cumulativeRecognized(contract);
      const cumBilled = this._cumulativeBilled(contract);
      const deferred = Math.max(0, cumBilled - cumRec);
      const asset = Math.max(0, cumRec - cumBilled);

      if (cumRec > totalAgorot) {
        exceptions.push({
          code: 'OVER_RECOGNITION',
          contractId: contract.id,
          he: `חוזה ${contract.id}: ההכרה עולה על סכום החוזה`,
          en: `Contract ${contract.id}: recognition exceeds contract total`,
          totalAgorot,
          cumRec,
        });
      }
      if (cumBilled > totalAgorot * 1.5) {
        exceptions.push({
          code: 'OVER_BILLING',
          contractId: contract.id,
          he: `חוזה ${contract.id}: חיוב חורג מהותית מסכום החוזה`,
          en: `Contract ${contract.id}: billing exceeds 150% of contract total`,
          totalAgorot,
          cumBilled,
        });
      }
      byContract.push({
        contractId: contract.id,
        customerId: contract.customerId,
        totalAgorot,
        total: toShekels(totalAgorot),
        cumulativeRecognizedAgorot: cumRec,
        cumulativeRecognized: toShekels(cumRec),
        cumulativeBilledAgorot: cumBilled,
        cumulativeBilled: toShekels(cumBilled),
        contractLiabilityAgorot: deferred,
        contractLiability: toShekels(deferred),
        contractAssetAgorot: asset,
        contractAsset: toShekels(asset),
      });
    }

    // The core identity check.
    const identityHoldsAgorot = toAgorot(rf.opening) + toAgorot(rf.additions) - toAgorot(rf.recognized);
    const identityHolds = identityHoldsAgorot === toAgorot(rf.closing);

    return {
      period,
      rollforward: rf,
      identity: {
        he: 'פתיחה + תוספות − הוכר = סגירה',
        en: 'opening + additions − recognized = closing',
        holds: identityHolds,
      },
      openingAgorot: toAgorot(rf.opening),
      opening: rf.opening,
      additionsAgorot: toAgorot(rf.additions),
      additions: rf.additions,
      recognizedAgorot: toAgorot(rf.recognized),
      recognized: rf.recognized,
      closingAgorot: toAgorot(rf.closing),
      closing: rf.closing,
      exceptions,
      byContract,
      note_he: 'זהות היסוד של הכנסות מראש לפי IFRS 15: פתיחה + תוספות − הוכר = סגירה.',
      note_en: 'IFRS 15 deferred revenue identity: opening + additions − recognized = closing.',
    };
  }

  /* ---------- Export for audit --------------------------------- */

  /**
   * Produce a bilingual audit export for a period. Contains:
   *   • header (agent, version, period, mode, locale)
   *   • disclosure report
   *   • reconciliation
   *   • full contract dump with events and history
   *   • bilingual Hebrew/English glossary
   *
   * @param {string} period
   * @returns {object}
   */
  exportForAudit(period) {
    const disclosure = this.disclosureReport(period);
    const reconciliation = this.reconcile(period);
    const contracts = this.listContracts();

    return {
      header: {
        agent: CONSTANTS.AGENT,
        module: 'deferred-revenue',
        version: CONSTANTS.VERSION,
        standard: 'IFRS 15 — Revenue from Contracts with Customers',
        standardHe: 'תקן דיווח כספי בינלאומי 15 — הכנסות מחוזים עם לקוחות',
        period,
        mode: this._opts.mode,
        locale: this._opts.locale,
        generatedAt: new Date().toISOString(),
        currency: 'ILS — ₪ — שקל חדש',
      },
      disclosure,
      reconciliation,
      contracts,
      glossary: {
        he: {
          'הכנסות מראש': 'Deferred revenue — a liability representing cash/AR received for goods or services not yet delivered',
          'התחייבות חוזית': 'Contract liability — IFRS 15 §106',
          'נכס חוזי': 'Contract asset — IFRS 15 §107 — recognition exceeds billing',
          'מחויבות ביצוע': 'Performance obligation — IFRS 15 §22',
          'מחיר עסקה': 'Transaction price — IFRS 15 §47',
          'חשבונית מס': 'Israeli tax invoice — must be issued when sale occurs for VAT purposes',
          'מע"מ': 'Israeli VAT (currently 18%)',
          'עסק פטור': 'Small business exempt from VAT collection — cash-basis tax reporting',
          'הקצאת מחיר': 'Transaction price allocation across performance obligations',
          'אבן דרך': 'Milestone — used for project-based revenue recognition',
          'קווי יישר': 'Straight-line — equal recognition over service period',
          'אחוז השלמה': 'Percentage-of-completion — cost-to-cost input method',
          'שינוי חוזה': 'Contract modification — IFRS 15 §18–§21',
          'הכרה בהכנסה': 'Revenue recognition — the Step 5 trigger',
          'backlog': 'Remaining unsatisfied performance obligations',
        },
        en: {
          'Deferred revenue / הכנסות מראש': 'Liability representing consideration received for undelivered goods/services',
          'Contract liability / התחייבות חוזית': 'IFRS 15 §106 — cumulative billings exceed cumulative recognition',
          'Contract asset / נכס חוזי': 'IFRS 15 §107 — cumulative recognition exceeds cumulative billings',
          'Performance obligation / מחויבות ביצוע': 'IFRS 15 §22 — a promise to transfer a distinct good or service',
          'Transaction price / מחיר עסקה': 'IFRS 15 §47 — amount of consideration entity expects to be entitled to',
          'Relative SSP / יחסי SSP': 'IFRS 15 §74 — allocation based on relative standalone selling prices',
          'Residual / שיטת השארית': 'IFRS 15 §79(c) — used when SSP is highly variable or uncertain',
          'Point-in-time / נקודת זמן': 'IFRS 15 §38 — control transfers at a specific moment',
          'Over-time / לאורך זמן': 'IFRS 15 §35 — control transfers progressively',
          'Separate modification / שינוי נפרד': 'IFRS 15 §20 — new distinct goods at SSP, treated as new contract',
          'Prospective modification / שינוי פרוספקטיבי': 'IFRS 15 §21(a) — remaining obligations re-allocated',
          'Retrospective modification / שינוי רטרוספקטיבי': 'IFRS 15 §21(b) — cumulative catch-up adjustment',
          'Backlog / יתרת מחויבויות': 'Remaining performance obligations — IFRS 15 §120 disclosure',
        },
      },
      note_he: 'קובץ גיבוי לביקורת — חתימה דיגיטלית חיצונית מומלצת, לא נתמכת כאן.',
      note_en: 'Audit export file — external digital signing recommended, not handled here.',
    };
  }
}

/* -------------------------------------------------------------- */
/* Exports                                                        */
/* -------------------------------------------------------------- */

module.exports = {
  DeferredRevenue,
  DeferredRevenueError,
  CONSTANTS,
  RECOGNITION_METHODS,
  TIMING_TYPES,
  MODIFICATION_TYPES,
  EVENT_TYPES,
  MODES,
  // helpers exposed for tests
  toAgorot,
  toShekels,
  formatILS,
};
