/**
 * Legal Hold Workflow Engine  |  מנוע ניהול הקפאה משפטית (דוקומנט-ספציפי)
 * =========================================================================
 *
 * Agent Y-115  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Document-level legal-hold orchestration.
 * Complements Y-150 (general legal-hold over entities & people) — this
 * module tracks the DOCUMENT lifecycle around a litigation, audit, or
 * regulatory matter:
 *
 *     initiate  →  notice  →  ack  →  scope  →  freeze  →  collect
 *            ↓          ↓        ↓        ↓        ↓         ↓
 *            escalate   ●        ●        ●        ●         report-to-court
 *                       └─────────────────────────────┘
 *                                                     ↓
 *                                                  release
 *
 * -------------------------------------------------------------
 * IMMUTABLE RULE: לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 *  • NOTHING is ever deleted.
 *  • `releaseHold(...)` flips status to 'released' and stamps a
 *     release event — the hold record, all custodian notices,
 *     acknowledgments, frozen-doc markers, and collection manifests
 *     are preserved FOREVER.
 *  • Every state transition goes through `_event(...)` which
 *     append-writes to the events log (monotonic seq number).
 *  • Frozen documents become immutable: any attempt to delete,
 *     archive, or modify flagged docs is rejected with a
 *     HOLD_IMMUTABLE error — but the attempt is logged.
 *
 * -------------------------------------------------------------
 * ZERO EXTERNAL DEPS — Node built-ins only
 * -------------------------------------------------------------
 *   - node:crypto    for SHA-256 checksums + holdId/eventId
 *
 * -------------------------------------------------------------
 * BILINGUAL HEBREW RTL + ENGLISH LTR
 * -------------------------------------------------------------
 * Every user-facing label (notice templates, court reports,
 * glossary, status labels) carries both `he` and `en` keys.
 *
 * -------------------------------------------------------------
 * STORAGE MODEL  (all in-memory Maps)
 * -------------------------------------------------------------
 *   _holds         Map<holdId, HoldRecord>
 *   _custodians    Map<`${holdId}::${custodianId}`, CustodianRecord>
 *   _notices       Map<noticeId, NoticeRecord>              (append)
 *   _acks          Map<ackId, AckRecord>                    (append)
 *   _frozenDocs    Map<`${holdId}::${docId}`, FrozenDocRecord>
 *   _docAccessLog  Map<docId, AccessEntry[]>                (append chain)
 *   _collections   Map<collectionId, CollectionManifest>    (append)
 *   _events        Array<Event>                             (append-only)
 *   _seq           Number                                   (monotonic)
 *
 * -------------------------------------------------------------
 * HOLD LIFECYCLE STATES
 * -------------------------------------------------------------
 *   'initiated'          hold opened, no notices yet
 *   'noticed'            at least one custodian has been noticed
 *   'acknowledged'       all custodians acknowledged
 *   'scoped'             documents matched & marked
 *   'collecting'         production in progress
 *   'collected'          production manifest delivered
 *   'released'           matter closed (status flip only, record retained)
 *
 * Y-115 © Techno-Kol Uzi 2026
 */

'use strict';

const crypto = require('node:crypto');

/* ============================================================
 * CONSTANTS — bilingual labels & templates
 * ============================================================ */

const STATUS_LABELS = Object.freeze({
  initiated:    { he: 'נפתח',         en: 'Initiated'    },
  noticed:      { he: 'הוצאה הודעה',  en: 'Noticed'      },
  acknowledged: { he: 'אושר',         en: 'Acknowledged' },
  scoped:       { he: 'מוגדר היקף',   en: 'Scoped'       },
  collecting:   { he: 'איסוף',        en: 'Collecting'   },
  collected:    { he: 'נאסף',         en: 'Collected'    },
  released:     { he: 'שוחרר',        en: 'Released'     },
});

const FORMAT_LABELS = Object.freeze({
  PDF:    { he: 'PDF מסמך',    en: 'PDF document'  },
  native: { he: 'פורמט מקורי', en: 'Native format' },
  image:  { he: 'תמונה/TIFF',  en: 'Image / TIFF'  },
});

const ACK_DEADLINE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const HEBREW_GLOSSARY = Object.freeze([
  { he: 'הקפאה משפטית',        en: 'legal hold',            role: 'core'     },
  { he: 'נאמן מידע',           en: 'custodian',             role: 'party'    },
  { he: 'הודעת הקפאה',         en: 'hold notice',           role: 'workflow' },
  { he: 'אישור קבלה',          en: 'acknowledgment',        role: 'workflow' },
  { he: 'הסלמה',               en: 'escalation',            role: 'workflow' },
  { he: 'היקף מסמכים',         en: 'document scope',        role: 'workflow' },
  { he: 'שרשרת משמורת',        en: 'chain of custody',      role: 'evidence' },
  { he: 'קריטריוני סינון',     en: 'scope filter',          role: 'scope'    },
  { he: 'מילות מפתח',          en: 'keywords',              role: 'scope'    },
  { he: 'טווח תאריכים',         en: 'date range',            role: 'scope'    },
  { he: 'הגשה לבית משפט',      en: 'production',            role: 'output'   },
  { he: 'מצבע בקרה (checksum)', en: 'checksum (SHA-256)',    role: 'evidence' },
  { he: 'שחרור ההקפאה',        en: 'release of hold',       role: 'workflow' },
  { he: 'יומן גישה',            en: 'access log',            role: 'evidence' },
  { he: 'בית משפט',             en: 'court',                 role: 'party'    },
  { he: 'תיק',                  en: 'case / matter',         role: 'core'     },
  { he: 'נאמנות נתונים',       en: 'data stewardship',      role: 'evidence' },
  { he: 'תעודת הקפאה',          en: 'hold certificate',      role: 'output'   },
]);

/* ============================================================
 * NOTICE TEMPLATE — bilingual letter + ack request
 * ============================================================ */
function buildNoticeTemplate({ hold, custodian, lang }) {
  const caseTitle = hold.caseTitle || '';
  const court     = hold.court || '';
  const matter    = hold.matter || '';
  const caseId    = hold.caseId || '';
  const holdId    = hold.holdId;
  const custName  = custodian.name || custodian.custodianId;
  const initMs = typeof hold.initiatedAtMs === 'number'
    ? hold.initiatedAtMs
    : (hold.initiatedAt ? new Date(hold.initiatedAt).getTime() : Date.now());
  const deadlineStamp = new Date(
    initMs + ACK_DEADLINE_DAYS * MS_PER_DAY
  ).toISOString();

  const he = [
    'הודעת הקפאה משפטית / Legal Hold Notice',
    '',
    `שלום ${custName},`,
    '',
    `ברצוננו להודיעך כי נפתח תיק משפטי בנושא: ${caseTitle}`,
    `מספר תיק: ${caseId}`,
    `בית המשפט: ${court}`,
    `עניין: ${matter}`,
    '',
    'בהתאם להוראות הדין ובכפוף לנוהלי Techno-Kol Uzi,',
    'עליך לשמר כל מסמך, הודעה, קובץ, או מידע הקשורים לתיק זה.',
    'אין למחוק, לשנות או להעביר מסמכים אלה.',
    '',
    `מזהה הקפאה: ${holdId}`,
    `מועד אחרון לאישור קבלת ההודעה: ${deadlineStamp}`,
    '',
    'נבקשך לאשר קבלת הודעה זו בהקדם האפשרי.',
    '',
    'בכבוד רב,',
    'מחלקת הייעוץ המשפטי',
  ].join('\n');

  const en = [
    'Legal Hold Notice',
    '',
    `Dear ${custName},`,
    '',
    `You are hereby notified of a legal matter: ${caseTitle}`,
    `Case ID: ${caseId}`,
    `Court: ${court}`,
    `Matter: ${matter}`,
    '',
    'In accordance with applicable law and Techno-Kol Uzi policy,',
    'you must preserve every document, message, file, or data that',
    'may be relevant. Do NOT delete, alter, or transfer such items.',
    '',
    `Hold ID: ${holdId}`,
    `Acknowledgment deadline: ${deadlineStamp}`,
    '',
    'Please acknowledge receipt of this notice at your earliest convenience.',
    '',
    'Sincerely,',
    'Legal Department',
  ].join('\n');

  return {
    subject: {
      he: `הודעת הקפאה משפטית — ${caseTitle}`,
      en: `Legal Hold Notice — ${caseTitle}`,
    },
    body:            { he, en },
    preferred:       lang === 'en' ? en : he,
    ackRequest: {
      he: 'אנא אשר קבלת הודעה זו',
      en: 'Please acknowledge receipt of this notice',
      deadline: deadlineStamp,
      deadlineDays: ACK_DEADLINE_DAYS,
      holdId,
      custodianId: custodian.custodianId,
    },
  };
}

/* ============================================================
 * UTILITY — SHA-256 of any string or Buffer
 * ============================================================ */
function sha256(input) {
  const h = crypto.createHash('sha256');
  if (Buffer.isBuffer(input)) h.update(input);
  else h.update(String(input == null ? '' : input), 'utf8');
  return h.digest('hex');
}

function nowIso(ts) {
  return new Date(ts == null ? Date.now() : ts).toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/* ============================================================
 * LegalHoldWorkflow — the main class
 * ============================================================ */
class LegalHoldWorkflow {
  constructor(options = {}) {
    /** @type {Map<string, object>} */
    this._holds        = new Map();
    /** @type {Map<string, object>} */
    this._custodians   = new Map();
    /** @type {Map<string, object>} */
    this._notices      = new Map();
    /** @type {Map<string, object>} */
    this._acks         = new Map();
    /** @type {Map<string, object>} */
    this._frozenDocs   = new Map();
    /** @type {Map<string, Array<object>>} */
    this._docAccessLog = new Map();
    /** @type {Map<string, object>} */
    this._collections  = new Map();
    /** @type {Array<object>} */
    this._events       = [];
    /** @type {number} monotonic event sequence */
    this._seq          = 0;

    // clock injection for deterministic tests
    this._now = typeof options.now === 'function'
      ? options.now
      : () => Date.now();

    this.ACK_DEADLINE_DAYS = ACK_DEADLINE_DAYS;
  }

  /* ---------- internal: append-only event logger ---------- */
  _event(type, payload) {
    this._seq += 1;
    const ev = Object.freeze({
      seq:       this._seq,
      eventId:   randomId('ev'),
      type,
      at:        nowIso(this._now()),
      payload:   Object.freeze({ ...payload }),
    });
    this._events.push(ev);
    return ev;
  }

  /* ---------- internal: helper to get a hold or throw ---------- */
  _mustHold(holdId) {
    const h = this._holds.get(holdId);
    if (!h) {
      const err = new Error(`HOLD_NOT_FOUND: ${holdId}`);
      err.code = 'HOLD_NOT_FOUND';
      throw err;
    }
    return h;
  }

  /* ---------- internal: transition hold state (never backwards) ---------- */
  _transition(hold, newStatus) {
    const order = [
      'initiated', 'noticed', 'acknowledged',
      'scoped', 'collecting', 'collected', 'released',
    ];
    const cur = order.indexOf(hold.status);
    const nxt = order.indexOf(newStatus);
    // released is terminal except for further release events (idempotent)
    if (hold.status === 'released' && newStatus !== 'released') return false;
    if (nxt < 0) return false;
    // allow 'released' from any state (escape hatch)
    if (newStatus === 'released' || nxt >= cur) {
      hold.status = newStatus;
      hold.updatedAt = nowIso(this._now());
      return true;
    }
    return false;
  }

  /* ============================================================
   * 1. initiateHold
   * ============================================================ */
  initiateHold({
    caseId, court, caseTitle, matter,
    custodians = [], scopeFilter = {}, keywords = [], dateRange = null,
  } = {}) {
    if (!caseId)    throw new Error('INVALID_INPUT: caseId required');
    if (!caseTitle) throw new Error('INVALID_INPUT: caseTitle required');
    if (!court)     throw new Error('INVALID_INPUT: court required');

    const holdId = randomId('hold');
    const initiatedAt = this._now();

    const hold = {
      holdId,
      caseId,
      caseTitle,
      court,
      matter: matter || '',
      scopeFilter: { ...scopeFilter },
      keywords: Array.isArray(keywords) ? keywords.slice() : [],
      dateRange: dateRange ? { ...dateRange } : null,
      status: 'initiated',
      initiatedAt: nowIso(initiatedAt),
      initiatedAtMs: initiatedAt,
      updatedAt: nowIso(initiatedAt),
      custodianIds: [],
      frozenCount: 0,
      collections: [],
      releasedAt: null,
      releaseJustification: null,
      releaseApprover: null,
    };
    this._holds.set(holdId, hold);

    // attach custodians
    for (const c of custodians) {
      const custodianId = typeof c === 'string' ? c : (c && c.custodianId);
      if (!custodianId) continue;
      const key = `${holdId}::${custodianId}`;
      this._custodians.set(key, {
        holdId,
        custodianId,
        name: (typeof c === 'object' && c && c.name) || custodianId,
        email: (typeof c === 'object' && c && c.email) || null,
        lang: (typeof c === 'object' && c && c.lang) || 'he',
        status: 'pending',
        noticedAt: null,
        acknowledgedAt: null,
        escalated: false,
        escalatedAt: null,
      });
      hold.custodianIds.push(custodianId);
    }

    this._event('hold.initiated', {
      holdId, caseId, caseTitle, court, matter,
      custodians: hold.custodianIds.slice(),
      scopeFilter: { ...hold.scopeFilter },
      keywords: hold.keywords.slice(),
      dateRange: hold.dateRange ? { ...hold.dateRange } : null,
    });

    return {
      holdId,
      status: hold.status,
      statusLabel: STATUS_LABELS[hold.status],
      initiatedAt: hold.initiatedAt,
      custodianCount: hold.custodianIds.length,
    };
  }

  /* ============================================================
   * 2. sendCustodianNotice
   * ============================================================ */
  sendCustodianNotice({ holdId, custodianId, lang = 'he' } = {}) {
    const hold = this._mustHold(holdId);
    if (hold.status === 'released') {
      const err = new Error('HOLD_RELEASED: cannot notice a released hold');
      err.code = 'HOLD_RELEASED';
      throw err;
    }
    const key = `${holdId}::${custodianId}`;
    let custodian = this._custodians.get(key);
    if (!custodian) {
      // allow noticing a custodian not declared at init time
      custodian = {
        holdId,
        custodianId,
        name: custodianId,
        email: null,
        lang,
        status: 'pending',
        noticedAt: null,
        acknowledgedAt: null,
        escalated: false,
        escalatedAt: null,
      };
      this._custodians.set(key, custodian);
      hold.custodianIds.push(custodianId);
    }

    const template = buildNoticeTemplate({ hold, custodian, lang });
    const noticeId = randomId('notice');
    const sentAt = this._now();
    const record = Object.freeze({
      noticeId,
      holdId,
      custodianId,
      lang,
      sentAt: nowIso(sentAt),
      sentAtMs: sentAt,
      subject: template.subject,
      body: template.body,
      ackRequest: template.ackRequest,
    });
    this._notices.set(noticeId, record);

    custodian.noticedAt = record.sentAt;
    custodian.status = custodian.status === 'acknowledged'
      ? 'acknowledged'
      : 'noticed';
    custodian.lang = lang;

    this._transition(hold, 'noticed');

    this._event('notice.sent', {
      holdId, custodianId, noticeId, lang,
    });

    return {
      noticeId,
      holdId,
      custodianId,
      lang,
      sentAt: record.sentAt,
      subject: template.subject,
      body: template.body,
      ackRequest: template.ackRequest,
      preferred: template.preferred,
      statusLabel: STATUS_LABELS[hold.status],
    };
  }

  /* ============================================================
   * 3. trackAcknowledgment
   * ============================================================ */
  trackAcknowledgment({
    holdId, custodianId,
    acknowledged = true,
    timestamp = null,
    notes = '',
  } = {}) {
    const hold = this._mustHold(holdId);
    const key = `${holdId}::${custodianId}`;
    const custodian = this._custodians.get(key);
    if (!custodian) {
      const err = new Error(`CUSTODIAN_NOT_FOUND: ${custodianId}`);
      err.code = 'CUSTODIAN_NOT_FOUND';
      throw err;
    }

    const ts = timestamp == null ? this._now() : timestamp;
    const ackId = randomId('ack');
    const record = Object.freeze({
      ackId,
      holdId,
      custodianId,
      acknowledged: !!acknowledged,
      timestamp: nowIso(ts),
      timestampMs: typeof ts === 'number' ? ts : new Date(ts).getTime(),
      notes: String(notes || ''),
    });
    this._acks.set(ackId, record);

    if (acknowledged) {
      custodian.acknowledgedAt = record.timestamp;
      custodian.status = 'acknowledged';
    } else {
      // refusal still logged — the custodian was contacted but
      // declined; append-only means we keep a record of both states
      custodian.status = 'declined';
    }

    // if every custodian has acked, advance hold
    const allAcked = hold.custodianIds.every(cid => {
      const c = this._custodians.get(`${holdId}::${cid}`);
      return c && c.status === 'acknowledged';
    });
    if (allAcked && hold.custodianIds.length > 0) {
      this._transition(hold, 'acknowledged');
    }

    this._event('custodian.ack', {
      holdId, custodianId, acknowledged: !!acknowledged,
      ackId, notes: record.notes,
    });

    return {
      ackId,
      holdId,
      custodianId,
      acknowledged: !!acknowledged,
      timestamp: record.timestamp,
      status: custodian.status,
      statusLabel: STATUS_LABELS[hold.status],
    };
  }

  /* ============================================================
   * 4. scopeDocuments
   * ============================================================ */
  scopeDocuments(holdId, docStore) {
    const hold = this._mustHold(holdId);
    if (!docStore || typeof docStore.findAll !== 'function') {
      throw new Error('INVALID_INPUT: docStore must implement findAll()');
    }

    const all = docStore.findAll();
    const scoped = [];
    const scopeFilter = hold.scopeFilter || {};
    const keywords = (hold.keywords || []).map(k => String(k).toLowerCase());
    const dr = hold.dateRange;

    for (const doc of all) {
      if (!doc || !doc.docId) continue;

      // filter by scopeFilter fields (docType, department, owner, tags)
      let match = true;
      if (scopeFilter.docType && doc.docType !== scopeFilter.docType)   match = false;
      if (match && scopeFilter.department && doc.department !== scopeFilter.department) match = false;
      if (match && scopeFilter.owner && doc.owner !== scopeFilter.owner) match = false;
      if (match && Array.isArray(scopeFilter.tags) && scopeFilter.tags.length > 0) {
        const docTags = Array.isArray(doc.tags) ? doc.tags : [];
        const hit = scopeFilter.tags.some(t => docTags.includes(t));
        if (!hit) match = false;
      }

      // date range
      if (match && dr) {
        const dt = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
        if (!Number.isFinite(dt)) match = false;
        if (match && dr.from && dt < new Date(dr.from).getTime()) match = false;
        if (match && dr.to   && dt > new Date(dr.to).getTime())   match = false;
      }

      // keywords over title/content
      if (match && keywords.length > 0) {
        const hay = [
          doc.title,
          doc.title_he,
          doc.title_en,
          doc.content,
          doc.body,
        ].filter(Boolean).join(' ').toLowerCase();
        const hit = keywords.some(k => hay.includes(k));
        if (!hit) match = false;
      }

      if (match) {
        // mark legalHold on the doc in-store (if mutable) AND call
        // the store's marker if provided
        if (typeof docStore.markHold === 'function') {
          docStore.markHold(doc.docId, true, holdId);
        } else {
          try { doc.legalHold = true; doc.legalHoldId = holdId; } catch (_) {}
        }
        scoped.push(doc.docId);

        // also freeze internally (the engine's own immutable ledger)
        this.freezeDocument(holdId, doc.docId, { source: 'scope' });
      }
    }

    this._transition(hold, 'scoped');
    this._event('scope.applied', {
      holdId,
      matchedCount: scoped.length,
      docIds: scoped.slice(),
    });

    return {
      holdId,
      matchedCount: scoped.length,
      docIds: scoped,
      status: hold.status,
      statusLabel: STATUS_LABELS[hold.status],
    };
  }

  /* ============================================================
   * 5. freezeDocument
   * ============================================================ */
  freezeDocument(holdId, docId, meta = {}) {
    const hold = this._mustHold(holdId);
    if (hold.status === 'released') {
      const err = new Error('HOLD_RELEASED: cannot freeze under released hold');
      err.code = 'HOLD_RELEASED';
      throw err;
    }
    if (!docId) throw new Error('INVALID_INPUT: docId required');

    const key = `${holdId}::${docId}`;
    if (this._frozenDocs.has(key)) {
      // already frozen — log the re-freeze attempt (append-only idempotent)
      this._event('freeze.reaffirm', { holdId, docId });
      return this._frozenDocs.get(key);
    }

    const frozenAt = this._now();
    const record = {
      holdId,
      docId,
      frozenAt: nowIso(frozenAt),
      frozenAtMs: frozenAt,
      immutable: true,
      source: meta.source || 'manual',
    };
    this._frozenDocs.set(key, record);
    hold.frozenCount += 1;

    // create/extend the chain-of-custody access log
    if (!this._docAccessLog.has(docId)) {
      this._docAccessLog.set(docId, []);
    }
    this._docAccessLog.get(docId).push({
      at: record.frozenAt,
      action: 'freeze',
      actor: 'legal-hold-engine',
      holdId,
      reason: meta.source || 'manual',
    });

    this._event('doc.frozen', { holdId, docId, source: record.source });

    return record;
  }

  /**
   * Guard used by outer systems (doc-search, doc-vc, watermark, etc.)
   * to check whether a mutation is permitted. Any attempt on a frozen
   * doc is rejected AND logged — rule: "לא מוחקים רק משדרגים ומגדלים".
   */
  assertMutable(docId, op = 'write', actor = 'system') {
    for (const [key, rec] of this._frozenDocs.entries()) {
      if (!key.endsWith(`::${docId}`)) continue;
      if (!rec.immutable) continue;
      // log the attempt
      if (!this._docAccessLog.has(docId)) this._docAccessLog.set(docId, []);
      this._docAccessLog.get(docId).push({
        at: nowIso(this._now()),
        action: `blocked:${op}`,
        actor,
        holdId: rec.holdId,
        reason: 'HOLD_IMMUTABLE',
      });
      this._event('doc.mutation.blocked', {
        holdId: rec.holdId, docId, op, actor,
      });
      const err = new Error(`HOLD_IMMUTABLE: ${op} rejected on doc ${docId}`);
      err.code = 'HOLD_IMMUTABLE';
      err.holdId = rec.holdId;
      throw err;
    }
    return true;
  }

  /**
   * Record a READ / access event against a document.
   * This feeds the chain-of-custody trail.
   */
  recordAccess(docId, { actor, op = 'read', reason = '' } = {}) {
    if (!docId) throw new Error('INVALID_INPUT: docId required');
    if (!this._docAccessLog.has(docId)) this._docAccessLog.set(docId, []);
    const entry = {
      at: nowIso(this._now()),
      action: op,
      actor: actor || 'unknown',
      reason,
    };
    this._docAccessLog.get(docId).push(entry);
    this._event('doc.access', { docId, actor: entry.actor, op });
    return entry;
  }

  /* ============================================================
   * 6. collectForProduction
   * ============================================================ */
  collectForProduction(holdId, { format = 'PDF', docStore = null } = {}) {
    const hold = this._mustHold(holdId);
    const allowed = ['PDF', 'native', 'image'];
    if (!allowed.includes(format)) {
      throw new Error(`INVALID_INPUT: format must be one of ${allowed.join('|')}`);
    }
    if (hold.status === 'released') {
      const err = new Error('HOLD_RELEASED: cannot collect under released hold');
      err.code = 'HOLD_RELEASED';
      throw err;
    }

    this._transition(hold, 'collecting');

    const frozenKeys = Array.from(this._frozenDocs.keys())
      .filter(k => k.startsWith(`${holdId}::`));
    const entries = [];
    for (const k of frozenKeys) {
      const rec = this._frozenDocs.get(k);
      const docId = rec.docId;
      let payload = null;
      if (docStore && typeof docStore.getRaw === 'function') {
        try { payload = docStore.getRaw(docId); } catch (_) { payload = null; }
      }
      if (payload == null && docStore && typeof docStore.get === 'function') {
        try { payload = docStore.get(docId); } catch (_) { payload = null; }
      }
      const serialized = payload == null
        ? `${holdId}::${docId}::${format}::empty`
        : (typeof payload === 'string' ? payload : JSON.stringify(payload));
      const checksum = sha256(serialized);
      entries.push({
        docId,
        format,
        bytes: Buffer.byteLength(serialized, 'utf8'),
        checksum,
        checksumAlgo: 'SHA-256',
        frozenAt: rec.frozenAt,
        collectedAt: nowIso(this._now()),
      });

      // append to chain of custody
      if (!this._docAccessLog.has(docId)) this._docAccessLog.set(docId, []);
      this._docAccessLog.get(docId).push({
        at: nowIso(this._now()),
        action: 'collect',
        actor: 'legal-hold-engine',
        holdId,
        format,
        checksum,
      });
    }

    // manifest-wide checksum (checksum-of-checksums)
    const manifestHash = sha256(entries.map(e => e.checksum).join('\n'));
    const collectionId = randomId('coll');
    const manifest = Object.freeze({
      collectionId,
      holdId,
      caseId: hold.caseId,
      caseTitle: hold.caseTitle,
      format,
      formatLabel: FORMAT_LABELS[format],
      generatedAt: nowIso(this._now()),
      entryCount: entries.length,
      entries: Object.freeze(entries.map(e => Object.freeze(e))),
      manifestChecksum: manifestHash,
      manifestAlgo: 'SHA-256',
    });
    this._collections.set(collectionId, manifest);
    hold.collections.push(collectionId);
    this._transition(hold, 'collected');

    this._event('production.collected', {
      holdId, collectionId, format,
      entryCount: entries.length,
      manifestChecksum: manifestHash,
    });

    return manifest;
  }

  /* ============================================================
   * 7. releaseHold
   * ============================================================ */
  releaseHold(holdId, justification, approver) {
    const hold = this._mustHold(holdId);
    if (!justification || !String(justification).trim()) {
      throw new Error('INVALID_INPUT: justification required');
    }
    if (!approver || !String(approver).trim()) {
      throw new Error('INVALID_INPUT: approver required');
    }

    if (hold.status === 'released') {
      // idempotent — still log the re-release attempt
      this._event('hold.release.reaffirm', {
        holdId, justification: String(justification), approver: String(approver),
      });
      return {
        holdId,
        status: hold.status,
        statusLabel: STATUS_LABELS[hold.status],
        releasedAt: hold.releasedAt,
        justification: hold.releaseJustification,
        approver: hold.releaseApprover,
        preserved: true,
      };
    }

    const releasedAt = this._now();
    hold.status = 'released';
    hold.releasedAt = nowIso(releasedAt);
    hold.releaseJustification = String(justification);
    hold.releaseApprover = String(approver);
    hold.updatedAt = hold.releasedAt;

    // NOTE: we do NOT delete frozen-doc records, notices, acks,
    // custodians, or collections. Status flip only.
    this._event('hold.released', {
      holdId,
      justification: hold.releaseJustification,
      approver: hold.releaseApprover,
    });

    return {
      holdId,
      status: hold.status,
      statusLabel: STATUS_LABELS[hold.status],
      releasedAt: hold.releasedAt,
      justification: hold.releaseJustification,
      approver: hold.releaseApprover,
      preserved: true,
      retainedRecords: {
        notices:    this._countForHold(this._notices, holdId),
        acks:       this._countForHold(this._acks, holdId),
        frozenDocs: hold.frozenCount,
        collections: hold.collections.length,
      },
    };
  }

  _countForHold(map, holdId) {
    let n = 0;
    for (const v of map.values()) if (v && v.holdId === holdId) n += 1;
    return n;
  }

  /* ============================================================
   * 8. escalation
   * ============================================================ */
  escalation(holdId) {
    const hold = this._mustHold(holdId);
    const escalated = [];
    const nowMs = this._now();
    for (const cid of hold.custodianIds) {
      const key = `${holdId}::${cid}`;
      const c = this._custodians.get(key);
      if (!c) continue;
      if (c.status === 'acknowledged') continue;
      if (!c.noticedAt) continue;
      const noticedMs = new Date(c.noticedAt).getTime();
      const daysElapsed = (nowMs - noticedMs) / MS_PER_DAY;
      if (daysElapsed >= ACK_DEADLINE_DAYS && !c.escalated) {
        c.escalated = true;
        c.escalatedAt = nowIso(nowMs);
        c.status = 'escalated';
        escalated.push(cid);
        this._event('custodian.escalated', {
          holdId, custodianId: cid,
          daysElapsed: Math.round(daysElapsed * 10) / 10,
          escalatedTo: 'manager',
        });
      }
    }
    return {
      holdId,
      escalatedCount: escalated.length,
      escalated,
      thresholdDays: ACK_DEADLINE_DAYS,
    };
  }

  /* ============================================================
   * 9. inProgressHolds
   * ============================================================ */
  inProgressHolds() {
    const active = [];
    for (const h of this._holds.values()) {
      if (h.status !== 'released') {
        active.push({
          holdId: h.holdId,
          caseId: h.caseId,
          caseTitle: h.caseTitle,
          court: h.court,
          status: h.status,
          statusLabel: STATUS_LABELS[h.status],
          initiatedAt: h.initiatedAt,
          updatedAt: h.updatedAt,
          custodianCount: h.custodianIds.length,
          frozenCount: h.frozenCount,
          collectionCount: h.collections.length,
        });
      }
    }
    // newest first
    active.sort((a, b) => (a.initiatedAt < b.initiatedAt ? 1 : -1));
    return active;
  }

  /* ============================================================
   * 10. reportToCourt
   * ============================================================ */
  reportToCourt(holdId) {
    const hold = this._mustHold(holdId);
    const custodianRows = hold.custodianIds.map(cid => {
      const c = this._custodians.get(`${holdId}::${cid}`);
      return c ? {
        custodianId: cid,
        name: c.name,
        status: c.status,
        noticedAt: c.noticedAt,
        acknowledgedAt: c.acknowledgedAt,
        escalated: c.escalated,
      } : null;
    }).filter(Boolean);

    const collections = hold.collections.map(cid => {
      const m = this._collections.get(cid);
      if (!m) return null;
      return {
        collectionId: cid,
        format: m.format,
        entryCount: m.entryCount,
        generatedAt: m.generatedAt,
        manifestChecksum: m.manifestChecksum,
      };
    }).filter(Boolean);

    const core = {
      holdId,
      caseId: hold.caseId,
      caseTitle: hold.caseTitle,
      court: hold.court,
      matter: hold.matter,
      status: hold.status,
      initiatedAt: hold.initiatedAt,
      updatedAt: hold.updatedAt,
      releasedAt: hold.releasedAt,
      releaseJustification: hold.releaseJustification,
      releaseApprover: hold.releaseApprover,
      frozenCount: hold.frozenCount,
      custodians: custodianRows,
      collections,
      keywords: hold.keywords.slice(),
      dateRange: hold.dateRange ? { ...hold.dateRange } : null,
    };

    const he = [
      'דו"ח הקפאה משפטית לבית משפט',
      '======================================',
      `מספר תיק: ${hold.caseId}`,
      `כותרת התיק: ${hold.caseTitle}`,
      `בית משפט: ${hold.court}`,
      `עניין: ${hold.matter}`,
      `סטטוס ההקפאה: ${STATUS_LABELS[hold.status].he}`,
      `נפתח בתאריך: ${hold.initiatedAt}`,
      `מספר נאמני מידע: ${custodianRows.length}`,
      `מספר מסמכים בהקפאה: ${hold.frozenCount}`,
      `אוספי הגשה שנוצרו: ${collections.length}`,
      hold.releasedAt
        ? `שוחרר בתאריך: ${hold.releasedAt} — על ידי ${hold.releaseApprover}`
        : 'סטטוס: פעיל',
    ].join('\n');

    const en = [
      'Legal Hold Report to Court',
      '======================================',
      `Case ID: ${hold.caseId}`,
      `Case Title: ${hold.caseTitle}`,
      `Court: ${hold.court}`,
      `Matter: ${hold.matter}`,
      `Hold status: ${STATUS_LABELS[hold.status].en}`,
      `Initiated at: ${hold.initiatedAt}`,
      `Custodians: ${custodianRows.length}`,
      `Frozen documents: ${hold.frozenCount}`,
      `Production collections: ${collections.length}`,
      hold.releasedAt
        ? `Released at: ${hold.releasedAt} — by ${hold.releaseApprover}`
        : 'Status: Active',
    ].join('\n');

    const reportChecksum = sha256(JSON.stringify(core));

    return {
      he,
      en,
      core,
      reportChecksum,
      reportAlgo: 'SHA-256',
      generatedAt: nowIso(this._now()),
    };
  }

  /* ============================================================
   * 11. chainOfCustody
   * ============================================================ */
  chainOfCustody(docId) {
    if (!docId) throw new Error('INVALID_INPUT: docId required');
    const raw = this._docAccessLog.get(docId) || [];
    const entries = raw.map(e => ({ ...e }));

    // derive relevant holds
    const holdIds = [];
    for (const [key, rec] of this._frozenDocs.entries()) {
      if (key.endsWith(`::${docId}`)) holdIds.push(rec.holdId);
    }

    // manifest refs that included this doc
    const manifestRefs = [];
    for (const m of this._collections.values()) {
      if (m.entries.some(e => e.docId === docId)) {
        manifestRefs.push({
          collectionId: m.collectionId,
          holdId: m.holdId,
          format: m.format,
          manifestChecksum: m.manifestChecksum,
          generatedAt: m.generatedAt,
        });
      }
    }

    // trail hash: pinning the order/content of the chain
    const trailHash = sha256(JSON.stringify(entries));

    return {
      docId,
      entryCount: entries.length,
      entries,
      holdIds,
      manifestRefs,
      trailHash,
      trailAlgo: 'SHA-256',
    };
  }

  /* ============================================================
   * Introspection helpers (non-mutating)
   * ============================================================ */
  getHold(holdId)        { return this._holds.get(holdId) || null; }
  getNotice(noticeId)    { return this._notices.get(noticeId) || null; }
  getAck(ackId)          { return this._acks.get(ackId) || null; }
  getCollection(colId)   { return this._collections.get(colId) || null; }
  listEvents()           { return this._events.slice(); }
  eventCount()           { return this._events.length; }
  holdCount()            { return this._holds.size; }
  frozenCountFor(holdId) {
    let n = 0;
    for (const k of this._frozenDocs.keys()) if (k.startsWith(`${holdId}::`)) n += 1;
    return n;
  }
  statusLabels()         { return STATUS_LABELS; }
  glossary()             { return HEBREW_GLOSSARY.slice(); }
  formatLabels()         { return FORMAT_LABELS; }
}

/* ============================================================
 * EXPORTS
 * ============================================================ */
module.exports = {
  LegalHoldWorkflow,
  STATUS_LABELS,
  FORMAT_LABELS,
  HEBREW_GLOSSARY,
  ACK_DEADLINE_DAYS,
  buildNoticeTemplate,
  sha256,
};
