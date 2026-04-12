/* ============================================================================
 * Techno-Kol ERP — Drawing Version Control (DVC)
 * Agent Y-045 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * שליטת גרסה לשרטוטי הנדסה — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   The shop floor at "טכנו-קול עוזי" cuts, bends, welds and machines from
 *   engineering drawings authored in AutoCAD (DWG/DXF), SolidWorks/Inventor
 *   (STEP/IGES) or PDF prints. A *single* wrong revision on the shop floor
 *   means scrapped material, missed delivery and (worst case) a customer
 *   audit non-conformance — the kind that voids ISO 9001 certification.
 *
 *   This module is the immutable single-source-of-truth for every drawing.
 *   It assigns aerospace-style alpha revisions (A, B, C ... Z, AA, AB ...),
 *   supports numeric sub-revs for minor tweaks (A.1, A.2 ...), enforces
 *   QA + design-lead dual approval, freezes released drawings against
 *   accidental supersede, and maintains bidirectional links to BOM and
 *   work-order records so a downstream impact-analysis is one query away.
 *
 *   Reference standards:
 *     - ISO 128       (technical drawings — general principles of presentation)
 *     - ISO 2768      (general tolerances — linear and angular dimensions)
 *     - ASME Y14.5    (Geometric Dimensioning & Tolerancing — GD&T)
 *     - ISO 7200      (title blocks for technical product documentation)
 *     - SAE AS9102    (FAI / first-article inspection cross-reference)
 *
 * Features implemented:
 *   1.  uploadDrawing       — SHA-256 fingerprint, auto rev increment
 *   2.  getDrawing          — fetch latest or specific revision
 *   3.  listRevisions       — full audit history
 *   4.  compare             — fingerprint + size + metadata diff
 *   5.  approveRevision     — dual-role approval (QA + design-lead)
 *   6.  freezeRevision      — mark immutable, requires explicit new rev
 *   7.  supersedeRevision   — flip status to 'superseded' (NEVER deletes)
 *   8.  linkToBOM           — bidirectional drawing ↔ BOM link
 *   9.  linkToWorkOrder     — bidirectional drawing ↔ WO link
 *  10.  watermark           — bilingual watermark metadata stamp
 *  11.  exportHistoryReport — bilingual markdown audit trail
 *  12.  search              — multi-field string search
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Superseded revisions remain in history forever.
 *   - Frozen revisions cannot be auto-superseded — caller must explicitly
 *     request a new rev (the freeze is the human-in-the-loop gate).
 *   - Approvals stack as an append-only log; you can never unapprove.
 *   - Zero external dependencies — Node built-ins only (`crypto`).
 *   - Bilingual Hebrew / English on every public structure.
 *   - Mock-transport friendly: in-memory Map storage, no IO side effects.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Drawing format catalog — frozen, bilingual
 * -------------------------------------------------------------------------- */
const DRAWING_FORMATS = Object.freeze({
  DWG: Object.freeze({
    id: 'DWG',
    he: 'AutoCAD שרטוט בינארי',
    en: 'AutoCAD binary drawing',
    extension: '.dwg',
    binary: true,
    standardRef: 'ISO 128 / ISO 7200',
    typicalAuthor: 'AutoCAD, BricsCAD, ZWCAD',
  }),
  DXF: Object.freeze({
    id: 'DXF',
    he: 'AutoCAD פורמט חילופי טקסט',
    en: 'AutoCAD drawing exchange (text)',
    extension: '.dxf',
    binary: false,
    standardRef: 'ISO 128',
    typicalAuthor: 'CAM post-processors, laser/plasma nesters',
  }),
  PDF: Object.freeze({
    id: 'PDF',
    he: 'תדפיס שרטוט להפצה',
    en: 'Released print for distribution',
    extension: '.pdf',
    binary: true,
    standardRef: 'ISO 128 / ISO 7200',
    typicalAuthor: 'CAD print, scan-to-PDF',
  }),
  STEP: Object.freeze({
    id: 'STEP',
    he: 'מודל תלת-ממדי ניטרלי STEP',
    en: 'Neutral 3D solid-model exchange',
    extension: '.step',
    binary: false,
    standardRef: 'ISO 10303-242 (AP242)',
    typicalAuthor: 'SolidWorks, Inventor, Creo, NX',
  }),
  IGES: Object.freeze({
    id: 'IGES',
    he: 'פורמט חילופי מודל מורשת',
    en: 'Legacy CAD interchange',
    extension: '.iges',
    binary: false,
    standardRef: 'ANSI Y14.26M',
    typicalAuthor: 'Legacy CAD systems, surface exchange',
  }),
});

/* ----------------------------------------------------------------------------
 * 1. Status lifecycle — frozen, bilingual
 *
 *   draft       → in-review → approved → frozen
 *      \________________\___________\_______→ superseded
 *
 *   - draft       : just uploaded, no approvals yet
 *   - in-review   : at least one approval, missing the other role
 *   - approved    : both QA and design-lead have signed
 *   - frozen      : approved + explicit freeze; cannot be auto-superseded
 *   - superseded  : a newer rev has replaced this one (record kept forever)
 * -------------------------------------------------------------------------- */
const STATUS = Object.freeze({
  DRAFT:      'draft',
  IN_REVIEW:  'in-review',
  APPROVED:   'approved',
  FROZEN:     'frozen',
  SUPERSEDED: 'superseded',
});

const STATUS_LABEL = Object.freeze({
  draft:      Object.freeze({ he: 'טיוטה',           en: 'draft' }),
  'in-review':Object.freeze({ he: 'בבדיקה',          en: 'in review' }),
  approved:   Object.freeze({ he: 'מאושר',           en: 'approved' }),
  frozen:     Object.freeze({ he: 'נעול / מוקפא',    en: 'frozen' }),
  superseded: Object.freeze({ he: 'הוחלף בגרסה חדשה',en: 'superseded' }),
});

/* ----------------------------------------------------------------------------
 * 2. Approval roles — only these two roles can sign a drawing
 * -------------------------------------------------------------------------- */
const APPROVAL_ROLES = Object.freeze({
  QA:           Object.freeze({ id: 'qa',          he: 'בקרת איכות',     en: 'Quality Assurance' }),
  DESIGN_LEAD:  Object.freeze({ id: 'design-lead', he: 'מהנדס ראשי',     en: 'Design Lead' }),
});

const REQUIRED_APPROVAL_ROLES = Object.freeze(['qa', 'design-lead']);

/* ----------------------------------------------------------------------------
 * 3. Internal helpers
 * -------------------------------------------------------------------------- */

/** Current ISO timestamp. Allows monkey-patching for tests. */
function _now() {
  return new Date().toISOString();
}

/** Deep clone via structured JSON — adequate for plain data. */
function _deepCopy(o) {
  if (o === undefined || o === null) return o;
  return JSON.parse(JSON.stringify(o));
}

function _assertStr(val, name) {
  if (typeof val !== 'string' || val.length === 0) {
    throw new TypeError(name + ' must be a non-empty string');
  }
}

/** SHA-256 hex of any Buffer / string. Falls back to utf-8 if string. */
function _sha256(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* ----------------------------------------------------------------------------
 * 4. Alpha-rev generator
 *
 *   Aerospace ECO practice — A, B, C ... Z, AA, AB ... AZ, BA ... ZZ, AAA ...
 *   Letters O and I are usually skipped (look like 0 / 1) but we keep the
 *   full alphabet for compatibility with Israeli mechanical drafting which
 *   does NOT skip letters. To re-enable letter-skipping, edit the constant
 *   below — the rest of the algorithm is alphabet-agnostic.
 * -------------------------------------------------------------------------- */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function _isMajorRev(rev) {
  return /^[A-Z]+$/.test(String(rev || ''));
}

function _isSubRev(rev) {
  return /^[A-Z]+\.\d+$/.test(String(rev || ''));
}

/** Convert a major rev like "Z" / "AA" to a 1-based index. */
function _alphaToIndex(rev) {
  if (!_isMajorRev(rev)) {
    throw new TypeError('not a major rev: "' + rev + '"');
  }
  let n = 0;
  for (let i = 0; i < rev.length; i++) {
    n = n * ALPHA.length + (ALPHA.indexOf(rev[i]) + 1);
  }
  return n;
}

/** Convert a 1-based index back to alpha sequence — Z=26, AA=27, AB=28 ... */
function _indexToAlpha(n) {
  if (typeof n !== 'number' || n < 1 || !Number.isFinite(n)) {
    throw new TypeError('alpha index must be a positive integer, got ' + n);
  }
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % ALPHA.length;
    s = ALPHA[r] + s;
    x = Math.floor((x - 1) / ALPHA.length);
  }
  return s;
}

/** Increment a major rev: "A"→"B", "Z"→"AA", "AZ"→"BA" ... */
function _nextMajorRev(rev) {
  if (rev === undefined || rev === null || rev === '') return 'A';
  if (_isSubRev(rev)) {
    // sub revs collapse to their parent for the next major
    rev = rev.split('.')[0];
  }
  return _indexToAlpha(_alphaToIndex(rev) + 1);
}

/** Increment a sub rev. "A" → "A.1", "A.1" → "A.2", "B.3" → "B.4". */
function _nextSubRev(rev) {
  if (_isMajorRev(rev)) return rev + '.1';
  if (_isSubRev(rev)) {
    const parts = rev.split('.');
    return parts[0] + '.' + (parseInt(parts[1], 10) + 1);
  }
  throw new TypeError('not a recognised rev: "' + rev + '"');
}

/* ----------------------------------------------------------------------------
 * 5. The DrawingVC class
 * -------------------------------------------------------------------------- */
class DrawingVC {
  constructor() {
    /** @type {Map<string, Array<object>>} partNumber → revisions[] */
    this.drawings = new Map();
    /** @type {Array<object>} append-only audit log */
    this.auditLog = [];
  }

  /* ==========================================================================
   * 5.1  uploadDrawing
   * ========================================================================= */
  /**
   * Upload a drawing. If the part number is new it gets rev "A". If the
   * SHA-256 fingerprint is identical to the latest existing rev we DO NOT
   * create a new revision (caller is informed via `created: false`). If the
   * fingerprint differs, we create a new rev — major by default, sub-rev if
   * `subRev: true` was requested.
   *
   * Frozen revs cannot be auto-superseded — the caller must pass `force: true`
   * AND `subRev: false` to lay down a new major rev on top of a frozen one,
   * or pass `subRev: true` to issue a minor tweak under an existing major.
   *
   * @param {object} input
   * @param {string} input.partNumber
   * @param {string} [input.rev]            — optional explicit rev (e.g. for migration imports)
   * @param {Buffer|string} input.fileBuffer
   * @param {string} input.format           — must be one of DRAWING_FORMATS
   * @param {string} input.author
   * @param {string} [input.notes]
   * @param {boolean} [input.subRev]        — issue as minor sub-rev (A → A.1)
   * @param {boolean} [input.force]         — allow new major rev over a frozen one
   */
  uploadDrawing(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('uploadDrawing: input object required');
    }
    _assertStr(input.partNumber, 'partNumber');
    _assertStr(input.author, 'author');
    _assertStr(input.format, 'format');
    if (!DRAWING_FORMATS[input.format]) {
      throw new TypeError('unknown format "' + input.format +
        '" — must be one of ' + Object.keys(DRAWING_FORMATS).join(', '));
    }
    if (input.fileBuffer === undefined || input.fileBuffer === null) {
      throw new TypeError('fileBuffer is required');
    }
    const buffer = Buffer.isBuffer(input.fileBuffer)
      ? input.fileBuffer
      : Buffer.from(String(input.fileBuffer), 'utf8');

    const checksum = _sha256(buffer);
    const size = buffer.length;
    const partNumber = input.partNumber;

    const history = this.drawings.get(partNumber) || [];
    const latest = history.length > 0 ? history[history.length - 1] : null;

    /* same content as latest active → no-op */
    if (latest && latest.checksum === checksum && latest.status !== STATUS.SUPERSEDED) {
      this._audit('upload-skipped-identical', {
        partNumber: partNumber,
        rev: latest.rev,
        checksum: checksum,
        author: input.author,
      });
      return {
        created: false,
        revision: _deepCopy(latest),
        reason_he: 'תוכן זהה — לא נוצרה גרסה חדשה',
        reason_en: 'content identical — no new revision created',
      };
    }

    /* decide the new rev string */
    let newRev;
    if (input.rev) {
      // explicit rev (migration import / manual override). Reject duplicates.
      if (history.some(function (r) { return r.rev === input.rev; })) {
        throw new Error('rev "' + input.rev + '" already exists for ' + partNumber);
      }
      newRev = input.rev;
    } else if (!latest) {
      newRev = 'A';
    } else if (input.subRev) {
      newRev = _nextSubRev(latest.rev);
    } else {
      // frozen revs need explicit force unless going to a sub-rev
      if (latest.status === STATUS.FROZEN && !input.force) {
        throw new Error(
          'cannot supersede frozen rev "' + latest.rev + '" of ' + partNumber +
          ' without {force:true} or {subRev:true}'
        );
      }
      newRev = _nextMajorRev(latest.rev);
    }

    /* mark the previous active rev superseded — but only if not frozen */
    if (latest && latest.status !== STATUS.FROZEN && latest.status !== STATUS.SUPERSEDED) {
      latest.status = STATUS.SUPERSEDED;
      latest.supersededAt = _now();
      latest.supersededBy = newRev;
      this._audit('superseded', {
        partNumber: partNumber,
        oldRev: latest.rev,
        newRev: newRev,
        author: input.author,
      });
    }

    const revision = {
      partNumber: partNumber,
      rev: newRev,
      checksum: checksum,
      size: size,
      format: input.format,
      format_he: DRAWING_FORMATS[input.format].he,
      format_en: DRAWING_FORMATS[input.format].en,
      author: input.author,
      uploadedAt: _now(),
      notes: input.notes || '',
      status: STATUS.DRAFT,
      status_he: STATUS_LABEL[STATUS.DRAFT].he,
      status_en: STATUS_LABEL[STATUS.DRAFT].en,
      approvals: [],
      links: { boms: [], wos: [] },
      // bilingual annotations attached by watermark()
      annotations: [],
    };

    history.push(revision);
    this.drawings.set(partNumber, history);
    this._audit('uploaded', {
      partNumber: partNumber,
      rev: newRev,
      checksum: checksum,
      size: size,
      format: input.format,
      author: input.author,
    });

    return {
      created: true,
      revision: _deepCopy(revision),
      reason_he: 'נוצרה גרסה חדשה',
      reason_en: 'new revision created',
    };
  }

  /* ==========================================================================
   * 5.2  getDrawing
   * ========================================================================= */
  /**
   * Return the latest revision for a part, or a specific revision if `rev` is
   * given. The "latest" is the highest-index non-superseded record; if all
   * records are superseded (shouldn't normally happen) we return the highest
   * regardless. Returns `null` if the part doesn't exist.
   */
  getDrawing(partNumber, rev) {
    _assertStr(partNumber, 'partNumber');
    const history = this.drawings.get(partNumber);
    if (!history || history.length === 0) return null;

    if (rev) {
      const found = history.find(function (r) { return r.rev === rev; });
      return found ? _deepCopy(found) : null;
    }
    // latest active = last entry that isn't superseded
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].status !== STATUS.SUPERSEDED) return _deepCopy(history[i]);
    }
    return _deepCopy(history[history.length - 1]);
  }

  /* ==========================================================================
   * 5.3  listRevisions
   * ========================================================================= */
  /**
   * Full append-only history for one part — including superseded.
   * Sorted by upload time ascending. Read-only deep copy.
   */
  listRevisions(partNumber) {
    _assertStr(partNumber, 'partNumber');
    const history = this.drawings.get(partNumber);
    if (!history) return [];
    return history.map(function (r) {
      return {
        rev: r.rev,
        author: r.author,
        uploadedAt: r.uploadedAt,
        notes: r.notes,
        checksum: r.checksum,
        size: r.size,
        format: r.format,
        status: r.status,
        status_he: STATUS_LABEL[r.status].he,
        status_en: STATUS_LABEL[r.status].en,
        approvals: _deepCopy(r.approvals),
        links: _deepCopy(r.links),
      };
    });
  }

  /* ==========================================================================
   * 5.4  compare
   * ========================================================================= */
  /**
   * Diff between two revisions of (the same OR different) part numbers.
   * Inputs may be either:
   *   - { partNumber, rev } objects, or
   *   - shorthand strings "PART/REV"  (e.g. "BRK-100/A")
   *
   * Returns an object with checksum/size/metadata diffs and a bilingual
   * human-readable summary.
   */
  compare(rev1, rev2) {
    const a = this._resolveRevDescriptor(rev1, 'rev1');
    const b = this._resolveRevDescriptor(rev2, 'rev2');
    const left  = this.getDrawing(a.partNumber, a.rev);
    const right = this.getDrawing(b.partNumber, b.rev);
    if (!left)  throw new Error('compare: left rev not found ' + JSON.stringify(a));
    if (!right) throw new Error('compare: right rev not found ' + JSON.stringify(b));

    const checksumChanged = left.checksum !== right.checksum;
    const sizeDelta = right.size - left.size;
    const formatChanged = left.format !== right.format;
    const authorChanged = left.author !== right.author;
    const statusChanged = left.status !== right.status;
    const linksDelta = {
      boms_added:   right.links.boms.filter(function (x) { return left.links.boms.indexOf(x) === -1; }),
      boms_removed: left.links.boms.filter(function (x) { return right.links.boms.indexOf(x) === -1; }),
      wos_added:    right.links.wos.filter(function (x) { return left.links.wos.indexOf(x) === -1; }),
      wos_removed:  left.links.wos.filter(function (x) { return right.links.wos.indexOf(x) === -1; }),
    };

    return {
      left:  { partNumber: left.partNumber,  rev: left.rev,  checksum: left.checksum,  size: left.size,  format: left.format,  status: left.status },
      right: { partNumber: right.partNumber, rev: right.rev, checksum: right.checksum, size: right.size, format: right.format, status: right.status },
      checksumChanged: checksumChanged,
      sizeDelta: sizeDelta,
      formatChanged: formatChanged,
      authorChanged: authorChanged,
      statusChanged: statusChanged,
      linksDelta: linksDelta,
      summary_he: this._diffSummaryHe(left, right, checksumChanged, sizeDelta, formatChanged, statusChanged),
      summary_en: this._diffSummaryEn(left, right, checksumChanged, sizeDelta, formatChanged, statusChanged),
    };
  }

  /* ==========================================================================
   * 5.5  approveRevision
   * ========================================================================= */
  /**
   * Append a single approval. Both 'qa' and 'design-lead' must approve before
   * the revision flips to 'approved'. Approvals are append-only — calling
   * approve() with the same role twice records both signatures (history of
   * the second sign-off is preserved) but does NOT remove the first.
   *
   * @returns {object} { revision, complete: boolean, missingRoles: [] }
   */
  approveRevision(partNumber, rev, approver, role) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(rev, 'rev');
    _assertStr(approver, 'approver');
    _assertStr(role, 'role');
    const history = this.drawings.get(partNumber);
    if (!history) throw new Error('unknown part: ' + partNumber);
    const target = history.find(function (r) { return r.rev === rev; });
    if (!target) throw new Error('rev not found: ' + partNumber + '/' + rev);
    if (REQUIRED_APPROVAL_ROLES.indexOf(role) === -1) {
      throw new Error('invalid approval role "' + role +
        '" — must be one of ' + REQUIRED_APPROVAL_ROLES.join(', '));
    }
    if (target.status === STATUS.SUPERSEDED) {
      throw new Error('cannot approve a superseded rev: ' + partNumber + '/' + rev);
    }

    target.approvals.push({
      approver: approver,
      role: role,
      role_he: role === 'qa' ? APPROVAL_ROLES.QA.he : APPROVAL_ROLES.DESIGN_LEAD.he,
      role_en: role === 'qa' ? APPROVAL_ROLES.QA.en : APPROVAL_ROLES.DESIGN_LEAD.en,
      at: _now(),
    });

    /* check whether both required roles have at least one signature */
    const signedRoles = {};
    for (const a of target.approvals) signedRoles[a.role] = true;
    const missingRoles = REQUIRED_APPROVAL_ROLES.filter(function (r) { return !signedRoles[r]; });

    if (missingRoles.length === 0 && target.status !== STATUS.FROZEN) {
      target.status = STATUS.APPROVED;
      target.status_he = STATUS_LABEL[STATUS.APPROVED].he;
      target.status_en = STATUS_LABEL[STATUS.APPROVED].en;
    } else if (missingRoles.length > 0 && target.status === STATUS.DRAFT) {
      target.status = STATUS.IN_REVIEW;
      target.status_he = STATUS_LABEL[STATUS.IN_REVIEW].he;
      target.status_en = STATUS_LABEL[STATUS.IN_REVIEW].en;
    }

    this._audit('approved', {
      partNumber: partNumber,
      rev: rev,
      approver: approver,
      role: role,
      newStatus: target.status,
    });

    return {
      revision: _deepCopy(target),
      complete: missingRoles.length === 0,
      missingRoles: missingRoles,
    };
  }

  /* ==========================================================================
   * 5.6  freezeRevision
   * ========================================================================= */
  /**
   * Mark a revision frozen. A frozen revision can never be auto-superseded
   * (subsequent uploads must pass {force:true} or use a sub-rev).
   * Only an APPROVED revision may be frozen.
   */
  freezeRevision(partNumber, rev) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(rev, 'rev');
    const history = this.drawings.get(partNumber);
    if (!history) throw new Error('unknown part: ' + partNumber);
    const target = history.find(function (r) { return r.rev === rev; });
    if (!target) throw new Error('rev not found: ' + partNumber + '/' + rev);
    if (target.status !== STATUS.APPROVED) {
      throw new Error('only an approved rev can be frozen — current status: ' + target.status);
    }
    target.status = STATUS.FROZEN;
    target.status_he = STATUS_LABEL[STATUS.FROZEN].he;
    target.status_en = STATUS_LABEL[STATUS.FROZEN].en;
    target.frozenAt = _now();
    this._audit('frozen', { partNumber: partNumber, rev: rev });
    return _deepCopy(target);
  }

  /* ==========================================================================
   * 5.7  linkToBOM
   * ========================================================================= */
  /**
   * Bidirectional link between a drawing rev and a BOM record. We only store
   * the BOM id on our side; the BOM module is expected to record the drawing
   * id on its side via the returned descriptor (mock-transport pattern).
   */
  linkToBOM(partNumber, rev, bomId) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(rev, 'rev');
    _assertStr(bomId, 'bomId');
    const target = this._mustGet(partNumber, rev);
    if (target.links.boms.indexOf(bomId) === -1) {
      target.links.boms.push(bomId);
      this._audit('linked-bom', { partNumber: partNumber, rev: rev, bomId: bomId });
    }
    return {
      drawing: { partNumber: partNumber, rev: rev },
      bomId: bomId,
      bidirectional: true,
      reverse_link_he: 'יש לרשום ב-BOM ' + bomId + ' את הקישור לשרטוט ' + partNumber + '/' + rev,
      reverse_link_en: 'BOM ' + bomId + ' should record drawing ' + partNumber + '/' + rev,
    };
  }

  /* ==========================================================================
   * 5.8  linkToWorkOrder
   * ========================================================================= */
  /**
   * Same as linkToBOM but for work orders.
   */
  linkToWorkOrder(partNumber, rev, woId) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(rev, 'rev');
    _assertStr(woId, 'woId');
    const target = this._mustGet(partNumber, rev);
    if (target.links.wos.indexOf(woId) === -1) {
      target.links.wos.push(woId);
      this._audit('linked-wo', { partNumber: partNumber, rev: rev, woId: woId });
    }
    return {
      drawing: { partNumber: partNumber, rev: rev },
      woId: woId,
      bidirectional: true,
      reverse_link_he: 'יש לרשום בהזמנת עבודה ' + woId + ' את הקישור לשרטוט ' + partNumber + '/' + rev,
      reverse_link_en: 'WO ' + woId + ' should record drawing ' + partNumber + '/' + rev,
    };
  }

  /* ==========================================================================
   * 5.9  watermark
   * ========================================================================= */
  /**
   * Append a bilingual watermark stamp to a drawing buffer. We do NOT
   * touch any binary content (DWG/STEP files would corrupt). Instead we
   * append a textual metadata footer that downstream PDF/print pipelines
   * can render. The default watermark is "שליטת גרסה · Version Control".
   *
   * Returns a new Buffer (the original is left untouched). The function
   * also returns the appended bytes separately so callers can attach the
   * watermark to a sidecar file rather than the original.
   */
  watermark(buffer, text) {
    if (buffer === undefined || buffer === null) {
      throw new TypeError('watermark: buffer required');
    }
    const original = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8');
    const stampText = text || 'שליטת גרסה · Version Control';
    const stamp = Buffer.from(
      '\n%%WATERMARK-START\n' +
      '%%TEXT: ' + stampText + '\n' +
      '%%STAMPED_AT: ' + _now() + '\n' +
      '%%WATERMARK-END\n',
      'utf8'
    );
    const annotated = Buffer.concat([original, stamp]);
    return {
      buffer: annotated,
      stamp: stamp,
      text: stampText,
      originalSize: original.length,
      annotatedSize: annotated.length,
    };
  }

  /* ==========================================================================
   * 5.10 exportHistoryReport
   * ========================================================================= */
  /**
   * Generate a bilingual markdown audit report for one part. Lists every
   * revision (including superseded), every approval signature, every link.
   */
  exportHistoryReport(partNumber) {
    _assertStr(partNumber, 'partNumber');
    const history = this.drawings.get(partNumber);
    if (!history || history.length === 0) {
      return '# ' + partNumber + '\n\n_No revisions on file. אין גרסאות בקובץ._\n';
    }

    const lines = [];
    lines.push('# Drawing History — היסטוריית שרטוט');
    lines.push('');
    lines.push('**Part Number / מספר חלק:** `' + partNumber + '`');
    lines.push('**Total revisions / סך גרסאות:** ' + history.length);
    lines.push('**Generated at / נוצר בתאריך:** ' + _now());
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const r of history) {
      lines.push('## Revision ' + r.rev);
      lines.push('');
      lines.push('| Field / שדה | Value / ערך |');
      lines.push('|---|---|');
      lines.push('| Status / סטטוס         | ' + STATUS_LABEL[r.status].en + ' · ' + STATUS_LABEL[r.status].he + ' |');
      lines.push('| Format / פורמט         | ' + r.format + ' (' + DRAWING_FORMATS[r.format].en + ' · ' + DRAWING_FORMATS[r.format].he + ') |');
      lines.push('| Author / מחבר          | ' + r.author + ' |');
      lines.push('| Uploaded / הועלה       | ' + r.uploadedAt + ' |');
      lines.push('| SHA-256                | `' + r.checksum + '` |');
      lines.push('| Size / גודל (bytes)    | ' + r.size + ' |');
      lines.push('| Notes / הערות          | ' + (r.notes || '_none / אין_') + ' |');
      if (r.frozenAt)     lines.push('| Frozen at / נעילה      | ' + r.frozenAt + ' |');
      if (r.supersededAt) lines.push('| Superseded at / הוחלף  | ' + r.supersededAt + ' (by ' + r.supersededBy + ') |');
      lines.push('');

      lines.push('### Approvals — אישורים');
      lines.push('');
      if (r.approvals.length === 0) {
        lines.push('_No approvals yet. אין אישורים עדיין._');
      } else {
        lines.push('| # | Role / תפקיד | Approver / מאשר | Date / תאריך |');
        lines.push('|---|---|---|---|');
        r.approvals.forEach(function (a, i) {
          lines.push('| ' + (i + 1) + ' | ' + a.role_en + ' · ' + a.role_he + ' | ' + a.approver + ' | ' + a.at + ' |');
        });
      }
      lines.push('');

      lines.push('### Links — קישורים');
      lines.push('');
      lines.push('- **BOMs / רשימות חומרים:** ' + (r.links.boms.length > 0 ? r.links.boms.map(function (b) { return '`' + b + '`'; }).join(', ') : '_none / אין_'));
      lines.push('- **Work Orders / הזמנות עבודה:** ' + (r.links.wos.length > 0 ? r.links.wos.map(function (w) { return '`' + w + '`'; }).join(', ') : '_none / אין_'));
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    lines.push('## Standards Reference — תקני ייחוס');
    lines.push('');
    lines.push('- **ISO 128** — General principles of presentation in technical drawings');
    lines.push('- **ISO 2768** — General tolerances for linear and angular dimensions');
    lines.push('- **ASME Y14.5** — Geometric Dimensioning and Tolerancing (GD&T)');
    lines.push('- **ISO 7200** — Title blocks for technical product documentation');
    lines.push('');
    lines.push('_Generated by Techno-Kol DrawingVC · אומן ע"י מערכת שליטת גרסה_');

    return lines.join('\n');
  }

  /* ==========================================================================
   * 5.11 search
   * ========================================================================= */
  /**
   * Multi-field text search across all revisions of all parts.
   *
   * @param {string} query
   * @param {object} [filters]
   * @param {string} [filters.partNumber] — exact part number filter
   * @param {string} [filters.author]     — substring author match
   * @param {Object} [filters.dateRange]  — { from, to } ISO strings
   * @param {string} [filters.status]     — exact status match
   *
   * Matches if `query` (lowercased) is a substring of any of:
   *   - partNumber
   *   - rev
   *   - author
   *   - notes
   *   - format
   *   - checksum
   * Empty query string acts as "match all".
   */
  search(query, filters) {
    const q = (query == null ? '' : String(query)).toLowerCase();
    const f = filters || {};
    const out = [];
    for (const [partNumber, history] of this.drawings.entries()) {
      if (f.partNumber && f.partNumber !== partNumber) continue;
      for (const r of history) {
        if (f.author && (r.author || '').toLowerCase().indexOf(String(f.author).toLowerCase()) === -1) continue;
        if (f.status && r.status !== f.status) continue;
        if (f.dateRange) {
          if (f.dateRange.from && r.uploadedAt < f.dateRange.from) continue;
          if (f.dateRange.to   && r.uploadedAt > f.dateRange.to)   continue;
        }
        if (q === '' || this._matches(r, partNumber, q)) {
          out.push({
            partNumber: partNumber,
            rev: r.rev,
            author: r.author,
            uploadedAt: r.uploadedAt,
            notes: r.notes,
            format: r.format,
            status: r.status,
            checksum: r.checksum,
          });
        }
      }
    }
    return out;
  }

  /* ==========================================================================
   * 5.12 supersedeRevision (explicit; never deletes)
   * ========================================================================= */
  /**
   * Mark a revision superseded WITHOUT a new file upload. Used by manual
   * cleanup of frozen drawings or by other modules. The record stays in
   * history forever.
   */
  supersedeRevision(partNumber, rev, reason) {
    _assertStr(partNumber, 'partNumber');
    _assertStr(rev, 'rev');
    const target = this._mustGet(partNumber, rev);
    if (target.status === STATUS.FROZEN) {
      throw new Error('cannot supersede a frozen rev directly — upload a new rev with {force:true}');
    }
    target.status = STATUS.SUPERSEDED;
    target.status_he = STATUS_LABEL[STATUS.SUPERSEDED].he;
    target.status_en = STATUS_LABEL[STATUS.SUPERSEDED].en;
    target.supersededAt = _now();
    target.supersededReason = reason || '';
    this._audit('superseded-explicit', { partNumber: partNumber, rev: rev, reason: reason || '' });
    return _deepCopy(target);
  }

  /* ==========================================================================
   * Internal helpers
   * ========================================================================= */

  _audit(action, payload) {
    this.auditLog.push({
      seq: this.auditLog.length + 1,
      at: _now(),
      action: action,
      payload: _deepCopy(payload),
    });
  }

  _mustGet(partNumber, rev) {
    const history = this.drawings.get(partNumber);
    if (!history) throw new Error('unknown part: ' + partNumber);
    const target = history.find(function (r) { return r.rev === rev; });
    if (!target) throw new Error('rev not found: ' + partNumber + '/' + rev);
    return target;
  }

  _resolveRevDescriptor(d, name) {
    if (typeof d === 'string') {
      const parts = d.split('/');
      if (parts.length !== 2) throw new TypeError(name + ': string descriptor must be "PART/REV"');
      return { partNumber: parts[0], rev: parts[1] };
    }
    if (d && typeof d === 'object' && d.partNumber && d.rev) {
      return { partNumber: d.partNumber, rev: d.rev };
    }
    throw new TypeError(name + ': invalid revision descriptor');
  }

  _matches(rev, partNumber, q) {
    const haystack = [
      partNumber,
      rev.rev,
      rev.author,
      rev.notes,
      rev.format,
      rev.checksum,
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  _diffSummaryHe(left, right, checksumChanged, sizeDelta, formatChanged, statusChanged) {
    const parts = [];
    parts.push('השוואה בין ' + left.partNumber + '/' + left.rev + ' לבין ' + right.partNumber + '/' + right.rev + ':');
    parts.push(checksumChanged ? '· טביעת אצבע SHA-256 השתנתה' : '· טביעת אצבע SHA-256 זהה');
    parts.push('· הפרש גודל: ' + sizeDelta + ' בתים');
    if (formatChanged) parts.push('· פורמט הקובץ השתנה');
    if (statusChanged) parts.push('· סטטוס הגרסה השתנה');
    return parts.join('\n');
  }

  _diffSummaryEn(left, right, checksumChanged, sizeDelta, formatChanged, statusChanged) {
    const parts = [];
    parts.push('Compare ' + left.partNumber + '/' + left.rev + ' to ' + right.partNumber + '/' + right.rev + ':');
    parts.push(checksumChanged ? '- SHA-256 fingerprint changed' : '- SHA-256 fingerprint identical');
    parts.push('- size delta: ' + sizeDelta + ' bytes');
    if (formatChanged) parts.push('- file format changed');
    if (statusChanged) parts.push('- revision status changed');
    return parts.join('\n');
  }
}

/* ----------------------------------------------------------------------------
 * 6. Public exports
 * -------------------------------------------------------------------------- */
module.exports = {
  DrawingVC: DrawingVC,
  DRAWING_FORMATS: DRAWING_FORMATS,
  STATUS: STATUS,
  STATUS_LABEL: STATUS_LABEL,
  APPROVAL_ROLES: APPROVAL_ROLES,
  REQUIRED_APPROVAL_ROLES: REQUIRED_APPROVAL_ROLES,
  // expose helpers for tests
  _internals: {
    _nextMajorRev: _nextMajorRev,
    _nextSubRev: _nextSubRev,
    _alphaToIndex: _alphaToIndex,
    _indexToAlpha: _indexToAlpha,
    _sha256: _sha256,
  },
};
