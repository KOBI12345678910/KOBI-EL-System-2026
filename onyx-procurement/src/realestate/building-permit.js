/**
 * Building Permit Tracker — building-permit.js
 * ════════════════════════════════════════════════════════════════════
 * Agent Y-055 — Techno-Kol Uzi (construction) ERP — written 2026-04-11
 *
 * Israeli building permit (היתרי בנייה) life-cycle tracker for the
 * Techno-Kol Uzi group. Handles the full ועדה מקומית / ועדה מחוזית
 * workflow with bilingual Hebrew-English state machine, document
 * checklists, committee hearings, neighbor objections (התנגדויות),
 * amendments during construction, municipal fees, stale-application
 * alerting, and TAMA 38 seismic-strengthening tracking.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — every "cancel" / "withdraw"
 * operation is an append-only status transition with an audit trail.
 * No record is ever removed. Stage history is immutable.
 *
 * Israeli-law anchors (non-exhaustive):
 *   • חוק התכנון והבנייה תשכ"ה-1965          — Planning & Building Law
 *   • תקנות התכנון והבנייה (רישוי בנייה)      — Permit Regulations 2016
 *   • תמ"א 38                                 — National Master Plan 38
 *   • תמ"א 38/1                              — strengthening + addition
 *   • תמ"א 38/2                              — demolish + rebuild
 *   • חוק מבנים מסוכנים                       — Dangerous Buildings
 *   • תקן ישראלי 413                         — Israeli Standard 413 (seismic)
 *
 * Stage machine (Israeli permit process):
 *
 *   קליטה (intake)
 *     ↓
 *   בדיקה הנדסית (engineering review)
 *     ↓
 *   איתור (locating — surveyor + zoning)
 *     ↓
 *   דיון (hearing — ועדה מקומית / מחוזית)
 *     ↓
 *   היתר (permit issued — תשלום אגרות)
 *     ↓
 *   פתיחה (open construction — תחילת עבודות)
 *     ↓
 *   סיום (completion — תעודת גמר / טופס 4)
 *
 * Public API
 * ──────────
 *   createApplication(input)          → applicationId
 *   recordStatusChange(id, s, n, d)   → { ok, from, to, at }
 *   documentChecklist(type)           → [{ key, he, en, required }]
 *   committeeHearings(id)             → hearings sub-API
 *   objections(id)                    → objections sub-API
 *   amendments(id)                    → amendments sub-API
 *   permitFees(input)                 → { total, breakdown, currency }
 *   daysInStage(id)                   → { currentStage, days, history[] }
 *   alertStaleApplication(id)         → { stale, reason, since }
 *   tamaTracker(propertyId)           → TAMA-38 sub-API
 *   listApplications(filter?)         → permit[]
 *   getApplication(id)                → permit
 *   resetStore()                      → void (test helper, audit-logged)
 *
 * Zero external dependencies. Pure Node.js, in-memory by default, with
 * optional persistence adapter at construction time.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const STAGES = Object.freeze({
  INTAKE:       'intake',        // קליטה
  ENG_REVIEW:   'eng-review',    // בדיקה הנדסית
  LOCATING:     'locating',      // איתור
  HEARING:      'hearing',       // דיון בוועדה
  PERMIT:       'permit',        // היתר (issued)
  OPEN:         'open',          // פתיחה (under construction)
  COMPLETION:   'completion',    // סיום
  // Non-linear transitions (append-only, never deleted):
  REJECTED:     'rejected',      // נדחה
  WITHDRAWN:    'withdrawn',     // נמשך ע"י מבקש
  ON_HOLD:      'on-hold',       // בהמתנה
});

const STAGE_LABELS = Object.freeze({
  [STAGES.INTAKE]:     { he: 'קליטה',           en: 'Intake' },
  [STAGES.ENG_REVIEW]: { he: 'בדיקה הנדסית',    en: 'Engineering Review' },
  [STAGES.LOCATING]:   { he: 'איתור',           en: 'Locating / Zoning' },
  [STAGES.HEARING]:    { he: 'דיון בוועדה',     en: 'Committee Hearing' },
  [STAGES.PERMIT]:     { he: 'היתר',            en: 'Permit Issued' },
  [STAGES.OPEN]:       { he: 'פתיחה',           en: 'Construction Open' },
  [STAGES.COMPLETION]: { he: 'סיום',            en: 'Completion (Form 4)' },
  [STAGES.REJECTED]:   { he: 'נדחה',            en: 'Rejected' },
  [STAGES.WITHDRAWN]:  { he: 'נמשך',            en: 'Withdrawn' },
  [STAGES.ON_HOLD]:    { he: 'בהמתנה',          en: 'On Hold' },
});

// Linear forward progression. Code also permits:
//   • any active stage → ON_HOLD / WITHDRAWN / REJECTED
//   • ON_HOLD → original active stage  (resume)
const FORWARD_ORDER = Object.freeze([
  STAGES.INTAKE,
  STAGES.ENG_REVIEW,
  STAGES.LOCATING,
  STAGES.HEARING,
  STAGES.PERMIT,
  STAGES.OPEN,
  STAGES.COMPLETION,
]);

const TERMINAL_STAGES = Object.freeze(new Set([
  STAGES.COMPLETION,
  STAGES.REJECTED,
  STAGES.WITHDRAWN,
]));

const APPLICATION_TYPE = Object.freeze({
  NEW_CONSTRUCTION: 'new-construction', // בנייה חדשה
  ADDITION:         'addition',         // תוספת
  RENOVATION:       'renovation',       // שיפוץ
  CHANGE_OF_USE:    'change-of-use',    // שינוי ייעוד
  DEMOLITION:       'demolition',       // הריסה
  TAMA_38:          'tama-38',          // תמ"א 38
});

const TYPE_LABELS = Object.freeze({
  [APPLICATION_TYPE.NEW_CONSTRUCTION]: { he: 'בנייה חדשה',  en: 'New Construction' },
  [APPLICATION_TYPE.ADDITION]:         { he: 'תוספת',        en: 'Addition' },
  [APPLICATION_TYPE.RENOVATION]:       { he: 'שיפוץ',        en: 'Renovation' },
  [APPLICATION_TYPE.CHANGE_OF_USE]:    { he: 'שינוי ייעוד',  en: 'Change of Use' },
  [APPLICATION_TYPE.DEMOLITION]:       { he: 'הריסה',        en: 'Demolition' },
  [APPLICATION_TYPE.TAMA_38]:          { he: 'תמ"א 38',      en: 'TAMA 38' },
});

// Committee types — ועדות
const COMMITTEE = Object.freeze({
  LOCAL:    'local',    // ועדה מקומית
  DISTRICT: 'district', // ועדה מחוזית
  APPEAL:   'appeal',   // ועדת ערר
});

const COMMITTEE_LABELS = Object.freeze({
  [COMMITTEE.LOCAL]:    { he: 'ועדה מקומית',  en: 'Local Committee' },
  [COMMITTEE.DISTRICT]: { he: 'ועדה מחוזית',  en: 'District Committee' },
  [COMMITTEE.APPEAL]:   { he: 'ועדת ערר',     en: 'Appeal Committee' },
});

// TAMA 38 sub-types
const TAMA_TYPE = Object.freeze({
  TAMA_38_1: 'tama-38-1', // חיזוק + תוספת קומות
  TAMA_38_2: 'tama-38-2', // הריסה ובנייה מחדש
});

const TAMA_LABELS = Object.freeze({
  [TAMA_TYPE.TAMA_38_1]: {
    he: 'תמ"א 38/1 — חיזוק ותוספת',
    en: 'TAMA 38/1 — Strengthening + Addition',
  },
  [TAMA_TYPE.TAMA_38_2]: {
    he: 'תמ"א 38/2 — הריסה ובנייה מחדש',
    en: 'TAMA 38/2 — Demolish + Rebuild',
  },
});

// Stale-application thresholds (days per stage). Based on typical
// Israeli ועדה מקומית SLAs; real values vary per municipality.
const STALE_DAYS = Object.freeze({
  [STAGES.INTAKE]:     14,
  [STAGES.ENG_REVIEW]: 45,
  [STAGES.LOCATING]:   30,
  [STAGES.HEARING]:    90,
  [STAGES.PERMIT]:     30,
  [STAGES.OPEN]:       730, // 2 years typical construction
  [STAGES.COMPLETION]: 30,
  [STAGES.ON_HOLD]:    180,
});

// Document checklist per application type.
// Each entry: { key, he, en, required, appliesTo? }
const DOCUMENT_CATALOG = Object.freeze([
  { key: 'plans',         he: 'תוכניות אדריכליות',    en: 'Architectural Plans',         required: true },
  { key: 'calc',          he: 'חישובים סטטיים',        en: 'Structural Calculations',     required: true },
  { key: 'lawyer',        he: 'אישור עורך דין',        en: 'Lawyer Confirmation',         required: true },
  { key: 'contractor',    he: 'רישיון קבלן רשום',      en: 'Contractor License',          required: true },
  { key: 'owner-consent', he: 'הסכמת בעלים',           en: 'Owner Consent',               required: true },
  { key: 'nefesh',        he: 'חישוב שטחים',           en: 'Area Calculation',            required: true },
  { key: 'survey',        he: 'מפה מצבית מדידה',       en: 'Surveyor Map',                required: true },
  { key: 'env-impact',    he: 'הערכת השפעה סביבתית',   en: 'Environmental Impact',        required: false },
  { key: 'shelter',       he: 'מקלט / ממ"ד',           en: 'Shelter / MAMAD',             required: false },
  { key: 'parking',       he: 'פתרון חניה',            en: 'Parking Plan',                required: false },
  { key: 'tama-cert',     he: 'אישור תמ"א',            en: 'TAMA Certification',          required: false },
  { key: 'seismic-eng',   he: 'הצהרת מהנדס רעידות',    en: 'Seismic Engineer Declaration', required: false },
  { key: 'demo-plan',     he: 'תוכנית הריסה',          en: 'Demolition Plan',             required: false },
  { key: 'use-justify',   he: 'הצדקת שינוי ייעוד',     en: 'Use-Change Justification',    required: false },
  { key: 'neighbors',     he: 'הודעה לשכנים',          en: 'Neighbor Notification',       required: true },
  { key: 'fire',          he: 'אישור כבאות',           en: 'Fire Department Approval',    required: true },
  { key: 'access',        he: 'אישור חברת חשמל',       en: 'Electric Utility Approval',   required: true },
  { key: 'water',         he: 'אישור תאגיד מים',       en: 'Water Utility Approval',      required: true },
]);

// Per-type required document keys (overrides `required` flag above).
const REQUIRED_BY_TYPE = Object.freeze({
  [APPLICATION_TYPE.NEW_CONSTRUCTION]: [
    'plans', 'calc', 'lawyer', 'contractor', 'owner-consent',
    'nefesh', 'survey', 'shelter', 'parking', 'neighbors',
    'fire', 'access', 'water',
  ],
  [APPLICATION_TYPE.ADDITION]: [
    'plans', 'calc', 'lawyer', 'contractor', 'owner-consent',
    'nefesh', 'survey', 'neighbors', 'fire',
  ],
  [APPLICATION_TYPE.RENOVATION]: [
    'plans', 'lawyer', 'contractor', 'owner-consent', 'neighbors',
  ],
  [APPLICATION_TYPE.CHANGE_OF_USE]: [
    'plans', 'lawyer', 'owner-consent', 'use-justify',
    'neighbors', 'fire', 'parking',
  ],
  [APPLICATION_TYPE.DEMOLITION]: [
    'demo-plan', 'lawyer', 'contractor', 'owner-consent',
    'survey', 'neighbors',
  ],
  [APPLICATION_TYPE.TAMA_38]: [
    'plans', 'calc', 'lawyer', 'contractor', 'owner-consent',
    'nefesh', 'survey', 'tama-cert', 'seismic-eng',
    'neighbors', 'fire', 'access', 'water',
  ],
});

// Municipal fee tariffs (ILS/m²). These are reference values for the
// 2026 fiscal year; real tariffs vary per עירייה and per תקנות אגרות.
// Source anchor: תקנות התכנון והבנייה (אגרות) התשמ"ד-1984, as updated.
const MUNICIPAL_TARIFFS = Object.freeze({
  'tel-aviv':   { he: 'תל אביב-יפו',   perSqm: 72, minFee: 2400 },
  'jerusalem':  { he: 'ירושלים',        perSqm: 58, minFee: 1900 },
  'haifa':      { he: 'חיפה',           perSqm: 54, minFee: 1800 },
  'rishon':     { he: 'ראשון לציון',    perSqm: 48, minFee: 1600 },
  'ashdod':     { he: 'אשדוד',          perSqm: 44, minFee: 1500 },
  'petach':     { he: 'פתח תקווה',      perSqm: 50, minFee: 1700 },
  'netanya':    { he: 'נתניה',          perSqm: 46, minFee: 1550 },
  'beersheva':  { he: 'באר שבע',        perSqm: 38, minFee: 1300 },
  'holon':      { he: 'חולון',          perSqm: 47, minFee: 1600 },
  'bnei-brak':  { he: 'בני ברק',        perSqm: 42, minFee: 1400 },
  'default':    { he: 'ברירת מחדל',     perSqm: 40, minFee: 1400 },
});

// Type multiplier on base per-m² fee.
const TYPE_MULTIPLIER = Object.freeze({
  [APPLICATION_TYPE.NEW_CONSTRUCTION]: 1.00,
  [APPLICATION_TYPE.ADDITION]:         0.80,
  [APPLICATION_TYPE.RENOVATION]:       0.40,
  [APPLICATION_TYPE.CHANGE_OF_USE]:    0.60,
  [APPLICATION_TYPE.DEMOLITION]:       0.30,
  [APPLICATION_TYPE.TAMA_38]:          0.50, // reduced to encourage strengthening
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function _now() {
  return new Date().toISOString();
}

function _toDate(v) {
  if (v == null) return new Date();
  if (v instanceof Date) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${v}`);
  return d;
}

function _diffDays(a, b) {
  const ms = Math.abs(_toDate(b).getTime() - _toDate(a).getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function _uid(prefix) {
  // Simple, deterministic-ish uid. Zero deps → no crypto.randomUUID
  // required (though available in Node ≥14.17). Stick to timestamp+ctr.
  _uid._ctr = (_uid._ctr || 0) + 1;
  return `${prefix}_${Date.now().toString(36)}${_uid._ctr.toString(36).padStart(3, '0')}`;
}

function _assertType(applicationType) {
  if (!Object.values(APPLICATION_TYPE).includes(applicationType)) {
    throw new Error(
      `Invalid applicationType "${applicationType}". Expected one of: ` +
      Object.values(APPLICATION_TYPE).join(', ')
    );
  }
}

function _assertStage(stage) {
  if (!Object.values(STAGES).includes(stage)) {
    throw new Error(
      `Invalid stage "${stage}". Expected one of: ` +
      Object.values(STAGES).join(', ')
    );
  }
}

/**
 * Verify a stage transition is legal. Forward progression is strict,
 * but ON_HOLD / WITHDRAWN / REJECTED may be entered from any active
 * stage. ON_HOLD may resume into the original active stage.
 */
function _canTransition(from, to) {
  if (from === to) return false;
  if (TERMINAL_STAGES.has(from)) return false; // never reopen
  if (to === STAGES.ON_HOLD) return !TERMINAL_STAGES.has(from);
  if (to === STAGES.WITHDRAWN || to === STAGES.REJECTED) {
    return !TERMINAL_STAGES.has(from);
  }
  if (from === STAGES.ON_HOLD) {
    // Resume allowed into any forward stage
    return FORWARD_ORDER.includes(to);
  }
  const fi = FORWARD_ORDER.indexOf(from);
  const ti = FORWARD_ORDER.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti === fi + 1; // strict single-step forward
}

// ═══════════════════════════════════════════════════════════════════════
// BuildingPermit — public class
// ═══════════════════════════════════════════════════════════════════════

class BuildingPermit {
  /**
   * @param {object} [opts]
   * @param {object} [opts.store] Optional persistence adapter with
   *   get/set/list/remove methods. When absent, an in-memory store is
   *   used. The adapter is never required to implement delete — the
   *   module respects the "never delete" rule.
   * @param {(level:string,msg:string,ctx?:object)=>void} [opts.logger]
   */
  constructor(opts = {}) {
    this._logger = opts.logger || (() => {});
    this._store = opts.store || this._createMemoryStore();
    this._audit = [];
  }

  // ─────────────────────────────────────────────────────────────────
  //  Internal memory store — simple Map-based fallback
  // ─────────────────────────────────────────────────────────────────
  _createMemoryStore() {
    const m = new Map();
    return {
      get: (id) => m.get(id),
      set: (id, value) => m.set(id, value),
      has: (id) => m.has(id),
      list: () => Array.from(m.values()),
      clear: () => m.clear(),
    };
  }

  _log(level, msg, ctx) {
    try { this._logger(level, msg, ctx || {}); } catch (_e) { /* swallow */ }
  }

  _audit_push(action, id, details) {
    this._audit.push({
      at: _now(),
      action: String(action),
      permitId: id == null ? null : String(id),
      details: details == null ? {} : { ...details },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  createApplication
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new building-permit application. Starts at STAGES.INTAKE.
   *
   * @param {object} input
   * @param {string} input.propertyId
   * @param {object} input.applicant             — { id?, name, phone?, email? }
   * @param {object} input.architect             — { name, license? }
   * @param {object} input.engineer              — { name, license? }
   * @param {string} input.applicationType       — see APPLICATION_TYPE
   * @param {string} input.description
   * @param {number} input.sqmProposed           — floor area in m²
   * @param {Array}  [input.documents]           — [{ key, filename, uploadedAt? }]
   * @param {string} [input.municipality]        — key into MUNICIPAL_TARIFFS
   * @param {string} [input.committee]           — 'local' | 'district'
   * @returns {string} applicationId
   */
  createApplication(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('createApplication: input is required');
    }
    const {
      propertyId,
      applicant,
      architect,
      engineer,
      applicationType,
      description,
      sqmProposed,
      documents = [],
      municipality = 'default',
      committee = COMMITTEE.LOCAL,
    } = input;

    if (!propertyId) throw new Error('createApplication: propertyId is required');
    if (!applicant || !applicant.name) {
      throw new Error('createApplication: applicant.name is required');
    }
    if (!architect || !architect.name) {
      throw new Error('createApplication: architect.name is required');
    }
    if (!engineer || !engineer.name) {
      throw new Error('createApplication: engineer.name is required');
    }
    _assertType(applicationType);
    if (typeof description !== 'string' || description.length === 0) {
      throw new Error('createApplication: description is required');
    }
    if (typeof sqmProposed !== 'number' || !(sqmProposed > 0)) {
      throw new Error('createApplication: sqmProposed must be > 0');
    }
    if (!Array.isArray(documents)) {
      throw new Error('createApplication: documents must be an array');
    }
    if (!Object.values(COMMITTEE).includes(committee)) {
      throw new Error(`createApplication: invalid committee "${committee}"`);
    }

    const id = _uid('permit');
    const now = _now();

    const record = {
      id,
      propertyId: String(propertyId),
      applicant: { ...applicant },
      architect: { ...architect },
      engineer:  { ...engineer },
      applicationType,
      description: String(description),
      sqmProposed: Number(sqmProposed),
      municipality: String(municipality),
      committee,
      createdAt: now,
      updatedAt: now,

      currentStage: STAGES.INTAKE,
      stageHistory: [
        { stage: STAGES.INTAKE, at: now, by: 'system', notes: 'Application created' },
      ],

      documents: documents.map((d) => ({
        key: String(d.key),
        filename: d.filename || null,
        uploadedAt: d.uploadedAt || now,
        verified: !!d.verified,
      })),

      hearings:   [],
      objections: [],
      amendments: [],

      fees: null,
      labels: {
        he: {
          type:  (TYPE_LABELS[applicationType] || {}).he  || applicationType,
          stage: (STAGE_LABELS[STAGES.INTAKE] || {}).he,
        },
        en: {
          type:  (TYPE_LABELS[applicationType] || {}).en  || applicationType,
          stage: (STAGE_LABELS[STAGES.INTAKE] || {}).en,
        },
      },
      tama: null, // populated via tamaTracker() for TAMA applications
    };

    this._store.set(id, record);
    this._audit_push('createApplication', id, {
      propertyId: record.propertyId,
      applicationType,
      municipality,
    });
    this._log('info', 'permit.create', { id, propertyId, applicationType });

    return id;
  }

  // ─────────────────────────────────────────────────────────────────
  //  recordStatusChange
  // ─────────────────────────────────────────────────────────────────

  /**
   * Append-only stage transition. Never removes a prior entry.
   *
   * @param {string} permitId
   * @param {string} newStatus
   * @param {string} [notes]
   * @param {string|Date} [date]
   * @returns {{ok:boolean, from:string, to:string, at:string}}
   */
  recordStatusChange(permitId, newStatus, notes, date) {
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`recordStatusChange: permit "${permitId}" not found`);

    _assertStage(newStatus);
    const from = permit.currentStage;
    if (!_canTransition(from, newStatus)) {
      throw new Error(
        `recordStatusChange: illegal transition "${from}" → "${newStatus}"`
      );
    }

    const at = _toDate(date).toISOString();
    permit.currentStage = newStatus;
    permit.updatedAt = at;
    permit.stageHistory.push({
      stage: newStatus,
      at,
      by: 'user',
      notes: notes || '',
      from,
    });
    permit.labels.he.stage = (STAGE_LABELS[newStatus] || {}).he || newStatus;
    permit.labels.en.stage = (STAGE_LABELS[newStatus] || {}).en || newStatus;

    this._store.set(permitId, permit);
    this._audit_push('recordStatusChange', permitId, { from, to: newStatus, notes });
    this._log('info', 'permit.status', { permitId, from, to: newStatus });
    return { ok: true, from, to: newStatus, at };
  }

  // ─────────────────────────────────────────────────────────────────
  //  documentChecklist
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the document checklist for an application type.
   * @param {string} applicationType
   * @returns {Array<{key:string, he:string, en:string, required:boolean}>}
   */
  documentChecklist(applicationType) {
    _assertType(applicationType);
    const requiredSet = new Set(REQUIRED_BY_TYPE[applicationType] || []);
    return DOCUMENT_CATALOG.map((d) => ({
      key: d.key,
      he: d.he,
      en: d.en,
      required: requiredSet.has(d.key),
    }));
  }

  /**
   * Check missing required docs for a given permit.
   * @param {string} permitId
   * @returns {{missing:Array, provided:Array, completionPct:number}}
   */
  documentCompletion(permitId) {
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`documentCompletion: permit "${permitId}" not found`);
    const checklist = this.documentChecklist(permit.applicationType);
    const requiredKeys = checklist.filter((d) => d.required).map((d) => d.key);
    const providedKeys = new Set(permit.documents.map((d) => d.key));
    const missing  = requiredKeys.filter((k) => !providedKeys.has(k));
    const provided = requiredKeys.filter((k) => providedKeys.has(k));
    const pct = requiredKeys.length === 0 ? 100 :
      Math.round((provided.length / requiredKeys.length) * 100);
    return { missing, provided, completionPct: pct };
  }

  // ─────────────────────────────────────────────────────────────────
  //  committeeHearings — scheduling & results
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the committee-hearings sub-API for a given permit.
   *
   * Sub-API:
   *   schedule({committee, date, agenda?})     → hearingId
   *   recordResult(hearingId, result, notes?)  → void
   *   list()                                   → hearing[]
   *   next()                                   → hearing | null
   */
  committeeHearings(permitId) {
    const self = this;
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`committeeHearings: permit "${permitId}" not found`);

    return {
      schedule({ committee, date, agenda } = {}) {
        if (!Object.values(COMMITTEE).includes(committee)) {
          throw new Error(`committeeHearings.schedule: invalid committee "${committee}"`);
        }
        if (!date) throw new Error('committeeHearings.schedule: date is required');
        const hearingId = _uid('hearing');
        const record = {
          id: hearingId,
          committee,
          date: _toDate(date).toISOString(),
          agenda: agenda || '',
          result: null,         // 'approved' | 'rejected' | 'deferred' | 'conditional'
          resultNotes: null,
          resultAt: null,
          committeeLabel: { ...(COMMITTEE_LABELS[committee] || {}) },
          createdAt: _now(),
        };
        permit.hearings.push(record);
        permit.updatedAt = _now();
        self._store.set(permitId, permit);
        self._audit_push('hearing.schedule', permitId, { hearingId, committee });
        return hearingId;
      },
      recordResult(hearingId, result, notes) {
        const allowed = ['approved', 'rejected', 'deferred', 'conditional'];
        if (!allowed.includes(result)) {
          throw new Error(
            `committeeHearings.recordResult: result must be one of ${allowed.join(', ')}`
          );
        }
        const h = permit.hearings.find((x) => x.id === hearingId);
        if (!h) throw new Error(`committeeHearings.recordResult: hearing "${hearingId}" not found`);
        h.result = result;
        h.resultNotes = notes || '';
        h.resultAt = _now();
        permit.updatedAt = h.resultAt;
        self._store.set(permitId, permit);
        self._audit_push('hearing.result', permitId, { hearingId, result });
      },
      list() {
        return permit.hearings.slice();
      },
      next() {
        const pending = permit.hearings
          .filter((h) => h.result == null)
          .sort((a, b) => a.date.localeCompare(b.date));
        return pending[0] || null;
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  objections — neighbor objections (התנגדויות)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the objections sub-API.
   *
   * Sub-API:
   *   file({objector, grounds, date?})    → objectionId
   *   resolve(id, outcome, notes?)        → void
   *   list()                              → objection[]
   *   countOpen()                         → number
   */
  objections(permitId) {
    const self = this;
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`objections: permit "${permitId}" not found`);

    return {
      file({ objector, grounds, date } = {}) {
        if (!objector || !objector.name) {
          throw new Error('objections.file: objector.name is required');
        }
        if (!grounds) throw new Error('objections.file: grounds is required');
        const id = _uid('objection');
        permit.objections.push({
          id,
          objector: { ...objector },
          grounds: String(grounds),
          filedAt: _toDate(date).toISOString(),
          status: 'open',  // 'open' | 'upheld' | 'dismissed' | 'withdrawn'
          outcome: null,
          outcomeNotes: null,
          resolvedAt: null,
        });
        permit.updatedAt = _now();
        self._store.set(permitId, permit);
        self._audit_push('objection.file', permitId, { objectionId: id });
        return id;
      },
      resolve(id, outcome, notes) {
        const allowed = ['upheld', 'dismissed', 'withdrawn'];
        if (!allowed.includes(outcome)) {
          throw new Error(
            `objections.resolve: outcome must be one of ${allowed.join(', ')}`
          );
        }
        const o = permit.objections.find((x) => x.id === id);
        if (!o) throw new Error(`objections.resolve: objection "${id}" not found`);
        o.status = outcome === 'withdrawn' ? 'withdrawn' : outcome;
        o.outcome = outcome;
        o.outcomeNotes = notes || '';
        o.resolvedAt = _now();
        permit.updatedAt = o.resolvedAt;
        self._store.set(permitId, permit);
        self._audit_push('objection.resolve', permitId, { objectionId: id, outcome });
      },
      list() {
        return permit.objections.slice();
      },
      countOpen() {
        return permit.objections.filter((o) => o.status === 'open').length;
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  amendments — permit changes during construction (שינוי היתר)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the amendments sub-API.
   *
   * Sub-API:
   *   propose({description, sqmDelta?, reason})    → amendmentId
   *   approve(id, approvedBy?)                     → void
   *   reject(id, reason)                           → void
   *   list()                                       → amendment[]
   */
  amendments(permitId) {
    const self = this;
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`amendments: permit "${permitId}" not found`);

    return {
      propose({ description, sqmDelta = 0, reason } = {}) {
        if (!description) throw new Error('amendments.propose: description is required');
        if (!reason) throw new Error('amendments.propose: reason is required');
        const id = _uid('amend');
        permit.amendments.push({
          id,
          description: String(description),
          sqmDelta: Number(sqmDelta) || 0,
          reason: String(reason),
          status: 'pending',       // 'pending' | 'approved' | 'rejected'
          proposedAt: _now(),
          decidedAt: null,
          decidedBy: null,
          decisionNotes: null,
        });
        permit.updatedAt = _now();
        self._store.set(permitId, permit);
        self._audit_push('amend.propose', permitId, { amendmentId: id });
        return id;
      },
      approve(id, approvedBy) {
        const a = permit.amendments.find((x) => x.id === id);
        if (!a) throw new Error(`amendments.approve: amendment "${id}" not found`);
        if (a.status !== 'pending') {
          throw new Error(`amendments.approve: amendment "${id}" is already ${a.status}`);
        }
        a.status = 'approved';
        a.decidedAt = _now();
        a.decidedBy = approvedBy || 'system';
        // Apply sqm delta
        if (a.sqmDelta) {
          permit.sqmProposed = Math.max(0, permit.sqmProposed + a.sqmDelta);
        }
        permit.updatedAt = a.decidedAt;
        self._store.set(permitId, permit);
        self._audit_push('amend.approve', permitId, {
          amendmentId: id, sqmDelta: a.sqmDelta,
        });
      },
      reject(id, reason) {
        if (!reason) throw new Error('amendments.reject: reason is required');
        const a = permit.amendments.find((x) => x.id === id);
        if (!a) throw new Error(`amendments.reject: amendment "${id}" not found`);
        if (a.status !== 'pending') {
          throw new Error(`amendments.reject: amendment "${id}" is already ${a.status}`);
        }
        a.status = 'rejected';
        a.decidedAt = _now();
        a.decisionNotes = reason;
        permit.updatedAt = a.decidedAt;
        self._store.set(permitId, permit);
        self._audit_push('amend.reject', permitId, { amendmentId: id });
      },
      list() {
        return permit.amendments.slice();
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  permitFees — municipal fee calculator (אגרות בנייה)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Calculate municipal permit fees.
   *
   * Formula:
   *   base         = tariff.perSqm × sqm × typeMultiplier
   *   infrastructure = 0.10 × base   (אגרות פיתוח)
   *   archive      = 450 ILS fixed    (ארכיון תכניות)
   *   rawTotal     = base + infrastructure + archive
   *   total        = max(rawTotal, tariff.minFee)
   *
   * @param {object} input
   * @param {string} input.type          — APPLICATION_TYPE value
   * @param {number} input.sqm           — m²
   * @param {string} [input.municipality]— MUNICIPAL_TARIFFS key
   * @returns {{
   *   total:number, currency:string,
   *   breakdown:{ base:number, infrastructure:number, archive:number, minFloorApplied:boolean },
   *   tariff:object
   * }}
   */
  permitFees(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('permitFees: input is required');
    }
    const { type, sqm, municipality = 'default' } = input;
    _assertType(type);
    if (typeof sqm !== 'number' || !(sqm > 0)) {
      throw new Error('permitFees: sqm must be > 0');
    }
    const tariff = MUNICIPAL_TARIFFS[municipality] || MUNICIPAL_TARIFFS.default;
    const mult = TYPE_MULTIPLIER[type];
    const base = tariff.perSqm * sqm * mult;
    const infrastructure = Math.round(base * 0.10);
    const archive = 450;
    const rawTotal = Math.round(base) + infrastructure + archive;
    const minFloorApplied = rawTotal < tariff.minFee;
    const total = Math.max(rawTotal, tariff.minFee);

    return {
      total,
      currency: 'ILS',
      breakdown: {
        base: Math.round(base),
        infrastructure,
        archive,
        minFloorApplied,
      },
      tariff: {
        key: MUNICIPAL_TARIFFS[municipality] ? municipality : 'default',
        perSqm: tariff.perSqm,
        minFee: tariff.minFee,
        he: tariff.he,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  daysInStage — duration tracking
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the number of days the permit has been in its current
   * stage, plus a full stage-duration history.
   */
  daysInStage(permitId) {
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`daysInStage: permit "${permitId}" not found`);

    const now = new Date();
    const history = [];
    const h = permit.stageHistory;
    for (let i = 0; i < h.length; i++) {
      const start = _toDate(h[i].at);
      const end = i + 1 < h.length ? _toDate(h[i + 1].at) : now;
      history.push({
        stage: h[i].stage,
        from: start.toISOString(),
        to: i + 1 < h.length ? end.toISOString() : null,
        days: _diffDays(start, end),
      });
    }
    const last = permit.stageHistory[permit.stageHistory.length - 1];
    return {
      currentStage: permit.currentStage,
      stageLabel: {
        he: (STAGE_LABELS[permit.currentStage] || {}).he || permit.currentStage,
        en: (STAGE_LABELS[permit.currentStage] || {}).en || permit.currentStage,
      },
      days: _diffDays(last.at, now),
      since: last.at,
      history,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  alertStaleApplication — flag stalled permits
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns an alert object if the permit is stuck in its current
   * stage beyond the configured threshold.
   *
   * @returns {{stale:boolean, reason:string, since:string, days:number,
   *           threshold:number, stage:string}}
   */
  alertStaleApplication(permitId) {
    const permit = this._store.get(permitId);
    if (!permit) throw new Error(`alertStaleApplication: permit "${permitId}" not found`);

    if (TERMINAL_STAGES.has(permit.currentStage)) {
      return {
        stale: false,
        reason: 'terminal-stage',
        stage: permit.currentStage,
        since: permit.updatedAt,
        days: 0,
        threshold: 0,
      };
    }

    const info = this.daysInStage(permitId);
    const threshold = STALE_DAYS[permit.currentStage] || 60;
    const stale = info.days >= threshold;

    const reason = stale
      ? `Stage "${permit.currentStage}" exceeded ${threshold}-day threshold`
      : 'within-sla';

    return {
      stale,
      reason,
      stage: permit.currentStage,
      since: info.since,
      days: info.days,
      threshold,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  tamaTracker — TAMA 38 seismic-strengthening
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the TAMA 38 tracker sub-API for a property.
   *
   * Sub-API:
   *   register({permitId, tamaType, unitsBefore, unitsAfter, ...}) → tamaRecord
   *   recordMilestone(permitId, milestone, date?)                  → void
   *   get(permitId)                                                → tamaRecord
   *   list()                                                       → tamaRecord[]
   *
   * TAMA 38 milestones:
   *   seismic-assessment  — חוות דעת מהנדס רעידות
   *   resident-agreement  — הסכמת דיירים (80% rule)
   *   committee-approval  — אישור ועדה מקומית
   *   building-permit     — היתר בנייה
   *   strengthening       — חיזוק מבנה (38/1 only)
   *   demolition          — הריסה (38/2 only)
   *   construction        — בנייה
   *   form-4              — טופס 4 / תעודת גמר
   */
  tamaTracker(propertyId) {
    const self = this;
    if (!propertyId) throw new Error('tamaTracker: propertyId is required');

    // Filter all permits on this property
    const applicationsFor = () =>
      self._store.list().filter((p) => p.propertyId === String(propertyId));

    return {
      register(input = {}) {
        const {
          permitId,
          tamaType,
          unitsBefore = 0,
          unitsAfter = 0,
          seismicStandard = '413',
        } = input;
        const permit = self._store.get(permitId);
        if (!permit) throw new Error(`tamaTracker.register: permit "${permitId}" not found`);
        if (permit.propertyId !== String(propertyId)) {
          throw new Error(
            `tamaTracker.register: permit "${permitId}" does not belong to property "${propertyId}"`
          );
        }
        if (permit.applicationType !== APPLICATION_TYPE.TAMA_38) {
          throw new Error(
            `tamaTracker.register: permit type must be "tama-38", got "${permit.applicationType}"`
          );
        }
        if (!Object.values(TAMA_TYPE).includes(tamaType)) {
          throw new Error(
            `tamaTracker.register: tamaType must be one of ${Object.values(TAMA_TYPE).join(', ')}`
          );
        }
        permit.tama = {
          tamaType,
          label: { ...(TAMA_LABELS[tamaType] || {}) },
          unitsBefore: Number(unitsBefore) || 0,
          unitsAfter:  Number(unitsAfter)  || 0,
          seismicStandard: String(seismicStandard),
          registeredAt: _now(),
          milestones: [],
        };
        permit.updatedAt = _now();
        self._store.set(permitId, permit);
        self._audit_push('tama.register', permitId, { tamaType });
        return permit.tama;
      },
      recordMilestone(permitId, milestone, date) {
        const allowed = [
          'seismic-assessment', 'resident-agreement', 'committee-approval',
          'building-permit', 'strengthening', 'demolition', 'construction', 'form-4',
        ];
        if (!allowed.includes(milestone)) {
          throw new Error(
            `tamaTracker.recordMilestone: milestone must be one of ${allowed.join(', ')}`
          );
        }
        const permit = self._store.get(permitId);
        if (!permit) throw new Error(`tamaTracker.recordMilestone: permit "${permitId}" not found`);
        if (!permit.tama) {
          throw new Error(`tamaTracker.recordMilestone: permit "${permitId}" not TAMA-registered`);
        }
        // 38/1 vs 38/2 exclusivity
        if (milestone === 'strengthening' && permit.tama.tamaType !== TAMA_TYPE.TAMA_38_1) {
          throw new Error('tamaTracker: "strengthening" only valid for TAMA 38/1');
        }
        if (milestone === 'demolition' && permit.tama.tamaType !== TAMA_TYPE.TAMA_38_2) {
          throw new Error('tamaTracker: "demolition" only valid for TAMA 38/2');
        }
        permit.tama.milestones.push({
          milestone,
          at: _toDate(date).toISOString(),
        });
        permit.updatedAt = _now();
        self._store.set(permitId, permit);
        self._audit_push('tama.milestone', permitId, { milestone });
      },
      get(permitId) {
        const permit = self._store.get(permitId);
        if (!permit) throw new Error(`tamaTracker.get: permit "${permitId}" not found`);
        return permit.tama;
      },
      list() {
        return applicationsFor()
          .filter((p) => p.applicationType === APPLICATION_TYPE.TAMA_38)
          .map((p) => ({ permitId: p.id, tama: p.tama }));
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────────────────────────

  getApplication(permitId) {
    const permit = this._store.get(permitId);
    if (!permit) return null;
    return JSON.parse(JSON.stringify(permit)); // deep-copy for safety
  }

  listApplications(filter = {}) {
    const all = this._store.list();
    return all.filter((p) => {
      if (filter.propertyId && p.propertyId !== String(filter.propertyId)) return false;
      if (filter.applicationType && p.applicationType !== filter.applicationType) return false;
      if (filter.currentStage && p.currentStage !== filter.currentStage) return false;
      if (filter.municipality && p.municipality !== filter.municipality) return false;
      return true;
    }).map((p) => JSON.parse(JSON.stringify(p)));
  }

  getAuditTrail() {
    return this._audit.slice();
  }

  /**
   * Test helper. Logs the reset into the audit trail (never silently
   * wipes anything) — callers are expected to keep this out of prod.
   */
  resetStore() {
    this._audit_push('resetStore', null, { size: this._store.list().length });
    if (typeof this._store.clear === 'function') this._store.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  BuildingPermit,
  STAGES,
  STAGE_LABELS,
  APPLICATION_TYPE,
  TYPE_LABELS,
  COMMITTEE,
  COMMITTEE_LABELS,
  TAMA_TYPE,
  TAMA_LABELS,
  STALE_DAYS,
  FORWARD_ORDER,
  MUNICIPAL_TARIFFS,
  TYPE_MULTIPLIER,
  REQUIRED_BY_TYPE,
  DOCUMENT_CATALOG,
};
