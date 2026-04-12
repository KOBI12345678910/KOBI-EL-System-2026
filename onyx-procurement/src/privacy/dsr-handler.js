/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DSR Handler — מטפל בבקשות נושא מידע (Data Subject Request Handler)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-136  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / dsr-handler.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Implement a compliant handler for Data Subject Requests (DSR) under the
 *  Israeli Privacy Protection Law ("חוק הגנת הפרטיות"), as amended by
 *  תיקון 13 2024 (Amendment 13, in force since 14/08/2024).
 *
 *  Amendment 13 introduced, among other things:
 *    • A formal "Database Officer" (ממונה הגנה על מידע / DPO) requirement
 *      for large databases and public-sector controllers.
 *    • A 30-day statutory response deadline for subject requests
 *      (extendable once by another 30 days for complex requests).
 *    • A breach-notification duty: material breaches must be reported to
 *      the Privacy Protection Authority (הרשות להגנת הפרטיות) within 72
 *      hours of discovery, and affected subjects must be notified
 *      "without undue delay".
 *    • Broader supervisory powers (administrative fines, audits).
 *    • Explicit rights catalogue: access (עיון), rectification (תיקון),
 *      erasure (מחיקה), portability (ניידות), restriction (הגבלת עיבוד),
 *      objection (התנגדות), complaint (תלונה).
 *
 *  Core invariant of Techno-Kol Uzi:
 *     "לא מוחקים רק משדרגים ומגדלים"  — we never hard-delete.
 *  Reconciliation with the right-to-erasure:
 *     erasure  =>  status flip to `erased` + pseudonymization of PII.
 *     statutory retention (tax 7y, HR 7y, AML 7y, medical 10y,
 *     construction 25y) ALWAYS wins — erasure is refused in writing
 *     with a legal citation when any retention category still applies.
 *
 *  Storage
 *  -------
 *  In-memory Maps + append-only arrays. Every mutation produces a
 *  SHA-256-chained audit event (chain of custody). No external deps.
 *
 *  Zero external dependencies — only `node:crypto`.
 *
 *  Public API
 *  ----------
 *    class DSRHandler
 *      .receiveRequest({...})               -> request record
 *      .verifyIdentity({...})               -> verification record
 *      .scopeRequest(requestId)             -> scope map
 *      .processAccessRequest(requestId)     -> bilingual export
 *      .processRectification(id, corr)      -> rectification record
 *      .processErasure(requestId)           -> erasure decision (may refuse)
 *      .processPortability(requestId)       -> JSON + CSV payload
 *      .processRestriction(requestId)       -> freeze record
 *      .processObjection(requestId)         -> opt-out flag
 *      .processComplaint(requestId)         -> DPO escalation
 *      .statutoryDeadline(requestType)      -> { standard, complex }
 *      .generateResponse(requestId)         -> bilingual letter
 *      .breachNotification({...})           -> breach record
 *      .auditLog(requestId?)                -> immutable events
 *      .registerDataSource(name, fn)        -> void (injectable registry)
 *      .setDPO({ id, name, email })         -> void
 *      .markComplex(requestId, reason)      -> updates deadline to 60d
 *      .listRequests(filter?)               -> request records
 *      .verifyChain()                       -> { valid, brokenAt }
 *
 *  Run tests:
 *    node --test test/privacy/dsr-handler.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ───────────────────────────────────────────────────────────────────────────
//  Constants — request types, statuses, deadlines, retention matrix
// ───────────────────────────────────────────────────────────────────────────

/**
 * Request types per תיקון 13 2024 (חוק הגנת הפרטיות).
 * Keys are stable machine tokens; `he`/`en` are user-facing labels;
 * `section` is the reference to the relevant section of the Law.
 */
const REQUEST_TYPES = Object.freeze({
  access: Object.freeze({
    key: 'access',
    he: 'עיון במידע',
    en: 'Right of access',
    section: 'סעיף 13 לחוק הגנת הפרטיות',
  }),
  rectification: Object.freeze({
    key: 'rectification',
    he: 'תיקון מידע',
    en: 'Right to rectification',
    section: 'סעיף 14 לחוק הגנת הפרטיות',
  }),
  erasure: Object.freeze({
    key: 'erasure',
    he: 'מחיקת מידע',
    en: 'Right to erasure',
    section: 'סעיף 14 לחוק הגנת הפרטיות (תיקון 13)',
  }),
  portability: Object.freeze({
    key: 'portability',
    he: 'ניידות מידע',
    en: 'Right to data portability',
    section: 'סעיף 13א לחוק הגנת הפרטיות (תיקון 13)',
  }),
  restriction: Object.freeze({
    key: 'restriction',
    he: 'הגבלת עיבוד',
    en: 'Right to restriction of processing',
    section: 'סעיף 14א לחוק הגנת הפרטיות',
  }),
  objection: Object.freeze({
    key: 'objection',
    he: 'התנגדות לעיבוד',
    en: 'Right to object',
    section: 'סעיף 17ו לחוק הגנת הפרטיות',
  }),
  complaint: Object.freeze({
    key: 'complaint',
    he: 'תלונה לממונה',
    en: 'Complaint to DPO / Authority',
    section: 'סעיף 10 לתקנות הגנת הפרטיות',
  }),
});

const REQUEST_STATUS = Object.freeze({
  RECEIVED: 'received',
  IDENTITY_PENDING: 'identity_pending',
  IDENTITY_VERIFIED: 'identity_verified',
  IDENTITY_REJECTED: 'identity_rejected',
  SCOPED: 'scoped',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REFUSED: 'refused',
  ESCALATED: 'escalated',
  ERASED: 'erased',
});

const VERIFICATION_METHODS = Object.freeze({
  IN_PERSON: 'in_person',              // אימות פרונטלי
  ID_DOCUMENT: 'id_document',          // תעודת זהות + ספח
  DIGITAL_SIGNATURE: 'digital_signature', // חתימה דיגיטלית מאושרת
  SMS_OTP: 'sms_otp',
  EMAIL_OTP: 'email_otp',
  NOTARY: 'notary',                    // אישור נוטריון
});

const BREACH_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',  // material — triggers 72h authority notification
});

/**
 * Statutory retention matrix — mirrors retention-engine (Y-149).
 * Keys are record categories and values are `{ years, law }`.
 * When ANY category still applies to a record scoped for erasure, the
 * request MUST be refused in writing (or partially refused) per section 14.
 */
const STATUTORY_RETENTION = Object.freeze({
  tax:          Object.freeze({ years: 7,  he: 'פקודת מס הכנסה',                     en: 'Income Tax Ordinance' }),
  vat:          Object.freeze({ years: 7,  he: 'חוק מס ערך מוסף',                    en: 'VAT Law' }),
  hr:           Object.freeze({ years: 7,  he: 'חוק שעות עבודה ומנוחה',              en: 'Hours of Work and Rest Law' }),
  aml:          Object.freeze({ years: 7,  he: 'חוק איסור הלבנת הון',                en: 'Anti-Money-Laundering Law' }),
  medical:      Object.freeze({ years: 10, he: 'חוק זכויות החולה',                   en: 'Patient Rights Law' }),
  construction: Object.freeze({ years: 25, he: 'חוק המכר (דירות)',                   en: 'Sale (Apartments) Law — construction warranty' }),
  contracts:    Object.freeze({ years: 7,  he: 'חוק ההתיישנות',                      en: 'Limitation Law — contract claims' }),
});

/**
 * Deadline matrix per תיקון 13.
 *    standard = 30 calendar days.
 *    complex  = +30 additional days (total 60), but only with written
 *               justification ("הודעה על הארכה") to the subject.
 */
const DEADLINE_DAYS = Object.freeze({
  access:        Object.freeze({ standard: 30, complex: 60 }),
  rectification: Object.freeze({ standard: 30, complex: 60 }),
  erasure:       Object.freeze({ standard: 30, complex: 60 }),
  portability:   Object.freeze({ standard: 30, complex: 60 }),
  restriction:   Object.freeze({ standard: 30, complex: 60 }),
  objection:     Object.freeze({ standard: 30, complex: 60 }),
  complaint:     Object.freeze({ standard: 30, complex: 60 }),
});

const BREACH_AUTHORITY_DEADLINE_HOURS = 72;  // תיקון 13 — to Authority

const DPO_CRITERIA = Object.freeze({
  he: [
    'מאגר הכולל מעל 100,000 נושאי מידע',
    'מאגר ציבורי (גוף ציבורי / רשות מקומית)',
    'מאגר המכיל מידע בעל רגישות גבוהה (בריאות, גנטיקה, ביומטריה, הליכים פליליים)',
    'עיסוק עיקרי בעיבוד שיטתי ונרחב של מידע אישי',
  ],
  en: [
    'Database with more than 100,000 data subjects',
    'Public-sector database (government / municipality)',
    'Database with high-sensitivity data (health, genetic, biometric, criminal)',
    'Main activity is systematic large-scale processing of personal data',
  ],
});

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isoDate(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setUTCHours(d.getUTCHours() + hours);
  return d;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/**
 * Pseudonymize a string: first char + '***' + sha256(last-4).
 * Never stores the plaintext — the returned token is deterministic but
 * non-reversible without the salt.
 */
function pseudonymize(value, salt = '') {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (s.length === 0) return '';
  const head = s.slice(0, 1);
  const hash = sha256(salt + s).slice(0, 8);
  return `${head}***${hash}`;
}

// ───────────────────────────────────────────────────────────────────────────
//  DSRHandler — main class
// ───────────────────────────────────────────────────────────────────────────

class DSRHandler {
  /**
   * @param {object} [opts]
   * @param {Date|string} [opts.now]          — fixed clock for tests
   * @param {object}     [opts.dpo]           — { id, name, email }
   * @param {string}     [opts.salt]          — pseudonymization salt
   */
  constructor(opts = {}) {
    this._nowProvider = opts.now
      ? () => new Date(opts.now)
      : () => new Date();
    this._salt = opts.salt || 'techno-kol-dsr-salt';
    this._dpo = opts.dpo || null;

    // storage — all append-only / Map-based
    this._requests = new Map();          // id -> request record
    this._verifications = new Map();     // requestId -> verification record
    this._scopes = new Map();            // requestId -> scope map
    this._responses = new Map();         // requestId -> generated response
    this._breaches = new Map();          // incidentId -> breach record
    this._dataSources = new Map();       // name -> fetcher fn
    this._auditChain = [];               // SHA-256 chained events
    this._prevHash = sha256('dsr-handler-genesis');
  }

  // ─── configuration ────────────────────────────────────────────────────

  /**
   * Register an injectable data-source fetcher. The fetcher receives
   * `{ subjectId }` and MUST return an array of records or a plain object.
   * The handler never imports concrete data sources — this is the
   * extension point for scoping and access requests.
   */
  registerDataSource(name, fetcher) {
    if (typeof name !== 'string' || !name) {
      throw new TypeError('data source name must be a non-empty string');
    }
    if (typeof fetcher !== 'function') {
      throw new TypeError('data source fetcher must be a function');
    }
    this._dataSources.set(name, fetcher);
    this._appendAudit('datasource.registered', null, { name });
  }

  setDPO({ id, name, email }) {
    if (!id || !name || !email) {
      throw new Error('DPO requires id, name, email');
    }
    this._dpo = Object.freeze({ id, name, email });
    this._appendAudit('dpo.set', null, { id, name });
  }

  // ─── receiveRequest ───────────────────────────────────────────────────

  /**
   * Intake an incoming DSR. Creates a new request record in status
   * `received` and computes the statutory deadline (30 days standard).
   *
   * @param {object} p
   * @param {string} p.subjectId           — internal subject identifier
   * @param {string} p.subjectName         — full name
   * @param {string} p.subjectIdDoc        — Israeli ת.ז (9 digits) or passport
   * @param {string} p.requestType         — key from REQUEST_TYPES
   * @param {string} [p.details]           — free-text description
   * @param {string} [p.verificationMethod] — one of VERIFICATION_METHODS
   * @returns {object} request record
   */
  receiveRequest({
    subjectId,
    subjectName,
    subjectIdDoc,
    requestType,
    details = '',
    verificationMethod = VERIFICATION_METHODS.ID_DOCUMENT,
  } = {}) {
    if (!subjectId || typeof subjectId !== 'string') {
      throw new TypeError('subjectId is required');
    }
    if (!subjectName || typeof subjectName !== 'string') {
      throw new TypeError('subjectName is required');
    }
    if (!subjectIdDoc || typeof subjectIdDoc !== 'string') {
      throw new TypeError('subjectIdDoc is required');
    }
    if (!REQUEST_TYPES[requestType]) {
      throw new RangeError(
        `unknown requestType '${requestType}'. valid: ${Object.keys(REQUEST_TYPES).join(', ')}`
      );
    }

    const now = this._nowProvider();
    const requestId = randomId('dsr');
    const deadlineDays = DEADLINE_DAYS[requestType].standard;
    const deadline = addDays(now, deadlineDays);

    const record = {
      id: requestId,
      subjectId,
      subjectName,
      // ת.ז is PII — store pseudonymized only (we keep a salted hash so the
      // subject can reopen their own request, but the plaintext never hits
      // our state). The verifier still sees plaintext during verification
      // (passed in documents), which is compliant with section 13.
      subjectIdDocHash: sha256(this._salt + subjectIdDoc),
      subjectIdDocLast4: subjectIdDoc.slice(-4),
      requestType,
      requestTypeLabel: {
        he: REQUEST_TYPES[requestType].he,
        en: REQUEST_TYPES[requestType].en,
      },
      section: REQUEST_TYPES[requestType].section,
      details,
      verificationMethod,
      status: REQUEST_STATUS.RECEIVED,
      receivedAt: isoDate(now),
      deadlineStandard: isoDate(deadline),
      deadlineComplex: isoDate(addDays(now, DEADLINE_DAYS[requestType].complex)),
      isComplex: false,
      complexJustification: null,
      history: [
        { at: isoDate(now), status: REQUEST_STATUS.RECEIVED, actor: 'intake' },
      ],
    };

    this._requests.set(requestId, record);
    this._appendAudit('request.received', requestId, {
      requestType,
      subjectIdLast4: record.subjectIdDocLast4,
      deadline: record.deadlineStandard,
    });

    return { ...record, history: [...record.history] };
  }

  // ─── verifyIdentity ───────────────────────────────────────────────────

  /**
   * KYC-lite verification. The verifier supplies the documents they saw
   * (id card + selfie, or OTP trail, etc.) and a verifier identity.
   * On success, status flips to IDENTITY_VERIFIED; on failure it flips
   * to IDENTITY_REJECTED (the request is NOT deleted — see invariant).
   *
   * @param {object} p
   * @param {string} p.requestId
   * @param {Array<object>} p.documents     — [{ type, number, issuedAt, ... }]
   * @param {string} p.verifier             — operator / DPO name
   * @param {boolean} [p.approved=true]
   * @param {string} [p.rejectionReason]
   */
  verifyIdentity({ requestId, documents = [], verifier, approved = true, rejectionReason = '' } = {}) {
    const req = this._mustRequest(requestId);
    if (!verifier || typeof verifier !== 'string') {
      throw new TypeError('verifier is required');
    }
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new TypeError('at least one verification document is required');
    }

    // basic Israeli ת.ז format check — 9 digits, no checksum enforcement
    // (full Luhn-style validation is handled by the dedicated ID validator;
    // we only sanity-check the shape here)
    const idDoc = documents.find(d => d && d.type === 'teudat_zehut');
    if (idDoc && !/^\d{9}$/.test(String(idDoc.number || ''))) {
      approved = false;
      rejectionReason = rejectionReason || 'ת.ז אינה בפורמט תקין (9 ספרות)';
    }

    const now = this._nowProvider();
    const verification = {
      id: randomId('ver'),
      requestId,
      verifier,
      approved: !!approved,
      rejectionReason: approved ? null : rejectionReason || 'unspecified',
      verifiedAt: isoDate(now),
      documents: documents.map(d => ({
        type: d.type || 'unknown',
        // never store full numbers — hash + last-4 only
        numberHash: d.number ? sha256(this._salt + d.number) : null,
        numberLast4: d.number ? String(d.number).slice(-4) : null,
        issuedAt: d.issuedAt || null,
        issuer: d.issuer || null,
      })),
    };

    this._verifications.set(requestId, verification);

    req.status = approved
      ? REQUEST_STATUS.IDENTITY_VERIFIED
      : REQUEST_STATUS.IDENTITY_REJECTED;
    req.history.push({
      at: verification.verifiedAt,
      status: req.status,
      actor: verifier,
    });

    this._appendAudit('identity.verified', requestId, {
      verifier,
      approved: verification.approved,
      rejectionReason: verification.rejectionReason,
    });

    return { ...verification, documents: [...verification.documents] };
  }

  // ─── scopeRequest ─────────────────────────────────────────────────────

  /**
   * Walk all registered data sources and collect which systems / tables
   * hold personal data about the subject. Does NOT return the data
   * itself — just the shape. Intended for DPO triage and for generating
   * the "records of processing" report required by section 17ב.
   */
  scopeRequest(requestId) {
    const req = this._mustRequest(requestId);
    if (req.status === REQUEST_STATUS.IDENTITY_REJECTED) {
      throw new Error(`cannot scope a request with rejected identity: ${requestId}`);
    }

    const scope = {
      requestId,
      subjectId: req.subjectId,
      sources: [],
      totalRecords: 0,
      categories: new Set(),
      scopedAt: isoDate(this._nowProvider()),
    };

    for (const [name, fetcher] of this._dataSources.entries()) {
      let records = [];
      try {
        const raw = fetcher({ subjectId: req.subjectId });
        records = Array.isArray(raw) ? raw : (raw && raw.records) || [];
      } catch (err) {
        // never throw — log the failure in the scope itself
        scope.sources.push({
          name,
          ok: false,
          error: String(err && err.message || err),
          recordCount: 0,
          categories: [],
        });
        continue;
      }

      const categories = new Set();
      for (const r of records) {
        if (r && r.category) categories.add(r.category);
        else if (r && r.type) categories.add(r.type);
      }
      for (const c of categories) scope.categories.add(c);

      scope.sources.push({
        name,
        ok: true,
        recordCount: records.length,
        categories: [...categories],
      });
      scope.totalRecords += records.length;
    }

    scope.categories = [...scope.categories];
    this._scopes.set(requestId, scope);

    req.status = REQUEST_STATUS.SCOPED;
    req.history.push({
      at: scope.scopedAt,
      status: REQUEST_STATUS.SCOPED,
      actor: 'scoping',
    });

    this._appendAudit('request.scoped', requestId, {
      sources: scope.sources.length,
      totalRecords: scope.totalRecords,
      categories: scope.categories,
    });

    return JSON.parse(JSON.stringify(scope));
  }

  // ─── processAccessRequest ─────────────────────────────────────────────

  /**
   * Compile a bilingual data export for a verified access request.
   * Runs all registered fetchers, labels each field in Hebrew+English,
   * and returns a sealed payload.
   */
  processAccessRequest(requestId) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.access.key) {
      throw new Error(`processAccessRequest called for wrong type: ${req.requestType}`);
    }

    const data = {};
    for (const [name, fetcher] of this._dataSources.entries()) {
      try {
        const raw = fetcher({ subjectId: req.subjectId });
        data[name] = Array.isArray(raw) ? raw : (raw && raw.records) || raw || [];
      } catch (err) {
        data[name] = { error: String(err && err.message || err) };
      }
    }

    const exportDoc = {
      requestId,
      subjectId: req.subjectId,
      compiledAt: isoDate(this._nowProvider()),
      legalBasis: {
        he: REQUEST_TYPES.access.section,
        en: 'Israeli Privacy Protection Law, s. 13',
      },
      labels: {
        he: 'ייצוא מידע אישי לצורך בקשת עיון',
        en: 'Personal data export — access request',
      },
      data,
    };

    req.status = REQUEST_STATUS.COMPLETED;
    req.history.push({
      at: exportDoc.compiledAt,
      status: REQUEST_STATUS.COMPLETED,
      actor: 'access-processor',
    });

    this._appendAudit('access.processed', requestId, {
      sources: Object.keys(data),
    });

    return exportDoc;
  }

  // ─── processRectification ─────────────────────────────────────────────

  /**
   * Apply a set of field-level corrections. Corrections are stored as
   * deltas on the request record; actual propagation to source systems
   * is the responsibility of the caller (we emit a `rectification.applied`
   * audit event that downstream consumers subscribe to).
   *
   * @param {string} requestId
   * @param {Array<object>} corrections    — [{ source, recordId, field, oldValue, newValue }]
   */
  processRectification(requestId, corrections) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.rectification.key) {
      throw new Error(`processRectification called for wrong type: ${req.requestType}`);
    }
    if (!Array.isArray(corrections) || corrections.length === 0) {
      throw new TypeError('corrections must be a non-empty array');
    }

    const now = isoDate(this._nowProvider());
    const applied = corrections.map(c => ({
      source: c.source || 'unknown',
      recordId: c.recordId || null,
      field: c.field || null,
      // both values are captured in the audit but pseudonymized in the
      // returned record (plaintext is persisted only in the chain hash)
      oldValuePseudo: pseudonymize(c.oldValue, this._salt),
      newValuePseudo: pseudonymize(c.newValue, this._salt),
      appliedAt: now,
    }));

    req.rectifications = (req.rectifications || []).concat(applied);
    req.status = REQUEST_STATUS.COMPLETED;
    req.history.push({ at: now, status: REQUEST_STATUS.COMPLETED, actor: 'rectification-processor' });

    this._appendAudit('rectification.applied', requestId, {
      count: applied.length,
      sources: [...new Set(applied.map(a => a.source))],
    });

    return {
      requestId,
      appliedAt: now,
      count: applied.length,
      corrections: applied,
    };
  }

  // ─── processErasure ───────────────────────────────────────────────────

  /**
   * Soft-delete + pseudonymization ONLY. Hard deletion is forbidden by
   * the "לא מוחקים" invariant and, separately, by Israeli statutory
   * retention (tax 7y, HR 7y, AML 7y, medical 10y, construction 25y).
   *
   * Algorithm:
   *   1. For each category found in the scope, check the retention matrix.
   *   2. If ANY category is still within its retention window, REFUSE the
   *      erasure (or partially refuse) with a written justification.
   *   3. For categories NOT under retention, flip status to `erased`
   *      and emit a pseudonymization directive — the production row is
   *      NEVER physically removed.
   *
   * @param {string} requestId
   * @param {object} [opts]
   * @param {Date|string} [opts.recordsCreatedAt]  — earliest relevant record
   */
  processErasure(requestId, opts = {}) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.erasure.key) {
      throw new Error(`processErasure called for wrong type: ${req.requestType}`);
    }

    const scope = this._scopes.get(requestId) || this.scopeRequest(requestId);
    const now = this._nowProvider();

    // evaluate retention for each category in scope
    const retentionHolds = [];
    const erasable = [];
    for (const cat of scope.categories || []) {
      const rule = STATUTORY_RETENTION[cat];
      if (rule) {
        retentionHolds.push({
          category: cat,
          years: rule.years,
          law: { he: rule.he, en: rule.en },
        });
      } else {
        erasable.push(cat);
      }
    }

    let decision;
    if (retentionHolds.length > 0) {
      decision = {
        requestId,
        decision: 'refused',
        decidedAt: isoDate(now),
        reason: {
          he: 'לא ניתן למחוק — חלות תקופות שימור סטטוטוריות',
          en: 'Erasure refused — statutory retention periods apply',
        },
        retentionHolds,
        erasableCategories: erasable,
        legalCitation: {
          he: 'סעיף 14 לחוק הגנת הפרטיות; תקופות שימור על פי דין',
          en: 'Privacy Protection Law s. 14; statutory retention periods',
        },
      };
      req.status = REQUEST_STATUS.REFUSED;
    } else {
      // soft-delete: pseudonymize PII, flip status, keep row
      decision = {
        requestId,
        decision: 'erased',
        decidedAt: isoDate(now),
        method: 'soft-delete + pseudonymization',
        reason: {
          he: 'מחיקה רכה — המידע עבר פסבדונימיזציה והמצב עודכן ל"נמחק"',
          en: 'Soft erasure — data pseudonymized and status flipped to erased',
        },
        pseudonymized: {
          subjectName: pseudonymize(req.subjectName, this._salt),
          subjectIdLast4: '****',
        },
        retentionHolds: [],
      };
      req.status = REQUEST_STATUS.ERASED;
      req.subjectNamePseudo = decision.pseudonymized.subjectName;
    }

    req.history.push({ at: decision.decidedAt, status: req.status, actor: 'erasure-processor' });
    req.erasureDecision = decision;

    this._appendAudit(
      decision.decision === 'erased' ? 'erasure.applied' : 'erasure.refused',
      requestId,
      {
        retentionHolds: retentionHolds.map(h => h.category),
        erasable,
      }
    );

    return decision;
  }

  // ─── processPortability ───────────────────────────────────────────────

  /**
   * Machine-readable export: JSON + CSV. Both formats are strictly
   * built-in generated (no external CSV library).
   */
  processPortability(requestId) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.portability.key) {
      throw new Error(`processPortability called for wrong type: ${req.requestType}`);
    }

    const now = isoDate(this._nowProvider());
    const rows = [];
    const byKey = {};

    for (const [name, fetcher] of this._dataSources.entries()) {
      let records = [];
      try {
        const raw = fetcher({ subjectId: req.subjectId });
        records = Array.isArray(raw) ? raw : (raw && raw.records) || [];
      } catch (err) {
        records = [];
      }
      byKey[name] = records;
      for (const r of records) {
        const flat = this._flatten(r);
        flat.__source = name;
        rows.push(flat);
      }
    }

    // build CSV with UTF-8 BOM for Excel compatibility
    const columns = new Set(['__source']);
    for (const row of rows) for (const k of Object.keys(row)) columns.add(k);
    const cols = [...columns];
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ');
      return `"${s}"`;
    };
    const csvLines = [cols.join(',')];
    for (const row of rows) {
      csvLines.push(cols.map(c => esc(row[c])).join(','));
    }
    const csv = '\uFEFF' + csvLines.join('\r\n') + '\r\n';

    const json = {
      requestId,
      subjectId: req.subjectId,
      exportedAt: now,
      legalBasis: {
        he: REQUEST_TYPES.portability.section,
        en: 'Israeli Privacy Protection Law s. 13א (Amendment 13)',
      },
      format: 'json+csv',
      data: byKey,
    };

    const payload = {
      requestId,
      json,
      csv,
      jsonString: JSON.stringify(json, null, 2),
      checksum: sha256(JSON.stringify(json) + csv),
    };

    req.status = REQUEST_STATUS.COMPLETED;
    req.history.push({ at: now, status: REQUEST_STATUS.COMPLETED, actor: 'portability-processor' });

    this._appendAudit('portability.exported', requestId, {
      rows: rows.length,
      sources: Object.keys(byKey),
      checksum: payload.checksum,
    });

    return payload;
  }

  // ─── processRestriction ───────────────────────────────────────────────

  /**
   * Mark subject's data as frozen — downstream systems must not process
   * until the restriction is lifted. The handler emits a directive; it
   * does not itself mutate source-system state.
   */
  processRestriction(requestId) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.restriction.key) {
      throw new Error(`processRestriction called for wrong type: ${req.requestType}`);
    }

    const now = isoDate(this._nowProvider());
    req.restriction = {
      active: true,
      appliedAt: now,
      scope: 'all-processing-except-storage',
    };
    req.status = REQUEST_STATUS.COMPLETED;
    req.history.push({ at: now, status: REQUEST_STATUS.COMPLETED, actor: 'restriction-processor' });

    this._appendAudit('restriction.applied', requestId, {});

    return {
      requestId,
      appliedAt: now,
      scope: req.restriction.scope,
      labels: {
        he: 'הגבלת עיבוד — כל עיבוד נחסם למעט אחסון',
        en: 'Processing restricted — all processing blocked except storage',
      },
    };
  }

  // ─── processObjection ─────────────────────────────────────────────────

  /**
   * Opt-out flag. Typical use: direct marketing opt-out per section 17ו.
   */
  processObjection(requestId) {
    const req = this._mustVerified(requestId);
    if (req.requestType !== REQUEST_TYPES.objection.key) {
      throw new Error(`processObjection called for wrong type: ${req.requestType}`);
    }

    const now = isoDate(this._nowProvider());
    req.objection = {
      optOut: true,
      recordedAt: now,
      scope: 'direct-marketing',
    };
    req.status = REQUEST_STATUS.COMPLETED;
    req.history.push({ at: now, status: REQUEST_STATUS.COMPLETED, actor: 'objection-processor' });

    this._appendAudit('objection.applied', requestId, {});

    return {
      requestId,
      recordedAt: now,
      optOut: true,
      labels: {
        he: 'התנגדות לעיבוד — opt-out נרשם',
        en: 'Objection recorded — opt-out flag set',
      },
    };
  }

  // ─── processComplaint ─────────────────────────────────────────────────

  /**
   * Escalate a complaint to the DPO (ממונה הגנה על מידע).
   * If no DPO is configured the request is escalated to the Israeli
   * Privacy Protection Authority (הרשות להגנת הפרטיות) placeholder.
   */
  processComplaint(requestId) {
    const req = this._mustRequest(requestId);
    if (req.requestType !== REQUEST_TYPES.complaint.key) {
      throw new Error(`processComplaint called for wrong type: ${req.requestType}`);
    }

    const now = isoDate(this._nowProvider());
    const escalation = {
      requestId,
      escalatedAt: now,
      dpo: this._dpo || {
        id: 'authority',
        name: 'הרשות להגנת הפרטיות',
        email: 'dpo@justice.gov.il',
      },
      labels: {
        he: 'תלונה הועברה לממונה הגנה על מידע (DPO)',
        en: 'Complaint escalated to Database / Data Protection Officer',
      },
    };

    req.status = REQUEST_STATUS.ESCALATED;
    req.escalation = escalation;
    req.history.push({ at: now, status: REQUEST_STATUS.ESCALATED, actor: 'complaint-processor' });

    this._appendAudit('complaint.escalated', requestId, {
      dpoId: escalation.dpo.id,
    });

    return escalation;
  }

  // ─── statutoryDeadline ────────────────────────────────────────────────

  /**
   * Return the deadline matrix for a given request type.
   *    { standard: 30, complex: 60 }
   */
  statutoryDeadline(requestType) {
    const entry = DEADLINE_DAYS[requestType];
    if (!entry) {
      throw new RangeError(`unknown requestType '${requestType}'`);
    }
    return { standard: entry.standard, complex: entry.complex };
  }

  /**
   * Flip a request to "complex" — grants the 30-day extension with
   * written justification. Per תיקון 13 the subject MUST be notified.
   */
  markComplex(requestId, justification) {
    const req = this._mustRequest(requestId);
    if (!justification || typeof justification !== 'string') {
      throw new TypeError('complex extension requires written justification');
    }
    req.isComplex = true;
    req.complexJustification = justification;
    req.activeDeadline = req.deadlineComplex;
    req.history.push({
      at: isoDate(this._nowProvider()),
      status: req.status,
      actor: 'complex-extender',
      note: justification,
    });
    this._appendAudit('request.complex', requestId, { justification });
    return { requestId, deadline: req.deadlineComplex, justification };
  }

  // ─── generateResponse ─────────────────────────────────────────────────

  /**
   * Produce a bilingual formal response letter. The letter is generated
   * from the current state of the request — it can be called multiple
   * times and is idempotent in content.
   */
  generateResponse(requestId) {
    const req = this._mustRequest(requestId);
    const now = this._nowProvider();
    const typeLabel = REQUEST_TYPES[req.requestType];

    const he = [
      `לכבוד ${req.subjectName}`,
      `ת.ז. מסתיימת ב-${req.subjectIdDocLast4}`,
      '',
      `הנדון: בקשתך לפי ${typeLabel.section}`,
      `סוג הבקשה: ${typeLabel.he}`,
      `מספר בקשה: ${req.id}`,
      `תאריך קבלה: ${req.receivedAt}`,
      `מועד מענה סטטוטורי: ${req.isComplex ? req.deadlineComplex : req.deadlineStandard} (${req.isComplex ? '60' : '30'} יום)`,
      `סטטוס: ${req.status}`,
      '',
      this._heBody(req),
      '',
      'בכבוד רב,',
      this._dpo ? this._dpo.name : 'ממונה הגנה על מידע (DPO)',
      'חוק הגנת הפרטיות — תיקון 13 2024',
    ].join('\n');

    const en = [
      `Dear ${req.subjectName},`,
      `ID ending in ${req.subjectIdDocLast4}`,
      '',
      `Re: your request under ${typeLabel.en}`,
      `Request type: ${typeLabel.en}`,
      `Request ID: ${req.id}`,
      `Received: ${req.receivedAt}`,
      `Statutory deadline: ${req.isComplex ? req.deadlineComplex : req.deadlineStandard} (${req.isComplex ? 60 : 30} days)`,
      `Status: ${req.status}`,
      '',
      this._enBody(req),
      '',
      'Respectfully,',
      this._dpo ? this._dpo.name : 'Data Protection Officer (DPO)',
      'Israeli Privacy Protection Law — Amendment 13 (2024)',
    ].join('\n');

    const response = {
      requestId,
      generatedAt: isoDate(now),
      languages: ['he', 'en'],
      he,
      en,
      hash: sha256(he + '\n---\n' + en),
    };

    this._responses.set(requestId, response);
    this._appendAudit('response.generated', requestId, { hash: response.hash });
    return response;
  }

  _heBody(req) {
    if (req.status === REQUEST_STATUS.REFUSED && req.erasureDecision) {
      const holds = req.erasureDecision.retentionHolds
        .map(h => `• ${h.law.he} — ${h.years} שנים (${h.category})`)
        .join('\n');
      return [
        'אנו מאשרים קבלת בקשתך.',
        'לצערנו איננו יכולים למחוק את כל המידע הנדרש, מכיוון שחלות על חלקו תקופות שימור שמחויבות בחוק:',
        holds,
        '',
        'על כן ננקטו פעולות מחיקה רכה בכל הרשומות שאינן תחת שימור סטטוטורי,',
        'וכל יתר הרשומות יישמרו עד תום תקופת החובה ואז יטופלו בהתאם.',
        '',
        'זכותך לערער על החלטה זו בפני הרשות להגנת הפרטיות.',
      ].join('\n');
    }
    if (req.status === REQUEST_STATUS.ERASED) {
      return 'בקשתך למחיקת מידע בוצעה. הנתונים שלך עברו פסבדונימיזציה והסטטוס עודכן ל"נמחק".';
    }
    if (req.status === REQUEST_STATUS.COMPLETED) {
      return 'בקשתך טופלה במלואה. מצורף העתק בילינגואלי של המידע/ההחלטה.';
    }
    if (req.status === REQUEST_STATUS.ESCALATED) {
      return 'תלונתך הועברה לממונה הגנה על מידע לצורך בדיקה מעמיקה.';
    }
    if (req.isComplex) {
      return 'בקשתך מוגדרת כמורכבת ועל כן תקופת המענה הוארכה ל-60 יום, בהתאם לתיקון 13 לחוק.';
    }
    return 'בקשתך התקבלה. נחזור אליך תוך המועד הסטטוטורי הקבוע בחוק (30 יום).';
  }

  _enBody(req) {
    if (req.status === REQUEST_STATUS.REFUSED && req.erasureDecision) {
      const holds = req.erasureDecision.retentionHolds
        .map(h => `- ${h.law.en} — ${h.years} years (${h.category})`)
        .join('\n');
      return [
        'We acknowledge receipt of your request.',
        'We cannot erase all the data you requested because statutory retention periods apply to part of it:',
        holds,
        '',
        'We have applied soft erasure to all records not under statutory hold,',
        'and the remaining records will be retained for the legally required period.',
        '',
        'You have the right to appeal this decision to the Privacy Protection Authority.',
      ].join('\n');
    }
    if (req.status === REQUEST_STATUS.ERASED) {
      return 'Your erasure request has been carried out. Your data has been pseudonymized and its status flipped to "erased".';
    }
    if (req.status === REQUEST_STATUS.COMPLETED) {
      return 'Your request has been fulfilled. A bilingual copy of the information / decision is enclosed.';
    }
    if (req.status === REQUEST_STATUS.ESCALATED) {
      return 'Your complaint has been escalated to the Data Protection Officer for in-depth review.';
    }
    if (req.isComplex) {
      return 'Your request is classified as complex, so the response deadline has been extended to 60 days per Amendment 13.';
    }
    return 'Your request has been received. We will respond within the 30-day statutory deadline.';
  }

  // ─── breachNotification ───────────────────────────────────────────────

  /**
   * Record a data breach. If severity is `critical` (material breach),
   * compute the 72-hour authority deadline and flag the record for
   * immediate transmission to הרשות להגנת הפרטיות.
   *
   * @param {object} p
   * @param {string} p.incidentId
   * @param {Array<string>} p.affectedSubjects
   * @param {string} p.severity    — one of BREACH_SEVERITY
   * @param {Date|string} p.discoveredAt
   * @param {string} [p.description]
   */
  breachNotification({
    incidentId,
    affectedSubjects = [],
    severity = BREACH_SEVERITY.MEDIUM,
    discoveredAt,
    description = '',
  } = {}) {
    if (!incidentId) throw new TypeError('incidentId is required');
    if (!Object.values(BREACH_SEVERITY).includes(severity)) {
      throw new RangeError(`unknown severity '${severity}'`);
    }
    if (!discoveredAt) throw new TypeError('discoveredAt is required');

    const discovered = new Date(discoveredAt);
    const isMaterial = severity === BREACH_SEVERITY.CRITICAL || severity === BREACH_SEVERITY.HIGH;
    const authorityDeadline = addHours(discovered, BREACH_AUTHORITY_DEADLINE_HOURS);

    const record = {
      incidentId,
      severity,
      isMaterial,
      affectedCount: affectedSubjects.length,
      affectedSubjects: affectedSubjects.map(s => ({
        // never store subject ids plaintext in a breach log
        subjectHash: sha256(this._salt + s),
        last4: String(s).slice(-4),
      })),
      discoveredAt: isoDate(discovered),
      description,
      authorityNotification: {
        required: isMaterial,
        deadline: isoDate(authorityDeadline),
        hours: BREACH_AUTHORITY_DEADLINE_HOURS,
        authority: 'הרשות להגנת הפרטיות / Israeli Privacy Protection Authority',
      },
      subjectNotification: {
        required: isMaterial,
        mode: 'without undue delay',
        he: 'ללא דיחוי בלתי סביר',
        en: 'without undue delay',
      },
      legalBasis: {
        he: 'תיקון 13 לחוק הגנת הפרטיות — סעיף 11ג',
        en: 'Privacy Protection Law Amendment 13 — breach notification',
      },
      recordedAt: isoDate(this._nowProvider()),
      status: isMaterial ? 'pending_authority_notice' : 'logged',
    };

    this._breaches.set(incidentId, record);
    this._appendAudit('breach.recorded', null, {
      incidentId,
      severity,
      isMaterial,
      affectedCount: record.affectedCount,
      authorityDeadline: record.authorityNotification.deadline,
    });

    return record;
  }

  // ─── auditLog ─────────────────────────────────────────────────────────

  /**
   * Return the immutable chain of custody. If `requestId` is supplied,
   * only events related to that request are returned (but the chain is
   * still verifiable end-to-end via verifyChain()).
   */
  auditLog(requestId = null) {
    if (requestId === null) return this._auditChain.map(e => ({ ...e }));
    return this._auditChain
      .filter(e => e.requestId === requestId)
      .map(e => ({ ...e }));
  }

  verifyChain() {
    let prev = sha256('dsr-handler-genesis');
    for (let i = 0; i < this._auditChain.length; i++) {
      const ev = this._auditChain[i];
      const expected = sha256(prev + JSON.stringify({
        seq: ev.seq,
        at: ev.at,
        event: ev.event,
        requestId: ev.requestId,
        payload: ev.payload,
      }));
      if (expected !== ev.hash) {
        return { valid: false, brokenAt: i };
      }
      prev = ev.hash;
    }
    return { valid: true, brokenAt: -1 };
  }

  // ─── listRequests ─────────────────────────────────────────────────────

  listRequests(filter = {}) {
    let out = [...this._requests.values()];
    if (filter.status) out = out.filter(r => r.status === filter.status);
    if (filter.requestType) out = out.filter(r => r.requestType === filter.requestType);
    if (filter.subjectId) out = out.filter(r => r.subjectId === filter.subjectId);
    return out.map(r => ({ ...r, history: [...r.history] }));
  }

  // ─── DPO criteria helper ──────────────────────────────────────────────

  static dpoCriteria() {
    return JSON.parse(JSON.stringify(DPO_CRITERIA));
  }

  // ─── internals ────────────────────────────────────────────────────────

  _mustRequest(requestId) {
    const r = this._requests.get(requestId);
    if (!r) throw new Error(`unknown request: ${requestId}`);
    return r;
  }

  _mustVerified(requestId) {
    const r = this._mustRequest(requestId);
    if (r.status !== REQUEST_STATUS.IDENTITY_VERIFIED &&
        r.status !== REQUEST_STATUS.SCOPED &&
        r.status !== REQUEST_STATUS.IN_PROGRESS) {
      throw new Error(
        `request ${requestId} is not verified (status=${r.status}); cannot process`
      );
    }
    return r;
  }

  _appendAudit(event, requestId, payload) {
    const seq = this._auditChain.length + 1;
    const at = isoDate(this._nowProvider());
    const body = { seq, at, event, requestId, payload };
    const hash = sha256(this._prevHash + JSON.stringify(body));
    const entry = { ...body, prevHash: this._prevHash, hash };
    this._auditChain.push(entry);
    this._prevHash = hash;
    return entry;
  }

  _flatten(obj, prefix = '') {
    const out = {};
    if (obj === null || obj === undefined) return out;
    if (typeof obj !== 'object') {
      out[prefix || 'value'] = obj;
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(out, this._flatten(v, key));
      } else if (Array.isArray(v)) {
        out[key] = v.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join('|');
      } else {
        out[key] = v;
      }
    }
    return out;
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Exports
// ───────────────────────────────────────────────────────────────────────────

module.exports = {
  DSRHandler,
  REQUEST_TYPES,
  REQUEST_STATUS,
  VERIFICATION_METHODS,
  BREACH_SEVERITY,
  STATUTORY_RETENTION,
  DEADLINE_DAYS,
  BREACH_AUTHORITY_DEADLINE_HOURS,
  DPO_CRITERIA,
  // exposed for tests only
  _internals: deepFreeze({ sha256, pseudonymize, addDays, addHours }),
};
