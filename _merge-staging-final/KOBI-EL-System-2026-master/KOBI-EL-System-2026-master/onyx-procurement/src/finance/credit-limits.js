/**
 * credit-limits.js — Agent Y-086 (Swarm — Mega-ERP Techno-Kol Uzi)
 * Customer Credit Limit Manager
 *
 * מנהל מסגרות אשראי ללקוחות
 * ---------------------------------------------------
 *  - Per-customer credit limits with approval workflow
 *  - Outstanding AR + pending orders → availableCredit()
 *  - Order blocking with optional grace band + override audit
 *  - Customer credit rating (A/B/C/D/E) from payment behaviour
 *  - Limit-increase requests workflow
 *  - BDI / Dun & Bradstreet Israel stub (bituach ashrai)
 *  - Collateral, guarantees, trade-credit insurance registers
 *  - Annual review scheduler + concentration-risk analytics
 *
 *  House rule: לא מוחקים — רק משדרגים ומגדלים.
 *  No limit, override, rating or register entry is EVER removed.
 *  Every mutation is appended to history[] + limit.history[].
 *  "Expired" records are kept and flagged, not deleted.
 *
 *  Zero external dependencies. Pure CommonJS.
 *
 *  Data model (in-memory, JSON-serializable):
 *
 *  CreditLimit:
 *    { customerId, limit, currency, effectiveDate, expiryDate,
 *      requestedBy, approvedBy, basis, review:{frequency,nextReview,lastReviewed},
 *      active, createdAt, version, history:[...] }
 *
 *  Override:
 *    { id, orderId, customerId, approver, reason, at, limitAtTime,
 *      outstandingAtTime, orderAmount }
 *
 *  CollateralEntry:
 *    { id, customerId, type, amount, currency, effectiveDate,
 *      expiry, notes, createdAt, status:'active'|'expired'|'released' }
 *
 *  GuaranteeEntry:
 *    { id, customerId, type, amount, currency, expiry, guarantor,
 *      createdAt, status }
 *
 *  InsuranceEntry:
 *    { id, customerId, insurer, coverage, currency, expiry,
 *      policyNumber, createdAt, status }
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  Constants / enums
// ─────────────────────────────────────────────────────────────

const BASIS = Object.freeze([
  'history',
  'DNB-rating',
  'BDI',
  'financial-statements',
  'guarantee',
]);

const BASIS_HE = Object.freeze({
  'history': 'היסטוריית תשלומים',
  'DNB-rating': 'דירוג Dun & Bradstreet',
  'BDI': 'דירוג BDI (נתוני אשראי עסקיים)',
  'financial-statements': 'דוחות כספיים',
  'guarantee': 'ערבות / ביטחון',
});

const COLLATERAL_TYPES = Object.freeze(['deposit', 'guarantee', 'lien']);

const COLLATERAL_TYPES_HE = Object.freeze({
  deposit: 'פיקדון',
  guarantee: 'ערבות',
  lien: 'שעבוד',
});

const GUARANTEE_TYPES = Object.freeze(['personal', 'bank', 'insurance']);

const GUARANTEE_TYPES_HE = Object.freeze({
  personal: 'ערבות אישית',
  bank: 'ערבות בנקאית',
  insurance: 'ערבות ביטוחית',
});

const INSURERS = Object.freeze(['Euler Hermes', 'Atradius', 'Coface', 'Clal']);

const RATING_GRADES = Object.freeze(['A', 'B', 'C', 'D', 'E']);

const RATING_HE = Object.freeze({
  A: 'מצוין — סיכון נמוך',
  B: 'טוב — סיכון נמוך-בינוני',
  C: 'בינוני — סיכון בינוני',
  D: 'חלש — סיכון גבוה',
  E: 'גרוע — סיכון קריטי',
});

const DEFAULT_CURRENCY = 'ILS';
const DEFAULT_GRACE_PCT = 0;     // no grace unless configured
const DEFAULT_REVIEW_MONTHS = 12; // annual review

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function _now() { return Date.now(); }
function _iso(ts) { return new Date(ts).toISOString(); }

function _toTs(v) {
  if (v == null) return _now();
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) throw new Error(`credit-limits: invalid date ${v}`);
  return t;
}

function _uid(prefix) {
  _uid._n = (_uid._n || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${_uid._n.toString(36)}`;
}

function _round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function _addMonths(ts, months) {
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // handle month-end overflow
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.getTime();
}

function _assertNumber(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`credit-limits: ${name} must be a finite number, got ${v}`);
  }
}

function _assertPositive(v, name) {
  _assertNumber(v, name);
  if (v < 0) throw new Error(`credit-limits: ${name} must be >= 0, got ${v}`);
}

function _assertString(v, name) {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`credit-limits: ${name} must be a non-empty string`);
  }
}

function _clone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

// ─────────────────────────────────────────────────────────────
//  Class
// ─────────────────────────────────────────────────────────────

class CreditLimitManager {
  /**
   * @param {Object} [opts]
   * @param {() => number} [opts.clock] - injectable clock returning ms
   * @param {number} [opts.gracePct]    - grace band over limit before block (0..50)
   * @param {number} [opts.reviewMonths] - default months between reviews
   * @param {Object} [opts.dataSources] - { getOutstandingAR, getPendingOrders,
   *                                        getPaymentHistory, dnb, bdi }
   */
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function' ? opts.clock : _now;
    this._gracePct = opts.gracePct ?? DEFAULT_GRACE_PCT;
    if (this._gracePct < 0 || this._gracePct > 50) {
      throw new Error('credit-limits: gracePct must be 0..50');
    }
    this._reviewMonths = opts.reviewMonths ?? DEFAULT_REVIEW_MONTHS;
    this._sources = opts.dataSources || {};

    // in-memory stores — never mutated destructively
    this._limitsByCustomer = new Map();   // customerId -> array of CreditLimit (historical)
    this._overrides = [];                 // override audit log
    this._increaseRequests = [];          // workflow log
    this._collaterals = [];               // append-only
    this._guarantees = [];                // append-only
    this._insurances = [];                // append-only
    this._history = [];                   // master event stream
  }

  // ─── helpers: active limit / injected numbers ───

  _activeLimitFor(customerId) {
    const arr = this._limitsByCustomer.get(customerId) || [];
    const t = this._clock();
    // newest-first scan for the most recent active & in-window record
    for (let i = arr.length - 1; i >= 0; i--) {
      const l = arr[i];
      if (!l.active) continue;
      const eff = _toTs(l.effectiveDate);
      const exp = l.expiryDate ? _toTs(l.expiryDate) : Infinity;
      if (eff <= t && t <= exp) return l;
    }
    return null;
  }

  _getOutstandingAR(customerId) {
    if (typeof this._sources.getOutstandingAR === 'function') {
      const v = Number(this._sources.getOutstandingAR(customerId)) || 0;
      return v < 0 ? 0 : v;
    }
    return 0;
  }

  _getPendingOrders(customerId) {
    if (typeof this._sources.getPendingOrders === 'function') {
      const v = Number(this._sources.getPendingOrders(customerId)) || 0;
      return v < 0 ? 0 : v;
    }
    return 0;
  }

  _getPaymentHistory(customerId) {
    if (typeof this._sources.getPaymentHistory === 'function') {
      return this._sources.getPaymentHistory(customerId) || {};
    }
    return {};
  }

  _logEvent(event) {
    this._history.push(Object.assign({ at: _iso(this._clock()) }, event));
  }

  // ─────────────────────────────────────────────────────────────
  //  setLimit — approve / create a new credit-limit record
  // ─────────────────────────────────────────────────────────────

  setLimit({
    customerId, limit, currency = DEFAULT_CURRENCY,
    effectiveDate, expiryDate,
    requestedBy, approvedBy,
    basis, review,
  } = {}) {
    _assertString(customerId, 'customerId');
    _assertPositive(limit, 'limit');
    _assertString(currency, 'currency');
    _assertString(requestedBy, 'requestedBy');
    _assertString(approvedBy, 'approvedBy');
    if (!BASIS.includes(basis)) {
      throw new Error(
        `credit-limits: basis must be one of ${BASIS.join(', ')}, got ${basis}`);
    }
    if (requestedBy === approvedBy) {
      throw new Error('credit-limits: segregation of duties — ' +
        'requestedBy must differ from approvedBy');
    }

    const now = this._clock();
    const eff = effectiveDate != null ? _toTs(effectiveDate) : now;
    const exp = expiryDate != null ? _toTs(expiryDate) : null;
    if (exp != null && exp <= eff) {
      throw new Error('credit-limits: expiryDate must be after effectiveDate');
    }

    const nextReview = (review && review.nextReview)
      ? _toTs(review.nextReview)
      : _addMonths(eff, this._reviewMonths);

    // deactivate prior active record for this customer (upgrade, not delete)
    const arr = this._limitsByCustomer.get(customerId) || [];
    for (const prior of arr) {
      if (prior.active) {
        prior.active = false;
        prior.supersededAt = _iso(now);
        prior.history.push({
          at: _iso(now), actor: approvedBy,
          action: 'superseded', note: 'replaced by new limit',
        });
      }
    }

    const record = {
      id: _uid('CL'),
      customerId,
      limit: _round2(limit),
      currency,
      effectiveDate: _iso(eff),
      expiryDate: exp != null ? _iso(exp) : null,
      requestedBy,
      approvedBy,
      basis,
      basisHe: BASIS_HE[basis],
      review: {
        frequency: (review && review.frequency) || 'annual',
        nextReview: _iso(nextReview),
        lastReviewed: (review && review.lastReviewed) ? _iso(_toTs(review.lastReviewed)) : null,
      },
      active: true,
      version: arr.filter(x => x.customerId === customerId).length + 1,
      createdAt: _iso(now),
      history: [{
        at: _iso(now), actor: approvedBy,
        action: 'created', note: `limit=${_round2(limit)} ${currency} basis=${basis}`,
      }],
    };

    arr.push(record);
    this._limitsByCustomer.set(customerId, arr);
    this._logEvent({
      type: 'limit.set', customerId, recordId: record.id,
      actor: approvedBy, limit: record.limit, basis,
    });
    return _clone(record);
  }

  // ─────────────────────────────────────────────────────────────
  //  availableCredit — limit − outstanding AR − pending orders
  // ─────────────────────────────────────────────────────────────

  availableCredit(customerId) {
    _assertString(customerId, 'customerId');
    const active = this._activeLimitFor(customerId);
    const outstanding = this._getOutstandingAR(customerId);
    const pending = this._getPendingOrders(customerId);
    const limit = active ? active.limit : 0;
    const available = _round2(limit - outstanding - pending);
    return {
      customerId,
      limit,
      currency: active ? active.currency : DEFAULT_CURRENCY,
      outstanding: _round2(outstanding),
      pending: _round2(pending),
      available,
      hasActiveLimit: !!active,
      asOf: _iso(this._clock()),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  blockOrder — returns true if over limit (after grace)
  // ─────────────────────────────────────────────────────────────

  blockOrder({ customerId, orderAmount } = {}) {
    _assertString(customerId, 'customerId');
    _assertPositive(orderAmount, 'orderAmount');

    const active = this._activeLimitFor(customerId);
    if (!active) {
      // No limit configured → block by default (safer than allowing).
      this._logEvent({
        type: 'order.block.no-limit', customerId, orderAmount,
      });
      return true;
    }
    const outstanding = this._getOutstandingAR(customerId);
    const pending = this._getPendingOrders(customerId);
    const exposure = outstanding + pending + Number(orderAmount);
    const graceBand = active.limit * (1 + this._gracePct / 100);
    const block = exposure > graceBand;
    this._logEvent({
      type: block ? 'order.block' : 'order.allow',
      customerId, orderAmount, exposure: _round2(exposure),
      limit: active.limit, grace: _round2(graceBand),
    });
    return block;
  }

  // ─────────────────────────────────────────────────────────────
  //  overrideBlock — logged override (always appended, never removed)
  // ─────────────────────────────────────────────────────────────

  overrideBlock({ orderId, approver, reason, customerId, orderAmount } = {}) {
    _assertString(orderId, 'orderId');
    _assertString(approver, 'approver');
    _assertString(reason, 'reason');

    const active = customerId ? this._activeLimitFor(customerId) : null;
    const entry = {
      id: _uid('OVR'),
      orderId,
      customerId: customerId || null,
      approver,
      reason,
      at: _iso(this._clock()),
      limitAtTime: active ? active.limit : null,
      outstandingAtTime: customerId ? this._getOutstandingAR(customerId) : null,
      orderAmount: typeof orderAmount === 'number' ? _round2(orderAmount) : null,
    };
    this._overrides.push(entry);
    this._logEvent({
      type: 'override.block', ...entry,
    });
    return _clone(entry);
  }

  overrides() { return this._overrides.map(_clone); }

  // ─────────────────────────────────────────────────────────────
  //  rating — compute A..E from payment behaviour
  // ─────────────────────────────────────────────────────────────

  /**
   * Weighted scorecard (all sub-scores 0..100, higher = better):
   *
   *   On-time ratio       40% (onTimePayments / totalPayments)
   *   Avg days to pay     25% (target 30d, >90d = 0)
   *   Bounced checks      20% (0 = 100, 5+ = 0)
   *   Open disputes       15% (0 = 100, 3+ = 0)
   *
   * Grades:
   *   >= 85  → A
   *   >= 70  → B
   *   >= 55  → C
   *   >= 40  → D
   *   else   → E
   */
  rating(customerId) {
    _assertString(customerId, 'customerId');
    const h = this._getPaymentHistory(customerId) || {};
    const totalPayments = Number(h.totalPayments) || 0;
    const onTimePayments = Number(h.onTimePayments) || 0;
    const avgDaysToPay = Number(h.avgDaysToPay) || 0;
    const bouncedChecks = Number(h.bouncedChecks) || 0;
    const openDisputes = Number(h.openDisputes) || 0;

    // No history at all → unknown customer = highest risk (E).
    // Conservatively returns score 0 so downstream systems cannot
    // mistake an empty dataset for a clean record.
    if (totalPayments <= 0) {
      return {
        customerId,
        grade: 'E',
        gradeHe: RATING_HE.E,
        score: 0,
        components: {
          onTimeScore: 0, daysScore: 0, bouncedScore: 0, disputesScore: 0,
        },
        inputs: {
          totalPayments, onTimePayments, avgDaysToPay,
          bouncedChecks, openDisputes,
        },
        noHistory: true,
        asOf: _iso(this._clock()),
      };
    }

    // Sub-scores
    const onTimeRatio = onTimePayments / totalPayments;
    const onTimeScore = Math.max(0, Math.min(100, onTimeRatio * 100));

    // days to pay: 30d or less = 100, 90d+ = 0, linear
    let daysScore;
    if (avgDaysToPay <= 30) daysScore = 100;
    else if (avgDaysToPay >= 90) daysScore = 0;
    else daysScore = 100 - ((avgDaysToPay - 30) / 60) * 100;

    const bouncedScore = Math.max(0, 100 - bouncedChecks * 20);
    const disputesScore = Math.max(0, 100 - openDisputes * 33.33);

    const total = _round2(
      onTimeScore * 0.40 +
      daysScore   * 0.25 +
      bouncedScore * 0.20 +
      disputesScore * 0.15
    );

    let grade;
    if (total >= 85) grade = 'A';
    else if (total >= 70) grade = 'B';
    else if (total >= 55) grade = 'C';
    else if (total >= 40) grade = 'D';
    else grade = 'E';

    return {
      customerId,
      grade,
      gradeHe: RATING_HE[grade],
      score: total,
      components: {
        onTimeScore: _round2(onTimeScore),
        daysScore: _round2(daysScore),
        bouncedScore: _round2(bouncedScore),
        disputesScore: _round2(disputesScore),
      },
      inputs: {
        totalPayments, onTimePayments, avgDaysToPay,
        bouncedChecks, openDisputes,
      },
      asOf: _iso(this._clock()),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  requestIncrease — workflow for a limit-increase application
  // ─────────────────────────────────────────────────────────────

  requestIncrease({
    customerId, newLimit, reason, supporting,
    requestedBy,
  } = {}) {
    _assertString(customerId, 'customerId');
    _assertPositive(newLimit, 'newLimit');
    _assertString(reason, 'reason');
    _assertString(requestedBy, 'requestedBy');

    const active = this._activeLimitFor(customerId);
    const currentLimit = active ? active.limit : 0;
    if (newLimit <= currentLimit) {
      throw new Error(
        `credit-limits: requested increase ${newLimit} must exceed current ${currentLimit}`);
    }
    const entry = {
      id: _uid('INC'),
      customerId,
      currentLimit,
      newLimit: _round2(newLimit),
      delta: _round2(newLimit - currentLimit),
      reason,
      supporting: supporting || [],
      requestedBy,
      requestedAt: _iso(this._clock()),
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      history: [{
        at: _iso(this._clock()), actor: requestedBy,
        action: 'submitted', note: reason,
      }],
    };
    this._increaseRequests.push(entry);
    this._logEvent({
      type: 'increase.request', customerId, requestId: entry.id,
      from: currentLimit, to: entry.newLimit,
    });
    return _clone(entry);
  }

  decideIncrease({ requestId, decidedBy, decision, note } = {}) {
    _assertString(requestId, 'requestId');
    _assertString(decidedBy, 'decidedBy');
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error('credit-limits: decision must be approved|rejected');
    }
    const entry = this._increaseRequests.find(r => r.id === requestId);
    if (!entry) throw new Error(`credit-limits: request ${requestId} not found`);
    if (entry.status !== 'pending') {
      throw new Error(`credit-limits: request ${requestId} already ${entry.status}`);
    }
    if (decidedBy === entry.requestedBy) {
      throw new Error('credit-limits: segregation of duties — ' +
        'decidedBy must differ from requestedBy');
    }
    entry.status = decision;
    entry.decidedBy = decidedBy;
    entry.decidedAt = _iso(this._clock());
    entry.decisionNote = note || null;
    entry.history.push({
      at: entry.decidedAt, actor: decidedBy,
      action: decision, note: note || null,
    });
    this._logEvent({
      type: `increase.${decision}`,
      customerId: entry.customerId, requestId: entry.id,
    });
    return _clone(entry);
  }

  increaseRequests({ customerId, status } = {}) {
    return this._increaseRequests
      .filter(r => (!customerId || r.customerId === customerId))
      .filter(r => (!status || r.status === status))
      .map(_clone);
  }

  // ─────────────────────────────────────────────────────────────
  //  queryDNB — stub for Dun & Bradstreet Israel / BDI
  // ─────────────────────────────────────────────────────────────

  /**
   * Stub — if a real adapter is injected via
   *   dataSources.dnb.query(customerId) → { paydex, riskLevel, ... }
   *   dataSources.bdi.query(customerId) → { rating, openLiens, ... }
   * we call it. Otherwise return a deterministic dummy shell.
   *
   * BDI (Business Data Israel) is the dominant Israeli commercial
   * credit bureau (bi.co.il). D&B Israel (dbisrael.co.il) is the
   * local D&B franchise. Both expose paid APIs; this module does
   * not reach out to the network — it only wraps the injected
   * adapter so the caller can unit-test deterministically.
   */
  queryDNB(customerId) {
    _assertString(customerId, 'customerId');
    const src = this._sources.dnb;
    const bdiSrc = this._sources.bdi;
    const ts = _iso(this._clock());
    const result = {
      customerId,
      asOf: ts,
      dnb: null,
      bdi: null,
      source: 'stub',
    };
    if (src && typeof src.query === 'function') {
      result.dnb = src.query(customerId) || null;
      result.source = 'dnb-adapter';
    }
    if (bdiSrc && typeof bdiSrc.query === 'function') {
      result.bdi = bdiSrc.query(customerId) || null;
      result.source = result.dnb ? 'dnb+bdi' : 'bdi-adapter';
    }
    this._logEvent({ type: 'dnb.query', customerId, source: result.source });
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  //  collateralTracking
  // ─────────────────────────────────────────────────────────────

  collateralTracking({
    customerId, type, amount,
    currency = DEFAULT_CURRENCY,
    effectiveDate, expiry, notes,
  } = {}) {
    _assertString(customerId, 'customerId');
    _assertPositive(amount, 'amount');
    if (!COLLATERAL_TYPES.includes(type)) {
      throw new Error(
        `credit-limits: collateral type must be ${COLLATERAL_TYPES.join('|')}`);
    }
    const now = this._clock();
    const eff = effectiveDate != null ? _toTs(effectiveDate) : now;
    const exp = expiry != null ? _toTs(expiry) : null;
    const entry = {
      id: _uid('COL'),
      customerId,
      type,
      typeHe: COLLATERAL_TYPES_HE[type],
      amount: _round2(amount),
      currency,
      effectiveDate: _iso(eff),
      expiry: exp != null ? _iso(exp) : null,
      notes: notes || null,
      createdAt: _iso(now),
      status: (exp != null && exp <= now) ? 'expired' : 'active',
    };
    this._collaterals.push(entry);
    this._logEvent({
      type: 'collateral.add', customerId, collateralId: entry.id,
      collType: type, amount: entry.amount,
    });
    return _clone(entry);
  }

  collaterals({ customerId } = {}) {
    const now = this._clock();
    return this._collaterals
      .filter(c => (!customerId || c.customerId === customerId))
      .map((c) => {
        const copy = _clone(c);
        // re-evaluate status lazily — never mutate stored
        if (copy.expiry && _toTs(copy.expiry) <= now && copy.status === 'active') {
          copy.status = 'expired';
        }
        return copy;
      });
  }

  // ─────────────────────────────────────────────────────────────
  //  expireReview — limits whose nextReview is due
  // ─────────────────────────────────────────────────────────────

  expireReview({ asOf } = {}) {
    const now = asOf != null ? _toTs(asOf) : this._clock();
    const out = [];
    for (const [customerId, arr] of this._limitsByCustomer) {
      for (const l of arr) {
        if (!l.active) continue;
        const due = l.review && l.review.nextReview
          ? _toTs(l.review.nextReview) : null;
        if (due != null && due <= now) {
          out.push({
            customerId,
            recordId: l.id,
            limit: l.limit,
            currency: l.currency,
            nextReview: l.review.nextReview,
            overdueByDays: Math.max(0, Math.floor((now - due) / 86_400_000)),
          });
        }
      }
    }
    return out.sort((a, b) => b.overdueByDays - a.overdueByDays);
  }

  /**
   * markReviewed — append-only review acknowledgement; upgrades
   * nextReview date. Historical record kept.
   */
  markReviewed({ customerId, reviewer, note, nextReviewDate } = {}) {
    _assertString(customerId, 'customerId');
    _assertString(reviewer, 'reviewer');
    const active = this._activeLimitFor(customerId);
    if (!active) throw new Error(`credit-limits: no active limit for ${customerId}`);
    const now = this._clock();
    const next = nextReviewDate != null
      ? _toTs(nextReviewDate)
      : _addMonths(now, this._reviewMonths);
    active.review.lastReviewed = _iso(now);
    active.review.nextReview = _iso(next);
    active.history.push({
      at: _iso(now), actor: reviewer,
      action: 'reviewed', note: note || null,
    });
    this._logEvent({
      type: 'limit.reviewed', customerId,
      recordId: active.id, reviewer,
    });
    return _clone(active);
  }

  // ─────────────────────────────────────────────────────────────
  //  concentrationRisk — top customers vs total AR
  // ─────────────────────────────────────────────────────────────

  /**
   * Walks every customer known to the manager, pulls outstanding AR
   * via the injected data source, and returns the distribution.
   *
   *   totalAR        — sum of outstanding AR across customers
   *   top            — array sorted desc: { customerId, outstanding, share, limit }
   *   top1Share,
   *   top5Share      — cumulative shares (0..1)
   *   hhi            — Herfindahl-Hirschman index (0..10_000; >2500 is concentrated)
   *   concentrated   — boolean: true if top1Share > 0.20 OR top5Share > 0.50 OR hhi > 2500
   */
  concentrationRisk({ extraCustomers = [] } = {}) {
    const ids = new Set();
    for (const k of this._limitsByCustomer.keys()) ids.add(k);
    for (const c of extraCustomers) ids.add(c);

    const rows = [];
    for (const id of ids) {
      const outstanding = this._getOutstandingAR(id);
      const active = this._activeLimitFor(id);
      rows.push({
        customerId: id,
        outstanding: _round2(outstanding),
        limit: active ? active.limit : 0,
      });
    }
    rows.sort((a, b) => b.outstanding - a.outstanding);

    const totalAR = rows.reduce((s, r) => s + r.outstanding, 0);
    let top1Share = 0, top5Share = 0, hhi = 0;
    if (totalAR > 0) {
      for (let i = 0; i < rows.length; i++) {
        const share = rows[i].outstanding / totalAR;
        rows[i].share = _round2(share);
        if (i === 0) top1Share = share;
        if (i < 5) top5Share += share;
        hhi += (share * 100) ** 2;
      }
    } else {
      for (const r of rows) r.share = 0;
    }

    return {
      totalAR: _round2(totalAR),
      customerCount: rows.length,
      top: rows.slice(0, 10),
      top1Share: _round2(top1Share),
      top5Share: _round2(top5Share),
      hhi: _round2(hhi),
      concentrated: top1Share > 0.20 || top5Share > 0.50 || hhi > 2500,
      asOf: _iso(this._clock()),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  guaranteeRegister
  // ─────────────────────────────────────────────────────────────

  guaranteeRegister({
    customerId, type, amount,
    currency = DEFAULT_CURRENCY,
    expiry, guarantor,
  } = {}) {
    _assertString(customerId, 'customerId');
    _assertPositive(amount, 'amount');
    if (!GUARANTEE_TYPES.includes(type)) {
      throw new Error(
        `credit-limits: guarantee type must be ${GUARANTEE_TYPES.join('|')}`);
    }
    _assertString(guarantor, 'guarantor');
    const now = this._clock();
    const exp = expiry != null ? _toTs(expiry) : null;
    const entry = {
      id: _uid('GRT'),
      customerId,
      type,
      typeHe: GUARANTEE_TYPES_HE[type],
      amount: _round2(amount),
      currency,
      expiry: exp != null ? _iso(exp) : null,
      guarantor,
      createdAt: _iso(now),
      status: (exp != null && exp <= now) ? 'expired' : 'active',
    };
    this._guarantees.push(entry);
    this._logEvent({
      type: 'guarantee.register', customerId,
      guaranteeId: entry.id, grtType: type, amount: entry.amount,
    });
    return _clone(entry);
  }

  guarantees({ customerId } = {}) {
    const now = this._clock();
    return this._guarantees
      .filter(g => (!customerId || g.customerId === customerId))
      .map((g) => {
        const copy = _clone(g);
        if (copy.expiry && _toTs(copy.expiry) <= now && copy.status === 'active') {
          copy.status = 'expired';
        }
        return copy;
      });
  }

  // ─────────────────────────────────────────────────────────────
  //  insuranceRegister — trade credit insurance (בטוח אשראי)
  // ─────────────────────────────────────────────────────────────

  insuranceRegister({
    customerId, insurer, coverage,
    currency = DEFAULT_CURRENCY,
    expiry, policyNumber,
  } = {}) {
    _assertString(customerId, 'customerId');
    if (!INSURERS.includes(insurer)) {
      throw new Error(
        `credit-limits: insurer must be one of ${INSURERS.join(', ')}, got ${insurer}`);
    }
    _assertPositive(coverage, 'coverage');
    const now = this._clock();
    const exp = expiry != null ? _toTs(expiry) : null;
    const entry = {
      id: _uid('INS'),
      customerId,
      insurer,
      coverage: _round2(coverage),
      currency,
      expiry: exp != null ? _iso(exp) : null,
      policyNumber: policyNumber || null,
      createdAt: _iso(now),
      status: (exp != null && exp <= now) ? 'expired' : 'active',
    };
    this._insurances.push(entry);
    this._logEvent({
      type: 'insurance.register', customerId,
      insuranceId: entry.id, insurer, coverage: entry.coverage,
    });
    return _clone(entry);
  }

  insurances({ customerId } = {}) {
    const now = this._clock();
    return this._insurances
      .filter(i => (!customerId || i.customerId === customerId))
      .map((i) => {
        const copy = _clone(i);
        if (copy.expiry && _toTs(copy.expiry) <= now && copy.status === 'active') {
          copy.status = 'expired';
        }
        return copy;
      });
  }

  // ─────────────────────────────────────────────────────────────
  //  Read-only inspectors
  // ─────────────────────────────────────────────────────────────

  activeLimit(customerId) {
    const l = this._activeLimitFor(customerId);
    return l ? _clone(l) : null;
  }

  limitHistory(customerId) {
    const arr = this._limitsByCustomer.get(customerId) || [];
    return arr.map(_clone);
  }

  eventLog() { return this._history.slice(); }
}

// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  CreditLimitManager,
  BASIS,
  BASIS_HE,
  COLLATERAL_TYPES,
  COLLATERAL_TYPES_HE,
  GUARANTEE_TYPES,
  GUARANTEE_TYPES_HE,
  INSURERS,
  RATING_GRADES,
  RATING_HE,
  DEFAULT_CURRENCY,
  DEFAULT_REVIEW_MONTHS,
};
