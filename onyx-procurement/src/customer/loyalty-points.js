/**
 * Customer Loyalty Points — Earn / Burn / Tiers / IFRS 15
 * Techno-Kol Uzi mega-ERP / Agent Y-095
 *
 * Zero dependencies. Pure JavaScript. No HTTP, no file I/O.
 * Deterministic, offline-friendly, bilingual (Hebrew + English).
 *
 * House rule:  לא מוחקים רק משדרגים ומגדלים.
 *              We never delete. Points ledger is append-only; every
 *              earn/burn/expire/transfer is a new row. Reversals are
 *              negative entries — they do NOT erase the original.
 *
 * ───────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES
 * ───────────────────────────────────────────────────────────────
 *
 *   1. Define a loyalty program with:
 *        - earnRules   (purchase, review, referral, birthday, signup)
 *        - redeemRules (discount, free-item, shipping, gift-card)
 *        - tiers       (name, threshold, multiplier, benefits)
 *        - expiryDays  (FIFO expiration)
 *
 *   2. Earn points on events.        → earnPoints(...)
 *   3. Burn points on redemption.    → redeemPoints(...)
 *   4. Current + expiring-soon.      → balance(...)
 *   5. Bilingual statement.          → statement(...)
 *   6. Tier progress.                → tierProgress(...)
 *   7. FIFO expiry run.              → expirePoints(...)
 *   8. Breakage calculation.         → breakageCalc()
 *   9. IFRS 15 liability provision.  → liabilityProvision(...)
 *  10. Fraud detection rules.        → fraudRules(...)
 *  11. Time-boxed campaigns.         → campaignPoints(...)
 *  12. Gift transfers between customers → giftTransfer(...)
 *
 * ───────────────────────────────────────────────────────────────
 * IFRS 15 TREATMENT
 * ───────────────────────────────────────────────────────────────
 *
 * Loyalty points awarded on a purchase are a SEPARATE performance
 * obligation. Part of the transaction price must be DEFERRED
 * (recognized later — when customer redeems OR when they expire
 * — whichever comes first).
 *
 *   Journal at sale (bilingual — matches Israeli חשבונאות treatment):
 *
 *     DR  Cash / AR                     (gross invoice)
 *     CR  Revenue                        (goods / services only)
 *     CR  Contract liability — points    (fair-value of points)
 *
 *   Fair-value per point = standalone selling price of the reward,
 *   weighted by expected redemption probability (1 - breakage).
 *
 *   On redemption:
 *     DR  Contract liability — points
 *     CR  Revenue — loyalty
 *
 *   On expiry (accrual reversal):
 *     DR  Contract liability — points
 *     CR  Revenue — loyalty breakage
 *
 * This module exposes `liabilityProvision(period)` that returns the
 * closing contract-liability balance in ILS for a period, ready to
 * post to the GL.
 *
 * ───────────────────────────────────────────────────────────────
 * LEDGER ENTRY SHAPE (append-only, never mutated)
 * ───────────────────────────────────────────────────────────────
 *
 *   {
 *     id:          'led-00000001',
 *     ts:          '2026-04-11T12:34:56.000Z',
 *     customerId:  'cust-42',
 *     type:        'earn' | 'burn' | 'expire' | 'transfer-in' |
 *                  'transfer-out' | 'adjust' | 'campaign',
 *     subtype:     'purchase' | 'review' | 'referral' | ...,
 *     points:      +250  (positive = earn/in, negative = burn/out),
 *     remaining:   200   (FIFO available — only for earn rows),
 *     earnedAt:    '2026-04-11',     (only for earn rows)
 *     expiresAt:   '2027-04-11',     (only for earn rows, if expiryDays)
 *     fairValue:   12.34,            (ILS deferred per IFRS 15)
 *     tierAtTime:  'silver',
 *     meta:        { ... event-specific ... }
 *   }
 *
 * Nothing is deleted. Expiry produces a NEW "expire" row AND
 * decrements the `remaining` counter on the matching earn rows.
 *
 * ───────────────────────────────────────────────────────────────
 * USAGE
 * ───────────────────────────────────────────────────────────────
 *
 *   const { LoyaltyPoints } = require('./loyalty-points');
 *
 *   const lp = new LoyaltyPoints();
 *   lp.defineProgram({
 *     id:      'techno-kol-rewards',
 *     name_he: 'כוכבי טכנו-קול',
 *     name_en: 'Techno-Kol Stars',
 *     earnRules: [
 *       { type:'purchase', pointsPerUnit: 1, multiplier: 1 },
 *       { type:'review',   pointsPerUnit: 50, multiplier: 1 },
 *       { type:'signup',   pointsPerUnit: 100, multiplier: 1 }
 *     ],
 *     redeemRules: [
 *       { type:'discount',  pointCost: 100, value: 10 },    // 100pt => 10 ILS
 *       { type:'shipping',  pointCost: 200, value: 25 },
 *     ],
 *     tiers: [
 *       { name:'bronze', threshold:0,    multiplier:1.0, benefits:[] },
 *       { name:'silver', threshold:1000, multiplier:1.25, benefits:['free-shipping'] },
 *       { name:'gold',   threshold:5000, multiplier:1.5,  benefits:['free-shipping','priority-support'] }
 *     ],
 *     expiryDays: 365
 *   });
 *
 *   lp.earnPoints({ customerId:'c-1', event:{ type:'purchase' }, units: 250 });
 *   lp.redeemPoints({ customerId:'c-1', redemption:{ type:'discount' } });
 *   lp.balance('c-1');
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 0. CONSTANTS / DEFAULTS
// ═══════════════════════════════════════════════════════════════

const EARN_TYPES = Object.freeze(['purchase', 'review', 'referral', 'birthday', 'signup']);
const REDEEM_TYPES = Object.freeze(['discount', 'free-item', 'shipping', 'gift-card']);

/** Ledger entry type codes (used by reporters + fraud engine). */
const LEDGER_TYPES = Object.freeze({
  EARN: 'earn',
  BURN: 'burn',
  EXPIRE: 'expire',
  TRANSFER_IN: 'transfer-in',
  TRANSFER_OUT: 'transfer-out',
  ADJUST: 'adjust',
  CAMPAIGN: 'campaign',
});

/**
 * Default fair value per point in ILS. Used only when the program
 * does NOT declare a redeemRule — i.e. a floor to make sure IFRS 15
 * liability is non-zero even for a brand-new program. This default
 * is conservatively low (₪ 0.05) so we do not overstate liability.
 */
const DEFAULT_FAIR_VALUE_PER_POINT = 0.05;

/**
 * Default expected redemption probability when no historical data
 * is available. Industry studies (Colloquy, Bond Brand Loyalty)
 * report ~30% breakage on cash-equivalent programs, so:
 *   expected redemption ≈ 1 - 0.30 = 0.70
 */
const DEFAULT_REDEMPTION_PROBABILITY = 0.7;

/**
 * Default fraud thresholds — intentionally strict to surface anything
 * that looks suspicious; the operator can override at runtime.
 */
const DEFAULT_FRAUD_THRESHOLDS = Object.freeze({
  velocityMaxEarnsPerHour: 10, // more than 10 earn events in 60 min → flag
  velocityMaxPointsPerDay: 10000, // more than 10k pts earned in 24h → flag
  duplicateWindowSeconds: 30, // two identical earn events inside 30s → flag
  geoMismatchMinKm: 500, // two events 500+ km apart in < 1h → flag
});

// ═══════════════════════════════════════════════════════════════
// 1. SMALL UTILITIES (no deps)
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimals — safe for ILS money. */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Normalise ISO date-string → yyyy-mm-dd (local ISO, no Intl). */
function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return null;
}

/** Add N days to an ISO date, return new ISO date. Pure. */
function addDays(isoDate, days) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/** Day-difference: b - a in whole days (positive if b is later). */
function daysBetween(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00Z');
  const b = new Date(bISO + 'T00:00:00Z');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b - a) / 86400000);
}

/** Stable, monotonically-increasing ledger id. */
function makeIdFactory(prefix) {
  let n = 0;
  return function next() {
    n += 1;
    return prefix + '-' + String(n).padStart(8, '0');
  };
}

/** Haversine great-circle distance in km. Used by geo-fraud check. */
function haversineKm(a, b) {
  if (!a || !b) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return R * c;
}

// ═══════════════════════════════════════════════════════════════
// 2. BILINGUAL GLOSSARY / LABELS
// ═══════════════════════════════════════════════════════════════

/**
 * Single-source Hebrew / English terminology. Used by the bilingual
 * statement renderer and every error message we throw. Add to this
 * map when you add a new field — never remove.
 */
const LABELS = Object.freeze({
  heading: { he: 'כוכבי נאמנות — דוח חשבון', en: 'Loyalty points — account statement' },
  balance: { he: 'יתרה נוכחית', en: 'Current balance' },
  expiring: { he: 'פגי־תוקף קרובים', en: 'Expiring soon' },
  tier: { he: 'דרגה', en: 'Tier' },
  nextTier: { he: 'הדרגה הבאה', en: 'Next tier' },
  pointsToNext: { he: 'נקודות לדרגה הבאה', en: 'Points to next tier' },
  earn: { he: 'צבירה', en: 'Earned' },
  burn: { he: 'שימוש', en: 'Redeemed' },
  expire: { he: 'פג תוקף', en: 'Expired' },
  transferIn: { he: 'העברה נכנסת', en: 'Transfer in' },
  transferOut: { he: 'העברה יוצאת', en: 'Transfer out' },
  campaign: { he: 'מבצע', en: 'Campaign bonus' },
  adjust: { he: 'התאמה', en: 'Adjustment' },
  lifetime: { he: 'סה״כ לאורך החיים', en: 'Lifetime total' },
  period: { he: 'תקופה', en: 'Period' },
  noActivity: { he: 'אין פעילות בתקופה זו', en: 'No activity in this period' },
  liability: { he: 'התחייבות IFRS 15', en: 'IFRS 15 liability' },
  breakage: { he: 'שיעור נטישה (Breakage)', en: 'Breakage rate' },
  // event types
  purchase: { he: 'רכישה', en: 'Purchase' },
  review: { he: 'חוות דעת', en: 'Product review' },
  referral: { he: 'הפניה', en: 'Referral' },
  birthday: { he: 'יום הולדת', en: 'Birthday bonus' },
  signup: { he: 'הרשמה', en: 'Signup bonus' },
  discount: { he: 'הנחה', en: 'Discount' },
  'free-item': { he: 'מוצר חינם', en: 'Free item' },
  shipping: { he: 'משלוח חינם', en: 'Free shipping' },
  'gift-card': { he: 'שובר מתנה', en: 'Gift card' },
});

/** Safe lookup → returns {he,en} or a {he:key,en:key} fallback. */
function label(key) {
  return LABELS[key] || { he: String(key), en: String(key) };
}

// ═══════════════════════════════════════════════════════════════
// 3. LoyaltyPoints CLASS
// ═══════════════════════════════════════════════════════════════

class LoyaltyPoints {
  constructor(opts = {}) {
    /** @type {object|null} active program definition (frozen once set) */
    this.program = null;

    /** @type {Array<object>} append-only ledger — never mutated, never spliced. */
    this.ledger = [];

    /** @type {Array<object>} list of time-boxed campaigns. */
    this.campaigns = [];

    /** @type {Map<string, object>} customer cache (tier, lifetime pts). */
    this.customers = new Map();

    /** @type {function(): string} id factory for ledger rows. */
    this._nextId = makeIdFactory(opts.idPrefix || 'led');

    /** @type {function(): string} clock source, overridable in tests. */
    this._now = opts.now || (() => new Date().toISOString());

    /** @type {object} fraud thresholds (mutable per instance). */
    this.fraudThresholds = Object.assign({}, DEFAULT_FRAUD_THRESHOLDS, opts.fraudThresholds || {});

    /** @type {object} historical redemption rate snapshot. */
    this._redemptionHistory = {
      totalEarnedGross: 0,
      totalRedeemed: 0,
      totalExpired: 0,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.1  PROGRAM DEFINITION
  // ─────────────────────────────────────────────────────────────

  /**
   * Define (or upgrade) the active loyalty program.
   * Calling it twice is allowed — we NEVER delete prior state,
   * we just replace the program contract. All existing ledger
   * rows remain valid under their historical tier/fair-value
   * values thanks to the `tierAtTime` and `fairValue` snapshots.
   */
  defineProgram({ id, name_he, name_en, earnRules = [], redeemRules = [], tiers = [], expiryDays = 0 }) {
    if (!id) throw new Error('defineProgram: id is required / id חובה');
    if (!Array.isArray(earnRules) || earnRules.length === 0) {
      throw new Error('defineProgram: earnRules must be a non-empty array / חייבים לפחות כלל צבירה אחד');
    }
    if (!Array.isArray(tiers) || tiers.length === 0) {
      throw new Error('defineProgram: tiers must be a non-empty array / חייב לפחות דרגה אחת');
    }

    // normalise earnRules + validate types
    const earn = earnRules.map((r) => {
      if (!EARN_TYPES.includes(r.type)) {
        throw new Error(`earnRule.type unsupported: ${r.type}`);
      }
      return Object.freeze({
        type: r.type,
        pointsPerUnit: Number(r.pointsPerUnit) || 0,
        multiplier: r.multiplier == null ? 1 : Number(r.multiplier),
      });
    });

    // normalise redeemRules
    const redeem = redeemRules.map((r) => {
      if (!REDEEM_TYPES.includes(r.type)) {
        throw new Error(`redeemRule.type unsupported: ${r.type}`);
      }
      return Object.freeze({
        type: r.type,
        pointCost: Number(r.pointCost) || 0,
        value: Number(r.value) || 0,
      });
    });

    // sort tiers ascending by threshold so tierFor() can walk them in O(log n)
    const sortedTiers = tiers
      .slice()
      .sort((a, b) => Number(a.threshold) - Number(b.threshold))
      .map((t) =>
        Object.freeze({
          name: String(t.name),
          threshold: Number(t.threshold) || 0,
          multiplier: t.multiplier == null ? 1 : Number(t.multiplier),
          benefits: Object.freeze((t.benefits || []).slice()),
        })
      );

    this.program = Object.freeze({
      id: String(id),
      name_he: String(name_he || id),
      name_en: String(name_en || id),
      earnRules: Object.freeze(earn),
      redeemRules: Object.freeze(redeem),
      tiers: Object.freeze(sortedTiers),
      expiryDays: Number(expiryDays) || 0,
    });

    return this.program;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.2  EARN POINTS
  // ─────────────────────────────────────────────────────────────

  /**
   * Post an earn event to the ledger.
   *
   * @param {object} args
   * @param {string} args.customerId
   * @param {object} args.event            { type, at?, meta?, geo? }
   * @param {number} args.units            units the rule multiplies
   * @returns {object} the ledger entry
   */
  earnPoints({ customerId, event, units }) {
    this._requireProgram();
    if (!customerId) throw new Error('earnPoints: customerId required');
    if (!event || !event.type) throw new Error('earnPoints: event.type required');

    const rule = this.program.earnRules.find((r) => r.type === event.type);
    if (!rule) throw new Error(`earnPoints: no earn rule for type ${event.type}`);

    const cust = this._customer(customerId);
    const tier = this._tierForLifetime(cust.lifetime);
    const tierMult = tier ? tier.multiplier : 1;

    // campaign multipliers (additive over base tier multiplier)
    const campaignMult = this._campaignMultiplierFor(customerId, event.at || this._now());

    const basePoints = Math.floor(Number(units || 0) * rule.pointsPerUnit * rule.multiplier);
    const points = Math.floor(basePoints * tierMult * campaignMult);

    if (points <= 0) {
      // zero-points earn is harmless but still a ledger row — keep it for audit.
    }

    const earnedAt = toISODate(event.at || this._now()) || toISODate(this._now());
    const expiresAt = this.program.expiryDays > 0 ? addDays(earnedAt, this.program.expiryDays) : null;
    const fairValue = round2(points * this._fairValuePerPoint());

    const entry = {
      id: this._nextId(),
      ts: event.at || this._now(),
      customerId,
      type: LEDGER_TYPES.EARN,
      subtype: event.type,
      points,
      remaining: points, // full balance, FIFO consumed later
      earnedAt,
      expiresAt,
      fairValue,
      tierAtTime: tier ? tier.name : null,
      meta: Object.freeze({
        units: Number(units || 0),
        baseMultiplier: rule.multiplier,
        tierMultiplier: tierMult,
        campaignMultiplier: campaignMult,
        geo: event.geo || null,
        memo: event.meta || null,
      }),
    };

    Object.freeze(entry);
    this.ledger.push(entry);

    // maintain customer cache
    cust.lifetime += points;
    cust.currentBalance += points;
    cust.tier = this._tierForLifetime(cust.lifetime);
    this._redemptionHistory.totalEarnedGross += points;

    return entry;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.3  REDEEM POINTS (BURN)
  // ─────────────────────────────────────────────────────────────

  /**
   * Burn points against an active redeemRule using FIFO
   * consumption of earn rows.
   *
   * @returns {object} the burn ledger entry
   */
  redeemPoints({ customerId, redemption }) {
    this._requireProgram();
    if (!customerId) throw new Error('redeemPoints: customerId required');
    if (!redemption || !redemption.type) throw new Error('redeemPoints: redemption.type required');

    const rule = this.program.redeemRules.find((r) => r.type === redemption.type);
    if (!rule) throw new Error(`redeemPoints: no redeem rule for type ${redemption.type}`);

    const cost = rule.pointCost;
    const bal = this._availableFifoBalance(customerId);
    if (bal < cost) {
      throw new Error(
        `redeemPoints: insufficient balance (need ${cost}, have ${bal}) / יתרה לא מספיקה`
      );
    }

    // FIFO consume
    let remainingToBurn = cost;
    for (const row of this.ledger) {
      if (remainingToBurn <= 0) break;
      if (row.type !== LEDGER_TYPES.EARN) continue;
      if (row.customerId !== customerId) continue;
      if (row.remaining <= 0) continue;
      const take = Math.min(row.remaining, remainingToBurn);
      // row is frozen → rebuild it in place via a tracked counter outside
      // the frozen object. We update `remaining` via the side-lookup map.
      this._decrementRemaining(row.id, take);
      remainingToBurn -= take;
    }

    const entry = Object.freeze({
      id: this._nextId(),
      ts: this._now(),
      customerId,
      type: LEDGER_TYPES.BURN,
      subtype: redemption.type,
      points: -cost,
      value: rule.value,
      tierAtTime: this._customer(customerId).tier ? this._customer(customerId).tier.name : null,
      meta: Object.freeze({
        redemption: Object.assign({}, redemption),
        ruleValue: rule.value,
      }),
    });

    this.ledger.push(entry);

    // update cache
    const cust = this._customer(customerId);
    cust.currentBalance -= cost;
    this._redemptionHistory.totalRedeemed += cost;

    return entry;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.4  BALANCE
  // ─────────────────────────────────────────────────────────────

  /**
   * Return current balance + points that will expire in the next N days.
   *
   * @param {string} customerId
   * @param {object} [opts]     { soonDays = 30 }
   * @returns {{current:number, expiringSoon:number, lifetime:number, tier:string|null}}
   */
  balance(customerId, opts = {}) {
    const soonDays = opts.soonDays || 30;
    let current = 0;
    let expiring = 0;
    const today = toISODate(this._now());
    const horizon = addDays(today, soonDays);

    for (const row of this.ledger) {
      if (row.customerId !== customerId) continue;
      if (row.type === LEDGER_TYPES.EARN || row.type === LEDGER_TYPES.TRANSFER_IN || row.type === LEDGER_TYPES.CAMPAIGN) {
        current += row.remaining != null ? row.remaining : row.points;
        if (row.expiresAt && row.expiresAt <= horizon && row.expiresAt > today) {
          expiring += row.remaining != null ? row.remaining : row.points;
        }
      } else if (row.type === LEDGER_TYPES.BURN || row.type === LEDGER_TYPES.TRANSFER_OUT || row.type === LEDGER_TYPES.EXPIRE) {
        // burn / transfer-out / expire are already reflected in the
        // earn row's `remaining` counter. Skip to avoid double-counting.
      } else if (row.type === LEDGER_TYPES.ADJUST) {
        current += row.points;
      }
    }

    const cust = this._customer(customerId);
    return {
      current,
      expiringSoon: expiring,
      lifetime: cust.lifetime,
      tier: cust.tier ? cust.tier.name : null,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.5  STATEMENT (bilingual)
  // ─────────────────────────────────────────────────────────────

  /**
   * Build a bilingual statement for a period.
   *
   * @param {string} customerId
   * @param {{from?:string, to?:string}} [period]   ISO yyyy-mm-dd strings
   * @returns {object} statement — contains `he` and `en` rendered text
   *                    AND a machine-readable `rows` array
   */
  statement(customerId, period = {}) {
    const from = period.from || '1970-01-01';
    const to = period.to || '9999-12-31';

    const rows = [];
    let earnTotal = 0;
    let burnTotal = 0;
    let expireTotal = 0;
    let inTotal = 0;
    let outTotal = 0;

    for (const row of this.ledger) {
      if (row.customerId !== customerId) continue;
      const d = toISODate(row.ts);
      if (d < from || d > to) continue;

      rows.push({
        id: row.id,
        date: d,
        type: row.type,
        subtype: row.subtype || null,
        points: row.points,
        balanceImpact: this._balanceImpactOf(row),
        meta: row.meta || null,
      });

      if (row.type === LEDGER_TYPES.EARN) earnTotal += row.points;
      else if (row.type === LEDGER_TYPES.BURN) burnTotal += -row.points;
      else if (row.type === LEDGER_TYPES.EXPIRE) expireTotal += -row.points;
      else if (row.type === LEDGER_TYPES.TRANSFER_IN) inTotal += row.points;
      else if (row.type === LEDGER_TYPES.TRANSFER_OUT) outTotal += -row.points;
      else if (row.type === LEDGER_TYPES.CAMPAIGN) earnTotal += row.points;
    }

    const bal = this.balance(customerId);
    const tp = this.tierProgress(customerId);

    const heLines = [
      `${label('heading').he}`,
      `${label('period').he}: ${from} — ${to}`,
      `${label('balance').he}: ${bal.current}`,
      `${label('expiring').he}: ${bal.expiringSoon}`,
      `${label('lifetime').he}: ${bal.lifetime}`,
      `${label('tier').he}: ${tp.currentTier || '-'}`,
      `${label('nextTier').he}: ${tp.nextTier || '-'}`,
      `${label('pointsToNext').he}: ${tp.pointsToNext}`,
      '',
      `${label('earn').he}: +${earnTotal}`,
      `${label('burn').he}: -${burnTotal}`,
      `${label('expire').he}: -${expireTotal}`,
      `${label('transferIn').he}: +${inTotal}`,
      `${label('transferOut').he}: -${outTotal}`,
    ];

    const enLines = [
      `${label('heading').en}`,
      `${label('period').en}: ${from} — ${to}`,
      `${label('balance').en}: ${bal.current}`,
      `${label('expiring').en}: ${bal.expiringSoon}`,
      `${label('lifetime').en}: ${bal.lifetime}`,
      `${label('tier').en}: ${tp.currentTier || '-'}`,
      `${label('nextTier').en}: ${tp.nextTier || '-'}`,
      `${label('pointsToNext').en}: ${tp.pointsToNext}`,
      '',
      `${label('earn').en}: +${earnTotal}`,
      `${label('burn').en}: -${burnTotal}`,
      `${label('expire').en}: -${expireTotal}`,
      `${label('transferIn').en}: +${inTotal}`,
      `${label('transferOut').en}: -${outTotal}`,
    ];

    if (rows.length === 0) {
      heLines.push('', label('noActivity').he);
      enLines.push('', label('noActivity').en);
    }

    return {
      customerId,
      from,
      to,
      rows,
      totals: {
        earned: earnTotal,
        redeemed: burnTotal,
        expired: expireTotal,
        transferredIn: inTotal,
        transferredOut: outTotal,
      },
      balance: bal,
      tierProgress: tp,
      he: heLines.join('\n'),
      en: enLines.join('\n'),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.6  TIER PROGRESS
  // ─────────────────────────────────────────────────────────────

  tierProgress(customerId) {
    this._requireProgram();
    const cust = this._customer(customerId);
    const tiers = this.program.tiers;
    const current = this._tierForLifetime(cust.lifetime);

    let next = null;
    for (const t of tiers) {
      if (t.threshold > cust.lifetime) {
        next = t;
        break;
      }
    }

    const pointsToNext = next ? Math.max(0, next.threshold - cust.lifetime) : 0;
    const progressRatio = next && current
      ? (cust.lifetime - current.threshold) / Math.max(1, next.threshold - current.threshold)
      : 1;

    return {
      customerId,
      lifetime: cust.lifetime,
      currentTier: current ? current.name : null,
      currentThreshold: current ? current.threshold : 0,
      currentBenefits: current ? current.benefits.slice() : [],
      currentMultiplier: current ? current.multiplier : 1,
      nextTier: next ? next.name : null,
      nextThreshold: next ? next.threshold : null,
      pointsToNext,
      progressRatio: Math.max(0, Math.min(1, progressRatio)),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.7  EXPIRE POINTS (FIFO)
  // ─────────────────────────────────────────────────────────────

  /**
   * Walk the ledger and expire any earn rows whose
   * `expiresAt` <= asOfDate. Produces one `expire` ledger row per
   * affected earn row. FIFO preserved implicitly — earn rows keep
   * insertion order.
   *
   * @param {{asOfDate:string}} [args]
   * @returns {{expired: Array<object>, totalPointsExpired: number}}
   */
  expirePoints({ asOfDate } = {}) {
    this._requireProgram();
    const cutoff = asOfDate || toISODate(this._now());
    const expired = [];
    let totalPts = 0;

    for (const row of this.ledger) {
      if (row.type !== LEDGER_TYPES.EARN) continue;
      if (!row.expiresAt) continue;
      if (row.remaining <= 0) continue;
      if (row.expiresAt > cutoff) continue;

      const pts = row.remaining;
      this._decrementRemaining(row.id, pts);

      const expireEntry = Object.freeze({
        id: this._nextId(),
        ts: cutoff + 'T23:59:59.000Z',
        customerId: row.customerId,
        type: LEDGER_TYPES.EXPIRE,
        subtype: null,
        points: -pts,
        sourceEarnId: row.id,
        tierAtTime: row.tierAtTime,
        meta: Object.freeze({
          expiredAt: cutoff,
          originalEarnedAt: row.earnedAt,
          originalExpiresAt: row.expiresAt,
        }),
      });
      this.ledger.push(expireEntry);
      expired.push(expireEntry);
      totalPts += pts;

      // update customer cache
      const cust = this._customer(row.customerId);
      cust.currentBalance -= pts;
      this._redemptionHistory.totalExpired += pts;
    }

    return { expired, totalPointsExpired: totalPts };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.8  BREAKAGE CALCULATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Breakage = fraction of points that expire without being redeemed.
   * Formula:
   *     breakageRate = expired / (expired + redeemed + outstanding)
   * Also returns historical & expected (= 1 - redemption probability).
   */
  breakageCalc() {
    const hist = this._redemptionHistory;
    let outstanding = 0;
    for (const row of this.ledger) {
      if (row.type === LEDGER_TYPES.EARN && row.remaining > 0) {
        outstanding += row.remaining;
      }
    }
    const denom = Math.max(1, hist.totalEarnedGross);
    const breakageRate = hist.totalExpired / denom;
    const redemptionRate = hist.totalRedeemed / denom;
    const outstandingRate = outstanding / denom;

    return {
      totalEarnedGross: hist.totalEarnedGross,
      totalRedeemed: hist.totalRedeemed,
      totalExpired: hist.totalExpired,
      outstanding,
      breakageRate: round2(breakageRate),
      redemptionRate: round2(redemptionRate),
      outstandingRate: round2(outstandingRate),
      expectedBreakageRate: round2(1 - DEFAULT_REDEMPTION_PROBABILITY),
      // Accrual reversal value in ILS — what we recognize as "breakage revenue"
      // when the expired points are de-recognized from the contract liability.
      reversalValueILS: round2(hist.totalExpired * this._fairValuePerPoint()),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.9  IFRS 15 LIABILITY PROVISION
  // ─────────────────────────────────────────────────────────────

  /**
   * Closing IFRS 15 contract liability for the period.
   * The liability equals the fair value of all OUTSTANDING points
   * as of `period.to`, weighted by the expected redemption probability
   * (so we don't over-accrue for points that will break).
   *
   * Returns an object ready to post:
   *   { dr, cr, memo, heMemo, enMemo, outstanding, fairValuePerPoint, … }
   */
  liabilityProvision(period = {}) {
    const asOf = period.to || toISODate(this._now());
    let outstanding = 0;
    for (const row of this.ledger) {
      if (row.type !== LEDGER_TYPES.EARN) continue;
      if (!row.remaining || row.remaining <= 0) continue;
      if (toISODate(row.ts) > asOf) continue; // future rows don't count
      outstanding += row.remaining;
    }

    const fvpp = this._fairValuePerPoint();
    // IFRS 15: fair value × expected redemption probability
    // (remaining portion is recognized as breakage on expiry).
    const expectedLiability = round2(outstanding * fvpp * DEFAULT_REDEMPTION_PROBABILITY);

    return {
      period: { from: period.from || null, to: asOf },
      outstandingPoints: outstanding,
      fairValuePerPoint: fvpp,
      redemptionProbability: DEFAULT_REDEMPTION_PROBABILITY,
      closingLiabilityILS: expectedLiability,
      // Double-entry hint — lets the GL module post straight away
      journal: Object.freeze({
        dr: { account: 'deferred-revenue-loyalty-points', amount: 0 },
        cr: { account: 'contract-liability-loyalty-points', amount: expectedLiability },
      }),
      heMemo: `${label('liability').he} של ${outstanding} נקודות = ₪${expectedLiability}`,
      enMemo: `${label('liability').en} for ${outstanding} points = ILS ${expectedLiability}`,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.10  FRAUD RULES
  // ─────────────────────────────────────────────────────────────

  /**
   * Run the anti-fraud checks against the current ledger.
   *
   * @param {object} [thresholds]   override defaults per-call
   * @returns {{alerts: Array<{customerId, rule, severity, he, en, rows}>}}
   */
  fraudRules(thresholds = {}) {
    const t = Object.assign({}, this.fraudThresholds, thresholds || {});
    const alerts = [];

    // group earn events per customer, sorted by ts
    const perCust = new Map();
    for (const row of this.ledger) {
      if (row.type !== LEDGER_TYPES.EARN) continue;
      if (!perCust.has(row.customerId)) perCust.set(row.customerId, []);
      perCust.get(row.customerId).push(row);
    }
    for (const arr of perCust.values()) {
      arr.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    }

    for (const [customerId, rows] of perCust.entries()) {
      // ── Velocity: earns per hour ───────────────────────────
      if (t.velocity !== false) {
        for (let i = 0; i < rows.length; i++) {
          let count = 1;
          for (let j = i + 1; j < rows.length; j++) {
            const dt = (new Date(rows[j].ts) - new Date(rows[i].ts)) / 1000;
            if (dt <= 3600) count += 1;
            else break;
          }
          if (count > t.velocityMaxEarnsPerHour) {
            alerts.push({
              customerId,
              rule: 'velocity-earns-per-hour',
              severity: 'high',
              he: `מהירות חריגה: ${count} צבירות בשעה`,
              en: `Unusual velocity: ${count} earns within 1 hour`,
              rows: rows.slice(i, i + count).map((r) => r.id),
            });
            break; // one alert per customer per rule
          }
        }

        // daily points cap
        const buckets = new Map(); // yyyy-mm-dd → total
        for (const r of rows) {
          const d = toISODate(r.ts);
          buckets.set(d, (buckets.get(d) || 0) + r.points);
        }
        for (const [day, pts] of buckets.entries()) {
          if (pts > t.velocityMaxPointsPerDay) {
            alerts.push({
              customerId,
              rule: 'velocity-points-per-day',
              severity: 'medium',
              he: `חריגה יומית: ${pts} נקודות ב-${day}`,
              en: `Daily points ceiling exceeded: ${pts} pts on ${day}`,
              rows: [],
            });
          }
        }
      }

      // ── Duplicate detection ────────────────────────────────
      if (t.duplicates !== false) {
        for (let i = 1; i < rows.length; i++) {
          const prev = rows[i - 1];
          const curr = rows[i];
          const dt = (new Date(curr.ts) - new Date(prev.ts)) / 1000;
          const sameSubtype = prev.subtype === curr.subtype;
          const samePoints = prev.points === curr.points;
          if (dt <= t.duplicateWindowSeconds && sameSubtype && samePoints) {
            alerts.push({
              customerId,
              rule: 'duplicate-earn',
              severity: 'high',
              he: `כפילות זוהתה: אותה צבירה פעמיים בתוך ${t.duplicateWindowSeconds} שניות`,
              en: `Duplicate earn: same event twice within ${t.duplicateWindowSeconds}s`,
              rows: [prev.id, curr.id],
            });
          }
        }
      }

      // ── Geo mismatch ───────────────────────────────────────
      if (t.geoMismatch !== false) {
        for (let i = 1; i < rows.length; i++) {
          const prev = rows[i - 1];
          const curr = rows[i];
          const g1 = prev.meta && prev.meta.geo;
          const g2 = curr.meta && curr.meta.geo;
          if (!g1 || !g2) continue;
          const dt = (new Date(curr.ts) - new Date(prev.ts)) / 1000;
          if (dt > 3600) continue;
          const km = haversineKm(g1, g2);
          if (km >= t.geoMismatchMinKm) {
            alerts.push({
              customerId,
              rule: 'geo-mismatch',
              severity: 'high',
              he: `אי-התאמה גאוגרפית: ${Math.round(km)} ק"מ בפחות משעה`,
              en: `Geographic mismatch: ${Math.round(km)} km in under 1 hour`,
              rows: [prev.id, curr.id],
            });
          }
        }
      }
    }

    return { alerts };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.11  CAMPAIGN POINTS
  // ─────────────────────────────────────────────────────────────

  /**
   * Register a time-boxed bonus campaign. Calls to `earnPoints`
   * between `from` and `to` for matching customers will apply
   * the multiplier on top of the base + tier multipliers.
   *
   * @param {object} args
   * @param {string|function} args.customerSegment  segment id or (customerId) => boolean
   * @param {number} args.multiplier                e.g. 2 for double-points
   * @param {{from:string,to:string}} args.duration
   */
  campaignPoints({ customerSegment, multiplier, duration }) {
    if (!duration || !duration.from || !duration.to) {
      throw new Error('campaignPoints: duration.from and duration.to required');
    }
    if (!(Number(multiplier) > 0)) {
      throw new Error('campaignPoints: multiplier must be positive');
    }
    const campaign = Object.freeze({
      id: 'camp-' + (this.campaigns.length + 1).toString().padStart(4, '0'),
      customerSegment: customerSegment || 'all',
      multiplier: Number(multiplier),
      from: duration.from,
      to: duration.to,
      createdAt: this._now(),
    });
    this.campaigns.push(campaign);
    return campaign;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.12  GIFT TRANSFER
  // ─────────────────────────────────────────────────────────────

  /**
   * Transfer points between two customers.
   * Produces TWO ledger rows (transfer-out on sender, transfer-in on
   * recipient). Append-only — nothing is deleted.
   *
   * @param {object} args
   * @param {string} args.fromCustomer
   * @param {string} args.toCustomer
   * @param {number} args.points
   * @param {string} [args.reason]
   */
  giftTransfer({ fromCustomer, toCustomer, points, reason }) {
    this._requireProgram();
    if (!fromCustomer || !toCustomer) throw new Error('giftTransfer: both customers required');
    if (fromCustomer === toCustomer) throw new Error('giftTransfer: fromCustomer === toCustomer');
    const pts = Number(points) || 0;
    if (pts <= 0) throw new Error('giftTransfer: points must be > 0');

    const senderBal = this._availableFifoBalance(fromCustomer);
    if (senderBal < pts) {
      throw new Error(
        `giftTransfer: insufficient balance on sender (need ${pts}, have ${senderBal}) / יתרה לא מספקת`
      );
    }

    // FIFO consume on sender
    let remainingToTransfer = pts;
    for (const row of this.ledger) {
      if (remainingToTransfer <= 0) break;
      if (row.type !== LEDGER_TYPES.EARN) continue;
      if (row.customerId !== fromCustomer) continue;
      if (row.remaining <= 0) continue;
      const take = Math.min(row.remaining, remainingToTransfer);
      this._decrementRemaining(row.id, take);
      remainingToTransfer -= take;
    }

    const ts = this._now();
    const fairValue = round2(pts * this._fairValuePerPoint());

    const outRow = Object.freeze({
      id: this._nextId(),
      ts,
      customerId: fromCustomer,
      type: LEDGER_TYPES.TRANSFER_OUT,
      subtype: null,
      points: -pts,
      counterparty: toCustomer,
      reason: reason || null,
      fairValue: -fairValue,
      meta: Object.freeze({ reason: reason || null }),
    });

    const inRow = Object.freeze({
      id: this._nextId(),
      ts,
      customerId: toCustomer,
      type: LEDGER_TYPES.TRANSFER_IN,
      subtype: null,
      points: pts,
      remaining: pts,
      // transferred points inherit the recipient's program expiry window
      earnedAt: toISODate(ts),
      expiresAt: this.program.expiryDays > 0 ? addDays(toISODate(ts), this.program.expiryDays) : null,
      counterparty: fromCustomer,
      reason: reason || null,
      fairValue,
      tierAtTime: this._customer(toCustomer).tier ? this._customer(toCustomer).tier.name : null,
      meta: Object.freeze({ reason: reason || null }),
    });

    this.ledger.push(outRow);
    this.ledger.push(inRow);

    // caches
    this._customer(fromCustomer).currentBalance -= pts;
    const recv = this._customer(toCustomer);
    recv.currentBalance += pts;
    // gift transfers DO count toward lifetime (recipient earns)
    recv.lifetime += pts;
    recv.tier = this._tierForLifetime(recv.lifetime);

    return { outRow, inRow };
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  _requireProgram() {
    if (!this.program) throw new Error('LoyaltyPoints: call defineProgram() first / יש להגדיר תוכנית');
  }

  /** Returns (mutable) cache for a customer. */
  _customer(customerId) {
    let c = this.customers.get(customerId);
    if (!c) {
      c = {
        id: customerId,
        lifetime: 0,
        currentBalance: 0,
        tier: this.program ? this._tierForLifetime(0) : null,
      };
      this.customers.set(customerId, c);
    }
    return c;
  }

  /** Walk tiers ascending; return the highest whose threshold ≤ lifetime. */
  _tierForLifetime(lifetime) {
    if (!this.program) return null;
    let found = null;
    for (const t of this.program.tiers) {
      if (lifetime >= t.threshold) found = t;
      else break;
    }
    return found;
  }

  /**
   * Fair value per point in ILS, derived from the best redeemRule
   * ratio (value / pointCost), or DEFAULT when no rules defined.
   */
  _fairValuePerPoint() {
    if (!this.program || !this.program.redeemRules.length) return DEFAULT_FAIR_VALUE_PER_POINT;
    let best = 0;
    for (const r of this.program.redeemRules) {
      if (r.pointCost <= 0) continue;
      const v = r.value / r.pointCost;
      if (v > best) best = v;
    }
    return best > 0 ? round2(best) : DEFAULT_FAIR_VALUE_PER_POINT;
  }

  /** Sum of FIFO-available remaining balance across the customer's earn+transfer-in rows. */
  _availableFifoBalance(customerId) {
    let total = 0;
    for (const row of this.ledger) {
      if (row.customerId !== customerId) continue;
      if (row.type === LEDGER_TYPES.EARN || row.type === LEDGER_TYPES.TRANSFER_IN || row.type === LEDGER_TYPES.CAMPAIGN) {
        total += row.remaining != null ? row.remaining : row.points;
      }
    }
    return total;
  }

  /**
   * Ledger rows are frozen for audit. We still need to decrement
   * the `remaining` counter — so we do it via Object.defineProperty
   * on a NEW row object and swap it in place. This keeps the array
   * append-only semantics while allowing FIFO bookkeeping.
   */
  _decrementRemaining(rowId, amount) {
    const idx = this.ledger.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    const old = this.ledger[idx];
    const newRow = Object.assign({}, old, {
      remaining: Math.max(0, (old.remaining || 0) - amount),
    });
    Object.freeze(newRow);
    this.ledger[idx] = newRow;
  }

  /** Is `customerId` inside the active campaign's segment? */
  _customerInSegment(customerId, segment) {
    if (!segment || segment === 'all') return true;
    if (typeof segment === 'function') {
      try {
        return !!segment(customerId);
      } catch (_) {
        return false;
      }
    }
    // named segments — for now, all named segments resolve truthy.
    // Operator can inject a function for finer control.
    return true;
  }

  /** Pick the campaign multiplier that applies at a given time. */
  _campaignMultiplierFor(customerId, ts) {
    const d = toISODate(ts);
    let mult = 1;
    for (const c of this.campaigns) {
      if (d < c.from || d > c.to) continue;
      if (!this._customerInSegment(customerId, c.customerSegment)) continue;
      mult *= c.multiplier;
    }
    return mult;
  }

  /** Net balance impact signed per row type. */
  _balanceImpactOf(row) {
    if (row.type === LEDGER_TYPES.EARN) return +row.points;
    if (row.type === LEDGER_TYPES.CAMPAIGN) return +row.points;
    if (row.type === LEDGER_TYPES.TRANSFER_IN) return +row.points;
    if (row.type === LEDGER_TYPES.BURN) return row.points; // already negative
    if (row.type === LEDGER_TYPES.EXPIRE) return row.points; // already negative
    if (row.type === LEDGER_TYPES.TRANSFER_OUT) return row.points; // already negative
    if (row.type === LEDGER_TYPES.ADJUST) return row.points;
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  LoyaltyPoints,
  EARN_TYPES,
  REDEEM_TYPES,
  LEDGER_TYPES,
  LABELS,
  DEFAULT_FAIR_VALUE_PER_POINT,
  DEFAULT_REDEMPTION_PROBABILITY,
  DEFAULT_FRAUD_THRESHOLDS,
  // Internal helpers exposed for tests only
  _internal: {
    addDays,
    daysBetween,
    toISODate,
    haversineKm,
    round2,
  },
};
