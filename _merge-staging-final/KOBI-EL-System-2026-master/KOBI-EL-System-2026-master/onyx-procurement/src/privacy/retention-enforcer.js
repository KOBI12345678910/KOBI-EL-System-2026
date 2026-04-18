/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Retention Enforcer — אוכף מדיניות שימור רשומות
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-137  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / retention-enforcer.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Complement Y-149 (audit-retention engine) which DEFINES rules, and Y-150
 *  (legal-hold registry) which PAUSES retention. Y-137 is the ENFORCER: it
 *  scans records whose retention period has expired and moves them to cold
 *  storage according to the configured archival method.
 *
 *  Core invariant of Techno-Kol Uzi:
 *     "לא מוחקים — רק משדרגים ומגדלים"  — we never hard-delete.
 *
 *  Reconciliation with retention expiry:
 *     enforcement  =>  archive event + segregation + tombstone ledger
 *     enforcement  !=  DELETE FROM … (NEVER)
 *
 *  The production row is flagged `archived=true`, moved to the cold
 *  partition, and an append-only tombstone is emitted. A downstream
 *  cold-storage pipeline (not our concern) is responsible for the physical
 *  copy. This module ONLY emits events — it does not reach into any live
 *  database directly. That separation is load-bearing.
 *
 *  Legal-hold precedence
 *  ---------------------
 *  A legal hold ALWAYS wins over retention. If `legalHoldOverride(id)`
 *  has been called for a record, or the classifier detects a hold flag,
 *  the record is skipped by `scanDue` and `dryRun`, and `enforceArchive`
 *  on that record throws.
 *
 *  Archival methods
 *  ----------------
 *    cold-storage   — full record copied to a segregated cold tier.
 *                     Restorable. Default method. Emits 'record:archived'.
 *    pseudonymize   — PII fields are replaced by deterministic hashes.
 *                     Row stays live but cannot be reversed without salt.
 *    tombstone      — record is redacted to metadata-only and its
 *                     content hash is appended to the tombstone ledger.
 *                     The ledger itself is append-only and SHA-256 chained.
 *
 *  Storage
 *  -------
 *  In-memory Maps + append-only arrays. Every mutation produces a
 *  SHA-256-chained audit event. No external deps. Only `node:crypto`
 *  and `node:events` are used.
 *
 *  Integration
 *  -----------
 *  Y-137 does NOT import Y-149 or Y-150. Instead it exposes:
 *    — `definePolicy()` which mirrors the rule surface of Y-149;
 *    — `legalHoldOverride(id)` which an external glue layer (or Y-150)
 *      calls when a hold is placed;
 *    — EventEmitter events (`record:archived`, `record:tombstoned`,
 *      `record:restored`, `batch:rolledback`, `hold:override`) which
 *      downstream consumers subscribe to.
 *
 *  Public API
 *  ----------
 *    class RetentionEnforcer extends EventEmitter
 *      .definePolicy({...})                               -> policy record
 *      .getPolicy(id)                                     -> policy | null
 *      .listPolicies()                                    -> array
 *      .classifyRecord({recordId, category, createdAt})   -> classification
 *      .getClassification(recordId)                       -> classification
 *      .scanDue(now, {category?})                         -> due records
 *      .dryRun(now, {category?})                          -> preview (no mutation)
 *      .enforceArchive(recordId, {method, approvedBy})    -> archive result
 *      .enforceBatch(records, {approvedBy})               -> batch result
 *      .legalHoldOverride(recordId, {reason, placedBy})   -> void
 *      .releaseLegalHold(recordId, {reason, releasedBy})  -> void
 *      .restoreFromArchive(recordId, justification, by)   -> restore result
 *      .rollbackLastBatch({approvedBy, reason})           -> rollback result
 *      .exportTombstone(recordId, reason)                 -> tombstone entry
 *      .tombstoneLedger()                                 -> frozen copy
 *      .verifyTombstoneChain()                            -> { valid, brokenAt }
 *      .auditReport(period)                               -> bilingual report
 *      .auditEvents()                                     -> frozen event log
 *      .verifyAuditChain()                                -> { valid, brokenAt }
 *
 *  Tests:
 *    node --test test/privacy/retention-enforcer.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

// ───────────────────────────────────────────────────────────────────────────
//  Constants
// ───────────────────────────────────────────────────────────────────────────

/**
 * Archival methods supported by the enforcer. Each method is a soft action —
 * NONE of them perform a hard delete. Downstream consumers decide how to
 * interpret the emitted event (e.g. write to cold S3, write to glacier,
 * pseudonymize in-place in the live DB, etc.).
 */
const ARCHIVAL_METHOD = Object.freeze({
  COLD_STORAGE: 'cold-storage',
  PSEUDONYMIZE: 'pseudonymize',
  TOMBSTONE: 'tombstone',
});

const ALL_METHODS = Object.freeze([
  ARCHIVAL_METHOD.COLD_STORAGE,
  ARCHIVAL_METHOD.PSEUDONYMIZE,
  ARCHIVAL_METHOD.TOMBSTONE,
]);

const RECORD_STATUS = Object.freeze({
  LIVE: 'live',
  LEGAL_HOLD: 'legal_hold',
  ARCHIVED: 'archived',
  PSEUDONYMIZED: 'pseudonymized',
  TOMBSTONED: 'tombstoned',
  RESTORED: 'restored',
});

const EVENTS = Object.freeze({
  POLICY_DEFINED: 'policy:defined',
  RECORD_CLASSIFIED: 'record:classified',
  RECORD_ARCHIVED: 'record:archived',
  RECORD_PSEUDONYMIZED: 'record:pseudonymized',
  RECORD_TOMBSTONED: 'record:tombstoned',
  RECORD_RESTORED: 'record:restored',
  HOLD_PLACED: 'hold:placed',
  HOLD_RELEASED: 'hold:released',
  BATCH_ENFORCED: 'batch:enforced',
  BATCH_ROLLEDBACK: 'batch:rolledback',
});

/**
 * Default retention categories required by Israeli law. A host can override
 * any of these by calling `definePolicy` with the same id. Shipped as a
 * seed only — the enforcer does not mutate this object.
 *
 * Laws referenced:
 *    — פקודת מס הכנסה [נוסח חדש]      — Income Tax Ordinance (7y)
 *    — חוק מס ערך מוסף, תשל״ו-1975     — VAT Law (7y)
 *    — חוק שעות עבודה ומנוחה             — Work Hours & Rest (7y HR)
 *    — חוק איסור הלבנת הון, תש״ס-2000   — AML Law (7y)
 *    — חוק זכויות החולה, תשנ״ו-1996     — Patient Rights (10y medical)
 *    — חוק המכר (דירות), תשל״ג-1973     — Sale Apartments (25y construction)
 */
const DEFAULT_CATEGORIES = Object.freeze({
  tax: Object.freeze({
    years: 7,
    he: 'מסמכי מס',
    en: 'Tax records',
    law_he: 'פקודת מס הכנסה',
    law_en: 'Income Tax Ordinance',
  }),
  vat: Object.freeze({
    years: 7,
    he: 'מסמכי מע״מ',
    en: 'VAT records',
    law_he: 'חוק מס ערך מוסף',
    law_en: 'VAT Law',
  }),
  hr: Object.freeze({
    years: 7,
    he: 'רשומות עובדים',
    en: 'HR / employment records',
    law_he: 'חוק שעות עבודה ומנוחה',
    law_en: 'Work Hours & Rest Law',
  }),
  aml: Object.freeze({
    years: 7,
    he: 'איסור הלבנת הון',
    en: 'AML records',
    law_he: 'חוק איסור הלבנת הון',
    law_en: 'Prohibition on Money Laundering Law',
  }),
  medical: Object.freeze({
    years: 10,
    he: 'רשומות רפואיות',
    en: 'Medical records',
    law_he: 'חוק זכויות החולה',
    law_en: 'Patient Rights Law',
  }),
  construction: Object.freeze({
    years: 25,
    he: 'רשומות בנייה ואחריות קבלן',
    en: 'Construction / contractor warranty',
    law_he: 'חוק המכר (דירות)',
    law_en: 'Sale (Apartments) Law',
  }),
  contracts: Object.freeze({
    years: 7,
    he: 'חוזים ומסמכים משפטיים',
    en: 'Contracts / legal docs',
    law_he: 'חוק ההתיישנות',
    law_en: 'Limitation Law',
  }),
  marketing: Object.freeze({
    years: 2,
    he: 'נתוני שיווק',
    en: 'Marketing data',
    law_he: 'חוק הגנת הפרטיות (תיקון 13)',
    law_en: 'Protection of Privacy Law (Amendment 13)',
  }),
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isoDate(d) {
  if (d === null || d === undefined) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(value);
}

function addDays(date, days) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(a, b) {
  const ad = toDate(a).getTime();
  const bd = toDate(b).getTime();
  return Math.floor((bd - ad) / MS_PER_DAY);
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
      .join(',') +
    '}'
  );
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function pseudonymize(value, salt) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (s.length === 0) return '';
  const head = s.slice(0, 1);
  const hash = sha256(salt + '|' + s).slice(0, 12);
  return `${head}***${hash}`;
}

// ───────────────────────────────────────────────────────────────────────────
//  RetentionEnforcer
// ───────────────────────────────────────────────────────────────────────────

class RetentionEnforcer extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {Date|string} [opts.now]      — fixed clock for tests
   * @param {string}      [opts.salt]     — pseudonymization salt
   * @param {boolean}     [opts.seedDefaults=true]
   *                                        — pre-seed DEFAULT_CATEGORIES
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(0);

    this._nowProvider = opts.now
      ? () => toDate(opts.now)
      : () => new Date();
    this._salt = opts.salt || 'techno-kol-retention-salt';

    // storage — all Map-based / append-only
    this._policies = new Map();           // policyId -> policy
    this._categoryIndex = new Map();      // category -> policyId
    this._records = new Map();            // recordId -> classification
    this._archives = new Map();           // recordId -> archive record
    this._legalHolds = new Map();         // recordId -> hold record
    this._batches = [];                   // [{ id, ts, actions: [recordId, prevState] }]
    this._auditChain = [];                // sha256-chained event log
    this._auditPrev = sha256('retention-enforcer-genesis');
    this._tombstoneLedger = [];           // append-only
    this._tombstonePrev = sha256('retention-enforcer-tombstone-genesis');

    if (opts.seedDefaults !== false) {
      for (const [key, meta] of Object.entries(DEFAULT_CATEGORIES)) {
        this.definePolicy({
          id: `default-${key}`,
          category: key,
          retentionDays: meta.years * 365,
          purpose: `Default Israeli-law retention for ${meta.en}`,
          legalBasis_he: meta.law_he,
          legalBasis_en: meta.law_en,
          archivalMethod: ARCHIVAL_METHOD.COLD_STORAGE,
        });
      }
    }
  }

  // ─── time helper ────────────────────────────────────────────────────────

  _now(overrideNow) {
    return overrideNow ? toDate(overrideNow) : this._nowProvider();
  }

  // ─── audit chain ────────────────────────────────────────────────────────

  _appendAudit(type, payload) {
    const ts = isoDate(this._now());
    const body = stableStringify({ type, payload, ts });
    const hash = sha256(this._auditPrev + '|' + body);
    const entry = deepFreeze({
      seq: this._auditChain.length,
      type,
      ts,
      payload: deepFreeze(JSON.parse(JSON.stringify(payload))),
      prevHash: this._auditPrev,
      hash,
    });
    this._auditChain.push(entry);
    this._auditPrev = hash;
    return entry;
  }

  auditEvents() {
    return Object.freeze(this._auditChain.slice());
  }

  verifyAuditChain() {
    let prev = sha256('retention-enforcer-genesis');
    for (let i = 0; i < this._auditChain.length; i++) {
      const e = this._auditChain[i];
      if (e.prevHash !== prev) {
        return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
      }
      const body = stableStringify({
        type: e.type,
        payload: e.payload,
        ts: e.ts,
      });
      const expected = sha256(prev + '|' + body);
      if (expected !== e.hash) {
        return { valid: false, brokenAt: i, reason: 'hash mismatch' };
      }
      prev = e.hash;
    }
    return { valid: true, brokenAt: -1 };
  }

  // ─── policies ───────────────────────────────────────────────────────────

  /**
   * Define (or override) a retention policy.
   *
   * @param {object} spec
   * @param {string} spec.id              — stable id, used for overrides
   * @param {string} spec.category        — category token (tax, hr, ...)
   * @param {number} spec.retentionDays   — >0 integer days
   * @param {string} spec.purpose         — why we retain
   * @param {string} spec.legalBasis_he   — Hebrew legal citation
   * @param {string} spec.legalBasis_en   — English legal citation
   * @param {string} spec.archivalMethod  — one of ARCHIVAL_METHOD
   */
  definePolicy(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('policy spec must be an object');
    }
    assertNonEmptyString('policy.id', spec.id);
    assertNonEmptyString('policy.category', spec.category);
    assertNonEmptyString('policy.purpose', spec.purpose);
    assertNonEmptyString('policy.legalBasis_he', spec.legalBasis_he);
    assertNonEmptyString('policy.legalBasis_en', spec.legalBasis_en);
    if (
      !Number.isInteger(spec.retentionDays) ||
      spec.retentionDays <= 0
    ) {
      throw new RangeError('policy.retentionDays must be a positive integer');
    }
    if (!ALL_METHODS.includes(spec.archivalMethod)) {
      throw new RangeError(
        `policy.archivalMethod must be one of ${ALL_METHODS.join(', ')}`
      );
    }

    const policy = deepFreeze({
      id: spec.id,
      category: spec.category,
      retentionDays: spec.retentionDays,
      purpose: spec.purpose,
      legalBasis_he: spec.legalBasis_he,
      legalBasis_en: spec.legalBasis_en,
      archivalMethod: spec.archivalMethod,
      definedAt: isoDate(this._now()),
    });

    this._policies.set(policy.id, policy);
    this._categoryIndex.set(policy.category, policy.id);

    const audit = this._appendAudit(EVENTS.POLICY_DEFINED, {
      policyId: policy.id,
      category: policy.category,
      retentionDays: policy.retentionDays,
      archivalMethod: policy.archivalMethod,
    });
    this.emit(EVENTS.POLICY_DEFINED, { policy, auditSeq: audit.seq });

    return policy;
  }

  getPolicy(id) {
    return this._policies.get(id) || null;
  }

  policyForCategory(category) {
    const id = this._categoryIndex.get(category);
    return id ? this._policies.get(id) : null;
  }

  listPolicies() {
    return Object.freeze(Array.from(this._policies.values()));
  }

  // ─── classification ─────────────────────────────────────────────────────

  /**
   * Assign a policy to a record. The caller supplies the anchor date
   * (`createdAt`), the category, and the record id. The classification is
   * immutable after first assignment unless explicitly reclassified.
   */
  classifyRecord(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('classifyRecord spec must be an object');
    }
    assertNonEmptyString('recordId', spec.recordId);
    assertNonEmptyString('category', spec.category);
    if (spec.createdAt === undefined || spec.createdAt === null) {
      throw new TypeError('createdAt is required');
    }
    const createdAt = toDate(spec.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new RangeError('createdAt must be a valid date');
    }
    const policy = this.policyForCategory(spec.category);
    if (!policy) {
      throw new RangeError(
        `no policy defined for category "${spec.category}"`
      );
    }

    const expiresAt = addDays(createdAt, policy.retentionDays);

    const classification = deepFreeze({
      recordId: spec.recordId,
      category: spec.category,
      policyId: policy.id,
      createdAt: isoDate(createdAt),
      expiresAt: isoDate(expiresAt),
      retentionDays: policy.retentionDays,
      archivalMethod: policy.archivalMethod,
      status: RECORD_STATUS.LIVE,
      classifiedAt: isoDate(this._now()),
    });

    this._records.set(spec.recordId, classification);
    const audit = this._appendAudit(EVENTS.RECORD_CLASSIFIED, {
      recordId: spec.recordId,
      category: spec.category,
      policyId: policy.id,
      expiresAt: classification.expiresAt,
    });
    this.emit(EVENTS.RECORD_CLASSIFIED, {
      classification,
      auditSeq: audit.seq,
    });
    return classification;
  }

  getClassification(recordId) {
    return this._records.get(recordId) || null;
  }

  listClassifications() {
    return Object.freeze(Array.from(this._records.values()));
  }

  // ─── legal hold ─────────────────────────────────────────────────────────

  /**
   * Mark a record as under legal hold. Legal hold ALWAYS wins over
   * retention: the record will be skipped by `scanDue`/`dryRun` and
   * `enforceArchive` will throw if called on it.
   *
   * This is the integration point with Y-150 legal-hold. Y-150 calls this
   * method when a hold is placed; we only emit events in return.
   */
  legalHoldOverride(recordId, opts = {}) {
    assertNonEmptyString('recordId', recordId);
    const hold = deepFreeze({
      recordId,
      reason: opts.reason || 'unspecified',
      placedBy: opts.placedBy || 'system',
      placedAt: isoDate(this._now()),
      matterId: opts.matterId || null,
    });
    this._legalHolds.set(recordId, hold);

    // update status if classified
    const cls = this._records.get(recordId);
    if (cls && cls.status === RECORD_STATUS.LIVE) {
      const next = deepFreeze({
        ...cls,
        status: RECORD_STATUS.LEGAL_HOLD,
      });
      this._records.set(recordId, next);
    }

    const audit = this._appendAudit(EVENTS.HOLD_PLACED, {
      recordId,
      reason: hold.reason,
      placedBy: hold.placedBy,
      matterId: hold.matterId,
    });
    this.emit(EVENTS.HOLD_PLACED, { hold, auditSeq: audit.seq });
    return hold;
  }

  releaseLegalHold(recordId, opts = {}) {
    assertNonEmptyString('recordId', recordId);
    if (!this._legalHolds.has(recordId)) {
      throw new Error(`no legal hold on record ${recordId}`);
    }
    const prev = this._legalHolds.get(recordId);
    this._legalHolds.delete(recordId);

    // revert status if still legal_hold
    const cls = this._records.get(recordId);
    if (cls && cls.status === RECORD_STATUS.LEGAL_HOLD) {
      const next = deepFreeze({ ...cls, status: RECORD_STATUS.LIVE });
      this._records.set(recordId, next);
    }

    const audit = this._appendAudit(EVENTS.HOLD_RELEASED, {
      recordId,
      reason: opts.reason || 'unspecified',
      releasedBy: opts.releasedBy || 'system',
      previouslyPlacedBy: prev.placedBy,
    });
    this.emit(EVENTS.HOLD_RELEASED, { recordId, auditSeq: audit.seq });
    return {
      recordId,
      released: true,
      reason: opts.reason || 'unspecified',
    };
  }

  isOnLegalHold(recordId) {
    return this._legalHolds.has(recordId);
  }

  // ─── scan / dry run ─────────────────────────────────────────────────────

  /**
   * Find records whose retention expired AS OF `now`, optionally filtered
   * by category. Records under legal hold are NEVER returned here.
   */
  scanDue(now, filter = {}) {
    const cutoff = this._now(now);
    const due = [];
    for (const cls of this._records.values()) {
      if (filter.category && cls.category !== filter.category) continue;
      if (this._legalHolds.has(cls.recordId)) continue;
      if (
        cls.status !== RECORD_STATUS.LIVE &&
        cls.status !== RECORD_STATUS.LEGAL_HOLD
      ) {
        continue;
      }
      if (cls.status === RECORD_STATUS.LEGAL_HOLD) continue;
      const expires = toDate(cls.expiresAt);
      if (expires.getTime() <= cutoff.getTime()) {
        due.push(
          deepFreeze({
            recordId: cls.recordId,
            category: cls.category,
            policyId: cls.policyId,
            expiresAt: cls.expiresAt,
            overdueDays: daysBetween(cls.expiresAt, cutoff),
            archivalMethod: cls.archivalMethod,
          })
        );
      }
    }
    return Object.freeze(due);
  }

  /**
   * Preview what WOULD be archived without mutating any state. Returns a
   * frozen snapshot. `dryRun` MUST NOT call enforceArchive, MUST NOT emit
   * record:archived events, and MUST NOT touch the tombstone ledger.
   */
  dryRun(now, filter = {}) {
    const cutoff = this._now(now);
    const due = this.scanDue(cutoff, filter);
    const perMethod = { 'cold-storage': 0, pseudonymize: 0, tombstone: 0 };
    const perCategory = {};
    for (const d of due) {
      perMethod[d.archivalMethod] = (perMethod[d.archivalMethod] || 0) + 1;
      perCategory[d.category] = (perCategory[d.category] || 0) + 1;
    }
    return deepFreeze({
      asOf: isoDate(cutoff),
      totalDue: due.length,
      perMethod,
      perCategory,
      records: due,
      mutated: false,
      note_he: 'תצוגה מקדימה בלבד — לא בוצעה שום פעולה',
      note_en: 'Preview only — no mutation performed',
    });
  }

  // ─── enforcement ────────────────────────────────────────────────────────

  /**
   * Soft-archive a single record. Never hard-deletes. Emits the matching
   * event and, for `tombstone`, appends a ledger entry.
   */
  enforceArchive(recordId, opts = {}) {
    assertNonEmptyString('recordId', recordId);
    const cls = this._records.get(recordId);
    if (!cls) {
      throw new Error(`record ${recordId} is not classified`);
    }
    if (this._legalHolds.has(recordId)) {
      const err = new Error(
        `record ${recordId} is under legal hold — refusing to archive`
      );
      err.code = 'LEGAL_HOLD';
      throw err;
    }
    if (
      cls.status === RECORD_STATUS.ARCHIVED ||
      cls.status === RECORD_STATUS.TOMBSTONED ||
      cls.status === RECORD_STATUS.PSEUDONYMIZED
    ) {
      throw new Error(`record ${recordId} is already ${cls.status}`);
    }

    const method = opts.method || cls.archivalMethod;
    if (!ALL_METHODS.includes(method)) {
      throw new RangeError(`invalid archival method: ${method}`);
    }
    const approvedBy = opts.approvedBy || 'system';

    const ts = isoDate(this._now());
    const prevState = cls.status;
    let nextStatus;
    let eventName;
    let tombstoneEntry = null;

    switch (method) {
      case ARCHIVAL_METHOD.COLD_STORAGE:
        nextStatus = RECORD_STATUS.ARCHIVED;
        eventName = EVENTS.RECORD_ARCHIVED;
        break;
      case ARCHIVAL_METHOD.PSEUDONYMIZE:
        nextStatus = RECORD_STATUS.PSEUDONYMIZED;
        eventName = EVENTS.RECORD_PSEUDONYMIZED;
        break;
      case ARCHIVAL_METHOD.TOMBSTONE:
        nextStatus = RECORD_STATUS.TOMBSTONED;
        eventName = EVENTS.RECORD_TOMBSTONED;
        break;
      default:
        throw new RangeError(`invalid method: ${method}`);
    }

    const archive = deepFreeze({
      recordId,
      method,
      approvedBy,
      archivedAt: ts,
      prevState,
      policyId: cls.policyId,
      category: cls.category,
      pseudonymousTag: pseudonymize(recordId, this._salt),
      hardDeleted: false,
      coldStorageRef: randomId('cold'),
    });

    const nextCls = deepFreeze({ ...cls, status: nextStatus });
    this._records.set(recordId, nextCls);
    this._archives.set(recordId, archive);

    // if tombstone, also append to the ledger
    if (method === ARCHIVAL_METHOD.TOMBSTONE) {
      tombstoneEntry = this._appendTombstone(
        recordId,
        `archive via tombstone method: ${opts.reason || 'retention expiry'}`
      );
    }

    const audit = this._appendAudit(eventName, {
      recordId,
      method,
      approvedBy,
      category: cls.category,
      policyId: cls.policyId,
    });
    this.emit(eventName, { archive, auditSeq: audit.seq });

    return deepFreeze({
      ...archive,
      tombstoneSeq: tombstoneEntry ? tombstoneEntry.seq : null,
    });
  }

  /**
   * Archive a batch of records. All actions recorded in a single batch so
   * that `rollbackLastBatch()` can undo them atomically.
   */
  enforceBatch(records, opts = {}) {
    if (!Array.isArray(records)) {
      throw new TypeError('records must be an array');
    }
    const approvedBy = opts.approvedBy || 'system';
    const batchId = randomId('batch');
    const actions = [];
    const errors = [];
    for (const rec of records) {
      const recordId = typeof rec === 'string' ? rec : rec.recordId;
      const method =
        typeof rec === 'object' && rec !== null && rec.method
          ? rec.method
          : undefined;
      try {
        const prev = this._records.get(recordId);
        if (!prev) throw new Error(`record ${recordId} not classified`);
        const prevStatus = prev.status;
        const result = this.enforceArchive(recordId, { method, approvedBy });
        actions.push({
          recordId,
          method: result.method,
          prevStatus,
        });
      } catch (err) {
        errors.push({ recordId, error: err.message, code: err.code || null });
      }
    }
    const batch = deepFreeze({
      id: batchId,
      ts: isoDate(this._now()),
      approvedBy,
      actions: deepFreeze(actions.slice()),
      errors: deepFreeze(errors.slice()),
    });
    this._batches.push(batch);
    const audit = this._appendAudit(EVENTS.BATCH_ENFORCED, {
      batchId,
      count: actions.length,
      errorsCount: errors.length,
      approvedBy,
    });
    this.emit(EVENTS.BATCH_ENFORCED, { batch, auditSeq: audit.seq });
    return batch;
  }

  // ─── tombstone ledger ───────────────────────────────────────────────────

  _appendTombstone(recordId, reason) {
    const ts = isoDate(this._now());
    const cls = this._records.get(recordId) || null;
    const body = stableStringify({
      recordId,
      reason,
      ts,
      policyId: cls ? cls.policyId : null,
      category: cls ? cls.category : null,
    });
    const contentHash = sha256(body);
    const chainHash = sha256(this._tombstonePrev + '|' + contentHash);
    const entry = deepFreeze({
      seq: this._tombstoneLedger.length,
      recordId,
      pseudonymousTag: pseudonymize(recordId, this._salt),
      reason,
      ts,
      category: cls ? cls.category : null,
      policyId: cls ? cls.policyId : null,
      prevHash: this._tombstonePrev,
      contentHash,
      hash: chainHash,
      hardDeleted: false,
      note_he: 'אבן זיכרון בלבד — הרשומה לא נמחקה פיזית',
      note_en: 'Tombstone only — record was NOT hard-deleted',
    });
    this._tombstoneLedger.push(entry);
    this._tombstonePrev = chainHash;
    return entry;
  }

  /**
   * Append a tombstone entry on demand. Useful to mark records that are
   * obsolete without running the full archive pipeline. Equivalent to
   * `enforceArchive(id, { method: 'tombstone' })` except it does not
   * require that a classification exist.
   */
  exportTombstone(recordId, reason) {
    assertNonEmptyString('recordId', recordId);
    const entry = this._appendTombstone(
      recordId,
      reason || 'explicit exportTombstone'
    );
    const audit = this._appendAudit(EVENTS.RECORD_TOMBSTONED, {
      recordId,
      reason: entry.reason,
      seq: entry.seq,
    });
    this.emit(EVENTS.RECORD_TOMBSTONED, {
      tombstone: entry,
      auditSeq: audit.seq,
    });
    return entry;
  }

  tombstoneLedger() {
    return Object.freeze(this._tombstoneLedger.slice());
  }

  verifyTombstoneChain() {
    let prev = sha256('retention-enforcer-tombstone-genesis');
    for (let i = 0; i < this._tombstoneLedger.length; i++) {
      const e = this._tombstoneLedger[i];
      if (e.prevHash !== prev) {
        return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
      }
      const body = stableStringify({
        recordId: e.recordId,
        reason: e.reason,
        ts: e.ts,
        policyId: e.policyId,
        category: e.category,
      });
      const expectedContent = sha256(body);
      if (expectedContent !== e.contentHash) {
        return {
          valid: false,
          brokenAt: i,
          reason: 'contentHash mismatch',
        };
      }
      const expectedChain = sha256(prev + '|' + expectedContent);
      if (expectedChain !== e.hash) {
        return { valid: false, brokenAt: i, reason: 'hash mismatch' };
      }
      prev = e.hash;
    }
    return { valid: true, brokenAt: -1 };
  }

  // ─── restore ────────────────────────────────────────────────────────────

  /**
   * Un-archive a record with justification and a human approver. Only
   * possible for records in `archived` or `pseudonymized` state — tombstoned
   * records are NOT restorable (by design — tombstoning is the closest this
   * system gets to deletion, and we preserve the ledger forever).
   */
  restoreFromArchive(recordId, justification, approver) {
    assertNonEmptyString('recordId', recordId);
    assertNonEmptyString('justification', justification);
    assertNonEmptyString('approver', approver);
    const cls = this._records.get(recordId);
    if (!cls) throw new Error(`record ${recordId} is not classified`);
    if (
      cls.status !== RECORD_STATUS.ARCHIVED &&
      cls.status !== RECORD_STATUS.PSEUDONYMIZED
    ) {
      throw new Error(
        `record ${recordId} cannot be restored from state ${cls.status}`
      );
    }
    const archive = this._archives.get(recordId);
    const next = deepFreeze({ ...cls, status: RECORD_STATUS.RESTORED });
    this._records.set(recordId, next);

    const restore = deepFreeze({
      recordId,
      fromStatus: cls.status,
      toStatus: RECORD_STATUS.RESTORED,
      justification,
      approver,
      restoredAt: isoDate(this._now()),
      previousArchiveRef: archive ? archive.coldStorageRef : null,
    });

    const audit = this._appendAudit(EVENTS.RECORD_RESTORED, {
      recordId,
      justification,
      approver,
      fromStatus: cls.status,
    });
    this.emit(EVENTS.RECORD_RESTORED, { restore, auditSeq: audit.seq });
    return restore;
  }

  // ─── rollback ───────────────────────────────────────────────────────────

  /**
   * Undo the last enforcement batch: for each action, revert the record to
   * its previous status. The batch itself is marked as rolled back but not
   * removed from the history (append-only invariant).
   */
  rollbackLastBatch(opts = {}) {
    if (this._batches.length === 0) {
      throw new Error('no batch to rollback');
    }
    // find last non-rolledback batch
    let target = null;
    for (let i = this._batches.length - 1; i >= 0; i--) {
      if (!this._batches[i].rolledBack) {
        target = this._batches[i];
        break;
      }
    }
    if (!target) throw new Error('no batch to rollback');

    const approvedBy = opts.approvedBy || 'system';
    const reason = opts.reason || 'rollback requested';
    const reverted = [];
    for (const action of target.actions) {
      const cur = this._records.get(action.recordId);
      if (!cur) continue;
      const next = deepFreeze({ ...cur, status: action.prevStatus });
      this._records.set(action.recordId, next);
      // the archive record is KEPT (append-only) but status is reverted
      reverted.push({
        recordId: action.recordId,
        revertedTo: action.prevStatus,
      });
    }
    // mark the batch — need to replace since it is frozen
    const idx = this._batches.indexOf(target);
    const replaced = deepFreeze({
      ...target,
      rolledBack: true,
      rolledBackAt: isoDate(this._now()),
      rolledBackBy: approvedBy,
      rollbackReason: reason,
    });
    this._batches[idx] = replaced;

    const audit = this._appendAudit(EVENTS.BATCH_ROLLEDBACK, {
      batchId: target.id,
      count: reverted.length,
      approvedBy,
      reason,
    });
    this.emit(EVENTS.BATCH_ROLLEDBACK, {
      batchId: target.id,
      reverted,
      auditSeq: audit.seq,
    });

    return deepFreeze({
      batchId: target.id,
      reverted: Object.freeze(reverted.slice()),
      approvedBy,
      reason,
    });
  }

  listBatches() {
    return Object.freeze(this._batches.slice());
  }

  // ─── reporting ──────────────────────────────────────────────────────────

  /**
   * Generate a bilingual compliance report for a time period.
   *
   * @param {object} period
   * @param {Date|string} period.from
   * @param {Date|string} period.to
   */
  auditReport(period) {
    if (!period || typeof period !== 'object') {
      throw new TypeError('period must be an object with from/to');
    }
    const from = toDate(period.from).getTime();
    const to = toDate(period.to).getTime();
    if (!(from <= to)) {
      throw new RangeError('period.from must be <= period.to');
    }

    const countsByCategory = {};
    const countsByMethod = {
      'cold-storage': 0,
      pseudonymize: 0,
      tombstone: 0,
    };
    let archived = 0;
    let restored = 0;
    let holdsPlaced = 0;
    let holdsReleased = 0;
    let policiesDefined = 0;
    let classified = 0;
    let batchesEnforced = 0;
    let batchesRolledBack = 0;

    for (const e of this._auditChain) {
      const t = toDate(e.ts).getTime();
      if (t < from || t > to) continue;
      switch (e.type) {
        case EVENTS.POLICY_DEFINED:
          policiesDefined++;
          break;
        case EVENTS.RECORD_CLASSIFIED:
          classified++;
          break;
        case EVENTS.RECORD_ARCHIVED:
          archived++;
          countsByMethod['cold-storage']++;
          countsByCategory[e.payload.category] =
            (countsByCategory[e.payload.category] || 0) + 1;
          break;
        case EVENTS.RECORD_PSEUDONYMIZED:
          archived++;
          countsByMethod.pseudonymize++;
          countsByCategory[e.payload.category] =
            (countsByCategory[e.payload.category] || 0) + 1;
          break;
        case EVENTS.RECORD_TOMBSTONED:
          archived++;
          countsByMethod.tombstone++;
          if (e.payload.category) {
            countsByCategory[e.payload.category] =
              (countsByCategory[e.payload.category] || 0) + 1;
          }
          break;
        case EVENTS.RECORD_RESTORED:
          restored++;
          break;
        case EVENTS.HOLD_PLACED:
          holdsPlaced++;
          break;
        case EVENTS.HOLD_RELEASED:
          holdsReleased++;
          break;
        case EVENTS.BATCH_ENFORCED:
          batchesEnforced++;
          break;
        case EVENTS.BATCH_ROLLEDBACK:
          batchesRolledBack++;
          break;
      }
    }

    const chainOk =
      this.verifyAuditChain().valid && this.verifyTombstoneChain().valid;

    return deepFreeze({
      period: {
        from: isoDate(period.from),
        to: isoDate(period.to),
      },
      generatedAt: isoDate(this._now()),
      invariant_he: 'לא מוחקים — רק משדרגים ומגדלים',
      invariant_en: 'No hard delete — we only upgrade and grow',
      totals: {
        policiesDefined,
        classified,
        archived,
        restored,
        holdsPlaced,
        holdsReleased,
        batchesEnforced,
        batchesRolledBack,
      },
      countsByCategory,
      countsByMethod,
      tombstoneLedgerSize: this._tombstoneLedger.length,
      auditChainSize: this._auditChain.length,
      chainIntegrity: chainOk,
      he: {
        title: 'דו״ח ציות — אוכף מדיניות שימור',
        subtitle: 'Techno-Kol Uzi mega-ERP — Agent Y-137',
        summary:
          `בתקופה המדוברת הועברו ${archived} רשומות לאחסון קר, ` +
          `${restored} שוחזרו, ${holdsPlaced} הושמו בהקפאה משפטית.`,
        note: 'שום רשומה לא נמחקה פיזית. כל הפעולות נרשמו בשרשרת ציות.',
      },
      en: {
        title: 'Compliance Report — Retention Enforcer',
        subtitle: 'Techno-Kol Uzi mega-ERP — Agent Y-137',
        summary:
          `In the reported period ${archived} records were moved to cold ` +
          `storage, ${restored} were restored, ${holdsPlaced} legal holds ` +
          `were placed.`,
        note: 'No record was hard-deleted. All actions are in the chained audit log.',
      },
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Exports
// ───────────────────────────────────────────────────────────────────────────

module.exports = {
  RetentionEnforcer,
  ARCHIVAL_METHOD,
  RECORD_STATUS,
  EVENTS,
  DEFAULT_CATEGORIES,
  // helpers exported for tests only
  __test__: {
    sha256,
    stableStringify,
    pseudonymize,
    addDays,
    daysBetween,
  },
};
