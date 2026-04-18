/* ============================================================================
 * Techno-Kol ERP — Document Expiry Alert Engine (DocExpiry)
 * Agent Y-110 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע התראות תפוגה למסמכים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Scope (כיסוי):
 *   Tracks any document whose validity expires on a known date: vendor
 *   contracts (חוזים), licenses (רישיונות), insurance policies (ביטוחים),
 *   professional certifications (תעודות), real-estate leases (חוזי שכירות),
 *   permits (היתרים), equipment warranties (אחריויות), NDAs (הסכמי סודיות),
 *   GDPR DPAs (עיבוד נתונים), employment agreements (הסכמי העסקה), and
 *   vehicle registrations (רישוי רכב).
 *
 *   The engine exists so nothing ever lapses silently. Every expiring doc
 *   is graded into one of four buckets (expired / critical / urgent / soon),
 *   emits graduated reminders at 90-60-30-7-1 day lead times, and keeps a
 *   full append-only lifecycle so auditors can reconstruct exactly who
 *   renewed what and when.
 *
 *   Renewal never mutates the prior record: it creates a *new version* of
 *   the document that points back at its predecessor. Expired records are
 *   archived, blocked, or merely warned — but never deleted.
 *
 * RULES (immutable — inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Nothing is ever deleted. Renewal = new version. Expiry = status flip.
 *     History is append-only and retrievable in full via `history(docId)`.
 *   → Zero external dependencies — Node built-ins only (node:crypto).
 *   → Hebrew RTL + bilingual labels on every public structure.
 *
 * Storage:
 *   In-memory `Map` keyed by docId. Each document owns an ordered array of
 *   versions (v1, v2, …) and an append-only event log capturing every
 *   registration / alert / renewal / expiry action.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Document categories covered by the expiry engine. */
const DOC_TYPES = Object.freeze({
  contract:              Object.freeze({ id: 'contract',              he: 'חוזה',             en: 'Contract',              blocking: false }),
  license:               Object.freeze({ id: 'license',               he: 'רישיון עסק',       en: 'Business license',      blocking: true  }),
  insurance:             Object.freeze({ id: 'insurance',             he: 'פוליסת ביטוח',     en: 'Insurance policy',      blocking: true  }),
  certification:         Object.freeze({ id: 'certification',         he: 'תעודת הסמכה',      en: 'Certification',         blocking: false }),
  lease:                 Object.freeze({ id: 'lease',                 he: 'חוזה שכירות',      en: 'Lease',                 blocking: true  }),
  permit:                Object.freeze({ id: 'permit',                he: 'היתר',             en: 'Permit',                blocking: true  }),
  warranty:              Object.freeze({ id: 'warranty',              he: 'אחריות יצרן',      en: 'Warranty',              blocking: false }),
  nda:                   Object.freeze({ id: 'nda',                   he: 'הסכם סודיות',      en: 'NDA',                   blocking: false }),
  'gdpr-dpa':            Object.freeze({ id: 'gdpr-dpa',              he: 'הסכם עיבוד נתונים', en: 'GDPR DPA',             blocking: false }),
  'employment-agreement':Object.freeze({ id: 'employment-agreement', he: 'הסכם העסקה',       en: 'Employment agreement',  blocking: false }),
  'vehicle-registration':Object.freeze({ id: 'vehicle-registration', he: 'רישוי רכב',        en: 'Vehicle registration',  blocking: true  }),
});

/** @enum Bucket labels surfaced by `listExpiring`. */
const EXPIRY_BUCKETS = Object.freeze({
  expired:  Object.freeze({ id: 'expired',  he: 'פג תוקף',       en: 'Expired',           severity: 4 }),
  critical: Object.freeze({ id: 'critical', he: 'קריטי (<7)',    en: 'Critical (<7d)',    severity: 3 }),
  urgent:   Object.freeze({ id: 'urgent',   he: 'דחוף (<30)',    en: 'Urgent (<30d)',     severity: 2 }),
  soon:     Object.freeze({ id: 'soon',     he: 'בקרוב (<90)',   en: 'Soon (<90d)',       severity: 1 }),
  valid:    Object.freeze({ id: 'valid',    he: 'בתוקף',         en: 'Valid',             severity: 0 }),
});

/** @enum Document lifecycle states. */
const DOC_STATUS = Object.freeze({
  valid:     Object.freeze({ id: 'valid',     he: 'בתוקף',        en: 'Valid' }),
  expired:   Object.freeze({ id: 'expired',   he: 'פג תוקף',      en: 'Expired' }),
  renewed:   Object.freeze({ id: 'renewed',   he: 'חודש',         en: 'Renewed' }),
  archived:  Object.freeze({ id: 'archived',  he: 'בארכיון',      en: 'Archived' }),
  blocked:   Object.freeze({ id: 'blocked',   he: 'חסום תפעול',   en: 'Blocking operations' }),
  warning:   Object.freeze({ id: 'warning',   he: 'אזהרה',        en: 'Warning' }),
});

/** @enum Actions taken on expiry. */
const EXPIRY_ACTIONS = Object.freeze({
  archive: Object.freeze({ id: 'archive', he: 'העברה לארכיון',    en: 'Archive' }),
  block:   Object.freeze({ id: 'block',   he: 'חסימת תפעול',      en: 'Block operations' }),
  warn:    Object.freeze({ id: 'warn',    he: 'אזהרה בלבד',       en: 'Warn only' }),
});

/** @enum Event kinds recorded on the append-only history log. */
const EVENT_KINDS = Object.freeze({
  registered:         Object.freeze({ id: 'registered',         he: 'רישום מסמך',        en: 'Document registered' }),
  alert:              Object.freeze({ id: 'alert',              he: 'התראת תפוגה',        en: 'Expiry alert' }),
  renewed:            Object.freeze({ id: 'renewed',            he: 'חידוש מסמך',        en: 'Document renewed' }),
  expired:            Object.freeze({ id: 'expired',            he: 'פג תוקף',            en: 'Document expired' }),
  auto_renew_policy:  Object.freeze({ id: 'auto_renew_policy',  he: 'מדיניות חידוש אוטו', en: 'Auto-renew policy set' }),
  auto_renew_trigger: Object.freeze({ id: 'auto_renew_trigger', he: 'הפעלת חידוש אוטו',  en: 'Auto-renew triggered' }),
  reminder_email:     Object.freeze({ id: 'reminder_email',     he: 'תזכורת במייל',       en: 'Reminder email issued' }),
});

/** Default escalation ladder in days. Callers can override per-call. */
const DEFAULT_LEAD_DAYS = Object.freeze([90, 60, 30, 7, 1]);

const MS_PER_DAY = 86_400_000;

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers — zero external deps
 * -------------------------------------------------------------------------- */

function _nowIso(clock) {
  return typeof clock === 'function' ? clock() : new Date().toISOString();
}

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertObj(v, name) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new TypeError('invalid ' + name + ': must be object');
  }
}

function _parseIsoDate(s, name) {
  _assertStr(s, name);
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new TypeError('invalid ' + name + ': not a parseable ISO date (' + s + ')');
  }
  return t;
}

function _toIso(ms) {
  return new Date(ms).toISOString();
}

function _daysBetween(fromMs, toMs) {
  // Integer day delta, rounded half-up. Positive = "to" is in the future.
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

function _newDocId() {
  return 'DOC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function _newEventId() {
  return 'EVT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function _cloneDeepFrozen(obj) {
  // Deterministic JSON round-trip. Adequate because every payload here is
  // plain data (no Date/Buffer/Map), and we *want* immutability out the door.
  return JSON.parse(JSON.stringify(obj));
}

/* ----------------------------------------------------------------------------
 * 2. The DocExpiry class
 * -------------------------------------------------------------------------- */

class DocExpiry {
  /**
   * @param {object} [opts]
   * @param {() => string} [opts.clock]  Inject an ISO clock for deterministic tests.
   * @param {string[]}     [opts.leadDays] Override the default reminder ladder.
   */
  constructor(opts) {
    opts = opts || {};
    this._clock = typeof opts.clock === 'function' ? opts.clock : null;
    this._defaultLeadDays = Array.isArray(opts.leadDays) && opts.leadDays.length
      ? opts.leadDays.slice().sort((a, b) => b - a)
      : DEFAULT_LEAD_DAYS.slice();

    /** @type {Map<string, object>} docId → record */
    this._docs = new Map();

    /** @type {Map<string, object>} docType → { enabled, leadDays, autoRenewBy } */
    this._autoRenewPolicies = new Map();

    /** Append-only global event log for observability. */
    this._globalLog = [];
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.1 registerDocument — append-only insert
   * ────────────────────────────────────────────────────────────────────── */
  registerDocument(input) {
    _assertObj(input, 'registerDocument input');
    const {
      docId: providedId,
      docType,
      title_he,
      title_en,
      issueDate,
      expiryDate,
      owner,
      autoRenew,
      renewalLeadDays,
      referenceNo,
      metadata,
    } = input;

    _assertStr(docType, 'docType');
    if (!Object.prototype.hasOwnProperty.call(DOC_TYPES, docType)) {
      throw new TypeError('unknown docType: ' + docType);
    }
    _assertStr(title_he, 'title_he');
    _assertStr(title_en, 'title_en');
    _assertStr(owner, 'owner');

    const issueMs  = _parseIsoDate(issueDate,  'issueDate');
    const expiryMs = _parseIsoDate(expiryDate, 'expiryDate');
    if (expiryMs < issueMs) {
      throw new RangeError('expiryDate must be on or after issueDate');
    }

    const docId = providedId && typeof providedId === 'string'
      ? providedId
      : _newDocId();

    if (this._docs.has(docId)) {
      // Append-only: registering a doc that already exists is a misuse.
      // Use renewDocument() to append a new version.
      throw new Error('docId already registered: ' + docId + ' — use renewDocument');
    }

    const typeEntry = DOC_TYPES[docType];
    const now = _nowIso(this._clock);

    const version = Object.freeze({
      version: 1,
      issueDate:  _toIso(issueMs),
      expiryDate: _toIso(expiryMs),
      referenceNo: referenceNo || null,
      registeredAt: now,
      registeredBy: owner,
      parentVersion: null,
      renewedBy: null,
      renewedAt: null,
      metadata: metadata ? _cloneDeepFrozen(metadata) : null,
    });

    const record = {
      docId,
      docType,
      docTypeLabel: { he: typeEntry.he, en: typeEntry.en },
      blocking: typeEntry.blocking,
      title_he,
      title_en,
      owner,
      autoRenew: Boolean(autoRenew),
      renewalLeadDays: Number.isFinite(renewalLeadDays) ? renewalLeadDays : 30,
      status: DOC_STATUS.valid,
      versions: [version],
      currentVersion: 1,
      events: [],
      createdAt: now,
    };

    this._appendEvent(record, 'registered', {
      version: 1,
      issueDate:  version.issueDate,
      expiryDate: version.expiryDate,
      owner,
    });

    this._docs.set(docId, record);
    return this._publicView(record);
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.2 listExpiring — bucketed by severity
   * ────────────────────────────────────────────────────────────────────── */
  listExpiring(opts) {
    opts = opts || {};
    const days   = Number.isFinite(opts.days) ? opts.days : 90;
    const nowMs  = this._nowMs(opts.now);
    const cutoff = nowMs + days * MS_PER_DAY;

    const buckets = {
      expired:  [],
      critical: [],
      urgent:   [],
      soon:     [],
    };

    for (const rec of this._docs.values()) {
      if (rec.status.id === 'archived') continue;
      const v = rec.versions[rec.currentVersion - 1];
      const expiryMs = Date.parse(v.expiryDate);
      const delta = _daysBetween(nowMs, expiryMs);

      // Past-due always surfaces regardless of the window.
      if (expiryMs < nowMs) {
        buckets.expired.push(this._snapshot(rec, delta));
        continue;
      }

      // Future expiries only surface if inside the caller's window.
      if (expiryMs > cutoff) continue;

      if      (delta < 7)  buckets.critical.push(this._snapshot(rec, delta));
      else if (delta < 30) buckets.urgent  .push(this._snapshot(rec, delta));
      else if (delta < 90) buckets.soon    .push(this._snapshot(rec, delta));
      else                 buckets.soon    .push(this._snapshot(rec, delta));
    }

    // Sort each bucket: soonest first (past-due: most overdue first).
    buckets.expired .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    buckets.critical.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    buckets.urgent  .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    buckets.soon    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    return {
      generatedAt: _toIso(nowMs),
      window: { days, cutoff: _toIso(cutoff) },
      labels: {
        expired:  { he: EXPIRY_BUCKETS.expired.he,  en: EXPIRY_BUCKETS.expired.en  },
        critical: { he: EXPIRY_BUCKETS.critical.he, en: EXPIRY_BUCKETS.critical.en },
        urgent:   { he: EXPIRY_BUCKETS.urgent.he,   en: EXPIRY_BUCKETS.urgent.en   },
        soon:     { he: EXPIRY_BUCKETS.soon.he,     en: EXPIRY_BUCKETS.soon.en     },
      },
      buckets,
      total:
        buckets.expired.length +
        buckets.critical.length +
        buckets.urgent.length +
        buckets.soon.length,
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.3 alertExpiring — graduated reminder cascade
   * ────────────────────────────────────────────────────────────────────── */
  alertExpiring(opts) {
    opts = opts || {};
    const leadDays = Array.isArray(opts.leadDays) && opts.leadDays.length
      ? opts.leadDays.slice().sort((a, b) => b - a)
      : this._defaultLeadDays.slice();
    const nowMs = this._nowMs(opts.now);
    const maxLead = leadDays[0];
    const alerts = [];

    for (const rec of this._docs.values()) {
      if (rec.status.id === 'archived') continue;
      const v = rec.versions[rec.currentVersion - 1];
      const expiryMs = Date.parse(v.expiryDate);
      const delta = _daysBetween(nowMs, expiryMs);

      // Past-due → always a "post-expiry" alert.
      if (expiryMs < nowMs) {
        alerts.push(this._buildAlert(rec, delta, 'post-expiry'));
        this._appendEvent(rec, 'alert', { kind: 'post-expiry', daysOverdue: -delta });
        continue;
      }

      // Outside the furthest lead? skip entirely.
      if (delta > maxLead) continue;

      // Pick the *highest* (soonest) lead day <= delta.
      let chosen = null;
      for (const ld of leadDays) {
        if (delta <= ld) chosen = ld; // keep narrowing — loop is descending
      }
      if (chosen === null) continue;

      alerts.push(this._buildAlert(rec, delta, 'T-' + chosen));
      this._appendEvent(rec, 'alert', { kind: 'T-' + chosen, daysUntilExpiry: delta });
    }

    alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    return {
      generatedAt: _toIso(nowMs),
      leadDays,
      labels: {
        he: 'התראות תפוגה מדורגות',
        en: 'Graduated expiry alerts',
      },
      count: alerts.length,
      alerts,
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.4 renewDocument — creates a NEW version, keeps the old one
   * ────────────────────────────────────────────────────────────────────── */
  renewDocument(input) {
    _assertObj(input, 'renewDocument input');
    const { docId, newExpiryDate, newIssueDate, renewedBy, referenceNo, metadata } = input;
    _assertStr(docId, 'docId');
    _assertStr(renewedBy, 'renewedBy');

    const rec = this._docs.get(docId);
    if (!rec) throw new Error('unknown docId: ' + docId);

    const now = _nowIso(this._clock);
    const prev = rec.versions[rec.currentVersion - 1];

    const issueMs = newIssueDate
      ? _parseIsoDate(newIssueDate, 'newIssueDate')
      : Date.parse(now);
    const expiryMs = _parseIsoDate(newExpiryDate, 'newExpiryDate');
    if (expiryMs < issueMs) {
      throw new RangeError('newExpiryDate must be on or after newIssueDate');
    }
    if (expiryMs <= Date.parse(prev.expiryDate)) {
      throw new RangeError(
        'renewal must extend coverage — newExpiryDate (' + _toIso(expiryMs) +
        ') is not after previous expiryDate (' + prev.expiryDate + ')'
      );
    }

    const nextVersion = rec.currentVersion + 1;
    const version = Object.freeze({
      version: nextVersion,
      issueDate:  _toIso(issueMs),
      expiryDate: _toIso(expiryMs),
      referenceNo: referenceNo || null,
      registeredAt: now,
      registeredBy: renewedBy,
      parentVersion: rec.currentVersion,
      renewedBy,
      renewedAt: now,
      metadata: metadata ? _cloneDeepFrozen(metadata) : null,
    });

    rec.versions.push(version);
    rec.currentVersion = nextVersion;
    // A renewal flips the record back to valid even if it had been
    // marked expired — we never delete history, we *upgrade and grow*.
    rec.status = DOC_STATUS.valid;

    this._appendEvent(rec, 'renewed', {
      fromVersion: nextVersion - 1,
      toVersion: nextVersion,
      newExpiryDate: version.expiryDate,
      renewedBy,
      referenceNo: version.referenceNo,
    });

    return this._publicView(rec);
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.5 markExpired — status flip, never a delete
   * ────────────────────────────────────────────────────────────────────── */
  markExpired(docId, action) {
    _assertStr(docId, 'docId');
    _assertStr(action, 'action');
    if (!Object.prototype.hasOwnProperty.call(EXPIRY_ACTIONS, action)) {
      throw new TypeError('unknown expiry action: ' + action +
        ' (expected archive|block|warn)');
    }
    const rec = this._docs.get(docId);
    if (!rec) throw new Error('unknown docId: ' + docId);

    const priorStatus = rec.status;
    if (action === 'archive') rec.status = DOC_STATUS.archived;
    if (action === 'block')   rec.status = DOC_STATUS.blocked;
    if (action === 'warn')    rec.status = DOC_STATUS.warning;

    this._appendEvent(rec, 'expired', {
      action,
      previousStatus: priorStatus.id,
      newStatus: rec.status.id,
      actionLabel: { he: EXPIRY_ACTIONS[action].he, en: EXPIRY_ACTIONS[action].en },
    });
    // Versions are never touched.
    return this._publicView(rec);
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.6 bulkImport — batch register with per-row result
   * ────────────────────────────────────────────────────────────────────── */
  bulkImport(documents) {
    if (!Array.isArray(documents)) {
      throw new TypeError('bulkImport: documents must be an array');
    }
    const results = [];
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < documents.length; i++) {
      try {
        const r = this.registerDocument(documents[i]);
        results.push({ index: i, ok: true, docId: r.docId });
        ok++;
      } catch (err) {
        results.push({
          index: i,
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
        fail++;
      }
    }
    return {
      total: documents.length,
      ok,
      fail,
      results,
      labels: { he: 'ייבוא כמותי של מסמכים', en: 'Bulk import of documents' },
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.7 reportByDocType — rollup
   * ────────────────────────────────────────────────────────────────────── */
  reportByDocType(docType) {
    _assertStr(docType, 'docType');
    if (!Object.prototype.hasOwnProperty.call(DOC_TYPES, docType)) {
      throw new TypeError('unknown docType: ' + docType);
    }
    const nowMs = this._nowMs();
    const entry = DOC_TYPES[docType];

    let total = 0;
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;
    const items = [];

    for (const rec of this._docs.values()) {
      if (rec.docType !== docType) continue;
      total++;
      const v = rec.versions[rec.currentVersion - 1];
      const expiryMs = Date.parse(v.expiryDate);
      const delta = _daysBetween(nowMs, expiryMs);

      let status;
      if (expiryMs < nowMs) { expired++;      status = 'expired'; }
      else if (delta < 90)  { expiringSoon++; status = 'expiringSoon'; }
      else                  { valid++;        status = 'valid'; }

      items.push({
        docId: rec.docId,
        title_he: rec.title_he,
        title_en: rec.title_en,
        owner: rec.owner,
        currentVersion: rec.currentVersion,
        expiryDate: v.expiryDate,
        daysUntilExpiry: delta,
        recordStatus: rec.status.id,
        severity: status,
      });
    }

    return {
      docType,
      docTypeLabel: { he: entry.he, en: entry.en },
      generatedAt: _toIso(nowMs),
      total,
      expired,
      expiringSoon,
      valid,
      items,
      labels: {
        he: 'דוח לפי סוג מסמך — ' + entry.he,
        en: 'Report by doc type — ' + entry.en,
      },
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.8 history — full lifecycle including renewals
   * ────────────────────────────────────────────────────────────────────── */
  history(docId) {
    _assertStr(docId, 'docId');
    const rec = this._docs.get(docId);
    if (!rec) throw new Error('unknown docId: ' + docId);

    // Return safe deep copies so callers cannot mutate internal state.
    return {
      docId: rec.docId,
      docType: rec.docType,
      docTypeLabel: { he: rec.docTypeLabel.he, en: rec.docTypeLabel.en },
      title_he: rec.title_he,
      title_en: rec.title_en,
      owner: rec.owner,
      status: { id: rec.status.id, he: rec.status.he, en: rec.status.en },
      currentVersion: rec.currentVersion,
      versions: rec.versions.map((v) => _cloneDeepFrozen(v)),
      events: rec.events.map((e) => _cloneDeepFrozen(e)),
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.9 setAutoRenewPolicy — per doc type
   * ────────────────────────────────────────────────────────────────────── */
  setAutoRenewPolicy(docType, policy) {
    _assertStr(docType, 'docType');
    _assertObj(policy, 'policy');
    if (!Object.prototype.hasOwnProperty.call(DOC_TYPES, docType)) {
      throw new TypeError('unknown docType: ' + docType);
    }
    const enabled = Boolean(policy.enabled);
    const leadDays = Number.isFinite(policy.leadDays) ? policy.leadDays : 30;
    const autoRenewBy = typeof policy.autoRenewBy === 'string' && policy.autoRenewBy
      ? policy.autoRenewBy
      : 'system@tko';
    const extendByDays = Number.isFinite(policy.extendByDays) ? policy.extendByDays : 365;

    const finalPolicy = Object.freeze({
      docType,
      enabled,
      leadDays,
      autoRenewBy,
      extendByDays,
      updatedAt: _nowIso(this._clock),
    });

    this._autoRenewPolicies.set(docType, finalPolicy);
    // Log on every affected record so auditors can trace when the policy
    // touched their document.
    for (const rec of this._docs.values()) {
      if (rec.docType !== docType) continue;
      this._appendEvent(rec, 'auto_renew_policy', finalPolicy);
    }
    return finalPolicy;
  }

  /** Evaluates the auto-renew policies against the current clock. */
  runAutoRenew(opts) {
    opts = opts || {};
    const nowMs = this._nowMs(opts.now);
    const triggered = [];
    for (const rec of this._docs.values()) {
      const policy = this._autoRenewPolicies.get(rec.docType);
      if (!policy || !policy.enabled) continue;
      if (rec.status.id === 'archived') continue;

      const v = rec.versions[rec.currentVersion - 1];
      const expiryMs = Date.parse(v.expiryDate);
      const delta = _daysBetween(nowMs, expiryMs);
      if (delta > policy.leadDays || expiryMs < nowMs) continue;

      const newIssueIso = _toIso(expiryMs);
      const newExpiryIso = _toIso(expiryMs + policy.extendByDays * MS_PER_DAY);

      const before = rec.currentVersion;
      this.renewDocument({
        docId: rec.docId,
        newIssueDate:  newIssueIso,
        newExpiryDate: newExpiryIso,
        renewedBy: policy.autoRenewBy,
        referenceNo: 'AUTO-RENEW-' + (before + 1),
      });
      this._appendEvent(rec, 'auto_renew_trigger', {
        fromVersion: before,
        toVersion: rec.currentVersion,
        policy,
      });
      triggered.push(this._publicView(rec));
    }
    return {
      generatedAt: _toIso(nowMs),
      triggered,
      count: triggered.length,
      labels: {
        he: 'הפעלת חידוש אוטומטי',
        en: 'Auto-renew execution',
      },
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.10 checkExpiredCritical — expired AND blocking
   * ────────────────────────────────────────────────────────────────────── */
  checkExpiredCritical(now) {
    const nowMs = this._nowMs(now);
    const hits = [];
    for (const rec of this._docs.values()) {
      const v = rec.versions[rec.currentVersion - 1];
      const expiryMs = Date.parse(v.expiryDate);
      if (expiryMs >= nowMs) continue;
      if (!rec.blocking) continue;
      if (rec.status.id === 'archived') continue;
      const delta = _daysBetween(nowMs, expiryMs);
      hits.push({
        docId: rec.docId,
        docType: rec.docType,
        docTypeLabel: { he: rec.docTypeLabel.he, en: rec.docTypeLabel.en },
        title_he: rec.title_he,
        title_en: rec.title_en,
        owner: rec.owner,
        expiryDate: v.expiryDate,
        daysOverdue: -delta,
        currentStatus: rec.status.id,
        severity: 'BLOCKING',
      });
    }
    hits.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return {
      generatedAt: _toIso(nowMs),
      count: hits.length,
      hits,
      labels: {
        he: 'מסמכים פגי תוקף החוסמים תפעול',
        en: 'Expired docs blocking operations',
      },
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.11 generateReminderEmail — bilingual template
   * ────────────────────────────────────────────────────────────────────── */
  generateReminderEmail(docId, lang) {
    _assertStr(docId, 'docId');
    const rec = this._docs.get(docId);
    if (!rec) throw new Error('unknown docId: ' + docId);
    const language = lang === 'he' || lang === 'en' ? lang : 'he';

    const v = rec.versions[rec.currentVersion - 1];
    const nowMs = this._nowMs();
    const expiryMs = Date.parse(v.expiryDate);
    const delta = _daysBetween(nowMs, expiryMs);

    let severity;
    if      (expiryMs < nowMs) severity = 'expired';
    else if (delta < 7)        severity = 'critical';
    else if (delta < 30)       severity = 'urgent';
    else                       severity = 'soon';

    const heSubject =
      severity === 'expired'
        ? `[פג תוקף] ${rec.docTypeLabel.he}: ${rec.title_he}`
        : `[תזכורת ${severity === 'critical' ? 'קריטית' :
                      severity === 'urgent'   ? 'דחופה'   :
                      'מוקדמת'}] ${rec.docTypeLabel.he}: ${rec.title_he}`;
    const enSubject =
      severity === 'expired'
        ? `[EXPIRED] ${rec.docTypeLabel.en}: ${rec.title_en}`
        : `[${severity.toUpperCase()} reminder] ${rec.docTypeLabel.en}: ${rec.title_en}`;

    const heBody = [
      'שלום ' + rec.owner + ',',
      '',
      'מערכת הניהול של טכנו-קול עוזי זיהתה ש' + rec.docTypeLabel.he +
      ' "' + rec.title_he + '" (' + rec.docId + ')',
      severity === 'expired'
        ? 'פג את תוקפו בתאריך ' + v.expiryDate + ' (לפני ' + (-delta) + ' ימים).'
        : 'עומד לפוג בתאריך ' + v.expiryDate + ' (בעוד ' + delta + ' ימים).',
      '',
      'גרסה נוכחית: ' + rec.currentVersion,
      'סטטוס: ' + rec.status.he,
      '',
      severity === 'expired'
        ? 'נא לפעול מיידית — לחדש או להעביר לארכיון.'
        : 'נא לפתוח בתהליך חידוש בהקדם האפשרי.',
      '',
      'בברכה,',
      'מערכת DocExpiry — Agent Y-110',
    ].join('\n');

    const enBody = [
      'Hi ' + rec.owner + ',',
      '',
      'Techno-Kol Uzi\'s ERP has flagged ' + rec.docTypeLabel.en +
      ' "' + rec.title_en + '" (' + rec.docId + ')',
      severity === 'expired'
        ? 'as EXPIRED on ' + v.expiryDate + ' (' + (-delta) + ' days ago).'
        : 'as expiring on ' + v.expiryDate + ' (in ' + delta + ' days).',
      '',
      'Current version: ' + rec.currentVersion,
      'Status: ' + rec.status.en,
      '',
      severity === 'expired'
        ? 'Please take immediate action — renew or archive.'
        : 'Please open a renewal workflow as soon as possible.',
      '',
      'Regards,',
      'DocExpiry engine — Agent Y-110',
    ].join('\n');

    const payload = language === 'he'
      ? {
          language: 'he',
          direction: 'rtl',
          subject: heSubject,
          body: heBody,
        }
      : {
          language: 'en',
          direction: 'ltr',
          subject: enSubject,
          body: enBody,
        };

    this._appendEvent(rec, 'reminder_email', {
      language,
      severity,
      daysUntilExpiry: delta,
    });

    return Object.assign(
      {
        docId: rec.docId,
        docType: rec.docType,
        severity,
        daysUntilExpiry: delta,
        expiryDate: v.expiryDate,
        to: rec.owner,
        // Always ship both so callers can display side-by-side.
        he: { subject: heSubject, body: heBody, direction: 'rtl' },
        en: { subject: enSubject, body: enBody, direction: 'ltr' },
      },
      payload
    );
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.12 small utilities — list + lookup
   * ────────────────────────────────────────────────────────────────────── */
  listAll() {
    const out = [];
    for (const rec of this._docs.values()) out.push(this._publicView(rec));
    return out;
  }

  get(docId) {
    const rec = this._docs.get(docId);
    return rec ? this._publicView(rec) : null;
  }

  /* ──────────────────────────────────────────────────────────────────────
   * Private helpers
   * ────────────────────────────────────────────────────────────────────── */
  _nowMs(override) {
    if (override !== undefined && override !== null) {
      if (override instanceof Date) return override.getTime();
      if (typeof override === 'number') return override;
      if (typeof override === 'string') return Date.parse(override);
    }
    return Date.parse(_nowIso(this._clock));
  }

  _appendEvent(rec, kind, detail) {
    if (!Object.prototype.hasOwnProperty.call(EVENT_KINDS, kind)) {
      throw new Error('unknown event kind: ' + kind);
    }
    const label = EVENT_KINDS[kind];
    const evt = Object.freeze({
      eventId: _newEventId(),
      kind,
      label: { he: label.he, en: label.en },
      at: _nowIso(this._clock),
      detail: detail ? _cloneDeepFrozen(detail) : null,
    });
    rec.events.push(evt);
    this._globalLog.push(Object.freeze({
      docId: rec.docId,
      eventId: evt.eventId,
      kind,
      at: evt.at,
    }));
    return evt;
  }

  _snapshot(rec, daysUntilExpiry) {
    const v = rec.versions[rec.currentVersion - 1];
    return {
      docId: rec.docId,
      docType: rec.docType,
      docTypeLabel: { he: rec.docTypeLabel.he, en: rec.docTypeLabel.en },
      title_he: rec.title_he,
      title_en: rec.title_en,
      owner: rec.owner,
      currentVersion: rec.currentVersion,
      expiryDate: v.expiryDate,
      daysUntilExpiry,
      status: { id: rec.status.id, he: rec.status.he, en: rec.status.en },
      blocking: rec.blocking,
    };
  }

  _buildAlert(rec, delta, leadTag) {
    const v = rec.versions[rec.currentVersion - 1];
    return {
      docId: rec.docId,
      docType: rec.docType,
      docTypeLabel: { he: rec.docTypeLabel.he, en: rec.docTypeLabel.en },
      title_he: rec.title_he,
      title_en: rec.title_en,
      owner: rec.owner,
      expiryDate: v.expiryDate,
      daysUntilExpiry: delta,
      leadTag,
      messages: {
        he: delta < 0
          ? `תזכורת דחופה: ${rec.docTypeLabel.he} "${rec.title_he}" פג תוקף לפני ${-delta} ימים.`
          : `תזכורת (${leadTag}): ${rec.docTypeLabel.he} "${rec.title_he}" יפוג בעוד ${delta} ימים.`,
        en: delta < 0
          ? `Post-expiry alert: ${rec.docTypeLabel.en} "${rec.title_en}" expired ${-delta} days ago.`
          : `Reminder (${leadTag}): ${rec.docTypeLabel.en} "${rec.title_en}" expires in ${delta} days.`,
      },
    };
  }

  _publicView(rec) {
    // Shallow copy with frozen sub-objects. Safe to return to callers.
    return {
      docId: rec.docId,
      docType: rec.docType,
      docTypeLabel: { he: rec.docTypeLabel.he, en: rec.docTypeLabel.en },
      blocking: rec.blocking,
      title_he: rec.title_he,
      title_en: rec.title_en,
      owner: rec.owner,
      autoRenew: rec.autoRenew,
      renewalLeadDays: rec.renewalLeadDays,
      status: { id: rec.status.id, he: rec.status.he, en: rec.status.en },
      currentVersion: rec.currentVersion,
      versionsCount: rec.versions.length,
      currentVersionData: _cloneDeepFrozen(rec.versions[rec.currentVersion - 1]),
      createdAt: rec.createdAt,
    };
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  DocExpiry,
  DOC_TYPES,
  DOC_STATUS,
  EXPIRY_BUCKETS,
  EXPIRY_ACTIONS,
  EVENT_KINDS,
  DEFAULT_LEAD_DAYS,
};
