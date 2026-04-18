/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Consent Management — ניהול הסכמות (Consent Management Engine)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-138  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / consent-mgmt.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Implement a compliant consent-management engine under:
 *    • Israeli Privacy Protection Law ("חוק הגנת הפרטיות, התשמ"א-1981"),
 *      as amended by תיקון 13 2024 (Amendment 13, in force 14/08/2024).
 *    • Israeli PDPL framework principles (Personal Data Protection Law
 *      draft / regulatory guidance of הרשות להגנת הפרטיות).
 *    • Lawful-basis taxonomy aligned with GDPR Art. 6 (consent, contract,
 *      legal-obligation, vital-interest, public-interest,
 *      legitimate-interest).
 *
 *  Amendment 13 highlights honoured here:
 *    • Specific, informed, freely given, unambiguous consent (סעיף 11).
 *    • Right to withdraw — "as easy as giving" (sec. 13A).
 *    • Parental consent for subjects < 16 years (תיקון 13, sec. 17).
 *    • Re-consent cycles recommended by the Authority every 24 months
 *      for non-essential purposes (guidance 01-2024).
 *    • Immutability / proof-of-consent duty — controllers must be able
 *      to produce the original consent evidence on demand.
 *
 *  Core invariant of Techno-Kol Uzi:
 *     "לא מוחקים רק משדרגים ומגדלים"  — we never hard-delete.
 *     Withdrawal does NOT erase the original consent record; it creates
 *     a NEW linked record (withdrawal event) and flips a derived status.
 *     Bulk updates, rotations, and expiry all APPEND — they never delete.
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
 *    class ConsentManagement
 *      .recordConsent({...})              -> immutable consent record
 *      .withdrawConsent({...})            -> NEW withdrawal record
 *      .checkConsent(subjectId, purpose, at?) -> boolean + reason
 *      .consentHistory(subjectId)         -> append-only timeline
 *      .bulkConsentUpdate({...})          -> mass opt-out / opt-in
 *      .granularPurposeConsent(subjectId) -> per-purpose breakdown
 *      .minorConsent({...})               -> < 16 parental guard
 *      .consentExpiry(maxAge)             -> stale consents flagged
 *      .lawfulBasisCheck(purpose)         -> basis validation
 *      .auditTrail(subjectId)             -> immutable chain of custody
 *      .exportSubjectConsents(subjectId)  -> DSR access (Y-136)
 *      .verifyChain()                     -> tamper-detection
 *
 *  Run tests:
 *    node --test test/privacy/consent-mgmt.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ───────────────────────────────────────────────────────────────────────────
//  Constants — purposes, lawful bases, collection methods, statuses
// ───────────────────────────────────────────────────────────────────────────

/**
 * Seven canonical purposes (per Authority guidance + תיקון 13 granularity).
 * Bilingual labels — keys stay machine-stable in ASCII/kebab-case.
 */
const PURPOSES = Object.freeze({
  MARKETING:            'marketing',
  ANALYTICS:            'analytics',
  PERSONALIZATION:      'personalization',
  ESSENTIAL:            'essential',
  THIRD_PARTY_SHARING:  'third-party-sharing',
  PROFILING:            'profiling',
  AUTOMATED_DECISION:   'automated-decision',
});

const PURPOSE_LABELS = Object.freeze({
  [PURPOSES.MARKETING]:           { he: 'שיווק ופרסום',        en: 'Marketing & advertising' },
  [PURPOSES.ANALYTICS]:           { he: 'ניתוח ומחקר',         en: 'Analytics & research' },
  [PURPOSES.PERSONALIZATION]:     { he: 'התאמה אישית',          en: 'Personalization' },
  [PURPOSES.ESSENTIAL]:           { he: 'תפעול חיוני',          en: 'Essential operations' },
  [PURPOSES.THIRD_PARTY_SHARING]: { he: 'שיתוף עם צדדי ג׳',     en: 'Third-party sharing' },
  [PURPOSES.PROFILING]:           { he: 'פרופיל משתמש',         en: 'User profiling' },
  [PURPOSES.AUTOMATED_DECISION]:  { he: 'קבלת החלטה אוטומטית',  en: 'Automated decision-making' },
});

/**
 * Six canonical lawful bases — GDPR Art. 6 mirror, recognised by
 * the Israeli Privacy Protection Authority as acceptable equivalents.
 */
const LAWFUL_BASES = Object.freeze({
  CONSENT:             'consent',
  CONTRACT:            'contract',
  LEGAL_OBLIGATION:    'legal-obligation',
  VITAL_INTEREST:      'vital-interest',
  PUBLIC_INTEREST:     'public-interest',
  LEGITIMATE_INTEREST: 'legitimate-interest',
});

const LAWFUL_BASIS_LABELS = Object.freeze({
  [LAWFUL_BASES.CONSENT]:             { he: 'הסכמה',               en: 'Consent' },
  [LAWFUL_BASES.CONTRACT]:            { he: 'חוזה',                en: 'Contractual necessity' },
  [LAWFUL_BASES.LEGAL_OBLIGATION]:    { he: 'חובה חוקית',          en: 'Legal obligation' },
  [LAWFUL_BASES.VITAL_INTEREST]:      { he: 'אינטרס חיוני',        en: 'Vital interest' },
  [LAWFUL_BASES.PUBLIC_INTEREST]:     { he: 'אינטרס ציבורי',       en: 'Public interest' },
  [LAWFUL_BASES.LEGITIMATE_INTEREST]: { he: 'אינטרס לגיטימי',      en: 'Legitimate interest' },
});

/**
 * Five canonical collection methods. Each has its own evidentiary weight;
 * `signed-document` is the strongest, `browse-wrap` the weakest.
 */
const COLLECTION_METHODS = Object.freeze({
  CLICK_WRAP:       'click-wrap',
  BROWSE_WRAP:      'browse-wrap',
  SIGNED_DOCUMENT:  'signed-document',
  VERBAL_RECORDED:  'verbal-recorded',
  OPT_IN_EMAIL:     'opt-in-email',
});

const METHOD_LABELS = Object.freeze({
  [COLLECTION_METHODS.CLICK_WRAP]:      { he: 'לחיצה על כפתור הסכמה',    en: 'Click-wrap' },
  [COLLECTION_METHODS.BROWSE_WRAP]:     { he: 'הסכמה על-ידי גלישה',      en: 'Browse-wrap' },
  [COLLECTION_METHODS.SIGNED_DOCUMENT]: { he: 'מסמך חתום',                en: 'Signed document' },
  [COLLECTION_METHODS.VERBAL_RECORDED]: { he: 'הקלטת הסכמה בעל-פה',       en: 'Verbal (recorded)' },
  [COLLECTION_METHODS.OPT_IN_EMAIL]:    { he: 'אישור דוא"ל דו-שלבי',      en: 'Double opt-in email' },
});

/**
 * Consent record statuses. We never delete — a record with status
 * `withdrawn` still exists; withdrawal is represented by a NEW record
 * linking back to it via `originalRecordId`.
 */
const CONSENT_STATUS = Object.freeze({
  ACTIVE:    'active',
  WITHDRAWN: 'withdrawn',
  EXPIRED:   'expired',
  SUPERSEDED:'superseded',
  PENDING_PARENTAL: 'pending-parental',
});

/**
 * Record kinds on the append-only ledger. Every mutation is a kind.
 */
const RECORD_KIND = Object.freeze({
  GRANT:      'grant',       // positive consent recorded
  WITHDRAW:   'withdraw',    // subject withdrew
  EXPIRE:     'expire',      // consentExpiry flagged
  BULK:       'bulk',        // bulkConsentUpdate entry
  MINOR_GATE: 'minor-gate',  // parental-consent requirement evaluated
});

/**
 * Minor age threshold under תיקון 13 section 17 — 16 years.
 * Under this age, consent of a parent or legal guardian is required.
 */
const MINOR_AGE_THRESHOLD = 16;

/**
 * Recommended re-consent cycle (Authority guidance 01-2024).
 * Non-essential purposes should be refreshed every 24 months.
 */
const DEFAULT_MAX_CONSENT_AGE_MONTHS = 24;

/**
 * Purposes that are essential and therefore MAY rely on a basis
 * other than consent (contract, legal-obligation, etc.).
 * Profiling and automated decision-making must always use `consent`
 * under תיקון 13 unless explicit legal-obligation basis applies.
 */
const CONSENT_ONLY_PURPOSES = Object.freeze([
  PURPOSES.MARKETING,
  PURPOSES.PERSONALIZATION,
  PURPOSES.THIRD_PARTY_SHARING,
  PURPOSES.PROFILING,
  PURPOSES.AUTOMATED_DECISION,
]);

// ───────────────────────────────────────────────────────────────────────────
//  Helpers — hashing, deep-freezing, id generation
// ───────────────────────────────────────────────────────────────────────────

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.values(obj).forEach(deepFreeze);
  return Object.freeze(obj);
}

let _idCounter = 0;
function makeId(prefix) {
  _idCounter += 1;
  // monotonic + random suffix so tests get stable ordering but uniqueness
  const rnd = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}_${rnd}`;
}

function toDate(value) {
  if (value === undefined || value === null) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid date: ${value}`);
  }
  return d;
}

function monthsBetween(from, to) {
  const f = toDate(from);
  const t = toDate(to);
  const years  = t.getUTCFullYear() - f.getUTCFullYear();
  const months = t.getUTCMonth()    - f.getUTCMonth();
  const days   = t.getUTCDate()     - f.getUTCDate();
  return years * 12 + months + (days < 0 ? -1 : 0);
}

// ───────────────────────────────────────────────────────────────────────────
//  ConsentManagement — the class
// ───────────────────────────────────────────────────────────────────────────

class ConsentManagement {
  constructor(options = {}) {
    // append-only ledger — records are immutable once pushed
    this._ledger = [];

    // subjectId -> array of recordIds (ordered)
    this._bySubject = new Map();

    // recordId -> record (frozen)
    this._byId = new Map();

    // subject minor cache — subjectId -> { age, parentalConsentRef }
    this._minors = new Map();

    // hash-chained audit events; each links to prior via prevHash
    this._audit = [];

    // configurable defaults
    this._maxAgeMonths = options.maxAgeMonths || DEFAULT_MAX_CONSENT_AGE_MONTHS;

    // optional clock injection (for deterministic tests)
    this._now = options.now || (() => new Date());
  }

  // ─────────────────────────────────────────────────────────────────────
  //  recordConsent — create an immutable GRANT record
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {string} input.subjectId       — opaque subject id (e.g. user id)
   * @param {string} input.purpose         — one of PURPOSES
   * @param {string} input.lawfulBasis     — one of LAWFUL_BASES
   * @param {string|string[]} input.scope  — data categories / scope tokens
   * @param {string} input.version         — consent-text version (e.g. "v3.1")
   * @param {string} input.method          — one of COLLECTION_METHODS
   * @param {string} input.consentText_he  — Hebrew consent wording shown
   * @param {string} input.consentText_en  — English consent wording shown
   * @param {Date|string} [input.collectedAt] — defaults to now
   * @returns {object} frozen consent record
   */
  recordConsent(input) {
    const {
      subjectId,
      purpose,
      lawfulBasis,
      scope,
      version,
      method,
      consentText_he,
      consentText_en,
      collectedAt,
    } = input || {};

    // ── Validation ──────────────────────────────────────────────────
    if (!subjectId || typeof subjectId !== 'string') {
      throw new Error('recordConsent: subjectId is required');
    }
    if (!Object.values(PURPOSES).includes(purpose)) {
      throw new Error(`recordConsent: invalid purpose "${purpose}"`);
    }
    if (!Object.values(LAWFUL_BASES).includes(lawfulBasis)) {
      throw new Error(`recordConsent: invalid lawfulBasis "${lawfulBasis}"`);
    }
    if (!Object.values(COLLECTION_METHODS).includes(method)) {
      throw new Error(`recordConsent: invalid method "${method}"`);
    }
    if (!version || typeof version !== 'string') {
      throw new Error('recordConsent: version is required');
    }
    if (!consentText_he || !consentText_en) {
      throw new Error('recordConsent: bilingual consentText_he + consentText_en required (תיקון 13 סעיף 11)');
    }
    // Cross-check lawful basis vs. purpose
    this.lawfulBasisCheck(purpose, lawfulBasis);

    // ── Minor gate ──────────────────────────────────────────────────
    const minorInfo = this._minors.get(subjectId);
    let status = CONSENT_STATUS.ACTIVE;
    let minorFlag = false;
    let parentalConsentRef = null;
    if (minorInfo && minorInfo.age < MINOR_AGE_THRESHOLD) {
      minorFlag = true;
      parentalConsentRef = minorInfo.parentalConsentRef || null;
      if (!parentalConsentRef) {
        status = CONSENT_STATUS.PENDING_PARENTAL;
      }
    }

    const collected = toDate(collectedAt || this._now());
    const recordId  = makeId('consent');

    const scopeArr = Array.isArray(scope) ? scope.slice() : (scope ? [scope] : []);

    // Build the canonical payload — this is what we hash.
    const payload = {
      recordId,
      kind: RECORD_KIND.GRANT,
      subjectId,
      subjectHash: sha256Hex(subjectId),
      purpose,
      purposeLabels: PURPOSE_LABELS[purpose],
      lawfulBasis,
      lawfulBasisLabels: LAWFUL_BASIS_LABELS[lawfulBasis],
      scope: scopeArr,
      version,
      method,
      methodLabels: METHOD_LABELS[method],
      consentText_he,
      consentText_en,
      collectedAt: collected.toISOString(),
      status,
      minor: minorFlag,
      parentalConsentRef,
      originalRecordId: null, // withdrawals will point to their original
      createdAt: this._now().toISOString(),
    };

    const record = deepFreeze(Object.assign({}, payload, {
      payloadHash: sha256Hex(JSON.stringify(payload)),
    }));

    this._storeRecord(record);
    this._appendAudit('record_consent', record);

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  withdrawConsent — append-only withdrawal; original is preserved
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Creates a NEW record (kind=WITHDRAW) that references the active grant
   * record. The original grant is NEVER mutated — it remains in the ledger
   * verbatim. `checkConsent` will then return false from `effectiveAt`
   * onwards while continuing to return true for any point-in-time before.
   */
  withdrawConsent({ subjectId, purpose, reason, effectiveAt } = {}) {
    if (!subjectId) throw new Error('withdrawConsent: subjectId required');
    if (!Object.values(PURPOSES).includes(purpose)) {
      throw new Error(`withdrawConsent: invalid purpose "${purpose}"`);
    }

    const active = this._findActiveGrant(subjectId, purpose);
    if (!active) {
      throw new Error(
        `withdrawConsent: no active consent to withdraw for ` +
        `subject=${subjectId} purpose=${purpose}`,
      );
    }

    const effective = toDate(effectiveAt || this._now());
    const recordId  = makeId('withdraw');

    const payload = {
      recordId,
      kind: RECORD_KIND.WITHDRAW,
      subjectId,
      subjectHash: sha256Hex(subjectId),
      purpose,
      purposeLabels: PURPOSE_LABELS[purpose],
      // withdrawal inherits basis metadata for reporting
      lawfulBasis: active.lawfulBasis,
      lawfulBasisLabels: active.lawfulBasisLabels,
      scope: active.scope.slice(),
      version: active.version,
      method: active.method,
      methodLabels: active.methodLabels,
      consentText_he: active.consentText_he,
      consentText_en: active.consentText_en,
      reason: reason || null,
      reasonLabels: {
        he: reason ? `נימוק הנסיגה: ${reason}` : 'ללא נימוק',
        en: reason ? `Withdrawal reason: ${reason}` : 'No reason provided',
      },
      collectedAt: active.collectedAt,
      effectiveAt: effective.toISOString(),
      status: CONSENT_STATUS.WITHDRAWN,
      minor: active.minor,
      parentalConsentRef: active.parentalConsentRef,
      originalRecordId: active.recordId,   // <- LINK, not mutation
      createdAt: this._now().toISOString(),
    };

    const record = deepFreeze(Object.assign({}, payload, {
      payloadHash: sha256Hex(JSON.stringify(payload)),
    }));

    this._storeRecord(record);
    this._appendAudit('withdraw_consent', record);

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  checkConsent — point-in-time consent check
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Returns { granted: boolean, reason, record } reflecting whether the
   * subject had a valid, non-withdrawn, non-expired consent for `purpose`
   * at the instant `at` (defaults to now).
   *
   * Resolution order:
   *   1. Find the most recent GRANT for (subject, purpose) with
   *      collectedAt <= at.
   *   2. Check if a WITHDRAW record linking to it has effectiveAt <= at.
   *   3. Check expiry against _maxAgeMonths relative to `at`.
   */
  checkConsent(subjectId, purpose, at) {
    const when = toDate(at || this._now());
    const ids  = this._bySubject.get(subjectId) || [];
    const records = ids.map((id) => this._byId.get(id));

    // Most recent grant at or before `when`
    const grants = records
      .filter((r) =>
        r.kind === RECORD_KIND.GRANT &&
        r.purpose === purpose &&
        new Date(r.collectedAt).getTime() <= when.getTime(),
      )
      .sort((a, b) => new Date(b.collectedAt) - new Date(a.collectedAt));

    if (grants.length === 0) {
      return { granted: false, reason: 'no-consent-on-record', record: null };
    }
    const grant = grants[0];

    // Pending parental — cannot be relied upon
    if (grant.status === CONSENT_STATUS.PENDING_PARENTAL) {
      return { granted: false, reason: 'pending-parental-consent', record: grant };
    }

    // Was there a withdrawal that linked to this grant, effective before `when`?
    const withdraw = records.find((r) =>
      r.kind === RECORD_KIND.WITHDRAW &&
      r.originalRecordId === grant.recordId &&
      new Date(r.effectiveAt).getTime() <= when.getTime(),
    );
    if (withdraw) {
      return { granted: false, reason: 'withdrawn', record: withdraw };
    }

    // Expiry — only relevant for purposes that require refresh
    if (grant.lawfulBasis === LAWFUL_BASES.CONSENT &&
        grant.purpose !== PURPOSES.ESSENTIAL) {
      const age = monthsBetween(grant.collectedAt, when);
      if (age >= this._maxAgeMonths) {
        return { granted: false, reason: 'expired', record: grant };
      }
    }

    return { granted: true, reason: 'active', record: grant };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  consentHistory — full append-only timeline
  // ─────────────────────────────────────────────────────────────────────
  consentHistory(subjectId) {
    const ids = this._bySubject.get(subjectId) || [];
    return ids.map((id) => this._byId.get(id));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  bulkConsentUpdate — mass opt-out / opt-in
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {string[]} input.subjectIds
   * @param {object[]} input.purposeChanges
   *    each: { purpose, action: 'withdraw'|'grant-essential', reason?, ... }
   *
   * Returns a summary array — one entry per (subject, change) attempt.
   * Append-only; failed entries still produce audit rows.
   */
  bulkConsentUpdate({ subjectIds, purposeChanges } = {}) {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      throw new Error('bulkConsentUpdate: subjectIds required');
    }
    if (!Array.isArray(purposeChanges) || purposeChanges.length === 0) {
      throw new Error('bulkConsentUpdate: purposeChanges required');
    }

    const results = [];
    for (const subjectId of subjectIds) {
      for (const change of purposeChanges) {
        const { purpose, action, reason } = change;
        const attempt = {
          subjectId,
          purpose,
          action,
          ok: false,
          recordId: null,
          error: null,
        };
        try {
          if (action === 'withdraw') {
            const rec = this.withdrawConsent({ subjectId, purpose, reason });
            attempt.ok = true;
            attempt.recordId = rec.recordId;
          } else if (action === 'grant-essential') {
            const rec = this.recordConsent({
              subjectId,
              purpose,
              lawfulBasis: LAWFUL_BASES.LEGITIMATE_INTEREST,
              scope: change.scope || ['bulk-applied'],
              version: change.version || 'bulk-v1',
              method: change.method || COLLECTION_METHODS.CLICK_WRAP,
              consentText_he: change.consentText_he || 'עדכון מסגרת שירות',
              consentText_en: change.consentText_en || 'Framework service update',
            });
            attempt.ok = true;
            attempt.recordId = rec.recordId;
          } else {
            throw new Error(`unknown bulk action: ${action}`);
          }
        } catch (err) {
          attempt.error = err.message;
        }
        const bulkEvent = deepFreeze({
          kind: RECORD_KIND.BULK,
          at: this._now().toISOString(),
          attempt,
        });
        this._appendAudit('bulk_update', bulkEvent);
        results.push(attempt);
      }
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  granularPurposeConsent — per-purpose breakdown
  // ─────────────────────────────────────────────────────────────────────
  granularPurposeConsent(subjectId) {
    const breakdown = {};
    for (const purpose of Object.values(PURPOSES)) {
      const result = this.checkConsent(subjectId, purpose);
      breakdown[purpose] = {
        granted: result.granted,
        reason: result.reason,
        labels: PURPOSE_LABELS[purpose],
        lastRecordId: result.record ? result.record.recordId : null,
      };
    }
    return breakdown;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  minorConsent — register age + (optional) parental consent reference
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Registers the subject's age and a parental-consent reference.
   * If age < 16 and no parentalConsentRef is provided, any consent
   * recorded afterwards will land in status PENDING_PARENTAL and will
   * NOT be considered `granted` by checkConsent.
   *
   * Once a parental reference is supplied, future GRANT records can flow
   * through normally. Existing PENDING_PARENTAL records remain as-is
   * (append-only), but an upgrade record can be created via a fresh
   * recordConsent call.
   */
  minorConsent({ subjectId, age, parentalConsentRef } = {}) {
    if (!subjectId) throw new Error('minorConsent: subjectId required');
    if (typeof age !== 'number' || age < 0 || age > 130) {
      throw new Error('minorConsent: age must be a number between 0 and 130');
    }
    const entry = {
      subjectId,
      subjectHash: sha256Hex(subjectId),
      age,
      parentalConsentRef: parentalConsentRef || null,
      requiresParental: age < MINOR_AGE_THRESHOLD,
      threshold: MINOR_AGE_THRESHOLD,
      citation: 'חוק הגנת הפרטיות תיקון 13 סעיף 17',
      labels: {
        he: age < MINOR_AGE_THRESHOLD
          ? 'נדרש אישור הורה / אפוטרופוס'
          : 'בגיר — לא נדרש אישור הורה',
        en: age < MINOR_AGE_THRESHOLD
          ? 'Parental consent required'
          : 'Adult — parental consent not required',
      },
      at: this._now().toISOString(),
    };
    this._minors.set(subjectId, entry);

    const gateEvent = deepFreeze(Object.assign({}, entry, {
      kind: RECORD_KIND.MINOR_GATE,
    }));
    this._appendAudit('minor_gate', gateEvent);

    if (entry.requiresParental && !parentalConsentRef) {
      return Object.assign({}, entry, {
        ok: false,
        blocked: true,
        reason: 'parental-consent-missing',
      });
    }
    return Object.assign({}, entry, { ok: true, blocked: false });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  consentExpiry — re-consent cycle (default 24 months)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Flags stale consents as expired — APPENDS an EXPIRE record per
   * affected (subject, purpose). Returns the list of flagged items.
   * The original grant records are untouched.
   */
  consentExpiry(maxAge) {
    const months = typeof maxAge === 'number' ? maxAge : this._maxAgeMonths;
    const now = this._now();
    const expired = [];

    for (const [subjectId, ids] of this._bySubject.entries()) {
      const records = ids.map((id) => this._byId.get(id));
      // group grants by purpose, look at most recent non-withdrawn
      const byPurpose = new Map();
      for (const r of records) {
        if (r.kind !== RECORD_KIND.GRANT) continue;
        if (!byPurpose.has(r.purpose) ||
            new Date(r.collectedAt) > new Date(byPurpose.get(r.purpose).collectedAt)) {
          byPurpose.set(r.purpose, r);
        }
      }
      for (const [purpose, grant] of byPurpose.entries()) {
        // skip if already withdrawn
        const withdrawn = records.some((r) =>
          r.kind === RECORD_KIND.WITHDRAW && r.originalRecordId === grant.recordId,
        );
        if (withdrawn) continue;
        if (grant.lawfulBasis !== LAWFUL_BASES.CONSENT) continue;
        if (grant.purpose === PURPOSES.ESSENTIAL) continue;

        const age = monthsBetween(grant.collectedAt, now);
        if (age < months) continue;

        const recordId = makeId('expire');
        const payload = {
          recordId,
          kind: RECORD_KIND.EXPIRE,
          subjectId,
          subjectHash: sha256Hex(subjectId),
          purpose,
          purposeLabels: PURPOSE_LABELS[purpose],
          originalRecordId: grant.recordId,
          expiredAt: now.toISOString(),
          ageMonths: age,
          maxAgeMonths: months,
          status: CONSENT_STATUS.EXPIRED,
          reasonLabels: {
            he: `הסכמה פגת-תוקף לאחר ${age} חודשים (מקס ${months})`,
            en: `Consent expired after ${age} months (max ${months})`,
          },
          createdAt: now.toISOString(),
        };
        const record = deepFreeze(Object.assign({}, payload, {
          payloadHash: sha256Hex(JSON.stringify(payload)),
        }));
        this._storeRecord(record);
        this._appendAudit('expire_consent', record);
        expired.push(record);
      }
    }
    return expired;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  lawfulBasisCheck — validate purpose has an acceptable basis
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Two calling conventions:
   *   (a) lawfulBasisCheck(purpose)
   *       → returns list of acceptable bases for that purpose
   *   (b) lawfulBasisCheck(purpose, proposedBasis)
   *       → throws if proposedBasis is not acceptable; returns truthy
   *         descriptor on success
   */
  lawfulBasisCheck(purpose, proposedBasis) {
    if (!Object.values(PURPOSES).includes(purpose)) {
      throw new Error(`lawfulBasisCheck: invalid purpose "${purpose}"`);
    }

    const allBases = Object.values(LAWFUL_BASES);
    const consentOnly = CONSENT_ONLY_PURPOSES.includes(purpose);

    // Essential can use any basis except profiling-style ones;
    // analytics can use consent OR legitimate-interest;
    // everything else is consent-only.
    let allowed;
    if (purpose === PURPOSES.ESSENTIAL) {
      allowed = [
        LAWFUL_BASES.CONSENT,
        LAWFUL_BASES.CONTRACT,
        LAWFUL_BASES.LEGAL_OBLIGATION,
        LAWFUL_BASES.VITAL_INTEREST,
        LAWFUL_BASES.PUBLIC_INTEREST,
        LAWFUL_BASES.LEGITIMATE_INTEREST,
      ];
    } else if (purpose === PURPOSES.ANALYTICS) {
      allowed = [LAWFUL_BASES.CONSENT, LAWFUL_BASES.LEGITIMATE_INTEREST];
    } else if (consentOnly) {
      allowed = [LAWFUL_BASES.CONSENT];
      // תיקון 13 carve-out: profiling/automated-decision allow legal-obligation
      if (purpose === PURPOSES.PROFILING || purpose === PURPOSES.AUTOMATED_DECISION) {
        allowed.push(LAWFUL_BASES.LEGAL_OBLIGATION);
      }
    } else {
      allowed = allBases.slice();
    }

    if (proposedBasis === undefined) {
      return {
        purpose,
        allowed,
        labels: PURPOSE_LABELS[purpose],
      };
    }
    if (!allBases.includes(proposedBasis)) {
      throw new Error(`lawfulBasisCheck: unknown basis "${proposedBasis}"`);
    }
    if (!allowed.includes(proposedBasis)) {
      throw new Error(
        `lawfulBasisCheck: basis "${proposedBasis}" not acceptable for ` +
        `purpose "${purpose}" — allowed: ${allowed.join(', ')}`,
      );
    }
    return {
      purpose,
      basis: proposedBasis,
      allowed,
      labels: LAWFUL_BASIS_LABELS[proposedBasis],
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  auditTrail — immutable chain of custody
  // ─────────────────────────────────────────────────────────────────────
  auditTrail(subjectId) {
    if (!subjectId) return this._audit.slice();
    const hash = sha256Hex(subjectId);
    return this._audit.filter((ev) =>
      ev.subjectHash === hash || ev.event === 'bulk_update',
    );
  }

  /**
   * Verify the full SHA-256 chain. Returns { valid, brokenAt }.
   * Every event has prevHash = sha256(previous event's hash) so any
   * in-place mutation breaks the chain deterministically.
   */
  verifyChain() {
    let prev = 'GENESIS';
    for (let i = 0; i < this._audit.length; i += 1) {
      const ev = this._audit[i];
      const expectedPrev = sha256Hex(prev);
      if (ev.prevHash !== expectedPrev) {
        return { valid: false, brokenAt: i };
      }
      const recomputed = sha256Hex(
        ev.seq + '|' + ev.event + '|' + ev.payloadHash + '|' + ev.prevHash,
      );
      if (recomputed !== ev.hash) {
        return { valid: false, brokenAt: i };
      }
      prev = ev.hash;
    }
    return { valid: true, brokenAt: -1 };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  exportSubjectConsents — for DSR access (integrates with Y-136)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Returns a bilingual, DSR-ready export of all records for a subject.
   * Shape mirrors Y-136 DSRHandler expectation: an array of entries
   * suitable for inclusion in the DSR access response packet.
   */
  exportSubjectConsents(subjectId) {
    const history = this.consentHistory(subjectId);
    const granular = this.granularPurposeConsent(subjectId);
    const minor = this._minors.get(subjectId) || null;
    return deepFreeze({
      subjectId,
      subjectHash: sha256Hex(subjectId),
      exportedAt: this._now().toISOString(),
      titleLabels: {
        he: 'ייצוא הסכמות לבקשת נושא מידע',
        en: 'Consent export for Data Subject Request',
      },
      citations: [
        'חוק הגנת הפרטיות תיקון 13 סעיף 11 (הסכמה מדעת)',
        'חוק הגנת הפרטיות תיקון 13 סעיף 13א (זכות לחזרה מהסכמה)',
        'הנחיית הרשות להגנת הפרטיות 01-2024 (מחזור רענון הסכמות)',
      ],
      counts: {
        total:   history.length,
        grants:  history.filter((r) => r.kind === RECORD_KIND.GRANT).length,
        withdrawals: history.filter((r) => r.kind === RECORD_KIND.WITHDRAW).length,
        expired: history.filter((r) => r.kind === RECORD_KIND.EXPIRE).length,
      },
      granular,
      minor,
      history,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────────────────────────────
  _storeRecord(record) {
    this._byId.set(record.recordId, record);
    if (!this._bySubject.has(record.subjectId)) {
      this._bySubject.set(record.subjectId, []);
    }
    this._bySubject.get(record.subjectId).push(record.recordId);
    this._ledger.push(record);
  }

  _findActiveGrant(subjectId, purpose) {
    const ids = this._bySubject.get(subjectId) || [];
    const records = ids.map((id) => this._byId.get(id));
    // sort grants most-recent-first
    const grants = records
      .filter((r) => r.kind === RECORD_KIND.GRANT && r.purpose === purpose)
      .sort((a, b) => new Date(b.collectedAt) - new Date(a.collectedAt));
    for (const g of grants) {
      const withdrawn = records.some(
        (r) => r.kind === RECORD_KIND.WITHDRAW && r.originalRecordId === g.recordId,
      );
      if (!withdrawn && g.status !== CONSENT_STATUS.PENDING_PARENTAL) return g;
    }
    return null;
  }

  _appendAudit(eventName, payload) {
    const seq = this._audit.length + 1;
    const payloadHash = sha256Hex(JSON.stringify(payload));
    const prevHash = this._audit.length === 0
      ? sha256Hex('GENESIS')
      : sha256Hex(this._audit[this._audit.length - 1].hash);
    const hash = sha256Hex(seq + '|' + eventName + '|' + payloadHash + '|' + prevHash);
    const ev = deepFreeze({
      seq,
      at: this._now().toISOString(),
      event: eventName,
      subjectHash: payload && payload.subjectHash ? payload.subjectHash : null,
      recordId: payload && payload.recordId ? payload.recordId : null,
      payloadHash,
      prevHash,
      hash,
    });
    this._audit.push(ev);
    return ev;
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Exports
// ───────────────────────────────────────────────────────────────────────────
module.exports = {
  ConsentManagement,
  PURPOSES,
  PURPOSE_LABELS,
  LAWFUL_BASES,
  LAWFUL_BASIS_LABELS,
  COLLECTION_METHODS,
  METHOD_LABELS,
  CONSENT_STATUS,
  RECORD_KIND,
  MINOR_AGE_THRESHOLD,
  DEFAULT_MAX_CONSENT_AGE_MONTHS,
  CONSENT_ONLY_PURPOSES,
};
