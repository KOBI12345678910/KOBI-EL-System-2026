/**
 * Legal Hold Enforcer — אכיפת עיכוב משפטי
 * Agent Y-150 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Mission:
 *   Freeze records from deletion or modification once a legal hold is
 *   applied. A legal hold ALWAYS overrides retention expiry — if a record
 *   is under hold, it cannot be disposed of even if its retention window
 *   has elapsed. Hold records themselves are never hard-deleted: releasing
 *   a hold transitions it to status "released" while preserving history.
 *
 * Design principles:
 *   - "לא מוחקים רק משדרגים ומגדלים" (no destructive deletes, ever).
 *   - Zero external dependencies — `node:crypto` only (built-in).
 *   - Append-only event log with hash chain (tamper-evident).
 *   - Loose coupling with document manager (Y-106) and retention
 *     engine (Y-149): this module EMITS events, never imports them.
 *   - Bilingual Hebrew (RTL) + English surfaces for every artefact.
 *   - Israeli court references: צו עיכוב (stay order), צו חיפוש (search
 *     warrant) supported as hold sources.
 *
 * Public API:
 *   class LegalHoldEnforcer
 *     .createHold(caseId, scope, custodians, keywords, opts?) -> holdRecord
 *     .listHolds(filter?)                                      -> holdRecord[]
 *     .isLocked(recordId, context?)                            -> boolean
 *     .matchingHolds(recordId, context?)                       -> holdRecord[]
 *     .releaseHold(caseId, justification, approver)            -> holdRecord
 *     .custodianNotice(caseId, custodianId)                    -> bilingual letter
 *     .collectionExport(caseId, records)                       -> manifest + SHA256
 *     .overrideAlert(recordId, actor, action, context?)        -> alert (logged)
 *     .reportForCourt(caseId, opts?)                           -> bilingual report
 *     .auditLog(filter?)                                       -> events (append-only)
 *     .verifyChain()                                           -> { valid, brokenAt }
 *     .on(event, handler) / .off(event, handler)               -> event emitter
 *
 * Integration contract (loose):
 *   const enforcer = new LegalHoldEnforcer();
 *   docManager.beforeDelete = (rec, ctx) => {
 *     if (enforcer.isLocked(rec.id, ctx)) {
 *       enforcer.overrideAlert(rec.id, ctx.actor, 'delete', ctx);
 *       throw new Error('BLOCKED_BY_LEGAL_HOLD');
 *     }
 *   };
 *   enforcer.on('hold.created', evt => retentionEngine.refreshHolds?.());
 *
 * Never-delete invariant:
 *   - releaseHold() flips status; it does not remove the hold row.
 *   - the audit log is strictly append-only with a hash chain.
 *   - collectionExport never mutates the source records.
 *
 * Run tests:
 *   node --test onyx-procurement/test/compliance/legal-hold.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ─── constants ─────────────────────────────────────────────────────────

const HOLD_STATUS = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
});

const HOLD_SOURCES = Object.freeze({
  INTERNAL: 'internal',              // initiated by legal ops
  STAY_ORDER: 'stay_order',          // צו עיכוב
  SEARCH_WARRANT: 'search_warrant',  // צו חיפוש
  LITIGATION: 'litigation',
  REGULATORY: 'regulatory',
});

const EVENT_TYPES = Object.freeze({
  HOLD_CREATED: 'hold.created',
  HOLD_UPDATED: 'hold.updated',
  HOLD_RELEASED: 'hold.released',
  NOTICE_ISSUED: 'notice.issued',
  COLLECTION_EXPORTED: 'collection.exported',
  OVERRIDE_ATTEMPT: 'override.attempt',
  COURT_REPORT_GENERATED: 'court.report.generated',
});

const GENESIS_HASH = '0'.repeat(64);

// ─── small utilities ───────────────────────────────────────────────────

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
      .join(',') +
    '}'
  );
}

function normalizeArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.slice();
  return [value];
}

function toIsoDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function coerceRange(range) {
  if (!range) return null;
  const from = toIsoDate(range.from ?? range.start ?? null);
  const to = toIsoDate(range.to ?? range.end ?? null);
  if (!from && !to) return null;
  return { from, to };
}

function inRange(range, iso) {
  if (!range || !iso) return true; // no range = no constraint
  if (range.from && iso < range.from) return false;
  if (range.to && iso > range.to) return false;
  return true;
}

function keywordMatches(keywords, haystackParts) {
  if (!keywords || keywords.length === 0) return true;
  const hay = haystackParts
    .filter((p) => p != null)
    .map((p) => String(p).toLowerCase())
    .join(' \u0000 ');
  return keywords.some((kw) => hay.includes(String(kw).toLowerCase()));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// ─── class ─────────────────────────────────────────────────────────────

class LegalHoldEnforcer {
  /**
   * @param {Object}  [opts]
   * @param {Function}[opts.now]       clock factory returning a Date
   * @param {Function}[opts.idFactory] custom id generator (testing)
   */
  constructor(opts = {}) {
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();
    this._idFactory =
      typeof opts.idFactory === 'function'
        ? opts.idFactory
        : (() => {
            let n = 0;
            return (prefix) =>
              `${prefix}-${Date.now().toString(36)}-${(++n)
                .toString(36)
                .padStart(4, '0')}`;
          })();
    this._holds = new Map();         // caseId -> holdRecord
    this._events = [];               // append-only with hash chain
    this._listeners = new Map();     // eventName -> Set<handler>
    this._lastHash = GENESIS_HASH;
  }

  // ── event emitter (tiny) ─────────────────────────────────────────────

  on(eventName, handler) {
    if (typeof handler !== 'function') return this;
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);
    return this;
  }

  off(eventName, handler) {
    const set = this._listeners.get(eventName);
    if (set) set.delete(handler);
    return this;
  }

  _emit(eventName, payload) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (_err) {
        /* listener errors must not break the enforcer */
      }
    }
  }

  // ── audit log (append-only, hash chain) ──────────────────────────────

  _appendEvent(type, payload) {
    const seq = this._events.length + 1;
    const timestamp = this._now().toISOString();
    const body = {
      seq,
      type,
      timestamp,
      payload: cloneJson(payload),
    };
    const hashInput = this._lastHash + '|' + stableStringify(body);
    const hash = sha256Hex(hashInput);
    const event = Object.freeze({
      ...body,
      prevHash: this._lastHash,
      hash,
    });
    this._events.push(event);
    this._lastHash = hash;
    this._emit(type, event);
    this._emit('*', event);
    return event;
  }

  auditLog(filter = {}) {
    let out = this._events.slice();
    if (filter.type) out = out.filter((e) => e.type === filter.type);
    if (filter.caseId) {
      out = out.filter(
        (e) => e.payload && e.payload.caseId === filter.caseId
      );
    }
    return out;
  }

  verifyChain() {
    let prev = GENESIS_HASH;
    for (let i = 0; i < this._events.length; i++) {
      const ev = this._events[i];
      if (ev.prevHash !== prev) {
        return { valid: false, brokenAt: ev.seq, reason: 'prevHash mismatch' };
      }
      const body = {
        seq: ev.seq,
        type: ev.type,
        timestamp: ev.timestamp,
        payload: ev.payload,
      };
      const expected = sha256Hex(prev + '|' + stableStringify(body));
      if (expected !== ev.hash) {
        return { valid: false, brokenAt: ev.seq, reason: 'hash mismatch' };
      }
      prev = ev.hash;
    }
    return { valid: true, brokenAt: null };
  }

  // ── hold lifecycle ───────────────────────────────────────────────────

  /**
   * Create a new legal hold.
   *
   * @param {string}   caseId      unique case identifier (e.g. "CASE-2026-017")
   * @param {Object}   scope       scoping rules (see below)
   * @param {string[]} custodians  people/accounts who must preserve data
   * @param {string[]} keywords    trigger keywords for content-match scoping
   * @param {Object}   [opts]      { title, source, court, issuedBy, notes }
   * @returns {Object} frozen holdRecord
   *
   * scope shape (all optional, combined with AND):
   *   {
   *     userIds:    string[],        // custodian user ids
   *     projectIds: string[],        // project ids
   *     recordIds:  string[],        // specific record ids (always match)
   *     types:      string[],        // record types / classes
   *     dateRange:  { from, to },    // ISO range applied to record.createdAt
   *     keywords:   string[],        // optional — scope-local keywords
   *   }
   */
  createHold(caseId, scope, custodians, keywords, opts = {}) {
    if (!caseId || typeof caseId !== 'string') {
      throw new Error('caseId is required (string)');
    }
    if (this._holds.has(caseId)) {
      throw new Error(`legal hold already exists for caseId "${caseId}"`);
    }

    const now = this._now().toISOString();
    const scopeRules = Object.freeze({
      userIds: normalizeArray(scope && scope.userIds),
      projectIds: normalizeArray(scope && scope.projectIds),
      recordIds: normalizeArray(scope && scope.recordIds),
      types: normalizeArray(scope && scope.types),
      dateRange: coerceRange(scope && scope.dateRange),
      keywords: normalizeArray(scope && scope.keywords),
    });

    const allKeywords = Array.from(
      new Set(
        [...normalizeArray(keywords), ...scopeRules.keywords].map((k) =>
          String(k)
        )
      )
    );

    const source = opts.source || HOLD_SOURCES.INTERNAL;
    if (!Object.values(HOLD_SOURCES).includes(source)) {
      throw new Error(`unknown legal hold source "${source}"`);
    }

    const hold = {
      caseId,
      status: HOLD_STATUS.ACTIVE,
      title: opts.title || caseId,
      titleHe: opts.titleHe || opts.title || caseId,
      source,
      court: opts.court || null,          // e.g. "בית משפט השלום ת"א"
      issuedBy: opts.issuedBy || null,    // judge / legal counsel
      notes: opts.notes || '',
      createdAt: now,
      createdBy: opts.createdBy || 'system',
      releasedAt: null,
      releasedBy: null,
      releaseJustification: null,
      custodians: normalizeArray(custodians).map((c) => String(c)),
      keywords: allKeywords,
      scopeRules,
      // holds always override retention expiry:
      overridesRetention: true,
      historyIds: [],
    };

    this._holds.set(caseId, hold);
    const event = this._appendEvent(EVENT_TYPES.HOLD_CREATED, {
      caseId,
      title: hold.title,
      titleHe: hold.titleHe,
      source: hold.source,
      custodians: hold.custodians,
      keywords: hold.keywords,
      scopeRules: hold.scopeRules,
      createdBy: hold.createdBy,
    });
    hold.historyIds.push(event.seq);
    return this._snapshot(hold);
  }

  /**
   * Release a legal hold. NEVER hard-deletes the row.
   */
  releaseHold(caseId, justification, approver) {
    const hold = this._holds.get(caseId);
    if (!hold) throw new Error(`no legal hold for caseId "${caseId}"`);
    if (hold.status === HOLD_STATUS.RELEASED) {
      throw new Error(`legal hold "${caseId}" already released`);
    }
    if (!justification || !String(justification).trim()) {
      throw new Error('justification is required to release a legal hold');
    }
    if (!approver || !String(approver).trim()) {
      throw new Error('approver is required to release a legal hold');
    }

    const now = this._now().toISOString();
    hold.status = HOLD_STATUS.RELEASED;
    hold.releasedAt = now;
    hold.releasedBy = String(approver);
    hold.releaseJustification = String(justification);

    const event = this._appendEvent(EVENT_TYPES.HOLD_RELEASED, {
      caseId,
      releasedAt: now,
      releasedBy: hold.releasedBy,
      justification: hold.releaseJustification,
    });
    hold.historyIds.push(event.seq);
    return this._snapshot(hold);
  }

  listHolds(filter = {}) {
    let out = Array.from(this._holds.values());
    if (filter.status) out = out.filter((h) => h.status === filter.status);
    if (filter.source) out = out.filter((h) => h.source === filter.source);
    if (filter.custodian) {
      out = out.filter((h) => h.custodians.includes(filter.custodian));
    }
    if (filter.activeOnly) {
      out = out.filter((h) => h.status === HOLD_STATUS.ACTIVE);
    }
    return out.map((h) => this._snapshot(h));
  }

  // ── lock matching ────────────────────────────────────────────────────

  /**
   * Does an ACTIVE hold apply to this record?
   *
   * `context` may include record metadata so scope rules can be checked:
   *   { userId, custodianId, projectId, type, createdAt, content,
   *     subject, tags, retentionExpired }
   *
   * When the record is under hold, retention expiry is ignored (holds
   * override retention expiry by design).
   */
  isLocked(recordId, context = {}) {
    return this.matchingHolds(recordId, context).length > 0;
  }

  matchingHolds(recordId, context = {}) {
    if (recordId == null) return [];
    const recId = String(recordId);
    const out = [];
    for (const hold of this._holds.values()) {
      if (hold.status !== HOLD_STATUS.ACTIVE) continue;
      if (this._scopeMatches(hold, recId, context)) {
        out.push(this._snapshot(hold));
      }
    }
    return out;
  }

  _scopeMatches(hold, recordId, context) {
    const rules = hold.scopeRules;

    // explicit record ids: highest precedence — if ANY recordIds are
    // listed, they form a whitelist UNLESS other structural filters are
    // present (in which case recordIds acts as an additive fast path).
    const hasStructural =
      rules.userIds.length > 0 ||
      rules.projectIds.length > 0 ||
      rules.types.length > 0 ||
      rules.dateRange != null ||
      hold.custodians.length > 0 ||
      hold.keywords.length > 0;

    if (rules.recordIds.length > 0) {
      if (rules.recordIds.includes(recordId)) return true;
      if (!hasStructural) return false; // id-only hold: record not listed
      // else fall through to structural checks (additive scope)
    }

    if (!hasStructural && rules.recordIds.length === 0) {
      // empty-scope hold = catch-all (rare, but supported for mass holds)
      return true;
    }

    // user/custodian match
    const contextUser = context.userId || context.custodianId || null;
    if (rules.userIds.length > 0) {
      if (!contextUser || !rules.userIds.includes(String(contextUser))) {
        return false;
      }
    } else if (hold.custodians.length > 0) {
      // if no explicit userIds filter, fall back to custodian list
      if (!contextUser || !hold.custodians.includes(String(contextUser))) {
        // custodians are informational if other filters match — but if
        // they are the ONLY structural filter, require a match
        const onlyCustodianFilter =
          rules.projectIds.length === 0 &&
          rules.types.length === 0 &&
          rules.dateRange == null &&
          hold.keywords.length === 0;
        if (onlyCustodianFilter) return false;
      }
    }

    // project match
    if (rules.projectIds.length > 0) {
      if (
        !context.projectId ||
        !rules.projectIds.includes(String(context.projectId))
      ) {
        return false;
      }
    }

    // type match
    if (rules.types.length > 0) {
      if (!context.type || !rules.types.includes(String(context.type))) {
        return false;
      }
    }

    // date-range match (against createdAt)
    if (rules.dateRange) {
      const iso = toIsoDate(context.createdAt);
      if (!iso) return false;
      if (!inRange(rules.dateRange, iso)) return false;
    }

    // keyword match (against subject/content/tags)
    if (hold.keywords.length > 0) {
      const ok = keywordMatches(hold.keywords, [
        context.subject,
        context.content,
        context.title,
        ...(Array.isArray(context.tags) ? context.tags : []),
      ]);
      if (!ok) return false;
    }

    return true;
  }

  // ── custodian notice (bilingual letter) ──────────────────────────────

  custodianNotice(caseId, custodianId) {
    const hold = this._holds.get(caseId);
    if (!hold) throw new Error(`no legal hold for caseId "${caseId}"`);

    const now = this._now().toISOString();
    const kwList = hold.keywords.length ? hold.keywords.join(', ') : '—';
    const scopeLines = [
      `• Users / Custodians: ${hold.custodians.join(', ') || '—'}`,
      `• Projects: ${hold.scopeRules.projectIds.join(', ') || '—'}`,
      `• Record types: ${hold.scopeRules.types.join(', ') || '—'}`,
      `• Date range: ${
        hold.scopeRules.dateRange
          ? `${hold.scopeRules.dateRange.from || '…'} → ${
              hold.scopeRules.dateRange.to || '…'
            }`
          : '—'
      }`,
      `• Keywords: ${kwList}`,
    ];
    const scopeLinesHe = [
      `• משתמשים / אוצרי ראיות: ${hold.custodians.join(', ') || '—'}`,
      `• פרויקטים: ${hold.scopeRules.projectIds.join(', ') || '—'}`,
      `• סוגי רשומות: ${hold.scopeRules.types.join(', ') || '—'}`,
      `• טווח תאריכים: ${
        hold.scopeRules.dateRange
          ? `${hold.scopeRules.dateRange.from || '…'} → ${
              hold.scopeRules.dateRange.to || '…'
            }`
          : '—'
      }`,
      `• מילות מפתח: ${kwList}`,
    ];

    const heading =
      hold.source === HOLD_SOURCES.STAY_ORDER
        ? 'Legal Hold Notice — Stay Order (צו עיכוב)'
        : hold.source === HOLD_SOURCES.SEARCH_WARRANT
        ? 'Legal Hold Notice — Search Warrant (צו חיפוש)'
        : 'Legal Hold Notice';
    const headingHe =
      hold.source === HOLD_SOURCES.STAY_ORDER
        ? 'הודעת עיכוב משפטי — צו עיכוב'
        : hold.source === HOLD_SOURCES.SEARCH_WARRANT
        ? 'הודעת עיכוב משפטי — צו חיפוש'
        : 'הודעת עיכוב משפטי';

    const english = [
      heading,
      `Case: ${hold.title} (${hold.caseId})`,
      `Issued: ${now}`,
      `To: ${custodianId}`,
      '',
      'You are hereby instructed to preserve, intact and unaltered, all',
      'records — electronic or otherwise — that fall within the scope',
      'below. You must NOT delete, modify, overwrite, or otherwise',
      'tamper with any such record until this hold is formally released.',
      '',
      'Scope:',
      ...scopeLines,
      '',
      'Violation of this notice may expose you to civil and criminal',
      'liability under Israeli law, including obstruction of justice.',
      '',
      `Court / Issuer: ${hold.court || hold.issuedBy || '—'}`,
    ].join('\n');

    const hebrew = [
      headingHe,
      `תיק: ${hold.titleHe} (${hold.caseId})`,
      `הונפק: ${now}`,
      `אל: ${custodianId}`,
      '',
      'הנך מתבקש/ת בזאת לשמר, ללא שינוי ופגיעה, את כל הרשומות —',
      'אלקטרוניות ואחרות — הנכללות בהיקף המפורט להלן. חל איסור',
      'מוחלט למחוק, לשנות, לדרוס או לפגוע בכל דרך ברשומות הללו',
      'עד לשחרור רשמי של העיכוב.',
      '',
      'היקף:',
      ...scopeLinesHe,
      '',
      'הפרת הוראה זו עלולה לחשוף אותך לאחריות אזרחית ופלילית',
      'לפי הדין הישראלי, לרבות שיבוש הליכי משפט.',
      '',
      `בית משפט / מנפיק: ${hold.court || hold.issuedBy || '—'}`,
    ].join('\n');

    const notice = {
      caseId: hold.caseId,
      custodianId: String(custodianId),
      issuedAt: now,
      source: hold.source,
      languages: ['he', 'en'],
      direction: { he: 'rtl', en: 'ltr' },
      hebrew,
      english,
      combined: `${hebrew}\n\n—————————————————————————\n\n${english}`,
    };

    const event = this._appendEvent(EVENT_TYPES.NOTICE_ISSUED, {
      caseId,
      custodianId: notice.custodianId,
      issuedAt: now,
      sha256: sha256Hex(notice.combined),
    });
    hold.historyIds.push(event.seq);
    return notice;
  }

  // ── collection export (manifest + SHA256) ────────────────────────────

  collectionExport(caseId, records) {
    const hold = this._holds.get(caseId);
    if (!hold) throw new Error(`no legal hold for caseId "${caseId}"`);
    const recs = Array.isArray(records) ? records : [];

    const items = recs.map((r) => {
      const payload = stableStringify(r);
      return {
        recordId: String(r && (r.id ?? r.recordId ?? '')),
        type: (r && r.type) || null,
        createdAt: toIsoDate(r && r.createdAt),
        size: Buffer.byteLength(payload, 'utf8'),
        sha256: sha256Hex(payload),
      };
    });

    const manifestBody = {
      caseId: hold.caseId,
      title: hold.title,
      titleHe: hold.titleHe,
      exportedAt: this._now().toISOString(),
      itemCount: items.length,
      items,
    };
    const manifestJson = stableStringify(manifestBody);
    const manifest = {
      ...manifestBody,
      sha256: sha256Hex(manifestJson),
    };

    const event = this._appendEvent(EVENT_TYPES.COLLECTION_EXPORTED, {
      caseId,
      itemCount: items.length,
      manifestSha256: manifest.sha256,
    });
    hold.historyIds.push(event.seq);
    return manifest;
  }

  // ── override alert ───────────────────────────────────────────────────

  /**
   * Log an attempted modification of a held record. Returns the alert
   * object and appends it to the audit log. Callers should throw/block
   * the underlying action themselves — this function only records.
   */
  overrideAlert(recordId, actor, action, context = {}) {
    const holds = this.matchingHolds(recordId, context);
    const matchingCaseIds = holds.map((h) => h.caseId);
    const alert = {
      recordId: String(recordId),
      actor: String(actor || 'unknown'),
      action: String(action || 'modify'),
      blocked: holds.length > 0,
      matchingCaseIds,
      attemptedAt: this._now().toISOString(),
      context: cloneJson(context),
    };
    // Emit one audit event per matching hold so reportForCourt (which
    // filters by payload.caseId) can correctly count blocked attempts.
    if (matchingCaseIds.length > 0) {
      for (const caseId of matchingCaseIds) {
        this._appendEvent(EVENT_TYPES.OVERRIDE_ATTEMPT, {
          ...alert,
          caseId,
        });
      }
    } else {
      this._appendEvent(EVENT_TYPES.OVERRIDE_ATTEMPT, alert);
    }
    return alert;
  }

  // ── court report ─────────────────────────────────────────────────────

  reportForCourt(caseId, opts = {}) {
    const hold = this._holds.get(caseId);
    if (!hold) throw new Error(`no legal hold for caseId "${caseId}"`);

    const events = this._events.filter(
      (e) => e.payload && e.payload.caseId === caseId
    );
    const overrides = events.filter(
      (e) => e.type === EVENT_TYPES.OVERRIDE_ATTEMPT
    );
    const notices = events.filter(
      (e) => e.type === EVENT_TYPES.NOTICE_ISSUED
    );
    const exports_ = events.filter(
      (e) => e.type === EVENT_TYPES.COLLECTION_EXPORTED
    );

    const now = this._now().toISOString();
    const heading =
      'Legal Hold Report for the Court / דו"ח עיכוב משפטי לבית המשפט';

    // Hebrew (Israeli court format, RTL)
    const hebrewLines = [
      `דו"ח עיכוב משפטי — תיק ${hold.caseId}`,
      `בית משפט: ${hold.court || '—'}`,
      `מנפיק: ${hold.issuedBy || '—'}`,
      `מקור: ${hold.source}`,
      `סטטוס: ${hold.status === HOLD_STATUS.ACTIVE ? 'פעיל' : 'שוחרר'}`,
      `נוצר: ${hold.createdAt}`,
      hold.releasedAt ? `שוחרר: ${hold.releasedAt}` : null,
      hold.releasedBy ? `מאשר שחרור: ${hold.releasedBy}` : null,
      hold.releaseJustification
        ? `נימוק שחרור: ${hold.releaseJustification}`
        : null,
      '',
      'אוצרי ראיות:',
      ...(hold.custodians.length
        ? hold.custodians.map((c) => `  - ${c}`)
        : ['  —']),
      '',
      'היקף:',
      `  • משתמשים: ${hold.scopeRules.userIds.join(', ') || '—'}`,
      `  • פרויקטים: ${hold.scopeRules.projectIds.join(', ') || '—'}`,
      `  • סוגי רשומות: ${hold.scopeRules.types.join(', ') || '—'}`,
      `  • טווח תאריכים: ${
        hold.scopeRules.dateRange
          ? `${hold.scopeRules.dateRange.from || '…'} — ${
              hold.scopeRules.dateRange.to || '…'
            }`
          : '—'
      }`,
      `  • מילות מפתח: ${hold.keywords.join(', ') || '—'}`,
      '',
      `סך הודעות לאוצרי ראיות: ${notices.length}`,
      `סך חבילות איסוף: ${exports_.length}`,
      `סך ניסיונות מחיקה/שינוי חסומים: ${overrides.length}`,
      '',
      'שרשרת ראיות (Chain of custody):',
      ...events.map(
        (e) => `  [${e.seq}] ${e.timestamp} — ${e.type} — ${e.hash.slice(0, 16)}…`
      ),
      '',
      `הופק: ${now}`,
      `שלמות שרשרת: ${this.verifyChain().valid ? 'תקינה' : 'פגומה'}`,
    ].filter((l) => l != null);

    // English mirror
    const englishLines = [
      `Legal Hold Report — Case ${hold.caseId}`,
      `Court: ${hold.court || '—'}`,
      `Issuer: ${hold.issuedBy || '—'}`,
      `Source: ${hold.source}`,
      `Status: ${hold.status}`,
      `Created: ${hold.createdAt}`,
      hold.releasedAt ? `Released: ${hold.releasedAt}` : null,
      hold.releasedBy ? `Released by: ${hold.releasedBy}` : null,
      hold.releaseJustification
        ? `Release justification: ${hold.releaseJustification}`
        : null,
      '',
      'Custodians:',
      ...(hold.custodians.length
        ? hold.custodians.map((c) => `  - ${c}`)
        : ['  —']),
      '',
      'Scope:',
      `  • Users: ${hold.scopeRules.userIds.join(', ') || '—'}`,
      `  • Projects: ${hold.scopeRules.projectIds.join(', ') || '—'}`,
      `  • Record types: ${hold.scopeRules.types.join(', ') || '—'}`,
      `  • Date range: ${
        hold.scopeRules.dateRange
          ? `${hold.scopeRules.dateRange.from || '…'} — ${
              hold.scopeRules.dateRange.to || '…'
            }`
          : '—'
      }`,
      `  • Keywords: ${hold.keywords.join(', ') || '—'}`,
      '',
      `Custodian notices issued: ${notices.length}`,
      `Collection exports: ${exports_.length}`,
      `Blocked delete/modify attempts: ${overrides.length}`,
      '',
      'Chain of custody:',
      ...events.map(
        (e) =>
          `  [${e.seq}] ${e.timestamp} — ${e.type} — ${e.hash.slice(0, 16)}…`
      ),
      '',
      `Generated at: ${now}`,
      `Chain integrity: ${this.verifyChain().valid ? 'valid' : 'broken'}`,
    ].filter((l) => l != null);

    const hebrew = hebrewLines.join('\n');
    const english = englishLines.join('\n');

    const report = {
      caseId: hold.caseId,
      generatedAt: now,
      heading,
      languages: ['he', 'en'],
      direction: { he: 'rtl', en: 'ltr' },
      summary: {
        status: hold.status,
        custodianCount: hold.custodians.length,
        noticesIssued: notices.length,
        collectionExports: exports_.length,
        blockedAttempts: overrides.length,
        chainIntegrity: this.verifyChain().valid,
      },
      hebrew,
      english,
      combined: `${hebrew}\n\n—————————————————————————\n\n${english}`,
      sha256: sha256Hex(hebrew + '\n---\n' + english),
      events: events.map((e) => ({
        seq: e.seq,
        type: e.type,
        timestamp: e.timestamp,
        hash: e.hash,
      })),
    };

    this._appendEvent(EVENT_TYPES.COURT_REPORT_GENERATED, {
      caseId,
      generatedAt: now,
      sha256: report.sha256,
      chainValid: report.summary.chainIntegrity,
    });

    return report;
  }

  // ── internal ─────────────────────────────────────────────────────────

  _snapshot(hold) {
    return Object.freeze({
      caseId: hold.caseId,
      status: hold.status,
      title: hold.title,
      titleHe: hold.titleHe,
      source: hold.source,
      court: hold.court,
      issuedBy: hold.issuedBy,
      notes: hold.notes,
      createdAt: hold.createdAt,
      createdBy: hold.createdBy,
      releasedAt: hold.releasedAt,
      releasedBy: hold.releasedBy,
      releaseJustification: hold.releaseJustification,
      custodians: hold.custodians.slice(),
      keywords: hold.keywords.slice(),
      scopeRules: {
        userIds: hold.scopeRules.userIds.slice(),
        projectIds: hold.scopeRules.projectIds.slice(),
        recordIds: hold.scopeRules.recordIds.slice(),
        types: hold.scopeRules.types.slice(),
        dateRange: hold.scopeRules.dateRange
          ? { ...hold.scopeRules.dateRange }
          : null,
        keywords: hold.scopeRules.keywords.slice(),
      },
      overridesRetention: hold.overridesRetention,
      historyIds: hold.historyIds.slice(),
    });
  }
}

module.exports = {
  LegalHoldEnforcer,
  HOLD_STATUS,
  HOLD_SOURCES,
  EVENT_TYPES,
};
