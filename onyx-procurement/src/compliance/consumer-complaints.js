/**
 * ════════════════════════════════════════════════════════════════════════
 * ConsumerComplaints — Handler for חוק הגנת הצרכן תשמ"א-1981
 * ════════════════════════════════════════════════════════════════════════
 * Agent Y-142 — Techno-Kol Uzi Mega-ERP (Israeli metal fabrication
 *                                         + real-estate division)
 * Written 2026-04-11 — House rule: לא מוחקים רק משדרגים ומגדלים
 * Zero external dependencies — Node built-ins only (node:crypto).
 *
 * Legal basis / מקור חוקי:
 *   - חוק הגנת הצרכן, התשמ"א-1981
 *     (Consumer Protection Law, 5741-1981)
 *   - תקנות הגנת הצרכן (ביטול עסקה), התשע"א-2010
 *     (Consumer Protection Regulations — Cancellation of Transactions,
 *      5771-2010)
 *   - § 14ג — עסקת מכר מרחוק / online/distance selling
 *     (14-day cooling-off right; 14 יום זכות ביטול)
 *   - § 14ה — cooling-off for services
 *   - § 4א — חובת גילוי / duty of disclosure
 *   - § 7 — הטעייה / misleading advertising (prohibition)
 *   - § 17 — אחריות על טובין / warranty on goods
 *   - § 31 — אכיפה אזרחית / civil enforcement
 *   - § 22 — עיצום כספי / administrative fine
 *   - חוק האחריות למוצרים פגומים, התש"ם-1980
 *     (Defective Products Liability Law, 5740-1980)
 *
 * Regulator: הרשות להגנת הצרכן ולסחר הוגן
 *            (Israel Consumer Protection and Fair Trade Authority)
 *            Ministry of Economy — https://www.gov.il/he/departments/molsa
 *            Escalation: formal complaint to הרשות להגנת הצרכן.
 *
 * Nine complaint categories (§ מקורות חוקיים):
 *   ┌────────────────────────┬───────────────────────────────┬─────────────┐
 *   │ Category               │ Hebrew                        │ Statute     │
 *   ├────────────────────────┼───────────────────────────────┼─────────────┤
 *   │ misleading-ad          │ פרסום מטעה                    │ § 7         │
 *   │ defective-product      │ מוצר פגום                     │ § 17 + PLL  │
 *   │ warranty               │ הפרת אחריות                   │ § 17–18     │
 *   │ refund-denied          │ סירוב להחזר                   │ § 14ג       │
 *   │ price-discrepancy      │ אי-התאמת מחיר                 │ § 17ב       │
 *   │ quality                │ פגם באיכות                    │ § 4א        │
 *   │ delivery               │ בעיית אספקה                   │ § 14ד       │
 *   │ privacy                │ פרטיות                        │ § 31א       │
 *   │ accessibility          │ נגישות                        │ § 2א        │
 *   └────────────────────────┴───────────────────────────────┴─────────────┘
 *
 * Statutory deadlines (לוחות זמנים סטטוטוריים):
 *   - Acknowledgment (אישור קבלה):   14 days  (best practice)
 *   - Full resolution (פתרון מלא):   60 days  (best practice ceiling)
 *   - Cooling-off § 14ג (online):    14 days from receipt
 *   - Cooling-off — disability/65+:  4 months from receipt (§14ג1)
 *   - Refund on defect (פגם):        always refundable (no window)
 *   - Fine under § 22:               up to ₪45,000 per violation
 *
 * Status lifecycle (append-only, never delete):
 *   received → under-investigation → responded → resolved
 *                              ↘ escalated ↘ closed
 *
 * Public API — class ConsumerComplaints (frozen, only add new methods):
 *   - constructor({ clock, idSalt, slaAckHours, slaResolveHours })
 *   - receiveComplaint({ customerId, orderId, category, severity,
 *                        description, channel, receivedAt, amountIls,
 *                        purchaseChannel, purchaseDate, customerAge,
 *                        isDisabled })
 *   - classifyComplaint(complaint)
 *   - assignInvestigator({ complaintId, investigatorId, slaHours })
 *   - statutoryDeadline(complaint)
 *   - recordResponse({ complaintId, responseType, amount, notes, actor })
 *   - refundEligibility(complaint)
 *   - escalateToCommissioner(complaintId, opts?)
 *   - templateResponse(complaint, lang)
 *   - trackSLA(complaintId)
 *   - bulkClass(period)
 *   - consumerRights()
 *   - listComplaints(filter?)
 *   - getComplaint(id)
 *   - events()                         — append-only event log
 *
 * Never-delete invariant:
 *   - No method removes any complaint, response, or event.
 *   - Responses append to responses[] array.
 *   - Status transitions append to events[] log (hash-chained).
 *   - Escalations are recorded in escalations[] array.
 *
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ─── Constants ─────────────────────────────────────────────────────────

const COMPLAINT_CATEGORIES = Object.freeze([
  'misleading-ad',
  'defective-product',
  'warranty',
  'refund-denied',
  'price-discrepancy',
  'quality',
  'delivery',
  'privacy',
  'accessibility',
]);

const CATEGORY_LABELS_HE = Object.freeze({
  'misleading-ad': 'פרסום מטעה',
  'defective-product': 'מוצר פגום',
  'warranty': 'הפרת אחריות',
  'refund-denied': 'סירוב להחזר',
  'price-discrepancy': 'אי-התאמת מחיר',
  'quality': 'פגם באיכות',
  'delivery': 'בעיית אספקה',
  'privacy': 'פגיעה בפרטיות',
  'accessibility': 'ליקוי נגישות',
});

const CATEGORY_LABELS_EN = Object.freeze({
  'misleading-ad': 'Misleading advertisement',
  'defective-product': 'Defective product',
  'warranty': 'Warranty breach',
  'refund-denied': 'Refund refusal',
  'price-discrepancy': 'Price discrepancy',
  'quality': 'Quality defect',
  'delivery': 'Delivery problem',
  'privacy': 'Privacy breach',
  'accessibility': 'Accessibility failure',
});

const CATEGORY_STATUTE = Object.freeze({
  'misleading-ad': 'חוק הגנת הצרכן §7',
  'defective-product': 'חוק הגנת הצרכן §17 + חוק האחריות למוצרים פגומים',
  'warranty': 'חוק הגנת הצרכן §17-18',
  'refund-denied': 'חוק הגנת הצרכן §14ג',
  'price-discrepancy': 'חוק הגנת הצרכן §17ב',
  'quality': 'חוק הגנת הצרכן §4א',
  'delivery': 'חוק הגנת הצרכן §14ד',
  'privacy': 'חוק הגנת הצרכן §31א + חוק הגנת הפרטיות',
  'accessibility': 'חוק הגנת הצרכן §2א + חוק שוויון זכויות לאנשים עם מוגבלות',
});

const SEVERITY = Object.freeze({
  MINOR: 'minor',
  MAJOR: 'major',
  CRITICAL: 'critical',
});

const STATUS = Object.freeze({
  RECEIVED: 'received',
  UNDER_INVESTIGATION: 'under-investigation',
  RESPONDED: 'responded',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
});

const CHANNELS = Object.freeze({
  PHONE: 'phone',
  EMAIL: 'email',
  WEB: 'web',
  STORE: 'store',
  LETTER: 'letter',
  SOCIAL: 'social',
  GOV: 'gov',
});

const PURCHASE_CHANNELS = Object.freeze({
  ONLINE: 'online',
  PHONE: 'phone',
  IN_STORE: 'in-store',
  DOOR_TO_DOOR: 'door-to-door',
  CATALOG: 'catalog',
});

const RESPONSE_TYPES = Object.freeze({
  REFUND: 'refund',
  REPLACE: 'replace',
  REPAIR: 'repair',
  CREDIT: 'credit',
  REJECT: 'reject',
});

const RESPONSE_TYPE_SET = new Set(Object.values(RESPONSE_TYPES));

// Default SLA: 14 days acknowledgment, 60 days resolution (best practice)
const DEFAULT_ACK_HOURS = 14 * 24;        // 336 h
const DEFAULT_RESOLVE_HOURS = 60 * 24;    // 1440 h

// § 14ג — 14 day cooling-off period for online/distance purchases.
const COOLING_OFF_DAYS_DEFAULT = 14;
// § 14ג1 — 4 months for elderly (≥65) / disabled consumers
const COOLING_OFF_DAYS_PROTECTED = 120;

// § 22 — administrative fine ceiling per violation
const FINE_CEILING_ILS = 45_000;

// Auto-classification keywords (lowercase, Hebrew + English)
const CRITICAL_KEYWORDS = Object.freeze([
  'fire', 'burn', 'injur', 'hospital', 'shock', 'poison', 'death', 'fatal',
  'שריפה', 'כוויה', 'פציעה', 'אשפוז', 'מכת חשמל', 'הרעלה', 'מוות', 'קטלני',
  'סכנה', 'מסוכן', 'חשמל', 'פיצוץ',
]);

const MAJOR_KEYWORDS = Object.freeze([
  'refund', 'replace', 'broken', 'not working', 'defect', 'leak',
  'החזר', 'החלפה', 'שבור', 'לא עובד', 'פגום', 'נזילה', 'תקלה', 'אי התאמה',
]);

// Amount thresholds (₪) for severity auto-bumping
const CRITICAL_AMOUNT_ILS = 20_000;
const MAJOR_AMOUNT_ILS = 2_000;

const GENESIS_HASH = '0'.repeat(64);

// ─── Small utilities ───────────────────────────────────────────────────

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') +
    '}'
  );
}

function hashPII(value, salt) {
  if (value === undefined || value === null || value === '') return null;
  return sha256Hex(String(salt || '') + '::' + String(value)).slice(0, 32);
}

function normText(s) {
  return String(s || '').toLowerCase();
}

function containsAny(text, needles) {
  const hay = normText(text);
  for (const n of needles) {
    if (n && hay.includes(normText(n))) return true;
  }
  return false;
}

function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function hoursBetween(a, b) {
  if (!a || !b) return Infinity;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

function assertNonEmpty(name, v) {
  if (v === undefined || v === null || v === '') {
    throw new Error(`ConsumerComplaints: ${name} is required`);
  }
}

// ─── Main class ────────────────────────────────────────────────────────

class ConsumerComplaints {
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function' ? opts.clock : () => new Date();
    this._idSalt = opts.idSalt || 'Y-142-salt';
    this._slaAckHours = Number.isFinite(opts.slaAckHours) ? opts.slaAckHours : DEFAULT_ACK_HOURS;
    this._slaResolveHours = Number.isFinite(opts.slaResolveHours)
      ? opts.slaResolveHours
      : DEFAULT_RESOLVE_HOURS;

    // Storage — in-memory, append-only. Never deleted.
    this._complaints = new Map();  // id → complaint
    this._events = [];             // hash-chained event log
    this._seq = 0;                 // monotonic id counter
    this._lastHash = GENESIS_HASH;
  }

  // ─────────────────────────────────────────────────────────────
  //  receiveComplaint — entry point
  // ─────────────────────────────────────────────────────────────

  receiveComplaint(input = {}) {
    assertNonEmpty('customerId', input.customerId);
    assertNonEmpty('category', input.category);
    assertNonEmpty('description', input.description);

    if (!COMPLAINT_CATEGORIES.includes(input.category)) {
      throw new Error(
        `ConsumerComplaints: unknown category "${input.category}". Valid: ${COMPLAINT_CATEGORIES.join(', ')}`,
      );
    }

    const now = this._now();
    const receivedAt = toDate(input.receivedAt) || now;
    this._seq += 1;
    const id = `CC-${now.getFullYear()}-${String(this._seq).padStart(6, '0')}`;

    const complaint = {
      id,
      customerIdHash: hashPII(input.customerId, this._idSalt),
      orderId: input.orderId || null,
      category: input.category,
      description: String(input.description),
      channel: input.channel || CHANNELS.WEB,
      receivedAt: receivedAt.toISOString(),
      status: STATUS.RECEIVED,
      amountIls: Number.isFinite(input.amountIls) ? Number(input.amountIls) : null,
      purchaseChannel: input.purchaseChannel || null,
      purchaseDate: input.purchaseDate ? toDate(input.purchaseDate).toISOString() : null,
      customerAge: Number.isFinite(input.customerAge) ? Number(input.customerAge) : null,
      isDisabled: Boolean(input.isDisabled),
      severity: null,
      severityReason: null,
      investigatorId: null,
      slaHours: null,
      responses: [],
      escalations: [],
      acknowledgedAt: null,
      resolvedAt: null,
      closedAt: null,
      createdAt: now.toISOString(),
    };

    // Auto-classify severity if not explicitly provided.
    if (input.severity && Object.values(SEVERITY).includes(input.severity)) {
      complaint.severity = input.severity;
      complaint.severityReason = 'caller-provided';
    } else {
      const cls = this._classify(complaint);
      complaint.severity = cls.severity;
      complaint.severityReason = cls.reason;
    }

    this._complaints.set(id, complaint);
    this._append('complaint.received', {
      id,
      category: complaint.category,
      severity: complaint.severity,
      channel: complaint.channel,
    });
    return this._snapshot(complaint);
  }

  // ─────────────────────────────────────────────────────────────
  //  classifyComplaint — severity inference
  // ─────────────────────────────────────────────────────────────

  classifyComplaint(complaint) {
    if (!complaint) throw new Error('ConsumerComplaints: complaint required');
    const rec = typeof complaint === 'string' ? this._complaints.get(complaint) : complaint;
    if (!rec) throw new Error('ConsumerComplaints: complaint not found');
    return this._classify(rec);
  }

  _classify(rec) {
    const text = `${rec.description || ''} ${rec.category || ''}`;
    const amount = Number.isFinite(rec.amountIls) ? rec.amountIls : 0;
    const reasons = [];

    // Critical criteria
    if (containsAny(text, CRITICAL_KEYWORDS)) {
      reasons.push('critical-keyword');
    }
    if (rec.category === 'privacy' || rec.category === 'accessibility') {
      // privacy + accessibility breaches get auto-elevated to at least major
      reasons.push(`sensitive-category:${rec.category}`);
    }
    if (amount >= CRITICAL_AMOUNT_ILS) {
      reasons.push(`amount>=${CRITICAL_AMOUNT_ILS}`);
    }

    const isCritical =
      containsAny(text, CRITICAL_KEYWORDS) || amount >= CRITICAL_AMOUNT_ILS;

    if (isCritical) {
      return { severity: SEVERITY.CRITICAL, reason: reasons.join('+') || 'critical' };
    }

    // Major criteria
    const isMajor =
      containsAny(text, MAJOR_KEYWORDS) ||
      amount >= MAJOR_AMOUNT_ILS ||
      rec.category === 'misleading-ad' ||
      rec.category === 'privacy' ||
      rec.category === 'accessibility' ||
      rec.category === 'defective-product' ||
      rec.category === 'refund-denied';

    if (isMajor) {
      return { severity: SEVERITY.MAJOR, reason: reasons.join('+') || 'major' };
    }

    return { severity: SEVERITY.MINOR, reason: 'default-minor' };
  }

  // ─────────────────────────────────────────────────────────────
  //  assignInvestigator
  // ─────────────────────────────────────────────────────────────

  assignInvestigator({ complaintId, investigatorId, slaHours } = {}) {
    assertNonEmpty('complaintId', complaintId);
    assertNonEmpty('investigatorId', investigatorId);
    const rec = this._complaints.get(complaintId);
    if (!rec) throw new Error(`ConsumerComplaints: ${complaintId} not found`);

    // Route based on category if investigatorId is 'auto'
    const finalId = investigatorId === 'auto' ? this._routeByCategory(rec.category) : investigatorId;
    const effectiveSla = Number.isFinite(slaHours) ? slaHours : this._slaForCategory(rec.category, rec.severity);

    rec.investigatorId = finalId;
    rec.slaHours = effectiveSla;
    // Status: received → under-investigation (upgrade only, never regress)
    if (rec.status === STATUS.RECEIVED) {
      rec.status = STATUS.UNDER_INVESTIGATION;
      rec.acknowledgedAt = this._now().toISOString();
    }
    this._append('complaint.assigned', {
      id: complaintId,
      investigatorId: finalId,
      slaHours: effectiveSla,
    });
    return this._snapshot(rec);
  }

  _routeByCategory(category) {
    // Routing table — simple deterministic mapping so tests can assert.
    const map = {
      'misleading-ad': 'legal-team',
      'defective-product': 'qa-team',
      'warranty': 'service-team',
      'refund-denied': 'finance-team',
      'price-discrepancy': 'finance-team',
      'quality': 'qa-team',
      'delivery': 'logistics-team',
      'privacy': 'dpo-team',
      'accessibility': 'a11y-team',
    };
    return map[category] || 'ops-team';
  }

  _slaForCategory(category, severity) {
    // Critical complaints: shorter SLA (24h). Major: 72h. Minor: 14 days ack.
    if (severity === SEVERITY.CRITICAL) return 24;
    if (severity === SEVERITY.MAJOR) return 72;
    return this._slaAckHours;
  }

  // ─────────────────────────────────────────────────────────────
  //  statutoryDeadline
  // ─────────────────────────────────────────────────────────────

  statutoryDeadline(complaint) {
    const rec = this._resolveInput(complaint);
    const received = new Date(rec.receivedAt);
    const ack = new Date(received.getTime() + this._slaAckHours * 3_600_000);
    const resolve = new Date(received.getTime() + this._slaResolveHours * 3_600_000);
    return {
      receivedAt: received.toISOString(),
      acknowledgmentDeadline: ack.toISOString(),
      resolutionDeadline: resolve.toISOString(),
      acknowledgmentDays: Math.round(this._slaAckHours / 24),
      resolutionDays: Math.round(this._slaResolveHours / 24),
      statute: 'חוק הגנת הצרכן תשמ"א-1981 — זמן סביר (best practice 14/60 days)',
      statuteEn: 'Consumer Protection Law 5741-1981 — reasonable time (best practice 14/60 days)',
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  recordResponse — append-only
  // ─────────────────────────────────────────────────────────────

  recordResponse({ complaintId, responseType, amount, notes, actor } = {}) {
    assertNonEmpty('complaintId', complaintId);
    assertNonEmpty('responseType', responseType);
    if (!RESPONSE_TYPE_SET.has(responseType)) {
      throw new Error(
        `ConsumerComplaints: invalid responseType "${responseType}". Valid: ${[...RESPONSE_TYPE_SET].join(', ')}`,
      );
    }
    const rec = this._complaints.get(complaintId);
    if (!rec) throw new Error(`ConsumerComplaints: ${complaintId} not found`);

    const now = this._now();
    const response = Object.freeze({
      seq: rec.responses.length + 1,
      responseType,
      amountIls: Number.isFinite(amount) ? Number(amount) : null,
      notes: notes ? String(notes) : '',
      actor: actor || 'system',
      recordedAt: now.toISOString(),
    });
    rec.responses.push(response);

    // State transition: under-investigation → responded
    if (rec.status === STATUS.RECEIVED || rec.status === STATUS.UNDER_INVESTIGATION) {
      rec.status = STATUS.RESPONDED;
    }
    // "reject" does not resolve; refund/replace/repair/credit do resolve.
    if (
      responseType !== RESPONSE_TYPES.REJECT &&
      rec.status === STATUS.RESPONDED
    ) {
      rec.status = STATUS.RESOLVED;
      rec.resolvedAt = now.toISOString();
    }

    this._append('complaint.responded', {
      id: complaintId,
      responseType,
      amountIls: response.amountIls,
      seq: response.seq,
    });
    return this._snapshot(rec);
  }

  // ─────────────────────────────────────────────────────────────
  //  refundEligibility — §14ג and defective-goods rules
  // ─────────────────────────────────────────────────────────────

  refundEligibility(complaint) {
    const rec = this._resolveInput(complaint);
    const now = this._now();

    // Defective goods are ALWAYS refundable (חוק האחריות למוצרים פגומים).
    if (rec.category === 'defective-product' || rec.category === 'quality') {
      return {
        eligible: true,
        statute: 'חוק האחריות למוצרים פגומים, התש"ם-1980 + חוק הגנת הצרכן §17',
        reason: 'defective-always-refundable',
        reasonHe: 'מוצר פגום — זכות החזר תמיד',
        reasonEn: 'Defective product — always refundable',
        coolingOffApplies: false,
      };
    }

    // §14ג — 14 days cooling-off for online/distance/phone sales.
    const isDistanceSale =
      rec.purchaseChannel === PURCHASE_CHANNELS.ONLINE ||
      rec.purchaseChannel === PURCHASE_CHANNELS.PHONE ||
      rec.purchaseChannel === PURCHASE_CHANNELS.CATALOG ||
      rec.purchaseChannel === PURCHASE_CHANNELS.DOOR_TO_DOOR;

    if (!isDistanceSale) {
      return {
        eligible: false,
        statute: 'חוק הגנת הצרכן §14ג',
        reason: 'not-distance-sale',
        reasonHe: 'עסקה לא מרחוק — אין זכות ביטול אוטומטית',
        reasonEn: 'In-store sale — no automatic cooling-off right',
        coolingOffApplies: false,
      };
    }

    // Elderly (≥65) or disabled consumers enjoy extended window (§14ג1).
    const isProtected =
      (Number.isFinite(rec.customerAge) && rec.customerAge >= 65) || rec.isDisabled;
    const windowDays = isProtected ? COOLING_OFF_DAYS_PROTECTED : COOLING_OFF_DAYS_DEFAULT;

    const purchaseDate = rec.purchaseDate ? toDate(rec.purchaseDate) : null;
    if (!purchaseDate) {
      // No purchase date on file — cannot verify, but allow (err on consumer).
      return {
        eligible: true,
        statute: 'חוק הגנת הצרכן §14ג',
        reason: 'distance-sale-no-date',
        reasonHe: 'עסקה מרחוק — תאריך רכישה חסר, זכות מותנית',
        reasonEn: 'Distance sale — purchase date missing, tentative eligibility',
        coolingOffApplies: true,
        windowDays,
        isProtected,
      };
    }

    const elapsed = daysBetween(purchaseDate, now);
    const eligible = elapsed <= windowDays;
    return {
      eligible,
      statute: isProtected
        ? 'חוק הגנת הצרכן §14ג1 (4 חודשים)'
        : 'חוק הגנת הצרכן §14ג (14 יום)',
      reason: eligible ? 'within-cooling-off' : 'cooling-off-expired',
      reasonHe: eligible
        ? `עסקה מרחוק — בתוך חלון הביטול (${elapsed}/${windowDays} ימים)`
        : `חלון הביטול חלף (${elapsed}/${windowDays} ימים)`,
      reasonEn: eligible
        ? `Distance sale — within cooling-off (${elapsed}/${windowDays} days)`
        : `Cooling-off window expired (${elapsed}/${windowDays} days)`,
      coolingOffApplies: true,
      windowDays,
      elapsedDays: elapsed,
      isProtected,
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  escalateToCommissioner — formal escalation
  // ─────────────────────────────────────────────────────────────

  escalateToCommissioner(complaintId, opts = {}) {
    assertNonEmpty('complaintId', complaintId);
    const rec = this._complaints.get(complaintId);
    if (!rec) throw new Error(`ConsumerComplaints: ${complaintId} not found`);

    const now = this._now();
    const proposedFine = Number.isFinite(opts.fineIls)
      ? Math.min(Number(opts.fineIls), FINE_CEILING_ILS)
      : null;

    const escalation = Object.freeze({
      seq: rec.escalations.length + 1,
      escalatedAt: now.toISOString(),
      reference: `ESC-${rec.id}-${rec.escalations.length + 1}`,
      commissioner: 'הרשות להגנת הצרכן ולסחר הוגן',
      commissionerEn: 'Israel Consumer Protection and Fair Trade Authority',
      statute: CATEGORY_STATUTE[rec.category] || 'חוק הגנת הצרכן תשמ"א-1981',
      fineCeilingIls: FINE_CEILING_ILS,
      proposedFineIls: proposedFine,
      notes: opts.notes ? String(opts.notes) : '',
      actor: opts.actor || 'system',
    });
    rec.escalations.push(escalation);
    rec.status = STATUS.ESCALATED;

    this._append('complaint.escalated', {
      id: complaintId,
      reference: escalation.reference,
      proposedFineIls: proposedFine,
    });
    return escalation;
  }

  // ─────────────────────────────────────────────────────────────
  //  templateResponse — bilingual customer-facing template
  // ─────────────────────────────────────────────────────────────

  templateResponse(complaint, lang = 'he') {
    const rec = this._resolveInput(complaint);
    const deadline = this.statutoryDeadline(rec);
    const eligibility = this.refundEligibility(rec);
    const catHe = CATEGORY_LABELS_HE[rec.category] || rec.category;
    const catEn = CATEGORY_LABELS_EN[rec.category] || rec.category;
    const statute = CATEGORY_STATUTE[rec.category] || 'חוק הגנת הצרכן תשמ"א-1981';

    const he =
`שלום רב,

קיבלנו את פנייתך מס' ${rec.id} בנושא: ${catHe}.
התלונה נרשמה בתאריך ${rec.receivedAt} בערוץ ${rec.channel}.
חומרה מוערכת: ${rec.severity}.

על פי ${statute}, אנו מחויבים לתת מענה בתוך זמן סביר.
נוהג המשרד: אישור תוך ${deadline.acknowledgmentDays} ימים, פתרון תוך ${deadline.resolutionDays} ימים.

זכות החזר/ביטול: ${eligibility.reasonHe}
${eligibility.coolingOffApplies && eligibility.windowDays
  ? `חלון זכות הביטול (§14ג${eligibility.isProtected ? '1' : ''}): ${eligibility.windowDays} ימים.`
  : ''}

אנו פועלים ליישוב התלונה בהקדם.
לפרטים נוספים — הרשות להגנת הצרכן: https://www.gov.il/he/departments/molsa

בכבוד רב,
טכנו-קול עוזי — מחלקת שירות לקוחות`;

    const en =
`Dear Customer,

We have received your complaint #${rec.id} regarding: ${catEn}.
Recorded at ${rec.receivedAt} via ${rec.channel}. Assessed severity: ${rec.severity}.

Under ${statute} (Israel Consumer Protection Law, 1981), we are required to respond within a reasonable time.
Our policy: acknowledge within ${deadline.acknowledgmentDays} days, resolve within ${deadline.resolutionDays} days.

Refund/cancellation right: ${eligibility.reasonEn}
${eligibility.coolingOffApplies && eligibility.windowDays
  ? `Cooling-off window (§14C${eligibility.isProtected ? '1' : ''}): ${eligibility.windowDays} days.`
  : ''}

We are working to resolve your complaint promptly.
For further information — Israel Consumer Protection Authority:
https://www.gov.il/en/departments/molsa

Sincerely,
Techno-Kol Uzi — Customer Service`;

    if (lang === 'en') return { lang: 'en', body: en };
    if (lang === 'he') return { lang: 'he', body: he };
    return { lang: 'bilingual', he, en };
  }

  // ─────────────────────────────────────────────────────────────
  //  trackSLA
  // ─────────────────────────────────────────────────────────────

  trackSLA(complaintId) {
    assertNonEmpty('complaintId', complaintId);
    const rec = this._complaints.get(complaintId);
    if (!rec) throw new Error(`ConsumerComplaints: ${complaintId} not found`);

    const now = this._now();
    const received = new Date(rec.receivedAt);
    const elapsedHours = hoursBetween(received, now);
    const ackSla = this._slaAckHours;
    const resSla = this._slaResolveHours;

    const ackBreached = elapsedHours > ackSla && !rec.acknowledgedAt;
    const resolveBreached = elapsedHours > resSla &&
      rec.status !== STATUS.RESOLVED &&
      rec.status !== STATUS.CLOSED;

    return {
      complaintId,
      status: rec.status,
      elapsedHours: Math.round(elapsedHours * 100) / 100,
      slaAckHours: ackSla,
      slaResolveHours: resSla,
      acknowledged: Boolean(rec.acknowledgedAt),
      ackBreached,
      resolveBreached,
      breach: ackBreached || resolveBreached,
      remainingAckHours: Math.max(0, ackSla - elapsedHours),
      remainingResolveHours: Math.max(0, resSla - elapsedHours),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  bulkClass — aggregate period report
  // ─────────────────────────────────────────────────────────────

  bulkClass(period = {}) {
    const from = period.from ? toDate(period.from) : null;
    const to = period.to ? toDate(period.to) : null;

    const byCategory = {};
    const bySeverity = { minor: 0, major: 0, critical: 0 };
    const byStatus = {};
    let total = 0;
    let totalAmountIls = 0;
    let breached = 0;

    for (const rec of this._complaints.values()) {
      const received = new Date(rec.receivedAt);
      if (from && received < from) continue;
      if (to && received > to) continue;
      total += 1;

      byCategory[rec.category] = (byCategory[rec.category] || 0) + 1;
      bySeverity[rec.severity] = (bySeverity[rec.severity] || 0) + 1;
      byStatus[rec.status] = (byStatus[rec.status] || 0) + 1;
      if (Number.isFinite(rec.amountIls)) totalAmountIls += rec.amountIls;

      const sla = this.trackSLA(rec.id);
      if (sla.breach) breached += 1;
    }

    // Pre-fill all categories so the report is shape-stable.
    for (const c of COMPLAINT_CATEGORIES) {
      if (!(c in byCategory)) byCategory[c] = 0;
    }

    return {
      period: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
      total,
      byCategory,
      bySeverity,
      byStatus,
      breached,
      totalAmountIls,
      generatedAt: this._now().toISOString(),
      statute: 'חוק הגנת הצרכן תשמ"א-1981',
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  consumerRights — bilingual summary
  // ─────────────────────────────────────────────────────────────

  consumerRights() {
    return {
      he: {
        title: 'זכויות הצרכן בישראל — חוק הגנת הצרכן תשמ"א-1981',
        rights: [
          { section: '§4א', text: 'חובת גילוי מידע מהותי לפני עסקה.' },
          { section: '§7', text: 'איסור הטעייה בפרסום ומצג שווא.' },
          { section: '§14ג', text: 'זכות ביטול עסקת מכר מרחוק תוך 14 יום.' },
          { section: '§14ג1', text: 'זכות ביטול מורחבת ל-4 חודשים לאזרחים ותיקים (≥65) ובעלי מוגבלות.' },
          { section: '§17', text: 'אחריות על טובין — חובה למסור תעודת אחריות.' },
          { section: '§17ב', text: 'חובת סימון מחיר ואי-אפלייה במחיר.' },
          { section: '§22', text: 'עיצום כספי עד ₪45,000 לכל הפרה.' },
          { section: '§31', text: 'זכות אכיפה אזרחית ותובענה ייצוגית.' },
          { section: '§31א', text: 'זכות להגנת פרטיות הצרכן.' },
          { section: '§2א', text: 'איסור אפלייה ונגישות השירות.' },
        ],
        regulator: 'הרשות להגנת הצרכן ולסחר הוגן — משרד הכלכלה',
        regulatorUrl: 'https://www.gov.il/he/departments/molsa',
      },
      en: {
        title: 'Israeli Consumer Rights — Consumer Protection Law 5741-1981',
        rights: [
          { section: '§4A', text: 'Duty to disclose material facts prior to transaction.' },
          { section: '§7', text: 'Prohibition on misleading advertising and misrepresentation.' },
          { section: '§14C', text: 'Right to cancel distance-sale transactions within 14 days.' },
          { section: '§14C1', text: 'Extended 4-month cancellation for elderly (≥65) and disabled consumers.' },
          { section: '§17', text: 'Warranty on goods — obligation to provide warranty certificate.' },
          { section: '§17B', text: 'Price marking and non-discriminatory pricing.' },
          { section: '§22', text: 'Administrative fine up to ₪45,000 per violation.' },
          { section: '§31', text: 'Civil enforcement and class-action standing.' },
          { section: '§31A', text: 'Consumer privacy protection.' },
          { section: '§2A', text: 'Non-discrimination and service accessibility.' },
        ],
        regulator: 'Israel Consumer Protection and Fair Trade Authority — Ministry of Economy',
        regulatorUrl: 'https://www.gov.il/en/departments/molsa',
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  Query helpers
  // ─────────────────────────────────────────────────────────────

  listComplaints(filter = {}) {
    const out = [];
    for (const rec of this._complaints.values()) {
      if (filter.status && rec.status !== filter.status) continue;
      if (filter.category && rec.category !== filter.category) continue;
      if (filter.severity && rec.severity !== filter.severity) continue;
      out.push(this._snapshot(rec));
    }
    return out;
  }

  getComplaint(id) {
    const rec = this._complaints.get(id);
    return rec ? this._snapshot(rec) : null;
  }

  events(filter = {}) {
    if (!filter || Object.keys(filter).length === 0) {
      return this._events.slice();
    }
    return this._events.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.complaintId && e.payload && e.payload.id !== filter.complaintId) return false;
      return true;
    });
  }

  // Manual transition helper for closing a complaint (append-only, never deletes).
  closeComplaint(complaintId, { notes, actor } = {}) {
    assertNonEmpty('complaintId', complaintId);
    const rec = this._complaints.get(complaintId);
    if (!rec) throw new Error(`ConsumerComplaints: ${complaintId} not found`);
    const now = this._now();
    rec.status = STATUS.CLOSED;
    rec.closedAt = now.toISOString();
    this._append('complaint.closed', {
      id: complaintId,
      actor: actor || 'system',
      notes: notes || '',
    });
    return this._snapshot(rec);
  }

  // ─────────────────────────────────────────────────────────────
  //  Internals
  // ─────────────────────────────────────────────────────────────

  _now() {
    const d = this._clock();
    return d instanceof Date ? d : new Date(d);
  }

  _append(type, payload) {
    const prev = this._lastHash;
    const now = this._now().toISOString();
    const rec = {
      idx: this._events.length + 1,
      type,
      payload: payload || {},
      at: now,
      prevHash: prev,
    };
    rec.hash = sha256Hex(
      `${rec.idx}|${type}|${stableStringify(rec.payload)}|${now}|${prev}`,
    );
    this._lastHash = rec.hash;
    this._events.push(Object.freeze(rec));
    return rec;
  }

  _resolveInput(c) {
    if (!c) throw new Error('ConsumerComplaints: complaint required');
    if (typeof c === 'string') {
      const rec = this._complaints.get(c);
      if (!rec) throw new Error(`ConsumerComplaints: ${c} not found`);
      return rec;
    }
    return c;
  }

  _snapshot(rec) {
    // Shallow clone — arrays cloned too so callers cannot mutate storage.
    return {
      ...rec,
      responses: rec.responses.slice(),
      escalations: rec.escalations.slice(),
    };
  }
}

module.exports = {
  ConsumerComplaints,
  COMPLAINT_CATEGORIES,
  CATEGORY_LABELS_HE,
  CATEGORY_LABELS_EN,
  CATEGORY_STATUTE,
  SEVERITY,
  STATUS,
  CHANNELS,
  PURCHASE_CHANNELS,
  RESPONSE_TYPES,
  COOLING_OFF_DAYS_DEFAULT,
  COOLING_OFF_DAYS_PROTECTED,
  FINE_CEILING_ILS,
  DEFAULT_ACK_HOURS,
  DEFAULT_RESOLVE_HOURS,
  CRITICAL_AMOUNT_ILS,
  MAJOR_AMOUNT_ILS,
  hashPII,
};
