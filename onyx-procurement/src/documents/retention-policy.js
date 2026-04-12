/**
 * Document Retention Policy Engine — Israeli Legal Retention Periods
 * Agent Y-114 • Techno-Kol Uzi • Kobi's Mega-ERP • 2026
 *
 * Implements statutory document-retention governance for an Israeli
 * enterprise (tax, accounting, payroll, HR, medical, real-estate,
 * permits, legal proceedings). Builds a disposal queue that is
 * ALWAYS gated by explicit human approval and defaults to ARCHIVE,
 * never DELETE.
 *
 * Rule of the house: "לא מוחקים רק משדרגים ומגדלים".
 * This module NEVER auto-deletes. Every destructive action requires
 * an explicit approver identity and is written as an append-only
 * compliance event; the underlying document is NEVER physically
 * removed from the store by this engine. "Deletion" — if ever
 * invoked — is recorded as an event the operator must execute in
 * a separate, audited runbook; the engine itself only marks intent.
 *
 * Israeli legal basis (primary citations used by the engine):
 *   - פקודת מס הכנסה [נוסח חדש], תשכ"א-1961 + תקנות מס הכנסה (ניהול
 *     פנקסי חשבונות), התשל"ג-1973 — 7 years for tax + accounting
 *     books ("סעיף 25" / "תקנה 25").
 *   - חוק החברות, תשנ"ט-1999 — corporate records.
 *   - חוק הגנת השכר, התשי"ח-1958 + חוק שעות עבודה ומנוחה,
 *     התשי"א-1951 — 7 years for payroll & time records.
 *   - חוק הודעה לעובד, התשס"ב-2002 — personnel files kept 7 years
 *     after termination.
 *   - חוק זכויות החולה, התשנ"ו-1996 + תקנות בריאות העם — medical
 *     records 20 years (certain diagnostic records longer).
 *   - חוק התכנון והבנייה, התשכ"ה-1965 — building-permit files
 *     retained permanently by local authority; parallel copy kept
 *     permanently in the enterprise archive.
 *   - חוק המקרקעין, התשכ"ט-1969 — Tabu / Land Registry records are
 *     permanent by statute.
 *   - תקנות סדר הדין האזרחי — legal-proceedings files retained
 *     permanently (limitation periods + post-judgment enforcement).
 *   - חוק הגנת הפרטיות, התשמ"א-1981 — governs retention / anonymisation
 *     of personal data; the engine anonymises rather than deletes.
 *
 * Integration notes:
 *   - `legalHold(docId, reason, expiry)` pauses disposal regardless of
 *     retention expiry; it is designed to integrate with the Y-115
 *     legal-hold registry — any hold registered externally can be
 *     mirrored here via `legalHold`, and `applyPolicy` will honour it.
 *   - `archiveDocument(docId)` and `anonymizeDocument(docId)` both keep
 *     the document in the store; they only transition its lifecycle
 *     flags — no records are removed.
 *
 * Zero dependencies. Pure Node.js. Bilingual throughout.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Lifecycle states a document can be in. Append-only transitions. */
const DOC_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING_DISPOSAL: 'pending_disposal',
  ARCHIVED: 'archived',
  ANONYMIZED: 'anonymized',
  LEGAL_HOLD: 'legal_hold',
  DISPOSED: 'disposed', // marker only — the engine never physically deletes
});

/** Disposal modes the policy engine recognizes. Default: 'archive'. */
const DISPOSAL_MODES = Object.freeze(['delete', 'archive', 'anonymize']);

/** Disposal-queue entry states. Append-only transitions. */
const QUEUE_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  HELD: 'held',
});

/**
 * Israeli statutory retention classes (2026).
 * Each class specifies: retention period (years), disposal mode,
 * and the trigger event that starts the retention clock.
 *
 * `holdOverride:true` means the class is permanent by statute —
 * it can never be scheduled for disposal regardless of age.
 */
const ISRAELI_RETENTION_CLASSES = Object.freeze({
  tax_records: {
    key: 'tax_records',
    label_he: 'מסמכי מס',
    label_en: 'Tax records',
    retentionYears: 7,
    lawReference: 'פקודת מס הכנסה [נוסח חדש], תשכ"א-1961 + תקנות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973',
    disposal: 'archive',
    triggerEvent: 'fiscalYearEnd',
    holdOverride: false,
  },
  accounting_books: {
    key: 'accounting_books',
    label_he: 'פנקסי חשבונות',
    label_en: 'Accounting books',
    retentionYears: 7,
    lawReference: 'תקנות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973, תקנה 25',
    disposal: 'archive',
    triggerEvent: 'fiscalYearEnd',
    holdOverride: false,
  },
  payroll_records: {
    key: 'payroll_records',
    label_he: 'רשומות שכר',
    label_en: 'Payroll records',
    retentionYears: 7,
    lawReference: 'חוק הגנת השכר, התשי"ח-1958 + חוק שעות עבודה ומנוחה, התשי"א-1951',
    disposal: 'archive',
    triggerEvent: 'payPeriodEnd',
    holdOverride: false,
  },
  personnel_files: {
    key: 'personnel_files',
    label_he: 'תיקי עובדים',
    label_en: 'Personnel files',
    retentionYears: 7,
    lawReference: 'חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002 + חוק שוויון ההזדמנויות בעבודה',
    disposal: 'anonymize', // personal data — prefer anonymize over delete
    triggerEvent: 'terminationDate',
    holdOverride: false,
  },
  contracts: {
    key: 'contracts',
    label_he: 'חוזים',
    label_en: 'Contracts',
    retentionYears: 7,
    lawReference: 'חוק החוזים (חלק כללי), התשל"ג-1973 + תקנות מס הכנסה',
    disposal: 'archive',
    triggerEvent: 'contractExpiry',
    holdOverride: false,
  },
  medical_records: {
    key: 'medical_records',
    label_he: 'רשומות רפואיות',
    label_en: 'Medical records',
    retentionYears: 20,
    lawReference: 'חוק זכויות החולה, התשנ"ו-1996 + תקנות בריאות העם + המוסד לביטוח לאומי',
    disposal: 'anonymize',
    triggerEvent: 'caseClosed',
    holdOverride: false,
  },
  building_permits: {
    key: 'building_permits',
    label_he: 'היתרי בנייה',
    label_en: 'Building permits',
    retentionYears: null,
    lawReference: 'חוק התכנון והבנייה, התשכ"ה-1965',
    disposal: 'archive',
    triggerEvent: 'permitIssued',
    holdOverride: true, // permanent
  },
  tabu_documents: {
    key: 'tabu_documents',
    label_he: 'מסמכי טאבו (רישום מקרקעין)',
    label_en: 'Tabu / Land Registry documents',
    retentionYears: null,
    lawReference: 'חוק המקרקעין, התשכ"ט-1969',
    disposal: 'archive',
    triggerEvent: 'recorded',
    holdOverride: true, // permanent
  },
  legal_proceedings: {
    key: 'legal_proceedings',
    label_he: 'הליכים משפטיים',
    label_en: 'Legal proceedings',
    retentionYears: null,
    lawReference: 'תקנות סדר הדין האזרחי + חוק ההתיישנות, התשי"ח-1958',
    disposal: 'archive',
    triggerEvent: 'caseClosed',
    holdOverride: true, // permanent
  },
});

/**
 * Heuristic lookup table used by `classify()` to derive a retention
 * class from a document's `docType` string (or, as a fallback,
 * keywords in the filename / title / tags).
 *
 * Matching is case-insensitive, accent-insensitive, and works in
 * Hebrew or English. A document can be explicitly tagged with
 * `{ retentionClass: '<key>' }` to bypass heuristics entirely.
 */
const DOC_TYPE_MATCHERS = Object.freeze([
  {
    class: 'tax_records',
    keys: [
      'tax', 'vat', 'מס', 'מע"מ', 'מעמ', 'income-tax', 'withholding',
      'form126', 'form102', 'form1301', 'form6111', 'ניכויים', 'מס-הכנסה',
    ],
  },
  {
    class: 'accounting_books',
    keys: [
      'ledger', 'journal', 'trial-balance', 'balance-sheet', 'pnl',
      'gl', 'accounting', 'פנקס', 'חשבון', 'חשבונאות', 'מאזן', 'יומן',
    ],
  },
  {
    class: 'payroll_records',
    keys: [
      'payroll', 'payslip', 'salary', 'wage', 'timesheet',
      'שכר', 'תלוש', 'שעות-עבודה', 'משכורת',
    ],
  },
  {
    class: 'personnel_files',
    keys: [
      'personnel', 'employee', 'hr-file', 'performance-review',
      'תיק-עובד', 'עובדים', 'משאבי-אנוש', 'משוב', 'כא',
    ],
  },
  {
    class: 'contracts',
    keys: [
      'contract', 'agreement', 'nda', 'mou', 'lease', 'חוזה', 'הסכם',
      'תקנון', 'סודיות', 'שכירות',
    ],
  },
  {
    class: 'medical_records',
    keys: [
      'medical', 'health', 'diagnosis', 'clinic', 'רפואי', 'רפואה',
      'בריאות', 'אבחון', 'מרפאה', 'תלונה-רפואית',
    ],
  },
  {
    class: 'building_permits',
    keys: [
      'building-permit', 'permit', 'heter', 'היתר', 'היתר-בנייה',
      'רישוי-בנייה', 'תכנון-ובנייה',
    ],
  },
  {
    class: 'tabu_documents',
    keys: [
      'tabu', 'land-registry', 'deed', 'טאבו', 'נסח', 'נסח-טאבו',
      'רישום-מקרקעין', 'מקרקעין', 'גוש-חלקה',
    ],
  },
  {
    class: 'legal_proceedings',
    keys: [
      'lawsuit', 'litigation', 'court', 'judgment', 'claim',
      'משפט', 'תביעה', 'בית-משפט', 'פסק-דין', 'הליך-משפטי',
    ],
  },
]);

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Deep-freeze helper for exported constants (nested arrays/objects). */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}
deepFreeze(ISRAELI_RETENTION_CLASSES);
deepFreeze(DOC_TYPE_MATCHERS);

/** Structured clone fallback (Node 16 compat). */
function clone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/** Normalize a string for matching (case-fold + strip nikud + collapse whitespace). */
function normalize(str) {
  if (str === null || str === undefined) return '';
  let s = String(str).toLowerCase().trim();
  // Strip Hebrew nikud (U+0591..U+05C7)
  s = s.replace(/[\u0591-\u05C7]/g, '');
  // Unify separators for keyword matching
  s = s.replace(/[\s\-_./\\]+/g, '-');
  return s;
}

/** ISO-date parser that tolerates undefined / missing values. */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Add whole years to a Date, preserving month+day where possible. */
function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/** Compare ISO dates lexicographically (works because ISO-8601 is sortable). */
function iso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/** Validate that a given disposal mode is allowed. */
function assertDisposalMode(mode) {
  if (!DISPOSAL_MODES.includes(mode)) {
    throw new Error(
      `retention-policy: invalid disposal mode "${mode}". Allowed: ${DISPOSAL_MODES.join(', ')}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// RETENTION POLICY CLASS
// ═══════════════════════════════════════════════════════════════

class RetentionPolicy {
  /**
   * @param {object} [options]
   * @param {() => Date} [options.now]       - injectable clock (for tests)
   * @param {object[]}   [options.documents] - preloaded document objects
   * @param {boolean}    [options.strict]    - throw on missing classification
   */
  constructor(options = {}) {
    const { now = () => new Date(), documents = [], strict = false } = options;
    this._now = now;
    this._strict = !!strict;

    /** @type {Map<string, object>} */
    this._documents = new Map();

    /** @type {Map<string, object>} Custom (overridden) retention definitions */
    this._customClasses = new Map();

    /** @type {object[]} Disposal queue — append-only; never filtered out */
    this._queue = [];

    /** @type {object[]} Compliance event log — append-only audit trail */
    this._events = [];

    /** @type {Map<string, object>} Active legal holds keyed by docId */
    this._legalHolds = new Map();

    /**
     * External Y-115 legal-hold resolver. Optional callable:
     *   (docId) => { onHold: boolean, reason?, expiry?, registryId? }
     * If supplied, `applyPolicy` consults it before scheduling disposal.
     */
    this._y115Resolver = options.y115Resolver || null;

    for (const doc of documents) this.ingestDocument(doc);

    this._log('policy_initialized', {
      classCount: Object.keys(ISRAELI_RETENTION_CLASSES).length,
      strict: this._strict,
    });
  }

  // ─── Document ingestion ────────────────────────────────────

  /**
   * Add or update a document in the store. Updates are append-only in
   * spirit: the existing record is merged (never removed) and an event
   * is logged. To replace content, ingest a new document with a new id.
   */
  ingestDocument(doc) {
    if (!doc || typeof doc !== 'object') {
      throw new Error('retention-policy: ingestDocument requires an object');
    }
    if (!doc.id) {
      throw new Error('retention-policy: document is missing required "id"');
    }
    const existing = this._documents.get(doc.id);
    const merged = {
      status: DOC_STATUS.ACTIVE,
      ...clone(existing || {}),
      ...clone(doc),
      updatedAt: iso(this._now()),
    };
    if (!merged.createdAt) merged.createdAt = iso(this._now());
    this._documents.set(doc.id, merged);
    this._log(existing ? 'document_updated' : 'document_ingested', { docId: doc.id });
    return clone(merged);
  }

  /** Return a cloned document record (or undefined). */
  getDocument(docId) {
    const d = this._documents.get(docId);
    return d ? clone(d) : undefined;
  }

  /** Return all documents (clones). */
  listDocuments() {
    return Array.from(this._documents.values()).map(clone);
  }

  // ─── 1. defineRetention ─────────────────────────────────────

  /**
   * Override or supplement a retention class. Never removes the seeded
   * class — only overrides it by key.
   *
   * @param {object} spec
   * @param {string} spec.docType       - retention class key
   * @param {number|null} [spec.retentionYears]
   * @param {string} [spec.lawReference]
   * @param {'delete'|'archive'|'anonymize'} [spec.disposal]
   * @param {boolean} [spec.holdOverride]
   * @returns {object} frozen clone of the resulting class
   */
  defineRetention(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('retention-policy: defineRetention requires an object');
    }
    const { docType, retentionYears, lawReference, disposal, holdOverride } = spec;
    if (!docType) throw new Error('retention-policy: defineRetention needs "docType"');
    if (disposal !== undefined) assertDisposalMode(disposal);

    const base =
      ISRAELI_RETENTION_CLASSES[docType] ||
      this._customClasses.get(docType) || {
        key: docType,
        label_he: docType,
        label_en: docType,
        retentionYears: null,
        lawReference: '',
        disposal: 'archive',
        triggerEvent: 'createdAt',
        holdOverride: false,
      };

    const merged = {
      ...base,
      ...(retentionYears !== undefined ? { retentionYears } : {}),
      ...(lawReference !== undefined ? { lawReference } : {}),
      ...(disposal !== undefined ? { disposal } : {}),
      ...(holdOverride !== undefined ? { holdOverride: !!holdOverride } : {}),
    };
    // SAFETY: default disposal is never "delete" silently — must be explicit
    if (merged.disposal === undefined) merged.disposal = 'archive';

    this._customClasses.set(docType, Object.freeze(merged));
    this._log('retention_defined', { docType, disposal: merged.disposal });
    return clone(merged);
  }

  /** Return the effective class definition for a key (custom override wins). */
  getRetentionClass(key) {
    if (this._customClasses.has(key)) return clone(this._customClasses.get(key));
    if (ISRAELI_RETENTION_CLASSES[key]) return clone(ISRAELI_RETENTION_CLASSES[key]);
    return undefined;
  }

  /** All known retention classes (seeded + custom overrides). */
  listRetentionClasses() {
    const out = {};
    for (const [k, v] of Object.entries(ISRAELI_RETENTION_CLASSES)) out[k] = clone(v);
    for (const [k, v] of this._customClasses.entries()) out[k] = clone(v);
    return out;
  }

  // ─── 2. classify ─────────────────────────────────────────────

  /**
   * Assign a retention class to a document. Uses an explicit
   * `doc.retentionClass` if present; otherwise runs a keyword-based
   * matcher over `docType`, `title`, `title_he`, `filename`, and `tags`.
   *
   * Returns the class record (frozen clone). In non-strict mode,
   * unknown docs are classified as 'contracts' (the closest generic
   * Israeli 7-year default). In strict mode, unknown docs throw.
   */
  classify(doc) {
    if (!doc || typeof doc !== 'object') {
      throw new Error('retention-policy: classify requires an object');
    }
    // Explicit tag wins.
    if (doc.retentionClass && this.getRetentionClass(doc.retentionClass)) {
      return this.getRetentionClass(doc.retentionClass);
    }

    const haystack = normalize(
      [
        doc.docType,
        doc.type,
        doc.category,
        doc.title,
        doc.title_he,
        doc.title_en,
        doc.filename,
        Array.isArray(doc.tags) ? doc.tags.join(' ') : doc.tags,
      ]
        .filter(Boolean)
        .join(' ')
    );

    for (const matcher of DOC_TYPE_MATCHERS) {
      for (const key of matcher.keys) {
        if (haystack.includes(normalize(key))) {
          return this.getRetentionClass(matcher.class);
        }
      }
    }

    if (this._strict) {
      throw new Error(
        `retention-policy: unable to classify document "${doc.id}" (docType="${doc.docType}")`
      );
    }
    // Safe default — generic 7-year "contracts" class
    return this.getRetentionClass('contracts');
  }

  // ─── 3. applyPolicy ──────────────────────────────────────────

  /**
   * Walk every document, determine eligibility for disposal, and
   * append queue entries for those that are eligible. NEVER deletes.
   *
   * Returns a summary object:
   *   { scanned, queued, held, skipped, permanent }
   */
  applyPolicy() {
    const now = this._now();
    let scanned = 0;
    let queued = 0;
    let held = 0;
    let skipped = 0;
    let permanent = 0;

    for (const doc of this._documents.values()) {
      scanned += 1;

      // Already disposed / archived? Skip — never re-queue.
      if (
        doc.status === DOC_STATUS.ARCHIVED ||
        doc.status === DOC_STATUS.ANONYMIZED ||
        doc.status === DOC_STATUS.DISPOSED ||
        doc.status === DOC_STATUS.PENDING_DISPOSAL
      ) {
        skipped += 1;
        continue;
      }

      const klass = this.classify(doc);
      if (!klass) {
        skipped += 1;
        continue;
      }

      // Permanent records — never eligible for disposal
      if (klass.holdOverride === true || klass.retentionYears === null) {
        permanent += 1;
        continue;
      }

      // Legal hold (internal)
      if (this._legalHolds.has(doc.id)) {
        held += 1;
        continue;
      }
      // Legal hold (external Y-115 registry)
      if (this._y115Resolver) {
        try {
          const ext = this._y115Resolver(doc.id);
          if (ext && ext.onHold) {
            held += 1;
            continue;
          }
        } catch (err) {
          // Safety default: if the external resolver throws, assume hold.
          this._log('y115_resolver_error', { docId: doc.id, error: String(err.message || err) });
          held += 1;
          continue;
        }
      }

      // Compute eligibility date from the trigger event field.
      const triggerIso =
        doc[klass.triggerEvent] ||
        doc.triggerDate ||
        doc.createdAt ||
        doc.date;
      const triggerDate = toDate(triggerIso);
      if (!triggerDate) {
        // Unknown trigger — cannot safely schedule disposal; skip.
        skipped += 1;
        continue;
      }
      const eligibleDate = addYears(triggerDate, klass.retentionYears);
      if (eligibleDate > now) {
        continue; // not yet eligible
      }

      // ─ eligible → append to queue (default disposal = 'archive')
      const entry = {
        queueId: `q-${doc.id}-${iso(now)}`,
        docId: doc.id,
        retentionClass: klass.key,
        classification: {
          label_he: klass.label_he,
          label_en: klass.label_en,
          lawReference: klass.lawReference,
        },
        disposal: klass.disposal || 'archive', // SAFE DEFAULT
        triggerEvent: klass.triggerEvent,
        triggerDate: iso(triggerDate),
        eligibleDate: iso(eligibleDate),
        queuedAt: iso(now),
        status: QUEUE_STATUS.PENDING,
        approver: null,
        approvedAt: null,
        executedAt: null,
        reason: null,
      };
      this._queue.push(entry);
      doc.status = DOC_STATUS.PENDING_DISPOSAL;
      doc.updatedAt = iso(now);
      this._log('queued_for_disposal', {
        docId: doc.id,
        disposal: entry.disposal,
        retentionClass: klass.key,
      });
      queued += 1;
    }

    return { scanned, queued, held, skipped, permanent };
  }

  // ─── 4. disposalQueue ────────────────────────────────────────

  /**
   * Return the disposal queue. By default returns only `pending`
   * entries (items awaiting human approval). Pass `{status:'all'}`
   * to retrieve the entire append-only history.
   */
  disposalQueue(filter = {}) {
    const { status = QUEUE_STATUS.PENDING } = filter;
    if (status === 'all') return this._queue.map(clone);
    return this._queue.filter((q) => q.status === status).map(clone);
  }

  // ─── 5. approveDisposal ──────────────────────────────────────

  /**
   * Record human approval for a queued disposal. NEVER auto-deletes —
   * approval only flips the queue entry to `approved` and then invokes
   * the configured disposal routine (archive / anonymize / delete-marker).
   *
   * "delete" in this engine is a *marker only* — the underlying document
   * record is NOT physically removed from the store. Physical removal is
   * always a separate, human-executed runbook step.
   *
   * @param {string} docId
   * @param {string|object} approver - identity string or `{id, name, role}`
   * @param {object} [opts]
   * @param {string} [opts.reason]
   * @returns {object} the updated queue entry (clone)
   */
  approveDisposal(docId, approver, opts = {}) {
    if (!docId) throw new Error('retention-policy: approveDisposal requires docId');
    if (!approver) {
      throw new Error('retention-policy: approveDisposal REQUIRES an approver (never auto-delete)');
    }

    // Block if under legal hold
    if (this._legalHolds.has(docId)) {
      throw new Error(
        `retention-policy: document "${docId}" is under LEGAL HOLD — approval refused`
      );
    }

    const entry = this._queue
      .filter((q) => q.docId === docId && q.status === QUEUE_STATUS.PENDING)
      .pop();
    if (!entry) {
      throw new Error(`retention-policy: no pending disposal queued for "${docId}"`);
    }

    // Defensive: if for any reason disposal is unset, fall back to 'archive'
    if (!DISPOSAL_MODES.includes(entry.disposal)) entry.disposal = 'archive';

    entry.status = QUEUE_STATUS.APPROVED;
    entry.approver =
      typeof approver === 'string' ? { id: approver } : clone(approver);
    entry.approvedAt = iso(this._now());
    entry.reason = opts.reason || entry.reason;

    this._log('disposal_approved', {
      docId,
      approver: entry.approver,
      disposal: entry.disposal,
    });

    // Execute disposal according to the mode. Never physically delete.
    switch (entry.disposal) {
      case 'archive':
        this.archiveDocument(docId, { queueId: entry.queueId });
        break;
      case 'anonymize':
        this.anonymizeDocument(docId, { queueId: entry.queueId });
        break;
      case 'delete':
        // Mark-only — the engine still retains the document.
        this._markDisposed(docId, entry);
        break;
      default:
        // Fall back to archive — never physically delete
        this.archiveDocument(docId, { queueId: entry.queueId });
    }

    entry.status = QUEUE_STATUS.EXECUTED;
    entry.executedAt = iso(this._now());
    return clone(entry);
  }

  /** Reject a pending disposal (e.g. human override says "keep"). */
  rejectDisposal(docId, reviewer, reason) {
    if (!docId) throw new Error('retention-policy: rejectDisposal requires docId');
    if (!reviewer) throw new Error('retention-policy: rejectDisposal requires reviewer');
    const entry = this._queue
      .filter((q) => q.docId === docId && q.status === QUEUE_STATUS.PENDING)
      .pop();
    if (!entry) throw new Error(`retention-policy: no pending disposal for "${docId}"`);
    entry.status = QUEUE_STATUS.REJECTED;
    entry.approver =
      typeof reviewer === 'string' ? { id: reviewer } : clone(reviewer);
    entry.approvedAt = iso(this._now());
    entry.reason = reason || 'rejected by reviewer';
    // Return the document to ACTIVE so it is re-evaluated next cycle.
    const doc = this._documents.get(docId);
    if (doc && doc.status === DOC_STATUS.PENDING_DISPOSAL) {
      doc.status = DOC_STATUS.ACTIVE;
      doc.updatedAt = iso(this._now());
    }
    this._log('disposal_rejected', { docId, reviewer: entry.approver, reason: entry.reason });
    return clone(entry);
  }

  // ─── 6. archiveDocument ──────────────────────────────────────

  /**
   * Move a document to cold storage. The record is NEVER removed;
   * its status transitions to ARCHIVED and an archive event is logged.
   */
  archiveDocument(docId, meta = {}) {
    const doc = this._documents.get(docId);
    if (!doc) throw new Error(`retention-policy: document "${docId}" not found`);
    doc.status = DOC_STATUS.ARCHIVED;
    doc.archivedAt = iso(this._now());
    doc.archiveMeta = { ...(doc.archiveMeta || {}), ...clone(meta) };
    doc.updatedAt = doc.archivedAt;
    this._log('document_archived', { docId, meta });
    return clone(doc);
  }

  // ─── 7. anonymizeDocument ───────────────────────────────────

  /**
   * Strip personally-identifiable fields from a document while
   * retaining the rest for analytics. The record is NEVER removed;
   * its status transitions to ANONYMIZED.
   *
   * Stripped fields (by default): `personName`, `idNumber`, `teudatZehut`,
   * `email`, `phone`, `address`, `birthdate`, `bankAccount`, `iban`.
   * Custom fields can be supplied in `meta.piiFields`.
   */
  anonymizeDocument(docId, meta = {}) {
    const doc = this._documents.get(docId);
    if (!doc) throw new Error(`retention-policy: document "${docId}" not found`);
    const piiFields =
      Array.isArray(meta.piiFields) && meta.piiFields.length
        ? meta.piiFields
        : [
          'personName',
          'fullName',
          'name',
          'idNumber',
          'teudatZehut',
          'email',
          'phone',
          'address',
          'birthdate',
          'bankAccount',
          'iban',
        ];
    doc.piiRemoved = doc.piiRemoved || [];
    for (const field of piiFields) {
      if (Object.prototype.hasOwnProperty.call(doc, field) && doc[field] !== undefined) {
        // Replace with a deterministic placeholder rather than removing the key
        doc[field] = '[ANONYMIZED]';
        if (!doc.piiRemoved.includes(field)) doc.piiRemoved.push(field);
      }
    }
    doc.status = DOC_STATUS.ANONYMIZED;
    doc.anonymizedAt = iso(this._now());
    doc.updatedAt = doc.anonymizedAt;
    this._log('document_anonymized', { docId, piiFields: doc.piiRemoved });
    return clone(doc);
  }

  /**
   * Mark a document as DISPOSED (intent only — physical deletion is
   * always a separate human-executed runbook). The document record
   * remains in the store with its lifecycle set to DISPOSED and a
   * full audit trail of who approved it and why.
   */
  _markDisposed(docId, queueEntry) {
    const doc = this._documents.get(docId);
    if (!doc) throw new Error(`retention-policy: document "${docId}" not found`);
    doc.status = DOC_STATUS.DISPOSED;
    doc.disposedAt = iso(this._now());
    doc.disposedMarker = true;
    doc.disposedBy = queueEntry ? clone(queueEntry.approver) : null;
    doc.disposalReason = queueEntry ? queueEntry.reason : null;
    doc.updatedAt = doc.disposedAt;
    this._log('document_dispose_marked', {
      docId,
      note: 'marker only — physical deletion NOT performed by engine',
      approver: doc.disposedBy,
    });
    return clone(doc);
  }

  // ─── 8. legalHold ────────────────────────────────────────────

  /**
   * Place a legal hold on a document. A hold pauses all disposal
   * activity regardless of retention expiry. Holds integrate with
   * Y-115: an external resolver passed to the constructor will also
   * be consulted by `applyPolicy`.
   *
   * @param {string} docId
   * @param {string} reason        - human-readable justification
   * @param {string|Date} [expiry] - optional ISO date when the hold lifts
   * @returns {object} the hold record (clone)
   */
  legalHold(docId, reason, expiry) {
    if (!docId) throw new Error('retention-policy: legalHold requires docId');
    if (!reason) throw new Error('retention-policy: legalHold requires reason');
    const doc = this._documents.get(docId);
    // We allow holds on unknown documents (they may be ingested later),
    // but we still record them so `applyPolicy` honours them.
    const hold = {
      docId,
      reason,
      expiry: expiry ? iso(expiry) : null,
      placedAt: iso(this._now()),
      status: 'active',
      y115: true, // tag as integrated hold
    };
    this._legalHolds.set(docId, hold);
    if (doc) {
      doc.legalHold = clone(hold);
      doc.status = DOC_STATUS.LEGAL_HOLD;
      doc.updatedAt = iso(this._now());
    }
    // Flip any already-pending queue entries to HELD
    for (const q of this._queue) {
      if (q.docId === docId && q.status === QUEUE_STATUS.PENDING) {
        q.status = QUEUE_STATUS.HELD;
        q.reason = `legal hold: ${reason}`;
      }
    }
    this._log('legal_hold_placed', { docId, reason, expiry: hold.expiry });
    return clone(hold);
  }

  /** Release a previously placed legal hold (append-only — records history). */
  releaseLegalHold(docId, releaser, note) {
    if (!this._legalHolds.has(docId)) {
      throw new Error(`retention-policy: no legal hold exists for "${docId}"`);
    }
    const hold = this._legalHolds.get(docId);
    hold.status = 'released';
    hold.releasedAt = iso(this._now());
    hold.releaser = releaser || null;
    hold.releaseNote = note || null;
    this._legalHolds.delete(docId);
    const doc = this._documents.get(docId);
    if (doc && doc.status === DOC_STATUS.LEGAL_HOLD) {
      doc.status = DOC_STATUS.ACTIVE;
      doc.updatedAt = iso(this._now());
    }
    this._log('legal_hold_released', { docId, releaser, note });
    return clone(hold);
  }

  /** List all active legal holds (clones). */
  listLegalHolds() {
    return Array.from(this._legalHolds.values()).map(clone);
  }

  // ─── 9. complianceReport ─────────────────────────────────────

  /**
   * Build an audit-ready compliance report for a period.
   *
   * @param {object} period
   * @param {string|Date} [period.from]
   * @param {string|Date} [period.to]
   * @returns {object} report — counts, queue breakdown, events, classes
   */
  complianceReport(period = {}) {
    const from = toDate(period.from) || new Date('1970-01-01T00:00:00Z');
    const to = toDate(period.to) || this._now();
    const inRange = (d) => {
      const t = toDate(d);
      return t && t >= from && t <= to;
    };

    const queueInRange = this._queue.filter((q) => inRange(q.queuedAt));
    const eventsInRange = this._events.filter((e) => inRange(e.at));

    const byStatus = {};
    for (const s of Object.values(QUEUE_STATUS)) byStatus[s] = 0;
    for (const q of queueInRange) byStatus[q.status] = (byStatus[q.status] || 0) + 1;

    const byClass = {};
    for (const q of queueInRange) {
      byClass[q.retentionClass] = (byClass[q.retentionClass] || 0) + 1;
    }

    const byDisposal = { archive: 0, anonymize: 0, delete: 0 };
    for (const q of queueInRange) byDisposal[q.disposal] = (byDisposal[q.disposal] || 0) + 1;

    const documentsByStatus = {};
    for (const s of Object.values(DOC_STATUS)) documentsByStatus[s] = 0;
    for (const d of this._documents.values()) {
      documentsByStatus[d.status] = (documentsByStatus[d.status] || 0) + 1;
    }

    return {
      period: { from: iso(from), to: iso(to) },
      totals: {
        documents: this._documents.size,
        legalHolds: this._legalHolds.size,
        queueEntries: this._queue.length,
        eventsInRange: eventsInRange.length,
      },
      queue: {
        byStatus,
        byClass,
        byDisposal,
        entries: queueInRange.map(clone),
      },
      documentsByStatus,
      events: eventsInRange.map(clone),
      invariant: 'לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow',
      generatedAt: iso(this._now()),
    };
  }

  // ─── 10. bilingualPolicy ─────────────────────────────────────

  /**
   * Produce a bilingual (Hebrew + English) retention-policy document
   * suitable for display in the admin UI, inclusion in a DSAR response,
   * or attachment to an audit file.
   *
   * Returns an object with:
   *   - `he`: full Hebrew text
   *   - `en`: full English text
   *   - `table`: tabular rows (bilingual) for inline rendering
   *   - `direction`: 'rtl'
   */
  bilingualPolicy() {
    const classes = Object.values(this.listRetentionClasses());
    const rows = classes.map((c) => ({
      key: c.key,
      label_he: c.label_he,
      label_en: c.label_en,
      retentionYears: c.retentionYears,
      retention_he: c.retentionYears === null ? 'לצמיתות' : `${c.retentionYears} שנים`,
      retention_en: c.retentionYears === null ? 'permanent' : `${c.retentionYears} years`,
      lawReference: c.lawReference,
      disposal: c.disposal,
      disposal_he:
        c.disposal === 'archive'
          ? 'העברה לארכיון קר'
          : c.disposal === 'anonymize'
          ? 'אנונימיזציה'
          : 'סימון למחיקה (דורש אישור אנושי)',
      disposal_en:
        c.disposal === 'archive'
          ? 'cold-storage archive'
          : c.disposal === 'anonymize'
          ? 'anonymize'
          : 'delete-marker (human approval required)',
      holdOverride: !!c.holdOverride,
      triggerEvent: c.triggerEvent,
    }));

    const he = [
      '# מדיניות שימור מסמכים — מערכת Techno-Kol Uzi',
      '',
      '**עיקרון-העל:** *לא מוחקים — רק משדרגים ומגדלים.*',
      '',
      'מדיניות זו מגדירה את תקופות השימור החוקיות עבור מסמכי הארגון על פי הדין הישראלי (2026).',
      'המערכת לעולם אינה מבצעת מחיקה אוטומטית. כל פעולת סילוק (ארכיון, אנונימיזציה או סימון למחיקה)',
      'מחייבת אישור אנושי מפורש והיא נרשמת ביומן ביקורת בלתי-ניתן-לעריכה.',
      '',
      '## טבלת שימור',
      '',
      '| סוג מסמך | תקופה | בסיס חוקי | סוג סילוק | אירוע טריגר |',
      '|---|---|---|---|---|',
      ...rows.map(
        (r) =>
          `| ${r.label_he} | ${r.retention_he} | ${r.lawReference} | ${r.disposal_he} | ${r.triggerEvent} |`
      ),
      '',
      '## כללי בטיחות',
      '',
      '1. ברירת המחדל היא **ארכיון**, לעולם לא מחיקה.',
      '2. כל פעולת סילוק דורשת אישור מפורש של אדם אחראי (approver).',
      '3. מסמכים תחת **legal hold** (כולל הרישום ב-Y-115) אינם ניתנים לסילוק.',
      '4. היתרי בנייה, מסמכי טאבו והליכים משפטיים נשמרים **לצמיתות** ללא יוצא מן הכלל.',
      '5. רשומות רפואיות ותיקי עובדים עוברים **אנונימיזציה** ולא מחיקה בתום תקופת השימור.',
      '6. מחיקה פיזית (אם בכלל) מתבצעת רק בנוהל מתועד ונפרד — המנוע עצמו מסמן כוונה בלבד.',
      '',
    ].join('\n');

    const en = [
      '# Document Retention Policy — Techno-Kol Uzi ERP',
      '',
      '**Prime directive:** *Never delete — only upgrade and grow.*',
      '',
      'This policy defines statutory retention periods for organizational documents under Israeli law (2026).',
      'The engine NEVER performs automatic deletion. Every disposal action (archive, anonymize, or delete-marker)',
      'requires explicit human approval and is recorded in an append-only audit log.',
      '',
      '## Retention Table',
      '',
      '| Document type | Retention | Legal basis | Disposal | Trigger event |',
      '|---|---|---|---|---|',
      ...rows.map(
        (r) =>
          `| ${r.label_en} | ${r.retention_en} | ${r.lawReference} | ${r.disposal_en} | ${r.triggerEvent} |`
      ),
      '',
      '## Safety Rules',
      '',
      '1. The default disposal mode is **ARCHIVE**, never DELETE.',
      '2. Every disposal requires explicit approval by a named human approver.',
      '3. Documents on **legal hold** (including those mirrored from Y-115) are exempt from disposal.',
      '4. Building permits, Tabu documents, and legal proceedings are retained **permanently** with no exception.',
      '5. Medical records and personnel files are **anonymized**, not deleted, at the end of their retention period.',
      '6. Physical deletion (if ever) is performed only through a separate, documented runbook — the engine marks intent only.',
      '',
    ].join('\n');

    return {
      he,
      en,
      table: rows,
      direction: 'rtl',
      invariant: 'לא מוחקים רק משדרגים ומגדלים',
      generatedAt: iso(this._now()),
    };
  }

  // ─── Compliance log / audit trail ────────────────────────────

  _log(kind, payload = {}) {
    this._events.push({
      at: iso(this._now()),
      kind,
      payload: clone(payload),
    });
  }

  /** Full audit trail (clones). Append-only. */
  auditTrail() {
    return this._events.map(clone);
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  RetentionPolicy,
  ISRAELI_RETENTION_CLASSES,
  DOC_TYPE_MATCHERS,
  DOC_STATUS,
  DISPOSAL_MODES,
  QUEUE_STATUS,
};
