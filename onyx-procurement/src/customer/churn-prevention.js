/**
 * Churn Prevention Engine  |  מנוע מניעת נטישה
 * =============================================================
 *
 * Agent Y-100  |  Techno-Kol Uzi mega-ERP  |  onyx-procurement
 * Date: 2026-04-11
 *
 * Signals + playbooks + save-campaigns — an operational retention engine
 * that sits on top of the X-06 churn *predictor*. Where the predictor
 * answers "who is likely to leave?", this module answers
 *
 *    "what do we do about it, who owns each step, did it work, and
 *     was it worth it?"
 *
 * The class `ChurnPrevention` owns:
 *   1. Playbooks          — named intervention runbooks with trigger, steps,
 *                           owner and success metric.
 *   2. A signal log       — append-only stream of risk events per customer.
 *   3. Playbook execs     — instantiated playbooks actively running per
 *                           customer, with per-step audit trail.
 *   4. Save offers        — retention discounts, upgrades, free periods,
 *                           waivers, each with approver and expiry.
 *   5. Saves & losses     — what worked, what didn't, how much was lost.
 *   6. Win-back campaigns — structured re-engagement flows for already
 *                           churned customers.
 *   7. Exit interviews    — structured departure feedback.
 *   8. Metrics            — save-rate, campaign ROI, top loss reasons.
 *   9. Closed-loop        — final status per customer, never deleted.
 *
 * ─── House rule — לא מוחקים רק משדרגים ומגדלים ─────────────────────────────
 *   Nothing is ever removed from the ledger. Close/cancel operations flip a
 *   status flag and set `closed_at`. Signals, executions, step logs, offers,
 *   saves, losses and exit interviews are all append-only.
 *
 * ─── Zero dependencies ─────────────────────────────────────────────────────
 *   Node built-ins only. No require(), no fetch(), no third-party libraries.
 *   Storage is in-memory. A deterministic clock may be injected for tests.
 *
 * ─── Bilingual ─────────────────────────────────────────────────────────────
 *   All user-facing strings carry `_he` and `_en` variants. A GLOSSARY object
 *   is exported so UIs can render RTL Hebrew labels alongside English ones.
 *
 * ─── Public API (new, primary) ─────────────────────────────────────────────
 *   class ChurnPrevention({now?, predictor?})
 *     definePlaybook({id, trigger, severity, steps, owner, successMetric})
 *     registerSignal({customerId, type, value, timestamp})
 *     churnRisk(customerId)                        → number 0..100 (weighted)
 *     triggerPlaybook(customerId, trigger)         → execution or null
 *     executeStep({playbookExecutionId, stepId, outcome, notes, by})
 *     saveOffer({customerId, offer, expiresAt, approvedBy})
 *     recordSave({customerId, method, notes, outcome})
 *     recordLoss({customerId, reason, competitor, totalValueLost})
 *     winBackCampaign({segmentId, touchpoints, duration})
 *     exitInterview({customerId, feedback, rating, wouldReturn})
 *     retentionMetrics({period?})
 *     closeLoop(customerId, status)                → 'saved'|'churned'|'pending'
 *
 *   Helpers & views:
 *     listPlaybooks(), getPlaybook(id)
 *     listSignals(customerId?), listExecutions(customerId?)
 *     listOffers(customerId?), listSaves(), listLosses()
 *     listWinBackCampaigns(), listExitInterviews()
 *     riskBreakdown(customerId)
 *     customerStatus(customerId)
 *     topLossReasons(), campaignROI()
 *
 * ─── Legacy API (preserved — never deleted, only upgraded) ─────────────────
 *   The original Swarm-4 ChurnPrevention API (defineSignals, recordSignal,
 *   monitorCustomer, detectAtRisk, openIntervention, recordAction,
 *   closeIntervention, saveRate, winBack, churnDebriefing, preventionROI,
 *   alertExecutive, communicateToTeam, interventionPlaybook, exportJson,
 *   importJson and friends) is still exposed and still works. It now shares
 *   the same signal log / ledger with the new API — upgraded, not replaced.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS & DEFAULTS  (frozen — nothing mutated at runtime)
// ═══════════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Severities in ascending order. */
const SEVERITY_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);

/** Risk weight per severity — used for churnRisk() aggregation & rankings. */
const SEVERITY_WEIGHT = Object.freeze({
  low: 1,
  medium: 3,
  high: 6,
  critical: 10,
});

/** The seven canonical triggers documented in the QA spec. */
const TRIGGERS = Object.freeze([
  'health-score-drop',
  'nps-detractor',
  'payment-late',
  'support-escalation',
  'contract-end-approaching',
  'usage-decline',
  'contact-change',
]);

/** Trigger → severity heuristic when the caller does not specify. */
const TRIGGER_SEVERITY = Object.freeze({
  'health-score-drop': 'high',
  'nps-detractor': 'medium',
  'payment-late': 'high',
  'support-escalation': 'high',
  'contract-end-approaching': 'critical',
  'usage-decline': 'medium',
  'contact-change': 'medium',
});

/** Legacy signal names kept for backward compatibility with old tests. */
const DEFAULT_SIGNAL_SEVERITY = Object.freeze({
  ticket_spike: 'medium',
  payment_missed: 'high',
  key_contact_left: 'high',
  usage_drop: 'medium',
  feature_complaint: 'low',
  competitor_mention: 'high',
  contract_renewal_at_risk: 'critical',
  nps_detractor: 'medium',
  sla_breach: 'high',
  billing_dispute: 'medium',
});

/** Valid close-loop outcomes (kept in legacy enum for compatibility). */
const CLOSE_OUTCOMES = Object.freeze([
  'saved',
  'churned',
  'downgraded',
  'escalated',
]);

/** New closed-loop states per the spec. */
const LOOP_STATES = Object.freeze(['saved', 'churned', 'pending']);

/** Valid retention-offer kinds. */
const OFFER_KINDS = Object.freeze([
  'discount',
  'upgrade',
  'free-period',
  'waiver',
]);

/** Estimated operational cost (ILS) per severity tier — used by ROI. */
const INTERVENTION_COST_ILS = Object.freeze({
  low: 250,      // email check-in
  medium: 1200,  // phone / video call
  high: 4500,    // executive sponsor meeting
  critical: 12000, // save-team war room
});

/** Legacy bilingual playbook-per-severity (kept for back-compat). */
const PLAYBOOK = Object.freeze({
  low: Object.freeze({
    key: 'low',
    label_he: 'בדיקת שלום במייל',
    label_en: 'Email check-in',
    owner_role: 'account_manager',
    sla_hours: 48,
    actions_he: Object.freeze([
      'שליחת מייל בדיקה אישי',
      'שאלון שביעות רצון קצר',
      'הצעת פגישה קצרה בזום',
    ]),
    actions_en: Object.freeze([
      'Personalised check-in email',
      'Short satisfaction survey',
      'Offer a short Zoom call',
    ]),
  }),
  medium: Object.freeze({
    key: 'medium',
    label_he: 'שיחת טלפון אישית',
    label_en: 'Phone call from AM',
    owner_role: 'account_manager',
    sla_hours: 24,
    actions_he: Object.freeze([
      'שיחת טלפון של מנהל לקוח',
      'זיהוי וטיפול בנקודת כאב ספציפית',
      'הפעלת תכנית תיקון עם בעל תפקיד',
    ]),
    actions_en: Object.freeze([
      'Account Manager phone call',
      'Identify and address specific pain point',
      'Start a remediation plan with an owner',
    ]),
  }),
  high: Object.freeze({
    key: 'high',
    label_he: 'פגישת נותן חסות הנהלה',
    label_en: 'Executive-sponsor meeting',
    owner_role: 'executive_sponsor',
    sla_hours: 8,
    actions_he: Object.freeze([
      'הקצאת נותן חסות הנהלה ללקוח',
      'פגישת אסטרטגיה עם ההנהלה הבכירה',
      'ביקור באתר הלקוח',
      'מסלול תיקון רב-שלבי',
    ]),
    actions_en: Object.freeze([
      'Assign executive sponsor',
      'Strategy meeting with senior leadership',
      'On-site customer visit',
      'Multi-step remediation roadmap',
    ]),
  }),
  critical: Object.freeze({
    key: 'critical',
    label_he: 'הסלמה לצוות הצלה',
    label_en: 'Save-team escalation',
    owner_role: 'save_team',
    sla_hours: 2,
    actions_he: Object.freeze([
      'הפעלת צוות הצלה (Save Team) מיידית',
      'פגישת חירום בתוך 24 שעות',
      'חבילת הטבות מיוחדת / הנחה / הקפאה',
      'תכנית שיקום 90 יום עם סימוני דרך',
      'הסלמה לסמנכ״ל ו/או מנכ״ל',
    ]),
    actions_en: Object.freeze([
      'Trigger Save-Team war room immediately',
      'Emergency meeting within 24 hours',
      'Special concessions / discount / pause',
      '90-day recovery plan with milestones',
      'Escalate to VP and/or CEO',
    ]),
  }),
});

/** Bilingual glossary exposed to the UI. */
const GLOSSARY = Object.freeze({
  churn:          { he: 'נטישה',              en: 'Churn' },
  prevention:     { he: 'מניעה',               en: 'Prevention' },
  intervention:   { he: 'התערבות',             en: 'Intervention' },
  signal:         { he: 'אות אזהרה',           en: 'Signal' },
  playbook:       { he: 'פלייבוק',             en: 'Playbook' },
  trigger:        { he: 'טריגר',               en: 'Trigger' },
  step:           { he: 'שלב',                 en: 'Step' },
  owner:          { he: 'אחראי',               en: 'Owner' },
  save_rate:      { he: 'אחוז הצלה',           en: 'Save Rate' },
  save_offer:     { he: 'הצעת שימור',          en: 'Save Offer' },
  win_back:       { he: 'החזרת לקוח',          en: 'Win-Back' },
  exit_interview: { he: 'ראיון פרידה',         en: 'Exit Interview' },
  retention:      { he: 'שימור',                en: 'Retention' },
  roi:            { he: 'תשואה על ההשקעה',     en: 'ROI' },
  loss_reason:    { he: 'סיבת אובדן',          en: 'Loss Reason' },
  competitor:     { he: 'מתחרה',                en: 'Competitor' },
  closed_loop:    { he: 'סגירת מעגל',           en: 'Closed Loop' },
  status_saved:   { he: 'נוצל',                 en: 'Saved' },
  status_churned: { he: 'נטש',                  en: 'Churned' },
  status_pending: { he: 'ממתין',                en: 'Pending' },
  offer_discount: { he: 'הנחה',                 en: 'Discount' },
  offer_upgrade:  { he: 'שדרוג',                en: 'Upgrade' },
  offer_free:     { he: 'תקופת חינם',          en: 'Free Period' },
  offer_waiver:   { he: 'ויתור',                en: 'Waiver' },
  severity_low:      { he: 'נמוכה',   en: 'Low' },
  severity_medium:   { he: 'בינונית', en: 'Medium' },
  severity_high:     { he: 'גבוהה',   en: 'High' },
  severity_critical: { he: 'קריטית',  en: 'Critical' },
  outcome_saved:      { he: 'ניצל',           en: 'Saved' },
  outcome_churned:    { he: 'נטש',            en: 'Churned' },
  outcome_downgraded: { he: 'שודרג למטה',     en: 'Downgraded' },
  outcome_escalated:  { he: 'הוסלם',          en: 'Escalated' },
  trigger_health_drop:       { he: 'ירידה בציון בריאות',        en: 'Health Score Drop' },
  trigger_nps_detractor:     { he: 'לקוח NPS שלילי',             en: 'NPS Detractor' },
  trigger_payment_late:      { he: 'תשלום באיחור',               en: 'Payment Late' },
  trigger_support_escalation:{ he: 'הסלמה בתמיכה',              en: 'Support Escalation' },
  trigger_contract_end:      { he: 'סיום חוזה מתקרב',            en: 'Contract End Approaching' },
  trigger_usage_decline:     { he: 'ירידה בשימוש',               en: 'Usage Decline' },
  trigger_contact_change:    { he: 'החלפת איש קשר',              en: 'Contact Change' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. PURE HELPERS — deterministic, dependency-free
// ═══════════════════════════════════════════════════════════════════════════

function coerceDate(d) {
  if (d == null) return null;
  if (d instanceof Date) {
    return Number.isFinite(d.getTime()) ? new Date(d.getTime()) : null;
  }
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function safeNumber(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function round2(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normaliseSeverity(s) {
  if (typeof s !== 'string') return 'low';
  const low = s.toLowerCase().trim();
  if (low === 'med') return 'medium';
  if (low === 'crit') return 'critical';
  if (SEVERITY_LEVELS.indexOf(low) === -1) return 'low';
  return low;
}

function normaliseTrigger(t) {
  if (typeof t !== 'string') return null;
  return t.toLowerCase().trim();
}

function normalisePeriod(period) {
  if (!period || typeof period !== 'object') {
    return {
      from: new Date(0),
      to: new Date(8640000000000000),
    };
  }
  const from = coerceDate(period.from) || new Date(0);
  const to = coerceDate(period.to) || new Date(8640000000000000);
  return { from, to };
}

function inPeriod(dateLike, period) {
  const { from, to } = normalisePeriod(period);
  const d = coerceDate(dateLike);
  if (!d) return false;
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function frozenCopy(obj) {
  // Deep-freeze a JSON-safe object so external callers cannot mutate it.
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return Object.freeze(obj.map(frozenCopy));
  }
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = frozenCopy(obj[key]);
  }
  return Object.freeze(out);
}

function pad6(n) {
  return String(n).padStart(6, '0');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. DEFAULT PLAYBOOKS — one per canonical trigger, bilingual
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PLAYBOOKS = Object.freeze([
  Object.freeze({
    id: 'pb-health-drop',
    trigger: 'health-score-drop',
    severity: 'high',
    owner: 'customer_success_manager',
    successMetric: 'health_score_recovered_to_70',
    label_he: 'החייאת ציון בריאות',
    label_en: 'Health Score Recovery',
    steps: Object.freeze([
      Object.freeze({ id: 'hs1', label_he: 'זיהוי סיבת הירידה', label_en: 'Identify root cause of drop', owner: 'csm' }),
      Object.freeze({ id: 'hs2', label_he: 'שיחת CSM עם הלקוח', label_en: 'CSM outreach call', owner: 'csm' }),
      Object.freeze({ id: 'hs3', label_he: 'הצעת תכנית החייאה', label_en: 'Offer recovery plan', owner: 'csm' }),
      Object.freeze({ id: 'hs4', label_he: 'מעקב שבועי', label_en: 'Weekly follow-up', owner: 'csm' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-nps-detractor',
    trigger: 'nps-detractor',
    severity: 'medium',
    owner: 'account_manager',
    successMetric: 'nps_lifted_to_passive_or_promoter',
    label_he: 'המרת NPS שלילי',
    label_en: 'NPS Detractor Conversion',
    steps: Object.freeze([
      Object.freeze({ id: 'np1', label_he: 'שיחת הקשבה', label_en: 'Listening call', owner: 'am' }),
      Object.freeze({ id: 'np2', label_he: 'תיעוד נקודות כאב', label_en: 'Document pain points', owner: 'am' }),
      Object.freeze({ id: 'np3', label_he: 'תכנית פעולה אישית', label_en: 'Personal action plan', owner: 'am' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-payment-late',
    trigger: 'payment-late',
    severity: 'high',
    owner: 'finance_ops',
    successMetric: 'invoice_paid_within_7_days',
    label_he: 'טיפול בתשלום באיחור',
    label_en: 'Late Payment Handling',
    steps: Object.freeze([
      Object.freeze({ id: 'pl1', label_he: 'תזכורת חיוב רכה', label_en: 'Soft billing reminder', owner: 'finance' }),
      Object.freeze({ id: 'pl2', label_he: 'שיחת טלפון פיננסית', label_en: 'Finance phone call', owner: 'finance' }),
      Object.freeze({ id: 'pl3', label_he: 'הצעת פריסת תשלומים', label_en: 'Offer payment plan', owner: 'finance' }),
      Object.freeze({ id: 'pl4', label_he: 'החלטה על הקפאה/ביטול', label_en: 'Decide pause/cancel', owner: 'finance' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-support-escalation',
    trigger: 'support-escalation',
    severity: 'high',
    owner: 'support_lead',
    successMetric: 'case_resolved_csat_4plus',
    label_he: 'הסלמת תמיכה',
    label_en: 'Support Escalation',
    steps: Object.freeze([
      Object.freeze({ id: 'su1', label_he: 'שיוך ל-Tier-2', label_en: 'Assign Tier-2 engineer', owner: 'support' }),
      Object.freeze({ id: 'su2', label_he: 'עדכון סטטוס כל 4 שעות', label_en: 'Status every 4 hours', owner: 'support' }),
      Object.freeze({ id: 'su3', label_he: 'שיחת Post-Mortem', label_en: 'Post-mortem call', owner: 'support_lead' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-contract-end',
    trigger: 'contract-end-approaching',
    severity: 'critical',
    owner: 'account_executive',
    successMetric: 'contract_renewed',
    label_he: 'חידוש חוזה',
    label_en: 'Contract Renewal',
    steps: Object.freeze([
      Object.freeze({ id: 'ce1', label_he: 'סקירת ערך עסקי (QBR)', label_en: 'Business Value Review (QBR)', owner: 'ae' }),
      Object.freeze({ id: 'ce2', label_he: 'הצעת חידוש', label_en: 'Renewal proposal', owner: 'ae' }),
      Object.freeze({ id: 'ce3', label_he: 'משא ומתן', label_en: 'Negotiation', owner: 'ae' }),
      Object.freeze({ id: 'ce4', label_he: 'חתימה על חוזה', label_en: 'Contract signing', owner: 'ae' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-usage-decline',
    trigger: 'usage-decline',
    severity: 'medium',
    owner: 'customer_success_manager',
    successMetric: 'usage_back_to_baseline',
    label_he: 'החייאת שימוש',
    label_en: 'Usage Revival',
    steps: Object.freeze([
      Object.freeze({ id: 'ud1', label_he: 'הדרכת משתמשים נוספת', label_en: 'Additional user training', owner: 'csm' }),
      Object.freeze({ id: 'ud2', label_he: 'הדגמת פיצ׳רים לא מנוצלים', label_en: 'Demo under-used features', owner: 'csm' }),
      Object.freeze({ id: 'ud3', label_he: 'תכנית אימוץ 30 יום', label_en: '30-day adoption plan', owner: 'csm' }),
    ]),
  }),
  Object.freeze({
    id: 'pb-contact-change',
    trigger: 'contact-change',
    severity: 'medium',
    owner: 'account_manager',
    successMetric: 'new_champion_identified',
    label_he: 'החלפת איש קשר',
    label_en: 'Contact Change',
    steps: Object.freeze([
      Object.freeze({ id: 'cc1', label_he: 'מיפוי בעלי עניין חדשים', label_en: 'Map new stakeholders', owner: 'am' }),
      Object.freeze({ id: 'cc2', label_he: 'פגישת היכרות', label_en: 'Introduction meeting', owner: 'am' }),
      Object.freeze({ id: 'cc3', label_he: 'העברת ידע מלאה', label_en: 'Full knowledge transfer', owner: 'am' }),
      Object.freeze({ id: 'cc4', label_he: 'זיהוי אלוף חדש', label_en: 'Identify new champion', owner: 'am' }),
    ]),
  }),
]);

// ═══════════════════════════════════════════════════════════════════════════
// 3. MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ChurnPrevention {
  constructor(opts) {
    const o = opts || {};

    /** Reference "now" for deterministic tests. */
    this._now = coerceDate(o.now) || new Date();

    /** Monotonic id counters — never reset. */
    this._signalSeq = 0;
    this._executionSeq = 0;
    this._stepLogSeq = 0;
    this._offerSeq = 0;
    this._saveSeq = 0;
    this._lossSeq = 0;
    this._winBackSeq = 0;
    this._exitSeq = 0;
    this._loopSeq = 0;
    // Legacy counters
    this._interventionSeq = 0;
    this._actionSeq = 0;
    this._debriefSeq = 0;
    this._executiveAlertSeq = 0;

    /** Playbooks — keyed by id. */
    this._playbooks = new Map();

    /** Signal catalog — keyed by signal name (legacy). */
    this._signalCatalog = new Map();

    /** Append-only signal events. */
    this._signalEvents = [];

    /** Playbook executions — id → execution object. */
    this._executions = new Map();

    /** Per-execution step logs — id → array. */
    this._stepLogs = new Map();

    /** Save offers — array. */
    this._offers = [];

    /** Recorded saves — array. */
    this._saves = [];

    /** Recorded losses — array. */
    this._losses = [];

    /** Win-back campaigns — array. */
    this._winBackCampaigns = [];

    /** Exit interviews — array. */
    this._exitInterviews = [];

    /** Closed-loop status per customer — id → record (append-only history). */
    this._loopHistory = [];

    /** Legacy intervention records (shared with new executions). */
    this._interventions = new Map();
    this._actions = new Map();
    this._winBacks = [];
    this._debriefs = [];
    this._executiveAlerts = [];

    /** Optional prediction bridge from churn-predictor (X-06). */
    this._predictor = typeof o.predictor === 'function' ? o.predictor : null;

    // Seed default legacy signal catalog so old tests keep working.
    const seededSignals = [];
    for (const name of Object.keys(DEFAULT_SIGNAL_SEVERITY)) {
      seededSignals.push({
        name,
        source: 'system',
        trigger: 'auto',
        severity: DEFAULT_SIGNAL_SEVERITY[name],
      });
    }
    this.defineSignals({ signals: seededSignals });

    // Seed default playbooks for each canonical trigger.
    for (const pb of DEFAULT_PLAYBOOKS) {
      this.definePlaybook({
        id: pb.id,
        trigger: pb.trigger,
        severity: pb.severity,
        owner: pb.owner,
        successMetric: pb.successMetric,
        steps: pb.steps.map((s) => ({ ...s })),
        label_he: pb.label_he,
        label_en: pb.label_en,
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.1  PLAYBOOK DEFINITION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * definePlaybook({id, trigger, severity, steps, owner, successMetric})
   *
   * Registers a playbook. Calling twice with the same `id` upgrades the
   * existing playbook — never deletes prior fields. Steps are an array of
   * `{id, label_he, label_en, owner?}` objects.
   */
  definePlaybook(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('definePlaybook: spec must be an object');
    }
    if (typeof spec.id !== 'string' || spec.id.trim() === '') {
      throw new TypeError('definePlaybook: id is required');
    }
    const trigger = normaliseTrigger(spec.trigger);
    if (!trigger) {
      throw new TypeError('definePlaybook: trigger is required');
    }
    const severity = normaliseSeverity(
      spec.severity || TRIGGER_SEVERITY[trigger] || 'medium'
    );
    const owner = typeof spec.owner === 'string' ? spec.owner : 'account_manager';
    const successMetric = typeof spec.successMetric === 'string' ? spec.successMetric : '';
    const stepsInput = Array.isArray(spec.steps) ? spec.steps : [];
    const steps = stepsInput.map((s, idx) => ({
      id: (s && typeof s.id === 'string' && s.id) ? s.id : `step-${idx + 1}`,
      label_he: (s && typeof s.label_he === 'string') ? s.label_he : `שלב ${idx + 1}`,
      label_en: (s && typeof s.label_en === 'string') ? s.label_en : `Step ${idx + 1}`,
      owner: (s && typeof s.owner === 'string') ? s.owner : owner,
      order: idx + 1,
    }));

    const existing = this._playbooks.get(spec.id.trim()) || {};
    const fallbackHe = def_label_he_for(trigger);
    const fallbackEn = def_label_en_for(trigger);
    const record = {
      id: spec.id.trim(),
      trigger,
      severity,
      owner,
      success_metric: successMetric || existing.success_metric || '',
      label_he: typeof spec.label_he === 'string' ? spec.label_he : (existing.label_he || fallbackHe),
      label_en: typeof spec.label_en === 'string' ? spec.label_en : (existing.label_en || fallbackEn),
      steps: steps.length > 0 ? steps : (existing.steps || []),
      registered_at: existing.registered_at || this._now.toISOString(),
      updated_at: this._now.toISOString(),
    };

    // Preserve any previously-attached metadata (never delete fields).
    for (const k of Object.keys(existing)) {
      if (record[k] === undefined) record[k] = existing[k];
    }

    this._playbooks.set(record.id, record);
    return frozenCopy(record);
  }

  listPlaybooks() {
    const out = [];
    for (const pb of this._playbooks.values()) out.push(frozenCopy(pb));
    return out;
  }

  getPlaybook(id) {
    const pb = this._playbooks.get(String(id || '').trim());
    return pb ? frozenCopy(pb) : null;
  }

  /** Find the first playbook matching a trigger (stable insertion order). */
  _findPlaybookByTrigger(trigger) {
    const tNorm = normaliseTrigger(trigger);
    if (!tNorm) return null;
    for (const pb of this._playbooks.values()) {
      if (pb.trigger === tNorm) return pb;
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.2  SIGNAL REGISTRATION (append-only log)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * registerSignal({customerId, type, value, timestamp})
   *
   * Append-only signal recording. `type` is usually one of the canonical
   * trigger names but any string is accepted. `value` is any JSON-safe
   * payload — typically a number (e.g. health score delta) or an object.
   */
  registerSignal(input) {
    const i = input || {};
    const customerId = i.customerId;
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('registerSignal: customerId is required');
    }
    if (typeof i.type !== 'string' || i.type.trim() === '') {
      throw new TypeError('registerSignal: type is required');
    }
    const type = i.type.trim();
    const atDate = coerceDate(i.timestamp) || this._now;

    // Map type → severity. Prefer explicit, then canonical trigger map,
    // then legacy signal catalog, then default low.
    let severity;
    if (i.severity) {
      severity = normaliseSeverity(i.severity);
    } else if (TRIGGER_SEVERITY[type]) {
      severity = TRIGGER_SEVERITY[type];
    } else if (DEFAULT_SIGNAL_SEVERITY[type]) {
      severity = DEFAULT_SIGNAL_SEVERITY[type];
    } else {
      severity = 'low';
    }

    // Auto-register into legacy signal catalog so both APIs stay in sync.
    if (!this._signalCatalog.has(type)) {
      this.defineSignals({
        signals: [{
          name: type,
          source: i.source || 'ad_hoc',
          trigger: 'auto',
          severity,
        }],
      });
    }
    const catEntry = this._signalCatalog.get(type);

    this._signalSeq += 1;
    const event = Object.freeze({
      id: `SIG-${pad6(this._signalSeq)}`,
      customer_id: customerId,
      type,
      name: type, // legacy alias
      source: i.source || (catEntry && catEntry.source) || 'system',
      severity,
      value: i.value !== undefined ? i.value : null,
      payload: i.value !== undefined ? i.value : null, // legacy alias
      at: atDate.toISOString(),
      at_ms: atDate.getTime(),
      label_he: catEntry ? catEntry.label_he : type,
      label_en: catEntry ? catEntry.label_en : type,
    });
    this._signalEvents.push(event);
    return event;
  }

  listSignals(customerId) {
    if (customerId === undefined || customerId === null) {
      return this._signalEvents.slice();
    }
    return this._signalEvents.filter(
      (e) => String(e.customer_id) === String(customerId)
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.3  CHURN RISK SCORE  (weighted 0..100)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * churnRisk(customerId) → number 0..100
   *
   * Weighted aggregation of recent signal events:
   *   score = min(100, sum(SEVERITY_WEIGHT[sev] * decay(age)) * scale)
   *
   * Decay: signals older than 60 days are halved, older than 180 are ignored.
   * Scale factor: 8 (i.e. a single critical signal today ≈ 80 points, leaving
   * headroom for multiple stacked signals up to the cap of 100).
   */
  churnRisk(customerId) {
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('churnRisk: customerId is required');
    }
    const events = this._signalEvents.filter(
      (e) => String(e.customer_id) === String(customerId)
    );
    if (events.length === 0) return 0;

    const nowMs = this._now.getTime();
    let total = 0;
    for (const e of events) {
      const ageDays = Math.max(0, (nowMs - e.at_ms) / MS_PER_DAY);
      let decay = 1;
      if (ageDays > 180) continue;
      else if (ageDays > 60) decay = 0.5;
      else if (ageDays > 30) decay = 0.75;
      const w = SEVERITY_WEIGHT[e.severity] || 1;
      total += w * decay;
    }
    // Base scale: ~8 points per weighted unit, capped at 100.
    const score = clamp(Math.round(total * 8), 0, 100);
    return score;
  }

  /**
   * riskBreakdown(customerId) → explanation object for UI tooltips.
   */
  riskBreakdown(customerId) {
    const events = this._signalEvents
      .filter((e) => String(e.customer_id) === String(customerId))
      .slice()
      .sort((a, b) => b.at_ms - a.at_ms);
    const severities = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const e of events) {
      if (severities[e.severity] !== undefined) severities[e.severity] += 1;
    }
    const score = this.churnRisk(customerId);
    return frozenCopy({
      customer_id: customerId,
      score,
      level: scoreToLevel(score),
      signal_count: events.length,
      severities,
      latest_signal_at: events.length > 0 ? events[0].at : null,
      top_signals: events.slice(0, 5).map((e) => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        at: e.at,
      })),
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.4  PLAYBOOK TRIGGER / EXECUTION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * triggerPlaybook(customerId, trigger) → execution | null
   *
   * Finds the first playbook whose trigger matches and instantiates an
   * execution record for this customer. Returns the execution (frozen).
   * Returns `null` if no matching playbook exists. If an active execution
   * for the same customer + playbook already exists, that one is returned
   * unchanged — never duplicated.
   */
  triggerPlaybook(customerId, trigger) {
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('triggerPlaybook: customerId is required');
    }
    const pb = this._findPlaybookByTrigger(trigger);
    if (!pb) return null;

    // Re-use an already-open execution for same (customer, playbook)
    for (const exe of this._executions.values()) {
      if (
        String(exe.customer_id) === String(customerId) &&
        exe.playbook_id === pb.id &&
        exe.status === 'open'
      ) {
        return frozenCopy(exe);
      }
    }

    this._executionSeq += 1;
    const dueAt = new Date(
      this._now.getTime() + (PLAYBOOK[pb.severity] ? PLAYBOOK[pb.severity].sla_hours : 24) * MS_PER_HOUR
    );
    const exec = {
      id: `EXE-${pad6(this._executionSeq)}`,
      customer_id: customerId,
      playbook_id: pb.id,
      trigger: pb.trigger,
      severity: pb.severity,
      owner: pb.owner,
      status: 'open',
      opened_at: this._now.toISOString(),
      due_at: dueAt.toISOString(),
      success_metric: pb.success_metric,
      steps_total: pb.steps.length,
      steps_completed: 0,
      playbook_label_he: pb.label_he,
      playbook_label_en: pb.label_en,
      closed_at: null,
      outcome: null,
    };
    this._executions.set(exec.id, exec);
    this._stepLogs.set(exec.id, []);

    // Also back-fill a legacy intervention record so old APIs can see it.
    this._interventionSeq += 1;
    const interventionId = `ITV-${pad6(this._interventionSeq)}`;
    const legacyIv = {
      id: interventionId,
      customer_id: customerId,
      severity: pb.severity,
      reason: `trigger:${pb.trigger}`,
      owner: pb.owner,
      status: 'open',
      opened_at: this._now.toISOString(),
      due_at: dueAt.toISOString(),
      playbook_key: PLAYBOOK[pb.severity] ? PLAYBOOK[pb.severity].key : pb.severity,
      playbook_label_he: PLAYBOOK[pb.severity] ? PLAYBOOK[pb.severity].label_he : pb.label_he,
      playbook_label_en: PLAYBOOK[pb.severity] ? PLAYBOOK[pb.severity].label_en : pb.label_en,
      cost_ils: INTERVENTION_COST_ILS[pb.severity] || 0,
      closed_at: null,
      outcome: null,
      revenue_saved_ils: 0,
      execution_id: exec.id,
    };
    this._interventions.set(interventionId, legacyIv);
    this._actions.set(interventionId, []);
    exec.legacy_intervention_id = interventionId;

    return frozenCopy(exec);
  }

  /**
   * executeStep({playbookExecutionId, stepId, outcome, notes, by})
   *
   * Append-only step-level audit log. `outcome` is a free string
   * (e.g. 'done', 'skipped', 'blocked', 'in_progress'). The parent
   * execution's `steps_completed` counter is only bumped for 'done'.
   */
  executeStep(input) {
    const i = input || {};
    if (!i.playbookExecutionId) {
      throw new TypeError('executeStep: playbookExecutionId is required');
    }
    const exec = this._executions.get(i.playbookExecutionId);
    if (!exec) {
      throw new Error(`executeStep: unknown execution ${i.playbookExecutionId}`);
    }
    if (exec.status === 'closed') {
      throw new Error(`executeStep: execution ${exec.id} is already closed`);
    }
    if (typeof i.stepId !== 'string' || i.stepId.trim() === '') {
      throw new TypeError('executeStep: stepId is required');
    }
    const pb = this._playbooks.get(exec.playbook_id);
    const stepDef = pb ? pb.steps.find((s) => s.id === i.stepId) : null;

    this._stepLogSeq += 1;
    const entry = Object.freeze({
      id: `STP-${pad6(this._stepLogSeq)}`,
      execution_id: exec.id,
      customer_id: exec.customer_id,
      step_id: i.stepId,
      step_label_he: stepDef ? stepDef.label_he : i.stepId,
      step_label_en: stepDef ? stepDef.label_en : i.stepId,
      outcome: typeof i.outcome === 'string' ? i.outcome : 'done',
      notes: typeof i.notes === 'string' ? i.notes : '',
      by: typeof i.by === 'string' ? i.by : 'system',
      at: this._now.toISOString(),
      at_ms: this._now.getTime(),
    });
    this._stepLogs.get(exec.id).push(entry);
    if (entry.outcome === 'done') exec.steps_completed += 1;

    // Mirror into legacy actions store so listActions() still returns data.
    if (exec.legacy_intervention_id) {
      this._actionSeq += 1;
      const legacyAction = Object.freeze({
        id: `ACT-${pad6(this._actionSeq)}`,
        intervention_id: exec.legacy_intervention_id,
        action: `${i.stepId}: ${entry.step_label_en}`,
        outcome: entry.outcome,
        notes: entry.notes,
        by: entry.by,
        date: entry.at,
      });
      const list = this._actions.get(exec.legacy_intervention_id) || [];
      list.push(legacyAction);
      this._actions.set(exec.legacy_intervention_id, list);
    }

    return entry;
  }

  listExecutions(customerId) {
    const out = [];
    for (const exe of this._executions.values()) {
      if (customerId !== undefined && customerId !== null) {
        if (String(exe.customer_id) !== String(customerId)) continue;
      }
      out.push(frozenCopy(exe));
    }
    return out;
  }

  listStepLogs(executionId) {
    const list = this._stepLogs.get(executionId) || [];
    return list.slice();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.5  SAVE OFFERS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * saveOffer({customerId, offer, expiresAt, approvedBy})
   *
   * Records a retention offer. `offer` is either an object
   * `{kind, value, label_he?, label_en?}` or a plain string. `kind` must be
   * one of discount, upgrade, free-period, waiver. `expiresAt` is parsed.
   */
  saveOffer(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('saveOffer: customerId is required');
    }
    if (!i.offer) {
      throw new TypeError('saveOffer: offer is required');
    }
    let kind = 'discount';
    let value = 0;
    let label_he = '';
    let label_en = '';
    if (typeof i.offer === 'string') {
      label_en = i.offer;
      label_he = i.offer;
    } else {
      kind = typeof i.offer.kind === 'string' ? i.offer.kind.toLowerCase() : kind;
      value = safeNumber(i.offer.value, 0);
      label_he = typeof i.offer.label_he === 'string' ? i.offer.label_he : '';
      label_en = typeof i.offer.label_en === 'string' ? i.offer.label_en : '';
    }
    if (OFFER_KINDS.indexOf(kind) === -1) {
      throw new TypeError(
        `saveOffer: offer.kind must be one of ${OFFER_KINDS.join(', ')} (got ${kind})`
      );
    }
    const expires = coerceDate(i.expiresAt);
    this._offerSeq += 1;
    const rec = Object.freeze({
      id: `OFR-${pad6(this._offerSeq)}`,
      customer_id: i.customerId,
      kind,
      value,
      label_he: label_he || defaultOfferLabel(kind, 'he'),
      label_en: label_en || defaultOfferLabel(kind, 'en'),
      approved_by: typeof i.approvedBy === 'string' ? i.approvedBy : 'system',
      created_at: this._now.toISOString(),
      expires_at: expires ? expires.toISOString() : null,
      status: 'offered',
    });
    this._offers.push(rec);
    return rec;
  }

  listOffers(customerId) {
    if (customerId === undefined || customerId === null) return this._offers.slice();
    return this._offers.filter((o) => String(o.customer_id) === String(customerId));
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.6  SAVES vs LOSSES
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * recordSave({customerId, method, notes, outcome})
   *
   * Records a successful retention. `method` describes what worked
   * (e.g. 'discount-20%', 'executive-call'). `outcome` usually mirrors
   * 'saved' but can carry richer state (e.g. 'saved-with-downgrade').
   */
  recordSave(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('recordSave: customerId is required');
    }
    this._saveSeq += 1;
    const rec = Object.freeze({
      id: `SAV-${pad6(this._saveSeq)}`,
      customer_id: i.customerId,
      method: typeof i.method === 'string' ? i.method : '',
      notes: typeof i.notes === 'string' ? i.notes : '',
      outcome: typeof i.outcome === 'string' ? i.outcome : 'saved',
      revenue_saved_ils: safeNumber(i.revenueSaved, 0),
      at: this._now.toISOString(),
    });
    this._saves.push(rec);
    return rec;
  }

  listSaves() {
    return this._saves.slice();
  }

  /**
   * recordLoss({customerId, reason, competitor, totalValueLost})
   *
   * Records a customer we lost. `reason` categorises why; `competitor` names
   * the winner (may be null); `totalValueLost` is the estimated ARR hit.
   */
  recordLoss(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('recordLoss: customerId is required');
    }
    this._lossSeq += 1;
    const rec = Object.freeze({
      id: `LOS-${pad6(this._lossSeq)}`,
      customer_id: i.customerId,
      reason: typeof i.reason === 'string' ? i.reason : 'unspecified',
      competitor: typeof i.competitor === 'string' ? i.competitor : null,
      total_value_lost_ils: safeNumber(i.totalValueLost, 0),
      at: this._now.toISOString(),
    });
    this._losses.push(rec);
    return rec;
  }

  listLosses() {
    return this._losses.slice();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.7  WIN-BACK CAMPAIGNS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * winBackCampaign({segmentId, touchpoints, duration})
   *
   * Defines a re-engagement campaign for already-churned customers in a
   * segment. `touchpoints` is an array of strings describing comm steps.
   * `duration` is days.
   */
  winBackCampaign(input) {
    const i = input || {};
    if (!i.segmentId) {
      throw new TypeError('winBackCampaign: segmentId is required');
    }
    const touchpoints = Array.isArray(i.touchpoints) ? i.touchpoints.slice() : [];
    const duration = safeNumber(i.duration, 30);
    this._winBackSeq += 1;
    const rec = Object.freeze({
      id: `WBC-${pad6(this._winBackSeq)}`,
      segment_id: i.segmentId,
      touchpoints: Object.freeze(touchpoints),
      duration_days: duration,
      status: 'active',
      created_at: this._now.toISOString(),
      ends_at: new Date(this._now.getTime() + duration * MS_PER_DAY).toISOString(),
      message_he: 'התגעגענו אליך — נשמח לחזור ולדבר.',
      message_en: 'We missed you — let\'s reconnect.',
    });
    this._winBackCampaigns.push(rec);
    return rec;
  }

  listWinBackCampaigns() {
    return this._winBackCampaigns.slice();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.8  EXIT INTERVIEW
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * exitInterview({customerId, feedback, rating, wouldReturn})
   *
   * Structured exit feedback. `rating` is 1..5. `wouldReturn` is bool.
   */
  exitInterview(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('exitInterview: customerId is required');
    }
    const rating = clamp(safeNumber(i.rating, 0), 0, 5);
    this._exitSeq += 1;
    const rec = Object.freeze({
      id: `EXI-${pad6(this._exitSeq)}`,
      customer_id: i.customerId,
      feedback: typeof i.feedback === 'string' ? i.feedback : '',
      rating,
      would_return: !!i.wouldReturn,
      at: this._now.toISOString(),
      // Pre-built bilingual question set for the UI
      questions: Object.freeze([
        Object.freeze({ key: 'primary_reason', he: 'מהי הסיבה המרכזית לעזיבה?', en: 'What is the primary reason for leaving?' }),
        Object.freeze({ key: 'improvements',   he: 'מה היינו צריכים לשפר?',        en: 'What should we have improved?' }),
        Object.freeze({ key: 'alternatives',   he: 'לאיזה פתרון אתם עוברים?',     en: 'What solution are you moving to?' }),
        Object.freeze({ key: 'positives',      he: 'מה אהבת אצלנו?',              en: 'What did you enjoy about us?' }),
        Object.freeze({ key: 'return',         he: 'האם תשקול לחזור בעתיד?',       en: 'Would you consider returning in the future?' }),
        Object.freeze({ key: 'recommendation', he: 'האם תמליץ עלינו לאחרים?',     en: 'Would you recommend us to others?' }),
      ]),
    });
    this._exitInterviews.push(rec);
    return rec;
  }

  listExitInterviews() {
    return this._exitInterviews.slice();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.9  RETENTION METRICS  (save rate, ROI, top reasons)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * retentionMetrics({period?}) → aggregated KPIs.
   */
  retentionMetrics(opts) {
    const period = normalisePeriod(opts && opts.period);
    const savesIn = this._saves.filter((s) => inPeriod(s.at, period));
    const lossesIn = this._losses.filter((l) => inPeriod(l.at, period));
    const offersIn = this._offers.filter((o) => inPeriod(o.created_at, period));
    const execsIn = [];
    for (const e of this._executions.values()) {
      if (inPeriod(e.opened_at, period)) execsIn.push(e);
    }

    const totalAttempts = savesIn.length + lossesIn.length;
    const saveRatePct = totalAttempts === 0 ? 0 : round2((savesIn.length / totalAttempts) * 100);

    const revenueSaved = savesIn.reduce((acc, s) => acc + (s.revenue_saved_ils || 0), 0);
    const revenueLost = lossesIn.reduce((acc, l) => acc + (l.total_value_lost_ils || 0), 0);
    const costByExec = execsIn.reduce((acc, e) => acc + (INTERVENTION_COST_ILS[e.severity] || 0), 0);

    const netROI = revenueSaved - costByExec;
    const roiPct = costByExec === 0 ? 0 : round2((netROI / costByExec) * 100);

    // Top loss reasons
    const reasonCounts = {};
    for (const l of lossesIn) {
      reasonCounts[l.reason] = (reasonCounts[l.reason] || 0) + 1;
    }
    const topLossReasons = Object.keys(reasonCounts)
      .map((k) => ({ reason: k, count: reasonCounts[k] }))
      .sort((a, b) => b.count - a.count);

    return frozenCopy({
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      total_attempts: totalAttempts,
      saves: savesIn.length,
      losses: lossesIn.length,
      save_rate_pct: saveRatePct,
      revenue_saved_ils: revenueSaved,
      revenue_lost_ils: revenueLost,
      offers_made: offersIn.length,
      executions_opened: execsIn.length,
      cost_ils: costByExec,
      net_ils: netROI,
      roi_pct: roiPct,
      top_loss_reasons: topLossReasons,
      labels: {
        he: {
          save_rate: 'אחוז הצלה',
          revenue_saved: 'הכנסה שנשמרה',
          revenue_lost: 'הכנסה שאבדה',
          roi: 'תשואה על ההשקעה',
          top_loss_reasons: 'סיבות אובדן עיקריות',
        },
        en: {
          save_rate: 'Save Rate',
          revenue_saved: 'Revenue Saved',
          revenue_lost: 'Revenue Lost',
          roi: 'Return on Investment',
          top_loss_reasons: 'Top Loss Reasons',
        },
      },
    });
  }

  topLossReasons() {
    return this.retentionMetrics({}).top_loss_reasons;
  }

  campaignROI() {
    const m = this.retentionMetrics({});
    return {
      cost_ils: m.cost_ils,
      revenue_saved_ils: m.revenue_saved_ils,
      net_ils: m.net_ils,
      roi_pct: m.roi_pct,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.10  CLOSE THE LOOP
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * closeLoop(customerId, status) → saved|churned|pending
   *
   * Records the terminal status for a customer's retention effort. Never
   * overwrites — appends to a history so earlier states are preserved.
   * Returns the latest loop record.
   */
  closeLoop(customerId, status) {
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('closeLoop: customerId is required');
    }
    const st = typeof status === 'string' ? status.toLowerCase().trim() : '';
    if (LOOP_STATES.indexOf(st) === -1) {
      throw new TypeError(
        `closeLoop: status must be one of ${LOOP_STATES.join(', ')} (got ${status})`
      );
    }
    this._loopSeq += 1;
    const rec = Object.freeze({
      id: `LOP-${pad6(this._loopSeq)}`,
      customer_id: customerId,
      status: st,
      at: this._now.toISOString(),
    });
    this._loopHistory.push(rec);

    // Best-effort: also close any open legacy intervention for this customer.
    for (const iv of this._interventions.values()) {
      if (
        String(iv.customer_id) === String(customerId) &&
        iv.status === 'open'
      ) {
        const legacyOutcome = st === 'saved' ? 'saved' : st === 'churned' ? 'churned' : null;
        if (legacyOutcome) {
          iv.status = 'closed';
          iv.outcome = legacyOutcome;
          iv.closed_at = this._now.toISOString();
        }
      }
    }
    for (const exe of this._executions.values()) {
      if (
        String(exe.customer_id) === String(customerId) &&
        exe.status === 'open'
      ) {
        if (st === 'saved' || st === 'churned') {
          exe.status = 'closed';
          exe.outcome = st;
          exe.closed_at = this._now.toISOString();
        }
      }
    }

    return rec;
  }

  /**
   * customerStatus(customerId) → latest closed-loop record or 'pending'.
   */
  customerStatus(customerId) {
    for (let i = this._loopHistory.length - 1; i >= 0; i--) {
      const r = this._loopHistory[i];
      if (String(r.customer_id) === String(customerId)) return r;
    }
    return Object.freeze({ customer_id: customerId, status: 'pending', at: null });
  }

  loopHistory(customerId) {
    if (customerId === undefined || customerId === null) {
      return this._loopHistory.slice();
    }
    return this._loopHistory.filter(
      (r) => String(r.customer_id) === String(customerId)
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.11  LEGACY API  (preserved — all original methods)
  // ═════════════════════════════════════════════════════════════════════════

  /** Legacy defineSignals({signals:[...]}) */
  defineSignals(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('defineSignals: spec must be an object');
    }
    const list = Array.isArray(spec.signals) ? spec.signals : [];
    const registered = [];
    for (const s of list) {
      if (!s || typeof s.name !== 'string' || s.name.trim() === '') continue;
      const name = s.name.trim();
      const existing = this._signalCatalog.get(name) || {};
      const def = {
        name,
        source: typeof s.source === 'string' && s.source ? s.source : existing.source || 'system',
        trigger: typeof s.trigger === 'string' && s.trigger ? s.trigger : existing.trigger || 'auto',
        severity: normaliseSeverity(
          s.severity || existing.severity || DEFAULT_SIGNAL_SEVERITY[name] || 'low'
        ),
        label_he: typeof s.label_he === 'string' ? s.label_he : existing.label_he || this._defaultHeLabel(name),
        label_en: typeof s.label_en === 'string' ? s.label_en : existing.label_en || this._defaultEnLabel(name),
        registered_at: existing.registered_at || this._now.toISOString(),
        updated_at: this._now.toISOString(),
      };
      this._signalCatalog.set(name, def);
      registered.push(def);
    }
    return registered.map(frozenCopy);
  }

  _defaultHeLabel(name) {
    const map = {
      ticket_spike: 'זינוק בפניות שירות',
      payment_missed: 'תשלום שלא בוצע',
      key_contact_left: 'איש קשר מפתח עזב',
      usage_drop: 'ירידה בשימוש',
      feature_complaint: 'תלונה על פיצ׳ר',
      competitor_mention: 'אזכור מתחרה',
      contract_renewal_at_risk: 'חוזה בסיכון חידוש',
      nps_detractor: 'לקוח NPS שלילי',
      sla_breach: 'הפרת SLA',
      billing_dispute: 'מחלוקת חיוב',
    };
    return map[name] || name;
  }

  _defaultEnLabel(name) {
    return name
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  listSignalCatalog() {
    const out = [];
    for (const def of this._signalCatalog.values()) out.push(frozenCopy(def));
    return out;
  }

  /** Legacy recordSignal({customerId, name, source, payload, at}) */
  recordSignal(input) {
    const i = input || {};
    const customerId = i.customerId;
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('recordSignal: customerId is required');
    }
    if (typeof i.name !== 'string' || i.name.trim() === '') {
      throw new TypeError('recordSignal: name is required');
    }
    const name = i.name.trim();
    let def = this._signalCatalog.get(name);
    if (!def) {
      this.defineSignals({
        signals: [{
          name,
          source: i.source || 'ad_hoc',
          trigger: 'manual',
          severity: i.severity || DEFAULT_SIGNAL_SEVERITY[name] || 'low',
        }],
      });
      def = this._signalCatalog.get(name);
    }
    const atDate = coerceDate(i.at) || this._now;
    this._signalSeq += 1;
    const event = {
      id: `SIG-${pad6(this._signalSeq)}`,
      customer_id: customerId,
      type: name, // new alias
      name,
      source: i.source || def.source,
      severity: normaliseSeverity(i.severity || def.severity),
      payload: i.payload !== undefined ? i.payload : null,
      value: i.payload !== undefined ? i.payload : null, // new alias
      at: atDate.toISOString(),
      at_ms: atDate.getTime(),
      label_he: def.label_he,
      label_en: def.label_en,
    };
    this._signalEvents.push(Object.freeze(event));
    return frozenCopy(event);
  }

  /** Legacy monitorCustomer(customerId) */
  monitorCustomer(customerId) {
    if (customerId === undefined || customerId === null || customerId === '') {
      throw new TypeError('monitorCustomer: customerId is required');
    }
    const events = this._signalEvents
      .filter((e) => String(e.customer_id) === String(customerId))
      .slice()
      .sort((a, b) => b.at_ms - a.at_ms);
    const open = [];
    const closed = [];
    for (const iv of this._interventions.values()) {
      if (String(iv.customer_id) !== String(customerId)) continue;
      if (iv.status === 'open') open.push(frozenCopy(iv));
      else closed.push(frozenCopy(iv));
    }
    return {
      customer_id: customerId,
      total_signals: events.length,
      last_signal_at: events.length > 0 ? events[0].at : null,
      signals: events.map((e) => frozenCopy(e)),
      open_interventions: open,
      closed_interventions: closed,
      risk_score: this._customerRiskScore(customerId),
    };
  }

  /** Legacy per-customer risk score used by monitorCustomer / detectAtRisk. */
  _customerRiskScore(customerId) {
    const events = this._signalEvents.filter(
      (e) => String(e.customer_id) === String(customerId)
    );
    let score = 0;
    const severities = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const e of events) {
      const s = e.severity;
      const w = SEVERITY_WEIGHT[s] || 0;
      score += w;
      severities[s] = (severities[s] || 0) + 1;
    }
    return {
      customer_id: customerId,
      score,
      level: scoreToLegacyLevel(score),
      severities,
      signal_count: events.length,
    };
  }

  /** Legacy detectAtRisk({period}) */
  detectAtRisk(opts) {
    const period = normalisePeriod(opts && opts.period);
    const byCustomer = new Map();
    for (const e of this._signalEvents) {
      if (!inPeriod(e.at, { from: period.from, to: period.to })) continue;
      let bucket = byCustomer.get(String(e.customer_id));
      if (!bucket) {
        bucket = {
          customer_id: e.customer_id,
          score: 0,
          severities: { low: 0, medium: 0, high: 0, critical: 0 },
          signals: [],
          last_signal_at: e.at,
          last_signal_ms: e.at_ms,
        };
        byCustomer.set(String(e.customer_id), bucket);
      }
      const sev = normaliseSeverity(e.severity);
      bucket.score += SEVERITY_WEIGHT[sev] || 0;
      bucket.severities[sev] += 1;
      bucket.signals.push({
        id: e.id,
        name: e.name || e.type,
        severity: sev,
        at: e.at,
      });
      if (e.at_ms > bucket.last_signal_ms) {
        bucket.last_signal_at = e.at;
        bucket.last_signal_ms = e.at_ms;
      }
    }
    const out = [];
    for (const b of byCustomer.values()) {
      out.push({
        customer_id: b.customer_id,
        score: b.score,
        risk_level: scoreToLegacyLevel(b.score),
        severities: b.severities,
        signal_count: b.signals.length,
        signals: b.signals,
        last_signal_at: b.last_signal_at,
      });
    }
    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.last_signal_at < a.last_signal_at ? 1 : -1;
    });
    return out.map(frozenCopy);
  }

  /** Legacy interventionPlaybook({riskLevel}) */
  interventionPlaybook(opts) {
    const raw = opts && typeof opts.riskLevel === 'string'
      ? opts.riskLevel.toLowerCase().trim()
      : 'medium';
    let level;
    if (raw === 'med') level = 'medium';
    else if (raw === 'crit') level = 'critical';
    else if (SEVERITY_LEVELS.indexOf(raw) !== -1) level = raw;
    else level = 'medium'; // unknown falls back to medium
    return frozenCopy(PLAYBOOK[level] || PLAYBOOK.medium);
  }

  /** Legacy openIntervention({customerId, severity, reason, owner}) */
  openIntervention(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('openIntervention: customerId is required');
    }
    const severity = normaliseSeverity(i.severity || 'medium');
    const playbook = PLAYBOOK[severity];
    this._interventionSeq += 1;
    const id = `ITV-${pad6(this._interventionSeq)}`;
    const dueAt = new Date(this._now.getTime() + playbook.sla_hours * MS_PER_HOUR);
    const iv = {
      id,
      customer_id: i.customerId,
      severity,
      reason: typeof i.reason === 'string' ? i.reason : '',
      owner: typeof i.owner === 'string' ? i.owner : playbook.owner_role,
      status: 'open',
      opened_at: this._now.toISOString(),
      due_at: dueAt.toISOString(),
      playbook_key: playbook.key,
      playbook_label_he: playbook.label_he,
      playbook_label_en: playbook.label_en,
      cost_ils: INTERVENTION_COST_ILS[severity] || 0,
      closed_at: null,
      outcome: null,
      revenue_saved_ils: 0,
    };
    this._interventions.set(id, iv);
    this._actions.set(id, []);
    return frozenCopy(iv);
  }

  /** Legacy recordAction({interventionId, action, outcome, date, notes}) */
  recordAction(input) {
    const i = input || {};
    if (!i.interventionId) {
      throw new TypeError('recordAction: interventionId is required');
    }
    const iv = this._interventions.get(i.interventionId);
    if (!iv) throw new Error(`recordAction: unknown intervention ${i.interventionId}`);
    if (iv.status !== 'open') {
      throw new Error(`recordAction: intervention ${iv.id} is closed`);
    }
    if (typeof i.action !== 'string' || i.action.trim() === '') {
      throw new TypeError('recordAction: action is required');
    }
    this._actionSeq += 1;
    const dateIso = coerceDate(i.date)
      ? coerceDate(i.date).toISOString()
      : this._now.toISOString();
    const rec = {
      id: `ACT-${pad6(this._actionSeq)}`,
      intervention_id: iv.id,
      action: i.action,
      outcome: typeof i.outcome === 'string' ? i.outcome : 'pending',
      notes: typeof i.notes === 'string' ? i.notes : '',
      date: dateIso,
    };
    const list = this._actions.get(iv.id) || [];
    list.push(rec);
    this._actions.set(iv.id, list);
    return frozenCopy(rec);
  }

  listActions(interventionId) {
    const list = this._actions.get(interventionId) || [];
    return list.map(frozenCopy);
  }

  /** Legacy closeIntervention({interventionId, outcome, revenueSaved, notes}) */
  closeIntervention(input) {
    const i = input || {};
    if (!i.interventionId) {
      throw new TypeError('closeIntervention: interventionId is required');
    }
    const iv = this._interventions.get(i.interventionId);
    if (!iv) throw new Error(`closeIntervention: unknown intervention ${i.interventionId}`);
    if (iv.status !== 'open') {
      throw new Error(`closeIntervention: ${iv.id} already closed`);
    }
    const outcome = typeof i.outcome === 'string' ? i.outcome.toLowerCase() : '';
    if (CLOSE_OUTCOMES.indexOf(outcome) === -1) {
      throw new TypeError(
        `closeIntervention: outcome must be one of ${CLOSE_OUTCOMES.join(', ')}`
      );
    }
    iv.status = 'closed';
    iv.outcome = outcome;
    iv.closed_at = this._now.toISOString();
    iv.closed_notes = typeof i.notes === 'string' ? i.notes : '';
    iv.revenue_saved_ils =
      outcome === 'saved' ? safeNumber(i.revenueSaved, 0) : 0;
    return frozenCopy(iv);
  }

  getIntervention(id) {
    const iv = this._interventions.get(id);
    return iv ? frozenCopy(iv) : null;
  }

  listInterventions(opts) {
    const status = opts && typeof opts.status === 'string' ? opts.status : null;
    const out = [];
    for (const iv of this._interventions.values()) {
      if (status && iv.status !== status) continue;
      out.push(frozenCopy(iv));
    }
    return out;
  }

  /** Legacy saveRate() */
  saveRate() {
    const counts = { saved: 0, churned: 0, downgraded: 0, escalated: 0 };
    let total = 0;
    for (const iv of this._interventions.values()) {
      if (iv.status !== 'closed') continue;
      total += 1;
      if (counts[iv.outcome] !== undefined) counts[iv.outcome] += 1;
    }
    const saved = counts.saved;
    const rate = total === 0 ? 0 : round2((saved / total) * 100);
    return {
      total,
      saved,
      rate_pct: rate,
      counts_by_outcome: counts,
    };
  }

  /** Legacy preventionROI() */
  preventionROI() {
    let cost = 0;
    let revSaved = 0;
    let closed = 0;
    let savedCount = 0;
    const perSevCost = { low: 0, medium: 0, high: 0, critical: 0 };
    const perSevSaved = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const iv of this._interventions.values()) {
      if (iv.status !== 'closed') continue;
      closed += 1;
      cost += iv.cost_ils || 0;
      perSevCost[iv.severity] = (perSevCost[iv.severity] || 0) + (iv.cost_ils || 0);
      if (iv.outcome === 'saved') {
        savedCount += 1;
        revSaved += iv.revenue_saved_ils || 0;
        perSevSaved[iv.severity] =
          (perSevSaved[iv.severity] || 0) + (iv.revenue_saved_ils || 0);
      }
    }
    const net = revSaved - cost;
    const roi = cost === 0 ? 0 : round2((net / cost) * 100);
    return {
      closed_count: closed,
      saved_count: savedCount,
      revenue_saved_ils: revSaved,
      cost_ils: cost,
      net_ils: net,
      roi_pct: roi,
      per_severity_cost: perSevCost,
      per_severity_saved: perSevSaved,
    };
  }

  /** Legacy winBack({customerId, reason, offer, offerValue}) */
  winBack(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('winBack: customerId is required');
    }
    this._winBackSeq += 1;
    const rec = {
      id: `WB-${pad6(this._winBackSeq)}`,
      customer_id: i.customerId,
      reason: typeof i.reason === 'string' ? i.reason : '',
      offer: typeof i.offer === 'string' ? i.offer : '',
      offer_value_ils: safeNumber(i.offerValue, 0),
      status: 'open',
      created_at: this._now.toISOString(),
      message_he: `התגעגענו אליך ${String(i.customerId)} — נשמח לחזור ולדבר.`,
      message_en: `We missed you ${String(i.customerId)} — let's reconnect.`,
    };
    this._winBacks.push(rec);
    return frozenCopy(rec);
  }

  listWinBacks() {
    return this._winBacks.map(frozenCopy);
  }

  /** Legacy churnDebriefing(customerId, answers?) */
  churnDebriefing(customerId, answers) {
    const questions = [
      { key: 'primary_reason',  he: 'מהי הסיבה המרכזית לעזיבה?',  en: 'Primary reason for leaving?' },
      { key: 'improvements',    he: 'מה היינו צריכים לשפר?',         en: 'What should we have improved?' },
      { key: 'alternatives',    he: 'לאיזה פתרון אתם עוברים?',      en: 'What alternative are you moving to?' },
      { key: 'positives',       he: 'מה אהבת אצלנו?',                en: 'What did you enjoy?' },
      { key: 'would_return',    he: 'האם תחזור בעתיד?',               en: 'Would you return in the future?' },
      { key: 'recommendation',  he: 'האם תמליץ עלינו לאחרים?',       en: 'Would you recommend us?' },
    ];
    const tmpl = {
      customer_id: customerId,
      title_he: 'תחקיר פרידה',
      title_en: 'Exit Debrief',
      questions,
    };
    if (answers && typeof answers === 'object') {
      this._debriefSeq += 1;
      const record = {
        record_id: `DBR-${pad6(this._debriefSeq)}`,
        customer_id: customerId,
        answers: Object.assign({}, answers),
        at: this._now.toISOString(),
      };
      this._debriefs.push(record);
      return frozenCopy(Object.assign({}, tmpl, { record_id: record.record_id }));
    }
    return frozenCopy(tmpl);
  }

  listDebriefs() {
    return this._debriefs.map(frozenCopy);
  }

  /** Legacy alertExecutive({customerId, severity, note}) */
  alertExecutive(input) {
    const i = input || {};
    if (!i.customerId) {
      throw new TypeError('alertExecutive: customerId is required');
    }
    const severity = normaliseSeverity(i.severity || 'high');
    this._executiveAlertSeq += 1;
    const pb = PLAYBOOK[severity];
    const sevLabel = (GLOSSARY['severity_' + severity] || GLOSSARY.severity_high);
    const alert = {
      id: `EXE-${pad6(this._executiveAlertSeq)}`,
      customer_id: i.customerId,
      severity,
      note: typeof i.note === 'string' ? i.note : '',
      subject_he: `התראה קריטית על לקוח ${i.customerId}`,
      subject_en: `Critical customer alert: ${i.customerId}`,
      body_he: `חומרה: ${sevLabel.he}. פעולה: ${pb.label_he}. הערה: ${i.note || ''}`,
      body_en: `Severity: ${severity}. Action: ${pb.label_en}. Note: ${i.note || ''}`,
      to_role: ['ceo', 'vp_success'],
      at: this._now.toISOString(),
    };
    this._executiveAlerts.push(alert);
    return frozenCopy(alert);
  }

  listExecutiveAlerts() {
    return this._executiveAlerts.map(frozenCopy);
  }

  /** Legacy communicateToTeam(interventionId) */
  communicateToTeam(interventionId) {
    const iv = this._interventions.get(interventionId);
    if (!iv) throw new Error(`communicateToTeam: unknown intervention ${interventionId}`);
    const msg = {
      intervention_id: iv.id,
      customer_id: iv.customer_id,
      subject_he: `פלייבוק חדש לטיפול — ${iv.id}`,
      subject_en: `New playbook to action — ${iv.id}`,
      body_he:
        `פלייבוק: ${iv.playbook_label_he}\n` +
        `אחראי: ${iv.owner}\n` +
        `מועד יעד: ${iv.due_at}\n` +
        `סיבה: ${iv.reason}`,
      body_en:
        `Playbook: ${iv.playbook_label_en}\n` +
        `Owner: ${iv.owner}\n` +
        `Due: ${iv.due_at}\n` +
        `Reason: ${iv.reason}`,
      at: this._now.toISOString(),
    };
    return frozenCopy(msg);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3.12  EXPORT / IMPORT  (round-trippable JSON snapshot)
  // ═════════════════════════════════════════════════════════════════════════

  exportJson() {
    return {
      now: this._now.toISOString(),
      playbooks: Array.from(this._playbooks.values()),
      signal_catalog: Array.from(this._signalCatalog.values()),
      signal_events: this._signalEvents.slice(),
      executions: Array.from(this._executions.values()),
      step_logs: Array.from(this._stepLogs.entries()).map(([k, v]) => ({ id: k, logs: v.slice() })),
      offers: this._offers.slice(),
      saves: this._saves.slice(),
      losses: this._losses.slice(),
      win_back_campaigns: this._winBackCampaigns.slice(),
      exit_interviews: this._exitInterviews.slice(),
      loop_history: this._loopHistory.slice(),
      interventions: Array.from(this._interventions.values()),
      actions: Array.from(this._actions.entries()).map(([k, v]) => ({ id: k, actions: v.slice() })),
      win_backs: this._winBacks.slice(),
      debriefs: this._debriefs.slice(),
      executive_alerts: this._executiveAlerts.slice(),
      seqs: {
        signal: this._signalSeq,
        execution: this._executionSeq,
        step: this._stepLogSeq,
        offer: this._offerSeq,
        save: this._saveSeq,
        loss: this._lossSeq,
        win_back: this._winBackSeq,
        exit: this._exitSeq,
        loop: this._loopSeq,
        intervention: this._interventionSeq,
        action: this._actionSeq,
        debrief: this._debriefSeq,
        executive_alert: this._executiveAlertSeq,
      },
    };
  }

  importJson(snap) {
    if (!snap || typeof snap !== 'object') {
      throw new TypeError('importJson: snapshot must be an object');
    }
    this._now = coerceDate(snap.now) || this._now;
    this._playbooks.clear();
    for (const p of snap.playbooks || []) this._playbooks.set(p.id, p);
    this._signalCatalog.clear();
    for (const s of snap.signal_catalog || []) this._signalCatalog.set(s.name, s);
    this._signalEvents = (snap.signal_events || []).map((e) => Object.freeze(Object.assign({}, e)));
    this._executions.clear();
    for (const e of snap.executions || []) this._executions.set(e.id, Object.assign({}, e));
    this._stepLogs.clear();
    for (const row of snap.step_logs || []) this._stepLogs.set(row.id, row.logs.slice());
    this._offers = (snap.offers || []).slice();
    this._saves = (snap.saves || []).slice();
    this._losses = (snap.losses || []).slice();
    this._winBackCampaigns = (snap.win_back_campaigns || []).slice();
    this._exitInterviews = (snap.exit_interviews || []).slice();
    this._loopHistory = (snap.loop_history || []).slice();
    this._interventions.clear();
    for (const iv of snap.interventions || []) this._interventions.set(iv.id, Object.assign({}, iv));
    this._actions.clear();
    for (const row of snap.actions || []) this._actions.set(row.id, row.actions.slice());
    this._winBacks = (snap.win_backs || []).slice();
    this._debriefs = (snap.debriefs || []).slice();
    this._executiveAlerts = (snap.executive_alerts || []).slice();
    const seqs = snap.seqs || {};
    this._signalSeq = seqs.signal || 0;
    this._executionSeq = seqs.execution || 0;
    this._stepLogSeq = seqs.step || 0;
    this._offerSeq = seqs.offer || 0;
    this._saveSeq = seqs.save || 0;
    this._lossSeq = seqs.loss || 0;
    this._winBackSeq = seqs.win_back || 0;
    this._exitSeq = seqs.exit || 0;
    this._loopSeq = seqs.loop || 0;
    this._interventionSeq = seqs.intervention || 0;
    this._actionSeq = seqs.action || 0;
    this._debriefSeq = seqs.debrief || 0;
    this._executiveAlertSeq = seqs.executive_alert || 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. MODULE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function scoreToLevel(score) {
  const s = clamp(safeNumber(score, 0), 0, 100);
  if (s >= 80) return 'critical';
  if (s >= 60) return 'high';
  if (s >= 30) return 'medium';
  if (s > 0) return 'low';
  return 'none';
}

function scoreToLegacyLevel(score) {
  // Legacy detectAtRisk maps raw SEVERITY_WEIGHT totals to a level name.
  if (score >= SEVERITY_WEIGHT.critical) return 'critical';
  if (score >= SEVERITY_WEIGHT.high) return 'high';
  if (score >= SEVERITY_WEIGHT.medium) return 'medium';
  if (score >= SEVERITY_WEIGHT.low) return 'low';
  return 'none';
}

function defaultOfferLabel(kind, lang) {
  const map = {
    discount: { he: 'הנחה על חידוש', en: 'Renewal discount' },
    upgrade: { he: 'שדרוג חינם', en: 'Free upgrade' },
    'free-period': { he: 'תקופת חינם', en: 'Free period' },
    waiver: { he: 'ויתור על חיובים', en: 'Fee waiver' },
  };
  const bucket = map[kind] || { he: kind, en: kind };
  return lang === 'he' ? bucket.he : bucket.en;
}

// Helpers for default playbook labels (used in definePlaybook fallback)
function def_label_he_for(trigger) {
  const map = {
    'health-score-drop': 'החייאת ציון בריאות',
    'nps-detractor': 'המרת NPS שלילי',
    'payment-late': 'טיפול בתשלום באיחור',
    'support-escalation': 'הסלמת תמיכה',
    'contract-end-approaching': 'חידוש חוזה',
    'usage-decline': 'החייאת שימוש',
    'contact-change': 'החלפת איש קשר',
  };
  return map[trigger] || trigger;
}

function def_label_en_for(trigger) {
  const map = {
    'health-score-drop': 'Health Score Recovery',
    'nps-detractor': 'NPS Detractor Conversion',
    'payment-late': 'Late Payment Handling',
    'support-escalation': 'Support Escalation',
    'contract-end-approaching': 'Contract Renewal',
    'usage-decline': 'Usage Revival',
    'contact-change': 'Contact Change',
  };
  return map[trigger] || trigger;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ChurnPrevention,
  // New API constants
  TRIGGERS,
  TRIGGER_SEVERITY,
  DEFAULT_PLAYBOOKS,
  LOOP_STATES,
  OFFER_KINDS,
  // Legacy constants — preserved
  PLAYBOOK,
  SEVERITY_WEIGHT,
  SEVERITY_LEVELS,
  CLOSE_OUTCOMES,
  INTERVENTION_COST_ILS,
  DEFAULT_SIGNAL_SEVERITY,
  GLOSSARY,
  // Pure helpers
  clamp,
  round2,
  scoreToLevel,
  scoreToLegacyLevel,
  normaliseSeverity,
  normaliseTrigger,
  coerceDate,
  safeNumber,
  inPeriod,
};
