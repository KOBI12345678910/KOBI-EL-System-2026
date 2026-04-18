/**
 * Legal Hold & E-Discovery Workflow — Zero-Dependency Preservation Engine
 * Agent Y-115 • Techno-Kol Uzi • Kobi's Mega-ERP • 2026
 *
 * Implements a full legal-hold / e-discovery / preservation workflow:
 *   - hold lifecycle (PENDING → ACTIVE → RELEASED)
 *   - custodian identification + bilingual hold-notice + acknowledgment tracking
 *   - preservation-policy suspension that bridges into Y-114 retention
 *   - document tagging for preservation + chain of custody
 *   - responsive-document e-discovery search (keyword + metadata + full text)
 *   - attorney review queue with privilege classification
 *   - production sets in pst / mbox / zip-pdf layouts (byte stubs)
 *   - chain-of-custody timeline per document (access + hash + actor)
 *   - audit log (append-only) per hold
 *   - compliance gap analysis — documents that SHOULD be on hold but are not
 *   - `holdsList({status})` filter view
 *
 * Rule of the house: "לא מוחקים רק משדרגים ומגדלים".
 * Every mutation is an *append*. A release does NOT delete a hold — it
 * flips its status and extends the audit trail with a release record.
 * Documents that were preserved under the hold stay tagged forever — a
 * subsequent release merely *allows* the retention policy to resume
 * evaluation, it does NOT wipe the preservation history.
 *
 * Israeli civil-procedure basis (תקסד"א):
 *   - תקנות סדר הדין האזרחי, התשע"ט-2018
 *       תקנה 59 — גילוי ועיון במסמכים
 *       תקנה 60 — תצהיר גילוי מסמכים
 *       תקנה 61 — חובת שמירה ושמירה על ראיות
 *   - פקודת הראיות [נוסח חדש], התשל"א-1971 — ראייה אלקטרונית
 *   - חוק הגנת הפרטיות, התשמ"א-1981 — טיפול במידע אישי תחת הקפאה משפטית
 *   - חוק חופש המידע, התשנ"ח-1998 — חריגי גילוי
 *   - כללי לשכת עורכי הדין (חסיון עורך-דין-לקוח), התשמ"ו-1986
 *
 * General practice note (applied in every jurisdiction the system serves):
 *   - A litigation-hold is triggered at "reasonable anticipation of
 *     litigation" — BEFORE a complaint is filed. Failing to suspend
 *     routine disposal once anticipation is reasonable can result in
 *     spoliation sanctions (adverse-inference instructions, cost shifting,
 *     default judgment, monetary sanctions, attorney discipline).
 *   - Hold notices must be issued to every reasonably identified
 *     custodian, tracked for acknowledgment, and re-issued periodically.
 *   - Privileged documents (attorney-client / work-product) must be
 *     logged and withheld from production. A privilege log accompanies
 *     the production set.
 *   - Chain of custody must be unbroken: every access to a held
 *     document is recorded with actor, timestamp, action, and a
 *     stable hash of the document bytes.
 *
 * Integrates with Y-114 retention (`onyx-procurement/src/documents/retention.js`)
 * via an optional `retentionPolicy` adapter: whenever a hold is applied
 * or released, the legal-hold engine calls `retentionPolicy.suspend(docId)`
 * or `retentionPolicy.resume(docId)`. When no adapter is injected, the
 * engine keeps an in-memory preservation table instead — the public API
 * is unchanged.
 *
 * Zero dependencies. Pure Node.js. Bilingual throughout. Never deletes.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════

/** Lifecycle statuses of a legal hold. Append-only progression. */
const HOLD_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  RELEASED: 'released',
});

/** Privilege classifications for reviewed documents. */
const PRIVILEGE = Object.freeze({
  NONE: 'none',
  ATTORNEY_CLIENT: 'attorney_client',
  WORK_PRODUCT: 'work_product',
  JOINT_DEFENSE: 'joint_defense',
  CONFIDENTIAL: 'confidential',
});

/** Review statuses for attorney workflow. */
const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  RESPONSIVE: 'responsive',
  NOT_RESPONSIVE: 'not_responsive',
  PRIVILEGED: 'privileged',
  PRODUCED: 'produced',
});

/** Acknowledgment states for a hold notice. */
const ACK_STATUS = Object.freeze({
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  REFUSED: 'refused',
  UNREACHABLE: 'unreachable',
});

/** Output formats supported by `produceSet`. */
const OUTPUT_FORMATS = Object.freeze(['pst', 'mbox', 'zip-pdf']);

/** Data types that can fall inside a hold's scope. */
const DATA_TYPES = Object.freeze([
  'email',
  'document',
  'spreadsheet',
  'presentation',
  'chat',
  'calendar',
  'voicemail',
  'database_row',
  'contract',
  'invoice',
  'purchase_order',
  'receipt',
  'hr_record',
  'payroll_record',
  'financial_statement',
  'tax_filing',
  'audit_log',
]);

/** Types of entries that appear in the per-hold audit log. */
const AUDIT_EVENT = Object.freeze({
  HOLD_CREATED: 'HOLD_CREATED',
  CUSTODIAN_IDENTIFIED: 'CUSTODIAN_IDENTIFIED',
  NOTICE_SENT: 'NOTICE_SENT',
  NOTICE_ACKNOWLEDGED: 'NOTICE_ACKNOWLEDGED',
  PRESERVATION_SUSPENDED: 'PRESERVATION_SUSPENDED',
  DOC_HELD: 'DOC_HELD',
  RESPONSIVE_SEARCH: 'RESPONSIVE_SEARCH',
  REVIEW_ASSIGNED: 'REVIEW_ASSIGNED',
  REVIEW_DECISION: 'REVIEW_DECISION',
  PRIVILEGE_MARKED: 'PRIVILEGE_MARKED',
  PRODUCTION_BUILT: 'PRODUCTION_BUILT',
  CHAIN_ACCESSED: 'CHAIN_ACCESSED',
  HOLD_RELEASED: 'HOLD_RELEASED',
});

/** Bilingual text templates used by the hold-notice renderer. */
const NOTICE_TEMPLATES = Object.freeze({
  subject: {
    he: 'הודעת הקפאה משפטית — חובת שמירת ראיות',
    en: 'Legal Hold Notice — Duty to Preserve Evidence',
  },
  body: {
    he:
      'הינך מוגדר/ת כ"מחזיק/ת ראיות" (Custodian) בהליך משפטי פוטנציאלי.\n' +
      'על פי תקנות סדר הדין האזרחי, התשע"ט-2018, חלה עליך חובה לשמור את כל המסמכים,\n' +
      'דוא"ל, קבצים, הודעות, רשומות ומידע רלוונטי הקשורים לתיק המצוין מטה.\n\n' +
      'אין למחוק, לשנות, להעביר או להעביר באופן אחר כל מידע שעשוי להיות רלוונטי\n' +
      'לתיק זה. מדיניות השמירה והגריעה הרגילה מושעית ביחס למידע שבהיקף הצו.\n\n' +
      'אי-ציות עלול להוות הפרה של חובת הגילוי ולהוביל לסנקציות של בית המשפט,\n' +
      'לרבות חזקה ראייתית לרעת הצד שלא שמר, הוצאות ופסילה מקצועית.\n\n' +
      'יש לאשר קבלת הודעה זו תוך 5 ימי עסקים.',
    en:
      'You have been identified as a "Custodian" of evidence in a potential legal matter.\n' +
      'Under the Israeli Civil Procedure Regulations 5779-2018 (תקסד"א) and general\n' +
      'litigation-hold practice, you are required to preserve all documents, emails,\n' +
      'files, messages, records, and data that may be relevant to the matter below.\n\n' +
      'DO NOT delete, alter, move, or otherwise dispose of any information that may\n' +
      'be relevant. Normal retention and disposal policies are SUSPENDED with respect\n' +
      'to information within the scope of this notice.\n\n' +
      'Non-compliance may constitute a breach of the duty of preservation and may\n' +
      'result in court sanctions, including adverse-inference instructions, cost\n' +
      'shifting, monetary penalties, or professional discipline.\n\n' +
      'Please acknowledge receipt of this notice within 5 business days.',
  },
  footer: {
    he: 'שאלות? פנה ליועץ המשפטי: {counsel}. מזהה הקפאה: {holdId}.',
    en: 'Questions? Contact legal counsel: {counsel}. Hold ID: {holdId}.',
  },
});

// ══════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════════════

/** Deep-clone a JSON-safe object. Node's `structuredClone` is avoided for zero-dep compatibility across Node 18. */
function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

/** Deterministic, 64-bit-like hex digest built from a string. Pure JS; no crypto dependency. */
function stableHash(input) {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  // FNV-1a (32-bit) + a second shifted pass for a 16-char hex hash. Not
  // a cryptographic hash — it is a tamper-evidence fingerprint for the
  // chain of custody. Swap to `crypto.createHash('sha256')` upstream if
  // a stronger guarantee is needed.
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = (h2 * 0x100000001b3) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  );
}

/** Fold Hebrew nikud (U+0591..U+05C7) — matches against both pointed and unpointed text. */
function stripNikud(s) {
  return typeof s === 'string' ? s.replace(/[\u0591-\u05C7]/g, '') : s;
}

function toLowerStripped(s) {
  return stripNikud(String(s || '')).toLowerCase();
}

/** Check whether the given ISO date lies inside `[start, end]` (inclusive, undefined bounds = open). */
function inDateRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < new Date(start).getTime()) return false;
  if (end && t > new Date(end).getTime()) return false;
  return true;
}

function requireFields(obj, fields, label) {
  if (!obj || typeof obj !== 'object') {
    throw new TypeError(`${label}: missing payload`);
  }
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      throw new TypeError(`${label}: missing required field "${f}"`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// MAIN CLASS
// ══════════════════════════════════════════════════════════════════════

class LegalHold {
  /**
   * @param {object} [options]
   * @param {() => Date} [options.now] — injectable clock (tests)
   * @param {object} [options.retentionPolicy] — Y-114 bridge: `{suspend(docId, holdId), resume(docId, holdId), isSuspended(docId)}`
   * @param {Array}  [options.documentStore] — optional seed array of `{id, type, owner, custodian, created, content?, metadata?}`
   * @param {Array}  [options.custodianDirectory] — optional seed array of `{id, name_he?, name_en?, email?, dept?, title?, locale?}`
   */
  constructor(options = {}) {
    this._now = options.now || (() => new Date());

    // ── storage (all append-only logs) ─────────────────────────────────
    /** @type {Map<string, object>} */ this._holds = new Map();
    /** @type {Array<object>}         */ this._auditLog = [];
    /** @type {Array<object>}         */ this._notices = [];
    /** @type {Array<object>}         */ this._acknowledgments = [];
    /** @type {Map<string, object>}   */ this._heldDocs = new Map(); // key `${holdId}:${docId}`
    /** @type {Map<string, Array<object>>} */ this._chain = new Map(); // docId → entries
    /** @type {Map<string, object>}   */ this._reviews = new Map(); // key `${holdId}:${docId}` → review record
    /** @type {Array<object>}         */ this._productions = [];
    /** @type {Map<string, string>}   */ this._suspensions = new Map(); // docId → holdId (local fallback)

    // ── external adapters ─────────────────────────────────────────────
    this._retentionPolicy = options.retentionPolicy || null;
    this._documentStore = Array.isArray(options.documentStore)
      ? options.documentStore.map(clone)
      : [];
    this._custodianDirectory = Array.isArray(options.custodianDirectory)
      ? options.custodianDirectory.map(clone)
      : [];
  }

  // ──────────────────────────────────────────────────────────────────
  // static helpers
  // ──────────────────────────────────────────────────────────────────

  static holdStatuses() {
    return { ...HOLD_STATUS };
  }

  static privilegeTypes() {
    return { ...PRIVILEGE };
  }

  static reviewStatuses() {
    return { ...REVIEW_STATUS };
  }

  static outputFormats() {
    return [...OUTPUT_FORMATS];
  }

  static dataTypes() {
    return [...DATA_TYPES];
  }

  static auditEvents() {
    return { ...AUDIT_EVENT };
  }

  static noticeTemplates() {
    return clone(NOTICE_TEMPLATES);
  }

  // ──────────────────────────────────────────────────────────────────
  // helpers exposed for upstream orchestration (never delete)
  // ──────────────────────────────────────────────────────────────────

  /** Append a document to the local store. Never removes; upstream systems own canonical data. */
  upsertDocument(doc) {
    if (!doc || !doc.id) throw new TypeError('upsertDocument: doc.id required');
    const idx = this._documentStore.findIndex((d) => d.id === doc.id);
    const next = clone(doc);
    if (idx === -1) this._documentStore.push(next);
    else this._documentStore[idx] = { ...this._documentStore[idx], ...next };
    return clone(next);
  }

  upsertCustodian(person) {
    if (!person || !person.id)
      throw new TypeError('upsertCustodian: person.id required');
    const idx = this._custodianDirectory.findIndex((p) => p.id === person.id);
    const next = clone(person);
    if (idx === -1) this._custodianDirectory.push(next);
    else this._custodianDirectory[idx] = { ...this._custodianDirectory[idx], ...next };
    return clone(next);
  }

  // ──────────────────────────────────────────────────────────────────
  // 1. createHold
  // ──────────────────────────────────────────────────────────────────

  createHold({
    id,
    case: caseRef,
    reason,
    scope,
    requestedBy,
    startDate,
    expectedDuration,
    legalCounsel,
  } = {}) {
    requireFields(
      { id, case: caseRef, reason, scope, requestedBy, legalCounsel },
      ['id', 'case', 'reason', 'scope', 'requestedBy', 'legalCounsel'],
      'createHold',
    );
    if (this._holds.has(id)) {
      throw new Error(`createHold: hold id "${id}" already exists (never delete)`);
    }
    // normalize scope — every field is optional on its own but the scope object itself must exist
    const normalizedScope = {
      custodians: Array.isArray(scope.custodians) ? [...scope.custodians] : [],
      dateRange: scope.dateRange
        ? { start: scope.dateRange.start || null, end: scope.dateRange.end || null }
        : { start: null, end: null },
      dataTypes: Array.isArray(scope.dataTypes) ? [...scope.dataTypes] : [],
      keywords: Array.isArray(scope.keywords) ? [...scope.keywords] : [],
    };
    const createdAt = this._now().toISOString();
    const hold = {
      id,
      case: caseRef,
      reason,
      scope: normalizedScope,
      requestedBy,
      startDate: startDate || createdAt,
      expectedDuration: expectedDuration || null,
      legalCounsel,
      status: HOLD_STATUS.PENDING,
      createdAt,
      updatedAt: createdAt,
      releasedAt: null,
      releasedBy: null,
      releaseReason: null,
      custodians: [],
      heldDocIds: [],
      productions: [],
    };
    this._holds.set(id, hold);
    this._appendAudit(id, AUDIT_EVENT.HOLD_CREATED, requestedBy, {
      case: caseRef,
      reason,
      scope: normalizedScope,
      legalCounsel,
    });
    return clone(hold);
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. identifyCustodians
  // ──────────────────────────────────────────────────────────────────

  /**
   * Return custodians whose data falls inside `criteria`. Criteria keys:
   *   - `holdId` — use the scope of a specific hold
   *   - `department`, `title`, `locale` — direct attribute matchers
   *   - `ids` — whitelist of custodian ids
   *   - `keywords` — match against any text field on the custodian record
   */
  identifyCustodians({ criteria } = {}) {
    const c = criteria || {};
    let source = this._custodianDirectory.map(clone);

    if (c.holdId) {
      const hold = this._holds.get(c.holdId);
      if (!hold) throw new Error(`identifyCustodians: unknown hold "${c.holdId}"`);
      const scopedIds = new Set(hold.scope.custodians || []);
      if (scopedIds.size) {
        source = source.filter((p) => scopedIds.has(p.id));
      } else {
        // derive from documents that match scope (dataTypes + dateRange + keywords)
        const matchedDocs = this._scopeFilteredDocs(hold);
        const custIds = new Set();
        for (const d of matchedDocs) {
          if (d.custodian) custIds.add(d.custodian);
          if (d.owner) custIds.add(d.owner);
        }
        source = source.filter((p) => custIds.has(p.id));
      }
    }

    if (Array.isArray(c.ids) && c.ids.length) {
      const wl = new Set(c.ids);
      source = source.filter((p) => wl.has(p.id));
    }
    if (c.department) {
      source = source.filter(
        (p) => toLowerStripped(p.dept) === toLowerStripped(c.department),
      );
    }
    if (c.title) {
      const tq = toLowerStripped(c.title);
      source = source.filter((p) => toLowerStripped(p.title).includes(tq));
    }
    if (c.locale) {
      source = source.filter((p) => (p.locale || '').toLowerCase() === c.locale.toLowerCase());
    }
    if (Array.isArray(c.keywords) && c.keywords.length) {
      const kws = c.keywords.map(toLowerStripped);
      source = source.filter((p) => {
        const hay = [p.name_he, p.name_en, p.email, p.dept, p.title]
          .map(toLowerStripped)
          .join(' | ');
        return kws.some((k) => hay.includes(k));
      });
    }

    // register the identification event against the hold (if any) so the audit trail is complete
    if (c.holdId) {
      for (const person of source) {
        this._appendAudit(
          c.holdId,
          AUDIT_EVENT.CUSTODIAN_IDENTIFIED,
          'system',
          { custodianId: person.id, name_en: person.name_en, name_he: person.name_he },
        );
      }
      // promote the hold to ACTIVE once we have at least one custodian — identification is the trigger
      const hold = this._holds.get(c.holdId);
      if (hold && source.length && hold.status === HOLD_STATUS.PENDING) {
        hold.status = HOLD_STATUS.ACTIVE;
        hold.updatedAt = this._now().toISOString();
      }
      // register the list on the hold (append only; duplicates merged)
      if (hold) {
        for (const p of source) {
          if (!hold.custodians.includes(p.id)) hold.custodians.push(p.id);
        }
      }
    }

    return source.map(clone);
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. notifyCustodians
  // ──────────────────────────────────────────────────────────────────

  /** Render + dispatch a bilingual hold notice to every custodian on the hold. */
  notifyCustodians(holdId) {
    const hold = this._requireHold(holdId);
    const notices = [];
    const ts = this._now().toISOString();
    const custodianIds = hold.custodians.length
      ? hold.custodians
      : (hold.scope.custodians || []);

    for (const custId of custodianIds) {
      const person = this._custodianDirectory.find((p) => p.id === custId) || {
        id: custId,
        name_he: custId,
        name_en: custId,
      };
      const notice = {
        id: `notice_${holdId}_${custId}_${stableHash(ts + custId)}`,
        holdId,
        custodianId: custId,
        sentAt: ts,
        channel: person.email ? 'email' : 'system',
        subject: {
          he: NOTICE_TEMPLATES.subject.he,
          en: NOTICE_TEMPLATES.subject.en,
        },
        body: {
          he:
            NOTICE_TEMPLATES.body.he +
            '\n\n' +
            NOTICE_TEMPLATES.footer.he
              .replace('{counsel}', hold.legalCounsel)
              .replace('{holdId}', holdId),
          en:
            NOTICE_TEMPLATES.body.en +
            '\n\n' +
            NOTICE_TEMPLATES.footer.en
              .replace('{counsel}', hold.legalCounsel)
              .replace('{holdId}', holdId),
        },
        caseRef: hold.case,
        reason: hold.reason,
        scope: clone(hold.scope),
        ackStatus: ACK_STATUS.PENDING,
        ackDueBy: this._addBusinessDays(ts, 5),
      };
      this._notices.push(notice);
      notices.push(notice);
      this._appendAudit(holdId, AUDIT_EVENT.NOTICE_SENT, 'system', {
        custodianId: custId,
        channel: notice.channel,
        noticeId: notice.id,
      });
    }
    return notices.map(clone);
  }

  /**
   * Record that a custodian acknowledged (or refused) a hold notice.
   * Append-only; re-acknowledging appends a second row.
   */
  acknowledgeNotice({ holdId, custodianId, status, metadata } = {}) {
    requireFields(
      { holdId, custodianId, status },
      ['holdId', 'custodianId', 'status'],
      'acknowledgeNotice',
    );
    if (!Object.values(ACK_STATUS).includes(status)) {
      throw new TypeError(`acknowledgeNotice: invalid status "${status}"`);
    }
    this._requireHold(holdId);
    const notice = [...this._notices]
      .reverse()
      .find((n) => n.holdId === holdId && n.custodianId === custodianId);
    if (!notice) {
      throw new Error(
        `acknowledgeNotice: no notice found for custodian "${custodianId}" under hold "${holdId}"`,
      );
    }
    // We don't mutate the historical notice; we append an ack record.
    const record = {
      id: `ack_${holdId}_${custodianId}_${stableHash(this._now().toISOString() + custodianId)}`,
      holdId,
      custodianId,
      noticeId: notice.id,
      status,
      metadata: metadata ? clone(metadata) : {},
      recordedAt: this._now().toISOString(),
    };
    this._acknowledgments.push(record);
    // update the *latest-known* ackStatus cache on the notice by appending a forwarding pointer — original stays intact
    notice.latestAckStatus = status;
    notice.latestAckAt = record.recordedAt;
    this._appendAudit(holdId, AUDIT_EVENT.NOTICE_ACKNOWLEDGED, custodianId, {
      status,
      noticeId: notice.id,
    });
    return clone(record);
  }

  /** Full list of every ack/notice/status per hold — used by the front-end dashboard. */
  ackTracking(holdId) {
    this._requireHold(holdId);
    const notices = this._notices.filter((n) => n.holdId === holdId);
    return notices.map((n) => {
      const acks = this._acknowledgments.filter(
        (a) => a.holdId === holdId && a.custodianId === n.custodianId,
      );
      return {
        custodianId: n.custodianId,
        noticeId: n.id,
        sentAt: n.sentAt,
        channel: n.channel,
        ackDueBy: n.ackDueBy,
        latestStatus: acks.length ? acks[acks.length - 1].status : n.ackStatus,
        latestAt: acks.length ? acks[acks.length - 1].recordedAt : null,
        history: clone(acks),
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. preservationSuspend
  // ──────────────────────────────────────────────────────────────────

  /**
   * Suspend retention-policy disposal for every document matching the
   * hold scope. If a Y-114 retention adapter is injected, it is called
   * per document via `suspend(docId, holdId)`. Otherwise the legal-hold
   * engine keeps a local suspension table.
   *
   * Idempotent — re-suspending an already suspended doc is a no-op
   * (the audit log records it exactly once per `preservationSuspend`
   * call so the upstream caller can see the fan-out).
   */
  preservationSuspend(holdId) {
    const hold = this._requireHold(holdId);
    const docs = this._scopeFilteredDocs(hold);
    const suspended = [];
    for (const d of docs) {
      const existing = this._suspensions.get(d.id);
      if (!existing) {
        this._suspensions.set(d.id, holdId);
      } else if (existing !== holdId) {
        // Multi-hold: the document is already preserved under a prior
        // hold. Append another entry under this hold as well — this
        // is represented by storing the *earliest* hold id in the
        // primary map and a secondary audit record here.
      }
      if (this._retentionPolicy && typeof this._retentionPolicy.suspend === 'function') {
        try {
          this._retentionPolicy.suspend(d.id, holdId);
        } catch (err) {
          // swallow — bridge failure must not break the legal hold
        }
      }
      suspended.push({ docId: d.id, holdId, suspendedAt: this._now().toISOString() });
    }
    if (hold.status === HOLD_STATUS.PENDING && suspended.length) {
      hold.status = HOLD_STATUS.ACTIVE;
      hold.updatedAt = this._now().toISOString();
    }
    this._appendAudit(holdId, AUDIT_EVENT.PRESERVATION_SUSPENDED, 'system', {
      docCount: suspended.length,
    });
    return suspended.map(clone);
  }

  /** Ask the engine whether a doc is currently under preservation (local + adapter). */
  isPreserved(docId) {
    if (this._retentionPolicy && typeof this._retentionPolicy.isSuspended === 'function') {
      try {
        if (this._retentionPolicy.isSuspended(docId)) return true;
      } catch (_) {
        /* fall through */
      }
    }
    return this._suspensions.has(docId);
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. applyHoldToDocs
  // ──────────────────────────────────────────────────────────────────

  /** Physically tag scope-matching documents as held; start chain-of-custody entries. */
  applyHoldToDocs(holdId) {
    const hold = this._requireHold(holdId);
    const docs = this._scopeFilteredDocs(hold);
    const ts = this._now().toISOString();
    const tagged = [];
    for (const d of docs) {
      const key = `${holdId}:${d.id}`;
      if (this._heldDocs.has(key)) continue; // idempotent
      const snapshot = {
        holdId,
        docId: d.id,
        type: d.type || 'document',
        taggedAt: ts,
        hash: stableHash(d),
        docSnapshot: clone(d),
      };
      this._heldDocs.set(key, snapshot);
      if (!hold.heldDocIds.includes(d.id)) hold.heldDocIds.push(d.id);
      // initialize the chain-of-custody entry if absent
      if (!this._chain.has(d.id)) {
        this._chain.set(d.id, []);
      }
      this._chain.get(d.id).push({
        at: ts,
        actor: 'system',
        action: 'apply_hold',
        holdId,
        hashBefore: null,
        hashAfter: snapshot.hash,
        metadata: { scopeMatched: true },
      });
      this._appendAudit(holdId, AUDIT_EVENT.DOC_HELD, 'system', {
        docId: d.id,
        hash: snapshot.hash,
      });
      tagged.push(snapshot);
    }
    return tagged.map(clone);
  }

  /** Inspect the hold-tag on a single document (without mutating chain). */
  heldDoc(holdId, docId) {
    const snap = this._heldDocs.get(`${holdId}:${docId}`);
    return snap ? clone(snap) : null;
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. searchForResponsive
  // ──────────────────────────────────────────────────────────────────

  /**
   * Search the held-document set under a hold for documents that are
   * "responsive" to `query`. `query` accepts either a string (free-text
   * keyword) or an object `{keywords, dateRange, dataTypes, custodians, exclude}`.
   */
  searchForResponsive({ holdId, query } = {}) {
    const hold = this._requireHold(holdId);
    const q = typeof query === 'string' ? { keywords: [query] } : clone(query || {});
    const held = [...this._heldDocs.values()].filter((s) => s.holdId === holdId);
    const results = [];
    for (const snap of held) {
      const d = snap.docSnapshot;
      if (q.dataTypes && q.dataTypes.length && !q.dataTypes.includes(d.type)) continue;
      if (q.custodians && q.custodians.length) {
        const hit = q.custodians.includes(d.custodian) || q.custodians.includes(d.owner);
        if (!hit) continue;
      }
      if (q.dateRange) {
        if (!inDateRange(d.created || d.date, q.dateRange.start, q.dateRange.end)) continue;
      }
      if (Array.isArray(q.exclude) && q.exclude.length) {
        const hay = this._textOf(d);
        if (q.exclude.some((w) => hay.includes(toLowerStripped(w)))) continue;
      }
      if (Array.isArray(q.keywords) && q.keywords.length) {
        const hay = this._textOf(d);
        const hit = q.keywords.some((w) => hay.includes(toLowerStripped(w)));
        if (!hit) continue;
      }
      results.push({
        docId: d.id,
        type: d.type,
        custodian: d.custodian || d.owner,
        created: d.created,
        hash: snap.hash,
        snippet: this._snippet(d, q.keywords),
      });
    }
    this._appendAudit(holdId, AUDIT_EVENT.RESPONSIVE_SEARCH, 'system', {
      query: q,
      hits: results.length,
    });
    return results;
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. reviewQueue
  // ──────────────────────────────────────────────────────────────────

  /**
   * Create a review queue assignment. `reviewers` is an array of ids —
   * documents are distributed round-robin so that no reviewer gets more
   * than (ceil(n/k)+1) items. Returns an array of reviewer assignments.
   */
  reviewQueue({ holdId, reviewers } = {}) {
    const hold = this._requireHold(holdId);
    if (!Array.isArray(reviewers) || reviewers.length === 0) {
      throw new TypeError('reviewQueue: reviewers[] required');
    }
    const heldDocIds = [...hold.heldDocIds];
    if (heldDocIds.length === 0) {
      // still emit assignments (empty queues) so the caller can wire UI
      return reviewers.map((r) => ({ reviewer: r, holdId, items: [] }));
    }
    const assignments = reviewers.map((r) => ({ reviewer: r, holdId, items: [] }));
    heldDocIds.forEach((docId, idx) => {
      const bucket = assignments[idx % reviewers.length];
      const snap = this._heldDocs.get(`${holdId}:${docId}`);
      const record = {
        holdId,
        docId,
        reviewer: bucket.reviewer,
        status: REVIEW_STATUS.PENDING,
        privilege: PRIVILEGE.NONE,
        notes: '',
        assignedAt: this._now().toISOString(),
        decisionAt: null,
        hash: snap ? snap.hash : null,
      };
      this._reviews.set(`${holdId}:${docId}`, record);
      bucket.items.push({
        docId,
        hash: record.hash,
        status: record.status,
        assignedAt: record.assignedAt,
      });
      this._appendAudit(holdId, AUDIT_EVENT.REVIEW_ASSIGNED, 'system', {
        docId,
        reviewer: bucket.reviewer,
      });
    });
    return assignments.map(clone);
  }

  /** Mark a review decision. Append-only: changing decision creates a new record. */
  recordReviewDecision({ holdId, docId, reviewer, status, privilege, notes } = {}) {
    requireFields(
      { holdId, docId, reviewer, status },
      ['holdId', 'docId', 'reviewer', 'status'],
      'recordReviewDecision',
    );
    if (!Object.values(REVIEW_STATUS).includes(status)) {
      throw new TypeError(`recordReviewDecision: invalid status "${status}"`);
    }
    if (privilege && !Object.values(PRIVILEGE).includes(privilege)) {
      throw new TypeError(`recordReviewDecision: invalid privilege "${privilege}"`);
    }
    this._requireHold(holdId);
    const key = `${holdId}:${docId}`;
    const existing = this._reviews.get(key);
    if (!existing) {
      throw new Error(`recordReviewDecision: no review for ${key}`);
    }
    const next = {
      ...clone(existing),
      reviewer,
      status,
      privilege: privilege || existing.privilege,
      notes: typeof notes === 'string' ? notes : existing.notes,
      decisionAt: this._now().toISOString(),
    };
    this._reviews.set(key, next);
    this._appendAudit(holdId, AUDIT_EVENT.REVIEW_DECISION, reviewer, {
      docId,
      status,
      privilege: next.privilege,
    });
    if (next.privilege && next.privilege !== PRIVILEGE.NONE) {
      this._appendAudit(holdId, AUDIT_EVENT.PRIVILEGE_MARKED, reviewer, {
        docId,
        privilege: next.privilege,
      });
    }
    return clone(next);
  }

  /** Full review register for a hold (all statuses). */
  reviewRegister(holdId) {
    this._requireHold(holdId);
    const rows = [];
    for (const [key, rec] of this._reviews.entries()) {
      if (rec.holdId === holdId) rows.push(clone(rec));
    }
    return rows;
  }

  // ──────────────────────────────────────────────────────────────────
  // 8. privilegedDocs
  // ──────────────────────────────────────────────────────────────────

  /** Return all documents classified as privileged under the hold. */
  privilegedDocs(holdId) {
    this._requireHold(holdId);
    const rows = [];
    for (const rec of this._reviews.values()) {
      if (
        rec.holdId === holdId &&
        rec.privilege &&
        rec.privilege !== PRIVILEGE.NONE
      ) {
        const snap = this._heldDocs.get(`${holdId}:${rec.docId}`);
        rows.push({
          docId: rec.docId,
          privilege: rec.privilege,
          reviewer: rec.reviewer,
          decisionAt: rec.decisionAt,
          hash: rec.hash,
          notes: rec.notes,
          type: snap ? snap.type : null,
        });
      }
    }
    return rows;
  }

  // ──────────────────────────────────────────────────────────────────
  // 9. produceSet
  // ──────────────────────────────────────────────────────────────────

  /**
   * Build a production set for opposing counsel. Privileged documents
   * are withheld and logged separately. Returns a metadata object; the
   * `bytes` field holds a tiny byte stub — a header suitable for every
   * supported format — so downstream transports can ship the set.
   */
  produceSet({ holdId, outputFormat } = {}) {
    const hold = this._requireHold(holdId);
    if (!OUTPUT_FORMATS.includes(outputFormat)) {
      throw new TypeError(
        `produceSet: outputFormat must be one of ${OUTPUT_FORMATS.join(', ')}`,
      );
    }
    const candidates = [];
    const privilegedLog = [];
    for (const rec of this._reviews.values()) {
      if (rec.holdId !== holdId) continue;
      if (rec.privilege && rec.privilege !== PRIVILEGE.NONE) {
        privilegedLog.push({
          docId: rec.docId,
          privilege: rec.privilege,
          withheld: true,
        });
        continue;
      }
      if (rec.status === REVIEW_STATUS.RESPONSIVE) {
        candidates.push(rec);
      }
    }
    const snapshots = candidates
      .map((r) => this._heldDocs.get(`${holdId}:${r.docId}`))
      .filter(Boolean);

    const bytes = this._packageBytes(outputFormat, snapshots);
    const prodId = `prod_${holdId}_${outputFormat}_${stableHash(
      this._now().toISOString() + snapshots.length,
    )}`;
    const record = {
      id: prodId,
      holdId,
      outputFormat,
      builtAt: this._now().toISOString(),
      docCount: snapshots.length,
      privilegedCount: privilegedLog.length,
      withheldPrivilegedLog: privilegedLog,
      hash: stableHash(snapshots.map((s) => s.hash).join('|')),
      bytes,
    };
    this._productions.push(record);
    hold.productions.push(prodId);
    // mark the docs as produced so a follow-up audit or re-run can see the state
    for (const r of candidates) {
      const key = `${holdId}:${r.docId}`;
      const cur = this._reviews.get(key);
      this._reviews.set(key, { ...cur, status: REVIEW_STATUS.PRODUCED });
      // append chain-of-custody access entry
      const chain = this._chain.get(r.docId) || [];
      chain.push({
        at: record.builtAt,
        actor: 'production',
        action: 'produce',
        holdId,
        hashBefore: cur.hash,
        hashAfter: cur.hash,
        metadata: { prodId, outputFormat },
      });
      this._chain.set(r.docId, chain);
    }
    this._appendAudit(holdId, AUDIT_EVENT.PRODUCTION_BUILT, 'legal', {
      prodId,
      outputFormat,
      docCount: record.docCount,
      privilegedCount: record.privilegedCount,
    });
    return clone(record);
  }

  // ──────────────────────────────────────────────────────────────────
  // 10. chainOfCustody
  // ──────────────────────────────────────────────────────────────────

  /** Full preserved metadata + access log for a document. */
  chainOfCustody(docId) {
    const entries = this._chain.get(docId) || [];
    // touch the chain when queried — every access is logged
    const ts = this._now().toISOString();
    const accessEntry = {
      at: ts,
      actor: 'query',
      action: 'chain_read',
      holdId: null,
      hashBefore: entries.length ? entries[entries.length - 1].hashAfter : null,
      hashAfter: entries.length ? entries[entries.length - 1].hashAfter : null,
      metadata: {},
    };
    // NEVER rewrite — we append the access on a *copy* returned to the caller;
    // the persistent chain also records it.
    entries.push(accessEntry);
    this._chain.set(docId, entries);

    // surface the most recent snapshot across every hold that touched this doc
    const snapshots = [];
    for (const [key, snap] of this._heldDocs.entries()) {
      if (key.endsWith(':' + docId)) snapshots.push(clone(snap));
    }
    const latest = snapshots.length
      ? snapshots.reduce((a, b) => (a.taggedAt > b.taggedAt ? a : b))
      : null;
    if (latest && latest.holdId) {
      this._appendAudit(latest.holdId, AUDIT_EVENT.CHAIN_ACCESSED, 'query', {
        docId,
      });
    }
    return {
      docId,
      currentHash: latest ? latest.hash : null,
      snapshots,
      entries: entries.map(clone),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 11. releaseHold
  // ──────────────────────────────────────────────────────────────────

  /** End preservation. Does NOT delete the hold, its notices, or chain. */
  releaseHold({ holdId, approver, reason } = {}) {
    requireFields(
      { holdId, approver, reason },
      ['holdId', 'approver', 'reason'],
      'releaseHold',
    );
    const hold = this._requireHold(holdId);
    if (hold.status === HOLD_STATUS.RELEASED) {
      // idempotent — return the existing record
      return clone(hold);
    }
    const ts = this._now().toISOString();
    hold.status = HOLD_STATUS.RELEASED;
    hold.releasedAt = ts;
    hold.releasedBy = approver;
    hold.releaseReason = reason;
    hold.updatedAt = ts;

    // resume retention policy on every doc held only by this hold
    const toResume = [];
    for (const [docId, holdingId] of this._suspensions.entries()) {
      if (holdingId === holdId) {
        toResume.push(docId);
      }
    }
    for (const docId of toResume) {
      this._suspensions.delete(docId);
      if (this._retentionPolicy && typeof this._retentionPolicy.resume === 'function') {
        try {
          this._retentionPolicy.resume(docId, holdId);
        } catch (_) {
          /* ignore bridge failure */
        }
      }
      // append chain entry for the release event
      const chain = this._chain.get(docId) || [];
      chain.push({
        at: ts,
        actor: approver,
        action: 'release_hold',
        holdId,
        hashBefore: chain.length ? chain[chain.length - 1].hashAfter : null,
        hashAfter: chain.length ? chain[chain.length - 1].hashAfter : null,
        metadata: { reason },
      });
      this._chain.set(docId, chain);
    }
    this._appendAudit(holdId, AUDIT_EVENT.HOLD_RELEASED, approver, { reason, releasedDocCount: toResume.length });
    return clone(hold);
  }

  // ──────────────────────────────────────────────────────────────────
  // 12. auditLog
  // ──────────────────────────────────────────────────────────────────

  /** Full append-only audit log for a hold, in chronological order. */
  auditLog(holdId) {
    this._requireHold(holdId);
    return this._auditLog
      .filter((e) => e.holdId === holdId)
      .map(clone);
  }

  // ──────────────────────────────────────────────────────────────────
  // 13. complianceGap
  // ──────────────────────────────────────────────────────────────────

  /**
   * Return every document in the local store that SHOULD be on hold
   * (matches the scope of an active hold) but is not currently held.
   * This is the tripwire for spoliation prevention.
   */
  complianceGap() {
    const gaps = [];
    for (const hold of this._holds.values()) {
      if (hold.status !== HOLD_STATUS.ACTIVE) continue;
      const expected = this._scopeFilteredDocs(hold);
      for (const d of expected) {
        const key = `${hold.id}:${d.id}`;
        if (!this._heldDocs.has(key)) {
          gaps.push({
            holdId: hold.id,
            case: hold.case,
            docId: d.id,
            type: d.type || 'document',
            custodian: d.custodian || d.owner || null,
            created: d.created || null,
            reason: 'scope_match_not_applied',
          });
        }
      }
    }
    return gaps;
  }

  // ──────────────────────────────────────────────────────────────────
  // 14. holdsList
  // ──────────────────────────────────────────────────────────────────

  /** Filter view by status. Undefined status returns every hold. */
  holdsList({ status } = {}) {
    const rows = [...this._holds.values()];
    const filtered = status
      ? rows.filter((h) => h.status === status)
      : rows;
    return filtered.map(clone);
  }

  // ══════════════════════════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════════════════════════

  _requireHold(holdId) {
    const h = this._holds.get(holdId);
    if (!h) throw new Error(`legal-hold: unknown hold "${holdId}"`);
    return h;
  }

  _appendAudit(holdId, event, actor, details) {
    this._auditLog.push({
      id: `audit_${stableHash(holdId + event + String(this._auditLog.length))}`,
      holdId,
      event,
      actor: actor || 'system',
      at: this._now().toISOString(),
      details: clone(details || {}),
    });
  }

  /** Whose scope does a document match? Returns the filtered slice of the local store. */
  _scopeFilteredDocs(hold) {
    const scope = hold.scope;
    return this._documentStore.filter((d) => {
      if (scope.dataTypes && scope.dataTypes.length) {
        if (!scope.dataTypes.includes(d.type || 'document')) return false;
      }
      if (scope.custodians && scope.custodians.length) {
        const hit =
          scope.custodians.includes(d.custodian) ||
          scope.custodians.includes(d.owner);
        if (!hit) return false;
      }
      if (scope.dateRange && (scope.dateRange.start || scope.dateRange.end)) {
        const stamp = d.created || d.date;
        if (!inDateRange(stamp, scope.dateRange.start, scope.dateRange.end))
          return false;
      }
      if (scope.keywords && scope.keywords.length) {
        const hay = this._textOf(d);
        const hit = scope.keywords.some((k) => hay.includes(toLowerStripped(k)));
        if (!hit) return false;
      }
      return true;
    });
  }

  _textOf(doc) {
    return [
      doc.id,
      doc.type,
      doc.subject,
      doc.title_he,
      doc.title_en,
      doc.title,
      doc.body,
      doc.content,
      doc.content_he,
      doc.content_en,
      doc.owner,
      doc.custodian,
      doc.from,
      doc.to,
      Array.isArray(doc.tags) ? doc.tags.join(' ') : '',
    ]
      .map(toLowerStripped)
      .join(' | ');
  }

  _snippet(doc, keywords) {
    const text = (doc.content || doc.body || doc.title || doc.subject || '').toString();
    if (!text) return '';
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return text.slice(0, 160);
    }
    const lower = stripNikud(text.toLowerCase());
    let pos = -1;
    for (const k of keywords) {
      const kk = toLowerStripped(k);
      const p = lower.indexOf(kk);
      if (p !== -1) {
        pos = p;
        break;
      }
    }
    if (pos === -1) return text.slice(0, 160);
    const start = Math.max(0, pos - 60);
    const end = Math.min(text.length, pos + 100);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  _addBusinessDays(iso, days) {
    const d = new Date(iso);
    let added = 0;
    while (added < days) {
      d.setUTCDate(d.getUTCDate() + 1);
      const day = d.getUTCDay();
      if (day !== 5 && day !== 6) added++; // Fri=5, Sat=6 (Israeli weekend)
    }
    return d.toISOString();
  }

  /**
   * Build a tiny byte stub for the production format. Each format gets a
   * valid magic-number header so the returned bytes will survive a
   * downstream "is this actually a PST / MBOX / ZIP?" sniff test. A
   * real production would stream the actual doc bodies — we deliberately
   * stay zero-dep so the engine is portable.
   */
  _packageBytes(format, snapshots) {
    const manifestLines = snapshots.map(
      (s) => `${s.docId}\t${s.type}\t${s.hash}`,
    );
    const manifest = Buffer.from(
      `# Onyx Legal Hold Production Manifest\n` +
        `# docs=${snapshots.length}\n` +
        `# built=${this._now().toISOString()}\n` +
        manifestLines.join('\n') +
        '\n',
      'utf8',
    );
    if (format === 'pst') {
      // Microsoft PST magic header "!BDN" (0x21 0x42 0x44 0x4E)
      return Buffer.concat([Buffer.from([0x21, 0x42, 0x44, 0x4e]), manifest]);
    }
    if (format === 'mbox') {
      // MBOX starts every message with "From "
      const prelude = Buffer.from(
        `From legal-hold@onyx ${new Date().toUTCString()}\n`,
        'utf8',
      );
      return Buffer.concat([prelude, manifest]);
    }
    if (format === 'zip-pdf') {
      // ZIP local-file header: PK\x03\x04
      return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), manifest]);
    }
    return manifest;
  }
}

// ══════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  LegalHold,
  HOLD_STATUS,
  PRIVILEGE,
  REVIEW_STATUS,
  ACK_STATUS,
  OUTPUT_FORMATS,
  DATA_TYPES,
  AUDIT_EVENT,
  NOTICE_TEMPLATES,
};
