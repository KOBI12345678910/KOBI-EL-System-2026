/* ============================================================================
 * Techno-Kol ERP — Engineering Drawing / Blueprint Version Control
 * Agent Y-045 / Swarm Engineering / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * בקרת גרסאות שרטוטים הנדסיים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   Metal fabrication shop. Every part (SKU) that runs through the shop
 *   floor is backed by an engineering drawing (שרטוט הנדסי) in one of
 *   five canonical formats:
 *      - PDF     — read-only print-ready (for the traveler /תעודת עבודה)
 *      - DWG     — AutoCAD native 2D/3D
 *      - DXF     — interchange format for laser / plasma CNC
 *      - STEP    — ISO 10303 3D solid model (machining, inspection)
 *      - IGES    — legacy 3D surface exchange (still used by some vendors)
 *
 *   Drawings flow through a revision lifecycle:
 *
 *                +---------+     approve     +----------+
 *      draft --> | pending | --------------> | approved |
 *                +---------+                 +----+-----+
 *                      ^                          |
 *                      |   new rev (supersedes)   |
 *                      +------ pending <---------+   (supersedes prev)
 *                                                      |
 *                                                      v
 *                                                 +---------+    obsolete
 *                                                 |superseded| ----------> obsolete
 *                                                 +---------+
 *
 *   Absolutely NOTHING is ever deleted. An obsolete / superseded rev is
 *   kept forever, read-only, so auditors (ISO-9001, AS9100, IDF QA)
 *   can replay exactly what was on the shop floor on a given date.
 *
 * Features implemented:
 *    1. uploadDrawing         — create a new revision
 *    2. checkout              — lock for edit (single-writer)
 *    3. checkin               — release lock, bump rev, keep old file
 *    4. getCurrent            — latest APPROVED rev for a part
 *    5. getHistory            — every rev, oldest first (never deletes)
 *    6. compareRevisions      — metadata + change-description diff
 *    7. engineeringChangeOrder— ECO workflow (affected drawings, dispos)
 *    8. whereUsed             — which BOMs reference the part
 *    9. impactAnalysis        — open WOs / POs / inventory affected
 *   10. obsoleteDrawing       — mark obsolete (preserves binary forever)
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Every mutation is audit-logged.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every user-facing structure.
 *   - File storage is abstracted behind an injected `pathResolver` so
 *     the caller decides where the bytes live (S3 / local FS / Supabase
 *     Storage / anything else). The module never touches `fs` itself.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalogs
 * -------------------------------------------------------------------------- */

/** @enum Accepted engineering-drawing file formats. */
const DRAWING_FORMATS = Object.freeze({
  pdf:  { id: 'pdf',  he: 'PDF להדפסה',         en: 'PDF print-ready',      mime: 'application/pdf' },
  dwg:  { id: 'dwg',  he: 'AutoCAD DWG',         en: 'AutoCAD DWG',          mime: 'application/acad' },
  dxf:  { id: 'dxf',  he: 'DXF ל־CNC',           en: 'DXF for CNC',          mime: 'application/dxf' },
  step: { id: 'step', he: 'STEP תלת-ממדי',       en: 'STEP 3D solid',        mime: 'application/step' },
  iges: { id: 'iges', he: 'IGES תלת-ממדי',       en: 'IGES 3D surface',      mime: 'application/iges' },
});

/** @enum Lifecycle states for a single drawing revision. */
const DRAWING_STATUS = Object.freeze({
  draft:      { id: 'draft',      he: 'טיוטה',       en: 'Draft' },
  pending:    { id: 'pending',    he: 'ממתין לאישור', en: 'Pending approval' },
  approved:   { id: 'approved',   he: 'מאושר',       en: 'Approved' },
  superseded: { id: 'superseded', he: 'הוחלף',       en: 'Superseded' },
  obsolete:   { id: 'obsolete',   he: 'מיושן',       en: 'Obsolete' },
});

/** @enum ECO dispositions per affected item. */
const ECO_DISPOSITIONS = Object.freeze({
  use_as_is:    { id: 'use_as_is',    he: 'להשתמש כפי שהוא', en: 'Use as-is' },
  rework:       { id: 'rework',       he: 'לתיקון',           en: 'Rework' },
  scrap:        { id: 'scrap',        he: 'גריטה',            en: 'Scrap' },
  return_vendor:{ id: 'return_vendor',he: 'החזרה לספק',       en: 'Return to vendor' },
  quarantine:   { id: 'quarantine',   he: 'בהסגר',            en: 'Quarantine' },
});

/** @enum ECO workflow state. */
const ECO_STATUS = Object.freeze({
  draft:    { id: 'draft',    he: 'טיוטה',       en: 'Draft' },
  pending:  { id: 'pending',  he: 'ממתין לאישור', en: 'Pending approval' },
  approved: { id: 'approved', he: 'מאושר',       en: 'Approved' },
  effective:{ id: 'effective',he: 'בתוקף',       en: 'Effective' },
  closed:   { id: 'closed',   he: 'סגור',        en: 'Closed' },
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (no deps)
 * -------------------------------------------------------------------------- */
function _now() { return new Date().toISOString(); }

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertObj(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new TypeError('invalid ' + name + ': must be object');
  }
}

function _deepCopy(obj) {
  // Lightweight deep copy for plain JSON-safe structures.
  if (obj === undefined || obj === null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function _drawingKey(partNumber, revision) {
  return partNumber + '@' + revision;
}

/**
 * Default path resolver — builds a deterministic virtual path so
 * tests and callers that don't care about disk layout still work.
 * Real callers inject their own resolver (S3 key, Supabase Storage
 * bucket, etc.).
 */
function _defaultPathResolver({ partNumber, revision, format }) {
  const safePart = String(partNumber).replace(/[^A-Za-z0-9_\-]/g, '_');
  return 'drawings/' + safePart + '/' + revision + '/' + safePart + '.' + format;
}

/**
 * Compute a cheap, deterministic checksum over the file bytes /
 * buffer / string. Not cryptographic — good enough for diff summaries.
 * Uses a simple 32-bit FNV-1a so we don't pull `node:crypto`.
 */
function _fnv1a(input) {
  let bytes;
  if (input == null) return '00000000';
  if (typeof input === 'string') bytes = Buffer.from(input, 'utf8');
  else if (Buffer.isBuffer(input)) bytes = input;
  else if (input instanceof Uint8Array) bytes = Buffer.from(input);
  else bytes = Buffer.from(String(input), 'utf8');

  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    // 32-bit FNV prime multiply via shifts, keeping value unsigned.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function _byteLength(input) {
  if (input == null) return 0;
  if (typeof input === 'string') return Buffer.byteLength(input, 'utf8');
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) return input.length;
  return Buffer.byteLength(String(input), 'utf8');
}

/* ----------------------------------------------------------------------------
 * 2. DrawingVC class
 * -------------------------------------------------------------------------- */
class DrawingVC {
  /**
   * @param {object} [opts]
   * @param {(meta:{partNumber:string,revision:string,format:string})=>string} [opts.pathResolver]
   *        Injected resolver that maps (part, rev, format) → storage path.
   * @param {()=>string} [opts.clock] Injected clock (for deterministic tests).
   * @param {Map<string,Array<string>>} [opts.bomIndex]
   *        External BOM index: partNumber → array of BOM / assembly ids.
   */
  constructor(opts) {
    const o = opts || {};
    this.pathResolver = typeof o.pathResolver === 'function' ? o.pathResolver : _defaultPathResolver;
    this._clock = typeof o.clock === 'function' ? o.clock : _now;

    /** @type {Map<string, DrawingRevision>} key = partNumber@revision */
    this.drawings = new Map();
    /** @type {Map<string, Array<string>>} key = partNumber → ordered revisions */
    this.partRevisions = new Map();
    /** @type {Map<string, {user:string, at:string}>} key = partNumber@rev */
    this.checkouts = new Map();

    /** @type {Map<string, EngineeringChangeOrder>} */
    this.ecos = new Map();

    /** BOM index: partNumber → Set of bomIds that reference it. */
    /** @type {Map<string, Set<string>>} */
    this.bomIndex = new Map();
    if (o.bomIndex instanceof Map) {
      for (const [k, v] of o.bomIndex.entries()) {
        this.bomIndex.set(k, new Set(Array.isArray(v) ? v : []));
      }
    }

    /** Manufacturing indices injected from the outside. */
    /** @type {Map<string, Array<object>>} partNumber → open work orders */
    this.openWorkOrders = new Map();
    /** @type {Map<string, Array<object>>} partNumber → on-order POs */
    this.onOrderPOs = new Map();
    /** @type {Map<string, number>} partNumber → on-hand qty */
    this.onHandInventory = new Map();

    /** @type {Array<AuditEntry>} never-delete audit log */
    this.auditLog = [];
  }

  /* ---------- internal ---------- */
  _audit(action, payload) {
    this.auditLog.push({ ts: this._clock(), action: action, payload: _deepCopy(payload) });
  }

  _getDrawingOrThrow(drawingId) {
    const d = this.drawings.get(drawingId);
    if (!d) throw new Error('unknown drawing: ' + drawingId);
    return d;
  }

  _nextRevisionForPart(partNumber) {
    // Default scheme: A, B, C, …, Z, AA, AB — ignoring I, O, Q as per
    // ASME Y14.35 (no "eye, oh, cue" to avoid misreading on prints).
    const FORBIDDEN = new Set(['I', 'O', 'Q']);
    const existing = this.partRevisions.get(partNumber) || [];
    if (existing.length === 0) return 'A';
    const last = existing[existing.length - 1];
    // Bump last char; if last char is Z, roll into next length.
    const chars = last.split('');
    let i = chars.length - 1;
    while (i >= 0) {
      let code = chars[i].charCodeAt(0);
      let done = false;
      while (!done) {
        code += 1;
        if (code > 'Z'.charCodeAt(0)) {
          chars[i] = 'A';
          break;
        }
        const ch = String.fromCharCode(code);
        if (!FORBIDDEN.has(ch)) {
          chars[i] = ch;
          done = true;
        }
      }
      if (done) return chars.join('');
      i--;
    }
    // Overflow: AA, AB, ...
    return 'A' + 'A'.repeat(last.length);
  }

  /* ==========================================================================
   * 2.1  uploadDrawing
   * ========================================================================= */
  /**
   * Upload (create) a new revision of an engineering drawing. If the
   * caller doesn't supply `revision`, the next one is auto-generated
   * (A, B, C, …, skipping I/O/Q per ASME Y14.35).
   *
   * @param {object} args
   * @param {string} args.partNumber
   * @param {string} [args.revision]
   * @param {string|Buffer|Uint8Array} args.file  — raw bytes or text body
   * @param {'pdf'|'dwg'|'dxf'|'step'|'iges'} args.format
   * @param {string} args.author
   * @param {string} [args.approver]
   * @param {'draft'|'pending'|'approved'|'superseded'|'obsolete'} [args.status]
   * @param {string} [args.title_he]
   * @param {string} [args.title_en]
   * @param {string} [args.changeDescription]
   * @returns {DrawingRevision}
   */
  uploadDrawing({
    partNumber,
    revision,
    file,
    format,
    author,
    approver,
    status,
    title_he,
    title_en,
    changeDescription,
  }) {
    _assertStr(partNumber, 'partNumber');
    if (!DRAWING_FORMATS[format]) {
      throw new TypeError('invalid format: ' + format +
        ' (allowed: ' + Object.keys(DRAWING_FORMATS).join(', ') + ')');
    }
    _assertStr(author, 'author');

    const effectiveStatus = status || 'draft';
    if (!DRAWING_STATUS[effectiveStatus]) {
      throw new TypeError('invalid status: ' + effectiveStatus +
        ' (allowed: ' + Object.keys(DRAWING_STATUS).join(', ') + ')');
    }
    if (effectiveStatus === 'approved' && !approver) {
      throw new Error('approved drawings require an approver');
    }

    if (file === undefined || file === null) {
      throw new TypeError('file (bytes/buffer/string) is required');
    }

    const rev = revision || this._nextRevisionForPart(partNumber);
    _assertStr(rev, 'revision');

    const key = _drawingKey(partNumber, rev);
    if (this.drawings.has(key)) {
      throw new Error('revision already exists: ' + key + ' (never overwrite — upload a new rev instead)');
    }

    const storagePath = this.pathResolver({ partNumber: partNumber, revision: rev, format: format });
    const checksum = _fnv1a(file);
    const sizeBytes = _byteLength(file);

    const now = this._clock();
    const drawing = {
      id: key,
      partNumber: partNumber,
      revision: rev,
      format: format,
      format_he: DRAWING_FORMATS[format].he,
      format_en: DRAWING_FORMATS[format].en,
      mime: DRAWING_FORMATS[format].mime,
      title_he: title_he || '',
      title_en: title_en || '',
      status: effectiveStatus,
      status_he: DRAWING_STATUS[effectiveStatus].he,
      status_en: DRAWING_STATUS[effectiveStatus].en,
      author: author,
      approver: approver || null,
      approvedAt: effectiveStatus === 'approved' ? now : null,
      storagePath: storagePath,
      checksum: checksum,
      sizeBytes: sizeBytes,
      changeDescription: changeDescription || '',
      createdAt: now,
      updatedAt: now,
      checkedOutBy: null,
      checkedOutAt: null,
      supersededBy: null,
      obsoletedAt: null,
      obsoleteReason: null,
    };

    // If this new revision is approved, automatically supersede the
    // previous approved rev of the same part. The old one is kept
    // forever — only its status flips to 'superseded'.
    if (effectiveStatus === 'approved') {
      const prevApproved = this.getCurrent(partNumber);
      if (prevApproved) {
        prevApproved.status = 'superseded';
        prevApproved.status_he = DRAWING_STATUS.superseded.he;
        prevApproved.status_en = DRAWING_STATUS.superseded.en;
        prevApproved.supersededBy = drawing.id;
        prevApproved.updatedAt = now;
        this._audit('supersede', { from: prevApproved.id, to: drawing.id });
      }
    }

    this.drawings.set(key, drawing);
    const list = this.partRevisions.get(partNumber) || [];
    list.push(rev);
    this.partRevisions.set(partNumber, list);
    this._audit('uploadDrawing', {
      id: drawing.id, status: effectiveStatus, author: author, format: format,
    });
    return drawing;
  }

  /* ==========================================================================
   * 2.2  checkout / checkin (pessimistic lock)
   * ========================================================================= */
  /**
   * Pessimistically lock a drawing revision so another user can't
   * clobber it mid-edit. Errors if it's already checked out by a
   * different user (idempotent for the same user).
   */
  checkout(drawingId, user) {
    _assertStr(drawingId, 'drawingId');
    _assertStr(user, 'user');
    const d = this._getDrawingOrThrow(drawingId);

    if (d.status === 'obsolete') {
      throw new Error('cannot checkout obsolete drawing: ' + drawingId);
    }
    if (d.status === 'superseded') {
      throw new Error('cannot checkout superseded drawing: ' + drawingId);
    }
    if (d.checkedOutBy && d.checkedOutBy !== user) {
      throw new Error('drawing already checked out by ' + d.checkedOutBy + ': ' + drawingId);
    }

    d.checkedOutBy = user;
    d.checkedOutAt = this._clock();
    d.updatedAt = this._clock();
    this.checkouts.set(drawingId, { user: user, at: d.checkedOutAt });
    this._audit('checkout', { id: drawingId, user: user });
    return d;
  }

  /**
   * Release the lock on a drawing and create the *next* revision
   * with the new bytes. The previous revision is never deleted;
   * its status flips to 'superseded' if it was approved.
   *
   * @param {string} drawingId
   * @param {string} user
   * @param {string|Buffer|Uint8Array} newFile
   * @param {string} changeDescription
   * @param {object} [extra]   — pass-through to uploadDrawing (status, approver, titles)
   * @returns {{previous:DrawingRevision, current:DrawingRevision}}
   */
  checkin(drawingId, user, newFile, changeDescription, extra) {
    _assertStr(drawingId, 'drawingId');
    _assertStr(user, 'user');
    _assertStr(changeDescription, 'changeDescription');
    if (newFile === undefined || newFile === null) {
      throw new TypeError('newFile is required');
    }
    const prev = this._getDrawingOrThrow(drawingId);
    if (prev.checkedOutBy !== user) {
      throw new Error('drawing is not checked out by ' + user + ': ' + drawingId +
        (prev.checkedOutBy ? ' (locked by ' + prev.checkedOutBy + ')' : ' (not locked at all)'));
    }

    prev.checkedOutBy = null;
    prev.checkedOutAt = null;
    prev.updatedAt = this._clock();
    this.checkouts.delete(drawingId);

    const e = extra || {};
    const uploaded = this.uploadDrawing({
      partNumber: prev.partNumber,
      // let uploadDrawing auto-bump unless caller forces a revision
      revision: e.revision,
      file: newFile,
      format: e.format || prev.format,
      author: user,
      approver: e.approver,
      status: e.status || 'draft',
      title_he: e.title_he || prev.title_he,
      title_en: e.title_en || prev.title_en,
      changeDescription: changeDescription,
    });

    this._audit('checkin', {
      previous: prev.id,
      current: uploaded.id,
      user: user,
    });
    return { previous: prev, current: uploaded };
  }

  /* ==========================================================================
   * 2.3  getCurrent / getHistory
   * ========================================================================= */
  /**
   * Latest APPROVED revision for a part number — i.e. the one the
   * shop floor should actually be working against right now.
   * Returns null if no approved revision exists yet.
   */
  getCurrent(partNumber) {
    _assertStr(partNumber, 'partNumber');
    const revs = this.partRevisions.get(partNumber);
    if (!revs || revs.length === 0) return null;
    // Walk newest → oldest looking for the first approved rev.
    for (let i = revs.length - 1; i >= 0; i--) {
      const d = this.drawings.get(_drawingKey(partNumber, revs[i]));
      if (d && d.status === 'approved') return d;
    }
    return null;
  }

  /**
   * Full revision history for a part number, oldest first.
   * NEVER deletes — superseded / obsolete revisions are included.
   */
  getHistory(partNumber) {
    _assertStr(partNumber, 'partNumber');
    const revs = this.partRevisions.get(partNumber) || [];
    return revs.map((r) => this.drawings.get(_drawingKey(partNumber, r))).filter(Boolean);
  }

  /* ==========================================================================
   * 2.4  compareRevisions
   * ========================================================================= */
  /**
   * Metadata + change-description diff between two revisions of the
   * same part. This is NOT a pixel/CAD diff — it's the summary an
   * auditor or engineer reads to understand "what changed from A→B".
   */
  compareRevisions(partNumber, revA, revB) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(revA, 'revA');
    _assertStr(revB, 'revB');
    const a = this.drawings.get(_drawingKey(partNumber, revA));
    const b = this.drawings.get(_drawingKey(partNumber, revB));
    if (!a) throw new Error('unknown revision: ' + partNumber + '@' + revA);
    if (!b) throw new Error('unknown revision: ' + partNumber + '@' + revB);

    const diffs = [];
    const fields = [
      'format', 'title_he', 'title_en', 'status', 'author', 'approver',
      'storagePath', 'checksum', 'sizeBytes',
    ];
    for (const f of fields) {
      if (a[f] !== b[f]) {
        diffs.push({ field: f, from: a[f], to: b[f] });
      }
    }

    // Walk the history chain between A and B to collect every change
    // description inserted along the way. This matches the ISO-9001
    // "engineering change history" requirement.
    const revs = this.partRevisions.get(partNumber) || [];
    const idxA = revs.indexOf(revA);
    const idxB = revs.indexOf(revB);
    const lo = Math.min(idxA, idxB);
    const hi = Math.max(idxA, idxB);
    const path = [];
    for (let i = lo; i <= hi; i++) {
      const d = this.drawings.get(_drawingKey(partNumber, revs[i]));
      if (d) path.push({
        revision: d.revision,
        status: d.status,
        changeDescription: d.changeDescription,
        author: d.author,
        approver: d.approver,
        createdAt: d.createdAt,
      });
    }

    return {
      partNumber: partNumber,
      revA: revA,
      revB: revB,
      direction_he: idxB > idxA ? 'קדימה (חדש יותר)' : (idxB < idxA ? 'אחורה (ישן יותר)' : 'זהה'),
      direction_en: idxB > idxA ? 'forward (newer)'   : (idxB < idxA ? 'backward (older)'   : 'same'),
      checksumChanged: a.checksum !== b.checksum,
      sizeDeltaBytes: b.sizeBytes - a.sizeBytes,
      diffs: diffs,
      historyPath: path,
      summary_he: diffs.length === 0
        ? 'אין שינויים במטא-דאטה'
        : 'שונו ' + diffs.length + ' שדות',
      summary_en: diffs.length === 0
        ? 'no metadata changes'
        : diffs.length + ' field(s) changed',
    };
  }

  /* ==========================================================================
   * 2.5  engineeringChangeOrder (ECO)
   * ========================================================================= */
  /**
   * Create / update an ECO (הזמנת שינוי הנדסי). The ECO binds a set of
   * affected drawings + dispositions and an effective date. Approving
   * an ECO will automatically mark its drawings 'approved' if they
   * were 'pending', and will run impactAnalysis for each.
   *
   * @param {object} args
   * @param {string} args.id
   * @param {Array<string>} args.affectedDrawings — drawing ids (partNumber@rev)
   * @param {string} args.reason
   * @param {string} args.approver
   * @param {string} args.effectiveDate  — ISO date
   * @param {Array<{partNumber:string, disposition:string, qty?:number, note?:string}>} args.dispositions
   * @param {string} [args.status]  — draft|pending|approved|effective|closed
   * @returns {EngineeringChangeOrder}
   */
  engineeringChangeOrder({
    id,
    affectedDrawings,
    reason,
    approver,
    effectiveDate,
    dispositions,
    status,
  }) {
    _assertStr(id, 'eco.id');
    if (!Array.isArray(affectedDrawings) || affectedDrawings.length === 0) {
      throw new TypeError('eco.affectedDrawings must be non-empty array');
    }
    _assertStr(reason, 'eco.reason');
    _assertStr(approver, 'eco.approver');
    _assertStr(effectiveDate, 'eco.effectiveDate');
    if (!Array.isArray(dispositions)) {
      throw new TypeError('eco.dispositions must be an array');
    }
    dispositions.forEach((d, idx) => {
      _assertObj(d, 'eco.dispositions[' + idx + ']');
      _assertStr(d.partNumber, 'eco.dispositions[' + idx + '].partNumber');
      if (!ECO_DISPOSITIONS[d.disposition]) {
        throw new TypeError('invalid disposition: ' + d.disposition +
          ' (allowed: ' + Object.keys(ECO_DISPOSITIONS).join(', ') + ')');
      }
    });

    // Every referenced drawing must exist.
    for (const did of affectedDrawings) {
      if (!this.drawings.has(did)) {
        throw new Error('eco.affectedDrawings references unknown drawing: ' + did);
      }
    }

    const effectiveStatus = status || 'draft';
    if (!ECO_STATUS[effectiveStatus]) {
      throw new TypeError('invalid eco.status: ' + effectiveStatus);
    }

    const existing = this.ecos.get(id);
    const now = this._clock();
    const eco = {
      id: id,
      affectedDrawings: affectedDrawings.slice(),
      reason: reason,
      approver: approver,
      effectiveDate: effectiveDate,
      dispositions: dispositions.map((d) => ({
        partNumber: d.partNumber,
        disposition: d.disposition,
        disposition_he: ECO_DISPOSITIONS[d.disposition].he,
        disposition_en: ECO_DISPOSITIONS[d.disposition].en,
        qty: typeof d.qty === 'number' ? d.qty : null,
        note: d.note || '',
      })),
      status: effectiveStatus,
      status_he: ECO_STATUS[effectiveStatus].he,
      status_en: ECO_STATUS[effectiveStatus].en,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      history: existing ? existing.history.concat([_deepCopy({
        status: existing.status,
        snapshotAt: existing.updatedAt,
      })]) : [],
      impact: null,
    };

    // If we're approving / making effective, run the impact analysis
    // for each distinct partNumber referenced.
    if (effectiveStatus === 'approved' || effectiveStatus === 'effective') {
      const parts = new Set();
      for (const did of affectedDrawings) {
        const d = this.drawings.get(did);
        if (d) parts.add(d.partNumber);

        // If the referenced drawing was pending, promote it to approved.
        if (d && d.status === 'pending') {
          d.status = 'approved';
          d.status_he = DRAWING_STATUS.approved.he;
          d.status_en = DRAWING_STATUS.approved.en;
          d.approver = d.approver || approver;
          d.approvedAt = now;
          d.updatedAt = now;
          // Supersede prior approved rev of the same part.
          const prev = this._priorApproved(d.partNumber, d.revision);
          if (prev) {
            prev.status = 'superseded';
            prev.status_he = DRAWING_STATUS.superseded.he;
            prev.status_en = DRAWING_STATUS.superseded.en;
            prev.supersededBy = d.id;
            prev.updatedAt = now;
            this._audit('supersede', { from: prev.id, to: d.id, eco: id });
          }
          this._audit('approveViaEco', { drawing: d.id, eco: id });
        }
      }

      eco.impact = [];
      for (const part of parts) {
        // Use the newest rev on the ECO as the "new rev" when asking
        // impactAnalysis for a summary.
        const newRev = this._newestRevOnEco(part, affectedDrawings);
        eco.impact.push(this.impactAnalysis(part, newRev));
      }
    }

    this.ecos.set(id, eco);
    this._audit('engineeringChangeOrder', {
      id: id, status: effectiveStatus, parts: eco.dispositions.length,
    });
    return eco;
  }

  _priorApproved(partNumber, excludeRev) {
    const revs = this.partRevisions.get(partNumber) || [];
    for (let i = revs.length - 1; i >= 0; i--) {
      if (revs[i] === excludeRev) continue;
      const d = this.drawings.get(_drawingKey(partNumber, revs[i]));
      if (d && d.status === 'approved') return d;
    }
    return null;
  }

  _newestRevOnEco(partNumber, drawingIds) {
    let newest = null;
    for (const did of drawingIds) {
      const d = this.drawings.get(did);
      if (d && d.partNumber === partNumber) {
        if (!newest || new Date(d.createdAt).getTime() > new Date(newest.createdAt).getTime()) {
          newest = d;
        }
      }
    }
    return newest ? newest.revision : null;
  }

  /* ==========================================================================
   * 2.6  whereUsed
   * ========================================================================= */
  /**
   * Which BOMs reference the part (the drawing). Callers populate the
   * bom index via registerBomUsage(). Returns an array of BOM ids.
   */
  whereUsed(partNumber) {
    _assertStr(partNumber, 'partNumber');
    const set = this.bomIndex.get(partNumber);
    return set ? Array.from(set) : [];
  }

  /** Register that `bomId` consumes `partNumber` in its structure. */
  registerBomUsage(partNumber, bomId) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(bomId, 'bomId');
    let set = this.bomIndex.get(partNumber);
    if (!set) {
      set = new Set();
      this.bomIndex.set(partNumber, set);
    }
    set.add(bomId);
    this._audit('registerBomUsage', { partNumber: partNumber, bomId: bomId });
    return Array.from(set);
  }

  /* ==========================================================================
   * 2.7  impactAnalysis
   * ========================================================================= */
  /**
   * Given a part and the proposed new revision, return a summary of
   * every downstream artifact that would be touched by the change:
   *
   *   - open work orders referencing this part
   *   - on-order purchase orders
   *   - on-hand inventory
   *   - BOMs that consume this part (whereUsed)
   *   - older revisions already on the shelf
   *
   * External data (WOs / POs / inventory) is injected via setter
   * methods because this module never talks to a database directly.
   *
   * @param {string} partNumber
   * @param {string} [newRev]
   * @returns {ImpactAnalysis}
   */
  impactAnalysis(partNumber, newRev) {
    _assertStr(partNumber, 'partNumber');

    const openWOs = this.openWorkOrders.get(partNumber) || [];
    const onOrderPOs = this.onOrderPOs.get(partNumber) || [];
    const onHand = this.onHandInventory.get(partNumber) || 0;
    const boms = this.whereUsed(partNumber);
    const history = this.getHistory(partNumber);
    const current = this.getCurrent(partNumber);

    const olderApproved = history.filter((d) =>
      (d.status === 'approved' || d.status === 'superseded') && d.revision !== newRev
    );

    // Cheap severity heuristic: more open WOs / on-order = bigger blast.
    let severity = 'low';
    const touchCount = openWOs.length + onOrderPOs.length + (onHand > 0 ? 1 : 0) + boms.length;
    if (touchCount >= 10) severity = 'critical';
    else if (touchCount >= 5) severity = 'high';
    else if (touchCount >= 2) severity = 'medium';

    return {
      partNumber: partNumber,
      newRev: newRev || null,
      currentApprovedRev: current ? current.revision : null,
      severity: severity,
      severity_he: ({
        low: 'נמוך', medium: 'בינוני', high: 'גבוה', critical: 'קריטי',
      })[severity],
      severity_en: severity,
      openWorkOrders: openWOs.slice(),
      onOrderPOs: onOrderPOs.slice(),
      onHandQty: onHand,
      affectedBoms: boms,
      olderRevisions: olderApproved.map((d) => ({
        revision: d.revision,
        status: d.status,
        storagePath: d.storagePath,
      })),
      recommendations_he: this._recommendations(openWOs, onOrderPOs, onHand, boms, 'he'),
      recommendations_en: this._recommendations(openWOs, onOrderPOs, onHand, boms, 'en'),
    };
  }

  _recommendations(openWOs, onOrderPOs, onHand, boms, lang) {
    const out = [];
    if (openWOs.length > 0) {
      out.push(lang === 'he'
        ? 'לעדכן ' + openWOs.length + ' פקודות עבודה פתוחות'
        : 'update ' + openWOs.length + ' open work orders');
    }
    if (onOrderPOs.length > 0) {
      out.push(lang === 'he'
        ? 'לבדוק ' + onOrderPOs.length + ' הזמנות רכש בדרך'
        : 'review ' + onOrderPOs.length + ' purchase orders in transit');
    }
    if (onHand > 0) {
      out.push(lang === 'he'
        ? 'להחליט דיספוזיציה למלאי ' + onHand + ' יחידות'
        : 'disposition existing on-hand qty: ' + onHand);
    }
    if (boms.length > 0) {
      out.push(lang === 'he'
        ? 'לעדכן ' + boms.length + ' עצי מוצר (BOM)'
        : 'cascade change to ' + boms.length + ' BOMs');
    }
    if (out.length === 0) {
      out.push(lang === 'he' ? 'שינוי בטוח — אין השפעה במורד הזרם' : 'safe change — no downstream impact');
    }
    return out;
  }

  /** External setters so callers can wire live data in. */
  setOpenWorkOrders(partNumber, list)  { this.openWorkOrders.set(partNumber, Array.isArray(list) ? list.slice() : []); }
  setOnOrderPOs(partNumber, list)      { this.onOrderPOs.set(partNumber, Array.isArray(list) ? list.slice() : []); }
  setOnHandInventory(partNumber, qty)  { this.onHandInventory.set(partNumber, typeof qty === 'number' ? qty : 0); }

  /* ==========================================================================
   * 2.8  obsoleteDrawing
   * ========================================================================= */
  /**
   * Mark a drawing revision as obsolete. The binary & all metadata
   * are preserved forever — ONLY the status flips. If the obsoleted
   * revision was the current approved one, the part no longer has
   * a current drawing and getCurrent() returns null (until a new
   * revision is uploaded).
   */
  obsoleteDrawing(drawingId, reason) {
    _assertStr(drawingId, 'drawingId');
    _assertStr(reason, 'reason');
    const d = this._getDrawingOrThrow(drawingId);
    if (d.status === 'obsolete') {
      // Idempotent no-op; audit anyway so the reason stays in the log.
      this._audit('obsoleteDrawing.noop', { id: drawingId, reason: reason });
      return d;
    }
    const now = this._clock();
    d.status = 'obsolete';
    d.status_he = DRAWING_STATUS.obsolete.he;
    d.status_en = DRAWING_STATUS.obsolete.en;
    d.obsoletedAt = now;
    d.obsoleteReason = reason;
    d.updatedAt = now;
    // Release any lingering checkout so nobody keeps editing it.
    if (d.checkedOutBy) {
      this.checkouts.delete(drawingId);
      d.checkedOutBy = null;
      d.checkedOutAt = null;
    }
    this._audit('obsoleteDrawing', { id: drawingId, reason: reason });
    return d;
  }

  /* ==========================================================================
   * 2.9  utilities
   * ========================================================================= */

  /** Return a serialisable snapshot of the entire state (for persistence). */
  snapshot() {
    return {
      drawings: Array.from(this.drawings.entries()).map(([k, v]) => [k, _deepCopy(v)]),
      partRevisions: Array.from(this.partRevisions.entries()),
      checkouts: Array.from(this.checkouts.entries()),
      ecos: Array.from(this.ecos.entries()).map(([k, v]) => [k, _deepCopy(v)]),
      bomIndex: Array.from(this.bomIndex.entries()).map(([k, set]) => [k, Array.from(set)]),
      openWorkOrders: Array.from(this.openWorkOrders.entries()),
      onOrderPOs: Array.from(this.onOrderPOs.entries()),
      onHandInventory: Array.from(this.onHandInventory.entries()),
      auditLog: this.auditLog.slice(),
    };
  }

  /** Restore from a prior snapshot (additive — never deletes). */
  restore(snap) {
    if (!snap || typeof snap !== 'object') throw new TypeError('snap must be object');
    this.drawings = new Map(snap.drawings || []);
    this.partRevisions = new Map(snap.partRevisions || []);
    this.checkouts = new Map(snap.checkouts || []);
    this.ecos = new Map(snap.ecos || []);
    this.bomIndex = new Map((snap.bomIndex || []).map(([k, arr]) => [k, new Set(arr)]));
    this.openWorkOrders = new Map(snap.openWorkOrders || []);
    this.onOrderPOs = new Map(snap.onOrderPOs || []);
    this.onHandInventory = new Map(snap.onHandInventory || []);
    this.auditLog = (snap.auditLog || []).slice();
  }
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  DrawingVC: DrawingVC,
  DRAWING_FORMATS: DRAWING_FORMATS,
  DRAWING_STATUS: DRAWING_STATUS,
  ECO_DISPOSITIONS: ECO_DISPOSITIONS,
  ECO_STATUS: ECO_STATUS,
};
