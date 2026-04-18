/* ============================================================================
 * Techno-Kol ERP — Office Document Version Control (DocVC)
 * Agent Y-106 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * בקרת גרסאות למסמכי משרד — מפעל מתכת "טכנו-קול עוזי"
 *
 * Scope (כיסוי):
 *   This module covers *office* documents: contracts (חוזים), policies
 *   (נהלים), procedures (הוראות עבודה), marketing collateral (חומרי
 *   שיווק), internal memos (מזכרים), and reports (דוחות).
 *
 *   It is deliberately **distinct** from Agent Y-045 (engineering drawings
 *   DWG / DXF / STEP / IGES). Engineering drawings ride a totally different
 *   lifecycle (aerospace-style alpha revs + ECO/FAI). Office documents
 *   ride a simpler integer lifecycle (v1, v2, v3 …) but add workflow
 *   features that drawings don't need:
 *      - soft lock for concurrent editors with explicit override + audit
 *      - approval chain (legal / finance / HR / management)
 *      - milestone tags (draft / approved / published / legal-hold)
 *      - expiry / review dates for contracts & policies
 *      - full-text search via an injected extractor callback
 *      - watermark overlay spec (bilingual) for draft/confidential stamps
 *      - archive status (never deleted — status flip only)
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Nothing is ever deleted. Every mutation appends. Rollback creates
 *     a NEW version that copies a target — intermediate versions survive.
 *   → Zero external dependencies — Node built-ins only (node:crypto).
 *   → Hebrew RTL + bilingual labels on every public structure.
 *
 * Storage:
 *   In-memory `Map` keyed by docId. Each document owns an ordered array
 *   of revisions. Append-only. No deletion, ever.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Document categories. */
const DOC_TYPES = Object.freeze({
  contract:  Object.freeze({ id: 'contract',  he: 'חוזה',           en: 'Contract' }),
  policy:    Object.freeze({ id: 'policy',    he: 'מדיניות',        en: 'Policy' }),
  procedure: Object.freeze({ id: 'procedure', he: 'נוהל עבודה',     en: 'Procedure' }),
  marketing: Object.freeze({ id: 'marketing', he: 'חומר שיווקי',    en: 'Marketing' }),
  memo:      Object.freeze({ id: 'memo',      he: 'מזכר',           en: 'Internal memo' }),
  report:    Object.freeze({ id: 'report',    he: 'דוח',            en: 'Report' }),
});

/** @enum Document overall lifecycle status. */
const DOC_STATUS = Object.freeze({
  active:     Object.freeze({ id: 'active',     he: 'פעיל',        en: 'Active' }),
  archived:   Object.freeze({ id: 'archived',   he: 'בארכיון',     en: 'Archived' }),
  legal_hold: Object.freeze({ id: 'legal_hold', he: 'הקפאה משפטית', en: 'Legal hold' }),
});

/** @enum Recognized milestone tags. Callers may add custom tags too. */
const MILESTONE_TAGS = Object.freeze({
  draft:       Object.freeze({ id: 'draft',       he: 'טיוטה',        en: 'Draft' }),
  in_review:   Object.freeze({ id: 'in_review',   he: 'בבדיקה',       en: 'In review' }),
  approved:    Object.freeze({ id: 'approved',    he: 'מאושר',        en: 'Approved' }),
  published:   Object.freeze({ id: 'published',   he: 'פורסם',        en: 'Published' }),
  superseded:  Object.freeze({ id: 'superseded',  he: 'הוחלף',        en: 'Superseded' }),
  legal_hold:  Object.freeze({ id: 'legal_hold',  he: 'הקפאה משפטית',  en: 'Legal hold' }),
  rollback:    Object.freeze({ id: 'rollback',    he: 'שחזור',        en: 'Rollback copy' }),
});

/** @enum Audit action codes. */
const AUDIT_ACTIONS = Object.freeze({
  upload:      Object.freeze({ id: 'upload',      he: 'העלאה',          en: 'Upload' }),
  checkin:     Object.freeze({ id: 'checkin',     he: 'החזרה',          en: 'Check-in' }),
  checkout:    Object.freeze({ id: 'checkout',    he: 'נעילה לעריכה',    en: 'Check-out' }),
  unlock:      Object.freeze({ id: 'unlock',      he: 'שחרור נעילה',    en: 'Release lock' }),
  override:    Object.freeze({ id: 'override',    he: 'דריסת נעילה',    en: 'Lock override' }),
  tag:         Object.freeze({ id: 'tag',         he: 'תיוג גרסה',      en: 'Tag version' }),
  approve:     Object.freeze({ id: 'approve',     he: 'אישור',          en: 'Approve' }),
  rollback:    Object.freeze({ id: 'rollback',    he: 'שחזור גרסה',     en: 'Rollback' }),
  expiry:      Object.freeze({ id: 'expiry',      he: 'עדכון תפוגה',    en: 'Expiry update' }),
  watermark:   Object.freeze({ id: 'watermark',   he: 'סימן מים',       en: 'Watermark' }),
  archive:     Object.freeze({ id: 'archive',     he: 'העברה לארכיון',   en: 'Archive' }),
  search:      Object.freeze({ id: 'search',      he: 'חיפוש',          en: 'Search' }),
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

function _toBuffer(input) {
  if (input == null) throw new TypeError('invalid fileBuffer: null/undefined');
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (typeof input === 'object' && typeof input.length === 'number') return Buffer.from(input);
  throw new TypeError('invalid fileBuffer: unsupported type');
}

function _sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function _deepCopy(obj) {
  if (obj === undefined || obj === null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function _bilingualLabel(he, en) {
  return { he: String(he), en: String(en), bidi: '\u202B' + String(he) + '\u202C / ' + String(en) };
}

/* ----------------------------------------------------------------------------
 * 2. DocumentVC class
 * -------------------------------------------------------------------------- */
class DocumentVC {
  /**
   * @param {object} [opts]
   * @param {()=>string} [opts.clock] Injected clock — ISO-8601 string. Useful for tests.
   * @param {()=>string} [opts.idGen] Injected id generator. Default = sha256(nowIso).slice(0,12).
   */
  constructor(opts) {
    const o = opts || {};
    this._clock = typeof o.clock === 'function' ? o.clock : _nowIso;
    this._idGen = typeof o.idGen === 'function'
      ? o.idGen
      : () => 'DOC-' + _sha256(Buffer.from(this._clock() + ':' + Math.random())).slice(0, 12).toUpperCase();

    /** @type {Map<string, DocumentRecord>} */
    this.documents = new Map();
    /** @type {Map<string, {user:string, at:string, override?:boolean}>} */
    this.locks = new Map();
    /** @type {Array<object>} append-only global audit log (per-doc log kept on record too). */
    this.globalAudit = [];
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.1 uploadDocument — create a brand-new document with version 1
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {object} p
   * @param {string} p.docType   One of DOC_TYPES keys.
   * @param {string} p.title_he  Hebrew title.
   * @param {string} p.title_en  English title.
   * @param {Buffer|Uint8Array|string} p.fileBuffer
   * @param {string} p.mimeType  e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   * @param {string} p.author    User id / display name of uploader.
   * @param {string[]} [p.tags]  Free-form tags in addition to milestone tags.
   * @param {string} [p.department] Department that owns the doc.
   * @returns {{docId:string, version:number, record:object}}
   */
  uploadDocument(p) {
    _assertObj(p, 'uploadDocument payload');
    _assertStr(p.docType, 'docType');
    _assertStr(p.title_he, 'title_he');
    _assertStr(p.title_en, 'title_en');
    _assertStr(p.mimeType, 'mimeType');
    _assertStr(p.author, 'author');
    if (!DOC_TYPES[p.docType]) {
      throw new RangeError('unknown docType: ' + p.docType);
    }

    const buf = _toBuffer(p.fileBuffer);
    const checksum = _sha256(buf);
    const size = buf.length;
    const at = this._clock();
    const docId = this._idGen();
    const tagsExtra = Array.isArray(p.tags) ? p.tags.slice() : [];

    const v1 = {
      version: 1,
      checksum,
      size,
      author: p.author,
      uploadedAt: at,
      comment: 'initial upload',
      lockStatus: 'unlocked',
      tags: ['draft'].concat(tagsExtra),
      approvals: [],
      mimeType: p.mimeType,
      parentVersion: null,
      sourceAction: 'upload',
      // retained for search: content buffer kept in-memory (append-only).
      _bufferBase64: buf.toString('base64'),
    };

    const record = {
      docId,
      docType: p.docType,
      docTypeLabel: DOC_TYPES[p.docType],
      title_he: p.title_he,
      title_en: p.title_en,
      title: _bilingualLabel(p.title_he, p.title_en),
      department: p.department || null,
      status: DOC_STATUS.active,
      createdAt: at,
      updatedAt: at,
      expiry: null,        // set by expiryTracking()
      approvalChain: null, // set by approvalChain()
      watermarks: [],      // array of overlay specs
      versions: [v1],
      audit: [],
    };

    this.documents.set(docId, record);
    this._audit(docId, AUDIT_ACTIONS.upload, p.author, { version: 1, checksum, size });

    return { docId, version: 1, record: this._publicCopy(record) };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.2 getDocument — fetch latest or specific version
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {string} docId
   * @param {{version?:number}} [opts]
   */
  getDocument(docId, opts) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);

    const versionArg = opts && opts.version;
    let rev;
    if (versionArg == null) {
      rev = record.versions[record.versions.length - 1];
    } else {
      if (!Number.isInteger(versionArg) || versionArg < 1) {
        throw new RangeError('version must be positive integer');
      }
      rev = record.versions.find((v) => v.version === versionArg);
      if (!rev) throw new RangeError('version not found: v' + versionArg);
    }

    return {
      docId: record.docId,
      docType: record.docType,
      docTypeLabel: record.docTypeLabel,
      title_he: record.title_he,
      title_en: record.title_en,
      title: record.title,
      department: record.department,
      status: record.status,
      expiry: _deepCopy(record.expiry),
      approvalChain: _deepCopy(record.approvalChain),
      watermarks: _deepCopy(record.watermarks),
      version: rev.version,
      revision: this._revToPublic(rev),
      buffer: Buffer.from(rev._bufferBase64, 'base64'),
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.3 listVersions — full history
   * ──────────────────────────────────────────────────────────────────── */
  listVersions(docId) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    return record.versions.map((v) => this._revToPublic(v));
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.4 checkIn — append a new revision (append-only)
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {string} docId
   * @param {{fileBuffer:any, author:string, comment?:string}} p
   */
  checkIn(docId, p) {
    _assertStr(docId, 'docId');
    _assertObj(p, 'checkIn payload');
    _assertStr(p.author, 'author');

    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);

    // If locked, only the lock holder (or override path) can check in.
    const lock = this.locks.get(docId);
    if (lock && lock.user !== p.author) {
      throw new Error(
        'document locked by ' + lock.user + ' since ' + lock.at + ' — use override or releaseLock first'
      );
    }

    const buf = _toBuffer(p.fileBuffer);
    const checksum = _sha256(buf);
    const prev = record.versions[record.versions.length - 1];

    // Append-only: even identical content still creates a new version
    // but flags it so the caller can decide. We keep old rev forever.
    const isIdentical = checksum === prev.checksum;

    const newVersion = prev.version + 1;
    const at = this._clock();
    const rev = {
      version: newVersion,
      checksum,
      size: buf.length,
      author: p.author,
      uploadedAt: at,
      comment: typeof p.comment === 'string' ? p.comment : '',
      lockStatus: 'unlocked',
      tags: ['draft'],
      approvals: [],
      mimeType: prev.mimeType,
      parentVersion: prev.version,
      sourceAction: 'checkin',
      diffSize: buf.length - prev.size,     // signed delta vs previous
      identicalToPrev: isIdentical,
      _bufferBase64: buf.toString('base64'),
    };
    record.versions.push(rev);
    record.updatedAt = at;

    // Auto-release the lock if the check-in comes from the lock holder.
    if (lock && lock.user === p.author) {
      this.locks.delete(docId);
      this._audit(docId, AUDIT_ACTIONS.unlock, p.author, { reason: 'auto after checkin' });
    }

    this._audit(docId, AUDIT_ACTIONS.checkin, p.author, {
      version: newVersion,
      checksum,
      diffSize: rev.diffSize,
      identicalToPrev: isIdentical,
    });

    return { docId, version: newVersion, revision: this._revToPublic(rev) };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.5 checkOut — soft lock with optional override
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {string} docId
   * @param {string} author
   * @param {{override?:boolean, reason?:string}} [opts]
   */
  checkOut(docId, author, opts) {
    _assertStr(docId, 'docId');
    _assertStr(author, 'author');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    if (record.status.id === 'legal_hold') {
      throw new Error('document is under legal hold, cannot check out');
    }

    const existing = this.locks.get(docId);
    const at = this._clock();
    const override = !!(opts && opts.override);

    if (existing) {
      if (existing.user === author) {
        // Idempotent: same user re-checks out → noop, refresh timestamp.
        const refreshed = { user: author, at, override: false };
        this.locks.set(docId, refreshed);
        return { docId, lock: _deepCopy(refreshed), conflict: false };
      }
      if (!override) {
        const err = new Error(
          'lock conflict: held by ' + existing.user + ' since ' + existing.at
        );
        err.code = 'LOCK_CONFLICT';
        err.holder = existing.user;
        err.holderSince = existing.at;
        throw err;
      }
      // Override path — audit loudly.
      this._audit(docId, AUDIT_ACTIONS.override, author, {
        previousHolder: existing.user,
        previousSince: existing.at,
        reason: (opts && opts.reason) || 'unspecified',
      });
    }

    const lock = { user: author, at, override };
    this.locks.set(docId, lock);
    this._audit(docId, AUDIT_ACTIONS.checkout, author, {
      override,
      reason: (opts && opts.reason) || null,
    });
    return { docId, lock: _deepCopy(lock), conflict: false };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.6 releaseLock — explicit unlock
   * ──────────────────────────────────────────────────────────────────── */
  releaseLock(docId, author) {
    _assertStr(docId, 'docId');
    _assertStr(author, 'author');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    const lock = this.locks.get(docId);
    if (!lock) return { docId, released: false, reason: 'not locked' };

    if (lock.user !== author) {
      throw new Error(
        'cannot release lock: held by ' + lock.user + ' — use checkOut override to steal'
      );
    }
    this.locks.delete(docId);
    this._audit(docId, AUDIT_ACTIONS.unlock, author, { reason: 'explicit release' });
    return { docId, released: true };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.7 compareVersions — size delta + metadata diff
   * ──────────────────────────────────────────────────────────────────── */
  compareVersions(docId, v1, v2) {
    _assertStr(docId, 'docId');
    if (!Number.isInteger(v1) || !Number.isInteger(v2)) {
      throw new TypeError('v1/v2 must be integers');
    }
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);

    const a = record.versions.find((v) => v.version === v1);
    const b = record.versions.find((v) => v.version === v2);
    if (!a) throw new RangeError('version not found: v' + v1);
    if (!b) throw new RangeError('version not found: v' + v2);

    const sizeDelta = b.size - a.size;
    const sizePct = a.size === 0 ? null : Number(((sizeDelta / a.size) * 100).toFixed(2));

    return {
      docId,
      from: { version: a.version, checksum: a.checksum, size: a.size, author: a.author, uploadedAt: a.uploadedAt },
      to:   { version: b.version, checksum: b.checksum, size: b.size, author: b.author, uploadedAt: b.uploadedAt },
      sizeDelta,
      sizePct,
      checksumChanged: a.checksum !== b.checksum,
      authorChanged: a.author !== b.author,
      tagsAdded:   b.tags.filter((t) => !a.tags.includes(t)),
      tagsRemoved: a.tags.filter((t) => !b.tags.includes(t)),
      approvalsDelta: b.approvals.length - a.approvals.length,
      commentFrom: a.comment,
      commentTo:   b.comment,
      label: _bilingualLabel(
        'השוואה בין גרסה v' + a.version + ' לגרסה v' + b.version,
        'Compare v' + a.version + ' vs v' + b.version
      ),
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.8 tagVersion — milestone tagging
   * ──────────────────────────────────────────────────────────────────── */
  tagVersion(docId, version, tag) {
    _assertStr(docId, 'docId');
    _assertStr(tag, 'tag');
    if (!Number.isInteger(version) || version < 1) {
      throw new RangeError('version must be positive integer');
    }
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    const rev = record.versions.find((v) => v.version === version);
    if (!rev) throw new RangeError('version not found: v' + version);

    // "published" tag requires completed approval chain.
    if (tag === 'published') {
      if (!record.approvalChain || !record.approvalChain.required.length) {
        throw new Error('cannot publish — no approval chain defined, call approvalChain() first');
      }
      const approvers = new Set(rev.approvals.map((a) => a.userId + '|' + a.role));
      const unmet = record.approvalChain.required.filter(
        (req) => !approvers.has(req.userId + '|' + req.role)
      );
      if (unmet.length > 0) {
        const err = new Error(
          'cannot publish — missing approvals: ' + unmet.map((u) => u.role + '/' + u.userId).join(', ')
        );
        err.code = 'APPROVAL_INCOMPLETE';
        err.missing = unmet;
        throw err;
      }
    }

    if (!rev.tags.includes(tag)) rev.tags.push(tag);
    if (tag === 'legal_hold') record.status = DOC_STATUS.legal_hold;

    this._audit(docId, AUDIT_ACTIONS.tag, 'system', { version, tag });
    return { docId, version, tags: rev.tags.slice() };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.9 rollbackToVersion — copies target into a NEW version (never deletes)
   * ──────────────────────────────────────────────────────────────────── */
  rollbackToVersion(docId, targetVersion, author) {
    _assertStr(docId, 'docId');
    const actor = typeof author === 'string' && author.length ? author : 'system';
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new RangeError('targetVersion must be positive integer');
    }
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    const target = record.versions.find((v) => v.version === targetVersion);
    if (!target) throw new RangeError('version not found: v' + targetVersion);

    const prev = record.versions[record.versions.length - 1];
    const newVersion = prev.version + 1;
    const at = this._clock();
    const rev = {
      version: newVersion,
      checksum: target.checksum,
      size: target.size,
      author: actor,
      uploadedAt: at,
      comment: 'rollback copy of v' + targetVersion,
      lockStatus: 'unlocked',
      tags: ['rollback', 'draft'],
      approvals: [],             // approvals do NOT carry over
      mimeType: target.mimeType,
      parentVersion: prev.version,
      rollbackFrom: targetVersion,
      sourceAction: 'rollback',
      diffSize: target.size - prev.size,
      identicalToPrev: target.checksum === prev.checksum,
      _bufferBase64: target._bufferBase64,
    };
    record.versions.push(rev);
    record.updatedAt = at;
    this._audit(docId, AUDIT_ACTIONS.rollback, actor, {
      newVersion,
      targetVersion,
    });
    return { docId, version: newVersion, revision: this._revToPublic(rev) };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.10 expiryTracking — set or query review/expiry date
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * Without `set` → returns current expiry state + days remaining.
   * With `set` → writes it.
   *   expiryTracking(docId, { set: { effectiveDate, expiryDate, reviewDate, reviewer } })
   */
  expiryTracking(docId, opts) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);

    if (opts && opts.set) {
      _assertObj(opts.set, 'expiry.set');
      const set = opts.set;
      record.expiry = {
        effectiveDate: set.effectiveDate || null,
        expiryDate:    set.expiryDate    || null,
        reviewDate:    set.reviewDate    || null,
        reviewer:      set.reviewer      || null,
        updatedAt:     this._clock(),
      };
      this._audit(docId, AUDIT_ACTIONS.expiry, set.reviewer || 'system', _deepCopy(record.expiry));
    }

    if (!record.expiry) {
      return { docId, expiry: null, status: 'no-expiry' };
    }

    const now = new Date(this._clock()).getTime();
    const exp = record.expiry.expiryDate ? new Date(record.expiry.expiryDate).getTime() : null;
    const rev = record.expiry.reviewDate ? new Date(record.expiry.reviewDate).getTime() : null;
    const daysExp = exp == null ? null : Math.floor((exp - now) / 86400000);
    const daysRev = rev == null ? null : Math.floor((rev - now) / 86400000);

    let status = 'active';
    if (exp != null && exp < now) status = 'expired';
    else if (rev != null && rev < now) status = 'review-overdue';
    else if (daysExp != null && daysExp <= 30) status = 'expiring-soon';

    return {
      docId,
      expiry: _deepCopy(record.expiry),
      daysUntilExpiry: daysExp,
      daysUntilReview: daysRev,
      status,
      label: _bilingualLabel(
        'מצב תוקף: ' + status,
        'Expiry status: ' + status
      ),
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.11 approvalChain — define or approve a step
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * Modes:
   *   approvalChain(docId, [{role,userId}, ...])        // define required chain
   *   approvalChain(docId, null, {approve:{version,role,userId,comment}})  // sign off
   *   approvalChain(docId)                               // read state
   */
  approvalChain(docId, approvers, extra) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);

    if (Array.isArray(approvers)) {
      if (approvers.length === 0) {
        throw new RangeError('approvers must be non-empty array');
      }
      const required = approvers.map((a) => {
        _assertObj(a, 'approver');
        _assertStr(a.role, 'approver.role');
        _assertStr(a.userId, 'approver.userId');
        return { role: a.role, userId: a.userId };
      });
      record.approvalChain = {
        required,
        definedAt: this._clock(),
      };
      this._audit(docId, AUDIT_ACTIONS.approve, 'system', {
        defined: required,
      });
    }

    if (extra && extra.approve) {
      _assertObj(extra.approve, 'approve');
      const ap = extra.approve;
      _assertStr(ap.role, 'approve.role');
      _assertStr(ap.userId, 'approve.userId');
      if (!Number.isInteger(ap.version) || ap.version < 1) {
        throw new RangeError('approve.version must be positive integer');
      }
      if (!record.approvalChain) {
        throw new Error('no approval chain defined for ' + docId);
      }
      const known = record.approvalChain.required.find(
        (r) => r.role === ap.role && r.userId === ap.userId
      );
      if (!known) {
        throw new Error('approver ' + ap.userId + '/' + ap.role + ' is not in the required chain');
      }
      const rev = record.versions.find((v) => v.version === ap.version);
      if (!rev) throw new RangeError('version not found: v' + ap.version);
      // Append-only log of approvals.
      rev.approvals.push({
        role: ap.role,
        userId: ap.userId,
        approvedAt: this._clock(),
        comment: typeof ap.comment === 'string' ? ap.comment : '',
      });
      this._audit(docId, AUDIT_ACTIONS.approve, ap.userId, {
        version: ap.version,
        role: ap.role,
      });
    }

    return {
      docId,
      chain: _deepCopy(record.approvalChain),
      versions: record.versions.map((v) => ({
        version: v.version,
        approvals: _deepCopy(v.approvals),
      })),
    };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.12 searchByContent — full-text search via injected extractor
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {string} query            Case-insensitive substring.
   * @param {(buf:Buffer, mimeType:string)=>string} [textExtractor]
   *        Callback that returns extracted text for a given buffer. The
   *        module never tries to parse PDF / DOCX on its own — callers
   *        inject their own extractor (or this one defaults to utf-8 decode).
   */
  searchByContent(query, textExtractor) {
    _assertStr(query, 'query');
    const extractor = typeof textExtractor === 'function'
      ? textExtractor
      : (buf /* , mimeType */) => buf.toString('utf8');

    const q = query.toLowerCase();
    const matches = [];

    for (const record of this.documents.values()) {
      if (record.status.id === 'archived') {
        // still searchable but flagged
      }
      // Search latest version's text + title fields.
      const latest = record.versions[record.versions.length - 1];
      const buf = Buffer.from(latest._bufferBase64, 'base64');
      let text = '';
      try {
        text = String(extractor(buf, latest.mimeType) || '');
      } catch (_e) {
        text = '';
      }
      const haystack = [
        record.title_he,
        record.title_en,
        record.department || '',
        text,
      ].join(' \u2003 ').toLowerCase();
      if (haystack.indexOf(q) !== -1) {
        matches.push({
          docId: record.docId,
          docType: record.docType,
          title_he: record.title_he,
          title_en: record.title_en,
          version: latest.version,
          status: record.status,
          archived: record.status.id === 'archived',
        });
      }
    }

    this._audit('*', AUDIT_ACTIONS.search, 'system', { query, hits: matches.length });
    return matches;
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.13 watermark — store bilingual overlay spec (no rendering)
   * ──────────────────────────────────────────────────────────────────── */
  /**
   * @param {string} docId
   * @param {string|{he:string,en:string}} text
   * @param {{position?:string, opacity?:number, colorHex?:string, version?:number}} [opts]
   */
  watermark(docId, text, opts) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    const o = opts || {};
    let he, en;
    if (typeof text === 'string') {
      _assertStr(text, 'text');
      he = text;
      en = text;
    } else {
      _assertObj(text, 'text');
      _assertStr(text.he, 'text.he');
      _assertStr(text.en, 'text.en');
      he = text.he;
      en = text.en;
    }

    const spec = {
      id: 'WM-' + (record.watermarks.length + 1),
      text: _bilingualLabel(he, en),
      position: o.position || 'diagonal',      // diagonal | header | footer | center
      opacity: typeof o.opacity === 'number' ? Math.min(1, Math.max(0, o.opacity)) : 0.35,
      colorHex: typeof o.colorHex === 'string' ? o.colorHex : '#CC0000',
      appliesToVersion: Number.isInteger(o.version) && o.version > 0 ? o.version : 'all',
      stampedAt: this._clock(),
      rendering: 'overlay-spec',               // explicit: we do NOT render
    };
    record.watermarks.push(spec);
    this._audit(docId, AUDIT_ACTIONS.watermark, 'system', {
      id: spec.id,
      appliesToVersion: spec.appliesToVersion,
    });
    return { docId, watermark: _deepCopy(spec) };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.14 auditTrail — immutable per-doc log
   * ──────────────────────────────────────────────────────────────────── */
  auditTrail(docId) {
    _assertStr(docId, 'docId');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    // Return a deep copy so callers cannot mutate the underlying log.
    return record.audit.map((e) => _deepCopy(e));
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.15 archiveDocument — status flip, never deletes
   * ──────────────────────────────────────────────────────────────────── */
  archiveDocument(docId, reason) {
    _assertStr(docId, 'docId');
    _assertStr(reason, 'reason');
    const record = this.documents.get(docId);
    if (!record) throw new RangeError('unknown docId: ' + docId);
    if (record.status.id === 'legal_hold') {
      throw new Error('document is under legal hold, cannot archive');
    }
    record.status = DOC_STATUS.archived;
    record.updatedAt = this._clock();
    this._audit(docId, AUDIT_ACTIONS.archive, 'system', { reason });
    return { docId, status: record.status, reason };
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2.16 Internal helpers
   * ──────────────────────────────────────────────────────────────────── */
  _audit(docId, action, user, detail) {
    const entry = {
      at: this._clock(),
      docId,
      action: action.id || String(action),
      actionLabel: action.he ? { he: action.he, en: action.en } : null,
      user: user || 'system',
      detail: _deepCopy(detail || {}),
    };
    // Per-doc audit (immutable append) — lives on the record, never rewritten.
    const record = docId === '*' ? null : this.documents.get(docId);
    if (record) record.audit.push(entry);
    // Global ring (append-only).
    this.globalAudit.push(entry);
    return entry;
  }

  _revToPublic(rev) {
    // Strip the internal base64 buffer when returning metadata only.
    const out = _deepCopy(rev);
    delete out._bufferBase64;
    return out;
  }

  _publicCopy(record) {
    const out = _deepCopy(record);
    out.versions = out.versions.map((v) => {
      const c = Object.assign({}, v);
      delete c._bufferBase64;
      return c;
    });
    return out;
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  DocumentVC,
  DOC_TYPES,
  DOC_STATUS,
  MILESTONE_TAGS,
  AUDIT_ACTIONS,
  // Exposed for tests only — do not rely on in app code.
  _internals: { _sha256, _toBuffer, _bilingualLabel },
};
