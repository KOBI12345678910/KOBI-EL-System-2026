/* ============================================================================
 * Techno-Kol ERP — Bank Signatory & Authorization Workflow
 * Agent Y-081 / Swarm Finance / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * זרימת עבודה של חותמים מורשים ואישור העברות בנקאיות
 *
 * Purpose:
 *   Model the *intent* and *approval chain* for outgoing bank transactions
 *   (wire / check / electronic / paylink). Enforces segregation of duties
 *   (SoD), dual-control where required, an amount-tiered signatory matrix
 *   (e.g. 1 signer up to 50k, 2 signers including Finance Manager up to
 *   500k, 2 signers + CFO above that), integrity-hashed signatures, a
 *   full append-only audit trail, timeout handling and a basic
 *   OFAC/sanctions/AML compliance gate.
 *
 * DISCLAIMER — IMPORTANT / הצהרה חשובה:
 *   This module STORES the approval intent and signatures ONLY. It NEVER
 *   reaches out to a bank, never initiates a SWIFT/MT103/FedWire/MASAV
 *   message, never dials a payment rail, never pulls funds. After a
 *   request is fully signed and verified, a HUMAN operator must take the
 *   authorized request and physically execute it through the bank's own
 *   channel (branch, online banking, corporate portal, wet signature on
 *   paper wire form, etc.).
 *
 *   המודול הזה שומר את הכוונה לאישור ואת החתימות בלבד. אין בו ביצוע בפועל
 *   מול הבנק. בן אדם מורשה חייב להעביר את הבקשה החתומה ולבצע אותה בערוץ
 *   הבנקאי (סניף, בנקאות מקוונת, מסוף ארגוני, מסב / מס"ב, או טופס נייר).
 *
 * Features implemented:
 *   1.  defineSignatoryMatrix — per-account tiered approval rules
 *   2.  requestAuthorization  — open a new signing workflow
 *   3.  routeForApproval      — pick the tier + required signer roles
 *   4.  signRequest           — record a signature with integrity hash
 *   5.  verifySignatures      — check we have all required signers
 *   6.  segregationOfDuties   — initiator cannot also approve
 *   7.  dualControl           — enforce 2-person-present on certain ops
 *   8.  auditTrail            — full who/when/what history
 *   9.  expiredRequests       — 48h (configurable) timeout handler
 *  10.  complianceCheck       — OFAC/sanctions + AML threshold screen
 *  11.  notifyApprovers       — bilingual (he/en) notifications
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Superseding a matrix version pushes the
 *     previous rules onto a history stack. Expired requests are marked
 *     expired but kept forever. Audit trail is append-only.
 *   - Zero external dependencies (pure Node built-ins + crypto).
 *   - Bilingual Hebrew/English on every user-facing field.
 *   - Currencies: ILS default, USD/EUR/GBP accepted.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Static catalogs
 * -------------------------------------------------------------------------- */

/** Transaction channel types supported by this intent store. */
const TRANSACTION_TYPES = Object.freeze({
  wire:       { id: 'wire',       he: 'העברה בנקאית (וייר)',    en: 'Wire transfer' },
  check:      { id: 'check',      he: "צ'ק",                    en: 'Check' },
  electronic: { id: 'electronic', he: 'העברה אלקטרונית / מס"ב', en: 'Electronic / ACH' },
  paylink:    { id: 'paylink',    he: 'קישור תשלום',             en: 'Pay link' },
});

/** Roles recognized by the signatory matrix. */
const SIGNER_ROLES = Object.freeze({
  clerk:            { id: 'clerk',            he: 'פקיד כספים',         en: 'Finance clerk' },
  accountant:       { id: 'accountant',       he: 'רואה חשבון',         en: 'Accountant' },
  finance_manager:  { id: 'finance_manager',  he: 'מנהל כספים',         en: 'Finance manager' },
  controller:       { id: 'controller',       he: 'חשב',                en: 'Controller' },
  cfo:              { id: 'cfo',              he: 'סמנכ"ל כספים',        en: 'CFO' },
  ceo:              { id: 'ceo',              he: 'מנכ"ל',              en: 'CEO' },
  board_member:     { id: 'board_member',     he: 'חבר דירקטוריון',     en: 'Board member' },
});

/** Signature acquisition methods. */
const SIGNATURE_METHODS = Object.freeze({
  digital:        { id: 'digital',        he: 'חתימה דיגיטלית',       en: 'Digital signature' },
  '2fa':          { id: '2fa',            he: 'אימות דו-שלבי',         en: 'Two-factor authentication' },
  'hardware-token': { id: 'hardware-token', he: 'טוקן חומרה',         en: 'Hardware token' },
  physical:       { id: 'physical',       he: 'חתימה פיזית (נייר)',    en: 'Physical (wet-ink) signature' },
});

/** Request lifecycle states. */
const REQUEST_STATUS = Object.freeze({
  draft:            'draft',
  pending:          'pending',
  partially_signed: 'partially_signed',
  approved:         'approved',
  rejected:         'rejected',
  expired:          'expired',
  compliance_hold:  'compliance_hold',
  executed_offline: 'executed_offline',
});

/** Default "kobi" matrix used when an account has no explicit override. */
const DEFAULT_MATRIX_RULES = Object.freeze([
  {
    amountRange: { min: 0, max: 50_000 },
    signersRequired: 1,
    signerRoles: ['finance_manager', 'controller', 'accountant'],
    timeWindow: { hours: 48 },
  },
  {
    amountRange: { min: 50_000, max: 500_000 },
    signersRequired: 2,
    signerRoles: ['finance_manager', 'controller', 'cfo'],
    mustInclude: ['finance_manager'],
    timeWindow: { hours: 48 },
  },
  {
    amountRange: { min: 500_000, max: Number.POSITIVE_INFINITY },
    signersRequired: 2,
    signerRoles: ['cfo', 'ceo', 'board_member', 'finance_manager'],
    mustInclude: ['cfo'],
    dualControl: true,
    timeWindow: { hours: 24 },
  },
]);

/** AML / high-risk triggers (these do not block — they raise the gate). */
const AML_THRESHOLD_ILS = 50_000;
const HIGH_VALUE_GATE_ILS = 500_000;

/** Demo OFAC/sanctions seed — real impl would pull the live OFAC list. */
const OFAC_BLOCKLIST = Object.freeze([
  { term: 'OFAC-BLOCKED-DEMO',        reason: 'Demo OFAC blocked entity' },
  { term: 'SDN-SAMPLE',               reason: 'SDN list (demo)' },
  { term: 'HAMAS',                    reason: 'Israeli & UN sanctions (demo)' },
  { term: 'HEZBOLLAH',                reason: 'Israeli & UN sanctions (demo)' },
  { term: 'ISIS',                     reason: 'UN sanctions (demo)' },
  { term: 'ISIL',                     reason: 'UN sanctions (demo)' },
  { term: 'AL-QAEDA',                 reason: 'UN sanctions (demo)' },
]);

const DISCLAIMER_HE =
  'מודול זה שומר את הכוונה לאישור ואת החתימות בלבד. אין בו ביצוע בפועל מול ' +
  'הבנק. לאחר אישור מלא על מורשה חתימה להעביר פיזית את הבקשה דרך ערוץ הבנק.';

const DISCLAIMER_EN =
  'This module stores approval intent and signatures only. It never ' +
  'contacts a bank. Once fully signed, a human authorized signatory must ' +
  "physically execute the request through the bank's own channel.";

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (no deps beyond node:crypto)
 * -------------------------------------------------------------------------- */

function _now()      { return new Date().toISOString(); }
function _nowTs()    { return Date.now(); }
/** Structured-clone-ish deep copy that preserves Infinity/-Infinity. */
function _clone(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(_clone);
  const out = {};
  for (const k of Object.keys(x)) out[k] = _clone(x[k]);
  return out;
}

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertNum(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new TypeError('invalid ' + name + ': must be non-negative finite number');
  }
}

function _assertObj(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new TypeError('invalid ' + name + ': must be object');
  }
}

function _genId(prefix) {
  // 12 hex chars is enough for demo; deterministic unique enough for a swarm
  return prefix + '-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

/** Canonical JSON — recursively key-sorted, stable across runs. */
function _canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(_canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) =>
    JSON.stringify(k) + ':' + _canonicalJson(value[k])
  );
  return '{' + parts.join(',') + '}';
}

/** SHA-256 integrity hash of the request snapshot at signing time. */
function _integrityHash(payload) {
  const canon = _canonicalJson(payload);
  return crypto.createHash('sha256').update(canon, 'utf8').digest('hex');
}

function _matchesRange(amount, range) {
  return amount >= range.min && amount < range.max;
}

function _uniq(arr) { return Array.from(new Set(arr)); }

/* ----------------------------------------------------------------------------
 * 2. SignatoryWorkflow — the main class
 * -------------------------------------------------------------------------- */

class SignatoryWorkflow {
  constructor(opts) {
    opts = opts || {};
    /** accountId -> { rules, version, createdAt, history[] } */
    this.matrices = new Map();

    /** requestId -> request record */
    this.requests = new Map();

    /** append-only event log; never spliced */
    this.auditLog = [];

    /** notifications queue; bilingual, consumed by any channel adapter */
    this.notificationQueue = [];

    /** wall-clock source (overridable for deterministic tests) */
    this._clock = typeof opts.clock === 'function' ? opts.clock : _nowTs;

    /** default timeout for requests in hours */
    this.defaultTimeoutHours =
      typeof opts.defaultTimeoutHours === 'number' && opts.defaultTimeoutHours > 0
        ? opts.defaultTimeoutHours
        : 48;

    /** pluggable OFAC list */
    this.sanctionsList = Array.isArray(opts.sanctionsList)
      ? opts.sanctionsList.map((x) => ({ ...x }))
      : OFAC_BLOCKLIST.map((x) => ({ ...x }));

    /** pluggable AML / high-value thresholds in ILS-equivalent */
    this.amlThresholdILS       = opts.amlThresholdILS       || AML_THRESHOLD_ILS;
    this.highValueGateILS      = opts.highValueGateILS      || HIGH_VALUE_GATE_ILS;

    this.disclaimer = {
      he: DISCLAIMER_HE,
      en: DISCLAIMER_EN,
    };
  }

  /* --------------------------------------------------------------------
   * 2.1  defineSignatoryMatrix
   * ------------------------------------------------------------------ */
  defineSignatoryMatrix({ accountId, rules }) {
    _assertStr(accountId, 'accountId');
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new TypeError('invalid rules: must be non-empty array');
    }

    // Validate each rule
    const normalized = rules.map((r, i) => {
      _assertObj(r, 'rule[' + i + ']');
      if (!r.amountRange || typeof r.amountRange !== 'object') {
        throw new TypeError('rule[' + i + '].amountRange required');
      }
      const min = Number(r.amountRange.min);
      const max =
        r.amountRange.max === null || r.amountRange.max === undefined
          ? Number.POSITIVE_INFINITY
          : Number(r.amountRange.max);
      if (!Number.isFinite(min) || min < 0) {
        throw new TypeError('rule[' + i + '].amountRange.min invalid');
      }
      if (!(max > min)) {
        throw new TypeError('rule[' + i + '].amountRange.max must be > min');
      }
      if (typeof r.signersRequired !== 'number' || r.signersRequired < 1) {
        throw new TypeError('rule[' + i + '].signersRequired must be >= 1');
      }
      if (!Array.isArray(r.signerRoles) || r.signerRoles.length === 0) {
        throw new TypeError('rule[' + i + '].signerRoles required');
      }
      for (const role of r.signerRoles) {
        if (!SIGNER_ROLES[role]) {
          throw new TypeError('rule[' + i + '].signerRoles — unknown role: ' + role);
        }
      }
      if (r.signersRequired > r.signerRoles.length) {
        throw new TypeError(
          'rule[' + i + ']: signersRequired > unique roles available'
        );
      }
      return {
        amountRange:     { min, max },
        signersRequired: r.signersRequired,
        signerRoles:     r.signerRoles.slice(),
        mustInclude:     Array.isArray(r.mustInclude) ? r.mustInclude.slice() : [],
        dualControl:     !!r.dualControl,
        timeWindow: {
          hours:
            r.timeWindow && typeof r.timeWindow.hours === 'number'
              ? r.timeWindow.hours
              : this.defaultTimeoutHours,
        },
      };
    });

    // Sort by ascending min so routing can pick the first match deterministically
    normalized.sort((a, b) => a.amountRange.min - b.amountRange.min);

    const prev = this.matrices.get(accountId);
    const version = prev ? prev.version + 1 : 1;

    const matrix = {
      accountId,
      version,
      rules: normalized,
      createdAt: _now(),
      history: prev ? (prev.history || []).concat([_clone(prev)]) : [],
    };

    this.matrices.set(accountId, matrix);
    this._audit({
      action: 'matrix.defined',
      accountId,
      version,
      ruleCount: normalized.length,
    });

    return _clone(matrix);
  }

  /** Internal: fetch live matrix for account, falling back to defaults. */
  _getMatrix(accountId) {
    if (accountId && this.matrices.has(accountId)) {
      return this.matrices.get(accountId);
    }
    return {
      accountId: accountId || '__default__',
      version: 0,
      rules: DEFAULT_MATRIX_RULES.map((r) => ({
        ..._clone(r),
        mustInclude: r.mustInclude ? r.mustInclude.slice() : [],
        dualControl: !!r.dualControl,
      })),
      createdAt: _now(),
      history: [],
    };
  }

  /* --------------------------------------------------------------------
   * 2.2  requestAuthorization
   * ------------------------------------------------------------------ */
  requestAuthorization(payload, initiator) {
    _assertObj(payload, 'payload');
    _assertObj(initiator, 'initiator');
    _assertStr(initiator.id,   'initiator.id');
    _assertStr(initiator.name, 'initiator.name');
    _assertStr(initiator.role, 'initiator.role');

    const {
      transactionType,
      amount,
      currency,
      beneficiary,
      purpose,
      supporting,
      accountId,
    } = payload;

    if (!TRANSACTION_TYPES[transactionType]) {
      throw new TypeError(
        'invalid transactionType: ' +
          transactionType +
          ' (expected wire|check|electronic|paylink)'
      );
    }
    _assertNum(amount, 'amount');
    if (amount === 0) throw new TypeError('amount must be > 0');

    const cur = (currency || 'ILS').toUpperCase();
    _assertObj(beneficiary, 'beneficiary');
    _assertStr(beneficiary.name, 'beneficiary.name');

    const id = _genId('SIG-REQ');
    const createdAt = _now();
    const createdAtTs = this._clock();

    const req = {
      id,
      status: REQUEST_STATUS.draft,
      transactionType,
      transactionTypeLabel_he: TRANSACTION_TYPES[transactionType].he,
      transactionTypeLabel_en: TRANSACTION_TYPES[transactionType].en,
      amount,
      currency: cur,
      beneficiary: {
        name: beneficiary.name,
        account: beneficiary.account || null,
        bank:    beneficiary.bank    || null,
        iban:    beneficiary.iban    || null,
        country: beneficiary.country || null,
      },
      purpose:    purpose || '',
      supporting: Array.isArray(supporting) ? supporting.slice() : [],
      accountId:  accountId || null,
      initiator: {
        id:   initiator.id,
        name: initiator.name,
        role: initiator.role,
      },
      createdAt,
      createdAtTs,
      expiresAtTs:       null,
      signatures:        [],
      rejections:        [],
      routing:           null,
      compliance:        null,
      dualControlRequired: false,
      integrityHashes:   [],
      disclaimer: {
        he: this.disclaimer.he,
        en: this.disclaimer.en,
      },
    };

    this.requests.set(id, req);
    this._audit({
      action: 'request.created',
      requestId: id,
      initiator: initiator.id,
      amount,
      currency: cur,
      transactionType,
    });

    // Compliance gate runs immediately so callers see OFAC hits even on draft
    const compliance = this.complianceCheck(req);
    req.compliance = compliance;
    if (compliance.status === 'blocked') {
      req.status = REQUEST_STATUS.compliance_hold;
      this._audit({
        action: 'request.compliance_hold',
        requestId: id,
        hits: compliance.hits,
      });
      return _clone(req);
    }

    // Routing: find the tier
    const routing = this.routeForApproval(id);

    // Timeout window
    const timeoutHours = routing.timeWindow.hours || this.defaultTimeoutHours;
    req.expiresAtTs = createdAtTs + timeoutHours * 3600 * 1000;
    req.status = REQUEST_STATUS.pending;

    this._audit({
      action: 'request.routed',
      requestId: id,
      tier: routing.tierIndex,
      signersRequired: routing.signersRequired,
      timeoutHours,
    });

    return _clone(req);
  }

  /* --------------------------------------------------------------------
   * 2.3  routeForApproval
   * ------------------------------------------------------------------ */
  routeForApproval(requestId) {
    const req = this._getRequest(requestId);
    const matrix = this._getMatrix(req.accountId);

    // Convert to ILS-equivalent for threshold comparison (very crude FX)
    const amountILS = this._toILSEquivalent(req.amount, req.currency);

    let tierIndex = -1;
    let rule = null;
    for (let i = 0; i < matrix.rules.length; i++) {
      if (_matchesRange(amountILS, matrix.rules[i].amountRange)) {
        tierIndex = i;
        rule = matrix.rules[i];
        break;
      }
    }

    if (!rule) {
      // Fallback to the topmost rule (amount beyond explicit ranges)
      tierIndex = matrix.rules.length - 1;
      rule = matrix.rules[tierIndex];
    }

    const routing = {
      tierIndex,
      matrixVersion:   matrix.version,
      signersRequired: rule.signersRequired,
      signerRoles:     rule.signerRoles.slice(),
      mustInclude:     (rule.mustInclude || []).slice(),
      dualControl:     !!rule.dualControl,
      timeWindow:      { ...rule.timeWindow },
      amountILS,
      label_he:
        'דרושים ' + rule.signersRequired + ' חותמים (' +
        rule.signerRoles.map((r) => SIGNER_ROLES[r].he).join(' / ') + ')',
      label_en:
        rule.signersRequired + ' signer(s) required (' +
        rule.signerRoles.map((r) => SIGNER_ROLES[r].en).join(' / ') + ')',
    };

    req.routing = routing;
    req.dualControlRequired = routing.dualControl;
    return _clone(routing);
  }

  /* --------------------------------------------------------------------
   * 2.4  signRequest
   * ------------------------------------------------------------------ */
  signRequest(requestId, signer, method) {
    const req = this._getRequest(requestId);
    _assertObj(signer, 'signer');
    _assertStr(signer.id,   'signer.id');
    _assertStr(signer.name, 'signer.name');
    _assertStr(signer.role, 'signer.role');
    if (!SIGNER_ROLES[signer.role]) {
      throw new TypeError('unknown signer.role: ' + signer.role);
    }
    if (!SIGNATURE_METHODS[method]) {
      throw new TypeError(
        'invalid method: ' + method +
        ' (expected digital|2fa|hardware-token|physical)'
      );
    }

    // Expire on access if past deadline
    if (
      req.expiresAtTs &&
      this._clock() > req.expiresAtTs &&
      req.status !== REQUEST_STATUS.approved &&
      req.status !== REQUEST_STATUS.rejected &&
      req.status !== REQUEST_STATUS.executed_offline
    ) {
      req.status = REQUEST_STATUS.expired;
      this._audit({ action: 'request.expired_on_sign', requestId, signer: signer.id });
      throw new Error('request expired: ' + requestId);
    }

    if (
      req.status === REQUEST_STATUS.rejected ||
      req.status === REQUEST_STATUS.expired ||
      req.status === REQUEST_STATUS.executed_offline
    ) {
      throw new Error(
        'cannot sign: request in terminal state ' + req.status
      );
    }

    if (req.status === REQUEST_STATUS.compliance_hold) {
      throw new Error('cannot sign: request on compliance hold');
    }

    // SoD enforcement
    const sod = this.segregationOfDuties({
      ...req,
      candidateSigner: signer,
    });
    if (!sod.ok) {
      this._audit({
        action: 'request.sod_violation',
        requestId,
        reason: sod.reason,
        signer: signer.id,
      });
      throw new Error('SoD violation: ' + sod.reason);
    }

    // No duplicate signer on same request
    if (req.signatures.some((s) => s.signerId === signer.id)) {
      throw new Error('signer already signed: ' + signer.id);
    }

    // Role must be on the routing's list
    if (!req.routing) this.routeForApproval(requestId);
    if (!req.routing.signerRoles.includes(signer.role)) {
      throw new Error(
        'signer role ' + signer.role + ' not permitted by tier ' +
        req.routing.tierIndex
      );
    }

    // Integrity hash bound to current snapshot — compute ts ONCE so we
    // can replay it later with the same canonical input.
    const signedAt = _now();
    const snapshot = {
      requestId: req.id,
      amount:    req.amount,
      currency:  req.currency,
      beneficiary: req.beneficiary,
      purpose:   req.purpose,
      transactionType: req.transactionType,
      priorSignatures: req.signatures.map((s) => s.integrityHash),
      signerId:  signer.id,
      method,
      ts:        signedAt,
    };
    const integrityHash = _integrityHash(snapshot);

    const sig = {
      signerId:   signer.id,
      signerName: signer.name,
      role:       signer.role,
      roleLabel_he: SIGNER_ROLES[signer.role].he,
      roleLabel_en: SIGNER_ROLES[signer.role].en,
      method,
      methodLabel_he: SIGNATURE_METHODS[method].he,
      methodLabel_en: SIGNATURE_METHODS[method].en,
      signedAt,
      signedAtTs: this._clock(),
      integrityHash,
    };
    req.signatures.push(sig);
    req.integrityHashes.push(integrityHash);

    this._audit({
      action:    'request.signed',
      requestId,
      signer:    signer.id,
      role:      signer.role,
      method,
      integrityHash,
    });

    // Update status
    const verify = this.verifySignatures(requestId);
    if (verify.complete) {
      req.status = REQUEST_STATUS.approved;
      this._audit({
        action:    'request.approved',
        requestId,
        signerCount: req.signatures.length,
      });
    } else {
      req.status = REQUEST_STATUS.partially_signed;
    }

    return _clone(req);
  }

  /* --------------------------------------------------------------------
   * 2.5  verifySignatures
   * ------------------------------------------------------------------ */
  verifySignatures(requestId) {
    const req = this._getRequest(requestId);
    if (!req.routing) this.routeForApproval(requestId);
    const routing = req.routing;

    const presentRoles = _uniq(req.signatures.map((s) => s.role));
    const presentIds   = _uniq(req.signatures.map((s) => s.signerId));
    const missingMustInclude = (routing.mustInclude || []).filter(
      (r) => !presentRoles.includes(r)
    );
    const haveEnough = presentIds.length >= routing.signersRequired;

    // All hashes must replay cleanly
    const hashIntegrity = this._replayHashes(req);

    const complete =
      haveEnough &&
      missingMustInclude.length === 0 &&
      hashIntegrity.ok;

    // Two-person-present requirement
    const dualControlSatisfied = routing.dualControl
      ? this._checkDualControl(req)
      : { ok: true };

    return {
      requestId,
      complete: complete && dualControlSatisfied.ok,
      haveEnough,
      presentSignerCount: presentIds.length,
      signersRequired:    routing.signersRequired,
      presentRoles,
      missingMustInclude,
      dualControlRequired: routing.dualControl,
      dualControlSatisfied: dualControlSatisfied.ok,
      dualControlReason:   dualControlSatisfied.reason || null,
      integrityOk: hashIntegrity.ok,
      integrityDetail: hashIntegrity.detail,
    };
  }

  _replayHashes(req) {
    // Each stored integrity hash was computed from the snapshot at that
    // point — we replay and confirm they still match the stored values.
    // Any tamper on req.signatures[i] will flip ok=false.
    let ok = true;
    const detail = [];
    for (let i = 0; i < req.signatures.length; i++) {
      const s = req.signatures[i];
      const priorHashes = req.signatures
        .slice(0, i)
        .map((x) => x.integrityHash);
      const snap = {
        requestId: req.id,
        amount:    req.amount,
        currency:  req.currency,
        beneficiary: req.beneficiary,
        purpose:   req.purpose,
        transactionType: req.transactionType,
        priorSignatures: priorHashes,
        signerId:  s.signerId,
        method:    s.method,
        ts:        s.signedAt,
      };
      const expected = _integrityHash(snap);
      const match = expected === s.integrityHash;
      detail.push({ signerId: s.signerId, match });
      if (!match) ok = false;
    }
    return { ok, detail };
  }

  _checkDualControl(req) {
    // For dual control we require at least 2 distinct signer IDs to have
    // recorded a signature within a short window of each other (15 min),
    // OR both to use method='physical' (implying in-person).
    if (req.signatures.length < 2) {
      return { ok: false, reason: 'dual_control_needs_two' };
    }
    // Pick the newest two
    const sorted = req.signatures.slice().sort((a, b) => a.signedAtTs - b.signedAtTs);
    const [a, b] = sorted.slice(-2);
    const closeInTime = Math.abs(b.signedAtTs - a.signedAtTs) <= 15 * 60 * 1000;
    const bothPhysical = a.method === 'physical' && b.method === 'physical';
    if (closeInTime || bothPhysical) return { ok: true };
    return { ok: false, reason: 'dual_control_not_colocated' };
  }

  /* --------------------------------------------------------------------
   * 2.6  segregationOfDuties
   * ------------------------------------------------------------------ */
  segregationOfDuties(request) {
    _assertObj(request, 'request');
    const initiator = request.initiator || {};
    const candidate = request.candidateSigner || request.signer || null;

    // Case A — called pre-signature with a candidate
    if (candidate) {
      if (candidate.id === initiator.id) {
        return {
          ok: false,
          reason: 'initiator_cannot_approve',
          reason_he: 'יוזם הבקשה לא יכול לאשר אותה בעצמו',
          reason_en: 'The initiator cannot approve their own request',
        };
      }
      return { ok: true };
    }

    // Case B — audit an already-populated request
    const sigs = Array.isArray(request.signatures) ? request.signatures : [];
    for (const s of sigs) {
      if (s.signerId === initiator.id) {
        return {
          ok: false,
          reason: 'initiator_is_in_signers',
          reason_he: 'יוזם הבקשה מופיע בין החותמים — פגיעה בהפרדת תפקידים',
          reason_en: 'Initiator appears in signer list — SoD violation',
          offender: s.signerId,
        };
      }
    }
    return { ok: true };
  }

  /* --------------------------------------------------------------------
   * 2.7  dualControl
   * ------------------------------------------------------------------ */
  dualControl(request) {
    _assertObj(request, 'request');
    const amountILS = this._toILSEquivalent(
      request.amount,
      request.currency || 'ILS'
    );
    const forced =
      amountILS >= this.highValueGateILS ||
      request.transactionType === 'wire' && amountILS >= 100_000 ||
      (request.routing && request.routing.dualControl === true);

    return {
      required: !!forced,
      reason_he: forced
        ? 'נדרש נוכחות פיזית של שני מורשי חתימה (דואל-קונטרול)'
        : 'לא נדרש דואל-קונטרול',
      reason_en: forced
        ? 'Two authorized signers must be physically present (dual control)'
        : 'Dual control not required',
      amountILS,
    };
  }

  /* --------------------------------------------------------------------
   * 2.8  auditTrail
   * ------------------------------------------------------------------ */
  auditTrail(requestId) {
    _assertStr(requestId, 'requestId');
    return this.auditLog
      .filter((e) => e.requestId === requestId || e.accountId === requestId)
      .map((e) => ({ ...e }));
  }

  /* --------------------------------------------------------------------
   * 2.9  expiredRequests
   * ------------------------------------------------------------------ */
  expiredRequests(hours) {
    const windowHours =
      typeof hours === 'number' && hours > 0 ? hours : this.defaultTimeoutHours;
    const nowTs = this._clock();
    const expired = [];

    for (const req of this.requests.values()) {
      if (
        req.status === REQUEST_STATUS.approved ||
        req.status === REQUEST_STATUS.rejected ||
        req.status === REQUEST_STATUS.executed_offline
      ) {
        continue;
      }
      // Expire based on explicit expiresAtTs, or on age > windowHours when unset
      const isExpired = req.expiresAtTs
        ? nowTs > req.expiresAtTs
        : nowTs - req.createdAtTs > windowHours * 3600 * 1000;
      if (isExpired && req.status !== REQUEST_STATUS.expired) {
        req.status = REQUEST_STATUS.expired;
        this._audit({
          action: 'request.expired_sweep',
          requestId: req.id,
          ageMs: nowTs - req.createdAtTs,
        });
      }
      if (req.status === REQUEST_STATUS.expired) {
        expired.push(_clone(req));
      }
    }

    return {
      windowHours,
      count: expired.length,
      requests: expired,
    };
  }

  /* --------------------------------------------------------------------
   * 2.10  complianceCheck
   * ------------------------------------------------------------------ */
  complianceCheck(request) {
    _assertObj(request, 'request');
    const hits = [];
    const amountILS = this._toILSEquivalent(
      request.amount,
      request.currency || 'ILS'
    );

    // OFAC / sanctions screen — term hits against beneficiary fields
    const hay = [
      request.beneficiary && request.beneficiary.name,
      request.beneficiary && request.beneficiary.country,
      request.beneficiary && request.beneficiary.bank,
      request.purpose,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    for (const entry of this.sanctionsList) {
      if (hay.indexOf(String(entry.term).toUpperCase()) !== -1) {
        hits.push({
          type:   'sanctions',
          term:   entry.term,
          reason: entry.reason,
        });
      }
    }

    // AML threshold
    if (amountILS >= this.amlThresholdILS) {
      hits.push({
        type:   'aml_threshold',
        term:   'AML_THRESHOLD',
        reason:
          'Transaction at or above AML threshold (' +
          this.amlThresholdILS + ' ILS-eq) — elevated reporting required',
      });
    }

    // High-value gate
    if (amountILS >= this.highValueGateILS) {
      hits.push({
        type:   'high_value_gate',
        term:   'HIGH_VALUE',
        reason:
          'High value transaction (' + amountILS +
          ' ILS-eq) — CFO sign-off and dual-control required',
      });
    }

    const blocking = hits.some((h) => h.type === 'sanctions');
    const status = blocking ? 'blocked' : hits.length ? 'review' : 'clear';

    return {
      status,
      hits,
      amountILS,
      status_he:
        status === 'blocked' ? 'חסום — פגיעה ברשימת סנקציות' :
        status === 'review'  ? 'נדרשת בדיקה — מעל סף AML / ערך גבוה' :
                                'עובר',
      status_en:
        status === 'blocked' ? 'Blocked — sanctions list hit' :
        status === 'review'  ? 'Review required — AML / high-value' :
                                'Clear',
    };
  }

  /* --------------------------------------------------------------------
   * 2.11  notifyApprovers
   * ------------------------------------------------------------------ */
  notifyApprovers(requestId) {
    const req = this._getRequest(requestId);
    if (!req.routing) this.routeForApproval(requestId);

    const msgs = [];
    for (const role of req.routing.signerRoles) {
      const roleMeta = SIGNER_ROLES[role];
      const msg = {
        requestId,
        role,
        channel: 'queue',
        sentAt:  _now(),
        subject_he:
          'בקשה לאישור ' + req.transactionTypeLabel_he +
          ' — ' + req.amount + ' ' + req.currency,
        subject_en:
          'Authorization request — ' + req.transactionTypeLabel_en +
          ' ' + req.amount + ' ' + req.currency,
        body_he:
          'שלום ' + roleMeta.he + ',\n' +
          'ממתינה לחתימתך בקשה ' + req.id + '.\n' +
          'מוטב: ' + req.beneficiary.name + '.\n' +
          'סכום: ' + req.amount + ' ' + req.currency + '.\n' +
          'מטרה: ' + (req.purpose || '—') + '.\n\n' +
          this.disclaimer.he,
        body_en:
          'Dear ' + roleMeta.en + ',\n' +
          'Request ' + req.id + ' awaits your signature.\n' +
          'Beneficiary: ' + req.beneficiary.name + '.\n' +
          'Amount: ' + req.amount + ' ' + req.currency + '.\n' +
          'Purpose: ' + (req.purpose || '—') + '.\n\n' +
          this.disclaimer.en,
      };
      msgs.push(msg);
      this.notificationQueue.push(msg);
    }

    this._audit({
      action: 'request.notified',
      requestId,
      recipientCount: msgs.length,
    });
    return msgs;
  }

  /* --------------------------------------------------------------------
   * 2.12  reject / mark-executed (useful utilities, never-delete)
   * ------------------------------------------------------------------ */
  rejectRequest(requestId, rejector, reason) {
    const req = this._getRequest(requestId);
    _assertObj(rejector, 'rejector');
    _assertStr(rejector.id,   'rejector.id');
    _assertStr(rejector.name, 'rejector.name');
    req.rejections.push({
      rejectorId:   rejector.id,
      rejectorName: rejector.name,
      reason:       reason || '',
      rejectedAt:   _now(),
    });
    req.status = REQUEST_STATUS.rejected;
    this._audit({
      action: 'request.rejected',
      requestId,
      rejector: rejector.id,
      reason,
    });
    return _clone(req);
  }

  markExecutedOffline(requestId, executor, bankRef) {
    const req = this._getRequest(requestId);
    _assertObj(executor, 'executor');
    _assertStr(executor.id,   'executor.id');
    _assertStr(executor.name, 'executor.name');
    if (req.status !== REQUEST_STATUS.approved) {
      throw new Error('cannot mark executed: status=' + req.status);
    }
    req.executed = {
      executorId:   executor.id,
      executorName: executor.name,
      bankRef:      bankRef || '',
      executedAt:   _now(),
    };
    req.status = REQUEST_STATUS.executed_offline;
    this._audit({
      action: 'request.executed_offline',
      requestId,
      executor: executor.id,
      bankRef,
    });
    return _clone(req);
  }

  /* --------------------------------------------------------------------
   * Internal plumbing
   * ------------------------------------------------------------------ */
  _getRequest(requestId) {
    _assertStr(requestId, 'requestId');
    const r = this.requests.get(requestId);
    if (!r) throw new Error('unknown requestId: ' + requestId);
    return r;
  }

  _audit(entry) {
    this.auditLog.push({
      ...entry,
      ts: _now(),
      tsMs: this._clock(),
    });
  }

  /** Very crude FX for threshold comparisons — NOT for posting. */
  _toILSEquivalent(amount, currency) {
    const fx = {
      ILS: 1,
      USD: 3.6,
      EUR: 4.0,
      GBP: 4.6,
    };
    const rate = fx[(currency || 'ILS').toUpperCase()] || 1;
    return amount * rate;
  }
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  SignatoryWorkflow,
  TRANSACTION_TYPES,
  SIGNER_ROLES,
  SIGNATURE_METHODS,
  REQUEST_STATUS,
  DEFAULT_MATRIX_RULES,
  OFAC_BLOCKLIST,
  DISCLAIMER_HE,
  DISCLAIMER_EN,
};
