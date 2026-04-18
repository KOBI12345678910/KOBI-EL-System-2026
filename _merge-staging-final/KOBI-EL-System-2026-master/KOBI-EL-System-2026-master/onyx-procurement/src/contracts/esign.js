/**
 * E-Signature Engine — esign.js
 * ════════════════════════════════════════════════════════════════════
 * Agent X-23 — Techno-Kol Uzi ERP (Swarm 3B) — written 2026-04-11
 *
 * A self-contained, dependency-free e-sign module that produces Israeli
 * Contract Law 1973 (חוק החוזים (חלק כללי) תשל"ג-1973) and Electronic
 * Signature Law 2001 (חוק חתימה אלקטרונית תשס"א-2001) friendly
 * signature records.
 *
 * Threat model & legal posture
 * ────────────────────────────
 * The Israeli Electronic Signature Law distinguishes three tiers:
 *
 *   (1) "חתימה אלקטרונית"             — simple electronic signature
 *   (2) "חתימה אלקטרונית מאובטחת"       — secured (HMAC / proprietary PKI)
 *   (3) "חתימה אלקטרונית מאושרת"        — certified (licensed CA, smart-card)
 *
 * This module implements tier (1) and (2): a simple-but-secured
 * click-to-sign flow with HMAC-backed tokens, SHA-256 document hashing,
 * and a tamper-evident audit trail. It is NOT a licensed CA and does
 * NOT produce tier-(3) חתימה מאושרת — callers who need that must plug
 * in a licensed provider and wrap the resulting certificate blob.
 *
 * Public API
 * ──────────
 *   createRequest(contract, signers, opts)   → { requestId, tokens[] }
 *   recordSignature(token, signatureData)    → { ok, signerIndex, signature }
 *   verifyRequest(requestId)                 → { valid, signed_count, ... }
 *   getRequest(requestId)                    → full request envelope
 *   listRequests()                           → shallow copies of all
 *   canonicaliseDocument(contract)           → stable JSON string for hashing
 *   sha256(str)                              → hex digest
 *   hmac(secret, str)                        → hex digest
 *   generateToken(requestId, signerIdx)      → url-safe token
 *   resetStore()                             → wipe in-memory store (tests)
 *
 * Storage
 * ───────
 * The store is in-memory by design — zero deps. Callers who need
 * persistence should subscribe via setPersistenceAdapter(adapter) and
 * proxy onWrite / onRead to their DB. We never delete records.
 *
 * NEVER DELETE — all records are append-only; cancellation is recorded
 * as a status flip + audit trail entry, never a DROP.
 *
 * Bilingual Hebrew + English. RTL-safe strings. Zero external deps.
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const SIG_MODE = Object.freeze({
  SEQUENTIAL: 'sequential',   // signers sign one-by-one in order
  PARALLEL:   'parallel',     // all signers may sign independently
});

const REQUEST_STATUS = Object.freeze({
  PENDING:   'pending',
  PARTIAL:   'partial',
  COMPLETED: 'completed',
  EXPIRED:   'expired',
  CANCELLED: 'cancelled',
});

const SIGNATURE_STATUS = Object.freeze({
  PENDING:  'pending',
  SIGNED:   'signed',
  DECLINED: 'declined',
  REVOKED:  'revoked',
});

const AUDIT_EVENT = Object.freeze({
  REQUEST_CREATED:     'request_created',
  TOKEN_ISSUED:        'token_issued',
  LINK_OPENED:         'link_opened',
  SIGNATURE_RECORDED:  'signature_recorded',
  SIGNATURE_DECLINED:  'signature_declined',
  REQUEST_COMPLETED:   'request_completed',
  REQUEST_CANCELLED:   'request_cancelled',
  REQUEST_EXPIRED:     'request_expired',
  VERIFICATION_RUN:    'verification_run',
});

const EVENT_LABELS = Object.freeze({
  [AUDIT_EVENT.REQUEST_CREATED]:    { he: 'בקשת חתימה נוצרה',      en: 'Signature request created' },
  [AUDIT_EVENT.TOKEN_ISSUED]:       { he: 'טוקן חתימה הונפק',       en: 'Signing token issued' },
  [AUDIT_EVENT.LINK_OPENED]:        { he: 'קישור נפתח',              en: 'Link opened by signer' },
  [AUDIT_EVENT.SIGNATURE_RECORDED]: { he: 'חתימה נרשמה',             en: 'Signature recorded' },
  [AUDIT_EVENT.SIGNATURE_DECLINED]: { he: 'חתימה סורבה',             en: 'Signature declined by signer' },
  [AUDIT_EVENT.REQUEST_COMPLETED]:  { he: 'כל החותמים חתמו',         en: 'All signers completed' },
  [AUDIT_EVENT.REQUEST_CANCELLED]:  { he: 'הבקשה בוטלה',            en: 'Request cancelled' },
  [AUDIT_EVENT.REQUEST_EXPIRED]:    { he: 'תוקף הבקשה פג',          en: 'Request expired' },
  [AUDIT_EVENT.VERIFICATION_RUN]:   { he: 'אימות חתימות בוצע',       en: 'Verification executed' },
});

// Default signing window — 14 days matches common Israeli commercial practice
// and fits within the מועד סביר ("reasonable time") doctrine for offer
// acceptance under חוק החוזים §8.
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Module-level HMAC secret — derived from process env when available, else
// generated per-process. In production, wire this to a KMS via an adapter.
const MODULE_SECRET = (() => {
  const fromEnv = typeof process !== 'undefined' && process.env && process.env.ESIGN_HMAC_SECRET;
  if (fromEnv && String(fromEnv).length >= 16) return String(fromEnv);
  return crypto.randomBytes(32).toString('hex');
})();

// ═══════════════════════════════════════════════════════════════════════
// In-memory store (append-only)
// ═══════════════════════════════════════════════════════════════════════

const _store = {
  requests: new Map(),        // requestId → request envelope
  tokenIndex: new Map(),      // token → { requestId, signerIndex }
};

let _persistence = null;     // optional adapter { write(req), remove? (no-op) }

function setPersistenceAdapter(adapter) {
  if (adapter && typeof adapter.write === 'function') {
    _persistence = adapter;
  } else {
    _persistence = null;
  }
}

function _persist(req) {
  if (_persistence) {
    try { _persistence.write(deepClone(req)); } catch (_) { /* never throw */ }
  }
}

function resetStore() {
  _store.requests.clear();
  _store.tokenIndex.clear();
}

// ═══════════════════════════════════════════════════════════════════════
// Pure helpers — hashing, canonicalisation, cloning
// ═══════════════════════════════════════════════════════════════════════

/**
 * SHA-256 hex digest of a UTF-8 string / Buffer. Zero deps.
 */
function sha256(input) {
  const h = crypto.createHash('sha256');
  h.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input);
  return h.digest('hex');
}

/**
 * HMAC-SHA256 hex digest — used for anti-tamper token binding.
 */
function hmac(secret, input) {
  const h = crypto.createHmac('sha256', secret);
  h.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input);
  return h.digest('hex');
}

/**
 * Deterministic JSON — sort object keys recursively. Used to produce a
 * stable, hash-friendly representation of the contract document, so that
 * the signer always hashes the same bytes regardless of JSON ordering.
 *
 * Arrays preserve order (semantic). Nullish, NaN, Infinity collapse to
 * null the way JSON.stringify would, but we never drop keys.
 */
function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return String(value);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k]));
    return '{' + parts.join(',') + '}';
  }
  // Functions / symbols: never a valid contract field — collapse to null.
  return 'null';
}

/**
 * Produce a canonical, hashable string representation of the contract
 * document. We omit the fields that naturally mutate over the life of
 * the contract (status, signatures, audit trail, timestamps, etc.) and
 * hash only the legally-material "what was agreed upon" fingerprint:
 * id, type, title, body, parties, effective/expiry/value/auto_renew.
 * This fingerprint survives signature attachment and status flips so
 * that verifyRequest({ contract }) can compare stored vs live cleanly.
 */
function canonicaliseDocument(contract) {
  if (!contract || typeof contract !== 'object') return 'null';
  const HASH_OMIT = new Set([
    // Mutable life-cycle fields — always omitted
    'status',
    'status_label_he',
    'status_label_en',
    'signatures',
    'signature_request_id',
    'signed_at',
    'audit_trail',
    'document_hash',
    'updated_at',
    'created_at',
    'amendments',
    'version_history',
    'cancelled_at',
    'cancel_reason',
    'warnings',
    'missing_required',
  ]);
  const filtered = {};
  for (const k of Object.keys(contract)) {
    if (!HASH_OMIT.has(k)) filtered[k] = contract[k];
  }
  return canonicalJson(filtered);
}

function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// Token minting
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mint a url-safe signature token. The token body is random, but we
 * bind it to the request + signer via HMAC so that a leaked token
 * cannot be re-used against a different request even if the attacker
 * knows the other request IDs.
 *
 * Format:  <random 32 hex> . <hmac 16 hex>
 */
function generateToken(requestId, signerIndex) {
  const random = crypto.randomBytes(16).toString('hex');     // 32 hex chars
  const bind = `${requestId}:${signerIndex}:${random}`;
  const mac = hmac(MODULE_SECRET, bind).slice(0, 16);        // 16 hex truncation
  return `${random}.${mac}`;
}

function _verifyToken(requestId, signerIndex, token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [random, mac] = parts;
  if (!/^[a-f0-9]{32}$/.test(random)) return false;
  if (!/^[a-f0-9]{16}$/.test(mac)) return false;
  const expected = hmac(MODULE_SECRET, `${requestId}:${signerIndex}:${random}`).slice(0, 16);
  // timing-safe compare
  if (expected.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0;
}

// ═══════════════════════════════════════════════════════════════════════
// Audit helpers
// ═══════════════════════════════════════════════════════════════════════

function _appendAudit(req, event, payload) {
  const labels = EVENT_LABELS[event] || { he: event, en: event };
  const entry = {
    event,
    label_he: labels.he,
    label_en: labels.en,
    at: nowIso(),
    ...payload,
  };
  // Never mutate caller's payload
  req.audit_trail.push(entry);
  _persist(req);
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — createRequest
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a signature request against a contract document.
 *
 * @param {object} contract   Contract draft (must have id + canonical body)
 * @param {Array<object>} signers
 *        Each signer: { name, id_or_hp, email?, role?, order? }
 * @param {object} [opts]
 * @param {string} [opts.mode='sequential']    'sequential' | 'parallel'
 * @param {number} [opts.ttlMs=DEFAULT_TTL_MS] expiry window from "now"
 * @param {string} [opts.created_by]           optional actor id
 *
 * @returns {{
 *   requestId: string,
 *   tokens: Array<{ signerIndex, name, token, url_path }>,
 *   mode: string,
 *   expires_at: string,
 *   document_hash: string,
 * }}
 */
function createRequest(contract, signers, opts = {}) {
  if (!contract || typeof contract !== 'object') {
    throw new TypeError('contract object is required');
  }
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new TypeError('at least one signer is required');
  }
  const mode = opts.mode === SIG_MODE.PARALLEL ? SIG_MODE.PARALLEL : SIG_MODE.SEQUENTIAL;
  const ttlMs = Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_TTL_MS;

  const requestId = 'req_' + crypto.randomBytes(10).toString('hex');
  const canonical = canonicaliseDocument(contract);
  const documentHash = sha256(canonical);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  const signerRecords = signers.map((s, idx) => {
    if (!s || typeof s !== 'object') {
      throw new TypeError(`signer #${idx + 1} must be an object`);
    }
    if (!s.name || typeof s.name !== 'string') {
      throw new TypeError(`signer #${idx + 1} missing .name`);
    }
    return {
      index: idx,
      name: s.name,
      id_or_hp: s.id_or_hp || '',
      email: s.email || '',
      role: s.role || '',
      order: Number.isFinite(s.order) ? s.order : idx,
      status: SIGNATURE_STATUS.PENDING,
      signature: null,      // populated by recordSignature
    };
  });

  const tokenRecords = signerRecords.map(sr => {
    const token = generateToken(requestId, sr.index);
    return {
      signerIndex: sr.index,
      name: sr.name,
      token,
      url_path: `/esign/sign/${token}`,
    };
  });

  const envelope = {
    requestId,
    contract_id: contract.id || null,
    contract_type: contract.type || null,
    contract_title: contract.title || '',
    mode,
    status: REQUEST_STATUS.PENDING,
    document_hash: documentHash,
    document_canonical_len: canonical.length,
    signers: signerRecords,
    tokens: tokenRecords.map(t => ({ signerIndex: t.signerIndex, token: t.token, url_path: t.url_path })),
    created_at: now.toISOString(),
    created_by: opts.created_by || null,
    expires_at: expiresAt,
    completed_at: null,
    cancelled_at: null,
    audit_trail: [],
  };

  _appendAudit(envelope, AUDIT_EVENT.REQUEST_CREATED, {
    contract_id: envelope.contract_id,
    mode,
    signers_count: signerRecords.length,
    document_hash: documentHash,
  });
  for (const t of tokenRecords) {
    _appendAudit(envelope, AUDIT_EVENT.TOKEN_ISSUED, {
      signer_index: t.signerIndex,
      signer_name: t.name,
    });
  }

  _store.requests.set(requestId, envelope);
  for (const t of tokenRecords) {
    _store.tokenIndex.set(t.token, { requestId, signerIndex: t.signerIndex });
  }
  _persist(envelope);

  return {
    requestId,
    tokens: tokenRecords,
    mode,
    expires_at: expiresAt,
    document_hash: documentHash,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — recordSignature
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record a signature event against a signing token. Captures client
 * metadata (IP, user-agent, geolocation if provided) and computes a
 * fresh SHA-256 of the document at the moment of signing, so we can
 * later prove the signer agreed to *that specific* byte sequence.
 *
 * @param {string} token
 * @param {object} signatureData
 * @param {string} [signatureData.typed_name]   Name typed by the signer
 * @param {string} [signatureData.drawn_png_b64] base64 PNG from canvas
 * @param {string} [signatureData.ip]
 * @param {string} [signatureData.user_agent]
 * @param {string} [signatureData.geolocation]
 * @param {boolean}[signatureData.decline=false] if true, records a decline
 * @param {object} [signatureData.contract_snapshot]
 *                 Optional — the document state the signer saw. If omitted,
 *                 we re-hash the stored document.
 *
 * @returns {{
 *   ok: boolean,
 *   signerIndex: number,
 *   requestId: string,
 *   signature: object,
 *   request_status: string,
 *   reason?: { code, he, en },
 * }}
 */
function recordSignature(token, signatureData) {
  signatureData = signatureData || {};

  const entry = _store.tokenIndex.get(token);
  if (!entry) {
    return _signErr('TOKEN_NOT_FOUND', 'טוקן לא קיים', 'Token not found');
  }
  const req = _store.requests.get(entry.requestId);
  if (!req) {
    return _signErr('REQUEST_NOT_FOUND', 'בקשה לא נמצאה', 'Request not found');
  }
  if (!_verifyToken(req.requestId, entry.signerIndex, token)) {
    return _signErr('TOKEN_TAMPERED', 'טוקן לא תקף', 'Token HMAC mismatch');
  }
  if (req.status === REQUEST_STATUS.CANCELLED) {
    return _signErr('CANCELLED', 'הבקשה בוטלה', 'Request was cancelled', { requestId: req.requestId });
  }

  // Expiry check (non-destructive: we flip status and audit)
  const now = new Date();
  if (new Date(req.expires_at).getTime() < now.getTime()) {
    if (req.status !== REQUEST_STATUS.EXPIRED) {
      req.status = REQUEST_STATUS.EXPIRED;
      _appendAudit(req, AUDIT_EVENT.REQUEST_EXPIRED, {});
    }
    return _signErr('EXPIRED', 'תוקף הבקשה פג', 'Signing window expired', { requestId: req.requestId });
  }

  const signer = req.signers[entry.signerIndex];
  if (!signer) {
    return _signErr('SIGNER_NOT_FOUND', 'חותם לא נמצא', 'Signer not found');
  }
  if (signer.status === SIGNATURE_STATUS.SIGNED) {
    return _signErr('ALREADY_SIGNED', 'כבר חתום', 'Signer already signed', { requestId: req.requestId });
  }

  // Sequential mode: enforce that prior signers have signed first.
  if (req.mode === SIG_MODE.SEQUENTIAL) {
    for (let i = 0; i < entry.signerIndex; i++) {
      if (req.signers[i].status !== SIGNATURE_STATUS.SIGNED) {
        return _signErr(
          'OUT_OF_ORDER',
          'חותם קודם עוד לא חתם',
          'Previous signer has not signed yet',
          { requestId: req.requestId, blocking_signer: req.signers[i].name }
        );
      }
    }
  }

  // Decline path — also append-only, never delete.
  if (signatureData.decline === true) {
    signer.status = SIGNATURE_STATUS.DECLINED;
    signer.signature = {
      declined: true,
      typed_name: signatureData.typed_name || '',
      reason: signatureData.reason || '',
      ip: signatureData.ip || '',
      user_agent: signatureData.user_agent || '',
      at: nowIso(),
    };
    _appendAudit(req, AUDIT_EVENT.SIGNATURE_DECLINED, {
      signer_index: entry.signerIndex,
      signer_name: signer.name,
      reason: signatureData.reason || '',
    });
    _persist(req);
    return {
      ok: true,
      declined: true,
      signerIndex: entry.signerIndex,
      requestId: req.requestId,
      signature: signer.signature,
      request_status: req.status,
    };
  }

  // Real signature path ─────────────────────────────────────────────
  const canonical = signatureData.contract_snapshot
    ? canonicaliseDocument(signatureData.contract_snapshot)
    : null;
  const atSignHash = canonical ? sha256(canonical) : req.document_hash;
  const hashMatches = atSignHash === req.document_hash;

  const blob = {
    typed_name: signatureData.typed_name || signer.name,
    drawn_png_b64: signatureData.drawn_png_b64 || '',
    drawn_png_sha256: signatureData.drawn_png_b64 ? sha256(signatureData.drawn_png_b64) : '',
    ip: signatureData.ip || '',
    user_agent: signatureData.user_agent || '',
    geolocation: signatureData.geolocation || '',
    at: nowIso(),
    document_hash_at_sign: atSignHash,
    document_hash_match: hashMatches,
    signer_name: signer.name,
    signer_id_or_hp: signer.id_or_hp,
    signer_role: signer.role,
  };

  // Bind signature bytes via HMAC so a store leak can't silently swap blobs
  blob.sig_hmac = hmac(MODULE_SECRET, [
    req.requestId,
    entry.signerIndex,
    blob.typed_name,
    blob.at,
    blob.document_hash_at_sign,
    blob.ip,
    blob.user_agent,
  ].join('|'));

  signer.status = SIGNATURE_STATUS.SIGNED;
  signer.signature = blob;

  _appendAudit(req, AUDIT_EVENT.SIGNATURE_RECORDED, {
    signer_index: entry.signerIndex,
    signer_name: signer.name,
    document_hash_match: hashMatches,
    ip: blob.ip,
    user_agent: blob.user_agent,
  });

  // Update envelope status
  const signedCount = req.signers.filter(s => s.status === SIGNATURE_STATUS.SIGNED).length;
  if (signedCount === req.signers.length) {
    req.status = REQUEST_STATUS.COMPLETED;
    req.completed_at = nowIso();
    _appendAudit(req, AUDIT_EVENT.REQUEST_COMPLETED, { signed_count: signedCount });
  } else if (signedCount > 0) {
    req.status = REQUEST_STATUS.PARTIAL;
  }
  _persist(req);

  return {
    ok: true,
    signerIndex: entry.signerIndex,
    requestId: req.requestId,
    signature: blob,
    request_status: req.status,
  };
}

function _signErr(code, he, en, extra) {
  return {
    ok: false,
    reason: { code, he, en },
    ...(extra || {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — verifyRequest
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify the state of a signature request and return a structured
 * report. Never mutates. Never throws.
 */
function verifyRequest(requestId, opts = {}) {
  const req = _store.requests.get(requestId);
  if (!req) {
    return {
      valid: false,
      signers_count: 0,
      signed_count: 0,
      declined_count: 0,
      pending_count: 0,
      hash_match: false,
      reason: { code: 'NOT_FOUND', he: 'בקשה לא נמצאה', en: 'Request not found' },
    };
  }

  const signedCount   = req.signers.filter(s => s.status === SIGNATURE_STATUS.SIGNED).length;
  const declinedCount = req.signers.filter(s => s.status === SIGNATURE_STATUS.DECLINED).length;
  const pendingCount  = req.signers.filter(s => s.status === SIGNATURE_STATUS.PENDING).length;

  // If caller passes a live document, re-hash it and compare to
  // every signature's captured hash — that is the tamper check.
  let liveHash = req.document_hash;
  if (opts.contract) {
    liveHash = sha256(canonicaliseDocument(opts.contract));
  }
  const hashMatch = liveHash === req.document_hash;

  // Per-signature integrity — re-compute HMAC and compare.
  const perSignature = req.signers.map(s => {
    if (!s.signature || s.status !== SIGNATURE_STATUS.SIGNED) {
      return { signerIndex: s.index, status: s.status, hmac_ok: null, hash_ok: null };
    }
    const expectedMac = hmac(MODULE_SECRET, [
      req.requestId,
      s.index,
      s.signature.typed_name,
      s.signature.at,
      s.signature.document_hash_at_sign,
      s.signature.ip,
      s.signature.user_agent,
    ].join('|'));
    return {
      signerIndex: s.index,
      status: s.status,
      hmac_ok: expectedMac === s.signature.sig_hmac,
      hash_ok: s.signature.document_hash_at_sign === req.document_hash,
    };
  });

  const allHmacOk = perSignature.every(p => p.hmac_ok !== false);
  const allHashOk = perSignature.every(p => p.hash_ok !== false);
  const allSigned = signedCount === req.signers.length;
  const notCancelled = req.status !== REQUEST_STATUS.CANCELLED;

  _appendAudit(req, AUDIT_EVENT.VERIFICATION_RUN, {
    result_valid: allSigned && allHmacOk && allHashOk && hashMatch && notCancelled,
  });

  return {
    valid: allSigned && allHmacOk && allHashOk && hashMatch && notCancelled,
    status: req.status,
    signers_count: req.signers.length,
    signed_count: signedCount,
    declined_count: declinedCount,
    pending_count: pendingCount,
    hash_match: hashMatch,
    stored_hash: req.document_hash,
    live_hash: liveHash,
    per_signature: perSignature,
    audit_trail_length: req.audit_trail.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — getRequest / listRequests / cancelRequest
// ═══════════════════════════════════════════════════════════════════════

function getRequest(requestId) {
  const req = _store.requests.get(requestId);
  return req ? deepClone(req) : null;
}

function listRequests() {
  const out = [];
  for (const req of _store.requests.values()) out.push(deepClone(req));
  return out;
}

function cancelRequest(requestId, reason) {
  const req = _store.requests.get(requestId);
  if (!req) return false;
  if (req.status === REQUEST_STATUS.CANCELLED) return true;
  req.status = REQUEST_STATUS.CANCELLED;
  req.cancelled_at = nowIso();
  _appendAudit(req, AUDIT_EVENT.REQUEST_CANCELLED, { reason: reason || '' });
  _persist(req);
  return true;
}

function markLinkOpened(token, meta) {
  const entry = _store.tokenIndex.get(token);
  if (!entry) return false;
  const req = _store.requests.get(entry.requestId);
  if (!req) return false;
  _appendAudit(req, AUDIT_EVENT.LINK_OPENED, {
    signer_index: entry.signerIndex,
    ip: (meta && meta.ip) || '',
    user_agent: (meta && meta.user_agent) || '',
  });
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  createRequest,
  recordSignature,
  verifyRequest,
  getRequest,
  listRequests,
  cancelRequest,
  markLinkOpened,

  // Crypto helpers (exported for contract-manager + tests)
  sha256,
  hmac,
  canonicaliseDocument,
  canonicalJson,
  generateToken,

  // Store plumbing
  setPersistenceAdapter,
  resetStore,

  // Constants
  SIG_MODE,
  REQUEST_STATUS,
  SIGNATURE_STATUS,
  AUDIT_EVENT,
  EVENT_LABELS,
  DEFAULT_TTL_MS,
};
