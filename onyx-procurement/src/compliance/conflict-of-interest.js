/**
 * Conflict of Interest — הצהרת ניגוד עניינים ומעקב
 * Agent Y-144 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Mission:
 *   Declare, track, approve and escalate conflicts of interest (COI) for
 *   every employee of the group. Adapted from the published guidance of
 *   רשות החברות הממשלתיות (the Israeli Government Companies Authority)
 *   for private-sector governance — annual attestations, material-change
 *   disclosures, cross-checks against procurement and HR, plus a board-
 *   level anonymised roll-up.
 *
 * Design principles:
 *   - "לא מוחקים רק משדרגים ומגדלים" — every declaration, attestation,
 *     mitigation plan and closure is append-only. Closure flips status
 *     to `closed` and stamps a closureReason — the original record is
 *     preserved forever.
 *   - Zero external dependencies. `node:crypto` only (built-in).
 *   - Bilingual Hebrew (RTL) + English surfaces for every public artefact.
 *   - Append-only audit log with a SHA-256 hash chain — the same pattern
 *     used by Y-149 (retention) and Y-150 (legal hold) for consistency.
 *
 * Public API (class ConflictOfInterest):
 *   .declareInterest({employeeId, type, description, relatedParty,
 *                     amount?, percentage?, startDate, ongoing})
 *   .annualAttestation({employeeId, confirmed, signature, date})
 *   .listOpenDeclarations({employeeId})
 *   .checkDecision({decisionId, decisionMaker, relatedParties})
 *   .recuseFrom({decisionId, employeeId, reason})
 *   .approvalChain({declarationId, approvers: [supervisor, compliance, ceo?]})
 *   .mitigationPlan({declarationId, plan, approver})
 *   .materialChange({declarationId, newDetails})
 *   .listByDepartment(department)
 *   .boardReporting(period)
 *   .crossCheckWithProcurement(vendorId)
 *   .crossCheckWithHR(candidateId)
 *   .closure({declarationId, reason, date})
 *
 * Integration contract (loose):
 *   Use setEmployeeDirectory() / setVendorDirectory() / setCandidateDirectory()
 *   to plug ERP-side lookup tables. The module itself never imports other
 *   subsystems — it is a pure, in-memory engine that runs on Node built-ins.
 *
 * Run tests:
 *   node --test onyx-procurement/test/compliance/conflict-of-interest.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// Constants (bilingual, frozen)
// ═══════════════════════════════════════════════════════════════

/**
 * Eight interest types covered by the engine. Matches the taxonomy used
 * by רשות החברות הממשלתיות (adapted for private sector).
 */
const INTEREST_TYPE = Object.freeze({
  FINANCIAL: 'financial',
  FAMILIAL: 'familial',
  EMPLOYMENT: 'employment',
  OWNERSHIP: 'ownership',
  DIRECTORSHIP: 'directorship',
  CONSULTING: 'consulting',
  POLITICAL: 'political',
  PERSONAL_RELATIONSHIP: 'personal-relationship',
});

const INTEREST_TYPE_HE = Object.freeze({
  [INTEREST_TYPE.FINANCIAL]: 'כספי',
  [INTEREST_TYPE.FAMILIAL]: 'קרבת משפחה',
  [INTEREST_TYPE.EMPLOYMENT]: 'העסקה',
  [INTEREST_TYPE.OWNERSHIP]: 'בעלות',
  [INTEREST_TYPE.DIRECTORSHIP]: 'דירקטוריון',
  [INTEREST_TYPE.CONSULTING]: 'ייעוץ',
  [INTEREST_TYPE.POLITICAL]: 'פוליטי',
  [INTEREST_TYPE.PERSONAL_RELATIONSHIP]: 'קשר אישי',
});

const INTEREST_TYPE_EN = Object.freeze({
  [INTEREST_TYPE.FINANCIAL]: 'Financial interest',
  [INTEREST_TYPE.FAMILIAL]: 'Familial relationship',
  [INTEREST_TYPE.EMPLOYMENT]: 'Outside employment',
  [INTEREST_TYPE.OWNERSHIP]: 'Ownership stake',
  [INTEREST_TYPE.DIRECTORSHIP]: 'Directorship / board seat',
  [INTEREST_TYPE.CONSULTING]: 'Consulting / advisory',
  [INTEREST_TYPE.POLITICAL]: 'Political activity',
  [INTEREST_TYPE.PERSONAL_RELATIONSHIP]: 'Personal relationship',
});

/** Declaration lifecycle. Note: no DELETED state exists by design. */
const DECLARATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  MITIGATED: 'mitigated',
  CLOSED: 'closed',
});

const DECLARATION_STATUS_HE = Object.freeze({
  [DECLARATION_STATUS.DRAFT]: 'טיוטה',
  [DECLARATION_STATUS.PENDING_APPROVAL]: 'ממתין לאישור',
  [DECLARATION_STATUS.APPROVED]: 'אושר',
  [DECLARATION_STATUS.MITIGATED]: 'בהסדרה',
  [DECLARATION_STATUS.CLOSED]: 'סגור',
});

/** Severity classes drive the approval-chain escalation ladder. */
const SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const SEVERITY_HE = Object.freeze({
  [SEVERITY.LOW]: 'נמוך',
  [SEVERITY.MEDIUM]: 'בינוני',
  [SEVERITY.HIGH]: 'גבוה',
  [SEVERITY.CRITICAL]: 'קריטי',
});

/** Mitigation options allowed by the engine. */
const MITIGATION = Object.freeze({
  RECUSAL: 'recusal',
  DIVESTMENT: 'divestment',
  SUPERVISION: 'supervision',
  REASSIGNMENT: 'reassignment',
  CHINESE_WALL: 'chinese_wall',
  DISCLOSURE_ONLY: 'disclosure_only',
});

const MITIGATION_HE_CANONICAL = Object.freeze({
  [MITIGATION.RECUSAL]: 'הימנעות מהשתתפות',
  [MITIGATION.DIVESTMENT]: 'מימוש החזקות',
  [MITIGATION.SUPERVISION]: 'פיקוח מוגבר',
  [MITIGATION.REASSIGNMENT]: 'שינוי תפקיד',
  [MITIGATION.CHINESE_WALL]: 'מחיצת סינית',
  [MITIGATION.DISCLOSURE_ONLY]: 'גילוי בלבד',
});

/** Audit event types (append-only hash chain). */
const EVENT_TYPES = Object.freeze({
  DECLARATION_CREATED: 'declaration.created',
  DECLARATION_MATERIAL_CHANGE: 'declaration.material_change',
  DECLARATION_APPROVED: 'declaration.approved',
  DECLARATION_ESCALATED: 'declaration.escalated',
  DECLARATION_MITIGATED: 'declaration.mitigated',
  DECLARATION_CLOSED: 'declaration.closed',
  ATTESTATION_RECORDED: 'attestation.recorded',
  DECISION_CHECKED: 'decision.checked',
  DECISION_WARNED: 'decision.warned',
  RECUSAL_RECORDED: 'recusal.recorded',
  PROCUREMENT_CROSSCHECK: 'procurement.crosscheck',
  HR_CROSSCHECK: 'hr.crosscheck',
  BOARD_REPORT_GENERATED: 'board.report.generated',
});

const GENESIS_HASH = '0'.repeat(64);

// ═══════════════════════════════════════════════════════════════
// Utilities — local, pure, no dependencies
// ═══════════════════════════════════════════════════════════════

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

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toIsoDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normString(v, fallback = '') {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function normNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.slice();
  return [v];
}

function asYear(date) {
  const iso = toIsoDate(date);
  if (!iso) return null;
  return Number(iso.slice(0, 4));
}

function periodStartEnd(period) {
  // Accepts:
  //  - { year: 2026 }
  //  - { year: 2026, quarter: 1..4 }
  //  - { from, to }
  if (!period) return { from: null, to: null, label: 'all' };
  if (period.from || period.to) {
    return {
      from: toIsoDate(period.from),
      to: toIsoDate(period.to),
      label: `${period.from || '...'} → ${period.to || '...'}`,
    };
  }
  const year = Number(period.year);
  if (!Number.isFinite(year)) return { from: null, to: null, label: 'all' };
  if (period.quarter) {
    const q = Math.max(1, Math.min(4, Number(period.quarter) || 1));
    const startMonth = (q - 1) * 3;
    const from = new Date(Date.UTC(year, startMonth, 1)).toISOString();
    const to = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59)).toISOString();
    return { from, to, label: `${year} Q${q}` };
  }
  const from = new Date(Date.UTC(year, 0, 1)).toISOString();
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
  return { from, to, label: String(year) };
}

// ═══════════════════════════════════════════════════════════════
// Severity classifier
// ═══════════════════════════════════════════════════════════════

/**
 * Compute severity from the declaration payload.
 *
 * The heuristic mirrors the Government Companies Authority ladder:
 *   CRITICAL — ownership ≥ 25% or directorship or employment at counterparty.
 *   HIGH     — ownership 5-25% OR consulting OR amount ≥ 100k NIS.
 *   MEDIUM   — familial OR ownership < 5% OR amount ≥ 10k NIS.
 *   LOW      — everything else (political, personal-relationship, disclosure).
 */
function classifySeverity({ type, amount, percentage }) {
  const pct = normNumber(percentage);
  const amt = normNumber(amount);

  if (type === INTEREST_TYPE.DIRECTORSHIP) return SEVERITY.CRITICAL;
  if (type === INTEREST_TYPE.EMPLOYMENT) return SEVERITY.CRITICAL;
  if (type === INTEREST_TYPE.OWNERSHIP) {
    if (pct != null && pct >= 25) return SEVERITY.CRITICAL;
    if (pct != null && pct >= 5) return SEVERITY.HIGH;
    return SEVERITY.MEDIUM;
  }
  if (type === INTEREST_TYPE.CONSULTING) return SEVERITY.HIGH;
  if (type === INTEREST_TYPE.FINANCIAL) {
    if (amt != null && amt >= 100000) return SEVERITY.HIGH;
    if (amt != null && amt >= 10000) return SEVERITY.MEDIUM;
    return SEVERITY.LOW;
  }
  if (type === INTEREST_TYPE.FAMILIAL) return SEVERITY.MEDIUM;
  if (type === INTEREST_TYPE.POLITICAL) return SEVERITY.LOW;
  if (type === INTEREST_TYPE.PERSONAL_RELATIONSHIP) return SEVERITY.LOW;
  return SEVERITY.LOW;
}

/**
 * Required approver chain for a given severity.
 *
 *   LOW       -> [ supervisor ]
 *   MEDIUM    -> [ supervisor, compliance ]
 *   HIGH      -> [ supervisor, compliance, ceo ]
 *   CRITICAL  -> [ supervisor, compliance, ceo, board ]
 */
function requiredApproversFor(severity) {
  switch (severity) {
    case SEVERITY.CRITICAL:
      return ['supervisor', 'compliance', 'ceo', 'board'];
    case SEVERITY.HIGH:
      return ['supervisor', 'compliance', 'ceo'];
    case SEVERITY.MEDIUM:
      return ['supervisor', 'compliance'];
    case SEVERITY.LOW:
    default:
      return ['supervisor'];
  }
}

// ═══════════════════════════════════════════════════════════════
// Main class — ConflictOfInterest
// ═══════════════════════════════════════════════════════════════

class ConflictOfInterest {
  /**
   * @param {Object}  [opts]
   * @param {Function}[opts.now]       clock factory returning a Date
   * @param {Function}[opts.idFactory] custom id generator (testing)
   */
  constructor(opts = {}) {
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();
    let counter = 0;
    this._idFactory =
      typeof opts.idFactory === 'function'
        ? opts.idFactory
        : (prefix) => {
            counter += 1;
            return `${prefix}-${counter.toString().padStart(6, '0')}`;
          };

    /** @type {Map<string, object>} declarations keyed by id */
    this._declarations = new Map();
    /** @type {object[]} attestations (append-only) */
    this._attestations = [];
    /** @type {object[]} recusals (append-only) */
    this._recusals = [];
    /** @type {object[]} audit events (append-only, hash chained) */
    this._events = [];
    /** @type {Map<string, Set<Function>>} event listeners */
    this._listeners = new Map();
    this._lastHash = GENESIS_HASH;

    /** Plug-in directories (loose coupling). */
    this._employeeDirectory = new Map(); // employeeId -> { department, name, ... }
    this._vendorDirectory = new Map();   // vendorId   -> { name, ... }
    this._candidateDirectory = new Map(); // candidateId -> { name, ... }
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

  _emit(eventName, event) {
    const set = this._listeners.get(eventName);
    if (set) {
      for (const handler of set) {
        try { handler(event); } catch (_e) { /* never break engine */ }
      }
    }
    const star = this._listeners.get('*');
    if (star) {
      for (const handler of star) {
        try { handler(event); } catch (_e) { /* swallow */ }
      }
    }
  }

  // ── audit log (append-only hash chain) ──────────────────────────────

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
    return event;
  }

  auditLog(filter = {}) {
    let out = this._events.slice();
    if (filter.type) out = out.filter((e) => e.type === filter.type);
    if (filter.declarationId) {
      out = out.filter(
        (e) => e.payload && e.payload.declarationId === filter.declarationId
      );
    }
    if (filter.employeeId) {
      out = out.filter(
        (e) => e.payload && e.payload.employeeId === filter.employeeId
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

  // ── directories (loose coupling) ─────────────────────────────────────

  setEmployeeDirectory(map) {
    this._employeeDirectory = this._coerceDirectory(map);
    return this;
  }

  setVendorDirectory(map) {
    this._vendorDirectory = this._coerceDirectory(map);
    return this;
  }

  setCandidateDirectory(map) {
    this._candidateDirectory = this._coerceDirectory(map);
    return this;
  }

  _coerceDirectory(map) {
    if (map instanceof Map) return new Map(map);
    if (!map || typeof map !== 'object') return new Map();
    const m = new Map();
    for (const key of Object.keys(map)) m.set(String(key), map[key]);
    return m;
  }

  // ═════════════════════════════════════════════════════════════════
  //              PUBLIC API — declarations lifecycle
  // ═════════════════════════════════════════════════════════════════

  /**
   * Declare a new interest. Returns a frozen snapshot of the declaration.
   *
   * Required: employeeId, type, description, relatedParty, startDate
   * Optional: amount, percentage, ongoing (defaults to true)
   */
  declareInterest({
    employeeId,
    type,
    description,
    relatedParty,
    amount,
    percentage,
    startDate,
    ongoing,
  } = {}) {
    const empId = normString(employeeId);
    if (!empId) throw new Error('employeeId is required');
    if (!type || !Object.values(INTEREST_TYPE).includes(type)) {
      throw new Error(`unknown interest type "${type}"`);
    }
    const desc = normString(description);
    if (!desc) throw new Error('description is required');
    const party = normString(relatedParty);
    if (!party) throw new Error('relatedParty is required');
    const startIso = toIsoDate(startDate);
    if (!startIso) throw new Error('startDate is required (ISO date)');

    const amt = normNumber(amount);
    const pct = normNumber(percentage);
    const severity = classifySeverity({ type, amount: amt, percentage: pct });

    const id = this._idFactory('COI');
    const nowIso = this._now().toISOString();
    const declaration = {
      id,
      employeeId: empId,
      type,
      typeHe: INTEREST_TYPE_HE[type],
      typeEn: INTEREST_TYPE_EN[type],
      description: desc,
      relatedParty: party,
      amount: amt,
      percentage: pct,
      startDate: startIso,
      ongoing: ongoing !== false,
      status: DECLARATION_STATUS.PENDING_APPROVAL,
      statusHe: DECLARATION_STATUS_HE[DECLARATION_STATUS.PENDING_APPROVAL],
      severity,
      severityHe: SEVERITY_HE[severity],
      requiredApprovers: requiredApproversFor(severity),
      approvals: [],           // append-only approval chain
      mitigations: [],         // append-only mitigation plan log
      materialChanges: [],     // append-only material change log
      recusalDecisionIds: [],  // references to _recusals entries
      closure: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this._declarations.set(id, declaration);

    this._appendEvent(EVENT_TYPES.DECLARATION_CREATED, {
      declarationId: id,
      employeeId: empId,
      type,
      severity,
      relatedParty: party,
      ongoing: declaration.ongoing,
    });

    return this._snapshot(declaration);
  }

  /**
   * Record a material change to an existing declaration. Append-only —
   * the previous details are preserved in the materialChanges log.
   */
  materialChange({ declarationId, newDetails } = {}) {
    const decl = this._mustGet(declarationId);
    if (decl.status === DECLARATION_STATUS.CLOSED) {
      throw new Error(`declaration "${declarationId}" is closed — cannot accept material change`);
    }
    if (!newDetails || typeof newDetails !== 'object') {
      throw new Error('newDetails object is required');
    }

    const previous = {
      amount: decl.amount,
      percentage: decl.percentage,
      description: decl.description,
      relatedParty: decl.relatedParty,
      ongoing: decl.ongoing,
    };

    if (newDetails.description != null) {
      decl.description = normString(newDetails.description, decl.description);
    }
    if (newDetails.relatedParty != null) {
      decl.relatedParty = normString(newDetails.relatedParty, decl.relatedParty);
    }
    if ('amount' in newDetails) {
      decl.amount = normNumber(newDetails.amount);
    }
    if ('percentage' in newDetails) {
      decl.percentage = normNumber(newDetails.percentage);
    }
    if ('ongoing' in newDetails) {
      decl.ongoing = !!newDetails.ongoing;
    }

    // Severity may escalate; requiredApprovers must grow accordingly.
    const newSeverity = classifySeverity({
      type: decl.type,
      amount: decl.amount,
      percentage: decl.percentage,
    });
    const prevSeverity = decl.severity;
    if (newSeverity !== decl.severity) {
      decl.severity = newSeverity;
      decl.severityHe = SEVERITY_HE[newSeverity];
      decl.requiredApprovers = requiredApproversFor(newSeverity);
      // Upgrading severity re-opens the approval requirement.
      if (decl.status === DECLARATION_STATUS.APPROVED) {
        decl.status = DECLARATION_STATUS.PENDING_APPROVAL;
        decl.statusHe = DECLARATION_STATUS_HE[DECLARATION_STATUS.PENDING_APPROVAL];
      }
    }

    decl.materialChanges.push({
      at: this._now().toISOString(),
      previous,
      newDetails: cloneJson(newDetails),
      severityBefore: prevSeverity,
      severityAfter: newSeverity,
    });
    decl.updatedAt = this._now().toISOString();

    this._appendEvent(EVENT_TYPES.DECLARATION_MATERIAL_CHANGE, {
      declarationId: decl.id,
      employeeId: decl.employeeId,
      severityBefore: prevSeverity,
      severityAfter: newSeverity,
    });

    return this._snapshot(decl);
  }

  /**
   * Annual attestation — one row per (employeeId, year). Append-only.
   *
   * Returns the stored attestation record.
   */
  annualAttestation({ employeeId, confirmed, signature, date } = {}) {
    const empId = normString(employeeId);
    if (!empId) throw new Error('employeeId is required');
    if (confirmed !== true) {
      throw new Error('attestation must be explicitly confirmed (confirmed=true)');
    }
    const sig = normString(signature);
    if (!sig) throw new Error('signature is required');
    const iso = toIsoDate(date);
    if (!iso) throw new Error('date is required (ISO date)');
    const year = asYear(iso);

    // The module is append-only — duplicate attestations are appended;
    // the year-window helper picks the latest one. We still log both
    // events for auditability.
    const openDecls = this._openForEmployee(empId).map((d) => d.id);
    const row = Object.freeze({
      attestationId: this._idFactory('ATT'),
      employeeId: empId,
      year,
      confirmed: true,
      signature: sig,
      date: iso,
      openDeclarationIds: openDecls,
      recordedAt: this._now().toISOString(),
    });
    this._attestations.push(row);

    this._appendEvent(EVENT_TYPES.ATTESTATION_RECORDED, {
      attestationId: row.attestationId,
      employeeId: empId,
      year,
      openDeclarations: openDecls.length,
    });

    return cloneJson(row);
  }

  /**
   * List open (ongoing, non-closed) declarations for an employee.
   */
  listOpenDeclarations({ employeeId } = {}) {
    const empId = normString(employeeId);
    if (!empId) throw new Error('employeeId is required');
    return this._openForEmployee(empId).map((d) => this._snapshot(d));
  }

  _openForEmployee(empId) {
    const out = [];
    for (const d of this._declarations.values()) {
      if (d.employeeId !== empId) continue;
      if (d.status === DECLARATION_STATUS.CLOSED) continue;
      if (d.ongoing === false) continue;
      out.push(d);
    }
    return out;
  }

  /**
   * Check whether a business decision could be tainted by a declared
   * interest. Returns { warning, matches[] }.
   *
   *   decisionId      — opaque id of the decision being checked
   *   decisionMaker   — employeeId of the person making the call
   *   relatedParties  — array of counterparty identifiers (vendor name,
   *                     candidate name, project id, etc.) to test against
   */
  checkDecision({ decisionId, decisionMaker, relatedParties } = {}) {
    const decId = normString(decisionId);
    if (!decId) throw new Error('decisionId is required');
    const maker = normString(decisionMaker);
    if (!maker) throw new Error('decisionMaker is required');
    const parties = normArray(relatedParties).map((p) => normString(p));

    const openDecls = this._openForEmployee(maker);
    const matches = [];
    for (const d of openDecls) {
      const relLower = d.relatedParty.toLowerCase();
      for (const p of parties) {
        if (!p) continue;
        const pLower = p.toLowerCase();
        if (relLower === pLower ||
            relLower.includes(pLower) ||
            pLower.includes(relLower)) {
          matches.push({
            declarationId: d.id,
            type: d.type,
            typeHe: d.typeHe,
            severity: d.severity,
            relatedParty: d.relatedParty,
            matchedParty: p,
          });
          break;
        }
      }
    }

    const warning = matches.length > 0;
    const result = Object.freeze({
      decisionId: decId,
      decisionMaker: maker,
      warning,
      matches: Object.freeze(matches.map((m) => Object.freeze(m))),
      messageHe: warning
        ? `אזהרה: נמצאו ${matches.length} ניגוד(י) עניינים פעילים`
        : 'לא נמצאו ניגודי עניינים פעילים',
      messageEn: warning
        ? `WARNING: ${matches.length} active conflict(s) of interest detected`
        : 'No active conflicts of interest found',
    });

    this._appendEvent(
      warning ? EVENT_TYPES.DECISION_WARNED : EVENT_TYPES.DECISION_CHECKED,
      {
        decisionId: decId,
        employeeId: maker,
        warning,
        matchCount: matches.length,
        declarationIds: matches.map((m) => m.declarationId),
      }
    );

    return result;
  }

  /**
   * Record a recusal event. Append-only — recusals are never deleted.
   */
  recuseFrom({ decisionId, employeeId, reason } = {}) {
    const decId = normString(decisionId);
    if (!decId) throw new Error('decisionId is required');
    const empId = normString(employeeId);
    if (!empId) throw new Error('employeeId is required');
    const rsn = normString(reason);
    if (!rsn) throw new Error('reason is required');

    const record = Object.freeze({
      recusalId: this._idFactory('REC'),
      decisionId: decId,
      employeeId: empId,
      reason: rsn,
      recordedAt: this._now().toISOString(),
    });
    this._recusals.push(record);

    // Link back to any active declarations for this employee for
    // easier traceability.
    for (const d of this._openForEmployee(empId)) {
      d.recusalDecisionIds.push(decId);
    }

    this._appendEvent(EVENT_TYPES.RECUSAL_RECORDED, {
      recusalId: record.recusalId,
      decisionId: decId,
      employeeId: empId,
    });

    return cloneJson(record);
  }

  /**
   * Walk the approval chain for a declaration. The caller supplies the
   * approvers array in order; the engine enforces that it matches (or
   * exceeds) the requiredApprovers list for the current severity. Every
   * approver entry becomes an immutable row in the approvals log.
   */
  approvalChain({ declarationId, approvers } = {}) {
    const decl = this._mustGet(declarationId);
    if (decl.status === DECLARATION_STATUS.CLOSED) {
      throw new Error(`declaration "${declarationId}" is closed — cannot approve`);
    }
    const list = normArray(approvers);
    if (list.length === 0) throw new Error('approvers array is required');

    const required = decl.requiredApprovers;
    const needed = required.length;
    if (list.length < needed) {
      this._appendEvent(EVENT_TYPES.DECLARATION_ESCALATED, {
        declarationId: decl.id,
        employeeId: decl.employeeId,
        severity: decl.severity,
        provided: list.map((a) => a.role || null),
        required,
        reason: 'insufficient-approvers',
      });
      throw new Error(
        `severity "${decl.severity}" requires approvers: ${required.join(
          ', '
        )}; got ${list.length}`
      );
    }

    // Validate that every required role appears in the supplied array.
    for (let i = 0; i < required.length; i++) {
      const req = required[i];
      const entry = list[i];
      if (!entry || typeof entry !== 'object') {
        throw new Error(`approver at position ${i} must be an object`);
      }
      if (!entry.role || entry.role !== req) {
        throw new Error(
          `approver at position ${i} must have role "${req}" (got "${entry.role || 'none'}")`
        );
      }
      if (!entry.name || !normString(entry.name)) {
        throw new Error(`approver "${req}" requires a name`);
      }
    }

    const nowIso = this._now().toISOString();
    const chain = list.map((a, idx) => ({
      step: idx + 1,
      role: a.role,
      name: normString(a.name),
      decision: a.decision || 'approved',
      notes: normString(a.notes, ''),
      at: toIsoDate(a.at) || nowIso,
    }));

    // Append new entries (do not overwrite historic ones).
    for (const row of chain) decl.approvals.push(row);
    decl.status = DECLARATION_STATUS.APPROVED;
    decl.statusHe = DECLARATION_STATUS_HE[DECLARATION_STATUS.APPROVED];
    decl.updatedAt = nowIso;

    this._appendEvent(EVENT_TYPES.DECLARATION_APPROVED, {
      declarationId: decl.id,
      employeeId: decl.employeeId,
      severity: decl.severity,
      approvers: chain.map((c) => c.role),
    });

    return this._snapshot(decl);
  }

  /**
   * Register a mitigation plan. One of the MITIGATION values is required
   * in plan.option. The plan is appended to the declaration's log.
   */
  mitigationPlan({ declarationId, plan, approver } = {}) {
    const decl = this._mustGet(declarationId);
    if (decl.status === DECLARATION_STATUS.CLOSED) {
      throw new Error(`declaration "${declarationId}" is closed — cannot mitigate`);
    }
    if (!plan || typeof plan !== 'object') {
      throw new Error('plan object is required');
    }
    const option = normString(plan.option);
    if (!option || !Object.values(MITIGATION).includes(option)) {
      throw new Error(`unknown mitigation option "${option}"`);
    }
    const appv = normString(approver);
    if (!appv) throw new Error('approver is required');

    const nowIso = this._now().toISOString();
    const row = {
      mitigationId: this._idFactory('MIT'),
      option,
      optionHe: MITIGATION_HE_CANONICAL[option],
      description: normString(plan.description, ''),
      effectiveFrom: toIsoDate(plan.effectiveFrom) || nowIso,
      reviewAt: toIsoDate(plan.reviewAt) || null,
      approver: appv,
      recordedAt: nowIso,
    };
    decl.mitigations.push(row);
    decl.status = DECLARATION_STATUS.MITIGATED;
    decl.statusHe = DECLARATION_STATUS_HE[DECLARATION_STATUS.MITIGATED];
    decl.updatedAt = nowIso;

    this._appendEvent(EVENT_TYPES.DECLARATION_MITIGATED, {
      declarationId: decl.id,
      employeeId: decl.employeeId,
      option,
      approver: appv,
    });

    return this._snapshot(decl);
  }

  /**
   * Close a declaration. NEVER hard-deletes the row.
   */
  closure({ declarationId, reason, date } = {}) {
    const decl = this._mustGet(declarationId);
    if (decl.status === DECLARATION_STATUS.CLOSED) {
      throw new Error(`declaration "${declarationId}" already closed`);
    }
    const rsn = normString(reason);
    if (!rsn) throw new Error('reason is required');
    const iso = toIsoDate(date) || this._now().toISOString();

    decl.status = DECLARATION_STATUS.CLOSED;
    decl.statusHe = DECLARATION_STATUS_HE[DECLARATION_STATUS.CLOSED];
    decl.ongoing = false;
    decl.closure = {
      reason: rsn,
      date: iso,
      closedAt: this._now().toISOString(),
    };
    decl.updatedAt = this._now().toISOString();

    this._appendEvent(EVENT_TYPES.DECLARATION_CLOSED, {
      declarationId: decl.id,
      employeeId: decl.employeeId,
      reason: rsn,
      date: iso,
    });

    return this._snapshot(decl);
  }

  // ── department + cross checks ────────────────────────────────────────

  /**
   * Roll-up of every declaration whose employee belongs to a given department.
   * Relies on the employee directory plugged in via setEmployeeDirectory().
   */
  listByDepartment(department) {
    const dept = normString(department);
    if (!dept) throw new Error('department is required');
    const out = [];
    for (const d of this._declarations.values()) {
      const emp = this._employeeDirectory.get(d.employeeId);
      const empDept = emp && emp.department ? String(emp.department) : null;
      if (empDept === dept) out.push(this._snapshot(d));
    }
    return out;
  }

  /**
   * Generate a board-level report covering a period. The report is
   * anonymised: employee identifiers are replaced by deterministic
   * pseudonyms of the form EMP-xxxxx, unless opts.anonymize is false.
   *
   * @param {Object} period  { year } | { year, quarter } | { from, to }
   * @param {Object} [opts]  { anonymize: boolean }
   */
  boardReporting(period, opts = {}) {
    const { from, to, label } = periodStartEnd(period);
    const anonymize = opts.anonymize !== false;
    const includeIds = opts.includeIds === true;

    const inWindow = (iso) => {
      if (!iso) return false;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
      return true;
    };

    // Bucket counters
    const byType = {};
    const bySeverity = {};
    const byStatus = {};
    const byDepartment = {};
    for (const t of Object.values(INTEREST_TYPE)) byType[t] = 0;
    for (const s of Object.values(SEVERITY)) bySeverity[s] = 0;
    for (const s of Object.values(DECLARATION_STATUS)) byStatus[s] = 0;

    const declarationsInWindow = [];
    const pseudonymFor = (empId) => {
      if (!anonymize) return empId;
      const h = sha256Hex('emp-salt|' + empId).slice(0, 10);
      return `EMP-${h}`;
    };

    for (const d of this._declarations.values()) {
      if (!inWindow(d.createdAt)) continue;
      byType[d.type] = (byType[d.type] || 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      const emp = this._employeeDirectory.get(d.employeeId);
      const dept = emp && emp.department ? String(emp.department) : 'unknown';
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      declarationsInWindow.push({
        id: d.id,
        employee: pseudonymFor(d.employeeId),
        type: d.type,
        typeHe: d.typeHe,
        severity: d.severity,
        severityHe: d.severityHe,
        status: d.status,
        relatedParty: d.relatedParty,
        startDate: d.startDate,
        ongoing: d.ongoing,
        department: dept,
        rawEmployeeId: includeIds ? d.employeeId : undefined,
      });
    }

    const attestationsInWindow = this._attestations.filter((a) =>
      inWindow(a.recordedAt)
    );
    const recusalsInWindow = this._recusals.filter((r) => inWindow(r.recordedAt));

    const totalDeclarations = declarationsInWindow.length;
    const criticals = bySeverity[SEVERITY.CRITICAL];
    const highs = bySeverity[SEVERITY.HIGH];

    const hebrew =
      `‫דו"ח ניגודי עניינים — תקופה ${label}\n` +
      `‫סה"כ הצהרות: ${totalDeclarations}\n` +
      `‫חמורות (קריטי): ${criticals}\n` +
      `‫גבוהות: ${highs}\n` +
      `‫הצהרות חובה שנתיות: ${attestationsInWindow.length}\n` +
      `‫מקרי הימנעות: ${recusalsInWindow.length}\n` +
      `‫לפי סוג אינטרס:\n` +
      Object.entries(byType)
        .filter(([, n]) => n > 0)
        .map(([k, v]) => `  • ${INTEREST_TYPE_HE[k]}: ${v}`)
        .join('\n') +
      `\n‫כלל: "לא מוחקים רק משדרגים ומגדלים"`;

    const english =
      `Conflict of Interest Report — period ${label}\n` +
      `Total declarations: ${totalDeclarations}\n` +
      `Critical: ${criticals}\n` +
      `High: ${highs}\n` +
      `Annual attestations filed: ${attestationsInWindow.length}\n` +
      `Recusal events: ${recusalsInWindow.length}\n` +
      `By interest type:\n` +
      Object.entries(byType)
        .filter(([, n]) => n > 0)
        .map(([k, v]) => `  * ${INTEREST_TYPE_EN[k]}: ${v}`)
        .join('\n') +
      `\nInvariant: never delete — only upgrade and grow.`;

    const report = {
      period: { from, to, label },
      anonymized: anonymize,
      totals: {
        declarations: totalDeclarations,
        attestations: attestationsInWindow.length,
        recusals: recusalsInWindow.length,
      },
      byType,
      bySeverity,
      byStatus,
      byDepartment,
      declarations: declarationsInWindow,
      languages: ['he', 'en'],
      direction: { he: 'rtl', en: 'ltr' },
      hebrew,
      english,
    };
    const seal = sha256Hex(stableStringify(report));
    report.sha256 = seal;
    Object.freeze(report.totals);
    Object.freeze(report.byType);
    Object.freeze(report.bySeverity);
    Object.freeze(report.byStatus);
    Object.freeze(report.byDepartment);

    this._appendEvent(EVENT_TYPES.BOARD_REPORT_GENERATED, {
      period: label,
      totalDeclarations,
      criticals,
      highs,
      anonymized: anonymize,
      sha256: seal,
    });

    return Object.freeze(report);
  }

  /**
   * Cross-check all open declarations against a procurement vendor.
   * Returns { flagged, matches[] } — every employee whose open interest
   * touches this vendor is listed.
   */
  crossCheckWithProcurement(vendorId) {
    const vid = normString(vendorId);
    if (!vid) throw new Error('vendorId is required');

    // Resolve vendor name from directory if available.
    const vendor = this._vendorDirectory.get(vid) || null;
    const vendorName = vendor && vendor.name ? String(vendor.name) : vid;
    const needles = [vid, vendorName]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (vendor && vendor.aliases) {
      for (const a of normArray(vendor.aliases)) {
        needles.push(String(a).toLowerCase());
      }
    }

    const matches = [];
    for (const d of this._declarations.values()) {
      if (d.status === DECLARATION_STATUS.CLOSED) continue;
      if (d.ongoing === false) continue;
      const haystack = d.relatedParty.toLowerCase();
      const hit = needles.some(
        (n) => n && (haystack === n || haystack.includes(n) || n.includes(haystack))
      );
      if (!hit) continue;
      matches.push({
        declarationId: d.id,
        employeeId: d.employeeId,
        type: d.type,
        typeHe: d.typeHe,
        severity: d.severity,
        relatedParty: d.relatedParty,
      });
    }

    const result = Object.freeze({
      vendorId: vid,
      vendorName,
      flagged: matches.length > 0,
      matches: Object.freeze(matches.map((m) => Object.freeze(m))),
      messageHe: matches.length
        ? `נמצאו ${matches.length} ניגוד(י) עניינים מול ספק ${vendorName}`
        : 'לא נמצאו ניגודי עניינים מול הספק',
      messageEn: matches.length
        ? `${matches.length} conflict(s) detected for vendor ${vendorName}`
        : 'No conflicts detected for vendor',
    });

    this._appendEvent(EVENT_TYPES.PROCUREMENT_CROSSCHECK, {
      vendorId: vid,
      vendorName,
      flagged: result.flagged,
      matchCount: matches.length,
    });

    return result;
  }

  /**
   * Cross-check a candidate about to be hired against all open familial /
   * personal-relationship declarations.
   */
  crossCheckWithHR(candidateId) {
    const cid = normString(candidateId);
    if (!cid) throw new Error('candidateId is required');
    const candidate = this._candidateDirectory.get(cid) || null;
    const candidateName =
      candidate && candidate.name ? String(candidate.name) : cid;

    const needles = [cid, candidateName]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (candidate && candidate.aliases) {
      for (const a of normArray(candidate.aliases)) {
        needles.push(String(a).toLowerCase());
      }
    }

    const matches = [];
    const scopedTypes = new Set([
      INTEREST_TYPE.FAMILIAL,
      INTEREST_TYPE.PERSONAL_RELATIONSHIP,
      INTEREST_TYPE.EMPLOYMENT,
    ]);
    for (const d of this._declarations.values()) {
      if (d.status === DECLARATION_STATUS.CLOSED) continue;
      if (d.ongoing === false) continue;
      if (!scopedTypes.has(d.type)) continue;
      const haystack = d.relatedParty.toLowerCase();
      const hit = needles.some(
        (n) => n && (haystack === n || haystack.includes(n) || n.includes(haystack))
      );
      if (!hit) continue;
      matches.push({
        declarationId: d.id,
        employeeId: d.employeeId,
        type: d.type,
        typeHe: d.typeHe,
        severity: d.severity,
        relatedParty: d.relatedParty,
      });
    }

    const result = Object.freeze({
      candidateId: cid,
      candidateName,
      flagged: matches.length > 0,
      matches: Object.freeze(matches.map((m) => Object.freeze(m))),
      messageHe: matches.length
        ? `נמצאו ${matches.length} התאמות משפחתיות/אישיות למועמד ${candidateName}`
        : 'לא נמצאו קשרים מצהירים למועמד',
      messageEn: matches.length
        ? `${matches.length} familial / personal link(s) for candidate ${candidateName}`
        : 'No declared familial or personal links for candidate',
    });

    this._appendEvent(EVENT_TYPES.HR_CROSSCHECK, {
      candidateId: cid,
      candidateName,
      flagged: result.flagged,
      matchCount: matches.length,
    });

    return result;
  }

  // ── helpers / accessors ──────────────────────────────────────────────

  /** Read-only snapshot for a declaration (external callers). */
  get(declarationId) {
    const decl = this._declarations.get(String(declarationId));
    return decl ? this._snapshot(decl) : null;
  }

  /** Flat list of all declarations — useful for tests and admin tooling. */
  listAll() {
    return Array.from(this._declarations.values()).map((d) => this._snapshot(d));
  }

  /** Attestations filtered by year and/or employee. */
  listAttestations(filter = {}) {
    let out = this._attestations.slice();
    if (filter.employeeId) {
      out = out.filter((a) => a.employeeId === filter.employeeId);
    }
    if (filter.year != null) {
      out = out.filter((a) => a.year === Number(filter.year));
    }
    return out.map(cloneJson);
  }

  /** Recusal history. */
  listRecusals(filter = {}) {
    let out = this._recusals.slice();
    if (filter.employeeId) {
      out = out.filter((r) => r.employeeId === filter.employeeId);
    }
    if (filter.decisionId) {
      out = out.filter((r) => r.decisionId === filter.decisionId);
    }
    return out.map(cloneJson);
  }

  _mustGet(declarationId) {
    const id = normString(declarationId);
    if (!id) throw new Error('declarationId is required');
    const decl = this._declarations.get(id);
    if (!decl) throw new Error(`no declaration "${id}"`);
    return decl;
  }

  _snapshot(decl) {
    // Deep-clone + freeze so callers cannot mutate engine state.
    const snap = cloneJson(decl);
    if (snap.approvals) Object.freeze(snap.approvals);
    if (snap.mitigations) Object.freeze(snap.mitigations);
    if (snap.materialChanges) Object.freeze(snap.materialChanges);
    if (snap.recusalDecisionIds) Object.freeze(snap.recusalDecisionIds);
    if (snap.requiredApprovers) Object.freeze(snap.requiredApprovers);
    return Object.freeze(snap);
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  ConflictOfInterest,
  INTEREST_TYPE,
  INTEREST_TYPE_HE,
  INTEREST_TYPE_EN,
  DECLARATION_STATUS,
  DECLARATION_STATUS_HE,
  SEVERITY,
  SEVERITY_HE,
  MITIGATION,
  MITIGATION_HE: MITIGATION_HE_CANONICAL,
  EVENT_TYPES,
  classifySeverity,
  requiredApproversFor,
};
