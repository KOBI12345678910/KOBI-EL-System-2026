/**
 * Unified Customer Communication Log — Backend Module
 * ─────────────────────────────────────────────────────
 * Agent Y-096 — Techno-Kol Uzi Mega-ERP (Kobi EL 2026)
 *
 * A single source of truth for every interaction with a customer, across
 * every channel the business uses.  The idea: when a sales rep or support
 * agent opens a customer profile, they see ONE chronological feed — email,
 * WhatsApp, phone call, SMS, meeting, chat, letter, in-person — instead of
 * having to hop between inboxes.
 *
 * Responsibilities:
 *   • logCommunication()   — append a new record (never delete)
 *   • timeline()           — chronological feed across all channels
 *   • threadMessages()     — group by normalised subject / conversation
 *   • search()             — full-text search with inverted index
 *   • sentiment()          — positive/neutral/negative trend (lexicon based)
 *   • responseTime()       — avg minutes between inbound → outbound
 *   • lastTouch()          — days since last interaction
 *   • summarizeInteraction() — bilingual TL;DR for long messages
 *   • exportHistory()      — full JSON export for data-subject requests
 *                            (GDPR art.15 / Israeli Privacy Law תיקון 13)
 *   • gdprErase()          — PDPL-compliant right-to-be-forgotten.
 *                            NEVER drops the row; pseudonymises content
 *                            and sets `erased_at` — keeps legal hold intact
 *                            (per חוק הגנת הפרטיות §17ה, retention duty).
 *   • assign()             — route a specific comm to an agent for follow-up
 *
 * Integrations (optional, zero-dep by default):
 *   • X-21 Ticketing — if an entry has `relatedTo.ticketId` and a
 *     `ticketingService` is passed to the constructor, the comm is
 *     automatically mirrored as an internal comment on the ticket.
 *
 * Storage:
 *   • Default = in-memory Map-backed store (no deps, ideal for tests)
 *   • Pluggable via `store` option → adapter with insert/get/update/all.
 *
 * RULES honoured:
 *   • never delete — gdprErase() pseudonymises, does NOT remove the row
 *   • Hebrew RTL bilingual — labels exposed via `COMM_LABELS_HE`
 *   • zero deps — pure Node, no npm installs
 *
 * Smoke demo:
 *   node -e "require('./src/customer/comm-log').__smoke()"
 */

'use strict';

/* ================================================================== */
/*  Enums / constants                                                  */
/* ================================================================== */

const CHANNELS = Object.freeze({
  EMAIL:      'email',
  PHONE:      'phone',
  SMS:        'sms',
  WHATSAPP:   'whatsapp',
  MEETING:    'meeting',
  CHAT:       'chat',
  LETTER:     'letter',
  IN_PERSON:  'in-person',
});

const CHANNEL_LIST = Object.freeze(Object.values(CHANNELS));

const DIRECTIONS = Object.freeze({
  INBOUND:  'inbound',
  OUTBOUND: 'outbound',
});

const DIRECTION_LIST = Object.freeze(Object.values(DIRECTIONS));

const OUTCOMES = Object.freeze({
  ANSWERED:     'answered',
  NO_ANSWER:    'no-answer',
  VOICEMAIL:    'voicemail',
  BOUNCED:      'bounced',
  DELIVERED:    'delivered',
  READ:         'read',
  REPLIED:      'replied',
  SCHEDULED:    'scheduled',
  CANCELLED:    'cancelled',
  COMPLETED:    'completed',
  UNKNOWN:      'unknown',
});

const SENTIMENTS = Object.freeze({
  POSITIVE: 'positive',
  NEUTRAL:  'neutral',
  NEGATIVE: 'negative',
});

const COMM_LABELS_HE = Object.freeze({
  channels: {
    email:       'דוא"ל',
    phone:       'שיחת טלפון',
    sms:         'הודעת SMS',
    whatsapp:    'וואטסאפ',
    meeting:     'פגישה',
    chat:        "צ'אט",
    letter:      'מכתב',
    'in-person': 'פגישה פרונטלית',
  },
  directions: {
    inbound:  'נכנס',
    outbound: 'יוצא',
  },
  sentiments: {
    positive: 'חיובי',
    neutral:  'ניטרלי',
    negative: 'שלילי',
  },
  fields: {
    id:           'מזהה',
    customer_id:  'לקוח',
    channel:      'ערוץ',
    direction:    'כיוון',
    subject:      'נושא',
    body:         'תוכן',
    outcome:      'תוצאה',
    duration:     'משך',
    tags:         'תגיות',
    attachments:  'קבצים מצורפים',
    created_at:   'זמן',
    assignee:     'מטפל',
    sentiment:    'רגש',
    related:      'קשור ל',
    erased_at:    'נמחק בתאריך',
  },
  actions: {
    log:       'תיעוד תקשורת',
    assign:    'שיוך לטיפול',
    search:    'חיפוש',
    erase:     'מחיקה לפי חוק הגנת הפרטיות',
    export:    'ייצוא היסטוריה',
    summarize: 'סיכום קצר',
  },
});

/* ------------------------------------------------------------------ */
/*  Sentiment lexicons — small Hebrew + English dictionary             */
/* ------------------------------------------------------------------ */

const SENTIMENT_LEXICON = Object.freeze({
  positive: [
    // english
    'thanks','thank you','great','excellent','perfect','love','awesome',
    'pleased','happy','satisfied','resolved','solved','appreciate',
    'wonderful','amazing','best','good','nice','fine','smooth','fantastic',
    // hebrew
    'תודה','מעולה','מצוין','מושלם','נהדר','אוהב','שמח','מרוצה',
    'נפתר','נפתרה','פתרון','נעים','טוב','יפה','יופי','סבבה','מדהים',
    'מקצועי','מומלץ','בסדר','סחתיין','תותחים',
  ],
  negative: [
    // english
    'angry','furious','terrible','awful','broken','broken','bad','worst',
    'delay','delayed','late','problem','issue','bug','error','fail','failed',
    'disappointed','unhappy','complaint','complain','refund','cancel',
    'not working','never','never again','useless','poor','unacceptable',
    // hebrew
    'כועס','זועם','גרוע','איום','נורא','רע','גרועה','בעיה','באג','תקלה',
    'שגיאה','מאחר','איחור','עיכוב','דחייה','מאוכזב','מתלונן','תלונה',
    'החזר','ביטול','לבטל','לא עובד','לא מקבל','לעולם','נורא','רעה',
    'חוצפה','לא מקצועי','לא מומלץ','פייק',
  ],
});

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

let __idSeq = 0;
function genId(prefix = 'comm') {
  __idSeq += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${__idSeq.toString(36)}${rnd}`;
}

function nowISO(clock) {
  if (typeof clock === 'function') {
    const v = clock();
    if (v instanceof Date) return v.toISOString();
    return new Date(v).toISOString();
  }
  return new Date().toISOString();
}

function toMs(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isValidChannel(ch)   { return CHANNEL_LIST.includes(ch); }
function isValidDirection(d)  { return DIRECTION_LIST.includes(d); }

function normalizeTag(tag) {
  if (tag == null) return '';
  return String(tag).trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Collapse a subject into a thread key:
 *   "Re: Fwd: [Ticket #12] Invoice issue" → "invoice issue"
 * - strips re:/fwd:/תגובה:/העבר: prefixes (case-insensitive)
 * - strips bracketed tags like [X12] or [#123]
 * - collapses whitespace
 * - lowercases
 * - empty → "(no subject)"
 */
function normalizeSubject(subject) {
  if (!subject) return '(no subject)';
  let s = String(subject).trim();
  // repeatedly strip prefixes
  const prefixRx = /^\s*(re|fwd|fw|תגובה|העבר|השב)\s*:\s*/i;
  let guard = 0;
  while (prefixRx.test(s) && guard < 8) {
    s = s.replace(prefixRx, '');
    guard += 1;
  }
  // strip bracketed tags like [...] or (#...)
  s = s.replace(/\[[^\]]*\]/g, '').replace(/\(#[^)]*\)/g, '');
  // collapse whitespace, lowercase
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s || '(no subject)';
}

/**
 * Split a string into lowercase word tokens for full-text indexing.
 * Supports Latin + Hebrew letters + digits.
 * Tokens ≥ 2 chars.
 */
function tokenize(text) {
  if (!text) return [];
  // \u0590-\u05FF covers Hebrew; \u00C0-\u024F covers extended Latin
  const rx = /[a-z0-9\u00C0-\u024F\u0590-\u05FF]{2,}/gi;
  const toks = String(text).toLowerCase().match(rx);
  return toks || [];
}

/**
 * Very small bilingual TL;DR — no LLM.
 * Strategy: keep first sentence + first sentence containing a keyword
 * (price, invoice, meeting…), capped to ~240 chars; mark bilingual with
 * Hebrew heading when text contains Hebrew letters.
 */
function shortSummary(text, maxLen = 240) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  // split on sentence terminators (latin + hebrew colon/period)
  const parts = clean.split(/(?<=[\.\!\?。؟]|\|)\s+/);
  let first = parts[0] || '';
  if (first.length > maxLen) first = first.slice(0, maxLen - 1) + '…';
  let rest = '';
  const kwRx = /(invoice|price|meeting|contract|delivery|חשבונית|מחיר|פגישה|חוזה|משלוח|הצעה|תשלום)/i;
  for (let i = 1; i < parts.length; i++) {
    if (kwRx.test(parts[i])) {
      rest = parts[i].length > 160 ? parts[i].slice(0, 159) + '…' : parts[i];
      break;
    }
  }
  const joined = rest ? `${first} | ${rest}` : first;
  return joined.length > maxLen ? joined.slice(0, maxLen - 1) + '…' : joined;
}

function hasHebrew(text) {
  if (!text) return false;
  return /[\u0590-\u05FF]/.test(String(text));
}

/* ================================================================== */
/*  InMemoryCommStore                                                  */
/* ================================================================== */

class InMemoryCommStore {
  constructor() { this._rows = new Map(); }
  insert(row)           { this._rows.set(row.id, row); return row; }
  get(id)               { return this._rows.get(id) || null; }
  update(id, patch) {
    const cur = this._rows.get(id);
    if (!cur) return null;
    const next = Object.assign({}, cur, patch);
    this._rows.set(id, next);
    return next;
  }
  all()                 { return Array.from(this._rows.values()); }
  size()                { return this._rows.size; }
  clear()               { this._rows.clear(); }
}

/* ================================================================== */
/*  CommLog                                                            */
/* ================================================================== */

class CommLog {
  /**
   * @param {object} [opts]
   * @param {object} [opts.store]            Pluggable store (default in-memory)
   * @param {Function} [opts.clock]          () => ms or Date, for tests
   * @param {Function} [opts.idGen]          (prefix) => id, for tests
   * @param {Function} [opts.onEvent]        (evt,payload) audit hook
   * @param {object} [opts.ticketingService] X-21 TicketingService instance;
   *                                         when provided, ticket-linked comms
   *                                         mirror as internal ticket comments.
   * @param {number} [opts.summaryMaxLen]    summarizeInteraction char cap
   */
  constructor(opts = {}) {
    this.store = opts.store || new InMemoryCommStore();
    this.clock = opts.clock || (() => Date.now());
    this.idGen = opts.idGen || genId;
    this.onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null;
    this.ticketingService = opts.ticketingService || null;
    this.summaryMaxLen = Number(opts.summaryMaxLen || 240);
    // inverted index:   token → Set<commId>
    this._index = new Map();
    // thread index:     thread_key → Set<commId>
    this._threads = new Map();
    // customer index:   customer_id → Set<commId>  (fast timeline)
    this._byCustomer = new Map();
  }

  _now() {
    const v = this.clock();
    if (v instanceof Date) return v.toISOString();
    return new Date(v).toISOString();
  }

  _emit(evt, payload) {
    if (!this.onEvent) return;
    try { this.onEvent(evt, payload); } catch (_) { /* fail-open */ }
  }

  _indexRow(row) {
    // tokenise subject + body + tags
    const text = [row.subject, row.body, (row.tags || []).join(' ')].join(' ');
    const toks = tokenize(text);
    const seen = new Set();
    for (const t of toks) {
      if (seen.has(t)) continue;
      seen.add(t);
      let bucket = this._index.get(t);
      if (!bucket) { bucket = new Set(); this._index.set(t, bucket); }
      bucket.add(row.id);
    }
    // thread index
    const key = normalizeSubject(row.subject);
    let tb = this._threads.get(key);
    if (!tb) { tb = new Set(); this._threads.set(key, tb); }
    tb.add(row.id);
    // customer index
    let cb = this._byCustomer.get(row.customer_id);
    if (!cb) { cb = new Set(); this._byCustomer.set(row.customer_id, cb); }
    cb.add(row.id);
  }

  _reindexRow(row) {
    // remove row.id from every token bucket then re-add
    for (const bucket of this._index.values()) bucket.delete(row.id);
    for (const bucket of this._threads.values()) bucket.delete(row.id);
    this._indexRow(row);
  }

  /* -------------------------------------------------------- */
  /*  logCommunication                                        */
  /* -------------------------------------------------------- */
  logCommunication(input = {}) {
    const {
      customerId,
      channel,
      direction,
      from = '',
      to = '',
      subject = '',
      body = '',
      attachments = [],
      outcome = OUTCOMES.UNKNOWN,
      duration = null,      // seconds for calls/meetings
      tags = [],
      relatedTo = {},       // { oppId, ticketId, projectId }
      created_by = 'system',
      occurred_at = null,   // optional override; defaults to now
    } = input;

    if (!customerId)        throw new Error('commLog.logCommunication: customerId required');
    if (!isValidChannel(channel))
      throw new Error(`commLog.logCommunication: invalid channel "${channel}"`);
    if (!isValidDirection(direction))
      throw new Error(`commLog.logCommunication: invalid direction "${direction}"`);

    const now = this._now();
    const at  = occurred_at ? new Date(occurred_at).toISOString() : now;

    const row = {
      id:          this.idGen('comm'),
      customer_id: String(customerId),
      channel,
      direction,
      from:        String(from || ''),
      to:          String(to || ''),
      subject:     String(subject || ''),
      body:        String(body || ''),
      outcome:     String(outcome || OUTCOMES.UNKNOWN),
      duration:    duration == null ? null : Number(duration),
      tags:        [...new Set((tags || []).map(normalizeTag).filter(Boolean))],
      attachments: (attachments || []).map((a) => ({
        id:   this.idGen('att'),
        name: String(a && a.name || 'file'),
        ref:  String(a && (a.ref || a.url) || ''),
        mime: String(a && a.mime || 'application/octet-stream'),
        size: Number(a && a.size || 0),
      })),
      related_to: {
        opp_id:     relatedTo && relatedTo.oppId      ? String(relatedTo.oppId)     : null,
        ticket_id:  relatedTo && relatedTo.ticketId   ? String(relatedTo.ticketId)  : null,
        project_id: relatedTo && relatedTo.projectId  ? String(relatedTo.projectId) : null,
      },
      created_at:  at,
      logged_at:   now,
      created_by:  String(created_by || 'system'),
      assignee:    null,
      thread_key:  normalizeSubject(subject),
      sentiment:   computeSentiment(`${subject} ${body}`),
      // PDPL flags — NEVER delete, only erase-in-place
      erased_at:   null,
      erased_by:   null,
      erase_reason: null,
      history: [{
        at: now,
        by: String(created_by || 'system'),
        action: 'logged',
        note: `${direction} ${channel}`,
      }],
    };

    this.store.insert(row);
    this._indexRow(row);

    // X-21 Ticket mirror
    if (row.related_to.ticket_id && this.ticketingService
        && typeof this.ticketingService.addComment === 'function') {
      try {
        this.ticketingService.addComment(
          row.related_to.ticket_id,
          {
            body: `[${row.channel} · ${row.direction}] ${row.subject || '(no subject)'}
${row.body || ''}`,
            author: row.created_by,
          },
          true, // internal
        );
      } catch (_) { /* fail-open: ticket mirror must never break logging */ }
    }

    this._emit('comm.logged', {
      id: row.id,
      customer_id: row.customer_id,
      channel,
      direction,
    });
    return row;
  }

  /* -------------------------------------------------------- */
  /*  timeline                                                */
  /* -------------------------------------------------------- */
  timeline(customerId, opts = {}) {
    if (!customerId) return [];
    const { limit = 50, from = null, to = null, channel = null } = opts || {};
    const ids = this._byCustomer.get(String(customerId));
    if (!ids || ids.size === 0) return [];
    const fromMs = from ? toMs(from) : -Infinity;
    const toMsv  = to   ? toMs(to)   : Infinity;
    const rows = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      const at = toMs(r.created_at);
      if (at < fromMs || at > toMsv) continue;
      if (channel && r.channel !== channel) continue;
      rows.push(r);
    }
    rows.sort((a, b) => toMs(b.created_at) - toMs(a.created_at));
    return rows.slice(0, Math.max(0, Number(limit) || 50));
  }

  /* -------------------------------------------------------- */
  /*  threadMessages                                          */
  /* -------------------------------------------------------- */
  threadMessages({ subject } = {}) {
    const key = normalizeSubject(subject);
    const ids = this._threads.get(key);
    if (!ids || ids.size === 0) return { thread_key: key, messages: [] };
    const rows = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (r) rows.push(r);
    }
    rows.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
    return { thread_key: key, messages: rows, count: rows.length };
  }

  /* -------------------------------------------------------- */
  /*  search                                                  */
  /* -------------------------------------------------------- */
  search({ query = '', customerId = null, channel = null, dateRange = null } = {}) {
    const terms = tokenize(query);
    let candidateIds = null;
    if (terms.length === 0) {
      // no terms → start from every row
      candidateIds = new Set(this.store.all().map((r) => r.id));
    } else {
      // AND semantics: intersection of posting lists
      for (const t of terms) {
        const bucket = this._index.get(t) || new Set();
        if (candidateIds === null) {
          candidateIds = new Set(bucket);
        } else {
          for (const id of Array.from(candidateIds)) {
            if (!bucket.has(id)) candidateIds.delete(id);
          }
        }
        if (candidateIds.size === 0) break;
      }
    }

    const fromMs = dateRange && dateRange.from ? toMs(dateRange.from) : -Infinity;
    const toMsv  = dateRange && dateRange.to   ? toMs(dateRange.to)   : Infinity;

    const hits = [];
    for (const id of candidateIds || []) {
      const r = this.store.get(id);
      if (!r) continue;
      if (customerId && r.customer_id !== String(customerId)) continue;
      if (channel && r.channel !== channel) continue;
      const at = toMs(r.created_at);
      if (at < fromMs || at > toMsv) continue;
      hits.push(r);
    }

    // simple TF scoring: count term hits in subject + body
    const q = String(query || '').toLowerCase();
    hits.sort((a, b) => {
      const sa = scoreHit(a, q);
      const sb = scoreHit(b, q);
      if (sa !== sb) return sb - sa;
      return toMs(b.created_at) - toMs(a.created_at);
    });
    return hits;
  }

  /* -------------------------------------------------------- */
  /*  sentiment                                               */
  /* -------------------------------------------------------- */
  sentiment({ customerId, period = {} } = {}) {
    if (!customerId) return { positive: 0, neutral: 0, negative: 0, score: 0, n: 0, trend: 'flat' };
    const from = period && period.from ? toMs(period.from) : -Infinity;
    const to   = period && period.to   ? toMs(period.to)   : Infinity;
    const ids = this._byCustomer.get(String(customerId)) || new Set();
    let pos = 0, neu = 0, neg = 0;
    // simple trend: compare first-half avg vs. second-half avg of the window
    const windowed = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      if (r.erased_at) continue;
      const at = toMs(r.created_at);
      if (at < from || at > to) continue;
      windowed.push(r);
    }
    windowed.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
    for (const r of windowed) {
      if (r.sentiment === SENTIMENTS.POSITIVE) pos += 1;
      else if (r.sentiment === SENTIMENTS.NEGATIVE) neg += 1;
      else neu += 1;
    }
    const n = windowed.length;
    const score = n === 0 ? 0 : Math.round(((pos - neg) / n) * 100) / 100;
    // trend
    let trend = 'flat';
    if (n >= 4) {
      const mid = Math.floor(n / 2);
      const a = sentimentScoreSlice(windowed.slice(0, mid));
      const b = sentimentScoreSlice(windowed.slice(mid));
      if (b - a > 0.15) trend = 'improving';
      else if (a - b > 0.15) trend = 'declining';
    }
    return { positive: pos, neutral: neu, negative: neg, score, n, trend };
  }

  /* -------------------------------------------------------- */
  /*  responseTime                                            */
  /* -------------------------------------------------------- */
  responseTime({ customerId, period = {} } = {}) {
    if (!customerId) return { avg_minutes: 0, n: 0, samples: [] };
    const from = period && period.from ? toMs(period.from) : -Infinity;
    const to   = period && period.to   ? toMs(period.to)   : Infinity;
    const ids = this._byCustomer.get(String(customerId)) || new Set();
    const rows = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      if (r.erased_at) continue;
      const at = toMs(r.created_at);
      if (at < from || at > to) continue;
      rows.push(r);
    }
    rows.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
    // For each inbound (customer → us), find next outbound (us → customer)
    // on the same channel OR any channel within 7 days; record delta.
    const samples = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.direction !== DIRECTIONS.INBOUND) continue;
      for (let j = i + 1; j < rows.length; j++) {
        const nxt = rows[j];
        if (nxt.direction !== DIRECTIONS.OUTBOUND) continue;
        // skip if outbound is on a completely unrelated topic more than 7 days later
        const deltaMs = toMs(nxt.created_at) - toMs(r.created_at);
        if (deltaMs < 0) continue;
        if (deltaMs > 7 * 24 * 3600 * 1000) break;
        samples.push({
          inbound_id:  r.id,
          outbound_id: nxt.id,
          minutes:     Math.round(deltaMs / 60000),
        });
        break;
      }
    }
    const avg = samples.length === 0
      ? 0
      : Math.round(samples.reduce((a, s) => a + s.minutes, 0) / samples.length);
    return { avg_minutes: avg, n: samples.length, samples };
  }

  /* -------------------------------------------------------- */
  /*  lastTouch                                               */
  /* -------------------------------------------------------- */
  lastTouch(customerId) {
    if (!customerId) return { days: null, last: null };
    const ids = this._byCustomer.get(String(customerId)) || new Set();
    let lastRow = null;
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      if (r.erased_at) continue;
      if (!lastRow || toMs(r.created_at) > toMs(lastRow.created_at)) {
        lastRow = r;
      }
    }
    if (!lastRow) return { days: null, last: null };
    const nowMs = toMs(this._now());
    const days = Math.floor((nowMs - toMs(lastRow.created_at)) / (24 * 3600 * 1000));
    return {
      days,
      last: {
        id:         lastRow.id,
        channel:    lastRow.channel,
        direction:  lastRow.direction,
        created_at: lastRow.created_at,
        subject:    lastRow.subject,
      },
    };
  }

  /* -------------------------------------------------------- */
  /*  summarizeInteraction                                    */
  /* -------------------------------------------------------- */
  summarizeInteraction(commId) {
    const r = this.store.get(commId);
    if (!r) return null;
    const text = r.body || '';
    const tldr = shortSummary(text, this.summaryMaxLen);
    const isHe = hasHebrew(text) || hasHebrew(r.subject);
    return {
      id:          r.id,
      channel:     r.channel,
      direction:   r.direction,
      subject:     r.subject,
      summary:     tldr,
      summary_he:  isHe ? `תקציר: ${tldr}` : null,
      summary_en:  isHe ? null : `Summary: ${tldr}`,
      length:      text.length,
      sentiment:   r.sentiment,
      created_at:  r.created_at,
    };
  }

  /* -------------------------------------------------------- */
  /*  exportHistory                                           */
  /* -------------------------------------------------------- */
  exportHistory(customerId) {
    if (!customerId) throw new Error('commLog.exportHistory: customerId required');
    const ids = this._byCustomer.get(String(customerId)) || new Set();
    const rows = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (r) rows.push(r);
    }
    rows.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
    return {
      customer_id: String(customerId),
      exported_at: this._now(),
      count: rows.length,
      legal_basis: 'חוק הגנת הפרטיות, התשמ"א-1981 / GDPR art.15',
      records: rows.map((r) => ({
        id:          r.id,
        channel:     r.channel,
        direction:   r.direction,
        from:        r.from,
        to:          r.to,
        subject:     r.subject,
        body:        r.body,
        outcome:     r.outcome,
        duration:    r.duration,
        tags:        r.tags.slice(),
        attachments: r.attachments.map((a) => ({ ...a })),
        related_to:  { ...r.related_to },
        created_at:  r.created_at,
        sentiment:   r.sentiment,
        erased_at:   r.erased_at,
      })),
    };
  }

  /* -------------------------------------------------------- */
  /*  gdprErase — PDPL תיקון 13                                */
  /*                                                           */
  /*  Rule: לא מוחקים רק משדרגים ומגדלים.                        */
  /*    The row ITSELF is never destroyed — legal hold, tax &    */
  /*    audit retention must still be satisfied. Instead the    */
  /*    content fields (body, subject, from, to, attachments)  */
  /*    are pseudonymised and `erased_at` set.                 */
  /* -------------------------------------------------------- */
  gdprErase(customerId, confirmErase, reason = 'data-subject request') {
    if (!customerId) throw new Error('commLog.gdprErase: customerId required');
    if (confirmErase !== true) {
      throw new Error(
        'commLog.gdprErase: explicit confirmErase=true required ' +
        '(Israeli Privacy Law, תיקון 13 §17ה).'
      );
    }
    const ids = this._byCustomer.get(String(customerId)) || new Set();
    const now = this._now();
    const erased = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      if (r.erased_at) continue; // already erased, idempotent
      const patch = {
        subject:    '[erased]',
        body:       '[erased]',
        from:       '[erased]',
        to:         '[erased]',
        attachments: [],
        tags:       [],
        erased_at:  now,
        erased_by:  'system',
        erase_reason: String(reason || ''),
        history: r.history.concat([{
          at: now,
          by: 'system',
          action: 'gdpr_erase',
          note: `PDPL erase — reason: ${reason}`,
        }]),
      };
      const next = this.store.update(id, patch);
      // re-index to remove pseudonymised content from the search index
      this._reindexRow(next);
      erased.push(id);
    }
    this._emit('comm.gdpr_erased', { customer_id: String(customerId), count: erased.length });
    return {
      customer_id: String(customerId),
      erased_count: erased.length,
      erased_ids:   erased,
      erased_at:    now,
      retention_note:
        'Records are pseudonymised, NOT deleted — legal retention duties ' +
        'under חוק הגנת הפרטיות §17ה continue to apply.',
    };
  }

  /* -------------------------------------------------------- */
  /*  assign                                                  */
  /* -------------------------------------------------------- */
  assign(commId, agentId, userId = 'system') {
    const r = this.store.get(commId);
    if (!r) return null;
    const now = this._now();
    const patch = {
      assignee: agentId ? String(agentId) : null,
      history: r.history.concat([{
        at: now,
        by: String(userId || 'system'),
        action: 'assign',
        note: agentId ? `assigned → ${agentId}` : 'unassigned',
      }]),
    };
    const next = this.store.update(commId, patch);
    this._emit('comm.assigned', { id: commId, assignee: agentId });
    return next;
  }

  /* -------------------------------------------------------- */
  /*  extras: get / stats / channelBreakdown                  */
  /* -------------------------------------------------------- */
  get(commId) {
    return this.store.get(commId);
  }

  stats(customerId = null) {
    const rows = customerId
      ? this.timeline(customerId, { limit: Number.MAX_SAFE_INTEGER })
      : this.store.all();
    const by_channel = {};
    const by_direction = { inbound: 0, outbound: 0 };
    let erased = 0;
    for (const r of rows) {
      by_channel[r.channel] = (by_channel[r.channel] || 0) + 1;
      by_direction[r.direction] = (by_direction[r.direction] || 0) + 1;
      if (r.erased_at) erased += 1;
    }
    return {
      total: rows.length,
      by_channel,
      by_direction,
      erased_count: erased,
    };
  }
}

/* ================================================================== */
/*  Internal helpers                                                   */
/* ================================================================== */

function computeSentiment(text) {
  if (!text) return SENTIMENTS.NEUTRAL;
  const low = String(text).toLowerCase();
  let pos = 0, neg = 0;
  for (const w of SENTIMENT_LEXICON.positive) {
    if (low.indexOf(w) !== -1) pos += 1;
  }
  for (const w of SENTIMENT_LEXICON.negative) {
    if (low.indexOf(w) !== -1) neg += 1;
  }
  if (pos === neg) return SENTIMENTS.NEUTRAL;
  return pos > neg ? SENTIMENTS.POSITIVE : SENTIMENTS.NEGATIVE;
}

function sentimentScoreSlice(slice) {
  if (!slice.length) return 0;
  let s = 0;
  for (const r of slice) {
    if (r.sentiment === SENTIMENTS.POSITIVE) s += 1;
    else if (r.sentiment === SENTIMENTS.NEGATIVE) s -= 1;
  }
  return s / slice.length;
}

function scoreHit(row, q) {
  if (!q) return 0;
  let s = 0;
  const subj = (row.subject || '').toLowerCase();
  const body = (row.body || '').toLowerCase();
  // naive: count substring occurrences; subject weighted 3x
  const idxSubj = subj.indexOf(q);
  if (idxSubj !== -1) s += 3;
  const idxBody = body.indexOf(q);
  if (idxBody !== -1) s += 1;
  // token overlap
  const qToks = tokenize(q);
  for (const t of qToks) {
    if (subj.indexOf(t) !== -1) s += 1;
    if (body.indexOf(t) !== -1) s += 0.5;
  }
  return s;
}

/* ================================================================== */
/*  Smoke demo                                                         */
/* ================================================================== */

function __smoke() {
  const log = new CommLog();
  log.logCommunication({
    customerId: 'cust_001',
    channel: 'email',
    direction: 'inbound',
    from: 'dana@example.co.il',
    to: 'support@technokol.co.il',
    subject: 'Problem with invoice #122 — חשבונית שגויה',
    body: 'היי, יש בעיה בחשבונית האחרונה שקיבלתי. הסכום שגוי. תודה, דנה',
  });
  log.logCommunication({
    customerId: 'cust_001',
    channel: 'email',
    direction: 'outbound',
    from: 'support@technokol.co.il',
    to: 'dana@example.co.il',
    subject: 'Re: Problem with invoice #122',
    body: 'שלום דנה, בדקנו — בחשבונית החדשה יופיע המחיר הנכון. מצטערים על אי-הנוחות.',
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(log.stats('cust_001'), null, 2));
  // eslint-disable-next-line no-console
  console.log('lastTouch:', log.lastTouch('cust_001'));
  // eslint-disable-next-line no-console
  console.log('sentiment:', log.sentiment({ customerId: 'cust_001' }));
}

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
  CommLog,
  InMemoryCommStore,
  CHANNELS,
  CHANNEL_LIST,
  DIRECTIONS,
  DIRECTION_LIST,
  OUTCOMES,
  SENTIMENTS,
  SENTIMENT_LEXICON,
  COMM_LABELS_HE,
  // helpers (exported for tests)
  normalizeSubject,
  tokenize,
  computeSentiment,
  shortSummary,
  hasHebrew,
  toMs,
  __smoke,
};
