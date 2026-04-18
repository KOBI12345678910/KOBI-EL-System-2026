/**
 * call-log.js — Agent Y-124 (Swarm — Mega-ERP Techno-Kol Uzi)
 * Voice Call Logging System (PBX / CRM integration layer)
 *
 * מערכת תיעוד שיחות טלפון — ל-CRM ול-PBX
 * ---------------------------------------------------
 *  - recordCall()              — log an inbound/outbound voice call
 *  - linkToCustomer() / linkToOpportunity() / linkToTicket()
 *  - callSummary()             — volume / avg duration / answer rate
 *  - dispositionCodes (CRUD)   — configurable outcome taxonomy
 *  - followUpTasks()           — auto-task creation from a call
 *  - missedCallHandling()      — automatic callback workflow
 *  - callBackQueue()           — prioritised callback queue
 *  - pbxIntegration()          — generic PBX adapter (3cx / asterisk /
 *                                mitel / cloud-pbx) — mockable, pluggable
 *  - callRoutingRules()        — per-customer routing (e.g. VIP → agent)
 *  - silentListen()            — supervisor silent monitor (with legal
 *                                disclosure flag, Israeli law)
 *  - recordingLinkage()        — link to recording URL (Y-125 bridge)
 *  - searchCalls()             — text / date / agent / customer search
 *
 *  House rule: לא מוחקים — רק משדרגים ומגדלים.
 *  No call, link, disposition, follow-up, queue item, rule or
 *  recording entry is EVER removed. Supersession and status flips
 *  are recorded as appended history events; the underlying record
 *  is never mutated in place.
 *
 *  Zero external dependencies. Pure CommonJS, node >=14.
 *
 *  ───────────────────────────────────────────────────────────────
 *  ISRAELI LAW — call recording & silent monitoring
 *  ───────────────────────────────────────────────────────────────
 *
 *  This module DOES NOT record audio. It only stores metadata and
 *  links to recordings produced by the PBX (the actual recording
 *  subsystem lives in Y-125). But the workflows here trigger the
 *  recording and monitoring features, so the legal surface is ours.
 *
 *  Israeli legal framework:
 *
 *  1. חוק האזנת סתר, התשל"ט-1979  (Wiretap Act, 1979).
 *     Intercepting a conversation BETWEEN OTHER PARTIES without a
 *     court order or consent of at least one participant is a
 *     criminal offence.
 *
 *  2. However, **one-party consent** is permitted when one of the
 *     parties to the call is aware of and consents to the recording.
 *     In a business context, if the company is a party to the call
 *     (via its agent/employee) and the agent is aware, the company
 *     may lawfully record the call even without the external party's
 *     explicit consent — BUT the Ministry of Justice's guidance and
 *     the Privacy Protection Authority strongly recommend disclosure
 *     to the other party ("השיחה מוקלטת לצרכי בקרת איכות ושירות").
 *
 *  3. Privacy Protection Law 1981 (חוק הגנת הפרטיות, התשמ"א-1981)
 *     and the Privacy Protection Regulations (Information Security)
 *     2017 treat call recordings as "sensitive personal information"
 *     under Database Registration Class B — the recording store MUST
 *     be registered, access-controlled, and retention-scheduled.
 *
 *  4. **Silent monitoring** by a supervisor (silentListen) while the
 *     call is in progress is treated by Israeli practice as an
 *     additional party joining the call. It is lawful only if EITHER:
 *        (a) the agent is aware that monitoring may occur at any time
 *            (disclosed in the employment contract or a separate
 *             "monitoring policy" acknowledgement), OR
 *        (b) the supervisor is silent and the call was already
 *            disclosed-as-recorded to the customer at the IVR stage.
 *     This module enforces a `disclosureRequired` flag that MUST be
 *     true before silentListen() accepts the monitor request, unless
 *     `lawfulBasis: 'employment-contract'` is explicitly supplied.
 *
 *  5. Retention: the Privacy Protection Authority recommends NOT
 *     keeping call recordings longer than the business purpose
 *     requires. Common practice: 12 months for quality assurance,
 *     up to 7 years if the recording underpins a legally binding
 *     transaction (under הוראות ניהול ספרים / bookkeeping rules).
 *     This module exposes `recordingLinkage({retentionDays})` so
 *     the recording subsystem can schedule deletion — but deletion
 *     happens in Y-125, NOT here; this module only tracks the pointer.
 *
 *  The module surfaces these constraints via:
 *
 *    - DISCLOSURE_NOTICE_HE / DISCLOSURE_NOTICE_EN  (ready-to-play IVR text)
 *    - silentListen() legal gate
 *    - recordingLinkage() retention + legal-basis fields
 *    - callSummary() never exposes the recording audio, only counts
 *
 *  ───────────────────────────────────────────────────────────────
 *  Data model (in-memory, JSON-serializable)
 *  ───────────────────────────────────────────────────────────────
 *
 *  Call:
 *    { callId, from, to, direction, startTime, endTime, duration,
 *      outcome, agent, customerId, opportunityId, ticketId, notes,
 *      tags:[], recording:{url,retentionDays,lawfulBasis,linkedAt},
 *      createdAt, status:'logged'|'superseded',
 *      history:[{at,event,by,details}] }
 *
 *  Disposition:
 *    { code, labelHe, labelEn, category, terminal, active, createdAt }
 *
 *  FollowUp:
 *    { id, callId, dueDate, description, assignee, status, createdAt,
 *      history:[...] }
 *
 *  QueueItem:
 *    { id, callId, priority, reason, enqueuedAt, attempts, status,
 *      history:[...] }
 *
 *  RoutingRule:
 *    { id, customerId, rules, active, createdAt, history:[...] }
 *
 *  MonitorSession:
 *    { id, callId, supervisor, startedAt, endedAt, lawfulBasis,
 *      disclosed, active, createdAt }
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  Constants / enums
// ─────────────────────────────────────────────────────────────

const DIRECTIONS = Object.freeze(['inbound', 'outbound']);

const DIRECTIONS_HE = Object.freeze({
  inbound: 'שיחה נכנסת',
  outbound: 'שיחה יוצאת',
});

const PBX_PROVIDERS = Object.freeze(['3cx', 'asterisk', 'mitel', 'cloud-pbx']);

const PBX_PROVIDERS_HE = Object.freeze({
  '3cx': 'מרכזיית 3CX',
  'asterisk': 'מרכזיית Asterisk (קוד פתוח)',
  'mitel': 'מרכזיית Mitel',
  'cloud-pbx': 'מרכזייה בענן',
});

// Default disposition taxonomy (outcome codes).
// Keys match the codes; categories used by aggregation (connected/
// unconnected/closed/business). `terminal=true` marks a code that ends
// the call lifecycle (no follow-up auto-expected).
const DEFAULT_DISPOSITIONS = Object.freeze([
  {
    code: 'no-answer',
    labelHe: 'לא ענה',
    labelEn: 'No answer',
    category: 'unconnected',
    terminal: false,
  },
  {
    code: 'successful',
    labelHe: 'שיחה מוצלחת',
    labelEn: 'Successful conversation',
    category: 'connected',
    terminal: false,
  },
  {
    code: 'callback',
    labelHe: 'בקשה לחזור',
    labelEn: 'Customer asked for callback',
    category: 'connected',
    terminal: false,
  },
  {
    code: 'quote-sent',
    labelHe: 'הצעה נשלחה',
    labelEn: 'Quote / proposal sent',
    category: 'business',
    terminal: false,
  },
  {
    code: 'deal-won',
    labelHe: 'סגירת עסקה',
    labelEn: 'Deal won',
    category: 'business',
    terminal: true,
  },
  // Extended but still covered by the core taxonomy
  {
    code: 'voicemail',
    labelHe: 'הושאר מסר בתא קולי',
    labelEn: 'Left voicemail',
    category: 'unconnected',
    terminal: false,
  },
  {
    code: 'wrong-number',
    labelHe: 'מספר שגוי',
    labelEn: 'Wrong number',
    category: 'unconnected',
    terminal: true,
  },
  {
    code: 'busy',
    labelHe: 'קו תפוס',
    labelEn: 'Busy',
    category: 'unconnected',
    terminal: false,
  },
  {
    code: 'not-interested',
    labelHe: 'לא מעוניין',
    labelEn: 'Not interested',
    category: 'connected',
    terminal: true,
  },
  {
    code: 'escalated',
    labelHe: 'הועבר לממונה',
    labelEn: 'Escalated to supervisor',
    category: 'connected',
    terminal: false,
  },
]);

const DISPOSITION_CATEGORIES = Object.freeze([
  'unconnected',
  'connected',
  'business',
]);

const DISPOSITION_CATEGORIES_HE = Object.freeze({
  unconnected: 'לא התחברה',
  connected: 'התחברה',
  business: 'תוצאה עסקית',
});

const FOLLOWUP_STATUSES = Object.freeze([
  'open',
  'in-progress',
  'done',
  'cancelled',
]);

const FOLLOWUP_STATUSES_HE = Object.freeze({
  'open': 'פתוח',
  'in-progress': 'בטיפול',
  'done': 'בוצע',
  'cancelled': 'בוטל',
});

const QUEUE_STATUSES = Object.freeze([
  'queued',
  'in-progress',
  'completed',
  'failed',
  'abandoned',
]);

const QUEUE_STATUSES_HE = Object.freeze({
  'queued': 'בתור',
  'in-progress': 'בטיפול',
  'completed': 'טופל',
  'failed': 'נכשל',
  'abandoned': 'ננטש',
});

const QUEUE_PRIORITIES = Object.freeze(['vip', 'high', 'normal', 'low']);

const QUEUE_PRIORITIES_HE = Object.freeze({
  vip: 'VIP — בכיר',
  high: 'גבוה',
  normal: 'רגיל',
  low: 'נמוך',
});

const PRIORITY_WEIGHT = Object.freeze({ vip: 0, high: 1, normal: 2, low: 3 });

const LAWFUL_BASES = Object.freeze([
  'one-party-consent',
  'informed-consent',
  'employment-contract',
  'court-order',
]);

const LAWFUL_BASES_HE = Object.freeze({
  'one-party-consent':
    'הסכמת צד אחד (חוק האזנת סתר, התשל"ט-1979 — מותר אם הנציג מודע)',
  'informed-consent':
    'הסכמה מדעת של שני הצדדים (IVR גילוי בתחילת שיחה)',
  'employment-contract':
    'הסכמת עובד במסגרת חוזה עבודה / מדיניות בקרת איכות',
  'court-order':
    'צו בית משפט (האזנת סתר מותרת בהליך משפטי)',
});

const DISCLOSURE_NOTICE_HE =
  'לתשומת ליבך — שיחה זו עשויה להיות מוקלטת לצורכי בקרת איכות ושירות.';
const DISCLOSURE_NOTICE_EN =
  'Please note — this call may be recorded for quality assurance and service purposes.';

const RATING_GRADES = Object.freeze(['A', 'B', 'C', 'D', 'F']);

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function toMillis(x) {
  if (x == null) return null;
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const t = Date.parse(x);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function toIso(ms) {
  if (!isFiniteNumber(ms)) return null;
  return new Date(ms).toISOString();
}

function cloneDeep(x) {
  // JSON-safe clone — the whole module is JSON-serializable by contract
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

function requireStr(val, name) {
  if (typeof val !== 'string' || val.trim() === '') {
    throw new Error(`${name} is required (non-empty string)`);
  }
  return val;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─────────────────────────────────────────────────────────────
//  Main class
// ─────────────────────────────────────────────────────────────

class CallLog {
  /**
   * @param {object} opts
   * @param {() => number} [opts.clock]         — injectable clock (ms epoch)
   * @param {object}       [opts.pbx]           — PBX adapter (see pbxIntegration)
   * @param {object}       [opts.legal]         — legal-notice config
   * @param {boolean}      [opts.legal.disclosureRequired=true]
   * @param {string}       [opts.legal.noticeHe]
   * @param {string}       [opts.legal.noticeEn]
   * @param {Array<object>}[opts.dispositions]  — override default taxonomy
   */
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function'
      ? opts.clock
      : () => Date.now();

    this._pbx = null;
    this._pbxProvider = null;
    if (opts.pbx && opts.pbx.provider) {
      this.pbxIntegration({ provider: opts.pbx.provider, adapter: opts.pbx });
    }

    this._legal = Object.freeze({
      disclosureRequired:
        opts.legal && opts.legal.disclosureRequired === false ? false : true,
      noticeHe: (opts.legal && opts.legal.noticeHe) || DISCLOSURE_NOTICE_HE,
      noticeEn: (opts.legal && opts.legal.noticeEn) || DISCLOSURE_NOTICE_EN,
    });

    // Stores (append-only by house rule)
    this._calls = [];                // master call log
    this._callIndex = new Map();     // callId → index into _calls
    this._followUps = [];            // follow-up tasks
    this._queue = [];                // callback queue items
    this._routingRules = [];         // routing rules (per customer)
    this._monitorSessions = [];      // silent-listen sessions
    this._events = [];               // master event stream

    // Disposition taxonomy — stored as mutable (but never deleted) map
    this._dispositions = new Map();
    const seed = Array.isArray(opts.dispositions) && opts.dispositions.length
      ? opts.dispositions
      : DEFAULT_DISPOSITIONS;
    for (const d of seed) {
      this._dispositions.set(d.code, {
        code: d.code,
        labelHe: d.labelHe,
        labelEn: d.labelEn,
        category: d.category,
        terminal: Boolean(d.terminal),
        active: true,
        createdAt: this._clock(),
      });
    }
  }

  // ───────────────────────────────────────────────────────────
  //  Internal — event log & id generation
  // ───────────────────────────────────────────────────────────

  _now() { return this._clock(); }

  _logEvent(event, details) {
    this._events.push({
      at: this._now(),
      event,
      details: cloneDeep(details) || {},
    });
  }

  _nextId(prefix) {
    // Deterministic, monotonic. Not cryptographic — audit stream has the clock.
    const n = (this._events.length + 1).toString(36);
    return `${prefix}-${this._now()}-${n}`;
  }

  // ───────────────────────────────────────────────────────────
  //  recordCall
  // ───────────────────────────────────────────────────────────

  recordCall({
    callId,
    from,
    to,
    direction,
    startTime,
    endTime,
    duration,
    outcome,
    agent,
    customer,
    notes,
    tags,
  } = {}) {
    requireStr(callId, 'callId');
    requireStr(from, 'from');
    requireStr(to, 'to');
    assert(
      DIRECTIONS.includes(direction),
      `direction must be one of ${DIRECTIONS.join('|')}`
    );

    const startMs = toMillis(startTime);
    assert(startMs != null, 'startTime is required (Date|iso|ms)');

    let endMs = toMillis(endTime);
    let durSec = isFiniteNumber(duration) ? Math.max(0, Math.round(duration)) : null;

    // Derive whichever of {endTime, duration} is missing
    if (endMs == null && durSec != null) {
      endMs = startMs + durSec * 1000;
    } else if (endMs != null && durSec == null) {
      durSec = Math.max(0, Math.round((endMs - startMs) / 1000));
    } else if (endMs == null && durSec == null) {
      // allowed — missed / in-progress call
      durSec = 0;
    }

    // Outcome validation (must match an active disposition if supplied)
    if (outcome != null) {
      const d = this._dispositions.get(outcome);
      assert(
        d && d.active,
        `outcome '${outcome}' is not a known active disposition code`
      );
    }

    // Supersession: if a call with this callId already exists,
    // mark the prior version superseded and append a new version.
    // HOUSE RULE: never mutate or delete the prior record.
    const existingIdx = this._callIndex.get(callId);
    if (existingIdx != null) {
      const prior = this._calls[existingIdx];
      if (prior.status !== 'superseded') {
        prior.status = 'superseded';
        prior.history.push({
          at: this._now(),
          event: 'superseded',
          details: { reason: 'recordCall re-emit' },
        });
      }
    }

    const call = {
      callId,
      from,
      to,
      direction,
      directionHe: DIRECTIONS_HE[direction],
      startTime: startMs,
      startTimeIso: toIso(startMs),
      endTime: endMs,
      endTimeIso: toIso(endMs),
      duration: durSec,
      outcome: outcome || null,
      outcomeLabelHe: outcome ? (this._dispositions.get(outcome).labelHe) : null,
      agent: agent || null,
      customerId: (customer && customer.id) || (typeof customer === 'string' ? customer : null),
      customerName: (customer && customer.name) || null,
      opportunityId: null,
      ticketId: null,
      notes: notes || '',
      tags: Array.isArray(tags) ? tags.slice() : [],
      recording: null,
      createdAt: this._now(),
      status: 'logged',
      history: [{
        at: this._now(),
        event: existingIdx != null ? 'versioned' : 'created',
        details: { direction, outcome: outcome || null },
      }],
    };

    this._calls.push(call);
    this._callIndex.set(callId, this._calls.length - 1);
    this._logEvent('call.recorded', {
      callId,
      direction,
      outcome: outcome || null,
      agent: call.agent,
      customerId: call.customerId,
    });

    // Missed-inbound auto-trigger: if inbound and outcome indicates no-answer/busy/voicemail,
    // automatically enqueue callback (callBackQueue) so the workflow is visible even when
    // the operator forgets to call missedCallHandling directly.
    if (
      call.direction === 'inbound' &&
      call.outcome &&
      ['no-answer', 'busy', 'voicemail'].includes(call.outcome)
    ) {
      this.missedCallHandling({ callId, callback: { priority: 'high' } });
    }

    return cloneDeep(call);
  }

  // ───────────────────────────────────────────────────────────
  //  Linking
  // ───────────────────────────────────────────────────────────

  _getActive(callId) {
    const idx = this._callIndex.get(callId);
    assert(idx != null, `callId '${callId}' not found`);
    const call = this._calls[idx];
    assert(call.status !== 'superseded', `callId '${callId}' is superseded`);
    return call;
  }

  linkToCustomer({ callId, customerId } = {}) {
    requireStr(callId, 'callId');
    requireStr(customerId, 'customerId');
    const call = this._getActive(callId);
    const prev = call.customerId;
    call.customerId = customerId;
    call.history.push({
      at: this._now(),
      event: 'link.customer',
      details: { prev, next: customerId },
    });
    this._logEvent('link.customer', { callId, customerId, prev });
    return cloneDeep(call);
  }

  linkToOpportunity({ callId, oppId } = {}) {
    requireStr(callId, 'callId');
    requireStr(oppId, 'oppId');
    const call = this._getActive(callId);
    const prev = call.opportunityId;
    call.opportunityId = oppId;
    call.history.push({
      at: this._now(),
      event: 'link.opportunity',
      details: { prev, next: oppId },
    });
    this._logEvent('link.opportunity', { callId, oppId, prev });
    return cloneDeep(call);
  }

  linkToTicket({ callId, ticketId } = {}) {
    requireStr(callId, 'callId');
    requireStr(ticketId, 'ticketId');
    const call = this._getActive(callId);
    const prev = call.ticketId;
    call.ticketId = ticketId;
    call.history.push({
      at: this._now(),
      event: 'link.ticket',
      details: { prev, next: ticketId },
    });
    this._logEvent('link.ticket', { callId, ticketId, prev });
    return cloneDeep(call);
  }

  // ───────────────────────────────────────────────────────────
  //  Disposition codes
  // ───────────────────────────────────────────────────────────

  /**
   * Add or supersede a disposition code. Existing codes are never deleted;
   * deactivation happens via `deactivateDisposition`.
   */
  addDisposition({ code, labelHe, labelEn, category, terminal } = {}) {
    requireStr(code, 'code');
    requireStr(labelHe, 'labelHe');
    requireStr(labelEn, 'labelEn');
    assert(
      DISPOSITION_CATEGORIES.includes(category),
      `category must be one of ${DISPOSITION_CATEGORIES.join('|')}`
    );
    const prior = this._dispositions.get(code);
    this._dispositions.set(code, {
      code,
      labelHe,
      labelEn,
      category,
      terminal: Boolean(terminal),
      active: true,
      createdAt: prior ? prior.createdAt : this._now(),
      supersededAt: prior ? this._now() : null,
    });
    this._logEvent('disposition.upsert', { code, category, superseded: Boolean(prior) });
    return cloneDeep(this._dispositions.get(code));
  }

  deactivateDisposition(code) {
    requireStr(code, 'code');
    const d = this._dispositions.get(code);
    assert(d, `disposition '${code}' not found`);
    d.active = false;
    d.deactivatedAt = this._now();
    this._logEvent('disposition.deactivate', { code });
    return cloneDeep(d);
  }

  /** Expose the current disposition taxonomy (array, deterministic order). */
  get dispositionCodes() {
    return Array.from(this._dispositions.values()).map((d) => cloneDeep(d));
  }

  // ───────────────────────────────────────────────────────────
  //  callSummary — volume, avg duration, answer rate
  // ───────────────────────────────────────────────────────────

  /**
   * @param {object} filter
   * @param {{from?:string|number|Date,to?:string|number|Date}} [filter.period]
   * @param {string} [filter.agent]
   */
  callSummary({ period, agent } = {}) {
    const fromMs = period && period.from != null ? toMillis(period.from) : null;
    const toMs = period && period.to != null ? toMillis(period.to) : null;

    const buckets = {
      total: 0,
      inbound: 0,
      outbound: 0,
      answered: 0,
      unanswered: 0,
      durationSum: 0,
      durationCount: 0,
      byOutcome: {},
      byCategory: { connected: 0, unconnected: 0, business: 0, unknown: 0 },
      byAgent: {},
    };

    for (const call of this._calls) {
      if (call.status === 'superseded') continue;
      if (fromMs != null && call.startTime < fromMs) continue;
      if (toMs != null && call.startTime > toMs) continue;
      if (agent && call.agent !== agent) continue;

      buckets.total += 1;
      if (call.direction === 'inbound') buckets.inbound += 1;
      if (call.direction === 'outbound') buckets.outbound += 1;

      const d = call.outcome ? this._dispositions.get(call.outcome) : null;
      const category = d ? d.category : 'unknown';
      const isAnswered = category === 'connected' || category === 'business';
      if (isAnswered) buckets.answered += 1;
      else buckets.unanswered += 1;

      if (isFiniteNumber(call.duration) && call.duration > 0) {
        buckets.durationSum += call.duration;
        buckets.durationCount += 1;
      }

      const oc = call.outcome || '(none)';
      buckets.byOutcome[oc] = (buckets.byOutcome[oc] || 0) + 1;
      buckets.byCategory[category] = (buckets.byCategory[category] || 0) + 1;

      if (call.agent) {
        const a = buckets.byAgent[call.agent] || {
          total: 0, answered: 0, durationSum: 0, durationCount: 0,
        };
        a.total += 1;
        if (isAnswered) a.answered += 1;
        if (isFiniteNumber(call.duration) && call.duration > 0) {
          a.durationSum += call.duration;
          a.durationCount += 1;
        }
        buckets.byAgent[call.agent] = a;
      }
    }

    const avgDuration = buckets.durationCount > 0
      ? buckets.durationSum / buckets.durationCount
      : 0;
    const answerRate = buckets.total > 0
      ? buckets.answered / buckets.total
      : 0;

    // Per-agent averages
    const byAgent = {};
    for (const [k, v] of Object.entries(buckets.byAgent)) {
      byAgent[k] = {
        total: v.total,
        answered: v.answered,
        answerRate: v.total > 0 ? v.answered / v.total : 0,
        avgDuration: v.durationCount > 0 ? v.durationSum / v.durationCount : 0,
      };
    }

    return {
      period: {
        from: fromMs != null ? toIso(fromMs) : null,
        to: toMs != null ? toIso(toMs) : null,
      },
      agent: agent || null,
      volume: buckets.total,
      inbound: buckets.inbound,
      outbound: buckets.outbound,
      answered: buckets.answered,
      unanswered: buckets.unanswered,
      answerRate,
      answerRatePct: Math.round(answerRate * 10000) / 100,
      avgDuration, // seconds
      avgDurationFmt: formatDuration(avgDuration),
      byOutcome: buckets.byOutcome,
      byCategory: buckets.byCategory,
      byAgent,
    };
  }

  // ───────────────────────────────────────────────────────────
  //  followUpTasks — auto-task creation from a call
  // ───────────────────────────────────────────────────────────

  followUpTasks({ callId, dueDate, description, assignee } = {}) {
    requireStr(callId, 'callId');
    requireStr(description, 'description');
    const due = toMillis(dueDate);
    assert(due != null, 'dueDate is required');
    // Validate call exists (but allow follow-ups for superseded versions
    // to attach to the latest version):
    const call = this._getActive(callId);

    const id = this._nextId('fu');
    const task = {
      id,
      callId,
      customerId: call.customerId,
      opportunityId: call.opportunityId,
      ticketId: call.ticketId,
      dueDate: due,
      dueDateIso: toIso(due),
      description,
      assignee: assignee || call.agent || null,
      status: 'open',
      statusHe: FOLLOWUP_STATUSES_HE.open,
      createdAt: this._now(),
      history: [{
        at: this._now(),
        event: 'created',
        details: { description, assignee: assignee || call.agent || null },
      }],
    };
    this._followUps.push(task);
    call.history.push({
      at: this._now(),
      event: 'followup.created',
      details: { taskId: id },
    });
    this._logEvent('followup.create', {
      callId, taskId: id, assignee: task.assignee,
    });
    return cloneDeep(task);
  }

  updateFollowUpStatus({ id, status, by } = {}) {
    requireStr(id, 'id');
    assert(
      FOLLOWUP_STATUSES.includes(status),
      `status must be one of ${FOLLOWUP_STATUSES.join('|')}`
    );
    const task = this._followUps.find((f) => f.id === id);
    assert(task, `follow-up '${id}' not found`);
    const prev = task.status;
    task.status = status;
    task.statusHe = FOLLOWUP_STATUSES_HE[status];
    task.history.push({
      at: this._now(),
      event: 'status',
      details: { prev, next: status, by: by || null },
    });
    this._logEvent('followup.status', { id, prev, next: status });
    return cloneDeep(task);
  }

  listFollowUps({ status, assignee, callId } = {}) {
    return this._followUps
      .filter((f) => !status || f.status === status)
      .filter((f) => !assignee || f.assignee === assignee)
      .filter((f) => !callId || f.callId === callId)
      .map(cloneDeep);
  }

  // ───────────────────────────────────────────────────────────
  //  missedCallHandling + callBackQueue
  // ───────────────────────────────────────────────────────────

  /**
   * Register automatic-callback workflow for a missed call.
   * `callback` can be:
   *   - true  → default priority normal, reason 'missed-call'
   *   - object { priority, reason, attempts }
   */
  missedCallHandling({ callId, callback } = {}) {
    requireStr(callId, 'callId');
    const call = this._getActive(callId);
    const cfg = (typeof callback === 'object' && callback) || {};
    const priority = cfg.priority && QUEUE_PRIORITIES.includes(cfg.priority)
      ? cfg.priority
      : 'normal';
    const reason = cfg.reason || 'missed-call';

    const id = this._nextId('q');
    const item = {
      id,
      callId,
      customerId: call.customerId,
      priority,
      priorityHe: QUEUE_PRIORITIES_HE[priority],
      reason,
      enqueuedAt: this._now(),
      enqueuedAtIso: toIso(this._now()),
      attempts: 0,
      status: 'queued',
      statusHe: QUEUE_STATUSES_HE.queued,
      history: [{
        at: this._now(),
        event: 'enqueued',
        details: { priority, reason },
      }],
    };
    this._queue.push(item);
    call.history.push({
      at: this._now(),
      event: 'missed.enqueued',
      details: { queueId: id, priority },
    });
    this._logEvent('queue.enqueue', { callId, queueId: id, priority });
    return cloneDeep(item);
  }

  /**
   * Return the next callback item(s) ordered by priority & enqueue time.
   * `opts.priority` — optionally filter to a single priority.
   * `opts.limit`    — optional cap (default 50).
   */
  callBackQueue({ priority, limit } = {}) {
    const cap = isFiniteNumber(limit) && limit > 0 ? Math.floor(limit) : 50;
    const rows = this._queue
      .filter((q) => q.status === 'queued')
      .filter((q) => !priority || q.priority === priority)
      .slice()
      .sort((a, b) => {
        const pa = PRIORITY_WEIGHT[a.priority] ?? 99;
        const pb = PRIORITY_WEIGHT[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.enqueuedAt - b.enqueuedAt;
      })
      .slice(0, cap)
      .map(cloneDeep);
    return rows;
  }

  updateQueueItem({ id, status, by } = {}) {
    requireStr(id, 'id');
    assert(
      QUEUE_STATUSES.includes(status),
      `status must be one of ${QUEUE_STATUSES.join('|')}`
    );
    const item = this._queue.find((q) => q.id === id);
    assert(item, `queue item '${id}' not found`);
    const prev = item.status;
    item.status = status;
    item.statusHe = QUEUE_STATUSES_HE[status];
    if (status === 'in-progress') item.attempts += 1;
    item.history.push({
      at: this._now(),
      event: 'status',
      details: { prev, next: status, by: by || null },
    });
    this._logEvent('queue.status', { id, prev, next: status });
    return cloneDeep(item);
  }

  // ───────────────────────────────────────────────────────────
  //  pbxIntegration — generic adapter
  // ───────────────────────────────────────────────────────────

  /**
   * Register a PBX adapter. The adapter must implement a subset of:
   *   dial({from,to,...}) → { callId, ... }
   *   hangup({callId})    → void
   *   listen({callId, supervisor}) → { sessionId }
   *   getRecording({callId}) → { url, ... }
   * Any missing methods fall back to a deterministic mock that lets the
   * workflow run in unit tests / staging without a real PBX.
   */
  pbxIntegration({ provider, adapter } = {}) {
    assert(
      PBX_PROVIDERS.includes(provider),
      `provider must be one of ${PBX_PROVIDERS.join('|')}`
    );
    this._pbxProvider = provider;
    const mock = buildMockPbxAdapter(provider, () => this._now());
    // Merge adapter over mock — injected methods win.
    this._pbx = Object.assign({}, mock, adapter || {}, { provider });
    this._logEvent('pbx.register', { provider, injected: Boolean(adapter) });
    return {
      provider,
      providerHe: PBX_PROVIDERS_HE[provider],
      methods: Object.keys(this._pbx).filter((k) => typeof this._pbx[k] === 'function'),
    };
  }

  /**
   * Dial an outbound call through the registered PBX. Returns the adapter
   * response (mockable). Also records a stub call entry immediately so the
   * CRM timeline stays consistent even if the adapter call-id arrives async.
   */
  dialOutbound({ from, to, agent, customer } = {}) {
    assert(this._pbx, 'no PBX adapter registered (pbxIntegration first)');
    requireStr(from, 'from');
    requireStr(to, 'to');
    const res = this._pbx.dial({ from, to, agent, customer });
    const callId = res && res.callId ? res.callId : this._nextId('call');
    const call = this.recordCall({
      callId,
      from,
      to,
      direction: 'outbound',
      startTime: this._now(),
      outcome: null,
      agent: agent || null,
      customer: customer || null,
    });
    return { pbx: res, call };
  }

  // ───────────────────────────────────────────────────────────
  //  callRoutingRules — e.g. VIP → specific agent
  // ───────────────────────────────────────────────────────────

  /**
   * Define routing rules for a customer. `rules` is an array of
   * rule objects interpreted in order:
   *   { match:{hour:[9,18]}, action:{route:'agent:uzi'} }
   *   { action:{route:'group:sales-vip'} }  // fallback
   *
   * Rules are never deleted. Re-registering with the same customerId
   * marks the prior rule-set `active=false` and appends a new version.
   */
  callRoutingRules({ customerId, rules } = {}) {
    requireStr(customerId, 'customerId');
    assert(Array.isArray(rules), 'rules must be an array');
    // Supersede prior active rule-set
    for (const r of this._routingRules) {
      if (r.customerId === customerId && r.active) {
        r.active = false;
        r.supersededAt = this._now();
        r.history.push({
          at: this._now(),
          event: 'superseded',
          details: {},
        });
      }
    }
    const id = this._nextId('rr');
    const rec = {
      id,
      customerId,
      rules: cloneDeep(rules),
      active: true,
      createdAt: this._now(),
      history: [{
        at: this._now(),
        event: 'created',
        details: { ruleCount: rules.length },
      }],
    };
    this._routingRules.push(rec);
    this._logEvent('routing.upsert', { customerId, rules: rules.length });
    return cloneDeep(rec);
  }

  /** Evaluate the active routing rules for a customer + context. */
  resolveRouting({ customerId, context } = {}) {
    requireStr(customerId, 'customerId');
    const rec = this._routingRules
      .filter((r) => r.customerId === customerId && r.active)
      .pop();
    if (!rec) return { route: null, matched: null };
    const ctx = context || {};
    for (const rule of rec.rules) {
      if (matchRule(rule.match, ctx)) {
        return { route: rule.action && rule.action.route, matched: rule };
      }
    }
    return { route: null, matched: null };
  }

  // ───────────────────────────────────────────────────────────
  //  silentListen — supervisor silent monitor
  // ───────────────────────────────────────────────────────────

  /**
   * Start a silent-listen monitor session. Enforces Israeli legal gate.
   * Requires either `disclosureRequired=false` at module level (unusual)
   * OR `lawfulBasis` to be a valid key (one-party-consent / informed-consent
   * / employment-contract / court-order).
   */
  silentListen({ callId, supervisor, lawfulBasis } = {}) {
    requireStr(callId, 'callId');
    requireStr(supervisor, 'supervisor');
    const call = this._getActive(callId);

    if (this._legal.disclosureRequired) {
      assert(
        lawfulBasis && LAWFUL_BASES.includes(lawfulBasis),
        `silentListen requires lawfulBasis (one of ${LAWFUL_BASES.join('|')}) ` +
        `under Israeli Wiretap Act / Privacy Protection Law. ` +
        `Hebrew disclosure: "${this._legal.noticeHe}"`
      );
    }

    // If PBX provides listen(), invoke it — otherwise record-only.
    let pbxResult = null;
    if (this._pbx && typeof this._pbx.listen === 'function') {
      pbxResult = this._pbx.listen({ callId, supervisor });
    }

    const id = this._nextId('ml');
    const session = {
      id,
      callId,
      supervisor,
      startedAt: this._now(),
      startedAtIso: toIso(this._now()),
      endedAt: null,
      lawfulBasis: lawfulBasis || null,
      lawfulBasisHe: lawfulBasis ? LAWFUL_BASES_HE[lawfulBasis] : null,
      disclosed: this._legal.disclosureRequired,
      disclosureNoticeHe: this._legal.noticeHe,
      disclosureNoticeEn: this._legal.noticeEn,
      pbx: pbxResult,
      active: true,
      createdAt: this._now(),
    };
    this._monitorSessions.push(session);
    call.history.push({
      at: this._now(),
      event: 'monitor.start',
      details: { supervisor, lawfulBasis: lawfulBasis || null },
    });
    this._logEvent('monitor.start', { callId, supervisor, lawfulBasis });
    return cloneDeep(session);
  }

  endSilentListen({ id } = {}) {
    requireStr(id, 'id');
    const s = this._monitorSessions.find((x) => x.id === id);
    assert(s, `monitor session '${id}' not found`);
    s.active = false;
    s.endedAt = this._now();
    s.endedAtIso = toIso(this._now());
    this._logEvent('monitor.end', { id, callId: s.callId });
    return cloneDeep(s);
  }

  // ───────────────────────────────────────────────────────────
  //  recordingLinkage — link call to recording URL (Y-125 bridge)
  // ───────────────────────────────────────────────────────────

  /**
   * Attach a recording-URL pointer to a call. Fields:
   *   recordingUrl     — URL / URI pointing at the recording store
   *   retentionDays    — retention requested by the linker
   *   lawfulBasis      — why this recording is lawful (see LAWFUL_BASES)
   *   disclosed        — was the customer told the call was recorded?
   *   checksum         — optional content hash (e.g. sha256)
   *
   * Does NOT store the audio itself. Does NOT delete the pointer on
   * supersession — appends history entries instead.
   */
  recordingLinkage({
    callId,
    recordingUrl,
    retentionDays,
    lawfulBasis,
    disclosed,
    checksum,
  } = {}) {
    requireStr(callId, 'callId');
    requireStr(recordingUrl, 'recordingUrl');
    const call = this._getActive(callId);

    // Soft legal check — we log a warning event, do not block.
    // Blocking is the operator's decision via disclosureRequired config.
    const legalOk = lawfulBasis && LAWFUL_BASES.includes(lawfulBasis);

    const rec = {
      url: recordingUrl,
      retentionDays: isFiniteNumber(retentionDays) ? Math.max(1, Math.round(retentionDays)) : 365,
      lawfulBasis: lawfulBasis || null,
      lawfulBasisHe: lawfulBasis ? LAWFUL_BASES_HE[lawfulBasis] : null,
      disclosed: disclosed === true,
      checksum: checksum || null,
      linkedAt: this._now(),
      linkedAtIso: toIso(this._now()),
      noticeHe: this._legal.noticeHe,
      noticeEn: this._legal.noticeEn,
      legalOk,
    };
    // House rule: keep prior linkage history on the call
    if (call.recording) {
      call.history.push({
        at: this._now(),
        event: 'recording.superseded',
        details: { priorUrl: call.recording.url },
      });
    }
    call.recording = rec;
    call.history.push({
      at: this._now(),
      event: 'recording.linked',
      details: { url: recordingUrl, lawfulBasis: lawfulBasis || null },
    });
    this._logEvent('recording.link', {
      callId, url: recordingUrl, lawfulBasis: lawfulBasis || null, legalOk,
    });
    return cloneDeep(call.recording);
  }

  // ───────────────────────────────────────────────────────────
  //  searchCalls — text / dateRange / agent / customer
  // ───────────────────────────────────────────────────────────

  /**
   * @param {object} q
   * @param {string}   [q.text]       — case-insensitive substring match on
   *                                   notes / tags / from / to / outcome /
   *                                   customerId / agent
   * @param {{from?:any,to?:any}} [q.dateRange]
   * @param {string}   [q.agent]
   * @param {string}   [q.customer]   — customerId
   * @param {boolean}  [q.includeSuperseded=false]
   * @param {number}   [q.limit=200]
   */
  searchCalls({
    text,
    dateRange,
    agent,
    customer,
    includeSuperseded,
    limit,
  } = {}) {
    const fromMs = dateRange && dateRange.from != null ? toMillis(dateRange.from) : null;
    const toMs = dateRange && dateRange.to != null ? toMillis(dateRange.to) : null;
    const cap = isFiniteNumber(limit) && limit > 0 ? Math.floor(limit) : 200;
    const needle = typeof text === 'string' && text.trim() !== ''
      ? text.toLowerCase()
      : null;

    const out = [];
    for (const call of this._calls) {
      if (!includeSuperseded && call.status === 'superseded') continue;
      if (fromMs != null && call.startTime < fromMs) continue;
      if (toMs != null && call.startTime > toMs) continue;
      if (agent && call.agent !== agent) continue;
      if (customer && call.customerId !== customer) continue;
      if (needle) {
        const hay = [
          call.from, call.to, call.outcome, call.agent, call.customerId,
          call.customerName, call.notes,
          ...(call.tags || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      out.push(cloneDeep(call));
      if (out.length >= cap) break;
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────
  //  Introspection helpers (tests, audit, reports)
  // ───────────────────────────────────────────────────────────

  getCall(callId) {
    const idx = this._callIndex.get(callId);
    if (idx == null) return null;
    return cloneDeep(this._calls[idx]);
  }

  allCalls({ includeSuperseded } = {}) {
    return this._calls
      .filter((c) => includeSuperseded || c.status !== 'superseded')
      .map(cloneDeep);
  }

  eventLog({ event, since } = {}) {
    const sinceMs = since != null ? toMillis(since) : null;
    return this._events
      .filter((e) => !event || e.event === event)
      .filter((e) => sinceMs == null || e.at >= sinceMs)
      .map(cloneDeep);
  }

  /** Size of every backing store — used by the "nothing is deleted" audit. */
  storeSizes() {
    return {
      calls: this._calls.length,
      followUps: this._followUps.length,
      queue: this._queue.length,
      routingRules: this._routingRules.length,
      monitorSessions: this._monitorSessions.length,
      dispositions: this._dispositions.size,
      events: this._events.length,
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  Helpers (module-private)
// ─────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!isFiniteNumber(seconds) || seconds <= 0) return '0:00';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function matchRule(match, ctx) {
  if (!match) return true; // no match clause = fallback / always
  for (const [k, v] of Object.entries(match)) {
    const cv = ctx[k];
    if (Array.isArray(v)) {
      // [min,max] range for numbers; membership for other types
      if (typeof cv === 'number' && v.length === 2 &&
          typeof v[0] === 'number' && typeof v[1] === 'number') {
        if (cv < v[0] || cv > v[1]) return false;
      } else if (!v.includes(cv)) {
        return false;
      }
    } else if (typeof v === 'object' && v !== null) {
      if (!matchRule(v, cv || {})) return false;
    } else if (cv !== v) {
      return false;
    }
  }
  return true;
}

function buildMockPbxAdapter(provider, clock) {
  let seq = 0;
  const stamp = () => `${provider}-mock-${clock()}-${++seq}`;
  return {
    provider,
    dial({ from, to }) {
      return {
        callId: stamp(),
        from,
        to,
        status: 'ringing',
        providerHe: PBX_PROVIDERS_HE[provider],
      };
    },
    hangup({ callId }) {
      return { callId, status: 'hung-up' };
    },
    listen({ callId, supervisor }) {
      return { sessionId: stamp(), callId, supervisor, mode: 'silent' };
    },
    getRecording({ callId }) {
      return {
        callId,
        url: `mock://${provider}/recordings/${callId}.wav`,
        sizeBytes: 0,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  CallLog,
  DIRECTIONS,
  DIRECTIONS_HE,
  PBX_PROVIDERS,
  PBX_PROVIDERS_HE,
  DEFAULT_DISPOSITIONS,
  DISPOSITION_CATEGORIES,
  DISPOSITION_CATEGORIES_HE,
  FOLLOWUP_STATUSES,
  FOLLOWUP_STATUSES_HE,
  QUEUE_STATUSES,
  QUEUE_STATUSES_HE,
  QUEUE_PRIORITIES,
  QUEUE_PRIORITIES_HE,
  LAWFUL_BASES,
  LAWFUL_BASES_HE,
  DISCLOSURE_NOTICE_HE,
  DISCLOSURE_NOTICE_EN,
  RATING_GRADES,
};
