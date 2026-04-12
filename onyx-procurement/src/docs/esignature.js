/* ============================================================================
 * Techno-Kol ERP — Electronic Signature Workflow Engine (ESignature)
 * Agent Y-107 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע חתימה אלקטרונית — מפעל מתכת "טכנו-קול עוזי"
 *
 * Scope (כיסוי):
 *   End-to-end e-signature envelopes for office documents. Covers envelope
 *   creation, sequential *or* parallel signer routing, three compliance
 *   levels per חוק חתימה אלקטרונית, tamper-evident append-only audit,
 *   SHA-256 hash chain, RFC-3161 style timestamp payload (formatted for a
 *   real TSA call without executing one), bilingual reminders and
 *   certificate of completion, void / reject paths that still preserve the
 *   full record, and an export bundle for long-term archival.
 *
 * חוק חתימה אלקטרונית, התשס"א-2001 — 3 levels
 * ----------------------------------------------------------------------------
 *   1. חתימה אלקטרונית (electronic)
 *        Basic electronic signature: any data in electronic form used by a
 *        signatory to sign. e.g. a typed name, a checkbox, an email click.
 *        Legally valid but weakest evidentiary weight.
 *
 *   2. חתימה אלקטרונית מאובטחת (advanced / secure)
 *        Uniquely linked to the signer, capable of identifying them, created
 *        using means the signer can maintain under sole control, and linked
 *        to the signed data so that subsequent changes are detectable.
 *
 *   3. חתימה אלקטרונית מאושרת (qualified / certified)
 *        An advanced signature supported by a certificate issued by a
 *        licensed Certification Authority ("גורם מאשר" — ISO 27001 +
 *        רשם גורמים מאשרים under משרד המשפטים). Legally equivalent to a
 *        handwritten signature (section 3 of the Law) and carries a
 *        rebuttable presumption of authenticity.
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Nothing is ever deleted. Void, reject, expire all flip STATUS only.
 *     Every signature, every action, every hash remains forever addressable.
 *   → Zero external dependencies — Node built-ins only (node:crypto).
 *   → Hebrew RTL + bilingual labels on every public structure.
 *
 * Storage:
 *   In-memory `Map` keyed by envelopeId. Append-only audit log, both
 *   per-envelope and global. Each audit entry carries prev_hash + this_hash
 *   forming an immutable SHA-256 hash chain verifiable end-to-end.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/**
 * @enum Three signature levels recognized by חוק חתימה אלקטרונית, התשס"א-2001.
 * Ordered from weakest (electronic) to strongest (qualified).
 */
const SIGNATURE_LEVELS = Object.freeze({
  electronic: Object.freeze({
    id:         'electronic',
    he:         'חתימה אלקטרונית',
    en:         'Electronic signature',
    law_ref:    'חוק חתימה אלקטרונית, התשס"א-2001, סעיף 1',
    weight:     1,
    description_he: 'חתימה בסיסית — נתונים אלקטרוניים המשויכים להודעה אלקטרונית',
    description_en: 'Basic — any electronic data affixed to or logically associated with a record',
  }),
  advanced: Object.freeze({
    id:         'advanced',
    he:         'חתימה אלקטרונית מאובטחת',
    en:         'Advanced electronic signature',
    law_ref:    'חוק חתימה אלקטרונית, התשס"א-2001, סעיף 1',
    weight:     2,
    description_he: 'משויכת לחותם באופן ייחודי, מזהה אותו, ביצירה באמצעים שבשליטתו הבלעדית, ומגלה כל שינוי לאחר החתימה',
    description_en: 'Uniquely linked to signer, identifies them, created under sole control, tamper-detecting',
  }),
  qualified: Object.freeze({
    id:         'qualified',
    he:         'חתימה אלקטרונית מאושרת',
    en:         'Qualified electronic signature',
    law_ref:    'חוק חתימה אלקטרונית, התשס"א-2001, סעיפים 2-3',
    weight:     3,
    description_he: 'חתימה מאובטחת הנתמכת בתעודה אלקטרונית מאת גורם מאשר — שוות ערך לחתימה בכתב יד',
    description_en: 'Advanced signature backed by certificate from a licensed Certification Authority — equivalent to handwritten',
  }),
});

/** @enum Envelope overall lifecycle status. */
const ENVELOPE_STATUS = Object.freeze({
  draft:     Object.freeze({ id: 'draft',     he: 'טיוטה',        en: 'Draft' }),
  sent:      Object.freeze({ id: 'sent',      he: 'נשלח',         en: 'Sent' }),
  in_progress: Object.freeze({ id: 'in_progress', he: 'בתהליך חתימה', en: 'In progress' }),
  completed: Object.freeze({ id: 'completed', he: 'הושלם',         en: 'Completed' }),
  voided:    Object.freeze({ id: 'voided',    he: 'בוטל',          en: 'Voided' }),
  rejected:  Object.freeze({ id: 'rejected',  he: 'נדחה',          en: 'Rejected' }),
  expired:   Object.freeze({ id: 'expired',   he: 'פג תוקף',       en: 'Expired' }),
});

/** @enum Per-signer status. */
const SIGNER_STATUS = Object.freeze({
  pending:  Object.freeze({ id: 'pending',  he: 'ממתין',    en: 'Pending' }),
  notified: Object.freeze({ id: 'notified', he: 'הודע',     en: 'Notified' }),
  signed:   Object.freeze({ id: 'signed',   he: 'חתם',      en: 'Signed' }),
  declined: Object.freeze({ id: 'declined', he: 'דחה',      en: 'Declined' }),
  skipped:  Object.freeze({ id: 'skipped',  he: 'דולג',     en: 'Skipped' }),
});

/** @enum Audit action codes — each entry appends to the hash chain. */
const AUDIT_ACTIONS = Object.freeze({
  envelope_create: Object.freeze({ id: 'envelope_create', he: 'יצירת מעטפה',      en: 'Envelope created' }),
  envelope_send:   Object.freeze({ id: 'envelope_send',   he: 'שליחה לחתימה',     en: 'Sent for signature' }),
  signer_notified: Object.freeze({ id: 'signer_notified', he: 'חותם הודע',        en: 'Signer notified' }),
  signer_reminded: Object.freeze({ id: 'signer_reminded', he: 'תזכורת נשלחה',     en: 'Signer reminded' }),
  signature_applied: Object.freeze({ id: 'signature_applied', he: 'חתימה הוחלה',  en: 'Signature applied' }),
  signature_verified: Object.freeze({ id: 'signature_verified', he: 'חתימה אומתה', en: 'Signature verified' }),
  envelope_completed: Object.freeze({ id: 'envelope_completed', he: 'מעטפה הושלמה', en: 'Envelope completed' }),
  envelope_voided: Object.freeze({ id: 'envelope_voided', he: 'מעטפה בוטלה',      en: 'Envelope voided' }),
  envelope_rejected: Object.freeze({ id: 'envelope_rejected', he: 'מעטפה נדחתה',  en: 'Envelope rejected' }),
  timestamp_applied: Object.freeze({ id: 'timestamp_applied', he: 'חותמת זמן הוחלה', en: 'Timestamp applied' }),
  export_bundled:  Object.freeze({ id: 'export_bundled',  he: 'ייצוא לארכיון',    en: 'Exported for archival' }),
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (no deps outside node:crypto)
 * -------------------------------------------------------------------------- */

function _nowIso() { return new Date().toISOString(); }

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertObj(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new TypeError('invalid ' + name + ': must be plain object');
  }
}

function _assertArr(v, name) {
  if (!Array.isArray(v) || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty array');
  }
}

function _assertInt(v, name, min) {
  if (!Number.isInteger(v) || v < (min == null ? 0 : min)) {
    throw new TypeError('invalid ' + name + ': must be integer >= ' + (min == null ? 0 : min));
  }
}

function _sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function _sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function _deepCopy(obj) {
  if (obj === undefined || obj === null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function _bilingualLabel(he, en) {
  return Object.freeze({
    he: String(he),
    en: String(en),
    bidi: '\u202B' + String(he) + '\u202C / ' + String(en),
  });
}

function _toBuffer(input) {
  if (input == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (typeof input === 'object') return Buffer.from(JSON.stringify(input), 'utf8');
  return Buffer.from(String(input), 'utf8');
}

/**
 * Stable canonical JSON serializer — sorts object keys recursively.
 * Required so hash chain + signature digests are reproducible regardless
 * of insertion order or runtime.
 */
function _canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _canonical(value[k])).join(',') + '}';
}

/* ----------------------------------------------------------------------------
 * 2. ESignature class
 * -------------------------------------------------------------------------- */

class ESignature {
  /**
   * @param {object} [opts]
   * @param {()=>string} [opts.clock] Injected ISO-8601 clock. Useful for tests.
   * @param {()=>string} [opts.idGen] Injected envelope id generator.
   */
  constructor(opts) {
    const o = opts || {};
    this._clock = typeof o.clock === 'function' ? o.clock : _nowIso;
    this._idGen = typeof o.idGen === 'function'
      ? o.idGen
      : () => 'ENV-' + _sha256Hex(this._clock() + ':' + Math.random()).slice(0, 12).toUpperCase();

    /** @type {Map<string, EnvelopeRecord>} */
    this.envelopes = new Map();

    /**
     * Append-only global audit log — every action across every envelope.
     * Each entry:
     *   { seq, envelopeId, action, actor, at, payload, prev_hash, this_hash }
     * @type {Array<object>}
     */
    this.globalAudit = [];
  }

  /* ======================================================================
   * 2.0 Audit chain — internal helpers
   * ==================================================================== */

  /**
   * Append a single event to both the envelope-local audit log AND the
   * global audit log, linking it into the SHA-256 hash chain.
   *
   * Chain definition (per entry):
   *    this_hash = SHA-256( prev_hash || canonical({seq,envelopeId,action,actor,at,payload}) )
   *
   * The very first entry uses a zero-filled 64-char hex sentinel as prev.
   */
  _appendAudit(envelope, action, actor, payload) {
    const at = this._clock();
    const prevLocal = envelope.auditLog.length
      ? envelope.auditLog[envelope.auditLog.length - 1].this_hash
      : '0'.repeat(64);
    const seq = envelope.auditLog.length;
    const body = {
      seq,
      envelopeId: envelope.envelopeId,
      action,
      actor: actor || 'system',
      at,
      payload: payload || {},
    };
    const thisHash = _sha256Hex(prevLocal + _canonical(body));
    const entry = Object.freeze(Object.assign({}, body, {
      prev_hash: prevLocal,
      this_hash: thisHash,
      label: _bilingualLabel(
        (AUDIT_ACTIONS[action] && AUDIT_ACTIONS[action].he) || action,
        (AUDIT_ACTIONS[action] && AUDIT_ACTIONS[action].en) || action,
      ),
    }));
    envelope.auditLog.push(entry);
    this.globalAudit.push(entry);
    return entry;
  }

  /**
   * Re-hash the envelope's audit log and confirm every link matches.
   * Returns { valid:boolean, brokenAt:number|null, length:number }.
   */
  _verifyAuditChain(envelope) {
    let prev = '0'.repeat(64);
    for (let i = 0; i < envelope.auditLog.length; i++) {
      const e = envelope.auditLog[i];
      const body = {
        seq: e.seq,
        envelopeId: e.envelopeId,
        action: e.action,
        actor: e.actor,
        at: e.at,
        payload: e.payload,
      };
      const expected = _sha256Hex(prev + _canonical(body));
      if (e.prev_hash !== prev || e.this_hash !== expected) {
        return { valid: false, brokenAt: i, length: envelope.auditLog.length };
      }
      prev = e.this_hash;
    }
    return { valid: true, brokenAt: null, length: envelope.auditLog.length };
  }

  /* ======================================================================
   * 2.1 createEnvelope — create envelope in DRAFT state
   * ==================================================================== */

  /**
   * @param {object} p
   * @param {string}  p.title_he            Hebrew title of the envelope.
   * @param {string}  p.title_en            English title of the envelope.
   * @param {Array<{docId:string,title_he?:string,title_en?:string,content?:any,mimeType?:string}>} p.documents
   *   One or more documents to be signed. `content` is optional — when
   *   provided its SHA-256 is computed and stored so tamper can be detected.
   * @param {Array<{userId:string, name_he?:string, name_en?:string, email?:string, role:string, order?:number}>} p.signers
   *   Ordered list of signers. If `sequential:true` the `order` field is
   *   honored; otherwise all signers are notified in parallel.
   * @param {boolean} [p.sequential=false] Whether signing is sequential.
   * @param {string}  [p.message='']       Optional bilingual message.
   * @param {number}  [p.expiryDays=30]    Days until envelope auto-expires.
   * @param {string}  [p.createdBy='system'] Actor id for the audit trail.
   * @returns {object} Deep-copied envelope snapshot (safe to mutate by caller).
   */
  createEnvelope(p) {
    _assertObj(p, 'createEnvelope payload');
    _assertStr(p.title_he, 'title_he');
    _assertStr(p.title_en, 'title_en');
    _assertArr(p.documents, 'documents');
    _assertArr(p.signers, 'signers');

    const sequential = p.sequential === true;
    const expiryDays = Number.isInteger(p.expiryDays) && p.expiryDays > 0 ? p.expiryDays : 30;

    // Normalize + hash documents.
    const documents = p.documents.map((d, idx) => {
      _assertObj(d, 'documents[' + idx + ']');
      _assertStr(d.docId, 'documents[' + idx + '].docId');
      const contentBuf = _toBuffer(d.content);
      return {
        docId: d.docId,
        title_he: d.title_he || d.docId,
        title_en: d.title_en || d.docId,
        mimeType: d.mimeType || 'application/octet-stream',
        sha256:  _sha256Buf(contentBuf),
        size:    contentBuf.length,
      };
    });

    // Normalize signers. For sequential mode, sort by `order` ascending.
    const signersIn = p.signers.map((s, idx) => {
      _assertObj(s, 'signers[' + idx + ']');
      _assertStr(s.userId, 'signers[' + idx + '].userId');
      _assertStr(s.role, 'signers[' + idx + '].role');
      const order = Number.isInteger(s.order) ? s.order : idx + 1;
      return {
        signerId:  'SGN-' + _sha256Hex(s.userId + ':' + idx + ':' + this._clock()).slice(0, 10).toUpperCase(),
        userId:    s.userId,
        name_he:   s.name_he || s.userId,
        name_en:   s.name_en || s.userId,
        email:     s.email || '',
        role:      s.role,
        order:     order,
        status:    SIGNER_STATUS.pending.id,
        notifiedAt: null,
        signedAt:   null,
        signature:  null, // populated by signDocument()
      };
    });

    if (sequential) {
      signersIn.sort((a, b) => a.order - b.order);
      // Re-compact order values to 1..N to remove gaps.
      signersIn.forEach((s, i) => { s.order = i + 1; });
    }

    const createdAt = this._clock();
    const expiresAt = new Date(Date.parse(createdAt) + expiryDays * 86400 * 1000).toISOString();
    const envelopeId = this._idGen();

    const record = {
      envelopeId,
      title_he:   p.title_he,
      title_en:   p.title_en,
      label:      _bilingualLabel(p.title_he, p.title_en),
      documents,
      signers:    signersIn,
      sequential,
      message:    p.message || '',
      status:     ENVELOPE_STATUS.draft.id,
      createdBy:  p.createdBy || 'system',
      createdAt,
      sentAt:     null,
      completedAt: null,
      voidedAt:   null,
      rejectedAt: null,
      expiresAt,
      expiryDays,
      voidReason: null,
      rejectionReason: null,
      timestamps: [], // RFC-3161 payloads
      auditLog:   [],
    };

    this.envelopes.set(envelopeId, record);

    this._appendAudit(record, AUDIT_ACTIONS.envelope_create.id, record.createdBy, {
      title_he: record.title_he,
      title_en: record.title_en,
      sequential,
      expiresAt,
      documentCount: documents.length,
      signerCount: signersIn.length,
      docHashes: documents.map(d => ({ docId: d.docId, sha256: d.sha256 })),
    });

    return _deepCopy(record);
  }

  /* ======================================================================
   * 2.2 sendForSignature — move envelope to SENT / IN_PROGRESS
   * ==================================================================== */

  /**
   * Notifies the first signer (sequential) or all signers (parallel).
   * @param {string} envelopeId
   * @param {string} [actor='system']
   * @returns {{envelopeId:string, notified:string[], status:string}}
   */
  sendForSignature(envelopeId, actor) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    if (env.status !== ENVELOPE_STATUS.draft.id) {
      throw new Error('envelope cannot be sent from status=' + env.status);
    }

    env.status = ENVELOPE_STATUS.sent.id;
    env.sentAt = this._clock();

    const notified = [];
    const notifyOne = (signer) => {
      signer.status = SIGNER_STATUS.notified.id;
      signer.notifiedAt = this._clock();
      notified.push(signer.signerId);
      this._appendAudit(env, AUDIT_ACTIONS.signer_notified.id, actor || 'system', {
        signerId: signer.signerId,
        userId:   signer.userId,
        role:     signer.role,
        order:    signer.order,
      });
    };

    if (env.sequential) {
      notifyOne(env.signers[0]);
    } else {
      env.signers.forEach(notifyOne);
    }

    env.status = ENVELOPE_STATUS.in_progress.id;

    this._appendAudit(env, AUDIT_ACTIONS.envelope_send.id, actor || 'system', {
      sequential: env.sequential,
      notifiedCount: notified.length,
    });

    return { envelopeId: env.envelopeId, notified: notified.slice(), status: env.status };
  }

  /* ======================================================================
   * 2.3 signDocument — apply one signer's signature
   * ==================================================================== */

  /**
   * @param {object} p
   * @param {string} p.envelopeId
   * @param {string} p.signerId
   * @param {'electronic'|'advanced'|'qualified'} p.signatureType
   * @param {any}    p.signatureData Level-dependent payload (see below).
   * @param {string} [p.timestamp]   ISO timestamp. Defaults to internal clock.
   * @param {string} [p.ipAddress]   Recorded in audit + certificate.
   * @param {string} [p.userAgent]
   *
   * signatureData shape by level:
   *   electronic: { typedName:string }
   *   advanced:   { publicKey:string, signedDigest:string, algorithm?:string }
   *   qualified:  { publicKey:string, signedDigest:string, certificate:{
   *                  serial:string, issuer:string, subject:string, validFrom, validTo
   *                }, algorithm?:string }
   */
  signDocument(p) {
    _assertObj(p, 'signDocument payload');
    _assertStr(p.envelopeId, 'envelopeId');
    _assertStr(p.signerId, 'signerId');
    _assertStr(p.signatureType, 'signatureType');
    if (!SIGNATURE_LEVELS[p.signatureType]) {
      throw new Error('unknown signatureType: ' + p.signatureType);
    }
    _assertObj(p.signatureData, 'signatureData');

    const env = this._getEnvelopeOrThrow(p.envelopeId);
    if (env.status !== ENVELOPE_STATUS.in_progress.id) {
      throw new Error('envelope not in progress — status=' + env.status);
    }

    const signer = env.signers.find(s => s.signerId === p.signerId);
    if (!signer) throw new Error('unknown signerId: ' + p.signerId);
    if (signer.status === SIGNER_STATUS.signed.id) {
      throw new Error('signer already signed: ' + p.signerId);
    }
    if (signer.status === SIGNER_STATUS.declined.id) {
      throw new Error('signer already declined: ' + p.signerId);
    }

    // Enforce sequential ordering.
    if (env.sequential) {
      const nextUp = env.signers.find(s => s.status !== SIGNER_STATUS.signed.id
                                        && s.status !== SIGNER_STATUS.skipped.id);
      if (!nextUp || nextUp.signerId !== signer.signerId) {
        throw new Error('out-of-order signature — sequential envelope expects signer '
                        + (nextUp ? nextUp.signerId : 'none') + ' next');
      }
    }

    // Validate + record level-specific payload.
    const level = SIGNATURE_LEVELS[p.signatureType];
    this._validateSignaturePayload(level.id, p.signatureData);

    const timestamp = p.timestamp || this._clock();

    // Compute "document digest" — hash of every doc's stored sha256.
    // This is what a real advanced/qualified signer would sign over.
    const docDigest = _sha256Hex(_canonical(env.documents.map(d => ({ docId: d.docId, sha256: d.sha256 }))));

    const signaturePacket = Object.freeze({
      signerId:   signer.signerId,
      userId:     signer.userId,
      level:      level.id,
      level_he:   level.he,
      level_en:   level.en,
      law_ref:    level.law_ref,
      weight:     level.weight,
      timestamp,
      ipAddress:  p.ipAddress || '',
      userAgent:  p.userAgent || '',
      docDigest,
      data:       _deepCopy(p.signatureData),
      // Evidence hash — what verifySignature() will re-compute.
      evidenceHash: _sha256Hex(_canonical({
        signerId: signer.signerId,
        level: level.id,
        timestamp,
        docDigest,
        data: p.signatureData,
      })),
    });

    signer.signature = signaturePacket;
    signer.signedAt = timestamp;
    signer.status = SIGNER_STATUS.signed.id;

    this._appendAudit(env, AUDIT_ACTIONS.signature_applied.id, signer.userId, {
      signerId: signer.signerId,
      level: level.id,
      level_he: level.he,
      level_en: level.en,
      ipAddress: p.ipAddress || '',
      userAgent: p.userAgent || '',
      evidenceHash: signaturePacket.evidenceHash,
      docDigest,
    });

    // If sequential, notify the *next* signer (if any).
    if (env.sequential) {
      const nextPending = env.signers.find(s => s.status === SIGNER_STATUS.pending.id);
      if (nextPending) {
        nextPending.status = SIGNER_STATUS.notified.id;
        nextPending.notifiedAt = this._clock();
        this._appendAudit(env, AUDIT_ACTIONS.signer_notified.id, 'system', {
          signerId: nextPending.signerId,
          userId:   nextPending.userId,
          role:     nextPending.role,
          order:    nextPending.order,
          triggered_by: 'sequential_advance',
        });
      }
    }

    // Completion check.
    const allSigned = env.signers.every(s => s.status === SIGNER_STATUS.signed.id);
    if (allSigned) {
      env.status = ENVELOPE_STATUS.completed.id;
      env.completedAt = this._clock();
      this._appendAudit(env, AUDIT_ACTIONS.envelope_completed.id, 'system', {
        completedAt: env.completedAt,
        signerCount: env.signers.length,
      });
    }

    return _deepCopy({ envelopeId: env.envelopeId, signerId: signer.signerId, signature: signaturePacket, envelopeStatus: env.status });
  }

  /** Per-level payload validation. */
  _validateSignaturePayload(levelId, data) {
    if (levelId === 'electronic') {
      _assertStr(data.typedName, 'signatureData.typedName');
    } else if (levelId === 'advanced') {
      _assertStr(data.publicKey, 'signatureData.publicKey');
      _assertStr(data.signedDigest, 'signatureData.signedDigest');
    } else if (levelId === 'qualified') {
      _assertStr(data.publicKey, 'signatureData.publicKey');
      _assertStr(data.signedDigest, 'signatureData.signedDigest');
      _assertObj(data.certificate, 'signatureData.certificate');
      _assertStr(data.certificate.serial, 'signatureData.certificate.serial');
      _assertStr(data.certificate.issuer, 'signatureData.certificate.issuer');
      _assertStr(data.certificate.subject, 'signatureData.certificate.subject');
    }
  }

  /* ======================================================================
   * 2.4 verifySignature — integrity + identity check
   * ==================================================================== */

  /**
   * Re-derives the evidence hash, checks document integrity against stored
   * SHA-256, and validates level-specific identity metadata.
   *
   * @param {string} envelopeId
   * @param {string} signerId
   * @returns {{valid:boolean, reasons:string[], integrity:boolean, identityVerified:boolean, levelMet:string, signature:object}}
   */
  verifySignature(envelopeId, signerId) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    const signer = env.signers.find(s => s.signerId === signerId);
    if (!signer) throw new Error('unknown signerId: ' + signerId);
    if (!signer.signature) {
      return {
        valid: false,
        reasons: ['signer has not signed yet'],
        integrity: false,
        identityVerified: false,
        levelMet: 'none',
        signature: null,
      };
    }

    const sig = signer.signature;
    const reasons = [];

    // 1. Re-compute the doc digest from live envelope state.
    const liveDocDigest = _sha256Hex(_canonical(env.documents.map(d => ({ docId: d.docId, sha256: d.sha256 }))));
    const integrity = liveDocDigest === sig.docDigest;
    if (!integrity) reasons.push('document digest mismatch — tamper detected');

    // 2. Re-compute the evidence hash.
    const expectedEvidence = _sha256Hex(_canonical({
      signerId: sig.signerId,
      level: sig.level,
      timestamp: sig.timestamp,
      docDigest: sig.docDigest,
      data: sig.data,
    }));
    const evidenceOk = expectedEvidence === sig.evidenceHash;
    if (!evidenceOk) reasons.push('evidence hash mismatch — signature packet corrupted');

    // 3. Identity verification by level.
    let identityVerified = false;
    if (sig.level === 'electronic') {
      identityVerified = typeof sig.data.typedName === 'string' && sig.data.typedName.length > 0;
      if (!identityVerified) reasons.push('electronic: missing typedName');
    } else if (sig.level === 'advanced') {
      identityVerified = typeof sig.data.publicKey === 'string'
                      && typeof sig.data.signedDigest === 'string'
                      && sig.data.publicKey.length > 0
                      && sig.data.signedDigest.length > 0;
      if (!identityVerified) reasons.push('advanced: missing publicKey or signedDigest');
    } else if (sig.level === 'qualified') {
      const c = sig.data.certificate || {};
      identityVerified = typeof sig.data.publicKey === 'string'
                      && typeof sig.data.signedDigest === 'string'
                      && typeof c.serial === 'string'
                      && typeof c.issuer === 'string'
                      && typeof c.subject === 'string';
      if (!identityVerified) reasons.push('qualified: missing certificate fields');
    }

    const valid = integrity && evidenceOk && identityVerified;

    // Append a verification audit entry (read-only op still records intent).
    this._appendAudit(env, AUDIT_ACTIONS.signature_verified.id, 'system', {
      signerId,
      valid,
      integrity,
      identityVerified,
      level: sig.level,
      reasons,
    });

    return {
      valid,
      reasons,
      integrity,
      identityVerified,
      levelMet: sig.level,
      signature: _deepCopy(sig),
    };
  }

  /* ======================================================================
   * 2.5 voidEnvelope — mark void, PRESERVE all signatures for audit
   * ==================================================================== */

  /**
   * Per the charter rule "לא מוחקים רק משדרגים ומגדלים" — nothing is ever
   * deleted. Voiding only flips status + records a reason. Every existing
   * signature remains verifiable.
   *
   * @param {string} envelopeId
   * @param {string} reason
   * @param {string} [actor='system']
   */
  voidEnvelope(envelopeId, reason, actor) {
    _assertStr(reason, 'reason');
    const env = this._getEnvelopeOrThrow(envelopeId);
    if (env.status === ENVELOPE_STATUS.voided.id) {
      throw new Error('envelope already voided');
    }
    const prevStatus = env.status;
    env.status = ENVELOPE_STATUS.voided.id;
    env.voidedAt = this._clock();
    env.voidReason = reason;

    // Preserved signatures — snapshot so caller can confirm retention.
    const preservedSignatures = env.signers
      .filter(s => s.signature)
      .map(s => ({
        signerId:   s.signerId,
        userId:     s.userId,
        level:      s.signature.level,
        signedAt:   s.signedAt,
        evidenceHash: s.signature.evidenceHash,
      }));

    this._appendAudit(env, AUDIT_ACTIONS.envelope_voided.id, actor || 'system', {
      reason,
      prevStatus,
      preservedSignatures,
    });

    return _deepCopy({ envelopeId: env.envelopeId, status: env.status, preservedSignatures });
  }

  /* ======================================================================
   * 2.6 auditTrail — immutable SHA-256 hash chain
   * ==================================================================== */

  /**
   * Returns a *copy* of the envelope's audit log PLUS a verification result.
   * Caller cannot mutate the stored log — entries are frozen and the array
   * returned is a deep copy.
   */
  auditTrail(envelopeId) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    const verification = this._verifyAuditChain(env);
    return {
      envelopeId: env.envelopeId,
      length:     env.auditLog.length,
      verification,
      entries:    env.auditLog.map(e => _deepCopy(e)),
    };
  }

  /* ======================================================================
   * 2.7 timestamp — RFC 3161 shaped TSA payload (no real call)
   * ==================================================================== */

  /**
   * Produces an RFC-3161 TimeStampReq-shaped payload describing the envelope
   * snapshot. **Does not** contact a real TSA — this system is hermetic.
   * The payload is formatted so an operator could post it directly to a
   * TSA when needed. It is also recorded on the envelope record.
   *
   * Structure mirrors RFC 3161 §2.4:
   *   TimeStampReq ::= SEQUENCE {
   *       version             INTEGER,
   *       messageImprint      MessageImprint,
   *       reqPolicy           OBJECT IDENTIFIER OPTIONAL,
   *       nonce               INTEGER OPTIONAL,
   *       certReq             BOOLEAN DEFAULT FALSE,
   *       extensions          ...
   *   }
   *   MessageImprint ::= SEQUENCE {
   *       hashAlgorithm       AlgorithmIdentifier,
   *       hashedMessage       OCTET STRING
   *   }
   */
  timestamp(envelopeId) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    const imprintSource = _canonical({
      envelopeId: env.envelopeId,
      documents:  env.documents.map(d => ({ docId: d.docId, sha256: d.sha256 })),
      signers:    env.signers.map(s => ({
        signerId: s.signerId,
        status:   s.status,
        signedAt: s.signedAt,
        evidenceHash: s.signature ? s.signature.evidenceHash : null,
      })),
      status:     env.status,
    });
    const hashedMessage = _sha256Hex(imprintSource);
    const nonce = '0x' + _sha256Hex(env.envelopeId + ':' + this._clock() + ':' + env.timestamps.length).slice(0, 16);

    const payload = Object.freeze({
      rfc: 3161,
      TimeStampReq: Object.freeze({
        version: 1,
        messageImprint: Object.freeze({
          hashAlgorithm: Object.freeze({
            algorithm: '2.16.840.1.101.3.4.2.1', // OID for SHA-256
            algorithm_name: 'sha256',
            parameters: null,
          }),
          hashedMessage,
        }),
        reqPolicy: '1.2.3.4.5.6.7.8.1', // placeholder policy OID
        nonce,
        certReq: true,
        extensions: null,
      }),
      producedAt: this._clock(),
      envelopeId: env.envelopeId,
      label: _bilingualLabel('חותמת זמן (RFC 3161)', 'Timestamp (RFC 3161)'),
      // A real TSA would return a TimeStampResp containing this.
      _notice_he: 'מבנה זה אינו מכיל חתימת TSA — הוא מוכן למשלוח אל גורם מאשר מוסמך',
      _notice_en: 'This structure contains no real TSA signature — it is pre-formatted for submission to a licensed TSA',
    });

    env.timestamps.push(payload);

    this._appendAudit(env, AUDIT_ACTIONS.timestamp_applied.id, 'system', {
      hashedMessage,
      nonce,
      index: env.timestamps.length - 1,
    });

    return _deepCopy(payload);
  }

  /* ======================================================================
   * 2.8 remindSigner — bilingual reminder
   * ==================================================================== */

  /**
   * Issues a reminder to a pending signer and records it in the audit log.
   * Returns the bilingual reminder text so the caller (outer notification
   * service) can dispatch via whatever channel they prefer.
   */
  remindSigner(envelopeId, signerId, actor) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    const signer = env.signers.find(s => s.signerId === signerId);
    if (!signer) throw new Error('unknown signerId: ' + signerId);
    if (signer.status === SIGNER_STATUS.signed.id) {
      throw new Error('cannot remind — signer already signed');
    }
    if (signer.status === SIGNER_STATUS.declined.id) {
      throw new Error('cannot remind — signer already declined');
    }

    const at = this._clock();
    const daysLeft = Math.max(0, Math.floor((Date.parse(env.expiresAt) - Date.parse(at)) / 86400000));
    const reminder = Object.freeze({
      envelopeId: env.envelopeId,
      signerId:   signer.signerId,
      subject_he: 'תזכורת: חתימה נדרשת על "' + env.title_he + '"',
      subject_en: 'Reminder: signature required on "' + env.title_en + '"',
      body_he: 'שלום ' + signer.name_he + ',\n'
             + 'נבקשך לחתום על המסמך "' + env.title_he + '".\n'
             + 'מספר ימים שנותרו עד לפקיעת המעטפה: ' + daysLeft + '\n'
             + 'בברכה,\nמערכת החתימות האלקטרוניות — טכנו-קול עוזי',
      body_en: 'Hello ' + signer.name_en + ',\n'
             + 'You are requested to sign the document "' + env.title_en + '".\n'
             + 'Days remaining before envelope expiry: ' + daysLeft + '\n'
             + 'Best regards,\nTechno-Kol Uzi Electronic Signature System',
      sentAt: at,
      daysLeft,
    });

    this._appendAudit(env, AUDIT_ACTIONS.signer_reminded.id, actor || 'system', {
      signerId: signer.signerId,
      daysLeft,
    });

    return reminder;
  }

  /* ======================================================================
   * 2.9 certificateOfCompletion — bilingual certificate
   * ==================================================================== */

  /**
   * Assembles a bilingual certificate of completion containing:
   *   - envelope metadata
   *   - every signer with their level, IP, userAgent, timestamps
   *   - audit chain verification result
   *   - total signatures + document hashes
   *
   * The certificate is valid even for voided or rejected envelopes — it
   * describes the *state at the moment of issuance*, including preserved
   * signatures, per the "never delete" charter rule.
   */
  certificateOfCompletion(envelopeId) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    const auditVerification = this._verifyAuditChain(env);

    const signerRows = env.signers.map(s => ({
      signerId:  s.signerId,
      userId:    s.userId,
      name_he:   s.name_he,
      name_en:   s.name_en,
      role:      s.role,
      order:     s.order,
      status:    s.status,
      signedAt:  s.signedAt,
      ipAddress: s.signature ? s.signature.ipAddress : '',
      userAgent: s.signature ? s.signature.userAgent : '',
      level:     s.signature ? s.signature.level : null,
      level_he:  s.signature ? s.signature.level_he : null,
      level_en:  s.signature ? s.signature.level_en : null,
      law_ref:   s.signature ? s.signature.law_ref : null,
      weight:    s.signature ? s.signature.weight : 0,
      evidenceHash: s.signature ? s.signature.evidenceHash : null,
    }));

    return Object.freeze({
      certificateId: 'COC-' + _sha256Hex(env.envelopeId + ':' + this._clock()).slice(0, 12).toUpperCase(),
      envelopeId:    env.envelopeId,
      issuedAt:      this._clock(),
      title_he:      env.title_he,
      title_en:      env.title_en,
      status_id:     env.status,
      status_he:     (ENVELOPE_STATUS[env.status] || {}).he || env.status,
      status_en:     (ENVELOPE_STATUS[env.status] || {}).en || env.status,
      createdAt:     env.createdAt,
      sentAt:        env.sentAt,
      completedAt:   env.completedAt,
      voidedAt:      env.voidedAt,
      rejectedAt:    env.rejectedAt,
      expiresAt:     env.expiresAt,
      sequential:    env.sequential,
      documents:     env.documents.map(d => ({ docId: d.docId, title_he: d.title_he, title_en: d.title_en, sha256: d.sha256, size: d.size, mimeType: d.mimeType })),
      signers:       signerRows,
      timestamps:    env.timestamps.map(t => _deepCopy(t)),
      auditChain:    {
        length: env.auditLog.length,
        valid: auditVerification.valid,
        brokenAt: auditVerification.brokenAt,
        finalHash: env.auditLog.length ? env.auditLog[env.auditLog.length - 1].this_hash : '0'.repeat(64),
      },
      law_reference_he: 'תעודה זו מונפקת בהתאם לחוק חתימה אלקטרונית, התשס"א-2001',
      law_reference_en: 'This certificate is issued pursuant to the Electronic Signature Law, 5761-2001',
      title_label:   _bilingualLabel('תעודת השלמת חתימות', 'Certificate of Completion'),
    });
  }

  /* ======================================================================
   * 2.10 rejectEnvelope — decline path
   * ==================================================================== */

  /**
   * Allows a signer to decline signing. Preserves the envelope + any prior
   * signatures. Flips envelope status to `rejected`.
   */
  rejectEnvelope(envelopeId, signerId, reason) {
    _assertStr(reason, 'reason');
    const env = this._getEnvelopeOrThrow(envelopeId);
    const signer = env.signers.find(s => s.signerId === signerId);
    if (!signer) throw new Error('unknown signerId: ' + signerId);
    if (env.status !== ENVELOPE_STATUS.in_progress.id
        && env.status !== ENVELOPE_STATUS.sent.id) {
      throw new Error('envelope not in a rejectable state — status=' + env.status);
    }
    if (signer.status === SIGNER_STATUS.signed.id) {
      throw new Error('signer has already signed — cannot reject');
    }

    signer.status = SIGNER_STATUS.declined.id;
    env.status = ENVELOPE_STATUS.rejected.id;
    env.rejectedAt = this._clock();
    env.rejectionReason = reason;

    const preservedSignatures = env.signers
      .filter(s => s.signature)
      .map(s => ({ signerId: s.signerId, userId: s.userId, level: s.signature.level, signedAt: s.signedAt }));

    this._appendAudit(env, AUDIT_ACTIONS.envelope_rejected.id, signer.userId, {
      signerId,
      reason,
      preservedSignatures,
    });

    return _deepCopy({
      envelopeId: env.envelopeId,
      signerId,
      status: env.status,
      rejectionReason: reason,
      preservedSignatures,
    });
  }

  /* ======================================================================
   * 2.11 exportSigned — archival bundle
   * ==================================================================== */

  /**
   * Produces a self-describing archival bundle:
   *   - envelope metadata + all signers + signature packets
   *   - certificate of completion
   *   - full audit log
   *   - all timestamp payloads
   *   - bundle checksum (SHA-256 over canonical serialization of the inner
   *     body) — callers can sign or seal this themselves
   */
  exportSigned(envelopeId) {
    const env = this._getEnvelopeOrThrow(envelopeId);

    const cert = this.certificateOfCompletion(env.envelopeId);

    const body = {
      version: 1,
      exportedAt: this._clock(),
      envelope: {
        envelopeId: env.envelopeId,
        title_he: env.title_he,
        title_en: env.title_en,
        status:   env.status,
        sequential: env.sequential,
        createdAt: env.createdAt,
        sentAt:    env.sentAt,
        completedAt: env.completedAt,
        voidedAt:  env.voidedAt,
        rejectedAt: env.rejectedAt,
        expiresAt: env.expiresAt,
        voidReason: env.voidReason,
        rejectionReason: env.rejectionReason,
        documents: env.documents.map(_deepCopy),
        signers:   env.signers.map(_deepCopy),
        timestamps: env.timestamps.map(_deepCopy),
      },
      certificate: cert,
      auditLog:    env.auditLog.map(_deepCopy),
      auditChainVerification: this._verifyAuditChain(env),
      law_reference: {
        he: 'חוק חתימה אלקטרונית, התשס"א-2001',
        en: 'Electronic Signature Law, 5761-2001',
      },
    };

    const bundleChecksum = _sha256Hex(_canonical(body));

    this._appendAudit(env, AUDIT_ACTIONS.export_bundled.id, 'system', {
      bundleChecksum,
      auditEntries: body.auditLog.length,
    });

    return Object.freeze(Object.assign({}, body, {
      bundleChecksum,
      label: _bilingualLabel('חבילת ארכיון חתום', 'Signed archival bundle'),
    }));
  }

  /* ======================================================================
   * 2.12 misc accessors
   * ==================================================================== */

  /** Retrieve a deep-copied envelope snapshot. */
  getEnvelope(envelopeId) {
    const env = this._getEnvelopeOrThrow(envelopeId);
    return _deepCopy(env);
  }

  /** List envelope ids currently known. */
  listEnvelopes() {
    return Array.from(this.envelopes.keys());
  }

  _getEnvelopeOrThrow(envelopeId) {
    _assertStr(envelopeId, 'envelopeId');
    const env = this.envelopes.get(envelopeId);
    if (!env) throw new Error('unknown envelopeId: ' + envelopeId);
    return env;
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */

module.exports = Object.freeze({
  ESignature,
  SIGNATURE_LEVELS,
  ENVELOPE_STATUS,
  SIGNER_STATUS,
  AUDIT_ACTIONS,
  // Exposed for test-side canonicalization only.
  _canonical,
});
