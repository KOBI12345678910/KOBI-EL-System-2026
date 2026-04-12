/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TOS Tracker — מעקב קבלת תנאי שימוש (Terms of Service Acceptance Tracker)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-141  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / tos-tracker.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Append-only acceptance tracker for Terms of Service / תנאי שימוש ו-
 *  הסכמי משתמש, built for Israeli consumer-law compliance:
 *
 *    • חוק הגנת הצרכן, התשמ"א-1981 (Consumer Protection Law, 1981):
 *        – סעיף 2 — איסור הטעיה בהסכמי הצטרפות.
 *        – סעיף 3 — תניות מקפחות בחוזה אחיד.
 *        – סעיף 14ג — זכות ביטול עסקת מכר מרחוק.
 *    • חוק החוזים האחידים, התשמ"ג-1982 (Standard Contracts Law, 1982):
 *        – סעיף 3 — בית הדין לחוזים אחידים רשאי לבטל תניות מקפחות.
 *        – סעיף 4 — חזקות לתניות מקפחות (התניית שירות, שחרור מאחריות,
 *                    שינוי חד-צדדי של תנאים).
 *    • חוק הגנת הפרטיות, התשמ"א-1981 + תיקון 13 (2024):
 *        – סעיף 11 — הסכמה מדעת, מפורשת, חופשית.
 *        – סעיף 13א — זכות לחזרה מהסכמה "קלה כמתן".
 *    • חוק המחשבים, התשנ"ה-1995 (Computers Law, 1995): כתב-הוכחה של
 *      לחיצת "אני מסכים" כשיש evidence chain.
 *
 *  Core invariant of Techno-Kol Uzi:
 *     "לא מוחקים רק משדרגים ומגדלים"  — we never hard-delete.
 *     Publishing a new TOS version does NOT replace the old one: both
 *     versions co-exist in the append-only ledger forever. Re-acceptance
 *     after a material change creates a NEW acceptance record; the old
 *     one is preserved verbatim, time-stamped, hash-chained.
 *
 *  Storage
 *  -------
 *  In-memory Maps + append-only arrays. Every publish / accept / bulk
 *  re-require is a deep-frozen record, appended to a single ledger
 *  with a SHA-256 chain-of-custody audit trail. No external deps.
 *
 *  Zero external dependencies — only `node:crypto`.
 *
 *  Public API
 *  ----------
 *    class TOSTracker
 *      .publishVersion({...})                 -> immutable version record
 *      .recordAcceptance({...})               -> immutable acceptance record
 *      .checkAcceptance(userId)               -> { current, accepted, status }
 *      .bulkRequireReacceptance(vid, {...})   -> mark users needing re-accept
 *      .lastAcceptedVersion(userId)           -> latest accepted version id
 *      .listNonAccepters(versionId)           -> users who haven't accepted
 *      .generateAcceptanceLog(period)         -> audit export
 *      .diffVersions(v1, v2)                  -> bilingual textual diff
 *      .generateAcceptanceUI({...})           -> self-contained RTL HTML
 *      .exportForDSR(userId)                  -> Y-136 DSR packet
 *      .enforceGating({userId, action})       -> block if not accepted
 *      .currentVersion()                      -> latest required version
 *      .listVersions()                        -> append-only ledger
 *      .verifyChain()                         -> tamper detection
 *
 *  Run tests:
 *    node --test test/privacy/tos-tracker.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ───────────────────────────────────────────────────────────────────────────
//  Constants — acceptance methods, record kinds, statuses, gated actions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Three canonical acceptance methods. `signed` is the strongest evidentiary
 * form (electronic signature), `click` is the standard click-wrap, `browse`
 * is the weakest and is only recognised for non-material updates under
 * חוק החוזים האחידים section 4 (presumption against one-sided clauses).
 */
const ACCEPTANCE_METHODS = Object.freeze({
  CLICK:  'click',
  SIGNED: 'signed',
  BROWSE: 'browse',
});

const METHOD_LABELS = Object.freeze({
  [ACCEPTANCE_METHODS.CLICK]:  { he: 'לחיצה על "אני מסכים"', en: 'Click-wrap acceptance' },
  [ACCEPTANCE_METHODS.SIGNED]: { he: 'חתימה אלקטרונית',       en: 'Electronic signature' },
  [ACCEPTANCE_METHODS.BROWSE]: { he: 'הסכמה על-ידי גלישה',   en: 'Browse-wrap acceptance' },
});

/**
 * Weakest-permitted method per material-change level. Material changes
 * MUST use click or signed — browse-wrap is rejected. Cosmetic changes
 * (typos, formatting) may rely on browse.
 */
const METHOD_STRENGTH = Object.freeze({
  [ACCEPTANCE_METHODS.BROWSE]: 1,
  [ACCEPTANCE_METHODS.CLICK]:  2,
  [ACCEPTANCE_METHODS.SIGNED]: 3,
});

const RECORD_KIND = Object.freeze({
  PUBLISH:     'publish',      // new TOS version published
  ACCEPT:      'accept',       // user recorded acceptance
  REREQUIRE:   'rerequire',    // bulk re-acceptance requirement
});

const ACCEPTANCE_STATUS = Object.freeze({
  CURRENT:      'current',       // user accepted the current required version
  STALE:        'stale',         // user accepted an older version, re-accept needed
  NEVER:        'never',         // user has no acceptance record
  REREQUIRED:   'rerequired',    // admin flipped a bulk re-require flag
});

/**
 * Gated actions — user cannot perform these without current acceptance.
 * Extendable by callers via `TOSTracker#registerGatedAction(action)`.
 */
const DEFAULT_GATED_ACTIONS = Object.freeze([
  'checkout',
  'submit-order',
  'withdraw-funds',
  'share-data',
  'publish-content',
  'invite-member',
  'change-billing',
  'export-data',
]);

// ───────────────────────────────────────────────────────────────────────────
//  Helpers — hashing, deep freeze, id generation, date utilities
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

/**
 * HTML-escape — we generate user-facing modals and must not allow injection
 * from change-log entries or consent text. Six characters covered:
 *   & < > " ' /
 */
function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#47;');
}

/**
 * Line-level LCS diff. Zero external deps. Classic dynamic-programming
 * table; we then walk it to emit context/add/remove rows.
 * Complexity: O(n*m) lines. Fine for TOS documents (~1-10 KB).
 */
function lineDiff(a, b) {
  const aLines = (a || '').split(/\r?\n/);
  const bLines = (b || '').split(/\r?\n/);
  const n = aLines.length;
  const m = bLines.length;

  // DP table: dp[i][j] = LCS length of aLines[0..i] / bLines[0..j]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build the diff script
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      ops.unshift({ op: 'equal', text: aLines[i - 1] });
      i -= 1; j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ op: 'remove', text: aLines[i - 1] });
      i -= 1;
    } else {
      ops.unshift({ op: 'add', text: bLines[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.unshift({ op: 'remove', text: aLines[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    ops.unshift({ op: 'add', text: bLines[j - 1] });
    j -= 1;
  }

  const added   = ops.filter((o) => o.op === 'add').length;
  const removed = ops.filter((o) => o.op === 'remove').length;
  return { ops, added, removed };
}

// ───────────────────────────────────────────────────────────────────────────
//  TOSTracker — the class
// ───────────────────────────────────────────────────────────────────────────

class TOSTracker {
  constructor(options = {}) {
    // append-only ledger — every PUBLISH / ACCEPT / REREQUIRE record
    this._ledger = [];

    // versionId -> frozen version record (PUBLISH)
    this._versions = new Map();

    // ordered list of versionIds (publish order)
    this._versionOrder = [];

    // userId -> array of acceptance recordIds (ordered)
    this._acceptancesByUser = new Map();

    // versionId -> Set of userIds who accepted it
    this._acceptancesByVersion = new Map();

    // versionId -> { effectiveDate, reason, at } (bulk re-require flags)
    this._rerequired = new Map();

    // hash-chained audit events
    this._audit = [];

    // gated actions registry — extendable
    this._gatedActions = new Set(DEFAULT_GATED_ACTIONS);

    // optional clock injection (for deterministic tests)
    this._now = options.now || (() => new Date());
  }

  // ─────────────────────────────────────────────────────────────────────
  //  publishVersion — append a new TOS version to the ledger
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {string} input.versionId        — human-readable (e.g. "v3.1")
   * @param {Date|string} input.effectiveDate
   * @param {string} input.content_he       — full Hebrew TOS body
   * @param {string} input.content_en       — full English TOS body
   * @param {Array<string|object>} [input.changeLog] — human-readable list
   * @param {boolean} [input.requiresReacceptance=false] — material change?
   * @returns {object} frozen version record
   */
  publishVersion(input) {
    const {
      versionId,
      effectiveDate,
      content_he,
      content_en,
      changeLog,
      requiresReacceptance,
    } = input || {};

    if (!versionId || typeof versionId !== 'string') {
      throw new Error('publishVersion: versionId is required');
    }
    if (this._versions.has(versionId)) {
      throw new Error(`publishVersion: versionId "${versionId}" already exists — append-only`);
    }
    if (!content_he || !content_en) {
      throw new Error('publishVersion: bilingual content_he + content_en required (חוק הגנת הצרכן סעיף 2)');
    }
    if (!effectiveDate) {
      throw new Error('publishVersion: effectiveDate is required');
    }

    const effective = toDate(effectiveDate);
    const recordId  = makeId('tos');

    // Normalize the change log — allow strings OR objects with he/en
    const normalizedLog = Array.isArray(changeLog)
      ? changeLog.map((entry) => {
          if (typeof entry === 'string') {
            return { he: entry, en: entry };
          }
          return {
            he: entry && entry.he ? String(entry.he) : '',
            en: entry && entry.en ? String(entry.en) : '',
          };
        })
      : [];

    const payload = {
      recordId,
      kind: RECORD_KIND.PUBLISH,
      versionId,
      effectiveDate: effective.toISOString(),
      content_he,
      content_en,
      contentHash_he: sha256Hex(content_he),
      contentHash_en: sha256Hex(content_en),
      changeLog: normalizedLog,
      requiresReacceptance: Boolean(requiresReacceptance),
      lawCitations: [
        'חוק הגנת הצרכן, התשמ"א-1981, סעיף 2 (איסור הטעיה)',
        'חוק החוזים האחידים, התשמ"ג-1982, סעיף 3',
        'חוק הגנת הפרטיות, תיקון 13 (2024), סעיף 11',
      ],
      titleLabels: {
        he: 'תנאי שימוש — גרסה חדשה',
        en: 'Terms of Service — new version',
      },
      createdAt: this._now().toISOString(),
    };

    const record = deepFreeze(Object.assign({}, payload, {
      payloadHash: sha256Hex(JSON.stringify(payload)),
    }));

    this._versions.set(versionId, record);
    this._versionOrder.push(versionId);
    this._ledger.push(record);
    this._appendAudit('publish_version', record);

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  recordAcceptance — append an immutable acceptance record
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {string} input.userId
   * @param {string} input.versionId
   * @param {string} input.method      — one of ACCEPTANCE_METHODS
   * @param {string} [input.ip]
   * @param {string} [input.userAgent]
   * @param {Date|string} [input.timestamp]
   * @returns {object} frozen acceptance record
   */
  recordAcceptance(input) {
    const {
      userId,
      versionId,
      method,
      ip,
      userAgent,
      timestamp,
    } = input || {};

    if (!userId || typeof userId !== 'string') {
      throw new Error('recordAcceptance: userId is required');
    }
    if (!versionId || typeof versionId !== 'string') {
      throw new Error('recordAcceptance: versionId is required');
    }
    const version = this._versions.get(versionId);
    if (!version) {
      throw new Error(`recordAcceptance: unknown versionId "${versionId}"`);
    }
    if (!Object.values(ACCEPTANCE_METHODS).includes(method)) {
      throw new Error(
        `recordAcceptance: invalid method "${method}" — must be one of: ` +
        Object.values(ACCEPTANCE_METHODS).join(', '),
      );
    }
    // Material-change gate: browse-wrap cannot satisfy a material change
    if (version.requiresReacceptance && method === ACCEPTANCE_METHODS.BROWSE) {
      throw new Error(
        `recordAcceptance: browse-wrap rejected for material version "${versionId}" ` +
        `(חוק החוזים האחידים סעיף 4 — תניית שינוי חד-צדדי)`,
      );
    }

    const accepted = toDate(timestamp || this._now());
    const recordId = makeId('accept');

    const payload = {
      recordId,
      kind: RECORD_KIND.ACCEPT,
      userId,
      userHash: sha256Hex(userId),
      versionId,
      versionHash: version.payloadHash,
      method,
      methodLabels: METHOD_LABELS[method],
      ip: ip || null,
      // hash the IP for privacy — full IP is PII under תיקון 13
      ipHash: ip ? sha256Hex(ip) : null,
      userAgent: userAgent || null,
      userAgentHash: userAgent ? sha256Hex(userAgent) : null,
      timestamp: accepted.toISOString(),
      createdAt: this._now().toISOString(),
      labels: {
        he: `קבלת תנאי שימוש — גרסה ${versionId}`,
        en: `Terms accepted — version ${versionId}`,
      },
    };

    const record = deepFreeze(Object.assign({}, payload, {
      payloadHash: sha256Hex(JSON.stringify(payload)),
    }));

    if (!this._acceptancesByUser.has(userId)) {
      this._acceptancesByUser.set(userId, []);
    }
    this._acceptancesByUser.get(userId).push(record.recordId);

    if (!this._acceptancesByVersion.has(versionId)) {
      this._acceptancesByVersion.set(versionId, new Set());
    }
    this._acceptancesByVersion.get(versionId).add(userId);

    this._ledger.push(record);
    this._appendAudit('record_acceptance', record);

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  checkAcceptance — compare latest accepted vs current required
  // ─────────────────────────────────────────────────────────────────────
  checkAcceptance(userId) {
    if (!userId) throw new Error('checkAcceptance: userId required');

    const current = this.currentVersion();
    if (!current) {
      return {
        status: ACCEPTANCE_STATUS.NEVER,
        current: null,
        acceptedVersionId: null,
        acceptedAt: null,
        reason: 'no-tos-published',
      };
    }

    const lastAcc = this._lastAcceptanceRecord(userId);
    if (!lastAcc) {
      return {
        status: ACCEPTANCE_STATUS.NEVER,
        current: current.versionId,
        acceptedVersionId: null,
        acceptedAt: null,
        reason: 'user-never-accepted',
        labels: {
          he: 'משתמש מעולם לא קיבל את תנאי השימוש',
          en: 'User has never accepted the Terms of Service',
        },
      };
    }

    // If the current version's id is under a re-require flag AND this user
    // accepted BEFORE the re-require effective date, their acceptance is
    // voided and they must re-accept.
    const rerequired = this._rerequired.get(current.versionId);
    if (rerequired &&
        new Date(lastAcc.timestamp).getTime() < new Date(rerequired.effectiveDate).getTime()) {
      return {
        status: ACCEPTANCE_STATUS.REREQUIRED,
        current: current.versionId,
        acceptedVersionId: lastAcc.versionId,
        acceptedAt: lastAcc.timestamp,
        reason: rerequired.reason,
        reasonLabels: {
          he: `נדרשת קבלה מחודשת: ${rerequired.reason}`,
          en: `Re-acceptance required: ${rerequired.reason}`,
        },
      };
    }

    if (lastAcc.versionId === current.versionId) {
      return {
        status: ACCEPTANCE_STATUS.CURRENT,
        current: current.versionId,
        acceptedVersionId: lastAcc.versionId,
        acceptedAt: lastAcc.timestamp,
        reason: 'current',
      };
    }

    return {
      status: ACCEPTANCE_STATUS.STALE,
      current: current.versionId,
      acceptedVersionId: lastAcc.versionId,
      acceptedAt: lastAcc.timestamp,
      reason: 'older-version-accepted',
      labels: {
        he: `התקבלה גרסה ישנה יותר (${lastAcc.versionId})`,
        en: `User accepted older version (${lastAcc.versionId})`,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  bulkRequireReacceptance — flip a bulk re-require flag on a version
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Appends a REREQUIRE record to the ledger. Does NOT mutate existing
   * acceptance records. From `effectiveDate` forward, users whose latest
   * acceptance predates the flag will be reported as REREQUIRED.
   */
  bulkRequireReacceptance(versionId, { effectiveDate, reason } = {}) {
    const version = this._versions.get(versionId);
    if (!version) {
      throw new Error(`bulkRequireReacceptance: unknown versionId "${versionId}"`);
    }
    if (!reason || typeof reason !== 'string') {
      throw new Error('bulkRequireReacceptance: written reason is required (חוק החוזים האחידים סעיף 4)');
    }

    const effective = toDate(effectiveDate || this._now());
    const recordId  = makeId('rerequire');

    const payload = {
      recordId,
      kind: RECORD_KIND.REREQUIRE,
      versionId,
      effectiveDate: effective.toISOString(),
      reason,
      reasonLabels: {
        he: `נדרשת קבלה מחודשת: ${reason}`,
        en: `Re-acceptance required: ${reason}`,
      },
      createdAt: this._now().toISOString(),
    };

    const record = deepFreeze(Object.assign({}, payload, {
      payloadHash: sha256Hex(JSON.stringify(payload)),
    }));

    this._rerequired.set(versionId, {
      effectiveDate: effective.toISOString(),
      reason,
      recordId,
      at: this._now().toISOString(),
    });

    this._ledger.push(record);
    this._appendAudit('bulk_rerequire', record);

    // Walk every user, compute who needs re-accept
    const affected = [];
    for (const [userId] of this._acceptancesByUser.entries()) {
      const last = this._lastAcceptanceRecord(userId);
      if (!last) continue;
      if (new Date(last.timestamp).getTime() < effective.getTime()) {
        affected.push(userId);
      }
    }

    return {
      record,
      affectedUsers: affected,
      affectedCount: affected.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  lastAcceptedVersion — query the user's most recent acceptance
  // ─────────────────────────────────────────────────────────────────────
  lastAcceptedVersion(userId) {
    const last = this._lastAcceptanceRecord(userId);
    if (!last) return null;
    return last.versionId;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  listNonAccepters — users who have NOT accepted the latest version
  // ─────────────────────────────────────────────────────────────────────
  /**
   * `versionId` is optional — defaults to current required version.
   * Returns the set of known userIds whose latest acceptance is NOT
   * the target version. A user with NO acceptance record at all is
   * only returned if they are in the system — we cannot enumerate
   * users who have never interacted with the TOS layer.
   */
  listNonAccepters(versionId) {
    const target = versionId || (this.currentVersion() && this.currentVersion().versionId);
    if (!target) return [];
    if (!this._versions.has(target)) {
      throw new Error(`listNonAccepters: unknown versionId "${target}"`);
    }

    const accepted = this._acceptancesByVersion.get(target) || new Set();
    const all = Array.from(this._acceptancesByUser.keys());
    return all.filter((userId) => {
      if (!accepted.has(userId)) return true;
      // Also catch users blocked by re-require flag
      const check = this.checkAcceptance(userId);
      return check.status === ACCEPTANCE_STATUS.REREQUIRED;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  generateAcceptanceLog — audit export filtered by period
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} period
   * @param {Date|string} period.from
   * @param {Date|string} period.to
   * @returns {object} bilingual audit packet
   */
  generateAcceptanceLog(period = {}) {
    const from = toDate(period.from || '1970-01-01T00:00:00Z');
    const to   = toDate(period.to   || this._now());

    const entries = this._ledger
      .filter((r) => r.kind === RECORD_KIND.ACCEPT)
      .filter((r) => {
        const t = new Date(r.timestamp).getTime();
        return t >= from.getTime() && t <= to.getTime();
      })
      .map((r) => ({
        recordId: r.recordId,
        userHash: r.userHash,
        versionId: r.versionId,
        method: r.method,
        methodLabels: r.methodLabels,
        ipHash: r.ipHash,
        userAgentHash: r.userAgentHash,
        timestamp: r.timestamp,
      }));

    const byMethod = {};
    for (const e of entries) {
      byMethod[e.method] = (byMethod[e.method] || 0) + 1;
    }
    const byVersion = {};
    for (const e of entries) {
      byVersion[e.versionId] = (byVersion[e.versionId] || 0) + 1;
    }

    return deepFreeze({
      titleLabels: {
        he: 'יומן קבלת תנאי שימוש',
        en: 'Terms of Service acceptance log',
      },
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        count: entries.length,
        uniqueUsers: new Set(entries.map((e) => e.userHash)).size,
      },
      byMethod,
      byVersion,
      entries,
      citations: [
        'חוק המחשבים, התשנ"ה-1995 (ראיה אלקטרונית)',
        'חוק החוזים האחידים, התשמ"ג-1982, סעיף 3',
      ],
      generatedAt: this._now().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  diffVersions — bilingual textual diff between two versions
  // ─────────────────────────────────────────────────────────────────────
  diffVersions(v1, v2) {
    const ver1 = this._versions.get(v1);
    const ver2 = this._versions.get(v2);
    if (!ver1) throw new Error(`diffVersions: unknown versionId "${v1}"`);
    if (!ver2) throw new Error(`diffVersions: unknown versionId "${v2}"`);

    const heDiff = lineDiff(ver1.content_he, ver2.content_he);
    const enDiff = lineDiff(ver1.content_en, ver2.content_en);

    return deepFreeze({
      from: v1,
      to: v2,
      identical: heDiff.added === 0 && heDiff.removed === 0 &&
                 enDiff.added === 0 && enDiff.removed === 0,
      he: heDiff,
      en: enDiff,
      titleLabels: {
        he: `השוואת גרסאות ${v1} → ${v2}`,
        en: `Version comparison ${v1} → ${v2}`,
      },
      statsLabels: {
        he: `הוספו: ${heDiff.added} שורות, הוסרו: ${heDiff.removed} שורות`,
        en: `Added: ${heDiff.added} lines, removed: ${heDiff.removed} lines`,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  generateAcceptanceUI — self-contained bilingual modal HTML
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {string} input.versionId
   * @param {'he'|'en'|'both'} [input.lang='both']
   * @param {boolean} [input.showDiff=false]
   * @returns {string} full <!DOCTYPE html>... document
   */
  generateAcceptanceUI(input = {}) {
    const { versionId, lang, showDiff } = input;
    const version = this._versions.get(versionId);
    if (!version) {
      throw new Error(`generateAcceptanceUI: unknown versionId "${versionId}"`);
    }
    const useLang = lang || 'both';
    if (!['he', 'en', 'both'].includes(useLang)) {
      throw new Error(`generateAcceptanceUI: invalid lang "${useLang}"`);
    }

    // Optional diff against the previous version
    let diffBlock = '';
    if (showDiff) {
      const idx = this._versionOrder.indexOf(versionId);
      if (idx > 0) {
        const prev = this._versionOrder[idx - 1];
        const d = this.diffVersions(prev, versionId);
        diffBlock = this._renderDiffBlock(prev, versionId, d, useLang);
      } else {
        diffBlock = `<div class="diff-block diff-empty">` +
          (useLang !== 'en' ? '<p lang="he" dir="rtl">זוהי הגרסה הראשונה — אין שינויים להציג.</p>' : '') +
          (useLang !== 'he' ? '<p lang="en" dir="ltr">This is the first version — no diff to show.</p>' : '') +
          `</div>`;
      }
    }

    const changeLogList = version.changeLog.map((entry) => {
      const he = escapeHtml(entry.he);
      const en = escapeHtml(entry.en);
      const liHe = useLang !== 'en' ? `<li lang="he" dir="rtl">${he}</li>` : '';
      const liEn = useLang !== 'he' ? `<li lang="en" dir="ltr">${en}</li>` : '';
      return liHe + liEn;
    }).join('\n');

    const titleHe = escapeHtml('תנאי שימוש — גרסה ' + versionId);
    const titleEn = escapeHtml('Terms of Service — version ' + versionId);

    const heBody = useLang !== 'en' ? `
      <section lang="he" dir="rtl" class="tos-body tos-he">
        <h1>${titleHe}</h1>
        <p class="effective"><strong>תוקף:</strong> ${escapeHtml(version.effectiveDate)}</p>
        <h2>מה חדש בגרסה זו?</h2>
        <ul>${changeLogList || '<li>עדכונים כלליים</li>'}</ul>
        <h2>מסמך מלא</h2>
        <pre class="tos-content">${escapeHtml(version.content_he)}</pre>
      </section>
    ` : '';

    const enBody = useLang !== 'he' ? `
      <section lang="en" dir="ltr" class="tos-body tos-en">
        <h1>${titleEn}</h1>
        <p class="effective"><strong>Effective:</strong> ${escapeHtml(version.effectiveDate)}</p>
        <h2>What's new in this version?</h2>
        <ul>${changeLogList || '<li>General updates</li>'}</ul>
        <h2>Full document</h2>
        <pre class="tos-content">${escapeHtml(version.content_en)}</pre>
      </section>
    ` : '';

    const acceptButton = `
      <div class="tos-actions">
        ${useLang !== 'en' ? '<button type="button" class="btn-accept" data-lang="he">אני מסכים/ה ומאשר/ת</button>' : ''}
        ${useLang !== 'he' ? '<button type="button" class="btn-accept" data-lang="en">I accept and agree</button>' : ''}
        ${useLang !== 'en' ? '<button type="button" class="btn-decline" data-lang="he">איני מסכים/ה</button>' : ''}
        ${useLang !== 'he' ? '<button type="button" class="btn-decline" data-lang="en">I decline</button>' : ''}
      </div>
    `;

    const legalFooter = `
      <footer class="legal-footer">
        ${useLang !== 'en' ? '<p lang="he" dir="rtl">בהתאם לחוק הגנת הצרכן התשמ"א-1981 ולחוק החוזים האחידים התשמ"ג-1982 — תניות מקפחות בטלות. הסכמתך נאספת בהתאם לתיקון 13 לחוק הגנת הפרטיות (2024).</p>' : ''}
        ${useLang !== 'he' ? '<p lang="en" dir="ltr">Per Consumer Protection Law 5741-1981 and Standard Contracts Law 5743-1982, unfair terms are void. Consent collected pursuant to Privacy Protection Law Amendment 13 (2024).</p>' : ''}
      </footer>
    `;

    return `<!DOCTYPE html>
<html lang="${useLang === 'en' ? 'en' : 'he'}" dir="${useLang === 'en' ? 'ltr' : 'rtl'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${useLang === 'en' ? titleEn : titleHe}</title>
<style>
:root {
  --bg: #ffffff;
  --fg: #111827;
  --accent: #0f4c81;
  --border: #e5e7eb;
  --ok: #047857;
  --bad: #b91c1c;
  --warn: #b45309;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
}
.tos-modal {
  max-width: 780px;
  margin: 32px auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.06);
}
h1 { font-size: 1.5rem; margin: 0 0 12px; color: var(--accent); }
h2 { font-size: 1.125rem; margin: 20px 0 8px; }
.tos-body { margin-bottom: 16px; }
.tos-he { text-align: right; }
.tos-en { text-align: left; }
.effective { color: #4b5563; font-size: 0.95rem; }
.tos-content {
  white-space: pre-wrap;
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  font-family: "Noto Sans Hebrew Mono", "Consolas", monospace;
  font-size: 0.85rem;
  max-height: 320px;
  overflow: auto;
}
.diff-block {
  border: 1px dashed var(--border);
  padding: 12px;
  border-radius: 8px;
  margin: 16px 0;
  background: #fffbeb;
}
.diff-line { font-family: monospace; padding: 2px 6px; display: block; white-space: pre-wrap; }
.diff-add    { background: #ecfdf5; color: var(--ok); }
.diff-remove { background: #fef2f2; color: var(--bad); text-decoration: line-through; }
.diff-equal  { color: #6b7280; }
.tos-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
button {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.95rem;
  cursor: pointer;
  min-width: 160px;
}
.btn-accept { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-accept:hover { filter: brightness(1.1); }
.btn-decline { background: #fff; color: var(--fg); }
.legal-footer {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
  color: #6b7280;
}
@media (max-width: 640px) {
  .tos-modal { margin: 0; border-radius: 0; }
  button { flex: 1 1 100%; }
}
</style>
</head>
<body>
<main class="tos-modal" role="dialog" aria-modal="true" aria-labelledby="tos-title">
  ${heBody}
  ${enBody}
  ${diffBlock}
  ${acceptButton}
  ${legalFooter}
</main>
</body>
</html>`;
  }

  _renderDiffBlock(prev, current, diff, lang) {
    const rows = diff.he.ops.map((op) => {
      const cls = op.op === 'add' ? 'diff-add' : op.op === 'remove' ? 'diff-remove' : 'diff-equal';
      const sigil = op.op === 'add' ? '+ ' : op.op === 'remove' ? '- ' : '  ';
      return `<span class="diff-line ${cls}">${escapeHtml(sigil + op.text)}</span>`;
    }).join('\n');

    const heTitle = escapeHtml(`שינויים בין ${prev} ל-${current}`);
    const enTitle = escapeHtml(`Changes between ${prev} and ${current}`);
    const heStats = escapeHtml(`הוספו: ${diff.he.added} שורות, הוסרו: ${diff.he.removed} שורות`);
    const enStats = escapeHtml(`Added: ${diff.en.added} lines, removed: ${diff.en.removed} lines`);

    return `<section class="diff-block" aria-label="version diff">
      ${lang !== 'en' ? `<h2 lang="he" dir="rtl">${heTitle}</h2><p lang="he" dir="rtl">${heStats}</p>` : ''}
      ${lang !== 'he' ? `<h2 lang="en" dir="ltr">${enTitle}</h2><p lang="en" dir="ltr">${enStats}</p>` : ''}
      <div class="diff-rows" dir="rtl">${rows}</div>
    </section>`;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  exportForDSR — integrate with Y-136 DSRHandler
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Returns a bilingual, DSR-ready export of every TOS event that
   * touches this user: every acceptance record, the versions they
   * accepted (by content hash), the current required version, and
   * their gating status.
   */
  exportForDSR(userId) {
    if (!userId) throw new Error('exportForDSR: userId required');

    const ids = this._acceptancesByUser.get(userId) || [];
    const acceptances = this._ledger.filter(
      (r) => r.kind === RECORD_KIND.ACCEPT && r.userId === userId,
    );
    const versionsSeen = new Set(acceptances.map((a) => a.versionId));
    const versions = Array.from(versionsSeen).map((vid) => {
      const v = this._versions.get(vid);
      return {
        versionId: v.versionId,
        effectiveDate: v.effectiveDate,
        contentHash_he: v.contentHash_he,
        contentHash_en: v.contentHash_en,
        requiresReacceptance: v.requiresReacceptance,
      };
    });

    const current = this.currentVersion();
    const check = this.checkAcceptance(userId);

    return deepFreeze({
      subjectId: userId,
      subjectHash: sha256Hex(userId),
      exportedAt: this._now().toISOString(),
      titleLabels: {
        he: 'ייצוא היסטוריית קבלת תנאי שימוש לבקשת נושא מידע',
        en: 'Terms of Service acceptance history export for Data Subject Request',
      },
      citations: [
        'חוק הגנת הפרטיות תיקון 13 סעיף 13 (זכות עיון)',
        'חוק המחשבים, התשנ"ה-1995',
        'חוק הגנת הצרכן, התשמ"א-1981, סעיף 2',
      ],
      currentRequired: current ? {
        versionId: current.versionId,
        effectiveDate: current.effectiveDate,
      } : null,
      status: check,
      counts: {
        total: acceptances.length,
        uniqueVersions: versions.length,
      },
      versions,
      acceptances: acceptances.map((a) => ({
        recordId: a.recordId,
        versionId: a.versionId,
        method: a.method,
        methodLabels: a.methodLabels,
        ipHash: a.ipHash,
        userAgentHash: a.userAgentHash,
        timestamp: a.timestamp,
      })),
      recordIdCount: ids.length,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  enforceGating — block actions when user has not accepted latest
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Returns `{ allowed, reason, status, labels }`. Unknown (non-gated)
   * actions are always allowed. Gated actions require CURRENT status.
   */
  enforceGating({ userId, action } = {}) {
    if (!userId) throw new Error('enforceGating: userId required');
    if (!action) throw new Error('enforceGating: action required');

    if (!this._gatedActions.has(action)) {
      return {
        allowed: true,
        reason: 'action-not-gated',
        action,
        status: null,
        labels: {
          he: 'הפעולה אינה מוגבלת על-ידי תנאי שימוש',
          en: 'Action is not gated by TOS acceptance',
        },
      };
    }

    const check = this.checkAcceptance(userId);
    if (check.status === ACCEPTANCE_STATUS.CURRENT) {
      return {
        allowed: true,
        reason: 'tos-accepted',
        action,
        status: check.status,
        labels: {
          he: 'תנאי השימוש התקבלו — הפעולה מאושרת',
          en: 'Terms accepted — action permitted',
        },
      };
    }

    return {
      allowed: false,
      reason: check.status,
      action,
      status: check.status,
      currentRequired: check.current,
      lastAccepted: check.acceptedVersionId,
      labels: {
        he: `הפעולה "${action}" חסומה — נדרשת קבלת תנאי השימוש הנוכחיים (${check.current})`,
        en: `Action "${action}" blocked — current Terms of Service acceptance required (${check.current})`,
      },
      citation: 'חוק החוזים האחידים, התשמ"ג-1982, סעיף 3',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Convenience / query helpers
  // ─────────────────────────────────────────────────────────────────────
  currentVersion() {
    if (this._versionOrder.length === 0) return null;
    const latestId = this._versionOrder[this._versionOrder.length - 1];
    return this._versions.get(latestId);
  }

  listVersions() {
    return this._versionOrder.map((id) => this._versions.get(id));
  }

  registerGatedAction(action) {
    if (!action || typeof action !== 'string') {
      throw new Error('registerGatedAction: action string required');
    }
    this._gatedActions.add(action);
    return Array.from(this._gatedActions);
  }

  listGatedActions() {
    return Array.from(this._gatedActions);
  }

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

  auditLog() {
    return this._audit.slice();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────────────────────────────
  _lastAcceptanceRecord(userId) {
    const accs = this._ledger.filter(
      (r) => r.kind === RECORD_KIND.ACCEPT && r.userId === userId,
    );
    if (accs.length === 0) return null;
    return accs.reduce((latest, cur) =>
      new Date(cur.timestamp) > new Date(latest.timestamp) ? cur : latest,
    );
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
  TOSTracker,
  ACCEPTANCE_METHODS,
  METHOD_LABELS,
  METHOD_STRENGTH,
  RECORD_KIND,
  ACCEPTANCE_STATUS,
  DEFAULT_GATED_ACTIONS,
  // exported for tests
  _internals: { sha256Hex, escapeHtml, lineDiff },
};
