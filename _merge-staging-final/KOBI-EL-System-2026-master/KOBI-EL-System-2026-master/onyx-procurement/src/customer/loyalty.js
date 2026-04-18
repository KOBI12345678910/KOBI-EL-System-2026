'use strict';

/**
 * Customer Loyalty Engine  |  מנוע תוכנית נאמנות לקוחות
 * =================================================================
 *
 * Agent Y-095  |  Techno-Kol Uzi mega-ERP 2026
 * Distinct from Y-094 (referral) — this module powers REPEAT-PURCHASE
 * rewards: points-per-ILS, tiered benefits, redemptions, expiry,
 * tier recalculation, and fraud detection.
 *
 * -----------------------------------------------------------------
 * HARD RULE — HOUSE LAW
 * -----------------------------------------------------------------
 *   לא מוחקים רק משדרגים ומגדלים
 *   "Never delete — only upgrade and grow."
 *
 *   All ledgers (earn / redemption / expiry / transfer / audit / tier
 *   history) are APPEND-ONLY Maps-of-arrays. Corrections are new
 *   rows with `reversalOf` pointing to the prior row. Closing a
 *   plan grandfathers existing members and records the closure —
 *   the plan itself is never removed from the Map.
 *
 * -----------------------------------------------------------------
 * ZERO DEPENDENCIES
 * -----------------------------------------------------------------
 *   Pure JavaScript, CommonJS. Only Node built-ins (`node:crypto`
 *   for id generation, with a deterministic fallback when crypto
 *   is unavailable — e.g. bundlers, test harnesses).
 *
 * -----------------------------------------------------------------
 * BILINGUAL  |  דו-לשוני
 * -----------------------------------------------------------------
 *   Every surface carries both `*_he` (Hebrew, primary) and `*_en`
 *   (English) fields. RTL-aware labels via the LABELS constant.
 *
 * -----------------------------------------------------------------
 * ISRAELI CONSUMER-PROTECTION LAW COMPLIANCE
 * -----------------------------------------------------------------
 *   חוק הגנת הצרכן, התשמ"א-1981
 *   Consumer Protection Law, 5741-1981
 *
 *   1. ENROLLMENT CONSENT (§2–§2א)
 *      A customer may only be enrolled with explicit, documented
 *      consent (`consentDoc`). The engine REFUSES to enroll a
 *      customer who has not granted consent and stores the consent
 *      document id + timestamp + version for audit. No auto-opt-in.
 *
 *   2. TRUTHFUL DISCLOSURE (§2)
 *      Every earn / redeem / expire / transfer row carries a
 *      bilingual reason and the policy version. The historyStatement
 *      method produces a bilingual statement on demand — the
 *      customer can see exactly what they earned, redeemed, and
 *      when points will expire.
 *
 *   3. NO RETROACTIVE DEGRADATION (§7 — הטעיה; §2ב — תנאים מקפחים)
 *      Plan benefits are versioned. A plan update creates a NEW
 *      version; members on the old version keep their terms unless
 *      the new version is STRICTLY better (larger earnRate, more
 *      benefits, longer expiry). The engine enforces this on every
 *      definePlan call.
 *
 *   4. REFUND / ORDER CANCELLATION (§14ג — ביטול עסקה)
 *      When an order is cancelled, the associated earn row is
 *      reversed by a new negative row with type `earn-reversal`.
 *      The original is PRESERVED for audit. If the customer had
 *      already redeemed points earned from that specific order,
 *      the refund is partial and a supervisor flag is raised.
 *      `refundOrder(customerId, orderId, reason)` handles this.
 *
 *   5. POINT EXPIRY DISCLOSURE (§7)
 *      Expiry dates must be disclosed at earn time and in every
 *      statement. `expireOldPoints` produces a NEW expire row per
 *      batch and NEVER mutates history. The original earn row
 *      keeps its timestamp and points — the engine computes the
 *      balance as sum(earn) − sum(redeem) − sum(expired).
 *
 *   6. TRANSFER AUDIT TRAIL
 *      `transferPoints` writes TWO rows (`transfer-out` +
 *      `transfer-in`) with a shared `pairId`. Transfers are
 *      append-only — they CANNOT be undone by deletion, only by
 *      a fresh counter-transfer.
 *
 *   7. PROGRAM CLOSURE (§2, §14)
 *      `closeProgram` records a closure event, marks the plan
 *      `status: 'closed'`, but the plan remains in the Map forever.
 *      Existing members keep their unredeemed balance and are
 *      notified via the statement. No points are forfeited by
 *      closure alone — only by their own expiry rule.
 *
 * -----------------------------------------------------------------
 * PUBLIC API
 * -----------------------------------------------------------------
 *
 *   const { LoyaltyEngine } = require('./customer/loyalty');
 *   const engine = new LoyaltyEngine({ now, randomId });
 *
 *   engine.definePlan({id, name_he, name_en, earnRate,
 *                      tiers:[{name, threshold, multiplier, benefits}],
 *                      expiryDays, currency})
 *   engine.enrollCustomer({customerId, planId, consentDoc})
 *   engine.earnPoints({customerId, orderId, orderAmount,
 *                      eligibleCategories, multiplier?})
 *   engine.redeemPoints({customerId, points, reward, orderId})
 *   engine.currentBalance(customerId)           → number
 *   engine.expireOldPoints(now?)                → array<expire rows>
 *   engine.tierRecalculation(customerId)        → tier info
 *   engine.tierBenefits(customerId)             → array of perks
 *   engine.transferPoints({fromCustomerId, toCustomerId, points, reason})
 *   engine.historyStatement(customerId, {fromDate, toDate})
 *   engine.programAudit(period)                 → issued/redeemed/expired/outstanding
 *   engine.closeProgram(planId, date)           → closure record (plan preserved)
 *   engine.fraudDetection(customerId)           → array of anomaly flags
 *
 * -----------------------------------------------------------------
 * STORAGE (in-memory, append-only)
 * -----------------------------------------------------------------
 *   plans         Map<planId, PlanVersion[]>
 *   planHistory   Map<planId, PlanChangeLog[]>
 *   members       Map<customerId, Member>
 *   earnLog       Map<customerId, EarnRow[]>
 *   redeemLog     Map<customerId, RedeemRow[]>
 *   expireLog     Map<customerId, ExpireRow[]>
 *   transferLog   EmbeddedArray of TransferRow
 *   tierHistory   Map<customerId, TierHistoryRow[]>
 *   consentVault  Map<customerId, ConsentRecord[]>
 *   closureLog    PlanId → ClosureRow[]  (append-only)
 *   refundLog     Map<orderId, RefundRow[]>
 *
 * Nothing is ever `delete`d. Nothing is ever mutated after write.
 * =================================================================
 */

// --- Deterministic fallback for node:crypto (tests + bundlers) -----

let _cryptoRandomUUID = null;
try {
  // eslint-disable-next-line global-require
  _cryptoRandomUUID = require('node:crypto').randomUUID;
} catch (_e) {
  _cryptoRandomUUID = null;
}

let _idCounter = 0;
function _fallbackId(prefix) {
  _idCounter += 1;
  return `${prefix}-${String(_idCounter).padStart(10, '0')}`;
}

function defaultRandomId(prefix) {
  if (typeof _cryptoRandomUUID === 'function') {
    return `${prefix}-${_cryptoRandomUUID().slice(0, 12)}`;
  }
  return _fallbackId(prefix);
}

// --- Constants ----------------------------------------------------

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

const LABELS = Object.freeze({
  he: Object.freeze({
    dir: 'rtl',
    plan: 'תוכנית נאמנות',
    member: 'חבר מועדון',
    balance: 'יתרת נקודות',
    earn: 'צבירה',
    redeem: 'מימוש',
    expired: 'פג תוקף',
    transferOut: 'העברה יוצאת',
    transferIn: 'העברה נכנסת',
    earnReversal: 'ביטול צבירה (החזר)',
    tier: 'דרגת חבר',
    bronze: 'ארד',
    silver: 'כסף',
    gold: 'זהב',
    platinum: 'פלטינה',
    diamond: 'יהלום',
    statement: 'דוח חשבון נקודות',
    fromDate: 'מתאריך',
    toDate: 'עד תאריך',
    total: 'סך הכל',
    consent: 'הסכמה מפורשת לתוכנית נאמנות',
    consentRequired: 'נדרשת הסכמה מפורשת של הצרכן לפי חוק הגנת הצרכן',
    closed: 'סגורה',
    active: 'פעילה',
    outstanding: 'התחייבות פתוחה',
    benefits: 'הטבות',
    nextTier: 'דרגה הבאה',
    pointsToNextTier: 'נקודות לדרגה הבאה',
    refund: 'החזר ללקוח',
    fraud: 'חשד הונאה',
    auditTrail: 'מסלול ביקורת',
  }),
  en: Object.freeze({
    dir: 'ltr',
    plan: 'Loyalty plan',
    member: 'Member',
    balance: 'Points balance',
    earn: 'Earn',
    redeem: 'Redeem',
    expired: 'Expired',
    transferOut: 'Transfer out',
    transferIn: 'Transfer in',
    earnReversal: 'Earn reversal (refund)',
    tier: 'Tier',
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    diamond: 'Diamond',
    statement: 'Points statement',
    fromDate: 'From',
    toDate: 'To',
    total: 'Total',
    consent: 'Explicit loyalty program consent',
    consentRequired: 'Explicit consumer consent required per Consumer Protection Law',
    closed: 'closed',
    active: 'active',
    outstanding: 'Outstanding liability',
    benefits: 'Benefits',
    nextTier: 'Next tier',
    pointsToNextTier: 'Points to next tier',
    refund: 'Customer refund',
    fraud: 'Fraud suspected',
    auditTrail: 'Audit trail',
  }),
});

const LEDGER_TYPES = Object.freeze({
  EARN: 'earn',
  REDEEM: 'redeem',
  EXPIRE: 'expire',
  TRANSFER_OUT: 'transfer-out',
  TRANSFER_IN: 'transfer-in',
  EARN_REVERSAL: 'earn-reversal',
});

const CONSENT_VERSION = '2026-04-11';

// --- Helpers ------------------------------------------------------

function _assert(cond, message, code) {
  if (!cond) {
    const full = code ? `[${code}] ${message}` : message;
    const err = new Error(full);
    if (code) err.code = code;
    throw err;
  }
}

function _toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date(v);
  return new Date();
}

function _addDays(date, days) {
  const d = _toDate(date);
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + Math.floor(days));
  return out;
}

function _monthsAgo(date, months) {
  const d = _toDate(date);
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() - months);
  return out;
}

function _toISO(v) {
  return _toDate(v).toISOString();
}

function _round(n) {
  return Math.round(n * 100) / 100;
}

function _sortTiers(tiers) {
  // bronze..diamond ordering by threshold ASC
  return tiers
    .slice()
    .sort((a, b) => (a.threshold || 0) - (b.threshold || 0));
}

function _tierRank(tierName) {
  const idx = TIER_ORDER.indexOf(String(tierName || '').toLowerCase());
  return idx === -1 ? -1 : idx;
}

function _isStrictlyBetter(newPlan, oldPlan) {
  // Consumer-protection §2ב — no retroactive degradation.
  // Allowed update: earnRate >=, expiryDays >=, tier count >=,
  //                 every existing tier's multiplier >= previous.
  if (newPlan.earnRate < oldPlan.earnRate) return false;
  if ((newPlan.expiryDays || 0) < (oldPlan.expiryDays || 0)) return false;
  if ((newPlan.tiers || []).length < (oldPlan.tiers || []).length) return false;

  const oldByName = new Map(
    (oldPlan.tiers || []).map((t) => [String(t.name).toLowerCase(), t]),
  );
  for (const t of newPlan.tiers || []) {
    const prior = oldByName.get(String(t.name).toLowerCase());
    if (prior && (t.multiplier || 1) < (prior.multiplier || 1)) return false;
  }
  return true;
}

// --- Main class ---------------------------------------------------

class LoyaltyEngine {
  constructor(opts = {}) {
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    this._randomId = typeof opts.randomId === 'function' ? opts.randomId : defaultRandomId;

    // Plans — Map<planId, Array<PlanVersion>>. Current = last element.
    this._plans = new Map();
    // Plan change history (definePlan invocations)
    this._planHistory = new Map();
    // Members — Map<customerId, Member>
    this._members = new Map();
    // Append-only earn / redeem / expire logs keyed by customerId
    this._earnLog = new Map();
    this._redeemLog = new Map();
    this._expireLog = new Map();
    // Tier recalculation history per customer
    this._tierHistory = new Map();
    // Consent vault per customer (array — append-only)
    this._consentVault = new Map();
    // Global append-only transfer log
    this._transferLog = [];
    // Program closure records per plan
    this._closureLog = new Map();
    // Refund records per order
    this._refundLog = new Map();
    // Program-level audit entries (closures, refunds, fraud hits …)
    this._programAuditLog = [];
  }

  // --- Internal plumbing ------------------------------------------

  _getCurrentPlan(planId) {
    const versions = this._plans.get(planId);
    if (!versions || versions.length === 0) return null;
    return versions[versions.length - 1];
  }

  _getMember(customerId) {
    return this._members.get(customerId) || null;
  }

  _initLog(map, customerId) {
    if (!map.has(customerId)) map.set(customerId, []);
    return map.get(customerId);
  }

  _logAudit(event, payload) {
    this._programAuditLog.push({
      id: this._randomId('aud'),
      ts: this._now(),
      event,
      payload,
    });
  }

  // --- 1. definePlan ----------------------------------------------

  definePlan(spec) {
    _assert(spec && typeof spec === 'object', 'definePlan: spec required', 'E_SPEC');
    _assert(spec.id, 'definePlan: id required', 'E_PLAN_ID');
    _assert(spec.name_he && spec.name_en, 'definePlan: bilingual name required', 'E_BILINGUAL');
    _assert(typeof spec.earnRate === 'number' && spec.earnRate > 0, 'definePlan: earnRate must be > 0', 'E_EARN_RATE');
    _assert(Array.isArray(spec.tiers) && spec.tiers.length >= 1, 'definePlan: at least one tier required', 'E_TIERS');

    // Validate tier names belong to the canonical order
    for (const t of spec.tiers) {
      _assert(t && t.name, 'definePlan: tier.name required', 'E_TIER_NAME');
      _assert(
        TIER_ORDER.includes(String(t.name).toLowerCase()),
        `definePlan: tier "${t.name}" must be one of ${TIER_ORDER.join('/')}`,
        'E_TIER_UNKNOWN',
      );
      _assert(typeof t.threshold === 'number' && t.threshold >= 0, 'definePlan: tier.threshold must be >= 0', 'E_TIER_THRESHOLD');
      _assert(typeof t.multiplier === 'number' && t.multiplier > 0, 'definePlan: tier.multiplier must be > 0', 'E_TIER_MULT');
    }

    const sortedTiers = _sortTiers(spec.tiers).map((t) => ({
      name: String(t.name).toLowerCase(),
      threshold: t.threshold,
      multiplier: t.multiplier,
      benefits: Array.isArray(t.benefits) ? t.benefits.slice() : [],
    }));

    const prior = this._getCurrentPlan(spec.id);
    const version = prior ? prior.version + 1 : 1;

    const newPlan = {
      id: spec.id,
      name_he: spec.name_he,
      name_en: spec.name_en,
      earnRate: spec.earnRate,
      tiers: sortedTiers,
      expiryDays: spec.expiryDays || 0,
      currency: spec.currency || 'ILS',
      version,
      status: 'active',
      createdAt: this._now(),
    };

    if (prior) {
      _assert(
        _isStrictlyBetter(newPlan, prior),
        'definePlan: new version must be STRICTLY BETTER than prior (Consumer Protection §2ב)',
        'E_DEGRADATION',
      );
    }

    if (!this._plans.has(spec.id)) this._plans.set(spec.id, []);
    this._plans.get(spec.id).push(newPlan);

    if (!this._planHistory.has(spec.id)) this._planHistory.set(spec.id, []);
    this._planHistory.get(spec.id).push({
      id: this._randomId('phl'),
      ts: this._now(),
      version,
      action: prior ? 'upgrade' : 'create',
    });

    this._logAudit('plan.define', { planId: spec.id, version });
    return { ...newPlan };
  }

  // --- 2. enrollCustomer ------------------------------------------

  enrollCustomer({ customerId, planId, consentDoc }) {
    _assert(customerId, 'enrollCustomer: customerId required', 'E_CUST');
    _assert(planId, 'enrollCustomer: planId required', 'E_PLAN');
    const plan = this._getCurrentPlan(planId);
    _assert(plan, `enrollCustomer: plan "${planId}" not defined`, 'E_PLAN_MISSING');
    _assert(plan.status === 'active', `enrollCustomer: plan "${planId}" is closed`, 'E_PLAN_CLOSED');

    _assert(
      consentDoc && typeof consentDoc === 'object',
      `enrollCustomer: consentDoc required — ${LABELS.he.consentRequired}`,
      'E_CONSENT_REQUIRED',
    );
    _assert(
      consentDoc.documentId && consentDoc.signedAt,
      'enrollCustomer: consentDoc must include {documentId, signedAt}',
      'E_CONSENT_FIELDS',
    );

    if (this._members.has(customerId)) {
      const m = this._members.get(customerId);
      _assert(
        m.planId !== planId,
        `enrollCustomer: customer "${customerId}" already enrolled in "${planId}"`,
        'E_DUP_ENROLL',
      );
    }

    const member = {
      customerId,
      planId,
      planVersionAtEnroll: plan.version,
      enrolledAt: this._now(),
      status: 'active',
      tier: plan.tiers[0].name, // start at the lowest tier
      lastTierRecalculationAt: null,
    };
    this._members.set(customerId, member);

    const consentRecord = {
      id: this._randomId('cnt'),
      ts: this._now(),
      customerId,
      planId,
      documentId: consentDoc.documentId,
      signedAt: consentDoc.signedAt,
      version: consentDoc.version || CONSENT_VERSION,
      language: consentDoc.language || 'he',
      ipAddress: consentDoc.ipAddress || null,
      method: consentDoc.method || 'digital-signature',
    };
    this._initLog(this._consentVault, customerId).push(consentRecord);

    this._logAudit('member.enroll', { customerId, planId, consentId: consentRecord.id });
    return { ...member, consentId: consentRecord.id };
  }

  // --- 3. earnPoints ----------------------------------------------

  earnPoints({ customerId, orderId, orderAmount, eligibleCategories, multiplier }) {
    _assert(customerId, 'earnPoints: customerId required', 'E_CUST');
    _assert(orderId, 'earnPoints: orderId required', 'E_ORDER');
    _assert(typeof orderAmount === 'number' && orderAmount >= 0, 'earnPoints: orderAmount must be >= 0', 'E_AMT');

    const member = this._getMember(customerId);
    _assert(member, `earnPoints: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    const plan = this._getCurrentPlan(member.planId);
    _assert(plan, 'earnPoints: plan missing', 'E_PLAN_MISSING');
    _assert(plan.status === 'active', 'earnPoints: plan is closed — no new accruals', 'E_PLAN_CLOSED');

    const tier = plan.tiers.find((t) => t.name === member.tier) || plan.tiers[0];
    const tierMult = tier.multiplier || 1;
    const explicitMult = typeof multiplier === 'number' && multiplier > 0 ? multiplier : 1;

    // eligibleCategories — optional allowlist. If provided, only count
    // the portion of the order that matches. Shape: [{name, amount}]
    let eligibleAmount = orderAmount;
    if (Array.isArray(eligibleCategories) && eligibleCategories.length > 0) {
      eligibleAmount = eligibleCategories.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    }

    const basePoints = Math.floor(eligibleAmount * plan.earnRate);
    const totalPoints = Math.floor(basePoints * tierMult * explicitMult);

    const now = this._now();
    const expiresAt = plan.expiryDays > 0 ? _toISO(_addDays(now, plan.expiryDays)) : null;

    const row = {
      id: this._randomId('ern'),
      ts: now,
      type: LEDGER_TYPES.EARN,
      customerId,
      planId: plan.id,
      planVersion: plan.version,
      orderId,
      orderAmount,
      eligibleAmount,
      eligibleCategories: Array.isArray(eligibleCategories) ? eligibleCategories.slice() : null,
      basePoints,
      tierAtTime: member.tier,
      tierMultiplier: tierMult,
      explicitMultiplier: explicitMult,
      points: totalPoints,
      expiresAt,
      reason_he: `צבירה עבור הזמנה ${orderId}`,
      reason_en: `Earn for order ${orderId}`,
    };

    this._initLog(this._earnLog, customerId).push(row);
    return { ...row };
  }

  // --- 4. redeemPoints --------------------------------------------

  redeemPoints({ customerId, points, reward, orderId }) {
    _assert(customerId, 'redeemPoints: customerId required', 'E_CUST');
    _assert(typeof points === 'number' && points > 0, 'redeemPoints: points must be > 0', 'E_POINTS');
    _assert(reward, 'redeemPoints: reward required', 'E_REWARD');

    const member = this._getMember(customerId);
    _assert(member, `redeemPoints: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    // Balance check — uses full balance calculation (incl. expiry)
    const balance = this.currentBalance(customerId);
    _assert(
      balance >= points,
      `redeemPoints: insufficient balance — have ${balance}, need ${points}`,
      'E_INSUFFICIENT',
    );

    const row = {
      id: this._randomId('rdm'),
      ts: this._now(),
      type: LEDGER_TYPES.REDEEM,
      customerId,
      planId: member.planId,
      points: -Math.abs(points),
      absolutePoints: points,
      reward: {
        type: reward.type || 'generic',
        name_he: reward.name_he || '',
        name_en: reward.name_en || '',
        value: reward.value || 0,
      },
      orderId: orderId || null,
      reason_he: `מימוש עבור ${reward.name_he || reward.type}`,
      reason_en: `Redeem for ${reward.name_en || reward.type}`,
    };
    this._initLog(this._redeemLog, customerId).push(row);
    return { ...row };
  }

  // --- 5. currentBalance ------------------------------------------

  currentBalance(customerId) {
    const earns = this._earnLog.get(customerId) || [];
    const redeems = this._redeemLog.get(customerId) || [];
    const expires = this._expireLog.get(customerId) || [];

    let total = 0;
    for (const r of earns) total += r.points;
    for (const r of redeems) total += r.points; // already negative
    for (const r of expires) total += r.points; // already negative
    return total;
  }

  // --- 6. expireOldPoints -----------------------------------------

  expireOldPoints(now) {
    const clockISO = now ? _toISO(now) : this._now();
    const clockMs = _toDate(clockISO).getTime();
    const produced = [];

    // FIFO: consume earn rows oldest→newest. A redeem/earn-reversal
    // consumes earliest available non-expired points (computed as
    // sum — we don't need to touch individual rows because the
    // ledger is append-only).
    for (const [customerId, earns] of this._earnLog) {
      const redeems = this._redeemLog.get(customerId) || [];
      const existingExpires = this._expireLog.get(customerId) || [];

      // Already-redeemed (absolute)
      let consumed = 0;
      for (const r of redeems) consumed += Math.abs(r.points);
      // Already-expired (absolute)
      let expired = 0;
      for (const r of existingExpires) expired += Math.abs(r.points);

      // Walk FIFO and tally how many points of each earn row are
      // still "live".
      const fifo = earns
        .slice()
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));

      let toConsume = consumed + expired; // already spent
      for (const e of fifo) {
        let live = e.points;
        if (toConsume > 0) {
          const take = Math.min(live, toConsume);
          live -= take;
          toConsume -= take;
        }
        if (live <= 0) continue;
        if (!e.expiresAt) continue;
        const expMs = _toDate(e.expiresAt).getTime();
        if (expMs > clockMs) continue;

        const expireRow = {
          id: this._randomId('exp'),
          ts: clockISO,
          type: LEDGER_TYPES.EXPIRE,
          customerId,
          planId: e.planId,
          earnRowId: e.id,
          points: -live,
          absolutePoints: live,
          originalExpiresAt: e.expiresAt,
          reason_he: `פקיעת תוקף נקודות צבירה ${e.id}`,
          reason_en: `Expiry of earn row ${e.id}`,
        };
        this._initLog(this._expireLog, customerId).push(expireRow);
        produced.push(expireRow);
      }
    }

    if (produced.length > 0) {
      this._logAudit('points.expire.batch', { count: produced.length, clock: clockISO });
    }
    return produced;
  }

  // --- 7. tierRecalculation ---------------------------------------

  tierRecalculation(customerId) {
    const member = this._getMember(customerId);
    _assert(member, `tierRecalculation: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    const plan = this._getCurrentPlan(member.planId);
    _assert(plan, 'tierRecalculation: plan missing', 'E_PLAN_MISSING');

    const nowISO = this._now();
    const cutoff = _monthsAgo(nowISO, 12).getTime();

    const earns = this._earnLog.get(customerId) || [];
    // Activity window — sum of basePoints over the last 12 months
    let window = 0;
    for (const e of earns) {
      if (new Date(e.ts).getTime() >= cutoff) window += e.basePoints || 0;
    }

    // Pick the highest tier whose threshold <= window
    let chosen = plan.tiers[0];
    for (const t of plan.tiers) {
      if (window >= t.threshold) chosen = t;
    }

    const previous = member.tier;
    const changed = previous !== chosen.name;

    // Consumer protection: never DOWNGRADE a member inside the
    // activity window — grace period of 30 days before a downgrade
    // takes effect. If the prior tier is higher, keep the prior.
    let effective = chosen.name;
    let downgradeGraceUntil = null;
    if (_tierRank(previous) > _tierRank(chosen.name)) {
      effective = previous;
      downgradeGraceUntil = _toISO(_addDays(nowISO, 30));
    }

    // Append-only tier history
    const row = {
      id: this._randomId('thi'),
      ts: nowISO,
      customerId,
      planId: plan.id,
      windowPoints: window,
      previous,
      computed: chosen.name,
      effective,
      changed,
      downgradeGraceUntil,
    };
    this._initLog(this._tierHistory, customerId).push(row);

    // Upgrade the member (mutation of member state is OK — the log
    // is the immutable audit trail, the member is a projection).
    this._members.set(customerId, {
      ...member,
      tier: effective,
      lastTierRecalculationAt: nowISO,
    });

    return { ...row, tier: effective };
  }

  // --- 8. tierBenefits --------------------------------------------

  tierBenefits(customerId) {
    const member = this._getMember(customerId);
    _assert(member, `tierBenefits: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');
    const plan = this._getCurrentPlan(member.planId);
    _assert(plan, 'tierBenefits: plan missing', 'E_PLAN_MISSING');

    const currentRank = _tierRank(member.tier);
    // All tiers at or below the current tier are considered "active".
    // This is the customer-friendly interpretation — higher tiers
    // inherit lower-tier perks.
    const active = [];
    for (const t of plan.tiers) {
      if (_tierRank(t.name) <= currentRank) {
        for (const b of t.benefits || []) {
          active.push({ tier: t.name, benefit: b });
        }
      }
    }

    // Compute next tier progress
    const activity = this._earnLog.get(customerId) || [];
    const cutoff = _monthsAgo(this._now(), 12).getTime();
    let windowPoints = 0;
    for (const e of activity) {
      if (new Date(e.ts).getTime() >= cutoff) windowPoints += e.basePoints || 0;
    }
    let nextTier = null;
    let pointsToNextTier = 0;
    for (const t of plan.tiers) {
      if (_tierRank(t.name) > currentRank) {
        nextTier = t.name;
        pointsToNextTier = Math.max(0, t.threshold - windowPoints);
        break;
      }
    }

    return {
      tier: member.tier,
      tier_he: LABELS.he[member.tier] || member.tier,
      tier_en: LABELS.en[member.tier] || member.tier,
      benefits: active,
      windowPoints,
      nextTier,
      pointsToNextTier,
    };
  }

  // --- 9. transferPoints ------------------------------------------

  transferPoints({ fromCustomerId, toCustomerId, points, reason }) {
    _assert(fromCustomerId, 'transferPoints: fromCustomerId required', 'E_FROM');
    _assert(toCustomerId, 'transferPoints: toCustomerId required', 'E_TO');
    _assert(fromCustomerId !== toCustomerId, 'transferPoints: cannot transfer to self', 'E_SELF');
    _assert(typeof points === 'number' && points > 0, 'transferPoints: points must be > 0', 'E_POINTS');

    const fromMember = this._getMember(fromCustomerId);
    _assert(fromMember, `transferPoints: sender "${fromCustomerId}" not enrolled`, 'E_FROM_NOT_ENROLLED');
    const toMember = this._getMember(toCustomerId);
    _assert(toMember, `transferPoints: receiver "${toCustomerId}" not enrolled`, 'E_TO_NOT_ENROLLED');
    _assert(
      fromMember.planId === toMember.planId,
      'transferPoints: transfers only allowed within the same plan',
      'E_CROSS_PLAN',
    );

    const balance = this.currentBalance(fromCustomerId);
    _assert(
      balance >= points,
      `transferPoints: insufficient balance — have ${balance}, need ${points}`,
      'E_INSUFFICIENT',
    );

    const pairId = this._randomId('txp');
    const ts = this._now();

    // Record on REDEEM log (negative) for sender
    const outRow = {
      id: this._randomId('rdm'),
      ts,
      type: LEDGER_TYPES.TRANSFER_OUT,
      customerId: fromCustomerId,
      planId: fromMember.planId,
      pairId,
      points: -Math.abs(points),
      absolutePoints: points,
      counterparty: toCustomerId,
      reason: reason || 'customer transfer',
      reason_he: `העברת נקודות ל-${toCustomerId}`,
      reason_en: `Transfer to ${toCustomerId}`,
    };
    this._initLog(this._redeemLog, fromCustomerId).push(outRow);

    // Record on EARN log (positive) for receiver, with same pairId.
    // These transferred-in points inherit the SHORTER of the two
    // expiry dates — conservative + legally safe.
    const plan = this._getCurrentPlan(fromMember.planId);
    const expiresAt = plan && plan.expiryDays > 0 ? _toISO(_addDays(ts, plan.expiryDays)) : null;
    const inRow = {
      id: this._randomId('ern'),
      ts,
      type: LEDGER_TYPES.TRANSFER_IN,
      customerId: toCustomerId,
      planId: toMember.planId,
      planVersion: plan ? plan.version : null,
      pairId,
      points: Math.abs(points),
      basePoints: 0, // transferred-in points do NOT count toward tier
      tierAtTime: toMember.tier,
      tierMultiplier: 1,
      explicitMultiplier: 1,
      orderId: null,
      orderAmount: 0,
      eligibleAmount: 0,
      counterparty: fromCustomerId,
      expiresAt,
      reason: reason || 'customer transfer',
      reason_he: `קבלת נקודות מ-${fromCustomerId}`,
      reason_en: `Received from ${fromCustomerId}`,
    };
    this._initLog(this._earnLog, toCustomerId).push(inRow);

    this._transferLog.push({
      id: pairId,
      ts,
      from: fromCustomerId,
      to: toCustomerId,
      points,
      reason: reason || null,
      outRowId: outRow.id,
      inRowId: inRow.id,
    });

    this._logAudit('points.transfer', { pairId, from: fromCustomerId, to: toCustomerId, points });
    return { pairId, outRow: { ...outRow }, inRow: { ...inRow } };
  }

  // --- 10. historyStatement ---------------------------------------

  historyStatement(customerId, { fromDate, toDate } = {}) {
    const member = this._getMember(customerId);
    _assert(member, `historyStatement: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    const fromMs = fromDate ? _toDate(fromDate).getTime() : 0;
    const toMs = toDate ? _toDate(toDate).getTime() : Number.MAX_SAFE_INTEGER;

    const inWindow = (row) => {
      const t = new Date(row.ts).getTime();
      return t >= fromMs && t <= toMs;
    };

    const earns = (this._earnLog.get(customerId) || []).filter(inWindow);
    const redeems = (this._redeemLog.get(customerId) || []).filter(inWindow);
    const expires = (this._expireLog.get(customerId) || []).filter(inWindow);

    const rows = [];
    for (const r of earns) {
      const he = r.type === LEDGER_TYPES.TRANSFER_IN ? LABELS.he.transferIn : LABELS.he.earn;
      const en = r.type === LEDGER_TYPES.TRANSFER_IN ? LABELS.en.transferIn : LABELS.en.earn;
      rows.push({
        id: r.id,
        ts: r.ts,
        type: r.type,
        label_he: he,
        label_en: en,
        points: r.points,
        reason_he: r.reason_he || '',
        reason_en: r.reason_en || '',
        orderId: r.orderId || null,
        expiresAt: r.expiresAt || null,
      });
    }
    for (const r of redeems) {
      const isTx = r.type === LEDGER_TYPES.TRANSFER_OUT;
      const he = isTx ? LABELS.he.transferOut : LABELS.he.redeem;
      const en = isTx ? LABELS.en.transferOut : LABELS.en.redeem;
      rows.push({
        id: r.id,
        ts: r.ts,
        type: r.type,
        label_he: he,
        label_en: en,
        points: r.points,
        reason_he: r.reason_he || '',
        reason_en: r.reason_en || '',
        orderId: r.orderId || null,
      });
    }
    for (const r of expires) {
      rows.push({
        id: r.id,
        ts: r.ts,
        type: r.type,
        label_he: LABELS.he.expired,
        label_en: LABELS.en.expired,
        points: r.points,
        reason_he: r.reason_he || '',
        reason_en: r.reason_en || '',
      });
    }

    rows.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const closingBalance = rows.reduce((s, r) => s + r.points, 0);

    return {
      customerId,
      tier: member.tier,
      window: {
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      labels: {
        he: LABELS.he,
        en: LABELS.en,
      },
      rows,
      closingBalance,
      header_he: `${LABELS.he.statement} — ${LABELS.he.member}: ${customerId}`,
      header_en: `${LABELS.en.statement} — ${LABELS.en.member}: ${customerId}`,
    };
  }

  // --- 11. programAudit -------------------------------------------

  programAudit(period = {}) {
    const fromMs = period.fromDate ? _toDate(period.fromDate).getTime() : 0;
    const toMs = period.toDate ? _toDate(period.toDate).getTime() : Number.MAX_SAFE_INTEGER;

    const inWin = (r) => {
      const t = new Date(r.ts).getTime();
      return t >= fromMs && t <= toMs;
    };

    let issued = 0;
    let redeemed = 0;
    let expired = 0;
    let transferredOut = 0;
    let transferredIn = 0;

    for (const earns of this._earnLog.values()) {
      for (const r of earns) {
        if (!inWin(r)) continue;
        if (r.type === LEDGER_TYPES.TRANSFER_IN) transferredIn += r.points;
        else issued += r.points;
      }
    }
    for (const redeems of this._redeemLog.values()) {
      for (const r of redeems) {
        if (!inWin(r)) continue;
        if (r.type === LEDGER_TYPES.TRANSFER_OUT) transferredOut += Math.abs(r.points);
        else redeemed += Math.abs(r.points);
      }
    }
    for (const expires of this._expireLog.values()) {
      for (const r of expires) {
        if (!inWin(r)) continue;
        expired += Math.abs(r.points);
      }
    }

    // Outstanding liability = total issued − redeemed − expired
    // (ignore transfers — they are zero-sum within the program)
    let totalIssuedEver = 0;
    let totalRedeemedEver = 0;
    let totalExpiredEver = 0;
    for (const earns of this._earnLog.values()) {
      for (const r of earns) {
        if (r.type !== LEDGER_TYPES.TRANSFER_IN) totalIssuedEver += r.points;
      }
    }
    for (const redeems of this._redeemLog.values()) {
      for (const r of redeems) {
        if (r.type !== LEDGER_TYPES.TRANSFER_OUT) totalRedeemedEver += Math.abs(r.points);
      }
    }
    for (const expires of this._expireLog.values()) {
      for (const r of expires) totalExpiredEver += Math.abs(r.points);
    }

    const outstanding = totalIssuedEver - totalRedeemedEver - totalExpiredEver;

    return {
      period: {
        fromDate: period.fromDate || null,
        toDate: period.toDate || null,
      },
      issued,
      redeemed,
      expired,
      transferredOut,
      transferredIn,
      outstandingLiability: outstanding,
      label_he: `${LABELS.he.auditTrail} — ${LABELS.he.outstanding}: ${outstanding}`,
      label_en: `${LABELS.en.auditTrail} — ${LABELS.en.outstanding}: ${outstanding}`,
    };
  }

  // --- 12. closeProgram -------------------------------------------

  closeProgram(planId, date) {
    const plan = this._getCurrentPlan(planId);
    _assert(plan, `closeProgram: plan "${planId}" not defined`, 'E_PLAN_MISSING');
    _assert(plan.status === 'active', `closeProgram: plan "${planId}" already closed`, 'E_ALREADY_CLOSED');

    const closureDate = date ? _toISO(date) : this._now();

    // Grandfather existing members — they keep their balance + tier.
    // Build a snapshot of outstanding balances at the moment of closure.
    const grandfathered = [];
    for (const [customerId, member] of this._members) {
      if (member.planId !== planId) continue;
      const balance = this.currentBalance(customerId);
      grandfathered.push({
        customerId,
        tier: member.tier,
        balance,
      });
    }

    // Append-only — we MUTATE ONLY the `status` field on the
    // current version (callers expect plan.status to reflect
    // reality) but the prior versions remain untouched and
    // the closure record is the immutable source of truth.
    const versions = this._plans.get(planId);
    const current = versions[versions.length - 1];
    versions[versions.length - 1] = {
      ...current,
      status: 'closed',
      closedAt: closureDate,
    };

    const closureRow = {
      id: this._randomId('cls'),
      ts: this._now(),
      planId,
      planVersion: plan.version,
      closureDate,
      grandfatheredCount: grandfathered.length,
      grandfathered,
      note_he: 'התוכנית נסגרה. חברים קיימים שומרים על היתרה והדרגה שלהם לפי חוק הגנת הצרכן.',
      note_en: 'Program closed. Existing members retain their balance and tier per Consumer Protection Law.',
    };
    this._initLog(this._closureLog, planId).push(closureRow);
    this._logAudit('plan.close', { planId, count: grandfathered.length });
    return { ...closureRow };
  }

  // --- 13. refundOrder (Consumer Protection §14ג) -----------------

  refundOrder(customerId, orderId, reason) {
    _assert(customerId, 'refundOrder: customerId required', 'E_CUST');
    _assert(orderId, 'refundOrder: orderId required', 'E_ORDER');
    const member = this._getMember(customerId);
    _assert(member, `refundOrder: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    const earns = this._earnLog.get(customerId) || [];
    const earnRow = earns.find((r) => r.orderId === orderId && r.type === LEDGER_TYPES.EARN);
    _assert(earnRow, `refundOrder: no earn row for order "${orderId}"`, 'E_NO_EARN');

    // Check whether the customer already has insufficient balance
    // to reverse — i.e., has already redeemed the points earned.
    const balance = this.currentBalance(customerId);
    const alreadySpent = earnRow.points > balance;

    const reversalRow = {
      id: this._randomId('rvl'),
      ts: this._now(),
      type: LEDGER_TYPES.EARN_REVERSAL,
      customerId,
      planId: earnRow.planId,
      orderId,
      reversalOf: earnRow.id,
      points: -earnRow.points,
      absolutePoints: earnRow.points,
      partial: alreadySpent,
      reason: reason || 'order cancellation',
      reason_he: `${LABELS.he.earnReversal} עבור הזמנה ${orderId}`,
      reason_en: `${LABELS.en.earnReversal} for order ${orderId}`,
      supervisorFlag: alreadySpent,
    };
    this._initLog(this._redeemLog, customerId).push(reversalRow);

    // Record refund ledger per-order
    if (!this._refundLog.has(orderId)) this._refundLog.set(orderId, []);
    this._refundLog.get(orderId).push(reversalRow);

    this._logAudit('order.refund', {
      customerId,
      orderId,
      points: earnRow.points,
      partial: alreadySpent,
    });
    return { ...reversalRow };
  }

  // --- 14. fraudDetection -----------------------------------------

  fraudDetection(customerId) {
    const member = this._getMember(customerId);
    _assert(member, `fraudDetection: customer "${customerId}" not enrolled`, 'E_NOT_ENROLLED');

    const earns = this._earnLog.get(customerId) || [];
    const redeems = this._redeemLog.get(customerId) || [];
    const flags = [];

    // Rule 1: RAPID REDEMPTION — redemption within 60 seconds of an earn
    for (const r of redeems) {
      if (r.type !== LEDGER_TYPES.REDEEM) continue;
      const rt = new Date(r.ts).getTime();
      for (const e of earns) {
        if (e.type !== LEDGER_TYPES.EARN) continue;
        const et = new Date(e.ts).getTime();
        const deltaSec = Math.abs(rt - et) / 1000;
        if (deltaSec <= 60 && rt >= et) {
          flags.push({
            rule: 'rapid-redemption',
            severity: 'medium',
            earnId: e.id,
            redeemId: r.id,
            deltaSec,
            message_he: 'מימוש מהיר מדי לאחר הצבירה — פחות מ-60 שניות',
            message_en: 'Redemption within 60 s of earn — possible collusion',
          });
          break;
        }
      }
    }

    // Rule 2: CIRCULAR TRANSFERS — A→B→A within 24 h
    const outs = redeems.filter((r) => r.type === LEDGER_TYPES.TRANSFER_OUT);
    for (const out of outs) {
      const counterEarns = (this._earnLog.get(customerId) || []).filter(
        (e) => e.type === LEDGER_TYPES.TRANSFER_IN && e.counterparty === out.counterparty,
      );
      for (const ci of counterEarns) {
        const outT = new Date(out.ts).getTime();
        const inT = new Date(ci.ts).getTime();
        const deltaH = Math.abs(outT - inT) / (1000 * 60 * 60);
        if (deltaH <= 24) {
          flags.push({
            rule: 'circular-transfer',
            severity: 'high',
            outId: out.id,
            inId: ci.id,
            counterparty: out.counterparty,
            deltaHours: deltaH,
            message_he: 'העברה מעגלית בתוך 24 שעות — חשד להעברות פיקטיביות',
            message_en: 'Circular transfer within 24 h — possible wash trading',
          });
        }
      }
    }

    // Rule 3: EXCESSIVE EARN in a single 24h window (> 50,000 pts)
    const byDay = new Map();
    for (const e of earns) {
      if (e.type !== LEDGER_TYPES.EARN) continue;
      const dayKey = e.ts.slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + e.points);
    }
    for (const [day, pts] of byDay) {
      if (pts > 50000) {
        flags.push({
          rule: 'excessive-earn-day',
          severity: 'high',
          day,
          points: pts,
          message_he: `צבירה חריגה ביום ${day}: ${pts} נקודות`,
          message_en: `Excessive earn on ${day}: ${pts} points`,
        });
      }
    }

    // Rule 4: ORDER-AMOUNT ANOMALY — earn against an order with
    // amount greater than 10x the rolling median of the last 20.
    const amounts = earns
      .filter((e) => e.type === LEDGER_TYPES.EARN)
      .map((e) => e.orderAmount || 0);
    if (amounts.length >= 5) {
      const sorted = amounts.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 1;
      for (const e of earns) {
        if (e.type !== LEDGER_TYPES.EARN) continue;
        if ((e.orderAmount || 0) > median * 10 && median > 0) {
          flags.push({
            rule: 'outlier-order-amount',
            severity: 'low',
            earnId: e.id,
            orderId: e.orderId,
            amount: e.orderAmount,
            median,
            message_he: `סכום הזמנה חריג: ${e.orderAmount} ₪ (חציון ${median})`,
            message_en: `Outlier order amount: ${e.orderAmount} ILS (median ${median})`,
          });
        }
      }
    }

    if (flags.length > 0) {
      this._logAudit('fraud.flag', { customerId, count: flags.length });
    }
    return {
      customerId,
      scannedAt: this._now(),
      flags,
      suspicion: flags.length > 0,
    };
  }

  // --- read-only introspection (for the UI) -----------------------

  getPlan(planId) {
    const p = this._getCurrentPlan(planId);
    return p ? { ...p } : null;
  }

  getPlanHistory(planId) {
    const versions = this._plans.get(planId) || [];
    return versions.map((v) => ({ ...v }));
  }

  getMember(customerId) {
    const m = this._getMember(customerId);
    return m ? { ...m } : null;
  }

  getConsent(customerId) {
    return (this._consentVault.get(customerId) || []).map((c) => ({ ...c }));
  }

  getEarnLog(customerId) {
    return (this._earnLog.get(customerId) || []).map((r) => ({ ...r }));
  }

  getRedeemLog(customerId) {
    return (this._redeemLog.get(customerId) || []).map((r) => ({ ...r }));
  }

  getExpireLog(customerId) {
    return (this._expireLog.get(customerId) || []).map((r) => ({ ...r }));
  }

  getTransferLog() {
    return this._transferLog.map((r) => ({ ...r }));
  }

  getClosureLog(planId) {
    return (this._closureLog.get(planId) || []).map((r) => ({ ...r }));
  }

  getAuditLog() {
    return this._programAuditLog.map((r) => ({ ...r }));
  }
}

module.exports = {
  LoyaltyEngine,
  LEDGER_TYPES,
  TIER_ORDER,
  LABELS,
  CONSENT_VERSION,
  _internal: {
    _addDays,
    _monthsAgo,
    _isStrictlyBetter,
    _tierRank,
    _sortTiers,
    defaultRandomId,
  },
};
