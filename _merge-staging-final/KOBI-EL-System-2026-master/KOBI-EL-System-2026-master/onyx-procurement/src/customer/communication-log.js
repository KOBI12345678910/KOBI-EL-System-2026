/**
 * Unified Customer Communication Log — יומן תקשורת לקוחות מאוחד
 * ─────────────────────────────────────────────────────────────
 * Agent Y-096 — Techno-Kol Uzi mega-ERP 2026 / onyx-procurement
 * Date: 2026-04-11
 *
 * Zero-dependency, append-only, in-memory aggregator for every customer
 * interaction across six channels:
 *
 *   email, sms, call, in-person, chat, whatsapp
 *
 * This module upgrades (does NOT replace) the earlier `comm-log.js` that
 * Agent Y-095/96 shipped. The mega-ERP rule is immutable:
 *
 *   "לא מוחקים רק משדרגים ומגדלים"
 *   (We never delete, we only upgrade and grow.)
 *
 * Therefore this file is a net-new sibling of `comm-log.js`. Both can
 * coexist. Downstream callers can migrate at their own pace.
 *
 * ─── Design principles ─────────────────────────────────────────────────
 *   1. Append-only. Every call to recordInteraction() produces a new
 *      immutable row. Rows are NEVER mutated, never deleted, never
 *      re-ordered in place. Retrieval returns defensive copies.
 *   2. Pure Node — `node:crypto` for IDs only, no external deps.
 *   3. Deterministic — same inputs → same outputs. No Math.random.
 *   4. Hebrew RTL + bilingual labels — every enum has a HE glossary.
 *   5. Defensive — invalid channel, invalid direction, missing customer
 *      all throw `TypeError` with a bilingual message.
 *   6. Safe to call from workers, HTTP handlers, batch jobs, tests.
 *
 * ─── Public API ─────────────────────────────────────────────────────────
 *   const log = new CommunicationLog();
 *   const id  = log.recordInteraction({ ... });
 *   log.getTimeline(customerId, { dateRange, channels, owners, directions });
 *   log.countByChannel(customerId, period);
 *   log.responseTime({ customerId, maxGapHours: 24 });
 *   log.lastTouch(customerId);
 *   log.silenceAlerts(90);
 *   log.search(query, { customerId, channel, contains });
 *   log.taggedInteractions(tag);
 *   log.attachDocument({ interactionId, docId });
 *   log.sentimentTrend(customerId, period);
 *   log.loginAction(ownerId, period);
 *   log.deduplicateThread(interactions);
 *
 * ─── Returned shapes ────────────────────────────────────────────────────
 * Interaction row (immutable):
 * {
 *   id, customerId, channel, direction, subject, content,
 *   contactId, ownerId, timestamp (ms),
 *   attachments[], sentiment, tags[], createdAt (ms), version, docRefs[]
 * }
 *
 * All timestamps are stored and returned as numeric epoch-ms to keep
 * serialisation predictable. Callers convert with `new Date(ts)`.
 *
 * ─── Rule enforcement (append-only) ─────────────────────────────────────
 * The internal `_rows` array is frozen per-element. A separate
 * `_attachmentsByInteraction` Map tracks attached docs as ADDITIONAL rows
 * — the original interaction is never modified. `attachDocument()` adds
 * a doc reference row, and `getTimeline()` merges them at read time.
 *
 * @module customer/communication-log
 * @author Agent Y-096
 */

'use strict';

const crypto = require('node:crypto');

/* ══════════════════════════════════════════════════════════════════════
 * Enums + bilingual labels
 * ══════════════════════════════════════════════════════════════════════ */

const CHANNELS = Object.freeze([
  'email',
  'sms',
  'call',
  'in-person',
  'chat',
  'whatsapp',
]);

const DIRECTIONS = Object.freeze(['inbound', 'outbound']);

const SENTIMENTS = Object.freeze(['positive', 'neutral', 'negative']);

const CHANNEL_LABELS_HE = Object.freeze({
  email: 'דוא"ל',
  sms: 'מסרון',
  call: 'שיחת טלפון',
  'in-person': 'פגישה פנים אל פנים',
  chat: 'צ\'אט',
  whatsapp: 'ווטסאפ',
});

const CHANNEL_LABELS_EN = Object.freeze({
  email: 'Email',
  sms: 'SMS',
  call: 'Phone call',
  'in-person': 'In-person meeting',
  chat: 'Chat',
  whatsapp: 'WhatsApp',
});

const DIRECTION_LABELS_HE = Object.freeze({
  inbound: 'נכנס',
  outbound: 'יוצא',
});

const DIRECTION_LABELS_EN = Object.freeze({
  inbound: 'Inbound',
  outbound: 'Outbound',
});

const SENTIMENT_LABELS_HE = Object.freeze({
  positive: 'חיובי',
  neutral: 'ניטרלי',
  negative: 'שלילי',
});

const GLOSSARY_HE = Object.freeze({
  interaction: 'אינטראקציה',
  timeline: 'ציר זמן',
  thread: 'שרשור',
  silence: 'שתיקה',
  responseTime: 'זמן תגובה',
  attachment: 'קובץ מצורף',
  sentiment: 'סנטימנט / טון',
  tag: 'תגית',
  owner: 'אחראי',
  customer: 'לקוח',
  contact: 'איש קשר',
  appendOnly: 'צבירה בלבד — אסור למחוק',
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/* ══════════════════════════════════════════════════════════════════════
 * Helpers
 * ══════════════════════════════════════════════════════════════════════ */

function _newId() {
  // Crypto-random 16-char hex prefix keeps ids unique within a process
  // without an external UUID library. Two calls in the same tick return
  // two different ids.
  return 'itx_' + crypto.randomBytes(8).toString('hex');
}

function _coerceTimestamp(ts) {
  if (ts == null) return Date.now();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new TypeError(
    'communication-log: invalid timestamp / חותמת זמן לא תקינה: ' + String(ts)
  );
}

function _assertEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new TypeError(
      `communication-log: invalid ${name} "${value}" / ערך לא תקין. ` +
        `Allowed: ${allowed.join(', ')}`
    );
  }
}

function _normalizeText(s) {
  if (s == null) return '';
  return String(s).toLowerCase();
}

function _normalizeSubjectForThread(subject) {
  if (subject == null) return '';
  let s = String(subject).trim();
  // Strip common reply / forward prefixes (Hebrew + English)
  // Repeat until no prefix left — handles "Re: Re: Fwd: ..."
  const prefixes = [
    /^re\s*:\s*/i,
    /^fw\s*:\s*/i,
    /^fwd\s*:\s*/i,
    /^תגובה\s*:\s*/i,
    /^מענה\s*:\s*/i,
    /^העברה\s*:\s*/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const rx of prefixes) {
      if (rx.test(s)) {
        s = s.replace(rx, '').trim();
        changed = true;
      }
    }
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
}

function _periodToRange(period, nowMs) {
  // period may be:
  //   { from, to }              — explicit range
  //   { days: N }               — last N days ending at now
  //   'all' / null / undefined  — open range
  const now = nowMs == null ? Date.now() : nowMs;
  if (period == null || period === 'all') {
    return { from: -Infinity, to: Infinity };
  }
  if (typeof period === 'object') {
    const from =
      period.from != null ? _coerceTimestamp(period.from) : -Infinity;
    const to = period.to != null ? _coerceTimestamp(period.to) : Infinity;
    if (typeof period.days === 'number' && Number.isFinite(period.days)) {
      return { from: now - period.days * DAY_MS, to: now };
    }
    return { from, to };
  }
  throw new TypeError(
    'communication-log: invalid period / תקופה לא תקינה: ' + String(period)
  );
}

function _deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) {
      _deepFreeze(obj[k]);
    }
  }
  return obj;
}

function _copyRow(row) {
  // Return a mutable shallow copy (arrays copied) so callers can JSON-
  // stringify / assign without touching the frozen originals.
  return {
    id: row.id,
    customerId: row.customerId,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    content: row.content,
    contactId: row.contactId,
    ownerId: row.ownerId,
    timestamp: row.timestamp,
    attachments: Array.from(row.attachments),
    sentiment: row.sentiment,
    tags: Array.from(row.tags),
    createdAt: row.createdAt,
    version: row.version,
    docRefs: Array.from(row.docRefs),
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * Main class
 * ══════════════════════════════════════════════════════════════════════ */

class CommunicationLog {
  constructor(options = {}) {
    // _rows is the append-only ledger. It is frozen per element and the
    // array itself is never spliced. We only .push().
    this._rows = [];
    this._byId = new Map();
    this._byCustomer = new Map();
    this._byOwner = new Map();
    this._byTag = new Map();
    // additional doc references added via attachDocument() — append-only
    this._docRefs = new Map(); // interactionId -> [docId, docId...]
    // optional custom clock (unit tests pass { now: () => fixedMs })
    this._now = typeof options.now === 'function' ? options.now : Date.now;
  }

  /* ─── write path ───────────────────────────────────────────────────── */

  /**
   * Record a new interaction. Append-only. Returns the generated id.
   *
   * @param {object} opts
   * @param {string} opts.customerId  REQUIRED
   * @param {string} opts.channel     one of CHANNELS
   * @param {string} opts.direction   'inbound' | 'outbound'
   * @param {string} [opts.subject]   short summary
   * @param {string} [opts.content]   full message body
   * @param {string} [opts.contactId] optional contact at the customer side
   * @param {string} [opts.ownerId]   internal rep who logged it
   * @param {number|string|Date} [opts.timestamp]  when the interaction
   *        actually happened (defaults to now)
   * @param {string[]} [opts.attachments]
   * @param {'positive'|'neutral'|'negative'} [opts.sentiment]
   * @param {string[]} [opts.tags]
   */
  recordInteraction(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError(
        'communication-log: recordInteraction requires an options object / ' +
          'חובה להעביר אובייקט'
      );
    }
    const {
      customerId,
      channel,
      direction,
      subject,
      content,
      contactId,
      ownerId,
      timestamp,
      attachments,
      sentiment,
      tags,
    } = opts;

    if (!customerId || typeof customerId !== 'string') {
      throw new TypeError(
        'communication-log: customerId required / שדה customerId חובה'
      );
    }
    _assertEnum('channel', channel, CHANNELS);
    _assertEnum('direction', direction, DIRECTIONS);
    if (sentiment != null) _assertEnum('sentiment', sentiment, SENTIMENTS);

    const ts = _coerceTimestamp(timestamp);
    const createdAt = this._now();

    const row = {
      id: _newId(),
      customerId: String(customerId),
      channel,
      direction,
      subject: subject == null ? '' : String(subject),
      content: content == null ? '' : String(content),
      contactId: contactId == null ? null : String(contactId),
      ownerId: ownerId == null ? null : String(ownerId),
      timestamp: ts,
      attachments: Array.isArray(attachments)
        ? attachments.map(String)
        : [],
      sentiment: sentiment == null ? null : sentiment,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      createdAt,
      version: 1,
      docRefs: [], // populated at read-time by attachDocument
    };

    _deepFreeze(row);
    this._rows.push(row);
    this._byId.set(row.id, row);

    // secondary indexes
    if (!this._byCustomer.has(row.customerId)) {
      this._byCustomer.set(row.customerId, []);
    }
    this._byCustomer.get(row.customerId).push(row.id);

    if (row.ownerId) {
      if (!this._byOwner.has(row.ownerId)) this._byOwner.set(row.ownerId, []);
      this._byOwner.get(row.ownerId).push(row.id);
    }

    for (const t of row.tags) {
      if (!this._byTag.has(t)) this._byTag.set(t, []);
      this._byTag.get(t).push(row.id);
    }

    return row.id;
  }

  /* ─── read path ────────────────────────────────────────────────────── */

  /**
   * Chronological timeline for a customer.
   * @param {string} customerId
   * @param {object} [filters]
   * @param {object} [filters.dateRange]  { from, to } epoch-ms or Date
   * @param {string[]} [filters.channels]
   * @param {string[]} [filters.owners]
   * @param {string[]} [filters.directions]
   */
  getTimeline(customerId, filters = {}) {
    if (!customerId) {
      throw new TypeError('communication-log: customerId required');
    }
    const ids = this._byCustomer.get(customerId) || [];
    const dr = filters.dateRange || {};
    const from = dr.from != null ? _coerceTimestamp(dr.from) : -Infinity;
    const to = dr.to != null ? _coerceTimestamp(dr.to) : Infinity;

    const channelSet = Array.isArray(filters.channels)
      ? new Set(filters.channels)
      : null;
    const ownerSet = Array.isArray(filters.owners)
      ? new Set(filters.owners)
      : null;
    const dirSet = Array.isArray(filters.directions)
      ? new Set(filters.directions)
      : null;

    const out = [];
    for (const id of ids) {
      const row = this._byId.get(id);
      if (!row) continue;
      if (row.timestamp < from || row.timestamp > to) continue;
      if (channelSet && !channelSet.has(row.channel)) continue;
      if (ownerSet && !ownerSet.has(row.ownerId)) continue;
      if (dirSet && !dirSet.has(row.direction)) continue;
      const copy = _copyRow(row);
      // Merge doc-refs that were added AFTER the interaction was recorded.
      const extraDocs = this._docRefs.get(row.id);
      if (extraDocs && extraDocs.length) {
        copy.docRefs = extraDocs.slice();
      }
      out.push(copy);
    }
    out.sort((a, b) => a.timestamp - b.timestamp);
    return out;
  }

  /**
   * Interaction counts per channel for a given period.
   */
  countByChannel(customerId, period) {
    const { from, to } = _periodToRange(period, this._now());
    const counts = {};
    for (const ch of CHANNELS) counts[ch] = 0;
    const ids = this._byCustomer.get(customerId) || [];
    for (const id of ids) {
      const row = this._byId.get(id);
      if (!row) continue;
      if (row.timestamp < from || row.timestamp > to) continue;
      counts[row.channel] = (counts[row.channel] || 0) + 1;
    }
    return counts;
  }

  /**
   * Average response time (ms) from an inbound message to the next
   * outbound message from the same owner or any owner, up to maxGapHours.
   *
   *   For every inbound i at t_i, find the next outbound at t_o where
   *   (t_o - t_i) <= maxGapHours*3600s. Ignore inbounds with no reply
   *   within the gap (those feed a separate 'unanswered' counter).
   *
   * Returns { avgMs, avgHours, responded, unanswered, sample }.
   */
  responseTime({ customerId, maxGapHours = 24 } = {}) {
    if (!customerId) {
      throw new TypeError('communication-log: customerId required');
    }
    const ids = this._byCustomer.get(customerId) || [];
    const rows = ids
      .map((id) => this._byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);

    const gapMs = maxGapHours * HOUR_MS;
    const deltas = [];
    let unanswered = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.direction !== 'inbound') continue;
      let matched = false;
      for (let j = i + 1; j < rows.length; j++) {
        const next = rows[j];
        if (next.timestamp - row.timestamp > gapMs) break;
        if (next.direction === 'outbound') {
          deltas.push(next.timestamp - row.timestamp);
          matched = true;
          break;
        }
      }
      if (!matched) unanswered++;
    }

    const sum = deltas.reduce((a, b) => a + b, 0);
    const avgMs = deltas.length ? sum / deltas.length : null;
    return {
      avgMs,
      avgHours: avgMs == null ? null : avgMs / HOUR_MS,
      responded: deltas.length,
      unanswered,
      sample: deltas.length + unanswered,
    };
  }

  /**
   * Most recent interaction for the customer and how many days ago it was.
   */
  lastTouch(customerId) {
    const ids = this._byCustomer.get(customerId) || [];
    if (!ids.length) return null;
    let latest = null;
    for (const id of ids) {
      const row = this._byId.get(id);
      if (!row) continue;
      if (!latest || row.timestamp > latest.timestamp) latest = row;
    }
    if (!latest) return null;
    const now = this._now();
    const daysAgo = Math.floor((now - latest.timestamp) / DAY_MS);
    return {
      interaction: _copyRow(latest),
      daysAgo,
      ageMs: now - latest.timestamp,
    };
  }

  /**
   * Customers that haven't had any interaction in `threshold` days.
   * Returns a sorted array of { customerId, lastTouchTs, daysSilent }.
   */
  silenceAlerts(threshold = 90) {
    const now = this._now();
    const out = [];
    for (const [cust, ids] of this._byCustomer.entries()) {
      let latestTs = -Infinity;
      for (const id of ids) {
        const row = this._byId.get(id);
        if (row && row.timestamp > latestTs) latestTs = row.timestamp;
      }
      if (latestTs === -Infinity) continue;
      const daysSilent = Math.floor((now - latestTs) / DAY_MS);
      if (daysSilent >= threshold) {
        out.push({ customerId: cust, lastTouchTs: latestTs, daysSilent });
      }
    }
    out.sort((a, b) => b.daysSilent - a.daysSilent);
    return out;
  }

  /**
   * Full-text search on subject + content. Case-insensitive, whole-
   * substring match. Optional filters narrow the scope.
   */
  search(query, filters = {}) {
    const q = _normalizeText(query);
    if (!q) return [];
    const { customerId, channel, contains } = filters;
    const source = customerId
      ? (this._byCustomer.get(customerId) || []).map((id) =>
          this._byId.get(id)
        )
      : this._rows;

    const extra = contains ? _normalizeText(contains) : null;
    const out = [];
    for (const row of source) {
      if (!row) continue;
      if (channel && row.channel !== channel) continue;
      const hay =
        _normalizeText(row.subject) + '\n' + _normalizeText(row.content);
      if (!hay.includes(q)) continue;
      if (extra && !hay.includes(extra)) continue;
      out.push(_copyRow(row));
    }
    out.sort((a, b) => a.timestamp - b.timestamp);
    return out;
  }

  /**
   * All interactions tagged with the given tag. Returns defensive copies.
   */
  taggedInteractions(tag) {
    const ids = this._byTag.get(String(tag)) || [];
    const out = [];
    for (const id of ids) {
      const row = this._byId.get(id);
      if (row) out.push(_copyRow(row));
    }
    out.sort((a, b) => a.timestamp - b.timestamp);
    return out;
  }

  /**
   * Link a document (from the document manager) to an existing interaction.
   * The original row is NEVER mutated — we keep the linkage in a parallel
   * Map so append-only semantics hold. Returns { interactionId, docRefs }.
   */
  attachDocument({ interactionId, docId } = {}) {
    if (!interactionId || !docId) {
      throw new TypeError(
        'communication-log: attachDocument requires { interactionId, docId }'
      );
    }
    const row = this._byId.get(interactionId);
    if (!row) {
      throw new Error(
        'communication-log: unknown interactionId ' + interactionId
      );
    }
    if (!this._docRefs.has(interactionId)) {
      this._docRefs.set(interactionId, []);
    }
    const refs = this._docRefs.get(interactionId);
    if (!refs.includes(docId)) refs.push(String(docId));
    return { interactionId, docRefs: refs.slice() };
  }

  /**
   * Sentiment time-series for a customer over a period.
   * Returns an array of { timestamp, sentiment, score } where score is
   *   +1 for positive, 0 for neutral, -1 for negative, null if unknown.
   * Also returns rolling average as `rollingAvg`.
   */
  sentimentTrend(customerId, period) {
    const { from, to } = _periodToRange(period, this._now());
    const ids = this._byCustomer.get(customerId) || [];
    const points = [];
    for (const id of ids) {
      const row = this._byId.get(id);
      if (!row) continue;
      if (row.timestamp < from || row.timestamp > to) continue;
      const score =
        row.sentiment === 'positive'
          ? 1
          : row.sentiment === 'negative'
            ? -1
            : row.sentiment === 'neutral'
              ? 0
              : null;
      points.push({
        timestamp: row.timestamp,
        sentiment: row.sentiment,
        score,
      });
    }
    points.sort((a, b) => a.timestamp - b.timestamp);
    const scored = points.filter((p) => p.score != null);
    const rollingAvg = scored.length
      ? scored.reduce((a, b) => a + b.score, 0) / scored.length
      : null;
    return { points, rollingAvg, sample: scored.length };
  }

  /**
   * Audit — how many interactions each owner logged in a period.
   * Returns { ownerId, count, byChannel, byDirection }.
   */
  loginAction(ownerId, period) {
    const { from, to } = _periodToRange(period, this._now());
    const ids = this._byOwner.get(ownerId) || [];
    let count = 0;
    const byChannel = {};
    const byDirection = { inbound: 0, outbound: 0 };
    for (const ch of CHANNELS) byChannel[ch] = 0;
    for (const id of ids) {
      const row = this._byId.get(id);
      if (!row) continue;
      if (row.timestamp < from || row.timestamp > to) continue;
      count++;
      byChannel[row.channel] = (byChannel[row.channel] || 0) + 1;
      byDirection[row.direction] = (byDirection[row.direction] || 0) + 1;
    }
    return { ownerId, count, byChannel, byDirection };
  }

  /**
   * Group a list of interactions into email threads.
   * Two interactions belong to the same thread when:
   *   - channel === 'email'
   *   - normalizedSubject (re:/fwd:/תגובה: stripped) matches
   *   - timestamps are within 30 days of each other in the sorted chain
   *
   * Returns an array of thread objects:
   *   { subject, count, first, last, interactionIds[] }
   */
  deduplicateThread(interactions) {
    if (!Array.isArray(interactions)) {
      throw new TypeError(
        'communication-log: deduplicateThread expects an array'
      );
    }
    const THREAD_GAP = 30 * DAY_MS;

    // Only email interactions thread — others remain as single-row groups.
    const groups = new Map(); // key -> [interaction]
    for (const itx of interactions) {
      if (!itx || typeof itx !== 'object') continue;
      const key =
        itx.channel === 'email'
          ? 'email::' + _normalizeSubjectForThread(itx.subject)
          : 'solo::' + (itx.id || _newId());
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(itx);
    }

    const threads = [];
    for (const [key, list] of groups.entries()) {
      const sorted = list.slice().sort((a, b) => a.timestamp - b.timestamp);
      // Split long-dormant reactivations into separate threads.
      let bucket = [];
      const flush = () => {
        if (!bucket.length) return;
        threads.push({
          subject: _normalizeSubjectForThread(bucket[0].subject),
          channel: bucket[0].channel,
          count: bucket.length,
          first: bucket[0].timestamp,
          last: bucket[bucket.length - 1].timestamp,
          interactionIds: bucket.map((x) => x.id),
        });
        bucket = [];
      };
      for (const itx of sorted) {
        if (
          bucket.length &&
          itx.timestamp - bucket[bucket.length - 1].timestamp > THREAD_GAP
        ) {
          flush();
        }
        bucket.push(itx);
      }
      flush();
    }
    threads.sort((a, b) => a.first - b.first);
    return threads;
  }

  /* ─── safety getters ───────────────────────────────────────────────── */

  /** Total number of interactions in the log (append-only). */
  size() {
    return this._rows.length;
  }

  /**
   * Return a defensive copy of ALL rows. For exports / backups.
   */
  exportAll() {
    return this._rows.map(_copyRow);
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * Module exports
 * ══════════════════════════════════════════════════════════════════════ */

module.exports = {
  CommunicationLog,
  CHANNELS,
  DIRECTIONS,
  SENTIMENTS,
  CHANNEL_LABELS_HE,
  CHANNEL_LABELS_EN,
  DIRECTION_LABELS_HE,
  DIRECTION_LABELS_EN,
  SENTIMENT_LABELS_HE,
  GLOSSARY_HE,
  // exposed for tests / advanced callers
  __internal__: {
    _normalizeSubjectForThread,
    _periodToRange,
    _coerceTimestamp,
    _copyRow,
    DAY_MS,
    HOUR_MS,
  },
};
