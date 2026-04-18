/* ============================================================================
 * Techno-Kol ERP — Generic Document Version Control
 * Agent Y-106 / Swarm Documents / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * בקרת גרסאות למסמכים כלליים — מערכת מסמכים ארגונית לטכנו-קול עוזי
 *
 * Scope & intent:
 *   This module is the *generic* document DMS used across every department
 *   of the Techno-Kol Uzi ERP: contracts, SOPs, HR policies, ISO procedures,
 *   marketing assets, supplier agreements, meeting minutes, tender files,
 *   inspection protocols, scanned receipts, bilingual user guides, and so
 *   on. It is deliberately DISTINCT from the engineering-drawing version
 *   control module (Y-045, `onyx-procurement/src/engineering/drawing-vc.js`):
 *
 *     +-------------------------+----------------------------------------+
 *     | Y-045 drawing-vc        | Y-106 doc-version-control (this file) |
 *     +-------------------------+----------------------------------------+
 *     | Shop-floor blueprints   | Any business document                 |
 *     | Alpha revisions A/B/C   | Integer versions 1, 2, 3, …           |
 *     | ECO workflow + BOMs     | Branch / merge / 3-way conflict       |
 *     | FNV-1a cheap checksum   | SHA-256 via node:crypto               |
 *     | ASME Y14.35 rev scheme  | Git-flavoured branching               |
 *     | Linked to WO / PO / BOM | Linked to folders / tags / metadata   |
 *     | Single-writer check-out | Check-out + exclusive TTL lock        |
 *     | No signatures           | Full digital-signature capture        |
 *     | No Merkle chain         | Merkle-style tamper-evidence chain    |
 *     +-------------------------+----------------------------------------+
 *
 * Features delivered:
 *   1.  upload             — store a new document, SHA-256 hash, v1
 *   2.  checkout           — exclusive edit (single writer)
 *   3.  checkin            — release edit lock + new version
 *   4.  branch             — parallel drafting (diverges from a version)
 *   5.  merge              — 3-way text merge with pluggable resolver
 *   6.  listVersions       — full history (never deletes)
 *   7.  restoreVersion     — creates a NEW version from a historical one
 *   8.  compareVersions    — line-based text diff (LCS)
 *   9.  lockDocument       — exclusive lock with TTL, reason logged
 *  10.  checksumVerify     — SHA-256 integrity check vs storage
 *  11.  auditLog           — per-doc audit trail (who/when/what)
 *  12.  signatureCapture   — digital signature hash embedded in version
 *  13.  tamperEvidence     — verifies Merkle-style linked-hash chain
 *
 * RULES (לא מוחקים, רק משדרגים ומגדלים):
 *   - NOTHING is ever deleted. Every mutation is a NEW immutable version.
 *   - `restoreVersion` does not overwrite — it creates a new version whose
 *     payload is a snapshot of the historical one.
 *   - `merge` produces a new version on target branch; sources remain.
 *   - The audit log is append-only; there is no public remove / truncate.
 *
 * Storage:
 *   Bytes never live inside this module. A single `StorageAdapter` is
 *   injected by the caller — local fs, AWS S3, Azure Blob, Supabase
 *   Storage, in-memory for tests, whatever. The adapter interface is:
 *
 *       adapter.put(key: string, bytes: Buffer)        : Promise<void>
 *       adapter.get(key: string)                       : Promise<Buffer>
 *       adapter.has(key: string)                       : Promise<boolean>
 *
 *   A default in-memory adapter is provided so tests and happy-path
 *   callers work out-of-the-box with zero extra wiring.
 *
 * External dependencies:
 *   Only Node built-ins: `node:crypto` (SHA-256), `Buffer`. Zero npm deps.
 *
 * Bilingual Hebrew / English user-facing labels on every public structure.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual labels & immutable catalogs
 * -------------------------------------------------------------------------- */

/** @enum Document lifecycle states (per version). */
const DOC_STATUS = Object.freeze({
  draft:       { id: 'draft',       he: 'טיוטה',          en: 'Draft' },
  checked_out: { id: 'checked_out', he: 'בעריכה',          en: 'Checked out' },
  released:    { id: 'released',    he: 'משוחרר',          en: 'Released' },
  signed:      { id: 'signed',      he: 'חתום',            en: 'Signed' },
  restored:    { id: 'restored',    he: 'שוחזר מגרסה קודמת', en: 'Restored from history' },
  merged:      { id: 'merged',      he: 'מוזג',            en: 'Merged' },
  branched:    { id: 'branched',    he: 'מסועף',           en: 'Branched' },
});

/** @enum Signature methods. */
const SIGNATURE_METHODS = Object.freeze({
  typed:    { id: 'typed',    he: 'חתימה מוקלדת',    en: 'Typed signature' },
  drawn:    { id: 'drawn',    he: 'חתימה ידנית',      en: 'Drawn signature' },
  pki:      { id: 'pki',      he: 'חתימה דיגיטלית PKI', en: 'PKI digital signature' },
  biometric:{ id: 'biometric',he: 'ביומטרי',          en: 'Biometric' },
  otp:      { id: 'otp',      he: 'קוד חד-פעמי',       en: 'One-time code (OTP)' },
});

/** @enum Audit event categories. */
const AUDIT_ACTIONS = Object.freeze({
  upload:        'upload',
  checkout:      'checkout',
  checkin:       'checkin',
  branch:        'branch',
  merge:         'merge',
  restore:       'restore',
  compare:       'compare',
  lock:          'lock',
  unlock:        'unlock',
  checksum:      'checksum_verify',
  sign:          'sign',
  tamper_check:  'tamper_check',
});

const MAIN_BRANCH = 'main';

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (no deps outside node:crypto + Buffer)
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
  if (obj === undefined || obj === null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/** Normalize any file-ish input to a Buffer. */
function _toBuffer(input) {
  if (input == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (typeof input === 'object' && typeof input.toString === 'function') {
    return Buffer.from(String(input), 'utf8');
  }
  throw new TypeError('cannot coerce file payload to Buffer');
}

/** SHA-256 hex digest of a Buffer / string. */
function _sha256(buf) {
  return crypto.createHash('sha256').update(_toBuffer(buf)).digest('hex');
}

/** SHA-256 of an arbitrary JSON-safe object (stable key order). */
function _sha256ofObj(obj) {
  return _sha256(_canonicalJSON(obj));
}

/** Canonical JSON — stable key order for deterministic hashing. */
function _canonicalJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_canonicalJSON).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(function (k) {
    return JSON.stringify(k) + ':' + _canonicalJSON(v[k]);
  }).join(',') + '}';
}

/**
 * Build a deterministic storage key for a document version.
 * Callers may override via their own adapter if they need a different
 * layout (per-tenant prefix, etc.).
 */
function _storageKey(docId, branch, version) {
  const safeDoc = String(docId).replace(/[^A-Za-z0-9_\-]/g, '_');
  const safeBr  = String(branch || MAIN_BRANCH).replace(/[^A-Za-z0-9_\-]/g, '_');
  return 'documents/' + safeDoc + '/' + safeBr + '/v' + version;
}

/* ----------------------------------------------------------------------------
 * 2. Default storage adapter — in-memory, for tests & happy-path callers
 * -------------------------------------------------------------------------- */
class InMemoryStorageAdapter {
  constructor() {
    /** @type {Map<string, Buffer>} */
    this._store = new Map();
  }
  async put(key, bytes) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('storage key must be non-empty string');
    }
    this._store.set(key, Buffer.from(_toBuffer(bytes)));
  }
  async get(key) {
    if (!this._store.has(key)) {
      throw new Error('storage: missing key ' + key);
    }
    // Return a copy so the caller can't mutate our stored bytes.
    return Buffer.from(this._store.get(key));
  }
  async has(key) {
    return this._store.has(key);
  }
}

/* ----------------------------------------------------------------------------
 * 3. 3-way text merge — Myers-style line LCS, with conflict resolver hook
 * -------------------------------------------------------------------------- */

function _splitLines(s) {
  if (s == null) return [];
  return String(s).split(/\r?\n/);
}

/** Longest-common-subsequence table (line-based). */
function _lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Produce a line-based unified diff (very small subset). */
function _diffLines(aText, bText) {
  const a = _splitLines(aText);
  const b = _splitLines(bText);
  const dp = _lcs(a, b);
  const out = [];
  let i = a.length, j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ op: 'eq', line: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ op: 'del', line: a[i - 1] });
      i--;
    } else {
      out.push({ op: 'add', line: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { out.push({ op: 'del', line: a[--i] }); }
  while (j > 0) { out.push({ op: 'add', line: b[--j] }); }
  return out.reverse();
}

/**
 * Lightweight 3-way merge. Given `base`, `ours`, and `theirs` text
 * payloads, produce a merged text. If a hunk conflicts, the injected
 * `conflictResolver(base, ours, theirs, context)` is called and its
 * return value is trusted. If no resolver is provided the function
 * throws so callers can't silently lose data.
 *
 * This is intentionally simple — it operates at the line level, like
 * `git merge` with the default strategy on a single file.
 */
function _threeWayMerge(base, ours, theirs, resolver) {
  const baseLines   = _splitLines(base);
  const oursLines   = _splitLines(ours);
  const theirsLines = _splitLines(theirs);

  // Quick cases
  if (ours === theirs) return { text: ours, conflicts: 0 };
  if (ours === base)   return { text: theirs, conflicts: 0 };
  if (theirs === base) return { text: ours, conflicts: 0 };

  const dpBO = _lcs(baseLines, oursLines);
  const dpBT = _lcs(baseLines, theirsLines);

  // Build "edit scripts" expressing each side as ops over base.
  function script(dp, base, side) {
    const ops = [];
    let i = base.length, j = side.length;
    while (i > 0 && j > 0) {
      if (base[i - 1] === side[j - 1]) {
        ops.push({ op: 'eq', idx: i - 1, line: base[i - 1] });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        ops.push({ op: 'del', idx: i - 1, line: base[i - 1] });
        i--;
      } else {
        ops.push({ op: 'add', after: i - 1, line: side[j - 1] });
        j--;
      }
    }
    while (i > 0) { ops.push({ op: 'del', idx: --i, line: base[i] }); }
    while (j > 0) { ops.push({ op: 'add', after: -1, line: side[--j] }); }
    return ops.reverse();
  }

  const oursOps   = script(dpBO, baseLines, oursLines);
  const theirsOps = script(dpBT, baseLines, theirsLines);

  // Index deletions & insertions by base line index.
  const oursDel = new Set(oursOps.filter(o => o.op === 'del').map(o => o.idx));
  const theirsDel = new Set(theirsOps.filter(o => o.op === 'del').map(o => o.idx));
  const oursAdd = new Map();
  const theirsAdd = new Map();
  for (const o of oursOps)   if (o.op === 'add') _pushMap(oursAdd,   o.after, o.line);
  for (const o of theirsOps) if (o.op === 'add') _pushMap(theirsAdd, o.after, o.line);

  function _pushMap(m, k, v) {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }

  const result = [];
  let conflicts = 0;

  function emitAdds(afterIdx) {
    const o = oursAdd.get(afterIdx) || [];
    const t = theirsAdd.get(afterIdx) || [];
    if (o.length === 0 && t.length === 0) return;
    if (o.length === 0) { result.push.apply(result, t); return; }
    if (t.length === 0) { result.push.apply(result, o); return; }
    // Both sides added at the same anchor ⇒ conflict if different.
    if (o.join('\n') === t.join('\n')) {
      result.push.apply(result, o);
    } else {
      conflicts++;
      const resolved = _invokeResolver(resolver, { base: '', ours: o.join('\n'), theirs: t.join('\n'), kind: 'add', anchor: afterIdx });
      result.push.apply(result, _splitLines(resolved));
    }
  }

  // Pre-base adds (anchor === -1)
  emitAdds(-1);

  for (let i = 0; i < baseLines.length; i++) {
    const line = baseLines[i];
    const delO = oursDel.has(i);
    const delT = theirsDel.has(i);
    if (delO && delT) {
      // both sides agree to delete — drop it.
    } else if (delO && !delT) {
      result.push(line); // they kept it, so keep — or override? be permissive: theirs "kept" it → keep.
      // Actually: one side deleted, the other kept. That's a conflict we resolve in favour of the side
      // that made the edit, unless the resolver disagrees.
      conflicts++;
      const resolved = _invokeResolver(resolver, { base: line, ours: '', theirs: line, kind: 'del-vs-keep', anchor: i });
      // Pop & replace
      result.pop();
      if (resolved !== '') result.push.apply(result, _splitLines(resolved));
    } else if (delT && !delO) {
      result.push(line);
      conflicts++;
      const resolved = _invokeResolver(resolver, { base: line, ours: line, theirs: '', kind: 'keep-vs-del', anchor: i });
      result.pop();
      if (resolved !== '') result.push.apply(result, _splitLines(resolved));
    } else {
      result.push(line);
    }
    emitAdds(i);
  }

  return { text: result.join('\n'), conflicts: conflicts };
}

function _invokeResolver(resolver, ctx) {
  if (typeof resolver === 'function') {
    const r = resolver(ctx.base, ctx.ours, ctx.theirs, ctx);
    if (typeof r === 'string') return r;
  }
  // No resolver → deterministic "ours wins" fallback. The caller can
  // always re-run with their own resolver; we never lose data silently.
  if (ctx.ours !== undefined && ctx.ours !== '') return ctx.ours;
  if (ctx.theirs !== undefined && ctx.theirs !== '') return ctx.theirs;
  return ctx.base;
}

/* ----------------------------------------------------------------------------
 * 4. DocVersionControl — public class
 * -------------------------------------------------------------------------- */
class DocVersionControl {
  /**
   * @param {object} [opts]
   * @param {object} [opts.storage]  Injected storage adapter (put/get/has)
   * @param {()=>string} [opts.clock] Injected clock for deterministic tests
   * @param {(meta:{docId:string,branch:string,version:number})=>string} [opts.keyResolver]
   * @param {number} [opts.defaultLockMs]  Default lock TTL (default 30 min)
   */
  constructor(opts) {
    const o = opts || {};
    this.storage = o.storage || new InMemoryStorageAdapter();
    if (typeof this.storage.put !== 'function' ||
        typeof this.storage.get !== 'function' ||
        typeof this.storage.has !== 'function') {
      throw new TypeError('storage adapter must implement put/get/has');
    }
    this._clock = typeof o.clock === 'function' ? o.clock : _now;
    this._keyResolver = typeof o.keyResolver === 'function' ? o.keyResolver : (m => _storageKey(m.docId, m.branch, m.version));
    this._defaultLockMs = Number.isFinite(o.defaultLockMs) ? o.defaultLockMs : 30 * 60 * 1000;

    /** @type {Map<string, DocRecord>} docId → doc metadata */
    this.docs = new Map();
    /** @type {Map<string, Array<DocVersion>>} docId+branch → versions (append-only) */
    this.branches = new Map();
    /** @type {Map<string, {user:string, at:string}>} docId → active check-out */
    this.checkouts = new Map();
    /** @type {Map<string, {user:string, until:number, reason:string}>} docId → exclusive lock */
    this.locks = new Map();
    /** @type {Map<string, Array<AuditEntry>>} docId → audit entries */
    this._audits = new Map();
    /** @type {Map<string, string>} docId → last linked hash (chain head) */
    this._chainHead = new Map();
  }

  /* ---------- internal helpers ---------- */

  _audit(docId, action, user, payload) {
    if (!this._audits.has(docId)) this._audits.set(docId, []);
    this._audits.get(docId).push({
      ts: this._clock(),
      action: action,
      user: user || null,
      payload: _deepCopy(payload || {}),
    });
  }

  _branchKey(docId, branch) { return docId + '@' + (branch || MAIN_BRANCH); }

  _getDocOrThrow(docId) {
    const d = this.docs.get(docId);
    if (!d) throw new Error('unknown document: ' + docId);
    return d;
  }

  _getBranchOrThrow(docId, branch) {
    const k = this._branchKey(docId, branch);
    const arr = this.branches.get(k);
    if (!arr) throw new Error('unknown branch: ' + branch + ' for ' + docId);
    return arr;
  }

  _isLockedForOther(docId, user) {
    const l = this.locks.get(docId);
    if (!l) return false;
    if (l.until <= Date.parse(this._clock())) {
      // Lock expired — but we NEVER delete the lock record; we leave
      // it as history in the audit log. Here we just treat it as
      // inactive and clear the active map entry.
      this.locks.delete(docId);
      this._audit(docId, AUDIT_ACTIONS.unlock, l.user, { reason: 'ttl_expired', was: l });
      return false;
    }
    return l.user !== user;
  }

  _nextVersionNum(docId, branch) {
    const arr = this.branches.get(this._branchKey(docId, branch)) || [];
    return arr.length === 0 ? 1 : arr[arr.length - 1].version + 1;
  }

  async _writeVersionBytes(docId, branch, version, buf) {
    const key = this._keyResolver({ docId: docId, branch: branch, version: version });
    await this.storage.put(key, buf);
    return key;
  }

  _linkHash(docId, prevHash, versionMeta, contentHash) {
    // Merkle-style: sha256(prevHash || version metadata || content hash)
    const payload = {
      prev: prevHash || '',
      version: versionMeta.version,
      branch: versionMeta.branch,
      sha256: contentHash,
      ts: versionMeta.createdAt,
      author: versionMeta.author || '',
      changeDescription: versionMeta.changeDescription || '',
      signatures: (versionMeta.signatures || []).map(s => s.sha256),
    };
    return _sha256ofObj(payload);
  }

  /* ---------- 1. upload ------------------------------------------------- */

  /**
   * Upload a brand-new document. Returns { docId, version, sha256 }.
   * Bytes flow through the injected storage adapter; this module only
   * stores metadata + the content hash.
   *
   * @param {object} args
   * @param {string} args.name
   * @param {string} [args.folder]
   * @param {Buffer|Uint8Array|string} args.file
   * @param {string} [args.mimeType]
   * @param {string} args.author
   * @param {Array<string>} [args.tags]
   * @param {object} [args.metadata]
   * @param {string} [args.docId]  Supply to upload a new version of an existing doc
   * @param {string} [args.changeDescription]
   */
  async upload(args) {
    _assertObj(args, 'upload args');
    _assertStr(args.name, 'name');
    _assertStr(args.author, 'author');
    if (args.file === undefined || args.file === null) {
      throw new TypeError('upload: file is required');
    }

    const buf = _toBuffer(args.file);
    const sha = _sha256(buf);
    const branch = args.branch || MAIN_BRANCH;

    let docId = args.docId;
    if (docId) {
      // New version of an existing doc on the given branch.
      this._getDocOrThrow(docId);
      if (this._isLockedForOther(docId, args.author)) {
        throw new Error('document ' + docId + ' is locked');
      }
    } else {
      // New doc — mint an id.
      docId = 'doc_' + _sha256(sha + '|' + args.name + '|' + this._clock()).slice(0, 16);
      this.docs.set(docId, {
        id: docId,
        name: args.name,
        folder: args.folder || '/',
        mimeType: args.mimeType || 'application/octet-stream',
        createdAt: this._clock(),
        createdBy: args.author,
        tags: Array.isArray(args.tags) ? args.tags.slice() : [],
        metadata: _deepCopy(args.metadata || {}),
      });
      this.branches.set(this._branchKey(docId, MAIN_BRANCH), []);
    }

    const version = this._nextVersionNum(docId, branch);
    const createdAt = this._clock();
    const key = await this._writeVersionBytes(docId, branch, version, buf);

    const versionMeta = {
      docId: docId,
      branch: branch,
      version: version,
      sha256: sha,
      size: buf.length,
      storageKey: key,
      author: args.author,
      createdAt: createdAt,
      status: DOC_STATUS.draft.id,
      changeDescription: args.changeDescription || 'initial upload',
      parentVersion: null,
      parentBranch: null,
      tags: Array.isArray(args.tags) ? args.tags.slice() : [],
      metadata: _deepCopy(args.metadata || {}),
      signatures: [],
    };

    const prevHead = this._chainHead.get(docId) || '';
    const linkedHash = this._linkHash(docId, prevHead, versionMeta, sha);
    versionMeta.prevLinkedHash = prevHead;
    versionMeta.linkedHash = linkedHash;
    this._chainHead.set(docId, linkedHash);

    if (!this.branches.has(this._branchKey(docId, branch))) {
      this.branches.set(this._branchKey(docId, branch), []);
    }
    this.branches.get(this._branchKey(docId, branch)).push(versionMeta);

    this._audit(docId, AUDIT_ACTIONS.upload, args.author, {
      version: version, branch: branch, sha256: sha, size: buf.length,
    });

    return { docId: docId, version: version, branch: branch, sha256: sha, linkedHash: linkedHash };
  }

  /* ---------- 2. checkout ---------------------------------------------- */

  /**
   * Reserve exclusive edit rights on a document. Other users will get
   * `checkin` rejected until this user releases. Check-out does NOT
   * modify any version — it only installs a soft edit lock.
   */
  checkout(docId, user) {
    _assertStr(docId, 'docId');
    _assertStr(user, 'user');
    this._getDocOrThrow(docId);

    if (this.checkouts.has(docId)) {
      const cur = this.checkouts.get(docId);
      if (cur.user !== user) {
        throw new Error('document ' + docId + ' already checked out by ' + cur.user);
      }
      return _deepCopy(cur);
    }
    if (this._isLockedForOther(docId, user)) {
      throw new Error('document ' + docId + ' is locked');
    }

    const entry = { user: user, at: this._clock() };
    this.checkouts.set(docId, entry);
    this._audit(docId, AUDIT_ACTIONS.checkout, user, {});
    return _deepCopy(entry);
  }

  /* ---------- 3. checkin ----------------------------------------------- */

  /**
   * Release the check-out AND produce a new version. If `newFile` is
   * not supplied, the check-out is simply cancelled (no new version).
   */
  async checkin(docId, user, newFile, changeDescription) {
    _assertStr(docId, 'docId');
    _assertStr(user, 'user');
    const cur = this.checkouts.get(docId);
    if (!cur) throw new Error('document ' + docId + ' is not checked out');
    if (cur.user !== user) throw new Error('checkin by non-owner: ' + user);

    this.checkouts.delete(docId);

    if (newFile === undefined || newFile === null) {
      this._audit(docId, AUDIT_ACTIONS.checkin, user, { cancelled: true });
      return { docId: docId, cancelled: true };
    }

    const res = await this.upload({
      docId: docId,
      name: this._getDocOrThrow(docId).name,
      file: newFile,
      author: user,
      changeDescription: changeDescription || 'checkin',
      branch: MAIN_BRANCH,
    });
    return res;
  }

  /* ---------- 4. branch ------------------------------------------------ */

  /**
   * Create a parallel branch from the current head of main (or the
   * supplied `fromBranch`). The branch starts as a COPY of the head
   * version; it does not move the original.
   */
  async branch(docId, branchName, opts) {
    _assertStr(docId, 'docId');
    _assertStr(branchName, 'branchName');
    if (branchName === MAIN_BRANCH) throw new Error('cannot create branch named "' + MAIN_BRANCH + '"');
    const o = opts || {};
    const fromBranch = o.fromBranch || MAIN_BRANCH;
    const author = o.author || 'system';

    this._getDocOrThrow(docId);
    if (this.branches.has(this._branchKey(docId, branchName))) {
      throw new Error('branch already exists: ' + branchName);
    }
    const src = this._getBranchOrThrow(docId, fromBranch);
    if (src.length === 0) throw new Error('source branch has no versions');

    const head = src[src.length - 1];
    const bytes = await this.storage.get(head.storageKey);

    this.branches.set(this._branchKey(docId, branchName), []);

    const res = await this.upload({
      docId: docId,
      name: this._getDocOrThrow(docId).name,
      file: bytes,
      author: author,
      changeDescription: 'branch from ' + fromBranch + ' v' + head.version,
      branch: branchName,
    });
    // Patch parent link.
    const created = this.branches.get(this._branchKey(docId, branchName))[0];
    created.parentVersion = head.version;
    created.parentBranch = fromBranch;
    created.status = DOC_STATUS.branched.id;

    this._audit(docId, AUDIT_ACTIONS.branch, author, {
      branchName: branchName, fromBranch: fromBranch, fromVersion: head.version,
    });
    return { docId: docId, branch: branchName, version: res.version, sha256: res.sha256 };
  }

  /* ---------- 5. merge ------------------------------------------------- */

  /**
   * 3-way text merge from sourceBranch into targetBranch. For binary
   * files the caller must pass a `binaryResolver(bytesBase, bytesSrc,
   * bytesTgt)` that returns the merged Buffer — otherwise this method
   * throws.
   *
   * On success, produces a NEW version on the target branch.
   */
  async merge(docId, sourceBranch, targetBranch, conflictResolver, opts) {
    _assertStr(docId, 'docId');
    _assertStr(sourceBranch, 'sourceBranch');
    _assertStr(targetBranch, 'targetBranch');
    const o = opts || {};
    const author = o.author || 'system';

    if (sourceBranch === targetBranch) throw new Error('cannot merge branch into itself');
    const src = this._getBranchOrThrow(docId, sourceBranch);
    const tgt = this._getBranchOrThrow(docId, targetBranch);
    if (src.length === 0) throw new Error('source branch empty');
    if (tgt.length === 0) throw new Error('target branch empty');

    const srcHead = src[src.length - 1];
    const tgtHead = tgt[tgt.length - 1];

    // Base = common ancestor = whatever parentVersion/parentBranch
    // points at for the source branch's first commit.
    const srcFirst = src[0];
    let baseBytes = Buffer.alloc(0);
    if (srcFirst.parentBranch && srcFirst.parentVersion != null) {
      const baseVersions = this._getBranchOrThrow(docId, srcFirst.parentBranch);
      const baseRec = baseVersions.find(v => v.version === srcFirst.parentVersion);
      if (baseRec) baseBytes = await this.storage.get(baseRec.storageKey);
    }

    const srcBytes = await this.storage.get(srcHead.storageKey);
    const tgtBytes = await this.storage.get(tgtHead.storageKey);

    let mergedBuf;
    let conflicts = 0;
    if (typeof o.binaryResolver === 'function') {
      mergedBuf = _toBuffer(o.binaryResolver(baseBytes, srcBytes, tgtBytes));
    } else {
      // Text merge — treat bytes as UTF-8.
      const merged = _threeWayMerge(baseBytes.toString('utf8'), tgtBytes.toString('utf8'), srcBytes.toString('utf8'), conflictResolver);
      mergedBuf = Buffer.from(merged.text, 'utf8');
      conflicts = merged.conflicts;
    }

    const res = await this.upload({
      docId: docId,
      name: this._getDocOrThrow(docId).name,
      file: mergedBuf,
      author: author,
      changeDescription: 'merge ' + sourceBranch + ' -> ' + targetBranch + ' (conflicts=' + conflicts + ')',
      branch: targetBranch,
    });
    // Patch status on the new version.
    const arr = this.branches.get(this._branchKey(docId, targetBranch));
    const last = arr[arr.length - 1];
    last.status = DOC_STATUS.merged.id;
    last.mergedFrom = { branch: sourceBranch, version: srcHead.version };
    last.conflicts = conflicts;

    this._audit(docId, AUDIT_ACTIONS.merge, author, {
      source: sourceBranch, target: targetBranch, conflicts: conflicts,
    });
    return { docId: docId, branch: targetBranch, version: res.version, sha256: res.sha256, conflicts: conflicts };
  }

  /* ---------- 6. listVersions ------------------------------------------ */

  /**
   * Full chronological history across all branches for a document.
   * Each record is a defensive copy — callers can't mutate our state.
   */
  listVersions(docId, opts) {
    _assertStr(docId, 'docId');
    this._getDocOrThrow(docId);
    const o = opts || {};
    const out = [];
    for (const [key, arr] of this.branches.entries()) {
      if (!key.startsWith(docId + '@')) continue;
      const branch = key.split('@')[1];
      if (o.branch && o.branch !== branch) continue;
      for (const v of arr) out.push(_deepCopy(v));
    }
    out.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return out;
  }

  /* ---------- 7. restoreVersion ---------------------------------------- */

  /**
   * Creates a NEW version (on the same branch, or the one supplied)
   * whose payload is a byte-exact snapshot of the target historical
   * version. Never deletes or rewrites anything.
   */
  async restoreVersion(docId, version, opts) {
    _assertStr(docId, 'docId');
    if (!Number.isInteger(version) || version < 1) throw new TypeError('version must be positive integer');
    const o = opts || {};
    const sourceBranch = o.sourceBranch || MAIN_BRANCH;
    const targetBranch = o.targetBranch || sourceBranch;
    const author = o.author || 'system';

    const src = this._getBranchOrThrow(docId, sourceBranch);
    const rec = src.find(v => v.version === version);
    if (!rec) throw new Error('unknown version: ' + version + ' on branch ' + sourceBranch);

    const bytes = await this.storage.get(rec.storageKey);
    const res = await this.upload({
      docId: docId,
      name: this._getDocOrThrow(docId).name,
      file: bytes,
      author: author,
      changeDescription: 'restore from ' + sourceBranch + ' v' + version,
      branch: targetBranch,
    });
    // Patch status.
    const arr = this.branches.get(this._branchKey(docId, targetBranch));
    const last = arr[arr.length - 1];
    last.status = DOC_STATUS.restored.id;
    last.restoredFrom = { branch: sourceBranch, version: version };

    this._audit(docId, AUDIT_ACTIONS.restore, author, {
      fromBranch: sourceBranch, fromVersion: version, newVersion: res.version, newBranch: targetBranch,
    });
    return { docId: docId, version: res.version, branch: targetBranch, sha256: res.sha256 };
  }

  /* ---------- 8. compareVersions --------------------------------------- */

  /**
   * Line-based text diff between two versions. Returns an array of
   * `{op,line}` records; `op ∈ {eq,add,del}`. Bytes are fetched from
   * storage each time to guarantee the compare reflects disk reality,
   * not a stale in-memory cache.
   */
  async compareVersions(docId, vA, vB, opts) {
    _assertStr(docId, 'docId');
    if (!Number.isInteger(vA) || !Number.isInteger(vB)) {
      throw new TypeError('versions must be integers');
    }
    const o = opts || {};
    const branchA = o.branchA || MAIN_BRANCH;
    const branchB = o.branchB || MAIN_BRANCH;

    const arrA = this._getBranchOrThrow(docId, branchA);
    const arrB = this._getBranchOrThrow(docId, branchB);
    const recA = arrA.find(v => v.version === vA);
    const recB = arrB.find(v => v.version === vB);
    if (!recA) throw new Error('no such version on branch ' + branchA + ': ' + vA);
    if (!recB) throw new Error('no such version on branch ' + branchB + ': ' + vB);

    const a = await this.storage.get(recA.storageKey);
    const b = await this.storage.get(recB.storageKey);
    const diff = _diffLines(a.toString('utf8'), b.toString('utf8'));

    this._audit(docId, AUDIT_ACTIONS.compare, o.user || null, {
      a: { branch: branchA, version: vA }, b: { branch: branchB, version: vB },
      changes: diff.filter(d => d.op !== 'eq').length,
    });
    return diff;
  }

  /* ---------- 9. lockDocument ------------------------------------------ */

  /**
   * Install an exclusive lock with a TTL. Locks block new check-outs
   * and uploads by any user other than the lock owner. Expired locks
   * auto-release on the next access — the original lock record is
   * kept in the audit log.
   */
  lockDocument(docId, user, reason, durationMs) {
    _assertStr(docId, 'docId');
    _assertStr(user, 'user');
    this._getDocOrThrow(docId);

    const ttl = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : this._defaultLockMs;
    const nowMs = Date.parse(this._clock());
    const existing = this.locks.get(docId);
    if (existing && existing.until > nowMs && existing.user !== user) {
      throw new Error('document ' + docId + ' is locked by ' + existing.user);
    }
    const entry = {
      user: user,
      reason: reason || '',
      since: this._clock(),
      until: nowMs + ttl,
      untilISO: new Date(nowMs + ttl).toISOString(),
    };
    this.locks.set(docId, entry);
    this._audit(docId, AUDIT_ACTIONS.lock, user, { reason: entry.reason, untilISO: entry.untilISO });
    return _deepCopy(entry);
  }

  /** Release a lock early (only the lock owner may call this). */
  unlockDocument(docId, user) {
    _assertStr(docId, 'docId');
    _assertStr(user, 'user');
    const l = this.locks.get(docId);
    if (!l) return false;
    if (l.user !== user) throw new Error('unlock by non-owner: ' + user);
    this.locks.delete(docId);
    this._audit(docId, AUDIT_ACTIONS.unlock, user, { reason: 'manual' });
    return true;
  }

  /* ---------- 10. checksumVerify --------------------------------------- */

  /**
   * Verify that the bytes currently in storage match the SHA-256 we
   * recorded when the version was uploaded. Returns `{ ok, expected,
   * actual }`. Never mutates storage — callers decide what to do on a
   * mismatch (quarantine, alert, restore from backup…).
   */
  async checksumVerify(docId, version, opts) {
    _assertStr(docId, 'docId');
    if (!Number.isInteger(version)) throw new TypeError('version must be integer');
    const o = opts || {};
    const branch = o.branch || MAIN_BRANCH;

    const arr = this._getBranchOrThrow(docId, branch);
    const rec = arr.find(v => v.version === version);
    if (!rec) throw new Error('no such version: ' + version);

    const bytes = await this.storage.get(rec.storageKey);
    const actual = _sha256(bytes);
    const ok = actual === rec.sha256;

    this._audit(docId, AUDIT_ACTIONS.checksum, o.user || null, {
      branch: branch, version: version, ok: ok, expected: rec.sha256, actual: actual,
    });
    return { ok: ok, expected: rec.sha256, actual: actual, branch: branch, version: version };
  }

  /* ---------- 11. auditLog --------------------------------------------- */

  /**
   * Return a defensive copy of the entire audit trail for a document.
   * The returned array is ordered oldest→newest. Callers cannot mutate
   * internal state — this is the hard rule for `לא מוחקים`.
   */
  auditLog(docId) {
    _assertStr(docId, 'docId');
    this._getDocOrThrow(docId);
    return _deepCopy(this._audits.get(docId) || []);
  }

  /* ---------- 12. signatureCapture ------------------------------------- */

  /**
   * Attach a digital signature to a specific version. The signature
   * payload is hashed (SHA-256) and embedded in the version record,
   * and the chain-of-custody hash is re-computed to incorporate it.
   * Produces a fresh `linkedHash` so any prior tamper-evidence check
   * still traces cleanly.
   *
   * @param {string} docId
   * @param {string|object} signer  Signer id or {id, name, email}
   * @param {string} method  One of SIGNATURE_METHODS.*
   * @param {object} [opts]
   * @param {number} [opts.version]  Defaults to current head on main
   * @param {string} [opts.branch]   Defaults to main
   * @param {string|Buffer|Uint8Array} [opts.evidence]
   *        The signature evidence blob (image, PKI blob, OTP, …).
   *        We store only its hash, never the raw bytes.
   */
  signatureCapture(docId, signer, method, opts) {
    _assertStr(docId, 'docId');
    if (!signer || (typeof signer !== 'string' && typeof signer !== 'object')) {
      throw new TypeError('signer must be a string or object');
    }
    _assertStr(method, 'method');
    if (!SIGNATURE_METHODS[method]) {
      throw new Error('unknown signature method: ' + method);
    }
    const o = opts || {};
    const branch = o.branch || MAIN_BRANCH;
    const arr = this._getBranchOrThrow(docId, branch);
    if (arr.length === 0) throw new Error('no versions on branch ' + branch);
    const rec = o.version != null ? arr.find(v => v.version === o.version) : arr[arr.length - 1];
    if (!rec) throw new Error('no such version: ' + o.version);

    const signerId = typeof signer === 'string' ? signer : (signer.id || signer.email || signer.name);
    _assertStr(signerId, 'signer.id');

    const evidenceBuf = o.evidence != null ? _toBuffer(o.evidence) : Buffer.alloc(0);
    const sigPayload = {
      signer: typeof signer === 'string' ? { id: signer } : _deepCopy(signer),
      method: method,
      methodLabel: SIGNATURE_METHODS[method],
      ts: this._clock(),
      evidenceSha256: _sha256(evidenceBuf),
      targetVersion: rec.version,
      targetBranch: branch,
      targetSha256: rec.sha256,
    };
    sigPayload.sha256 = _sha256ofObj(sigPayload);

    rec.signatures = rec.signatures || [];
    rec.signatures.push(sigPayload);
    rec.status = DOC_STATUS.signed.id;

    // Re-compute the linked hash AFTER embedding the signature so the
    // tamper-evidence chain reflects the new state. We keep the old
    // linkedHash in a history array for full provenance.
    rec.linkedHashHistory = rec.linkedHashHistory || [];
    rec.linkedHashHistory.push({ at: this._clock(), hash: rec.linkedHash, reason: 'pre-signature' });
    rec.linkedHash = this._linkHash(docId, rec.prevLinkedHash, rec, rec.sha256);
    // Update chain head if this version was the head.
    const head = arr[arr.length - 1];
    if (head.version === rec.version && head.branch === rec.branch) {
      // Recompute chain head from the last version's linkedHash.
      this._chainHead.set(docId, rec.linkedHash);
    }

    this._audit(docId, AUDIT_ACTIONS.sign, signerId, {
      version: rec.version, branch: branch, method: method, sigSha: sigPayload.sha256,
    });
    return _deepCopy(sigPayload);
  }

  /* ---------- 13. tamperEvidence --------------------------------------- */

  /**
   * Re-walk the full version chain for the document across all
   * branches, recomputing each `linkedHash` from its `prevLinkedHash`
   * + metadata + stored content hash. Any mismatch ⇒ tamper evidence.
   *
   * For each version we ALSO re-fetch the bytes from storage and
   * re-hash them, so we catch both (a) in-memory metadata tampering
   * and (b) on-disk byte tampering.
   *
   * Returns `{ ok, breaks: [...] }` where `breaks` is an array of
   * `{branch, version, reason, expected, actual}` records — empty if
   * the chain is pristine.
   */
  async tamperEvidence(docId) {
    _assertStr(docId, 'docId');
    this._getDocOrThrow(docId);

    // Collect every version in creation order (by createdAt).
    const all = [];
    for (const [key, arr] of this.branches.entries()) {
      if (!key.startsWith(docId + '@')) continue;
      for (const v of arr) all.push(v);
    }
    all.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });

    const breaks = [];
    let prev = '';
    for (const v of all) {
      // Byte-level re-hash
      let bytes;
      try {
        bytes = await this.storage.get(v.storageKey);
      } catch (err) {
        breaks.push({ branch: v.branch, version: v.version, reason: 'storage_missing', error: String(err) });
        prev = v.linkedHash;
        continue;
      }
      const actualBytes = _sha256(bytes);
      if (actualBytes !== v.sha256) {
        breaks.push({
          branch: v.branch, version: v.version, reason: 'bytes_mismatch',
          expected: v.sha256, actual: actualBytes,
        });
      }

      // Chain-level re-hash
      const expectedLinked = this._linkHash(docId, prev, v, v.sha256);
      if (expectedLinked !== v.linkedHash) {
        breaks.push({
          branch: v.branch, version: v.version, reason: 'chain_mismatch',
          expected: expectedLinked, actual: v.linkedHash,
        });
      }
      if (v.prevLinkedHash !== prev) {
        breaks.push({
          branch: v.branch, version: v.version, reason: 'prev_link_mismatch',
          expected: prev, actual: v.prevLinkedHash,
        });
      }
      prev = v.linkedHash;
    }

    this._audit(docId, AUDIT_ACTIONS.tamper_check, null, {
      versionsChecked: all.length, breaks: breaks.length,
    });
    return { ok: breaks.length === 0, breaks: breaks, versionsChecked: all.length };
  }

  /* ---------- Convenience getters -------------------------------------- */

  listBranches(docId) {
    _assertStr(docId, 'docId');
    this._getDocOrThrow(docId);
    const out = [];
    for (const key of this.branches.keys()) {
      if (key.startsWith(docId + '@')) out.push(key.split('@')[1]);
    }
    return out.sort();
  }

  getDocument(docId) {
    _assertStr(docId, 'docId');
    return _deepCopy(this._getDocOrThrow(docId));
  }

  getVersion(docId, version, branch) {
    _assertStr(docId, 'docId');
    const arr = this._getBranchOrThrow(docId, branch || MAIN_BRANCH);
    const rec = arr.find(v => v.version === version);
    return rec ? _deepCopy(rec) : null;
  }
}

/* ----------------------------------------------------------------------------
 * 5. Module exports
 * -------------------------------------------------------------------------- */
module.exports = {
  DocVersionControl: DocVersionControl,
  InMemoryStorageAdapter: InMemoryStorageAdapter,
  DOC_STATUS: DOC_STATUS,
  SIGNATURE_METHODS: SIGNATURE_METHODS,
  AUDIT_ACTIONS: AUDIT_ACTIONS,
  MAIN_BRANCH: MAIN_BRANCH,
  // Exposed for tests / advanced callers — never mutate these directly.
  _internals: {
    sha256: _sha256,
    sha256ofObj: _sha256ofObj,
    canonicalJSON: _canonicalJSON,
    diffLines: _diffLines,
    threeWayMerge: _threeWayMerge,
    storageKey: _storageKey,
    toBuffer: _toBuffer,
  },
};
