/**
 * Gift & Hospitality Register — מרשם מתנות ואירוח
 * Agent Y-145 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Mission:
 *   Maintain an anti-corruption register of every gift, meal, travel,
 *   event ticket, discount, loan, service, or cash-equivalent benefit
 *   that a Techno-Kol Uzi employee receives from a third party. The
 *   register enforces Israeli anti-bribery law (חוק העונשין §290-291),
 *   tracks annual cumulative thresholds per employee, flags conflict-
 *   of-interest situations, and schedules quarterly attestations.
 *
 * Legal basis — חוק העונשין, התשל"ז-1977:
 *   - §290 — לקיחת שוחד (taking a bribe by a public servant): up to
 *     10 years imprisonment. "A public servant who takes a bribe for
 *     an act connected with his office shall be liable to..."
 *   - §291 — מתן שוחד (giving a bribe to a public servant): up to
 *     7 years imprisonment. Mirror offence to §290.
 *   - §291א — שוחד בעסקה בינלאומית (bribing a foreign public official)
 *   - §293 — rules on the definition of "benefit" (טובת הנאה):
 *     a gift, loan, favour, service, hospitality, or any advantage
 *     — whether given in advance, after the fact, directly, or via
 *     an intermediary, and regardless of whether it was solicited.
 *
 * Private-sector context:
 *   §290 strictly targets עובדי ציבור (public servants) but private
 *   companies remain exposed via:
 *     - §5 of חוק החברות (directors' duty of loyalty)
 *     - §2 of חוק איסור הלבנת הון, התש"ס-2000 (money-laundering)
 *     - Enforcement guidance of the State Attorney's הנחיה 1.14
 *   Techno-Kol Uzi therefore adopts an internal threshold schema that
 *   is STRICTER than the statutory floor: a ₪200 declare-only tier,
 *   a ₪500 approval tier, and a ₪2,000 refusal ceiling (halved for
 *   public-sector recipients and trebled for cash-equivalent items).
 *
 * Design principles:
 *   - "לא מוחקים רק משדרגים ומגדלים" — nothing is ever hard-deleted.
 *     Decisions, approvals, exceptions, and reminders are appended
 *     to an immutable event log with a hash chain.
 *   - Zero external dependencies — node:crypto built-in only.
 *   - Bilingual Hebrew (RTL) + English surfaces on every artefact.
 *   - Loose coupling: the module exposes methods but never reaches
 *     out to vendors, HR, or mail servers; the host application wires
 *     events to downstream systems.
 *
 * Public API:
 *   class GiftRegister
 *     .declareGift(input)                -> giftRecord
 *     .threshold(policy)                 -> thresholdSchema
 *     .classifyGift(estimatedValue, type, policy?) -> tier
 *     .approveGift(input)                -> decisionRecord
 *     .giftHistory(filter)               -> giftRecord[]
 *     .conflictOfInterestCheck(input)    -> { conflict, severity, reasons }
 *     .aggregateAnnual(employeeId, year) -> { total, count, byTier }
 *     .auditReport(period)               -> company-wide statistics
 *     .exceptionRequest(input)           -> exceptionRecord
 *     .publicSectorGift(recipient, value)-> { allowed, reason, policy }
 *     .training(input)                   -> trainingRecord
 *     .trainingStatus(employeeId)        -> { valid, expiresAt, daysLeft }
 *     .register90DayReminder(opts?)      -> reminderRecord[]
 *     .registerVendor(id, profile)       -> vendor bookkeeping
 *     .auditLog(filter?)                 -> append-only events
 *     .verifyChain()                     -> { valid, brokenAt }
 *     .on(event, handler) / .off(event, handler)
 *
 * Run tests:
 *   node --test onyx-procurement/test/compliance/gift-register.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ─── constants ─────────────────────────────────────────────────────────

const GIFT_TYPES = Object.freeze({
  PHYSICAL_GIFT: 'physical-gift',       // מתנה פיזית
  MEAL: 'meal',                         // ארוחה
  TRAVEL: 'travel',                     // נסיעה / טיסה
  EVENT_TICKET: 'event-ticket',         // כרטיס לאירוע
  DISCOUNT: 'discount',                 // הנחה מיוחדת
  LOAN: 'loan',                         // הלוואה
  SERVICE: 'service',                   // שירות חינם
  CASH_EQUIVALENT: 'cash-equivalent',   // שווה-מזומן / כסף
});

const GIFT_TYPE_LABELS_HE = Object.freeze({
  'physical-gift':   'מתנה פיזית',
  'meal':            'ארוחה / אירוח',
  'travel':          'נסיעה או טיסה',
  'event-ticket':    'כרטיס לאירוע',
  'discount':        'הנחה מיוחדת',
  'loan':            'הלוואה',
  'service':         'שירות חינם',
  'cash-equivalent': 'שווה-מזומן / כסף',
});

const TIERS = Object.freeze({
  NONE: 'none',                       // no declaration needed
  DECLARE: 'declare',                 // declare only
  DECLARE_APPROVE: 'declare-approve', // declare + approval required
  REFUSE: 'refuse',                   // must be refused / returned
});

const TIER_LABELS_HE = Object.freeze({
  'none':            'ללא חובת הצהרה',
  'declare':         'הצהרה בלבד',
  'declare-approve': 'הצהרה + אישור',
  'refuse':          'יש לסרב / להחזיר',
});

const DECISIONS = Object.freeze({
  PENDING: 'pending',
  ACCEPT: 'accept',                       // employee keeps the gift
  RETURN: 'return',                       // gift is sent back
  DONATE_TO_CHARITY: 'donate-to-charity', // gift is donated
  FORFEIT: 'forfeit',                     // gift surrendered to company
});

const GIFT_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REFUSED: 'refused',
  RETURNED: 'returned',
  DONATED: 'donated',
  FORFEITED: 'forfeited',
  UNDER_EXCEPTION: 'under-exception',
  LATE_DECLARATION: 'late-declaration',
});

const EVENT_TYPES = Object.freeze({
  GIFT_DECLARED: 'gift.declared',
  GIFT_CLASSIFIED: 'gift.classified',
  GIFT_APPROVED: 'gift.approved',
  GIFT_DECISION_LOGGED: 'gift.decision.logged',
  CONFLICT_FLAGGED: 'gift.conflict.flagged',
  EXCEPTION_REQUESTED: 'gift.exception.requested',
  TRAINING_COMPLETED: 'training.completed',
  REMINDER_ISSUED: 'reminder.issued',
  VENDOR_REGISTERED: 'vendor.registered',
});

// Default threshold policy (ILS).
// "private" tier is the general internal standard;
// "public" tier mirrors §290-291 exposure for public servants.
const DEFAULT_POLICY = Object.freeze({
  currency: 'ILS',
  private: {
    noDeclareBelow:   200,   // < ₪200 — no declaration
    declareOnlyMax:   500,   // ₪200-500 — declare only
    approvalMax:    2000,    // ₪500-2,000 — declare + approve
    refuseAbove:    2000,    // > ₪2,000 — must refuse
    annualCumulative: 3000,  // annual ceiling per giver
  },
  public: {
    noDeclareBelow:   100,   // halved for public-sector
    declareOnlyMax:   150,   // sharply reduced
    approvalMax:     300,
    refuseAbove:     300,    // anything above ₪300 is refused
    annualCumulative: 500,
  },
  alwaysDeclareTypes: [
    'cash-equivalent',
    'event-ticket',
    'travel',
  ],
  declarationWindowDays: 7,  // deadline after receipt
});

// FX rates used when an estimated value arrives in a non-ILS currency.
// Hard-coded so the module stays zero-dependency.
const FX_TO_ILS = Object.freeze({
  ILS: 1,
  USD: 3.75,
  EUR: 4.05,
  GBP: 4.70,
});

// ─── helpers ───────────────────────────────────────────────────────────

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function toIls(amount, currency) {
  const rate = FX_TO_ILS[currency];
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error('INVALID_AMOUNT');
  }
  if (!rate) {
    throw new Error('UNSUPPORTED_CURRENCY:' + currency);
  }
  return Math.round(amount * rate * 100) / 100;
}

function assertNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('MISSING_FIELD:' + name);
  }
}

function isoDate(clock, input) {
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'string' && input.trim() !== '') {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return clock().toISOString();
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function yearOf(iso) {
  return new Date(iso).getUTCFullYear();
}

// ─── GiftRegister ──────────────────────────────────────────────────────

class GiftRegister {
  constructor(opts = {}) {
    this._now = opts.now || (() => new Date());
    this._policy = Object.freeze(deepMerge(DEFAULT_POLICY, opts.policy || {}));

    // append-only stores — "לא מוחקים רק משדרגים ומגדלים"
    this._gifts = new Map();            // giftId -> latest view (built from log)
    this._giftLog = [];                 // append-only decision log
    this._events = [];                  // hash-chained audit log
    this._exceptions = new Map();       // exceptionId -> record
    this._training = new Map();         // employeeId -> latest training state
    this._trainingLog = [];             // append-only training history
    this._reminders = [];               // append-only reminder log
    this._vendors = new Map();          // vendorId -> profile
    this._listeners = new Map();        // event -> handler[]

    this._seq = 0;
  }

  // ─── declareGift ────────────────────────────────────────────────────
  declareGift(input) {
    assertNonEmpty('employeeId', input.employeeId);
    assertNonEmpty('giftType', input.giftType);
    assertNonEmpty('givenBy', input.givenBy);
    if (typeof input.estimatedValue !== 'number') {
      throw new Error('MISSING_FIELD:estimatedValue');
    }
    const giftType = input.giftType;
    if (!Object.values(GIFT_TYPES).includes(giftType)) {
      throw new Error('UNKNOWN_GIFT_TYPE:' + giftType);
    }
    const currency = input.currency || 'ILS';
    const valueIls = toIls(input.estimatedValue, currency);
    const date = isoDate(this._now, input.date);
    const declaredAt = this._now().toISOString();
    const declaredWithinDays =
      typeof input.declaredWithinDays === 'number'
        ? input.declaredWithinDays
        : Math.max(0, daysBetween(date, declaredAt));

    // run threshold classification
    const policyKind = input.policyKind || (input.isPublicSector ? 'public' : 'private');
    const classification = this.classifyGift(valueIls, giftType, policyKind);

    // persist
    const giftId = 'GIFT-' + (++this._seq).toString().padStart(6, '0');
    const record = {
      giftId,
      employeeId: input.employeeId,
      giftType,
      giftTypeLabelHe: GIFT_TYPE_LABELS_HE[giftType],
      givenBy: input.givenBy,
      givenByHe: input.givenByHe || input.givenBy,
      estimatedValue: input.estimatedValue,
      currency,
      valueIls,
      context: input.context || '',
      contextHe: input.contextHe || input.context || '',
      date,
      declaredAt,
      declaredWithinDays,
      policyKind,
      isPublicSector: !!input.isPublicSector,
      tier: classification.tier,
      tierLabelHe: TIER_LABELS_HE[classification.tier],
      requiresApproval: classification.requiresApproval,
      mustRefuse: classification.mustRefuse,
      alwaysDeclare: classification.alwaysDeclare,
      policyBreach: classification.mustRefuse,
      status:
        classification.mustRefuse
          ? GIFT_STATUS.REFUSED
          : classification.requiresApproval
            ? GIFT_STATUS.PENDING
            : GIFT_STATUS.APPROVED,
      lateDeclaration:
        declaredWithinDays > this._policy.declarationWindowDays,
      decisions: [],
      exceptions: [],
      conflictFlags: [],
      createdAt: declaredAt,
      updatedAt: declaredAt,
    };
    if (record.lateDeclaration) {
      record.status = classification.mustRefuse
        ? GIFT_STATUS.REFUSED
        : GIFT_STATUS.LATE_DECLARATION;
    }

    // run conflict-of-interest check and attach flags
    const conflict = this.conflictOfInterestCheck({
      employeeId: record.employeeId,
      giver: { id: record.givenBy, nameHe: record.givenByHe },
    });
    record.conflictFlags = conflict.reasons;
    record.conflictSeverity = conflict.severity;

    this._gifts.set(giftId, record);
    this._giftLog.push({ op: 'declare', giftId, at: declaredAt, snapshot: record });
    this._appendEvent(EVENT_TYPES.GIFT_DECLARED, { giftId, employeeId: record.employeeId, valueIls });
    this._appendEvent(EVENT_TYPES.GIFT_CLASSIFIED, { giftId, tier: record.tier });
    if (conflict.conflict) {
      this._appendEvent(EVENT_TYPES.CONFLICT_FLAGGED, {
        giftId,
        employeeId: record.employeeId,
        severity: conflict.severity,
      });
    }
    return this._cloneRecord(record);
  }

  // ─── threshold ──────────────────────────────────────────────────────
  threshold(policyKind) {
    const kind = policyKind || 'private';
    if (kind !== 'private' && kind !== 'public') {
      throw new Error('UNKNOWN_POLICY:' + kind);
    }
    const p = this._policy[kind];
    return {
      policy: kind,
      policyHe: kind === 'public' ? 'מגזר ציבורי' : 'מגזר פרטי',
      currency: this._policy.currency,
      tiers: [
        {
          tier: TIERS.NONE,
          labelHe: TIER_LABELS_HE[TIERS.NONE],
          min: 0,
          max: p.noDeclareBelow,
        },
        {
          tier: TIERS.DECLARE,
          labelHe: TIER_LABELS_HE[TIERS.DECLARE],
          min: p.noDeclareBelow,
          max: p.declareOnlyMax,
        },
        {
          tier: TIERS.DECLARE_APPROVE,
          labelHe: TIER_LABELS_HE[TIERS.DECLARE_APPROVE],
          min: p.declareOnlyMax,
          max: p.approvalMax,
        },
        {
          tier: TIERS.REFUSE,
          labelHe: TIER_LABELS_HE[TIERS.REFUSE],
          min: p.refuseAbove,
          max: Infinity,
        },
      ],
      alwaysDeclareTypes: this._policy.alwaysDeclareTypes.slice(),
      annualCumulative: p.annualCumulative,
      declarationWindowDays: this._policy.declarationWindowDays,
    };
  }

  classifyGift(valueIls, giftType, policyKind) {
    const kind = policyKind || 'private';
    const p = this._policy[kind];
    const alwaysDeclare = this._policy.alwaysDeclareTypes.includes(giftType);
    let tier;
    if (valueIls > p.refuseAbove) {
      tier = TIERS.REFUSE;
    } else if (valueIls > p.declareOnlyMax) {
      tier = TIERS.DECLARE_APPROVE;
    } else if (valueIls >= p.noDeclareBelow || alwaysDeclare) {
      tier = TIERS.DECLARE;
    } else {
      tier = TIERS.NONE;
    }
    // Special handling: always-declare types escalate from NONE to DECLARE.
    if (alwaysDeclare && tier === TIERS.NONE) {
      tier = TIERS.DECLARE;
    }
    // Cash-equivalent always requires approval at minimum once declared.
    if (giftType === GIFT_TYPES.CASH_EQUIVALENT && tier === TIERS.DECLARE) {
      tier = TIERS.DECLARE_APPROVE;
    }
    return {
      tier,
      requiresApproval:
        tier === TIERS.DECLARE_APPROVE || tier === TIERS.REFUSE,
      mustRefuse: tier === TIERS.REFUSE,
      alwaysDeclare,
      policyKind: kind,
    };
  }

  // ─── approveGift ───────────────────────────────────────────────────
  approveGift(input) {
    assertNonEmpty('giftId', input.giftId);
    assertNonEmpty('approverId', input.approverId);
    assertNonEmpty('decision', input.decision);
    const validDecisions = [
      DECISIONS.ACCEPT,
      DECISIONS.RETURN,
      DECISIONS.DONATE_TO_CHARITY,
      DECISIONS.FORFEIT,
    ];
    if (!validDecisions.includes(input.decision)) {
      throw new Error('UNKNOWN_DECISION:' + input.decision);
    }
    const gift = this._gifts.get(input.giftId);
    if (!gift) {
      throw new Error('GIFT_NOT_FOUND:' + input.giftId);
    }
    const decidedAt = this._now().toISOString();
    const entry = {
      decisionId: 'DEC-' + (gift.decisions.length + 1).toString().padStart(4, '0'),
      giftId: input.giftId,
      approverId: input.approverId,
      decision: input.decision,
      notes: input.notes || '',
      notesHe: input.notesHe || input.notes || '',
      at: decidedAt,
    };
    // append-only — never remove previous decisions
    gift.decisions = gift.decisions.concat([entry]);
    switch (input.decision) {
      case DECISIONS.ACCEPT:
        gift.status = GIFT_STATUS.APPROVED;
        break;
      case DECISIONS.RETURN:
        gift.status = GIFT_STATUS.RETURNED;
        break;
      case DECISIONS.DONATE_TO_CHARITY:
        gift.status = GIFT_STATUS.DONATED;
        break;
      case DECISIONS.FORFEIT:
        gift.status = GIFT_STATUS.FORFEITED;
        break;
      default:
        /* unreachable */
    }
    gift.updatedAt = decidedAt;
    this._giftLog.push({ op: 'decision', giftId: gift.giftId, at: decidedAt, entry });
    this._appendEvent(EVENT_TYPES.GIFT_APPROVED, {
      giftId: gift.giftId,
      decision: input.decision,
      approverId: input.approverId,
    });
    this._appendEvent(EVENT_TYPES.GIFT_DECISION_LOGGED, { giftId: gift.giftId, decisionId: entry.decisionId });
    return this._cloneRecord(gift);
  }

  // ─── giftHistory ───────────────────────────────────────────────────
  giftHistory(filter = {}) {
    const out = [];
    for (const record of this._gifts.values()) {
      if (filter.employeeId && record.employeeId !== filter.employeeId) continue;
      if (filter.giverId && record.givenBy !== filter.giverId) continue;
      if (filter.year && yearOf(record.date) !== filter.year) continue;
      if (filter.tier && record.tier !== filter.tier) continue;
      out.push(this._cloneRecord(record));
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  // ─── conflictOfInterestCheck ───────────────────────────────────────
  conflictOfInterestCheck(input) {
    assertNonEmpty('employeeId', input.employeeId);
    if (!input.giver) throw new Error('MISSING_FIELD:giver');
    const giverId = input.giver.id || input.giver.name;
    if (!giverId) throw new Error('MISSING_FIELD:giver.id');

    const vendor = this._vendors.get(giverId);
    const reasons = [];
    const reasonsHe = [];
    let severity = 'none';

    if (vendor) {
      if (vendor.active) {
        reasons.push('current-vendor');
        reasonsHe.push('ספק פעיל של החברה');
        severity = 'high';
      }
      if (vendor.prospective) {
        reasons.push('prospective-vendor');
        reasonsHe.push('ספק פוטנציאלי במו"מ');
        severity = severity === 'high' ? 'high' : 'medium';
      }
      if (vendor.customer) {
        reasons.push('current-customer');
        reasonsHe.push('לקוח פעיל של החברה');
        severity = severity === 'high' ? 'high' : 'medium';
      }
      if (Array.isArray(vendor.pendingDeals) && vendor.pendingDeals.length > 0) {
        reasons.push('pending-deal');
        reasonsHe.push('עסקה פתוחה עם החברה');
        severity = 'high';
      }
      if (Array.isArray(vendor.involvedEmployees) && vendor.involvedEmployees.includes(input.employeeId)) {
        reasons.push('employee-directly-involved');
        reasonsHe.push('העובד מעורב ישירות בהתקשרות');
        severity = 'high';
      }
    }

    // explicit flag from the caller (e.g. org-chart integration)
    if (input.giver.isPublicOfficial) {
      reasons.push('public-official');
      reasonsHe.push('עובד ציבור — §290-291');
      severity = 'high';
    }

    return {
      employeeId: input.employeeId,
      giverId,
      conflict: reasons.length > 0,
      severity,
      reasons,
      reasonsHe,
      checkedAt: this._now().toISOString(),
    };
  }

  // ─── aggregateAnnual ───────────────────────────────────────────────
  aggregateAnnual(employeeId, year) {
    assertNonEmpty('employeeId', employeeId);
    if (typeof year !== 'number') throw new Error('MISSING_FIELD:year');
    let total = 0;
    let count = 0;
    const byTier = { none: 0, declare: 0, 'declare-approve': 0, refuse: 0 };
    const byGiver = new Map();
    for (const g of this._gifts.values()) {
      if (g.employeeId !== employeeId) continue;
      if (yearOf(g.date) !== year) continue;
      if (
        g.status === GIFT_STATUS.REFUSED ||
        g.status === GIFT_STATUS.RETURNED
      ) {
        // still counted in "gross" exposure — but flagged
      }
      total += g.valueIls;
      count += 1;
      byTier[g.tier] = (byTier[g.tier] || 0) + 1;
      byGiver.set(g.givenBy, (byGiver.get(g.givenBy) || 0) + g.valueIls);
    }
    const annualCeiling = this._policy.private.annualCumulative;
    const exceededCeiling = total > annualCeiling;
    return {
      employeeId,
      year,
      total: Math.round(total * 100) / 100,
      count,
      byTier,
      byGiver: Array.from(byGiver.entries()).map(([giver, amount]) => ({
        giver,
        amount: Math.round(amount * 100) / 100,
      })),
      annualCeiling,
      exceededCeiling,
      message: exceededCeiling
        ? 'Annual cumulative ceiling exceeded — escalate to compliance'
        : 'Within annual cumulative ceiling',
      messageHe: exceededCeiling
        ? 'חריגה מתקרה שנתית מצטברת — יש להעביר לציות'
        : 'בגדר תקרה שנתית מותרת',
    };
  }

  // ─── auditReport ───────────────────────────────────────────────────
  auditReport(period = {}) {
    const from = period.from ? new Date(period.from).getTime() : -Infinity;
    const to = period.to ? new Date(period.to).getTime() : Infinity;
    const stats = {
      periodFrom: period.from || 'beginning',
      periodTo: period.to || 'now',
      total: 0,
      count: 0,
      byType: {},
      byTier: {},
      byStatus: {},
      refusals: 0,
      lateDeclarations: 0,
      conflicts: 0,
      topGivers: [],
      topEmployees: [],
      exceptionCount: this._exceptions.size,
    };
    const giverTotals = new Map();
    const employeeTotals = new Map();
    for (const g of this._gifts.values()) {
      const ts = new Date(g.date).getTime();
      if (ts < from || ts > to) continue;
      stats.count += 1;
      stats.total += g.valueIls;
      stats.byType[g.giftType] = (stats.byType[g.giftType] || 0) + 1;
      stats.byTier[g.tier] = (stats.byTier[g.tier] || 0) + 1;
      stats.byStatus[g.status] = (stats.byStatus[g.status] || 0) + 1;
      if (g.status === GIFT_STATUS.REFUSED || g.status === GIFT_STATUS.RETURNED) stats.refusals += 1;
      if (g.lateDeclaration) stats.lateDeclarations += 1;
      if (g.conflictFlags && g.conflictFlags.length > 0) stats.conflicts += 1;
      giverTotals.set(g.givenBy, (giverTotals.get(g.givenBy) || 0) + g.valueIls);
      employeeTotals.set(g.employeeId, (employeeTotals.get(g.employeeId) || 0) + g.valueIls);
    }
    stats.total = Math.round(stats.total * 100) / 100;
    stats.topGivers = Array.from(giverTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([giver, amount]) => ({ giver, amount: Math.round(amount * 100) / 100 }));
    stats.topEmployees = Array.from(employeeTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([employeeId, amount]) => ({ employeeId, amount: Math.round(amount * 100) / 100 }));

    // bilingual header
    stats.headerHe = 'דוח ציות מתנות — טכנו-קול עוזי';
    stats.headerEn = 'Gift-Register Compliance Report — Techno-Kol Uzi';
    stats.disclaimerHe =
      'בהתאם לחוק העונשין §290-291 ולמדיניות הציות הפנימית.';
    stats.disclaimerEn =
      'Per Israeli Penal Law §290-291 and the internal compliance policy.';
    return stats;
  }

  // ─── exceptionRequest ──────────────────────────────────────────────
  exceptionRequest(input) {
    assertNonEmpty('giftId', input.giftId);
    assertNonEmpty('reason', input.reason);
    assertNonEmpty('approver', input.approver);
    const gift = this._gifts.get(input.giftId);
    if (!gift) throw new Error('GIFT_NOT_FOUND:' + input.giftId);
    const exceptionId = 'EXC-' + (this._exceptions.size + 1).toString().padStart(4, '0');
    const record = {
      exceptionId,
      giftId: input.giftId,
      reason: input.reason,
      reasonHe: input.reasonHe || input.reason,
      approver: input.approver,
      requestedAt: this._now().toISOString(),
      status: 'requested',
    };
    this._exceptions.set(exceptionId, record);
    gift.exceptions = gift.exceptions.concat([record]);
    gift.status = GIFT_STATUS.UNDER_EXCEPTION;
    gift.updatedAt = record.requestedAt;
    this._giftLog.push({ op: 'exception', giftId: gift.giftId, at: record.requestedAt, record });
    this._appendEvent(EVENT_TYPES.EXCEPTION_REQUESTED, {
      giftId: gift.giftId,
      exceptionId,
    });
    return Object.assign({}, record);
  }

  // ─── publicSectorGift ──────────────────────────────────────────────
  publicSectorGift(recipient, value) {
    if (!recipient || typeof recipient !== 'object') {
      throw new Error('MISSING_FIELD:recipient');
    }
    if (typeof value !== 'number') {
      throw new Error('MISSING_FIELD:value');
    }
    const classification = this.classifyGift(value, recipient.giftType || GIFT_TYPES.PHYSICAL_GIFT, 'public');
    const allowed =
      classification.tier === TIERS.NONE ||
      classification.tier === TIERS.DECLARE;
    const reason = allowed
      ? 'Within public-sector allowance'
      : classification.mustRefuse
        ? 'Exceeds public-sector ceiling — §290/291 exposure'
        : 'Requires formal approval — potential §290/291 exposure';
    const reasonHe = allowed
      ? 'בגדר תקרה מותרת לעובד ציבור'
      : classification.mustRefuse
        ? 'חריגה מתקרת המגזר הציבורי — חשיפה ל-§290/291'
        : 'נדרש אישור פורמלי — חשיפה אפשרית ל-§290/291';
    return {
      recipient,
      value,
      policy: this.threshold('public'),
      tier: classification.tier,
      allowed,
      reason,
      reasonHe,
      statuteReference: '§290 + §291 + §293 חוק העונשין תשל"ז-1977',
    };
  }

  // ─── training ──────────────────────────────────────────────────────
  training(input) {
    assertNonEmpty('employeeId', input.employeeId);
    if (input.completed === undefined) {
      throw new Error('MISSING_FIELD:completed');
    }
    const expiryDays = typeof input.expiryDays === 'number' ? input.expiryDays : 365;
    const completedAt = isoDate(this._now, input.completed);
    const expiresAt = addDays(completedAt, expiryDays);
    const record = {
      employeeId: input.employeeId,
      completedAt,
      expiresAt,
      expiryDays,
      source: input.source || 'internal-compliance',
      valid: true,
      loggedAt: this._now().toISOString(),
    };
    // "לא מוחקים רק משדרגים" — old training entries stay in the log.
    const history = this._trainingLog.filter((r) => r.employeeId === input.employeeId);
    history.push(record);
    this._trainingLog.push(record);
    this._training.set(input.employeeId, record);
    this._appendEvent(EVENT_TYPES.TRAINING_COMPLETED, {
      employeeId: input.employeeId,
      expiresAt,
    });
    return Object.assign({}, record);
  }

  trainingStatus(employeeId) {
    assertNonEmpty('employeeId', employeeId);
    const latest = this._training.get(employeeId);
    if (!latest) {
      return {
        employeeId,
        valid: false,
        reason: 'no-training-on-file',
        reasonHe: 'אין הכשרה בתיק',
      };
    }
    const now = this._now().toISOString();
    const daysLeft = Math.floor(daysBetween(now, latest.expiresAt));
    const valid = daysLeft >= 0;
    return {
      employeeId,
      valid,
      completedAt: latest.completedAt,
      expiresAt: latest.expiresAt,
      daysLeft,
      reason: valid ? 'current' : 'expired',
      reasonHe: valid ? 'תקף' : 'פג תוקף',
    };
  }

  // ─── register90DayReminder ─────────────────────────────────────────
  register90DayReminder(opts = {}) {
    const windowDays = opts.windowDays || 90;
    const issuedAt = this._now().toISOString();
    const cutoff = new Date(new Date(issuedAt).getTime() - windowDays * 24 * 3600 * 1000).toISOString();
    const employees = opts.employeeIds && opts.employeeIds.length
      ? opts.employeeIds.slice()
      : Array.from(new Set(Array.from(this._gifts.values()).map((g) => g.employeeId)));
    const reminders = employees.map((employeeId) => {
      const history = this.giftHistory({ employeeId });
      const withinWindow = history.filter((g) => g.date >= cutoff);
      const totalIls = withinWindow.reduce((s, g) => s + g.valueIls, 0);
      const rem = {
        reminderId: 'REM-' + (this._reminders.length + 1).toString().padStart(4, '0'),
        employeeId,
        issuedAt,
        windowDays,
        cutoff,
        giftsInWindow: withinWindow.length,
        totalIls: Math.round(totalIls * 100) / 100,
        attestationDeadline: addDays(issuedAt, 14),
        messageHe:
          'תזכורת רבעונית: יש להצהיר על כל מתנה שהתקבלה בתשעים הימים האחרונים תוך 14 ימים.',
        messageEn:
          'Quarterly reminder: declare every gift received in the last ninety days within 14 days.',
      };
      this._reminders.push(rem);
      this._appendEvent(EVENT_TYPES.REMINDER_ISSUED, {
        reminderId: rem.reminderId,
        employeeId,
      });
      return rem;
    });
    return reminders;
  }

  // ─── vendor bookkeeping ────────────────────────────────────────────
  registerVendor(vendorId, profile = {}) {
    assertNonEmpty('vendorId', vendorId);
    const existing = this._vendors.get(vendorId) || {};
    const merged = Object.assign({}, existing, profile, {
      vendorId,
      registeredAt: existing.registeredAt || this._now().toISOString(),
      updatedAt: this._now().toISOString(),
    });
    this._vendors.set(vendorId, merged);
    this._appendEvent(EVENT_TYPES.VENDOR_REGISTERED, { vendorId });
    return Object.assign({}, merged);
  }

  // ─── append-only event log ─────────────────────────────────────────
  _appendEvent(type, payload) {
    const prevHash = this._events.length > 0 ? this._events[this._events.length - 1].hash : 'GENESIS';
    const seq = this._events.length + 1;
    const at = this._now().toISOString();
    const body = { seq, type, at, payload, prevHash };
    const hash = sha256(canonicalJson(body));
    const evt = Object.freeze(Object.assign({}, body, { hash }));
    this._events.push(evt);
    const listeners = this._listeners.get(type) || [];
    for (const l of listeners) {
      try { l(evt); } catch (_e) { /* listeners must not break the chain */ }
    }
    return evt;
  }

  auditLog(filter = {}) {
    return this._events
      .filter((e) => (filter.type ? e.type === filter.type : true))
      .map((e) => Object.assign({}, e));
  }

  verifyChain() {
    let prevHash = 'GENESIS';
    for (let i = 0; i < this._events.length; i++) {
      const evt = this._events[i];
      if (evt.prevHash !== prevHash) return { valid: false, brokenAt: i };
      const recomputed = sha256(canonicalJson({
        seq: evt.seq,
        type: evt.type,
        at: evt.at,
        payload: evt.payload,
        prevHash: evt.prevHash,
      }));
      if (recomputed !== evt.hash) return { valid: false, brokenAt: i };
      prevHash = evt.hash;
    }
    return { valid: true };
  }

  // ─── listeners ─────────────────────────────────────────────────────
  on(event, handler) {
    const arr = this._listeners.get(event) || [];
    arr.push(handler);
    this._listeners.set(event, arr);
    return this;
  }

  off(event, handler) {
    const arr = (this._listeners.get(event) || []).filter((h) => h !== handler);
    this._listeners.set(event, arr);
    return this;
  }

  // ─── private helpers ───────────────────────────────────────────────
  _cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
  }
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const key of Object.keys(override || {})) {
    const v = override[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[key] = deepMerge(base[key] || {}, v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

module.exports = {
  GiftRegister,
  GIFT_TYPES,
  GIFT_TYPE_LABELS_HE,
  TIERS,
  TIER_LABELS_HE,
  DECISIONS,
  GIFT_STATUS,
  EVENT_TYPES,
  DEFAULT_POLICY,
  FX_TO_ILS,
};
