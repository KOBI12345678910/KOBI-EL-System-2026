/**
 * ESignWorkflow — onyx-procurement/src/documents/esign.js
 * ════════════════════════════════════════════════════════════════════════
 * Agent Y-107 — Techno-Kol Uzi Mega-ERP — 2026-04-11
 *
 * Class-based electronic signature envelope workflow, compliant with
 * Israeli חוק חתימה אלקטרונית תשס"א-2001 (Electronic Signature Law 2001).
 *
 * RULE: לא מוחקים רק משדרגים ומגדלים.
 *   This module UPGRADES and EXTENDS the existing, function-style
 *   `src/contracts/esign.js` (Agent X-23). That module is NOT deleted,
 *   replaced, or mutated. It remains in place and is internally
 *   re-used as a crypto/audit primitive engine wherever possible
 *   (sha256, hmac, canonicalJson). This file layers on top a
 *   higher-level "envelope + workflow + certificate" API suitable
 *   for multi-document packages, biometric capture, RFC 3161
 *   timestamping, and the three Israeli legal compliance tiers.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Israeli Electronic Signature Law 2001 — legal tiers
 * ───────────────────────────────────────────────────────────────────────
 *
 *   Tier 1 — חתימה אלקטרונית רגילה (Simple)
 *     § Any data in electronic form attached to or associated with
 *       other data, used by the signer to sign.
 *     § Implementation: click-to-sign / typed name / drawn signature
 *       with captured IP + user agent + timestamp.
 *     § Legal weight: admissible as evidence but may be contested.
 *
 *   Tier 2 — חתימה אלקטרונית מאובטחת (Advanced / Secured)
 *     § Uniquely linked to the signer; capable of identifying them;
 *       created using means the signer maintains under sole control;
 *       linked to the data such that any change to the data is
 *       detectable.
 *     § Implementation: HMAC-bound tokens, SHA-256 document hashes,
 *       tamper-evident audit trail, strong identity auth
 *       (SMS-OTP / ID-verify).
 *     § Legal weight: presumed valid unless proven otherwise.
 *
 *   Tier 3 — חתימה אלקטרונית מאושרת (Qualified / Certified)
 *     § Tier 2 + produced using a Secure Signature Creation Device
 *       (smart-card / HSM) + issued by an accredited certification
 *       authority under "רשות אישורים מאובטחת" (Israeli MoJ registry).
 *     § Implementation: external hardware token (smart card / USB HSM)
 *       bridging via the Israeli accredited CA stub. THIS MODULE IS
 *       NOT A LICENSED CA — callers who need qualified signatures
 *       must plug in a licensed provider via `registerQualifiedCA()`
 *       and submit the resulting certificate blob.
 *     § Legal weight: equivalent to a handwritten signature, admissible
 *       in Israeli courts without further proof of authenticity.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Envelope state machine (append-only — never delete)
 * ───────────────────────────────────────────────────────────────────────
 *
 *   draft ──createEnvelope()──▶ prepared
 *     └──sendEnvelope()────────▶ out_for_signature
 *           ├──recordSignature()▶ partial (and notifyNext())
 *           ├──declineSignature()▶ declined (terminal)
 *           ├──voidEnvelope()───▶ voided   (terminal)
 *           └──all signed───────▶ completed
 *                 └──completeEnvelope()▶ sealed (+tamper hash)
 *                        └──timestampToken()▶ sealed_timestamped
 *
 * Note: declined, voided, expired, and sealed states NEVER mutate
 * their signatures, audit_trail, or documents. New events append.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Public API (class ESignWorkflow)
 * ───────────────────────────────────────────────────────────────────────
 *   createEnvelope(opts)                          → envelope
 *   sendEnvelope(envelopeId)                      → { ok, firstSigner, link }
 *   recordSignature({ envelopeId, signerId, ... })→ { ok, nextSigner?, status }
 *   notifyNext(envelopeId)                        → { ok, signerId?, link? }
 *   completeEnvelope(envelopeId)                  → { ok, sealHash, sealedAt }
 *   auditCertificate(envelopeId)                  → full certificate of completion
 *   voidEnvelope({ envelopeId, reason, initiator })→ { ok }
 *   declineSignature(envelopeId, signerId, reason)→ { ok, status }
 *   reminderSchedule({ envelopeId, offsets })     → { ok, reminders[] }
 *   timestampToken(envelopeId)                    → RFC 3161 TSA token (stub)
 *   complianceLevel(envelopeId)                   → 'Simple'|'Advanced'|'Qualified'
 *
 * Zero external deps for core. The only optional external call is
 * `timestampToken()` (TSA — Israeli trust-service provider), and it is
 * fully mockable via `registerTSA(fn)`.
 *
 * Append-only; all state flips are recorded in the audit trail.
 * ───────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
// Re-use primitives from the existing contracts/esign.js (never delete)
// ═══════════════════════════════════════════════════════════════════════

let _legacy = null;
try {
  // Relative from src/documents/esign.js → src/contracts/esign.js
  // eslint-disable-next-line global-require
  _legacy = require('../contracts/esign');
} catch (_) {
  _legacy = null;
}

function _sha256(input) {
  if (_legacy && typeof _legacy.sha256 === 'function') return _legacy.sha256(input);
  const h = crypto.createHash('sha256');
  h.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input);
  return h.digest('hex');
}

function _hmac(secret, input) {
  if (_legacy && typeof _legacy.hmac === 'function') return _legacy.hmac(secret, input);
  const h = crypto.createHmac('sha256', secret);
  h.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input);
  return h.digest('hex');
}

function _canonicalJson(value) {
  if (_legacy && typeof _legacy.canonicalJson === 'function') return _legacy.canonicalJson(value);
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_canonicalJson).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + _canonicalJson(value[k])).join(',') + '}';
  }
  return 'null';
}

// ═══════════════════════════════════════════════════════════════════════
// Constants — enums, labels, defaults
// ═══════════════════════════════════════════════════════════════════════

const ENVELOPE_STATUS = Object.freeze({
  DRAFT:              'draft',
  PREPARED:           'prepared',
  OUT_FOR_SIGNATURE:  'out_for_signature',
  PARTIAL:            'partial',
  COMPLETED:          'completed',
  SEALED:             'sealed',
  SEALED_TIMESTAMPED: 'sealed_timestamped',
  DECLINED:           'declined',
  VOIDED:             'voided',
  EXPIRED:            'expired',
});

const SIGNER_STATUS = Object.freeze({
  PENDING:   'pending',
  NOTIFIED:  'notified',
  VIEWED:    'viewed',
  SIGNED:    'signed',
  DECLINED:  'declined',
  SKIPPED:   'skipped',     // for cc / witness roles that don't need to sign
});

const SIGNER_ROLE = Object.freeze({
  SIGNER:  'signer',
  CC:      'cc',
  WITNESS: 'witness',
});

const AUTH_METHOD = Object.freeze({
  EMAIL:       'email',
  SMS_OTP:     'sms-otp',
  ID_VERIFY:   'id-verify',
  SMART_CARD:  'smart-card',
});

const SIGNATURE_TYPE = Object.freeze({
  DRAWN:      'drawn',
  TYPED:      'typed',
  CLICK:      'click',
  BIOMETRIC:  'biometric',
});

const COMPLIANCE_LEVEL = Object.freeze({
  SIMPLE:    'Simple',     // חתימה אלקטרונית רגילה
  ADVANCED:  'Advanced',   // חתימה אלקטרונית מאובטחת
  QUALIFIED: 'Qualified',  // חתימה אלקטרונית מאושרת
});

const COMPLIANCE_LABELS = Object.freeze({
  Simple:    { he: 'חתימה אלקטרונית רגילה',    en: 'Simple electronic signature' },
  Advanced:  { he: 'חתימה אלקטרונית מאובטחת',  en: 'Advanced / secured electronic signature' },
  Qualified: { he: 'חתימה אלקטרונית מאושרת',   en: 'Qualified / certified electronic signature' },
});

const AUDIT_EVENT = Object.freeze({
  ENVELOPE_CREATED:    'envelope_created',
  ENVELOPE_SENT:       'envelope_sent',
  SIGNER_NOTIFIED:     'signer_notified',
  SIGNER_VIEWED:       'signer_viewed',
  SIGNATURE_RECORDED:  'signature_recorded',
  SIGNATURE_DECLINED:  'signature_declined',
  ENVELOPE_COMPLETED:  'envelope_completed',
  ENVELOPE_SEALED:     'envelope_sealed',
  ENVELOPE_VOIDED:     'envelope_voided',
  ENVELOPE_EXPIRED:    'envelope_expired',
  REMINDER_SCHEDULED:  'reminder_scheduled',
  REMINDER_SENT:       'reminder_sent',
  TSA_TIMESTAMP:       'tsa_timestamp',
  AUDIT_CERT_ISSUED:   'audit_cert_issued',
  COMPLIANCE_ASSESSED: 'compliance_assessed',
});

const EVENT_LABELS = Object.freeze({
  [AUDIT_EVENT.ENVELOPE_CREATED]:    { he: 'מעטפה נוצרה',                en: 'Envelope created' },
  [AUDIT_EVENT.ENVELOPE_SENT]:       { he: 'מעטפה נשלחה לחתימה',         en: 'Envelope sent for signature' },
  [AUDIT_EVENT.SIGNER_NOTIFIED]:     { he: 'חותם קיבל התראה',            en: 'Signer notified' },
  [AUDIT_EVENT.SIGNER_VIEWED]:       { he: 'חותם צפה במסמך',             en: 'Signer viewed document' },
  [AUDIT_EVENT.SIGNATURE_RECORDED]:  { he: 'חתימה נרשמה',                en: 'Signature recorded' },
  [AUDIT_EVENT.SIGNATURE_DECLINED]:  { he: 'חתימה סורבה',                en: 'Signature declined' },
  [AUDIT_EVENT.ENVELOPE_COMPLETED]:  { he: 'כל החותמים השלימו',         en: 'All signers completed' },
  [AUDIT_EVENT.ENVELOPE_SEALED]:     { he: 'מעטפה נחתמה וחותמה',         en: 'Envelope sealed with tamper hash' },
  [AUDIT_EVENT.ENVELOPE_VOIDED]:     { he: 'מעטפה בוטלה',                en: 'Envelope voided' },
  [AUDIT_EVENT.ENVELOPE_EXPIRED]:    { he: 'תוקף המעטפה פג',              en: 'Envelope expired' },
  [AUDIT_EVENT.REMINDER_SCHEDULED]:  { he: 'תזכורת נקבעה',                en: 'Reminder scheduled' },
  [AUDIT_EVENT.REMINDER_SENT]:       { he: 'תזכורת נשלחה',                en: 'Reminder sent' },
  [AUDIT_EVENT.TSA_TIMESTAMP]:       { he: 'חותמת זמן אושרה (TSA)',       en: 'TSA timestamp applied' },
  [AUDIT_EVENT.AUDIT_CERT_ISSUED]:   { he: 'תעודת סיום הונפקה',           en: 'Audit certificate issued' },
  [AUDIT_EVENT.COMPLIANCE_ASSESSED]: { he: 'רמת ציות הוערכה',             en: 'Compliance level assessed' },
});

const DEFAULT_EXPIRY_DAYS = 14;

// Module-level HMAC secret — derived from env, else per-process random
const MODULE_SECRET = (() => {
  const fromEnv = typeof process !== 'undefined' && process.env && process.env.ESIGN_HMAC_SECRET;
  if (fromEnv && String(fromEnv).length >= 16) return String(fromEnv);
  return crypto.randomBytes(32).toString('hex');
})();

// ═══════════════════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════════════════

function nowIso() {
  return new Date().toISOString();
}

function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

function randomId(prefix) {
  return prefix + '_' + crypto.randomBytes(10).toString('hex');
}

// ═══════════════════════════════════════════════════════════════════════
// TSA (RFC 3161) — Israeli trust-service stub + mock hook
// ═══════════════════════════════════════════════════════════════════════

/**
 * Default TSA stub. Produces a deterministic, hash-based token that
 * mimics an RFC 3161 TimeStampToken structure without contacting any
 * real authority. In production, replace via `registerTSA(fn)` with
 * an implementation that calls a licensed Israeli trust-service
 * provider (e.g. ComSign, Israeli MoJ accredited list). Never delete.
 */
function _defaultTSAStub(envelopeDigest) {
  const issuedAt = nowIso();
  const nonce = crypto.randomBytes(8).toString('hex');
  const tokenBody = _sha256(envelopeDigest + '|' + issuedAt + '|' + nonce);
  return {
    rfc: 'RFC 3161',
    tsa: 'stub://israel-trust-services.example',
    tsa_he: 'ספק שירותי אמון — סטאב',
    tsa_en: 'Trust service provider — stub',
    issued_at: issuedAt,
    nonce,
    hashAlgorithm: 'SHA-256',
    messageImprint: envelopeDigest,
    tokenId: 'tsa_' + tokenBody.slice(0, 24),
    token: tokenBody,
    mocked: true,
  };
}

let _tsa = _defaultTSAStub;

function registerTSA(fn) {
  if (typeof fn === 'function') _tsa = fn;
  else _tsa = _defaultTSAStub;
}

// Optional Qualified-CA bridge (tier 3). Off by default; never deletes.
let _qualifiedCA = null;
function registerQualifiedCA(caBridge) {
  _qualifiedCA = (caBridge && typeof caBridge.issue === 'function') ? caBridge : null;
}

// Optional transport adapter (email / SMS). Off by default.
let _transport = null;
function registerTransport(t) {
  _transport = (t && typeof t.send === 'function') ? t : null;
}

// ═══════════════════════════════════════════════════════════════════════
// ESignWorkflow — main class
// ═══════════════════════════════════════════════════════════════════════

class ESignWorkflow {
  constructor(opts = {}) {
    // In-memory, append-only envelope store. Callers that need
    // persistence should subscribe via setPersistenceAdapter().
    this._envelopes = new Map();
    this._persistence = (opts.persistence && typeof opts.persistence.write === 'function')
      ? opts.persistence
      : null;
    this._secret = opts.secret && String(opts.secret).length >= 16
      ? String(opts.secret)
      : MODULE_SECRET;
    // Optional injected clock for deterministic tests.
    this._now = typeof opts.now === 'function' ? opts.now : nowIso;
  }

  // ─── Persistence plumbing ────────────────────────────────────────────

  setPersistenceAdapter(adapter) {
    this._persistence = (adapter && typeof adapter.write === 'function') ? adapter : null;
  }

  _persist(env) {
    if (this._persistence) {
      try { this._persistence.write(deepClone(env)); } catch (_) { /* never throw */ }
    }
  }

  // Expose the full store map (read-only clones) for tests / reports.
  listEnvelopes() {
    const out = [];
    for (const env of this._envelopes.values()) out.push(deepClone(env));
    return out;
  }

  getEnvelope(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    return env ? deepClone(env) : null;
  }

  // ─── Audit plumbing ──────────────────────────────────────────────────

  _appendAudit(env, event, payload = {}) {
    const labels = EVENT_LABELS[event] || { he: event, en: event };
    const entry = {
      event,
      label_he: labels.he,
      label_en: labels.en,
      at: this._now(),
      ...payload,
    };
    env.audit_trail.push(entry);
    this._persist(env);
    return entry;
  }

  _err(code, he, en, extra) {
    return { ok: false, reason: { code, he, en }, ...(extra || {}) };
  }

  // ═════════════════════════════════════════════════════════════════════
  // createEnvelope — instantiate an envelope (state: draft → prepared)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * @param {object} o
   * @param {Array<object>} o.documents    Each: { id?, name, content?, mime?, size?, hash? }
   * @param {Array<object>} o.signers      Each: {
   *                                         id, name, email, phone?, order?,
   *                                         role: 'signer'|'cc'|'witness',
   *                                         authRequired: 'email'|'sms-otp'|'id-verify'|'smart-card'
   *                                       }
   * @param {string} o.subject_he          Hebrew subject
   * @param {string} o.subject_en          English subject
   * @param {string} [o.messageBody]       Body text (bilingual or plain)
   * @param {number} [o.expiryDays=14]     Days until envelope expires
   * @param {string} [o.createdBy]         Optional actor id
   * @param {object} [o.metadata]          Arbitrary caller metadata (stored verbatim)
   * @returns {object} envelope clone
   */
  createEnvelope(o) {
    if (!o || typeof o !== 'object') {
      throw new TypeError('createEnvelope: options object is required');
    }
    if (!Array.isArray(o.documents) || o.documents.length === 0) {
      throw new TypeError('createEnvelope: at least one document is required');
    }
    if (!Array.isArray(o.signers) || o.signers.length === 0) {
      throw new TypeError('createEnvelope: at least one signer is required');
    }
    if (!o.subject_he || typeof o.subject_he !== 'string') {
      throw new TypeError('createEnvelope: subject_he (Hebrew subject) is required');
    }
    if (!o.subject_en || typeof o.subject_en !== 'string') {
      throw new TypeError('createEnvelope: subject_en (English subject) is required');
    }

    // Normalise documents — compute hash if not provided
    const docs = o.documents.map((d, idx) => {
      if (!d || typeof d !== 'object') {
        throw new TypeError(`createEnvelope: document #${idx + 1} must be an object`);
      }
      if (!d.name || typeof d.name !== 'string') {
        throw new TypeError(`createEnvelope: document #${idx + 1} missing .name`);
      }
      const serialisedContent = d.content != null ? String(d.content) : '';
      const hash = d.hash || _sha256(_canonicalJson({
        name: d.name,
        mime: d.mime || 'application/octet-stream',
        content: serialisedContent,
      }));
      return {
        id: d.id || `doc_${idx + 1}`,
        name: d.name,
        mime: d.mime || 'application/octet-stream',
        size: Number.isFinite(d.size) ? d.size : serialisedContent.length,
        hash,
        content_present: serialisedContent.length > 0,
      };
    });

    // Normalise signers — order assignment, role + auth method validation
    const signers = o.signers.map((s, idx) => {
      if (!s || typeof s !== 'object') {
        throw new TypeError(`createEnvelope: signer #${idx + 1} must be an object`);
      }
      if (!s.id || typeof s.id !== 'string') {
        throw new TypeError(`createEnvelope: signer #${idx + 1} missing .id`);
      }
      if (!s.name || typeof s.name !== 'string') {
        throw new TypeError(`createEnvelope: signer #${idx + 1} missing .name`);
      }
      if (!s.email || typeof s.email !== 'string') {
        throw new TypeError(`createEnvelope: signer #${idx + 1} missing .email`);
      }
      const role = s.role || SIGNER_ROLE.SIGNER;
      if (![SIGNER_ROLE.SIGNER, SIGNER_ROLE.CC, SIGNER_ROLE.WITNESS].includes(role)) {
        throw new TypeError(`createEnvelope: signer #${idx + 1} has invalid role '${role}'`);
      }
      const authRequired = s.authRequired || AUTH_METHOD.EMAIL;
      if (![AUTH_METHOD.EMAIL, AUTH_METHOD.SMS_OTP, AUTH_METHOD.ID_VERIFY, AUTH_METHOD.SMART_CARD]
            .includes(authRequired)) {
        throw new TypeError(`createEnvelope: signer #${idx + 1} has invalid authRequired '${authRequired}'`);
      }
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone || '',
        order: Number.isFinite(s.order) ? s.order : idx + 1,
        role,
        authRequired,
        status: role === SIGNER_ROLE.CC ? SIGNER_STATUS.SKIPPED : SIGNER_STATUS.PENDING,
        magicLinkToken: null,       // issued on sendEnvelope / notifyNext
        signature: null,            // populated on recordSignature
        authEvidence: null,         // populated on recordSignature
        notifiedAt: null,
        viewedAt: null,
        signedAt: null,
        declinedAt: null,
        declineReason: null,
      };
    });

    // Stable ordering — sort by .order then original index
    signers.sort((a, b) => (a.order - b.order));

    // Envelope digest — a single hash over the ordered document hashes
    // so that ANY document change produces a different envelope digest.
    const envelopeDigest = _sha256(_canonicalJson({
      documents: docs.map(d => ({ id: d.id, name: d.name, hash: d.hash })),
      subject_he: o.subject_he,
      subject_en: o.subject_en,
    }));

    const now = new Date();
    const ttlDays = Number.isFinite(o.expiryDays) && o.expiryDays > 0 ? o.expiryDays : DEFAULT_EXPIRY_DAYS;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const envelopeId = randomId('env');

    const envelope = {
      envelopeId,
      status: ENVELOPE_STATUS.PREPARED,
      documents: docs,
      signers,
      subject_he: o.subject_he,
      subject_en: o.subject_en,
      messageBody: o.messageBody || '',
      metadata: o.metadata ? deepClone(o.metadata) : {},
      envelopeDigest,
      createdAt: now.toISOString(),
      createdBy: o.createdBy || null,
      expiryDays: ttlDays,
      expiresAt,
      sentAt: null,
      completedAt: null,
      sealedAt: null,
      voidedAt: null,
      voidReason: null,
      voidInitiator: null,
      sealHash: null,
      tsaToken: null,
      reminders: [],
      currentSignerIndex: -1,      // set on sendEnvelope
      audit_trail: [],
    };

    this._appendAudit(envelope, AUDIT_EVENT.ENVELOPE_CREATED, {
      envelopeId,
      documents_count: docs.length,
      signers_count: signers.length,
      envelope_digest: envelopeDigest,
      subject_he: o.subject_he,
      subject_en: o.subject_en,
    });

    this._envelopes.set(envelopeId, envelope);
    this._persist(envelope);
    return deepClone(envelope);
  }

  // ═════════════════════════════════════════════════════════════════════
  // sendEnvelope — dispatch magic-link to first active signer
  // ═════════════════════════════════════════════════════════════════════

  sendEnvelope(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return this._err('VOIDED', 'המעטפה בוטלה', 'Envelope already voided');
    }
    if (env.status !== ENVELOPE_STATUS.PREPARED && env.status !== ENVELOPE_STATUS.DRAFT) {
      return this._err('BAD_STATE', 'מצב מעטפה לא תקין לשליחה',
                       `Envelope cannot be sent from status '${env.status}'`);
    }

    if (this._checkAndExpire(env)) {
      return this._err('EXPIRED', 'תוקף המעטפה פג', 'Envelope expired before send');
    }

    env.status = ENVELOPE_STATUS.OUT_FOR_SIGNATURE;
    env.sentAt = this._now();
    this._appendAudit(env, AUDIT_EVENT.ENVELOPE_SENT, { sent_at: env.sentAt });

    const first = this._findNextActiveSignerIndex(env, -1);
    if (first === -1) {
      // No active signers (all cc/witness): flip directly to completed
      env.status = ENVELOPE_STATUS.COMPLETED;
      env.completedAt = this._now();
      this._appendAudit(env, AUDIT_EVENT.ENVELOPE_COMPLETED, { signed_count: 0, auto: true });
      this._persist(env);
      return { ok: true, firstSigner: null, link: null, status: env.status };
    }
    env.currentSignerIndex = first;
    const link = this._notifySigner(env, first);
    this._persist(env);
    return {
      ok: true,
      firstSigner: env.signers[first].id,
      link,
      status: env.status,
    };
  }

  _notifySigner(env, idx) {
    const signer = env.signers[idx];
    if (!signer) return null;
    const token = this._issueMagicLink(env.envelopeId, signer.id);
    signer.magicLinkToken = token;
    signer.status = SIGNER_STATUS.NOTIFIED;
    signer.notifiedAt = this._now();
    const link = `/esign/envelope/${env.envelopeId}/sign/${token}`;
    this._appendAudit(env, AUDIT_EVENT.SIGNER_NOTIFIED, {
      signer_id: signer.id,
      signer_name: signer.name,
      auth_required: signer.authRequired,
      link_path: link,
    });
    if (_transport) {
      try {
        _transport.send({
          to: signer.email,
          phone: signer.phone,
          subject_he: env.subject_he,
          subject_en: env.subject_en,
          body: env.messageBody,
          link,
          auth: signer.authRequired,
        });
      } catch (_) { /* never throw */ }
    }
    return link;
  }

  _issueMagicLink(envelopeId, signerId) {
    // random 16-byte body + HMAC-16 binding to envelope + signer
    const random = crypto.randomBytes(16).toString('hex');
    const mac = _hmac(this._secret, `${envelopeId}:${signerId}:${random}`).slice(0, 16);
    return `${random}.${mac}`;
  }

  _verifyMagicLink(envelopeId, signerId, token) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [random, mac] = parts;
    if (!/^[a-f0-9]{32}$/.test(random) || !/^[a-f0-9]{16}$/.test(mac)) return false;
    const expected = _hmac(this._secret, `${envelopeId}:${signerId}:${random}`).slice(0, 16);
    if (expected.length !== mac.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
    return diff === 0;
  }

  _findNextActiveSignerIndex(env, fromIdx) {
    for (let i = fromIdx + 1; i < env.signers.length; i++) {
      const s = env.signers[i];
      if (s.status === SIGNER_STATUS.SKIPPED) continue;
      if (s.status === SIGNER_STATUS.SIGNED) continue;
      if (s.status === SIGNER_STATUS.DECLINED) continue;
      return i;
    }
    return -1;
  }

  _checkAndExpire(env) {
    const exp = new Date(env.expiresAt).getTime();
    if (!Number.isFinite(exp)) return false;
    if (Date.now() > exp
        && env.status !== ENVELOPE_STATUS.COMPLETED
        && env.status !== ENVELOPE_STATUS.SEALED
        && env.status !== ENVELOPE_STATUS.SEALED_TIMESTAMPED
        && env.status !== ENVELOPE_STATUS.VOIDED
        && env.status !== ENVELOPE_STATUS.DECLINED) {
      env.status = ENVELOPE_STATUS.EXPIRED;
      this._appendAudit(env, AUDIT_EVENT.ENVELOPE_EXPIRED, {});
      this._persist(env);
      return true;
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════
  // recordSignature — capture a single signer's signature
  // ═════════════════════════════════════════════════════════════════════

  /**
   * @param {object} o
   * @param {string} o.envelopeId
   * @param {string} o.signerId
   * @param {object} o.signaturePayload       { type, data, ip, userAgent, geoCoords?, timestamp }
   * @param {object} [o.authEvidence]         Opaque caller-provided auth trace (OTP verified, ID check, etc.)
   * @param {string} [o.magicLinkToken]       Optional token from link; if provided, verified
   * @returns {object} { ok, envelopeId, signerId, nextSigner?, status }
   */
  recordSignature(o) {
    if (!o || typeof o !== 'object') {
      return this._err('BAD_ARG', 'פרמטרים חסרים', 'Missing arguments');
    }
    const env = this._envelopes.get(o.envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');

    if (this._checkAndExpire(env)) {
      return this._err('EXPIRED', 'תוקף המעטפה פג', 'Envelope expired');
    }
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return this._err('VOIDED', 'המעטפה בוטלה', 'Envelope is voided');
    }
    if (env.status === ENVELOPE_STATUS.DECLINED) {
      return this._err('DECLINED', 'המעטפה נדחתה', 'Envelope already declined');
    }
    if (env.status === ENVELOPE_STATUS.SEALED || env.status === ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return this._err('SEALED', 'המעטפה נחתמה כבר', 'Envelope already sealed');
    }
    if (env.status !== ENVELOPE_STATUS.OUT_FOR_SIGNATURE && env.status !== ENVELOPE_STATUS.PARTIAL) {
      return this._err('BAD_STATE', 'מצב מעטפה לא תקין',
                       `Cannot record signature from status '${env.status}'`);
    }

    const idx = env.signers.findIndex(s => s.id === o.signerId);
    if (idx === -1) {
      return this._err('SIGNER_NOT_FOUND', 'חותם לא נמצא', 'Signer not found');
    }
    const signer = env.signers[idx];

    if (signer.role === SIGNER_ROLE.CC) {
      return this._err('CC_ROLE', 'משתתף מסוג העתק אינו חותם', 'CC role does not sign');
    }
    if (signer.status === SIGNER_STATUS.SIGNED) {
      return this._err('ALREADY_SIGNED', 'החותם כבר חתם', 'Signer already signed');
    }
    if (signer.status === SIGNER_STATUS.DECLINED) {
      return this._err('ALREADY_DECLINED', 'החותם כבר סירב', 'Signer already declined');
    }

    // Sequential enforcement — all previous non-skipped signers must be done
    for (let i = 0; i < idx; i++) {
      const prev = env.signers[i];
      if (prev.status === SIGNER_STATUS.SKIPPED) continue;
      if (prev.status !== SIGNER_STATUS.SIGNED && prev.status !== SIGNER_STATUS.DECLINED) {
        return this._err('OUT_OF_ORDER',
                         'חותם קודם טרם חתם',
                         'Previous signer has not completed',
                         { blocking_signer: prev.id });
      }
    }

    // Optional magic-link verification (if a token was provided)
    if (o.magicLinkToken != null) {
      const ok = this._verifyMagicLink(env.envelopeId, signer.id, o.magicLinkToken);
      if (!ok) {
        return this._err('BAD_LINK', 'קישור לא תקף', 'Invalid magic-link token');
      }
    }

    const p = o.signaturePayload || {};
    if (!p.type || ![SIGNATURE_TYPE.DRAWN, SIGNATURE_TYPE.TYPED, SIGNATURE_TYPE.CLICK, SIGNATURE_TYPE.BIOMETRIC].includes(p.type)) {
      return this._err('BAD_TYPE', 'סוג חתימה לא חוקי', `Invalid signature type '${p.type}'`);
    }
    // At least one of data / typed name must be present (click = implicit)
    if (p.type !== SIGNATURE_TYPE.CLICK && !p.data) {
      return this._err('NO_DATA', 'חסרים נתוני חתימה', 'Signature data is missing');
    }

    const nowStr = this._now();
    const signatureBlob = {
      type: p.type,
      data: p.data || '',
      data_sha256: p.data ? _sha256(String(p.data)) : '',
      ip: p.ip || '',
      userAgent: p.userAgent || '',
      geoCoords: p.geoCoords || null,
      timestamp: p.timestamp || nowStr,
      capturedAt: nowStr,
      envelopeDigest: env.envelopeDigest,
    };

    // HMAC binding — ties blob to envelope+signer+bytes
    signatureBlob.sig_hmac = _hmac(this._secret, [
      env.envelopeId,
      signer.id,
      signatureBlob.type,
      signatureBlob.data_sha256,
      signatureBlob.timestamp,
      signatureBlob.ip,
      signatureBlob.userAgent,
    ].join('|'));

    signer.signature = signatureBlob;
    signer.authEvidence = o.authEvidence ? deepClone(o.authEvidence) : null;
    signer.status = SIGNER_STATUS.SIGNED;
    signer.signedAt = nowStr;

    this._appendAudit(env, AUDIT_EVENT.SIGNATURE_RECORDED, {
      signer_id: signer.id,
      signer_name: signer.name,
      signature_type: signatureBlob.type,
      ip: signatureBlob.ip,
      userAgent: signatureBlob.userAgent,
      auth_method: signer.authRequired,
    });

    // Update envelope status
    const allDone = env.signers.every(s =>
      s.status === SIGNER_STATUS.SIGNED ||
      s.status === SIGNER_STATUS.SKIPPED);
    if (allDone) {
      env.status = ENVELOPE_STATUS.COMPLETED;
      env.completedAt = nowStr;
      this._appendAudit(env, AUDIT_EVENT.ENVELOPE_COMPLETED, {
        signed_count: env.signers.filter(s => s.status === SIGNER_STATUS.SIGNED).length,
      });
    } else {
      env.status = ENVELOPE_STATUS.PARTIAL;
    }

    // Advance pointer
    const next = this._findNextActiveSignerIndex(env, idx);
    env.currentSignerIndex = next;

    this._persist(env);

    return {
      ok: true,
      envelopeId: env.envelopeId,
      signerId: signer.id,
      nextSigner: next >= 0 ? env.signers[next].id : null,
      status: env.status,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // notifyNext — advance and notify the next signer in sequence
  // ═════════════════════════════════════════════════════════════════════

  notifyNext(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (this._checkAndExpire(env)) {
      return this._err('EXPIRED', 'תוקף המעטפה פג', 'Envelope expired');
    }
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return this._err('VOIDED', 'המעטפה בוטלה', 'Envelope voided');
    }
    if (env.status === ENVELOPE_STATUS.COMPLETED
        || env.status === ENVELOPE_STATUS.SEALED
        || env.status === ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return this._err('ALREADY_DONE', 'המעטפה כבר הושלמה', 'Envelope already complete');
    }
    const idx = this._findNextActiveSignerIndex(env, env.currentSignerIndex);
    if (idx === -1) {
      // Maybe done — re-evaluate
      const allDone = env.signers.every(s =>
        s.status === SIGNER_STATUS.SIGNED || s.status === SIGNER_STATUS.SKIPPED);
      if (allDone && env.status !== ENVELOPE_STATUS.COMPLETED) {
        env.status = ENVELOPE_STATUS.COMPLETED;
        env.completedAt = this._now();
        this._appendAudit(env, AUDIT_EVENT.ENVELOPE_COMPLETED, { auto: true });
        this._persist(env);
      }
      return { ok: true, signerId: null, link: null, status: env.status };
    }
    env.currentSignerIndex = idx;
    const link = this._notifySigner(env, idx);
    this._persist(env);
    return { ok: true, signerId: env.signers[idx].id, link, status: env.status };
  }

  // ═════════════════════════════════════════════════════════════════════
  // completeEnvelope — seal with tamper-evident hash
  // ═════════════════════════════════════════════════════════════════════

  completeEnvelope(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return this._err('VOIDED', 'המעטפה בוטלה', 'Envelope voided');
    }
    if (env.status === ENVELOPE_STATUS.SEALED || env.status === ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return { ok: true, sealHash: env.sealHash, sealedAt: env.sealedAt, alreadySealed: true };
    }
    if (env.status !== ENVELOPE_STATUS.COMPLETED) {
      return this._err('NOT_COMPLETED', 'המעטפה טרם הושלמה',
                       `Cannot seal envelope in status '${env.status}'`);
    }

    // Build a canonical seal payload — everything legally material
    const sealPayload = _canonicalJson({
      envelopeId: env.envelopeId,
      envelopeDigest: env.envelopeDigest,
      subject_he: env.subject_he,
      subject_en: env.subject_en,
      documents: env.documents.map(d => ({ id: d.id, name: d.name, hash: d.hash })),
      signers: env.signers.map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        authRequired: s.authRequired,
        status: s.status,
        signature: s.signature ? {
          type: s.signature.type,
          data_sha256: s.signature.data_sha256,
          timestamp: s.signature.timestamp,
          sig_hmac: s.signature.sig_hmac,
        } : null,
        signedAt: s.signedAt,
      })),
      completedAt: env.completedAt,
    });

    const sealHash = _sha256(sealPayload);
    env.sealHash = sealHash;
    env.sealedAt = this._now();
    env.status = ENVELOPE_STATUS.SEALED;

    this._appendAudit(env, AUDIT_EVENT.ENVELOPE_SEALED, {
      seal_hash: sealHash,
      sealed_at: env.sealedAt,
    });
    this._persist(env);

    return {
      ok: true,
      envelopeId: env.envelopeId,
      sealHash,
      sealedAt: env.sealedAt,
      status: env.status,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // auditCertificate — certificate of completion with full trail
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Produce a legally-formatted certificate of completion. This is the
   * object that goes into evidence in an Israeli court. It is never
   * mutated after issuance (we store the last-issued cert on the envelope
   * for convenience, but each call regenerates from live state and
   * appends an audit event).
   */
  auditCertificate(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');

    const level = this._assessComplianceLevel(env);
    const labels = COMPLIANCE_LABELS[level];

    const cert = {
      certificate_type: 'ESign Certificate of Completion',
      certificate_type_he: 'תעודת השלמת חתימה אלקטרונית',
      certificate_type_en: 'Electronic signature certificate of completion',
      certificate_id: 'cert_' + _sha256(env.envelopeId + '|' + (env.sealHash || '') + '|' + this._now()).slice(0, 32),
      issued_at: this._now(),

      envelope: {
        id: env.envelopeId,
        status: env.status,
        subject_he: env.subject_he,
        subject_en: env.subject_en,
        message_body: env.messageBody,
        created_at: env.createdAt,
        created_by: env.createdBy,
        sent_at: env.sentAt,
        completed_at: env.completedAt,
        sealed_at: env.sealedAt,
        expires_at: env.expiresAt,
        envelope_digest: env.envelopeDigest,
        seal_hash: env.sealHash || null,
        tsa_token: env.tsaToken || null,
      },

      compliance: {
        level,                                // Simple | Advanced | Qualified
        level_he: labels.he,
        level_en: labels.en,
        law_reference: 'חוק חתימה אלקטרונית, תשס"א-2001',
        law_reference_en: 'Israeli Electronic Signature Law 2001',
      },

      documents: env.documents.map(d => ({
        id: d.id,
        name: d.name,
        mime: d.mime,
        size: d.size,
        hash: d.hash,
        hash_algorithm: 'SHA-256',
      })),

      signers: env.signers.map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone || '',
        order: s.order,
        role: s.role,
        auth_required: s.authRequired,
        status: s.status,
        notified_at: s.notifiedAt,
        viewed_at: s.viewedAt,
        signed_at: s.signedAt,
        declined_at: s.declinedAt,
        decline_reason: s.declineReason,
        signature: s.signature ? {
          type: s.signature.type,
          data_sha256: s.signature.data_sha256,
          timestamp: s.signature.timestamp,
          capturedAt: s.signature.capturedAt,
          ip: s.signature.ip,
          userAgent: s.signature.userAgent,
          geoCoords: s.signature.geoCoords,
          envelope_digest: s.signature.envelopeDigest,
          sig_hmac: s.signature.sig_hmac,
        } : null,
        auth_evidence: s.authEvidence,
      })),

      audit_trail: env.audit_trail.map(e => ({ ...e })),

      tamper_evidence: {
        envelope_digest: env.envelopeDigest,
        seal_hash: env.sealHash || null,
        hash_algorithm: 'SHA-256',
        hmac_algorithm: 'HMAC-SHA-256',
        tsa_token: env.tsaToken || null,
      },

      notes_he: [
        'תעודה זו מהווה ראיה להשלמת חתימה אלקטרונית לפי חוק חתימה אלקטרונית תשס"א-2001.',
        'כל שינוי במסמך לאחר החתימה יזוהה באמצעות hash SHA-256.',
        'שרשרת אירועי הביקורת היא append-only ולא נמחקת לעולם.',
      ],
      notes_en: [
        'This certificate is evidence of electronic signature completion under Israeli Electronic Signature Law 2001.',
        'Any post-signature modification is detectable via SHA-256 hash comparison.',
        'The audit trail is append-only and is never deleted.',
      ],
    };

    // Store the last-issued cert on the envelope (non-destructive)
    env.lastCertificate = deepClone(cert);
    this._appendAudit(env, AUDIT_EVENT.AUDIT_CERT_ISSUED, {
      certificate_id: cert.certificate_id,
      compliance_level: level,
    });
    this._persist(env);

    return cert;
  }

  // ═════════════════════════════════════════════════════════════════════
  // voidEnvelope — cancel before completion (append-only)
  // ═════════════════════════════════════════════════════════════════════

  voidEnvelope(o) {
    if (!o || !o.envelopeId) {
      return this._err('BAD_ARG', 'חסר מזהה מעטפה', 'envelopeId is required');
    }
    const env = this._envelopes.get(o.envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return { ok: true, alreadyVoided: true, status: env.status };
    }
    if (env.status === ENVELOPE_STATUS.COMPLETED
        || env.status === ENVELOPE_STATUS.SEALED
        || env.status === ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return this._err('ALREADY_DONE', 'לא ניתן לבטל מעטפה שהושלמה',
                       'Cannot void a completed / sealed envelope');
    }
    env.status = ENVELOPE_STATUS.VOIDED;
    env.voidedAt = this._now();
    env.voidReason = o.reason || '';
    env.voidInitiator = o.initiator || null;
    this._appendAudit(env, AUDIT_EVENT.ENVELOPE_VOIDED, {
      reason: env.voidReason,
      initiator: env.voidInitiator,
    });
    this._persist(env);
    return { ok: true, status: env.status };
  }

  // ═════════════════════════════════════════════════════════════════════
  // declineSignature — a signer refuses (append-only, terminal)
  // ═════════════════════════════════════════════════════════════════════

  declineSignature(envelopeId, signerId, reason) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status === ENVELOPE_STATUS.VOIDED) {
      return this._err('VOIDED', 'המעטפה בוטלה', 'Envelope voided');
    }
    if (env.status === ENVELOPE_STATUS.COMPLETED
        || env.status === ENVELOPE_STATUS.SEALED
        || env.status === ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return this._err('ALREADY_DONE', 'המעטפה הושלמה', 'Envelope already complete');
    }
    const signer = env.signers.find(s => s.id === signerId);
    if (!signer) return this._err('SIGNER_NOT_FOUND', 'חותם לא נמצא', 'Signer not found');
    if (signer.status === SIGNER_STATUS.SIGNED) {
      return this._err('ALREADY_SIGNED', 'החותם כבר חתם', 'Signer already signed');
    }
    if (signer.status === SIGNER_STATUS.DECLINED) {
      return { ok: true, alreadyDeclined: true, status: env.status };
    }
    signer.status = SIGNER_STATUS.DECLINED;
    signer.declinedAt = this._now();
    signer.declineReason = reason || '';
    this._appendAudit(env, AUDIT_EVENT.SIGNATURE_DECLINED, {
      signer_id: signer.id,
      signer_name: signer.name,
      reason: signer.declineReason,
    });
    // Once any required signer declines, the entire envelope is declined
    // (append-only; signatures already captured remain in place).
    env.status = ENVELOPE_STATUS.DECLINED;
    this._persist(env);
    return { ok: true, status: env.status };
  }

  // ═════════════════════════════════════════════════════════════════════
  // reminderSchedule — schedule auto-reminders at given offsets
  // ═════════════════════════════════════════════════════════════════════

  /**
   * @param {object} o
   * @param {string} o.envelopeId
   * @param {Array<number>} o.offsets  Offsets in hours from "now" (e.g. [24, 72, 168])
   */
  reminderSchedule(o) {
    if (!o || !o.envelopeId || !Array.isArray(o.offsets)) {
      return this._err('BAD_ARG', 'פרמטרים חסרים', 'envelopeId + offsets[] required');
    }
    const env = this._envelopes.get(o.envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status === ENVELOPE_STATUS.VOIDED || env.status === ENVELOPE_STATUS.SEALED) {
      return this._err('BAD_STATE', 'לא ניתן לתזמן תזכורות',
                       `Cannot schedule reminders in status '${env.status}'`);
    }
    const base = Date.now();
    const reminders = o.offsets
      .filter(h => Number.isFinite(h) && h > 0)
      .map((hours) => {
        const dueAt = new Date(base + hours * 60 * 60 * 1000).toISOString();
        return {
          id: 'rem_' + crypto.randomBytes(6).toString('hex'),
          offset_hours: hours,
          due_at: dueAt,
          sent: false,
          sent_at: null,
        };
      });
    // Append (never overwrite) — a new call layers on top
    env.reminders = (env.reminders || []).concat(reminders);
    this._appendAudit(env, AUDIT_EVENT.REMINDER_SCHEDULED, {
      count: reminders.length,
      offsets: reminders.map(r => r.offset_hours),
    });
    this._persist(env);
    return { ok: true, reminders };
  }

  // ═════════════════════════════════════════════════════════════════════
  // timestampToken — RFC 3161 TSA timestamp (mockable)
  // ═════════════════════════════════════════════════════════════════════

  timestampToken(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    if (env.status !== ENVELOPE_STATUS.SEALED
        && env.status !== ENVELOPE_STATUS.SEALED_TIMESTAMPED) {
      return this._err('NOT_SEALED', 'המעטפה טרם נחתמה',
                       `Can only timestamp a sealed envelope (status=${env.status})`);
    }
    const digest = env.sealHash || env.envelopeDigest;
    let tok;
    try {
      tok = _tsa(digest);
    } catch (e) {
      tok = _defaultTSAStub(digest);
      tok.error = String(e && e.message || e);
    }
    env.tsaToken = tok;
    env.status = ENVELOPE_STATUS.SEALED_TIMESTAMPED;
    this._appendAudit(env, AUDIT_EVENT.TSA_TIMESTAMP, {
      tsa: tok.tsa || '',
      token_id: tok.tokenId || '',
      issued_at: tok.issued_at || '',
    });
    this._persist(env);
    return tok;
  }

  // ═════════════════════════════════════════════════════════════════════
  // complianceLevel — Simple / Advanced / Qualified per Israeli law
  // ═════════════════════════════════════════════════════════════════════

  complianceLevel(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return this._err('NOT_FOUND', 'מעטפה לא נמצאה', 'Envelope not found');
    const level = this._assessComplianceLevel(env);
    const labels = COMPLIANCE_LABELS[level];
    this._appendAudit(env, AUDIT_EVENT.COMPLIANCE_ASSESSED, { level });
    this._persist(env);
    return {
      envelopeId: env.envelopeId,
      level,
      level_he: labels.he,
      level_en: labels.en,
      law: 'חוק חתימה אלקטרונית, תשס"א-2001',
      law_en: 'Israeli Electronic Signature Law 2001',
    };
  }

  _assessComplianceLevel(env) {
    // Start from the weakest level and promote if evidence supports it.
    const realSigners = env.signers.filter(s => s.role !== SIGNER_ROLE.CC);
    if (realSigners.length === 0) return COMPLIANCE_LEVEL.SIMPLE;

    // Tier 3 — Qualified: every signer used smart-card AND we have a
    // registered qualified-CA bridge AND every signed signer has an
    // auth evidence blob flagged `qualified: true` (issued by the CA).
    const allSmartCard = realSigners.every(s => s.authRequired === AUTH_METHOD.SMART_CARD);
    const allQualifiedEvidence = realSigners.every(s =>
      !s.signature || (s.authEvidence && s.authEvidence.qualified === true));
    if (allSmartCard && _qualifiedCA && allQualifiedEvidence) {
      return COMPLIANCE_LEVEL.QUALIFIED;
    }

    // Tier 2 — Advanced / Secured: every signer had strong auth
    // (SMS-OTP, ID-verify, or smart-card) AND every captured signature
    // has a valid sig_hmac (tamper-evident) AND envelope digest is bound.
    const strongAuth = realSigners.every(s =>
      s.authRequired === AUTH_METHOD.SMS_OTP ||
      s.authRequired === AUTH_METHOD.ID_VERIFY ||
      s.authRequired === AUTH_METHOD.SMART_CARD);
    const tamperEvident = realSigners.every(s =>
      !s.signature || (s.signature.sig_hmac && s.signature.envelopeDigest === env.envelopeDigest));
    if (strongAuth && tamperEvident) {
      return COMPLIANCE_LEVEL.ADVANCED;
    }

    return COMPLIANCE_LEVEL.SIMPLE;
  }

  // ═════════════════════════════════════════════════════════════════════
  // View-tracking helper (optional — used by portals on link-open)
  // ═════════════════════════════════════════════════════════════════════

  markSignerViewed(envelopeId, signerId, meta) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return false;
    const signer = env.signers.find(s => s.id === signerId);
    if (!signer) return false;
    signer.viewedAt = this._now();
    if (signer.status === SIGNER_STATUS.NOTIFIED) signer.status = SIGNER_STATUS.VIEWED;
    this._appendAudit(env, AUDIT_EVENT.SIGNER_VIEWED, {
      signer_id: signer.id,
      ip: (meta && meta.ip) || '',
      userAgent: (meta && meta.userAgent) || '',
    });
    this._persist(env);
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Tamper-check helper — re-hash the seal and compare (read-only)
  // ═════════════════════════════════════════════════════════════════════

  verifySeal(envelopeId) {
    const env = this._envelopes.get(envelopeId);
    if (!env) return { valid: false, reason: 'not_found' };
    if (!env.sealHash) return { valid: false, reason: 'not_sealed' };
    const sealPayload = _canonicalJson({
      envelopeId: env.envelopeId,
      envelopeDigest: env.envelopeDigest,
      subject_he: env.subject_he,
      subject_en: env.subject_en,
      documents: env.documents.map(d => ({ id: d.id, name: d.name, hash: d.hash })),
      signers: env.signers.map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        authRequired: s.authRequired,
        status: s.status,
        signature: s.signature ? {
          type: s.signature.type,
          data_sha256: s.signature.data_sha256,
          timestamp: s.signature.timestamp,
          sig_hmac: s.signature.sig_hmac,
        } : null,
        signedAt: s.signedAt,
      })),
      completedAt: env.completedAt,
    });
    const recomputed = _sha256(sealPayload);
    return {
      valid: recomputed === env.sealHash,
      stored: env.sealHash,
      recomputed,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  ESignWorkflow,

  // Enums
  ENVELOPE_STATUS,
  SIGNER_STATUS,
  SIGNER_ROLE,
  AUTH_METHOD,
  SIGNATURE_TYPE,
  COMPLIANCE_LEVEL,
  COMPLIANCE_LABELS,
  AUDIT_EVENT,
  EVENT_LABELS,

  // Extension points
  registerTSA,
  registerQualifiedCA,
  registerTransport,

  // Re-exported primitives (for tests + portals)
  sha256: _sha256,
  hmac: _hmac,
  canonicalJson: _canonicalJson,
};
